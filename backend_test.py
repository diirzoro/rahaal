#!/usr/bin/env python3
"""
v3.9.3 Backend Testing — Parent Account (شجرة الحسابات) Linkage
Tests parent_code field on clients, suppliers, and boxes
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
CREDENTIALS = {
    "email": "owner@demo.com",
    "password": "Demo@2025"
}

# Test results tracking
tests_passed = 0
tests_failed = 0
test_results = []

def log_test(test_name, passed, details=""):
    """Log test result"""
    global tests_passed, tests_failed
    status = "✅ PASSED" if passed else "❌ FAILED"
    print(f"{status} - {test_name}")
    if details:
        print(f"  Details: {details}")
    
    test_results.append({
        "test": test_name,
        "passed": passed,
        "details": details
    })
    
    if passed:
        tests_passed += 1
    else:
        tests_failed += 1

def login():
    """Login and get session cookie"""
    print("\n=== LOGGING IN ===")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json=CREDENTIALS,
            timeout=30
        )
        
        if response.status_code == 200:
            cookies = response.cookies
            print(f"✅ Login successful as {CREDENTIALS['email']}")
            return cookies
        else:
            print(f"❌ Login failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {str(e)}")
        return None

def test_health_version(cookies):
    """Test 1: Health version check"""
    print("\n=== TEST 1: Health Version Check ===")
    try:
        response = requests.get(f"{BASE_URL}/health", cookies=cookies, timeout=30)
        data = response.json()
        
        version = data.get("version")
        if version == "3.9.3":
            log_test("Health version is 3.9.3", True, f"version={version}")
        else:
            log_test("Health version is 3.9.3", False, f"Expected 3.9.3, got {version}")
    except Exception as e:
        log_test("Health version is 3.9.3", False, str(e))

def test_client_default_parent(cookies):
    """Test 2: Client creation with default parent"""
    print("\n=== TEST 2: Client Creation with Default Parent ===")
    try:
        # Create client WITHOUT parent_code
        client_data = {
            "name": "عميل اختبار الشجرة"
        }
        
        response = requests.post(
            f"{BASE_URL}/clients",
            json=client_data,
            cookies=cookies,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            parent_code = data.get("parent_code")
            
            if parent_code == "1301":
                log_test("Client default parent_code is 1301", True, f"parent_code={parent_code}")
                
                # Verify in GET list
                list_response = requests.get(f"{BASE_URL}/clients", cookies=cookies, timeout=30)
                clients = list_response.json()
                
                # Find our client
                found = False
                for client in clients:
                    if client.get("name") == "عميل اختبار الشجرة":
                        if client.get("parent_code") == "1301":
                            found = True
                            log_test("Client appears in list with parent_code 1301", True)
                        break
                
                if not found:
                    log_test("Client appears in list with parent_code 1301", False, "Client not found or parent_code mismatch")
                
                return data.get("id")
            else:
                log_test("Client default parent_code is 1301", False, f"Expected 1301, got {parent_code}")
                return None
        else:
            log_test("Client default parent_code is 1301", False, f"HTTP {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Client default parent_code is 1301", False, str(e))
        return None

def test_client_custom_parent(cookies):
    """Test 3: Client creation with custom parent"""
    print("\n=== TEST 3: Client Creation with Custom Parent ===")
    try:
        # Create client WITH custom parent_code
        client_data = {
            "name": "عميل مخصص",
            "parent_code": "11"
        }
        
        response = requests.post(
            f"{BASE_URL}/clients",
            json=client_data,
            cookies=cookies,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            parent_code = data.get("parent_code")
            
            if parent_code == "11":
                log_test("Client custom parent_code is 11", True, f"parent_code={parent_code}")
                return data.get("id")
            else:
                log_test("Client custom parent_code is 11", False, f"Expected 11, got {parent_code}")
                return None
        else:
            log_test("Client custom parent_code is 11", False, f"HTTP {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Client custom parent_code is 11", False, str(e))
        return None

def test_supplier_default_parent(cookies):
    """Test 4: Supplier creation with default parent"""
    print("\n=== TEST 4: Supplier Creation with Default Parent ===")
    try:
        # Create supplier WITHOUT parent_code
        supplier_data = {
            "name": "مورد اختبار الشجرة"
        }
        
        response = requests.post(
            f"{BASE_URL}/suppliers",
            json=supplier_data,
            cookies=cookies,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            parent_code = data.get("parent_code")
            
            if parent_code == "2101":
                log_test("Supplier default parent_code is 2101", True, f"parent_code={parent_code}")
                
                # Verify in GET list
                list_response = requests.get(f"{BASE_URL}/suppliers", cookies=cookies, timeout=30)
                suppliers = list_response.json()
                
                # Find our supplier
                found = False
                for supplier in suppliers:
                    if supplier.get("name") == "مورد اختبار الشجرة":
                        if supplier.get("parent_code") == "2101":
                            found = True
                            log_test("Supplier appears in list with parent_code 2101", True)
                        break
                
                if not found:
                    log_test("Supplier appears in list with parent_code 2101", False, "Supplier not found or parent_code mismatch")
                
                return data.get("id")
            else:
                log_test("Supplier default parent_code is 2101", False, f"Expected 2101, got {parent_code}")
                return None
        else:
            log_test("Supplier default parent_code is 2101", False, f"HTTP {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Supplier default parent_code is 2101", False, str(e))
        return None

def test_box_cash_default_parent(cookies):
    """Test 5: Box (cash) creation with default parent"""
    print("\n=== TEST 5: Box (Cash) Creation with Default Parent ===")
    try:
        # Create cash box WITHOUT parent_code
        box_data = {
            "name_ar": "صندوق اختبار",
            "type": "cash"
        }
        
        response = requests.post(
            f"{BASE_URL}/boxes",
            json=box_data,
            cookies=cookies,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            parent_code = data.get("parent_code")
            
            if parent_code == "1101":
                log_test("Cash box default parent_code is 1101", True, f"parent_code={parent_code}")
                return data.get("id")
            else:
                log_test("Cash box default parent_code is 1101", False, f"Expected 1101, got {parent_code}")
                return None
        else:
            log_test("Cash box default parent_code is 1101", False, f"HTTP {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Cash box default parent_code is 1101", False, str(e))
        return None

def test_box_bank_default_parent(cookies):
    """Test 6: Box (bank) creation with default parent"""
    print("\n=== TEST 6: Box (Bank) Creation with Default Parent ===")
    try:
        # Create bank box WITHOUT parent_code
        box_data = {
            "name_ar": "بنك اختبار",
            "type": "bank"
        }
        
        response = requests.post(
            f"{BASE_URL}/boxes",
            json=box_data,
            cookies=cookies,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            parent_code = data.get("parent_code")
            
            if parent_code == "1201":
                log_test("Bank box default parent_code is 1201", True, f"parent_code={parent_code}")
                return data.get("id")
            else:
                log_test("Bank box default parent_code is 1201", False, f"Expected 1201, got {parent_code}")
                return None
        else:
            log_test("Bank box default parent_code is 1201", False, f"HTTP {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Bank box default parent_code is 1201", False, str(e))
        return None

def test_box_custom_parent(cookies):
    """Test 7: Box creation with custom parent"""
    print("\n=== TEST 7: Box Creation with Custom Parent ===")
    try:
        # Create cash box WITH custom parent_code
        box_data = {
            "name_ar": "صندوق خاص",
            "type": "cash",
            "parent_code": "11"
        }
        
        response = requests.post(
            f"{BASE_URL}/boxes",
            json=box_data,
            cookies=cookies,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            parent_code = data.get("parent_code")
            
            if parent_code == "11":
                log_test("Box custom parent_code is 11", True, f"parent_code={parent_code}")
                return data.get("id")
            else:
                log_test("Box custom parent_code is 11", False, f"Expected 11, got {parent_code}")
                return None
        else:
            log_test("Box custom parent_code is 11", False, f"HTTP {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Box custom parent_code is 11", False, str(e))
        return None

def test_client_update_parent(cookies, client_id):
    """Test 8: Update client with new parent"""
    print("\n=== TEST 8: Update Client Parent ===")
    if not client_id:
        log_test("Update client parent_code", False, "No client_id from previous test")
        return
    
    try:
        # Update client parent_code
        update_data = {
            "parent_code": "1301"
        }
        
        response = requests.put(
            f"{BASE_URL}/clients/{client_id}",
            json=update_data,
            cookies=cookies,
            timeout=30
        )
        
        if response.status_code == 200:
            log_test("Update client parent_code succeeds", True, "HTTP 200")
            
            # Verify in GET list
            list_response = requests.get(f"{BASE_URL}/clients", cookies=cookies, timeout=30)
            clients = list_response.json()
            
            # Find our client
            found = False
            for client in clients:
                if client.get("id") == client_id:
                    if client.get("parent_code") == "1301":
                        found = True
                        log_test("Updated client shows new parent_code in list", True)
                    break
            
            if not found:
                log_test("Updated client shows new parent_code in list", False, "Client not found or parent_code not updated")
        else:
            log_test("Update client parent_code succeeds", False, f"HTTP {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Update client parent_code succeeds", False, str(e))

def test_gmail_signup_regression(cookies):
    """Test 9: Gmail-only signup still enforced (v3.9 regression)"""
    print("\n=== TEST 9: Gmail-only Signup Regression ===")
    try:
        # Try signup with yahoo email
        signup_data = {
            "owner_email": "testuser@yahoo.com",
            "owner_password": "Test@2025",
            "agency_name": "Test Agency"
        }
        
        response = requests.post(
            f"{BASE_URL}/public/signup",
            json=signup_data,
            timeout=30
        )
        
        if response.status_code == 400:
            log_test("Gmail-only signup still enforced", True, "Yahoo email rejected with 400")
        else:
            log_test("Gmail-only signup still enforced", False, f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_test("Gmail-only signup still enforced", False, str(e))

def test_packages_comparison_regression(cookies):
    """Test 10: Packages comparison endpoint still works (v3.7 regression)"""
    print("\n=== TEST 10: Packages Comparison Regression ===")
    try:
        response = requests.get(
            f"{BASE_URL}/packages/comparison",
            cookies=cookies,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if "period" in data and "rows" in data and "totals" in data:
                log_test("Packages comparison endpoint still works", True, "Valid response structure")
            else:
                log_test("Packages comparison endpoint still works", False, "Missing required fields")
        else:
            log_test("Packages comparison endpoint still works", False, f"HTTP {response.status_code}")
    except Exception as e:
        log_test("Packages comparison endpoint still works", False, str(e))

def main():
    """Main test execution"""
    print("=" * 80)
    print("v3.9.3 BACKEND TESTING — Parent Account Linkage")
    print("=" * 80)
    
    # Login
    cookies = login()
    if not cookies:
        print("\n❌ FATAL: Login failed. Cannot proceed with tests.")
        sys.exit(1)
    
    # Run tests
    test_health_version(cookies)
    client_id = test_client_default_parent(cookies)
    custom_client_id = test_client_custom_parent(cookies)
    test_supplier_default_parent(cookies)
    test_box_cash_default_parent(cookies)
    test_box_bank_default_parent(cookies)
    test_box_custom_parent(cookies)
    test_client_update_parent(cookies, custom_client_id)
    test_gmail_signup_regression(cookies)
    test_packages_comparison_regression(cookies)
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {tests_passed + tests_failed}")
    print(f"✅ Passed: {tests_passed}")
    print(f"❌ Failed: {tests_failed}")
    print(f"Success Rate: {(tests_passed / (tests_passed + tests_failed) * 100):.1f}%")
    
    if tests_failed > 0:
        print("\n❌ FAILED TESTS:")
        for result in test_results:
            if not result["passed"]:
                print(f"  - {result['test']}: {result['details']}")
    
    print("=" * 80)
    
    # Exit with appropriate code
    sys.exit(0 if tests_failed == 0 else 1)

if __name__ == "__main__":
    main()
