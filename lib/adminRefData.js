// ============================================================================
// v3.97 — UNIFIED REFERENCE DATA REGISTRY (Super Admin Batch 5).
// ONE clear source per list — three kinds, no duplication:
//  - managed : generic admin lists stored in ONE collection `admin_ref_lists`
//              (one doc per list key, items array) — NOT a collection per list.
//  - external: lists that ALREADY have a dedicated manager (currencies/FX,
//              payment methods, financial entities, geo, dispute lists,
//              notification settings) — registry LINKS to them, never copies.
//  - locked  : sensitive CODE CONSTANTS that must NOT become free lists
//              (state machines, journal/voucher types, operational currencies,
//              RBAC actions) — shown read-only WITH the reason.
// Items are never deleted — disable only; disabled items stay in old records
// but are excluded from new pickers (active_only). Server-side validation +
// refdata.* permissions enforced here (not just UI hiding).
// ============================================================================
import { v4 as uuidv4 } from 'uuid'

async function logAudit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'refdata', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* never break */ }
}

// starting items for managed lists (created on first write — no seeding job)
const MANAGED_LISTS = [
  { key: 'cancellation_reasons', label: 'أسباب الإلغاء', desc: 'أسباب إلغاء العمليات/الطلبات — السجلات القديمة تحمل نصاً حراً (فجوة موثقة، لا Backfill)' },
  { key: 'refund_reasons', label: 'أسباب الاسترداد', desc: 'أسباب طلبات الاسترداد' },
  { key: 'rejection_reasons', label: 'أسباب الرفض العامة', desc: 'أسباب رفض عامة (خارج النزاعات — لأسباب رفض النزاعات مصدرها مركز النزاعات)' },
  { key: 'service_categories', label: 'التصنيفات الإدارية للخدمات', desc: 'تصنيفات إدارية عامة — لا تمس service_types التشغيلية الخاصة بكل مكتب' },
]

const EXTERNAL_LISTS = [
  { key: 'currencies', label: 'العملات', source: 'ثابت CURRENCIES بالكود + السجل الإداري (مركز العملات)', manage_section: 'currency', manage_hint: 'تُدار من «العملات وأسعار الصرف»' },
  { key: 'fx_rates', label: 'أسعار الصرف', source: 'tenant_settings.rates لكل مكتب + fx_rate_history', manage_section: 'currency', manage_hint: 'تُدار من «العملات وأسعار الصرف»' },
  { key: 'payment_methods', label: 'طرق الدفع', source: 'payment_methods (مركز طرق الدفع)', manage_section: 'payments', manage_hint: 'تُدار من «طرق الدفع والجهات المالية»' },
  { key: 'financial_entities', label: 'البنوك والصرافون وشركات التحويل', source: 'financial_entities (مركز طرق الدفع)', manage_section: 'payments', manage_hint: 'تُدار من «طرق الدفع والجهات المالية»' },
  { key: 'geo_locations', label: 'الدول والمحافظات والمديريات والأحياء والشوارع', source: 'geo_locations (مركز المواقع)', manage_section: 'geo', manage_hint: 'تُدار من «المواقع الجغرافية»' },
  { key: 'dispute_lists', label: 'أنواع النزاعات وأسبابها وأولوياتها وأسباب رفضها', source: 'admin_dispute_config (مركز النزاعات)', manage_section: 'disputes', manage_hint: 'تُدار من «مركز النزاعات»' },
  { key: 'notification_settings', label: 'إعدادات وقوالب الإشعارات الإدارية', source: 'admin_notification_settings (مركز الإشعارات)', manage_section: 'notifications', manage_hint: 'تُدار من «التنبيهات»' },
  { key: 'office_role_templates', label: 'قوالب أدوار المكاتب (RBAC)', source: 'قوالب مدمجة + admin_role_templates (مركز الصلاحيات)', manage_section: 'permissions', manage_hint: 'تُدار من «الصلاحيات»' },
  { key: 'admin_roles', label: 'أدوار مديري إدارة رحّال', source: 'قوالب مدمجة + admin_staff_roles (مركز مديري رحّال)', manage_section: 'staff', manage_hint: 'تُدار من «مديرو إدارة رحّال»' },
  { key: 'service_types_tenant', label: 'أنواع الخدمات التشغيلية', source: 'service_types لكل مكتب (يديرها كل مكتب من واجهته)', manage_section: null, manage_hint: 'مصدر تشغيلي خاص بكل مكتب — لا تُدار مركزياً (توافق خلفي)' },
]

