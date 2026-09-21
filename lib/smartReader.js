// =============================================================================
// v6.0 — «قاري رحّال» (Rahaal Smart Reader) — Document Reading Engine + Credits
// -----------------------------------------------------------------------------
// A third data-entry method (Manual | Excel | Smart Reader) for Tickets & Visas.
// - Provider-independent AI layer (Emergent universal key → gemini/openai/anthropic)
// - Text PDFs: local text extraction (pdfjs) → cheap text-mode LLM call
// - Scanned PDFs: temp file → native PDF vision (deleted in finally)
// - Images (JPG/PNG): base64 → vision
// - NO financial effect here, EVER. The reader only returns fields that prefill
//   the EXISTING Ticket/Visa forms; saving uses the existing POST /tickets|/visas.
// - Credits: idempotent charge (read_id) ONLY when a usable_read is produced and
//   returned for loading into the form. Failures/unsupported/unusable = no charge.
// - Privacy: the uploaded document is processed in-memory / temp file and never
//   persisted. Usage docs store extracted fields only (for idempotent replay),
//   never the raw document. No document content in logs.
// =============================================================================

import crypto from 'crypto'

const CURRENCIES = ['USD', 'SAR', 'YER']
const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB cap
const ALLOWED_MIME = { 'application/pdf': 'pdf', 'image/jpeg': 'image', 'image/png': 'image', 'image/jpg': 'image' }
const PROCESSING_STALE_MS = 120000 // a stuck 'processing' claim can be taken over after 2 min

// Approximate USD per 1M tokens — ESTIMATES for economics reporting only (never billing).
const COST_TABLE = {
  'gemini-3.6-flash': { in: 0.10, out: 0.40 },
  'gemini-2.5-flash': { in: 0.15, out: 0.60 },
  'gemini-1.5-pro': { in: 1.25, out: 5.00 },
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'gpt-4o': { in: 2.50, out: 10.00 },
}
function estCostUsd(model, usage) {
  const rate = COST_TABLE[model] || { in: 0.50, out: 1.50 }
  const tin = Number(usage?.input_tokens) || 0, tout = Number(usage?.output_tokens) || 0
  return +((tin / 1e6) * rate.in + (tout / 1e6) * rate.out).toFixed(6)
}

// ---------------------------------------------------------------- indexes ---
let _indexed = false
async function ensureIndexes(db) {
  if (_indexed) return
  try {
    await db.collection('smart_reader_usage').createIndex({ id: 1 }, { unique: true })
    await db.collection('smart_reader_usage').createIndex({ tenant_id: 1, created_at: -1 })
    await db.collection('smart_reader_credits').createIndex({ tenant_id: 1 }, { unique: true })
    await db.collection('smart_reader_adjustments').createIndex({ tenant_id: 1, created_at: -1 })
    _indexed = true
  } catch { /* index creation is best-effort */ }
}

// ------------------------------------------------------------ config/credits ---
export async function getSmartConfig(db) {
  let c = await db.collection('smart_reader_config').findOne({ id: 'global' })
  if (!c) {
    const seed = { id: 'global', trial_credits: 10, enabled_default: true, created_at: new Date(), updated_at: new Date() }
    await db.collection('smart_reader_config').updateOne({ id: 'global' }, { $setOnInsert: seed }, { upsert: true })
    c = await db.collection('smart_reader_config').findOne({ id: 'global' })
  }
  return c
}

export async function getOrInitCredits(db, T) {
  let c = await db.collection('smart_reader_credits').findOne({ tenant_id: T })
  if (!c) {
    const cfg = await getSmartConfig(db)
    const seed = {
      id: crypto.randomUUID(), tenant_id: T,
      enabled: cfg.enabled_default !== false,
      free_credits: Math.max(0, Number(cfg.trial_credits) || 0),
      paid_credits: 0, consumed_total: 0,
      trial_granted: Math.max(0, Number(cfg.trial_credits) || 0),
      last_usage_at: null, created_at: new Date(), updated_at: new Date(),
    }
    try { await db.collection('smart_reader_credits').insertOne(seed); c = seed } catch { c = await db.collection('smart_reader_credits').findOne({ tenant_id: T }) }
  }
  return c
}

const creditsView = (c) => ({
  enabled: c.enabled !== false,
  free_credits: Number(c.free_credits) || 0,
  paid_credits: Number(c.paid_credits) || 0,
  total: (Number(c.free_credits) || 0) + (Number(c.paid_credits) || 0),
  consumed_total: Number(c.consumed_total) || 0,
  last_usage_at: c.last_usage_at || null,
})

