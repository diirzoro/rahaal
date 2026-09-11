// ============================================================================
// v3.95 — ADMIN NOTIFICATIONS CENTER (Super Admin Batch 3) — In-App only.
// There was NO notifications system in the codebase before this — this is the
// first one, built minimal and honest:
//  - STORED notifications (`admin_notifications`): emitted ONLY by the new
//    Batch-3 flows (backup done/failed, restore requests, maintenance change,
//    notification-settings changes). Idempotent via dedupe_key.
//  - DERIVED feed: computed live from REAL operational data (requests center
//    queues + health alerts) — nothing stored, nothing faked.
//  - SETTINGS (`admin_notification_settings`): type catalog with an honest
//    `wired` flag — types without an emit source are clearly marked unwired.
//  - Read/archive state is PER-USER (read_by / archived_by maps).
//  - Channels: In-App only. SMS/Push/Email marketing NOT implemented.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import { adminRequestsHandler } from './adminRequests'

async function logAudit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'notifications', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* never break */ }
}

const PRIORITIES = ['info', 'action', 'warning', 'critical']

// type catalog — `wired: true` means a real emit point exists TODAY.
// Unwired types exist as settings only and say so — no fake sources.
export const NOTIFICATION_TYPES = {
  backup_completed: { label: 'اكتمال نسخة احتياطية', source: 'مركز النسخ (Batch 3)', wired: true, default_priority: 'info', needs_action: false },
  backup_failed: { label: 'فشل نسخة احتياطية', source: 'مركز النسخ (Batch 3)', wired: true, default_priority: 'critical', needs_action: true },
  restore_request: { label: 'طلب استعادة', source: 'مسار الاستعادة (Batch 3)', wired: true, default_priority: 'action', needs_action: true },
  maintenance_change: { label: 'تغيير إعداد الصيانة', source: 'إدارة النظام (Batch 3)', wired: true, default_priority: 'warning', needs_action: false },
  settings_change: { label: 'تغيير إعدادات الإشعارات', source: 'مركز الإشعارات (Batch 3)', wired: true, default_priority: 'info', needs_action: false },
  meraaj_new_request: { label: 'حجز معراج جديد', source: 'مشتق مباشرة من مركز الطلبات (لا تخزين)', wired: 'derived', default_priority: 'action', needs_action: true },
  meraaj_cancellation: { label: 'طلب إلغاء معراج معلق', source: 'مشتق من مركز الطلبات', wired: 'derived', default_priority: 'warning', needs_action: true },
  password_reset_pending: { label: 'طلب استعادة كلمة مرور معلق', source: 'مشتق من مركز الطلبات', wired: 'derived', default_priority: 'action', needs_action: true },
  cashout_pending: { label: 'طلب سحب عمولة معلق', source: 'مشتق من مركز الطلبات', wired: 'derived', default_priority: 'action', needs_action: true },
  verification_pending: { label: 'توثيق مكتب قيد المراجعة', source: 'مشتق من مركز الطلبات', wired: 'derived', default_priority: 'action', needs_action: true },
  health_alert: { label: 'تنبيه صحة النظام', source: 'مشتق من فحص الصحة وقت العرض', wired: 'derived', default_priority: 'warning', needs_action: true },
  integration_failure: { label: 'فشل تكامل (معراج)', source: 'مشتق من سجل webhooks', wired: 'derived', default_priority: 'critical', needs_action: true },
  security_login: { label: 'محاولات دخول مشبوهة', source: 'غير مربوط — لا يوجد سجل محاولات دخول فاشلة بالنظام', wired: false, default_priority: 'critical', needs_action: true },
  permission_change: { label: 'تغيير صلاحيات', source: 'غير مربوط كإشعار (مسجل في Audit) — ربطه يتطلب تعديل قسم سابق (نقطة قرار)', wired: false, default_priority: 'warning', needs_action: false },
  subscription_expiry: { label: 'اقتراب انتهاء اشتراك', source: 'غير مربوط — ربطه ببيانات الأقساط نقطة قرار', wired: false, default_priority: 'warning', needs_action: true },
  commission_event: { label: 'أحداث العمولات', source: 'غير مربوط — يتطلب تعديل محركات البيع (ممنوع في هذه الجولة)', wired: false, default_priority: 'info', needs_action: false },
}

async function getSettings(db) {
  const stored = await db.collection('admin_notification_settings').find({}, { projection: { _id: 0 } }).toArray()
  const byType = Object.fromEntries(stored.map(s => [s.type, s]))
  return Object.entries(NOTIFICATION_TYPES).map(([type, def]) => ({
    type, label: byType[type]?.label || def.label, source: def.source, wired: def.wired,
    enabled: byType[type]?.enabled !== undefined ? byType[type].enabled : true,
    default_priority: byType[type]?.default_priority || def.default_priority,
    needs_action: byType[type]?.needs_action !== undefined ? byType[type].needs_action : def.needs_action,
    retention_days: byType[type]?.retention_days ?? 90,
    dedupe: byType[type]?.dedupe !== false,
    recipients: byType[type]?.recipients || 'super_admin', // in-app targeting — backend enforced (super_admin routes only)
    updated_by: byType[type]?.updated_by || null, updated_at: byType[type]?.updated_at || null,
  }))
}

