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
import JSZip from 'jszip'
import { emitAdminNotification } from './adminNotify'
import { isMainAdmin, adminCan } from './adminStaff'
import {
  buildBackupPackage, validatePackage, storeBackupBlob, loadBackupBlob,
  smartRestore, buildRestorePreview, BACKUP_TYPE_DEFS, BACKUP_SCHEMA_VERSION,
} from './backupEngine'

// EXACT same collection list as the existing /backup/export (reuse — no drift)
export const TENANT_EXPORT_COLLECTIONS = ['tickets', 'visas', 'services', 'clients', 'suppliers', 'boxes', 'journal_entries', 'packages', 'package_bookings', 'currency_exchanges', 'vouchers', 'accounts', 'service_types']
const SETTINGS_EXPORT_COLLECTIONS = ['platform_settings', 'subscription_plans', 'admin_role_templates', 'admin_notification_settings', 'countries']
const BLOB_CAP_BYTES = 64 * 1024 * 1024 // v8.0 — chunked storage: packages stored for re-download up to 64MB

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
      office_config: { available: true, note: 'إعدادات وهيكل المكتب: المستخدمون والأدوار، الفروع، شجرة الحسابات، العملاء، الموردون، الصناديق/البنوك، العملات والإعدادات' },
      office_data: { available: true, note: 'بيانات وعمليات المكتب: القيود، السندات، الحركات المالية، التذاكر، التأشيرات، الخدمات، الباقات — معزولة بـ tenant_id' },
      full_office: { available: true, note: 'نسخة المكتب الكاملة: الإعدادات + البيانات في حزمة واحدة قابلة للاستعادة' },
      full_system: { available: true, note: 'نسخة النظام الكاملة (Super Admin فقط): كل مجموعات قاعدة البيانات باستثناء الأسرار (الجلسات/الرموز/التوكنات)' },
      tenant_export: { available: true, note: 'النوع القديم — ما زال مدعوماً (نفس قائمة المجموعات الـ13)' },
      system_settings: { available: true, note: 'إعدادات المنظومة: الباقات، التسعير، قوالب الأدوار، إعدادات الإشعارات، الدول' },
    },
    retention: ret ? clean(ret) : null,
    read_only_note: 'السجل حقيقي — لا يوجد سجل نسخ تاريخي قبل هذه الميزة (التصدير السابق كان تنزيلاً مباشراً بلا تسجيل)',
  }
}

