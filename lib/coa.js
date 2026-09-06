// =====================================================================================
// Rahaal — COA Migration Framework (v3.88)
// -------------------------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for the Chart-of-Accounts template, per-tenant version
// detection, audit / classification, and the two controlled migration paths:
//   • RESET    — tenant-scoped full financial reset + reseed (empty/test tenants ONLY)
//   • PRESERVE — non-destructive hierarchy upgrade that keeps every financial document
// Written in CommonJS so it can be required by the CLI (scripts/coa-migrate.js) AND
// imported by the Next.js API route (app/api/[[...path]]/route.js) via ESM interop.
//
// HARD SAFETY RULES ENFORCED HERE:
//   • Every read/write is tenant-scoped ({ tenant_id }). No global destructive op exists.
//   • coa_version is stamped ONLY after the full operation + validation succeed.
//   • Auditing is read-only. Dry-run performs zero writes.
//   • RESET refuses to run unless the tenant has ZERO financial documents (re-checked
//     at apply time, not only at plan time).
//   • PRESERVE aborts (manual_review) on any ambiguity instead of guessing.
// =====================================================================================
const { v4: uuidv4 } = require('uuid')

const CURRENT_COA_VERSION = 2

// ---- Canonical account codes (kept in sync with COA constants in route.js) ----------
const C = {
  ASSETS: '1', CURRENT_ASSETS: '11', CASHBOXES: '1101', BANKS: '1102', CLIENTS: '1103',
  FIXED_ASSETS: '12',
  LIABILITIES: '2', CURRENT_LIABS: '21', SUPPLIERS: '2101', LONGTERM_LIABS: '22',
  EQUITY: '3', EQUITY_GROUP: '31', CAPITAL: '3101', RETAINED_EARNINGS: '3102', OPENING_EQUITY: '3103',
  REVENUES: '4', REV_GROUP: '41', REV_TICKETS: '4101', REV_VISAS: '4102', REV_SERVICES: '4103',
  FX_PNL: '4104', REV_CANCEL_FEES: '4105',
  EXPENSES: '5', OPEX_GROUP: '51', ADMIN_GROUP: '52', COMM_DIFF_GROUP: '53',
  OPEX: '5101', FX_ADJUST: '5201',
}

// ---- COA v2 TEMPLATE — exactly 28 accounts ------------------------------------------
const COA_TEMPLATE = [
  { code: C.ASSETS, name_ar: 'الأصول', type: 'asset', parent: null, is_group: true },
  { code: C.CURRENT_ASSETS, name_ar: 'الأصول المتداولة', type: 'asset', parent: C.ASSETS, is_group: true },
  { code: C.CASHBOXES, name_ar: 'الصناديق', type: 'asset', parent: C.CURRENT_ASSETS, is_group: true, next_child_seq: 1 },
  { code: C.BANKS, name_ar: 'البنوك والمحافظ', type: 'asset', parent: C.CURRENT_ASSETS, is_group: true, next_child_seq: 1 },
  { code: C.CLIENTS, name_ar: 'العملاء / ذمم مدينة', type: 'asset', parent: C.CURRENT_ASSETS, is_group: true },
  { code: C.FIXED_ASSETS, name_ar: 'الأصول الثابتة / غير المتداولة', type: 'asset', parent: C.ASSETS, is_group: true },
  { code: C.LIABILITIES, name_ar: 'الخصوم / الالتزامات', type: 'liability', parent: null, is_group: true },
  { code: C.CURRENT_LIABS, name_ar: 'الالتزامات المتداولة', type: 'liability', parent: C.LIABILITIES, is_group: true },
  { code: C.SUPPLIERS, name_ar: 'الموردون والوكلاء (دائنون)', type: 'liability', parent: C.CURRENT_LIABS, is_group: true },
  { code: C.LONGTERM_LIABS, name_ar: 'الالتزامات طويلة الأجل / غير المتداولة', type: 'liability', parent: C.LIABILITIES, is_group: true },
  { code: C.EQUITY, name_ar: 'حقوق الملكية', type: 'equity', parent: null, is_group: true },
  { code: C.EQUITY_GROUP, name_ar: 'رأس المال وحقوق الملكية', type: 'equity', parent: C.EQUITY, is_group: true },
  { code: C.CAPITAL, name_ar: 'رأس المال', type: 'equity', parent: C.EQUITY_GROUP, is_group: false },
  { code: C.RETAINED_EARNINGS, name_ar: 'الأرباح المبقاة', type: 'equity', parent: C.EQUITY_GROUP, is_group: false },
  { code: C.OPENING_EQUITY, name_ar: 'تسوية الأرصدة الافتتاحية', type: 'equity', parent: C.EQUITY_GROUP, is_group: false, is_system: true },
  { code: C.REVENUES, name_ar: 'الإيرادات', type: 'revenue', parent: null, is_group: true },
  { code: C.REV_GROUP, name_ar: 'إيرادات النشاط', type: 'revenue', parent: C.REVENUES, is_group: true },
  { code: C.REV_TICKETS, name_ar: 'إيرادات عمولات التذاكر', type: 'revenue', parent: C.REV_GROUP, is_group: false },
  { code: C.REV_VISAS, name_ar: 'إيرادات عمولات التأشيرات والموافقات', type: 'revenue', parent: C.REV_GROUP, is_group: false },
  { code: C.REV_SERVICES, name_ar: 'إيرادات خدمات إضافية', type: 'revenue', parent: C.REV_GROUP, is_group: false },
  { code: C.FX_PNL, name_ar: 'أرباح وخسائر فروق العملات (مصارفة)', type: 'revenue', parent: C.REV_GROUP, is_group: false },
  { code: C.REV_CANCEL_FEES, name_ar: 'رسوم إلغاء واسترداد', type: 'revenue', parent: C.REV_GROUP, is_group: false },
  { code: C.EXPENSES, name_ar: 'المصروفات', type: 'expense', parent: null, is_group: true },
  { code: C.OPEX_GROUP, name_ar: 'مصاريف تشغيلية', type: 'expense', parent: C.EXPENSES, is_group: true },
  { code: C.ADMIN_GROUP, name_ar: 'مصاريف إدارية وعمومية', type: 'expense', parent: C.EXPENSES, is_group: true },
  { code: C.COMM_DIFF_GROUP, name_ar: 'فروق العمولات', type: 'expense', parent: C.EXPENSES, is_group: true },
  { code: C.OPEX, name_ar: 'مصاريف تشغيلية (تفصيلي)', type: 'expense', parent: C.OPEX_GROUP, is_group: true },
  { code: C.FX_ADJUST, name_ar: 'فروق عملة وتسويات', type: 'expense', parent: C.ADMIN_GROUP, is_group: false },
]
const TEMPLATE_BY_CODE = Object.fromEntries(COA_TEMPLATE.map(a => [a.code, a]))

