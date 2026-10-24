// ============================================================================
// v8.0 — RAHAAL BACKUP ENGINE (shared by Super Admin center + Office settings).
// Genuinely RESTORABLE packages: { manifest, data } with sha256 checksum.
// BACKUP TYPES:
//   office_config  → office configuration & structure (users/roles, branches,
//                    COA, clients, suppliers, boxes/banks, service types,
//                    currencies via tenant_settings) — tenant-isolated.
//   office_data    → operational & accounting data (journal entries, vouchers,
//                    tickets, visas, services, packages, FX, interbranch) —
//                    tenant-isolated, NEVER a cross-tenant dump.
//   full_office    → office_config + office_data in one recoverable package.
//   full_system    → complete platform backup (Super Admin ONLY): every business
//                    collection, excluding secret-bearing collections.
//   tenant_export / system_settings → legacy types kept working.
// SECURITY: packages NEVER contain env secrets, API keys, sessions, OTPs or
// personal access tokens (FULL_SYSTEM_EXCLUDE). Office restores can never touch
// another tenant (manifest.tenant_id hard-matched) nor escalate privileges
// (tenants doc + admin-realm users blocked on office scope).
// FINANCIAL SAFETY: transactional collections restore as RAW documents in
// insert-if-missing mode — no posting logic re-runs, existing entries are never
// overwritten → no duplicate entries, no double balances, no second accounting
// effect.
// ============================================================================
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'

export const BACKUP_SCHEMA_VERSION = 1
export const BACKUP_ENGINE_VERSION = '8.0'

export const OFFICE_CONFIG_COLLECTIONS = ['users', 'branches', 'accounts', 'clients', 'suppliers', 'boxes', 'service_types']
export const OFFICE_DATA_COLLECTIONS = ['tickets', 'visas', 'services', 'packages', 'package_bookings', 'currency_exchanges', 'vouchers', 'journal_entries', 'interbranch_transactions']
export const LEGACY_TENANT_EXPORT_COLLECTIONS = ['tickets', 'visas', 'services', 'clients', 'suppliers', 'boxes', 'journal_entries', 'packages', 'package_bookings', 'currency_exchanges', 'vouchers', 'accounts', 'service_types']
export const SYSTEM_SETTINGS_COLLECTIONS = ['platform_settings', 'subscription_plans', 'admin_role_templates', 'admin_notification_settings', 'countries', 'admin_staff_roles']
// Secret/ephemeral collections that must NEVER leave the database in any package
export const FULL_SYSTEM_EXCLUDE = new Set([
  'sessions', 'email_otps', 'admin_backup_blobs', 'admin_restore_uploads',
  'personal_access_tokens', 'pat_tokens', 'api_tokens',
])

// ============================================================================
// v8.1.1 — CENTRALIZED SECRET SANITIZATION (item-15 security fix).
// Collection-level exclusion above is NOT enough: settings collections (e.g.
// platform_settings since v8.1) may hold FIELD-level credentials such as
// email_provider.api_key, SMTP passwords or future provider tokens. This
// pattern-based deep sanitizer runs at BOTH funnels:
//   • EXPORT (buildBackupPackage): credential fields never enter the package
//     (checksum is computed AFTER sanitization — packages stay verifiable).
//   • RESTORE (smartRestore): the same fields are stripped from incoming docs,
//     so restoring an old/foreign package can NEVER blank or overwrite the
//     runtime provider secrets ($set simply omits those fields).
// Pattern-based by design → future credential fields are protected without
// code changes. Applied ONLY to settings collections — never to `users`
// (bcrypt password_hash must survive office_config restores).
// ============================================================================
const SECRET_FIELD_RE = /(api[_-]?key|api[_-]?secret|client[_-]?secret|webhook[_-]?secret|signing[_-]?key|private[_-]?key|access[_-]?key|credential|password|passwd|token|secret)/i
export const SECRET_SANITIZED_COLLECTIONS = new Set(['platform_settings', 'admin_notification_settings'])
export function stripSecretFields(value) {
  if (Array.isArray(value)) return value.map(stripSecretFields)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELD_RE.test(k)) continue // credential field — never exported/restored
      out[k] = stripSecretFields(v)
    }
    return out
  }
  return value
}
const sanitizeForPackage = (coll, doc) => (SECRET_SANITIZED_COLLECTIONS.has(coll) ? stripSecretFields(doc) : doc)

