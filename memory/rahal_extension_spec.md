# Rahaal Chrome Extension / Scraper — مواصفات دقيقة (Session Handoff)

> **Status:** 📌 Scheduled for a future session (P2 — after Target Media Super Admin).
> **Purpose:** Chrome extension that scrapes booking data from airline / bus / KSA visa portals
> and pushes it into Rahal ERP via `/api` endpoints — with instant journal entries + receipts.
> **Sample files URL (provided by owner):**
> https://drive.google.com/drive/folders/1qMeyhenenahE752f3RSMg52YGbPBkL2k

---

## 1) Sample documents & precise field examples (9 templates)

### 1.1 Yemenia Airways (طيران اليمنية)
- اسم المسافر: **AL TAMIMI/FAWAZ ALI SAEED**
- PNR: **386LKB**
- رقم التذكرة: **635 2412944105**
- رقم الجواز: **15457879**
- خط السير: **جدة ➔ عدن**
- تاريخ الرحلة: **24 مارس 2026**
- وقت المغادرة/الوصول: **20:10 ➔ 22:10**
- تاريخ الإصدار: **15 نوفمبر 2025**
- السعر الإجمالي: **87.95 USD**

### 1.2 Fly Aden (طيران عدن)
- اسم المسافر: **MAADOM/SALEH ABOBAKR SALEH**
- PNR: **AAB7VL**
- رقم التذكرة الإلكترونية: **000 2300034112/1**
- خط السير: **عدن ➔ القاهرة**
- تاريخ الرحلة: **26 مايو 2026**
- وقت المغادرة/الوصول: **17:00 ➔ 20:30**
- تاريخ الإصدار: **17 مايو 2026**
- السعر الإجمالي: **645.70 USD**

### 1.3 Security Approval – Type 1 (Ethiopia / Egypt)
- اسم المسافر: **عبدالله محمد حسن العمودي**
- رقم الجواز: **16441832**
- الناقل + الرحلة: **الخطوط الأثيوبية ET452**
- رقم التذكرة: **0719461779085** — رقم الحجز: **GTSIKH**
- تاريخ الرحلة: **15 يوليو 2026**
- تاريخ إصدار الموافقة: **14 يونيو 2026**
- تاريخ الانتهاء: **13 أغسطس 2026** (صلاحية 60 يوم)

### 1.4 Security Approval – Type 2 (Egypt)
- اسم المسافر: **حنان صالح عبدالله العوبثاني**
- رقم الموافقة: **3173**
- رقم الجواز: **11399479**
- تاريخ الإصدار: **13 يوليو 2026**
- تاريخ الانتهاء: **11 أكتوبر 2026** (صلاحية 90 يوم)

### 1.5 Albaraka Bus (شركة البركة للنقل البري)
- رقم التذكرة: **MK13473** — رقم الرحلة: **55757**
- رقم الجواز: **10801639**
- خط السير: **المكلا ➔ مكة**
- تاريخ الرحلة: **20 يونيو 2026**
- الحضور/التحرك: **05:00 ➔ 06:00**
- تاريخ ووقت طباعة التذكرة: **18 يونيو 2026 — 09:34 ص**
- السعر: **200.00 SAR**

### 1.6 KSA Umrah Visa (تأشيرة عمرة)
- اسم المسافر: **خديجة سعيد عثمان المثنى**
- رقم التأشيرة: **6169794577** — رقم الطلب: **E821262038**
- رقم الجواز: **16439690**
- بدء الصلاحية: **17 يوليو 2026**
- الانتهاء: **15 أكتوبر 2026** (إقامة 90 يوم)

### 1.7 KSA Visit Visa Request (وزارة الخارجية السعودية)
- اسم المسافر: **عيشه عبدالله محمد فدعق**
- رقم المستند: **7010880642** — رقم الطلب: **E820916383**
- رقم الجواز: **09969320**
- تاريخ طلب المستند: **26 يوليو 2026**
- تاريخ انتهاء الجواز: **27 أبريل 2027**

