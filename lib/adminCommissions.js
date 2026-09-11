// ============================================================================
// v3.94 — ADMIN COMMISSIONS CENTER (Super Admin Batch 2) — STRICTLY READ-ONLY.
// SINGLE SOURCE OF TRUTH: reuses the commission values ALREADY stored by the
// existing engines at operation time. NO second commission engine, NO
// recomputation of historical commissions, NO balance/ledger writes.
// Real sources in the system today:
//  1) partner   — commission_share_* fields written on tickets / visas /
//                 services / package_bookings by the sales engines (the rule
//                 mode+value is SNAPSHOTTED on the operation itself).
//  2) meraaj    — agent_commission_total on meraaj_inbound_bookings (B2B):
//                 buyer-agent commission computed from the package's
//                 market_pricing matrix at booking time (snapshotted).
//  3) affiliate — tenants.affiliate (USD) + cashout_requests history.
// Employee commissions: NOT implemented in the system — reported as a gap.
// Currencies are NEVER merged into one total.
// ============================================================================

const LIM = (v, d = 50, max = 100) => Math.min(Math.max(parseInt(v) || d, 1), max)
const num = (v) => Number(v) || 0

async function tenantMap(db) {
  const ts = await db.collection('tenants').find({}, { projection: { id: 1, name: 1 } }).toArray()
  return Object.fromEntries(ts.map(t => [t.id, t.name]))
}

const OPS = {
  tickets: { coll: 'tickets', label: 'تذكرة', refType: 'ticket', name: r => r.passenger_name },
  visas: { coll: 'visas', label: 'تأشيرة', refType: 'visa', name: r => r.passenger_name || r.beneficiary_name },
  services: { coll: 'services', label: 'خدمة', refType: 'service', name: r => r.beneficiary_name || r.service_type },
  bookings: { coll: 'package_bookings', label: 'حجز باكج', refType: 'package_booking', name: r => r.pilgrim_name },
}

// ---------- source 1: partner commission share (stored on the operation) ----------
function partnerRow(r, kind, tn) {
  const sale = r.sale_price ?? r.total_sale ?? null
  const cost = r.cost ?? r.total_cost ?? null
  const profitBefore = r.profit ?? r.commission ?? null // stored profit at op time — never recomputed
  const share = num(r.commission_share_amount)
  return {
    src: 'partner', id: r.id, kind, kind_label: OPS[kind].label,
    tenant_id: r.tenant_id, tenant_name: tn[r.tenant_id] || r.tenant_id, branch: r.branch_id || null,
    created_by: r.created_by || null,
    client_name: r.client_name || null, supplier_name: r.supplier_name || null, party: OPS[kind].name(r) || null,
    beneficiary: r.commission_partner_name || null, beneficiary_type: r.commission_partner_type || null,
    beneficiary_id: r.commission_partner_id || null,
    sale, cost, commission: share,
    rule_mode: r.commission_share_mode || 'amount', rule_value: r.commission_share_value ?? null,
    profit_before: profitBefore,
    profit_net: profitBefore == null ? null : +(profitBefore - share).toFixed(2), // display math on stored values only
    currency: r.currency || null, exchange_rate: r.exchange_rate ?? null,
    accrued_at: r.created_at || null, paid_at: null, // paid date is NOT tracked separately in the system (data gap)
    status: r.is_refunded ? 'reversed' : 'posted', // posted = share applied to partner balance at creation; reversed = op refunded (engine reversed it)
    op_status: r.is_refunded ? 'refunded' : (r.status || 'active'),
    updated_at: r.updated_at || null, updated_by: r.updated_by || null,
    refunded_at: r.refunded_at || null, refunded_by: r.refunded_by || null,
  }
}

function partnerFilter(p) {
  const f = { commission_share_amount: { $gt: 0 }, commission_partner_id: { $ne: null } }
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  if (p.get('currency')) f.currency = p.get('currency')
  const st = p.get('status')
  if (st === 'reversed') f.is_refunded = true
  else if (st === 'posted') f.is_refunded = { $ne: true }
  if (p.get('rule')) f.commission_share_mode = p.get('rule')
  const from = p.get('from'), to = p.get('to')
  if (from || to) { f.created_at = {}; if (from) f.created_at.$gte = new Date(from); if (to) f.created_at.$lte = new Date(to + 'T23:59:59.999Z') }
  const q = (p.get('q') || '').trim()
  if (q) f.$or = [
    { id: q }, { commission_partner_name: { $regex: q, $options: 'i' } },
    { client_name: { $regex: q, $options: 'i' } }, { supplier_name: { $regex: q, $options: 'i' } },
    { passenger_name: { $regex: q, $options: 'i' } }, { pilgrim_name: { $regex: q, $options: 'i' } },
    { created_by: { $regex: q, $options: 'i' } },
  ]
  return f
}

