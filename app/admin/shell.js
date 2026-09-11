'use client'
// ============================================================================
// v3.90 — SUPER ADMIN SHELL (Phase 1)
// AUDIT-002 resolution: the modular Super Admin lives INSIDE Rahaal and
// progressively absorbs the legacy SuperAdminPanel. All existing /api/admin/*
// endpoints are REUSED as-is — no parallel panel, no duplicated APIs.
// REUSED from the existing system:
//   - Legacy SuperAdminPanel  → reachable from sidebar («اللوحة الكلاسيكية») — zero functionality loss
//   - AnnouncementsManager    → rendered inside «العروض والإعلانات» (extended in Phase 6)
//   - api()/useAuth()         → from app/shared.js (same session/auth pipeline)
// GOVERNANCE (from day one): Super Admin is READ-ONLY on financial data by
// default — every future sensitive action must go through explicit permission
// + audit logging (wired in later phases).
// ============================================================================
import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  LayoutDashboard, Building2, TrendingUp, Receipt, Calculator, ShieldCheck,
  Megaphone, DatabaseBackup, FileSearch, Settings2, Activity, Bell, BarChart3,
  PanelRight, LogOut, Lock,
} from 'lucide-react'
import { useAuth } from '../shared'
import AdminDashboard from './dashboard'

const SECTIONS = [
  { key: 'dashboard', label: 'نظرة عامة', icon: LayoutDashboard, phase: 1, ready: true },
  { key: 'offices', label: 'المكاتب / Office 360°', icon: Building2, phase: 2 },
  { key: 'sales', label: 'المبيعات', icon: TrendingUp, phase: 3 },
  { key: 'vouchers', label: 'السندات', icon: Receipt, phase: 3 },
  { key: 'accounting', label: 'الحسابات والرقابة المالية', icon: Calculator, phase: 4 },
  { key: 'permissions', label: 'الصلاحيات', icon: ShieldCheck, phase: 5 },
  { key: 'ads', label: 'العروض والإعلانات', icon: Megaphone, phase: 6, ready: true },
  { key: 'backup', label: 'النسخ الاحتياطي والاستعادة', icon: DatabaseBackup, phase: 7 },
  { key: 'system', label: 'إدارة النظام', icon: Settings2, phase: 7 },
  { key: 'audit', label: 'التدقيق والأمان', icon: FileSearch, phase: 8 },
  { key: 'health', label: 'صحة النظام', icon: Activity, phase: 8 },
  { key: 'notifications', label: 'التنبيهات', icon: Bell, phase: 8 },
  { key: 'reports', label: 'التقارير', icon: BarChart3, phase: 8 },
  { key: 'legacy', label: 'اللوحة الكلاسيكية', icon: PanelRight, ready: true },
]

const PlaceholderSection = ({ section }) => (
  <Card className="border-dashed border-2">
    <CardContent className="py-16 text-center space-y-3">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
        <section.icon className="w-8 h-8 text-slate-400" />
      </div>
      <div className="text-xl font-extrabold text-slate-700">{section.label}</div>
      <div className="text-sm text-slate-500">هذا القسم مجدول ضمن <b>المرحلة {section.phase}</b> من خطة تطوير لوحة الإدارة</div>
      <Badge variant="outline" className="text-slate-500">قيد التطوير — Phase {section.phase}</Badge>
    </CardContent>
  </Card>
)

const AdminApp = ({ legacyPanel = null, announcements = null }) => {
  const { user, logout } = useAuth()
  const [active, setActive] = useState('dashboard')
  const current = SECTIONS.find(s => s.key === active) || SECTIONS[0]

  const renderContent = () => {
    if (active === 'dashboard') return <AdminDashboard onNavigate={setActive} />
    if (active === 'legacy') return legacyPanel || <PlaceholderSection section={current} />
    if (active === 'ads') {
      return (
        <div className="space-y-4">
          <Card className="bg-blue-50/60 border-blue-200">
            <CardContent className="py-3 text-xs text-blue-900">
              ♻️ هذا القسم يعيد استخدام <b>AnnouncementsManager</b> الحالي وواجهة <b>/api/admin/announcements</b> كما هي — التوسعة (الاستهداف، التواريخ، الأولوية، السجل) مجدولة في المرحلة 6.
            </CardContent>
          </Card>
          {announcements || <PlaceholderSection section={current} />}
        </div>
      )
    }
    return <PlaceholderSection section={current} />
  }

  const NavButton = ({ s, compact = false }) => (
    <button
      onClick={() => setActive(s.key)}
      className={`flex items-center gap-2.5 rounded-lg text-sm transition-colors w-full text-right ${compact ? 'px-3 py-1.5 whitespace-nowrap w-auto' : 'px-3 py-2'} ${
        active === s.key ? 'bg-blue-600 text-white font-bold shadow' : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      <s.icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{s.label}</span>
      {!s.ready && !compact && <span className="mr-auto text-[9px] opacity-60">P{s.phase}</span>}
    </button>
  )

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-slate-900 text-white min-h-screen sticky top-0 max-h-screen">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grad-gold flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-extrabold">إدارة المنظومة</div>
              <div className="text-[10px] text-slate-400">Rahaal Super Admin — Target Media</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {SECTIONS.map(s => <NavButton key={s.key} s={s} />)}
        </nav>
        <div className="p-3 border-t border-white/10 text-[10px] text-slate-400 flex items-center gap-1.5">
          <Lock className="w-3 h-3" /> وضع القراءة فقط على البيانات المالية (افتراضي)
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="grad-slate text-white px-4 md:px-6 py-4 shadow-lg sticky top-0 z-20">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg md:text-xl font-extrabold truncate">{current.label}</div>
              <div className="text-[11px] text-slate-300">لوحة إدارة المنظومة — رحّال</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Badge className="hidden sm:inline-flex bg-amber-500/20 text-amber-200 border border-amber-400/40 gap-1">
                <Lock className="w-3 h-3" /> قراءة فقط مالياً
              </Badge>
              <div className="text-left hidden sm:block">
                <div className="text-sm font-semibold">{user?.name}</div>
                <div className="text-[10px] text-slate-300" dir="ltr">{user?.email}</div>
              </div>
              <Button variant="ghost" onClick={logout} className="text-white hover:bg-white/10 gap-2">
                <LogOut className="w-4 h-4" /> خروج
              </Button>
            </div>
          </div>
          {/* Mobile nav */}
          <div className="md:hidden mt-3 -mx-1 overflow-x-auto flex gap-1 pb-1">
            {SECTIONS.map(s => <NavButton key={s.key} s={s} compact />)}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

export default AdminApp
