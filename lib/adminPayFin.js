// ============================================================================
// v3.97 — ADMIN PAYMENT METHODS & LOCAL FINANCIAL ENTITIES (Super Admin Batch 5)
// New unified source (none existed as managed data — payment methods were
// hardcoded strings on vouchers/ops; those legacy fields are UNTOUCHED).
// Collections: payment_methods, financial_entities, receiving_accounts,
//              payment_orders, payment_order_proofs.
// FINANCIAL SAFETY (absolute):
//  - Uploading a proof NEVER confirms payment. Confirmation needs payments.approve
//    + Maker–Checker (confirmer ≠ creator when another admin exists).
//  - Confirmation NEVER touches balances: it records financial_execution =
//    'pending_execution' — actual money movement must go through the EXISTING
//    voucher/journal path (documented decision point).
//  - Refund statuses are markers with reason — no money movement here.
//  - Partial/over-payment SETTLEMENT is a decision point (no safe accounting
//    path from here) — amounts on proofs are recorded for review only.
//  - No card integration / no external calls in this batch.
//  - NEVER stored: full card numbers, CVV, bank passwords, plain secrets
//    (payload keys rejected server-side).
//  - Account numbers/IBAN are masked unless the user holds payments.manage.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'

async function logAudit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'payments', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* never break */ }
}

export const METHOD_TYPES = [
  { key: 'bank_transfer', label: 'تحويل بنكي' }, { key: 'card', label: 'بطاقة ائتمان / دفع' },
  { key: 'exchanger', label: 'صراف محلي' }, { key: 'transfer_company', label: 'شركة تحويل محلية' },
  { key: 'cash', label: 'دفع نقدي' }, { key: 'invoice_request', label: 'فاتورة / طلب تحويل' },
  { key: 'other', label: 'أخرى' },
]
export const ENTITY_TYPES = [
  { key: 'bank', label: 'بنك' }, { key: 'exchanger', label: 'صراف' },
  { key: 'transfer_company', label: 'شركة تحويل' }, { key: 'gateway', label: 'بوابة دفع' },
  { key: 'other', label: 'جهة مالية أخرى' },
]
// manual payment status machine — enforced server-side
export const ORDER_TRANSITIONS = {
  draft: ['awaiting_transfer', 'cancelled'],
  awaiting_transfer: ['proof_uploaded', 'under_review', 'cancelled'],
  proof_uploaded: ['under_review', 'awaiting_transfer', 'cancelled'],
  under_review: ['confirmed', 'rejected', 'awaiting_transfer', 'cancelled'],
  confirmed: ['partially_refunded', 'refunded'],
  rejected: ['awaiting_transfer'],
  cancelled: [],
  partially_refunded: ['refunded'],
  refunded: [],
}
export const ORDER_STATUS_LABELS = {
  draft: 'مسودة', awaiting_transfer: 'بانتظار التحويل', proof_uploaded: 'تم رفع الإيصال',
  under_review: 'قيد المراجعة', confirmed: 'مؤكد', rejected: 'مرفوض', cancelled: 'ملغى',
  partially_refunded: 'مسترد جزئياً', refunded: 'مسترد كلياً',
}

const FORBIDDEN_KEYS = /card_number|card_no|cvv|cvc|pin\b|password|passwd|secret|token/i
function rejectSensitive(obj) {
  for (const k of Object.keys(obj || {})) if (FORBIDDEN_KEYS.test(k)) return `الحقل «${k}» ممنوع تخزينه (بيانات حساسة: بطاقات/كلمات مرور/Secrets)`
  return null
}
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ')
const maskNum = (v) => { const s = String(v || ''); return s.length <= 4 ? s : '•'.repeat(Math.max(0, s.length - 4)) + s.slice(-4) }

async function nextRef(db) {
  const r = await db.collection('platform_settings').findOneAndUpdate(
    { id: 'payment_order_seq' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })
  const n = (r?.value?.seq ?? r?.seq) || Date.now() % 100000
  return `PMT-${String(n).padStart(5, '0')}`
}

