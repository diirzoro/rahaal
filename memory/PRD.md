# Rahaal (رحّال) — Multi-Currency Travel Office ERP & SaaS — PRD Summary

## Core Product
Next.js 15 monolith + MongoDB. Arabic RTL ERP for travel offices: tickets, visas, services, packages, accounting (double-entry), multi-tenant SaaS, Meraaj Network B2B marketplace integration (Contract v2, HMAC webhooks, bidirectional sync).

## Architecture Constraints (USER MANDATED)
- NO refactoring/splitting of `/app/app/page.js` or `/app/app/api/[[...path]]/route.js`
- NO database schema renames, NO hard deletes
- Meraaj payload (`meraajContractPayload`) and HMAC signing are FROZEN — do not touch
- Communicate with user in Arabic

## Completed (latest first)
- v3.41: All 43 browser-native `confirm()`/`prompt()` calls replaced with professional in-app `askConfirm()` promise-based dialog (global `ConfirmHost` mounted in App root; supports danger/primary variants, icons, irreversible warning, input/prompt mode with required+textarea). Verified visually (duplicate + archive dialogs).
- v3.40: Hotel nights + city tracking with duration summary
- v3.39: Unified pricing + SearchPick smart dropdowns with inline client/supplier creation
- v3.29–v3.38: Full Meraaj integration (first share REST, HMAC webhooks, Contract v2 payload, bidirectional reflection, lifecycle ID sync)
- Mini CRM, archive panel, production cleanup

## Pending
- Meraaj E2E 15/15 test (blocked on Meraaj team configuring temp secret)
- Package Comparison feature (deferred by user)

## v3.50 (completed) — Batch Re-sync + RBAC Phase 2
- POST /api/meraaj/resync-all (owner only; endpoint lives in tenant-scoped section — test agent moved it there after a T-scope bug): recomputes meraaj.market_pricing fresh from room_pricing + stored commission for ALL shared non-archived packages, persists + market_pricing_updated_at, emits package.updated each. Returns {total, synced, failed}. FE button "🔄 تحديث كل الباقات في معراج" in MeraajStoreScreen TopBar (owner only, askConfirm + result toast).
- RBAC Phase 2 (hide financials from staff without show_profit): PackageDetailsDialog — components & transports tabs hidden (default tab=bookings), header cost/profit line replaced with sale-only; discount section in booking form gated by apply_discount; PkgCard معراج share button gated; MeraajStoreScreen commission column ("عمولة الوكيل") hidden + approve-confirm net amount text hidden.
- Tested: backend 7/7 (stale 'قديم' pricing replaced, events emitted, staff 403, counts match). UI verified: staff sees only المسجلون tab + sale price, no معراج/تقرير/خصم; owner sees resync button + commission column.

## v3.49 (completed) — NaN/zero-price fix + Hotels details
- Root cause of Meraaj NaN/zeros: (a) contract payload used stored meraaj.market_pricing which could be EMPTY/stale → now meraajContractPayload recomputes live from room_pricing + stored commission when empty (marketRows fallback); (b) meraajPackagePayload sent raw sale_child/sale_infant nulls → now resolved (child→adult, infant→0). Same payload structures — values only.
- hotels field on packages: sanitizeHotels (max 10, name<=80, city<=40, nights 0-60) + POST/PATCH support. Contract hotels[] (string names) merges component hotels + package hotels (deduped).
- FE: form section "🏨 تفاصيل الفنادق والليالي" (quick-add Makkah/Madinah buttons, name/city/nights rows, nights-vs-duration summary), completeness note under room pricing, showcase dialog hotels cards, WhatsApp message hotel lines.
- Tested 5/5 via agent (critical test: empty market_pricing + null child/infant → payload fully numeric, correct commission math, hotels merged). Form UI verified via screenshot.

## v3.48 (completed) — Full responsive audit & fixes
- Central fixes: shared DialogContent now max-h-[92vh] + overflow-y-auto + rounded-lg (all 48 dialogs fit any viewport with internal scroll); TopBar flex-wrap + min-w-0 + responsive title sizes (action buttons wrap on narrow screens).
- Existing foundations kept: sidebar icon-rail w-16 on mobile / w-64 md+, main overflow-x-hidden min-w-0, globals.css v3.9.5 (tables horizontal scroll, tablist scroll, dialog 96vw mobile).
- Audited via emulation: 320x640, 360x800, 1920x1080. ALL 20 sidebar tabs = 0 horizontal overflow at 360px. Login/landing/dashboard/packages/tickets/receipt/boxes/reports/settings/meraaj verified visually. Package form dialog (345x736), voucher dialog, showcase dialog (with image + pricing table) all fit viewport. Desktop 1920 layout intact. RTL/Arabic wrapping correct.
- Note: GitHub push must be done by the user via "Save to GitHub" in the chat UI (agent does not perform git write actions).

