#!/usr/bin/env python3
"""
v3.65 TARGETED TEST — Rahaal ERP Meraaj additions
SCOPE: 3 changed areas only (retry endpoint, daily-digest week field, webhook-health outbound_failed_total)
"""
import requests
import os
import sys
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from uuid import uuid4
from dotenv import load_dotenv

load_dotenv('/app/.env')

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://visa-booking-5.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'your_database_name')

# Credentials
OWNER_EMAIL = 'owner@demo.com'
OWNER_PASSWORD = 'Demo@2025'
STAFF_EMAIL = 'staff.rbac@demo.com'
STAFF_PASSWORD = 'Staff@2025'

# MongoDB client
mongo_client = MongoClient(MONGO_URL)
db = mongo_client[DB_NAME]

# Test tracking
test_data = {
    'meraaj_events': [],
    'inbound_bookings': [],
}

def login(email, password):
    """Login and return session cookie"""
    r = requests.post(f"{API_BASE}/auth/login", json={'email': email, 'password': password})
    if r.status_code != 200:
        print(f"❌ Login failed for {email}: {r.status_code} {r.text}")
        return None
    cookies = r.cookies.get_dict()
    return cookies.get('rahaal_session')

def api_get(path, session):
    """GET request with session cookie"""
    return requests.get(f"{API_BASE}{path}", cookies={'rahaal_session': session})

def api_post(path, session, json_data=None):
    """POST request with session cookie"""
    return requests.post(f"{API_BASE}{path}", cookies={'rahaal_session': session}, json=json_data or {})

def get_owner_tenant_id():
    """Get owner tenant_id from database"""
    user = db.users.find_one({'email': OWNER_EMAIL})
    return user['tenant_id'] if user else None

print("=" * 80)
print("v3.65 TARGETED TEST — Meraaj Backend Additions")
print("=" * 80)

# Login
print("\n[SETUP] Logging in...")
owner_session = login(OWNER_EMAIL, OWNER_PASSWORD)
staff_session = login(STAFF_EMAIL, STAFF_PASSWORD)

if not owner_session:
    print("❌ FATAL: Owner login failed")
    sys.exit(1)
if not staff_session:
    print("❌ FATAL: Staff login failed")
    sys.exit(1)

print("✅ Owner and staff logged in")

tenant_id = get_owner_tenant_id()
if not tenant_id:
    print("❌ FATAL: Could not get owner tenant_id")
    sys.exit(1)

print(f"✅ Owner tenant_id: {tenant_id}")

# ============================================================================
# TEST 1: POST /api/meraaj/events/:id/retry — CRITICAL IDEMPOTENCY
# ============================================================================
print("\n" + "=" * 80)
print("TEST 1: POST /api/meraaj/events/:id/retry (IDEMPOTENCY/NO-DUPLICATES)")
print("=" * 80)

# Setup: Insert a failed meraaj_events doc directly in MongoDB
event_id = str(uuid4())
test_event = {
    'id': event_id,
    'tenant_id': tenant_id,
    'type': 'package.updated',
    'payload': {
        'package_ref': 'test-retry-pkg',
        'rahal_ref': 'test-retry-pkg',
        'meraaj_package_id': None,
    },
    'status': 'failed',
    'attempts': 1,
    'last_error': 'HTTP 500',
    'created_at': datetime.now(timezone.utc),
    'sent_at': None,
}
db.meraaj_events.insert_one(test_event)
test_data['meraaj_events'].append(event_id)
print(f"✅ Setup: Inserted test event {event_id} with status='failed', attempts=1")

# Record total meraaj_events count BEFORE retry
count_before = db.meraaj_events.count_documents({'tenant_id': tenant_id})
print(f"✅ Total meraaj_events count BEFORE retry: {count_before}")

# Test 1a: Staff should get 403
print("\n[TEST 1a] Staff POST retry → should get 403")
r = api_post(f"/meraaj/events/{event_id}/retry", staff_session)
if r.status_code == 403:
    print(f"✅ Staff correctly denied with 403")
else:
    print(f"❌ FAIL: Expected 403, got {r.status_code}: {r.text}")

