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
    "final_price": 1750,
    "buyer_commission_mode": "amount",
    "buyer_commission_value": 100,
    "seats_allocated": 40, "seats_sold": 6, "seats_available": 34,
    "shared_at": "..."
  },
  "components": [{ "name": "فندق", "component_type": "hotel", "pricing_type": "room_age" }]
}
```

### 2.3 صورة الباكج
`GET /api/meraaj/packages/{ref}/image` — نفس توقيع GET. يرجع **Binary** (`image/jpeg|png|webp`).

---

## 3) Webhooks صادرة من رحّال → معراج

- **الوجهة:** `MERAAJ_WEBHOOK_URL` (زوّدونا به).
- **النمط:** Outbox — كل حدث يُحفظ محلياً ثم يُرسل؛ إن تعطل خادمكم يبقى بحالة `pending/failed` ولا يضيع.
- **التوقيع:** Headers: `x-rahaal-timestamp` و `x-rahaal-signature = HMAC_SHA256(raw_body, SHARED_SECRET)`.
- **الغلاف الموحد:**
```json
{ "id": "uuid-الحدث", "type": "inventory.updated", "timestamp": 1766222000, "data": { } }
```
- استخدموا `id` لمنع التكرار (Idempotency)، وردّوا بـ HTTP 2xx للتأكيد.

### الأنواع
| Type | متى يُرسل | data |
|---|---|---|
| `inventory.updated` | أي حجز/تعديل/حذف يمس باكج مُشارَكاً | `{ package_ref, status, seats_allocated, seats_sold, seats_available, internal_bookings, final_price, currency }` |
| `package.shared` | أول مشاركة | Payload الباكج كاملاً (بنية 2.2) |
| `package.updated` | تعديل بيانات/أسعار باكج مُشارَك | Payload الباكج كاملاً |
| `package.deactivated` | إيقاف المشاركة أو إغلاق الباكج | `{ package_ref, reason: "unshared_by_office" \| "closed_by_office" }` |

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
- **سلوك رحّال:** تحقق التوقيع → تحقق المقاعد المتاحة (نفدت؟ → **409** برسالة العجز) → تسجيل الحجز الوارد + **خصم المقاعد فوراً** → بث `inventory.updated` بالمتبقي.
- **الرد:** `{ received: true, inbound_booking: {...}, seats_remaining: N }`

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

## 6) زر المشاركة (مرجع سلوكي)
نافذة المشاركة في رحّال تطلب: **سعر البيع النهائي للزبون** + **عمولة المكتب المشتري (مبلغ ثابت أو نسبة)** + **المقاعد المخصصة للسوق**، ويحسب النظام تلقائياً `net_to_seller = final_price - buyer_commission`. كل هذه القيم متاحة في Payload الباكج (2.2).

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