### 1.8 KSA Work Visa Application
- اسم المسافر: **هيثم محمد سالم الاشولي**
- رقم الطلب: **E821783993** — رقم الجواز: **14236955**
- تاريخ تقديم الطلب: **25 يوليو 2026**
- تاريخ انتهاء الجواز: **23 يونيو 2030**

### 1.9 KSA Stamped Work Visa
- رقم التأشيرة: **6146388869** — رقم الطلب: **E796721834**
- رقم الجواز: **10803214**
- بدء الصلاحية: **20 أغسطس 2025**
- الانتهاء: **18 نوفمبر 2025** (إقامة 90 يوم)

---

## 2) Unified Field Extraction Schema

```json
{
  "traveler": {
    "name_ar": "string?",
    "name_en": "string?",
    "passport_no": "string",
    "nationality": "string?"
  },
  "booking": {
    "doc_type": "flight|bus|umrah_visa|visit_visa|work_visa|security_approval",
    "pnr": "string?",
    "ticket_no": "string?",
    "visa_no": "string?",
    "application_no": "string?",
    "approval_no": "string?",
    "carrier": "string?",
    "flight_no": "string?",
    "route_from": "string?",
    "route_to": "string?"
  },
  "dates": {
    "trip_date": "ISO date?",
    "depart_time": "HH:mm?",
    "arrive_time": "HH:mm?",
    "issued_at": "ISO datetime?",
    "valid_from": "ISO date?",
    "valid_until": "ISO date?",
    "stay_days": "number?",
    "passport_expiry": "ISO date?"
  },
  "financial": {
    "amount": "number",
    "currency": "USD|SAR|YER"
  },
  "source_url": "string",
  "raw_html_snippet": "string?"
}
```

## 3) Extension UX / Flow (Pop-up Widget)

1. User navigates to any supported airline / bus / KSA visa portal page.
2. Extension icon lights up 🟢 when scrape rules match the page.
3. User clicks **"سحب إلى رحال 🚀"** button (injected into the page or extension popup).
4. Widget opens on top of the page with:
   - All extracted fields prefilled (editable).
   - A **searchable dropdown** to pick a **العميل/الوكيل** account.
   - A dropdown to pick the **الصندوق** (if payment received on the spot).
   - A "نوع القيد" toggle: **آجل** (creates ledger entry only) / **مقبوض** (creates ledger + receipt voucher).
5. On confirm → POST to Rahal API:
   - `/api/tickets` for flights + bus,
   - `/api/visas` for umrah / visit / work visas + security approvals,
   - Auto-generates the journal entry.
   - Returns success toast with the created record id.

## 4) Supported source portals (initial scope)
- Yemenia Airways booking / e-ticket page
- Fly Aden e-ticket page
- KSA e-Visa portal (Umrah / Visit / Work — قنصلية)
- Ethiopia / Egypt security approval printout page
- Albaraka Bus ticket portal

## 5) API contract from extension side
- **Auth:** reuse tenant session cookie OR a Personal Access Token (PAT) that the user pastes once in extension settings.
- **Endpoint:** `POST /api/scraper/ingest` (new — to be built in the session).
  - Body: unified schema (section 2).
  - Response: `{ ok: true, record_id, doc_type, journal_id }`.
- The endpoint internally maps to existing `/api/tickets` or `/api/visas` creators and reuses their journal-entry logic.

## 6) Session-start checklist for the next agent

- Build Chrome extension skeleton (manifest v3, popup + content-script + background service worker).
- Implement per-portal parsers (start with **Yemenia** and **KSA e-Visa** — highest volume).
- Add **PAT** issue/revoke endpoints in Rahal (`/api/pats`) so extension can auth without cookies.
- Build **/api/scraper/ingest** unified endpoint on the Rahal backend.
- Add **"إضافة المتصفح"** settings tab on the Rahal owner settings screen for token management.

