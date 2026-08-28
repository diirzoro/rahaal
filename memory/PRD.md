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

## v3.54 (completed) — Meraaj booking notification chime
- playMeraajChime() module helper (Web Audio API, two-tone 880Hz→1174Hz sine chime, ~0.5s, no external file, cached AudioContext, silent fallback if autoplay blocked).
- Poll logic refined with meraajInitRef: first poll after login → reminder toast only (NO sound); subsequent count INCREASE → toast + chime. Verified: audio API path ok, 0 console errors.
- Deferred by user: activity log, per-age profit report, webhook health panel.

## v3.53 (completed) — Per-age costs/commissions + auto-sync + notifications + auto-approve
- Room pricing rows: cost_adult/cost_child/cost_infant (nullable, sanitized). Form shows a rose costs sub-row per room (owner/show_profit only) with live per-category profit hints.
- Per-age commission: computeMeraajMarketPricing(rows, mode, value, direction, childValue, infantValue) — empty = same as adult; all 4 call sites pass meraaj.buyer_commission_child_value/infant_value; share endpoint accepts+stores them; share dialog has 🧒/👶 inputs with live per-age preview.
- Auto-sync: verified existing — PATCH room_pricing/commission recomputes market_pricing + emits package.updated; components/transports/image also emit. Manual resync button remains as bulk fallback.
- Notification bell: GET /meraaj/inbound-count (mod_meraaj guarded); TenantApp polls 60s, fixed amber bell top-left with pending count → click opens Meraaj tab; toast on new arrivals.
- Auto-approve: approveMeraajInboundBooking() extracted (shared engine); webhook auto-approves when tenant_settings.meraaj_auto_approve (failure → stays pending, webhook still 200, response auto_approved flag). POST /meraaj/settings (owner only) + config.auto_approve + Switch UI in Meraaj screen with confirm dialog.
- Tested 8/8 backend (key: commission.adult=100/child=50/infant=0, fallback child→adult, auto-approve E2E with balanced JE 1700=1700) + UI screenshots.

## v3.52 (completed) — Meraaj booking sync visibility fix
- Root cause of "3 seats booked but 0 registrants": the design requires manual approval (v3.26) and pending inbound bookings were INVISIBLE outside the Meraaj screen's inbound tab. Registrant data itself was always received/stored correctly (verified E2E).
- New: GET /packages returns meraaj_pending_seats/meraaj_pending_count; GET /packages/:id/inbound-bookings (package-scoped, works with mod_packages only); rejected webhooks (bad HMAC) now logged in meraaj_webhook_log {ok:false, reason:'invalid_signature', body_head} for LIVE delivery diagnosis.
- FE: amber pulse badge on package card ("N مقعد من معراج بانتظار الاعتماد"), registrants tab shows pending Meraaj bookings with ALL registrant names/categories/rooms + one-click "اعتماد وإظهار المسجلين" (mod_meraaj/owner; others see waiting note), +N badge on tab title.
- Tested 9/9 E2E: signed webhook → immediate visibility → approve → names in bookings; invalid signature 401 + logged; idempotent duplicates.
- LIVE diagnosis guidance: if bookings still missing on LIVE, check meraaj_webhook_log (secret mismatch) and meraaj_inbound_bookings.

## v3.51 (completed) — Supplier on page 1 + tab rename + RBAC Phase 3
- Package form page 1: supplier SearchPick (f.supplier_id, saved in one shot via POST/PATCH; internal field — NOT in Meraaj payload, verified). Card button renamed "المكونات والتسجيل" → "التسجيل والمواصلات".
- RBAC Phase 3: new perms fin_statements / fin_partner_summary (accountant template both, sales_manager partner only). allowed_box_ids per user (empty = all): GET /boxes filtered for restricted staff (server-enforced), POST /vouchers + cash booking box guard 403, discount>0 requires owner/apply_discount 403. Route guards: /reports/statement + /bulk-statement/generate → fin_statements; /partners/statements → fin_partner_summary. FE: ReportsScreen statement tab hidden, packages كشف الشريك gated by fin_partner_summary, PermissionsDialog boxes multi-select (name_ar labels) + 2 new keys in التقارير group.
- Tested 7/7 backend + UI screenshots (supplier field, renamed buttons 15/0, boxes UI). Box docs use name_ar (not name).

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

## v3.80 — Future Document/Accounting Date Rule (2026-08)
- RULE: document/accounting dates can NEVER be in the future (date-only, UTC+3 business timezone). Arabic error: «لا يمكن أن يكون تاريخ المستند بعد تاريخ اليوم».
- Backend guards (route.js): top of createTicket/createVisa/createService/createVoucher/createFx/createManualJournal (covers POST + PUT since PUT re-creates; PUT has v3.78 restore-on-error). EARLY guards: bulk-edit (before destructive loop) + PUT /journal-entries/:id (no restore mechanism there). Visa-monitor visa_issue_date guarded on create/update/import.
- NOT restricted (intentionally): travel_date, entry_date, exit_date, visa expiry, package start/end, max_exit_date.
- Frontend (page.js): DocDateInput component (max=todayISO + toast) used ONLY on issue/voucher/journal/bulk-change date fields (10 sites).
- Backend-tested: 7/7 core cases passed. Known PRE-EXISTING issue (not v3.80): tickets bulk-edit newBody omits passenger_phone → ticket bulk edits fail with «رقم الجوال مطلوب».

