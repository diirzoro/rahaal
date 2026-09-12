// ============================================================================
// v3.96 — ADMIN CURRENCIES & LOCAL FX (Super Admin Batch 4).
// SINGLE SOURCE REUSE — no duplicate rate source:
//  - Operational currencies = the code constant CURRENCIES (USD/SAR/YER) with
//    base = YER. The engine validates against it; a registry entry alone does
//    NOT make a currency operational (honest flag + decision point).
//  - FX rates = tenant_settings.rates per office (THE source consumed by the
//    app: reports, statements, conversions). This center edits THAT source
//    with the SAME bounds validation as the office endpoint (min≤buy≤transfer
//    ≤sell≤max), and adds VERSIONED history (fx_rate_history) + audit.
//  - Historical operations keep their snapshotted exchange_rate — new rates
//    are never applied retroactively (the ops engine already snapshots).
//  - Overlap safety: the live source is one current snapshot per office —
//    versions are strictly sequential (effective_from = change time), so two
//    conflicting active rates for the same scope/period cannot exist.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import { emitAdminNotification } from './adminNotify'

async function logAudit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'currency', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* never break */ }
}

// EXACT same bounds validation as the office POST /rates (F-003)
function validateRates(rates) {
  for (const [ccy, r] of Object.entries(rates || {})) {
    if (!r || typeof r !== 'object') continue
    const named = [['الحد الأدنى', Number(r.min)], ['الشراء', Number(r.buy)], ['التحويل', Number(r.transfer)], ['البيع', Number(r.sell)], ['الحد الأعلى', Number(r.max)]]
    if (named.some(([, v]) => Number.isFinite(v) && v < 0)) return `أسعار ${ccy}: لا تُقبل قيم سالبة`
    const seq = named.filter(([, v]) => Number.isFinite(v) && v > 0)
    for (let i = 1; i < seq.length; i++) {
      if (seq[i][1] < seq[i - 1][1]) return `أسعار ${ccy} غير متسقة: ${seq[i - 1][0]} (${seq[i - 1][1]}) أكبر من ${seq[i][0]} (${seq[i][1]}) — الترتيب: أدنى ≤ شراء ≤ تحويل ≤ بيع ≤ أعلى`
    }
  }
  return null
}

const SYSTEM_META = {
  YER: { name_ar: 'ريال يمني', symbol: 'م1', decimals: 0 },
  SAR: { name_ar: 'ريال سعودي', symbol: 'ر.س', decimals: 2 },
  USD: { name_ar: 'دولار أمريكي', symbol: '$', decimals: 2 },
}

