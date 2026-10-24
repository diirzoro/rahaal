// ============================================================================
// v8.1 — RAHAAL EMAIL, VERIFICATION & NOTIFICATIONS CENTER (Super Admin).
// ONE centralized notification module. PROVIDER-AGNOSTIC by design:
//   Rahaal Notification Service → Email Provider Adapter → (Resend | Brevo | SMTP | …)
// Auth/OTP/notification logic calls sendEmail()/dispatchEvent() — NEVER a provider
// SDK directly — so the provider can be replaced without touching Signup, Reset
// Password or event logic.
// SECURITY CONTRACT:
//   • Credentials live ONLY in platform_settings (email_provider doc) or env —
//     never in frontend code, never returned by APIs (masked), never logged.
//   • Changing provider/credentials requires email_center.manage + audit reason.
//   • Delivery logs NEVER contain OTP values, API keys, secrets or passwords.
// DEFAULT STATE: only user_verification + password_reset events are enabled —
// everything else is opt-in by the Super Admin (no surprise email volume).
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import { Resend } from 'resend'

// ------------------------------- DEFAULTS -----------------------------------
export const DEFAULT_PROVIDER_SETTINGS = {
  id: 'email_provider',
  provider: 'resend', // resend | brevo | smtp | other
  sender_name: 'Rahaal | رحّال',
  sender_email: 'no-reply@rahaal.targetmediagrp.com',
  reply_to: 'support@rahaal.targetmediagrp.com',
  enabled: true,
  api_key: null, // stored server-side only — NEVER returned; env fallback below
}
export const DEFAULT_SECURITY_SETTINGS = {
  id: 'email_security',
  otp_length: 6,
  otp_expiry_min: 10,
  max_attempts: 3,
  max_per_email_24h: 3,
  resend_cooldown_sec: 60,
  daily_block_hours: 24, // after the daily cap: block until this window expires
  ip_sends_per_hour: 6,
  ip_sends_per_day: 15,
  ip_verifies_per_hour: 30,
}

