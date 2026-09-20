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
      parse(rawText) {
        // ============ v1.4.1 — LABEL-ANCHORED REWRITE (field-shift root cause fix) ============
        // ROOT CAUSE of the v1.4.0 wrong mapping (verified against the real Albaraka ticket):
        //   1) passport used a GENERIC value pattern ([A-Z]{2,3}\d{4,10}) with TOP priority —
        //      it hijacked the TICKET number (MK16858) because it appears first in the text.
        //   2) ticket_no accepted digits-only → its fallback (\b[123]\d{7}\b) grabbed the
        //      PASSPORT number (16788902) instead.
        //   3) name fallback took the "longest Arabic phrase anywhere" → picked page LABELS
        //      («رقم الهوية أو الجواز») when the labelled value wasn't matched.
        //   4) bidi control chars (\u200f RLM…) sat between values/labels and broke regex
        //      adjacency (السعر «300.00 ر.س.» could degrade to SAR 0).
        //   5) trip_date fallback took the FIRST date-like token in the DOM (could be الميلاد).
        // FIX: sanitize bidi chars ONCE, then bind EVERY field to ITS OWN label — in BOTH
        // serialization orders (label→value AND value→label, since RTL tables may linearize
        // either way). NO value-pattern guessing, NO td-index assumptions, NO first-date-in-DOM.
        // A field whose label/value pair cannot be PROVEN stays EMPTY — never guessed.
        const text = (rawText || '')
          .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
          .replace(/\u00a0/g, ' ');
        const lv = (labelSrc, valueSrc) => {
          let m = text.match(new RegExp(`(?:${labelSrc})\\s*[:|]?\\s*${valueSrc}`, 'i'));
          if (m) return norm(m[1]);
          m = text.match(new RegExp(`${valueSrc}\\s*[:|]?\\s*(?:${labelSrc})`, 'i'));
          return m ? norm(m[1]) : '';
        };
        const to24 = (raw) => {
          if (!raw) return '';
          const t = raw.match(/(\d{1,2}):(\d{2})/); if (!t) return '';
          let h = parseInt(t[1], 10); const mm = t[2];
          if (/pm|مساء|م\s*$/i.test(raw) && h < 12) h += 12;
          if (/am|صباح|ص\s*$/i.test(raw) && h === 12) h = 0;
          return `${String(h).padStart(2, '0')}:${mm}`;
        };
        const TIME_SRC = '((?:AM|PM|ص|م)?\\s*\\d{1,2}:\\d{2}(?:\\s*(?:AM|PM|ص|م))?)';
        const DATE_SRC = '(20\\d{2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{1,2}|\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]20\\d{2}|\\d{1,2}\\s+[\\u0600-\\u06FF]+\\s+20\\d{2})'; // numeric OR Arabic-month («20 يونيو 2026») — still LABEL-BOUND
        // — Ticket number: bound to رقم التذكرة ONLY (alphanumeric like MK16858, or digits)
        const ticketNo = lv('رقم\\s*التذكرة|Ticket\\s*(?:No\\.?|Number)', '([A-Z]{1,3}\\s?\\d{4,12}|\\d{6,12})');
        // — Passport: bound to رقم الجواز ONLY; NEVER inherits the ticket value; empty if unproven
        let passport = lv('رقم\\s*(?:الجواز|جواز\\s*السفر)|Passport(?:\\s*No\\.?)?', '([A-Z]{0,3}\\s?\\d{5,12})');
        if (passport && ticketNo && passport.replace(/\s/g, '') === ticketNo.replace(/\s/g, '')) passport = '';
        // — Passenger name: bound to the الاسم label; a LABEL PHRASE is never a person name
        const LABEL_BLEED = /\s+(?=(?:رقم|تاريخ|السعر|المقعد|الوكيل|الفرع|اليوم|وقت|الميلاد|الرحلة|الإصدار|ملاحظات|الجواز|التذكرة)(?:\s|$))/;
        const LABEL_PHRASE = /رقم\s*(?:الهوية|الجواز|التذكرة|الرحلة)|أو\s*الجواز|وقت\s*الحضور|تاريخ\s*(?:الرحلة|الإصدار)/;
        let nameAr = lv('اسم\\s*(?:المسافر|الراكب|صاحب\\s*التذكرة)|الاسم', '([\\u0621-\\u064A][\\u0621-\\u064A \\t]{4,80})');
        if (nameAr) nameAr = norm(nameAr.split(LABEL_BLEED)[0]);
        if (!nameAr || nameAr.split(/\s+/).length < 2 || LABEL_PHRASE.test(nameAr)) nameAr = '';
        // — Trip number: الرحلة label but NOT تاريخ الرحلة; value must not be a date fragment
        const tripNo = lv('رقم\\s*الرحلة|(?<!تاريخ\\s)(?<!تاريخ)الرحلة', '(\\d{3,8})(?![\\/\\-\\d])');
        // — Route: explicit separator ONLY (never adjacent-cell guessing)
        const cities = ['المكلا', 'عدن', 'صنعاء', 'تعز', 'الحديدة', 'سيئون', 'مأرب', 'الشحر', 'مكة', 'المدينة', 'جدة', 'الرياض', 'الدمام'];
        const routeMatch = text.match(new RegExp(`(${cities.join('|')})\\s*[\\-–—→>]+\\s*(${cities.join('|')})`));
        // — Dates: each bound to ITS OWN label (الميلاد is never a trip date); unproven ⇒ empty
        const tripDateRaw = lv('تاريخ\\s*(?:الرحلة|السفر)', DATE_SRC);
        const issuedRaw = lv('(?:تاريخ\\s*)?(?:الإصدار|الطباعة)|تاريخ\\s*الحجز', DATE_SRC);
        let tripTimeRaw = '';
        { const m = text.match(new RegExp(`(?:تاريخ\\s*(?:الرحلة|السفر))\\s*[:|]?\\s*${DATE_SRC}\\s*${TIME_SRC}`, 'i')); if (m) tripTimeRaw = m[2]; }
        const attendRaw = lv('وقت\\s*(?:الحضور|التحرك|الانطلاق|المغادرة)', TIME_SRC);
        // — Amount: bound to السعر label or SAR-currency-anchored (both orders); NEVER 0-on-failure
        const amtNum = firstNum(text, /(?:السعر|القيمة|المبلغ|الأجرة)\s*[:|]?\s*([\d,]+(?:\.\d{1,2})?)/)
          || firstNum(text, /([\d,]+(?:\.\d{1,2})?)\s*(?:ر\s*\.?\s*س|SAR|ريال\s*سعودي)/i)
          || firstNum(text, /(?:ر\s*\.?\s*س|SAR)\s*\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
        const amount = amtNum > 0 ? amtNum : null; // parsing failure = NULL — never a zero-value ticket
        return {
          traveler: { name_ar: nameAr, passport_no: passport },
          booking: {
            doc_type: 'bus', carrier: 'شركة البركة للنقل البري',
            ticket_no: ticketNo, flight_no: tripNo,
            pnr: '', // bus tickets carry no explicit PNR — NEVER fabricated from other numbers
            route_from: routeMatch ? routeMatch[1] : '',
            route_to: routeMatch ? routeMatch[2] : '',
            agent: (l => l ? norm(l.split(LABEL_BLEED)[0]) : '')(lv('الوكيل', '([\\u0621-\\u064A][\\u0621-\\u064A_ \\t]{2,40})')),
            branch: (l => l ? norm(l.split(LABEL_BLEED)[0]) : '')(lv('الفرع', '([\\u0621-\\u064A][\\u0621-\\u064A \\t]{2,40})')),
            day: lv('اليوم', '(السبت|الأحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الخميس|الجمعة)') || '',
            seat_no: lv('المقعد', '(\\d{1,4})(?![\\/\\-\\d])') || '',
          },
          dates: {
            trip_date: tripDateRaw ? parseDate(tripDateRaw) : '',
            depart_time: to24(tripTimeRaw) || '',
            attend_time: to24(attendRaw) || '',
            arrive_time: '',
            issued_at: issuedRaw ? parseDate(issuedRaw) : '',
          },
          financial: { amount, currency: /ر\s*\.?\s*س|SAR|ريال\s*سعودي/i.test(text) ? 'SAR' : (detectCurrency(text) || 'SAR') },
        };
      },
    },
    // v1.3.2 — Roaadalafdal (رواد الأفضل / نجمة الأفضل) — Yemeni airline
    {
      name: 'roaadalafdal',
      match(text, ctx) { return /roaadalafdal|روادالافضل|رواد\s*الأفضل|نجمة\s*الأفضل/i.test(ctx.hostname + ctx.title + text); },
      parse(text) {
        // Pattern-based: phone (77x/78x/71x + 6 digits) — Yemeni mobile format
        const phone = first(text, /\b(7[0-9]{8})\b/) 
                   || first(text, /(?:رقم\s*(?:الهاتف|الجوال)|Phone|Mobile)[:\s]*([+\d][\d\s\-]{6,19})/i);
        // Ticket: 9-digit number (Yemeni ticket format)
        const ticketNo = first(text, /(?:رقم\s*التذكرة|Ticket\s*(?:No\.?|Number))[:\s]*(\d{7,12})/i)
                      || first(text, /\b(2\d{8}|3\d{8})\b/); // 9-digit starting with 2 or 3
        // Amount: must be followed by YER (large number, no decimals typical for YER)
        const amount = firstNum(text, /([\d,]{4,10})\s*(?:YER|ريال\s*يمني|ر\.?\s*ي)/i)
                    || firstNum(text, /(?:السعر|القيمة|المبلغ|Fare)[:\s]*([\d,]{4,10})(?!\d)/);
        // Name: after label, or fallback to longest Arabic name
        let nameAr = first(text, /(?:اسم\s*(?:المسافر|الراكب))[:\s]*([\u0600-\u06FF ]{6,80})/);
        if (!nameAr) {
          const blacklist = /شركة|البركة|للنقل|الأفضل|نجمة|رواد|وزارة|السعودية|اليمنية|طيران|عدن|صنعاء|مكة|المدينة|جدة|الرياض/;
          const arNames = (text.match(/[\u0621-\u064A][\u0621-\u064A]{2,14}(?:\s+[\u0621-\u064A][\u0621-\u064A]{1,14}){2,5}/g) || [])
            .filter(n => !blacklist.test(n));
          nameAr = arNames.sort((a, b) => b.length - a.length)[0] || '';
        }
        const passport = first(text, /(?:رقم\s*(?:الجواز|الهوية)|Passport)[:\s]*([A-Z0-9]{6,15})/i);
        const cities = ['صنعاء','عدن','المكلا','سيئون','تعز','الحديدة','الشحر','مأرب','القاهرة','جدة','الرياض','دبي'];
        const routeMatch = text.match(new RegExp(`(${cities.join('|')})\\s*[\\-–—→>]\\s*(${cities.join('|')})`))
                        || text.match(new RegExp(`(${cities.join('|')})[\\s\\-]+(${cities.join('|')})`));
        return {
          traveler: { name_ar: nameAr, passport_no: passport, phone },
          booking: {
            doc_type: 'flight', carrier: 'رواد الأفضل',
            ticket_no: ticketNo,
            pnr: first(text, /(?:PNR|Booking(?:\s*Ref)?)[:\s]*([A-Z0-9]{5,8})/i),
            route_from: routeMatch ? routeMatch[1] : '',
            route_to: routeMatch ? routeMatch[2] : '',
          },
          dates: {
            trip_date: parseDate(first(text, /(?:تاريخ\s*(?:الرحلة|السفر))[:\s]*([^\n]+)/)) || parseDate(first(text, /(20\d{2}[\/\-]\d{1,2}[\/\-]\d{1,2})/)),
            depart_time: parseTime(first(text, /(?:وقت\s*(?:الإقلاع|المغادرة))[:\s]*([^\n]+)/i)),
            arrive_time: parseTime(first(text, /(?:وقت\s*الوصول)[:\s]*([^\n]+)/i)),
            issued_at: parseDate(first(text, /(?:تاريخ\s*(?:الإصدار|الحجز))[:\s]*([^\n]+)/i)),
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

  // v1.4.1 — SEND GUARDS: a wrong parse must NEVER become a financially-valid record in Rahaal.
  // Used by BOTH send paths (popup PDF confirm + in-page widget confirm) BEFORE any ingest call.
  const KNOWN_LABEL_PHRASES = /رقم\s*(?:الهوية|الجواز|التذكرة|الرحلة)|أو\s*الجواز|وقت\s*الحضور|تاريخ\s*(?:الرحلة|الإصدار)|اسم\s*المسافر/;
  function validateForSend(payload) {
    if (!payload || !payload.booking || !payload.booking.doc_type) return { ok: false, errors: ['لم يتم التعرف على المستند'] };
    const errors = [];
    const t = payload.traveler || {}, bk = payload.booking, fn = payload.financial || {};
    const name = norm(t.name_ar || t.name_en || '');
    if (!name || name.split(/\s+/).length < 2) errors.push('اسم المسافر غير مقروء من المستند');
    else if (KNOWN_LABEL_PHRASES.test(name)) errors.push('حقل المسافر التقط نص Label من الصفحة وليس اسماً فعلياً');
    if (bk.doc_type === 'bus' || bk.doc_type === 'flight') {
      if (!norm(bk.ticket_no || '')) errors.push('رقم التذكرة غير مقروء من المستند');
      const amt = Number(fn.amount);
      if (!(amt > 0)) errors.push('المبلغ غير مقروء من المستند — لا يُسمح بإنشاء تذكرة بمبلغ 0');
    }
    return { ok: errors.length === 0, errors };
  }

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
  target.RahalParsers = { scrape, PARSERS, validateForSend };
})();
