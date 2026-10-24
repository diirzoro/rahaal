// ============================================================================
// v8.0 — EMAIL OTP SERVICE (Resend). Email Verification + Password Reset.
// SECURITY CONTRACT:
//  - 6-digit OTP via crypto.randomInt — NEVER logged, NEVER stored plaintext
//    (sha256 hash bound to email+purpose).
//  - TTL 10 minutes, SINGLE-USE (usedAt gate), max 5 verify attempts.
//  - Resend rate limit: 60s cooldown + max 5 sends/hour per email+purpose.
//  - API key ONLY from process.env (RESEND_API_KEY / RESEND_FROM_EMAIL).
//  - Neutral responses upstream prevent email enumeration (router's duty).
// ============================================================================
import { randomInt, createHash, timingSafeEqual } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { Resend } from 'resend'

const OTP_TTL_MS = 10 * 60 * 1000
// v8.0.1 — CONSERVATIVE QUOTA LIMITS (limited Resend quota):
//  • max 3 OTP emails per email address per 24h (all purposes combined) → then 24h block
//  • min 60s between resend requests
//  • max 3 verification attempts per OTP → then the OTP is invalidated (new one required)
//  • IP-based throttling to prevent abuse / quota exhaustion
const MAX_ATTEMPTS = 3
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_SENDS_PER_EMAIL_24H = 3
const IP_MAX_SENDS_PER_HOUR = 6
const IP_MAX_SENDS_PER_DAY = 15
const IP_MAX_VERIFIES_PER_HOUR = 30
const COLL = 'email_otps'
const IP_COLL = 'otp_ip_hits'

export const emailServiceConfigured = () =>
  !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)

const hashOtp = (email, purpose, otp) =>
  createHash('sha256').update(`${email}:${purpose}:${otp}`).digest('hex')

const sameHash = (a, b) => {
  const left = Buffer.from(a, 'hex'), right = Buffer.from(b, 'hex')
  return left.length === right.length && timingSafeEqual(left, right)
}

const SUBJECTS = {
  verify_email: 'رمز تأكيد البريد الإلكتروني — رحّال',
  password_reset: 'رمز استعادة كلمة المرور — رحّال',
}
const HEADLINES = {
  verify_email: 'تأكيد البريد الإلكتروني',
  password_reset: 'استعادة كلمة المرور',
}
const INTROS = {
  verify_email: 'شكراً لتسجيلك في منصة رحّال. استخدم الرمز التالي لتأكيد بريدك الإلكتروني:',
  password_reset: 'وصلنا طلب لاستعادة كلمة المرور لحسابك في منصة رحّال. استخدم الرمز التالي للمتابعة:',
}

