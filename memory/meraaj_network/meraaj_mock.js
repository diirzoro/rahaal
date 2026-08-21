// Meraaj TEST mock — receives the first-share REST registration and logs everything
// Usage: MERAAJ_SHARED_SECRET=<secret> node meraaj_mock.js  (listens on :9099)
const http = require('http')
const fs = require('fs')
const LOG = '/app/memory/meraaj_network/meraaj_mock.log'
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', () => {
    let parsed = null
    try { parsed = body ? JSON.parse(body) : null } catch { parsed = body }
    const entry = { at: new Date().toISOString(), method: req.method, url: req.url, headers: { 'x-rahal-api-key': req.headers['x-rahal-api-key'] || null, 'content-type': req.headers['content-type'] }, body: parsed }
    fs.appendFileSync(LOG, JSON.stringify(entry) + '\n')
    if (req.method === 'POST' && req.url === '/api/integrations/rahal/packages/share') {
      // Simulate Meraaj: validate API key
      if (req.headers['x-rahal-api-key'] !== process.env.MERAAJ_SHARED_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'invalid api key' }))
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ success: true, package_id: 'MRJ-TEST-' + Date.now() }))
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })
})
server.listen(9099, () => console.log('Meraaj mock listening on 9099'))