// Atomic single-read deduction: free first, then paid. Guarded ($gt: 0) — a race
// to zero can never produce a negative balance or a phantom charge.
async function chargeOneCredit(db, T) {
  const setNow = { $set: { last_usage_at: new Date(), updated_at: new Date() } }
  const r1 = await db.collection('smart_reader_credits').updateOne(
    { tenant_id: T, enabled: { $ne: false }, free_credits: { $gt: 0 } },
    { $inc: { free_credits: -1, consumed_total: 1 }, ...setNow })
  if (r1.modifiedCount) return 'free'
  const r2 = await db.collection('smart_reader_credits').updateOne(
    { tenant_id: T, enabled: { $ne: false }, paid_credits: { $gt: 0 } },
    { $inc: { paid_credits: -1, consumed_total: 1 }, ...setNow })
  if (r2.modifiedCount) return 'paid'
  return null
}

// --------------------------------------------------------------- PDF text ---
async function extractPdfText(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise
  let text = ''
  const maxPages = Math.min(pdf.numPages, 5)
  for (let n = 1; n <= maxPages; n++) {
    const page = await pdf.getPage(n)
    const tc = await page.getTextContent()
    text += tc.items.map(i => i.str).join(' ') + '\n'
    try { page.cleanup() } catch {}
  }
  try { await pdf.destroy() } catch {}
  return { text: text.trim(), pages: pdf.numPages }
}
const hasMeaningfulText = (t) => String(t || '').replace(/\s+/g, '').length >= 60

// ------------------------------------------------------------- AI schemas ---
const NULLSTR = { type: ['string', 'null'] }
const NULLNUM = { type: ['number', 'null'] }

const TICKET_SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: ['string', 'null'], enum: ['ticket', 'visa', 'other', null], description: 'What this document actually is' },
    passenger_name: { ...NULLSTR, description: 'Full passenger name exactly as printed' },
    mobile: { ...NULLSTR, description: 'Passenger/customer contact phone found ANYWHERE on the document — labeled (Mobile/Phone/Tel/Contact/جوال/هاتف/تلفون/رقم التواصل/واتساب) OR clearly phone-formatted (+967…, 00967…, 7XXXXXXXX, 05XXXXXXXX). Convert Arabic-Indic digits to Latin, return digits only. NEVER derive from ticket/passport/ID/PNR numbers. null only if no phone exists on the document' },
    ticket_number: { ...NULLSTR, description: 'Ticket number (usually 10-14 digits, may have airline prefix)' },
    pnr: { ...NULLSTR, description: 'PNR / Booking reference (usually 5-7 alphanumeric)' },
    carrier_name: { ...NULLSTR, description: 'Airline or bus company name' },
    travel_mode: { type: ['string', 'null'], enum: ['air', 'land', null], description: 'air for flights, land for bus/ground transport' },
    flight_number: { ...NULLSTR },
    origin: { ...NULLSTR, description: 'Departure city/airport' },
    destination: { ...NULLSTR, description: 'Arrival city/airport' },
    route: { ...NULLSTR, description: 'Full route string if printed (e.g. SAH - JED)' },
    travel_date: { ...NULLSTR, description: 'Travel/departure date as YYYY-MM-DD' },
    departure_time: { ...NULLSTR, description: 'Departure time as HH:MM (24h)' },
    arrival_time: { ...NULLSTR, description: 'Arrival time as HH:MM (24h)' },
    issue_date: { ...NULLSTR, description: 'Ticket issue date as YYYY-MM-DD' },
    passport_no: { ...NULLSTR, description: 'Passport number ONLY if explicitly labeled passport. Do not confuse with ticket number' },
    passenger_age: { ...NULLSTR },
    currency: { ...NULLSTR, description: 'ISO currency code of the amounts (USD, SAR, YER, ...)' },
    fare: { ...NULLNUM, description: 'Base fare amount if separately printed' },
    taxes: { ...NULLNUM, description: 'Total taxes if separately printed' },
    total_amount: { ...NULLNUM, description: 'FINAL total price shown to the traveler. If Fare+Tax+Total printed, this is the Total. null if no price on document' },
    low_confidence_fields: { type: 'array', items: { type: 'string' }, description: 'Names of fields you extracted but are NOT fully sure about' },
  },
  required: ['doc_type', 'passenger_name', 'mobile', 'ticket_number', 'pnr', 'carrier_name', 'travel_mode', 'flight_number', 'origin', 'destination', 'route', 'travel_date', 'departure_time', 'arrival_time', 'issue_date', 'passport_no', 'passenger_age', 'currency', 'fare', 'taxes', 'total_amount', 'low_confidence_fields'],
}

