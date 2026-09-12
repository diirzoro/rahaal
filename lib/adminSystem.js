// ============================================================================
// v3.95 — ADMIN SYSTEM CENTER (Super Admin Batch 3): Backup & Restore path,
// Retention policy, System Status, Environment & Version, Integrations,
// Maintenance-Mode CONFIG. HONESTY RULES: nothing is faked — unavailable
// capabilities (Full/DB backup, actual restore execution, maintenance
// enforcement) are clearly surfaced as decision points, never simulated.
// REUSED: the tenant export logic of /api/backup/export (same collection
// list), platform_settings storage, op-dedupe pattern, audit_logs.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import { emitAdminNotification } from './adminNotify'

// EXACT same collection list as the existing /backup/export (reuse — no drift)
export const TENANT_EXPORT_COLLECTIONS = ['tickets', 'visas', 'services', 'clients', 'suppliers', 'boxes', 'journal_entries', 'packages', 'package_bookings', 'currency_exchanges', 'vouchers', 'accounts', 'service_types']
const SETTINGS_EXPORT_COLLECTIONS = ['platform_settings', 'subscription_plans', 'admin_role_templates', 'admin_notification_settings', 'countries']
const BLOB_CAP_BYTES = 8 * 1024 * 1024 // store payload for re-download only when ≤ 8MB (Mongo doc safety)

async function logAudit(db, sess, category, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category, at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* audit must never break the operation */ }
}

const clean = (d) => { if (!d) return d; const { _id, ...rest } = d; return rest }

