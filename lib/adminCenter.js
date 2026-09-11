// ============================================================================
// v3.93 — ADMIN CENTER (Super Admin Batch 1: Sales & Vouchers + Accounting)
// READ-ONLY cross-tenant aggregations. AUDIT-006: logic lives here; route.js
// delegates with a single line. RULES: no writes, no recomputation of stored
// financials (stored values shown as-is), currencies NEVER merged into one
// total (always grouped per currency), mismatches are REPORTED never fixed.
// Reuses existing collections: tickets, visas, services, package_bookings,
// vouchers, journal_entries, clients, suppliers, boxes, tenants,
// tenant_settings, accounts.
// ============================================================================

const LIM = (v, d = 50, max = 100) => Math.min(Math.max(parseInt(v) || d, 1), max)
const num = (v) => Number(v) || 0

async function tenantMap(db) {
  const ts = await db.collection('tenants').find({}, { projection: { id: 1, name: 1 } }).toArray()
  return Object.fromEntries(ts.map(t => [t.id, t.name]))
}

const SALES_KINDS = {
  tickets: { coll: 'tickets', label: 'تذكرة', name: r => r.passenger_name, refType: 'ticket' },
  visas: { coll: 'visas', label: 'تأشيرة', name: r => r.passenger_name || r.beneficiary_name, refType: 'visa' },
  services: { coll: 'services', label: 'خدمة', name: r => r.beneficiary_name || r.service_type, refType: 'service' },
  bookings: { coll: 'package_bookings', label: 'حجز باكج', name: r => r.pilgrim_name, refType: 'package_booking' },
}

function saleRow(r, kind, tn) {
  const k = SALES_KINDS[kind]
  return {
    id: r.id, kind, kind_label: k.label,
    tenant_id: r.tenant_id, tenant_name: tn[r.tenant_id] || r.tenant_id,
    date: r.date || null, created_at: r.created_at || null,
    created_by: r.created_by || null, branch: r.branch_id || null,
    party: k.name(r) || null, client_name: r.client_name || null, supplier_name: r.supplier_name || null,
    sale: r.sale_price ?? r.total_sale ?? r.total ?? null,
    cost: r.cost ?? r.total_cost ?? null,
    profit: r.profit ?? r.commission ?? null,
    currency: r.currency || null, payment_method: r.payment_method || null,
    status: r.is_refunded ? 'refunded' : (r.status || 'active'),
    source: r.meraaj_booking_ref ? 'معراج' : 'رحّال',
    updated_at: r.updated_at || r.edited_at || null, updated_by: r.updated_by || r.edited_by || null,
    refunded_by: r.refunded_by || null, refunded_at: r.refunded_at || null,
  }
}

function salesFilter(p) {
  const f = {}
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  if (p.get('currency')) f.currency = p.get('currency')
  if (p.get('payment')) f.payment_method = p.get('payment')
  const st = p.get('status')
  if (st === 'refunded') f.is_refunded = true
  else if (st === 'active') f.is_refunded = { $ne: true }
  const from = p.get('from'), to = p.get('to')
  if (from || to) {
    f.created_at = {}
    if (from) f.created_at.$gte = new Date(from)
    if (to) f.created_at.$lte = new Date(to + 'T23:59:59.999Z')
  }
  const q = (p.get('q') || '').trim()
  if (q) f.$or = [
    { id: q }, { passenger_name: { $regex: q, $options: 'i' } }, { beneficiary_name: { $regex: q, $options: 'i' } },
    { pilgrim_name: { $regex: q, $options: 'i' } }, { client_name: { $regex: q, $options: 'i' } },
    { supplier_name: { $regex: q, $options: 'i' } }, { pnr: { $regex: q, $options: 'i' } }, { created_by: { $regex: q, $options: 'i' } },
  ]
  return f
}