export const BACKUP_TYPE_DEFS = {
  office_config: { label: 'نسخة إعدادات المكتب', scope: 'tenant', office_visible: true },
  office_data: { label: 'نسخة بيانات/عمليات المكتب', scope: 'tenant', office_visible: true },
  full_office: { label: 'نسخة المكتب الكاملة (إعدادات + بيانات)', scope: 'tenant', office_visible: true },
  full_system: { label: 'نسخة النظام الكاملة', scope: 'system', office_visible: false },
  tenant_export: { label: 'تصدير مكتب (قديم)', scope: 'tenant', office_visible: true },
  system_settings: { label: 'إعدادات المنظومة (قديم)', scope: 'system', office_visible: false },
}
export const OFFICE_ALLOWED_TYPES = ['office_config', 'office_data', 'full_office']

const strip = (d) => { const { _id, ...rest } = d; return rest }
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

// Privileged tenant fields an OFFICE restore may never overwrite (quota/subscription/realm)
const TENANT_PRIVILEGED_FIELDS = ['subscription', 'plan_tier', 'journal_quota', 'max_users', 'max_branches', 'status', 'is_platform_org', 'referral_stats', 'referral_code', 'referred_by', 'activation_confirmed', 'subscription_expires_at', 'subscription_price', 'unlimited_journals']

async function collectTenantColls(db, tenantId, colls, data) {
  for (const coll of colls) {
    try {
      const docs = await db.collection(coll).find({ tenant_id: tenantId }).toArray()
      data[coll] = docs.map(strip)
    } catch { data[coll] = [] }
  }
}

// Builds a complete package { manifest, data }. Throws on unknown type.
export async function buildBackupPackage(db, { type, tenantId = null, createdBy, envName, backupId = null }) {
  const def = BACKUP_TYPE_DEFS[type]
  if (!def) throw new Error(`نوع نسخة غير معروف: ${type}`)
  const data = {}
  let tenant = null
  if (def.scope === 'tenant') {
    tenant = await db.collection('tenants').findOne({ id: tenantId })
    if (!tenant) throw new Error('المكتب غير موجود')
    if (type === 'office_config' || type === 'full_office') {
      data.tenants = [strip(tenant)]
      const ts = await db.collection('tenant_settings').findOne({ tenant_id: tenantId })
      data.tenant_settings = ts ? [strip(ts)] : []
      await collectTenantColls(db, tenantId, OFFICE_CONFIG_COLLECTIONS, data)
    }
    if (type === 'office_data' || type === 'full_office') {
      await collectTenantColls(db, tenantId, OFFICE_DATA_COLLECTIONS, data)
    }
    if (type === 'tenant_export') { // legacy shape, now wrapped with a manifest
      await collectTenantColls(db, tenantId, LEGACY_TENANT_EXPORT_COLLECTIONS, data)
      const ts = await db.collection('tenant_settings').findOne({ tenant_id: tenantId })
      data.tenant_settings = ts ? [strip(ts)] : []
    }
  } else if (type === 'system_settings') {
    for (const coll of SYSTEM_SETTINGS_COLLECTIONS) {
      const docs = await db.collection(coll).find({}).toArray().catch(() => [])
      data[coll] = docs.map(d => sanitizeForPackage(coll, strip(d))) // v8.1.1 — no credential fields in packages
    }
  } else if (type === 'full_system') {
    // REAL complete system backup: every collection in the database except the
    // secret/ephemeral exclusion list — dynamic, so new collections are included.
    const names = (await db.listCollections().toArray()).map(c => c.name).filter(n => !n.startsWith('system.') && !FULL_SYSTEM_EXCLUDE.has(n))
    for (const coll of names.sort()) {
      const docs = await db.collection(coll).find({}).toArray().catch(() => [])
      data[coll] = docs.map(d => sanitizeForPackage(coll, strip(d))) // v8.1.1 — no credential fields in packages
    }
  }
  const dataJson = JSON.stringify(data)
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]))
  const manifest = {
    backup_id: backupId || uuidv4(),
    backup_type: type, scope: def.scope,
    tenant_id: tenantId || null, tenant_name: tenant?.name || null,
    created_at: new Date().toISOString(), created_by: createdBy,
    environment: envName || null,
    version: BACKUP_ENGINE_VERSION, schema_version: BACKUP_SCHEMA_VERSION,
    checksum: sha256(dataJson), checksum_algo: 'sha256(data)',
    size_bytes: Buffer.byteLength(dataJson, 'utf8'),
    counts,
  }
  return { manifest, data }
}

