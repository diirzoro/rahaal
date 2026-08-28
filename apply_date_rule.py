#!/usr/bin/env python3
# v3.80 — unified "no future document/accounting dates" rule (backend + frontend)
R = '/app/app/api/[[...path]]/route.js'
P = '/app/app/page.js'

r = open(R).read()
helper = '''// v3.80 — UNIFIED RULE: document/accounting dates can NEVER be in the future.
// Applies to: ticket/visa/service issue date, receipt/payment voucher date, FX date,
// manual journal date, visa-monitor issue date, bulk date edits.
// Travel/service dates (travel_date, entry_date, expected_exit_date, package start/end,
// visa expiry, ...) are intentionally NOT restricted.
// Date-only comparison in business timezone UTC+3 (KSA/Yemen) to avoid midnight edge cases.
const FUTURE_DOC_DATE_MSG = 'لا يمكن أن يكون تاريخ المستند بعد تاريخ اليوم'
function isFutureDocDate(dateVal) {
  if (!dateVal) return false
  const d = new Date(dateVal)
  if (isNaN(d.getTime())) return false
  const BIZ_TZ_MS = 3 * 3600 * 1000
  const todayStr = new Date(Date.now() + BIZ_TZ_MS).toISOString().slice(0, 10)
  const dStr = new Date(d.getTime() + BIZ_TZ_MS).toISOString().slice(0, 10)
  return dStr > todayStr
}

async function updateBalance(db, col, filter, currency, delta) {'''
assert r.count('async function updateBalance(db, col, filter, currency, delta) {') == 1
r = r.replace('async function updateBalance(db, col, filter, currency, delta) {', helper, 1)

# guards at the top of each create* function (covers CREATE + UPDATE since PUT re-creates)
guards = [
    ("async function createTicket(db, T, b, opts = {}) {\n  if (!b.supplier_id) return { error: 'المورد مطلوب' }",
     "async function createTicket(db, T, b, opts = {}) {\n  if (isFutureDocDate(b.date)) return { error: `${FUTURE_DOC_DATE_MSG} (تاريخ إصدار التذكرة)` } // v3.80\n  if (!b.supplier_id) return { error: 'المورد مطلوب' }"),
    ("async function createVisa(db, T, b, opts = {}) {\n  if (!b.supplier_id) return { error: 'المورد مطلوب' }",
     "async function createVisa(db, T, b, opts = {}) {\n  if (isFutureDocDate(b.date)) return { error: `${FUTURE_DOC_DATE_MSG} (تاريخ إصدار التأشيرة)` } // v3.80\n  if (!b.supplier_id) return { error: 'المورد مطلوب' }"),
    ("async function createService(db, T, b, opts = {}) {\n  if (!b.supplier_id) return { error: 'المورد/المزود مطلوب' }",
     "async function createService(db, T, b, opts = {}) {\n  if (isFutureDocDate(b.date)) return { error: `${FUTURE_DOC_DATE_MSG} (تاريخ الخدمة/المستند)` } // v3.80\n  if (!b.supplier_id) return { error: 'المورد/المزود مطلوب' }"),
    ("async function createVoucher(db, T, b, opts = {}) {\n  if (!['receipt', 'payment'].includes(b.type)) return { error: 'نوع السند غير صالح' }",
     "async function createVoucher(db, T, b, opts = {}) {\n  if (isFutureDocDate(b.date)) return { error: `${FUTURE_DOC_DATE_MSG} (تاريخ السند)` } // v3.80\n  if (!['receipt', 'payment'].includes(b.type)) return { error: 'نوع السند غير صالح' }"),
    ("async function createFx(db, T, b, opts = {}) {\n  if (!['buy', 'sell'].includes(b.type)) return { error: 'نوع العملية غير صالح' }",
     "async function createFx(db, T, b, opts = {}) {\n  if (isFutureDocDate(b.date)) return { error: `${FUTURE_DOC_DATE_MSG} (تاريخ عملية الصرافة)` } // v3.80\n  if (!['buy', 'sell'].includes(b.type)) return { error: 'نوع العملية غير صالح' }"),
    ("async function createManualJournal(db, T, b, opts = {}) {\n  // Modes:",
     "async function createManualJournal(db, T, b, opts = {}) {\n  if (isFutureDocDate(b.date)) return { error: `${FUTURE_DOC_DATE_MSG} (تاريخ القيد)` } // v3.80\n  // Modes:"),
]
fails = []
for old, new in guards:
    if r.count(old) != 1: fails.append(old[:60]); continue
    r = r.replace(old, new, 1)

# visa-monitor: create + update + import row (issue date only — entry/exit dates stay free)
vm_old = "      if (!b.visa_issue_date) return bad('تاريخ إصدار التأشيرة مطلوب')"
vm_new = "      if (!b.visa_issue_date) return bad('تاريخ إصدار التأشيرة مطلوب')\n      if (isFutureDocDate(b.visa_issue_date)) return bad(`${FUTURE_DOC_DATE_MSG} (تاريخ إصدار التأشيرة)`) // v3.80"
if r.count(vm_old) == 1: r = r.replace(vm_old, vm_new, 1)
else: fails.append('vm_create')