async function listSales(db, p) {
  const tn = await tenantMap(db)
  const kind = p.get('type') || 'all'
  const limit = LIM(p.get('limit')), skip = Math.max(parseInt(p.get('skip')) || 0, 0)
  const kinds = kind === 'all' ? Object.keys(SALES_KINDS) : (SALES_KINDS[kind] ? [kind] : [])
  if (!kinds.length) return { error: 'نوع غير معروف' }
  const f = salesFilter(p)
  const per = kind === 'all' ? Math.ceil((limit + skip) / 1) : limit + skip
  const batches = await Promise.all(kinds.map(k =>
    db.collection(SALES_KINDS[k].coll).find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(per).toArray()
      .then(rows => rows.map(r => saleRow(r, k, tn))).catch(() => [])
  ))
  let rows = batches.flat().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(skip, skip + limit)
  // linked JE / voucher markers for the current page (one query each — never per row)
  const ids = rows.map(r => r.id)
  const [jes, vs] = await Promise.all([
    db.collection('journal_entries').find({ ref_id: { $in: ids } }, { projection: { ref_id: 1, id: 1 } }).toArray(),
    db.collection('vouchers').find({ ref_id: { $in: ids } }, { projection: { ref_id: 1, id: 1 } }).toArray().catch(() => []),
  ])
  const jeSet = new Set(jes.map(j => j.ref_id)), vSet = new Set(vs.map(v => v.ref_id))
  rows = rows.map(r => ({ ...r, has_je: jeSet.has(r.id), has_voucher: vSet.has(r.id) }))
  if (p.get('missing_je') === '1') rows = rows.filter(r => !r.has_je)
  return { rows, limit, skip, note: 'مصادر البيانات: السجلات المخزنة كما هي — الحقول غير المتوفرة تُعرض فارغة (لا تقدير)' }
}

async function salesDetail(db, p) {
  const kind = p.get('kind'), id = p.get('id')
  const k = SALES_KINDS[kind]
  if (!k || !id) return { error: 'معاملات ناقصة' }
  const doc = await db.collection(k.coll).findOne({ id }, { projection: { _id: 0 } })
  if (!doc) return { error: 'العملية غير موجودة', status: 404 }
  const T = doc.tenant_id
  const [jes, vouchers, client, supplier, box] = await Promise.all([
    db.collection('journal_entries').find({ tenant_id: T, ref_id: id }, { projection: { _id: 0 } }).sort({ created_at: 1 }).toArray(),
    db.collection('vouchers').find({ tenant_id: T, ref_id: id }, { projection: { _id: 0 } }).toArray().catch(() => []),
    doc.client_id ? db.collection('clients').findOne({ tenant_id: T, id: doc.client_id }, { projection: { _id: 0, name: 1, id: 1, account_code: 1, balances: 1, phone: 1 } }) : null,
    doc.supplier_id ? db.collection('suppliers').findOne({ tenant_id: T, id: doc.supplier_id }, { projection: { _id: 0, name: 1, id: 1, account_code: 1, balances: 1 } }) : null,
    doc.box_id ? db.collection('boxes').findOne({ tenant_id: T, id: doc.box_id }, { projection: { _id: 0, name_ar: 1, name: 1, id: 1, account_code: 1 } }) : null,
  ])
  // timeline from REAL stored fields only
  const timeline = []
  if (doc.created_at) timeline.push({ at: doc.created_at, ev: 'إنشاء', by: doc.created_by || null })
  if (doc.updated_at) timeline.push({ at: doc.updated_at, ev: 'تعديل', by: doc.updated_by || null })
  if (doc.refunded_at) timeline.push({ at: doc.refunded_at, ev: 'استرداد/إلغاء', by: doc.refunded_by || null })
  return { doc, kind, journal_entries: jes, vouchers, client, supplier, box, timeline, read_only: true }
}