const VISA_SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: ['string', 'null'], enum: ['ticket', 'visa', 'other', null] },
    beneficiary_name: { ...NULLSTR, description: 'Applicant/beneficiary full name exactly as printed' },
    mobile: { ...NULLSTR, description: 'Beneficiary/customer contact phone found ANYWHERE on the document — labeled (Mobile/Phone/Tel/جوال/هاتف/تلفون/رقم التواصل/واتساب) OR clearly phone-formatted (+967…, 00967…, 7XXXXXXXX, 05XXXXXXXX). Convert Arabic-Indic digits to Latin, return digits only. NEVER derive from visa/passport/ID numbers. null only if no phone exists on the document' },
    passport_no: { ...NULLSTR, description: 'Passport number ONLY if labeled as passport' },
    nationality: { ...NULLSTR },
    visa_number: { ...NULLSTR, description: 'Visa number ONLY if labeled as visa no. Do not confuse with passport' },
    visa_type: { ...NULLSTR, description: 'Visa type/category (Umrah, Visit, Work, Tourist...)' },
    issue_date: { ...NULLSTR, description: 'Visa issue date as YYYY-MM-DD' },
    expiry_date: { ...NULLSTR, description: 'Visa expiry / valid-until date as YYYY-MM-DD' },
    entry_date: { ...NULLSTR, description: 'Entry date if printed, as YYYY-MM-DD' },
    duration_days: { ...NULLNUM, description: 'Stay duration in days if printed' },
    currency: { ...NULLSTR },
    sale_total: { ...NULLNUM, description: 'Explicit visa PRICE only if the document clearly shows a price charged. Government fee stamps are NOT a sale price. Most visas have NO price → null' },
    low_confidence_fields: { type: 'array', items: { type: 'string' } },
  },
  required: ['doc_type', 'beneficiary_name', 'mobile', 'passport_no', 'nationality', 'visa_number', 'visa_type', 'issue_date', 'expiry_date', 'entry_date', 'duration_days', 'currency', 'sale_total', 'low_confidence_fields'],
}

const SYSTEM_PROMPT = `You are «قاري رحّال», a strict document data-extraction engine for a travel agency ERP.
RULES (non-negotiable):
1. Extract ONLY what is actually printed on the document. NEVER guess, infer or invent a value.
2. Any absent, unclear or ambiguous field MUST be null. Never use 0 or empty string as a substitute for unknown.
3. NEVER confuse number types: passport numbers, ticket numbers, PNR codes, visa numbers and mobile numbers are different fields — map each only when its label/context is explicit.
4. Dates: output as YYYY-MM-DD (convert from any printed format). Times: HH:MM 24h.
5. Prices: the FINAL total shown to the traveler is the sale total. A base fare is NOT the total when taxes exist. If no price is printed, total is null.
6. The document may be in Arabic, English or mixed. Handle RTL text carefully.
7. MOBILE/PHONE EXTRACTION: actively search the WHOLE document for the passenger/customer contact number. Common labels: Mobile, Phone, Tel, Contact, GSM, WhatsApp, جوال, الجوال, رقم الجوال, هاتف, الهاتف, تلفون, التلفون, رقم التواصل, رقم العميل, واتساب — or any clearly phone-formatted number even without a label (e.g. +967…, 00967…, 7XXXXXXXX, 05XXXXXXXX, 9-10 digit local numbers). Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩ / ۰۱۲۳۴۵۶۷۸۹) to Latin digits. Return digits only (a leading + is allowed). If several phone numbers exist, return the one tied to the passenger/customer — not the issuing office's header/footer number when both exist; if only ONE phone appears anywhere on the document, return it. NEVER construct a phone from ticket/passport/visa/PNR/ID numbers. If genuinely absent, null.
8. You MUST respond by calling the extraction function exactly once.`

