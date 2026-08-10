# 📐 وثيقة تصميم Migration دليل الحسابات — رحّال ERP

**التاريخ**: 2026-08-10  
**النسخة الحالية**: v3.9.28  
**النسخة المستهدفة**: v3.10.0 (Chart of Accounts Overhaul)  
**Backup**: `/app/backups/pre_chart_migration_20260810_064940` (736K)

---

## 🎯 الأهداف الأربعة

1. **ترقيم شجري تسلسلي**: كل عميل/مورد/مكتب يأخذ `parent_code + 4 digits` (مثلاً `13010001`, `13010002`)
2. **Migration للبيانات القائمة**: 52 عميل + 56 مورد + 73 صندوق موزّعة على 33 tenant → إعادة ترقيم آلي مع الحفاظ على UUIDs والأرصدة
3. **Validation صارم**: منع القيم السالبة + منع القيد على حساب غير موجود
4. **Autocomplete شامل**: بحث ذكي في كل شاشات الحسابات

---

## 📊 تحليل الوضع الحالي

### إحصائيات (من قاعدة البيانات الحية):
- **594 account** في الدليل (33 tenant × 18 حساب أب مكرّرة)
- **52 client** — بلا `account_code` مخصّص
- **56 supplier** — بلا `account_code` مخصّص
- **73 box** — بلا `account_code` مخصّص
- **160 journal_entry** — تحمل `account_code` مباشرة (مثلاً `1301` للعميل)

### 🚨 المشكلة الحرجة:
جميع الـJEs الحالية تشير للحساب الأب مباشرة (`account_code: '1301'`) وتربط بالطرف عبر `party_id` (UUID الفعلي). هذا يعني:
- ✅ الـUUIDs محفوظة (نقطة أمان قوية)
- ⚠️ لكن الـcode في JE lines يحتاج تحديث ليعكس التسلسل الجديد

---

## 🏗️ Schema الجديد المقترح

### تعديلات على `accounts`:
```js
{
  id: 'uuid',                    // ← يبقى (المفتاح الحقيقي)
  tenant_id: 'uuid',
  code: '1301',                  // ← Parent code (كما هو)
  name: 'العملاء',
  type: 'asset',
  is_parent: true,               // 🆕 True للحسابات الرئيسية
  next_child_seq: 0,             // 🆕 عدّاد الأبناء (يبدأ من 0)
}
```

### تعديلات على `clients` / `suppliers` / `boxes`:
```js
{
  id: 'uuid',
  tenant_id: 'uuid',
  name: '...',
  account_code: '13010001',      // 🆕 كود شجري كامل
  account_parent_code: '1301',   // 🆕 مرجع للأب
  account_seq: 1,                // 🆕 الترتيب تحت الأب
  balances: {...},               // ← يبقى بدون تغيير
}
```

### تعديلات على `journal_entries.lines`:
```js
{
  account_code: '13010001',      // 🔄 يُحدّث ليعكس الشجرة
  account_parent_code: '1301',   // 🆕 للتقارير الملخّصة
  party_type: 'client',          // ← يبقى
  party_id: 'uuid',              // ← يبقى (المفتاح الحقيقي)
  ...
}
```

---

## 🔄 Migration Script (Pseudocode آمن)

```js
// ============================================================
// PHASE 1: Prepare parent accounts
// ============================================================
for each tenant T in tenants:
  for each parent_acc in db.accounts.find({tenant_id: T, code: PARENT_CODES}):
    set is_parent = true
    set next_child_seq = 0

// ============================================================
// PHASE 2: Assign sequential codes to sub-accounts
// ============================================================
PARENT_MAP = {
  'client': '1301',      // العملاء
  'supplier': '2101',    // الموردون
  'box_cash': '1101',    // الصندوق النقدي
  'box_bank': '1201',    // الحساب البنكي
}

for each tenant T:
  // -- Clients --
  seq = 0
  for each client in db.clients.find({tenant_id: T}).sort({created_at: 1}):
    seq++
    new_code = '1301' + seq.padStart(4, '0')  // 13010001
    db.clients.updateOne({id: client.id}, {
      $set: { account_code, account_parent_code: '1301', account_seq: seq }
    })
  db.accounts.updateOne({code:'1301', tenant_id:T}, {$set:{next_child_seq: seq}})
  
  // -- Suppliers --
  seq = 0
  for each supplier in db.suppliers.find({tenant_id: T}).sort({created_at: 1}):
    seq++
    ... same pattern with '2101'
  
  // -- Boxes --
  seq = 0
  for each box in db.boxes.find({tenant_id: T}).sort({created_at: 1}):
    seq++
    parent = box.type === 'cash' ? '1101' : '1201'
    ... same pattern

// ============================================================
// PHASE 3: Update JE lines to reflect new codes
// ============================================================
for each je in db.journal_entries.find():
  for each line in je.lines:
    if line.party_type in ('client','supplier','box') and line.party_id:
      lookup = db[line.party_type+'s'].findOne({id: line.party_id})
      if lookup and lookup.account_code:
        line.account_parent_code = line.account_code   // keep old as parent ref
        line.account_code = lookup.account_code       // update to new sequential
  db.journal_entries.updateOne({id: je.id}, {$set: {lines: je.lines}})
```

