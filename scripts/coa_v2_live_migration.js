/**
 * ============================================================
 * COA v2 — LIVE MIGRATION (7-digit L4)
 * ============================================================
 *
 * Writes to database. RUN dry-run first: node scripts/coa_v2_dry_run.js
 *
 * Renames all 8-digit legacy L4 codes (e.g. 13010001) to 7-digit
 * codes (e.g. 1301001) across these collections:
 *   clients.account_code
 *   suppliers.account_code
 *   boxes.account_code
 *   journal_entries.lines[].account_code
 *   tickets.account_code           (if present)
 *   visas.account_code             (if present)
 *   package_bookings.account_code  (if present)
 *   refunds.account_code           (if present)
 *   vouchers.account_code          (if present)
 *
 * Never touches: amounts, dates, tenant_id, ids. Rename-only.
 * Trial-balance parity MUST be preserved (verified per-tenant).
 *
 * USAGE:
 *   MONGO_URL=... DB_NAME=... CONFIRM=YES node scripts/coa_v2_live_migration.js
 *
 * Optional:
 *   TENANT_ID=<uuid>   -> limit to one tenant (safer for staged rollout)
 * ============================================================
 */
const { MongoClient } = require('mongodb')

if (!process.env.MONGO_URL) { console.error('❌ MONGO_URL is required'); process.exit(1) }
if (!process.env.DB_NAME)   { console.error('❌ DB_NAME is required');   process.exit(1) }
if (process.env.CONFIRM !== 'YES') {
  console.error('❌ Refusing to run. Set CONFIRM=YES to proceed after backup verified.')
  process.exit(1)
}
const MONGO_URL = process.env.MONGO_URL
const DB_NAME   = process.env.DB_NAME
const TENANT_FILTER = process.env.TENANT_ID || null

function convert8to7(code) {
  const s = String(code)
  if (!/^\d{8}$/.test(s)) return null
  const parent = s.slice(0, 4)
  const seq = parseInt(s.slice(4), 10)
  if (seq < 1 || seq > 999) return null
  return parent + String(seq).padStart(3, '0')
}

async function tbForTenant(db, tenantId) {
  const rows = await db.collection('journal_entries').aggregate([
    { $match: { tenant_id: tenantId } },
    { $unwind: '$lines' },
    { $group: { _id: { cur: { $ifNull: ['$currency', 'USD'] } },
                D: { $sum: { $ifNull: ['$lines.debit', 0] } },
                C: { $sum: { $ifNull: ['$lines.credit', 0] } } } },
  ]).toArray()
  const tb = {}
  for (const r of rows) tb[r._id.cur] = { D: +r.D.toFixed(2), C: +r.C.toFixed(2), diff: +(r.D - r.C).toFixed(2) }
  return tb
}

function tbEqual(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const A = a[k] || { D: 0, C: 0, diff: 0 }
    const B = b[k] || { D: 0, C: 0, diff: 0 }
    if (Math.abs(A.D - B.D) > 0.01 || Math.abs(A.C - B.C) > 0.01) return false
  }
  return true
}

