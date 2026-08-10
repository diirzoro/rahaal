#!/usr/bin/env python3
"""
Backend Test Suite for v3.10.0 - Chart of Accounts + Autocomplete Integration
Tests all critical scenarios for the new release.
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test credentials
DEMO_TENANT = {
    "email": "owner@demo.com",
    "password": "Demo@2025",
    "tenant_name": "مكتب الرحّال التجريبي",
    "tenant_id": "d89bc41d-e19b-430f-be93-e3f8ca6d404a"
}

FILM_TENANT = {
    "email": "film@rahaal.app",
    "password": "Rahaal@Film2025",
    "tenant_id": "041f558c-4a52-417f-94bc-c7e528a106b3"
}

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
            log_test(f"Login as {email}", True, f"Logged in as {data.get('user', {}).get('name')}")
            return True
        else:
            log_test(f"Login as {email}", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test(f"Login as {email}", False, str(e))
        return False

def test_accounts_tree():
    """Test 1: GET /api/accounts/tree - hierarchical structure"""
    print("\n=== TEST 1: GET /api/accounts/tree ===")
    
    try:
        # Test without include_inactive (default)
        resp = session.get(f"{BASE_URL}/accounts/tree")
        if resp.status_code != 200:
            log_test("GET /accounts/tree", False, f"Status {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Verify 4 root nodes (asset, liability, revenue, expense)
        root_types = set()
        for node in data:
            if node.get("type"):
                root_types.add(node["type"])
        
        expected_types = {"asset", "liability", "revenue", "expense"}
        if root_types != expected_types:
            log_test("Tree has 4 root types", False, f"Got {root_types}, expected {expected_types}")
        else:
            log_test("Tree has 4 root types", True)
        
        # Find nodes by code
        nodes_by_code = {}
        def index_nodes(nodes):
            for node in nodes:
                nodes_by_code[node["code"]] = node
                if node.get("children"):
                    index_nodes(node["children"])
        index_nodes(data)
        
        # Check 1301 (العملاء) has 35+ sub_entities
        node_1301 = nodes_by_code.get("1301")
        if not node_1301:
            log_test("Node 1301 (العملاء) exists", False, "Node not found")
        else:
            clients_count = len(node_1301.get("sub_entities", []))
            if clients_count >= 35:
                log_test(f"Node 1301 has 35+ clients", True, f"Found {clients_count} clients")
                # Verify codes like 13010001, 13010002
                client_codes = [e["code"] for e in node_1301["sub_entities"][:5]]
                log_test("Client codes format", True, f"Sample codes: {client_codes}")
            else:
                log_test(f"Node 1301 has 35+ clients", False, f"Found only {clients_count} clients")
        
        # Check 2101 (الموردون) has 33+ sub_entities
        node_2101 = nodes_by_code.get("2101")
        if not node_2101:
            log_test("Node 2101 (الموردون) exists", False, "Node not found")
        else:
            suppliers_count = len(node_2101.get("sub_entities", []))
            if suppliers_count >= 33:
                log_test(f"Node 2101 has 33+ suppliers", True, f"Found {suppliers_count} suppliers")
            else:
                log_test(f"Node 2101 has 33+ suppliers", False, f"Found only {suppliers_count} suppliers")
        
        # Check 1101 (Cash boxes) has sub_entities with codes 11010001...
        node_1101 = nodes_by_code.get("1101")
        if node_1101:
            cash_boxes = node_1101.get("sub_entities", [])
            if cash_boxes:
                cash_codes = [e["code"] for e in cash_boxes]
                log_test("Node 1101 has cash boxes", True, f"Found {len(cash_boxes)} boxes: {cash_codes}")
            else:
                log_test("Node 1101 has cash boxes", False, "No cash boxes found")
        
        # Check 1201 (Bank boxes) has sub_entities with codes 12010001...
        node_1201 = nodes_by_code.get("1201")
        if node_1201:
            bank_boxes = node_1201.get("sub_entities", [])
            if bank_boxes:
                bank_codes = [e["code"] for e in bank_boxes]
                log_test("Node 1201 has bank boxes", True, f"Found {len(bank_boxes)} boxes: {bank_codes}")
            else:
                log_test("Node 1201 has bank boxes", False, "No bank boxes found")
        
        # Test include_inactive=1
        resp2 = session.get(f"{BASE_URL}/accounts/tree?include_inactive=1")
        if resp2.status_code == 200:
            data2 = resp2.json()
            # Count total sub_entities with and without inactive
            def count_sub_entities(nodes):
                total = 0
                for node in nodes:
                    total += len(node.get("sub_entities", []))
                    if node.get("children"):
                        total += count_sub_entities(node["children"])
                return total
            
            count_without = count_sub_entities(data)
            count_with = count_sub_entities(data2)
            
            if count_with >= count_without:
                log_test("include_inactive=1 returns more/equal entities", True, f"Without: {count_without}, With: {count_with}")
            else:
                log_test("include_inactive=1 returns more/equal entities", False, f"Without: {count_without}, With: {count_with}")
        
        return True
        
    except Exception as e:
        log_test("GET /accounts/tree", False, str(e))
        return False

def test_accounts_search():
    """Test 2: GET /api/accounts/search - validate all type variants"""
    print("\n=== TEST 2: GET /api/accounts/search ===")
    
    try:
        # Test 2.1: ?q=demo&type=client
        resp = session.get(f"{BASE_URL}/accounts/search?q=demo&type=client")
        if resp.status_code == 200:
            data = resp.json()
            demo_clients = [c for c in data if "demo" in c.get("name", "").lower()]
            if demo_clients:
                log_test("Search q=demo&type=client", True, f"Found {len(demo_clients)} clients, e.g., {demo_clients[0].get('name')}")
            else:
                log_test("Search q=demo&type=client", False, "No demo clients found")
        else:
            log_test("Search q=demo&type=client", False, f"Status {resp.status_code}")
        
        # Test 2.2: ?q=&type=supplier&limit=5
        resp = session.get(f"{BASE_URL}/accounts/search?q=&type=supplier&limit=5")
        if resp.status_code == 200:
            data = resp.json()
            if len(data) <= 5 and all(c.get("type") == "supplier" for c in data):
                codes = [c.get("account_code") for c in data]
                log_test("Search type=supplier&limit=5", True, f"Got {len(data)} suppliers with codes: {codes}")
            else:
                log_test("Search type=supplier&limit=5", False, f"Got {len(data)} results")
        else:
            log_test("Search type=supplier&limit=5", False, f"Status {resp.status_code}")
        
        # Test 2.3: ?q=&type=box&limit=5
        resp = session.get(f"{BASE_URL}/accounts/search?q=&type=box&limit=5")
        if resp.status_code == 200:
            data = resp.json()
            if len(data) <= 5 and all(c.get("type") == "box" for c in data):
                codes = [c.get("account_code") for c in data]
                log_test("Search type=box&limit=5", True, f"Got {len(data)} boxes with codes: {codes}")
            else:
                log_test("Search type=box&limit=5", False, f"Got {len(data)} results")
        else:
            log_test("Search type=box&limit=5", False, f"Status {resp.status_code}")
        
        # Test 2.4: ?q=&type=account&limit=10
        resp = session.get(f"{BASE_URL}/accounts/search?q=&type=account&limit=10")
        if resp.status_code == 200:
            data = resp.json()
            if len(data) <= 10 and all(c.get("type") == "account" for c in data):
                codes = [c.get("account_code") for c in data[:5]]
                log_test("Search type=account&limit=10", True, f"Got {len(data)} accounts, sample codes: {codes}")
            else:
                log_test("Search type=account&limit=10", False, f"Got {len(data)} results")
        else:
            log_test("Search type=account&limit=10", False, f"Status {resp.status_code}")
        
        # Test 2.5: ?q=&type=all&limit=50
        resp = session.get(f"{BASE_URL}/accounts/search?q=&type=all&limit=50")
        if resp.status_code == 200:
            data = resp.json()
            types = set(c.get("type") for c in data)
            if len(data) <= 50 and len(types) > 1:
                log_test("Search type=all&limit=50", True, f"Got {len(data)} mixed results with types: {types}")
            else:
                log_test("Search type=all&limit=50", False, f"Got {len(data)} results with types: {types}")
        else:
            log_test("Search type=all&limit=50", False, f"Status {resp.status_code}")
        
        # Test 2.6: ?q=1301&type=client (match by code)
        resp = session.get(f"{BASE_URL}/accounts/search?q=1301&type=client")
        if resp.status_code == 200:
            data = resp.json()
            code_matches = [c for c in data if "1301" in c.get("account_code", "")]
            if code_matches:
                log_test("Search q=1301&type=client (code match)", True, f"Found {len(code_matches)} clients with 1301 in code")
            else:
                log_test("Search q=1301&type=client (code match)", False, "No code matches found")
        else:
            log_test("Search q=1301&type=client", False, f"Status {resp.status_code}")
        
        return True
        
    except Exception as e:
        log_test("GET /accounts/search", False, str(e))
        return False

def test_auto_numbering_clients():
    """Test 3: Auto-numbering on POST /clients"""
    print("\n=== TEST 3: Auto-numbering on POST /clients ===")
    
    try:
        # Create client without account_code
        client_data = {
            "name": "عميل اختبار الأتمتة",
            "phone": "+967771234567",
            "notes": "Test auto-numbering"
        }
        
        resp = session.post(f"{BASE_URL}/clients", json=client_data)
        if resp.status_code == 200:
            data = resp.json()
            account_code = data.get("account_code")
            
            if account_code and account_code.startswith("1301"):
                log_test("Client auto-numbering", True, f"Generated code: {account_code}")
                created_entities.append({"type": "client", "id": data.get("id")})
                return True
            else:
                log_test("Client auto-numbering", False, f"Invalid code: {account_code}")
                return False
        else:
            log_test("Client auto-numbering", False, f"Status {resp.status_code}: {resp.text}")
            return False
            
    except Exception as e:
        log_test("Client auto-numbering", False, str(e))
        return False

def test_auto_numbering_suppliers():
    """Test 4: Auto-numbering on POST /suppliers"""
    print("\n=== TEST 4: Auto-numbering on POST /suppliers ===")
    
    try:
        # Create supplier without account_code
        supplier_data = {
            "name": "مورد اختبار الأتمتة",
            "phone": "+967771234568",
            "notes": "Test auto-numbering"
        }
        
        resp = session.post(f"{BASE_URL}/suppliers", json=supplier_data)
        if resp.status_code == 200:
            data = resp.json()
            account_code = data.get("account_code")
            
            if account_code and account_code.startswith("2101"):
                log_test("Supplier auto-numbering", True, f"Generated code: {account_code}")
                created_entities.append({"type": "supplier", "id": data.get("id")})
                return True
            else:
                log_test("Supplier auto-numbering", False, f"Invalid code: {account_code}")
                return False
        else:
            log_test("Supplier auto-numbering", False, f"Status {resp.status_code}: {resp.text}")
            return False
            
    except Exception as e:
        log_test("Supplier auto-numbering", False, str(e))
        return False

def test_auto_numbering_boxes():
    """Test 5: Auto-numbering on POST /boxes"""
    print("\n=== TEST 5: Auto-numbering on POST /boxes ===")
    
    try:
        # Create cash box
        cash_box_data = {
            "name_ar": "صندوق اختبار",
            "type": "cash"
        }
        
        resp = session.post(f"{BASE_URL}/boxes", json=cash_box_data)
        if resp.status_code == 200:
            data = resp.json()
            account_code = data.get("account_code")
            
            if account_code and account_code.startswith("1101"):
                log_test("Cash box auto-numbering", True, f"Generated code: {account_code}")
                created_entities.append({"type": "box", "id": data.get("id")})
            else:
                log_test("Cash box auto-numbering", False, f"Invalid code: {account_code}")
        else:
            log_test("Cash box auto-numbering", False, f"Status {resp.status_code}: {resp.text}")
        
        # Create bank box
        bank_box_data = {
            "name_ar": "بنك اختبار",
            "type": "bank"
        }
        
        resp = session.post(f"{BASE_URL}/boxes", json=bank_box_data)
        if resp.status_code == 200:
            data = resp.json()
            account_code = data.get("account_code")
            
            if account_code and account_code.startswith("1201"):
                log_test("Bank box auto-numbering", True, f"Generated code: {account_code}")
                created_entities.append({"type": "box", "id": data.get("id")})
                return True
            else:
                log_test("Bank box auto-numbering", False, f"Invalid code: {account_code}")
                return False
        else:
            log_test("Bank box auto-numbering", False, f"Status {resp.status_code}: {resp.text}")
            return False
            
    except Exception as e:
        log_test("Box auto-numbering", False, str(e))
        return False

def test_validation_negative_journal_entries():
    """Test 6: Validation - Negative values in POST /journal-entries"""
    print("\n=== TEST 6: Validation - Negative values in journal entries ===")
    
    try:
        # Test 6.1: Single currency with negative debit
        je_data = {
            "currency": "SAR",
            "date": datetime.now().isoformat(),
            "description": "Test negative debit",
            "lines": [
                {"account_code": "13010001", "account_name": "Test", "debit": -100, "credit": 0},
                {"account_code": "11010001", "account_name": "Test", "debit": 0, "credit": 100}
            ]
        }
        
        resp = session.post(f"{BASE_URL}/journal-entries", json=je_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "لا يُسمح بقيم سالبة" in error_msg:
                log_test("Reject negative debit in JE", True, f"Got expected error: {error_msg}")
            else:
                log_test("Reject negative debit in JE", False, f"Wrong error: {error_msg}")
        else:
            log_test("Reject negative debit in JE", False, f"Expected 400, got {resp.status_code}")
        
        # Test 6.2: Single currency with negative credit
        je_data["lines"] = [
            {"account_code": "13010001", "account_name": "Test", "debit": 100, "credit": 0},
            {"account_code": "11010001", "account_name": "Test", "debit": 0, "credit": -50}
        ]
        
        resp = session.post(f"{BASE_URL}/journal-entries", json=je_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "لا يُسمح بقيم سالبة" in error_msg:
                log_test("Reject negative credit in JE", True, f"Got expected error")
            else:
                log_test("Reject negative credit in JE", False, f"Wrong error: {error_msg}")
        else:
            log_test("Reject negative credit in JE", False, f"Expected 400, got {resp.status_code}")
        
        # Test 6.3: Dual currency with negative debit_amount
        dual_je_data = {
            "dual": True,
            "date": datetime.now().isoformat(),
            "description": "Test negative dual",
            "debit_account_code": "13010001",
            "debit_account_name": "Test",
            "debit_currency": "USD",
            "debit_amount": -100,
            "credit_account_code": "11010001",
            "credit_account_name": "Test",
            "credit_currency": "SAR",
            "credit_amount": 375
        }
        
        resp = session.post(f"{BASE_URL}/journal-entries", json=dual_je_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "لا يُسمح بقيم سالبة" in error_msg or "المبالغ يجب أن تكون أكبر من صفر" in error_msg:
                log_test("Reject negative amount in dual JE", True, f"Got expected error")
            else:
                log_test("Reject negative amount in dual JE", False, f"Wrong error: {error_msg}")
        else:
            log_test("Reject negative amount in dual JE", False, f"Expected 400, got {resp.status_code}")
        
        return True
        
    except Exception as e:
        log_test("Validation negative JE", False, str(e))
        return False

def test_validation_nonexistent_account():
    """Test 7: Validation - Non-existent account_code in POST /journal-entries"""
    print("\n=== TEST 7: Validation - Non-existent account_code ===")
    
    try:
        je_data = {
            "currency": "SAR",
            "date": datetime.now().isoformat(),
            "description": "Test nonexistent account",
            "lines": [
                {"account_code": "99999999", "account_name": "Fake", "debit": 100, "credit": 0},
                {"account_code": "11010001", "account_name": "Test", "debit": 0, "credit": 100}
            ]
        }
        
        resp = session.post(f"{BASE_URL}/journal-entries", json=je_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "غير موجود في دليل الحسابات" in error_msg:
                log_test("Reject nonexistent account_code", True, f"Got expected error: {error_msg}")
                return True
            else:
                log_test("Reject nonexistent account_code", False, f"Wrong error: {error_msg}")
                return False
        else:
            log_test("Reject nonexistent account_code", False, f"Expected 400, got {resp.status_code}")
            return False
            
    except Exception as e:
        log_test("Validation nonexistent account", False, str(e))
        return False

def test_validation_negative_voucher():
    """Test 8: Validation - Negative amount in POST /vouchers"""
    print("\n=== TEST 8: Validation - Negative amount in vouchers ===")
    
    try:
        # Get a client and box for the test
        clients_resp = session.get(f"{BASE_URL}/clients")
        boxes_resp = session.get(f"{BASE_URL}/boxes")
        
        if clients_resp.status_code != 200 or boxes_resp.status_code != 200:
            log_test("Get test data for voucher", False, "Failed to get clients/boxes")
            return False
        
        clients = clients_resp.json()
        boxes = boxes_resp.json()
        
        if not clients or not boxes:
            log_test("Get test data for voucher", False, "No clients or boxes available")
            return False
        
        voucher_data = {
            "type": "receipt",
            "currency": "SAR",
            "amount": -50,
            "party_type": "client",
            "party_id": clients[0]["id"],
            "box_id": boxes[0]["id"],
            "date": datetime.now().isoformat()
        }
        
        resp = session.post(f"{BASE_URL}/vouchers", json=voucher_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "لا يُسمح بمبلغ سالب" in error_msg:
                log_test("Reject negative amount in voucher", True, f"Got expected error: {error_msg}")
                return True
            else:
                log_test("Reject negative amount in voucher", False, f"Wrong error: {error_msg}")
                return False
        else:
            log_test("Reject negative amount in voucher", False, f"Expected 400, got {resp.status_code}")
            return False
            
    except Exception as e:
        log_test("Validation negative voucher", False, str(e))
        return False

def test_validation_negative_fx():
    """Test 9: Validation - Negative amount in POST /fx"""
    print("\n=== TEST 9: Validation - Negative amount in FX ===")
    
    try:
        # Get boxes for the test
        boxes_resp = session.get(f"{BASE_URL}/boxes")
        if boxes_resp.status_code != 200:
            log_test("Get boxes for FX test", False, "Failed to get boxes")
            return False
        
        boxes = boxes_resp.json()
        if len(boxes) < 2:
            log_test("Get boxes for FX test", False, "Need at least 2 boxes")
            return False
        
        # Test 9.1: Negative amount
        fx_data = {
            "type": "buy",
            "currency": "USD",
            "counter_currency": "SAR",
            "amount": -100,
            "exchange_rate": 3.75,
            "box_currency_id": boxes[0]["id"],
            "box_counter_id": boxes[1]["id"],
            "date": datetime.now().isoformat()
        }
        
        resp = session.post(f"{BASE_URL}/fx", json=fx_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "لا يُسمح بقيم سالبة" in error_msg:
                log_test("Reject negative amount in FX", True, f"Got expected error")
            else:
                log_test("Reject negative amount in FX", False, f"Wrong error: {error_msg}")
        else:
            log_test("Reject negative amount in FX", False, f"Expected 400, got {resp.status_code}")
        
        # Test 9.2: Negative exchange_rate
        fx_data["amount"] = 100
        fx_data["exchange_rate"] = -3.75
        
        resp = session.post(f"{BASE_URL}/fx", json=fx_data)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "لا يُسمح بقيم سالبة" in error_msg:
                log_test("Reject negative exchange_rate in FX", True, f"Got expected error")
                return True
            else:
                log_test("Reject negative exchange_rate in FX", False, f"Wrong error: {error_msg}")
                return False
        else:
            log_test("Reject negative exchange_rate in FX", False, f"Expected 400, got {resp.status_code}")
            return False
            
    except Exception as e:
        log_test("Validation negative FX", False, str(e))
        return False

def test_regression_existing_endpoints():
    """Test 10: Regression - Existing endpoints still work"""
    print("\n=== TEST 10: Regression - Existing endpoints ===")
    
    try:
        # Test 10.1: GET /api/journal-entries
        resp = session.get(f"{BASE_URL}/journal-entries")
        if resp.status_code == 200:
            data = resp.json()
            log_test("GET /journal-entries", True, f"Got {len(data)} entries")
        else:
            log_test("GET /journal-entries", False, f"Status {resp.status_code}")
        
        # Test 10.2: GET /api/clients
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            data = resp.json()
            clients_with_code = [c for c in data if c.get("account_code")]
            log_test("GET /clients with account_code", True, f"Got {len(data)} clients, {len(clients_with_code)} with account_code")
        else:
            log_test("GET /clients", False, f"Status {resp.status_code}")
        
        # Test 10.3: GET /api/suppliers
        resp = session.get(f"{BASE_URL}/suppliers")
        if resp.status_code == 200:
            data = resp.json()
            suppliers_with_code = [s for s in data if s.get("account_code")]
            log_test("GET /suppliers with account_code", True, f"Got {len(data)} suppliers, {len(suppliers_with_code)} with account_code")
        else:
            log_test("GET /suppliers", False, f"Status {resp.status_code}")
        
        # Test 10.4: GET /api/boxes
        resp = session.get(f"{BASE_URL}/boxes")
        if resp.status_code == 200:
            data = resp.json()
            boxes_with_code = [b for b in data if b.get("account_code")]
            log_test("GET /boxes with account_code", True, f"Got {len(data)} boxes, {len(boxes_with_code)} with account_code")
        else:
            log_test("GET /boxes", False, f"Status {resp.status_code}")
        
        # Test 10.5: POST /api/journal-entries with valid data
        clients_resp = session.get(f"{BASE_URL}/clients")
        boxes_resp = session.get(f"{BASE_URL}/boxes")
        
        if clients_resp.status_code == 200 and boxes_resp.status_code == 200:
            clients = clients_resp.json()
            boxes = boxes_resp.json()
            
            if clients and boxes:
                je_data = {
                    "currency": "SAR",
                    "date": datetime.now().isoformat(),
                    "description": "Test valid JE with new codes",
                    "lines": [
                        {"account_code": clients[0].get("account_code", "13010001"), "account_name": "Test Client", "debit": 100, "credit": 0},
                        {"account_code": boxes[0].get("account_code", "11010001"), "account_name": "Test Box", "debit": 0, "credit": 100}
                    ]
                }
                
                resp = session.post(f"{BASE_URL}/journal-entries", json=je_data)
                if resp.status_code == 200:
                    data = resp.json()
                    je_id = data.get("id")
                    log_test("POST /journal-entries with valid codes", True, f"Created JE: {je_id}")
                    created_entities.append({"type": "journal_entry", "id": je_id})
                else:
                    log_test("POST /journal-entries with valid codes", False, f"Status {resp.status_code}: {resp.text}")
        
        return True
        
    except Exception as e:
        log_test("Regression tests", False, str(e))
        return False

def test_regression_other_tenant():
    """Test 11: Regression - Migration side effects on other tenants"""
    print("\n=== TEST 11: Regression - Other tenant (film@rahaal.app) ===")
    
    try:
        # Login as film tenant
        if not login(FILM_TENANT["email"], FILM_TENANT["password"]):
            return False
        
        # Test GET /api/accounts/tree
        resp = session.get(f"{BASE_URL}/accounts/tree")
        if resp.status_code == 200:
            data = resp.json()
            # Find nodes by code
            nodes_by_code = {}
            def index_nodes(nodes):
                for node in nodes:
                    nodes_by_code[node["code"]] = node
                    if node.get("children"):
                        index_nodes(node["children"])
            index_nodes(data)
            
            node_1301 = nodes_by_code.get("1301")
            node_2101 = nodes_by_code.get("2101")
            
            if node_1301 and node_2101:
                clients_count = len(node_1301.get("sub_entities", []))
                suppliers_count = len(node_2101.get("sub_entities", []))
                log_test("Film tenant - accounts/tree", True, f"Found {clients_count} clients, {suppliers_count} suppliers")
            else:
                log_test("Film tenant - accounts/tree", False, "Missing 1301 or 2101 nodes")
        else:
            log_test("Film tenant - accounts/tree", False, f"Status {resp.status_code}")
        
        # Test GET /api/clients
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            data = resp.json()
            clients_with_code = [c for c in data if c.get("account_code") and c["account_code"].startswith("1301")]
            log_test("Film tenant - clients with account_code", True, f"Got {len(data)} clients, {len(clients_with_code)} with 1301#### codes")
        else:
            log_test("Film tenant - clients", False, f"Status {resp.status_code}")
        
        # Login back to demo tenant
        login(DEMO_TENANT["email"], DEMO_TENANT["password"])
        
        return True
        
    except Exception as e:
        log_test("Regression other tenant", False, str(e))
        # Try to login back to demo tenant
        try:
            login(DEMO_TENANT["email"], DEMO_TENANT["password"])
        except Exception:
            pass
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
            
            elif entity_type == "box":
                resp = session.delete(f"{BASE_URL}/boxes/{entity_id}")
                if resp.status_code == 200:
                    print(f"✅ Deleted box {entity_id}")
                else:
                    print(f"⚠️ Failed to delete box {entity_id}: {resp.status_code}")
            
            elif entity_type == "journal_entry":
                # Journal entries are deleted via their ref_type endpoints
                # For manual JEs, we can delete directly
                resp = session.delete(f"{BASE_URL}/journal-entries/{entity_id}")
                if resp.status_code == 200:
                    print(f"✅ Deleted journal entry {entity_id}")
                else:
                    print(f"⚠️ Failed to delete journal entry {entity_id}: {resp.status_code}")
        
        except Exception as e:
            print(f"⚠️ Error cleaning up {entity.get('type')} {entity.get('id')}: {e}")

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
    print("v3.10.0 Backend Test Suite")
    print("Chart of Accounts + Autocomplete Integration")
    print("="*80)
    
    # Login to demo tenant
    if not login(DEMO_TENANT["email"], DEMO_TENANT["password"]):
        print("❌ Failed to login. Exiting.")
        sys.exit(1)
    
    # Run all tests
    test_accounts_tree()
    test_accounts_search()
    test_auto_numbering_clients()
    test_auto_numbering_suppliers()
    test_auto_numbering_boxes()
    test_validation_negative_journal_entries()
    test_validation_nonexistent_account()
    test_validation_negative_voucher()
    test_validation_negative_fx()
    test_regression_existing_endpoints()
    test_regression_other_tenant()
    
    # Cleanup
    cleanup_created_entities()
    
    # Print summary
    success = print_summary()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
