#!/usr/bin/env node
// =====================================================================================
// Rahaal COA Migration CLI (v3.88)
// -------------------------------------------------------------------------------------
// Usage:
//   node scripts/coa-migrate.js --audit                       # read-only table, ALL tenants
//   node scripts/coa-migrate.js --dry-run --tenant <id>       # plan for one tenant (no writes)
//   node scripts/coa-migrate.js --dry-run --all-eligible      # plan for every non-current tenant
//   node scripts/coa-migrate.js --apply   --tenant <id>       # execute for one confirmed tenant id
//   node scripts/coa-migrate.js --apply   --all-eligible      # execute reset/preserve where safe
// Environment: reads MONGO_URL + DB_NAME from /app/.env (override with COA_DB_NAME).
// Guarantees: tenant-scoped, idempotent, re-audits at apply time (plan/state guard),
// never touches already-current tenants, never prints secrets.
// =====================================================================================
const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')
const coa = require(path.join(__dirname, '..', 'lib', 'coa.js'))

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
  return { url: env.MONGO_URL, dbName: process.env.COA_DB_NAME || env.DB_NAME }
}

function parseArgs(argv) {
  const a = { mode: null, tenant: null, allEligible: false }
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--audit') a.mode = 'audit'
    else if (t === '--dry-run') a.mode = 'dry-run'
    else if (t === '--apply') a.mode = 'apply'
    else if (t === '--tenant') a.tenant = argv[++i]
    else if (t === '--all-eligible') a.allEligible = true
    else { console.error('unknown arg:', t); process.exit(2) }
  }
  if (!a.mode) { console.error('choose one of: --audit | --dry-run | --apply'); process.exit(2) }
  if (a.mode !== 'audit' && !a.tenant && !a.allEligible) {
    console.error(`${a.mode} requires --tenant <id> or --all-eligible`); process.exit(2)
  }
  return a
}

const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n)

