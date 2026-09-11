// ============================================================================
// v3.97 — RAHAAL ADMIN REALM & STAFF RBAC (Super Admin Batch 5).
// THE isolation layer requested by management:
//  - Admin realm = MAIN super_admin (role=super_admin AND tenant_id=null) plus
//    admin staff accounts (role=admin_staff, admin_realm=true, tenant_id=null)
//    created ONLY from this center. A tenant user holding role=super_admin by
//    mistake is REJECTED (realm check, not just role string).
//  - Per-section / per-action permissions for every Super Admin section
//    (catalog below). GET → view. Writes → a write action of the section.
//    Batch 5 handlers additionally enforce fine-grained actions via can().
//  - NOTHING here creates/modifies any real user automatically — functions only.
//  - Disabling a staff account terminates their sessions (supported: sessions
//    collection). Every sensitive change: mandatory reason + audit_logs.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'

async function logAudit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'admin_staff', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* never break */ }
}

// ------------------------------- CATALOG (code constant — not user-editable)
export const ADMIN_SECTIONS = [
  { key: 'dashboard', label: 'نظرة عامة', actions: ['view'] },
  { key: 'offices', label: 'المكاتب / Office 360°', actions: ['view', 'edit', 'approve', 'manage'] },
  { key: 'sales', label: 'المبيعات والسندات', actions: ['view', 'export'] },
  { key: 'accounting', label: 'الحسابات والرقابة المالية', actions: ['view', 'export'] },
  { key: 'permissions', label: 'صلاحيات المكاتب', actions: ['view', 'manage'] },
  { key: 'staff', label: 'مديرو إدارة رحّال', actions: ['view', 'create', 'edit', 'activate', 'disable', 'manage'] },
  { key: 'commissions', label: 'العمولات', actions: ['view', 'export'] },
  { key: 'requests', label: 'مركز الطلبات', actions: ['view'] },
  { key: 'ads', label: 'العروض والإعلانات', actions: ['view', 'create', 'edit', 'activate', 'disable'] },
  { key: 'backup', label: 'النسخ الاحتياطي والاستعادة', actions: ['view', 'create', 'download', 'approve'] },
  { key: 'system', label: 'إدارة النظام', actions: ['view', 'manage'] },
  { key: 'audit', label: 'سجل التدقيق', actions: ['view'] },
  { key: 'health', label: 'صحة النظام', actions: ['view'] },
  { key: 'notifications', label: 'الإشعارات', actions: ['view', 'manage'] },
  { key: 'reports', label: 'التقارير', actions: ['view', 'export'] },
  { key: 'disputes', label: 'النزاعات', actions: ['view', 'create', 'edit', 'approve', 'reject', 'manage'] },
  { key: 'currency', label: 'العملات وأسعار الصرف', actions: ['view', 'edit', 'manage'] },
  { key: 'geo', label: 'المواقع الجغرافية', actions: ['view', 'create', 'edit', 'activate', 'disable', 'move', 'manage'] },
  { key: 'payments', label: 'طرق الدفع والجهات المالية', actions: ['view', 'create', 'edit', 'activate', 'disable', 'approve', 'manage'] },
  { key: 'refdata', label: 'القوائم المرجعية', actions: ['view', 'create', 'edit', 'activate', 'disable', 'manage'] },
]
const SECTION_MAP = Object.fromEntries(ADMIN_SECTIONS.map(s => [s.key, s]))

