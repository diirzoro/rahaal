// ============================================================================
// v3.96 — ADMIN REPORTS CENTER (Super Admin Batch 4) — READ-ONLY, GET only.
// A unified catalog + runner. HONESTY RULES:
//  - Every number comes from the REAL stored data / the SAME formulas already
//    used by the office reports (reportTrialBalance / reportIncome /
//    reportProfits v3.88.4) or by reusing the Batch 1–3 admin handlers.
//  - No parallel totals collections, no estimates. Unavailable reports are
//    listed with the reason (never a misleading zero).
//  - Currencies are NEVER merged; historical ops keep their own snapshotted
//    exchange_rate (no recomputation at today's rate).
// ============================================================================
import { adminCenterHandler } from './adminCenter'
import { adminCommissionsHandler } from './adminCommissions'
import { adminRequestsHandler } from './adminRequests'
import { adminAuditHandler } from './adminAudit'
import { adminSystemHandler } from './adminSystem'
import { displayStatus } from './adminAds'
import { C as COA } from './coa'

const CURS = ['USD', 'SAR', 'YER']
// same business-TZ (UTC+3) day boundaries as the office reports (F-017/U-014)
const bizStart = (d) => new Date(`${d}T00:00:00.000+03:00`)
const bizEnd = (d) => new Date(`${d}T23:59:59.999+03:00`)
const todayISO = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10)
// string/Date-safe date filter (same approach as dateRangeExpr — $toDate covers both)
const dateExpr = (field, from, to) => ({ $expr: { $and: [{ $gte: [{ $toDate: `$${field}` }, from] }, { $lte: [{ $toDate: `$${field}` }, to] }] } })
const rangeOf = (p) => {
  const from = p.get('from') ? bizStart(p.get('from')) : new Date(0)
  const to = p.get('to') ? bizEnd(p.get('to')) : bizEnd(todayISO())
  return { from, to }
}

async function tenantMap(db) {
  const ts = await db.collection('tenants').find({}, { projection: { id: 1, name: 1 } }).toArray()
  return Object.fromEntries(ts.map(t => [t.id, t.name]))
}
const OPS4 = [['tickets', 'تذكرة'], ['visas', 'تأشيرة'], ['services', 'خدمة'], ['package_bookings', 'حجز باكج']]

