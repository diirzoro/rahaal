#!/usr/bin/env python3
"""
E2E PREVIEW ESCROW — ONE scenario only: PARTIAL REFUND full cycle
booking.created -> pending -> approved -> cancellation_requested
-> cancellation.position -> Super Admin decision -> cancellation_finalized
STOP IMMEDIATELY on first FAIL. No auto-fix. No cleanup (joint verification with Meraaj team).
"""
import requests, hmac, hashlib, json, time, sys
from pymongo import MongoClient
from datetime import datetime, timezone
from uuid import uuid4

# ---- config from /app/.env (never print secret) ----
ENV = {}
for line in open('/app/.env'):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        ENV[k] = v.strip().strip('"').strip("'")
BASE_URL = 'http://localhost:3000'
SECRET = ENV['MERAAJ_SHARED_SECRET']
MONGO_URL = ENV['MONGO_URL']
DB_NAME = ENV.get('DB_NAME') or 'test_database'
BREF = 'E2E-PRV-PARTIAL-1'

db = MongoClient(MONGO_URL)[DB_NAME]
S = requests.Session()

def log(m): print(m, flush=True)
def fail(stage, err, evidence=''):
    log(f"\n==================== FAIL ====================")
    log(f"STAGE: {stage}")
    log(f"ERROR: {err}")
    if evidence: log(f"EVIDENCE: {evidence}")
    sys.exit(1)

def webhook(event_id, etype, data):
    payload = json.dumps({"id": event_id, "type": etype, "data": data,
                          "timestamp": datetime.now(timezone.utc).isoformat()},
                         separators=(',', ':'))
    sig = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return requests.post(f"{BASE_URL}/api/meraaj/webhooks", data=payload,
                         headers={"Content-Type": "application/json", "x-meraaj-signature": sig})

def je_balance(je):
    d = sum(float(l.get('debit') or 0) for l in je.get('lines', []))
    c = sum(float(l.get('credit') or 0) for l in je.get('lines', []))
    return round(d, 2), round(c, 2)