const LOCKED_LISTS = [
  { key: 'operational_currencies', label: 'العملات التشغيلية للمحرك', reason: 'ثابت CURRENCIES في الكود (USD/SAR/YER — الأساس YER) — تفعيل عملة جديدة في المحرك نقطة قرار وليست قائمة حرة' },
  { key: 'voucher_types', label: 'أنواع السندات (قبض/صرف)', reason: 'مرتبطة بمنطق القيد المحاسبي المزدوج — تعديلها من مستخدم يكسر المحاسبة' },
  { key: 'journal_entry_types', label: 'أنواع القيود المحاسبية الأساسية', reason: 'أساس دفتر الأستاذ وميزان المراجعة — غير قابلة للتعديل من المستخدم' },
  { key: 'operation_statuses', label: 'حالات العمليات (تذاكر/تأشيرات/خدمات/باكجات)', reason: 'آلة حالات تشغيلية بالكود — الإضافة العشوائية تكسر التقارير والتدفقات' },
  { key: 'dispute_status_machine', label: 'آلة حالات النزاعات', reason: 'انتقالات مفروضة من الخادم — الحالات ليست قائمة حرة (الأنواع والأسباب فقط قابلة للإدارة)' },
  { key: 'payment_order_statuses', label: 'حالات أوامر الدفع اليدوي', reason: 'آلة حالات مالية حساسة (مسودة→…→مؤكد/مسترد) — مفروضة من الخادم' },
  { key: 'rbac_actions', label: 'كتالوج أقسام وإجراءات الصلاحيات الإدارية', reason: 'ثابت أمني بالكود — الأدوار قابلة للإنشاء، أما الأقسام والإجراءات فلا' },
]

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ')
const itemPub = (i) => ({ key: i.key, label: i.label, label_en: i.label_en || null, active: i.active !== false, sort_order: i.sort_order ?? 0, notes: i.notes || null, created_at: i.created_at || null, updated_by: i.updated_by || null })