// ---------------------------------------------------------------- CATALOG ----
export const REPORT_CATALOG = [
  {
    category: 'sales', label: '📈 تقارير المبيعات', reports: [
      { key: 'sales_ops', label: 'سجل المبيعات التفصيلي (تذاكر/تأشيرات/خدمات/باكجات)', params: ['tenant', 'kind', 'currency', 'status', 'from', 'to', 'q'], source: 'إعادة استخدام مركز المبيعات (Batch 1) — الحقول المخزنة على العمليات' },
      { key: 'sales_grouped', label: 'المبيعات مجمعة (مكتب/مستخدم/عميل/مورد/عملة/طريقة دفع/نوع)', params: ['dim', 'tenant', 'from', 'to'], source: 'تجميع مباشر من العمليات المخزنة — لكل عملة على حدة، الفعال والمسترد منفصلان' },
      { key: 'sales_refunded', label: 'الملغى والمسترد', params: ['tenant', 'from', 'to', 'currency'], source: 'العمليات is_refunded=true + سجلات refunds المنفذة' },
      { key: 'meraaj_sales', label: 'مبيعات معراج B2B', params: ['tenant', 'status', 'currency', 'from', 'to', 'q'], source: 'meraaj_inbound_bookings — القيم المثبتة وقت الحجز' },
      { key: 'profits_net', label: 'الأرباح الصافية (بعد استبعاد المسترد)', params: ['tenant', 'from', 'to'], source: 'نفس معادلة تقرير أرباح المكتب v3.88.4 (F-013) — profit المخزن، المسترد مستبعد' },
    ],
  },
  {
    category: 'vouchers', label: '🧾 تقارير السندات', reports: [
      { key: 'vouchers_list', label: 'سجل السندات (قبض/صرف)', params: ['tenant', 'vtype', 'currency', 'payment', 'from', 'to', 'q'], source: 'إعادة استخدام مركز السندات (Batch 1)' },
      { key: 'vouchers_grouped', label: 'السندات مجمعة (صندوق-بنك/طريقة دفع/نوع/مكتب)', params: ['dim', 'tenant', 'from', 'to'], source: 'تجميع مباشر من vouchers لكل عملة' },
      { key: 'vouchers_unlinked', label: 'السندات غير المرتبطة بعملية أصلية', params: ['tenant', 'from', 'to'], source: 'vouchers حيث ref_id فارغ (سندات يدوية)' },
    ],
  },
  {
    category: 'financial', label: '💰 التقارير المالية والمحاسبية', reports: [
      { key: 'journal_list', label: 'القيود اليومية', params: ['tenant', 'from', 'to', 'q'], source: 'إعادة استخدام مركز المحاسبة (Batch 1) — journal_entries' },
      { key: 'trial_balance', label: 'ميزان المراجعة (لكل مكتب)', params: ['tenant!'], source: 'نفس معادلة ميزان المكتب حرفياً — تجميع سطور القيود لكل حساب/عملة' },
      { key: 'ledger', label: 'دفتر الأستاذ (حساب محدد)', params: ['tenant!', 'account_code!', 'from', 'to'], source: 'سطور journal_entries للحساب — الرصيد تراكمي مدين-دائن لكل عملة' },
      { key: 'income_statement', label: 'الأرباح والخسائر (قائمة الدخل)', params: ['tenant!', 'from', 'to'], source: 'نفس معادلة المكتب v3.88.4 (F-012): إيرادات 4xxx دائن-مدين، مصروفات 5xxx مدين-دائن، استبعاد قيود الإقفال، فروق العملة 4104 منفصلة' },
      { key: 'balance_sheet', label: 'المركز المالي', available: false, reason: 'يتطلب معادلة موحدة للأرصدة الافتتاحية والإقفال عبر المكاتب — نقطة قرار (متاح داخل تقارير كل مكتب بمنطقه الخاص)' },
      { key: 'cash_flow', label: 'التدفقات النقدية', available: false, reason: 'لا يوجد تصنيف تدفقات (تشغيلي/استثماري/تمويلي) مخزن على القيود — البيانات الحالية لا تدعمه' },
      { key: 'boxes_balances', label: 'الصناديق والبنوك (أرصدة)', params: ['tenant'], source: 'إعادة استخدام مركز المحاسبة — أرصدة boxes المخزنة' },
      { key: 'parties_balances', label: 'أرصدة العملاء والموردين (المديونيات والمستحقات)', params: ['tenant', 'ptype'], source: 'إعادة استخدام مركز المحاسبة — أرصدة clients/suppliers المخزنة' },
      { key: 'accounting_health', label: 'القيود غير المتوازنة والعمليات غير المطابقة', params: ['tenant'], source: 'إعادة استخدام فحص السلامة المحاسبية (Batch 1)' },
    ],
  },
  {
    category: 'commissions', label: '💠 تقارير العمولات', reports: [
      { key: 'commissions_overview', label: 'ملخص العمولات (لكل عملة ومصدر)', params: ['tenant'], source: 'إعادة استخدام مركز العمولات (Batch 2) — القيم المثبتة وقت العملية' },
      { key: 'commissions_list', label: 'سجل العمولات (شركاء/معراج/أفلييت)', params: ['src', 'tenant', 'currency', 'status', 'from', 'to', 'q'], source: 'إعادة استخدام مركز العمولات — الربح قبل/بعد من القيم المخزنة' },
    ],
  },
  {
    category: 'offices', label: '🏢 تقارير المكاتب والاشتراكات', reports: [
      { key: 'offices_list', label: 'المكاتب (نشطة/متوقفة، الباقات، المستخدمون)', params: ['q'], source: 'tenants + عدّ users لكل مكتب — آخر استخدام غير متتبع (فجوة)' },
      { key: 'offices_growth', label: 'نمو المكاتب حسب الشهر', params: [], source: 'تجميع tenants.created_at شهرياً' },
      { key: 'subscriptions', label: 'الاشتراكات والأقساط (المتأخر والقادم)', params: ['q'], source: 'حقول billing/installments المخزنة على tenants — إن غابت تُعرض —' },
    ],
  },
  {
    category: 'requests', label: '📥 تقارير الطلبات', reports: [
      { key: 'requests_overview', label: 'ملخص الطلبات (حسب النوع والقوائم)', params: ['tenant'], source: 'إعادة استخدام مركز الطلبات (Batch 2)' },
      { key: 'requests_list', label: 'سجل الطلبات (متأخر/يحتاج إجراء/نِسَب)', params: ['type', 'tenant', 'status', 'needs_action', 'late', 'from', 'to', 'q'], source: 'إعادة استخدام مركز الطلبات — مدة الإنجاز للطلبات المغلقة غير مؤرخة تاريخياً (فجوة)' },
    ],
  },
  {
    category: 'disputes', label: '⚖️ تقارير النزاعات', reports: [
      { key: 'disputes_stats', label: 'إحصاءات النزاعات (حالة/أولوية/نوع/SLA/أثر مالي)', params: ['tenant', 'from', 'to'], source: 'مجموعة disputes (مركز النزاعات — هذه الدفعة) لكل عملة' },
      { key: 'disputes_list', label: 'سجل النزاعات', params: ['tenant', 'status', 'priority', 'from', 'to', 'q'], source: 'مجموعة disputes' },
    ],
  },
  {
    category: 'admin', label: '🛡️ تقارير الإدارة والأمان', reports: [
      { key: 'permissions_report', label: 'الصلاحيات والأدوار (المستخدمون حسب الدور)', params: ['tenant'], source: 'users + قوالب RBAC القائمة' },
      { key: 'audit_report', label: 'سجل التدقيق المركزي', params: ['category', 'actor', 'tenant', 'from', 'to', 'q'], source: 'إعادة استخدام المركز (Batch 3): audit_logs + je_audit + document_audit' },
      { key: 'backups_report', label: 'النسخ والاستعادة', params: [], source: 'admin_backups + admin_restore_requests' },
      { key: 'health_report', label: 'صحة النظام والتكاملات والأخطاء', params: [], source: 'إعادة استخدام فحص الصحة (Batch 3) — مصادر حقيقية فقط' },
      { key: 'announcements_report', label: 'الإعلانات والإشعارات', params: [], source: 'announcements + admin_notifications' },
      { key: 'fx_report', label: 'العملات وأسعار الصرف (الحالي والسجل)', params: ['tenant'], source: 'tenant_settings.rates (المصدر الفعلي) + fx_rate_history' },
    ],
  },
]

