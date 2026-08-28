#!/usr/bin/env python3
# v3.79 — migrate remaining old selectors to the unified AccountAutocomplete
import sys
P = '/app/app/page.js'
src = open(P).read()
subs = []

def sub(old, new, count=1):
    subs.append((old, new, count))

# --- 1) tickets credit/box block (onChange={(id) =>) ---
sub('''              {form.payment_method === 'credit' ? (
                <Field label="حساب القبض / العميل" required>
                  <SmartAutocomplete kind="client" items={clients} value={form.client_id}
                    onChange={(id) => setForm({ ...form, client_id: id })}
                    onCreated={() => onSaved && onSaved()} />
                </Field>
              ) : (
                <Field label="الصندوق / البنك" required>
                  <Select value={form.box_id} onValueChange={v => setForm({ ...form, box_id: v })} disabled={!!user?.lock_box && user?.role !== 'owner'}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="اختر الصندوق أو البنك" /></SelectTrigger>
                    <SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.type === 'cash' ? '💵' : '🏦'} {b.name_ar} ({b.type === 'cash' ? 'صندوق' : 'بنك'})</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              )}''',
'''              {form.payment_method === 'credit' ? (
                <Field label="حساب القبض / العميل 🔍" required>
                  <AccountAutocomplete type="client" value={form.client_id || null}
                    onChange={(sel) => setForm({ ...form, client_id: sel?.id || '' })}
                    placeholder="ابحث عن العميل بالاسم أو الكود..." />
                </Field>
              ) : (
                <Field label="الصندوق / البنك 🔍" required>
                  <AccountAutocomplete type="box" value={form.box_id || null}
                    onChange={(sel) => setForm({ ...form, box_id: sel?.id || '' })}
                    placeholder="ابحث عن صندوق أو بنك..."
                    disabled={!!user?.lock_box && user?.role !== 'owner'} />
                </Field>
              )}''')

# --- 2+3) visas & services blocks (onChange={id =>) — two occurrences, different indent ---
sub('''                <Field label="حساب القبض / العميل" required>
                  <SmartAutocomplete kind="client" items={clients} value={form.client_id}
                    onChange={id => setForm({ ...form, client_id: id })}
                    onCreated={() => onSaved && onSaved()} />
                </Field>''',
'''                <Field label="حساب القبض / العميل 🔍" required>
                  <AccountAutocomplete type="client" value={form.client_id || null}
                    onChange={(sel) => setForm({ ...form, client_id: sel?.id || '' })}
                    placeholder="ابحث عن العميل بالاسم أو الكود..." />
                </Field>''')
sub('''              <Field label="حساب القبض / العميل" required>
                <SmartAutocomplete kind="client" items={clients} value={form.client_id}
                  onChange={id => setForm({ ...form, client_id: id })}
                  onCreated={() => onSaved && onSaved()} />
              </Field>''',
'''              <Field label="حساب القبض / العميل 🔍" required>
                <AccountAutocomplete type="client" value={form.client_id || null}
                  onChange={(sel) => setForm({ ...form, client_id: sel?.id || '' })}
                  placeholder="ابحث عن العميل بالاسم أو الكود..." />
              </Field>''')

# --- box selects still remaining in visas/services blocks (both indents) ---
sub('''                <Field label="الصندوق / البنك" required>
                  <Select value={form.box_id} onValueChange={v => setForm({ ...form, box_id: v })} disabled={!!user?.lock_box && user?.role !== 'owner'}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="اختر الصندوق أو البنك" /></SelectTrigger>
                    <SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.type === 'cash' ? '💵' : '🏦'} {b.name_ar} ({b.type === 'cash' ? 'صندوق' : 'بنك'})</SelectItem>)}</SelectContent>
                  </Select>
                </Field>''',
'''                <Field label="الصندوق / البنك 🔍" required>
                  <AccountAutocomplete type="box" value={form.box_id || null}
                    onChange={(sel) => setForm({ ...form, box_id: sel?.id || '' })}
                    placeholder="ابحث عن صندوق أو بنك..."
                    disabled={!!user?.lock_box && user?.role !== 'owner'} />
                </Field>''')