async function listPartner(db, p, tn) {
  const limit = LIM(p.get('limit')), skip = Math.max(parseInt(p.get('skip')) || 0, 0)
  const kind = p.get('kind') || 'all'
  const kinds = kind === 'all' ? Object.keys(OPS) : (OPS[kind] ? [kind] : [])
  if (!kinds.length) return { error: 'نوع غير معروف' }
  const f = partnerFilter(p)
  const batches = await Promise.all(kinds.map(k =>
    db.collection(OPS[k].coll).find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(limit + skip).toArray()
      .then(rows => rows.map(r => partnerRow(r, k, tn))).catch(() => [])
  ))
  let rows = batches.flat().sort((a, b) => new Date(b.accrued_at || 0) - new Date(a.accrued_at || 0)).slice(skip, skip + limit)
  const ids = rows.map(r => r.id)
  const [jes, vs] = await Promise.all([
    db.collection('journal_entries').find({ ref_id: { $in: ids } }, { projection: { ref_id: 1, id: 1 } }).toArray().catch(() => []),
    db.collection('vouchers').find({ ref_id: { $in: ids } }, { projection: { ref_id: 1, id: 1 } }).toArray().catch(() => []),
  ])
  const jeSet = new Set(jes.map(j => j.ref_id)), vSet = new Set(vs.map(v => v.ref_id))
  rows = rows.map(r => ({ ...r, has_je: jeSet.has(r.id), has_voucher: vSet.has(r.id) }))
  return { rows, limit, skip }
}

// ---------- source 2: Meraaj buyer-agent commissions (B2B) ----------
function meraajRow(r, tn) {
  return {
    src: 'meraaj', id: r.id, kind: 'meraaj', kind_label: 'معراج B2B',
    tenant_id: r.tenant_id, tenant_name: tn[r.tenant_id] || r.tenant_id,
    beneficiary: r.buyer_office_name || null, beneficiary_type: 'buyer_office',
    package_name: r.package_name || null, booking_ref: r.meraaj_booking_ref || null, booking_id: r.booking_id || null,
    sale: r.total_price ?? null, cost: null,
    commission: r.agent_commission_total ?? null, net_to_seller: r.net_to_seller_total ?? null,
    rule_mode: 'market_pricing', rule_value: null, // snapshotted per room+age in the package matrix
    profit_before: null, profit_net: null,
    currency: r.currency || null, exchange_rate: null,
    seats: r.seats || null, price_check: r.price_check || null,
    accrued_at: r.created_at || r.received_at || r.history?.[0]?.at || null, paid_at: null,
    status: r.status === 'new' ? 'pending' : (r.status || null), // pending | approved | cancelled
    cancellation_status: r.cancellation_status || null,
    op_status: r.status || null,
    updated_at: r.history?.length ? r.history[r.history.length - 1].at : null,
    updated_by: r.history?.length ? r.history[r.history.length - 1].actor : null,
  }
}

async function listMeraaj(db, p, tn) {
  const limit = LIM(p.get('limit')), skip = Math.max(parseInt(p.get('skip')) || 0, 0)
  const f = {}
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  if (p.get('currency')) f.currency = p.get('currency')
  const st = p.get('status')
  if (st === 'pending') f.status = 'new'
  else if (st) f.status = st
  const from = p.get('from'), to = p.get('to')
  if (from || to) { f.created_at = {}; if (from) f.created_at.$gte = new Date(from); if (to) f.created_at.$lte = new Date(to + 'T23:59:59.999Z') }
  const q = (p.get('q') || '').trim()
  if (q) f.$or = [{ id: q }, { meraaj_booking_ref: { $regex: q, $options: 'i' } }, { buyer_office_name: { $regex: q, $options: 'i' } }, { package_name: { $regex: q, $options: 'i' } }]
  const rows = await db.collection('meraaj_inbound_bookings').find(f, { projection: { _id: 0, registrants: 0 } }).sort({ created_at: -1 }).skip(skip).limit(limit).toArray()
  return { rows: rows.map(r => meraajRow(r, tn)), limit, skip }
}