async function listVouchers(db, p) {
  const tn = await tenantMap(db)
  const limit = LIM(p.get('limit')), skip = Math.max(parseInt(p.get('skip')) || 0, 0)
  const f = {}
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  if (p.get('vtype')) f.type = p.get('vtype')
  if (p.get('currency')) f.currency = p.get('currency')
  const from = p.get('from'), to = p.get('to')
  if (from || to) { f.created_at = {}; if (from) f.created_at.$gte = new Date(from); if (to) f.created_at.$lte = new Date(to + 'T23:59:59.999Z') }
  const q = (p.get('q') || '').trim()
  if (q) f.$or = [{ id: q }, { party_name: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }, { created_by: { $regex: q, $options: 'i' } }, { voucher_no: { $regex: q, $options: 'i' } }]
  const rows = await db.collection('vouchers').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).skip(skip).limit(limit).toArray()
  const ids = rows.map(r => r.id)
  const jes = await db.collection('journal_entries').find({ ref_type: 'voucher', ref_id: { $in: ids } }, { projection: { ref_id: 1, id: 1 } }).toArray()
  const jeByRef = Object.fromEntries(jes.map(j => [j.ref_id, j.id]))
  return {
    rows: rows.map(r => ({
      ...r, tenant_name: tn[r.tenant_id] || r.tenant_id, je_id: jeByRef[r.id] || null,
      status: r.is_reversed ? 'reversed' : r.is_cancelled ? 'cancelled' : (r.status || 'active'),
    })),
    limit, skip,
  }
}

// -------------------- ACCOUNTING --------------------
const balancesAgg = (match = {}) => ([
  { $match: match },
  { $project: { b: { $objectToArray: { $ifNull: ['$balances', {}] } } } },
  { $unwind: '$b' },
  { $group: { _id: '$b.k', total: { $sum: '$b.v' } } },
])
const aggToMap = (rows) => Object.fromEntries(rows.filter(r => Math.abs(r.total) > 0.001).map(r => [r._id, +r.total.toFixed(2)]))

async function accountingOverview(db, p) {
  const tf = p.get('tenant') ? { tenant_id: p.get('tenant') } : {}
  const salesAgg = (coll, profitField) => db.collection(coll).aggregate([
    { $match: { ...tf, is_refunded: { $ne: true } } },
    { $group: { _id: '$currency', sale: { $sum: { $ifNull: ['$sale_price', 0] } }, cost: { $sum: { $ifNull: ['$cost', 0] } }, profit: { $sum: { $ifNull: [profitField, 0] } }, n: { $sum: 1 } } },
  ]).toArray().catch(() => [])
  const [tk, vi, sv, vAgg, refunds, cliBal, supBal, cashBal, bankBal, unbalanced] = await Promise.all([
    salesAgg('tickets', '$profit'), salesAgg('visas', '$profit'), salesAgg('services', '$commission'),
    db.collection('vouchers').aggregate([{ $match: tf }, { $group: { _id: { t: '$type', c: '$currency' }, total: { $sum: { $ifNull: ['$amount', 0] } }, n: { $sum: 1 } } }]).toArray().catch(() => []),
    db.collection('tickets').aggregate([{ $match: { ...tf, is_refunded: true } }, { $group: { _id: '$currency', total: { $sum: { $ifNull: ['$sale_price', 0] } }, n: { $sum: 1 } } }]).toArray().catch(() => []),
    db.collection('clients').aggregate(balancesAgg(tf)).toArray().catch(() => []),
    db.collection('suppliers').aggregate(balancesAgg(tf)).toArray().catch(() => []),
    db.collection('boxes').aggregate(balancesAgg({ ...tf, type: 'cash' })).toArray().catch(() => []),
    db.collection('boxes').aggregate(balancesAgg({ ...tf, type: 'bank' })).toArray().catch(() => []),
    db.collection('journal_entries').aggregate([
      { $match: tf },
      { $project: { d: { $sum: '$lines.debit' }, c: { $sum: '$lines.credit' } } },
      { $match: { $expr: { $gt: [{ $abs: { $subtract: ['$d', '$c'] } }, 0.01] } } },
      { $count: 'n' },
    ]).toArray().catch(() => []),
  ])
  const perCur = (rows) => Object.fromEntries(rows.map(r => [r._id || '?', { sale: +num(r.sale).toFixed(2), cost: +num(r.cost).toFixed(2), profit: +num(r.profit).toFixed(2), count: r.n }]))
  const vouchersByType = {}
  for (const g of vAgg) {
    const t = g._id?.t || '?'
    vouchersByType[t] = vouchersByType[t] || {}
    vouchersByType[t][g._id?.c || '?'] = { total: +num(g.total).toFixed(2), count: g.n }
  }
  return {
    sales: { tickets: perCur(tk), visas: perCur(vi), services: perCur(sv) },
    vouchers_by_type: vouchersByType,
    refunds: Object.fromEntries(refunds.map(r => [r._id || '?', { total: +num(r.total).toFixed(2), count: r.n }])),
    receivables_clients: aggToMap(cliBal), payables_suppliers: aggToMap(supBal),
    cash_boxes: aggToMap(cashBal), bank_boxes: aggToMap(bankBal),
    unbalanced_journals: unbalanced[0]?.n || 0,
    note: 'قيم مخزنة كما هي، لكل عملة على حدة — الأرباح = حقول الربح/العمولة المخزنة فقط (لا إعادة احتساب)',
    read_only: true,
  }
}