// Built-in ADMIN role templates (organizational examples — immutable in code).
// Custom roles live in `admin_staff_roles` (extendable by the main super admin).
export const ADMIN_ROLE_TEMPLATES = [
  { key: 'offices_manager', label: 'مدير المكاتب', built_in: true, desc: 'إدارة ومتابعة المكاتب وOffice 360° والاشتراكات والتوثيق — لا حسابات ولا نسخ احتياطي إلا بمنح صريح', perms: { dashboard: ['view'], offices: ['view', 'edit', 'approve', 'manage'], requests: ['view'] } },
  { key: 'finance_manager', label: 'المدير المالي', built_in: true, desc: 'المبيعات والسندات والحسابات والعمولات والعملات وطرق الدفع والتقارير المالية — لا يدير صلاحيات النظام', perms: { dashboard: ['view'], sales: ['view', 'export'], accounting: ['view', 'export'], commissions: ['view', 'export'], currency: ['view', 'edit', 'manage'], payments: ['view', 'create', 'edit', 'activate', 'disable', 'approve'], reports: ['view', 'export'] } },
  { key: 'ops_manager', label: 'مدير العمليات', built_in: true, desc: 'مركز الطلبات والمبيعات التشغيلية والإشعارات التشغيلية', perms: { dashboard: ['view'], requests: ['view'], sales: ['view'], notifications: ['view', 'manage'], disputes: ['view'] } },
  { key: 'disputes_manager', label: 'مدير النزاعات', built_in: true, desc: 'عرض النزاعات ومراجعتها وتصعيدها — القرار بصلاحية approve/reject، ولا أثر مالي (المركز لا ينفذ مالياً بالتصميم)', perms: { dashboard: ['view'], disputes: ['view', 'create', 'edit', 'approve', 'reject'], reports: ['view'] } },
  { key: 'reports_officer', label: 'مسؤول التقارير', built_in: true, desc: 'عرض التقارير فقط — التصدير بمنح Export صراحة، ولا تعديل على العمليات الأصلية', perms: { dashboard: ['view'], reports: ['view'] } },
  { key: 'system_officer', label: 'مسؤول النظام والنسخ الاحتياطي', built_in: true, desc: 'صحة النظام والتكاملات والنسخ — الاستعادة/الصيانة صلاحيات منفصلة شديدة الحساسية (approve/manage)', perms: { dashboard: ['view'], system: ['view'], health: ['view'], backup: ['view', 'create', 'download'], audit: ['view'] } },
  { key: 'content_officer', label: 'مسؤول المحتوى', built_in: true, desc: 'العروض والإعلانات والإشعارات العامة — لا وصول للحسابات أو النسخ الاحتياطية', perms: { dashboard: ['view'], ads: ['view', 'create', 'edit', 'activate', 'disable'], notifications: ['view', 'manage'] } },
]

// ------------------------------- REALM CHECKS -------------------------------
// v3.98 — the main SA may be bound to the platform-org tenant (Rahaal company
// book) — identified by platform_org=true. Office users with a stray
// super_admin role (normal tenant, no flag) are still rejected.
export const isMainAdmin = (u) => !!u && u.role === 'super_admin' && (!u.tenant_id || u.platform_org === true)
export const isAdminStaff = (u) => !!u && u.role === 'admin_staff' && u.admin_realm === true && !u.tenant_id && u.active !== false
export const inAdminRealm = (u) => isMainAdmin(u) || isAdminStaff(u)

async function resolveRole(db, key) {
  if (!key) return null
  const bi = ADMIN_ROLE_TEMPLATES.find(t => t.key === key)
  if (bi) return { ...bi, active: true }
  return db.collection('admin_staff_roles').findOne({ key }, { projection: { _id: 0 } })
}

// Effective permissions = role perms + per-user overrides {'section.action': true|false}
export async function effectiveAdminPerms(db, user) {
  if (isMainAdmin(user)) return { all: true, realm: 'super_admin', perms: Object.fromEntries(ADMIN_SECTIONS.map(s => [s.key, s.actions])) }
  if (!isAdminStaff(user)) return { all: false, realm: null, perms: {} }
  const role = await resolveRole(db, user.admin_role_key)
  const perms = {}
  if (role && role.active !== false) for (const [sec, acts] of Object.entries(role.perms || {})) perms[sec] = [...(acts || [])]
  for (const [k, v] of Object.entries(user.admin_overrides || {})) {
    const [sec, act] = String(k).split('.')
    if (!SECTION_MAP[sec] || !SECTION_MAP[sec].actions.includes(act)) continue
    perms[sec] = perms[sec] || []
    if (v === true && !perms[sec].includes(act)) perms[sec].push(act)
    if (v === false) perms[sec] = perms[sec].filter(a => a !== act)
  }
  return { all: false, realm: 'admin_staff', role_key: user.admin_role_key || null, role_label: role?.label || null, perms }
}

