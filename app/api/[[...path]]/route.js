import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'

// ---------- MongoDB ----------
let client
let db
async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME || 'rahaal_erp')
    await seedInitial(db)
  }
  return db
}

const CURRENCIES = ['USD', 'SAR', 'YER']
const DEFAULT_RATES = { USD: 1, SAR: 0.267, YER: 0.0038 }
const emptyBalances = () => ({ USD: 0, SAR: 0, YER: 0 })

async function seedInitial(db) {
  const settings = db.collection('settings')
  if (!(await settings.findOne({ key: 'exchange_rates' }))) {
    await settings.insertOne({ key: 'exchange_rates', rates: DEFAULT_RATES, updated_at: new Date() })
  }
  const acc = db.collection('accounts')
  if ((await acc.countDocuments()) === 0) {
    const now = new Date()
    await acc.insertMany([
      { id: uuidv4(), code: '1', name_ar: 'الأصول', type: 'asset', parent: null, is_group: true, created_at: now },
      { id: uuidv4(), code: '11', name_ar: 'الأصول المتداولة', type: 'asset', parent: '1', is_group: true, created_at: now },
      { id: uuidv4(), code: '1101', name_ar: 'صندوق دولار', type: 'asset', parent: '11', is_group: false, currency: 'USD', created_at: now },
      { id: uuidv4(), code: '1102', name_ar: 'صندوق ريال سعودي', type: 'asset', parent: '11', is_group: false, currency: 'SAR', created_at: now },
      { id: uuidv4(), code: '1103', name_ar: 'صندوق ريال يمني', type: 'asset', parent: '11', is_group: false, currency: 'YER', created_at: now },
      { id: uuidv4(), code: '1201', name_ar: 'حسابات بنكية / محافظ', type: 'asset', parent: '11', is_group: true, created_at: now },
      { id: uuidv4(), code: '1301', name_ar: 'العملاء (مدينون)', type: 'asset', parent: '11', is_group: true, created_at: now },
      { id: uuidv4(), code: '2', name_ar: 'الخصوم', type: 'liability', parent: null, is_group: true, created_at: now },
      { id: uuidv4(), code: '2101', name_ar: 'الموردون والوكلاء (دائنون)', type: 'liability', parent: '2', is_group: true, created_at: now },
      { id: uuidv4(), code: '4', name_ar: 'الإيرادات', type: 'revenue', parent: null, is_group: true, created_at: now },
      { id: uuidv4(), code: '4101', name_ar: 'إيرادات عمولات التذاكر', type: 'revenue', parent: '4', is_group: false, created_at: now },
      { id: uuidv4(), code: '4102', name_ar: 'إيرادات عمولات التأشيرات والموافقات', type: 'revenue', parent: '4', is_group: false, created_at: now },
      { id: uuidv4(), code: '4103', name_ar: 'إيرادات خدمات إضافية', type: 'revenue', parent: '4', is_group: false, created_at: now },
      { id: uuidv4(), code: '5', name_ar: 'المصروفات', type: 'expense', parent: null, is_group: true, created_at: now },
      { id: uuidv4(), code: '5101', name_ar: 'مصاريف تشغيلية', type: 'expense', parent: '5', is_group: true, created_at: now },
      { id: uuidv4(), code: '5201', name_ar: 'فروق عملة وتسويات', type: 'expense', parent: '5', is_group: false, created_at: now },
    ])
  }
  const boxes = db.collection('boxes')
  if ((await boxes.countDocuments()) === 0) {
    await boxes.insertMany([
      { id: uuidv4(), name_ar: 'الصندوق الرئيسي', type: 'cash', balances: emptyBalances(), created_at: new Date() },
      { id: uuidv4(), name_ar: 'حساب بنكي / محفظة', type: 'bank', balances: emptyBalances(), created_at: new Date() },
    ])
  }
}

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}
export async function OPTIONS() { return cors(new NextResponse(null, { status: 200 })) }
const ok = (d) => cors(NextResponse.json(d))
const bad = (m, s = 400) => cors(NextResponse.json({ error: m }, { status: s }))
const clean = (arr) => arr.map(({ _id, ...r }) => r)

