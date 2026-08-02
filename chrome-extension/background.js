// Rahaal Extension — Background Service Worker
// Handles API calls from content-script (client/supplier fetch + ingest).

async function getConfig() {
  return await chrome.storage.local.get(['api_url', 'pat_token']);
}

async function apiFetch(path, opts = {}) {
  const { api_url, pat_token } = await getConfig();
  if (!api_url || !pat_token) throw new Error('الإضافة غير مربوطة — افتح popup لضبط الرابط والرمز');
  const url = `${api_url.replace(/\/$/, '')}/api${path}`;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pat_token}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'RAHAL_LIST_CLIENTS') {
        const list = await apiFetch('/clients');
        sendResponse({ ok: true, data: list });
      } else if (msg.type === 'RAHAL_LIST_SUPPLIERS') {
        const list = await apiFetch('/suppliers');
        sendResponse({ ok: true, data: list });
      } else if (msg.type === 'RAHAL_LIST_BOXES') {
        const list = await apiFetch('/boxes');
        sendResponse({ ok: true, data: list });
      } else if (msg.type === 'RAHAL_INGEST') {
        const result = await apiFetch('/scraper/ingest', { method: 'POST', body: msg.payload });
        sendResponse({ ok: true, data: result });
      } else if (msg.type === 'RAHAL_PING') {
        const result = await apiFetch('/scraper/ping');
        sendResponse({ ok: true, data: result });
      } else {
        sendResponse({ ok: false, error: `unknown message: ${msg.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message, status: e.status || 0, data: e.data || null });
    }
  })();
  return true; // keep message channel open for async response
});
