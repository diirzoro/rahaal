'use client'
// ============================================================================
// v3.93 — ADMIN PERMISSIONS CENTER (Phase 3) — built ON TOP of the existing
// RBAC engine (single source of truth — lib/adminPerms.js via /api/admin/perms/*).
// - Built-in templates: visible, IMMUTABLE (no edit/delete).
// - Custom templates: create / edit / enable-disable / delete — every change
//   requires a REASON and is written to audit_logs (backend enforced).
// - Users & effective-permissions views: strictly READ-ONLY (no user editing
//   from here — assignment stays in each office's own permissions manager).
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
import { ShieldCheck, Users, FileSearch, Plus, Eye, Pencil, Trash2, Power, Lock, RefreshCw, Search } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')

// Arabic labels for the EXISTING permission keys (fallback: raw key — no engine expansion)
const PERM_LABELS = {
  mod_dashboard: 'قسم: لوحة التحكم', mod_tickets: 'قسم: حجز التذاكر', mod_visas: 'قسم: التأشيرات',
  mod_services: 'قسم: الخدمات', mod_packages: 'قسم: الباكجات والبرامج', mod_meraaj: 'قسم: متجر معراج',
  mod_visa_monitor: 'قسم: مراقبة التأشيرات', mod_query: 'قسم: مركز الاستعلامات', mod_fx: 'قسم: صرافة العملات',
  mod_receipt: 'قسم: سند قبض', mod_payment: 'قسم: سند صرف', mod_clients: 'قسم: العملاء',
  mod_suppliers: 'قسم: الموردون والوكلاء', mod_boxes: 'قسم: الصناديق والبنوك', mod_chart: 'قسم: الدليل المحاسبي',
  mod_journal: 'قسم: قيود اليومية', mod_reports: 'قسم: التقارير المالية', mod_affiliate: 'قسم: التسويق بالعمولة',
  mod_help: 'قسم: دليل الاستخدام',
  tickets_view: 'التذاكر — عرض', tickets_add: 'التذاكر — إضافة', tickets_edit: 'التذاكر — تعديل', tickets_delete: 'التذاكر — حذف',
  visas_view: 'التأشيرات — عرض', visas_add: 'التأشيرات — إضافة', visas_edit: 'التأشيرات — تعديل', visas_delete: 'التأشيرات — حذف',
  services_view: 'الخدمات — عرض', services_add: 'الخدمات — إضافة', services_edit: 'الخدمات — تعديل', services_delete: 'الخدمات — حذف',
  reports_view: 'عرض التقارير', show_profit: 'إظهار الأرباح',
  vouchers_manage: 'إدارة السندات', accounts_manage: 'إدارة الحسابات',
  edit_price: 'تعديل الأسعار', apply_discount: 'تطبيق الخصومات',
  can_close_periods: 'إقفال/فتح الفترات المالية 🔒', can_refund: 'الاسترداد والإلغاء 🔒',
  fin_statements: 'كشوفات الحساب 🔒', fin_partner_summary: 'ملخص الشركاء 🔒',
}
const pl = (k) => PERM_LABELS[k] || k
const PERM_GROUPS = [
  { title: '📂 الوصول للأقسام (Sidebar)', test: (k) => k.startsWith('mod_') },
  { title: '🛠️ العمليات التشغيلية', test: (k) => /^(tickets|visas|services)_/.test(k) },
  { title: '💰 مالية وحسّاسة', test: () => true },
]
const groupKeys = (keys) => {
  const used = new Set()
  return PERM_GROUPS.map(g => ({ title: g.title, keys: keys.filter(k => !used.has(k) && g.test(k) && used.add(k)) }))
}