// ---------------- BACKUPS ----------------
async function listBackups(db, p) {
  const f = {}
  if (p.get('type')) f.type = p.get('type')
  if (p.get('tenant')) f.tenant_id = p.get('tenant')
  if (p.get('status')) f.status = p.get('status')
  const rows = await db.collection('admin_backups').find(f, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(200).toArray()
  const ret = await db.collection('platform_settings').findOne({ id: 'backup_retention' })
  const keepDays = ret?.keep_days || null
  return {
    rows: rows.map(r => ({ ...r, expires_at: keepDays && !r.protected ? new Date(new Date(r.created_at).getTime() + keepDays * 864e5) : null })),
    capabilities: {
      tenant_export: { available: true, note: 'يعيد استخدام منطق /api/backup/export القائم (نفس قائمة المجموعات الـ13) لأي مكتب' },
      system_settings: { available: true, note: 'إعدادات المنظومة: الباقات، التسعير، قوالب الأدوار، إعدادات الإشعارات، الدول' },
      full_system: { available: false, note: 'لا توجد آلية Full System Backup في البنية الحالية — نقطة تحتاج قراراً (تخزين خارجي + mongodump)' },
      database_backup: { available: false, note: 'لا توجد آلية Database Backup (mongodump) متاحة من داخل التطبيق — نقطة تحتاج قراراً (على مستوى المنصة/الاستضافة)' },
    },
    retention: ret ? clean(ret) : null,
    read_only_note: 'السجل حقيقي — لا يوجد سجل نسخ تاريخي قبل هذه الميزة (التصدير السابق كان تنزيلاً مباشراً بلا تسجيل)',
  }
}

async function createBackup(db, b, sess, ctx) {
  const type = b?.type
  if (!['tenant_export', 'system_settings'].includes(type)) return { error: 'نوع النسخة غير مدعوم فعلياً — Full/Database Backup نقطة قرار' }
  if (!String(b?.reason || '').trim()) return { error: 'سبب الإنشاء مطلوب (Audit)' }
  let tenant = null
  if (type === 'tenant_export') {
    if (!b.tenant_id) return { error: 'اختر المكتب لنسخة Tenant' }
    tenant = await db.collection('tenants').findOne({ id: b.tenant_id })
    if (!tenant) return { error: 'المكتب غير موجود', status: 404 }
  }
  // duplicate-press guard: same type+tenant already running in the last 3 minutes
  const inflight = await db.collection('admin_backups').findOne({ type, tenant_id: b.tenant_id || null, status: 'running', created_at: { $gte: new Date(Date.now() - 3 * 60000) } })
  if (inflight) return { error: 'توجد نسخة مماثلة قيد التنفيذ — منع تكرار', status: 409 }
  const reg = {
    id: uuidv4(), type,
    scope: type === 'tenant_export' ? 'tenant' : 'system',
    tenant_id: b.tenant_id || null, tenant_name: tenant?.name || null,
    environment: ctx.envName,
    status: 'running', format: 'json', encrypted: false,
    reason: String(b.reason).trim().slice(0, 300), manual: true, protected: !!b.protect,
    created_by: sess.user.email, created_at: new Date(),
    size_bytes: null, result: null, error_message: null, download_available: false, counts: null,
  }
  await db.collection('admin_backups').insertOne({ ...reg })
  try {
    const payload = { backup_id: reg.id, type, exported_at: new Date().toISOString(), exported_by: sess.user.email, environment: ctx.envName, data: {} }
    if (type === 'tenant_export') {
      payload.tenant_id = tenant.id; payload.tenant_name = tenant.name; payload.version = '3.9.20' // same marker as legacy export
      for (const coll of TENANT_EXPORT_COLLECTIONS) {
        const docs = await db.collection(coll).find({ tenant_id: tenant.id }).toArray()
        payload.data[coll] = docs.map(d => { const { _id, ...rest } = d; return rest })
      }
      const ts = await db.collection('tenant_settings').findOne({ tenant_id: tenant.id })
      payload.data.tenant_settings = ts ? [clean(ts)] : []
    } else {
      for (const coll of SETTINGS_EXPORT_COLLECTIONS) {
        const docs = await db.collection(coll).find({}).toArray().catch(() => [])
        payload.data[coll] = docs.map(d => { const { _id, ...rest } = d; return rest })
      }
    }
    const json = JSON.stringify(payload)
    const size = Buffer.byteLength(json, 'utf8')
    const counts = Object.fromEntries(Object.entries(payload.data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]))
    let downloadAvailable = false
    if (size <= BLOB_CAP_BYTES) {
      await db.collection('admin_backup_blobs').insertOne({ id: uuidv4(), backup_id: reg.id, payload: json, created_at: new Date() })
      downloadAvailable = true
    }
    await db.collection('admin_backups').updateOne({ id: reg.id }, { $set: { status: 'completed', size_bytes: size, counts, result: 'success', download_available: downloadAvailable, completed_at: new Date(), storage_note: downloadAvailable ? null : `الحجم ${(size / 1048576).toFixed(1)}MB > 8MB — التخزين الداخلي غير آمن، التنزيل المباشر وقت الإنشاء فقط (تخزين خارجي = نقطة قرار)` } })
    await logAudit(db, sess, 'backup', 'backup_create', reg.id, null, { type, tenant: tenant?.name || 'system', size_bytes: size, stored: downloadAvailable }, b.reason)
    await emitAdminNotification(db, { type: 'backup_completed', title: `✅ اكتملت نسخة ${type === 'tenant_export' ? `مكتب: ${tenant?.name}` : 'إعدادات المنظومة'}`, body: `الحجم: ${(size / 1024).toFixed(0)}KB — بواسطة ${sess.user.email}`, priority: 'info', tenant_id: tenant?.id || null, link: { section: 'backup' }, ref_type: 'backup', ref_id: reg.id, dedupe_key: `backup_done_${reg.id}` })
    return { success: true, id: reg.id, size_bytes: size, download_available: downloadAvailable, counts }
  } catch (e) {
    await db.collection('admin_backups').updateOne({ id: reg.id }, { $set: { status: 'failed', result: 'failed', error_message: String(e.message || e).slice(0, 500), completed_at: new Date() } })
    await logAudit(db, sess, 'backup', 'backup_failed', reg.id, null, { type, error: String(e.message || e).slice(0, 200) }, b.reason)
    await emitAdminNotification(db, { type: 'backup_failed', title: '❌ فشل إنشاء نسخة احتياطية', body: String(e.message || e).slice(0, 200), priority: 'critical', link: { section: 'backup' }, ref_type: 'backup', ref_id: reg.id, dedupe_key: `backup_fail_${reg.id}` })
    return { error: `فشل إنشاء النسخة: ${e.message}` }
  }
}