// ---------------------------------------------------------------- RUNNERS ----
const echoFilters = (p, keys) => Object.fromEntries(keys.map(k => [k, p.get(k) || null]).filter(([, v]) => v))

async function salesGrouped(db, p, tn) {
  const dim = p.get('dim') || 'tenant'
  const dimField = { tenant: '$tenant_id', user: '$created_by', client: '$client_name', supplier: '$supplier_name', currency: '$currency', payment: { $ifNull: ['$payment_method', '—'] } }[dim]
  const { from, to } = rangeOf(p)
  const base = { ...(p.get('tenant') ? { tenant_id: p.get('tenant') } : {}), ...dateExpr('date', from, to) }
  const out = {}
  for (const [coll, kindL] of OPS4) {
    const agg = await db.collection(coll).aggregate([
      { $match: base },
      { $group: { _id: { d: dim === 'kind' ? kindL : dimField, c: '$currency', ref: { $eq: ['$is_refunded', true] } }, sale: { $sum: { $ifNull: ['$sale_price', { $ifNull: ['$total_sale', 0] }] } }, cost: { $sum: { $ifNull: ['$cost', { $ifNull: ['$total_cost', 0] }] } }, profit: { $sum: { $ifNull: ['$profit', { $ifNull: ['$commission', 0] }] } }, n: { $sum: 1 } } },
    ]).toArray().catch(() => [])
    for (const g of agg) {
      const dv = dim === 'tenant' ? (tn[g._id.d] || g._id.d) : (g._id.d || '—')
      const key = `${dv}|${g._id.c}`
      out[key] = out[key] || { [dim === 'tenant' ? 'المكتب' : dim]: dv, dim: dv, currency: g._id.c, active_count: 0, active_sale: 0, active_cost: 0, active_profit: 0, refunded_count: 0, refunded_sale: 0 }
      const o = out[key]
      if (g._id.ref) { o.refunded_count += g.n; o.refunded_sale = +(o.refunded_sale + g.sale).toFixed(2) } else {
        o.active_count += g.n; o.active_sale = +(o.active_sale + g.sale).toFixed(2); o.active_cost = +(o.active_cost + g.cost).toFixed(2); o.active_profit = +(o.active_profit + g.profit).toFixed(2)
      }
    }
  }
  const rows = Object.values(out).map(({ dim: d, ...r }) => ({ البند: d, ...r })).sort((a, b) => b.active_sale - a.active_sale)
  return { rows, columns: [['البند', 'البند'], ['currency', 'العملة'], ['active_count', 'عمليات فعالة'], ['active_sale', 'البيع'], ['active_cost', 'التكلفة'], ['active_profit', 'الربح'], ['refunded_count', 'مسترد (عدد)'], ['refunded_sale', 'مسترد (بيع)']] }
}

