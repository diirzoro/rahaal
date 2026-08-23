import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import sharp from 'sharp'

// v3.47 — Package image optimization settings (applied ONCE at upload; centralized — adjust here)
const IMG_MAX_DIM = 1200        // longest side in px (aspect ratio preserved, never enlarged)
const IMG_WEBP_QUALITY = 82     // web-optimized quality (80–85 range)

// ---------- MongoDB ----------
let client, db
// v3.45 — Fix latent race: concurrent requests during cold start could see `client` set
// before `db` was ready (500: Cannot read properties of undefined). Cache the connect promise.
let mongoConnectPromise = null
async function connectToMongo() {
  if (db) return db
  if (!mongoConnectPromise) {
    mongoConnectPromise = (async () => {
      // v3.10.1 — Fail-fast with clear error when env vars are missing (prevents obscure "startsWith of undefined" from mongodb driver)
      if (!process.env.MONGO_URL || typeof process.env.MONGO_URL !== 'string') {
        throw new Error('MONGO_URL environment variable is required (missing in this deployment environment)')
      }
      if (!process.env.DB_NAME) throw new Error('DB_NAME environment variable is required')
      client = new MongoClient(process.env.MONGO_URL)
      await client.connect()
      const d = client.db(process.env.DB_NAME)
      await seedInitial(d)
      db = d
      return d
    })().catch((e) => { mongoConnectPromise = null; client = null; throw e })
  }
  return mongoConnectPromise
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
    // v3.10.7 — Restructured expenses per user COA requirements:
    //   51 = مصاريف تشغيلية,  52 = مصاريف إدارية عمومية,  53 = فروق العمولات
    { id: uuidv4(), tenant_id: t, code: '51', name_ar: 'مصاريف تشغيلية', type: 'expense', parent: '5', is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '52', name_ar: 'مصاريف إدارية عمومية', type: 'expense', parent: '5', is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '53', name_ar: 'فروق العمولات', type: 'expense', parent: '5', is_group: true, created_at: now },
    // Legacy 4-digit expense sub-accounts kept for backward compatibility with existing data
    { id: uuidv4(), tenant_id: t, code: '5101', name_ar: 'مصاريف تشغيلية (تفصيلي)', type: 'expense', parent: '51', is_group: true, created_at: now },
    { id: uuidv4(), tenant_id: t, code: '5201', name_ar: 'فروق عملة وتسويات', type: 'expense', parent: '52', is_group: false, created_at: now },
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
  can_close_periods: false,  // v3.10.6 — permission to lock/unlock financial periods
  can_refund: false,          // v3.10.6 — permission to refund/cancel transactions
  // v3.45 — RBAC Phase 1: module-level access (sidebar sections).
  // Operational modules default ON for staff; financial/sensitive modules default OFF.
  mod_dashboard: true, mod_tickets: true, mod_visas: true, mod_services: true, mod_packages: true,
  mod_meraaj: false, mod_visa_monitor: true, mod_query: false, mod_fx: false,
  mod_receipt: true, mod_payment: false, mod_clients: true, mod_suppliers: false,
  mod_boxes: false, mod_chart: false, mod_journal: false, mod_reports: false,
  mod_affiliate: false, mod_help: true,
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
// v3.45 — RBAC role templates: baseline presets applied by the owner, then per-employee
// checkbox edits act as individual overrides (stored on the user document).
function rbacAllPerms(v) { const p = {}; for (const k of Object.keys(DEFAULT_STAFF_PERMISSIONS)) p[k] = v; return p }
function RBAC_ROLE_TEMPLATES() {
  const base = (over) => ({ ...rbacAllPerms(false), mod_dashboard: true, mod_help: true, ...over })
  return [
    { key: 'registrar', label: '🧾 موظف تسجيل', desc: 'تسجيل الزبائن في الباكجات فقط — بدون أي أرقام مالية أو أرباح', perms: base({ mod_packages: true, mod_clients: true }) },
    { key: 'sales', label: '💼 موظف مبيعات', desc: 'بيع التذاكر والتأشيرات والخدمات والباكجات + سند قبض — بدون أرباح أو خصومات', perms: base({ mod_tickets: true, mod_visas: true, mod_services: true, mod_packages: true, mod_clients: true, mod_receipt: true, mod_visa_monitor: true, tickets_view: true, tickets_add: true, visas_view: true, visas_add: true, services_view: true, services_add: true, vouchers_manage: true }) },
    { key: 'sales_manager', label: '📈 مدير مبيعات', desc: 'كل المبيعات + الأرباح والخصومات ومتجر معراج والاستعلامات', perms: base({ mod_tickets: true, mod_visas: true, mod_services: true, mod_packages: true, mod_meraaj: true, mod_clients: true, mod_receipt: true, mod_visa_monitor: true, mod_query: true, mod_reports: true, tickets_view: true, tickets_add: true, tickets_edit: true, tickets_delete: true, visas_view: true, visas_add: true, visas_edit: true, visas_delete: true, services_view: true, services_add: true, services_edit: true, services_delete: true, vouchers_manage: true, reports_view: true, show_profit: true, edit_price: true, apply_discount: true, can_refund: true }) },
    { key: 'accountant', label: '🧮 محاسب', desc: 'السندات والقيود والصناديق والدليل والتقارير المالية والصرافة', perms: base({ mod_receipt: true, mod_payment: true, mod_fx: true, mod_clients: true, mod_suppliers: true, mod_boxes: true, mod_chart: true, mod_journal: true, mod_reports: true, mod_query: true, tickets_view: true, visas_view: true, services_view: true, vouchers_manage: true, accounts_manage: true, reports_view: true, show_profit: true }) },
    { key: 'full_manager', label: '👑 مدير كامل', desc: 'جميع الصلاحيات — مطابق للمالك', perms: rbacAllPerms(true) },
  ]
}

// v3.4 — Affiliate defaults
const AFFILIATE_COMMISSION_RATE = 0.10
const AFFILIATE_MIN_CASHOUT_INDIVIDUAL = 10
const AFFILIATE_MIN_CASHOUT_OFFICE = 50

async function seedInitial(db) {
  // Production safety guard (permanent architecture rule):
  // When DISABLE_AUTO_SEED=true is set in the environment, skip ALL seed / insert / delete /
  // index-creation operations below. The application will only READ from the existing
  // production database. Set this to 'true' on the Live Server env file (/etc/rahaal.env).
  if (process.env.DISABLE_AUTO_SEED === 'true') return

  // Purge legacy data lacking tenant_id (from earlier MVP)
  for (const c of ['accounts', 'boxes', 'clients', 'suppliers', 'tickets', 'visas', 'vouchers', 'journal_entries', 'settings']) {
    await db.collection(c).deleteMany({ tenant_id: { $exists: false } }).catch(() => {})
  }

  // v3.10.2 — Enforce unique account code per tenant (chart of accounts + sub-accounts)
  try {
    await db.collection('accounts').createIndex({ tenant_id: 1, code: 1 }, { unique: true, name: 'unique_tenant_account_code' })
    await db.collection('clients').createIndex({ tenant_id: 1, account_code: 1 }, { unique: true, sparse: true, name: 'unique_tenant_client_code' })
    await db.collection('suppliers').createIndex({ tenant_id: 1, account_code: 1 }, { unique: true, sparse: true, name: 'unique_tenant_supplier_code' })
    await db.collection('boxes').createIndex({ tenant_id: 1, account_code: 1 }, { unique: true, sparse: true, name: 'unique_tenant_box_code' })
  } catch (e) { /* Indexes may already exist */ }

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

  // Super Admin bootstrap — password comes ONLY from env (Secrets Policy §24/25).
  // If SEED_SUPER_ADMIN_PASSWORD is not set, the super admin is NOT created.
  const admins = db.collection('users')
  const superAdmin = await admins.findOne({ role: 'super_admin' })
  if (!superAdmin) {
    if (process.env.SEED_SUPER_ADMIN_PASSWORD) {
      await admins.insertOne({
        id: uuidv4(), tenant_id: null, email: process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@targetmedia.com', name: 'Target Media Admin',
        role: 'super_admin', active: true,
        password_hash: bcrypt.hashSync(process.env.SEED_SUPER_ADMIN_PASSWORD, 8),
        created_at: new Date(),
      })
    } else {
      console.warn('[seed] SEED_SUPER_ADMIN_PASSWORD not set — skipping super admin creation')
    }
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
    if (process.env.SEED_DEMO_PASSWORD) {
      await admins.insertOne({
        id: uuidv4(), tenant_id: demo.id, email: 'owner@demo.com', name: 'مالك المكتب التجريبي',
        role: 'owner', active: true,
        password_hash: bcrypt.hashSync(process.env.SEED_DEMO_PASSWORD, 8),
        created_at: new Date(),
      })
    } else {
      console.warn('[seed] SEED_DEMO_PASSWORD not set — skipping demo owner creation')
    }
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
  try {
    if (!request || !request.headers) return null

    // قراءة آمنة للهيدر تمنع حدوث أي خطأ undefined أو استدعاء خاطئ
    const auth = (typeof request.headers.get === 'function'
      ? request.headers.get('authorization')
      : request.headers.authorization) || ''

    if (!auth || typeof auth !== 'string') return null
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

    // تحديث وقت آخر استخدام
    db.collection('pats').updateOne({ id: pat.id }, { $set: { last_used_at: new Date() } }).catch(() => {})
    return { pat, user, tenant, isPat: true }
  } catch (err) {
    return null
  }
}
function sanitizeUser(u) { return { id: u.id, email: u.email, name: u.name, role: u.role, role_key: u.role_key || null, tenant_id: u.tenant_id, active: u.active, default_box_id: u.default_box_id || null, lock_box: !!u.lock_box, permissions: u.role === 'owner' ? ownerPermissions() : { ...DEFAULT_STAFF_PERMISSIONS, ...(u.permissions || {}) } } }
function sanitizeTenant(t) { return t ? { id: t.id, name: t.name, slug: t.slug, status: t.status, max_users: t.max_users, max_branches: t.max_branches, referral_code: t.referral_code, referred_by: t.referred_by, plan_tier: t.plan_tier || 'standard', subscription: t.subscription, subscription_expires_at: t.subscription_expires_at, subscription_price: t.subscription_price, billing_mode: t.billing_mode || null, unlimited_journals: !!t.unlimited_journals } : null }

// ============ v3.14 — PRICING & PLANS (Phase 2) ============
// Annual payment => unlimited journals. Installments => limited journals.
// Manual super-admin override: tenant.unlimited_journals = true
function isUnlimitedTenant(t) {
  return !!t && (t.unlimited_journals === true || t.billing_mode === 'annual' || t.subscription === 'paid' || !!t.activation_confirmed)
}

const DEFAULT_PRICING_CONFIG = {
  id: 'pricing_config',
  discount_enabled: true,
  discount_percent: 50,
  installments_count: 5,
  plans: [
    {
      key: 'silver', name_ar: 'سيلفر', icon: '🥈', annual_price: 500,
      max_users: 2, max_branches: 1,
      features: ['فرع واحد', 'مستخدمان إجمالاً (المالك + مستخدم إضافي)', 'التذاكر والتأشيرات والخدمات', 'مراقبة التأشيرات — كاملة', 'إدارة البكجات والتسكين — كاملة', 'المحاسبة وسندات القبض والصرف', 'التقارير الأساسية'],
    },
    {
      key: 'gold', name_ar: 'جولد', icon: '🥇', annual_price: 1000,
      max_users: 8, max_branches: 3,
      features: ['حتى 8 مستخدمين', 'إدارة الفروع', 'كل مزايا سيلفر', 'مراقبة التأشيرات — كاملة', 'إدارة البكجات والتسكين — كاملة', 'مصارفة العملات', 'تقارير متقدمة وميزان مراجعة'],
    },
    {
      key: 'enterprise', name_ar: 'إنتربرايز / مؤسسات', icon: '🏢', annual_price: 2000,
      max_users: 0, max_branches: 0, // 0 = unlimited
      features: ['مستخدمون غير محدودين', 'فروع غير محدودة', 'كل مزايا جولد', 'مراقبة التأشيرات — كاملة', 'إدارة البكجات والتسكين — كاملة', 'برنامج العمولات والتسويق', 'دعم فني بأولوية قصوى'],
    },
  ],
}
async function getPricingConfig(db) {
  const cfg = await db.collection('platform_settings').findOne({ id: 'pricing_config' })
  return cfg ? { ...DEFAULT_PRICING_CONFIG, ...cfg } : DEFAULT_PRICING_CONFIG
}

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

// v3.10.7 — Chart of Accounts tree: atomic sequential code generator
// Hierarchy (strict inheritance):
//   L1 = 1 digit  (e.g. 1 = الأصول, 5 = المصاريف)
//   L2 = 2 digits (e.g. 11 = أصول متداولة, 52 = مصاريف إدارية عمومية)
//   L3 = 4 digits (e.g. 1201 = الصناديق)   -> 2-digit sequence appended to L2
//   L4 = 7 digits (e.g. 1201001 = صندوق سالم) -> 3-digit sequence appended to L3
//   L4 is a TERMINAL node — creating children under an L4 code is FORBIDDEN.
// Returns new account_code in form: <parent_code><padded-sequence>
async function generateSubAccountCode(db, tenantId, parentCode) {
  const parentStr = String(parentCode)
  // v3.10.7 — Terminal node protection: L4 (7-digit) accounts cannot have children.
  if (parentStr.length >= 7) {
    throw new Error(`الحساب ${parentStr} حساب تحليلي نهائي (Level 4) — لا يمكن إنشاء حسابات فرعية تحته. القيود المحاسبية فقط تتم على هذا المستوى.`)
  }
  const parent = await db.collection('accounts').findOneAndUpdate(
    { tenant_id: tenantId, code: parentStr },
    { $inc: { next_child_seq: 1 }, $set: { is_parent: true } },
    { returnDocument: 'after' }
  )
  const parentDoc = parent?.value || parent
  if (!parentDoc) throw new Error(`الحساب الأب ${parentStr} غير موجود في الدليل`)
  const seq = parentDoc.next_child_seq || 1
  // Determine padding based on parent level:
  //   parent L1 (1 digit) -> child L2 = 1-digit sequence appended -> total 2 digits
  //   parent L2 (2 digits) -> child L3 = 2-digit sequence appended -> total 4 digits
  //   parent L3 (4 digits) -> child L4 = 3-digit sequence appended -> total 7 digits
  const parentLen = parentStr.length
  const seqPad = parentLen === 1 ? 1 : parentLen === 2 ? 2 : parentLen === 4 ? 3 : 3
  const newCode = parentStr + String(seq).padStart(seqPad, '0')
  return {
    account_code: newCode,
    account_parent_code: parentStr,
    account_seq: seq,
  }
}

// v3.10.0 — Validate JE lines: no negatives + account exists
async function validateJournalLines(db, tenantId, lines) {
  if (!Array.isArray(lines) || lines.length === 0) return { ok: true }
  // Cache parent + sub-account codes to avoid many queries
  const acctCodes = new Set((await db.collection('accounts').find({ tenant_id: tenantId }).project({ code: 1 }).toArray()).map(a => a.code))
  const clientCodes = new Set((await db.collection('clients').find({ tenant_id: tenantId }).project({ account_code: 1 }).toArray()).map(x => x.account_code).filter(Boolean))
  const supplierCodes = new Set((await db.collection('suppliers').find({ tenant_id: tenantId }).project({ account_code: 1 }).toArray()).map(x => x.account_code).filter(Boolean))
  const boxCodes = new Set((await db.collection('boxes').find({ tenant_id: tenantId }).project({ account_code: 1 }).toArray()).map(x => x.account_code).filter(Boolean))
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const d = Number(l.debit) || 0
    const c = Number(l.credit) || 0
    if (d < 0 || c < 0) return { ok: false, error: `لا يُسمح بقيم سالبة في القيد (المدين=${d}، الدائن=${c}) — السطر ${i + 1}` }
    const hasAmount = d > 0 || c > 0
    const code = l.account_code
    // v3.10.0 strict — any line with amount MUST have a valid registered account_code
    if (hasAmount && (!code || code === 'MANUAL')) {
      return { ok: false, error: `عذراً، يجب اختيار حساب معتمد من دليل الحسابات (السطر ${i + 1})` }
    }
    if (code && code !== 'MANUAL') {
      const exists = acctCodes.has(code) || clientCodes.has(code) || supplierCodes.has(code) || boxCodes.has(code)
      if (!exists) return { ok: false, error: `الحساب "${code}" غير موجود في دليل الحسابات — السطر ${i + 1}` }
    }
  }
  return { ok: true }
}

// v3.10.6 — Credit Limit + Freeze enforcement for credit sales
async function checkClientCredit(db, tenantId, clientId, saleAmount, currency, settings) {
  if (!clientId) return { ok: true }
  const cli = await db.collection('clients').findOne({ id: clientId, tenant_id: tenantId })
  if (!cli) return { ok: false, error: 'العميل غير موجود' }
  if (cli.is_frozen) return { ok: false, error: `❄️ الحساب مجمّد — لا يمكن إصدار حركات آجلة للعميل "${cli.name}". يرجى مراجعة المالك.` }
  const limit = Number(cli.credit_limit) || 0
  if (limit <= 0) return { ok: true } // No limit set
  // Convert existing balance + new sale to credit_currency for check
  const limitCcy = cli.credit_currency || 'USD'
  const balances = cli.balances || {}
  const rates = (settings && settings.rates) || {}
  const baseCcy = (settings && settings.base_currency) || 'USD'
  const toBase = (amt, cur) => {
    const r = (rates[cur] && rates[cur].to_base) ? Number(rates[cur].to_base) : 1
    return Number(amt || 0) * r
  }
  const fromBase = (baseAmt, cur) => {
    const r = (rates[cur] && rates[cur].to_base) ? Number(rates[cur].to_base) : 1
    return baseAmt / r
  }
  // Total current debt in base then convert to limit_currency
  let currentDebtBase = 0
  Object.entries(balances).forEach(([cur, val]) => { currentDebtBase += toBase(Math.max(0, Number(val || 0)), cur) })
  const newSaleBase = toBase(Number(saleAmount || 0), currency)
  const totalAfterBase = currentDebtBase + newSaleBase
  const totalAfterLimitCcy = fromBase(totalAfterBase, limitCcy)
  if (totalAfterLimitCcy > limit) {
    return { ok: false, error: `⛔ العميل "${cli.name}" تجاوز سقف الائتمان المسموح به (${limit.toLocaleString()} ${limitCcy}). الرصيد الحالي مع الحركة الجديدة سيصبح ${totalAfterLimitCcy.toFixed(2)} ${limitCcy}. يمكن للمالك رفع السقف من بطاقة العميل.` }
  }
  return { ok: true }
}

async function createJournalEntry(db, tenantId, { date, description, ref_type, ref_id, currency, lines }, opts = {}) {
  // Enforce quota (skipped in edit mode, and bypassed entirely for unlimited tenants)
  if (!opts.skipQuota) {
    const t = await db.collection('tenants').findOne({ id: tenantId })
    if (!isUnlimitedTenant(t)) {
      const q = t?.journal_quota || { used: 0, limit: 500 }
      if (q.used >= q.limit) {
        const err = new Error(`انتهت حصة قيود اليومية (${q.used}/${q.limit}). يرجى تجديد الاشتراك مع الإدارة العامة.`)
        err.code = 'QUOTA_EXCEEDED'
        throw err
      }
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
  // v3.42 — Cache the real public origin from live request headers (used as a last-resort base for
  // package image URLs in Meraaj payloads when RAHAAL_PUBLIC_BASE_URL / NEXT_PUBLIC_BASE_URL are empty).
  try {
    const xfHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
    if (xfHost && !/^(localhost|127\.|0\.0\.0\.0)/.test(xfHost)) {
      const xfProto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim()
      globalThis.__rahaalPublicOrigin = `${xfProto}://${xfHost.split(',')[0].trim()}`
    }
  } catch {}

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
          version: '3.9.28',
          db: 'connected',
        })
      } catch (e) {
        return NextResponse.json({ status: 'degraded', error: e.message, timestamp: new Date().toISOString() }, { status: 503 })
      }
    }

    // ============ v3.24 — MERAAJ NETWORK: server-to-server endpoints (HMAC-secured, no session) ============
    // Office profile — called by Meraaj server: headers x-meraaj-timestamp + x-meraaj-signature = HMAC(`${ts}.${route}`)
    const meraajOfficeMatch = route.match(/^\/meraaj\/office\/([^/]+)$/)
    if (meraajOfficeMatch && method === 'GET') {
      if (!meraajVerifyRequest(request, route)) return bad('توقيع غير صالح — Invalid HMAC signature', 401)
      const t = await db.collection('tenants').findOne({ id: meraajOfficeMatch[1] })
      if (!t) return bad('المكتب غير موجود', 404)
      const settings = await db.collection('tenant_settings').findOne({ tenant_id: t.id })
      return ok({
        tenant_id: t.id,
        office_name: settings?.agency_name || t.name || '',
        phone: settings?.phone || t.phone || '',
        address: settings?.address || '',
        email: settings?.email || t.owner_email || '',
        status: t.status || 'active',
      })
    }
    // Package data — pulled by Meraaj when the office presses "Share"
    const meraajPkgMatch = route.match(/^\/meraaj\/packages\/([^/]+)$/)
    if (meraajPkgMatch && method === 'GET') {
      if (!meraajVerifyRequest(request, route)) return bad('توقيع غير صالح — Invalid HMAC signature', 401)
      const pkg = await db.collection('packages').findOne({ id: meraajPkgMatch[1] })
      if (!pkg) return bad('الباكج غير موجود', 404)
      if (pkg.archived) return bad('هذا الباكج مؤرشف وغير متاح', 403)
      if (!pkg.meraaj?.shared) return bad('هذا الباكج غير مُشارَك في معراج نتورك', 403)
      const comps = await db.collection('package_components').find({ package_id: pkg.id, tenant_id: pkg.tenant_id }).toArray()
      return ok(meraajPackagePayload(pkg, comps))
    }
    // Package image (binary) for the marketplace
    // v3.33 — PUBLIC endpoint (no HMAC): marketplace <img> tags and Meraaj users' browsers cannot sign
    // requests, so requiring a signature made images never display. Safe: serves ONLY images of packages
    // currently shared to the marketplace (public info by definition) — nothing else is exposed.
    const meraajPkgImgMatch = route.match(/^\/meraaj\/packages\/([^/]+)\/image$/)
    if (meraajPkgImgMatch && method === 'GET') {
      const pkg = await db.collection('packages').findOne({ id: meraajPkgImgMatch[1] })
      if (!pkg || !pkg.meraaj?.shared || pkg.archived) return bad('غير متاح', 404)
      const img = await db.collection('package_images').findOne({ package_id: pkg.id })
      if (!img) return bad('لا توجد صورة', 404)
      return new Response(Buffer.from(img.data, 'base64'), { status: 200, headers: { 'Content-Type': img.content_type || 'image/jpeg', 'Cache-Control': 'public, max-age=300' } })
    }
    // Reverse webhooks from Meraaj → Rahaal: signature over the RAW body (x-meraaj-signature)
    if (route === '/meraaj/webhooks' && method === 'POST') {
      const rawBody = await request.text()
      const sig = request.headers.get('x-meraaj-signature')
      if (!meraajVerify(rawBody, sig)) return bad('توقيع غير صالح — Invalid HMAC signature', 401)
      let evt
      try { evt = JSON.parse(rawBody) } catch { return bad('JSON غير صالح') }
      const type = evt.type
      const data = evt.data || {}
      // Idempotency: skip if this external event id was already processed
      if (evt.id) {
        const seen = await db.collection('meraaj_inbound_events').findOne({ external_id: evt.id })
        if (seen) return ok({ received: true, duplicate: true })
        await db.collection('meraaj_inbound_events').insertOne({ id: uuidv4(), external_id: evt.id, type, received_at: new Date() })
      }
      if (type === 'meraaj.booking.created') {
        const pkg = await db.collection('packages').findOne({ id: data.package_ref })
        if (!pkg) return bad('الباكج غير موجود', 404)
        if (!pkg.meraaj?.shared) return bad('الباكج غير مُشارَك', 403)
        const registrants = (Array.isArray(data.registrants) ? data.registrants : []).slice(0, 200).map(r => ({
          name: String(r.name || '').trim().slice(0, 80),
          passport_no: String(r.passport_no || '').trim().toUpperCase().slice(0, 30),
          age: r.age === '' || r.age === null || r.age === undefined ? null : Math.max(0, Math.min(120, Number(r.age) || 0)),
          room_type: String(r.room_type || '').trim().slice(0, 40),
        })).filter(r => r.name)
        if (registrants.length === 0) return bad('قائمة المسافرين (registrants) مطلوبة مع العمر ونوع الغرفة')
        // v3.25 — AGE-AWARE PRICING: compute each traveller's price from the marketplace table (room + age)
        const marketMap = {}
        for (const row of (pkg.meraaj.market_pricing || [])) marketMap[row.room_type] = row
        let adults = 0, children = 0, infants = 0
        let computedTotal = 0, commissionTotal = 0, netTotal = 0
        const priced = []
        for (const r of registrants) {
          const cat = ageCategoryOf(r.age)
          if (cat === 'adult') adults++; else if (cat === 'child') children++; else infants++
          const row = marketMap[r.room_type]
          if (!row) return bad(`نوع الغرفة "${r.room_type || 'غير محدد'}" غير متاح في تسعير هذا الباكج — الأنواع المتاحة: ${Object.keys(marketMap).join('، ') || 'لا يوجد'}`)
          const price = Number(row.customer[cat]) || 0
          computedTotal += price
          commissionTotal += Number(row.commission[cat]) || 0
          netTotal += Number(row.net[cat]) || 0
          priced.push({ ...r, age_category: cat, price })
        }
        computedTotal = +computedTotal.toFixed(2)
        commissionTotal = +commissionTotal.toFixed(2)
        netTotal = +netTotal.toFixed(2)
        // Seats consume billed persons only (infants do not occupy seats)
        const seats = adults + children
        if (seats === 0) return bad('يجب وجود بالغ أو طفل واحد على الأقل')
        const available = meraajAvailability(pkg)
        if (seats > available) return bad(`المقاعد المتاحة غير كافية (متاح: ${available}، مطلوب: ${seats})`, 409)
        const sentTotal = data.total_price !== undefined ? +(Number(data.total_price) || 0).toFixed(2) : null
        const inbound = {
          id: uuidv4(), tenant_id: pkg.tenant_id, package_id: pkg.id, package_name: pkg.name,
          meraaj_booking_ref: String(data.booking_ref || '').slice(0, 60),
          buyer_office_name: String(data.buyer_office_name || 'مكتب عبر معراج').slice(0, 120),
          registrants: priced, seats,
          pax_adults: adults, pax_children: children, pax_infants: infants,
          total_price: computedTotal,           // authoritative: computed from room+age matrix
          sent_total: sentTotal,                 // what Meraaj sent (for reconciliation)
          price_check: sentTotal === null ? 'not_sent' : (Math.abs(sentTotal - computedTotal) <= 0.01 ? 'match' : 'mismatch'),
          agent_commission_total: commissionTotal,
          net_to_seller_total: netTotal,
          currency: CURRENCIES.includes(data.currency) ? data.currency : pkg.currency,
          status: 'new', // new | cancelled | approved (approval into accounting is a manual office step)
          created_at: new Date(),
        }
        await db.collection('meraaj_inbound_bookings').insertOne(inbound)
        await db.collection('packages').updateOne({ id: pkg.id }, { $inc: { 'meraaj.seats_sold': seats } })
        await maybeEmitMeraajInventory(db, pkg.tenant_id, pkg.id)
        const { _id, ...rest } = inbound
        return ok({ received: true, inbound_booking: rest, seats_remaining: meraajAvailability({ ...pkg, meraaj: { ...pkg.meraaj, seats_sold: (Number(pkg.meraaj.seats_sold) || 0) + seats } }) })
      }
      if (type === 'meraaj.booking.cancelled') {
        const inbound = await db.collection('meraaj_inbound_bookings').findOne({ meraaj_booking_ref: String(data.booking_ref || ''), status: { $ne: 'cancelled' } })
        if (!inbound) return bad('الحجز غير موجود أو مُلغى مسبقاً', 404)
        await db.collection('meraaj_inbound_bookings').updateOne({ id: inbound.id }, { $set: { status: 'cancelled', cancelled_at: new Date(), cancel_reason: String(data.reason || '').slice(0, 200) } })
        await db.collection('packages').updateOne({ id: inbound.package_id }, { $inc: { 'meraaj.seats_sold': -inbound.seats } })
        await maybeEmitMeraajInventory(db, inbound.tenant_id, inbound.package_id)
        return ok({ received: true, released_seats: inbound.seats })
      }
      // v3.38 — REFLECTION: a package created/published/updated on MERAAJ by an office that also exists in Rahaal
      // must be stored in Rahaal and linked to the CORRECT office. Matching is STRICTLY by ids
      // (rahal_ref, meraaj_package_id, office_ref = Rahaal tenant id) — NEVER by office/package names.
      if (type === 'meraaj.package.published' || type === 'meraaj.package.created' || type === 'meraaj.package.updated') {
        const meraajId = String(data.meraaj_package_id || data.package_id || '').trim()
        const officeRef = String(data.office_ref || data.rahal_office_ref || '').trim()
        if (!meraajId) return bad('meraaj_package_id مطلوب لأحداث انعكاس الباقات', 422)
        const tenant = officeRef ? await db.collection('tenants').findOne({ id: officeRef }) : null
        // Locate existing package: 1) by rahal_ref  2) by stored meraaj.remote_id
        let existing = null
        if (data.rahal_ref) existing = await db.collection('packages').findOne({ id: String(data.rahal_ref) })
        if (!existing) existing = await db.collection('packages').findOne({ 'meraaj.remote_id': meraajId })
        if (existing && officeRef && existing.tenant_id !== officeRef) return bad('عدم تطابق المكتب — الباقة مرتبطة بمكتب آخر', 403)
        if (!existing && !tenant) return bad('office_ref غير معروف في رحّال — لا يمكن ربط الباقة بمكتب', 422)
        // Tolerant room pricing mapping (accepts Contract-v2 matrix rows or simple rows)
        const mapRooms = (rows) => (Array.isArray(rows) ? rows : []).map(r => ({
          type: String(r.room_type || r.type || '').trim(),
          sale_per_pax: Number(r.sale_per_pax ?? r.base?.adult ?? r.customer?.adult ?? r.net?.adult) || 0,
          sale_child: (r.sale_child ?? r.base?.child ?? r.customer?.child ?? r.net?.child ?? null),
          sale_infant: Number(r.sale_infant ?? r.base?.infant ?? r.customer?.infant ?? r.net?.infant) || 0,
        })).filter(r => r.type)
        // PARTIAL semantics: only fields present in the event are applied — absent fields are NEVER wiped
        const upd = { updated_at: new Date() }
        if (data.title !== undefined) upd.name = String(data.title).slice(0, 200)
        if (data.description !== undefined) upd.notes = String(data.description).slice(0, 2000)
        if (data.package_type) upd.package_type = String(data.package_type).slice(0, 40)
        if (data.departure_date) upd.start_date = new Date(data.departure_date)
        if (data.return_date) upd.end_date = new Date(data.return_date)
        if (data.currency && CURRENCIES.includes(data.currency)) upd.currency = data.currency
        if (Array.isArray(data.features)) upd.features = data.features.map(f => String(f).slice(0, 120)).slice(0, 40)
        if (Array.isArray(data.room_pricing) && data.room_pricing.length) upd.room_pricing = mapRooms(data.room_pricing)
        const reflectionSnap = {
          hotels: Array.isArray(data.hotels) ? data.hotels.slice(0, 40) : undefined,
          components: Array.isArray(data.components) ? data.components.slice(0, 60) : undefined,
          package_transports: Array.isArray(data.package_transports) ? data.package_transports.slice(0, 40) : undefined,
          images: Array.isArray(data.images) ? data.images.slice(0, 10) : undefined,
          available_seats: data.available_seats !== undefined ? (Number(data.available_seats) || 0) : undefined,
          last_event_type: type, last_event_at: new Date(),
        }
        Object.keys(reflectionSnap).forEach(k => reflectionSnap[k] === undefined && delete reflectionSnap[k])
        if (existing) {
          const setDoc = { ...upd, 'meraaj.remote_id': meraajId }
          for (const [k, v] of Object.entries(reflectionSnap)) setDoc[`meraaj.reflection.${k}`] = v
          if (!existing.meraaj?.registered_at) setDoc['meraaj.registered_at'] = new Date()
          if (data.available_seats !== undefined) setDoc['meraaj.seats_allocated'] = Number(data.available_seats) || 0
          await db.collection('packages').updateOne({ id: existing.id }, { $set: setDoc })
          return ok({ received: true, reflected: 'updated', rahal_ref: existing.id, tenant_id: existing.tenant_id, meraaj_package_id: meraajId })
        }
        const newPkg = {
          id: uuidv4(), tenant_id: tenant.id,
          name: upd.name || 'باقة من معراج', package_type: upd.package_type || 'umrah',
          currency: upd.currency || 'SAR',
          start_date: upd.start_date || null, end_date: upd.end_date || null,
          room_pricing: upd.room_pricing || [], pricing_mode: 'direct',
          features: upd.features || [], has_image: false,
          notes: upd.notes || '', status: 'open',
          source: 'meraaj_reflection',
          meraaj: {
            shared: true, registered_at: new Date(), remote_id: meraajId,
            seats_allocated: Number(data.available_seats) || 0, seats_sold: 0,
            buyer_commission_mode: 'amount', buyer_commission_value: 0, commission_direction: 'added',
            market_pricing: computeMeraajMarketPricing(upd.room_pricing || [], 'amount', 0, 'added'),
            reflection: reflectionSnap,
          },
          created_at: new Date(),
        }
        await db.collection('packages').insertOne(newPkg)
        return ok({ received: true, reflected: 'created', rahal_ref: newPkg.id, tenant_id: tenant.id, meraaj_package_id: meraajId })
      }
      if (type === 'meraaj.package.deactivated') {
        const meraajId = String(data.meraaj_package_id || data.package_id || '').trim()
        const existing = data.rahal_ref
          ? await db.collection('packages').findOne({ id: String(data.rahal_ref) })
          : await db.collection('packages').findOne({ 'meraaj.remote_id': meraajId })
        if (!existing) return bad('الباقة غير موجودة', 404)
        await db.collection('packages').updateOne({ id: existing.id }, { $set: { 'meraaj.shared': false, 'meraaj.unshared_at': new Date() } })
        return ok({ received: true, reflected: 'deactivated', rahal_ref: existing.id })
      }
      return ok({ received: true, ignored: true, note: `نوع حدث غير معروف: ${type}` })
    }

    // ============ PUBLIC SIGNUP (no auth) ============
    if (route === '/public/signup' && method === 'POST') {
      const b = await request.json()
      if (!b.name || !b.owner_email || !b.owner_password || !b.owner_name) return bad('الاسم الكامل، اسم المكتب، البريد وكلمة المرور مطلوبة')
      // v3.9.18 — Mandatory phone/WhatsApp (with country code)
      const phone = String(b.owner_phone || '').trim()
      if (!phone) return bad('رقم الهاتف / الواتساب مطلوب')
      // Accept international format with optional leading '+' and 7-15 digits
      if (!/^\+?[0-9]{7,15}$/.test(phone.replace(/[\s-]/g, ''))) return bad('رقم الهاتف غير صالح — أدخل رمز الدولة والرقم (مثال: +967771234567)')
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
        phone: phone.replace(/[\s-]/g, ''), // v3.9.18 — Store normalized phone
        password_hash: bcrypt.hashSync(b.owner_password, 8),
        created_at: new Date(),
      })
      // v3.9.18 — Also store owner phone in tenant profile for admin visibility
      await db.collection('tenants').updateOne({ id: tenant.id }, { $set: { owner_phone: phone.replace(/[\s-]/g, '') } })
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

    // v3.12 — Forgot Password (admin-mediated: request goes to Super Admin inbox)
    // PUBLIC endpoint. Unified response always (no email enumeration).
    if (route === '/auth/forgot-password' && method === 'POST') {
      const b = await request.json()
      const email = String(b.email || '').toLowerCase().trim()
      if (!email || !email.includes('@')) return bad('البريد الإلكتروني مطلوب')
      const user = await db.collection('users').findOne({ email })
      if (user && user.active) {
        // Avoid duplicate pending requests for the same user
        const existing = await db.collection('password_reset_requests').findOne({ user_id: user.id, status: 'pending' })
        if (!existing) {
          let tenantName = null
          if (user.tenant_id) {
            const t = await db.collection('tenants').findOne({ id: user.tenant_id })
            tenantName = t?.name || null
          }
          await db.collection('password_reset_requests').insertOne({
            id: uuidv4(),
            user_id: user.id,
            email,
            user_name: user.name || '',
            role: user.role,
            tenant_id: user.tenant_id || null,
            tenant_name: tenantName,
            note: String(b.note || '').slice(0, 300),
            status: 'pending',
            created_at: new Date(),
            resolved_at: null,
            resolved_by: null,
          })
        }
      }
      return ok({ message: 'تم استلام طلبك — ستقوم الإدارة بمعالجته والتواصل معك قريباً' })
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

    // ============ v3.45 — RBAC PHASE 1: module-level access enforcement (staff only) ============
    // Server-side guard (not just UI hiding). Owner/super_admin bypass. Shared lookup endpoints
    // (/clients, /suppliers, /boxes, /accounts) stay open as they feed dropdowns across screens.
    if (sess.user.role !== 'owner' && sess.user.role !== 'super_admin') {
      const P = effectivePermissions(sess.user)
      const deny = (label) => bad(`🚫 غير مصرح — ليس لديك صلاحية الوصول إلى قسم ${label}`, 403)
      if (/^\/tickets/.test(route) && !P.mod_tickets) return deny('حجز التذاكر')
      if (/^\/visas/.test(route) && !P.mod_visas) return deny('التأشيرات')
      if ((/^\/services/.test(route) || /^\/service-types/.test(route)) && !P.mod_services) return deny('الخدمات')
      if (/^\/packages/.test(route) && !P.mod_packages && !P.mod_meraaj) return deny('الباكجات والبرامج')
      if (/^\/meraaj\//.test(route) && !P.mod_meraaj) return deny('متجر معراج')
      if (/^\/fx/.test(route) && !P.mod_fx) return deny('صرافة العملات')
      if (/^\/journal-entries/.test(route) && !P.mod_journal) return deny('قيود اليومية')
      if (route === '/reports/query' && !P.mod_query && !P.mod_reports) return deny('مركز الاستعلامات')
      if (/^\/reports\//.test(route) && route !== '/reports/query' && !P.mod_reports) return deny('التقارير المالية')
      if (/^\/vouchers/.test(route) && !P.mod_receipt && !P.mod_payment) return deny('السندات')
      if (/^\/affiliate/.test(route) && !P.mod_affiliate) return deny('التسويق بالعمولة')
    }
    // v3.45 — Role templates catalog for the permissions manager (owner only)
    if (route === '/rbac/templates' && method === 'GET') {
      if (sess.user.role !== 'owner') return bad('غير مصرح — للمالك فقط', 403)
      return ok({ templates: RBAC_ROLE_TEMPLATES(), defaults: DEFAULT_STAFF_PERMISSIONS })
    }

    // ============ SUPER ADMIN ============
    if (route.startsWith('/admin/')) {
      if (sess.user.role !== 'super_admin') return bad('غير مصرح', 403)

      // v3.16 — Installments tracker (SaaS billing follow-up)
      if (route === '/admin/installments-overview' && method === 'GET') {
        const tenants = await db.collection('tenants').find({ billing_mode: 'installments' }).toArray()
        const today = new Date().toISOString().slice(0, 10)
        const rows = tenants.map(t => {
          const list = Array.isArray(t.installments) ? t.installments : []
          const paid = list.filter(i => i.paid).length
          const next = list.find(i => !i.paid) || null
          const overdue = !!(next && next.due_date && String(next.due_date).slice(0, 10) < today)
          return {
            id: t.id, name: t.name, slug: t.slug, plan_tier: t.plan_tier || null,
            unlimited_journals: !!t.unlimited_journals,
            installments: list, paid_count: paid, total_count: list.length,
            next_due: next?.due_date || null, next_amount: next?.amount || null,
            overdue, all_paid: list.length > 0 && paid === list.length,
          }
        })
        rows.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0))
        return ok(rows)
      }
      {
        const mIns = route.match(/^\/admin\/tenants\/([^/]+)\/installments$/)
        // PUT — create/replace the schedule (total, count, start_date → monthly due dates)
        if (mIns && method === 'PUT') {
          const b = await request.json()
          const total = Math.max(0, Number(b.total) || 0)
          const count = Math.min(24, Math.max(1, Number(b.count) || 5))
          if (!total) return bad('المبلغ الإجمالي مطلوب')
          const start = b.start_date ? new Date(b.start_date) : new Date()
          const per = Math.round((total / count) * 100) / 100
          const list = Array.from({ length: count }, (_, i) => {
            const d = new Date(start); d.setMonth(d.getMonth() + i)
            return { no: i + 1, amount: per, due_date: d.toISOString().slice(0, 10), paid: false, paid_at: null }
          })
          await db.collection('tenants').updateOne({ id: mIns[1] }, { $set: { installments: list, billing_mode: 'installments', updated_at: new Date() } })
          return ok({ success: true, installments: list })
        }
        // PATCH — mark a single installment paid/unpaid
        if (mIns && method === 'PATCH') {
          const b = await request.json()
          const t = await db.collection('tenants').findOne({ id: mIns[1] })
          if (!t) return bad('المكتب غير موجود', 404)
          const list = Array.isArray(t.installments) ? t.installments : []
          const idx = list.findIndex(i => i.no === Number(b.no))
          if (idx === -1) return bad('القسط غير موجود')
          list[idx] = { ...list[idx], paid: !!b.paid, paid_at: b.paid ? new Date() : null }
          await db.collection('tenants').updateOne({ id: mIns[1] }, { $set: { installments: list, updated_at: new Date() } })
          const allPaid = list.length > 0 && list.every(i => i.paid)
          return ok({ success: true, all_paid: allPaid, paid_count: list.filter(i => i.paid).length })
        }
      }

      // v3.14 — Pricing config management (flexible discount + dynamic features)
      if (route === '/admin/pricing-config' && method === 'GET') {
        const cfg = await getPricingConfig(db)
        return ok({ ...cfg, _id: undefined })
      }
      if (route === '/admin/pricing-config' && method === 'PUT') {
        const b = await request.json()
        const upd = { id: 'pricing_config', updated_at: new Date(), updated_by: sess.user.email }
        if (b.discount_enabled !== undefined) upd.discount_enabled = !!b.discount_enabled
        if (b.discount_percent !== undefined) upd.discount_percent = Math.min(95, Math.max(0, Number(b.discount_percent) || 0))
        if (b.installments_count !== undefined) upd.installments_count = Math.max(1, Number(b.installments_count) || 5)
        if (Array.isArray(b.plans)) {
          upd.plans = b.plans
            .filter(p => p && ['silver', 'gold', 'enterprise'].includes(p.key))
            .map(p => ({
              key: p.key,
              name_ar: String(p.name_ar || '').slice(0, 60),
              icon: String(p.icon || '').slice(0, 8),
              annual_price: Math.max(0, Number(p.annual_price) || 0),
              max_users: Math.max(0, Number(p.max_users) || 0),
              max_branches: Math.max(0, Number(p.max_branches) || 0),
              features: (Array.isArray(p.features) ? p.features : []).map(f => String(f).slice(0, 120)).filter(Boolean).slice(0, 25),
            }))
        }
        const existing = await db.collection('platform_settings').findOne({ id: 'pricing_config' })
        const merged = { ...(existing ? { ...DEFAULT_PRICING_CONFIG, ...existing } : DEFAULT_PRICING_CONFIG), ...upd }
        delete merged._id // MongoDB immutable field must never be in $set
        await db.collection('platform_settings').updateOne({ id: 'pricing_config' }, { $set: merged }, { upsert: true })
        return ok({ success: true, config: merged })
      }

      // v3.12 — Password reset requests inbox (admin-mediated forgot password)
      if (route === '/admin/password-reset-requests' && method === 'GET') {
        const reqs = await db.collection('password_reset_requests').find({}).sort({ created_at: -1 }).limit(200).toArray()
        return ok(clean(reqs))
      }
      {
        const m = route.match(/^\/admin\/password-reset-requests\/([^/]+)$/)
        if (m && method === 'PATCH') {
          const b = await request.json()
          const reqDoc = await db.collection('password_reset_requests').findOne({ id: m[1] })
          if (!reqDoc) return bad('الطلب غير موجود', 404)
          if (reqDoc.status !== 'pending') return bad('هذا الطلب تمت معالجته مسبقاً')
          if (b.action === 'reset') {
            if (!b.new_password || String(b.new_password).length < 6) return bad('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف')
            await db.collection('users').updateOne(
              { id: reqDoc.user_id },
              { $set: { password_hash: bcrypt.hashSync(String(b.new_password), 8), updated_at: new Date() } }
            )
            // Security: invalidate that user's active sessions so only the new password works
            await db.collection('sessions').deleteMany({ user_id: reqDoc.user_id })
            await db.collection('password_reset_requests').updateOne(
              { id: m[1] },
              { $set: { status: 'done', resolved_at: new Date(), resolved_by: sess.user.email } }
            )
            return ok({ success: true, message: 'تم تعيين كلمة المرور الجديدة — بلّغ المستخدم بها' })
          }
          if (b.action === 'reject') {
            await db.collection('password_reset_requests').updateOne(
              { id: m[1] },
              { $set: { status: 'rejected', resolved_at: new Date(), resolved_by: sess.user.email } }
            )
            return ok({ success: true })
          }
          return bad('إجراء غير معروف')
        }
      }

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
          // v3.14 — Assign 6-tier plan: auto-apply user/branch limits from pricing config
          if (b.plan_key !== undefined && ['silver', 'gold', 'enterprise'].includes(b.plan_key)) {
            upd.plan_tier = b.plan_key
            const cfg = await getPricingConfig(db)
            const p = (cfg.plans || []).find(x => x.key === b.plan_key)
            if (p) {
              upd.max_users = Number(p.max_users) === 0 ? 9999 : Number(p.max_users)
              upd.max_branches = Number(p.max_branches) === 0 ? 9999 : Number(p.max_branches)
            }
          }
          // v3.14 — Billing mode: annual => unlimited journals immediately; installments => limited
          if (b.billing_mode !== undefined && ['annual', 'installments', null].includes(b.billing_mode)) {
            upd.billing_mode = b.billing_mode
            if (b.billing_mode === 'annual') upd.unlimited_journals = true
            if (b.billing_mode === 'installments' && b.unlimited_journals === undefined) upd.unlimited_journals = false
          }
          // v3.14 — Manual unlimited-journals toggle (e.g. after final installment is paid)
          if (b.unlimited_journals !== undefined) upd.unlimited_journals = !!b.unlimited_journals
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

    // ============ v3.24 — MERAAJ NETWORK: tenant-authenticated endpoints ============
    // SSO token: signed payload the Meraaj store verifies with the shared secret (5-minute expiry)
    if (route === '/meraaj/sso-token' && method === 'POST') {
      if (!meraajSecret()) return bad('التكامل مع معراج غير مُهيأ (MERAAJ_SHARED_SECRET مفقود)', 503)
      const now = Math.floor(Date.now() / 1000)
      const settings = await db.collection('tenant_settings').findOne(tf)
      const payload = {
        iss: 'rahaal-erp', aud: 'meraaj-network',
        tenant_id: T,
        office_name: settings?.agency_name || sess.tenant.name || '',
        email: sess.user.email, role: sess.user.role,
        iat: now, exp: now + 300,
      }
      const body64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const token = `${body64}.${meraajSign(body64)}`
      return ok({ token, expires_in: 300 })
    }
    // Integration status for the frontend tab
    if (route === '/meraaj/config' && method === 'GET') {
      const settingsCfg = await db.collection('tenant_settings').findOne(tf)
      return ok({
        configured: !!meraajSecret(),
        store_url: process.env.MERAAJ_STORE_URL || null,
        outbound_webhook_set: !!process.env.MERAAJ_WEBHOOK_URL,
        // v3.43 — per-office self-service store subscription state
        store_active: !!settingsCfg?.meraaj_store?.active,
        store_activated_at: settingsCfg?.meraaj_store?.activated_at || null,
      })
    }
    // v3.43 — SELF-SERVICE STORE ACTIVATION (Subscribe / Activate) — instant, no manual steps.
    // Stores the subscription flag per office; best-effort notifies Meraaj via the outbox
    // (additive event — delivery failure NEVER blocks activation; contract payloads untouched).
    if (route === '/meraaj/activate' && method === 'POST') {
      const settingsAct = await db.collection('tenant_settings').findOne(tf)
      if (settingsAct?.meraaj_store?.active) {
        return ok({ active: true, activated_at: settingsAct.meraaj_store.activated_at, already: true })
      }
      const activatedAt = new Date()
      await db.collection('tenant_settings').updateOne(tf, {
        $set: { meraaj_store: { active: true, activated_at: activatedAt, activated_by: sess.user.email } },
      }, { upsert: true })
      try {
        await emitMeraajEvent(db, T, 'office.store_activated', {
          office_ref: T,
          office_name: settingsAct?.agency_name || sess.tenant.name || '',
          activated_at: activatedAt.toISOString(),
        })
      } catch { /* non-blocking */ }
      return ok({ active: true, activated_at: activatedAt })
    }
    // Share / update / unshare a package to Meraaj marketplace
    const meraajShareMatch = route.match(/^\/packages\/([^/]+)\/meraaj-share$/)
    if (meraajShareMatch && method === 'POST') {
      const b = await request.json()
      const pkg = await db.collection('packages').findOne({ id: meraajShareMatch[1], tenant_id: T })
      if (!pkg) return bad('الباكج غير موجود', 404)
      if (b.enabled === false) {
        // v3.34 — deliver deactivation FIRST; if Meraaj can't be reached, keep state consistent (block unshare)
        if (pkg.meraaj?.shared) {
          const dlv = await emitMeraajEvent(db, T, 'package.deactivated', { package_ref: pkg.id, reason: 'unshared_by_office' })
          if (dlv === 'failed') return bad('تعذر إبلاغ سوق معراج بإيقاف المشاركة — لم يتم الإلغاء. حاول لاحقاً', 502)
        }
        await db.collection('packages').updateOne({ id: pkg.id, tenant_id: T }, { $set: { 'meraaj.shared': false, 'meraaj.unshared_at': new Date() } })
        return ok({ shared: false })
      }
      // v3.25 — SMART SHARE: prices are pulled AUTOMATICALLY from the package room pricing.
      // The only manual inputs: buyer (agent) commission + direction + seats.
      const roomPricing = Array.isArray(pkg.room_pricing) ? pkg.room_pricing.filter(r => (Number(r.sale_per_pax) || 0) > 0) : []
      if (roomPricing.length === 0) return bad('لا توجد أسعار غرف معرّفة في الباكج — حدّد التسعير المباشر (غرفة + عمر) في إعدادات الباكج أولاً')
      const commissionMode = b.buyer_commission_mode === 'percent' ? 'percent' : 'amount'
      const commissionValue = Math.max(0, Number(b.buyer_commission_value) || 0)
      if (commissionMode === 'percent' && commissionValue > 90) return bad('نسبة العمولة غير منطقية (>90%)')
      // 'added'  → الوكيل يضيف عمولته فوق سعرنا (نقبض سعرنا كاملاً)
      // 'deducted' → سعر السوق ثابت وتُقتطع العمولة من هامشنا
      const commissionDirection = b.commission_direction === 'added' ? 'added' : 'deducted'
      const marketPricing = computeMeraajMarketPricing(roomPricing, commissionMode, commissionValue, commissionDirection)
      // Sanity: in 'deducted' mode the commission must not consume the full price
      if (commissionDirection === 'deducted') {
        const badRow = marketPricing.find(r => r.base.adult > 0 && r.net.adult <= 0)
        if (badRow) return bad(`العمولة تلتهم كامل سعر غرفة (${badRow.room_type}) — خفّض العمولة أو غيّر الاتجاه إلى "تُضاف فوق السعر"`)
      }
      const seatsAllocatedRaw = Number(b.seats_allocated)
      if (!(seatsAllocatedRaw > 0)) return bad('حدد عدد المقاعد المتاحة للسوق (1 على الأقل)')
      const seatsAllocated = Math.min(10000, Math.floor(seatsAllocatedRaw))
      const prevSold = Number(pkg.meraaj?.seats_sold) || 0
      if (seatsAllocated < prevSold) return bad(`لا يمكن تخصيص أقل من المقاعد المباعة مسبقاً (${prevSold})`)
      const meraajSet = {
        shared: true,
        pricing_source: 'auto_room_pricing', // v3.25 — prices always mirror the package itself
        buyer_commission_mode: commissionMode,
        buyer_commission_value: commissionValue,
        commission_direction: commissionDirection,
        market_pricing: marketPricing,
        seats_allocated: seatsAllocated,
        seats_sold: prevSold,
        shared_at: pkg.meraaj?.shared_at || new Date(),
        updated_at: new Date(),
      }
      await db.collection('packages').updateOne({ id: pkg.id, tenant_id: T }, { $set: { meraaj: meraajSet } })
      const updated = await db.collection('packages').findOne({ id: pkg.id, tenant_id: T })
      const comps = await db.collection('package_components').find({ package_id: pkg.id, tenant_id: T }).toArray()
      // v3.29 — FIRST share = direct REST registration at Meraaj (NO 'package.shared' webhook — removed permanently).
      // Subsequent shares/updates keep using the 'package.updated' webhook.
      const firstShare = !pkg.meraaj?.registered_at
      if (firstShare) {
        const reg = await meraajRegisterPackageAPI(db, T, updated, comps, meraajSet)
        if (!reg.ok) {
          // Share is successful ONLY on 2xx from Meraaj — roll back the local share flag entirely
          await db.collection('packages').updateOne({ id: pkg.id, tenant_id: T }, { $set: { meraaj: { ...(pkg.meraaj || {}), shared: false } } })
          return bad(`فشلت المشاركة — لم يقبل سوق معراج تسجيل الباكج: ${reg.error}`, 502)
        }
        const regSet = { 'meraaj.registered_at': new Date() }
        if (reg.remote_id) regSet['meraaj.remote_id'] = reg.remote_id
        await db.collection('packages').updateOne({ id: pkg.id, tenant_id: T }, { $set: regSet })
        return ok({ shared: true, meraaj: { ...meraajSet, registered_at: regSet['meraaj.registered_at'], remote_id: reg.remote_id || null }, registered_via: 'rest_api' })
      }
      // Already registered at Meraaj before → keep registration reference + notify via webhook (contract payload)
      await db.collection('packages').updateOne({ id: pkg.id, tenant_id: T }, { $set: { 'meraaj.registered_at': pkg.meraaj.registered_at, ...(pkg.meraaj.remote_id ? { 'meraaj.remote_id': pkg.meraaj.remote_id } : {}) } })
      await emitMeraajEvent(db, T, 'package.updated', await meraajContractPayload(db, T, updated, comps, meraajSet))
      return ok({ shared: true, meraaj: meraajSet })
    }
    // Marketplace bookings received from Meraaj (inbound)
    if (route === '/meraaj/inbound-bookings' && method === 'GET') {
      return ok(clean(await db.collection('meraaj_inbound_bookings').find(tf).sort({ created_at: -1 }).limit(200).toArray()))
    }
    // v3.26 — APPROVE inbound Meraaj booking → real package_booking + balanced Journal Entry
    const meraajApproveMatch = route.match(/^\/meraaj\/inbound-bookings\/([^/]+)\/approve$/)
    if (meraajApproveMatch && method === 'POST') {
      const inbound = await db.collection('meraaj_inbound_bookings').findOne({ id: meraajApproveMatch[1], tenant_id: T })
      if (!inbound) return bad('الحجز الوارد غير موجود', 404)
      if (inbound.status === 'approved') return bad('هذا الحجز معتمد مسبقاً')
      if (inbound.status === 'cancelled') return bad('لا يمكن اعتماد حجز ملغى')
      const pkg = await db.collection('packages').findOne({ id: inbound.package_id, tenant_id: T })
      if (!pkg) return bad('الباكج غير موجود', 404)
      // 1) Buyer office as a credit client (auto-create once, reused afterwards)
      const clientName = `معراج — ${inbound.buyer_office_name}`.slice(0, 120)
      let cli = await db.collection('clients').findOne({ tenant_id: T, name: clientName })
      if (!cli) {
        let accountInfo = {}
        try { accountInfo = await generateSubAccountCode(db, T, '1301') } catch (e) { return bad(e.message) }
        cli = {
          id: uuidv4(), tenant_id: T, name: clientName, phone: '', whatsapp: '',
          address: '', email: '', notes: `عميل آلي — مكتب مشترٍ عبر معراج نتورك`, parent_code: '1301', ...accountInfo,
          credit_limit: 0, credit_currency: inbound.currency, is_frozen: false,
          balances: emptyBalances(), created_at: new Date(),
        }
        await db.collection('clients').insertOne(cli)
      }
      const cur = inbound.currency
      const registrants = inbound.registrants || []
      const adults = Number(inbound.pax_adults) || 0
      const children = Number(inbound.pax_children) || 0
      const infants = Number(inbound.pax_infants) || 0
      const paxBilled = adults + children
      const totalPax = registrants.length || (paxBilled + infants)
      // 2) Cost side from package components (dual pricing engine — same as internal bookings)
      const comps = await db.collection('package_components').find({ package_id: pkg.id, tenant_id: T }).toArray()
      const compTotals = comps.map(c => computeComponentTotals(c, registrants, paxBilled, totalPax))
      const total_cost = +compTotals.reduce((s, t) => s + t.cost_total, 0).toFixed(2)
      // 3) Sale side = what the buyer office owes us (net of the agent commission — valid for both directions)
      const total_sale = +(Number(inbound.net_to_seller_total) || 0).toFixed(2)
      const commission = +(total_sale - total_cost).toFixed(2)
      let rooms_summary = null
      if (registrants.length > 0) {
        rooms_summary = {}
        for (const r of registrants) if (r.room_type) rooms_summary[r.room_type] = (rooms_summary[r.room_type] || 0) + 1
        if (Object.keys(rooms_summary).length === 0) rooms_summary = null
      }
      const bookingDoc = {
        id: uuidv4(), tenant_id: T, package_id: pkg.id,
        client_id: cli.id, pilgrim_name: clientName,
        pax_count: totalPax, pax_adults: adults, pax_children: children, pax_infants: infants,
        pax_billed: paxBilled, pax_seats: paxBilled,
        registrants, rooms_summary,
        currency: cur, total_cost, total_sale, commission,
        discount: 0, discount_reason: '', discount_apply_cost: false,
        commission_partner_type: null, commission_partner_id: null, commission_partner_name: '',
        commission_share_mode: 'amount', commission_share_value: 0, commission_share_amount: 0,
        payment_method: 'credit', box_id: null,
        source: 'meraaj', meraaj_inbound_id: inbound.id, meraaj_booking_ref: inbound.meraaj_booking_ref,
        meraaj_customer_total: Number(inbound.total_price) || 0,
        meraaj_agent_commission: Number(inbound.agent_commission_total) || 0,
        component_snapshots: comps.map((c, i) => ({
          id: c.id, name: c.name, supplier_id: c.supplier_id, supplier_name: c.supplier_name,
          cost_per_pax: c.cost_per_pax, sale_per_pax: c.sale_per_pax,
          pricing_type: c.pricing_type || 'flat', include_infants: !!c.include_infants,
          ...(c.pricing_type === 'per_age' ? { cost_adult: c.cost_adult, cost_child: c.cost_child, cost_infant: c.cost_infant, sale_adult: c.sale_adult, sale_child: c.sale_child, sale_infant: c.sale_infant } : {}),
          ...(c.pricing_type === 'room_age' ? { room_rates: c.room_rates || [] } : {}),
          cost_total: compTotals[i].cost_total,
          sale_total: compTotals[i].sale_total,
        })),
        created_at: new Date(),
      }
      // 4) Balances: client owes total_sale; suppliers are owed their costs
      await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, cur, total_sale)
      for (let i = 0; i < comps.length; i++) {
        if (compTotals[i].cost_total > 0) await updateBalance(db, 'suppliers', { id: comps[i].supplier_id, tenant_id: T }, cur, compTotals[i].cost_total)
      }
      // 5) Balanced Journal Entry: debit client = credit suppliers + revenue
      const lines = [{ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: total_sale, credit: 0 }]
      const supGrouped = {}
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i]
        if (!compTotals[i].cost_total) continue
        supGrouped[c.supplier_id] = supGrouped[c.supplier_id] || { name: c.supplier_name, amount: 0 }
        supGrouped[c.supplier_id].amount += compTotals[i].cost_total
      }
      let supSum = 0
      for (const [sid, x] of Object.entries(supGrouped)) { const amt = +x.amount.toFixed(2); supSum += amt; lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sid, party_name: x.name, debit: 0, credit: amt }) }
      const revenueNet = +(total_sale - supSum).toFixed(2)
      if (revenueNet !== 0) lines.push({ account_code: '4103', account_name: 'إيرادات خدمات إضافية', party_type: 'revenue', party_id: null, party_name: `إيراد باكج ${pkg.name} — معراج`, debit: 0, credit: revenueNet })
      let je = null
      try {
        je = await createJournalEntry(db, T, {
          date: new Date(),
          description: `اعتماد حجز معراج ${inbound.meraaj_booking_ref || ''} — ${inbound.buyer_office_name} في ${pkg.name} (${totalPax} فرد، صافي ${total_sale} ${cur})`,
          ref_type: 'package_booking', ref_id: bookingDoc.id, currency: cur, lines,
        })
      } catch (jeErr) {
        // roll back balances if the JE was blocked (e.g. quota exceeded)
        await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, cur, -total_sale)
        for (let i = 0; i < comps.length; i++) {
          if (compTotals[i].cost_total > 0) await updateBalance(db, 'suppliers', { id: comps[i].supplier_id, tenant_id: T }, cur, -compTotals[i].cost_total)
        }
        return bad(jeErr.message || 'تعذر إنشاء القيد المحاسبي')
      }
      await db.collection('package_bookings').insertOne(bookingDoc)
      await db.collection('meraaj_inbound_bookings').updateOne({ id: inbound.id, tenant_id: T }, { $set: { status: 'approved', approved_at: new Date(), booking_id: bookingDoc.id, client_id: cli.id, client_name: cli.name } })
      // v3.27 — Notify Meraaj: booking accepted (closes the communication loop with the buyer office)
      await emitMeraajEvent(db, T, 'booking.approved', {
        booking_ref: inbound.meraaj_booking_ref,
        package_ref: pkg.id,
        inbound_id: inbound.id,
        buyer_office_name: inbound.buyer_office_name,
        seats: inbound.seats,
        pax: { adults: adults, children, infants },
        net_to_seller_total: total_sale,
        currency: cur,
        approved_at: new Date(),
      })
      await maybeEmitMeraajInventory(db, T, pkg.id)
      const { _id, ...rest } = bookingDoc
      return ok({ approved: true, booking: rest, client: { id: cli.id, name: cli.name }, journal_balanced: true })
    }
    // v3.27 — REJECT inbound Meraaj booking: releases seats + notifies Meraaj with the reason
    const meraajRejectMatch = route.match(/^\/meraaj\/inbound-bookings\/([^/]+)\/reject$/)
    if (meraajRejectMatch && method === 'POST') {
      const b = await request.json()
      const reason = String(b.reason || '').trim().slice(0, 300)
      if (!reason) return bad('سبب الرفض إلزامي — سيظهر للمكتب المشتري في معراج')
      const inbound = await db.collection('meraaj_inbound_bookings').findOne({ id: meraajRejectMatch[1], tenant_id: T })
      if (!inbound) return bad('الحجز الوارد غير موجود', 404)
      if (inbound.status === 'approved') return bad('لا يمكن رفض حجز معتمد — احذف الحجز المحاسبي أولاً إن لزم')
      if (inbound.status === 'cancelled') return bad('الحجز ملغى مسبقاً من المشتري')
      if (inbound.status === 'rejected') return bad('الحجز مرفوض مسبقاً')
      await db.collection('meraaj_inbound_bookings').updateOne(
        { id: inbound.id, tenant_id: T },
        { $set: { status: 'rejected', rejected_at: new Date(), reject_reason: reason } }
      )
      // Release the marketplace seats
      await db.collection('packages').updateOne({ id: inbound.package_id, tenant_id: T }, { $inc: { 'meraaj.seats_sold': -inbound.seats } })
      // Notify Meraaj (closes the loop — the buyer sees the rejection + reason)
      await emitMeraajEvent(db, T, 'booking.rejected', {
        booking_ref: inbound.meraaj_booking_ref,
        package_ref: inbound.package_id,
        inbound_id: inbound.id,
        buyer_office_name: inbound.buyer_office_name,
        reason,
        released_seats: inbound.seats,
        rejected_at: new Date(),
      })
      await maybeEmitMeraajInventory(db, T, inbound.package_id)
      return ok({ rejected: true, released_seats: inbound.seats, reason })
    }
    // v3.27 — WhatsApp sales log (Mini CRM): record every marketing message sent
    if (route === '/whatsapp-logs' && method === 'POST') {
      const b = await request.json()
      const doc = {
        id: uuidv4(), tenant_id: T,
        package_id: b.package_id || null,
        package_name: String(b.package_name || '').slice(0, 120),
        phone: String(b.phone || '').replace(/[^0-9+]/g, '').slice(0, 20),
        customer_name: String(b.customer_name || '').trim().slice(0, 80),
        message_preview: String(b.message || '').slice(0, 500),
        sent_by: sess.user.name || sess.user.email || '',
        status: 'sent', // sent | interested | booked | no_answer
        notes: '',
        created_at: new Date(),
      }
      await db.collection('whatsapp_logs').insertOne(doc)
      const { _id, ...rest } = doc
      return ok(rest)
    }
    if (route === '/whatsapp-logs' && method === 'GET') {
      const url = new URL(request.url)
      const q = { ...tf }
      const pid = url.searchParams.get('package_id')
      if (pid) q.package_id = pid
      return ok(clean(await db.collection('whatsapp_logs').find(q).sort({ created_at: -1 }).limit(300).toArray()))
    }
    // v3.28 — Sales performance per employee (conversion rates)
    if (route === '/whatsapp-logs/performance' && method === 'GET') {
      const url = new URL(request.url)
      const month = url.searchParams.get('month') // YYYY-MM (optional; default = current month)
      let start, end
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const [y, m] = month.split('-').map(Number)
        start = new Date(y, m - 1, 1); end = new Date(y, m, 1)
      } else {
        const now = new Date()
        start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      }
      const logs = await db.collection('whatsapp_logs').find({ tenant_id: T, created_at: { $gte: start, $lt: end } }).toArray()
      const byEmp = {}
      for (const l of logs) {
        const emp = l.sent_by || 'غير معروف'
        byEmp[emp] = byEmp[emp] || { employee: emp, sent_total: 0, interested: 0, booked: 0, no_answer: 0, pending: 0 }
        byEmp[emp].sent_total++
        if (l.status === 'interested') byEmp[emp].interested++
        else if (l.status === 'booked') byEmp[emp].booked++
        else if (l.status === 'no_answer') byEmp[emp].no_answer++
        else byEmp[emp].pending++
      }
      const rows = Object.values(byEmp).map(r => ({ ...r, conversion_rate: r.sent_total > 0 ? +((r.booked / r.sent_total) * 100).toFixed(1) : 0 }))
        .sort((a, b) => b.booked - a.booked || b.sent_total - a.sent_total)
      const totals = rows.reduce((s, r) => ({ sent_total: s.sent_total + r.sent_total, booked: s.booked + r.booked, interested: s.interested + r.interested, no_answer: s.no_answer + r.no_answer }), { sent_total: 0, booked: 0, interested: 0, no_answer: 0 })
      totals.conversion_rate = totals.sent_total > 0 ? +((totals.booked / totals.sent_total) * 100).toFixed(1) : 0
      return ok({ month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, rows, totals })
    }
    // v3.28 — Follow-up reminders: 'interested' leads untouched for 2+ days
    if (route === '/whatsapp-logs/reminders' && method === 'GET') {
      const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      const logs = await db.collection('whatsapp_logs').find({ tenant_id: T, status: 'interested' }).sort({ created_at: 1 }).limit(100).toArray()
      const due = logs.filter(l => new Date(l.updated_at || l.created_at) <= cutoff)
      return ok({
        count: due.length,
        logs: clean(due).map(l => ({ id: l.id, customer_name: l.customer_name, phone: l.phone, package_name: l.package_name, sent_by: l.sent_by, last_touch: l.updated_at || l.created_at })),
      })
    }
    const waLogMatch = route.match(/^\/whatsapp-logs\/([^/]+)$/)
    if (waLogMatch && method === 'PATCH') {
      const b = await request.json()
      const upd = {}
      if (b.status !== undefined && ['sent', 'interested', 'booked', 'no_answer'].includes(b.status)) upd.status = b.status
      if (b.notes !== undefined) upd.notes = String(b.notes || '').slice(0, 300)
      if (b.customer_name !== undefined) upd.customer_name = String(b.customer_name || '').trim().slice(0, 80)
      if (Object.keys(upd).length === 0) return bad('لا توجد تعديلات')
      upd.updated_at = new Date()
      const r = await db.collection('whatsapp_logs').updateOne({ id: waLogMatch[1], tenant_id: T }, { $set: upd })
      if (!r.matchedCount) return bad('السجل غير موجود', 404)
      return ok({ success: true })
    }
    if (waLogMatch && method === 'DELETE') {
      await db.collection('whatsapp_logs').deleteOne({ id: waLogMatch[1], tenant_id: T })
      return ok({ deleted: true })
    }
    // v3.26 — Partners monthly summary: earned vs settled vs outstanding per partner per currency
    if (route === '/partners/summary' && method === 'GET') {
      const q = { tenant_id: T, commission_share_amount: { $gt: 0 }, commission_partner_id: { $ne: null } }
      const [tickets, visas, services, bookings] = await Promise.all([
        db.collection('tickets').find(q).toArray(),
        db.collection('visas').find(q).toArray(),
        db.collection('services').find(q).toArray(),
        db.collection('package_bookings').find(q).toArray(),
      ])
      const partners = {}
      for (const d of [...tickets, ...visas, ...services, ...bookings]) {
        const pid = d.commission_partner_id
        const cur = d.currency || 'USD'
        partners[pid] = partners[pid] || { partner_id: pid, partner_name: d.commission_partner_name || '', partner_type: d.commission_partner_type || 'client', currencies: {}, ops_count: 0 }
        partners[pid].currencies[cur] = partners[pid].currencies[cur] || { earned: 0, settled: 0, outstanding: 0 }
        partners[pid].currencies[cur].earned += Number(d.commission_share_amount) || 0
        partners[pid].ops_count++
        if (!partners[pid].partner_name && d.commission_partner_name) partners[pid].partner_name = d.commission_partner_name
      }
      const settledStmts = await db.collection('partner_statements').find({ tenant_id: T, settlement_voucher_id: { $ne: null } }).toArray()
      for (const s of settledStmts) {
        if (!partners[s.partner_id]) continue
        const cur = s.settled_currency
        if (!cur) continue
        partners[s.partner_id].currencies[cur] = partners[s.partner_id].currencies[cur] || { earned: 0, settled: 0, outstanding: 0 }
        partners[s.partner_id].currencies[cur].settled += Number(s.settled_amount) || 0
      }
      const out = Object.values(partners).map(p => {
        for (const cur of Object.keys(p.currencies)) {
          const c = p.currencies[cur]
          c.earned = +c.earned.toFixed(2)
          c.settled = +c.settled.toFixed(2)
          c.outstanding = +(c.earned - c.settled).toFixed(2)
        }
        p.has_outstanding = Object.values(p.currencies).some(c => c.outstanding > 0.009)
        return p
      }).sort((a, b) => (b.has_outstanding ? 1 : 0) - (a.has_outstanding ? 1 : 0))
      return ok({ partners: out, count: out.length })
    }
    // Outbox / sync log
    if (route === '/meraaj/events' && method === 'GET') {
      return ok(clean(await db.collection('meraaj_events').find(tf).sort({ created_at: -1 }).limit(100).toArray()))
    }

    // Tenant Users
    if (route === '/tenant/users' && method === 'GET') {
      if (sess.user.role !== 'owner') return bad('غير مصرح', 403)
      const users = await db.collection('users').find(tf).sort({ created_at: 1 }).toArray()
      return ok(users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, role_key: u.role_key || null, active: u.active, created_at: u.created_at, default_box_id: u.default_box_id || null, lock_box: !!u.lock_box, permissions: u.role === 'owner' ? ownerPermissions() : { ...DEFAULT_STAFF_PERMISSIONS, ...(u.permissions || {}) } })))
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
      // v3.45 — RBAC role template key (display/reference; actual access = permissions object)
      if (b.role_key !== undefined) upd.role_key = String(b.role_key || '')
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

    // v3.14 — Pricing config (6-tier: silver/gold/enterprise × installments/annual)
    // Returns config with server-computed final prices based on the flexible discount.
    if (route === '/pricing' && method === 'GET') {
      const cfg = await getPricingConfig(db)
      const disc = cfg.discount_enabled ? Math.min(95, Math.max(0, Number(cfg.discount_percent) || 0)) : 0
      const n = Number(cfg.installments_count) || 5
      const plans = (cfg.plans || []).map(p => {
        const annualOriginal = Number(p.annual_price) || 0
        const annualFinal = Math.round(annualOriginal * (100 - disc)) / 100
        const instOriginal = Math.round((annualOriginal / n) * 100) / 100
        const instFinal = Math.round((annualFinal / n) * 100) / 100
        return {
          ...p,
          pricing: {
            annual: { original: annualOriginal, final: annualFinal },
            installment: { count: n, original_per: instOriginal, final_per: instFinal, total_final: annualFinal },
          },
        }
      })
      return ok({ discount_enabled: cfg.discount_enabled, discount_percent: disc, installments_count: n, plans, current: { plan_tier: sess.tenant?.plan_tier || null, billing_mode: sess.tenant?.billing_mode || null, unlimited: isUnlimitedTenant(sess.tenant) } })
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
      // v3.9.18 — Always use official domain for affiliate links (never expose Emergent preview URLs)
      const link = `https://rahaal.targetmediagrp.com/signup?ref=${code}`
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
      const isPaid = isUnlimitedTenant(sess.tenant)
      const used = sess.tenant?.scraper_usage?.count || 0
      const limit = 30
      return ok({
        ok: true, tenant: { id: T, name: sess.tenant?.name || null, plan: isPaid ? 'paid' : 'trial' },
        user: { id: sess.user.id, email: sess.user.email, role: sess.user.role },
        version: '3.9.28',
        extension_min_version: '1.4.0',
        usage: { plan: isPaid ? 'paid' : 'trial', used, limit: isPaid ? -1 : limit, remaining: isPaid ? -1 : Math.max(0, limit - used), unlimited: isPaid },
      })
    }
    if (route === '/scraper/ingest' && method === 'POST') {
      // v3.9.7 — enforce trial cap (30) for non-paid tenants
      const isPaidT = isUnlimitedTenant(sess.tenant)
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
      if (!b.supplier_id) return bad('المورد مطلوب (supplier_id)')
      const currency = CURRENCIES.includes(financial.currency) ? financial.currency : 'USD'
      const amount = Number(financial.amount) || 0
      const paymentMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
      // v3.9.22 — Unified payment: credit needs client_id, cash needs box_id
      if (paymentMethod === 'credit' && !b.client_id) return bad('العميل مطلوب للحجز الآجل')
      if (paymentMethod === 'cash' && !b.box_id) return bad('اختر الصندوق / البنك للنقد')
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
      // v3.28 — Soft archive: archived packages are hidden by default; ?archived=1 lists ONLY archived
      const wantArchived = q.archived === '1' || q.archived === 'true'
      const pkgFilter = { ...tf, ...(wantArchived ? { archived: true } : { archived: { $ne: true } }) }
      const list = await db.collection('packages').find(pkgFilter).sort({ created_at: -1 }).toArray()
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
      // v3.15 — Room-type pricing / v3.20 — extended with age tiers (sale_child, sale_infant)
      const roomPricing = sanitizeRoomPricing(b.room_pricing)
      // v3.20 — Dual pricing mode: 'direct' (room+age matrix, B2B) | 'components' (assembled from components)
      const pricingMode = ['direct', 'components'].includes(b.pricing_mode) ? b.pricing_mode : (roomPricing.length > 0 ? 'direct' : 'components')
      const doc = {
        id: uuidv4(), tenant_id: T, name: String(b.name), package_type: b.package_type,
        currency: CURRENCIES.includes(b.currency) ? b.currency : 'SAR',
        start_date: b.start_date ? new Date(b.start_date) : null,
        end_date: b.end_date ? new Date(b.end_date) : null,
        room_pricing: roomPricing,
        pricing_mode: pricingMode,
        hotels: sanitizeHotels(b.hotels), // v3.49
        features: sanitizeFeatures(b.features),
        has_image: false,
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
      // v3.31 — start_date now editable too (needed for full editing after duplication)
      for (const k of ['name', 'package_type', 'notes', 'start_date', 'end_date', 'status']) if (b[k] !== undefined) upd[k] = (k === 'end_date' || k === 'start_date') && b[k] ? new Date(b[k]) : b[k]
      // v3.31 — currency editable ONLY while the package has no bookings (accounting safety)
      if (b.currency !== undefined) {
        const curPkg = await db.collection('packages').findOne({ id: pkgIdMatch[1], tenant_id: T }, { projection: { currency: 1 } })
        if (curPkg && String(b.currency) !== String(curPkg.currency)) {
          const bkCount = await db.collection('package_bookings').countDocuments({ tenant_id: T, package_id: pkgIdMatch[1] })
          if (bkCount > 0) return bad('لا يمكن تغيير عملة باكج به حجوزات — العملة مرتبطة بالقيود المحاسبية')
          upd.currency = String(b.currency).slice(0, 8)
        }
      }
      // v3.15 — Room-type pricing update / v3.20 — age tiers
      if (b.room_pricing !== undefined) {
        upd.room_pricing = sanitizeRoomPricing(b.room_pricing)
      }
      // v3.20 — Dual pricing mode update
      if (b.pricing_mode !== undefined && ['direct', 'components'].includes(b.pricing_mode)) {
        upd.pricing_mode = b.pricing_mode
      }
      // v3.23 — Features/amenities update (Miraj Network readiness)
      if (b.features !== undefined) {
        upd.features = sanitizeFeatures(b.features)
      }
      // v3.49 — Hotels quick-details (name + city + nights) for program display
      if (b.hotels !== undefined) {
        upd.hotels = sanitizeHotels(b.hotels)
      }
      await db.collection('packages').updateOne({ id: pkgIdMatch[1], tenant_id: T }, { $set: upd })
      // v3.24/v3.25 — Meraaj sync: shared packages emit updates; closing emits deactivation
      try {
        const pkgAfter = await db.collection('packages').findOne({ id: pkgIdMatch[1], tenant_id: T })
        if (pkgAfter?.meraaj?.shared) {
          if (upd.status === 'closed') await emitMeraajEvent(db, T, 'package.deactivated', { package_ref: pkgAfter.id, reason: 'closed_by_office' })
          else {
            // v3.25 — room prices changed → auto-recompute marketplace pricing (always mirrors Rahaal)
            if (upd.room_pricing !== undefined) {
              const m = pkgAfter.meraaj
              const newMarket = computeMeraajMarketPricing(pkgAfter.room_pricing, m.buyer_commission_mode || 'amount', Number(m.buyer_commission_value) || 0, m.commission_direction || 'deducted')
              await db.collection('packages').updateOne({ id: pkgAfter.id, tenant_id: T }, { $set: { 'meraaj.market_pricing': newMarket, 'meraaj.updated_at': new Date() } })
              pkgAfter.meraaj.market_pricing = newMarket
            }
            const compsM = await db.collection('package_components').find({ package_id: pkgAfter.id, tenant_id: T }).toArray()
            // v3.30 — package.updated must carry the Meraaj CONTRACT payload (title/description/departure_date/return_date)
            await emitMeraajEvent(db, T, 'package.updated', await meraajContractPayload(db, T, pkgAfter, compsM))
          }
        }
      } catch { }
      return ok({ success: true })
    }
    if (pkgIdMatch && method === 'DELETE') {
      // Only allow delete if no bookings
      const bk = await db.collection('package_bookings').countDocuments({ tenant_id: T, package_id: pkgIdMatch[1] })
      if (bk > 0) return bad('لا يمكن حذف باكج به تسجيلات — أغلقه بدلاً من الحذف')
      // v3.30/v3.32 — If the package is listed/registered on Meraaj: FIRST deliver package.deactivated.
      // v3.32 STRICT GUARD: if delivery to Meraaj FAILS, the package is NOT deleted locally
      // (a Meraaj copy must never remain listed while the Rahaal original is gone).
      const pkgDel = await db.collection('packages').findOne({ id: pkgIdMatch[1], tenant_id: T })
      if (pkgDel && (pkgDel.meraaj?.shared || pkgDel.meraaj?.registered_at)) {
        const dlv = await emitMeraajEvent(db, T, 'package.deactivated', { package_ref: pkgDel.id, reason: 'deleted_by_office' })
        if (dlv === 'failed') return bad('لم يتم الحذف — تعذر إبلاغ سوق معراج بإيقاف الباكج. حاول لاحقاً أو أوقف المشاركة أولاً', 502)
      }
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
      // v3.20 — Dual pricing types: 'flat' (visa: fixed regardless of age), 'per_age' (transport), 'room_age' (hotel)
      const pricingType = ['flat', 'per_age', 'room_age'].includes(b.pricing_type) ? b.pricing_type : 'flat'
      const doc = {
        id: uuidv4(), tenant_id: T, package_id: pkgCompMatch[1],
        name: b.name, component_type: b.component_type || 'other',  // visa/ticket/hotel/transport/other
        supplier_id: sup.id, supplier_name: sup.name,
        cost_per_pax: Number(b.cost_per_pax) || 0,
        sale_per_pax: Number(b.sale_per_pax) || 0,
        pricing_type: pricingType,
        include_infants: !!b.include_infants,
        // v3.40 — Hotel nights management: nights per hotel + city (e.g. 3 nights Makkah, 4 nights Madinah)
        nights: Math.max(0, Number(b.nights) || 0),
        city: String(b.city || '').slice(0, 60),
        notes: b.notes || '', created_at: new Date(),
      }
      if (pricingType === 'per_age') {
        for (const f of ['cost_adult', 'cost_child', 'cost_infant', 'sale_adult', 'sale_child', 'sale_infant']) doc[f] = Math.max(0, Number(b[f]) || 0)
        // keep legacy display fields aligned with adult tier
        doc.cost_per_pax = doc.cost_adult
        doc.sale_per_pax = doc.sale_adult
      }
      if (pricingType === 'room_age') {
        doc.room_rates = sanitizeRoomRates(b.room_rates)
        if (doc.room_rates.length === 0) return bad('أضف سعر غرفة واحدة على الأقل لمكوّن الفندق (غرفة + عمر)')
        doc.cost_per_pax = doc.room_rates[0]?.cost_adult || 0
        doc.sale_per_pax = doc.room_rates[0]?.sale_adult || 0
      }
      await db.collection('package_components').insertOne(doc)
      await maybeEmitMeraajPackageUpdate(db, T, pkgCompMatch[1]) // v3.32 — sync marketplace (hotels/transport list)
      const { _id, ...rest } = doc; return ok(rest)
    }
    const pkgCompDelMatch = route.match(/^\/packages\/([^/]+)\/components\/([^/]+)$/)
    if (pkgCompDelMatch && method === 'DELETE') {
      await db.collection('package_components').deleteOne({ id: pkgCompDelMatch[2], tenant_id: T, package_id: pkgCompDelMatch[1] })
      await maybeEmitMeraajPackageUpdate(db, T, pkgCompDelMatch[1]) // v3.32 — sync marketplace
      return ok({ success: true })
    }

    // v3.9.26 — Package Transports (buses/flights) with capacity tracking
    const pkgTransMatch = route.match(/^\/packages\/([^/]+)\/transports$/)
    if (pkgTransMatch && method === 'GET') {
      const list = await db.collection('package_transports').find({ tenant_id: T, package_id: pkgTransMatch[1] }).sort({ created_at: 1 }).toArray()
      return ok(list.map(t => ({ ...t, _id: undefined })))
    }
    if (pkgTransMatch && method === 'POST') {
      const b = await request.json()
      const pkgId = pkgTransMatch[1]
      const pkg = await db.collection('packages').findOne({ id: pkgId, tenant_id: T })
      if (!pkg) return bad('الباكج غير موجود', 404)
      if (!b.name || !String(b.name).trim()) return bad('اسم وسيلة النقل مطلوب')
      const capacity = Math.max(1, Number(b.capacity) || 44)
      const type = ['bus', 'flight', 'train', 'car'].includes(b.type) ? b.type : 'bus'
      const doc = {
        id: uuidv4(), tenant_id: T, package_id: pkgId,
        name: String(b.name).trim(),
        type, capacity, seats_booked: 0,
        driver_name: b.driver_name || '',
        driver_phone: b.driver_phone || '',
        vehicle_plate: b.vehicle_plate || '',
        flight_no: b.flight_no || '',
        notes: b.notes || '',
        status: 'open',
        created_at: new Date(), created_by: sess.user.email,
      }
      await db.collection('package_transports').insertOne(doc)
      await maybeEmitMeraajPackageUpdate(db, T, pkgId) // v3.32 — sync marketplace (transport)
      const { _id, ...rest } = doc; return ok(rest)
    }
    const pkgTransItemMatch = route.match(/^\/packages\/([^/]+)\/transports\/([^/]+)$/)
    if (pkgTransItemMatch && method === 'PATCH') {
      const [, pkgIdT, tid] = pkgTransItemMatch
      const b = await request.json()
      const existing = await db.collection('package_transports').findOne({ id: tid, tenant_id: T, package_id: pkgIdT })
      if (!existing) return bad('وسيلة النقل غير موجودة', 404)
      const updates = {}
      if (b.name !== undefined) updates.name = String(b.name).trim() || existing.name
      if (b.type !== undefined && ['bus', 'flight', 'train', 'car'].includes(b.type)) updates.type = b.type
      if (b.capacity !== undefined) {
        const cap = Math.max(1, Number(b.capacity) || existing.capacity)
        if (cap < existing.seats_booked) return bad(`السعة الجديدة (${cap}) أقل من المقاعد المحجوزة (${existing.seats_booked})`)
        updates.capacity = cap
      }
      if (b.driver_name !== undefined) updates.driver_name = String(b.driver_name || '')
      if (b.driver_phone !== undefined) updates.driver_phone = String(b.driver_phone || '')
      if (b.vehicle_plate !== undefined) updates.vehicle_plate = String(b.vehicle_plate || '')
      if (b.flight_no !== undefined) updates.flight_no = String(b.flight_no || '')
      if (b.notes !== undefined) updates.notes = String(b.notes || '')
      if (b.status !== undefined && ['open', 'closed'].includes(b.status)) updates.status = b.status
      updates.updated_at = new Date()
      await db.collection('package_transports').updateOne({ id: tid, tenant_id: T }, { $set: updates })
      const updated = await db.collection('package_transports').findOne({ id: tid, tenant_id: T })
      await maybeEmitMeraajPackageUpdate(db, T, updated.package_id) // v3.34 — sync marketplace (transport)
      const { _id, ...rest } = updated; return ok(rest)
    }
    if (pkgTransItemMatch && method === 'DELETE') {
      const [, pkgIdT2, tid] = pkgTransItemMatch
      const existing = await db.collection('package_transports').findOne({ id: tid, tenant_id: T, package_id: pkgIdT2 })
      if (!existing) return bad('وسيلة النقل غير موجودة', 404)
      const usedCount = await db.collection('package_bookings').countDocuments({ tenant_id: T, package_id: pkgIdT2, transport_id: tid })
      if (usedCount > 0) return bad(`لا يمكن الحذف — يوجد ${usedCount} مسافر مسجّل على هذه الوسيلة. انقلهم إلى وسيلة أخرى أولاً.`)
      await db.collection('package_transports').deleteOne({ id: tid, tenant_id: T })
      await maybeEmitMeraajPackageUpdate(db, T, pkgIdT2) // v3.34 — sync marketplace (transport)
      return ok({ success: true, transport_id: tid })
    }


    // v3.28 — SOFT ARCHIVE (NO hard delete — accounting entries stay 100% intact)
    const pkgArchiveMatch = route.match(/^\/packages\/([^/]+)\/archive$/)
    if (pkgArchiveMatch && method === 'POST') {
      const b = await request.json()
      const pkg = await db.collection('packages').findOne({ id: pkgArchiveMatch[1], tenant_id: T })
      if (!pkg) return bad('الباكج غير موجود', 404)
      const toArchive = b.archived !== false
      if (toArchive) {
        const upd = { archived: true, archived_at: new Date() }
        // Archiving also removes it from Meraaj marketplace (soft — data preserved)
        // v3.34 — deliver deactivation FIRST; if Meraaj unreachable, block the archive (no dangling listing)
        if (pkg.meraaj?.shared) {
          const dlv = await emitMeraajEvent(db, T, 'package.deactivated', { package_ref: pkg.id, reason: 'archived_by_office' })
          if (dlv === 'failed') return bad('تعذر إبلاغ سوق معراج بإيقاف الباكج — لم تتم الأرشفة. حاول لاحقاً أو أوقف المشاركة أولاً', 502)
          upd['meraaj.shared'] = false
          upd['meraaj.unshared_at'] = new Date()
        }
        await db.collection('packages').updateOne({ id: pkg.id, tenant_id: T }, { $set: upd })
        return ok({ archived: true, was_shared: !!pkg.meraaj?.shared })
      } else {
        await db.collection('packages').updateOne({ id: pkg.id, tenant_id: T }, { $set: { archived: false, restored_at: new Date() } })
        return ok({ archived: false })
      }
    }
    // v3.23 — Package image (upload / view / delete) — stored in separate collection to keep package docs light
    const pkgImgMatch = route.match(/^\/packages\/([^/]+)\/image$/)
    if (pkgImgMatch && method === 'POST') {
      const b = await request.json()
      const pkg = await db.collection('packages').findOne({ id: pkgImgMatch[1], tenant_id: T })
      if (!pkg) return bad('الباكج غير موجود', 404)
      const raw = String(b.data || '')
      const m = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
      if (!m) return bad('صيغة الصورة غير صالحة — يُقبل JPG / PNG / WebP فقط')
      if (m[2].length > 4_000_000) return bad('حجم الصورة كبير جداً (الحد الأقصى ~3MB)')
      // v3.47 — Automatic optimization ONCE at upload: resize to max 1200px (aspect preserved,
      // never enlarged), auto-rotate per EXIF, convert to WebP q82. Keeps MongoDB payloads small.
      // Serving endpoints & Meraaj integration unchanged (content_type is read from the doc).
      let outBuf, outMeta
      try {
        const srcBuf = Buffer.from(m[2], 'base64')
        const pipeline = sharp(srcBuf, { failOn: 'none' }).rotate()
          .resize({ width: IMG_MAX_DIM, height: IMG_MAX_DIM, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: IMG_WEBP_QUALITY })
        outBuf = await pipeline.toBuffer()
        outMeta = await sharp(outBuf).metadata()
      } catch {
        return bad('تعذر معالجة الصورة — تأكد أنها صورة صالحة (JPG / PNG / WebP)')
      }
      await db.collection('package_images').updateOne(
        { package_id: pkg.id, tenant_id: T },
        { $set: { package_id: pkg.id, tenant_id: T, content_type: 'image/webp', data: outBuf.toString('base64'), width: outMeta.width || null, height: outMeta.height || null, original_bytes: Math.round(m[2].length * 0.75), optimized_bytes: outBuf.length, updated_at: new Date() }, $setOnInsert: { id: uuidv4(), created_at: new Date() } },
        { upsert: true }
      )
      await db.collection('packages').updateOne({ id: pkg.id, tenant_id: T }, { $set: { has_image: true } })
      await maybeEmitMeraajPackageUpdate(db, T, pkg.id) // v3.32 — sync marketplace images
      return ok({ saved: true, optimized: { width: outMeta.width, height: outMeta.height, bytes: outBuf.length, format: 'webp' } })
    }
    if (pkgImgMatch && method === 'GET') {
      const img = await db.collection('package_images').findOne({ package_id: pkgImgMatch[1], tenant_id: T })
      if (!img) return bad('لا توجد صورة', 404)
      const buf = Buffer.from(img.data, 'base64')
      return new Response(buf, { status: 200, headers: { 'Content-Type': img.content_type || 'image/jpeg', 'Cache-Control': 'private, max-age=120' } })
    }
    if (pkgImgMatch && method === 'DELETE') {
      await db.collection('package_images').deleteOne({ package_id: pkgImgMatch[1], tenant_id: T })
      await db.collection('packages').updateOne({ id: pkgImgMatch[1], tenant_id: T }, { $set: { has_image: false } })
      await maybeEmitMeraajPackageUpdate(db, T, pkgImgMatch[1]) // v3.32 — sync marketplace images
      return ok({ deleted: true })
    }

    // v3.21 — Duplicate package (structure + components + transports; NO bookings/JEs)
    const pkgDupMatch = route.match(/^\/packages\/([^/]+)\/duplicate$/)
    if (pkgDupMatch && method === 'POST') {
      const srcId = pkgDupMatch[1]
      const src = await db.collection('packages').findOne({ id: srcId, tenant_id: T })
      if (!src) return bad('الباكج غير موجود', 404)
      let bodyDup = {}
      try { bodyDup = await request.json() } catch { bodyDup = {} }
      const newId = uuidv4()
      const baseName = String(bodyDup.name || '').trim().slice(0, 120) || `${src.name} — نسخة`
      const { _id, ...srcRest } = src
      const newPkg = {
        ...srcRest,
        id: newId,
        name: baseName,
        status: 'open',
        start_date: bodyDup.start_date ? new Date(bodyDup.start_date) : (src.start_date || null),
        end_date: bodyDup.end_date ? new Date(bodyDup.end_date) : (src.end_date || null),
        duplicated_from: src.id,
        created_at: new Date(),
      }
      delete newPkg.updated_at
      // v3.31 — The duplicate is a fully INDEPENDENT package:
      // NEVER inherit Meraaj marketplace identity/state (shared, registered_at, remote_id, seats_sold,
      // market_pricing...) nor archive flags from the source. First share of the copy will register it
      // as a brand-new package at Meraaj via POST /api/integrations/rahal/packages/share (package_ref = new id).
      delete newPkg.meraaj
      delete newPkg.archived
      delete newPkg.archived_at
      delete newPkg.archived_by
      delete newPkg.restored_at
      await db.collection('packages').insertOne(newPkg)
      // Clone components (all pricing types + rates preserved)
      const srcComps = await db.collection('package_components').find({ package_id: srcId, tenant_id: T }).toArray()
      let compCount = 0
      for (const c of srcComps) {
        const { _id: cid, ...cRest } = c
        await db.collection('package_components').insertOne({ ...cRest, id: uuidv4(), package_id: newId, created_at: new Date() })
        compCount++
      }
      // Clone transports (structure only — no passengers)
      const srcTrans = await db.collection('package_transports').find({ package_id: srcId, tenant_id: T }).toArray()
      let transCount = 0
      for (const t of srcTrans) {
        const { _id: tid2, ...tRest } = t
        await db.collection('package_transports').insertOne({ ...tRest, id: uuidv4(), package_id: newId, status: 'open', created_at: new Date() })
        transCount++
      }
      // v3.23 — Clone package image too
      const srcImg = await db.collection('package_images').findOne({ package_id: srcId, tenant_id: T })
      if (srcImg) {
        const { _id: iid, ...imgRest } = srcImg
        await db.collection('package_images').insertOne({ ...imgRest, id: uuidv4(), package_id: newId, created_at: new Date() })
      }
      const { _id: nid, ...pkgOut } = newPkg
      return ok({ ...pkgOut, components_copied: compCount, transports_copied: transCount })
    }

    // Package bookings — register a client with auto-JE
    const pkgBookMatch = route.match(/^\/packages\/([^/]+)\/bookings$/)
    if (pkgBookMatch && method === 'GET') {
      const list = await db.collection('package_bookings').find({ tenant_id: T, package_id: pkgBookMatch[1] }).sort({ created_at: -1 }).toArray()
      return ok(list.map(b => ({ ...b, _id: undefined })))
    }

    // v3.9.20 — Delete a specific package booking (reverses balances + JE)
    const pkgBookDelMatch = route.match(/^\/packages\/([^/]+)\/bookings\/([^/]+)$/)
    if (pkgBookDelMatch && method === 'DELETE') {
      const [_, pkgId, bookingId] = pkgBookDelMatch
      const booking = await db.collection('package_bookings').findOne({ id: bookingId, tenant_id: T, package_id: pkgId })
      if (!booking) return bad('التسجيل غير موجود', 404)
      // Reverse balances
      const cur = booking.currency || 'USD'
      const payMethod = booking.payment_method || 'credit'
      if (payMethod === 'cash' && booking.box_id) {
        await updateBalance(db, 'boxes', { id: booking.box_id, tenant_id: T }, cur, -(booking.total_sale || 0))
      } else if (booking.client_id) {
        await updateBalance(db, 'clients', { id: booking.client_id, tenant_id: T }, cur, -(booking.total_sale || 0))
      }
      // Reverse supplier balances from component snapshots
      if (booking.component_snapshots && Array.isArray(booking.component_snapshots)) {
        for (const comp of booking.component_snapshots) {
          if (comp.supplier_id && comp.cost_total) {
            await updateBalance(db, 'suppliers', { id: comp.supplier_id, tenant_id: T }, cur, -(comp.cost_total || 0))
          }
        }
      }
      // Delete associated JE
      const je = await db.collection('journal_entries').findOne({ ref_type: 'package_booking', ref_id: bookingId, tenant_id: T })
      if (je) {
        await db.collection('journal_entries').deleteOne({ id: je.id })
        await db.collection('tenants').updateOne({ id: T }, { $inc: { 'journal_quota.used': -1 } })
      }
      // Decrement package bookings count
      await db.collection('packages').updateOne({ id: pkgId, tenant_id: T }, { $inc: { bookings_count: -1 } })
      // v3.9.26 — Free up transport seats
      if (booking.transport_id) {
        const t = await db.collection('package_transports').findOne({ id: booking.transport_id, tenant_id: T })
        if (t) {
          const newBooked = Math.max(0, (t.seats_booked || 0) - (booking.pax_count || 1))
          const newStatus = t.status === 'full' && newBooked < t.capacity ? 'open' : t.status
          await db.collection('package_transports').updateOne({ id: t.id, tenant_id: T }, { $set: { seats_booked: newBooked, status: newStatus } })
        }
      }
      await db.collection('package_bookings').deleteOne({ id: bookingId, tenant_id: T })
      await maybeEmitMeraajInventory(db, T, pkgBookDelMatch[1])
      return ok({ success: true, booking_id: bookingId })
    }

    // v3.9.21 — PATCH a package booking (edit passenger data, recomputes balances + JE)
    if (pkgBookDelMatch && method === 'PATCH') {
      const [, pkgId2, bookingId2] = pkgBookDelMatch
      const body = await request.json()
      const oldBooking = await db.collection('package_bookings').findOne({ id: bookingId2, tenant_id: T, package_id: pkgId2 })
      if (!oldBooking) return bad('التسجيل غير موجود', 404)
      const pkgDoc = await db.collection('packages').findOne({ id: pkgId2, tenant_id: T })
      if (!pkgDoc) return bad('الباكج غير موجود', 404)
      if (pkgDoc.status === 'closed') return bad('الباكج مغلق — لا يمكن تعديل التسجيلات')
      const cur = oldBooking.currency || pkgDoc.currency || 'USD'
      const lightOnly = (
        (body.pax_count === undefined || Number(body.pax_count) === Number(oldBooking.pax_count)) &&
        (body.client_id === undefined || body.client_id === oldBooking.client_id) &&
        (body.payment_method === undefined || body.payment_method === oldBooking.payment_method) &&
        (body.box_id === undefined || body.box_id === (oldBooking.box_id || '')) &&
        body.total_cost === undefined && body.total_sale === undefined &&
        // v3.17 — a discount amount change affects money => full recalc required
        (body.discount === undefined || Number(body.discount) === Number(oldBooking.discount || 0)) &&
        // v3.19 — smart-discount flag or partner-commission changes => full recalc required
        (body.discount_apply_cost === undefined || !!body.discount_apply_cost === !!oldBooking.discount_apply_cost) &&
        (body.commission_partner_id === undefined || (body.commission_partner_id || null) === (oldBooking.commission_partner_id || null)) &&
        (body.commission_share_mode === undefined || body.commission_share_mode === (oldBooking.commission_share_mode || 'amount')) &&
        (body.commission_share_value === undefined || Number(body.commission_share_value) === Number(oldBooking.commission_share_value || 0)) &&
        (body.registrants === undefined)
      )
      if (lightOnly) {
        const updates = {}
        if (body.pilgrim_name !== undefined) updates.pilgrim_name = String(body.pilgrim_name || '').trim() || oldBooking.pilgrim_name
        if (body.passport_no !== undefined) updates.passport_no = String(body.passport_no || '').trim()
        if (body.notes !== undefined) updates.notes = String(body.notes || '').trim()
        if (body.discount_reason !== undefined) updates.discount_reason = String(body.discount_reason || '').trim().slice(0, 120)
        if (Object.keys(updates).length > 0) {
          await db.collection('package_bookings').updateOne({ id: bookingId2, tenant_id: T }, { $set: { ...updates, updated_at: new Date(), updated_by: sess.user.email } })
          const newName = updates.pilgrim_name || oldBooking.pilgrim_name
          await db.collection('journal_entries').updateOne(
            { ref_type: 'package_booking', ref_id: bookingId2, tenant_id: T },
            { $set: { description: `تسجيل ${newName} في ${pkgDoc.name} — ${oldBooking.pax_count} فرد (تعديل)` } }
          )
        }
        const updatedLight = await db.collection('package_bookings').findOne({ id: bookingId2, tenant_id: T })
        const { _id: _idL, ...restL } = updatedLight
        return ok({ ...restL, _light_update: true })
      }
      // FULL RECALC — reverse old, then re-apply new
      const oldPay = oldBooking.payment_method || 'credit'
      if (oldPay === 'cash' && oldBooking.box_id) {
        await updateBalance(db, 'boxes', { id: oldBooking.box_id, tenant_id: T }, cur, -(oldBooking.total_sale || 0))
      } else if (oldBooking.client_id) {
        await updateBalance(db, 'clients', { id: oldBooking.client_id, tenant_id: T }, cur, -(oldBooking.total_sale || 0))
      }
      if (Array.isArray(oldBooking.component_snapshots)) {
        for (const comp of oldBooking.component_snapshots) {
          if (comp.supplier_id && comp.cost_total) {
            await updateBalance(db, 'suppliers', { id: comp.supplier_id, tenant_id: T }, cur, -(comp.cost_total || 0))
          }
        }
      }
      // v3.19 — Reverse old partner-commission share balance (it was applied as a negative on create)
      if ((Number(oldBooking.commission_share_amount) || 0) > 0 && oldBooking.commission_partner_id) {
        const oldPcCol = oldBooking.commission_partner_type === 'supplier' ? 'suppliers' : 'clients'
        await updateBalance(db, oldPcCol, { id: oldBooking.commission_partner_id, tenant_id: T }, cur, +(Number(oldBooking.commission_share_amount) || 0))
      }
      const oldJe = await db.collection('journal_entries').findOne({ ref_type: 'package_booking', ref_id: bookingId2, tenant_id: T })
      const existingJeId = oldJe?.id || undefined
      if (oldJe) await db.collection('journal_entries').deleteOne({ id: oldJe.id })
      const newPax = Math.max(1, Number(body.pax_count ?? oldBooking.pax_count) || 1)
      const newPay = body.payment_method === 'cash' ? 'cash' : (body.payment_method === 'credit' ? 'credit' : (oldBooking.payment_method || 'credit'))
      // v3.9.22 — Unified payment: credit needs client_id, cash needs box_id
      const newClientId = body.client_id !== undefined ? body.client_id : oldBooking.client_id
      let cli = null
      if (newClientId) {
        cli = await db.collection('clients').findOne({ id: newClientId, tenant_id: T })
        if (!cli && newPay === 'credit') return bad('العميل غير موجود')
      }
      if (newPay === 'credit' && !cli) return bad('اختر حساب القبض / العميل (للحجز الآجل)')
      let box = null
      if (newPay === 'cash') {
        const newBoxId = body.box_id || oldBooking.box_id
        if (!newBoxId) return bad('اختر الصندوق / البنك (للنقد)')
        box = await db.collection('boxes').findOne({ id: newBoxId, tenant_id: T })
        if (!box) return bad('الصندوق غير موجود')
      }
      // v3.9.26 — Transport switch validation
      let newTransport = null
      let oldTransport = null
      const newTransportId = body.transport_id !== undefined ? body.transport_id : oldBooking.transport_id
      if (newTransportId) {
        newTransport = await db.collection('package_transports').findOne({ id: newTransportId, tenant_id: T, package_id: pkgId2 })
        if (!newTransport) return bad('وسيلة النقل غير موجودة')
        // If switching transport OR changing pax_count, check new transport capacity
        if (newTransportId !== oldBooking.transport_id || newPax !== oldBooking.pax_count) {
          const currentUse = newTransportId === oldBooking.transport_id ? newTransport.seats_booked - oldBooking.pax_count : newTransport.seats_booked
          if ((currentUse + newPax) > newTransport.capacity) {
            return bad(`السعة غير كافية على "${newTransport.name}" (${currentUse}/${newTransport.capacity} — تحتاج ${newPax} مقعداً).`)
          }
        }
      }
      if (oldBooking.transport_id) {
        oldTransport = await db.collection('package_transports').findOne({ id: oldBooking.transport_id, tenant_id: T })
      }
      // v3.15/v3.20 — Registrants list update (edit mode) — computed BEFORE snapshots so dual pricing applies
      let newRegistrants = oldBooking.registrants || []
      let newRoomsSummary = oldBooking.rooms_summary || null
      if (body.registrants !== undefined) {
        newRegistrants = (Array.isArray(body.registrants) ? body.registrants : [])
          .filter(r => r && String(r.name || '').trim())
          .slice(0, 200)
          .map(r => ({
            name: String(r.name).trim().slice(0, 80),
            passport_no: String(r.passport_no || '').trim().toUpperCase().slice(0, 30),
            age: r.age === '' || r.age === null || r.age === undefined ? null : Math.max(0, Math.min(120, Number(r.age) || 0)),
            visa_no: String(r.visa_no || '').trim().slice(0, 40),
            room_type: String(r.room_type || '').trim().slice(0, 40),
          }))
        newRoomsSummary = {}
        for (const r of newRegistrants) if (r.room_type) newRoomsSummary[r.room_type] = (newRoomsSummary[r.room_type] || 0) + 1
        if (Object.keys(newRoomsSummary).length === 0) newRoomsSummary = null
      }
      // v3.20 — Derive pax categories for dual pricing (registrants override; fallback = legacy pax count)
      let npAdults = newPax, npChildren = 0, npInfants = 0
      if (newRegistrants.length > 0) {
        npAdults = newRegistrants.filter(r => ageCategoryOf(r.age) === 'adult').length
        npChildren = newRegistrants.filter(r => ageCategoryOf(r.age) === 'child').length
        npInfants = newRegistrants.filter(r => ageCategoryOf(r.age) === 'infant').length
      }
      const npBilled = newRegistrants.length > 0 ? (npAdults + npChildren) : newPax
      const npTotal = newRegistrants.length > 0 ? newRegistrants.length : newPax
      // v3.20 — Recompute component totals honoring frozen pricing_type in snapshots (flat / per_age / room_age)
      const newSnapshots = (oldBooking.component_snapshots || []).map(c => {
        const t = computeComponentTotals(c, newRegistrants, npBilled, npTotal)
        return { ...c, cost_total: t.cost_total, sale_total: t.sale_total }
      })
      let total_cost = +newSnapshots.reduce((s, c) => s + (c.cost_total || 0), 0).toFixed(2)
      let total_sale = +newSnapshots.reduce((s, c) => s + (c.sale_total || 0), 0).toFixed(2)
      // v3.17b/v3.20 — Direct room+age sale on full recalc (mirrors POST logic)
      const effModeP = pkgDoc.pricing_mode || ((Array.isArray(pkgDoc.room_pricing) && pkgDoc.room_pricing.length > 0) ? 'direct' : 'components')
      if (effModeP === 'direct' && newRegistrants.length > 0 && Array.isArray(pkgDoc.room_pricing) && pkgDoc.room_pricing.length > 0) {
        const roomSale = computeDirectRoomSale(pkgDoc.room_pricing, newRegistrants)
        if (roomSale > 0) total_sale = roomSale
      }
      // v3.17 — Manual discount on edit: explicit total_sale override wins; otherwise apply discount on computed sale
      const newDiscount = body.discount !== undefined ? Math.max(0, Number(body.discount) || 0) : (Number(oldBooking.discount) || 0)
      const newDiscountReason = body.discount_reason !== undefined ? String(body.discount_reason || '').trim().slice(0, 120) : (oldBooking.discount_reason || '')
      // v3.19 — Smart discount: flag to also reduce COST (mirrors POST logic)
      const newDiscountApplyCost = body.discount_apply_cost !== undefined ? !!body.discount_apply_cost : !!oldBooking.discount_apply_cost
      if (body.total_cost !== undefined && Number(body.total_cost) >= 0) total_cost = +Number(body.total_cost).toFixed(2)
      const baseCostBeforeDiscount = total_cost
      if (body.total_sale !== undefined && Number(body.total_sale) >= 0) total_sale = +Number(body.total_sale).toFixed(2)
      else if (newDiscount > 0) total_sale = +Math.max(0, total_sale - newDiscount).toFixed(2)
      if (newDiscount > 0 && newDiscountApplyCost) total_cost = +Math.max(0, total_cost - newDiscount).toFixed(2)
      // Distribute any cost-discount proportionally over supplier snapshots (keeps supplier balances + JE consistent)
      const costFactor = baseCostBeforeDiscount > 0 ? total_cost / baseCostBeforeDiscount : 1
      if (costFactor !== 1) {
        for (const c of newSnapshots) c.cost_total = +((c.cost_total || 0) * costFactor).toFixed(2)
      }
      const commission = +(total_sale - total_cost).toFixed(2)
      // v3.19 — Partner-commission share on edit: use new values if provided, otherwise keep old ones
      const pcType = body.commission_partner_type !== undefined ? (body.commission_partner_type || null) : (oldBooking.commission_partner_type || null)
      const pcId = body.commission_partner_id !== undefined ? (body.commission_partner_id || null) : (oldBooking.commission_partner_id || null)
      const pcName = body.commission_partner_name !== undefined ? String(body.commission_partner_name || '').trim().slice(0, 80) : (oldBooking.commission_partner_name || '')
      const pcMode = body.commission_share_mode !== undefined ? (body.commission_share_mode === 'percent' ? 'percent' : 'amount') : (oldBooking.commission_share_mode || 'amount')
      const pcValue = body.commission_share_value !== undefined ? Math.max(0, Number(body.commission_share_value) || 0) : (Number(oldBooking.commission_share_value) || 0)
      let newPartnerShare = 0
      if (pcId && pcValue > 0 && commission > 0) {
        newPartnerShare = pcMode === 'percent' ? +(commission * (pcValue / 100)).toFixed(2) : +pcValue.toFixed(2)
        newPartnerShare = Math.min(newPartnerShare, commission)
      }
      if (newPay === 'cash') {
        await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, cur, total_sale)
      } else {
        await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, cur, total_sale)
      }
      for (const c of newSnapshots) {
        if (c.supplier_id && c.cost_total) {
          await updateBalance(db, 'suppliers', { id: c.supplier_id, tenant_id: T }, cur, c.cost_total)
        }
      }
      // v3.19 — Apply new partner-commission share balance (negative = we owe the partner)
      if (newPartnerShare > 0 && pcId) {
        const pcCol = pcType === 'supplier' ? 'suppliers' : 'clients'
        await updateBalance(db, pcCol, { id: pcId, tenant_id: T }, cur, -newPartnerShare)
      }
      const updatedBooking = {
        ...oldBooking,
        client_id: cli?.id || null,
        client_name: cli?.name || (newPay === 'cash' ? (oldBooking.client_name || 'عميل نقدي') : ''),
        pilgrim_name: (body.pilgrim_name !== undefined ? String(body.pilgrim_name || '').trim() : oldBooking.pilgrim_name) || cli?.name || oldBooking.pilgrim_name || 'مسافر نقدي',
        passport_no: body.passport_no !== undefined ? String(body.passport_no || '').trim() : (oldBooking.passport_no || ''),
        registrants: newRegistrants,
        rooms_summary: newRoomsSummary,
        pax_count: newPax, currency: cur,
        // v3.20 — keep age-category breakdown in sync on edit
        pax_adults: npAdults, pax_children: npChildren, pax_infants: npInfants,
        pax_billed: npBilled, pax_seats: npBilled,
        total_cost, total_sale, commission,
        discount: newDiscount, discount_reason: newDiscountReason, discount_apply_cost: newDiscountApplyCost,
        commission_partner_type: pcType,
        commission_partner_id: pcId,
        commission_partner_name: pcName,
        commission_share_mode: pcMode,
        commission_share_value: pcValue,
        commission_share_amount: newPartnerShare,
        payment_method: newPay,
        box_id: box?.id || null, box_name: box?.name_ar || null,
        transport_id: newTransport?.id || null,
        transport_name: newTransport?.name || null,
        transport_type: newTransport?.type || null,
        component_snapshots: newSnapshots,
        notes: body.notes !== undefined ? String(body.notes || '').trim() : (oldBooking.notes || ''),
        updated_at: new Date(), updated_by: sess.user.email,
      }
      delete updatedBooking._id
      await db.collection('package_bookings').replaceOne({ id: bookingId2, tenant_id: T }, updatedBooking)
      // v3.9.26 — Adjust transport seat counts
      if (oldTransport && (!newTransport || oldTransport.id !== newTransport.id)) {
        // Old transport loses old pax
        const oldNewBooked = Math.max(0, oldTransport.seats_booked - oldBooking.pax_count)
        const oldNewStatus = oldTransport.status === 'full' && oldNewBooked < oldTransport.capacity ? 'open' : oldTransport.status
        await db.collection('package_transports').updateOne({ id: oldTransport.id, tenant_id: T }, { $set: { seats_booked: oldNewBooked, status: oldNewStatus } })
      }
      if (newTransport) {
        const delta = newTransport.id === oldBooking.transport_id ? (newPax - oldBooking.pax_count) : newPax
        const target = await db.collection('package_transports').findOne({ id: newTransport.id, tenant_id: T })
        const newBooked = Math.max(0, (target.seats_booked || 0) + delta)
        const newStatus = newBooked >= target.capacity ? 'full' : (target.status === 'full' && newBooked < target.capacity ? 'open' : target.status)
        await db.collection('package_transports').updateOne({ id: newTransport.id, tenant_id: T }, { $set: { seats_booked: newBooked, status: newStatus } })
      }
      const lines = []
      if (newPay === 'cash') lines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: total_sale, credit: 0 })
      else lines.push({ account_code: '1301', account_name: 'حساب القبض', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: total_sale, credit: 0 })
      const supGrouped = {}
      for (const c of newSnapshots) {
        if (!c.supplier_id || !c.cost_total) continue
        supGrouped[c.supplier_id] = supGrouped[c.supplier_id] || { name: c.supplier_name, amount: 0 }
        supGrouped[c.supplier_id].amount += c.cost_total
      }
      for (const [sid, x] of Object.entries(supGrouped)) lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sid, party_name: x.name, debit: 0, credit: +x.amount.toFixed(2) })
      // v3.19 — Balanced JE: revenue = sale - Σ(supplier credits) - partnerShare (mirrors POST logic)
      const supSumJE = +Object.values(supGrouped).reduce((s, x) => s + +x.amount.toFixed(2), 0).toFixed(2)
      const commissionJE = +(total_sale - supSumJE).toFixed(2)
      const revenueNet = +(commissionJE - newPartnerShare).toFixed(2)
      if (revenueNet !== 0) lines.push({ account_code: '4103', account_name: 'إيرادات خدمات إضافية', party_type: 'revenue', party_id: null, party_name: `إيراد باكج ${pkgDoc.name}`, debit: 0, credit: revenueNet })
      if (newPartnerShare > 0) lines.push({ account_code: pcType === 'supplier' ? '2101' : '1301', account_name: pcType === 'supplier' ? 'الموردون' : 'العملاء', party_type: pcType, party_id: pcId, party_name: pcName || 'شريك عمولة', debit: 0, credit: newPartnerShare })
      await createJournalEntry(db, T, {
        date: oldJe?.date || updatedBooking.created_at || new Date(),
        description: `تسجيل ${updatedBooking.pilgrim_name} في ${pkgDoc.name} — ${newPax} فرد (تعديل)${newPartnerShare > 0 ? ` — عمولة مشتركة ${newPartnerShare} مع ${pcName || 'شريك'}` : ''}`,
        ref_type: 'package_booking', ref_id: bookingId2, currency: cur, lines,
      }, { skipQuota: true, existingJeId, createdAt: oldJe?.created_at || new Date() })
      await maybeEmitMeraajInventory(db, T, pkgId2)
      return ok({ ...updatedBooking, _id: undefined, _full_recalc: true })
    }


    // v3.9.20 — Data Backup: Export full tenant snapshot as JSON (Owner only)
    if (route === '/backup/export' && method === 'GET') {
      if (sess.user.role !== 'owner' && sess.user.role !== 'super_admin') return bad('غير مصرح — نسخ احتياطي متاح للمالك فقط', 403)
      const collections = ['tickets', 'visas', 'services', 'clients', 'suppliers', 'boxes', 'journal_entries', 'packages', 'package_bookings', 'currency_exchanges', 'vouchers', 'accounts', 'service_types']
      const backup = { tenant_id: T, tenant_name: sess.tenant?.name, exported_at: new Date().toISOString(), exported_by: sess.user.email, version: '3.9.20', data: {} }
      for (const coll of collections) {
        try {
          const docs = await db.collection(coll).find({ tenant_id: T }).toArray()
          backup.data[coll] = docs.map(d => { const { _id, ...rest } = d; return rest })
        } catch (e) { backup.data[coll] = { error: e.message } }
      }
      // Return as JSON download
      const filename = `rahaal-backup-${sess.tenant?.slug || T}-${new Date().toISOString().slice(0,10)}.json`
      return new NextResponse(JSON.stringify(backup, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }
    if (pkgBookMatch && method === 'POST') {
      const b = await request.json()
      const pkgId = pkgBookMatch[1]
      const pkg = await db.collection('packages').findOne({ id: pkgId, tenant_id: T })
      if (!pkg) return bad('الباكج غير موجود', 404)
      if (pkg.status === 'closed') return bad('الباكج مغلق — لا يمكن إضافة تسجيلات جديدة')
      const payMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
      // v3.9.22 — Unified payment: credit needs client_id, cash needs box_id
      if (payMethod === 'credit' && !b.client_id) return bad('اختر حساب القبض / العميل (للحجز الآجل)')
      if (payMethod === 'cash' && !b.box_id) return bad('اختر الصندوق / البنك (للنقد)')
      // v3.15 — Registrants dynamic list: [{name, passport_no, age, visa_no, room_type}]
      const registrants = (Array.isArray(b.registrants) ? b.registrants : [])
        .filter(r => r && String(r.name || '').trim())
        .slice(0, 200)
        .map(r => ({
          name: String(r.name).trim().slice(0, 80),
          passport_no: String(r.passport_no || '').trim().toUpperCase().slice(0, 30),
          age: r.age === '' || r.age === null || r.age === undefined ? null : Math.max(0, Math.min(120, Number(r.age) || 0)),
          visa_no: String(r.visa_no || '').trim().slice(0, 40),
          room_type: String(r.room_type || '').trim().slice(0, 40),
        }))
      // v3.9.26 — Transport capacity check (uses pax_seats: adults + children, excludes infants)
      // v3.9.28 — Age category breakdown (adults, children, infants)
      let paxAdults = Math.max(0, Number(b.pax_adults) || 0)
      let paxChildren = Math.max(0, Number(b.pax_children) || 0)
      let paxInfants = Math.max(0, Number(b.pax_infants) || 0)
      // v3.15 — When a registrants list is provided, derive categories from ages automatically
      if (registrants.length > 0) {
        paxAdults = registrants.filter(r => r.age === null || r.age >= 12).length
        paxChildren = registrants.filter(r => r.age !== null && r.age >= 2 && r.age < 12).length
        paxInfants = registrants.filter(r => r.age !== null && r.age < 2).length
      }
      // Backward compat: if none provided, treat pax_count as all adults
      const legacyPax = Math.max(1, Number(b.pax_count) || 1)
      const totalPax = paxAdults + paxChildren + paxInfants > 0 ? (paxAdults + paxChildren + paxInfants) : legacyPax
      const paxBilled = paxAdults + paxChildren + paxInfants > 0 ? (paxAdults + paxChildren) : legacyPax
      const paxSeats = paxAdults + paxChildren + paxInfants > 0 ? (paxAdults + paxChildren) : legacyPax
      let transport = null
      if (b.transport_id) {
        transport = await db.collection('package_transports').findOne({ id: b.transport_id, tenant_id: T, package_id: pkgId })
        if (!transport) return bad('وسيلة النقل غير موجودة')
        if (transport.status === 'closed') return bad(`وسيلة النقل "${transport.name}" مغلقة — اختر وسيلة أخرى`)
        if ((transport.seats_booked + paxSeats) > transport.capacity) {
          return bad(`السعة مكتملة على "${transport.name}" (${transport.seats_booked}/${transport.capacity}). أضف وسيلة نقل جديدة أو اختر أخرى تحتوي على مقاعد متاحة.`)
        }
      }
      const cli = b.client_id ? await db.collection('clients').findOne({ id: b.client_id, tenant_id: T }) : null
      if (payMethod === 'credit' && !cli) return bad('العميل غير موجود')
      const comps = await db.collection('package_components').find({ tenant_id: T, package_id: pkgId }).toArray()
      // v3.39 — UNIFIED PRICING: in direct mode with a room price table, components are optional details
      // (sale comes from room_pricing; component costs are optional supplier accounting)
      const hasDirectRooms = (pkg.pricing_mode || ((pkg.room_pricing || []).length > 0 ? 'direct' : 'components')) === 'direct' && (pkg.room_pricing || []).length > 0
      if (comps.length === 0 && !hasDirectRooms) return bad('لا توجد مكونات في الباكج — أضف المكونات قبل التسجيل')
      const pax = totalPax
      const cur = pkg.currency
      // v3.20 — DUAL PRICING: per-component totals honoring pricing_type (flat / per_age / room_age)
      const compTotals = comps.map(c => computeComponentTotals(c, registrants, paxBilled, totalPax))
      let total_cost = +compTotals.reduce((s, t) => s + t.cost_total, 0).toFixed(2)
      let total_sale = +compTotals.reduce((s, t) => s + t.sale_total, 0).toFixed(2)
      // Rooms breakdown summary (always derived from registrants)
      let rooms_summary = null
      if (registrants.length > 0) {
        rooms_summary = {}
        for (const r of registrants) if (r.room_type) rooms_summary[r.room_type] = (rooms_summary[r.room_type] || 0) + 1
        if (Object.keys(rooms_summary).length === 0) rooms_summary = null
      }
      // v3.20 — Effective pricing mode: explicit pkg.pricing_mode wins; legacy fallback = 'direct' when room prices exist
      const effMode = pkg.pricing_mode || ((Array.isArray(pkg.room_pricing) && pkg.room_pricing.length > 0) ? 'direct' : 'components')
      if (effMode === 'direct' && registrants.length > 0 && Array.isArray(pkg.room_pricing) && pkg.room_pricing.length > 0) {
        // Direct B2B pricing: sale from room+age matrix (adult=sale_per_pax, child falls back to adult, infant defaults 0)
        const roomSale = computeDirectRoomSale(pkg.room_pricing, registrants)
        if (roomSale > 0) total_sale = roomSale
      }
      // v3.17 — Manual booking discount (B2B flexibility: child no-bed, infant, partner-office courtesy...)
      // v3.19 — Smart discount: optional checkbox also reduces COST (keeps margin when a service like a bed is excluded)
      const discount = Math.max(0, Number(b.discount) || 0)
      const discountReason = String(b.discount_reason || '').trim().slice(0, 120)
      const discountApplyCost = !!b.discount_apply_cost
      const baseCostBeforeDiscount = total_cost
      if (discount > 0) {
        total_sale = +Math.max(0, total_sale - discount).toFixed(2)
        if (discountApplyCost) total_cost = +Math.max(0, total_cost - discount).toFixed(2)
      }
      const costFactor = baseCostBeforeDiscount > 0 ? total_cost / baseCostBeforeDiscount : 1
      const commission = +(total_sale - total_cost).toFixed(2)
      let box = null
      if (payMethod === 'cash') {
        box = await db.collection('boxes').findOne({ id: b.box_id, tenant_id: T })
        if (!box) return bad('الصندوق غير موجود')
      }
      const bookingDoc = {
        id: uuidv4(), tenant_id: T, package_id: pkgId,
        client_id: cli?.id || null,
        client_name: cli?.name || (payMethod === 'cash' ? (b.client_name || 'عميل نقدي') : ''),
        pilgrim_name: b.pilgrim_name || registrants[0]?.name || cli?.name || 'مسافر نقدي',
        passport_no: b.passport_no || registrants[0]?.passport_no || '',
        // v3.15 — Registrants list + rooms breakdown
        registrants,
        rooms_summary,
        pax_count: pax, currency: cur,
        // v3.9.28 — Age category breakdown
        pax_adults: paxAdults || (paxAdults + paxChildren + paxInfants === 0 ? legacyPax : 0),
        pax_children: paxChildren,
        pax_infants: paxInfants,
        pax_billed: paxBilled,
        pax_seats: paxSeats,
        birth_date: b.birth_date || null,
        age_category: b.age_category || null,
        total_cost, total_sale, commission,
        discount, discount_reason: discountReason, discount_apply_cost: discountApplyCost,
        payment_method: payMethod, box_id: box?.id || null, box_name: box?.name_ar || null,
        transport_id: transport?.id || null,
        transport_name: transport?.name || null,
        transport_type: transport?.type || null,
        component_snapshots: comps.map((c, i) => ({
          id: c.id, name: c.name, supplier_id: c.supplier_id, supplier_name: c.supplier_name,
          cost_per_pax: c.cost_per_pax, sale_per_pax: c.sale_per_pax,
          // v3.20 — freeze dual-pricing details so edits recompute correctly
          pricing_type: c.pricing_type || 'flat', include_infants: !!c.include_infants,
          ...(c.pricing_type === 'per_age' ? { cost_adult: c.cost_adult, cost_child: c.cost_child, cost_infant: c.cost_infant, sale_adult: c.sale_adult, sale_child: c.sale_child, sale_infant: c.sale_infant } : {}),
          ...(c.pricing_type === 'room_age' ? { room_rates: c.room_rates || [] } : {}),
          cost_total: +(compTotals[i].cost_total * costFactor).toFixed(2),
          sale_total: compTotals[i].sale_total,
        })),
        notes: b.notes || '', created_at: new Date(), created_by: sess.user.email,
      }
      await db.collection('package_bookings').insertOne(bookingDoc)
      // v3.9.26 — Increment transport seats_booked and auto-close on full
      // v3.9.28 — Only adults + children take seats (infants free)
      if (transport) {
        const newBooked = transport.seats_booked + paxSeats
        const newStatus = newBooked >= transport.capacity ? 'full' : transport.status
        await db.collection('package_transports').updateOne({ id: transport.id, tenant_id: T }, { $set: { seats_booked: newBooked, status: newStatus } })
      }
      // v3.19 — Partner commission share (generalized from tickets)
      bookingDoc.commission_partner_type = b.commission_partner_type || null
      bookingDoc.commission_partner_id = b.commission_partner_id || null
      bookingDoc.commission_partner_name = b.commission_partner_name || ''
      bookingDoc.commission_share_mode = b.commission_share_mode === 'percent' ? 'percent' : 'amount'
      bookingDoc.commission_share_value = Number(b.commission_share_value) || 0
      let partnerShare = 0
      if (bookingDoc.commission_partner_id && bookingDoc.commission_share_value > 0 && commission > 0) {
        if (bookingDoc.commission_share_mode === 'percent') partnerShare = +(commission * (bookingDoc.commission_share_value / 100)).toFixed(2)
        else partnerShare = +Number(bookingDoc.commission_share_value).toFixed(2)
        partnerShare = Math.min(partnerShare, commission)
      }
      bookingDoc.commission_share_amount = partnerShare
      const officeNetCommission = +(commission - partnerShare).toFixed(2)
      // Persist partner-share fields (booking was already inserted above)
      if (bookingDoc.commission_partner_id || partnerShare > 0) {
        await db.collection('package_bookings').updateOne({ id: bookingDoc.id, tenant_id: T }, {
          $set: {
            commission_partner_type: bookingDoc.commission_partner_type,
            commission_partner_id: bookingDoc.commission_partner_id,
            commission_partner_name: bookingDoc.commission_partner_name,
            commission_share_mode: bookingDoc.commission_share_mode,
            commission_share_value: bookingDoc.commission_share_value,
            commission_share_amount: partnerShare,
          }
        })
      }
      // Balances (v3.19: costFactor distributes any cost-discount proportionally over suppliers)
      if (payMethod === 'cash') await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, cur, total_sale)
      else await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, cur, total_sale)
      for (let i = 0; i < comps.length; i++) await updateBalance(db, 'suppliers', { id: comps[i].supplier_id, tenant_id: T }, cur, +(compTotals[i].cost_total * costFactor).toFixed(2))
      if (partnerShare > 0 && bookingDoc.commission_partner_id) {
        const col = bookingDoc.commission_partner_type === 'supplier' ? 'suppliers' : 'clients'
        await updateBalance(db, col, { id: bookingDoc.commission_partner_id, tenant_id: T }, cur, -partnerShare)
      }
      // Single combined JE — mathematically balanced: revenue = sale - Σ(supplier credits) - partnerShare
      const lines = []
      if (payMethod === 'cash') lines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: total_sale, credit: 0 })
      else lines.push({ account_code: '1301', account_name: 'حساب القبض', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: total_sale, credit: 0 })
      const supGrouped = {}
      for (let i = 0; i < comps.length; i++) { const c = comps[i]; supGrouped[c.supplier_id] = (supGrouped[c.supplier_id] || { name: c.supplier_name, amount: 0 }); supGrouped[c.supplier_id].amount += compTotals[i].cost_total * costFactor }
      let supSum = 0
      for (const [sid, x] of Object.entries(supGrouped)) { const amt = +x.amount.toFixed(2); supSum += amt; lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sid, party_name: x.name, debit: 0, credit: amt }) }
      const commissionJE = +(total_sale - supSum).toFixed(2)
      const revenueNet = +(commissionJE - partnerShare).toFixed(2)
      if (revenueNet !== 0) lines.push({ account_code: '4103', account_name: 'إيرادات خدمات إضافية', party_type: 'revenue', party_id: null, party_name: `إيراد باكج ${pkg.name}`, debit: 0, credit: revenueNet })
      if (partnerShare > 0) lines.push({ account_code: bookingDoc.commission_partner_type === 'supplier' ? '2101' : '1301', account_name: bookingDoc.commission_partner_type === 'supplier' ? 'الموردون' : 'العملاء', party_type: bookingDoc.commission_partner_type, party_id: bookingDoc.commission_partner_id, party_name: bookingDoc.commission_partner_name || 'شريك عمولة', debit: 0, credit: partnerShare })
      await createJournalEntry(db, T, {
        date: new Date(), description: `تسجيل ${bookingDoc.pilgrim_name} في ${pkg.name} — ${pax} فرد${partnerShare > 0 ? ` — عمولة مشتركة ${partnerShare} مع ${bookingDoc.commission_partner_name}` : ''}`,
        ref_type: 'package_booking', ref_id: bookingDoc.id, currency: cur, lines,
      })
      const { _id, ...rest } = bookingDoc
      await maybeEmitMeraajInventory(db, T, pkgBookMatch[1])
      return ok(rest)
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
      let accountInfo = {}
      try { accountInfo = await generateSubAccountCode(db, T, parent_code) } catch (e) { return bad(e.message) }
      const doc = {
        id: uuidv4(), tenant_id: T, name: b.name, phone: b.phone || '', whatsapp: b.whatsapp || b.phone || '',
        address: b.address || '', email: b.email || '', notes: b.notes || '', parent_code, ...accountInfo,
        credit_limit: Number(b.credit_limit) || 0,  // v3.10.6 — 0 = no limit
        credit_currency: b.credit_currency || 'USD',
        is_frozen: !!b.is_frozen,
        balances: emptyBalances(), created_at: new Date()
      }
      await db.collection('clients').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }
    // v3.2 — Update client contact info
    const clientIdMatch = route.match(/^\/clients\/([^/]+)$/)
    if (clientIdMatch && method === 'PUT') {
      const b = await request.json()
      const upd = {}
      for (const k of ['name', 'phone', 'whatsapp', 'address', 'email', 'notes', 'parent_code', 'credit_limit', 'credit_currency', 'is_frozen']) if (b[k] !== undefined) upd[k] = k === 'credit_limit' ? (Number(b[k]) || 0) : k === 'is_frozen' ? !!b[k] : b[k]
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
      let accountInfo = {}
      try { accountInfo = await generateSubAccountCode(db, T, parent_code) } catch (e) { return bad(e.message) }
      const doc = { id: uuidv4(), tenant_id: T, name: b.name, phone: b.phone || '', whatsapp: b.whatsapp || b.phone || '', address: b.address || '', email: b.email || '', notes: b.notes || '', parent_code, ...accountInfo, balances: emptyBalances(), created_at: new Date() }
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
      let accountInfo = {}
      try { accountInfo = await generateSubAccountCode(db, T, parent_code) } catch (e) { return bad(e.message) }
      const doc = { id: uuidv4(), tenant_id: T, name_ar: b.name_ar, type, parent_code, ...accountInfo, balances: emptyBalances(), created_at: new Date() }
      await db.collection('boxes').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }

    // Accounts (Chart of Accounts)
    if (route === '/accounts' && method === 'GET') return ok(clean(await db.collection('accounts').find(tf).sort({ code: 1 }).toArray()))

    // ================================================================
    // v3.10.5 — VISA MONITORING CENTER — Countries + Rules + Records
    // ================================================================

    // GET /countries — list all countries (seeded on first call)
    if (route === '/countries' && method === 'GET') {
      let list = await db.collection('countries').find({ $or: [{ tenant_id: T }, { tenant_id: null }] }).sort({ code: 1 }).toArray()
      if (list.length === 0) {
        // Seed defaults (global — tenant_id null so all tenants share, but editable overrides go per-tenant)
        const defaults = [
          { code: 'SA', name_ar: 'السعودية', flag: '🇸🇦', fines_config: { 'تأشيرة عمرة': { has_fines: true }, 'تأشيرة حج': { has_fines: true }, 'تأشيرة زيارة': { has_fines: false }, 'فيزا عمل': { has_fines: false } } },
          { code: 'AE', name_ar: 'الإمارات', flag: '🇦🇪', fines_config: { 'default': { has_fines: true } } },
          { code: 'OM', name_ar: 'عمان', flag: '🇴🇲', fines_config: { 'تأشيرة عبور': { has_fines: true }, 'ترانزيت': { has_fines: true }, 'فيزا سياحية': { has_fines: true }, 'default': { has_fines: false } } },
          { code: 'EG', name_ar: 'مصر', flag: '🇪🇬', fines_config: { 'default': { has_fines: false } } },
          { code: 'TR', name_ar: 'تركيا', flag: '🇹🇷', fines_config: { 'default': { has_fines: false } } },
          { code: 'MY', name_ar: 'ماليزيا', flag: '🇲🇾', fines_config: { 'default': { has_fines: false } } },
        ]
        for (const d of defaults) {
          await db.collection('countries').insertOne({ id: uuidv4(), tenant_id: T, ...d, created_at: new Date() })
        }
        list = await db.collection('countries').find({ tenant_id: T }).sort({ code: 1 }).toArray()
      }
      return ok(clean(list))
    }
    // ================================================================
    // v3.10.6 — PERIOD LOCK (Financial Period Closing)
    // ================================================================
    // GET /period-lock — current lock status
    if (route === '/period-lock' && method === 'GET') {
      const s = await db.collection('tenant_settings').findOne({ tenant_id: T }) || {}
      const lock = s.period_lock || { closed_until: null, locked_by: null, locked_at: null, reason: '' }
      return ok(lock)
    }
    // POST /period-lock — set/update lock (owner or can_close_periods)
    if (route === '/period-lock' && method === 'POST') {
      const perms = effectivePermissions(sess.user)
      if (sess.user.role !== 'owner' && !perms.can_close_periods) return bad('لا تملك صلاحية إقفال الفترات', 403)
      const b = await request.json()
      if (!b.closed_until) return bad('التاريخ مطلوب')
      // Validate: closed_until must be past date
      if (new Date(b.closed_until) >= new Date()) return bad('تاريخ الإقفال يجب أن يكون قبل اليوم')
      const lock = {
        closed_until: b.closed_until,
        locked_by: sess.user.id,
        locked_by_email: sess.user.email,
        locked_at: new Date().toISOString(),
        reason: b.reason || ''
      }
      await db.collection('tenant_settings').updateOne({ tenant_id: T }, { $set: { period_lock: lock } }, { upsert: true })
      return ok(lock)
    }
    // DELETE /period-lock — unlock (owner only)
    if (route === '/period-lock' && method === 'DELETE') {
      if (sess.user.role !== 'owner') return bad('فقط المالك يمكنه إلغاء إقفال الفترة', 403)
      await db.collection('tenant_settings').updateOne({ tenant_id: T }, { $unset: { period_lock: '' } })
      return ok({ success: true })
    }


    if (route === '/countries' && method === 'POST') {
      const b = await request.json()
      if (!b.code || !b.name_ar) return bad('كود واسم الدولة مطلوبان')
      const exists = await db.collection('countries').findOne({ tenant_id: T, code: String(b.code).toUpperCase() })
      if (exists) return bad('كود الدولة موجود بالفعل')
      const doc = { id: uuidv4(), tenant_id: T, code: String(b.code).toUpperCase(), name_ar: b.name_ar, flag: b.flag || '🏳️', fines_config: b.fines_config || { default: { has_fines: false } }, created_at: new Date() }
      await db.collection('countries').insertOne(doc); const { _id, ...r } = doc; return ok(r)
    }
    // PATCH /countries/:id
    {
      const m = route.match(/^\/countries\/([^/]+)$/)
      if (m && method === 'PATCH') {
        const b = await request.json()
        const upd = {}
        if (b.name_ar !== undefined) upd.name_ar = b.name_ar
        if (b.flag !== undefined) upd.flag = b.flag
        if (b.fines_config !== undefined) upd.fines_config = b.fines_config
        upd.updated_at = new Date()
        await db.collection('countries').updateOne({ id: m[1], tenant_id: T }, { $set: upd })
        return ok({ success: true })
      }
      if (m && method === 'DELETE') {
        await db.collection('countries').deleteOne({ id: m[1], tenant_id: T })
        return ok({ success: true })
      }
    }

    // Helper: determine has_fines for a country + visa_type combo
    const resolveHasFines = async (countryCode, visaType) => {
      if (!countryCode) return false
      const country = await db.collection('countries').findOne({ tenant_id: T, code: countryCode })
      if (!country) return false
      const cfg = country.fines_config || {}
      if (visaType && cfg[visaType] && cfg[visaType].has_fines !== undefined) return !!cfg[visaType].has_fines
      if (cfg.default && cfg.default.has_fines !== undefined) return !!cfg.default.has_fines
      return false
    }

    // ===== v3.11 — Visa Monitoring Grid (B2B) =====
    // Track-status algorithm: green >30d | yellow ≤30d | red ≤15d | overstay <0d | departed (actual exit)
    const monCompute = (r) => {
      const todayDt = new Date(new Date().toISOString().slice(0, 10))
      const allowed = Number(r.allowed_days || 0) || null
      let expected = r.expected_exit_date || r.max_exit_date || null
      if (!expected && r.entry_date && allowed) {
        const d = new Date(r.entry_date); d.setDate(d.getDate() + allowed)
        expected = d.toISOString().slice(0, 10)
      }
      const departed = !!r.actual_exit_date || r.status === 'exited'
      const remaining = expected ? Math.floor((new Date(expected) - todayDt) / 86400000) : null
      let track = 'green'
      if (departed) track = 'departed'
      else if (remaining === null) track = 'green'
      else if (remaining < 0) track = 'overstay'
      else if (remaining <= 15) track = 'red'
      else if (remaining <= 30) track = 'yellow'
      return { expected_exit_date: expected, remaining_days: remaining, track_status: track }
    }
    const monExpected = (entryDate, allowedDays) => {
      if (!entryDate || !allowedDays) return null
      const d = new Date(entryDate); d.setDate(d.getDate() + Number(allowedDays))
      return d.toISOString().slice(0, 10)
    }

    // GET /visa-monitor — list with filters
    // Query: ?track=all|inside|green|yellow|red|overstay|departed|alerts&agent=text&search=text
    if (route === '/visa-monitor' && method === 'GET') {
      const track = String(q.track || 'inside').toLowerCase()
      const agentText = (q.agent || '').toString().trim().toLowerCase()
      const searchText = (q.search || '').toString().trim().toLowerCase()
      const rows = await db.collection('visa_monitoring').find({ tenant_id: T }).toArray()
      let enriched = rows.map(r => ({ ...r, ...monCompute(r) }))
      // Track filter
      if (track === 'inside') enriched = enriched.filter(x => x.track_status !== 'departed')
      else if (track === 'alerts') enriched = enriched.filter(x => ['yellow', 'red', 'overstay'].includes(x.track_status))
      else if (track !== 'all') enriched = enriched.filter(x => x.track_status === track)
      // Agent filter (free-text contains)
      if (agentText) enriched = enriched.filter(x => String(x.agent_name || '').toLowerCase().includes(agentText))
      // Search by name / passport / visa_no
      if (searchText) enriched = enriched.filter(x =>
        String(x.traveler_name || '').toLowerCase().includes(searchText) ||
        String(x.passport_no || '').toLowerCase().includes(searchText) ||
        String(x.visa_no || '').toLowerCase().includes(searchText)
      )
      // Sort: overstay first (most negative), then ascending remaining; departed last
      enriched.sort((a, b) => {
        const da = a.track_status === 'departed' ? 1 : 0, db2 = b.track_status === 'departed' ? 1 : 0
        if (da !== db2) return da - db2
        const ra = a.remaining_days === null ? 99999 : a.remaining_days
        const rb = b.remaining_days === null ? 99999 : b.remaining_days
        return ra - rb
      })
      return ok(clean(enriched))
    }

    // POST /visa-monitor — add manual record (B2B mandatory fields)
    if (route === '/visa-monitor' && method === 'POST') {
      const b = await request.json()
      if (!b.traveler_name || !String(b.traveler_name).trim()) return bad('اسم المعتمر مطلوب')
      if (!b.passport_no || !String(b.passport_no).trim()) return bad('رقم الجواز مطلوب')
      if (!b.agent_name || !String(b.agent_name).trim()) return bad('اسم الوكيل مطلوب')
      if (!b.agent_phone || !String(b.agent_phone).trim()) return bad('رقم جوال الوكيل (واتساب) مطلوب')
      if (!b.visa_no || !String(b.visa_no).trim()) return bad('رقم التأشيرة مطلوب')
      if (!b.visa_issue_date) return bad('تاريخ إصدار التأشيرة مطلوب')
      if (!b.entry_date) return bad('تاريخ الدخول مطلوب')
      const allowedDays = Number(b.allowed_days) > 0 ? Number(b.allowed_days) : 85
      const doc = {
        id: uuidv4(), tenant_id: T,
        traveler_name: String(b.traveler_name).trim(),
        passport_no: String(b.passport_no).trim().toUpperCase(),
        nationality: b.nationality || '',
        agent_name: String(b.agent_name).trim(),
        agent_phone: String(b.agent_phone).trim(),
        phone: b.phone || '',
        visa_no: String(b.visa_no).trim(),
        visa_issue_date: b.visa_issue_date,
        host_name: b.host_name || '',
        entry_date: b.entry_date,
        entry_port: b.entry_port || '',
        allowed_days: allowedDays,
        expected_exit_date: monExpected(b.entry_date, allowedDays),
        actual_exit_date: b.actual_exit_date || null,
        exit_port: b.exit_port || '',
        destination_country: b.destination_country || 'SA',
        visa_type: b.visa_type || 'تأشيرة عمرة',
        status: b.actual_exit_date ? 'exited' : 'active',
        linked_visa_id: b.linked_visa_id || null,
        source: b.source || 'manual',
        notes: b.notes || '',
        created_at: new Date(), updated_at: new Date()
      }
      await db.collection('visa_monitoring').insertOne(doc)
      const { _id, ...r } = doc; return ok({ ...r, ...monCompute(r) })
    }

    // PATCH /visa-monitor/:id — action buttons (exited / reactivate / update)
    {
      const m = route.match(/^\/visa-monitor\/([^/]+)$/)
      if (m && method === 'PATCH') {
        const b = await request.json()
        const upd = { updated_at: new Date() }
        if (b.action === 'exited') {
          upd.status = 'exited'
          upd.actual_exit_date = b.actual_exit_date || new Date().toISOString().slice(0, 10)
          if (b.exit_port !== undefined) upd.exit_port = b.exit_port
        }
        else if (b.action === 'acknowledge') upd.status = 'acknowledged'
        else if (b.action === 'reactivate') { upd.status = 'active'; upd.actual_exit_date = null }
        else {
          ['traveler_name', 'phone', 'passport_no', 'nationality', 'agent_name', 'agent_phone', 'visa_no', 'visa_issue_date', 'host_name', 'entry_date', 'entry_port', 'allowed_days', 'actual_exit_date', 'exit_port', 'destination_country', 'visa_type', 'max_exit_date', 'notes'].forEach(f => { if (b[f] !== undefined) upd[f] = b[f] })
          if (upd.allowed_days !== undefined) upd.allowed_days = Number(upd.allowed_days) > 0 ? Number(upd.allowed_days) : 85
          // Recompute expected exit if entry/allowed changed
          if (upd.entry_date !== undefined || upd.allowed_days !== undefined) {
            const existing = await db.collection('visa_monitoring').findOne({ id: m[1], tenant_id: T })
            if (existing) {
              const entry = upd.entry_date !== undefined ? upd.entry_date : existing.entry_date
              const allowed = upd.allowed_days !== undefined ? upd.allowed_days : (existing.allowed_days || 85)
              upd.expected_exit_date = monExpected(entry, allowed)
            }
          }
          // Departure logic: setting actual_exit_date marks departed, clearing it reactivates
          if (upd.actual_exit_date !== undefined) upd.status = upd.actual_exit_date ? 'exited' : 'active'
        }
        await db.collection('visa_monitoring').updateOne({ id: m[1], tenant_id: T }, { $set: upd })
        return ok({ success: true })
      }
      if (m && method === 'DELETE') {
        await db.collection('visa_monitoring').deleteOne({ id: m[1], tenant_id: T })
        return ok({ success: true })
      }
    }

    // POST /visa-monitor/import — bulk upsert by passport_no (new B2B columns)
    if (route === '/visa-monitor/import' && method === 'POST') {
      const b = await request.json()
      const rows = Array.isArray(b.rows) ? b.rows : []
      let inserted = 0, updated = 0, skipped = 0
      const skipReasons = []
      for (const r of rows) {
        if (!r.passport_no) { skipped++; skipReasons.push('صف بدون رقم جواز'); continue }
        const passport = String(r.passport_no).trim().toUpperCase()
        const existing = await db.collection('visa_monitoring').findOne({ tenant_id: T, passport_no: passport })
        if (existing) {
          const upd = { updated_at: new Date() }
          ;['traveler_name', 'nationality', 'agent_name', 'agent_phone', 'phone', 'visa_no', 'visa_issue_date', 'host_name', 'entry_date', 'entry_port', 'exit_port', 'notes'].forEach(f => { if (r[f]) upd[f] = r[f] })
          if (Number(r.allowed_days) > 0) upd.allowed_days = Number(r.allowed_days)
          const entry = upd.entry_date || existing.entry_date
          const allowed = upd.allowed_days || existing.allowed_days || 85
          upd.expected_exit_date = monExpected(entry, allowed)
          if (r.actual_exit_date) { upd.actual_exit_date = r.actual_exit_date; upd.status = 'exited' }
          await db.collection('visa_monitoring').updateOne({ id: existing.id }, { $set: upd })
          updated++
        } else {
          // Mandatory for new rows: name, agent, agent_phone, visa_no, issue date, entry date
          const missing = []
          if (!r.traveler_name) missing.push('الاسم')
          if (!r.agent_name) missing.push('الوكيل')
          if (!r.agent_phone) missing.push('جوال الوكيل')
          if (!r.visa_no) missing.push('رقم التأشيرة')
          if (!r.visa_issue_date) missing.push('تاريخ الإصدار')
          if (!r.entry_date) missing.push('تاريخ الدخول')
          if (missing.length) { skipped++; skipReasons.push(`${passport}: ينقصه ${missing.join('، ')}`); continue }
          const allowedDays = Number(r.allowed_days) > 0 ? Number(r.allowed_days) : 85
          await db.collection('visa_monitoring').insertOne({
            id: uuidv4(), tenant_id: T,
            traveler_name: r.traveler_name, passport_no: passport,
            nationality: r.nationality || '',
            agent_name: r.agent_name, agent_phone: r.agent_phone,
            phone: r.phone || '',
            visa_no: r.visa_no, visa_issue_date: r.visa_issue_date,
            host_name: r.host_name || '',
            entry_date: r.entry_date, entry_port: r.entry_port || '',
            allowed_days: allowedDays,
            expected_exit_date: monExpected(r.entry_date, allowedDays),
            actual_exit_date: r.actual_exit_date || null,
            exit_port: r.exit_port || '',
            destination_country: r.destination_country || 'SA',
            visa_type: r.visa_type || 'تأشيرة عمرة',
            status: r.actual_exit_date ? 'exited' : 'active',
            source: 'excel_import', notes: r.notes || '',
            created_at: new Date(), updated_at: new Date()
          })
          inserted++
        }
      }
      return ok({ inserted, updated, skipped, skip_reasons: skipReasons.slice(0, 20), total: rows.length })
    }

    // GET /visa-monitor/stats — counters per track status
    if (route === '/visa-monitor/stats' && method === 'GET') {
      const rows = await db.collection('visa_monitoring').find({ tenant_id: T }).toArray()
      const counts = { green: 0, yellow: 0, red: 0, overstay: 0, departed: 0, total: rows.length }
      for (const r of rows) {
        const { track_status } = monCompute(r)
        counts[track_status] = (counts[track_status] || 0) + 1
      }
      return ok({ ...counts, inside: counts.green + counts.yellow + counts.red + counts.overstay, alerts: counts.yellow + counts.red + counts.overstay })
    }

    // GET /visa-monitor/alerts — dashboard widget (yellow + red + overstay only)
    if (route === '/visa-monitor/alerts' && method === 'GET') {
      const rows = await db.collection('visa_monitoring').find({ tenant_id: T }).toArray()
      const alerts = rows.map(r => ({ ...r, ...monCompute(r) }))
        .filter(x => ['yellow', 'red', 'overstay'].includes(x.track_status))
        .sort((a, b) => (a.remaining_days ?? 99999) - (b.remaining_days ?? 99999))
      const counts = { yellow: 0, red: 0, overstay: 0 }
      alerts.forEach(a => { counts[a.track_status]++ })
      return ok({ counts, rows: clean(alerts.slice(0, 25)), total: alerts.length })
    }


    // v3.10.0 — GET /accounts/search — smart autocomplete across sub-accounts + parent accounts
    // Query: ?q=<text>&type=client|supplier|box|account|all&limit=20&include_inactive=0
    if (route === '/accounts/search' && method === 'GET') {
      const qText = String(q.q || '').trim().toLowerCase()
      const wantType = String(q.type || 'all').toLowerCase()
      const includeInactive = String(q.include_inactive || '0') === '1'
      const lim = Math.min(Number(q.limit) || 30, 100)
      const filterInactive = includeInactive ? {} : { $or: [{ inactive: { $exists: false } }, { inactive: { $ne: true } }] }
      const baseQ = { tenant_id: T, ...filterInactive }
      const results = []
      const wantAll = wantType === 'all'
      if (wantAll || wantType === 'client') {
        const rows = await db.collection('clients').find(baseQ).toArray()
        rows.forEach(r => {
          const label = (r.name || '').toLowerCase()
          const code = (r.account_code || '').toLowerCase()
          if (!qText || label.includes(qText) || code.includes(qText)) {
            results.push({ id: r.id, name: r.name, type: 'client', account_code: r.account_code, parent_code: r.account_parent_code || r.parent_code, balances: r.balances || {}, phone: r.phone || '' })
          }
        })
      }
      if (wantAll || wantType === 'supplier') {
        const rows = await db.collection('suppliers').find(baseQ).toArray()
        rows.forEach(r => {
          const label = (r.name || '').toLowerCase()
          const code = (r.account_code || '').toLowerCase()
          if (!qText || label.includes(qText) || code.includes(qText)) {
            results.push({ id: r.id, name: r.name, type: 'supplier', account_code: r.account_code, parent_code: r.account_parent_code || r.parent_code, balances: r.balances || {}, phone: r.phone || '' })
          }
        })
      }
      if (wantAll || wantType === 'box') {
        const rows = await db.collection('boxes').find(baseQ).toArray()
        rows.forEach(r => {
          const label = (r.name_ar || '').toLowerCase()
          const code = (r.account_code || '').toLowerCase()
          if (!qText || label.includes(qText) || code.includes(qText)) {
            results.push({ id: r.id, name: r.name_ar, type: 'box', box_type: r.type, account_code: r.account_code, parent_code: r.account_parent_code || r.parent_code, balances: r.balances || {} })
          }
        })
      }
      // v3.10.0 — include parent/chart accounts (revenue/expense/generic) when type='account' or 'all'
      if (wantAll || wantType === 'account') {
        const accs = await db.collection('accounts').find({ tenant_id: T }).toArray()
        accs.forEach(a => {
          // Skip group-parents already served via sub-entities (client/supplier/box parents)
          if (['1101', '1201', '1301', '2101'].includes(a.code)) return
          const label = (a.name_ar || '').toLowerCase()
          const code = (a.code || '').toLowerCase()
          if (!qText || label.includes(qText) || code.includes(qText)) {
            results.push({ id: a.id, name: a.name_ar, type: 'account', account_code: a.code, parent_code: a.parent || null, acct_type: a.type, is_group: !!a.is_group })
          }
        })
      }
      // Sort: by account_code ascending (natural tree order)
      results.sort((a, b) => (a.account_code || '').localeCompare(b.account_code || ''))
      return ok(results.slice(0, lim))
    }

    // v3.10.0 — GET /accounts/tree — hierarchical accounts + sub-accounts for tree view
    if (route === '/accounts/tree' && method === 'GET') {
      const includeInactive = String(q.include_inactive || '0') === '1'
      const filterInactive = includeInactive ? {} : { $or: [{ inactive: { $exists: false } }, { inactive: { $ne: true } }] }
      const [accs, clients, suppliers, boxes] = await Promise.all([
        db.collection('accounts').find({ tenant_id: T }).sort({ code: 1 }).toArray(),
        db.collection('clients').find({ tenant_id: T, ...filterInactive }).toArray(),
        db.collection('suppliers').find({ tenant_id: T, ...filterInactive }).toArray(),
        db.collection('boxes').find({ tenant_id: T, ...filterInactive }).toArray(),
      ])
      // Build accounts tree by parent
      const byCode = new Map()
      accs.forEach(a => byCode.set(a.code, {
        id: a.id, code: a.code, name: a.name_ar, type: a.type, parent: a.parent,
        is_group: !!a.is_group, is_parent: !!a.is_parent, next_child_seq: a.next_child_seq || 0,
        children: [], sub_entities: [],
      }))
      const roots = []
      accs.forEach(a => {
        const node = byCode.get(a.code)
        if (a.parent && byCode.has(a.parent)) byCode.get(a.parent).children.push(node)
        else roots.push(node)
      })
      // Attach sub-entities under their parent codes
      const attach = (entity, type) => {
        const pcode = entity.account_parent_code || entity.parent_code
        if (pcode && byCode.has(pcode)) {
          byCode.get(pcode).sub_entities.push({
            id: entity.id,
            code: entity.account_code || pcode,
            name: entity.name || entity.name_ar,
            type,
            box_type: entity.type,
            balances: entity.balances || {},
            inactive: !!entity.inactive,
          })
        }
      }
      clients.forEach(c => attach(c, 'client'))
      suppliers.forEach(s => attach(s, 'supplier'))
      boxes.forEach(b => attach(b, 'box'))
      // Sort sub-entities by code
      byCode.forEach(n => n.sub_entities.sort((a, b) => (a.code || '').localeCompare(b.code || '')))
      return ok(roots)
    }

    if (route === '/accounts' && method === 'POST') {
      const b = await request.json()
      if (!b.code || !b.name_ar || !b.type) return bad('الرمز والاسم والنوع مطلوبة')
      const code = String(b.code)
      // v3.10.2 — check uniqueness across accounts + clients + suppliers + boxes account_codes
      const [existsAcc, existsClient, existsSupp, existsBox] = await Promise.all([
        db.collection('accounts').findOne({ tenant_id: T, code }),
        db.collection('clients').findOne({ tenant_id: T, account_code: code }),
        db.collection('suppliers').findOne({ tenant_id: T, account_code: code }),
        db.collection('boxes').findOne({ tenant_id: T, account_code: code }),
      ])
      if (existsAcc) return bad(`رمز الحساب "${code}" مستخدم بالفعل في دليل الحسابات`)
      if (existsClient) return bad(`رمز الحساب "${code}" مستخدم لعميل بالفعل`)
      if (existsSupp) return bad(`رمز الحساب "${code}" مستخدم لمورد بالفعل`)
      if (existsBox) return bad(`رمز الحساب "${code}" مستخدم لصندوق/بنك بالفعل`)
      if (b.parent) {
        const p = await db.collection('accounts').findOne({ tenant_id: T, code: String(b.parent) })
        if (!p) return bad('الحساب الأب غير موجود')
      }
      const doc = {
        id: uuidv4(), tenant_id: T, code, name_ar: String(b.name_ar),
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
    // v3.21 — Installment alert for the logged-in tenant (proactive cash-flow reminder)
    if (route === '/my/installment-alert' && method === 'GET') {
      const t = await db.collection('tenants').findOne({ id: T })
      if (!t || t.billing_mode !== 'installments') return ok({ alert: null })
      const list = Array.isArray(t.installments) ? t.installments : []
      const next = list.find(i => !i.paid) || null
      if (!next || !next.due_date) return ok({ alert: null })
      const today = new Date(new Date().toISOString().slice(0, 10))
      const due = new Date(String(next.due_date).slice(0, 10))
      const daysLeft = Math.round((due - today) / 86400000)
      // Alert window: overdue OR due within 10 days
      if (daysLeft > 10) return ok({ alert: null })
      return ok({
        alert: {
          no: next.no, amount: next.amount, due_date: next.due_date,
          days_left: daysLeft, overdue: daysLeft < 0,
          paid_count: list.filter(i => i.paid).length, total_count: list.length,
        },
      })
    }

    // v3.21 — Partner Commission Statement (كشف حساب الشريك B2B)
    // Aggregates commission_share_amount across tickets, visas, services and package bookings
    if (route === '/partners/commissions' && method === 'GET') {
      const url = new URL(request.url)
      const partnerId = url.searchParams.get('partner_id')
      if (!partnerId) return bad('partner_id مطلوب')
      const result = await computePartnerStatement(db, T, partnerId, url.searchParams.get('from'), url.searchParams.get('to'))
      return ok(result)
    }

    // v3.22 — Statement Archive (Audit Trail): save an immutable snapshot recomputed server-side
    if (route === '/partners/statements' && method === 'POST') {
      const b = await request.json()
      if (!b.partner_id || !['client', 'supplier'].includes(b.partner_type)) return bad('بيانات الشريك مطلوبة')
      const pcol = b.partner_type === 'supplier' ? 'suppliers' : 'clients'
      const partner = await db.collection(pcol).findOne({ id: b.partner_id, tenant_id: T })
      if (!partner) return bad('الشريك غير موجود')
      const snap = await computePartnerStatement(db, T, b.partner_id, b.from || null, b.to || null)
      if ((snap.rows || []).length === 0) return bad('لا توجد عمولات في الفترة المحددة — لا يمكن أرشفة كشف فارغ')
      const doc = {
        id: uuidv4(), tenant_id: T,
        partner_type: b.partner_type, partner_id: b.partner_id, partner_name: partner.name,
        from: b.from || null, to: b.to || null,
        rows: snap.rows, totals: snap.totals, count: snap.count,
        settlement_voucher_id: null, settled_at: null, settled_amount: null, settled_currency: null,
        created_at: new Date(),
      }
      await db.collection('partner_statements').insertOne(doc)
      const { _id, ...rest } = doc
      return ok(rest)
    }
    if (route === '/partners/statements' && method === 'GET') {
      const url = new URL(request.url)
      const q = { tenant_id: T }
      const pid = url.searchParams.get('partner_id')
      if (pid) q.partner_id = pid
      return ok(clean(await db.collection('partner_statements').find(q).sort({ created_at: -1 }).limit(100).toArray()))
    }
    // v3.22 — Settle a statement: creates a payment voucher (balanced JE) reducing the partner's due balance
    const stmtSettleMatch = route.match(/^\/partners\/statements\/([^/]+)\/settle$/)
    if (stmtSettleMatch && method === 'POST') {
      const b = await request.json()
      const stmt = await db.collection('partner_statements').findOne({ id: stmtSettleMatch[1], tenant_id: T })
      if (!stmt) return bad('الكشف غير موجود', 404)
      if (stmt.settlement_voucher_id) return bad('هذا الكشف مُسوّى مسبقاً — أنشئ كشفاً جديداً لأي مستحقات لاحقة')
      const currency = b.currency
      if (!CURRENCIES.includes(currency)) return bad('عملة غير صالحة')
      const dueForCur = Number(stmt.totals?.[currency]?.partner_share) || 0
      if (dueForCur <= 0) return bad(`لا توجد مستحقات بعملة ${currency} في هذا الكشف`)
      const amount = b.amount !== undefined ? Number(b.amount) : dueForCur
      if (!(amount > 0)) return bad('المبلغ يجب أن يكون أكبر من صفر')
      if (amount > dueForCur + 0.01) return bad(`المبلغ يتجاوز مستحقات الكشف (${dueForCur} ${currency})`)
      const result = await createVoucher(db, T, {
        type: 'payment',
        party_type: stmt.partner_type, party_id: stmt.partner_id,
        box_id: b.box_id, currency, amount,
        date: b.date || undefined,
        description: `تسوية عمولات شريك — ${stmt.partner_name} (كشف ${stmt.from ? new Date(stmt.from).toLocaleDateString('en-GB') : 'البداية'} ← ${stmt.to ? new Date(stmt.to).toLocaleDateString('en-GB') : 'اليوم'})${b.notes ? ` — ${String(b.notes).slice(0, 120)}` : ''}`,
      })
      if (result.error) return bad(result.error)
      await db.collection('partner_statements').updateOne(
        { id: stmt.id, tenant_id: T },
        { $set: { settlement_voucher_id: result.doc.id, settled_at: new Date(), settled_amount: amount, settled_currency: currency } }
      )
      return ok({ voucher: result.doc, statement_id: stmt.id, settled_amount: amount, settled_currency: currency })
    }

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
      // v3.13 — Duplicate rule: (PNR + date) — a different travel date is NOT a duplicate
      const pnrs = rows.map(r => r.pnr).filter(Boolean)
      // v3.18 — Existing keys use TRAVEL DATE only; records without travel date are never dedup-blockers
      const existingSet = new Set()
      if (pnrs.length) {
        const existing = await db.collection('tickets').find({ tenant_id: T, pnr: { $in: pnrs } }).project({ pnr: 1, travel_date: 1 }).toArray()
        for (const t of existing) {
          const d = t.travel_date ? new Date(t.travel_date).toISOString().slice(0, 10) : ''
          if (d) existingSet.add(`${t.pnr}|${d}`)
        }
      }
      // v3.9.9 — Name+Date dedup (main key for offices without PNR)
      const nameDateKeys = rows.map(r => `${String(r.passenger_name || '').trim().toLowerCase()}|${String(r.travel_date || r.date || '').slice(0, 10)}`).filter(k => !k.startsWith('|'))
      const existingByNameDate = new Set()
      if (nameDateKeys.length) {
        const existingTix = await db.collection('tickets').find({ tenant_id: T, passenger_name: { $in: rows.map(r => String(r.passenger_name || '').trim()).filter(Boolean) } }).project({ passenger_name: 1, travel_date: 1 }).toArray()
        for (const t of existingTix) {
          const d = t.travel_date ? new Date(t.travel_date).toISOString().slice(0, 10) : ''
          if (d) existingByNameDate.add(`${String(t.passenger_name || '').trim().toLowerCase()}|${d}`)
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
        // v3.18 — Duplicate rule uses TRAVEL DATE ONLY (never the transaction date fallback).
        // No travel date => no name/PNR dedup (accept the row). Different travel date => accepted.
        const rowDate = String(r.travel_date || '').slice(0, 10)
        if (r.pnr && rowDate && existingSet.has(`${r.pnr}|${rowDate}`)) dup = 'موجود مسبقاً (PNR + نفس تاريخ السفر)'
        if (r.pnr && rowDate && seenInBatch.has(`${r.pnr}|${rowDate}`)) dup = 'مكرر داخل نفس الملف (PNR + نفس تاريخ السفر)'
        if (r.pnr && rowDate) seenInBatch.add(`${r.pnr}|${rowDate}`)
        // 2) Name+TravelDate dedup (main check for offices without PNR)
        if (!dup && r.passenger_name && rowDate) {
          const nd = `${String(r.passenger_name).trim().toLowerCase()}|${rowDate}`
          if (existingByNameDate.has(nd)) dup = 'موجود مسبقاً (اسم المسافر + نفس تاريخ السفر)'
          else if (seenNameDateInBatch.has(nd)) dup = 'مكرر داخل نفس الملف (اسم + نفس تاريخ السفر)'
          else seenNameDateInBatch.add(nd)
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
      // v3.13 — Duplicate rule: (passport + date) — a different entry date is NOT a duplicate
      const passports = rows.map(r => r.passport_no).filter(Boolean)
      const existingSet = new Set()
      if (passports.length) {
        const existing = await db.collection('visas').find({ tenant_id: T, passport_no: { $in: passports } }).project({ passport_no: 1, entry_date: 1 }).toArray()
        for (const v of existing) {
          const d = v.entry_date ? new Date(v.entry_date).toISOString().slice(0, 10) : ''
          if (d) existingSet.add(`${v.passport_no}|${d}`)
        }
      }
      // v3.9.9 — Name+Date dedup (main key)
      const existingByNameDate = new Set()
      const names = rows.map(r => String(r.passenger_name || '').trim()).filter(Boolean)
      if (names.length) {
        const existingVisas = await db.collection('visas').find({ tenant_id: T, passenger_name: { $in: names } }).project({ passenger_name: 1, entry_date: 1 }).toArray()
        for (const v of existingVisas) {
          const d = v.entry_date ? new Date(v.entry_date).toISOString().slice(0, 10) : ''
          if (d) existingByNameDate.add(`${String(v.passenger_name || '').trim().toLowerCase()}|${d}`)
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
        // v3.18 — Duplicate rule uses ENTRY DATE only (never the transaction date fallback).
        // No entry date => no dedup (accept). Different entry date => accepted as a new operation.
        const rowDate = String(r.entry_date || '').slice(0, 10)
        if (r.passport_no && rowDate && existingSet.has(`${r.passport_no}|${rowDate}`)) dup = 'موجود مسبقاً (جواز + نفس تاريخ الدخول)'
        if (r.passport_no && rowDate && seenInBatch.has(`${r.passport_no}|${rowDate}`)) dup = 'مكرر داخل الملف (جواز + نفس تاريخ الدخول)'
        if (r.passport_no && rowDate) seenInBatch.add(`${r.passport_no}|${rowDate}`)
        // Name+EntryDate dedup
        if (!dup && r.passenger_name && rowDate) {
          const nd = `${String(r.passenger_name).trim().toLowerCase()}|${rowDate}`
          if (existingByNameDate.has(nd)) dup = 'موجود مسبقاً (اسم المعتمر + نفس تاريخ الدخول)'
          else if (seenNameDateInBatch.has(nd)) dup = 'مكرر داخل نفس الملف (اسم + نفس تاريخ الدخول)'
          else seenNameDateInBatch.add(nd)
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
          // v3.30/v3.32 — Meraaj-listed packages: deliver package.deactivated FIRST; if delivery FAILS, skip local delete
          if (pkg.meraaj?.shared || pkg.meraaj?.registered_at) {
            const dlv = await emitMeraajEvent(db, T, 'package.deactivated', { package_ref: pkg.id, reason: 'deleted_by_office' })
            if (dlv === 'failed') { failed++; errors.push({ id, error: 'تعذر إبلاغ معراج بإيقاف الباكج — لم يُحذف' }); continue }
          }
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
      // v3.30 — capture Meraaj-shared packages BEFORE the bulk status change for marketplace sync
      const affectedShared = await db.collection('packages').find({ id: { $in: ids }, tenant_id: T, 'meraaj.shared': true }).toArray()
      const r = await db.collection('packages').updateMany({ id: { $in: ids }, tenant_id: T }, { $set: { status, updated_at: new Date() } })
      try {
        for (const p of affectedShared) {
          if (status === 'closed') {
            await emitMeraajEvent(db, T, 'package.deactivated', { package_ref: p.id, reason: 'closed_by_office' })
          } else {
            const fresh = await db.collection('packages').findOne({ id: p.id, tenant_id: T })
            const compsB = await db.collection('package_components').find({ package_id: p.id, tenant_id: T }).toArray()
            await emitMeraajEvent(db, T, 'package.updated', await meraajContractPayload(db, T, fresh, compsB))
          }
        }
      } catch { /* marketplace sync must never break bulk ops */ }
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
    // v3.10.4 — Unified Query & Filters for Visas + Tickets
    if (route === '/reports/query' && method === 'GET') {
      const from = q.from || null
      const to = q.to || null
      const kind = String(q.kind || 'all').toLowerCase() // 'all' | 'visa' | 'ticket'
      const serviceType = q.service_type || null       // e.g. 'تأشيرة عمرة'
      const ticketType = q.ticket_type || null         // e.g. 'ذهاب فقط'
      const clientId = q.client_id || null
      const supplierId = q.supplier_id || null
      const paymentMethod = q.payment_method || null   // 'cash' | 'credit'
      const minQty = Number(q.min_qty) || 0            // count filter
      const searchText = (q.search || '').toString().trim().toLowerCase()
      const baseFilter = { tenant_id: T }
      if (from) baseFilter.date = { ...(baseFilter.date || {}), $gte: from }
      if (to) baseFilter.date = { ...(baseFilter.date || {}), $lte: to }
      if (clientId) baseFilter.client_id = clientId
      if (supplierId) baseFilter.supplier_id = supplierId
      if (paymentMethod) baseFilter.payment_method = paymentMethod
      let visas = [], tickets = []
      if (kind === 'all' || kind === 'visa') {
        const vf = { ...baseFilter }
        if (serviceType) vf.service_type = serviceType
        visas = await db.collection('visas').find(vf).sort({ date: -1 }).toArray()
        if (searchText) visas = visas.filter(v =>
          String(v.beneficiary_name || v.passenger_name || '').toLowerCase().includes(searchText) ||
          String(v.passport_no || '').toLowerCase().includes(searchText) ||
          String(v.phone || '').includes(searchText) ||
          String(v.client_name || '').toLowerCase().includes(searchText) ||
          String(v.supplier_name || '').toLowerCase().includes(searchText)
        )
      }
      if (kind === 'all' || kind === 'ticket') {
        const tf = { ...baseFilter }
        if (ticketType) tf.ticket_type = ticketType
        tickets = await db.collection('tickets').find(tf).sort({ date: -1 }).toArray()
        if (searchText) tickets = tickets.filter(t =>
          String(t.passenger_name || '').toLowerCase().includes(searchText) ||
          String(t.pnr || '').toLowerCase().includes(searchText) ||
          String(t.phone || '').includes(searchText) ||
          String(t.client_name || '').toLowerCase().includes(searchText) ||
          String(t.supplier_name || '').toLowerCase().includes(searchText)
        )
      }
      // Aggregate stats (in base currency of tenant if rates given, else keep per-currency)
      const settings = await db.collection('tenant_settings').findOne({ tenant_id: T }) || {}
      const baseCcy = settings.base_currency || 'USD'
      const rates = settings.rates || {}
      const toBaseAmt = (amt, cur) => {
        const r = (rates[cur] && rates[cur].to_base) ? Number(rates[cur].to_base) : 1
        return Number(amt || 0) * r
      }
      let totalSales = 0, totalCommission = 0
      visas.forEach(v => { totalSales += toBaseAmt(v.sale_price, v.currency || baseCcy); totalCommission += toBaseAmt(v.commission, v.currency || baseCcy) })
      tickets.forEach(t => { totalSales += toBaseAmt(t.sale_price, t.currency || baseCcy); totalCommission += toBaseAmt(t.commission, t.currency || baseCcy) })
      const stats = {
        visas_count: visas.length,
        tickets_count: tickets.length,
        total_sales: +totalSales.toFixed(2),
        total_commission: +totalCommission.toFixed(2),
        base_currency: baseCcy,
      }
      // minQty filter — return only if aggregates satisfy
      if (minQty > 0) {
        if (visas.length < minQty) visas = []
        if (tickets.length < minQty) tickets = []
      }
      return ok({ stats, visas: clean(visas), tickets: clean(tickets), filters_applied: { from, to, kind, service_type: serviceType, ticket_type: ticketType, client_id: clientId, supplier_id: supplierId, payment_method: paymentMethod, min_qty: minQty, search: searchText } })
    }

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

// ============ v3.20 — DUAL PRICING (Phase B) ============
// Age category from a registrant's age: infant <2, child 2-11, adult 12+ (null age = adult)
function ageCategoryOf(age) {
  if (age === null || age === undefined || age === '') return 'adult'
  const a = Number(age)
  if (a < 2) return 'infant'
  if (a < 12) return 'child'
  return 'adult'
}
// v3.23 — Package features/amenities list (Miraj Network readiness)
function sanitizeFeatures(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(x => String(x || '').trim().slice(0, 60))
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, 30)
}
// Sanitize room_pricing array: [{type, sale_per_pax(adult), sale_child|null, sale_infant|null}]
function sanitizeRoomPricing(arr) {  return (Array.isArray(arr) ? arr : [])
    .filter(r => r && String(r.type || '').trim())
    .slice(0, 12)
    .map(r => ({
      type: String(r.type).trim().slice(0, 40),
      sale_per_pax: Math.max(0, Number(r.sale_per_pax) || 0),
      sale_child: (r.sale_child === undefined || r.sale_child === null || r.sale_child === '') ? null : Math.max(0, Number(r.sale_child) || 0),
      sale_infant: (r.sale_infant === undefined || r.sale_infant === null || r.sale_infant === '') ? null : Math.max(0, Number(r.sale_infant) || 0),
    }))
}
// v3.49 — Hotels quick-details on the package itself (name + city + nights) for program display
function sanitizeHotels(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter(h => h && String(h.name || '').trim())
    .slice(0, 10)
    .map(h => ({
      name: String(h.name).trim().slice(0, 80),
      city: String(h.city || '').trim().slice(0, 40),
      nights: Math.max(0, Math.min(60, Math.round(Number(h.nights) || 0))),
    }))
}
// Sanitize per-room-type rates for 'room_age' components
function sanitizeRoomRates(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter(r => r && String(r.room_type || '').trim())
    .slice(0, 12)
    .map(r => ({
      room_type: String(r.room_type).trim().slice(0, 40),
      cost_adult: Math.max(0, Number(r.cost_adult) || 0),
      cost_child: Math.max(0, Number(r.cost_child) || 0),
      cost_infant: Math.max(0, Number(r.cost_infant) || 0),
      sale_adult: Math.max(0, Number(r.sale_adult) || 0),
      sale_child: Math.max(0, Number(r.sale_child) || 0),
      sale_infant: Math.max(0, Number(r.sale_infant) || 0),
    }))
}
// Compute one component's cost/sale totals for a booking.
// pricing_type: 'flat' (visa: same price per person) | 'per_age' (transport) | 'room_age' (hotel)
// Legacy components (no pricing_type) behave exactly as before: flat × billed pax (infants excluded).
function computeComponentTotals(comp, registrants, paxBilled, totalPax) {
  const pt = comp.pricing_type || 'flat'
  const regs = Array.isArray(registrants) ? registrants : []
  if (regs.length > 0 && pt === 'per_age') {
    let cost = 0, sale = 0
    for (const r of regs) {
      const cat = ageCategoryOf(r.age)
      cost += Number(comp[`cost_${cat}`]) || 0
      sale += Number(comp[`sale_${cat}`]) || 0
    }
    return { cost_total: +cost.toFixed(2), sale_total: +sale.toFixed(2) }
  }
  if (regs.length > 0 && pt === 'room_age') {
    const map = {}
    for (const rr of (comp.room_rates || [])) map[rr.room_type] = rr
    let cost = 0, sale = 0
    for (const r of regs) {
      const rr = map[r.room_type]
      if (!rr) continue
      const cat = ageCategoryOf(r.age)
      cost += Number(rr[`cost_${cat}`]) || 0
      sale += Number(rr[`sale_${cat}`]) || 0
    }
    return { cost_total: +cost.toFixed(2), sale_total: +sale.toFixed(2) }
  }
  // flat: visa-style — same price per person; include_infants charges infants too
  const n = (regs.length > 0 && comp.include_infants) ? totalPax : paxBilled
  return {
    cost_total: +((Number(comp.cost_per_pax) || 0) * n).toFixed(2),
    sale_total: +((Number(comp.sale_per_pax) || 0) * n).toFixed(2),
  }
}
// Direct room+age sale (B2B ready-made): adult price = sale_per_pax, child falls back to adult, infant defaults 0
function computeDirectRoomSale(roomPricing, registrants) {
  const map = {}
  for (const rp of (roomPricing || [])) map[rp.type] = rp
  let sale = 0
  for (const r of (registrants || [])) {
    const rp = map[r.room_type]
    if (!rp) continue
    const cat = ageCategoryOf(r.age)
    if (cat === 'infant') sale += Number(rp.sale_infant) || 0
    else if (cat === 'child') sale += (rp.sale_child === null || rp.sale_child === undefined) ? (Number(rp.sale_per_pax) || 0) : (Number(rp.sale_child) || 0)
    else sale += Number(rp.sale_per_pax) || 0
  }
  return +sale.toFixed(2)
}

// v3.21/v3.22 — Shared partner-commission statement computation (used by live view + archive snapshot)
async function computePartnerStatement(db, T, partnerId, from, to) {
  const dateFilter = {}
  if (from) dateFilter.$gte = new Date(from)
  if (to) dateFilter.$lte = new Date(to + 'T23:59:59')
  const hasDate = Object.keys(dateFilter).length > 0
  const baseQ = { tenant_id: T, commission_partner_id: partnerId, commission_share_amount: { $gt: 0 } }
  const tq = hasDate ? { ...baseQ, date: dateFilter } : baseQ
  const bq = hasDate ? { ...baseQ, created_at: dateFilter } : baseQ
  const [tickets, visas, services, bookings] = await Promise.all([
    db.collection('tickets').find(tq).toArray(),
    db.collection('visas').find(tq).toArray(),
    db.collection('services').find(tq).toArray(),
    db.collection('package_bookings').find(bq).toArray(),
  ])
  const pkgIds = [...new Set(bookings.map(x => x.package_id).filter(Boolean))]
  const pkgs = pkgIds.length ? await db.collection('packages').find({ tenant_id: T, id: { $in: pkgIds } }).toArray() : []
  const pkgMap = {}
  for (const p of pkgs) pkgMap[p.id] = p.name
  const rows = []
  const push = (list, module, moduleLabel, descFn, dateFn) => {
    for (const d of list) rows.push({
      id: d.id, module, module_label: moduleLabel,
      date: dateFn(d) || d.created_at || null,
      description: descFn(d),
      currency: d.currency || 'USD',
      total_commission: +(Number(d.commission) || 0).toFixed(2),
      partner_share: +(Number(d.commission_share_amount) || 0).toFixed(2),
      share_mode: d.commission_share_mode || 'amount',
      share_value: Number(d.commission_share_value) || 0,
    })
  }
  push(tickets, 'ticket', '✈️ تذكرة', d => `${d.passenger_name || d.client_name || ''}${d.trip_route ? ` — ${d.trip_route}` : ''}`.trim() || 'تذكرة طيران', d => d.date)
  push(visas, 'visa', '🛂 تأشيرة', d => `${d.service_type || 'تأشيرة'} — ${d.passenger_name || ''}`.trim(), d => d.date)
  push(services, 'service', '🧾 خدمة', d => `${d.service_type || 'خدمة'} — ${d.beneficiary_name || ''}`.trim(), d => d.date)
  push(bookings, 'package', '📦 باكج', d => `${pkgMap[d.package_id] || 'باكج'} — ${d.pilgrim_name || ''} (${d.pax_count || 1} فرد)`.trim(), d => d.created_at)
  rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  const totals = {}
  for (const r of rows) {
    totals[r.currency] = totals[r.currency] || { partner_share: 0, total_commission: 0, count: 0 }
    totals[r.currency].partner_share += r.partner_share
    totals[r.currency].total_commission += r.total_commission
    totals[r.currency].count++
  }
  for (const c of Object.keys(totals)) {
    totals[c].partner_share = +totals[c].partner_share.toFixed(2)
    totals[c].total_commission = +totals[c].total_commission.toFixed(2)
    totals[c].office_share = +(totals[c].total_commission - totals[c].partner_share).toFixed(2)
  }
  return { rows, totals, count: rows.length }
}

// ============ v3.24 — MERAAJ NETWORK INTEGRATION (معراج نتورك) ============
function meraajSecret() { return process.env.MERAAJ_SHARED_SECRET || '' }
function meraajSign(payload) { return crypto.createHmac('sha256', meraajSecret()).update(payload).digest('hex') }
// Verify an HMAC signature in constant time
function meraajVerify(payload, signature) {
  if (!meraajSecret() || !signature) return false
  try {
    const expected = meraajSign(payload)
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)))
  } catch { return false }
}
// Verify a timestamped server-to-server GET request: sig = HMAC(`${ts}.${path}`), |now-ts| <= 300s
function meraajVerifyRequest(request, route) {
  const ts = request.headers.get('x-meraaj-timestamp')
  const sig = request.headers.get('x-meraaj-signature')
  if (!ts || !sig) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(ts)) > 300) return false
  return meraajVerify(`${ts}.${route}`, sig)
}
// v3.25 — Compute marketplace pricing table from package room pricing + agent commission config
function computeMeraajMarketPricing(roomPricingArr, mode, value, direction) {
  const rows = (Array.isArray(roomPricingArr) ? roomPricingArr : []).filter(r => (Number(r.sale_per_pax) || 0) > 0)
  const commFor = (base) => {
    if (!(base > 0)) return 0
    return mode === 'percent' ? +(base * value / 100).toFixed(2) : +(+value).toFixed(2)
  }
  return rows.map(rp => {
    const baseAdult = +(Number(rp.sale_per_pax) || 0).toFixed(2)
    const baseChild = (rp.sale_child === null || rp.sale_child === undefined) ? baseAdult : +(Number(rp.sale_child) || 0).toFixed(2)
    const baseInfant = +(Number(rp.sale_infant) || 0).toFixed(2)
    const row = { room_type: rp.type, base: { adult: baseAdult, child: baseChild, infant: baseInfant }, commission: {}, customer: {}, net: {} }
    for (const cat of ['adult', 'child', 'infant']) {
      const base = row.base[cat]
      const comm = commFor(base)
      row.commission[cat] = comm
      if (direction === 'added') { row.customer[cat] = +(base + comm).toFixed(2); row.net[cat] = base }
      else { row.customer[cat] = base; row.net[cat] = +(base - comm).toFixed(2) }
    }
    return row
  })
}
// Availability of a shared package in the marketplace (allocated - sold)
function meraajAvailability(pkg) {
  const m = pkg?.meraaj || {}
  const allocated = Number(m.seats_allocated) || 0
  const sold = Number(m.seats_sold) || 0
  return Math.max(0, allocated - sold)
}
// Outbox pattern: persist the event, then best-effort deliver (signed) if Meraaj endpoint is configured.
// v3.32 — returns delivery status: 'sent' | 'failed' | 'pending' (pending = no endpoint configured yet)
async function emitMeraajEvent(db, tenantId, type, payload) {
  // v3.34 — CRITICAL: enrich every package event with the FULL identity so Meraaj can
  // match its own record regardless of which key its handler uses:
  //   rahal_ref (Meraaj's stored link field) + meraaj_package_id (the id Meraaj itself
  //   returned at first-share registration) + package_ref (legacy, kept).
  // Without this, Meraaj acked webhooks with 200 but could not locate the package to apply changes.
  if (payload && payload.package_ref) {
    if (!payload.rahal_ref) payload.rahal_ref = payload.package_ref
    if (payload.meraaj_package_id === undefined) {
      try {
        const p = await db.collection('packages').findOne({ id: payload.package_ref, tenant_id: tenantId }, { projection: { 'meraaj.remote_id': 1 } })
        payload.meraaj_package_id = p?.meraaj?.remote_id || null
      } catch { payload.meraaj_package_id = null }
    }
  }
  const doc = {
    id: uuidv4(), tenant_id: tenantId, type, payload,
    status: 'pending', attempts: 0, last_error: null,
    created_at: new Date(), sent_at: null,
  }
  await db.collection('meraaj_events').insertOne(doc)
  // v3.30 — Webhook destination per Meraaj contract: {MERAAJ_API_BASE_URL}/api/integrations/rahal/webhooks
  // (MERAAJ_WEBHOOK_URL can still override explicitly)
  const url = process.env.MERAAJ_WEBHOOK_URL || (meraajApiBase() ? `${meraajApiBase()}/api/integrations/rahal/webhooks` : '')
  if (!url || !meraajSecret()) return 'pending' // stays pending in outbox until Meraaj endpoint is configured
  try {
    const ts = Math.floor(Date.now() / 1000)
    const body = JSON.stringify({ id: doc.id, type, timestamp: ts, data: payload })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // v3.30 — Meraaj contract auth: X-Rahal-Signature = HMAC-SHA256(exact raw JSON body).
        // The old x-rahaal-timestamp / x-rahaal-signature headers are NOT part of the contract — removed.
        'X-Rahal-Signature': meraajSign(body),
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) { await db.collection('meraaj_events').updateOne({ id: doc.id }, { $set: { status: 'sent', sent_at: new Date(), attempts: 1 } }); return 'sent' }
    await db.collection('meraaj_events').updateOne({ id: doc.id }, { $set: { status: 'failed', attempts: 1, last_error: `HTTP ${res.status}` } })
    return 'failed'
  } catch (e) {
    await db.collection('meraaj_events').updateOne({ id: doc.id }, { $set: { status: 'failed', attempts: 1, last_error: String(e.message || e).slice(0, 200) } })
    return 'failed'
  }
}
// v3.32 — Any edit to marketplace-visible data (components/hotels/transport/images) on a LISTED package
// must sync Meraaj via the existing package.updated webhook (contract payload) — never throws
async function maybeEmitMeraajPackageUpdate(db, tenantId, packageId) {
  try {
    const pkg = await db.collection('packages').findOne({ id: packageId, tenant_id: tenantId })
    if (!pkg || !pkg.meraaj?.shared) return
    const comps = await db.collection('package_components').find({ package_id: packageId, tenant_id: tenantId }).toArray()
    await emitMeraajEvent(db, tenantId, 'package.updated', await meraajContractPayload(db, tenantId, pkg, comps))
  } catch { /* marketplace sync must never break core operations */ }
}
// Emit inventory.updated for a shared package (called after any booking/seat change) — never throws
async function maybeEmitMeraajInventory(db, tenantId, packageId) {  try {
    const pkg = await db.collection('packages').findOne({ id: packageId, tenant_id: tenantId })
    if (!pkg || !pkg.meraaj?.shared) return
    const bookingsCount = await db.collection('package_bookings').countDocuments({ tenant_id: tenantId, package_id: packageId })
    await emitMeraajEvent(db, tenantId, 'inventory.updated', {
      package_ref: pkg.id,
      status: pkg.status,
      seats_allocated: Number(pkg.meraaj.seats_allocated) || 0,
      seats_sold: Number(pkg.meraaj.seats_sold) || 0,
      seats_available: meraajAvailability(pkg),
      internal_bookings: bookingsCount,
      final_price: pkg.meraaj.final_price,
      currency: pkg.currency,
    })
  } catch { /* outbox failure must never break core ops */ }
}
// Public payload of a package for the marketplace
function meraajPackagePayload(pkg, comps = []) {
  return {
    package_ref: pkg.id,
    tenant_id: pkg.tenant_id,
    name: pkg.name,
    package_type: pkg.package_type,
    currency: pkg.currency,
    start_date: pkg.start_date, end_date: pkg.end_date,
    notes: pkg.notes || '',
    features: pkg.features || [],
    has_image: !!pkg.has_image,
    image_url: pkg.has_image ? `/api/meraaj/packages/${pkg.id}/image` : null,
    pricing_mode: pkg.pricing_mode || 'direct',
    // v3.49 — NaN fix: resolve age-tier fallbacks before sending (empty child = adult price, empty infant = 0)
    // Same keys/structure as Contract v2 — values only, so Meraaj never receives null.
    room_pricing: (pkg.room_pricing || []).map(r => {
      const adult = Number(r.sale_per_pax) || 0
      return {
        ...r,
        sale_per_pax: adult,
        sale_child: (r.sale_child === null || r.sale_child === undefined || r.sale_child === '') ? adult : (Number(r.sale_child) || 0),
        sale_infant: (r.sale_infant === null || r.sale_infant === undefined || r.sale_infant === '') ? 0 : (Number(r.sale_infant) || 0),
      }
    }),
    status: pkg.status,
    meraaj: {
      shared: !!pkg.meraaj?.shared,
      pricing_source: 'auto_room_pricing',
      buyer_commission_mode: pkg.meraaj?.buyer_commission_mode || 'amount',
      buyer_commission_value: pkg.meraaj?.buyer_commission_value ?? 0,
      commission_direction: pkg.meraaj?.commission_direction || 'deducted',
      // v3.25 — full per-room per-age marketplace price table (customer price + agent commission + seller net)
      market_pricing: pkg.meraaj?.market_pricing || [],
      seats_allocated: Number(pkg.meraaj?.seats_allocated) || 0,
      seats_sold: Number(pkg.meraaj?.seats_sold) || 0,
      seats_available: meraajAvailability(pkg),
      shared_at: pkg.meraaj?.shared_at || null,
    },
    components: comps.map(c => ({ name: c.name, component_type: c.component_type, pricing_type: c.pricing_type || 'flat' })),
  }
}

// v3.29 — FIRST SHARE: direct REST registration at Meraaj (NOT a webhook event).
// POST {MERAAJ_API_BASE_URL}/api/integrations/rahal/packages/share with X-Rahal-Api-Key.
// Share succeeds ONLY on a 2xx response from Meraaj — any failure blocks the share.
function meraajApiBase() { return (process.env.MERAAJ_API_BASE_URL || '').trim().replace(/\/+$/, '') }
// v3.42 — Resilient public base URL for Rahaal-hosted assets (package image URLs sent to Meraaj).
// Root cause fix: on LIVE, an empty NEXT_PUBLIC_BASE_URL silently produced images: [] even when has_image=true.
// Priority: RAHAAL_PUBLIC_BASE_URL (explicit server-side override) → NEXT_PUBLIC_BASE_URL → live request origin (cached per request in the router).
function rahaalPublicBase() {
  const explicit = (process.env.RAHAAL_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
  if (explicit) return explicit
  const pub = (process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
  if (pub) return pub
  return String(globalThis.__rahaalPublicOrigin || '').replace(/\/+$/, '')
}
// v3.30 — UNIFIED Meraaj CONTRACT payload — single source of truth for field names:
// Rahaal name → Meraaj title | notes → description | start_date → departure_date | end_date → return_date
// Used by BOTH the first-share REST call AND the package.updated webhook (never send non-contract shapes).
async function meraajContractPayload(db, T, pkg, comps, meraajOverride = null) {
  const m = meraajOverride || pkg.meraaj || {}
  const tenant = await db.collection('tenants').findOne({ id: T }, { projection: { name: 1 } })
  const owner = await db.collection('users').findOne({ tenant_id: T, role: 'owner' }, { projection: { name: 1 } })
  // v3.49 — ZERO/NaN GUARD: if market_pricing is empty/stale while the package has room prices,
  // recompute it live from room_pricing + stored commission settings (values only — same structure).
  const marketRows = (Array.isArray(m.market_pricing) && m.market_pricing.length > 0)
    ? m.market_pricing
    : computeMeraajMarketPricing(pkg.room_pricing || [], m.buyer_commission_mode || 'amount', Number(m.buyer_commission_value) || 0, m.commission_direction || 'deducted')
  // Representative per-seat pricing = cheapest adult row of the market pricing table
  const rows = marketRows.filter(r => (Number(r.customer?.adult) || 0) > 0)
  const cheapest = rows.slice().sort((a, b) => a.customer.adult - b.customer.adult)[0] || null
  // v3.49 — hotels: merge component-based hotels with the package's quick hotel details (names only — same string[] structure)
  const hotels = [...new Set([
    ...(comps || []).filter(c => c.component_type === 'hotel').map(c => String(c.name || '').trim()),
    ...((Array.isArray(pkg.hotels) ? pkg.hotels : []).map(h => String(h.name || '').trim())),
  ].filter(Boolean))]
  const appBase = rahaalPublicBase()
  // v3.42 — never fail silently: has_image=true must always yield a real image URL (root cause of LIVE images:[] bug)
  if (pkg.has_image && !appBase) console.error(`[MERAAJ] WARNING: package ${pkg.id} has_image=true but no public base URL could be resolved (set RAHAAL_PUBLIC_BASE_URL or NEXT_PUBLIC_BASE_URL) — images[] will be sent empty`)
  // v3.37 — EXTENDED CONTRACT (backward-compatible: all previous fields kept unchanged)
  const transports = await db.collection('package_transports').find({ package_id: pkg.id, tenant_id: T }).toArray()
  return {
    package_ref: pkg.id,
    // v3.36 — Meraaj v1.1 contract: unique-linkage identity fields in EVERY payload (share + webhooks)
    rahal_ref: pkg.id,
    meraaj_package_id: (meraajOverride?.remote_id ?? pkg.meraaj?.remote_id) || null,
    title: pkg.name,
    // v3.37 — extended fields
    package_type: pkg.package_type || null,
    // Full marketplace room pricing matrix (per room type × adult/child/infant):
    // net = what the buyer office pays the seller, customer = suggested final sale price,
    // commission = buyer office margin. (Seller's internal costs are NEVER exposed.)
    room_pricing: marketRows,
    // Full transport/bus fleet of the package (internal booking counts are not exposed)
    package_transports: transports.map(t => ({ name: t.name || '', type: t.type || 'bus', capacity: Number(t.capacity) || 0 })),
    // Full package components (names + types; internal cost/sale breakdown is not exposed)
    // v3.40 — additive optional fields: nights + city per hotel component
    components: (comps || []).map(c => ({ name: c.name || '', component_type: c.component_type || 'other', ...(Number(c.nights) > 0 ? { nights: Number(c.nights) } : {}), ...(c.city ? { city: c.city } : {}) })),
    description: pkg.notes || '',
    departure_date: pkg.start_date || null,
    return_date: pkg.end_date || null,
    departure_city: pkg.departure_city || null,
    transport: pkg.transport || null,
    hotels,
    images: pkg.has_image && appBase ? [`${appBase}/api/meraaj/packages/${pkg.id}/image`] : [],
    // v3.33 — package features must reach the marketplace (share + updates)
    features: Array.isArray(pkg.features) ? pkg.features : [],
    available_seats: Math.max(0, (Number(m.seats_allocated) || 0) - (Number(m.seats_sold) || 0)),
    office_ref: T,
    office_name: tenant?.name || '',
    owner_name: owner?.name || '',
    pricing: {
      net_cost_per_seat: cheapest ? cheapest.net.adult : 0,
      final_sale_price: cheapest ? cheapest.customer.adult : 0,
      buyer_office_commission: cheapest ? cheapest.commission.adult : 0,
      currency: pkg.currency,
    },
  }
}
async function meraajRegisterPackageAPI(db, T, pkg, comps, meraajSet) {
  const base = meraajApiBase()
  if (!base) return { ok: false, error: 'MERAAJ_API_BASE_URL غير مُهيأ في إعدادات الخادم' }
  if (!meraajSecret()) return { ok: false, error: 'MERAAJ_SHARED_SECRET غير مُهيأ' }
  const payload = await meraajContractPayload(db, T, pkg, comps, meraajSet)
  const endpoint = `${base}/api/integrations/rahal/packages/share`
  const logDoc = {
    id: uuidv4(), tenant_id: T, type: 'package.share_api', channel: 'rest_api',
    payload: { package_ref: pkg.id, endpoint },
    status: 'pending', attempts: 1, last_error: null, created_at: new Date(), sent_at: null,
  }
  try {
    // v3.36 — Meraaj v1.1: EVERY request is HMAC-SHA256 signed over the exact raw body.
    // Share request carries BOTH: X-Rahal-Api-Key (existing contract) + X-Rahal-Signature.
    const rawBody = JSON.stringify(payload)
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rahal-Api-Key': meraajSecret(), 'X-Rahal-Signature': meraajSign(rawBody) },
      body: rawBody,
      signal: AbortSignal.timeout(15000),
    })
    let json = null
    try { json = await res.json() } catch { /* non-JSON body is fine */ }
    if (res.ok) {
      logDoc.status = 'sent'; logDoc.sent_at = new Date()
      await db.collection('meraaj_events').insertOne(logDoc)
      const remoteId = json?.meraaj_package_id || json?.package_id || json?.id || json?.data?.id || null
      return { ok: true, remote_id: remoteId }
    }
    const errMsg = (json?.message || json?.error || `HTTP ${res.status}`).toString().slice(0, 200)
    logDoc.status = 'failed'; logDoc.last_error = errMsg
    await db.collection('meraaj_events').insertOne(logDoc)
    return { ok: false, error: errMsg }
  } catch (e) {
    const errMsg = String(e.message || e).slice(0, 200)
    logDoc.status = 'failed'; logDoc.last_error = errMsg
    try { await db.collection('meraaj_events').insertOne(logDoc) } catch {}
    return { ok: false, error: errMsg.includes('abort') || errMsg.includes('timeout') ? 'انتهت مهلة الاتصال بمعراج' : errMsg }
  }
}

// ================= Business logic =================
async function createTicket(db, T, b, opts = {}) {
  if (!b.supplier_id) return { error: 'المورد مطلوب' }
  if (!CURRENCIES.includes(b.currency)) return { error: 'عملة غير صالحة' }
  // v3.10.2 — Strict validation for mandatory ticket fields
  if (!b.passenger_name || !String(b.passenger_name).trim()) return { error: 'اسم المسافر مطلوب' }
  if (!b.travel_date) return { error: 'تاريخ السفر مطلوب' }
  // v3.10.7 — Accept the real ticket phone fields (passenger_phone / passenger_whatsapp).
  // Legacy 'phone' key is still accepted for backward compatibility.
  const _ticketPhone = (b.passenger_phone || b.passenger_whatsapp || b.phone || '').toString().trim()
  if (!_ticketPhone) return { error: 'رقم الجوال مطلوب' }
  // v3.10.2 — Reject negative amounts across all numeric fields
  const numFields = ['cost', 'sale_price', 'discount', 'commission', 'partner_commission_share', 'partner_commission', 'commission_office_share']
  for (const f of numFields) if (b[f] !== undefined && Number(b[f]) < 0) return { error: `القيمة السالبة غير مسموحة في الحقل: ${f}` }
  // v3.9.14 — Period lock: prevent creating records in a closed year
  if (b.date) {
    const yr = new Date(b.date).getFullYear()
    const tenant = await db.collection('tenants').findOne({ id: T }, { projection: { closed_years: 1 } })
    if (tenant?.closed_years?.includes(yr)) return { error: `السنة المالية ${yr} مقفلة — لا يمكن إضافة أو تعديل قيود بتاريخها` }
    // v3.10.6 — Date-level period lock check
    const settings = await db.collection('tenant_settings').findOne({ tenant_id: T }, { projection: { period_lock: 1 } })
    if (settings?.period_lock?.closed_until && b.date <= settings.period_lock.closed_until) {
      return { error: `🔒 الفترة حتى ${settings.period_lock.closed_until} مقفلة — استخدم قيد تسوية عكسي بالتاريخ الحالي بدلاً من التعديل الرجعي` }
    }
  }
  const paymentMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
  if (paymentMethod === 'credit' && !b.client_id) return { error: 'العميل مطلوب للحجز الآجل' }
  const cost = Number(b.cost) || 0, sale = Number(b.sale_price) || 0
  const commission = +(sale - cost).toFixed(2)
  const cli = b.client_id ? await db.collection('clients').findOne({ id: b.client_id, tenant_id: T }) : null
  const sup = await db.collection('suppliers').findOne({ id: b.supplier_id, tenant_id: T })
  if (!sup) return { error: 'المورد غير موجود' }
  if (paymentMethod === 'credit' && !cli) return { error: 'العميل غير موجود' }
  // v3.10.6 — Credit limit + freeze check
  if (paymentMethod === 'credit' && !opts.existingId) {
    const _settings_credit = await db.collection('tenant_settings').findOne({ tenant_id: T }) || {}
    const _cc = await checkClientCredit(db, T, b.client_id, sale || Number(b.sale_price) || 0, b.currency, _settings_credit)
    if (!_cc.ok) return { error: _cc.error }
  }
  // v3.10.7 — Below-cost sale prevention (Phase 6)
  const _cost = Number(b.cost) || 0
  const _sale = Number(b.sale_price) || 0
  if (_cost > 0 && _sale > 0 && _sale < _cost && !b.allow_below_cost) {
    return { error: `⚠️ سعر البيع (${_sale}) أقل من التكلفة (${_cost}) — لتجاوز هذا الحد أضف \"allow_below_cost: true\" في الطلب أو ارفع السعر أعلى من التكلفة.` }
  }
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
    // v3.9.27 — Commission Sharing (partner split)
    commission_partner_type: b.commission_partner_type || null,   // 'client' | 'supplier' | null
    commission_partner_id: b.commission_partner_id || null,
    commission_partner_name: b.commission_partner_name || '',
    commission_share_mode: b.commission_share_mode === 'percent' ? 'percent' : 'amount',
    commission_share_value: Number(b.commission_share_value) || 0,
    commission_share_amount: 0,   // computed below
    payment_method: paymentMethod, box_id: box?.id || null, box_name: box?.name_ar || null,
    created_at: opts.createdAt || new Date(),
    ...(opts.existingId ? { updated_at: new Date() } : {}),
  }
  // v3.9.27 — Compute partner commission share amount
  let partnerShare = 0
  if (doc.commission_partner_id && doc.commission_share_value > 0 && commission > 0) {
    if (doc.commission_share_mode === 'percent') {
      partnerShare = +(commission * (doc.commission_share_value / 100)).toFixed(2)
    } else {
      partnerShare = +Number(doc.commission_share_value).toFixed(2)
    }
    partnerShare = Math.min(partnerShare, commission) // cap at total commission
  }
  doc.commission_share_amount = partnerShare
  const officeNetCommission = +(commission - partnerShare).toFixed(2)
  await db.collection('tickets').insertOne(doc)
  // Balance updates + journal
  await updateBalance(db, 'suppliers', { id: sup.id, tenant_id: T }, b.currency, cost)
  // v3.9.27 — Update partner balance if commission-share configured
  if (partnerShare > 0 && doc.commission_partner_id) {
    const col = doc.commission_partner_type === 'supplier' ? 'suppliers' : 'clients'
    // Partner is CREDITED (they are owed by us). For clients that means their debt to us decreases.
    // We credit them by -partnerShare (i.e., they owe us less / we owe them if supplier)
    await updateBalance(db, col, { id: doc.commission_partner_id, tenant_id: T }, b.currency, -partnerShare)
  }
  const lines = []
  if (paymentMethod === 'cash') {
    await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: sale, credit: 0 })
  } else {
    await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: sale, credit: 0 })
  }
  lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sup.id, party_name: sup.name, debit: 0, credit: cost })
  if (officeNetCommission !== 0) {
    lines.push({ account_code: '4101', account_name: 'إيرادات عمولات التذاكر', party_type: 'revenue', party_id: null, party_name: 'إيرادات عمولات التذاكر', debit: 0, credit: officeNetCommission })
  }
  if (partnerShare > 0) {
    lines.push({ account_code: doc.commission_partner_type === 'supplier' ? '2101' : '1301', account_name: doc.commission_partner_type === 'supplier' ? 'الموردون' : 'العملاء', party_type: doc.commission_partner_type, party_id: doc.commission_partner_id, party_name: doc.commission_partner_name || 'شريك عمولة', debit: 0, credit: partnerShare })
  }
  await createJournalEntry(db, T, {
    date: doc.date, description: `${opts.existingId ? 'تعديل ' : ''}حجز تذكرة ${paymentMethod === 'cash' ? '(نقد)' : '(آجل)'} PNR ${doc.pnr || '-'} — ${cli?.name || doc.client_name || sup.name}${partnerShare > 0 ? ` — عمولة مشتركة ${partnerShare} مع ${doc.commission_partner_name}` : ''}`,
    ref_type: 'ticket', ref_id: doc.id, currency: b.currency, lines,
  }, { skipQuota: !!opts.skipQuota })
  const { _id, ...rest } = doc; return { doc: rest }
}

