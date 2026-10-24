// ============================================================================
// v8.1 — EMAIL OTP SERVICE. Email Verification + Password Reset.
// NOW PROVIDER-AGNOSTIC + DB-DYNAMIC: every limit (length, TTL, attempts,
// daily caps, cooldown, IP throttling) is read from the Email Center security
// settings (platform_settings/email_security) with the v8.0 conservative
// values as defaults. Sending goes EXCLUSIVELY through lib/emailCenter.js
// sendEmail() (adapter layer + delivery log) — never a provider SDK directly.
// SECURITY CONTRACT (unchanged):
//  - OTP via crypto.randomInt — NEVER logged, NEVER stored plaintext
//    (sha256 hash bound to email+purpose). Single-use, attempt-capped.
//  - Neutral responses upstream prevent email enumeration (router's duty).
//  - Delivery logs never contain the OTP (subject + status only).
// ============================================================================
import { randomInt, createHash, timingSafeEqual } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { getSecuritySettings, getProviderSettings, getTemplate, renderTemplate, sendEmail, isEventEnabled } from './emailCenter'

const COLL = 'email_otps'
const IP_COLL = 'otp_ip_hits'
// purpose → Event Catalog key (single source of truth for toggles + templates)
const EVENT_KEYS = { verify_email: 'user_verification', password_reset: 'password_reset' }

// legacy sync check (env only) — kept for backward compatibility
export const emailServiceConfigured = () => !!process.env.RESEND_API_KEY

// provider configured (DB settings OR env fallback) AND the auth event enabled
async function authEmailActive(db, eventKey) {
  try {
    const [cfg, on] = await Promise.all([getProviderSettings(db), isEventEnabled(db, eventKey)])
    return !!(cfg.enabled && cfg.api_key && on)
  } catch { return false }
}
export const emailVerificationActive = (db) => authEmailActive(db, 'user_verification')
export const passwordResetActive = (db) => authEmailActive(db, 'password_reset')

const hashOtp = (email, purpose, otp) =>
  createHash('sha256').update(`${email}:${purpose}:${otp}`).digest('hex')

const sameHash = (a, b) => {
  const left = Buffer.from(a, 'hex'), right = Buffer.from(b, 'hex')
  return left.length === right.length && timingSafeEqual(left, right)
}