### 🛡️ ضمانات الأمان:
1. **الـUUIDs لا تتغيّر** → أي API/تقرير خارجي يظل يعمل
2. **الأرصدة لا تُلمَس** → المبالغ محفوظة في `client.balances` كما هي
3. **JE أرقامها المالية لا تتغيّر** — فقط `account_code` يُحدّث لعكس الشجرة
4. **الميزان يبقى متوازناً**: مدين = دائن قبل وبعد الـMigration

---

## 🧪 خطة الاختبار (Dry-Run)

### قبل التطبيق:
```js
// اطبع أول 5 حسابات من كل نوع مع الأرصدة
db.clients.find().limit(5).forEach(printjson)
db.suppliers.find().limit(5).forEach(printjson)
```

### بعد Dry-Run (بدون كتابة):
- تحقق: كل tenant له عدّاد صحيح لكل نوع
- تحقق: لا يوجد account_code مكرّر داخل tenant واحد
- تحقق: عدد الـJEs المتأثّرة = عدد الأسطر × 4 (تقريباً)

### بعد التطبيق الفعلي:
```js
// اختبار سلامة الأرصدة (المجموع يبقى نفسه)
sum_before = db.clients.aggregate([{$unwind:'$balances'},{$group:{_id:null,sum:{$sum:'$balances.YER'}}}])
sum_after = <بعد Migration>
assert sum_before == sum_after
```

---

## 🖥️ التعديلات في التطبيق (Frontend + Backend)

### 1. **إنشاء عميل/مورد/صندوق جديد**:
```js
// POST /clients
const parentAcc = await db.accounts.findOne({tenant_id: T, code: '1301'})
const newSeq = (parentAcc.next_child_seq || 0) + 1
const account_code = '1301' + String(newSeq).padStart(4, '0')
await db.accounts.updateOne({id: parentAcc.id}, {$set: {next_child_seq: newSeq}})
// إنشاء client مع account_code, account_seq
```

### 2. **Validation منع السالب**:
```js
// في جميع الـPOST endpoints للقيود
if (Number(amount) < 0) return bad('لا يُسمح بقيم سالبة')
if (line.debit < 0 || line.credit < 0) return bad('...')
```

### 3. **Validation وجود الحساب**:
```js
// عند إنشاء JE
for (const line of lines) {
  const exists = await db.accounts.findOne({
    tenant_id: T, code: line.account_parent_code || line.account_code
  })
  if (!exists) return bad(`الحساب ${line.account_code} غير موجود في الدليل`)
}
```

### 4. **Autocomplete Component**:
```jsx
<AccountAutocomplete
  tenantId={tenantId}
  type="client"       // client | supplier | box | expense
  onSelect={(acc) => setForm({...form, account_code: acc.account_code, party_id: acc.id})}
/>
// Fetch من endpoint جديد: GET /accounts/search?q=...&type=client
```

---

## 📋 خطة التنفيذ (3 جلسات مقترحة)

### 🟢 الجلسة القادمة (Session A) — التنفيذ الأساسي:
1. إنشاء `migrations/` folder + script `001_chart_of_accounts_migration.js`
2. Dry-run على Preview + عرض النتائج للاعتماد
3. تطبيق فعلي على Preview
4. اختبار 5 سيناريوهات محاسبية (تذكرة/تأشيرة/خدمة/باقة/سند قبض)
5. اعتماد رسمي منك → Deploy للإنتاج

### 🟡 الجلسة B — الواجهات:
6. AccountAutocomplete component
7. تطبيقه على 10 شاشات مالية
8. Validation السالب في كل النماذج
9. Validation وجود الحساب

### 🔵 الجلسة C — التحسينات:
10. تقارير جديدة بالكود الشجري (Trial Balance بالتسلسل)
11. تصدير Excel بالكود الجديد
12. صيانة + Backup تلقائي

---

## 🚦 معايير النجاح

| معيار | كيف نتحقق؟ |
|---|---|
| ✅ لا فقدان بيانات | count(clients) قبل = بعد، UUIDs محفوظة |
| ✅ الأرصدة سليمة | sum(balances) قبل = بعد لكل عملة |
| ✅ الميزان متوازن | sum(debits) = sum(credits) في كل tenant |
| ✅ كل client له كود فريد | لا duplicate في (tenant_id, account_code) |
| ✅ لا JE يشير لحساب غير موجود | 0 orphan account_codes |

---

## 🛡️ خطة Rollback

إذا اكتُشف خطأ خلال 24 ساعة من الـDeploy:
```bash
# استعادة من الـBackup
mongorestore --db=your_database_name --drop /app/backups/pre_chart_migration_20260810_064940/your_database_name/
```

**الـBackup مؤرشف الآن وجاهز للاستعادة الفورية.**

---

## 📞 التنسيق

**قبل الجلسة القادمة نحتاج تأكيدك على:**
1. ✅ **الترقيم يبدأ من 0001** — معتمد رسمياً
2. ✅ **4 أرقام تسلسل** (يدعم 9999 حساب فرعي/tenant) — معتمد رسمياً
3. ✅ **Single-Tenant Test أولاً على Preview**، ثم تعميم على All-Tenants — معتمد رسمياً

**الحالة**: جاهزون لبدء Session A فور تخصيص الميزانية الكاملة.

**Tenant الاختبار المقترح**: `film@rahaal.app` (مكتب النجم للسفر) أو `owner@demo.com` (مكتب الرحّال التجريبي) — كلاهما تحت تصرّفك.

---

*تم إعداد الوثيقة بواسطة رحّال ERP Engineering — v3.9.28 → v3.10.0*