vm_upd_old = "          ['traveler_name', 'phone', 'passport_no', 'nationality', 'agent_name', 'agent_phone', 'visa_no', 'visa_issue_date', 'host_name', 'entry_date', 'entry_port', 'allowed_days', 'actual_exit_date', 'exit_port', 'destination_country', 'visa_type', 'max_exit_date', 'notes'].forEach(f => { if (b[f] !== undefined) upd[f] = b[f] })"
vm_upd_new = "          if (b.visa_issue_date !== undefined && isFutureDocDate(b.visa_issue_date)) return bad(`${FUTURE_DOC_DATE_MSG} (تاريخ إصدار التأشيرة)`) // v3.80\n" + vm_upd_old
if r.count(vm_upd_old) == 1: r = r.replace(vm_upd_old, vm_upd_new, 1)
else: fails.append('vm_update')

vm_imp_old = "          if (!r.visa_issue_date) missing.push('تاريخ الإصدار')"
vm_imp_new = "          if (!r.visa_issue_date) missing.push('تاريخ الإصدار')\n          else if (isFutureDocDate(r.visa_issue_date)) missing.push('تاريخ الإصدار مستقبلي (غير مسموح)') // v3.80"
if r.count(vm_imp_old) == 1: r = r.replace(vm_imp_old, vm_imp_new, 1)
else: fails.append('vm_import')

open(R, 'w').write(r)

# ---------------- frontend ----------------
p = open(P).read()
# unified DocDateInput component right after todayISO helper
today_old = "const todayISO = () => new Date().toISOString().slice(0, 10)"
today_new = today_old + '''
// v3.80 — UNIFIED document-date input: never accepts a future date (issue/voucher/journal dates).
// Travel & service dates keep using the plain date input (future allowed).
const DocDateInput = ({ value, onChange, ...props }) => (
  <Input type="date" max={todayISO()} value={value} onChange={e => {
    const v = e.target.value
    if (v && v > todayISO()) { toast.error('لا يمكن أن يكون تاريخ المستند بعد تاريخ اليوم'); return }
    onChange(v)
  }} {...props} />
)'''
assert p.count(today_old) == 1
p = p.replace(today_old, today_new, 1)

fe_subs = [
    # tickets — تاريخ الحركة (issue)
    ('<Field label="تاريخ الحركة"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>',
     '<Field label="تاريخ الحركة"><DocDateInput value={form.date} onChange={v => setForm({ ...form, date: v })} /></Field>', 1),
    # visas + services + vouchers — التاريخ (3 identical occurrences)
    ('<Field label="التاريخ"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>',
     '<Field label="التاريخ"><DocDateInput value={form.date} onChange={v => setForm({ ...form, date: v })} /></Field>', 4),
    # change-date dialog (bulk edit)
    ('{changeDate && <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="mt-2" />}',
     '{changeDate && <DocDateInput value={newDate} onChange={v => setNewDate(v)} className="mt-2" />}', 1),
    # visa monitor issue date (required form)
    ('<Field label="تاريخ إصدار التأشيرة" required><Input type="date" value={form.visa_issue_date} onChange={e => setForm({ ...form, visa_issue_date: e.target.value })} /></Field>',
     '<Field label="تاريخ إصدار التأشيرة" required><DocDateInput value={form.visa_issue_date} onChange={v => setForm({ ...form, visa_issue_date: v })} /></Field>', 1),
    # visa monitor secondary form issue date
    ('<Field label="تاريخ إصدار التأشيرة"><Input type="date" value={f.visa_issue_date} onChange={e => setF({ ...f, visa_issue_date: e.target.value })} /></Field>',
     '<Field label="تاريخ إصدار التأشيرة"><DocDateInput value={f.visa_issue_date} onChange={v => setF({ ...f, visa_issue_date: v })} /></Field>', 1),
    # manual JE single + dual
    ('<Field label="التاريخ"><Input type="date" value={singleForm.date} onChange={e => setSingleForm({ ...singleForm, date: e.target.value })} /></Field>',
     '<Field label="التاريخ"><DocDateInput value={singleForm.date} onChange={v => setSingleForm({ ...singleForm, date: v })} /></Field>', 1),
    ('<Field label="التاريخ"><Input type="date" value={dualForm.date} onChange={e => setDualForm({ ...dualForm, date: e.target.value })} /></Field>',
     '<Field label="التاريخ"><DocDateInput value={dualForm.date} onChange={v => setDualForm({ ...dualForm, date: v })} /></Field>', 1),
]
for old, new, expected in fe_subs:
    n = p.count(old)
    if n != expected:
        fails.append(f'FE({expected} expected, {n} found): ' + old[:70])
        continue
    p = p.replace(old, new)
open(P, 'w').write(p)
print('DONE | fails:', len(fails))
for f in fails: print('MISS:', f)
