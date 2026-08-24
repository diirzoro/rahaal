#!/usr/bin/env python3
"""
v3.62 BACKEND TESTING - NEW FEATURES
- FEATURE A: daily-digest capacity_warnings
- FEATURE B: monthly-report endpoint
"""

import requests
import json
import hmac
import hashlib
from pymongo import MongoClient
from datetime import datetime, timedelta
import time

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "your_database_name"
MERAAJ_SHARED_SECRET = "d81273d7aaefbd96b0813cfe9f1cbb5c61eebbc597995e8d5fab5ab38ce00168"

# Credentials
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "Demo@2025"
STAFF_EMAIL = "staff.rbac@demo.com"
STAFF_PASSWORD = "Staff@2025"

# Test data tracking
test_data = {
    "packages": [],
    "inbound_bookings": []
}

owner_session = None
staff_session = None

def log_test(test_num, description, status, details=""):
    """Log test results"""
    symbol = "✅ PASS" if status == "PASS" else "❌ FAIL"
    print(f"\n{symbol} - TEST {test_num}: {description}")
    if details:
        print(f"   {details}")

def login(email, password):
    """Login and return session"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if response.status_code == 200:
        return session
    else:
        print(f"Login failed for {email}: {response.status_code}")
        return None

def compute_hmac_signature(payload_str):
    """Compute HMAC-SHA256 hex signature"""
    return hmac.new(
        MERAAJ_SHARED_SECRET.encode('utf-8'),
        payload_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

def get_mongo_client():
    """Get MongoDB client"""
    return MongoClient(MONGO_URL)

def get_tenant_id():
    """Get tenant_id for owner@demo.com"""
    client = get_mongo_client()
    db = client[DB_NAME]
    user = db.users.find_one({"email": OWNER_EMAIL})
    if user:
        return user.get("tenant_id")
    return None

# ============================================================================
# FEATURE A: daily-digest capacity_warnings
# ============================================================================

def test_feature_a():
    """Test capacity_warnings in daily-digest"""
    global owner_session, staff_session
    
    print("\n" + "="*80)
    print("FEATURE A: daily-digest capacity_warnings")
    print("="*80)
    
    # Login
    owner_session = login(OWNER_EMAIL, OWNER_PASSWORD)
    staff_session = login(STAFF_EMAIL, STAFF_PASSWORD)
    
    if not owner_session or not staff_session:
        log_test("A-SETUP", "Login", "FAIL", "Failed to login")
        return False
    
    client = get_mongo_client()
    db = client[DB_NAME]
    tenant_id = get_tenant_id()
    
    if not tenant_id:
        log_test("A-SETUP", "Get tenant_id", "FAIL", "Could not find tenant_id")
        return False
    
    # TEST 1: Create 3 test packages directly in MongoDB
    print("\n--- TEST 1: Create test packages with different capacity scenarios ---")
    
    # P1: 90% capacity (seats_allocated=10, seats_sold=9) → WARN
    p1_id = f"pkg-v362-p1-{int(time.time())}"
    p1_doc = {
        "id": p1_id,
        "tenant_id": tenant_id,
        "name": "V362 TEST P1 (90% capacity)",
        "package_type": "عمرة",
        "status": "open",
        "archived": False,
        "room_pricing": [{"type": "ثنائي", "sale_per_pax": 1000}],
        "meraaj": {
            "shared": True,
            "seats_allocated": 10,
            "seats_sold": 9
        },
        "created_at": datetime.utcnow()
    }
    db.packages.insert_one(p1_doc)
    test_data["packages"].append(p1_id)
    
    # P2: 50% capacity (seats_allocated=10, seats_sold=5) → NO WARN
    p2_id = f"pkg-v362-p2-{int(time.time())}"
    p2_doc = {
        "id": p2_id,
        "tenant_id": tenant_id,
        "name": "V362 TEST P2 (50% capacity)",
        "package_type": "عمرة",
        "status": "open",
        "archived": False,
        "room_pricing": [{"type": "ثنائي", "sale_per_pax": 1000}],
        "meraaj": {
            "shared": True,
            "seats_allocated": 10,
            "seats_sold": 5
        },
        "created_at": datetime.utcnow()
    }
    db.packages.insert_one(p2_doc)
    test_data["packages"].append(p2_id)
    
    # P3: 75% capacity BUT remaining=1 (seats_allocated=4, seats_sold=3) → WARN
    p3_id = f"pkg-v362-p3-{int(time.time())}"
    p3_doc = {
        "id": p3_id,
        "tenant_id": tenant_id,
        "name": "V362 TEST P3 (75% but remaining=1)",
        "package_type": "عمرة",
        "status": "open",
        "archived": False,
        "room_pricing": [{"type": "ثنائي", "sale_per_pax": 1000}],
        "meraaj": {
            "shared": True,
            "seats_allocated": 4,
            "seats_sold": 3
        },
        "created_at": datetime.utcnow()
    }
    db.packages.insert_one(p3_doc)
    test_data["packages"].append(p3_id)
    
    # P4: 100% capacity BUT status='closed' (seats_allocated=10, seats_sold=10) → MUST NOT APPEAR
    p4_id = f"pkg-v362-p4-{int(time.time())}"
    p4_doc = {
        "id": p4_id,
        "tenant_id": tenant_id,
        "name": "V362 TEST P4 (100% but closed)",
        "package_type": "عمرة",
        "status": "closed",
        "archived": False,
        "room_pricing": [{"type": "ثنائي", "sale_per_pax": 1000}],
        "meraaj": {
            "shared": True,
            "seats_allocated": 10,
            "seats_sold": 10
        },
        "created_at": datetime.utcnow()
    }
    db.packages.insert_one(p4_doc)
    test_data["packages"].append(p4_id)
    
    log_test("1", "Create 4 test packages in MongoDB", "PASS", 
             f"P1 (90%), P2 (50%), P3 (75% remaining=1), P4 (100% closed)")
    
    # TEST 2: Owner GET daily-digest → verify capacity_warnings
    print("\n--- TEST 2: Verify capacity_warnings in daily-digest ---")
    
    response = owner_session.get(f"{BASE_URL}/meraaj/daily-digest")
    if response.status_code != 200:
        log_test("2a", "Owner GET daily-digest", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    
    # Verify capacity_warnings field exists
    if "capacity_warnings" not in data:
        log_test("2a", "Verify capacity_warnings field exists", "FAIL", "Missing capacity_warnings field")
        return False
    
    log_test("2a", "Owner GET daily-digest", "PASS", "Response includes capacity_warnings field")
    
    # Verify capacity_warnings content
    warnings = data["capacity_warnings"]
    
    # Should contain exactly P1 and P3 (P2 below threshold, P4 is closed)
    warning_ids = [w["id"] for w in warnings]
    
    if p1_id not in warning_ids:
        log_test("2b", "P1 (90%) in warnings", "FAIL", f"P1 not found in warnings: {warning_ids}")
        return False
    
    if p3_id not in warning_ids:
        log_test("2b", "P3 (75% remaining=1) in warnings", "FAIL", f"P3 not found in warnings: {warning_ids}")
        return False
    
    if p2_id in warning_ids:
        log_test("2b", "P2 (50%) NOT in warnings", "FAIL", f"P2 should not be in warnings: {warning_ids}")
        return False
    
    if p4_id in warning_ids:
        log_test("2b", "P4 (closed) NOT in warnings", "FAIL", f"P4 (closed) should not be in warnings: {warning_ids}")
        return False
    
    log_test("2b", "Verify warnings contain P1 and P3 only", "PASS", 
             f"Warnings: {len(warnings)} packages (P1, P3)")
    
    # Verify P1 details
    p1_warning = next((w for w in warnings if w["id"] == p1_id), None)
    if not p1_warning:
        log_test("2c", "P1 warning details", "FAIL", "P1 not found")
        return False
    
    if p1_warning["seats_allocated"] != 10 or p1_warning["seats_sold"] != 9:
        log_test("2c", "P1 seats details", "FAIL", 
                 f"Expected allocated=10, sold=9; got allocated={p1_warning['seats_allocated']}, sold={p1_warning['seats_sold']}")
        return False
    
    if p1_warning["remaining"] != 1:
        log_test("2c", "P1 remaining", "FAIL", f"Expected remaining=1, got {p1_warning['remaining']}")
        return False
    
    if p1_warning["pct"] != 90:
        log_test("2c", "P1 percentage", "FAIL", f"Expected pct=90, got {p1_warning['pct']}")
        return False
    
    log_test("2c", "P1 warning details", "PASS", 
             f"allocated=10, sold=9, remaining=1, pct=90")
    
    # Verify P3 details
    p3_warning = next((w for w in warnings if w["id"] == p3_id), None)
    if not p3_warning:
        log_test("2d", "P3 warning details", "FAIL", "P3 not found")
        return False
    
    if p3_warning["seats_allocated"] != 4 or p3_warning["seats_sold"] != 3:
        log_test("2d", "P3 seats details", "FAIL", 
                 f"Expected allocated=4, sold=3; got allocated={p3_warning['seats_allocated']}, sold={p3_warning['seats_sold']}")
        return False
    
    if p3_warning["remaining"] != 1:
        log_test("2d", "P3 remaining", "FAIL", f"Expected remaining=1, got {p3_warning['remaining']}")
        return False
    
    if p3_warning["pct"] != 75:
        log_test("2d", "P3 percentage", "FAIL", f"Expected pct=75, got {p3_warning['pct']}")
        return False
    
    log_test("2d", "P3 warning details", "PASS", 
             f"allocated=4, sold=3, remaining=1, pct=75")
    
    # Verify sorting (P1 should be first with pct=90, P3 second with pct=75)
    if warnings[0]["id"] != p1_id:
        log_test("2e", "Warnings sorted by pct desc", "FAIL", 
                 f"Expected P1 first (pct=90), got {warnings[0]['id']} (pct={warnings[0]['pct']})")
        return False
    
    log_test("2e", "Warnings sorted by pct desc", "PASS", "P1 (90%) before P3 (75%)")
    
    # TEST 2f: Staff GET daily-digest → 403 (regression)
    response = staff_session.get(f"{BASE_URL}/meraaj/daily-digest")
    if response.status_code != 403:
        log_test("2f", "Staff GET daily-digest (403)", "FAIL", 
                 f"Expected 403, got {response.status_code}")
        return False
    
    log_test("2f", "Staff GET daily-digest (RBAC)", "PASS", "403 (owner-only)")
    
    return True

# ============================================================================
# FEATURE B: monthly-report endpoint
# ============================================================================

def test_feature_b():
    """Test monthly-report endpoint"""
    print("\n" + "="*80)
    print("FEATURE B: GET /api/meraaj/monthly-report")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    tenant_id = get_tenant_id()
    
    # TEST 3: RBAC and validation
    print("\n--- TEST 3: RBAC and validation ---")
    
    # 3a: Staff GET → 403
    response = staff_session.get(f"{BASE_URL}/meraaj/monthly-report")
    if response.status_code != 403:
        log_test("3a", "Staff GET monthly-report (403)", "FAIL", 
                 f"Expected 403, got {response.status_code}")
        return False
    
    log_test("3a", "Staff GET monthly-report (RBAC)", "PASS", "403 (owner-only)")
    
    # 3b: Bad month format '2026-13' → 400
    response = owner_session.get(f"{BASE_URL}/meraaj/monthly-report?month=2026-13")
    if response.status_code != 400:
        log_test("3b", "Invalid month '2026-13' (400)", "FAIL", 
                 f"Expected 400, got {response.status_code}")
        return False
    
    log_test("3b", "Invalid month '2026-13'", "PASS", "400")
    
    # 3c: Bad month format 'abc' → 400
    response = owner_session.get(f"{BASE_URL}/meraaj/monthly-report?month=abc")
    if response.status_code != 400:
        log_test("3c", "Invalid month 'abc' (400)", "FAIL", 
                 f"Expected 400, got {response.status_code}")
        return False
    
    log_test("3c", "Invalid month 'abc'", "PASS", "400")
    
    # 3d: Missing month param → 200 (defaults to current month)
    response = owner_session.get(f"{BASE_URL}/meraaj/monthly-report")
    if response.status_code != 200:
        log_test("3d", "Missing month param (defaults to current)", "FAIL", 
                 f"Expected 200, got {response.status_code}")
        return False
    
    data = response.json()
    current_month = datetime.utcnow().strftime("%Y-%m")
    if data.get("month") != current_month:
        log_test("3d", "Default to current month", "FAIL", 
                 f"Expected month={current_month}, got {data.get('month')}")
        return False
    
    log_test("3d", "Missing month param", "PASS", f"Defaults to current month: {current_month}")
    
    # TEST 4: LIVE data test
    print("\n--- TEST 4: LIVE data with inbound bookings ---")
    
    # Use P1 from Feature A tests (already exists)
    p1_id = test_data["packages"][0]
    p1_doc = db.packages.find_one({"id": p1_id})
    p1_name = p1_doc["name"]
    
    # Get current month and last month
    now = datetime.utcnow()
    current_month = now.strftime("%Y-%m")
    last_month_date = now.replace(day=1) - timedelta(days=1)
    last_month = last_month_date.strftime("%Y-%m")
    
    # Insert inbound bookings for CURRENT month
    # (a) 2 docs office 'مكتب أ' status 'approved' seats 2 total 2000 net 1800 each
    inbound_1a = {
        "_id": f"inbound-v362-1a-{int(time.time())}",
        "tenant_id": tenant_id,
        "package_id": p1_id,
        "package_name": p1_name,
        "buyer_office_name": "مكتب أ",
        "status": "approved",
        "seats": 2,
        "total_price": 2000,
        "net_to_seller_total": 1800,
        "currency": "SAR",
        "created_at": now,
        "registrants": [{"name": "مسافر 1", "age": 30}]
    }
    db.meraaj_inbound_bookings.insert_one(inbound_1a)
    test_data["inbound_bookings"].append(inbound_1a["_id"])
    
    inbound_1b = {
        "_id": f"inbound-v362-1b-{int(time.time())}",
        "tenant_id": tenant_id,
        "package_id": p1_id,
        "package_name": p1_name,
        "buyer_office_name": "مكتب أ",
        "status": "approved",
        "seats": 2,
        "total_price": 2000,
        "net_to_seller_total": 1800,
        "currency": "SAR",
        "created_at": now,
        "registrants": [{"name": "مسافر 2", "age": 30}]
    }
    db.meraaj_inbound_bookings.insert_one(inbound_1b)
    test_data["inbound_bookings"].append(inbound_1b["_id"])
    
    # (b) 1 doc office 'مكتب ب' status 'new' seats 1 total 1000 net 900
    inbound_2 = {
        "_id": f"inbound-v362-2-{int(time.time())}",
        "tenant_id": tenant_id,
        "package_id": p1_id,
        "package_name": p1_name,
        "buyer_office_name": "مكتب ب",
        "status": "new",
        "seats": 1,
        "total_price": 1000,
        "net_to_seller_total": 900,
        "currency": "SAR",
        "created_at": now,
        "registrants": [{"name": "مسافر 3", "age": 30}]
    }
    db.meraaj_inbound_bookings.insert_one(inbound_2)
    test_data["inbound_bookings"].append(inbound_2["_id"])
    
    # (c) 1 doc office 'مكتب أ' status 'rejected' seats 3 total 3000 net 2700
    inbound_3 = {
        "_id": f"inbound-v362-3-{int(time.time())}",
        "tenant_id": tenant_id,
        "package_id": p1_id,
        "package_name": p1_name,
        "buyer_office_name": "مكتب أ",
        "status": "rejected",
        "seats": 3,
        "total_price": 3000,
        "net_to_seller_total": 2700,
        "currency": "SAR",
        "created_at": now,
        "registrants": [{"name": "مسافر 4", "age": 30}]
    }
    db.meraaj_inbound_bookings.insert_one(inbound_3)
    test_data["inbound_bookings"].append(inbound_3["_id"])
    
    # Insert 1 doc for LAST month (must not appear in current month report)
    last_month_start = last_month_date.replace(day=15)
    inbound_last = {
        "_id": f"inbound-v362-last-{int(time.time())}",
        "tenant_id": tenant_id,
        "package_id": p1_id,
        "package_name": p1_name,
        "buyer_office_name": "مكتب ج",
        "status": "approved",
        "seats": 1,
        "total_price": 1000,
        "net_to_seller_total": 900,
        "currency": "SAR",
        "created_at": last_month_start,
        "registrants": [{"name": "مسافر قديم", "age": 30}]
    }
    db.meraaj_inbound_bookings.insert_one(inbound_last)
    test_data["inbound_bookings"].append(inbound_last["_id"])
    
    log_test("4a", "Insert test inbound bookings", "PASS", 
             f"4 docs for current month, 1 doc for last month")
    
    # GET monthly-report for CURRENT month
    response = owner_session.get(f"{BASE_URL}/meraaj/monthly-report?month={current_month}")
    if response.status_code != 200:
        log_test("4b", "GET monthly-report (current month)", "FAIL", 
                 f"Status: {response.status_code}, Body: {response.text}")
        return False
    
    data = response.json()
    
    # Verify response structure
    required_fields = ["month", "packages", "offices", "totals", "rejected_webhooks", "outbound_events"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        log_test("4b", "Verify response structure", "FAIL", f"Missing fields: {missing}")
        return False
    
    log_test("4b", "GET monthly-report (current month)", "PASS", "All required fields present")
    
    # Verify packages aggregation
    packages = data["packages"]
    p1_agg = next((p for p in packages if p["name"] == p1_name), None)
    
    if not p1_agg:
        log_test("4c", "Find P1 in packages", "FAIL", f"P1 not found in packages: {[p['name'] for p in packages]}")
        return False
    
    # Expected: bookings=4 (all 4 docs), approved=2, rejected=1, seats=5 (2+2+1, excluding rejected), 
    # revenue=5000 (2000+2000+1000, excluding rejected), net=4500 (1800+1800+900, excluding rejected)
    expected = {
        "bookings": 4,
        "approved": 2,
        "rejected": 1,
        "seats": 5,
        "revenue": 5000,
        "net_to_seller": 4500
    }
    
    for key, expected_val in expected.items():
        actual_val = p1_agg.get(key)
        if actual_val != expected_val:
            log_test("4c", f"P1 {key}", "FAIL", f"Expected {expected_val}, got {actual_val}")
            return False
    
    log_test("4c", "P1 package aggregation", "PASS", 
             f"bookings=4, approved=2, rejected=1, seats=5, revenue=5000, net=4500")
    
    # Verify offices aggregation
    offices = data["offices"]
    
    # مكتب أ: bookings=3 (2 approved + 1 rejected), approved=2, rejected=1, 
    # seats=4 (2+2, excluding rejected), revenue=4000 (2000+2000), net=3600 (1800+1800)
    office_a = next((o for o in offices if o["office"] == "مكتب أ"), None)
    if not office_a:
        log_test("4d", "Find مكتب أ in offices", "FAIL", f"Not found: {[o['office'] for o in offices]}")
        return False
    
    expected_a = {
        "bookings": 3,
        "approved": 2,
        "rejected": 1,
        "seats": 4,
        "revenue": 4000,
        "net_to_seller": 3600
    }
    
    for key, expected_val in expected_a.items():
        actual_val = office_a.get(key)
        if actual_val != expected_val:
            log_test("4d", f"مكتب أ {key}", "FAIL", f"Expected {expected_val}, got {actual_val}")
            return False
    
    log_test("4d", "مكتب أ office aggregation", "PASS", 
             f"bookings=3, approved=2, rejected=1, seats=4, revenue=4000, net=3600")
    
    # مكتب ب: bookings=1, approved=0, rejected=0, seats=1, revenue=1000, net=900
    office_b = next((o for o in offices if o["office"] == "مكتب ب"), None)
    if not office_b:
        log_test("4e", "Find مكتب ب in offices", "FAIL", f"Not found: {[o['office'] for o in offices]}")
        return False
    
    expected_b = {
        "bookings": 1,
        "approved": 0,
        "rejected": 0,
        "seats": 1,
        "revenue": 1000,
        "net_to_seller": 900
    }
    
    for key, expected_val in expected_b.items():
        actual_val = office_b.get(key)
        if actual_val != expected_val:
            log_test("4e", f"مكتب ب {key}", "FAIL", f"Expected {expected_val}, got {actual_val}")
            return False
    
    log_test("4e", "مكتب ب office aggregation", "PASS", 
             f"bookings=1, seats=1, revenue=1000, net=900")
    
    # Verify offices sorted by revenue desc (مكتب أ should be first)
    if offices[0]["office"] != "مكتب أ":
        log_test("4f", "Offices sorted by revenue desc", "FAIL", 
                 f"Expected مكتب أ first, got {offices[0]['office']}")
        return False
    
    log_test("4f", "Offices sorted by revenue desc", "PASS", "مكتب أ (4000) before مكتب ب (1000)")
    
    # Verify totals
    totals = data["totals"]
    expected_totals = {
        "bookings": 4,
        "approved": 2,
        "rejected": 1,
        "seats": 5,
        "revenue": 5000,
        "net_to_seller": 4500
    }
    
    for key, expected_val in expected_totals.items():
        actual_val = totals.get(key)
        if actual_val != expected_val:
            log_test("4g", f"Totals {key}", "FAIL", f"Expected {expected_val}, got {actual_val}")
            return False
    
    log_test("4g", "Totals aggregation", "PASS", 
             f"bookings=4, approved=2, rejected=1, seats=5, revenue=5000, net=4500")
    
    # Verify rejected_webhooks and outbound_events are ints
    if not isinstance(data["rejected_webhooks"], int):
        log_test("4h", "rejected_webhooks is int", "FAIL", 
                 f"Expected int, got {type(data['rejected_webhooks'])}")
        return False
    
    if not isinstance(data["outbound_events"], int):
        log_test("4h", "outbound_events is int", "FAIL", 
                 f"Expected int, got {type(data['outbound_events'])}")
        return False
    
    log_test("4h", "rejected_webhooks and outbound_events", "PASS", 
             f"Both are ints: rejected_webhooks={data['rejected_webhooks']}, outbound_events={data['outbound_events']}")
    
    # GET monthly-report for LAST month (should contain only the last-month doc)
    response = owner_session.get(f"{BASE_URL}/meraaj/monthly-report?month={last_month}")
    if response.status_code != 200:
        log_test("4i", "GET monthly-report (last month)", "FAIL", 
                 f"Status: {response.status_code}")
        return False
    
    data = response.json()
    
    # Should have 1 booking from مكتب ج
    if data["totals"]["bookings"] != 1:
        log_test("4i", "Last month totals.bookings", "FAIL", 
                 f"Expected 1, got {data['totals']['bookings']}")
        return False
    
    office_c = next((o for o in data["offices"] if o["office"] == "مكتب ج"), None)
    if not office_c:
        log_test("4i", "Find مكتب ج in last month", "FAIL", 
                 f"Not found: {[o['office'] for o in data['offices']]}")
        return False
    
    log_test("4i", "GET monthly-report (last month)", "PASS", 
             f"Contains only last-month doc (مكتب ج, bookings=1)")
    
    # TEST 5: Regression - daily-digest previous fields intact
    print("\n--- TEST 5: Regression checks ---")
    
    response = owner_session.get(f"{BASE_URL}/meraaj/daily-digest")
    if response.status_code != 200:
        log_test("5a", "daily-digest regression", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    required_fields = ["yesterday", "today", "pending", "rejected_today", "reject_alert_threshold", "alert", "capacity_warnings"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        log_test("5a", "daily-digest all fields", "FAIL", f"Missing: {missing}")
        return False
    
    log_test("5a", "daily-digest regression", "PASS", "All previous fields intact + capacity_warnings")
    
    # webhook-health still returns trend[7]+buyers
    response = owner_session.get(f"{BASE_URL}/meraaj/webhook-health")
    if response.status_code != 200:
        log_test("5b", "webhook-health regression", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    if "trend" not in data or "buyers" not in data:
        log_test("5b", "webhook-health trend+buyers", "FAIL", 
                 f"Missing trend or buyers: {list(data.keys())}")
        return False
    
    if len(data["trend"]) != 7:
        log_test("5b", "webhook-health trend length", "FAIL", 
                 f"Expected 7, got {len(data['trend'])}")
        return False
    
    log_test("5b", "webhook-health regression", "PASS", "trend[7] + buyers present")
    
    return True

# ============================================================================
# CLEANUP
# ============================================================================

def cleanup():
    """Clean up ALL test data"""
    print("\n" + "="*80)
    print("CLEANUP: Deleting ALL test data")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    
    # Delete test packages
    for pkg_id in test_data["packages"]:
        result = db.packages.delete_one({"id": pkg_id})
        print(f"Deleted package {pkg_id}: {result.deleted_count} doc(s)")
    
    # Delete test inbound bookings
    for inbound_id in test_data["inbound_bookings"]:
        result = db.meraaj_inbound_bookings.delete_one({"_id": inbound_id})
        print(f"Deleted inbound {inbound_id}: {result.deleted_count} doc(s)")
    
    # Delete any events/logs created during tests
    tenant_id = get_tenant_id()
    
    # Delete events for test packages
    for pkg_id in test_data["packages"]:
        result = db.meraaj_events.delete_many({"payload.package_ref": pkg_id})
        print(f"Deleted events for {pkg_id}: {result.deleted_count} doc(s)")
    
    print(f"\nCleanup complete: {len(test_data['packages'])} packages, {len(test_data['inbound_bookings'])} inbound bookings deleted")

def verify_final_state():
    """Verify final state: only 3 real packages remain, 0 test inbound docs"""
    print("\n" + "="*80)
    print("FINAL VERIFICATION")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    tenant_id = get_tenant_id()
    
    # Expected 3 real packages (check by partial name match)
    expected_packages = [
        "عمرة رمضان",
        "حج 1448 اقتصادي",
        "عمرة ربيع اول 15 يوم اقتصادي"
    ]
    
    packages = list(db.packages.find({"tenant_id": tenant_id}, {"name": 1}))
    package_names = [p["name"] for p in packages]
    
    print(f"\nPackages in database: {len(packages)}")
    for name in package_names:
        print(f"  - {name}")
    
    if len(packages) != 3:
        print(f"\n❌ FAIL: Expected 3 packages, found {len(packages)}")
        return False
    
    # Check if each expected package name is found (partial match)
    for expected in expected_packages:
        found = any(expected in name for name in package_names)
        if not found:
            print(f"\n❌ FAIL: Expected package containing '{expected}' not found")
            return False
    
    print(f"\n✅ PASS: Exactly 3 real packages remain")
    
    # Verify 0 test inbound bookings remain
    test_inbound_count = db.meraaj_inbound_bookings.count_documents({
        "tenant_id": tenant_id,
        "_id": {"$regex": "^inbound-v362-"}
    })
    
    print(f"\nTest inbound bookings (v362) remaining: {test_inbound_count}")
    
    if test_inbound_count != 0:
        print(f"\n❌ FAIL: Expected 0 test inbound bookings, found {test_inbound_count}")
        # List them
        test_inbounds = list(db.meraaj_inbound_bookings.find({
            "tenant_id": tenant_id,
            "_id": {"$regex": "^inbound-v362-"}
        }, {"_id": 1, "buyer_office_name": 1}))
        for ib in test_inbounds:
            print(f"  - {ib['_id']} ({ib.get('buyer_office_name', 'N/A')})")
        return False
    
    print(f"\n✅ PASS: 0 test inbound bookings remain")
    
    return True

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("v3.62 BACKEND TESTING - NEW FEATURES")
    print("="*80)
    
    try:
        # Run tests
        if not test_feature_a():
            print("\n❌ FEATURE A FAILED")
            return False
        
        if not test_feature_b():
            print("\n❌ FEATURE B FAILED")
            return False
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED")
        print("="*80)
        
        return True
        
    finally:
        # Always cleanup
        cleanup()
        
        # Verify final state
        if not verify_final_state():
            print("\n❌ FINAL VERIFICATION FAILED")
            return False
        
        print("\n" + "="*80)
        print("✅ FINAL VERIFICATION PASSED")
        print("="*80)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