// ------------------------- CENTRAL EVENT CATALOG -----------------------------
// ONE catalog (not scattered): key, label, category, desc, default audience.
// ONLY user_verification + password_reset are enabled by default.
export const EVENT_CATEGORIES = [
  { key: 'account_security', label: '👤 الحساب والأمان' },
  { key: 'subscription_payment', label: '💳 الاشتراكات والمدفوعات' },
  { key: 'travel', label: '✈️ التذاكر والتأشيرات والسفر' },
  { key: 'services_packages', label: '🧳 الخدمات والباقات' },
  { key: 'accounting', label: '📒 المحاسبة' },
  { key: 'administration', label: '🛡️ الإدارة والنظام' },
]
const EV = (key, label, category, desc, extra = {}) => ({ key, label, category, desc, default_enabled: false, audience: 'customer', ...extra })
export const EVENT_CATALOG = [
  // -------- Account & Security --------
  EV('user_created', 'إنشاء مستخدم', 'account_security', 'رسالة ترحيب عند إنشاء حساب جديد'),
  EV('user_verification', 'تأكيد البريد الإلكتروني (OTP)', 'account_security', 'رمز تحقق تسجيل الحسابات الجديدة', { default_enabled: true }),
  EV('password_reset', 'استعادة كلمة المرور (OTP)', 'account_security', 'رمز استعادة كلمة المرور', { default_enabled: true }),
  EV('password_changed', 'تغيير كلمة المرور', 'account_security', 'إشعار أمني بعد تغيير كلمة المرور'),
  EV('user_activated', 'تفعيل مستخدم', 'account_security', 'إشعار عند تفعيل الحساب'),
  EV('user_disabled', 'تعطيل مستخدم', 'account_security', 'إشعار عند تعطيل الحساب'),
  EV('role_changed', 'تغيير الدور', 'account_security', 'إشعار عند تغيير دور المستخدم'),
  EV('permission_changed', 'تغيير الصلاحيات', 'account_security', 'إشعار عند تعديل صلاحيات المستخدم'),
  EV('security_alert', 'تنبيه أمني مهم', 'account_security', 'أحداث أمنية حساسة', { audience: 'admin' }),
  // -------- Subscription & Payment --------
  EV('subscription_new', 'اشتراك جديد', 'subscription_payment', 'عند تسجيل اشتراك جديد', { audience: 'office_owner' }),
  EV('subscription_activated', 'تفعيل اشتراك', 'subscription_payment', 'عند تفعيل الاشتراك', { audience: 'office_owner' }),
  EV('subscription_renewal', 'تجديد اشتراك', 'subscription_payment', 'عند تجديد الاشتراك', { audience: 'office_owner' }),
  EV('subscription_expiring', 'اشتراك قارب على الانتهاء', 'subscription_payment', 'تنبيه قبل انتهاء الاشتراك', { audience: 'office_owner' }),
  EV('subscription_expired', 'انتهاء اشتراك', 'subscription_payment', 'عند انتهاء الاشتراك', { audience: 'office_owner' }),
  EV('package_changed', 'تغيير الباقة', 'subscription_payment', 'عند تغيير باقة المكتب', { audience: 'office_owner' }),
  EV('installment_due', 'قسط مستحق', 'subscription_payment', 'تنبيه استحقاق قسط', { audience: 'office_owner' }),
  EV('installment_paid', 'سداد قسط', 'subscription_payment', 'تأكيد سداد قسط', { audience: 'office_owner' }),
  EV('payment_full_received', 'استلام دفعة كاملة', 'subscription_payment', 'تأكيد استلام السداد الكامل', { audience: 'office_owner' }),
  EV('payment_failed', 'فشل دفعة', 'subscription_payment', 'إشعار فشل عملية دفع', { audience: 'office_owner' }),
  // -------- Travel --------
  EV('ticket_created', 'إنشاء تذكرة', 'travel', 'عند تسجيل تذكرة جديدة'),
  EV('ticket_confirmed', 'تأكيد تذكرة', 'travel', 'عند تأكيد التذكرة'),
  EV('ticket_issued', 'إصدار تذكرة', 'travel', 'عند إصدار التذكرة'),
  EV('ticket_cancelled', 'إلغاء تذكرة', 'travel', 'عند إلغاء التذكرة'),
  EV('visa_created', 'تسجيل تأشيرة', 'travel', 'عند تسجيل طلب تأشيرة'),
  EV('visa_approved', 'اعتماد تأشيرة', 'travel', 'عند اعتماد التأشيرة'),
  EV('visa_ready', 'تأشيرة جاهزة', 'travel', 'عند جاهزية التأشيرة للاستلام'),
  EV('visa_rejected', 'رفض تأشيرة', 'travel', 'عند رفض التأشيرة'),
  EV('umrah_booking_created', 'حجز عمرة جديد', 'travel', 'عند تسجيل حجز عمرة'),
  EV('booking_confirmed', 'تأكيد حجز', 'travel', 'عند تأكيد الحجز'),
  EV('booking_cancelled', 'إلغاء حجز', 'travel', 'عند إلغاء الحجز'),
  // -------- Services & Packages --------
  EV('service_created', 'إنشاء خدمة', 'services_packages', 'عند تسجيل خدمة جديدة'),
  EV('service_completed', 'اكتمال خدمة', 'services_packages', 'عند اكتمال الخدمة'),
  EV('service_status_changed', 'تغيير حالة خدمة', 'services_packages', 'عند تحديث حالة الخدمة'),
  EV('package_booking_created', 'تسجيل حجز باقة', 'services_packages', 'عند تسجيل حجز باقة'),
  EV('package_booking_confirmed', 'تأكيد حجز باقة', 'services_packages', 'عند تأكيد حجز الباقة'),
  EV('package_booking_cancelled', 'إلغاء حجز باقة', 'services_packages', 'عند إلغاء حجز الباقة'),
  // -------- Accounting --------
  EV('receipt_created', 'سند قبض', 'accounting', 'عند إنشاء سند قبض'),
  EV('payment_voucher_created', 'سند صرف', 'accounting', 'عند إنشاء سند صرف'),
  EV('customer_payment_received', 'استلام دفعة عميل', 'accounting', 'تأكيد استلام دفعة من عميل'),
  EV('supplier_payment_created', 'دفعة مورد', 'accounting', 'عند إنشاء دفعة لمورد'),
  EV('balance_reminder', 'تذكير رصيد', 'accounting', 'تذكير العميل برصيده المستحق'),
  EV('installment_reminder', 'تذكير قسط', 'accounting', 'تذكير باستحقاق قسط'),
  EV('financial_txn_failed', 'فشل عملية مالية', 'accounting', 'إشعار فشل عملية مالية', { audience: 'admin' }),
  // -------- Administration --------
  EV('office_registered', 'تسجيل مكتب جديد', 'administration', 'عند تسجيل مكتب جديد في المنصة', { audience: 'admin' }),
  EV('office_activated', 'تفعيل مكتب', 'administration', 'عند تفعيل مكتب', { audience: 'office_owner' }),
  EV('office_disabled', 'تعطيل مكتب', 'administration', 'عند تعطيل مكتب', { audience: 'office_owner' }),
  EV('admin_user_created', 'مدير إدارة جديد', 'administration', 'عند إنشاء حساب إدارة جديد', { audience: 'admin' }),
  EV('admin_role_changed', 'تغيير دور إداري', 'administration', 'عند تغيير دور مدير إدارة', { audience: 'admin' }),
  EV('backup_completed', 'اكتمال نسخة احتياطية', 'administration', 'عند اكتمال نسخة احتياطية', { audience: 'admin' }),
  EV('backup_failed', 'فشل نسخة احتياطية', 'administration', 'عند فشل نسخة احتياطية', { audience: 'admin' }),
  EV('restore_completed', 'اكتمال استعادة', 'administration', 'عند اكتمال عملية استعادة', { audience: 'admin' }),
  EV('restore_failed', 'فشل استعادة', 'administration', 'عند فشل عملية استعادة', { audience: 'admin' }),
  EV('admin_security_alert', 'تنبيه أمني إداري', 'administration', 'أحداث أمنية حرجة على مستوى المنصة', { audience: 'admin' }),
]
export const EVENT_MAP = Object.fromEntries(EVENT_CATALOG.map(e => [e.key, e]))
export const AUDIENCES = [
  { key: 'customer', label: 'العميل' },
  { key: 'office_owner', label: 'مالك المكتب' },
  { key: 'admin', label: 'إدارة رحّال' },
  { key: 'role', label: 'دور محدد' },
  { key: 'custom_email', label: 'بريد محدد' },
]