async function accountingParties(db, coll, p) {
  const tn = await tenantMap(db)
  const limit = LIM(p.get('limit')), skip = Math.max(parseInt(p.get('skip')) || 0, 0)
  const f = {}
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  const q = (p.get('q') || '').trim()
  if (q) f.name = { $regex: q, $options: 'i' }
  const rows = await db.collection(coll).find(f, { projection: { _id: 0, id: 1, tenant_id: 1, name: 1, phone: 1, account_code: 1, balances: 1, is_frozen: 1, created_at: 1 } }).sort({ created_at: -1 }).skip(skip).limit(limit).toArray()
  const ids = rows.map(r => r.id)
  const led = ids.length ? await db.collection('journal_entries').aggregate([
    { $match: { 'lines.party_id': { $in: ids } } },
    { $unwind: '$lines' },
    { $match: { 'lines.party_id': { $in: ids } } },
    { $group: { _id: '$lines.party_id', debit: { $sum: { $ifNull: ['$lines.debit', 0] } }, credit: { $sum: { $ifNull: ['$lines.credit', 0] } }, last: { $max: '$date' } } },
  ]).toArray().catch(() => []) : []
  const ledBy = Object.fromEntries(led.map(l => [l._id, l]))
  return {
    rows: rows.map(r => ({
      ...r, tenant_name: tn[r.tenant_id] || r.tenant_id,
      total_debit: +num(ledBy[r.id]?.debit).toFixed(2), total_credit: +num(ledBy[r.id]?.credit).toFixed(2),
      last_movement: ledBy[r.id]?.last || null,
    })),
    limit, skip, read_only: true,
  }
}

async function accountingBoxes(db, p) {
  const tn = await tenantMap(db)
  const f = {}
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  const rows = await db.collection('boxes').find(f, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(LIM(p.get('limit'), 100, 200)).toArray()
  const ids = rows.map(r => r.id)
  const flows = ids.length ? await db.collection('vouchers').aggregate([
    { $match: { box_id: { $in: ids } } },
    { $group: { _id: { b: '$box_id', t: '$type', c: '$currency' }, total: { $sum: { $ifNull: ['$amount', 0] } }, last: { $max: '$created_at' } } },
  ]).toArray().catch(() => []) : []
  const byBox = {}
  for (const g of flows) {
    const b = g._id.b
    byBox[b] = byBox[b] || { in: {}, out: {}, last: null }
    const bucket = g._id.t === 'receipt' ? 'in' : 'out'
    byBox[b][bucket][g._id.c || '?'] = +num(g.total).toFixed(2)
    if (!byBox[b].last || g.last > byBox[b].last) byBox[b].last = g.last
  }
  return {
    rows: rows.map(r => ({
      id: r.id, tenant_name: tn[r.tenant_id] || r.tenant_id, name: r.name_ar || r.name, type: r.type,
      currency: r.currency || null, account_code: r.account_code || null, balances: r.balances || {},
      flows: byBox[r.id] || { in: {}, out: {}, last: null }, last_op: byBox[r.id]?.last || null,
      responsible: r.responsible_user || null,
    })),
    read_only: true,
  }
}

async function journalExplorer(db, p) {
  const tn = await tenantMap(db)
  const limit = LIM(p.get('limit')), skip = Math.max(parseInt(p.get('skip')) || 0, 0)
  const f = {}
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  if (p.get('ref_type')) f.ref_type = p.get('ref_type')
  const from = p.get('from'), to = p.get('to')
  if (from || to) { f.date = {}; if (from) f.date.$gte = new Date(from); if (to) f.date.$lte = new Date(to + 'T23:59:59.999Z') }
  const q = (p.get('q') || '').trim()
  if (q) f.$or = [{ id: q }, { ref_id: q }, { description: { $regex: q, $options: 'i' } }, { created_by: { $regex: q, $options: 'i' } }]
  let rows = await db.collection('journal_entries').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).skip(skip).limit(limit).toArray()
  rows = rows.map(j => {
    const d = +(j.lines || []).reduce((s, l) => s + num(l.debit), 0).toFixed(2)
    const c = +(j.lines || []).reduce((s, l) => s + num(l.credit), 0).toFixed(2)
    return {
      id: j.id, date: j.date, tenant_name: tn[j.tenant_id] || j.tenant_id, tenant_id: j.tenant_id,
      description: j.description, ref_type: j.ref_type || null, ref_id: j.ref_id || null,
      currency: j.currency, created_by: j.created_by || null,
      lines: j.lines || [], total_debit: d, total_credit: c, diff: +(d - c).toFixed(2),
    }
  })
  if (p.get('unbalanced') === '1') rows = rows.filter(r => Math.abs(r.diff) > 0.01)
  return { rows, limit, skip, read_only: true }
}

