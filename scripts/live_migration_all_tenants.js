/**
 * ============================================================
 * Chart of Accounts Migration — ALL TENANTS
 * ============================================================
 * Skips: tenants already migrated (detected by 'account_code' field on any client)
 * ============================================================
 */
const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'your_database_name';
const CONFIRM = process.env.CONFIRM === 'YES';

const PARENT_CLIENT = '1301';
const PARENT_SUPPLIER = '2101';
const PARENT_BOX_CASH = '1101';
const PARENT_BOX_BANK = '1201';
const pad4 = (n) => String(n).padStart(4, '0');
const isZeroBalance = (b) => !b || Object.values(b).every(v => !v || Number(v) === 0);

async function migrateTenant(db, T, tenantName) {
  const report = { tenant: tenantName, T, clients: 0, suppliers: 0, boxes: 0, je_lines_updated: 0, inactive_flagged: 0, skipped: false };

  // Check if already migrated (any client has account_code)
  const alreadyMigrated = await db.collection('clients').findOne({ tenant_id: T, account_code: { $exists: true, $ne: null } });
  if (alreadyMigrated) { report.skipped = true; return report; }

  // Phase 1: parents
  for (const code of [PARENT_CLIENT, PARENT_SUPPLIER, PARENT_BOX_CASH, PARENT_BOX_BANK]) {
    await db.collection('accounts').updateOne(
      { tenant_id: T, code },
      { $set: { is_parent: true, next_child_seq: 0, updated_at: new Date().toISOString() } }
    );
  }

  // Phase 2: clients
  const clients = await db.collection('clients').find({ tenant_id: T }).sort({ created_at: 1 }).toArray();
  for (let i = 0; i < clients.length; i++) {
    const seq = i + 1;
    await db.collection('clients').updateOne(
      { id: clients[i].id },
      { $set: { account_code: PARENT_CLIENT + pad4(seq), account_parent_code: PARENT_CLIENT, account_seq: seq, updated_at: new Date().toISOString() } }
    );
  }
  await db.collection('accounts').updateOne({ tenant_id: T, code: PARENT_CLIENT }, { $set: { next_child_seq: clients.length } });
  report.clients = clients.length;

  // Phase 3: suppliers
  const suppliers = await db.collection('suppliers').find({ tenant_id: T }).sort({ created_at: 1 }).toArray();
  for (let i = 0; i < suppliers.length; i++) {
    const seq = i + 1;
    await db.collection('suppliers').updateOne(
      { id: suppliers[i].id },
      { $set: { account_code: PARENT_SUPPLIER + pad4(seq), account_parent_code: PARENT_SUPPLIER, account_seq: seq, updated_at: new Date().toISOString() } }
    );
  }
  await db.collection('accounts').updateOne({ tenant_id: T, code: PARENT_SUPPLIER }, { $set: { next_child_seq: suppliers.length } });
  report.suppliers = suppliers.length;

  // Phase 4: boxes
  const boxes = await db.collection('boxes').find({ tenant_id: T }).sort({ created_at: 1 }).toArray();
  let cashSeq = 0, bankSeq = 0;
  for (const b of boxes) {
    let parent, seq;
    if (b.type === 'cash') { cashSeq++; parent = PARENT_BOX_CASH; seq = cashSeq; }
    else { bankSeq++; parent = PARENT_BOX_BANK; seq = bankSeq; }
    await db.collection('boxes').updateOne(
      { id: b.id },
      { $set: { account_code: parent + pad4(seq), account_parent_code: parent, account_seq: seq, updated_at: new Date().toISOString() } }
    );
  }
  await db.collection('accounts').updateOne({ tenant_id: T, code: PARENT_BOX_CASH }, { $set: { next_child_seq: cashSeq } });
  await db.collection('accounts').updateOne({ tenant_id: T, code: PARENT_BOX_BANK }, { $set: { next_child_seq: bankSeq } });
  report.boxes = boxes.length;

  // Phase 5: JE lines
  const idMap = new Map();
  (await db.collection('clients').find({ tenant_id: T }).toArray()).forEach(c => idMap.set(c.id, { code: c.account_code, parent: c.account_parent_code }));
  (await db.collection('suppliers').find({ tenant_id: T }).toArray()).forEach(s => idMap.set(s.id, { code: s.account_code, parent: s.account_parent_code }));
  (await db.collection('boxes').find({ tenant_id: T }).toArray()).forEach(b => idMap.set(b.id, { code: b.account_code, parent: b.account_parent_code }));

  const jes = await db.collection('journal_entries').find({ tenant_id: T }).toArray();
  for (const je of jes) {
    let changed = false;
    const newLines = (je.lines || []).map(line => {
      if (['client', 'supplier', 'box'].includes(line.party_type) && line.party_id) {
        const m = idMap.get(line.party_id);
        if (m && m.code && line.account_code !== m.code) {
          changed = true;
          report.je_lines_updated++;
          return { ...line, account_code: m.code, account_parent_code: m.parent };
        }
      }
      return line;
    });
    if (changed) await db.collection('journal_entries').updateOne({ id: je.id }, { $set: { lines: newLines, updated_at: new Date().toISOString() } });
  }

  // Phase 6: inactive flags
  const jeUsage = new Map();
  (await db.collection('journal_entries').find({ tenant_id: T }).toArray())
    .forEach(je => (je.lines || []).forEach(l => { if (l.party_id) jeUsage.set(l.party_id, (jeUsage.get(l.party_id) || 0) + 1); }));

  for (const [coll, list] of [
    ['clients', await db.collection('clients').find({ tenant_id: T }).toArray()],
    ['suppliers', await db.collection('suppliers').find({ tenant_id: T }).toArray()],
    ['boxes', await db.collection('boxes').find({ tenant_id: T }).toArray()],
  ]) {
    for (const it of list) {
      if (isZeroBalance(it.balances) && !jeUsage.get(it.id)) {
        await db.collection(coll).updateOne({ id: it.id }, { $set: { inactive: true, inactive_reason: 'zero_balance_zero_activity', updated_at: new Date().toISOString() } });
        report.inactive_flagged++;
      }
    }
  }
  return report;
}