// ---------------------------------------------------------------- AI call ---
async function runExtraction({ kind, mode, text, imageB64, pdfB64, readId }) {
  const { LlmChat, UserMessage, ImageContent, FileContent } = await import('emergentintegrations')
  const provider = process.env.SMART_READER_PROVIDER || 'gemini'
  const model = process.env.SMART_READER_MODEL || 'gemini-3.6-flash'
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('SMART_READER_KEY_MISSING')
  const fnName = kind === 'visa' ? 'extract_visa' : 'extract_ticket'
  const schema = kind === 'visa' ? VISA_SCHEMA : TICKET_SCHEMA
  const chat = new LlmChat(key, `sr-${readId}`, SYSTEM_PROMPT)
    .withModel(provider, model)
    .withParams({ temperature: 0 })
    .withTools([{ type: 'function', function: { name: fnName, description: `Return the extracted ${kind} fields`, parameters: schema } }])
  const ask = kind === 'visa'
    ? 'Extract the visa/permit fields from this document. The user opened this from the VISAS screen, so it is most likely a visa document.'
    : 'Extract the travel ticket fields from this document (may be an airline e-ticket or a bus/land-transport ticket). The user opened this from the TICKETS screen, so it is most likely a ticket.'
  let msg
  if (mode === 'text') msg = new UserMessage({ text: `${ask}\n\nDOCUMENT TEXT:\n${String(text).slice(0, 100000)}` })
  else if (mode === 'image') msg = new UserMessage({ text: ask, file_contents: [new ImageContent(imageB64)] })
  else msg = new UserMessage({ text: ask, file_contents: [new FileContent('application/pdf', pdfB64)] }) // in-memory base64 — nothing touches disk
  const resp = await chat.sendMessageWithTools(msg)
  const call = (resp.tool_calls || []).find(c => c.name === fnName) || (resp.tool_calls || [])[0]
  if (!call) throw new Error('SMART_READER_NO_TOOL_CALL')
  const raw = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : (call.arguments || {})
  return { raw, usage: resp.usage || {}, provider, model }
}

// ----------------------------------------------------------- normalization ---
const s = (v) => { const t = v == null ? '' : String(v).trim(); return t && t.toLowerCase() !== 'null' && t !== '-' ? t : null }
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null }
const dateS = (v) => { const t = s(v); if (!t) return null; const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null; const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`); return isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}` }
const timeS = (v) => { const t = s(v); if (!t) return null; const m = t.match(/^(\d{1,2}):(\d{2})/); if (!m) return null; const h = Number(m[1]); return h >= 0 && h <= 23 ? `${String(h).padStart(2, '0')}:${m[2]}` : null }
// v6.0.1 — robust phone normalization: Arabic-Indic digits, embedded separators/labels,
// picks the FIRST plausible phone sequence instead of hard-rejecting the whole string.
const AR_DIGIT_MAP = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' }
const phoneS = (v) => {
  let t = s(v); if (!t) return null
  t = t.replace(/[٠-٩۰-۹]/g, (d) => AR_DIGIT_MAP[d] || d)
  const m = t.match(/\+?\d[\d\s\-().]{5,22}\d/) || t.match(/\+?\d{7,15}/)
  if (!m) return null
  const cleaned = m[0].replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
  const digits = cleaned.replace(/^\+/, '')
  return digits.length >= 7 && digits.length <= 15 ? cleaned : null
}
const curS = (v) => { const t = s(v); if (!t) return null; const up = t.toUpperCase(); return /^[A-Z]{3}$/.test(up) ? up : null }

function normalizeTicket(raw) {
  return {
    doc_type: s(raw.doc_type) || 'unknown',
    passenger_name: s(raw.passenger_name),
    mobile: phoneS(raw.mobile),
    ticket_number: s(raw.ticket_number),
    pnr: s(raw.pnr),
    carrier_name: s(raw.carrier_name),
    travel_mode: raw.travel_mode === 'land' ? 'land' : raw.travel_mode === 'air' ? 'air' : null,
    flight_number: s(raw.flight_number),
    origin: s(raw.origin),
    destination: s(raw.destination),
    route: s(raw.route),
    travel_date: dateS(raw.travel_date),
    departure_time: timeS(raw.departure_time),
    arrival_time: timeS(raw.arrival_time),
    issue_date: dateS(raw.issue_date),
    passport_no: s(raw.passport_no),
    passenger_age: s(raw.passenger_age),
    currency: curS(raw.currency),
    fare: num(raw.fare),
    taxes: num(raw.taxes),
    total_amount: num(raw.total_amount),
    low_confidence_fields: Array.isArray(raw.low_confidence_fields) ? raw.low_confidence_fields.filter(x => typeof x === 'string').slice(0, 30) : [],
  }
}
function normalizeVisa(raw) {
  return {
    doc_type: s(raw.doc_type) || 'unknown',
    beneficiary_name: s(raw.beneficiary_name),
    mobile: phoneS(raw.mobile),
    passport_no: s(raw.passport_no),
    nationality: s(raw.nationality),
    visa_number: s(raw.visa_number),
    visa_type: s(raw.visa_type),
    issue_date: dateS(raw.issue_date),
    expiry_date: dateS(raw.expiry_date),
    entry_date: dateS(raw.entry_date),
    duration_days: num(raw.duration_days),
    currency: curS(raw.currency),
    sale_total: num(raw.sale_total),
    low_confidence_fields: Array.isArray(raw.low_confidence_fields) ? raw.low_confidence_fields.filter(x => typeof x === 'string').slice(0, 30) : [],
  }
}

