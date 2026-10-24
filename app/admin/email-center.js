'use client'
// ============================================================================
// v8.1 — EMAIL, VERIFICATION & NOTIFICATIONS CENTER (Super Admin UI).
// 6 tabs: Provider · Verification & Security · Notification Events · Templates ·
// Support Inbox · Delivery Logs. All writes require a reason (audit) and the
// email_center.manage permission — enforced SERVER-SIDE (lib/emailCenter.js).
// Secrets are WRITE-ONLY: the API key is never echoed back (masked preview only).
// ============================================================================
import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { RefreshCw, Mail, ShieldCheck, BellRing, FileText, Inbox, ScrollText, Send, Settings2, Eye, RotateCcw } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const fld = (l, node, hint) => (
  <div>
    <div className="text-xs font-bold text-slate-500 mb-1">{l}</div>
    {node}
    {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
  </div>
)
const STATUS_BADGE = {
  sent: ['أُرسلت', 'bg-emerald-100 text-emerald-700'],
  delivered: ['وصلت', 'bg-emerald-100 text-emerald-800'],
  failed: ['فشلت', 'bg-rose-100 text-rose-700'],
  suppressed: ['موقوفة', 'bg-slate-100 text-slate-500'],
  queued: ['مؤجلة', 'bg-amber-100 text-amber-700'],
}
const StBadge = ({ s }) => { const [l, c] = STATUS_BADGE[s] || [s || '—', 'bg-slate-100 text-slate-600']; return <Badge className={c}>{l}</Badge> }
const ReasonBox = ({ value, onChange }) => fld('سبب التعديل (إلزامي — يُسجّل في التدقيق)', <Input value={value} onChange={e => onChange(e.target.value)} placeholder="مثال: تحديث مزود البريد الرسمي" />)

// ----------------------------- TAB 1: PROVIDER -------------------------------
function ProviderTab() {
  const [data, setData] = useState(null)
  const [f, setF] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [reason, setReason] = useState('')
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api('/admin/email-center/provider').then(r => { setData(r); setF({ provider: r.settings.provider, sender_name: r.settings.sender_name, sender_email: r.settings.sender_email, reply_to: r.settings.reply_to || '', enabled: r.settings.enabled }) }).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  if (!data || !f) return <div className="text-center text-slate-400 text-sm py-6">جاري التحميل...</div>
  const save = async () => {
    if (!reason.trim()) return toast.error('السبب إلزامي')
    setBusy(true)
    try {
      await api('/admin/email-center/provider', { method: 'PUT', body: { ...f, ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}), reason } })
      toast.success('✅ حُفظت إعدادات المزود'); setApiKey(''); setReason(''); load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true)
    try { const r = await api('/admin/email-center/provider/test', { method: 'POST', body: { to: testTo.trim() || undefined } }); toast.success(r.message || '✅ أُرسلت رسالة الاختبار') }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const conn = data.connection || {}
  return (
    <div className="space-y-4">
      <Card><CardContent className="pt-4 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={conn.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>{conn.configured ? '🔌 المزود مهيأ' : '⚠️ لا توجد بيانات اعتماد'}</Badge>
          <Badge className={conn.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{conn.enabled ? 'الخدمة مفعّلة' : 'الخدمة معطّلة'}</Badge>
          {conn.last_sent_at && <Badge className="bg-sky-100 text-sky-700">آخر إرسال ناجح: {dtt(conn.last_sent_at)}</Badge>}
        </div>
        {conn.last_error && <div className="text-[11px] text-rose-500">آخر خطأ ({dtt(conn.last_error.at)}): {conn.last_error.error}</div>}
        <div className="text-[11px] text-slate-400 leading-relaxed">{data.architecture_note}</div>
      </CardContent></Card>
      <Card><CardContent className="pt-4 grid md:grid-cols-2 gap-4">
        {fld('مزود البريد', (
          <div className="flex gap-2 flex-wrap">
            {(data.providers || []).map(p => (
              <button key={p.key} disabled={!p.supported} onClick={() => setF({ ...f, provider: p.key })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${f.provider === p.key ? 'bg-sky-600 text-white border-sky-600' : p.supported ? 'bg-white text-slate-700 border-slate-200 hover:border-sky-300' : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'}`}
                title={p.note || ''}>{p.label}{!p.supported && ' (قريباً)'}</button>
            ))}
          </div>
        ))}
        {fld('حالة الخدمة', (
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
            <input type="checkbox" checked={!!f.enabled} onChange={e => setF({ ...f, enabled: e.target.checked })} />
            <span>{f.enabled ? 'الإرسال مفعّل' : 'الإرسال موقوف (كل الرسائل ستُوقف)'}</span>
          </label>
        ))}
        {fld('اسم المرسل', <Input value={f.sender_name} onChange={e => setF({ ...f, sender_name: e.target.value })} />)}
        {fld('بريد المرسل', <Input dir="ltr" value={f.sender_email} onChange={e => setF({ ...f, sender_email: e.target.value })} />, 'يجب أن يكون نطاقاً موثقاً لدى المزود')}
        {fld('بريد الرد (Reply-To)', <Input dir="ltr" value={f.reply_to} onChange={e => setF({ ...f, reply_to: e.target.value })} />, 'عنوان الدعم الذي تصل إليه ردود العملاء')}
        {fld('مفتاح API (كتابة فقط — لا يُعرض أبداً)', <Input dir="ltr" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={data.settings.has_api_key ? `محفوظ: ${data.settings.api_key_masked || '••••'} — اتركه فارغاً للإبقاء عليه` : 'أدخل مفتاح المزود'} />, data.settings.key_source === 'env' ? 'المفتاح الحالي من متغيرات البيئة — إدخال مفتاح هنا يتجاوزه' : null)}
        <div className="md:col-span-2"><ReasonBox value={reason} onChange={setReason} /></div>
        <div className="md:col-span-2 flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy} className="bg-sky-600 hover:bg-sky-700"><Settings2 className="w-4 h-4 ml-1" />حفظ الإعدادات</Button>
          <div className="flex gap-2 items-center">
            <Input dir="ltr" className="w-56" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="بريد الاختبار (افتراضياً بريدك)" />
            <Button variant="outline" onClick={test} disabled={busy}><Send className="w-4 h-4 ml-1" />اختبار الاتصال</Button>
          </div>
        </div>
      </CardContent></Card>
    </div>
  )
}

// ----------------------- TAB 2: VERIFICATION & SECURITY -----------------------
const SEC_FIELDS = [
  ['otp_length', 'طول رمز OTP (أرقام)', '4–10'],
  ['otp_expiry_min', 'صلاحية الرمز (دقائق)', '2–60'],
  ['max_attempts', 'محاولات التحقق قبل إبطال الرمز', '1–10'],
  ['max_per_email_24h', 'حد الرسائل لكل بريد / 24 ساعة', '1–20'],
  ['resend_cooldown_sec', 'فترة الانتظار بين الطلبات (ثانية)', '15–3600'],
  ['daily_block_hours', 'مدة الحظر بعد تجاوز الحد اليومي (ساعة)', '1–72'],
  ['ip_sends_per_hour', 'حد الإرسال لكل IP / ساعة', '1–100'],
  ['ip_sends_per_day', 'حد الإرسال لكل IP / يوم', '1–500'],
  ['ip_verifies_per_hour', 'حد محاولات التحقق لكل IP / ساعة', '5–500'],
]
function SecurityTab() {
  const [data, setData] = useState(null)
  const [f, setF] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api('/admin/email-center/security').then(r => { setData(r); setF({ ...r.settings, signup_verification_enabled: r.signup_verification_enabled, password_reset_enabled: r.password_reset_enabled }) }).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  if (!data || !f) return <div className="text-center text-slate-400 text-sm py-6">جاري التحميل...</div>
  const save = async () => {
    if (!reason.trim()) return toast.error('السبب إلزامي')
    setBusy(true)
    try { await api('/admin/email-center/security', { method: 'PUT', body: { ...f, reason } }); toast.success('✅ حُفظت إعدادات التحقق والأمان'); setReason(''); load() }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <Card><CardContent className="pt-4">
        <div className="text-xs font-bold text-slate-600 mb-3">🔐 مفاتيح التحقق الأساسية (تؤثر مباشرة على التسجيل والاستعادة)</div>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer border rounded-lg p-3">
            <input type="checkbox" checked={!!f.signup_verification_enabled} onChange={e => setF({ ...f, signup_verification_enabled: e.target.checked })} />
            <div><div className="font-bold">تأكيد البريد عند إنشاء الحساب (OTP)</div><div className="text-[10px] text-slate-400">عند الإيقاف: الحسابات الجديدة تدخل مباشرة بدون رمز تحقق</div></div>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer border rounded-lg p-3">
            <input type="checkbox" checked={!!f.password_reset_enabled} onChange={e => setF({ ...f, password_reset_enabled: e.target.checked })} />
            <div><div className="font-bold">استعادة كلمة المرور عبر البريد (OTP)</div><div className="text-[10px] text-slate-400">عند الإيقاف: لا تُرسل رموز استعادة (تبقى الاستجابة محايدة)</div></div>
          </label>
        </div>
      </CardContent></Card>
      <Card><CardContent className="pt-4">
        <div className="text-xs font-bold text-slate-600 mb-3">⏱️ حدود الإرسال والتحقق (حماية الحصة ومنع الإساءة)</div>
        <div className="grid md:grid-cols-3 gap-3">
          {SEC_FIELDS.map(([k, l, range]) => fld(l, <Input key={k} type="number" dir="ltr" value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} />, `المدى المسموح: ${range} — الافتراضي: ${data.defaults?.[k]}`))}
        </div>
        <div className="mt-4 space-y-3">
          <ReasonBox value={reason} onChange={setReason} />
          <Button onClick={save} disabled={busy} className="bg-sky-600 hover:bg-sky-700"><ShieldCheck className="w-4 h-4 ml-1" />حفظ إعدادات الأمان</Button>
        </div>
      </CardContent></Card>
    </div>
  )
}

// ------------------------- TAB 3: NOTIFICATION EVENTS -------------------------
function EventConfigDialog({ ev, audiences, onClose, onSaved }) {
  const [f, setF] = useState(null)
  const [reason, setReason] = useState('')
  useEffect(() => { if (ev) { setF({ audience: ev.audience, recipient_email: ev.recipient_email || '', subject: ev.subject || '', reply_to: ev.reply_to || '', retry_count: ev.retry_count, cooldown_min: ev.cooldown_min, max_per_day: ev.max_per_day ?? '', priority: ev.priority, send_mode: ev.send_mode }); setReason('') } }, [ev])
  if (!ev || !f) return null
  const save = async () => {
    if (!reason.trim()) return toast.error('السبب إلزامي')
    try {
      await api(`/admin/email-center/events/${ev.key}`, { method: 'PUT', body: { ...f, recipient_email: f.recipient_email.trim() || null, subject: f.subject.trim() || null, reply_to: f.reply_to.trim() || null, max_per_day: f.max_per_day === '' ? null : f.max_per_day, reason } })
      toast.success('✅ حُفظ إعداد الحدث'); onSaved(); onClose()
    } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open={!!ev} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle className="text-sm">⚙️ إعداد متقدم — {ev.label}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {fld('الجمهور المستلم', (
            <select className="w-full border rounded-md h-9 px-2 text-sm bg-white" value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}>
              {audiences.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          ))}
          {fld('بريد مخصص (اختياري)', <Input dir="ltr" value={f.recipient_email} onChange={e => setF({ ...f, recipient_email: e.target.value })} placeholder="فارغ = حسب الجمهور" />)}
          {fld('موضوع مخصص (اختياري)', <Input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} placeholder="فارغ = موضوع القالب" />)}
          {fld('Reply-To مخصص', <Input dir="ltr" value={f.reply_to} onChange={e => setF({ ...f, reply_to: e.target.value })} />)}
          {fld('محاولات إعادة الإرسال عند الفشل', <Input type="number" dir="ltr" value={f.retry_count} onChange={e => setF({ ...f, retry_count: e.target.value })} />, '0–5')}
          {fld('فترة تهدئة بين الرسائل (دقائق)', <Input type="number" dir="ltr" value={f.cooldown_min} onChange={e => setF({ ...f, cooldown_min: e.target.value })} />, '0 = بدون')}
          {fld('حد أقصى يومي لهذا الحدث', <Input type="number" dir="ltr" value={f.max_per_day} onChange={e => setF({ ...f, max_per_day: e.target.value })} placeholder="فارغ = بلا حد" />)}
          {fld('الأولوية', (
            <select className="w-full border rounded-md h-9 px-2 text-sm bg-white" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>
              <option value="low">منخفضة</option><option value="normal">عادية</option><option value="high">مرتفعة</option><option value="critical">حرجة</option>
            </select>
          ))}
          {fld('نمط الإرسال', (
            <select className="w-full border rounded-md h-9 px-2 text-sm bg-white" value={f.send_mode} onChange={e => setF({ ...f, send_mode: e.target.value })}>
              <option value="immediate">فوري</option><option value="reminder">تذكير</option>
            </select>
          ))}
        </div>
        <ReasonBox value={reason} onChange={setReason} />
        <div className="flex gap-2 justify-end"><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save} className="bg-sky-600 hover:bg-sky-700">حفظ</Button></div>
      </DialogContent>
    </Dialog>
  )
}
function EventsTab() {
  const [data, setData] = useState(null)
  const [changes, setChanges] = useState({})
  const [reason, setReason] = useState('')
  const [cfgEv, setCfgEv] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = () => api('/admin/email-center/events').then(r => { setData(r); setChanges({}) }).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  if (!data) return <div className="text-center text-slate-400 text-sm py-6">جاري التحميل...</div>
  const effEnabled = (ev) => (changes[ev.key] !== undefined ? changes[ev.key] : ev.enabled)
  const toggle = (ev) => {
    const next = !effEnabled(ev)
    const c = { ...changes }
    if (next === ev.enabled) delete c[ev.key]; else c[ev.key] = next
    setChanges(c)
  }
  const dirty = Object.keys(changes).length
  const save = async () => {
    if (!reason.trim()) return toast.error('السبب إلزامي')
    setBusy(true)
    try { await api('/admin/email-center/events', { method: 'PUT', body: { changes, reason } }); toast.success(`✅ حُفظت حالة ${dirty} حدث`); setReason(''); load() }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const audLabel = Object.fromEntries((data.audiences || []).map(a => [a.key, a.label]))
  return (
    <div className="space-y-4">
      <div className="text-[11px] text-slate-400 bg-slate-50 border rounded-lg p-2">{data.note}</div>
      {data.categories.map(cat => {
        const evs = data.events.filter(e => e.category === cat.key)
        if (!evs.length) return null
        return (
          <Card key={cat.key}><CardContent className="pt-4">
            <div className="text-xs font-bold text-slate-700 mb-2">{cat.label}</div>
            <div className="grid md:grid-cols-2 gap-2">
              {evs.map(ev => {
                const on = effEnabled(ev)
                const changed = changes[ev.key] !== undefined
                return (
                  <div key={ev.key} className={`flex items-start justify-between gap-2 border rounded-lg p-2.5 ${changed ? 'border-amber-300 bg-amber-50/40' : on ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100'}`}>
                    <label className="flex items-start gap-2 cursor-pointer flex-1">
                      <input type="checkbox" className="mt-0.5" checked={on} onChange={() => toggle(ev)} />
                      <div>
                        <div className="text-xs font-bold text-slate-700">{ev.label} {changed && <span className="text-[9px] text-amber-600">(غير محفوظ)</span>}</div>
                        <div className="text-[10px] text-slate-400">{ev.desc} · المستلم: {audLabel[ev.audience] || ev.audience}</div>
                      </div>
                    </label>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setCfgEv(ev)}>⚙️</Button>
                  </div>
                )
              })}
            </div>
          </CardContent></Card>
        )
      })}
      <Card className={dirty ? 'border-amber-300' : ''}><CardContent className="pt-4 space-y-3">
        <div className="text-xs text-slate-500">{dirty ? `${dirty} تغيير بانتظار الحفظ` : 'لا تغييرات معلقة'}</div>
        <ReasonBox value={reason} onChange={setReason} />
        <Button onClick={save} disabled={!dirty || busy} className="bg-sky-600 hover:bg-sky-700"><BellRing className="w-4 h-4 ml-1" />حفظ حالة الأحداث</Button>
      </CardContent></Card>
      <EventConfigDialog ev={cfgEv} audiences={data.audiences || []} onClose={() => setCfgEv(null)} onSaved={load} />
    </div>
  )
}