async function migrateTenant(db, tenant) {
  const t = tenant.id
  const collectionsToRename = ['clients', 'suppliers', 'boxes']
  const legacyCodes = new Set()
  for (const col of collectionsToRename) {
    const docs = await db.collection(col).find({ tenant_id: t, account_code: { $regex: /^\d{8}$/ } })
      .project({ account_code: 1 }).toArray()
    for (const d of docs) legacyCodes.add(d.account_code)
  }
  if (legacyCodes.size === 0) return { skipped: true, updated: {} }

  const mapping = new Map()
  for (const oldC of legacyCodes) {
    const nc = convert8to7(oldC)
    if (!nc) throw new Error(`Cannot convert ${oldC} for tenant ${t}`)
    mapping.set(oldC, nc)
  }

  // Snapshot TB before
  const tbBefore = await tbForTenant(db, t)

  const updated = { clients: 0, suppliers: 0, boxes: 0, journal_entries: 0,
                    tickets: 0, visas: 0, package_bookings: 0, refunds: 0, vouchers: 0 }

  // 1. Rename in clients/suppliers/boxes
  for (const [oldC, newC] of mapping) {
    for (const col of collectionsToRename) {
      const r = await db.collection(col).updateMany(
        { tenant_id: t, account_code: oldC },
        { $set: { account_code: newC } })
      updated[col] += r.modifiedCount
    }
    // 2. Rename in journal_entries.lines[].account_code
    const rJE = await db.collection('journal_entries').updateMany(
      { tenant_id: t, 'lines.account_code': oldC },
      { $set: { 'lines.$[elem].account_code': newC } },
      { arrayFilters: [{ 'elem.account_code': oldC }] }
    )
    updated.journal_entries += rJE.modifiedCount
    // 3. Rename in other transactional collections that carry account_code
    for (const col of ['tickets', 'visas', 'package_bookings', 'refunds', 'vouchers']) {
      const rr = await db.collection(col).updateMany(
        { tenant_id: t, account_code: oldC },
        { $set: { account_code: newC } })
      updated[col] += rr.modifiedCount
    }
  }

  // Snapshot TB after — must match exactly (only rename, amounts untouched)
  const tbAfter = await tbForTenant(db, t)
  if (!tbEqual(tbBefore, tbAfter)) {
    throw new Error(`TB PARITY BROKEN for tenant ${t} (${tenant.slug}) — aborting. Before=${JSON.stringify(tbBefore)} After=${JSON.stringify(tbAfter)}`)
  }

  return { skipped: false, mappings: mapping.size, updated, tbBefore, tbAfter }
}

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db(DB_NAME)

  console.log('\n============================================================')
  console.log(`CoA v2 LIVE MIGRATION  |  DB=${DB_NAME}  |  ${new Date().toISOString()}`)
  console.log('============================================================\n')

  const tenants = await db.collection('tenants').find(TENANT_FILTER ? { id: TENANT_FILTER } : {}).toArray()
  console.log(`Tenants to process: ${tenants.length}\n`)

  const totals = { skipped: 0, migrated: 0, mappings: 0,
                   clients: 0, suppliers: 0, boxes: 0, journal_entries: 0,
                   tickets: 0, visas: 0, package_bookings: 0, refunds: 0, vouchers: 0 }

  for (const tenant of tenants) {
    try {
      const r = await migrateTenant(db, tenant)
      if (r.skipped) { totals.skipped++; continue }
      totals.migrated++
      totals.mappings += r.mappings
      for (const k of Object.keys(r.updated)) totals[k] += r.updated[k]
      console.log(`✅ ${tenant.slug.padEnd(24)} maps=${String(r.mappings).padStart(3)}  clients=${r.updated.clients}  suppliers=${r.updated.suppliers}  boxes=${r.updated.boxes}  JE=${r.updated.journal_entries}  tickets=${r.updated.tickets}  visas=${r.updated.visas}`)
    } catch (e) {
      console.error(`❌ ${tenant.slug} FAILED: ${e.message}`)
      throw e   // stop on first failure
    }
  }

  console.log('\n============================================================')
  console.log('GLOBAL TOTALS')
  console.log('============================================================')
  console.log(`Tenants migrated:              ${totals.migrated}`)
  console.log(`Tenants skipped (nothing to do): ${totals.skipped}`)
  console.log(`Unique code mappings:          ${totals.mappings}`)
  console.log(`Records renamed by collection:`)
  console.log(`  clients:          ${totals.clients}`)
  console.log(`  suppliers:        ${totals.suppliers}`)
  console.log(`  boxes:            ${totals.boxes}`)
  console.log(`  journal_entries:  ${totals.journal_entries}`)
  console.log(`  tickets:          ${totals.tickets}`)
  console.log(`  visas:            ${totals.visas}`)
  console.log(`  package_bookings: ${totals.package_bookings}`)
  console.log(`  refunds:          ${totals.refunds}`)
  console.log(`  vouchers:         ${totals.vouchers}`)
  console.log('============================================================')
  console.log('✅ Migration complete. Trial-balance parity verified per tenant.')
  console.log('============================================================\n')

  await client.close()
}

main().catch(err => { console.error('\n❌ Migration aborted:', err.message); process.exit(1) })