// usable_read: the charging gate — a read that genuinely helps the employee.
// Ticket: passenger name + at least 2 more core identifiers.
// Visa:   beneficiary name + (passport OR visa number).
function usableRead(kind, f) {
  if (kind === 'visa') {
    if (!f.beneficiary_name) return { ok: false, why: 'لم يُقرأ اسم صاحب التأشيرة' }
    if (!f.passport_no && !f.visa_number) return { ok: false, why: 'لم يُقرأ رقم الجواز ولا رقم التأشيرة' }
    return { ok: true }
  }
  if (!f.passenger_name) return { ok: false, why: 'لم يُقرأ اسم المسافر' }
  const core = [f.ticket_number, f.pnr, f.travel_date, (f.origin && f.destination) || f.route, f.carrier_name, f.total_amount]
  const found = core.filter(x => x !== null && x !== undefined && x !== '' && x !== false).length
  if (found < 2) return { ok: false, why: 'المستند لا يحتوي حدًا أدنى من بيانات التذكرة (رقم/PNR/تاريخ/خط سير/شركة/مبلغ)' }
  return { ok: true }
}

const usageResult = (u, remaining, duplicate) => ({
  ok: true, charged: u.status === 'charged', usable: u.status === 'charged',
  duplicate: !!duplicate, read_id: u.id, doc_kind: u.doc_kind, file_type: u.file_type,
  fields: u.fields || null, message: u.fail_reason || null,
  remaining: remaining ?? null,
})

