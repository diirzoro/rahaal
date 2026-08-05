import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

// ---------- MongoDB ----------
let client, db
async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    // v3.4 deployment fix — remove hardcoded DB_NAME fallback so we fail-fast if env is missing
    if (!process.env.DB_NAME) throw new Error('DB_NAME environment variable is required')
    db = client.db(process.env.DB_NAME)
    await seedInitial(db)
  }
  return db
}

const CURRENCIES = ['USD', 'SAR', 'YER']
// Base currency = YER. Rates represent: 1 unit of currency = X YER
const DEFAULT_RATES = { USD: 1554, SAR: 410, YER: 1 }
const BASE_CURRENCY = 'YER'
// Helper: convert amount to base (YER)
function toBase(amount, currency, rates) {
  const r = rates?.[currency]
  const rate = (r && typeof r === 'object') ? (Number(r.transfer) || 1) : (Number(r) || 1)
  return (Number(amount) || 0) * rate
}
function getTransferRate(rates, cur) {
  const r = rates?.[cur]
  if (r && typeof r === 'object') return Number(r.transfer) || 1
  return Number(r) || 1
}
const emptyBalances = () => ({ USD: 0, SAR: 0, YER: 0 })
const SESSION_DAYS = 14

// ================= Seeding =================
async function seedTenantDefaults(db, tenantId) {
  const acc = db.collection('accounts')
  const has = await acc.findOne({ tenant_id: tenantId })
  if (has) return
  const now = new Date()
  const t = tenantId
  await acc.insertMany([
    { id: uuidv4(), tenant_id: t, code: '1', name_ar: 'الأصول', type: 'asset', parent: null, is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '11', name_ar: 'الأصول المتداولة', type: 'asset', parent: '1', is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '1101', name_ar: 'صندوق دولار', type: 'asset', parent: '11', is_group: false, currency: 'USD', created_at: now },
    { id: uuidv4(), tenant_id: t, code: '1102', name_ar: 'صندوق ريال سعودي', type: 'asset', parent: '11', is_group: false, currency: 'SAR', created_at: now },
    { id: uuidv4(), tenant_id: t, code: '1103', name_ar: 'صندوق ريال يمني', type: 'asset', parent: '11', is_group: false, currency: 'YER', created_at: now },
    { id: uuidv4(), tenant_id: t, code: '1201', name_ar: 'حسابات بنكية / محافظ', type: 'asset', parent: '11', is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '1301', name_ar: 'العملاء (مدينون)', type: 'asset', parent: '11', is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '2', name_ar: 'الخصوم', type: 'liability', parent: null, is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '2101', name_ar: 'الموردون والوكلاء (دائنون)', type: 'liability', parent: '2', is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '4', name_ar: 'الإيرادات', type: 'revenue', parent: null, is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '4101', name_ar: 'إيرادات عمولات التذاكر', type: 'revenue', parent: '4', is_group: false, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '4102', name_ar: 'إيرادات عمولات التأشيرات والموافقات', type: 'revenue', parent: '4', is_group: false, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '4103', name_ar: 'إيرادات خدمات إضافية', type: 'revenue', parent: '4', is_group: false, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '4105', name_ar: 'رسوم إلغاء واسترداد', type: 'revenue', parent: '4', is_group: false, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '4104', name_ar: 'أرباح وخسائر فروق العملات (مصارفة)', type: 'revenue', parent: '4', is_group: false, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '5', name_ar: 'المصروفات', type: 'expense', parent: null, is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '5101', name_ar: 'مصاريف تشغيلية', type: 'expense', parent: '5', is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '5201', name_ar: 'فروق عملة وتسويات', type: 'expense', parent: '5', is_group: false, created_at: now },
  ])
  // v3.0 — Seed default dynamic service catalog for the Services module
  await db.collection('service_types').insertMany([
    { id: uuidv4(), tenant_id: t, name: 'حجز فندق', active: true, created_at: now },
    { id: uuidv4(), tenant_id: t, name: 'تصديق شهادات', active: true, created_at: now },
    { id: uuidv4(), tenant_id: t, name: 'خدمة نقل / ترحيل', active: true, created_at: now },
    { id: uuidv4(), tenant_id: t, name: 'خدمات متنوعة', active: true, created_at: now },
  ])
  await db.collection('boxes').insertMany([
    { id: uuidv4(), tenant_id: t, name_ar: 'الصندوق الرئيسي', type: 'cash', balances: emptyBalances(), created_at: new Date() },
    { id: uuidv4(), tenant_id: t, name_ar: 'حساب بنكي / محفظة', type: 'bank', balances: emptyBalances(), created_at: new Date() },
  ])
  await db.collection('tenant_settings').insertOne({
    id: uuidv4(), tenant_id: t,
    agency_name: '', logo_base64: '', header: '', footer: '', tax_id: '', commercial_id: '',
    phone: '', address: '', email: '', primary_color: '#1e3a8a',
    base_currency: BASE_CURRENCY,
    rates: {
      USD: { transfer: 1554, buy: 1550, sell: 1560, min: 1530, max: 1580, remarks: '' },
      SAR: { transfer: 410, buy: 408, sell: 412, min: 400, max: 420, remarks: '' },
      YER: { transfer: 1, buy: 1, sell: 1, min: 1, max: 1, remarks: 'العملة الأساسية' },
    },
    // Direct USD/SAR cross-conversion rates (bypass YER for direct exchanges)
    pair_usd_sar: { transfer: 3.75, buy: 3.74, sell: 3.76, remarks: 'سعر التحويل المباشر بين الدولار والريال السعودي' },
    updated_at: new Date(),
  })
}

// v3.4 — Employee permissions defaults (owner has all=true implicitly)
const DEFAULT_STAFF_PERMISSIONS = {
  tickets_view: true, tickets_add: true, tickets_edit: false, tickets_delete: false,
  visas_view: true, visas_add: true, visas_edit: false, visas_delete: false,
  services_view: true, services_add: true, services_edit: false, services_delete: false,
  reports_view: false, show_profit: false,
  vouchers_manage: false, accounts_manage: false,
  edit_price: false, apply_discount: false,
}
function ownerPermissions() {
  const p = {}
  for (const k of Object.keys(DEFAULT_STAFF_PERMISSIONS)) p[k] = true
  return p
}
function effectivePermissions(user) {
  if (!user) return DEFAULT_STAFF_PERMISSIONS
  if (user.role === 'owner') return ownerPermissions()
  return { ...DEFAULT_STAFF_PERMISSIONS, ...(user.permissions || {}) }
}

// v3.4 — Affiliate defaults
const AFFILIATE_COMMISSION_RATE = 0.10
const AFFILIATE_MIN_CASHOUT_INDIVIDUAL = 10
const AFFILIATE_MIN_CASHOUT_OFFICE = 50

async function seedInitial(db) {
  // Purge legacy data lacking tenant_id (from earlier MVP)
  for (const c of ['accounts', 'boxes', 'clients', 'suppliers', 'tickets', 'visas', 'vouchers', 'journal_entries', 'settings']) {
    await db.collection(c).deleteMany({ tenant_id: { $exists: false } }).catch(() => {})
  }

  // Migrate rate schema: flat number → { transfer, buy, sell, min, max, remarks }
  const allSettings = await db.collection('tenant_settings').find({}).toArray()
  for (const s of allSettings) {
    if (!s.rates) continue
    let needUpdate = false
    const newRates = {}
    for (const c of CURRENCIES) {
      const r = s.rates[c]
      if (typeof r === 'number' || !r || !r.transfer) {
        // Convert legacy or seed defaults per currency
        const def = DEFAULT_RATES[c]
        // If legacy value < 1 (old USD-base scheme) → invert or replace with new YER-base defaults
        newRates[c] = { transfer: def, buy: def * 0.997, sell: def * 1.003, min: def * 0.95, max: def * 1.05, remarks: c === 'YER' ? 'العملة الأساسية' : '' }
        needUpdate = true
      } else {
        newRates[c] = r
      }
    }
    if (needUpdate) await db.collection('tenant_settings').updateOne({ id: s.id }, { $set: { rates: newRates, base_currency: BASE_CURRENCY } })
  }

  // Migration: ensure FX 4104 account exists for every tenant
  const allTenants = await db.collection('tenants').find({}).toArray()
  for (const tn of allTenants) {
    const has = await db.collection('accounts').findOne({ tenant_id: tn.id, code: '4104' })
    if (!has) {
      await db.collection('accounts').insertOne({
        id: uuidv4(), tenant_id: tn.id, code: '4104',
        name_ar: 'أرباح وخسائر فروق العملات (مصارفة)',
        type: 'revenue', parent: '4', is_group: false, created_at: new Date(),
      })
    }
    // v3.5 — Backfill 4105 (refund fees) if missing
    const hasRefund = await db.collection('accounts').findOne({ tenant_id: tn.id, code: '4105' })
    if (!hasRefund) {
      await db.collection('accounts').insertOne({
        id: uuidv4(), tenant_id: tn.id, code: '4105',
        name_ar: 'رسوم إلغاء واسترداد',
        type: 'revenue', parent: '4', is_group: false, created_at: new Date(),
      })
    }
    if (!tn.journal_quota) {
      const usedCount = await db.collection('journal_entries').countDocuments({ tenant_id: tn.id })
      await db.collection('tenants').updateOne({ id: tn.id }, { $set: { journal_quota: { used: usedCount, limit: 500, top_ups: [] } } })
    }
    // v3.0 — Backfill default service_types for existing tenants
    const stCount = await db.collection('service_types').countDocuments({ tenant_id: tn.id })
    if (stCount === 0) {
      const now = new Date()
      await db.collection('service_types').insertMany([
        { id: uuidv4(), tenant_id: tn.id, name: 'حجز فندق', active: true, created_at: now },
        { id: uuidv4(), tenant_id: tn.id, name: 'تصديق شهادات', active: true, created_at: now },
        { id: uuidv4(), tenant_id: tn.id, name: 'خدمة نقل / ترحيل', active: true, created_at: now },
        { id: uuidv4(), tenant_id: tn.id, name: 'خدمات متنوعة', active: true, created_at: now },
      ])
    }
  }

  // Super Admin bootstrap
  const admins = db.collection('users')
  const superAdmin = await admins.findOne({ role: 'super_admin' })
  if (!superAdmin) {
    await admins.insertOne({
      id: uuidv4(), tenant_id: null, email: 'admin@targetmedia.com', name: 'Target Media Admin',
      role: 'super_admin', active: true,
      password_hash: bcrypt.hashSync('Target@2025', 8),
      created_at: new Date(),
    })
  }

  // Demo tenant
  const tenants = db.collection('tenants')
  let demo = await tenants.findOne({ slug: 'demo' })
  if (!demo) {
    demo = {
      id: uuidv4(), slug: 'demo', name: 'مكتب الرحّال التجريبي',
      status: 'active', max_users: 5, max_branches: 1,
      subscription: 'trial',
      created_at: new Date(),
    }
    await tenants.insertOne(demo)
  }
  const owner = await admins.findOne({ email: 'owner@demo.com' })
  if (!owner) {
    await admins.insertOne({
      id: uuidv4(), tenant_id: demo.id, email: 'owner@demo.com', name: 'مالك المكتب التجريبي',
      role: 'owner', active: true,
      password_hash: bcrypt.hashSync('Demo@2025', 8),
      created_at: new Date(),
    })
  }
  await seedTenantDefaults(db, demo.id)

  // Backfill referral codes for any existing tenants missing one
  const missingRef = await tenants.find({ $or: [{ referral_code: { $exists: false } }, { referral_code: null }] }).toArray()
  for (const t of missingRef) await ensureReferralCode(db, t.id)

  // v2.8 — Seed default subscription plans if none exist
  const plans = db.collection('subscription_plans')
  if (!(await plans.countDocuments())) {
    await plans.insertMany([
      { id: 'voucher_pack_500', name: 'باقة قيود إضافية', description: '500 قيد إضافي — إضافة فورية للحصة الحالية', price_usd: 50, vouchers: 500, kind: 'topup', active: true, updated_at: new Date() },
      { id: 'gold_monthly', name: 'Gold — شهري', description: 'قيود غير محدودة + إنشاء ذاتي لفروع ومستخدمين — شهر واحد', price_usd: 150, vouchers: 100000, plan_tier: 'gold', duration_days: 30, kind: 'subscription', active: true, updated_at: new Date() },
      { id: 'gold_annual', name: 'Gold — سنوي', description: 'قيود غير محدودة + إنشاء ذاتي لفروع ومستخدمين — سنة كاملة (توفير شهرين)', price_usd: 1500, vouchers: 100000, plan_tier: 'gold', duration_days: 365, kind: 'subscription', active: true, updated_at: new Date() },
    ])
  }
}

// ================= CORS =================
function cors(res, extra = {}) {
  res.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.headers.set('Access-Control-Allow-Credentials', 'true')
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v)
  return res
}
export async function OPTIONS() { return cors(new NextResponse(null, { status: 200 })) }
const ok = (d, cookie) => cors(NextResponse.json(d), cookie ? { 'Set-Cookie': cookie } : {})
const bad = (m, s = 400) => cors(NextResponse.json({ error: m }, { status: s }))
const clean = (arr) => arr.map(({ _id, ...r }) => r)

// ================= Session =================
async function getSession(request, db) {
  const cookie = request.headers.get('cookie') || ''
  const m = cookie.match(/rahaal_session=([^;]+)/)
  if (!m) return null
  const session = await db.collection('sessions').findOne({ id: m[1] })
  if (!session) return null
  if (new Date(session.expires_at) < new Date()) return null
  const user = await db.collection('users').findOne({ id: session.user_id })
  if (!user || !user.active) return null
  let tenant = null
  if (user.tenant_id) tenant = await db.collection('tenants').findOne({ id: user.tenant_id })
  if (tenant && tenant.status !== 'active') return { session, user, tenant, blocked: true }
  return { 
    session, user, tenant, 
    impersonation: !!session.impersonation, 
    impersonated_by_email: session.impersonated_by_email 
  }
}
// v3.8 — PAT (Personal Access Token) helpers for Chrome Extension
function hashPat(token) { return crypto.createHash('sha256').update(token).digest('hex') }
function generatePat() {
  // rhl_pat_<32 hex chars> (128-bit entropy)
  const raw = crypto.randomBytes(24).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 32).padEnd(32, 'x')
  return `rhl_pat_${raw}`
}
async function getPatSession(request, db) {
  // Support Authorization: Bearer <pat> for Chrome Extension / API clients
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(rhl_pat_[A-Za-z0-9]+)$/i)
  if (!m) return null
  const token = m[1]
  const hash = hashPat(token)
  const pat = await db.collection('pats').findOne({ token_hash: hash, revoked_at: null })
  if (!pat) return null
  const user = await db.collection('users').findOne({ id: pat.user_id })
  if (!user || !user.active) return null
  let tenant = null
  if (user.tenant_id) tenant = await db.collection('tenants').findOne({ id: user.tenant_id })
  if (tenant && tenant.status !== 'active') return { pat, user, tenant, blocked: true }
  // Update last-used timestamp (fire-and-forget)
  db.collection('pats').updateOne({ id: pat.id }, { $set: { last_used_at: new Date() } }).catch(() => {})
  return { pat, user, tenant, isPat: true }
}
function sanitizeUser(u) { return { id: u.id, email: u.email, name: u.name, role: u.role, tenant_id: u.tenant_id, active: u.active, default_box_id: u.default_box_id || null, lock_box: !!u.lock_box, permissions: u.role === 'owner' ? ownerPermissions() : { ...DEFAULT_STAFF_PERMISSIONS, ...(u.permissions || {}) } } }
function sanitizeTenant(t) { return t ? { id: t.id, name: t.name, slug: t.slug, status: t.status, max_users: t.max_users, max_branches: t.max_branches, referral_code: t.referral_code, referred_by: t.referred_by, plan_tier: t.plan_tier || 'standard', subscription: t.subscription, subscription_expires_at: t.subscription_expires_at, subscription_price: t.subscription_price } : null }

// Referral helpers
function genReferralCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let s = ''; for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}
async function ensureReferralCode(db, tenantId) {
  const t = await db.collection('tenants').findOne({ id: tenantId })
  if (!t) return null
  if (t.referral_code) return t.referral_code
  let code
  do { code = genReferralCode() } while (await db.collection('tenants').findOne({ referral_code: code }))
  await db.collection('tenants').updateOne({ id: tenantId }, { $set: { referral_code: code, referral_stats: t.referral_stats || { signups: 0, activations: 0, bonus_earned: 0 } } })
  return code
}

// ================= Helpers =================
async function updateBalance(db, col, filter, currency, delta) {
  await db.collection(col).updateOne(filter, { $inc: { [`balances.${currency}`]: delta } })
}
async function createJournalEntry(db, tenantId, { date, description, ref_type, ref_id, currency, lines }, opts = {}) {
  // Enforce quota (skipped in edit mode)
  if (!opts.skipQuota) {
    const t = await db.collection('tenants').findOne({ id: tenantId })
    const q = t?.journal_quota || { used: 0, limit: 500 }
    if (q.used >= q.limit) {
      const err = new Error(`انتهت حصة قيود اليومية (${q.used}/${q.limit}). يرجى تجديد الاشتراك مع الإدارة العامة.`)
      err.code = 'QUOTA_EXCEEDED'
      throw err
    }
  }
  const je = { id: opts.existingJeId || uuidv4(), tenant_id: tenantId, date: new Date(date || Date.now()), description, ref_type, ref_id, currency, lines, created_at: opts.createdAt || new Date() }
  await db.collection('journal_entries').insertOne(je)
  if (!opts.skipQuota) await db.collection('tenants').updateOne({ id: tenantId }, { $inc: { 'journal_quota.used': 1 } })
  return je
}

// ============ EDIT/REVERSAL ENGINE ============
// Reverses balance updates for a transactional record. Used before re-applying edited values or deleting.
async function reverseTransactionEffects(db, T, kind, doc) {
  if (kind === 'tickets' || kind === 'visas' || kind === 'services') {
    if (doc.payment_method === 'cash' && doc.box_id) {
      await updateBalance(db, 'boxes', { id: doc.box_id, tenant_id: T }, doc.currency, -doc.sale_price)
    } else {
      await updateBalance(db, 'clients', { id: doc.client_id, tenant_id: T }, doc.currency, -doc.sale_price)
    }
    await updateBalance(db, 'suppliers', { id: doc.supplier_id, tenant_id: T }, doc.currency, -doc.cost)
  } else if (kind === 'vouchers') {
    if (doc.type === 'receipt') {
      await updateBalance(db, 'boxes', { id: doc.box_id, tenant_id: T }, doc.currency, -doc.amount)
      if (doc.party_type === 'client') await updateBalance(db, 'clients', { id: doc.party_id, tenant_id: T }, doc.currency, +doc.amount)
      if (doc.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: doc.party_id, tenant_id: T }, doc.currency, -doc.amount)
    } else {
      await updateBalance(db, 'boxes', { id: doc.box_id, tenant_id: T }, doc.currency, +doc.amount)
      if (doc.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: doc.party_id, tenant_id: T }, doc.currency, -doc.amount)
      if (doc.party_type === 'client') await updateBalance(db, 'clients', { id: doc.party_id, tenant_id: T }, doc.currency, +doc.amount)
    }
  } else if (kind === 'fx') {
    // Use stored refs (falls back to box_currency_id for pre-v2.6 records)
    const refCur = doc.currency_ref || { kind: 'box', id: doc.box_currency_id }
    const refCounter = doc.counter_ref || { kind: 'box', id: doc.box_counter_id }
    const accCur = await resolveAccountRef(db, T, refCur)
    const accCounter = await resolveAccountRef(db, T, refCounter)
    const debitAmtCur = doc.type === 'buy' ? doc.amount : -doc.amount
    const debitAmtCounter = doc.type === 'buy' ? -doc.counter_amount : doc.counter_amount
    if (accCur && accCur.updateBalance) {
      await updateBalance(db, accCur.collection, { id: accCur.id, tenant_id: T }, doc.currency, -debitAmtCur * accCur.debitSign)
    }
    if (accCounter && accCounter.updateBalance) {
      await updateBalance(db, accCounter.collection, { id: accCounter.id, tenant_id: T }, doc.counter_currency, -debitAmtCounter * accCounter.debitSign)
    }
  }
}

// Reverses party balance updates that were applied at the moment a manual JE was inserted.
async function reverseManualJournalEffects(db, T, je) {
  const isMulti = je.currency === 'MULTI' || je.ref_type === 'manual_dual'
  if (isMulti) {
    // For dual journal: original updates only applied to the two sides (first two lines) via party_type
    for (const l of (je.lines || []).slice(0, 2)) {
      const cur = l.currency
      const debit = Number(l.debit) || 0, credit = Number(l.credit) || 0
      const amt = debit > 0 ? debit : credit
      const side = debit > 0 ? 'debit' : 'credit'
      if (!cur || !l.party_id) continue
      if (l.party_type === 'client') await updateBalance(db, 'clients', { id: l.party_id, tenant_id: T }, cur, side === 'debit' ? -amt : +amt)
      if (l.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: l.party_id, tenant_id: T }, cur, side === 'debit' ? +amt : -amt)
      if (l.party_type === 'box') await updateBalance(db, 'boxes', { id: l.party_id, tenant_id: T }, cur, side === 'debit' ? -amt : +amt)
    }
  } else {
    for (const l of je.lines || []) {
      const debit = Number(l.debit) || 0, credit = Number(l.credit) || 0
      const delta = debit - credit
      const cur = l.currency || je.currency
      if (!l.party_id) continue
      if (l.party_type === 'client') await updateBalance(db, 'clients', { id: l.party_id, tenant_id: T }, cur, -delta)
      if (l.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: l.party_id, tenant_id: T }, cur, +delta)
      if (l.party_type === 'box') await updateBalance(db, 'boxes', { id: l.party_id, tenant_id: T }, cur, -delta)
    }
  }
}
async function ensurePartyByName(db, tenantId, coll, name) {
  if (!name) return null
  const trimmed = String(name).trim()
  if (!trimmed) return null
  let doc = await db.collection(coll).findOne({ tenant_id: tenantId, name: trimmed })
  if (!doc) {
    doc = { id: uuidv4(), tenant_id: tenantId, name: trimmed, phone: '', notes: 'أنشئ تلقائياً', balances: emptyBalances(), created_at: new Date() }
    await db.collection(coll).insertOne(doc)
  }
  return doc
}

