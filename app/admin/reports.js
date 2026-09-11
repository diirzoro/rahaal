'use client'
// ============================================================================
// v3.96 — ADMIN REPORTS CENTER UI (Batch 4) — READ-ONLY.
// Catalog + generic runner over /api/admin/reports/* — every report shows its
// generation time, the filters used and the SOURCE of every number.
// Export: CSV (UTF-8 BOM → opens in Excel) of the loaded rows (respects the
// applied filters + super_admin permission) + clean browser print.
// Scheduled PDF reports remain deferred (not built).
// ============================================================================
import React, { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { RefreshCw, Lock, FileSpreadsheet, Printer, BarChart3, Ban } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const isDateStr = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}/.test(v)
const cell = (v) => v === null || v === undefined || v === '' ? '—'
  : isDateStr(v) ? dtt(v)
    : typeof v === 'number' ? v.toLocaleString('en-US')
      : typeof v === 'boolean' ? (v ? '✓' : '—')
        : typeof v === 'object' ? JSON.stringify(v) : String(v)

const PARAM_DEFS = {
  tenant: { label: 'المكتب', type: 'tenant' }, from: { label: 'من', type: 'date' }, to: { label: 'إلى', type: 'date' },
  currency: { label: 'العملة', type: 'select', options: ['USD', 'SAR', 'YER'] }, q: { label: 'بحث', type: 'text' },
  dim: { label: 'التجميع حسب', type: 'select', options: ['tenant|المكتب', 'user|المستخدم', 'client|العميل', 'supplier|المورد', 'currency|العملة', 'payment|طريقة الدفع', 'kind|النوع', 'box|الصندوق/البنك', 'type|نوع السند'] },
  src: { label: 'المصدر', type: 'select', options: ['partner|الشركاء', 'meraaj|معراج', 'affiliate|الأفلييت'] },
  kind: { label: 'نوع الخدمة', type: 'select', options: ['tickets|تذاكر', 'visas|تأشيرات', 'services|خدمات', 'bookings|باكجات'] },
  vtype: { label: 'نوع السند', type: 'select', options: ['receipt|قبض', 'payment|صرف'] },
  status: { label: 'الحالة', type: 'text' }, type: { label: 'النوع', type: 'text' },
  payment: { label: 'طريقة الدفع', type: 'text' }, account_code: { label: 'رقم الحساب', type: 'text' },
  ptype: { label: 'نوع الطرف', type: 'select', options: ['clients|عملاء', 'suppliers|موردون'] },
  category: { label: 'الفئة', type: 'text' }, actor: { label: 'المنفذ', type: 'text' },
  priority: { label: 'الأولوية', type: 'text' }, needs_action: { label: 'يحتاج إجراء (1)', type: 'text' }, late: { label: 'متأخر (1)', type: 'text' },
}

