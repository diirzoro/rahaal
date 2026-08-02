#!/usr/bin/env python3
"""
v3.9.11 Backend Test Suite - Packages Bulk Operations
Tests POST /api/packages/bulk-delete and POST /api/packages/bulk-close
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
EMAIL = "owner@demo.com"
PASSWORD = "Demo@2025"

# Global session
session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

def log(msg, level="INFO"):
    """Print formatted log message"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")

def login():
    """Login and get session cookie"""
    log("Logging in as owner@demo.com...")
    resp = session.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if resp.status_code != 200:
        log(f"Login failed: {resp.status_code} {resp.text}", "ERROR")
        sys.exit(1)
    log("✅ Login successful")
    return resp.json()

def test_health_version():
    """Test 1: Verify health endpoint returns version 3.9.11"""
    log("\n=== TEST 1: Health Endpoint Version ===")
    try:
        resp = session.get(f"{BASE_URL}/health")
        if resp.status_code != 200:
            log(f"❌ FAILED: Health endpoint returned {resp.status_code}", "ERROR")
            return False
        
        data = resp.json()
        version = data.get('version', '')
        log(f"Health response: {json.dumps(data, ensure_ascii=False)}")
        
        if version == "3.9.11":
            log(f"✅ PASSED: Version is 3.9.11")
            return True
        else:
            log(f"❌ FAILED: Expected version 3.9.11, got {version}", "ERROR")
            return False
    except Exception as e:
        log(f"❌ FAILED: Exception - {str(e)}", "ERROR")
        return False

def create_package(name, package_type="umrah", currency="SAR", start_date="2026-09-01", end_date="2026-10-01"):
    """Helper: Create a package"""
    payload = {
        "name": name,
        "package_type": package_type,
        "currency": currency,
        "start_date": start_date,
        "end_date": end_date
    }
    resp = session.post(f"{BASE_URL}/packages", json=payload)
    if resp.status_code != 200:
        log(f"Failed to create package: {resp.status_code} {resp.text}", "ERROR")
        return None
    data = resp.json()
    log(f"Created package: {data.get('id')} - {name}")
    return data

def get_packages():
    """Helper: Get all packages"""
    resp = session.get(f"{BASE_URL}/packages")
    if resp.status_code != 200:
        log(f"Failed to get packages: {resp.status_code}", "ERROR")
        return []
    return resp.json()

def get_package_by_id(pkg_id):
    """Helper: Get package by ID"""
    packages = get_packages()
    for pkg in packages:
        if pkg.get('id') == pkg_id:
            return pkg
    return None

def create_package_component(package_id, supplier_id, name="مكون تجريبي", cost_per_pax=100, sale_per_pax=150):
    """Helper: Create a package component"""
    payload = {
        "supplier_id": supplier_id,
        "name": name,
        "cost_per_pax": cost_per_pax,
        "sale_per_pax": sale_per_pax
    }
    resp = session.post(f"{BASE_URL}/packages/{package_id}/components", json=payload)
    if resp.status_code != 200:
        log(f"Failed to create component: {resp.status_code} {resp.text}", "ERROR")
        return None
    return resp.json()

def create_package_booking(package_id, client_id, pilgrim_name="حاج تجريبي", passport_no="TEST123", pax_count=1, payment_method="credit"):
    """Helper: Create a package booking"""
    payload = {
        "client_id": client_id,
        "pilgrim_name": pilgrim_name,
        "passport_no": passport_no,
        "pax_count": pax_count,
        "payment_method": payment_method
    }
    resp = session.post(f"{BASE_URL}/packages/{package_id}/bookings", json=payload)
    if resp.status_code != 200:
        log(f"Failed to create booking: {resp.status_code} {resp.text}", "ERROR")
        return None
    return resp.json()

def get_clients():
    """Helper: Get all clients"""
    resp = session.get(f"{BASE_URL}/clients")
    if resp.status_code != 200:
        log(f"Failed to get clients: {resp.status_code}", "ERROR")
        return []
    return resp.json()

