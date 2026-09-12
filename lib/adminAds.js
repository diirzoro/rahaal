// ============================================================================
// v3.94 — ADS & ANNOUNCEMENTS (Super Admin Batch 2) — EXTENDS the existing
// announcements module IN PLACE (same collection `announcements`, same API
// paths /admin/announcements*). NO duplicate module. Backward compatible:
// legacy docs (no status/audience fields) keep working everywhere, and the
// legacy AnnouncementsManager (classic panel) keeps working (its PUT {active}
// toggles map to active/paused without breaking).
// New: types (offer/maintenance/notice), scheduling, priority, placement,
// CTA, backend-enforced audience targeting, lifecycle statuses, duplicate,
// publish-protection (published items can never be DELETEd — cancel instead),
// audit logging (audit_logs, category: announcements).
// ============================================================================
import { v4 as uuidv4 } from 'uuid'

const TYPES = ['popup', 'banner', 'offer', 'maintenance', 'notice']
const STATUSES = ['draft', 'active', 'paused', 'cancelled']
const AUD_MODES = ['all', 'tenants', 'plan', 'sub_status']
const IMPACTS = ['low', 'medium', 'high']

async function logAudit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'announcements', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* audit must never break the operation */ }
}

const safeUrl = (u) => {
  const s = String(u || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) return null // invalid → rejected, never rendered raw
  return s.slice(0, 1000)
}

// computed display status — storage stays minimal, time windows decide live/scheduled/expired
export function displayStatus(a, now = new Date()) {
  const st = a.status || (a.active === false ? 'paused' : 'active') // legacy fallback
  if (st === 'cancelled') return 'cancelled'
  if (st === 'draft') return 'draft'
  if (st === 'paused') return 'paused'
  if (a.starts_at && new Date(a.starts_at) > now) return 'scheduled'
  if (a.ends_at && new Date(a.ends_at) < now) return 'expired'
  return 'live'
}

function normalizeAudience(b) {
  const au = b?.audience
  if (!au || !AUD_MODES.includes(au.mode)) return { mode: 'all' }
  if (au.mode === 'tenants') return { mode: 'tenants', tenant_ids: Array.isArray(au.tenant_ids) ? au.tenant_ids.slice(0, 500).map(String) : [] }
  if (au.mode === 'plan') return { mode: 'plan', plan: String(au.plan || '').slice(0, 60) }
  if (au.mode === 'sub_status') return { mode: 'sub_status', sub_status: au.sub_status === 'activated' ? 'activated' : 'not_activated' }
  return { mode: 'all' }
}

// backend-enforced targeting — used by the tenant-side /announcements/active
export function audienceMatches(a, tenant) {
  const au = a.audience
  if (!au || !au.mode || au.mode === 'all') return true // legacy docs → everyone (unchanged behavior)
  if (au.mode === 'tenants') return (au.tenant_ids || []).includes(tenant?.id)
  if (au.mode === 'plan') return String(tenant?.subscription || 'trial') === au.plan
  if (au.mode === 'sub_status') return au.sub_status === 'activated' ? !!tenant?.activation_confirmed : !tenant?.activation_confirmed
  return true
}

// tenant-side active list (replaces the old inline query — superset, backward compatible)
export async function activeAnnouncementsFor(db, tenant) {
  const now = new Date()
  const list = await db.collection('announcements').find({
    $and: [
      { $or: [{ status: { $exists: false } }, { status: 'active' }] }, // legacy docs have no status
      { active: { $ne: false } },
      { $or: [{ starts_at: null }, { starts_at: { $lte: now } }, { starts_at: { $exists: false } }] },
      { $or: [{ ends_at: null }, { ends_at: { $gte: now } }, { ends_at: { $exists: false } }] },
    ],
  }).sort({ priority: -1, created_at: -1 }).toArray()
  return list.filter(a => audienceMatches(a, tenant)).map(a => ({
    id: a.id, type: a.type, title: a.title, body: a.body, image_url: a.image_url, link_url: a.link_url,
    cta_text: a.cta_text || null, placement: a.placement || null, priority: a.priority || 0,
    maintenance: a.type === 'maintenance' ? (a.maintenance || null) : undefined,
  }))
}

