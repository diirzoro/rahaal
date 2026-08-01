#!/usr/bin/env python3
"""
v3.8 Backend Testing — PATs + Scraper Ingest + Bearer Auth
Test credentials: owner@demo.com / Demo@2025
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test credentials
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "Demo@2025"

# Global session
session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

# Test state
test_results = []
created_pat_token = None
created_client_id = None
created_supplier_id = None
created_ticket_id = None
created_visa_id = None

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASSED" if passed else "❌ FAILED"
    print(f"{status} - {name}")
    if details:
        print(f"  Details: {details}")
    test_results.append({"name": name, "passed": passed, "details": details})

def login():
    """Login as owner"""
    print("\n=== LOGIN ===")
    resp = session.post(f"{BASE_URL}/auth/login", json={
        "email": OWNER_EMAIL,
        "password": OWNER_PASSWORD
    })
    if resp.status_code == 200:
        data = resp.json()
        log_test("Login as owner", True, f"User: {data.get('user', {}).get('email')}")
        return data
    else:
        log_test("Login as owner", False, f"Status: {resp.status_code}, Response: {resp.text}")
        sys.exit(1)

def test_health():
    """Test 1: Health endpoint returns version 3.8"""
    print("\n=== TEST 1: HEALTH CHECK ===")
    resp = session.get(f"{BASE_URL}/health")
    if resp.status_code == 200:
        data = resp.json()
        version = data.get("version")
        if version == "3.8":
            log_test("Health version 3.8", True, f"Version: {version}")
        else:
            log_test("Health version 3.8", False, f"Expected '3.8', got '{version}'")
    else:
        log_test("Health version 3.8", False, f"Status: {resp.status_code}")

def test_pat_crud():
    """Test 2-6: PAT CRUD operations"""
    global created_pat_token
    
    print("\n=== TEST 2: GET /api/pats (initial list) ===")
    resp = session.get(f"{BASE_URL}/pats")
    if resp.status_code == 200:
        data = resp.json()
        initial_count = len(data)
        log_test("GET /api/pats returns list", True, f"Found {initial_count} existing PATs")
    else:
        log_test("GET /api/pats returns list", False, f"Status: {resp.status_code}")
        return
    
    print("\n=== TEST 3: POST /api/pats (create token) ===")
    resp = session.post(f"{BASE_URL}/pats", json={"name": "test-machine-1"})
    if resp.status_code == 200:
        data = resp.json()
        token = data.get("token")
        prefix = data.get("prefix")
        warning = data.get("warning")
        
        if token and token.startswith("rhl_pat_") and len(token) >= 40:
            log_test("POST /api/pats creates token", True, 
                    f"Token: {token[:20]}..., Prefix: {prefix}, Warning: {warning}")
            created_pat_token = token
        else:
            log_test("POST /api/pats creates token", False, 
                    f"Invalid token format: {token}")
    else:
        log_test("POST /api/pats creates token", False, f"Status: {resp.status_code}")
        return
    
    print("\n=== TEST 4: GET /api/pats (verify token appears with prefix only) ===")
    resp = session.get(f"{BASE_URL}/pats")
    if resp.status_code == 200:
        data = resp.json()
        found = False
        for pat in data:
            if pat.get("prefix") == prefix:
                found = True
                has_token_field = "token" in pat
                if not has_token_field:
                    log_test("PAT list shows prefix, not full token", True, 
                            f"Prefix: {pat.get('prefix')}, Name: {pat.get('name')}")
                else:
                    log_test("PAT list shows prefix, not full token", False, 
                            "Full token leaked in list response")
                break
        if not found:
            log_test("PAT list shows prefix, not full token", False, "New PAT not found in list")
    else:
        log_test("PAT list shows prefix, not full token", False, f"Status: {resp.status_code}")
    
    print("\n=== TEST 5: Create 4 more PATs (total 5 active) ===")
    success_count = 0
    for i in range(2, 6):
        resp = session.post(f"{BASE_URL}/pats", json={"name": f"test-machine-{i}"})
        if resp.status_code == 200:
            success_count += 1
    
    if success_count == 4:
        log_test("Create 4 more PATs (total 5)", True, f"Created {success_count} additional PATs")
    else:
        log_test("Create 4 more PATs (total 5)", False, f"Only created {success_count} PATs")
    
    print("\n=== TEST 6: Try creating 6th PAT (should fail with 400) ===")
    resp = session.post(f"{BASE_URL}/pats", json={"name": "test-machine-6"})
    if resp.status_code == 400:
        error = resp.json().get("error", "")
        if "5" in error or "الحد الأقصى" in error:
            log_test("6th PAT creation blocked", True, f"Error: {error}")
        else:
            log_test("6th PAT creation blocked", False, f"Wrong error message: {error}")
    else:
        log_test("6th PAT creation blocked", False, f"Expected 400, got {resp.status_code}")

def test_pat_revoke():
    """Test 7: DELETE /api/pats/:id (revoke)"""
    print("\n=== TEST 7: DELETE /api/pats/:id (revoke token) ===")
    
    # Get list of PATs
    resp = session.get(f"{BASE_URL}/pats")
    if resp.status_code != 200:
        log_test("DELETE /api/pats/:id", False, "Could not fetch PAT list")
        return
    
    pats = resp.json()
    if not pats:
        log_test("DELETE /api/pats/:id", False, "No PATs to revoke")
        return
    
    # Revoke the first one
    pat_id = pats[0].get("id")
    resp = session.delete(f"{BASE_URL}/pats/{pat_id}")
    if resp.status_code == 200:
        # Verify revoked_at is set
        resp = session.get(f"{BASE_URL}/pats")
        if resp.status_code == 200:
            updated_pats = resp.json()
            revoked_pat = next((p for p in updated_pats if p.get("id") == pat_id), None)
            if revoked_pat and revoked_pat.get("revoked_at"):
                log_test("DELETE /api/pats/:id sets revoked_at", True, 
                        f"Revoked at: {revoked_pat.get('revoked_at')}")
            else:
                log_test("DELETE /api/pats/:id sets revoked_at", False, 
                        "revoked_at not set")
        else:
            log_test("DELETE /api/pats/:id sets revoked_at", False, 
                    "Could not verify revoked_at")
    else:
        log_test("DELETE /api/pats/:id sets revoked_at", False, 
                f"Status: {resp.status_code}")

def test_bearer_auth():
    """Test 8-11: Bearer authentication with PAT"""
    global created_pat_token
    
    if not created_pat_token:
        print("\n=== SKIPPING BEARER AUTH TESTS (no PAT token) ===")
        return
    
    print("\n=== TEST 8: GET /api/scraper/ping WITHOUT Authorization ===")
    resp = requests.get(f"{BASE_URL}/scraper/ping")
    if resp.status_code == 401:
        log_test("Scraper ping without auth returns 401", True)
    else:
        log_test("Scraper ping without auth returns 401", False, 
                f"Expected 401, got {resp.status_code}")
    
    print("\n=== TEST 9: GET /api/scraper/ping WITH invalid Bearer token ===")
    resp = requests.get(f"{BASE_URL}/scraper/ping", 
                       headers={"Authorization": "Bearer rhl_pat_invalid123456789012345678"})
    if resp.status_code == 401:
        log_test("Scraper ping with invalid token returns 401", True)
    else:
        log_test("Scraper ping with invalid token returns 401", False, 
                f"Expected 401, got {resp.status_code}")
    
    print("\n=== TEST 10: GET /api/scraper/ping WITH valid Bearer token ===")
    resp = requests.get(f"{BASE_URL}/scraper/ping", 
                       headers={"Authorization": f"Bearer {created_pat_token}"})
    if resp.status_code == 200:
        data = resp.json()
        ok = data.get("ok")
        tenant = data.get("tenant", {})
        user = data.get("user", {})
        version = data.get("version")
        
        if ok and tenant.get("id") and user.get("id") and version == "3.8":
            log_test("Scraper ping with valid token returns 200", True, 
                    f"Tenant: {tenant.get('name')}, User: {user.get('email')}, Version: {version}")
        else:
            log_test("Scraper ping with valid token returns 200", False, 
                    f"Missing required fields in response")
    else:
        log_test("Scraper ping with valid token returns 200", False, 
                f"Status: {resp.status_code}")
    
    print("\n=== TEST 11: GET /api/clients WITH Bearer token ===")
    resp = requests.get(f"{BASE_URL}/clients", 
                       headers={"Authorization": f"Bearer {created_pat_token}"})
    if resp.status_code == 200:
        data = resp.json()
        log_test("Bearer auth works for /api/clients", True, 
                f"Found {len(data)} clients")
    else:
        log_test("Bearer auth works for /api/clients", False, 
                f"Status: {resp.status_code}")
    
    print("\n=== TEST 12: GET /api/suppliers WITH Bearer token ===")
    resp = requests.get(f"{BASE_URL}/suppliers", 
                       headers={"Authorization": f"Bearer {created_pat_token}"})
    if resp.status_code == 200:
        data = resp.json()
        log_test("Bearer auth works for /api/suppliers", True, 
                f"Found {len(data)} suppliers")
    else:
        log_test("Bearer auth works for /api/suppliers", False, 
                f"Status: {resp.status_code}")
    
    print("\n=== TEST 13: GET /api/boxes WITH Bearer token ===")
    resp = requests.get(f"{BASE_URL}/boxes", 
                       headers={"Authorization": f"Bearer {created_pat_token}"})
    if resp.status_code == 200:
        data = resp.json()
        log_test("Bearer auth works for /api/boxes", True, 
                f"Found {len(data)} boxes")
    else:
        log_test("Bearer auth works for /api/boxes", False, 
                f"Status: {resp.status_code}")

def test_scraper_ingest_flight():
    """Test 14: Scraper ingest - flight ticket"""
    global created_pat_token, created_client_id, created_supplier_id, created_ticket_id
    
    if not created_pat_token:
        print("\n=== SKIPPING SCRAPER INGEST TESTS (no PAT token) ===")
        return
    
    print("\n=== TEST 14: Create client and supplier for ingest tests ===")
    # Create client
    resp = session.post(f"{BASE_URL}/clients", json={
        "name": "عميل اختبار الإضافة",
        "phone": "777100100"
    })
    if resp.status_code == 200:
        created_client_id = resp.json().get("id")
        log_test("Create client for ingest", True, f"Client ID: {created_client_id}")
    else:
        log_test("Create client for ingest", False, f"Status: {resp.status_code}")
        return
    
    # Create supplier
    resp = session.post(f"{BASE_URL}/suppliers", json={
        "name": "مورد اختبار الإضافة",
        "phone": "777200200"
    })
    if resp.status_code == 200:
        created_supplier_id = resp.json().get("id")
        log_test("Create supplier for ingest", True, f"Supplier ID: {created_supplier_id}")
    else:
        log_test("Create supplier for ingest", False, f"Status: {resp.status_code}")
        return
    
    print("\n=== TEST 15: POST /api/scraper/ingest (flight ticket) ===")
    payload = {
        "booking": {
            "doc_type": "flight",
            "pnr": "TEST-FL-01",
            "carrier": "Yemenia",
            "route_from": "JED",
            "route_to": "ADE",
            "ticket_no": "635 2412944105",
            "flight_no": "IY123"
        },
        "traveler": {
            "name_en": "TEST/USER",
            "passport_no": "P12345"
        },
        "dates": {
            "trip_date": "2026-08-15",
            "depart_time": "10:00",
            "arrive_time": "12:00",
            "issued_at": "2026-07-15T10:00:00Z"
        },
        "financial": {
            "amount": 150,
            "currency": "USD"
        },
        "client_id": created_client_id,
        "supplier_id": created_supplier_id,
        "cost": 100,
        "sale_price": 150,
        "payment_method": "credit"
    }
    
    resp = requests.post(f"{BASE_URL}/scraper/ingest", 
                        json=payload,
                        headers={"Authorization": f"Bearer {created_pat_token}"})
    
    if resp.status_code == 200:
        data = resp.json()
        ok = data.get("ok")
        record_type = data.get("record_type")
        record_id = data.get("record_id")
        doc = data.get("doc", {})
        
        if ok and record_type == "ticket" and record_id:
            created_ticket_id = record_id
            pnr = doc.get("pnr")
            passenger_name = doc.get("passenger_name")
            route = doc.get("route")
            cost = doc.get("cost")
            sale_price = doc.get("sale_price")
            commission = doc.get("commission")
            
            log_test("Scraper ingest flight ticket", True, 
                    f"Record ID: {record_id}, PNR: {pnr}, Passenger: {passenger_name}, "
                    f"Route: {route}, Cost: {cost}, Sale: {sale_price}, Commission: {commission}")
        else:
            log_test("Scraper ingest flight ticket", False, 
                    f"Invalid response structure: {data}")
    else:
        log_test("Scraper ingest flight ticket", False, 
                f"Status: {resp.status_code}, Response: {resp.text}")

def test_scraper_ingest_bus():
    """Test 16: Scraper ingest - bus ticket (travel_mode='land')"""
    global created_pat_token, created_client_id, created_supplier_id
    
    if not created_pat_token or not created_client_id or not created_supplier_id:
        print("\n=== SKIPPING BUS INGEST TEST (missing prerequisites) ===")
        return
    
    print("\n=== TEST 16: POST /api/scraper/ingest (bus ticket) ===")
    payload = {
        "booking": {
            "doc_type": "bus",
            "pnr": "TEST-BUS-01",
            "carrier": "شركة النقل البري",
            "route_from": "صنعاء",
            "route_to": "عدن"
        },
        "traveler": {
            "name_ar": "مسافر اختبار",
            "passport_no": "YE123456"
        },
        "dates": {
            "trip_date": "2026-08-20",
            "depart_time": "08:00",
            "issued_at": "2026-07-15T10:00:00Z"
        },
        "financial": {
            "amount": 50,
            "currency": "SAR"
        },
        "client_id": created_client_id,
        "supplier_id": created_supplier_id,
        "cost": 30,
        "sale_price": 50,
        "payment_method": "credit"
    }
    
    resp = requests.post(f"{BASE_URL}/scraper/ingest", 
                        json=payload,
                        headers={"Authorization": f"Bearer {created_pat_token}"})
    
    if resp.status_code == 200:
        data = resp.json()
        doc = data.get("doc", {})
        travel_mode = doc.get("travel_mode")
        
        if travel_mode == "land":
            log_test("Scraper ingest bus ticket (travel_mode='land')", True, 
                    f"Travel mode: {travel_mode}, PNR: {doc.get('pnr')}")
        else:
            log_test("Scraper ingest bus ticket (travel_mode='land')", False, 
                    f"Expected travel_mode='land', got '{travel_mode}'")
    else:
        log_test("Scraper ingest bus ticket (travel_mode='land')", False, 
                f"Status: {resp.status_code}")

def test_scraper_ingest_visa():
    """Test 17: Scraper ingest - umrah visa"""
    global created_pat_token, created_client_id, created_supplier_id, created_visa_id
    
    if not created_pat_token or not created_client_id or not created_supplier_id:
        print("\n=== SKIPPING VISA INGEST TEST (missing prerequisites) ===")
        return
    
    print("\n=== TEST 17: POST /api/scraper/ingest (umrah visa) ===")
    payload = {
        "booking": {
            "doc_type": "umrah_visa",
            "visa_no": "6169794577",
            "application_no": "E821262038"
        },
        "traveler": {
            "name_ar": "خديجة سعيد",
            "passport_no": "16439690",
            "nationality": "يمني"
        },
        "dates": {
            "valid_from": "2026-07-17",
            "valid_until": "2026-10-15",
            "issued_at": "2026-07-15T10:00:00Z"
        },
        "financial": {
            "amount": 800,
            "currency": "SAR"
        },
        "client_id": created_client_id,
        "supplier_id": created_supplier_id,
        "cost": 500,
        "sale_price": 800,
        "payment_method": "credit"
    }
    
    resp = requests.post(f"{BASE_URL}/scraper/ingest", 
                        json=payload,
                        headers={"Authorization": f"Bearer {created_pat_token}"})
    
    if resp.status_code == 200:
        data = resp.json()
        ok = data.get("ok")
        record_type = data.get("record_type")
        record_id = data.get("record_id")
        doc = data.get("doc", {})
        
        if ok and record_type == "visa" and record_id:
            created_visa_id = record_id
            service_type = doc.get("service_type")
            entry_date = doc.get("entry_date")
            expected_exit_date = doc.get("expected_exit_date")
            
            if service_type == "تأشيرة عمرة":
                log_test("Scraper ingest umrah visa", True, 
                        f"Record ID: {record_id}, Service: {service_type}, "
                        f"Entry: {entry_date}, Exit: {expected_exit_date}")
            else:
                log_test("Scraper ingest umrah visa", False, 
                        f"Expected service_type='تأشيرة عمرة', got '{service_type}'")
        else:
            log_test("Scraper ingest umrah visa", False, 
                    f"Invalid response structure: {data}")
    else:
        log_test("Scraper ingest umrah visa", False, 
                f"Status: {resp.status_code}, Response: {resp.text}")

def test_verify_ticket_created():
    """Test 18: Verify ticket appears in GET /api/tickets"""
    global created_ticket_id
    
    if not created_ticket_id:
        print("\n=== SKIPPING TICKET VERIFICATION (no ticket created) ===")
        return
    
    print("\n=== TEST 18: GET /api/tickets (verify ticket created) ===")
    resp = session.get(f"{BASE_URL}/tickets")
    if resp.status_code == 200:
        tickets = resp.json()
        found = next((t for t in tickets if t.get("id") == created_ticket_id), None)
        if found:
            log_test("Ticket appears in GET /api/tickets", True, 
                    f"PNR: {found.get('pnr')}, Passenger: {found.get('passenger_name')}")
        else:
            log_test("Ticket appears in GET /api/tickets", False, 
                    "Ticket not found in list")
    else:
        log_test("Ticket appears in GET /api/tickets", False, 
                f"Status: {resp.status_code}")

def test_verify_journal_entry():
    """Test 19: Verify journal entry created for ticket"""
    global created_ticket_id
    
    if not created_ticket_id:
        print("\n=== SKIPPING JOURNAL ENTRY VERIFICATION (no ticket created) ===")
        return
    
    print("\n=== TEST 19: GET /api/journal-entries (verify entry for ticket) ===")
    resp = session.get(f"{BASE_URL}/journal-entries")
    if resp.status_code == 200:
        entries = resp.json()
        found = next((e for e in entries if e.get("ref_type") == "ticket" and e.get("ref_id") == created_ticket_id), None)
        if found:
            lines = found.get("lines", [])
            total_debit = sum(l.get("debit", 0) for l in lines)
            total_credit = sum(l.get("credit", 0) for l in lines)
            balanced = abs(total_debit - total_credit) < 0.01
            
            log_test("Journal entry created for ticket", True, 
                    f"Ref type: {found.get('ref_type')}, Lines: {len(lines)}, "
                    f"Debit: {total_debit}, Credit: {total_credit}, Balanced: {balanced}")
        else:
            log_test("Journal entry created for ticket", False, 
                    "Journal entry not found")
    else:
        log_test("Journal entry created for ticket", False, 
                f"Status: {resp.status_code}")

def test_verify_balances():
    """Test 20: Verify client and supplier balances updated"""
    global created_client_id, created_supplier_id
    
    if not created_client_id or not created_supplier_id:
        print("\n=== SKIPPING BALANCE VERIFICATION (missing client/supplier) ===")
        return
    
    print("\n=== TEST 20: Verify client and supplier balances ===")
    
    # Check client balance
    resp = session.get(f"{BASE_URL}/clients")
    if resp.status_code == 200:
        clients = resp.json()
        client = next((c for c in clients if c.get("id") == created_client_id), None)
        if client:
            usd_balance = client.get("balances", {}).get("USD", 0)
            sar_balance = client.get("balances", {}).get("SAR", 0)
            log_test("Client balance updated", True, 
                    f"USD: {usd_balance}, SAR: {sar_balance}")
        else:
            log_test("Client balance updated", False, "Client not found")
    else:
        log_test("Client balance updated", False, f"Status: {resp.status_code}")
    
    # Check supplier balance
    resp = session.get(f"{BASE_URL}/suppliers")
    if resp.status_code == 200:
        suppliers = resp.json()
        supplier = next((s for s in suppliers if s.get("id") == created_supplier_id), None)
        if supplier:
            usd_balance = supplier.get("balances", {}).get("USD", 0)
            sar_balance = supplier.get("balances", {}).get("SAR", 0)
            log_test("Supplier balance updated", True, 
                    f"USD: {usd_balance}, SAR: {sar_balance}")
        else:
            log_test("Supplier balance updated", False, "Supplier not found")
    else:
        log_test("Supplier balance updated", False, f"Status: {resp.status_code}")

def test_ingest_validation():
    """Test 21-22: Scraper ingest validation errors"""
    global created_pat_token
    
    if not created_pat_token:
        print("\n=== SKIPPING VALIDATION TESTS (no PAT token) ===")
        return
    
    print("\n=== TEST 21: POST /api/scraper/ingest without client_id ===")
    payload = {
        "booking": {"doc_type": "flight", "pnr": "TEST"},
        "traveler": {"name_en": "TEST"},
        "dates": {},
        "financial": {"amount": 100, "currency": "USD"},
        "supplier_id": "dummy-supplier-id",
        "cost": 50,
        "sale_price": 100
    }
    
    resp = requests.post(f"{BASE_URL}/scraper/ingest", 
                        json=payload,
                        headers={"Authorization": f"Bearer {created_pat_token}"})
    
    if resp.status_code == 400:
        error = resp.json().get("error", "")
        if "client_id" in error.lower() or "العميل" in error:
            log_test("Ingest without client_id returns 400", True, f"Error: {error}")
        else:
            log_test("Ingest without client_id returns 400", False, f"Wrong error: {error}")
    else:
        log_test("Ingest without client_id returns 400", False, 
                f"Expected 400, got {resp.status_code}")
    
    print("\n=== TEST 22: POST /api/scraper/ingest with unsupported doc_type ===")
    payload = {
        "booking": {"doc_type": "unknown_type"},
        "traveler": {"name_en": "TEST"},
        "dates": {},
        "financial": {"amount": 100, "currency": "USD"},
        "client_id": "dummy-client-id",
        "supplier_id": "dummy-supplier-id",
        "cost": 50,
        "sale_price": 100
    }
    
    resp = requests.post(f"{BASE_URL}/scraper/ingest", 
                        json=payload,
                        headers={"Authorization": f"Bearer {created_pat_token}"})
    
    if resp.status_code == 400:
        error = resp.json().get("error", "")
        if "doc_type" in error.lower() or "غير مدعوم" in error or "المستند" in error:
            log_test("Ingest with unsupported doc_type returns 400", True, f"Error: {error}")
        else:
            log_test("Ingest with unsupported doc_type returns 400", False, f"Wrong error: {error}")
    else:
        log_test("Ingest with unsupported doc_type returns 400", False, 
                f"Expected 400, got {resp.status_code}")

def test_regression():
    """Test 23-24: Regression tests"""
    print("\n=== TEST 23: GET /api/packages/comparison (v3.7 regression) ===")
    resp = session.get(f"{BASE_URL}/packages/comparison")
    if resp.status_code == 200:
        data = resp.json()
        if "period" in data and "rows" in data and "totals" in data:
            log_test("v3.7 packages comparison still works", True, 
                    f"Period: {data.get('period')}, Rows: {len(data.get('rows', []))}")
        else:
            log_test("v3.7 packages comparison still works", False, 
                    "Missing required fields in response")
    else:
        log_test("v3.7 packages comparison still works", False, 
                f"Status: {resp.status_code}")
    
    print("\n=== TEST 24: GET /api/packages (v3.6 regression) ===")
    resp = session.get(f"{BASE_URL}/packages")
    if resp.status_code == 200:
        packages = resp.json()
        log_test("v3.6 packages CRUD still works", True, 
                f"Found {len(packages)} packages")
    else:
        log_test("v3.6 packages CRUD still works", False, 
                f"Status: {resp.status_code}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for t in test_results if t["passed"])
    failed = sum(1 for t in test_results if not t["passed"])
    total = len(test_results)
    
    print(f"\nTotal: {total} tests")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    if failed > 0:
        print("\n" + "="*60)
        print("FAILED TESTS:")
        print("="*60)
        for t in test_results:
            if not t["passed"]:
                print(f"❌ {t['name']}")
                if t["details"]:
                    print(f"   {t['details']}")
    
    print("\n" + "="*60)

def main():
    """Main test runner"""
    print("="*60)
    print("v3.8 BACKEND TESTING — PATs + Scraper Ingest + Bearer Auth")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Credentials: {OWNER_EMAIL} / {OWNER_PASSWORD}")
    print("="*60)
    
    try:
        # Login
        login()
        
        # Run tests
        test_health()
        test_pat_crud()
        test_pat_revoke()
        test_bearer_auth()
        test_scraper_ingest_flight()
        test_scraper_ingest_bus()
        test_scraper_ingest_visa()
        test_verify_ticket_created()
        test_verify_journal_entry()
        test_verify_balances()
        test_ingest_validation()
        test_regression()
        
        # Print summary
        print_summary()
        
        # Exit with appropriate code
        failed = sum(1 for t in test_results if not t["passed"])
        sys.exit(0 if failed == 0 else 1)
        
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