def get_suppliers():
    """Helper: Get all suppliers"""
    resp = session.get(f"{BASE_URL}/suppliers")
    if resp.status_code != 200:
        log(f"Failed to get suppliers: {resp.status_code}", "ERROR")
        return []
    return resp.json()

def test_bulk_close_basic():
    """Test 2: Basic bulk-close operation"""
    log("\n=== TEST 2: Bulk Close - Basic Operation ===")
    try:
        # Create 3 packages
        p1 = create_package("باكج تجريبي 1")
        p2 = create_package("باكج تجريبي 2")
        p3 = create_package("باكج تجريبي 3")
        
        if not p1 or not p2 or not p3:
            log("❌ FAILED: Could not create test packages", "ERROR")
            return False, None, None, None
        
        p1_id = p1.get('id')
        p2_id = p2.get('id')
        p3_id = p3.get('id')
        
        log(f"Created packages: p1={p1_id}, p2={p2_id}, p3={p3_id}")
        
        # Test bulk-close with status="closed" for p1 and p2
        payload = {"ids": [p1_id, p2_id], "status": "closed"}
        resp = session.post(f"{BASE_URL}/packages/bulk-close", json=payload)
        
        if resp.status_code != 200:
            log(f"❌ FAILED: bulk-close returned {resp.status_code}: {resp.text}", "ERROR")
            return False, p1_id, p2_id, p3_id
        
        data = resp.json()
        log(f"Bulk-close response: {json.dumps(data, ensure_ascii=False)}")
        
        # Verify response structure
        if not data.get('ok'):
            log(f"❌ FAILED: Response ok=false", "ERROR")
            return False, p1_id, p2_id, p3_id
        
        if data.get('updated') != 2:
            log(f"❌ FAILED: Expected updated=2, got {data.get('updated')}", "ERROR")
            return False, p1_id, p2_id, p3_id
        
        if data.get('status') != 'closed':
            log(f"❌ FAILED: Expected status='closed', got {data.get('status')}", "ERROR")
            return False, p1_id, p2_id, p3_id
        
        # Verify packages are actually closed
        p1_check = get_package_by_id(p1_id)
        p2_check = get_package_by_id(p2_id)
        p3_check = get_package_by_id(p3_id)
        
        if p1_check.get('status') != 'closed':
            log(f"❌ FAILED: p1 status is {p1_check.get('status')}, expected 'closed'", "ERROR")
            return False, p1_id, p2_id, p3_id
        
        if p2_check.get('status') != 'closed':
            log(f"❌ FAILED: p2 status is {p2_check.get('status')}, expected 'closed'", "ERROR")
            return False, p1_id, p2_id, p3_id
        
        if p3_check.get('status') == 'closed':
            log(f"❌ FAILED: p3 should not be closed", "ERROR")
            return False, p1_id, p2_id, p3_id
        
        log(f"✅ PASSED: Bulk-close updated 2 packages to 'closed', p3 remains open")
        return True, p1_id, p2_id, p3_id
        
    except Exception as e:
        log(f"❌ FAILED: Exception - {str(e)}", "ERROR")
        return False, None, None, None

def test_bulk_close_reopen(p1_id):
    """Test 3: Bulk-close with status="open" to reopen"""
    log("\n=== TEST 3: Bulk Close - Reopen Package ===")
    try:
        if not p1_id:
            log("❌ FAILED: No package ID provided", "ERROR")
            return False
        
        # Reopen p1
        payload = {"ids": [p1_id], "status": "open"}
        resp = session.post(f"{BASE_URL}/packages/bulk-close", json=payload)
        
        if resp.status_code != 200:
            log(f"❌ FAILED: bulk-close returned {resp.status_code}: {resp.text}", "ERROR")
            return False
        
        data = resp.json()
        log(f"Bulk-close response: {json.dumps(data, ensure_ascii=False)}")
        
        if data.get('updated') != 1:
            log(f"❌ FAILED: Expected updated=1, got {data.get('updated')}", "ERROR")
            return False
        
        if data.get('status') != 'open':
            log(f"❌ FAILED: Expected status='open', got {data.get('status')}", "ERROR")
            return False
        
        # Verify p1 is now open
        p1_check = get_package_by_id(p1_id)
        if p1_check.get('status') != 'open':
            log(f"❌ FAILED: p1 status is {p1_check.get('status')}, expected 'open'", "ERROR")
            return False
        
        log(f"✅ PASSED: Package p1 reopened successfully")
        return True
        
    except Exception as e:
        log(f"❌ FAILED: Exception - {str(e)}", "ERROR")
        return False