// ------------------------------- ROUTE → SECTION GATE ------------------------
// Order matters (longest prefix first inside each group).
const ROUTE_SECTIONS = [
  ['/admin/center/accounting', 'accounting'],
  ['/admin/center/', 'sales'],
  ['/admin/perms/', 'permissions'],
  ['/admin/staff/', 'staff'],
  ['/admin/commissions/', 'commissions'],
  ['/admin/requests/', 'requests'],
  ['/admin/announcements', 'ads'],
  ['/admin/system/backups', 'backup'],
  ['/admin/system/restores', 'backup'],
  ['/admin/system/retention', 'backup'],
  ['/admin/system/', 'system'],
  ['/admin/audit/health', 'health'],
  ['/admin/audit/', 'audit'],
  ['/admin/notify/', 'notifications'],
  ['/admin/reports/', 'reports'],
  ['/admin/disputes', 'disputes'],
  ['/admin/currency/', 'currency'],
  ['/admin/geo/', 'geo'],
  ['/admin/payfin/', 'payments'],
  ['/admin/refdata/', 'refdata'],
]
export function sectionOfRoute(route) {
  for (const [prefix, sec] of ROUTE_SECTIONS) if (route.startsWith(prefix)) return sec
  return 'offices' // legacy panel endpoints (tenants/office360/pricing/password-reset/verifications/installments)
}

// The single server-side gate for EVERY /api/admin/* request.
// Returns null when allowed, or {error, status} when rejected.
export async function adminGate(db, sess, route, method) {
  const u = sess?.user
  if (!inAdminRealm(u)) return { error: 'غير مصرح — هذه المنطقة خاصة بإدارة رحّال العليا فقط', status: 403 }
  if (isMainAdmin(u)) return null // full access for the main super admin
  // shared lookup: the tenants LIST feeds dropdowns across admin screens
  if (route === '/admin/tenants' && method === 'GET') return null
  if (route === '/admin/staff/me' && method === 'GET') return null // own effective perms
  const sec = sectionOfRoute(route)
  const eff = await effectiveAdminPerms(db, u)
  const acts = eff.perms[sec] || []
  const secDef = SECTION_MAP[sec]
  if (method === 'GET') {
    if (!acts.includes('view')) return { error: `🚫 غير مصرح — لا تملك صلاحية عرض قسم «${secDef?.label || sec}»`, status: 403 }
    return null
  }
  const hasWrite = (secDef?.actions || []).some(a => a !== 'view' && a !== 'export' && acts.includes(a))
  if (!hasWrite) return { error: `🚫 غير مصرح — لا تملك صلاحية تنفيذ إجراءات في قسم «${secDef?.label || sec}»`, status: 403 }
  return null
}

// Helper handed to Batch-5 handlers for fine-grained checks.
export async function adminCan(db, sess) {
  const eff = await effectiveAdminPerms(db, sess.user)
  return { ...eff, has: (sec, act) => eff.all || (eff.perms[sec] || []).includes(act) }
}

// ------------------------------- STAFF HANDLER (/admin/staff/*) -------------
const safeStaff = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  admin_role_key: u.admin_role_key || null, admin_overrides: u.admin_overrides || {},
  active: u.active !== false, created_at: u.created_at || null,
  created_by: u.admin_created_by || null, updated_by: u.admin_updated_by || null,
  is_main: isMainAdmin(u),
})

