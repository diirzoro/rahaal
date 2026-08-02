// Rahaal Extension — Popup v1.4.0 (HTML + PDF + Trial Quota Counter)
const el = (id) => document.getElementById(id);
let currentPdfPayload = null;
let quotaState = null; // { plan, used, limit, remaining, unlimited }

async function loadConfig() { return await chrome.storage.local.get(['api_url', 'pat_token', 'tenant']); }
async function saveConfig(cfg) { await chrome.storage.local.set(cfg); }

async function pingServer(apiUrl, token) {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/scraper/ping`, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function showConnect() { el('screen-connect').classList.remove('hidden'); el('screen-ready').classList.add('hidden'); el('screen-pdf-confirm').classList.add('hidden'); }
function showReady(tenantName) { el('screen-ready').classList.remove('hidden'); el('screen-connect').classList.add('hidden'); el('screen-pdf-confirm').classList.add('hidden'); el('tenant-name').textContent = tenantName || '—'; }
function showPdfConfirm() { el('screen-pdf-confirm').classList.remove('hidden'); el('screen-ready').classList.add('hidden'); el('screen-connect').classList.add('hidden'); }
function setStatus(msg, ok) { const s = el('connect-status'); s.textContent = msg; s.className = 'status ' + (ok ? 'ok' : 'err'); }

// ============ QUOTA UI ============
function renderQuota(u) {
  quotaState = u || null;
  const box = el('quota-box');
  if (!u) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  const label = el('quota-label');
  const count = el('quota-count');
  const fill = el('quota-bar-fill');
  const msg = el('quota-msg');
  const upgrade = el('upgrade-cta');
  box.classList.remove('paid', 'warn', 'danger');

  if (u.unlimited || u.plan === 'paid') {
    box.classList.add('paid');
    label.textContent = '💎 اشتراك مدفوع';
    count.textContent = 'غير محدود';
    fill.style.width = '100%';
    msg.textContent = 'استخدام غير محدود للقراءات';
    upgrade.style.display = 'none';
    setScrapeButtonsEnabled(true);
    return;
  }

  const used = Number(u.used || 0);
  const limit = Number(u.limit || 30);
  const remaining = Math.max(0, Number(u.remaining ?? (limit - used)));
  const pct = Math.min(100, Math.round((used / limit) * 100));
  fill.style.width = `${pct}%`;
  count.textContent = `${used}/${limit}`;
  label.textContent = '🎁 التجربة المجانية';

  if (remaining <= 0) {
    box.classList.add('danger');
    msg.textContent = 'انتهت القراءات المجانية — يرجى ترقية الاشتراك';
    upgrade.style.display = 'block';
    setScrapeButtonsEnabled(false);
  } else if (remaining <= 5) {
    box.classList.add('warn');
    msg.textContent = `⚠️ تبقّى ${remaining} قراءات فقط — فكّر بالترقية`;
    upgrade.style.display = 'none';
    setScrapeButtonsEnabled(true);
  } else {
    msg.textContent = `المتبقي: ${remaining} قراءة من أصل ${limit}`;
    upgrade.style.display = 'none';
    setScrapeButtonsEnabled(true);
  }
}

function setScrapeButtonsEnabled(enabled) {
  ['btn-scan', 'btn-scan-pdf', 'btn-open-widget'].forEach((id) => {
    const b = el(id);
    if (!b) return;
    b.disabled = !enabled;
    if (!enabled) b.title = 'تم استنفاد القراءات المجانية'; else b.title = '';
  });
}

async function refreshQuota() {
  const cfg = await loadConfig();
  if (!cfg.api_url || !cfg.pat_token) return;
  try {
    const data = await pingServer(cfg.api_url, cfg.pat_token);
    renderQuota(data.usage || null);
  } catch (e) {
    console.warn('refreshQuota failed', e);
  }
}

function isPdfUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.pdf') || lower.includes('.pdf?') || lower.includes('/pdf/')
      || lower.includes('printpdf') || lower.includes('printticket') || lower.includes('printtickets')
      || lower.includes('/print/') || lower.includes('/print?') || lower.includes('printinvoice');
}

async function detectPageType() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) { el('page-type-badge').textContent = '❌ لا يمكن قراءة عنوان الصفحة'; return { tab: null }; }
  const pdf = isPdfUrl(tab.url);
  el('page-type-badge').textContent = pdf ? '📕 صفحة PDF — استخدم زر "قراءة PDF"' : '🌐 صفحة HTML عادية';
  el('page-type-badge').style.background = pdf ? '#fef3c7' : '#dbeafe';
  el('page-type-badge').style.color = pdf ? '#92400e' : '#1e40af';
  el('btn-scan').classList.toggle('hidden', pdf);
  el('btn-scan-pdf').classList.toggle('hidden', !pdf);
  // Reapply quota lock state after visibility changes
  if (quotaState && !quotaState.unlimited && (quotaState.remaining ?? (quotaState.limit - quotaState.used)) <= 0) {
    setScrapeButtonsEnabled(false);
  }
  return { tab, pdf };
}

// ============ PDF EXTRACTION ============
async function extractPdfText(url) {
  const pdfjsLib = await import(chrome.runtime.getURL('lib/pdf.min.mjs'));
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) throw new Error(`فشل تحميل الـ PDF (HTTP ${resp.status})`);
  const buf = await resp.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

async function scanPdf(tab) {
  if (quotaState && !quotaState.unlimited && (quotaState.remaining ?? (quotaState.limit - quotaState.used)) <= 0) {
    el('detected-info').innerHTML = '<div class="detected-empty" style="color:#dc2626">⛔ انتهت القراءات المجانية — يرجى ترقية الاشتراك</div>';
    return;
  }
  el('detected-info').innerHTML = '<div class="detected-empty">جارٍ فك ضغط الـ PDF واستخراج النصوص...</div>';
  try {
    const text = await extractPdfText(tab.url);
    if (!text || text.length < 20) {
      el('detected-info').innerHTML = '<div class="detected-empty">لم يتم استخراج نصوص من الـ PDF (قد يكون صورة ممسوحة ضوئياً)</div>';
      return;
    }
    const data = window.RahalParsers.scrape(text, { hostname: new URL(tab.url).hostname, title: tab.title || '' });
    if (!data || !data.booking?.doc_type) {
      el('detected-info').innerHTML = '<div class="detected-empty">لم يتم التعرف على نوع المستند من الـ PDF</div>';
      return;
    }
    data.source_url = tab.url;
    currentPdfPayload = data;
    const t = data.traveler || {}; const bk = data.booking || {}; const fn = data.financial || {};
    el('detected-info').innerHTML = `
      <div class="row"><span class="k">النوع</span><span class="v">${bk.doc_type} <span style="background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:4px;font-size:9px">${data._parser}</span></span></div>
      <div class="row"><span class="k">المسافر</span><span class="v">${t.name_en || t.name_ar || '—'}</span></div>
      <div class="row"><span class="k">الجواز</span><span class="v">${t.passport_no || '—'}</span></div>
      <div class="row"><span class="k">PNR/رقم</span><span class="v">${bk.pnr || bk.ticket_no || bk.visa_no || '—'}</span></div>
      <div class="row"><span class="k">المبلغ</span><span class="v">${fn.amount || 0} ${fn.currency || '—'}</span></div>
    `;
    el('btn-open-widget').classList.remove('hidden');
    el('btn-open-widget').textContent = '🚀 تأكيد وحفظ في رحّال';
  } catch (e) {
    el('detected-info').innerHTML = `<div class="detected-empty" style="color:#dc2626">❌ ${e.message}</div>`;
  }
}

// ============ HTML SCAN ============
async function scanHtml(tab) {
  if (quotaState && !quotaState.unlimited && (quotaState.remaining ?? (quotaState.limit - quotaState.used)) <= 0) {
    el('detected-info').innerHTML = '<div class="detected-empty" style="color:#dc2626">⛔ انتهت القراءات المجانية — يرجى ترقية الاشتراك</div>';
    return;
  }
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
      <div class="row"><span class="k">النوع</span><span class="v">${bk.doc_type} <span style="background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:4px;font-size:9px">${result._parser || 'auto'}</span></span></div>
      <div class="row"><span class="k">المسافر</span><span class="v">${t.name_en || t.name_ar || '—'}</span></div>
      <div class="row"><span class="k">الجواز</span><span class="v">${t.passport_no || '—'}</span></div>
      <div class="row"><span class="k">PNR/رقم</span><span class="v">${bk.pnr || bk.ticket_no || bk.visa_no || '—'}</span></div>
      <div class="row"><span class="k">المبلغ</span><span class="v">${fn.amount || 0} ${fn.currency || '—'}</span></div>
    `;
    window.__RAHAL_LAST_SCRAPE__ = result;
    el('btn-open-widget').classList.remove('hidden');
    el('btn-open-widget').textContent = '🚀 سحب إلى رحّال (فتح نافذة تأكيد)';
  } catch (e) {
    el('detected-info').innerHTML = `<div class="detected-empty">خطأ: ${e.message}</div>`;
  }
}

