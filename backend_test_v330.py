#!/usr/bin/env python3
"""
v3.30 Meraaj Contract Alignment Test
Independent verification of v3.30 Meraaj contract alignment in Rahaal
"""

import requests
import json
import time
import sys
import subprocess
from datetime import datetime

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
LOGIN_EMAIL = "owner@demo.com"
LOGIN_PASSWORD = "Demo@2025"
MOCK_LOG_PATH = "/app/memory/meraaj_network/meraaj_mock.log"
MOCK_STORE_PATH = "/app/memory/meraaj_network/meraaj_mock_store.json"
PROTECTED_PACKAGE_ID = "585b9e89-a36e-4323-a3d3-52d73d3ffe3b"

# Test state
session = requests.Session()
test_packages = []  # Track all test packages for cleanup
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

def get_mock_store():
    """Read mock store JSON"""
    try:
        with open(MOCK_STORE_PATH, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading mock store: {e}")
        return {}

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

def get_webhook_calls_for_package(package_id):
    """Get all webhook calls for a package"""
    entries = get_mock_log_entries()
    calls = [
        e for e in entries 
        if e.get("url") == "/api/integrations/rahal/webhooks" 
        and isinstance(e.get("body"), dict)
        and e["body"].get("data", {}).get("package_ref") == package_id
    ]
    return calls

def create_test_package(name_suffix):
    """Create a test package and track it"""
    package_data = {
        "name": f"BTA-v330-{name_suffix}",
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
        "notes": f"Test package for v3.30 contract alignment - {name_suffix}"
    }
    
    r = session.post(f"{BASE_URL}/packages", json=package_data)
    if r.status_code == 200:
        pkg = r.json()
        pkg_id = pkg.get("id")
        test_packages.append(pkg_id)
        return pkg_id, pkg
    return None, None

def main():
    print("=" * 80)
    print("v3.30 MERAAJ CONTRACT ALIGNMENT TEST")
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
    
    # ========== SCENARIO 1: First Share = REST API ==========
    print("SCENARIO 1: First Share = REST API (NO package.shared event)")
    print("-" * 80)
    
    pkg1_id, pkg1 = create_test_package("FIRST-SHARE")
    if not pkg1_id:
        log_test("Create package for scenario 1", False, "Failed to create package")
        return False
    log_test("Create package for scenario 1", True, f"ID: {pkg1_id}")
    
    # Count REST calls before share
    before_count, _ = count_share_calls_for_package(pkg1_id)
    
    # First share
    share_data = {
        "enabled": True,
        "buyer_commission_mode": "amount",
        "buyer_commission_value": 100,
        "commission_direction": "added",
        "seats_allocated": 10
    }
    
    r = session.post(f"{BASE_URL}/packages/{pkg1_id}/meraaj-share", json=share_data)
    log_test("First share returns 200", r.status_code == 200, f"Status: {r.status_code}")
    
    if r.status_code == 200:
        share_response = r.json()
        log_test("Response has registered_via='rest_api'", 
                share_response.get("registered_via") == "rest_api",
                f"Value: {share_response.get('registered_via')}")
        
        time.sleep(0.5)
        
        # Check REST API call
        after_count, calls = count_share_calls_for_package(pkg1_id)
        log_test("Mock received EXACTLY ONE REST call", 
                after_count == before_count + 1,
                f"Count: {after_count}")
        
        if calls:
            call = calls[-1]  # Get the latest call
            headers = call.get("headers", {})
            body = call.get("body", {})
            
            # Check X-Rahal-Api-Key header
            log_test("REST call has X-Rahal-Api-Key header", 
                    bool(headers.get("x-rahal-api-key")),
                    f"Present: {bool(headers.get('x-rahal-api-key'))}")
            
            # Check contract fields
            required_fields = ["package_ref", "title", "description", "departure_date", 
                             "return_date", "pricing"]
            missing = [f for f in required_fields if f not in body]
            log_test("REST call has all contract fields", 
                    len(missing) == 0,
                    f"Missing: {missing}" if missing else "All present")
            
            # Check pricing fields
            pricing = body.get("pricing", {})
            pricing_fields = ["net_cost_per_seat", "final_sale_price", 
                            "buyer_office_commission", "currency"]
            missing_pricing = [f for f in pricing_fields if f not in pricing]
            log_test("Pricing has all required fields", 
                    len(missing_pricing) == 0,
                    f"Pricing: {pricing}")
        
        # Check NO package.shared event exists
        r = session.get(f"{BASE_URL}/meraaj/events")
        if r.status_code == 200:
            events = r.json()
            shared_events = [
                e for e in events 
                if e.get("type") == "package.shared" 
                and e.get("payload", {}).get("package_ref") == pkg1_id
            ]
            log_test("NO 'package.shared' event exists", 
                    len(shared_events) == 0,
                    f"Found: {len(shared_events)}")
    
    print()
    
    # ========== SCENARIO 2: Webhook Auth Contract ==========
    print("SCENARIO 2: Webhook Auth Contract (X-Rahal-Signature ONLY)")
    print("-" * 80)
    
    # PATCH package to trigger package.updated webhook
    patch_data = {
        "name": "BTA-v330-FIRST-SHARE-RENAMED",
        "notes": "Updated notes for webhook test"
    }
    
    r = session.patch(f"{BASE_URL}/packages/{pkg1_id}", json=patch_data)
    log_test("PATCH package returns 200", r.status_code == 200, f"Status: {r.status_code}")
    
    time.sleep(0.5)
    
    # Check webhook calls
    webhook_calls = get_webhook_calls_for_package(pkg1_id)
    package_updated_calls = [c for c in webhook_calls if c.get("body", {}).get("type") == "package.updated"]
    
    log_test("package.updated webhook sent", 
            len(package_updated_calls) > 0,
            f"Found: {len(package_updated_calls)}")
    
    if package_updated_calls:
        latest_call = package_updated_calls[-1]
        headers = latest_call.get("headers", {})
        
        # Check ONLY X-Rahal-Signature header (not legacy headers)
        log_test("Webhook has X-Rahal-Signature header", 
                bool(headers.get("x-rahal-signature")),
                f"Present: {bool(headers.get('x-rahal-signature'))}")
        
        log_test("Webhook signature is valid", 
                latest_call.get("signature_valid") == True,
                f"Valid: {latest_call.get('signature_valid')}")
        
        # Check forbidden legacy headers are NULL
        log_test("Legacy x-rahaal-signature is NULL", 
                headers.get("x-rahaal-signature") is None,
                f"Value: {headers.get('x-rahaal-signature')}")
        
        log_test("Legacy x-rahaal-timestamp is NULL", 
                headers.get("x-rahaal-timestamp") is None,
                f"Value: {headers.get('x-rahaal-timestamp')}")
    
    print()
    
    # ========== SCENARIO 3: Contract Field Names ==========
    print("SCENARIO 3: Contract Field Names (title, description, departure_date, return_date)")
    print("-" * 80)
    
    if package_updated_calls:
        latest_call = package_updated_calls[-1]
        data = latest_call.get("body", {}).get("data", {})
        
        # Check contract field names (NOT name/notes/start_date/end_date)
        log_test("Webhook data has 'title' (not 'name')", 
                "title" in data and "name" not in data,
                f"title present: {'title' in data}, name present: {'name' in data}")
        
        log_test("Webhook data has 'description' (not 'notes')", 
                "description" in data and "notes" not in data,
                f"description present: {'description' in data}, notes present: {'notes' in data}")
        
        log_test("Webhook data has 'departure_date' (not 'start_date')", 
                "departure_date" in data and "start_date" not in data,
                f"departure_date present: {'departure_date' in data}, start_date present: {'start_date' in data}")
        
        log_test("Webhook data has 'return_date' (not 'end_date')", 
                "return_date" in data and "end_date" not in data,
                f"return_date present: {'return_date' in data}, end_date present: {'end_date' in data}")
        
        # Check pricing field names
        pricing = data.get("pricing", {})
        log_test("Pricing has correct field names", 
                "net_cost_per_seat" in pricing and 
                "final_sale_price" in pricing and 
                "buyer_office_commission" in pricing,
                f"Pricing keys: {list(pricing.keys())}")
    
    # Verify mock store reflects the renamed title
    time.sleep(0.5)
    store = get_mock_store()
    if pkg1_id in store:
        store_entry = store[pkg1_id]
        log_test("Mock store reflects renamed title", 
                store_entry.get("title") == "BTA-v330-FIRST-SHARE-RENAMED",
                f"Store title: {store_entry.get('title')}")
        
        log_test("Mock store has updated description", 
                store_entry.get("description") == "Updated notes for webhook test",
                f"Store description: {store_entry.get('description')}")
    
    print()
    
    # ========== SCENARIO 4: Deletion ==========
    print("SCENARIO 4: Deletion (package.deactivated event, reason='deleted_by_office')")
    print("-" * 80)
    
    # Create and share a new package for deletion test
    pkg2_id, pkg2 = create_test_package("DELETE-TEST")
    if not pkg2_id:
        log_test("Create package for deletion test", False, "Failed to create package")
    else:
        log_test("Create package for deletion test", True, f"ID: {pkg2_id}")
        
        # Share it
        r = session.post(f"{BASE_URL}/packages/{pkg2_id}/meraaj-share", json=share_data)
        log_test("Share package for deletion", r.status_code == 200)
        
        time.sleep(0.5)
        
        # Delete the package
        r = session.delete(f"{BASE_URL}/packages/{pkg2_id}")
        log_test("DELETE package returns 200", r.status_code == 200, f"Status: {r.status_code}")
        
        time.sleep(0.5)
        
        # Check for package.deactivated event
        r = session.get(f"{BASE_URL}/meraaj/events")
        if r.status_code == 200:
            events = r.json()
            deactivated_events = [
                e for e in events 
                if e.get("type") == "package.deactivated" 
                and e.get("payload", {}).get("package_ref") == pkg2_id
            ]
            
            log_test("package.deactivated event exists", 
                    len(deactivated_events) > 0,
                    f"Found: {len(deactivated_events)}")
            
            if deactivated_events:
                event = deactivated_events[-1]
                log_test("Event status = 'sent'", 
                        event.get("status") == "sent",
                        f"Status: {event.get('status')}")
                
                log_test("Event reason = 'deleted_by_office'", 
                        event.get("payload", {}).get("reason") == "deleted_by_office",
                        f"Reason: {event.get('payload', {}).get('reason')}")
        
        # Check mock store entry is unlisted
        store = get_mock_store()
        if pkg2_id in store:
            store_entry = store[pkg2_id]
            log_test("Mock store entry listed=false", 
                    store_entry.get("listed") == False,
                    f"listed: {store_entry.get('listed')}")
        
        # Verify package removed locally
        r = session.get(f"{BASE_URL}/packages")
        if r.status_code == 200:
            packages = r.json()
            pkg_exists = any(p.get("id") == pkg2_id for p in packages)
            log_test("Package removed locally", 
                    not pkg_exists,
                    f"Exists: {pkg_exists}")
        
        # Remove from test_packages since it's already deleted
        if pkg2_id in test_packages:
            test_packages.remove(pkg2_id)
    
    print()
    
    # ========== SCENARIO 5: Failure/No Duplicates ==========
    print("SCENARIO 5: Failure/No Duplicates (502 on mock down, no duplicate calls)")
    print("-" * 80)
    
    # Create a fresh package
    pkg3_id, pkg3 = create_test_package("RETRY-TEST")
    if not pkg3_id:
        log_test("Create package for retry test", False, "Failed to create package")
    else:
        log_test("Create package for retry test", True, f"ID: {pkg3_id}")
        
        # Kill the mock
        try:
            subprocess.run(["pkill", "-f", "meraaj_mock.js"], check=False)
            time.sleep(1)
            log_test("Mock server killed", True)
        except Exception as e:
            log_test("Mock server killed", False, f"Exception: {e}")
        
        # Try to share (should fail with 502)
        r = session.post(f"{BASE_URL}/packages/{pkg3_id}/meraaj-share", json=share_data)
        log_test("Share with mock down returns 502", 
                r.status_code == 502,
                f"Status: {r.status_code}")
        
        # Verify package stays unshared
        r = session.get(f"{BASE_URL}/packages")
        if r.status_code == 200:
            packages = r.json()
            pkg = next((p for p in packages if p.get("id") == pkg3_id), None)
            if pkg:
                is_shared = pkg.get("meraaj", {}).get("shared", False)
                log_test("Package stays unshared after failure", 
                        not is_shared,
                        f"shared: {is_shared}")
        
        # Restart mock
        try:
            subprocess.Popen(
                ["nohup", "node", "/app/memory/meraaj_network/meraaj_mock.js"],
                stdout=open("/app/memory/meraaj_network/mock_server.out", "a"),
                stderr=subprocess.STDOUT,
                env={"MERAAJ_SHARED_SECRET": "fadaef8475135533dc526493bf3b87f4bad43682a95f5c2c136d7976cd126531"}
            )
            time.sleep(2)
            log_test("Mock server restarted", True)
        except Exception as e:
            log_test("Mock server restarted", False, f"Exception: {e}")
        
        # Count calls before retry
        before_retry_count, _ = count_share_calls_for_package(pkg3_id)
        
        # Share again (should succeed)
        r = session.post(f"{BASE_URL}/packages/{pkg3_id}/meraaj-share", json=share_data)
        log_test("Share after mock restart returns 200", 
                r.status_code == 200,
                f"Status: {r.status_code}")
        
        time.sleep(0.5)
        
        # Verify exactly ONE call in mock log
        after_retry_count, _ = count_share_calls_for_package(pkg3_id)
        log_test("Mock log has exactly ONE call for this package", 
                after_retry_count == 1,
                f"Count: {after_retry_count}")
    
    print()
    
    # ========== SCENARIO 6: Regression Sanity ==========
    print("SCENARIO 6: Regression Sanity Checks")
    print("-" * 80)
    
    try:
        r = session.get(f"{BASE_URL}/packages")
        log_test("GET /api/packages returns 200", r.status_code == 200)
        
        r = session.get(f"{BASE_URL}/meraaj/events")
        log_test("GET /api/meraaj/events returns 200", r.status_code == 200)
        
        r = session.get(f"{BASE_URL}/whatsapp-logs")
        log_test("GET /api/whatsapp-logs returns 200", r.status_code == 200)
        
        # POST /api/packages
        test_pkg_data = {
            "name": "BTA-v330-SANITY-CHECK",
            "package_type": "umrah",
            "currency": "SAR",
            "pricing_mode": "direct",
            "start_date": "2026-12-01",
            "end_date": "2026-12-15"
        }
        r = session.post(f"{BASE_URL}/packages", json=test_pkg_data)
        log_test("POST /api/packages returns 200", r.status_code == 200)
        
        if r.status_code == 200:
            sanity_pkg_id = r.json().get("id")
            test_packages.append(sanity_pkg_id)
    except Exception as e:
        log_test("Regression sanity checks", False, f"Exception: {e}")
    
    print()
    
    # ========== VERIFY PROTECTED PACKAGE ==========
    print("VERIFICATION: Protected Package Not Touched")
    print("-" * 80)
    
    try:
        r = session.get(f"{BASE_URL}/packages")
        if r.status_code == 200:
            packages = r.json()
            protected_pkg = next((p for p in packages if p.get("id") == PROTECTED_PACKAGE_ID), None)
            if protected_pkg:
                is_shared = protected_pkg.get("meraaj", {}).get("shared", False)
                log_test(f"Protected package {PROTECTED_PACKAGE_ID} still shared", 
                        is_shared,
                        f"shared: {is_shared}")
            else:
                log_test(f"Protected package {PROTECTED_PACKAGE_ID} exists", 
                        False,
                        "Package not found")
    except Exception as e:
        print(f"   ⚠ Could not verify protected package: {e}")
    
    print()
    
    # ========== CLEANUP ==========
    print("CLEANUP: Unshare and Archive Test Packages")
    print("-" * 80)
    
    for pkg_id in test_packages:
        try:
            # Unshare
            r = session.post(f"{BASE_URL}/packages/{pkg_id}/meraaj-share", json={"enabled": False})
            if r.status_code == 200:
                print(f"   ✓ Unshared package {pkg_id}")
            
            time.sleep(0.3)
            
            # Soft archive
            r = session.post(f"{BASE_URL}/packages/{pkg_id}/archive", json={"archived": True})
            if r.status_code == 200:
                print(f"   ✓ Archived package {pkg_id}")
        except Exception as e:
            print(f"   ⚠ Cleanup failed for {pkg_id}: {e}")
    
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