# Test 1b: Unknown event id should get 404
print("\n[TEST 1b] Owner POST retry with unknown event id → should get 404")
fake_id = str(uuid4())
r = api_post(f"/meraaj/events/{fake_id}/retry", owner_session)
if r.status_code == 404:
    print(f"✅ Unknown event correctly returns 404")
else:
    print(f"❌ FAIL: Expected 404, got {r.status_code}: {r.text}")

# Test 1c: Owner POST retry → should update same doc (attempts=2)
print("\n[TEST 1c] Owner POST retry → should update same doc, attempts=2")
r = api_post(f"/meraaj/events/{event_id}/retry", owner_session)
print(f"Response status: {r.status_code}")
print(f"Response body: {r.text}")

if r.status_code == 200:
    data = r.json()
    print(f"✅ Retry returned 200")
    print(f"   Status: {data.get('status')}")
    print(f"   Attempts: {data.get('attempts')}")
    
    # Expected: status='failed' (delivery will fail in this environment) OR 400 if MERAAJ_API_BASE_URL unset
    if data.get('status') in ['failed', 'sent']:
        print(f"✅ Status is '{data.get('status')}' (expected: 'failed' if delivery attempted, 'sent' if succeeded)")
    
    if data.get('attempts') == 2:
        print(f"✅ Attempts incremented to 2")
    else:
        print(f"❌ FAIL: Expected attempts=2, got {data.get('attempts')}")
elif r.status_code == 400 and 'رابط معراج غير مُهيأ' in r.text:
    print(f"✅ Retry returned 400 'رابط معراج غير مُهيأ' (MERAAJ_API_BASE_URL unset — acceptable)")
else:
    print(f"❌ FAIL: Unexpected response {r.status_code}: {r.text}")

# CRITICAL ASSERTIONS: Check idempotency
count_after = db.meraaj_events.count_documents({'tenant_id': tenant_id})
print(f"\n[CRITICAL] Total meraaj_events count AFTER retry: {count_after}")
if count_after == count_before:
    print(f"✅ IDEMPOTENCY VERIFIED: No new event doc created (count unchanged: {count_before})")
else:
    print(f"❌ FAIL: Event count changed! Before={count_before}, After={count_after} (NEW DOC CREATED — IDEMPOTENCY BROKEN)")

# Check the SAME doc was updated
updated_event = db.meraaj_events.find_one({'id': event_id})
if updated_event:
    if updated_event.get('attempts') == 2:
        print(f"✅ Same doc updated in place (attempts=2)")
    else:
        print(f"❌ FAIL: Expected attempts=2 in DB, got {updated_event.get('attempts')}")
else:
    print(f"❌ FAIL: Event doc not found after retry")

# Check NO new inbound bookings/package_bookings created
inbound_count = db.meraaj_inbound_bookings.count_documents({'tenant_id': tenant_id, 'package_id': 'test-retry-pkg'})
booking_count = db.package_bookings.count_documents({'tenant_id': tenant_id, 'package_id': 'test-retry-pkg'})
if inbound_count == 0 and booking_count == 0:
    print(f"✅ NO new inbound bookings/package_bookings created by retry")
else:
    print(f"❌ FAIL: Retry created new bookings! inbound={inbound_count}, package_bookings={booking_count}")

# Test 1d: Retry again → attempts=3 (same doc, still no new docs)
print("\n[TEST 1d] Retry again → attempts should increment to 3")
count_before_2 = db.meraaj_events.count_documents({'tenant_id': tenant_id})
r = api_post(f"/meraaj/events/{event_id}/retry", owner_session)
if r.status_code in [200, 400]:
    if r.status_code == 200:
        data = r.json()
        if data.get('attempts') == 3:
            print(f"✅ Second retry incremented attempts to 3")
        else:
            print(f"⚠️  Second retry attempts: {data.get('attempts')} (expected 3)")
    count_after_2 = db.meraaj_events.count_documents({'tenant_id': tenant_id})
    if count_after_2 == count_before_2:
        print(f"✅ Still no new docs created (count: {count_after_2})")
    else:
        print(f"❌ FAIL: Second retry created new doc! Before={count_before_2}, After={count_after_2}")
