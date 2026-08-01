// Rahaal Extension — Shared Parsers Library (v1.2)
// Exposes: window.RahalParsers = { scrape(text, {hostname, title}?)  → unifiedSchema | null }
// Used by BOTH content-script (HTML pages) and popup (PDF text extraction).

(function () {
  const norm = (s) => (s || '').replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
  const first = (text, re) => { const m = text.match(re); return m ? norm(m[1]) : ''; };
  const firstNum = (text, re) => { const v = first(text, re); return v ? parseFloat(v.replace(/,/g, '')) : 0; };
  const has = (text, ...words) => words.every(w => text.includes(w));
  const hasAny = (text, ...words) => words.some(w => text.includes(w));

  const AR_MONTHS = {
    'يناير':1,'كانون الثاني':1,'فبراير':2,'شباط':2,'مارس':3,'آذار':3,'أبريل':4,'ابريل':4,'نيسان':4,
    'مايو':5,'أيار':5,'يونيو':6,'حزيران':6,'يوليو':7,'تموز':7,'أغسطس':8,'اغسطس':8,'آب':8,
    'سبتمبر':9,'أيلول':9,'أكتوبر':10,'اكتوبر':10,'تشرين الأول':10,'نوفمبر':11,'تشرين الثاني':11,
    'ديسمبر':12,'كانون الأول':12,
  };
  const EN_MONTHS = { JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12 };

  function parseDate(raw) {
    if (!raw) return '';
    raw = norm(raw);
    let m = raw.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](20\d{2})$/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    m = raw.match(/(\d{1,2})\s+([\u0600-\u06FF ]+?)\s+(20\d{2})/);
    if (m && AR_MONTHS[m[2].trim()]) return `${m[3]}-${String(AR_MONTHS[m[2].trim()]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    m = raw.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(20\d{2})/i);
    if (m) return `${m[3]}-${String(EN_MONTHS[m[2].toUpperCase()]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return raw;
  }
  function parseTime(raw) { if (!raw) return ''; const m = raw.match(/(\d{1,2}):(\d{2})/); return m ? `${String(m[1]).padStart(2,'0')}:${m[2]}` : ''; }
  function detectCurrency(text) {
    if (/\bUSD\b|\$\s*\d/.test(text)) return 'USD';
    if (/\bSAR\b|ريال\s*سعودي|SR\b/.test(text)) return 'SAR';
    if (/\bYER\b|ريال\s*يمني|YR\b/.test(text)) return 'YER';
    return '';
  }

  // ==================== Parsers ====================
  const PARSERS = [
    {
      name: 'yemenia',
      match(text, ctx) { return /yemenia|iy\.com|yemenairways/i.test(ctx.hostname + ctx.title) || /YEMENIA|IY\s*\d{3}/.test(text) || hasAny(text, 'اليمنية', 'Yemenia Airways'); },
      parse(text) {
        return {
          traveler: {
            name_en: first(text, /(?:Passenger(?:\s*Name)?|Name)[:\s]+([A-Z][A-Z ]+\/[A-Z][A-Z ]{2,60})/i) || first(text, /^([A-Z]{2,}\/[A-Z][A-Z ]{2,60})$/m),
            passport_no: first(text, /Passport(?:\s*No\.?)?[:\s]+([A-Z]?\d{6,12})/i) || first(text, /رقم\s*الجواز[:\s]+(\d{6,12})/),
          },
          booking: {
            doc_type: 'flight', carrier: 'Yemenia Airways', flight_no: first(text, /\b(IY\s*\d{2,4})\b/i),
            pnr: first(text, /(?:PNR|Booking(?:\s*Ref)?)[:\s]+([A-Z0-9]{5,8})/i),
            ticket_no: first(text, /(?:Ticket(?:\s*Number)?|E-Ticket)[:\s]+(\d{3}\s*\d{10,12})/i) || first(text, /\b(6\d{2}\s*\d{10,12})\b/),
            route_from: first(text, /From[:\s]+([A-Z]{3})/) || first(text, /\b(JED|SAH|ADE|CAI|DXB|IST)\b\s*[→\-–]/),
            route_to: first(text, /To[:\s]+([A-Z]{3})/) || first(text, /[→\-–]\s*\b(JED|SAH|ADE|CAI|DXB|IST)\b/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:Flight\s*Date|Travel\s*Date|تاريخ\s*الرحلة)[:\s]+([^\n]+)/i)),
            depart_time: parseTime(first(text, /Departure[:\s]+(\d{1,2}:\d{2})/i)),
            arrive_time: parseTime(first(text, /Arrival[:\s]+(\d{1,2}:\d{2})/i)),
            issued_at: parseDate(first(text, /(?:Issue(?:d)?|Issued\s*Date|تاريخ\s*الإصدار)[:\s]+([^\n]+)/i)),
          },
          financial: { amount: firstNum(text, /(?:Total(?:\s*Fare)?|Grand\s*Total|الإجمالي)[:\s]+([\d,]+\.\d{2})/i), currency: detectCurrency(text) || 'USD' },
        };
      },
    },
    {
      name: 'flyaden',
      match(text, ctx) { return /flyaden|adenairways/i.test(ctx.hostname + ctx.title) || /Fly\s*Aden|طيران\s*عدن/i.test(text); },
      parse(text) {
        return {
          traveler: {
            name_en: first(text, /(?:Passenger(?:\s*Name)?|Name)[:\s]+([A-Z][A-Z ]+\/[A-Z][A-Z ]{2,60})/i) || first(text, /^([A-Z]{2,}\/[A-Z][A-Z ]{2,60})$/m),
            passport_no: first(text, /Passport(?:\s*No\.?)?[:\s]+([A-Z]?\d{6,12})/i),
          },
          booking: {
            doc_type: 'flight', carrier: 'Fly Aden',
            pnr: first(text, /(?:PNR|Booking(?:\s*Ref)?)[:\s]+([A-Z0-9]{6,8})/i),
            ticket_no: first(text, /(?:E-?Ticket(?:\s*Number)?|E-?Ticket)[:\s]+([\d\s/]+)/i) || first(text, /\b(000\s*\d{10,12}\/?\d?)\b/),
            route_from: first(text, /From[:\s]+([A-Z]{3})/), route_to: first(text, /To[:\s]+([A-Z]{3})/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:Flight\s*Date|تاريخ\s*الرحلة)[:\s]+([^\n]+)/i)),
            depart_time: parseTime(first(text, /Departure[:\s]+(\d{1,2}:\d{2})/i)),
            arrive_time: parseTime(first(text, /Arrival[:\s]+(\d{1,2}:\d{2})/i)),
            issued_at: parseDate(first(text, /(?:Issue(?:d)?|تاريخ\s*الإصدار)[:\s]+([^\n]+)/i)),
          },
          financial: { amount: firstNum(text, /(?:Total|الإجمالي)[:\s]+([\d,]+\.\d{2})/i), currency: detectCurrency(text) || 'USD' },
        };
      },
    },
    {
      name: 'security-approval-type1',
      match(text) { return has(text, 'موافقة', 'أمنية') && (hasAny(text, 'الخطوط الأثيوبية', 'الأثيوبية', 'Ethiopian') || hasAny(text, 'ET4', 'ET5')); },
      parse(text) {
        return {
          traveler: {
            name_ar: first(text, /(?:اسم\s*(?:المسافر|الشخص)|الاسم)[:\s]+([\u0600-\u06FF ]{6,80})/),
            passport_no: first(text, /(?:رقم\s*(?:الجواز|السفر)|Passport)[:\s]+(\d{6,12})/),
          },
          booking: {
            doc_type: 'security_approval', carrier: /الأثيوبية|Ethiopian/i.test(text) ? 'الخطوط الأثيوبية' : '',
            flight_no: first(text, /\b(ET\s*\d{2,4})\b/i),
            approval_no: first(text, /(?:رقم\s*الموافقة|Approval\s*No)[:\s]+([A-Z0-9]{3,15})/),
            ticket_no: first(text, /(?:رقم\s*التذكرة|Ticket)[:\s]+(\d{10,15})/),
            pnr: first(text, /(?:رقم\s*الحجز|PNR|Booking\s*Ref)[:\s]+([A-Z0-9]{5,8})/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:تاريخ\s*الرحلة)[:\s]+([^\n]+)/)),
            issued_at: parseDate(first(text, /(?:تاريخ\s*(?:الإصدار|الموافقة))[:\s]+([^\n]+)/)),
            valid_from: parseDate(first(text, /(?:تاريخ\s*(?:الإصدار|الموافقة))[:\s]+([^\n]+)/)),
            valid_until: parseDate(first(text, /(?:تاريخ\s*(?:الانتهاء|انتهاء\s*الصلاحية))[:\s]+([^\n]+)/)),
          },
          financial: { amount: 0, currency: 'USD' },
        };
      },
    },
    {
      name: 'security-approval-type2',
      match(text) { return (has(text, 'موافقة', 'أمنية') || has(text, 'تصريح', 'موافقة')) && hasAny(text, 'مصر', 'المصرية', 'Egypt', 'CAI') && !hasAny(text, 'الأثيوبية', 'Ethiopian'); },
      parse(text) {
        return {
          traveler: {
            name_ar: first(text, /(?:اسم\s*(?:المسافر|الشخص)|الاسم)[:\s]+([\u0600-\u06FF ]{6,80})/),
            passport_no: first(text, /(?:رقم\s*(?:الجواز|السفر))[:\s]+(\d{6,12})/),
          },
          booking: { doc_type: 'security_approval', approval_no: first(text, /(?:رقم\s*(?:الموافقة|التصريح))[:\s]+(\d{2,8})/) },
          dates: {
            issued_at: parseDate(first(text, /(?:تاريخ\s*الإصدار)[:\s]+([^\n]+)/)),
            valid_from: parseDate(first(text, /(?:تاريخ\s*الإصدار)[:\s]+([^\n]+)/)),
            valid_until: parseDate(first(text, /(?:تاريخ\s*(?:الانتهاء|انتهاء\s*الصلاحية))[:\s]+([^\n]+)/)),
          },
          financial: { amount: 0, currency: 'USD' },
        };
      },
    },
    {
      name: 'albaraka-bus',
      match(text, ctx) { return /albaraka|bus/i.test(ctx.hostname + ctx.title) || hasAny(text, 'البركة', 'نقل بري', 'حافلة'); },
      parse(text) {
        // v1.3.1 — matches actual Al-Baraka ticket layout
        // Real sample: ticket_no=16539300 (numeric), passport=MK14733 (alphanumeric), name=محروس عبدالله محروس عمر, 300.00 ر.س, route=عدن - جدة
        const nameAr = first(text, /(?:اسم\s*(?:المسافر|الراكب|صاحب\s*التذكرة)|المسافر|الراكب)[:\s]*([\u0600-\u06FF ]{4,80})/);
        // Passport: alphanumeric like MK14733 or plain digits
        const passport = first(text, /(?:رقم\s*(?:الجواز|الهوية|السفر|البطاقة))[:\s]*([A-Z]{1,3}\d{4,10}|\d{6,12})/i);
        // Ticket: pure digits (8-10) OR prefixed
        const ticketNo = first(text, /(?:رقم\s*التذكرة|Ticket\s*No\.?)[:\s]*(\d{6,12}|[A-Z]{1,3}\d{4,10})/i);
        const flightNo = first(text, /(?:رقم\s*الرحلة|Trip|Flight)\s*(?:No\.?)?[:\s]*(\d{3,8})/i);
        // Route between YE + KSA cities
        const cities = ['المكلا','عدن','صنعاء','تعز','الحديدة','سيئون','مأرب','الشحر','مكة','المدينة','جدة','الرياض','الدمام'];
        const routeMatch = text.match(new RegExp(`(${cities.join('|')})\\s*[\\-–—→>]\\s*(${cities.join('|')})`));
        const amount = firstNum(text, /(?:السعر|القيمة|المبلغ|Price|Total)[:\s]*([\d,]+\.?\d*)\s*(?:ر\.?\s*س|SAR|ريال)/i)
                    || firstNum(text, /([\d,]+\.\d{2})\s*(?:ر\.?\s*س|SAR|ريال\s*سعودي)/i)
                    || firstNum(text, /(?:السعر|القيمة|المبلغ)[:\s]*([\d,]+\.?\d*)/);
        return {
          traveler: { name_ar: nameAr, passport_no: passport },
          booking: {
            doc_type: 'bus', carrier: 'شركة البركة للنقل البري',
            ticket_no: ticketNo, flight_no: flightNo,
            route_from: routeMatch ? routeMatch[1] : first(text, /(?:من|From)[:\s]*([\u0600-\u06FFA-Za-z]{3,30})/),
            route_to: routeMatch ? routeMatch[2] : first(text, /(?:إلى|To)[:\s]*([\u0600-\u06FFA-Za-z]{3,30})/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:تاريخ\s*(?:الرحلة|السفر|التحرك))[:\s]*([^\n]+)/)),
            depart_time: parseTime(first(text, /(?:وقت\s*(?:التحرك|الانطلاق|المغادرة))[:\s]*([^\n]+)/)),
            arrive_time: parseTime(first(text, /(?:وقت\s*الوصول)[:\s]*([^\n]+)/)),
            issued_at: parseDate(first(text, /(?:تاريخ\s*(?:الإصدار|الطباعة|الحجز))[:\s]*([^\n]+)/)),
          },
          financial: { amount, currency: 'SAR' },
        };
      },
    },
    // v1.3 — Roaadalafdal (رواد الأفضل / نجمة الأفضل) — Yemeni airline
    {
      name: 'roaadalafdal',
      match(text, ctx) {
        return /roaadalafdal|روادالافضل|رواد\s*الأفضل|نجمة\s*الأفضل/i.test(ctx.hostname + ctx.title + text);
      },
      parse(text) {
        // Real sample: ticket=262061521, name=محمد سالم سعيد بن عمر بأعمر, phone=776612938, 30000 YER, route=عدن - الشحر, 2026-08-01
        const nameAr = first(text, /(?:اسم\s*(?:المسافر|الراكب))[:\s]*([\u0600-\u06FF ]{4,80})/);
        const nameEn = first(text, /(?:Passenger(?:\s*Name)?|Name)[:\s]*([A-Z][A-Z ]+\/[A-Z][A-Z ]{2,60})/i);
        const passport = first(text, /(?:رقم\s*(?:الجواز|الهوية)|Passport)[:\s]*([A-Z0-9]{6,15})/i);
        const phone = first(text, /(?:رقم\s*(?:الهاتف|الجوال)|Phone|Mobile)[:\s]*([+\d][\d\s\-]{6,19})/i);
        const ticketNo = first(text, /(?:رقم\s*التذكرة|Ticket\s*(?:No\.?|Number))[:\s]*(\d{6,12}|[A-Z0-9\-]{4,20})/i);
        const cities = ['صنعاء','عدن','المكلا','سيئون','تعز','الحديدة','الشحر','مأرب','القاهرة','جدة','الرياض','دبي','SAH','ADE','MYN','CAI','JED','RUH','DXB'];
        const routeMatch = text.match(new RegExp(`(${cities.join('|')})\\s*[\\-–—→>]\\s*(${cities.join('|')})`));
        const amount = firstNum(text, /(?:السعر|القيمة|المبلغ|Price|Total|Fare)[:\s]*([\d,]+\.?\d*)\s*(?:ر\.?\s*ي|YER|ريال)/i)
                    || firstNum(text, /([\d,]+)\s*(?:YER|ريال\s*يمني|ر\.?\s*ي)/i)
                    || firstNum(text, /(?:السعر|القيمة|المبلغ)[:\s]*([\d,]+\.?\d*)/);
        return {
          traveler: { name_ar: nameAr, name_en: nameEn, passport_no: passport, phone },
          booking: {
            doc_type: 'flight', carrier: 'رواد الأفضل',
            ticket_no: ticketNo,
            pnr: first(text, /(?:PNR|Booking(?:\s*Ref)?)[:\s]*([A-Z0-9]{5,8})/i),
            route_from: routeMatch ? routeMatch[1] : first(text, /(?:من|From)[:\s]*([\u0600-\u06FFA-Za-z]{3,30})/),
            route_to: routeMatch ? routeMatch[2] : first(text, /(?:إلى|To)[:\s]*([\u0600-\u06FFA-Za-z]{3,30})/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:تاريخ\s*(?:الرحلة|السفر)|Flight\s*Date)[:\s]*([^\n]+)/i)),
            depart_time: parseTime(first(text, /(?:وقت\s*(?:الإقلاع|المغادرة)|Departure)[:\s]*([^\n]+)/i)),
            arrive_time: parseTime(first(text, /(?:وقت\s*الوصول|Arrival)[:\s]*([^\n]+)/i)),
            issued_at: parseDate(first(text, /(?:تاريخ\s*(?:الإصدار|الحجز)|Issued)[:\s]*([^\n]+)/i)),
          },
          financial: { amount, currency: 'YER' },
        };
      },
    },
    {
      name: 'ksa-evisa',
      match(text, ctx) { return /visa\.mofa\.gov\.sa|enjazit|visa\.gov\.sa/i.test(ctx.hostname) || hasAny(text, 'المملكة العربية السعودية', 'وزارة الخارجية', 'التأشيرات الإلكترونية') || /E\d{9}/.test(text); },
      parse(text) {
        let docType = 'work_visa';
        if (hasAny(text, 'عمرة')) docType = 'umrah_visa';
        else if (hasAny(text, 'زيارة')) docType = 'visit_visa';
        else if (hasAny(text, 'عمل')) docType = 'work_visa';
        return {
          traveler: {
            name_ar: first(text, /(?:اسم\s*(?:المسافر|الشخص|المتقدم)|الاسم(?:\s*الكامل)?)[:\s]+([\u0600-\u06FF ]{6,80})/),
            passport_no: first(text, /(?:رقم\s*(?:الجواز|السفر)|Passport)[:\s]+([A-Z]?\d{6,12})/i),
            nationality: first(text, /(?:الجنسية)[:\s]+([\u0600-\u06FF]{3,30})/),
          },
          booking: {
            doc_type: docType,
            visa_no: first(text, /(?:رقم\s*التأشيرة|Visa\s*No\.?)[:\s]+(\d{9,15})/i),
            application_no: first(text, /(?:رقم\s*الطلب|Application\s*No\.?|Reference)[:\s]+(E\d{9,12})/i) || first(text, /\b(E\d{9,12})\b/),
          },
          dates: {
            valid_from: parseDate(first(text, /(?:بدء\s*(?:الصلاحية|السماح)|Valid\s*From|Issue\s*Date)[:\s]+([^\n]+)/i)),
            valid_until: parseDate(first(text, /(?:(?:تاريخ\s*)?(?:الانتهاء|انتهاء\s*الصلاحية)|Valid\s*(?:Until|To)|Expiry)[:\s]+([^\n]+)/i)),
            issued_at: parseDate(first(text, /(?:تاريخ\s*(?:الإصدار|الطلب))[:\s]+([^\n]+)/)),
            passport_expiry: parseDate(first(text, /(?:انتهاء\s*(?:الجواز|صلاحية\s*الجواز)|Passport\s*Expiry)[:\s]+([^\n]+)/i)),
          },
          financial: { amount: firstNum(text, /(?:الرسوم|القيمة|Fee)[:\s]+([\d,]+\.?\d*)/i), currency: 'SAR' },
        };
      },
    },
    {
      name: 'generic-airline',
      match(text) { return hasAny(text, 'PNR', 'E-Ticket', 'e-ticket', 'Passenger Name', 'Booking Reference') && /\b(JED|SAH|ADE|CAI|DXB|IST|DOH|AUH|KWI|BAH|MCT)\b/.test(text); },
      parse(text) {
        return {
          traveler: {
            name_en: first(text, /(?:Passenger|Name)[:\s]+([A-Z][A-Z ]+\/[A-Z][A-Z ]{2,60})/i),
            passport_no: first(text, /Passport(?:\s*No\.?)?[:\s]+([A-Z]?\d{6,12})/i),
          },
          booking: {
            doc_type: 'flight',
            pnr: first(text, /(?:PNR|Booking(?:\s*Ref)?)[:\s]+([A-Z0-9]{5,8})/i),
            ticket_no: first(text, /(?:E?-?Ticket(?:\s*Number)?)[:\s]+([\d\s]+)/i),
            route_from: first(text, /From[:\s]+([A-Z]{3})/), route_to: first(text, /To[:\s]+([A-Z]{3})/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:Flight\s*Date|Travel\s*Date)[:\s]+([^\n]+)/i)),
            depart_time: parseTime(first(text, /Departure[:\s]+(\d{1,2}:\d{2})/i)),
            arrive_time: parseTime(first(text, /Arrival[:\s]+(\d{1,2}:\d{2})/i)),
            issued_at: parseDate(first(text, /(?:Issued|Issue\s*Date)[:\s]+([^\n]+)/i)),
          },
          financial: { amount: firstNum(text, /(?:Total(?:\s*Fare)?|Grand\s*Total)[:\s]+([\d,]+\.\d{2})/i), currency: detectCurrency(text) || 'USD' },
        };
      },
    },
  ];

  function scrape(text, ctx) {
    if (!text || text.length < 20) return null;
    ctx = ctx || { hostname: '', title: '' };
    for (const p of PARSERS) {
      try {
        if (p.match(text, ctx)) {
          const data = p.parse(text);
          data._parser = p.name;
          if (!data.booking?.doc_type) continue;
          return data;
        }
      } catch (_) { /* try next */ }
    }
    return null;
  }

  const target = (typeof window !== 'undefined') ? window : (typeof self !== 'undefined' ? self : globalThis);
  target.RahalParsers = { scrape, PARSERS };
})();
