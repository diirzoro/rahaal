/**
 * ============================================================
 * Chart of Accounts LIVE MIGRATION — Single Tenant
 * ============================================================
 * Target: owner@demo.com (Rahaal Demo Office)
 * Backup: /app/backups/pre_live_migration_20260810_074349
 *
 * Actions:
 *  1. accounts   : set is_parent=true + next_child_seq counters
 *  2. clients    : assign account_code, account_parent_code, account_seq
 *  3. suppliers  : same
 *  4. boxes      : same (cash→1101, bank→1201)
 *  5. journal_entries.lines : update account_code to new sequential
 *  6. Flag zero-activity sub-accounts with inactive:true (soft flag)
 * ============================================================
 */

const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'your_database_name';
const TENANT_EMAIL = process.env.TENANT_EMAIL || 'owner@demo.com';
const CONFIRM = process.env.CONFIRM === 'YES';

const PARENT_CLIENT = '1301';
const PARENT_SUPPLIER = '2101';
const PARENT_BOX_CASH = '1101';
const PARENT_BOX_BANK = '1201';

const pad4 = (n) => String(n).padStart(4, '0');

const isZeroBalance = (balances) => {
  if (!balances || typeof balances !== 'object') return true;
  return Object.values(balances).every(v => !v || Number(v) === 0);
};