def test_bulk_close_empty_ids():
    """Test 4: Bulk-close with empty ids array"""
    log("\n=== TEST 4: Bulk Close - Empty IDs Validation ===")
    try:
        payload = {"ids": [], "status": "closed"}
        resp = session.post(f"{BASE_URL}/packages/bulk-close", json=payload)
        
        if resp.status_code != 400:
            log(f"❌ FAILED: Expected 400, got {resp.status_code}", "ERROR")
            return False
        
        data = resp.json()
        error_msg = data.get('error', '')
        log(f"Error response: {json.dumps(data, ensure_ascii=False)}")
        
        if "لم يتم اختيار أي باكج" not in error_msg:
            log(f"❌ FAILED: Expected Arabic error message, got: {error_msg}", "ERROR")
            return False
        
        log(f"✅ PASSED: Empty IDs correctly rejected with 400 and Arabic error")
        return True
        
    except Exception as e:
        log(f"❌ FAILED: Exception - {str(e)}", "ERROR")
        return False

def test_bulk_delete_with_bookings(p1_id, p2_id, p3_id):
    """Test 5: Bulk-delete with one package having bookings"""
    log("\n=== TEST 5: Bulk Delete - Package with Bookings ===")
    try:
        if not p1_id or not p2_id or not p3_id:
            log("❌ FAILED: Missing package IDs", "ERROR")
            return False
        
        # Get a client and supplier for booking
        clients = get_clients()
        suppliers = get_suppliers()
        
        if not clients:
            log("No clients found, creating one...")
            resp = session.post(f"{BASE_URL}/clients", json={"name": "عميل تجريبي للباكج"})
            if resp.status_code == 200:
                clients = [resp.json()]
        
        if not suppliers:
            log("No suppliers found, creating one...")
            resp = session.post(f"{BASE_URL}/suppliers", json={"name": "مورد تجريبي للباكج"})
            if resp.status_code == 200:
                suppliers = [resp.json()]
        
        if not clients or not suppliers:
            log("❌ FAILED: Could not get/create client or supplier", "ERROR")
            return False
        
        client_id = clients[0].get('id')
        supplier_id = suppliers[0].get('id')
        
        # Add a component to p1 (required for booking)
        component = create_package_component(p1_id, supplier_id, "مكون اختبار", 100, 150)
        if not component:
            log("❌ FAILED: Could not create package component", "ERROR")
            return False
        
        # Create a booking for p1
        booking = create_package_booking(p1_id, client_id, "حاج محمد أحمد", "PKG-TEST-001", 1, "credit")
        if not booking:
            log("❌ FAILED: Could not create booking", "ERROR")
            return False
        
        log(f"Created booking for p1: {booking.get('id')}")
        
        # Try to bulk-delete all 3 packages
        payload = {"ids": [p1_id, p2_id, p3_id]}
        resp = session.post(f"{BASE_URL}/packages/bulk-delete", json=payload)
        
        if resp.status_code != 200:
            log(f"❌ FAILED: bulk-delete returned {resp.status_code}: {resp.text}", "ERROR")
            return False
        
        data = resp.json()
        log(f"Bulk-delete response: {json.dumps(data, ensure_ascii=False)}")
        
        # Verify response structure
        if not data.get('ok'):
            log(f"❌ FAILED: Response ok=false", "ERROR")
            return False
        
        # p1 should fail (has booking), p2 and p3 should succeed
        if data.get('deleted') != 2:
            log(f"❌ FAILED: Expected deleted=2, got {data.get('deleted')}", "ERROR")
            return False
        
        if data.get('failed') != 1:
            log(f"❌ FAILED: Expected failed=1, got {data.get('failed')}", "ERROR")
            return False
        
        # Check errors array
        errors = data.get('errors', [])
        if len(errors) != 1:
            log(f"❌ FAILED: Expected 1 error, got {len(errors)}", "ERROR")
            return False
        
        error = errors[0]
        if error.get('id') != p1_id:
            log(f"❌ FAILED: Error should be for p1, got {error.get('id')}", "ERROR")
            return False
        
        error_msg = error.get('error', '')
        if "حجز مرتبط" not in error_msg:
            log(f"❌ FAILED: Expected Arabic error about bookings, got: {error_msg}", "ERROR")
            return False
        
        # Verify p1 still exists, p2 and p3 are deleted
        p1_check = get_package_by_id(p1_id)
        p2_check = get_package_by_id(p2_id)
        p3_check = get_package_by_id(p3_id)
        
        if not p1_check:
            log(f"❌ FAILED: p1 should still exist (has booking)", "ERROR")
            return False
        
        if p2_check:
            log(f"❌ FAILED: p2 should be deleted", "ERROR")
            return False
        
        if p3_check:
            log(f"❌ FAILED: p3 should be deleted", "ERROR")
            return False
        
        log(f"✅ PASSED: Bulk-delete correctly deleted 2 packages, failed 1 with booking (Arabic error)")
        return True
        
    except Exception as e:
        log(f"❌ FAILED: Exception - {str(e)}", "ERROR")
        return False

