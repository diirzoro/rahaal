#!/usr/bin/env python3
"""
v3.29 Meraaj Package-Share Integration Test
Tests the NEW REST API integration for first-time package sharing
"""

import requests
import json
import time
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
LOGIN_EMAIL = "owner@demo.com"
LOGIN_PASSWORD = "Demo@2025"
MOCK_LOG_PATH = "/app/memory/meraaj_network/meraaj_mock.log"

# Test state
session = requests.Session()
test_package_id = None
test_results = []

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status} | {test_name}"
    if details:
        result += f" | {details}"
    print(result)
    test_results.append({"name": test_name, "passed": passed, "details": details})
    return passed

def get_mock_log_entries():
    """Read and parse mock log file"""
    try:
        with open(MOCK_LOG_PATH, 'r') as f:
            lines = [json.loads(line.strip()) for line in f if line.strip()]
        return lines
    except Exception as e:
        print(f"Error reading mock log: {e}")
        return []

def count_share_calls_for_package(package_id):
    """Count how many times the mock received a share call for this package"""
    entries = get_mock_log_entries()
    calls = [
        e for e in entries 
        if e.get("url") == "/api/integrations/rahal/packages/share" 
        and isinstance(e.get("body"), dict)
        and e["body"].get("package_ref") == package_id
    ]
    return len(calls), calls

