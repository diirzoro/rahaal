#!/usr/bin/env python3
"""
Rahaal ERP v2.0 SaaS Backend Test Suite
Tests multi-tenant architecture, authentication, tenant isolation, bulk import, and all core features.
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test results tracking
test_results = []

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results.append({"name": name, "passed": passed, "details": details})
    print(f"{status}: {name}")
    if details:
        print(f"  Details: {details}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for t in test_results if t["passed"])
    total = len(test_results)
    print(f"Total: {total} | Passed: {passed} | Failed: {total - passed}")
    print("="*80)
    
    if total - passed > 0:
        print("\nFailed Tests:")
        for t in test_results:
            if not t["passed"]:
                print(f"  ❌ {t['name']}")
                if t["details"]:
                    print(f"     {t['details']}")

# ============ Test 1: Health Check ============
def test_health():
    """Test health endpoint"""
    try:
        r = requests.get(f"{BASE_URL}/root", timeout=10)
        data = r.json()
        if r.status_code == 200 and data.get("ok") == True and data.get("version") == "2.0-saas":
            log_test("Health Check", True, f"Version: {data.get('version')}")
            return True
        else:
            log_test("Health Check", False, f"Unexpected response: {data}")
            return False
    except Exception as e:
        log_test("Health Check", False, f"Exception: {str(e)}")
        return False

# ============ Test 2: Auth Flow ============
def test_auth_flow():
    """Test authentication flow"""
    session = requests.Session()
    
    # Test 2.1: Login as super admin
    try:
        r = session.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@targetmedia.com",
            "password": "Target@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Auth: Super Admin Login", False, f"Status {r.status_code}: {r.text}")
            return None
        
        data = r.json()
        if not data.get("user") or data["user"].get("role") != "super_admin":
            log_test("Auth: Super Admin Login", False, f"Invalid user data: {data}")
            return None
        
        if data["user"].get("tenant_id") is not None:
            log_test("Auth: Super Admin Login", False, f"Super admin should have tenant_id=null, got: {data['user'].get('tenant_id')}")
            return None
        
        log_test("Auth: Super Admin Login", True, f"User: {data['user']['email']}, Role: {data['user']['role']}")
    except Exception as e:
        log_test("Auth: Super Admin Login", False, f"Exception: {str(e)}")
        return None
    
    # Test 2.2: GET /auth/me
    try:
        r = session.get(f"{BASE_URL}/auth/me", timeout=10)
        data = r.json()
        if r.status_code == 200 and data.get("user") and data["user"].get("role") == "super_admin":
            log_test("Auth: GET /auth/me", True, f"User: {data['user']['email']}")
        else:
            log_test("Auth: GET /auth/me", False, f"Unexpected response: {data}")
    except Exception as e:
        log_test("Auth: GET /auth/me", False, f"Exception: {str(e)}")
    
    # Test 2.3: Wrong password
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@targetmedia.com",
            "password": "WrongPassword"
        }, timeout=10)
        
        if r.status_code == 401:
            log_test("Auth: Wrong Password", True, "Correctly rejected with 401")
        else:
            log_test("Auth: Wrong Password", False, f"Expected 401, got {r.status_code}")
    except Exception as e:
        log_test("Auth: Wrong Password", False, f"Exception: {str(e)}")
    
    # Test 2.4: No cookie (unauthorized)
    try:
        r = requests.get(f"{BASE_URL}/clients", timeout=10)
        if r.status_code == 401:
            log_test("Auth: No Cookie (401)", True, "Correctly rejected with 401")
        else:
            log_test("Auth: No Cookie (401)", False, f"Expected 401, got {r.status_code}")
    except Exception as e:
        log_test("Auth: No Cookie (401)", False, f"Exception: {str(e)}")
    
    return session

# ============ Test 3: Super Admin - Tenant Management ============
def test_super_admin_tenant_management(admin_session):
    """Test super admin tenant management"""
    if not admin_session:
        log_test("Super Admin: Tenant Management", False, "No admin session")
        return None
    
    # Test 3.1: GET /admin/tenants
    try:
        r = admin_session.get(f"{BASE_URL}/admin/tenants", timeout=10)
        data = r.json()
        
        if r.status_code != 200:
            log_test("Super Admin: GET /admin/tenants", False, f"Status {r.status_code}: {r.text}")
            return None
        
        tenants = data.get("tenants", [])
        demo_tenant = next((t for t in tenants if t.get("slug") == "demo"), None)
        
        if not demo_tenant:
            log_test("Super Admin: GET /admin/tenants", False, "Demo tenant not found")
            return None
        
        if demo_tenant.get("users_count", 0) < 1:
            log_test("Super Admin: GET /admin/tenants", False, f"Demo tenant should have users_count >= 1, got {demo_tenant.get('users_count')}")
            return None
        
        log_test("Super Admin: GET /admin/tenants", True, f"Found {len(tenants)} tenants, demo has {demo_tenant.get('users_count')} users")
    except Exception as e:
        log_test("Super Admin: GET /admin/tenants", False, f"Exception: {str(e)}")
        return None
    
    # Test 3.2: POST /admin/tenants (create new tenant)
    new_tenant_data = {
        "name": "مكتب اختبار",
        "owner_name": "مدير",
        "owner_email": "test1@office.com",
        "owner_password": "Test@123",
        "max_users": 2,
        "max_branches": 1
    }
    
    try:
        r = admin_session.post(f"{BASE_URL}/admin/tenants", json=new_tenant_data, timeout=10)
        
        if r.status_code not in [200, 201]:
            log_test("Super Admin: POST /admin/tenants", False, f"Status {r.status_code}: {r.text}")
            return None
        
        tenant = r.json()
        if not tenant.get("id") or not tenant.get("name"):
            log_test("Super Admin: POST /admin/tenants", False, f"Invalid tenant data: {tenant}")
            return None
        
        log_test("Super Admin: POST /admin/tenants", True, f"Created tenant: {tenant.get('name')}, ID: {tenant.get('id')}")
        new_tenant_id = tenant.get("id")
    except Exception as e:
        log_test("Super Admin: POST /admin/tenants", False, f"Exception: {str(e)}")
        return None
    
    # Test 3.3: Login as new tenant owner
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "test1@office.com",
            "password": "Test@123"
        }, timeout=10)
        
        if r.status_code == 200:
            log_test("Auth: New Tenant Owner Login", True, "Successfully logged in as test1@office.com")
        else:
            log_test("Auth: New Tenant Owner Login", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Auth: New Tenant Owner Login", False, f"Exception: {str(e)}")
    
    # Test 3.4: PATCH /admin/tenants/:id (suspend)
    try:
        r = admin_session.patch(f"{BASE_URL}/admin/tenants/{new_tenant_id}", json={"status": "suspended"}, timeout=10)
        
        if r.status_code == 200:
            log_test("Super Admin: PATCH /admin/tenants (suspend)", True, "Tenant suspended")
        else:
            log_test("Super Admin: PATCH /admin/tenants (suspend)", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Super Admin: PATCH /admin/tenants (suspend)", False, f"Exception: {str(e)}")
    
    # Test 3.5: Login as suspended tenant owner (should fail)
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "test1@office.com",
            "password": "Test@123"
        }, timeout=10)
        
        if r.status_code == 403:
            data = r.json()
            if "موقوف" in data.get("error", ""):
                log_test("Auth: Suspended Tenant Login", True, "Correctly rejected with 403 and 'موقوف' message")
            else:
                log_test("Auth: Suspended Tenant Login", True, f"Rejected with 403: {data.get('error')}")
        else:
            log_test("Auth: Suspended Tenant Login", False, f"Expected 403, got {r.status_code}")
    except Exception as e:
        log_test("Auth: Suspended Tenant Login", False, f"Exception: {str(e)}")
    
    # Test 3.6: PATCH /admin/tenants/:id (reactivate)
    try:
        r = admin_session.patch(f"{BASE_URL}/admin/tenants/{new_tenant_id}", json={"status": "active"}, timeout=10)
        
        if r.status_code == 200:
            log_test("Super Admin: PATCH /admin/tenants (reactivate)", True, "Tenant reactivated")
        else:
            log_test("Super Admin: PATCH /admin/tenants (reactivate)", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Super Admin: PATCH /admin/tenants (reactivate)", False, f"Exception: {str(e)}")
    
    # Test 3.7: Login as reactivated tenant owner (should succeed)
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "test1@office.com",
            "password": "Test@123"
        }, timeout=10)
        
        if r.status_code == 200:
            log_test("Auth: Reactivated Tenant Login", True, "Successfully logged in after reactivation")
        else:
            log_test("Auth: Reactivated Tenant Login", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Auth: Reactivated Tenant Login", False, f"Exception: {str(e)}")
    
    # Test 3.8: Non-super-admin cannot access /admin/tenants
    demo_session = requests.Session()
    try:
        r = demo_session.post(f"{BASE_URL}/auth/login", json={
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Auth: Demo Owner Login", False, f"Status {r.status_code}: {r.text}")
        else:
            # Try to access /admin/tenants
            r = demo_session.get(f"{BASE_URL}/admin/tenants", timeout=10)
            if r.status_code == 403:
                log_test("Super Admin: Non-admin 403", True, "Demo owner correctly denied access to /admin/tenants")
            else:
                log_test("Super Admin: Non-admin 403", False, f"Expected 403, got {r.status_code}")
    except Exception as e:
        log_test("Super Admin: Non-admin 403", False, f"Exception: {str(e)}")
    
    return new_tenant_id

# ============ Test 4: Tenant Isolation ============
def test_tenant_isolation(new_tenant_id):
    """Test tenant data isolation (CRITICAL)"""
    
    # Login as demo owner
    demo_session = requests.Session()
    try:
        r = demo_session.post(f"{BASE_URL}/auth/login", json={
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Tenant Isolation: Demo Login", False, f"Status {r.status_code}: {r.text}")
            return
    except Exception as e:
        log_test("Tenant Isolation: Demo Login", False, f"Exception: {str(e)}")
        return
    
    # Create a client in demo tenant
    try:
        r = demo_session.post(f"{BASE_URL}/clients", json={
            "name": "DemoClientA",
            "phone": "0501234567",
            "notes": "Test client for isolation"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Tenant Isolation: Create Demo Client", False, f"Status {r.status_code}: {r.text}")
            return
        
        demo_client = r.json()
        log_test("Tenant Isolation: Create Demo Client", True, f"Created client: {demo_client.get('name')}")
    except Exception as e:
        log_test("Tenant Isolation: Create Demo Client", False, f"Exception: {str(e)}")
        return
    
    # Get clients in demo tenant (should include DemoClientA)
    try:
        r = demo_session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        
        if not isinstance(clients, list):
            log_test("Tenant Isolation: Demo GET /clients", False, f"Expected list, got: {type(clients)}")
            return
        
        demo_client_found = any(c.get("name") == "DemoClientA" for c in clients)
        if demo_client_found:
            log_test("Tenant Isolation: Demo GET /clients", True, f"Found DemoClientA in demo tenant ({len(clients)} total clients)")
        else:
            log_test("Tenant Isolation: Demo GET /clients", False, "DemoClientA not found in demo tenant")
    except Exception as e:
        log_test("Tenant Isolation: Demo GET /clients", False, f"Exception: {str(e)}")
    
    # Login as test1@office.com (new tenant)
    test_session = requests.Session()
    try:
        r = test_session.post(f"{BASE_URL}/auth/login", json={
            "email": "test1@office.com",
            "password": "Test@123"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Tenant Isolation: Test1 Login", False, f"Status {r.status_code}: {r.text}")
            return
    except Exception as e:
        log_test("Tenant Isolation: Test1 Login", False, f"Exception: {str(e)}")
        return
    
    # Get clients in test1 tenant (should NOT include DemoClientA)
    try:
        r = test_session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        
        if not isinstance(clients, list):
            log_test("Tenant Isolation: Test1 GET /clients (no DemoClientA)", False, f"Expected list, got: {type(clients)}")
            return
        
        demo_client_found = any(c.get("name") == "DemoClientA" for c in clients)
        if not demo_client_found:
            log_test("Tenant Isolation: Test1 GET /clients (no DemoClientA)", True, f"DemoClientA correctly NOT visible in test1 tenant ({len(clients)} clients)")
        else:
            log_test("Tenant Isolation: Test1 GET /clients (no DemoClientA)", False, "CRITICAL: DemoClientA leaked to test1 tenant!")
    except Exception as e:
        log_test("Tenant Isolation: Test1 GET /clients (no DemoClientA)", False, f"Exception: {str(e)}")
    
    # Create supplier and ticket in test1 tenant
    try:
        # Create client
        r = test_session.post(f"{BASE_URL}/clients", json={"name": "Test1Client", "phone": "0509999999"}, timeout=10)
        if r.status_code != 200:
            log_test("Tenant Isolation: Create Test1 Client", False, f"Status {r.status_code}: {r.text}")
            return
        test1_client = r.json()
        
        # Create supplier
        r = test_session.post(f"{BASE_URL}/suppliers", json={"name": "Test1Supplier", "phone": "0508888888"}, timeout=10)
        if r.status_code != 200:
            log_test("Tenant Isolation: Create Test1 Supplier", False, f"Status {r.status_code}: {r.text}")
            return
        test1_supplier = r.json()
        
        # Create ticket
        r = test_session.post(f"{BASE_URL}/tickets", json={
            "client_id": test1_client["id"],
            "supplier_id": test1_supplier["id"],
            "currency": "SAR",
            "cost": 800,
            "sale_price": 1000,
            "pnr": "TEST1PNR",
            "passenger_name": "Test Passenger",
            "date": datetime.now().isoformat()
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Tenant Isolation: Create Test1 Ticket", False, f"Status {r.status_code}: {r.text}")
            return
        
        log_test("Tenant Isolation: Create Test1 Ticket", True, "Created ticket in test1 tenant")
    except Exception as e:
        log_test("Tenant Isolation: Create Test1 Ticket", False, f"Exception: {str(e)}")
    
    # Login back as demo owner and check tickets (should NOT include test1 ticket)
    try:
        r = demo_session.get(f"{BASE_URL}/tickets", timeout=10)
        tickets = r.json()
        
        if not isinstance(tickets, list):
            log_test("Tenant Isolation: Demo GET /tickets (no Test1 data)", False, f"Expected list, got: {type(tickets)}")
            return
        
        test1_ticket_found = any(t.get("pnr") == "TEST1PNR" for t in tickets)
        if not test1_ticket_found:
            log_test("Tenant Isolation: Demo GET /tickets (no Test1 data)", True, f"Test1 ticket correctly NOT visible in demo tenant ({len(tickets)} tickets)")
        else:
            log_test("Tenant Isolation: Demo GET /tickets (no Test1 data)", False, "CRITICAL: Test1 ticket leaked to demo tenant!")
    except Exception as e:
        log_test("Tenant Isolation: Demo GET /tickets (no Test1 data)", False, f"Exception: {str(e)}")

# ============ Test 5: Ticket Auto-Journal (within tenant) ============
def test_ticket_auto_journal():
    """Test ticket auto-journal within tenant"""
    
    # Login as demo owner
    demo_session = requests.Session()
    try:
        r = demo_session.post(f"{BASE_URL}/auth/login", json={
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Ticket Auto-Journal: Demo Login", False, f"Status {r.status_code}: {r.text}")
            return
    except Exception as e:
        log_test("Ticket Auto-Journal: Demo Login", False, f"Exception: {str(e)}")
        return
    
    # Get or create client and supplier
    try:
        # Get clients
        r = demo_session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        
        if not clients:
            # Create client
            r = demo_session.post(f"{BASE_URL}/clients", json={"name": "عميل تجريبي", "phone": "0501111111"}, timeout=10)
            client = r.json()
        else:
            client = clients[0]
        
        # Get suppliers
        r = demo_session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers = r.json()
        
        if not suppliers:
            # Create supplier
            r = demo_session.post(f"{BASE_URL}/suppliers", json={"name": "مورد تجريبي", "phone": "0502222222"}, timeout=10)
            supplier = r.json()
        else:
            supplier = suppliers[0]
        
        # Get initial balances
        r = demo_session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        client_before = next((c for c in clients if c["id"] == client["id"]), None)
        
        r = demo_session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers = r.json()
        supplier_before = next((s for s in suppliers if s["id"] == supplier["id"]), None)
        
        client_balance_before = client_before["balances"]["SAR"] if client_before else 0
        supplier_balance_before = supplier_before["balances"]["SAR"] if supplier_before else 0
        
        # Create ticket
        r = demo_session.post(f"{BASE_URL}/tickets", json={
            "client_id": client["id"],
            "supplier_id": supplier["id"],
            "currency": "SAR",
            "cost": 1000,
            "sale_price": 1200,
            "pnr": f"AUTOJOURNAL{datetime.now().timestamp()}",
            "passenger_name": "مسافر تجريبي",
            "date": datetime.now().isoformat()
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Ticket Auto-Journal: Create Ticket", False, f"Status {r.status_code}: {r.text}")
            return
        
        ticket = r.json()
        log_test("Ticket Auto-Journal: Create Ticket", True, f"Created ticket with commission: {ticket.get('commission')}")
        
        # Get journal entries
        r = demo_session.get(f"{BASE_URL}/journal-entries", timeout=10)
        journal_entries = r.json()
        
        # Find the journal entry for this ticket
        ticket_je = next((je for je in journal_entries if je.get("ref_type") == "ticket" and je.get("ref_id") == ticket["id"]), None)
        
        if not ticket_je:
            log_test("Ticket Auto-Journal: Journal Entry Created", False, "Journal entry not found")
            return
        
        lines = ticket_je.get("lines", [])
        if len(lines) != 3:
            log_test("Ticket Auto-Journal: Journal Entry Lines", False, f"Expected 3 lines, got {len(lines)}")
            return
        
        # Check lines
        client_line = next((l for l in lines if l.get("account_code") == "1301"), None)
        supplier_line = next((l for l in lines if l.get("account_code") == "2101"), None)
        revenue_line = next((l for l in lines if l.get("account_code") == "4101"), None)
        
        if not client_line or not supplier_line or not revenue_line:
            log_test("Ticket Auto-Journal: Journal Entry Lines", False, "Missing expected account codes")
            return
        
        # Verify amounts
        if client_line["debit"] == 1200 and supplier_line["credit"] == 1000 and revenue_line["credit"] == 200:
            log_test("Ticket Auto-Journal: Journal Entry Balanced", True, "1301 debit 1200, 2101 credit 1000, 4101 credit 200")
        else:
            log_test("Ticket Auto-Journal: Journal Entry Balanced", False, f"Amounts incorrect: {client_line['debit']}, {supplier_line['credit']}, {revenue_line['credit']}")
        
        # Check balances
        r = demo_session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        client_after = next((c for c in clients if c["id"] == client["id"]), None)
        
        r = demo_session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers = r.json()
        supplier_after = next((s for s in suppliers if s["id"] == supplier["id"]), None)
        
        if client_after["balances"]["SAR"] == client_balance_before + 1200:
            log_test("Ticket Auto-Journal: Client Balance Updated", True, f"SAR: {client_balance_before} -> {client_after['balances']['SAR']}")
        else:
            log_test("Ticket Auto-Journal: Client Balance Updated", False, f"Expected {client_balance_before + 1200}, got {client_after['balances']['SAR']}")
        
        if supplier_after["balances"]["SAR"] == supplier_balance_before + 1000:
            log_test("Ticket Auto-Journal: Supplier Balance Updated", True, f"SAR: {supplier_balance_before} -> {supplier_after['balances']['SAR']}")
        else:
            log_test("Ticket Auto-Journal: Supplier Balance Updated", False, f"Expected {supplier_balance_before + 1000}, got {supplier_after['balances']['SAR']}")
        
    except Exception as e:
        log_test("Ticket Auto-Journal", False, f"Exception: {str(e)}")

# ============ Test 6: Bulk Import - Tickets ============
def test_bulk_import_tickets():
    """Test bulk import tickets with preview and validation"""
    
    # Login as demo owner
    demo_session = requests.Session()
    try:
        r = demo_session.post(f"{BASE_URL}/auth/login", json={
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Bulk Import Tickets: Demo Login", False, f"Status {r.status_code}: {r.text}")
            return
    except Exception as e:
        log_test("Bulk Import Tickets: Demo Login", False, f"Exception: {str(e)}")
        return
    
    # Test 6.1: Preview with validation
    preview_rows = [
        {"date": "2025-06-01", "currency": "SAR", "pnr": "BULK001", "passenger_name": "A", "client_name": "Bulk Client", "supplier_name": "Bulk Supplier", "cost": 500, "sale_price": 700},
        {"date": "2025-06-02", "currency": "USD", "pnr": "BULK002", "passenger_name": "B", "client_name": "Bulk Client", "supplier_name": "Bulk Supplier", "cost": 100, "sale_price": 150},
        {"date": "2025-06-03", "currency": "SAR", "pnr": "BULK001", "passenger_name": "A dup", "client_name": "Bulk Client", "supplier_name": "Bulk Supplier", "cost": 500, "sale_price": 700},
        {"date": "2025-06-04", "currency": "SAR", "pnr": "", "passenger_name": "C", "client_name": "", "supplier_name": "X", "cost": 100, "sale_price": 150}
    ]
    
    try:
        r = demo_session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": preview_rows}, timeout=10)
        
        if r.status_code != 200:
            log_test("Bulk Import Tickets: Preview", False, f"Status {r.status_code}: {r.text}")
            return
        
        preview = r.json()
        rows = preview.get("rows", [])
        
        # Check row numbers
        if not all(r.get("__row") == i + 1 for i, r in enumerate(rows)):
            log_test("Bulk Import Tickets: Preview Row Numbers", False, "Row numbers incorrect")
        else:
            log_test("Bulk Import Tickets: Preview Row Numbers", True, "All rows have correct __row")
        
        # Check row 3 (duplicate within file)
        row3 = rows[2] if len(rows) > 2 else None
        if row3 and row3.get("__dup") == "مكرر داخل نفس الملف":
            log_test("Bulk Import Tickets: Preview Duplicate Detection (within file)", True, f"Row 3: {row3.get('__dup')}")
        else:
            log_test("Bulk Import Tickets: Preview Duplicate Detection (within file)", False, f"Row 3 __dup: {row3.get('__dup') if row3 else 'N/A'}")
        
        # Check row 4 (missing client_name)
        row4 = rows[3] if len(rows) > 3 else None
        if row4 and any("اسم العميل مطلوب" in err for err in row4.get("__errors", [])):
            log_test("Bulk Import Tickets: Preview Validation (missing client)", True, f"Row 4 errors: {row4.get('__errors')}")
        else:
            log_test("Bulk Import Tickets: Preview Validation (missing client)", False, f"Row 4 errors: {row4.get('__errors') if row4 else 'N/A'}")
        
        # Check valid_count
        if preview.get("valid_count") == 2:
            log_test("Bulk Import Tickets: Preview Valid Count", True, f"valid_count: {preview.get('valid_count')}")
        else:
            log_test("Bulk Import Tickets: Preview Valid Count", False, f"Expected 2, got {preview.get('valid_count')}")
        
        # Check totals
        totals = preview.get("totals", {})
        if "SAR" in totals and "USD" in totals:
            log_test("Bulk Import Tickets: Preview Totals", True, f"SAR: {totals.get('SAR')}, USD: {totals.get('USD')}")
        else:
            log_test("Bulk Import Tickets: Preview Totals", False, f"Totals: {totals}")
        
    except Exception as e:
        log_test("Bulk Import Tickets: Preview", False, f"Exception: {str(e)}")
        return
    
    # Test 6.2: Actual import with skip_duplicates
    try:
        r = demo_session.post(f"{BASE_URL}/import/tickets", json={"rows": rows, "skip_duplicates": True}, timeout=10)
        
        if r.status_code != 200:
            log_test("Bulk Import Tickets: Import", False, f"Status {r.status_code}: {r.text}")
            return
        
        result = r.json()
        
        if result.get("created") == 2 and result.get("skipped") == 1 and result.get("failed") == 1:
            log_test("Bulk Import Tickets: Import Results", True, f"created: {result.get('created')}, skipped: {result.get('skipped')}, failed: {result.get('failed')}")
        else:
            log_test("Bulk Import Tickets: Import Results", False, f"Expected created=2, skipped=1, failed=1, got: {result}")
        
    except Exception as e:
        log_test("Bulk Import Tickets: Import", False, f"Exception: {str(e)}")
        return
    
    # Test 6.3: Check if Bulk Client was auto-created
    try:
        r = demo_session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        
        bulk_client = next((c for c in clients if c.get("name") == "Bulk Client"), None)
        if bulk_client:
            log_test("Bulk Import Tickets: Auto-create Client", True, f"Bulk Client auto-created with ID: {bulk_client.get('id')}")
        else:
            log_test("Bulk Import Tickets: Auto-create Client", False, "Bulk Client not found")
    except Exception as e:
        log_test("Bulk Import Tickets: Auto-create Client", False, f"Exception: {str(e)}")
    
    # Test 6.4: Check if tickets were created
    try:
        r = demo_session.get(f"{BASE_URL}/tickets", timeout=10)
        tickets = r.json()
        
        bulk001 = next((t for t in tickets if t.get("pnr") == "BULK001"), None)
        bulk002 = next((t for t in tickets if t.get("pnr") == "BULK002"), None)
        
        if bulk001 and bulk002:
            log_test("Bulk Import Tickets: Tickets Created", True, "BULK001 and BULK002 found in tickets")
        else:
            log_test("Bulk Import Tickets: Tickets Created", False, f"BULK001: {bool(bulk001)}, BULK002: {bool(bulk002)}")
    except Exception as e:
        log_test("Bulk Import Tickets: Tickets Created", False, f"Exception: {str(e)}")
    
    # Test 6.5: Re-run preview with same PNR (should detect existing in DB)
    try:
        r = demo_session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": [preview_rows[0]]}, timeout=10)
        
        if r.status_code != 200:
            log_test("Bulk Import Tickets: Preview Existing PNR", False, f"Status {r.status_code}: {r.text}")
            return
        
        preview = r.json()
        rows = preview.get("rows", [])
        
        if rows and rows[0].get("__dup") == "موجود مسبقاً في قاعدة البيانات":
            log_test("Bulk Import Tickets: Preview Existing PNR", True, f"Correctly detected: {rows[0].get('__dup')}")
        else:
            log_test("Bulk Import Tickets: Preview Existing PNR", False, f"__dup: {rows[0].get('__dup') if rows else 'N/A'}")
    except Exception as e:
        log_test("Bulk Import Tickets: Preview Existing PNR", False, f"Exception: {str(e)}")

# ============ Test 7: Bulk Import - Visas ============
def test_bulk_import_visas():
    """Test bulk import visas with preview and validation"""
    
    # Login as demo owner
    demo_session = requests.Session()
    try:
        r = demo_session.post(f"{BASE_URL}/auth/login", json={
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Bulk Import Visas: Demo Login", False, f"Status {r.status_code}: {r.text}")
            return
    except Exception as e:
        log_test("Bulk Import Visas: Demo Login", False, f"Exception: {str(e)}")
        return
    
    # Test 7.1: Preview with validation
    preview_rows = [
        {"date": "2025-06-01", "currency": "SAR", "passport_no": "V123456", "passenger_name": "Visa A", "client_name": "Visa Client", "supplier_name": "Visa Supplier", "cost": 300, "sale_price": 400, "service_type": "تأشيرة عمرة"},
        {"date": "2025-06-02", "currency": "USD", "passport_no": "V789012", "passenger_name": "Visa B", "client_name": "Visa Client", "supplier_name": "Visa Supplier", "cost": 50, "sale_price": 80, "service_type": "تأشيرة سياحية"},
        {"date": "2025-06-03", "currency": "SAR", "passport_no": "V123456", "passenger_name": "Visa A dup", "client_name": "Visa Client", "supplier_name": "Visa Supplier", "cost": 300, "sale_price": 400, "service_type": "تأشيرة عمرة"}
    ]
    
    try:
        r = demo_session.post(f"{BASE_URL}/import/visas/preview", json={"rows": preview_rows}, timeout=10)
        
        if r.status_code != 200:
            log_test("Bulk Import Visas: Preview", False, f"Status {r.status_code}: {r.text}")
            return
        
        preview = r.json()
        rows = preview.get("rows", [])
        
        # Check duplicate detection
        row3 = rows[2] if len(rows) > 2 else None
        if row3 and row3.get("__dup"):
            log_test("Bulk Import Visas: Preview Duplicate Detection", True, f"Row 3: {row3.get('__dup')}")
        else:
            log_test("Bulk Import Visas: Preview Duplicate Detection", False, f"Row 3 __dup: {row3.get('__dup') if row3 else 'N/A'}")
        
        # Check valid_count
        if preview.get("valid_count") == 2:
            log_test("Bulk Import Visas: Preview Valid Count", True, f"valid_count: {preview.get('valid_count')}")
        else:
            log_test("Bulk Import Visas: Preview Valid Count", False, f"Expected 2, got {preview.get('valid_count')}")
        
    except Exception as e:
        log_test("Bulk Import Visas: Preview", False, f"Exception: {str(e)}")
        return
    
    # Test 7.2: Actual import
    try:
        r = demo_session.post(f"{BASE_URL}/import/visas", json={"rows": rows, "skip_duplicates": True}, timeout=10)
        
        if r.status_code != 200:
            log_test("Bulk Import Visas: Import", False, f"Status {r.status_code}: {r.text}")
            return
        
        result = r.json()
        
        if result.get("created") == 2 and result.get("skipped") == 1:
            log_test("Bulk Import Visas: Import Results", True, f"created: {result.get('created')}, skipped: {result.get('skipped')}")
        else:
            log_test("Bulk Import Visas: Import Results", False, f"Expected created=2, skipped=1, got: {result}")
        
    except Exception as e:
        log_test("Bulk Import Visas: Import", False, f"Exception: {str(e)}")

# ============ Test 8: Tenant Settings & Users ============
def test_tenant_settings_and_users():
    """Test tenant settings and user management"""
    
    # Login as demo owner
    demo_session = requests.Session()
    try:
        r = demo_session.post(f"{BASE_URL}/auth/login", json={
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Tenant Settings: Demo Login", False, f"Status {r.status_code}: {r.text}")
            return
    except Exception as e:
        log_test("Tenant Settings: Demo Login", False, f"Exception: {str(e)}")
        return
    
    # Test 8.1: PUT /tenant/settings
    settings_data = {
        "agency_name": "مكتب X",
        "tax_id": "123456",
        "logo_base64": "data:image/png;base64,AAA",
        "phone": "0555",
        "primary_color": "#ff0000"
    }
    
    try:
        r = demo_session.put(f"{BASE_URL}/tenant/settings", json=settings_data, timeout=10)
        
        if r.status_code == 200:
            log_test("Tenant Settings: PUT /tenant/settings", True, "Settings updated")
        else:
            log_test("Tenant Settings: PUT /tenant/settings", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Tenant Settings: PUT /tenant/settings", False, f"Exception: {str(e)}")
    
    # Test 8.2: GET /tenant/settings
    try:
        r = demo_session.get(f"{BASE_URL}/tenant/settings", timeout=10)
        
        if r.status_code != 200:
            log_test("Tenant Settings: GET /tenant/settings", False, f"Status {r.status_code}: {r.text}")
        else:
            settings = r.json()
            if settings.get("agency_name") == "مكتب X" and settings.get("tax_id") == "123456":
                log_test("Tenant Settings: GET /tenant/settings", True, f"Settings retrieved: {settings.get('agency_name')}")
            else:
                log_test("Tenant Settings: GET /tenant/settings", False, f"Settings mismatch: {settings}")
    except Exception as e:
        log_test("Tenant Settings: GET /tenant/settings", False, f"Exception: {str(e)}")
    
    # Test 8.3: POST /tenant/users (create staff user)
    try:
        r = demo_session.post(f"{BASE_URL}/tenant/users", json={
            "name": "موظف",
            "email": "staff1@demo.com",
            "password": "Staff@123",
            "role": "staff"
        }, timeout=10)
        
        if r.status_code == 200:
            staff_user = r.json()
            log_test("Tenant Users: POST /tenant/users (staff)", True, f"Created user: {staff_user.get('email')}")
        else:
            log_test("Tenant Users: POST /tenant/users (staff)", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Tenant Users: POST /tenant/users (staff)", False, f"Exception: {str(e)}")
    
    # Test 8.4: Login as new tenant with max_users=2, try to create 3rd user
    test_session = requests.Session()
    try:
        r = test_session.post(f"{BASE_URL}/auth/login", json={
            "email": "test1@office.com",
            "password": "Test@123"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Tenant Users: Test1 Login", False, f"Status {r.status_code}: {r.text}")
        else:
            # Try to create 2nd user (should succeed)
            r = test_session.post(f"{BASE_URL}/tenant/users", json={
                "name": "موظف 1",
                "email": "staff1@office.com",
                "password": "Staff@123",
                "role": "staff"
            }, timeout=10)
            
            if r.status_code == 200:
                log_test("Tenant Users: Create 2nd user (within limit)", True, "2nd user created")
                
                # Try to create 3rd user (should fail)
                r = test_session.post(f"{BASE_URL}/tenant/users", json={
                    "name": "موظف 2",
                    "email": "staff2@office.com",
                    "password": "Staff@123",
                    "role": "staff"
                }, timeout=10)
                
                if r.status_code == 400:
                    error = r.json().get("error", "")
                    if "الحد الأقصى" in error:
                        log_test("Tenant Users: Create 3rd user (exceeds limit)", True, f"Correctly rejected: {error}")
                    else:
                        log_test("Tenant Users: Create 3rd user (exceeds limit)", True, f"Rejected with: {error}")
                else:
                    log_test("Tenant Users: Create 3rd user (exceeds limit)", False, f"Expected 400, got {r.status_code}")
            else:
                log_test("Tenant Users: Create 2nd user (within limit)", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Tenant Users: Max Users Limit", False, f"Exception: {str(e)}")
    
    # Test 8.5: PATCH /tenant/users/:id (deactivate)
    try:
        # Get users
        r = demo_session.get(f"{BASE_URL}/tenant/users", timeout=10)
        users = r.json()
        
        staff_user = next((u for u in users if u.get("email") == "staff1@demo.com"), None)
        if not staff_user:
            log_test("Tenant Users: PATCH /tenant/users (deactivate)", False, "staff1@demo.com not found")
        else:
            # Deactivate
            r = demo_session.patch(f"{BASE_URL}/tenant/users/{staff_user['id']}", json={"active": False}, timeout=10)
            
            if r.status_code == 200:
                log_test("Tenant Users: PATCH /tenant/users (deactivate)", True, "User deactivated")
                
                # Try to login as deactivated user
                r = requests.post(f"{BASE_URL}/auth/login", json={
                    "email": "staff1@demo.com",
                    "password": "Staff@123"
                }, timeout=10)
                
                if r.status_code == 401:
                    log_test("Tenant Users: Login as deactivated user", True, "Correctly rejected with 401")
                else:
                    log_test("Tenant Users: Login as deactivated user", False, f"Expected 401, got {r.status_code}")
            else:
                log_test("Tenant Users: PATCH /tenant/users (deactivate)", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Tenant Users: PATCH /tenant/users (deactivate)", False, f"Exception: {str(e)}")
    
    # Test 8.6: Role enforcement - staff cannot PUT /tenant/settings
    # First, reactivate staff1 and login
    try:
        # Reactivate
        r = demo_session.patch(f"{BASE_URL}/tenant/users/{staff_user['id']}", json={"active": True}, timeout=10)
        
        # Login as staff
        staff_session = requests.Session()
        r = staff_session.post(f"{BASE_URL}/auth/login", json={
            "email": "staff1@demo.com",
            "password": "Staff@123"
        }, timeout=10)
        
        if r.status_code == 200:
            # Try to PUT /tenant/settings
            r = staff_session.put(f"{BASE_URL}/tenant/settings", json={"agency_name": "Hacked"}, timeout=10)
            
            if r.status_code == 403:
                log_test("Tenant Users: Staff cannot PUT /tenant/settings", True, "Correctly rejected with 403")
            else:
                log_test("Tenant Users: Staff cannot PUT /tenant/settings", False, f"Expected 403, got {r.status_code}")
            
            # Try to POST /tenant/users
            r = staff_session.post(f"{BASE_URL}/tenant/users", json={
                "name": "Hacker",
                "email": "hacker@demo.com",
                "password": "Hack@123"
            }, timeout=10)
            
            if r.status_code == 403:
                log_test("Tenant Users: Staff cannot POST /tenant/users", True, "Correctly rejected with 403")
            else:
                log_test("Tenant Users: Staff cannot POST /tenant/users", False, f"Expected 403, got {r.status_code}")
        else:
            log_test("Tenant Users: Role Enforcement", False, f"Could not login as staff: {r.status_code}")
    except Exception as e:
        log_test("Tenant Users: Role Enforcement", False, f"Exception: {str(e)}")

# ============ Test 9: Reports Scoped by Tenant ============
def test_reports_scoped_by_tenant():
    """Test that reports are scoped by tenant"""
    
    # Login as demo owner
    demo_session = requests.Session()
    try:
        r = demo_session.post(f"{BASE_URL}/auth/login", json={
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Reports: Demo Login", False, f"Status {r.status_code}: {r.text}")
            return
    except Exception as e:
        log_test("Reports: Demo Login", False, f"Exception: {str(e)}")
        return
    
    # Test 9.1: Profits report
    try:
        r = demo_session.get(f"{BASE_URL}/reports/profits", timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if "rows" in data and "totals_profit" in data:
                log_test("Reports: Profits Report", True, f"Returned {len(data.get('rows', []))} rows")
            else:
                log_test("Reports: Profits Report", False, f"Missing expected fields: {data.keys()}")
        else:
            log_test("Reports: Profits Report", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Reports: Profits Report", False, f"Exception: {str(e)}")
    
    # Test 9.2: Trial Balance
    try:
        r = demo_session.get(f"{BASE_URL}/reports/trial-balance", timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if "rows" in data and "totals" in data:
                log_test("Reports: Trial Balance", True, f"Returned {len(data.get('rows', []))} rows")
            else:
                log_test("Reports: Trial Balance", False, f"Missing expected fields: {data.keys()}")
        else:
            log_test("Reports: Trial Balance", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Reports: Trial Balance", False, f"Exception: {str(e)}")

# ============ Test 10: Vouchers Still Work ============
def test_vouchers():
    """Test that vouchers still work within tenant"""
    
    # Login as demo owner
    demo_session = requests.Session()
    try:
        r = demo_session.post(f"{BASE_URL}/auth/login", json={
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Vouchers: Demo Login", False, f"Status {r.status_code}: {r.text}")
            return
    except Exception as e:
        log_test("Vouchers: Demo Login", False, f"Exception: {str(e)}")
        return
    
    # Get client and box
    try:
        r = demo_session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        if not clients:
            log_test("Vouchers: Get Client", False, "No clients found")
            return
        client = clients[0]
        
        r = demo_session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes = r.json()
        if not boxes:
            log_test("Vouchers: Get Box", False, "No boxes found")
            return
        box = boxes[0]
        
        # Create receipt voucher
        r = demo_session.post(f"{BASE_URL}/vouchers", json={
            "type": "receipt",
            "currency": "SAR",
            "amount": 500,
            "party_type": "client",
            "party_id": client["id"],
            "box_id": box["id"],
            "description": "Test receipt",
            "date": datetime.now().isoformat()
        }, timeout=10)
        
        if r.status_code == 200:
            log_test("Vouchers: Create Receipt", True, "Receipt voucher created")
        else:
            log_test("Vouchers: Create Receipt", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        log_test("Vouchers: Create Receipt", False, f"Exception: {str(e)}")

# ============ Main Test Runner ============
def main():
    print("="*80)
    print("Rahaal ERP v2.0 SaaS Backend Test Suite")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    print()
    
    # Run tests
    test_health()
    admin_session = test_auth_flow()
    new_tenant_id = test_super_admin_tenant_management(admin_session)
    test_tenant_isolation(new_tenant_id)
    test_ticket_auto_journal()
    test_bulk_import_tickets()
    test_bulk_import_visas()
    test_tenant_settings_and_users()
    test_reports_scoped_by_tenant()
    test_vouchers()
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
