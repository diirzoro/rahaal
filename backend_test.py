#!/usr/bin/env python3
"""
Backend Test Suite for Rahaal ERP v3.17 - Booking Manual Discount Feature
Tests the packages module booking discount functionality
"""

import asyncio
import aiohttp
import json
import os
from datetime import datetime, timedelta

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://visa-booking-5.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Test credentials
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "Demo@2025"

# Global session cookie
session_cookie = None

# Test data storage
test_data = {
    'package_id': None,
    'client_id': None,
    'supplier_id': None,
    'booking1_id': None,
    'booking2_id': None,
    'booking3_id': None,
    'client_balance_before': None,
}

async def login():
    """Login and get session cookie"""
    global session_cookie
    print("\n=== LOGIN ===")
    async with aiohttp.ClientSession() as session:
        try:
            payload = {"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
            async with session.post(f"{API_URL}/auth/login", json=payload) as resp:
                if resp.status == 200:
                    cookies = resp.cookies
                    if 'rahaal_session' in cookies:
                        session_cookie = cookies['rahaal_session'].value
                        print(f"✅ Login successful - Session cookie obtained")
                        return True
                    else:
                        print(f"❌ Login failed - No session cookie in response")
                        return False
                else:
                    text = await resp.text()
                    print(f"❌ Login failed - Status {resp.status}: {text}")
                    return False
        except Exception as e:
            print(f"❌ Login exception: {e}")
            return False

async def api_request(method, endpoint, data=None, expect_status=200):
    """Make authenticated API request"""
    global session_cookie
    url = f"{API_URL}{endpoint}"
    headers = {'Cookie': f'rahaal_session={session_cookie}'}
    
    async with aiohttp.ClientSession() as session:
        try:
            if method == 'GET':
                async with session.get(url, headers=headers) as resp:
                    status = resp.status
                    body = await resp.json() if resp.content_type == 'application/json' else await resp.text()
                    return status, body
            elif method == 'POST':
                async with session.post(url, json=data, headers=headers) as resp:
                    status = resp.status
                    body = await resp.json() if resp.content_type == 'application/json' else await resp.text()
                    return status, body
            elif method == 'PATCH':
                async with session.patch(url, json=data, headers=headers) as resp:
                    status = resp.status
                    body = await resp.json() if resp.content_type == 'application/json' else await resp.text()
                    return status, body
            elif method == 'DELETE':
                async with session.delete(url, headers=headers) as resp:
                    status = resp.status
                    body = await resp.json() if resp.content_type == 'application/json' else await resp.text()
                    return status, body
        except Exception as e:
            print(f"❌ API request exception: {e}")
            return None, str(e)

async def setup_test_data():
    """Setup: Create package with components and record client balance"""
    print("\n=== SETUP: CREATE PACKAGE AND COMPONENTS ===")
    
    # Get existing client for balance tracking
    status, body = await api_request('GET', '/clients')
    if status == 200 and isinstance(body, dict) and body.get('data'):
        test_data['client_id'] = body['data'][0]['id']
        client_balances = body['data'][0].get('balances', {})
        client_balance_sar = client_balances.get('SAR') or 0
        test_data['client_balance_before'] = client_balance_sar
        print(f"✅ Using existing client: {body['data'][0]['name']} (ID: {test_data['client_id']})")
        print(f"   Client balance BEFORE tests: {client_balance_sar} SAR")
    elif status == 200 and isinstance(body, list) and len(body) > 0:
        test_data['client_id'] = body[0]['id']
        client_balances = body[0].get('balances', {})
        client_balance_sar = client_balances.get('SAR') or 0
        test_data['client_balance_before'] = client_balance_sar
        print(f"✅ Using existing client: {body[0]['name']} (ID: {test_data['client_id']})")
        print(f"   Client balance BEFORE tests: {client_balance_sar} SAR")
    else:
        print(f"❌ Failed to get existing client")
        return False
    
    # Get existing supplier
    status, body = await api_request('GET', '/suppliers')
    if status == 200 and isinstance(body, dict) and body.get('data'):
        test_data['supplier_id'] = body['data'][0]['id']
        print(f"✅ Using existing supplier: {body['data'][0]['name']} (ID: {test_data['supplier_id']})")
    elif status == 200 and isinstance(body, list) and len(body) > 0:
        test_data['supplier_id'] = body[0]['id']
        print(f"✅ Using existing supplier: {body[0]['name']} (ID: {test_data['supplier_id']})")
    else:
        print(f"❌ Failed to get existing supplier")
        return False
    
    # Create package with room pricing
    today = datetime.now().strftime('%Y-%m-%d')
    package_data = {
        "name": "باكج AUTOTEST-V317",
        "package_type": "umrah",
        "currency": "SAR",
        "start_date": today,
        "room_pricing": [
            {"type": "ثنائي", "sale_per_pax": 1000},
            {"type": "ثلاثي", "sale_per_pax": 800}
        ]
    }
    
    status, body = await api_request('POST', '/packages', package_data)
    if status == 200 and body.get('id'):
        test_data['package_id'] = body['id']
        print(f"✅ Package created: {body['name']} (ID: {test_data['package_id']})")
    else:
        print(f"❌ Failed to create package - Status {status}: {body}")
        return False
    
    # Add component to package
    component_data = {
        "name": "مكون اختبار V317",
        "supplier_id": test_data['supplier_id'],
        "cost_per_pax": 300,
        "sale_per_pax": 500
    }
    
    status, body = await api_request('POST', f"/packages/{test_data['package_id']}/components", component_data)
    if status == 200:
        print(f"✅ Component added to package")
    else:
        print(f"❌ Failed to add component - Status {status}: {body}")
        return False
    
    return True

async def test_booking_with_registrants_and_discount():
    """Test 3: POST booking WITH registrants + discount"""
    print("\n=== TEST 3: POST BOOKING WITH REGISTRANTS + DISCOUNT ===")
    
    booking_data = {
        "payment_method": "credit",
        "client_id": test_data['client_id'],
        "registrants": [
            {"name": "أ", "passport_no": "V317A", "age": 30, "room_type": "ثنائي"},
            {"name": "ب", "passport_no": "V317B", "age": 30, "room_type": "ثلاثي"}
        ],
        "discount": 300,
        "discount_reason": "مجاملة وكيل"
    }
    
    status, body = await api_request('POST', f"/packages/{test_data['package_id']}/bookings", booking_data)
    
    if status == 200:
        test_data['booking1_id'] = body['id']
        
        # Verify calculations
        base_room_sale = 1000 + 800  # ثنائي + ثلاثي = 1800
        expected_total_sale = 1500  # 1800 - 300 discount
        expected_total_cost = 600  # 300 * 2 pax
        expected_commission = 900  # 1500 - 600
        
        actual_total_sale = body.get('total_sale')
        actual_total_cost = body.get('total_cost')
        actual_commission = body.get('commission')
        actual_discount = body.get('discount')
        actual_discount_reason = body.get('discount_reason')
        
        print(f"   Base room sale: {base_room_sale} SAR")
        print(f"   Discount: {actual_discount} SAR")
        print(f"   Total sale: {actual_total_sale} SAR (expected: {expected_total_sale})")
        print(f"   Total cost: {actual_total_cost} SAR (expected: {expected_total_cost})")
        print(f"   Commission: {actual_commission} SAR (expected: {expected_commission})")
        print(f"   Discount reason: '{actual_discount_reason}'")
        
        # Verify all calculations
        if (actual_total_sale == expected_total_sale and 
            actual_total_cost == expected_total_cost and 
            actual_commission == expected_commission and
            actual_discount == 300 and
            actual_discount_reason == "مجاملة وكيل"):
            
            # Check client balance increased by exactly 1500 (not 1800)
            status2, client_body = await api_request('GET', f"/clients")
            if status2 == 200:
                clients_list = client_body if isinstance(client_body, list) else client_body.get('data', [])
                client = next((c for c in clients_list if c['id'] == test_data['client_id']), None)
                if client:
                    client_balances = client.get('balances', {})
                    new_balance = client_balances.get('SAR') or 0
                    balance_increase = new_balance - test_data['client_balance_before']
                    print(f"   Client balance after booking: {new_balance} SAR")
                    print(f"   Client balance before booking: {test_data['client_balance_before']} SAR")
                    print(f"   Client balance increased by: {balance_increase} SAR (expected: 1500)")
                    
                    # Update the before balance for subsequent tests
                    test_data['client_balance_before'] = new_balance
                    
                    if abs(balance_increase - 1500) < 0.01:  # Allow small floating point differences
                        # Check journal entry
                        status3, je_body = await api_request('GET', '/journal-entries')
                        if status3 == 200:
                            je_list = je_body if isinstance(je_body, list) else je_body.get('data', [])
                            # Find the journal entry for this booking
                            je = next((j for j in je_list if j.get('ref_type') == 'package_booking' and j.get('ref_id') == test_data['booking1_id']), None)
                            if je:
                                # Check for client receivable debit of 1500
                                client_line = next((l for l in je['lines'] if l.get('account_code') == '1301'), None)
                                if client_line and client_line.get('debit') == 1500:
                                    print(f"✅ TEST 3 PASSED - Booking with registrants + discount working correctly")
                                    print(f"   - Base room sale: 1800 SAR")
                                    print(f"   - Discount: 300 SAR")
                                    print(f"   - Total sale: 1500 SAR")
                                    print(f"   - Total cost: 600 SAR")
                                    print(f"   - Commission: 900 SAR")
                                    print(f"   - Discount reason stored correctly")
                                    print(f"   - Client balance increased by exactly 1500 SAR")
                                    print(f"   - Journal entry has debit 1500 on client receivable")
                                    return True
                                else:
                                    print(f"❌ TEST 3 FAILED - Journal entry client debit incorrect: {client_line.get('debit') if client_line else 'not found'}")
                            else:
                                print(f"❌ TEST 3 FAILED - Journal entry not found for booking")
                    else:
                        print(f"❌ TEST 3 FAILED - Client balance increase incorrect: {balance_increase} (expected 1500)")
            else:
                print(f"❌ TEST 3 FAILED - Could not verify client balance")
        else:
            print(f"❌ TEST 3 FAILED - Calculation mismatch")
    else:
        print(f"❌ TEST 3 FAILED - Status {status}: {body}")
    
    return False

async def test_booking_without_registrants_with_discount():
    """Test 4: POST booking WITHOUT registrants but WITH discount"""
    print("\n=== TEST 4: POST BOOKING WITHOUT REGISTRANTS BUT WITH DISCOUNT ===")
    
    booking_data = {
        "payment_method": "credit",
        "client_id": test_data['client_id'],
        "pax_adults": 2,
        "discount": 100,
        "discount_reason": "خصم رضيع"
    }
    
    status, body = await api_request('POST', f"/packages/{test_data['package_id']}/bookings", booking_data)
    
    if status == 200:
        test_data['booking2_id'] = body['id']
        
        # Component sale: 500 * 2 = 1000
        # After discount: 1000 - 100 = 900
        expected_total_sale = 900
        actual_total_sale = body.get('total_sale')
        
        print(f"   Component sale (500 * 2): 1000 SAR")
        print(f"   Discount: {body.get('discount')} SAR")
        print(f"   Total sale: {actual_total_sale} SAR (expected: {expected_total_sale})")
        
        if actual_total_sale == expected_total_sale:
            print(f"✅ TEST 4 PASSED - Booking without registrants but with discount working correctly")
            print(f"   - Component sale: 1000 SAR")
            print(f"   - Discount: 100 SAR")
            print(f"   - Total sale: 900 SAR")
            return True
        else:
            print(f"❌ TEST 4 FAILED - Total sale mismatch: {actual_total_sale} (expected {expected_total_sale})")
    else:
        print(f"❌ TEST 4 FAILED - Status {status}: {body}")
    
    return False

async def test_discount_floor():
    """Test 5: Discount floor - total_sale should not go negative"""
    print("\n=== TEST 5: DISCOUNT FLOOR (TOTAL_SALE >= 0) ===")
    
    booking_data = {
        "payment_method": "credit",
        "client_id": test_data['client_id'],
        "pax_adults": 1,
        "discount": 99999,
        "discount_reason": "خصم كبير جداً"
    }
    
    status, body = await api_request('POST', f"/packages/{test_data['package_id']}/bookings", booking_data)
    
    if status == 200:
        test_data['booking3_id'] = body['id']
        
        actual_total_sale = body.get('total_sale')
        
        print(f"   Component sale (500 * 1): 500 SAR")
        print(f"   Discount requested: 99999 SAR")
        print(f"   Total sale: {actual_total_sale} SAR (expected: 0)")
        
        if actual_total_sale == 0:
            print(f"✅ TEST 5 PASSED - Discount floor working correctly (total_sale = 0, not negative)")
            return True
        else:
            print(f"❌ TEST 5 FAILED - Total sale should be 0, got: {actual_total_sale}")
    else:
        print(f"❌ TEST 5 FAILED - Status {status}: {body}")
    
    return False

async def test_patch_edit_reason_only():
    """Test 6: PATCH edit - reason only (light update)"""
    print("\n=== TEST 6: PATCH EDIT - REASON ONLY (LIGHT UPDATE) ===")
    
    if not test_data['booking1_id']:
        print(f"❌ TEST 6 SKIPPED - Booking 1 not created")
        return False
    
    patch_data = {
        "discount_reason": "سبب معدل"
    }
    
    status, body = await api_request('PATCH', f"/packages/{test_data['package_id']}/bookings/{test_data['booking1_id']}", patch_data)
    
    if status == 200:
        has_light_update = body.get('_light_update')
        actual_discount = body.get('discount')
        actual_total_sale = body.get('total_sale')
        actual_discount_reason = body.get('discount_reason')
        
        print(f"   _light_update: {has_light_update}")
        print(f"   Discount: {actual_discount} SAR (should stay 300)")
        print(f"   Total sale: {actual_total_sale} SAR (should stay 1500)")
        print(f"   Discount reason: '{actual_discount_reason}' (should be 'سبب معدل')")
        
        if (has_light_update == True and 
            actual_discount == 300 and 
            actual_total_sale == 1500 and
            actual_discount_reason == "سبب معدل"):
            print(f"✅ TEST 6 PASSED - Light update working correctly")
            print(f"   - _light_update flag present")
            print(f"   - Discount unchanged (300)")
            print(f"   - Total sale unchanged (1500)")
            print(f"   - Discount reason updated to 'سبب معدل'")
            return True
        else:
            print(f"❌ TEST 6 FAILED - Light update not working as expected")
    else:
        print(f"❌ TEST 6 FAILED - Status {status}: {body}")
    
    return False

async def test_patch_edit_amount_change():
    """Test 7: PATCH edit - amount change (full recalc)"""
    print("\n=== TEST 7: PATCH EDIT - AMOUNT CHANGE (FULL RECALC) ===")
    
    if not test_data['booking1_id']:
        print(f"❌ TEST 7 SKIPPED - Booking 1 not created")
        return False
    
    # Get client balance before edit
    status_pre, client_body_pre = await api_request('GET', '/clients')
    if status_pre != 200:
        print(f"❌ TEST 7 FAILED - Could not get client balance before edit")
        return False
    
    clients_list_pre = client_body_pre if isinstance(client_body_pre, list) else client_body_pre.get('data', [])
    client_pre = next((c for c in clients_list_pre if c['id'] == test_data['client_id']), None)
    client_balances_pre = client_pre.get('balances', {}) if client_pre else {}
    balance_before_edit = client_balances_pre.get('SAR') or 0
    print(f"   Client balance before edit: {balance_before_edit} SAR")
    
    patch_data = {
        "discount": 500
    }
    
    status, body = await api_request('PATCH', f"/packages/{test_data['package_id']}/bookings/{test_data['booking1_id']}", patch_data)
    
    if status == 200:
        has_light_update = body.get('_light_update')
        actual_discount = body.get('discount')
        actual_total_sale = body.get('total_sale')
        
        # Base room sale: 1800, new discount: 500, expected total_sale: 1300
        expected_total_sale = 1300
        
        print(f"   _light_update: {has_light_update} (should be False or absent)")
        print(f"   Discount: {actual_discount} SAR (should be 500)")
        print(f"   Total sale: {actual_total_sale} SAR (expected: {expected_total_sale})")
        
        if (not has_light_update and 
            actual_discount == 500 and 
            actual_total_sale == expected_total_sale):
            
            # Check client balance adjustment
            status_post, client_body_post = await api_request('GET', '/clients')
            if status_post == 200:
                clients_list_post = client_body_post if isinstance(client_body_post, list) else client_body_post.get('data', [])
                client_post = next((c for c in clients_list_post if c['id'] == test_data['client_id']), None)
                client_balances_post = client_post.get('balances', {}) if client_post else {}
                balance_after_edit = client_balances_post.get('SAR') or 0
                balance_change = balance_after_edit - balance_before_edit
                
                # Net change should be -200 (from 1500 to 1300)
                expected_change = -200
                
                print(f"   Client balance after edit: {balance_after_edit} SAR")
                print(f"   Net balance change: {balance_change} SAR (expected: {expected_change})")
                
                if balance_change == expected_change:
                    print(f"✅ TEST 7 PASSED - Full recalc on amount change working correctly")
                    print(f"   - No _light_update flag (full recalc)")
                    print(f"   - Discount changed to 500 SAR")
                    print(f"   - Total sale recalculated to 1300 SAR (1800 - 500)")
                    print(f"   - Client balance adjusted by -200 SAR (net effect)")
                    return True
                else:
                    print(f"❌ TEST 7 FAILED - Client balance change incorrect: {balance_change} (expected {expected_change})")
            else:
                print(f"❌ TEST 7 FAILED - Could not verify client balance after edit")
        else:
            print(f"❌ TEST 7 FAILED - Full recalc not working as expected")
    else:
        print(f"❌ TEST 7 FAILED - Status {status}: {body}")
    
    return False

async def cleanup():
    """Cleanup: Delete all bookings and package, verify client balance restored"""
    print("\n=== CLEANUP: DELETE BOOKINGS AND PACKAGE ===")
    
    # Delete all bookings
    bookings_to_delete = [
        ('booking1', test_data['booking1_id']),
        ('booking2', test_data['booking2_id']),
        ('booking3', test_data['booking3_id'])
    ]
    
    deleted_count = 0
    for name, booking_id in bookings_to_delete:
        if booking_id:
            status, body = await api_request('DELETE', f"/packages/{test_data['package_id']}/bookings/{booking_id}")
            if status == 200:
                print(f"✅ Deleted {name} (ID: {booking_id})")
                deleted_count += 1
            else:
                print(f"❌ Failed to delete {name} - Status {status}: {body}")
    
    # Delete package
    if test_data['package_id']:
        status, body = await api_request('DELETE', f"/packages/{test_data['package_id']}")
        if status == 200:
            print(f"✅ Deleted package (ID: {test_data['package_id']})")
        else:
            print(f"❌ Failed to delete package - Status {status}: {body}")
    
    # Verify client balance returned to original
    status, client_body = await api_request('GET', '/clients')
    if status == 200:
        clients_list = client_body if isinstance(client_body, list) else client_body.get('data', [])
        client = next((c for c in clients_list if c['id'] == test_data['client_id']), None)
        if client:
            client_balances = client.get('balances', {})
            final_balance = client_balances.get('SAR') or 0
            print(f"   Client balance AFTER cleanup: {final_balance} SAR")
            print(f"   Client balance BEFORE tests: {test_data['client_balance_before']} SAR")
            
            if final_balance == test_data['client_balance_before']:
                print(f"✅ CLEANUP VERIFIED - Client balance restored to original value")
                return True
            else:
                print(f"❌ CLEANUP FAILED - Client balance not restored (diff: {final_balance - test_data['client_balance_before']} SAR)")
    
    # Verify package deleted
    status, pkg_body = await api_request('GET', '/packages')
    if status == 200:
        pkg_list = pkg_body if isinstance(pkg_body, list) else pkg_body.get('data', [])
        pkg_exists = any(p['id'] == test_data['package_id'] for p in pkg_list)
        if not pkg_exists:
            print(f"✅ CLEANUP VERIFIED - Package removed from GET /api/packages")
        else:
            print(f"❌ CLEANUP FAILED - Package still exists in database")
    
    return True

async def main():
    """Main test runner"""
    print("=" * 80)
    print("RAHAAL ERP v3.17 - BOOKING MANUAL DISCOUNT TESTS")
    print("=" * 80)
    
    # Login
    if not await login():
        print("\n❌ TESTS ABORTED - Login failed")
        return
    
    # Setup
    if not await setup_test_data():
        print("\n❌ TESTS ABORTED - Setup failed")
        return
    
    # Run tests
    results = {
        'Test 3: Booking with registrants + discount': await test_booking_with_registrants_and_discount(),
        'Test 4: Booking without registrants + discount': await test_booking_without_registrants_with_discount(),
        'Test 5: Discount floor (total_sale >= 0)': await test_discount_floor(),
        'Test 6: PATCH edit - reason only (light)': await test_patch_edit_reason_only(),
        'Test 7: PATCH edit - amount change (full recalc)': await test_patch_edit_amount_change(),
    }
    
    # Cleanup
    await cleanup()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(main())