// ============================================================================
// TENANT HANDLER — /smart-reader/credits (GET) · /smart-reader/read (POST)
// P = effective permissions object for staff, or null for owner/super-admin.
// ============================================================================
export async function smartReaderHandler(db, route, method, request, sess, T, B, P) {
  await ensureIndexes(db)

  if (route === '/smart-reader/credits' && method === 'GET') {
    const c = await getOrInitCredits(db, T)
    return creditsView(c)
  }

  if (route === '/smart-reader/read' && method === 'POST') {
    // ---- 1. parse multipart ----
    let form
    try { form = await request.formData() } catch { return { error: 'صيغة الطلب غير صحيحة — يجب رفع الملف كـ multipart/form-data', status: 400 } }
    const docKind = String(form.get('doc_kind') || '').trim()
    const readId = String(form.get('read_id') || '').trim()
    const file = form.get('file')
    if (docKind !== 'ticket' && docKind !== 'visa') return { error: 'doc_kind يجب أن يكون ticket أو visa', status: 400 }
    if (!/^[A-Za-z0-9-]{10,64}$/.test(readId)) return { error: 'read_id مطلوب (معرّف فريد لعملية القراءة)', status: 400 }
    // ---- 2. module permission mirrors the target screen ----
    if (P && docKind === 'ticket' && !P.mod_tickets) return { error: '🚫 غير مصرح — ليس لديك صلاحية قسم حجز التذاكر', status: 403 }
    if (P && docKind === 'visa' && !P.mod_visas) return { error: '🚫 غير مصرح — ليس لديك صلاحية قسم التأشيرات', status: 403 }
    // ---- 3. idempotency: same read_id never charges twice ----
    const credits0 = await getOrInitCredits(db, T)
    const existing = await db.collection('smart_reader_usage').findOne({ id: readId })
    if (existing) {
      if (existing.tenant_id !== T) return { error: 'read_id غير صالح', status: 403 } // cross-tenant guard
      if (existing.status === 'charged') return usageResult(existing, creditsView(credits0).total, true)
      if (existing.status === 'processing' && Date.now() - new Date(existing.updated_at).getTime() < PROCESSING_STALE_MS) {
        return { error: 'القراءة قيد المعالجة — انتظر لحظات ثم أعد المحاولة بنفس المعرف', status: 409 }
      }
      // failed / stale-processing → retry allowed (still no double charge; charged path returned above)
      await db.collection('smart_reader_usage').updateOne({ id: readId, tenant_id: T }, { $set: { status: 'processing', updated_at: new Date() } })
    }
    // ---- 4. service enabled + balance precheck (never burn AI cost at zero) ----
    if (credits0.enabled === false) return { error: 'خدمة قاري رحّال غير مفعّلة لهذا المكتب — تواصل مع إدارة رحّال', status: 403 }
    const total0 = (Number(credits0.free_credits) || 0) + (Number(credits0.paid_credits) || 0)
    if (total0 <= 0) return { error: 'انتهى رصيد قاري رحّال. يرجى شحن رصيد للاستمرار.', status: 402 }
    // ---- 5. file validation ----
    if (!file || typeof file.arrayBuffer !== 'function') return { error: 'الملف مطلوب', status: 400 }
    const mime = String(file.type || '').toLowerCase()
    if (!ALLOWED_MIME[mime]) return { error: 'صيغة غير مدعومة — المسموح: PDF / JPG / PNG', status: 415 }
    if (file.size > MAX_FILE_BYTES) return { error: 'حجم الملف يتجاوز 8MB', status: 413 }
    const buf = Buffer.from(await file.arrayBuffer())
    // byte-signature check (don't trust the MIME header alone)
    const sig = buf.subarray(0, 5).toString('latin1')
    const isPdf = sig.startsWith('%PDF')
    const isPng = buf[0] === 0x89 && buf[1] === 0x50
    const isJpg = buf[0] === 0xFF && buf[1] === 0xD8
    if (ALLOWED_MIME[mime] === 'pdf' && !isPdf) return { error: 'الملف ليس PDF صالحًا', status: 415 }
    if (ALLOWED_MIME[mime] === 'image' && !isPng && !isJpg) return { error: 'الصورة ليست JPG/PNG صالحة', status: 415 }
    // ---- 6. claim the read (placeholder) — makes retries idempotent ----
    if (!existing) {
      const placeholder = {
        id: readId, tenant_id: T, branch_id: B ?? null, user_email: sess.user.email,
        doc_kind: docKind, status: 'processing', file_type: null,
        file_name: String(file.name || '').slice(0, 120), file_bytes: file.size,
        created_at: new Date(), updated_at: new Date(),
      }
      try { await db.collection('smart_reader_usage').insertOne(placeholder) } catch {
        const ex2 = await db.collection('smart_reader_usage').findOne({ id: readId })
        if (ex2?.status === 'charged') return usageResult(ex2, creditsView(await getOrInitCredits(db, T)).total, true)
        return { error: 'القراءة قيد المعالجة — انتظر لحظات', status: 409 }
      }
    }
    const failUsage = async (reason, extra = {}) => {
      await db.collection('smart_reader_usage').updateOne({ id: readId, tenant_id: T },
        { $set: { status: 'failed_no_charge', fail_reason: reason, updated_at: new Date(), ...extra } })
    }
    // ---- 7. route to extraction path (all in-memory — the document is NEVER stored) ----
    try {
      let mode, fileType, text = null, imageB64 = null, pdfB64 = null
      if (isPdf) {
        let pdfText = ''
        try { const r = await extractPdfText(buf); pdfText = r.text } catch { pdfText = '' }
        if (hasMeaningfulText(pdfText)) { mode = 'text'; fileType = 'text_pdf'; text = pdfText }
        else { mode = 'pdf'; fileType = 'scanned_pdf'; pdfB64 = buf.toString('base64') }
      } else { mode = 'image'; fileType = 'image'; imageB64 = buf.toString('base64') }
      // ---- 8. AI extraction ----
      let ex
      try { ex = await runExtraction({ kind: docKind, mode, text, imageB64, pdfB64, readId }) }
      catch (e) {
        await failUsage('تعذّرت قراءة المستند (خطأ في محرك القراءة) — لم يُخصم رصيد', { file_type: fileType })
        console.error('smart-reader extraction error', { readId, kind: docKind, fileType, msg: String(e.message).slice(0, 200) })
        return { error: 'تعذّرت قراءة المستند حاليًا — لم يُخصم أي رصيد. حاول مجددًا', status: 502 }
      }
      const fields = docKind === 'visa' ? normalizeVisa(ex.raw) : normalizeTicket(ex.raw)
      const cost = estCostUsd(ex.model, ex.usage)
      const meta = {
        file_type: fileType, provider: ex.provider, model: ex.model,
        tokens_in: Number(ex.usage?.input_tokens) || 0, tokens_out: Number(ex.usage?.output_tokens) || 0,
        est_cost_usd: cost,
      }
      // ---- 9. usable_read gate — the ONLY path that charges ----
      const gate = usableRead(docKind, fields)
      if (!gate.ok) {
        await failUsage(`القراءة غير صالحة للاستخدام: ${gate.why} — لم يُخصم رصيد`, { ...meta, fields })
        return { ok: true, charged: false, usable: false, read_id: readId, doc_kind: docKind, file_type: fileType, fields, message: `${gate.why} — لم يُخصم أي رصيد. أكمل البيانات يدويًا أو جرّب مستندًا أوضح.`, remaining: total0 }
      }
      // ---- 10. atomic idempotent charge ----
      const chargedFrom = await chargeOneCredit(db, T)
      if (!chargedFrom) {
        await failUsage('انتهى الرصيد قبل إتمام الخصم — لم يُخصم رصيد', { ...meta, fields })
        return { error: 'انتهى رصيد قاري رحّال. يرجى شحن رصيد للاستمرار.', status: 402 }
      }
      await db.collection('smart_reader_usage').updateOne({ id: readId, tenant_id: T },
        { $set: { status: 'charged', charged_from: chargedFrom, fields, ...meta, fail_reason: null, updated_at: new Date() } })
      const cAfter = await getOrInitCredits(db, T)
      return { ok: true, charged: true, usable: true, duplicate: false, read_id: readId, doc_kind: docKind, file_type: fileType, fields, remaining: creditsView(cAfter).total, low_balance: creditsView(cAfter).total <= 3 }
    } catch (e) {
      await failUsage('خطأ غير متوقع أثناء المعالجة — لم يُخصم رصيد')
      console.error('smart-reader unexpected error', { readId, msg: String(e.message).slice(0, 200) })
      return { error: 'خطأ غير متوقع أثناء المعالجة — لم يُخصم أي رصيد', status: 500 }
    }
  }

  return { error: 'المسار غير موجود', status: 404 }
}