function emailHtml(purpose, otp, name) {
  const safeName = String(name || '').replace(/[&<>"']/g, '')
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="margin:0;padding:0;background:#f1f5f9;font-family:Tahoma,Arial,sans-serif">
  <div style="max-width:480px;margin:24px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:20px;text-align:center">
      <div style="color:#fff;font-size:22px;font-weight:900">رحّال</div>
      <div style="color:#e0f2fe;font-size:12px;margin-top:4px">منصة إدارة مكاتب السفر والسياحة</div>
    </div>
    <div style="padding:28px 24px;text-align:right;direction:rtl">
      <div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:8px">${HEADLINES[purpose]}</div>
      ${safeName ? `<div style="font-size:13px;color:#334155;margin-bottom:6px">مرحباً ${safeName}،</div>` : ''}
      <div style="font-size:13px;color:#334155;line-height:1.8">${INTROS[purpose]}</div>
      <div style="margin:20px auto;text-align:center">
        <span style="display:inline-block;background:#f0f9ff;border:2px dashed #0ea5e9;border-radius:12px;padding:12px 28px;font-size:30px;font-weight:900;letter-spacing:10px;color:#0369a1;direction:ltr">${otp}</span>
      </div>
      <div style="font-size:12px;color:#64748b;line-height:1.8">⏱️ الرمز صالح لمدة <b>10 دقائق</b> ويُستخدم مرة واحدة فقط.<br/>🔒 لا تشارك هذا الرمز مع أي شخص — فريق رحّال لن يطلبه منك أبداً.<br/>إذا لم تطلب هذا الرمز فتجاهل هذه الرسالة.</div>
    </div>
    <div style="background:#f8fafc;padding:14px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">© ${new Date().getFullYear()} Rahaal — رسالة تلقائية، لا ترد عليها</div>
  </div></body></html>`
}

// Sends an OTP. Returns { success: true } or { error, status, retry_after_sec? }.
export async function sendOtpEmail(db, emailRaw, purpose, meta = {}) {
  if (!SUBJECTS[purpose]) return { error: 'غرض غير معروف', status: 400 }
  if (!emailServiceConfigured()) return { error: 'خدمة البريد غير مهيأة — تواصل مع الإدارة', status: 503 }
  const email = String(emailRaw).toLowerCase().trim()
  const ip = String(meta.ip || 'unknown')
  const now = new Date()
  // ---- IP throttling (abuse / quota-exhaustion protection) ----
  try { await db.collection(IP_COLL).createIndex({ at: 1 }, { expireAfterSeconds: 172800 }) } catch { /* idempotent */ }
  const [ipHour, ipDay] = await Promise.all([
    db.collection(IP_COLL).countDocuments({ ip, kind: 'send', at: { $gte: new Date(now - 3600000) } }),
    db.collection(IP_COLL).countDocuments({ ip, kind: 'send', at: { $gte: new Date(now - 86400000) } }),
  ])
  if (ipHour >= IP_MAX_SENDS_PER_HOUR || ipDay >= IP_MAX_SENDS_PER_DAY) {
    return { error: 'تم تجاوز الحد المسموح من هذا الجهاز — حاول لاحقاً', status: 429 }
  }
  // ---- 60s resend cooldown (per email+purpose) ----
  const last = await db.collection(COLL).findOne({ email, purpose }, { sort: { created_at: -1 } })
  if (last && now - new Date(last.created_at) < RESEND_COOLDOWN_MS) {
    const retry = Math.ceil((RESEND_COOLDOWN_MS - (now - new Date(last.created_at))) / 1000)
    return { error: `انتظر ${retry} ثانية قبل طلب رمز جديد`, status: 429, retry_after_sec: retry }
  }
  // ---- HARD daily cap: 3 OTP emails per email address / 24h (ALL purposes) → 24h block ----
  const dayCount = await db.collection(COLL).countDocuments({ email, created_at: { $gte: new Date(now - 86400000) } })
  if (dayCount >= MAX_SENDS_PER_EMAIL_24H) {
    return { error: 'تجاوزت الحد اليومي لإرسال الرموز (3 رسائل خلال 24 ساعة) — حاول مجدداً بعد 24 ساعة', status: 429 }
  }
  // ---- generate + store HASH only (previous unused OTPs are superseded) ----
  const otp = String(randomInt(100000, 1000000))
  await db.collection(COLL).updateMany({ email, purpose, used_at: null }, { $set: { used_at: now, superseded: true } })
  await db.collection(COLL).insertOne({
    id: uuidv4(), email, purpose, ip,
    code_hash: hashOtp(email, purpose, otp),
    expires_at: new Date(now.getTime() + OTP_TTL_MS),
    attempts: 0, used_at: null, created_at: now,
  })
  try { await db.collection(COLL).createIndex({ expires_at: 1 }, { expireAfterSeconds: 86400 }) } catch { /* idempotent */ }
  await db.collection(IP_COLL).insertOne({ ip, kind: 'send', email, at: now })
  // ---- send (never log the OTP) ----
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [email],
      subject: SUBJECTS[purpose],
      html: emailHtml(purpose, otp, meta.name),
      text: `${INTROS[purpose]}\n\n${otp}\n\nالرمز صالح لمدة 10 دقائق ويستخدم مرة واحدة.`,
    })
    if (error) {
      console.error('[emailOtp] Resend send failed:', error?.name || 'error', error?.message || '')
      return { error: 'تعذر إرسال رسالة البريد — حاول لاحقاً', status: 502 }
    }
    return { success: true }
  } catch (e) {
    console.error('[emailOtp] Resend exception:', e?.message || 'unknown')
    return { error: 'تعذر إرسال رسالة البريد — حاول لاحقاً', status: 502 }
  }
}

// Verifies an OTP (single-use, 3-attempt cap → auto-invalidation). { ok: true } or { error, status }.
export async function verifyOtp(db, emailRaw, purpose, submitted, meta = {}) {
  const email = String(emailRaw).toLowerCase().trim()
  const code = String(submitted || '').trim()
  const ip = String(meta.ip || 'unknown')
  // ordinary format errors are handled WITHOUT touching the stored OTP or sending anything
  if (!/^\d{6}$/.test(code)) return { error: 'الرمز يجب أن يكون 6 أرقام', status: 400 }
  // ---- IP throttling on verification attempts ----
  const ipVerifies = await db.collection(IP_COLL).countDocuments({ ip, kind: 'verify', at: { $gte: new Date(Date.now() - 3600000) } })
  if (ipVerifies >= IP_MAX_VERIFIES_PER_HOUR) return { error: 'محاولات كثيرة من هذا الجهاز — حاول بعد ساعة', status: 429 }
  await db.collection(IP_COLL).insertOne({ ip, kind: 'verify', email, at: new Date() })
  const rec = await db.collection(COLL).findOne({ email, purpose, used_at: null }, { sort: { created_at: -1 } })
  if (!rec) return { error: 'الرمز غير صحيح أو منتهي الصلاحية', status: 400 }
  if (new Date(rec.expires_at) <= new Date()) return { error: 'انتهت صلاحية الرمز — اطلب رمزاً جديداً', status: 400 }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await db.collection(COLL).updateOne({ id: rec.id, used_at: null }, { $set: { used_at: new Date(), invalidated: true } })
    return { error: 'تجاوزت عدد المحاولات المسموح (3) — اطلب رمزاً جديداً', status: 429 }
  }
  await db.collection(COLL).updateOne({ id: rec.id }, { $inc: { attempts: 1 } })
  if (!sameHash(rec.code_hash, hashOtp(email, purpose, code))) {
    // v8.0.1 — the 3rd wrong attempt INVALIDATES this OTP immediately (new one required)
    if (rec.attempts + 1 >= MAX_ATTEMPTS) {
      await db.collection(COLL).updateOne({ id: rec.id, used_at: null }, { $set: { used_at: new Date(), invalidated: true } })
      return { error: 'الرمز غير صحيح — أُبطل الرمز بعد 3 محاولات خاطئة، اطلب رمزاً جديداً', status: 429 }
    }
    return { error: `الرمز غير صحيح — تبقى ${MAX_ATTEMPTS - rec.attempts - 1} محاولة`, status: 400 }
  }
  // atomic single-use consumption — a concurrent duplicate verify loses the race
  const consumed = await db.collection(COLL).updateOne({ id: rec.id, used_at: null }, { $set: { used_at: new Date() } })
  if (!consumed.modifiedCount) return { error: 'الرمز استُخدم مسبقاً — اطلب رمزاً جديداً', status: 400 }
  // v8.0.1 — successful verification invalidates ALL remaining OTPs for this email+purpose
  await db.collection(COLL).updateMany({ email, purpose, used_at: null }, { $set: { used_at: new Date(), superseded: true } })
  return { ok: true }
}
