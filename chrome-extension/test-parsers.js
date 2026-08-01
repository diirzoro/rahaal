// Rahaal Extension — Parser Validation Test
// Validates all 9 sample documents against the parser logic.
// Run: node /app/chrome-extension/test-parsers.js

// ---- Test fixtures (Arabic + English text as would appear on document pages) ----
const FIXTURES = [
  {
    id: '1-yemenia',
    expected_doc_type: 'flight',
    expected_carrier: 'Yemenia Airways',
    require: ['name_en', 'passport_no', 'pnr', 'ticket_no', 'trip_date', 'depart_time', 'amount'],
    text: `
      Yemenia Airways
      E-Ticket Receipt
      Passenger Name: AL TAMIMI/FAWAZ ALI SAEED
      PNR: 386LKB
      Ticket Number: 635 2412944105
      Passport No: 15457879
      From: JED
      To: ADE
      Flight Date: 24 MAR 2026
      Departure: 20:10
      Arrival: 22:10
      Issued: 15 NOV 2025
      Total: 87.95 USD
    `,
  },
  {
    id: '2-flyaden',
    expected_doc_type: 'flight',
    expected_carrier: 'Fly Aden',
    require: ['name_en', 'pnr', 'ticket_no', 'trip_date', 'amount'],
    text: `
      Fly Aden
      طيران عدن
      Passenger: MAADOM/SALEH ABOBAKR SALEH
      PNR: AAB7VL
      E-Ticket: 000 2300034112/1
      From: ADE
      To: CAI
      Flight Date: 26 MAY 2026
      Departure: 17:00
      Arrival: 20:30
      Issued: 17 MAY 2026
      Total: 645.70 USD
    `,
  },
  {
    id: '3-security-type1',
    expected_doc_type: 'security_approval',
    require: ['name_ar', 'passport_no', 'flight_no', 'ticket_no', 'pnr', 'trip_date', 'valid_until'],
    text: `
      تصريح موافقة أمنية
      الخطوط الأثيوبية
      اسم المسافر: عبدالله محمد حسن العمودي
      رقم الجواز: 16441832
      رقم الرحلة: ET452
      رقم التذكرة: 0719461779085
      رقم الحجز: GTSIKH
      تاريخ الرحلة: 15 يوليو 2026
      تاريخ الإصدار: 14 يونيو 2026
      تاريخ الانتهاء: 13 أغسطس 2026
    `,
  },
  {
    id: '4-security-type2',
    expected_doc_type: 'security_approval',
    require: ['name_ar', 'passport_no', 'approval_no', 'valid_until'],
    text: `
      تصريح موافقة أمنية - مصر
      اسم المسافر: حنان صالح عبدالله العوبثاني
      رقم الموافقة: 3173
      رقم الجواز: 11399479
      تاريخ الإصدار: 13 يوليو 2026
      تاريخ الانتهاء: 11 أكتوبر 2026
    `,
  },
  {
    id: '5-albaraka-bus',
    expected_doc_type: 'bus',
    require: ['passport_no', 'ticket_no', 'flight_no', 'trip_date', 'amount'],
    text: `
      شركة البركة للنقل البري
      Albaraka Bus
      رقم التذكرة: MK13473
      رقم الرحلة: 55757
      رقم الجواز: 10801639
      من: المكلا
      إلى: مكة
      تاريخ الرحلة: 20 يونيو 2026
      وقت التحرك: 06:00
      وقت الوصول: 22:00
      تاريخ الإصدار: 18 يونيو 2026
      السعر: 200.00
      ريال سعودي SAR
    `,
  },
  {
    id: '6-ksa-umrah',
    expected_doc_type: 'umrah_visa',
    require: ['name_ar', 'passport_no', 'visa_no', 'application_no', 'valid_from', 'valid_until'],
    text: `
      المملكة العربية السعودية
      وزارة الخارجية
      التأشيرات الإلكترونية
      تأشيرة عمرة
      اسم المسافر: خديجة سعيد عثمان المثنى
      رقم التأشيرة: 6169794577
      رقم الطلب: E821262038
      رقم الجواز: 16439690
      بدء الصلاحية: 17 يوليو 2026
      تاريخ الانتهاء: 15 أكتوبر 2026
    `,
  },
  {
    id: '7-ksa-visit',
    expected_doc_type: 'visit_visa',
    require: ['name_ar', 'passport_no', 'application_no', 'passport_expiry'],
    text: `
      المملكة العربية السعودية
      وزارة الخارجية
      طلب تأشيرة زيارة
      اسم المتقدم: عيشه عبدالله محمد فدعق
      رقم الطلب: E820916383
      رقم الجواز: 09969320
      تاريخ الإصدار: 26 يوليو 2026
      انتهاء صلاحية الجواز: 27 أبريل 2027
    `,
  },
  {
    id: '8-ksa-work-app',
    expected_doc_type: 'work_visa',
    require: ['name_ar', 'passport_no', 'application_no', 'passport_expiry'],
    text: `
      المملكة العربية السعودية
      طلب تأشيرة عمل
      اسم المتقدم: هيثم محمد سالم الاشولي
      رقم الطلب: E821783993
      رقم الجواز: 14236955
      تاريخ الإصدار: 25 يوليو 2026
      انتهاء صلاحية الجواز: 23 يونيو 2030
    `,
  },
  {
    id: '9-ksa-work-stamped',
    expected_doc_type: 'work_visa',
    require: ['passport_no', 'visa_no', 'application_no', 'valid_from', 'valid_until'],
    text: `
      المملكة العربية السعودية
      تأشيرة عمل
      رقم التأشيرة: 6146388869
      رقم الطلب: E796721834
      رقم الجواز: 10803214
      بدء الصلاحية: 20 أغسطس 2025
      تاريخ الانتهاء: 18 نوفمبر 2025
    `,
  },
];