export async function adminRefDataHandler(db, path, method, p, body, sess, can) {
  const b = body || {}
  const RL = db.collection('admin_ref_lists')

  if (path === '/registry' && method === 'GET') {
    const stored = await RL.find({}, { projection: { _id: 0, key: 1, items: 1, updated_at: 1 } }).toArray()
    const counts = Object.fromEntries(stored.map(s => [s.key, { total: (s.items || []).length, active: (s.items || []).filter(i => i.active !== false).length }]))
    return {
      managed: MANAGED_LISTS.map(l => ({ ...l, kind: 'managed', counts: counts[l.key] || { total: 0, active: 0 } })),
      external: EXTERNAL_LISTS.map(l => ({ ...l, kind: 'external' })),
      locked: LOCKED_LISTS.map(l => ({ ...l, kind: 'locked' })),
      policy: 'مصدر واحد لكل قائمة — لا تكرار بين الأقسام. الثوابت الحساسة تبقى بالكود مع سبب معلن. القوائم المدارة: تعطيل بدل حذف، والمعطل يبقى في السجلات القديمة',
    }
  }

  const lM = path.match(/^\/lists\/([a-z_]+)(\/items(\/([^/]+))?(\/toggle)?)?$/)
  if (!lM) return { error: 'مسار غير معروف', status: 404 }
  const def = MANAGED_LISTS.find(l => l.key === lM[1])
  if (!def) {
    if (EXTERNAL_LISTS.some(l => l.key === lM[1])) return { error: 'هذه القائمة تُدار من مركزها المخصص — لا مصدر مكرر هنا', status: 400 }
    if (LOCKED_LISTS.some(l => l.key === lM[1])) return { error: 'قائمة مقفلة بالكود — غير قابلة للإدارة بالتصميم', status: 400 }
    return { error: 'قائمة غير معروفة', status: 404 }
  }
  const doc = await RL.findOne({ key: def.key })
  const items = doc?.items || []

  // ---- read list (?active_only=1 for pickers, ?q= search)
  if (!lM[2] && method === 'GET') {
    let rows = items
    if (p.get('active_only') === '1') rows = rows.filter(i => i.active !== false)
    if (p.get('q')) rows = rows.filter(i => (i.label || '').includes(p.get('q')) || (i.label_en || '').toLowerCase().includes(p.get('q').toLowerCase()))
    rows = [...rows].sort((a, c) => (a.sort_order ?? 0) - (c.sort_order ?? 0) || String(a.label).localeCompare(String(c.label)))
    return { list: def, items: rows.map(itemPub), usage_note: 'قوائم جديدة — السجلات القديمة تحمل نصوصاً حرة غير مربوطة (لا Backfill). «أين استُخدم» يعمل تلقائياً حين تتبنى التدفقات هذه المفاتيح' }
  }

  // ---- add item
  if (lM[2] && !lM[4] && method === 'POST') {
    if (!can.has('refdata', 'create')) return { error: 'غير مصرح — الإضافة تحتاج صلاحية Create (مفروضة من الخادم حتى لو أُرسل الطلب مباشرة للـAPI)', status: 403 }
    const label = norm(b.label)
    if (!label) return { error: 'الاسم إلزامي' }
    if (items.some(i => i.label === label)) return { error: `«${label}» موجود مسبقاً في القائمة — لا تكرار` }
    const item = { key: `${def.key.slice(0, 3)}_${Date.now().toString(36)}`, label, label_en: norm(b.label_en) || null, active: true, sort_order: Number(b.sort_order) || 0, notes: String(b.notes || '').slice(0, 300) || null, created_at: new Date(), created_by: sess.user.email }
    await RL.updateOne({ key: def.key }, { $set: { key: def.key, label: def.label, updated_at: new Date() }, $push: { items: item } }, { upsert: true })
    await logAudit(db, sess, 'ref_item_add', { list: def.key, item: item.key }, null, { label }, b.reason || null)
    return { success: true, item: itemPub(item) }
  }

  if (lM[4]) {
    const item = items.find(i => i.key === lM[4])
    if (!item) return { error: 'العنصر غير موجود', status: 404 }

    // ---- edit item
    if (!lM[5] && method === 'PUT') {
      if (!can.has('refdata', 'edit')) return { error: 'غير مصرح — التعديل يحتاج صلاحية Edit', status: 403 }
      const upd = {}
      if (b.label !== undefined) {
        const label = norm(b.label); if (!label) return { error: 'الاسم لا يكون فارغاً' }
        if (items.some(i => i.label === label && i.key !== item.key)) return { error: 'الاسم مستخدم في القائمة' }
        upd['items.$.label'] = label
      }
      if (b.label_en !== undefined) upd['items.$.label_en'] = norm(b.label_en) || null
      if (b.sort_order !== undefined) upd['items.$.sort_order'] = Number(b.sort_order) || 0
      if (b.notes !== undefined) upd['items.$.notes'] = String(b.notes || '').slice(0, 300) || null
      if (!Object.keys(upd).length) return { error: 'لا تغييرات' }
      upd['items.$.updated_at'] = new Date(); upd['items.$.updated_by'] = sess.user.email
      await RL.updateOne({ key: def.key, 'items.key': item.key }, { $set: upd })
      await logAudit(db, sess, 'ref_item_update', { list: def.key, item: item.key }, { label: item.label }, upd, b.reason || null)
      return { success: true, note: 'المعرف الداخلي ثابت — السجل التاريخي محفوظ' }
    }

    // ---- activate/disable item (never delete)
    if (lM[5] && method === 'POST') {
      const target = item.active === false
      if (!can.has('refdata', target ? 'activate' : 'disable')) return { error: `غير مصرح — يحتاج ${target ? 'Activate' : 'Disable'}`, status: 403 }
      if (!b.reason) return { error: 'السبب إلزامي' }
      await RL.updateOne({ key: def.key, 'items.key': item.key }, { $set: { 'items.$.active': target, 'items.$.updated_at': new Date(), 'items.$.updated_by': sess.user.email } })
      await logAudit(db, sess, target ? 'ref_item_activate' : 'ref_item_disable', { list: def.key, item: item.key, label: item.label }, { active: item.active !== false }, { active: target }, b.reason)
      return { success: true, note: target ? null : 'العنصر لن يظهر في الاختيارات الجديدة — السجلات القديمة لم تُمس (لا حذف نهائياً)' }
    }
  }

  return { error: 'مسار غير معروف', status: 404 }
}
