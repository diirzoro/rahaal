# وثيقة تكامل نظام رحّال مع معراج نتورك
## Rahaal ERP ↔ Meraaj Network — Integration API Documentation (v1.0)

> **الحالة:** نموذج أولي عامل (Working Prototype) مطبّق بالكامل في رحّال — جاهز للربط الفعلي.
> **Base URL:** `{RAHAAL_BASE_URL}/api`
> **المفتاح المشترك:** `MERAAJ_SHARED_SECRET` (يُتبادل بين الفريقين بقناة آمنة — 64 hex chars)
> **التوقيع:** جميع الاتصالات S2S مؤمّنة بـ **HMAC-SHA256** (hex lowercase)

---

## 1) المصادقة الموحدة (SSO)

### كيف تعمل
1. المستخدم داخل رحّال يفتح تبويب "متجر معراج".
2. واجهة رحّال تستدعي `POST /api/meraaj/sso-token` (بجلسة رحّال).
3. رحّال يُصدر توكن موقّعاً، ويُفتح الـ Iframe: `{MERAAJ_STORE_URL}?sso={token}`.
4. خادم معراج يتحقق من التوقيع بالمفتاح المشترك ويُنشئ جلسته الخاصة.

### شكل التوكن
```
token = base64url(payload_json) + "." + HMAC_SHA256(base64url(payload_json), SHARED_SECRET)
```
```json
{
  "iss": "rahaal-erp",
  "aud": "meraaj-network",
  "tenant_id": "uuid-المكتب",
  "office_name": "مكتب النور للسفريات",
  "email": "owner@office.com",
  "role": "owner",
  "iat": 1766222000,
  "exp": 1766222300
}
```
- **الصلاحية:** 300 ثانية. ارفضوا أي توكن `exp` منتهٍ أو توقيعه غير مطابق (قارنوا بـ timing-safe compare).

---

## 2) سحب البيانات من رحّال (S2S — يستدعيها خادم معراج)

### توقيع طلبات GET
Headers مطلوبة:
| Header | القيمة |
|---|---|
| `x-meraaj-timestamp` | Unix seconds (يُرفض إن تجاوز فارقه 300 ثانية) |
| `x-meraaj-signature` | `HMAC_SHA256("{timestamp}.{path}", SHARED_SECRET)` — الـ path يبدأ بـ `/meraaj/...` بدون `/api` |

مثال: `GET /api/meraaj/office/abc-123` → توقيع النص: `1766222000./meraaj/office/abc-123`

### 2.1 بيانات المكتب
`GET /api/meraaj/office/{tenant_id}`
```json
{ "tenant_id": "...", "office_name": "...", "phone": "...", "address": "...", "email": "...", "status": "active" }
```

### 2.2 بيانات الباكج (المُشارَك فقط)
`GET /api/meraaj/packages/{package_ref}` — يرجع 403 إن لم يكن مُشارَكاً.
```json
{
  "package_ref": "uuid", "tenant_id": "uuid",
  "name": "عمرة رجب 2026", "package_type": "umrah", "currency": "SAR",
  "start_date": "...", "end_date": "...", "notes": "...",
  "features": ["🧳 شنطة سفر", "🕋 قريب من الحرم", "🤍 إحرام"],
  "has_image": true, "image_url": "/api/meraaj/packages/{ref}/image",
  "pricing_mode": "direct",
  "room_pricing": [{ "type": "ثنائي", "sale_per_pax": 1500, "sale_child": 1100, "sale_infant": 100 }],
  "status": "open",
  "meraaj": {
    "shared": true,
    "pricing_source": "auto_room_pricing",
    "buyer_commission_mode": "amount",
    "buyer_commission_value": 100,
    "commission_direction": "deducted",
    "market_pricing": [
      {
        "room_type": "ثنائي",
        "base":       { "adult": 1500, "child": 1100, "infant": 100 },
        "commission": { "adult": 100,  "child": 100,  "infant": 100 },
        "customer":   { "adult": 1500, "child": 1100, "infant": 100 },
        "net":        { "adult": 1400, "child": 1000, "infant": 0 }
      }
    ],
    "seats_allocated": 40, "seats_sold": 6, "seats_available": 34,
    "shared_at": "..."
  },
  "components": [{ "name": "فندق", "component_type": "hotel", "pricing_type": "room_age" }]
}
```

### 2.3 صورة الباكج
`GET /api/meraaj/packages/{ref}/image` — نفس توقيع GET. يرجع **Binary** (`image/jpeg|png|webp`).