async function createVisa(db, T, b, opts = {}) {
  if (!b.supplier_id) return { error: 'المورد مطلوب' }
  if (!CURRENCIES.includes(b.currency)) return { error: 'عملة غير صالحة' }
  // v3.10.2 — Strict validation for mandatory visa fields
  if (!b.beneficiary_name || !String(b.beneficiary_name).trim()) return { error: 'اسم صاحب التأشيرة / المعتمر مطلوب' }
  // v3.10.7 — Accept the real visa phone fields (beneficiary_phone / beneficiary_whatsapp / passenger_phone).
  // Legacy 'phone' key is still accepted for backward compatibility.
  const _visaPhone = (b.beneficiary_phone || b.beneficiary_whatsapp || b.passenger_phone || b.passenger_whatsapp || b.phone || '').toString().trim()
  if (!_visaPhone) return { error: 'رقم الجوال مطلوب' }
  // v3.10.2 — Reject negative amounts
  const numFields = ['cost', 'sale_price', 'discount', 'commission']
  for (const f of numFields) if (b[f] !== undefined && Number(b[f]) < 0) return { error: `القيمة السالبة غير مسموحة في الحقل: ${f}` }
  // v3.9.14 — Period lock
  if (b.date) {
    const yr = new Date(b.date).getFullYear()
    const tenant = await db.collection('tenants').findOne({ id: T }, { projection: { closed_years: 1 } })
    if (tenant?.closed_years?.includes(yr)) return { error: `السنة المالية ${yr} مقفلة — لا يمكن إضافة أو تعديل قيود بتاريخها` }
    // v3.10.6 — Date-level period lock check
    const settings = await db.collection('tenant_settings').findOne({ tenant_id: T }, { projection: { period_lock: 1 } })
    if (settings?.period_lock?.closed_until && b.date <= settings.period_lock.closed_until) {
      return { error: `🔒 الفترة حتى ${settings.period_lock.closed_until} مقفلة — استخدم قيد تسوية عكسي بالتاريخ الحالي` }
    }
  }
  const paymentMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
  if (paymentMethod === 'credit' && !b.client_id) return { error: 'العميل مطلوب للحجز الآجل' }
  const cost = Number(b.cost) || 0, sale = Number(b.sale_price) || 0
  const commission = +(sale - cost).toFixed(2)
  const cli = b.client_id ? await db.collection('clients').findOne({ id: b.client_id, tenant_id: T }) : null
  const sup = await db.collection('suppliers').findOne({ id: b.supplier_id, tenant_id: T })
  if (!sup) return { error: 'المورد غير موجود' }
  if (paymentMethod === 'credit' && !cli) return { error: 'العميل غير موجود' }
  // v3.10.6 — Credit limit + freeze check
  if (paymentMethod === 'credit' && !opts.existingId) {
    const _settings_credit = await db.collection('tenant_settings').findOne({ tenant_id: T }) || {}
    const _cc = await checkClientCredit(db, T, b.client_id, sale || Number(b.sale_price) || 0, b.currency, _settings_credit)
    if (!_cc.ok) return { error: _cc.error }
  }
  // v3.10.7 — Below-cost sale prevention (Phase 6)
  const _cost = Number(b.cost) || 0
  const _sale = Number(b.sale_price) || 0
  if (_cost > 0 && _sale > 0 && _sale < _cost && !b.allow_below_cost) {
    return { error: `⚠️ سعر البيع (${_sale}) أقل من التكلفة (${_cost}) — لتجاوز هذا الحد أضف \"allow_below_cost: true\" في الطلب أو ارفع السعر أعلى من التكلفة.` }
  }
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
    // v3.19 — Commission Sharing (partner split) — generalized from tickets v3.9.27
    commission_partner_type: b.commission_partner_type || null,   // 'client' | 'supplier' | null
    commission_partner_id: b.commission_partner_id || null,
    commission_partner_name: b.commission_partner_name || '',
    commission_share_mode: b.commission_share_mode === 'percent' ? 'percent' : 'amount',
    commission_share_value: Number(b.commission_share_value) || 0,
    commission_share_amount: 0,
    payment_method: paymentMethod, box_id: box?.id || null, box_name: box?.name_ar || null,
    created_at: opts.createdAt || new Date(),
    ...(opts.existingId ? { updated_at: new Date() } : {}),
  }
  // v3.19 — Compute partner commission share amount (same rules as tickets)
  let partnerShare = 0
  if (doc.commission_partner_id && doc.commission_share_value > 0 && commission > 0) {
    if (doc.commission_share_mode === 'percent') partnerShare = +(commission * (doc.commission_share_value / 100)).toFixed(2)
    else partnerShare = +Number(doc.commission_share_value).toFixed(2)
    partnerShare = Math.min(partnerShare, commission)
  }
  doc.commission_share_amount = partnerShare
  const officeNetCommission = +(commission - partnerShare).toFixed(2)
  await db.collection('visas').insertOne(doc)
  await updateBalance(db, 'suppliers', { id: sup.id, tenant_id: T }, b.currency, cost)
  if (partnerShare > 0 && doc.commission_partner_id) {
    const col = doc.commission_partner_type === 'supplier' ? 'suppliers' : 'clients'
    await updateBalance(db, col, { id: doc.commission_partner_id, tenant_id: T }, b.currency, -partnerShare)
  }
  const lines = []
  if (paymentMethod === 'cash') {
    await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: sale, credit: 0 })
  } else {
    await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: sale, credit: 0 })
  }
  lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sup.id, party_name: sup.name, debit: 0, credit: cost })
  if (officeNetCommission !== 0) {
    lines.push({ account_code: '4102', account_name: 'إيرادات عمولات التأشيرات', party_type: 'revenue', party_id: null, party_name: 'إيرادات عمولات التأشيرات', debit: 0, credit: officeNetCommission })
  }
  if (partnerShare > 0) {
    lines.push({ account_code: doc.commission_partner_type === 'supplier' ? '2101' : '1301', account_name: doc.commission_partner_type === 'supplier' ? 'الموردون' : 'العملاء', party_type: doc.commission_partner_type, party_id: doc.commission_partner_id, party_name: doc.commission_partner_name || 'شريك عمولة', debit: 0, credit: partnerShare })
  }
  await createJournalEntry(db, T, {
    date: doc.date, description: `${opts.existingId ? 'تعديل ' : ''}${doc.service_type} ${paymentMethod === 'cash' ? '(نقد)' : '(آجل)'} — ${doc.passenger_name || cli?.name || doc.client_name || sup.name}${partnerShare > 0 ? ` — عمولة مشتركة ${partnerShare} مع ${doc.commission_partner_name}` : ''}`,
    ref_type: 'visa', ref_id: doc.id, currency: b.currency, lines,
  }, { skipQuota: !!opts.skipQuota })
  // v3.10.5 — Auto-create Visa Monitor record if destination_country + passport are provided
  if (!opts.existingId && b.destination_country && b.passport_no) {
    try {
      const passport = String(b.passport_no).trim().toUpperCase()
      const existing = await db.collection('visa_monitoring').findOne({ tenant_id: T, passport_no: passport })
      if (!existing) {
        await db.collection('visa_monitoring').insertOne({
          id: uuidv4(), tenant_id: T,
          traveler_name: doc.passenger_name || doc.beneficiary_name || '',
          phone: b.phone || '',
          passport_no: passport,
          destination_country: b.destination_country,
          visa_type: doc.service_type,
          entry_date: b.entry_date || doc.date,
          max_exit_date: b.max_exit_date || null,
          actual_exit_date: null,
          status: 'active',
          linked_visa_id: doc.id,
          source: 'auto_from_visa',
          notes: 'إنشاء تلقائي من شاشة التأشيرات',
          created_at: new Date(), updated_at: new Date()
        })
      }
    } catch (e) { /* silent — monitor creation is optional */ }
  }
  const { _id, ...rest } = doc; return { doc: rest }
}