async function salesRefunded(db, p, tn) {
  const { from, to } = rangeOf(p)
  const f = { is_refunded: true, ...(p.get('tenant') ? { tenant_id: p.get('tenant') } : {}), ...(p.get('currency') ? { currency: p.get('currency') } : {}), ...dateExpr('date', from, to) }
  const rows = []
  for (const [coll, kindL] of OPS4) {
    const docs = await db.collection(coll).find(f, { projection: { _id: 0 } }).sort({ refunded_at: -1 }).limit(300).toArray().catch(() => [])
    for (const r of docs) rows.push({ id: r.id, kind: kindL, tenant: tn[r.tenant_id] || r.tenant_id, client: r.client_name || r.pilgrim_name || '—', sale: r.sale_price ?? r.total_sale, cost: r.cost ?? r.total_cost, currency: r.currency, refunded_at: r.refunded_at, refunded_by: r.refunded_by || '—' })
  }
  const refunds = await db.collection('refunds').find({ ...(p.get('tenant') ? { tenant_id: p.get('tenant') } : {}) }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(300).toArray().catch(() => [])
  const totals = {}
  for (const r of rows) { totals[r.currency] = totals[r.currency] || { count: 0, sale: 0 }; totals[r.currency].count++; totals[r.currency].sale = +(totals[r.currency].sale + (r.sale || 0)).toFixed(2) }
  return { rows: rows.sort((a, b) => new Date(b.refunded_at || 0) - new Date(a.refunded_at || 0)), refund_records: refunds.map(r => ({ id: r.id, tenant: tn[r.tenant_id] || r.tenant_id, ref_type: r.ref_type, refund_to_client: r.refund_to_client, supplier_penalty: r.supplier_penalty, office_fee: r.office_fee, currency: r.currency, at: r.created_at, by: r.created_by })), totals }
}

// EXACT copy of the office reportTrialBalance formula (journal_entries grouping)
async function trialBalance(db, p) {
  const T = p.get('tenant')
  if (!T) return { error: 'اختر المكتب — ميزان المراجعة لكل مكتب على حدة' }
  const jes = await db.collection('journal_entries').find({ tenant_id: T }).toArray()
  const map = {}
  for (const je of jes) {
    for (const l of je.lines || []) {
      const cur = l.currency || je.currency
      const label = l.party_name || l.account_name
      const key = `${l.account_code}|${cur}|${label}`
      if (!map[key]) map[key] = { code: l.account_code, name: l.account_name, party_name: l.party_name || '', currency: cur, debit: 0, credit: 0 }
      map[key].debit += l.debit || 0; map[key].credit += l.credit || 0
    }
  }
  const rows = Object.values(map).map(r => ({ ...r, debit: +r.debit.toFixed(2), credit: +r.credit.toFixed(2), balance: +(r.debit - r.credit).toFixed(2) })).sort((a, b) => String(a.code).localeCompare(String(b.code)))
  const totals = {}
  for (const r of rows) { totals[r.currency] = totals[r.currency] || { d: 0, c: 0 }; totals[r.currency].d = +(totals[r.currency].d + r.debit).toFixed(2); totals[r.currency].c = +(totals[r.currency].c + r.credit).toFixed(2) }
  return { rows, totals, columns: [['code', 'الحساب'], ['name', 'الاسم'], ['party_name', 'الطرف'], ['currency', 'العملة'], ['debit', 'مدين'], ['credit', 'دائن'], ['balance', 'الرصيد']] }
}

async function ledger(db, p) {
  const T = p.get('tenant'), code = p.get('account_code')
  if (!T || !code) return { error: 'المكتب ورقم الحساب مطلوبان' }
  const { from, to } = rangeOf(p)
  const jes = await db.collection('journal_entries').find({ tenant_id: T, 'lines.account_code': code, ...dateExpr('date', from, to) }).sort({ date: 1, created_at: 1 }).limit(1500).toArray()
  const rows = []
  const running = {}
  for (const je of jes) {
    for (const l of je.lines || []) {
      if (l.account_code !== code) continue
      const cur = l.currency || je.currency
      running[cur] = +((running[cur] || 0) + (l.debit || 0) - (l.credit || 0)).toFixed(2)
      rows.push({ date: je.date, je_id: je.id, description: je.description, ref_type: je.ref_type || '—', party: l.party_name || '—', currency: cur, debit: l.debit || 0, credit: l.credit || 0, running_balance: running[cur] })
    }
  }
  return { rows, running_balances: running, columns: [['date', 'التاريخ'], ['je_id', 'القيد'], ['description', 'البيان'], ['ref_type', 'المرجع'], ['party', 'الطرف'], ['currency', 'العملة'], ['debit', 'مدين'], ['credit', 'دائن'], ['running_balance', 'الرصيد التراكمي']] }
}

// EXACT copy of the office reportIncome formula (v3.88.4 F-012)
async function incomeStatement(db, p) {
  const T = p.get('tenant')
  if (!T) return { error: 'اختر المكتب — قائمة الدخل لكل مكتب على حدة' }
  const { from, to } = rangeOf(p)
  const jes = await db.collection('journal_entries').find({ tenant_id: T, ref_type: { $ne: 'year_close' }, ...dateExpr('date', from, to) }).toArray()
  const zero = () => ({ USD: 0, SAR: 0, YER: 0 })
  const rev = { tickets: zero(), visas: zero(), services: zero(), other: zero() }
  const exp = zero()
  const expenseAccounts = {}
  let fx_gain_base = 0
  for (const je of jes) {
    for (const l of je.lines || []) {
      const code = String(l.account_code || '')
      if (code === COA.FX_PNL) { fx_gain_base += (l.credit || 0) - (l.debit || 0); continue }
      const cur = l.currency || je.currency
      if (!CURS.includes(cur)) continue
      if (code.startsWith('4')) {
        const net = (l.credit || 0) - (l.debit || 0)
        const bucket = code === COA.REV_TICKETS ? 'tickets' : code === COA.REV_VISAS ? 'visas' : code === COA.REV_SERVICES ? 'services' : 'other'
        rev[bucket][cur] += net
      } else if (code.startsWith('5')) {
        const net = (l.debit || 0) - (l.credit || 0)
        exp[cur] += net
        if (!expenseAccounts[code]) expenseAccounts[code] = { code, name: l.account_name || code, USD: 0, SAR: 0, YER: 0 }
        expenseAccounts[code][cur] = +(expenseAccounts[code][cur] + net).toFixed(2)
      }
    }
  }
  for (const bkt of Object.values(rev)) for (const c of CURS) bkt[c] = +bkt[c].toFixed(2)
  for (const c of CURS) exp[c] = +exp[c].toFixed(2)
  const totalRev = zero(), net = zero()
  for (const c of CURS) { totalRev[c] = +(rev.tickets[c] + rev.visas[c] + rev.services[c] + rev.other[c]).toFixed(2); net[c] = +(totalRev[c] - exp[c]).toFixed(2) }
  return { revenue: rev, total_revenue: totalRev, expenses: exp, expense_accounts: Object.values(expenseAccounts).sort((a, b) => a.code.localeCompare(b.code)), fx_gain_base_yer: +fx_gain_base.toFixed(2), net_profit: net, note: 'قيود الإقفال السنوية مستبعدة — فروق العملة (4104) معروضة منفصلة بالعملة الأساس' }
}

// EXACT copy of the office reportProfits formula (F-013: refunded excluded)
async function profitsNet(db, p, tn) {
  const { from, to } = rangeOf(p)
  const tf = { is_refunded: { $ne: true }, ...(p.get('tenant') ? { tenant_id: p.get('tenant') } : {}), ...dateExpr('date', from, to) }
  const [tickets, visas, services] = await Promise.all([
    db.collection('tickets').find(tf).sort({ date: 1 }).limit(1000).toArray(),
    db.collection('visas').find(tf).sort({ date: 1 }).limit(1000).toArray(),
    db.collection('services').find(tf).sort({ date: 1 }).limit(1000).toArray(),
  ])
  const rows = [
    ...tickets.map(t => ({ id: t.id, kind: 'تذكرة', tenant: tn[t.tenant_id] || t.tenant_id, date: t.date, client: t.client_name, supplier: t.supplier_name, ref: t.pnr || t.route, currency: t.currency, cost: t.cost, sale: t.sale_price, profit: t.commission })),
    ...visas.map(v => ({ id: v.id, kind: v.service_type, tenant: tn[v.tenant_id] || v.tenant_id, date: v.date, client: v.client_name, supplier: v.supplier_name, ref: v.passenger_name || v.passport_no, currency: v.currency, cost: v.cost, sale: v.sale_price, profit: v.commission })),
    ...services.map(s => ({ id: s.id, kind: s.service_type, tenant: tn[s.tenant_id] || s.tenant_id, date: s.date, client: s.client_name, supplier: s.supplier_name, ref: s.beneficiary_name || s.reference_no, currency: s.currency, cost: s.cost, sale: s.sale_price, profit: s.commission })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))
  const totals_profit = {}, totals_sales = {}
  for (const r of rows) { totals_profit[r.currency] = +((totals_profit[r.currency] || 0) + (r.profit || 0)).toFixed(2); totals_sales[r.currency] = +((totals_sales[r.currency] || 0) + (r.sale || 0)).toFixed(2) }
  return { rows, totals_profit, totals_sales, note: 'المسترد/الملغى مستبعد (نفس معادلة المكتب F-013) — حجوزات الباكجات لها تقرير المبيعات المجمع' }
}

async function vouchersGrouped(db, p, tn) {
  const dim = p.get('dim') || 'box'
  const dimField = { box: { $ifNull: ['$box_name', '$box_id'] }, payment: { $ifNull: ['$payment_method', '—'] }, type: '$type', tenant: '$tenant_id' }[dim] || '$type'
  const { from, to } = rangeOf(p)
  const f = { ...(p.get('tenant') ? { tenant_id: p.get('tenant') } : {}), ...dateExpr('date', from, to) }
  const agg = await db.collection('vouchers').aggregate([
    { $match: f },
    { $group: { _id: { d: dimField, c: '$currency', t: '$type' }, total: { $sum: { $ifNull: ['$amount', 0] } }, n: { $sum: 1 } } },
  ]).toArray().catch(() => [])
  const rows = agg.map(g => ({ البند: dim === 'tenant' ? (tn[g._id.d] || g._id.d) : (g._id.d || '—'), النوع: g._id.t === 'receipt' ? 'قبض' : 'صرف', currency: g._id.c, count: g.n, total: +g.total.toFixed(2) })).sort((a, b) => b.total - a.total)
  return { rows, columns: [['البند', 'البند'], ['النوع', 'النوع'], ['currency', 'العملة'], ['count', 'العدد'], ['total', 'الإجمالي']] }
}

async function vouchersUnlinked(db, p, tn) {
  const { from, to } = rangeOf(p)
  const f = { $or: [{ ref_id: null }, { ref_id: { $exists: false } }, { ref_id: '' }], ...(p.get('tenant') ? { tenant_id: p.get('tenant') } : {}), ...dateExpr('date', from, to) }
  const rows = await db.collection('vouchers').find(f, { projection: { _id: 0 } }).sort({ date: -1 }).limit(500).toArray()
  return { rows: rows.map(v => ({ id: v.id, tenant: tn[v.tenant_id] || v.tenant_id, type: v.type === 'receipt' ? 'قبض' : 'صرف', party: v.party_name || '—', amount: v.amount, currency: v.currency, box: v.box_name || v.box_id || '—', payment: v.payment_method || '—', date: v.date, by: v.created_by })), note: 'سندات يدوية بلا عملية أصلية — طبيعية للقبض/الصرف المباشر، وتُراجع عند التدقيق' }
}

async function officesList(db, p) {
  const q = (p.get('q') || '').trim()
  const f = q ? { name: { $regex: q, $options: 'i' } } : {}
  const ts = await db.collection('tenants').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(300).toArray()
  const users = await db.collection('users').aggregate([{ $group: { _id: '$tenant_id', n: { $sum: 1 }, active: { $sum: { $cond: [{ $ne: ['$active', false] }, 1, 0] } } } }]).toArray()
  const uMap = Object.fromEntries(users.map(u => [u._id, u]))
  const rows = ts.map(t => ({
    name: t.name, status: t.status === 'suspended' ? 'موقوف' : 'نشط',
    plan: t.subscription || t.plan || '—', billing: t.billing_mode || '—',
    activated: t.activation_confirmed ? 'مفعّل' : 'غير مفعّل',
    users: uMap[t.id]?.n || 0, active_users: uMap[t.id]?.active || 0,
    verified: t.verification_status || '—',
    created_at: t.created_at, last_activity: '— (غير متتبع)',
  }))
  return { rows, columns: [['name', 'المكتب'], ['status', 'الحالة'], ['plan', 'الباقة'], ['billing', 'الفوترة'], ['activated', 'التفعيل'], ['users', 'المستخدمون'], ['active_users', 'نشطون'], ['created_at', 'الإنشاء'], ['last_activity', 'آخر استخدام']], note: 'آخر استخدام غير متتبع في النظام — فجوة موثقة' }
}

async function officesGrowth(db) {
  const ts = await db.collection('tenants').find({}, { projection: { created_at: 1 } }).toArray()
  const byMonth = {}
  for (const t of ts) { const m = t.created_at ? new Date(t.created_at).toISOString().slice(0, 7) : '—'; byMonth[m] = (byMonth[m] || 0) + 1 }
  let cum = 0
  const rows = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([m, n]) => { cum += n; return { month: m, new_offices: n, cumulative: cum } })
  return { rows, columns: [['month', 'الشهر'], ['new_offices', 'مكاتب جديدة'], ['cumulative', 'تراكمي']] }
}