async function downloadBackup(db, p, sess) {
  const reg = await db.collection('admin_backups').findOne({ id: p.get('id') })
  if (!reg) return { error: 'النسخة غير موجودة', status: 404 }
  if (!reg.download_available) return { error: reg.storage_note || 'الملف غير مخزن — التنزيل كان متاحاً وقت الإنشاء فقط' }
  const blob = await db.collection('admin_backup_blobs').findOne({ backup_id: reg.id })
  if (!blob) return { error: 'محتوى النسخة غير متوفر (ربما حُذف وفق سياسة الاحتفاظ)', status: 404 }
  await logAudit(db, sess, 'backup', 'backup_download', reg.id, null, { by: sess.user.email }, null)
  const fname = `rahaal-${reg.type}-${reg.tenant_name || 'system'}-${new Date(reg.created_at).toISOString().slice(0, 10)}.json`.replace(/\s+/g, '_')
  return { filename: fname, payload: blob.payload }
}

async function retention(db, method, b, sess) {
  if (method === 'GET') {
    const r = await db.collection('platform_settings').findOne({ id: 'backup_retention' })
    return { retention: r ? clean(r) : { id: 'backup_retention', keep_count: null, keep_days: null, scope: 'all', protect_manual: true, note: 'لم تُضبط بعد' }, cleanup_note: 'التنظيف التلقائي غير مُفعّل في هذه الجولة — السياسة تُطبّق للعرض (تواريخ الانتهاء) وتفعيل الحذف التلقائي نقطة قرار' }
  }
  if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب لتعديل سياسة الاحتفاظ (Audit)' }
  const before = await db.collection('platform_settings').findOne({ id: 'backup_retention' })
  const doc = {
    id: 'backup_retention',
    keep_count: b.keep_count != null ? Math.max(1, parseInt(b.keep_count) || 1) : null,
    keep_days: b.keep_days != null ? Math.max(1, parseInt(b.keep_days) || 1) : null,
    scope: ['all', 'tenant', 'system'].includes(b.scope) ? b.scope : 'all',
    protect_manual: b.protect_manual !== false,
    updated_by: sess.user.email, updated_at: new Date(),
  }
  await db.collection('platform_settings').updateOne({ id: 'backup_retention' }, { $set: doc }, { upsert: true })
  await logAudit(db, sess, 'backup', 'retention_update', 'backup_retention', before ? clean(before) : null, doc, b.reason)
  return { success: true, retention: doc }
}