async function main() {
  const args = parseArgs(process.argv)
  const { url, dbName } = loadEnv()
  if (!url || !dbName) { console.error('MONGO_URL / DB_NAME missing'); process.exit(2) }
  const client = await MongoClient.connect(url)
  const db = client.db(dbName)
  console.log(`# COA Migration CLI — db=${dbName} mode=${args.mode} coa_version_target=${coa.CURRENT_COA_VERSION}\n`)

  const tenants = args.tenant
    ? await db.collection('tenants').find({ id: args.tenant }).toArray()
    : await db.collection('tenants').find({}).sort({ created_at: 1 }).toArray()
  if (args.tenant && tenants.length === 0) { console.error('tenant id not found:', args.tenant); process.exit(2) }

  // ---------------- AUDIT (read-only, all requested tenants) ----------------
  const audits = []
  for (const t of tenants) audits.push(await coa.auditTenant(db, t.id))

  console.log(pad('TENANT', 30), pad('ID', 10), pad('v', 4), pad('acc', 5), pad('tx', 6), pad('cli', 5), pad('sup', 5), pad('box', 5), 'classification')
  console.log('-'.repeat(100))
  for (const a of audits) {
    console.log(pad(a.tenant_name, 30), pad(a.tenant_id?.slice(0, 8), 10), pad(a.coa_version ?? '-', 4),
      pad(a.account_count, 5), pad(a.transaction_total, 6), pad(a.client_count, 5), pad(a.supplier_count, 5), pad(a.box_count, 5), a.classification)
    const details = []
    if (a.missing?.length) details.push(`missing: ${a.missing.join(',')}`)
    if (a.extras?.length) details.push(`extra: ${a.extras.join(',')}`)
    if (a.wrongParent?.length) details.push(`wrongParent: ${a.wrongParent.join(',')}`)
    if (a.wrongType?.length) details.push(`wrongType: ${a.wrongType.join(',')}`)
    if (a.wrongGroup?.length) details.push(`wrongGroup: ${a.wrongGroup.join(',')}`)
    if (a.duplicates?.length) details.push(`DUPLICATES: ${a.duplicates.join(',')}`)
    if (a.orphans?.length) details.push(`ORPHANS: ${a.orphans.join(',')}`)
    if (a.cycles?.length) details.push(`CYCLES: ${a.cycles.join(',')}`)
    if (a.childrenUnderLegacy?.length) details.push(`childrenUnderLegacy: ${a.childrenUnderLegacy.join(',')}`)
    if (a.unknownLineCodes?.length) details.push(`unknownLineCodes: ${a.unknownLineCodes.join(',')}`)
    if (details.length && args.mode !== 'audit') for (const d of details) console.log('      ↳', d)
    else if (details.length) console.log('      ↳', details.join(' | '))
  }

  if (args.mode === 'audit') { await client.close(); return }

  // ---------------- PLAN (dry-run) / APPLY ----------------
  const targets = audits.filter(a => !a.error && (args.tenant ? true : a.classification !== 'already_current'))
  console.log(`\n# ${args.mode.toUpperCase()} — ${targets.length} target tenant(s)\n`)

  for (const a of targets) {
    const head = `— ${a.tenant_name} (${a.tenant_id.slice(0, 8)})`
    if (a.classification === 'already_current') {
      console.log(`${head}: NO CHANGES (already current)`)
      continue
    }
    if (a.classification === 'manual_review' || a.classification === 'invalid') {
      console.log(`${head}: SKIPPED — ${a.classification} (fix manually, then re-run)`)
      continue
    }
    const planLines = a.classification === 'reset_candidate'
      ? [
        `plan: RESET (0 financial docs re-verified at apply time)`,
        `  wipe financial collections (all currently 0), reseed ${coa.COA_TEMPLATE.length} template accounts`,
        `  relink & recode: ${a.box_count} boxes → 1101/1102, ${a.client_count} clients → 1103, ${a.supplier_count} suppliers → 2101`,
        `  zero cached balances, stamp coa_version=${coa.CURRENT_COA_VERSION}`,
      ]
      : [
        `plan: PRESERVE (${a.transaction_total} financial docs are kept, ids untouched)`,
        `  upsert 28 template accounts by code, drop legacy groups 1201/1301 (audited childless)`,
        `  relink parties (balances NOT zeroed), rewrite legacy ledger codes, recompute balances from ledger`,
        `  validate everything, stamp coa_version=${coa.CURRENT_COA_VERSION} only on success (rollback otherwise)`,
      ]
    console.log(head)
    for (const l of planLines) console.log('   ', l)

    if (args.mode === 'apply') {
      try {
        // state-change guard: re-audit immediately before executing; if the classification
        // changed since the plan above, refuse this tenant.
        const fresh = await coa.auditTenant(db, a.tenant_id)
        if (fresh.classification !== a.classification) {
          console.log(`    ✖ ABORTED: state changed between plan and apply (${a.classification} → ${fresh.classification})`)
          continue
        }
        const res = fresh.classification === 'reset_candidate'
          ? await coa.applyResetMigration(db, a.tenant_id, 'coa-migrate-cli')
          : await coa.applyPreserveMigration(db, a.tenant_id, 'coa-migrate-cli')
        console.log(`    ✔ APPLIED: ${JSON.stringify({ mode: res.mode, result: res.result, changed: res.changed, rewritten_lines: res.rewritten_lines, recode: res.recode ? { boxes: res.recode.boxes, clients: res.recode.clients, suppliers: res.recode.suppliers } : undefined })}`)
        const v = await coa.validateTenant(db, a.tenant_id)
        console.log(`    ✔ POST-VALIDATION: ${v.ok ? 'OK' : 'FAILED → ' + v.problems.join(' | ')}`)
      } catch (e) {
        console.log(`    ✖ FAILED (rolled back): ${e.message}`)
      }
    }
  }
  await client.close()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