// ------------------------------ TAB 4: TEMPLATES ------------------------------
function TemplateEditDialog({ tpl, onClose, onSaved }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState(false)
  useEffect(() => { if (tpl) { setSubject(tpl.subject); setBody(tpl.body); setReason(''); setPreview(false) } }, [tpl])
  if (!tpl) return null
  const save = async () => {
    if (!reason.trim()) return toast.error('السبب إلزامي')
    try { await api(`/admin/email-center/templates/${tpl.key}`, { method: 'PUT', body: { subject, body, reason } }); toast.success('✅ حُفظ القالب'); onSaved(); onClose() }
    catch (e) { toast.error(e.message) }
  }
  const reset = async () => {
    try { await api(`/admin/email-center/templates/${tpl.key}`, { method: 'DELETE', body: { reason: 'إرجاع القالب الافتراضي' } }); toast.success('↩️ أُرجع القالب الافتراضي'); onSaved(); onClose() }
    catch (e) { toast.error(e.message) }
  }
  const previewVars = { name: 'أحمد', otp: '123456', expiry_min: 10, message: 'نص الرسالة التجريبي', office_name: 'مكتب تجريبي', amount: '500', currency: 'USD' }
  const previewHtml = body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => previewVars[k] ?? `{{${k}}}`)
  return (
    <Dialog open={!!tpl} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle className="text-sm">📝 قالب: {tpl.label} {tpl.customized && <Badge className="bg-amber-100 text-amber-700 mr-2">مخصص</Badge>}</DialogTitle></DialogHeader>
        {fld('الموضوع', <Input value={subject} onChange={e => setSubject(e.target.value)} />)}
        <div className="flex flex-wrap gap-1 items-center text-[10px] text-slate-400">
          المتغيرات المتاحة: {(tpl.variables || []).map(v => <code key={v} className="bg-slate-100 rounded px-1.5 py-0.5 text-[10px]" dir="ltr">{'{{' + v + '}}'}</code>)}
        </div>
        {preview
          ? <iframe title="preview" className="w-full h-80 border rounded-lg bg-white" srcDoc={previewHtml} sandbox="" />
          : fld('محتوى الرسالة (HTML)', <Textarea dir="ltr" className="font-mono text-[11px] h-64" value={body} onChange={e => setBody(e.target.value)} />)}
        <ReasonBox value={reason} onChange={setReason} />
        <div className="flex gap-2 justify-between flex-wrap">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}><Eye className="w-4 h-4 ml-1" />{preview ? 'عودة للتحرير' : 'معاينة'}</Button>
            <Button variant="outline" size="sm" className="text-rose-600" onClick={reset}><RotateCcw className="w-4 h-4 ml-1" />القالب الافتراضي</Button>
          </div>
          <div className="flex gap-2"><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save} className="bg-sky-600 hover:bg-sky-700">حفظ القالب</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
