// ============================================================================
// v3.94 — ADMIN REQUESTS CENTER (Super Admin Batch 2) — STRICTLY READ-ONLY.
// A unified administrative window over the REAL request lifecycles that exist
// in the system today. It never changes any module's own workflow, never
// forces a status, and performs ZERO writes. Existing admin write actions
// (password-reset PATCH, office-verification decision) stay where they are
// (legacy panel) — surfacing them here is documented as a decision point.
// Real request sources:
//  meraaj         → meraaj_inbound_bookings   (B2B bookings + cancellation requests)
//  password_reset → password_reset_requests   (pending | done | rejected)
//  cashout        → cashout_requests          (pending | processing | paid | rejected | applied_to_subscription)
//  refund         → refunds                   (executed refund records)
//  verification   → tenant_settings.office_verification + office_documents
// ============================================================================

const LIM = (v, d = 50, max = 100) => Math.min(Math.max(parseInt(v) || d, 1), max)
const HOURS = (from) => (from ? Math.floor((Date.now() - new Date(from).getTime()) / 36e5) : null)
const LATE_H = 48

async function tenantMap(db) {
  const ts = await db.collection('tenants').find({}, { projection: { id: 1, name: 1 } }).toArray()
  return Object.fromEntries(ts.map(t => [t.id, t.name]))
}

export const REQUEST_TYPES = {
  meraaj: 'حجز باكج — معراج B2B',
  password_reset: 'استعادة كلمة مرور',
  cashout: 'سحب عمولة أفلييت',
  refund: 'استرداد (منفذ)',
  verification: 'توثيق مكتب',
}

// unified admin-view status (display only — NEVER written back)
const U = {
  new: 'جديد', needs_action: 'يحتاج إجراء', in_review: 'قيد المراجعة', approved: 'معتمد',
  rejected: 'مرفوض', executed: 'منفذ', completed: 'مكتمل', cancelled: 'ملغى', refunded: 'مسترد', disputed: 'متنازع عليه',
}

function meraajReq(r, tn) {
  const cancPending = r.status === 'approved' && r.cancellation_status === 'requested'
  const unified = cancPending ? 'needs_action'
    : r.status === 'new' ? 'new'
      : r.status === 'approved' ? 'approved'
        : r.status === 'cancelled' ? 'cancelled' : (r.status || '—')
  const lastAt = r.history?.length ? r.history[r.history.length - 1].at : (r.created_at || null)
  return {
    type: 'meraaj', type_label: REQUEST_TYPES.meraaj, id: r.id,
    ref: r.meraaj_booking_ref || r.id, source: 'معراج',
    tenant_id: r.tenant_id, tenant_name: tn[r.tenant_id] || r.tenant_id,
    created_by: r.buyer_office_name || 'مكتب مشترٍ عبر معراج',
    party: r.package_name || null, traveler: r.registrants?.[0]?.name || null, pax: r.seats || null,
    amount: r.total_price ?? null, currency: r.currency || null, payment_method: null,
    created_at: r.created_at || r.history?.[0]?.at || null, updated_at: lastAt,
    status_native: r.status, cancellation_status: r.cancellation_status || null,
    status_unified: unified, status_label: cancPending ? 'يحتاج إجراء — طلب إلغاء معلق' : U[unified] || unified,
    needs_action: r.status === 'new' || cancPending,
    responsible: 'المكتب البائع (اعتماد يدوي)',
    age_hours: HOURS(lastAt),
    late: (r.status === 'new' || cancPending) && (HOURS(lastAt) || 0) > LATE_H,
    has_dispute: !!cancPending, has_refund: false, has_cancellation: !!r.cancellation_status,
  }
}

function pwResetReq(r, tn) {
  const unified = r.status === 'pending' ? 'needs_action' : r.status === 'done' ? 'executed' : r.status === 'rejected' ? 'rejected' : r.status
  return {
    type: 'password_reset', type_label: REQUEST_TYPES.password_reset, id: r.id, ref: r.id, source: 'رحّال',
    tenant_id: r.tenant_id || null, tenant_name: r.tenant_name || tn[r.tenant_id] || '—',
    created_by: r.email || null, party: r.user_name || null,
    amount: null, currency: null, payment_method: null,
    created_at: r.created_at || null, updated_at: r.resolved_at || r.created_at || null,
    status_native: r.status, status_unified: unified, status_label: U[unified] || r.status,
    needs_action: r.status === 'pending', responsible: r.resolved_by || 'السوبر أدمن',
    age_hours: HOURS(r.status === 'pending' ? r.created_at : r.resolved_at),
    late: r.status === 'pending' && (HOURS(r.created_at) || 0) > LATE_H,
    note: r.note || null,
  }
}

function cashoutReq(r, tn) {
  const map = { pending: 'needs_action', processing: 'in_review', paid: 'completed', rejected: 'rejected', applied_to_subscription: 'executed' }
  const unified = map[r.status] || r.status
  return {
    type: 'cashout', type_label: REQUEST_TYPES.cashout, id: r.id, ref: r.id, source: 'أفلييت',
    tenant_id: r.tenant_id, tenant_name: tn[r.tenant_id] || r.tenant_id,
    created_by: r.requested_by || null, party: r.payout_method_snapshot?.account_name || null,
    amount: r.amount_usd ?? null, currency: 'USD',
    payment_method: r.payout_method_snapshot ? `${r.payout_method_snapshot.method_type || ''} ${r.payout_method_snapshot.provider || ''}`.trim() : null,
    created_at: r.created_at || null, updated_at: r.resolved_at || r.created_at || null,
    status_native: r.status, status_unified: unified, status_label: r.status === 'applied_to_subscription' ? 'منفذ — تحويل للاشتراك' : U[unified] || r.status,
    needs_action: ['pending', 'processing'].includes(r.status), responsible: 'السوبر أدمن (معالجة يدوية)',
    age_hours: HOURS(r.created_at),
    late: r.status === 'pending' && (HOURS(r.created_at) || 0) > LATE_H,
    note: r.notes || null,
  }
}

function refundReq(r, tn) {
  return {
    type: 'refund', type_label: REQUEST_TYPES.refund, id: r.id, ref: r.ref_id || r.id, source: 'رحّال',
    tenant_id: r.tenant_id, tenant_name: tn[r.tenant_id] || r.tenant_id,
    created_by: r.created_by || null, party: r.passenger_name || r.client_name || null,
    ref_type: r.ref_type || null,
    amount: r.refund_to_client ?? null, currency: r.currency || null, payment_method: r.payment_method || null,
    created_at: r.created_at || null, updated_at: r.created_at || null,
    status_native: 'executed', status_unified: 'refunded', status_label: 'مسترد (منفذ)',
    needs_action: false, responsible: r.created_by || null,
    age_hours: HOURS(r.created_at), late: false,
    note: r.reason || null, has_refund: true,
  }
}

function verificationReq(s, tn) {
  const v = s.office_verification || {}
  const map = { pending_review: 'needs_action', verified: 'approved', rejected: 'rejected', unverified: 'new' }
  const unified = map[v.status] || v.status || 'new'
  return {
    type: 'verification', type_label: REQUEST_TYPES.verification, id: s.tenant_id, ref: s.tenant_id, source: 'رحّال',
    tenant_id: s.tenant_id, tenant_name: s.agency_name || tn[s.tenant_id] || s.tenant_id,
    created_by: null, party: s.agency_name || null,
    amount: null, currency: null, payment_method: null,
    created_at: v.submitted_at || null, updated_at: v.reviewed_at || v.submitted_at || null,
    status_native: v.status || 'unverified', status_unified: unified,
    status_label: v.status === 'pending_review' ? 'يحتاج إجراء — قيد المراجعة' : U[unified] || v.status,
    needs_action: v.status === 'pending_review', responsible: 'السوبر أدمن',
    age_hours: HOURS(v.submitted_at),
    late: v.status === 'pending_review' && (HOURS(v.submitted_at) || 0) > LATE_H,
    note: v.reject_reason || null,
  }
}

async function fetchType(db, type, f, cap, tn) {
  if (type === 'meraaj') return (await db.collection('meraaj_inbound_bookings').find(f, { projection: { _id: 0, registrants: { $slice: 1 } } }).sort({ created_at: -1 }).limit(cap).toArray()).map(r => meraajReq(r, tn))
  if (type === 'password_reset') return (await db.collection('password_reset_requests').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(cap).toArray()).map(r => pwResetReq(r, tn))
  if (type === 'cashout') return (await db.collection('cashout_requests').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(cap).toArray()).map(r => cashoutReq(r, tn))
  if (type === 'refund') return (await db.collection('refunds').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(cap).toArray()).map(r => refundReq(r, tn))
  if (type === 'verification') {
    const q = { office_verification: { $exists: true }, ...(f.tenant_id ? { tenant_id: f.tenant_id } : {}) }
    return (await db.collection('tenant_settings').find(q, { projection: { _id: 0, tenant_id: 1, agency_name: 1, office_verification: 1 } }).limit(cap).toArray()).map(s => verificationReq(s, tn))
  }
  return []
}

