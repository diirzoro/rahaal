'use client'
// ============================================================================
// v3.97 — RAHAAL ADMIN STAFF & ROLES UI (Batch 5). Management of the top-
// management realm: admin staff accounts (role=admin_staff, NO tenant),
// admin roles (built-in templates immutable + custom roles), per-user
// overrides, effective permissions preview, activate/disable (disable
// terminates sessions), full audit trail. NO real user is created here
// automatically — this is the management FUNCTION only.
// ============================================================================
import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { RefreshCw, Plus, Pencil, Power, ShieldCheck, Eye, UserCog, Crown } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const fld = (l, node) => <div><div className="text-xs font-bold text-slate-500 mb-1">{l}</div>{node}</div>
const ACT_LABELS = { view: 'عرض', create: 'إنشاء', edit: 'تعديل', approve: 'اعتماد', reject: 'رفض', activate: 'تفعيل', disable: 'تعطيل', export: 'تصدير', download: 'تنزيل', manage: 'إدارة', move: 'نقل' }

// perms matrix editor: value = {section: [actions]}
const PermsMatrix = ({ sections, value, onChange, readOnly = false }) => (
  <div className="max-h-72 overflow-y-auto border rounded-lg">
    <table className="w-full text-xs">
      <tbody>{sections.map(s => (
        <tr key={s.key} className="border-b">
          <td className="p-2 font-bold whitespace-nowrap">{s.label}</td>
          <td className="p-2"><div className="flex gap-2 flex-wrap">
            {s.actions.map(a => {
              const on = (value[s.key] || []).includes(a)
              return <label key={a} className={`flex items-center gap-1 ${readOnly ? '' : 'cursor-pointer'}`}>
                <input type="checkbox" disabled={readOnly} checked={on} onChange={e => {
                  const cur = value[s.key] || []
                  onChange({ ...value, [s.key]: e.target.checked ? [...cur, a] : cur.filter(x => x !== a) })
                }} />{ACT_LABELS[a] || a}</label>
            })}
          </div></td>
        </tr>
      ))}</tbody>
    </table>
  </div>
)

const RoleDialog = ({ sections, role, onClose, onDone }) => {
  const [v, setV] = useState({ label: role?.label || '', desc: role?.desc || '', reason: '' })
  const [perms, setPerms] = useState(role?.perms || {})
  const save = async () => {
    if (!v.label.trim() || !v.reason.trim()) return toast.error('الاسم والسبب إلزاميان')
    try {
      if (role) await api(`/admin/staff/roles/${role.key}`, { method: 'PUT', body: { ...v, perms } })
      else await api('/admin/staff/roles', { method: 'POST', body: { ...v, perms } })
      toast.success('تم'); onDone()
    } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
      <DialogHeader><DialogTitle>{role ? `✏️ ${role.label}` : '➕ دور إداري مخصص'}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {fld('اسم الدور *', <Input value={v.label} onChange={e => setV({ ...v, label: e.target.value })} />)}
          {fld('الوصف', <Input value={v.desc} onChange={e => setV({ ...v, desc: e.target.value })} />)}
        </div>
        {fld('الأقسام والإجراءات (لا تعطِ صلاحية شاملة لمهمة تحتاج عرضاً فقط)', <PermsMatrix sections={sections} value={perms} onChange={setPerms} />)}
        {fld('السبب * (Audit)', <Textarea rows={2} value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} />)}
        <Button onClick={save} className="w-full">حفظ</Button>
      </div>
    </DialogContent></Dialog>
  )
}