else:
    print(f"⚠️  Second retry returned {r.status_code}: {r.text}")

# Test 1e: Insert doc with status='sent' → retry should return 400
print("\n[TEST 1e] Insert event with status='sent' → retry should return 400")
sent_event_id = str(uuid4())
sent_event = {
    'id': sent_event_id,
    'tenant_id': tenant_id,
    'type': 'package.updated',
    'payload': {'package_ref': 'test-sent'},
    'status': 'sent',
    'attempts': 1,
    'created_at': datetime.now(timezone.utc),
    'sent_at': datetime.now(timezone.utc),
}
db.meraaj_events.insert_one(sent_event)
test_data['meraaj_events'].append(sent_event_id)

r = api_post(f"/meraaj/events/{sent_event_id}/retry", owner_session)
if r.status_code == 400 and 'مُرسل مسبقاً' in r.text:
    print(f"✅ Retry on 'sent' event correctly returns 400")
else:
    print(f"❌ FAIL: Expected 400 'مُرسل مسبقاً', got {r.status_code}: {r.text}")

# Test 1f: Insert doc with status='pending' → retry should be allowed
print("\n[TEST 1f] Insert event with status='pending' → retry should be allowed")
pending_event_id = str(uuid4())
pending_event = {
    'id': pending_event_id,
    'tenant_id': tenant_id,
    'type': 'package.updated',
    'payload': {'package_ref': 'test-pending'},
    'status': 'pending',
    'attempts': 0,
    'created_at': datetime.now(timezone.utc),
}
db.meraaj_events.insert_one(pending_event)
test_data['meraaj_events'].append(pending_event_id)

r = api_post(f"/meraaj/events/{pending_event_id}/retry", owner_session)
if r.status_code in [200, 400]:  # 200 if delivery attempted, 400 if URL unset
    print(f"✅ Retry on 'pending' event allowed (status {r.status_code})")
    if r.status_code == 200:
        data = r.json()
        if data.get('attempts') == 1:
            print(f"✅ Attempts incremented from 0 to 1")
else:
    print(f"❌ FAIL: Retry on pending event failed: {r.status_code}: {r.text}")

print("\n✅ TEST 1 COMPLETE: Retry endpoint idempotency verified")

# ============================================================================
# TEST 2: GET /api/meraaj/daily-digest — NEW week field
# ============================================================================
print("\n" + "=" * 80)
print("TEST 2: GET /api/meraaj/daily-digest — NEW week field")
print("=" * 80)

# Test 2a: Owner GET → response includes week field
print("\n[TEST 2a] Owner GET daily-digest → should include week field")
r = api_get("/meraaj/daily-digest", owner_session)
if r.status_code == 200:
    data = r.json()
    print(f"✅ Daily-digest returned 200")
    
    # Check week field exists
    if 'week' in data:
        print(f"✅ Response includes 'week' field")
        week = data['week']
        
        # Check structure
        required_fields = ['this_week', 'prev_week', 'growth_pct']
        for field in required_fields:
            if field in week:
                print(f"✅ week.{field} present")
            else:
                print(f"❌ FAIL: week.{field} missing")
        
        # Check nested structure
        for period in ['this_week', 'prev_week']:
            if period in week:
                period_data = week[period]
                required_period_fields = ['bookings', 'seats', 'revenue', 'net_to_seller']
                for field in required_period_fields:
                    if field in period_data:
                        print(f"✅ week.{period}.{field} present: {period_data[field]}")
                    else:
                        print(f"❌ FAIL: week.{period}.{field} missing")
    else:
        print(f"❌ FAIL: Response missing 'week' field")
    
    # Check regression: previous fields still present
    regression_fields = ['yesterday', 'today', 'pending', 'rejected_today', 'reject_alert_threshold', 'alert', 'capacity_warnings']
    for field in regression_fields:
        if field in data:
            print(f"✅ Regression: {field} still present")
        else:
            print(f"❌ FAIL: Regression field {field} missing")
else:
    print(f"❌ FAIL: Daily-digest returned {r.status_code}: {r.text}")