// ---- Set up mock window / document ----
global.window = {};
global.location = { hostname: 'test.local', href: 'https://test.local/' };
global.document = { title: '', body: { innerText: '' } };

// Load content script (it registers window.__RAHAL_SCRAPE__)
require('./content-script.js');

// ---- Run tests ----
let pass = 0, fail = 0;
console.log('\n🧪 Rahaal Parsers — Sample Validation\n' + '='.repeat(60));

// Map field name → path within unified schema
const FIELD_PATH = {
  name_en:         (r) => r.traveler?.name_en,
  name_ar:         (r) => r.traveler?.name_ar,
  passport_no:     (r) => r.traveler?.passport_no,
  pnr:             (r) => r.booking?.pnr,
  ticket_no:       (r) => r.booking?.ticket_no,
  visa_no:         (r) => r.booking?.visa_no,
  application_no:  (r) => r.booking?.application_no,
  approval_no:     (r) => r.booking?.approval_no,
  flight_no:       (r) => r.booking?.flight_no,
  trip_date:       (r) => r.dates?.trip_date,
  valid_from:      (r) => r.dates?.valid_from,
  valid_until:     (r) => r.dates?.valid_until,
  passport_expiry: (r) => r.dates?.passport_expiry,
  depart_time:     (r) => r.dates?.depart_time,
  amount:          (r) => r.financial?.amount,
};

for (const f of FIXTURES) {
  global.document.body.innerText = f.text;
  global.document.title = f.id;
  if (f.id.startsWith('6-ksa') || f.id.startsWith('7-ksa') || f.id.startsWith('8-ksa') || f.id.startsWith('9-ksa')) {
    global.location.hostname = 'visa.mofa.gov.sa';
  } else {
    global.location.hostname = 'test.local';
  }

  const result = global.window.__RAHAL_SCRAPE__();
  const okDoc = result?.booking?.doc_type === f.expected_doc_type;
  const okCarrier = !f.expected_carrier || result?.booking?.carrier === f.expected_carrier;

  const missing = [];
  for (const field of (f.require || [])) {
    const v = FIELD_PATH[field] ? FIELD_PATH[field](result) : undefined;
    if (v === undefined || v === null || v === '' || v === 0) missing.push(field);
  }

  const allOk = okDoc && okCarrier && missing.length === 0;
  if (allOk) pass++; else fail++;
  const status = allOk ? '✅' : '❌';

  console.log(`\n${status} [${f.id}]  parser=${result?._parser || '(none)'}`);
  console.log(`   doc_type: ${result?.booking?.doc_type || '—'} (expected: ${f.expected_doc_type}) ${okDoc ? '✓' : '✗'}`);
  if (f.expected_carrier) console.log(`   carrier:  ${result?.booking?.carrier || '—'} ${okCarrier ? '✓' : '✗'}`);
  console.log(`   name:     ${result?.traveler?.name_en || result?.traveler?.name_ar || '—'}`);
  console.log(`   passport: ${result?.traveler?.passport_no || '—'}   pnr: ${result?.booking?.pnr || '—'}   ticket: ${result?.booking?.ticket_no || '—'}`);
  console.log(`   visa/app: ${result?.booking?.visa_no || '—'} / ${result?.booking?.application_no || '—'}   flight: ${result?.booking?.flight_no || '—'}   approval: ${result?.booking?.approval_no || '—'}`);
  console.log(`   dates:    trip=${result?.dates?.trip_date || '—'}  valid=${result?.dates?.valid_from || '—'} → ${result?.dates?.valid_until || '—'}  pp_exp=${result?.dates?.passport_expiry || '—'}`);
  console.log(`   money:    ${result?.financial?.amount || 0} ${result?.financial?.currency || '—'}`);
  if (missing.length) console.log(`   ⚠️ MISSING FIELDS: ${missing.join(', ')}`);
}

console.log('\n' + '='.repeat(60));
console.log(`Total: ${FIXTURES.length}  ✅ Passed: ${pass}  ❌ Failed: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