// ---- Known v1 (legacy) structure -----------------------------------------------------
// v1 tree (observed in production/preview): currency-named cash leaves 1101/1102/1103,
// banks group 1201, clients group 1301 (all under 11), suppliers 2101 directly under 2,
// revenues 41xx directly under 4, 5101/5201 directly under 5, NO equity section at all.
const LEGACY_V1_ONLY_CODES = ['1201', '1301'] // structural groups that do NOT exist in v2
// Ledger account_code remap for lines WITHOUT a party reference:
const LEGACY_LINE_CODE_MAP = { '1301': C.CLIENTS, '1201': C.BANKS }
// v1 leaf codes that collide with v2 GROUP codes but meant currency cashboxes:
const LEGACY_CURRENCY_LEAVES = ['1101', '1102', '1103']

const FINANCIAL_COLLECTIONS = [
  'journal_entries', 'vouchers', 'tickets', 'visas', 'services', 'currency_exchanges',
  'refunds', 'cashout_requests', 'package_bookings', 'meraaj_inbound_bookings', 'booking_documents',
]
const CCYS = ['SAR', 'USD', 'YER']
const emptyBalances = () => ({ SAR: 0, USD: 0, YER: 0 })
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// =====================================================================================
// SEED — new tenants get the latest template directly (idempotent: refuses if any
// accounts already exist for the tenant) and are stamped with CURRENT_COA_VERSION.
// =====================================================================================
async function seedCoaTemplate(db, tenantId) {
  const existing = await db.collection('accounts').countDocuments({ tenant_id: tenantId })
  if (existing > 0) return { seeded: false, reason: 'accounts already exist', existing }
  const now = new Date()
  await db.collection('accounts').insertMany(COA_TEMPLATE.map(a => ({
    id: uuidv4(), tenant_id: tenantId, code: a.code, name_ar: a.name_ar, type: a.type,
    parent: a.parent, is_group: a.is_group, created_at: now,
    ...(a.is_system ? { is_system: true } : {}), ...(a.next_child_seq ? { next_child_seq: a.next_child_seq } : {}),
  })))
  await stampVersion(db, tenantId, 'seed', 'new_tenant_seed', null)
  return { seeded: true, accounts: COA_TEMPLATE.length }
}

async function stampVersion(db, tenantId, mode, result, by) {
  // v3.88.1 — BLOCKER-1: always upsert on { tenant_id } (never insert) and give the
  // upserted doc a stable uuid `id` so later code paths that address settings by id work.
  await db.collection('tenant_settings').updateOne(
    { tenant_id: tenantId },
    {
      $set: { coa_version: CURRENT_COA_VERSION, coa_migrated_at: new Date(), coa_migrated_by: by || 'system', coa_migration_mode: mode, coa_migration_result: result },
      $setOnInsert: { id: uuidv4(), created_at: new Date() },
    },
    { upsert: true },
  )
}

