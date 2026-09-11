'use client'
// v3.93 — ADMIN ACCOUNTING & FINANCIAL OVERSIGHT (Batch 1) — READ-ONLY.
// REUSES /api/admin/center/accounting/* (lib/adminCenter.js). Stored values
// only, per-currency always, mismatches surfaced never fixed.
import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Lock, RefreshCw, Activity, FileText } from 'lucide-react'
import { api } from '../shared'

const n2 = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v ?? '—')
const dt = (v) => (v ? new Date(v).toLocaleDateString('ar-EG') : '—')
const CurMap = ({ map }) => {
  const es = Object.entries(map || {}).filter(([, v]) => v !== 0)
  if (!es.length) return <span className="text-slate-400">—</span>
  return <span className="inline-flex flex-wrap gap-1" dir="ltr">{es.map(([c, v]) => <Badge key={c} variant="outline" className="font-mono text-[10px]">{n2(v)} {c}</Badge>)}</span>
}

const TABS = [['overview', '📊 نظرة عامة'], ['clients', '👥 العملاء'], ['suppliers', '🏭 الموردون'], ['boxes', '💰 الصناديق والبنوك'], ['journal', '📒 Journal Explorer'], ['coa', '🌳 حالة COA'], ['health', '🩺 Financial Health']]

