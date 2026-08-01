// Rahaal Extension — Content Script v1.1
// Injected into every https page. Detects supported document types and extracts
// unified booking data from the visible text (works even when PDFs are opened in the browser).
//
// Exposes:
//   window.__RAHAL_SCRAPE__()      → unified schema | null
//   window.__RAHAL_OPEN_WIDGET__() → opens the in-page confirmation widget
//
// Supported doc_types (v1.1):
//   flight            — Yemenia, Fly Aden, generic airline e-ticket
//   bus               — Al-Baraka Bus (البركة للنقل البري)
//   umrah_visa        — KSA e-Visa (تأشيرة عمرة)
//   visit_visa        — KSA e-Visa (تأشيرة زيارة)
//   work_visa         — KSA e-Visa (تأشيرة عمل / طلب تأشيرة عمل)
//   security_approval — Ethiopia/Egypt security approval (نوع 1) + Egypt Type 2

(function () {
  if (window.__RAHAL_INSTALLED__) return; window.__RAHAL_INSTALLED__ = true;

  // ==================== Helpers ====================
  const TEXT = () => document.body ? document.body.innerText : '';
  const norm = (s) => (s || '').replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
  const first = (text, re) => { const m = text.match(re); return m ? norm(m[1]) : ''; };
  const firstNum = (text, re) => { const v = first(text, re); return v ? parseFloat(v.replace(/,/g, '')) : 0; };
  const has = (text, ...words) => words.every(w => text.includes(w));
  const hasAny = (text, ...words) => words.some(w => text.includes(w));

  // Arabic month → number (for dates like "24 مارس 2026")
  const AR_MONTHS = {
    'يناير':1,'كانون الثاني':1,
    'فبراير':2,'شباط':2,
    'مارس':3,'آذار':3,
    'أبريل':4,'ابريل':4,'نيسان':4,
    'مايو':5,'أيار':5,
    'يونيو':6,'حزيران':6,
    'يوليو':7,'تموز':7,
    'أغسطس':8,'اغسطس':8,'آب':8,
    'سبتمبر':9,'أيلول':9,
    'أكتوبر':10,'اكتوبر':10,'تشرين الأول':10,
    'نوفمبر':11,'تشرين الثاني':11,
    'ديسمبر':12,'كانون الأول':12,
  };
  const EN_MONTHS = { JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12 };

  // Parse dates in many formats → ISO YYYY-MM-DD
  function parseDate(raw) {
    if (!raw) return '';
    raw = norm(raw);
    // 2026-08-15 or 2026/08/15
    let m = raw.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    // 15/08/2026 or 15-08-2026
    m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](20\d{2})$/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    // 24 مارس 2026
    m = raw.match(/(\d{1,2})\s+([\u0600-\u06FF ]+?)\s+(20\d{2})/);
    if (m && AR_MONTHS[m[2].trim()]) {
      return `${m[3]}-${String(AR_MONTHS[m[2].trim()]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
    // 24 MAR 2026
    m = raw.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(20\d{2})/i);
    if (m) return `${m[3]}-${String(EN_MONTHS[m[2].toUpperCase()]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return raw; // best-effort passthrough
  }

  function parseTime(raw) {
    if (!raw) return '';
    const m = raw.match(/(\d{1,2}):(\d{2})/);
    return m ? `${String(m[1]).padStart(2,'0')}:${m[2]}` : '';
  }

  // Currency detection helpers
  function detectCurrency(text) {
    if (/\bUSD\b|\$\s*\d/.test(text)) return 'USD';
    if (/\bSAR\b|ريال\s*سعودي|SR\b/.test(text)) return 'SAR';
    if (/\bYER\b|ريال\s*يمني|YR\b/.test(text)) return 'YER';
    return '';
  }

  // ==================== Parsers ====================
  const PARSERS = [
    // ---------------- YEMENIA (طيران اليمنية) ----------------
    {
      name: 'yemenia',
      match(text) {
        return /yemenia|iy\.com|yemenairways/i.test(location.hostname + document.title)
            || /YEMENIA|IY\s*\d{3}/.test(text)
            || hasAny(text, 'اليمنية', 'Yemenia Airways');
      },
      parse(text) {
        return {
          traveler: {
            name_en: first(text, /(?:Passenger(?:\s*Name)?|Name)[:\s]+([A-Z][A-Z ]+\/[A-Z][A-Z ]{2,60})/i)
                  || first(text, /^([A-Z]{2,}\/[A-Z][A-Z ]{2,60})$/m),
            passport_no: first(text, /Passport(?:\s*No\.?)?[:\s]+([A-Z]?\d{6,12})/i)
                       || first(text, /رقم\s*الجواز[:\s]+(\d{6,12})/),
          },
          booking: {
            doc_type: 'flight', carrier: 'Yemenia Airways', flight_no: first(text, /\b(IY\s*\d{2,4})\b/i),
            pnr: first(text, /(?:PNR|Booking(?:\s*Ref)?)[:\s]+([A-Z0-9]{5,8})/i),
            ticket_no: first(text, /(?:Ticket(?:\s*Number)?|E-Ticket)[:\s]+(\d{3}\s*\d{10,12})/i)
                     || first(text, /\b(6\d{2}\s*\d{10,12})\b/),
            route_from: first(text, /From[:\s]+([A-Z]{3})/) || first(text, /\b(JED|SAH|ADE|CAI|DXB|IST)\b\s*[→\-–]/),
            route_to: first(text, /To[:\s]+([A-Z]{3})/) || first(text, /[→\-–]\s*\b(JED|SAH|ADE|CAI|DXB|IST)\b/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:Flight\s*Date|Travel\s*Date|تاريخ\s*الرحلة)[:\s]+([^\n]+)/i)),
            depart_time: parseTime(first(text, /Departure[:\s]+(\d{1,2}:\d{2})/i)),
            arrive_time: parseTime(first(text, /Arrival[:\s]+(\d{1,2}:\d{2})/i)),
            issued_at: parseDate(first(text, /(?:Issue(?:d)?|Issued\s*Date|تاريخ\s*الإصدار)[:\s]+([^\n]+)/i)),
          },
          financial: {
            amount: firstNum(text, /(?:Total(?:\s*Fare)?|Grand\s*Total|الإجمالي)[:\s]+([\d,]+\.\d{2})/i),
            currency: detectCurrency(text) || 'USD',
          },
          source_url: location.href,
        };
      },
    },

    // ---------------- FLY ADEN (طيران عدن) ----------------
    {
      name: 'flyaden',
      match(text) {
        return /flyaden|adenairways/i.test(location.hostname + document.title)
            || /Fly\s*Aden|طيران\s*عدن/i.test(text);
      },
      parse(text) {
        return {
          traveler: {
            name_en: first(text, /(?:Passenger(?:\s*Name)?|Name)[:\s]+([A-Z][A-Z ]+\/[A-Z][A-Z ]{2,60})/i)
                  || first(text, /^([A-Z]{2,}\/[A-Z][A-Z ]{2,60})$/m),
            passport_no: first(text, /Passport(?:\s*No\.?)?[:\s]+([A-Z]?\d{6,12})/i),
          },
          booking: {
            doc_type: 'flight', carrier: 'Fly Aden',
            pnr: first(text, /(?:PNR|Booking(?:\s*Ref)?)[:\s]+([A-Z0-9]{6,8})/i),
            ticket_no: first(text, /(?:E-?Ticket(?:\s*Number)?|E-?Ticket)[:\s]+([\d\s/]+)/i)
                     || first(text, /\b(000\s*\d{10,12}\/?\d?)\b/),
            route_from: first(text, /From[:\s]+([A-Z]{3})/),
            route_to: first(text, /To[:\s]+([A-Z]{3})/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:Flight\s*Date|تاريخ\s*الرحلة)[:\s]+([^\n]+)/i)),
            depart_time: parseTime(first(text, /Departure[:\s]+(\d{1,2}:\d{2})/i)),
            arrive_time: parseTime(first(text, /Arrival[:\s]+(\d{1,2}:\d{2})/i)),
            issued_at: parseDate(first(text, /(?:Issue(?:d)?|تاريخ\s*الإصدار)[:\s]+([^\n]+)/i)),
          },
          financial: {
            amount: firstNum(text, /(?:Total|الإجمالي)[:\s]+([\d,]+\.\d{2})/i),
            currency: detectCurrency(text) || 'USD',
          },
          source_url: location.href,
        };
      },
    },

    // ---------------- ETHIOPIA / EGYPT SECURITY APPROVAL — TYPE 1 ----------------
    {
      name: 'security-approval-type1',
      match(text) {
        return has(text, 'موافقة', 'أمنية') && (hasAny(text, 'الخطوط الأثيوبية', 'الأثيوبية', 'Ethiopian') || hasAny(text, 'ET4', 'ET5'));
      },
      parse(text) {
        return {
          traveler: {
            name_ar: first(text, /(?:اسم\s*(?:المسافر|الشخص)|الاسم)[:\s]+([\u0600-\u06FF ]{6,80})/),
            passport_no: first(text, /(?:رقم\s*(?:الجواز|السفر)|Passport)[:\s]+(\d{6,12})/),
          },
          booking: {
            doc_type: 'security_approval',
            carrier: /الأثيوبية|Ethiopian/i.test(text) ? 'الخطوط الأثيوبية' : '',
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
          source_url: location.href,
        };
      },
    },

    // ---------------- EGYPT SECURITY APPROVAL — TYPE 2 ----------------
    {
      name: 'security-approval-type2',
      match(text) {
        return (has(text, 'موافقة', 'أمنية') || has(text, 'تصريح', 'موافقة'))
            && hasAny(text, 'مصر', 'المصرية', 'Egypt', 'CAI')
            && !hasAny(text, 'الأثيوبية', 'Ethiopian');
      },
      parse(text) {
        return {
          traveler: {
            name_ar: first(text, /(?:اسم\s*(?:المسافر|الشخص)|الاسم)[:\s]+([\u0600-\u06FF ]{6,80})/),
            passport_no: first(text, /(?:رقم\s*(?:الجواز|السفر))[:\s]+(\d{6,12})/),
          },
          booking: {
            doc_type: 'security_approval',
            approval_no: first(text, /(?:رقم\s*(?:الموافقة|التصريح))[:\s]+(\d{2,8})/),
          },
          dates: {
            issued_at: parseDate(first(text, /(?:تاريخ\s*الإصدار)[:\s]+([^\n]+)/)),
            valid_from: parseDate(first(text, /(?:تاريخ\s*الإصدار)[:\s]+([^\n]+)/)),
            valid_until: parseDate(first(text, /(?:تاريخ\s*(?:الانتهاء|انتهاء\s*الصلاحية))[:\s]+([^\n]+)/)),
          },
          financial: { amount: 0, currency: 'USD' },
          source_url: location.href,
        };
      },
    },

    // ---------------- ALBARAKA BUS (البركة للنقل البري) ----------------
    {
      name: 'albaraka-bus',
      match(text) {
        return /albaraka|bus/i.test(location.hostname + document.title)
            || hasAny(text, 'البركة', 'نقل بري', 'حافلة');
      },
      parse(text) {
        return {
          traveler: {
            name_ar: first(text, /(?:اسم\s*(?:الراكب|المسافر))[:\s]+([\u0600-\u06FF ]{4,80})/),
            passport_no: first(text, /(?:رقم\s*(?:الجواز|الهوية))[:\s]+(\d{6,12})/),
          },
          booking: {
            doc_type: 'bus', carrier: 'شركة البركة للنقل البري',
            ticket_no: first(text, /(?:رقم\s*التذكرة|Ticket\s*No)[:\s]+([A-Z]{1,3}\d{3,8})/i),
            flight_no: first(text, /(?:رقم\s*الرحلة|Trip\s*No)[:\s]+(\d{3,8})/),
            route_from: first(text, /(?:من|From)[:\s]+([\u0600-\u06FFA-Za-z]{3,30})/),
            route_to: first(text, /(?:إلى|To)[:\s]+([\u0600-\u06FFA-Za-z]{3,30})/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:تاريخ\s*(?:الرحلة|السفر))[:\s]+([^\n]+)/)),
            depart_time: parseTime(first(text, /(?:وقت\s*(?:التحرك|الانطلاق|المغادرة))[:\s]+([^\n]+)/)),
            arrive_time: parseTime(first(text, /(?:وقت\s*(?:الوصول))[:\s]+([^\n]+)/)),
            issued_at: parseDate(first(text, /(?:تاريخ\s*(?:الإصدار|الطباعة))[:\s]+([^\n]+)/)),
          },
          financial: {
            amount: firstNum(text, /(?:السعر|القيمة|المبلغ)[:\s]+([\d,]+\.?\d*)/),
            currency: detectCurrency(text) || 'SAR',
          },
          source_url: location.href,
        };
      },
    },

    // ---------------- KSA E-VISA — UMRAH / VISIT / WORK ----------------
    {
      name: 'ksa-evisa',
      match(text) {
        return /visa\.mofa\.gov\.sa|enjazit|visa\.gov\.sa/i.test(location.hostname)
            || hasAny(text, 'المملكة العربية السعودية', 'وزارة الخارجية', 'التأشيرات الإلكترونية')
            || /E\d{9}/.test(text); // e-visa application number pattern
      },
      parse(text) {
        // Detect visa subtype
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
            application_no: first(text, /(?:رقم\s*الطلب|Application\s*No\.?|Reference)[:\s]+(E\d{9,12})/i)
                          || first(text, /\b(E\d{9,12})\b/),
          },
          dates: {
            valid_from: parseDate(first(text, /(?:بدء\s*(?:الصلاحية|السماح)|Valid\s*From|Issue\s*Date)[:\s]+([^\n]+)/i)),
            valid_until: parseDate(first(text, /(?:(?:تاريخ\s*)?(?:الانتهاء|انتهاء\s*الصلاحية)|Valid\s*(?:Until|To)|Expiry)[:\s]+([^\n]+)/i)),
            issued_at: parseDate(first(text, /(?:تاريخ\s*(?:الإصدار|الطلب))[:\s]+([^\n]+)/)),
            passport_expiry: parseDate(first(text, /(?:انتهاء\s*(?:الجواز|صلاحية\s*الجواز)|Passport\s*Expiry)[:\s]+([^\n]+)/i)),
          },
          financial: {
            amount: firstNum(text, /(?:الرسوم|القيمة|Fee)[:\s]+([\d,]+\.?\d*)/i),
            currency: 'SAR',
          },
          source_url: location.href,
        };
      },
    },

    // ---------------- GENERIC AIRLINE FALLBACK (any e-ticket page) ----------------
    {
      name: 'generic-airline',
      match(text) {
        return hasAny(text, 'PNR', 'E-Ticket', 'e-ticket', 'Passenger Name', 'Booking Reference')
            && /\b(JED|SAH|ADE|CAI|DXB|IST|DOH|AUH|KWI|BAH|MCT)\b/.test(text);
      },
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
            route_from: first(text, /From[:\s]+([A-Z]{3})/),
            route_to: first(text, /To[:\s]+([A-Z]{3})/),
          },
          dates: {
            trip_date: parseDate(first(text, /(?:Flight\s*Date|Travel\s*Date)[:\s]+([^\n]+)/i)),
            depart_time: parseTime(first(text, /Departure[:\s]+(\d{1,2}:\d{2})/i)),
            arrive_time: parseTime(first(text, /Arrival[:\s]+(\d{1,2}:\d{2})/i)),
            issued_at: parseDate(first(text, /(?:Issued|Issue\s*Date)[:\s]+([^\n]+)/i)),
          },
          financial: {
            amount: firstNum(text, /(?:Total(?:\s*Fare)?|Grand\s*Total)[:\s]+([\d,]+\.\d{2})/i),
            currency: detectCurrency(text) || 'USD',
          },
          source_url: location.href,
        };
      },
    },
  ];

  // ==================== Detection API ====================
  window.__RAHAL_SCRAPE__ = function () {
    const text = TEXT();
    if (!text || text.length < 20) return null;
    for (const p of PARSERS) {
      try {
        if (p.match(text)) {
          const data = p.parse(text);
          data._parser = p.name;
          // Post-clean: if no doc_type detected, skip
          if (!data.booking?.doc_type) continue;
          return data;
        }
      } catch (_) { /* try next */ }
    }
    return null;
  };

  // ==================== In-page Widget ====================
  window.__RAHAL_OPEN_WIDGET__ = async function (payload) {
    if (document.getElementById('__rahal_widget__')) return;
    if (!payload) { alert('لا توجد بيانات لسحبها'); return; }

    const w = document.createElement('div');
    w.id = '__rahal_widget__';
    w.dir = 'rtl';
    w.innerHTML = `
      <style>
        #__rahal_widget__ { position: fixed; top: 20px; left: 20px; width: 380px; z-index: 2147483647;
          background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.18);
          font-family: -apple-system, 'Segoe UI', Tahoma, sans-serif; padding: 16px; direction: rtl; max-height: 92vh; overflow-y: auto; }
        #__rahal_widget__ .h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
        #__rahal_widget__ .title { font-weight: 800; font-size: 14px; color: #0f172a; }
        #__rahal_widget__ .close { background: none; border: 0; font-size: 18px; cursor: pointer; color: #64748b; }
        #__rahal_widget__ .k { font-size: 11px; color: #64748b; margin-top: 6px; }
        #__rahal_widget__ input, #__rahal_widget__ select { width: 100%; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; margin-top: 2px; direction: rtl; }
        #__rahal_widget__ .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
        #__rahal_widget__ .info { background: #f1f5f9; padding: 8px; border-radius: 6px; font-size: 11px; margin-bottom: 8px; line-height: 1.6; }
        #__rahal_widget__ .info b { color: #1e40af; }
        #__rahal_widget__ .parser-tag { background: #dbeafe; color: #1e40af; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        #__rahal_widget__ .actions { display: flex; gap: 8px; margin-top: 12px; }
        #__rahal_widget__ button.confirm { flex: 1; background: linear-gradient(90deg,#1e40af,#f97316); color:#fff; border:0; padding:9px; border-radius:8px; font-weight:700; cursor:pointer; font-size:13px; }
        #__rahal_widget__ button.cancel { flex: 0 0 90px; background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:9px; border-radius:8px; cursor:pointer; font-size:13px; }
        #__rahal_widget__ .status { margin-top:8px; padding:6px 8px; border-radius:6px; font-size:12px; text-align:center; }
        #__rahal_widget__ .status.ok { background:#dcfce7; color:#166534; }
        #__rahal_widget__ .status.err { background:#fee2e2; color:#991b1b; }
      </style>
      <div class="h"><div class="title">🚀 سحب إلى رحّال</div><button class="close" id="rw-close">×</button></div>
      <div class="info">
        <div><b>${payload.booking?.doc_type || '—'}</b> · ${payload.traveler?.name_en || payload.traveler?.name_ar || '—'} <span class="parser-tag">${payload._parser || 'auto'}</span></div>
        <div style="color:#64748b;margin-top:2px">جواز: ${payload.traveler?.passport_no || '—'} · مبلغ: ${payload.financial?.amount || 0} ${payload.financial?.currency || ''}</div>
        ${payload.booking?.pnr ? `<div style="color:#64748b;margin-top:2px">PNR: ${payload.booking.pnr} · تذكرة: ${payload.booking.ticket_no || '—'}</div>` : ''}
        ${payload.booking?.visa_no ? `<div style="color:#64748b;margin-top:2px">تأشيرة: ${payload.booking.visa_no} · طلب: ${payload.booking.application_no || '—'}</div>` : ''}
        ${payload.dates?.trip_date ? `<div style="color:#64748b;margin-top:2px">📅 ${payload.dates.trip_date} ${payload.dates.depart_time || ''}</div>` : ''}
      </div>
      <div class="k">حساب القبض (العميل) <span style="color:#ef4444">*</span></div>
      <select id="rw-client"><option value="">— اختر —</option></select>
      <div class="k">المورد/الناقل <span style="color:#ef4444">*</span></div>
      <select id="rw-supplier"><option value="">— اختر —</option></select>
      <div class="row">
        <div><div class="k">التكلفة</div><input type="number" id="rw-cost" step="0.01" value="${payload.financial?.amount || 0}"></div>
        <div><div class="k">السعر</div><input type="number" id="rw-sale" step="0.01" value="${payload.financial?.amount || 0}"></div>
      </div>
      <div class="row">
        <div><div class="k">العملة</div><select id="rw-currency"><option value="USD">USD</option><option value="SAR">SAR</option><option value="YER">YER</option></select></div>
        <div><div class="k">طريقة الدفع</div><select id="rw-payment"><option value="credit">آجل</option><option value="cash">نقد</option></select></div>
      </div>
      <div id="rw-box-wrapper" style="display:none">
        <div class="k">الصندوق (للنقد)</div><select id="rw-box"><option value="">— اختر —</option></select>
      </div>
      <div class="actions">
        <button class="cancel" id="rw-cancel">إلغاء</button>
        <button class="confirm" id="rw-confirm">تأكيد الحفظ</button>
      </div>
      <div id="rw-status" class="status" style="display:none"></div>
    `;
    document.body.appendChild(w);

    // Set currency from payload if valid
    const cur = payload.financial?.currency;
    if (cur && ['USD','SAR','YER'].includes(cur)) w.querySelector('#rw-currency').value = cur;

    // Load selects from background worker
    const sendMsg = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
    const fillSelect = (selectId, items, labelKey) => {
      const sel = w.querySelector(selectId);
      items.forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x[labelKey] || x.name; sel.appendChild(o); });
    };

    try {
      const [cli, sup, box] = await Promise.all([
        sendMsg({ type: 'RAHAL_LIST_CLIENTS' }),
        sendMsg({ type: 'RAHAL_LIST_SUPPLIERS' }),
        sendMsg({ type: 'RAHAL_LIST_BOXES' }),
      ]);
      if (cli.ok) fillSelect('#rw-client', cli.data, 'name');
      if (sup.ok) fillSelect('#rw-supplier', sup.data, 'name');
      if (box.ok) fillSelect('#rw-box', (box.data || []).map(b => ({...b, name: b.name_ar || b.name})), 'name');
    } catch (e) {
      const st = w.querySelector('#rw-status'); st.style.display='block'; st.className='status err'; st.textContent = 'خطأ في تحميل القوائم: ' + e.message;
    }

    const boxWrap = w.querySelector('#rw-box-wrapper');
    w.querySelector('#rw-payment').addEventListener('change', (e) => { boxWrap.style.display = e.target.value === 'cash' ? 'block' : 'none'; });

    const close = () => w.remove();
    w.querySelector('#rw-cancel').addEventListener('click', close);
    w.querySelector('#rw-close').addEventListener('click', close);

    w.querySelector('#rw-confirm').addEventListener('click', async () => {
      const clientId = w.querySelector('#rw-client').value;
      const supplierId = w.querySelector('#rw-supplier').value;
      if (!clientId || !supplierId) { alert('اختر العميل والمورد'); return; }
      const payment = w.querySelector('#rw-payment').value;
      const boxId = payment === 'cash' ? w.querySelector('#rw-box').value : null;
      if (payment === 'cash' && !boxId) { alert('اختر الصندوق'); return; }
      const st = w.querySelector('#rw-status'); st.style.display = 'block'; st.className = 'status'; st.textContent = 'جارٍ الإرسال...';
      const body = {
        ...payload,
        client_id: clientId, supplier_id: supplierId,
        cost: parseFloat(w.querySelector('#rw-cost').value) || 0,
        sale_price: parseFloat(w.querySelector('#rw-sale').value) || 0,
        financial: { ...(payload.financial || {}), currency: w.querySelector('#rw-currency').value },
        payment_method: payment, box_id: boxId,
      };
      const r = await sendMsg({ type: 'RAHAL_INGEST', payload: body });
      if (r.ok) { st.className = 'status ok'; st.textContent = '✅ تم الحفظ في رحّال — ID: ' + (r.data.record_id || '').slice(0,8); setTimeout(close, 2200); }
      else { st.className = 'status err'; st.textContent = '❌ ' + (r.error || 'فشل'); }
    });
  };
})();