// =====================================================================================
// v3.88.1 — BLOCKER-1 fix: SINGLE tenant_settings document per tenant, guaranteed.
// New-tenant bootstrap used to do stampVersion (upsert → doc #1) followed by a raw
// insertOne of the defaults (→ doc #2). This helper is the ONLY sanctioned way to
// write tenant default settings: it merges into the same { tenant_id } document.
// Idempotent — re-running never creates a second document.
// =====================================================================================
async function upsertTenantSettingsDefaults(db, tenantId, defaults = {}) {
  const { id, _id, tenant_id, ...rest } = defaults // never allow identity overrides
  await db.collection('tenant_settings').updateOne(
    { tenant_id: tenantId },
    { $set: rest, $setOnInsert: { id: uuidv4(), created_at: new Date() } },
    { upsert: true },
  )
  return db.collection('tenant_settings').findOne({ tenant_id: tenantId })
}

// =====================================================================================
// v3.88.2 — a test environment must be POSITIVELY proven, never assumed:
//   1) the connected database name ends in `_test` or `_tests`, AND
//   2) ALLOW_DESTRUCTIVE_COA_RESET=true is explicitly set in the environment.
// Anything else (including production, preview, or a misconfigured env) is NOT a test
// environment — destructive wipes are denied by default there.
// =====================================================================================
function isProvenTestEnvironment(db) {
  const name = String(db?.databaseName || '')
  return /_tests?$/i.test(name) && process.env.ALLOW_DESTRUCTIVE_COA_RESET === 'true'
}