const AdminReportsCenter = () => {
  const [catalog, setCatalog] = useState(null)
  const [permNote, setPermNote] = useState('')
  const [tenants, setTenants] = useState([])
  const [sel, setSel] = useState(null) // report entry
  const [filters, setFilters] = useState({})
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const printRef = useRef(null)

  useEffect(() => {
    api('/admin/reports/catalog').then(d => { setCatalog(d.catalog || []); setPermNote(d.permissions_note || '') }).catch(e => toast.error(e.message))
    api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {})
  }, [])

  const pick = (r) => { setSel(r); setFilters({}); setData(null) }
  const run = async () => {
    if (!sel) return
    // required params (marked with !)
    for (const prm of sel.params || []) {
      if (prm.endsWith('!') && !filters[prm.replace('!', '')]) return toast.error(`الحقل «${PARAM_DEFS[prm.replace('!', '')]?.label || prm}» مطلوب لهذا التقرير`)
    }
    setLoading(true)
    try {
      const qs = Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      setData(await api(`/admin/reports/run?key=${sel.key}${qs ? `&${qs}` : ''}`))
    } catch (e) { toast.error(e.message); setData(null) }
    setLoading(false)
  }

  // main table extraction: prefer data.rows + data.columns
  const rows = data?.rows || []
  const columns = data?.columns
    ? data.columns.map(([k, l]) => ({ k, l }))
    : rows[0] ? Object.keys(rows[0]).filter(k => !['src', 'id'].includes(k) || rows[0].id).map(k => ({ k, l: k })) : []

  const exportCSV = () => {
    if (!rows.length) return toast.error('لا صفوف للتصدير')
    const head = columns.map(c => `"${c.l}"`).join(',')
    const body = rows.map(r => columns.map(c => `"${String(cell(r[c.k])).replace(/"/g, '""')}"`).join(',')).join('\n')
    const meta = `"تقرير: ${sel.label}","أُنشئ: ${dtt(data.generated_at)}","الفلاتر: ${JSON.stringify(data.filters_used || {})}"`
    const blob = new Blob(['\uFEFF' + meta + '\n' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `rahaal-report-${sel.key}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
    toast.success('صُدّر CSV (يفتح في Excel) — يحترم الفلاتر المطبقة')
  }
  const doPrint = () => { window.print() }

  const F = ({ prm }) => {
    const key = prm.replace('!', '')
    const def = PARAM_DEFS[key] || { label: key, type: 'text' }
    const req = prm.endsWith('!')
    if (def.type === 'tenant') return (
      <Select value={filters[key] || 'all'} onValueChange={x => setFilters({ ...filters, [key]: x === 'all' ? '' : x })}>
        <SelectTrigger className="w-44 bg-white h-9 text-xs"><SelectValue placeholder={def.label} /></SelectTrigger>
        <SelectContent><SelectItem value="all">{def.label}{req ? ' *' : ' — الكل'}</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
      </Select>
    )
    if (def.type === 'date') return <div className="flex items-center gap-1"><span className="text-[10px] text-slate-500">{def.label}</span><Input type="date" value={filters[key] || ''} onChange={e => setFilters({ ...filters, [key]: e.target.value })} className="w-36 h-9 bg-white text-xs" /></div>
    if (def.type === 'select') return (
      <Select value={filters[key] || 'all'} onValueChange={x => setFilters({ ...filters, [key]: x === 'all' ? '' : x })}>
        <SelectTrigger className="w-36 bg-white h-9 text-xs"><SelectValue placeholder={def.label} /></SelectTrigger>
        <SelectContent><SelectItem value="all">{def.label} — الكل</SelectItem>{def.options.map(o => { const [v, l] = o.includes('|') ? o.split('|') : [o, o]; return <SelectItem key={v} value={v}>{l}</SelectItem> })}</SelectContent>
      </Select>
    )
    return <Input value={filters[key] || ''} onChange={e => setFilters({ ...filters, [key]: e.target.value })} placeholder={`${def.label}${req ? ' *' : ''}`} className="w-36 h-9 bg-white text-xs" />
  }

  // extra (non-table) payload blocks
  const EXTRA_KEYS = ['totals', 'totals_profit', 'totals_sales', 'running_balances', 'summary', 'revenue', 'total_revenue', 'expenses', 'net_profit', 'fx_gain_base_yer', 'expense_accounts', 'refund_records', 'queues', 'by_type', 'partner_shares', 'meraaj_commissions', 'affiliate_usd', 'checks', 'alerts', 'overall', 'restore_requests', 'notifications_summary', 'custom_templates', 'defaults', 'history', 'gaps']

  return (
    <div className="space-y-3">
      <style>{`@media print { aside, nav, header, .no-print { display:none !important } .print-area { width:100% } }`}</style>
      <div className="flex items-center gap-2 flex-wrap no-print">
        <div className="text-sm font-extrabold text-slate-700 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> مركز التقارير الشاملة</div>
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> قراءة فقط — أرقام من المصادر الحقيقية، لكل عملة على حدة، بلا تقديرات</Badge>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* catalog sidebar */}
        <div className="space-y-2 no-print">
          {!catalog ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : catalog.map(cat => (
            <Card key={cat.category}><CardContent className="pt-3 pb-2">
              <div className="text-xs font-extrabold text-slate-600 mb-1.5">{cat.label}</div>
              <div className="space-y-1">
                {cat.reports.map(r => (
                  <button key={r.key} disabled={r.available === false} onClick={() => pick(r)}
                    title={r.available === false ? r.reason : r.source}
                    className={`w-full text-right text-[11px] px-2 py-1.5 rounded-md border flex items-center gap-1.5 ${sel?.key === r.key ? 'bg-blue-600 text-white border-blue-600' : r.available === false ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-dashed' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {r.available === false && <Ban className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{r.label}</span>
                  </button>
                ))}
              </div>
            </CardContent></Card>
          ))}
          {permNote && <div className="text-[10px] text-slate-400 px-1">{permNote}</div>}
        </div>

        {/* runner */}
        <div className="lg:col-span-3 space-y-3 print-area" ref={printRef}>
          {!sel ? (
            <Card><CardContent className="py-16 text-center text-slate-400 text-sm">اختر تقريراً من القائمة — التقارير المعطلة تعرض سبب عدم توفرها عند التمرير عليها</CardContent></Card>
          ) : (
            <>
              <Card className="no-print"><CardContent className="pt-4 space-y-2">
                <div className="font-extrabold text-sm text-slate-800">{sel.label}</div>
                <div className="text-[10px] text-slate-500">🧮 مصدر الأرقام: {sel.source}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {(sel.params || []).map(prm => <F key={prm} prm={prm} />)}
                  <Button size="sm" onClick={run} disabled={loading} className="bg-blue-600 hover:bg-blue-700 gap-1"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> تشغيل التقرير</Button>
                  {data && rows.length > 0 && <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1"><FileSpreadsheet className="w-3.5 h-3.5" /> Excel/CSV</Button>}
                  {data && <Button size="sm" variant="outline" onClick={doPrint} className="gap-1"><Printer className="w-3.5 h-3.5" /> طباعة</Button>}
                </div>
              </CardContent></Card>

              {data && (
                <>
                  <div className="text-[10px] text-slate-500 flex flex-wrap gap-3 border rounded-md bg-slate-50 p-2">
                    <span>🕒 أُنشئ: <b>{dtt(data.generated_at)}</b></span>
                    <span>🔎 الفلاتر: <b>{Object.keys(data.filters_used || {}).length ? Object.entries(data.filters_used).map(([k, v]) => `${k}=${v}`).join(' · ') : 'بلا فلاتر'}</b></span>
                    <span>💱 {data.currency_note}</span>
                  </div>
                  {data.note && <div className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded-md p-2">ℹ️ {data.note}</div>}

                  {/* extra summary blocks */}
                  {EXTRA_KEYS.filter(k => data[k] !== undefined && data[k] !== null).map(k => (
                    <Card key={k}><CardContent className="pt-3">
                      <div className="text-[11px] font-extrabold text-slate-600 mb-1 font-mono">{k}</div>
                      <pre className="text-[10px] bg-slate-50 border rounded-md p-2 overflow-x-auto max-h-64 whitespace-pre-wrap" dir="ltr">{JSON.stringify(data[k], null, 2)}</pre>
                    </CardContent></Card>
                  ))}

                  {/* main table */}
                  {rows.length > 0 ? (
                    <Card><CardContent className="pt-3">
                      <div className="border rounded-lg overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow className="bg-slate-50">{columns.map(c => <TableHead key={c.k} className="text-right whitespace-nowrap text-[11px]">{c.l}</TableHead>)}</TableRow></TableHeader>
                          <TableBody>
                            {rows.slice(0, 500).map((r, i) => (
                              <TableRow key={i}>{columns.map(c => <TableCell key={c.k} className="text-[11px] max-w-[220px] truncate" title={String(cell(r[c.k]))}>{cell(r[c.k])}</TableCell>)}</TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">{rows.length} صف{rows.length > 500 ? ' — تُعرض أول 500 (التصدير يشمل الكل المحمّل)' : ''}</div>
                    </CardContent></Card>
                  ) : (
                    <Card><CardContent className="py-10 text-center text-slate-400 text-sm">لا صفوف — إن كانت البيانات غير متوفرة فهذا يُعرض كما هو، لا كصفر مضلل</CardContent></Card>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminReportsCenter
