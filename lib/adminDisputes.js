// ============================================================================
// v3.96 — ADMIN DISPUTES CENTER (Super Admin Batch 4).
// New engine (none existed): collections `disputes`, `dispute_attachments`,
// config doc `admin_dispute_config` (managed lists). FINANCIAL SAFETY:
// this center NEVER touches balances / never creates refunds or holds — a
// financial decision is recorded as `pending_execution` and must go through
// the standard financial path (documented decision point). Status machine is
// enforced server-side. Every sensitive action needs a reason + audit_logs.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import { emitAdminNotification } from './adminNotify'

async function logAudit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'disputes', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* never break */ }
}

// ---------- managed lists (stored config; these are the STARTING values,
// editable from the UI — used items can never be removed) ----------
export const DEFAULT_DISPUTE_CONFIG = {
  id: 'admin_dispute_config',
  types: [
    { key: 'ticket', label: 'نزاع تذكرة', active: true }, { key: 'visa', label: 'نزاع تأشيرة', active: true },
    { key: 'service', label: 'نزاع خدمة', active: true }, { key: 'package_booking', label: 'نزاع باكج', active: true },
    { key: 'meraaj', label: 'نزاع طلب معراج', active: true }, { key: 'payment', label: 'نزاع دفع/تحويل', active: true },
    { key: 'refund', label: 'نزاع استرداد', active: true }, { key: 'commission', label: 'نزاع عمولة', active: true },
    { key: 'client', label: 'نزاع مع عميل', active: true }, { key: 'supplier', label: 'نزاع مع مورد', active: true },
    { key: 'office', label: 'نزاع مع مكتب', active: true }, { key: 'general', label: 'نزاع عام (بلا مرجع)', active: true },
  ],
  reasons: [
    { key: 'not_delivered', label: 'خدمة لم تُقدم', active: true }, { key: 'amount_mismatch', label: 'اختلاف مبلغ', active: true },
    { key: 'quality', label: 'جودة/مواصفات مخالفة', active: true }, { key: 'delay', label: 'تأخير', active: true },
    { key: 'double_charge', label: 'خصم مكرر', active: true }, { key: 'refund_dispute', label: 'خلاف على استرداد', active: true },
    { key: 'other', label: 'أخرى', active: true },
  ],
  reject_reasons: [
    { key: 'no_evidence', label: 'لا توجد أدلة كافية', active: true }, { key: 'out_of_policy', label: 'خارج السياسة', active: true },
    { key: 'expired', label: 'تجاوز المدة المسموحة', active: true }, { key: 'duplicate', label: 'نزاع مكرر', active: true },
  ],
  priorities: [
    { key: 'low', label: 'منخفضة', sla_hours: 168, active: true }, { key: 'normal', label: 'عادية', sla_hours: 72, active: true },
    { key: 'high', label: 'عالية', sla_hours: 24, active: true }, { key: 'critical', label: 'حرجة', sla_hours: 8, active: true },
  ],
}

const REF_COLL = { ticket: 'tickets', visa: 'visas', service: 'services', package_booking: 'package_bookings', meraaj: 'meraaj_inbound_bookings', payment: 'vouchers', refund: 'refunds', commission: null, client: 'clients', supplier: 'suppliers', office: 'tenants' }

// enforced status machine — invalid transitions are rejected
const TRANSITIONS = {
  open: ['in_review', 'rejected', 'closed'],
  in_review: ['awaiting_docs', 'awaiting_party', 'escalated', 'resolved', 'rejected'],
  awaiting_docs: ['in_review', 'escalated', 'rejected'],
  awaiting_party: ['in_review', 'escalated', 'rejected'],
  escalated: ['in_review', 'resolved', 'rejected'],
  resolved: ['closed', 'reopened'],
  rejected: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['in_review'],
}

async function getConfig(db) {
  const stored = await db.collection('platform_settings').findOne({ id: 'admin_dispute_config' })
  if (stored) { const { _id, ...rest } = stored; return rest }
  return { ...DEFAULT_DISPUTE_CONFIG, is_defaults: true } // starting values — stored on first edit
}