---

## 3) المشاركة الأولى (v3.29/v3.30) — REST مباشر وليس Webhook

- **عند أول مشاركة لباكج**، يستدعي رحّال مباشرة:
  `POST {MERAAJ_API_BASE_URL}/api/integrations/rahal/packages/share`
- **التوثيق:** Header `X-Rahal-Api-Key = SHARED_SECRET`.
- **شرط النجاح:** استجابة 2xx فقط — أي فشل يُلغي المشاركة محلياً (rollback) ويُعرض للموظف.
- **منع التكرار:** بعد النجاح تُحفظ `meraaj.registered_at` و `meraaj.remote_id` — لا يتكرر الاستدعاء أبداً.
- **Body (عقد موحّد):**
```json
{
  "package_ref": "uuid", "title": "...", "description": "...",
  "departure_date": "...", "return_date": "...",
  "departure_city": null, "transport": null, "hotels": ["..."], "images": ["..."],
  "available_seats": 10, "office_ref": "tenant-uuid", "office_name": "...", "owner_name": "...",
  "pricing": { "net_cost_per_seat": 0, "final_sale_price": 0, "buyer_office_commission": 0, "currency": "SAR" }
}
```
- **تطابق الأسماء:** رحّال `name→title`, `notes→description`, `start_date→departure_date`, `end_date→return_date`.
- ⛔ **حدث `package.shared` أُلغي نهائياً** — لا يُرسل ولا يُسجّل كـ Webhook بعد الآن.

---

## 3.1) Webhooks صادرة من رحّال → معراج (الأحداث اللاحقة فقط)

- **الوجهة:** `{MERAAJ_API_BASE_URL}/api/integrations/rahal/webhooks` (أو `MERAAJ_WEBHOOK_URL` إن ضُبط صراحة).
- **النمط:** Outbox — كل حدث يُحفظ محلياً ثم يُرسل؛ إن تعطل خادمكم يبقى بحالة `pending/failed` ولا يضيع.
- **التوقيع (v3.30):** Header وحيد: `X-Rahal-Signature = HMAC_SHA256(raw_JSON_body, SHARED_SECRET)`.
  ⛔ الهيدرات القديمة `x-rahaal-signature` و `x-rahaal-timestamp` أُلغيت — لم تعد جزءاً من العقد.
- **الغلاف الموحد:**
```json
{ "id": "uuid-الحدث", "type": "inventory.updated", "timestamp": 1766222000, "data": { } }
```
- استخدموا `id` لمنع التكرار (Idempotency)، وردّوا بـ HTTP 2xx للتأكيد.

### الأنواع
| Type | متى يُرسل | data |
|---|---|---|
| `inventory.updated` | أي حجز/تعديل/حذف يمس باكج مُشارَكاً | `{ package_ref, status, seats_allocated, seats_sold, seats_available, internal_bookings, final_price, currency }` |
| `package.updated` | تعديل بيانات/أسعار/إعدادات مشاركة باكج مسجّل | **عقد المشاركة الموحّد** نفسه (بنية القسم 3: title/description/departure_date/return_date/pricing...) |
| `package.deactivated` | إيقاف المشاركة أو إغلاق الباكج أو **حذفه/أرشفته محلياً** (يُرسل قبل الحذف المحلي) | `{ package_ref, reason: "unshared_by_office" \| "closed_by_office" \| "deleted_by_office" \| "archived_by_office" }` |
| `booking.approved` (v3.27) | اعتماد المكتب للحجز الوارد وتحويله لحجز محاسبي | `{ booking_ref, package_ref, inbound_id, buyer_office_name, seats, pax:{adults,children,infants}, net_to_seller_total, currency, approved_at }` |
| `booking.rejected` (v3.27) | رفض المكتب للحجز الوارد (مع إعادة المقاعد للسوق) | `{ booking_ref, package_ref, inbound_id, buyer_office_name, reason, released_seats, rejected_at }` — اعرضوا `reason` للمشتري |

---

## 4) Webhooks واردة من معراج → رحّال

`POST /api/meraaj/webhooks`
- **التوقيع (إلزامي):** Header `x-meraaj-signature = HMAC_SHA256(raw_body, SHARED_SECRET)` — توقيع غير صالح → 401.
- **Idempotency:** أرسلوا `id` فريداً لكل حدث؛ التكرار يُرد عليه `{received:true, duplicate:true}` دون تنفيذ.