async function list(db, p) {
  const tn = await tenantMap(db)
  const limit = LIM(p.get('limit')), skip = Math.max(parseInt(p.get('skip')) || 0, 0)
  const type = p.get('type') || 'all'
  const types = type === 'all' ? Object.keys(REQUEST_TYPES) : (REQUEST_TYPES[type] ? [type] : [])
  if (!types.length) return { error: 'نوع طلب غير معروف' }
  const base = {}
  if (p.get('tenant')) base.tenant_id = p.get('tenant')
  const from = p.get('from'), to = p.get('to')
  if (from || to) { base.created_at = {}; if (from) base.created_at.$gte = new Date(from); if (to) base.created_at.$lte = new Date(to + 'T23:59:59.999Z') }
  const q = (p.get('q') || '').trim()
  const cap = limit + skip + 50 // small over-fetch per type before unified sort (bounded)
  const batches = await Promise.all(types.map(t => {
    const f = { ...base }
    if (q) {
      if (t === 'meraaj') f.$or = [{ id: q }, { meraaj_booking_ref: { $regex: q, $options: 'i' } }, { buyer_office_name: { $regex: q, $options: 'i' } }, { package_name: { $regex: q, $options: 'i' } }]
      if (t === 'password_reset') f.$or = [{ id: q }, { email: { $regex: q, $options: 'i' } }, { user_name: { $regex: q, $options: 'i' } }, { tenant_name: { $regex: q, $options: 'i' } }]
      if (t === 'cashout') f.$or = [{ id: q }, { requested_by: { $regex: q, $options: 'i' } }]
      if (t === 'refund') f.$or = [{ id: q }, { ref_id: q }, { passenger_name: { $regex: q, $options: 'i' } }, { client_name: { $regex: q, $options: 'i' } }]
      if (t === 'verification') f.$or = [{ tenant_id: q }, { agency_name: { $regex: q, $options: 'i' } }]
    }
    return fetchType(db, t, f, cap, tn).catch(() => [])
  }))
  let rows = batches.flat()
  const st = p.get('status')
  if (st) rows = rows.filter(r => r.status_unified === st || r.status_native === st)
  if (p.get('needs_action') === '1') rows = rows.filter(r => r.needs_action)
  if (p.get('late') === '1') rows = rows.filter(r => r.late)
  if (p.get('currency')) rows = rows.filter(r => r.currency === p.get('currency'))
  rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  const total_matched = rows.length
  rows = rows.slice(skip, skip + limit)
  return { rows, limit, skip, total_matched, read_only: true, note: 'نافذة إدارية موحدة تقرأ دورات العمل القائمة كما هي — الحالات الأصلية لا تُمس، والحالة الموحدة للعرض فقط' }
}

async function overview(db, p) {
  const tn = await tenantMap(db)
  const base = p.get('tenant') ? { tenant_id: p.get('tenant') } : {}
  const all = (await Promise.all(Object.keys(REQUEST_TYPES).map(t => fetchType(db, t, { ...base }, 1500, tn).catch(() => [])))).flat()
  const byType = {}, queues = { new: 0, needs_action: 0, late: 0, in_review: 0, approved: 0, rejected: 0, executed: 0, completed: 0, cancelled: 0, refunded: 0 }
  for (const r of all) {
    byType[r.type] = byType[r.type] || { label: r.type_label, total: 0, needs_action: 0, late: 0 }
    byType[r.type].total++
    if (r.needs_action) byType[r.type].needs_action++
    if (r.late) byType[r.type].late++
    if (queues[r.status_unified] !== undefined) queues[r.status_unified]++
    if (r.needs_action) queues.needs_action = queues.needs_action // counted below
  }
  queues.needs_action = all.filter(r => r.needs_action).length
  queues.late = all.filter(r => r.late).length
  return { by_type: byType, queues, total: all.length, sample_cap_per_type: 1500, read_only: true }
}

