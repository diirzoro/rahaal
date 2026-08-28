#!/usr/bin/env python3
"""CONTINUE E2E on existing booking E2E-PRV-PARTIAL-1 ONLY.
cancellation_requested -> position -> Super Admin decision -> cancellation_finalized (PARTIAL 1500/400/100).
STOP on first fail. No new bookings. No re-runs of earlier stages."""
import requests, hmac, hashlib, json, time, sys
from pymongo import MongoClient
from datetime import datetime, timezone

ENV = {}
for line in open('/app/.env'):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1); ENV[k] = v.strip().strip('"').strip("'")
BASE = 'http://localhost:3000'
SECRET = ENV['MERAAJ_SHARED_SECRET']
db = MongoClient(ENV['MONGO_URL'])[ENV.get('DB_NAME') or 'test_database']
BREF = 'E2E-PRV-PARTIAL-1'

def log(m): print(m, flush=True)
def fail(stage, err, ev=''):
    log(f"\nFAIL\nSTAGE: {stage}\nERROR: {err}")
    if ev: log(f"EVIDENCE: {ev}")
    sys.exit(1)

def webhook(eid, etype, data):
    p = json.dumps({"id": eid, "type": etype, "data": data,
                    "timestamp": datetime.now(timezone.utc).isoformat()}, separators=(',', ':'))
    sig = hmac.new(SECRET.encode(), p.encode(), hashlib.sha256).hexdigest()
    return requests.post(f"{BASE}/api/meraaj/webhooks", data=p,
                         headers={"Content-Type": "application/json", "x-meraaj-signature": sig})

def bal(je):
    d = sum(float(l.get('debit') or 0) for l in je['lines'])
    c = sum(float(l.get('credit') or 0) for l in je['lines'])
    return round(d, 2), round(c, 2)