// ============ PDF Confirmation Screen ============
async function openPdfConfirmForm() {
  if (!currentPdfPayload) return;
  showPdfConfirm();
  const p = currentPdfPayload;
  el('pdf-parser-info').textContent = `📄 ${p.booking?.doc_type} · ${p._parser} · ${p.traveler?.name_en || p.traveler?.name_ar || '—'}`;
  el('pdf-info').innerHTML = `
    <div class="row"><span class="k">الجواز</span><span class="v">${p.traveler?.passport_no || '—'}</span></div>
    <div class="row"><span class="k">PNR</span><span class="v">${p.booking?.pnr || p.booking?.ticket_no || p.booking?.visa_no || '—'}</span></div>
    <div class="row"><span class="k">التاريخ</span><span class="v">${p.dates?.trip_date || p.dates?.valid_from || '—'}</span></div>
  `;
  el('pdf-cost').value = p.financial?.amount || 0;
  el('pdf-sale').value = p.financial?.amount || 0;
  if (p.financial?.currency) el('pdf-currency').value = p.financial.currency;

  const sendMsg = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  const fill = (id, items, key) => { const sel = el(id); items.forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x[key] || x.name; sel.appendChild(o); }); };
  try {
    const [cli, sup, box] = await Promise.all([sendMsg({ type: 'RAHAL_LIST_CLIENTS' }), sendMsg({ type: 'RAHAL_LIST_SUPPLIERS' }), sendMsg({ type: 'RAHAL_LIST_BOXES' })]);
    if (cli.ok) fill('pdf-client', cli.data, 'name');
    if (sup.ok) fill('pdf-supplier', sup.data, 'name');
    if (box.ok) fill('pdf-box', (box.data || []).map(b => ({ ...b, name: b.name_ar || b.name })), 'name');
  } catch (e) { el('pdf-status').className = 'status err'; el('pdf-status').textContent = e.message; }

  el('pdf-payment').addEventListener('change', (e) => { el('pdf-box-wrapper').style.display = e.target.value === 'cash' ? 'block' : 'none'; });
  el('pdf-cancel').addEventListener('click', () => { showReady(); });
  el('pdf-confirm').addEventListener('click', async () => {
    const clientId = el('pdf-client').value; const supplierId = el('pdf-supplier').value;
    if (!clientId || !supplierId) { alert('اختر العميل والمورد'); return; }
    const payment = el('pdf-payment').value;
    const boxId = payment === 'cash' ? el('pdf-box').value : null;
    if (payment === 'cash' && !boxId) { alert('اختر الصندوق'); return; }
    el('pdf-status').className = 'status'; el('pdf-status').textContent = 'جارٍ الإرسال...';
    const body = {
      ...currentPdfPayload,
      client_id: clientId, supplier_id: supplierId,
      cost: parseFloat(el('pdf-cost').value) || 0,
      sale_price: parseFloat(el('pdf-sale').value) || 0,
      financial: { ...(currentPdfPayload.financial || {}), currency: el('pdf-currency').value },
      payment_method: payment, box_id: boxId,
    };
    const r = await sendMsg({ type: 'RAHAL_INGEST', payload: body });
    if (r.ok) {
      el('pdf-status').className = 'status ok';
      el('pdf-status').textContent = '✅ تم الحفظ في رحّال — ID: ' + (r.data.record_id || '').slice(0, 8);
      if (r.data && r.data.usage) renderQuota(r.data.usage);
      setTimeout(() => { currentPdfPayload = null; showReady(); }, 2500);
    } else {
      el('pdf-status').className = 'status err';
      el('pdf-status').textContent = '❌ ' + (r.error || 'فشل');
      // If quota exceeded, sync UI
      if (r.status === 402 && r.data && r.data.usage) renderQuota(r.data.usage);
    }
  });
}