// ================= Router =================
async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method
  const url = new URL(request.url)
  const q = Object.fromEntries(url.searchParams.entries())

  try {
    const db = await connectToMongo()

    // Health
    if (route === '/' || route === '/root') return ok({ ok: true, app: 'Rahaal ERP', version: '2.0-saas' })

    // ============ HEALTH CHECK (public, no auth — for uptime monitors) ============
    if (route === '/health' && method === 'GET') {
      try {
        // Confirm DB is reachable
        await db.command({ ping: 1 })
        return ok({
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime_sec: Math.floor(process.uptime()),
          service: 'rahaal-erp',
          version: '3.9.17',
          db: 'connected',
        })
      } catch (e) {
        return NextResponse.json({ status: 'degraded', error: e.message, timestamp: new Date().toISOString() }, { status: 503 })
      }
    }

    // ============ PUBLIC SIGNUP (no auth) ============
    if (route === '/public/signup' && method === 'POST') {
      const b = await request.json()
      if (!b.name || !b.owner_email || !b.owner_password || !b.owner_name) return bad('الاسم الكامل، اسم المكتب، البريد وكلمة المرور مطلوبة')
      const email = String(b.owner_email).toLowerCase().trim()
      // v3.9 — Restrict signup to real Gmail addresses to prevent fake/duplicate accounts.
      // (Full Google OAuth verification will be added later; this is the interim enforcement.)
      if (!/^[a-z0-9._%+-]+@gmail\.com$/.test(email)) {
        return bad('يجب استخدام بريد Gmail حقيقي فقط (@gmail.com). سيتم دعم تسجيل الدخول بحساب Google قريباً.')
      }
      // Also block +alias patterns to prevent duplicate signups from same Gmail (Gmail treats a+b@gmail = a@gmail)
      if (email.includes('+')) return bad('بريد Gmail يجب أن يكون بدون رمز + (بدون aliases)')
      if (await db.collection('users').findOne({ email })) return bad('البريد الإلكتروني مستخدم بالفعل')
      const slug = (b.slug || b.name).toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40) + '-' + uuidv4().slice(0, 4)
      let referredBy = null
      if (b.referral_code) {
        const ref = await db.collection('tenants').findOne({ referral_code: String(b.referral_code).toUpperCase().trim() })
        if (ref) referredBy = ref.id
      }
      const myCode = genReferralCode()
      const tenant = {
        id: uuidv4(), slug, name: b.name, status: 'active',
        max_users: 2, max_branches: 1, subscription: 'trial',
        plan_tier: 'standard', // v2.8 default tier (standard | silver | bronze | gold)
        journal_quota: { used: 0, limit: 30, top_ups: [] }, // v2.8 — 30 free entries on signup (was 500)
        referral_code: myCode, referred_by: referredBy,
        referral_stats: { signups: 0, activations: 0, bonus_earned: 0 },
        activation_confirmed: false,
        created_at: new Date(),
      }
      await db.collection('tenants').insertOne(tenant)
      if (referredBy) {
        // v3.9 — Only TRACK the signup; the +50 quota bonus is granted later when
        // super admin activates the paid subscription (see /subscriptions PATCH → paid state).
        await db.collection('tenants').updateOne(
          { id: referredBy },
          {
            $inc: { 'referral_stats.signups': 1 },
            $push: { 'referral_stats.pending_referrals': { referred_tenant: tenant.id, referred_at: new Date(), bonus_amount: 50, paid: false } }
          }
        )
      }
      const userId = uuidv4()
      await db.collection('users').insertOne({
        id: userId, tenant_id: tenant.id, email, name: b.owner_name,
        role: 'owner', active: true,
        password_hash: bcrypt.hashSync(b.owner_password, 8),
        created_at: new Date(),
      })
      await seedTenantDefaults(db, tenant.id)
      // Auto-login
      const sid = uuidv4()
      const expires = new Date(Date.now() + SESSION_DAYS * 86400000)
      await db.collection('sessions').insertOne({ id: sid, user_id: userId, expires_at: expires, created_at: new Date() })
      const cookie = `rahaal_session=${sid}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax`
      return ok({ tenant: { ...sanitizeTenant(tenant), journal_quota: tenant.journal_quota }, referral_applied: !!referredBy }, cookie)
    }

    // ============ AUTH ============
    if (route === '/auth/login' && method === 'POST') {
      const b = await request.json()
      if (!b.email || !b.password) return bad('البريد وكلمة المرور مطلوبان')
      const user = await db.collection('users').findOne({ email: String(b.email).toLowerCase().trim() })
      if (!user || !user.active) return bad('بيانات الدخول غير صحيحة', 401)
      const okpw = bcrypt.compareSync(b.password, user.password_hash)
      if (!okpw) return bad('بيانات الدخول غير صحيحة', 401)
      if (user.tenant_id) {
        const t = await db.collection('tenants').findOne({ id: user.tenant_id })
        if (!t || t.status !== 'active') return bad('تم إيقاف المكتب — تواصل مع الإدارة', 403)
      }
      const sid = uuidv4()
      const expires = new Date(Date.now() + SESSION_DAYS * 86400000)
      await db.collection('sessions').insertOne({ id: sid, user_id: user.id, expires_at: expires, created_at: new Date() })
      const cookie = `rahaal_session=${sid}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax`
      return ok({ user: sanitizeUser(user), tenant: user.tenant_id ? sanitizeTenant(await db.collection('tenants').findOne({ id: user.tenant_id })) : null }, cookie)
    }

    if (route === '/auth/logout' && method === 'POST') {
      const c = request.headers.get('cookie') || ''
      const m = c.match(/rahaal_session=([^;]+)/)
      if (m) await db.collection('sessions').deleteOne({ id: m[1] })
      const cookie = `rahaal_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
      return ok({ ok: true }, cookie)
    }

    // Everything below requires session (except /auth/me which returns null gracefully)
    // v3.8 — Support Bearer PAT auth in addition to cookie session (for Chrome Extension / API clients)
    let sess = await getSession(request, db)
    if (!sess) {
      const patSess = await getPatSession(request, db)
      if (patSess) sess = patSess
    }

    if (route === '/auth/me' && method === 'GET') {
      if (!sess) return ok({ user: null, tenant: null })
      if (sess.blocked) return ok({ user: null, tenant: null, error: 'suspended' })
      let tenantSettings = null
      if (sess.tenant) tenantSettings = await db.collection('tenant_settings').findOne({ tenant_id: sess.tenant.id })
      const quota = sess.tenant?.journal_quota || null
      return ok({
        user: sanitizeUser(sess.user),
        tenant: sess.tenant ? { ...sanitizeTenant(sess.tenant), journal_quota: quota } : null,
        settings: tenantSettings ? { ...tenantSettings, _id: undefined } : null,
        impersonation: !!sess.impersonation,
        impersonated_by: sess.impersonation ? sess.impersonated_by_email : null,
      })
    }

    if (!sess || sess.blocked) return bad('يجب تسجيل الدخول', 401)

    // ============ SUPER ADMIN ============
    if (route.startsWith('/admin/')) {
      if (sess.user.role !== 'super_admin') return bad('غير مصرح', 403)

      if (route === '/admin/tenants' && method === 'GET') {
        const tenants = await db.collection('tenants').find({}).sort({ created_at: -1 }).toArray()
        // Include user counts
        const users = await db.collection('users').find({ role: { $ne: 'super_admin' } }).toArray()
        const usersByTenant = {}
        for (const u of users) usersByTenant[u.tenant_id] = (usersByTenant[u.tenant_id] || 0) + 1
        const [tCount, vCount] = await Promise.all([
          db.collection('tickets').countDocuments(),
          db.collection('visas').countDocuments(),
        ])
        return ok({
          tenants: tenants.map(t => ({ ...t, _id: undefined, users_count: usersByTenant[t.id] || 0 })),
          global_stats: { tenants: tenants.length, tickets: tCount, visas: vCount },
        })
      }

      if (route === '/admin/tenants' && method === 'POST') {
        const b = await request.json()
        if (!b.name || !b.owner_email || !b.owner_password) return bad('الاسم وبيانات المالك مطلوبة')
        const slug = (b.slug || b.name).toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40) + '-' + uuidv4().slice(0, 4)
        const existingUser = await db.collection('users').findOne({ email: String(b.owner_email).toLowerCase().trim() })
        if (existingUser) return bad('البريد الإلكتروني مستخدم بالفعل')
        // Resolve referrer if code provided
        let referredBy = null
        if (b.referral_code) {
          const ref = await db.collection('tenants').findOne({ referral_code: String(b.referral_code).toUpperCase().trim() })
          if (!ref) return bad('رمز الإحالة غير صحيح')
          referredBy = ref.id
        }
        const myCode = genReferralCode()
        const tenant = {
          id: uuidv4(), slug, name: b.name, status: 'active',
          max_users: Number(b.max_users) || 2, max_branches: Number(b.max_branches) || 1,
          subscription: b.subscription || 'trial',
          plan_tier: b.plan_tier || 'standard',
          journal_quota: { used: 0, limit: Number(b.quota_limit) || 30, top_ups: [] },
          referral_code: myCode,
          referred_by: referredBy,
          referral_stats: { signups: 0, activations: 0, bonus_earned: 0 },
          activation_confirmed: false,
          subscription_expires_at: b.subscription_expires_at ? new Date(b.subscription_expires_at) : null,
          subscription_price: Number(b.subscription_price) || 0,
          created_at: new Date(),
        }
        await db.collection('tenants').insertOne(tenant)
        // Reward referrer with +50 free entries on signup (v2.8 simplified)
        if (referredBy) {
          await db.collection('tenants').updateOne(
            { id: referredBy },
            {
              $inc: { 'journal_quota.limit': 50, 'referral_stats.signups': 1, 'referral_stats.bonus_earned': 50 },
              $push: { 'journal_quota.top_ups': { amount: 50, date: new Date(), by: 'referral_signup', referred_tenant: tenant.id } }
            }
          )
        }
        await db.collection('users').insertOne({
          id: uuidv4(), tenant_id: tenant.id, email: String(b.owner_email).toLowerCase().trim(),
          name: b.owner_name || 'مالك المكتب', role: 'owner', active: true,
          password_hash: bcrypt.hashSync(b.owner_password, 8),
          created_at: new Date(),
        })
        await seedTenantDefaults(db, tenant.id)
        return ok({ ...tenant, _id: undefined })
      }

      // Confirm payment activation (grants +50 to referrer)
      const confirmMatch = route.match(/^\/admin\/tenants\/([^/]+)\/confirm-payment$/)
      if (confirmMatch && method === 'POST') {
        const tid = confirmMatch[1]
        const t = await db.collection('tenants').findOne({ id: tid })
        if (!t) return bad('المكتب غير موجود', 404)
        if (t.activation_confirmed) return bad('تم تأكيد الدفع لهذا المكتب من قبل')
        await db.collection('tenants').updateOne({ id: tid }, { $set: { activation_confirmed: true, activation_confirmed_at: new Date(), subscription: 'paid' } })
        let referrerBonus = null
        if (t.referred_by) {
          // v3.9 — grant referrer +50 quota ONLY when the referred tenant confirms actual payment
          await db.collection('tenants').updateOne(
            { id: t.referred_by },
            {
              $inc: { 'journal_quota.limit': 50, 'referral_stats.activations': 1, 'referral_stats.bonus_earned': 50 },
              $push: { 'journal_quota.top_ups': { amount: 50, date: new Date(), by: 'referral_activation', referred_tenant: tid } }
            }
          )
          // Also mark the pending_referrals entry as paid
          await db.collection('tenants').updateOne(
            { id: t.referred_by, 'referral_stats.pending_referrals.referred_tenant': tid },
            { $set: { 'referral_stats.pending_referrals.$.paid': true, 'referral_stats.pending_referrals.$.paid_at': new Date() } }
          )
          const ref = await db.collection('tenants').findOne({ id: t.referred_by })
          referrerBonus = { referrer_id: ref.id, referrer_name: ref.name, bonus_added: 50 }
        }
        return ok({ success: true, referrer_bonus: referrerBonus })
      }

      const tenantIdMatch = route.match(/^\/admin\/tenants\/([^/]+)$/)
      if (tenantIdMatch) {
        const tid = tenantIdMatch[1]
        if (method === 'PATCH') {
          const b = await request.json()
          const upd = {}
          if (b.status) upd.status = b.status
          if (b.name) upd.name = b.name
          if (b.max_users !== undefined) upd.max_users = b.max_users === null ? null : Number(b.max_users)
          if (b.max_branches !== undefined) upd.max_branches = b.max_branches === null ? null : Number(b.max_branches)
          if (b.quota_limit !== undefined) upd['journal_quota.limit'] = Number(b.quota_limit)
          if (b.plan_tier !== undefined) upd.plan_tier = b.plan_tier
          if (b.subscription !== undefined) upd.subscription = b.subscription
          if (b.subscription_price !== undefined) upd.subscription_price = Number(b.subscription_price) || 0
          if (b.subscription_expires_at !== undefined) upd.subscription_expires_at = b.subscription_expires_at ? new Date(b.subscription_expires_at) : null
          await db.collection('tenants').updateOne({ id: tid }, { $set: upd })
          // Top-up quota
          if (b.top_up_amount) {
            const amt = Number(b.top_up_amount) || 0
            if (amt > 0) {
              await db.collection('tenants').updateOne(
                { id: tid },
                {
                  $inc: { 'journal_quota.limit': amt },
                  $push: { 'journal_quota.top_ups': { amount: amt, date: new Date(), by: sess.user.email, note: b.top_up_note || 'manual top-up' } }
                }
              )
            }
          }
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await db.collection('tenants').deleteOne({ id: tid })
          for (const c of ['users', 'accounts', 'boxes', 'clients', 'suppliers', 'tickets', 'visas', 'services', 'service_types', 'vouchers', 'journal_entries', 'tenant_settings', 'currency_exchanges']) {
            await db.collection(c).deleteMany({ tenant_id: tid })
          }
          return ok({ success: true })
        }
      }

      // v2.8 — Suspend / Activate tenant
      const toggleMatch = route.match(/^\/admin\/tenants\/([^/]+)\/toggle-status$/)
      if (toggleMatch && method === 'POST') {
        const tid = toggleMatch[1]
        const t = await db.collection('tenants').findOne({ id: tid })
        if (!t) return bad('المكتب غير موجود', 404)
        const newStatus = t.status === 'suspended' ? 'active' : 'suspended'
        await db.collection('tenants').updateOne({ id: tid }, { $set: { status: newStatus, status_changed_at: new Date() } })
        return ok({ success: true, status: newStatus })
      }

      // v3.9.17 — Top-up: add journal-entries credits to tenant quota (Admin/Super Admin only)
      const topupMatch = route.match(/^\/admin\/tenants\/([^/]+)\/topup$/)
      if (topupMatch && method === 'POST') {
        const tid = topupMatch[1]
        const t = await db.collection('tenants').findOne({ id: tid })
        if (!t) return bad('المكتب غير موجود', 404)
        const b = await request.json()
        const amount = parseInt(b.amount)
        if (!amount || amount <= 0 || amount > 1000000) return bad('المبلغ يجب أن يكون بين 1 و 1,000,000 قيد')
        const note = String(b.note || '').slice(0, 200)
        const currentLimit = t.journal_quota?.limit || 500
        const newLimit = currentLimit + amount
        await db.collection('tenants').updateOne({ id: tid }, {
          $set: { 'journal_quota.limit': newLimit, 'journal_quota.last_topup_at': new Date() },
          $push: { 'wallet.topups': { amount, note, at: new Date(), by: sess.user.email } },
        })
        return ok({ success: true, tenant_id: tid, added: amount, new_limit: newLimit, prev_limit: currentLimit, note })
      }

      // v3.9.17 — Reset password for the tenant's owner (Admin/Super Admin only)
      const resetPwdMatch = route.match(/^\/admin\/tenants\/([^/]+)\/reset-password$/)
      if (resetPwdMatch && method === 'POST') {
        const tid = resetPwdMatch[1]
        const t = await db.collection('tenants').findOne({ id: tid })
        if (!t) return bad('المكتب غير موجود', 404)
        const owner = await db.collection('users').findOne({ tenant_id: tid, role: 'owner' })
        if (!owner) return bad('لا يوجد مالك لهذا المكتب', 404)
        const b = await request.json().catch(() => ({}))
        // Accept a provided password OR auto-generate a strong 10-char password
        let newPassword = String(b.new_password || '').trim()
        if (!newPassword) {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
          newPassword = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
        }
        if (newPassword.length < 6) return bad('كلمة السر يجب أن تكون 6 أحرف على الأقل')
        await db.collection('users').updateOne({ id: owner.id }, {
          $set: { password_hash: bcrypt.hashSync(newPassword, 8), password_reset_at: new Date(), password_reset_by: sess.user.email },
        })
        // Invalidate all existing sessions for this owner (force re-login)
        await db.collection('sessions').deleteMany({ user_id: owner.id })
        return ok({ success: true, tenant_id: tid, owner_email: owner.email, new_password: newPassword, note: 'تم إبطال جميع الجلسات السابقة — على المالك تسجيل الدخول مجدداً' })
      }

      // v2.8 — Impersonate: super admin logs in as tenant (30-min session)
      const imperMatch = route.match(/^\/admin\/tenants\/([^/]+)\/impersonate$/)
      if (imperMatch && method === 'POST') {
        const tid = imperMatch[1]
        const t = await db.collection('tenants').findOne({ id: tid })
        if (!t) return bad('المكتب غير موجود', 404)
        // Find the tenant's owner
        const owner = await db.collection('users').findOne({ tenant_id: tid, role: 'owner', active: true })
        if (!owner) return bad('لا يوجد مالك نشط لهذا المكتب', 404)
        // Create a short-lived impersonation session
        const sid = uuidv4()
        const expires = new Date(Date.now() + 30 * 60000) // 30 minutes
        await db.collection('sessions').insertOne({
          id: sid, user_id: owner.id,
          impersonation: true,
          impersonated_by_id: sess.user.id,
          impersonated_by_email: sess.user.email,
          expires_at: expires, created_at: new Date(),
        })
        return ok({ session_id: sid, expires_at: expires, tenant: sanitizeTenant(t), user: sanitizeUser(owner) })
      }

      // v2.8 — Subscription plan config (voucher pack + gold monthly + gold annual)
      if (route === '/admin/plans' && method === 'GET') {
        const plans = await db.collection('subscription_plans').find({}).toArray()
        return ok(plans.map(p => ({ ...p, _id: undefined })))
      }
      if (route === '/admin/plans' && method === 'PUT') {
        const b = await request.json()
        if (!b.id) return bad('id مطلوب')
        await db.collection('subscription_plans').updateOne({ id: b.id }, { $set: { ...b, updated_at: new Date() } }, { upsert: true })
        return ok({ success: true })
      }

      // v2.8 — Announcements CRUD (popup + banner)
      if (route === '/admin/announcements' && method === 'GET') {
        const list = await db.collection('announcements').find({}).sort({ created_at: -1 }).toArray()
        return ok(list.map(a => ({ ...a, _id: undefined })))
      }
      if (route === '/admin/announcements' && method === 'POST') {
        const b = await request.json()
        const doc = {
          id: uuidv4(),
          type: b.type || 'popup', // 'popup' | 'banner'
          title: b.title || '',
          body: b.body || '',
          image_url: b.image_url || '',
          link_url: b.link_url || '',
          active: b.active !== false,
          starts_at: b.starts_at ? new Date(b.starts_at) : null,
          ends_at: b.ends_at ? new Date(b.ends_at) : null,
          created_by: sess.user.email,
          created_at: new Date(),
        }
        await db.collection('announcements').insertOne(doc)
        return ok({ ...doc, _id: undefined })
      }
      const annMatch = route.match(/^\/admin\/announcements\/([^/]+)$/)
      if (annMatch && method === 'PUT') {
        const id = annMatch[1]
        const b = await request.json()
        const upd = {}
        for (const k of ['type', 'title', 'body', 'image_url', 'link_url', 'active']) if (b[k] !== undefined) upd[k] = b[k]
        if (b.starts_at !== undefined) upd.starts_at = b.starts_at ? new Date(b.starts_at) : null
        if (b.ends_at !== undefined) upd.ends_at = b.ends_at ? new Date(b.ends_at) : null
        upd.updated_at = new Date()
        await db.collection('announcements').updateOne({ id }, { $set: upd })
        return ok({ success: true })
      }
      if (annMatch && method === 'DELETE') {
        await db.collection('announcements').deleteOne({ id: annMatch[1] })
        return ok({ success: true })
      }

      return bad(`Admin route ${route} not found`, 404)
    }

    // ============ TENANT-SCOPED ============
    if (!sess.tenant) return bad('لا يوجد مكتب مرتبط بحسابك', 403)
    const T = sess.tenant.id
    const tf = { tenant_id: T }

    // Tenant Settings
    if (route === '/tenant/settings' && method === 'GET') {
      const s = await db.collection('tenant_settings').findOne(tf)
      return ok(s ? { ...s, _id: undefined } : {})
    }
    if (route === '/tenant/settings' && method === 'PUT') {
      if (sess.user.role !== 'owner' && sess.user.role !== 'super_admin') return bad('غير مصرح', 403)
      const b = await request.json()
      const allowed = ['agency_name', 'logo_base64', 'header', 'footer', 'tax_id', 'commercial_id', 'phone', 'address', 'email', 'primary_color', 'rates', 'pair_usd_sar']
      const upd = { updated_at: new Date() }
      for (const k of allowed) if (b[k] !== undefined) upd[k] = b[k]
      await db.collection('tenant_settings').updateOne(tf, { $set: upd }, { upsert: true })
      return ok({ success: true })
    }

    // Tenant Users
    if (route === '/tenant/users' && method === 'GET') {
      if (sess.user.role !== 'owner') return bad('غير مصرح', 403)
      const users = await db.collection('users').find(tf).sort({ created_at: 1 }).toArray()
      return ok(users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, created_at: u.created_at, default_box_id: u.default_box_id || null, lock_box: !!u.lock_box, permissions: u.role === 'owner' ? ownerPermissions() : { ...DEFAULT_STAFF_PERMISSIONS, ...(u.permissions || {}) } })))
    }
    if (route === '/tenant/users' && method === 'POST') {
      if (sess.user.role !== 'owner') return bad('غير مصرح', 403)
      const b = await request.json()
      if (!b.email || !b.password || !b.name) return bad('الحقول مطلوبة')
      // v2.8 — Plan tier gate: only Gold plan tenants can self-create users
      const tenantFull = await db.collection('tenants').findOne({ id: T })
      const tier = tenantFull?.plan_tier || 'standard'
      if (tier !== 'gold') {
        return bad('إنشاء المستخدمين الذاتي متاح لباقة Gold فقط. تواصل مع الإدارة العامة لترقية الباقة.', 403)
      }
      const count = await db.collection('users').countDocuments(tf)
      const maxUsers = sess.tenant.max_users
      if (maxUsers !== null && maxUsers !== undefined && count >= maxUsers) return bad(`تم الوصول إلى الحد الأقصى للمستخدمين (${maxUsers}). تواصل مع الإدارة لرفع الحد.`)
      if (await db.collection('users').findOne({ email: String(b.email).toLowerCase().trim() })) return bad('البريد مستخدم بالفعل')
      const doc = {
        id: uuidv4(), tenant_id: T, email: String(b.email).toLowerCase().trim(), name: b.name,
        role: b.role || 'staff', active: true, password_hash: bcrypt.hashSync(b.password, 8),
        // v3.4 — Default limited permissions on new employees
        permissions: b.permissions ? { ...DEFAULT_STAFF_PERMISSIONS, ...b.permissions } : { ...DEFAULT_STAFF_PERMISSIONS },
        // v3.9.9 — Optional default cash box + lock flag for the employee/cashier
        default_box_id: b.default_box_id || null,
        lock_box: !!b.lock_box,
        created_at: new Date(),
      }
      await db.collection('users').insertOne(doc)
      return ok({ id: doc.id, email: doc.email, name: doc.name, role: doc.role, active: doc.active, permissions: doc.permissions, default_box_id: doc.default_box_id, lock_box: doc.lock_box })
    }
    const userIdMatch = route.match(/^\/tenant\/users\/([^/]+)$/)
    if (userIdMatch && method === 'PATCH') {
      if (sess.user.role !== 'owner') return bad('غير مصرح', 403)
      const b = await request.json()
      const upd = {}
      if (b.active !== undefined) upd.active = !!b.active
      if (b.role) upd.role = b.role
      if (b.name) upd.name = b.name
      if (b.password) upd.password_hash = bcrypt.hashSync(b.password, 8)
      // v3.4 — Permission update
      if (b.permissions && typeof b.permissions === 'object') {
        const sanitized = {}
        for (const k of Object.keys(DEFAULT_STAFF_PERMISSIONS)) sanitized[k] = !!b.permissions[k]
        upd.permissions = sanitized
      }
      // v3.9.9 — Update default box + lock flag
      if (b.default_box_id !== undefined) upd.default_box_id = b.default_box_id || null
      if (b.lock_box !== undefined) upd.lock_box = !!b.lock_box
      await db.collection('users').updateOne({ id: userIdMatch[1], tenant_id: T }, { $set: upd })
      return ok({ success: true })
    }
    if (userIdMatch && method === 'DELETE') {
      if (sess.user.role !== 'owner') return bad('غير مصرح', 403)
      const target = await db.collection('users').findOne({ id: userIdMatch[1], tenant_id: T })
      if (!target) return bad('المستخدم غير موجود', 404)
      if (target.role === 'owner') return bad('لا يمكن حذف حساب المالك')
      await db.collection('users').deleteOne({ id: userIdMatch[1], tenant_id: T })
      return ok({ success: true })
    }

    // v2.8 — Public plans list for the "Out of Quota" top-up modal
    if (route === '/plans' && method === 'GET') {
      const list = await db.collection('subscription_plans').find({ active: { $ne: false } }).toArray()
      return ok(list.map(p => ({ ...p, _id: undefined })))
    }

    // v2.8 — Active announcements for tenant popup + banner
    if (route === '/announcements/active' && method === 'GET') {
      const now = new Date()
      const list = await db.collection('announcements').find({
        active: true,
        $and: [
          { $or: [{ starts_at: null }, { starts_at: { $lte: now } }, { starts_at: { $exists: false } }] },
          { $or: [{ ends_at: null }, { ends_at: { $gte: now } }, { ends_at: { $exists: false } }] },
        ],
      }).sort({ created_at: -1 }).toArray()
      return ok(list.map(a => ({ id: a.id, type: a.type, title: a.title, body: a.body, image_url: a.image_url, link_url: a.link_url })))
    }

    // Rates (per-tenant)
    if (route === '/rates' && method === 'GET') {
      const s = await db.collection('tenant_settings').findOne(tf)
      return ok({ rates: s?.rates || DEFAULT_RATES, updated_at: s?.updated_at })
    }

    // ============ REFERRALS ============
    if (route === '/referrals' && method === 'GET') {
      const code = await ensureReferralCode(db, T)
      const t = await db.collection('tenants').findOne({ id: T })
      const invitees = await db.collection('tenants').find({ referred_by: T }).sort({ created_at: -1 }).toArray()
      return ok({
        code, link_hint: `/signup?ref=${code}`,
        stats: t.referral_stats || { signups: 0, activations: 0, bonus_earned: 0 },
        invitees: invitees.map(x => ({
          id: x.id, name: x.name, slug: x.slug, created_at: x.created_at,
          subscription: x.subscription || 'trial',
          activation_confirmed: !!x.activation_confirmed,
          bonus_status: x.activation_confirmed ? 'activated_+50' : 'signup_+15',
        })),
      })
    }

    // ============ v3.4 — AFFILIATE MODULE (Marketing + Cash Balance) ============
    if (route === '/affiliate' && method === 'GET') {
      const code = await ensureReferralCode(db, T)
      const t = await db.collection('tenants').findOne({ id: T })
      const affiliate = t.affiliate || { balance_usd: 0, total_earned_usd: 0, total_withdrawn_usd: 0, commission_rate: AFFILIATE_COMMISSION_RATE, is_individual: false }
      const publicBase = process.env.NEXT_PUBLIC_BASE_URL || ''
      const link = `${publicBase}/signup?ref=${code}`
      const invitees = await db.collection('tenants').find({ referred_by: T }).sort({ created_at: -1 }).toArray()
      const activated = invitees.filter(x => x.activation_confirmed).length
      const withdrawals = await db.collection('cashout_requests').find({ tenant_id: T }).sort({ created_at: -1 }).limit(20).toArray()
      const payoutMethods = await db.collection('payout_methods').find({ tenant_id: T }).sort({ created_at: -1 }).toArray()
      const minCashout = affiliate.is_individual ? AFFILIATE_MIN_CASHOUT_INDIVIDUAL : AFFILIATE_MIN_CASHOUT_OFFICE
      // Marketing banners/texts (bundled here for simplicity)
      const banners = [
        {
          id: 'b1', title: 'برنامج رحّال للمحاسبة السحابية',
          headline: '🚀 أدر مكتب سفرك من مكان واحد — بدون أوراق!',
          body: 'نظام رحّال يحوّل مكتب سفرك إلى مكتب رقمي: تذاكر، تأشيرات، حسابات، كشوف عملاء، وطباعة قسائم — كل ذلك بلمسة زر. جرّبه مجاناً!',
          cta: 'ابدأ تجربتك المجانية الآن',
        },
        {
          id: 'b2', title: 'العرض التسويقي — للتواصل السريع',
          headline: '📊 كل ما يحتاجه مكتب السفريات في نظام واحد',
          body: 'رحّال ERP: حجز التذاكر (جوي/بري) + التأشيرات + الخدمات + محاسبة متعددة العملات (YER/SAR/USD) + قوالب واتساب ذكية + كشوف حسابات احترافية.',
          cta: 'اطلب عرضك الآن',
        },
      ]
      return ok({
        code, link,
        balance_usd: affiliate.balance_usd || 0,
        total_earned_usd: affiliate.total_earned_usd || 0,
        total_withdrawn_usd: affiliate.total_withdrawn_usd || 0,
        commission_rate: affiliate.commission_rate || AFFILIATE_COMMISSION_RATE,
        min_cashout_usd: minCashout,
        is_individual: !!affiliate.is_individual,
        referred_offices: invitees.length,
        activated_offices: activated,
        pending_offices: invitees.length - activated,
        withdrawals: withdrawals.map(w => ({ ...w, _id: undefined })),
        payout_methods: payoutMethods.map(m => ({ ...m, _id: undefined })),
        banners,
      })
    }

    if (route === '/affiliate/payout-methods' && method === 'GET') {
      const list = await db.collection('payout_methods').find({ tenant_id: T }).sort({ created_at: -1 }).toArray()
      return ok(list.map(m => ({ ...m, _id: undefined })))
    }
    if (route === '/affiliate/payout-methods' && method === 'POST') {
      const b = await request.json()
      if (!b.method_type || !b.account_name) return bad('نوع طريقة السحب واسم صاحب الحساب مطلوبان')
      const allowed = ['bank', 'wallet', 'local_remittance']
      if (!allowed.includes(b.method_type)) return bad('نوع طريقة السحب غير صالح')
      const doc = {
        id: uuidv4(), tenant_id: T,
        method_type: b.method_type,             // 'bank' | 'wallet' | 'local_remittance'
        provider: b.provider || '',              // Bank name / Wallet name (Creami/Jawali/...) / Remittance (Al-Najm/Al-Ehtiyaz/...)
        account_name: String(b.account_name).trim(),
        account_number: b.account_number || '',  // IBAN or phone or ref
        phone: b.phone || '',
        city: b.city || '',
        is_default: !!b.is_default,
        notes: b.notes || '',
        created_at: new Date(),
      }
      if (doc.is_default) {
        await db.collection('payout_methods').updateMany({ tenant_id: T }, { $set: { is_default: false } })
      }
      await db.collection('payout_methods').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }
    const pmMatch = route.match(/^\/affiliate\/payout-methods\/([^/]+)$/)
    if (pmMatch && method === 'PUT') {
      const b = await request.json()
      const upd = {}
      for (const k of ['provider', 'account_name', 'account_number', 'phone', 'city', 'notes']) if (b[k] !== undefined) upd[k] = b[k]
      if (b.is_default !== undefined) {
        upd.is_default = !!b.is_default
        if (upd.is_default) {
          await db.collection('payout_methods').updateMany({ tenant_id: T }, { $set: { is_default: false } })
        }
      }
      await db.collection('payout_methods').updateOne({ id: pmMatch[1], tenant_id: T }, { $set: upd })
      return ok({ success: true })
    }
    if (pmMatch && method === 'DELETE') {
      await db.collection('payout_methods').deleteOne({ id: pmMatch[1], tenant_id: T })
      return ok({ success: true })
    }

    if (route === '/affiliate/cashout' && method === 'POST') {
      const b = await request.json()
      const t = await db.collection('tenants').findOne({ id: T })
      const affiliate = t.affiliate || { balance_usd: 0, is_individual: false }
      const minCashout = affiliate.is_individual ? AFFILIATE_MIN_CASHOUT_INDIVIDUAL : AFFILIATE_MIN_CASHOUT_OFFICE
      const amount = Number(b.amount_usd) || 0
      if (amount < minCashout) return bad(`الحد الأدنى للسحب هو ${minCashout} USD`)
      if (amount > (affiliate.balance_usd || 0)) return bad('الرصيد غير كافٍ')
      if (!b.payout_method_id) return bad('اختر طريقة السحب')
      const pm = await db.collection('payout_methods').findOne({ id: b.payout_method_id, tenant_id: T })
      if (!pm) return bad('طريقة السحب غير موجودة')
      const doc = {
        id: uuidv4(), tenant_id: T,
        amount_usd: amount,
        payout_method_id: pm.id,
        payout_method_snapshot: { method_type: pm.method_type, provider: pm.provider, account_name: pm.account_name, account_number: pm.account_number, phone: pm.phone },
        status: 'pending',            // pending → processing → paid | rejected
        notes: b.notes || '',
        requested_by: sess.user.email,
        created_at: new Date(),
      }
      await db.collection('cashout_requests').insertOne(doc)
      // Reserve funds
      await db.collection('tenants').updateOne({ id: T }, { $inc: { 'affiliate.balance_usd': -amount, 'affiliate.reserved_usd': amount } })
      const { _id, ...rest } = doc; return ok(rest)
    }

    if (route === '/affiliate/apply-to-subscription' && method === 'POST') {
      const b = await request.json()
      const amount = Number(b.amount_usd) || 0
      const t = await db.collection('tenants').findOne({ id: T })
      const affiliate = t.affiliate || { balance_usd: 0 }
      if (amount <= 0) return bad('أدخل مبلغاً صالحاً')
      if (amount > (affiliate.balance_usd || 0)) return bad('الرصيد غير كافٍ')
      // Deduct from affiliate, credit subscription
      await db.collection('tenants').updateOne({ id: T }, {
        $inc: { 'affiliate.balance_usd': -amount, 'affiliate.total_applied_to_subscription_usd': amount, subscription_credit_usd: amount },
      })
      // Log as a "virtual cashout" for history
      await db.collection('cashout_requests').insertOne({
        id: uuidv4(), tenant_id: T, amount_usd: amount, status: 'applied_to_subscription',
        notes: 'تم تحويل الرصيد لتغطية الاشتراك',
        payout_method_snapshot: { method_type: 'subscription', provider: 'Internal Credit' },
        requested_by: sess.user.email, created_at: new Date(),
      })
      return ok({ success: true, applied_usd: amount })
    }

    // v3.4 — TEST-ONLY endpoint (dev/testing convenience): seed affiliate balance
    // Guarded to the current tenant only. NOT exposed in production UI.
    if (route === '/affiliate/dev-seed-balance' && method === 'POST') {
      const b = await request.json()
      const amount = Number(b.amount_usd) || 100
      const isIndividual = !!b.is_individual
      await db.collection('tenants').updateOne({ id: T }, {
        $set: { 'affiliate.commission_rate': AFFILIATE_COMMISSION_RATE, 'affiliate.is_individual': isIndividual },
        $inc: { 'affiliate.balance_usd': amount, 'affiliate.total_earned_usd': amount },
      })
      return ok({ success: true, credited_usd: amount, is_individual: isIndividual })
    }

    // ============ v3.5 — REFUNDS / CANCELLATIONS ============
    // Reverses original transaction, then applies:
    //  - Supplier keeps supplier_penalty (retained from cost)
    //  - Office keeps office_fee (recorded as revenue 4104)
    //  - Client receives sale_price - supplier_penalty - office_fee
    if (route === '/refunds' && method === 'GET') {
      const list = await db.collection('refunds').find(tf).sort({ created_at: -1 }).limit(200).toArray()
      return ok(list.map(r => ({ ...r, _id: undefined })))
    }
    if (route === '/refunds' && method === 'POST') {
      const b = await request.json()
      const refType = b.ref_type
      if (!['ticket', 'visa', 'service'].includes(refType)) return bad('نوع السجل غير صالح')
      const coll = refType === 'ticket' ? 'tickets' : refType === 'visa' ? 'visas' : 'services'
      const orig = await db.collection(coll).findOne({ id: b.ref_id, tenant_id: T })
      if (!orig) return bad('السجل الأصلي غير موجود', 404)
      if (orig.is_refunded) return bad('هذا السجل تم استرداده مسبقاً')

      const supplierPenalty = Number(b.supplier_penalty) || 0
      const officeFee = Number(b.office_fee) || 0
      const cur = orig.currency
      const cost = Number(orig.cost) || 0
      const sale = Number(orig.sale_price) || 0
      const commission = +(sale - cost).toFixed(2)
      const refundToClient = +(sale - supplierPenalty - officeFee).toFixed(2)
      if (refundToClient < 0) return bad('مجموع الغرامة ورسوم المكتب أكبر من قيمة البيع')

      // Reverse original balances effects
      await reverseTransactionEffects(db, T, refType + 's', orig)
      // Delete the original JE (so the reversal is auditable via a fresh refund JE)
      const origJe = await db.collection('journal_entries').findOne({ ref_id: orig.id, tenant_id: T })
      if (origJe) await db.collection('journal_entries').deleteOne({ id: origJe.id })

      // Re-apply partial effects:
      // Client: only pays the retained portion (supplier_penalty + office_fee) — so add that as their receivable
      const clientRetained = +(supplierPenalty + officeFee).toFixed(2)
      // Supplier: keeps supplier_penalty; we owe them supplierPenalty (not full cost)
      await updateBalance(db, 'clients', { id: orig.client_id, tenant_id: T }, cur, clientRetained)
      await updateBalance(db, 'suppliers', { id: orig.supplier_id, tenant_id: T }, cur, supplierPenalty)
      // If original was cash, we need to record the cash refund out of box
      const wasCash = orig.payment_method === 'cash'
      const box = wasCash && orig.box_id ? await db.collection('boxes').findOne({ id: orig.box_id, tenant_id: T }) : null
      const refundJeLines = []
      if (wasCash && box) {
        // Client got their money back from box: reduce box balance by refundToClient
        await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, cur, -refundToClient)
        refundJeLines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: 0, credit: refundToClient })
      }
      // Refund JE — reversal + fees
      // Client side: retained on account (they still owe us penalty + fee) — Debit client
      if (clientRetained > 0) refundJeLines.push({ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: orig.client_id, party_name: orig.client_name, debit: clientRetained, credit: 0 })
      // Supplier: they keep supplier_penalty — Credit supplier
      if (supplierPenalty > 0) refundJeLines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: orig.supplier_id, party_name: orig.supplier_name, debit: 0, credit: supplierPenalty })
      // Office fee: revenue 4104
      if (officeFee > 0) refundJeLines.push({ account_code: '4105', account_name: 'رسوم إلغاء واسترداد', party_type: 'revenue', party_id: null, party_name: 'رسوم استرداد', debit: 0, credit: officeFee })
      // For non-cash refunds, we need a balancing line since debit=clientRetained, credit=supplierPenalty+officeFee=clientRetained (already balanced!) ✓
      // For cash refunds: debit clientRetained, credit refundToClient+supplierPenalty+officeFee = refundToClient + clientRetained = sale ✓ hmm — need also to debit revenue 4101 for reversal
      // Actually simpler: on cash refunds, add a debit line reversing sale
      if (wasCash) {
        // Reverse the original sale-side revenue that we had. Debit revenue by the commission (loss of earned commission).
        if (commission > 0) refundJeLines.push({ account_code: refType === 'ticket' ? '4101' : refType === 'visa' ? '4102' : '4103', account_name: 'إيرادات (عكس)', party_type: 'revenue', party_id: null, party_name: 'عكس إيراد الحجز', debit: commission, credit: 0 })
        // And debit cost as expense reversal (we no longer owe supplier full cost — supplier keeps only penalty)
        const supplierReturned = +(cost - supplierPenalty).toFixed(2)
        if (supplierReturned > 0) refundJeLines.push({ account_code: '2101', account_name: 'استرجاع من المورد', party_type: 'supplier', party_id: orig.supplier_id, party_name: orig.supplier_name, debit: supplierReturned, credit: 0 })
      }

      await createJournalEntry(db, T, {
        date: new Date(b.date || Date.now()),
        description: `استرداد ${refType === 'ticket' ? 'تذكرة' : refType === 'visa' ? 'تأشيرة' : 'خدمة'} — ${orig.passenger_name || orig.beneficiary_name || orig.client_name}${b.reason ? ` (${b.reason})` : ''}`,
        ref_type: 'refund', ref_id: orig.id, currency: cur, lines: refundJeLines,
      }, { skipQuota: true })

      // Mark original as refunded (soft)
      await db.collection(coll).updateOne({ id: orig.id, tenant_id: T }, { $set: {
        is_refunded: true, refunded_at: new Date(), refunded_by: sess.user.email,
        refund_supplier_penalty: supplierPenalty, refund_office_fee: officeFee, refund_to_client: refundToClient,
        refund_reason: b.reason || '',
      } })

      // Store refund record
      const refundDoc = {
        id: uuidv4(), tenant_id: T, ref_type: refType, ref_id: orig.id,
        currency: cur, original_sale: sale, original_cost: cost,
        supplier_penalty: supplierPenalty, office_fee: officeFee, refund_to_client: refundToClient,
        client_id: orig.client_id, client_name: orig.client_name,
        supplier_id: orig.supplier_id, supplier_name: orig.supplier_name,
        passenger_name: orig.passenger_name || orig.beneficiary_name || '',
        reason: b.reason || '', notes: b.notes || '',
        payment_method: orig.payment_method, was_cash: wasCash,
        date: new Date(b.date || Date.now()),
        created_by: sess.user.email, created_at: new Date(),
      }
      await db.collection('refunds').insertOne(refundDoc)
      const { _id, ...rest } = refundDoc
      return ok(rest)
    }

    // ============ v3.8 — PATs (Personal Access Tokens for Chrome Extension) ============
    if (route === '/pats' && method === 'GET') {
      if (sess.user.role !== 'owner' && sess.user.role !== 'super_admin') return bad('غير مصرح — للمالك فقط', 403)
      const list = await db.collection('pats').find({ tenant_id: T }).sort({ created_at: -1 }).toArray()
      return ok(list.map(p => ({
        id: p.id, name: p.name, prefix: p.prefix,
        created_at: p.created_at, last_used_at: p.last_used_at || null,
        revoked_at: p.revoked_at || null,
      })))
    }
    if (route === '/pats' && method === 'POST') {
      if (sess.user.role !== 'owner' && sess.user.role !== 'super_admin') return bad('غير مصرح — للمالك فقط', 403)
      if (sess.isPat) return bad('لا يمكن إنشاء PAT جديد باستخدام PAT — سجّل دخولاً من الواجهة', 403)
      const b = await request.json().catch(() => ({}))
      const name = String(b.name || '').trim() || 'إضافة المتصفح'
      const activeCount = await db.collection('pats').countDocuments({ tenant_id: T, revoked_at: null })
      if (activeCount >= 5) return bad('الحد الأقصى 5 رموز نشطة — احذف رمزاً قديماً أولاً')
      const token = generatePat()
      const doc = {
        id: uuidv4(), tenant_id: T, user_id: sess.user.id,
        name, token_hash: hashPat(token), prefix: token.slice(0, 16),
        created_at: new Date(), last_used_at: null, revoked_at: null,
      }
      await db.collection('pats').insertOne(doc)
      // Return the full token ONCE — client must copy immediately
      return ok({
        id: doc.id, name: doc.name, token, prefix: doc.prefix,
        created_at: doc.created_at,
        warning: 'انسخ الرمز الآن — لن يظهر مرة أخرى بعد إغلاق هذه النافذة',
      })
    }
    const patDelMatch = route.match(/^\/pats\/([^/]+)$/)
    if (patDelMatch && method === 'DELETE') {
      if (sess.user.role !== 'owner' && sess.user.role !== 'super_admin') return bad('غير مصرح — للمالك فقط', 403)
      await db.collection('pats').updateOne(
        { id: patDelMatch[1], tenant_id: T },
        { $set: { revoked_at: new Date() } }
      )
      return ok({ success: true })
    }

    // ============ v3.8 — SCRAPER INGEST (Chrome Extension endpoint) ============
    // Verifies PAT works, then routes to createTicket / createVisa based on doc_type.
    if (route === '/scraper/ping' && method === 'GET') {
      // v3.9.7 — Return usage/limit info for trial gating in the extension popup
      const isPaid = sess.tenant?.subscription === 'paid' || !!sess.tenant?.activation_confirmed
      const used = sess.tenant?.scraper_usage?.count || 0
      const limit = 30
      return ok({
        ok: true, tenant: { id: T, name: sess.tenant?.name || null, plan: isPaid ? 'paid' : 'trial' },
        user: { id: sess.user.id, email: sess.user.email, role: sess.user.role },
        version: '3.9.17',
        extension_min_version: '1.4.0',
        usage: { plan: isPaid ? 'paid' : 'trial', used, limit: isPaid ? -1 : limit, remaining: isPaid ? -1 : Math.max(0, limit - used), unlimited: isPaid },
      })
    }
    if (route === '/scraper/ingest' && method === 'POST') {
      // v3.9.7 — enforce trial cap (30) for non-paid tenants
      const isPaidT = sess.tenant?.subscription === 'paid' || !!sess.tenant?.activation_confirmed
      if (!isPaidT) {
        const usedT = sess.tenant?.scraper_usage?.count || 0
        if (usedT >= 30) return cors(NextResponse.json({
          error: 'انتهت قراءاتك المجانية (30/30). يرجى ترقية الباقة من نظام رحّال للاستخدام غير المحدود.',
          quota_exceeded: true,
          usage: { plan: 'trial', unlimited: false, used: usedT, limit: 30, remaining: 0 },
        }, { status: 402 }))
      }
      const b = await request.json()
      const traveler = b.traveler || {}
      const booking = b.booking || {}
      const dates = b.dates || {}
      const financial = b.financial || {}
      const docType = String(booking.doc_type || '').toLowerCase()
      if (!docType) return bad('doc_type مطلوب')
      if (!b.client_id || !b.supplier_id) return bad('العميل والمورد مطلوبان (client_id + supplier_id)')
      const currency = CURRENCIES.includes(financial.currency) ? financial.currency : 'USD'
      const amount = Number(financial.amount) || 0
      const paymentMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
      const passengerName = traveler.name_ar || traveler.name_en || ''
      // Route to ticket or visa creator
      if (docType === 'flight' || docType === 'bus') {
        const payload = {
          client_id: b.client_id, supplier_id: b.supplier_id,
          currency, cost: Number(b.cost) || 0, sale_price: amount || Number(b.sale_price) || 0,
          payment_method: paymentMethod, box_id: b.box_id || null,
          date: dates.issued_at || new Date().toISOString(),
          pnr: booking.pnr || booking.ticket_no || '', ticket_number: booking.ticket_no || '',
          flight_number: booking.flight_no || '',
          route: [booking.route_from, booking.route_to].filter(Boolean).join(' → '),
          carrier_name: booking.carrier || '',
          passenger_name: passengerName, passport_no: traveler.passport_no || '',
          passenger_phone: traveler.phone || '', passenger_whatsapp: traveler.whatsapp || traveler.phone || '',
          travel_date: dates.trip_date || null,
          departure_time: dates.depart_time || '',
          arrival_time: dates.arrive_time || '',
          travel_mode: docType === 'bus' ? 'land' : 'air',
          exchange_rate: Number(b.exchange_rate) || 1,
        }
        const r = await createTicket(db, T, payload)
        if (r.error) return bad(r.error)
        let usageOut = { plan: 'paid', unlimited: true, used: 0, limit: -1, remaining: -1 }
        if (!isPaidT) {
          await db.collection('tenants').updateOne({ id: T }, { $inc: { 'scraper_usage.count': 1 }, $set: { 'scraper_usage.last_at': new Date() } })
          const usedNow = (sess.tenant?.scraper_usage?.count || 0) + 1
          usageOut = { plan: 'trial', unlimited: false, used: usedNow, limit: 30, remaining: Math.max(0, 30 - usedNow) }
        }
        return ok({ ok: true, record_type: 'ticket', record_id: r.doc.id, doc: r.doc, source: b.source_url || null, usage: usageOut })
      }
      if (docType === 'umrah_visa' || docType === 'visit_visa' || docType === 'work_visa' || docType === 'security_approval') {
        const svcMap = {
          umrah_visa: 'تأشيرة عمرة',
          visit_visa: 'تأشيرة زيارة',
          work_visa: 'تأشيرة عمل',
          security_approval: 'موافقة أمنية',
        }
        const payload = {
          client_id: b.client_id, supplier_id: b.supplier_id,
          currency, cost: Number(b.cost) || 0, sale_price: amount || Number(b.sale_price) || 0,
          payment_method: paymentMethod, box_id: b.box_id || null,
          date: dates.issued_at || new Date().toISOString(),
          service_type: svcMap[docType],
          passenger_name: passengerName, passport_no: traveler.passport_no || '',
          nationality: traveler.nationality || '',
          passenger_phone: traveler.phone || '', passenger_whatsapp: traveler.whatsapp || traveler.phone || '',
          entry_date: dates.valid_from || null,
          expected_exit_date: dates.valid_until || null,
          exchange_rate: Number(b.exchange_rate) || 1,
          // Preserve source metadata as attachment_url hint
          attachment_url: b.source_url || '',
        }
        const r = await createVisa(db, T, payload)
        if (r.error) return bad(r.error)
        let usageOut = { plan: 'paid', unlimited: true, used: 0, limit: -1, remaining: -1 }
        if (!isPaidT) {
          await db.collection('tenants').updateOne({ id: T }, { $inc: { 'scraper_usage.count': 1 }, $set: { 'scraper_usage.last_at': new Date() } })
          const usedNow = (sess.tenant?.scraper_usage?.count || 0) + 1
          usageOut = { plan: 'trial', unlimited: false, used: usedNow, limit: 30, remaining: Math.max(0, 30 - usedNow) }
        }
        return ok({ ok: true, record_type: 'visa', record_id: r.doc.id, doc: r.doc, source: b.source_url || null, usage: usageOut })
      }
      return bad(`نوع المستند "${docType}" غير مدعوم بعد`)
    }

    // ============ v3.6 — PACKAGES & TOURS (MVP) ============
    if (route === '/packages' && method === 'GET') {
      const list = await db.collection('packages').find(tf).sort({ created_at: -1 }).toArray()
      // Enrich each with counts
      const enriched = await Promise.all(list.map(async p => {
        const [comps, books] = await Promise.all([
          db.collection('package_components').countDocuments({ tenant_id: T, package_id: p.id }),
          db.collection('package_bookings').countDocuments({ tenant_id: T, package_id: p.id }),
        ])
        return { ...p, _id: undefined, components_count: comps, bookings_count: books }
      }))
      return ok(enriched)
    }
    // v3.7 — Packages profitability comparison (leaderboard) with optional period filter
    if (route === '/packages/comparison' && method === 'GET') {
      const period = (q.period || 'all').toLowerCase() // 'all' | 'month' | 'year'
      const now = new Date()
      let startFilter = null
      if (period === 'month') { startFilter = new Date(now.getFullYear(), now.getMonth(), 1) }
      else if (period === 'year') { startFilter = new Date(now.getFullYear(), 0, 1) }
      const pkgs = await db.collection('packages').find(tf).toArray()
      const bookingsQ = { tenant_id: T }
      if (startFilter) bookingsQ.created_at = { $gte: startFilter }
      const allBookings = await db.collection('package_bookings').find(bookingsQ).toArray()
      const byPkg = {}
      for (const b of allBookings) {
        byPkg[b.package_id] = byPkg[b.package_id] || { revenue: 0, cost: 0, profit: 0, pax: 0, bookings: 0 }
        byPkg[b.package_id].revenue += b.total_sale || 0
        byPkg[b.package_id].cost += b.total_cost || 0
        byPkg[b.package_id].profit += b.commission || 0
        byPkg[b.package_id].pax += b.pax_count || 0
        byPkg[b.package_id].bookings += 1
      }
      const rows = pkgs.map(p => {
        const s = byPkg[p.id] || { revenue: 0, cost: 0, profit: 0, pax: 0, bookings: 0 }
        const margin_pct = s.revenue > 0 ? +((s.profit / s.revenue) * 100).toFixed(2) : 0
        return {
          package_id: p.id,
          name: p.name,
          package_type: p.package_type,
          currency: p.currency,
          status: p.status,
          start_date: p.start_date,
          end_date: p.end_date,
          revenue: +s.revenue.toFixed(2),
          cost: +s.cost.toFixed(2),
          profit: +s.profit.toFixed(2),
          margin_pct,
          pax: s.pax,
          bookings: s.bookings,
        }
      }).sort((a, b) => b.profit - a.profit)
      const top = rows.find(r => r.bookings > 0) || null
      const totals = rows.reduce((acc, r) => ({
        revenue: acc.revenue + r.revenue,
        cost: acc.cost + r.cost,
        profit: acc.profit + r.profit,
        bookings: acc.bookings + r.bookings,
        pax: acc.pax + r.pax,
      }), { revenue: 0, cost: 0, profit: 0, bookings: 0, pax: 0 })
      totals.margin_pct = totals.revenue > 0 ? +((totals.profit / totals.revenue) * 100).toFixed(2) : 0
      return ok({ period, top, rows, totals })
    }
    if (route === '/packages' && method === 'POST') {
      const b = await request.json()
      if (!b.name || !b.package_type) return bad('الاسم والنوع مطلوبان')
      const doc = {
        id: uuidv4(), tenant_id: T, name: String(b.name), package_type: b.package_type,
        currency: CURRENCIES.includes(b.currency) ? b.currency : 'SAR',
        start_date: b.start_date ? new Date(b.start_date) : null,
        end_date: b.end_date ? new Date(b.end_date) : null,
        notes: b.notes || '', status: 'open',
        created_at: new Date(),
      }
      await db.collection('packages').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }
    const pkgIdMatch = route.match(/^\/packages\/([^/]+)$/)
    if (pkgIdMatch && method === 'PATCH') {
      const b = await request.json()
      const upd = {}
      for (const k of ['name', 'package_type', 'notes', 'end_date', 'status']) if (b[k] !== undefined) upd[k] = k === 'end_date' && b[k] ? new Date(b[k]) : b[k]
      await db.collection('packages').updateOne({ id: pkgIdMatch[1], tenant_id: T }, { $set: upd })
      return ok({ success: true })
    }
    if (pkgIdMatch && method === 'DELETE') {
      // Only allow delete if no bookings
      const bk = await db.collection('package_bookings').countDocuments({ tenant_id: T, package_id: pkgIdMatch[1] })
      if (bk > 0) return bad('لا يمكن حذف باكج به تسجيلات — أغلقه بدلاً من الحذف')
      await db.collection('package_components').deleteMany({ tenant_id: T, package_id: pkgIdMatch[1] })
      await db.collection('packages').deleteOne({ id: pkgIdMatch[1], tenant_id: T })
      return ok({ success: true })
    }

    // Package components
    const pkgCompMatch = route.match(/^\/packages\/([^/]+)\/components$/)
    if (pkgCompMatch && method === 'GET') {
      const list = await db.collection('package_components').find({ tenant_id: T, package_id: pkgCompMatch[1] }).sort({ created_at: 1 }).toArray()
      return ok(list.map(c => ({ ...c, _id: undefined })))
    }
    if (pkgCompMatch && method === 'POST') {
      const b = await request.json()
      if (!b.name || !b.supplier_id) return bad('اسم المكوّن والمورد مطلوبان')
      const sup = await db.collection('suppliers').findOne({ id: b.supplier_id, tenant_id: T })
      if (!sup) return bad('المورد غير موجود')
      const doc = {
        id: uuidv4(), tenant_id: T, package_id: pkgCompMatch[1],
        name: b.name, component_type: b.component_type || 'other',  // visa/ticket/hotel/transport/other
        supplier_id: sup.id, supplier_name: sup.name,
        cost_per_pax: Number(b.cost_per_pax) || 0,
        sale_per_pax: Number(b.sale_per_pax) || 0,
        notes: b.notes || '', created_at: new Date(),
      }
      await db.collection('package_components').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }
    const pkgCompDelMatch = route.match(/^\/packages\/([^/]+)\/components\/([^/]+)$/)
    if (pkgCompDelMatch && method === 'DELETE') {
      await db.collection('package_components').deleteOne({ id: pkgCompDelMatch[2], tenant_id: T, package_id: pkgCompDelMatch[1] })
      return ok({ success: true })
    }

    // Package bookings — register a client with auto-JE
    const pkgBookMatch = route.match(/^\/packages\/([^/]+)\/bookings$/)
    if (pkgBookMatch && method === 'GET') {
      const list = await db.collection('package_bookings').find({ tenant_id: T, package_id: pkgBookMatch[1] }).sort({ created_at: -1 }).toArray()
      return ok(list.map(b => ({ ...b, _id: undefined })))
    }
    if (pkgBookMatch && method === 'POST') {
      const b = await request.json()
      const pkgId = pkgBookMatch[1]
      const pkg = await db.collection('packages').findOne({ id: pkgId, tenant_id: T })
      if (!pkg) return bad('الباكج غير موجود', 404)
      if (pkg.status === 'closed') return bad('الباكج مغلق — لا يمكن إضافة تسجيلات جديدة')
      if (!b.client_id) return bad('حساب القبض مطلوب')
      const cli = await db.collection('clients').findOne({ id: b.client_id, tenant_id: T })
      if (!cli) return bad('العميل غير موجود')
      const comps = await db.collection('package_components').find({ tenant_id: T, package_id: pkgId }).toArray()
      if (comps.length === 0) return bad('لا توجد مكونات في الباكج — أضف المكونات قبل التسجيل')
      const pax = Math.max(1, Number(b.pax_count) || 1)
      const cur = pkg.currency
      const total_cost = +comps.reduce((s, c) => s + (c.cost_per_pax * pax), 0).toFixed(2)
      const total_sale = +comps.reduce((s, c) => s + (c.sale_per_pax * pax), 0).toFixed(2)
      const commission = +(total_sale - total_cost).toFixed(2)
      const payMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
      let box = null
      if (payMethod === 'cash') {
        if (!b.box_id) return bad('اختر الصندوق للدفع النقدي')
        box = await db.collection('boxes').findOne({ id: b.box_id, tenant_id: T })
        if (!box) return bad('الصندوق غير موجود')
      }
      const bookingDoc = {
        id: uuidv4(), tenant_id: T, package_id: pkgId,
        client_id: cli.id, client_name: cli.name,
        pilgrim_name: b.pilgrim_name || cli.name,
        passport_no: b.passport_no || '',
        pax_count: pax, currency: cur,
        total_cost, total_sale, commission,
        payment_method: payMethod, box_id: box?.id || null, box_name: box?.name_ar || null,
        component_snapshots: comps.map(c => ({ id: c.id, name: c.name, supplier_id: c.supplier_id, supplier_name: c.supplier_name, cost_per_pax: c.cost_per_pax, sale_per_pax: c.sale_per_pax, cost_total: c.cost_per_pax * pax, sale_total: c.sale_per_pax * pax })),
        notes: b.notes || '', created_at: new Date(), created_by: sess.user.email,
      }
      await db.collection('package_bookings').insertOne(bookingDoc)
      // Balances
      if (payMethod === 'cash') await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, cur, total_sale)
      else await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, cur, total_sale)
      for (const c of comps) await updateBalance(db, 'suppliers', { id: c.supplier_id, tenant_id: T }, cur, c.cost_per_pax * pax)
      // Single combined JE
      const lines = []
      if (payMethod === 'cash') lines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: total_sale, credit: 0 })
      else lines.push({ account_code: '1301', account_name: 'حساب القبض', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: total_sale, credit: 0 })
      // Group supplier credits (one line per supplier)
      const supGrouped = {}
      for (const c of comps) { supGrouped[c.supplier_id] = (supGrouped[c.supplier_id] || { name: c.supplier_name, amount: 0 }); supGrouped[c.supplier_id].amount += c.cost_per_pax * pax }
      for (const [sid, x] of Object.entries(supGrouped)) lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sid, party_name: x.name, debit: 0, credit: +x.amount.toFixed(2) })
      if (commission > 0) lines.push({ account_code: '4103', account_name: 'إيرادات خدمات إضافية', party_type: 'revenue', party_id: null, party_name: `إيراد باكج ${pkg.name}`, debit: 0, credit: commission })
      await createJournalEntry(db, T, {
        date: new Date(), description: `تسجيل ${bookingDoc.pilgrim_name} في ${pkg.name} — ${pax} فرد`,
        ref_type: 'package_booking', ref_id: bookingDoc.id, currency: cur, lines,
      })
      const { _id, ...rest } = bookingDoc; return ok(rest)
    }

    // Package closing report
    const pkgReportMatch = route.match(/^\/packages\/([^/]+)\/report$/)
    if (pkgReportMatch && method === 'GET') {
      const pkgId = pkgReportMatch[1]
      const pkg = await db.collection('packages').findOne({ id: pkgId, tenant_id: T })
      if (!pkg) return bad('الباكج غير موجود', 404)
      const bookings = await db.collection('package_bookings').find({ tenant_id: T, package_id: pkgId }).sort({ created_at: 1 }).toArray()
      const totals = { bookings: bookings.length, pax: 0, revenue: 0, cost: 0, profit: 0 }
      for (const b of bookings) { totals.pax += b.pax_count; totals.revenue += b.total_sale; totals.cost += b.total_cost; totals.profit += b.commission }
      const supplierBreakdown = {}
      for (const b of bookings) {
        for (const s of b.component_snapshots || []) {
          const key = s.supplier_id
          supplierBreakdown[key] = supplierBreakdown[key] || { name: s.supplier_name, cost: 0 }
          supplierBreakdown[key].cost += s.cost_total
        }
      }
      return ok({
        package: { ...pkg, _id: undefined },
        totals,
        margin_pct: totals.revenue > 0 ? +((totals.profit / totals.revenue) * 100).toFixed(2) : 0,
        bookings: bookings.map(b => ({ ...b, _id: undefined })),
        supplier_breakdown: Object.values(supplierBreakdown).map(s => ({ ...s, cost: +s.cost.toFixed(2) })).sort((a,b) => b.cost - a.cost),
      })
    }

    // ============ v3.5 — BULK STATEMENT SEND ============
    if (route === '/bulk-statement/generate' && method === 'POST') {
      const b = await request.json()
      const kind = b.kind || 'clients'   // 'clients' | 'suppliers'
      const period = b.period || 'month' // 'month' | 'all'
      const officeName = sess.tenant?.name || 'مكتب رحّال'
      const parties = await db.collection(kind).find({ tenant_id: T }).sort({ name: 1 }).toArray()
      const now = new Date()
      const results = []
      for (const p of parties) {
        if (!p.phone && !p.whatsapp) continue
        // Skip if all balances are zero
        const bals = p.balances || {}
        const hasBalance = ['USD', 'SAR', 'YER'].some(c => Math.abs(bals[c] || 0) > 0.01)
        if (!hasBalance) continue
        // Get last 5 transactions from journal entries
        const recentLines = await db.collection('journal_entries').aggregate([
          { $match: { tenant_id: T, [kind === 'clients' ? 'lines.party_type' : 'lines.party_type']: kind === 'clients' ? 'client' : 'supplier' } },
          { $sort: { date: -1 } }, { $limit: 100 },
          { $unwind: '$lines' },
          { $match: { 'lines.party_id': p.id } },
          { $limit: 5 },
        ]).toArray()
        const balanceLines = ['USD', 'SAR', 'YER']
          .map(c => { const bal = bals[c] || 0; return bal !== 0 ? `• ${c}: ${bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${bal >= 0 ? '(لكم)' : '(علينا)'}` : null })
          .filter(Boolean).join('\n') || '• لا توجد أرصدة'
        const recentText = recentLines.length > 0
          ? '\n\n📋 آخر ' + recentLines.length + ' حركات:\n' + recentLines.map(je => {
              const l = je.lines
              const amt = (l.debit || 0) - (l.credit || 0)
              const dc = amt > 0 ? `مدين ${Math.abs(amt).toFixed(2)}` : `دائن ${Math.abs(amt).toFixed(2)}`
              return `• ${new Date(je.date).toISOString().slice(0,10)} — ${(je.description || '').slice(0,40)} (${dc})`
            }).join('\n') : ''
        const msg = `عزيزنا ${kind === 'clients' ? 'العميل' : 'المورد'} ${p.name}،\n\n📊 هذا ملخص كشف حسابكم لدى ${officeName}\n📅 حتى: ${now.toISOString().slice(0,10)}\n\n💰 الأرصدة الحالية:\n${balanceLines}${recentText}\n\n📞 للاستفسار عن أي حركة تواصل معنا مباشرة.\nشكراً لثقتكم بنا 🌹`
        const phone = p.whatsapp || p.phone
        // Basic normalization matching frontend logic
        let d = String(phone).replace(/[^\d]/g, '')
        if (d.startsWith('00')) d = d.slice(2)
        if (d.startsWith('0')) d = '967' + d.slice(1)
        if (d.length === 9 && d.startsWith('7')) d = '967' + d
        if (d.length === 9 && d.startsWith('5')) d = '966' + d
        results.push({
          id: p.id, name: p.name, phone: p.phone, whatsapp: p.whatsapp || p.phone,
          balances: bals, message: msg,
          wa_link: `https://wa.me/${d}?text=${encodeURIComponent(msg)}`,
        })
      }
      return ok({ count: results.length, items: results })
    }


    // ============ UNIFIED CHART OF ACCOUNTS (for FX 'account' mode + Statement) ============
    if (route === '/accounts/all' && method === 'GET') {
      const [clients, suppliers, boxes, coa] = await Promise.all([
        db.collection('clients').find(tf).sort({ name: 1 }).toArray(),
        db.collection('suppliers').find(tf).sort({ name: 1 }).toArray(),
        db.collection('boxes').find(tf).sort({ name_ar: 1 }).toArray(),
        db.collection('accounts').find(tf).sort({ code: 1 }).toArray(),
      ])
      const list = [
        ...clients.map(c => ({ kind: 'client', id: c.id, code: '1301', name: c.name, group: 'العملاء', balances: c.balances })),
        ...suppliers.map(s => ({ kind: 'supplier', id: s.id, code: '2101', name: s.name, group: 'الموردون', balances: s.balances })),
        ...boxes.map(b => ({ kind: 'box', id: b.id, code: b.type === 'cash' ? '1101' : '1201', name: b.name_ar, group: b.type === 'cash' ? 'الصناديق' : 'البنوك', balances: b.balances })),
        ...coa.map(a => ({ kind: 'account', id: a.id, code: a.code, name: a.name_ar || a.name, group: a.type || 'دليل الحسابات' })),
      ]
      return ok(list)
    }

    // ============ TOMORROW TRAVELERS ============
    if (route === '/dashboard/tomorrow-travelers' && method === 'GET') {
      const now = new Date()
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
      const dayAfter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 0, 0, 0, 0)
      const tickets = await db.collection('tickets').find({ tenant_id: T, travel_date: { $gte: tomorrow, $lt: dayAfter } }).sort({ travel_date: 1 }).toArray()
      // Enrich with client phone
      const cliMap = {}
      const cliIds = [...new Set(tickets.map(t => t.client_id).filter(Boolean))]
      if (cliIds.length) {
        const cs = await db.collection('clients').find({ tenant_id: T, id: { $in: cliIds } }).toArray()
        for (const c of cs) cliMap[c.id] = c
      }
      const rows = tickets.map(t => {
        const c = cliMap[t.client_id] || {}
        return {
          id: t.id, pnr: t.pnr, route: t.route,
          passenger_name: t.passenger_name || c.name || '',
          passport_no: t.passport_no,
          travel_date: t.travel_date,
          // v3.2 — Include travel_mode, departure_time, phone/whatsapp for smart WhatsApp templates
          travel_mode: t.travel_mode || 'air',
          departure_time: t.departure_time || '',
          passenger_phone: t.passenger_phone || c.phone || '',
          passenger_whatsapp: t.passenger_whatsapp || c.whatsapp || c.phone || '',
          client_name: t.client_name,
          client_phone: c.phone || '',
          client_whatsapp: c.whatsapp || c.phone || '',
          currency: t.currency, sale_price: t.sale_price,
        }
      })
      return ok(rows)
    }
    if (route === '/rates' && method === 'POST') {
      const body = await request.json()
      await db.collection('tenant_settings').updateOne(tf, { $set: { rates: body.rates, updated_at: new Date() } }, { upsert: true })
      return ok({ success: true })
    }

    // Clients
    if (route === '/clients' && method === 'GET') return ok(clean(await db.collection('clients').find(tf).sort({ created_at: -1 }).toArray()))
    if (route === '/clients' && method === 'POST') {
      const b = await request.json()
      if (!b.name) return bad('اسم العميل مطلوب')
      const parent_code = String(b.parent_code || '1301') // v3.9.3 — default to العملاء (مدينون)
      const doc = { id: uuidv4(), tenant_id: T, name: b.name, phone: b.phone || '', whatsapp: b.whatsapp || b.phone || '', address: b.address || '', email: b.email || '', notes: b.notes || '', parent_code, balances: emptyBalances(), created_at: new Date() }
      await db.collection('clients').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }
    // v3.2 — Update client contact info
    const clientIdMatch = route.match(/^\/clients\/([^/]+)$/)
    if (clientIdMatch && method === 'PUT') {
      const b = await request.json()
      const upd = {}
      for (const k of ['name', 'phone', 'whatsapp', 'address', 'email', 'notes', 'parent_code']) if (b[k] !== undefined) upd[k] = b[k]
      await db.collection('clients').updateOne({ id: clientIdMatch[1], tenant_id: T }, { $set: upd })
      return ok({ success: true })
    }
    if (clientIdMatch && method === 'DELETE') {
      // Only delete if no transactions
      const cid = clientIdMatch[1]
      const hasTx = await db.collection('tickets').findOne({ tenant_id: T, client_id: cid })
        || await db.collection('visas').findOne({ tenant_id: T, client_id: cid })
        || await db.collection('services').findOne({ tenant_id: T, client_id: cid })
      if (hasTx) return bad('لا يمكن حذف عميل له حركات — احذف الحركات أولاً')
      await db.collection('clients').deleteOne({ id: cid, tenant_id: T })
      return ok({ success: true })
    }

    // Suppliers
    if (route === '/suppliers' && method === 'GET') return ok(clean(await db.collection('suppliers').find(tf).sort({ created_at: -1 }).toArray()))
    if (route === '/suppliers' && method === 'POST') {
      const b = await request.json()
      if (!b.name) return bad('اسم المورد مطلوب')
      const parent_code = String(b.parent_code || '2101') // v3.9.3 — default to الموردون والوكلاء (دائنون)
      const doc = { id: uuidv4(), tenant_id: T, name: b.name, phone: b.phone || '', whatsapp: b.whatsapp || b.phone || '', address: b.address || '', email: b.email || '', notes: b.notes || '', parent_code, balances: emptyBalances(), created_at: new Date() }
      await db.collection('suppliers').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }
    // v3.2 — Update supplier contact info
    const supIdMatch = route.match(/^\/suppliers\/([^/]+)$/)
    if (supIdMatch && method === 'PUT') {
      const b = await request.json()
      const upd = {}
      for (const k of ['name', 'phone', 'whatsapp', 'address', 'email', 'notes', 'parent_code']) if (b[k] !== undefined) upd[k] = b[k]
      await db.collection('suppliers').updateOne({ id: supIdMatch[1], tenant_id: T }, { $set: upd })
      return ok({ success: true })
    }
    if (supIdMatch && method === 'DELETE') {
      const sid = supIdMatch[1]
      const hasTx = await db.collection('tickets').findOne({ tenant_id: T, supplier_id: sid })
        || await db.collection('visas').findOne({ tenant_id: T, supplier_id: sid })
        || await db.collection('services').findOne({ tenant_id: T, supplier_id: sid })
      if (hasTx) return bad('لا يمكن حذف مورد له حركات — احذف الحركات أولاً')
      await db.collection('suppliers').deleteOne({ id: sid, tenant_id: T })
      return ok({ success: true })
    }

    // Boxes
    if (route === '/boxes' && method === 'GET') return ok(clean(await db.collection('boxes').find(tf).sort({ created_at: 1 }).toArray()))
    if (route === '/boxes' && method === 'POST') {
      const b = await request.json()
      if (!b.name_ar) return bad('اسم الصندوق مطلوب')
      const type = b.type || 'cash'
      const defaultParent = type === 'cash' ? '1101' : '1201' // 1101=صندوق, 1201=حسابات بنكية
      const parent_code = String(b.parent_code || defaultParent)
      const doc = { id: uuidv4(), tenant_id: T, name_ar: b.name_ar, type, parent_code, balances: emptyBalances(), created_at: new Date() }
      await db.collection('boxes').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }

    // Accounts (Chart of Accounts)
    if (route === '/accounts' && method === 'GET') return ok(clean(await db.collection('accounts').find(tf).sort({ code: 1 }).toArray()))
    if (route === '/accounts' && method === 'POST') {
      const b = await request.json()
      if (!b.code || !b.name_ar || !b.type) return bad('الرمز والاسم والنوع مطلوبة')
      const exists = await db.collection('accounts').findOne({ tenant_id: T, code: String(b.code) })
      if (exists) return bad('رمز الحساب مستخدم بالفعل')
      if (b.parent) {
        const p = await db.collection('accounts').findOne({ tenant_id: T, code: String(b.parent) })
        if (!p) return bad('الحساب الأب غير موجود')
      }
      const doc = {
        id: uuidv4(), tenant_id: T, code: String(b.code), name_ar: String(b.name_ar),
        type: b.type, parent: b.parent ? String(b.parent) : null,
        is_group: !!b.is_group, notes: b.notes || '',
        created_at: new Date(),
      }
      await db.collection('accounts').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }
    const acctIdMatch = route.match(/^\/accounts\/([^/]+)$/)
    if (acctIdMatch && method === 'PUT') {
      const b = await request.json()
      const upd = {}
      for (const k of ['name_ar', 'type', 'parent', 'is_group', 'notes']) if (b[k] !== undefined) upd[k] = b[k]
      await db.collection('accounts').updateOne({ id: acctIdMatch[1], tenant_id: T }, { $set: upd })
      return ok({ success: true })
    }
    if (acctIdMatch && method === 'DELETE') {
      const acc = await db.collection('accounts').findOne({ id: acctIdMatch[1], tenant_id: T })
      if (!acc) return bad('الحساب غير موجود', 404)
      // Check for children
      const childCount = await db.collection('accounts').countDocuments({ tenant_id: T, parent: acc.code })
      if (childCount > 0) return bad(`لا يمكن حذف الحساب — يحتوي على ${childCount} حساب فرعي`)
      // Check for journal entries
      const jeCount = await db.collection('journal_entries').countDocuments({ tenant_id: T, 'lines.account_code': acc.code })
      if (jeCount > 0) return bad(`لا يمكن حذف الحساب — مستخدم في ${jeCount} قيد يومية`)
      await db.collection('accounts').deleteOne({ id: acctIdMatch[1], tenant_id: T })
      return ok({ success: true })
    }

    // Tickets
    if (route === '/tickets' && method === 'GET') return ok(clean(await db.collection('tickets').find(tf).sort({ date: -1, created_at: -1 }).limit(500).toArray()))
    if (route === '/tickets' && method === 'POST') {
      const b = await request.json()
      const result = await createTicket(db, T, b)
      if (result.error) return bad(result.error)
      return ok(result.doc)
    }

    // Visas
    if (route === '/visas' && method === 'GET') return ok(clean(await db.collection('visas').find(tf).sort({ date: -1, created_at: -1 }).limit(500).toArray()))
    if (route === '/visas' && method === 'POST') {
      const b = await request.json()
      const result = await createVisa(db, T, b)
      if (result.error) return bad(result.error)
      return ok(result.doc)
    }

    // v3.0 — Mark visa as exited (removes alert, no accounting effect)
    const markExitedMatch = route.match(/^\/visas\/([^/]+)\/mark-exited$/)
    if (markExitedMatch && method === 'POST') {
      const visaId = markExitedMatch[1]
      const v = await db.collection('visas').findOne({ id: visaId, tenant_id: T })
      if (!v) return bad('التأشيرة غير موجودة', 404)
      await db.collection('visas').updateOne(
        { id: visaId, tenant_id: T },
        { $set: { is_exited: true, exited_at: new Date(), exited_by: sess.user.email } }
      )
      return ok({ success: true, id: visaId, is_exited: true })
    }

    // v3.0 — Unmark visa (in case of error)
    const unmarkExitedMatch = route.match(/^\/visas\/([^/]+)\/unmark-exited$/)
    if (unmarkExitedMatch && method === 'POST') {
      const visaId = unmarkExitedMatch[1]
      await db.collection('visas').updateOne(
        { id: visaId, tenant_id: T },
        { $set: { is_exited: false }, $unset: { exited_at: '', exited_by: '' } }
      )
      return ok({ success: true, id: visaId, is_exited: false })
    }

    // ============ SERVICES (v3.0 — dedicated dynamic-catalog services module) ============
    if (route === '/service-types' && method === 'GET') {
      const list = await db.collection('service_types').find(tf).sort({ created_at: 1 }).toArray()
      return ok(list.map(x => ({ ...x, _id: undefined })))
    }
    if (route === '/service-types' && method === 'POST') {
      const b = await request.json()
      const name = String(b.name || '').trim()
      if (!name) return bad('اسم نوع الخدمة مطلوب')
      const exists = await db.collection('service_types').findOne({ tenant_id: T, name })
      if (exists) return bad('نوع الخدمة موجود بالفعل')
      const doc = { id: uuidv4(), tenant_id: T, name, active: true, created_at: new Date() }
      await db.collection('service_types').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }
    const stIdMatch = route.match(/^\/service-types\/([^/]+)$/)
    if (stIdMatch && method === 'DELETE') {
      await db.collection('service_types').deleteOne({ id: stIdMatch[1], tenant_id: T })
      return ok({ success: true })
    }
    if (stIdMatch && method === 'PATCH') {
      const b = await request.json()
      const upd = {}
      if (b.name) upd.name = String(b.name).trim()
      if (b.active !== undefined) upd.active = !!b.active
      await db.collection('service_types').updateOne({ id: stIdMatch[1], tenant_id: T }, { $set: upd })
      return ok({ success: true })
    }

    if (route === '/services' && method === 'GET') return ok(clean(await db.collection('services').find(tf).sort({ date: -1, created_at: -1 }).limit(500).toArray()))
    if (route === '/services' && method === 'POST') {
      const b = await request.json()
      const result = await createService(db, T, b)
      if (result.error) return bad(result.error)
      return ok(result.doc)
    }

    // ============ BULK IMPORT ============
    if (route === '/import/tickets/preview' && method === 'POST') {
      const b = await request.json()  // { rows: [normalized rows], skip_duplicates:true }
      const rows = Array.isArray(b.rows) ? b.rows : []
      const pnrs = rows.map(r => r.pnr).filter(Boolean)
      const existing = await db.collection('tickets').find({ tenant_id: T, pnr: { $in: pnrs } }).project({ pnr: 1 }).toArray()
      const existingSet = new Set(existing.map(x => x.pnr))
      // v3.9.9 — Name+Date dedup (main key for offices without PNR)
      const nameDateKeys = rows.map(r => `${String(r.passenger_name || '').trim().toLowerCase()}|${String(r.travel_date || r.date || '').slice(0, 10)}`).filter(k => !k.startsWith('|'))
      const existingByNameDate = new Set()
      if (nameDateKeys.length) {
        const existingTix = await db.collection('tickets').find({ tenant_id: T, passenger_name: { $in: rows.map(r => String(r.passenger_name || '').trim()).filter(Boolean) } }).project({ passenger_name: 1, travel_date: 1, date: 1 }).toArray()
        for (const t of existingTix) {
          const d = t.travel_date ? new Date(t.travel_date).toISOString().slice(0, 10) : (t.date ? new Date(t.date).toISOString().slice(0, 10) : '')
          existingByNameDate.add(`${String(t.passenger_name || '').trim().toLowerCase()}|${d}`)
        }
      }
      // v3.9.8 — Flexible receipt account: allow clients OR boxes/banks (cash)
      const allClients = await db.collection('clients').find({ tenant_id: T }).project({ name: 1 }).toArray()
      const allSuppliers = await db.collection('suppliers').find({ tenant_id: T }).project({ name: 1 }).toArray()
      const allBoxes = await db.collection('boxes').find({ tenant_id: T }).project({ id: 1, name: 1, name_ar: 1, type: 1 }).toArray()
      const clientSet = new Set(allClients.map(x => String(x.name).trim().toLowerCase()))
      const supplierSet = new Set(allSuppliers.map(x => String(x.name).trim().toLowerCase()))
      const boxSet = new Set(allBoxes.flatMap(x => [String(x.name_ar || '').trim().toLowerCase(), String(x.name || '').trim().toLowerCase()].filter(Boolean)))
      const seenInBatch = new Set()
      const seenNameDateInBatch = new Set()
      const validated = rows.map((r, i) => {
        const errors = []
        if (!r.currency || !CURRENCIES.includes(r.currency)) errors.push('العملة غير صالحة')
        if (r.cost === undefined || r.cost === '' || isNaN(Number(r.cost))) errors.push('التكلفة مطلوبة')
        if (r.sale_price === undefined || r.sale_price === '' || isNaN(Number(r.sale_price))) errors.push('سعر البيع مطلوب')
        let receiptKind = null
        if (!r.client_name) errors.push('حساب القبض مطلوب (عميل أو صندوق/بنك)')
        else {
          const key = String(r.client_name).trim().toLowerCase()
          if (clientSet.has(key)) receiptKind = 'client'
          else if (boxSet.has(key)) receiptKind = 'box'
          else errors.push(`خطأ استيراد: حساب القبض "${r.client_name}" غير موجود (لا عميل ولا صندوق/بنك) — أضِفه يدوياً أولاً`)
        }
        if (!r.supplier_name) errors.push('اسم المورد مطلوب')
        else if (!supplierSet.has(String(r.supplier_name).trim().toLowerCase())) errors.push(`خطأ استيراد: المورد "${r.supplier_name}" غير موجود في دليل الحسابات — أضِفه يدوياً أولاً`)
        let dup = false
        // 1) PNR-based dedup (when PNR is provided)
        if (r.pnr && existingSet.has(r.pnr)) dup = 'موجود مسبقاً في قاعدة البيانات (PNR)'
        if (r.pnr && seenInBatch.has(r.pnr)) dup = 'مكرر داخل نفس الملف (PNR)'
        if (r.pnr) seenInBatch.add(r.pnr)
        // 2) Name+Date dedup (main check for offices without PNR)
        if (!dup && r.passenger_name) {
          const nd = `${String(r.passenger_name).trim().toLowerCase()}|${String(r.travel_date || r.date || '').slice(0, 10)}`
          if (nd !== '|' && !nd.endsWith('|')) {
            if (existingByNameDate.has(nd)) dup = 'موجود مسبقاً (اسم المسافر + التاريخ)'
            else if (seenNameDateInBatch.has(nd)) dup = 'مكرر داخل نفس الملف (اسم + تاريخ)'
            else seenNameDateInBatch.add(nd)
          }
        }
        return { ...r, __row: i + 1, __errors: errors, __dup: dup, __receipt_kind: receiptKind, __commission: (Number(r.sale_price) || 0) - (Number(r.cost) || 0) }
      })
      const totals = validated.reduce((acc, r) => {
        const c = r.currency || 'USD'
        if (!acc[c]) acc[c] = { count: 0, cost: 0, sale: 0, profit: 0 }
        acc[c].count++; acc[c].cost += Number(r.cost) || 0; acc[c].sale += Number(r.sale_price) || 0; acc[c].profit += r.__commission
        return acc
      }, {})
      return ok({ rows: validated, totals, valid_count: validated.filter(v => v.__errors.length === 0 && !v.__dup).length })
    }
    if (route === '/import/tickets' && method === 'POST') {
      const b = await request.json()
      const rows = Array.isArray(b.rows) ? b.rows : []
      const skip = b.skip_duplicates !== false
      let created = 0, skipped = 0, failed = 0
      const errors = []
      for (const r of rows) {
        if (skip && r.__dup) { skipped++; continue }
        if (r.__errors && r.__errors.length) { failed++; errors.push({ row: r.__row, errors: r.__errors }); continue }
        // v3.9.8 — Receipt account may be a client (credit) OR a box/bank (cash)
        const nameTrim = r.client_name ? String(r.client_name).trim() : ''
        const cli = nameTrim ? await db.collection('clients').findOne({ tenant_id: T, name: nameTrim }) : null
        let box = null
        if (!cli && nameTrim) box = await db.collection('boxes').findOne({ tenant_id: T, $or: [{ name_ar: nameTrim }, { name: nameTrim }] })
        const sup = r.supplier_name ? await db.collection('suppliers').findOne({ tenant_id: T, name: String(r.supplier_name).trim() }) : null
        if (!cli && !box) { failed++; errors.push({ row: r.__row, errors: [`حساب القبض "${r.client_name}" غير موجود (لا عميل ولا صندوق/بنك)`] }); continue }
        if (!sup) { failed++; errors.push({ row: r.__row, errors: [`المورد "${r.supplier_name}" غير موجود في دليل الحسابات`] }); continue }
        const payload = box
          ? { ...r, client_id: null, client_name: nameTrim, supplier_id: sup.id, payment_method: 'cash', box_id: box.id }
          : { ...r, client_id: cli.id, supplier_id: sup.id, payment_method: r.payment_method === 'cash' ? 'cash' : 'credit' }
        const result = await createTicket(db, T, payload)
        if (result.error) { failed++; errors.push({ row: r.__row, errors: [result.error] }) } else created++
      }
      return ok({ created, skipped, failed, errors })
    }
    if (route === '/import/visas/preview' && method === 'POST') {
      const b = await request.json()
      const rows = Array.isArray(b.rows) ? b.rows : []
      const passports = rows.map(r => r.passport_no).filter(Boolean)
      const existing = await db.collection('visas').find({ tenant_id: T, passport_no: { $in: passports } }).project({ passport_no: 1 }).toArray()
      const existingSet = new Set(existing.map(x => x.passport_no))
      // v3.9.9 — Name+Date dedup (main key)
      const existingByNameDate = new Set()
      const names = rows.map(r => String(r.passenger_name || '').trim()).filter(Boolean)
      if (names.length) {
        const existingVisas = await db.collection('visas').find({ tenant_id: T, passenger_name: { $in: names } }).project({ passenger_name: 1, entry_date: 1, date: 1 }).toArray()
        for (const v of existingVisas) {
          const d = v.entry_date ? new Date(v.entry_date).toISOString().slice(0, 10) : (v.date ? new Date(v.date).toISOString().slice(0, 10) : '')
          existingByNameDate.add(`${String(v.passenger_name || '').trim().toLowerCase()}|${d}`)
        }
      }
      // v3.9.8 — Flexible receipt account
      const allClients = await db.collection('clients').find({ tenant_id: T }).project({ name: 1 }).toArray()
      const allSuppliers = await db.collection('suppliers').find({ tenant_id: T }).project({ name: 1 }).toArray()
      const allBoxes = await db.collection('boxes').find({ tenant_id: T }).project({ id: 1, name: 1, name_ar: 1, type: 1 }).toArray()
      const clientSet = new Set(allClients.map(x => String(x.name).trim().toLowerCase()))
      const supplierSet = new Set(allSuppliers.map(x => String(x.name).trim().toLowerCase()))
      const boxSet = new Set(allBoxes.flatMap(x => [String(x.name_ar || '').trim().toLowerCase(), String(x.name || '').trim().toLowerCase()].filter(Boolean)))
      const seenInBatch = new Set()
      const seenNameDateInBatch = new Set()
      const validated = rows.map((r, i) => {
        const errors = []
        if (!r.currency || !CURRENCIES.includes(r.currency)) errors.push('العملة غير صالحة')
        if (r.cost === undefined || r.cost === '' || isNaN(Number(r.cost))) errors.push('التكلفة مطلوبة')
        if (r.sale_price === undefined || r.sale_price === '' || isNaN(Number(r.sale_price))) errors.push('سعر البيع مطلوب')
        let receiptKind = null
        if (!r.client_name) errors.push('حساب القبض مطلوب (عميل أو صندوق/بنك)')
        else {
          const key = String(r.client_name).trim().toLowerCase()
          if (clientSet.has(key)) receiptKind = 'client'
          else if (boxSet.has(key)) receiptKind = 'box'
          else errors.push(`خطأ استيراد: حساب القبض "${r.client_name}" غير موجود (لا عميل ولا صندوق/بنك) — أضِفه يدوياً أولاً`)
        }
        if (!r.supplier_name) errors.push('اسم المورد مطلوب')
        else if (!supplierSet.has(String(r.supplier_name).trim().toLowerCase())) errors.push(`خطأ استيراد: المورد "${r.supplier_name}" غير موجود في دليل الحسابات — أضِفه يدوياً أولاً`)
        let dup = false
        if (r.passport_no && existingSet.has(r.passport_no)) dup = 'رقم الجواز موجود مسبقاً'
        if (r.passport_no && seenInBatch.has(r.passport_no)) dup = 'مكرر داخل الملف (جواز)'
        if (r.passport_no) seenInBatch.add(r.passport_no)
        // Name+Date dedup
        if (!dup && r.passenger_name) {
          const nd = `${String(r.passenger_name).trim().toLowerCase()}|${String(r.entry_date || r.date || '').slice(0, 10)}`
          if (nd !== '|' && !nd.endsWith('|')) {
            if (existingByNameDate.has(nd)) dup = 'موجود مسبقاً (اسم المعتمر + التاريخ)'
            else if (seenNameDateInBatch.has(nd)) dup = 'مكرر داخل نفس الملف (اسم + تاريخ)'
            else seenNameDateInBatch.add(nd)
          }
        }
        return { ...r, __row: i + 1, __errors: errors, __dup: dup, __receipt_kind: receiptKind, __commission: (Number(r.sale_price) || 0) - (Number(r.cost) || 0) }
      })
      const totals = validated.reduce((acc, r) => {
        const c = r.currency || 'USD'
        if (!acc[c]) acc[c] = { count: 0, cost: 0, sale: 0, profit: 0 }
        acc[c].count++; acc[c].cost += Number(r.cost) || 0; acc[c].sale += Number(r.sale_price) || 0; acc[c].profit += r.__commission
        return acc
      }, {})
      return ok({ rows: validated, totals, valid_count: validated.filter(v => v.__errors.length === 0 && !v.__dup).length })
    }
    if (route === '/import/visas' && method === 'POST') {
      const b = await request.json()
      const rows = Array.isArray(b.rows) ? b.rows : []
      const skip = b.skip_duplicates !== false
      let created = 0, skipped = 0, failed = 0
      const errors = []
      for (const r of rows) {
        if (skip && r.__dup) { skipped++; continue }
        if (r.__errors && r.__errors.length) { failed++; errors.push({ row: r.__row, errors: r.__errors }); continue }
        // v3.9.8 — Receipt account may be a client (credit) OR a box/bank (cash)
        const nameTrim = r.client_name ? String(r.client_name).trim() : ''
        const cli = nameTrim ? await db.collection('clients').findOne({ tenant_id: T, name: nameTrim }) : null
        let box = null
        if (!cli && nameTrim) box = await db.collection('boxes').findOne({ tenant_id: T, $or: [{ name_ar: nameTrim }, { name: nameTrim }] })
        const sup = r.supplier_name ? await db.collection('suppliers').findOne({ tenant_id: T, name: String(r.supplier_name).trim() }) : null
        if (!cli && !box) { failed++; errors.push({ row: r.__row, errors: [`حساب القبض "${r.client_name}" غير موجود (لا عميل ولا صندوق/بنك)`] }); continue }
        if (!sup) { failed++; errors.push({ row: r.__row, errors: [`المورد "${r.supplier_name}" غير موجود في دليل الحسابات`] }); continue }
        const payload = box
          ? { ...r, client_id: null, client_name: nameTrim, supplier_id: sup.id, payment_method: 'cash', box_id: box.id }
          : { ...r, client_id: cli.id, supplier_id: sup.id, payment_method: r.payment_method === 'cash' ? 'cash' : 'credit' }
        const result = await createVisa(db, T, payload)
        if (result.error) { failed++; errors.push({ row: r.__row, errors: [result.error] }) } else created++
      }
      return ok({ created, skipped, failed, errors })
    }

    // Vouchers
    if (route === '/vouchers' && method === 'GET') {
      const filter = { ...tf }; if (q.type) filter.type = q.type
      return ok(clean(await db.collection('vouchers').find(filter).sort({ date: -1, created_at: -1 }).limit(500).toArray()))
    }
    if (route === '/vouchers' && method === 'POST') {
      const b = await request.json()
      const result = await createVoucher(db, T, b)
      if (result.error) return bad(result.error)
      return ok(result.doc)
    }

    // Journal entries
    if (route === '/journal-entries' && method === 'GET') return ok(clean(await db.collection('journal_entries').find(tf).sort({ date: -1, created_at: -1 }).limit(500).toArray()))

    // v3.9.11 — Packages bulk operations
    if (route === '/packages/bulk-delete' && method === 'POST') {
      const body = await request.json()
      const ids = Array.isArray(body.ids) ? body.ids : []
      if (ids.length === 0) return bad('لم يتم اختيار أي باكج')
      let deleted = 0, failed = 0
      const errors = []
      for (const id of ids) {
        try {
          const pkg = await db.collection('packages').findOne({ id, tenant_id: T })
          if (!pkg) { failed++; errors.push({ id, error: 'غير موجود' }); continue }
          // Prevent delete if bookings exist
          const bookingsCount = await db.collection('package_bookings').countDocuments({ package_id: id, tenant_id: T })
          if (bookingsCount > 0) { failed++; errors.push({ id, error: `يوجد ${bookingsCount} حجز مرتبط — أزلها أولاً` }); continue }
          await db.collection('packages').deleteOne({ id, tenant_id: T })
          deleted++
        } catch (e) { failed++; errors.push({ id, error: e.message }) }
      }
      return ok({ ok: true, deleted, failed, errors })
    }
    if (route === '/packages/bulk-close' && method === 'POST') {
      const body = await request.json()
      const ids = Array.isArray(body.ids) ? body.ids : []
      if (ids.length === 0) return bad('لم يتم اختيار أي باكج')
      const status = body.status === 'open' ? 'open' : 'closed'
      const r = await db.collection('packages').updateMany({ id: { $in: ids }, tenant_id: T }, { $set: { status, updated_at: new Date() } })
      return ok({ ok: true, updated: r.modifiedCount, status })
    }

    // v3.9.9 — Bulk delete for tickets/visas/services/vouchers/fx (reverses balances + JEs per row)
    const bulkDelMatch = route.match(/^\/(tickets|visas|services|vouchers|fx)\/bulk-delete$/)
    if (bulkDelMatch && method === 'POST') {
      const [_, kind] = bulkDelMatch
      const coll = kind === 'fx' ? 'currency_exchanges' : kind
      const body = await request.json()
      const ids = Array.isArray(body.ids) ? body.ids : []
      if (ids.length === 0) return bad('لم يتم اختيار أي سجل')
      if (ids.length > 500) return bad('الحد الأقصى للحذف الجماعي 500 سجل في المرة')
      let deleted = 0, failed = 0
      const errors = []
      for (const docId of ids) {
        try {
          const doc = await db.collection(coll).findOne({ id: docId, tenant_id: T })
          if (!doc) { failed++; errors.push({ id: docId, error: 'غير موجود' }); continue }
          const je = await db.collection('journal_entries').findOne({ ref_id: docId, tenant_id: T })
          if (kind === 'tickets' || kind === 'visas' || kind === 'services') {
            if (doc.payment_method === 'cash' && doc.box_id) {
              await updateBalance(db, 'boxes', { id: doc.box_id, tenant_id: T }, doc.currency, -doc.sale_price)
            } else if (doc.client_id) {
              await updateBalance(db, 'clients', { id: doc.client_id, tenant_id: T }, doc.currency, -doc.sale_price)
            }
            if (doc.supplier_id) await updateBalance(db, 'suppliers', { id: doc.supplier_id, tenant_id: T }, doc.currency, -doc.cost)
          } else if (kind === 'vouchers') {
            if (doc.type === 'receipt') {
              await updateBalance(db, 'boxes', { id: doc.box_id, tenant_id: T }, doc.currency, -doc.amount)
              if (doc.party_type === 'client') await updateBalance(db, 'clients', { id: doc.party_id, tenant_id: T }, doc.currency, +doc.amount)
              if (doc.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: doc.party_id, tenant_id: T }, doc.currency, -doc.amount)
            } else {
              await updateBalance(db, 'boxes', { id: doc.box_id, tenant_id: T }, doc.currency, +doc.amount)
              if (doc.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: doc.party_id, tenant_id: T }, doc.currency, +doc.amount)
              if (doc.party_type === 'client') await updateBalance(db, 'clients', { id: doc.party_id, tenant_id: T }, doc.currency, -doc.amount)
            }
          } else if (kind === 'fx') {
            if (doc.type === 'buy') {
              await updateBalance(db, 'boxes', { id: doc.box_currency_id, tenant_id: T }, doc.currency, -doc.amount)
              await updateBalance(db, 'boxes', { id: doc.box_counter_id, tenant_id: T }, doc.counter_currency, +doc.counter_amount)
            } else {
              await updateBalance(db, 'boxes', { id: doc.box_currency_id, tenant_id: T }, doc.currency, +doc.amount)
              await updateBalance(db, 'boxes', { id: doc.box_counter_id, tenant_id: T }, doc.counter_currency, -doc.counter_amount)
            }
          }
          if (je) {
            await db.collection('journal_entries').deleteOne({ id: je.id })
            await db.collection('tenants').updateOne({ id: T }, { $inc: { 'journal_quota.used': -1 } })
          }
          await db.collection(coll).deleteOne({ id: docId, tenant_id: T })
          deleted++
        } catch (e) {
          failed++
          errors.push({ id: docId, error: e.message })
        }
      }
      return ok({ success: true, deleted, failed, errors, kind })
    }

    // v3.9.10 — Bulk edit for tickets/visas (partial updates on supplier, date, payment_method, box_id)
    const bulkEditMatch = route.match(/^\/(tickets|visas|services)\/bulk-edit$/)
    if (bulkEditMatch && method === 'POST') {
      const [_, kind] = bulkEditMatch
      const coll = kind
      const body = await request.json()
      const ids = Array.isArray(body.ids) ? body.ids : []
      const changes = body.changes || {}
      if (ids.length === 0) return bad('لم يتم اختيار أي سجل')
      if (ids.length > 300) return bad('الحد الأقصى للتعديل الجماعي 300 سجل في المرة')
      const allowed = ['supplier_id', 'date', 'payment_method', 'box_id', 'currency', 'exchange_rate']
      const changeKeys = Object.keys(changes).filter(k => allowed.includes(k) && changes[k] !== undefined && changes[k] !== null && changes[k] !== '')
      if (changeKeys.length === 0) return bad('لم يتم تحديد أي تغيير')
      let updated = 0, failed = 0
      const errors = []
      for (const docId of ids) {
        try {
          const oldDoc = await db.collection(coll).findOne({ id: docId, tenant_id: T })
          if (!oldDoc) { failed++; errors.push({ id: docId, error: 'غير موجود' }); continue }
          const oldJe = await db.collection('journal_entries').findOne({ ref_id: docId, tenant_id: T })
          // Build new body from oldDoc + partial changes
          const newBody = {
            date: oldDoc.date, currency: oldDoc.currency, exchange_rate: oldDoc.exchange_rate,
            client_id: oldDoc.client_id, supplier_id: oldDoc.supplier_id,
            cost: oldDoc.cost, sale_price: oldDoc.sale_price, payment_method: oldDoc.payment_method,
            box_id: oldDoc.box_id, client_name: oldDoc.client_name,
            // preserve type-specific fields
            pnr: oldDoc.pnr, route: oldDoc.route, ticket_number: oldDoc.ticket_number, passenger_name: oldDoc.passenger_name,
            carrier: oldDoc.carrier, class: oldDoc.class,
            passport_no: oldDoc.passport_no, nationality: oldDoc.nationality, service_type: oldDoc.service_type,
            visa_type: oldDoc.visa_type, entry_date: oldDoc.entry_date, exit_date: oldDoc.exit_date,
            travel_date: oldDoc.travel_date, notes: oldDoc.notes, description: oldDoc.description,
          }
          for (const k of changeKeys) newBody[k] = changes[k]
          // If payment_method switching from credit->cash, require box_id
          if (newBody.payment_method === 'cash' && !newBody.box_id) { failed++; errors.push({ id: docId, error: 'الدفع نقد يتطلب اختيار صندوق' }); continue }
          if (newBody.payment_method === 'credit') newBody.box_id = null
          // Reverse old effects
          await reverseTransactionEffects(db, T, kind, oldDoc)
          if (oldJe) await db.collection('journal_entries').deleteOne({ id: oldJe.id })
          await db.collection(coll).deleteOne({ id: docId, tenant_id: T })
          const opts = { existingId: docId, skipQuota: true, createdAt: oldDoc.created_at }
          let result
          if (kind === 'tickets') result = await createTicket(db, T, newBody, opts)
          else if (kind === 'visas') result = await createVisa(db, T, newBody, opts)
          else if (kind === 'services') result = await createService(db, T, newBody, opts)
          if (result.error) { failed++; errors.push({ id: docId, error: result.error }) } else updated++
        } catch (e) {
          failed++
          errors.push({ id: docId, error: e.message })
        }
      }
      return ok({ success: true, updated, failed, errors, kind })
    }

    // Universal DELETE for transactional records (reverses JE + balances + decrements quota)
    const delMatch = route.match(/^\/(tickets|visas|services|vouchers|fx)\/([^/]+)$/)
    if (delMatch && method === 'DELETE') {
      const [_, kind, docId] = delMatch
      const coll = kind === 'fx' ? 'currency_exchanges' : kind
      const doc = await db.collection(coll).findOne({ id: docId, tenant_id: T })
      if (!doc) return bad('العنصر غير موجود', 404)
      // Reverse balance updates & delete linked journal entry
      const je = await db.collection('journal_entries').findOne({ ref_id: docId, tenant_id: T })
      if (kind === 'tickets' || kind === 'visas' || kind === 'services') {
        if (doc.payment_method === 'cash' && doc.box_id) {
          await updateBalance(db, 'boxes', { id: doc.box_id, tenant_id: T }, doc.currency, -doc.sale_price)
        } else {
          await updateBalance(db, 'clients', { id: doc.client_id, tenant_id: T }, doc.currency, -doc.sale_price)
        }
        await updateBalance(db, 'suppliers', { id: doc.supplier_id, tenant_id: T }, doc.currency, -doc.cost)
      } else if (kind === 'vouchers') {
        if (doc.type === 'receipt') {
          await updateBalance(db, 'boxes', { id: doc.box_id, tenant_id: T }, doc.currency, -doc.amount)
          if (doc.party_type === 'client') await updateBalance(db, 'clients', { id: doc.party_id, tenant_id: T }, doc.currency, +doc.amount)
          if (doc.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: doc.party_id, tenant_id: T }, doc.currency, -doc.amount)
        } else {
          await updateBalance(db, 'boxes', { id: doc.box_id, tenant_id: T }, doc.currency, +doc.amount)
          if (doc.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: doc.party_id, tenant_id: T }, doc.currency, +doc.amount)
          if (doc.party_type === 'client') await updateBalance(db, 'clients', { id: doc.party_id, tenant_id: T }, doc.currency, -doc.amount)
        }
      } else if (kind === 'fx') {
        if (doc.type === 'buy') {
          await updateBalance(db, 'boxes', { id: doc.box_currency_id, tenant_id: T }, doc.currency, -doc.amount)
          await updateBalance(db, 'boxes', { id: doc.box_counter_id, tenant_id: T }, doc.counter_currency, +doc.counter_amount)
        } else {
          await updateBalance(db, 'boxes', { id: doc.box_currency_id, tenant_id: T }, doc.currency, +doc.amount)
          await updateBalance(db, 'boxes', { id: doc.box_counter_id, tenant_id: T }, doc.counter_currency, -doc.counter_amount)
        }
      }
      if (je) {
        await db.collection('journal_entries').deleteOne({ id: je.id })
        await db.collection('tenants').updateOne({ id: T }, { $inc: { 'journal_quota.used': -1 } })
      }
      await db.collection(coll).deleteOne({ id: docId, tenant_id: T })
      return ok({ success: true, deleted: kind, id: docId })
    }

    // ============ PUT /:kind/:id — EDIT MODE (reverse old JE, keep quota, re-post new) ============
    const putMatch = route.match(/^\/(tickets|visas|services|vouchers|fx)\/([^/]+)$/)
    if (putMatch && method === 'PUT') {
      const [_, kind, docId] = putMatch
      const coll = kind === 'fx' ? 'currency_exchanges' : kind
      const b = await request.json()
      const oldDoc = await db.collection(coll).findOne({ id: docId, tenant_id: T })
      if (!oldDoc) return bad('السجل غير موجود', 404)
      const oldJe = await db.collection('journal_entries').findOne({ ref_id: docId, tenant_id: T })
      // Step 1: Reverse balance effects of the old record
      await reverseTransactionEffects(db, T, kind, oldDoc)
      // Step 2: Delete old JE (without decrementing quota, since we'll re-post)
      if (oldJe) await db.collection('journal_entries').deleteOne({ id: oldJe.id })
      // Step 3: Delete the old record so we can re-insert with same id
      await db.collection(coll).deleteOne({ id: docId, tenant_id: T })
      // Step 4: Re-create with same id + skip quota (edit doesn't count against limit)
      let result
      const opts = { existingId: docId, skipQuota: true, createdAt: oldDoc.created_at }
      if (kind === 'tickets') result = await createTicket(db, T, b, opts)
      else if (kind === 'visas') result = await createVisa(db, T, b, opts)
      else if (kind === 'services') result = await createService(db, T, b, opts)
      else if (kind === 'vouchers') result = await createVoucher(db, T, { ...b, type: b.type || oldDoc.type }, opts)
      else if (kind === 'fx') result = await createFx(db, T, { ...b, type: b.type || oldDoc.type }, opts)
      if (result.error) {
        // Best-effort restore: re-apply original doc (though balances may be inconsistent — client should refresh)
        return bad(result.error)
      }
      return ok(result.doc)
    }

    // Manual Journal Voucher (single-currency or dual)
    if (route === '/journal-entries' && method === 'POST') {
      const b = await request.json()
      const result = await createManualJournal(db, T, b)
      if (result.error) return bad(result.error)
      return ok(result.doc)
    }

    // PUT /journal-entries/:id — edit manual JE (only manual + manual_dual are editable)
    const jeIdMatch = route.match(/^\/journal-entries\/([^/]+)$/)
    if (jeIdMatch && method === 'PUT') {
      const jeId = jeIdMatch[1]
      const b = await request.json()
      const oldJe = await db.collection('journal_entries').findOne({ id: jeId, tenant_id: T })
      if (!oldJe) return bad('القيد غير موجود', 404)
      if (!['manual', 'manual_dual'].includes(oldJe.ref_type)) return bad('لا يمكن تعديل قيود المعاملات مباشرةً — عدّل السجل المرتبط', 400)
      // Reverse old effects
      await reverseManualJournalEffects(db, T, oldJe)
      await db.collection('journal_entries').deleteOne({ id: jeId })
      // Re-create with same id + skip quota
      const result = await createManualJournal(db, T, b, { existingId: jeId, skipQuota: true, createdAt: oldJe.created_at })
      if (result.error) return bad(result.error)
      return ok(result.doc)
    }

    // ============ Currency Exchange (Buy/Sell) ============
    if (route === '/fx' && method === 'GET') {
      return ok(clean(await db.collection('currency_exchanges').find(tf).sort({ date: -1, created_at: -1 }).limit(500).toArray()))
    }
    if (route === '/fx' && method === 'POST') {
      const b = await request.json()
      const result = await createFx(db, T, b)
      if (result.error) return bad(result.error)
      return ok(result.doc)
    }

    // Dashboard
    if (route === '/dashboard' && method === 'GET') {
      return ok(await computeDashboard(db, T))
    }

    // Reports
    if (route === '/reports/profits' && method === 'GET') return ok(await reportProfits(db, T, q))
    if (route === '/reports/statement' && method === 'GET') return ok(await reportStatement(db, T, q))
    if (route === '/reports/trial-balance' && method === 'GET') return ok(await reportTrialBalance(db, T))
    if (route === '/reports/income-statement' && method === 'GET') return ok(await reportIncome(db, T, q))

    // v3.9.14 — Year-End Financial Closing Engine
    if (route === '/accounting/closable-years' && method === 'GET') {
      // Aggregate journal_entries to find distinct years and check status
      const years = await db.collection('journal_entries').aggregate([
        { $match: { tenant_id: T } },
        { $group: { _id: { $year: '$date' }, count: { $sum: 1 }, min_date: { $min: '$date' }, max_date: { $max: '$date' } } },
        { $sort: { _id: -1 } },
      ]).toArray()
      const closedYears = sess.tenant?.closed_years || []
      return ok(years.map(y => ({ year: y._id, entries: y.count, min_date: y.min_date, max_date: y.max_date, is_closed: closedYears.includes(y._id) })))
    }

    if (route === '/accounting/close-year' && method === 'POST') {
      if (sess.user.role !== 'owner' && sess.user.role !== 'super_admin') return bad('غير مصرح — يجب أن تكون مالكاً', 403)
      const b = await request.json()
      const year = parseInt(b.year)
      if (!year || year < 2000 || year > 2100) return bad('السنة المالية غير صالحة')
      const closedYears = sess.tenant?.closed_years || []
      if (closedYears.includes(year)) return bad(`السنة ${year} مقفلة بالفعل`)
      // Aggregate revenues and expenses for the year via journal_entries.lines
      const start = new Date(year, 0, 1); const end = new Date(year + 1, 0, 1)
      const jes = await db.collection('journal_entries').find({ tenant_id: T, date: { $gte: start, $lt: end } }).toArray()
      let totalRevenue = 0, totalExpense = 0
      const accountTotals = {} // account_code → { name, debit, credit }
      for (const je of jes) {
        for (const ln of (je.lines || [])) {
          const code = ln.account_code || ''
          if (!accountTotals[code]) accountTotals[code] = { name: ln.account_name, debit: 0, credit: 0 }
          accountTotals[code].debit += Number(ln.debit || 0)
          accountTotals[code].credit += Number(ln.credit || 0)
          if (code.startsWith('4')) totalRevenue += Number(ln.credit || 0) - Number(ln.debit || 0)
          if (code.startsWith('5')) totalExpense += Number(ln.debit || 0) - Number(ln.credit || 0)
        }
      }
      const netProfit = +(totalRevenue - totalExpense).toFixed(2)
      // Build closing JE lines: debit each revenue by its balance, credit each expense by its balance, plus RE 3900
      const closingLines = []
      for (const [code, t] of Object.entries(accountTotals)) {
        const bal = +(t.credit - t.debit).toFixed(2)
        if (code.startsWith('4') && bal !== 0) closingLines.push({ account_code: code, account_name: t.name, debit: bal, credit: 0 })
        if (code.startsWith('5') && bal !== 0) closingLines.push({ account_code: code, account_name: t.name, debit: 0, credit: Math.abs(bal) })
      }
      // Retained Earnings balancing line
      if (netProfit > 0) closingLines.push({ account_code: '3900', account_name: 'الأرباح المُدوّرة', debit: 0, credit: netProfit })
      else if (netProfit < 0) closingLines.push({ account_code: '3900', account_name: 'الأرباح المُدوّرة', debit: Math.abs(netProfit), credit: 0 })
      if (closingLines.length === 0) return bad(`لا توجد قيود إيرادات أو مصروفات في السنة ${year}`)
      const closingJe = await createJournalEntry(db, T, {
        date: new Date(year, 11, 31, 23, 59, 59),
        description: `🔒 قيد إقفال السنة المالية ${year} — تصفير الإيرادات والمصروفات وترحيل صافي الربح (${netProfit >= 0 ? 'ربح' : 'خسارة'}) إلى الأرباح المُدوّرة`,
        ref_type: 'year_close',
        ref_id: `close-${year}`,
        currency: 'USD',
        lines: closingLines,
      }, { skipQuota: true })
      // Mark tenant year as closed
      await db.collection('tenants').updateOne({ id: T }, {
        $addToSet: { closed_years: year },
        $set: { [`year_closes.${year}`]: { closed_at: new Date(), closed_by: sess.user.id, net_profit: netProfit, revenue: totalRevenue, expense: totalExpense } },
      })
      return ok({ ok: true, year, net_profit: netProfit, total_revenue: totalRevenue, total_expense: totalExpense, closing_je_id: closingJe.id, lines_count: closingLines.length })
    }

    if (route === '/accounting/reopen-year' && method === 'POST') {
      if (sess.user.role !== 'super_admin' && sess.user.role !== 'owner') return bad('غير مصرح', 403)
      const b = await request.json()
      const year = parseInt(b.year)
      if (!year) return bad('السنة مطلوبة')
      // Only super_admin can reopen; owners can only close (safety)
      if (sess.user.role !== 'super_admin') return bad('فتح السنة المقفلة يتطلب صلاحية السوبر أدمن', 403)
      // Delete closing JE
      await db.collection('journal_entries').deleteMany({ tenant_id: T, ref_type: 'year_close', ref_id: `close-${year}` })
      await db.collection('tenants').updateOne({ id: T }, { $pull: { closed_years: year }, $unset: { [`year_closes.${year}`]: '' } })
      return ok({ ok: true, year, reopened: true })
    }

    if (route === '/accounting/closed-years' && method === 'GET') {
      const closedYears = sess.tenant?.closed_years || []
      const details = sess.tenant?.year_closes || {}
      return ok({ closed_years: closedYears, details })
    }

    return bad(`Route ${route} not found`, 404)
  } catch (e) {
    if (e.code === 'QUOTA_EXCEEDED') {
      return NextResponse.json({ error: e.message, quota_exceeded: true, code: 'QUOTA_EXCEEDED' }, { status: 402, headers: { 'Access-Control-Allow-Origin': process.env.CORS_ORIGINS || '*' } })
    }
    console.error('API Error:', e)
    return bad('Internal server error: ' + e.message, 500)
  }
}