// ---------------- RESTORE WORKFLOW (path only — execution DISABLED by design) ----------------
async function restores(db, path, method, p, b, sess) {
  if (path === '/restores' && method === 'GET') {
    const rows = await db.collection('admin_restore_requests').find({}, { projection: { _id: 0, preview: 0 } }).sort({ created_at: -1 }).limit(100).toArray()
    return { rows, execution_note: 'التنفيذ الفعلي للاستعادة مُعطّل بالتصميم في هذه المرحلة — المسار (تحقق ← معاينة ← تأكيد ← اعتماد) مبني كاملاً، وتفعيل التنفيذ نقطة قرار' }
  }
  if (path === '/restores/create' && method === 'POST') {
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب لطلب استعادة (Audit)' }
    const bk = await db.collection('admin_backups').findOne({ id: b?.backup_id })
    // ---- VALIDATE step ----
    if (!bk) return { error: 'النسخة غير موجودة', status: 404 }
    if (bk.status !== 'completed') return { error: `النسخة بحالة ${bk.status} — لا تصلح للاستعادة` }
    if (!bk.download_available) return { error: 'محتوى النسخة غير مخزن — لا يمكن التحقق منها للاستعادة' }
    if (bk.type === 'tenant_export' && b.tenant_id && b.tenant_id !== bk.tenant_id) {
      return { error: '🚫 ممنوع: لا تُستعاد نسخة مكتب داخل مكتب آخر — النسخة تخص مكتباً محدداً' }
    }
    const dup = await db.collection('admin_restore_requests').findOne({ backup_id: bk.id, status: { $in: ['validated', 'previewed', 'approved'] } })
    if (dup) return { error: 'يوجد طلب استعادة مفتوح لنفس النسخة — منع تكرار', status: 409 }
    const req = {
      id: uuidv4(), backup_id: bk.id, backup_type: bk.type,
      scope: bk.scope, tenant_id: bk.tenant_id || null, tenant_name: bk.tenant_name || null,
      environment: bk.environment, status: 'validated',
      reason: String(b.reason).trim().slice(0, 300),
      created_by: sess.user.email, created_at: new Date(),
      steps: [{ step: 'validate', at: new Date(), by: sess.user.email, result: 'passed' }],
    }
    await db.collection('admin_restore_requests').insertOne({ ...req })
    await logAudit(db, sess, 'restore', 'restore_request_create', req.id, null, { backup_id: bk.id, tenant: bk.tenant_name || 'system' }, b.reason)
    await emitAdminNotification(db, { type: 'restore_request', title: `🔁 طلب استعادة جديد — ${bk.tenant_name || 'إعدادات المنظومة'}`, body: `بواسطة ${sess.user.email} — يتطلب معاينة واعتماداً`, priority: 'action', link: { section: 'backup' }, ref_type: 'restore', ref_id: req.id, dedupe_key: `restore_new_${req.id}` })
    const { steps, ...rest } = req
    return { success: true, request: rest }
  }
  const m = path.match(/^\/restores\/([^/]+)\/(preview|approve|reject|execute)$/)
  if (m && method === 'POST') {
    const req = await db.collection('admin_restore_requests').findOne({ id: m[1] })
    if (!req) return { error: 'الطلب غير موجود', status: 404 }
    const act = m[2]
    if (act === 'preview') {
      if (!['validated', 'previewed'].includes(req.status)) return { error: `الطلب بحالة ${req.status} — المعاينة بعد التحقق فقط` }
      const blob = await db.collection('admin_backup_blobs').findOne({ backup_id: req.backup_id })
      if (!blob) return { error: 'محتوى النسخة مفقود — أوقف المسار' }
      let data
      try { data = JSON.parse(blob.payload)?.data || {} } catch { return { error: 'محتوى النسخة تالف (JSON غير صالح) — أوقف المسار' } }
      const preview = []
      for (const [coll, docs] of Object.entries(data)) {
        const inBackup = Array.isArray(docs) ? docs.length : 0
        const current = req.tenant_id
          ? await db.collection(coll).countDocuments({ tenant_id: req.tenant_id }).catch(() => null)
          : await db.collection(coll).countDocuments({}).catch(() => null)
        preview.push({ collection: coll, in_backup: inBackup, currently_in_db: current, would_affect: current })
      }
      await db.collection('admin_restore_requests').updateOne({ id: req.id }, { $set: { status: 'previewed', preview, previewed_at: new Date() }, $push: { steps: { step: 'preview', at: new Date(), by: sess.user.email, result: 'generated' } } })
      await logAudit(db, sess, 'restore', 'restore_preview', req.id, null, { collections: preview.length }, null)
      return { success: true, preview, warning: 'هذه معاينة للأثر فقط — لم يتغير أي بيان' }
    }
    if (act === 'approve') {
      if (req.status !== 'previewed') return { error: 'الاعتماد بعد المعاينة فقط (التسلسل إلزامي)' }
      if (String(b?.confirm_text || '').trim() !== 'أؤكد الاستعادة') return { error: 'التأكيد الكتابي مطلوب: اكتب «أؤكد الاستعادة» حرفياً' }
      if (!String(b?.reason || '').trim()) return { error: 'سبب الاعتماد مطلوب (Audit)' }
      // Maker–Checker: a different super admin must approve when one exists
      const admins = await db.collection('users').countDocuments({ role: 'super_admin', active: { $ne: false } })
      const selfApproved = req.created_by === sess.user.email
      if (admins > 1 && selfApproved) return { error: 'Maker–Checker: يجب أن يعتمد الطلب سوبر أدمن آخر غير منشئه' }
      await db.collection('admin_restore_requests').updateOne({ id: req.id }, { $set: { status: 'approved', approved_by: sess.user.email, approved_at: new Date(), self_approved: selfApproved }, $push: { steps: { step: 'approve', at: new Date(), by: sess.user.email, result: selfApproved ? 'self_approved (سوبر أدمن وحيد)' : 'approved' } } })
      await logAudit(db, sess, 'restore', 'restore_approve', req.id, { status: 'previewed' }, { status: 'approved', self_approved: selfApproved }, b.reason)
      return { success: true, status: 'approved', note: 'التنفيذ الفعلي معطّل بالتصميم — نقطة قرار' }
    }
    if (act === 'reject') {
      if (['executed', 'rejected'].includes(req.status)) return { error: 'الطلب مغلق مسبقاً' }
      if (!String(b?.reason || '').trim()) return { error: 'سبب الرفض مطلوب (Audit)' }
      await db.collection('admin_restore_requests').updateOne({ id: req.id }, { $set: { status: 'rejected', rejected_by: sess.user.email, rejected_at: new Date(), reject_reason: b.reason }, $push: { steps: { step: 'reject', at: new Date(), by: sess.user.email, result: b.reason } } })
      await logAudit(db, sess, 'restore', 'restore_reject', req.id, { status: req.status }, { status: 'rejected' }, b.reason)
      return { success: true }
    }
    if (act === 'execute') {
      // HARD-DISABLED by design in this batch — never a partial/hidden success
      await logAudit(db, sess, 'restore', 'restore_execute_blocked', req.id, null, { note: 'execution disabled by design' }, b?.reason)
      return { error: '🚫 التنفيذ الفعلي للاستعادة مُعطّل بالتصميم في هذه المرحلة — مسار التحقق/المعاينة/الاعتماد مكتمل، وتفعيل التنفيذ نقطة قرار تحتاج موافقتكم', status: 423 }
    }
  }
  const dm = path.match(/^\/restores\/([^/]+)$/)
  if (dm && method === 'GET') {
    const req = await db.collection('admin_restore_requests').findOne({ id: dm[1] }, { projection: { _id: 0 } })
    if (!req) return { error: 'الطلب غير موجود', status: 404 }
    return { request: req }
  }
  return { error: 'مسار غير معروف', status: 404 }
}

