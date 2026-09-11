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

## v3.88.2 (completed — awaiting user approval before any push/merge)
- PR Blocker 1: tenant_settings is guaranteed ONE doc per tenant — lib/coa.js upsertTenantSettingsDefaults() (upsert + $setOnInsert id) replaces raw insertOne in seedTenantDefaults. Unique index is now created SAFELY via ensureTenantSettingsUniqueIndex(): read-only duplicate audit first; on duplicates → nothing deleted/merged, index NOT created, loud manual_review warning logged.
- PR Blocker 2 (hardened): Full Reset is DENIED BY DEFAULT for any tenant with transactions, in every environment. The ONLY exception is a positively-proven test env: DB name ends in _test/_tests AND ALLOW_DESTRUCTIVE_COA_RESET=true (both required). No longer depends on DISABLE_AUTO_SEED. /coa/rebuild returns Arabic 403; TEST bootstrap auto-migration wrapped so a guard refusal never crashes startup.
- PR Blocker 3: no git remote in workspace — sync of tenent-updates with GitHub main must be done via PR "Update branch" or Save-to-GitHub (reported to user).
- Tests: coa-tests.js scenarios K (single settings doc), L1/L2/L3 (default-deny guard incl. non-_test DB + no env flags), M (duplicate audit blocks index, nothing deleted) → 30/30 PASS on isolated DBs.

