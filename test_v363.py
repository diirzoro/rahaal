#!/usr/bin/env python3
"""
v3.63 BACKEND TEST — Rahaal ERP
Tests NEW features: add-seats endpoint + office-tag endpoint + buyers tag integration
READ-ONLY VERIFICATION - NO CODE MODIFICATIONS
"""

import requests
import json
import hmac
import hashlib
from pymongo import MongoClient
from datetime import datetime
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

# Test data tracking for cleanup
test_data = {
    "packages": [],
    "inbound_bookings": [],
    "events": [],
    "office_tags": []
}

# Session objects
owner_token = None
staff_token = None

def log_test(section, test_name, status, details=""):
    """Log test results"""
    symbol = "✅" if status == "PASS" else "❌"
    print(f"\n{symbol} [{section}] {test_name}")
    if details:
        print(f"   {details}")

def login(email, password):
    """Login and return session object with cookies"""
    try:
        session = requests.Session()
        response = session.post(f"{BASE_URL}/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return session
        else:
            print(f"Login failed for {email}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Login exception for {email}: {str(e)}")
        return None

def compute_hmac_signature(payload_str):
    """Compute HMAC-SHA256 hex signature for webhook"""
    return hmac.new(
        MERAAJ_SHARED_SECRET.encode('utf-8'),
        payload_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

def get_mongo_client():
    """Get MongoDB client"""
    return MongoClient(MONGO_URL)

def poll_for_event(db, event_type, package_id, max_attempts=6, delay=0.5):
    """Poll for event with retries"""
    for attempt in range(max_attempts):
        events = list(db.meraaj_events.find({
            "type": event_type,
            "payload.package_ref": package_id
        }).sort("created_at", -1).limit(1))
        
        if len(events) > 0:
            return events[0]
        
        if attempt < max_attempts - 1:
            time.sleep(delay)
    
    return None

# ============================================================================
# SETUP: LOGIN
# ============================================================================

def setup_auth():
    """Setup authentication"""
    global owner_token, staff_token
    
    print("\n" + "="*80)
    print("SETUP: AUTHENTICATION")
    print("="*80)
    
    owner_token = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_token:
        print("❌ Failed to login as owner")
        return False
    
    staff_token = login(STAFF_EMAIL, STAFF_PASSWORD)
    if not staff_token:
        print("❌ Failed to login as staff")
        return False
    
    print("✅ Authentication setup complete")
    return True

# ============================================================================
# FEATURE A: POST /api/meraaj/packages/:id/add-seats
# ============================================================================

def test_add_seats():
    """Test add-seats endpoint (owner-only, one-tap seat refill)"""
    print("\n" + "="*80)
    print("FEATURE A: POST /api/meraaj/packages/:id/add-seats")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    
    # Get owner tenant_id
    owner_user = db.users.find_one({"email": OWNER_EMAIL})
    if not owner_user:
        log_test("ADD-SEATS", "Get owner tenant_id", "FAIL", "Owner user not found")
        return False
    
    tenant_id = owner_user["tenant_id"]
    
    # TEST 1: Setup - create test package with meraaj config
    print("\n--- TEST 1: Setup test packages ---")
    
    # Create shared package P1
    pkg1_response = owner_token.post(f"{BASE_URL}/packages", json={
        "name": "V363 ADD-SEATS TEST P1",
        "package_type": "عمرة",
        "room_pricing": [{
            "type": "ثنائي",
            "sale_per_pax": 1000,
            "cost_adult": 700
        }]
    })
    
    if pkg1_response.status_code != 200:
        log_test("ADD-SEATS", "Create test package P1", "FAIL", f"Status: {pkg1_response.status_code}")
        return False
    
    pkg1_id = pkg1_response.json().get("id")
    test_data["packages"].append(pkg1_id)
    
    # Set meraaj config in MongoDB (shared=true, seats_allocated=10, seats_sold=9)
    db.packages.update_one(
        {"id": pkg1_id},
        {"$set": {
            "meraaj.shared": True,
            "meraaj.registered_at": datetime.utcnow(),
            "meraaj.seats_allocated": 10,
            "meraaj.seats_sold": 9,
            "meraaj.buyer_commission_mode": "amount",
            "meraaj.buyer_commission_value": 100,
            "meraaj.commission_direction": "deducted",
            "meraaj.market_pricing": [{
                "room_type": "ثنائي",
                "base": {"adult": 1000, "child": 1000, "infant": 0},
                "commission": {"adult": 100, "child": 100, "infant": 0},
                "net": {"adult": 900, "child": 900, "infant": 0},
                "customer": {"adult": 1000, "child": 1000, "infant": 0}
            }]
        }}
    )
    
    log_test("ADD-SEATS", "Setup P1 (shared, allocated=10, sold=9)", "PASS", f"Package ID: {pkg1_id}")
    
    # Create NON-shared package P2
    pkg2_response = owner_token.post(f"{BASE_URL}/packages", json={
        "name": "V363 ADD-SEATS TEST P2 (NOT SHARED)",
        "package_type": "عمرة",
        "room_pricing": [{
            "type": "ثنائي",
            "sale_per_pax": 1000
        }]
    })
    
    if pkg2_response.status_code != 200:
        log_test("ADD-SEATS", "Create test package P2 (not shared)", "FAIL", f"Status: {pkg2_response.status_code}")
        return False
    
    pkg2_id = pkg2_response.json().get("id")
    test_data["packages"].append(pkg2_id)
    
    log_test("ADD-SEATS", "Setup P2 (NOT shared)", "PASS", f"Package ID: {pkg2_id}")
    
    # TEST 2: RBAC - staff POST should be denied
    print("\n--- TEST 2: RBAC (staff denied) ---")
    
    response = staff_token.post(f"{BASE_URL}/meraaj/packages/{pkg1_id}/add-seats", json={"add": 5})
    
    if response.status_code != 403:
        log_test("ADD-SEATS", "Staff POST (denied)", "FAIL", f"Expected 403, got {response.status_code}")
        return False
    
    log_test("ADD-SEATS", "Staff POST (denied)", "PASS", "403 returned")
    
    # TEST 3: Owner POST {add:5} - should succeed
    print("\n--- TEST 3: Owner POST {add:5} ---")
    
    response = owner_token.post(f"{BASE_URL}/meraaj/packages/{pkg1_id}/add-seats", json={"add": 5})
    
    if response.status_code != 200:
        log_test("ADD-SEATS", "Owner POST {add:5}", "FAIL", f"Status: {response.status_code}, Body: {response.text}")
        return False
    
    result = response.json()
    
    # Verify response structure
    if result.get("seats_allocated") != 15:
        log_test("ADD-SEATS", "Verify seats_allocated=15", "FAIL", f"Expected 15, got {result.get('seats_allocated')}")
        return False
    
    if result.get("seats_sold") != 9:
        log_test("ADD-SEATS", "Verify seats_sold=9", "FAIL", f"Expected 9, got {result.get('seats_sold')}")
        return False
    
    if result.get("remaining") != 6:
        log_test("ADD-SEATS", "Verify remaining=6", "FAIL", f"Expected 6, got {result.get('remaining')}")
        return False
    
    if result.get("added") != 5:
        log_test("ADD-SEATS", "Verify added=5", "FAIL", f"Expected 5, got {result.get('added')}")
        return False
    
    log_test("ADD-SEATS", "Owner POST {add:5}", "PASS", 
            f"Response: seats_allocated=15, seats_sold=9, remaining=6, added=5")
    
    # Verify MongoDB
    pkg_doc = db.packages.find_one({"id": pkg1_id})
    if pkg_doc["meraaj"]["seats_allocated"] != 15:
        log_test("ADD-SEATS", "Verify MongoDB seats_allocated=15", "FAIL", 
                f"Expected 15, got {pkg_doc['meraaj']['seats_allocated']}")
        return False
    
    log_test("ADD-SEATS", "Verify MongoDB seats_allocated=15", "PASS")
    
    # Verify package.updated event (poll up to 3s)
    event = poll_for_event(db, "package.updated", pkg1_id, max_attempts=6, delay=0.5)
    
    if not event:
        log_test("ADD-SEATS", "Verify package.updated event", "FAIL", "Event not found after polling")
        return False
    
    log_test("ADD-SEATS", "Verify package.updated event", "PASS", f"Event ID: {event['id']}")
    
    # TEST 4: Validation tests
    print("\n--- TEST 4: Validation ---")
    
    # POST {add:0} - should fail
    response = owner_token.post(f"{BASE_URL}/meraaj/packages/{pkg1_id}/add-seats", json={"add": 0})
    if response.status_code != 400:
        log_test("ADD-SEATS", "POST {add:0} (400)", "FAIL", f"Expected 400, got {response.status_code}")
        return False
    log_test("ADD-SEATS", "POST {add:0} (400)", "PASS")
    
    # POST {} - should fail
    response = owner_token.post(f"{BASE_URL}/meraaj/packages/{pkg1_id}/add-seats", json={})
    if response.status_code != 400:
        log_test("ADD-SEATS", "POST {} (400)", "FAIL", f"Expected 400, got {response.status_code}")
        return False
    log_test("ADD-SEATS", "POST {} (400)", "PASS")
    
    # POST {add:-3} - should fail
    response = owner_token.post(f"{BASE_URL}/meraaj/packages/{pkg1_id}/add-seats", json={"add": -3})
    if response.status_code != 400:
        log_test("ADD-SEATS", "POST {add:-3} (400)", "FAIL", f"Expected 400, got {response.status_code}")
        return False
    log_test("ADD-SEATS", "POST {add:-3} (400)", "PASS")
    
    # POST {add:2000} - should clamp to 1000
    response = owner_token.post(f"{BASE_URL}/meraaj/packages/{pkg1_id}/add-seats", json={"add": 2000})
    if response.status_code != 200:
        log_test("ADD-SEATS", "POST {add:2000} (clamp to 1000)", "FAIL", f"Status: {response.status_code}")
        return False
    
    result = response.json()
    if result.get("added") != 1000:
        log_test("ADD-SEATS", "Verify added clamped to 1000", "FAIL", f"Expected 1000, got {result.get('added')}")
        return False
    
    if result.get("seats_allocated") != 1015:  # 15 + 1000
        log_test("ADD-SEATS", "Verify seats_allocated=1015", "FAIL", f"Expected 1015, got {result.get('seats_allocated')}")
        return False
    
    log_test("ADD-SEATS", "POST {add:2000} (clamped to 1000)", "PASS", f"added=1000, seats_allocated=1015")
    
    # POST on P2 (not shared) - should fail
    response = owner_token.post(f"{BASE_URL}/meraaj/packages/{pkg2_id}/add-seats", json={"add": 5})
    if response.status_code != 400:
        log_test("ADD-SEATS", "POST on P2 (not shared) (400)", "FAIL", f"Expected 400, got {response.status_code}")
        return False
    log_test("ADD-SEATS", "POST on P2 (not shared) (400)", "PASS")
    
    # POST on random uuid - should fail with 404
    response = owner_token.post(f"{BASE_URL}/meraaj/packages/random-uuid-12345/add-seats", json={"add": 5})
    if response.status_code != 404:
        log_test("ADD-SEATS", "POST on random uuid (404)", "FAIL", f"Expected 404, got {response.status_code}")
        return False
    log_test("ADD-SEATS", "POST on random uuid (404)", "PASS")
    
    # TEST 5: Cap at 10000
    print("\n--- TEST 5: Cap at 10000 ---")
    
    # Set seats_allocated to 9990 directly in MongoDB
    db.packages.update_one(
        {"id": pkg1_id},
        {"$set": {"meraaj.seats_allocated": 9990}}
    )
    
    # POST {add:1000} - should cap at 10000
    response = owner_token.post(f"{BASE_URL}/meraaj/packages/{pkg1_id}/add-seats", json={"add": 1000})
    if response.status_code != 200:
        log_test("ADD-SEATS", "POST {add:1000} with cap", "FAIL", f"Status: {response.status_code}")
        return False
    
    result = response.json()
    if result.get("seats_allocated") != 10000:
        log_test("ADD-SEATS", "Verify seats_allocated capped at 10000", "FAIL", 
                f"Expected 10000, got {result.get('seats_allocated')}")
        return False
    
    log_test("ADD-SEATS", "Cap at 10000", "PASS", f"seats_allocated=10000 (capped from 9990+1000)")
    
    print("\n✅ FEATURE A: ALL TESTS PASSED")
    return True

# ============================================================================
# FEATURE B: POST /api/meraaj/office-tag + buyers integration
# ============================================================================

def test_office_tag():
    """Test office-tag endpoint and buyers integration"""
    print("\n" + "="*80)
    print("FEATURE B: POST /api/meraaj/office-tag + buyers integration")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    
    # Get owner tenant_id
    owner_user = db.users.find_one({"email": OWNER_EMAIL})
    tenant_id = owner_user["tenant_id"]
    
    # TEST 6: RBAC - staff POST should be denied
    print("\n--- TEST 6: RBAC (staff denied) ---")
    
    response = staff_token.post(f"{BASE_URL}/meraaj/office-tag", json={
        "office": "مكتب تاج اختبار",
        "tag": "excellent"
    })
    
    if response.status_code != 403:
        log_test("OFFICE-TAG", "Staff POST (denied)", "FAIL", f"Expected 403, got {response.status_code}")
        return False
    
    log_test("OFFICE-TAG", "Staff POST (denied)", "PASS", "403 returned")
    
    # TEST 7: Owner POST - upsert, update, delete, validation
    print("\n--- TEST 7: Owner POST (upsert, update, delete, validation) ---")
    
    # POST {office:'مكتب تاج اختبار', tag:'excellent'}
    response = owner_token.post(f"{BASE_URL}/meraaj/office-tag", json={
        "office": "مكتب تاج اختبار",
        "tag": "excellent"
    })
    
    if response.status_code != 200:
        log_test("OFFICE-TAG", "POST {tag:'excellent'}", "FAIL", f"Status: {response.status_code}, Body: {response.text}")
        return False
    
    log_test("OFFICE-TAG", "POST {tag:'excellent'}", "PASS")
    
    # Verify MongoDB - should have ONE doc
    tag_docs = list(db.meraaj_office_tags.find({"tenant_id": tenant_id, "office": "مكتب تاج اختبار"}))
    
    if len(tag_docs) != 1:
        log_test("OFFICE-TAG", "Verify ONE doc in MongoDB", "FAIL", f"Expected 1, got {len(tag_docs)}")
        return False
    
    if tag_docs[0]["tag"] != "excellent":
        log_test("OFFICE-TAG", "Verify tag='excellent'", "FAIL", f"Expected 'excellent', got {tag_docs[0]['tag']}")
        return False
    
    if "id" not in tag_docs[0]:
        log_test("OFFICE-TAG", "Verify id field (uuid)", "FAIL", "Missing id field")
        return False
    
    log_test("OFFICE-TAG", "Verify MongoDB (1 doc, tag='excellent', has id)", "PASS")
    
    # POST again with tag:'late_payment' - should UPDATE (still ONE doc)
    response = owner_token.post(f"{BASE_URL}/meraaj/office-tag", json={
        "office": "مكتب تاج اختبار",
        "tag": "late_payment"
    })
    
    if response.status_code != 200:
        log_test("OFFICE-TAG", "POST {tag:'late_payment'} (update)", "FAIL", f"Status: {response.status_code}")
        return False
    
    log_test("OFFICE-TAG", "POST {tag:'late_payment'} (update)", "PASS")
    
    # Verify still ONE doc, tag updated
    tag_docs = list(db.meraaj_office_tags.find({"tenant_id": tenant_id, "office": "مكتب تاج اختبار"}))
    
    if len(tag_docs) != 1:
        log_test("OFFICE-TAG", "Verify still ONE doc (no duplicates)", "FAIL", f"Expected 1, got {len(tag_docs)}")
        return False
    
    if tag_docs[0]["tag"] != "late_payment":
        log_test("OFFICE-TAG", "Verify tag updated to 'late_payment'", "FAIL", f"Expected 'late_payment', got {tag_docs[0]['tag']}")
        return False
    
    log_test("OFFICE-TAG", "Verify update (still 1 doc, tag='late_payment')", "PASS")
    
    # POST tag:'' - should DELETE
    response = owner_token.post(f"{BASE_URL}/meraaj/office-tag", json={
        "office": "مكتب تاج اختبار",
        "tag": ""
    })
    
    if response.status_code != 200:
        log_test("OFFICE-TAG", "POST {tag:''} (delete)", "FAIL", f"Status: {response.status_code}")
        return False
    
    log_test("OFFICE-TAG", "POST {tag:''} (delete)", "PASS")
    
    # Verify doc deleted
    tag_docs = list(db.meraaj_office_tags.find({"tenant_id": tenant_id, "office": "مكتب تاج اختبار"}))
    
    if len(tag_docs) != 0:
        log_test("OFFICE-TAG", "Verify doc deleted", "FAIL", f"Expected 0, got {len(tag_docs)}")
        return False
    
    log_test("OFFICE-TAG", "Verify doc deleted", "PASS")
    
    # POST tag:'bad_value' - should fail with 400
    response = owner_token.post(f"{BASE_URL}/meraaj/office-tag", json={
        "office": "مكتب تاج اختبار",
        "tag": "bad_value"
    })
    
    if response.status_code != 400:
        log_test("OFFICE-TAG", "POST {tag:'bad_value'} (400)", "FAIL", f"Expected 400, got {response.status_code}")
        return False
    
    log_test("OFFICE-TAG", "POST {tag:'bad_value'} (400)", "PASS")
    
    # POST {office:'', tag:'good'} - should fail with 400
    response = owner_token.post(f"{BASE_URL}/meraaj/office-tag", json={
        "office": "",
        "tag": "good"
    })
    
    if response.status_code != 400:
        log_test("OFFICE-TAG", "POST {office:'', tag:'good'} (400)", "FAIL", f"Expected 400, got {response.status_code}")
        return False
    
    log_test("OFFICE-TAG", "POST {office:'', tag:'good'} (400)", "PASS")
    
    # TEST 8: buyers integration with webhook-health
    print("\n--- TEST 8: buyers integration with webhook-health ---")
    
    # Get a test package from FEATURE A tests (reuse pkg1_id from test_data)
    if len(test_data["packages"]) == 0:
        log_test("OFFICE-TAG", "Get test package for inbound", "FAIL", "No test packages available")
        return False
    
    pkg_id = test_data["packages"][0]
    
    # Get package details from MongoDB
    pkg_doc = db.packages.find_one({"id": pkg_id})
    if not pkg_doc:
        log_test("OFFICE-TAG", "Get package from MongoDB", "FAIL", "Package not found")
        return False
    
    # Insert 1 inbound booking with buyer_office_name 'مكتب تاج اختبار'
    inbound_doc = {
        "id": f"inbound-v363-{int(time.time())}",
        "tenant_id": tenant_id,
        "package_id": pkg_id,
        "package_name": pkg_doc["name"],
        "buyer_office_name": "مكتب تاج اختبار",
        "meraaj_booking_ref": f"MRJ-V363-{int(time.time())}",
        "event_id": f"evt-v363-{int(time.time())}",
        "status": "approved",
        "seats": 1,
        "total_price": 1000,
        "net_to_seller_total": 900,
        "currency": "SAR",
        "registrants": [{"name": "مسافر تجريبي", "age": 30, "age_category": "adult", "room_type": "ثنائي"}],
        "created_at": datetime.utcnow(),
        "price_check": "ok"
    }
    
    db.meraaj_inbound_bookings.insert_one(inbound_doc)
    test_data["inbound_bookings"].append(inbound_doc["id"])
    
    log_test("OFFICE-TAG", "Insert inbound booking (مكتب تاج اختبار)", "PASS")
    
    # POST office-tag {office:'مكتب تاج اختبار', tag:'good'}
    response = owner_token.post(f"{BASE_URL}/meraaj/office-tag", json={
        "office": "مكتب تاج اختبار",
        "tag": "good"
    })
    
    if response.status_code != 200:
        log_test("OFFICE-TAG", "POST {tag:'good'} for test office", "FAIL", f"Status: {response.status_code}")
        return False
    
    test_data["office_tags"].append("مكتب تاج اختبار")
    
    log_test("OFFICE-TAG", "POST {tag:'good'} for test office", "PASS")
    
    # Owner GET /api/meraaj/webhook-health
    response = owner_token.get(f"{BASE_URL}/meraaj/webhook-health")
    
    if response.status_code != 200:
        log_test("OFFICE-TAG", "GET /meraaj/webhook-health", "FAIL", f"Status: {response.status_code}")
        return False
    
    health = response.json()
    
    # Verify buyers[] contains the office with tag:'good'
    if "buyers" not in health:
        log_test("OFFICE-TAG", "Verify buyers[] field", "FAIL", "buyers field missing")
        return False
    
    buyers = health["buyers"]
    test_office = next((b for b in buyers if b["office"] == "مكتب تاج اختبار"), None)
    
    if not test_office:
        log_test("OFFICE-TAG", "Find test office in buyers[]", "FAIL", "Office not found in buyers")
        return False
    
    if test_office.get("tag") != "good":
        log_test("OFFICE-TAG", "Verify tag='good' in buyers[]", "FAIL", f"Expected 'good', got {test_office.get('tag')}")
        return False
    
    log_test("OFFICE-TAG", "Verify buyers[] contains office with tag='good'", "PASS")
    
    # Verify other offices (if any) have tag:''
    other_offices = [b for b in buyers if b["office"] != "مكتب تاج اختبار"]
    for office in other_offices:
        if office.get("tag") != "":
            log_test("OFFICE-TAG", "Verify other offices have tag:''", "FAIL", 
                    f"Office {office['office']} has tag={office.get('tag')}, expected ''")
            return False
    
    if len(other_offices) > 0:
        log_test("OFFICE-TAG", "Verify other offices have tag:''", "PASS", f"{len(other_offices)} other offices with tag=''")
    
    print("\n✅ FEATURE B: ALL TESTS PASSED")
    return True

# ============================================================================
# TEST 9: REGRESSION (daily-digest, monthly-report, webhook-health)
# ============================================================================

def test_regression():
    """Test regression - existing endpoints still work"""
    print("\n" + "="*80)
    print("TEST 9: REGRESSION (daily-digest, monthly-report, webhook-health)")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    
    # Get owner tenant_id
    owner_user = db.users.find_one({"email": OWNER_EMAIL})
    tenant_id = owner_user["tenant_id"]
    
    # GET /api/meraaj/daily-digest - verify capacity_warnings present
    print("\n--- Regression: GET /api/meraaj/daily-digest ---")
    
    response = owner_token.get(f"{BASE_URL}/meraaj/daily-digest")
    
    if response.status_code != 200:
        log_test("REGRESSION", "GET /meraaj/daily-digest", "FAIL", f"Status: {response.status_code}")
        return False
    
    digest = response.json()
    
    if "capacity_warnings" not in digest:
        log_test("REGRESSION", "Verify capacity_warnings field", "FAIL", "capacity_warnings missing")
        return False
    
    log_test("REGRESSION", "GET /meraaj/daily-digest", "PASS", f"capacity_warnings present (count: {len(digest['capacity_warnings'])})")
    
    # Verify test package (allocated=10000, sold=9) should NOT warn (remaining > 1, pct < 80)
    # Actually, with allocated=10000 and sold=9, pct = 0.09%, so it should NOT warn
    # But let's check if our test package appears in warnings
    if len(test_data["packages"]) > 0:
        pkg_id = test_data["packages"][0]
        pkg_doc = db.packages.find_one({"id": pkg_id})
        
        if pkg_doc and pkg_doc.get("meraaj", {}).get("shared"):
            allocated = pkg_doc["meraaj"].get("seats_allocated", 0)
            sold = pkg_doc["meraaj"].get("seats_sold", 0)
            remaining = allocated - sold
            pct = (sold / allocated * 100) if allocated > 0 else 0
            
            # Should NOT warn if pct < 80 AND remaining > 1
            should_warn = (pct >= 80 or remaining <= 1)
            
            warnings = digest["capacity_warnings"]
            pkg_in_warnings = any(w["id"] == pkg_id for w in warnings)
            
            if should_warn and not pkg_in_warnings:
                log_test("REGRESSION", "Verify test package in warnings", "FAIL", 
                        f"Package should warn (pct={pct:.1f}%, remaining={remaining}) but not in warnings")
                return False
            elif not should_warn and pkg_in_warnings:
                log_test("REGRESSION", "Verify test package NOT in warnings", "FAIL", 
                        f"Package should NOT warn (pct={pct:.1f}%, remaining={remaining}) but is in warnings")
                return False
            
            log_test("REGRESSION", "Verify capacity_warnings logic", "PASS", 
                    f"Test package: allocated={allocated}, sold={sold}, pct={pct:.1f}%, remaining={remaining}, "
                    f"should_warn={should_warn}, in_warnings={pkg_in_warnings}")
    
    # Test capacity warning with specific scenario: set allocated=10, sold=9 (90% → should warn)
    if len(test_data["packages"]) > 0:
        pkg_id = test_data["packages"][0]
        db.packages.update_one(
            {"id": pkg_id},
            {"$set": {
                "meraaj.seats_allocated": 10,
                "meraaj.seats_sold": 9,
                "archived": False  # Ensure not archived
            }}
        )
        
        # Re-fetch digest
        response = owner_token.get(f"{BASE_URL}/meraaj/daily-digest")
        digest = response.json()
        warnings = digest["capacity_warnings"]
        
        pkg_in_warnings = any(w["id"] == pkg_id for w in warnings)
        
        if not pkg_in_warnings:
            log_test("REGRESSION", "Verify 90% capacity warning", "FAIL", 
                    f"Package with 90% capacity (10 alloc, 9 sold) should warn but not in warnings")
            return False
        
        # Find the warning and verify details
        warning = next((w for w in warnings if w["id"] == pkg_id), None)
        if warning:
            if warning["seats_allocated"] != 10 or warning["seats_sold"] != 9 or warning["remaining"] != 1:
                log_test("REGRESSION", "Verify warning details", "FAIL", 
                        f"Expected allocated=10, sold=9, remaining=1, got {warning}")
                return False
            
            if warning["pct"] != 90:
                log_test("REGRESSION", "Verify warning pct=90", "FAIL", f"Expected pct=90, got {warning['pct']}")
                return False
        
        log_test("REGRESSION", "Verify 90% capacity warning", "PASS", 
                f"Package with 90% capacity correctly appears in warnings")
    
    # GET /api/meraaj/monthly-report (current month)
    print("\n--- Regression: GET /api/meraaj/monthly-report ---")
    
    response = owner_token.get(f"{BASE_URL}/meraaj/monthly-report")
    
    if response.status_code != 200:
        log_test("REGRESSION", "GET /meraaj/monthly-report (current month)", "FAIL", f"Status: {response.status_code}")
        return False
    
    report = response.json()
    
    required_fields = ["month", "packages", "offices", "totals", "rejected_webhooks", "outbound_events"]
    missing_fields = [f for f in required_fields if f not in report]
    
    if missing_fields:
        log_test("REGRESSION", "Verify monthly-report fields", "FAIL", f"Missing fields: {missing_fields}")
        return False
    
    log_test("REGRESSION", "GET /meraaj/monthly-report", "PASS", 
            f"All required fields present, month={report['month']}")
    
    # GET /api/meraaj/webhook-health - verify all fields intact
    print("\n--- Regression: GET /api/meraaj/webhook-health ---")
    
    response = owner_token.get(f"{BASE_URL}/meraaj/webhook-health")
    
    if response.status_code != 200:
        log_test("REGRESSION", "GET /meraaj/webhook-health", "FAIL", f"Status: {response.status_code}")
        return False
    
    health = response.json()
    
    required_fields = ["stats", "incoming", "rejected", "outbound", "trend", "buyers"]
    missing_fields = [f for f in required_fields if f not in health]
    
    if missing_fields:
        log_test("REGRESSION", "Verify webhook-health fields", "FAIL", f"Missing fields: {missing_fields}")
        return False
    
    # Verify stats has all required fields
    stats_fields = ["accepted_24h", "accepted_7d", "rejected_24h", "rejected_7d", "outbound_failed_24h", 
                   "last_accepted_at", "last_rejected_at"]
    missing_stats = [f for f in stats_fields if f not in health["stats"]]
    
    if missing_stats:
        log_test("REGRESSION", "Verify webhook-health stats fields", "FAIL", f"Missing stats: {missing_stats}")
        return False
    
    # Verify trend has 7 elements
    if len(health["trend"]) != 7:
        log_test("REGRESSION", "Verify trend length=7", "FAIL", f"Expected 7, got {len(health['trend'])}")
        return False
    
    # Verify buyers has tag field for each buyer
    for buyer in health["buyers"]:
        if "tag" not in buyer:
            log_test("REGRESSION", "Verify buyers have tag field", "FAIL", f"Buyer {buyer['office']} missing tag field")
            return False
    
    log_test("REGRESSION", "GET /meraaj/webhook-health", "PASS", 
            f"All fields intact: stats, incoming, rejected, outbound, trend (7 days), buyers (with tags)")
    
    print("\n✅ REGRESSION: ALL TESTS PASSED")
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
    
    # Get owner tenant_id
    owner_user = db.users.find_one({"email": OWNER_EMAIL})
    tenant_id = owner_user["tenant_id"]
    
    # Delete test packages
    for pkg_id in test_data["packages"]:
        # Delete via API
        response = owner_token.delete(f"{BASE_URL}/packages/{pkg_id}")
        if response.status_code == 200:
            print(f"✅ Deleted package {pkg_id}")
        else:
            print(f"⚠️  Failed to delete package {pkg_id}: {response.status_code}")
    
    # Delete test inbound bookings
    if len(test_data["inbound_bookings"]) > 0:
        result = db.meraaj_inbound_bookings.delete_many({"id": {"$in": test_data["inbound_bookings"]}})
        print(f"✅ Deleted {result.deleted_count} inbound bookings")
    
    # Delete test office tags
    if len(test_data["office_tags"]) > 0:
        result = db.meraaj_office_tags.delete_many({
            "tenant_id": tenant_id,
            "office": {"$in": test_data["office_tags"]}
        })
        print(f"✅ Deleted {result.deleted_count} office tags")
    
    # Delete test events (package.updated events for test packages)
    if len(test_data["packages"]) > 0:
        result = db.meraaj_events.delete_many({
            "tenant_id": tenant_id,
            "payload.package_ref": {"$in": test_data["packages"]}
        })
        print(f"✅ Deleted {result.deleted_count} events")
    
    print("\n✅ CLEANUP COMPLETE")

# ============================================================================
# FINAL VERIFICATION
# ============================================================================

def final_verification():
    """Verify exactly 3 real packages remain, 0 test office tags, 0 test inbound"""
    print("\n" + "="*80)
    print("FINAL VERIFICATION")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    
    # Get owner tenant_id
    owner_user = db.users.find_one({"email": OWNER_EMAIL})
    tenant_id = owner_user["tenant_id"]
    
    # Count packages
    packages = list(db.packages.find({"tenant_id": tenant_id}))
    
    expected_packages = ["عمرة رمضان", "حج 1448 اقتصادي", "عمرة ربيع اول 15 يوم اقتصادي"]
    
    if len(packages) != 3:
        log_test("FINAL-VERIFY", "Verify exactly 3 packages", "FAIL", 
                f"Expected 3, got {len(packages)}: {[p['name'] for p in packages]}")
        return False
    
    # Verify package names
    pkg_names = [p["name"] for p in packages]
    for expected in expected_packages:
        if expected not in pkg_names:
            log_test("FINAL-VERIFY", f"Verify package '{expected}' exists", "FAIL", 
                    f"Package not found. Existing: {pkg_names}")
            return False
    
    log_test("FINAL-VERIFY", "Verify exactly 3 real packages", "PASS", 
            f"Packages: {pkg_names}")
    
    # Count test office tags (should be 0)
    test_tags = list(db.meraaj_office_tags.find({
        "tenant_id": tenant_id,
        "office": {"$regex": "اختبار|TEST|V363", "$options": "i"}
    }))
    
    if len(test_tags) > 0:
        log_test("FINAL-VERIFY", "Verify 0 test office tags", "FAIL", 
                f"Found {len(test_tags)} test tags: {[t['office'] for t in test_tags]}")
        return False
    
    log_test("FINAL-VERIFY", "Verify 0 test office tags", "PASS")
    
    # Count test inbound bookings (should be 0)
    test_inbound = list(db.meraaj_inbound_bookings.find({
        "tenant_id": tenant_id,
        "$or": [
            {"buyer_office_name": {"$regex": "اختبار|TEST|V363", "$options": "i"}},
            {"package_name": {"$regex": "V363|TEST", "$options": "i"}}
        ]
    }))
    
    if len(test_inbound) > 0:
        log_test("FINAL-VERIFY", "Verify 0 test inbound bookings", "FAIL", 
                f"Found {len(test_inbound)} test inbound: {[i['buyer_office_name'] for i in test_inbound]}")
        return False
    
    log_test("FINAL-VERIFY", "Verify 0 test inbound bookings", "PASS")
    
    print("\n✅ FINAL VERIFICATION: ALL CHECKS PASSED")
    return True

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("v3.63 BACKEND TEST — Rahaal ERP")
    print("Features: add-seats + office-tag + buyers tag integration")
    print("="*80)
    
    try:
        # Setup
        if not setup_auth():
            print("\n❌ SETUP FAILED")
            return False
        
        # Run tests
        results = []
        
        results.append(("FEATURE A: add-seats", test_add_seats()))
        results.append(("FEATURE B: office-tag + buyers", test_office_tag()))
        results.append(("REGRESSION", test_regression()))
        
        # Cleanup
        cleanup()
        
        # Final verification
        results.append(("FINAL VERIFICATION", final_verification()))
        
        # Summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        
        all_passed = True
        for name, passed in results:
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"{status} - {name}")
            if not passed:
                all_passed = False
        
        if all_passed:
            print("\n🎉 ALL TESTS PASSED")
            return True
        else:
            print("\n❌ SOME TESTS FAILED")
            return False
    
    except Exception as e:
        print(f"\n❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