### 4.1 حجز جديد
```json
{
  "id": "evt-uuid",
  "type": "meraaj.booking.created",
  "data": {
    "package_ref": "uuid",
    "booking_ref": "MRJ-2026-0001",
    "buyer_office_name": "مكتب المسافر - جدة",
    "registrants": [
      { "name": "أحمد محمد", "passport_no": "A1234567", "age": 35, "room_type": "ثنائي" },
      { "name": "طفل أحمد", "passport_no": "A7654321", "age": 8, "room_type": "ثنائي" }
    ],
    "total_price": 2850, "currency": "SAR"
  }
}
```
- **سلوك رحّال (v3.25 — تسعير عمري آلي):** تحقق التوقيع → **حساب سعر كل مسافر آلياً** من جدول `market_pricing` حسب (نوع الغرفة × الفئة العمرية: بالغ 12+ / طفل 2-11 / رضيع <2) → نوع غرفة غير معروف يُرفض 400 → المقاعد المستهلكة = البالغون + الأطفال فقط (الرضّع لا يشغلون مقاعد) → نفدت المقاعد؟ **409** → تسجيل الحجز الوارد بالتفصيل (`pax_adults/children/infants`، `total_price` المحسوب، `agent_commission_total`، `net_to_seller_total`، ومطابقة `sent_total` إن أُرسل: `price_check: match|mismatch`) → خصم المقاعد → بث `inventory.updated`.
- **الرد:** `{ received: true, inbound_booking: {...}, seats_remaining: N }`
- **مهم لواجهة معراج:** اعرضوا للمشتري حقول عدد (بالغين/أطفال/رضع) لكل نوع غرفة، واحسبوا السعر من `market_pricing.customer` — رحّال سيتحقق ويحسب من جهته على أي حال (المصدر الموثوق).

### 4.2 إلغاء حجز
```json
{ "id": "evt-uuid", "type": "meraaj.booking.cancelled", "data": { "booking_ref": "MRJ-2026-0001", "reason": "طلب الموزع" } }
```
- **سلوك رحّال:** تعليم الحجز ملغى + **إرجاع المقاعد** + بث `inventory.updated`.
- **الرد:** `{ received: true, released_seats: N }`

---

## 5) طريقة العرض (Signed Iframe)
- زوّدونا بـ `MERAAJ_STORE_URL` — يوضع في إعدادات رحّال (env) **بدون أي تعديل برمجي**.
- رحّال يفتح: `{MERAAJ_STORE_URL}?sso={token}` داخل تبويب "🕋 متجر معراج".
- قبل توفر الرابط، يعرض التبويب شاشة "قريباً" + مركز مزامنة (الباكجات المُشارَكة، الحجوزات الواردة، سجل الأحداث).

---

## 6) زر المشاركة (مرجع سلوكي — v3.25 المشاركة الذكية)
الأسعار **تُسحب آلياً** من التسعير المباشر للباقة (غرفة + عمر) وتبقى متزامنة: أي تعديل على أسعار الباقة في رحّال يعيد حساب `market_pricing` ويبث `package.updated` فوراً. المدخلات اليدوية الوحيدة: **عمولة الوكيل** (مبلغ/نسبة) + **اتجاهها**:
- `commission_direction: "added"` → سعر الزبون = سعر رحّال + العمولة (البائع يقبض سعره كاملاً)
- `commission_direction: "deducted"` → سعر الزبون = سعر رحّال نفسه (العمولة من هامش البائع)
بالإضافة إلى **المقاعد المخصصة للسوق**. العمولة لا تُطبق على الفئات ذات السعر الصفري (الرضّع مجاناً يبقون مجاناً).

---

## 7) أكواد الأخطاء
| Code | المعنى |
|---|---|
| 401 | توقيع HMAC غير صالح / Timestamp منتهٍ |
| 403 | باكج غير مُشارَك |
| 404 | مكتب/باكج/حجز غير موجود |
| 409 | مقاعد غير كافية (Overbooking prevention) |
| 503 | التكامل غير مُهيأ (Secret مفقود) |

## 8) ملاحظات أمنية
- المقارنة constant-time (`timingSafeEqual`).
- نافذة Timestamp: ±300 ثانية.
- كل بيانات مكتب معزولة بـ `tenant_id` (Multi-tenant isolation).
- الحجوزات الواردة لا تدخل الدورة المحاسبية تلقائياً — تظهر للمكتب كـ"حجز وارد" ويُعتمد يدوياً (حماية سلامة القيود). خصم المخزون فوري.

