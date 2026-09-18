// READ-ONLY historical balance-drift detector — P0 deliverable (NO writes, NO backfill).
// Method: rebuild each party's per-currency net from journal_entries (the ledger = source of
// truth) and compare with the cached balances.* buckets. Any mismatch = a party whose cached
// balance was drifted by the historical bugs (double-effect edits, partner-share deletes).
// Usage: node /app/scripts/detect_balance_drift_readonly.js
const { MongoClient } = require('mongodb')
const fs = require('fs')
// minimal .env parse (no dotenv dependency)
for (const line of fs.readFileSync('/app/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

async function main() {
  const client = new MongoClient(process.env.MONGO_URL)
  await client.connect()
  const db = client.db(process.env.DB_NAME || undefined)

  const partyKinds = [
    { coll: 'clients', party_type: 'client', sign: +1 },   // debit increases client balance
    { coll: 'suppliers', party_type: 'supplier', sign: -1 }, // credit increases what we owe supplier
    { coll: 'boxes', party_type: 'box', sign: +1 },
  ]
  let affected = 0, checked = 0
  const rows = []
  for (const pk of partyKinds) {
    const parties = await db.collection(pk.coll).find({}).toArray()
    for (const p of parties) {
      checked++
      // ledger net per currency from JE lines referencing this party
      const jes = await db.collection('journal_entries').find(
        { tenant_id: p.tenant_id, 'lines.party_id': p.id },
        { projection: { lines: 1, currency: 1 } }
      ).toArray()
      const ledger = {}
      for (const je of jes) {
        for (const l of je.lines || []) {
          if (l.party_id !== p.id) continue
          const cur = l.currency || je.currency
          if (!cur || cur === 'MULTI') continue
          const delta = ((Number(l.debit) || 0) - (Number(l.credit) || 0)) * pk.sign
          ledger[cur] = +((ledger[cur] || 0) + delta).toFixed(2)
        }
      }
      const cached = p.balances || {}
      const curs = new Set([...Object.keys(ledger), ...Object.keys(cached)])
      for (const cur of curs) {
        const lv = +(ledger[cur] || 0).toFixed(2)
        const cv = +(Number(cached[cur]) || 0).toFixed(2)
        if (Math.abs(lv - cv) > 0.01) {
          affected++
          rows.push({ kind: pk.coll, tenant: p.tenant_id, id: p.id, name: p.name || p.name_ar, currency: cur, ledger: lv, cached: cv, delta: +(cv - lv).toFixed(2) })
        }
      }
    }
  }
  console.log(`READ-ONLY DRIFT SCAN — parties checked: ${checked}, drifted (party,currency) pairs: ${affected}`)
  for (const r of rows.slice(0, 50)) console.log(JSON.stringify(r))
  if (rows.length > 50) console.log(`... and ${rows.length - 50} more`)
  await client.close()
}
main().catch(e => { console.error(e); process.exit(1) })