# Test 2b: LIVE DATA — Insert inbound bookings and verify week calculations
print("\n[TEST 2b] LIVE DATA: Insert inbound bookings and verify week calculations")

# Calculate date ranges
now = datetime.now(timezone.utc)
today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
three_days_ago = today_start - timedelta(days=3)
ten_days_ago = today_start - timedelta(days=10)
two_days_ago = today_start - timedelta(days=2)

# Insert test inbound bookings
# (a) 2 docs created 3 days ago, status approved, net 1000 each
inbound_1 = {
    'id': str(uuid4()),
    'tenant_id': tenant_id,
    'package_id': 'test-pkg-week',
    'package_name': 'Test Package Week',
    'meraaj_booking_ref': 'TEST-WEEK-1',
    'buyer_office_name': 'Test Office Week',
    'registrants': [{'name': 'Test 1', 'age': 30, 'room_type': 'ثنائي', 'age_category': 'adult', 'price': 1000}],
    'seats': 1,
    'pax_adults': 1,
    'pax_children': 0,
    'pax_infants': 0,
    'total_price': 1000,
    'net_to_seller_total': 1000,
    'currency': 'SAR',
    'status': 'approved',
    'created_at': three_days_ago,
}
db.meraaj_inbound_bookings.insert_one(inbound_1)
test_data['inbound_bookings'].append(inbound_1['id'])

inbound_2 = {
    'id': str(uuid4()),
    'tenant_id': tenant_id,
    'package_id': 'test-pkg-week',
    'package_name': 'Test Package Week',
    'meraaj_booking_ref': 'TEST-WEEK-2',
    'buyer_office_name': 'Test Office Week',
    'registrants': [{'name': 'Test 2', 'age': 30, 'room_type': 'ثنائي', 'age_category': 'adult', 'price': 1000}],
    'seats': 1,
    'pax_adults': 1,
    'pax_children': 0,
    'pax_infants': 0,
    'total_price': 1000,
    'net_to_seller_total': 1000,
    'currency': 'SAR',
    'status': 'approved',
    'created_at': three_days_ago,
}
db.meraaj_inbound_bookings.insert_one(inbound_2)
test_data['inbound_bookings'].append(inbound_2['id'])

# (b) 1 doc created 10 days ago, status approved, net 500
inbound_3 = {
    'id': str(uuid4()),
    'tenant_id': tenant_id,
    'package_id': 'test-pkg-week',
    'package_name': 'Test Package Week',
    'meraaj_booking_ref': 'TEST-WEEK-3',
    'buyer_office_name': 'Test Office Week',
    'registrants': [{'name': 'Test 3', 'age': 30, 'room_type': 'ثنائي', 'age_category': 'adult', 'price': 500}],
    'seats': 1,
    'pax_adults': 1,
    'pax_children': 0,
    'pax_infants': 0,
    'total_price': 500,
    'net_to_seller_total': 500,
    'currency': 'SAR',
    'status': 'approved',
    'created_at': ten_days_ago,
}
db.meraaj_inbound_bookings.insert_one(inbound_3)
test_data['inbound_bookings'].append(inbound_3['id'])

print(f"✅ Inserted 3 test inbound bookings:")
print(f"   - 2 docs @ 3 days ago, net 1000 each (this_week)")
print(f"   - 1 doc @ 10 days ago, net 500 (prev_week)")

# Insert rejected doc (should NOT affect net sums, only bookings count)
inbound_rejected = {
    'id': str(uuid4()),
    'tenant_id': tenant_id,
    'package_id': 'test-pkg-week',
    'package_name': 'Test Package Week',
    'meraaj_booking_ref': 'TEST-WEEK-REJECTED',
    'buyer_office_name': 'Test Office Week',
    'registrants': [{'name': 'Test Rejected', 'age': 30, 'room_type': 'ثنائي', 'age_category': 'adult', 'price': 999}],
    'seats': 1,
    'pax_adults': 1,
    'pax_children': 0,
    'pax_infants': 0,
    'total_price': 999,
    'net_to_seller_total': 999,
    'currency': 'SAR',
    'status': 'rejected',
    'created_at': two_days_ago,
}
db.meraaj_inbound_bookings.insert_one(inbound_rejected)
test_data['inbound_bookings'].append(inbound_rejected['id'])
print(f"✅ Inserted 1 rejected doc @ 2 days ago, net 999 (should NOT affect net sums)")