async function detail(db, p) {
  const tn = await tenantMap(db)
  const type = p.get('type'), id = p.get('id')
  if (!REQUEST_TYPES[type] || !id) return { error: 'معاملات ناقصة' }
  if (type === 'meraaj') {
    const doc = await db.collection('meraaj_inbound_bookings').findOne({ id }, { projection: { _id: 0 } })
    if (!doc) return { error: 'الطلب غير موجود', status: 404 }
    const [booking, jes] = await Promise.all([
      doc.booking_id ? db.collection('package_bookings').findOne({ id: doc.booking_id }, { projection: { _id: 0 } }) : null,
      doc.booking_id ? db.collection('journal_entries').find({ ref_id: doc.booking_id }, { projection: { _id: 0 } }).toArray() : [],
    ])
    return {
      row: meraajReq(doc, tn), doc, linked_booking: booking, journal_entries: jes,
      timeline: (doc.history || []).map(h => ({ at: h.at, ev: h.action, by: h.actor, note: h.note || null })),
      links: { commission: doc.agent_commission_total ? { src: 'meraaj', id: doc.id } : null },
      actions_note: 'الاعتماد/الإلغاء يتمان من واجهة معراج داخل مكتب البائع (المسار القائم) — إتاحتهما للسوبر أدمن نقطة تحتاج قراراً',
      read_only: true,
    }
  }
  if (type === 'password_reset') {
    const doc = await db.collection('password_reset_requests').findOne({ id }, { projection: { _id: 0 } })
    if (!doc) return { error: 'الطلب غير موجود', status: 404 }
    const timeline = [{ at: doc.created_at, ev: 'تقديم الطلب', by: doc.email }]
    if (doc.resolved_at) timeline.push({ at: doc.resolved_at, ev: doc.status === 'done' ? 'تعيين كلمة مرور جديدة' : 'رفض الطلب', by: doc.resolved_by })
    return { row: pwResetReq(doc, tn), doc, timeline, actions_note: 'المعالجة (تعيين/رفض) متاحة في اللوحة الكلاسيكية عبر API القائم /admin/password-reset-requests — لم تُكرر هنا', read_only: true }
  }
  if (type === 'cashout') {
    const doc = await db.collection('cashout_requests').findOne({ id }, { projection: { _id: 0 } })
    if (!doc) return { error: 'الطلب غير موجود', status: 404 }
    const t = await db.collection('tenants').findOne({ id: doc.tenant_id }, { projection: { _id: 0, name: 1, affiliate: 1 } })
    return {
      row: cashoutReq(doc, tn), doc, tenant_affiliate: t?.affiliate || null,
      timeline: [{ at: doc.created_at, ev: `طلب سحب — الحالة: ${doc.status}`, by: doc.requested_by }],
      actions_note: 'لا يوجد مسار معالجة (processing/paid) منفذ في النظام حالياً — فجوة موثقة تحتاج قراراً',
      read_only: true,
    }
  }
  if (type === 'refund') {
    const doc = await db.collection('refunds').findOne({ id }, { projection: { _id: 0 } })
    if (!doc) return { error: 'السجل غير موجود', status: 404 }
    const coll = doc.ref_type === 'ticket' ? 'tickets' : doc.ref_type === 'visa' ? 'visas' : 'services'
    const [orig, je] = await Promise.all([
      doc.ref_id ? db.collection(coll).findOne({ id: doc.ref_id }, { projection: { _id: 0 } }) : null,
      doc.refund_je_id ? db.collection('journal_entries').findOne({ id: doc.refund_je_id }, { projection: { _id: 0 } }) : null,
    ])
    return {
      row: refundReq(doc, tn), doc, original_op: orig, refund_je: je,
      timeline: [{ at: doc.created_at, ev: 'تنفيذ الاسترداد (عكس + غرامة مورد + رسوم مكتب)', by: doc.created_by }],
      read_only: true,
    }
  }
  if (type === 'verification') {
    const s = await db.collection('tenant_settings').findOne({ tenant_id: id }, { projection: { _id: 0, tenant_id: 1, agency_name: 1, office_verification: 1 } })
    if (!s?.office_verification) return { error: 'لا يوجد طلب توثيق لهذا المكتب', status: 404 }
    const docs = await db.collection('office_documents').find({ tenant_id: id }, { projection: { _id: 0, id: 1, doc_type: 1, label: 1, filename: 1, size: 1, uploaded_at: 1 } }).toArray()
    const v = s.office_verification
    const timeline = []
    if (v.submitted_at) timeline.push({ at: v.submitted_at, ev: 'تقديم مستندات التوثيق', by: s.agency_name })
    if (v.reviewed_at) timeline.push({ at: v.reviewed_at, ev: v.status === 'verified' ? 'اعتماد التوثيق' : `قرار: ${v.status}${v.reject_reason ? ` — ${v.reject_reason}` : ''}`, by: 'السوبر أدمن' })
    return { row: verificationReq(s, tn), doc: v, documents: docs, timeline, actions_note: 'القرار (اعتماد/رفض) متاح عبر API القائم /admin/office-verifications/:id/decision في اللوحة الكلاسيكية — لم يُكرر هنا', read_only: true }
  }
  return { error: 'نوع غير معروف' }
}

export async function adminRequestsHandler(db, path, p) {
  if (path === '/overview') return overview(db, p)
  if (path === '/list') return list(db, p)
  if (path === '/detail') return detail(db, p)
  return { error: 'مسار غير معروف', status: 404 }
}