function TemplatesTab() {
  const [data, setData] = useState(null)
  const [edit, setEdit] = useState(null)
  const [q, setQ] = useState('')
  const load = () => api('/admin/email-center/templates').then(setData).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  if (!data) return <div className="text-center text-slate-400 text-sm py-6">جاري التحميل...</div>
  const rows = (data.templates || []).filter(t => !q.trim() || t.label.includes(q.trim()) || t.key.includes(q.trim()))
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><Input className="w-64" value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 بحث في القوالب..." /><div className="text-[10px] text-slate-400">{data.note}</div></div>
      <Card><CardContent className="pt-2">
        <Table>
          <TableHeader><TableRow><TableHead>الحدث</TableHead><TableHead>الموضوع</TableHead><TableHead>الحالة</TableHead><TableHead className="text-left">تحرير</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map(t => (
              <TableRow key={t.key}>
                <TableCell className="text-xs font-bold">{t.label}<div className="text-[9px] text-slate-400 font-mono" dir="ltr">{t.key}</div></TableCell>
                <TableCell className="text-xs">{t.subject}</TableCell>
                <TableCell>{t.customized ? <Badge className="bg-amber-100 text-amber-700">مخصص</Badge> : <Badge className="bg-slate-100 text-slate-500">افتراضي</Badge>}</TableCell>
                <TableCell className="text-left"><Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setEdit(t)}><FileText className="w-3 h-3 ml-1" />تحرير</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <TemplateEditDialog tpl={edit} onClose={() => setEdit(null)} onSaved={load} />
    </div>
  )
}

