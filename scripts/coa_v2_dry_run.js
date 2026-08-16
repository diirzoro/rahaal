/**
 * ============================================================
 * Chart of Accounts — v2 (7-digit L4) DRY-RUN MIGRATION
 * ============================================================
 *
 * PURPOSE
 *   Analyze every tenant's current Chart of Accounts and report exactly
 *   what a 4-digit-sequence -> 3-digit-sequence migration would change,
 *   WITHOUT writing anything to the database.
 *
 * NEW SCHEMA (strict inheritance):
 *   L1 = 1 digit   (e.g. 1)
 *   L2 = 2 digits  (e.g. 11, 52)                       parent-L1 + pad1
 *   L3 = 4 digits  (e.g. 1201, 5201)                   parent-L2 + pad2
 *   L4 = 7 digits  (e.g. 1301001, 5201001) TERMINAL    parent-L3 + pad3
 *
 * OLD DATA (current Preview state after v3.10.0 migration):
 *   L4 accounts use 8-digit codes (parent + pad4).
 *   Example: 13010001, 13010002, 21010001, 12010001 ...
 *
 * WHAT THIS SCRIPT REPORTS
 *   For every tenant:
 *     1. Existing L4 accounts and their proposed new codes.
 *     2. Cascading references in clients / suppliers / boxes.
 *     3. Journal-entry lines that reference old codes.
 *     4. Trial-balance parity check (must remain identical after migration).
 *     5. Any collisions (two old codes that would map to the same new code).
 *
 * IT WRITES NOTHING. All operations are countDocuments / find / read.
 *
 * USAGE (on Live Server or Preview):
 *   MONGO_URL="mongodb://127.0.0.1:27017" DB_NAME="rahaal" \
 *     node scripts/coa_v2_dry_run.js
 * ============================================================
 */

const { MongoClient } = require('mongodb')

if (!process.env.MONGO_URL) { console.error('❌ MONGO_URL is required'); process.exit(1) }
if (!process.env.DB_NAME)   { console.error('❌ DB_NAME is required');   process.exit(1) }

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME
const TENANT_FILTER = process.env.TENANT_ID || null   // optional: limit to one tenant

// Helper: convert legacy 8-digit L4 code (e.g. 13010007) to new 7-digit (1301007)
function convert8to7(oldCode) {
  const s = String(oldCode)
  // Only convert if it looks like a legacy L4 with 8 digits and known L3 parent prefix (4 digits)
  if (!/^\d{8}$/.test(s)) return null
  const parent = s.slice(0, 4)          // e.g. 1301
  const seq4 = parseInt(s.slice(4), 10) // e.g. 0007
  if (seq4 > 999) return null           // impossible under new scheme (999 max)
  return parent + String(seq4).padStart(3, '0')
}