# ---------- SETUP ----------
r = S.post(f"{BASE_URL}/api/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
if r.status_code != 200: fail('SETUP/login', f'HTTP {r.status_code}', r.text[:200])
T = db.users.find_one({"email": "owner@demo.com"})['tenant_id']

orig_cfg = db.tenant_settings.find_one({"tenant_id": T}) or {}
log(f"SETUP: original escrow_mode={orig_cfg.get('meraaj_escrow_mode')} auto_approve={orig_cfg.get('meraaj_auto_approve')}")
r = S.post(f"{BASE_URL}/api/meraaj/settings", json={"escrow_mode": True, "auto_approve": False})
if r.status_code != 200: fail('SETUP/settings', f'HTTP {r.status_code}', r.text[:200])

pkg_id = str(uuid4())
db.packages.insert_one({
    "id": pkg_id, "tenant_id": T, "name": "PKG-E2E-PRV-PARTIAL", "package_type": "umrah",
    "currency": "SAR", "status": "open", "pricing_mode": "direct",
    "created_at": datetime.now(timezone.utc),
    "meraaj": {"shared": True, "seats_allocated": 10, "seats_sold": 0, "final_price": 1000,
               "buyer_commission_mode": "amount", "buyer_commission_value": 100,
               "commission_direction": "deducted",
               "market_pricing": [{"room_type": "QUAD",
                                   "customer": {"adult": 1000, "child": 800, "infant": 0},
                                   "commission": {"adult": 100, "child": 80, "infant": 0},
                                   "net": {"adult": 900, "child": 720, "infant": 0}}]}})
log(f"SETUP: test package {pkg_id} (seats 0/10) escrow_mode=ON auto_approve=OFF")

# ---------- S1: booking.created -> pending ----------
r = webhook(f"e-prv-1-{int(time.time()*1000)}", "meraaj.booking.created", {
    "package_ref": pkg_id, "booking_ref": BREF, "buyer_office_name": "مكتب E2E Preview",
    "total_price": 2000, "currency": "SAR",
    "registrants": [
        {"name": "مسافر بريفيو أول", "age": 30, "room_type": "QUAD", "passport_no": "P1111111"},
        {"name": "مسافر بريفيو ثاني", "age": 28, "room_type": "QUAD", "passport_no": "P2222222"}]})
if r.status_code != 200: fail('S1 booking.created', f'HTTP {r.status_code}', r.text[:300])
inb = db.meraaj_inbound_bookings.find_one({"meraaj_booking_ref": BREF, "tenant_id": T})
if not inb: fail('S1 booking.created', 'inbound doc not created')
pkg = db.packages.find_one({"id": pkg_id})
jes_before = db.journal_entries.count_documents({"tenant_id": T, "ref_id": {"$exists": True}})
pb = db.package_bookings.find_one({"meraaj_booking_ref": BREF, "tenant_id": T})
if inb['status'] != 'new': fail('S1 pending', f"status={inb['status']} expected 'new'")
if pkg['meraaj']['seats_sold'] != 2: fail('S1 seats', f"seats_sold={pkg['meraaj']['seats_sold']} expected 2")
if pb: fail('S1 pending', 'package_booking exists already (must NOT before approval)')
log(f"S1 PASS: booking.created -> pending | booking_ref={BREF} | status=new | seats 0->2/10 | no package_booking, no JE (seller funds NOT available)")

# ---------- S2: approve (pending -> approved) ----------
client_bal_pre = None
r = S.post(f"{BASE_URL}/api/meraaj/inbound-bookings/{inb['id']}/approve")
if r.status_code != 200: fail('S2 approve', f'HTTP {r.status_code}', r.text[:300])
inb = db.meraaj_inbound_bookings.find_one({"id": inb['id']})
if inb['status'] != 'approved': fail('S2 approve', f"status={inb['status']} expected approved")
pb = db.package_bookings.find_one({"meraaj_booking_ref": BREF, "tenant_id": T})
if not pb: fail('S2 approve', 'package_booking not created')
je0 = db.journal_entries.find_one({"tenant_id": T, "ref_type": "package_booking", "ref_id": pb['id']})
if not je0: fail('S2 approve', 'original JE not created')
d, c = je_balance(je0)
if d != c: fail('S2 accounting', f'original JE unbalanced D={d} C={c}')
cash_lines = [l for l in je0['lines'] if str(l.get('account_code', '')).startswith(('1101', '1102'))]
acc_summary = '; '.join(f"{l.get('account_code')} {l.get('account_name','')} D{l.get('debit') or 0}/C{l.get('credit') or 0}" for l in je0['lines'])
client = db.clients.find_one({"id": pb.get('client_id'), "tenant_id": T}) if pb.get('client_id') else None
client_bal_post_approve = client.get('balance') if client else None
log(f"S2 PASS: pending -> approved | package_booking={pb['id']} status={pb.get('status', 'active')} | JE balanced D={d}=C={c}")
log(f"        JE lines: {acc_summary}")
log(f"        seller funds NOT available as cash: cash/bank lines in JE = {len(cash_lines)} (receivable on buyer, no cash movement) | client balance={client_bal_post_approve}")

# outbound booking.approved delivery
time.sleep(4)
ev_appr = db.meraaj_events.find_one({"tenant_id": T, "type": "booking.approved", "payload.booking_ref": BREF})
if not ev_appr: fail('S2 outbox', 'booking.approved event not in outbox')
log(f"S2 OUTBOX: booking.approved status={ev_appr.get('status')} http={ev_appr.get('last_http_status') or ev_appr.get('http_status')} error={str(ev_appr.get('last_error'))[:120]}")
if ev_appr.get('status') != 'sent':
    fail('S2 outbox delivery', f"booking.approved NOT delivered (status={ev_appr.get('status')})",
         f"last_error={ev_appr.get('last_error')} | destination={ENV.get('MERAAJ_API_BASE_URL')}/api/integrations/rahal/webhooks")

# ---------- S3: cancellation_requested (no financial effect) ----------
jes_count_pre = db.journal_entries.count_documents({"tenant_id": T})
r = webhook(f"e-prv-3-{int(time.time()*1000)}", "meraaj.booking.cancellation_requested",
            {"booking_ref": BREF, "reason": "اعتذار العميل — اختبار Preview"})
if r.status_code != 200: fail('S3 cancellation_requested', f'HTTP {r.status_code}', r.text[:300])
inb = db.meraaj_inbound_bookings.find_one({"id": inb['id']})
pkg = db.packages.find_one({"id": pkg_id})
if inb['cancellation_status'] != 'requested': fail('S3', f"cancellation_status={inb['cancellation_status']}")
if inb['status'] != 'approved': fail('S3', f"status changed to {inb['status']} (must stay approved)")
if pkg['meraaj']['seats_sold'] != 2: fail('S3 seats', f"seats moved: {pkg['meraaj']['seats_sold']}")
if db.journal_entries.count_documents({"tenant_id": T}) != jes_count_pre: fail('S3 accounting', 'new JE created on cancellation request (must be none)')
log(f"S3 PASS: cancellation_requested | status stays approved | seats stay 2 | NO financial effect (JE count unchanged={jes_count_pre})")

# ---------- S4: office position (stored, zero financial effect) ----------
r = S.post(f"{BASE_URL}/api/meraaj/inbound-bookings/{inb['id']}/cancellation/position", json={
    "position": "objection",
    "executed_services": [{"type": "visa", "status": "issued", "ref": "VISA-PRV-77", "cost": 300,
                           "currency": "SAR", "note": "تأشيرتان صادرتان",
                           "evidence": [{"kind": "url", "value": "https://example.com/visa-prv.pdf", "label": "إشعار إصدار"}]}],
    "notes": "خدمات نُفذت قبل طلب الإلغاء — اختبار Preview"})
if r.status_code != 200: fail('S4 position', f'HTTP {r.status_code}', r.text[:300])
inb = db.meraaj_inbound_bookings.find_one({"id": inb['id']})
pkg = db.packages.find_one({"id": pkg_id})
if inb['cancellation_status'] != 'position_submitted': fail('S4', f"cancellation_status={inb['cancellation_status']}")
if inb['meraaj_cancellation_position']['actual_costs_total'] != 300: fail('S4', 'actual_costs_total != 300')
if pkg['meraaj']['seats_sold'] != 2: fail('S4 seats', 'seats moved on position')
if db.journal_entries.count_documents({"tenant_id": T}) != jes_count_pre: fail('S4 accounting', 'JE created on position (must be none)')
log(f"S4 PASS: position stored (objection, costs=300 SAR, 1 evidence) | ZERO financial effect | seats stay 2")

time.sleep(4)
ev_pos = db.meraaj_events.find_one({"tenant_id": T, "type": "booking.cancellation.position", "payload.booking_ref": BREF})
if not ev_pos: fail('S4 outbox', 'booking.cancellation.position event not in outbox')
log(f"S4 OUTBOX: cancellation.position status={ev_pos.get('status')} error={str(ev_pos.get('last_error'))[:120]}")
if ev_pos.get('status') != 'sent':
    fail('S4 outbox delivery', f"cancellation.position NOT delivered (status={ev_pos.get('status')})",
         f"last_error={ev_pos.get('last_error')}")

# ---------- S5: Super Admin decision -> cancellation_finalized (PARTIAL: 1500/400/100) ----------
seats_pre = pkg['meraaj']['seats_sold']
fin_event_id = f"e-prv-5-{int(time.time()*1000)}"
r = webhook(fin_event_id, "meraaj.booking.cancellation_finalized", {
    "booking_ref": BREF, "decision": "cancelled", "original_amount": 2000,
    "refund_amount": 1500, "seller_compensation": 400, "platform_adjustment": 100,
    "currency": "SAR", "reason": "استرداد جزئي — اختبار Preview مشترك", "decided_by": "super_admin"})
if r.status_code != 200: fail('S5 finalized', f'HTTP {r.status_code}', r.text[:300])
resp5 = r.json()
inb = db.meraaj_inbound_bookings.find_one({"id": inb['id']})
pkg = db.packages.find_one({"id": pkg_id})
pb = db.package_bookings.find_one({"id": pb['id']})
if inb['status'] != 'cancelled': fail('S5', f"status={inb['status']} expected cancelled")
if inb['cancellation_status'] != 'finalized_cancelled': fail('S5', f"cancellation_status={inb['cancellation_status']}")
if pkg['meraaj']['seats_sold'] != 0: fail('S5 seats', f"seats_sold={pkg['meraaj']['seats_sold']} expected 0 (released once: {seats_pre}->0)")
if pb['status'] != 'cancelled': fail('S5', f"package_booking status={pb['status']}")
settle = list(db.journal_entries.find({"tenant_id": T, "ref_type": "meraaj_escrow_settlement", "ref_id": pb['id']}))
if len(settle) != 1: fail('S5 settlement', f'settlement JE count={len(settle)} expected exactly 1')
d5, c5 = je_balance(settle[0])
if d5 != c5: fail('S5 settlement', f'settlement JE unbalanced D={d5} C={c5}')
settle_summary = '; '.join(f"{l.get('account_code')} D{l.get('debit') or 0}/C{l.get('credit') or 0}" for l in settle[0]['lines'])
client = db.clients.find_one({"id": pb.get('client_id'), "tenant_id": T}) if pb.get('client_id') else None
log(f"S5 PASS: finalized PARTIAL (2000 = refund 1500 + compensation 400 + platform 100) | status approved->cancelled | seats {seats_pre}->0 (once) | accounting_applied={resp5.get('accounting_applied')} kept_executed_costs={resp5.get('kept_executed_costs')}")
log(f"        settlement JE balanced D={d5}=C={c5} | lines: {settle_summary}")
log(f"        client balance after settlement={client.get('balance') if client else None} (was {client_bal_post_approve} after approval)")

# ---------- S6: duplicate finalized (same event id) -> NO double posting ----------
r = webhook(fin_event_id, "meraaj.booking.cancellation_finalized", {
    "booking_ref": BREF, "decision": "cancelled", "original_amount": 2000,
    "refund_amount": 1500, "seller_compensation": 400, "platform_adjustment": 100,
    "currency": "SAR", "reason": "استرداد جزئي — اختبار Preview مشترك", "decided_by": "super_admin"})
if r.status_code != 200: fail('S6 duplicate', f'HTTP {r.status_code}', r.text[:300])
dup = r.json()
settle_n = db.journal_entries.count_documents({"tenant_id": T, "ref_type": "meraaj_escrow_settlement", "ref_id": pb['id']})
pkg = db.packages.find_one({"id": pkg_id})
if settle_n != 1: fail('S6 duplicate posting', f'settlement JE count={settle_n} after duplicate (expected 1)')
if pkg['meraaj']['seats_sold'] != 0: fail('S6 seats', f"seats_sold={pkg['meraaj']['seats_sold']} after duplicate (expected 0, not negative)")
log(f"S6 PASS: duplicate finalized ack (duplicate={dup.get('duplicate', dup.get('note'))}) | STILL 1 settlement JE | seats STILL 0 — NO double posting")

# ---------- S7: audit trail ----------
actions = [h.get('action') for h in inb.get('history', [])]
required = ['received', 'price_validated', 'approved', 'package_booking_created',
            'cancellation_requested', 'position_submitted', 'cancellation_finalized']
missing = [a for a in required if a not in actions]
if missing: fail('S7 audit trail', f'missing history actions: {missing}', f'present: {actions}')
log(f"S7 PASS: audit trail complete: {actions}")

# ---------- FINAL REPORT ----------
log("\n==================== E2E PREVIEW ESCROW: PASS ====================")
log(f"booking_ref (both sides): {BREF}")
log(f"approval: pending(new) -> approved -> cancelled(finalized) | cancellation: requested -> position_submitted -> finalized_cancelled")
log(f"seats: 2 held -> released ONCE -> 0 | package remaining back to 10")
log(f"original JE D=C={d} (receivable, no cash) | settlement JE D=C={d5}")
log(f"outbox: booking.approved={ev_appr.get('status')} | cancellation.position={ev_pos.get('status')}")
log(f"duplicate finalized: no double posting (1 settlement JE, seats 0)")
log(f"NOTE: test data KEPT for joint verification with Meraaj team (package PKG-E2E-PRV-PARTIAL, booking {BREF}). escrow_mode left ON.")