## v3.47 (completed) — Automatic image optimization
- POST /api/packages/:id/image now optimizes ONCE at upload via sharp@0.34.5 (pinned in package.json): EXIF auto-rotate, resize fit:'inside' max 1200px longest side (aspect preserved, withoutEnlargement), WebP q82 (constants IMG_MAX_DIM/IMG_WEBP_QUALITY at top of route.js). package_images doc stores content_type='image/webp' + width/height/original_bytes/optimized_bytes. Serve endpoints & Meraaj contract untouched (content_type read from doc; public URL unchanged).
- FE: PkgCard displays the image (when has_image) in aspect-[16/9] + object-cover block above card content, lazy-loaded, hides on error.
- Tested 9/9 via agent: 3000x2000→1200x800 (97.6% smaller), portrait 1500x3000→600x1200, small 400x300 not enlarged, WebP RIFF signature, invalid input 400s, meraaj package.updated images URL intact. UI verified desktop + mobile screenshots.

## v3.46 (completed) — Idle Auto-Lock + Hard Refresh behavior
- IDLE_TIMEOUT_MINUTES=15 (centralized const in page.js near NAV) + IDLE_RESUME_KEY sessionStorage key.
- TenantApp: activity listeners (mousedown/keydown/scroll/touchstart/mousemove throttled 5s) arm a timer; on expiry: save current tab to sessionStorage key, toast, then EXISTING logout() (same as manual). Resume effect on mount consumes the key once and restores the tab (validated via canModule).
- App: if logged out and resume key present → publicView='login' directly (skip landing).
- Hard refresh naturally lands on Dashboard (tab is in-memory useState only; no persistence was ever added) — resume key is written ONLY at idle logout, keeping behaviors strictly separate.
- Tested via browser automation: refresh→dashboard ✓, idle-path logout→login page ✓, re-login→exact section restored + key consumed ✓, normal nav intact ✓. No DB/API/Meraaj changes.

## v3.45 (completed) — RBAC Phase 1
- DEFAULT_STAFF_PERMISSIONS extended with 19 mod_* module keys (financial modules default OFF for staff). RBAC_ROLE_TEMPLATES(): registrar/sales/sales_manager/accountant/full_manager. GET /api/rbac/templates (owner-only). Server-side module guard after session check (staff only; shared lookups /clients /suppliers /boxes /accounts intentionally open). role_key on user (PATCH /tenant/users/:id, sanitizeUser, users list).
- FE: MODULE_LABELS + canModule(); Sidebar filtered per employee; TenantApp tab guard + auto-redirect to first allowed module; PermissionsDialog upgraded with role-template picker + modules group; PackagesScreen profit gating via show_profit (top-profit KPI, مقارنة الربحية, كشف الشريك, التقرير button hidden).
- Fixed latent Mongo connect race (cached connect promise) that caused intermittent 500s.
- Tested: backend 9/9 via test agent (staff.rbac@demo.com / Staff@2025 created as registrar, saved in test_credentials.md), UI verified via screenshots (staff sees 4 sidebar items, no profit UI; owner dialog shows templates + modules).
- Phase 2 (upcoming): granular in-page hiding (package tabs costs/components/transports for registrar, Meraaj commission columns, dashboard profit KPIs). Phase 3: per-box financial restrictions, statements/partner summary/auto-journal blocking, smart discount restriction (apply_discount key exists).

## v3.44 (completed)
- GLOBAL modal protection in /app/components/ui/dialog.jsx (single shared DialogContent → covers all 48 dialogs): backdrop/outside click NEVER closes dialogs; typing marks dialog dirty; closing via X or Esc with typed data triggers a professional "إغلاق وتجاهل البيانات؟" confirmation (via globalThis.__rahaalConfirmDiscard installed by ConfirmHost). ConfirmDialog itself opts out via disableDirtyGuard prop. Verified E2E via screenshots (7/7 steps).

## v3.43 (completed)
- Self-service Meraaj store activation: POST /api/meraaj/activate (tenant-authed, idempotent, upserts tenant_settings.meraaj_store {active, activated_at, activated_by}, best-effort 'office.store_activated' outbox event — non-blocking). GET /api/meraaj/config returns store_active + store_activated_at.
- MeraajStoreScreen: prominent "🚀 تفعيل المتجر والاشتراك الآن" button (askConfirm dialog) → green activated banner + "✅ المتجر مفعّل" badge; iframe now gated on store_url AND store_active. Backend-tested 6/6, UI verified via screenshots. Demo tenant is activated.

## v3.42 (completed)
- Fixed LIVE bug: `package.updated` sent `images: []` despite `has_image=true` because NEXT_PUBLIC_BASE_URL was empty at runtime.
- `rahaalPublicBase()` in route.js: RAHAAL_PUBLIC_BASE_URL (new optional env) → NEXT_PUBLIC_BASE_URL → cached live request origin (x-forwarded-host). Loud console.error if unresolvable (never silent).
- Backend-tested: image URL present when has_image=true, [] when not; deactivated/updated events + identity fields intact.

## Test Credentials
See /app/memory/test_credentials.md