const AdminAccounting = () => {
  const [tab, setTab] = useState('overview')
  const [tenants, setTenants] = useState([])
  const [tenant, setTenant] = useState('')
  const [q, setQ] = useState('')
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(false)
  const [stmt, setStmt] = useState(null)
  const [jeDetail, setJeDetail] = useState(null)

  useEffect(() => { api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {}) }, [])

  const load = async (t = tab) => {
    setLoading(true)
    try {
      const qp = [tenant && `tenant=${tenant}`, q && `q=${encodeURIComponent(q)}`].filter(Boolean).join('&')
      const map = { overview: 'overview', clients: 'clients', suppliers: 'suppliers', boxes: 'boxes', journal: 'journal', coa: 'coa-status', health: 'health' }
      if (t === 'health' && !tenant) { setData(d => ({ ...d, health: { need_tenant: true } })); setLoading(false); return }
      const r = await api(`/admin/center/accounting/${map[t]}${qp ? '?' + qp : ''}`)
      setData(d => ({ ...d, [t]: r }))
    } catch (e) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [tab, tenant])

  const openStatement = async (row, kind) => {
    try { setStmt({ loading: true, name: row.name }); setStmt({ ...(await api(`/admin/center/accounting/statement?party_id=${row.id}`)), name: row.name, kind }) } catch (e) { toast.error(e.message); setStmt(null) }
  }

  const d = data[tab]
  const ov = data.overview

  const partyTable = (kind) => (
    <Table>
      <TableHeader><TableRow>
        <TableHead>الاسم</TableHead><TableHead>المكتب</TableHead><TableHead className="text-center">كود</TableHead>
        <TableHead>الرصيد المخزن</TableHead><TableHead className="text-center">مدين إجمالي</TableHead><TableHead className="text-center">دائن إجمالي</TableHead>
        <TableHead>آخر حركة</TableHead><TableHead className="text-center">كشف</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {(d?.rows || []).map(r => (
          <TableRow key={r.id}>
            <TableCell className="text-xs font-semibold">{r.name}{r.is_frozen ? ' 🧊' : ''}</TableCell>
            <TableCell className="text-xs">{r.tenant_name}</TableCell>
            <TableCell className="text-center font-mono text-xs" dir="ltr">{r.account_code || '—'}</TableCell>
            <TableCell><CurMap map={r.balances} /></TableCell>
            <TableCell className="text-center font-mono text-xs">{n2(r.total_debit)}</TableCell>
            <TableCell className="text-center font-mono text-xs">{n2(r.total_credit)}</TableCell>
            <TableCell className="text-xs text-slate-500">{dt(r.last_movement)}</TableCell>
            <TableCell className="text-center"><Button size="sm" variant="ghost" className="h-7 gap-1 text-blue-600" onClick={() => openStatement(r, kind)}><FileText className="w-3.5 h-3.5" /> كشف</Button></TableCell>
          </TableRow>
        ))}
        {d?.rows?.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-slate-400">لا نتائج</TableCell></TableRow>}
      </TableBody>
    </Table>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>)}
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> قراءة فقط</Badge>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={tenant || 'all'} onValueChange={v => setTenant(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-52 bg-white h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">كل المكاتب</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        {['clients', 'suppliers', 'journal'].includes(tab) && <>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 بحث…" className="w-44 h-9 bg-white text-xs" />
          <Button size="sm" onClick={() => load()} className="h-9 bg-blue-600 text-white gap-1"><RefreshCw className="w-3.5 h-3.5" /> تطبيق</Button>
        </>}
      </div>
      {loading && <Card><CardContent className="py-10 text-center text-slate-400">جارِ التحميل…</CardContent></Card>}

      {/* OVERVIEW */}
      {tab === 'overview' && ov && !loading && (
        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">💰 المبيعات (مخزنة، لكل عملة)</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                {['tickets', 'visas', 'services'].map(k => (
                  <div key={k} className="flex justify-between items-start gap-2">
                    <b>{k === 'tickets' ? '🎫 تذاكر' : k === 'visas' ? '🛂 تأشيرات' : '🧰 خدمات'}</b>
                    <div className="space-y-1 text-left">{Object.entries(ov.sales?.[k] || {}).map(([c, v]) => <div key={c} dir="ltr" className="font-mono">{c}: بيع {n2(v.sale)} · تكلفة {n2(v.cost)} · ربح مخزن {n2(v.profit)} · ({v.count})</div>)}
                      {!Object.keys(ov.sales?.[k] || {}).length && <span className="text-slate-400">—</span>}</div>
                  </div>
                ))}
                <div className="flex justify-between"><b>↩️ استردادات (تذاكر)</b><div>{Object.entries(ov.refunds || {}).map(([c, v]) => <div key={c} dir="ltr" className="font-mono">{c}: {n2(v.total)} ({v.count})</div>)}{!Object.keys(ov.refunds || {}).length && '—'}</div></div>
              </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">🧾 السندات + الأرصدة (مخزنة)</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                {Object.entries(ov.vouchers_by_type || {}).map(([t, curs]) => (
                  <div key={t} className="flex justify-between"><b>{t === 'receipt' ? '⬇️ مقبوضات' : t === 'payment' ? '⬆️ مدفوعات' : t}</b>
                    <div>{Object.entries(curs).map(([c, v]) => <div key={c} dir="ltr" className="font-mono">{c}: {n2(v.total)} ({v.count})</div>)}</div></div>
                ))}
                <div className="flex justify-between"><b>مستحق على العملاء</b><CurMap map={ov.receivables_clients} /></div>
                <div className="flex justify-between"><b>مستحق للموردين</b><CurMap map={ov.payables_suppliers} /></div>
                <div className="flex justify-between"><b>أرصدة الصناديق</b><CurMap map={ov.cash_boxes} /></div>
                <div className="flex justify-between"><b>أرصدة البنوك</b><CurMap map={ov.bank_boxes} /></div>
                <div className={`flex justify-between font-bold ${ov.unbalanced_journals ? 'text-rose-600' : 'text-emerald-600'}`}><b>قيود غير متوازنة</b><span>{ov.unbalanced_journals}</span></div>
              </CardContent></Card>
          </div>
          <div className="text-[10px] text-slate-400">{ov.note}</div>
        </div>
      )}

      {tab === 'clients' && d && !loading && <Card><CardContent className="pt-4 overflow-x-auto">{partyTable('client')}</CardContent></Card>}
      {tab === 'suppliers' && d && !loading && <Card><CardContent className="pt-4 overflow-x-auto">{partyTable('supplier')}</CardContent></Card>}

      {tab === 'boxes' && d && !loading && (
        <Card><CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>الصندوق/البنك</TableHead><TableHead>المكتب</TableHead><TableHead className="text-center">النوع</TableHead><TableHead className="text-center">كود</TableHead><TableHead>الرصيد المخزن</TableHead><TableHead>داخل (قبض)</TableHead><TableHead>خارج (صرف)</TableHead><TableHead>آخر عملية</TableHead></TableRow></TableHeader>
            <TableBody>
              {(d.rows || []).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-semibold">{r.name}</TableCell>
                  <TableCell className="text-xs">{r.tenant_name}</TableCell>
                  <TableCell className="text-center text-xs">{r.type === 'cash' ? 'صندوق' : 'بنك'}</TableCell>
                  <TableCell className="text-center font-mono text-xs" dir="ltr">{r.account_code || '—'}</TableCell>
                  <TableCell><CurMap map={r.balances} /></TableCell>
                  <TableCell><CurMap map={r.flows?.in} /></TableCell>
                  <TableCell><CurMap map={r.flows?.out} /></TableCell>
                  <TableCell className="text-xs text-slate-500">{dt(r.last_op)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {tab === 'journal' && d && !loading && (
        <Card><CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>القيد</TableHead><TableHead>التاريخ</TableHead><TableHead>المكتب</TableHead><TableHead>البيان</TableHead><TableHead className="text-center">المرجع</TableHead><TableHead className="text-center">عملة</TableHead><TableHead className="text-center">مدين</TableHead><TableHead className="text-center">دائن</TableHead><TableHead className="text-center">فرق</TableHead><TableHead>منشئ</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(d.rows || []).map(j => (
                <TableRow key={j.id} className={Math.abs(j.diff) > 0.01 ? 'bg-rose-50' : ''}>
                  <TableCell className="text-[10px] font-mono" dir="ltr">{j.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">{dt(j.date)}</TableCell>
                  <TableCell className="text-xs">{j.tenant_name}</TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate">{j.description}</TableCell>
                  <TableCell className="text-center text-[10px]">{j.ref_type || '—'}</TableCell>
                  <TableCell className="text-center text-xs">{j.currency}</TableCell>
                  <TableCell className="text-center font-mono text-xs">{n2(j.total_debit)}</TableCell>
                  <TableCell className="text-center font-mono text-xs">{n2(j.total_credit)}</TableCell>
                  <TableCell className={`text-center font-mono text-xs ${Math.abs(j.diff) > 0.01 ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>{j.diff}</TableCell>
                  <TableCell className="text-[10px]" dir="ltr">{j.created_by || '—'}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" className="h-7 text-blue-600" onClick={() => setJeDetail(j)}>الأسطر</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {tab === 'coa' && d && !loading && (
        <Card><CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>المكتب</TableHead><TableHead className="text-center">COA Version</TableHead><TableHead className="text-center">إجمالي الحسابات</TableHead><TableHead className="text-center">مجموعات</TableHead><TableHead className="text-center">قابلة للترحيل</TableHead><TableHead>أطراف بلا كود</TableHead></TableRow></TableHeader>
            <TableBody>
              {(d.tenants || []).map(t => (
                <TableRow key={t.tenant_id}>
                  <TableCell className="text-xs font-semibold">{t.tenant_name}</TableCell>
                  <TableCell className="text-center"><Badge className={t.is_v2 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}>{t.coa_version ?? 'غير محدد'}</Badge></TableCell>
                  <TableCell className="text-center">{t.accounts_total}</TableCell>
                  <TableCell className="text-center">{t.groups}</TableCell>
                  <TableCell className="text-center">{t.postable}</TableCell>
                  <TableCell className="text-xs">{Object.keys(t.parties_without_account || {}).length ? Object.entries(t.parties_without_account).map(([k, n]) => `${k}: ${n}`).join(' · ') : <span className="text-emerald-600">✓ سليم</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {d.duplicate_codes?.length > 0 && <div className="mt-3 p-2 bg-rose-50 rounded text-xs text-rose-700"><b>أكواد مكررة:</b> {d.duplicate_codes.map(x => `${x.tenant}:${x.code}(${x.count})`).join(' · ')}</div>}
        </CardContent></Card>
      )}

      {tab === 'health' && !loading && (
        <div className="space-y-3">
          {d?.need_tenant && <Card><CardContent className="py-8 text-center text-slate-500 flex flex-col items-center gap-2"><Activity className="w-8 h-8 text-slate-300" />اختر مكتباً من الفلتر أعلاه لتشغيل الفحوصات (فحص لكل مكتب على حدة لضبط الحمل)</CardContent></Card>}
          {d?.findings && (
            <>
              <div className="text-[11px] text-slate-500">{d.note} · وقت الفحص: {new Date(d.generated_at).toLocaleString('ar-EG')}</div>
              {d.findings.map(f => (
                <Card key={f.check} className={f.count > 0 ? (f.severity === 'high' ? 'border-rose-300' : 'border-orange-300') : ''}>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-2">
                      <Badge className={f.count > 0 ? (f.severity === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700') : 'bg-emerald-100 text-emerald-700'}>{f.count}</Badge>
                      <b className="text-sm">{f.check}</b>
                      {f.note && <span className="text-[10px] text-slate-400">{f.note}</span>}
                    </div>
                    {f.count > 0 && <pre className="mt-2 text-[10px] bg-slate-50 p-2 rounded max-h-40 overflow-auto" dir="ltr">{JSON.stringify(f.items, null, 1)}</pre>}
                  </CardContent>
                </Card>
              ))}
              <div className="text-[10px] text-slate-400">فحوصات مؤجلة: {d.deferred_checks?.join(' · ')}</div>
            </>
          )}
        </div>
      )}

      {/* Statement dialog */}
      <Dialog open={!!stmt} onOpenChange={v => !v && setStmt(null)}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📄 كشف حساب — {stmt?.name} (قراءة فقط)</DialogTitle></DialogHeader>
          {stmt?.loading ? <div className="text-center py-8 text-slate-400">جارِ التحميل…</div> : stmt && (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap gap-2">{Object.entries(stmt.totals || {}).map(([c, t]) => <Badge key={c} variant="outline" dir="ltr" className="font-mono">{c}: مدين {n2(t.debit)} · دائن {n2(t.credit)} · صافي {n2(+(t.debit - t.credit).toFixed(2))}</Badge>)}</div>
              <Table>
                <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>البيان</TableHead><TableHead className="text-center">مدين</TableHead><TableHead className="text-center">دائن</TableHead><TableHead className="text-center">عملة</TableHead><TableHead className="text-center">المرجع</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(stmt.rows || []).map((r, i) => (
                    <TableRow key={i}><TableCell>{dt(r.date)}</TableCell><TableCell className="max-w-[220px] truncate">{r.description}</TableCell><TableCell className="text-center font-mono">{n2(r.debit)}</TableCell><TableCell className="text-center font-mono">{n2(r.credit)}</TableCell><TableCell className="text-center">{r.currency}</TableCell><TableCell className="text-center text-[10px]">{r.ref_type || '—'}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* JE lines dialog */}
      <Dialog open={!!jeDetail} onOpenChange={v => !v && setJeDetail(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>📒 أسطر القيد (قراءة فقط)</DialogTitle></DialogHeader>
          {jeDetail && (
            <div className="text-xs space-y-2">
              <div className="text-slate-500">{jeDetail.description} · {dt(jeDetail.date)} · {jeDetail.currency} · مرجع: {jeDetail.ref_type || '—'} <span dir="ltr">{(jeDetail.ref_id || '').slice(0, 12)}</span></div>
              <Table>
                <TableHeader><TableRow><TableHead>الحساب</TableHead><TableHead>الطرف</TableHead><TableHead className="text-center">مدين</TableHead><TableHead className="text-center">دائن</TableHead></TableRow></TableHeader>
                <TableBody>{(jeDetail.lines || []).map((l, i) => <TableRow key={i}><TableCell className="font-mono" dir="ltr">{l.account_code} — {l.account_name}</TableCell><TableCell>{l.party_name || '—'}</TableCell><TableCell className="text-center font-mono">{n2(l.debit)}</TableCell><TableCell className="text-center font-mono">{n2(l.credit)}</TableCell></TableRow>)}</TableBody>
              </Table>
              <div className={`font-bold ${Math.abs(jeDetail.diff) > 0.01 ? 'text-rose-600' : 'text-emerald-600'}`}>الفرق: {jeDetail.diff}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AdminAccounting