async function subscriptions(db, p) {
  const ts = await db.collection('tenants').find({}, { projection: { _id: 0 } }).limit(300).toArray()
  const today = new Date()
  const rows = ts.map(t => {
    const inst = Array.isArray(t.installments) ? t.installments : null
    let next_due = null, overdue = null
    if (inst) {
      const unpaid = inst.filter(i => !i.paid && i.due_date)
      next_due = unpaid.map(i => i.due_date).sort()[0] || null
      overdue = unpaid.filter(i => new Date(i.due_date) < today).length
    }
    return { name: t.name, plan: t.subscription || '—', billing: t.billing_mode || '—', activated: t.activation_confirmed ? 'مفعّل' : 'غير مفعّل', installments: inst ? inst.length : '—', overdue: inst ? overdue : '—', next_due: next_due || '—', status: t.status === 'suspended' ? 'موقوف' : 'نشط' }
  })
  return { rows, columns: [['name', 'المكتب'], ['plan', 'الباقة'], ['billing', 'الفوترة'], ['activated', 'التفعيل'], ['installments', 'الأقساط'], ['overdue', 'متأخر'], ['next_due', 'الاستحقاق القادم'], ['status', 'الحالة']], note: 'تواريخ انتهاء الاشتراك المستقلة غير مخزنة كحقل موحد — المتاح: الأقساط حيث وجدت، وغيرها —' }
}