## v3.88.3 (completed)
- Equity (حقوق الملكية) added as a selectable account type in the add-account dialog. FE: type option + display maps (byType/typeLabel/typeGrad/typeColor) + equity parents restricted to equity GROUP accounts only (other types' parent filtering unchanged). BE: 5-type whitelist on POST /accounts (equity first-class); parent-type match & hierarchical coding were already generic. No migration/backfill; existing accounts and COA v2 structure untouched. API tests 12/12 + UI screenshots verified.

## v3.88.4 (FIX-ONLY audit round — completed, NOT TESTED per user instruction)
- Accounting integrity: leaf-account posting everywhere (no group postings), refund engine rewritten (kept original JE + linked reversal, no zero-value refunds, cash double-hit fixed), real restore-on-error on edits, partner-share reversal fixed, negative service costs rejected.
- Reports: statement opening/closing balances + unified account matching + business-TZ date filters (string/Date safe); income statement journal-based; profits exclude refunded; year-close per-currency into 3102 with preflight (no 3900, no auto-create).
- Guards: rate bounds (min≤buy≤transfer≤sell≤max), FX deviation ±10% + no negative box, credit_limit≥0, expense voucher requires real COA account, package end≥start.
- Env isolation: publicSiteOrigin() — Test emits Test URLs only (referral/invite/extension), BE referral link host-aware.
- UI: ref-type Arabic labels, dynamic © year, version 3.88.4, chart tree refresh after save/del, no silent account-code rewriting, password field masked + field-specific employee validation.
- NOT executed (approval needed): F-021 platform-fee independent revenue JE (accounting design), P-001 phone E.164 unification, E-001/B-001 server env & mongodump (infra), any migration/backfill/historical reconciliation.
- v3.88.5 (PR#15 review): atomic restore-on-edit (no swallowed errors, replaceOne upsert, loud 500 on restore failure), strict leaf-account resolution before first write (no silent Group fallback — legacy parties get clear re-link error), refund math verified (20k-case simulation, 0 unbalanced), emergent.yml timestamp excluded from working tree.

## Session v3.89 — FIX ONLY (7 نقاط تشغيلية ومحاسبية) — NOT TESTED (بطلب المستخدم)
1. GET /api/accounts/next-code (معاينة كود فرعي، قراءة فقط) + التوليد النهائي الذري عند POST /accounts (code فارغ).
2. زر ➕ داخل شجرة COA (العرضين) يفتح نموذج إضافة حساب فرعي مع تعبئة الأب/النوع/الكود تلقائياً (prefill + autoCode في page.js).
3. منع التكلفة > سعر البيع: roomPricingCostError() في packages POST/PATCH + تحقق tiers في components POST + مرآة FE في save() للباقة. القاعدة: أي فئة سعر بيعها > 0 يجب أن تكون تكلفتها <= البيع (فئات البيع=0 تُتجاهل: رضيع مجاني/وضع direct).
4. createService: beneficiary_name + beneficiary_phone إلزاميان (إنشاء + تعديل) + FE. ملاحظة: تعديل خدمات قديمة بلا اسم/هاتف مستفيد سيطلب تعبئتهما.
5. نجوم (*) للحقول الإلزامية مطابقة للتحقق الفعلي: تذاكر (اسم/تاريخ سفر/هاتف)، تأشيرات (اسم/هاتف)، خدمات (مستفيد/هاتف)، باقات (النوع)، الحجوزات كانت موسومة مسبقاً. + جسر توافق تأشيرات: FE يرسل beneficiary_* بجانب passenger_* (الخادم يتحقق من beneficiary_*).
6. شبكة معراج: حساب عميل موحد "شبكة معراج" (is_meraaj_network=true، leaf تحت 1103 العملاء) يُنشأ lazily عند أول اعتماد (upsert ذري، بدون migration). القيد المالي عند الاعتماد فقط (كان كذلك). Idempotency مزدوج: package_bookings.meraaj_booking_ref + journal_entries.meraaj_booking_ref (عبر opts.extra في createJournalEntry). العملاء القدامى "معراج — مكتب X" لم يُمسّوا.
7. COA v2 محمي: لا تعديل على lib/coa.js أو القوالب؛ next-code قراءة فقط؛ حظر الترحيل على Group Accounts قائم كما هو.
الملفات: app/api/[[...path]]/route.js + app/page.js فقط.

## v3.89.1 — إصلاح 3 Blockers من مراجعة PR #16 (NOT TESTED بطلب المستخدم)
- B1: قيود اعتماد معراج تستخدم الحسابات النهائية cli.account_code وsupplier.account_code (لا 1103/2101 المجمّعة) مع party_id الصحيح؛ حلّ الأكواد قبل أي كتابة مالية.
- B2: زر + يظهر فقط عند node.is_group===true (العرضان) + حارس خادم في POST /accounts وnext-code يرفض أباً غير Group + eligibleParents مجموعات فقط.
- B3: Idempotency متزامنة عبر Claim ذري (findOneAndUpdate على financial_posted بالطلب الوارد — فائز واحد فقط) + Atomicity: balances→JE→booking داخل try/catch بتعويض عكسي كامل (حذف القيد، عكس الأرصدة، تحرير الـClaim) — لا Partial Financial Operation.

## v3.89.2 — تصليب Blocker 3 (مراجعة PR #16 جولة 2) — NOT TESTED بطلب المستخدم
- appliedBalances[]: تتبع كل Balance write منفرداً وعكس ما نجح فقط (لا Boolean واحد).
- تعويض journal_quota.used بـ$inc:-1 (بشرط >0) + حذف القيد بـref_id (يغطي orphan JE).
- Mutex على هوية الطلب meraaj_booking_ref عبر op_locks (_id uniqueness مدمجة — لا Index جديد) + فحوصات التكرار داخل الـMutex + الـClaim على inbound doc باقٍ كحزام. Stale TTL 120s.
- إنشاء حساب "شبكة معراج" داخل Mutex (meraaj_net_client:tenant) + قراءة حتمية sort(created_at:1) + انتظار محدود للخاسر. اقتراح مؤجل بالتقرير: partial unique index على {tenant_id, is_meraaj_network}.
- helpers جديدة: acquireOpLock/releaseOpLock. مجموعة op_locks تُنشأ تلقائياً عند أول استخدام.

## v3.89.3 — Owner Token للأقفال (آخر Blocker بمراجعة PR #16) — NOT TESTED بطلب المستخدم
- acquireOpLock يولّد owner_token (uuid) ويعيده كـhandle (أو null) بدل boolean.
- releaseOpLock يحذف فقط {_id + owner_token} — لا حذف أعمى بالـ_id (يمنع حذف A لقفل B بعد stale-takeover).
- stale cleanup يحذف فقط النسخة المقروءة بالضبط (created_at + owner_token إن وجد) — قفل أحدث لا يُمس.
- طُبق على meraaj_post:* (اكتساب + تحريران) وmeraaj_net_client:* (اكتساب + finally).

## v3.89.4 — F-PR16-001 (QA) — NOT TESTED بطلب المستخدم
- الجذر: تحقق هاتف المستفيد في createService كان يقبل beneficiary_whatsapp كبديل، والواجهة تنسخ أول إدخال هاتف للواتساب — مسح الهاتف يُبقي الواتساب → حفظ بلا هاتف مع أثر مالي.
- الإصلاح: تحقق صارم لـbeneficiary_phone وحده (خادم createService سطر ~8259 + مرآة واجهة). الرفض قبل أي Balance/Journal. يغطي Create وEdit (كل المسارات تمر بـcreateService — insertOne وحيد).
- F-PR16-002: pilgrim_name ليس Required في الخادم (POST /packages/:id/bookings) ولا في addBooking — لا نجمة ولا تغيير حسب التعليمات.

## v3.90 — Super Admin المرحلة 1 (Shell + Dashboard) — NOT TESTED بطلب المستخدم
- قرار AUDIT-002 (بأفضل تقدير بعد تخطي السؤال): اللوحة الجديدة داخل رحّال، تستوعب SuperAdminPanel القديم تدريجياً، وكل /api/admin/* أعيد استخدامها كما هي. اللوحة القديمة متاحة من عنصر "اللوحة الكلاسيكية" (تمرر كـprop legacyPanel) — صفر فقد وظيفي.
- ملفات جديدة معيارية: app/admin/shell.js (Sidebar 13 قسماً + Header + Placeholders بمراحلها) و app/admin/dashboard.js (KPIs قراءة فقط من: /admin/tenants + password-reset-requests + installments-overview + office-verifications — بدون أي API جديد).
- قسم "العروض والإعلانات" يعرض AnnouncementsManager القائم كما هو (prop) — التوسعة بالمرحلة 6.
- تعديل page.js: سطرا استيراد وتوجيه فقط. لا تغيير في route.js إطلاقاً.
- حوكمة: شارة "قراءة فقط مالياً" بالهيدر والشريط الجانبي؛ آلية audit_logs الفعلية تُفعّل مع أول عمليات كتابة (مرحلة 2+).
- المتبقي: المراحل 2–8 حسب خطة المستخدم. AUDIT-001 (3900/3102) مؤجل للتحقق قبل أي تغيير محاسبي.

## v3.91 — Super Admin المرحلة 2 (المكاتب + Office 360°) — NOT TESTED بطلب المستخدم
- API جديد وحيد (مبرر: كل مسارات المكتب تشتق T من الجلسة وsuper_admin بلا جلسة مكتب): GET /admin/tenants/:id/office360?tab= — قراءة فقط، منطقه في lib/admin360.js وسطر تفويض واحد في route.js. أرصدة مخزنة كما هي، لا إعادة حساب.
- توسعة GET /admin/tenants: إرفاق owner {name,email,phone} من استعلام users القائم أصلاً (صفر استعلام إضافي).
- واجهة: app/admin/offices.js (قائمة + بحث + Office360 بـ10 تبويبات lazy-cache) مربوطة في shell.js. Impersonation يعاد استخدامه كما هو. تبويب الاشتراك يعيد استخدام /admin/installments-overview بفلترة أمامية.
- AUDIT-001 (فحص ثابت، بلا إصلاح): الخادم يرحل الإقفال إلى 3102 (RETAINED_EARNINGS ثابت في route.js:67 وlib/coa.js:28؛ تعليق 6939 يؤكد أن 3900 القديم لا وجود له بالشجرة وأُصلح). التضارب نص UI فقط: page.js:5902 و5921 يذكران "3900 الأرباح المدورة" بينما 5979 صحيح (3102). التوصية: توحيد النصين إلى 3102 لاحقاً بموافقة.
- Data Gaps: لا last_login (النشاط مشتق من created_at)؛ الأرباح null (لا endpoint إداري موثوق)؛ القائمة لا تعرض عدد العمليات/COA/معراج (متاحة داخل 360)؛ الفروع = الحد max_branches لا العدد الفعلي؛ backup/export يعتمد جلسة مكتب.
- عمليات تحتاج Audit لاحقاً: tenants POST/PATCH/toggle-status/topup/reset-password/impersonate/confirm-payment، pricing-config PUT، plans PUT، password-reset PATCH، office-verifications PATCH، announcements POST/PUT/DELETE، backup/export، (اختيارياً: قراءات office360).

## v3.92 — ربط حسابات الدليل بالسجلات التشغيلية — NOT TESTED بطلب المستخدم
- الهوية = account_code حصراً (لا الاسم). helper: opLinkMapFor + ensureOperationalLink في route.js.
- POST /accounts تحت 1101/1102/1103/2101 (غير مجموعة): فحص مسبق لتكرار الاسم → إنشاء الحساب → إنشاء السجل التشغيلي (صندوق cash/bank، عميل، مورد) — وعند التعارض تراجع نظيف (حذف الحساب) بلا يتيم.
- PUT /accounts/:id: إعادة التسمية تحافظ على الهوية — مزامنة اسم السجل بالكود + رفض الاسم المكرر. مزامنة عكسية من PUT clients/suppliers إلى accounts.name_ar بالكود.
- DELETE /accounts/:id: حظر حذف حساب مرتبط بسجل تشغيلي.
- /accounts/tree: منع ازدواج العقدة — السجل الذي كوده موجود كمستند accounts يُدمج كـlinked_entity على العقدة (شارة 🔗 بالواجهة).
- الاستيراد (تذاكر+تأشيرات، معاينة+تنفيذ): رفض صريح للأسماء المكررة (عميل/مورد/صندوق) — findStrict limit(2)، لا إنشاء تلقائي لأي طرف.
- اليتامى: GET /accounts/link-audit (قراءة) + POST /accounts/link-repair (مالك فقط، Idempotent، تعارضات الأسماء تُتخطى وتُعرض) + زر "🔗 فحص الربط التشغيلي" وحوار في صفحة الدليل.
- السندات لم تُمس: كانت أصلاً ترحل على الحساب النهائي (partyLeafCode + boxLeafV F-007) — المشكلة كانت غياب السجل التشغيلي فقط.

## v3.92.1 — الحذف الآمن لحساب الدليل — NOT TESTED بطلب المستخدم
- accountUsageCheck(): الاستخدام = تاريخ فعلي (journal_entries بالكود، vouchers.coa_account_code، وللسجل المرتبط: journals بالـparty_id + vouchers + tickets/visas/services + package_bookings + package_components + currency_exchanges بالـrecord id) + حزام رصيد غير صفري. "رصيد=0" لا يسمح بالحذف أبداً.
- DELETE /accounts/:id: نظامي ممنوع؛ مجموعة بأبناء (حسابات أو سجلات تشغيلية تابعة) ممنوعة؛ مستخدم → رسالة "لا يمكن حذف الحساب لأنه مرتبط بعمليات أو قيود مالية. يمكنك إيقاف استخدامه أو تغيير اسمه بدلاً من حذفه."؛ غير مستخدم + مرتبط → حذف متسلسل آمن (السجل + الحساب) بعملية واحدة؛ لا إعادة ترقيم (next_child_seq لا يُمس).
- FE: نص التأكيد "هل أنت متأكد من حذف الحساب؟ لا يمكن التراجع بعد الحذف." + toast يوضح الحذف المتسلسل.

## v3.93 — Super Admin Phase 3 (مبيعات وسندات + محاسبة ورقابة + مركز الصلاحيات) — NOT TESTED بطلب المستخدم
- الباك إند: lib/adminCenter.js (GET فقط — /admin/center/sales, /sales-detail, /vouchers, /accounting/*) وlib/adminPerms.js (/admin/perms/users, /user-preview, /roles CRUD مخصص فقط, /audit) مربوطة بـroute.js تحت حارس super_admin.
- الواجهة: app/admin/sales.js (تبويبا مبيعات/سندات، فلاتر مكتب/نوع/حالة/عملة/دفع/تاريخ، تفاصيل قراءة فقط)، app/admin/accounting.js، app/admin/perms.js (أدوار: مدمج غير قابل للتعديل + مخصص بسبب إلزامي مسجل في audit_logs، مستخدمون قراءة فقط مع معاينة الصلاحيات الفعّالة والمصدر، سجل تدقيق).
- shell.js: تفعيل تبويبات sales/vouchers/accounting/permissions (ready) مع key لإجبار remount بين المبيعات والسندات (initialTab).
- الحوكمة: كل الشاشات المالية قراءة فقط صارمة — لا أزرار إنشاء/تعديل سندات أو قيود. القوالب المخصصة المفعّلة تندمج تلقائياً في /api/rbac/templates (محرك واحد). تعديل قالب لا يسري على المستخدمين الحاليين إلا بإعادة الإسناد.
- Data gap موثق: last_login غير متتبع بالنظام — يظهر null.

## v3.94 — Super Admin Batch 2 (مركز العمولات + مركز الطلبات + العروض والإعلانات) — NOT TESTED بطلب المستخدم
- lib/adminCommissions.js (GET فقط — /admin/commissions/overview,list,detail,rules): يقرأ عمولات الشركاء المخزنة (commission_share_* على tickets/visas/services/package_bookings)، عمولات معراج (agent_commission_total على meraaj_inbound_bookings)، والأفلييت (tenants.affiliate + cashout_requests). لا محرك ثانٍ، لا إعادة احتساب، القاعدة Snapshot على العملية. عمولات الموظفين غير موجودة بالنظام (فجوة موثقة). الثوابت تمرر من route (AFFILIATE_*).
- lib/adminRequests.js (GET فقط — /admin/requests/overview,list,detail): نافذة موحدة على meraaj_inbound_bookings (+cancellation_status)، password_reset_requests، cashout_requests، refunds، tenant_settings.office_verification. حالة موحدة للعرض فقط + needs_action + متأخر >48h. كل إجراءات الكتابة بقيت بمساراتها القائمة (نقاط قرار موثقة: اعتماد معراج، معالجة السحب غير المنفذة أصلاً، قرارات التوثيق واستعادة كلمات المرور في اللوحة الكلاسيكية).
- lib/adminAds.js: وسّع /admin/announcements في نفس المجموعة والمسارات — أنواع (popup/banner/offer/maintenance/notice)، status (draft/active/paused/cancelled) + display_status محسوب (live/scheduled/expired)، priority، placement، cta_text، audience (all/tenants/plan/sub_status) مطبق من الخادم في /announcements/active (activeAnnouncementsFor — legacy docs بلا audience تظهر للجميع)، published_at، منع حذف المنشور (إلغاء فقط)، نسخ كمسودة، سبب إلزامي للإلغاء وللتعديل بعد النشر، audit_logs category 'announcements'. توافق خلفي: GET يعيد Array للمدير القديم (extended=1 يعيد {rows,counts})، وPUT {active} من المدير القديم يحوَّل active/paused.
- الواجهات: app/admin/commissions.js، app/admin/requests.js، app/admin/ads.js — مربوطة في shell.js (قسما commissions/requests جديدان بأيقونتي BadgePercent/Inbox، وقسم ads يعرض AdminAdsCenter بدل المدير القديم المدمج — المدير القديم باقٍ في اللوحة الكلاسيكية).
- حقول جديدة على announcements فقط: status, placement, priority, audience, cta_text, maintenance, published_at, updated_by (defaults تحفظ التوافق — لا migration). لا Collections جديدة (إعادة استخدام audit_logs). لا Indexes جديدة.
- استهداف الدولة غير متاح (لا حقل دولة على المكاتب) — موثق. واجهة المكاتب تعرض popup/banner فقط حالياً؛ الأنواع الجديدة تُسلَّم عبر نفس API (عرضها بواجهة المكاتب مرحلة لاحقة).

## v3.95 — Super Admin Batch 3 (نسخ احتياطي وإدارة نظام + تدقيق/صحة + إشعارات) — NOT TESTED بطلب المستخدم
- lib/adminSystem.js (/admin/system/*): سجل نسخ admin_backups + محتوى admin_backup_blobs (≤8MB) — الأنواع الفعلية: tenant_export (نفس قائمة مجموعات /backup/export الـ13 + tenant_settings) وsystem_settings؛ Full/DB Backup غير متاحين (نقاط قرار معروضة بصدق). إنشاء بسبب إلزامي + منع تكرار (running خلال 3 دقائق) + تنزيل مسجل بالـAudit. Retention في platform_settings (backup_retention) عرض فقط — التنظيف التلقائي غير مفعّل. مسار استعادة admin_restore_requests: validate→preview (أثر لكل مجموعة: بالنسخة/بالقاعدة)→approve (تأكيد كتابي «أؤكد الاستعادة» + Maker-Checker إذا وُجد أدمن آخر)→reject؛ execute معطّل صلبياً (423) بالتصميم. منع استعادة نسخة مكتب لمكتب آخر من الخادم. status/environment/integrations (مفاتيح كوجود فقط، بيئة من NEXT_PUBLIC_BASE_URL: rahaal-test→Test/emergent→Preview/غيره Live، إصدارات الكود غير المتطابقة 3.88.4/3.9.28/3.9.20 تُعرض كما هي). Maintenance config في platform_settings (maintenance_mode) — الإنفاذ غير موصول عمداً (نقطة قرار)، تأكيد كتابي «تفعيل الصيانة» + Maker-Checker على Live.
- lib/adminAudit.js (/admin/audit/* — GET فقط، 405 لغيره): دمج audit_logs + je_audit + document_audit بصف موحد + فلاتر + تفاصيل بإخفاء تلقائي للحقول الحساسة (pass/secret/token/hash/key) + فجوات موثقة (لا IP/UA/success/correlation، عمليات tenants التاريخية غير مسجلة). systemHealth: db ping/dbStats/backup/معراج (أخطاء 24س)/jobs غير معروف/تطابق الإصدارات (تحذير حقيقي لعدم التطابق) — «غير معروف» بدل نجاح وهمي.
- lib/adminNotify.js (/admin/notify/*): أول نظام إشعارات — admin_notifications (مخزنة، تُطلق فقط من تدفقات Batch 3: backup done/failed، restore_request، maintenance_change، settings_change) بمفتاح dedupe_key + read_by/archived_by لكل مستخدم + handled. Feed مشتق لحظي من adminRequestsHandler overview + أخطاء معراج (لا تخزين). إعدادات admin_notification_settings لكل نوع (كتالوج NOTIFICATION_TYPES بوسم wired: true/derived/false بصدق) — تعديل بسبب + Audit. القناة In-App فقط؛ SMS/Push/Email غير منفذة. فشل الإشعار لا يكسر العملية الأصلية أبداً.
- الواجهات: app/admin/backup.js, system.js, audit.js, health.js, notifications.js — مربوطة في shell.js (5 تبويبات ready). route.js: 3 استيرادات + كتلة تفويض واحدة (/admin/system|audit|notify) مع ctx حقيقي.
- Collections جديدة: admin_backups, admin_backup_blobs, admin_restore_requests, admin_notifications, admin_notification_settings + مستندا platform_settings (backup_retention, maintenance_mode). لا Indexes، لا Migration، لا مساس بالبيانات القائمة.
