#!/usr/bin/env python3
"""
v3.15 Backend Test: Packages room_pricing & registrants
Tests the new room_pricing and registrants features in package bookings.
"""
import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
LOGIN_EMAIL = "owner@demo.com"
LOGIN_PASSWORD = "Demo@2025"

# Test state
session = requests.Session()
cookie_jar = {}
test_data = {
    "package_id": None,
    "component_id": None,
    "booking1_id": None,
    "booking2_id": None,
    "client_id": None,
    "supplier_id": None,
    "client_balance_before": None,
}

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {test_name}")
    if details:
        print(f"    {details}")
    return passed

def login():
    """Login and get session cookie"""
    print("\n=== SETUP: Login ===")
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json={
            "email": LOGIN_EMAIL,
            "password": LOGIN_PASSWORD
        })
        if resp.status_code == 200:
            # Extract cookie
            if 'rahaal_session' in resp.cookies:
                cookie_jar['rahaal_session'] = resp.cookies['rahaal_session']
                session.cookies.set('rahaal_session', resp.cookies['rahaal_session'])
                log_test("Login", True, f"Logged in as {LOGIN_EMAIL}")
                return True
            else:
                log_test("Login", False, "No rahaal_session cookie in response")
                return False
        else:
            log_test("Login", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test("Login", False, f"Exception: {str(e)}")
        return False

def get_existing_client():
    """Get an existing client for testing"""
    print("\n=== SETUP: Get Existing Client ===")
    try:
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            clients = resp.json()
            if len(clients) > 0:
                client = clients[0]
                test_data["client_id"] = client["id"]
                # Record initial balance
                test_data["client_balance_before"] = client.get("balances", {}).get("SAR", 0)
                log_test("Get Client", True, f"Client ID: {client['id']}, Initial SAR balance: {test_data['client_balance_before']}")
                return True
            else:
                log_test("Get Client", False, "No clients found")
                return False
        else:
            log_test("Get Client", False, f"Status {resp.status_code}")
            return False
    except Exception as e:
        log_test("Get Client", False, f"Exception: {str(e)}")
        return False

def get_existing_supplier():
    """Get an existing supplier for testing"""
    print("\n=== SETUP: Get Existing Supplier ===")
    try:
        resp = session.get(f"{BASE_URL}/suppliers")
        if resp.status_code == 200:
            suppliers = resp.json()
            if len(suppliers) > 0:
                supplier = suppliers[0]
                test_data["supplier_id"] = supplier["id"]
                log_test("Get Supplier", True, f"Supplier ID: {supplier['id']}")
                return True
            else:
                log_test("Get Supplier", False, "No suppliers found")
                return False
        else:
            log_test("Get Supplier", False, f"Status {resp.status_code}")
            return False
    except Exception as e:
        log_test("Get Supplier", False, f"Exception: {str(e)}")
        return False

def test_1_create_package_with_room_pricing():
    """Test 1: POST /api/packages with room_pricing"""
    print("\n=== TEST 1: Create Package with room_pricing ===")
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "name": "باكج AUTOTEST-V315",
            "package_type": "umrah",
            "currency": "SAR",
            "start_date": today,
            "room_pricing": [
                {"type": "ثنائي", "sale_per_pax": 2000},
                {"type": "ثلاثي", "sale_per_pax": 1500},
                {"type": "رباعي", "sale_per_pax": 1200}
            ]
        }
        resp = session.post(f"{BASE_URL}/packages", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            test_data["package_id"] = data["id"]
            
            # Verify room_pricing array
            if "room_pricing" in data and isinstance(data["room_pricing"], list):
                if len(data["room_pricing"]) == 3:
                    # Check each room type
                    types_found = [rp["type"] for rp in data["room_pricing"]]
                    if "ثنائي" in types_found and "ثلاثي" in types_found and "رباعي" in types_found:
                        log_test("Create Package", True, f"Package created with 3 room types. ID: {data['id']}")
                        return True
                    else:
                        log_test("Create Package", False, f"Room types mismatch: {types_found}")
                        return False
                else:
                    log_test("Create Package", False, f"Expected 3 room types, got {len(data['room_pricing'])}")
                    return False
            else:
                log_test("Create Package", False, "room_pricing not in response or not an array")
                return False
        else:
            log_test("Create Package", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test("Create Package", False, f"Exception: {str(e)}")
        return False

def test_2_patch_package_room_pricing():
    """Test 2: PATCH /api/packages/:id to update room_pricing"""
    print("\n=== TEST 2: Update Package room_pricing ===")
    try:
        payload = {
            "room_pricing": [
                {"type": "ثنائي", "sale_per_pax": 2100},  # Changed from 2000 to 2100
                {"type": "ثلاثي", "sale_per_pax": 1500},
                {"type": "رباعي", "sale_per_pax": 1200}
            ]
        }
        resp = session.patch(f"{BASE_URL}/packages/{test_data['package_id']}", json=payload)
        if resp.status_code == 200:
            log_test("PATCH Package", True, "Package room_pricing updated")
            return True
        else:
            log_test("PATCH Package", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test("PATCH Package", False, f"Exception: {str(e)}")
        return False

def test_3_verify_updated_pricing():
    """Test 3: GET /api/packages to verify updated pricing"""
    print("\n=== TEST 3: Verify Updated Pricing ===")
    try:
        resp = session.get(f"{BASE_URL}/packages")
        if resp.status_code == 200:
            packages = resp.json()
            pkg = next((p for p in packages if p["id"] == test_data["package_id"]), None)
            if pkg:
                room_pricing = pkg.get("room_pricing", [])
                double_room = next((rp for rp in room_pricing if rp["type"] == "ثنائي"), None)
                if double_room and double_room["sale_per_pax"] == 2100:
                    log_test("Verify Updated Pricing", True, "ثنائي room price updated to 2100")
                    return True
                else:
                    log_test("Verify Updated Pricing", False, f"ثنائي price not updated correctly: {double_room}")
                    return False
            else:
                log_test("Verify Updated Pricing", False, "Package not found in list")
                return False
        else:
            log_test("Verify Updated Pricing", False, f"Status {resp.status_code}")
            return False
    except Exception as e:
        log_test("Verify Updated Pricing", False, f"Exception: {str(e)}")
        return False

def test_4_add_component():
    """Test 4: POST /api/packages/:id/components"""
    print("\n=== TEST 4: Add Component to Package ===")
    try:
        payload = {
            "name": "فندق AUTOTEST-V315",
            "component_type": "hotel",
            "supplier_id": test_data["supplier_id"],
            "cost_per_pax": 500,
            "sale_per_pax": 800
        }
        resp = session.post(f"{BASE_URL}/packages/{test_data['package_id']}/components", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            test_data["component_id"] = data["id"]
            log_test("Add Component", True, f"Component added. ID: {data['id']}")
            return True
        else:
            log_test("Add Component", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test("Add Component", False, f"Exception: {str(e)}")
        return False

def test_5_create_booking_with_registrants():
    """Test 5: POST /api/packages/:id/bookings with registrants"""
    print("\n=== TEST 5: Create Booking with Registrants ===")
    try:
        payload = {
            "payment_method": "credit",
            "client_id": test_data["client_id"],
            "registrants": [
                {"name": "بالغ 1", "passport_no": "v315a", "age": 30, "visa_no": "V1", "room_type": "ثنائي"},
                {"name": "بالغ 2", "passport_no": "v315b", "age": 25, "visa_no": "V2", "room_type": "ثلاثي"},
                {"name": "طفل", "passport_no": "v315c", "age": 8, "visa_no": "V3", "room_type": "ثلاثي"},
                {"name": "رضيع", "passport_no": "v315d", "age": 1, "visa_no": "V4", "room_type": ""}
            ]
        }
        resp = session.post(f"{BASE_URL}/packages/{test_data['package_id']}/bookings", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            test_data["booking1_id"] = data["id"]
            
            # Verify all fields
            checks = []
            
            # Check pax counts
            checks.append(("pax_adults", data.get("pax_adults") == 2, f"Expected 2, got {data.get('pax_adults')}"))
            checks.append(("pax_children", data.get("pax_children") == 1, f"Expected 1, got {data.get('pax_children')}"))
            checks.append(("pax_infants", data.get("pax_infants") == 1, f"Expected 1, got {data.get('pax_infants')}"))
            checks.append(("pax_count", data.get("pax_count") == 4, f"Expected 4, got {data.get('pax_count')}"))
            checks.append(("pax_billed", data.get("pax_billed") == 3, f"Expected 3, got {data.get('pax_billed')}"))
            
            # Check passport normalization
            registrants = data.get("registrants", [])
            if len(registrants) > 0:
                first_passport = registrants[0].get("passport_no", "")
                checks.append(("passport_no uppercase", first_passport == "V315A", f"Expected V315A, got {first_passport}"))
            else:
                checks.append(("passport_no uppercase", False, "No registrants in response"))
            
            # Check rooms_summary
            rooms_summary = data.get("rooms_summary", {})
            expected_rooms = {"ثنائي": 1, "ثلاثي": 2}
            checks.append(("rooms_summary", rooms_summary == expected_rooms, f"Expected {expected_rooms}, got {rooms_summary}"))
            
            # Check total_sale (2100 + 1500 + 1500 = 5100)
            checks.append(("total_sale", data.get("total_sale") == 5100, f"Expected 5100, got {data.get('total_sale')}"))
            
            # Check total_cost (500 * 3 = 1500)
            checks.append(("total_cost", data.get("total_cost") == 1500, f"Expected 1500, got {data.get('total_cost')}"))
            
            # Check commission (5100 - 1500 = 3600)
            checks.append(("commission", data.get("commission") == 3600, f"Expected 3600, got {data.get('commission')}"))
            
            # Check registrants array length
            checks.append(("registrants length", len(registrants) == 4, f"Expected 4, got {len(registrants)}"))
            
            # Check pilgrim_name defaults to first registrant
            checks.append(("pilgrim_name", data.get("pilgrim_name") == "بالغ 1", f"Expected 'بالغ 1', got {data.get('pilgrim_name')}"))
            
            # Print all checks
            all_passed = True
            for check_name, passed, details in checks:
                if not passed:
                    all_passed = False
                    print(f"    ❌ {check_name}: {details}")
                else:
                    print(f"    ✅ {check_name}")
            
            if all_passed:
                log_test("Create Booking with Registrants", True, f"All verifications passed. Booking ID: {data['id']}")
                return True
            else:
                log_test("Create Booking with Registrants", False, "Some verifications failed")
                return False
        else:
            log_test("Create Booking with Registrants", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test("Create Booking with Registrants", False, f"Exception: {str(e)}")
        return False

def test_6_patch_booking_reduce_registrants():
    """Test 6: PATCH booking to reduce registrants"""
    print("\n=== TEST 6: PATCH Booking - Reduce Registrants ===")
    try:
        payload = {
            "registrants": [
                {"name": "بالغ 1", "passport_no": "v315a", "age": 30, "visa_no": "V1", "room_type": "ثنائي"},
                {"name": "بالغ 2", "passport_no": "v315b", "age": 25, "visa_no": "V2", "room_type": "ثلاثي"}
            ],
            "total_sale": 3600
        }
        resp = session.patch(f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking1_id']}", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            
            # Verify registrants length
            registrants = data.get("registrants", [])
            if len(registrants) == 2:
                # Verify rooms_summary recomputed
                rooms_summary = data.get("rooms_summary", {})
                expected_rooms = {"ثنائي": 1, "ثلاثي": 1}
                if rooms_summary == expected_rooms:
                    log_test("PATCH Booking", True, f"Registrants reduced to 2, rooms_summary recomputed: {rooms_summary}")
                    return True
                else:
                    log_test("PATCH Booking", False, f"rooms_summary not recomputed correctly. Expected {expected_rooms}, got {rooms_summary}")
                    return False
            else:
                log_test("PATCH Booking", False, f"Expected 2 registrants, got {len(registrants)}")
                return False
        else:
            log_test("PATCH Booking", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test("PATCH Booking", False, f"Exception: {str(e)}")
        return False

def test_7_backward_compat_booking():
    """Test 7: Create booking WITHOUT registrants (backward compatibility)"""
    print("\n=== TEST 7: Backward Compatibility - Booking without Registrants ===")
    try:
        payload = {
            "payment_method": "credit",
            "client_id": test_data["client_id"],
            "pax_adults": 2
        }
        resp = session.post(f"{BASE_URL}/packages/{test_data['package_id']}/bookings", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            test_data["booking2_id"] = data["id"]
            
            # Verify old behavior
            checks = []
            
            # total_sale should be from components (800 * 2 = 1600)
            checks.append(("total_sale from components", data.get("total_sale") == 1600, f"Expected 1600, got {data.get('total_sale')}"))
            
            # registrants should be empty array
            registrants = data.get("registrants", None)
            checks.append(("registrants empty", isinstance(registrants, list) and len(registrants) == 0, f"Expected empty array, got {registrants}"))
            
            # rooms_summary should be null
            rooms_summary = data.get("rooms_summary", "NOT_NULL")
            checks.append(("rooms_summary null", rooms_summary is None, f"Expected null, got {rooms_summary}"))
            
            # Print all checks
            all_passed = True
            for check_name, passed, details in checks:
                if not passed:
                    all_passed = False
                    print(f"    ❌ {check_name}: {details}")
                else:
                    print(f"    ✅ {check_name}")
            
            if all_passed:
                log_test("Backward Compatibility", True, f"Old behavior preserved. Booking ID: {data['id']}")
                return True
            else:
                log_test("Backward Compatibility", False, "Some verifications failed")
                return False
        else:
            log_test("Backward Compatibility", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test("Backward Compatibility", False, f"Exception: {str(e)}")
        return False

def test_8_cleanup_delete_bookings():
    """Test 8: DELETE both bookings"""
    print("\n=== TEST 8: Cleanup - Delete Bookings ===")
    try:
        results = []
        
        # Delete booking 1
        if test_data["booking1_id"]:
            resp = session.delete(f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking1_id']}")
            if resp.status_code == 200:
                results.append(("Delete Booking 1", True, ""))
            else:
                results.append(("Delete Booking 1", False, f"Status {resp.status_code}"))
        
        # Delete booking 2
        if test_data["booking2_id"]:
            resp = session.delete(f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking2_id']}")
            if resp.status_code == 200:
                results.append(("Delete Booking 2", True, ""))
            else:
                results.append(("Delete Booking 2", False, f"Status {resp.status_code}"))
        
        all_passed = all(r[1] for r in results)
        for name, passed, details in results:
            log_test(name, passed, details)
        
        return all_passed
    except Exception as e:
        log_test("Delete Bookings", False, f"Exception: {str(e)}")
        return False

def test_9_cleanup_delete_package():
    """Test 9: DELETE package"""
    print("\n=== TEST 9: Cleanup - Delete Package ===")
    try:
        resp = session.delete(f"{BASE_URL}/packages/{test_data['package_id']}")
        if resp.status_code == 200:
            log_test("Delete Package", True, "Package deleted")
            return True
        else:
            log_test("Delete Package", False, f"Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log_test("Delete Package", False, f"Exception: {str(e)}")
        return False

def test_10_verify_package_deleted():
    """Test 10: Verify package no longer in list"""
    print("\n=== TEST 10: Verify Package Deleted ===")
    try:
        resp = session.get(f"{BASE_URL}/packages")
        if resp.status_code == 200:
            packages = resp.json()
            pkg = next((p for p in packages if p["id"] == test_data["package_id"]), None)
            if pkg is None:
                log_test("Verify Package Deleted", True, "Package not found in list")
                return True
            else:
                log_test("Verify Package Deleted", False, "Package still exists in list")
                return False
        else:
            log_test("Verify Package Deleted", False, f"Status {resp.status_code}")
            return False
    except Exception as e:
        log_test("Verify Package Deleted", False, f"Exception: {str(e)}")
        return False

def test_11_verify_client_balance():
    """Test 11: Verify client balance returned to original"""
    print("\n=== TEST 11: Verify Client Balance Restored ===")
    try:
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            clients = resp.json()
            client = next((c for c in clients if c["id"] == test_data["client_id"]), None)
            if client:
                current_balance = client.get("balances", {}).get("SAR", 0)
                original_balance = test_data["client_balance_before"]
                
                if current_balance == original_balance:
                    log_test("Verify Client Balance", True, f"Balance restored to {original_balance} SAR")
                    return True
                else:
                    log_test("Verify Client Balance", False, f"Balance mismatch. Original: {original_balance}, Current: {current_balance}")
                    return False
            else:
                log_test("Verify Client Balance", False, "Client not found")
                return False
        else:
            log_test("Verify Client Balance", False, f"Status {resp.status_code}")
            return False
    except Exception as e:
        log_test("Verify Client Balance", False, f"Exception: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("=" * 80)
    print("v3.15 Backend Test: Packages room_pricing & registrants")
    print("=" * 80)
    
    # Setup
    if not login():
        print("\n❌ FATAL: Login failed. Aborting tests.")
        return
    
    if not get_existing_client():
        print("\n❌ FATAL: No client found. Aborting tests.")
        return
    
    if not get_existing_supplier():
        print("\n❌ FATAL: No supplier found. Aborting tests.")
        return
    
    # Run tests
    results = []
    results.append(("Test 1: Create Package with room_pricing", test_1_create_package_with_room_pricing()))
    results.append(("Test 2: PATCH Package room_pricing", test_2_patch_package_room_pricing()))
    results.append(("Test 3: Verify Updated Pricing", test_3_verify_updated_pricing()))
    results.append(("Test 4: Add Component", test_4_add_component()))
    results.append(("Test 5: Create Booking with Registrants", test_5_create_booking_with_registrants()))
    results.append(("Test 6: PATCH Booking - Reduce Registrants", test_6_patch_booking_reduce_registrants()))
    results.append(("Test 7: Backward Compatibility", test_7_backward_compat_booking()))
    results.append(("Test 8: Delete Bookings", test_8_cleanup_delete_bookings()))
    results.append(("Test 9: Delete Package", test_9_cleanup_delete_package()))
    results.append(("Test 10: Verify Package Deleted", test_10_verify_package_deleted()))
    results.append(("Test 11: Verify Client Balance", test_11_verify_client_balance()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✅ ALL TESTS PASSED")
    else:
        print("\n❌ SOME TESTS FAILED")
        print("\nFailed tests:")
        for name, result in results:
            if not result:
                print(f"  - {name}")
    
    print("=" * 80)

if __name__ == "__main__":
    main()