// ------------------------------ TEMPLATES ------------------------------------
// Safe variables only — never internal supplier/private accounting data.
const BASE_WRAP = (inner) => `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="margin:0;padding:0;background:#f1f5f9;font-family:Tahoma,Arial,sans-serif">
<div style="max-width:480px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<div style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:20px;text-align:center"><div style="color:#fff;font-size:22px;font-weight:900">رحّال</div><div style="color:#e0f2fe;font-size:12px;margin-top:4px">منصة إدارة مكاتب السفر والسياحة</div></div>
<div style="padding:28px 24px;text-align:right;direction:rtl">${inner}</div>
<div style="background:#f8fafc;padding:14px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">© رحّال — رسالة تلقائية، لا ترد عليها</div>
</div></body></html>`
export const DEFAULT_TEMPLATES = {
  user_verification: {
    subject: 'رمز تأكيد البريد الإلكتروني — رحّال',
    body: BASE_WRAP(`<div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:8px">تأكيد البريد الإلكتروني</div><div style="font-size:13px;color:#334155;line-height:1.8">مرحباً {{name}}،<br/>شكراً لتسجيلك في منصة رحّال. استخدم الرمز التالي لتأكيد بريدك الإلكتروني:</div><div style="margin:20px auto;text-align:center"><span style="display:inline-block;background:#f0f9ff;border:2px dashed #0ea5e9;border-radius:12px;padding:12px 28px;font-size:30px;font-weight:900;letter-spacing:10px;color:#0369a1;direction:ltr">{{otp}}</span></div><div style="font-size:12px;color:#64748b;line-height:1.8">⏱️ الرمز صالح لمدة <b>{{expiry_min}} دقائق</b> ويُستخدم مرة واحدة فقط.<br/>🔒 لا تشارك هذا الرمز مع أي شخص — فريق رحّال لن يطلبه منك أبداً.</div>`),
    variables: ['name', 'otp', 'expiry_min'],
  },
  password_reset: {
    subject: 'رمز استعادة كلمة المرور — رحّال',
    body: BASE_WRAP(`<div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:8px">استعادة كلمة المرور</div><div style="font-size:13px;color:#334155;line-height:1.8">مرحباً {{name}}،<br/>وصلنا طلب لاستعادة كلمة المرور لحسابك في منصة رحّال. استخدم الرمز التالي للمتابعة:</div><div style="margin:20px auto;text-align:center"><span style="display:inline-block;background:#f0f9ff;border:2px dashed #0ea5e9;border-radius:12px;padding:12px 28px;font-size:30px;font-weight:900;letter-spacing:10px;color:#0369a1;direction:ltr">{{otp}}</span></div><div style="font-size:12px;color:#64748b;line-height:1.8">⏱️ الرمز صالح لمدة <b>{{expiry_min}} دقائق</b> ويُستخدم مرة واحدة فقط.<br/>إذا لم تطلب هذا الرمز فتجاهل هذه الرسالة.</div>`),
    variables: ['name', 'otp', 'expiry_min'],
  },
}
// Generic fallback template for all other events (ready to customize later)
const GENERIC_TEMPLATE = (label) => ({
  subject: `${label} — رحّال`,
  body: BASE_WRAP(`<div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:8px">${label}</div><div style="font-size:13px;color:#334155;line-height:1.8">مرحباً {{name}}،<br/>{{message}}</div>`),
  variables: ['name', 'message', 'office_name', 'amount', 'currency', 'installment_no', 'plan', 'ticket_no', 'visa_status', 'due_date'],
})

export function renderTemplate(str, vars = {}) {
  return String(str || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => (vars[k] ?? ''))
}

// ------------------------- SETTINGS ACCESS -----------------------------------
const PS = (db) => db.collection('platform_settings')
export async function getProviderSettings(db) {
  const stored = await PS(db).findOne({ id: 'email_provider' }).catch(() => null)
  const cfg = { ...DEFAULT_PROVIDER_SETTINGS, ...(stored || {}) }
  // env fallback: current Resend key / sender (never exposed)
  if (!cfg.api_key && cfg.provider === 'resend' && process.env.RESEND_API_KEY) cfg.api_key = process.env.RESEND_API_KEY
  if (!stored && process.env.RESEND_FROM_EMAIL) {
    const m = String(process.env.RESEND_FROM_EMAIL).match(/^(.*)<([^>]+)>\s*$/)
    if (m) { cfg.sender_name = m[1].trim().replace(/^"|"$/g, '') || cfg.sender_name; cfg.sender_email = m[2].trim() }
    else if (process.env.RESEND_FROM_EMAIL.includes('@')) cfg.sender_email = process.env.RESEND_FROM_EMAIL.trim()
  }
  return cfg
}
const maskKey = (k) => (k ? `${String(k).slice(0, 3)}••••••${String(k).slice(-4)}` : null)
export function safeProviderView(cfg) {
  const { api_key, _id, ...rest } = cfg
  return { ...rest, has_api_key: !!api_key, api_key_masked: maskKey(api_key), key_source: cfg._key_from_db ? 'settings' : (api_key ? 'env' : null) }
}
export async function getSecuritySettings(db) {
  const stored = await PS(db).findOne({ id: 'email_security' }).catch(() => null)
  return { ...DEFAULT_SECURITY_SETTINGS, ...(stored || {}) }
}
export async function getEventsStore(db) {
  const doc = await PS(db).findOne({ id: 'notification_events' }).catch(() => null)
  return doc?.events || {}
}
export async function getEventState(db, key) {
  const def = EVENT_MAP[key]
  if (!def) return null
  const store = await getEventsStore(db)
  const s = store[key] || {}
  return {
    key, label: def.label, category: def.category, desc: def.desc,
    enabled: s.enabled !== undefined ? !!s.enabled : !!def.default_enabled,
    audience: s.audience || def.audience,
    recipient_email: s.recipient_email || null,
    recipient_role: s.recipient_role || null,
    subject: s.subject || null, // null → template subject
    reply_to: s.reply_to || null,
    retry_count: s.retry_count ?? 0,
    cooldown_min: s.cooldown_min ?? 0,
    max_per_day: s.max_per_day ?? null,
    priority: s.priority || 'normal',
    send_mode: s.send_mode || 'immediate',
  }
}
export async function isEventEnabled(db, key) {
  const st = await getEventState(db, key)
  return !!st?.enabled
}
export async function getTemplate(db, key) {
  const doc = await PS(db).findOne({ id: 'email_templates' }).catch(() => null)
  const stored = doc?.templates?.[key]
  const def = DEFAULT_TEMPLATES[key] || GENERIC_TEMPLATE(EVENT_MAP[key]?.label || key)
  return { subject: stored?.subject || def.subject, body: stored?.body || def.body, variables: def.variables, customized: !!stored }
}