sub('''              <Field label="الصندوق / البنك" required>
                <Select value={form.box_id} onValueChange={v => setForm({ ...form, box_id: v })} disabled={!!user?.lock_box && user?.role !== 'owner'}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="اختر الصندوق أو البنك" /></SelectTrigger>
                  <SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.type === 'cash' ? '💵' : '🏦'} {b.name_ar} ({b.type === 'cash' ? 'صندوق' : 'بنك'})</SelectItem>)}</SelectContent>
                </Select>
              </Field>''',
'''              <Field label="الصندوق / البنك 🔍" required>
                <AccountAutocomplete type="box" value={form.box_id || null}
                  onChange={(sel) => setForm({ ...form, box_id: sel?.id || '' })}
                  placeholder="ابحث عن صندوق أو بنك..."
                  disabled={!!user?.lock_box && user?.role !== 'owner'} />
              </Field>''')

# --- 4) change-supplier dialog: SearchPick supplier + box select ---
sub('''<SearchPick items={suppliers.map(s => ({ id: s.id, name: s.name }))} value={supplierId} onChange={setSupplierId} placeholder="ابحث عن المورد الجديد..." quickAdds={[quickAddSupplier()]} />''',
'''<AccountAutocomplete type="supplier" value={supplierId || null} onChange={(sel) => setSupplierId(sel?.id || '')} placeholder="ابحث عن المورد الجديد بالاسم أو الكود..." />''')
sub('''                    <Select value={boxId} onValueChange={setBoxId}>
                      <SelectTrigger><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                      <SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar || b.name} · {b.currency}</SelectItem>)}</SelectContent>
                    </Select>''',
'''                    <AccountAutocomplete type="box" value={boxId || null} onChange={(sel) => setBoxId(sel?.id || '')} placeholder="ابحث عن صندوق أو بنك..." />''')

# --- 5) settings default cashier box (native select) ---
sub('''              <select value={defaultBoxId} onChange={e => setDefaultBoxId(e.target.value)} className="w-full text-sm border rounded px-2 py-1.5 bg-white">
                <option value="">— بدون تعيين —</option>
                {boxes.map(b => <option key={b.id} value={b.id}>{b.name_ar || b.name} · {b.type === 'cash' ? '💵 صندوق' : '🏦 بنك'} · {b.currency}</option>)}
              </select>''',
'''              <AccountAutocomplete type="box" value={defaultBoxId || null} onChange={(sel) => setDefaultBoxId(sel?.id || '')} placeholder="ابحث عن صندوق أو بنك..." />''')

# --- 6) partner commissions statement (composite key) ---
sub('''            <SearchPick
              items={[...clients.map(c => ({ id: `client:${c.id}`, name: c.name, badge: '👤' })), ...suppliers.map(s => ({ id: `supplier:${s.id}`, name: s.name, badge: '🏢' }))]}
              value={partnerKey} onChange={setPartnerKey} placeholder="اختر عميل / مورد"
              quickAdds={[
                { label: 'عميل غير موجود — إضافة جديد', badge: '👤', fn: async (name) => { const c = await api('/clients', { method: 'POST', body: { name } }); return { id: `client:${c.id}`, name: c.name } } },
                { label: 'مورد غير موجود — إضافة جديد', badge: '🏢', fn: async (name) => { const s = await api('/suppliers', { method: 'POST', body: { name } }); return { id: `supplier:${s.id}`, name: s.name } } },
              ]}
            />''',
'''            <AccountAutocomplete
              type="party"
              value={partnerKey ? String(partnerKey).split(':')[1] : null}
              onChange={(sel) => setPartnerKey(sel ? `${sel.type}:${sel.id}` : '')}
              placeholder="ابحث عن عميل / مورد..."
            />''')