// ---------------- SYSTEM STATUS / ENV / INTEGRATIONS / MAINTENANCE ----------------
async function systemStatus(db, ctx) {
  const out = { checked_at: new Date(), env: ctx.envName }
  try {
    const t0 = Date.now()
    await db.command({ ping: 1 })
    out.database = { status: 'ok', ping_ms: Date.now() - t0 }
  } catch (e) { out.database = { status: 'critical', error: e.message } }
  try {
    const st = await db.command({ dbStats: 1 })
    out.storage = { status: 'ok', data_mb: +(st.dataSize / 1048576).toFixed(1), storage_mb: +(st.storageSize / 1048576).toFixed(1), collections: st.collections, objects: st.objects }
  } catch { out.storage = { status: 'unknown', note: 'تعذر قراءة dbStats' } }
  out.backend = { status: 'ok', uptime_sec: Math.floor(process.uptime()), note: 'الخادم يستجيب (هذا الرد نفسه منه)' }
  const lastBk = await db.collection('admin_backups').findOne({ status: 'completed' }, { sort: { created_at: -1 }, projection: { _id: 0, id: 1, type: 1, tenant_name: 1, created_at: 1, size_bytes: 1 } })
  const failedBk = await db.collection('admin_backups').countDocuments({ status: 'failed' })
  out.backup = { status: lastBk ? 'ok' : 'unknown', last_backup: lastBk || null, failed_count: failedBk, note: lastBk ? null : 'لا نسخ مسجلة بعد — لا يوجد مصدر قياس سابق لهذه الميزة' }
  out.jobs = { status: 'unknown', note: 'لا توجد Queue/Background Jobs في البنية الحالية — لا مصدر قياس' }
  const maint = await db.collection('platform_settings').findOne({ id: 'maintenance_mode' })
  out.maintenance = { enabled: !!maint?.enabled, config: maint ? clean(maint) : null }
  return out
}

