// ============================================================================
// v3.93 — PERMISSIONS CENTER (Super Admin Batch 1) — built ON TOP of the
// EXISTING RBAC (DEFAULT_STAFF_PERMISSIONS + effectivePermissions + built-in
// RBAC_ROLE_TEMPLATES + per-user permissions overrides). NO new engine.
// - Built-in templates stay hardcoded & immutable (marked built_in).
// - Custom templates live in `admin_role_templates` (extendable — not code-fixed).
// - Every sensitive change is written to `audit_logs` with before/after + reason.
// - Existing users/roles are NEVER auto-modified by anything here.
// The route passes in the live RBAC primitives so there is exactly ONE source
// of truth: rbac = { defaults, templates(), ownerAll() }.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'

async function logAudit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'permissions', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* audit must never break the operation */ }
}

const safeUser = (u, tn) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, role_key: u.role_key || null,
  active: u.active !== false, tenant_id: u.tenant_id, tenant_name: tn[u.tenant_id] || u.tenant_id || '—',
  overrides_count: Object.keys(u.permissions || {}).length,
  created_at: u.created_at || null,
  last_login: u.last_login || null, // not tracked by the system currently — stays null (data gap)
})

export async function adminPermsHandler(db, path, method, p, body, sess, rbac) {
  const tn = Object.fromEntries((await db.collection('tenants').find({}, { projection: { id: 1, name: 1 } }).toArray()).map(t => [t.id, t.name]))
  const allTemplates = async () => {
    const customs = await db.collection('admin_role_templates').find({}, { projection: { _id: 0 } }).toArray()
    return [
      ...rbac.templates().map(t => ({ ...t, id: `builtin_${t.key}`, built_in: true, active: true })),
      ...customs.map(c => ({ ...c, built_in: false })),
    ]
  }

  // ---------- USERS ----------
  if (path === '/users' && method === 'GET') {
    const f = { role: { $ne: 'super_admin' } }
    if (p.get('tenant')) f.tenant_id = p.get('tenant')
    const q = (p.get('q') || '').trim()
    if (q) f.$or = [{ name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }]
    const users = await db.collection('users').find(f, { projection: { password: 0, password_hash: 0, _id: 0 } }).sort({ created_at: -1 }).limit(150).toArray()
    return { users: users.map(u => safeUser(u, tn)), read_only: true }
  }

  // ---------- EFFECTIVE PERMISSIONS PREVIEW ----------
  if (path === '/user-preview' && method === 'GET') {
    const u = await db.collection('users').findOne({ id: p.get('id') }, { projection: { password: 0, password_hash: 0, _id: 0 } })
    if (!u) return { error: 'المستخدم غير موجود', status: 404 }
    const defaults = rbac.defaults
    const overrides = u.permissions || {}
    const tpl = (await allTemplates()).find(t => t.key === u.role_key) || null
    const isOwner = u.role === 'owner'
    const effective = isOwner ? rbac.ownerAll() : { ...defaults, ...overrides }
    const breakdown = Object.keys(defaults).map(key => {
      const inOverride = Object.prototype.hasOwnProperty.call(overrides, key)
      const tplVal = tpl?.perms?.[key]
      let source = 'الافتراضي العام'
      if (isOwner) source = 'مالك — كل الصلاحيات ضمنياً'
      else if (inOverride) source = (tplVal !== undefined && tplVal === overrides[key]) ? `محفوظ من قالب الدور (${tpl?.label || u.role_key})` : 'Override مباشر على المستخدم'
      return { key, default: !!defaults[key], template: tplVal === undefined ? null : !!tplVal, override: inOverride ? !!overrides[key] : null, effective: !!effective[key], source }
    })
    return { user: safeUser(u, tn), role_template: tpl ? { key: tpl.key, label: tpl.label, built_in: !!tpl.built_in } : null, breakdown, denied: breakdown.filter(b => !b.effective).map(b => b.key), read_only: true, note: 'أولوية الحسم: مالك > Override المباشر المحفوظ على المستخدم > الافتراضي العام. القالب يُطبق وقت الإسناد (يُحفظ كـOverrides).' }
  }

  // ---------- ROLES ----------
  if (path === '/roles' && method === 'GET') {
    const roles = await allTemplates()
    // usage count per role_key (delete protection info)
    const usage = await db.collection('users').aggregate([{ $match: { role_key: { $ne: null } } }, { $group: { _id: '$role_key', n: { $sum: 1 } } }]).toArray()
    const useBy = Object.fromEntries(usage.map(x => [x._id, x.n]))
    return { roles: roles.map(r => ({ ...r, users_count: useBy[r.key] || 0 })), perm_keys: Object.keys(rbac.defaults) }
  }
  if (path === '/roles' && method === 'POST') {
    const label = String(body?.label || '').trim()
    if (!label) return { error: 'اسم الدور مطلوب' }
    const dup = (await allTemplates()).find(t => t.label === label)
    if (dup) return { error: `يوجد دور بنفس الاسم "${label}" — استخدم اسماً مختلفاً` }
    let perms = {}
    if (body?.copy_of_key) {
      const src = (await allTemplates()).find(t => t.key === body.copy_of_key)
      if (!src) return { error: 'الدور المراد نسخه غير موجود' }
      perms = { ...src.perms }
    }
    // only known permission keys are accepted (no engine expansion)
    for (const [k, v] of Object.entries(body?.perms || {})) if (k in rbac.defaults) perms[k] = !!v
    const doc = { id: uuidv4(), key: `custom_${uuidv4().slice(0, 8)}`, label, desc: String(body?.desc || ''), perms, active: true, built_in: false, created_at: new Date(), created_by: sess.user.email }
    await db.collection('admin_role_templates').insertOne(doc)
    await logAudit(db, sess, 'role_create', doc.key, null, { label, perms_true: Object.keys(perms).filter(k => perms[k]).length }, body?.reason)
    const { _id, ...rest } = doc
    return rest
  }
  const roleIdMatch = path.match(/^\/roles\/([^/]+)$/)
  if (roleIdMatch && method === 'PUT') {
    const r = await db.collection('admin_role_templates').findOne({ id: roleIdMatch[1] })
    if (!r) return { error: 'الدور غير موجود أو مدمج (Built-in لا يُعدل)', status: 404 }
    if (!String(body?.reason || '').trim()) return { error: 'السبب مطلوب لتعديل دور (Audit)' }
    const upd = {}
    if (body.label !== undefined) upd.label = String(body.label).trim()
    if (body.desc !== undefined) upd.desc = String(body.desc)
    if (body.active !== undefined) upd.active = !!body.active
    if (body.perms !== undefined) {
      const perms = {}
      for (const [k, v] of Object.entries(body.perms || {})) if (k in rbac.defaults) perms[k] = !!v
      upd.perms = perms
    }
    upd.updated_at = new Date(); upd.updated_by = sess.user.email
    await db.collection('admin_role_templates').updateOne({ id: r.id }, { $set: upd })
    await logAudit(db, sess, 'role_update', r.key, { label: r.label, active: r.active, perms: r.perms }, upd, body.reason)
    return { success: true, note: 'تعديل القالب لا يغيّر صلاحيات المستخدمين الحاليين تلقائياً — يسري عند إعادة الإسناد' }
  }
  const toggleMatch = path.match(/^\/roles\/([^/]+)\/toggle$/)
  if (toggleMatch && method === 'POST') {
    const r = await db.collection('admin_role_templates').findOne({ id: toggleMatch[1] })
    if (!r) return { error: 'الدور غير موجود أو مدمج', status: 404 }
    if (!String(body?.reason || '').trim()) return { error: 'السبب مطلوب (Audit)' }
    await db.collection('admin_role_templates').updateOne({ id: r.id }, { $set: { active: !r.active, updated_at: new Date(), updated_by: sess.user.email } })
    await logAudit(db, sess, r.active ? 'role_disable' : 'role_enable', r.key, { active: r.active }, { active: !r.active }, body.reason)
    return { success: true, active: !r.active }
  }
  if (roleIdMatch && method === 'DELETE') {
    const r = await db.collection('admin_role_templates').findOne({ id: roleIdMatch[1] })
    if (!r) return { error: 'الدور غير موجود أو مدمج (Built-in لا يُحذف)', status: 404 }
    const used = await db.collection('users').countDocuments({ role_key: r.key })
    if (used > 0) return { error: `الدور مرتبط بـ${used} مستخدماً — استخدم التعطيل بدلاً من الحذف` }
    await db.collection('admin_role_templates').deleteOne({ id: r.id })
    await logAudit(db, sess, 'role_delete', r.key, { label: r.label }, null, body?.reason)
    return { success: true }
  }

  // ---------- AUDIT ----------
  if (path === '/audit' && method === 'GET') {
    const rows = await db.collection('audit_logs').find({ category: 'permissions' }, { projection: { _id: 0 } }).sort({ at: -1 }).limit(100).toArray()
    return { rows }
  }

  // v4.2 — CLOSURE: role assignment + per-user overrides became OPERATIONAL.
  // Materializes into the EXISTING engine (user.role_key + user.permissions) so
  // enforcement happens in every tenant API automatically — no new engine.
  const permUserM = path.match(/^\/users\/([^/]+)$/)
  if (permUserM && method === 'PATCH') {
    const target = await db.collection('users').findOne({ id: permUserM[1] })
    if (!target) return { error: 'المستخدم غير موجود', status: 404 }
    // Guards: office STAFF only — owner has everything by design, SA/admin realm managed from «مديرو رحّال»
    if (target.role === 'owner') return { error: 'مالك المكتب يملك كل صلاحيات مكتبه بالتصميم — لا يُسند له دور', status: 403 }
    if (target.role === 'super_admin' || target.role === 'admin_staff' || target.admin_realm) return { error: 'حسابات الإدارة العليا تُدار من قسم «مديرو رحّال» فقط', status: 403 }
    if (target.id === sess.user.id) return { error: 'لا يمكنك تعديل صلاحياتك بنفسك (منع Self-Lockout/Self-Escalation)', status: 403 }
    const { action, reason } = body || {}
    if (!reason) return { error: 'السبب إلزامي لكل تغيير في الصلاحيات' }
    const allKeys = Object.keys(rbac.defaults || {})
    if (action === 'assign_role') {
      const key = body.role_key || null
      let newPerms = target.permissions || {}
      let tplLabel = null
      if (key) {
        const tpl = (await allTemplates()).find(t => t.key === key)
        if (!tpl || tpl.active === false) return { error: 'الدور غير موجود أو معطل' }
        tplLabel = tpl.label
        newPerms = {}
        for (const k of allKeys) if (Object.prototype.hasOwnProperty.call(tpl.perms || {}, k)) newPerms[k] = !!tpl.perms[k]
      }
      await db.collection('users').updateOne({ id: target.id }, { $set: { role_key: key, permissions: newPerms, updated_at: new Date(), perms_updated_by: sess.user.email } })
      await logAudit(db, sess, 'perms_assign_role', { id: target.id, email: target.email },
        { role_key: target.role_key || null, permissions_count: Object.keys(target.permissions || {}).length },
        { role_key: key, template: tplLabel, permissions_count: Object.keys(newPerms).length }, reason)
      return { success: true, role_key: key, applied_permissions: Object.keys(newPerms).length }
    }
    if (action === 'override') {
      const key = String(body.key || '')
      if (!allKeys.includes(key)) return { error: `مفتاح صلاحية غير معروف: ${key}` }
      const cur = { ...(target.permissions || {}) }
      const before = Object.prototype.hasOwnProperty.call(cur, key) ? cur[key] : null
      if (body.value === null || body.value === undefined) delete cur[key] // إزالة الـOverride → يعود للافتراضي
      else cur[key] = !!body.value
      await db.collection('users').updateOne({ id: target.id }, { $set: { permissions: cur, updated_at: new Date(), perms_updated_by: sess.user.email } })
      await logAudit(db, sess, 'perms_override', { id: target.id, email: target.email }, { key, value: before }, { key, value: body.value === null || body.value === undefined ? null : !!body.value }, reason)
      return { success: true }
    }
    return { error: 'إجراء غير معروف' }
  }

  return { error: 'مسار غير معروف', status: 404 }
}