def main():
    global test_package_id
    
    print("=" * 80)
    print("v3.29 MERAAJ PACKAGE-SHARE INTEGRATION TEST")
    print("=" * 80)
    print()
    
    # ========== STEP 1: Login ==========
    print("STEP 1: Authentication")
    print("-" * 80)
    try:
        r = session.post(f"{BASE_URL}/auth/login", json={
            "email": LOGIN_EMAIL,
            "password": LOGIN_PASSWORD
        })
        log_test("Login successful", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code != 200:
            print(f"Login failed: {r.text}")
            return False
    except Exception as e:
        log_test("Login successful", False, f"Exception: {e}")
        return False
    
    print()
    
    # ========== STEP 2: Create Test Package ==========
    print("STEP 2: Create Test Package")
    print("-" * 80)
    try:
        package_data = {
            "name": "BTAGENT-v329-MERAAJ-SHARE-TEST",
            "package_type": "umrah",
            "currency": "SAR",
            "pricing_mode": "direct",
            "room_pricing": [
                {
                    "type": "رباعية",
                    "sale_per_pax": 2000,
                    "cost_per_pax": 1500,
                    "sale_child": 1000,
                    "sale_infant": 100
                }
            ],
            "start_date": "2026-12-01",
            "end_date": "2026-12-15",
            "notes": "Test package for v3.29 Meraaj integration testing"
        }
        
        r = session.post(f"{BASE_URL}/packages", json=package_data)
        log_test("Package created", r.status_code == 200, f"Status: {r.status_code}")
        
        if r.status_code == 200:
            pkg = r.json()
            test_package_id = pkg.get("id")
            log_test("Package ID retrieved", bool(test_package_id), f"ID: {test_package_id}")
            print(f"   Package ID: {test_package_id}")
        else:
            print(f"Package creation failed: {r.text}")
            return False
    except Exception as e:
        log_test("Package created", False, f"Exception: {e}")
        return False
    
    print()
    
    # ========== STEP 3: First Share (REST API Call) ==========
    print("STEP 3: First Share - Should Call Meraaj REST API")
    print("-" * 80)
    
    # Record mock log count before share
    initial_count, _ = count_share_calls_for_package(test_package_id)
    print(f"   Mock log calls before share: {initial_count}")
    
    try:
        share_data = {
            "enabled": True,
            "buyer_commission_mode": "amount",
            "buyer_commission_value": 100,
            "commission_direction": "added",
            "seats_allocated": 8
        }
        
        r = session.post(f"{BASE_URL}/packages/{test_package_id}/meraaj-share", json=share_data)
        log_test("First share returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        if r.status_code == 200:
            share_response = r.json()
            
            # Check response fields
            log_test("Response has 'registered_via' field", 
                    "registered_via" in share_response,
                    f"Value: {share_response.get('registered_via')}")
            
            log_test("registered_via = 'rest_api'", 
                    share_response.get("registered_via") == "rest_api")
            
            meraaj_data = share_response.get("meraaj", {})
            log_test("Response has meraaj.remote_id", 
                    bool(meraaj_data.get("remote_id")),
                    f"remote_id: {meraaj_data.get('remote_id')}")
            
            log_test("Response has meraaj.registered_at", 
                    bool(meraaj_data.get("registered_at")))
            
            # Wait for mock to process
            time.sleep(0.5)
            
            # Check mock log
            after_count, calls = count_share_calls_for_package(test_package_id)
            print(f"   Mock log calls after share: {after_count}")
            
            log_test("Mock received EXACTLY ONE call", 
                    after_count == 1,
                    f"Count: {after_count}")
            
            if calls:
                call = calls[0]
                body = call.get("body", {})
                headers = call.get("headers", {})
                
                # Check header
                log_test("X-Rahal-Api-Key header present", 
                        bool(headers.get("x-rahal-api-key")))
                
                # Check all required contract fields
                required_fields = [
                    "package_ref", "title", "description", "departure_date", 
                    "return_date", "departure_city", "transport", "hotels", 
                    "images", "available_seats", "office_ref", "office_name", 
                    "owner_name", "pricing"
                ]
                
                missing_fields = [f for f in required_fields if f not in body]
                log_test("All contract fields present", 
                        len(missing_fields) == 0,
                        f"Missing: {missing_fields}" if missing_fields else "All present")
                
                # Check pricing sub-fields
                pricing = body.get("pricing", {})
                pricing_fields = ["net_cost_per_seat", "final_sale_price", 
                                "buyer_office_commission", "currency"]
                missing_pricing = [f for f in pricing_fields if f not in pricing]
                log_test("All pricing fields present", 
                        len(missing_pricing) == 0,
                        f"Pricing: {pricing}")
                
                # Check pricing values (commission added: 2000 + 100 = 2100)
                log_test("Pricing values correct", 
                        pricing.get("net_cost_per_seat") == 2000 and
                        pricing.get("final_sale_price") == 2100 and
                        pricing.get("buyer_office_commission") == 100 and
                        pricing.get("currency") == "SAR",
                        f"net={pricing.get('net_cost_per_seat')}, final={pricing.get('final_sale_price')}, commission={pricing.get('buyer_office_commission')}")
                
                log_test("Available seats = 8", 
                        body.get("available_seats") == 8)
        else:
            print(f"First share failed: {r.text}")
            return False
    except Exception as e:
        log_test("First share", False, f"Exception: {e}")
        return False
    
    print()
    
    # ========== STEP 4: Check Events - NO package.shared, ONE package.share_api ==========
    print("STEP 4: Verify Events - NO 'package.shared', ONE 'package.share_api'")
    print("-" * 80)
    try:
        r = session.get(f"{BASE_URL}/meraaj/events")
        log_test("GET /api/meraaj/events returns 200", r.status_code == 200)
        
        if r.status_code == 200:
            events = r.json()
            
            # Check for package.shared events (should be NONE)
            shared_events = [
                e for e in events 
                if e.get("type") == "package.shared" 
                and e.get("payload", {}).get("package_ref") == test_package_id
            ]
            log_test("NO 'package.shared' event exists", 
                    len(shared_events) == 0,
                    f"Found: {len(shared_events)}")
            
            # Check for package.share_api audit entry (should be ONE)
            api_logs = [
                e for e in events 
                if e.get("type") == "package.share_api" 
                and e.get("payload", {}).get("package_ref") == test_package_id
            ]
            log_test("ONE 'package.share_api' audit entry exists", 
                    len(api_logs) == 1,
                    f"Found: {len(api_logs)}")
            
            if api_logs:
                log_test("Audit entry status = 'sent'", 
                        api_logs[0].get("status") == "sent",
                        f"Status: {api_logs[0].get('status')}")
    except Exception as e:
        log_test("Check events", False, f"Exception: {e}")
    
    print()
    
    # ========== STEP 5: Re-share (Update) - Should emit package.updated, NO new REST call ==========
    print("STEP 5: Re-share (Update) - Should emit 'package.updated', NO duplicate REST call")
    print("-" * 80)
    
    before_reshare_count, _ = count_share_calls_for_package(test_package_id)
    print(f"   Mock log calls before re-share: {before_reshare_count}")
    
    try:
        reshare_data = {
            "enabled": True,
            "buyer_commission_mode": "amount",
            "buyer_commission_value": 150,  # Changed from 100
            "commission_direction": "added",
            "seats_allocated": 9  # Changed from 8
        }
        
        r = session.post(f"{BASE_URL}/packages/{test_package_id}/meraaj-share", json=reshare_data)
        log_test("Re-share returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        time.sleep(0.5)
        
        # Check mock log - should still be only ONE call
        after_reshare_count, _ = count_share_calls_for_package(test_package_id)
        print(f"   Mock log calls after re-share: {after_reshare_count}")
        
        log_test("Mock log still has ONLY ONE call (no duplicate)", 
                after_reshare_count == 1,
                f"Count: {after_reshare_count}")
        
        # Check for package.updated event
        r = session.get(f"{BASE_URL}/meraaj/events")
        if r.status_code == 200:
            events = r.json()
            updated_events = [
                e for e in events 
                if e.get("type") == "package.updated" 
                and e.get("payload", {}).get("package_ref") == test_package_id
            ]
            log_test("'package.updated' event exists after re-share", 
                    len(updated_events) >= 1,
                    f"Found: {len(updated_events)}")
    except Exception as e:
        log_test("Re-share", False, f"Exception: {e}")
    
    print()
    
    # ========== STEP 6: REGRESSION - Unshare ==========
    print("STEP 6: REGRESSION - Unshare Package")
    print("-" * 80)
    try:
        unshare_data = {"enabled": False}
        r = session.post(f"{BASE_URL}/packages/{test_package_id}/meraaj-share", json=unshare_data)
        log_test("Unshare returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        time.sleep(0.5)
        
        # Check for package.deactivated event
        r = session.get(f"{BASE_URL}/meraaj/events")
        if r.status_code == 200:
            events = r.json()
            deactivated_events = [
                e for e in events 
                if e.get("type") == "package.deactivated" 
                and e.get("payload", {}).get("package_ref") == test_package_id
            ]
            log_test("'package.deactivated' event exists after unshare", 
                    len(deactivated_events) >= 1,
                    f"Found: {len(deactivated_events)}")
    except Exception as e:
        log_test("Unshare", False, f"Exception: {e}")
    
    print()
    
    # ========== STEP 7: REGRESSION - Quick Sanity Checks ==========
    print("STEP 7: REGRESSION - Quick Sanity Checks")
    print("-" * 80)
    try:
        # GET /api/packages
        r = session.get(f"{BASE_URL}/packages")
        log_test("GET /api/packages returns 200", r.status_code == 200)
        
        # GET /api/meraaj/inbound-bookings
        r = session.get(f"{BASE_URL}/meraaj/inbound-bookings")
        log_test("GET /api/meraaj/inbound-bookings returns 200", r.status_code == 200)
        
        # GET /api/whatsapp-logs
        r = session.get(f"{BASE_URL}/whatsapp-logs")
        log_test("GET /api/whatsapp-logs returns 200", r.status_code == 200)
    except Exception as e:
        log_test("Regression checks", False, f"Exception: {e}")
    
    print()
    
    # ========== STEP 8: CLEANUP - Soft Archive ==========
    print("STEP 8: CLEANUP - Soft Archive Test Package")
    print("-" * 80)
    try:
        # First verify package is unshared (already done in step 6)
        r = session.get(f"{BASE_URL}/packages")
        if r.status_code == 200:
            packages = r.json()
            test_pkg = next((p for p in packages if p.get("id") == test_package_id), None)
            if test_pkg:
                is_shared = test_pkg.get("meraaj", {}).get("shared", False)
                log_test("Package is unshared before archive", 
                        not is_shared,
                        f"shared={is_shared}")
        
        # Soft archive the package
        r = session.post(f"{BASE_URL}/packages/{test_package_id}/archive", json={"archived": True})
        log_test("Soft archive returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        if r.status_code == 200:
            print(f"   ✓ Test package {test_package_id} archived successfully")
        else:
            print(f"   ⚠ Archive failed: {r.text}")
    except Exception as e:
        log_test("Soft archive", False, f"Exception: {e}")
    
    print()
    
    # ========== VERIFY EXISTING PACKAGE NOT TOUCHED ==========
    print("VERIFICATION: Existing Package 585b9e89-a36e-4323-a3d3-52d73d3ffe3b Still Shared")
    print("-" * 80)
    try:
        existing_pkg_id = "585b9e89-a36e-4323-a3d3-52d73d3ffe3b"
        r = session.get(f"{BASE_URL}/packages")
        if r.status_code == 200:
            packages = r.json()
            existing_pkg = next((p for p in packages if p.get("id") == existing_pkg_id), None)
            if existing_pkg:
                is_shared = existing_pkg.get("meraaj", {}).get("shared", False)
                log_test(f"Existing package {existing_pkg_id} still shared", 
                        is_shared,
                        f"shared={is_shared}")
            else:
                print(f"   ⚠ Existing package {existing_pkg_id} not found")
    except Exception as e:
        print(f"   ⚠ Could not verify existing package: {e}")
    
    print()
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for t in test_results if t["passed"])
    total = len(test_results)
    
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    if passed == total:
        print("\n✅ ALL TESTS PASSED")
        return True
    else:
        print("\n❌ SOME TESTS FAILED")
        print("\nFailed tests:")
        for t in test_results:
            if not t["passed"]:
                print(f"  - {t['name']}: {t['details']}")
        return False

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