// --------------------------- PROVIDER ADAPTERS -------------------------------
// Each adapter: (cfg, msg {to[], subject, html, text, from, reply_to}) → {id} | {error}
async function sendViaResend(cfg, msg) {
  try {
    const resend = new Resend(cfg.api_key)
    const { data, error } = await resend.emails.send({
      from: msg.from, to: msg.to, subject: msg.subject,
      html: msg.html, text: msg.text || undefined,
      ...(msg.reply_to ? { replyTo: msg.reply_to } : {}),
    })
    if (error) return { error: `${error.name || 'resend_error'}: ${error.message || ''}`.slice(0, 300) }
    return { id: data?.id || null }
  } catch (e) { return { error: String(e?.message || e).slice(0, 300) } }
}
async function sendViaBrevo(cfg, msg) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': cfg.api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: cfg.sender_name, email: cfg.sender_email },
        to: msg.to.map(e => ({ email: e })),
        subject: msg.subject, htmlContent: msg.html, textContent: msg.text || undefined,
        ...(msg.reply_to ? { replyTo: { email: msg.reply_to } } : {}),
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return { error: `brevo ${res.status}: ${String(j.message || '').slice(0, 200)}` }
    return { id: j.messageId || null }
  } catch (e) { return { error: String(e?.message || e).slice(0, 300) } }
}
async function sendViaSmtp() {
  return { error: 'مزود SMTP غير مفعّل بعد في هذه النسخة — اختر Resend أو Brevo، ودعم SMTP جاهز معمارياً للإضافة لاحقاً' }
}
const ADAPTERS = { resend: sendViaResend, brevo: sendViaBrevo, smtp: sendViaSmtp, other: sendViaSmtp }

// ------------------------------ DELIVERY LOG ---------------------------------
// NEVER log OTP values, API keys, secrets or passwords (bodies are not stored).
async function logDelivery(db, entry) {
  try {
    await db.collection('email_delivery_logs').insertOne({
      id: uuidv4(), at: new Date(), retry_count: 0, ...entry,
    })
  } catch { /* logging must never break sending */ }
}

// ------------------------------ CORE SEND ------------------------------------
// The ONLY door to the provider. { success } | { error, status }
export async function sendEmail(db, { to, subject, html, text, event_key = null, reply_to = null, log = true }) {
  const cfg = await getProviderSettings(db)
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!recipients.length) return { error: 'لا يوجد مستلم', status: 400 }
  if (!cfg.enabled) {
    if (log) await logDelivery(db, { event_key, to: recipients.join(','), provider: cfg.provider, subject, status: 'suppressed', error: 'provider_disabled' })
    return { error: 'خدمة البريد معطلة من الإعدادات', status: 503 }
  }
  if (!cfg.api_key) {
    if (log) await logDelivery(db, { event_key, to: recipients.join(','), provider: cfg.provider, subject, status: 'failed', error: 'missing_credentials' })
    return { error: 'خدمة البريد غير مهيأة — أدخل بيانات المزود', status: 503 }
  }
  const adapter = ADAPTERS[cfg.provider] || ADAPTERS.other
  const from = `${cfg.sender_name} <${cfg.sender_email}>`
  const r = await adapter(cfg, { to: recipients, subject, html, text, from, reply_to: reply_to || cfg.reply_to || null })
  if (r.error) {
    console.error('[emailCenter] send failed:', cfg.provider, r.error) // safe — no keys, no OTP
    if (log) await logDelivery(db, { event_key, to: recipients.join(','), provider: cfg.provider, subject, status: 'failed', error: r.error })
    return { error: 'تعذر إرسال رسالة البريد — حاول لاحقاً', status: 502 }
  }
  if (log) await logDelivery(db, { event_key, to: recipients.join(','), provider: cfg.provider, subject, status: 'sent', provider_message_id: r.id || null })
  return { success: true, provider_message_id: r.id || null }
}

