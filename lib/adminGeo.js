// ============================================================================
// v3.97 — ADMIN GEO LOCATIONS CENTER (Super Admin Batch 5).
// New unified source (none existed — old addresses are FREE TEXT, documented
// gap): single collection `geo_locations` for the 5 administrative levels
// (country → governorate → district → neighborhood → street).
//  - Internal ids never change on rename. NO delete anywhere — disable only.
//  - Disabled items stay visible in historical data but are excluded from new
//    pickers (active_only=1).
//  - Parent required per level, duplicate names blocked within the SAME parent
//    (same name under a different parent is allowed) — enforced server-side.
//  - Move = sensitive: reason + geo.move permission + audit; blocked when it
//    would corrupt descendants (level chain is revalidated). Descendants'
//    inherited ancestor ids are updated atomically as part of the move
//    operation itself (a feature write — NOT a data migration).
//  - MERGE IS NOT IMPLEMENTED: it would require rewriting existing linked
//    records (a migration) → hard-disabled and recorded as a decision point.
//  - NO backfill of legacy free-text addresses. Ever.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'

async function logAudit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'geo', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* never break */ }
}

export const GEO_LEVELS = [
  { key: 'country', label: 'دولة', parent: null },
  { key: 'governorate', label: 'محافظة', parent: 'country' },
  { key: 'district', label: 'مديرية', parent: 'governorate' },
  { key: 'neighborhood', label: 'حي', parent: 'district' },
  { key: 'street', label: 'شارع', parent: 'neighborhood' },
]
const LVL = Object.fromEntries(GEO_LEVELS.map(l => [l.key, l]))
const ANCESTOR_FIELDS = { governorate: ['country_id'], district: ['country_id', 'governorate_id'], neighborhood: ['country_id', 'governorate_id', 'district_id'], street: ['country_id', 'governorate_id', 'district_id', 'neighborhood_id'] }
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ')

// Collections that MAY reference geo ids going forward (backward-compatible
// optional fields — legacy free-text address fields are untouched).
const USAGE_REFS = [
  ['tenants', 'geo', 'المكاتب'],
  ['clients', 'geo', 'العملاء'],
  ['suppliers', 'geo', 'الموردون'],
  ['users', 'geo', 'المستخدمون'],
  ['financial_entities', 'geo', 'الجهات المالية'],
  ['announcements', 'audience.geo', 'الإعلانات والاستهداف'],
]
async function usageOf(db, id) {
  const usage = []
  for (const [coll, field, label] of USAGE_REFS) {
    const or = ['country_id', 'governorate_id', 'district_id', 'neighborhood_id', 'street_id'].map(f => ({ [`${field}.${f}`]: id }))
    const n = await db.collection(coll).countDocuments({ $or: or }).catch(() => 0)
    if (n > 0) usage.push({ collection: coll, label, count: n })
  }
  return usage
}

const pub = (d) => ({
  id: d.id, level: d.level, parent_id: d.parent_id || null,
  name_ar: d.name_ar, name_en: d.name_en || null, code: d.code || null,
  dial_code: d.dial_code || null, currency: d.currency || null,
  active: d.active !== false, sort_order: d.sort_order ?? 0, notes: d.notes || null,
  ancestors: d.ancestors || {}, created_at: d.created_at || null, updated_at: d.updated_at || null,
  created_by: d.created_by || null, updated_by: d.updated_by || null,
})

