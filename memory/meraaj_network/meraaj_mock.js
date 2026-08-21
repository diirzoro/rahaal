// Meraaj TEST mock — simulates the Meraaj contract endpoints:
//   POST /api/integrations/rahal/packages/share  (X-Rahal-Api-Key)
//   POST /api/integrations/rahal/webhooks        (X-Rahal-Signature = HMAC-SHA256 over exact RAW body)
// Logs every request to meraaj_mock.log. Keeps an in-memory marketplace store to verify real field updates.
// Usage: MERAAJ_SHARED_SECRET=<secret> node meraaj_mock.js  (listens on :9099)
const http = require('http')
const fs = require('fs')
const crypto = require('crypto')
const LOG = '/app/memory/meraaj_network/meraaj_mock.log'
const STORE = '/app/memory/meraaj_network/meraaj_mock_store.json' // simulated Meraaj marketplace DB
const SECRET = process.env.MERAAJ_SHARED_SECRET || ''

const loadStore = () => { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')) } catch { return {} } }
const saveStore = (s) => fs.writeFileSync(STORE, JSON.stringify(s, null, 1))

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', () => {
    let parsed = null
    try { parsed = body ? JSON.parse(body) : null } catch { parsed = body }
    const entry = {
      at: new Date().toISOString(), method: req.method, url: req.url,
      headers: {
        'x-rahal-api-key': req.headers['x-rahal-api-key'] || null,
        'x-rahal-signature': req.headers['x-rahal-signature'] || null,
        // Forbidden legacy headers — must always be null:
        'x-rahaal-signature': req.headers['x-rahaal-signature'] || null,
        'x-rahaal-timestamp': req.headers['x-rahaal-timestamp'] || null,
      },
      body: parsed,
    }
    const respond = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }

    // --- First-share REST registration ---
    if (req.method === 'POST' && req.url === '/api/integrations/rahal/packages/share') {
      if (req.headers['x-rahal-api-key'] !== SECRET) {
        entry.result = 'REJECTED: invalid api key'
        fs.appendFileSync(LOG, JSON.stringify(entry) + '\n')
        return respond(401, { error: 'invalid api key' })
      }
      const store = loadStore()
      const ref = parsed?.package_ref
      const id = store[ref]?.meraaj_id || ('MRJ-TEST-' + Date.now())
      store[ref] = { meraaj_id: id, listed: true, ...parsed, updated_at: new Date().toISOString() }
      saveStore(store)
      entry.result = `MARKETPLACE CREATED/UPDATED ${id}`
      fs.appendFileSync(LOG, JSON.stringify(entry) + '\n')
      // Real Meraaj returns the id ONLY as meraaj_package_id
      return respond(200, { success: true, meraaj_package_id: id })
    }

    // --- Webhooks (contract: X-Rahal-Signature = HMAC-SHA256 of exact raw body) ---
    if (req.method === 'POST' && req.url === '/api/integrations/rahal/webhooks') {
      const expected = crypto.createHmac('sha256', SECRET).update(body).digest('hex')
      const got = req.headers['x-rahal-signature'] || ''
      entry.signature_valid = got === expected
      if (!entry.signature_valid) {
        entry.result = 'REJECTED: invalid signature'
        fs.appendFileSync(LOG, JSON.stringify(entry) + '\n')
        return respond(401, { error: 'invalid signature' })
      }
      const store = loadStore()
      const type = parsed?.type
      const data = parsed?.data || {}
      // v3.34 realism — match like real Meraaj: by our OWN package id, or by rahal_ref. NOT by legacy package_ref.
      let ref = null
      if (data.meraaj_package_id) ref = Object.keys(store).find(k => store[k].meraaj_id === data.meraaj_package_id) || null
      if (!ref && data.rahal_ref && store[data.rahal_ref]) ref = data.rahal_ref
      if (ref && store[ref]) {
        if (type === 'package.updated') { store[ref] = { ...store[ref], ...data, listed: true, updated_at: new Date().toISOString() } }
        if (type === 'package.deactivated') { store[ref].listed = false; store[ref].deactivate_reason = data.reason; store[ref].updated_at = new Date().toISOString() }
        if (type === 'inventory.updated') { store[ref].available_seats = data.seats_available; store[ref].updated_at = new Date().toISOString() }
        saveStore(store)
      }
      entry.result = `WEBHOOK OK: ${type}${ref ? ' → ' + (store[ref] ? (store[ref].listed ? 'listed' : 'UNLISTED') : 'unknown ref') : ''}`
      fs.appendFileSync(LOG, JSON.stringify(entry) + '\n')
      return respond(200, { received: true })
    }

    entry.result = '404'
    fs.appendFileSync(LOG, JSON.stringify(entry) + '\n')
    respond(404, { error: 'not found' })
  })
})
server.listen(9099, () => console.log('Meraaj mock (share + webhooks) listening on 9099'))