// --------------------------- EVENT DISPATCH ----------------------------------
// Resolves enabled-state, audience, template, per-event caps — then sendEmail.
// to: explicit recipient(s) for customer/office audiences; admin audience resolves
// to active super admin emails (or the event's custom recipient_email).
export async function dispatchEvent(db, key, { to = null, variables = {}, tenant_id = null } = {}) {
  const st = await getEventState(db, key)
  if (!st) return { error: 'حدث غير معروف', status: 400 }
  if (!st.enabled) {
    await logDelivery(db, { event_key: key, to: String(to || st.recipient_email || 'n/a'), provider: '-', subject: st.label, status: 'suppressed', error: 'event_disabled' })
    return { suppressed: true }
  }
  // resolve recipients
  let recipients = []
  if (st.audience === 'custom_email' && st.recipient_email) recipients = [st.recipient_email]
  else if (st.audience === 'admin') {
    if (st.recipient_email) recipients = [st.recipient_email]
    else {
      const admins = await db.collection('users').find({ role: 'super_admin', active: { $ne: false } }, { projection: { email: 1 } }).limit(3).toArray()
      recipients = admins.map(a => a.email).filter(Boolean)
    }
  } else recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!recipients.length) return { error: 'لا يوجد مستلم لهذا الحدث', status: 400 }
  // per-event daily cap + cooldown (quota protection)
  if (st.max_per_day) {
    const c = await db.collection('email_delivery_logs').countDocuments({ event_key: key, status: 'sent', at: { $gte: new Date(Date.now() - 86400000) } })
    if (c >= st.max_per_day) {
      await logDelivery(db, { event_key: key, to: recipients.join(','), provider: '-', subject: st.label, status: 'suppressed', error: 'max_per_day_reached' })
      return { suppressed: true, reason: 'max_per_day' }
    }
  }
  if (st.cooldown_min > 0) {
    const last = await db.collection('email_delivery_logs').findOne({ event_key: key, to: recipients.join(','), status: 'sent' }, { sort: { at: -1 } })
    if (last && Date.now() - new Date(last.at) < st.cooldown_min * 60000) return { suppressed: true, reason: 'cooldown' }
  }
  const tpl = await getTemplate(db, key)
  const subject = renderTemplate(st.subject || tpl.subject, variables)
  const html = renderTemplate(tpl.body, variables)
  return sendEmail(db, { to: recipients, subject, html, event_key: key, reply_to: st.reply_to || null })
}

// ------------------------------ AUDIT ----------------------------------------
async function audit(db, sess, action, target, before, after, reason) {
  try {
    await db.collection('audit_logs').insertOne({
      id: uuidv4(), category: 'email_center', at: new Date(),
      actor_id: sess?.user?.id || null, actor_email: sess?.user?.email || null,
      action, target, before: before ?? null, after: after ?? null, reason: reason || null,
    })
  } catch { /* never break */ }
}
// strip secrets from anything that goes to audit/response
const sanitizeProviderForAudit = (d) => { const { api_key, _id, ...rest } = d || {}; return { ...rest, api_key_changed: api_key !== undefined } }

