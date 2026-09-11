// ============================================================================
// v3.95 — ADMIN AUDIT & SYSTEM HEALTH (Super Admin Batch 3) — READ-ONLY.
// Central audit viewer over the REAL audit stores that exist today:
//   audit_logs     — categories: permissions, announcements, backup, restore,
//                    maintenance, notifications (before/after + reason)
//   je_audit       — journal-entry deletions (per tenant)
//   document_audit — office-document actions (per tenant)
// Gaps are REPORTED, never fabricated: no IP/User-Agent, no success flag,
// tenant admin ops (topup/reset/impersonate…) not audited historically.
// Audit logs can NEVER be edited or deleted from here (no write endpoints).
// System Health reads real sources only — unknown when no metric exists.
// ============================================================================

const MASK_RE = /pass|secret|token|hash|key|authorization/i
function maskDeep(v, depth = 0) {
  if (v == null || depth > 6) return v
  if (Array.isArray(v)) return v.map(x => maskDeep(x, depth + 1))
  if (typeof v === 'object') {
    const o = {}
    for (const [k, val] of Object.entries(v)) o[k] = MASK_RE.test(k) ? '••• (مخفي)' : maskDeep(val, depth + 1)
    return o
  }
  return v
}

async function tenantMap(db) {
  const ts = await db.collection('tenants').find({}, { projection: { id: 1, name: 1 } }).toArray()
  return Object.fromEntries(ts.map(t => [t.id, t.name]))
}

const CATS = {
  permissions: 'الصلاحيات', announcements: 'الإعلانات', backup: 'النسخ الاحتياطي',
  restore: 'الاستعادة', maintenance: 'وضع الصيانة', notifications: 'الإشعارات',
  journal_delete: 'حذف قيود (مكاتب)', documents: 'مستندات المكاتب',
}

function rowFromAuditLog(a) {
  return {
    src: 'audit_logs', id: a.id, at: a.at, actor: a.actor_email || null, role: 'super_admin',
    tenant_id: null, tenant_name: '— (إداري)', category: a.category || 'other', category_label: CATS[a.category] || a.category,
    action: a.action, target_type: a.category, target: a.target || null,
    has_before_after: a.before != null || a.after != null, reason: a.reason || null,
    ip: null, user_agent: null, success: null, correlation_id: null,
  }
}
function rowFromJeAudit(a, tn) {
  return {
    src: 'je_audit', id: a.id, at: a.at, actor: a.by || null, role: 'office',
    tenant_id: a.tenant_id, tenant_name: tn[a.tenant_id] || a.tenant_id,
    category: 'journal_delete', category_label: CATS.journal_delete,
    action: a.action || 'delete', target_type: 'journal_entry', target: a.je_id || null,
    has_before_after: !!a.lines, reason: null, ip: null, user_agent: null, success: null, correlation_id: null,
    extra: { description: a.description, ref_type: a.ref_type, currency: a.currency },
  }
}
function rowFromDocAudit(a, tn) {
  return {
    src: 'document_audit', id: a.id, at: a.at, actor: a.actor || null, role: 'office',
    tenant_id: a.tenant_id, tenant_name: tn[a.tenant_id] || a.tenant_id,
    category: 'documents', category_label: CATS.documents,
    action: a.action, target_type: 'office_document', target: a.doc_id || null,
    has_before_after: false, reason: null, ip: null, user_agent: null, success: null, correlation_id: null,
  }
}

