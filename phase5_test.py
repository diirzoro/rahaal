#!/usr/bin/env python3
"""
Phase 5 Backend Test Suite for v3.10.6
Tests: Credit Limits & Freeze, Period Lock, Refund Engine
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test credentials
DEMO_TENANT = {
    "email": "owner@demo.com",
    "password": "Demo@2025",
    "tenant_id": "d89bc41d-e19b-430f-be93-e3f8ca6d404a"
}

# Known entities from review request
DEMO_CLIENT_A_ID = "083503a4-c0ac-4f9f-aab7-81c1954790a8"
DEMO_SUPPLIER_ID = "c7eeadab-7bba-4873-b05b-d37548b29ad4"
DEMO_BOX_ID = "c2774148-b6fc-4e6d-8af4-28d19a8e0b3f"

# Global session
session = requests.Session()
current_user = None

# Test results tracking
test_results = []
created_entities = []  # Track entities to cleanup

def log_test(name, passed, message=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status} - {name}"
    if message:
        result += f": {message}"
    print(result)
    test_results.append({"name": name, "passed": passed, "message": message})
    return passed

def login(email, password):
    """Login and get session cookie"""
    global current_user
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
        if resp.status_code == 200:
            data = resp.json()
            current_user = data.get("user")
            print(f"✅ Logged in as {email}")
            return True
        else:
            print(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False

def api_get(endpoint):
    """GET request"""
    try:
        resp = session.get(f"{BASE_URL}{endpoint}")
        return resp
    except Exception as e:
        print(f"❌ GET {endpoint} error: {e}")
        return None

def api_post(endpoint, data):
    """POST request"""
    try:
        resp = session.post(f"{BASE_URL}{endpoint}", json=data, timeout=30)
        return resp
    except Exception as e:
        print(f"❌ POST {endpoint} error: {e}")
        import traceback
        traceback.print_exc()
        return None

def api_put(endpoint, data):
    """PUT request"""
    try:
        resp = session.put(f"{BASE_URL}{endpoint}", json=data)
        return resp
    except Exception as e:
        print(f"❌ PUT {endpoint} error: {e}")
        return None

def api_delete(endpoint):
    """DELETE request"""
    try:
        resp = session.delete(f"{BASE_URL}{endpoint}")
        return resp
    except Exception as e:
        print(f"❌ DELETE {endpoint} error: {e}")
        return None

def cleanup():
    """Cleanup created entities"""
    print("\n🧹 Cleaning up created entities...")
    for entity in reversed(created_entities):
        try:
            resp = api_delete(f"/{entity['type']}/{entity['id']}")
            if resp and resp.status_code in [200, 204]:
                print(f"  ✅ Deleted {entity['type']}/{entity['id']}")
            else:
                print(f"  ⚠️ Could not delete {entity['type']}/{entity['id']}")
        except Exception as e:
            print(f"  ⚠️ Cleanup error for {entity['type']}/{entity['id']}: {e}")

def test_credit_limits_and_freeze():
    """Test 5.4: Credit Limits & Freeze"""
    print("\n" + "="*80)
    print("TEST 5.4: CREDIT LIMITS & FREEZE")
    print("="*80)
    
    # Step 1: Update client with credit_limit and credit_currency
    print("\n📝 Step 1: Set credit_limit=100 USD on DemoClientA")
    resp = api_put(f"/clients/{DEMO_CLIENT_A_ID}", {
        "credit_limit": 100,
        "credit_currency": "USD"
    })
    
    if resp and resp.status_code == 200:
        log_test("5.4.1 - PUT /clients/:id with credit_limit", True, "Credit limit set to 100 USD")
    else:
        log_test("5.4.1 - PUT /clients/:id with credit_limit", False, f"Status: {resp.status_code if resp else 'None'}")
        return
    
    # Verify the update
    print("\n🔍 Verify: GET /clients returns updated credit_limit")
    resp = api_get("/clients")
    if resp and resp.status_code == 200:
        clients = resp.json()
        demo_client = next((c for c in clients if c.get("id") == DEMO_CLIENT_A_ID), None)
        if demo_client:
            credit_limit = demo_client.get("credit_limit", 0)
            credit_currency = demo_client.get("credit_currency", "")
            if credit_limit == 100 and credit_currency == "USD":
                log_test("5.4.2 - Verify credit_limit persisted", True, f"credit_limit={credit_limit}, credit_currency={credit_currency}")
            else:
                log_test("5.4.2 - Verify credit_limit persisted", False, f"Expected 100 USD, got {credit_limit} {credit_currency}")
        else:
            log_test("5.4.2 - Verify credit_limit persisted", False, "Client not found")
    else:
        log_test("5.4.2 - Verify credit_limit persisted", False, "GET /clients failed")
    
    # Step 2: Try to create a credit ticket that exceeds the limit
    print("\n🚫 Step 2: Create credit ticket exceeding limit (should be BLOCKED)")
    
    # First, get a valid supplier
    resp = api_get("/suppliers")
    supplier_id = DEMO_SUPPLIER_ID
    if resp and resp.status_code == 200:
        suppliers = resp.json()
        if suppliers:
            supplier_id = suppliers[0].get("id", DEMO_SUPPLIER_ID)
    
    ticket_data = {
        "client_id": DEMO_CLIENT_A_ID,
        "supplier_id": supplier_id,
        "passenger_name": "Test Credit Limit",
        "phone": "777",
        "travel_date": "2026-09-01",
        "currency": "USD",
        "cost": 100,
        "sale_price": 150,
        "payment_method": "credit",
        "date": datetime.now().strftime("%Y-%m-%d")
    }
    
    resp = api_post("/tickets", ticket_data)
    
    if resp and resp.status_code == 400:
        error_text = resp.text
        if "تجاوز" in error_text or "credit" in error_text.lower() or "limit" in error_text.lower():
            log_test("5.4.3 - Credit limit enforcement", True, f"Blocked with error: {error_text[:100]}")
        else:
            log_test("5.4.3 - Credit limit enforcement", False, f"Wrong error message: {error_text[:100]}")
    else:
        log_test("5.4.3 - Credit limit enforcement", False, f"Expected 400, got {resp.status_code if resp else 'None'}")
    
    # Step 3: Freeze the client account
    print("\n❄️ Step 3: Freeze client account (is_frozen=true)")
    resp = api_put(f"/clients/{DEMO_CLIENT_A_ID}", {
        "is_frozen": True
    })
    
    if resp and resp.status_code == 200:
        log_test("5.4.4 - Set is_frozen=true", True, "Client account frozen")
    else:
        log_test("5.4.4 - Set is_frozen=true", False, f"Status: {resp.status_code if resp else 'None'}")
    
    # Step 4: Try to create a credit ticket on frozen account
    print("\n🚫 Step 4: Create credit ticket on frozen account (should be BLOCKED)")
    
    ticket_data["sale_price"] = 50  # Lower amount, within limit
    resp = api_post("/tickets", ticket_data)
    
    if resp and resp.status_code == 400:
        error_text = resp.text
        if "مجمّد" in error_text or "frozen" in error_text.lower():
            log_test("5.4.5 - Frozen account enforcement", True, f"Blocked with error: {error_text[:100]}")
        else:
            log_test("5.4.5 - Frozen account enforcement", False, f"Wrong error message: {error_text[:100]}")
    else:
        log_test("5.4.5 - Frozen account enforcement", False, f"Expected 400, got {resp.status_code if resp else 'None'}")
    
    # Step 5: Reset client to normal state
    print("\n🔄 Step 5: Reset client (is_frozen=false, credit_limit=0)")
    resp = api_put(f"/clients/{DEMO_CLIENT_A_ID}", {
        "is_frozen": False,
        "credit_limit": 0
    })
    
    if resp and resp.status_code == 200:
        log_test("5.4.6 - Reset client state", True, "Client reset to normal")
    else:
        log_test("5.4.6 - Reset client state", False, f"Status: {resp.status_code if resp else 'None'}")

def test_period_lock():
    """Test 5.1: Period Lock"""
    print("\n" + "="*80)
    print("TEST 5.1: PERIOD LOCK")
    print("="*80)
    
    # Step 1: Set period lock on 2026-08-01
    print("\n🔒 Step 1: POST /period-lock with closed_until=2026-08-01")
    lock_data = {
        "closed_until": "2026-08-01",
        "reason": "إقفال شهر يوليو"
    }
    
    resp = api_post("/period-lock", lock_data)
    
    if resp and resp.status_code == 200:
        lock = resp.json()
        if lock.get("closed_until") == "2026-08-01" and lock.get("locked_by") and lock.get("locked_by_email"):
            log_test("5.1.1 - POST /period-lock", True, f"Lock set: {lock.get('locked_by_email')} at {lock.get('locked_at')}")
        else:
            log_test("5.1.1 - POST /period-lock", False, f"Missing fields in response: {lock}")
    else:
        log_test("5.1.1 - POST /period-lock", False, f"Status: {resp.status_code if resp else 'None'}")
        return
    
    # Step 2: Verify GET /period-lock returns the lock
    print("\n🔍 Step 2: GET /period-lock")
    resp = api_get("/period-lock")
    
    if resp and resp.status_code == 200:
        lock = resp.json()
        if lock.get("closed_until") == "2026-08-01":
            log_test("5.1.2 - GET /period-lock", True, f"Lock retrieved: closed_until={lock.get('closed_until')}")
        else:
            log_test("5.1.2 - GET /period-lock", False, f"Wrong closed_until: {lock.get('closed_until')}")
    else:
        log_test("5.1.2 - GET /period-lock", False, f"Status: {resp.status_code if resp else 'None'}")
    
    # Step 3: Try to create a ticket in locked period (should be BLOCKED)
    print("\n🚫 Step 3: Create ticket with date=2026-07-15 (BEFORE lock, should be BLOCKED)")
    
    # Get valid supplier and box
    resp = api_get("/suppliers")
    supplier_id = DEMO_SUPPLIER_ID
    if resp and resp.status_code == 200:
        suppliers = resp.json()
        if suppliers:
            supplier_id = suppliers[0].get("id", DEMO_SUPPLIER_ID)
    
    resp = api_get("/boxes")
    box_id = DEMO_BOX_ID
    if resp and resp.status_code == 200:
        boxes = resp.json()
        if boxes:
            box_id = boxes[0].get("id", DEMO_BOX_ID)
    
    ticket_data = {
        "supplier_id": supplier_id,
        "passenger_name": "Test Period Lock",
        "phone": "777",
        "travel_date": "2026-09-01",
        "currency": "USD",
        "cost": 50,
        "sale_price": 75,
        "payment_method": "cash",
        "box_id": box_id,
        "date": "2026-07-15"  # Before lock date
    }
    
    resp = api_post("/tickets", ticket_data)
    
    if resp and resp.status_code == 400:
        error_text = resp.text
        if "الفترة" in error_text or "مقفلة" in error_text or "period" in error_text.lower() or "lock" in error_text.lower():
            log_test("5.1.3 - Period lock enforcement (before lock)", True, f"Blocked: {error_text[:100]}")
        else:
            log_test("5.1.3 - Period lock enforcement (before lock)", False, f"Wrong error: {error_text[:100]}")
    else:
        log_test("5.1.3 - Period lock enforcement (before lock)", False, f"Expected 400, got {resp.status_code if resp else 'None'}")
    
    # Step 4: Create a ticket AFTER the locked period (should PASS)
    print("\n✅ Step 4: Create ticket with date=2026-08-15 (AFTER lock, should PASS)")
    
    ticket_data["date"] = "2026-08-15"  # After lock date
    ticket_data["passenger_name"] = "Test PL After"
    
    resp = api_post("/tickets", ticket_data)
    
    if resp and resp.status_code == 200:
        ticket = resp.json()
        ticket_id = ticket.get("id")
        if ticket_id:
            created_entities.append({"type": "tickets", "id": ticket_id})
            log_test("5.1.4 - Create ticket after lock period", True, f"Ticket created: {ticket_id}")
        else:
            log_test("5.1.4 - Create ticket after lock period", False, "No ticket ID in response")
    else:
        log_test("5.1.4 - Create ticket after lock period", False, f"Status: {resp.status_code if resp else 'None'}, Error: {resp.text if resp else 'None'}")
    
    # Step 5: DELETE /period-lock (unlock)
    print("\n🔓 Step 5: DELETE /period-lock (unlock)")
    resp = api_delete("/period-lock")
    
    if resp and resp.status_code == 200:
        result = resp.json()
        if result.get("success"):
            log_test("5.1.5 - DELETE /period-lock", True, "Period unlocked")
        else:
            log_test("5.1.5 - DELETE /period-lock", False, f"Response: {result}")
    else:
        log_test("5.1.5 - DELETE /period-lock", False, f"Status: {resp.status_code if resp else 'None'}")

def test_refund_engine():
    """Test 5.3: Refund Engine"""
    print("\n" + "="*80)
    print("TEST 5.3: REFUND ENGINE")
    print("="*80)
    
    # Step 1: Create a ticket to refund
    print("\n📝 Step 1: Create a ticket for refund testing")
    
    # Get valid supplier and box
    resp = api_get("/suppliers")
    supplier_id = DEMO_SUPPLIER_ID
    if resp and resp.status_code == 200:
        suppliers = resp.json()
        if suppliers:
            supplier_id = suppliers[0].get("id", DEMO_SUPPLIER_ID)
    
    resp = api_get("/boxes")
    box_id = DEMO_BOX_ID
    if resp and resp.status_code == 200:
        boxes = resp.json()
        if boxes:
            box_id = boxes[0].get("id", DEMO_BOX_ID)
    
    ticket_data = {
        "supplier_id": supplier_id,
        "passenger_name": "RefundTest",
        "phone": "777",
        "travel_date": "2026-09-01",
        "currency": "USD",
        "cost": 100,
        "sale_price": 150,
        "payment_method": "cash",
        "box_id": box_id,
        "date": datetime.now().strftime("%Y-%m-%d")
    }
    
    resp = api_post("/tickets", ticket_data)
    
    if resp and resp.status_code == 200:
        ticket = resp.json()
        ticket_id = ticket.get("id")
        if ticket_id:
            created_entities.append({"type": "tickets", "id": ticket_id})
            log_test("5.3.1 - Create ticket for refund", True, f"Ticket created: {ticket_id}")
        else:
            log_test("5.3.1 - Create ticket for refund", False, "No ticket ID in response")
            return
    else:
        log_test("5.3.1 - Create ticket for refund", False, f"Status: {resp.status_code if resp else 'None'}")
        return
    
    # Step 2: Refund the ticket
    print(f"\n↩️ Step 2: POST /tickets/{ticket_id}/refund")
    refund_data = {
        "supplier_fine": 20,
        "office_fine": 10,
        "notes": "test refund"
    }
    
    resp = api_post(f"/tickets/{ticket_id}/refund", refund_data)
    
    if resp and resp.status_code == 200:
        refund = resp.json()
        refund_to_client = refund.get("refund_to_client")
        refund_to_supplier = refund.get("refund_to_supplier")
        supplier_fine = refund.get("supplier_fine")
        office_fine = refund.get("office_fine")
        
        # Expected: refund_to_client = 150 - 10 = 140, refund_to_supplier = 100 - 20 = 80
        if refund_to_client == 140 and refund_to_supplier == 80 and supplier_fine == 20 and office_fine == 10:
            log_test("5.3.2 - POST /tickets/:id/refund", True, f"Refund: client=140, supplier=80, supplier_fine=20, office_fine=10")
        else:
            log_test("5.3.2 - POST /tickets/:id/refund", False, f"Wrong amounts: {refund}")
    else:
        log_test("5.3.2 - POST /tickets/:id/refund", False, f"Status: {resp.status_code if resp else 'None'}, Error: {resp.text if resp else 'None'}")
        return
    
    # Step 3: Verify ticket status is "refunded"
    print(f"\n🔍 Step 3: GET /tickets/{ticket_id} - verify status=refunded")
    resp = api_get("/tickets")
    
    if resp and resp.status_code == 200:
        tickets = resp.json()
        refunded_ticket = next((t for t in tickets if t.get("id") == ticket_id), None)
        if refunded_ticket:
            status = refunded_ticket.get("status")
            if status == "refunded":
                log_test("5.3.3 - Verify ticket status=refunded", True, f"Status: {status}")
            else:
                log_test("5.3.3 - Verify ticket status=refunded", False, f"Status: {status}")
        else:
            log_test("5.3.3 - Verify ticket status=refunded", False, "Ticket not found")
    else:
        log_test("5.3.3 - Verify ticket status=refunded", False, f"Status: {resp.status_code if resp else 'None'}")

def test_regression():
    """Test 5: Regression - Existing endpoints still work"""
    print("\n" + "="*80)
    print("TEST 5: REGRESSION")
    print("="*80)
    
    # Test 1: GET /tickets
    print("\n📋 Test 1: GET /tickets")
    resp = api_get("/tickets")
    if resp and resp.status_code == 200:
        tickets = resp.json()
        count = len(tickets)
        if count >= 66:
            log_test("5.R.1 - GET /tickets", True, f"Retrieved {count} tickets (expected 66+)")
        else:
            log_test("5.R.1 - GET /tickets", False, f"Only {count} tickets (expected 66+)")
    else:
        log_test("5.R.1 - GET /tickets", False, f"Status: {resp.status_code if resp else 'None'}")
    
    # Test 2: GET /visas
    print("\n📋 Test 2: GET /visas")
    resp = api_get("/visas")
    if resp and resp.status_code == 200:
        visas = resp.json()
        count = len(visas)
        if count >= 43:
            log_test("5.R.2 - GET /visas", True, f"Retrieved {count} visas (expected 43+)")
        else:
            log_test("5.R.2 - GET /visas", False, f"Only {count} visas (expected 43+)")
    else:
        log_test("5.R.2 - GET /visas", False, f"Status: {resp.status_code if resp else 'None'}")
    
    # Test 3: GET /clients
    print("\n📋 Test 3: GET /clients")
    resp = api_get("/clients")
    if resp and resp.status_code == 200:
        clients = resp.json()
        count = len(clients)
        # Check all have account_code
        all_have_code = all(c.get("account_code") for c in clients)
        if count >= 38 and all_have_code:
            log_test("5.R.3 - GET /clients", True, f"Retrieved {count} clients (expected 38+), all have account_code")
        else:
            log_test("5.R.3 - GET /clients", False, f"Count: {count}, all_have_code: {all_have_code}")
    else:
        log_test("5.R.3 - GET /clients", False, f"Status: {resp.status_code if resp else 'None'}")
    
    # Test 4: Create and cleanup a ticket
    print("\n📝 Test 4: POST /tickets (without period lock and credit limit)")
    
    # Get valid supplier and box
    resp = api_get("/suppliers")
    supplier_id = DEMO_SUPPLIER_ID
    if resp and resp.status_code == 200:
        suppliers = resp.json()
        if suppliers:
            supplier_id = suppliers[0].get("id", DEMO_SUPPLIER_ID)
    
    resp = api_get("/boxes")
    box_id = DEMO_BOX_ID
    if resp and resp.status_code == 200:
        boxes = resp.json()
        if boxes:
            box_id = boxes[0].get("id", DEMO_BOX_ID)
    
    ticket_data = {
        "supplier_id": supplier_id,
        "passenger_name": "Regression Test",
        "phone": "777",
        "travel_date": "2026-09-01",
        "currency": "USD",
        "cost": 50,
        "sale_price": 75,
        "payment_method": "cash",
        "box_id": box_id,
        "date": datetime.now().strftime("%Y-%m-%d")
    }
    
    resp = api_post("/tickets", ticket_data)
    
    if resp and resp.status_code == 200:
        ticket = resp.json()
        ticket_id = ticket.get("id")
        if ticket_id:
            created_entities.append({"type": "tickets", "id": ticket_id})
            log_test("5.R.4 - POST /tickets", True, f"Ticket created: {ticket_id}")
        else:
            log_test("5.R.4 - POST /tickets", False, "No ticket ID in response")
    else:
        log_test("5.R.4 - POST /tickets", False, f"Status: {resp.status_code if resp else 'None'}")
    
    # Test 5: GET /reports/query
    print("\n📊 Test 5: GET /reports/query?kind=all")
    resp = api_get("/reports/query?kind=all")
    if resp and resp.status_code == 200:
        data = resp.json()
        stats = data.get("stats", {})
        if stats:
            log_test("5.R.5 - GET /reports/query", True, f"Stats: {stats}")
        else:
            log_test("5.R.5 - GET /reports/query", False, "No stats in response")
    else:
        log_test("5.R.5 - GET /reports/query", False, f"Status: {resp.status_code if resp else 'None'}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = len(test_results)
    passed = sum(1 for t in test_results if t["passed"])
    failed = total - passed
    
    print(f"\nTotal Tests: {total}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    if failed > 0:
        print("\n❌ Failed Tests:")
        for t in test_results:
            if not t["passed"]:
                print(f"  - {t['name']}: {t['message']}")
    
    return failed == 0

def main():
    """Main test runner"""
    print("="*80)
    print("PHASE 5 BACKEND TEST SUITE - v3.10.6")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Tenant: {DEMO_TENANT['email']}")
    print("="*80)
    
    # Login
    if not login(DEMO_TENANT["email"], DEMO_TENANT["password"]):
        print("❌ Login failed. Exiting.")
        sys.exit(1)
    
    try:
        # Run tests
        test_credit_limits_and_freeze()
        test_period_lock()
        test_refund_engine()
        test_regression()
        
        # Cleanup
        cleanup()
        
        # Print summary
        success = print_summary()
        
        sys.exit(0 if success else 1)
        
    except KeyboardInterrupt:
        print("\n\n⚠️ Tests interrupted by user")
        cleanup()
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        cleanup()
        sys.exit(1)

if __name__ == "__main__":
    main()