// ================= Business logic =================
async function createTicket(db, T, b, opts = {}) {
  if (!b.supplier_id) return { error: 'المورد مطلوب' }
  if (!CURRENCIES.includes(b.currency)) return { error: 'عملة غير صالحة' }
  // v3.9.14 — Period lock: prevent creating records in a closed year
  if (b.date) {
    const yr = new Date(b.date).getFullYear()
    const tenant = await db.collection('tenants').findOne({ id: T }, { projection: { closed_years: 1 } })
    if (tenant?.closed_years?.includes(yr)) return { error: `السنة المالية ${yr} مقفلة — لا يمكن إضافة أو تعديل قيود بتاريخها` }
  }
  const paymentMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
  if (paymentMethod === 'credit' && !b.client_id) return { error: 'العميل مطلوب للحجز الآجل' }
  const cost = Number(b.cost) || 0, sale = Number(b.sale_price) || 0
  const commission = +(sale - cost).toFixed(2)
  const cli = b.client_id ? await db.collection('clients').findOne({ id: b.client_id, tenant_id: T }) : null
  const sup = await db.collection('suppliers').findOne({ id: b.supplier_id, tenant_id: T })
  if (!sup) return { error: 'المورد غير موجود' }
  if (paymentMethod === 'credit' && !cli) return { error: 'العميل غير موجود' }
  let box = null
  if (paymentMethod === 'cash') {
    if (!b.box_id) return { error: 'اختر الصندوق/البنك للدفع النقدي' }
    box = await db.collection('boxes').findOne({ id: b.box_id, tenant_id: T })
    if (!box) return { error: 'الصندوق غير موجود' }
  }
  const doc = {
    id: opts.existingId || uuidv4(), tenant_id: T, date: new Date(b.date || Date.now()), currency: b.currency,
    exchange_rate: Number(b.exchange_rate) || 1,
    client_id: cli?.id || null, client_name: cli?.name || (paymentMethod === 'cash' ? (b.client_name || 'عميل نقدي') : ''),
    supplier_id: sup.id, supplier_name: sup.name,
    pnr: b.pnr || '', route: b.route || '', passenger_name: b.passenger_name || '',
    passport_no: b.passport_no || '', travel_date: b.travel_date ? new Date(b.travel_date) : null,
    // v3.2 — Travel mode + departure time for smart WhatsApp templates
    travel_mode: b.travel_mode === 'land' ? 'land' : 'air',
    departure_time: b.departure_time || '',
    passenger_whatsapp: b.passenger_whatsapp || b.passenger_phone || '',
    // v2.7 — Non-financial informational fields for printable ticket
    carrier_name: b.carrier_name || '',
    passenger_phone: b.passenger_phone || '',
    passenger_age: b.passenger_age || '',
    id_type: b.id_type || 'هوية شخصية',
    id_issue_place: b.id_issue_place || '',
    id_issue_date: b.id_issue_date || '',
    ticket_number: b.ticket_number || b.pnr || '',
    flight_number: b.flight_number || '',
    ticket_type: b.ticket_type || 'عادي',
    booking_date: b.booking_date ? new Date(b.booking_date) : new Date(b.date || Date.now()),
    arrival_time: b.arrival_time || '',
    departure_time: b.departure_time || '',
    boarding_point: b.boarding_point || '',
    sale_point: b.sale_point || '',
    cost, sale_price: sale, commission,
    payment_method: paymentMethod, box_id: box?.id || null, box_name: box?.name_ar || null,
    created_at: opts.createdAt || new Date(),
    ...(opts.existingId ? { updated_at: new Date() } : {}),
  }
  await db.collection('tickets').insertOne(doc)
  // Balance updates + journal
  await updateBalance(db, 'suppliers', { id: sup.id, tenant_id: T }, b.currency, cost)
  const lines = []
  if (paymentMethod === 'cash') {
    await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: sale, credit: 0 })
  } else {
    await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: sale, credit: 0 })
  }
  lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sup.id, party_name: sup.name, debit: 0, credit: cost })
  lines.push({ account_code: '4101', account_name: 'إيرادات عمولات التذاكر', party_type: 'revenue', party_id: null, party_name: 'إيرادات عمولات التذاكر', debit: 0, credit: commission })
  await createJournalEntry(db, T, {
    date: doc.date, description: `${opts.existingId ? 'تعديل ' : ''}حجز تذكرة ${paymentMethod === 'cash' ? '(نقد)' : '(آجل)'} PNR ${doc.pnr || '-'} — ${cli?.name || doc.client_name || sup.name}`,
    ref_type: 'ticket', ref_id: doc.id, currency: b.currency, lines,
  }, { skipQuota: !!opts.skipQuota })
  const { _id, ...rest } = doc; return { doc: rest }
}