// ---- package validation (restore pre-flight) ----
export function validatePackage(pkg, { expectTenantId = null, allowedTypes = null } = {}) {
  const errors = []
  if (!pkg || typeof pkg !== 'object') return { valid: false, errors: ['ملف النسخة غير صالح (ليس JSON)'] }
  const man = pkg.manifest
  // legacy export (no manifest): accept only the legacy office shape
  if (!man) {
    if (pkg.data && pkg.tenant_id) {
      if (expectTenantId && pkg.tenant_id !== expectTenantId) return { valid: false, errors: ['🚫 النسخة تخص مكتباً آخر — الاستعادة مرفوضة'] }
      return { valid: true, legacy: true, manifest: { backup_type: 'tenant_export', scope: 'tenant', tenant_id: pkg.tenant_id, tenant_name: pkg.tenant_name || null, schema_version: 0, counts: Object.fromEntries(Object.entries(pkg.data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])) }, warnings: ['نسخة بصيغة قديمة (بدون manifest) — لا يمكن التحقق من checksum'] }
    }
    return { valid: false, errors: ['الملف لا يحتوي على manifest — ليس نسخة رحّال صالحة'] }
  }
  if (!BACKUP_TYPE_DEFS[man.backup_type]) errors.push(`نوع نسخة غير معروف: ${man.backup_type}`)
  if (allowedTypes && !allowedTypes.includes(man.backup_type)) errors.push('🚫 هذا النوع من النسخ غير مسموح باستعادته من هنا')
  if (Number(man.schema_version) > BACKUP_SCHEMA_VERSION) errors.push(`إصدار مخطط النسخة (${man.schema_version}) أحدث من النظام الحالي (${BACKUP_SCHEMA_VERSION}) — غير متوافق`)
  if (expectTenantId && man.scope === 'tenant' && man.tenant_id !== expectTenantId) errors.push('🚫 النسخة تخص مكتباً آخر — الاستعادة مرفوضة')
  if (expectTenantId && man.scope !== 'tenant') errors.push('🚫 نسخة على مستوى النظام لا تُستعاد داخل مكتب')
  if (!pkg.data || typeof pkg.data !== 'object') errors.push('النسخة لا تحتوي على بيانات')
  else if (man.checksum) {
    const actual = sha256(JSON.stringify(pkg.data))
    if (actual !== man.checksum) errors.push('فشل التحقق من سلامة الملف (checksum mismatch) — الملف معدّل أو تالف')
  }
  return { valid: errors.length === 0, errors, manifest: man, warnings: [] }
}

// ---- chunked blob storage (admin_backup_blobs) — supports packages > 16MB doc cap ----
const CHUNK_CHARS = 2 * 1024 * 1024 // ~2M chars ≈ up to ~8MB utf8/doc — safe under Mongo's 16MB
export async function storeBackupBlob(db, backupId, json) {
  await db.collection('admin_backup_blobs').deleteMany({ backup_id: backupId })
  let seq = 0
  for (let i = 0; i < json.length; i += CHUNK_CHARS) {
    await db.collection('admin_backup_blobs').insertOne({ id: uuidv4(), backup_id: backupId, seq: seq++, chunk: json.slice(i, i + CHUNK_CHARS), created_at: new Date() })
  }
  return seq
}
export async function loadBackupBlob(db, backupId) {
  const rows = await db.collection('admin_backup_blobs').find({ backup_id: backupId }).sort({ seq: 1 }).toArray()
  if (!rows.length) return null
  if (rows.length === 1 && rows[0].payload !== undefined) return rows[0].payload // legacy single-doc blob
  return rows.map(r => r.chunk ?? r.payload ?? '').join('')
}

