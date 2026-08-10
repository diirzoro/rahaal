/**
 * ============================================================
 * Chart of Accounts Migration — DRY RUN (READ-ONLY)
 * ============================================================
 * الهدف: توليد تقرير Before/After بدون كتابة أي شيء لقاعدة البيانات
 * Target Tenant: owner@demo.com (مكتب الرحّال التجريبي)
 * ============================================================
 */

const { MongoClient } = require('mongodb');

// -------- Config --------
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'your_database_name';
const TENANT_EMAIL = process.env.TENANT_EMAIL || 'owner@demo.com';

// Parent code mapping (per plan)
const PARENT_CLIENT = '1301';       // العملاء
const PARENT_SUPPLIER = '2101';     // الموردون
const PARENT_BOX_CASH = '1101';     // الصندوق النقدي
const PARENT_BOX_BANK = '1201';     // الحساب البنكي

const pad4 = (n) => String(n).padStart(4, '0');

// Pretty table printer
function printTable(rows, cols, widths, title) {
  console.log('\n' + '━'.repeat(widths.reduce((a,b)=>a+b+3,0)));
  console.log('📋 ' + title);
  console.log('━'.repeat(widths.reduce((a,b)=>a+b+3,0)));
  const header = cols.map((c,i)=>String(c).padEnd(widths[i])).join(' | ');
  console.log(header);
  console.log('─'.repeat(widths.reduce((a,b)=>a+b+3,0)));
  rows.forEach(r => {
    console.log(r.map((v,i)=>String(v ?? '').slice(0,widths[i]).padEnd(widths[i])).join(' | '));
  });
  console.log('─'.repeat(widths.reduce((a,b)=>a+b+3,0)));
  console.log(`Total: ${rows.length} row(s)`);
}