async function list(db, p) {
  const tn = await tenantMap(db)
  const limit = Math.min(Math.max(parseInt(p.get('limit')) || 50, 1), 100)
  const skip = Math.max(parseInt(p.get('skip')) || 0, 0)
  const cat = p.get('category') || ''
  const from = p.get('from'), to = p.get('to')
  const dateF = {}
  if (from) dateF.$gte = new Date(from)
  if (to) dateF.$lte = new Date(to + 'T23:59:59.999Z')
  const q = (p.get('q') || '').trim()
  const actor = (p.get('actor') || '').trim()
  const tenant = p.get('tenant') || ''
  const CAP = 300

  const wantAL = !cat || !['journal_delete', 'documents'].includes(cat)
  const wantJE = !cat || cat === 'journal_delete'
  const wantDA = !cat || cat === 'documents'

  const fAL = {}
  if (cat && wantAL && cat !== 'journal_delete' && cat !== 'documents') fAL.category = cat
  if (Object.keys(dateF).length) fAL.at = dateF
  if (actor) fAL.actor_email = { $regex: actor, $options: 'i' }
  if (q) fAL.$or = [{ action: { $regex: q, $options: 'i' } }, { target: { $regex: q, $options: 'i' } }, { reason: { $regex: q, $options: 'i' } }]
  const fJE = {}
  if (Object.keys(dateF).length) fJE.at = dateF
  if (actor) fJE.by = { $regex: actor, $options: 'i' }
  if (tenant) fJE.tenant_id = tenant
  if (q) fJE.$or = [{ je_id: q }, { description: { $regex: q, $options: 'i' } }]
  const fDA = {}
  if (Object.keys(dateF).length) fDA.at = dateF
  if (actor) fDA.actor = { $regex: actor, $options: 'i' }
  if (tenant) fDA.tenant_id = tenant
  if (q) fDA.$or = [{ doc_id: q }, { action: { $regex: q, $options: 'i' } }]

  const [al, je, da] = await Promise.all([
    wantAL && !tenant ? db.collection('audit_logs').find(fAL, { projection: { _id: 0, before: 0, after: 0 } }).sort({ at: -1 }).limit(CAP).toArray().catch(() => []) : [],
    wantJE ? db.collection('je_audit').find(fJE, { projection: { _id: 0, lines: 0 } }).sort({ at: -1 }).limit(CAP).toArray().catch(() => []) : [],
    wantDA ? db.collection('document_audit').find(fDA, { projection: { _id: 0 } }).sort({ at: -1 }).limit(CAP).toArray().catch(() => []) : [],
  ])
  let rows = [
    ...al.map(rowFromAuditLog),
    ...je.map(a => rowFromJeAudit(a, tn)),
    ...da.map(a => rowFromDocAudit(a, tn)),
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
  const total_matched = rows.length
  rows = rows.slice(skip, skip + limit)
  return {
    rows, limit, skip, total_matched, capped_per_source: CAP, read_only: true,
    gaps: [
      'عنوان IP وUser-Agent غير مسجلين في أي مصدر تدقيق حالي — تُعرض فارغة',
      'حالة نجاح/فشل العملية وCorrelation ID غير مسجلة — تُعرض فارغة',
      'عمليات إدارة المكاتب التاريخية (topup/reset-password/impersonate/toggle-status…) لم تكن تُسجل — فجوة موثقة مسبقاً، لا سجلات تقديرية',
      'العمليات المالية التشغيلية (إنشاء/تعديل العمليات) تُتتبع عبر حقول created/updated/refunded على السجلات نفسها وليس في audit مركزي',
    ],
  }
}

async function detail(db, p) {
  const src = p.get('src'), id = p.get('id')
  const coll = { audit_logs: 'audit_logs', je_audit: 'je_audit', document_audit: 'document_audit' }[src]
  if (!coll || !id) return { error: 'معاملات ناقصة' }
  const doc = await db.collection(coll).findOne({ id }, { projection: { _id: 0 } })
  if (!doc) return { error: 'السجل غير موجود', status: 404 }
  // NOTE: viewing an old audit record intentionally creates NO new audit record
  return { doc: maskDeep(doc), src, read_only: true, immutable_note: 'سجلات التدقيق لا تُعدّل ولا تُحذف من الواجهة — لا توجد أي نقطة كتابة لها أصلاً' }
}

async function categories(db) {
  const cats = await db.collection('audit_logs').distinct('category').catch(() => [])
  return {
    categories: [...new Set([...cats, 'journal_delete', 'documents'])].map(c => ({ key: c, label: CATS[c] || c })),
    sources: [
      { key: 'audit_logs', label: 'سجل التدقيق الإداري (قبل/بعد + سبب)' },
      { key: 'je_audit', label: 'حذف قيود اليومية (لكل مكتب)' },
      { key: 'document_audit', label: 'مستندات المكاتب' },
    ],
  }
}

// ---------------- SYSTEM HEALTH (real sources only) ----------------
export async function systemHealth(db, ctx) {
  const checks = []
  const alerts = []
  const add = (key, label, status, detail) => checks.push({ key, label, status, detail })

  // DB
  try {
    const t0 = Date.now()
    await db.command({ ping: 1 })
    const ms = Date.now() - t0
    add('database', 'قاعدة البيانات', ms > 500 ? 'warn' : 'ok', `ping ${ms}ms`)
    if (ms > 500) alerts.push({ level: 'warn', msg: `زمن استجابة قاعدة البيانات مرتفع (${ms}ms)` })
  } catch (e) {
    add('database', 'قاعدة البيانات', 'critical', e.message)
    alerts.push({ level: 'critical', msg: `فشل الاتصال بقاعدة البيانات: ${e.message}` })
  }
  // Storage
  try {
    const st = await db.command({ dbStats: 1 })
    add('storage', 'التخزين', 'ok', `بيانات ${(st.dataSize / 1048576).toFixed(1)}MB · ${st.objects} مستند — لا حد مساحة متاح للقياس من داخل التطبيق`)
  } catch { add('storage', 'التخزين', 'unknown', 'تعذر قراءة dbStats') }
  // Backend
  add('backend', 'Backend', 'ok', `uptime ${Math.floor(process.uptime() / 60)} دقيقة — الخادم يستجيب`)
  // Backups
  const [lastBk, lastFail] = await Promise.all([
    db.collection('admin_backups').findOne({ status: 'completed' }, { sort: { created_at: -1 }, projection: { _id: 0, created_at: 1, type: 1, tenant_name: 1 } }),
    db.collection('admin_backups').findOne({ status: 'failed' }, { sort: { created_at: -1 }, projection: { _id: 0, created_at: 1, error_message: 1 } }),
  ])
  if (lastBk) add('backup', 'النسخ الاحتياطي', 'ok', `آخر نسخة: ${new Date(lastBk.created_at).toLocaleString('ar-EG')} (${lastBk.tenant_name || 'إعدادات'})`)
  else add('backup', 'النسخ الاحتياطي', 'unknown', 'لا نسخ مسجلة بعد — لا مصدر قياس')
  if (lastFail) alerts.push({ level: 'critical', msg: `فشل نسخة احتياطية (${new Date(lastFail.created_at).toLocaleString('ar-EG')}): ${lastFail.error_message || ''}` })
  // Integrations — Meraaj
  const errs24h = await db.collection('meraaj_webhook_log').countDocuments({ ok: false, at: { $gte: new Date(Date.now() - 864e5) } }).catch(() => 0)
  const lastEvt = await db.collection('meraaj_events').find({}).sort({ at: -1 }).limit(1).toArray().then(a => a[0]?.at).catch(() => null)
  if (!ctx.keys.MERAAJ_SHARED_SECRET) { add('meraaj', 'تكامل معراج', 'critical', 'MERAAJ_SHARED_SECRET غير مضبوط'); alerts.push({ level: 'critical', msg: 'مفتاح معراج المشترك غير مضبوط — التكامل معطل' }) }
  else if (errs24h > 5) { add('meraaj', 'تكامل معراج', 'warn', `${errs24h} خطأ webhook خلال 24 ساعة`); alerts.push({ level: 'warn', msg: `ارتفاع أخطاء معراج: ${errs24h} خلال 24 ساعة` }) }
  else add('meraaj', 'تكامل معراج', 'ok', lastEvt ? `آخر حدث: ${new Date(lastEvt).toLocaleString('ar-EG')}` : 'المفتاح مضبوط — لا أحداث مسجلة بعد')
  // API errors (real proxy: webhook failures — no central API error log exists)
  add('api_errors', 'أخطاء API', errs24h > 0 ? 'warn' : 'unknown', errs24h > 0 ? `${errs24h} خطأ مسجل (webhooks) خلال 24س` : 'لا يوجد سجل أخطاء API مركزي — فجوة موثقة (المقيس الوحيد: webhook log)')
  // Jobs / queue
  add('jobs', 'Jobs / Queue', 'unknown', 'لا توجد مهام خلفية في البنية الحالية — لا مصدر قياس')
  // Notifications delivery (in-app only)
  const failedNotifs = await db.collection('admin_notifications').countDocuments({ delivery: 'failed' }).catch(() => 0)
  add('notifications', 'تسليم الإشعارات', failedNotifs > 0 ? 'warn' : 'ok', failedNotifs > 0 ? `${failedNotifs} إشعار فشل` : 'قناة In-App فقط — الحفظ المباشر في القاعدة')
  // Version consistency (REAL finding — constants differ in code)
  const vs = Object.values(ctx.versions).filter(Boolean)
  if (new Set(vs).size > 1) {
    add('version', 'تطابق الإصدارات', 'warn', `ثوابت مختلفة في الكود: ${JSON.stringify(ctx.versions)}`)
    alerts.push({ level: 'warn', msg: 'عدم تطابق ثوابت الإصدار بين root/health/backup — توحيدها نقطة قرار' })
  } else add('version', 'تطابق الإصدارات', 'ok', vs[0] || '—')
  // Maintenance flag
  const maint = await db.collection('platform_settings').findOne({ id: 'maintenance_mode' })
  if (maint?.enabled) alerts.push({ level: 'warn', msg: 'إعداد وضع الصيانة مُفعّل (الإنفاذ غير موصول)' })

  const worst = checks.some(c => c.status === 'critical') ? 'critical' : checks.some(c => c.status === 'warn') ? 'warn' : 'ok'
  return { overall: worst, checks, alerts, environment: ctx.envName, generated_at: new Date(), read_only: true, note: 'مصادر حقيقية فقط — «غير معروف» تعني لا مصدر قياس، ولا تُعرض كـ«سليم» زوراً' }
}

export async function adminAuditHandler(db, path, p, ctx) {
  if (path === '/list') return list(db, p)
  if (path === '/detail') return detail(db, p)
  if (path === '/categories') return categories(db)
  if (path === '/health') return systemHealth(db, ctx)
  return { error: 'مسار غير معروف', status: 404 }
}