---
*أعدّها: فريق تطوير رحّال — أي استفسار تقني نرحب بجلسة مطابقة مباشرة.*

---
## v3.72 — عرض التوفر بدون أرقام + التفويج + مسار الرحلة

### 1) حقل `availability` الجديد (صادر من رحّال)
كل حمولة باقة (`share` / `package.updated` / `inventory.updated`) تحمل الآن:
```json
{ "availability": "متاح" }        // اعرضوها كلمة خضراء فقط — بدون أرقام مقاعد
{ "availability": "غير متاح" }    // لن تصلكم غالباً — الباقة تُخفى بدلاً من ذلك
```
⚠️ حقل `available_seats` ما زال يُرسل للتوافق — **لا تعرضوه في واجهة المكاتب**.

### 2) الإخفاء التلقائي من السوق (صادر من رحّال)
عند امتلاء المقاعد أو تفويج الرحلة يصلكم فوراً:
```json
{ "type": "package.deactivated", "data": { "package_ref": "...", "reason": "sold_out" } }
{ "type": "package.deactivated", "data": { "package_ref": "...", "reason": "dispatched" } }
```
← أخفوا الباقة تماماً من السوق. وعند توفر مقاعد مجدداً يصلكم `package.updated` كامل ← أعيدوا إظهارها.

### 3) مسار الرحلة (وارد من معراج → رحّال)
أرسلوا من لوحة معراج (بنفس توقيع `x-meraaj-signature` على الجسم الخام):
```json
{ "id": "uuid-فريد", "type": "meraaj.package.route_updated",
  "data": { "package_ref": "معرف-الباقة-في-رحال", "route": "الشحر - الريان - المكلا - جدة" } }
```
← يُخزن ويُعرض في شاشات رحّال. ويمكن أيضاً تمرير `data.route` داخل `meraaj.booking.created` ليظهر مع الحجز.

---
## v3.73 — دورة الحجز Enterprise (العقود النهائية الحرفية)

### غلاف كل حدث صادر من رحّال (Webhook envelope)
`POST {MERAAJ}/api/integrations/rahal/webhooks` + ترويسة `X-Rahal-Signature` (HMAC-SHA256 hex على الجسم الخام):
```json
{ "id": "uuid-فريد-للحدث", "type": "<النوع>", "timestamp": 1766500000, "data": { ... } }
```

### booking.approved (data)
```json
{ "booking_ref": "مرجع الحجز في معراج", "package_ref": "معرف الباقة في رحال",
  "rahal_ref": "نفس معرف الباقة", "meraaj_package_id": "remote_id إن وُجد",
  "inbound_id": "معرف الحجز الوارد في رحال", "buyer_office_name": "...",
  "seats": 2, "pax": {"adults": 2, "children": 0, "infants": 0},
  "total_price": 2000, "net_to_seller_total": 1800, "currency": "SAR",
  "approved_at": "ISO-8601", "approved_by": "اسم المعتمد أو auto_approve" }
```

### booking.rejected (data)
```json
{ "booking_ref": "...", "package_ref": "...", "inbound_id": "...",
  "buyer_office_name": "...", "reason": "سبب الرفض", "released_seats": 2, "rejected_at": "ISO-8601" }
```

### booking.cancellation.approved (data) — موافقة صاحب الباكيج على طلب الإلغاء
```json
{ "booking_ref": "...", "package_ref": "...", "inbound_id": "...",
  "buyer_office_name": "...", "released_seats": 2,
  "refund_note": "ملاحظة الاسترداد أو null", "cancelled_at": "ISO-8601" }
```

### booking.cancellation.rejected (data) — رفض طلب الإلغاء (الحجز يبقى معتمداً)
```json
{ "booking_ref": "...", "package_ref": "...", "inbound_id": "...",
  "buyer_office_name": "...", "reason": "سبب الرفض", "rejected_at": "ISO-8601" }
```

### وارد جديد من معراج: meraaj.booking.cancellation_requested
```json
{ "id": "uuid-فريد", "type": "meraaj.booking.cancellation_requested",
  "data": { "booking_ref": "...", "reason": "سبب الإلغاء" } }
```
- حجز معتمد ← يُسجل كطلب (الحجز يبقى معتمداً حتى قرار المالك) ثم يصلكم أحد حدثي القرار أعلاه.
- حجز new ← يُغلق مباشرة (كـ booking.cancelled).
- ملاحظة: `meraaj.booking.cancelled` على حجز **معتمد** يُحوَّل تلقائياً لطلب إلغاء (لا يُلغى مباشرة أبداً).

