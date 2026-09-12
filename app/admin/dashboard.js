'use client'
// ============================================================================
// v3.90 — SUPER ADMIN DASHBOARD (Phase 1)
// READ-ONLY overview. REUSES existing endpoints only (no new APIs, no schema):
//   GET /api/admin/tenants                  → offices list + global_stats
//   GET /api/admin/password-reset-requests  → pending reset inbox count
//   GET /api/admin/installments-overview    → subscription installments / overdue
//   GET /api/admin/office-verifications     → pending office verification count
// Actions stay in the legacy panel («اللوحة الكلاسيكية») — this page only
// surfaces indicators and deep-links to it (reuse, not re-implement).
// ============================================================================
import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Building2, Users, Plane, FileBadge2, KeyRound, CreditCard, BadgeCheck, RefreshCw, AlertTriangle, ArrowLeft } from 'lucide-react'
import { api } from '../shared'

const KpiCard = ({ icon: Icon, label, value, sub, tone = 'slate' }) => {
  const tones = {
    slate: 'bg-white',
    blue: 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white',
    green: 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white',
    gold: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
    rose: 'bg-gradient-to-br from-rose-600 to-red-700 text-white',
  }
  const dark = tone !== 'slate'
  return (
    <Card className={`${tones[tone]} border-0 shadow-md`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${dark ? 'bg-white/20' : 'bg-slate-100'}`}>
          <Icon className={`w-5 h-5 ${dark ? 'text-white' : 'text-slate-600'}`} />
        </div>
        <div className="min-w-0">
          <div className={`text-[11px] font-semibold ${dark ? 'opacity-90' : 'text-slate-500'}`}>{label}</div>
          <div className="text-2xl font-black leading-tight">{value}</div>
          {sub && <div className={`text-[10px] ${dark ? 'opacity-80' : 'text-slate-400'}`}>{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

const AdminDashboard = ({ onNavigate }) => {
  const [data, setData] = useState(null)
  const [resets, setResets] = useState([])
  const [installments, setInstallments] = useState([])
  const [verifications, setVerifications] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [d, rr, ins, vf] = await Promise.all([
      api('/admin/tenants').catch(() => null),
      api('/admin/password-reset-requests').catch(() => []),
      api('/admin/installments-overview').catch(() => []),
      api('/admin/office-verifications').catch(() => []),
    ])
    setData(d)
    setResets(Array.isArray(rr) ? rr : [])
    setInstallments(Array.isArray(ins) ? ins : [])
    setVerifications(Array.isArray(vf) ? vf : (vf?.items || []))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const tenants = data?.tenants || []
  const gs = data?.global_stats || {}
  const activeCount = tenants.filter(t => (t.status || 'active') === 'active').length
  const suspendedCount = tenants.length - activeCount
  const trialCount = tenants.filter(t => (t.subscription || 'trial') === 'trial').length
  const usersTotal = tenants.reduce((s, t) => s + (t.users_count || 0), 0)
  const pendingResets = resets.filter(r => r.status === 'pending').length
  const overdueInst = installments.filter(r => r.overdue).length
  const pendingVerifs = verifications.filter(v => (v.status || 'pending') === 'pending').length
  const attention = pendingResets + overdueInst + pendingVerifs

  return (
    <div className="space-y-5">
      {/* KPI row 1 — offices & people */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Building2} label="المكاتب المسجلة" value={loading ? '…' : (gs.tenants ?? tenants.length)} sub={`نشط: ${activeCount} · موقوف/آخر: ${suspendedCount}`} tone="blue" />
        <KpiCard icon={Users} label="إجمالي المستخدمين" value={loading ? '…' : usersTotal} sub="مستخدمو المكاتب (بدون الإدارة)" />
        <KpiCard icon={CreditCard} label="اشتراكات تجريبية" value={loading ? '…' : trialCount} sub={`مدفوعة/أخرى: ${Math.max(tenants.length - trialCount, 0)}`} />
        <KpiCard icon={AlertTriangle} label="عناصر تحتاج انتباه" value={loading ? '…' : attention} sub={`استعادة: ${pendingResets} · أقساط: ${overdueInst} · توثيق: ${pendingVerifs}`} tone={attention > 0 ? 'rose' : 'green'} />
      </div>

      {/* KPI row 2 — global operations */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Plane} label="إجمالي التذاكر (كل المكاتب)" value={loading ? '…' : (gs.tickets ?? '—')} tone="green" />
        <KpiCard icon={FileBadge2} label="إجمالي التأشيرات (كل المكاتب)" value={loading ? '…' : (gs.visas ?? '—')} tone="gold" />
        <KpiCard icon={KeyRound} label="طلبات استعادة كلمة المرور" value={loading ? '…' : pendingResets} sub="بانتظار الإجراء" />
        <KpiCard icon={BadgeCheck} label="طلبات توثيق المكاتب" value={loading ? '…' : pendingVerifs} sub="بانتظار المراجعة" />
      </div>

      {/* Pending attention — deep links into the legacy panel (actions are REUSED there) */}
      {attention > 0 && (
        <Card className="border-orange-300 bg-orange-50/60">
          <CardContent className="py-3 flex flex-wrap items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
            <div className="text-sm text-orange-900 font-semibold flex-1 min-w-[200px]">
              يوجد {attention} عنصراً معلقاً — تنفيذ الإجراءات يتم من اللوحة الكلاسيكية (إعادة استخدام الوظائف القائمة)
            </div>
            <Button size="sm" onClick={() => onNavigate && onNavigate('legacy')} className="bg-orange-600 hover:bg-orange-700 text-white gap-1">
              فتح اللوحة الكلاسيكية <ArrowLeft className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Latest offices — READ ONLY */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" /> أحدث المكاتب</CardTitle>
          <Button size="sm" variant="outline" onClick={load} className="gap-1 h-8"><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>المكتب</TableHead>
              <TableHead className="text-center">الحالة</TableHead>
              <TableHead className="text-center">الاشتراك</TableHead>
              <TableHead className="text-center">المستخدمون</TableHead>
              <TableHead className="text-center">حصة القيود</TableHead>
              <TableHead>تاريخ التسجيل</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">جارِ التحميل…</TableCell></TableRow>}
              {!loading && tenants.slice(0, 8).map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-semibold">{t.name}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={(t.status || 'active') === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>
                      {(t.status || 'active') === 'active' ? 'نشط' : t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-xs">{t.subscription || 'trial'}{t.plan_tier ? ` · ${t.plan_tier}` : ''}</TableCell>
                  <TableCell className="text-center">{t.users_count ?? '—'}</TableCell>
                  <TableCell className="text-center text-xs" dir="ltr">{t.journal_quota ? `${t.journal_quota.used ?? 0} / ${t.journal_quota.limit ?? '∞'}` : '—'}</TableCell>
                  <TableCell className="text-xs text-slate-500">{t.created_at ? new Date(t.created_at).toLocaleDateString('ar-EG') : '—'}</TableCell>
                </TableRow>
              ))}
              {!loading && tenants.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">لا توجد مكاتب بعد</TableCell></TableRow>}
            </TableBody>
          </Table>
          {tenants.length > 8 && (
            <div className="mt-3 text-center">
              <Button size="sm" variant="ghost" onClick={() => onNavigate && onNavigate('legacy')} className="text-blue-600 gap-1">
                عرض كل المكاتب وإدارتها ({tenants.length}) — اللوحة الكلاسيكية <ArrowLeft className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-[10px] text-slate-400 text-center">
        لوحة قراءة فقط — لا تعديل مباشر على أي بيانات مالية من هذه الشاشة · المرحلة 1 من 8
      </div>
    </div>
  )
}

export default AdminDashboard
