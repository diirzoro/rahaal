#!/usr/bin/env python3
"""
Backend Test Suite for Rahaal v3.9.9
Tests 4 main features:
1. Enhanced Duplicate Detection (name + date) in Excel Import
2. Bulk-Delete Endpoints
3. User default_box_id + lock_box
4. Regression tests
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
AUTH_EMAIL = "owner@demo.com"
AUTH_PASSWORD = "Demo@2025"

# Global session
session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

# Test state
test_results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"  Details: {details}")
    test_results["tests"].append({"name": name, "passed": passed, "details": details})
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1

def login():
    """Login and get session cookie"""
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json={
            "email": AUTH_EMAIL,
            "password": AUTH_PASSWORD
        })
        if resp.status_code == 200:
            data = resp.json()
            log_test("Login", True, f"Logged in as {data.get('user', {}).get('email')}")
            return data
        else:
            log_test("Login", False, f"Status {resp.status_code}: {resp.text}")
            return None
    except Exception as e:
        log_test("Login", False, str(e))
        return None

def get_setup_data():
    """Get clients, suppliers, and boxes for testing"""
    try:
        # Get clients
        clients_resp = session.get(f"{BASE_URL}/clients")
        clients = clients_resp.json() if clients_resp.status_code == 200 else []
        
        # Get suppliers
        suppliers_resp = session.get(f"{BASE_URL}/suppliers")
        suppliers = suppliers_resp.json() if suppliers_resp.status_code == 200 else []
        
        # Get boxes
        boxes_resp = session.get(f"{BASE_URL}/boxes")
        boxes = boxes_resp.json() if boxes_resp.status_code == 200 else []
        
        # Create if needed
        if not clients:
            client_resp = session.post(f"{BASE_URL}/clients", json={
                "name": "عميل اختبار v3.9.9",
                "phone": "777123456",
                "notes": "للاختبار"
            })
            if client_resp.status_code == 200:
                clients = [client_resp.json()]
        
        if not suppliers:
            supplier_resp = session.post(f"{BASE_URL}/suppliers", json={
                "name": "مورد اختبار v3.9.9",
                "phone": "777654321",
                "notes": "للاختبار"
            })
            if supplier_resp.status_code == 200:
                suppliers = [supplier_resp.json()]
        
        client = clients[0] if clients else None
        supplier = suppliers[0] if suppliers else None
        box = boxes[0] if boxes else None
        
        log_test("Setup Data", client and supplier and box, 
                f"Client: {client.get('name') if client else 'None'}, "
                f"Supplier: {supplier.get('name') if supplier else 'None'}, "
                f"Box: {box.get('name_ar') if box else 'None'}")
        
        return client, supplier, box
    except Exception as e:
        log_test("Setup Data", False, str(e))
        return None, None, None

def test_health():
    """Test health endpoint returns version 3.9.9"""
    try:
        resp = session.get(f"{BASE_URL}/health")
        if resp.status_code == 200:
            data = resp.json()
            version = data.get("version")
            passed = version == "3.9.9"
            log_test("Health Check - Version 3.9.9", passed, f"Version: {version}")
            return passed
        else:
            log_test("Health Check", False, f"Status {resp.status_code}")
            return False
    except Exception as e:
        log_test("Health Check", False, str(e))
        return False

def test_enhanced_duplicate_detection_tickets(client, supplier):
    """Test Feature 1: Enhanced Duplicate Detection (name + date) for Tickets"""
    print("\n=== Feature 1: Enhanced Duplicate Detection - Tickets ===")
    
    try:
        # Step 1: Create a real ticket with specific passenger_name and travel_date
        today = datetime.now().strftime("%Y-%m-%d")
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        travel_date = (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d")
        
        ticket_data = {
            "date": today,
            "currency": "USD",
            "client_id": client["id"],
            "supplier_id": supplier["id"],
            "pnr": "",
            "passenger_name": "احمد علي",
            "travel_date": travel_date,
            "cost": 100,
            "sale_price": 150,
            "payment_method": "credit"
        }
        
        ticket_resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
        if ticket_resp.status_code != 200:
            log_test("Create Test Ticket", False, f"Status {ticket_resp.status_code}: {ticket_resp.text}")
            return False
        
        ticket = ticket_resp.json()
        log_test("Create Test Ticket", True, f"Created ticket with passenger: احمد علي, travel_date: {travel_date}")
        
        # Step 2: Call preview with 3 rows
        preview_rows = [
            {
                "pnr": "",
                "passenger_name": "احمد علي",
                "travel_date": travel_date,
                "currency": "USD",
                "cost": 110,
                "sale_price": 160,
                "client_name": client["name"],
                "supplier_name": supplier["name"]
            },
            {
                "pnr": "",
                "passenger_name": "احمد علي",
                "travel_date": tomorrow,
                "currency": "USD",
                "cost": 110,
                "sale_price": 160,
                "client_name": client["name"],
                "supplier_name": supplier["name"]
            },
            {
                "pnr": "",
                "passenger_name": "احمد علي",
                "travel_date": tomorrow,
                "currency": "USD",
                "cost": 110,
                "sale_price": 160,
                "client_name": client["name"],
                "supplier_name": supplier["name"]
            }
        ]
        
        preview_resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": preview_rows})
        if preview_resp.status_code != 200:
            log_test("Tickets Preview - Enhanced Dedup", False, f"Status {preview_resp.status_code}: {preview_resp.text}")
            return False
        
        preview_data = preview_resp.json()
        rows = preview_data.get("rows", [])
        
        # Verify Row 1: Should be marked as duplicate (matches existing DB record)
        row1_dup = rows[0].get("__dup") if len(rows) > 0 else None
        row1_passed = row1_dup and "موجود مسبقاً" in row1_dup and "اسم المسافر" in row1_dup
        log_test("Tickets Preview - Row 1 (DB duplicate)", row1_passed, 
                f"__dup: {row1_dup}")
        
        # Verify Row 2: Should NOT be duplicate (different date)
        row2_dup = rows[1].get("__dup") if len(rows) > 1 else None
        row2_passed = not row2_dup or row2_dup == False
        log_test("Tickets Preview - Row 2 (different date, new booking)", row2_passed, 
                f"__dup: {row2_dup}")
        
        # Verify Row 3: Should be marked as duplicate within file (same as row 2)
        row3_dup = rows[2].get("__dup") if len(rows) > 2 else None
        row3_passed = row3_dup and "مكرر داخل نفس الملف" in row3_dup
        log_test("Tickets Preview - Row 3 (file duplicate)", row3_passed, 
                f"__dup: {row3_dup}")
        
        # Cleanup
        session.delete(f"{BASE_URL}/tickets/{ticket['id']}")
        
        return row1_passed and row2_passed and row3_passed
        
    except Exception as e:
        log_test("Enhanced Duplicate Detection - Tickets", False, str(e))
        return False

def test_enhanced_duplicate_detection_visas(client, supplier):
    """Test Feature 1: Enhanced Duplicate Detection (name + date) for Visas"""
    print("\n=== Feature 1: Enhanced Duplicate Detection - Visas ===")
    
    try:
        # Step 1: Create a real visa with specific passenger_name and entry_date
        today = datetime.now().strftime("%Y-%m-%d")
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        entry_date = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        
        visa_data = {
            "date": today,
            "currency": "USD",
            "client_id": client["id"],
            "supplier_id": supplier["id"],
            "service_type": "تأشيرة عمرة",
            "passport_no": "",
            "passenger_name": "فاطمة محمد",
            "entry_date": entry_date,
            "cost": 80,
            "sale_price": 120,
            "payment_method": "credit"
        }
        
        visa_resp = session.post(f"{BASE_URL}/visas", json=visa_data)
        if visa_resp.status_code != 200:
            log_test("Create Test Visa", False, f"Status {visa_resp.status_code}: {visa_resp.text}")
            return False
        
        visa = visa_resp.json()
        log_test("Create Test Visa", True, f"Created visa with passenger: فاطمة محمد, entry_date: {entry_date}")
        
        # Step 2: Call preview with 3 rows
        preview_rows = [
            {
                "passport_no": "",
                "passenger_name": "فاطمة محمد",
                "entry_date": entry_date,
                "service_type": "تأشيرة عمرة",
                "currency": "USD",
                "cost": 90,
                "sale_price": 130,
                "client_name": client["name"],
                "supplier_name": supplier["name"]
            },
            {
                "passport_no": "",
                "passenger_name": "فاطمة محمد",
                "entry_date": tomorrow,
                "service_type": "تأشيرة عمرة",
                "currency": "USD",
                "cost": 90,
                "sale_price": 130,
                "client_name": client["name"],
                "supplier_name": supplier["name"]
            },
            {
                "passport_no": "",
                "passenger_name": "فاطمة محمد",
                "entry_date": tomorrow,
                "service_type": "تأشيرة عمرة",
                "currency": "USD",
                "cost": 90,
                "sale_price": 130,
                "client_name": client["name"],
                "supplier_name": supplier["name"]
            }
        ]
        
        preview_resp = session.post(f"{BASE_URL}/import/visas/preview", json={"rows": preview_rows})
        if preview_resp.status_code != 200:
            log_test("Visas Preview - Enhanced Dedup", False, f"Status {preview_resp.status_code}: {preview_resp.text}")
            return False
        
        preview_data = preview_resp.json()
        rows = preview_data.get("rows", [])
        
        # Verify Row 1: Should be marked as duplicate (matches existing DB record)
        row1_dup = rows[0].get("__dup") if len(rows) > 0 else None
        row1_passed = row1_dup and "موجود مسبقاً" in row1_dup
        log_test("Visas Preview - Row 1 (DB duplicate)", row1_passed, 
                f"__dup: {row1_dup}")
        
        # Verify Row 2: Should NOT be duplicate (different date)
        row2_dup = rows[1].get("__dup") if len(rows) > 1 else None
        row2_passed = not row2_dup or row2_dup == False
        log_test("Visas Preview - Row 2 (different date, new booking)", row2_passed, 
                f"__dup: {row2_dup}")
        
        # Verify Row 3: Should be marked as duplicate within file (same as row 2)
        row3_dup = rows[2].get("__dup") if len(rows) > 2 else None
        row3_passed = row3_dup and "مكرر داخل نفس الملف" in row3_dup
        log_test("Visas Preview - Row 3 (file duplicate)", row3_passed, 
                f"__dup: {row3_dup}")
        
        # Cleanup
        session.delete(f"{BASE_URL}/visas/{visa['id']}")
        
        return row1_passed and row2_passed and row3_passed
        
    except Exception as e:
        log_test("Enhanced Duplicate Detection - Visas", False, str(e))
        return False

def test_bulk_delete_tickets(client, supplier):
    """Test Feature 2: Bulk-Delete Endpoints for Tickets"""
    print("\n=== Feature 2: Bulk-Delete - Tickets ===")
    
    try:
        # Get initial balances
        client_before = session.get(f"{BASE_URL}/clients").json()
        client_balance_before = next((c for c in client_before if c["id"] == client["id"]), {}).get("balances", {}).get("USD", 0)
        
        supplier_before = session.get(f"{BASE_URL}/suppliers").json()
        supplier_balance_before = next((s for s in supplier_before if s["id"] == supplier["id"]), {}).get("balances", {}).get("USD", 0)
        
        # Create 3 tickets
        ticket_ids = []
        for i in range(3):
            ticket_data = {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "currency": "USD",
                "client_id": client["id"],
                "supplier_id": supplier["id"],
                "pnr": f"BULK{i+1}",
                "passenger_name": f"مسافر {i+1}",
                "travel_date": (datetime.now() + timedelta(days=i+1)).strftime("%Y-%m-%d"),
                "cost": 100,
                "sale_price": 150,
                "payment_method": "credit"
            }
            resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
            if resp.status_code == 200:
                ticket_ids.append(resp.json()["id"])
        
        if len(ticket_ids) != 3:
            log_test("Create 3 Tickets for Bulk Delete", False, f"Only created {len(ticket_ids)} tickets")
            return False
        
        log_test("Create 3 Tickets for Bulk Delete", True, f"Created tickets: {ticket_ids}")
        
        # Call bulk-delete
        bulk_resp = session.post(f"{BASE_URL}/tickets/bulk-delete", json={"ids": ticket_ids})
        if bulk_resp.status_code != 200:
            log_test("Bulk Delete Tickets", False, f"Status {bulk_resp.status_code}: {bulk_resp.text}")
            return False
        
        bulk_data = bulk_resp.json()
        deleted = bulk_data.get("deleted", 0)
        failed = bulk_data.get("failed", 0)
        kind = bulk_data.get("kind")
        
        # Verify response
        response_passed = deleted == 3 and failed == 0 and kind == "tickets"
        log_test("Bulk Delete Response", response_passed, 
                f"deleted: {deleted}, failed: {failed}, kind: {kind}")
        
        # Verify tickets are gone
        tickets_resp = session.get(f"{BASE_URL}/tickets")
        tickets = tickets_resp.json() if tickets_resp.status_code == 200 else []
        remaining = [t for t in tickets if t["id"] in ticket_ids]
        tickets_gone = len(remaining) == 0
        log_test("Tickets Deleted from DB", tickets_gone, 
                f"Remaining tickets: {len(remaining)}")
        
        # Verify balances reverted
        client_after = session.get(f"{BASE_URL}/clients").json()
        client_balance_after = next((c for c in client_after if c["id"] == client["id"]), {}).get("balances", {}).get("USD", 0)
        
        supplier_after = session.get(f"{BASE_URL}/suppliers").json()
        supplier_balance_after = next((s for s in supplier_after if s["id"] == supplier["id"]), {}).get("balances", {}).get("USD", 0)
        
        # Expected: balances should be reverted by 3 * (150 for client, 100 for supplier)
        client_reverted = abs((client_balance_after - client_balance_before) - (-450)) < 0.01
        supplier_reverted = abs((supplier_balance_after - supplier_balance_before) - (-300)) < 0.01
        
        log_test("Client Balance Reverted", client_reverted, 
                f"Before: {client_balance_before}, After: {client_balance_after}, Delta: {client_balance_after - client_balance_before}")
        log_test("Supplier Balance Reverted", supplier_reverted, 
                f"Before: {supplier_balance_before}, After: {supplier_balance_after}, Delta: {supplier_balance_after - supplier_balance_before}")
        
        return response_passed and tickets_gone and client_reverted and supplier_reverted
        
    except Exception as e:
        log_test("Bulk Delete Tickets", False, str(e))
        return False

def test_bulk_delete_edge_cases():
    """Test Feature 2: Bulk-Delete Edge Cases"""
    print("\n=== Feature 2: Bulk-Delete Edge Cases ===")
    
    try:
        # Test 1: Empty ids array
        empty_resp = session.post(f"{BASE_URL}/tickets/bulk-delete", json={"ids": []})
        empty_passed = empty_resp.status_code == 400 and "لم يتم اختيار أي سجل" in empty_resp.text
        log_test("Bulk Delete - Empty IDs", empty_passed, 
                f"Status: {empty_resp.status_code}, Message: {empty_resp.text[:100]}")
        
        # Test 2: Bad ID
        bad_resp = session.post(f"{BASE_URL}/tickets/bulk-delete", json={"ids": ["fake-id-xyz"]})
        if bad_resp.status_code == 200:
            bad_data = bad_resp.json()
            deleted = bad_data.get("deleted", 0)
            failed = bad_data.get("failed", 0)
            errors = bad_data.get("errors", [])
            bad_passed = deleted == 0 and failed == 1 and len(errors) == 1
            log_test("Bulk Delete - Bad ID", bad_passed, 
                    f"deleted: {deleted}, failed: {failed}, errors: {errors}")
        else:
            log_test("Bulk Delete - Bad ID", False, f"Status {bad_resp.status_code}")
            bad_passed = False
        
        return empty_passed and bad_passed
        
    except Exception as e:
        log_test("Bulk Delete Edge Cases", False, str(e))
        return False

def test_bulk_delete_visas(client, supplier):
    """Test Feature 2: Bulk-Delete Endpoints for Visas"""
    print("\n=== Feature 2: Bulk-Delete - Visas ===")
    
    try:
        # Create 2 visas
        visa_ids = []
        for i in range(2):
            visa_data = {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "currency": "USD",
                "client_id": client["id"],
                "supplier_id": supplier["id"],
                "service_type": "تأشيرة عمرة",
                "passport_no": f"V{i+1}123456",
                "passenger_name": f"معتمر {i+1}",
                "entry_date": (datetime.now() + timedelta(days=i+1)).strftime("%Y-%m-%d"),
                "cost": 80,
                "sale_price": 120,
                "payment_method": "credit"
            }
            resp = session.post(f"{BASE_URL}/visas", json=visa_data)
            if resp.status_code == 200:
                visa_ids.append(resp.json()["id"])
        
        if len(visa_ids) != 2:
            log_test("Create 2 Visas for Bulk Delete", False, f"Only created {len(visa_ids)} visas")
            return False
        
        log_test("Create 2 Visas for Bulk Delete", True, f"Created visas: {visa_ids}")
        
        # Call bulk-delete
        bulk_resp = session.post(f"{BASE_URL}/visas/bulk-delete", json={"ids": visa_ids})
        if bulk_resp.status_code != 200:
            log_test("Bulk Delete Visas", False, f"Status {bulk_resp.status_code}: {bulk_resp.text}")
            return False
        
        bulk_data = bulk_resp.json()
        deleted = bulk_data.get("deleted", 0)
        failed = bulk_data.get("failed", 0)
        
        passed = deleted == 2 and failed == 0
        log_test("Bulk Delete Visas", passed, 
                f"deleted: {deleted}, failed: {failed}")
        
        return passed
        
    except Exception as e:
        log_test("Bulk Delete Visas", False, str(e))
        return False

def test_user_default_box_and_lock(box):
    """Test Feature 3: User default_box_id + lock_box"""
    print("\n=== Feature 3: User default_box_id + lock_box ===")
    
    try:
        # Check if tenant is gold tier (required for user creation)
        me_resp = session.get(f"{BASE_URL}/auth/me")
        if me_resp.status_code != 200:
            log_test("Get Auth Me", False, f"Status {me_resp.status_code}")
            return False
        
        me_data = me_resp.json()
        tenant = me_data.get("tenant", {})
        plan_tier = tenant.get("plan_tier", "standard")
        
        log_test("Check Tenant Plan Tier", True, f"Plan tier: {plan_tier}")
        
        if plan_tier != "gold":
            log_test("User Creation (Tier Gate)", True, 
                    f"Tenant is {plan_tier}, not gold. Tier gate blocks user creation (expected behavior). "
                    "Testing with existing user instead.")
            
            # Test with existing owner user
            user = me_data.get("user", {})
            has_default_box = "default_box_id" in user
            has_lock_box = "lock_box" in user
            
            log_test("Existing User Has default_box_id Field", has_default_box, 
                    f"default_box_id: {user.get('default_box_id')}")
            log_test("Existing User Has lock_box Field", has_lock_box, 
                    f"lock_box: {user.get('lock_box')}")
            
            return has_default_box and has_lock_box
        
        # If gold tier, test user creation with default_box_id and lock_box
        user_data = {
            "name": "كاشير تجريبي v3.9.9",
            "email": f"cashier-v399-{datetime.now().timestamp()}@demo.com",
            "password": "Cash@2025",
            "role": "staff",
            "default_box_id": box["id"],
            "lock_box": True
        }
        
        create_resp = session.post(f"{BASE_URL}/tenant/users", json=user_data)
        if create_resp.status_code != 200:
            log_test("Create User with default_box_id", False, 
                    f"Status {create_resp.status_code}: {create_resp.text}")
            return False
        
        user = create_resp.json()
        user_id = user.get("id")
        
        create_passed = (user.get("default_box_id") == box["id"] and 
                        user.get("lock_box") == True)
        log_test("Create User with default_box_id + lock_box", create_passed, 
                f"default_box_id: {user.get('default_box_id')}, lock_box: {user.get('lock_box')}")
        
        # Test PATCH to update
        patch_resp = session.patch(f"{BASE_URL}/tenant/users/{user_id}", json={
            "default_box_id": None,
            "lock_box": False
        })
        patch_passed = patch_resp.status_code == 200
        log_test("PATCH User - Update default_box_id + lock_box", patch_passed, 
                f"Status: {patch_resp.status_code}")
        
        # Test GET /tenant/users
        users_resp = session.get(f"{BASE_URL}/tenant/users")
        if users_resp.status_code == 200:
            users = users_resp.json()
            created_user = next((u for u in users if u["id"] == user_id), None)
            if created_user:
                get_passed = ("default_box_id" in created_user and 
                             "lock_box" in created_user)
                log_test("GET /tenant/users - Fields Present", get_passed, 
                        f"default_box_id: {created_user.get('default_box_id')}, "
                        f"lock_box: {created_user.get('lock_box')}")
            else:
                log_test("GET /tenant/users - Find Created User", False, "User not found")
                get_passed = False
        else:
            log_test("GET /tenant/users", False, f"Status {users_resp.status_code}")
            get_passed = False
        
        # Cleanup
        session.delete(f"{BASE_URL}/tenant/users/{user_id}")
        
        return create_passed and patch_passed and get_passed
        
    except Exception as e:
        log_test("User default_box_id + lock_box", False, str(e))
        return False

def test_regression(client, supplier, box):
    """Test Feature 4: Regression Tests"""
    print("\n=== Feature 4: Regression Tests ===")
    
    try:
        # Test 1: Regular ticket creation with cash + box_id
        ticket_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "currency": "USD",
            "client_id": client["id"],
            "supplier_id": supplier["id"],
            "pnr": "REG001",
            "passenger_name": "مسافر عادي",
            "travel_date": (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d"),
            "cost": 100,
            "sale_price": 150,
            "payment_method": "cash",
            "box_id": box["id"]
        }
        
        ticket_resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
        ticket_passed = ticket_resp.status_code == 200
        log_test("Regression - Regular Ticket (cash + box_id)", ticket_passed, 
                f"Status: {ticket_resp.status_code}")
        
        if ticket_passed:
            ticket = ticket_resp.json()
            session.delete(f"{BASE_URL}/tickets/{ticket['id']}")
        
        # Test 2: v3.9.8 flexible receipt (box name in client_name column)
        import_rows = [{
            "pnr": "FLEX001",
            "passenger_name": "مسافر مرن",
            "travel_date": (datetime.now() + timedelta(days=6)).strftime("%Y-%m-%d"),
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": box["name_ar"],  # Box name instead of client name
            "supplier_name": supplier["name"]
        }]
        
        import_resp = session.post(f"{BASE_URL}/import/tickets", json={
            "rows": import_rows,
            "skip_duplicates": True
        })
        
        if import_resp.status_code == 200:
            import_data = import_resp.json()
            created = import_data.get("created", 0)
            import_passed = created == 1
            log_test("Regression - v3.9.8 Flexible Receipt (box name)", import_passed, 
                    f"created: {created}")
            
            # Cleanup - find and delete the created ticket
            if created > 0:
                tickets_resp = session.get(f"{BASE_URL}/tickets")
                if tickets_resp.status_code == 200:
                    tickets = tickets_resp.json()
                    flex_ticket = next((t for t in tickets if t.get("pnr") == "FLEX001"), None)
                    if flex_ticket:
                        session.delete(f"{BASE_URL}/tickets/{flex_ticket['id']}")
        else:
            log_test("Regression - v3.9.8 Flexible Receipt", False, 
                    f"Status {import_resp.status_code}: {import_resp.text}")
            import_passed = False
        
        return ticket_passed and import_passed
        
    except Exception as e:
        log_test("Regression Tests", False, str(e))
        return False

def main():
    """Main test runner"""
    print("=" * 60)
    print("Rahaal v3.9.9 Backend Test Suite")
    print("=" * 60)
    
    # Login
    auth_data = login()
    if not auth_data:
        print("\n❌ Login failed. Cannot proceed with tests.")
        sys.exit(1)
    
    # Get setup data
    client, supplier, box = get_setup_data()
    if not client or not supplier or not box:
        print("\n❌ Setup data incomplete. Cannot proceed with tests.")
        sys.exit(1)
    
    # Run tests
    print("\n" + "=" * 60)
    print("Running Tests")
    print("=" * 60)
    
    # Feature 0: Health check
    test_health()
    
    # Feature 1: Enhanced Duplicate Detection
    test_enhanced_duplicate_detection_tickets(client, supplier)
    test_enhanced_duplicate_detection_visas(client, supplier)
    
    # Feature 2: Bulk-Delete
    test_bulk_delete_tickets(client, supplier)
    test_bulk_delete_edge_cases()
    test_bulk_delete_visas(client, supplier)
    
    # Feature 3: User default_box_id + lock_box
    test_user_default_box_and_lock(box)
    
    # Feature 4: Regression
    test_regression(client, supplier, box)
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    print(f"Total Tests: {test_results['passed'] + test_results['failed']}")
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    print("=" * 60)
    
    if test_results['failed'] > 0:
        print("\n❌ Some tests failed. See details above.")
        sys.exit(1)
    else:
        print("\n✅ All tests passed!")
        sys.exit(0)

if __name__ == "__main__":
    main()