(async () => {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🚀 DRY-RUN: Chart of Accounts Migration                     ║');
  console.log('║  ⚠️  READ-ONLY — لن يتم كتابة أي شيء في قاعدة البيانات        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // ---- 1. Locate target tenant ----
  const user = await db.collection('users').findOne({ email: TENANT_EMAIL });
  if (!user) { console.error('❌ Tenant user not found:', TENANT_EMAIL); process.exit(1); }
  const tenant = await db.collection('tenants').findOne({ id: user.tenant_id });
  const T = user.tenant_id;
  console.log(`\n🏢 Tenant المستهدف: ${tenant?.name || tenant?.name_ar || '(بلا اسم)'}`);
  console.log(`   Tenant ID: ${T}`);
  console.log(`   المالك: ${user.email}\n`);

  // ---- 2. Fetch parent accounts ----
  const parents = {};
  for (const code of [PARENT_CLIENT, PARENT_SUPPLIER, PARENT_BOX_CASH, PARENT_BOX_BANK]) {
    parents[code] = await db.collection('accounts').findOne({ tenant_id: T, code });
  }
  const parentRows = Object.entries(parents).map(([code, a]) => [
    code,
    a?.name_ar || '(غير موجود)',
    a?.type || '-',
    a?.is_group ? 'نعم' : 'لا',
    a ? '✅' : '❌'
  ]);
  printTable(parentRows, ['الكود الأب','الاسم','النوع','مجموعة','موجود'], [10, 35, 12, 8, 6], 'الحسابات الأب (Parents)');

  // ---- 3. Clients ----
  const clients = await db.collection('clients').find({ tenant_id: T }).sort({ created_at: 1 }).toArray();
  const clientMapping = clients.map((c, i) => ({
    id: c.id,
    name: c.name_ar || c.name || '(بلا اسم)',
    old_code: PARENT_CLIENT,                       // كانت تشير للحساب الأب فقط
    new_code: PARENT_CLIENT + pad4(i + 1),         // 13010001, 13010002...
    balances: c.balances || {},
    created_at: c.created_at
  }));
  printTable(
    clientMapping.map(c => [c.name, c.old_code, '→', c.new_code, JSON.stringify(c.balances).slice(0, 40)]),
    ['اسم العميل','الكود القديم','','الكود الجديد','الأرصدة'],
    [30, 12, 3, 14, 42],
    `العملاء (Clients) — Parent: ${PARENT_CLIENT}`
  );

  // ---- 4. Suppliers ----
  const suppliers = await db.collection('suppliers').find({ tenant_id: T }).sort({ created_at: 1 }).toArray();
  const supplierMapping = suppliers.map((s, i) => ({
    id: s.id,
    name: s.name_ar || s.name || '(بلا اسم)',
    old_code: PARENT_SUPPLIER,
    new_code: PARENT_SUPPLIER + pad4(i + 1),
    balances: s.balances || {},
    created_at: s.created_at
  }));
  printTable(
    supplierMapping.map(s => [s.name, s.old_code, '→', s.new_code, JSON.stringify(s.balances).slice(0, 40)]),
    ['اسم المورد','الكود القديم','','الكود الجديد','الأرصدة'],
    [30, 12, 3, 14, 42],
    `الموردون (Suppliers) — Parent: ${PARENT_SUPPLIER}`
  );

  // ---- 5. Boxes (cash + bank) ----
  const boxes = await db.collection('boxes').find({ tenant_id: T }).sort({ created_at: 1 }).toArray();
  let cashSeq = 0, bankSeq = 0;
  const boxMapping = boxes.map(b => {
    let parent, seq;
    if (b.type === 'cash') { cashSeq++; parent = PARENT_BOX_CASH; seq = cashSeq; }
    else { bankSeq++; parent = PARENT_BOX_BANK; seq = bankSeq; }
    return {
      id: b.id,
      name: b.name_ar || b.name || '(بلا اسم)',
      type: b.type,
      old_code: parent,
      new_code: parent + pad4(seq),
      balances: b.balances || {}
    };
  });
  printTable(
    boxMapping.map(b => [b.name, b.type, b.old_code, '→', b.new_code, JSON.stringify(b.balances).slice(0, 35)]),
    ['اسم الصندوق','النوع','الكود القديم','','الكود الجديد','الأرصدة'],
    [22, 6, 12, 3, 14, 38],
    `الصناديق (Boxes) — Cash: ${PARENT_BOX_CASH} | Bank: ${PARENT_BOX_BANK}`
  );

  // ---- 6. Build lookup maps for JE impact ----
  const idToNewCode = new Map();
  clientMapping.forEach(c => idToNewCode.set(c.id, { new: c.new_code, parent: PARENT_CLIENT, type: 'client', name: c.name }));
  supplierMapping.forEach(s => idToNewCode.set(s.id, { new: s.new_code, parent: PARENT_SUPPLIER, type: 'supplier', name: s.name }));
  boxMapping.forEach(b => idToNewCode.set(b.id, { new: b.new_code, parent: b.old_code, type: 'box', name: b.name }));

  // ---- 7. Analyze Journal Entries ----
  const jes = await db.collection('journal_entries').find({ tenant_id: T }).toArray();
  let jeLinesAffected = 0;
  let jeLinesUntouched = 0;
  let orphanRefs = 0;
  const orphanDetails = [];
  const perAccountJECounts = {};

  jes.forEach(je => {
    (je.lines || []).forEach(line => {
      const isSubAccount = ['client', 'supplier', 'box'].includes(line.party_type) && line.party_id;
      if (isSubAccount) {
        const mapping = idToNewCode.get(line.party_id);
        if (mapping) {
          jeLinesAffected++;
          const key = mapping.new;
          perAccountJECounts[key] = (perAccountJECounts[key] || 0) + 1;
        } else {
          orphanRefs++;
          orphanDetails.push({
            je_id: je.id?.slice(0, 8),
            party_type: line.party_type,
            party_id: line.party_id?.slice(0, 8),
            account_code: line.account_code
          });
        }
      } else {
        jeLinesUntouched++;
      }
    });
  });

  // JE Impact table
  const jeImpactRows = Object.entries(perAccountJECounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([code, cnt]) => {
      const info = [...idToNewCode.values()].find(v => v.new === code);
      return [code, info?.name || '?', info?.type || '?', cnt];
    });
  printTable(
    jeImpactRows,
    ['الكود الجديد','الاسم','النوع','عدد أسطر JE'],
    [14, 30, 10, 12],
    `توزيع أسطر القيود على الحسابات الفرعية (Top 20)`
  );

  // Orphan warnings
  if (orphanDetails.length > 0) {
    console.log('\n⚠️  تحذيرات — أسطر JE تشير إلى party_id غير موجود في clients/suppliers/boxes:');
    orphanDetails.slice(0, 10).forEach(o => console.log(`   JE ${o.je_id} | ${o.party_type}=${o.party_id} | acc=${o.account_code}`));
    if (orphanDetails.length > 10) console.log(`   ... و ${orphanDetails.length - 10} حالة أخرى`);
  }

  // ---- 8. Duplicate code check ----
  const allNewCodes = [
    ...clientMapping.map(x => x.new_code),
    ...supplierMapping.map(x => x.new_code),
    ...boxMapping.map(x => x.new_code)
  ];
  const dupSet = new Set();
  const seen = new Set();
  allNewCodes.forEach(c => { if (seen.has(c)) dupSet.add(c); else seen.add(c); });

  // ---- 9. Balance integrity (per currency) ----
  const totalBalances = { clients: {}, suppliers: {}, boxes: {} };
  const addBal = (target, bal) => {
    Object.entries(bal || {}).forEach(([cur, val]) => {
      target[cur] = (target[cur] || 0) + Number(val || 0);
    });
  };
  clientMapping.forEach(c => addBal(totalBalances.clients, c.balances));
  supplierMapping.forEach(s => addBal(totalBalances.suppliers, s.balances));
  boxMapping.forEach(b => addBal(totalBalances.boxes, b.balances));

  console.log('\n💰 مجاميع الأرصدة الحالية (يجب أن تبقى كما هي بعد الترحيل):');
  console.log('   Clients   :', totalBalances.clients);
  console.log('   Suppliers :', totalBalances.suppliers);
  console.log('   Boxes     :', totalBalances.boxes);

  // Debit/Credit balance sanity in JEs
  let sumDebit = 0, sumCredit = 0;
  jes.forEach(je => (je.lines || []).forEach(l => {
    sumDebit += Number(l.debit || 0);
    sumCredit += Number(l.credit || 0);
  }));
  console.log('\n⚖️  ميزان القيود (Trial):');
  console.log(`   إجمالي المدين  : ${sumDebit}`);
  console.log(`   إجمالي الدائن : ${sumCredit}`);
  console.log(`   الفرق         : ${Math.abs(sumDebit - sumCredit)} ${sumDebit === sumCredit ? '✅ متوازن' : '⚠️ غير متوازن'}`);

  // ---- 10. Final Summary ----
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 ملخص Dry-Run النهائي                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  const summary = [
    ['العملاء (Clients)', clients.length, `${PARENT_CLIENT}0001 → ${PARENT_CLIENT}${pad4(clients.length)}`],
    ['الموردون (Suppliers)', suppliers.length, `${PARENT_SUPPLIER}0001 → ${PARENT_SUPPLIER}${pad4(suppliers.length)}`],
    ['صناديق نقدية (Cash)', boxes.filter(b=>b.type==='cash').length, `${PARENT_BOX_CASH}0001 → ${PARENT_BOX_CASH}${pad4(cashSeq)}`],
    ['صناديق بنكية (Bank)', boxes.filter(b=>b.type==='bank').length, `${PARENT_BOX_BANK}0001 → ${PARENT_BOX_BANK}${pad4(bankSeq)}`],
  ];
  printTable(summary, ['النوع','العدد','نطاق الأكواد الجديدة'], [22, 8, 42], 'ملخص الأكواد المتوقّعة');

  console.log(`\n📝 القيود اليومية (Journal Entries):`);
  console.log(`   عدد JEs الإجمالي         : ${jes.length}`);
  console.log(`   أسطر ستتحدّث (party ref) : ${jeLinesAffected}`);
  console.log(`   أسطر لن تتأثّر (ثابتة)   : ${jeLinesUntouched}`);
  console.log(`   أسطر يتيمة (orphan)      : ${orphanRefs} ${orphanRefs > 0 ? '⚠️' : '✅'}`);

  console.log(`\n🔒 فحص السلامة:`);
  console.log(`   أكواد مكرّرة داخل الـtenant : ${dupSet.size} ${dupSet.size === 0 ? '✅' : '❌ ' + [...dupSet].join(', ')}`);
  console.log(`   الحسابات الأب موجودة        : ${Object.values(parents).every(p=>!!p) ? '✅ الكل موجود' : '❌ نقص'}`);
  console.log(`   ميزان القيود متوازن         : ${sumDebit === sumCredit ? '✅' : '⚠️'}`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Dry-Run انتهى بنجاح — لا تعديل تم على قاعدة البيانات      ║');
  console.log('║  📤 راجع التقرير أعلاه ثم اعتمد الترحيل الفعلي في Session B  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await client.close();
})().catch(e => { console.error('❌ خطأ:', e); process.exit(1); });