// ============ INIT ============
async function init() {
  const cfg = await loadConfig();
  if (cfg.api_url && cfg.pat_token) {
    showReady(cfg.tenant?.name || '—');
    // Fetch quota BEFORE detecting page type so lock applies correctly
    await refreshQuota();
    await detectPageType();
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
      setTimeout(async () => {
        showReady(data.tenant?.name);
        renderQuota(data.usage || null);
        await detectPageType();
      }, 700);
    } catch { setStatus('❌ فشل الاتصال — تحقق من الرابط والرمز', false); }
    finally { el('btn-connect').disabled = false; }
  });

  el('btn-reset').addEventListener('click', async (e) => {
    e.preventDefault();
    await chrome.storage.local.remove(['api_url', 'pat_token', 'tenant']);
    el('api-url').value = ''; el('pat-token').value = ''; showConnect();
  });

  el('btn-refresh-quota').addEventListener('click', async (e) => {
    e.preventDefault();
    const link = e.currentTarget;
    const old = link.textContent; link.textContent = '…';
    await refreshQuota();
    link.textContent = old;
  });

  el('btn-open-rahal').addEventListener('click', async () => {
    const cfg2 = await loadConfig();
    if (cfg2.api_url) chrome.tabs.create({ url: cfg2.api_url });
  });

  el('btn-scan').addEventListener('click', async () => {
    const { tab } = await detectPageType();
    if (tab) await scanHtml(tab);
  });

  el('btn-scan-pdf').addEventListener('click', async () => {
    const { tab } = await detectPageType();
    if (tab) await scanPdf(tab);
  });

  el('btn-open-widget').addEventListener('click', async () => {
    if (currentPdfPayload) { await openPdfConfirmForm(); return; }
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
