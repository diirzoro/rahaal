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
