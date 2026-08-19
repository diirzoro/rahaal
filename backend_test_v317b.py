#!/usr/bin/env python3
"""
v3.17b Retest: PATCH package bookings must preserve ROOM-BASED sale pricing
Test the fix that ensures full recalc uses room pricing when registrants exist
"""
import requests
import json
from datetime import datetime, timedelta

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
session = requests.Session()

def login():
    """Login as owner@demo.com"""
    print("\n=== LOGIN ===")
    resp = session.post(f"{BASE_URL}/auth/login", json={
        "email": "owner@demo.com",
        "password": "Demo@2025"
    })
    print(f"Login status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Logged in as: {data.get('user', {}).get('email')}")
        # Extract cookie
        cookies = session.cookies.get_dict()
        print(f"Session cookie: {cookies.get('rahaal_session', 'NOT FOUND')[:20]}...")
        return True
    else:
        print(f"Login failed: {resp.text}")
        return False

def get_client_balance(client_id):
    """Get client balance before operations"""
    resp = session.get(f"{BASE_URL}/clients")
    if resp.status_code == 200:
        clients = resp.json()
        for c in clients:
            if c.get('id') == client_id:
                balances = c.get('balances', {})
                return balances.get('SAR', 0)
    return None

def test_v317b_room_pricing_preservation():
    """
    Test v3.17b fix: PATCH must preserve room-based sale pricing during full recalc
    """
    print("\n" + "="*80)
    print("v3.17b RETEST: PATCH Package Booking Room Pricing Preservation")
    print("="*80)
    
    # SETUP: Record client balance BEFORE
    print("\n--- SETUP: Get existing client ---")
    resp = session.get(f"{BASE_URL}/clients")
    if resp.status_code != 200:
        print(f"❌ Failed to get clients: {resp.status_code}")
        return False
    clients = resp.json()
    if not clients:
        print("❌ No clients found")
        return False
    client = clients[0]
    client_id = client['id']
    balances = client.get('balances', {})
    initial_balance = balances.get('SAR', 0)
    print(f"✅ Using client: {client['name']} (ID: {client_id})")
    print(f"✅ Initial balance SAR: {initial_balance}")
    
    # Get existing supplier
    print("\n--- SETUP: Get existing supplier ---")
    resp = session.get(f"{BASE_URL}/suppliers")
    if resp.status_code != 200:
        print(f"❌ Failed to get suppliers: {resp.status_code}")
        return False
    suppliers = resp.json()
    if not suppliers:
        print("❌ No suppliers found")
        return False
    supplier = suppliers[0]
    supplier_id = supplier['id']
    print(f"✅ Using supplier: {supplier['name']} (ID: {supplier_id})")
    
    # STEP 1: Create package with room pricing
    print("\n--- STEP 1: Create package with room pricing ---")
    today = datetime.now().strftime("%Y-%m-%d")
    package_data = {
        "name": "باكج AUTOTEST-V317B",
        "package_type": "umrah",
        "currency": "SAR",
        "start_date": today,
        "room_pricing": [
            {"type": "ثنائي", "sale_per_pax": 1000},
            {"type": "ثلاثي", "sale_per_pax": 800}
        ]
    }
    resp = session.post(f"{BASE_URL}/packages", json=package_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create package: {resp.status_code} - {resp.text}")
        return False
    pkg = resp.json()
    pkg_id = pkg['id']
    print(f"✅ Package created: {pkg['name']} (ID: {pkg_id})")
    print(f"   Room pricing: ثنائي=1000, ثلاثي=800")
    
    # STEP 2: Add component to package
    print("\n--- STEP 2: Add component to package ---")
    component_data = {
        "name": "نقل داخلي",
        "supplier_id": supplier_id,
        "cost_per_pax": 300,
        "sale_per_pax": 500
    }
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/components", json=component_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create component: {resp.status_code} - {resp.text}")
        return False
    comp = resp.json()
    print(f"✅ Component created: {comp['name']}")
    print(f"   Cost per pax: 300, Sale per pax: 500")
    
    # STEP 3: Create booking with registrants and discount
    print("\n--- STEP 3: Create booking with registrants + discount ---")
    booking_data = {
        "payment_method": "credit",
        "client_id": client_id,
        "registrants": [
            {"name": "أ", "passport_no": "V317BA", "age": 30, "room_type": "ثنائي"},
            {"name": "ب", "passport_no": "V317BB", "age": 30, "room_type": "ثلاثي"}
        ],
        "discount": 300
    }
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/bookings", json=booking_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code} - {resp.text}")
        return False
    booking = resp.json()
    booking_id = booking['id']
    print(f"✅ Booking created (ID: {booking_id})")
    print(f"   Registrants: 2 (ثنائي + ثلاثي)")
    print(f"   Expected: base room sale = 1800 (1000+800), discount = 300, total_sale = 1500")
    print(f"   Actual: total_sale = {booking.get('total_sale')}")
    
    if booking.get('total_sale') != 1500:
        print(f"❌ FAILED: Expected total_sale=1500, got {booking.get('total_sale')}")
        return False
    print(f"✅ POST booking correct: total_sale = 1500")
    
    # Verify client balance increased by 1500
    balance_after_create = get_client_balance(client_id)
    expected_balance_after_create = initial_balance + 1500
    print(f"   Client balance: {initial_balance} → {balance_after_create} (expected {expected_balance_after_create})")
    if abs(balance_after_create - expected_balance_after_create) > 0.01:
        print(f"❌ FAILED: Client balance mismatch")
        return False
    print(f"✅ Client balance correct after POST")
    
    # STEP 4: PATCH discount change (full recalc) - THE CRITICAL TEST
    print("\n--- STEP 4: PATCH discount change (CRITICAL TEST for v3.17b fix) ---")
    print("   Testing: PATCH must preserve room-based pricing (1800) NOT component-based (1000)")
    patch_data = {
        "discount": 500
    }
    resp = session.patch(f"{BASE_URL}/packages/{pkg_id}/bookings/{booking_id}", json=patch_data)
    if resp.status_code != 200:
        print(f"❌ Failed to PATCH booking: {resp.status_code} - {resp.text}")
        return False
    patched = resp.json()
    print(f"✅ PATCH response received")
    print(f"   Expected: total_sale = 1300 (1800 room base - 500 discount)")
    print(f"   Actual: total_sale = {patched.get('total_sale')}")
    print(f"   _full_recalc flag: {patched.get('_full_recalc')}")
    
    if patched.get('total_sale') != 1300:
        print(f"❌ FAILED: Expected total_sale=1300, got {patched.get('total_sale')}")
        print(f"   This means room pricing was NOT preserved during PATCH")
        if patched.get('total_sale') == 500:
            print(f"   Got 500 = component-based (1000 - 500), NOT room-based (1800 - 500)")
        return False
    print(f"✅ PATCH CORRECT: Room-based pricing preserved! total_sale = 1300")
    
    # Verify client balance net change is -200 (from 1500 to 1300)
    balance_after_patch = get_client_balance(client_id)
    expected_balance_after_patch = initial_balance + 1300
    print(f"   Client balance: {balance_after_create} → {balance_after_patch} (expected {expected_balance_after_patch})")
    balance_net_change = balance_after_patch - initial_balance
    print(f"   Net change from initial: {balance_net_change} (expected 1300)")
    if abs(balance_after_patch - expected_balance_after_patch) > 0.01:
        print(f"❌ FAILED: Client balance mismatch after PATCH")
        return False
    print(f"✅ Client balance correct after PATCH (net change -200 from previous)")
    
    # STEP 5: PATCH registrants change (remove one person)
    print("\n--- STEP 5: PATCH registrants change (remove one person) ---")
    patch_data2 = {
        "registrants": [
            {"name": "أ", "passport_no": "V317BA", "age": 30, "room_type": "ثنائي"}
        ],
        "discount": 0
    }
    resp = session.patch(f"{BASE_URL}/packages/{pkg_id}/bookings/{booking_id}", json=patch_data2)
    if resp.status_code != 200:
        print(f"❌ Failed to PATCH registrants: {resp.status_code} - {resp.text}")
        return False
    patched2 = resp.json()
    print(f"✅ PATCH response received")
    print(f"   Expected: total_sale = 1000 (1 person in ثنائي room), rooms_summary = {{ثنائي: 1}}")
    print(f"   Actual: total_sale = {patched2.get('total_sale')}")
    print(f"   Actual: rooms_summary = {patched2.get('rooms_summary')}")
    
    if patched2.get('total_sale') != 1000:
        print(f"❌ FAILED: Expected total_sale=1000, got {patched2.get('total_sale')}")
        return False
    if patched2.get('rooms_summary') != {"ثنائي": 1}:
        print(f"❌ FAILED: Expected rooms_summary={{ثنائي: 1}}, got {patched2.get('rooms_summary')}")
        return False
    print(f"✅ PATCH registrants correct: total_sale = 1000, rooms_summary correct")
    
    # STEP 6: PATCH discount_reason only (light update)
    print("\n--- STEP 6: PATCH discount_reason only (light update) ---")
    patch_data3 = {
        "discount_reason": "سبب فقط"
    }
    resp = session.patch(f"{BASE_URL}/packages/{pkg_id}/bookings/{booking_id}", json=patch_data3)
    if resp.status_code != 200:
        print(f"❌ Failed to PATCH reason: {resp.status_code} - {resp.text}")
        return False
    patched3 = resp.json()
    print(f"✅ PATCH response received")
    print(f"   Expected: _light_update = true, total_sale unchanged (1000)")
    print(f"   Actual: _light_update = {patched3.get('_light_update')}, total_sale = {patched3.get('total_sale')}")
    
    if not patched3.get('_light_update'):
        print(f"❌ FAILED: Expected _light_update=true")
        return False
    if patched3.get('total_sale') != 1000:
        print(f"❌ FAILED: Expected total_sale unchanged (1000), got {patched3.get('total_sale')}")
        return False
    print(f"✅ Light update correct: total_sale unchanged, _light_update flag present")
    
    # CLEANUP: Delete booking and package
    print("\n--- CLEANUP: Delete booking and package ---")
    resp = session.delete(f"{BASE_URL}/packages/{pkg_id}/bookings/{booking_id}")
    if resp.status_code != 200:
        print(f"❌ Failed to delete booking: {resp.status_code} - {resp.text}")
        return False
    print(f"✅ Booking deleted")
    
    resp = session.delete(f"{BASE_URL}/packages/{pkg_id}")
    if resp.status_code != 200:
        print(f"❌ Failed to delete package: {resp.status_code} - {resp.text}")
        return False
    print(f"✅ Package deleted")
    
    # Verify client balance restored
    final_balance = get_client_balance(client_id)
    print(f"   Client balance: {balance_after_patch} → {final_balance} (expected {initial_balance})")
    if abs(final_balance - initial_balance) > 0.01:
        print(f"❌ FAILED: Client balance not restored to initial value")
        return False
    print(f"✅ Client balance restored to original: {final_balance}")
    
    print("\n" + "="*80)
    print("✅ ALL TESTS PASSED - v3.17b fix verified!")
    print("="*80)
    return True

def main():
    print("="*80)
    print("v3.17b RETEST: Package Booking Room Pricing Preservation")
    print("="*80)
    
    if not login():
        print("\n❌ LOGIN FAILED - Cannot proceed with tests")
        return
    
    try:
        success = test_v317b_room_pricing_preservation()
        if success:
            print("\n✅ ✅ ✅ ALL TESTS PASSED ✅ ✅ ✅")
        else:
            print("\n❌ ❌ ❌ TESTS FAILED ❌ ❌ ❌")
    except Exception as e:
        print(f"\n❌ TEST EXCEPTION: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