def test_bulk_delete_empty_ids():
    """Test 6: Bulk-delete with empty ids array"""
    log("\n=== TEST 6: Bulk Delete - Empty IDs Validation ===")
    try:
        payload = {"ids": []}
        resp = session.post(f"{BASE_URL}/packages/bulk-delete", json=payload)
        
        if resp.status_code != 400:
            log(f"❌ FAILED: Expected 400, got {resp.status_code}", "ERROR")
            return False
        
        data = resp.json()
        error_msg = data.get('error', '')
        log(f"Error response: {json.dumps(data, ensure_ascii=False)}")
        
        if "لم يتم اختيار أي باكج" not in error_msg:
            log(f"❌ FAILED: Expected Arabic error message, got: {error_msg}", "ERROR")
            return False
        
        log(f"✅ PASSED: Empty IDs correctly rejected with 400 and Arabic error")
        return True
        
    except Exception as e:
        log(f"❌ FAILED: Exception - {str(e)}", "ERROR")
        return False

def test_bulk_delete_nonexistent():
    """Test 7: Bulk-delete with non-existent package ID"""
    log("\n=== TEST 7: Bulk Delete - Non-existent Package ===")
    try:
        fake_id = "fake-package-999"
        payload = {"ids": [fake_id]}
        resp = session.post(f"{BASE_URL}/packages/bulk-delete", json=payload)
        
        if resp.status_code != 200:
            log(f"❌ FAILED: Expected 200, got {resp.status_code}", "ERROR")
            return False
        
        data = resp.json()
        log(f"Bulk-delete response: {json.dumps(data, ensure_ascii=False)}")
        
        if data.get('deleted') != 0:
            log(f"❌ FAILED: Expected deleted=0, got {data.get('deleted')}", "ERROR")
            return False
        
        if data.get('failed') != 1:
            log(f"❌ FAILED: Expected failed=1, got {data.get('failed')}", "ERROR")
            return False
        
        errors = data.get('errors', [])
        if len(errors) != 1:
            log(f"❌ FAILED: Expected 1 error, got {len(errors)}", "ERROR")
            return False
        
        error = errors[0]
        if error.get('id') != fake_id:
            log(f"❌ FAILED: Error should be for {fake_id}, got {error.get('id')}", "ERROR")
            return False
        
        error_msg = error.get('error', '')
        if "غير موجود" not in error_msg:
            log(f"❌ FAILED: Expected Arabic error 'غير موجود', got: {error_msg}", "ERROR")
            return False
        
        log(f"✅ PASSED: Non-existent package correctly failed with Arabic error 'غير موجود'")
        return True
        
    except Exception as e:
        log(f"❌ FAILED: Exception - {str(e)}", "ERROR")
        return False