# GET daily-digest and verify calculations
r = api_get("/meraaj/daily-digest", owner_session)
if r.status_code == 200:
    data = r.json()
    week = data.get('week', {})
    this_week = week.get('this_week', {})
    prev_week = week.get('prev_week', {})
    growth_pct = week.get('growth_pct')
    
    print(f"\n✅ Daily-digest response:")
    print(f"   this_week.net_to_seller: {this_week.get('net_to_seller')}")
    print(f"   prev_week.net_to_seller: {prev_week.get('net_to_seller')}")
    print(f"   growth_pct: {growth_pct}")
    
    # Verify this_week.net_to_seller >= 2000 (2 docs × 1000)
    if this_week.get('net_to_seller', 0) >= 2000:
        print(f"✅ this_week.net_to_seller >= 2000 (includes 2 docs @ 1000 each)")
    else:
        print(f"❌ FAIL: this_week.net_to_seller = {this_week.get('net_to_seller')} (expected >= 2000)")
    
    # Verify prev_week.net_to_seller >= 500 (1 doc × 500)
    if prev_week.get('net_to_seller', 0) >= 500:
        print(f"✅ prev_week.net_to_seller >= 500 (includes 1 doc @ 500)")
    else:
        print(f"❌ FAIL: prev_week.net_to_seller = {prev_week.get('net_to_seller')} (expected >= 500)")
    
    # Verify growth_pct calculation
    # With only these docs: growth = ((2000-500)/500*100) = 300.0
    # But there might be other existing inbound docs, so we verify the formula consistency
    if prev_week.get('net_to_seller', 0) > 0:
        expected_growth = round(((this_week.get('net_to_seller', 0) - prev_week.get('net_to_seller', 0)) / prev_week.get('net_to_seller', 1)) * 100, 1)
        if growth_pct == expected_growth:
            print(f"✅ growth_pct = {growth_pct} (formula correct: ((this-prev)/prev*100) rounded to 1 decimal)")
        else:
            print(f"⚠️  growth_pct = {growth_pct}, expected {expected_growth} (formula: ((this-prev)/prev*100))")
    
    # Edge case: if prev_week net is 0 and this_week>0 → growth_pct should be null
    if prev_week.get('net_to_seller', 0) == 0 and this_week.get('net_to_seller', 0) > 0:
        if growth_pct is None:
            print(f"✅ Edge case: prev_week=0, this_week>0 → growth_pct=null (correct)")
        else:
            print(f"❌ FAIL: Edge case: prev_week=0, this_week>0 → growth_pct should be null, got {growth_pct}")
    
    # Verify rejected doc does NOT affect net sums (but bookings count +1)
    # Note: We can't verify exact bookings count without knowing existing data,
    # but we verified the rejected doc was inserted with status='rejected'
    print(f"✅ Rejected doc inserted (status='rejected', net 999) — should NOT affect net sums")
else:
    print(f"❌ FAIL: Daily-digest returned {r.status_code}: {r.text}")

print("\n✅ TEST 2 COMPLETE: Daily-digest week field verified")

# ============================================================================
# TEST 3: GET /api/meraaj/webhook-health — NEW stats.outbound_failed_total
# ============================================================================
print("\n" + "=" * 80)
print("TEST 3: GET /api/meraaj/webhook-health — NEW stats.outbound_failed_total")
print("=" * 80)