async function createBackup(db, b, sess, ctx) {
  const type = b?.type
  if (!BACKUP_TYPE_DEFS[type]) return { error: 'نوع النسخة غير معروف' }
  if (!String(b?.reason || '').trim()) return { error: 'سبب الإنشاء مطلوب (Audit)' }
  // v8.0 — fine-grained authority: Full System Backup is Super Admin ONLY (never staff)
  if (type === 'full_system' && !isMainAdmin(sess.user)) return { error: '🚫 النسخة الكاملة للنظام متاحة حصراً للمشرف العام الرئيسي', status: 403 }
  const def = BACKUP_TYPE_DEFS[type]
  let tenant = null
  if (def.scope === 'tenant') {
    if (!b.tenant_id) return { error: 'اختر المكتب لهذا النوع من النسخ' }
    tenant = await db.collection('tenants').findOne({ id: b.tenant_id })
    if (!tenant) return { error: 'المكتب غير موجود', status: 404 }
  }
  // duplicate-press guard: same type+tenant already running in the last 3 minutes
  const inflight = await db.collection('admin_backups').findOne({ type, tenant_id: b.tenant_id || null, status: 'running', created_at: { $gte: new Date(Date.now() - 3 * 60000) } })
  if (inflight) return { error: 'توجد نسخة مماثلة قيد التنفيذ — منع تكرار', status: 409 }
  const reg = {
    id: uuidv4(), type,
    scope: def.scope,
    tenant_id: b.tenant_id || null, tenant_name: tenant?.name || null,
    environment: ctx.envName,
    status: 'running', format: 'json', encrypted: false,
    reason: String(b.reason).trim().slice(0, 300), manual: true, protected: !!b.protect,
    created_by: sess.user.email, created_at: new Date(), created_scope: b.created_scope || 'admin',
    size_bytes: null, result: null, error_message: null, download_available: false, counts: null, manifest: null,
  }
  await db.collection('admin_backups').insertOne({ ...reg })
  try {
    // v8.0 — unified engine: genuinely restorable package { manifest, data } with sha256 checksum
    const pkg = await buildBackupPackage(db, { type, tenantId: b.tenant_id || null, createdBy: sess.user.email, envName: ctx.envName, backupId: reg.id })
    const json = JSON.stringify(pkg)
    const size = Buffer.byteLength(json, 'utf8')
    let downloadAvailable = false
    if (size <= BLOB_CAP_BYTES) {
      await storeBackupBlob(db, reg.id, json) // chunked — safe beyond Mongo's 16MB doc cap
      downloadAvailable = true
    }
    await db.collection('admin_backups').updateOne({ id: reg.id }, { $set: { status: 'completed', size_bytes: size, counts: pkg.manifest.counts, manifest: pkg.manifest, result: 'success', download_available: downloadAvailable, completed_at: new Date(), storage_note: downloadAvailable ? null : `الحجم ${(size / 1048576).toFixed(1)}MB > 64MB — تجاوز سقف التخزين الداخلي` } })
    await logAudit(db, sess, 'backup', 'backup_create', reg.id, null, { type, tenant: tenant?.name || 'system', size_bytes: size, stored: downloadAvailable, checksum: pkg.manifest.checksum }, b.reason)
    await emitAdminNotification(db, { type: 'backup_completed', title: `✅ اكتملت نسخة: ${def.label}${tenant ? ` — ${tenant.name}` : ''}`, body: `الحجم: ${(size / 1024).toFixed(0)}KB — بواسطة ${sess.user.email}`, priority: 'info', tenant_id: tenant?.id || null, link: { section: 'backup' }, ref_type: 'backup', ref_id: reg.id, dedupe_key: `backup_done_${reg.id}` })
    return { success: true, id: reg.id, size_bytes: size, download_available: downloadAvailable, counts: pkg.manifest.counts, manifest: pkg.manifest }
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
  const payload = await loadBackupBlob(db, reg.id)
  if (!payload) return { error: 'محتوى النسخة غير متوفر (ربما حُذف وفق سياسة الاحتفاظ)', status: 404 }
  await logAudit(db, sess, 'backup', 'backup_download', reg.id, null, { by: sess.user.email, format: p.get('format') || 'json' }, null)
  const base = `rahaal-${reg.type}-${reg.tenant_name || 'system'}-${new Date(reg.created_at).toISOString().slice(0, 10)}`.replace(/\s+/g, '_')
  // v8.0 — ZIP format: manifest.json + data/<collection>.json inside one archive
  if (p.get('format') === 'zip') {
    try {
      const pkg = JSON.parse(payload)
      const zip = new JSZip()
      zip.file('manifest.json', JSON.stringify(pkg.manifest || { legacy: true }, null, 2))
      const folder = zip.folder('data')
      for (const [coll, docs] of Object.entries(pkg.data || {})) folder.file(`${coll}.json`, JSON.stringify(docs, null, 2))
      const b64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      return { filename: `${base}.zip`, zip_base64: b64 }
    } catch (e) { return { error: `تعذر توليد ZIP: ${e.message}` } }
  }
  return { filename: `${base}.json`, payload }
}

async function retention(db, method, b, sess) {
  if (method === 'GET') {
    const r = await db.collection('platform_settings').findOne({ id: 'backup_retention' })
    return { retention: r ? clean(r) : { id: 'backup_retention', keep_count: null, keep_days: null, scope: 'all', protect_manual: true, note: 'لم تُضبط بعد' }, cleanup_note: 'التنظيف التلقائي غير مُفعّل في هذه الجولة — السياسة تُطبّق للعرض (تواريخ الانتهاء) وتفعيل الحذف التلقائي نقطة قرار' }
  }
  if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب لتعديل سياسة الاحتفاظ (Audit)' }
  const before = await db.collection('platform_settings').findOne({ id: 'backup_retention' })
  // v8.0 — the SAME single policy now understands the new backup types (no second system)
  const VALID_SCOPES = ['all', 'tenant', 'system', 'office_config', 'office_data', 'full_office', 'full_system']
  const doc = {
    id: 'backup_retention',
    keep_count: b.keep_count != null ? Math.max(1, parseInt(b.keep_count) || 1) : null,
    keep_days: b.keep_days != null ? Math.max(1, parseInt(b.keep_days) || 1) : null,
    scope: VALID_SCOPES.includes(b.scope) ? b.scope : 'all',
    types: Array.isArray(b.types) ? b.types.filter(t => !!BACKUP_TYPE_DEFS[t]) : (before?.types || null),
    protect_manual: b.protect_manual !== false,
    updated_by: sess.user.email, updated_at: new Date(),
  }
  await db.collection('platform_settings').updateOne({ id: 'backup_retention' }, { $set: doc }, { upsert: true })
  await logAudit(db, sess, 'backup', 'retention_update', 'backup_retention', before ? clean(before) : null, doc, b.reason)
  return { success: true, retention: doc }
}

// ---------------- RESTORE WORKFLOW (v8.0 — real execution with financial safety) ----------------
async function restores(db, path, method, p, b, sess) {
  if (path === '/restores' && method === 'GET') {
    const rows = await db.collection('admin_restore_requests').find({}, { projection: { _id: 0, preview: 0 } }).sort({ created_at: -1 }).limit(100).toArray()
    return { rows, execution_note: 'v8.0 — التنفيذ الفعلي مُفعّل بعد اكتمال المسار (تحقق ← معاينة ← اعتماد ← تنفيذ). الاستعادة ذكية بلا تكرار مالي: القيود/السندات/الحركات الموجودة لا تُمس ولا تُرحّل مرة أخرى' }
  }
  // v8.0 — UPLOAD a Rahaal backup file from device (validate-first, never auto-restore)
  if (path === '/restores/upload' && method === 'POST') {
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب لطلب استعادة (Audit)' }
    const pkg = b?.package
    const val = validatePackage(pkg, { expectTenantId: null })
    if (!val.valid) return { error: val.errors.join(' · ') }
    const man = val.manifest
    if (man.backup_type === 'full_system' && !isMainAdmin(sess.user)) return { error: '🚫 استعادة نسخة النظام الكاملة متاحة حصراً للمشرف العام الرئيسي', status: 403 }
    if (man.scope === 'tenant') {
      const t = await db.collection('tenants').findOne({ id: man.tenant_id })
      if (!t) return { error: `المكتب صاحب النسخة (${man.tenant_name || man.tenant_id}) غير موجود في النظام — لا يمكن الاستعادة`, status: 404 }
    }
    // register the uploaded package as a (source=upload) backup row + chunked blob
    const upId = uuidv4()
    const json = JSON.stringify(pkg)
    const reg = {
      id: upId, type: man.backup_type || 'tenant_export', scope: man.scope || 'tenant',
      tenant_id: man.tenant_id || null, tenant_name: man.tenant_name || null,
      environment: man.environment || null, status: 'completed', format: 'json',
      reason: `ملف مرفوع من الجهاز — ${String(b.reason).trim().slice(0, 200)}`, manual: true, protected: false,
      created_by: sess.user.email, created_at: new Date(), created_scope: 'admin', source: 'upload',
      size_bytes: Buffer.byteLength(json, 'utf8'), result: 'success', download_available: true,
      counts: man.counts || null, manifest: man, legacy_format: !!val.legacy,
    }
    await db.collection('admin_backups').insertOne({ ...reg })
    await storeBackupBlob(db, upId, json)
    const req = {
      id: uuidv4(), backup_id: upId, backup_type: reg.type,
      scope: reg.scope, tenant_id: reg.tenant_id, tenant_name: reg.tenant_name,
      environment: reg.environment, status: 'validated', source: 'upload',
      reason: String(b.reason).trim().slice(0, 300),
      created_by: sess.user.email, created_at: new Date(),
      steps: [{ step: 'validate', at: new Date(), by: sess.user.email, result: `passed (upload${val.legacy ? ' — legacy format' : ' — checksum ok'})` }],
    }
    await db.collection('admin_restore_requests').insertOne({ ...req })
    await logAudit(db, sess, 'restore', 'restore_upload_validate', req.id, null, { backup_id: upId, type: reg.type, tenant: reg.tenant_name || 'system', checksum_ok: !val.legacy }, b.reason)
    const { steps, ...rest } = req
    return { success: true, request: rest, warnings: val.warnings || [] }
  }
  if (path === '/restores/create' && method === 'POST') {
    if (!String(b?.reason || '').trim()) return { error: 'السبب مطلوب لطلب استعادة (Audit)' }
    const bk = await db.collection('admin_backups').findOne({ id: b?.backup_id })
    // ---- VALIDATE step ----
    if (!bk) return { error: 'النسخة غير موجودة', status: 404 }
    if (bk.status !== 'completed') return { error: `النسخة بحالة ${bk.status} — لا تصلح للاستعادة` }
    if (!bk.download_available) return { error: 'محتوى النسخة غير مخزن — لا يمكن التحقق منها للاستعادة' }
    if (bk.scope === 'tenant' && b.tenant_id && b.tenant_id !== bk.tenant_id) {
      return { error: '🚫 ممنوع: لا تُستعاد نسخة مكتب داخل مكتب آخر — النسخة تخص مكتباً محدداً' }
    }
    if (bk.type === 'full_system' && !isMainAdmin(sess.user)) return { error: '🚫 استعادة نسخة النظام الكاملة متاحة حصراً للمشرف العام الرئيسي', status: 403 }
    const dup = await db.collection('admin_restore_requests').findOne({ backup_id: bk.id, status: { $in: ['validated', 'previewed', 'approved'] } })
    if (dup) return { error: 'يوجد طلب استعادة مفتوح لنفس النسخة — منع تكرار', status: 409 }
    // checksum verification at validation time (packages with manifest)
    if (bk.manifest?.checksum) {
      const payload = await loadBackupBlob(db, bk.id)
      if (!payload) return { error: 'محتوى النسخة مفقود — لا يمكن التحقق', status: 404 }
      const vch = validatePackage(JSON.parse(payload))
      if (!vch.valid) return { error: `فشل التحقق: ${vch.errors.join(' · ')}` }
    }
    const req = {
      id: uuidv4(), backup_id: bk.id, backup_type: bk.type,
      scope: bk.scope, tenant_id: bk.tenant_id || null, tenant_name: bk.tenant_name || null,
      environment: bk.environment, status: 'validated', source: 'existing',
      reason: String(b.reason).trim().slice(0, 300),
      created_by: sess.user.email, created_at: new Date(),
      steps: [{ step: 'validate', at: new Date(), by: sess.user.email, result: 'passed' }],
    }
    await db.collection('admin_restore_requests').insertOne({ ...req })
    await logAudit(db, sess, 'restore', 'restore_request_create', req.id, null, { backup_id: bk.id, tenant: bk.tenant_name || 'system' }, b.reason)
    await emitAdminNotification(db, { type: 'restore_request', title: `🔁 طلب استعادة جديد — ${bk.tenant_name || 'النظام'}`, body: `بواسطة ${sess.user.email} — يتطلب معاينة واعتماداً`, priority: 'action', link: { section: 'backup' }, ref_type: 'restore', ref_id: req.id, dedupe_key: `restore_new_${req.id}` })
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
      const payload = await loadBackupBlob(db, req.backup_id)
      if (!payload) return { error: 'محتوى النسخة مفقود — أوقف المسار' }
      let pkg
      try { pkg = JSON.parse(payload) } catch { return { error: 'محتوى النسخة تالف (JSON غير صالح) — أوقف المسار' } }
      if (!pkg.manifest && pkg.data) pkg = { manifest: { backup_type: req.backup_type, scope: req.scope, tenant_id: req.tenant_id }, data: pkg.data } // legacy
      const preview = await buildRestorePreview(db, pkg, { targetTenantId: req.tenant_id || null })
      await db.collection('admin_restore_requests').updateOne({ id: req.id }, { $set: { status: 'previewed', preview, previewed_at: new Date() }, $push: { steps: { step: 'preview', at: new Date(), by: sess.user.email, result: 'generated' } } })
      await logAudit(db, sess, 'restore', 'restore_preview', req.id, null, { collections: preview.length }, null)
      return { success: true, preview, warning: 'هذه معاينة للأثر فقط — لم يتغير أي بيان. المجموعات المالية تُستعاد بوضع «إضافة الناقص فقط» بلا أي أثر محاسبي مزدوج' }
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
      return { success: true, status: 'approved', note: 'الطلب معتمد — يمكن الآن تنفيذ الاستعادة' }
    }
    if (act === 'reject') {
      if (['executed', 'rejected'].includes(req.status)) return { error: 'الطلب مغلق مسبقاً' }
      if (!String(b?.reason || '').trim()) return { error: 'سبب الرفض مطلوب (Audit)' }
      await db.collection('admin_restore_requests').updateOne({ id: req.id }, { $set: { status: 'rejected', rejected_by: sess.user.email, rejected_at: new Date(), reject_reason: b.reason }, $push: { steps: { step: 'reject', at: new Date(), by: sess.user.email, result: b.reason } } })
      await logAudit(db, sess, 'restore', 'restore_reject', req.id, { status: req.status }, { status: 'rejected' }, b.reason)
      return { success: true }
    }
    if (act === 'execute') {
      // v8.0 — REAL EXECUTION (after the full chain). Fine-grained: backup.approve or main SA.
      if (req.status !== 'approved') return { error: 'التنفيذ بعد الاعتماد فقط (التسلسل إلزامي: تحقق ← معاينة ← اعتماد ← تنفيذ)' }
      const canX = await adminCan(db, sess)
      if (!canX.has('backup', 'approve') && !isMainAdmin(sess.user)) return { error: '🚫 تنفيذ الاستعادة يحتاج صلاحية Approve في قسم النسخ الاحتياطي', status: 403 }
      if (req.backup_type === 'full_system' && !isMainAdmin(sess.user)) return { error: '🚫 استعادة النظام الكاملة حصراً للمشرف العام الرئيسي', status: 403 }
      const payload = await loadBackupBlob(db, req.backup_id)
      if (!payload) return { error: 'محتوى النسخة مفقود — لا يمكن التنفيذ', status: 404 }
      let pkg
      try { pkg = JSON.parse(payload) } catch { return { error: 'محتوى النسخة تالف — أوقف التنفيذ' } }
      if (!pkg.manifest && pkg.data) pkg = { manifest: { backup_type: req.backup_type, scope: req.scope, tenant_id: req.tenant_id, legacy: true }, data: pkg.data }
      else {
        const vx = validatePackage(pkg)
        if (!vx.valid) return { error: `فشل التحقق النهائي قبل التنفيذ: ${vx.errors.join(' · ')}` }
      }
      try {
        const summary = await smartRestore(db, pkg, {
          targetTenantId: req.scope === 'tenant' ? req.tenant_id : null,
          actorScope: 'admin',
          allowSystem: req.backup_type === 'full_system' || req.backup_type === 'system_settings',
        })
        await db.collection('admin_restore_requests').updateOne({ id: req.id }, { $set: { status: 'executed', executed_by: sess.user.email, executed_at: new Date(), summary }, $push: { steps: { step: 'execute', at: new Date(), by: sess.user.email, result: 'executed' } } })
        await logAudit(db, sess, 'restore', 'restore_execute', req.id, null, { backup_id: req.backup_id, summary }, b?.reason)
        await emitAdminNotification(db, { type: 'restore_executed', title: `✅ نُفذت الاستعادة — ${req.tenant_name || 'النظام'}`, body: `بواسطة ${sess.user.email}`, priority: 'warning', link: { section: 'backup' }, ref_type: 'restore', ref_id: req.id, dedupe_key: `restore_exec_${req.id}` })
        return { success: true, summary, note: 'استعادة ذكية: المجموعات المالية أُدرج الناقص منها فقط — لا تكرار قيود ولا أرصدة مزدوجة' }
      } catch (e) {
        await db.collection('admin_restore_requests').updateOne({ id: req.id }, { $set: { status: 'failed', error_message: String(e.message || e).slice(0, 500) }, $push: { steps: { step: 'execute', at: new Date(), by: sess.user.email, result: `failed: ${String(e.message || e).slice(0, 200)}` } } })
        await logAudit(db, sess, 'restore', 'restore_execute_failed', req.id, null, { error: String(e.message || e).slice(0, 200) }, b?.reason)
        return { error: `فشل تنفيذ الاستعادة: ${e.message}` }
      }
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