// ---------- source 3: affiliate (USD) ----------
async function listAffiliate(db, p, tn) {
  const limit = LIM(p.get('limit')), skip = Math.max(parseInt(p.get('skip')) || 0, 0)
  const f = {}
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  if (p.get('status')) f.status = p.get('status')
  const from = p.get('from'), to = p.get('to')
  if (from || to) { f.created_at = {}; if (from) f.created_at.$gte = new Date(from); if (to) f.created_at.$lte = new Date(to + 'T23:59:59.999Z') }
  const q = (p.get('q') || '').trim()
  if (q) f.$or = [{ id: q }, { requested_by: { $regex: q, $options: 'i' } }, { 'payout_method_snapshot.account_name': { $regex: q, $options: 'i' } }]
  const rows = await db.collection('cashout_requests').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).skip(skip).limit(limit).toArray()
  return {
    rows: rows.map(r => ({
      src: 'affiliate', id: r.id, kind: 'cashout', kind_label: 'سحب عمولة أفلييت',
      tenant_id: r.tenant_id, tenant_name: tn[r.tenant_id] || r.tenant_id,
      beneficiary: r.payout_method_snapshot?.account_name || tn[r.tenant_id] || null, beneficiary_type: 'affiliate',
      commission: r.amount_usd ?? null, currency: 'USD',
      payout_method: r.payout_method_snapshot?.method_type || null, payout_provider: r.payout_method_snapshot?.provider || null,
      status: r.status || null, notes: r.notes || null,
      created_by: r.requested_by || null, accrued_at: r.created_at || null,
      paid_at: r.status === 'paid' ? (r.resolved_at || r.updated_at || null) : null,
    })),
    limit, skip,
  }
}

// ---------- overview KPIs (per currency, never merged) ----------
async function overview(db, p, consts) {
  const tf = p.get('tenant') ? { tenant_id: p.get('tenant') } : {}
  const partnerAgg = (coll) => db.collection(coll).aggregate([
    { $match: { ...tf, commission_share_amount: { $gt: 0 }, commission_partner_id: { $ne: null } } },
    { $group: { _id: { c: '$currency', rev: { $eq: ['$is_refunded', true] } }, total: { $sum: '$commission_share_amount' }, n: { $sum: 1 } } },
  ]).toArray().catch(() => [])
  const [tk, vi, sv, bk, mj, aff, co] = await Promise.all([
    partnerAgg('tickets'), partnerAgg('visas'), partnerAgg('services'), partnerAgg('package_bookings'),
    db.collection('meraaj_inbound_bookings').aggregate([
      { $match: tf },
      { $group: { _id: { c: '$currency', s: '$status' }, total: { $sum: { $ifNull: ['$agent_commission_total', 0] } }, net: { $sum: { $ifNull: ['$net_to_seller_total', 0] } }, n: { $sum: 1 } } },
    ]).toArray().catch(() => []),
    db.collection('tenants').aggregate([
      ...(p.get('tenant') ? [{ $match: { id: p.get('tenant') } }] : []),
      { $group: { _id: null, earned: { $sum: { $ifNull: ['$affiliate.total_earned_usd', 0] } }, balance: { $sum: { $ifNull: ['$affiliate.balance_usd', 0] } }, withdrawn: { $sum: { $ifNull: ['$affiliate.total_withdrawn_usd', 0] } }, reserved: { $sum: { $ifNull: ['$affiliate.reserved_usd', 0] } }, applied: { $sum: { $ifNull: ['$affiliate.total_applied_to_subscription_usd', 0] } } } },
    ]).toArray().catch(() => []),
    db.collection('cashout_requests').aggregate([{ $match: tf }, { $group: { _id: '$status', total: { $sum: { $ifNull: ['$amount_usd', 0] } }, n: { $sum: 1 } } }]).toArray().catch(() => []),
  ])
  const partner = {}
  for (const g of [...tk, ...vi, ...sv, ...bk]) {
    const c = g._id.c || '?', b = g._id.rev ? 'reversed' : 'posted'
    partner[c] = partner[c] || { posted: { total: 0, count: 0 }, reversed: { total: 0, count: 0 } }
    partner[c][b].total = +(partner[c][b].total + num(g.total)).toFixed(2)
    partner[c][b].count += g.n
  }
  const meraaj = {}
  for (const g of mj) {
    const c = g._id.c || '?', s = g._id.s === 'new' ? 'pending' : (g._id.s || '?')
    meraaj[c] = meraaj[c] || {}
    meraaj[c][s] = { total: +num(g.total).toFixed(2), net_to_seller: +num(g.net).toFixed(2), count: g.n }
  }
  const a = aff[0] || {}
  return {
    partner_shares: partner,
    meraaj_commissions: meraaj,
    affiliate_usd: {
      total_earned: +num(a.earned).toFixed(2), balance: +num(a.balance).toFixed(2),
      withdrawn: +num(a.withdrawn).toFixed(2), reserved: +num(a.reserved).toFixed(2),
      applied_to_subscription: +num(a.applied).toFixed(2),
      commission_rate: consts.affiliateRate,
      cashouts_by_status: Object.fromEntries(co.map(x => [x._id || '?', { total: +num(x.total).toFixed(2), count: x.n }])),
    },
    employee_commissions: null, // غير موجودة في النظام حالياً — فجوة موثقة، لا بيانات تقديرية
    read_only: true,
    note: 'كل الأرقام من القيم المخزنة وقت العملية — لكل عملة على حدة، بلا دمج ولا إعادة احتساب',
  }
}

// ---------- detail ----------
async function detail(db, p, tn) {
  const src = p.get('src'), id = p.get('id')
  if (!id) return { error: 'id مطلوب' }
  if (src === 'partner') {
    const kind = p.get('kind')
    const k = OPS[kind]
    if (!k) return { error: 'نوع غير معروف' }
    const doc = await db.collection(k.coll).findOne({ id }, { projection: { _id: 0 } })
    if (!doc) return { error: 'العملية غير موجودة', status: 404 }
    const T = doc.tenant_id
    const pcol = doc.commission_partner_type === 'supplier' ? 'suppliers' : 'clients'
    const [jes, vouchers, partner] = await Promise.all([
      db.collection('journal_entries').find({ tenant_id: T, ref_id: id }, { projection: { _id: 0 } }).sort({ created_at: 1 }).toArray(),
      db.collection('vouchers').find({ tenant_id: T, ref_id: id }, { projection: { _id: 0 } }).toArray().catch(() => []),
      doc.commission_partner_id ? db.collection(pcol).findOne({ tenant_id: T, id: doc.commission_partner_id }, { projection: { _id: 0, id: 1, name: 1, account_code: 1, phone: 1 } }) : null,
    ])
    const timeline = []
    if (doc.created_at) timeline.push({ at: doc.created_at, ev: 'إنشاء العملية + قيد العمولة على رصيد الشريك', by: doc.created_by || null })
    if (doc.updated_at) timeline.push({ at: doc.updated_at, ev: 'تعديل (المحرك يعكس ثم يعيد تطبيق حصة الشريك)', by: doc.updated_by || null })
    if (doc.refunded_at) timeline.push({ at: doc.refunded_at, ev: 'استرداد/إلغاء — عكس حصة الشريك ضمن قيد العكس', by: doc.refunded_by || null })
    return {
      row: partnerRow(doc, kind, tn), doc, partner, journal_entries: jes, vouchers, timeline,
      rule: {
        mode: doc.commission_share_mode || 'amount', value: doc.commission_share_value ?? null,
        basis: 'محفوظة على العملية وقت التنفيذ (Snapshot) — الأساس: ربح العملية المخزن',
        engine: 'محرك المبيعات القائم (tickets/visas/services/package_bookings) — لا محرك منفصل',
      },
      read_only: true,
    }
  }
  if (src === 'meraaj') {
    const doc = await db.collection('meraaj_inbound_bookings').findOne({ id }, { projection: { _id: 0 } })
    if (!doc) return { error: 'الحجز غير موجود', status: 404 }
    const [booking, jes] = await Promise.all([
      doc.booking_id ? db.collection('package_bookings').findOne({ id: doc.booking_id }, { projection: { _id: 0 } }) : null,
      doc.booking_id ? db.collection('journal_entries').find({ ref_id: doc.booking_id }, { projection: { _id: 0 } }).toArray() : [],
    ])
    return {
      row: meraajRow(doc, tn), doc, linked_booking: booking, journal_entries: jes,
      timeline: (doc.history || []).map(h => ({ at: h.at, ev: h.action, by: h.actor, note: h.note || null })),
      rule: { mode: 'market_pricing', basis: 'مصفوفة تسعير السوق (غرفة × فئة عمرية) المحفوظة على الباكج وقت الحجز — Snapshot على الحجز الوارد', engine: 'محرك معراج القائم' },
      read_only: true,
    }
  }
  if (src === 'affiliate') {
    const doc = await db.collection('cashout_requests').findOne({ id }, { projection: { _id: 0 } })
    if (!doc) return { error: 'الطلب غير موجود', status: 404 }
    const t = await db.collection('tenants').findOne({ id: doc.tenant_id }, { projection: { _id: 0, id: 1, name: 1, affiliate: 1, referral_stats: 1 } })
    return {
      doc, tenant: t ? { id: t.id, name: t.name, affiliate: t.affiliate || null, referral_stats: t.referral_stats || null } : null,
      timeline: [{ at: doc.created_at, ev: `طلب سحب (${doc.status})`, by: doc.requested_by || null }],
      rule: { mode: 'percent', basis: 'نسبة برنامج الأفلييت الثابتة تُضاف للرصيد عند تأكيد تفعيل مكتب مُحال', engine: 'وحدة الأفلييت القائمة' },
      read_only: true,
    }
  }
  return { error: 'src غير معروف' }
}

// ---------- rules (READ-ONLY view of EXISTING rule sources — no new engine) ----------
async function rules(db, consts) {
  const tn = await tenantMap(db)
  const [mkPkgs, indiv, modeAgg] = await Promise.all([
    db.collection('packages').find({ 'meraaj.shared': true }, { projection: { _id: 0, id: 1, tenant_id: 1, name: 1, currency: 1, 'meraaj.buyer_commission_mode': 1, 'meraaj.buyer_commission_value': 1, 'meraaj.buyer_commission_child_value': 1, 'meraaj.buyer_commission_infant_value': 1, 'meraaj.commission_direction': 1, 'meraaj.seats_allocated': 1, 'meraaj.seats_sold': 1, status: 1 } }).limit(200).toArray().catch(() => []),
    db.collection('tenants').countDocuments({ 'affiliate.is_individual': true }).catch(() => 0),
    Promise.all(['tickets', 'visas', 'services', 'package_bookings'].map(c =>
      db.collection(c).aggregate([
        { $match: { commission_share_amount: { $gt: 0 } } },
        { $group: { _id: '$commission_share_mode', n: { $sum: 1 } } },
      ]).toArray().catch(() => [])
    )),
  ])
  const partnerUsage = {}
  for (const g of modeAgg.flat()) { const m = g._id || 'amount'; partnerUsage[m] = (partnerUsage[m] || 0) + g.n }
  return {
    partner: {
      engine: 'per_operation_snapshot',
      note: 'لا يوجد محرك قواعد مركزي لعمولات الشركاء — القاعدة (ثابت/نسبة + القيمة) تُختار وتُحفظ على كل عملية وقت تنفيذها في وحدات البيع، وتغيير أي إعداد مستقبلي لا يمس العمولات التاريخية بحكم التصميم.',
      usage_by_mode: partnerUsage,
      decision_needed: 'إنشاء إدارة قواعد مركزية (Rules Engine) يتطلب قراراً — غير منفذ لمنع محرك عمولات ثانٍ',
    },
    meraaj_packages: mkPkgs.map(pk => ({
      package_id: pk.id, name: pk.name, tenant_name: tn[pk.tenant_id] || pk.tenant_id, currency: pk.currency, status: pk.status,
      mode: pk.meraaj?.buyer_commission_mode || 'amount', value: pk.meraaj?.buyer_commission_value ?? 0,
      child_value: pk.meraaj?.buyer_commission_child_value ?? null, infant_value: pk.meraaj?.buyer_commission_infant_value ?? null,
      direction: pk.meraaj?.commission_direction || 'deducted',
      seats: `${pk.meraaj?.seats_sold || 0}/${pk.meraaj?.seats_allocated || 0}`,
    })),
    meraaj_note: 'قاعدة عمولة الوكيل تُدار من محرر الباكج نفسه (المصدر القائم) وتُثبَّت على كل حجز وارد كـSnapshot — التعديل هنا غير متاح لمنع الازدواج.',
    affiliate: {
      commission_rate: consts.affiliateRate,
      min_cashout_individual_usd: consts.minCashoutIndividual,
      min_cashout_office_usd: consts.minCashoutOffice,
      individual_accounts: indiv,
      note: 'نسبة ثابتة معرفة في النظام (كود) — تعديلها قرار منتج وليس إعداداً تشغيلياً.',
    },
    read_only: true,
  }
}

export async function adminCommissionsHandler(db, path, p, consts) {
  const tn = await tenantMap(db)
  if (path === '/overview') return overview(db, p, consts)
  if (path === '/list') {
    const src = p.get('src') || 'partner'
    if (src === 'partner') return listPartner(db, p, tn)
    if (src === 'meraaj') return listMeraaj(db, p, tn)
    if (src === 'affiliate') return listAffiliate(db, p, tn)
    return { error: 'src غير معروف' }
  }
  if (path === '/detail') return detail(db, p, tn)
  if (path === '/rules') return rules(db, consts)
  return { error: 'مسار غير معروف', status: 404 }
}
