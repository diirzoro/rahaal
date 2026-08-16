/**
 * ============================================================
 * Missing Tenants Recovery — DRY-RUN (READ-ONLY)
 * ============================================================
 *
 * PURPOSE
 *   Scan a SOURCE MongoDB database (typically legacy `targetmediadb`)
 *   for Rahaal tenants that never made it into the canonical `rahaal`
 *   database. Report EXACT counts of every related record per tenant
 *   BEFORE anything is written anywhere.
 *
 *   This script writes NOTHING. It is safe to run on production.
 *
 * TARGETED TENANTS (by name / slug fragments — case-insensitive)
 *   - "زاد المشاعر"      (aka "زاد المشاعر للسفريات")
 *   - "سفير المملكة"
 *   - "الثراء"
 *
 * OUTPUT
 *   For each candidate tenant match, prints:
 *     - Source tenant metadata (id, slug, name, owner_email, created_at)
 *     - Record counts across ALL related collections
 *     - ID collision check vs destination `rahaal` DB (if reachable)
 *     - Aggregate totals
 *
 * USAGE (on Live Server via SSH):
 *   SOURCE_MONGO_URL="mongodb://127.0.0.1:27017"  SOURCE_DB_NAME="targetmediadb" \
 *   DEST_MONGO_URL="mongodb://127.0.0.1:27017"    DEST_DB_NAME="rahaal" \
 *     node /var/www/rahaal/scripts/tenant_import_dry_run.js
 *
 *   To skip collision check (source-only scan), omit DEST_* vars.
 * ============================================================
 */
const { MongoClient } = require('mongodb')

if (!process.env.SOURCE_MONGO_URL) { console.error('❌ SOURCE_MONGO_URL is required'); process.exit(1) }
if (!process.env.SOURCE_DB_NAME)   { console.error('❌ SOURCE_DB_NAME is required');   process.exit(1) }
const SOURCE_MONGO_URL = process.env.SOURCE_MONGO_URL
const SOURCE_DB_NAME   = process.env.SOURCE_DB_NAME
const DEST_MONGO_URL   = process.env.DEST_MONGO_URL || null
const DEST_DB_NAME     = process.env.DEST_DB_NAME || null

// Search terms — matched case-insensitively against multiple candidate fields
const SEARCH_TERMS = [
  { key: 'zad_almashaer', label: 'زاد المشاعر',   patterns: ['زاد المشاعر', 'زاد', 'المشاعر', 'zad', 'mashaer', 'mashair'] },
  { key: 'safir_mamlaka', label: 'سفير المملكة',  patterns: ['سفير المملكة', 'سفير', 'المملكة', 'safir', 'mamlaka', 'mamlakah'] },
  { key: 'althraa',       label: 'الثراء',        patterns: ['الثراء', 'ثراء', 'althra', 'thraa', 'althraa'] },
]

// Candidate fields on tenant document that might carry the name/slug
const TENANT_NAME_FIELDS = ['name', 'arabic_name', 'office_name', 'title', 'slug', 'display_name', 'company_name']

// Related collections we expect (matches Rahaal schema; script skips absent ones)
const RELATED_COLLECTIONS = [
  'users', 'tenant_settings', 'pats', 'sessions',
  'clients', 'suppliers', 'boxes', 'accounts', 'journal_entries',
  'tickets', 'visas', 'services', 'service_types',
  'packages', 'package_components', 'package_transports', 'package_bookings',
  'vouchers', 'refunds', 'currency_exchanges',
  'cashout_requests', 'payout_methods',
  'visa_monitoring',
  'countries', 'announcements', 'subscription_plans',
]

function buildTenantQuery(patterns) {
  const or = []
  for (const field of TENANT_NAME_FIELDS) {
    for (const p of patterns) {
      or.push({ [field]: { $regex: p, $options: 'i' } })
    }
  }
  return { $or: or }
}

async function scanSource(sourceDb, term) {
  const q = buildTenantQuery(term.patterns)
  const tenants = await sourceDb.collection('tenants').find(q).toArray()
  return tenants
}

async function countRelated(sourceDb, tenantId) {
  const counts = {}
  const availableCollections = await sourceDb.listCollections({}, { nameOnly: true }).toArray()
  const availableNames = new Set(availableCollections.map(c => c.name))
  for (const col of RELATED_COLLECTIONS) {
    if (!availableNames.has(col)) { counts[col] = { present: false, count: 0 }; continue }
    try {
      const n = await sourceDb.collection(col).countDocuments({ tenant_id: tenantId })
      counts[col] = { present: true, count: n }
    } catch (e) {
      counts[col] = { present: true, count: 0, error: e.message }
    }
  }
  return counts
}

async function checkCollisions(destDb, tenant, counts) {
  const collisions = {}
  // 1. Tenant id / slug already in destination?
  const t1 = await destDb.collection('tenants').findOne({ id: tenant.id })
  const t2 = tenant.slug ? await destDb.collection('tenants').findOne({ slug: tenant.slug }) : null
  collisions.tenant_id_exists = !!t1
  collisions.tenant_slug_exists = !!t2
  // 2. User email uniqueness — spot-check emails from source
  if (counts.users?.present && counts.users.count > 0) {
    const emails = await destDb.collection('users').find(
      { tenant_id: tenant.id },
      { projection: { email: 1 } }
    ).limit(500).toArray()
    collisions.users_already_in_dest_by_tenant_id = emails.length
  }
  return collisions
}