export async function adminStaffHandler(db, path, method, p, body, sess) {
  const can = await adminCan(db, sess)
  const b = body || {}

  // -- my effective permissions (any admin realm user — feeds the shell)
  if (path === '/me' && method === 'GET') {
    const eff = await effectiveAdminPerms(db, sess.user)
    return { ...eff, sections: ADMIN_SECTIONS.map(s => ({ key: s.key, label: s.label, actions: s.actions, visible: eff.all || (eff.perms[s.key] || []).includes('view') })) }
  }

  if (!can.has('staff', 'view')) return { error: 'غير مصرح — تحتاج صلاحية عرض مديري الإدارة', status: 403 }

  if (path === '/catalog' && method === 'GET') {
    const customs = await db.collection('admin_staff_roles').find({}, { projection: { _id: 0 } }).toArray()
    return { sections: ADMIN_SECTIONS, templates: ADMIN_ROLE_TEMPLATES, custom_roles: customs }
  }

  if (path === '/roles' && method === 'GET') {
    const customs = await db.collection('admin_staff_roles').find({}, { projection: { _id: 0 } }).toArray()
    const users = await db.collection('users').find({ role: 'admin_staff' }, { projection: { admin_role_key: 1 } }).toArray()
    const counts = {}
    for (const u of users) if (u.admin_role_key) counts[u.admin_role_key] = (counts[u.admin_role_key] || 0) + 1
    const rows = [...ADMIN_ROLE_TEMPLATES.map(t => ({ ...t, active: true })), ...customs].map(r => ({ ...r, assigned_count: counts[r.key] || 0 }))
    return { roles: rows }
  }

  if (path === '/roles' && method === 'POST') {
    if (!can.has('staff', 'manage')) return { error: 'غير مصرح — إنشاء الأدوار يحتاج صلاحية Manage', status: 403 }
    const { label, desc, perms, reason } = b
    if (!label || !reason) return { error: 'الاسم والسبب إلزاميان' }
    const clean = {}
    for (const [sec, acts] of Object.entries(perms || {})) {
      if (!SECTION_MAP[sec]) return { error: `قسم غير معروف: ${sec}` }
      clean[sec] = (acts || []).filter(a => SECTION_MAP[sec].actions.includes(a))
    }
    const key = `custom_${Date.now().toString(36)}`
    const doc = { id: uuidv4(), key, label: String(label).slice(0, 120), desc: String(desc || '').slice(0, 400), perms: clean, built_in: false, active: true, created_at: new Date(), created_by: sess.user.email }
    await db.collection('admin_staff_roles').insertOne({ ...doc })
    await logAudit(db, sess, 'admin_role_create', { key, label: doc.label }, null, doc, reason)
    return { success: true, role: doc }
  }

  const roleM = path.match(/^\/roles\/([^/]+)$/)
  if (roleM && method === 'PUT') {
    if (!can.has('staff', 'manage')) return { error: 'غير مصرح — تعديل الأدوار يحتاج صلاحية Manage', status: 403 }
    const { reason } = b
    if (!reason) return { error: 'السبب إلزامي لتعديل دور إداري' }
    if (ADMIN_ROLE_TEMPLATES.some(t => t.key === roleM[1])) return { error: 'القوالب المدمجة غير قابلة للتعديل — أنشئ دوراً مخصصاً' }
    const role = await db.collection('admin_staff_roles').findOne({ key: roleM[1] })
    if (!role) return { error: 'الدور غير موجود', status: 404 }
    const upd = {}
    if (b.label) upd.label = String(b.label).slice(0, 120)
    if (b.desc !== undefined) upd.desc = String(b.desc || '').slice(0, 400)
    if (b.perms) {
      const clean = {}
      for (const [sec, acts] of Object.entries(b.perms)) {
        if (!SECTION_MAP[sec]) return { error: `قسم غير معروف: ${sec}` }
        clean[sec] = (acts || []).filter(a => SECTION_MAP[sec].actions.includes(a))
      }
      upd.perms = clean
    }
    if (b.active !== undefined) {
      const assigned = await db.collection('users').countDocuments({ role: 'admin_staff', admin_role_key: roleM[1] })
      if (b.active === false && assigned > 0) return { error: `لا يمكن تعطيل الدور — مسند إلى ${assigned} مستخدم. أعد الإسناد أولاً` }
      upd.active = !!b.active
    }
    upd.updated_at = new Date(); upd.updated_by = sess.user.email
    await db.collection('admin_staff_roles').updateOne({ key: roleM[1] }, { $set: upd })
    await logAudit(db, sess, 'admin_role_update', { key: roleM[1] }, { label: role.label, perms: role.perms, active: role.active }, upd, reason)
    return { success: true, note: 'تعديل الدور لا يسري تلقائياً على الجلسات المفتوحة إلا عند الطلب التالي (الصلاحيات تُحسب من قاعدة البيانات عند كل طلب)' }
  }

  if (path === '/users' && method === 'GET') {
    const users = await db.collection('users').find({ $or: [{ role: 'admin_staff' }, { role: 'super_admin', tenant_id: null }, { role: 'super_admin', platform_org: true }] }).toArray()
    return { users: users.map(safeStaff) }
  }

  if (path === '/users' && method === 'POST') {
    if (!can.has('staff', 'create')) return { error: 'غير مصرح — إضافة مدير يحتاج صلاحية Create', status: 403 }
    const { name, email, password, admin_role_key, reason } = b
    if (!name || !email || !password || !reason) return { error: 'الاسم والبريد وكلمة المرور والسبب إلزامية' }
    if (String(password).length < 6) return { error: 'كلمة المرور 6 أحرف على الأقل' }
    if (admin_role_key) {
      const role = await resolveRole(db, admin_role_key)
      if (!role || role.active === false) return { error: 'الدور المحدد غير موجود أو معطل' }
    }
    const exists = await db.collection('users').findOne({ email: String(email).toLowerCase().trim() })
    if (exists) return { error: 'البريد مستخدم مسبقاً' }
    const doc = {
      id: uuidv4(), tenant_id: null, admin_realm: true,
      email: String(email).toLowerCase().trim(), name: String(name).slice(0, 120),
      role: 'admin_staff', admin_role_key: admin_role_key || null, admin_overrides: {},
      active: true, password_hash: bcrypt.hashSync(String(password), 8),
      created_at: new Date(), admin_created_by: sess.user.email,
    }
    await db.collection('users').insertOne({ ...doc })
    await logAudit(db, sess, 'admin_staff_create', { id: doc.id, email: doc.email }, null, { name: doc.name, role_key: doc.admin_role_key }, reason)
    return { success: true, user: safeStaff(doc) }
  }

  const userM = path.match(/^\/users\/([^/]+)(\/preview)?$/)
  if (userM && userM[2] && method === 'GET') {
    const u = await db.collection('users').findOne({ id: userM[1] })
    if (!u || !inAdminRealm({ ...u, active: true })) return { error: 'المستخدم غير موجود في نطاق الإدارة', status: 404 }
    const eff = await effectiveAdminPerms(db, { ...u, active: true })
    return { user: safeStaff(u), effective: eff, sections: ADMIN_SECTIONS }
  }

  if (userM && !userM[2] && method === 'PATCH') {
    const target = await db.collection('users').findOne({ id: userM[1] })
    if (!target) return { error: 'المستخدم غير موجود', status: 404 }
    if (isMainAdmin(target) && !isMainAdmin(sess.user)) return { error: 'لا يمكن لموظف إدارة تعديل حساب المشرف الرئيسي', status: 403 }
    if (target.role !== 'admin_staff' && !isMainAdmin(target)) return { error: 'هذا المستخدم خارج نطاق الإدارة العليا — الإدارة من هنا ممنوعة', status: 403 }
    const { action, reason } = b
    if (!reason) return { error: 'السبب إلزامي لكل تغيير على حسابات الإدارة' }
    if (action === 'assign_role') {
      if (!can.has('staff', 'edit')) return { error: 'غير مصرح — يحتاج صلاحية Edit', status: 403 }
      if (isMainAdmin(target)) return { error: 'المشرف الرئيسي لا يُسند له دور — يملك كل الصلاحيات بالتصميم' }
      if (b.admin_role_key) {
        const role = await resolveRole(db, b.admin_role_key)
        if (!role || role.active === false) return { error: 'الدور غير موجود أو معطل' }
      }
      await db.collection('users').updateOne({ id: target.id }, { $set: { admin_role_key: b.admin_role_key || null, admin_updated_by: sess.user.email, updated_at: new Date() } })
      await logAudit(db, sess, 'admin_staff_assign_role', { id: target.id, email: target.email }, { role_key: target.admin_role_key || null }, { role_key: b.admin_role_key || null }, reason)
      return { success: true }
    }
    if (action === 'overrides') {
      if (!can.has('staff', 'manage')) return { error: 'غير مصرح — الـOverrides تحتاج صلاحية Manage', status: 403 }
      if (isMainAdmin(target)) return { error: 'لا Overrides على المشرف الرئيسي' }
      const clean = {}
      for (const [k, v] of Object.entries(b.overrides || {})) {
        const [sec, act] = String(k).split('.')
        if (SECTION_MAP[sec] && SECTION_MAP[sec].actions.includes(act) && typeof v === 'boolean') clean[k] = v
      }
      await db.collection('users').updateOne({ id: target.id }, { $set: { admin_overrides: clean, admin_updated_by: sess.user.email, updated_at: new Date() } })
      await logAudit(db, sess, 'admin_staff_overrides', { id: target.id, email: target.email }, target.admin_overrides || {}, clean, reason)
      return { success: true }
    }
    if (action === 'activate' || action === 'disable') {
      if (!can.has('staff', action)) return { error: `غير مصرح — يحتاج صلاحية ${action === 'activate' ? 'Activate' : 'Disable'}`, status: 403 }
      if (isMainAdmin(target)) return { error: 'لا يمكن تعطيل حساب المشرف الرئيسي من هنا' }
      // v4.2 — last-super-admin guard: never allow disabling the final active SA account
      if (action === 'disable' && target.role === 'super_admin') {
        const activeSAs = await db.collection('users').countDocuments({ role: 'super_admin', active: { $ne: false }, id: { $ne: target.id } })
        if (activeSAs === 0) return { error: 'لا يمكن تعطيل آخر Super Admin نشط في النظام', status: 409 }
      }
      const active = action === 'activate'
      await db.collection('users').updateOne({ id: target.id }, { $set: { active, admin_updated_by: sess.user.email, updated_at: new Date() } })
      let sessions_terminated = 0
      if (!active) {
        const del = await db.collection('sessions').deleteMany({ user_id: target.id })
        sessions_terminated = del.deletedCount || 0
      }
      await logAudit(db, sess, `admin_staff_${action}`, { id: target.id, email: target.email }, { active: target.active !== false }, { active, sessions_terminated }, reason)
      return { success: true, sessions_terminated }
    }
    // v4.2 — CLOSURE: the three missing operational actions (profile edit /
    // password reset / session termination) — all with mandatory reason + audit.
    if (action === 'edit_profile') {
      if (!can.has('staff', 'edit')) return { error: 'غير مصرح — يحتاج صلاحية Edit', status: 403 }
      const upd = {}
      if (b.name !== undefined && String(b.name).trim()) upd.name = String(b.name).slice(0, 120)
      if (b.phone !== undefined) upd.phone = String(b.phone || '').slice(0, 40)
      if (b.job_title !== undefined) upd.job_title = String(b.job_title || '').slice(0, 80)
      if (b.department !== undefined) upd.department = String(b.department || '').slice(0, 80)
      if (!Object.keys(upd).length) return { error: 'لا توجد بيانات للتعديل' }
      upd.admin_updated_by = sess.user.email; upd.updated_at = new Date()
      await db.collection('users').updateOne({ id: target.id }, { $set: upd })
      await logAudit(db, sess, 'admin_staff_edit_profile', { id: target.id, email: target.email },
        { name: target.name, phone: target.phone || null, job_title: target.job_title || null, department: target.department || null },
        { name: upd.name ?? target.name, phone: upd.phone ?? target.phone ?? null, job_title: upd.job_title ?? target.job_title ?? null, department: upd.department ?? target.department ?? null }, reason)
      return { success: true }
    }
    if (action === 'reset_password') {
      if (!can.has('staff', 'manage')) return { error: 'غير مصرح — إعادة تعيين كلمة المرور تحتاج صلاحية Manage', status: 403 }
      const newPass = b.new_password && String(b.new_password).length >= 6
        ? String(b.new_password)
        : Array.from({ length: 10 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 55)]).join('')
      await db.collection('users').updateOne({ id: target.id }, { $set: { password_hash: bcrypt.hashSync(newPass, 8), admin_updated_by: sess.user.email, updated_at: new Date() } })
      const del = await db.collection('sessions').deleteMany({ user_id: target.id })
      await logAudit(db, sess, 'admin_staff_reset_password', { id: target.id, email: target.email }, null, { sessions_terminated: del.deletedCount || 0 }, reason)
      return { success: true, new_password: newPass, sessions_terminated: del.deletedCount || 0 }
    }
    if (action === 'terminate_sessions') {
      if (!can.has('staff', 'manage')) return { error: 'غير مصرح — إنهاء الجلسات يحتاج صلاحية Manage', status: 403 }
      const del = await db.collection('sessions').deleteMany({ user_id: target.id })
      await logAudit(db, sess, 'admin_staff_terminate_sessions', { id: target.id, email: target.email }, null, { sessions_terminated: del.deletedCount || 0 }, reason)
      return { success: true, sessions_terminated: del.deletedCount || 0 }
    }
    return { error: 'إجراء غير معروف' }
  }

  if (path === '/audit' && method === 'GET') {
    const rows = await db.collection('audit_logs').find({ category: 'admin_staff' }, { projection: { _id: 0 } }).sort({ at: -1 }).limit(100).toArray()
    return { rows }
  }

  return { error: 'مسار غير معروف', status: 404 }
}
