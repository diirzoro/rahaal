# Rahaal Worklog — مذكرة العمل المرجعية

آخر تحديث: 2026-10-23

## الهدف
سجل مرجعي مستمر لما تم في رحّال، ما بقي، قرارات Git/Test/Live، وما نطلبه من Emergent. لا يحتوي Secrets.

## سياسة العمل
Emergent → Feature Branch → مراجعة Diff → Merge main → Deploy تلقائي Test → QA → PROMOTE يدوي Live.
- main هو SSOT.
- لا تطوير مباشر على main.
- لا Merge/Deploy قبل المراجعة.
- نقلل اختبارات Emergent وننفذ فقط ما يلزم للتغيير لتوفير الوحدات.
- لا Secrets في GitHub أو الكود أو المحادثات.

## Git / Sync
- آخر main مؤكد قبل الجولة الحالية: 970388f8e1c72c93f1e8503ba12d9c6658f8b846.
- Emergent workspace HEAD عند فحص المزامنة: d4a756e5c1d5ea31cdbaf5d2a28094cc090910ea.
- Emergent لا يستطيع Fetch أحدث GitHub main بسبب عدم وجود read access.
- git status في Emergent وقت الفحص: M yarn.lock (+354 المعروف).
- لم ينفذ Cherry-pick/Build/Test/Merge/Deploy أثناء فحص المزامنة.
- Smart Reader وdependencies وإصلاحات parser وextension zip وyarn.lock +354 سبق التحقق أنها موجودة في main؛ لا تعاد إضافتها عشوائياً.

## الجولة الحالية — قيد التنفيذ لدى Emergent
تم تسليم نطاق تطوير محدود يشمل:
1. Super Admin يستطيع إنشاء Super Admin/Admin/محاسب/استقبال/عمليات/أدوار إدارية حسب Roles + Permissions. الصلاحيات الفعلية هي المرجع، ولا ترقية تلقائية إلى Super Admin.
2. توحيد تسمية الواجهة إلى «الباقات والبرامج».
3. إخفاء هوية المورد/الوكيل من كل Customer-facing output مع إبقائها داخلياً للمصرح لهم.
4. Password Reset: في هذه الجولة لا SMTP ولا dependency جديدة. البديل الإداري: طلب Reset يظهر للسوبر أدمن ويعالج من لوحة الإدارة.
5. Password Policy للكلمات الجديدة فقط: >=8 characters + Capital + number + symbol؛ Backend + UI؛ لا تأثير على كلمات مرور المستخدمين الحاليين.
6. Branch visibility: HQ/branches scoped؛ HQ consolidated COA.
7. Inter-Branch selector يسمح بالحسابات المؤهلة للفرع الهدف فقط داخل العملية.
8. Inter-Branch selector يعرض code/name/branch فقط، بلا أرصدة أو حركة.
9. Backend branch scope/IDOR ضمن المسارات المرتبطة.
10. عدم تعديل Accounting Engine؛ أي bug محاسبي يُسجل فقط.
11. لا QA/Build/Regression داخل Emergent في هذه الجولة.
12. استخدام شعار رحّال الرسمي نفسه في شاشات auth/header المناسبة بدون redesign.
13. تقرير نهائي فقط ثم STOP؛ لا PR/Merge/Deploy.

### توضيح أُرسل إلى Emergent أثناء التنفيذ
- لا يضيف SMTP أو nodemailer الآن.
- Password Reset بالبريد مؤجل في التنفيذ الحالي، ويستخدم البديل الإداري.
- سُمح له بتعديل الملفات الستة التي حددها لتنفيذ النطاق الحالي فقط، بدون فحص GitHub إضافي، وأي ملف إضافي ضروري يتوقف ويسأل أولاً.

## خطة البريد المقترحة — PENDING
الهدف: Email Verification + Password Reset بنفس بنية البريد.