async function main() {
  console.log('\n============================================================')
  console.log(`MISSING TENANTS RECOVERY — DRY-RUN  |  ${new Date().toISOString()}`)
  console.log(`SOURCE: ${SOURCE_MONGO_URL.replace(/\/\/[^@]*@/, '//<redacted>@')} / ${SOURCE_DB_NAME}`)
  console.log(`DEST:   ${DEST_MONGO_URL ? DEST_MONGO_URL.replace(/\/\/[^@]*@/, '//<redacted>@') + ' / ' + DEST_DB_NAME : 'NOT PROVIDED (collision check skipped)'}`)
  console.log('READ-ONLY: nothing will be written to either database.')
  console.log('============================================================\n')

  const srcClient = new MongoClient(SOURCE_MONGO_URL)
  await srcClient.connect()
  const sourceDb = srcClient.db(SOURCE_DB_NAME)

  // Basic sanity: does source have a `tenants` collection?
  const srcCols = (await sourceDb.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name)
  console.log(`Source DB has ${srcCols.length} collections. Has 'tenants'? ${srcCols.includes('tenants') ? 'YES ✅' : 'NO ❌'}`)
  if (!srcCols.includes('tenants')) {
    console.log('Available collections:', srcCols.join(', '))
    console.error(`\n❌ Source database "${SOURCE_DB_NAME}" has no 'tenants' collection. Cannot proceed.`)
    await srcClient.close()
    process.exit(2)
  }
  const srcTenantsTotal = await sourceDb.collection('tenants').countDocuments()
  console.log(`Total tenants in source: ${srcTenantsTotal}\n`)

  let destDb = null, destClient = null
  if (DEST_MONGO_URL && DEST_DB_NAME) {
    destClient = new MongoClient(DEST_MONGO_URL)
    await destClient.connect()
    destDb = destClient.db(DEST_DB_NAME)
    const destTotal = await destDb.collection('tenants').countDocuments()
    console.log(`Total tenants in destination (${DEST_DB_NAME}): ${destTotal}\n`)
  }

  const grand = { candidates: 0, matched: 0, total_records: 0 }

  for (const term of SEARCH_TERMS) {
    console.log('════════════════════════════════════════════════════════════')
    console.log(`SEARCH: ${term.label}   (key=${term.key})`)
    console.log(`Patterns: ${term.patterns.join(' | ')}`)
    console.log('════════════════════════════════════════════════════════════')
    const matches = await scanSource(sourceDb, term)
    grand.candidates++
    if (matches.length === 0) {
      console.log('  ⚠️  NO MATCH found in source.\n')
      continue
    }
    console.log(`  Found ${matches.length} candidate tenant(s):\n`)
    for (const tenant of matches) {
      grand.matched++
      console.log(`  ── ${tenant.slug || '(no slug)'}   ${tenant.name || '(no name)'}`)
      console.log(`     id:         ${tenant.id}`)
      console.log(`     _id:        ${tenant._id}`)
      console.log(`     owner_email:${tenant.owner_email || '(unknown)'}`)
      console.log(`     status:     ${tenant.status || '(unknown)'}`)
      console.log(`     created_at: ${tenant.created_at || '(unknown)'}`)
      const counts = await countRelated(sourceDb, tenant.id)
      let sumRecords = 0
      const presentLines = []
      for (const col of RELATED_COLLECTIONS) {
        const info = counts[col]
        if (info.present && info.count > 0) {
          presentLines.push(`       ${col.padEnd(22)} ${String(info.count).padStart(6)}`)
          sumRecords += info.count
        }
      }
      grand.total_records += sumRecords
      console.log(`     Related records (only non-empty shown):`)
      presentLines.forEach(l => console.log(l))
      console.log(`     TOTAL related records for this tenant: ${sumRecords}`)

      if (destDb) {
        const coll = await checkCollisions(destDb, tenant, counts)
        console.log(`     Collision check vs destination:`)
        console.log(`       tenant.id already in ${DEST_DB_NAME}? ${coll.tenant_id_exists ? '🔴 YES' : '✅ no'}`)
        console.log(`       tenant.slug already in ${DEST_DB_NAME}? ${coll.tenant_slug_exists ? '🔴 YES' : '✅ no'}`)
        if (coll.users_already_in_dest_by_tenant_id) {
          console.log(`       users already sharing tenant_id in dest: ${coll.users_already_in_dest_by_tenant_id} 🟡`)
        }
      }
      console.log()
    }
  }

  console.log('============================================================')
  console.log('GRAND SUMMARY')
  console.log('============================================================')
  console.log(`Search terms processed:     ${grand.candidates}`)
  console.log(`Candidate tenants matched:  ${grand.matched}`)
  console.log(`Total related records:      ${grand.total_records}`)
  console.log('============================================================')
  if (grand.matched === 0) {
    console.log('⚠️  No candidate tenants found. Try widening the search patterns.')
    console.log('    Consider running: mongosh <SOURCE_MONGO_URL>/<SOURCE_DB_NAME>')
    console.log('    then:  db.tenants.find({},{name:1,slug:1,owner_email:1}).limit(50)')
  } else {
    console.log('✅ Dry-run complete. Review the counts and decide which tenants to merge.')
    console.log('   Next step (only after your explicit approval):')
    console.log('     node scripts/tenant_import_execute.js (to be written after review)')
  }
  console.log('============================================================\n')

  await srcClient.close()
  if (destClient) await destClient.close()
}

main().catch(err => { console.error('\n❌ Dry-run failed:', err.message); process.exit(1) })