// ---------- EMIT (used by Batch-3 flows only — idempotent) ----------
export async function emitAdminNotification(db, n) {
  try {
    const def = NOTIFICATION_TYPES[n.type]
    if (!def) return { skipped: 'unknown_type' }
    const setting = await db.collection('admin_notification_settings').findOne({ type: n.type })
    if (setting && setting.enabled === false) return { skipped: 'disabled' }
    const dedupeOn = setting ? setting.dedupe !== false : true
    if (dedupeOn && n.dedupe_key) {
      const dup = await db.collection('admin_notifications').findOne({ dedupe_key: n.dedupe_key })
      if (dup) return { skipped: 'duplicate', id: dup.id }
    }
    const doc = {
      id: uuidv4(), type: n.type, type_label: def.label,
      title: String(n.title || '').slice(0, 200), body: String(n.body || '').slice(0, 1000),
      priority: PRIORITIES.includes(n.priority) ? n.priority : (setting?.default_priority || def.default_priority),
      needs_action: n.needs_action ?? (setting?.needs_action ?? def.needs_action),
      source: def.source, tenant_id: n.tenant_id || null,
      audience: { mode: 'super_admin' }, // backend-enforced: only super_admin routes serve these
      link: n.link || null, ref_type: n.ref_type || null, ref_id: n.ref_id || null,
      dedupe_key: n.dedupe_key || null,
      delivery: 'in_app', delivery_result: 'stored', delivery_error: null,
      created_at: new Date(), sent_at: new Date(),
      read_by: {}, archived_by: {}, handled_by: null, handled_at: null,
    }
    await db.collection('admin_notifications').insertOne(doc)
    return { id: doc.id }
  } catch (e) {
    // notification failure must NEVER break or repeat the original operation
    try { await db.collection('admin_notifications').insertOne({ id: uuidv4(), type: n.type, title: n.title, delivery: 'failed', delivery_result: 'failed', delivery_error: String(e.message || e).slice(0, 300), created_at: new Date(), read_by: {}, archived_by: {} }) } catch {}
    return { error: e.message }
  }
}

const userState = (doc, uid) => doc.archived_by?.[uid] ? 'archived' : doc.handled_at ? 'handled' : doc.read_by?.[uid] ? 'read' : 'new'

async function listStored(db, p, sess) {
  const uid = sess.user.id
  const f = {}
  if (p.get('type')) f.type = p.get('type')
  if (p.get('priority')) f.priority = p.get('priority')
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  const from = p.get('from'), to = p.get('to')
  if (from || to) { f.created_at = {}; if (from) f.created_at.$gte = new Date(from); if (to) f.created_at.$lte = new Date(to + 'T23:59:59.999Z') }
  const q = (p.get('q') || '').trim()
  if (q) f.$or = [{ title: { $regex: q, $options: 'i' } }, { body: { $regex: q, $options: 'i' } }]
  let rows = await db.collection('admin_notifications').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(300).toArray()
  rows = rows.map(r => ({ ...r, my_status: userState(r, uid), read_at: r.read_by?.[uid] || null, is_failed: r.delivery === 'failed' }))
  const st = p.get('status')
  if (st === 'unread') rows = rows.filter(r => r.my_status === 'new' && !r.is_failed)
  else if (st === 'read') rows = rows.filter(r => r.my_status === 'read')
  else if (st === 'archived') rows = rows.filter(r => r.my_status === 'archived')
  else if (st === 'handled') rows = rows.filter(r => r.my_status === 'handled')
  else if (st === 'failed') rows = rows.filter(r => r.is_failed)
  else rows = rows.filter(r => r.my_status !== 'archived')
  if (p.get('needs_action') === '1') rows = rows.filter(r => r.needs_action)
  return rows
}

// derived live items — computed from REAL data on every read, never stored
async function derivedFeed(db) {
  const items = []
  try {
    const ov = await adminRequestsHandler(db, '/overview', new URLSearchParams())
    for (const [t, v] of Object.entries(ov.by_type || {})) {
      if (v.needs_action > 0) items.push({
        derived: true, type: t === 'meraaj' ? 'meraaj_new_request' : t === 'password_reset' ? 'password_reset_pending' : t === 'cashout' ? 'cashout_pending' : t === 'verification' ? 'verification_pending' : 'meraaj_new_request',
        title: `⚠️ ${v.label}: ${v.needs_action} طلب يحتاج إجراء${v.late ? ` (منها ${v.late} متأخر)` : ''}`,
        body: 'محسوب لحظياً من بيانات الطلبات الحقيقية — يختفي تلقائياً عند المعالجة',
        priority: v.late > 0 ? 'warning' : 'action', needs_action: true,
        link: { section: 'requests', type: t }, created_at: new Date(),
      })
    }
  } catch {}
  try {
    const errs24h = await db.collection('meraaj_webhook_log').countDocuments({ ok: false, at: { $gte: new Date(Date.now() - 864e5) } })
    if (errs24h > 5) items.push({ derived: true, type: 'integration_failure', title: `🔌 أخطاء تكامل معراج: ${errs24h} خلال 24 ساعة`, body: 'مصدر: meraaj_webhook_log', priority: 'critical', needs_action: true, link: { section: 'system', tab: 'integrations' }, created_at: new Date() })
  } catch {}
  return items
}

