#!/usr/bin/env node
// =====================================================================================
// COA Migration Framework — scenario tests A..I (v3.88)
// Runs against a FULLY ISOLATED database (rahaal_coa_tests) — never the app DB.
// Every write is tenant-scoped; cleanup deletes only the synthetic tenants it created.
//   node scripts/coa-tests.js
// =====================================================================================
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { MongoClient } = require('mongodb')
const { v4: uuidv4 } = require('uuid')
const coa = require(path.join(__dirname, '..', 'lib', 'coa.js'))

const TEST_DB = 'rahaal_coa_tests'
let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`) }

function loadMongoUrl() {
  const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  return env.MONGO_URL
}

// ---------- fixtures ----------
async function makeTenant(db, name) {
  const id = uuidv4()
  await db.collection('tenants').insertOne({ id, name_ar: name, slug: `t-${id.slice(0, 8)}`, created_at: new Date() })
  return id
}

// legacy v1 tree exactly as observed in production/preview (18 accounts)
async function seedV1(db, t) {
  const now = new Date()
  const mk = (code, name_ar, type, parent, is_group) => ({ id: uuidv4(), tenant_id: t, code, name_ar, type, parent, is_group, created_at: now })
  await db.collection('accounts').insertMany([
    mk('1', 'الأصول', 'asset', null, true),
    mk('11', 'الأصول المتداولة', 'asset', '1', true),
    mk('1101', 'صندوق دولار', 'asset', '11', false),
    mk('1102', 'صندوق ريال سعودي', 'asset', '11', false),
    mk('1103', 'صندوق ريال يمني', 'asset', '11', false),
    mk('1201', 'حسابات بنكية / محافظ', 'asset', '11', true),
    mk('1301', 'العملاء (مدينون)', 'asset', '11', true),
    mk('2', 'الخصوم', 'liability', null, true),
    mk('2101', 'الموردون والوكلاء (دائنون)', 'liability', '2', true),
    mk('4', 'الإيرادات', 'revenue', null, true),
    mk('4101', 'إيرادات عمولات التذاكر', 'revenue', '4', false),
    mk('4102', 'إيرادات عمولات التأشيرات والموافقات', 'revenue', '4', false),
    mk('4103', 'إيرادات خدمات إضافية', 'revenue', '4', false),
    mk('4104', 'أرباح وخسائر فروق العملات (مصارفة)', 'revenue', '4', false),
    mk('4105', 'رسوم إلغاء واسترداد', 'revenue', '4', false),
    mk('5', 'المصروفات', 'expense', null, true),
    mk('5101', 'مصاريف تشغيلية', 'expense', '5', true),
    mk('5201', 'فروق عملة وتسويات', 'expense', '5', false),
  ])
}

async function addParties(db, t) {
  const box = { id: uuidv4(), tenant_id: t, name_ar: 'الصندوق الرئيسي', type: 'cash', account_code: '110101', balances: { SAR: 0, USD: 0, YER: 0 }, created_at: new Date(Date.now() - 3000) }
  const bank = { id: uuidv4(), tenant_id: t, name_ar: 'بنك الاختبار', type: 'bank', account_code: '120101', balances: { SAR: 0, USD: 0, YER: 0 }, created_at: new Date(Date.now() - 2000) }
  const client = { id: uuidv4(), tenant_id: t, name: 'عميل قديم', account_code: '1301001', balances: { SAR: 0, USD: 0, YER: 0 }, created_at: new Date(Date.now() - 1000) }
  const supplier = { id: uuidv4(), tenant_id: t, name: 'مورد قديم', account_code: '2101001', balances: { SAR: 0, USD: 0, YER: 0 }, created_at: new Date() }
  await db.collection('boxes').insertMany([box, bank])
  await db.collection('clients').insertOne(client)
  await db.collection('suppliers').insertOne(supplier)
  return { box, bank, client, supplier }
}

// two v1-style transactions: cash ticket sale (box/revenue) + credit sale (client/revenue)
async function addV1Transactions(db, t, P) {
  const je1 = {
    id: uuidv4(), tenant_id: t, date: '2025-05-01', ref_type: 'ticket', ref_id: uuidv4(), currency: 'SAR',
    description: 'بيع تذكرة نقدي', lines: [
      { account_code: '1101', account_name: 'صندوق دولار', party_type: 'box', party_id: P.box.id, party_name: P.box.name_ar, debit: 500, credit: 0 },
      { account_code: '4101', account_name: 'إيرادات تذاكر', party_type: 'revenue', party_id: null, party_name: '', debit: 0, credit: 500 },
    ], created_at: new Date(),
  }
  const je2 = {
    id: uuidv4(), tenant_id: t, date: '2025-05-02', ref_type: 'ticket', ref_id: uuidv4(), currency: 'SAR',
    description: 'بيع تذكرة آجل', lines: [
      { account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: P.client.id, party_name: P.client.name, debit: 300, credit: 0 },
      { account_code: '4101', account_name: 'إيرادات تذاكر', party_type: 'revenue', party_id: null, party_name: '', debit: 0, credit: 300 },
    ], created_at: new Date(),
  }
  await db.collection('journal_entries').insertMany([je1, je2])
  await db.collection('tickets').insertOne({ id: je1.ref_id, tenant_id: t, pnr: 'TEST01', sale_price: 500, currency: 'SAR', created_at: new Date() })
  // cached balances consistent with the ledger
  await db.collection('boxes').updateOne({ id: P.box.id, tenant_id: t }, { $set: { 'balances.SAR': 500 } })
  await db.collection('clients').updateOne({ id: P.client.id, tenant_id: t }, { $set: { 'balances.SAR': 300 } })
  return { je1, je2 }
}

async function tenantStateHash(db, t) {
  const parts = []
  for (const col of ['accounts', 'boxes', 'clients', 'suppliers', 'journal_entries', 'tenant_settings', 'tickets']) {
    const rows = await db.collection(col).find({ tenant_id: t }).sort({ id: 1 }).toArray()
    parts.push(JSON.stringify(rows.map(({ _id, ...r }) => r)))
  }
  return crypto.createHash('sha256').update(parts.join('||')).digest('hex')
}

async function cleanup(db, tenantIds) {
  const cols = ['accounts', 'boxes', 'clients', 'suppliers', 'journal_entries', 'tickets', 'tenant_settings', 'je_audit', ...coa.FINANCIAL_COLLECTIONS]
  for (const t of tenantIds) {
    for (const col of new Set(cols)) await db.collection(col).deleteMany({ tenant_id: t })
    await db.collection('tenants').deleteOne({ id: t })
  }
}

;(async () => {
  const client = await MongoClient.connect(loadMongoUrl())
  const db = client.db(TEST_DB)
  const created = []
  try {
    // ============ A. New tenant → 28 accounts + version stamped ============
    const tA = await makeTenant(db, 'A جديد'); created.push(tA)
    const seedRes = await coa.seedCoaTemplate(db, tA)
    const aAccs = await db.collection('accounts').countDocuments({ tenant_id: tA })
    const aTs = await db.collection('tenant_settings').findOne({ tenant_id: tA })
    check('A: مستأجر جديد يحصل على 28 حساباً + coa_version=2', seedRes.seeded && aAccs === 28 && aTs?.coa_version === 2, `accs=${aAccs}`)
    const aVal = await coa.validateTenant(db, tA)
    check('A: التحقق البنيوي للمستأجر الجديد', aVal.ok, aVal.problems.join('|'))
    const seedAgain = await coa.seedCoaTemplate(db, tA)
    check('A: إعادة الـ seed ترفض (idempotent)', seedAgain.seeded === false)

    // ============ B. Old empty tenant → reset_candidate → apply → v2 ============
    const tB = await makeTenant(db, 'B قديم فارغ'); created.push(tB)
    await seedV1(db, tB)
    const bAudit = await coa.auditTenant(db, tB)
    check('B: Dry-run يصنّف reset_candidate', bAudit.classification === 'reset_candidate', bAudit.classification)
    const bRes = await coa.applyResetMigration(db, tB, 'tests')
    const bAccs = await db.collection('accounts').countDocuments({ tenant_id: tB })
    const bVal = await coa.validateTenant(db, tB)
    check('B: Apply ينتج شجرة v2 صحيحة (28) + validation OK', bRes.result === 'success' && bAccs === 28 && bVal.ok, bVal.problems.join('|'))

    // ============ C. Old tenant + master data (no tx) → reset keeps & relinks ============
    const tC = await makeTenant(db, 'C ماستر بلا حركات'); created.push(tC)
    await seedV1(db, tC)
    const pC = await addParties(db, tC)
    await db.collection('clients').updateOne({ id: pC.client.id, tenant_id: tC }, { $set: { 'balances.SAR': 999 } }) // stale cached balance
    const cAudit = await coa.auditTenant(db, tC)
    check('C: التصنيف reset_candidate (لا حركات مالية)', cAudit.classification === 'reset_candidate')
    await coa.applyResetMigration(db, tC, 'tests')
    const cBox = await db.collection('boxes').findOne({ id: pC.box.id, tenant_id: tC })
    const cBank = await db.collection('boxes').findOne({ id: pC.bank.id, tenant_id: tC })
    const cCli = await db.collection('clients').findOne({ id: pC.client.id, tenant_id: tC })
    const cSup = await db.collection('suppliers').findOne({ id: pC.supplier.id, tenant_id: tC })
    check('C: إعادة الربط — صندوق 1101001 / بنك 1102001 / عميل 1103001 / مورد 2101001',
      cBox.account_code === '1101001' && cBank.account_code === '1102001' && cCli.account_code === '1103001' && cSup.account_code === '2101001',
      `${cBox.account_code}/${cBank.account_code}/${cCli.account_code}/${cSup.account_code}`)
    check('C: الأطراف باقية والأرصدة مصفّرة', cCli.balances.SAR === 0 && cBox.balances.SAR === 0)

    // ============ D. Old tenant WITH transactions → preserve_required, no reset ============
    const tD = await makeTenant(db, 'D بحركات حقيقية'); created.push(tD)
    await seedV1(db, tD)
    const pD = await addParties(db, tD)
    const { je1, je2 } = await addV1Transactions(db, tD, pD)
    const dAudit = await coa.auditTenant(db, tD)
    check('D: التصنيف preserve_required', dAudit.classification === 'preserve_required', dAudit.classification)
    let resetRefused = false
    try { await coa.applyResetMigration(db, tD, 'tests') } catch (e) { resetRefused = /RESET refused/.test(e.message) }
    check('D: RESET يُرفض على مستأجر فيه حركات', resetRefused)
    const dRes = await coa.applyPreserveMigration(db, tD, 'tests')
    const dJe1 = await db.collection('journal_entries').findOne({ id: je1.id, tenant_id: tD })
    const dJe2 = await db.collection('journal_entries').findOne({ id: je2.id, tenant_id: tD })
    const dTickets = await db.collection('tickets').countDocuments({ tenant_id: tD })
    check('D: PRESERVE أبقى القيود والتذاكر بنفس الـ ids', !!dJe1 && !!dJe2 && dTickets === 1)
    check('D: سطر العميل 1301 → 1103 وسطر الصندوق بقي 1101', dJe2.lines[0].account_code === '1103' && dJe1.lines[0].account_code === '1101',
      `${dJe2.lines[0].account_code}/${dJe1.lines[0].account_code}`)
    const dAccs = await db.collection('accounts').countDocuments({ tenant_id: tD })
    const dCli = await db.collection('clients').findOne({ id: pD.client.id, tenant_id: tD })
    const dBox = await db.collection('boxes').findOne({ id: pD.box.id, tenant_id: tD })
    check('D: الشجرة = 28 (1201/1301 حُذفتا بعد التدقيق) والأرصدة أعيد حسابها من الدفتر',
      dAccs === 28 && dCli.balances.SAR === 300 && dBox.balances.SAR === 500, `accs=${dAccs} cli=${dCli.balances.SAR} box=${dBox.balances.SAR}`)
    const dVal = await coa.validateTenant(db, tD)
    check('D: Validation كامل بعد PRESERVE (شامل توازن الدفتر)', dVal.ok, dVal.problems.join('|'))

    // ============ E. Already current → No Changes ============
    const eBefore = await tenantStateHash(db, tA)
    const eRes = await coa.applyResetMigration(db, tA, 'tests')
    const eRes2 = await coa.applyPreserveMigration(db, tA, 'tests')
    const eAfter = await tenantStateHash(db, tA)
    check('E: مستأجر v2 صحيح → No Changes (reset & preserve)', eRes.changed === false && eRes2.changed === false && eBefore === eAfter)

    // ============ F. Re-run migration → second run changes nothing ============
    const fBefore = await tenantStateHash(db, tD)
    const fRes = await coa.applyPreserveMigration(db, tD, 'tests')
    const fAfter = await tenantStateHash(db, tD)
    check('F: إعادة تشغيل الهجرة على D → no_changes وحالة مطابقة تماماً', fRes.changed === false && fBefore === fAfter)
    const fResetB = await coa.applyResetMigration(db, tB, 'tests')
    check('F: إعادة تشغيل reset على B → no_changes', fResetB.changed === false)

    // ============ G. Broken parent → detected by audit ============
    const tG = await makeTenant(db, 'G أب مكسور'); created.push(tG)
    await seedV1(db, tG)
    await db.collection('accounts').insertOne({ id: uuidv4(), tenant_id: tG, code: '9901', name_ar: 'حساب يتيم', type: 'expense', parent: '99', is_group: false, created_at: new Date() })
    const gAudit = await coa.auditTenant(db, tG)
    check('G: الـ Audit يكتشف الأب المكسور ويصنّف manual_review', gAudit.orphans.includes('9901') && gAudit.classification === 'manual_review', JSON.stringify(gAudit.orphans))

    // ============ H. Duplicate code → apply rejected ============
    const tH = await makeTenant(db, 'H كود مكرر'); created.push(tH)
    await seedV1(db, tH)
    await db.collection('accounts').insertOne({ id: uuidv4(), tenant_id: tH, code: '4101', name_ar: 'مكرر', type: 'revenue', parent: '4', is_group: false, created_at: new Date() })
    await db.collection('journal_entries').insertOne({ id: uuidv4(), tenant_id: tH, date: '2025-05-01', ref_type: 'manual', currency: 'SAR', lines: [{ account_code: '4101', party_type: 'revenue', party_id: null, debit: 0, credit: 10 }, { account_code: '5201', party_type: 'expense', party_id: null, debit: 10, credit: 0 }], created_at: new Date() })
    const hAudit = await coa.auditTenant(db, tH)
    let hRefused = false
    try { await coa.applyPreserveMigration(db, tH, 'tests') } catch (e) { hRefused = /manual_review/.test(e.message) }
    check('H: كود مكرر → manual_review وApply مرفوض', hAudit.duplicates.includes('4101') && hRefused)

    // ============ I. Cross-tenant isolation ============
    const iHashA = await tenantStateHash(db, tA) // current tenant must stay identical
    const tI = await makeTenant(db, 'I عزل'); created.push(tI)
    await seedV1(db, tI)
    const pI = await addParties(db, tI)
    await addV1Transactions(db, tI, pI)
    await coa.applyPreserveMigration(db, tI, 'tests')
    const iHashA2 = await tenantStateHash(db, tA)
    const iHashD = await tenantStateHash(db, tD)
    await coa.applyResetMigration(db, tB, 'tests') // no-op re-run, must not touch others
    const iHashD2 = await tenantStateHash(db, tD)
    check('I: هجرة مستأجر لا تغيّر أي مستأجر آخر (hash مطابق)', iHashA === iHashA2 && iHashD === iHashD2)

    // ============ J. Production hybrid: v1 tree + backfilled 4104/4105 under missing '41' ============
    const tJ = await makeTenant(db, 'J هجين إنتاجي'); created.push(tJ)
    await seedV1(db, tJ)
    // simulate the old piecemeal backfill: re-parent 4104/4105 to the (non-existent) '41'
    await db.collection('accounts').updateMany({ tenant_id: tJ, code: { $in: ['4104', '4105'] } }, { $set: { parent: '41' } })
    const pJ = await addParties(db, tJ)
    await addV1Transactions(db, tJ, pJ)
    const jAudit = await coa.auditTenant(db, tJ)
    check('J: orphan قابل للإصلاح (أب قالب مفقود) لا يمنع الهجرة → preserve_required',
      jAudit.orphans.includes('4104') && !jAudit.hardOrphans.includes('4104') && jAudit.classification === 'preserve_required', jAudit.classification)
    const jRes = await coa.applyPreserveMigration(db, tJ, 'tests')
    const jVal = await coa.validateTenant(db, tJ)
    check('J: PRESERVE يصلح الشجرة الهجينة الإنتاجية بالكامل', jRes.result === 'success' && jVal.ok, jVal.problems.join('|'))

    // ============ K. BLOCKER-1: new tenant → exactly ONE tenant_settings doc ============
    // Mirrors the real new-tenant bootstrap: seedCoaTemplate (stamps coa_version via
    // upsert) followed by the defaults upsert — must merge into the SAME document.
    const tK = await makeTenant(db, 'K مستند إعدادات واحد'); created.push(tK)
    await coa.seedCoaTemplate(db, tK)
    await coa.upsertTenantSettingsDefaults(db, tK, {
      agency_name: '', primary_color: '#1e3a8a', base_currency: 'YER',
      rates: { USD: { transfer: 1554 }, SAR: { transfer: 410 }, YER: { transfer: 1 } },
      updated_at: new Date(),
    })
    const kCount = await db.collection('tenant_settings').countDocuments({ tenant_id: tK })
    const kTs = await db.collection('tenant_settings').findOne({ tenant_id: tK })
    const kAccs = await db.collection('accounts').countDocuments({ tenant_id: tK })
    check('K: مستأجر جديد → مستند tenant_settings واحد فقط + coa_version=2 + 28 حساباً',
      kCount === 1 && kTs?.coa_version === 2 && kAccs === 28 && !!kTs?.id && kTs?.base_currency === 'YER',
      `settings_docs=${kCount} coa_version=${kTs?.coa_version} accs=${kAccs}`)
    await coa.upsertTenantSettingsDefaults(db, tK, { agency_name: 'وكالة الاختبار' })
    const kCount2 = await db.collection('tenant_settings').countDocuments({ tenant_id: tK })
    const kTs2 = await db.collection('tenant_settings').findOne({ tenant_id: tK })
    check('K: إعادة تشغيل upsert الإعدادات لا تنشئ مستنداً ثانياً (idempotent)',
      kCount2 === 1 && kTs2?.agency_name === 'وكالة الاختبار' && kTs2?.id === kTs?.id && kTs2?.coa_version === 2,
      `settings_docs=${kCount2}`)

    // ============ L. BLOCKER-2: PRODUCTION → full reset forbidden when tx > 0 ============
    // DISABLE_AUTO_SEED=true is the permanent live-server flag. Even the owner endpoint's
    // explicit { allowWipe: true } must be refused, and the tenant data must stay intact.
    const tL = await makeTenant(db, 'L إنتاج محمي'); created.push(tL)
    await seedV1(db, tL)
    const pL = await addParties(db, tL)
    await addV1Transactions(db, tL, pL)
    const lBefore = await tenantStateHash(db, tL)
    const prevSeedFlag = process.env.DISABLE_AUTO_SEED
    let lBlocked = false, lMsg = ''
    try {
      process.env.DISABLE_AUTO_SEED = 'true' // simulate production
      await coa.applyResetMigration(db, tL, 'tests', { allowWipe: true })
    } catch (e) { lBlocked = /RESET blocked on PRODUCTION/.test(e.message); lMsg = e.message }
    finally {
      if (prevSeedFlag === undefined) delete process.env.DISABLE_AUTO_SEED
      else process.env.DISABLE_AUTO_SEED = prevSeedFlag
    }
    const lAfter = await tenantStateHash(db, tL)
    const lJeCount = await db.collection('journal_entries').countDocuments({ tenant_id: tL })
    check('L: على الإنتاج — Full Reset مرفوض رغم allowWipe لمستأجر لديه حركات', lBlocked, lMsg)
    check('L: بيانات المستأجر بقيت كما هي تماماً بعد الرفض (hash مطابق + القيود سليمة)',
      lBefore === lAfter && lJeCount === 2, `je=${lJeCount}`)
    // sanity: the same explicit wipe still works OUTSIDE production (test-env bootstrap)
    const lRes = await coa.applyResetMigration(db, tL, 'tests', { allowWipe: true })
    const lVal = await coa.validateTenant(db, tL)
    check('L: خارج الإنتاج — allowWipe الصريح ما زال يعمل (بيئة الاختبار)', lRes.result === 'success' && lVal.ok, lVal.problems.join('|'))

    console.log(`\n=== COA MIGRATION TESTS: ${pass} passed, ${fail} failed ===`)
  } finally {
    await cleanup(db, created)
    const leftovers = await db.collection('tenants').countDocuments({})
    console.log(`cleanup done — synthetic tenants removed, leftover tenants in ${TEST_DB}: ${leftovers}`)
    await client.close()
  }
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