### ردود الرفض على booking.created (HTTP 409, machine-readable)
```json
{ "error": "price_mismatch", "message": "السعر المرسل لا يطابق السعر الحالي",
  "sent_total": 1320, "current_total": 2000, "currency": "SAR" }
{ "error": "package_not_available", "message": "الباكج غير متاح للحجز (مغلق أو مؤرشف أو مُفوَّج)", "package_ref": "..." }
```
⚠️ عند 409 لا يُنشأ أي حجز ولا تُحجز مقاعد — صححوا السعر وأعيدوا الإرسال بمعرف حدث جديد.

---

# 🔒 v3.76 — قفل عقد التكامل (CONTRACT LOCK) + ربط الحسابات وSSO

## 1) قاعدة المراجع الموحدة (إلزامية في كل الأحداث)
| الحقل | التعريف | مصدره | ثباته |
|---|---|---|---|
| `package_ref` | **يساوي دائماً** `rahal_ref` = `packages.id` في رحّال (UUID) | يُرسل من رحّال في نداء التسجيل `packages/share` وفي كل حدث صادر | ثابت مدى الحياة |
| `rahal_ref` | نفس قيمة `package_ref` (اسم بديل صريح) | رحّال | ثابت |
| `meraaj_package_id` | معرّف الباقة داخل معراج (يعيده معراج في رد التسجيل 2xx) | معراج | ثابت |
| `booking_ref` | معرّف الحجز الحقيقي لدى معراج (`bookings._id`) | يولّده معراج في `meraaj.booking.created` | **نفس القيمة حرفياً في كل أحداث دورة الحجز لاحقاً (الطرفان)** |

- ⚠️ ممنوع استخدام أي مرجع تجريبي (`TEST_...`) مكان `package_ref` أو `booking_ref`.
- تسامح رحّال (نفس العقد): يقبل في `data.package_ref` أيضاً قيمة `meraaj_package_id`، ويقرأ `data.rahal_ref` كبديل — الحل النهائي دائماً باقة واحدة.
- كل حدث صادر من رحّال يحمل الثلاثية كاملة: `package_ref` + `rahal_ref` + `meraaj_package_id` + `booking_ref`.

## 2) أخطاء 404 مُهيكلة (machine-readable)
```json
{ "error": "unknown_package_ref", "message": "...", "received_package_ref": "...", "received_rahal_ref": "..." }
{ "error": "unknown_booking_ref", "message": "...", "received_booking_ref": "..." }
```
- `unknown_booking_ref` على أي حدث إلغاء يعني أن `booking.created` الأصلي لم يُقبل (HTTP 200) في رحّال — أصلحوا الأصل ثم أعيدوا التسلسل بمعرّفات أحداث جديدة.
- التسلسل الزمني إلزامي: `booking.created` (200) ← انتظار `booking.approved` من رحّال ← ثم `cancellation_requested` ← انتظار `booking.cancellation.position` ← ثم `cancellation_finalized`.

## 3) ربط حساب المكتب (Account Linking) — مطلوب تنفيذه لدى معراج
رحّال ينادي (عند تفعيل المتجر تلقائياً، أو يدوياً من زر «ربط الحساب»):
```
POST {MERAAJ_BASE}/api/integrations/rahal/offices/link
Headers: X-Rahal-Api-Key: <SHARED_SECRET> | X-Rahal-Signature: HMAC-SHA256(rawBody)
Body: { "office_ref": "<tenant_id>", "office_name": "...", "owner_email": "...",
        "store_active": true, "escrow_mode": false,
        "requested_by": "...", "requested_at": "ISO-8601" }
```
الرد المتوقع عند النجاح (2xx): `{ "office_id": "<meraaj_office_id>" }` (تُقبل أيضاً المفاتيح: `meraaj_office_id` أو `id` أو `data.id`).
- `office_ref` هو معرّف المكتب الثابت في رحّال — اربطوه بحساب المكتب لديكم (idempotent: نفس `office_ref` = نفس الحساب دائماً).