const slaDue = (cfg, priority, createdAt) => {
  const pr = (cfg.priorities || []).find(x => x.key === priority)
  return pr?.sla_hours ? new Date(new Date(createdAt).getTime() + pr.sla_hours * 36e5) : null
}

async function tenantMap(db) {
  const ts = await db.collection('tenants').find({}, { projection: { id: 1, name: 1 } }).toArray()
  return Object.fromEntries(ts.map(t => [t.id, t.name]))
}

const pub = (d, tn) => ({
  ...d, tenant_name: tn[d.tenant_id] || d.tenant_id || '—',
  overdue: !!(d.sla_due && !['resolved', 'rejected', 'closed'].includes(d.status) && new Date(d.sla_due) < new Date()),
})

export async function adminDisputesHandler(db, path, method, p, b, sess) {
  const tn = await tenantMap(db)

  // ---------- CONFIG (managed lists) ----------
  if (path === '/config' && method === 'GET') {
    const cfg = await getConfig(db)
    return { config: cfg, note: cfg.is_defaults ? 'قيم البداية — تُحفظ كإعداد قابل للإدارة عند أول تعديل' : null }
  }
  if (path === '/config' && method === 'PUT') {
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب لتعديل القوائم (Audit)' }
    const before = await getConfig(db)
    const next = { id: 'admin_dispute_config' }
    for (const listKey of ['types', 'reasons', 'reject_reasons', 'priorities']) {
      const incoming = Array.isArray(b[listKey]) ? b[listKey] : before[listKey]
      // never remove an item that is used historically — deactivate instead
      const beforeKeys = (before[listKey] || []).map(x => x.key)
      for (const bk of beforeKeys) {
        if (!incoming.find(x => x.key === bk)) {
          const usedField = listKey === 'types' ? 'type' : listKey === 'reasons' ? 'reason' : listKey === 'priorities' ? 'priority' : 'reject_reason'
          const used = await db.collection('disputes').countDocuments({ [usedField]: bk })
          if (used > 0) return { error: `لا يمكن حذف «${bk}» من ${listKey} — مستخدم في ${used} نزاع. عطّله بدلاً من الحذف` }
        }
      }
      next[listKey] = incoming.map(x => ({ key: String(x.key).slice(0, 40), label: String(x.label || x.key).slice(0, 100), active: x.active !== false, ...(listKey === 'priorities' ? { sla_hours: Math.max(1, parseInt(x.sla_hours) || 72) } : {}) }))
    }
    next.updated_by = sess.user.email; next.updated_at = new Date()
    await db.collection('platform_settings').updateOne({ id: 'admin_dispute_config' }, { $set: next }, { upsert: true })
    await logAudit(db, sess, 'dispute_config_update', 'admin_dispute_config', { counts: Object.fromEntries(['types', 'reasons', 'reject_reasons', 'priorities'].map(k => [k, (before[k] || []).length])) }, { counts: Object.fromEntries(['types', 'reasons', 'reject_reasons', 'priorities'].map(k => [k, next[k].length])) }, b.reason)
    return { success: true }
  }

  // ---------- LIST + QUEUES ----------
  if (path === '' && method === 'GET') {
    const f = {}
    if (p.get('tenant')) f.tenant_id = p.get('tenant')
    if (p.get('status')) f.status = p.get('status')
    if (p.get('priority')) f.priority = p.get('priority')
    if (p.get('type')) f.type = p.get('type')
    if (p.get('assignee')) f.assignee = { $regex: p.get('assignee'), $options: 'i' }
    if (p.get('currency')) f.currency = p.get('currency')
    const from = p.get('from'), to = p.get('to')
    if (from || to) { f.created_at = {}; if (from) f.created_at.$gte = new Date(from); if (to) f.created_at.$lte = new Date(to + 'T23:59:59.999Z') }
    const q = (p.get('q') || '').trim()
    if (q) f.$or = [{ id: q }, { ref_id: q }, { desc: { $regex: q, $options: 'i' } }, { party: { $regex: q, $options: 'i' } }, { counterparty: { $regex: q, $options: 'i' } }]
    let rows = (await db.collection('disputes').find(f, { projection: { _id: 0, timeline: 0 } }).sort({ created_at: -1 }).limit(300).toArray()).map(d => pub(d, tn))
    if (p.get('overdue') === '1') rows = rows.filter(r => r.overdue)
    const all = (await db.collection('disputes').find({}, { projection: { _id: 0, status: 1, priority: 1, sla_due: 1 } }).limit(3000).toArray()).map(d => pub(d, tn))
    const queues = {
      open: all.filter(d => d.status === 'open').length,
      needs_action: all.filter(d => ['open', 'in_review', 'escalated', 'reopened'].includes(d.status)).length,
      overdue: all.filter(d => d.overdue).length,
      critical: all.filter(d => d.priority === 'critical' && !['resolved', 'rejected', 'closed'].includes(d.status)).length,
      awaiting_docs: all.filter(d => d.status === 'awaiting_docs').length,
      awaiting_party: all.filter(d => d.status === 'awaiting_party').length,
      escalated: all.filter(d => d.status === 'escalated').length,
      resolved_closed: all.filter(d => ['resolved', 'closed'].includes(d.status)).length,
    }
    return { rows, queues, total: all.length }
  }

  // ---------- CREATE ----------
  if (path === '/create' && method === 'POST') {
    const cfg = await getConfig(db)
    const type = b?.type
    if (!(cfg.types || []).find(t => t.key === type && t.active)) return { error: 'نوع نزاع غير معروف أو معطل' }
    if (!(cfg.reasons || []).find(r => r.key === b?.reason_key && r.active)) return { error: 'سبب النزاع مطلوب من القائمة' }
    if (!String(b?.desc || '').trim()) return { error: 'وصف النزاع مطلوب' }
    const priority = (cfg.priorities || []).find(x => x.key === b?.priority && x.active) ? b.priority : 'normal'
    // reference validation — a dispute must point to a REAL record unless type=general
    let refDoc = null
    if (type !== 'general') {
      const coll = REF_COLL[type]
      if (coll && b?.ref_id) refDoc = await db.collection(coll).findOne(coll === 'tenants' ? { id: b.ref_id } : { id: b.ref_id }, { projection: { _id: 0, id: 1, tenant_id: 1, currency: 1, client_name: 1, supplier_name: 1, name: 1 } })
      if (!refDoc) return { error: 'المرجع الأصلي غير موجود — لا يُنشأ نزاع بلا مرجع إلا كـ«نزاع عام» بسبب واضح', status: 404 }
    }
    const tenant_id = refDoc?.tenant_id || (type === 'office' ? b.ref_id : b?.tenant_id) || null
    // snapshot the tenant's CURRENT fx rate for the disputed currency (never recomputed)
    let rate_snapshot = null
    if (b?.currency && tenant_id) {
      const s = await db.collection('tenant_settings').findOne({ tenant_id }, { projection: { rates: 1 } })
      const r = s?.rates?.[b.currency]
      rate_snapshot = r ? { currency: b.currency, rate: typeof r === 'object' ? (r.transfer ?? r.buy ?? null) : r, at: new Date(), source: 'tenant_settings.rates' } : null
    }
    const now = new Date()
    const doc = {
      id: uuidv4(), type, reason: b.reason_key, desc: String(b.desc).slice(0, 2000),
      priority, status: 'open',
      tenant_id, branch: b?.branch || null,
      complainant: String(b?.complainant || sess.user.email).slice(0, 120),
      counterparty: String(b?.counterparty || '').slice(0, 120) || null,
      party: refDoc?.client_name || refDoc?.name || b?.party || null,
      supplier_name: refDoc?.supplier_name || null,
      ref_type: type === 'general' ? null : type, ref_id: type === 'general' ? null : (b.ref_id || null),
      amount: b?.amount != null ? Number(b.amount) : null, currency: b?.currency || refDoc?.currency || null,
      rate_snapshot,
      assignee: b?.assignee || null,
      sla_due: slaDue(cfg, priority, now),
      decision: null, financial_status: null, financial_ref: null,
      attachments: [],
      created_by: sess.user.email, created_at: now, updated_at: now,
      resolved_at: null, closed_at: null,
      timeline: [{ at: now, by: sess.user.email, ev: 'create', note: `فتح النزاع — ${b.reason_key}` }],
    }
    await db.collection('disputes').insertOne({ ...doc })
    await logAudit(db, sess, 'dispute_create', doc.id, null, { type, priority, tenant_id, ref_id: doc.ref_id, amount: doc.amount, currency: doc.currency }, b.desc.slice(0, 200))
    await emitAdminNotification(db, { type: 'dispute_event', title: `⚖️ نزاع جديد (${priority}) — ${tn[tenant_id] || 'عام'}`, body: b.desc.slice(0, 150), priority: priority === 'critical' ? 'critical' : 'action', tenant_id, link: { section: 'disputes' }, ref_type: 'dispute', ref_id: doc.id, dedupe_key: `dispute_new_${doc.id}` })
    const { timeline, ...rest } = doc
    return { success: true, dispute: pub(rest, tn) }
  }

  // ---------- per-dispute routes ----------
  const dm = path.match(/^\/([^/]+)(\/(reply|assign|status|decision|close|reopen|attachments))?$/)
  if (!dm) {
    // attachment download
    const am = path.match(/^\/attachments\/download$/)
    if (am && method === 'GET') {
      const att = await db.collection('dispute_attachments').findOne({ id: p.get('id') }, { projection: { _id: 0 } })
      if (!att) return { error: 'المرفق غير موجود', status: 404 }
      return { filename: att.filename, mime: att.mime, data_base64: att.data_base64 }
    }
    return { error: 'مسار غير معروف', status: 404 }
  }
  if (dm[1] === 'attachments' && !dm[2]) return { error: 'مسار غير معروف', status: 404 }
  const d = await db.collection('disputes').findOne({ id: dm[1] })
  if (!d) return { error: 'النزاع غير موجود', status: 404 }
  const sub = dm[3] || null

  // GET detail
  if (!sub && method === 'GET') {
    const links = { original: null, journal_entries: [], vouchers: [] }
    if (d.ref_id && REF_COLL[d.ref_type]) {
      links.original = await db.collection(REF_COLL[d.ref_type]).findOne({ id: d.ref_id }, { projection: { _id: 0 } }).catch(() => null)
      links.journal_entries = await db.collection('journal_entries').find({ ref_id: d.ref_id }, { projection: { _id: 0, id: 1, description: 1, date: 1 } }).limit(20).toArray().catch(() => [])
      links.vouchers = await db.collection('vouchers').find({ ref_id: d.ref_id }, { projection: { _id: 0, id: 1, type: 1, amount: 1, currency: 1 } }).limit(20).toArray().catch(() => [])
    }
    const { _id, ...doc } = d
    return { dispute: pub(doc, tn), links, transitions: TRANSITIONS[d.status] || [], financial_note: 'لا تعديل أرصدة من مركز النزاعات — القرار المالي يُسجل «بانتظار التنفيذ» ويمر عبر المسار المالي القياسي (نقطة قرار)' }
  }

  const push = (ev, note, extra = {}) => db.collection('disputes').updateOne({ id: d.id }, { $set: { updated_at: new Date(), ...extra }, $push: { timeline: { at: new Date(), by: sess.user.email, ev, note } } })

  // reply / note
  if (sub === 'reply' && method === 'POST') {
    if (!String(b?.note || '').trim()) return { error: 'النص مطلوب' }
    await push('reply', String(b.note).slice(0, 1500))
    return { success: true }
  }
  // assign
  if (sub === 'assign' && method === 'POST') {
    if (!String(b?.assignee || '').trim() || !String(b?.reason || '').trim()) return { error: 'المسؤول والسبب مطلوبان' }
    await push('assign', `تعيين المسؤول: ${b.assignee} — ${b.reason}`, { assignee: String(b.assignee).slice(0, 120) })
    await logAudit(db, sess, 'dispute_assign', d.id, { assignee: d.assignee }, { assignee: b.assignee }, b.reason)
    return { success: true }
  }
  // status transition (machine-enforced)
  if (sub === 'status' && method === 'POST') {
    const to = b?.to
    if (!(TRANSITIONS[d.status] || []).includes(to)) return { error: `انتقال غير مسموح: ${d.status} ← ${to}. المسموح: ${(TRANSITIONS[d.status] || []).join('، ') || 'لا شيء'}` }
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب لتغيير الحالة (Audit)' }
    if (['resolved', 'rejected'].includes(to)) return { error: 'الحل/الرفض يتم حصراً عبر «إصدار القرار» لضمان تسجيل القرار والأثر' }
    const extra = { status: to }
    if (to === 'reopened') { extra.resolved_at = null; extra.closed_at = null }
    await push('status', `${d.status} ← ${to} — ${b.reason}`, extra)
    await logAudit(db, sess, 'dispute_status', d.id, { status: d.status }, { status: to }, b.reason)
    return { success: true, status: to }
  }
  // decision (resolve / reject) — Maker–Checker for financial impact
  if (sub === 'decision' && method === 'POST') {
    if (!['in_review', 'escalated'].includes(d.status)) return { error: `القرار يصدر من حالة قيد المراجعة/مصعّد فقط (الحالية: ${d.status})` }
    const outcome = b?.outcome
    if (!['in_favor_complainant', 'in_favor_counterparty', 'partial', 'no_fault', 'rejected'].includes(outcome)) return { error: 'نتيجة القرار مطلوبة' }
    if (!String(b?.decision_text || '').trim() || !String(b?.reason || '').trim()) return { error: 'نص القرار والسبب مطلوبان (Audit)' }
    if (outcome === 'rejected') {
      const cfg = await getConfig(db)
      if (!(cfg.reject_reasons || []).find(r => r.key === b?.reject_reason && r.active)) return { error: 'سبب الرفض مطلوب من القائمة' }
    }
    if (d.decision) return { error: 'صدر قرار مسبقاً — منع تكرار. أعد الفتح أولاً إن لزم', status: 409 }
    const fin = b?.financial_impact && Number(b.financial_impact.amount) > 0 ? {
      amount: +Number(b.financial_impact.amount).toFixed(2),
      currency: b.financial_impact.currency || d.currency,
      direction: b.financial_impact.direction === 'charge' ? 'charge' : 'refund',
    } : null
    if (fin) {
      if (String(b?.confirm_text || '').trim() !== 'أؤكد القرار المالي') return { error: 'التأكيد الكتابي مطلوب: اكتب «أؤكد القرار المالي» حرفياً' }
      // Maker–Checker: with more than one super admin, the decider must differ from the dispute creator
      const admins = await db.collection('users').countDocuments({ role: 'super_admin', active: { $ne: false } })
      if (admins > 1 && d.created_by === sess.user.email) return { error: 'Maker–Checker: القرار المالي يجب أن يصدره سوبر أدمن آخر غير منشئ النزاع' }
    }
    const newStatus = outcome === 'rejected' ? 'rejected' : 'resolved'
    const decision = {
      outcome, text: String(b.decision_text).slice(0, 1500), reject_reason: b?.reject_reason || null,
      financial_impact: fin, decided_by: sess.user.email, decided_at: new Date(),
    }
    await push('decision', `قرار: ${outcome}${fin ? ` — أثر مالي ${fin.amount} ${fin.currency} (${fin.direction === 'refund' ? 'استرداد' : 'تحميل'})` : ''} — ${b.reason}`, {
      status: newStatus, decision, resolved_at: new Date(),
      financial_status: fin ? 'pending_execution' : null, financial_ref: null,
    })
    await logAudit(db, sess, 'dispute_decision', d.id, { status: d.status }, { status: newStatus, outcome, financial_impact: fin }, b.reason)
    await emitAdminNotification(db, { type: 'dispute_event', title: `⚖️ قرار نزاع — ${outcome === 'rejected' ? 'رفض' : 'حل'}${fin ? ' (أثر مالي بانتظار التنفيذ)' : ''}`, body: decision.text.slice(0, 150), priority: fin ? 'warning' : 'info', tenant_id: d.tenant_id, link: { section: 'disputes' }, ref_type: 'dispute', ref_id: d.id, dedupe_key: `dispute_decision_${d.id}` })
    return { success: true, status: newStatus, financial_note: fin ? 'الأثر المالي مسجل «بانتظار التنفيذ» — التنفيذ يمر عبر المسار المالي القياسي (سند/استرداد من الوحدة المختصة) — لا يلمس هذا المركز أي رصيد' : null }
  }
  // close / reopen
  if (sub === 'close' && method === 'POST') {
    if (!(TRANSITIONS[d.status] || []).includes('closed')) return { error: `لا يُغلق من حالة ${d.status}` }
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب' }
    await push('close', b.reason, { status: 'closed', closed_at: new Date() })
    await logAudit(db, sess, 'dispute_close', d.id, { status: d.status }, { status: 'closed' }, b.reason)
    return { success: true }
  }
  if (sub === 'reopen' && method === 'POST') {
    if (!(TRANSITIONS[d.status] || []).includes('reopened')) return { error: `لا يُعاد فتحه من حالة ${d.status}` }
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب' }
    await push('reopen', b.reason, { status: 'reopened', resolved_at: null, closed_at: null })
    await logAudit(db, sess, 'dispute_reopen', d.id, { status: d.status }, { status: 'reopened' }, b.reason)
    return { success: true }
  }
  // attachments (upload + guarded delete)
  if (sub === 'attachments' && method === 'POST') {
    const { filename, mime, data_base64, label } = b || {}
    const ALLOWED = ['image/png', 'image/jpeg', 'application/pdf']
    if (!filename || !data_base64) return { error: 'الملف مطلوب' }
    if (!ALLOWED.includes(mime)) return { error: 'الأنواع المسموحة: PNG / JPG / PDF' }
    const size = Math.ceil(String(data_base64).length * 0.75)
    if (size > 2 * 1024 * 1024) return { error: 'الحد الأقصى 2MB' }
    const att = { id: uuidv4(), dispute_id: d.id, filename: String(filename).slice(0, 200), mime, size, label: String(label || '').slice(0, 120), uploaded_by: sess.user.email, uploaded_at: new Date(), data_base64 }
    await db.collection('dispute_attachments').insertOne({ ...att })
    const { data_base64: _x, ...meta } = att
    await db.collection('disputes').updateOne({ id: d.id }, { $push: { attachments: meta, timeline: { at: new Date(), by: sess.user.email, ev: 'attachment', note: `رفع مرفق: ${att.filename}` } }, $set: { updated_at: new Date() } })
    await logAudit(db, sess, 'dispute_attachment_upload', d.id, null, { filename: att.filename, size }, b?.label)
    return { success: true, attachment: meta }
  }
  if (sub === 'attachments' && method === 'DELETE') {
    // evidence used in a final decision can never be deleted
    if (d.decision || ['resolved', 'rejected', 'closed'].includes(d.status)) return { error: 'لا يُحذف دليل بعد صدور قرار نهائي — السجل محفوظ' }
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب لحذف مرفق (Audit)' }
    const attId = b?.attachment_id
    await db.collection('dispute_attachments').deleteOne({ id: attId, dispute_id: d.id })
    await db.collection('disputes').updateOne({ id: d.id }, { $pull: { attachments: { id: attId } }, $push: { timeline: { at: new Date(), by: sess.user.email, ev: 'attachment_delete', note: `حذف مرفق — ${b.reason}` } } })
    await logAudit(db, sess, 'dispute_attachment_delete', d.id, { attachment_id: attId }, null, b.reason)
    return { success: true }
  }

  return { error: 'مسار غير معروف', status: 404 }
}