const clampInt = (v, min, max, def) => {
  const n = parseInt(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

// Sends an OTP. Returns { success: true } or { error, status, retry_after_sec? }.
export async function sendOtpEmail(db, emailRaw, purpose, meta = {}) {
  const eventKey = EVENT_KEYS[purpose]
  if (!eventKey) return { error: 'غرض غير معروف', status: 400 }
  if (!(await authEmailActive(db, eventKey))) {
    return { error: 'خدمة البريد غير مهيأة أو هذا النوع من الرسائل معطّل — تواصل مع الإدارة', status: 503 }
  }
  const sec = await getSecuritySettings(db) // dynamic limits (defaults = v8.0 conservative)
  const cooldownMs = clampInt(sec.resend_cooldown_sec, 15, 3600, 60) * 1000
  const maxPerEmail24h = clampInt(sec.max_per_email_24h, 1, 20, 3)
  const ipSendsHour = clampInt(sec.ip_sends_per_hour, 1, 100, 6)
  const ipSendsDay = clampInt(sec.ip_sends_per_day, 1, 500, 15)
  const otpLen = clampInt(sec.otp_length, 4, 10, 6)
  const expiryMin = clampInt(sec.otp_expiry_min, 2, 60, 10)
  const email = String(emailRaw).toLowerCase().trim()
  const ip = String(meta.ip || 'unknown')
  const now = new Date()
  // ---- IP throttling (abuse / quota-exhaustion protection) ----
  try { await db.collection(IP_COLL).createIndex({ at: 1 }, { expireAfterSeconds: 172800 }) } catch { /* idempotent */ }
  const [ipHour, ipDay] = await Promise.all([
    db.collection(IP_COLL).countDocuments({ ip, kind: 'send', at: { $gte: new Date(now - 3600000) } }),
    db.collection(IP_COLL).countDocuments({ ip, kind: 'send', at: { $gte: new Date(now - 86400000) } }),
  ])
  if (ipHour >= ipSendsHour || ipDay >= ipSendsDay) {
    return { error: 'تم تجاوز الحد المسموح من هذا الجهاز — حاول لاحقاً', status: 429 }
  }
  // ---- resend cooldown (per email+purpose) ----
  const last = await db.collection(COLL).findOne({ email, purpose }, { sort: { created_at: -1 } })
  if (last && now - new Date(last.created_at) < cooldownMs) {
    const retry = Math.ceil((cooldownMs - (now - new Date(last.created_at))) / 1000)
    return { error: `انتظر ${retry} ثانية قبل طلب رمز جديد`, status: 429, retry_after_sec: retry }
  }
  // ---- HARD daily cap per email address / 24h (ALL purposes) ----
  const dayCount = await db.collection(COLL).countDocuments({ email, created_at: { $gte: new Date(now - 86400000) } })
  if (dayCount >= maxPerEmail24h) {
    return { error: `تجاوزت الحد اليومي لإرسال الرموز (${maxPerEmail24h} رسائل خلال 24 ساعة) — حاول مجدداً لاحقاً`, status: 429 }
  }
  // ---- generate + store HASH only (previous unused OTPs are superseded) ----
  const otp = String(randomInt(10 ** (otpLen - 1), 10 ** otpLen))
  await db.collection(COLL).updateMany({ email, purpose, used_at: null }, { $set: { used_at: now, superseded: true } })
  await db.collection(COLL).insertOne({
    id: uuidv4(), email, purpose, ip, otp_len: otpLen,
    code_hash: hashOtp(email, purpose, otp),
    expires_at: new Date(now.getTime() + expiryMin * 60000),
    attempts: 0, used_at: null, created_at: now,
  })
  try { await db.collection(COLL).createIndex({ expires_at: 1 }, { expireAfterSeconds: 86400 }) } catch { /* idempotent */ }
  await db.collection(IP_COLL).insertOne({ ip, kind: 'send', email, at: now })
  // ---- send via the central Email Center (template + adapter + delivery log) ----
  const tpl = await getTemplate(db, eventKey)
  const safeName = String(meta.name || '').replace(/[&<>"']/g, '')
  const vars = { name: safeName, otp, expiry_min: expiryMin }
  const r = await sendEmail(db, {
    to: email,
    subject: renderTemplate(tpl.subject, { ...vars, otp: '' }).trim() || tpl.subject, // subject must NEVER leak the OTP
    html: renderTemplate(tpl.body, vars),
    text: `رمز التحقق الخاص بك: ${otp}\nالرمز صالح لمدة ${expiryMin} دقائق ويُستخدم مرة واحدة فقط.`,
    event_key: eventKey,
  })
  if (r.error) return { error: r.error, status: r.status || 502 }
  return { success: true }
}

// Verifies an OTP (single-use, attempt cap → auto-invalidation). { ok: true } or { error, status }.
export async function verifyOtp(db, emailRaw, purpose, submitted, meta = {}) {
  const sec = await getSecuritySettings(db)
  const maxAttempts = clampInt(sec.max_attempts, 1, 10, 3)
  const ipVerHour = clampInt(sec.ip_verifies_per_hour, 5, 500, 30)
  const email = String(emailRaw).toLowerCase().trim()
  const code = String(submitted || '').trim()
  const ip = String(meta.ip || 'unknown')
  // ordinary format errors are handled WITHOUT touching the stored OTP or sending anything
  if (!/^\d{4,10}$/.test(code)) return { error: 'صيغة الرمز غير صحيحة — أدخل الأرقام المرسلة إلى بريدك', status: 400 }
  // ---- IP throttling on verification attempts ----
  const ipVerifies = await db.collection(IP_COLL).countDocuments({ ip, kind: 'verify', at: { $gte: new Date(Date.now() - 3600000) } })
  if (ipVerifies >= ipVerHour) return { error: 'محاولات كثيرة من هذا الجهاز — حاول بعد ساعة', status: 429 }
  await db.collection(IP_COLL).insertOne({ ip, kind: 'verify', email, at: new Date() })
  const rec = await db.collection(COLL).findOne({ email, purpose, used_at: null }, { sort: { created_at: -1 } })
  if (!rec) return { error: 'الرمز غير صحيح أو منتهي الصلاحية', status: 400 }
  if (new Date(rec.expires_at) <= new Date()) return { error: 'انتهت صلاحية الرمز — اطلب رمزاً جديداً', status: 400 }
  if (rec.attempts >= maxAttempts) {
    await db.collection(COLL).updateOne({ id: rec.id, used_at: null }, { $set: { used_at: new Date(), invalidated: true } })
    return { error: `تجاوزت عدد المحاولات المسموح (${maxAttempts}) — اطلب رمزاً جديداً`, status: 429 }
  }
  await db.collection(COLL).updateOne({ id: rec.id }, { $inc: { attempts: 1 } })
  if (!sameHash(rec.code_hash, hashOtp(email, purpose, code))) {
    // the LAST wrong attempt INVALIDATES this OTP immediately (new one required)
    if (rec.attempts + 1 >= maxAttempts) {
      await db.collection(COLL).updateOne({ id: rec.id, used_at: null }, { $set: { used_at: new Date(), invalidated: true } })
      return { error: `الرمز غير صحيح — أُبطل الرمز بعد ${maxAttempts} محاولات خاطئة، اطلب رمزاً جديداً`, status: 429 }
    }
    return { error: `الرمز غير صحيح — تبقى ${maxAttempts - rec.attempts - 1} محاولة`, status: 400 }
  }
  // atomic single-use consumption — a concurrent duplicate verify loses the race
  const consumed = await db.collection(COLL).updateOne({ id: rec.id, used_at: null }, { $set: { used_at: new Date() } })
  if (!consumed.modifiedCount) return { error: 'الرمز استُخدم مسبقاً — اطلب رمزاً جديداً', status: 400 }
  // successful verification invalidates ALL remaining OTPs for this email+purpose
  await db.collection(COLL).updateMany({ email, purpose, used_at: null }, { $set: { used_at: new Date(), superseded: true } })
  return { ok: true }
}
