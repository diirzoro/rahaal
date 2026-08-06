#!/usr/bin/env python3
"""
Rahaal ERP v3.9.20 Backend Test Suite
Tests:
1. GET /api/backup/export - Full tenant data backup (Owner+ only)
2. DELETE /api/packages/{pkgId}/bookings/{bookingId} - Delete package booking + reverse balances
3. Regression checks (health, tickets, signup, topup, reset-password)
"""

import requests
import json
import os
from datetime import datetime, timedelta

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://visa-booking-5.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials
SUPER_ADMIN = {"email": "admin@targetmedia.com", "password": "Target@2025"}
DEMO_OWNER = {"email": "owner@demo.com", "password": "Demo@2025"}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def login(credentials):
    """Login and return session cookie"""
    resp = requests.post(f"{API_BASE}/auth/login", json=credentials, timeout=10)
    if resp.status_code == 200:
        return resp.cookies.get('rahaal_session')
    return None

def test_backup_export():
    """Test GET /api/backup/export - Full tenant data backup"""
    log("\n========== TEST 1: GET /api/backup/export - Full Tenant Data Backup ==========")
    
    results = []
    
    # Test 1.1: Owner can export backup
    log("\n[1.1] Owner exports backup...")
    try:
        session = login(DEMO_OWNER)
        if not session:
            log("❌ FAIL - Could not login as owner")
            return [("Owner login", False, 0, "Login failed")]
        
        resp = requests.get(f"{API_BASE}/backup/export", 
                           cookies={'rahaal_session': session}, 
                           timeout=30)
        log(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            # Check Content-Type header
            content_type = resp.headers.get('Content-Type', '')
            log(f"Content-Type: {content_type}")
            
            # Check Content-Disposition header
            content_disp = resp.headers.get('Content-Disposition', '')
            log(f"Content-Disposition: {content_disp}")
            
            # Parse JSON body
            try:
                data = resp.json()
                log(f"Backup keys: {list(data.keys())}")
                log(f"Version: {data.get('version')}")
                log(f"Tenant ID: {data.get('tenant_id')}")
                log(f"Exported by: {data.get('exported_by')}")
                log(f"Data collections: {list(data.get('data', {}).keys())}")
                
                # Verify structure
                checks = []
                checks.append(('Content-Type', 'application/json' in content_type))
                checks.append(('Content-Disposition', 'attachment' in content_disp and '.json' in content_disp))
                checks.append(('version', data.get('version') == '3.9.20'))
                checks.append(('tenant_id', data.get('tenant_id') is not None))
                checks.append(('tenant_name', data.get('tenant_name') is not None))
                checks.append(('exported_at', data.get('exported_at') is not None))
                checks.append(('exported_by', data.get('exported_by') == DEMO_OWNER['email']))
                checks.append(('data object', isinstance(data.get('data'), dict)))
                
                # Check all 13 collections
                expected_collections = ['tickets', 'visas', 'services', 'clients', 'suppliers', 
                                       'boxes', 'journal_entries', 'packages', 'package_bookings', 
                                       'currency_exchanges', 'vouchers', 'accounts', 'service_types']
                data_obj = data.get('data', {})
                for coll in expected_collections:
                    checks.append((f'collection: {coll}', coll in data_obj))
                
                all_passed = all(check[1] for check in checks)
                
                if all_passed:
                    log("✅ PASS - Backup export successful with all required fields and collections")
                    results.append(("Owner backup export", True, 200, f"All {len(expected_collections)} collections present"))
                else:
                    failed = [c[0] for c in checks if not c[1]]
                    log(f"❌ FAIL - Missing or incorrect: {failed}")
                    results.append(("Owner backup export", False, 200, f"Failed checks: {failed}"))
                
            except json.JSONDecodeError as e:
                log(f"❌ FAIL - Invalid JSON response: {e}")
                results.append(("Owner backup export", False, 200, f"Invalid JSON: {e}"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text[:200]}")
            results.append(("Owner backup export", False, resp.status_code, resp.text[:100]))
            
    except Exception as e:
        log(f"❌ FAIL - Exception: {e}")
        results.append(("Owner backup export", False, 0, str(e)))
    
    # Test 1.2: Non-owner (staff) cannot export backup
    log("\n[1.2] Non-owner (staff) tries to export backup...")
    try:
        # First create a staff user if not exists
        session = login(DEMO_OWNER)
        staff_email = "staff-test@demo.com"
        staff_password = "Staff@2025"
        
        # Try to create staff user (may already exist)
        requests.post(f"{API_BASE}/tenant/users", 
                     json={"email": staff_email, "name": "Staff Test", "password": staff_password, "role": "staff"},
                     cookies={'rahaal_session': session}, 
                     timeout=10)
        
        # Login as staff
        staff_session = login({"email": staff_email, "password": staff_password})
        if staff_session:
            resp = requests.get(f"{API_BASE}/backup/export", 
                               cookies={'rahaal_session': staff_session}, 
                               timeout=10)
            log(f"Status: {resp.status_code}")
            log(f"Response: {resp.text[:200]}")
            
            if resp.status_code == 403:
                data = resp.json()
                if "غير مصرح" in data.get("error", "") and "مالك" in data.get("error", ""):
                    log("✅ PASS - Staff correctly denied with 403 and Arabic error")
                    results.append(("Staff backup denied", True, 403, data.get("error")))
                else:
                    log(f"❌ FAIL - Wrong error message: {data.get('error')}")
                    results.append(("Staff backup denied", False, 403, data.get("error")))
            else:
                log(f"❌ FAIL - Expected 403, got {resp.status_code}")
                results.append(("Staff backup denied", False, resp.status_code, resp.text[:100]))
        else:
            log("⚠️ SKIP - Could not login as staff user")
            results.append(("Staff backup denied", None, 0, "Staff login failed"))
            
    except Exception as e:
        log(f"❌ FAIL - Exception: {e}")
        results.append(("Staff backup denied", False, 0, str(e)))
    
    return results

def test_package_booking_delete():
    """Test DELETE /api/packages/{pkgId}/bookings/{bookingId} - Delete package booking + reverse balances"""
    log("\n========== TEST 2: DELETE /api/packages/{pkgId}/bookings/{bookingId} - Delete Package Booking ==========")
    
    results = []
    
    try:
        session = login(DEMO_OWNER)
        if not session:
            log("❌ FAIL - Could not login as owner")
            return [("Owner login", False, 0, "Login failed")]
        
        cookies = {'rahaal_session': session}
        
        # Setup: Get initial state
        log("\n[Setup] Getting initial state...")
        
        # Get auth/me for initial quota
        me_resp = requests.get(f"{API_BASE}/auth/me", cookies=cookies, timeout=10)
        initial_quota = me_resp.json().get('tenant', {}).get('journal_quota', {}).get('used', 0)
        log(f"Initial quota used: {initial_quota}")
        
        # Create or get a client
        log("\n[Setup] Creating/getting client...")
        clients_resp = requests.get(f"{API_BASE}/clients", cookies=cookies, timeout=10)
        clients = clients_resp.json()
        
        if len(clients) > 0:
            client = clients[0]
            client_id = client['id']
            log(f"Using existing client: {client_id}")
        else:
            # Create new client
            client_resp = requests.post(f"{API_BASE}/clients", 
                                       json={"name": "عميل تجريبي حذف", "phone": "+967771234567"},
                                       cookies=cookies, timeout=10)
            client = client_resp.json()
            client_id = client['id']
            log(f"Created new client: {client_id}")
        
        # Get initial client balance
        clients_resp = requests.get(f"{API_BASE}/clients", cookies=cookies, timeout=10)
        clients = clients_resp.json()
        client_data = next((c for c in clients if c['id'] == client_id), None)
        initial_client_balance = client_data.get('balances', {}).get('USD', 0) if client_data else 0
        log(f"Initial client USD balance: {initial_client_balance}")
        
        # Create a package
        log("\n[Setup] Creating package...")
        pkg_resp = requests.post(f"{API_BASE}/packages", 
                                json={
                                    "name": "باكج تجريبي حذف",
                                    "package_type": "umrah",
                                    "currency": "USD",
                                    "start_date": "2026-09-01"
                                },
                                cookies=cookies, timeout=10)
        pkg = pkg_resp.json()
        pkg_id = pkg['id']
        log(f"Created package: {pkg_id}")
        
        # Get or create a supplier
        log("\n[Setup] Getting/creating supplier...")
        suppliers_resp = requests.get(f"{API_BASE}/suppliers", cookies=cookies, timeout=10)
        suppliers = suppliers_resp.json()
        
        if len(suppliers) > 0:
            supplier = suppliers[0]
            supplier_id = supplier['id']
            log(f"Using existing supplier: {supplier_id}")
        else:
            # Create new supplier
            supplier_resp = requests.post(f"{API_BASE}/suppliers", 
                                         json={"name": "مورد تجريبي", "phone": "+967771234568"},
                                         cookies=cookies, timeout=10)
            supplier = supplier_resp.json()
            supplier_id = supplier['id']
            log(f"Created new supplier: {supplier_id}")
        
        # Create a package component
        log("\n[Setup] Creating package component...")
        comp_resp = requests.post(f"{API_BASE}/packages/{pkg_id}/components", 
                                 json={
                                     "name": "تذكرة طيران",
                                     "supplier_id": supplier_id,
                                     "cost_per_pax": 100,
                                     "sale_per_pax": 200
                                 },
                                 cookies=cookies, timeout=10)
        
        if comp_resp.status_code != 200:
            log(f"❌ FAIL - Could not create component: {comp_resp.status_code} - {comp_resp.text[:200]}")
            return [("Create component", False, comp_resp.status_code, comp_resp.text[:100])]
        
        comp = comp_resp.json()
        log(f"Created component: {comp.get('id')}")
        
        # Create a booking
        log("\n[Setup] Creating booking...")
        booking_resp = requests.post(f"{API_BASE}/packages/{pkg_id}/bookings", 
                                    json={
                                        "pilgrim_name": "معتمر تجريبي",
                                        "client_id": client_id,
                                        "passport_no": "P123456",
                                        "payment_method": "credit",
                                        "pax_count": 1
                                    },
                                    cookies=cookies, timeout=10)
        
        if booking_resp.status_code != 200:
            log(f"❌ FAIL - Could not create booking: {booking_resp.status_code} - {booking_resp.text[:200]}")
            return [("Create booking", False, booking_resp.status_code, booking_resp.text[:100])]
        
        booking = booking_resp.json()
        booking_id = booking['id']
        commission = booking.get('commission', 0)
        log(f"Created booking: {booking_id}, commission: {commission}")
        
        # Verify package bookings_count = 1
        log("\n[Verify] Checking package bookings_count...")
        pkgs_resp = requests.get(f"{API_BASE}/packages", cookies=cookies, timeout=10)
        pkgs = pkgs_resp.json()
        pkg_data = next((p for p in pkgs if p['id'] == pkg_id), None)
        if pkg_data and pkg_data.get('bookings_count') == 1:
            log("✅ Package bookings_count = 1")
        else:
            log(f"⚠️ Package bookings_count = {pkg_data.get('bookings_count') if pkg_data else 'N/A'}")
        
        # Verify client balance increased by 200
        log("\n[Verify] Checking client balance...")
        clients_resp = requests.get(f"{API_BASE}/clients", cookies=cookies, timeout=10)
        clients = clients_resp.json()
        client_data = next((c for c in clients if c['id'] == client_id), None)
        current_client_balance = client_data.get('balances', {}).get('USD', 0) if client_data else 0
        expected_balance = initial_client_balance + 200
        log(f"Current client USD balance: {current_client_balance}, expected: {expected_balance}")
        
        if abs(current_client_balance - expected_balance) < 0.01:
            log("✅ Client balance increased by 200")
        else:
            log(f"⚠️ Client balance mismatch: {current_client_balance} vs {expected_balance}")
        
        # Verify journal entry exists
        log("\n[Verify] Checking journal entry...")
        je_resp = requests.get(f"{API_BASE}/journal-entries", cookies=cookies, timeout=10)
        jes = je_resp.json()
        je_exists = any(je.get('ref_type') == 'package_booking' and je.get('ref_id') == booking_id for je in jes)
        if je_exists:
            log("✅ Journal entry exists for booking")
        else:
            log("⚠️ Journal entry not found for booking")
        
        # Verify quota increased
        log("\n[Verify] Checking quota...")
        me_resp = requests.get(f"{API_BASE}/auth/me", cookies=cookies, timeout=10)
        current_quota = me_resp.json().get('tenant', {}).get('journal_quota', {}).get('used', 0)
        log(f"Current quota used: {current_quota}, initial: {initial_quota}")
        if current_quota == initial_quota + 1:
            log("✅ Quota increased by 1")
        else:
            log(f"⚠️ Quota mismatch: {current_quota} vs {initial_quota + 1}")
        
        # Test 2.1: Delete the booking
        log("\n[2.1] Deleting booking...")
        del_resp = requests.delete(f"{API_BASE}/packages/{pkg_id}/bookings/{booking_id}", 
                                   cookies=cookies, timeout=10)
        log(f"Status: {del_resp.status_code}")
        log(f"Response: {del_resp.text[:200]}")
        
        if del_resp.status_code == 200:
            data = del_resp.json()
            if data.get('success') and data.get('booking_id') == booking_id:
                log("✅ PASS - Delete returned success with booking_id")
                
                # Verify client balance reverted
                log("\n[Verify] Checking client balance after delete...")
                clients_resp = requests.get(f"{API_BASE}/clients", cookies=cookies, timeout=10)
                clients = clients_resp.json()
                client_data = next((c for c in clients if c['id'] == client_id), None)
                final_client_balance = client_data.get('balances', {}).get('USD', 0) if client_data else 0
                log(f"Final client USD balance: {final_client_balance}, expected: {initial_client_balance}")
                
                balance_reverted = abs(final_client_balance - initial_client_balance) < 0.01
                
                # Verify package bookings_count = 0
                log("\n[Verify] Checking package bookings_count after delete...")
                pkgs_resp = requests.get(f"{API_BASE}/packages", cookies=cookies, timeout=10)
                pkgs = pkgs_resp.json()
                pkg_data = next((p for p in pkgs if p['id'] == pkg_id), None)
                bookings_count_zero = pkg_data and pkg_data.get('bookings_count') == 0
                log(f"Package bookings_count: {pkg_data.get('bookings_count') if pkg_data else 'N/A'}")
                
                # Verify journal entry deleted
                log("\n[Verify] Checking journal entry after delete...")
                je_resp = requests.get(f"{API_BASE}/journal-entries", cookies=cookies, timeout=10)
                jes = je_resp.json()
                je_deleted = not any(je.get('ref_type') == 'package_booking' and je.get('ref_id') == booking_id for je in jes)
                log(f"Journal entry deleted: {je_deleted}")
                
                # Verify quota decreased
                log("\n[Verify] Checking quota after delete...")
                me_resp = requests.get(f"{API_BASE}/auth/me", cookies=cookies, timeout=10)
                final_quota = me_resp.json().get('tenant', {}).get('journal_quota', {}).get('used', 0)
                quota_reverted = final_quota == initial_quota
                log(f"Final quota used: {final_quota}, expected: {initial_quota}")
                
                if balance_reverted and bookings_count_zero and je_deleted and quota_reverted:
                    log("✅ PASS - All verifications passed: balance reverted, bookings_count=0, JE deleted, quota reverted")
                    results.append(("Delete booking with reversal", True, 200, "All balances and quota reverted"))
                else:
                    failed = []
                    if not balance_reverted: failed.append("balance")
                    if not bookings_count_zero: failed.append("bookings_count")
                    if not je_deleted: failed.append("journal_entry")
                    if not quota_reverted: failed.append("quota")
                    log(f"❌ FAIL - Some verifications failed: {failed}")
                    results.append(("Delete booking with reversal", False, 200, f"Failed: {failed}"))
            else:
                log(f"❌ FAIL - Response missing success or booking_id: {data}")
                results.append(("Delete booking with reversal", False, 200, "Invalid response structure"))
        else:
            log(f"❌ FAIL - Expected 200, got {del_resp.status_code}")
            results.append(("Delete booking with reversal", False, del_resp.status_code, del_resp.text[:100]))
        
        # Test 2.2: Bad booking id
        log("\n[2.2] Deleting with bad booking id...")
        bad_resp = requests.delete(f"{API_BASE}/packages/{pkg_id}/bookings/fake-id-999", 
                                   cookies=cookies, timeout=10)
        log(f"Status: {bad_resp.status_code}")
        log(f"Response: {bad_resp.text[:200]}")
        
        if bad_resp.status_code == 404:
            data = bad_resp.json()
            if "غير موجود" in data.get("error", ""):
                log("✅ PASS - Bad booking id returns 404 with Arabic error")
                results.append(("Bad booking id", True, 404, data.get("error")))
            else:
                log(f"❌ FAIL - Wrong error message: {data.get('error')}")
                results.append(("Bad booking id", False, 404, data.get("error")))
        else:
            log(f"❌ FAIL - Expected 404, got {bad_resp.status_code}")
            results.append(("Bad booking id", False, bad_resp.status_code, bad_resp.text[:100]))
        
        # Test 2.3: Bad package id
        log("\n[2.3] Deleting with bad package id...")
        # First create a new booking to test with
        booking_resp2 = requests.post(f"{API_BASE}/packages/{pkg_id}/bookings", 
                                     json={
                                         "pilgrim_name": "معتمر تجريبي 2",
                                         "client_id": client_id,
                                         "passport_no": "P123457",
                                         "payment_method": "credit",
                                         "pax_count": 1,
                                         "cost_price": 100,
                                         "sale_price": 200,
                                         "currency": "USD"
                                     },
                                     cookies=cookies, timeout=10)
        
        if booking_resp2.status_code == 200:
            booking2 = booking_resp2.json()
            booking_id2 = booking2['id']
            
            bad_pkg_resp = requests.delete(f"{API_BASE}/packages/fake-999/bookings/{booking_id2}", 
                                          cookies=cookies, timeout=10)
            log(f"Status: {bad_pkg_resp.status_code}")
            log(f"Response: {bad_pkg_resp.text[:200]}")
            
            if bad_pkg_resp.status_code == 404:
                log("✅ PASS - Bad package id returns 404")
                results.append(("Bad package id", True, 404, "Booking not found under wrong package"))
            else:
                log(f"⚠️ Got {bad_pkg_resp.status_code} instead of 404")
                results.append(("Bad package id", False, bad_pkg_resp.status_code, bad_pkg_resp.text[:100]))
            
            # Cleanup: delete the second booking
            requests.delete(f"{API_BASE}/packages/{pkg_id}/bookings/{booking_id2}", cookies=cookies, timeout=10)
        else:
            log("⚠️ SKIP - Could not create second booking for bad package id test")
            results.append(("Bad package id", None, 0, "Could not create test booking"))
        
        # Cleanup: delete the package
        log("\n[Cleanup] Deleting test package...")
        requests.delete(f"{API_BASE}/packages/{pkg_id}", cookies=cookies, timeout=10)
        
    except Exception as e:
        log(f"❌ FAIL - Exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Delete booking test", False, 0, str(e)))
    
    return results

def test_regression():
    """Test regression checks"""
    log("\n========== TEST 3: Regression Checks ==========")
    
    results = []
    
    # Test 3.1: Health endpoint version
    log("\n[3.1] Checking health endpoint version...")
    try:
        resp = requests.get(f"{API_BASE}/health", timeout=10)
        log(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            version = data.get('version')
            log(f"Version: {version}")
            
            if version == '3.9.20':
                log("✅ PASS - Health endpoint returns version 3.9.20")
                results.append(("Health version", True, 200, version))
            else:
                log(f"❌ FAIL - Expected version 3.9.20, got {version}")
                results.append(("Health version", False, 200, version))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("Health version", False, resp.status_code, resp.text[:100]))
            
    except Exception as e:
        log(f"❌ FAIL - Exception: {e}")
        results.append(("Health version", False, 0, str(e)))
    
    # Test 3.2: POST /api/tickets still works
    log("\n[3.2] Testing POST /api/tickets...")
    try:
        session = login(DEMO_OWNER)
        if not session:
            log("❌ FAIL - Could not login")
            results.append(("Tickets POST", False, 0, "Login failed"))
        else:
            cookies = {'rahaal_session': session}
            
            # Get or create client and supplier
            clients_resp = requests.get(f"{API_BASE}/clients", cookies=cookies, timeout=10)
            clients = clients_resp.json()
            if len(clients) > 0:
                client_id = clients[0]['id']
            else:
                client_resp = requests.post(f"{API_BASE}/clients", 
                                           json={"name": "عميل تجريبي", "phone": "+967771234567"},
                                           cookies=cookies, timeout=10)
                client_id = client_resp.json()['id']
            
            suppliers_resp = requests.get(f"{API_BASE}/suppliers", cookies=cookies, timeout=10)
            suppliers = suppliers_resp.json()
            if len(suppliers) > 0:
                supplier_id = suppliers[0]['id']
            else:
                supplier_resp = requests.post(f"{API_BASE}/suppliers", 
                                             json={"name": "مورد تجريبي", "phone": "+967771234568"},
                                             cookies=cookies, timeout=10)
                supplier_id = supplier_resp.json()['id']
            
            # Create ticket
            resp = requests.post(f"{API_BASE}/tickets", 
                                json={
                                    "pnr": f"REG-{datetime.now().strftime('%H%M%S')}",
                                    "client_id": client_id,
                                    "supplier_id": supplier_id,
                                    "passenger_name": "مسافر تجريبي",
                                    "route": "صنعاء - القاهرة",
                                    "cost": 100,
                                    "sale_price": 150,
                                    "currency": "USD",
                                    "payment_method": "credit"
                                },
                                cookies=cookies, timeout=10)
            log(f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                data = resp.json()
                log(f"Created ticket: {data.get('id')}")
                log("✅ PASS - Ticket creation still works")
                results.append(("Tickets POST", True, 200, "Ticket created successfully"))
                
                # Cleanup
                requests.delete(f"{API_BASE}/tickets/{data.get('id')}", cookies=cookies, timeout=10)
            else:
                log(f"❌ FAIL - Expected 200, got {resp.status_code}")
                log(f"Response: {resp.text[:200]}")
                results.append(("Tickets POST", False, resp.status_code, resp.text[:100]))
                
    except Exception as e:
        log(f"❌ FAIL - Exception: {e}")
        results.append(("Tickets POST", False, 0, str(e)))
    
    # Test 3.3: v3.9.18 signup with phone still works
    log("\n[3.3] Testing v3.9.18 signup with phone...")
    try:
        test_email = f"regression{datetime.now().strftime('%H%M%S')}@gmail.com"
        resp = requests.post(f"{API_BASE}/public/signup", 
                            json={
                                "name": "مكتب تجريبي",
                                "owner_name": "احمد",
                                "owner_email": test_email,
                                "owner_password": "Pass1234",
                                "owner_phone": "+967771234567"
                            },
                            timeout=10)
        log(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            log("✅ PASS - Signup with phone still works")
            results.append(("Signup with phone", True, 200, "Signup successful"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text[:200]}")
            results.append(("Signup with phone", False, resp.status_code, resp.text[:100]))
            
    except Exception as e:
        log(f"❌ FAIL - Exception: {e}")
        results.append(("Signup with phone", False, 0, str(e)))
    
    # Test 3.4: v3.9.17 topup still works
    log("\n[3.4] Testing v3.9.17 topup...")
    try:
        session = login(SUPER_ADMIN)
        if not session:
            log("❌ FAIL - Could not login as super admin")
            results.append(("Topup", False, 0, "Login failed"))
        else:
            cookies = {'rahaal_session': session}
            
            # Get demo tenant id
            tenants_resp = requests.get(f"{API_BASE}/admin/tenants", cookies=cookies, timeout=10)
            if tenants_resp.status_code != 200:
                log(f"❌ FAIL - Could not get tenants: {tenants_resp.status_code}")
                results.append(("Topup", False, tenants_resp.status_code, "Could not get tenants"))
            else:
                data = tenants_resp.json()
                # Handle both array response and object with 'tenants' key
                if isinstance(data, dict) and 'tenants' in data:
                    tenants = data['tenants']
                elif isinstance(data, list):
                    tenants = data
                else:
                    log(f"❌ FAIL - Unexpected tenants response format: {type(data)}")
                    results.append(("Topup", False, 200, f"Invalid response format: {type(data)}"))
                    return results
                
                demo_tenant = next((t for t in tenants if t.get('slug') == 'demo'), None)
                if demo_tenant:
                    tenant_id = demo_tenant['id']
                    resp = requests.post(f"{API_BASE}/admin/tenants/{tenant_id}/topup", 
                                        json={"amount": 10, "note": "Regression test"},
                                        cookies=cookies, timeout=10)
                    log(f"Status: {resp.status_code}")
                    
                    if resp.status_code == 200:
                        log("✅ PASS - Topup still works")
                        results.append(("Topup", True, 200, "Topup successful"))
                    else:
                        log(f"❌ FAIL - Expected 200, got {resp.status_code}")
                        log(f"Response: {resp.text[:200]}")
                        results.append(("Topup", False, resp.status_code, resp.text[:100]))
                else:
                    log("⚠️ SKIP - Could not find demo tenant")
                    results.append(("Topup", None, 0, "Demo tenant not found"))
                
    except Exception as e:
        log(f"❌ FAIL - Exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Topup", False, 0, str(e)))
    
    # Test 3.5: v3.9.17 reset-password still works
    log("\n[3.5] Testing v3.9.17 reset-password...")
    try:
        session = login(SUPER_ADMIN)
        if not session:
            log("❌ FAIL - Could not login as super admin")
            results.append(("Reset password", False, 0, "Login failed"))
        else:
            cookies = {'rahaal_session': session}
            
            # Get demo tenant id
            tenants_resp = requests.get(f"{API_BASE}/admin/tenants", cookies=cookies, timeout=10)
            if tenants_resp.status_code != 200:
                log(f"❌ FAIL - Could not get tenants: {tenants_resp.status_code}")
                results.append(("Reset password", False, tenants_resp.status_code, "Could not get tenants"))
            else:
                data = tenants_resp.json()
                # Handle both array response and object with 'tenants' key
                if isinstance(data, dict) and 'tenants' in data:
                    tenants = data['tenants']
                elif isinstance(data, list):
                    tenants = data
                else:
                    log(f"❌ FAIL - Unexpected tenants response format: {type(data)}")
                    results.append(("Reset password", False, 200, f"Invalid response format: {type(data)}"))
                    return results
                
                demo_tenant = next((t for t in tenants if t.get('slug') == 'demo'), None)
                
                if demo_tenant:
                    tenant_id = demo_tenant['id']
                    resp = requests.post(f"{API_BASE}/admin/tenants/{tenant_id}/reset-password", 
                                        json={"new_password": "Demo@2025"},
                                        cookies=cookies, timeout=10)
                    log(f"Status: {resp.status_code}")
                    
                    if resp.status_code == 200:
                        log("✅ PASS - Reset password still works")
                        results.append(("Reset password", True, 200, "Password reset successful"))
                    else:
                        log(f"❌ FAIL - Expected 200, got {resp.status_code}")
                        log(f"Response: {resp.text[:200]}")
                        results.append(("Reset password", False, resp.status_code, resp.text[:100]))
                else:
                    log("⚠️ SKIP - Could not find demo tenant")
                    results.append(("Reset password", None, 0, "Demo tenant not found"))
                
    except Exception as e:
        log(f"❌ FAIL - Exception: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Reset password", False, 0, str(e)))
    
    return results

def main():
    log("=" * 80)
    log("Rahaal ERP v3.9.20 Backend Test Suite")
    log(f"Base URL: {BASE_URL}")
    log("=" * 80)
    
    all_results = []
    
    # Run all tests
    all_results.extend(test_backup_export())
    all_results.extend(test_package_booking_delete())
    all_results.extend(test_regression())
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for r in all_results if r[1] is True)
    failed = sum(1 for r in all_results if r[1] is False)
    skipped = sum(1 for r in all_results if r[1] is None)
    total = len(all_results)
    
    log(f"\nTotal: {total} | Passed: {passed} | Failed: {failed} | Skipped: {skipped}")
    log(f"Success Rate: {(passed/total*100):.1f}%\n")
    
    for test_name, passed, status, message in all_results:
        status_icon = "✅" if passed is True else ("❌" if passed is False else "⚠️")
        log(f"{status_icon} {test_name}: {status} - {message}")
    
    log("\n" + "=" * 80)
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    exit(main())