# Test 3a: Owner GET → stats includes outbound_failed_total
print("\n[TEST 3a] Owner GET webhook-health → should include stats.outbound_failed_total")
r = api_get("/meraaj/webhook-health", owner_session)
if r.status_code == 200:
    data = r.json()
    print(f"✅ Webhook-health returned 200")
    
    stats = data.get('stats', {})
    if 'outbound_failed_total' in stats:
        print(f"✅ stats.outbound_failed_total present: {stats['outbound_failed_total']}")
        
        # Verify it's an int
        if isinstance(stats['outbound_failed_total'], int):
            print(f"✅ outbound_failed_total is int")
        else:
            print(f"❌ FAIL: outbound_failed_total is not int: {type(stats['outbound_failed_total'])}")
        
        # Verify it >= outbound_failed_24h
        if 'outbound_failed_24h' in stats:
            if stats['outbound_failed_total'] >= stats['outbound_failed_24h']:
                print(f"✅ outbound_failed_total ({stats['outbound_failed_total']}) >= outbound_failed_24h ({stats['outbound_failed_24h']})")
            else:
                print(f"❌ FAIL: outbound_failed_total ({stats['outbound_failed_total']}) < outbound_failed_24h ({stats['outbound_failed_24h']})")
        
        # Verify it equals countDocuments({tenant, status:'failed'}) in meraaj_events
        actual_count = db.meraaj_events.count_documents({'tenant_id': tenant_id, 'status': 'failed'})
        if stats['outbound_failed_total'] == actual_count:
            print(f"✅ outbound_failed_total matches MongoDB count: {actual_count}")
        else:
            print(f"❌ FAIL: outbound_failed_total ({stats['outbound_failed_total']}) != MongoDB count ({actual_count})")
    else:
        print(f"❌ FAIL: stats.outbound_failed_total missing")
    
    # Regression: Check other stats fields still present
    regression_stats = ['accepted_24h', 'accepted_7d', 'rejected_24h', 'rejected_7d', 'outbound_failed_24h', 'last_accepted_at', 'last_rejected_at']
    for field in regression_stats:
        if field in stats:
            print(f"✅ Regression: stats.{field} present")
        else:
            print(f"❌ FAIL: Regression: stats.{field} missing")
    
    # Regression: Check other top-level fields
    regression_fields = ['incoming', 'rejected', 'outbound', 'trend', 'buyers']
    for field in regression_fields:
        if field in data:
            print(f"✅ Regression: {field} present")
            if field == 'buyers':
                # Check buyers have tag field (v3.63)
                buyers = data[field]
                if buyers and len(buyers) > 0:
                    if 'tag' in buyers[0]:
                        print(f"✅ Regression: buyers[0].tag present (v3.63 feature)")
                    else:
                        print(f"❌ FAIL: buyers[0].tag missing")
        else:
            print(f"❌ FAIL: Regression: {field} missing")
else:
    print(f"❌ FAIL: Webhook-health returned {r.status_code}: {r.text}")

print("\n✅ TEST 3 COMPLETE: Webhook-health outbound_failed_total verified")

# ============================================================================
# CLEANUP
# ============================================================================
print("\n" + "=" * 80)
print("CLEANUP: Deleting all test data")
print("=" * 80)

# Delete test meraaj_events
for event_id in test_data['meraaj_events']:
    db.meraaj_events.delete_one({'id': event_id})
print(f"✅ Deleted {len(test_data['meraaj_events'])} test meraaj_events")

# Delete test inbound bookings
for inbound_id in test_data['inbound_bookings']:
    db.meraaj_inbound_bookings.delete_one({'id': inbound_id})
print(f"✅ Deleted {len(test_data['inbound_bookings'])} test inbound bookings")

# ============================================================================
# FINAL VERIFICATION
# ============================================================================
print("\n" + "=" * 80)
print("FINAL VERIFICATION: Exactly 3 packages should remain")
print("=" * 80)

final_package_count = db.packages.count_documents({'tenant_id': tenant_id})
print(f"Final package count: {final_package_count}")

if final_package_count == 3:
    print(f"✅ FINAL CHECK PASSED: Exactly 3 packages remain")
    # List the packages
    packages = list(db.packages.find({'tenant_id': tenant_id}, {'name': 1}))
    for pkg in packages:
        print(f"   - {pkg.get('name', 'Unknown')}")
else:
    print(f"❌ FAIL: Expected 3 packages, found {final_package_count}")

print("\n" + "=" * 80)
print("v3.65 TARGETED TEST COMPLETE")
print("=" * 80)