(async () => {
  if (!CONFIRM) { console.error('⛔ Set CONFIRM=YES to run.'); process.exit(2); }
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  const tenants = await db.collection('tenants').find({}).toArray();
  console.log(`Found ${tenants.length} tenants total. Migrating each...\n`);
  const results = [];
  for (const t of tenants) {
    try {
      const r = await migrateTenant(db, t.id, t.name || t.name_ar || t.slug || t.id.slice(0, 8));
      results.push(r);
      const status = r.skipped ? '⏭️  SKIP (already migrated)' : `✅ clients=${r.clients} suppliers=${r.suppliers} boxes=${r.boxes} JEs=${r.je_lines_updated} inactive=${r.inactive_flagged}`;
      console.log(`  ${status.padEnd(70)}  ${r.tenant}`);
    } catch (e) {
      console.log(`  ❌ ERROR: ${e.message}  ${t.name || t.id}`);
    }
  }
  const migrated = results.filter(r => !r.skipped);
  const totals = migrated.reduce((s, r) => ({
    clients: s.clients + r.clients, suppliers: s.suppliers + r.suppliers, boxes: s.boxes + r.boxes,
    je_lines: s.je_lines + r.je_lines_updated, inactive: s.inactive + r.inactive_flagged,
  }), { clients: 0, suppliers: 0, boxes: 0, je_lines: 0, inactive: 0 });
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 GRAND TOTAL                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Tenants migrated : ${migrated.length}`);
  console.log(`  Tenants skipped  : ${results.length - migrated.length}`);
  console.log(`  Clients coded    : ${totals.clients}`);
  console.log(`  Suppliers coded  : ${totals.suppliers}`);
  console.log(`  Boxes coded      : ${totals.boxes}`);
  console.log(`  JE lines updated : ${totals.je_lines}`);
  console.log(`  Inactive flagged : ${totals.inactive}`);
  await client.close();
})().catch(e => { console.error('❌', e); process.exit(1); });