// =============================================================================
// ADMIN HANDLER — /api/admin/email-center/* (behind adminGate: section email_center)
// Fine-grained: writes → manage; inbox → inbox_view / inbox_reply.
// =============================================================================
export async function adminEmailCenterHandler(db, path, method, p, b, sess, can) {
  const has = (act) => can.all || can.has('email_center', act)

  // ---------------- PROVIDER ----------------
  if (path === '/provider' && method === 'GET') {
    const stored = await PS(db).findOne({ id: 'email_provider' }).catch(() => null)
    const cfg = await getProviderSettings(db)
    cfg._key_from_db = !!stored?.api_key
    const lastSent = await db.collection('email_delivery_logs').findOne({ status: 'sent' }, { sort: { at: -1 }, projection: { _id: 0, at: 1, provider: 1 } }).catch(() => null)
    const lastFail = await db.collection('email_delivery_logs').findOne({ status: 'failed' }, { sort: { at: -1 }, projection: { _id: 0, at: 1, error: 1 } }).catch(() => null)
    return {
      settings: safeProviderView(cfg),
      providers: [
        { key: 'resend', label: 'Resend', supported: true },
        { key: 'brevo', label: 'Brevo', supported: true },
        { key: 'smtp', label: 'SMTP', supported: false, note: 'جاهز معمارياً — التفعيل لاحقاً' },
        { key: 'other', label: 'مزود آخر', supported: false, note: 'يضاف عبر طبقة المحولات دون أي تغيير على منطق OTP/الإشعارات' },
      ],
      connection: { configured: !!cfg.api_key, enabled: !!cfg.enabled, last_sent_at: lastSent?.at || null, last_error: lastFail ? { at: lastFail.at, error: lastFail.error } : null },
      architecture_note: 'Rahaal Notification Service → Email Provider Adapter → المزود الحالي. تغيير المزود لاحقاً لا يتطلب إعادة بناء التسجيل/الاستعادة/الإشعارات.',
    }
  }
  if (path === '/provider' && method === 'PUT') {
    if (!has('manage')) return { error: '🚫 تعديل مزود البريد يحتاج صلاحية Manage', status: 403 }
    if (!String(b?.reason || '').trim()) return { error: 'السبب إلزامي لتعديل إعدادات المزود (Audit)' }
    const before = await PS(db).findOne({ id: 'email_provider' }).catch(() => null)
    const upd = { id: 'email_provider', updated_by: sess.user.email, updated_at: new Date() }
    if (b.provider && ['resend', 'brevo', 'smtp', 'other'].includes(b.provider)) upd.provider = b.provider
    if (b.sender_name !== undefined) upd.sender_name = String(b.sender_name).slice(0, 120)
    if (b.sender_email !== undefined) {
      if (b.sender_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.sender_email)) return { error: 'بريد المرسل غير صالح' }
      upd.sender_email = String(b.sender_email).toLowerCase().trim()
    }
    if (b.reply_to !== undefined) {
      if (b.reply_to && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.reply_to)) return { error: 'بريد الرد غير صالح' }
      upd.reply_to = String(b.reply_to || '').toLowerCase().trim() || null
    }
    if (b.enabled !== undefined) upd.enabled = !!b.enabled
    // credentials: WRITE-ONLY — never echoed back, never audited in plaintext
    if (b.api_key !== undefined && String(b.api_key || '').trim()) upd.api_key = String(b.api_key).trim()
    await PS(db).updateOne({ id: 'email_provider' }, { $set: upd }, { upsert: true })
    await audit(db, sess, 'provider_update', 'email_provider', sanitizeProviderForAudit(before), sanitizeProviderForAudit(upd), b.reason)
    const cfg = await getProviderSettings(db)
    cfg._key_from_db = true
    return { success: true, settings: safeProviderView(cfg) }
  }
  if (path === '/provider/test' && method === 'POST') {
    if (!has('manage')) return { error: '🚫 اختبار الاتصال يحتاج صلاحية Manage', status: 403 }
    const to = String(b?.to || sess.user.email).toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { error: 'بريد المستلم غير صالح' }
    const r = await sendEmail(db, {
      to, subject: 'رسالة اختبار — رحّال ✅', event_key: 'provider_test',
      html: BASE_WRAP(`<div style="font-size:15px;font-weight:800;color:#0f172a">اختبار اتصال مزود البريد</div><div style="font-size:13px;color:#334155;margin-top:8px">وصول هذه الرسالة يعني أن إعدادات المزود تعمل بشكل صحيح. — ${new Date().toLocaleString('ar-EG')}</div>`),
    })
    await audit(db, sess, 'provider_test', to, null, { ok: !r.error }, b?.reason || 'اختبار اتصال')
    if (r.error) return { error: r.error, status: r.status || 502 }
    return { success: true, message: `أُرسلت رسالة اختبار إلى ${to} — تحقق من الصندوق الوارد` }
  }

  // ---------------- VERIFICATION & SECURITY ----------------
  if (path === '/security' && method === 'GET') {
    const s = await getSecuritySettings(db)
    const { _id, ...rest } = s
    const [ver, rst] = await Promise.all([getEventState(db, 'user_verification'), getEventState(db, 'password_reset')])
    return { settings: rest, signup_verification_enabled: ver.enabled, password_reset_enabled: rst.enabled, defaults: DEFAULT_SECURITY_SETTINGS }
  }
  if (path === '/security' && method === 'PUT') {
    if (!has('manage')) return { error: '🚫 تعديل إعدادات التحقق يحتاج صلاحية Manage', status: 403 }
    if (!String(b?.reason || '').trim()) return { error: 'السبب إلزامي لتعديل إعدادات الأمان (Audit)' }
    const before = await getSecuritySettings(db)
    const num = (v, min, max, def) => { const n = parseInt(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def }
    const doc = {
      id: 'email_security',
      otp_length: num(b.otp_length, 4, 10, before.otp_length),
      otp_expiry_min: num(b.otp_expiry_min, 2, 60, before.otp_expiry_min),
      max_attempts: num(b.max_attempts, 1, 10, before.max_attempts),
      max_per_email_24h: num(b.max_per_email_24h, 1, 20, before.max_per_email_24h),
      resend_cooldown_sec: num(b.resend_cooldown_sec, 15, 3600, before.resend_cooldown_sec),
      daily_block_hours: num(b.daily_block_hours, 1, 72, before.daily_block_hours),
      ip_sends_per_hour: num(b.ip_sends_per_hour, 1, 100, before.ip_sends_per_hour),
      ip_sends_per_day: num(b.ip_sends_per_day, 1, 500, before.ip_sends_per_day),
      ip_verifies_per_hour: num(b.ip_verifies_per_hour, 5, 500, before.ip_verifies_per_hour),
      updated_by: sess.user.email, updated_at: new Date(),
    }
    await PS(db).updateOne({ id: 'email_security' }, { $set: doc }, { upsert: true })
    // the two auth toggles live in the SAME event store (single source of truth)
    const evUpd = {}
    if (b.signup_verification_enabled !== undefined) evUpd['events.user_verification.enabled'] = !!b.signup_verification_enabled
    if (b.password_reset_enabled !== undefined) evUpd['events.password_reset.enabled'] = !!b.password_reset_enabled
    if (Object.keys(evUpd).length) await PS(db).updateOne({ id: 'notification_events' }, { $set: { id: 'notification_events', ...evUpd, updated_by: sess.user.email, updated_at: new Date() } }, { upsert: true })
    const { _id, ...beforeClean } = before
    await audit(db, sess, 'security_update', 'email_security', beforeClean, { ...doc, ...evUpd }, b.reason)
    return { success: true, settings: doc }
  }

  // ---------------- NOTIFICATION EVENTS (checkbox interface) ----------------
  if (path === '/events' && method === 'GET') {
    const states = await Promise.all(EVENT_CATALOG.map(e => getEventState(db, e.key)))
    return { categories: EVENT_CATEGORIES, events: states, audiences: AUDIENCES, note: 'مفعّل افتراضياً: تأكيد البريد + استعادة كلمة المرور فقط — كل البقية تُفعّل يدوياً من هنا' }
  }
  if (path === '/events' && method === 'PUT') {
    // bulk checkbox save: { changes: { key: true|false }, reason }
    if (!has('manage')) return { error: '🚫 إدارة الإشعارات تحتاج صلاحية Manage', status: 403 }
    if (!String(b?.reason || '').trim()) return { error: 'السبب إلزامي لتغيير حالة الإشعارات (Audit)' }
    const changes = b?.changes || {}
    const set = { id: 'notification_events', updated_by: sess.user.email, updated_at: new Date() }
    const applied = {}
    for (const [k, v] of Object.entries(changes)) {
      if (!EVENT_MAP[k] || typeof v !== 'boolean') continue
      set[`events.${k}.enabled`] = v
      applied[k] = v
    }
    if (!Object.keys(applied).length) return { error: 'لا تغييرات صالحة' }
    await PS(db).updateOne({ id: 'notification_events' }, { $set: set }, { upsert: true })
    await audit(db, sess, 'events_bulk_toggle', 'notification_events', null, applied, b.reason)
    return { success: true, applied }
  }
  const evM = path.match(/^\/events\/([a-z0-9_]+)$/)
  if (evM && method === 'PUT') {
    // per-event advanced config (modal)
    if (!has('manage')) return { error: '🚫 إدارة الإشعارات تحتاج صلاحية Manage', status: 403 }
    const key = evM[1]
    if (!EVENT_MAP[key]) return { error: 'حدث غير معروف', status: 404 }
    if (!String(b?.reason || '').trim()) return { error: 'السبب إلزامي (Audit)' }
    const before = await getEventState(db, key)
    const set = { id: 'notification_events', updated_by: sess.user.email, updated_at: new Date() }
    const cfgKeys = {
      enabled: (v) => typeof v === 'boolean' ? v : undefined,
      audience: (v) => AUDIENCES.some(a => a.key === v) ? v : undefined,
      recipient_email: (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? (v || null) : undefined,
      recipient_role: (v) => v === null || typeof v === 'string' ? (v ? String(v).slice(0, 80) : null) : undefined,
      subject: (v) => v === null || typeof v === 'string' ? (v ? String(v).slice(0, 200) : null) : undefined,
      reply_to: (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? (v || null) : undefined,
      retry_count: (v) => Number.isFinite(parseInt(v)) ? Math.min(5, Math.max(0, parseInt(v))) : undefined,
      cooldown_min: (v) => Number.isFinite(parseInt(v)) ? Math.min(1440, Math.max(0, parseInt(v))) : undefined,
      max_per_day: (v) => v === null ? null : (Number.isFinite(parseInt(v)) ? Math.min(10000, Math.max(1, parseInt(v))) : undefined),
      priority: (v) => ['low', 'normal', 'high', 'critical'].includes(v) ? v : undefined,
      send_mode: (v) => ['immediate', 'reminder'].includes(v) ? v : undefined,
    }
    for (const [k, fn] of Object.entries(cfgKeys)) {
      if (b[k] !== undefined) {
        const val = fn(b[k])
        if (val !== undefined) set[`events.${key}.${k}`] = val
      }
    }
    await PS(db).updateOne({ id: 'notification_events' }, { $set: set }, { upsert: true })
    const after = await getEventState(db, key)
    await audit(db, sess, 'event_config_update', key, before, after, b.reason)
    return { success: true, event: after }
  }

  // ---------------- TEMPLATES ----------------
  if (path === '/templates' && method === 'GET') {
    const keys = [...new Set(['user_verification', 'password_reset', ...EVENT_CATALOG.map(e => e.key)])]
    const rows = await Promise.all(keys.map(async k => ({ key: k, label: EVENT_MAP[k]?.label || k, category: EVENT_MAP[k]?.category || null, ...(await getTemplate(db, k)) })))
    return { templates: rows, note: 'المتغيرات الآمنة فقط — لا تكشف القوالب بيانات موردين/محاسبة داخلية إلا لمستلم مخوّل' }
  }
  const tplM = path.match(/^\/templates\/([a-z0-9_]+)$/)
  if (tplM && method === 'PUT') {
    if (!has('manage')) return { error: '🚫 تعديل القوالب يحتاج صلاحية Manage', status: 403 }
    const key = tplM[1]
    if (!EVENT_MAP[key]) return { error: 'قالب غير معروف', status: 404 }
    if (!String(b?.reason || '').trim()) return { error: 'السبب إلزامي لتعديل قالب (Audit)' }
    const before = await getTemplate(db, key)
    const set = { id: 'email_templates', updated_by: sess.user.email, updated_at: new Date() }
    if (b.subject !== undefined) set[`templates.${key}.subject`] = String(b.subject).slice(0, 250)
    if (b.body !== undefined) set[`templates.${key}.body`] = String(b.body).slice(0, 50000)
    await PS(db).updateOne({ id: 'email_templates' }, { $set: set }, { upsert: true })
    await audit(db, sess, 'template_update', key, { subject: before.subject }, { subject: b.subject ?? before.subject }, b.reason)
    return { success: true, template: await getTemplate(db, key) }
  }
  if (tplM && method === 'DELETE') { // reset to default
    if (!has('manage')) return { error: '🚫 يحتاج صلاحية Manage', status: 403 }
    await PS(db).updateOne({ id: 'email_templates' }, { $unset: { [`templates.${tplM[1]}`]: '' } })
    await audit(db, sess, 'template_reset', tplM[1], null, null, b?.reason || 'إرجاع القالب الافتراضي')
    return { success: true, template: await getTemplate(db, tplM[1]) }
  }

  // ---------------- INBOX (support@…) ----------------
  // Populated by the provider's INBOUND webhook → POST /api/email/inbound.
  // Provider-independent storage (support_inbox collection). No secrets exposed.
  if (path === '/inbox' && method === 'GET') {
    if (!has('inbox_view') && !has('manage')) return { error: '🚫 صندوق الوارد يحتاج صلاحية Inbox View', status: 403 }
    const f = {}
    if (p.get('status') === 'unread') f.read = false
    if (p.get('status') === 'read') f.read = true
    const qq = String(p.get('q') || '').trim()
    if (qq) f.$or = [{ from: { $regex: qq, $options: 'i' } }, { subject: { $regex: qq, $options: 'i' } }, { text: { $regex: qq, $options: 'i' } }]
    const rows = await db.collection('support_inbox').find(f, { projection: { _id: 0 } }).sort({ at: -1 }).limit(200).toArray()
    const unread = await db.collection('support_inbox').countDocuments({ read: false }).catch(() => 0)
    return { rows, unread, support_address: (await getProviderSettings(db)).reply_to || 'support@rahaal.targetmediagrp.com', webhook_note: 'يُغذّى الصندوق عبر Inbound Webhook من المزود → POST /api/email/inbound — فعّل التوجيه من لوحة المزود مرة واحدة' }
  }
  const inbM = path.match(/^\/inbox\/([^/]+)$/)
  if (inbM && method === 'PATCH') {
    if (!has('inbox_view') && !has('manage')) return { error: '🚫 يحتاج صلاحية Inbox View', status: 403 }
    const msg = await db.collection('support_inbox').findOne({ id: inbM[1] })
    if (!msg) return { error: 'الرسالة غير موجودة', status: 404 }
    await db.collection('support_inbox').updateOne({ id: inbM[1] }, { $set: { read: b?.read !== false, read_by: sess.user.email, read_at: new Date() } })
    return { success: true }
  }
  const repM = path.match(/^\/inbox\/([^/]+)\/reply$/)
  if (repM && method === 'POST') {
    if (!has('inbox_reply') && !has('manage')) return { error: '🚫 الرد يحتاج صلاحية Inbox Reply', status: 403 }
    const msg = await db.collection('support_inbox').findOne({ id: repM[1] })
    if (!msg) return { error: 'الرسالة غير موجودة', status: 404 }
    const body = String(b?.body || '').trim()
    if (!body) return { error: 'نص الرد مطلوب' }
    const r = await sendEmail(db, {
      to: msg.from, event_key: 'inbox_reply',
      subject: b?.subject?.trim() || `Re: ${msg.subject || 'رسالتكم إلى رحّال'}`,
      html: BASE_WRAP(`<div style="font-size:13px;color:#334155;line-height:1.9;white-space:pre-wrap">${String(body).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div><div style="margin-top:14px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px">فريق دعم رحّال — ${sess.user.name || ''}</div>`),
    })
    if (r.error) return { error: r.error, status: r.status || 502 }
    await db.collection('support_inbox').updateOne({ id: repM[1] }, { $set: { read: true }, $push: { replies: { at: new Date(), by: sess.user.email, body: body.slice(0, 5000) } } })
    await audit(db, sess, 'inbox_reply', msg.from, null, { subject: msg.subject }, b?.reason || 'رد على رسالة دعم')
    return { success: true }
  }

  // ---------------- DELIVERY LOGS ----------------
  if (path === '/logs' && method === 'GET') {
    const f = {}
    if (p.get('event')) f.event_key = p.get('event')
    if (p.get('status')) f.status = p.get('status')
    if (p.get('provider')) f.provider = p.get('provider')
    if (p.get('recipient')) f.to = { $regex: String(p.get('recipient')).trim(), $options: 'i' }
    if (p.get('from_date') || p.get('to_date')) {
      f.at = {}
      if (p.get('from_date')) f.at.$gte = new Date(p.get('from_date'))
      if (p.get('to_date')) f.at.$lte = new Date(p.get('to_date') + 'T23:59:59')
    }
    const rows = await db.collection('email_delivery_logs').find(f, { projection: { _id: 0 } }).sort({ at: -1 }).limit(300).toArray()
    const stats = {}
    for (const r of rows) stats[r.status] = (stats[r.status] || 0) + 1
    return { rows, stats, note: 'السجل لا يحتوي أبداً على رموز OTP أو مفاتيح أو كلمات مرور — الموضوع والحالة فقط' }
  }

  return { error: 'مسار غير معروف', status: 404 }
}

// =============================================================================
// PUBLIC INBOUND WEBHOOK — POST /api/email/inbound (provider → Rahaal).
// Handles: inbound support mail (→ support_inbox) + delivery status events
// (email.delivered / email.bounced / email.complained → update delivery logs).
// Provider-independent payload normalization. No secrets stored.
// =============================================================================
export async function handleInboundWebhook(db, payload) {
  try {
    const type = payload?.type || ''
    const data = payload?.data || payload || {}
    // Resend delivery status events → update log status by provider_message_id
    if (type.startsWith('email.')) {
      const mid = data.email_id || data.id || null
      const map = { 'email.delivered': 'delivered', 'email.bounced': 'failed', 'email.complained': 'suppressed', 'email.delivery_delayed': 'queued' }
      if (mid && map[type]) {
        await db.collection('email_delivery_logs').updateOne(
          { provider_message_id: mid },
          { $set: { status: map[type], status_detail: type, status_at: new Date() } }
        )
        return { ok: true, handled: 'delivery_status' }
      }
      return { ok: true, ignored: true }
    }
    // Inbound support email (Resend inbound / generic shape)
    const from = data.from?.email || data.from || null
    const to = Array.isArray(data.to) ? (data.to[0]?.email || data.to[0]) : (data.to?.email || data.to || null)
    if (!from) return { ok: true, ignored: true }
    await db.collection('support_inbox').insertOne({
      id: uuidv4(),
      from: String(from).slice(0, 200),
      to: String(to || '').slice(0, 200),
      subject: String(data.subject || '(بلا موضوع)').slice(0, 300),
      text: String(data.text || data.plain || '').slice(0, 20000),
      html: String(data.html || '').slice(0, 60000),
      thread_id: String(data.thread_id || data.message_id || '').slice(0, 200) || null,
      read: false, replies: [], at: new Date(),
    })
    return { ok: true, handled: 'inbound' }
  } catch (e) {
    console.error('[emailCenter] inbound webhook error:', e?.message)
    return { ok: false }
  }
}