## v3.81 — Document Viewer Restore + v3.80b Bulk-edit Fix (2026-08)
- GET /api/document-proxy/:docId (tenant-authed): same-origin streaming of booking_documents — local via docStorageGet, external_url via server fetch (15s timeout, 20MB cap). Audit 'viewed' via proxy/proxy_external. Backend-tested 6/6.
- FE: bookingDocUrl helper + DocViewer professional viewer (img/PDF preview, print via hidden iframe, download, open-in-tab, prev/next) wired in: booking docs dialog, cancellation evidence links, office verification docs. Multi-file upload: selectBookingDocs + docPendingFiles + docUploadProgress bar (sequential, per-file validation). Docs dialog scroll unchanged (max-h-[85vh] overflow-y-auto).
- v3.80b: bulk-edit newBody now copies passenger_phone/whatsapp/phone AND beneficiary_name/phone/whatsapp with fallback beneficiary_* || passenger_* (visas VALIDATE beneficiary_* but STORE passenger_*). Tickets + visas bulk-edit both verified working; future-date rejection intact.

## v3.82 — Unified Upload Policy: 20MB per file + Multiple Upload (2026-08)
- DOC_MAX_BYTES 4MB → 20MB PER SINGLE FILE (not per batch). Arabic reject msg: «حجم الملف يتجاوز الحد (20MB)». Transport verified: ingress accepts ~27MB JSON bodies.
- CHUNKED BLOB STORAGE (document_blobs): base64 > 10MB chars split into parts {object_key: key::partN, parent_key, part_index}; main doc keeps {chunks:N, content_type, size} without data. Get reassembles (incomplete → null); Delete removes parts. Small files unchanged (single doc, backward compatible).
- FIX: base64 regex validation now runs in 1MB slices — RegExp.test on one 20MB string overflows V8 call stack.
- FE DOC_MAX_MB=20 constant. MULTIPLE upload now at: office verification docs (new), cancellation evidence per service (new), booking traveler docs (was already multiple in v3.81). All with per-file validation + Arabic per-file errors + summary toast. Preview via existing DocViewer (already wired v3.81).
- NOT converted (by design, reported to user): package image (client-side compressed single thumbnail), tenant logo (700KB, stored inline in tenant_settings — 20MB would bloat the settings doc), Excel/CSV import inputs (client-side parsing, not server uploads).
- Direct verification (no test agent): 15MB upload OK + chunks=2 reassembled exactly via document-proxy, 21MB rejected 400, small file single-doc, delete removes parts, zero residue.

## v3.83 — Upload size policy aligned with Meraaj (2026-08)
- 10MB PER SINGLE FILE (backend DOC_MAX_BYTES + FE DOC_MAX_FILE_BYTES) — BE msg «حجم الملف يتجاوز الحد (10MB)», FE per-file msg «الحد الأقصى 10MB لكل ملف».
- 20MB PER SELECTED BATCH — FE-enforced (each file is its own request) via shared validateDocBatch() used by all 3 multi-upload points (office verification, cancellation evidence, booking docs). Batch msg: «إجمالي حجم الملفات يجب ألا يتجاوز 20MB».
- Chunked blob storage kept (base64 of 10MB ≈ 13.3MB chars > 10MB chunk threshold → still split, BSON-safe).
- Direct verification: BE 11MB→400/9MB→200; FE logic 24MB batch rejected w/ exact msg, 18MB allowed, 11MB per-file msg. Zero residue.

## v3.84 — Batch size meter (staged upload) (2026-08)
- New shared FE component DocBatchUpload (page.js): files are STAGED before upload with per-file validation (type + 10MB), duplicate skip, and live 20MB batch budget meter (progress bar amber >90%, «الإجمالي: X من 20MB» / «المتبقي: Y MB»), per-file remove ✕, «رفع الآن (N)» + «مسح». Adding a file that would exceed the batch shows «إجمالي حجم الملفات يجب ألا يتجاوز 20MB — المتبقي …».
- Wired at all 3 multi-upload points: office verification (button variant), booking traveler docs (button), cancellation evidence (link variant, respects evidence<10 + posBusy). Upload handlers unchanged (still validateDocBatch + sequential POSTs).
- Visually verified via Playwright: staged 2.5MB+1.2MB → meter showed 3.7/20MB, remaining 16.3MB, upload/clear buttons present. No real upload performed.