async function partyStatement(db, p) {
  const pid = p.get('party_id')
  if (!pid) return { error: 'party_id مطلوب' }
  const jes = await db.collection('journal_entries').find({ 'lines.party_id': pid }, { projection: { _id: 0 } }).sort({ date: 1 }).limit(300).toArray()
  const rows = [], totals = {}
  for (const j of jes) {
    for (const l of (j.lines || [])) {
      if (l.party_id !== pid) continue
      rows.push({ je_id: j.id, date: j.date, description: j.description, ref_type: j.ref_type || null, ref_id: j.ref_id || null, account_code: l.account_code, debit: num(l.debit), credit: num(l.credit), currency: j.currency })
      const c = j.currency || '?'
      totals[c] = totals[c] || { debit: 0, credit: 0 }
      totals[c].debit += num(l.debit); totals[c].credit += num(l.credit)
    }
  }
  for (const c of Object.keys(totals)) { totals[c].debit = +totals[c].debit.toFixed(2); totals[c].credit = +totals[c].credit.toFixed(2) }
  return { rows, totals, capped_at: 300, read_only: true }
}

async function coaStatus(db) {
  const tn = await tenantMap(db)
  const [settings, accAgg, cliMiss, supMiss, boxMiss, dupCodes] = await Promise.all([
    db.collection('tenant_settings').find({}, { projection: { tenant_id: 1, coa_version: 1 } }).toArray(),
    db.collection('accounts').aggregate([{ $group: { _id: '$tenant_id', total: { $sum: 1 }, groups: { $sum: { $cond: ['$is_group', 1, 0] } } } }]).toArray(),
    db.collection('clients').aggregate([{ $match: { $or: [{ account_code: { $exists: false } }, { account_code: null }, { account_code: '' }] } }, { $group: { _id: '$tenant_id', n: { $sum: 1 } } }]).toArray(),
    db.collection('suppliers').aggregate([{ $match: { $or: [{ account_code: { $exists: false } }, { account_code: null }, { account_code: '' }] } }, { $group: { _id: '$tenant_id', n: { $sum: 1 } } }]).toArray(),
    db.collection('boxes').aggregate([{ $match: { $or: [{ account_code: { $exists: false } }, { account_code: null }, { account_code: '' }] } }, { $group: { _id: '$tenant_id', n: { $sum: 1 } } }]).toArray(),
    db.collection('accounts').aggregate([{ $group: { _id: { t: '$tenant_id', c: '$code' }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $limit: 50 }]).toArray(),
  ])
  const verBy = Object.fromEntries(settings.map(s => [s.tenant_id, s.coa_version ?? null]))
  const accBy = Object.fromEntries(accAgg.map(a => [a._id, a]))
  const missBy = {}
  for (const [arr, key] of [[cliMiss, 'clients'], [supMiss, 'suppliers'], [boxMiss, 'boxes']]) {
    for (const r of arr) { missBy[r._id] = missBy[r._id] || {}; missBy[r._id][key] = r.n }
  }
  const tenants = Object.keys(tn).map(tid => ({
    tenant_id: tid, tenant_name: tn[tid],
    coa_version: verBy[tid] ?? null, is_v2: verBy[tid] === 2,
    accounts_total: accBy[tid]?.total || 0, groups: accBy[tid]?.groups || 0,
    postable: (accBy[tid]?.total || 0) - (accBy[tid]?.groups || 0),
    parties_without_account: missBy[tid] || {},
  }))
  return { tenants, duplicate_codes: dupCodes.map(d => ({ tenant: tn[d._id.t] || d._id.t, code: d._id.c, count: d.n })), read_only: true }
}

// -------------------- FINANCIAL HEALTH (per tenant, bounded, read-only) --------------------
async function healthChecks(db, p) {
  const T = p.get('tenant')
  if (!T) return { error: 'tenant مطلوب — الفحص يتم لكل مكتب على حدة (لضبط الحمل)' }
  const tf = { tenant_id: T }
  const CAP = 20
  const findings = []
  const add = (check, severity, items, note = null) => findings.push({ check, severity, count: items.length, items: items.slice(0, CAP), note })

  // 1) unbalanced journals
  const unb = await db.collection('journal_entries').aggregate([
    { $match: tf },
    { $project: { id: 1, date: 1, description: 1, d: { $sum: '$lines.debit' }, c: { $sum: '$lines.credit' } } },
    { $match: { $expr: { $gt: [{ $abs: { $subtract: ['$d', '$c'] } }, 0.01] } } }, { $limit: CAP },
  ]).toArray()
  add('قيود غير متوازنة', 'high', unb.map(j => ({ je: j.id, desc: j.description, diff: +(j.d - j.c).toFixed(2) })))

  // 2) vouchers without JE + 3) double posting per ref
  const [vIds, jeRefs] = await Promise.all([
    db.collection('vouchers').find(tf, { projection: { id: 1, type: 1, amount: 1, currency: 1 } }).limit(3000).toArray(),
    db.collection('journal_entries').find(tf, { projection: { ref_type: 1, ref_id: 1, id: 1 } }).limit(8000).toArray(),
  ])
  const jeByRef = {}
  for (const j of jeRefs) { if (!j.ref_id) continue; const k = `${j.ref_type}:${j.ref_id}`; jeByRef[k] = (jeByRef[k] || 0) + 1 }
  add('سندات بلا قيد', 'high', vIds.filter(v => !jeByRef[`voucher:${v.id}`]).map(v => ({ voucher: v.id, type: v.type, amount: v.amount, currency: v.currency })))
  add('ازدواج ترحيل (أكثر من قيد لنفس المرجع)', 'high', Object.entries(jeByRef).filter(([, n]) => n > 1).map(([k, n]) => ({ ref: k, journals: n })))

  // 4) JE without origin doc + ops without JE (tickets/visas/services)
  const opKinds = [['tickets', 'ticket'], ['visas', 'visa'], ['services', 'service'], ['package_bookings', 'package_booking']]
  const orphanJes = [], opsNoJe = []
  for (const [coll, refType] of opKinds) {
    const ops = await db.collection(coll).find(tf, { projection: { id: 1, is_refunded: 1 } }).limit(3000).toArray()
    const opSet = new Set(ops.map(o => o.id))
    for (const j of jeRefs) if (j.ref_type === refType && j.ref_id && !opSet.has(j.ref_id)) orphanJes.push({ je: j.id, ref: `${refType}:${j.ref_id}` })
    for (const o of ops) if (!o.is_refunded && !jeByRef[`${refType}:${o.id}`]) opsNoJe.push({ kind: refType, id: o.id })
  }
  add('قيود بلا عملية أصلية', 'medium', orphanJes)
  add('عمليات فعالة بلا قيد', 'high', opsNoJe)

  // 5) stored balance vs ledger (suspected only — sign conventions differ per party type)
  const balanceSuspects = []
  for (const coll of ['clients', 'suppliers']) {
    const recs = await db.collection(coll).find(tf, { projection: { id: 1, name: 1, balances: 1 } }).limit(500).toArray()
    const ids = recs.map(r => r.id)
    const led = ids.length ? await db.collection('journal_entries').aggregate([
      { $match: { ...tf, 'lines.party_id': { $in: ids } } }, { $unwind: '$lines' },
      { $match: { 'lines.party_id': { $in: ids } } },
      { $group: { _id: { p: '$lines.party_id', c: '$currency' }, d: { $sum: { $ifNull: ['$lines.debit', 0] } }, c2: { $sum: { $ifNull: ['$lines.credit', 0] } } } },
    ]).toArray() : []
    const ledBy = {}
    for (const l of led) { ledBy[l._id.p] = ledBy[l._id.p] || {}; ledBy[l._id.p][l._id.c || '?'] = +(l.d - l.c2).toFixed(2) }
    for (const r of recs) {
      for (const [cur, v] of Object.entries(r.balances || {})) {
        if (typeof v !== 'number' || Math.abs(v) < 0.01) continue
        const net = ledBy[r.id]?.[cur]
        if (net === undefined) { balanceSuspects.push({ kind: coll, name: r.name, currency: cur, stored: v, ledger: 0, note: 'رصيد مخزن بلا أي سطر قيد' }); continue }
        if (Math.abs(Math.abs(net) - Math.abs(v)) > 0.01) balanceSuspects.push({ kind: coll, name: r.name, currency: cur, stored: v, ledger: net })
      }
    }
  }
  add('اشتباه اختلاف الرصيد المخزن عن دفتر القيود', 'medium', balanceSuspects, 'مقارنة بالقيمة المطلقة لتحييد اختلاف اصطلاح الإشارة — للمراجعة اليدوية')

  // 6) postings on group accounts
  const groupCodes = (await db.collection('accounts').find({ ...tf, is_group: true }, { projection: { code: 1 } }).toArray()).map(a => a.code)
  const grpPost = groupCodes.length ? await db.collection('journal_entries').find({ ...tf, 'lines.account_code': { $in: groupCodes } }, { projection: { id: 1, description: 1, 'lines.account_code': 1 } }).limit(CAP).toArray() : []
  add('ترحيل على حسابات مجموعات', 'high', grpPost.map(j => ({ je: j.id, desc: j.description, codes: (j.lines || []).map(l => l.account_code).filter(c => groupCodes.includes(c)) })))

  // 7) parties/boxes without account_code
  const noCode = []
  for (const coll of ['clients', 'suppliers', 'boxes']) {
    const rs = await db.collection(coll).find({ ...tf, $or: [{ account_code: { $exists: false } }, { account_code: null }, { account_code: '' }] }, { projection: { name: 1, name_ar: 1 } }).limit(CAP).toArray()
    for (const r of rs) noCode.push({ kind: coll, name: r.name || r.name_ar })
  }
  add('أطراف بلا كود حساب فرعي (partyLeafCode)', 'medium', noCode)

  const deferred = ['Missing/Double reversal (يتطلب اصطلاح وسم عكس موحد)', 'اختلاف سعر الصرف بين العملية وقيدها (سعر الصرف غير مخزن على كل قيد)']
  return { tenant: T, findings, deferred_checks: deferred, generated_at: new Date(), read_only: true, note: 'كشف فقط — لا إصلاح تلقائي إطلاقاً' }
}

export async function adminCenterHandler(db, path, p) {
  switch (path) {
    case '/sales': return listSales(db, p)
    case '/sales-detail': return salesDetail(db, p)
    case '/vouchers': return listVouchers(db, p)
    case '/accounting/overview': return accountingOverview(db, p)
    case '/accounting/clients': return accountingParties(db, 'clients', p)
    case '/accounting/suppliers': return accountingParties(db, 'suppliers', p)
    case '/accounting/boxes': return accountingBoxes(db, p)
    case '/accounting/journal': return journalExplorer(db, p)
    case '/accounting/statement': return partyStatement(db, p)
    case '/accounting/coa-status': return coaStatus(db)
    case '/accounting/health': return healthChecks(db, p)
    default: return { error: 'مسار غير معروف', status: 404 }
  }
}