async function updateBalance(db, col, id, currency, delta) {
  await db.collection(col).updateOne({ id }, { $inc: { [`balances.${currency}`]: delta } })
}
async function createJournalEntry(db, { date, description, ref_type, ref_id, currency, lines }) {
  const je = { id: uuidv4(), date: new Date(date || Date.now()), description, ref_type, ref_id, currency, lines, created_at: new Date() }
  await db.collection('journal_entries').insertOne(je)
  return je
}

async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method
  const url = new URL(request.url)
  const q = Object.fromEntries(url.searchParams.entries())

  try {
    const db = await connectToMongo()

    if (route === '/' || route === '/root') return ok({ ok: true, app: 'Rahaal ERP' })

    // Exchange rates
    if (route === '/rates' && method === 'GET') {
      const s = await db.collection('settings').findOne({ key: 'exchange_rates' })
      return ok({ rates: s?.rates || DEFAULT_RATES, updated_at: s?.updated_at })
    }
    if (route === '/rates' && method === 'POST') {
      const body = await request.json()
      await db.collection('settings').updateOne({ key: 'exchange_rates' }, { $set: { rates: body.rates, updated_at: new Date() } }, { upsert: true })
      return ok({ success: true })
    }

    // Clients
    if (route === '/clients' && method === 'GET') return ok(clean(await db.collection('clients').find({}).sort({ created_at: -1 }).toArray()))
    if (route === '/clients' && method === 'POST') {
      const b = await request.json()
      if (!b.name) return bad('اسم العميل مطلوب')
      const doc = { id: uuidv4(), name: b.name, phone: b.phone || '', notes: b.notes || '', balances: emptyBalances(), created_at: new Date() }
      await db.collection('clients').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }

    // Suppliers
    if (route === '/suppliers' && method === 'GET') return ok(clean(await db.collection('suppliers').find({}).sort({ created_at: -1 }).toArray()))
    if (route === '/suppliers' && method === 'POST') {
      const b = await request.json()
      if (!b.name) return bad('اسم المورد مطلوب')
      const doc = { id: uuidv4(), name: b.name, phone: b.phone || '', notes: b.notes || '', balances: emptyBalances(), created_at: new Date() }
      await db.collection('suppliers').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }

    // Boxes
    if (route === '/boxes' && method === 'GET') return ok(clean(await db.collection('boxes').find({}).sort({ created_at: 1 }).toArray()))
    if (route === '/boxes' && method === 'POST') {
      const b = await request.json()
      if (!b.name_ar) return bad('اسم الصندوق مطلوب')
      const doc = { id: uuidv4(), name_ar: b.name_ar, type: b.type || 'cash', balances: emptyBalances(), created_at: new Date() }
      await db.collection('boxes').insertOne(doc)
      const { _id, ...rest } = doc; return ok(rest)
    }

    // Accounts
    if (route === '/accounts' && method === 'GET') return ok(clean(await db.collection('accounts').find({}).sort({ code: 1 }).toArray()))

    // Tickets
    if (route === '/tickets' && method === 'GET') return ok(clean(await db.collection('tickets').find({}).sort({ date: -1, created_at: -1 }).limit(500).toArray()))
    if (route === '/tickets' && method === 'POST') {
      const b = await request.json()
      if (!b.client_id || !b.supplier_id) return bad('العميل والمورد مطلوبان')
      if (!CURRENCIES.includes(b.currency)) return bad('عملة غير صالحة')
      const cost = Number(b.cost) || 0
      const sale = Number(b.sale_price) || 0
      const commission = +(sale - cost).toFixed(2)
      const cli = await db.collection('clients').findOne({ id: b.client_id })
      const sup = await db.collection('suppliers').findOne({ id: b.supplier_id })
      if (!cli || !sup) return bad('العميل أو المورد غير موجود')
      const doc = {
        id: uuidv4(), date: new Date(b.date || Date.now()), currency: b.currency,
        exchange_rate: Number(b.exchange_rate) || 1,
        client_id: cli.id, client_name: cli.name, supplier_id: sup.id, supplier_name: sup.name,
        pnr: b.pnr || '', route: b.route || '', passenger_name: b.passenger_name || '',
        passport_no: b.passport_no || '', travel_date: b.travel_date ? new Date(b.travel_date) : null,
        cost, sale_price: sale, commission, created_at: new Date(),
      }
      await db.collection('tickets').insertOne(doc)
      await updateBalance(db, 'clients', cli.id, b.currency, sale)
      await updateBalance(db, 'suppliers', sup.id, b.currency, cost)
      await createJournalEntry(db, {
        date: doc.date, description: `حجز تذكرة PNR ${doc.pnr || '-'} — ${cli.name}`,
        ref_type: 'ticket', ref_id: doc.id, currency: b.currency,
        lines: [
          { account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: sale, credit: 0 },
          { account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sup.id, party_name: sup.name, debit: 0, credit: cost },
          { account_code: '4101', account_name: 'إيرادات عمولات التذاكر', party_type: 'revenue', party_id: null, party_name: 'إيرادات عمولات التذاكر', debit: 0, credit: commission },
        ],
      })
      const { _id, ...rest } = doc; return ok(rest)
    }

    // Visas
    if (route === '/visas' && method === 'GET') return ok(clean(await db.collection('visas').find({}).sort({ date: -1, created_at: -1 }).limit(500).toArray()))
    if (route === '/visas' && method === 'POST') {
      const b = await request.json()
      if (!b.client_id || !b.supplier_id) return bad('العميل والمورد مطلوبان')
      if (!CURRENCIES.includes(b.currency)) return bad('عملة غير صالحة')
      const cost = Number(b.cost) || 0
      const sale = Number(b.sale_price) || 0
      const commission = +(sale - cost).toFixed(2)
      const cli = await db.collection('clients').findOne({ id: b.client_id })
      const sup = await db.collection('suppliers').findOne({ id: b.supplier_id })
      if (!cli || !sup) return bad('العميل أو المورد غير موجود')
      const doc = {
        id: uuidv4(), date: new Date(b.date || Date.now()), service_type: b.service_type || 'تأشيرة عمرة',
        currency: b.currency, exchange_rate: Number(b.exchange_rate) || 1,
        client_id: cli.id, client_name: cli.name, supplier_id: sup.id, supplier_name: sup.name,
        passenger_name: b.passenger_name || '', passport_no: b.passport_no || '',
        nationality: b.nationality || '', attachment_url: b.attachment_url || '',
        cost, sale_price: sale, commission, created_at: new Date(),
      }
      await db.collection('visas').insertOne(doc)
      await updateBalance(db, 'clients', cli.id, b.currency, sale)
      await updateBalance(db, 'suppliers', sup.id, b.currency, cost)
      await createJournalEntry(db, {
        date: doc.date, description: `${doc.service_type} — ${doc.passenger_name || cli.name}`,
        ref_type: 'visa', ref_id: doc.id, currency: b.currency,
        lines: [
          { account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: cli.id, party_name: cli.name, debit: sale, credit: 0 },
          { account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: sup.id, party_name: sup.name, debit: 0, credit: cost },
          { account_code: '4102', account_name: 'إيرادات عمولات التأشيرات', party_type: 'revenue', party_id: null, party_name: 'إيرادات عمولات التأشيرات', debit: 0, credit: commission },
        ],
      })
      const { _id, ...rest } = doc; return ok(rest)
    }

    // Vouchers
    if (route === '/vouchers' && method === 'GET') {
      const filter = {}; if (q.type) filter.type = q.type
      return ok(clean(await db.collection('vouchers').find(filter).sort({ date: -1, created_at: -1 }).limit(500).toArray()))
    }
    if (route === '/vouchers' && method === 'POST') {
      const b = await request.json()
      if (!['receipt', 'payment'].includes(b.type)) return bad('نوع السند غير صالح')
      if (!CURRENCIES.includes(b.currency)) return bad('عملة غير صالحة')
      const amount = Number(b.amount) || 0
      if (amount <= 0) return bad('المبلغ يجب أن يكون أكبر من صفر')

      let partyName = ''
      if (b.party_type === 'client') {
        const c = await db.collection('clients').findOne({ id: b.party_id })
        if (!c) return bad('العميل غير موجود'); partyName = c.name
      } else if (b.party_type === 'supplier') {
        const s = await db.collection('suppliers').findOne({ id: b.party_id })
        if (!s) return bad('المورد غير موجود'); partyName = s.name
      } else if (b.party_type === 'expense') {
        partyName = b.party_name || 'مصروف تشغيلي'
      } else return bad('الطرف غير صالح')

      const box = await db.collection('boxes').findOne({ id: b.box_id })
      if (!box) return bad('الصندوق/البنك غير موجود')

      const doc = {
        id: uuidv4(), type: b.type, date: new Date(b.date || Date.now()),
        currency: b.currency, amount, party_type: b.party_type, party_id: b.party_id || null,
        party_name: partyName, box_id: box.id, box_name: box.name_ar,
        method: b.method || (box.type === 'cash' ? 'صندوق' : 'بنك'),
        description: b.description || '', created_at: new Date(),
      }
      await db.collection('vouchers').insertOne(doc)

      if (b.type === 'receipt') {
        await updateBalance(db, 'boxes', box.id, b.currency, +amount)
        if (b.party_type === 'client') await updateBalance(db, 'clients', b.party_id, b.currency, -amount)
        if (b.party_type === 'supplier') await updateBalance(db, 'suppliers', b.party_id, b.currency, +amount)
      } else {
        await updateBalance(db, 'boxes', box.id, b.currency, -amount)
        if (b.party_type === 'supplier') await updateBalance(db, 'suppliers', b.party_id, b.currency, -amount)
        if (b.party_type === 'client') await updateBalance(db, 'clients', b.party_id, b.currency, +amount)
      }

      const lines = []
      const boxAccCode = box.type === 'cash' ? '1101' : '1201'
      if (b.type === 'receipt') {
        lines.push({ account_code: boxAccCode, account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: amount, credit: 0 })
        if (b.party_type === 'client')   lines.push({ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: b.party_id, party_name: partyName, debit: 0, credit: amount })
        if (b.party_type === 'supplier') lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: b.party_id, party_name: partyName, debit: 0, credit: amount })
        if (b.party_type === 'expense')  lines.push({ account_code: '4103', account_name: 'إيراد متنوع', party_type: 'revenue', party_id: null, party_name: 'إيراد متنوع', debit: 0, credit: amount })
      } else {
        if (b.party_type === 'supplier') lines.push({ account_code: '2101', account_name: 'الموردون', party_type: 'supplier', party_id: b.party_id, party_name: partyName, debit: amount, credit: 0 })
        if (b.party_type === 'client')   lines.push({ account_code: '1301', account_name: 'العملاء', party_type: 'client', party_id: b.party_id, party_name: partyName, debit: amount, credit: 0 })
        if (b.party_type === 'expense')  lines.push({ account_code: '5101', account_name: 'مصاريف تشغيلية', party_type: 'expense', party_id: null, party_name: partyName, debit: amount, credit: 0 })
        lines.push({ account_code: boxAccCode, account_name: box.name_ar, party_type: 'box', party_id: box.id, party_name: box.name_ar, debit: 0, credit: amount })
      }
      await createJournalEntry(db, {
        date: doc.date,
        description: (b.type === 'receipt' ? 'سند قبض — ' : 'سند صرف — ') + (doc.description || partyName),
        ref_type: b.type === 'receipt' ? 'receipt' : 'payment',
        ref_id: doc.id, currency: b.currency, lines,
      })
      const { _id, ...rest } = doc; return ok(rest)
    }

    // Journal entries
    if (route === '/journal-entries' && method === 'GET') return ok(clean(await db.collection('journal_entries').find({}).sort({ date: -1, created_at: -1 }).limit(500).toArray()))

    // Dashboard
    if (route === '/dashboard' && method === 'GET') {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30)
      const rates = (await db.collection('settings').findOne({ key: 'exchange_rates' }))?.rates || DEFAULT_RATES

      const [ticketsToday, visasToday, ticketsMonth, visasMonth] = await Promise.all([
        db.collection('tickets').find({ date: { $gte: todayStart } }).toArray(),
        db.collection('visas').find({ date: { $gte: todayStart } }).toArray(),
        db.collection('tickets').find({ date: { $gte: monthAgo } }).toArray(),
        db.collection('visas').find({ date: { $gte: monthAgo } }).toArray(),
      ])

      const kpiSales = { USD: 0, SAR: 0, YER: 0 }
      const kpiProfit = { USD: 0, SAR: 0, YER: 0 }
      for (const t of [...ticketsToday, ...visasToday]) {
        kpiSales[t.currency] += t.sale_price || 0
        kpiProfit[t.currency] += t.commission || 0
      }

      const dayMap = {}
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
        const key = d.toISOString().slice(0, 10)
        dayMap[key] = { date: key, sales: 0, profit: 0 }
      }
      for (const t of [...ticketsMonth, ...visasMonth]) {
        const key = new Date(t.date).toISOString().slice(0, 10)
        if (dayMap[key]) {
          const rate = rates[t.currency] || 1
          dayMap[key].sales += (t.sale_price || 0) * rate
          dayMap[key].profit += (t.commission || 0) * rate
        }
      }
      for (const k of Object.keys(dayMap)) { dayMap[k].sales = +dayMap[k].sales.toFixed(2); dayMap[k].profit = +dayMap[k].profit.toFixed(2) }

      const pieMap = { 'تذاكر': 0, 'تأشيرات عمرة': 0, 'تأشيرات سياحية/عمل': 0, 'موافقات أمنية': 0, 'حجز فنادق': 0, 'أخرى': 0 }
      for (const t of ticketsMonth) pieMap['تذاكر'] += (t.commission || 0) * (rates[t.currency] || 1)
      for (const v of visasMonth) {
        const st = v.service_type || 'أخرى'
        let key = 'أخرى'
        if (st.includes('عمرة')) key = 'تأشيرات عمرة'
        else if (st.includes('موافق')) key = 'موافقات أمنية'
        else if (st.includes('فندق')) key = 'حجز فنادق'
        else if (st.includes('سياح') || st.includes('عمل')) key = 'تأشيرات سياحية/عمل'
        pieMap[key] += (v.commission || 0) * (rates[v.currency] || 1)
      }

      const recentTickets = await db.collection('tickets').find({}).sort({ created_at: -1 }).limit(5).toArray()
      const recentVisas   = await db.collection('visas').find({}).sort({ created_at: -1 }).limit(5).toArray()
      const recentVouchers= await db.collection('vouchers').find({}).sort({ created_at: -1 }).limit(5).toArray()
      const activity = [
        ...recentTickets.map(t => ({ kind: 'ticket', id: t.id, when: t.created_at, title: `تذكرة ${t.pnr || ''} — ${t.client_name}`, subtitle: `${t.route || ''} • ${t.currency} ${t.sale_price}`, amount: t.commission, currency: t.currency })),
        ...recentVisas.map(v => ({ kind: 'visa', id: v.id, when: v.created_at, title: `${v.service_type} — ${v.passenger_name || v.client_name}`, subtitle: `${v.currency} ${v.sale_price}`, amount: v.commission, currency: v.currency })),
        ...recentVouchers.map(x => ({ kind: x.type, id: x.id, when: x.created_at, title: `${x.type === 'receipt' ? 'سند قبض' : 'سند صرف'} — ${x.party_name}`, subtitle: `${x.currency} ${x.amount}`, amount: x.amount, currency: x.currency })),
      ].sort((a, b) => new Date(b.when) - new Date(a.when)).slice(0, 12)

      return ok({
        kpi: { sales_today: kpiSales, profit_today: kpiProfit, count_today: ticketsToday.length + visasToday.length, tickets_today: ticketsToday.length, visas_today: visasToday.length },
        line: Object.values(dayMap),
        pie: Object.entries(pieMap).map(([name, value]) => ({ name, value: +value.toFixed(2) })).filter(x => x.value > 0),
        activity,
      })
    }

    // Reports
    if (route === '/reports/profits' && method === 'GET') {
      const from = q.from ? new Date(q.from) : new Date(0)
      const to   = q.to   ? new Date(q.to)   : new Date(); to.setHours(23,59,59,999)
      const filter = { date: { $gte: from, $lte: to } }
      const [tickets, visas] = await Promise.all([
        db.collection('tickets').find(filter).sort({ date: 1 }).toArray(),
        db.collection('visas').find(filter).sort({ date: 1 }).toArray(),
      ])
      const rows = [
        ...tickets.map(t => ({ id: t.id, kind: 'تذكرة', date: t.date, client: t.client_name, supplier: t.supplier_name, ref: t.pnr || t.route, currency: t.currency, cost: t.cost, sale: t.sale_price, profit: t.commission })),
        ...visas.map(v => ({ id: v.id, kind: v.service_type, date: v.date, client: v.client_name, supplier: v.supplier_name, ref: v.passenger_name || v.passport_no, currency: v.currency, cost: v.cost, sale: v.sale_price, profit: v.commission })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date))
      const totals = { USD: 0, SAR: 0, YER: 0 }
      const totalSales = { USD: 0, SAR: 0, YER: 0 }
      for (const r of rows) { totals[r.currency] += r.profit; totalSales[r.currency] += r.sale }
      return ok({ rows, totals_profit: totals, totals_sales: totalSales })
    }

    if (route === '/reports/statement' && method === 'GET') {
      const { party_type, party_id } = q
      if (!party_type || !party_id) return bad('نوع الطرف والمعرف مطلوبان')
      const jes = await db.collection('journal_entries').find({}).sort({ date: 1, created_at: 1 }).toArray()
      const rows = []
      const run = { USD: 0, SAR: 0, YER: 0 }
      for (const je of jes) {
        for (const l of je.lines || []) {
          if (l.party_type === party_type && l.party_id === party_id) {
            let delta = 0
            if (party_type === 'client') delta = (l.debit || 0) - (l.credit || 0)
            if (party_type === 'supplier') delta = (l.credit || 0) - (l.debit || 0)
            run[je.currency] += delta
            rows.push({ date: je.date, description: je.description, ref_type: je.ref_type, currency: je.currency, debit: l.debit || 0, credit: l.credit || 0, balance: run[je.currency] })
          }
        }
      }
      const party = party_type === 'client' ? await db.collection('clients').findOne({ id: party_id }) : await db.collection('suppliers').findOne({ id: party_id })
      return ok({ party: party ? { id: party.id, name: party.name, balances: party.balances } : null, rows })
    }

    if (route === '/reports/trial-balance' && method === 'GET') {
      const jes = await db.collection('journal_entries').find({}).toArray()
      const map = {}
      for (const je of jes) {
        for (const l of je.lines || []) {
          const label = l.party_name || l.account_name
          const key = `${l.account_code}|${je.currency}|${label}`
          if (!map[key]) map[key] = { code: l.account_code, name: l.account_name, party_name: l.party_name, currency: je.currency, debit: 0, credit: 0 }
          map[key].debit += l.debit || 0
          map[key].credit += l.credit || 0
        }
      }
      const rows = Object.values(map).map(r => ({ ...r, balance: r.debit - r.credit }))
      const totals = { USD: { d: 0, c: 0 }, SAR: { d: 0, c: 0 }, YER: { d: 0, c: 0 } }
      for (const r of rows) { totals[r.currency].d += r.debit; totals[r.currency].c += r.credit }
      return ok({ rows, totals })
    }

    if (route === '/reports/income-statement' && method === 'GET') {
      const from = q.from ? new Date(q.from) : new Date(0)
      const to   = q.to   ? new Date(q.to)   : new Date(); to.setHours(23,59,59,999)
      const rates = (await db.collection('settings').findOne({ key: 'exchange_rates' }))?.rates || DEFAULT_RATES
      const [tickets, visas, vouchers] = await Promise.all([
        db.collection('tickets').find({ date: { $gte: from, $lte: to } }).toArray(),
        db.collection('visas').find({ date: { $gte: from, $lte: to } }).toArray(),
        db.collection('vouchers').find({ date: { $gte: from, $lte: to }, type: 'payment', party_type: 'expense' }).toArray(),
      ])
      const rev = { tickets: {USD:0,SAR:0,YER:0}, visas: {USD:0,SAR:0,YER:0}, other: {USD:0,SAR:0,YER:0} }
      for (const t of tickets) rev.tickets[t.currency] += t.commission || 0
      for (const v of visas)   rev.visas[v.currency]   += v.commission || 0
      const exp = { USD:0, SAR:0, YER:0 }
      for (const p of vouchers) exp[p.currency] += p.amount || 0
      const totalRevUsd = Object.values(rev).reduce((s, cur) => s + Object.entries(cur).reduce((ss, [c, v]) => ss + v * (rates[c] || 1), 0), 0)
      const totalExpUsd = Object.entries(exp).reduce((s, [c, v]) => s + v * (rates[c] || 1), 0)
      return ok({ revenue: rev, expenses: exp, total_revenue_usd: +totalRevUsd.toFixed(2), total_expenses_usd: +totalExpUsd.toFixed(2), net_profit_usd: +(totalRevUsd - totalExpUsd).toFixed(2) })
    }

    return bad(`Route ${route} not found`, 404)
  } catch (e) {
    console.error('API Error:', e)
    return bad('Internal server error: ' + e.message, 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