// ============================================================================
// ADMIN HANDLER — /admin/smart-reader/* (behind adminGate in route.js)
// ============================================================================
export async function adminSmartReaderHandler(db, sub, method, sp, body, sess) {
  await ensureIndexes(db)
  const b = body || {}
  const admin = sess?.user?.email || 'admin'

  if (sub === '/overview' && method === 'GET') {
    const [tenants, credits, cfg, usageAgg] = await Promise.all([
      db.collection('tenants').find({ is_platform_org: { $ne: true } }).project({ _id: 0, id: 1, name: 1, plan_tier: 1, subscription: 1, status: 1 }).toArray(),
      db.collection('smart_reader_credits').find({}).project({ _id: 0 }).toArray(),
      getSmartConfig(db),
      db.collection('smart_reader_usage').aggregate([
        { $match: { status: 'charged' } },
        { $group: { _id: { t: '$tenant_id', ft: '$file_type' }, n: { $sum: 1 }, cost: { $sum: '$est_cost_usd' } } },
      ]).toArray(),
    ])
    const cmap = new Map(credits.map(c => [c.tenant_id, c]))
    const costByTenant = {}
    const costByType = {}
    for (const u of usageAgg) {
      const t = u._id.t, ft = u._id.ft || 'unknown'
      costByTenant[t] = (costByTenant[t] || 0) + (u.cost || 0)
      if (!costByType[ft]) costByType[ft] = { reads: 0, cost: 0 }
      costByType[ft].reads += u.n; costByType[ft].cost += (u.cost || 0)
    }
    const rows = tenants.map(t => {
      const c = cmap.get(t.id)
      return {
        tenant_id: t.id, name: t.name, plan_tier: t.plan_tier || 'standard',
        subscription: t.subscription || 'trial', status: t.status || 'active',
        initialized: !!c,
        enabled: c ? c.enabled !== false : cfg.enabled_default !== false,
        free_credits: c ? (Number(c.free_credits) || 0) : null,
        paid_credits: c ? (Number(c.paid_credits) || 0) : null,
        total: c ? (Number(c.free_credits) || 0) + (Number(c.paid_credits) || 0) : null,
        consumed_total: c ? (Number(c.consumed_total) || 0) : 0,
        last_usage_at: c?.last_usage_at || null,
        est_ai_cost_usd: +((costByTenant[t.id] || 0).toFixed(4)),
      }
    })
    // economics: average estimated AI cost per read type (for pricing decisions)
    const economics = Object.fromEntries(Object.entries(costByType).map(([ft, v]) => [ft, { reads: v.reads, total_est_cost_usd: +v.cost.toFixed(4), avg_est_cost_usd: v.reads ? +((v.cost / v.reads).toFixed(6)) : 0 }]))
    return { rows, config: { trial_credits: cfg.trial_credits, enabled_default: cfg.enabled_default !== false }, economics, provider: process.env.SMART_READER_PROVIDER || 'gemini', model: process.env.SMART_READER_MODEL || 'gemini-3.6-flash' }
  }

  if (sub === '/config' && method === 'PUT') {
    const trial = Number(b.trial_credits)
    if (!Number.isInteger(trial) || trial < 0 || trial > 100000) return { error: 'قيمة الرصيد التجريبي يجب أن تكون عددًا صحيحًا بين 0 و 100000', status: 400 }
    await db.collection('smart_reader_config').updateOne({ id: 'global' },
      { $set: { trial_credits: trial, enabled_default: b.enabled_default !== false, updated_at: new Date(), updated_by: admin } }, { upsert: true })
    return { success: true, trial_credits: trial, enabled_default: b.enabled_default !== false }
  }

  if (sub === '/toggle' && method === 'POST') {
    const tid = String(b.tenant_id || '').trim()
    if (!tid) return { error: 'tenant_id مطلوب', status: 400 }
    const t = await db.collection('tenants').findOne({ id: tid })
    if (!t) return { error: 'المكتب غير موجود', status: 404 }
    const before = await getOrInitCredits(db, tid)
    const enabled = !!b.enabled
    await db.collection('smart_reader_credits').updateOne({ tenant_id: tid }, { $set: { enabled, updated_at: new Date() } })
    await db.collection('smart_reader_adjustments').insertOne({
      id: crypto.randomUUID(), tenant_id: tid, type: 'toggle', admin_email: admin,
      before: { enabled: before.enabled !== false }, after: { enabled },
      reason: String(b.reason || (enabled ? 'تفعيل الخدمة' : 'إيقاف الخدمة')).slice(0, 300), created_at: new Date(),
    })
    return { success: true, tenant_id: tid, enabled }
  }

  if (sub === '/adjust' && method === 'POST') {
    const tid = String(b.tenant_id || '').trim()
    const reason = String(b.reason || '').trim()
    const df = Number(b.free_delta) || 0
    const dp = Number(b.paid_delta) || 0
    if (!tid) return { error: 'tenant_id مطلوب', status: 400 }
    if (!reason) return { error: 'السبب (Reason) إلزامي لأي تعديل رصيد', status: 400 }
    if (!Number.isInteger(df) || !Number.isInteger(dp)) return { error: 'قيم التعديل يجب أن تكون أعدادًا صحيحة', status: 400 }
    if (df === 0 && dp === 0) return { error: 'لم يتم تحديد أي تغيير في الرصيد', status: 400 }
    if (Math.abs(df) > 1000000 || Math.abs(dp) > 1000000) return { error: 'قيمة التعديل تتجاوز الحد المسموح', status: 400 }
    const t = await db.collection('tenants').findOne({ id: tid })
    if (!t) return { error: 'المكتب غير موجود', status: 404 }
    await getOrInitCredits(db, tid)
    // atomic guarded update — never allows negative balances
    const filter = { tenant_id: tid }
    if (df < 0) filter.free_credits = { $gte: -df }
    if (dp < 0) filter.paid_credits = { $gte: -dp }
    const res = await db.collection('smart_reader_credits').findOneAndUpdate(
      filter, { $inc: { free_credits: df, paid_credits: dp }, $set: { updated_at: new Date() } },
      { returnDocument: 'after' })
    const after = res?.value ?? res // driver version compatibility
    if (!after || after.tenant_id !== tid) return { error: 'الرصيد الحالي لا يكفي للخصم المطلوب — لا يُسمح برصيد سالب', status: 400 }
    const beforeFree = (Number(after.free_credits) || 0) - df
    const beforePaid = (Number(after.paid_credits) || 0) - dp
    await db.collection('smart_reader_adjustments').insertOne({
      id: crypto.randomUUID(), tenant_id: tid, type: 'adjust', admin_email: admin,
      before: { free: beforeFree, paid: beforePaid },
      change: { free: df, paid: dp },
      after: { free: Number(after.free_credits) || 0, paid: Number(after.paid_credits) || 0 },
      reason: reason.slice(0, 300), created_at: new Date(),
    })
    return { success: true, tenant_id: tid, free_credits: Number(after.free_credits) || 0, paid_credits: Number(after.paid_credits) || 0, total: (Number(after.free_credits) || 0) + (Number(after.paid_credits) || 0) }
  }

  if (sub === '/history' && method === 'GET') {
    const tid = String(sp.get('tenant_id') || '').trim()
    if (!tid) return { error: 'tenant_id مطلوب', status: 400 }
    const [usage, adjustments] = await Promise.all([
      db.collection('smart_reader_usage').find({ tenant_id: tid })
        .project({ _id: 0, fields: 0 }) // privacy: extracted PII stays out of the admin view
        .sort({ created_at: -1 }).limit(100).toArray(),
      db.collection('smart_reader_adjustments').find({ tenant_id: tid })
        .project({ _id: 0 }).sort({ created_at: -1 }).limit(100).toArray(),
    ])
    return { usage, adjustments }
  }

  return { error: 'المسار غير موجود', status: 404 }
}