export async function adminGeoHandler(db, path, method, p, body, sess, can) {
  const G = db.collection('geo_locations')
  const b = body || {}

  // ---- levels catalog
  if (path === '/levels' && method === 'GET') return { levels: GEO_LEVELS, merge_note: 'دمج المواقع غير متاح — يتطلب تعديل سجلات قائمة (Migration) — نقطة قرار مؤجلة' }

  // ---- list (cascading): ?level=&parent_id=&q=&status=&active_only=1
  if (path === '/list' && method === 'GET') {
    const level = p.get('level')
    if (!LVL[level]) return { error: 'مستوى غير معروف' }
    const f = { level }
    if (LVL[level].parent) {
      const parentId = p.get('parent_id')
      if (!parentId) return { rows: [], note: `اختر ${LVL[LVL[level].parent].label} أولاً — لا تُعرض عناصر غير تابعة للاختيار الحالي` }
      f.parent_id = parentId
    }
    if (p.get('q')) f.$or = [{ name_ar: { $regex: p.get('q'), $options: 'i' } }, { name_en: { $regex: p.get('q'), $options: 'i' } }, { code: { $regex: p.get('q'), $options: 'i' } }]
    if (p.get('status') === 'active') f.active = { $ne: false }
    if (p.get('status') === 'inactive') f.active = false
    if (p.get('active_only') === '1') f.active = { $ne: false }
    const rows = await G.find(f, { projection: { _id: 0 } }).sort({ sort_order: 1, name_ar: 1 }).limit(500).toArray()
    // children counts
    const childLevel = GEO_LEVELS[GEO_LEVELS.findIndex(l => l.key === level) + 1]?.key || null
    const counts = {}
    if (childLevel && rows.length) {
      const agg = await G.aggregate([{ $match: { level: childLevel, parent_id: { $in: rows.map(r => r.id) } } }, { $group: { _id: '$parent_id', n: { $sum: 1 } } }]).toArray()
      for (const a of agg) counts[a._id] = a.n
    }
    return { rows: rows.map(r => ({ ...pub(r), children_count: counts[r.id] || 0 })), child_level: childLevel }
  }

  // ---- create
  if (path === '/create' && method === 'POST') {
    if (!can.has('geo', 'create')) return { error: 'غير مصرح — إضافة موقع تحتاج صلاحية Create', status: 403 }
    const level = b.level
    if (!LVL[level]) return { error: 'مستوى غير معروف' }
    const name_ar = norm(b.name_ar)
    if (!name_ar) return { error: 'الاسم العربي إلزامي' }
    let parent = null, ancestors = {}
    if (LVL[level].parent) {
      if (!b.parent_id) return { error: `لا يمكن إنشاء ${LVL[level].label} دون ${LVL[LVL[level].parent].label}` }
      parent = await G.findOne({ id: b.parent_id, level: LVL[level].parent })
      if (!parent) return { error: `الموقع الأب غير موجود أو ليس ${LVL[LVL[level].parent].label}` }
      if (parent.active === false) return { error: 'الموقع الأب معطل — فعّله أولاً أو اختر أباً آخر' }
      ancestors = { ...(parent.ancestors || {}), [`${parent.level}_id`]: parent.id, [`${parent.level}_name`]: parent.name_ar }
    }
    const dup = await G.findOne({ level, parent_id: parent?.id || null, name_ar, active: { $ne: false } })
    if (dup) return { error: `الاسم «${name_ar}» موجود مسبقاً داخل نفس الموقع الأب — الاسم نفسه مقبول فقط تحت أب مختلف` }
    const doc = {
      id: uuidv4(), level, parent_id: parent?.id || null, ancestors,
      name_ar, name_en: norm(b.name_en) || null, code: norm(b.code) || null,
      dial_code: level === 'country' ? (norm(b.dial_code) || null) : null,
      currency: level === 'country' ? (norm(b.currency) || null) : null,
      active: true, sort_order: Number(b.sort_order) || 0, notes: String(b.notes || '').slice(0, 400) || null,
      created_at: new Date(), created_by: sess.user.email,
    }
    await G.insertOne({ ...doc })
    await logAudit(db, sess, 'geo_create', { id: doc.id, level, name: name_ar }, null, { parent: parent?.name_ar || null }, b.reason || null)
    return { success: true, location: pub(doc) }
  }

  const idM = path.match(/^\/([^/]+)(\/(toggle|move|usage))?$/)
  if (!idM) return { error: 'مسار غير معروف', status: 404 }
  const doc = await G.findOne({ id: idM[1] })
  if (!doc) return { error: 'الموقع غير موجود', status: 404 }
  const sub = idM[3] || null

  // ---- usage (where is it used + children)
  if (sub === 'usage' && method === 'GET') {
    const children = await G.countDocuments({ parent_id: doc.id })
    const usage = await usageOf(db, doc.id)
    return {
      location: pub(doc), children_count: children, usage,
      legacy_note: 'العناوين القديمة نصوص حرة غير مربوطة بهذا المركز — لا ربط تلقائي ولا Migration (فجوة موثقة). الاستخدام أعلاه يشمل السجلات المرتبطة بالمعرفات الجديدة فقط.',
      delete_policy: 'الحذف غير متاح نهائياً — استخدم التعطيل. الموقع المعطل يبقى في البيانات التاريخية ولا يظهر في الاختيارات الجديدة.',
    }
  }

  // ---- edit (rename/metadata — internal id NEVER changes)
  if (!sub && method === 'PUT') {
    if (!can.has('geo', 'edit')) return { error: 'غير مصرح — تعديل موقع يحتاج صلاحية Edit', status: 403 }
    const upd = {}
    if (b.name_ar !== undefined) {
      const name_ar = norm(b.name_ar)
      if (!name_ar) return { error: 'الاسم العربي لا يكون فارغاً' }
      const dup = await G.findOne({ level: doc.level, parent_id: doc.parent_id || null, name_ar, id: { $ne: doc.id }, active: { $ne: false } })
      if (dup) return { error: `الاسم «${name_ar}» مستخدم داخل نفس الموقع الأب` }
      upd.name_ar = name_ar
    }
    if (b.name_en !== undefined) upd.name_en = norm(b.name_en) || null
    if (b.code !== undefined) upd.code = norm(b.code) || null
    if (doc.level === 'country' && b.dial_code !== undefined) upd.dial_code = norm(b.dial_code) || null
    if (doc.level === 'country' && b.currency !== undefined) upd.currency = norm(b.currency) || null
    if (b.sort_order !== undefined) upd.sort_order = Number(b.sort_order) || 0
    if (b.notes !== undefined) upd.notes = String(b.notes || '').slice(0, 400) || null
    if (!Object.keys(upd).length) return { error: 'لا تغييرات' }
    upd.updated_at = new Date(); upd.updated_by = sess.user.email
    await G.updateOne({ id: doc.id }, { $set: upd })
    // keep denormalized ancestor NAME in descendants fresh on rename (display only — ids unchanged)
    if (upd.name_ar && doc.level !== 'street') await G.updateMany({ [`ancestors.${doc.level}_id`]: doc.id }, { $set: { [`ancestors.${doc.level}_name`]: upd.name_ar } })
    await logAudit(db, sess, 'geo_update', { id: doc.id, level: doc.level }, { name_ar: doc.name_ar, code: doc.code }, upd, b.reason || null)
    return { success: true }
  }

  // ---- activate/disable (disable is the ONLY retirement path — no delete)
  if (sub === 'toggle' && method === 'POST') {
    const target = doc.active === false
    if (!can.has('geo', target ? 'activate' : 'disable')) return { error: `غير مصرح — يحتاج صلاحية ${target ? 'Activate' : 'Disable'}`, status: 403 }
    if (!b.reason) return { error: 'السبب إلزامي للتفعيل/التعطيل' }
    if (target && doc.parent_id) {
      const parent = await G.findOne({ id: doc.parent_id })
      if (parent?.active === false) return { error: 'لا يمكن تفعيل موقع أبوه معطل — فعّل الأب أولاً' }
    }
    await G.updateOne({ id: doc.id }, { $set: { active: target, updated_at: new Date(), updated_by: sess.user.email } })
    let descendants_disabled = 0
    if (!target) {
      const r = await G.updateMany({ [`ancestors.${doc.level}_id`]: doc.id, active: { $ne: false } }, { $set: { active: false, updated_at: new Date(), updated_by: sess.user.email, disabled_via_parent: doc.id } })
      descendants_disabled = r.modifiedCount || 0
    }
    await logAudit(db, sess, target ? 'geo_activate' : 'geo_disable', { id: doc.id, level: doc.level, name: doc.name_ar }, { active: doc.active !== false }, { active: target, descendants_disabled }, b.reason)
    return { success: true, descendants_disabled, note: target ? null : 'الموقع وتوابعه لم يعودوا يظهرون في الاختيارات الجديدة — البيانات التاريخية لم تُمس' }
  }

  // ---- move (sensitive: reason + geo.move + validation; blocks corruption)
  if (sub === 'move' && method === 'POST') {
    if (!can.has('geo', 'move')) return { error: 'غير مصرح — نقل موقع يحتاج صلاحية Move', status: 403 }
    if (!b.reason) return { error: 'السبب إلزامي لنقل موقع' }
    if (!LVL[doc.level].parent) return { error: 'الدولة أعلى مستوى — لا تُنقل' }
    const newParent = await G.findOne({ id: b.new_parent_id })
    if (!newParent) return { error: 'الأب الجديد غير موجود' }
    if (newParent.level !== LVL[doc.level].parent) return { error: `النقل مرفوض — سيكسر التسلسل الإداري: ${LVL[doc.level].label} يجب أن يتبع ${LVL[LVL[doc.level].parent].label} وليس ${LVL[newParent.level].label}` }
    if (newParent.active === false) return { error: 'النقل مرفوض — الأب الجديد معطل' }
    if (newParent.id === doc.parent_id) return { error: 'الموقع تابع لهذا الأب أصلاً' }
    const dup = await G.findOne({ level: doc.level, parent_id: newParent.id, name_ar: doc.name_ar, active: { $ne: false } })
    if (dup) return { error: `النقل مرفوض — يوجد «${doc.name_ar}» بنفس الاسم تحت الأب الجديد` }
    const newAncestors = { ...(newParent.ancestors || {}), [`${newParent.level}_id`]: newParent.id, [`${newParent.level}_name`]: newParent.name_ar }
    await G.updateOne({ id: doc.id }, { $set: { parent_id: newParent.id, ancestors: newAncestors, updated_at: new Date(), updated_by: sess.user.email } })
    // rewrite ONLY the inherited ancestor chain of descendants (part of the move feature)
    const descendants = await G.find({ [`ancestors.${doc.level}_id`]: doc.id }).toArray()
    for (const d of descendants) {
      const kept = {}
      for (const [k, v] of Object.entries(d.ancestors || {})) {
        const lvlKey = k.replace(/_(id|name)$/, '')
        const lvlIdx = GEO_LEVELS.findIndex(l => l.key === lvlKey)
        if (lvlIdx >= GEO_LEVELS.findIndex(l => l.key === doc.level)) kept[k] = v
      }
      await G.updateOne({ id: d.id }, { $set: { ancestors: { ...newAncestors, [`${doc.level}_id`]: doc.id, [`${doc.level}_name`]: doc.name_ar, ...kept } } })
    }
    await logAudit(db, sess, 'geo_move', { id: doc.id, level: doc.level, name: doc.name_ar }, { parent_id: doc.parent_id }, { parent_id: newParent.id, parent_name: newParent.name_ar, descendants_updated: descendants.length }, b.reason)
    return { success: true, descendants_updated: descendants.length, note: 'العناوين القديمة (النصية) لم تُعدل — النقل يخص شجرة المواقع والسجلات المرتبطة بالمعرفات فقط' }
  }

  return { error: 'مسار غير معروف', status: 404 }
}