// -------------------------------- TAB 5: INBOX --------------------------------
function InboxTab() {
  const [data, setData] = useState(null)
  const [st, setSt] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const [reply, setReply] = useState('')
  const load = () => api(`/admin/email-center/inbox?status=${st}&q=${encodeURIComponent(q)}`).then(setData).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [st]) // eslint-disable-line
  if (!data) return <div className="text-center text-slate-400 text-sm py-6">جاري التحميل...</div>
  const openMsg = async (m) => {
    setOpen(m); setReply('')
    if (!m.read) { try { await api(`/admin/email-center/inbox/${m.id}`, { method: 'PATCH', body: { read: true } }); load() } catch { /* silent */ } }
  }
  const sendReply = async () => {
    if (!reply.trim()) return toast.error('نص الرد مطلوب')
    try { await api(`/admin/email-center/inbox/${open.id}/reply`, { method: 'POST', body: { body: reply } }); toast.success('✅ أُرسل الرد'); setOpen(null); load() }
    catch (e) { toast.error(e.message) }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-sky-100 text-sky-700">📥 {data.support_address}</Badge>
        {data.unread > 0 && <Badge className="bg-rose-500 text-white">{data.unread} غير مقروء</Badge>}
        <div className="flex gap-1">
          {[['all', 'الكل'], ['unread', 'غير مقروء'], ['read', 'مقروء']].map(([k, l]) => (
            <button key={k} onClick={() => setSt(k)} className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${st === k ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>
          ))}
        </div>
        <Input className="w-56" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="🔍 بحث (Enter)" />
        <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      <div className="text-[10px] text-slate-400 bg-slate-50 border rounded-lg p-2">{data.webhook_note}</div>
      <Card><CardContent className="pt-2">
        {!data.rows?.length ? <div className="text-center text-slate-400 text-sm py-6">لا رسائل واردة بعد</div> : (
          <Table>
            <TableHeader><TableRow><TableHead>من</TableHead><TableHead>الموضوع</TableHead><TableHead>التاريخ</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.rows.map(m => (
                <TableRow key={m.id} className={`cursor-pointer ${!m.read ? 'bg-sky-50/50 font-bold' : ''}`} onClick={() => openMsg(m)}>
                  <TableCell className="text-xs font-mono" dir="ltr">{m.from}</TableCell>
                  <TableCell className="text-xs">{m.subject}{(m.replies || []).length > 0 && <Badge className="bg-emerald-100 text-emerald-700 mr-1 text-[9px]">رُدّ عليها</Badge>}</TableCell>
                  <TableCell className="text-[10px]">{dtt(m.at)}</TableCell>
                  <TableCell>{m.read ? <Badge className="bg-slate-100 text-slate-500">مقروء</Badge> : <Badge className="bg-sky-100 text-sky-700">جديد</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
      <Dialog open={!!open} onOpenChange={v => !v && setOpen(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" dir="rtl">
          {open && <>
            <DialogHeader><DialogTitle className="text-sm">📧 {open.subject}</DialogTitle></DialogHeader>
            <div className="text-[11px] text-slate-500">من: <span className="font-mono" dir="ltr">{open.from}</span> · {dtt(open.at)}</div>
            <div className="border rounded-lg p-3 text-xs whitespace-pre-wrap max-h-56 overflow-y-auto bg-slate-50">{open.text || '(بلا نص)'}</div>
            {(open.replies || []).map((r, i) => (
              <div key={i} className="border-r-4 border-emerald-300 bg-emerald-50/40 rounded-lg p-2 text-[11px]"><b>↩️ {r.by}</b> · {dtt(r.at)}<div className="whitespace-pre-wrap mt-1">{r.body}</div></div>
            ))}
            {fld('الرد (يُرسل من بريد المنصة)', <Textarea className="h-24" value={reply} onChange={e => setReply(e.target.value)} placeholder="اكتب ردك هنا..." />)}
            <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setOpen(null)}>إغلاق</Button><Button onClick={sendReply} className="bg-emerald-600 hover:bg-emerald-700"><Send className="w-4 h-4 ml-1" />إرسال الرد</Button></div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ----------------------------- TAB 6: DELIVERY LOGS ---------------------------
function LogsTab() {
  const [data, setData] = useState(null)
  const [f, setF] = useState({ status: '', recipient: '', event: '' })
  const load = () => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, v])).toString()
    api(`/admin/email-center/logs${qs ? '?' + qs : ''}`).then(setData).catch(e => toast.error(e.message))
  }
  useEffect(() => { load() }, []) // eslint-disable-line
  if (!data) return <div className="text-center text-slate-400 text-sm py-6">جاري التحميل...</div>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="border rounded-md h-9 px-2 text-xs bg-white" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
          <option value="">كل الحالات</option><option value="sent">أُرسلت</option><option value="delivered">وصلت</option><option value="failed">فشلت</option><option value="suppressed">موقوفة</option>
        </select>
        <Input className="w-48" dir="ltr" value={f.recipient} onChange={e => setF({ ...f, recipient: e.target.value })} placeholder="بريد المستلم" />
        <Input className="w-44" dir="ltr" value={f.event} onChange={e => setF({ ...f, event: e.target.value })} placeholder="مفتاح الحدث" />
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-4 h-4 ml-1" />تحديث</Button>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(data.stats || {}).map(([s, n]) => <StBadge key={s} s={s} />).map((b, i) => <span key={i} className="flex items-center gap-0.5">{b}<span className="text-[10px] text-slate-500">{Object.values(data.stats)[i]}</span></span>)}
        </div>
      </div>
      <div className="text-[10px] text-slate-400 bg-slate-50 border rounded-lg p-2">{data.note}</div>
      <Card><CardContent className="pt-2">
        {!data.rows?.length ? <div className="text-center text-slate-400 text-sm py-6">لا سجلات بعد</div> : (
          <Table>
            <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>الحدث</TableHead><TableHead>المستلم</TableHead><TableHead>الموضوع</TableHead><TableHead>المزود</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-[10px] whitespace-nowrap">{dtt(r.at)}</TableCell>
                  <TableCell className="text-[10px] font-mono" dir="ltr">{r.event_key || '—'}</TableCell>
                  <TableCell className="text-xs font-mono" dir="ltr">{r.to}</TableCell>
                  <TableCell className="text-xs max-w-[220px] truncate">{r.subject}</TableCell>
                  <TableCell className="text-[10px]">{r.provider}</TableCell>
                  <TableCell><StBadge s={r.status} />{r.error && <div className="text-[9px] text-rose-500 max-w-[160px] truncate" title={r.error}>{r.error}</div>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  )
}

// --------------------------------- SHELL --------------------------------------
const TABS = [
  { key: 'provider', label: '🔌 مزود البريد', icon: Mail, render: () => <ProviderTab /> },
  { key: 'security', label: '🔐 التحقق والأمان', icon: ShieldCheck, render: () => <SecurityTab /> },
  { key: 'events', label: '🔔 أحداث الإشعارات', icon: BellRing, render: () => <EventsTab /> },
  { key: 'templates', label: '📝 القوالب', icon: FileText, render: () => <TemplatesTab /> },
  { key: 'inbox', label: '📥 صندوق الوارد', icon: Inbox, render: () => <InboxTab /> },
  { key: 'logs', label: '📊 سجلات الإرسال', icon: ScrollText, render: () => <LogsTab /> },
]
export default function AdminEmailCenter() {
  const [tab, setTab] = useState('provider')
  const active = TABS.find(t => t.key === tab) || TABS[0]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === t.key ? 'bg-sky-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:border-sky-300'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {active.render()}
    </div>
  )
}