async function disputesStats(db, p, tn) {
  const f = p.get('tenant') ? { tenant_id: p.get('tenant') } : {}
  const rows = await db.collection('disputes').find(f, { projection: { _id: 0, timeline: 0 } }).limit(2000).toArray().catch(() => [])
  if (!rows.length) return { rows: [], summary: null, note: 'لا نزاعات مسجلة بعد — الأرقام ستظهر مع أول نزاع حقيقي' }
  const byStatus = {}, byPriority = {}, byType = {}, impact = {}
  let resolvedHours = [], slaOverdue = 0
  for (const d of rows) {
    byStatus[d.status] = (byStatus[d.status] || 0) + 1
    byPriority[d.priority] = (byPriority[d.priority] || 0) + 1
    byType[d.type] = (byType[d.type] || 0) + 1
    if (d.sla_due && !['resolved', 'rejected', 'closed'].includes(d.status) && new Date(d.sla_due) < new Date()) slaOverdue++
    if (d.resolved_at && d.created_at) resolvedHours.push((new Date(d.resolved_at) - new Date(d.created_at)) / 36e5)
    if (d.decision?.financial_impact?.amount) { const c = d.decision.financial_impact.currency || d.currency || '?'; impact[c] = +((impact[c] || 0) + d.decision.financial_impact.amount).toFixed(2) }
  }
  return {
    summary: {
      total: rows.length, by_status: byStatus, by_priority: byPriority, by_type: byType,
      sla_overdue: slaOverdue,
      avg_resolution_hours: resolvedHours.length ? +(resolvedHours.reduce((a, b) => a + b, 0) / resolvedHours.length).toFixed(1) : null,
      financial_impact_by_currency: impact,
    },
    rows: rows.slice(0, 200).map(d => ({ id: d.id, tenant: tn[d.tenant_id] || d.tenant_id, type: d.type, status: d.status, priority: d.priority, amount: d.amount, currency: d.currency, created_at: d.created_at, resolved_at: d.resolved_at || '—' })),
  }
}