async function createVisa(db, T, b, opts = {}) {
  if (!b.supplier_id) return { error: 'المورد مطلوب' }
  if (!CURRENCIES.includes(b.currency)) return { error: 'عملة غير صالحة' }
  // v3.9.14 — Period lock
  if (b.date) {
    const yr = new Date(b.date).getFullYear()
    const tenant = await db.collection('tenants').findOne({ id: T }, { projection: { closed_years: 1 } })
    if (tenant?.closed_years?.includes(yr)) return { error: `السنة المالية ${yr} مقفلة — لا يمكن إضافة أو تعديل قيود بتاريخها` }
  }
  const paymentMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
  if (paymentMethod === 'credit' && !b.client_id) return { error: 'العميل مطلوب للحجز الآجل' }
  const cost = Number(b.cost) || 0, sale = Number(b.sale_price) || 0
  const commission = +(sale - cost).toFixed(2)
  const cli = b.client_id ? await db.collection('clients').findOne({ id: b.client_id, tenant_id: T }) : null
  const sup = await db.collection('suppliers').findOne({ id: b.supplier_id, tenant_id: T })
  if (!sup) return { error: 'المورد غير موجود' }
  if (paymentMethod === 'credit' && !cli) return { error: 'العميل غير موجود' }
  let box = null
  if (paymentMethod === 'cash') {
    if (!b.box_id) return { error: 'اختر الصندوق/البنك للدفع النقدي' }
    box = await db.collection('boxes').findOne({ id: b.box_id, tenant_id: T })
    if (!box) return { error: 'الصندوق غير موجود' }
  }
  const doc = {
    id: opts.existingId || uuidv4(), tenant_id: T, date: new Date(b.date || Date.now()), service_type: b.service_type || 'تأشيرة عمرة',
    currency: b.currency, exchange_rate: Number(b.exchange_rate) || 1,
    client_id: cli?.id || null, client_name: cli?.name || (paymentMethod === 'cash' ? (b.client_name || 'عميل نقدي') : ''),
    supplier_id: sup.id, supplier_name: sup.name,
    passenger_name: b.passenger_name || '', passport_no: b.passport_no || '',
    nationality: b.nationality || '', attachment_url: b.attachment_url || '',
    // v3.2 — Phone / WhatsApp for direct-contact smart templates
    passenger_phone: b.passenger_phone || '',
    passenger_whatsapp: b.passenger_whatsapp || b.passenger_phone || '',
    // v3.0 — Entry/Exit tracking for expiration alerts
    entry_date: b.entry_date ? new Date(b.entry_date) : null,
    expected_exit_date: b.expected_exit_date ? new Date(b.expected_exit_date) : null,
    is_exited: !!b.is_exited,
    cost, sale_price: sale, commission,
    payment_method: paymentMethod, box_id: box?.id || null, box_name: box?.name_ar || null,
    created_at: opts.createdAt || new Date(),
    ...(opts.existingId ? { updated_at: new Date() } : {}),
  }
  await db.collection('visas').insertOne(doc)
  await updateBalance(db, 'suppliers', { id: sup.id, tenant_id: T }, b.currency, cost)
  const lines = []
  if (paymentMethod === 'cash') {
    await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: sale, credit: 0 })
  } else {
    await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: sale, credit: 0 })
  }
  lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sup.id, party_name: sup.name, debit: 0, credit: cost })
  lines.push({ account_code: '4102', account_name: 'إيرادات عمولات التأشيرات', party_type: 'revenue', party_id: null, party_name: 'إيرادات عمولات التأشيرات', debit: 0, credit: commission })
  await createJournalEntry(db, T, {
    date: doc.date, description: `${opts.existingId ? 'تعديل ' : ''}${doc.service_type} ${paymentMethod === 'cash' ? '(نقد)' : '(آجل)'} — ${doc.passenger_name || cli?.name || doc.client_name || sup.name}`,
    ref_type: 'visa', ref_id: doc.id, currency: b.currency, lines,
  }, { skipQuota: !!opts.skipQuota })
  const { _id, ...rest } = doc; return { doc: rest }
}