function buildMaintenance(b) {
  const m = b?.maintenance || {}
  return {
    expected_start: m.expected_start ? new Date(m.expected_start) : null,
    expected_end: m.expected_end ? new Date(m.expected_end) : null,
    affected: String(m.affected || '').slice(0, 300),
    impact_level: IMPACTS.includes(m.impact_level) ? m.impact_level : 'low',
    info_url: safeUrl(m.info_url) || '',
  }
}

export async function adminAdsHandler(db, path, method, p, b, sess) {
  // ---------- LIST ----------
  if (path === '' && method === 'GET') {
    const f = {}
    if (p.get('type')) f.type = p.get('type')
    const list = await db.collection('announcements').find(f, { projection: { _id: 0 } }).sort({ priority: -1, created_at: -1 }).limit(300).toArray()
    const now = new Date()
    let rows = list.map(a => ({ ...a, display_status: displayStatus(a, now) }))
    if (p.get('status')) rows = rows.filter(r => r.display_status === p.get('status'))
    const q = (p.get('q') || '').trim().toLowerCase()
    if (q) rows = rows.filter(r => (r.title || '').toLowerCase().includes(q) || (r.body || '').toLowerCase().includes(q) || (r.created_by || '').toLowerCase().includes(q))
    return { rows, counts: rows.reduce((m, r) => ({ ...m, [r.display_status]: (m[r.display_status] || 0) + 1 }), {}) }
  }

  // ---------- AUDIT ----------
  if (path === '/audit' && method === 'GET') {
    const rows = await db.collection('audit_logs').find({ category: 'announcements' }, { projection: { _id: 0 } }).sort({ at: -1 }).limit(100).toArray()
    return { rows }
  }

  // ---------- CREATE ----------
  if (path === '' && method === 'POST') {
    const title = String(b?.title || '').trim()
    if (!title) return { error: 'العنوان مطلوب' }
    const type = TYPES.includes(b?.type) ? b.type : 'popup'
    const image_url = safeUrl(b?.image_url)
    const link_url = safeUrl(b?.link_url)
    if (image_url === null) return { error: 'رابط الصورة غير صالح — يجب أن يبدأ بـ http(s)' }
    if (link_url === null) return { error: 'الرابط غير صالح — يجب أن يبدأ بـ http(s)' }
    // legacy compat: old manager sends {active} only → status derives from it
    const status = STATUSES.includes(b?.status) ? b.status : (b?.active === false ? 'draft' : 'active')
    const doc = {
      id: uuidv4(), type, title: title.slice(0, 200),
      body: String(b?.body || '').slice(0, 3000),
      image_url: image_url || '', link_url: link_url || '',
      cta_text: String(b?.cta_text || '').slice(0, 80),
      placement: String(b?.placement || 'dashboard').slice(0, 40),
      priority: Math.min(Math.max(parseInt(b?.priority) || 0, 0), 999),
      audience: normalizeAudience(b),
      active: status === 'active', // legacy field kept in sync for the old tenant query & old manager
      status,
      starts_at: b?.starts_at ? new Date(b.starts_at) : null,
      ends_at: b?.ends_at ? new Date(b.ends_at) : null,
      maintenance: type === 'maintenance' ? buildMaintenance(b) : null,
      published_at: status === 'active' ? new Date() : null,
      created_by: sess.user.email, created_at: new Date(),
    }
    await db.collection('announcements').insertOne(doc)
    await logAudit(db, sess, 'ann_create', doc.id, null, { title: doc.title, type, status, audience: doc.audience }, b?.reason)
    const { _id, ...rest } = doc
    return rest
  }

  const idMatch = path.match(/^\/([^/]+)(\/duplicate)?$/)
  if (!idMatch) return { error: 'مسار غير معروف', status: 404 }
  const id = idMatch[1]
  const doc = await db.collection('announcements').findOne({ id })
  if (!doc) return { error: 'الإعلان غير موجود', status: 404 }

  // ---------- DUPLICATE ----------
  if (idMatch[2] && method === 'POST') {
    const copy = {
      ...doc, _id: undefined, id: uuidv4(), title: `${doc.title} (نسخة)`,
      status: 'draft', active: false, published_at: null,
      created_by: sess.user.email, created_at: new Date(), updated_at: undefined, updated_by: undefined,
    }
    delete copy._id
    await db.collection('announcements').insertOne(copy)
    await logAudit(db, sess, 'ann_duplicate', copy.id, { source: doc.id }, { title: copy.title }, b?.reason)
    const { _id, ...rest } = copy
    return rest
  }

  // ---------- UPDATE (incl. lifecycle: activate / pause / cancel) ----------
  if (method === 'PUT') {
    if ((doc.status || 'active') === 'cancelled') return { error: 'الإعلان ملغى — الإلغاء نهائي، استخدم النسخ لإنشاء نسخة جديدة' }
    const upd = {}
    if (b.title !== undefined) upd.title = String(b.title).trim().slice(0, 200)
    if (b.body !== undefined) upd.body = String(b.body).slice(0, 3000)
    if (b.type !== undefined) { if (!TYPES.includes(b.type)) return { error: 'نوع غير معروف' }; upd.type = b.type }
    if (b.image_url !== undefined) { const u = safeUrl(b.image_url); if (u === null) return { error: 'رابط الصورة غير صالح' }; upd.image_url = u }
    if (b.link_url !== undefined) { const u = safeUrl(b.link_url); if (u === null) return { error: 'الرابط غير صالح' }; upd.link_url = u }
    if (b.cta_text !== undefined) upd.cta_text = String(b.cta_text).slice(0, 80)
    if (b.placement !== undefined) upd.placement = String(b.placement).slice(0, 40)
    if (b.priority !== undefined) upd.priority = Math.min(Math.max(parseInt(b.priority) || 0, 0), 999)
    if (b.audience !== undefined) upd.audience = normalizeAudience(b)
    if (b.starts_at !== undefined) upd.starts_at = b.starts_at ? new Date(b.starts_at) : null
    if (b.ends_at !== undefined) upd.ends_at = b.ends_at ? new Date(b.ends_at) : null
    if (b.maintenance !== undefined) upd.maintenance = (upd.type || doc.type) === 'maintenance' ? buildMaintenance(b) : null
    // lifecycle: explicit status OR legacy {active} toggle from the classic manager
    let newStatus = doc.status || (doc.active === false ? 'paused' : 'active')
    if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return { error: 'حالة غير معروفة' }; newStatus = b.status }
    else if (b.active !== undefined) newStatus = b.active ? 'active' : 'paused' // legacy toggle mapping
    if (newStatus === 'cancelled' && !String(b?.reason || '').trim()) return { error: 'السبب مطلوب لإلغاء إعلان (Audit)' }
    upd.status = newStatus
    upd.active = newStatus === 'active'
    if (newStatus === 'active' && !doc.published_at) upd.published_at = new Date()
    upd.updated_at = new Date(); upd.updated_by = sess.user.email
    await db.collection('announcements').updateOne({ id }, { $set: upd })
    await logAudit(db, sess, newStatus !== (doc.status || 'active') ? `ann_status_${newStatus}` : 'ann_update', id,
      { title: doc.title, status: doc.status || 'active', audience: doc.audience || null },
      { status: newStatus, changed: Object.keys(upd) }, b?.reason)
    return { success: true, status: newStatus }
  }

  // ---------- DELETE (only never-published drafts — history is preserved) ----------
  if (method === 'DELETE') {
    if (doc.published_at || doc.active === true || doc.status === 'active') {
      return { error: 'لا يُحذف إعلان سبق نشره — استخدم الإلغاء أو التعطيل مع بقاء السجل التاريخي' }
    }
    await db.collection('announcements').deleteOne({ id })
    await logAudit(db, sess, 'ann_delete_draft', id, { title: doc.title, status: doc.status || null }, null, b?.reason)
    return { success: true }
  }

  return { error: 'مسار غير معروف', status: 404 }
}