// v3.0 — Services: Dedicated dynamic-catalog service transactions (Hotels, Attestations, Transfers, etc.)
// Uses revenue account 4103 (إيرادات خدمات إضافية). Party label = "حساب القبض" but stored the same way.
async function createService(db, T, b, opts = {}) {
  if (!b.supplier_id) return { error: 'المورد/المزود مطلوب' }
  if (!CURRENCIES.includes(b.currency)) return { error: 'عملة غير صالحة' }
  // v3.9.14 — Period lock: prevent creating records in a closed year
  if (b.date) {
    const yr = new Date(b.date).getFullYear()
    const tenant = await db.collection('tenants').findOne({ id: T }, { projection: { closed_years: 1 } })
    if (tenant?.closed_years?.includes(yr)) return { error: `السنة المالية ${yr} مقفلة — لا يمكن إضافة أو تعديل قيود بتاريخها` }
    // v3.10.6 — Date-level period lock check
    const settings = await db.collection('tenant_settings').findOne({ tenant_id: T }, { projection: { period_lock: 1 } })
    if (settings?.period_lock?.closed_until && b.date <= settings.period_lock.closed_until) {
      return { error: `🔒 الفترة حتى ${settings.period_lock.closed_until} مقفلة — استخدم قيد تسوية عكسي بالتاريخ الحالي بدلاً من التعديل الرجعي` }
    }
  }
  const paymentMethod = b.payment_method === 'cash' ? 'cash' : 'credit'
  // v3.9.22 — Unified payment: credit needs client_id, cash needs box_id only
  if (paymentMethod === 'credit' && !b.client_id) return { error: 'العميل مطلوب للحجز الآجل' }
  const cost = Number(b.cost) || 0, sale = Number(b.sale_price) || 0
  const commission = +(sale - cost).toFixed(2)
  const cli = b.client_id ? await db.collection('clients').findOne({ id: b.client_id, tenant_id: T }) : null
  const sup = await db.collection('suppliers').findOne({ id: b.supplier_id, tenant_id: T })
  if (!sup) return { error: 'المورد غير موجود' }
  if (paymentMethod === 'credit' && !cli) return { error: 'العميل غير موجود' }
  // v3.10.6 — Credit limit + freeze check
  if (paymentMethod === 'credit' && !opts.existingId) {
    const _settings_credit = await db.collection('tenant_settings').findOne({ tenant_id: T }) || {}
    const _cc = await checkClientCredit(db, T, b.client_id, sale || Number(b.sale_price) || 0, b.currency, _settings_credit)
    if (!_cc.ok) return { error: _cc.error }
  }
  // v3.10.7 — Below-cost sale prevention (Phase 6)
  const _cost = Number(b.cost) || 0
  const _sale = Number(b.sale_price) || 0
  if (_cost > 0 && _sale > 0 && _sale < _cost && !b.allow_below_cost) {
    return { error: `⚠️ سعر البيع (${_sale}) أقل من التكلفة (${_cost}) — لتجاوز هذا الحد أضف \"allow_below_cost: true\" في الطلب أو ارفع السعر أعلى من التكلفة.` }
  }
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
    client_id: cli?.id || null,
    client_name: cli?.name || (paymentMethod === 'cash' ? (b.client_name || 'عميل نقدي') : ''),
    supplier_id: sup.id, supplier_name: sup.name,
    beneficiary_name: b.beneficiary_name || '', reference_no: b.reference_no || '',
    // v3.2 — Phone / WhatsApp
    beneficiary_phone: b.beneficiary_phone || '',
    beneficiary_whatsapp: b.beneficiary_whatsapp || b.beneficiary_phone || '',
    notes: b.notes || '',
    cost, sale_price: sale, commission,
    // v3.19 — Commission Sharing (partner split) — generalized from tickets v3.9.27
    commission_partner_type: b.commission_partner_type || null,
    commission_partner_id: b.commission_partner_id || null,
    commission_partner_name: b.commission_partner_name || '',
    commission_share_mode: b.commission_share_mode === 'percent' ? 'percent' : 'amount',
    commission_share_value: Number(b.commission_share_value) || 0,
    commission_share_amount: 0,
    payment_method: paymentMethod, box_id: box?.id || null, box_name: box?.name_ar || null,
    created_at: opts.createdAt || new Date(),
    ...(opts.existingId ? { updated_at: new Date() } : {}),
  }
  // v3.19 — Compute partner commission share amount
  let partnerShare = 0
  if (doc.commission_partner_id && doc.commission_share_value > 0 && commission > 0) {
    if (doc.commission_share_mode === 'percent') partnerShare = +(commission * (doc.commission_share_value / 100)).toFixed(2)
    else partnerShare = +Number(doc.commission_share_value).toFixed(2)
    partnerShare = Math.min(partnerShare, commission)
  }
  doc.commission_share_amount = partnerShare
  const officeNetCommission = +(commission - partnerShare).toFixed(2)
  await db.collection('services').insertOne(doc)
  await updateBalance(db, 'suppliers', { id: sup.id, tenant_id: T }, b.currency, cost)
  if (partnerShare > 0 && doc.commission_partner_id) {
    const col = doc.commission_partner_type === 'supplier' ? 'suppliers' : 'clients'
    await updateBalance(db, col, { id: doc.commission_partner_id, tenant_id: T }, b.currency, -partnerShare)
  }
  const lines = []
  if (paymentMethod === 'cash') {
    await updateBalance(db, 'boxes', { id: box.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: box.type === 'cash' ? '1101' : '1201', account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: sale, credit: 0 })
  } else {
    await updateBalance(db, 'clients', { id: cli.id, tenant_id: T }, b.currency, sale)
    lines.push({ account_code: '1301', account_name: 'حساب القبض', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: sale, credit: 0 })
  }
  lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sup.id, party_name: sup.name, debit: 0, credit: cost })
  if (officeNetCommission !== 0) {
    lines.push({ account_code: '4103', account_name: 'إيرادات خدمات إضافية', party_type: 'revenue', party_id: null, party_name: `إيرادات ${doc.service_type}`, debit: 0, credit: officeNetCommission })
  }
  if (partnerShare > 0) {
    lines.push({ account_code: doc.commission_partner_type === 'supplier' ? '2101' : '1301', account_name: doc.commission_partner_type === 'supplier' ? 'الموردون' : 'العملاء', party_type: doc.commission_partner_type, party_id: doc.commission_partner_id, party_name: doc.commission_partner_name || 'شريك عمولة', debit: 0, credit: partnerShare })
  }
  await createJournalEntry(db, T, {
    date: doc.date, description: `${opts.existingId ? 'تعديل ' : ''}${doc.service_type} ${paymentMethod === 'cash' ? '(نقد)' : '(آجل)'} — ${doc.beneficiary_name || cli?.name || doc.client_name || sup.name}${partnerShare > 0 ? ` — عمولة مشتركة ${partnerShare} مع ${doc.commission_partner_name}` : ''}`,
    ref_type: 'service', ref_id: doc.id, currency: b.currency, lines,
  }, { skipQuota: !!opts.skipQuota })
  const { _id, ...rest } = doc; return { doc: rest }
}