async function analyzeTenant(db, tenant) {
  const t = tenant.id
  const report = {
    tenant_id: t,
    tenant_slug: tenant.slug,
    tenant_name: tenant.name,
    accounts_to_rename: [],
    clients_affected: 0,
    suppliers_affected: 0,
    boxes_affected: 0,
    journal_lines_affected: 0,
    tickets_affected: 0,
    visas_affected: 0,
    package_bookings_affected: 0,
    refunds_affected: 0,
    vouchers_affected: 0,
    collisions: [],
    trial_balance_before: {},
    trial_balance_after_estimated: {},
    warnings: [],
  }

  // 1. Find all L4 codes needing migration.
  // v3.10.7 INSIGHT: In Rahaal, 8-digit L4 codes live in clients/suppliers/boxes
  // (as `account_code`), NOT in the `accounts` collection (which only holds L1-L3 groups).
  const clientDocs = await db.collection('clients').find({ tenant_id: t, account_code: { $regex: /^\d{8}$/ } })
    .project({ account_code: 1, name: 1 }).toArray()
  const supplierDocs = await db.collection('suppliers').find({ tenant_id: t, account_code: { $regex: /^\d{8}$/ } })
    .project({ account_code: 1, name: 1 }).toArray()
  const boxDocs = await db.collection('boxes').find({ tenant_id: t, account_code: { $regex: /^\d{8}$/ } })
    .project({ account_code: 1, name: 1 }).toArray()
  const legacyEntries = [
    ...clientDocs.map(d => ({ src: 'client',   code: d.account_code, name: d.name })),
    ...supplierDocs.map(d => ({ src: 'supplier', code: d.account_code, name: d.name })),
    ...boxDocs.map(d => ({ src: 'box',        code: d.account_code, name: d.name })),
  ]

  const mappings = new Map()   // oldCode -> newCode
  const newCodesSeen = new Map() // newCode -> {source, oldCode} (collision detection)

  for (const entry of legacyEntries) {
    if (mappings.has(entry.code)) continue // already mapped (duplicates across tables share the code)
    const newCode = convert8to7(entry.code)
    if (!newCode) {
      report.warnings.push(`${entry.src} "${entry.name}" code=${entry.code} cannot be converted`)
      continue
    }
    if (newCodesSeen.has(newCode)) {
      report.collisions.push({ new_code: newCode, old_a: newCodesSeen.get(newCode).code, old_b: entry.code })
      continue
    }
    newCodesSeen.set(newCode, entry)
    mappings.set(entry.code, newCode)
    report.accounts_to_rename.push({
      old_code: entry.code,
      new_code: newCode,
      name_ar: entry.name,
      type: entry.src,
    })
  }

  // 2. Count cascading references
  const oldCodes = Array.from(mappings.keys())
  if (oldCodes.length) {
    report.clients_affected = await db.collection('clients').countDocuments({ tenant_id: t, account_code: { $in: oldCodes } })
    report.suppliers_affected = await db.collection('suppliers').countDocuments({ tenant_id: t, account_code: { $in: oldCodes } })
    report.boxes_affected = await db.collection('boxes').countDocuments({ tenant_id: t, account_code: { $in: oldCodes } })
    report.journal_lines_affected = await db.collection('journal_entries').countDocuments({
      tenant_id: t,
      'lines.account_code': { $in: oldCodes },
    })
    report.tickets_affected = await db.collection('tickets').countDocuments({ tenant_id: t, account_code: { $in: oldCodes } })
    report.visas_affected = await db.collection('visas').countDocuments({ tenant_id: t, account_code: { $in: oldCodes } })
    report.package_bookings_affected = await db.collection('package_bookings').countDocuments({ tenant_id: t, account_code: { $in: oldCodes } })
    report.refunds_affected = await db.collection('refunds').countDocuments({ tenant_id: t, account_code: { $in: oldCodes } })
    report.vouchers_affected = await db.collection('vouchers').countDocuments({ tenant_id: t, account_code: { $in: oldCodes } })
  }

  // 3. Trial-Balance parity check (per currency, sums debit vs credit)
  const tbAgg = await db.collection('journal_entries').aggregate([
    { $match: { tenant_id: t } },
    { $unwind: '$lines' },
    { $group: {
        _id: { currency: { $ifNull: ['$currency', 'USD'] } },
        total_debit:  { $sum: { $ifNull: ['$lines.debit',  0] } },
        total_credit: { $sum: { $ifNull: ['$lines.credit', 0] } },
    } },
  ]).toArray()
  for (const row of tbAgg) {
    report.trial_balance_before[row._id.currency] = {
      debit: Number(row.total_debit.toFixed(2)),
      credit: Number(row.total_credit.toFixed(2)),
      diff: Number((row.total_debit - row.total_credit).toFixed(2)),
    }
  }
  // Since migration only RENAMES codes (does NOT change amounts), trial balance
  // MUST remain identical after migration. The estimated-after equals before.
  report.trial_balance_after_estimated = { ...report.trial_balance_before }

  return report
}

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db(DB_NAME)

  console.log('\n============================================================')
  console.log(`CoA v2 DRY-RUN  |  DB=${DB_NAME}  |  ${new Date().toISOString()}`)
  console.log(`Read-only analysis (nothing will be written)`)
  console.log('============================================================\n')

  const tenantsFilter = TENANT_FILTER ? { id: TENANT_FILTER } : {}
  const tenants = await db.collection('tenants').find(tenantsFilter).toArray()

  console.log(`Total tenants to analyze: ${tenants.length}\n`)

  const globalSummary = {
    tenants_analyzed: 0,
    tenants_needing_migration: 0,
    total_accounts_to_rename: 0,
    total_journal_lines: 0,
    total_cascading_records: 0,
    total_collisions: 0,
    tenants_with_tb_imbalance_before: 0,
  }

  for (const tenant of tenants) {
    const r = await analyzeTenant(db, tenant)
    globalSummary.tenants_analyzed++
    if (r.accounts_to_rename.length) globalSummary.tenants_needing_migration++
    globalSummary.total_accounts_to_rename += r.accounts_to_rename.length
    globalSummary.total_journal_lines += r.journal_lines_affected
    globalSummary.total_cascading_records +=
      r.clients_affected + r.suppliers_affected + r.boxes_affected +
      r.tickets_affected + r.visas_affected + r.package_bookings_affected +
      r.refunds_affected + r.vouchers_affected
    globalSummary.total_collisions += r.collisions.length

    // Trial-balance imbalance
    for (const cur of Object.keys(r.trial_balance_before)) {
      if (Math.abs(r.trial_balance_before[cur].diff) > 0.01) {
        globalSummary.tenants_with_tb_imbalance_before++
        break
      }
    }

    if (r.accounts_to_rename.length === 0 && r.collisions.length === 0) continue

    console.log(`── ${r.tenant_slug}  (${r.tenant_name})  id=${r.tenant_id}`)
    console.log(`   Accounts to rename:      ${r.accounts_to_rename.length}`)
    console.log(`   Clients affected:        ${r.clients_affected}`)
    console.log(`   Suppliers affected:      ${r.suppliers_affected}`)
    console.log(`   Boxes affected:          ${r.boxes_affected}`)
    console.log(`   Journal entries touched: ${r.journal_lines_affected}`)
    console.log(`   Tickets touched:         ${r.tickets_affected}`)
    console.log(`   Visas touched:           ${r.visas_affected}`)
    console.log(`   Package bookings:        ${r.package_bookings_affected}`)
    console.log(`   Refunds:                 ${r.refunds_affected}`)
    console.log(`   Vouchers:                ${r.vouchers_affected}`)
    if (r.collisions.length) {
      console.log(`   ⚠️  COLLISIONS (${r.collisions.length}):`)
      r.collisions.forEach(c => console.log(`      new=${c.new_code}  from  ${c.old_a}  AND  ${c.old_b}`))
    }
    if (r.warnings.length) {
      console.log(`   ⚠️  WARNINGS: ${r.warnings.length}`)
      r.warnings.slice(0, 5).forEach(w => console.log(`      - ${w}`))
    }
    console.log(`   Trial balance (before):`)
    for (const cur of Object.keys(r.trial_balance_before)) {
      const tb = r.trial_balance_before[cur]
      const status = Math.abs(tb.diff) < 0.01 ? '✅ balanced' : '🔴 IMBALANCED'
      console.log(`      ${cur}:  D=${tb.debit}  C=${tb.credit}  diff=${tb.diff}  ${status}`)
    }
    // Show first 5 mapping samples
    if (r.accounts_to_rename.length) {
      console.log(`   Sample mappings (first 5):`)
      r.accounts_to_rename.slice(0, 5).forEach(m => {
        console.log(`      ${m.old_code.padEnd(10)} →  ${m.new_code.padEnd(9)}  ${m.name_ar} (${m.type})`)
      })
    }
    console.log()
  }

  console.log('============================================================')
  console.log('GLOBAL SUMMARY')
  console.log('============================================================')
  console.log(`Tenants analyzed:                      ${globalSummary.tenants_analyzed}`)
  console.log(`Tenants needing migration:             ${globalSummary.tenants_needing_migration}`)
  console.log(`Total accounts to rename:              ${globalSummary.total_accounts_to_rename}`)
  console.log(`Total journal entries touched:         ${globalSummary.total_journal_lines}`)
  console.log(`Total cascading references (all cols): ${globalSummary.total_cascading_records}`)
  console.log(`Total collisions detected:             ${globalSummary.total_collisions}`)
  console.log(`Tenants with imbalanced TB (pre-mig):  ${globalSummary.tenants_with_tb_imbalance_before}`)
  console.log('============================================================\n')

  if (globalSummary.total_collisions > 0) {
    console.log('🔴 COLLISIONS DETECTED — do NOT proceed with live migration.')
    console.log('   Review the collision list above; those need manual resolution first.')
  } else if (globalSummary.total_accounts_to_rename === 0) {
    console.log('✅ Nothing to migrate. All accounts already conform to the 7-digit schema.')
  } else {
    console.log('✅ Dry-run complete — no collisions. Trial balance parity should be preserved')
    console.log('   after live migration because only codes are renamed, not amounts.')
    console.log('   Next step: user reviews this report and explicitly authorizes live migration.')
  }

  await client.close()
}

main().catch(err => {
  console.error('❌ Dry-run failed:', err.message)
  process.exit(1)
})
