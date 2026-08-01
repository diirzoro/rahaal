// Rahaal Extension — Content script injected into every https page.
// Exposes window.__RAHAL_SCRAPE__() → unified schema + window.__RAHAL_OPEN_WIDGET__(payload) → in-page widget.

(function () {
  if (window.__RAHAL_INSTALLED__) return; window.__RAHAL_INSTALLED__ = true;

  // ===== Parsers registry =====
  // Each parser: { match(): bool, parse(): unifiedSchema }
  const PARSERS = [
    // Yemenia Airways parser (skeleton — refined once real HTML is provided)
    {
      name: 'yemenia',
      match() {
        return /yemenia|iy\.com|yemenairways/i.test(location.hostname + document.title);
      },
      parse() {
        const text = document.body.innerText;
        return {
          traveler: {
            name_en: matchAfter(text, /Passenger Name[:\s]+([A-Z\/ ]+)/i),
            passport_no: matchAfter(text, /Passport(?: No)?[:\s]+(\d{6,12})/i),
          },
          booking: {
            doc_type: 'flight', carrier: 'Yemenia',
            pnr: matchAfter(text, /PNR[:\s]+([A-Z0-9]{5,8})/i),
            ticket_no: matchAfter(text, /Ticket(?: Number)?[:\s]+([\d ]+)/i),
            route_from: matchAfter(text, /From[:\s]+([A-Z]{3})/),
            route_to: matchAfter(text, /To[:\s]+([A-Z]{3})/),
          },
          dates: {
            trip_date: matchAfter(text, /Flight Date[:\s]+([\d-]+)/),
            depart_time: matchAfter(text, /Departure[:\s]+(\d{2}:\d{2})/),
            arrive_time: matchAfter(text, /Arrival[:\s]+(\d{2}:\d{2})/),
            issued_at: matchAfter(text, /Issued[:\s]+([\d-]+)/),
          },
          financial: {
            amount: parseFloat((text.match(/Total[:\s]+([\d.]+)\s*USD/i) || [])[1] || '0'),
            currency: 'USD',
          },
          source_url: location.href,
        };
      },
    },
    // Generic KSA e-Visa parser (skeleton)
    {
      name: 'ksa-visa',
      match() { return /visa\.mofa\.gov\.sa|enjazit|visa\.gov\.sa/i.test(location.hostname); },
      parse() {
        const text = document.body.innerText;
        return {
          traveler: {
            name_ar: matchAfter(text, /الاسم[:\s]+([\u0600-\u06FF\s]+)/),
            passport_no: matchAfter(text, /رقم الجواز[:\s]+(\d{6,12})/),
            nationality: matchAfter(text, /الجنسية[:\s]+([\u0600-\u06FF]+)/),
          },
          booking: {
            doc_type: /عمرة/.test(text) ? 'umrah_visa' : /زيارة/.test(text) ? 'visit_visa' : 'work_visa',
            visa_no: matchAfter(text, /رقم التأشيرة[:\s]+(\d{6,15})/),
            application_no: matchAfter(text, /رقم الطلب[:\s]+([A-Z0-9]+)/),
          },
          dates: {
            valid_from: matchAfter(text, /بدء الصلاحية[:\s]+([\d\/-]+)/),
            valid_until: matchAfter(text, /الانتهاء[:\s]+([\d\/-]+)/),
            issued_at: new Date().toISOString(),
          },
          financial: { amount: 0, currency: 'SAR' },
          source_url: location.href,
        };
      },
    },
  ];

  function matchAfter(text, re) { const m = text.match(re); return m ? m[1].trim() : ''; }

  window.__RAHAL_SCRAPE__ = function () {
    for (const p of PARSERS) {
      if (p.match()) return p.parse();
    }
    return null;
  };

  // ===== In-page Widget =====
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
          font-family: -apple-system, 'Segoe UI', Tahoma, sans-serif; padding: 16px; direction: rtl; }
        #__rahal_widget__ .h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
        #__rahal_widget__ .title { font-weight: 800; font-size: 14px; color: #0f172a; }
        #__rahal_widget__ .close { background: none; border: 0; font-size: 18px; cursor: pointer; color: #64748b; }
        #__rahal_widget__ .k { font-size: 11px; color: #64748b; margin-top: 6px; }
        #__rahal_widget__ input, #__rahal_widget__ select { width: 100%; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; margin-top: 2px; direction: rtl; }
        #__rahal_widget__ .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
        #__rahal_widget__ .info { background: #f1f5f9; padding: 8px; border-radius: 6px; font-size: 11px; margin-bottom: 8px; }
        #__rahal_widget__ .info b { color: #1e40af; }
        #__rahal_widget__ .actions { display: flex; gap: 8px; margin-top: 12px; }
        #__rahal_widget__ button.confirm { flex: 1; background: linear-gradient(90deg,#1e40af,#f97316); color:#fff; border:0; padding:9px; border-radius:8px; font-weight:700; cursor:pointer; font-size:13px; }
        #__rahal_widget__ button.cancel { flex: 0 0 90px; background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:9px; border-radius:8px; cursor:pointer; font-size:13px; }
        #__rahal_widget__ .status { margin-top:8px; padding:6px 8px; border-radius:6px; font-size:12px; text-align:center; }
        #__rahal_widget__ .status.ok { background:#dcfce7; color:#166534; }
        #__rahal_widget__ .status.err { background:#fee2e2; color:#991b1b; }
      </style>
      <div class="h"><div class="title">🚀 سحب إلى رحّال</div><button class="close" id="rw-close">×</button></div>
      <div class="info">
        <div><b>${payload.booking?.doc_type || '—'}</b> · ${payload.traveler?.name_en || payload.traveler?.name_ar || '—'}</div>
        <div style="color:#64748b;margin-top:2px">جواز: ${payload.traveler?.passport_no || '—'} · مبلغ: ${payload.financial?.amount || 0} ${payload.financial?.currency || ''}</div>
      </div>
      <div class="k">حساب القبض (العميل)</div>
      <select id="rw-client"><option value="">— اختر —</option></select>
      <div class="k">المورد/الناقل</div>
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
      if (box.ok) fillSelect('#rw-box', box.data.map(b => ({...b, name: b.name_ar || b.name})), 'name');
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
        client_id: clientId,
        supplier_id: supplierId,
        cost: parseFloat(w.querySelector('#rw-cost').value) || 0,
        sale_price: parseFloat(w.querySelector('#rw-sale').value) || 0,
        financial: { ...(payload.financial || {}), currency: w.querySelector('#rw-currency').value },
        payment_method: payment,
        box_id: boxId,
      };
      const r = await sendMsg({ type: 'RAHAL_INGEST', payload: body });
      if (r.ok) { st.className = 'status ok'; st.textContent = '✅ تم الحفظ في رحّال — ID: ' + (r.data.record_id || '').slice(0,8); setTimeout(close, 2000); }
      else { st.className = 'status err'; st.textContent = '❌ ' + (r.error || 'فشل'); }
    });
  };
})();