## 4) الدخول بحساب رحّال (SSO) — من جهة معراج
1. المستخدم يضغط «دخول متجر معراج» في رحّال ← رحّال يولّد Token: `base64url(payload) + "." + HMAC-SHA256(base64url(payload))`.
2. حمولة الـ Token: `{ iss:"rahaal-erp", aud:"meraaj-network", tenant_id, office_name, meraaj_office_id, email, role, permissions:{...}, iat, exp }` (صلاحية 5 دقائق).
3. معراج يتحقق محلياً بالسر المشترك، **أو** عبر النداء الخادمي:
```
POST {RAHAAL_BASE}/api/meraaj/sso/verify
Headers: x-meraaj-signature: HMAC-SHA256(rawBody)
Body: { "token": "<token>" }
```
الرد عند الصحة (200):
```json
{ "valid": true,
  "office": { "office_ref": "...", "office_name": "...", "meraaj_office_id": "...", "store_active": true, "escrow_mode": false },
  "user": { "email": "...", "name": "...", "role": "owner|staff",
            "permissions": { "manage_packages": true, "manage_bookings": true, "approve_reject": true, "can_refund": true, "manage_settings": true } } }
```
أخطاء: `invalid_token_signature` (401) • `token_expired` (401) • `user_not_found_or_inactive` (404) • `invalid_token_claims` (401).
- **نطاق الصلاحيات = مكتب المستخدم فقط** — امنحوا داخل معراج ما تسمح به `permissions` حصراً (إدارة الباقات، الطلبات، القبول/الرفض، التحديث/الإيقاف/الحذف).

---

# 📎 v3.77 — طبقة المستندات (Documents Layer)

## 1) مستندات المسافرين داخل booking.created (امتداد اختياري للعقد)
```json
"registrants": [{ "name": "...", "age": 30, "room_type": "QUAD", "passport_no": "...",
  "documents": [{ "type": "passport|visa|other", "url": "https://...", "label": "وصف" }] }]
```
- حتى 10 مستندات لكل مسافر — تُخزن كمراجع (رحّال لا ينسخ الملفات؛ معراج يبقى مضيف ملفات المشتري).
- المكتب البائع المخوّل يراها فور وصول الحجز Pending. فشل الاستيعاب لا يرفض الحجز أبداً.

## 2) أدلة الإلغاء كملفات فعلية (booking.cancellation.position)
- `evidence[].kind` يدعم: `url` أو `file_ref` (ملف حقيقي مرفوع في رحّال).
- في الحدث الصادر، كل `file_ref` يُثرى تلقائياً بـ:
```json
{ "kind": "file_ref", "value": "<doc_id>", "label": "...",
  "download_url": "https://.../api/meraaj/documents/signed/<doc_id>?exp=...&sig=...",
  "filename": "visa.pdf", "content_type": "application/pdf" }
```
- `download_url` = رابط موقّع HMAC صالح 72 ساعة — للسوبر أدمن في معراج لفتح الملف بأمان دون أي بيانات دخول.
- الملف Evidence فقط — **لا يولّد أي قيد مالي تلقائياً**.

## 3) توثيق المكتب (Office Verification) — رحّال مصدر الهوية
حدث صادر جديد: `office.verification_updated`
```json
{ "office_ref": "<tenant_id>", "status": "pending_review|verified|rejected",
  "office_name": "...", "verified_at": "ISO"?, "reject_reason": "..."?, "documents_count": 3? }
```
- معراج يستقبل الحالة والمرجع فقط — لا يعاد رفع مستندات المكتب في النظامين.
- الحالات: `unverified → pending_review → verified | rejected` (سبب واضح + إعادة رفع مسموحة).

## 4) التنزيل الموقّع (عام، HMAC-expiring)
```
GET {RAHAAL_BASE}/api/meraaj/documents/signed/{doc_id}?exp={unix}&sig={HMAC-SHA256("doc:{doc_id}:{exp}")}
```
- 401 توقيع خاطئ • 410 منتهي • 404 غير موجود. كل قراءة تسجَّل في سجل التدقيق.

## 5) التخزين والأمان
- طبقة تخزين S3-compatible خاصة (Private) — التفعيل عبر ENV فقط: `S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY`.
- حتى توفر بيانات S3: fallback داخل MongoDB (`document_blobs`) بنفس مساحة أسماء object_key — جاهز للترحيل.
- MIME المسموح: PDF/JPG/PNG/WEBP • الحد 4MB • مفاتيح كائنات عشوائية • عزل كامل بين المكاتب • تدقيق كامل (رفع/قراءة/حذف/تغيير حالة) في `document_audit`.