export async function adminPayFinHandler(db, path, method, p, body, sess, can, ctx) {
  const b = body || {}
  const fullView = can.has('payments', 'manage') // unmasked account data

  // ============================ PAYMENT METHODS ============================
  if (path === '/methods' && method === 'GET') {
    const f = {}
    if (p.get('type')) f.type = p.get('type')
    if (p.get('status') === 'active') f.active = { $ne: false }
    if (p.get('status') === 'inactive') f.active = false
    if (p.get('q')) f.name = { $regex: p.get('q'), $options: 'i' }
    const rows = await db.collection('payment_methods').find(f, { projection: { _id: 0 } }).sort({ sort_order: 1, name: 1 }).toArray()
    return { rows, types: METHOD_TYPES, legacy_note: 'طرق الدفع النصية القديمة على السندات/العمليات (cash/bank...) لم تُمس — هذا المصدر الموحد للإدارة الجديدة (توافق خلفي)' }
  }
  if (path === '/methods' && method === 'POST') {
    if (!can.has('payments', 'create')) return { error: 'غير مصرح — يحتاج صلاحية Create', status: 403 }
    const sens = rejectSensitive(b); if (sens) return { error: sens }
    const name = norm(b.name)
    if (!name || !b.type) return { error: 'الاسم والنوع إلزاميان' }
    if (!METHOD_TYPES.some(t => t.key === b.type)) return { error: 'نوع غير معروف' }
    const dup = await db.collection('payment_methods').findOne({ name, active: { $ne: false } })
    if (dup) return { error: `طريقة الدفع «${name}» موجودة مسبقاً — لا تكرار` }
    const doc = {
      id: uuidv4(), name, type: b.type, description: String(b.description || '').slice(0, 500) || null,
      instructions: String(b.instructions || '').slice(0, 1000) || null,
      currencies: (Array.isArray(b.currencies) ? b.currencies : []).filter(c => (ctx?.currencies || []).includes(c)),
      requires_proof: !!b.requires_proof, requires_ref: !!b.requires_ref, requires_review: b.requires_review !== false,
      partial_allowed: !!b.partial_allowed, refundable: !!b.refundable,
      fee_type: ['fixed', 'percent'].includes(b.fee_type) ? b.fee_type : null,
      fee_value: Number(b.fee_value) || 0, fee_bearer: ['payer', 'office', 'platform'].includes(b.fee_bearer) ? b.fee_bearer : 'payer',
      active: true, sort_order: Number(b.sort_order) || 0,
      created_at: new Date(), created_by: sess.user.email,
    }
    await db.collection('payment_methods').insertOne({ ...doc })
    await logAudit(db, sess, 'method_create', { id: doc.id, name }, null, { type: doc.type }, b.reason || null)
    return { success: true, method: doc }
  }
  const mM = path.match(/^\/methods\/([^/]+)(\/(toggle|clone|usage))?$/)
  if (mM) {
    const doc = await db.collection('payment_methods').findOne({ id: mM[1] })
    if (!doc) return { error: 'طريقة الدفع غير موجودة', status: 404 }
    if (mM[3] === 'usage' && method === 'GET') {
      const orders = await db.collection('payment_orders').countDocuments({ method_id: doc.id })
      return { usage: { payment_orders: orders }, delete_policy: 'الحذف ممنوع نهائياً إذا استُخدمت الطريقة تاريخياً — ولا نوفر حذفاً أصلاً، استخدم التعطيل' }
    }
    if (!mM[3] && method === 'PUT') {
      if (!can.has('payments', 'edit')) return { error: 'غير مصرح — يحتاج صلاحية Edit', status: 403 }
      const sens = rejectSensitive(b); if (sens) return { error: sens }
      const upd = {}
      for (const k of ['description', 'instructions']) if (b[k] !== undefined) upd[k] = String(b[k] || '').slice(0, 1000) || null
      if (b.name !== undefined) {
        const name = norm(b.name); if (!name) return { error: 'الاسم لا يكون فارغاً' }
        const dup = await db.collection('payment_methods').findOne({ name, id: { $ne: doc.id }, active: { $ne: false } })
        if (dup) return { error: 'الاسم مستخدم' }
        upd.name = name
      }
      if (b.currencies !== undefined) upd.currencies = (Array.isArray(b.currencies) ? b.currencies : []).filter(c => (ctx?.currencies || []).includes(c))
      for (const k of ['requires_proof', 'requires_ref', 'requires_review', 'partial_allowed', 'refundable']) if (b[k] !== undefined) upd[k] = !!b[k]
      if (b.fee_type !== undefined) upd.fee_type = ['fixed', 'percent'].includes(b.fee_type) ? b.fee_type : null
      if (b.fee_value !== undefined) upd.fee_value = Number(b.fee_value) || 0
      if (b.fee_bearer !== undefined) upd.fee_bearer = ['payer', 'office', 'platform'].includes(b.fee_bearer) ? b.fee_bearer : 'payer'
      if (b.sort_order !== undefined) upd.sort_order = Number(b.sort_order) || 0
      upd.updated_at = new Date(); upd.updated_by = sess.user.email
      await db.collection('payment_methods').updateOne({ id: doc.id }, { $set: upd })
      await logAudit(db, sess, 'method_update', { id: doc.id, name: doc.name }, doc, upd, b.reason || null)
      return { success: true }
    }
    if (mM[3] === 'toggle' && method === 'POST') {
      const target = doc.active === false
      if (!can.has('payments', target ? 'activate' : 'disable')) return { error: `غير مصرح — يحتاج ${target ? 'Activate' : 'Disable'}`, status: 403 }
      if (!b.reason) return { error: 'السبب إلزامي' }
      await db.collection('payment_methods').updateOne({ id: doc.id }, { $set: { active: target, updated_at: new Date(), updated_by: sess.user.email } })
      await logAudit(db, sess, target ? 'method_activate' : 'method_disable', { id: doc.id, name: doc.name }, { active: doc.active !== false }, { active: target }, b.reason)
      return { success: true }
    }
    if (mM[3] === 'clone' && method === 'POST') {
      if (!can.has('payments', 'create')) return { error: 'غير مصرح — يحتاج Create', status: 403 }
      const { _id, ...rest } = doc
      const copy = { ...rest, id: uuidv4(), name: `${doc.name} (نسخة)`, active: false, created_at: new Date(), created_by: sess.user.email, cloned_from: doc.id }
      await db.collection('payment_methods').insertOne({ ...copy })
      await logAudit(db, sess, 'method_clone', { from: doc.id, to: copy.id }, null, { name: copy.name }, b.reason || null)
      return { success: true, method: copy, note: 'النسخة تُنشأ معطلة — راجع إعداداتها ثم فعّلها' }
    }
  }

  // ============================ FINANCIAL ENTITIES ============================
  if (path === '/entities' && method === 'GET') {
    const f = {}
    if (p.get('type')) f.type = p.get('type')
    if (p.get('status') === 'active') { f.active = { $ne: false }; f.approval_status = 'approved' }
    if (p.get('status') === 'inactive') f.active = false
    if (p.get('status') === 'pending') f.approval_status = 'pending'
    if (p.get('country_id')) f['geo.country_id'] = p.get('country_id')
    if (p.get('q')) f.$or = [{ name_ar: { $regex: p.get('q'), $options: 'i' } }, { name_en: { $regex: p.get('q'), $options: 'i' } }]
    if (p.get('active_only') === '1') { f.active = { $ne: false }; f.approval_status = 'approved' }
    const rows = await db.collection('financial_entities').find(f, { projection: { _id: 0 } }).sort({ name_ar: 1 }).limit(300).toArray()
    const accCounts = {}
    if (rows.length) {
      const agg = await db.collection('receiving_accounts').aggregate([{ $match: { entity_id: { $in: rows.map(r => r.id) } } }, { $group: { _id: '$entity_id', n: { $sum: 1 } } }]).toArray()
      for (const a of agg) accCounts[a._id] = a.n
    }
    return { rows: rows.map(r => ({ ...r, accounts_count: accCounts[r.id] || 0 })), types: ENTITY_TYPES }
  }
  if ((path === '/entities' || path === '/entities/request') && method === 'POST') {
    const isRequest = path === '/entities/request'
    // in-flow addition: create needs payments.create; without it, /request files a PENDING entity (any payments viewer)
    if (!isRequest && !can.has('payments', 'create')) return { error: 'غير مصرح — أرسل «طلب إضافة جهة» بدلاً من الإنشاء المباشر', status: 403 }
    const sens = rejectSensitive(b); if (sens) return { error: sens }
    const name_ar = norm(b.name_ar)
    if (!name_ar || !b.type) return { error: 'الاسم العربي والنوع إلزاميان' }
    if (!ENTITY_TYPES.some(t => t.key === b.type)) return { error: 'نوع الجهة غير معروف' }
    const dup = await db.collection('financial_entities').findOne({ name_ar, type: b.type })
    if (dup) return { error: `الجهة «${name_ar}» (${b.type}) موجودة مسبقاً — لا أسماء حرة مكررة`, existing_id: dup.id }
    let geo = null
    if (b.geo?.country_id) {
      const c = await db.collection('geo_locations').findOne({ id: b.geo.country_id, level: 'country' })
      if (!c) return { error: 'الدولة المحددة غير موجودة في مركز المواقع' }
      geo = { country_id: c.id, country_name: c.name_ar }
      for (const [lvl, fld] of [['governorate', 'governorate_id'], ['district', 'district_id']]) {
        if (b.geo[fld]) {
          const g = await db.collection('geo_locations').findOne({ id: b.geo[fld], level: lvl })
          if (g) { geo[fld] = g.id; geo[`${lvl}_name`] = g.name_ar }
        }
      }
    }
    const doc = {
      id: uuidv4(), name_ar, name_en: norm(b.name_en) || null, type: b.type,
      geo, address: String(b.address || '').slice(0, 300) || null,
      branches: (Array.isArray(b.branches) ? b.branches : []).map(x => norm(x)).filter(Boolean).slice(0, 50),
      phones: (Array.isArray(b.phones) ? b.phones : []).map(x => norm(x)).filter(Boolean).slice(0, 10),
      website: norm(b.website) || null,
      currencies: (Array.isArray(b.currencies) ? b.currencies : []).filter(c => (ctx?.currencies || []).includes(c)),
      instructions: String(b.instructions || '').slice(0, 1000) || null,
      fees: String(b.fees || '').slice(0, 300) || null, notes: String(b.notes || '').slice(0, 400) || null,
      active: !isRequest, approval_status: isRequest ? 'pending' : 'approved',
      created_at: new Date(), created_by: sess.user.email, requested_by: isRequest ? sess.user.email : null,
    }
    await db.collection('financial_entities').insertOne({ ...doc })
    await logAudit(db, sess, isRequest ? 'entity_request' : 'entity_create', { id: doc.id, name: name_ar, type: doc.type }, null, { approval_status: doc.approval_status }, b.reason || null)
    return { success: true, entity: doc, note: isRequest ? 'سُجل الطلب — تصبح الجهة متاحة بعد الاعتماد والتفعيل وفق السياسة' : null }
  }
  const eM = path.match(/^\/entities\/([^/]+)(\/(toggle|approve|accounts))?$/)
  if (eM) {
    const doc = await db.collection('financial_entities').findOne({ id: eM[1] }, { projection: { _id: 0 } })
    if (!doc) return { error: 'الجهة غير موجودة', status: 404 }
    if (!eM[3] && method === 'GET') {
      const accounts = await db.collection('receiving_accounts').find({ entity_id: doc.id }, { projection: { _id: 0 } }).toArray()
      return { entity: doc, accounts: accounts.map(a => fullView ? a : { ...a, account_number: maskNum(a.account_number), iban: maskNum(a.iban), wallet_number: maskNum(a.wallet_number) }), masked: !fullView }
    }
    if (!eM[3] && method === 'PUT') {
      if (!can.has('payments', 'edit')) return { error: 'غير مصرح — يحتاج Edit', status: 403 }
      const sens = rejectSensitive(b); if (sens) return { error: sens }
      const upd = {}
      if (b.name_ar !== undefined) { const n = norm(b.name_ar); if (!n) return { error: 'الاسم إلزامي' }; upd.name_ar = n }
      for (const k of ['name_en', 'address', 'website', 'instructions', 'fees', 'notes']) if (b[k] !== undefined) upd[k] = String(b[k] || '').slice(0, 1000) || null
      if (b.branches !== undefined) upd.branches = (Array.isArray(b.branches) ? b.branches : []).map(norm).filter(Boolean).slice(0, 50)
      if (b.phones !== undefined) upd.phones = (Array.isArray(b.phones) ? b.phones : []).map(norm).filter(Boolean).slice(0, 10)
      if (b.currencies !== undefined) upd.currencies = (Array.isArray(b.currencies) ? b.currencies : []).filter(c => (ctx?.currencies || []).includes(c))
      upd.updated_at = new Date(); upd.updated_by = sess.user.email
      await db.collection('financial_entities').updateOne({ id: doc.id }, { $set: upd })
      await logAudit(db, sess, 'entity_update', { id: doc.id, name: doc.name_ar }, { name_ar: doc.name_ar }, upd, b.reason || null)
      return { success: true }
    }
    if (eM[3] === 'toggle' && method === 'POST') {
      const target = doc.active === false
      if (!can.has('payments', target ? 'activate' : 'disable')) return { error: `غير مصرح — يحتاج ${target ? 'Activate' : 'Disable'}`, status: 403 }
      if (!b.reason) return { error: 'السبب إلزامي' }
      if (target && doc.approval_status === 'pending') return { error: 'الجهة بانتظار الاعتماد — اعتمدها أولاً' }
      await db.collection('financial_entities').updateOne({ id: doc.id }, { $set: { active: target, updated_at: new Date(), updated_by: sess.user.email } })
      await logAudit(db, sess, target ? 'entity_activate' : 'entity_disable', { id: doc.id, name: doc.name_ar }, { active: doc.active !== false }, { active: target }, b.reason)
      return { success: true }
    }
    if (eM[3] === 'approve' && method === 'POST') {
      if (!can.has('payments', 'approve')) return { error: 'غير مصرح — اعتماد الجهات يحتاج Approve', status: 403 }
      if (doc.approval_status !== 'pending') return { error: 'الجهة ليست بانتظار الاعتماد' }
      const decision = b.decision === 'reject' ? 'rejected' : 'approved'
      await db.collection('financial_entities').updateOne({ id: doc.id }, { $set: { approval_status: decision, active: decision === 'approved', approved_by: sess.user.email, approved_at: new Date() } })
      await logAudit(db, sess, `entity_${decision}`, { id: doc.id, name: doc.name_ar }, { approval_status: 'pending' }, { approval_status: decision }, b.reason || null)
      return { success: true }
    }
    if (eM[3] === 'accounts' && method === 'POST') {
      if (!can.has('payments', 'create')) return { error: 'غير مصرح — يحتاج Create', status: 403 }
      const sens = rejectSensitive(b); if (sens) return { error: sens }
      if (!norm(b.account_name)) return { error: 'اسم الحساب / المستفيد إلزامي' }
      if (!b.currency || !(ctx?.currencies || []).includes(b.currency)) return { error: 'العملة إلزامية (من العملات التشغيلية)' }
      const acc = {
        id: uuidv4(), entity_id: doc.id, account_name: norm(b.account_name),
        account_number: norm(b.account_number) || null, iban: norm(b.iban) || null,
        wallet_number: norm(b.wallet_number) || null, currency: b.currency,
        branch: norm(b.branch) || null, beneficiary_tenant_id: b.beneficiary_tenant_id || null,
        is_default: !!b.is_default, instructions: String(b.instructions || '').slice(0, 500) || null,
        active: true, created_at: new Date(), created_by: sess.user.email,
      }
      if (acc.is_default) await db.collection('receiving_accounts').updateMany({ entity_id: doc.id, currency: acc.currency }, { $set: { is_default: false } })
      await db.collection('receiving_accounts').insertOne({ ...acc })
      await logAudit(db, sess, 'account_create', { id: acc.id, entity: doc.name_ar }, null, { account_name: acc.account_name, currency: acc.currency }, b.reason || null)
      return { success: true, account: acc }
    }
  }
  const aM = path.match(/^\/accounts\/([^/]+)(\/toggle)?$/)
  if (aM) {
    const acc = await db.collection('receiving_accounts').findOne({ id: aM[1] })
    if (!acc) return { error: 'الحساب غير موجود', status: 404 }
    if (!aM[2] && method === 'PUT') {
      if (!can.has('payments', 'edit')) return { error: 'غير مصرح — يحتاج Edit', status: 403 }
      const sens = rejectSensitive(b); if (sens) return { error: sens }
      const upd = {}
      for (const k of ['account_name', 'account_number', 'iban', 'wallet_number', 'branch']) if (b[k] !== undefined) upd[k] = norm(b[k]) || null
      if (b.instructions !== undefined) upd.instructions = String(b.instructions || '').slice(0, 500) || null
      if (b.beneficiary_tenant_id !== undefined) upd.beneficiary_tenant_id = b.beneficiary_tenant_id || null
      if (b.is_default === true) { await db.collection('receiving_accounts').updateMany({ entity_id: acc.entity_id, currency: acc.currency, id: { $ne: acc.id } }, { $set: { is_default: false } }); upd.is_default = true }
      upd.updated_at = new Date(); upd.updated_by = sess.user.email
      await db.collection('receiving_accounts').updateOne({ id: acc.id }, { $set: upd })
      await logAudit(db, sess, 'account_update', { id: acc.id }, { account_name: acc.account_name }, { keys: Object.keys(upd) }, b.reason || null)
      return { success: true }
    }
    if (aM[2] && method === 'POST') {
      const target = acc.active === false
      if (!can.has('payments', target ? 'activate' : 'disable')) return { error: `غير مصرح — يحتاج ${target ? 'Activate' : 'Disable'}`, status: 403 }
      if (!b.reason) return { error: 'السبب إلزامي' }
      await db.collection('receiving_accounts').updateOne({ id: acc.id }, { $set: { active: target, updated_at: new Date(), updated_by: sess.user.email } })
      await logAudit(db, sess, target ? 'account_activate' : 'account_disable', { id: acc.id }, { active: acc.active !== false }, { active: target }, b.reason)
      return { success: true }
    }
  }

  // ============================ PAYMENT ORDERS (invoice / transfer request) ============================
  if (path === '/overview' && method === 'GET') {
    const agg = await db.collection('payment_orders').aggregate([{ $group: { _id: { status: '$status', currency: '$currency' }, n: { $sum: 1 }, total: { $sum: '$amount' } } }]).toArray()
    const needsReview = await db.collection('payment_orders').countDocuments({ status: { $in: ['proof_uploaded', 'under_review'] } })
    return { by_status: agg.map(a => ({ status: a._id.status, currency: a._id.currency, count: a.n, total: a.total })), needs_review: needsReview, statuses: ORDER_STATUS_LABELS }
  }
  if (path === '/orders' && method === 'GET') {
    const f = {}
    for (const [qp, fld] of [['method_id', 'method_id'], ['entity_id', 'entity_id'], ['tenant', 'tenant_id'], ['status', 'status'], ['currency', 'currency'], ['user', 'created_by']]) if (p.get(qp)) f[fld] = p.get(qp)
    if (p.get('has_proof') === '1') f.proofs_count = { $gt: 0 }
    if (p.get('has_proof') === '0') f.proofs_count = { $in: [0, null] }
    if (p.get('needs_review') === '1') f.status = { $in: ['proof_uploaded', 'under_review'] }
    if (p.get('from') || p.get('to')) {
      f.created_at = {}
      if (p.get('from')) f.created_at.$gte = new Date(`${p.get('from')}T00:00:00.000+03:00`)
      if (p.get('to')) f.created_at.$lte = new Date(`${p.get('to')}T23:59:59.999+03:00`)
    }
    if (p.get('q')) f.$or = [{ ref_no: { $regex: p.get('q'), $options: 'i' } }, { payer_name: { $regex: p.get('q'), $options: 'i' } }]
    const rows = await db.collection('payment_orders').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(300).toArray()
    return { rows, statuses: ORDER_STATUS_LABELS }
  }
  if (path === '/orders' && method === 'POST') {
    if (!can.has('payments', 'create')) return { error: 'غير مصرح — يحتاج Create', status: 403 }
    const sens = rejectSensitive(b); if (sens) return { error: sens }
    const amount = Number(b.amount)
    if (!b.tenant_id || !amount || amount <= 0 || !b.currency) return { error: 'المكتب والمبلغ والعملة إلزامية' }
    if (!(ctx?.currencies || []).includes(b.currency)) return { error: 'عملة غير تشغيلية' }
    const tenant = await db.collection('tenants').findOne({ id: b.tenant_id }, { projection: { id: 1, name: 1 } })
    if (!tenant) return { error: 'المكتب غير موجود' }
    let methodDoc = null, entity = null, account = null
    if (b.method_id) { methodDoc = await db.collection('payment_methods').findOne({ id: b.method_id }); if (!methodDoc || methodDoc.active === false) return { error: 'طريقة الدفع غير موجودة أو معطلة' } }
    if (b.entity_id) { entity = await db.collection('financial_entities').findOne({ id: b.entity_id }); if (!entity || entity.active === false || entity.approval_status !== 'approved') return { error: 'الجهة غير متاحة (معطلة أو غير معتمدة)' } }
    if (b.account_id) { account = await db.collection('receiving_accounts').findOne({ id: b.account_id }); if (!account || account.active === false) return { error: 'حساب الاستلام غير متاح' } }
    // FX snapshot from THE live source at creation time (never recomputed)
    const ts = await db.collection('tenant_settings').findOne({ tenant_id: tenant.id }, { projection: { rates: 1 } })
    const fx = ts?.rates?.[b.currency] || null
    const ref_no = await nextRef(db)
    const doc = {
      id: uuidv4(), ref_no, tenant_id: tenant.id, tenant_name: tenant.name,
      payer_client_id: b.payer_client_id || null, payer_name: norm(b.payer_name) || null,
      amount, currency: b.currency, fx_snapshot: fx,
      fee_amount: Number(b.fee_amount) || 0, fee_bearer: ['payer', 'office', 'platform'].includes(b.fee_bearer) ? b.fee_bearer : (methodDoc?.fee_bearer || 'payer'),
      method_id: methodDoc?.id || null, method_name: methodDoc?.name || null,
      entity_id: entity?.id || null, entity_name: entity?.name_ar || null,
      account_id: account?.id || null,
      due_date: b.due_date || null, instructions: String(b.instructions || '').slice(0, 1000) || null,
      linked_ref: b.linked_ref?.kind && b.linked_ref?.id ? { kind: String(b.linked_ref.kind).slice(0, 40), id: String(b.linked_ref.id).slice(0, 60) } : null,
      status: 'draft', proofs_count: 0,
      status_history: [{ to: 'draft', at: new Date(), by: sess.user.email }],
      financial_execution: null,
      created_at: new Date(), created_by: sess.user.email,
    }
    await db.collection('payment_orders').insertOne({ ...doc })
    await logAudit(db, sess, 'order_create', { id: doc.id, ref: ref_no }, null, { tenant: tenant.name, amount, currency: b.currency }, b.reason || null)
    return { success: true, order: doc }
  }
  const pdl = path.match(/^\/orders\/proofs\/download$/)
  if (pdl && method === 'GET') {
    const proof = await db.collection('payment_order_proofs').findOne({ id: p.get('id') }, { projection: { _id: 0 } })
    if (!proof) return { error: 'الإثبات غير موجود', status: 404 }
    return { filename: proof.filename, mime: proof.mime, data_base64: proof.data_base64 }
  }
  const oM = path.match(/^\/orders\/([^/]+)(\/(status|proofs))?$/)
  if (oM) {
    const order = await db.collection('payment_orders').findOne({ id: oM[1] }, { projection: { _id: 0 } })
    if (!order) return { error: 'أمر الدفع غير موجود', status: 404 }
    if (!oM[3] && method === 'GET') {
      const proofs = await db.collection('payment_order_proofs').find({ order_id: order.id }, { projection: { _id: 0, data_base64: 0 } }).toArray()
      return { order, proofs, transitions: ORDER_TRANSITIONS[order.status] || [], statuses: ORDER_STATUS_LABELS, financial_note: 'لا يُضاف رصيد من هنا مطلقاً — التأكيد يسجل «بانتظار التنفيذ المالي» ويمر عبر مسار السند/القيد القائم (نقطة قرار). الدفعات الجزئية/الزائدة تُسجل على الإثباتات للمراجعة فقط' }
    }
    if (oM[3] === 'proofs' && method === 'POST') {
      if (!can.has('payments', 'edit') && !can.has('payments', 'create')) return { error: 'غير مصرح — رفع إثبات يحتاج Create أو Edit', status: 403 }
      if (['confirmed', 'refunded', 'cancelled'].includes(order.status)) return { error: `لا يُرفع إثبات على أمر بحالة «${ORDER_STATUS_LABELS[order.status]}»` }
      const { filename, mime, data_base64 } = b
      if (!data_base64 || !filename) return { error: 'صورة الإيصال إلزامية' }
      if (!/^image\/(png|jpe?g)$|^application\/pdf$/.test(mime || '')) return { error: 'المسموح: PNG / JPG / PDF' }
      if (Math.ceil(String(data_base64).length * 0.75) > 2 * 1024 * 1024) return { error: 'الحد الأقصى 2MB' }
      const proof = {
        id: uuidv4(), order_id: order.id, filename: String(filename).slice(0, 120), mime, data_base64,
        transfer_no: norm(b.transfer_no) || null, ref_no: norm(b.ref_no) || null,
        sender_name: norm(b.sender_name) || null, sender_entity: norm(b.sender_entity) || null,
        amount: Number(b.amount) || null, currency: b.currency || order.currency,
        transfer_date: b.transfer_date || null, notes: String(b.notes || '').slice(0, 400) || null,
        uploaded_by: sess.user.email, uploaded_at: new Date(),
      }
      await db.collection('payment_order_proofs').insertOne({ ...proof })
      const upd = { proofs_count: (order.proofs_count || 0) + 1 }
      if ((ORDER_TRANSITIONS[order.status] || []).includes('proof_uploaded')) {
        upd.status = 'proof_uploaded'
        upd.status_history = [...(order.status_history || []), { to: 'proof_uploaded', at: new Date(), by: sess.user.email, note: 'رفع إيصال — لا يعني تأكيد الدفع' }]
      }
      await db.collection('payment_orders').updateOne({ id: order.id }, { $set: upd })
      await logAudit(db, sess, 'order_proof_upload', { id: order.id, ref: order.ref_no }, null, { transfer_no: proof.transfer_no, amount: proof.amount }, b.reason || null)
      return { success: true, note: 'رفع الإيصال لا يؤكد الدفع — التأكيد قرار مستقل بصلاحية Approve' }
    }
    if (oM[3] === 'status' && method === 'POST') {
      const to = b.to
      if (!ORDER_STATUS_LABELS[to]) return { error: 'حالة غير معروفة' }
      if (!(ORDER_TRANSITIONS[order.status] || []).includes(to)) return { error: `انتقال غير مسموح: ${ORDER_STATUS_LABELS[order.status]} ← ${ORDER_STATUS_LABELS[to]}. المسموح: ${(ORDER_TRANSITIONS[order.status] || []).map(s => ORDER_STATUS_LABELS[s]).join('، ') || 'لا شيء'}` }
      if (!b.reason) return { error: 'السبب إلزامي لتغيير الحالة' }
      const needsApprove = ['confirmed', 'rejected', 'partially_refunded', 'refunded'].includes(to)
      if (needsApprove && !can.has('payments', 'approve')) return { error: 'غير مصرح — التأكيد/الرفض/الاسترداد يحتاج صلاحية Approve', status: 403 }
      if (!needsApprove && !can.has('payments', 'edit') && !can.has('payments', 'create')) return { error: 'غير مصرح — يحتاج Edit', status: 403 }
      if (to === 'confirmed') {
        // Maker–Checker: confirmer must differ from creator when another admin exists
        const others = await db.collection('users').countDocuments({ $or: [{ role: 'super_admin', tenant_id: null }, { role: 'super_admin', platform_org: true }, { role: 'admin_staff', admin_realm: true }], active: { $ne: false }, email: { $ne: order.created_by } })
        if (order.created_by === sess.user.email && others > 0) return { error: 'Maker–Checker: لا يؤكد منشئ الأمر بنفسه — يلزم مدير آخر' }
        if (order.status === 'confirmed') return { error: 'مؤكد مسبقاً — التأكيد المكرر ممنوع' }
      }
      const upd = {
        status: to,
        status_history: [...(order.status_history || []), { to, at: new Date(), by: sess.user.email, reason: b.reason }],
      }
      if (to === 'confirmed') { upd.confirmed_by = sess.user.email; upd.confirmed_at = new Date(); upd.financial_execution = 'pending_execution' }
      if (['partially_refunded', 'refunded'].includes(to)) upd.refund_note = 'تعليم حالة فقط — لا حركة أموال من هنا: التنفيذ عبر المسار المالي القياسي (نقطة قرار)'
      await db.collection('payment_orders').updateOne({ id: order.id }, { $set: upd })
      await logAudit(db, sess, `order_${to}`, { id: order.id, ref: order.ref_no }, { status: order.status }, { status: to }, b.reason)
      return { success: true, financial_execution: upd.financial_execution || order.financial_execution || null, note: to === 'confirmed' ? 'التأكيد سُجل «بانتظار التنفيذ المالي» — لا رصيد أُضيف. حركة الأموال عبر مسار السند/القيد القائم فقط' : null }
    }
  }

  return { error: 'مسار غير معروف', status: 404 }
}