async function permissionsReport(db, p) {
  const f = p.get('tenant') ? { tenant_id: p.get('tenant') } : {}
  const agg = await db.collection('users').aggregate([
    { $match: f },
    { $group: { _id: { t: '$tenant_id', r: '$role', rk: { $ifNull: ['$role_key', '—'] } }, n: { $sum: 1 } } },
  ]).toArray()
  const tn = await tenantMap(db)
  const custom = await db.collection('admin_role_templates').find({}, { projection: { _id: 0, key: 1, label: 1, active: 1 } }).toArray().catch(() => [])
  const permAudit = await db.collection('audit_logs').countDocuments({ category: 'permissions' })
  return {
    rows: agg.map(g => ({ tenant: g._id.t === null ? '— (إداري)' : (tn[g._id.t] || g._id.t), role: g._id.r, template: g._id.rk, count: g.n })).sort((a, b) => b.count - a.count),
    custom_templates: custom, permission_changes_audited: permAudit,
    columns: [['tenant', 'المكتب'], ['role', 'الدور'], ['template', 'القالب'], ['count', 'العدد']],
  }
}

async function backupsReport(db) {
  const [bks, rst] = await Promise.all([
    db.collection('admin_backups').find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(200).toArray(),
    db.collection('admin_restore_requests').find({}, { projection: { _id: 0, preview: 0, steps: 0 } }).sort({ created_at: -1 }).limit(100).toArray(),
  ])
  return { rows: bks.map(b => ({ type: b.type, scope: b.tenant_name || 'المنظومة', status: b.status, size_kb: b.size_bytes ? Math.round(b.size_bytes / 1024) : '—', by: b.created_by, at: b.created_at, reason: b.reason })), restore_requests: rst, columns: [['type', 'النوع'], ['scope', 'النطاق'], ['status', 'الحالة'], ['size_kb', 'الحجم KB'], ['by', 'المنشئ'], ['at', 'التاريخ'], ['reason', 'السبب']] }
}

async function announcementsReport(db) {
  const [anns, notifs] = await Promise.all([
    db.collection('announcements').find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(200).toArray(),
    db.collection('admin_notifications').aggregate([{ $group: { _id: { t: '$type', p: '$priority' }, n: { $sum: 1 } } }]).toArray().catch(() => []),
  ])
  const now = new Date()
  return {
    rows: anns.map(a => ({ title: a.title, type: a.type, status: displayStatus(a, now), priority: a.priority || 0, audience: a.audience?.mode || 'all', by: a.created_by, at: a.created_at })),
    notifications_summary: notifs.map(g => ({ type: g._id.t, priority: g._id.p, count: g.n })),
    columns: [['title', 'العنوان'], ['type', 'النوع'], ['status', 'الحالة'], ['priority', 'الأولوية'], ['audience', 'الجمهور'], ['by', 'المنشئ'], ['at', 'التاريخ']],
  }
}

async function fxReport(db, p, tn, ctx) {
  const f = p.get('tenant') ? { tenant_id: p.get('tenant') } : {}
  const settings = await db.collection('tenant_settings').find({ ...f, rates: { $exists: true } }, { projection: { _id: 0, tenant_id: 1, rates: 1, updated_at: 1 } }).limit(300).toArray()
  const hist = await db.collection('fx_rate_history').find(f, { projection: { _id: 0 } }).sort({ effective_from: -1 }).limit(200).toArray().catch(() => [])
  return {
    rows: settings.map(s => ({ tenant: tn[s.tenant_id] || s.tenant_id, ...Object.fromEntries(Object.entries(s.rates || {}).map(([c, r]) => [c, typeof r === 'object' ? `شراء ${r.buy ?? '—'} / تحويل ${r.transfer ?? '—'} / بيع ${r.sell ?? '—'}` : r])), updated_at: s.updated_at || '—' })),
    defaults: ctx.defaultRates, base_currency: ctx.baseCurrency, history: hist,
    note: 'المصدر الفعلي الوحيد: tenant_settings.rates لكل مكتب (تُستهلك في التقارير والتحويلات) — العمليات التاريخية تحتفظ بسعرها المثبت ولا يعاد احتسابها',
  }
}

