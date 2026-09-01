'use client'
// v3.87.5 — Heavy standalone screens extracted VERBATIM from app/page.js.
// Pure structural move (zero logic changes): MeraajStoreScreen + BulkImportDialog
// (+ their exclusive helpers TICKET_FIELDS / VISA_FIELDS / autoMap / StatMini).
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import {
  Loader2, Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Printer, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { api, fmt, todayISO, askConfirm, useAuth, TopBar, Field, CURRENCIES, CUR_NAME, readFileB64, validateDocBatch, DOC_MAX_FILE_BYTES, DOC_MAX_MB, DOC_BATCH_MAX_BYTES, DOC_BATCH_MAX_MB, DOC_OK_TYPES } from './shared'

const TICKET_FIELDS = [
  { key: 'date', label: 'التاريخ', aliases: ['date', 'التاريخ', 'تاريخ الحركة'] },
  { key: 'currency', label: 'العملة', aliases: ['currency', 'العملة'] },
  { key: 'pnr', label: 'رقم التذكرة / PNR', aliases: ['pnr', 'ticket', 'ticket no', 'رقم التذكرة', 'رقم الحجز'] },
  { key: 'route', label: 'خط السير', aliases: ['route', 'itinerary', 'خط السير', 'المسار'] },
  { key: 'travel_mode', label: 'وسيلة السفر', aliases: ['mode', 'travel mode', 'وسيلة السفر', 'الطائرة'] },
  { key: 'passenger_name', label: 'اسم المسافر', aliases: ['passenger', 'name', 'اسم المسافر', 'الاسم'] },
  { key: 'passport_no', label: 'رقم الجواز', aliases: ['passport', 'passport no', 'رقم الجواز'] },
  { key: 'phone', label: 'رقم الجوال', aliases: ['phone', 'mobile', 'الجوال', 'رقم الجوال', 'رقم الاتصال'] },
  { key: 'travel_date', label: 'تاريخ السفر', aliases: ['travel date', 'departure date', 'تاريخ السفر', 'تاريخ الرحلة', 'تاريخ المغادرة', 'flight date', 'departure', 'موعد السفر'] },
  { key: 'departure_time', label: 'وقت الإقلاع', aliases: ['departure time', 'وقت الإقلاع', 'وقت المغادرة'] },
  { key: 'return_date', label: 'تاريخ العودة', aliases: ['return date', 'تاريخ العودة'] },
  { key: 'ticket_type', label: 'نوع التذكرة', aliases: ['ticket type', 'نوع التذكرة'] },
  { key: 'client_name', label: 'حساب القبض', aliases: ['client', 'customer', 'العميل', 'اسم العميل', 'حساب القبض'] },
  { key: 'supplier_name', label: 'اسم المورد', aliases: ['supplier', 'vendor', 'agent', 'المورد', 'الوكيل', 'اسم المورد'] },
  { key: 'cost', label: 'التكلفة', aliases: ['cost', 'buy', 'purchase', 'التكلفة', 'الشراء'] },
  { key: 'sale_price', label: 'سعر البيع', aliases: ['sale', 'sell', 'price', 'sale price', 'البيع', 'سعر البيع'] },
  { key: 'discount', label: 'الخصم', aliases: ['discount', 'الخصم'] },
  { key: 'commission', label: 'العمولة', aliases: ['commission', 'العمولة'] },
  { key: 'partner_commission_share', label: 'عمولة الشريك', aliases: ['partner commission', 'partner', 'عمولة الشريك'] },
  { key: 'payment_method', label: 'طريقة الدفع', aliases: ['payment', 'payment method', 'طريقة الدفع', 'نقد أو آجل'] },
  { key: 'notes', label: 'ملاحظات', aliases: ['notes', 'note', 'ملاحظات'] },
]
const VISA_FIELDS = [
  { key: 'date', label: 'التاريخ', aliases: ['date', 'التاريخ'] },
  { key: 'service_type', label: 'نوع التأشيرة', aliases: ['service', 'type', 'visa_type', 'نوع الخدمة', 'النوع', 'نوع التأشيرة'] },
  { key: 'currency', label: 'العملة', aliases: ['currency', 'العملة'] },
  { key: 'beneficiary_name', label: 'اسم صاحب التأشيرة', aliases: ['beneficiary', 'اسم صاحب التأشيرة', 'اسم المعتمر', 'اسم المستفيد'] },
  { key: 'passenger_name', label: 'اسم المسافر/المعتمر', aliases: ['name', 'pilgrim', 'passenger', 'الاسم', 'اسم المعتمر'] },
  { key: 'passport_no', label: 'رقم الجواز', aliases: ['passport', 'رقم الجواز'] },
  { key: 'phone', label: 'رقم الجوال', aliases: ['phone', 'mobile', 'الجوال', 'رقم الجوال'] },
  { key: 'nationality', label: 'الجنسية', aliases: ['nationality', 'الجنسية'] },
  { key: 'destination_country', label: 'الدولة الوجهة', aliases: ['country', 'destination', 'وجهة السفر', 'الدولة'] },
  { key: 'entry_date', label: 'تاريخ الدخول', aliases: ['entry', 'entry_date', 'تاريخ الدخول'] },
  { key: 'max_exit_date', label: 'أقصى تاريخ للخروج', aliases: ['exit', 'max_exit', 'أقصى تاريخ للخروج', 'خروج أقصى'] },
  { key: 'client_name', label: 'حساب القبض', aliases: ['client', 'customer', 'العميل', 'اسم العميل', 'حساب القبض'] },
  { key: 'supplier_name', label: 'اسم المورد', aliases: ['supplier', 'agent', 'المورد', 'الوكيل'] },
  { key: 'cost', label: 'التكلفة', aliases: ['cost', 'التكلفة'] },
  { key: 'sale_price', label: 'سعر البيع', aliases: ['sale', 'price', 'البيع', 'سعر البيع'] },
  { key: 'discount', label: 'الخصم', aliases: ['discount', 'الخصم'] },
  { key: 'commission', label: 'العمولة', aliases: ['commission', 'العمولة'] },
  { key: 'payment_method', label: 'طريقة الدفع', aliases: ['payment', 'payment method', 'طريقة الدفع'] },
  { key: 'notes', label: 'ملاحظات', aliases: ['notes', 'note', 'ملاحظات'] },
]

function autoMap(headers, fields) {
  const m = {}
  for (const f of fields) {
    const hit = headers.find(h => f.aliases.some(a => h.toString().toLowerCase().trim() === a.toLowerCase().trim()))
    if (hit) m[f.key] = hit
  }
  return m
}

function BulkImportDialog({ open, onOpenChange, kind, onDone }) {
  const fields = kind === 'tickets' ? TICKET_FIELDS : VISA_FIELDS
  const [step, setStep] = useState(1)  // 1=upload, 2=mapping, 3=preview, 4=result
  const [file, setFile] = useState(null)
  const [rawRows, setRawRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [defaultCurrency, setDefaultCurrency] = useState('SAR')
  const [preview, setPreview] = useState(null)
  const [skipDup, setSkipDup] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const reset = () => { setStep(1); setFile(null); setRawRows([]); setHeaders([]); setMapping({}); setPreview(null); setResult(null) }
  useEffect(() => { if (!open) reset() }, [open])

  // v3.9.10 — Excel template download with actual client/supplier/box names as reference
  const downloadTemplate = async () => {
    try {
      const [clientsList, suppliersList, boxesList] = await Promise.all([
        api('/clients').catch(() => []),
        api('/suppliers').catch(() => []),
        api('/boxes').catch(() => []),
      ])
      const wb = XLSX.utils.book_new()
      // Sheet 1: Template with headers + 1 example row
      const headers = fields.map(f => f.label)
      const example = fields.map(f => {
        if (f.key === 'date' || f.key === 'travel_date' || f.key === 'entry_date') return todayISO()
        if (f.key === 'currency') return 'USD'
        if (f.key === 'client_name') return clientsList[0]?.name || boxesList[0]?.name_ar || 'اسم العميل أو الصندوق'
        if (f.key === 'supplier_name') return suppliersList[0]?.name || 'اسم المورد'
        if (f.key === 'cost') return 100
        if (f.key === 'sale_price') return 150
        if (f.key === 'passenger_name') return 'مثال: أحمد علي'
        if (f.key === 'passport_no') return 'MK000001'
        if (f.key === 'nationality') return 'يمني'
        if (f.key === 'route') return 'SAH-CAI'
        if (f.key === 'pnr') return 'ABC123'
        if (f.key === 'service_type') return 'تأشيرة عمرة'
        return ''
      })
      const ws1 = XLSX.utils.aoa_to_sheet([headers, example])
      ws1['!cols'] = headers.map(() => ({ wch: 18 }))
      XLSX.utils.book_append_sheet(wb, ws1, 'البيانات')

      // Sheet 2: Reference — Clients
      const clientsRows = [['اسم العميل (انسخ منها إلى حساب القبض)']].concat(clientsList.map(c => [c.name]))
      const ws2 = XLSX.utils.aoa_to_sheet(clientsRows)
      ws2['!cols'] = [{ wch: 30 }]
      XLSX.utils.book_append_sheet(wb, ws2, 'العملاء')

      // Sheet 3: Reference — Boxes/Banks (for cash sales)
      const boxesRows = [['اسم الصندوق/البنك (انسخ منها إلى حساب القبض للبيع النقدي)', 'النوع', 'العملة']]
        .concat(boxesList.map(b => [b.name_ar || b.name, b.type === 'cash' ? 'صندوق' : 'بنك', b.currency || '-']))
      const ws3 = XLSX.utils.aoa_to_sheet(boxesRows)
      ws3['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 8 }]
      XLSX.utils.book_append_sheet(wb, ws3, 'الصناديق_والبنوك')

      // Sheet 4: Reference — Suppliers
      const suppliersRows = [['اسم المورد']].concat(suppliersList.map(s => [s.name]))
      const ws4 = XLSX.utils.aoa_to_sheet(suppliersRows)
      ws4['!cols'] = [{ wch: 30 }]
      XLSX.utils.book_append_sheet(wb, ws4, 'الموردون')

      const filename = `قالب_استيراد_${kind === 'tickets' ? 'التذاكر' : 'التأشيرات'}_رحّال.xlsx`
      XLSX.writeFile(wb, filename)
      toast.success('✅ تم تنزيل القالب — اطلع على صفحات "العملاء" و"الصناديق_والبنوك" و"الموردون" لنسخ الأسماء الصحيحة')
    } catch (e) { toast.error('خطأ في إنشاء القالب: ' + e.message) }
  }

  const handleFile = async (f) => {
    if (!f) return
    setFile(f)
    setLoading(true)
    try {
      const buf = await f.arrayBuffer()
      // v3.9.9 — cellDates:true converts Excel serial dates to real JS Date objects
      const wb = XLSX.read(buf, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' })
      if (rows.length === 0) { toast.error('الملف فارغ'); setLoading(false); return }
      const hd = Object.keys(rows[0])
      setHeaders(hd); setRawRows(rows)
      setMapping(autoMap(hd, fields))
      setStep(2)
    } catch (e) { toast.error('خطأ في قراءة الملف: ' + e.message) }
    finally { setLoading(false) }
  }

  // v3.9.9 — Robust date parser: accepts JS Date, ISO, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, and Excel serial numbers
  const parseDateFlexible = (val) => {
    if (val === null || val === undefined || val === '') return ''
    if (val instanceof Date && !isNaN(val)) return val.toISOString().slice(0, 10)
    // Excel serial number (numeric, 1 = 1900-01-01)
    if (typeof val === 'number' && val > 59) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30))
      const d = new Date(excelEpoch.getTime() + val * 86400000)
      if (!isNaN(d)) return d.toISOString().slice(0, 10)
    }
    const s = String(val).trim()
    if (!s) return ''
    // YYYY-MM-DD or YYYY/MM/DD
    let m = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/)
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`
    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    m = s.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})/)
    if (m) {
      const yyyy = m[3].length === 2 ? (Number(m[3]) > 50 ? '19' + m[3] : '20' + m[3]) : m[3]
      return `${yyyy}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`
    }
    // Fallback: try Date constructor (handles ISO with time, etc.)
    const d = new Date(s)
    if (!isNaN(d) && d.getFullYear() > 1971) return d.toISOString().slice(0, 10)
    return ''
  }

  const buildNormalized = (autoFix = false) => {
    return rawRows.map(r => {
      const out = {}
      for (const f of fields) {
        const col = mapping[f.key]
        let val = col ? r[col] : ''
        // v3.9.9 — Robust date parsing for any date field
        if (f.type === 'date' || /_date$|^date$/i.test(f.key)) {
          val = parseDateFlexible(val)
        } else if (val instanceof Date) {
          val = val.toISOString().slice(0, 10)
        }
        // Auto-fix: trim whitespace on strings
        if (autoFix && typeof val === 'string') val = val.trim().replace(/\s+/g, ' ')
        out[f.key] = val === undefined ? '' : val
      }
      if (!out.currency) out.currency = defaultCurrency
      else if (typeof out.currency === 'string') out.currency = out.currency.toUpperCase().trim()
      // Auto-fix: default missing TRANSACTION date to today (travel/entry dates must NEVER be auto-filled —
      // v3.18: filling them with "today" made all same-name rows collide in the duplicate check)
      if (autoFix && (!out.date || out.date === '')) out.date = todayISO()
      out.cost = Number(out.cost) || 0
      out.sale_price = Number(out.sale_price) || 0
      return out
    }).filter(r => {
      // Auto-fix: skip completely blank rows (all string fields empty AND cost=0 AND sale=0)
      if (!autoFix) return true
      const hasAny = r.client_name || r.supplier_name || r.passenger_name || r.pnr || r.passport_no || r.cost || r.sale_price
      return !!hasAny
    })
  }

  const doPreview = async (autoFix = false) => {
    if (!mapping.client_name || !mapping.supplier_name || !mapping.cost || !mapping.sale_price) return toast.error('يجب تعيين حقول: العميل، المورد، التكلفة، البيع')
    try {
      setLoading(true)
      const rows = buildNormalized(autoFix)
      const r = await api(`/import/${kind}/preview`, { method: 'POST', body: { rows } })
      setPreview(r); setStep(3)
      if (autoFix) toast.success('🔧 تم تطبيق الإصلاح التلقائي على الصفوف')
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  const doAutoFix = () => doPreview(true)

  const doImport = async () => {
    try {
      setLoading(true)
      const r = await api(`/import/${kind}`, { method: 'POST', body: { rows: preview.rows, skip_duplicates: skipDup } })
      setResult(r); setStep(4)
      toast.success(`تم إنشاء ${r.created} • تخطي ${r.skipped} • فشل ${r.failed}`)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-9 h-9 rounded-lg grad-green flex items-center justify-center"><FileSpreadsheet className="w-4 h-4 text-white" /></div>
            استيراد جماعي — {kind === 'tickets' ? 'التذاكر' : 'التأشيرات والخدمات'}
          </DialogTitle>
          <DialogDescription>ارفع ملف Excel/CSV، عيّن الأعمدة، ثم راجع البيانات قبل الحفظ</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 my-2">
          {['رفع الملف', 'ربط الأعمدة', 'المعاينة', 'النتيجة'].map((s, i) => (
            <div key={i} className={`flex-1 flex items-center gap-2 ${step > i + 1 ? 'text-emerald-600' : step === i + 1 ? 'text-blue-600' : 'text-slate-400'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step > i + 1 ? 'bg-emerald-100 border-2 border-emerald-500' : step === i + 1 ? 'bg-blue-100 border-2 border-blue-500' : 'bg-slate-100 border-2 border-slate-300'}`}>
                {step > i + 1 ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span className="text-xs font-semibold">{s}</span>
              {i < 3 && <div className="flex-1 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-4">
            {/* v3.9.10 — Download Excel template button */}
            <div className="p-3 rounded-lg bg-gradient-to-l from-emerald-50 to-teal-50 border-2 border-emerald-200">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                  <div className="font-bold text-emerald-800">📥 لا تعرف كيف تُنسّق الملف؟</div>
                  <div className="text-xs text-slate-700 mt-1">نزّل القالب الجاهز — يحتوي على أسماء العملاء والصناديق والموردين المسجّلين بالنظام لتسهيل الملء وتفادي الأخطاء.</div>
                </div>
                <Button onClick={downloadTemplate} variant="outline" className="bg-white border-emerald-500 text-emerald-700 hover:bg-emerald-50 gap-2 font-bold">
                  <FileSpreadsheet className="w-4 h-4" /> 📥 تنزيل قالب Excel جاهز
                </Button>
              </div>
            </div>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
              <FileSpreadsheet className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
              <div className="font-bold text-slate-700 mb-1">اسحب ملف Excel/CSV هنا أو اضغط للاختيار</div>
              <div className="text-xs text-slate-500 mb-4">يدعم .xlsx, .xls, .csv (حد أقصى: 5000 صف)</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => handleFile(e.target.files?.[0])} />
              <Button onClick={() => fileRef.current?.click()} disabled={loading} className="grad-green text-white gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} اختر الملف
              </Button>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-slate-700">
              <div className="font-bold mb-1">💡 نصيحة:</div>
              <div>يجب أن يحتوي الملف على صف رأس (headers). الأعمدة الأساسية المتوقعة:</div>
              <div className="mt-1 font-mono text-[11px]">{fields.map(f => f.label).join(' • ')}</div>
            </div>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Badge variant="outline">{file?.name}</Badge>
              <span>•</span>
              <span>{rawRows.length} صف</span>
            </div>
            <Field label="العملة الافتراضية (إذا لم توجد بالملف)">
              <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {fields.map(f => (
                <div key={f.key} className="flex items-center gap-2 p-2 rounded-md bg-slate-50 border">
                  <div className="w-40 text-sm font-semibold text-slate-700 shrink-0">{f.label}</div>
                  <Select value={mapping[f.key] || '__none'} onValueChange={v => setMapping(m => ({ ...m, [f.key]: v === '__none' ? '' : v }))}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— بدون —</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>عودة</Button>
              <Button onClick={doPreview} disabled={loading} className="grad-brand text-white">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'التالي — معاينة'}</Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <StatMini label="إجمالي الصفوف" value={preview.rows.length} color="bg-slate-100 text-slate-700" />
              <StatMini label="صفوف صالحة" value={preview.valid_count} color="bg-emerald-100 text-emerald-700" />
              <StatMini label="مكررة" value={preview.rows.filter(r => r.__dup).length} color="bg-amber-100 text-amber-700" />
              <StatMini label="بها أخطاء" value={preview.rows.filter(r => r.__errors.length).length} color="bg-rose-100 text-rose-700" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(preview.totals).map(([c, t]) => (
                <Card key={c}><CardContent className="p-3">
                  <div className="text-xs text-slate-500">{c} — {t.count} صف</div>
                  <div className="text-xs">تكلفة: <span className="font-bold">{fmt(t.cost, c)}</span></div>
                  <div className="text-xs">بيع: <span className="font-bold">{fmt(t.sale, c)}</span></div>
                  <div className="text-xs">ربح: <span className="font-bold text-emerald-600">{fmt(t.profit, c)}</span></div>
                </CardContent></Card>
              ))}
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Switch checked={skipDup} onCheckedChange={setSkipDup} />
              <div className="text-sm">تخطي الصفوف المكررة (بناءً على {kind === 'tickets' ? 'رقم PNR' : 'رقم الجواز'})</div>
              {(preview.rows.filter(r => r.__errors.length).length > 0 || preview.rows.filter(r => !r.date).length > 0) && (
                <Button size="sm" variant="outline" onClick={doAutoFix} disabled={loading} className="mr-auto gap-1 border-amber-400 text-amber-700 hover:bg-amber-100">
                  🔧 إصلاح تلقائي
                </Button>
              )}
            </div>

            {/* Error breakdown */}
            {preview.rows.filter(r => r.__errors.length).length > 0 && (
              <details className="rounded-lg bg-rose-50 border border-rose-200" open>
                <summary className="cursor-pointer p-3 font-bold text-rose-700 flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> تفاصيل الأخطاء ({preview.rows.filter(r => r.__errors.length).length} صف)
                  <span className="text-xs font-normal text-rose-600 mr-2">— انقر للطي / التوسيع</span>
                </summary>
                <div className="p-3 pt-0 max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-16">#الصف</TableHead>
                      <TableHead>سبب الرفض</TableHead>
                      <TableHead>بيانات الصف</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {preview.rows.filter(r => r.__errors.length).map(r => (
                        <TableRow key={r.__row}>
                          <TableCell className="font-mono text-rose-700 font-bold">صف {r.__row}</TableCell>
                          <TableCell className="text-xs">
                            {r.__errors.map((e, i) => <div key={i} className="flex items-center gap-1"><XCircle className="w-3 h-3 text-rose-500" />{e}</div>)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {kind === 'tickets' ? `PNR: ${r.pnr || '—'} | ` : `جواز: ${r.passport_no || '—'} | `}
                            عميل: {r.client_name || '—'} | مورد: {r.supplier_name || '—'} | تكلفة: {r.cost || '—'} | بيع: {r.sale_price || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            )}

            <div className="border rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>الحالة</TableHead>
                    {kind === 'tickets' ? <TableHead>PNR</TableHead> : <TableHead>الجواز</TableHead>}
                    <TableHead>المسافر</TableHead><TableHead>حساب القبض</TableHead><TableHead>المورد</TableHead>
                    <TableHead>عملة</TableHead><TableHead className="text-left">تكلفة</TableHead>
                    <TableHead className="text-left">بيع</TableHead><TableHead className="text-left">عمولة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map(r => (
                    <TableRow key={r.__row} className={r.__errors.length ? 'bg-rose-50' : r.__dup ? 'bg-amber-50' : ''}>
                      <TableCell className="text-xs">{r.__row}</TableCell>
                      <TableCell>
                        {r.__errors.length ? <Badge className="bg-rose-100 text-rose-700 gap-1"><XCircle className="w-3 h-3" /> خطأ</Badge>
                          : r.__dup ? <Badge className="bg-amber-100 text-amber-700 gap-1"><AlertTriangle className="w-3 h-3" /> مكرر</Badge>
                          : <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="w-3 h-3" /> صالح</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{kind === 'tickets' ? r.pnr : r.passport_no}</TableCell>
                      <TableCell className="text-xs">{r.passenger_name || '—'}</TableCell>
                      <TableCell className="text-xs">{r.client_name || '—'}</TableCell>
                      <TableCell className="text-xs">{r.supplier_name || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{r.currency}</Badge></TableCell>
                      <TableCell className="text-left">{fmt(r.cost, r.currency)}</TableCell>
                      <TableCell className="text-left">{fmt(r.sale_price, r.currency)}</TableCell>
                      <TableCell className={`text-left font-bold ${r.__commission >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(r.__commission, r.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>عودة للربط</Button>
              <Button onClick={doImport} disabled={loading || preview.valid_count === 0} className="grad-green text-white gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} تأكيد الاستيراد ({preview.valid_count} صف)
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Result — v3.9.13 with detailed failed rows log + export */}
        {step === 4 && result && (() => {
          // Enrich errors with original row data by matching __row number
          const rowsMap = new Map((preview?.rows || []).map(r => [r.__row, r]))
          const failedDetails = (result.errors || []).map(e => {
            const orig = rowsMap.get(e.row) || {}
            return {
              row: e.row,
              passenger_name: orig.passenger_name || '—',
              passport_no: orig.passport_no || '—',
              pnr: orig.pnr || '—',
              client_name: orig.client_name || '—',
              supplier_name: orig.supplier_name || '—',
              date: orig.date || orig.travel_date || orig.entry_date || '—',
              currency: orig.currency || '—',
              cost: orig.cost || 0,
              sale_price: orig.sale_price || 0,
              error_reason: Array.isArray(e.errors) ? e.errors.join(' • ') : String(e.errors || e.error || 'خطأ غير محدد'),
              _orig: orig,
            }
          })
          const exportFailedToExcel = () => {
            if (failedDetails.length === 0) return
            const wb = XLSX.utils.book_new()
            const headers = ['رقم الصف في الشيت', 'اسم المسافر', 'رقم الجواز', 'PNR', 'حساب القبض', 'المورد', 'التاريخ', 'العملة', 'التكلفة', 'سعر البيع', '⚠️ سبب الفشل']
            const rows = failedDetails.map(f => [f.row, f.passenger_name, f.passport_no, f.pnr, f.client_name, f.supplier_name, f.date, f.currency, f.cost, f.sale_price, f.error_reason])
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
            ws['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 40 }]
            XLSX.utils.book_append_sheet(wb, ws, 'الصفوف الفاشلة')
            const filename = `الصفوف_الفاشلة_${kind === 'tickets' ? 'التذاكر' : 'التأشيرات'}_${new Date().toISOString().slice(0,10)}.xlsx`
            XLSX.writeFile(wb, filename)
            toast.success('✅ تم تنزيل ملف الصفوف الفاشلة — صحّح "سبب الفشل" وأعد رفع الملف')
          }
          return (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full grad-green mx-auto flex items-center justify-center shadow-xl mb-3">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <div className="text-2xl font-extrabold text-slate-800">اكتمل الاستيراد!</div>
                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mt-3">
                  <StatMini label="تم إنشاؤها" value={result.created} color="bg-emerald-100 text-emerald-700" />
                  <StatMini label="تخطي (مكرر)" value={result.skipped} color="bg-amber-100 text-amber-700" />
                  <StatMini label="فشل" value={result.failed} color="bg-rose-100 text-rose-700" />
                </div>
              </div>

              {/* Failed rows detailed table */}
              {failedDetails.length > 0 && (
                <div className="border-2 border-rose-200 rounded-xl overflow-hidden bg-rose-50/30">
                  <div className="bg-gradient-to-l from-rose-500 to-orange-500 p-4 flex items-center justify-between text-white">
                    <div>
                      <div className="font-bold text-lg">⚠️ تقرير الصفوف الفاشلة ({failedDetails.length})</div>
                      <div className="text-xs opacity-90">اطلع على السبب الدقيق لكل صف، ثم نزّل الملف لتصحيحه وإعادة الرفع</div>
                    </div>
                    <Button onClick={exportFailedToExcel} className="bg-white text-rose-700 hover:bg-rose-50 gap-2 font-bold">
                      <FileSpreadsheet className="w-4 h-4" /> 📥 تنزيل الفاشلة كـ Excel
                    </Button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="p-2 text-right text-xs font-bold text-slate-700">الصف</th>
                          <th className="p-2 text-right text-xs font-bold text-slate-700">المسافر</th>
                          <th className="p-2 text-right text-xs font-bold text-slate-700">الجواز</th>
                          <th className="p-2 text-right text-xs font-bold text-slate-700">التاريخ</th>
                          <th className="p-2 text-right text-xs font-bold text-slate-700">حساب القبض</th>
                          <th className="p-2 text-right text-xs font-bold text-slate-700">المورد</th>
                          <th className="p-2 text-right text-xs font-bold text-rose-800">🔴 سبب الفشل</th>
                        </tr>
                      </thead>
                      <tbody>
                        {failedDetails.map((f, i) => (
                          <tr key={i} className="border-b hover:bg-rose-50/50">
                            <td className="p-2 font-mono text-xs text-slate-600">#{f.row}</td>
                            <td className="p-2 text-xs">{f.passenger_name}</td>
                            <td className="p-2 font-mono text-xs">{f.passport_no}</td>
                            <td className="p-2 text-xs">{f.date}</td>
                            <td className="p-2 text-xs">{f.client_name}</td>
                            <td className="p-2 text-xs">{f.supplier_name}</td>
                            <td className="p-2 text-xs text-rose-700 font-semibold">{f.error_reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-3 bg-amber-50 border-t border-amber-200 text-xs text-amber-800">
                    💡 <b>نصيحة:</b> نزّل الصفوف الفاشلة، صحّح "سبب الفشل" في العمود الأخير، احذف عمود السبب، ثم أعد رفع الملف. سيتم تجاهل الـ {result.created} صفاً الناجحة تلقائياً (اكتشاف تلقائي للمكرر).
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-2 pt-2">
                <Button variant="outline" onClick={() => { reset(); }}>استيراد ملف آخر</Button>
                <Button onClick={onDone} className="grad-brand text-white">إغلاق</Button>
              </div>
            </div>
          )
        })()}
      </DialogContent>
    </Dialog>
  )
}

function StatMini({ label, value, color }) {
  return <div className={`rounded-lg p-3 ${color}`}><div className="text-xs">{label}</div><div className="text-xl font-extrabold">{value}</div></div>
}

function MeraajStoreScreen() {
  // v3.50 — RBAC Phase 2: commissions/net visible only to owner or show_profit holders
  const { user: mrUser } = useAuth()
  const isOwner = mrUser?.role === 'owner'
  const canProfit = isOwner || mrUser?.permissions?.show_profit === true
  const [config, setConfig] = useState(null)
  const [iframeUrl, setIframeUrl] = useState(null)
  const [inbound, setInbound] = useState([])
  const [events, setEvents] = useState([])
  const [sharedPkgs, setSharedPkgs] = useState([])
  const [health, setHealth] = useState(null) // v3.57 — webhook health dashboard (owner)
  const [view, setView] = useState('shared') // shared | bookings | events | health
  // v3.61 — rejected-webhooks alert threshold config + buyer office drill-down filter
  const [thresholdVal, setThresholdVal] = useState('')
  const [officeFilter, setOfficeFilter] = useState(null)
  // v3.62 — monthly Meraaj Excel report
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7))
  const [reportBusy, setReportBusy] = useState(false)
  // v3.64 — quick seat refill from the shared-packages table (reuses v3.63 add-seats endpoint)
  const [storeRefillBusy, setStoreRefillBusy] = useState(null)
  const [dispatchBusy, setDispatchBusy] = useState(null) // v3.72 — تفويج
  const [officeTags, setOfficeTags] = useState({}) // v3.64 — office → tag map for bookings tab
  // v3.65 — one-tap retry for failed outbound events (idempotent: same event id re-sent)
  const [retryBusy, setRetryBusy] = useState(null)
  // v3.66 — retry ALL failed in sequential batches with live progress (stoppable)
  const [retryAll, setRetryAll] = useState(null) // {running, total, processed, succeeded, failed, remaining}
  const retryAllStopRef = useRef(false)
  // v3.69 — unified alerts center + month-over-month office comparison
  const [alertsCenter, setAlertsCenter] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [compMonth, setCompMonth] = useState(new Date().toISOString().slice(0, 7))
  const [compBusy, setCompBusy] = useState(false)
  const [alertRefillBusy, setAlertRefillBusy] = useState(null)
  const loadAlertsCenter = () => {
    api('/meraaj/alerts-center').then(setAlertsCenter).catch(() => {})
    api('/meraaj/alerts-history?days=14').then(setAlertsHistory).catch(() => {}) // v3.71
  }
  const loadComparison = async (m = compMonth) => {
    setCompBusy(true)
    try {
      setComparison(await api(`/meraaj/office-comparison?month=${m}`))
      setTrendPick('__total__') // v3.71 — reset series selection on new month
      api(`/meraaj/comparison-trend?month=${m}&months=6`).then(setCompTrend).catch(() => {}) // v3.71
    } catch (e) { toast.error(e.message) } finally { setCompBusy(false) }
  }
  const alertsRefill = async (w) => {
    setAlertRefillBusy(w.id)
    try {
      const r = await api(`/meraaj/packages/${w.id}/add-seats`, { method: 'POST', body: { add: 5 } })
      toast.success(`✅ أُضيفت ${r.added} مقاعد لـ«${w.name}» — المتاح ${r.remaining} من ${r.seats_allocated} (تم إشعار معراج)`)
      loadAlertsCenter()
      api('/packages').then(list => setSharedPkgs((list || []).filter(p => p?.meraaj?.shared))).catch(() => {})
    } catch (e) { toast.error(e.message) } finally { setAlertRefillBusy(null) }
  }
  const exportComparison = () => {
    try {
      const r = comparison
      if (!r || (r.offices || []).length === 0) { toast.error('لا توجد بيانات للتصدير'); return }
      const g = (v) => v === null ? 'جديد' : `${v}%`
      const ws = XLSX.utils.aoa_to_sheet([
        [`مقارنة أداء المكاتب — ${r.month} مقابل ${r.prev_month}`], [],
        ['المكتب', `حجوزات ${r.month}`, `معتمدة ${r.month}`, `مقاعد ${r.month}`, `إيراد ${r.month}`, `صافي ${r.month}`, `حجوزات ${r.prev_month}`, `صافي ${r.prev_month}`, 'النمو %'],
        ...r.offices.map(o => [o.office, o.current.bookings, o.current.approved, o.current.seats, o.current.revenue, o.current.net_to_seller, o.previous.bookings, o.previous.net_to_seller, g(o.growth_pct)]),
        [],
        ['الإجمالي', r.totals.current.bookings, r.totals.current.approved, r.totals.current.seats, r.totals.current.revenue, r.totals.current.net_to_seller, r.totals.previous.bookings, r.totals.previous.net_to_seller, g(r.totals.growth_pct)],
      ])
      ws['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }]
      // v3.70 — second sheet: month-over-month comparison per PACKAGE
      const wsPkgCmp = XLSX.utils.aoa_to_sheet([
        [`مقارنة أداء الباكجات — ${r.month} مقابل ${r.prev_month}`], [],
        ['الباكج', `حجوزات ${r.month}`, `معتمدة ${r.month}`, `مقاعد ${r.month}`, `إيراد ${r.month}`, `صافي ${r.month}`, `حجوزات ${r.prev_month}`, `صافي ${r.prev_month}`, 'النمو %'],
        ...(r.packages || []).map(p => [p.name, p.current.bookings, p.current.approved, p.current.seats, p.current.revenue, p.current.net_to_seller, p.previous.bookings, p.previous.net_to_seller, g(p.growth_pct)]),
        [],
        ['الإجمالي', r.totals.current.bookings, r.totals.current.approved, r.totals.current.seats, r.totals.current.revenue, r.totals.current.net_to_seller, r.totals.previous.bookings, r.totals.previous.net_to_seller, g(r.totals.growth_pct)],
      ])
      wsPkgCmp['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }]
      const wb = XLSX.utils.book_new()
      wb.Workbook = { Views: [{ RTL: true }] }
      XLSX.utils.book_append_sheet(wb, ws, 'مقارنة المكاتب')
      XLSX.utils.book_append_sheet(wb, wsPkgCmp, 'مقارنة الباكجات')
      XLSX.writeFile(wb, `مقارنة_المكاتب_${r.month}.xlsx`)
      toast.success(`✅ تم تنزيل مقارنة المكاتب لشهر ${r.month}`)
    } catch (e) { toast.error(e.message) }
  }
  // v3.70 — one-tap WhatsApp share of the alerts-center summary (client-side wa.me, no backend)
  const alertsCenterRef = useRef(null)
  useEffect(() => { alertsCenterRef.current = alertsCenter }, [alertsCenter])
  const shareAlertsWhatsApp = () => {
    const a = alertsCenterRef.current || alertsCenter
    if (!a) { toast.error('لم تُحمَّل التنبيهات بعد'); return }
    const c = a.counts || {}
    const lines = [
      `🔔 *ملخص تنبيهات معراج — ${new Date().toLocaleDateString('en-GB')}*`,
      '',
      (c.total || 0) === 0 ? '✅ كل شيء سليم — لا توجد تنبيهات تشغيلية' : `⚠️ إجمالي التنبيهات: ${c.total}`,
    ]
    if ((c.failed_events || 0) > 0) lines.push(`📤 أحداث صادرة فاشلة: ${c.failed_events}`)
    if ((c.pending_bookings || 0) > 0) {
      lines.push(`📥 حجوزات بانتظار الاعتماد: ${c.pending_bookings}`)
      for (const b of (a.pending_bookings || []).slice(0, 3)) lines.push(`   • ${b.package_name} — ${b.buyer_office_name || 'مكتب'} (${b.seats} مقاعد)`)
    }
    if ((c.capacity_warnings || 0) > 0) {
      lines.push(`💺 باكجات شبه ممتلئة: ${c.capacity_warnings}`)
      for (const w of (a.capacity_warnings || []).slice(0, 3)) lines.push(`   • ${w.name}: متبقي ${w.remaining} من ${w.seats_allocated} (${w.pct}%)`)
    }
    if ((c.missing_passports || 0) > 0) lines.push(`🛂 جوازات ناقصة (حجوزات معتمدة): ${c.missing_passports}`)
    if (a.reject_alert) lines.push(`🚨 ويبهوك مرفوض اليوم: ${a.rejected_today} (الحد ${a.reject_alert_threshold}) — تحقق من مفتاح HMAC`)
    lines.push('', '— نظام رحّال ERP')
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
  }
  // v3.70 — silent auto-refresh of the alerts badge every 3 minutes (owner only, no reload)
  useEffect(() => {
    if (!isOwner) return
    const iv = setInterval(() => { api('/meraaj/alerts-center').then(setAlertsCenter).catch(() => {}) }, 180000)
    return () => clearInterval(iv)
  }, [isOwner])
  // v3.71 — alerts history (daily snapshots) + scheduled WhatsApp digest reminder + 6-month trend
  const [alertsHistory, setAlertsHistory] = useState(null)
  const [reminderVal, setReminderVal] = useState('')
  const [compTrend, setCompTrend] = useState(null)
  const [trendPick, setTrendPick] = useState('__total__')
  useEffect(() => { if (config) setReminderVal(config.digest_reminder_time || '') }, [config])
  const saveReminder = async () => {
    try {
      const r = await api('/meraaj/settings', { method: 'POST', body: { digest_reminder_time: reminderVal } })
      setConfig(c => ({ ...c, digest_reminder_time: r.digest_reminder_time }))
      toast.success(r.digest_reminder_time ? `⏰ سيذكّرك النظام يومياً عند ${r.digest_reminder_time} بإرسال الملخص` : '🔕 تم تعطيل تذكير الملخص اليومي')
    } catch (e) { toast.error(e.message) }
  }
  // v3.71 — client-side daily reminder: fires ONCE per day (localStorage guard) while the app is open
  useEffect(() => {
    if (!isOwner) return
    const check = () => {
      const t = config?.digest_reminder_time
      if (!t) return
      const now = new Date()
      const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const dayKey = now.toISOString().slice(0, 10)
      if (hm >= t && localStorage.getItem('rahaal_digest_reminder') !== dayKey) {
        localStorage.setItem('rahaal_digest_reminder', dayKey)
        toast('⏰ تذكير يومي: أرسل ملخص تنبيهات معراج عبر واتساب', {
          duration: 20000,
          action: { label: '💬 إرسال الآن', onClick: () => shareAlertsWhatsApp() },
        })
      }
    }
    check()
    const iv = setInterval(check, 60000)
    return () => clearInterval(iv)
  }, [isOwner, config?.digest_reminder_time])
  const runRetryAll = async () => {
    retryAllStopRef.current = false
    let agg = { running: true, total: null, processed: 0, succeeded: 0, failed: 0, remaining: null }
    setRetryAll({ ...agg })
    try {
      let cursor = null // v3.66b — each event attempted exactly once per run, in order
      for (let i = 0; i < 100; i++) { // safety cap
        if (retryAllStopRef.current) break
        const r = await api('/meraaj/events/retry-all-failed', { method: 'POST', body: { limit: 5, ...(cursor ? { after: cursor } : {}) } })
        agg = {
          running: true,
          total: agg.total === null ? r.total : agg.total,
          processed: agg.processed + r.processed,
          succeeded: agg.succeeded + r.succeeded,
          failed: agg.failed + r.failed,
          remaining: r.remaining,
        }
        setRetryAll({ ...agg })
        cursor = r.cursor || cursor
        if (r.remaining === 0 || r.processed === 0) break
      }
      toast[agg.failed > 0 ? 'error' : 'success'](`انتهت إعادة المحاولة: ${agg.succeeded} نجحت • ${agg.failed} فشلت • ${agg.remaining ?? 0} متبقية`)
      api('/meraaj/webhook-health').then(setHealth).catch(() => {})
    } catch (e) { toast.error(e.message) } finally {
      setRetryAll(s => s ? { ...s, running: false } : null)
    }
  }
  const retryEvent = async (ev) => {
    setRetryBusy(ev.id)
    try {
      const r = await api(`/meraaj/events/${ev.id}/retry`, { method: 'POST' })
      if (r.status === 'sent') toast.success('✅ أُعيد إرسال الحدث لمعراج بنجاح')
      else toast.error(`⚠️ فشلت إعادة المحاولة (${r.last_error || 'خطأ اتصال'}) — المحاولة #${r.attempts}`)
      setHealth(h => ({ ...h, outbound: (h.outbound || []).map(x => x.id === ev.id ? { ...x, status: r.status, attempts: r.attempts, last_error: r.last_error || null } : x) }))
    } catch (e) { toast.error(e.message) } finally { setRetryBusy(null) }
  }
  const storeRefill = async (p) => {
    setStoreRefillBusy(p.id)
    try {
      const r = await api(`/meraaj/packages/${p.id}/add-seats`, { method: 'POST', body: { add: 5 } })
      toast.success(`✅ أُضيفت ${r.added} مقاعد لـ«${p.name}» — المتاح ${r.remaining} من ${r.seats_allocated} (تم إشعار معراج)`)
      setSharedPkgs(list => list.map(x => x.id === p.id ? { ...x, meraaj: { ...x.meraaj, seats_allocated: r.seats_allocated } } : x))
    } catch (e) { toast.error(e.message) } finally { setStoreRefillBusy(null) }
  }
  // v3.72 — تفويج: one-tap dispatch hides the departed package from the Meraaj market (undoable)
  const storeDispatch = async (p) => {
    const want = !p?.meraaj?.dispatched
    if (want && !(await askConfirm({ title: 'تفويج الباقة', desc: `سيتم إخفاء «${p.name}» تماماً من سوق معراج (تفويج الرحلة) — لن تظهر للمكاتب حتى تتراجع عن التفويج.`, icon: '🚌', confirmLabel: 'تفويج وإخفاء من السوق' }))) return
    setDispatchBusy(p.id)
    try {
      const r = await api(`/meraaj/packages/${p.id}/dispatch`, { method: 'POST', body: { dispatched: want } })
      if (want) toast.success(`🚌 فُوِّجت «${p.name}» واختفت من سوق معراج`)
      else toast.success(r.relisted ? `↩️ أُلغي التفويج و«${p.name}» عادت للظهور في السوق` : `↩️ أُلغي التفويج — لن تظهر في السوق (${r.remaining > 0 ? 'الباقة مغلقة/مؤرشفة' : 'لا مقاعد متاحة'})`)
      api('/packages').then(list => setSharedPkgs((list || []).filter(x => x?.meraaj?.shared))).catch(() => {})
    } catch (e) { toast.error(e.message) } finally { setDispatchBusy(null) }
  }
  // v3.63 — buyer office rating tags: click cycles — → ممتاز → جيد → متأخر بالدفع → —
  const OFFICE_TAGS = { '': { label: 'بدون تقييم', cls: 'bg-slate-100 text-slate-400 border-slate-200' }, excellent: { label: '⭐ ممتاز', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }, good: { label: '👍 جيد', cls: 'bg-blue-100 text-blue-700 border-blue-200' }, late_payment: { label: '⏰ متأخر بالدفع', cls: 'bg-rose-100 text-rose-700 border-rose-200' } }
  const cycleOfficeTag = async (b, e) => {
    e.stopPropagation()
    const order = ['', 'excellent', 'good', 'late_payment']
    const next = order[(order.indexOf(b.tag || '') + 1) % order.length]
    try {
      await api('/meraaj/office-tag', { method: 'POST', body: { office: b.office, tag: next } })
      setHealth(h => ({ ...h, buyers: (h.buyers || []).map(x => x.office === b.office ? { ...x, tag: next } : x) }))
      setOfficeTags(m => { const n = { ...m }; if (next === '') delete n[b.office]; else n[b.office] = next; return n }) // v3.64 — keep bookings tab in sync
      toast.success(next === '' ? `أُزيل تقييم «${b.office}»` : `تقييم «${b.office}»: ${OFFICE_TAGS[next].label}`)
    } catch (err) { toast.error(err.message) }
  }
  const downloadMonthlyReport = async () => {
    setReportBusy(true)
    try {
      const r = await api(`/meraaj/monthly-report?month=${reportMonth}`)
      const hdr = ['الاسم', 'حجوزات', 'معتمدة', 'مرفوضة/ملغاة', 'مقاعد', 'الإيراد', 'صافي لك', 'العملة']
      const row = (name, a) => [name, a.bookings, a.approved, a.rejected, a.seats, a.revenue, a.net_to_seller, a.currency || '']
      const tot = row('الإجمالي', r.totals || {})
      const wsSum = XLSX.utils.aoa_to_sheet([
        [`تقرير معراج الشهري — ${r.month}`], [],
        ['إجمالي الحجوزات الواردة', r.totals?.bookings ?? 0],
        ['المعتمدة', r.totals?.approved ?? 0],
        ['المرفوضة/الملغاة', r.totals?.rejected ?? 0],
        ['إجمالي المقاعد', r.totals?.seats ?? 0],
        ['إجمالي الإيراد', r.totals?.revenue ?? 0],
        ['صافي لك بعد العمولة', r.totals?.net_to_seller ?? 0],
        ['ويبهوك مرفوضة (توقيع)', r.rejected_webhooks ?? 0],
        ['أحداث مزامنة صادرة', r.outbound_events ?? 0],
      ])
      wsSum['!cols'] = [{ wch: 26 }, { wch: 14 }]
      const wsPkg = XLSX.utils.aoa_to_sheet([[`حسب الباكج — ${r.month}`], [], hdr, ...(r.packages || []).map(p => row(p.name, p)), tot])
      const wsOff = XLSX.utils.aoa_to_sheet([[`حسب المكتب المشتري — ${r.month}`], [], hdr, ...(r.offices || []).map(o => row(o.office, o)), tot])
      const cols = [{ wch: 34 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 7 }]
      wsPkg['!cols'] = cols; wsOff['!cols'] = cols
      const wb = XLSX.utils.book_new()
      wb.Workbook = { Views: [{ RTL: true }] }
      XLSX.utils.book_append_sheet(wb, wsSum, 'الملخص')
      XLSX.utils.book_append_sheet(wb, wsPkg, 'حسب الباكج')
      XLSX.utils.book_append_sheet(wb, wsOff, 'حسب المكتب')
      XLSX.writeFile(wb, `تقرير_معراج_${r.month}.xlsx`)
      toast.success(`✅ تم تنزيل تقرير معراج لشهر ${r.month}`)
    } catch (e) { toast.error(e.message) } finally { setReportBusy(false) }
  }
  useEffect(() => { if (config) setThresholdVal(String(config.reject_alert_threshold ?? 5)) }, [config])
  const saveThreshold = async () => {
    try {
      const r = await api('/meraaj/settings', { method: 'POST', body: { reject_alert_threshold: Math.max(0, parseInt(thresholdVal, 10) || 0) } })
      setConfig(c => ({ ...c, reject_alert_threshold: r.reject_alert_threshold }))
      toast.success(r.reject_alert_threshold === 0 ? '🔕 تم تعطيل تنبيه الرفض اليومي' : `🚨 حد التنبيه: ${r.reject_alert_threshold} رفض/يوم`)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [])
  const load = async () => {
    try {
      const cfg = await api('/meraaj/config')
      setConfig(cfg)
      if (cfg.store_url) {
        try {
          const { token } = await api('/meraaj/sso-token', { method: 'POST' })
          setIframeUrl(`${cfg.store_url}${cfg.store_url.includes('?') ? '&' : '?'}sso=${encodeURIComponent(token)}`)
        } catch { setIframeUrl(cfg.store_url) }
      }
    } catch { }
    api('/meraaj/inbound-bookings').then(setInbound).catch(() => {})
    api('/meraaj/events').then(setEvents).catch(() => {})
    if (isOwner) api('/meraaj/webhook-health').then(setHealth).catch(() => {}) // v3.57
    if (isOwner) api('/meraaj/alerts-center').then(setAlertsCenter).catch(() => {}) // v3.69
    api('/meraaj/office-tags').then(list => setOfficeTags(Object.fromEntries((list || []).map(t => [t.office, t.tag])))).catch(() => {}) // v3.64
    api('/packages').then(list => setSharedPkgs((list || []).filter(p => p?.meraaj?.shared))).catch(() => {})
  }
  const newBookings = inbound.filter(b => b.status === 'new')
  const totalSeatsSold = sharedPkgs.reduce((s, p) => s + (Number(p.meraaj?.seats_sold) || 0), 0)
  const EVT_LABELS = { 'inventory.updated': '📊 تحديث مخزون', 'package.shared': '🕋 مشاركة باكج', 'package.updated': '✏️ تحديث باكج', 'package.deactivated': '⛔ إيقاف باكج' }
  // v3.26 — approve inbound booking into a real accounting booking
  const [approving, setApproving] = useState(null)
  // v3.65 — count inbound registrants missing a passport number (flag-only, never blocks approval)
  const missingPassports = (b) => (b.registrants || []).filter(r => !String(r?.passport_no || '').trim()).length
  // v3.66 — passport completion dialog (fill-only: empty passports of the selected inbound booking)
  const [passFor, setPassFor] = useState(null)
  const [passInputs, setPassInputs] = useState({})
  const [passBusy, setPassBusy] = useState(false)
  const openPassports = (b) => {
    setPassFor(b)
    setPassInputs({})
    setImportOpen(false); setImportText(''); setImportResult(null) // v3.67
  }
  // v3.67 — owner passport report (read-only) with package/office filters
  const [passReport, setPassReport] = useState(null)
  const [passReportOpen, setPassReportOpen] = useState(false)
  const [passReportPkg, setPassReportPkg] = useState('')
  const [passReportOffice, setPassReportOffice] = useState('')
  const loadPassReport = async (pkg = passReportPkg, office = passReportOffice) => {
    try {
      const qs = new URLSearchParams()
      if (pkg) qs.set('package_id', pkg)
      if (office) qs.set('office', office)
      setPassReport(await api(`/meraaj/passport-report${qs.toString() ? `?${qs}` : ''}`))
    } catch (e) { toast.error(e.message) }
  }
  const openPassReport = () => { setPassReportOpen(true); setPassReportPkg(''); setPassReportOffice(''); setPassReport(null); loadPassReport('', '') }
  // v3.68 — Excel export of the missing-passports report (current filter scope)
  const exportPassReport = () => {
    try {
      const rows = passReport?.rows || []
      if (rows.length === 0) { toast.error('لا توجد صفوف للتصدير ضمن هذا النطاق'); return }
      const ws = XLSX.utils.aoa_to_sheet([
        [`تقرير الجوازات الناقصة — ${new Date().toLocaleDateString('en-GB')}${passReportOffice ? ` — ${passReportOffice}` : ''}`], [],
        ['#', 'المسافر', 'العمر', 'الباكج', 'المكتب المشتري', 'مرجع معراج'],
        ...rows.map((r, i) => [i + 1, r.name, r.age ?? '', r.package_name, r.office, r.booking_ref || '']),
      ])
      ws['!cols'] = [{ wch: 4 }, { wch: 24 }, { wch: 6 }, { wch: 30 }, { wch: 22 }, { wch: 16 }]
      const wb = XLSX.utils.book_new()
      wb.Workbook = { Views: [{ RTL: true }] }
      XLSX.utils.book_append_sheet(wb, ws, 'الجوازات الناقصة')
      XLSX.writeFile(wb, `تقرير_الجوازات_الناقصة_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success('✅ تم تنزيل تقرير الجوازات الناقصة')
    } catch (e) { toast.error('خطأ في التصدير: ' + e.message) }
  }
  // v3.68 — ready WhatsApp reminder asking a buyer office for its missing passports
  const sendPassReminder = () => {
    const office = passReportOffice
    if (!office) { toast.error('اختر مكتباً من فلتر المكاتب أولاً لتوليد رسالة التذكير'); return }
    const rows = (passReport?.rows || []).filter(r => r.office === office)
    if (rows.length === 0) { toast.error('لا توجد جوازات ناقصة لهذا المكتب') }
    let msg = `السلام عليكم «${office}» 🌹\n\nنأمل تزويدنا بأرقام جوازات المسافرين التالية أسماؤهم لاستكمال إجراءات حجوزاتكم عبر معراج:\n\n`
    const byRef = {}
    for (const r of rows) {
      const key = `${r.package_name}${r.booking_ref ? ` — ${r.booking_ref}` : ''}`
      byRef[key] = byRef[key] || []
      byRef[key].push(r)
    }
    for (const [key, list] of Object.entries(byRef)) {
      msg += `📦 ${key}:\n` + list.map(r => `   • ${r.name}${r.age != null ? ` (${r.age} سنة)` : ''}`).join('\n') + '\n'
    }
    msg += `\nإجمالي المطلوب: ${rows.length} جواز 🛂\nشاكرين تعاونكم — ${new Date().toLocaleDateString('en-GB')}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }
  // v3.67 — auto-retry schedule toggle (owner)
  const toggleAutoRetry = async () => {
    try {
      const r = await api('/meraaj/settings', { method: 'POST', body: { auto_retry: !config?.auto_retry } })
      setConfig(c => ({ ...c, auto_retry: r.auto_retry }))
      toast.success(r.auto_retry ? '🔄 فُعّلت الإعادة التلقائية — كل 10 دقائق، 3 أحداث كحد أقصى، وتتوقف بعد 8 محاولات للحدث' : '⏸ أُوقفت الإعادة التلقائية')
    } catch (e) { toast.error(e.message) }
  }
  const savePassports = async () => {
    const entries = Object.entries(passInputs).filter(([, v]) => String(v || '').trim())
    if (entries.length === 0) { toast.error('أدخل رقم جواز واحداً على الأقل'); return }
    for (const [, v] of entries) {
      if (!/^[A-Za-z0-9]{5,15}$/.test(String(v).trim())) { toast.error(`رقم جواز غير صالح: ${v} — أحرف إنجليزية وأرقام فقط (5-15 خانة)`); return }
    }
    setPassBusy(true)
    try {
      const r = await api(`/meraaj/inbound-bookings/${passFor.id}/passports`, { method: 'POST', body: { passports: entries.map(([index, passport_no]) => ({ index: Number(index), passport_no })) } })
      toast.success(`✅ حُفظت ${r.updated} جوازات${r.booking_synced ? ' — وتم تحديث الحجز الفعلي المعتمد أيضاً' : ''}`)
      setInbound(list => (list || []).map(x => x.id === passFor.id ? { ...x, registrants: r.registrants } : x))
      setPassFor(null)
      setImportResult(null)
    } catch (e) { toast.error(e.message) } finally { setPassBusy(false) }
  }
  // v3.67 — PASTE/UPLOAD passport import (per booking): parses lines/sheets of «name , passport»,
  // matches ONLY exact registrant names that are missing a passport, prefills the inputs and shows
  // an explicit per-row result — nothing is skipped silently, saving still goes through validation.
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState(null)
  const runImport = (rowsRaw) => {
    const regs = passFor?.registrants || []
    const results = []
    const fills = {}
    const usedIdx = new Set()
    const rows = rowsRaw.map(r => r.map(c => String(c ?? '').trim()).filter(Boolean)).filter(r => r.length > 0)
    if (rows.length === 0) { toast.error('لا توجد صفوف صالحة — الصيغة: الاسم ، رقم الجواز (سطر لكل مسافر)'); return }
    for (const r of rows) {
      const name = r[0]
      const pass = String(r[1] || '').toUpperCase()
      if (!r[1]) { results.push({ name, ok: false, why: 'لا يوجد رقم جواز في الصف' }); continue }
      const idx = regs.findIndex((g, i) => String(g?.name || '').trim() === name && !usedIdx.has(i))
      if (idx === -1) { results.push({ name, ok: false, why: 'لا يطابق أي مسافر في هذا الحجز (الاسم يجب أن يطابق تماماً)' }); continue }
      if (String(regs[idx]?.passport_no || '').trim()) { results.push({ name, ok: false, why: `لديه جواز مسجّل مسبقاً (${regs[idx].passport_no})` }); continue }
      if (!/^[A-Z0-9]{5,15}$/.test(pass)) { results.push({ name, ok: false, why: `رقم غير صالح: ${pass} (أحرف إنجليزية وأرقام 5-15)` }); continue }
      usedIdx.add(idx)
      fills[idx] = pass
      results.push({ name, ok: true, why: `سيُحفظ: ${pass}` })
    }
    setPassInputs(m => ({ ...m, ...fills }))
    setImportResult({ results, matched: Object.keys(fills).length })
    if (Object.keys(fills).length > 0) toast.success(`تمت مطابقة ${Object.keys(fills).length} — راجع النتائج ثم اضغط حفظ الجوازات`)
  }
  const importFromText = () => {
    const rows = importText.split(/\r?\n/).map(line => {
      const parts = line.split(/\t|,|،/)
      return parts.length >= 2 ? [parts[0], parts.slice(1).join('').replace(/\s+/g, '')] : [line]
    })
    runImport(rows)
  }
  const importFromFile = async (file) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      runImport(rows)
    } catch (e) { toast.error('تعذر قراءة الملف: ' + e.message) }
  }
  const approveBooking = async (b) => {
    const noPass = missingPassports(b)
    if (!(await askConfirm({ title: `اعتماد حجز "${b.buyer_office_name}"`, desc: `اعتماد الحجز (${b.seats} مقعد) وتحويله لحجز محاسبي فعلي؟\n\nسيُنشأ: عميل باسم المكتب المشتري (إن لم يوجد) + حجز في الباكج + قيد يومية متوازن${canProfit ? ` بصافي ${(b.net_to_seller_total || 0).toLocaleString('en-US')} ${b.currency}` : ''}${noPass > 0 ? `\n\n🛂 تنبيه: ${noPass} من المسجّلين بلا رقم جواز — يمكنك الاعتماد الآن واستكمال الجوازات لاحقاً من شاشة التسجيل` : ''}`, icon: noPass > 0 ? '🛂' : '✅', confirmLabel: 'اعتماد وتحويل' }))) return
    try {
      setApproving(b.id)
      const res = await api(`/meraaj/inbound-bookings/${b.id}/approve`, { method: 'POST' })
      toast.success(`✅ تم الاعتماد — حجز محاسبي باسم "${res.client?.name}" وقيد متوازن — وسيصل الإشعار لمعراج`)
      load()
    } catch (e) { toast.error(e.message) } finally { setApproving(null) }
  }
  // v3.27 — reject inbound booking (releases seats + notifies Meraaj with the reason)
  const rejectBooking = async (b) => {
    const reason = await askConfirm({ title: `رفض حجز "${b.buyer_office_name}"`, desc: `رفض الحجز (${b.seats} مقعد)؟ سيُعاد المقعد للسوق ويصل السبب لمعراج.`, icon: '⛔', variant: 'danger', confirmLabel: 'تأكيد الرفض', input: { label: 'سبب الرفض (سيظهر للمكتب المشتري في معراج)', required: true, textarea: true } })
    if (reason === null) return
    if (!String(reason).trim()) return toast.error('سبب الرفض إلزامي')
    try {
      setApproving(b.id)
      const res = await api(`/meraaj/inbound-bookings/${b.id}/reject`, { method: 'POST', body: { reason: String(reason).trim() } })
      toast.success(`⛔ تم الرفض — أُعيد ${res.released_seats} مقعد للسوق وسيصل السبب لمعراج`)
      load()
    } catch (e) { toast.error(e.message) } finally { setApproving(null) }
  }
  // v3.73 — buyer CANCELLATION REQUEST decisions on approved bookings (enterprise flow)
  const approveCancellation = async (b) => {
    const note = await askConfirm({ title: 'الموافقة على إلغاء الحجز', desc: `سيُلغى حجز «${b.buyer_office_name}» في «${b.package_name}» نهائياً: تحرير ${b.seats} مقاعد + عكس القيد المحاسبي + إشعار معراج. لا يمكن التراجع.`, icon: '🗑️', variant: 'danger', confirmLabel: 'موافقة على الإلغاء', input: { label: 'ملاحظة/تفاصيل الاسترداد (اختياري — تُرسل لمعراج)', required: false, textarea: true } })
    if (note === null) return
    try {
      setApproving(b.id)
      const r = await api(`/meraaj/inbound-bookings/${b.id}/cancellation/approve`, { method: 'POST', body: { note: String(note || '').trim() } })
      toast.success(`✅ أُلغي الحجز — تحررت ${r.released_seats} مقاعد${r.accounting_reversed ? ' وعُكس القيد المحاسبي' : ''} وأُشعر معراج`)
      if (r.accounting_note) toast.error(`⚠️ محاسبياً: ${r.accounting_note}`, { duration: 12000 })
      load()
    } catch (e) { toast.error(e.message) } finally { setApproving(null) }
  }
  const rejectCancellation = async (b) => {
    const reason = await askConfirm({ title: 'رفض طلب الإلغاء', desc: `سيبقى حجز «${b.buyer_office_name}» معتمداً كما هو، ويصل سبب الرفض للمكتب المشتري في معراج.`, icon: '🛡️', confirmLabel: 'رفض طلب الإلغاء', input: { label: 'سبب رفض الإلغاء (سيظهر للمكتب المشتري)', required: true, textarea: true } })
    if (reason === null) return
    if (!String(reason).trim()) return toast.error('سبب رفض الإلغاء إلزامي')
    try {
      setApproving(b.id)
      await api(`/meraaj/inbound-bookings/${b.id}/cancellation/reject`, { method: 'POST', body: { reason: String(reason).trim() } })
      toast.success('🛡️ رُفض طلب الإلغاء — الحجز يبقى معتمداً وسيصل السبب لمعراج')
      load()
    } catch (e) { toast.error(e.message) } finally { setApproving(null) }
  }
  // v3.75 — ESCROW UI: the office submits its POSITION (executed services + costs + evidence)
  // on a buyer cancellation request. NO local financial effect — final authority: Meraaj Super Admin.
  const [posFor, setPosFor] = useState(null)
  const [posVal, setPosVal] = useState('no_objection')
  const [posServices, setPosServices] = useState([])
  const [posNotes, setPosNotes] = useState('')
  const [posBusy, setPosBusy] = useState(false)
  const POS_SVC_TYPES = { visa: '🛂 تأشيرة', ticket: '✈️ تذكرة طيران', hotel: '🏨 فندق', transport: '🚌 نقل', other: '📦 أخرى' }
  const POS_SVC_STATUSES = { issued: 'صادرة', used: 'مستخدمة', partially_used: 'مستخدمة جزئياً', refundable: 'قابلة للاسترداد', non_refundable: 'غير قابلة للاسترداد' }
  const openPosition = (b) => { setPosFor(b); setPosVal('no_objection'); setPosServices([]); setPosNotes('') }
  const posTotal = posServices.reduce((s, x) => s + (Number(x.cost) || 0), 0)
  const addPosService = () => setPosServices(list => list.length >= 30 ? list : [...list, { type: 'visa', status: 'issued', ref: '', cost: '', note: '', evidence: [] }])
  const updPosService = (i, patch) => setPosServices(list => list.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  const delPosService = (i) => setPosServices(list => list.filter((_, idx) => idx !== i))
  const addPosEvidence = (i) => setPosServices(list => list.map((x, idx) => idx === i ? { ...x, evidence: (x.evidence || []).length >= 10 ? x.evidence : [...(x.evidence || []), { kind: 'url', value: '', label: '' }] } : x))
  const updPosEvidence = (i, j, patch) => setPosServices(list => list.map((x, idx) => idx === i ? { ...x, evidence: (x.evidence || []).map((ev, k) => k === j ? { ...ev, ...patch } : ev) } : x))
  const delPosEvidence = (i, j) => setPosServices(list => list.map((x, idx) => idx === i ? { ...x, evidence: (x.evidence || []).filter((_, k) => k !== j) } : x))
  const submitPosition = async () => {
    if (!posFor) return
    if (posVal === 'objection' && posServices.length === 0 && !posNotes.trim()) { toast.error('عند الاعتراض أضف خدمة منفذة واحدة على الأقل أو اذكر التفاصيل في الملاحظات'); return }
    for (const s of posServices) { if (!(Number(s.cost) >= 0)) { toast.error('تكلفة الخدمة يجب أن تكون رقماً صفراً أو أكبر'); return } }
    setPosBusy(true)
    try {
      const body = {
        position: posVal,
        executed_services: posServices.map(s => ({
          type: s.type, status: s.status, ref: String(s.ref || '').trim(), cost: Number(s.cost) || 0,
          currency: posFor.currency, note: String(s.note || '').trim(),
          evidence: (s.evidence || []).filter(ev => String(ev.value || '').trim()).map(ev => ev.kind === 'file_ref' ? { kind: 'file_ref', value: ev.value, label: String(ev.label || '').trim() } : { kind: 'url', value: String(ev.value).trim(), label: String(ev.label || '').trim() }),
        })),
        notes: posNotes.trim(),
      }
      const r = await api(`/meraaj/inbound-bookings/${posFor.id}/cancellation/position`, { method: 'POST', body })
      toast.success(`⚖️ قُدِّم موقف المكتب (${r.position === 'objection' ? 'اعتراض' : 'لا اعتراض'}) — تكاليف منفذة ${(r.actual_costs_total || 0).toLocaleString('en-US')} ${posFor.currency} — القرار النهائي لدى إدارة معراج`, { duration: 8000 })
      setPosFor(null)
      load()
    } catch (e) { toast.error(e.message) } finally { setPosBusy(false) }
  }
  // v3.77 — upload a REAL evidence file for a position service (context: cancellation_evidence)
  const EV_TYPE_BY_SVC = { visa: 'visa', ticket: 'ticket', hotel: 'hotel', transport: 'other', other: 'receipt' }
  const uploadEvidenceFile = async (i, fileList) => {
    if (!posFor) return

    const valid = validateDocBatch(fileList)
    if (!valid.length) return

    setPosBusy(true)
    let okCount = 0

    for (const f of valid) {
      try {
        const file_base64 = await readFileB64(f)
        const svcType = posServices[i]?.type || 'other'
        const r = await api(`/meraaj/inbound-bookings/${posFor.id}/documents`, {
          method: 'POST',
          body: {
            context: 'cancellation_evidence',
            evidence_type: EV_TYPE_BY_SVC[svcType] || 'other',
            label: f.name,
            filename: f.name,
            content_type: f.type,
            file_base64
          },
        })

        setPosServices(list => list.map((x, idx) =>
          idx === i
            ? { ...x, evidence: [...(x.evidence || []), { kind: 'file_ref', value: r.document.id, label: f.name }] }
            : x
        ))

        okCount += 1
      } catch (e) {
        toast.error(`${f.name}: ${e.message}`)
      }
    }

    setPosBusy(false)

    if (okCount > 0) {
      toast.success(`📎 رُفع ${okCount} ملف دليل وارتبط بالخدمة`)
    }
  }
  // v3.77 — BOOKING DOCUMENTS (traveler passports/visas + cancellation evidence) per inbound booking
  const [docsFor, setDocsFor] = useState(null)
  const [docsList, setDocsList] = useState([])
  const [docsBusy, setDocsBusy] = useState(false)
  const [docReg, setDocReg] = useState(0)
  const [docTypeB, setDocTypeB] = useState('passport')
  const [docSelectedId, setDocSelectedId] = useState(null)
  const [docZoom, setDocZoom] = useState(1)
  const [docPending, setDocPending] = useState(null)
  const [docPendingFiles, setDocPendingFiles] = useState([])
  const [docUploadProgress, setDocUploadProgress] = useState({ current: 0, total: 0 })
  const [docPendingUrl, setDocPendingUrl] = useState('')
  const BK_DOC_LABELS = { passport: '🛂 جواز', visa: '📄 تأشيرة', ticket: '🎫 تذكرة', photo: '🖼️ صورة', other: '📎 آخر' } // v3.85 — + ticket/photo (Meraaj types)
  const loadDocs = async (b) => {
    try {
      const r = await api(`/meraaj/inbound-bookings/${b.id}/documents`)
      const list = r.documents || []
      setDocsList(list)
      setDocSelectedId(prev => (prev && list.some(x => x.id === prev)) ? prev : (list[0]?.id || null))
    } catch (e) { toast.error(e.message) }
  }
  const clearPendingDoc = () => {
    if (docPendingUrl) URL.revokeObjectURL(docPendingUrl)
    setDocPending(null)
    setDocPendingUrl('')
      setDocPendingFiles([])
    setDocUploadProgress({ current: 0, total: 0 })
  }
  const openDocs = (b) => {
    clearPendingDoc()
    setDocsFor(b); setDocsList([]); setDocSelectedId(null); setDocZoom(1); setDocReg(0); setDocTypeB('passport'); loadDocs(b)
  }
  const chooseBookingDoc = (file) => {
    if (!file) return
    if (!DOC_OK_TYPES.includes(file.type)) { toast.error('المسموح: PDF / JPG / PNG / WEBP فقط'); return }
    if (file.size > DOC_MAX_FILE_BYTES) { toast.error(`الحد الأقصى لحجم الملف ${DOC_MAX_MB}MB`); return }
    if (docPendingUrl) URL.revokeObjectURL(docPendingUrl)
    setDocPending(file)
    setDocPendingUrl(URL.createObjectURL(file))
    setDocZoom(1)
  }
  const bookingDocUrl = (d) => {
    if (!d) return ''
    if (d.external_url) {
      const name = d.filename || d.label || 'document'
      return `/api/meraaj/document-proxy?url=${encodeURIComponent(d.external_url)}&name=${encodeURIComponent(name)}`
    }
    return d.id ? `/api/meraaj/booking-documents/${d.id}/download` : ''
  }
  const isPdfDoc = (d, pending = null) => {
    const mime = pending?.type || d?.content_type || d?.mime_type || ''
    const name = pending?.name || d?.filename || d?.label || ''
    return String(mime).toLowerCase().includes('pdf') || String(name).toLowerCase().endsWith('.pdf')
  }
  const fetchBookingDocBlob = async (url) => {
    if (!url) throw new Error('لا يوجد مستند')

    const res = await fetch(url, {
      method: 'GET',
      // v3.85 — FIX 401 on Download/Print for authorized users: all document endpoints sit
      // behind session auth (rahaal_session cookie). 'omit' NEVER sends cookies — even
      // same-origin — so every fetch-based blob request was rejected with 401 while
      // <img>/<iframe> previews (which send cookies automatically) kept working.
      credentials: 'same-origin',
      cache: 'no-store'
    })

    if (!res.ok) {
      throw new Error(`تعذر جلب المستند (${res.status})`)
    }

    return await res.blob()
  }

  const printBookingDoc = async (url) => {
    if (!url) return

    try {
      const blob = await fetchBookingDocBlob(url)
      const blobUrl = URL.createObjectURL(blob)
      const mime = String(blob.type || '').toLowerCase()

      if (mime.includes('pdf')) {
        const frame = document.createElement('iframe')
        frame.style.position = 'fixed'
        frame.style.left = '-10000px'
        frame.style.top = '0'
        frame.style.width = '1px'
        frame.style.height = '1px'
        frame.style.border = '0'
        frame.src = blobUrl

        frame.onload = () => {
          setTimeout(() => {
            try {
              frame.contentWindow?.focus()
              frame.contentWindow?.print()
            } catch {
              toast.error('تعذر فتح نافذة الطباعة للـ PDF')
            }
          }, 500)
        }

        document.body.appendChild(frame)

        setTimeout(() => {
          frame.remove()
          URL.revokeObjectURL(blobUrl)
        }, 60000)

        return
      }

      const w = window.open('', '_blank', 'width=1100,height=850')
      if (!w) {
        URL.revokeObjectURL(blobUrl)
        toast.error('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة لرحّال')
        return
      }

      w.document.open()
      w.document.write(`
        <!doctype html>
        <html dir="rtl">
          <head>
            <meta charset="utf-8" />
            <title>طباعة المستند</title>
            <style>
              html,body{
                margin:0;
                padding:0;
                width:100%;
                height:100%;
                background:#fff;
              }
              body{
                display:flex;
                align-items:center;
                justify-content:center;
              }
              img{
                max-width:100%;
                max-height:100vh;
                object-fit:contain;
              }
              @page{
                margin:10mm;
              }
              @media print{
                html,body{
                  width:100%;
                  height:auto;
                }
                img{
                  max-width:100%;
                  max-height:100%;
                }
              }
            </style>
          </head>
          <body>
            <img src="${blobUrl}" alt="Document" />
            <script>
              const img = document.querySelector('img');
              img.onload = () => {
                setTimeout(() => {
                  window.focus();
                  window.print();
                }, 250);
              };
            <\/script>
          </body>
        </html>
      `)
      w.document.close()

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)

    } catch (e) {
      console.error('printBookingDoc:', e)
      toast.error(e?.message || 'تعذر طباعة المستند')
    }
  }

  const downloadBookingDoc = async (url, name = 'document') => {
    if (!url) return

    try {
      const blob = await fetchBookingDocBlob(url)
      const blobUrl = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = blobUrl
      a.download = name || 'document'
      a.style.display = 'none'

      document.body.appendChild(a)
      a.click()
      a.remove()

      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)

    } catch (e) {
      console.error('downloadBookingDoc:', e)
      toast.error(e?.message || 'تعذر تنزيل المستند')
    }
  }
  const selectBookingDocs = (fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return

    const valid = validateDocBatch(incoming)
    if (!valid.length) return

    setDocPendingFiles(valid)

    // Keep the first selected file in the existing professional preview.
    const first = valid[0]
    setDocPending(first)
    setDocSelectedId(null)
    setDocZoom(1)

    setDocPendingUrl(prev => {
      if (prev && String(prev).startsWith('blob:')) {
        try { URL.revokeObjectURL(prev) } catch {}
      }
      return URL.createObjectURL(first)
    })
  }

  const uploadBookingDoc = async (fileOrFiles = null) => {
    if (!docsFor) return

    let files
    if (Array.isArray(fileOrFiles)) files = fileOrFiles
    else if (fileOrFiles instanceof File) files = [fileOrFiles]
    else if (docPendingFiles?.length) files = docPendingFiles
    else if (docPending) files = [docPending]
    else files = []

    if (!files.length) {
      toast.error('اختر ملفاً واحداً على الأقل')
      return
    }

    const validated = validateDocBatch(files)
    if (!validated.length) return
    files = validated

    setDocsBusy(true)
    setDocUploadProgress({ current: 0, total: files.length })

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        setDocUploadProgress({ current: i + 1, total: files.length })

        const file_base64 = await readFileB64(file)

        await api(`/meraaj/inbound-bookings/${docsFor.id}/documents`, {
          method: 'POST',
          body: {
            context: 'traveler',
            registrant_index: docReg,
            doc_type: docTypeB,
            label: file.name,
            filename: file.name,
            content_type: file.type,
            file_base64,
          },
        })
      }

      toast.success(
        files.length === 1
          ? '📤 رُفع مستند المسافر'
          : `📤 تم رفع ${files.length} مستندات بنجاح`
      )

      clearPendingDoc()
      setDocPendingFiles([])
      setDocUploadProgress({ current: 0, total: 0 })
      await loadDocs(docsFor)
    } catch (e) {
      toast.error(e.message || 'تعذر رفع المستندات')
    } finally {
      setDocsBusy(false)
    }
  }

  const delBookingDoc = async (d) => {
    try { await api(`/meraaj/booking-documents/${d.id}`, { method: 'DELETE' }); toast.success('حُذف المستند'); loadDocs(docsFor) } catch (e) { toast.error(e.message) }
  }
  const [activating, setActivating] = useState(false)
  const storeActive = !!config?.store_active
  const activateStore = async () => {
    if (!(await askConfirm({ title: 'تفعيل متجر معراج نتورك', desc: 'سيتم تفعيل اشتراك مكتبك في سوق معراج B2B فوراً:\n• باقاتك المُشارَكة تظهر للمكاتب الأخرى في السوق\n• تستقبل حجوزات واردة مباشرة داخل رحّال\n• تفعيل ذاتي فوري — بدون انتظار أو إجراءات يدوية', icon: '🚀', confirmLabel: 'تفعيل الاشتراك الآن' }))) return
    setActivating(true)
    try {
      await api('/meraaj/activate', { method: 'POST' })
      toast.success('🎉 تم تفعيل متجرك في معراج نتورك — باقاتك المُشارَكة معروضة في السوق الآن')
      await load()
    } catch (e) { toast.error(e.message) } finally { setActivating(false) }
  }
  // v3.50 — Batch re-sync all shared packages (owner only)
  const [resyncing, setResyncing] = useState(false)
  const resyncAll = async () => {
    if (!(await askConfirm({ title: 'تحديث كل الباقات في معراج', desc: `سيتم إعادة حساب أسعار السوق من أسعار الغرف الحالية لكل الباقات المُشارَكة (${sharedPkgs.length} باقة) وإرسال تحديث فوري لمعراج — لضمان ظهور الأسعار الصحيحة بدون أصفار.`, icon: '🔄', confirmLabel: 'تحديث الكل الآن' }))) return
    setResyncing(true)
    try {
      const r = await api('/meraaj/resync-all', { method: 'POST' })
      toast.success(`✅ تم إرسال التحديث لـ ${r.synced} باقة${r.failed ? ` — فشل ${r.failed}` : ''} من أصل ${r.total}`)
      await load()
    } catch (e) { toast.error(e.message) } finally { setResyncing(false) }
  }
  // v3.53 — Auto-approve toggle (owner only)
  const toggleAutoApprove = async (val) => {
    if (val && !(await askConfirm({ title: 'تفعيل الاعتماد التلقائي', desc: 'أي حجز يصل من سوق معراج سيتحول فوراً لحجز فعلي: عميل + تسجيل بأسماء المسافرين + قيد محاسبي متوازن — دون أي تدخل يدوي.\n\nيمكنك إيقافه في أي وقت.', icon: '⚡', confirmLabel: 'تفعيل الاعتماد التلقائي' }))) return
    try {
      await api('/meraaj/settings', { method: 'POST', body: { auto_approve: val } })
      toast.success(val ? '⚡ الاعتماد التلقائي مفعّل — الحجوزات الواردة ستتحول فوراً' : 'تم إيقاف الاعتماد التلقائي — عاد الاعتماد اليدوي')
      await load()
    } catch (e) { toast.error(e.message) }
  }
  // v3.75 — Escrow P2P mode toggle (owner only): final cancellation authority → Meraaj Super Admin
  const toggleEscrow = async (val) => {
    if (!(await askConfirm({
      title: val ? 'تفعيل وضع Escrow (P2P)' : 'إيقاف وضع Escrow',
      desc: val
        ? 'عند التفعيل:\n• لن يستطيع مكتبك اعتماد أو رفض إلغاءات الحجوزات المعتمدة نهائياً\n• دورك يقتصر على تقديم «موقف المكتب»: الخدمات المنفذة + التكاليف الفعلية + روابط الأدلة\n• القرار المالي النهائي (استرداد كلي/جزئي/إبقاء) يصدر من إدارة معراج ويُنفَّذ تلقائياً بقيود تسوية محاسبية متوازنة\n\nيمكنك إيقافه في أي وقت.'
        : 'سيعود قرار الموافقة/الرفض على طلبات إلغاء الحجوزات المعتمدة إلى مكتبك (المسار التقليدي)، ويتوقف مسار تقديم الموقف.',
      icon: '⚖️', confirmLabel: val ? 'تفعيل وضع Escrow' : 'إيقاف الوضع',
    }))) return
    try {
      const r = await api('/meraaj/settings', { method: 'POST', body: { escrow_mode: val } })
      setConfig(c => ({ ...c, escrow_mode: r.escrow_mode }))
      toast.success(r.escrow_mode ? '⚖️ وضع Escrow مفعّل — القرار النهائي لإلغاءات الحجوزات المعتمدة لدى إدارة معراج' : 'أُوقف وضع Escrow — عاد قرار الإلغاء لمكتبك')
    } catch (e) { toast.error(e.message) }
  }
  // v3.76 — ACCOUNT LINKING: create/link this office's Meraaj account (SSO identity, office scope only)
  const [linking, setLinking] = useState(false)
  const linkAccount = async () => {
    setLinking(true)
    try {
      const r = await api('/meraaj/account-link', { method: 'POST' })
      setConfig(c => ({ ...c, office_linked: true, meraaj_office_id: r.meraaj_office_id, link_status: 'linked', link_error: null }))
      toast.success(r.already ? '🔗 حساب المكتب مرتبط مسبقاً بمعراج' : '🔗 تم ربط حساب المكتب بمعراج بنجاح')
    } catch (e) { toast.error(e.message) } finally { setLinking(false) }
  }
  return (
    <div>
      <TopBar title="🕋 متجر معراج نتورك" subtitle="سوق B2B لبيع وشراء برامج العمرة والسياحة بين المكاتب" right={<div className="flex gap-2 items-center flex-wrap">
        {storeActive && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 h-8 px-3">✅ المتجر مفعّل</Badge>}
        {isOwner && sharedPkgs.length > 0 && <Button size="sm" onClick={resyncAll} disabled={resyncing} className="gap-1 text-xs h-8 bg-purple-700 hover:bg-purple-800 text-white">{resyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : '🔄'} تحديث كل الباقات في معراج</Button>}
        <Button variant="outline" onClick={load} className="gap-1 text-xs h-8">🔄 تحديث</Button>
      </div>} />
      {/* v3.53 — Auto-approve setting (owner only) */}
      {isOwner && config && (
        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-purple-200 bg-purple-50/50 px-4 py-2.5 mb-4 flex-wrap">
          <div className="min-w-0">
            <div className="font-bold text-sm text-purple-900">⚡ الاعتماد التلقائي لحجوزات معراج الواردة {config.auto_approve ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 ms-1">مفعّل</Badge> : <Badge variant="outline" className="ms-1">متوقف</Badge>}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">عند التفعيل: أي حجز يصل من السوق يتحول فوراً لحجز فعلي بقيده المحاسبي وتظهر أسماء المسافرين مباشرة في قائمة المسجلين — دون أي ضغط يدوي.</div>
          </div>
          <Switch checked={!!config.auto_approve} onCheckedChange={toggleAutoApprove} />
        </div>
      )}
      {/* v3.75 — Escrow P2P mode (owner only): cancellation authority → Meraaj Super Admin */}
      {isOwner && config && (
        <div className={`flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-2.5 mb-4 flex-wrap ${config.escrow_mode ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-slate-50/50'}`}>
          <div className="min-w-0">
            <div className="font-bold text-sm text-indigo-900">⚖️ وضع Escrow (P2P) — سلطة الإلغاء النهائية لدى إدارة معراج {config.escrow_mode ? <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 ms-1">مفعّل</Badge> : <Badge variant="outline" className="ms-1">متوقف</Badge>}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">عند التفعيل: مكتبك يقدّم «موقف المكتب» فقط على طلبات إلغاء الحجوزات المعتمدة (خدمات منفذة + تكاليف + أدلة)، والقرار المالي النهائي (استرداد كلي/جزئي/إبقاء) يصدر من إدارة معراج ويُسوّى محاسبياً تلقائياً بقيود متوازنة.</div>
          </div>
          <Switch checked={!!config.escrow_mode} onCheckedChange={toggleEscrow} />
        </div>
      )}
      {/* v3.76 — Account Linking / SSO with Meraaj */}
      {config && (
        <div className={`flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-2.5 mb-4 flex-wrap ${config.office_linked ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
          <div className="min-w-0">
            <div className="font-bold text-sm text-slate-800">🔗 ربط حساب معراج (SSO) {config.office_linked ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 ms-1">مرتبط</Badge> : <Badge variant="outline" className="ms-1">غير مرتبط</Badge>}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {config.office_linked
                ? <>معرّف المكتب في معراج: <span className="font-mono text-[10px]" dir="ltr">{config.meraaj_office_id || '—'}</span> — الدخول لمتجر معراج يتم بحساب رحّال تلقائياً ضمن هوية وصلاحيات مكتبك فقط</>
                : 'اربط حساب مكتبك بمعراج لإنشاء/مطابقة هوية المكتب تلقائياً، وتفعيل «الدخول بحساب رحّال»، ومزامنة الصلاحيات ضمن نطاق مكتبك فقط'}
              {!config.office_linked && config.link_status === 'failed' && config.link_error && <span className="text-rose-500"> — آخر محاولة فشلت: {config.link_error}</span>}
            </div>
          </div>
          {!config.office_linked && <Button size="sm" onClick={linkAccount} disabled={linking} className="gap-1 bg-slate-800 hover:bg-slate-900 text-white">{linking ? <Loader2 className="w-3 h-3 animate-spin" /> : '🔗'} ربط الحساب الآن</Button>}
        </div>
      )}
      {iframeUrl && storeActive ? (
        <div className="rounded-xl overflow-hidden border-2 border-purple-200 shadow-lg bg-white" style={{ height: 'calc(100vh - 160px)' }}>
          <iframe src={iframeUrl} title="متجر معراج نتورك" className="w-full h-full border-0" allow="clipboard-write" />
        </div>
      ) : storeActive ? (
        <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-b from-emerald-50/70 to-teal-50/40 p-6 text-center mb-4">
          <div className="text-4xl mb-1">✅</div>
          <div className="text-xl font-black text-emerald-800">متجرك مفعّل ومشترك في معراج نتورك</div>
          <div className="text-sm text-slate-600 mt-2 max-w-xl mx-auto leading-relaxed">
            اشتراك مكتبك نشط{config?.store_activated_at ? ` منذ ${new Date(config.store_activated_at).toLocaleDateString('en-GB')}` : ''} — كل باقة تشاركها عبر زر <b>"🕋 معراج"</b> في قسم الباكجات تظهر مباشرة في السوق، وتصلك الحجوزات هنا فوراً.
            {!config?.store_url && <><br /><span className="text-xs text-slate-400">واجهة التصفح المدمجة للسوق ستظهر هنا تلقائياً فور إتاحة رابطها من معراج — دون أي تحديث برمجي.</span></>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-purple-300 bg-gradient-to-b from-purple-50/60 to-fuchsia-50/40 p-8 text-center mb-4">
          <div className="text-5xl mb-2">🕋</div>
          <div className="text-xl font-black text-purple-800">متجر معراج نتورك</div>
          <div className="text-sm text-slate-500 mt-2 max-w-xl mx-auto leading-relaxed">
            نظامك <b>جاهز ومربوط تقنياً</b> {config?.configured ? '✅' : '⚠️ (بانتظار تهيئة المفتاح السري)'} — فعّل اشتراك مكتبك الآن لتظهر باقاتك وبرامجك المُشارَكة في سوق معراج B2B مباشرة وتستقبل الحجوزات داخل رحّال.
          </div>
          <Button onClick={activateStore} disabled={activating} className="mt-4 h-11 px-8 text-base font-black bg-gradient-to-l from-purple-700 to-fuchsia-600 hover:from-purple-800 hover:to-fuchsia-700 text-white shadow-lg gap-2">
            {activating ? '⏳ جارِ التفعيل...' : '🚀 تفعيل المتجر والاشتراك الآن'}
          </Button>
          <div className="text-[11px] text-slate-400 mt-2">تفعيل فوري ذاتي — بدون انتظار أو إجراءات يدوية</div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 my-4">
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-black text-purple-700">{sharedPkgs.length}</div><div className="text-[11px] text-slate-500">باكجات مُشارَكة</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-black text-fuchsia-700">{totalSeatsSold}</div><div className="text-[11px] text-slate-500">مقاعد مباعة عبر معراج</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-black text-emerald-700">{newBookings.length}</div><div className="text-[11px] text-slate-500">حجوزات جديدة واردة</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-black text-slate-700">{events.length}</div><div className="text-[11px] text-slate-500">أحداث مزامنة</div></CardContent></Card>
      </div>
      <div className="flex gap-2 mb-3">
        <Button size="sm" variant={view === 'shared' ? 'default' : 'outline'} onClick={() => setView('shared')} className="h-8 text-xs">🕋 الباكجات المُشارَكة ({sharedPkgs.length})</Button>
        <Button size="sm" variant={view === 'bookings' ? 'default' : 'outline'} onClick={() => setView('bookings')} className="h-8 text-xs">📥 حجوزات معراج ({inbound.length})</Button>
        <Button size="sm" variant={view === 'events' ? 'default' : 'outline'} onClick={() => setView('events')} className="h-8 text-xs">🔄 سجل المزامنة</Button>
        {isOwner && <Button size="sm" variant={view === 'health' ? 'default' : 'outline'} onClick={() => setView('health')} className="h-8 text-xs">🩺 صحة المزامنة{(health?.stats?.rejected_24h || 0) > 0 ? <span className="mr-1 px-1.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black">{health.stats.rejected_24h}</span> : null}</Button>}
        {isOwner && <Button size="sm" variant={view === 'alerts' ? 'default' : 'outline'} onClick={() => { setView('alerts'); loadAlertsCenter() }} className="h-8 text-xs">🔔 مركز التنبيهات{(alertsCenter?.counts?.total || 0) > 0 ? <span className="mr-1 px-1.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black">{alertsCenter.counts.total}</span> : null}</Button>}
        {isOwner && <Button size="sm" variant={view === 'comparison' ? 'default' : 'outline'} onClick={() => { setView('comparison'); if (!comparison) loadComparison() }} className="h-8 text-xs">📊 مقارنة المكاتب</Button>}
        {/* v3.67 — owner read-only passport report */}
        {isOwner && <Button size="sm" variant="outline" onClick={openPassReport} className="h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50">🛂 تقرير الجوازات الناقصة</Button>}
      </div>
      {view === 'shared' && (
        sharedPkgs.length === 0 ? <Card><CardContent className="p-8 text-center text-slate-400 text-sm">لا توجد باقات مُشارَكة — من قسم الباكجات اضغط زر "🕋 معراج" على أي باقة</CardContent></Card> : (
          <Card><CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>الباكج</TableHead><TableHead>أسعار السوق (بالغ)</TableHead>{canProfit && <TableHead>عمولة الوكيل</TableHead>}<TableHead>المقاعد (مباع/مخصص)</TableHead><TableHead>متاح</TableHead></TableRow></TableHeader>
            <TableBody>{sharedPkgs.map(p => {
              const m = p.meraaj || {}
              const avail = Math.max(0, (Number(m.seats_allocated) || 0) - (Number(m.seats_sold) || 0))
              const mp = m.market_pricing || []
              return (<TableRow key={p.id} className={m.dispatched ? 'opacity-60 bg-slate-50' : ''}>
                <TableCell className="font-bold text-xs">
                  {p.name}
                  {m.route && <span className="block text-[9px] font-normal text-slate-500 mt-0.5">🛣️ {m.route}</span>}
                  {m.dispatched && <Badge className="bg-slate-200 text-slate-600 text-[9px] mt-0.5">🚌 مُفوَّجة — مخفية من السوق</Badge>}
                  {!m.dispatched && m.hidden_full && <Badge className="bg-rose-100 text-rose-600 text-[9px] mt-0.5">⛔ مكتملة — مخفية تلقائياً</Badge>}
                </TableCell>
                <TableCell className="text-xs">
                  {mp.length === 0 ? '—' : mp.slice(0, 3).map(r => <span key={r.room_type} className="me-2 whitespace-nowrap">🛏️{r.room_type}: <b className="text-purple-700">{(r.customer?.adult || 0).toLocaleString('en-US')}</b></span>)}
                  {mp.length > 3 && <span className="text-slate-400">+{mp.length - 3}</span>}
                </TableCell>
                {canProfit && <TableCell className="text-xs text-amber-700 whitespace-nowrap">
                  {m.buyer_commission_mode === 'percent' ? `${m.buyer_commission_value}%` : fmt(m.buyer_commission_value || 0, p.currency)}
                  <span className="text-[9px] text-slate-400 block">{m.commission_direction === 'added' ? '➕ فوق السعر' : '➖ من السعر'}</span>
                </TableCell>}
                <TableCell className="text-xs">
                  {/* v3.64 — seats progress bar with capacity coloring */}
                  {(() => {
                    const alloc = Number(m.seats_allocated) || 0
                    const sold = Number(m.seats_sold) || 0
                    const pct = alloc > 0 ? Math.min(100, Math.round((sold / alloc) * 100)) : 0
                    const barCls = pct >= 95 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                    return (
                      <div className="min-w-[110px]">
                        <div className="flex items-center justify-between text-[10px] font-bold mb-0.5">
                          <span>{sold} / {alloc}</span>
                          <span className={pct >= 95 ? 'text-rose-600' : pct >= 80 ? 'text-amber-600' : 'text-slate-400'}>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={m.dispatched ? 'bg-slate-200 text-slate-500' : avail > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>{m.dispatched ? '🚌 مُفوَّجة' : avail > 0 ? `${avail} متاح` : 'نفدت'}</Badge>
                    {/* v3.64 — quick +5 seats when close to selling out (owner, open packages) */}
                    {isOwner && !m.dispatched && p.status === 'open' && (avail <= 1 || ((Number(m.seats_allocated) || 0) > 0 && (Number(m.seats_sold) || 0) / (Number(m.seats_allocated) || 1) >= 0.8)) && (
                      <Button size="sm" onClick={() => storeRefill(p)} disabled={storeRefillBusy === p.id}
                        className="h-6 text-[10px] px-2 gap-1 bg-amber-600 hover:bg-amber-700" title="زيادة 5 مقاعد وإشعار معراج فوراً">
                        {storeRefillBusy === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '➕'} 5
                      </Button>
                    )}
                    {/* v3.72 — تفويج: hide the departed package from the market / undo */}
                    {isOwner && (
                      <Button size="sm" variant={m.dispatched ? 'outline' : 'default'} onClick={() => storeDispatch(p)} disabled={dispatchBusy === p.id}
                        className={m.dispatched ? 'h-6 text-[10px] px-2 gap-1 border-slate-300 text-slate-600' : 'h-6 text-[10px] px-2 gap-1 bg-slate-700 hover:bg-slate-800 text-white'}
                        title={m.dispatched ? 'إعادة الباقة للظهور في السوق' : 'تفويج الرحلة وإخفاء الباقة من السوق نهائياً'}>
                        {dispatchBusy === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : m.dispatched ? '↩️' : '🚌'} {m.dispatched ? 'إلغاء التفويج' : 'تفويج'}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>)
            })}</TableBody>
          </Table></CardContent></Card>
        )
      )}
      {view === 'bookings' && (
        inbound.length === 0 ? <Card><CardContent className="p-8 text-center text-slate-400 text-sm">لا توجد حجوزات واردة من معراج بعد — ستظهر هنا تلقائياً فور حدوثها مع بيانات المسافرين وجوازاتهم</CardContent></Card> : (
          <Card><CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>الباكج</TableHead><TableHead>المكتب المشتري</TableHead><TableHead>مسافرون</TableHead><TableHead>الإجمالي</TableHead><TableHead>مرجع معراج</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader>
            <TableBody>{inbound.map(b => (<TableRow key={b.id}>
              <TableCell className="text-xs whitespace-nowrap">{new Date(b.created_at).toLocaleDateString('en-GB')}</TableCell>
              <TableCell className="text-xs font-bold">
                {b.package_name}
                {b.route && <span className="block text-[9px] font-normal text-slate-500 mt-0.5">🛣️ {b.route}</span>}
              </TableCell>
              <TableCell className="text-xs">
                {b.buyer_office_name}
                {/* v3.64 — office rating visible while approving */}
                {officeTags[(b.buyer_office_name || '').trim()] && (
                  <span className={`block w-fit mt-0.5 text-[9px] font-black border rounded-full px-1.5 py-0 ${(OFFICE_TAGS[officeTags[(b.buyer_office_name || '').trim()]] || OFFICE_TAGS['']).cls}`}>
                    {(OFFICE_TAGS[officeTags[(b.buyer_office_name || '').trim()]] || OFFICE_TAGS['']).label}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-xs">
                <div>👨 {b.pax_adults ?? b.seats} • 🧒 {b.pax_children ?? 0} • 👶 {b.pax_infants ?? 0}</div>
                <div className="text-[9px] text-slate-400">{(b.registrants || []).map(r => r.name).slice(0, 2).join('، ')}{(b.registrants || []).length > 2 ? '...' : ''}</div>
                {/* v3.65 — passport completeness flag before approval. v3.66 — fill-only completion */}
                {missingPassports(b) > 0 ? (
                  <button onClick={() => openPassports(b)} className="inline-block mt-0.5 text-[9px] font-black bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-1.5 py-0 hover:bg-amber-200 transition" title="انقر لاستكمال أرقام الجوازات الناقصة">🛂 {missingPassports(b)} بلا جواز — استكمال</button>
                ) : (b.registrants || []).length > 0 && (
                  <span className="inline-block mt-0.5 text-[9px] font-bold text-emerald-600" title="جميع المسجّلين لديهم أرقام جوازات">🛂 الجوازات مكتملة</span>
                )}
                {/* v3.77 — traveler documents & evidence per booking */}
                <button onClick={() => openDocs(b)} className="inline-block mt-0.5 ms-1 text-[9px] font-black bg-slate-100 text-slate-600 border border-slate-300 rounded-full px-1.5 py-0 hover:bg-slate-200 transition" title="مستندات المسافرين وأدلة الحجز">📎 مستندات</button>
              </TableCell>
              <TableCell className="text-xs">{fmt(b.total_price || 0, b.currency)}</TableCell>
              <TableCell className="text-[10px] text-slate-400">{b.meraaj_booking_ref || '—'}</TableCell>
              <TableCell>
                {b.status === 'cancelled' ? (
                  b.cancellation_status === 'finalized_cancelled' && b.platform_decision ? (
                    <div className="space-y-0.5">
                      <Badge className="bg-rose-100 text-rose-700 border border-rose-300" title={b.platform_decision.reason || ''}>⚖️ ملغى بقرار معراج النهائي</Badge>
                      <div className="text-[9px] text-slate-500 leading-4 max-w-[200px]">
                        استرداد للمشتري {fmt(b.platform_decision.refund_amount || 0, b.currency)} • تعويض مكتبك {fmt(b.platform_decision.seller_compensation || 0, b.currency)}{(b.platform_decision.platform_adjustment || 0) > 0 ? ` • منصة ${fmt(b.platform_decision.platform_adjustment || 0, b.currency)}` : ''}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <Badge className="bg-rose-100 text-rose-700 border border-rose-200">
                        ⛔ تم إلغاء الطلب
                      </Badge>
                      <div className="text-[9px] text-slate-500">
                        ألغاه المشتري قبل اعتماد المكتب
                      </div>
                    </div>
                  )
                )
                  : b.status === 'approved' ? (
                    b.cancellation_status === 'requested' ? (
                      <div className="space-y-1">
                        <Badge className="bg-orange-100 text-orange-700 border border-orange-300">📩 طلب إلغاء من معراج</Badge>
                        {b.cancellation_reason && <div className="text-[9px] text-slate-500 max-w-[180px]">السبب: {b.cancellation_reason}</div>}
                        <div className="space-y-1">
                          <Button size="sm" onClick={() => openPosition(b)} disabled={posBusy} className="h-7 px-2.5 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white">⚖️ تقديم موقف المكتب والأدلة</Button>
                          <div className="text-[9px] text-indigo-600">القرار النهائي حصراً لدى السوبر أدمن في معراج</div>
                        </div>
                      </div>
                    ) : b.cancellation_status === 'position_submitted' ? (
                      <div className="space-y-0.5">
                        <Badge className="bg-indigo-100 text-indigo-700 border border-indigo-300">⚖️ الموقف مُقدَّم — بانتظار قرار معراج</Badge>
                        {b.meraaj_cancellation_position && (
                          <div className="text-[9px] text-slate-500 leading-4" title={b.meraaj_cancellation_position.notes || ''}>
                            {b.meraaj_cancellation_position.position === 'objection' ? '✋ اعتراض' : '🤝 لا اعتراض'} • تكاليف منفذة {fmt(b.meraaj_cancellation_position.actual_costs_total || 0, b.currency)} • {(b.meraaj_cancellation_position.executed_services || []).length} خدمة
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge className="bg-emerald-100 text-emerald-700">✅ معتمد</Badge>
                        {b.cancellation_status === 'rejected' && <Badge className="bg-slate-100 text-slate-500 text-[9px]" title={b.cancellation_reject_reason || ''}>🛡️ رُفض طلب إلغاء سابق</Badge>}
                        {b.cancellation_status === 'rejected_by_platform' && <Badge className="bg-indigo-50 text-indigo-600 text-[9px] border border-indigo-200" title={b.platform_decision?.reason || ''}>🛡️ أبقت معراج الحجز</Badge>}
                      </div>
                    )
                  )
                  : b.status === 'rejected' ? <Badge className="bg-slate-200 text-slate-600" title={b.reject_reason}>🚫 مرفوض</Badge>
                  : b.status === 'approving' ? <Badge className="bg-blue-100 text-blue-600">⏳ قيد الاعتماد...</Badge>
                  : <div className="flex items-center gap-1">
                      <Badge className="bg-blue-100 text-blue-700">🔵 جديد</Badge>
                      <Button size="sm" onClick={() => approveBooking(b)} disabled={approving === b.id} className="h-6 px-2 text-[10px] grad-green text-white">{approving === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '✅ اعتماد'}</Button>
                      <Button size="sm" variant="outline" onClick={() => rejectBooking(b)} disabled={approving === b.id} className="h-6 px-2 text-[10px] border-rose-300 text-rose-600 hover:bg-rose-50">❌ رفض</Button>
                    </div>}
              </TableCell>
            </TableRow>))}</TableBody>
          </Table></CardContent></Card>
        )
      )}
      {/* v3.66 — passport completion dialog (fill-only) */}
      {passFor && (
        <Dialog open onOpenChange={() => setPassFor(null)}>
          <DialogContent className="max-w-md" onInteractOutside={e => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="text-base">🛂 استكمال جوازات «{passFor.buyer_office_name}»</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <div className="text-[11px] text-slate-500">تُعبّأ الجوازات الناقصة فقط — الجوازات المسجلة مسبقاً لا تتغير، ولا يتأثر أي حقل آخر أو حالة الاعتماد{passFor.booking_id ? '، وسيُحدَّث الحجز الفعلي المعتمد تلقائياً' : ''}.</div>
              {(passFor.registrants || []).map((r, idx) => String(r?.passport_no || '').trim() ? (
                <div key={idx} className="flex items-center justify-between bg-emerald-50/50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                  <span className="text-[11px] font-bold text-slate-700">{r.name} <span className="text-[9px] text-slate-400">({r.age} سنة)</span></span>
                  <span className="text-[10px] font-mono font-bold text-emerald-700">✓ {r.passport_no}</span>
                </div>
              ) : (
                <div key={idx} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  <span className="text-[11px] font-bold text-slate-700 flex-1 min-w-0 truncate">{r.name} <span className="text-[9px] text-slate-400">({r.age} سنة)</span></span>
                  <Input value={passInputs[idx] || ''} onChange={e => setPassInputs(m => ({ ...m, [idx]: e.target.value.toUpperCase() }))}
                    placeholder="رقم الجواز (A1234567)" dir="ltr" maxLength={15}
                    className="h-7 w-44 text-xs font-mono bg-white" />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                {/* v3.67 — paste/upload multi-passport import */}
                <Button variant="outline" size="sm" onClick={() => setImportOpen(o => !o)} className="ml-auto gap-1 text-[11px]">📋 لصق / رفع ملف</Button>
                <Button variant="outline" size="sm" onClick={() => setPassFor(null)}>إلغاء</Button>
                <Button size="sm" onClick={savePassports} disabled={passBusy} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                  {passBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '💾'} حفظ الجوازات
                </Button>
              </div>
              {importOpen && (
                <div className="bg-slate-50 border rounded-lg p-2.5 space-y-2">
                  <div className="text-[10px] text-slate-500 font-bold">الصق سطراً لكل مسافر بصيغة: <span className="font-mono bg-white border rounded px-1">الاسم ، رقم الجواز</span> — المطابقة بالاسم الكامل تماماً، ولن يُتخطى أي صف دون توضيح</div>
                  <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={3} dir="rtl"
                    placeholder={'فهد سالم ، B2222222\nنورة فهد ، C3333333'}
                    className="w-full text-xs font-mono border rounded-lg p-2 bg-white" />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={importFromText} className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700">مطابقة الملصق</Button>
                    <label className="h-7 inline-flex items-center gap-1 text-[10px] font-bold border rounded-md px-2 cursor-pointer bg-white hover:bg-slate-50">
                      📎 رفع ملف (Excel/CSV)
                      <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFromFile(f); e.target.value = '' }} />
                    </label>
                  </div>
                  {importResult && (
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      <div className="text-[10px] font-black">{importResult.matched > 0 ? `✅ تمت مطابقة ${importResult.matched} — اضغط «حفظ الجوازات» لاعتمادها` : '⚠️ لم تتم مطابقة أي صف'}</div>
                      {importResult.results.map((r, i) => (
                        <div key={i} className={`text-[10px] font-bold rounded px-2 py-0.5 ${r.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                          {r.ok ? '✓' : '✗'} {r.name} — {r.why}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* v3.67 — owner read-only passport report dialog */}
      {passReportOpen && (
        <Dialog open onOpenChange={() => setPassReportOpen(false)}>
          <DialogContent className="max-w-3xl" onInteractOutside={e => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="text-base">🛂 تقرير المسجّلين المعتمدين بلا جوازات</DialogTitle>
            </DialogHeader>
            {!passReport ? <div className="p-6 text-center text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline ml-1" /> جارٍ التحميل...</div> : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={passReportPkg} onChange={e => { setPassReportPkg(e.target.value); loadPassReport(e.target.value, passReportOffice) }} className="h-7 text-[11px] border rounded-md px-2 bg-white font-bold">
                    <option value="">كل الباكجات</option>
                    {(passReport.packages || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select value={passReportOffice} onChange={e => { setPassReportOffice(e.target.value); loadPassReport(passReportPkg, e.target.value) }} className="h-7 text-[11px] border rounded-md px-2 bg-white font-bold">
                    <option value="">كل المكاتب</option>
                    {(passReport.offices || []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <span className={`text-[11px] font-black rounded-full px-2.5 py-1 ${passReport.total_missing > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {passReport.total_missing > 0 ? `⚠️ ${passReport.total_missing} مسافر بلا جواز` : '✅ كل الجوازات مكتملة'}
                  </span>
                  <span className="text-[10px] text-slate-400">({passReport.scanned_bookings} حجز معتمد مفحوص)</span>
                  {/* v3.68 — export + WhatsApp reminder */}
                  <div className="flex items-center gap-1.5 mr-auto">
                    <Button size="sm" variant="outline" onClick={exportPassReport} className="h-7 text-[10px] gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet className="w-3 h-3" /> تصدير Excel</Button>
                    <Button size="sm" variant="outline" onClick={sendPassReminder} disabled={!passReportOffice}
                      title={passReportOffice ? `توليد رسالة تذكير لـ«${passReportOffice}»` : 'اختر مكتباً من الفلتر أولاً'}
                      className="h-7 text-[10px] gap-1 border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40">📱 تذكير واتساب</Button>
                  </div>
                </div>
                <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
                  {(passReport.rows || []).length === 0 ? <div className="p-6 text-center text-xs text-emerald-600 font-bold">✅ لا توجد جوازات ناقصة ضمن هذا النطاق</div> : (
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-xs">المسافر</TableHead><TableHead className="text-xs">العمر</TableHead><TableHead className="text-xs">الباكج</TableHead><TableHead className="text-xs">المكتب</TableHead><TableHead className="text-xs">مرجع معراج</TableHead><TableHead className="text-xs"></TableHead></TableRow></TableHeader>
                      <TableBody>{passReport.rows.map((r, i) => (<TableRow key={`${r.inbound_id}-${r.registrant_index}`} className={i % 2 ? 'bg-slate-50/50' : ''}>
                        <TableCell className="text-[11px] font-black">{r.name}</TableCell>
                        <TableCell className="text-[11px]">{r.age ?? '—'}</TableCell>
                        <TableCell className="text-[11px]">{r.package_name}</TableCell>
                        <TableCell className="text-[11px]">{r.office}</TableCell>
                        <TableCell className="text-[10px] font-mono">{r.booking_ref || '—'}</TableCell>
                        <TableCell>
                          {(() => {
                            const inb = (inbound || []).find(x => x.id === r.inbound_id)
                            return inb ? <Button size="sm" variant="outline" onClick={() => { setPassReportOpen(false); openPassports(inb) }} className="h-6 text-[10px] px-2 border-amber-300 text-amber-700 hover:bg-amber-50">🛂 استكمال</Button> : null
                          })()}
                        </TableCell>
                      </TableRow>))}</TableBody>
                    </Table>
                  )}
                </div>
                <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setPassReportOpen(false)}>إغلاق</Button></div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
      {/* v3.75 — ESCROW: office POSITION submission dialog (evidence + executed costs) */}
      {posFor && (
        <Dialog open onOpenChange={() => !posBusy && setPosFor(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onInteractOutside={e => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="text-base">⚖️ تقديم موقف المكتب — إلغاء حجز «{posFor.buyer_office_name}»</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-[11px] text-indigo-800 leading-5">
                القرار المالي النهائي (استرداد كلي/جزئي/إبقاء الحجز) تصدره <b>إدارة معراج</b> بناءً على موقفك والأدلة المرفقة — لن يتغير أي شيء مالياً أو تشغيلياً في نظامك الآن.
                <div className="mt-1 text-[10px] text-indigo-600">الحجز: {posFor.package_name} • {posFor.seats} مقاعد • {fmt(posFor.total_price || 0, posFor.currency)} • مرجع {posFor.meraaj_booking_ref || '—'}{posFor.cancellation_reason ? ` • سبب طلب الإلغاء: ${posFor.cancellation_reason}` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-700">موقف المكتب:</span>
                <button onClick={() => setPosVal('no_objection')} className={`text-xs font-bold rounded-lg border-2 px-3 py-1.5 transition ${posVal === 'no_objection' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>🤝 لا اعتراض على الإلغاء</button>
                <button onClick={() => setPosVal('objection')} className={`text-xs font-bold rounded-lg border-2 px-3 py-1.5 transition ${posVal === 'objection' ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>✋ اعتراض — نُفذت خدمات وتكاليف</button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700">الخدمات المنفذة فعلياً ({posServices.length}/30)</span>
                  <Button size="sm" variant="outline" onClick={addPosService} disabled={posServices.length >= 30} className="h-6 text-[10px] gap-1 border-indigo-300 text-indigo-700 hover:bg-indigo-50">＋ إضافة خدمة منفذة</Button>
                </div>
                {posServices.length === 0 && <div className="text-[10px] text-slate-400 border border-dashed rounded-lg p-3 text-center">لم تُضف خدمات منفذة — إن كان المكتب قد أصدر تأشيرات/تذاكر أو دفع تكاليف فعلية، أضفها هنا مع الأدلة لتُحتسب في قرار معراج</div>}
                {posServices.map((s, i) => (
                  <div key={i} className="border rounded-lg p-2.5 bg-slate-50/60 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select value={s.type} onChange={e => updPosService(i, { type: e.target.value })} className="h-7 text-[11px] border rounded-md px-1.5 bg-white font-bold">
                        {Object.entries(POS_SVC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <select value={s.status} onChange={e => updPosService(i, { status: e.target.value })} className="h-7 text-[11px] border rounded-md px-1.5 bg-white font-bold">
                        {Object.entries(POS_SVC_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <Input value={s.ref} onChange={e => updPosService(i, { ref: e.target.value })} placeholder="مرجع (رقم تأشيرة/تذكرة)" className="h-7 w-40 text-[11px] bg-white" maxLength={120} />
                      <div className="flex items-center gap-1">
                        <Input type="number" min="0" step="0.01" value={s.cost} onChange={e => updPosService(i, { cost: e.target.value })} placeholder="التكلفة" className="h-7 w-24 text-[11px] bg-white font-bold" dir="ltr" />
                        <span className="text-[10px] font-bold text-slate-400">{posFor.currency}</span>
                      </div>
                      <button onClick={() => delPosService(i)} className="text-rose-500 hover:text-rose-700 text-xs font-black px-1 mr-auto" title="حذف الخدمة">✕</button>
                    </div>
                    <Input value={s.note} onChange={e => updPosService(i, { note: e.target.value })} placeholder="ملاحظة على الخدمة (اختياري)" className="h-7 text-[11px] bg-white" maxLength={300} />
                    <div className="space-y-1">
                      {(s.evidence || []).map((ev, j) => (
                        ev.kind === 'file_ref' ? (
                          <div key={j} className="flex items-center gap-1.5 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-1">
                            <span className="text-[10px] font-bold text-indigo-700 truncate flex-1">📎 {ev.label || 'ملف دليل'}</span>
                            <button onClick={() => window.open(`/api/meraaj/booking-documents/${ev.value}/download`, '_blank')} className="text-[10px] font-bold text-indigo-600 hover:underline">عرض</button>
                            <button onClick={() => delPosEvidence(i, j)} className="text-rose-400 hover:text-rose-600 text-xs px-1">✕</button>
                          </div>
                        ) : (
                          <div key={j} className="flex items-center gap-1.5">
                            <Input value={ev.value} onChange={e => updPosEvidence(i, j, { value: e.target.value })} placeholder="https://... رابط الدليل (صورة تأشيرة/إيصال)" dir="ltr" className="h-7 flex-1 text-[10px] font-mono bg-white" maxLength={500} />
                            <Input value={ev.label} onChange={e => updPosEvidence(i, j, { label: e.target.value })} placeholder="وصف الدليل" className="h-7 w-32 text-[10px] bg-white" maxLength={120} />
                            <button onClick={() => delPosEvidence(i, j)} className="text-rose-400 hover:text-rose-600 text-xs px-1">✕</button>
                          </div>
                        )
                      ))}
                      <div className="flex items-center gap-3">
                        <button onClick={() => addPosEvidence(i)} disabled={(s.evidence || []).length >= 10} className="text-[10px] font-bold text-indigo-600 hover:underline disabled:opacity-40">🔗 إضافة رابط دليل ({(s.evidence || []).length}/10)</button>
                        <label className={`text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer ${(s.evidence || []).length >= 10 || posBusy ? 'opacity-40 pointer-events-none' : ''}`}>
                          📎 رفع ملف دليل (PDF/صورة)
                          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => { if (e.target.files?.length) uploadEvidenceFile(i, e.target.files); e.target.value = '' }} />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
                {posServices.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5">
                    <span className="text-[11px] font-black text-amber-800">إجمالي التكاليف المنفذة (يُحتسب نهائياً في الخادم):</span>
                    <span className="text-sm font-black text-amber-900" dir="ltr">{posTotal.toLocaleString('en-US')} {posFor.currency}</span>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs font-black text-slate-700">ملاحظات لإدارة معراج (اختياري)</Label>
                <Textarea value={posNotes} onChange={e => setPosNotes(e.target.value.slice(0, 1000))} rows={2} placeholder="أي تفاصيل إضافية تدعم موقف المكتب..." className="mt-1 text-xs" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setPosFor(null)} disabled={posBusy}>إلغاء</Button>
                <Button size="sm" onClick={submitPosition} disabled={posBusy} className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white">
                  {posBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '⚖️'} تقديم الموقف لإدارة معراج
                </Button>
              </div>
              <div className="text-[10px] text-slate-400 text-center">بعد التقديم لا يمكن تعديل الموقف — بانتظار قرار إدارة معراج النهائي الذي سيُنفَّذ تلقائياً</div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* PREMIUM BOOKING DOCUMENTS WORKSPACE — inline image/PDF preview */}
      {docsFor && (() => {
        const selectedDoc = docsList.find(d => d.id === docSelectedId) || docsList[0] || null
        const selectedUrl = docPendingUrl || bookingDocUrl(selectedDoc)
        const selectedIsPdf = isPdfDoc(selectedDoc, docPending)
        const regs = docsFor.registrants || []
        const selectedReg = regs[docReg] || null
        const selectedName = docPending ? (selectedReg?.name || selectedReg?.full_name || `مسافر ${docReg + 1}`) : (selectedDoc?.registrant_name || selectedReg?.name || selectedReg?.full_name || '—')
        const selectedPassport = docPending ? (selectedReg?.passport_no || '—') : (selectedDoc?.passport_no || selectedReg?.passport_no || '—')
        const selectedFilename = docPending?.name || selectedDoc?.filename || selectedDoc?.label || '—'
        const selectedSource = docPending ? 'من المكتب — قبل الرفع' : (selectedDoc?.source === 'meraaj' ? 'من معراج' : 'من المكتب')
        return (
        <Dialog open onOpenChange={() => { if (!docsBusy) { clearPendingDoc(); setDocsFor(null) } }}>
          <DialogContent className="max-w-[1180px] w-[96vw] h-[90vh] max-h-[90vh] p-0 overflow-hidden rounded-2xl border border-slate-200 shadow-2xl bg-white" onInteractOutside={e => e.preventDefault()}>
            <div className="h-full min-h-0 flex flex-col overflow-hidden" dir="rtl">
              {/* Header */}
              <div className="px-5 py-2.5 border-b bg-white flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">🛂</div>
                    <div>
                      <DialogTitle className="text-xl font-black text-slate-900">مستندات الحجز</DialogTitle>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-bold text-blue-700">{docsFor.buyer_office_name || '—'}</span>
                        <span>مرجع معراج:</span>
                        <span className="font-mono" dir="ltr">{docsFor.meraaj_booking_ref || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={() => { clearPendingDoc(); setDocsFor(null) }} disabled={docsBusy} className="w-9 h-9 rounded-full border bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500 text-xl" title="إغلاق">×</button>
              </div>

              {/* Selectors + upload */}
              <div className="px-5 py-2 border-b bg-slate-50/60 grid lg:grid-cols-3 gap-2.5 shrink-0">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 mb-1.5">نوع المستند</div>
                  <select value={docTypeB} onChange={e => setDocTypeB(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-blue-200">
                    {Object.entries(BK_DOC_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 mb-1.5">اختر المسافر</div>
                  <select value={docReg} onChange={e => setDocReg(Number(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-blue-200">
                    {(regs.length ? regs : [{ name: 'المسافر 1' }]).map((r,i) => <option key={i} value={i}>{r.name || r.full_name || `مسافر ${i + 1}`}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 mb-1.5">إضافة مستند</div>
                  <label className={`h-9 w-full rounded-lg border-2 border-dashed ${docPending ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50'} flex items-center justify-center gap-2 text-sm font-black cursor-pointer transition ${docsBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="w-4 h-4" /> {docPending ? 'تغيير الملف المختار' : 'اختيار صورة أو PDF'}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      multiple
                      className="hidden"
                      onChange={e => {
                        selectBookingDocs(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
                {docPendingFiles.length > 0 && (
                      <div className="lg:col-span-3 rounded-lg border bg-white px-3 py-2 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                          <span className="font-bold text-blue-700">
                            تم اختيار {docPendingFiles.length} {docPendingFiles.length === 1 ? 'ملف' : 'ملفات'} — ستُرفع جميعها
                          </span>
                          <span className="text-slate-500">
                            الإجمالي: {(docPendingFiles.reduce((s, f) => s + (f?.size || 0), 0) / 1024 / 1024).toFixed(1)}MB من {DOC_BATCH_MAX_MB}MB
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (docPendingFiles.reduce((s, f) => s + (f?.size || 0), 0) / DOC_BATCH_MAX_BYTES) * 100
                                )
                              )}%`
                            }}
                          />
                        </div>
                        <div className="text-[9px] text-slate-500">
                          المتبقي: {(
                            Math.max(
                              0,
                              DOC_BATCH_MAX_BYTES - docPendingFiles.reduce((s, f) => s + (f?.size || 0), 0)
                            ) / 1024 / 1024
                          ).toFixed(1)}MB
                        </div>
                      </div>
                    )}
                    {docUploadProgress.total > 0 && (
                      <div className="text-[10px] font-bold text-indigo-700">
                        جارٍ رفع {docUploadProgress.current} من {docUploadProgress.total}
                      </div>
                    )}
                    {docPending && (
                  <div className="lg:col-span-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-emerald-800">✓ معاينة قبل الرفع</div>
                      <div className="text-[10px] text-emerald-700 truncate" dir="ltr">{docPending.name} • {(docPending.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={clearPendingDoc} disabled={docsBusy} className="h-8">إلغاء</Button>
                      <Button size="sm" onClick={() => uploadBookingDoc()} disabled={docsBusy} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white">{docsBusy ? 'جارٍ الرفع...' : 'تأكيد الرفع'}</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Toolbar */}
              <div className="px-5 py-1.5 border-b bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setDocZoom(z => Math.min(2, +(z + .15).toFixed(2)))} className="h-7 px-2.5 rounded-lg border hover:bg-slate-50 text-[11px] font-bold">＋ تكبير</button>
                  <button onClick={() => setDocZoom(z => Math.max(.55, +(z - .15).toFixed(2)))} className="h-7 px-2.5 rounded-lg border hover:bg-slate-50 text-[11px] font-bold">－ تصغير</button>
                  <button onClick={() => setDocZoom(1)} className="h-7 px-2.5 rounded-lg border hover:bg-slate-50 text-[11px] font-bold">⛶ ملاءمة</button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button disabled={!selectedUrl} onClick={() => printBookingDoc(selectedUrl)} className="h-8 px-3 rounded-lg border hover:bg-slate-50 text-xs font-bold disabled:opacity-40 flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> طباعة</button>
                  <button disabled={!selectedUrl} onClick={() => downloadBookingDoc(selectedUrl, selectedFilename)} className="h-8 px-3 rounded-lg border hover:bg-slate-50 text-xs font-bold disabled:opacity-40 flex items-center gap-1"><Download className="w-3.5 h-3.5" /> تنزيل</button>
                </div>
              </div>

              {/* Main workspace */}
              <div className="flex-1 min-h-0 overflow-auto overscroll-contain grid xl:grid-cols-[220px_minmax(0,1fr)_230px] lg:grid-cols-[200px_minmax(0,1fr)] bg-slate-50/70">
                {/* Metadata */}
                <aside className="border-l bg-white p-3 order-3 xl:order-1 self-start">
                  <div className="text-xs font-black text-slate-800 mb-3">معلومات المستند</div>
                  <div className="space-y-3 text-[11px]">
                    <div><div className="text-slate-400">اسم المسافر</div><div className="font-black text-slate-800 mt-0.5">{selectedName}</div></div>
                    <div><div className="text-slate-400">رقم جواز السفر</div><div className="font-mono font-black text-indigo-700 mt-0.5" dir="ltr">{selectedPassport}</div></div>
                    <div><div className="text-slate-400">اسم المستند</div><div className="font-bold text-slate-700 mt-0.5 break-all" dir="ltr">{selectedFilename}</div></div>
                    <div><div className="text-slate-400">المصدر</div><Badge className="mt-1 bg-violet-100 text-violet-700 border-0">{selectedSource}</Badge></div>
                    <div><div className="text-slate-400">مرجع الحجز</div><div className="font-mono text-slate-600 mt-0.5 break-all" dir="ltr">{docsFor.meraaj_booking_ref || '—'}</div></div>
                  </div>
                  <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] leading-5 text-emerald-800">
                    <div className="font-black">🛡️ يرجى مطابقة رقم جواز السفر</div>
                    <div>مع بيانات الوثيقة قبل اعتماد الحجز.</div>
                  </div>
                </aside>

                {/* Viewer */}
                <main className="min-w-0 p-3 lg:p-4 order-1 xl:order-2">
                  <div className="min-h-[520px] rounded-2xl border bg-slate-200/60 overflow-visible flex items-start justify-center relative shadow-inner">
                    {!selectedUrl ? (
                      <div className="text-center text-slate-400">
                        <div className="text-5xl mb-3">📄</div>
                        <div className="font-bold">اختر مستنداً للمعاينة</div>
                        <div className="text-xs mt-1">يمكن عرض الصور وملفات PDF داخل رحّال</div>
                      </div>
                    ) : selectedIsPdf ? (
                      <iframe title="Document preview" src={selectedUrl} className="bg-white border-0 shadow-xl rounded-lg" style={{ width: `${100 / docZoom}%`, height: `${100 / docZoom}%`, minHeight: '620px', transform: `scale(${docZoom})`, transformOrigin: 'center center' }} />
                    ) : (
                      <img src={selectedUrl} alt="معاينة المستند" className="max-w-none rounded-lg shadow-xl bg-white" style={{ width: `${Math.round(docZoom * 88)}%`, objectFit: 'contain' }} />
                    )}
                  </div>
                </main>

                {/* Attachments list */}
                <aside className="border-r bg-white p-3 order-2 xl:order-3 lg:col-span-2 xl:col-span-1 self-start">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-black text-slate-800">المستندات المرفقة</div>
                    <Badge className="bg-slate-100 text-slate-600 border-0">{docsList.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {docsList.length === 0 && <div className="text-[11px] text-center text-slate-400 border border-dashed rounded-xl p-5">لا توجد مستندات بعد</div>}
                    {docsList.map((d, i) => {
                      const active = !docPending && (selectedDoc?.id === d.id)
                      return (
                        <button key={d.id || i} onClick={() => { clearPendingDoc(); setDocSelectedId(d.id); setDocZoom(1) }} className={`w-full rounded-xl border p-3 text-start transition ${active ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:bg-slate-50'}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{isPdfDoc(d) ? 'PDF' : '🖼️'}</div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-black text-slate-800 truncate">{BK_DOC_LABELS[d.doc_type] || d.label || 'مستند'}</div>
                              <div className="text-[9px] text-slate-400 truncate" dir="ltr">{d.filename || d.label || '—'}</div>
                              {d.passport_no && <div className="text-[9px] font-mono text-indigo-600 mt-0.5" dir="ltr">Passport: {d.passport_no}</div>}
                            </div>
                            {active && <span className="text-emerald-600 text-sm">●</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </aside>
              </div>

              <div className="px-6 py-3 border-t bg-blue-50/70 text-[10px] text-blue-700 flex items-center justify-center text-center shrink-0">
                ℹ️ تأكد من مطابقة بيانات الجواز مع بيانات المسافر قبل اعتماد الحجز وإرساله إلى معراج.
              </div>
            </div>
          </DialogContent>
        </Dialog>
        )
      })()}
      {view === 'events' && (
        events.length === 0 ? <Card><CardContent className="p-8 text-center text-slate-400 text-sm">لا توجد أحداث مزامنة بعد — تُسجل هنا كل التحديثات الصادرة لمعراج (Outbox)</CardContent></Card> : (
          <Card><CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>الوقت</TableHead><TableHead>الحدث</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader>
            <TableBody>{events.map(ev => (<TableRow key={ev.id}>
              <TableCell className="text-xs whitespace-nowrap">{new Date(ev.created_at).toLocaleString('en-GB')}</TableCell>
              <TableCell className="text-xs">{EVT_LABELS[ev.type] || ev.type}</TableCell>
              <TableCell><Badge className={ev.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : ev.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}>{ev.status === 'sent' ? '✅ أُرسل' : ev.status === 'failed' ? '⚠️ فشل' : '⏳ بانتظار ربط معراج'}</Badge></TableCell>
            </TableRow>))}</TableBody>
          </Table></CardContent></Card>
        )
      )}
      {/* v3.69 — UNIFIED ALERTS CENTER (owner only) */}
      {view === 'alerts' && isOwner && (
        !alertsCenter ? <Card><CardContent className="p-8 text-center text-slate-400 text-sm">جارٍ تحميل التنبيهات...</CardContent></Card> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-black text-slate-700">🔔 مركز التنبيهات الموحد — كل التحذيرات التشغيلية في مكان واحد</div>
              <div className="flex items-center gap-2">
                {/* v3.71 — daily WhatsApp digest reminder time */}
                <div className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1" title="عند هذا الوقت يومياً سيظهر تذكير بإرسال الملخص عبر واتساب (أثناء فتح النظام)">
                  <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">⏰ تذكير يومي:</span>
                  <Input type="time" value={reminderVal} onChange={e => setReminderVal(e.target.value)} className="h-6 w-24 text-xs font-bold" />
                  <Button size="sm" onClick={saveReminder} className="h-6 text-[10px] px-2">حفظ</Button>
                  {reminderVal && <button onClick={() => { setReminderVal(''); api('/meraaj/settings', { method: 'POST', body: { digest_reminder_time: '' } }).then(r => { setConfig(c => ({ ...c, digest_reminder_time: '' })); toast.success('🔕 تم تعطيل التذكير') }).catch(e => toast.error(e.message)) }} className="text-[10px] text-rose-500 hover:underline font-bold">إيقاف</button>}
                </div>
                <Button size="sm" onClick={shareAlertsWhatsApp} className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700">💬 مشاركة واتساب</Button>
                <Button size="sm" variant="outline" onClick={loadAlertsCenter} className="h-7 text-xs gap-1"><RefreshCw className="w-3 h-3" /> تحديث</Button>
              </div>
            </div>
            {/* v3.73 — OPERATIONS (need action) separated from SYNC DIAGNOSTICS */}
            <div className="text-[10px] font-black text-slate-500 mt-1">🎯 يحتاج إجراء تشغيلي</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Card className={(alertsCenter.counts?.pending_bookings || 0) > 0 ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${(alertsCenter.counts?.pending_bookings || 0) > 0 ? 'text-blue-600' : 'text-slate-400'}`}>{alertsCenter.counts?.pending_bookings ?? 0}</div><div className="text-[10px] text-slate-500">📥 حجوزات بانتظار الاعتماد</div></CardContent></Card>
              <Card className={(alertsCenter.counts?.cancellation_requests || 0) > 0 ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${(alertsCenter.counts?.cancellation_requests || 0) > 0 ? 'text-orange-600' : 'text-slate-400'}`}>{alertsCenter.counts?.cancellation_requests ?? 0}</div><div className="text-[10px] text-slate-500">📩 طلبات إلغاء تحتاج موقف</div></CardContent></Card>
              <Card className={(alertsCenter.counts?.stale_pending || 0) > 0 ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${(alertsCenter.counts?.stale_pending || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{alertsCenter.counts?.stale_pending ?? 0}</div><div className="text-[10px] text-slate-500">⏰ طلبات تجاوزت 24 ساعة</div></CardContent></Card>
              <Card className={(alertsCenter.counts?.capacity_warnings || 0) > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${(alertsCenter.counts?.capacity_warnings || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{alertsCenter.counts?.capacity_warnings ?? 0}</div><div className="text-[10px] text-slate-500">💺 باكجات مقاعدها شبه ممتلئة</div></CardContent></Card>
              <Card className={(alertsCenter.counts?.missing_passports || 0) > 0 ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${(alertsCenter.counts?.missing_passports || 0) > 0 ? 'text-orange-600' : 'text-slate-400'}`}>{alertsCenter.counts?.missing_passports ?? 0}</div><div className="text-[10px] text-slate-500">🛂 جوازات ناقصة (معتمدة)</div></CardContent></Card>
            </div>
            <div className="text-[10px] font-black text-slate-500 mt-1">🩺 تشخيصات المزامنة (Sync Health)</div>
            <div className="grid grid-cols-3 gap-2">
              <Card className={(alertsCenter.counts?.failed_events || 0) > 0 ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${(alertsCenter.counts?.failed_events || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{alertsCenter.counts?.failed_events ?? 0}</div><div className="text-[10px] text-slate-500">📤 أحداث صادرة فاشلة</div></CardContent></Card>
              <Card className={(alertsCenter.counts?.price_mismatch_today || 0) > 0 ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${(alertsCenter.counts?.price_mismatch_today || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{alertsCenter.counts?.price_mismatch_today ?? 0}</div><div className="text-[10px] text-slate-500">💰 رفض لعدم تطابق السعر (اليوم)</div></CardContent></Card>
              <Card className={alertsCenter.reject_alert ? 'border-rose-400 bg-rose-50/60' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${alertsCenter.reject_alert ? 'text-rose-700' : 'text-slate-400'}`}>{alertsCenter.rejected_today ?? 0}</div><div className="text-[10px] text-slate-500">🚫 ويبهوك مرفوض اليوم{(alertsCenter.reject_alert_threshold || 0) > 0 ? ` (الحد ${alertsCenter.reject_alert_threshold})` : ''}</div></CardContent></Card>
            </div>
            {/* v3.71 — daily alerts history trend (snapshots written by each alerts-center load) */}
            {(alertsHistory?.rows || []).length > 0 && (() => {
              const rows = alertsHistory.rows
              const maxV = Math.max(1, ...rows.map(r => r.counts?.total || 0))
              return (
                <Card>
                  <CardHeader className="py-2 px-4 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm">📈 اتجاه التنبيهات اليومي — آخر {rows.length} {rows.length > 10 ? 'يوماً' : 'أيام'} <span className="text-[10px] font-normal text-slate-400">(لقطة تُحفظ تلقائياً كل يوم)</span></CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="flex gap-1.5 items-end justify-between" style={{ height: '90px' }}>
                      {rows.map(r => (
                        <div key={r.date} className="flex flex-col items-center justify-end h-full gap-0.5 flex-1">
                          <div className="text-[9px] font-bold text-slate-600">{r.counts?.total ?? 0}</div>
                          <div className={`w-full max-w-[28px] rounded-t ${(r.counts?.total || 0) === 0 ? 'bg-emerald-400/70' : (r.counts?.failed_events || 0) > 0 ? 'bg-rose-500/75' : 'bg-amber-500/80'}`} title={`${r.date}: ${r.counts?.total ?? 0} تنبيه (فاشلة: ${r.counts?.failed_events ?? 0} • معلقة: ${r.counts?.pending_bookings ?? 0} • سعة: ${r.counts?.capacity_warnings ?? 0} • جوازات: ${r.counts?.missing_passports ?? 0})`} style={{ height: `${Math.round(((r.counts?.total || 0) / maxV) * 100)}%`, minHeight: (r.counts?.total || 0) > 0 ? '4px' : '2px' }} />
                          <div className="text-[8px] text-slate-400 font-mono">{r.date.slice(5)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 justify-center mt-2 text-[9px] text-slate-500">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500/75 inline-block" /> يوجد أحداث فاشلة</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/80 inline-block" /> تنبيهات أخرى</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400/70 inline-block" /> يوم نظيف</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })()}
            {(alertsCenter.counts?.total || 0) === 0 ? (
              <Card className="border-emerald-200"><CardContent className="p-8 text-center"><div className="text-3xl mb-2">✅</div><div className="text-sm font-black text-emerald-700">كل شيء سليم — لا توجد تنبيهات تشغيلية حالياً</div></CardContent></Card>
            ) : (
              <div className="space-y-3">
                {alertsCenter.reject_alert && (
                  <div className="flex items-center gap-2 bg-rose-50 border-2 border-rose-300 rounded-xl p-2.5">
                    <span className="text-xl">🚨</span>
                    <div className="text-xs font-black text-rose-700">تحذير: {alertsCenter.rejected_today} ويبهوك مرفوض اليوم (الحد: {alertsCenter.reject_alert_threshold}) — تحقق من مفتاح الربط HMAC مع معراج</div>
                  </div>
                )}
                {(alertsCenter.counts?.failed_events || 0) > 0 && (
                  <Card className="border-rose-200">
                    <CardHeader className="py-2 px-4 flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm">📤 أحداث صادرة فاشلة ({alertsCenter.counts.failed_events})</CardTitle>
                      <div className="flex items-center gap-1.5">
                        {retryAll?.running && <span className="text-[10px] font-bold text-amber-600">جارٍ إعادة المحاولة... {retryAll.processed}/{retryAll.total ?? '؟'}</span>}
                        <Button size="sm" onClick={async () => { await runRetryAll(); loadAlertsCenter() }} disabled={retryAll?.running} className="h-6 text-[10px] px-2 gap-1 bg-rose-600 hover:bg-rose-700">{retryAll?.running ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} إعادة محاولة الكل</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0"><Table>
                      <TableHeader><TableRow><TableHead className="text-xs">الوقت</TableHead><TableHead className="text-xs">الحدث</TableHead><TableHead className="text-xs">محاولات</TableHead><TableHead className="text-xs">آخر خطأ</TableHead></TableRow></TableHeader>
                      <TableBody>{(alertsCenter.failed_events || []).map(ev => (<TableRow key={ev.id} className="bg-rose-50/30">
                        <TableCell className="text-[10px] whitespace-nowrap">{new Date(ev.created_at).toLocaleString('en-GB')}</TableCell>
                        <TableCell className="text-[11px]">{EVT_LABELS[ev.type] || ev.type}</TableCell>
                        <TableCell className="text-[11px] font-mono">{ev.attempts ?? 0}</TableCell>
                        <TableCell className="text-[10px] text-rose-600 max-w-[220px] truncate" title={ev.last_error || ''}>{ev.last_error || '—'}</TableCell>
                      </TableRow>))}</TableBody>
                    </Table></CardContent>
                  </Card>
                )}
                {(alertsCenter.counts?.pending_bookings || 0) > 0 && (
                  <Card className="border-blue-200">
                    <CardHeader className="py-2 px-4 flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm">📥 حجوزات بانتظار الاعتماد ({alertsCenter.counts.pending_bookings})</CardTitle>
                      <Button size="sm" variant="outline" onClick={() => setView('bookings')} className="h-6 text-[10px] px-2 border-blue-300 text-blue-700 hover:bg-blue-50">فتح الحجوزات ←</Button>
                    </CardHeader>
                    <CardContent className="p-0"><Table>
                      <TableHeader><TableRow><TableHead className="text-xs">التاريخ</TableHead><TableHead className="text-xs">الباكج</TableHead><TableHead className="text-xs">المكتب</TableHead><TableHead className="text-xs">مقاعد</TableHead><TableHead className="text-xs">الإجمالي</TableHead></TableRow></TableHeader>
                      <TableBody>{(alertsCenter.pending_bookings || []).map(b => (<TableRow key={b.id}>
                        <TableCell className="text-[10px] whitespace-nowrap">{new Date(b.created_at).toLocaleDateString('en-GB')}</TableCell>
                        <TableCell className="text-[11px] font-bold">{b.package_name}</TableCell>
                        <TableCell className="text-[11px]">{b.buyer_office_name || '—'}</TableCell>
                        <TableCell className="text-[11px]">{b.seats}</TableCell>
                        <TableCell className="text-[11px] font-mono">{(Number(b.total_price) || 0).toLocaleString('en-US')} {b.currency}</TableCell>
                      </TableRow>))}</TableBody>
                    </Table></CardContent>
                  </Card>
                )}
                {(alertsCenter.counts?.cancellation_requests || 0) > 0 && (
                  <Card className="border-orange-300">
                    <CardHeader className="py-2 px-4 flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm">📩 طلبات إلغاء حجوزات معتمدة ({alertsCenter.counts.cancellation_requests}) — تحتاج قرارك</CardTitle>
                      <Button size="sm" variant="outline" onClick={() => setView('bookings')} className="h-6 text-[10px] px-2 border-orange-300 text-orange-700 hover:bg-orange-50">اتخاذ القرار ←</Button>
                    </CardHeader>
                    <CardContent className="p-0"><Table>
                      <TableHeader><TableRow><TableHead className="text-xs">تاريخ الطلب</TableHead><TableHead className="text-xs">الباكج</TableHead><TableHead className="text-xs">المكتب</TableHead><TableHead className="text-xs">مقاعد</TableHead><TableHead className="text-xs">المبلغ</TableHead><TableHead className="text-xs">سبب الإلغاء</TableHead></TableRow></TableHeader>
                      <TableBody>{(alertsCenter.cancellation_requests || []).map(b => (<TableRow key={b.id} className="bg-orange-50/30">
                        <TableCell className="text-[10px] whitespace-nowrap">{b.cancellation_requested_at ? new Date(b.cancellation_requested_at).toLocaleString('en-GB') : '—'}</TableCell>
                        <TableCell className="text-[11px] font-bold">{b.package_name}</TableCell>
                        <TableCell className="text-[11px]">{b.buyer_office_name || '—'}</TableCell>
                        <TableCell className="text-[11px]">{b.seats}</TableCell>
                        <TableCell className="text-[11px] font-mono">{(Number(b.total_price) || 0).toLocaleString('en-US')} {b.currency}</TableCell>
                        <TableCell className="text-[10px] text-orange-600 max-w-[180px] truncate" title={b.cancellation_reason || ''}>{b.cancellation_reason || '—'}</TableCell>
                      </TableRow>))}</TableBody>
                    </Table></CardContent>
                  </Card>
                )}
                {(alertsCenter.counts?.capacity_warnings || 0) > 0 && (
                  <Card className="border-amber-200">
                    <CardHeader className="py-2 px-4"><CardTitle className="text-sm">💺 تحذيرات سعة المقاعد ({alertsCenter.counts.capacity_warnings}) <span className="text-[10px] font-normal text-slate-400">— اضغط «+5 مقاعد» للتعبئة الفورية وإشعار معراج</span></CardTitle></CardHeader>
                    <CardContent className="p-0"><Table>
                      <TableHeader><TableRow><TableHead className="text-xs">الباكج</TableHead><TableHead className="text-xs">المخصص</TableHead><TableHead className="text-xs">المباع</TableHead><TableHead className="text-xs">المتبقي</TableHead><TableHead className="text-xs">الامتلاء</TableHead><TableHead className="text-xs"></TableHead></TableRow></TableHeader>
                      <TableBody>{(alertsCenter.capacity_warnings || []).map(w => (<TableRow key={w.id} className={w.remaining <= 1 ? 'bg-rose-50/40' : 'bg-amber-50/30'}>
                        <TableCell className="text-[11px] font-bold">{w.name}</TableCell>
                        <TableCell className="text-[11px]">{w.seats_allocated}</TableCell>
                        <TableCell className="text-[11px]">{w.seats_sold}</TableCell>
                        <TableCell className={`text-[11px] font-black ${w.remaining <= 1 ? 'text-rose-600' : 'text-amber-600'}`}>{w.remaining}</TableCell>
                        <TableCell className="text-[11px] font-mono">{w.pct}%</TableCell>
                        <TableCell><Button size="sm" onClick={() => alertsRefill(w)} disabled={alertRefillBusy === w.id} className="h-6 text-[10px] px-2 gap-1 bg-amber-600 hover:bg-amber-700">{alertRefillBusy === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '➕'} +5 مقاعد</Button></TableCell>
                      </TableRow>))}</TableBody>
                    </Table></CardContent>
                  </Card>
                )}
                {(alertsCenter.counts?.missing_passports || 0) > 0 && (
                  <Card className="border-orange-200">
                    <CardHeader className="py-2 px-4 flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm">🛂 جوازات ناقصة في حجوزات معتمدة ({alertsCenter.counts.missing_passports})</CardTitle>
                      <Button size="sm" variant="outline" onClick={openPassReport} className="h-6 text-[10px] px-2 border-orange-300 text-orange-700 hover:bg-orange-50">التقرير الكامل ←</Button>
                    </CardHeader>
                    <CardContent className="p-0"><Table>
                      <TableHeader><TableRow><TableHead className="text-xs">المسافر</TableHead><TableHead className="text-xs">الباكج</TableHead><TableHead className="text-xs">المكتب المشتري</TableHead></TableRow></TableHeader>
                      <TableBody>{(alertsCenter.missing_passports?.sample || []).map((r, i) => (<TableRow key={i}>
                        <TableCell className="text-[11px] font-bold">{r.name}</TableCell>
                        <TableCell className="text-[11px]">{r.package_name}</TableCell>
                        <TableCell className="text-[11px]">{r.office}</TableCell>
                      </TableRow>))}</TableBody>
                    </Table>
                    {(alertsCenter.missing_passports?.total || 0) > (alertsCenter.missing_passports?.sample || []).length && <div className="p-2 text-center text-[10px] text-slate-400">و {(alertsCenter.missing_passports.total - alertsCenter.missing_passports.sample.length)} آخرون — افتح التقرير الكامل</div>}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )
      )}
      {/* v3.69 — OFFICE PERFORMANCE COMPARISON month-over-month (owner only) */}
      {view === 'comparison' && isOwner && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-black text-slate-700">📊 مقارنة أداء المكاتب — شهر مقابل شهر (صافي لك بعد العمولة)</div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1">
                <Input type="month" value={compMonth} onChange={e => setCompMonth(e.target.value)} className="h-6 w-32 text-xs font-bold" />
                <Button size="sm" onClick={() => loadComparison(compMonth)} disabled={compBusy} className="h-6 text-[10px] px-2 gap-1">{compBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} عرض</Button>
              </div>
              <Button size="sm" onClick={exportComparison} disabled={!comparison || (comparison.offices || []).length === 0} className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"><FileSpreadsheet className="w-3 h-3" /> تصدير Excel</Button>
            </div>
          </div>
          {!comparison ? <Card><CardContent className="p-8 text-center text-slate-400 text-sm">{compBusy ? 'جارٍ تحميل المقارنة...' : 'اختر شهراً واضغط «عرض»'}</CardContent></Card> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Card className="border-emerald-200"><CardContent className="p-3 text-center"><div className="text-lg font-black text-emerald-700 font-mono">{(comparison.totals?.current?.net_to_seller ?? 0).toLocaleString('en-US')}</div><div className="text-[10px] text-slate-500">صافي {comparison.month} {comparison.totals?.current?.currency || ''}</div></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><div className="text-lg font-black text-slate-600 font-mono">{(comparison.totals?.previous?.net_to_seller ?? 0).toLocaleString('en-US')}</div><div className="text-[10px] text-slate-500">صافي {comparison.prev_month} {comparison.totals?.previous?.currency || ''}</div></CardContent></Card>
                <Card><CardContent className="p-3 text-center">{(() => {
                  const g = comparison.totals?.growth_pct
                  return <><div className={`text-lg font-black ${g === null ? 'text-blue-600' : g > 0 ? 'text-emerald-600' : g < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{g === null ? '🆕 جديد' : g > 0 ? `▲ ${g}%` : g < 0 ? `▼ ${Math.abs(g)}%` : '—'}</div><div className="text-[10px] text-slate-500">نمو الصافي</div></>
                })()}</CardContent></Card>
                <Card><CardContent className="p-3 text-center"><div className="text-lg font-black text-slate-700">{comparison.totals?.current?.bookings ?? 0} <span className="text-xs text-slate-400">/ {comparison.totals?.previous?.bookings ?? 0}</span></div><div className="text-[10px] text-slate-500">حجوزات (الحالي / السابق)</div></CardContent></Card>
              </div>
              {/* v3.71 — TOP OFFICE REWARD: monthly best-office highlight with its growth story */}
              {(comparison.offices || []).length > 0 && comparison.offices[0].current.net_to_seller > 0 && (() => {
                const top = comparison.offices[0]
                const gT = top.growth_pct
                const cur = top.current.net_to_seller.toLocaleString('en-US')
                const prv = top.previous.net_to_seller.toLocaleString('en-US')
                const ccy = top.current.currency || ''
                const story = gT === null
                  ? `انضم حديثاً وحقق صافي ${cur} ${ccy} من أول شهر! 🚀`
                  : gT > 0 ? `نما بنسبة ${gT}% — من ${prv} إلى ${cur} ${ccy} 📈`
                  : gT < 0 ? `حافظ على الصدارة بصافي ${cur} ${ccy} رغم تراجع ${Math.abs(gT)}%`
                  : `حافظ على مستواه الثابت بصافي ${cur} ${ccy}`
                const congrats = () => {
                  const msg = [
                    `🏆 *مكتب الشهر — ${comparison.month}*`, '',
                    `تهانينا «${top.office}»! 🎉`,
                    story,
                    `${top.current.bookings} حجز • ${top.current.seats} مقعد هذا الشهر`, '',
                    'شكراً لثقتكم وتعاملكم معنا عبر سوق معراج 🌟',
                    '— نظام رحّال ERP',
                  ].join('\n')
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
                }
                return (
                  <Card className="border-2 border-amber-300 bg-gradient-to-l from-amber-50 via-yellow-50/60 to-white">
                    <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="text-4xl">🏆</div>
                        <div>
                          <div className="text-[10px] font-black text-amber-600 tracking-wide">مكتب الشهر — {comparison.month}</div>
                          <div className="text-lg font-black text-slate-800">{top.office}</div>
                          <div className="text-xs font-bold text-slate-600 mt-0.5">{story}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{top.current.bookings} حجز • {top.current.seats} مقعد{gT !== null && gT > 0 ? ' • 🚀 في صعود مستمر' : ''}</div>
                        </div>
                      </div>
                      <Button size="sm" onClick={congrats} className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700">🎉 تهنئة عبر واتساب</Button>
                    </CardContent>
                  </Card>
                )
              })()}
              {/* v3.71 — 6-MONTH TREND CHART: net_to_seller per month, switchable per office/package */}
              {compTrend && (compTrend.months || []).length > 0 && (() => {
                const series = trendPick === '__total__' ? compTrend.totals?.net
                  : trendPick.startsWith('o:') ? (compTrend.offices || []).find(o => o.name === trendPick.slice(2))?.values
                  : (compTrend.packages || []).find(p => p.name === trendPick.slice(2))?.values
                const vals = series || compTrend.months.map(() => 0)
                const maxV = Math.max(1, ...vals)
                return (
                  <Card>
                    <CardHeader className="py-2 px-4 flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm">📈 اتجاه آخر {compTrend.months.length} أشهر — صافي لك {compTrend.currency || ''}</CardTitle>
                      <select value={trendPick} onChange={e => setTrendPick(e.target.value)} className="h-7 text-[11px] font-bold border rounded-lg px-2 bg-white cursor-pointer">
                        <option value="__total__">الإجمالي (الكل)</option>
                        {(compTrend.offices || []).map(o => <option key={`o:${o.name}`} value={`o:${o.name}`}>🏢 {o.name}</option>)}
                        {(compTrend.packages || []).map(p => <option key={`p:${p.name}`} value={`p:${p.name}`}>📦 {p.name}</option>)}
                      </select>
                    </CardHeader>
                    <CardContent className="p-3">
                      <div className="grid gap-2 items-end" style={{ height: '120px', gridTemplateColumns: `repeat(${compTrend.months.length}, 1fr)` }}>
                        {compTrend.months.map((m, i) => (
                          <div key={m} className="flex flex-col items-center justify-end h-full gap-0.5">
                            <div className="text-[9px] font-bold text-slate-600 font-mono">{(vals[i] || 0).toLocaleString('en-US')}</div>
                            <div className={`w-full max-w-[56px] rounded-t ${m === comparison.month ? 'bg-emerald-600' : 'bg-blue-500/70'}`} title={`${m}: صافي ${(vals[i] || 0).toLocaleString('en-US')} ${compTrend.currency || ''} • ${compTrend.totals?.bookings?.[i] ?? 0} حجز`} style={{ height: `${Math.round(((vals[i] || 0) / maxV) * 100)}%`, minHeight: (vals[i] || 0) > 0 ? '4px' : '2px' }} />
                            <div className="text-[9px] text-slate-400 font-mono">{m.slice(2)}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[9px] text-slate-400 text-center mt-1.5">العمود الأخضر = الشهر المختار • مرّر على الأعمدة لتفاصيل كل شهر</div>
                    </CardContent>
                  </Card>
                )
              })()}
              <Card>
                <CardHeader className="py-2 px-4"><CardTitle className="text-sm">🏢 المكاتب ({(comparison.offices || []).length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {(comparison.offices || []).length === 0 ? <div className="p-6 text-center text-xs text-slate-400">لا توجد حجوزات في الشهرين المختارين</div> : (
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-xs">المكتب</TableHead><TableHead className="text-xs">حجوزات {comparison.month}</TableHead><TableHead className="text-xs">مقاعد</TableHead><TableHead className="text-xs">إيراد {comparison.month}</TableHead><TableHead className="text-xs">صافي {comparison.month}</TableHead><TableHead className="text-xs">صافي {comparison.prev_month}</TableHead><TableHead className="text-xs">النمو</TableHead></TableRow></TableHeader>
                      <TableBody>{(comparison.offices || []).map((o, i) => (<TableRow key={o.office} className={i === 0 ? 'bg-amber-50/40' : ''}>
                        <TableCell className="text-[11px] font-black">{i === 0 && '🏆 '}{o.office}</TableCell>
                        <TableCell className="text-[11px]">{o.current.bookings}</TableCell>
                        <TableCell className="text-[11px]">{o.current.seats}</TableCell>
                        <TableCell className="text-[11px] font-mono">{o.current.revenue.toLocaleString('en-US')} {o.current.currency}</TableCell>
                        <TableCell className="text-[11px] font-mono text-emerald-700 font-bold">{o.current.net_to_seller.toLocaleString('en-US')}</TableCell>
                        <TableCell className="text-[11px] font-mono text-slate-500">{o.previous.net_to_seller.toLocaleString('en-US')}</TableCell>
                        <TableCell>{o.growth_pct === null ? <Badge className="bg-blue-100 text-blue-700 text-[9px]">🆕 جديد</Badge> : o.growth_pct > 0 ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">▲ {o.growth_pct}%</Badge> : o.growth_pct < 0 ? <Badge className="bg-rose-100 text-rose-700 text-[9px]">▼ {Math.abs(o.growth_pct)}%</Badge> : <Badge className="bg-slate-100 text-slate-500 text-[9px]">—</Badge>}</TableCell>
                      </TableRow>))}</TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              {/* v3.70 — month-over-month comparison per PACKAGE */}
              <Card>
                <CardHeader className="py-2 px-4"><CardTitle className="text-sm">📦 الباكجات ({(comparison.packages || []).length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {(comparison.packages || []).length === 0 ? <div className="p-6 text-center text-xs text-slate-400">لا توجد حجوزات على باكجات في الشهرين المختارين</div> : (
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-xs">الباكج</TableHead><TableHead className="text-xs">حجوزات {comparison.month}</TableHead><TableHead className="text-xs">مقاعد</TableHead><TableHead className="text-xs">إيراد {comparison.month}</TableHead><TableHead className="text-xs">صافي {comparison.month}</TableHead><TableHead className="text-xs">صافي {comparison.prev_month}</TableHead><TableHead className="text-xs">النمو</TableHead></TableRow></TableHeader>
                      <TableBody>{(comparison.packages || []).map((p, i) => (<TableRow key={p.name} className={i === 0 ? 'bg-amber-50/40' : ''}>
                        <TableCell className="text-[11px] font-black">{i === 0 && '🏆 '}{p.name}</TableCell>
                        <TableCell className="text-[11px]">{p.current.bookings}</TableCell>
                        <TableCell className="text-[11px]">{p.current.seats}</TableCell>
                        <TableCell className="text-[11px] font-mono">{p.current.revenue.toLocaleString('en-US')} {p.current.currency}</TableCell>
                        <TableCell className="text-[11px] font-mono text-emerald-700 font-bold">{p.current.net_to_seller.toLocaleString('en-US')}</TableCell>
                        <TableCell className="text-[11px] font-mono text-slate-500">{p.previous.net_to_seller.toLocaleString('en-US')}</TableCell>
                        <TableCell>{p.growth_pct === null ? <Badge className="bg-blue-100 text-blue-700 text-[9px]">🆕 جديد</Badge> : p.growth_pct > 0 ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">▲ {p.growth_pct}%</Badge> : p.growth_pct < 0 ? <Badge className="bg-rose-100 text-rose-700 text-[9px]">▼ {Math.abs(p.growth_pct)}%</Badge> : <Badge className="bg-slate-100 text-slate-500 text-[9px]">—</Badge>}</TableCell>
                      </TableRow>))}</TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
      {/* v3.57 — WEBHOOK HEALTH DASHBOARD (owner only) */}
      {view === 'health' && isOwner && (
        !health ? <Card><CardContent className="p-8 text-center text-slate-400 text-sm">جارٍ تحميل بيانات الصحة...</CardContent></Card> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-black text-slate-700">🩺 صحة مزامنة معراج — آخر الأحداث الواردة والمرفوضة والصادرة</div>
              <div className="flex items-center gap-2">
                {/* v3.62 — monthly Excel report */}
                <div className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1">
                  <Input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="h-6 w-32 text-xs font-bold" />
                  <Button size="sm" onClick={downloadMonthlyReport} disabled={reportBusy} className="h-6 text-[10px] px-2 gap-1 bg-emerald-600 hover:bg-emerald-700">{reportBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />} تقرير شهري</Button>
                </div>
                {/* v3.61 — daily rejected-webhooks alert threshold */}
                <div className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1">
                  <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">🚨 حد تنبيه الرفض/يوم:</span>
                  <Input type="number" min="0" max="1000" value={thresholdVal} onChange={e => setThresholdVal(e.target.value)} className="h-6 w-16 text-xs text-center font-black" title="0 = تعطيل التنبيه" />
                  <Button size="sm" onClick={saveThreshold} className="h-6 text-[10px] px-2">حفظ</Button>
                </div>
                <Button size="sm" variant="outline" onClick={() => api('/meraaj/webhook-health').then(setHealth).catch(e => toast.error(e.message))} className="h-7 text-xs gap-1"><RefreshCw className="w-3 h-3" /> تحديث</Button>
              </div>
            </div>
            {/* v3.61 — red banner when today's rejections reach the threshold */}
            {(Number(config?.reject_alert_threshold) || 0) > 0 && (health.stats?.rejected_24h || 0) >= Number(config.reject_alert_threshold) && (
              <div className="flex items-center gap-2 bg-rose-50 border-2 border-rose-300 rounded-xl p-2.5">
                <span className="text-xl">🚨</span>
                <div className="text-xs font-black text-rose-700">تحذير: {health.stats.rejected_24h} ويبهوك مرفوض خلال 24 ساعة (الحد: {config.reject_alert_threshold}) — تحقق من مفتاح الربط HMAC مع معراج</div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Card className="border-emerald-200"><CardContent className="p-3 text-center"><div className="text-2xl font-black text-emerald-700">{health.stats?.accepted_24h ?? 0}</div><div className="text-[10px] text-slate-500">✅ مقبولة (24 ساعة)</div></CardContent></Card>
              <Card className="border-emerald-100"><CardContent className="p-3 text-center"><div className="text-2xl font-black text-emerald-600">{health.stats?.accepted_7d ?? 0}</div><div className="text-[10px] text-slate-500">✅ مقبولة (7 أيام)</div></CardContent></Card>
              <Card className={(health.stats?.rejected_24h || 0) > 0 ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${(health.stats?.rejected_24h || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{health.stats?.rejected_24h ?? 0}</div><div className="text-[10px] text-slate-500">🚫 مرفوضة (24 ساعة)</div></CardContent></Card>
              <Card className={(health.stats?.outbound_failed_24h || 0) > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}><CardContent className="p-3 text-center"><div className={`text-2xl font-black ${(health.stats?.outbound_failed_24h || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{health.stats?.outbound_failed_24h ?? 0}</div><div className="text-[10px] text-slate-500">📤 صادرة فاشلة (24 ساعة)</div></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><div className="text-xs font-black text-slate-700 pt-1.5">{health.stats?.last_accepted_at ? new Date(health.stats.last_accepted_at).toLocaleString('en-GB') : '—'}</div><div className="text-[10px] text-slate-500 mt-1">🕐 آخر حجز وارد مقبول</div></CardContent></Card>
            </div>
            {/* v3.60 — 7-day accepted vs rejected trend chart */}
            {Array.isArray(health.trend) && health.trend.length > 0 && (() => {
              const maxV = Math.max(1, ...health.trend.map(t => Math.max(t.accepted, t.rejected)))
              const dayName = (ds) => new Date(ds + 'T12:00:00').toLocaleDateString('ar', { weekday: 'short' })
              return (
                <Card>
                  <CardHeader className="py-2 px-4 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm">📊 اتجاه آخر 7 أيام</CardTitle>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> مقبولة</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> مرفوضة</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="grid grid-cols-7 gap-2 items-end" style={{ height: '110px' }}>
                      {health.trend.map(t => (
                        <div key={t.date} className="flex flex-col items-center justify-end h-full gap-0.5">
                          <div className="flex items-end gap-0.5 flex-1 w-full justify-center">
                            <div className="w-3 rounded-t bg-emerald-500/80" title={`مقبولة: ${t.accepted}`} style={{ height: `${Math.round((t.accepted / maxV) * 100)}%`, minHeight: t.accepted > 0 ? '4px' : '1px' }} />
                            <div className="w-3 rounded-t bg-rose-500/80" title={`مرفوضة: ${t.rejected}`} style={{ height: `${Math.round((t.rejected / maxV) * 100)}%`, minHeight: t.rejected > 0 ? '4px' : '1px' }} />
                          </div>
                          <div className="text-[9px] font-bold text-slate-600">{t.accepted}<span className="text-slate-300 mx-0.5">/</span><span className="text-rose-500">{t.rejected}</span></div>
                          <div className="text-[9px] text-slate-400">{dayName(t.date)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })()}
            {/* v3.60 — Buyer office insights */}
            <Card>
              <CardHeader className="py-2 px-4"><CardTitle className="text-sm">🏢 أكثر المكاتب حجزاً عبر معراج ({(health.buyers || []).length}) <span className="text-[10px] font-normal text-slate-400">— انقر على مكتب لعرض كل حجوزاته</span></CardTitle></CardHeader>
              <CardContent className="p-0">
                {(health.buyers || []).length === 0 ? <div className="p-6 text-center text-xs text-slate-400">لا توجد حجوزات من مكاتب بعد</div> : (
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-xs">المكتب المشتري</TableHead><TableHead className="text-xs">التقييم</TableHead><TableHead className="text-xs">حجوزات</TableHead><TableHead className="text-xs">معتمدة</TableHead><TableHead className="text-xs">مقاعد</TableHead><TableHead className="text-xs">الإيراد</TableHead><TableHead className="text-xs">صافي لك</TableHead><TableHead className="text-xs">آخر حجز</TableHead></TableRow></TableHeader>
                    <TableBody>{(health.buyers || []).map((b, i) => (<TableRow key={b.office} onClick={() => setOfficeFilter(b.office)} className={`cursor-pointer hover:bg-blue-50/60 ${i === 0 ? 'bg-amber-50/40' : ''}`} title="عرض حجوزات هذا المكتب">
                      <TableCell className="text-[11px] font-black text-blue-700 hover:underline">{i === 0 && '🏆 '}{b.office}</TableCell>
                      {/* v3.63 — clickable rating badge (cycles values, does not open the office dialog) */}
                      <TableCell onClick={e => cycleOfficeTag(b, e)} title="انقر لتغيير التقييم">
                        <span className={`text-[9px] font-black border rounded-full px-2 py-0.5 whitespace-nowrap ${(OFFICE_TAGS[b.tag || ''] || OFFICE_TAGS['']).cls}`}>{(OFFICE_TAGS[b.tag || ''] || OFFICE_TAGS['']).label}</span>
                      </TableCell>
                      <TableCell className="text-[11px]">{b.bookings}</TableCell>
                      <TableCell className="text-[11px] text-emerald-700 font-bold">{b.approved}</TableCell>
                      <TableCell className="text-[11px]">{b.seats}</TableCell>
                      <TableCell className="text-[11px] font-mono">{b.revenue.toLocaleString('en-US')} {b.currency}</TableCell>
                      <TableCell className="text-[11px] font-mono text-emerald-700 font-bold">{b.net_to_seller.toLocaleString('en-US')} {b.currency}</TableCell>
                      <TableCell className="text-[10px] text-slate-400 whitespace-nowrap">{b.last_at ? new Date(b.last_at).toLocaleDateString('en-GB') : '—'}</TableCell>
                    </TableRow>))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            {/* v3.61 — Buyer office drill-down: all bookings of the selected office across packages */}
            {officeFilter && (
              <Dialog open onOpenChange={() => setOfficeFilter(null)}>
                <DialogContent className="max-w-2xl" onInteractOutside={e => e.preventDefault()}>
                  <DialogHeader>
                    <DialogTitle className="text-base">🏢 حجوزات «{officeFilter}» عبر معراج</DialogTitle>
                  </DialogHeader>
                  {(() => {
                    const list = (inbound || []).filter(x => ((x.buyer_office_name || 'غير معروف').trim() || 'غير معروف') === officeFilter)
                    const active = list.filter(x => x.status !== 'rejected' && x.status !== 'cancelled')
                    const seats = active.reduce((s, x) => s + (Number(x.seats) || 0), 0)
                    const rev = active.reduce((s, x) => s + (Number(x.total_price) || 0), 0)
                    return (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                          <span className="bg-slate-100 rounded-full px-2.5 py-1">{list.length} حجز إجمالاً</span>
                          <span className="bg-emerald-50 text-emerald-700 rounded-full px-2.5 py-1">{seats} مقعد فعّال</span>
                          <span className="bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 font-mono">{rev.toLocaleString('en-US')} {list[0]?.currency || ''} إيراد</span>
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
                          {list.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">لا توجد حجوزات لهذا المكتب</div> : (
                            <Table>
                              <TableHeader><TableRow><TableHead className="text-xs">التاريخ</TableHead><TableHead className="text-xs">الباكج</TableHead><TableHead className="text-xs">مرجع معراج</TableHead><TableHead className="text-xs">مقاعد</TableHead><TableHead className="text-xs">الإجمالي</TableHead><TableHead className="text-xs">الحالة</TableHead></TableRow></TableHeader>
                              <TableBody>{list.map(x => (<TableRow key={x.id} className={x.status === 'rejected' || x.status === 'cancelled' ? 'opacity-50' : ''}>
                                <TableCell className="text-[10px] whitespace-nowrap">{new Date(x.created_at).toLocaleDateString('en-GB')}</TableCell>
                                <TableCell className="text-[11px] font-bold">{x.package_name}</TableCell>
                                <TableCell className="text-[10px] font-mono">{x.meraaj_booking_ref || '—'}</TableCell>
                                <TableCell className="text-[11px]">{x.seats}</TableCell>
                                <TableCell className="text-[11px] font-mono">{(Number(x.total_price) || 0).toLocaleString('en-US')} {x.currency}</TableCell>
                                <TableCell>{x.status === 'approved' ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">✅ معتمد</Badge> : x.status === 'rejected' ? <Badge className="bg-slate-200 text-slate-600 text-[9px]">🚫 مرفوض</Badge> : x.status === 'cancelled' ? <Badge className="bg-rose-100 text-rose-700 text-[9px]">⛔ ملغى</Badge> : <Badge className="bg-blue-100 text-blue-700 text-[9px]">🔵 جديد</Badge>}</TableCell>
                              </TableRow>))}</TableBody>
                            </Table>
                          )}
                        </div>
                        <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setOfficeFilter(null)}>إغلاق</Button></div>
                      </div>
                    )
                  })()}
                </DialogContent>
              </Dialog>
            )}
            {/* Latest ACCEPTED incoming webhooks */}
            <Card>
              <CardHeader className="py-2 px-4"><CardTitle className="text-sm">📥 آخر الواردة المقبولة ({(health.incoming || []).length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                {(health.incoming || []).length === 0 ? <div className="p-6 text-center text-xs text-slate-400">لا توجد حجوزات واردة بعد</div> : (
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-xs">الوقت</TableHead><TableHead className="text-xs">الباكج</TableHead><TableHead className="text-xs">المكتب</TableHead><TableHead className="text-xs">مقاعد</TableHead><TableHead className="text-xs">الإجمالي</TableHead><TableHead className="text-xs">تطابق السعر</TableHead><TableHead className="text-xs">الحالة</TableHead></TableRow></TableHeader>
                    <TableBody>{(health.incoming || []).map(w => (<TableRow key={w.id}>
                      <TableCell className="text-[11px] whitespace-nowrap">{new Date(w.at).toLocaleString('en-GB')}</TableCell>
                      <TableCell className="text-[11px] font-bold">{w.package_name}</TableCell>
                      <TableCell className="text-[11px]">{w.buyer_office_name}</TableCell>
                      <TableCell className="text-[11px]">{w.seats}</TableCell>
                      <TableCell className="text-[11px] font-mono">{(Number(w.total_price) || 0).toLocaleString('en-US')} {w.currency}</TableCell>
                      <TableCell>{w.price_check === 'match' ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">✓ مطابق</Badge> : w.price_check === 'mismatch' ? <Badge className="bg-rose-100 text-rose-700 text-[9px]">⚠ غير مطابق</Badge> : <Badge className="bg-slate-100 text-slate-500 text-[9px]">لم يُرسل</Badge>}</TableCell>
                      <TableCell>{w.status === 'approved' ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">✅ معتمد</Badge> : w.status === 'cancelled' ? <Badge className="bg-rose-100 text-rose-700 text-[9px]">⛔ ملغى</Badge> : w.status === 'rejected' ? <Badge className="bg-slate-200 text-slate-600 text-[9px]">🚫 مرفوض</Badge> : <Badge className="bg-blue-100 text-blue-700 text-[9px]">🔵 جديد</Badge>}</TableCell>
                    </TableRow>))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            {/* Latest REJECTED webhooks */}
            <Card className={(health.rejected || []).length > 0 ? 'border-rose-200' : ''}>
              <CardHeader className="py-2 px-4"><CardTitle className="text-sm">🚫 آخر الواردة المرفوضة ({(health.rejected || []).length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                {(health.rejected || []).length === 0 ? <div className="p-6 text-center text-xs text-emerald-600 font-bold">✅ لا توجد Webhooks مرفوضة — التوقيع والمزامنة سليمة</div> : (
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-xs">الوقت</TableHead><TableHead className="text-xs">سبب الرفض</TableHead><TableHead className="text-xs">نوع الحدث</TableHead><TableHead className="text-xs">الباكج / المرجع</TableHead></TableRow></TableHeader>
                    <TableBody>{(health.rejected || []).map(w => (<TableRow key={w.id} className="bg-rose-50/30">
                      <TableCell className="text-[11px] whitespace-nowrap">{new Date(w.at).toLocaleString('en-GB')}</TableCell>
                      <TableCell><Badge className="bg-rose-100 text-rose-700 text-[9px]">{w.reason === 'invalid_signature' ? '🔐 توقيع HMAC غير صالح' : w.reason}</Badge>{!w.has_signature && <span className="text-[9px] text-slate-400 block">بدون توقيع أصلاً</span>}</TableCell>
                      <TableCell className="text-[11px]">{w.event_type || '—'}</TableCell>
                      <TableCell className="text-[11px]">{w.package_name || w.booking_ref || '—'}</TableCell>
                    </TableRow>))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            {/* Latest OUTBOUND events */}
            <Card>
              <CardHeader className="py-2 px-4 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">📤 آخر الصادرة لمعراج ({(health.outbound || []).length})</CardTitle>
                {/* v3.65 — total failed outbound counter. v3.66 — retry all with live progress */}
                <div className="flex items-center gap-1.5">
                  {/* v3.67 — auto-retry schedule toggle (10 min interval, batch 3, backoff at 8 attempts) */}
                  <button onClick={toggleAutoRetry} title="إعادة تلقائية للأحداث الفاشلة كل 10 دقائق (3 أحداث كحد أقصى، تتوقف بعد 8 محاولات للحدث الواحد)"
                    className={`text-[10px] font-black border rounded-full px-2 py-0.5 transition ${config?.auto_retry ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                    {config?.auto_retry ? '🔄 إعادة تلقائية: مفعّلة' : '⏸ إعادة تلقائية: متوقفة'}
                  </button>
                  {config?.auto_retry_last?.at && (
                    <span className="text-[9px] text-slate-400 font-bold whitespace-nowrap" title="نتيجة آخر تشغيل تلقائي">
                      آخر تشغيل {new Date(config.auto_retry_last.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}: {config.auto_retry_last.processed} عولج / <span className="text-emerald-600">{config.auto_retry_last.succeeded} نجح</span> / <span className="text-rose-500">{config.auto_retry_last.failed} فشل</span>
                    </span>
                  )}
                  {(health.stats?.outbound_failed_total || 0) > 0 && (
                    <span className="text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200 rounded-full px-2 py-0.5">⚠️ {health.stats.outbound_failed_total.toLocaleString('en-US')} فاشلة إجمالاً</span>
                  )}
                  {(health.stats?.outbound_failed_total || 0) > 0 && !retryAll?.running && (
                    <Button size="sm" onClick={runRetryAll} className="h-6 text-[10px] px-2 gap-1 bg-blue-600 hover:bg-blue-700" title="إعادة إرسال كل الأحداث الفاشلة بالترتيب (الأقدم أولاً) — بنفس المعرفات، لا تكرار">🔁 إعادة الكل</Button>
                  )}
                  {retryAll?.running && (
                    <Button size="sm" variant="outline" onClick={() => { retryAllStopRef.current = true }} className="h-6 text-[10px] px-2 border-rose-300 text-rose-600">⏹ إيقاف</Button>
                  )}
                </div>
              </CardHeader>
              {/* v3.66 — live retry-all progress bar */}
              {retryAll && (
                <div className="px-4 pb-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-bold">
                    {retryAll.running && <Loader2 className="w-3 h-3 animate-spin text-blue-600" />}
                    <span>الإجمالي: {retryAll.total ?? '—'}</span>
                    <span>عولج: {retryAll.processed}</span>
                    <span className="text-emerald-600">نجح: {retryAll.succeeded}</span>
                    <span className="text-rose-600">فشل: {retryAll.failed}</span>
                    <span className="text-slate-500">متبقٍ: {retryAll.remaining ?? '—'}</span>
                  </div>
                  {retryAll.total > 0 && (
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, Math.round((retryAll.processed / retryAll.total) * 100))}%` }} />
                    </div>
                  )}
                </div>
              )}
              <CardContent className="p-0">
                {(health.outbound || []).length === 0 ? <div className="p-6 text-center text-xs text-slate-400">لا توجد أحداث صادرة بعد</div> : (
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-xs">الوقت</TableHead><TableHead className="text-xs">الحدث</TableHead><TableHead className="text-xs">الحالة</TableHead></TableRow></TableHeader>
                    <TableBody>{(health.outbound || []).map(ev => (<TableRow key={ev.id}>
                      <TableCell className="text-[11px] whitespace-nowrap">{new Date(ev.at).toLocaleString('en-GB')}</TableCell>
                      <TableCell className="text-[11px]">{EVT_LABELS[ev.type] || ev.type}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge className={ev.status === 'sent' ? 'bg-emerald-100 text-emerald-700 text-[9px]' : ev.status === 'failed' ? 'bg-rose-100 text-rose-700 text-[9px]' : 'bg-amber-100 text-amber-700 text-[9px]'}>{ev.status === 'sent' ? '✅ أُرسل' : ev.status === 'failed' ? `⚠️ فشل${ev.attempts ? ` (${ev.attempts})` : ''}` : '⏳ معلّق'}</Badge>
                          {/* v3.65 — one-tap retry (idempotent: same event id re-sent, no duplicates) */}
                          {ev.status !== 'sent' && (
                            <Button size="sm" variant="outline" onClick={() => retryEvent(ev)} disabled={retryBusy === ev.id}
                              className="h-6 text-[10px] px-2 gap-1 border-blue-300 text-blue-700 hover:bg-blue-50" title="إعادة إرسال نفس الحدث لمعراج (بنفس المعرف — لا تكرار)">
                              {retryBusy === ev.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '🔁'} إعادة
                            </Button>
                          )}
                        </div>
                        {ev.last_error && <span className="text-[9px] text-slate-400 block truncate max-w-[200px]" title={ev.last_error}>{ev.last_error}</span>}
                      </TableCell>
                    </TableRow>))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )
      )}
    </div>
  )
}


export { MeraajStoreScreen, BulkImportDialog }