// v3.0 — Services: Dedicated dynamic-catalog service transactions (Hotels, Attestations, Transfers, etc.)
// Uses revenue account 4103 (إيرادات خدمات إضافية). Party label = "حساب القبض" but stored the same way.
async function createService(db, T, b, opts = {}) {
  if (!b.client_id || !b.supplier_id) return { error: 'حساب القبض والمورد/المزود مطلوبان' }
  if (!CURRENCIES.includes(b.currency)) return { error: 'عملة غير صالحة' }
  const cost = Number(b.cost) || 0, sale = Number(b.sale_price) || 0
  const commission = +(sale - cost).toFixed(2)
  const cli = await db.collection('clients').findOne({ id: b.client_id, tenant_id: T })
  const sup = await db.collection('suppliers').findOne({ id: b.supplier_id, tenant_id: T })
  if (!cli || !sup) return { error: 'حساب القبض أو المورد غير موجود' }
  const paymentMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
  let box = null
  if (paymentMethod === 'cash') {
    if (!b.box_id) return { error: 'اختر الصندوق/البنك للدفع النقدي' }
    box = await db.collection('boxes').findOne({ id: b.box_id, tenant_id: T })
    if (!box) return { error: 'الصندوق غير موجود' }
  }
  const doc = {
    id: opts.existingId || uuidv4(), tenant_id: T, date: new Date(b.date || Date.now()),
    service_type: b.service_type || 'خدمات متنوعة',
    description: b.description || '',
    currency: b.currency, exchange_rate: Number(b.exchange_rate) || 1,
    client_id: cli.id, client_name: cli.name, supplier_id: sup.id, supplier_name: sup.name,
    beneficiary_name: b.beneficiary_name || '', reference_no: b.reference_no || '',
    // v3.2 — Phone / WhatsApp
    beneficiary_phone: b.beneficiary_phone || '',
    beneficiary_whatsapp: b.beneficiary_whatsapp || b.beneficiary_phone || '',
    notes: b.notes || '',
    cost, sale_price: sale, commission,
    payment_method: paymentMethod, box_id: box?.id || null, box_name: box?.name_ar || null,
    created_at: opts.createdAt || new Date(),
    ...(opts.existingId ? { updated_at: new Date() } : {}),
  }
  await db.collection('services').insertOne(doc)
  await updateBalance(db, 'suppliers', { id: sup.id, tenant_id: T }, b.currency, cost)
  const lines = []
  if (paymentMethod === 'cash') {
    await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: sale, credit: 0 })
  } else {
    await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: '1301', account_name: 'حساب القبض', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: sale, credit: 0 })
  }
  lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sup.id, party_name: sup.name, debit: 0, credit: cost })
  lines.push({ account_code: '4103', account_name: 'إيرادات خدمات إضافية', party_type: 'revenue', party_id: null, party_name: `إيرادات ${doc.service_type}`, debit: 0, credit: commission })
  await createJournalEntry(db, T, {
    date: doc.date, description: `${opts.existingId ? 'تعديل ' : ''}${doc.service_type} ${paymentMethod === 'cash' ? '(نقد)' : '(آجل)'} — ${doc.beneficiary_name || cli.name}`,
    ref_type: 'service', ref_id: doc.id, currency: b.currency, lines,
  }, { skipQuota: !!opts.skipQuota })
  const { _id, ...rest } = doc; return { doc: rest }
}