// ---------------------------------------------------------------- HANDLER ----
export async function adminReportsHandler(db, path, p, ctx) {
  if (path === '/catalog') {
    return { catalog: REPORT_CATALOG, generated_at: new Date(), permissions_note: 'كل التقارير تحت حارس super_admin (واجهة + API) — صلاحيات فرعية متعددة المستويات تتطلب أكثر من دور إداري واحد (نقطة قرار موثقة)' }
  }
  if (path !== '/run') return { error: 'مسار غير معروف', status: 404 }
  const key = p.get('key')
  const entry = REPORT_CATALOG.flatMap(c => c.reports).find(r => r.key === key)
  if (!entry) return { error: 'تقرير غير معروف', status: 404 }
  if (entry.available === false) return { error: `التقرير غير متوفر: ${entry.reason}`, status: 422 }
  const tn = await tenantMap(db)
  let data
  const reuseCenter = (sub) => adminCenterHandler(db, sub, p)
  switch (key) {
    case 'sales_ops': data = await reuseCenter('/center/sales'); break
    case 'sales_grouped': data = await salesGrouped(db, p, tn); break
    case 'sales_refunded': data = await salesRefunded(db, p, tn); break
    case 'meraaj_sales': data = await adminCommissionsHandler(db, '/list', new URLSearchParams([...p.entries(), ['src', 'meraaj']]), ctx.commConsts); break
    case 'profits_net': data = await profitsNet(db, p, tn); break
    case 'vouchers_list': data = await reuseCenter('/center/vouchers'); break
    case 'vouchers_grouped': data = await vouchersGrouped(db, p, tn); break
    case 'vouchers_unlinked': data = await vouchersUnlinked(db, p, tn); break
    case 'journal_list': data = await reuseCenter('/center/accounting/journal'); break
    case 'trial_balance': data = await trialBalance(db, p); break
    case 'ledger': data = await ledger(db, p); break
    case 'income_statement': data = await incomeStatement(db, p); break
    case 'boxes_balances': data = await reuseCenter('/center/accounting/boxes'); break
    case 'parties_balances': data = await reuseCenter('/center/accounting/parties'); break
    case 'accounting_health': data = await reuseCenter('/center/accounting/health'); break
    case 'commissions_overview': data = await adminCommissionsHandler(db, '/overview', p, ctx.commConsts); break
    case 'commissions_list': data = await adminCommissionsHandler(db, '/list', p, ctx.commConsts); break
    case 'offices_list': data = await officesList(db, p); break
    case 'offices_growth': data = await officesGrowth(db); break
    case 'subscriptions': data = await subscriptions(db, p); break
    case 'requests_overview': data = await adminRequestsHandler(db, '/overview', p); break
    case 'requests_list': data = await adminRequestsHandler(db, '/list', p); break
    case 'disputes_stats': data = await disputesStats(db, p, tn); break
    case 'disputes_list': {
      const f = {}
      if (p.get('tenant')) f.tenant_id = p.get('tenant')
      if (p.get('status')) f.status = p.get('status')
      if (p.get('priority')) f.priority = p.get('priority')
      const rows = await db.collection('disputes').find(f, { projection: { _id: 0, timeline: 0 } }).sort({ created_at: -1 }).limit(300).toArray().catch(() => [])
      data = { rows: rows.map(d => ({ id: d.id, tenant: tn[d.tenant_id] || d.tenant_id, type: d.type, reason: d.reason, status: d.status, priority: d.priority, amount: d.amount ?? '—', currency: d.currency || '—', assignee: d.assignee || '—', created_at: d.created_at })) }
      break
    }
    case 'permissions_report': data = await permissionsReport(db, p); break
    case 'audit_report': data = await adminAuditHandler(db, '/list', p, ctx); break
    case 'backups_report': data = await backupsReport(db); break
    case 'health_report': data = await adminAuditHandler(db, '/health', p, ctx); break
    case 'announcements_report': data = await announcementsReport(db); break
    case 'fx_report': data = await fxReport(db, p, tn, ctx); break
    default: return { error: 'تقرير غير معروف', status: 404 }
  }
  if (data?.error) return data
  return {
    key, label: entry.label, source: entry.source,
    generated_at: new Date(),
    filters_used: echoFilters(p, ['tenant', 'from', 'to', 'currency', 'q', 'dim', 'src', 'type', 'status', 'kind', 'vtype', 'payment', 'account_code', 'ptype', 'category', 'actor', 'priority', 'needs_action', 'late']),
    currency_note: 'الإجماليات لكل عملة على حدة — لا دمج بين العملات، والعمليات التاريخية بسعر صرفها المثبت',
    ...data,
  }
}