T = db.users.find_one({"email": "owner@demo.com"})['tenant_id']
S = requests.Session()
r = S.post(f"{BASE}/api/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
if r.status_code != 200: fail('login', f'HTTP {r.status_code}')

inb = db.meraaj_inbound_bookings.find_one({"meraaj_booking_ref": BREF, "tenant_id": T})
if not inb or inb['status'] != 'approved': fail('precheck', f"booking state unexpected: {inb and inb['status']}")
cfg = db.tenant_settings.find_one({"tenant_id": T})
if not cfg.get('meraaj_escrow_mode'): fail('precheck', 'escrow_mode is OFF (expected ON)')
pkg_id = inb['package_id']
pb_id = inb.get('booking_id')
jes_pre = db.journal_entries.count_documents({"tenant_id": T})
seats_pre = db.packages.find_one({"id": pkg_id})['meraaj']['seats_sold']
log(f"PRECHECK OK: {BREF} approved | seats={seats_pre} | escrow=ON | JE count={jes_pre}")

# ---- Step 1: cancellation_requested (inbound, Meraaj Preview -> Rahaal) ----
r = webhook(f"e-prv-cr-{int(time.time()*1000)}", "meraaj.booking.cancellation_requested",
            {"booking_ref": BREF, "reason": "اعتذار العميل — E2E Preview مشترك"})
step1_http = r.status_code
if step1_http != 200: fail('cancellation_requested', f'HTTP {step1_http}', r.text[:300])
inb = db.meraaj_inbound_bookings.find_one({"id": inb['id']})
seats = db.packages.find_one({"id": pkg_id})['meraaj']['seats_sold']
if inb['cancellation_status'] != 'requested': fail('cancellation_requested', f"cancellation_status={inb['cancellation_status']}")
if inb['status'] != 'approved': fail('cancellation_requested', f"status={inb['status']} (must stay approved)")
if seats != seats_pre: fail('cancellation_requested', f'seats moved {seats_pre}->{seats}')
if db.journal_entries.count_documents({"tenant_id": T}) != jes_pre: fail('cancellation_requested', 'JE created (must be none)')
log(f"STEP1 PASS: cancellation_requested HTTP 200 | status stays approved | seats={seats} | no JE")

# ---- Step 2: position (Rahaal -> Meraaj Preview) ----
r = S.post(f"{BASE}/api/meraaj/inbound-bookings/{inb['id']}/cancellation/position", json={
    "position": "objection",
    "executed_services": [{"type": "visa", "status": "issued", "ref": "VISA-PRV-77", "cost": 300,
                           "currency": "SAR", "note": "تأشيرتان صادرتان",
                           "evidence": [{"kind": "url", "value": "https://example.com/visa-prv.pdf", "label": "إشعار إصدار"}]}],
    "notes": "خدمات نفذت قبل طلب الإلغاء — E2E Preview"})
if r.status_code != 200: fail('position/submit', f'HTTP {r.status_code}', r.text[:300])
inb = db.meraaj_inbound_bookings.find_one({"id": inb['id']})
seats = db.packages.find_one({"id": pkg_id})['meraaj']['seats_sold']
if inb['cancellation_status'] != 'position_submitted': fail('position', f"cancellation_status={inb['cancellation_status']}")
if db.journal_entries.count_documents({"tenant_id": T}) != jes_pre: fail('position', 'JE created (must be zero financial effect)')
if seats != seats_pre: fail('position', 'seats moved')
time.sleep(5)
evp = db.meraaj_events.find_one({"tenant_id": T, "type": "booking.cancellation.position", "payload.booking_ref": BREF})
if not evp: fail('position/outbox', 'event missing from outbox')
if evp.get('status') != 'sent': fail('position/outbox delivery', f"status={evp.get('status')}", f"last_error={evp.get('last_error')}")
log(f"STEP2 PASS: position submitted (objection, 300 SAR, 1 evidence) | outbox=sent to Meraaj Preview | ZERO financial effect | seats={seats}")

# ---- Step 3: Super Admin decision -> cancellation_finalized (Meraaj Preview -> Rahaal) PARTIAL ----
fin_id = f"e-prv-fin-{int(time.time()*1000)}"
r = webhook(fin_id, "meraaj.booking.cancellation_finalized", {
    "booking_ref": BREF, "decision": "cancelled", "original_amount": 2000,
    "refund_amount": 1500, "seller_compensation": 400, "platform_adjustment": 100,
    "currency": "SAR", "reason": "استرداد جزئي — قرار Super Admin (E2E Preview)", "decided_by": "super_admin"})
step3_http = r.status_code
if step3_http != 200: fail('cancellation_finalized', f'HTTP {step3_http}', r.text[:300])
resp3 = r.json()
inb = db.meraaj_inbound_bookings.find_one({"id": inb['id']})
seats = db.packages.find_one({"id": pkg_id})['meraaj']['seats_sold']
pb = db.package_bookings.find_one({"id": pb_id})
if inb['status'] != 'cancelled' or inb['cancellation_status'] != 'finalized_cancelled':
    fail('cancellation_finalized', f"status={inb['status']}/{inb['cancellation_status']}")
if seats != seats_pre - inb['seats']: fail('finalized/seats', f'seats {seats_pre}->{seats} expected {seats_pre - inb["seats"]}')
if pb['status'] != 'cancelled': fail('finalized', f'package_booking status={pb["status"]}')
settles = list(db.journal_entries.find({"tenant_id": T, "ref_type": "meraaj_escrow_settlement", "ref_id": pb_id}))
if len(settles) != 1: fail('finalized/settlement', f'count={len(settles)} expected 1')
d, c = bal(settles[0])
if d != c: fail('finalized/settlement', f'unbalanced D={d} C={c}')
lines = '; '.join(f"{l.get('account_code')} D{l.get('debit') or 0}/C{l.get('credit') or 0}" for l in settles[0]['lines'])
log(f"STEP3 PASS: finalized HTTP 200 | decision applied PARTIAL (2000=1500+400+100 SAR) | status->cancelled | seats {seats_pre}->{seats} (ONCE) | settlement JE balanced D={d}=C={c}")
log(f"        accounting_applied={resp3.get('accounting_applied')} kept_executed_costs={resp3.get('kept_executed_costs')} | lines: {lines}")

# ---- Step 4: duplicate finalized (same event id) -> no double posting ----
r = webhook(fin_id, "meraaj.booking.cancellation_finalized", {
    "booking_ref": BREF, "decision": "cancelled", "original_amount": 2000,
    "refund_amount": 1500, "seller_compensation": 400, "platform_adjustment": 100,
    "currency": "SAR", "reason": "استرداد جزئي — قرار Super Admin (E2E Preview)", "decided_by": "super_admin"})
if r.status_code != 200: fail('duplicate finalized', f'HTTP {r.status_code}', r.text[:300])
n = db.journal_entries.count_documents({"tenant_id": T, "ref_type": "meraaj_escrow_settlement", "ref_id": pb_id})
seats2 = db.packages.find_one({"id": pkg_id})['meraaj']['seats_sold']
if n != 1: fail('duplicate posting', f'settlement JE count={n} after resend')
if seats2 != seats: fail('duplicate seats', f'seats moved again {seats}->{seats2}')
log(f"STEP4 PASS: duplicate finalized ack (duplicate={r.json().get('duplicate')}) | STILL 1 settlement JE | seats STILL {seats2} — NO double posting")

# ---- Audit + outbox final ----
actions = [h.get('action') for h in inb.get('history', [])]
need = ['received', 'price_validated', 'approved', 'package_booking_created',
        'cancellation_requested', 'position_submitted', 'cancellation_finalized']
miss = [a for a in need if a not in actions]
if miss: fail('audit trail', f'missing: {miss}', f'present: {actions}')
eva = db.meraaj_events.find_one({"tenant_id": T, "type": "booking.approved", "payload.booking_ref": BREF})
log(f"AUDIT PASS: {actions}")
log(f"OUTBOX FINAL: booking.approved={eva.get('status')} | cancellation.position={evp.get('status')}")
log("\nE2E PREVIEW ESCROW: PASS")