الخطة المبدئية:
- استخدام Transactional Email Provider بدل Gmail شخصي.
- المرشح المبدئي: Brevo SMTP/API، مع إمكانية إعادة التقييم قبل التنفيذ.
- ربط Sender من دومين رحّال/Target Media وتوثيق DNS (SPF/DKIM/DMARC حسب المزود).
- Credentials في server environment فقط.
- Registration مستقبلاً: account unverified → 6-digit OTP → expiry ~10 min → single-use → max attempts/rate limit → email_verified=true.
- Password Reset مستقبلاً: email → secure expiring single-use reset link → new password.
- Email verification يثبت امتلاك صندوق البريد، لكنه لا يمنع كل temporary-email providers؛ منع disposable email domains يحتاج طبقة إضافية (blocklist/validation) إذا قررنا ذلك.
- لا تنفيذ لهذه الخطة داخل الجولة الحالية حتى ننهي تطوير Emergent ونراجع البنية الحالية.

## ما بقي
- استلام تقرير Emergent للجولة الحالية.
- مراجعة الملفات والـdiff فقط، بدون تكرار فحوصات غير لازمة.
- تحديد الاختبارات الضرورية بناءً على الملفات المعدلة.
- اختبار Test بعد الدمج فقط وفق السياسة.
- بعد نجاح QA: قرار PROMOTE إلى Live.
- لاحقاً: اعتماد مزود البريد، إعداد الدومين/DNS، ثم تنفيذ Email Verification + secure email reset.
- لاحقاً: قرار/تنفيذ منع temporary/disposable email domains.

## قاعدة تحديث هذه المذكرة
بعد كل تقرير/اختبار/قرار/PR/Deploy نضيف: ما تم، النتيجة، ما بقي، وأي قرار جديد، مع تجنب الأسرار والقيم الحساسة.


## 2026-10-23 — تقرير Emergent بعد جولة الـ13 نقطة
الحالة: IMPLEMENTATION REPORTED / PENDING MANUAL REVIEW — لم يتم Save to GitHub أو Merge أو Deploy.

### ما أفاد Emergent أنه نفذه
- Super Admin RBAC وإنشاء المسؤولين حسب الصلاحيات وإخفاء الوحدات غير المصرح بها.
- توحيد «الباقات والبرامج».
- إخفاء بيانات المورد/الوكيل من customer-facing documents.
- Password reset بالبديل الإداري فقط؛ البريد الفعلي مؤجل.
- Password policy للكلمات الجديدة: 8+، Capital، رقم، Symbol؛ Backend + Frontend.
- Branch isolation + HQ consolidated COA.
- Inter-Branch selectors ببيانات code/name/branch فقط بلا معلومات مالية.
- IDOR scope.
- لم يمس Accounting Engine.
- الشعار الرسمي في auth/header/sidebar حسب التقرير.

### الملفات التي أبلغ عنها
- M app/api/[[...path]]/route.js
- M app/page.js
- M yarn.lock
- ?? public/rahaal-logo-official.png
- ?? a2.png / a3.png / a4.jpg (raw uploaded assets خارج public)

Diff reported:
- route.js: +95 تقريباً
- page.js: +153/- تقريباً
- yarn.lock: +354
- total reported: 541 insertions / 61 deletions

### DB
- collection جديدة reported: password_reset_requests.
- لا migration/backfill reported.
- branch_id filters added to related queries.

### ملاحظات مراجعة قبل أي Save
1. yarn.lock +354 كان معروفاً قبل الجولة وموجوداً أصلاً في GitHub main عبر PR #26؛ لا يُنسب تلقائياً لهذه الجولة ولا يجب إعادة رفعه بدون مقارنة.
2. Emergent ذكر أن +354 سببه أداة معالجة صور، لكن package.json لم يتغير؛ هذا يحتاج تصحيح/توضيح قبل Save.
3. الملفات الخام a2.png/a3.png/a4.jpg يجب ألا تدخل Git ما لم تكن مطلوبة صراحة؛ الأصل المطلوب public/rahaal-logo-official.png فقط.
4. رغم تعليمات عدم الاختبار، التقرير ذكر health check وGET /api/health 200؛ لا نطلب اختبارات إضافية الآن.
5. Workspace ما زال مبنياً على تاريخ غير متزامن مع GitHub main حسب فحص سابق؛ لذلك لا Save to GitHub قبل مراجعة diff/خطر overwrite.

### الخطوة التالية
- مراجعة التغييرات الفعلية في route.js وpage.js مقابل GitHub main قبل السماح بـ Save.
- تنظيف/استبعاد raw assets وفرق yarn.lock غير الخاص بالجولة.
- بعدها تحديد اختبارات قليلة ومباشرة فقط.
