#!/usr/bin/env python3
"""
Backend Test Suite for v3.10.2 + v3.10.3 (Phase 1 + Phase 2)
Tests strict validations, quick-add with parent_code, and regression scenarios.
"""

import requests
import json
import sys
from datetime import datetime
from pymongo import MongoClient

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test credentials
DEMO_TENANT = {
    "email": "owner@demo.com",
    "password": "<DEMO_PASSWORD-see-memory/test_credentials.md>",
    "tenant_id": "d89bc41d-e19b-430f-be93-e3f8ca6d404a"
}

# Global session
session = requests.Session()
current_user = None

# Test results tracking
test_results = []
created_entities = []  # Track entities to cleanup
initial_seq_1301 = None
initial_seq_2101 = None

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
            log_test(f"Login as {email}", True, f"Logged in successfully")
            return True
        else:
            log_test(f"Login as {email}", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test(f"Login as {email}", False, str(e))
        return False

def test_phase1_ticket_missing_fields():
    """Phase 1 Test 1: POST /api/tickets - missing fields validation"""
    print("\n=== PHASE 1 TEST 1: POST /api/tickets - Missing Fields ===")
    
    try:
        # Get required data
        suppliers_resp = session.get(f"{BASE_URL}/suppliers")
        if suppliers_resp.status_code != 200 or not suppliers_resp.json():
            log_test("Get supplier for ticket test", False, "No suppliers available")
            return False
        
        supplier_id = suppliers_resp.json()[0]["id"]
        
        # Test 1.1: Missing passenger_name
        ticket_data = {
            "travel_date": "2025-12-01",
            "phone": "0501234567",
            "supplier_id": supplier_id,
            "currency": "SAR",
            "cost": 1000,
            "sale_price": 1200
        }
        
        resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "اسم المسافر مطلوب" in error_msg:
                log_test("Ticket missing passenger_name → 400", True, f"Got expected error: {error_msg}")
            else:
                log_test("Ticket missing passenger_name → 400", False, f"Wrong error: {error_msg}")
        else:
            log_test("Ticket missing passenger_name → 400", False, f"Expected 400, got {resp.status_code}")
        
        # Test 1.2: Missing travel_date
        ticket_data = {
            "passenger_name": "أحمد محمد",
            "phone": "0501234567",
            "supplier_id": supplier_id,
            "currency": "SAR",
            "cost": 1000,
            "sale_price": 1200
        }
        
        resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "تاريخ السفر مطلوب" in error_msg:
                log_test("Ticket missing travel_date → 400", True, f"Got expected error: {error_msg}")
            else:
                log_test("Ticket missing travel_date → 400", False, f"Wrong error: {error_msg}")
        else:
            log_test("Ticket missing travel_date → 400", False, f"Expected 400, got {resp.status_code}")
        
        # Test 1.3: Missing phone
        ticket_data = {
            "passenger_name": "أحمد محمد",
            "travel_date": "2025-12-01",
            "supplier_id": supplier_id,
            "currency": "SAR",
            "cost": 1000,
            "sale_price": 1200
        }
        
        resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "رقم الجوال مطلوب" in error_msg:
                log_test("Ticket missing phone → 400", True, f"Got expected error: {error_msg}")
            else:
                log_test("Ticket missing phone → 400", False, f"Wrong error: {error_msg}")
        else:
            log_test("Ticket missing phone → 400", False, f"Expected 400, got {resp.status_code}")
        
        # Test 1.4: Negative cost
        ticket_data = {
            "passenger_name": "أحمد محمد",
            "travel_date": "2025-12-01",
            "phone": "0501234567",
            "supplier_id": supplier_id,
            "currency": "SAR",
            "cost": -50,
            "sale_price": 1200
        }
        
        resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "القيمة السالبة غير مسموحة" in error_msg:
                log_test("Ticket negative cost → 400", True, f"Got expected error")
            else:
                log_test("Ticket negative cost → 400", False, f"Wrong error: {error_msg}")
        else:
            log_test("Ticket negative cost → 400", False, f"Expected 400, got {resp.status_code}")
        
        # Test 1.5: Negative discount
        ticket_data = {
            "passenger_name": "أحمد محمد",
            "travel_date": "2025-12-01",
            "phone": "0501234567",
            "supplier_id": supplier_id,
            "currency": "SAR",
            "cost": 1000,
            "sale_price": 1200,
            "discount": -10
        }
        
        resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "القيمة السالبة غير مسموحة" in error_msg:
                log_test("Ticket negative discount → 400", True, f"Got expected error")
                return True
            else:
                log_test("Ticket negative discount → 400", False, f"Wrong error: {error_msg}")
                return False
        else:
            log_test("Ticket negative discount → 400", False, f"Expected 400, got {resp.status_code}")
            return False
            
    except Exception as e:
        log_test("Phase 1 - Ticket validations", False, str(e))
        return False

def test_phase1_visa_missing_fields():
    """Phase 1 Test 2: POST /api/visas - missing fields validation"""
    print("\n=== PHASE 1 TEST 2: POST /api/visas - Missing Fields ===")
    
    try:
        # Get required data
        suppliers_resp = session.get(f"{BASE_URL}/suppliers")
        if suppliers_resp.status_code != 200 or not suppliers_resp.json():
            log_test("Get supplier for visa test", False, "No suppliers available")
            return False
        
        supplier_id = suppliers_resp.json()[0]["id"]
        
        # Test 2.1: Missing beneficiary_name
        visa_data = {
            "phone": "0501234567",
            "supplier_id": supplier_id,
            "currency": "SAR",
            "cost": 500,
            "sale_price": 700,
            "service_type": "تأشيرة عمرة"
        }
        
        resp = session.post(f"{BASE_URL}/visas", json=visa_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "اسم صاحب التأشيرة / المعتمر مطلوب" in error_msg:
                log_test("Visa missing beneficiary_name → 400", True, f"Got expected error: {error_msg}")
            else:
                log_test("Visa missing beneficiary_name → 400", False, f"Wrong error: {error_msg}")
        else:
            log_test("Visa missing beneficiary_name → 400", False, f"Expected 400, got {resp.status_code}")
        
        # Test 2.2: Missing phone
        visa_data = {
            "beneficiary_name": "فاطمة أحمد",
            "supplier_id": supplier_id,
            "currency": "SAR",
            "cost": 500,
            "sale_price": 700,
            "service_type": "تأشيرة عمرة"
        }
        
        resp = session.post(f"{BASE_URL}/visas", json=visa_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "رقم الجوال مطلوب" in error_msg:
                log_test("Visa missing phone → 400", True, f"Got expected error: {error_msg}")
            else:
                log_test("Visa missing phone → 400", False, f"Wrong error: {error_msg}")
        else:
            log_test("Visa missing phone → 400", False, f"Expected 400, got {resp.status_code}")
        
        # Test 2.3: Negative cost
        visa_data = {
            "beneficiary_name": "فاطمة أحمد",
            "phone": "0501234567",
            "supplier_id": supplier_id,
            "currency": "SAR",
            "cost": -50,
            "sale_price": 700,
            "service_type": "تأشيرة عمرة"
        }
        
        resp = session.post(f"{BASE_URL}/visas", json=visa_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "القيمة السالبة غير مسموحة" in error_msg:
                log_test("Visa negative cost → 400", True, f"Got expected error")
                return True
            else:
                log_test("Visa negative cost → 400", False, f"Wrong error: {error_msg}")
                return False
        else:
            log_test("Visa negative cost → 400", False, f"Expected 400, got {resp.status_code}")
            return False
            
    except Exception as e:
        log_test("Phase 1 - Visa validations", False, str(e))
        return False

def test_phase1_account_duplicate_code():
    """Phase 1 Test 3: POST /api/accounts - duplicate code check"""
    print("\n=== PHASE 1 TEST 3: POST /api/accounts - Duplicate Code Check ===")
    
    try:
        # Test 3.1: Try to create account with code 1301 (existing parent code)
        account_data = {
            "code": "1301",
            "name_ar": "حساب تجريبي",
            "type": "asset"
        }
        
        resp = session.post(f"{BASE_URL}/accounts", json=account_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "1301" in error_msg and "مستخدم بالفعل في دليل الحسابات" in error_msg:
                log_test("Account duplicate code 1301 → 400", True, f"Got expected error: {error_msg}")
            else:
                log_test("Account duplicate code 1301 → 400", False, f"Wrong error: {error_msg}")
        else:
            log_test("Account duplicate code 1301 → 400", False, f"Expected 400, got {resp.status_code}")
        
        # Test 3.2: Try to create account with existing client code (13010001)
        account_data = {
            "code": "13010001",
            "name_ar": "حساب تجريبي 2",
            "type": "asset"
        }
        
        resp = session.post(f"{BASE_URL}/accounts", json=account_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "مستخدم لعميل بالفعل" in error_msg or "مستخدم" in error_msg:
                log_test("Account duplicate client code 13010001 → 400", True, f"Got expected error: {error_msg}")
            else:
                log_test("Account duplicate client code 13010001 → 400", False, f"Wrong error: {error_msg}")
        else:
            log_test("Account duplicate client code 13010001 → 400", False, f"Expected 400, got {resp.status_code}")
        
        # Test 3.3: Create account with new code 99999 (should succeed)
        account_data = {
            "code": "99999",
            "name_ar": "حساب اختبار مؤقت",
            "type": "asset"
        }
        
        resp = session.post(f"{BASE_URL}/accounts", json=account_data)
        if resp.status_code == 200:
            data = resp.json()
            account_id = data.get("id")
            log_test("Account new code 99999 → 200 OK", True, f"Created account: {account_id}")
            created_entities.append({"type": "account", "id": account_id})
            return True
        else:
            log_test("Account new code 99999 → 200 OK", False, f"Status {resp.status_code}: {resp.text}")
            return False
            
    except Exception as e:
        log_test("Phase 1 - Account duplicate code", False, str(e))
        return False

def test_phase1_unique_indexes():
    """Phase 1 Test 4: Verify unique indexes in MongoDB"""
    print("\n=== PHASE 1 TEST 4: Unique Indexes Verification ===")
    
    try:
        # Connect to MongoDB
        client = MongoClient("mongodb://localhost:27017")
        db = client["your_database_name"]
        
        # Test 4.1: Check accounts collection for unique_tenant_account_code index
        accounts_indexes = db.accounts.index_information()
        has_accounts_unique = "unique_tenant_account_code" in accounts_indexes and accounts_indexes["unique_tenant_account_code"].get("unique") == True
        
        if has_accounts_unique:
            log_test("Accounts collection has unique_tenant_account_code index", True, "Index found")
        else:
            log_test("Accounts collection has unique_tenant_account_code index", False, "Index not found or not unique")
        
        # Test 4.2: Check clients collection for unique_tenant_client_code index
        clients_indexes = db.clients.index_information()
        has_clients_unique = "unique_tenant_client_code" in clients_indexes and clients_indexes["unique_tenant_client_code"].get("unique") == True
        
        if has_clients_unique:
            log_test("Clients collection has unique_tenant_client_code index", True, "Index found")
        else:
            log_test("Clients collection has unique_tenant_client_code index", False, "Index not found or not unique")
        
        # Test 4.3: Check suppliers collection for unique_tenant_supplier_code index
        suppliers_indexes = db.suppliers.index_information()
        has_suppliers_unique = "unique_tenant_supplier_code" in suppliers_indexes and suppliers_indexes["unique_tenant_supplier_code"].get("unique") == True
        
        if has_suppliers_unique:
            log_test("Suppliers collection has unique_tenant_supplier_code index", True, "Index found")
        else:
            log_test("Suppliers collection has unique_tenant_supplier_code index", False, "Index not found or not unique")
        
        # Test 4.4: Check boxes collection for unique_tenant_box_code index
        boxes_indexes = db.boxes.index_information()
        has_boxes_unique = "unique_tenant_box_code" in boxes_indexes and boxes_indexes["unique_tenant_box_code"].get("unique") == True
        
        if has_boxes_unique:
            log_test("Boxes collection has unique_tenant_box_code index", True, "Index found")
        else:
            log_test("Boxes collection has unique_tenant_box_code index", False, "Index not found or not unique")
        
        client.close()
        
        return has_accounts_unique and has_clients_unique and has_suppliers_unique and has_boxes_unique
            
    except Exception as e:
        log_test("Phase 1 - Unique indexes", False, str(e))
        return False

def test_phase2_client_with_parent_code():
    """Phase 2 Test 5: POST /api/clients with parent_code=1301"""
    print("\n=== PHASE 2 TEST 5: POST /api/clients with parent_code ===")
    
    global initial_seq_1301
    
    try:
        # Get current sequence for 1301
        client = MongoClient("mongodb://localhost:27017")
        db = client["your_database_name"]
        account_1301 = db.accounts.find_one({"tenant_id": DEMO_TENANT["tenant_id"], "code": "1301"})
        initial_seq_1301 = account_1301.get("next_child_seq", 0) if account_1301 else 0
        client.close()
        
        # Create client with parent_code=1301
        client_data = {
            "name": "عميل اختبار Phase2",
            "phone": "777888999",
            "parent_code": "1301"
        }
        
        resp = session.post(f"{BASE_URL}/clients", json=client_data)
        if resp.status_code == 200:
            data = resp.json()
            account_code = data.get("account_code")
            account_parent_code = data.get("account_parent_code")
            
            # Verify code starts with 1301 and has 4 more digits
            if account_code and account_code.startswith("1301") and len(account_code) == 8:
                log_test("Client with parent_code=1301 → code format", True, f"Generated code: {account_code}")
            else:
                log_test("Client with parent_code=1301 → code format", False, f"Invalid code: {account_code}")
            
            # Verify account_parent_code is 1301
            if account_parent_code == "1301":
                log_test("Client account_parent_code=1301", True)
            else:
                log_test("Client account_parent_code=1301", False, f"Got: {account_parent_code}")
            
            created_entities.append({"type": "client", "id": data.get("id")})
            return True
        else:
            log_test("Client with parent_code=1301", False, f"Status {resp.status_code}: {resp.text}")
            return False
            
    except Exception as e:
        log_test("Phase 2 - Client with parent_code", False, str(e))
        return False

def test_phase2_supplier_with_parent_code():
    """Phase 2 Test 6: POST /api/suppliers with parent_code=2101"""
    print("\n=== PHASE 2 TEST 6: POST /api/suppliers with parent_code ===")
    
    global initial_seq_2101
    
    try:
        # Get current sequence for 2101
        client = MongoClient("mongodb://localhost:27017")
        db = client["your_database_name"]
        account_2101 = db.accounts.find_one({"tenant_id": DEMO_TENANT["tenant_id"], "code": "2101"})
        initial_seq_2101 = account_2101.get("next_child_seq", 0) if account_2101 else 0
        client.close()
        
        # Create supplier with parent_code=2101
        supplier_data = {
            "name": "مورد اختبار Phase2",
            "phone": "777888999",
            "parent_code": "2101"
        }
        
        resp = session.post(f"{BASE_URL}/suppliers", json=supplier_data)
        if resp.status_code == 200:
            data = resp.json()
            account_code = data.get("account_code")
            account_parent_code = data.get("account_parent_code")
            
            # Verify code starts with 2101 and has 4 more digits
            if account_code and account_code.startswith("2101") and len(account_code) == 8:
                log_test("Supplier with parent_code=2101 → code format", True, f"Generated code: {account_code}")
            else:
                log_test("Supplier with parent_code=2101 → code format", False, f"Invalid code: {account_code}")
            
            # Verify account_parent_code is 2101
            if account_parent_code == "2101":
                log_test("Supplier account_parent_code=2101", True)
            else:
                log_test("Supplier account_parent_code=2101", False, f"Got: {account_parent_code}")
            
            created_entities.append({"type": "supplier", "id": data.get("id")})
            return True
        else:
            log_test("Supplier with parent_code=2101", False, f"Status {resp.status_code}: {resp.text}")
            return False
            
    except Exception as e:
        log_test("Phase 2 - Supplier with parent_code", False, str(e))
        return False

def test_phase2_nonexistent_parent_code():
    """Phase 2 Test 7: POST /api/clients with non-existent parent_code"""
    print("\n=== PHASE 2 TEST 7: POST /api/clients with non-existent parent_code ===")
    
    try:
        # Create client with non-existent parent_code
        client_data = {
            "name": "Test",
            "phone": "777",
            "parent_code": "9999"
        }
        
        resp = session.post(f"{BASE_URL}/clients", json=client_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "الحساب الأب 9999 غير موجود في الدليل" in error_msg or "غير موجود" in error_msg:
                log_test("Client with non-existent parent_code → 400", True, f"Got expected error: {error_msg}")
                return True
            else:
                log_test("Client with non-existent parent_code → 400", False, f"Wrong error: {error_msg}")
                return False
        else:
            log_test("Client with non-existent parent_code → 400", False, f"Expected 400, got {resp.status_code}")
            return False
            
    except Exception as e:
        log_test("Phase 2 - Non-existent parent_code", False, str(e))
        return False

def test_phase2_visa_types():
    """Phase 2 Test 8: Verify VISA_TYPES includes 'تأشيرة زيارة'"""
    print("\n=== PHASE 2 TEST 8: VISA_TYPES verification ===")
    
    try:
        # This is a frontend-only verification, but we can check by looking at page.js
        # For backend testing, we'll just verify that we can create a visa with this type
        
        suppliers_resp = session.get(f"{BASE_URL}/suppliers")
        clients_resp = session.get(f"{BASE_URL}/clients")
        
        if suppliers_resp.status_code != 200 or not suppliers_resp.json():
            log_test("Get supplier for visa type test", False, "No suppliers available")
            return False
        
        if clients_resp.status_code != 200 or not clients_resp.json():
            log_test("Get client for visa type test", False, "No clients available")
            return False
        
        supplier_id = suppliers_resp.json()[0]["id"]
        client_id = clients_resp.json()[0]["id"]
        
        visa_data = {
            "beneficiary_name": "اختبار تأشيرة زيارة",
            "phone": "0501234567",
            "supplier_id": supplier_id,
            "client_id": client_id,
            "currency": "SAR",
            "cost": 500,
            "sale_price": 700,
            "service_type": "تأشيرة زيارة",
            "payment_method": "credit"
        }
        
        resp = session.post(f"{BASE_URL}/visas", json=visa_data)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("service_type") == "تأشيرة زيارة":
                log_test("VISA_TYPES includes 'تأشيرة زيارة'", True, "Backend accepts this type")
                created_entities.append({"type": "visa", "id": data.get("id")})
                return True
            else:
                log_test("VISA_TYPES includes 'تأشيرة زيارة'", False, f"Got type: {data.get('service_type')}")
                return False
        else:
            log_test("VISA_TYPES includes 'تأشيرة زيارة'", False, f"Status {resp.status_code}: {resp.text}")
            return False
            
    except Exception as e:
        log_test("Phase 2 - VISA_TYPES", False, str(e))
        return False

def test_regression_existing_endpoints():
    """Regression Test 9: Verify existing endpoints still work"""
    print("\n=== REGRESSION TEST 9: Existing Endpoints ===")
    
    try:
        # Test 9.1: GET /api/tickets
        resp = session.get(f"{BASE_URL}/tickets")
        if resp.status_code == 200:
            data = resp.json()
            log_test("GET /api/tickets", True, f"Got {len(data)} tickets")
        else:
            log_test("GET /api/tickets", False, f"Status {resp.status_code}")
        
        # Test 9.2: GET /api/visas
        resp = session.get(f"{BASE_URL}/visas")
        if resp.status_code == 200:
            data = resp.json()
            log_test("GET /api/visas", True, f"Got {len(data)} visas")
        else:
            log_test("GET /api/visas", False, f"Status {resp.status_code}")
        
        # Test 9.3: GET /api/clients (should have 38+ clients with account_code)
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            data = resp.json()
            clients_with_code = [c for c in data if c.get("account_code")]
            if len(data) >= 38:
                log_test("GET /api/clients (38+ clients)", True, f"Got {len(data)} clients, {len(clients_with_code)} with account_code")
            else:
                log_test("GET /api/clients (38+ clients)", False, f"Got only {len(data)} clients")
        else:
            log_test("GET /api/clients", False, f"Status {resp.status_code}")
        
        # Test 9.4: GET /api/suppliers (should have 35+ suppliers with account_code)
        resp = session.get(f"{BASE_URL}/suppliers")
        if resp.status_code == 200:
            data = resp.json()
            suppliers_with_code = [s for s in data if s.get("account_code")]
            if len(data) >= 35:
                log_test("GET /api/suppliers (35+ suppliers)", True, f"Got {len(data)} suppliers, {len(suppliers_with_code)} with account_code")
            else:
                log_test("GET /api/suppliers (35+ suppliers)", False, f"Got only {len(data)} suppliers")
        else:
            log_test("GET /api/suppliers", False, f"Status {resp.status_code}")
        
        # Test 9.5: GET /api/accounts/tree
        resp = session.get(f"{BASE_URL}/accounts/tree")
        if resp.status_code == 200:
            data = resp.json()
            log_test("GET /api/accounts/tree", True, f"Got hierarchical structure")
        else:
            log_test("GET /api/accounts/tree", False, f"Status {resp.status_code}")
        
        # Test 9.6: GET /api/accounts/search?q=demo
        resp = session.get(f"{BASE_URL}/accounts/search?q=demo")
        if resp.status_code == 200:
            data = resp.json()
            log_test("GET /api/accounts/search?q=demo", True, f"Got {len(data)} results")
        else:
            log_test("GET /api/accounts/search?q=demo", False, f"Status {resp.status_code}")
        
        # Test 9.7: POST /api/tickets with all valid fields
        suppliers_resp = session.get(f"{BASE_URL}/suppliers")
        boxes_resp = session.get(f"{BASE_URL}/boxes")
        
        if suppliers_resp.status_code == 200 and boxes_resp.status_code == 200:
            suppliers = suppliers_resp.json()
            boxes = boxes_resp.json()
            
            if suppliers and boxes:
                ticket_data = {
                    "passenger_name": "مسافر اختبار Regression",
                    "travel_date": "2025-12-15",
                    "phone": "0501234567",
                    "supplier_id": suppliers[0]["id"],
                    "currency": "SAR",
                    "cost": 800,
                    "sale_price": 1000,
                    "payment_method": "cash",
                    "box_id": boxes[0]["id"]
                }
                
                resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
                if resp.status_code == 200:
                    data = resp.json()
                    ticket_id = data.get("id")
                    log_test("POST /api/tickets with valid fields → 200 OK", True, f"Created ticket: {ticket_id}")
                    created_entities.append({"type": "ticket", "id": ticket_id})
                else:
                    log_test("POST /api/tickets with valid fields → 200 OK", False, f"Status {resp.status_code}: {resp.text}")
        
        # Test 9.8: POST /api/journal-entries with valid balanced lines
        clients_resp = session.get(f"{BASE_URL}/clients")
        if clients_resp.status_code == 200 and boxes_resp.status_code == 200:
            clients = clients_resp.json()
            boxes = boxes_resp.json()
            
            if clients and boxes:
                je_data = {
                    "currency": "SAR",
                    "date": datetime.now().isoformat(),
                    "description": "قيد اختبار Regression",
                    "lines": [
                        {"account_code": clients[0].get("account_code", "13010001"), "account_name": "Test Client", "debit": 500, "credit": 0},
                        {"account_code": boxes[0].get("account_code", "11010001"), "account_name": "Test Box", "debit": 0, "credit": 500}
                    ]
                }
                
                resp = session.post(f"{BASE_URL}/journal-entries", json=je_data)
                if resp.status_code == 200:
                    data = resp.json()
                    je_id = data.get("id")
                    log_test("POST /api/journal-entries with valid lines → 200 OK", True, f"Created JE: {je_id}")
                    created_entities.append({"type": "journal_entry", "id": je_id})
                    return True
                else:
                    log_test("POST /api/journal-entries with valid lines → 200 OK", False, f"Status {resp.status_code}: {resp.text}")
                    return False
        
        return True
        
    except Exception as e:
        log_test("Regression tests", False, str(e))
        return False

def cleanup_created_entities():
    """Cleanup entities created during testing"""
    print("\n=== CLEANUP ===")
    
    for entity in created_entities:
        try:
            entity_type = entity["type"]
            entity_id = entity["id"]
            
            if entity_type == "client":
                resp = session.delete(f"{BASE_URL}/clients/{entity_id}")
                if resp.status_code == 200:
                    print(f"✅ Deleted client {entity_id}")
                else:
                    print(f"⚠️ Failed to delete client {entity_id}: {resp.status_code}")
            
            elif entity_type == "supplier":
                resp = session.delete(f"{BASE_URL}/suppliers/{entity_id}")
                if resp.status_code == 200:
                    print(f"✅ Deleted supplier {entity_id}")
                else:
                    print(f"⚠️ Failed to delete supplier {entity_id}: {resp.status_code}")
            
            elif entity_type == "account":
                resp = session.delete(f"{BASE_URL}/accounts/{entity_id}")
                if resp.status_code == 200:
                    print(f"✅ Deleted account {entity_id}")
                else:
                    print(f"⚠️ Failed to delete account {entity_id}: {resp.status_code}")
            
            elif entity_type == "ticket":
                resp = session.delete(f"{BASE_URL}/tickets/{entity_id}")
                if resp.status_code == 200:
                    print(f"✅ Deleted ticket {entity_id}")
                else:
                    print(f"⚠️ Failed to delete ticket {entity_id}: {resp.status_code}")
            
            elif entity_type == "visa":
                resp = session.delete(f"{BASE_URL}/visas/{entity_id}")
                if resp.status_code == 200:
                    print(f"✅ Deleted visa {entity_id}")
                else:
                    print(f"⚠️ Failed to delete visa {entity_id}: {resp.status_code}")
            
            elif entity_type == "journal_entry":
                resp = session.delete(f"{BASE_URL}/journal-entries/{entity_id}")
                if resp.status_code == 200:
                    print(f"✅ Deleted journal entry {entity_id}")
                else:
                    print(f"⚠️ Failed to delete journal entry {entity_id}: {resp.status_code}")
        
        except Exception as e:
            print(f"⚠️ Error cleaning up {entity.get('type')} {entity.get('id')}: {e}")
    
    # Reset next_child_seq for 1301 and 2101 if needed
    try:
        if initial_seq_1301 is not None or initial_seq_2101 is not None:
            client = MongoClient("mongodb://localhost:27017")
            db = client["your_database_name"]
            
            if initial_seq_1301 is not None:
                db.accounts.update_one(
                    {"tenant_id": DEMO_TENANT["tenant_id"], "code": "1301"},
                    {"$set": {"next_child_seq": initial_seq_1301}}
                )
                print(f"✅ Reset 1301 next_child_seq to {initial_seq_1301}")
            
            if initial_seq_2101 is not None:
                db.accounts.update_one(
                    {"tenant_id": DEMO_TENANT["tenant_id"], "code": "2101"},
                    {"$set": {"next_child_seq": initial_seq_2101}}
                )
                print(f"✅ Reset 2101 next_child_seq to {initial_seq_2101}")
            
            client.close()
    except Exception as e:
        print(f"⚠️ Error resetting sequences: {e}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for t in test_results if t["passed"])
    failed = sum(1 for t in test_results if not t["passed"])
    total = len(test_results)
    
    print(f"\nTotal Tests: {total}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for t in test_results:
            if not t["passed"]:
                print(f"  - {t['name']}: {t['message']}")
    
    print("\n" + "="*80)
    
    return failed == 0

def main():
    """Main test runner"""
    print("="*80)
    print("v3.10.2 + v3.10.3 Backend Test Suite")
    print("Phase 1: Strict Validations + Phase 2: Quick-Add with parent_code")
    print("="*80)
    
    # Login to demo tenant
    if not login(DEMO_TENANT["email"], DEMO_TENANT["password"]):
        print("❌ Failed to login. Exiting.")
        sys.exit(1)
    
    # Run Phase 1 tests
    print("\n" + "="*80)
    print("PHASE 1: STRICT VALIDATIONS")
    print("="*80)
    test_phase1_ticket_missing_fields()
    test_phase1_visa_missing_fields()
    test_phase1_account_duplicate_code()
    test_phase1_unique_indexes()
    
    # Run Phase 2 tests
    print("\n" + "="*80)
    print("PHASE 2: QUICK-ADD WITH PARENT_CODE")
    print("="*80)
    test_phase2_client_with_parent_code()
    test_phase2_supplier_with_parent_code()
    test_phase2_nonexistent_parent_code()
    test_phase2_visa_types()
    
    # Run Regression tests
    print("\n" + "="*80)
    print("REGRESSION TESTS")
    print("="*80)
    test_regression_existing_endpoints()
    
    # Cleanup
    cleanup_created_entities()
    
    # Print summary
    success = print_summary()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