const StaffDialog = ({ roles, onClose, onDone, canCreateSA = false }) => {
  const [v, setV] = useState({ name: '', email: '', password: '', admin_role_key: '', reason: '', role: 'admin_staff' })
  const save = async () => {
    if (!v.name || !v.email || !v.password || !v.reason) return toast.error('كل الحقول والسبب إلزامية')
    try { await api('/admin/staff/users', { method: 'POST', body: v }); toast.success(v.role === 'super_admin' ? 'أُنشئ المشرف العام' : 'أُضيف المدير'); onDone() } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md" dir="rtl">
      <DialogHeader><DialogTitle>➕ إضافة مدير / موظف إدارة رحّال</DialogTitle></DialogHeader>
      <div className="space-y-3">
        {fld('الاسم *', <Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />)}
        {fld('البريد *', <Input dir="ltr" value={v.email} onChange={e => setV({ ...v, email: e.target.value })} />)}
        {fld('كلمة المرور * (8+ أحرف: حرف كبير A-Z + رقم + رمز خاص مثل !@#$%)', <Input dir="ltr" type="password" value={v.password} onChange={e => setV({ ...v, password: e.target.value })} />)}
        {/* v7.1 — point 2: creating another Super Admin is offered ONLY to the authorized
            main Super Admin (server enforces 403 for anyone else regardless of the UI) */}
        {canCreateSA && fld('نوع الحساب', <Select value={v.role} onValueChange={c => setV({ ...v, role: c, admin_role_key: c === 'super_admin' ? '' : v.admin_role_key })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin_staff">موظف إدارة (صلاحيات حسب الدور)</SelectItem><SelectItem value="super_admin">Super Admin (كل الصلاحيات)</SelectItem></SelectContent></Select>)}
        {v.role !== 'super_admin' && fld('الدور الإداري', <Select value={v.admin_role_key} onValueChange={c => setV({ ...v, admin_role_key: c })}><SelectTrigger><SelectValue placeholder="بلا دور (يحدد لاحقاً)" /></SelectTrigger><SelectContent>{roles.filter(r => r.active !== false).map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent></Select>)}
        {fld('السبب * (Audit)', <Input value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} />)}
        <div className="text-[11px] text-slate-500">الحساب يُنشأ في نطاق الإدارة العليا فقط (بلا مكتب) — لا يستطيع مستخدم مكتب منح هذا الدور. لا يحصل الموظف على كل الصلاحيات تلقائياً{canCreateSA ? '. إنشاء Super Admin متاح حصراً للمشرف العام الرئيسي' : ''}</div>
        <Button onClick={save} className="w-full">إضافة</Button>
      </div>
    </DialogContent></Dialog>
  )
}

const OverridesDialog = ({ sections, user, onClose, onDone }) => {
  const [ov, setOv] = useState({ ...(user.admin_overrides || {}) })
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    // v8.0 — item 3: clear INLINE validation (no «broken button» impression)
    if (!reason.trim()) { setErr('⚠️ سبب التدقيق إلزامي — اكتب سبب التعديل قبل الحفظ'); return }
    setErr(''); setBusy(true)
    try {
      await api(`/admin/staff/users/${user.id}`, { method: 'PATCH', body: { action: 'overrides', overrides: ov, reason } })
      toast.success('✅ حُفظت الـOverrides — الصلاحيات المشتقة حُدّثت فوراً')
      onDone()
    } catch (e) { setErr(e.message); toast.error(e.message) }
    finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[88dvh] overflow-y-auto overscroll-contain" dir="rtl">
      <DialogHeader><DialogTitle>⚙️ Overrides — {user.name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="text-[11px] text-slate-500">منح (✓) أو منع (✗) إجراء بعينه فوق الدور المسند — اترك بلا تحديد للوراثة من الدور</div>
        <div className="max-h-72 overflow-y-auto overflow-x-auto border rounded-lg"><table className="w-full text-xs"><tbody>
          {sections.map(s => (
            <tr key={s.key} className="border-b"><td className="p-2 font-bold whitespace-nowrap">{s.label}</td>
              <td className="p-2"><div className="flex gap-2 flex-wrap">{s.actions.map(a => {
                const k = `${s.key}.${a}`
                const state = ov[k] === true ? 'allow' : ov[k] === false ? 'deny' : 'inherit'
                return <button key={a} type="button" onClick={() => setOv(o => { const n = { ...o }; if (state === 'inherit') n[k] = true; else if (state === 'allow') n[k] = false; else delete n[k]; return n })}
                  className={`px-2.5 py-1.5 min-h-[36px] rounded border text-[11px] touch-manipulation ${state === 'allow' ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : state === 'deny' ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white text-slate-500'}`}>
                  {ACT_LABELS[a] || a} {state === 'allow' ? '✓' : state === 'deny' ? '✗' : ''}</button>
              })}</div></td></tr>
          ))}
        </tbody></table></div>
        {fld('السبب * (Audit)', <Input value={reason} onChange={e => { setReason(e.target.value); if (err) setErr('') }} placeholder="مثال: سحب صلاحية عرض الحسابات مؤقتاً" />)}
        {err && <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</div>}
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1 min-h-[44px]">{busy ? '...جارٍ الحفظ' : 'حفظ الـOverrides'}</Button>
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">إلغاء</Button>
        </div>
      </div>
    </DialogContent></Dialog>
  )
}

// ============================================================================
// v8.0 — item 4: PROFESSIONAL MODALS replacing every browser-native prompt/
// confirm/alert in admin user management (Edit / Assign Role / Disable / Reset).
// Visual reference: the Overrides modal (RTL, internal scrolling, touch-friendly).
// ============================================================================

// A. Edit User — loads current values, Save/Cancel, inline validation
const EditUserDialog = ({ user, onClose, onDone }) => {
  const [v, setV] = useState({ name: user.name || '', phone: user.phone || '', job_title: user.job_title || '', department: user.department || '', reason: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!v.name.trim()) { setErr('⚠️ الاسم إلزامي'); return }
    if (!v.reason.trim()) { setErr('⚠️ سبب التدقيق إلزامي — اكتب سبب التعديل قبل الحفظ'); return }
    setErr(''); setBusy(true)
    try {
      await api(`/admin/staff/users/${user.id}`, { method: 'PATCH', body: { action: 'edit_profile', name: v.name, phone: v.phone, job_title: v.job_title, department: v.department, reason: v.reason } })
      toast.success('✅ حُدّثت بيانات المدير')
      onDone()
    } catch (e) { setErr(e.message); toast.error(e.message) }
    finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md w-[calc(100vw-1.5rem)] max-h-[88dvh] overflow-y-auto overscroll-contain" dir="rtl">
      <DialogHeader><DialogTitle>📝 تعديل بيانات — {user.name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        {fld('الاسم *', <Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />)}
        {fld('البريد (غير قابل للتعديل)', <Input dir="ltr" value={user.email} disabled className="bg-slate-50 text-slate-500" />)}
        {fld('الهاتف', <Input dir="ltr" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} />)}
        <div className="grid grid-cols-2 gap-2">
          {fld('المسمى الوظيفي', <Input value={v.job_title} onChange={e => setV({ ...v, job_title: e.target.value })} />)}
          {fld('القسم', <Input value={v.department} onChange={e => setV({ ...v, department: e.target.value })} placeholder="المالية، المبيعات..." />)}
        </div>
        {fld('السبب * (Audit)', <Input value={v.reason} onChange={e => { setV({ ...v, reason: e.target.value }); if (err) setErr('') }} />)}
        {err && <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</div>}
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1 min-h-[44px]">{busy ? '...جارٍ الحفظ' : 'حفظ'}</Button>
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">إلغاء</Button>
        </div>
      </div>
    </DialogContent></Dialog>
  )
}

// B. Assign/Change Role — real Role Catalog as selectable cards (NO manual role_key typing)
const AssignRoleDialog = ({ user, roles, onClose, onDone }) => {
  const [selected, setSelected] = useState(user.admin_role_key || '')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const activeRoles = roles.filter(r => r.active !== false)
  const save = async () => {
    if (!reason.trim()) { setErr('⚠️ سبب التدقيق إلزامي — اكتب سبب تغيير الدور قبل الحفظ'); return }
    setErr(''); setBusy(true)
    try {
      await api(`/admin/staff/users/${user.id}`, { method: 'PATCH', body: { action: 'assign_role', admin_role_key: selected || null, reason } })
      toast.success('✅ أُسند الدور — الصلاحيات المشتقة حُدّثت فوراً')
      onDone()
    } catch (e) { setErr(e.message); toast.error(e.message) }
    finally { setBusy(false) }
  }
  const permsSummary = (r) => Object.entries(r.perms || {}).map(([sec, acts]) => `${sec} (${(acts || []).length})`).slice(0, 4).join(' · ')
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[88dvh] overflow-y-auto overscroll-contain" dir="rtl">
      <DialogHeader><DialogTitle>🎭 إسناد / تغيير الدور — {user.name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="text-[11px] text-slate-500">اختر الدور بالنقر عليه — القائمة من كتالوج الأدوار الفعلي (قوالب مدمجة + أدوار مخصصة نشطة)</div>
        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          <button type="button" onClick={() => setSelected('')}
            className={`w-full text-right p-3 rounded-xl border-2 transition touch-manipulation ${!selected ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <div className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${!selected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`} />
              <span className="font-bold text-sm">بلا دور</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 mr-6">يُسحب الدور الحالي — تُلغى كل الصلاحيات المشتقة فوراً (تبقى الـOverrides الصريحة فقط)</div>
          </button>
          {activeRoles.map(r => (
            <button key={r.key} type="button" onClick={() => setSelected(r.key)}
              className={`w-full text-right p-3 rounded-xl border-2 transition touch-manipulation ${selected === r.key ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${selected === r.key ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`} />
                <span className="font-bold text-sm">{r.label}</span>
                {r.built_in ? <Badge variant="outline" className="text-[9px]">قالب مدمج</Badge> : <Badge className="bg-blue-100 text-blue-700 text-[9px]">مخصص</Badge>}
                {user.admin_role_key === r.key && <Badge className="bg-amber-100 text-amber-800 text-[9px]">الدور الحالي</Badge>}
              </div>
              {r.desc && <div className="text-[11px] text-slate-500 mt-1 mr-6 leading-relaxed">{r.desc}</div>}
              <div className="text-[10px] text-slate-400 mt-1 mr-6" dir="ltr">{permsSummary(r)}</div>
            </button>
          ))}
          {!activeRoles.length && <div className="text-center text-xs text-slate-400 py-6">لا توجد أدوار نشطة في الكتالوج</div>}
        </div>
        {fld('السبب * (Audit)', <Input value={reason} onChange={e => { setReason(e.target.value); if (err) setErr('') }} placeholder="مثال: نقل الموظف إلى إدارة العمليات" />)}
        {err && <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</div>}
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1 min-h-[44px]">{busy ? '...جارٍ الحفظ' : 'حفظ الدور'}</Button>
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">إلغاء</Button>
        </div>
      </div>
    </DialogContent></Dialog>
  )
}

// C. Confirmation modal for sensitive actions (disable/activate/terminate/reset) —
// user name + clear warning + action type + mandatory Audit Reason + Confirm/Cancel.
// Business logic preserved: Disable stays DISABLE (sessions terminated) — never hard delete.
const ACTION_META = {
  disable: { icon: '🔌', title: 'تعطيل المدير', cls: 'bg-red-50 border-red-200 text-red-800', btn: 'bg-red-600 hover:bg-red-700 text-white', warn: (u) => `سيُعطَّل حساب «${u.name}» وتُنهى كل جلساته النشطة فوراً. الحساب لا يُحذف نهائياً — يمكن إعادة تفعيله لاحقاً.` },
  activate: { icon: '✅', title: 'تفعيل المدير', cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', btn: 'bg-emerald-600 hover:bg-emerald-700 text-white', warn: (u) => `سيُعاد تفعيل حساب «${u.name}» ويستطيع تسجيل الدخول مجدداً بصلاحيات دوره الحالي.` },
  terminate_sessions: { icon: '🚪', title: 'إنهاء الجلسات النشطة', cls: 'bg-amber-50 border-amber-200 text-amber-800', btn: 'bg-amber-600 hover:bg-amber-700 text-white', warn: (u) => `ستُنهى كل الجلسات النشطة لـ«${u.name}» فوراً وسيضطر لتسجيل الدخول من جديد.` },
  reset_password: { icon: '🔑', title: 'إعادة تعيين كلمة المرور', cls: 'bg-blue-50 border-blue-200 text-blue-800', btn: 'bg-blue-600 hover:bg-blue-700 text-white', warn: (u) => `ستُولَّد كلمة مرور جديدة قوية لـ«${u.name}» وتُنهى كل جلساته — سلّمها له عبر قناة آمنة.` },
}
const ConfirmActionDialog = ({ user, action, onClose, onDone }) => {
  const meta = ACTION_META[action]
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // reset_password → show the new password inside the UI
  const run = async () => {
    if (!reason.trim()) { setErr('⚠️ سبب التدقيق إلزامي لهذا الإجراء'); return }
    setErr(''); setBusy(true)
    try {
      const r = await api(`/admin/staff/users/${user.id}`, { method: 'PATCH', body: { action, reason } })
      if (action === 'reset_password') { setResult(r); setBusy(false); return }
      toast.success(action === 'disable' ? `✅ عُطل الحساب — أُنهيت ${r.sessions_terminated} جلسة` : action === 'terminate_sessions' ? `✅ أُنهيت ${r.sessions_terminated} جلسة` : '✅ تم')
      onDone()
    } catch (e) { setErr(e.message); toast.error(e.message); setBusy(false) }
  }
  if (result) return (
    <Dialog open onOpenChange={() => { onDone() }}><DialogContent className="max-w-md w-[calc(100vw-1.5rem)]" dir="rtl">
      <DialogHeader><DialogTitle>🔑 كلمة المرور الجديدة — {user.name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="p-4 rounded-xl bg-slate-900 text-center">
          <code dir="ltr" className="text-xl font-black text-emerald-300 tracking-wider break-all select-all">{result.new_password}</code>
        </div>
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">⚠️ أُنهيت {result.sessions_terminated} جلسة — انسخ كلمة المرور الآن وسلّمها عبر قناة آمنة، لن تظهر مرة أخرى.</div>
        <div className="flex gap-2">
          <Button className="flex-1 min-h-[44px]" onClick={() => { navigator.clipboard?.writeText(result.new_password).then(() => toast.success('نُسخت')).catch(() => {}) }}>📋 نسخ</Button>
          <Button variant="outline" className="min-h-[44px]" onClick={() => onDone()}>إغلاق</Button>
        </div>
      </div>
    </DialogContent></Dialog>
  )
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md w-[calc(100vw-1.5rem)] max-h-[88dvh] overflow-y-auto" dir="rtl">
      <DialogHeader><DialogTitle>{meta.icon} {meta.title}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className={`text-sm font-semibold border rounded-xl p-3 leading-relaxed ${meta.cls}`}>
          {meta.warn(user)}
          <div className="text-[11px] font-normal mt-1 opacity-80" dir="ltr">{user.email}</div>
        </div>
        {fld('سبب هذا الإجراء * (Audit)', <Input value={reason} onChange={e => { setReason(e.target.value); if (err) setErr('') }} placeholder="اكتب السبب — يُسجل في سجل التدقيق" />)}
        {err && <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</div>}
        <div className="flex gap-2">
          <Button onClick={run} disabled={busy} className={`flex-1 min-h-[44px] ${meta.btn}`}>{busy ? '...جارٍ التنفيذ' : `تأكيد — ${meta.title}`}</Button>
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">إلغاء</Button>
        </div>
      </div>
    </DialogContent></Dialog>
  )
}

const AdminStaffCenter = () => {
  const [perms, setPerms] = useState(null)
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [sections, setSections] = useState([])
  const [audit, setAudit] = useState([])
  const [dlg, setDlg] = useState(null)
  const [preview, setPreview] = useState(null)
  const can = (a) => perms?.all || (perms?.perms?.staff || []).includes(a)

  const load = () => {
    api('/admin/staff/users').then(r => setUsers(r.users || [])).catch(e => toast.error(e.message))
    api('/admin/staff/roles').then(r => setRoles(r.roles || [])).catch(() => {})
    api('/admin/staff/catalog').then(r => setSections(r.sections || [])).catch(() => {})
  }
  useEffect(() => { api('/admin/staff/me').then(setPerms).catch(() => setPerms({ all: true })); load() }, [])
  useEffect(() => { if (tab === 'audit') api('/admin/staff/audit').then(r => setAudit(r.rows || [])).catch(() => {}) }, [tab])

  // v8.0 — item 4: NO browser prompts. Every management action opens a professional
  // modal (reason collected inside the modal) — see EditUserDialog / AssignRoleDialog /
  // ConfirmActionDialog above.
  const showPreview = async (u) => { try { setPreview(await api(`/admin/staff/users/${u.id}/preview`)) } catch (e) { toast.error(e.message) } }

  const TABS = [['users', '👥 المديرون'], ['roles', '🎭 الأدوار الإدارية'], ['audit', '📜 التدقيق']]
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold border ${tab === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{l}</button>)}</div>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          {tab === 'users' && can('create') && <Button size="sm" onClick={() => setDlg({ type: 'staff' })}><Plus className="w-4 h-4 ml-1" />إضافة مدير</Button>}
          {tab === 'roles' && can('manage') && <Button size="sm" onClick={() => setDlg({ type: 'role' })}><Plus className="w-4 h-4 ml-1" />دور مخصص</Button>}</div>
      </div>
      <div className="text-[11px] text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-2"><ShieldCheck className="w-3.5 h-3.5 inline ml-1" />هذه اللوحة لنطاق الإدارة العليا حصراً — مستخدمو المكاتب والعملاء والموردون مرفوضون من الخادم (403) حتى مع رابط مباشر أو استدعاء API. كل مدير يرى فقط الأقسام والإجراءات الموكلة إليه</div>

      {tab === 'users' && <Card><CardContent className="p-4">
        <Table><TableHeader><TableRow><TableHead className="text-right">المدير</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">الدور</TableHead><TableHead className="text-right">Overrides</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">أضافه</TableHead><TableHead className="text-right">إجراءات</TableHead></TableRow></TableHeader>
          <TableBody>{users.map(u => (
            <TableRow key={u.id} className={u.active ? '' : 'opacity-50'}>
              <TableCell className="font-bold">{u.name}<div className="text-[10px] text-slate-500" dir="ltr">{u.email}</div></TableCell>
              <TableCell>{u.is_main ? <Badge className="bg-amber-100 text-amber-800"><Crown className="w-3 h-3 ml-1" />المشرف الرئيسي</Badge> : <Badge variant="outline"><UserCog className="w-3 h-3 ml-1" />موظف إدارة</Badge>}</TableCell>
              <TableCell className="text-xs">{u.is_main ? 'كل الصلاحيات (بالتصميم)' : roles.find(r => r.key === u.admin_role_key)?.label || <span className="text-slate-400">بلا دور</span>}</TableCell>
              <TableCell>{Object.keys(u.admin_overrides || {}).length || '—'}</TableCell>
              <TableCell><Badge className={u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{u.active ? 'نشط' : 'معطل'}</Badge></TableCell>
              <TableCell className="text-[10px]">{u.created_by || '—'}</TableCell>
              <TableCell><div className="flex gap-1 flex-wrap">
                <Button size="sm" variant="ghost" title="معاينة الصلاحيات الفعالة" onClick={() => showPreview(u)}><Eye className="w-3.5 h-3.5" /></Button>
                {/* v8.0 — item 4B: role assignment from the REAL Role Catalog (clickable cards — no manual role_key typing) */}
                {!u.is_main && can('edit') && <Button size="sm" variant="ghost" title="إسناد / تغيير الدور" onClick={() => setDlg({ type: 'assign_role', user: u })}><Pencil className="w-3.5 h-3.5" /></Button>}
                {!u.is_main && can('manage') && <Button size="sm" variant="ghost" title="Overrides" onClick={() => setDlg({ type: 'overrides', user: u })}><ShieldCheck className="w-3.5 h-3.5" /></Button>}
                {/* v8.0 — item 4A: professional Edit User modal (loads current values) */}
                {can('edit') && <Button size="sm" variant="ghost" title="تعديل البيانات (الاسم/الهاتف/المسمى/القسم)" onClick={() => setDlg({ type: 'edit_user', user: u })}>📝</Button>}
                {/* v8.0 — item 4C: confirmation modals with warning + mandatory reason (no prompt/alert) */}
                {!u.is_main && can('manage') && <Button size="sm" variant="ghost" title="إعادة تعيين كلمة المرور (ينهي الجلسات)" onClick={() => setDlg({ type: 'confirm', action: 'reset_password', user: u })}>🔑</Button>}
                {!u.is_main && can('manage') && <Button size="sm" variant="ghost" title="إنهاء الجلسات النشطة" onClick={() => setDlg({ type: 'confirm', action: 'terminate_sessions', user: u })}>🚪</Button>}
                {!u.is_main && (can('activate') || can('disable')) && <Button size="sm" variant="ghost" title={u.active ? 'تعطيل (ينهي الجلسات)' : 'تفعيل'} onClick={() => setDlg({ type: 'confirm', action: u.active ? 'disable' : 'activate', user: u })}><Power className="w-3.5 h-3.5" /></Button>}
              </div></TableCell>
            </TableRow>))}
            {!users.length && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">لا مستخدمين في نطاق الإدارة</TableCell></TableRow>}
          </TableBody></Table>
        <div className="text-[11px] text-slate-500 border-t pt-2 mt-2">تعطيل الحساب يُنهي جلساته فوراً (مدعوم) · كل التغييرات بسبب إلزامي وتسجل في Audit · لا يُضاف أي مستخدم تلقائياً — الإضافة قرار بشري من هنا فقط</div>
      </CardContent></Card>}

      {tab === 'roles' && <Card><CardContent className="p-4">
        <Table><TableHeader><TableRow><TableHead className="text-right">الدور</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">الأقسام</TableHead><TableHead className="text-right">مسند إلى</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">—</TableHead></TableRow></TableHeader>
          <TableBody>{roles.map(r => (
            <TableRow key={r.key}>
              <TableCell className="font-bold">{r.label}<div className="text-[10px] text-slate-500">{r.desc}</div></TableCell>
              <TableCell>{r.built_in ? <Badge variant="outline">مدمج — غير قابل للتعديل</Badge> : <Badge className="bg-blue-100 text-blue-700">مخصص</Badge>}</TableCell>
              <TableCell className="text-xs">{Object.keys(r.perms || {}).length} قسم</TableCell>
              <TableCell><Badge variant="outline">{r.assigned_count}</Badge></TableCell>
              <TableCell><Badge className={r.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200'}>{r.active !== false ? 'نشط' : 'معطل'}</Badge></TableCell>
              <TableCell>{!r.built_in && can('manage') && <Button size="sm" variant="ghost" onClick={() => setDlg({ type: 'role', role: r })}><Pencil className="w-3.5 h-3.5" /></Button>}</TableCell>
            </TableRow>))}
          </TableBody></Table>
      </CardContent></Card>}

      {tab === 'audit' && <Card><CardContent className="p-4">
        <Table><TableHeader><TableRow><TableHead className="text-right">الوقت</TableHead><TableHead className="text-right">المنفذ</TableHead><TableHead className="text-right">الإجراء</TableHead><TableHead className="text-right">الهدف</TableHead><TableHead className="text-right">السبب</TableHead></TableRow></TableHeader>
          <TableBody>{audit.map(a => (
            <TableRow key={a.id}><TableCell className="text-xs">{dtt(a.at)}</TableCell><TableCell className="text-xs" dir="ltr">{a.actor_email}</TableCell>
              <TableCell><Badge variant="outline">{a.action}</Badge></TableCell><TableCell className="text-xs">{a.target?.email || a.target?.label || a.target?.key || '—'}</TableCell>
              <TableCell className="text-xs">{a.reason || '—'}</TableCell></TableRow>))}
            {!audit.length && <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-6">لا سجلات بعد</TableCell></TableRow>}
          </TableBody></Table>
      </CardContent></Card>}

      {dlg?.type === 'staff' && <StaffDialog roles={roles} canCreateSA={perms?.all === true} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {dlg?.type === 'role' && <RoleDialog sections={sections} role={dlg.role} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {dlg?.type === 'overrides' && <OverridesDialog sections={sections} user={dlg.user} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {/* v8.0 — item 4: professional modals (no browser prompts) */}
      {dlg?.type === 'edit_user' && <EditUserDialog user={dlg.user} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {dlg?.type === 'assign_role' && <AssignRoleDialog user={dlg.user} roles={roles} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {dlg?.type === 'confirm' && <ConfirmActionDialog user={dlg.user} action={dlg.action} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {preview && (
        <Dialog open onOpenChange={() => setPreview(null)}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>👁️ الصلاحيات الفعالة — {preview.user?.name}</DialogTitle></DialogHeader>
          {preview.effective?.all ? <div className="text-sm bg-amber-50 rounded p-3">المشرف الرئيسي — كل الصلاحيات بالتصميم</div>
            : <PermsMatrix sections={preview.sections || []} value={preview.effective?.perms || {}} onChange={() => {}} readOnly />}
          <div className="text-[11px] text-slate-500">المصدر: الدور المسند ({preview.effective?.role_label || 'بلا'}) + الـOverrides الفردية</div>
        </DialogContent></Dialog>
      )}
    </div>
  )
}

export default AdminStaffCenter