const OnOff = ({ v }) => v === null || v === undefined
  ? <span className="text-slate-300">—</span>
  : <Badge className={v ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>{v ? '✓ مفعّلة' : '✗ ممنوعة'}</Badge>

// ---------- Role create/edit dialog ----------
const RoleDialog = ({ mode, role, roles, permKeys, onClose, onSaved }) => {
  const [label, setLabel] = useState(role?.label || '')
  const [desc, setDesc] = useState(role?.desc || '')
  const [copyOf, setCopyOf] = useState('')
  const [perms, setPerms] = useState(role?.perms ? { ...role.perms } : {})
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const applyCopy = (key) => {
    setCopyOf(key)
    const src = roles.find(r => r.key === key)
    if (src) setPerms({ ...src.perms })
  }
  const save = async () => {
    if (!label.trim()) return toast.error('اسم الدور مطلوب')
    if (mode === 'edit' && !reason.trim()) return toast.error('السبب مطلوب لتعديل الدور (Audit)')
    setSaving(true)
    try {
      if (mode === 'create') await api('/admin/perms/roles', { method: 'POST', body: { label, desc, copy_of_key: copyOf || undefined, perms, reason } })
      else await api(`/admin/perms/roles/${role.id}`, { method: 'PUT', body: { label, desc, perms, reason } })
      toast.success(mode === 'create' ? 'تم إنشاء الدور' : 'تم تعديل الدور — لا يسري على المستخدمين الحاليين تلقائياً')
      onSaved(); onClose()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }
  const onCount = Object.values(perms).filter(Boolean).length

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>{mode === 'create' ? '➕ إنشاء دور مخصص' : `✏️ تعديل الدور: ${role?.label}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><div className="text-xs font-bold text-slate-500 mb-1">اسم الدور *</div><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="مثال: محاسب مراجع" /></div>
            {mode === 'create' && (
              <div><div className="text-xs font-bold text-slate-500 mb-1">نسخ الصلاحيات من دور موجود (اختياري)</div>
                <Select value={copyOf || 'none'} onValueChange={x => x === 'none' ? setCopyOf('') : applyCopy(x)}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="بدون نسخ" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">بدون نسخ — يدوي</SelectItem>{roles.map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div><div className="text-xs font-bold text-slate-500 mb-1">الوصف</div><Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="وصف مختصر لمهام هذا الدور" /></div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-extrabold text-slate-700">الصلاحيات <Badge variant="outline" className="mr-1">{onCount} مفعّلة من {permKeys.length}</Badge></div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setPerms(Object.fromEntries(permKeys.map(k => [k, true])))}>تحديد الكل</Button>
              <Button size="sm" variant="outline" onClick={() => setPerms({})}>إلغاء الكل</Button>
            </div>
          </div>
          {groupKeys(permKeys).map(g => g.keys.length > 0 && (
            <div key={g.title} className="border rounded-lg p-3">
              <div className="text-xs font-extrabold text-slate-600 mb-2">{g.title}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                {g.keys.map(k => (
                  <label key={k} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border cursor-pointer ${perms[k] ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                    <input type="checkbox" checked={!!perms[k]} onChange={e => setPerms({ ...perms, [k]: e.target.checked })} className="accent-emerald-600" />
                    <span className="truncate" title={k}>{pl(k)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {mode === 'edit' && (
            <div><div className="text-xs font-bold text-rose-600 mb-1">سبب التعديل * (يُسجل في التدقيق)</div><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="لماذا يتم هذا التعديل؟" /></div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">{saving ? '...' : 'حفظ الدور'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Reason dialog (toggle / delete) ----------
const ReasonDialog = ({ title, danger, onClose, onConfirm }) => {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><div className="text-xs font-bold text-slate-500 mb-1">السبب * (يُسجل في سجل التدقيق)</div><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button disabled={busy || !reason.trim()} className={danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}
              onClick={async () => { setBusy(true); try { await onConfirm(reason); onClose() } catch (e) { toast.error(e.message) } setBusy(false) }}>تأكيد</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Effective permissions preview (READ-ONLY) ----------
const UserPreviewDialog = ({ userId, onClose }) => {
  const [d, setD] = useState(null)
  useEffect(() => { api(`/admin/perms/user-preview?id=${userId}`).then(setD).catch(e => { toast.error(e.message); onClose() }) }, [userId])
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>🔎 الصلاحيات الفعّالة {d?.user ? `— ${d.user.name}` : ''}</DialogTitle></DialogHeader>
        {!d ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">📧 {d.user.email}</Badge>
              <Badge variant="outline">🏢 {d.user.tenant_name}</Badge>
              <Badge variant="outline">الدور: {d.user.role === 'owner' ? '👑 مالك' : d.user.role}</Badge>
              {d.role_template && <Badge className="bg-indigo-100 text-indigo-700">قالب: {d.role_template.label}{d.role_template.built_in ? ' (مدمج)' : ' (مخصص)'}</Badge>}
              <Badge variant="outline">Overrides: {d.user.overrides_count}</Badge>
              <Badge className="bg-amber-100 text-amber-700 gap-1"><Lock className="w-3 h-3" /> قراءة فقط</Badge>
            </div>
            <div className="text-[11px] text-slate-500 bg-slate-50 border rounded-md p-2">{d.note}</div>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead className="text-right">الصلاحية</TableHead><TableHead className="text-right">الافتراضي</TableHead>
                  <TableHead className="text-right">القالب</TableHead><TableHead className="text-right">Override</TableHead>
                  <TableHead className="text-right">الفعّالة</TableHead><TableHead className="text-right">المصدر</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(d.breakdown || []).map(b => (
                    <TableRow key={b.key} className={!b.effective ? 'bg-rose-50/40' : ''}>
                      <TableCell className="text-xs font-semibold" title={b.key}>{pl(b.key)}</TableCell>
                      <TableCell><OnOff v={b.default} /></TableCell>
                      <TableCell><OnOff v={b.template} /></TableCell>
                      <TableCell><OnOff v={b.override} /></TableCell>
                      <TableCell><OnOff v={b.effective} /></TableCell>
                      <TableCell className="text-[10px] text-slate-500">{b.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------- Main ----------
const AdminPermsCenter = () => {
  const [tab, setTab] = useState('roles')
  const [roles, setRoles] = useState(null)
  const [permKeys, setPermKeys] = useState([])
  const [users, setUsers] = useState(null)
  const [tenants, setTenants] = useState([])
  const [uf, setUf] = useState({ tenant: '', q: '' })
  const [audit, setAudit] = useState(null)
  const [dlg, setDlg] = useState(null) // {type:'create'|'edit'|'toggle'|'delete'|'preview', ...}

  const loadRoles = () => api('/admin/perms/roles').then(d => { setRoles(d.roles || []); setPermKeys(d.perm_keys || []) }).catch(e => toast.error(e.message))
  const loadUsers = () => {
    const q = [uf.tenant && `tenant=${uf.tenant}`, uf.q && `q=${encodeURIComponent(uf.q)}`].filter(Boolean).join('&')
    api(`/admin/perms/users${q ? `?${q}` : ''}`).then(d => setUsers(d.users || [])).catch(e => toast.error(e.message))
  }
  const loadAudit = () => api('/admin/perms/audit').then(d => setAudit(d.rows || [])).catch(e => toast.error(e.message))

  useEffect(() => { loadRoles(); api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {}) }, [])
  useEffect(() => { if (tab === 'users') loadUsers(); if (tab === 'audit') loadAudit() }, [tab])

  const AUDIT_ACT = { role_create: ['إنشاء دور', 'bg-emerald-100 text-emerald-700'], role_update: ['تعديل دور', 'bg-blue-100 text-blue-700'], role_disable: ['تعطيل دور', 'bg-orange-100 text-orange-700'], role_enable: ['تفعيل دور', 'bg-emerald-100 text-emerald-700'], role_delete: ['حذف دور', 'bg-rose-100 text-rose-700'] }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {[['roles', '🛡️ الأدوار والقوالب', ShieldCheck], ['users', '👥 المستخدمون', Users], ['audit', '📜 سجل التدقيق', FileSearch]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> محرك RBAC واحد — القوالب المدمجة لا تُعدَّل، وكل تغيير بسبب مُسجَّل</Badge>
      </div>

      {/* ============ ROLES ============ */}
      {tab === 'roles' && (
        <Card><CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-extrabold text-slate-700">قوالب الأدوار ({roles?.length ?? '—'})</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadRoles} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>
              <Button size="sm" onClick={() => setDlg({ type: 'create' })} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="w-4 h-4" /> دور مخصص جديد</Button>
            </div>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-right">الدور</TableHead><TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">صلاحيات مفعّلة</TableHead>
                <TableHead className="text-right">مستخدمون مرتبطون</TableHead><TableHead className="text-right">إجراءات</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {roles === null ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                  : roles.map(r => (
                    <TableRow key={r.id} className={r.active === false ? 'opacity-50' : ''}>
                      <TableCell><div className="font-bold text-sm">{r.label}</div><div className="text-[10px] text-slate-400">{r.desc || r.key}</div></TableCell>
                      <TableCell>{r.built_in ? <Badge className="bg-slate-200 text-slate-700 gap-1"><Lock className="w-3 h-3" /> مدمج</Badge> : <Badge className="bg-indigo-100 text-indigo-700">مخصص</Badge>}</TableCell>
                      <TableCell><OnOff v={r.active !== false} /></TableCell>
                      <TableCell className="text-xs font-bold">{Object.values(r.perms || {}).filter(Boolean).length} / {permKeys.length}</TableCell>
                      <TableCell className="text-xs font-bold">{r.users_count || 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {r.built_in
                            ? <span className="text-[10px] text-slate-400 py-1.5">لا يُعدَّل ولا يُحذف</span>
                            : <>
                              <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setDlg({ type: 'edit', role: r })}><Pencil className="w-3 h-3" /> تعديل</Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setDlg({ type: 'toggle', role: r })}><Power className="w-3 h-3" /> {r.active === false ? 'تفعيل' : 'تعطيل'}</Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-rose-600 border-rose-200" disabled={(r.users_count || 0) > 0} title={(r.users_count || 0) > 0 ? 'مرتبط بمستخدمين — عطّله بدلاً من الحذف' : ''} onClick={() => setDlg({ type: 'delete', role: r })}><Trash2 className="w-3 h-3" /> حذف</Button>
                            </>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          <div className="text-[11px] text-slate-500 bg-blue-50/60 border border-blue-200 rounded-md p-2">
            ℹ️ القوالب المخصصة المفعّلة تظهر تلقائياً لملاك المكاتب في «إدارة صلاحيات الموظفين» (نفس محرك <b>/api/rbac/templates</b>). تعديل قالب لا يغيّر صلاحيات المستخدمين الحاليين — يسري عند إعادة الإسناد فقط.
          </div>
        </CardContent></Card>
      )}

      {/* ============ USERS (READ-ONLY) ============ */}
      {tab === 'users' && (
        <Card><CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={uf.tenant || 'all'} onValueChange={x => setUf({ ...uf, tenant: x === 'all' ? '' : x })}>
              <SelectTrigger className="w-44 bg-white h-9 text-xs"><SelectValue placeholder="المكتب" /></SelectTrigger>
              <SelectContent><SelectItem value="all">كل المكاتب</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={uf.q} onChange={e => setUf({ ...uf, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && loadUsers()} placeholder="بحث بالاسم أو الإيميل..." className="w-56 h-9 bg-white text-xs" />
            <Button size="sm" variant="outline" onClick={loadUsers} className="gap-1"><Search className="w-3.5 h-3.5" /> بحث</Button>
            <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300 bg-emerald-50 mr-auto">✅ تشغيلي — إسناد الأدوار والـOverrides من هنا (v4.2)</Badge>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-right">المستخدم</TableHead><TableHead className="text-right">المكتب</TableHead>
                <TableHead className="text-right">الدور</TableHead><TableHead className="text-right">Overrides</TableHead>
                <TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">الصلاحيات الفعّالة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {users === null ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                  : users.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">لا نتائج</TableCell></TableRow>
                    : users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell><div className="font-bold text-sm">{u.name}</div><div className="text-[10px] text-slate-400" dir="ltr">{u.email}</div></TableCell>
                        <TableCell className="text-xs">{u.tenant_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{u.role === 'owner' ? '👑 مالك' : u.role === 'staff' ? '👤 موظف' : u.role}{u.role_key ? ` · ${u.role_key}` : ''}</Badge></TableCell>
                        <TableCell className="text-xs font-bold">{u.overrides_count}</TableCell>
                        <TableCell><OnOff v={u.active} /></TableCell>
                        <TableCell><div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setDlg({ type: 'preview', userId: u.id })}><Eye className="w-3 h-3" /> عرض</Button>
                          {/* v4.2 — operational: assign role template + per-user override (staff only; owner/SA guarded server-side) */}
                          {u.role === 'staff' && <Button size="sm" variant="outline" className="h-7 px-2" title="إسناد دور (يطبق صلاحيات القالب على المستخدم)" onClick={async () => {
                            const activeRoles = (roles || []).filter(r => r.active !== false)
                            const rk = prompt(`مفتاح الدور — المتاح:\n${activeRoles.map(r => `${r.key} = ${r.label}`).join('\n')}\n\n(اتركه فارغاً لإزالة الدور)`, u.role_key || '')
                            if (rk === null) return
                            const reason = prompt('السبب (إلزامي):'); if (!reason) return
                            try { const r = await api(`/admin/perms/users/${u.id}`, { method: 'PATCH', body: { action: 'assign_role', role_key: rk || null, reason } }); toast.success(`✅ أُسند الدور — طُبقت ${r.applied_permissions} صلاحية`); loadUsers() } catch (e) { toast.error(e.message) }
                          }}>🎭 إسناد</Button>}
                          {u.role === 'staff' && <Button size="sm" variant="outline" className="h-7 px-2" title="Override صلاحية واحدة (منح/منع/إزالة)" onClick={async () => {
                            const key = prompt(`مفتاح الصلاحية — أمثلة:\n${(permKeys || []).slice(0, 12).join('\n')}\n...`)
                            if (!key) return
                            const v = prompt('القيمة: 1 = منح | 0 = منع | فارغ = إزالة الـOverride (عودة للافتراضي)')
                            if (v === null) return
                            const reason = prompt('السبب (إلزامي):'); if (!reason) return
                            const value = v === '' ? null : v === '1'
                            try { await api(`/admin/perms/users/${u.id}`, { method: 'PATCH', body: { action: 'override', key, value, reason } }); toast.success('✅ طُبق الـOverride'); loadUsers() } catch (e) { toast.error(e.message) }
                          }}>⚙️ Override</Button>}
                        </div></TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}

      {/* ============ AUDIT ============ */}
      {tab === 'audit' && (
        <Card><CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-extrabold text-slate-700">سجل تدقيق الصلاحيات (آخر 100)</div>
            <Button size="sm" variant="outline" onClick={loadAudit} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">المنفّذ</TableHead>
                <TableHead className="text-right">الإجراء</TableHead><TableHead className="text-right">الهدف</TableHead>
                <TableHead className="text-right">السبب</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {audit === null ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                  : audit.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">لا توجد سجلات بعد</TableCell></TableRow>
                    : audit.map((a, i) => {
                      const [al, ac] = AUDIT_ACT[a.action] || [a.action, 'bg-slate-100 text-slate-600']
                      return (
                        <TableRow key={a.id || i}>
                          <TableCell className="text-xs whitespace-nowrap">{dtt(a.at)}</TableCell>
                          <TableCell className="text-xs" dir="ltr">{a.actor_email || '—'}</TableCell>
                          <TableCell><Badge className={ac}>{al}</Badge></TableCell>
                          <TableCell className="text-xs font-mono">{a.target || '—'}</TableCell>
                          <TableCell className="text-xs text-slate-500 max-w-[240px] truncate" title={a.reason || ''}>{a.reason || '—'}</TableCell>
                        </TableRow>
                      )
                    })}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}

      {/* ============ Dialogs ============ */}
      {dlg?.type === 'create' && <RoleDialog mode="create" roles={roles || []} permKeys={permKeys} onClose={() => setDlg(null)} onSaved={loadRoles} />}
      {dlg?.type === 'edit' && <RoleDialog mode="edit" role={dlg.role} roles={roles || []} permKeys={permKeys} onClose={() => setDlg(null)} onSaved={loadRoles} />}
      {dlg?.type === 'toggle' && (
        <ReasonDialog title={`${dlg.role.active === false ? 'تفعيل' : 'تعطيل'} الدور: ${dlg.role.label}`} onClose={() => setDlg(null)}
          onConfirm={async (reason) => { await api(`/admin/perms/roles/${dlg.role.id}/toggle`, { method: 'POST', body: { reason } }); toast.success('تم'); loadRoles() }} />
      )}
      {dlg?.type === 'delete' && (
        <ReasonDialog danger title={`⚠️ حذف الدور نهائياً: ${dlg.role.label}`} onClose={() => setDlg(null)}
          onConfirm={async (reason) => { await api(`/admin/perms/roles/${dlg.role.id}`, { method: 'DELETE', body: { reason } }); toast.success('تم الحذف'); loadRoles() }} />
      )}
      {dlg?.type === 'preview' && <UserPreviewDialog userId={dlg.userId} onClose={() => setDlg(null)} />}
    </div>
  )
}

export default AdminPermsCenter