export async function adminCurrencyHandler(db, path, method, p, b, sess, ctx) {
  // ---------------- CURRENCIES ----------------
  if (path === '/currencies' && method === 'GET') {
    const custom = await db.collection('admin_currencies').find({}, { projection: { _id: 0 } }).toArray()
    const overrides = Object.fromEntries(custom.filter(c => ctx.currencies.includes(c.code)).map(c => [c.code, c]))
    // real usage: how many offices have a rate configured + operations count per currency
    const settings = await db.collection('tenant_settings').find({ rates: { $exists: true } }, { projection: { tenant_id: 1, rates: 1 } }).toArray()
    const usage = {}
    for (const s of settings) for (const c of Object.keys(s.rates || {})) usage[c] = (usage[c] || 0) + 1
    const opCounts = {}
    for (const cur of ctx.currencies) {
      let n = 0
      for (const coll of ['tickets', 'visas', 'services', 'package_bookings', 'vouchers']) n += await db.collection(coll).countDocuments({ currency: cur }).catch(() => 0)
      opCounts[cur] = n
    }
    const rows = [
      ...ctx.currencies.map(code => {
        const ov = overrides[code] || {}
        return {
          code, system: true, operational: true,
          is_base: code === ctx.baseCurrency,
          name_ar: ov.name_ar || SYSTEM_META[code]?.name_ar || code,
          symbol: ov.symbol || SYSTEM_META[code]?.symbol || code,
          decimals: ov.decimals ?? SYSTEM_META[code]?.decimals ?? 2,
          active: ov.active !== false,
          offices_using: usage[code] || 0, operations_count: opCounts[code] || 0,
          created_at: ov.created_at || null, updated_at: ov.updated_at || null, updated_by: ov.updated_by || null,
          deactivation_note: ov.active === false ? 'تعطيل إداري — إنفاذه في محرك العمليات نقطة قرار (ثابت CURRENCIES)' : null,
        }
      }),
      ...custom.filter(c => !ctx.currencies.includes(c.code)).map(c => ({
        ...c, system: false, operational: false, is_base: false,
        offices_using: usage[c.code] || 0, operations_count: 0,
        operational_note: 'مسجلة إدارياً فقط — محرك العمليات يقبل USD/SAR/YER حصراً، تفعيلها تشغيلياً نقطة قرار',
      })),
    ]
    return {
      rows, base_currency: ctx.baseCurrency,
      source_note: 'مصدر العملات التشغيلي: ثابت CURRENCIES في الكود (الأساس: YER) — السجل هنا يدير البيانات الوصفية والإضافات. لا حذف لأي عملة، والعملات تبقى ظاهرة في السجلات القديمة، وتعديل الاسم/الرمز لا يغير العمليات التاريخية (تخزن الكود فقط).',
      base_change_note: 'تغيير العملة الأساسية بعد وجود حركات مالية محظور — يتطلب مساراً مستقلاً وقراراً واضحاً (غير متاح من هذه الشاشة)',
    }
  }
  if (path === '/currencies' && method === 'POST') {
    const code = String(b?.code || '').toUpperCase().trim()
    if (!/^[A-Z]{3}$/.test(code)) return { error: 'كود العملة الدولي 3 أحرف (ISO)' }
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب (Audit)' }
    if (ctx.currencies.includes(code)) return { error: 'عملة نظامية موجودة مسبقاً' }
    const dup = await db.collection('admin_currencies').findOne({ code })
    if (dup) return { error: 'العملة مسجلة مسبقاً', status: 409 }
    const doc = {
      id: uuidv4(), code, name_ar: String(b?.name_ar || code).slice(0, 80),
      symbol: String(b?.symbol || code).slice(0, 10),
      decimals: Math.min(Math.max(parseInt(b?.decimals) || 2, 0), 6),
      active: b?.active !== false, is_base: false,
      created_by: sess.user.email, created_at: new Date(),
    }
    await db.collection('admin_currencies').insertOne({ ...doc })
    await logAudit(db, sess, 'currency_add', code, null, { name_ar: doc.name_ar, symbol: doc.symbol }, b.reason)
    const { _id, ...rest } = doc
    return { success: true, currency: rest, note: 'مسجلة إدارياً — تفعيلها في محرك العمليات (ثابت CURRENCIES) نقطة قرار' }
  }
  const cm = path.match(/^\/currencies\/([A-Z]{3})$/)
  if (cm && method === 'PUT') {
    const code = cm[1]
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب (Audit)' }
    if (b?.active === false && code === ctx.baseCurrency) return { error: 'لا يمكن تعطيل العملة الأساسية (YER)' }
    if (b?.is_base) return { error: 'تغيير العملة الأساسية محظور — يتطلب مساراً مستقلاً وقراراً واضحاً (نقطة قرار)' }
    const before = await db.collection('admin_currencies').findOne({ code }, { projection: { _id: 0 } })
    const upd = { code, updated_by: sess.user.email, updated_at: new Date() }
    if (b.name_ar !== undefined) upd.name_ar = String(b.name_ar).slice(0, 80)
    if (b.symbol !== undefined) upd.symbol = String(b.symbol).slice(0, 10)
    if (b.decimals !== undefined) upd.decimals = Math.min(Math.max(parseInt(b.decimals) || 0, 0), 6)
    if (b.active !== undefined) upd.active = !!b.active
    if (!before) { upd.id = uuidv4(); upd.created_by = sess.user.email; upd.created_at = new Date() }
    await db.collection('admin_currencies').updateOne({ code }, { $set: upd }, { upsert: true })
    await logAudit(db, sess, b.active === false ? 'currency_disable' : b.active === true && before?.active === false ? 'currency_enable' : 'currency_update', code, before, upd, b.reason)
    return { success: true, note: 'تعديل البيانات الوصفية لا يمس العمليات التاريخية — والتعطيل يمنع الاستخدام الجديد فقط (إنفاذه بالمحرك نقطة قرار للعملات النظامية)' }
  }

  // ---------------- FX RATES (THE live source: tenant_settings.rates) ----------------
  if (path === '/rates' && method === 'GET') {
    const tenantId = p.get('tenant')
    const tf = tenantId ? { tenant_id: tenantId } : {}
    const ts = await db.collection('tenants').find(tenantId ? { id: tenantId } : {}, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
    const settings = await db.collection('tenant_settings').find(tf, { projection: { _id: 0, tenant_id: 1, rates: 1, updated_at: 1 } }).toArray()
    const sMap = Object.fromEntries(settings.map(s => [s.tenant_id, s]))
    return {
      rows: ts.map(t => ({
        tenant_id: t.id, tenant_name: t.name,
        rates: sMap[t.id]?.rates || null,
        using_defaults: !sMap[t.id]?.rates,
        updated_at: sMap[t.id]?.updated_at || null,
      })),
      defaults: ctx.defaultRates, base_currency: ctx.baseCurrency, currencies: ctx.currencies,
      source_note: 'المصدر الفعلي الوحيد: tenant_settings.rates لكل مكتب (شراء/تحويل/بيع + حدود) — لا مصدر موازٍ. التعديل من هنا يكتب في نفس المصدر مع إصدار تاريخي + Audit، وبلا أثر رجعي (العمليات تثبّت سعرها وقت التنفيذ)',
    }
  }
  if (path === '/rates' && method === 'PUT') {
    const tenantId = b?.tenant_id
    if (!tenantId) return { error: 'اختر المكتب' }
    if (!String(b?.reason || '').trim()) return { error: 'سبب التعديل إلزامي (Audit)' }
    if (String(b?.confirm_text || '').trim() !== 'أؤكد تعديل الأسعار') return { error: 'التأكيد مطلوب: اكتب «أؤكد تعديل الأسعار» حرفياً' }
    const t = await db.collection('tenants').findOne({ id: tenantId }, { projection: { name: 1 } })
    if (!t) return { error: 'المكتب غير موجود', status: 404 }
    const vErr = validateRates(b.rates)
    if (vErr) return { error: vErr }
    const before = await db.collection('tenant_settings').findOne({ tenant_id: tenantId }, { projection: { rates: 1 } })
    // write to THE live source (same as the office endpoint) + versioned history
    await db.collection('tenant_settings').updateOne({ tenant_id: tenantId }, { $set: { rates: b.rates, updated_at: new Date() } }, { upsert: true })
    const ver = {
      id: uuidv4(), scope: 'tenant', tenant_id: tenantId, tenant_name: t.name,
      rates_before: before?.rates || null, rates_after: b.rates,
      effective_from: new Date(), effective_to: null, // superseded by the next version
      source: b?.source || 'super_admin', status: 'active',
      created_by: sess.user.email, reason: String(b.reason).slice(0, 300),
    }
    await db.collection('fx_rate_history').insertOne({ ...ver })
    // close the previous version window (sequential — no overlaps possible)
    await db.collection('fx_rate_history').updateMany({ tenant_id: tenantId, id: { $ne: ver.id }, effective_to: null }, { $set: { effective_to: ver.effective_from, status: 'superseded' } })
    await logAudit(db, sess, 'fx_rate_update', tenantId, { rates: before?.rates || null }, { rates: b.rates }, b.reason)
    await emitAdminNotification(db, { type: 'fx_rate_change', title: `💱 تحديث أسعار صرف — ${t.name}`, body: `بواسطة ${sess.user.email} — ${b.reason}`, priority: 'warning', tenant_id: tenantId, link: { section: 'currency' }, ref_type: 'fx', ref_id: ver.id, dedupe_key: `fx_${ver.id}` })
    return { success: true, version_id: ver.id, note: 'سرى السعر الجديد من الآن فقط — العمليات التاريخية بأسعارها المثبتة' }
  }
  // global apply — two-step Maker–Checker (pending → confirm), never silent
  if (path === '/rates/apply-global' && method === 'POST') {
    if (!String(b?.reason || '').trim()) return { error: 'السبب إلزامي' }
    const vErr = validateRates(b.rates)
    if (vErr) return { error: vErr }
    const pending = await db.collection('platform_settings').findOne({ id: 'fx_global_pending' })
    if (b?.step === 'request') {
      await db.collection('platform_settings').updateOne({ id: 'fx_global_pending' }, { $set: { id: 'fx_global_pending', rates: b.rates, reason: b.reason, requested_by: sess.user.email, requested_at: new Date() } }, { upsert: true })
      await logAudit(db, sess, 'fx_global_requested', 'all_tenants', null, { rates: b.rates }, b.reason)
      return { success: true, pending: true, note: 'طلب تعميم مسجل — يتطلب تأكيداً ثانياً (Maker–Checker) من شاشة التأكيد' }
    }
    if (b?.step === 'confirm') {
      if (!pending) return { error: 'لا يوجد طلب تعميم معلق' }
      const admins = await db.collection('users').countDocuments({ role: 'super_admin', active: { $ne: false } })
      if (admins > 1 && pending.requested_by === sess.user.email) return { error: 'Maker–Checker: التأكيد يجب أن يأتي من سوبر أدمن آخر' }
      if (String(b?.confirm_text || '').trim() !== 'أؤكد التعميم على الجميع') return { error: 'اكتب «أؤكد التعميم على الجميع» حرفياً' }
      const ts = await db.collection('tenants').find({}, { projection: { id: 1, name: 1 } }).toArray()
      const now = new Date()
      for (const t of ts) {
        const before = await db.collection('tenant_settings').findOne({ tenant_id: t.id }, { projection: { rates: 1 } })
        await db.collection('tenant_settings').updateOne({ tenant_id: t.id }, { $set: { rates: pending.rates, updated_at: now } }, { upsert: true })
        await db.collection('fx_rate_history').updateMany({ tenant_id: t.id, effective_to: null }, { $set: { effective_to: now, status: 'superseded' } })
        await db.collection('fx_rate_history').insertOne({ id: uuidv4(), scope: 'global', tenant_id: t.id, tenant_name: t.name, rates_before: before?.rates || null, rates_after: pending.rates, effective_from: now, effective_to: null, source: 'super_admin_global', status: 'active', created_by: sess.user.email, reason: pending.reason })
      }
      await db.collection('platform_settings').deleteOne({ id: 'fx_global_pending' })
      await logAudit(db, sess, 'fx_global_applied', 'all_tenants', { requested_by: pending.requested_by }, { tenants: ts.length, rates: pending.rates }, pending.reason)
      await emitAdminNotification(db, { type: 'fx_rate_change', title: `💱 تعميم أسعار صرف على ${ts.length} مكتب`, body: pending.reason, priority: 'critical', link: { section: 'currency' }, ref_type: 'fx', ref_id: 'global', dedupe_key: `fx_global_${now.getTime()}` })
      return { success: true, applied_to: ts.length }
    }
    return { error: 'step مطلوب: request أو confirm' }
  }
  if (path === '/rates/pending-global' && method === 'GET') {
    const pending = await db.collection('platform_settings').findOne({ id: 'fx_global_pending' }, { projection: { _id: 0 } })
    return { pending: pending || null }
  }
  if (path === '/rates/history' && method === 'GET') {
    const f = {}
    if (p.get('tenant')) f.tenant_id = p.get('tenant')
    const rows = await db.collection('fx_rate_history').find(f, { projection: { _id: 0 } }).sort({ effective_from: -1 }).limit(200).toArray()
    return { rows, note: 'كل تعديل ينشئ إصداراً جديداً بتاريخ سريان — الإصدارات متسلسلة بلا تداخل، والقديم لا يُستبدل أبداً' }
  }

  return { error: 'مسار غير معروف', status: 404 }
}