(async () => {
  if (!CONFIRM) {
    console.error('⛔ Safety guard: set CONFIRM=YES to actually run the migration.');
    process.exit(2);
  }

  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);

  const user = await db.collection('users').findOne({ email: TENANT_EMAIL });
  if (!user) { console.error('❌ Tenant user not found'); process.exit(1); }
  const T = user.tenant_id;
  const tenant = await db.collection('tenants').findOne({ id: T });

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🚀 LIVE MIGRATION — Chart of Accounts                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Tenant: ${tenant?.name_ar || tenant?.name} (${T})`);
  console.log(`User  : ${TENANT_EMAIL}`);
  console.log(`Time  : ${new Date().toISOString()}\n`);

  // ============================================================
  // PHASE 1: Update parent accounts (is_parent + next_child_seq)
  // ============================================================
  console.log('▶ Phase 1: Mark parent accounts...');
  const parentCodes = [PARENT_CLIENT, PARENT_SUPPLIER, PARENT_BOX_CASH, PARENT_BOX_BANK];
  for (const code of parentCodes) {
    await db.collection('accounts').updateOne(
      { tenant_id: T, code },
      { $set: { is_parent: true, next_child_seq: 0, updated_at: new Date().toISOString() } }
    );
  }
  console.log(`  ✓ Marked ${parentCodes.length} parent accounts\n`);

  // ============================================================
  // PHASE 2: Assign codes to clients
  // ============================================================
  console.log('▶ Phase 2: Assign sequential codes to CLIENTS...');
  const clients = await db.collection('clients').find({ tenant_id: T }).sort({ created_at: 1 }).toArray();
  let cUpdated = 0;
  for (let i = 0; i < clients.length; i++) {
    const seq = i + 1;
    const new_code = PARENT_CLIENT + pad4(seq);
    await db.collection('clients').updateOne(
      { id: clients[i].id },
      { $set: {
          account_code: new_code,
          account_parent_code: PARENT_CLIENT,
          account_seq: seq,
          updated_at: new Date().toISOString()
      }}
    );
    cUpdated++;
  }
  await db.collection('accounts').updateOne(
    { tenant_id: T, code: PARENT_CLIENT },
    { $set: { next_child_seq: clients.length } }
  );
  console.log(`  ✓ Updated ${cUpdated} clients (13010001 → 1301${pad4(clients.length)})\n`);

  // ============================================================
  // PHASE 3: Assign codes to suppliers
  // ============================================================
  console.log('▶ Phase 3: Assign sequential codes to SUPPLIERS...');
  const suppliers = await db.collection('suppliers').find({ tenant_id: T }).sort({ created_at: 1 }).toArray();
  let sUpdated = 0;
  for (let i = 0; i < suppliers.length; i++) {
    const seq = i + 1;
    const new_code = PARENT_SUPPLIER + pad4(seq);
    await db.collection('suppliers').updateOne(
      { id: suppliers[i].id },
      { $set: {
          account_code: new_code,
          account_parent_code: PARENT_SUPPLIER,
          account_seq: seq,
          updated_at: new Date().toISOString()
      }}
    );
    sUpdated++;
  }
  await db.collection('accounts').updateOne(
    { tenant_id: T, code: PARENT_SUPPLIER },
    { $set: { next_child_seq: suppliers.length } }
  );
  console.log(`  ✓ Updated ${sUpdated} suppliers (21010001 → 2101${pad4(suppliers.length)})\n`);

  // ============================================================
  // PHASE 4: Assign codes to boxes
  // ============================================================
  console.log('▶ Phase 4: Assign sequential codes to BOXES...');
  const boxes = await db.collection('boxes').find({ tenant_id: T }).sort({ created_at: 1 }).toArray();
  let cashSeq = 0, bankSeq = 0;
  for (const b of boxes) {
    let parent, seq;
    if (b.type === 'cash') { cashSeq++; parent = PARENT_BOX_CASH; seq = cashSeq; }
    else { bankSeq++; parent = PARENT_BOX_BANK; seq = bankSeq; }
    const new_code = parent + pad4(seq);
    await db.collection('boxes').updateOne(
      { id: b.id },
      { $set: {
          account_code: new_code,
          account_parent_code: parent,
          account_seq: seq,
          updated_at: new Date().toISOString()
      }}
    );
  }
  await db.collection('accounts').updateOne({ tenant_id: T, code: PARENT_BOX_CASH }, { $set: { next_child_seq: cashSeq } });
  await db.collection('accounts').updateOne({ tenant_id: T, code: PARENT_BOX_BANK }, { $set: { next_child_seq: bankSeq } });
  console.log(`  ✓ Updated ${boxes.length} boxes (cash:${cashSeq}, bank:${bankSeq})\n`);

  // ============================================================
  // PHASE 5: Update JE lines
  // ============================================================
  console.log('▶ Phase 5: Update Journal Entries lines...');
  // Build id → new_code map
  const idMap = new Map();
  (await db.collection('clients').find({ tenant_id: T }).toArray())
    .forEach(c => idMap.set(c.id, { code: c.account_code, parent: c.account_parent_code }));
  (await db.collection('suppliers').find({ tenant_id: T }).toArray())
    .forEach(s => idMap.set(s.id, { code: s.account_code, parent: s.account_parent_code }));
  (await db.collection('boxes').find({ tenant_id: T }).toArray())
    .forEach(b => idMap.set(b.id, { code: b.account_code, parent: b.account_parent_code }));

  const jes = await db.collection('journal_entries').find({ tenant_id: T }).toArray();
  let jeUpdated = 0, linesUpdated = 0;
  for (const je of jes) {
    let changed = false;
    const newLines = (je.lines || []).map(line => {
      if (['client', 'supplier', 'box'].includes(line.party_type) && line.party_id) {
        const m = idMap.get(line.party_id);
        if (m && m.code && line.account_code !== m.code) {
          changed = true;
          linesUpdated++;
          return { ...line, account_code: m.code, account_parent_code: m.parent };
        }
      }
      return line;
    });
    if (changed) {
      await db.collection('journal_entries').updateOne(
        { id: je.id },
        { $set: { lines: newLines, updated_at: new Date().toISOString() } }
      );
      jeUpdated++;
    }
  }
  console.log(`  ✓ Updated ${jeUpdated} JEs (${linesUpdated} lines)\n`);

  // ============================================================
  // PHASE 6: Flag zero-activity sub-accounts as inactive
  // ============================================================
  console.log('▶ Phase 6: Flag zero-balance zero-activity entities as inactive...');
  const jeUsageCounts = new Map();
  (await db.collection('journal_entries').find({ tenant_id: T }).toArray())
    .forEach(je => (je.lines || []).forEach(l => {
      if (l.party_id) jeUsageCounts.set(l.party_id, (jeUsageCounts.get(l.party_id) || 0) + 1);
    }));

  const inactiveCandidates = { clients: [], suppliers: [], boxes: [] };
  const checkAndFlag = async (coll, list, bucket) => {
    for (const item of list) {
      const zeroBal = isZeroBalance(item.balances);
      const noJE = !jeUsageCounts.get(item.id);
      if (zeroBal && noJE) {
        await db.collection(coll).updateOne(
          { id: item.id },
          { $set: { inactive: true, inactive_reason: 'zero_balance_zero_activity', updated_at: new Date().toISOString() } }
        );
        bucket.push({ id: item.id, name: item.name_ar || item.name, code: item.account_code });
      }
    }
  };
  const clientsAfter = await db.collection('clients').find({ tenant_id: T }).toArray();
  const suppliersAfter = await db.collection('suppliers').find({ tenant_id: T }).toArray();
  const boxesAfter = await db.collection('boxes').find({ tenant_id: T }).toArray();
  await checkAndFlag('clients', clientsAfter, inactiveCandidates.clients);
  await checkAndFlag('suppliers', suppliersAfter, inactiveCandidates.suppliers);
  await checkAndFlag('boxes', boxesAfter, inactiveCandidates.boxes);
  const totalInactive = inactiveCandidates.clients.length + inactiveCandidates.suppliers.length + inactiveCandidates.boxes.length;
  console.log(`  ✓ Flagged ${totalInactive} inactive entities:`);
  console.log(`      clients: ${inactiveCandidates.clients.length}, suppliers: ${inactiveCandidates.suppliers.length}, boxes: ${inactiveCandidates.boxes.length}\n`);

  // ============================================================
  // VERIFICATION
  // ============================================================
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ POST-MIGRATION VERIFICATION                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Duplicate check
  const allCodes = [...clientsAfter, ...suppliersAfter, ...boxesAfter]
    .map(x => x.account_code).filter(Boolean);
  const dups = allCodes.filter((c, i) => allCodes.indexOf(c) !== i);
  console.log(`Duplicate codes  : ${dups.length === 0 ? '0 ✅' : dups.length + ' ❌'}`);

  // Balance sums
  const sumBal = (arr) => arr.reduce((acc, x) => {
    Object.entries(x.balances || {}).forEach(([k, v]) => acc[k] = (acc[k] || 0) + Number(v || 0));
    return acc;
  }, {});
  console.log('Balances (should be same as pre-migration):');
  console.log('  Clients   :', sumBal(clientsAfter));
  console.log('  Suppliers :', sumBal(suppliersAfter));
  console.log('  Boxes     :', sumBal(boxesAfter));

  // Sample checks
  console.log('\nSample entities after migration:');
  clientsAfter.slice(0, 3).forEach(c => console.log(`  Client "${c.name_ar || c.name}" → code=${c.account_code} parent=${c.account_parent_code} seq=${c.account_seq}`));
  suppliersAfter.slice(0, 3).forEach(s => console.log(`  Supplier "${s.name_ar || s.name}" → code=${s.account_code} parent=${s.account_parent_code} seq=${s.account_seq}`));
  boxesAfter.slice(0, 3).forEach(b => console.log(`  Box "${b.name_ar || b.name}" (${b.type}) → code=${b.account_code} parent=${b.account_parent_code} seq=${b.account_seq}`));

  // JE sample
  console.log('\nSample JE lines after migration:');
  const sampleJEs = await db.collection('journal_entries').find({ tenant_id: T }).limit(2).toArray();
  sampleJEs.forEach(je => {
    console.log(`  JE ${je.id?.slice(0,8)}:`);
    (je.lines || []).forEach(l => console.log(`    ${l.party_type}=${l.party_id?.slice(0,8) || '-'} acc=${l.account_code} parent=${l.account_parent_code || '-'} D=${l.debit || 0} C=${l.credit || 0}`));
  });

  // Inactive candidates list
  if (totalInactive > 0) {
    console.log('\n⚠️  Inactive candidates (zero balance + zero JE activity):');
    inactiveCandidates.clients.forEach(x => console.log(`  [Client]   ${x.code} — ${x.name}`));
    inactiveCandidates.suppliers.forEach(x => console.log(`  [Supplier] ${x.code} — ${x.name}`));
    inactiveCandidates.boxes.forEach(x => console.log(`  [Box]      ${x.code} — ${x.name}`));
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ MIGRATION COMPLETED SUCCESSFULLY                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  await client.close();
})().catch(e => { console.error('❌ خطأ:', e); process.exit(1); });