async function createVoucher(db, T, b, opts = {}) {
  if (!['receipt', 'payment'].includes(b.type)) return { error: 'نوع السند غير صالح' }
  if (!CURRENCIES.includes(b.currency)) return { error: 'عملة غير صالحة' }
  const amount = Number(b.amount) || 0
  if (amount <= 0) return { error: 'المبلغ يجب أن يكون أكبر من صفر' }
  let partyName = ''
  if (b.party_type === 'client') {
    const c = await db.collection('clients').findOne({ id: b.party_id, tenant_id: T })
    if (!c) return { error: 'العميل غير موجود' }; partyName = c.name
  } else if (b.party_type === 'supplier') {
    const s = await db.collection('suppliers').findOne({ id: b.party_id, tenant_id: T })
    if (!s) return { error: 'المورد غير موجود' }; partyName = s.name
  } else if (b.party_type === 'expense') {
    partyName = b.party_name || 'مصروف تشغيلي'
  } else return { error: 'الطرف غير صالح' }
  const box = await db.collection('boxes').findOne({ id: b.box_id, tenant_id: T })
  if (!box) return { error: 'الصندوق/البنك غير موجود' }
  const doc = {
    id: opts.existingId || uuidv4(), tenant_id: T, type: b.type, date: new Date(b.date || Date.now()),
    currency: b.currency, amount, party_type: b.party_type, party_id: b.party_id || null,
    party_name: partyName, box_id: box.id, box_name: box.name_ar,
    method: b.method || (box.type === 'cash' ? 'صندوق' : 'بنك'),
    description: b.description || '', created_at: opts.createdAt || new Date(),
    ...(opts.existingId ? { updated_at: new Date() } : {}),
  }
  await db.collection('vouchers').insertOne(doc)
  if (b.type === 'receipt') {
    await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, b.currency, +amount)
    if (b.party_type === 'client') await updateBalance(db, 'clients', { id: b.party_id, tenant_id: T }, b.currency, -amount)
    if (b.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: b.party_id, tenant_id: T }, b.currency, +amount)
  } else {
    await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, b.currency, -amount)
    if (b.party_type === 'supplier') await updateBalance(db, 'suppliers', { id: b.party_id, tenant_id: T }, b.currency, -amount)
    if (b.party_type === 'client') await updateBalance(db, 'clients', { id: b.party_id, tenant_id: T }, b.currency, +amount)
  }
  const lines = []
  const boxAccCode = box.type === 'cash' ? '1101' : '1201'
  if (b.type === 'receipt') {
    lines.push({ account_code: boxAccCode, account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: amount, credit: 0 })
    if (b.party_type === 'client') lines.push({ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: b.party_id, party_name: partyName, debit: 0, credit: amount })
    if (b.party_type === 'supplier') lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: b.party_id, party_name: partyName, debit: 0, credit: amount })
    if (b.party_type === 'expense') lines.push({ account_code: '4103', account_name: 'إيراد متنوع', party_type: 'revenue', party_id: null, party_name: 'إيراد متنوع', debit: 0, credit: amount })
  } else {
    if (b.party_type === 'supplier') lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: b.party_id, party_name: partyName, debit: amount, credit: 0 })
    if (b.party_type === 'client') lines.push({ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: b.party_id, party_name: partyName, debit: amount, credit: 0 })
    if (b.party_type === 'expense') lines.push({ account_code: '5101', account_name: 'مصاريف تشغيلية', party_type: 'expense', party_id: null, party_name: partyName, debit: amount, credit: 0 })
    lines.push({ account_code: boxAccCode, account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: 0, credit: amount })
  }
  await createJournalEntry(db, T, {
    date: doc.date,
    description: (b.type === 'receipt' ? 'سند قبض — ' : 'سند صرف — ') + (doc.description || partyName),
    ref_type: b.type === 'receipt' ? 'receipt' : 'payment', ref_id: doc.id, currency: b.currency, lines,
  }, { skipQuota: !!opts.skipQuota })
  const { _id, ...rest } = doc; return { doc: rest }
}