def test_regression_bulk_edit_tickets():
    """Test 8: Regression - v3.9.10 bulk-edit tickets still works"""
    log("\n=== TEST 8: Regression - Bulk Edit Tickets (v3.9.10) ===")
    try:
        # This is a simple smoke test to ensure v3.9.10 still works
        # We'll just verify the endpoint exists and returns proper error for empty ids
        payload = {"ids": [], "updates": {}}
        resp = session.post(f"{BASE_URL}/tickets/bulk-edit", json=payload)
        
        # Should return 400 for empty ids
        if resp.status_code != 400:
            log(f"❌ FAILED: Expected 400, got {resp.status_code}", "ERROR")
            return False
        
        log(f"✅ PASSED: v3.9.10 bulk-edit tickets endpoint still functional")
        return True
        
    except Exception as e:
        log(f"❌ FAILED: Exception - {str(e)}", "ERROR")
        return False

def test_regression_bulk_delete_tickets():
    """Test 9: Regression - v3.9.9 bulk-delete tickets still works"""
    log("\n=== TEST 9: Regression - Bulk Delete Tickets (v3.9.9) ===")
    try:
        # Simple smoke test for v3.9.9
        payload = {"ids": []}
        resp = session.post(f"{BASE_URL}/tickets/bulk-delete", json=payload)
        
        # Should return 400 for empty ids
        if resp.status_code != 400:
            log(f"❌ FAILED: Expected 400, got {resp.status_code}", "ERROR")
            return False
        
        log(f"✅ PASSED: v3.9.9 bulk-delete tickets endpoint still functional")
        return True
        
    except Exception as e:
        log(f"❌ FAILED: Exception - {str(e)}", "ERROR")
        return False

def main():
    """Main test runner"""
    log("=" * 80)
    log("v3.9.11 Backend Test Suite - Packages Bulk Operations")
    log("=" * 80)
    
    # Login
    login()
    
    # Track results
    results = []
    
    # Test 1: Health version
    results.append(("Health Version 3.9.11", test_health_version()))
    
    # Test 2-3: Bulk-close operations
    test2_result, p1_id, p2_id, p3_id = test_bulk_close_basic()
    results.append(("Bulk Close - Basic", test2_result))
    
    if test2_result and p1_id:
        results.append(("Bulk Close - Reopen", test_bulk_close_reopen(p1_id)))
    else:
        results.append(("Bulk Close - Reopen", False))
        log("⚠️ Skipping reopen test due to previous failure", "WARN")
    
    # Test 4: Bulk-close empty IDs
    results.append(("Bulk Close - Empty IDs", test_bulk_close_empty_ids()))
    
    # Test 5: Bulk-delete with bookings
    if test2_result and p1_id and p2_id and p3_id:
        results.append(("Bulk Delete - With Bookings", test_bulk_delete_with_bookings(p1_id, p2_id, p3_id)))
    else:
        results.append(("Bulk Delete - With Bookings", False))
        log("⚠️ Skipping bulk-delete test due to previous failure", "WARN")
    
    # Test 6: Bulk-delete empty IDs
    results.append(("Bulk Delete - Empty IDs", test_bulk_delete_empty_ids()))
    
    # Test 7: Bulk-delete non-existent
    results.append(("Bulk Delete - Non-existent", test_bulk_delete_nonexistent()))
    
    # Test 8-9: Regression tests
    results.append(("Regression - Bulk Edit Tickets", test_regression_bulk_edit_tickets()))
    results.append(("Regression - Bulk Delete Tickets", test_regression_bulk_delete_tickets()))
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        log(f"{status}: {test_name}")
    
    log("=" * 80)
    log(f"TOTAL: {passed}/{total} tests passed")
    log("=" * 80)
    
    if passed == total:
        log("🎉 ALL TESTS PASSED!", "SUCCESS")
        sys.exit(0)
    else:
        log(f"⚠️ {total - passed} test(s) failed", "ERROR")
        sys.exit(1)

if __name__ == "__main__":
    main()