function environmentInfo(ctx) {
  return {
    env_name: ctx.envName, env_source: 'NEXT_PUBLIC_BASE_URL (استدلال من النطاق — نفس منطق looksLikeTestHost القائم)',
    base_host: ctx.baseHost,
    is_live: ctx.envName === 'Live',
    versions: ctx.versions,
    version_note: '⚠️ ثوابت الإصدار في الكود غير متطابقة (root/health/backup) — تُعرض كما هي، توحيدها نقطة قرار',
    build: { commit: null, built_at: null, note: 'لا يوجد Build/Commit identifier متاح داخل التطبيق — فجوة موثقة' },
    database: { name: ctx.dbNameSafe, note: 'الاسم فقط — لا تُعرض أي أسرار اتصال' },
  }
}

async function integrations(db, ctx) {
  const rows = []
  // Meraaj Network (real integration — HMAC webhooks)
  const [lastOk, lastErr, lastEvent] = await Promise.all([
    db.collection('meraaj_webhook_log').findOne({ ok: { $ne: false } }, { sort: { at: -1 }, projection: { _id: 0, at: 1 } }).catch(() => null),
    db.collection('meraaj_webhook_log').findOne({ ok: false }, { sort: { at: -1 }, projection: { _id: 0, at: 1, reason: 1 } }).catch(() => null),
    db.collection('meraaj_events').find({}).sort({ at: -1 }).limit(1).toArray().then(a => a[0]).catch(() => null),
  ])
  const errs24h = await db.collection('meraaj_webhook_log').countDocuments({ ok: false, at: { $gte: new Date(Date.now() - 864e5) } }).catch(() => 0)
  rows.push({
    name: 'شبكة معراج (Meraaj Network)', kind: 'Webhooks + SSO (HMAC)', scope: 'system',
    status: ctx.keys.MERAAJ_SHARED_SECRET ? (errs24h > 5 ? 'warn' : 'ok') : 'critical',
    keys: { MERAAJ_SHARED_SECRET: ctx.keys.MERAAJ_SHARED_SECRET, MERAAJ_API_BASE_URL: ctx.keys.MERAAJ_API_BASE_URL, MERAAJ_WEBHOOK_URL: ctx.keys.MERAAJ_WEBHOOK_URL, MERAAJ_STORE_URL: ctx.keys.MERAAJ_STORE_URL },
    endpoint_safe: ctx.meraajHostSafe,
    last_ok_at: lastOk?.at || lastEvent?.at || null,
    last_error: lastErr ? { at: lastErr.at, reason: lastErr.reason } : null,
    errors_24h: errs24h, environment: ctx.envName,
  })
  // WhatsApp (internal wa.me link logging — not an external API)
  const lastWa = await db.collection('whatsapp_logs').findOne({}, { sort: { created_at: -1 }, projection: { _id: 0, created_at: 1 } }).catch(() => null)
  rows.push({ name: 'واتساب (قوالب wa.me)', kind: 'أداة داخلية — ليس تكامل API خارجي', scope: 'tenant', status: 'ok', keys: {}, last_ok_at: lastWa?.created_at || null, last_error: null, environment: ctx.envName })
  return { rows, note: 'لا توجد تكاملات أخرى (بريد/SMS/دفع) في البنية الحالية — المفاتيح تُعرض كـموجود/غير موجود فقط بلا كشف قيم' }
}