async function resolveAccountRef(db, T, ref) {
  if (!ref || !ref.id) return null
  if (ref.kind === 'client') {
    const d = await db.collection('clients').findOne({ id: ref.id, tenant_id: T })
    return d ? { kind: 'client', id: d.id, name: d.name, code: '1301', updateBalance: true, collection: 'clients', debitSign: +1 } : null
  }
  if (ref.kind === 'supplier') {
    const d = await db.collection('suppliers').findOne({ id: ref.id, tenant_id: T })
    return d ? { kind: 'supplier', id: d.id, name: d.name, code: '2101', updateBalance: true, collection: 'suppliers', debitSign: -1 } : null
  }
  if (ref.kind === 'box') {
    const d = await db.collection('boxes').findOne({ id: ref.id, tenant_id: T })
    return d ? { kind: 'box', id: d.id, name: d.name_ar, code: d.type === 'cash' ? '1101' : '1201', updateBalance: true, collection: 'boxes', debitSign: +1 } : null
  }
  if (ref.kind === 'account') {
    const d = await db.collection('accounts').findOne({ id: ref.id, tenant_id: T })
    return d ? { kind: 'account', id: d.id, name: d.name_ar || d.name, code: d.code, updateBalance: false, collection: 'accounts', debitSign: +1 } : null
  }
  return null
}

async function createFx(db, T, b, opts = {}) {
  if (!['buy', 'sell'].includes(b.type)) return { error: 'نوع العملية غير صالح' }
  if (!CURRENCIES.includes(b.currency) || !CURRENCIES.includes(b.counter_currency)) return { error: 'العملات غير صالحة' }
  if (b.currency === b.counter_currency) return { error: 'يجب اختيار عملتين مختلفتين' }
  const amount = Number(b.amount) || 0
  const rate = Number(b.exchange_rate) || 0
  if (amount <= 0 || rate <= 0) return { error: 'المبلغ وسعر الصرف مطلوبان' }
  const counter_amount = +(amount * rate).toFixed(2)
  const payment_method = b.payment_method === 'account' ? 'account' : 'cash'
  // Resolve refs — 'cash' uses box_currency_id/box_counter_id; 'account' uses currency_ref/counter_ref (or falls back)
  const refCur = b.currency_ref ? { kind: b.currency_ref.kind, id: b.currency_ref.id } : { kind: 'box', id: b.box_currency_id }
  const refCounter = b.counter_ref ? { kind: b.counter_ref.kind, id: b.counter_ref.id } : { kind: 'box', id: b.box_counter_id }
  const accCur = await resolveAccountRef(db, T, refCur)
  const accCounter = await resolveAccountRef(db, T, refCounter)
  if (!accCur || !accCounter) return { error: payment_method === 'cash' ? 'اختر صناديق العملتين' : 'اختر الحسابين للطرفين' }
  const rates = (await db.collection('tenant_settings').findOne({ tenant_id: T }))?.rates || DEFAULT_RATES
  const inBase = toBase(amount, b.currency, rates)
  const outBase = toBase(counter_amount, b.counter_currency, rates)
  const fx_gain_base = +(b.type === 'buy' ? (inBase - outBase) : (outBase - inBase)).toFixed(4)
  const doc = {
    id: opts.existingId || uuidv4(), tenant_id: T, type: b.type,
    date: new Date(b.date || Date.now()),
    currency: b.currency, amount, exchange_rate: rate,
    counter_currency: b.counter_currency, counter_amount,
    payment_method,
    // Backwards-compat + new schema
    box_currency_id: accCur.id, box_currency_name: accCur.name,
    box_counter_id: accCounter.id, box_counter_name: accCounter.name,
    currency_ref: { kind: accCur.kind, id: accCur.id, name: accCur.name, code: accCur.code },
    counter_ref: { kind: accCounter.kind, id: accCounter.id, name: accCounter.name, code: accCounter.code },
    customer_name: b.customer_name || '',
    customer_phone: b.customer_phone || '',
    id_type: b.id_type || '',
    id_number: b.id_number || '',
    source_of_funds: b.source_of_funds || '',
    purpose: b.purpose || '',
    remarks: b.remarks || '',
    fx_gain_base, fx_gain_usd: fx_gain_base,
    created_at: opts.createdAt || new Date(),
    ...(opts.existingId ? { updated_at: new Date() } : {}),
  }
  await db.collection('currency_exchanges').insertOne(doc)
  // Balance updates — only for accounts that track balances (client/supplier/box); COA accounts skip.
  // Buy: office receives `amount currency` (debit refCur), pays `counter_amount counter_currency` (credit refCounter)
  // Sell: opposite
  const debitAmtCur = b.type === 'buy' ? amount : -amount
  const debitAmtCounter = b.type === 'buy' ? -counter_amount : counter_amount
  if (accCur.updateBalance) {
    await updateBalance(db, accCur.collection, { id: accCur.id, tenant_id: T }, b.currency, debitAmtCur * accCur.debitSign)
  }
  if (accCounter.updateBalance) {
    await updateBalance(db, accCounter.collection, { id: accCounter.id, tenant_id: T }, b.counter_currency, debitAmtCounter * accCounter.debitSign)
  }
  const lines = []
  if (b.type === 'buy') {
    lines.push({ account_code: accCur.code, account_name: accCur.name, party_type: accCur.kind, party_id: accCur.id, party_name: accCur.name, currency: b.currency, debit: amount, credit: 0 })
    lines.push({ account_code: accCounter.code, account_name: accCounter.name, party_type: accCounter.kind, party_id: accCounter.id, party_name: accCounter.name, currency: b.counter_currency, debit: 0, credit: counter_amount })
  } else {
    lines.push({ account_code: accCounter.code, account_name: accCounter.name, party_type: accCounter.kind, party_id: accCounter.id, party_name: accCounter.name, currency: b.counter_currency, debit: counter_amount, credit: 0 })
    lines.push({ account_code: accCur.code, account_name: accCur.name, party_type: accCur.kind, party_id: accCur.id, party_name: accCur.name, currency: b.currency, debit: 0, credit: amount })
  }
  if (Math.abs(fx_gain_base) > 0.005) {
    if (fx_gain_base > 0) {
      lines.push({ account_code: '4104', account_name: 'أرباح فروق العملات', party_type: 'revenue', party_id: null, party_name: 'أرباح فروق العملات', currency: BASE_CURRENCY, debit: 0, credit: +fx_gain_base.toFixed(2) })
    } else {
      lines.push({ account_code: '4104', account_name: 'خسائر فروق العملات', party_type: 'revenue', party_id: null, party_name: 'خسائر فروق العملات', currency: BASE_CURRENCY, debit: +Math.abs(fx_gain_base).toFixed(2), credit: 0 })
    }
  }
  await createJournalEntry(db, T, {
    date: doc.date,
    description: `${opts.existingId ? 'تعديل ' : ''}${b.type === 'buy' ? 'شراء عملة' : 'بيع عملة'} — ${amount} ${b.currency} @ ${rate} ${b.counter_currency}${doc.customer_name ? ' — ' + doc.customer_name : ''}${payment_method === 'account' ? ' [حساب]' : ''}`,
    ref_type: b.type === 'buy' ? 'fx_buy' : 'fx_sell',
    ref_id: doc.id, currency: 'MULTI', lines,
  }, { skipQuota: !!opts.skipQuota })
  const { _id, ...rest } = doc; return { doc: rest }
}