# --- 7) settle box select ---
sub('''                <Select value={settleForm.box_id} onValueChange={v => setSettleForm({ ...settleForm, box_id: v })}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{boxes.map(bx => <SelectItem key={bx.id} value={bx.id}>{bx.type === 'cash' ? '💵' : '🏦'} {bx.name_ar}</SelectItem>)}</SelectContent>
                </Select>''',
'''                <AccountAutocomplete type="box" value={settleForm.box_id || null} onChange={(sel) => setSettleForm({ ...settleForm, box_id: sel?.id || '' })} placeholder="ابحث عن صندوق أو بنك..." />''')

# --- 8) package forms suppliers ×3 ---
sub('''<SearchPick items={suppliers.map(s => ({ id: s.id, name: s.name }))} value={f.supplier_id} onChange={v => setF({ ...f, supplier_id: v })} placeholder="ابحث أو أضف المورد الرئيسي..." quickAdds={[quickAddSupplier()]} />''',
'''<AccountAutocomplete type="supplier" value={f.supplier_id || null} onChange={(sel) => setF({ ...f, supplier_id: sel?.id || '' })} placeholder="ابحث أو أضف المورد الرئيسي..." />''')
sub('''<SearchPick compact items={suppliers.map(s => ({ id: s.id, name: s.name }))} value={it.supplier_id} onChange={v => updItem(i, 'supplier_id', v)} placeholder="ابحث أو أضف مورداً..." quickAdds={[quickAddSupplier()]} />''',
'''<AccountAutocomplete type="supplier" compact value={it.supplier_id || null} onChange={(sel) => updItem(i, 'supplier_id', sel?.id || '')} placeholder="ابحث أو أضف مورداً..." />''')
sub('''<SearchPick items={suppliers.map(s => ({ id: s.id, name: s.name }))} value={newComp.supplier_id} onChange={v => setNewComp({ ...newComp, supplier_id: v })} placeholder="ابحث أو أضف مورداً..." quickAdds={[quickAddSupplier()]} />''',
'''<AccountAutocomplete type="supplier" value={newComp.supplier_id || null} onChange={(sel) => setNewComp({ ...newComp, supplier_id: sel?.id || '' })} placeholder="ابحث أو أضف مورداً..." />''')

# --- 9) package booking client + box ---
sub('''<SearchPick items={clients.map(c => ({ id: c.id, name: c.name }))} value={newBooking.client_id} onChange={v => setNewBooking({ ...newBooking, client_id: v })} placeholder="ابحث عن العميل..." quickAdds={[quickAddClient()]} />''',
'''<AccountAutocomplete type="client" value={newBooking.client_id || null} onChange={(sel) => setNewBooking({ ...newBooking, client_id: sel?.id || '' })} placeholder="ابحث عن العميل بالاسم أو الكود..." />''')
sub('''                        <Select value={newBooking.box_id} onValueChange={v => setNewBooking({ ...newBooking, box_id: v })}>
                          <SelectTrigger className="bg-white"><SelectValue placeholder="اختر الصندوق أو البنك" /></SelectTrigger>
                          <SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.type === 'cash' ? '💵' : '🏦'} {b.name_ar} ({b.type === 'cash' ? 'صندوق' : 'بنك'})</SelectItem>)}</SelectContent>
                        </Select>''',
'''                        <AccountAutocomplete type="box" value={newBooking.box_id || null} onChange={(sel) => setNewBooking({ ...newBooking, box_id: sel?.id || '' })} placeholder="ابحث عن صندوق أو بنك..." />''')

fails = []
for old, new, count in subs:
    n = src.count(old)
    if n == 0:
        fails.append(old[:80])
        continue
    src = src.replace(old, new, n)  # replace all matching occurrences (identical duplicate blocks)
open(P, 'w').write(src)
print('replacements attempted:', len(subs), '| failed to find:', len(fails))
for f in fails: print('MISS:', f)