// =====================================================================================
// v3.88.2 — READ-ONLY duplicate audit for tenant_settings (never deletes, never merges).
// Returns [{ tenant_id, count, ids }] for every tenant that has more than one document.
// =====================================================================================
async function auditTenantSettingsDuplicates(db) {
  const rows = await db.collection('tenant_settings').aggregate([
    { $match: { tenant_id: { $ne: null } } },
    { $group: { _id: '$tenant_id', n: { $sum: 1 }, ids: { $push: '$id' } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray()
  return rows.map(r => ({ tenant_id: r._id, count: r.n, ids: r.ids }))
}

// =====================================================================================
// v3.88.2 — SAFE unique-index creation for tenant_settings.tenant_id:
//   • Runs the read-only duplicate audit FIRST.
//   • On duplicates: deletes NOTHING, merges NOTHING, does NOT create the index —
//     logs a loud warning and returns { created: false, classification: 'manual_review' }
//     so the situation is never silently swallowed.
//   • Only when the audit is clean is the unique index actually created.
// =====================================================================================
async function ensureTenantSettingsUniqueIndex(db) {
  const duplicates = await auditTenantSettingsDuplicates(db)
  if (duplicates.length > 0) {
    console.warn(
      `[coa] ⚠️ WARNING: unique_tenant_settings index NOT created — ${duplicates.length} tenant(s) have DUPLICATE tenant_settings documents and require MANUAL REVIEW (nothing was deleted or merged): ` +
      duplicates.map(d => `${d.tenant_id}×${d.count}`).join(', '),
    )
    return { created: false, classification: 'manual_review', duplicates }
  }
  await db.collection('tenant_settings').createIndex({ tenant_id: 1 }, { unique: true, sparse: true, name: 'unique_tenant_settings' })
  return { created: true, classification: 'ok', duplicates: [] }
}

// =====================================================================================
// AUDIT — read-only, per tenant. Returns full structural picture + classification.
// =====================================================================================
async function auditTenant(db, tenantId) {
  const tenant = await db.collection('tenants').findOne({ id: tenantId })
  if (!tenant) return { tenant_id: tenantId, error: 'tenant not found', classification: 'invalid' }
  const ts = await db.collection('tenant_settings').findOne({ tenant_id: tenantId })
  const accounts = await db.collection('accounts').find({ tenant_id: tenantId }).toArray()
  const byCode = {}
  const duplicates = []
  for (const a of accounts) {
    if (byCode[a.code]) duplicates.push(a.code)
    byCode[a.code] = a
  }
  const codes = new Set(accounts.map(a => a.code))
  const missing = COA_TEMPLATE.filter(t => !codes.has(t.code)).map(t => t.code)
  const extras = accounts.filter(a => !TEMPLATE_BY_CODE[a.code]).map(a => a.code)
  const wrongParent = accounts.filter(a => TEMPLATE_BY_CODE[a.code] && (a.parent || null) !== TEMPLATE_BY_CODE[a.code].parent).map(a => `${a.code}(${a.parent || '-'}≠${TEMPLATE_BY_CODE[a.code].parent || '-'})`)
  const wrongType = accounts.filter(a => TEMPLATE_BY_CODE[a.code] && a.type !== TEMPLATE_BY_CODE[a.code].type).map(a => a.code)
  const wrongGroup = accounts.filter(a => TEMPLATE_BY_CODE[a.code] && !!a.is_group !== !!TEMPLATE_BY_CODE[a.code].is_group).map(a => a.code)
  const orphans = accounts.filter(a => a.parent && !byCode[a.parent]).map(a => a.code)
  // Orphans whose missing parent IS a template code are REPAIRABLE — the exact hybrid
  // state produced in production by the old piecemeal backfill (4104/4105 inserted with
  // parent '41' into v1 trees that never had a '41' group). Migration creates the parent.
  const hardOrphans = accounts.filter(a => a.parent && !byCode[a.parent] && !TEMPLATE_BY_CODE[a.parent]).map(a => a.code)
  // cycles
  const cycles = []
  for (const a of accounts) {
    const seen = new Set()
    let cur = a
    while (cur && cur.parent) {
      if (seen.has(cur.code)) { cycles.push(a.code); break }
      seen.add(cur.code)
      cur = byCode[cur.parent]
    }
  }
  // children under legacy-only groups (would block a clean preserve)
  const childrenUnderLegacy = accounts.filter(a => a.parent && LEGACY_V1_ONLY_CODES.includes(a.parent)).map(a => a.code)

  // financial + master counts (all tenant-scoped)
  const counts = {}
  let txTotal = 0
  for (const col of FINANCIAL_COLLECTIONS) {
    counts[col] = await db.collection(col).countDocuments({ tenant_id: tenantId })
    txTotal += counts[col]
  }
  const clients = await db.collection('clients').countDocuments({ tenant_id: tenantId })
  const suppliers = await db.collection('suppliers').countDocuments({ tenant_id: tenantId })
  const boxes = await db.collection('boxes').countDocuments({ tenant_id: tenantId })

  // ledger account_code references that are neither template, nor mappable legacy,
  // nor an existing custom account, nor resolvable via a party reference:
  const lineCodes = await db.collection('journal_entries').aggregate([
    { $match: { tenant_id: tenantId } }, { $unwind: '$lines' },
    { $group: { _id: { code: '$lines.account_code', hasParty: { $cond: [{ $and: [{ $ne: ['$lines.party_id', null] }, { $in: ['$lines.party_type', ['box', 'client', 'supplier']] }] }, true, false] } }, n: { $sum: 1 } } },
  ]).toArray()
  const unknownLineCodes = []
  for (const row of lineCodes) {
    const code = String(row._id.code || '')
    if (row._id.hasParty) continue // resolvable through the party document
    if (TEMPLATE_BY_CODE[code]) continue
    if (LEGACY_LINE_CODE_MAP[code]) continue
    if (byCode[code] && !TEMPLATE_BY_CODE[code]) continue // custom account that will be kept
    unknownLineCodes.push(`${code}×${row.n}`)
  }

  const matchesTemplate = missing.length === 0 && extras.length === 0 && wrongParent.length === 0 &&
    wrongType.length === 0 && wrongGroup.length === 0 && duplicates.length === 0 &&
    orphans.length === 0 && cycles.length === 0
  const structuralAnomaly = duplicates.length > 0 || cycles.length > 0 || hardOrphans.length > 0 ||
    childrenUnderLegacy.length > 0 || unknownLineCodes.length > 0

  let classification
  if ((ts?.coa_version === CURRENT_COA_VERSION) && matchesTemplate) classification = 'already_current'
  else if (matchesTemplate && accounts.length === COA_TEMPLATE.length) classification = 'already_current' // correct tree, just missing the stamp
  else if (structuralAnomaly) classification = 'manual_review'
  else if (txTotal === 0) classification = 'reset_candidate'
  else classification = 'preserve_required'

  return {
    tenant_id: tenantId,
    tenant_name: tenant.name_ar || tenant.name || tenant.slug || tenantId,
    coa_version: ts?.coa_version ?? null,
    account_count: accounts.length,
    missing, extras, wrongParent, wrongType, wrongGroup, duplicates, orphans, hardOrphans, cycles,
    childrenUnderLegacy, unknownLineCodes,
    financial_counts: counts, transaction_total: txTotal,
    client_count: clients, supplier_count: suppliers, box_count: boxes,
    matchesTemplate, classification,
  }
}

// =====================================================================================
// VALIDATION — full post-migration checklist (read-only).
// =====================================================================================
async function validateTenant(db, tenantId) {
  const problems = []
  const audit = await auditTenant(db, tenantId)
  if (audit.error) return { ok: false, problems: [audit.error] }
  if (audit.missing.length) problems.push(`missing template codes: ${audit.missing.join(',')}`)
  if (audit.duplicates.length) problems.push(`duplicate codes: ${audit.duplicates.join(',')}`)
  if (audit.orphans.length) problems.push(`orphan accounts: ${audit.orphans.join(',')}`)
  if (audit.cycles.length) problems.push(`cycles at: ${audit.cycles.join(',')}`)
  if (audit.wrongParent.length) problems.push(`wrong parents: ${audit.wrongParent.join(',')}`)
  if (audit.wrongType.length) problems.push(`wrong types: ${audit.wrongType.join(',')}`)
  if (audit.wrongGroup.length) problems.push(`wrong is_group: ${audit.wrongGroup.join(',')}`)
  if (audit.unknownLineCodes.length) problems.push(`ledger references unknown codes: ${audit.unknownLineCodes.join(',')}`)

  const accounts = await db.collection('accounts').find({ tenant_id: tenantId }).toArray()
  const byCode = Object.fromEntries(accounts.map(a => [a.code, a]))
  // prefix rule for every account (template + custom)
  for (const a of accounts) {
    if (a.parent && !a.code.startsWith(a.parent)) problems.push(`prefix violation: ${a.code} !~ ${a.parent}`)
  }
  // 3103 must stay a system account
  if (!byCode[C.OPENING_EQUITY]?.is_system) problems.push('3103 is not flagged is_system')

  // parties: placement + 7-digit codes + uniqueness + no currency-named boxes
  const partyChecks = [
    ['clients', [C.CLIENTS]], ['suppliers', [C.SUPPLIERS]], ['boxes', [C.CASHBOXES, C.BANKS]],
  ]
  const allPartyCodes = []
  for (const [col, parents] of partyChecks) {
    const rows = await db.collection(col).find({ tenant_id: tenantId }).toArray()
    for (const p of rows) {
      const code = p.account_code || ''
      if (code.length !== 7 || !parents.some(par => code.startsWith(par))) {
        problems.push(`${col} ${p.name_ar || p.name || p.id} bad code ${code || '(none)'}`)
      }
      allPartyCodes.push(code)
      if (byCode[code]) problems.push(`party code ${code} collides with a COA account`)
      if (col === 'boxes' && ['SAR', 'USD', 'YER', 'دولار', 'ريال سعودي', 'ريال يمني'].some(n => String(p.name_ar || '').trim() === n)) {
        problems.push(`box named after a currency: ${p.name_ar}`)
      }
    }
  }
  if (new Set(allPartyCodes).size !== allPartyCodes.length) problems.push('duplicate party account codes')

  // ledger ↔ cached balances + per-currency trial balance
  const ledger = await ledgerPartyBalances(db, tenantId)
  for (const [col, sign] of [['boxes', 1], ['clients', 1], ['suppliers', -1]]) {
    const rows = await db.collection(col).find({ tenant_id: tenantId }).toArray()
    for (const p of rows) {
      for (const ccy of CCYS) {
        const fromLedger = r2((ledger[p.id]?.[ccy] || 0) * sign)
        const cached = r2(p.balances?.[ccy] || 0)
        if (Math.abs(fromLedger - cached) >= 0.01) {
          problems.push(`${col} ${p.name_ar || p.name}: cached ${ccy}=${cached} ≠ ledger ${fromLedger}`)
        }
      }
    }
  }
  const tb = await db.collection('journal_entries').aggregate([
    { $match: { tenant_id: tenantId } }, { $unwind: '$lines' },
    { $group: { _id: { c: { $ifNull: ['$lines.currency', '$currency'] } }, d: { $sum: '$lines.debit' }, cr: { $sum: '$lines.credit' } } },
  ]).toArray()
  for (const row of tb) {
    if (Math.abs(r2(row.d - row.cr)) >= 0.01) problems.push(`trial balance unbalanced for ${row._id.c}: D=${r2(row.d)} C=${r2(row.cr)}`)
  }
  return { ok: problems.length === 0, problems }
}

// ledger net (debit - credit) per party per currency — sign applied by caller.
async function ledgerPartyBalances(db, tenantId) {
  const rows = await db.collection('journal_entries').aggregate([
    { $match: { tenant_id: tenantId } }, { $unwind: '$lines' },
    { $match: { 'lines.party_id': { $ne: null } } },
    { $group: { _id: { p: '$lines.party_id', c: { $ifNull: ['$lines.currency', '$currency'] } }, d: { $sum: '$lines.debit' }, cr: { $sum: '$lines.credit' } } },
  ]).toArray()
  const out = {}
  for (const row of rows) {
    const p = row._id.p, ccy = row._id.c
    if (!CCYS.includes(ccy)) continue
    out[p] = out[p] || {}
    out[p][ccy] = r2(row.d - row.cr)
  }
  return out
}

// =====================================================================================
// RESET migration — tenant-scoped full financial reset + reseed + relink.
// Preconditions are RE-CHECKED here (zero financial docs) — refuses otherwise.
// =====================================================================================
async function applyResetMigration(db, tenantId, by, opts = {}) {
  const audit = await auditTenant(db, tenantId)
  if (audit.error) throw new Error(audit.error)
  if (audit.classification === 'already_current' && !opts.force) {
    return { mode: 'reset', changed: false, result: 'no_changes', reason: 'already current' }
  }
  // HARD GUARD (re-checked at apply time): reset only when there is truly nothing financial.
  // v3.88.2 — DEFAULT-DENY: a tenant holding ANY financial document can NEVER be fully
  // reset — opts.allowWipe alone is not enough. The ONLY exception is a POSITIVELY-PROVEN
  // test environment (see isProvenTestEnvironment): the connected DB name ends in
  // `_test`/`_tests` AND ALLOW_DESTRUCTIVE_COA_RESET=true. Both conditions are required
  // together. Production safety therefore no longer depends on DISABLE_AUTO_SEED —
  // a missing or misconfigured flag can no longer enable a wipe.
  if (audit.transaction_total > 0 && !(opts.allowWipe && isProvenTestEnvironment(db))) {
    if (opts.allowWipe) {
      throw new Error(`RESET blocked: tenant has ${audit.transaction_total} financial documents — full wipe is DENIED BY DEFAULT in every environment; it is allowed only in a positively-proven test environment (db name ending in _test/_tests AND ALLOW_DESTRUCTIVE_COA_RESET=true) — use PRESERVE`)
    }
    throw new Error(`RESET refused: tenant has ${audit.transaction_total} financial documents — use PRESERVE`)
  }
  const wiped = {}
  const docKeys = (await db.collection('booking_documents').find({ tenant_id: tenantId }).project({ 'storage.object_key': 1 }).toArray())
    .map(d => d?.storage?.object_key).filter(Boolean)
  if (docKeys.length) {
    const rBlobs = await db.collection('document_blobs').deleteMany({ tenant_id: tenantId, object_key: { $in: docKeys } })
    wiped.document_blobs = rBlobs.deletedCount
  }
  for (const col of FINANCIAL_COLLECTIONS) {
    const r = await db.collection(col).deleteMany({ tenant_id: tenantId })
    wiped[col] = r.deletedCount
  }
  await db.collection('accounts').deleteMany({ tenant_id: tenantId })
  await seedTemplateRaw(db, tenantId)
  const recode = await relinkParties(db, tenantId, { zeroBalances: true })
  const validation = await validateTenant(db, tenantId)
  if (!validation.ok) throw new Error(`RESET validation failed: ${validation.problems.join(' | ')}`)
  await stampVersion(db, tenantId, 'reset', 'success', by)
  await db.collection('je_audit').insertOne({ id: uuidv4(), tenant_id: tenantId, action: 'coa_migration_reset', wiped, recode, by: by || 'cli', at: new Date() })
  return { mode: 'reset', changed: true, result: 'success', wiped, recode, tree_accounts: COA_TEMPLATE.length }
}

async function seedTemplateRaw(db, tenantId) {
  const now = new Date()
  await db.collection('accounts').insertMany(COA_TEMPLATE.map(a => ({
    id: uuidv4(), tenant_id: tenantId, code: a.code, name_ar: a.name_ar, type: a.type,
    parent: a.parent, is_group: a.is_group, created_at: now,
    ...(a.is_system ? { is_system: true } : {}), ...(a.next_child_seq ? { next_child_seq: a.next_child_seq } : {}),
  })))
}

// re-code + re-parent boxes/clients/suppliers under the correct v2 groups.
async function relinkParties(db, tenantId, { zeroBalances }) {
  const recode = { boxes: 0, clients: 0, suppliers: 0, map: {} }
  const boxes = await db.collection('boxes').find({ tenant_id: tenantId }).sort({ created_at: 1 }).toArray()
  let cashSeq = 0, bankSeq = 0
  for (const bx of boxes) {
    const isBank = bx.type === 'bank'
    const parent = isBank ? C.BANKS : C.CASHBOXES
    const seq = isBank ? ++bankSeq : ++cashSeq
    const newCode = `${parent}${String(seq).padStart(3, '0')}`
    if (bx.account_code !== newCode) recode.map[bx.account_code || `box:${bx.id.slice(0, 8)}`] = newCode
    const set = { parent_code: parent, account_code: newCode, account_parent_code: parent, account_seq: seq }
    if (zeroBalances) set.balances = emptyBalances()
    await db.collection('boxes').updateOne({ id: bx.id, tenant_id: tenantId }, { $set: set })
    recode.boxes++
  }
  await db.collection('accounts').updateOne({ tenant_id: tenantId, code: C.CASHBOXES }, { $set: { next_child_seq: cashSeq || 1 } })
  await db.collection('accounts').updateOne({ tenant_id: tenantId, code: C.BANKS }, { $set: { next_child_seq: bankSeq || 1 } })
  let cSeq = 0
  for (const cl of await db.collection('clients').find({ tenant_id: tenantId }).sort({ created_at: 1 }).toArray()) {
    cSeq++
    const newCode = `${C.CLIENTS}${String(cSeq).padStart(3, '0')}`
    const set = { account_code: newCode, account_parent_code: C.CLIENTS, account_seq: cSeq }
    if (zeroBalances) set.balances = emptyBalances()
    await db.collection('clients').updateOne({ id: cl.id, tenant_id: tenantId }, { $set: set })
    recode.clients++
  }
  await db.collection('accounts').updateOne({ tenant_id: tenantId, code: C.CLIENTS }, { $set: { next_child_seq: cSeq || 0 } })
  let sSeq = 0
  for (const s of await db.collection('suppliers').find({ tenant_id: tenantId }).sort({ created_at: 1 }).toArray()) {
    sSeq++
    const newCode = `${C.SUPPLIERS}${String(sSeq).padStart(3, '0')}`
    const set = { account_code: newCode, account_parent_code: C.SUPPLIERS, account_seq: sSeq }
    if (zeroBalances) set.balances = emptyBalances()
    await db.collection('suppliers').updateOne({ id: s.id, tenant_id: tenantId }, { $set: set })
    recode.suppliers++
  }
  await db.collection('accounts').updateOne({ tenant_id: tenantId, code: C.SUPPLIERS }, { $set: { next_child_seq: sSeq || 0 } })
  return recode
}

// =====================================================================================
// PRESERVE migration — keeps EVERY financial document & id. Upgrades the tree,
// re-links parties, rewrites ledger account_code references, recomputes balances
// from the ledger, validates, then stamps. In-memory rollback on any failure
// (standalone MongoDB has no multi-document transactions).
// =====================================================================================
async function applyPreserveMigration(db, tenantId, by) {
  const audit = await auditTenant(db, tenantId)
  if (audit.error) throw new Error(audit.error)
  if (audit.classification === 'already_current') {
    return { mode: 'preserve', changed: false, result: 'no_changes', reason: 'already current' }
  }
  if (audit.classification === 'manual_review') {
    throw new Error(`PRESERVE refused — manual_review: dup=${audit.duplicates.join(',')} cycles=${audit.cycles.join(',')} legacyChildren=${audit.childrenUnderLegacy.join(',')} unknownLineCodes=${audit.unknownLineCodes.join(',')}`)
  }

  // ---------- rollback snapshots (in-memory, tenant-scoped) ----------
  const snapAccounts = await db.collection('accounts').find({ tenant_id: tenantId }).toArray()
  const snapParties = {}
  for (const col of ['boxes', 'clients', 'suppliers']) {
    snapParties[col] = await db.collection(col).find({ tenant_id: tenantId })
      .project({ id: 1, account_code: 1, account_parent_code: 1, account_seq: 1, parent_code: 1, balances: 1 }).toArray()
  }
  const snapLines = await db.collection('journal_entries').find({ tenant_id: tenantId }).project({ id: 1, lines: 1 }).toArray()

  const rollback = async () => {
    await db.collection('accounts').deleteMany({ tenant_id: tenantId })
    if (snapAccounts.length) await db.collection('accounts').insertMany(snapAccounts)
    for (const col of ['boxes', 'clients', 'suppliers']) {
      for (const p of snapParties[col]) {
        await db.collection(col).updateOne({ id: p.id, tenant_id: tenantId }, {
          $set: {
            account_code: p.account_code ?? null, account_parent_code: p.account_parent_code ?? null,
            account_seq: p.account_seq ?? null, parent_code: p.parent_code ?? null, balances: p.balances ?? emptyBalances(),
          },
        })
      }
    }
    for (const je of snapLines) {
      await db.collection('journal_entries').updateOne({ id: je.id, tenant_id: tenantId }, { $set: { lines: je.lines } })
    }
  }

  try {
    const byCode = Object.fromEntries(snapAccounts.map(a => [a.code, a]))

    // 1) Upsert the 28 template accounts by code (existing rows keep their id —
    //    old currency leaves 1101/1102/1103 are converted in place into the v2 groups).
    const now = new Date()
    for (const t of COA_TEMPLATE) {
      const setDoc = { name_ar: t.name_ar, type: t.type, parent: t.parent, is_group: t.is_group }
      if (t.is_system) setDoc.is_system = true
      const existing = byCode[t.code]
      if (existing) {
        await db.collection('accounts').updateOne({ id: existing.id, tenant_id: tenantId }, { $set: setDoc })
      } else {
        await db.collection('accounts').insertOne({ id: uuidv4(), tenant_id: tenantId, code: t.code, created_at: now, ...setDoc, ...(t.next_child_seq ? { next_child_seq: t.next_child_seq } : {}) })
      }
    }

    // 2) Remove legacy-only structural groups (1201 banks / 1301 clients) — audit already
    //    guaranteed they have no children. Tenant-scoped by exact code.
    for (const legacy of LEGACY_V1_ONLY_CODES) {
      if (byCode[legacy]) await db.collection('accounts').deleteOne({ tenant_id: tenantId, code: legacy })
    }

    // 3) Custom (non-template) accounts: keep, but repair parents that pointed at
    //    legacy groups; anything unresolvable would have been caught by the audit.
    for (const a of snapAccounts) {
      if (TEMPLATE_BY_CODE[a.code] || LEGACY_V1_ONLY_CODES.includes(a.code)) continue
      let newParent = a.parent
      if (LEGACY_LINE_CODE_MAP[a.parent]) newParent = LEGACY_LINE_CODE_MAP[a.parent]
      if (newParent !== a.parent) {
        await db.collection('accounts').updateOne({ id: a.id, tenant_id: tenantId }, { $set: { parent: newParent } })
      }
    }

    // 4) Re-link parties WITHOUT touching balances yet (they get recomputed from ledger).
    await relinkParties(db, tenantId, { zeroBalances: false })

    // 5) Rewrite ledger lines (id-preserving, tenant-scoped):
    //    • party lines  → group code per current convention (opening lines → party L4 code)
    //    • partyless legacy codes → LEGACY_LINE_CODE_MAP
    const boxesById = Object.fromEntries((await db.collection('boxes').find({ tenant_id: tenantId }).toArray()).map(b => [b.id, b]))
    const clientsById = Object.fromEntries((await db.collection('clients').find({ tenant_id: tenantId }).toArray()).map(x => [x.id, x]))
    const suppliersById = Object.fromEntries((await db.collection('suppliers').find({ tenant_id: tenantId }).toArray()).map(x => [x.id, x]))
    const jes = await db.collection('journal_entries').find({ tenant_id: tenantId }).toArray()
    let rewrittenLines = 0
    for (const je of jes) {
      let changed = false
      const newLines = (je.lines || []).map(l => {
        let code = l.account_code
        if (l.party_id && ['box', 'client', 'supplier'].includes(l.party_type)) {
          if (l.party_type === 'box') {
            const bx = boxesById[l.party_id]
            code = je.ref_type === 'opening' ? (bx?.account_code || code) : (bx?.type === 'bank' ? C.BANKS : C.CASHBOXES)
          } else if (l.party_type === 'client') {
            code = je.ref_type === 'opening' ? (clientsById[l.party_id]?.account_code || code) : C.CLIENTS
          } else {
            code = je.ref_type === 'opening' ? (suppliersById[l.party_id]?.account_code || code) : C.SUPPLIERS
          }
        } else if (LEGACY_LINE_CODE_MAP[code]) {
          code = LEGACY_LINE_CODE_MAP[code]
        }
        if (code !== l.account_code) { changed = true; rewrittenLines++; return { ...l, account_code: code } }
        return l
      })
      if (changed) await db.collection('journal_entries').updateOne({ id: je.id, tenant_id: tenantId }, { $set: { lines: newLines } })
    }

    // 6) Recompute cached balances from the ledger (authoritative).
    const ledger = await ledgerPartyBalances(db, tenantId)
    for (const [col, sign] of [['boxes', 1], ['clients', 1], ['suppliers', -1]]) {
      const rows = await db.collection(col).find({ tenant_id: tenantId }).toArray()
      for (const p of rows) {
        const bal = emptyBalances()
        for (const ccy of CCYS) bal[ccy] = r2((ledger[p.id]?.[ccy] || 0) * sign)
        await db.collection(col).updateOne({ id: p.id, tenant_id: tenantId }, { $set: { balances: bal } })
      }
    }

    // 7) Validate everything, then (and only then) stamp the version.
    const validation = await validateTenant(db, tenantId)
    if (!validation.ok) throw new Error(`PRESERVE validation failed: ${validation.problems.join(' | ')}`)
    await stampVersion(db, tenantId, 'preserve', 'success', by)
    await db.collection('je_audit').insertOne({
      id: uuidv4(), tenant_id: tenantId, action: 'coa_migration_preserve',
      rewritten_lines: rewrittenLines, accounts_before: snapAccounts.length,
      accounts_after: await db.collection('accounts').countDocuments({ tenant_id: tenantId }),
      by: by || 'cli', at: new Date(),
    })
    return { mode: 'preserve', changed: true, result: 'success', rewritten_lines: rewrittenLines }
  } catch (e) {
    await rollback().catch(() => {})
    throw e
  }
}

module.exports = {
  CURRENT_COA_VERSION, COA_TEMPLATE, TEMPLATE_BY_CODE, C,
  FINANCIAL_COLLECTIONS, LEGACY_V1_ONLY_CODES, LEGACY_LINE_CODE_MAP, LEGACY_CURRENCY_LEAVES,
  seedCoaTemplate, auditTenant, validateTenant, ledgerPartyBalances,
  applyResetMigration, applyPreserveMigration, relinkParties, stampVersion,
  upsertTenantSettingsDefaults, isProvenTestEnvironment,
  auditTenantSettingsDuplicates, ensureTenantSettingsUniqueIndex,
}