async function createVoucher(db, T, b, opts = {}) {
  if (!['receipt', 'payment'].includes(b.type)) return { error: 'نوع السند غير صالح' }
  if (!CURRENCIES.includes(b.currency)) return { error: 'عملة غير صالحة' }
  const amount = Number(b.amount) || 0
  if (Number(b.amount) < 0) return { error: 'لا يُسمح بمبلغ سالب في السند' }
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
  if (Number(b.amount) < 0 || Number(b.exchange_rate) < 0) return { error: 'لا يُسمح بقيم سالبة في المبلغ أو سعر الصرف' }
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
    if (da < 0 || ca < 0) return { error: 'لا يُسمح بقيم سالبة في المبالغ' }
    if (da <= 0 || ca <= 0) return { error: 'المبالغ يجب أن تكون أكبر من صفر' }
    if (!CURRENCIES.includes(b.debit_currency) || !CURRENCIES.includes(b.credit_currency)) return { error: 'العملات غير صالحة' }
    // v3.10.0 strict — both sides MUST have registered account_code
    if (!b.debit_account_code || !b.credit_account_code) return { error: 'عذراً، يجب اختيار حساب معتمد من دليل الحسابات لكلا الطرفين' }
    // v3.10.0 — validate account codes exist
    const preLines = [
      { account_code: b.debit_account_code, debit: da, credit: 0 },
      { account_code: b.credit_account_code, debit: 0, credit: ca },
    ]
    const v = await validateJournalLines(db, T, preLines)
    if (!v.ok) return { error: v.error }
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
  // v3.10.0 — reject negative + verify accounts exist
  const v = await validateJournalLines(db, T, lines)
  if (!v.ok) return { error: v.error }
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
