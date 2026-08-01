// Rahaal Extension — Popup logic
const el = (id) => document.getElementById(id);

async function loadConfig() {
  const cfg = await chrome.storage.local.get(['api_url', 'pat_token', 'tenant']);
  return cfg || {};
}

async function saveConfig(cfg) {
  await chrome.storage.local.set(cfg);
}

async function pingServer(apiUrl, token) {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/scraper/ping`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function showConnect() {
  el('screen-connect').classList.remove('hidden');
  el('screen-ready').classList.add('hidden');
}

function showReady(tenantName) {
  el('screen-ready').classList.remove('hidden');
  el('screen-connect').classList.add('hidden');
  el('tenant-name').textContent = tenantName || '—';
}

function setStatus(msg, ok) {
  const s = el('connect-status');
  s.textContent = msg;
  s.className = 'status ' + (ok ? 'ok' : 'err');
}

async function init() {
  const cfg = await loadConfig();
  if (cfg.api_url && cfg.pat_token) {
    showReady(cfg.tenant?.name || '—');
  } else {
    showConnect();
  }

  el('btn-connect').addEventListener('click', async () => {
    const apiUrl = el('api-url').value.trim();
    const token = el('pat-token').value.trim();
    if (!apiUrl || !token) return setStatus('املأ الحقلين', false);
    if (!/^rhl_pat_/.test(token)) return setStatus('الرمز يجب أن يبدأ بـ rhl_pat_', false);
    setStatus('جارٍ الفحص...', true);
    try {
      el('btn-connect').disabled = true;
      const data = await pingServer(apiUrl, token);
      await saveConfig({ api_url: apiUrl, pat_token: token, tenant: data.tenant });
      setStatus('✅ متصل بنجاح', true);
      setTimeout(() => showReady(data.tenant?.name), 700);
    } catch (e) {
      setStatus('❌ فشل الاتصال — تحقق من الرابط والرمز', false);
    } finally {
      el('btn-connect').disabled = false;
    }
  });

  el('btn-reset').addEventListener('click', async (e) => {
    e.preventDefault();
    await chrome.storage.local.remove(['api_url', 'pat_token', 'tenant']);
    el('api-url').value = '';
    el('pat-token').value = '';
    showConnect();
  });

  el('btn-scan').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    el('detected-info').innerHTML = '<div class="detected-empty">جارٍ القراءة...</div>';
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__RAHAL_SCRAPE__ ? window.__RAHAL_SCRAPE__() : null,
      });
      if (!result || !result.booking?.doc_type) {
        el('detected-info').innerHTML = '<div class="detected-empty">لم يتم التعرف على المستند — تأكد أنك في صفحة تذكرة/تأشيرة مدعومة</div>';
        el('btn-open-widget').classList.add('hidden');
        return;
      }
      const t = result.traveler || {}; const bk = result.booking || {}; const fn = result.financial || {};
      el('detected-info').innerHTML = `
        <div class="row"><span class="k">النوع</span><span class="v">${bk.doc_type}</span></div>
        <div class="row"><span class="k">المسافر</span><span class="v">${t.name_en || t.name_ar || '—'}</span></div>
        <div class="row"><span class="k">الجواز</span><span class="v">${t.passport_no || '—'}</span></div>
        <div class="row"><span class="k">PNR/رقم</span><span class="v">${bk.pnr || bk.ticket_no || bk.visa_no || '—'}</span></div>
        <div class="row"><span class="k">المبلغ</span><span class="v">${fn.amount || 0} ${fn.currency || '—'}</span></div>
      `;
      window.__RAHAL_LAST_SCRAPE__ = result;
      el('btn-open-widget').classList.remove('hidden');
    } catch (e) {
      el('detected-info').innerHTML = `<div class="detected-empty">خطأ: ${e.message}</div>`;
    }
  });

  el('btn-open-widget').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (payload) => { if (window.__RAHAL_OPEN_WIDGET__) window.__RAHAL_OPEN_WIDGET__(payload); },
      args: [window.__RAHAL_LAST_SCRAPE__ || null],
    });
    window.close();
  });
}

init();