async function maintenance(db, method, b, sess, ctx) {
  if (method === 'GET') {
    const m = await db.collection('platform_settings').findOne({ id: 'maintenance_mode' })
    return { config: m ? clean(m) : { id: 'maintenance_mode', enabled: false, note: 'لم يُضبط بعد' }, enforcement_note: '⚠️ الإنفاذ الفعلي (حجب دخول المستخدمين) غير موصول في هذه الجولة بالتصميم — هذه إدارة الإعداد والسجل فقط، والإنفاذ نقطة قرار', environment: ctx.envName }
  }
  if (!String(b?.reason || '').trim()) return { error: 'السبب إلزامي لأي تغيير في وضع الصيانة (Audit)' }
  if (b.enabled === true) {
    if (String(b?.confirm_text || '').trim() !== 'تفعيل الصيانة') return { error: 'التأكيد الكتابي مطلوب: اكتب «تفعيل الصيانة» حرفياً' }
    if (ctx.envName === 'Live') {
      const admins = await db.collection('users').countDocuments({ role: 'super_admin', active: { $ne: false } })
      const prev = await db.collection('platform_settings').findOne({ id: 'maintenance_mode' })
      if (admins > 1 && prev?.requested_by && prev.requested_by !== sess.user.email && !prev.enabled) {
        // second admin confirming a pending request — allowed
      } else if (admins > 1 && (!prev?.requested_by || prev?.requested_by === sess.user.email)) {
        await db.collection('platform_settings').updateOne({ id: 'maintenance_mode' }, { $set: { requested_by: sess.user.email, requested_at: new Date(), pending_reason: b.reason } }, { upsert: true })
        await logAudit(db, sess, 'maintenance', 'maintenance_enable_requested', 'maintenance_mode', null, { pending: true }, b.reason)
        return { success: true, pending: true, note: 'Maker–Checker (Live): سُجّل الطلب — يجب أن يؤكده سوبر أدمن آخر' }
      }
    }
  }
  const before = await db.collection('platform_settings').findOne({ id: 'maintenance_mode' })
  const doc = {
    id: 'maintenance_mode',
    enabled: !!b.enabled,
    reason_text: String(b.reason_text || b.reason || '').slice(0, 300),
    message: String(b.message || '').slice(0, 500),
    starts_at: b.starts_at ? new Date(b.starts_at) : null,
    ends_at: b.ends_at ? new Date(b.ends_at) : null,
    affected: String(b.affected || '').slice(0, 300),
    environment: ctx.envName,
    changed_by: sess.user.email, changed_at: new Date(),
    requested_by: null, requested_at: null, pending_reason: null,
  }
  await db.collection('platform_settings').updateOne({ id: 'maintenance_mode' }, { $set: doc }, { upsert: true })
  await logAudit(db, sess, 'maintenance', doc.enabled ? 'maintenance_enable' : 'maintenance_disable', 'maintenance_mode', before ? { enabled: !!before.enabled } : null, { enabled: doc.enabled, message: doc.message }, b.reason)
  await emitAdminNotification(db, { type: 'maintenance_change', title: doc.enabled ? '🛠️ تفعيل إعداد وضع الصيانة' : '✅ إيقاف إعداد وضع الصيانة', body: `بواسطة ${sess.user.email} — ${b.reason}`, priority: doc.enabled ? 'warning' : 'info', link: { section: 'system' }, ref_type: 'maintenance', ref_id: 'maintenance_mode', dedupe_key: `maint_${doc.enabled}_${Date.now()}` })
  return { success: true, config: doc, enforcement_note: 'الإنفاذ الفعلي غير موصول في هذه الجولة — نقطة قرار' }
}

export async function adminSystemHandler(db, path, method, p, b, sess, ctx) {
  if (path === '/backups' && method === 'GET') return listBackups(db, p)
  if (path === '/backups/create' && method === 'POST') return createBackup(db, b, sess, ctx)
  if (path === '/backups/download' && method === 'GET') return downloadBackup(db, p, sess)
  if (path === '/retention') return retention(db, method, b, sess)
  if (path.startsWith('/restores')) return restores(db, path, method, p, b, sess)
  if (path === '/status' && method === 'GET') return systemStatus(db, ctx)
  if (path === '/environment' && method === 'GET') return environmentInfo(ctx)
  if (path === '/integrations' && method === 'GET') return integrations(db, ctx)
  if (path === '/maintenance') return maintenance(db, method, b, sess, ctx)
  return { error: 'مسار غير معروف', status: 404 }
}