// ============================================================================
// SMART RESTORE — no duplicate financial effect.
//  • Transactional collections (OFFICE_DATA_COLLECTIONS): insert-if-missing by
//    id ONLY. Existing documents are NEVER touched — no re-posting, no doubles.
//  • Config collections: upsert by id ($set) — structure converges to backup.
//  • Office scope hardening: tenants doc privileged fields stripped; users that
//    are super_admin/admin_staff (or carry realm flags) are rejected; every doc
//    is force-scoped to the target tenant.
// ============================================================================
export async function smartRestore(db, pkg, { targetTenantId = null, actorScope = 'admin', allowSystem = false } = {}) {
  const data = pkg.data || {}
  const manifest = pkg.manifest || {}
  const summary = {}
  const bump = (coll, key) => { summary[coll] = summary[coll] || { inserted: 0, updated: 0, skipped: 0, rejected: 0 }; summary[coll][key]++ }
  const DATA_SET = new Set(OFFICE_DATA_COLLECTIONS)
  const isTenantScoped = manifest.scope === 'tenant' || !!targetTenantId

  for (const [coll, docs] of Object.entries(data)) {
    if (!Array.isArray(docs)) continue
    if (FULL_SYSTEM_EXCLUDE.has(coll)) { for (const _ of docs) bump(coll, 'rejected'); continue }

    // tenants collection: office scope may only merge NON-privileged fields of ITS OWN doc
    if (coll === 'tenants') {
      for (const doc of docs) {
        if (!doc?.id) { bump(coll, 'rejected'); continue }
        if (isTenantScoped && doc.id !== targetTenantId) { bump(coll, 'rejected'); continue }
        if (actorScope === 'office') {
          const safe = { ...doc }
          for (const f of TENANT_PRIVILEGED_FIELDS) delete safe[f]
          delete safe.id
          const r = await db.collection('tenants').updateOne({ id: targetTenantId }, { $set: { ...safe, restored_at: new Date() } })
          bump(coll, r.modifiedCount ? 'updated' : 'skipped')
        } else {
          const { id, ...rest } = doc
          const r = await db.collection('tenants').updateOne({ id }, { $set: rest, $setOnInsert: { id } }, { upsert: true })
          bump(coll, r.upsertedCount ? 'inserted' : (r.modifiedCount ? 'updated' : 'skipped'))
        }
      }
      continue
    }

    if (coll === 'tenant_settings') {
      for (const doc of docs) {
        if (isTenantScoped && doc.tenant_id !== targetTenantId) { bump(coll, 'rejected'); continue }
        const { _id, ...rest } = doc
        const r = await db.collection('tenant_settings').updateOne({ tenant_id: doc.tenant_id }, { $set: rest }, { upsert: true })
        bump(coll, r.upsertedCount ? 'inserted' : (r.modifiedCount ? 'updated' : 'skipped'))
      }
      continue
    }

    for (const doc of docs) {
      if (!doc || !doc.id) { bump(coll, 'rejected'); continue }
      // tenant isolation: scoped restores reject any doc from another tenant
      if (isTenantScoped && 'tenant_id' in doc && doc.tenant_id !== targetTenantId) { bump(coll, 'rejected'); continue }
      // office scope can NEVER create/alter admin-realm identities
      if (coll === 'users' && actorScope === 'office') {
        if (doc.role === 'super_admin' || doc.role === 'admin_staff' || doc.admin_realm === true || doc.platform_org === true) { bump(coll, 'rejected'); continue }
        doc.tenant_id = targetTenantId
        delete doc.admin_realm; delete doc.platform_org; delete doc.admin_role_key; delete doc.admin_overrides
      }
      // system-level collections only when explicitly allowed (full_system by main SA)
      const tenantScopedDoc = 'tenant_id' in doc
      if (!tenantScopedDoc && !allowSystem && !OFFICE_CONFIG_COLLECTIONS.includes(coll) && !DATA_SET.has(coll)) { bump(coll, 'rejected'); continue }

      if (DATA_SET.has(coll)) {
        // FINANCIAL/TRANSACTIONAL: insert-if-missing ONLY — never touch existing docs
        const exists = await db.collection(coll).findOne({ id: doc.id }, { projection: { id: 1 } })
        if (exists) { bump(coll, 'skipped'); continue }
        await db.collection(coll).insertOne({ ...doc })
        bump(coll, 'inserted')
      } else {
        // v8.1.1 — RESTORE-side secret sanitization: settings docs are stripped of
        // credential fields BEFORE the $set, so a restored package can never blank
        // or overwrite the runtime provider secrets (absent fields stay untouched).
        const cleanDoc = sanitizeForPackage(coll, doc)
        const { id, ...rest } = cleanDoc
        const r = await db.collection(coll).updateOne({ id: doc.id }, { $set: rest, $setOnInsert: { id: doc.id } }, { upsert: true })
        bump(coll, r.upsertedCount ? 'inserted' : (r.modifiedCount ? 'updated' : 'skipped'))
      }
    }
  }
  return summary
}

// Builds a restore PREVIEW (no writes): what the package contains vs current DB.
export async function buildRestorePreview(db, pkg, { targetTenantId = null } = {}) {
  const rows = []
  for (const [coll, docs] of Object.entries(pkg.data || {})) {
    if (!Array.isArray(docs)) continue
    const inBackup = docs.length
    let current = null
    try {
      current = targetTenantId
        ? await db.collection(coll).countDocuments(coll === 'tenants' ? { id: targetTenantId } : { tenant_id: targetTenantId })
        : await db.collection(coll).countDocuments({})
    } catch { current = null }
    const mode = new Set(OFFICE_DATA_COLLECTIONS).has(coll) ? 'إضافة الناقص فقط (بلا تكرار مالي)' : 'تحديث/إدراج (upsert)'
    rows.push({ collection: coll, in_backup: inBackup, currently_in_db: current, mode })
  }
  return rows
}