async function createManualJournal(db, T, b, opts = {}) {
  // Modes:
  //  A) single: { date, currency, description, lines: [...] }
  //  B) dual:   { date, description, dual: true, debit_*, credit_* }
  if (b.dual) {
    const da = Number(b.debit_amount) || 0
    const ca = Number(b.credit_amount) || 0
    if (da <= 0 || ca <= 0) return { error: 'المبالغ يجب أن تكون أكبر من صفر' }
    if (!CURRENCIES.includes(b.debit_currency) || !CURRENCIES.includes(b.credit_currency)) return { error: 'العملات غير صالحة' }
    const rates = (await db.collection('tenant_settings').findOne({ tenant_id: T }))?.rates || DEFAULT_RATES
    const debitInBase = toBase(da, b.debit_currency, rates)
    const creditInBase = toBase(ca, b.credit_currency, rates)
    const fxDiff = +(debitInBase - creditInBase).toFixed(4)
    const lines = [
      { account_code: b.debit_account_code || 'MANUAL', account_name: b.debit_account_name || 'حساب مدين', party_type: b.debit_party_type || 'manual', party_id: b.debit_party_id || null, party_name: b.debit_party_name || b.debit_account_name || '—', currency: b.debit_currency, debit: da, credit: 0 },
      { account_code: b.credit_account_code || 'MANUAL', account_name: b.credit_account_name || 'حساب دائن', party_type: b.credit_party_type || 'manual', party_id: b.credit_party_id || null, party_name: b.credit_party_name || b.credit_account_name || '—', currency: b.credit_currency, debit: 0, credit: ca },
    ]
    if (Math.abs(fxDiff) > 0.005) {
      if (fxDiff > 0) lines.push({ account_code: '4104', account_name: 'أرباح فروق العملات', party_type: 'revenue', party_id: null, party_name: 'أرباح فروق العملات', currency: BASE_CURRENCY, debit: 0, credit: +fxDiff.toFixed(2) })
      else lines.push({ account_code: '4104', account_name: 'خسائر فروق العملات', party_type: 'revenue', party_id: null, party_name: 'خسائر فروق العملات', currency: BASE_CURRENCY, debit: +Math.abs(fxDiff).toFixed(2), credit: 0 })
    }
    for (const side of ['debit', 'credit']) {
      const pt = b[`${side}_party_type`], pid = b[`${side}_party_id`], cur = b[`${side}_currency`]
      const amt = side === 'debit' ? da : ca
      if (pt === 'client' && pid) await updateBalance(db, 'clients', { id: pid, tenant_id: T }, cur, side === 'debit' ? amt : -amt)
      if (pt === 'supplier' && pid) await updateBalance(db, 'suppliers', { id: pid, tenant_id: T }, cur, side === 'debit' ? -amt : amt)
      if (pt === 'box' && pid) await updateBalance(db, 'boxes', { id: pid, tenant_id: T }, cur, side === 'debit' ? amt : -amt)
    }
    const je = await createJournalEntry(db, T, {
      date: b.date, description: (opts.existingId ? 'تعديل — ' : '') + (b.description || 'سند قيد ثنائي (مصارفة/تسوية)'),
      ref_type: 'manual_dual', ref_id: opts.existingId || uuidv4(), currency: 'MULTI', lines,
    }, { skipQuota: !!opts.skipQuota, existingJeId: opts.existingId, createdAt: opts.createdAt })
    return { doc: { ...je, _id: undefined, fx_diff_usd: fxDiff } }
  }
  // Single-currency manual JE
  if (!CURRENCIES.includes(b.currency)) return { error: 'عملة غير صالحة' }
  const lines = Array.isArray(b.lines) ? b.lines : []
  if (lines.length < 2) return { error: 'يجب إدخال طرفين على الأقل' }
  const totalD = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalC = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  if (Math.abs(totalD - totalC) > 0.01) return { error: `القيد غير متوازن: مدين ${totalD.toFixed(2)} ≠ دائن ${totalC.toFixed(2)}` }
  for (const l of lines) {
    const debit = Number(l.debit) || 0, credit = Number(l.credit) || 0
    const delta = debit - credit
    if (l.party_type === 'client' && l.party_id) await updateBalance(db, 'clients', { id: l.party_id, tenant_id: T }, b.currency, delta)
    if (l.party_type === 'supplier' && l.party_id) await updateBalance(db, 'suppliers', { id: l.party_id, tenant_id: T }, b.currency, -delta)
    if (l.party_type === 'box' && l.party_id) await updateBalance(db, 'boxes', { id: l.party_id, tenant_id: T }, b.currency, delta)
  }
  const je = await createJournalEntry(db, T, {
    date: b.date, description: (opts.existingId ? 'تعديل — ' : '') + (b.description || 'قيد يومية يدوي'),
    ref_type: 'manual', ref_id: opts.existingId || uuidv4(), currency: b.currency,
    lines: lines.map(l => ({
      account_code: l.account_code || 'MANUAL', account_name: l.account_name || '—',
      party_type: l.party_type || 'manual', party_id: l.party_id || null, party_name: l.party_name || l.account_name || '—',
      currency: b.currency,
      debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
    })),
  }, { skipQuota: !!opts.skipQuota, existingJeId: opts.existingId, createdAt: opts.createdAt })
  return { doc: { ...je, _id: undefined } }
}

async function computeDashboard(db, T) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30)
  const tf = { tenant_id: T }
  const rates = (await db.collection('tenant_settings').findOne(tf))?.rates || DEFAULT_RATES

  const [ticketsToday, visasToday, servicesToday, ticketsMonth, visasMonth, servicesMonth] = await Promise.all([
    db.collection('tickets').find({ ...tf, date: { $gte: todayStart } }).toArray(),
    db.collection('visas').find({ ...tf, date: { $gte: todayStart } }).toArray(),
    db.collection('services').find({ ...tf, date: { $gte: todayStart } }).toArray(),
    db.collection('tickets').find({ ...tf, date: { $gte: monthAgo } }).toArray(),
    db.collection('visas').find({ ...tf, date: { $gte: monthAgo } }).toArray(),
    db.collection('services').find({ ...tf, date: { $gte: monthAgo } }).toArray(),
  ])
  const kpiSales = { USD: 0, SAR: 0, YER: 0 }, kpiProfit = { USD: 0, SAR: 0, YER: 0 }
  for (const t of [...ticketsToday, ...visasToday, ...servicesToday]) { kpiSales[t.currency] += t.sale_price || 0; kpiProfit[t.currency] += t.commission || 0 }
  const dayMap = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
    const key = d.toISOString().slice(0, 10); dayMap[key] = { date: key, sales: 0, profit: 0 }
  }
  for (const t of [...ticketsMonth, ...visasMonth, ...servicesMonth]) {
    const key = new Date(t.date).toISOString().slice(0, 10)
    if (dayMap[key]) { const r = getTransferRate(rates, t.currency); dayMap[key].sales += (t.sale_price||0)*r; dayMap[key].profit += (t.commission||0)*r }
  }
  for (const k of Object.keys(dayMap)) { dayMap[k].sales = +dayMap[k].sales.toFixed(2); dayMap[k].profit = +dayMap[k].profit.toFixed(2) }
  const pieMap = { 'تذاكر': 0, 'تأشيرات عمرة': 0, 'تأشيرات سياحية/عمل': 0, 'موافقات أمنية': 0, 'حجز فنادق': 0, 'خدمات إضافية': 0, 'أخرى': 0 }
  for (const t of ticketsMonth) pieMap['تذاكر'] += (t.commission||0)*getTransferRate(rates, t.currency)
  for (const v of visasMonth) {
    const st = v.service_type || 'أخرى'
    let key = 'أخرى'
    if (st.includes('عمرة')) key = 'تأشيرات عمرة'
    else if (st.includes('موافق')) key = 'موافقات أمنية'
    else if (st.includes('فندق')) key = 'حجز فنادق'
    else if (st.includes('سياح') || st.includes('عمل')) key = 'تأشيرات سياحية/عمل'
    pieMap[key] += (v.commission||0)*getTransferRate(rates, v.currency)
  }
  for (const s of servicesMonth) {
    const st = s.service_type || 'خدمات إضافية'
    let key = 'خدمات إضافية'
    if (st.includes('فندق')) key = 'حجز فنادق'
    pieMap[key] += (s.commission||0)*getTransferRate(rates, s.currency)
  }

  // v3.0 — Visa expiration alerts: visas within 10 days of expected exit, not yet exited
  const in10Days = new Date(now); in10Days.setDate(in10Days.getDate() + 10)
  const visaAlerts = await db.collection('visas').find({
    tenant_id: T,
    is_exited: { $ne: true },
    expected_exit_date: { $ne: null, $gte: todayStart, $lte: in10Days },
  }).sort({ expected_exit_date: 1 }).limit(50).toArray()
  // Also flag visas that have already passed expected exit
  const overdue = await db.collection('visas').find({
    tenant_id: T,
    is_exited: { $ne: true },
    expected_exit_date: { $ne: null, $lt: todayStart },
  }).sort({ expected_exit_date: 1 }).limit(50).toArray()
  const alertRows = await Promise.all([...overdue, ...visaAlerts].map(async v => {
    const exit = new Date(v.expected_exit_date)
    const daysLeft = Math.ceil((exit - now) / 86400000)
    // v3.2 — Resolve phone from client if visa row doesn't have one
    let phone = v.passenger_phone || ''
    let whatsapp = v.passenger_whatsapp || v.passenger_phone || ''
    if (!phone && v.client_id) {
      const c = await db.collection('clients').findOne({ id: v.client_id, tenant_id: T })
      if (c) { phone = c.phone || ''; whatsapp = c.whatsapp || c.phone || '' }
    }
    return {
      id: v.id, service_type: v.service_type, passenger_name: v.passenger_name || v.client_name || '—',
      passport_no: v.passport_no || '', nationality: v.nationality || '',
      client_name: v.client_name, entry_date: v.entry_date, expected_exit_date: v.expected_exit_date,
      passenger_phone: phone, passenger_whatsapp: whatsapp,
      days_left: daysLeft, overdue: daysLeft < 0,
    }
  }))

  const recentTickets = await db.collection('tickets').find(tf).sort({ created_at: -1 }).limit(5).toArray()
  const recentVisas   = await db.collection('visas').find(tf).sort({ created_at: -1 }).limit(5).toArray()
  const recentServices= await db.collection('services').find(tf).sort({ created_at: -1 }).limit(5).toArray()
  const recentVouchers= await db.collection('vouchers').find(tf).sort({ created_at: -1 }).limit(5).toArray()
  const activity = [
    ...recentTickets.map(t => ({ kind: 'ticket', id: t.id, when: t.created_at, title: `تذكرة ${t.pnr || ''} — ${t.client_name}`, subtitle: `${t.route || ''} • ${t.currency} ${t.sale_price}`, amount: t.commission, currency: t.currency })),
    ...recentVisas.map(v => ({ kind: 'visa', id: v.id, when: v.created_at, title: `${v.service_type} — ${v.passenger_name || v.client_name}`, subtitle: `${v.currency} ${v.sale_price}`, amount: v.commission, currency: v.currency })),
    ...recentServices.map(s => ({ kind: 'service', id: s.id, when: s.created_at, title: `${s.service_type} — ${s.beneficiary_name || s.client_name}`, subtitle: `${s.currency} ${s.sale_price}`, amount: s.commission, currency: s.currency })),
    ...recentVouchers.map(x => ({ kind: x.type, id: x.id, when: x.created_at, title: `${x.type === 'receipt' ? 'سند قبض' : 'سند صرف'} — ${x.party_name}`, subtitle: `${x.currency} ${x.amount}`, amount: x.amount, currency: x.currency })),
  ].sort((a, b) => new Date(b.when) - new Date(a.when)).slice(0, 12)
  return {
    kpi: {
      sales_today: kpiSales, profit_today: kpiProfit,
      count_today: ticketsToday.length + visasToday.length + servicesToday.length,
      tickets_today: ticketsToday.length, visas_today: visasToday.length, services_today: servicesToday.length,
    },
    line: Object.values(dayMap),
    pie: Object.entries(pieMap).map(([name, value]) => ({ name, value: +value.toFixed(2) })).filter(x => x.value > 0),
    activity,
    visa_alerts: alertRows,
  }
}

async function reportProfits(db, T, q) {
  const from = q.from ? new Date(q.from) : new Date(0)
  const to = q.to ? new Date(q.to) : new Date(); to.setHours(23,59,59,999)
  const tf = { tenant_id: T, date: { $gte: from, $lte: to } }
  const [tickets, visas, services] = await Promise.all([
    db.collection('tickets').find(tf).sort({ date: 1 }).toArray(),
    db.collection('visas').find(tf).sort({ date: 1 }).toArray(),
    db.collection('services').find(tf).sort({ date: 1 }).toArray(),
  ])
  const rows = [
    ...tickets.map(t => ({ id: t.id, kind: 'تذكرة', date: t.date, client: t.client_name, supplier: t.supplier_name, ref: t.pnr || t.route, currency: t.currency, cost: t.cost, sale: t.sale_price, profit: t.commission })),
    ...visas.map(v => ({ id: v.id, kind: v.service_type, date: v.date, client: v.client_name, supplier: v.supplier_name, ref: v.passenger_name || v.passport_no, currency: v.currency, cost: v.cost, sale: v.sale_price, profit: v.commission })),
    ...services.map(s => ({ id: s.id, kind: s.service_type, date: s.date, client: s.client_name, supplier: s.supplier_name, ref: s.beneficiary_name || s.reference_no, currency: s.currency, cost: s.cost, sale: s.sale_price, profit: s.commission })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))
  const totals = { USD: 0, SAR: 0, YER: 0 }, totalSales = { USD: 0, SAR: 0, YER: 0 }
  for (const r of rows) { totals[r.currency] += r.profit; totalSales[r.currency] += r.sale }
  return { rows, totals_profit: totals, totals_sales: totalSales }
}
async function reportStatement(db, T, q) {
  const { party_type, party_id } = q
  if (!party_type || !party_id) throw new Error('نوع الطرف والمعرف مطلوبان')

  // Time period filter
  let dateFilter = null
  const now = new Date()
  if (q.period === 'day') {
    const d = q.day ? new Date(q.day) : now
    dateFilter = { $gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()), $lte: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999) }
  } else if (q.period === 'month') {
    const [y, m] = (q.month || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`).split('-').map(Number)
    dateFilter = { $gte: new Date(y, m-1, 1), $lte: new Date(y, m, 0, 23,59,59,999) }
  } else if (q.period === 'range') {
    const start = q.from ? new Date(q.from) : new Date(0)
    const end = q.to ? new Date(q.to) : new Date(); end.setHours(23,59,59,999)
    dateFilter = { $gte: start, $lte: end }
  } else if (q.period === 'up_to_date' && q.to) {
    const end = new Date(q.to); end.setHours(23,59,59,999)
    dateFilter = { $lte: end }
  }

  const filter = { tenant_id: T }
  if (dateFilter) filter.date = dateFilter

  const jes = await db.collection('journal_entries').find(filter).sort({ date: 1, created_at: 1 }).toArray()
  const rows = []
  const run = { USD: 0, SAR: 0, YER: 0 }
  const totals = { USD: { d: 0, c: 0 }, SAR: { d: 0, c: 0 }, YER: { d: 0, c: 0 } }
  for (const je of jes) {
    for (const l of je.lines || []) {
      if (l.party_type === party_type && l.party_id === party_id) {
        const cur = l.currency || je.currency
        if (!['USD','SAR','YER'].includes(cur)) continue
        let delta = 0
        if (party_type === 'client') delta = (l.debit || 0) - (l.credit || 0)
        else if (party_type === 'supplier') delta = (l.credit || 0) - (l.debit || 0)
        else if (party_type === 'box') delta = (l.debit || 0) - (l.credit || 0)
        else delta = (l.debit || 0) - (l.credit || 0)  // generic COA account (asset convention)
        run[cur] += delta
        totals[cur].d += l.debit || 0
        totals[cur].c += l.credit || 0
        rows.push({ date: je.date, description: je.description, ref_type: je.ref_type, currency: cur, debit: l.debit || 0, credit: l.credit || 0, balance: run[cur] })
      }
    }
  }

  let party = null
  if (party_type === 'client') party = await db.collection('clients').findOne({ id: party_id, tenant_id: T })
  else if (party_type === 'supplier') party = await db.collection('suppliers').findOne({ id: party_id, tenant_id: T })
  else if (party_type === 'box') {
    const b = await db.collection('boxes').findOne({ id: party_id, tenant_id: T })
    if (b) party = { id: b.id, name: b.name_ar, phone: '', balances: b.balances }
  } else if (party_type === 'account') {
    const a = await db.collection('accounts').findOne({ id: party_id, tenant_id: T })
    if (a) party = { id: a.id, name: `${a.code} — ${a.name_ar || a.name}`, phone: '', balances: {} }
  }

  // Currency display mode: 'all_summary' | 'all_detail' | 'USD' | 'SAR' | 'YER'
  const mode = q.currency_mode || 'all_detail'
  let finalRows = rows
  if (['USD','SAR','YER'].includes(mode)) finalRows = rows.filter(r => r.currency === mode)

  const summary = CURRENCIES.map(c => ({ currency: c, total_debit: +totals[c].d.toFixed(2), total_credit: +totals[c].c.toFixed(2), balance: +run[c].toFixed(2) }))

  return {
    party: party ? { id: party.id, name: party.name, phone: party.phone, balances: party.balances } : null,
    rows: mode === 'all_summary' ? [] : finalRows,
    summary, currency_mode: mode, period: q.period || 'all',
  }
}
async function reportTrialBalance(db, T) {
  const jes = await db.collection('journal_entries').find({ tenant_id: T }).toArray()
  const map = {}
  for (const je of jes) {
    for (const l of je.lines || []) {
      const cur = l.currency || je.currency
      const label = l.party_name || l.account_name
      const key = `${l.account_code}|${cur}|${label}`
      if (!map[key]) map[key] = { code: l.account_code, name: l.account_name, party_name: l.party_name, currency: cur, debit: 0, credit: 0 }
      map[key].debit += l.debit || 0; map[key].credit += l.credit || 0
    }
  }
  const rows = Object.values(map).map(r => ({ ...r, balance: r.debit - r.credit }))
  const totals = { USD: { d: 0, c: 0 }, SAR: { d: 0, c: 0 }, YER: { d: 0, c: 0 } }
  for (const r of rows) { if (totals[r.currency]) { totals[r.currency].d += r.debit; totals[r.currency].c += r.credit } }
  return { rows, totals }
}
async function reportIncome(db, T, q) {
  // v3.9.14 — accept year param
  let from, to
  if (q.year) {
    const yr = parseInt(q.year)
    from = new Date(yr, 0, 1); to = new Date(yr, 11, 31, 23, 59, 59)
  } else {
    from = q.from ? new Date(q.from) : new Date(0)
    to = q.to ? new Date(q.to) : new Date(); to.setHours(23,59,59,999)
  }
  const tf = { tenant_id: T, date: { $gte: from, $lte: to } }
  const rates = (await db.collection('tenant_settings').findOne({ tenant_id: T }))?.rates || DEFAULT_RATES
  const [tickets, visas, services, vouchers, jes] = await Promise.all([
    db.collection('tickets').find(tf).toArray(),
    db.collection('visas').find(tf).toArray(),
    db.collection('services').find(tf).toArray(),
    db.collection('vouchers').find({ ...tf, type: 'payment', party_type: 'expense' }).toArray(),
    db.collection('journal_entries').find(tf).toArray(),
  ])
  const rev = { tickets: {USD:0,SAR:0,YER:0}, visas: {USD:0,SAR:0,YER:0}, services: {USD:0,SAR:0,YER:0}, other: {USD:0,SAR:0,YER:0} }
  for (const t of tickets) rev.tickets[t.currency] += t.commission || 0
  for (const v of visas) rev.visas[v.currency] += v.commission || 0
  for (const s of services) rev.services[s.currency] += s.commission || 0
  const exp = { USD:0, SAR:0, YER:0 }
  for (const p of vouchers) exp[p.currency] += p.amount || 0
  // FX gain/loss from account 4104 (already stored in BASE currency = YER)
  let fx_gain_base = 0
  for (const je of jes) {
    for (const l of je.lines || []) {
      if (l.account_code === '4104') fx_gain_base += (l.credit || 0) - (l.debit || 0)
    }
  }
  const totalRevBase = Object.values(rev).reduce((s, cur) => s + Object.entries(cur).reduce((ss, [c, v]) => ss + toBase(v, c, rates), 0), 0) + fx_gain_base
  const totalExpBase = Object.entries(exp).reduce((s, [c, v]) => s + toBase(v, c, rates), 0)
  return {
    base_currency: BASE_CURRENCY,
    revenue: rev, expenses: exp,
    fx_gain_base: +fx_gain_base.toFixed(2),
    total_revenue_base: +totalRevBase.toFixed(2),
    total_expenses_base: +totalExpBase.toFixed(2),
    net_profit_base: +(totalRevBase - totalExpBase).toFixed(2),
    // Backward compat aliases
    fx_gain_usd: +fx_gain_base.toFixed(2),
    total_revenue_usd: +totalRevBase.toFixed(2),
    total_expenses_usd: +totalExpBase.toFixed(2),
    net_profit_usd: +(totalRevBase - totalExpBase).toFixed(2),
  }
}

// Dedicated HEAD handler — required for UptimeRobot / uptime monitors which prefer HEAD requests.
// For /health, respond immediately without auth. For other paths, delegate to standard handler.
async function handleHead(request, ctx) {
  const url = new URL(request.url)
  const path = url.pathname
  if (path === '/api/health' || path.endsWith('/api/health')) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
  return handleRoute(request, ctx)
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
export const HEAD = handleHead