export async function adminNotifyHandler(db, path, method, p, b, sess) {
  // ---------- FEED / LIST ----------
  if (path === '/feed' && method === 'GET') {
    const [stored, derived, settings] = await Promise.all([listStored(db, p, sess), derivedFeed(db), getSettings(db)])
    const enabledDerived = new Set(settings.filter(s => s.enabled).map(s => s.type))
    const uid = sess.user.id
    const unread = stored.filter(r => r.my_status === 'new' && !r.is_failed).length
    return {
      stored, derived: derived.filter(d => enabledDerived.has(d.type)),
      counts: {
        unread,
        needs_action: stored.filter(r => r.needs_action && r.my_status === 'new').length + derived.length,
        critical: stored.filter(r => r.priority === 'critical' && r.my_status !== 'archived').length,
        failed: await db.collection('admin_notifications').countDocuments({ delivery: 'failed' }),
        archived: await db.collection('admin_notifications').countDocuments({ [`archived_by.${uid}`]: { $exists: true } }),
      },
      channels: { in_app: 'active', sms: 'not_implemented', push: 'not_implemented', email: 'غير موجود في النظام — لا بنية بريد تشغيلي' },
    }
  }

  // ---------- READ / ARCHIVE (per-user — read state is only for the reader) ----------
  const am = path.match(/^\/([^/]+)\/(read|unread|archive|unarchive|handled)$/)
  if (am && method === 'POST') {
    const doc = await db.collection('admin_notifications').findOne({ id: am[1] })
    if (!doc) return { error: 'الإشعار غير موجود', status: 404 }
    const uid = sess.user.id
    const act = am[2]
    const upd = act === 'read' ? { $set: { [`read_by.${uid}`]: new Date() } }
      : act === 'unread' ? { $unset: { [`read_by.${uid}`]: '' } }
        : act === 'archive' ? { $set: { [`archived_by.${uid}`]: new Date() } } // archive never deletes the source record
          : act === 'unarchive' ? { $unset: { [`archived_by.${uid}`]: '' } }
            : { $set: { handled_by: sess.user.email, handled_at: new Date() } }
    await db.collection('admin_notifications').updateOne({ id: doc.id }, upd)
    return { success: true }
  }
  if (path === '/read-all' && method === 'POST') {
    const uid = sess.user.id
    await db.collection('admin_notifications').updateMany({ [`read_by.${uid}`]: { $exists: false }, [`archived_by.${uid}`]: { $exists: false } }, { $set: { [`read_by.${uid}`]: new Date() } })
    return { success: true }
  }

  // ---------- SETTINGS ----------
  if (path === '/settings' && method === 'GET') {
    return { settings: await getSettings(db), catalog_note: 'الأنواع الموسومة «غير مربوط» ليس لها مصدر إطلاق فعلي بعد — توجد كإعداد فقط بشفافية، وربطها نقطة قرار' }
  }
  const sm = path.match(/^\/settings\/([^/]+)$/)
  if (sm && method === 'PUT') {
    const type = sm[1]
    if (!NOTIFICATION_TYPES[type]) return { error: 'نوع غير معروف — لا تُنشأ أنواع بلا مصدر', status: 404 }
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب لتعديل إعداد إشعار (Audit)' }
    const before = await db.collection('admin_notification_settings').findOne({ type })
    const upd = { type, updated_by: sess.user.email, updated_at: new Date() }
    if (b.enabled !== undefined) upd.enabled = !!b.enabled
    if (b.default_priority !== undefined) { if (!PRIORITIES.includes(b.default_priority)) return { error: 'أولوية غير صالحة' }; upd.default_priority = b.default_priority }
    if (b.needs_action !== undefined) upd.needs_action = !!b.needs_action
    if (b.retention_days !== undefined) upd.retention_days = Math.min(Math.max(parseInt(b.retention_days) || 90, 1), 3650)
    if (b.dedupe !== undefined) upd.dedupe = !!b.dedupe
    await db.collection('admin_notification_settings').updateOne({ type }, { $set: upd }, { upsert: true })
    await logAudit(db, sess, 'notification_setting_update', type, before ? { enabled: before.enabled, priority: before.default_priority } : null, upd, b.reason)
    return { success: true }
  }

  return { error: 'مسار غير معروف', status: 404 }
}
