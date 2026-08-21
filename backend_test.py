#!/usr/bin/env python3
"""
v3.25 Backend Test Suite - Smart Meraaj Share + Age-Aware Inbound Booking
Tests the catch-all API at /app/app/api/[[...path]]/route.js
"""

import requests
import json
import hmac
import hashlib
import time
import os
import random
from datetime import datetime

# Configuration from .env
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
MERAAJ_SECRET = "fadaef8475135533dc526493bf3b87f4bad43682a95f5c2c136d7976cd126531"
LOGIN_EMAIL = "owner@demo.com"
LOGIN_PASSWORD = "Demo@2025"

# Test state
session = requests.Session()
test_ids = {
    'supplier': None,
    'package_smart': None,
    'package_noprice': None,
    'component': None,
    'inbound_bookings': [],
    'meraaj_events': [],
    'meraaj_inbound_events': []
}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def hmac_sign(data):
    """Generate HMAC-SHA256 signature for webhook"""
    return hmac.new(
        MERAAJ_SECRET.encode('utf-8'),
        data.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

def s2s_headers(path):
    """Generate S2S HMAC headers for Meraaj API calls"""
    ts = str(int(time.time()))
    message = f"{ts}.{path}"  # Note: period separator, not concatenation
    sig = hmac.new(
        MERAAJ_SECRET.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return {
        'x-meraaj-timestamp': ts,
        'x-meraaj-signature': sig
    }

def test_login():
    """Login and establish session"""
    log("=== SETUP: Login ===")
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json={
            'email': LOGIN_EMAIL,
            'password': LOGIN_PASSWORD
        })
        if resp.status_code != 200:
            log(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return False
        data = resp.json()
        log(f"✅ Login successful: {data.get('user', {}).get('email')}")
        return True
    except Exception as e:
        log(f"❌ Login error: {e}")
        return False

def test_setup_data():
    """Create supplier, packages, and component"""
    log("\n=== SETUP: Create Test Data ===")
    
    # Create supplier
    try:
        resp = session.post(f"{BASE_URL}/suppliers", json={
            'name': 'مورد اختبار v325',
            'currency': 'SAR'
        })
        if resp.status_code != 200:
            log(f"❌ Supplier creation failed: {resp.status_code} - {resp.text}")
            return False
        supplier = resp.json()
        test_ids['supplier'] = supplier['id']
        log(f"✅ Supplier created: {supplier['id']}")
    except Exception as e:
        log(f"❌ Supplier creation error: {e}")
        return False
    
    # Create package SMART-v325 with room pricing
    try:
        resp = session.post(f"{BASE_URL}/packages", json={
            'name': 'SMART-v325',
            'package_type': 'umrah',
            'currency': 'SAR',
            'pricing_mode': 'direct',
            'start_date': '2025-06-01',
            'end_date': '2025-06-15',
            'room_pricing': [
                {
                    'type': 'double',
                    'sale_per_pax': 1500,
                    'sale_child': 1100,
                    'sale_infant': 100
                },
                {
                    'type': 'quad',
                    'sale_per_pax': 1000
                    # child and infant not specified - should fallback
                }
            ]
        })
        if resp.status_code != 200:
            log(f"❌ Package SMART-v325 creation failed: {resp.status_code} - {resp.text}")
            return False
        pkg = resp.json()
        test_ids['package_smart'] = pkg['id']
        log(f"✅ Package SMART-v325 created: {pkg['id']}")
        log(f"   Room pricing: {len(pkg.get('room_pricing', []))} types")
    except Exception as e:
        log(f"❌ Package creation error: {e}")
        return False
    
    # Create component for SMART-v325
    try:
        resp = session.post(f"{BASE_URL}/packages/{test_ids['package_smart']}/components", json={
            'name': 'تأشيرة عمرة',
            'component_type': 'visa',
            'supplier_id': test_ids['supplier'],
            'cost_per_pax': 500,
            'sale_per_pax': 800,
            'pricing_type': 'flat'
        })
        if resp.status_code != 200:
            log(f"❌ Component creation failed: {resp.status_code} - {resp.text}")
            return False
        comp = resp.json()
        test_ids['component'] = comp['id']
        log(f"✅ Component created: {comp['id']}")
    except Exception as e:
        log(f"❌ Component creation error: {e}")
        return False
    
    return True

def test_1_share_without_room_prices():
    """TEST 1.1: Package without room prices should fail"""
    log("\n=== TEST 1.1: Share Package WITHOUT Room Prices ===")
    
    # Create package without room pricing
    try:
        resp = session.post(f"{BASE_URL}/packages", json={
            'name': 'NOPRICE-v325',
            'package_type': 'umrah',
            'currency': 'SAR',
            'pricing_mode': 'component',
            'start_date': '2025-06-01',
            'end_date': '2025-06-15',
            'room_pricing': []
        })
        if resp.status_code != 200:
            log(f"❌ Package NOPRICE creation failed: {resp.status_code}")
            return False
        pkg = resp.json()
        test_ids['package_noprice'] = pkg['id']
        log(f"✅ Package NOPRICE-v325 created: {pkg['id']}")
    except Exception as e:
        log(f"❌ Package creation error: {e}")
        return False
    
    # Try to share it - should fail
    try:
        resp = session.post(f"{BASE_URL}/packages/{test_ids['package_noprice']}/meraaj-share", json={
            'enabled': True,
            'buyer_commission_value': 50,
            'seats_allocated': 10
        })
        if resp.status_code == 400:
            log(f"✅ Correctly rejected: {resp.json().get('error', '')}")
            # Delete the package
            session.delete(f"{BASE_URL}/packages/{test_ids['package_noprice']}")
            log(f"✅ Package NOPRICE-v325 deleted")
            return True
        else:
            log(f"❌ Expected 400, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Share test error: {e}")
        return False

def test_1_share_smart_deducted():
    """TEST 1.2: Share SMART-v325 with deducted commission"""
    log("\n=== TEST 1.2: Share SMART-v325 (deducted, amount 100) ===")
    
    try:
        resp = session.post(f"{BASE_URL}/packages/{test_ids['package_smart']}/meraaj-share", json={
            'enabled': True,
            'buyer_commission_mode': 'amount',
            'buyer_commission_value': 100,
            'commission_direction': 'deducted',
            'seats_allocated': 20
        })
        if resp.status_code != 200:
            log(f"❌ Share failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        market = data.get('meraaj', {}).get('market_pricing', [])
        log(f"✅ Share successful, market_pricing has {len(market)} rows")
        
        # Verify double room pricing
        double = next((r for r in market if r['room_type'] == 'double'), None)
        if not double:
            log(f"❌ Double room not found in market_pricing")
            return False
        
        log(f"   Double room:")
        log(f"     Base: adult={double['base']['adult']}, child={double['base']['child']}, infant={double['base']['infant']}")
        log(f"     Commission: adult={double['commission']['adult']}, child={double['commission']['child']}, infant={double['commission']['infant']}")
        log(f"     Customer: adult={double['customer']['adult']}, child={double['customer']['child']}, infant={double['customer']['infant']}")
        log(f"     Net: adult={double['net']['adult']}, child={double['net']['child']}, infant={double['net']['infant']}")
        
        # Verify values
        if double['base']['adult'] != 1500 or double['base']['child'] != 1100 or double['base']['infant'] != 100:
            log(f"❌ Double base prices incorrect")
            return False
        if double['commission']['adult'] != 100 or double['commission']['child'] != 100 or double['commission']['infant'] != 100:
            log(f"❌ Double commission incorrect")
            return False
        if double['customer']['adult'] != 1500 or double['customer']['child'] != 1100 or double['customer']['infant'] != 100:
            log(f"❌ Double customer prices incorrect (deducted mode: customer = base)")
            return False
        if double['net']['adult'] != 1400 or double['net']['child'] != 1000 or double['net']['infant'] != 0:
            log(f"❌ Double net prices incorrect")
            return False
        
        # Verify quad room pricing
        quad = next((r for r in market if r['room_type'] == 'quad'), None)
        if not quad:
            log(f"❌ Quad room not found in market_pricing")
            return False
        
        log(f"   Quad room:")
        log(f"     Base: adult={quad['base']['adult']}, child={quad['base']['child']}, infant={quad['base']['infant']}")
        log(f"     Commission: adult={quad['commission']['adult']}, child={quad['commission']['child']}, infant={quad['commission']['infant']}")
        log(f"     Customer: adult={quad['customer']['adult']}, child={quad['customer']['child']}, infant={quad['customer']['infant']}")
        log(f"     Net: adult={quad['net']['adult']}, child={quad['net']['child']}, infant={quad['net']['infant']}")
        
        # Verify quad values (child fallback to adult, infant 0)
        if quad['base']['adult'] != 1000 or quad['base']['child'] != 1000 or quad['base']['infant'] != 0:
            log(f"❌ Quad base prices incorrect (child should fallback to adult 1000, infant should be 0)")
            return False
        # CRITICAL: infant commission must be 0 when base is 0
        if quad['commission']['adult'] != 100 or quad['commission']['child'] != 100 or quad['commission']['infant'] != 0:
            log(f"❌ Quad commission incorrect (infant commission should be 0 when base is 0)")
            return False
        if quad['customer']['adult'] != 1000 or quad['customer']['child'] != 1000 or quad['customer']['infant'] != 0:
            log(f"❌ Quad customer prices incorrect")
            return False
        if quad['net']['adult'] != 900 or quad['net']['child'] != 900 or quad['net']['infant'] != 0:
            log(f"❌ Quad net prices incorrect")
            return False
        
        log(f"✅ All pricing calculations correct")
        return True
        
    except Exception as e:
        log(f"❌ Share test error: {e}")
        return False

def test_1_share_added():
    """TEST 1.3: Share with 'added' direction"""
    log("\n=== TEST 1.3: Share with commission_direction='added' ===")
    
    try:
        resp = session.post(f"{BASE_URL}/packages/{test_ids['package_smart']}/meraaj-share", json={
            'enabled': True,
            'buyer_commission_mode': 'amount',
            'buyer_commission_value': 100,
            'commission_direction': 'added',
            'seats_allocated': 20
        })
        if resp.status_code != 200:
            log(f"❌ Share failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        market = data.get('meraaj', {}).get('market_pricing', [])
        double = next((r for r in market if r['room_type'] == 'double'), None)
        
        log(f"   Double room (added mode):")
        log(f"     Customer: adult={double['customer']['adult']}, child={double['customer']['child']}, infant={double['customer']['infant']}")
        log(f"     Net: adult={double['net']['adult']}, child={double['net']['child']}, infant={double['net']['infant']}")
        
        # In 'added' mode: customer = base + commission, net = base
        if double['customer']['adult'] != 1600 or double['customer']['child'] != 1200 or double['customer']['infant'] != 200:
            log(f"❌ Customer prices incorrect (should be base + commission)")
            return False
        if double['net']['adult'] != 1500 or double['net']['child'] != 1100 or double['net']['infant'] != 100:
            log(f"❌ Net prices incorrect (should equal base)")
            return False
        
        log(f"✅ Added direction working correctly")
        return True
        
    except Exception as e:
        log(f"❌ Share test error: {e}")
        return False

def test_1_share_percent():
    """TEST 1.4: Share with percent mode"""
    log("\n=== TEST 1.4: Share with percent mode (10%, deducted) ===")
    
    try:
        resp = session.post(f"{BASE_URL}/packages/{test_ids['package_smart']}/meraaj-share", json={
            'enabled': True,
            'buyer_commission_mode': 'percent',
            'buyer_commission_value': 10,
            'commission_direction': 'deducted',
            'seats_allocated': 20
        })
        if resp.status_code != 200:
            log(f"❌ Share failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        market = data.get('meraaj', {}).get('market_pricing', [])
        double = next((r for r in market if r['room_type'] == 'double'), None)
        
        log(f"   Double room (percent mode):")
        log(f"     Commission: adult={double['commission']['adult']}, child={double['commission']['child']}, infant={double['commission']['infant']}")
        log(f"     Net: adult={double['net']['adult']}, child={double['net']['child']}, infant={double['net']['infant']}")
        
        # 10% of 1500 = 150, 10% of 1100 = 110, 10% of 100 = 10
        if double['commission']['adult'] != 150 or double['commission']['child'] != 110 or double['commission']['infant'] != 10:
            log(f"❌ Commission incorrect (should be 10% of base)")
            return False
        if double['net']['adult'] != 1350 or double['net']['child'] != 990 or double['net']['infant'] != 90:
            log(f"❌ Net prices incorrect")
            return False
        
        log(f"✅ Percent mode working correctly")
        return True
        
    except Exception as e:
        log(f"❌ Share test error: {e}")
        return False

def test_1_share_overflow():
    """TEST 1.5: Deducted overflow validation"""
    log("\n=== TEST 1.5: Deducted overflow (commission > price) ===")
    
    try:
        resp = session.post(f"{BASE_URL}/packages/{test_ids['package_smart']}/meraaj-share", json={
            'enabled': True,
            'buyer_commission_mode': 'amount',
            'buyer_commission_value': 1200,
            'commission_direction': 'deducted',
            'seats_allocated': 20
        })
        if resp.status_code == 400:
            log(f"✅ Correctly rejected overflow: {resp.json().get('error', '')}")
        else:
            log(f"❌ Expected 400, got {resp.status_code}")
            return False
        
        # Try with 'added' - should succeed
        resp = session.post(f"{BASE_URL}/packages/{test_ids['package_smart']}/meraaj-share", json={
            'enabled': True,
            'buyer_commission_mode': 'amount',
            'buyer_commission_value': 1200,
            'commission_direction': 'added',
            'seats_allocated': 20
        })
        if resp.status_code == 200:
            log(f"✅ Same value with 'added' direction accepted")
        else:
            log(f"❌ Added direction should accept high commission: {resp.status_code}")
            return False
        
        return True
        
    except Exception as e:
        log(f"❌ Overflow test error: {e}")
        return False

def test_1_restore_config():
    """TEST 1.6: Restore config for subsequent tests"""
    log("\n=== TEST 1.6: Restore config (amount 100, deducted) ===")
    
    try:
        resp = session.post(f"{BASE_URL}/packages/{test_ids['package_smart']}/meraaj-share", json={
            'enabled': True,
            'buyer_commission_mode': 'amount',
            'buyer_commission_value': 100,
            'commission_direction': 'deducted',
            'seats_allocated': 20
        })
        if resp.status_code != 200:
            log(f"❌ Restore failed: {resp.status_code}")
            return False
        log(f"✅ Config restored")
        return True
    except Exception as e:
        log(f"❌ Restore error: {e}")
        return False

def test_1_auto_resync():
    """TEST 1.7: Auto-resync on package update"""
    log("\n=== TEST 1.7: Auto-resync on room_pricing change ===")
    
    try:
        # Update room pricing
        resp = session.patch(f"{BASE_URL}/packages/{test_ids['package_smart']}", json={
            'room_pricing': [
                {
                    'type': 'double',
                    'sale_per_pax': 2000,  # Changed from 1500
                    'sale_child': 1500,     # Changed from 1100
                    'sale_infant': 100
                },
                {
                    'type': 'quad',
                    'sale_per_pax': 1000
                }
            ]
        })
        if resp.status_code != 200:
            log(f"❌ Package update failed: {resp.status_code} - {resp.text}")
            return False
        log(f"✅ Package updated with new room pricing")
        
        # Get package and verify market_pricing was auto-recomputed
        resp = session.get(f"{BASE_URL}/packages")
        if resp.status_code != 200:
            log(f"❌ Package fetch failed: {resp.status_code}")
            return False
        
        packages = resp.json()
        pkg = next((p for p in packages if p['id'] == test_ids['package_smart']), None)
        if not pkg:
            log(f"❌ Package not found in list")
            return False
        market = pkg.get('meraaj', {}).get('market_pricing', [])
        double = next((r for r in market if r['room_type'] == 'double'), None)
        
        if not double:
            log(f"❌ Double room not found after update")
            return False
        
        log(f"   Updated double room:")
        log(f"     Base adult: {double['base']['adult']} (expected 2000)")
        log(f"     Net adult: {double['net']['adult']} (expected 1900)")
        
        if double['base']['adult'] != 2000:
            log(f"❌ Base price not updated")
            return False
        if double['net']['adult'] != 1900:
            log(f"❌ Net price not recomputed (should be 2000 - 100 = 1900)")
            return False
        
        log(f"✅ Auto-resync working correctly")
        
        # Check if package.updated event was emitted
        resp = session.get(f"{BASE_URL}/meraaj/events")
        if resp.status_code == 200:
            events = resp.json()
            updated_events = [e for e in events if e.get('type') == 'package.updated']
            if updated_events:
                log(f"✅ package.updated event emitted ({len(updated_events)} events)")
                test_ids['meraaj_events'].extend([e['id'] for e in events])
            else:
                log(f"⚠️  No package.updated event found")
        
        return True
        
    except Exception as e:
        log(f"❌ Auto-resync test error: {e}")
        return False

def test_2_inbound_booking_match():
    """TEST 2.1: Inbound booking with matching price"""
    log("\n=== TEST 2.1: Inbound booking with age-aware pricing (price match) ===")
    
    # Current market after step 1.7: double customer {2000,1500,100}, quad customer {1000,1000,0}
    # Expected total: 2000 (adult 30y) + 1500 (child 8y) + 100 (infant 1y) + 1000 (adult 25y) = 4600
    
    try:
        event_id = f"v325-e1-{int(time.time())}-{random.randint(1000, 9999)}"
        booking_ref = f"MRJ-V325-1-{int(time.time())}"
        
        webhook_data = {
            'id': event_id,
            'type': 'meraaj.booking.created',
            'data': {
                'package_ref': test_ids['package_smart'],
                'booking_ref': booking_ref,
                'buyer_office_name': 'مكتب الاختبار',
                'registrants': [
                    {'name': 'A1', 'age': 30, 'room_type': 'double'},
                    {'name': 'C1', 'age': 8, 'room_type': 'double'},
                    {'name': 'I1', 'age': 1, 'room_type': 'double'},
                    {'name': 'A2', 'age': 25, 'room_type': 'quad'}
                ],
                'total_price': 4600,
                'currency': 'SAR'
            }
        }
        
        body = json.dumps(webhook_data)
        signature = hmac_sign(body)
        
        resp = requests.post(f"{BASE_URL}/meraaj/webhooks", 
            data=body,
            headers={
                'Content-Type': 'application/json',
                'x-meraaj-signature': signature
            }
        )
        
        if resp.status_code != 200:
            log(f"❌ Webhook failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        booking = data.get('inbound_booking', {})
        
        log(f"✅ Booking created: {booking.get('id')}")
        log(f"   Seats: {booking.get('seats')} (expected 3: 2 adults + 1 child, infant excluded)")
        log(f"   Pax: adults={booking.get('pax_adults')}, children={booking.get('pax_children')}, infants={booking.get('pax_infants')}")
        log(f"   Total price: {booking.get('total_price')} (computed)")
        log(f"   Sent total: {booking.get('sent_total')}")
        log(f"   Price check: {booking.get('price_check')}")
        log(f"   Agent commission: {booking.get('agent_commission_total')}")
        log(f"   Net to seller: {booking.get('net_to_seller_total')}")
        log(f"   Seats remaining: {data.get('seats_remaining')}")
        
        # Verify calculations
        if booking.get('seats') != 3:
            log(f"❌ Seats incorrect (should be 3: 2 adults + 1 child)")
            return False
        if booking.get('pax_adults') != 2 or booking.get('pax_children') != 1 or booking.get('pax_infants') != 1:
            log(f"❌ Pax counts incorrect")
            return False
        if booking.get('total_price') != 4600:
            log(f"❌ Total price incorrect (expected 4600)")
            return False
        if booking.get('price_check') != 'match':
            log(f"❌ Price check should be 'match'")
            return False
        
        # Commission: adult 100 + child 100 + infant 100 + quad adult 100 = 400
        if booking.get('agent_commission_total') != 400:
            log(f"❌ Agent commission incorrect (expected 400)")
            return False
        
        # Net: (2000-100) + (1500-100) + (100-100) + (1000-100) = 1900 + 1400 + 0 + 900 = 4200
        if booking.get('net_to_seller_total') != 4200:
            log(f"❌ Net to seller incorrect (expected 4200)")
            return False
        
        if data.get('seats_remaining') != 17:
            log(f"❌ Seats remaining incorrect (expected 17 = 20 - 3)")
            return False
        
        # Verify registrants have age_category and price
        registrants = booking.get('registrants', [])
        if len(registrants) != 4:
            log(f"❌ Registrants count incorrect")
            return False
        
        for r in registrants:
            if 'age_category' not in r or 'price' not in r:
                log(f"❌ Registrant missing age_category or price: {r}")
                return False
        
        test_ids['inbound_bookings'].append(booking.get('id'))
        test_ids['booking_ref_for_cancel'] = booking_ref  # Store for cancel test
        log(f"✅ All calculations correct")
        
        # Verify booking appears in GET /meraaj/inbound-bookings
        resp = session.get(f"{BASE_URL}/meraaj/inbound-bookings")
        if resp.status_code == 200:
            bookings = resp.json()
            if any(b.get('id') == booking.get('id') for b in bookings):
                log(f"✅ Booking appears in GET /meraaj/inbound-bookings")
            else:
                log(f"⚠️  Booking not found in listing")
        
        return True
        
    except Exception as e:
        log(f"❌ Inbound booking test error: {e}")
        return False

def test_2_inbound_booking_mismatch():
    """TEST 2.2: Inbound booking with price mismatch"""
    log("\n=== TEST 2.2: Inbound booking with price mismatch ===")
    
    try:
        event_id = f"v325-e2-{int(time.time())}-{random.randint(1000, 9999)}"
        
        webhook_data = {
            'id': event_id,
            'type': 'meraaj.booking.created',
            'data': {
                'package_ref': test_ids['package_smart'],
                'booking_ref': f"MRJ-V325-2-{int(time.time())}",
                'buyer_office_name': 'مكتب الاختبار 2',
                'registrants': [
                    {'name': 'A3', 'age': 35, 'room_type': 'double'}
                ],
                'total_price': 9999,  # Wrong price
                'currency': 'SAR'
            }
        }
        
        body = json.dumps(webhook_data)
        signature = hmac_sign(body)
        
        resp = requests.post(f"{BASE_URL}/meraaj/webhooks", 
            data=body,
            headers={
                'Content-Type': 'application/json',
                'x-meraaj-signature': signature
            }
        )
        
        if resp.status_code != 200:
            log(f"❌ Webhook failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        booking = data.get('inbound_booking', {})
        
        log(f"✅ Booking accepted despite mismatch")
        log(f"   Price check: {booking.get('price_check')}")
        log(f"   Total price (computed): {booking.get('total_price')}")
        log(f"   Sent total: {booking.get('sent_total')}")
        
        if booking.get('price_check') != 'mismatch':
            log(f"❌ Price check should be 'mismatch'")
            return False
        if booking.get('total_price') != 2000:
            log(f"❌ Total price should be computed (2000), not sent value")
            return False
        if booking.get('sent_total') != 9999:
            log(f"❌ Sent total should be preserved (9999)")
            return False
        
        test_ids['inbound_bookings'].append(booking.get('id'))
        log(f"✅ Price mismatch handled correctly")
        return True
        
    except Exception as e:
        log(f"❌ Mismatch test error: {e}")
        return False

def test_2_inbound_unknown_room():
    """TEST 2.3: Inbound booking with unknown room type"""
    log("\n=== TEST 2.3: Inbound booking with unknown room type ===")
    
    try:
        event_id = f"v325-e3-{int(time.time())}-{random.randint(1000, 9999)}"
        
        webhook_data = {
            'id': event_id,
            'type': 'meraaj.booking.created',
            'data': {
                'package_ref': test_ids['package_smart'],
                'booking_ref': f"MRJ-V325-3-{int(time.time())}",
                'buyer_office_name': 'مكتب الاختبار 3',
                'registrants': [
                    {'name': 'A4', 'age': 40, 'room_type': 'penthouse'}
                ],
                'total_price': 5000,
                'currency': 'SAR'
            }
        }
        
        body = json.dumps(webhook_data)
        signature = hmac_sign(body)
        
        resp = requests.post(f"{BASE_URL}/meraaj/webhooks", 
            data=body,
            headers={
                'Content-Type': 'application/json',
                'x-meraaj-signature': signature
            }
        )
        
        if resp.status_code == 400:
            error = resp.json().get('error', '')
            log(f"✅ Correctly rejected: {error}")
            if 'penthouse' in error and ('double' in error or 'quad' in error):
                log(f"✅ Error lists available room types")
                return True
            else:
                log(f"⚠️  Error message doesn't list available types")
                return True
        else:
            log(f"❌ Expected 400, got {resp.status_code}")
            return False
        
    except Exception as e:
        log(f"❌ Unknown room test error: {e}")
        return False

def test_2_inbound_no_registrants():
    """TEST 2.4: Inbound booking without registrants"""
    log("\n=== TEST 2.4: Inbound booking without registrants ===")
    
    try:
        event_id = f"v325-e4-{int(time.time())}-{random.randint(1000, 9999)}"
        
        webhook_data = {
            'id': event_id,
            'type': 'meraaj.booking.created',
            'data': {
                'package_ref': test_ids['package_smart'],
                'booking_ref': f"MRJ-V325-4-{int(time.time())}",
                'buyer_office_name': 'مكتب الاختبار 4',
                'total_price': 1000,
                'currency': 'SAR'
            }
        }
        
        body = json.dumps(webhook_data)
        signature = hmac_sign(body)
        
        resp = requests.post(f"{BASE_URL}/meraaj/webhooks", 
            data=body,
            headers={
                'Content-Type': 'application/json',
                'x-meraaj-signature': signature
            }
        )
        
        if resp.status_code == 400:
            log(f"✅ Correctly rejected: {resp.json().get('error', '')}")
            return True
        else:
            log(f"❌ Expected 400, got {resp.status_code}")
            return False
        
    except Exception as e:
        log(f"❌ No registrants test error: {e}")
        return False

def test_2_inbound_infants_only():
    """TEST 2.5: Inbound booking with infants only"""
    log("\n=== TEST 2.5: Inbound booking with infants only ===")
    
    try:
        event_id = f"v325-e5-{int(time.time())}-{random.randint(1000, 9999)}"
        
        webhook_data = {
            'id': event_id,
            'type': 'meraaj.booking.created',
            'data': {
                'package_ref': test_ids['package_smart'],
                'booking_ref': f"MRJ-V325-5-{int(time.time())}",
                'buyer_office_name': 'مكتب الاختبار 5',
                'registrants': [
                    {'name': 'I2', 'age': 1, 'room_type': 'double'}
                ],
                'total_price': 100,
                'currency': 'SAR'
            }
        }
        
        body = json.dumps(webhook_data)
        signature = hmac_sign(body)
        
        resp = requests.post(f"{BASE_URL}/meraaj/webhooks", 
            data=body,
            headers={
                'Content-Type': 'application/json',
                'x-meraaj-signature': signature
            }
        )
        
        if resp.status_code == 400:
            error = resp.json().get('error', '')
            log(f"✅ Correctly rejected: {error}")
            if 'بالغ' in error or 'طفل' in error:
                log(f"✅ Error mentions need for adult/child")
            return True
        else:
            log(f"❌ Expected 400, got {resp.status_code}")
            return False
        
    except Exception as e:
        log(f"❌ Infants only test error: {e}")
        return False

def test_2_cancel_booking():
    """TEST 2.6: Cancel booking"""
    log("\n=== TEST 2.6: Cancel booking ===")
    
    try:
        event_id = f"v325-e6-{int(time.time())}-{random.randint(1000, 9999)}"
        booking_ref = test_ids.get('booking_ref_for_cancel', 'MRJ-V325-1')
        
        webhook_data = {
            'id': event_id,
            'type': 'meraaj.booking.cancelled',
            'data': {
                'booking_ref': booking_ref,
                'reason': 'اختبار الإلغاء'
            }
        }
        
        body = json.dumps(webhook_data)
        signature = hmac_sign(body)
        
        resp = requests.post(f"{BASE_URL}/meraaj/webhooks", 
            data=body,
            headers={
                'Content-Type': 'application/json',
                'x-meraaj-signature': signature
            }
        )
        
        if resp.status_code != 200:
            log(f"❌ Cancel failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        log(f"✅ Booking cancelled")
        log(f"   Released seats: {data.get('released_seats')}")
        
        if data.get('released_seats') != 3:
            log(f"❌ Released seats incorrect (expected 3)")
            return False
        
        # Verify seats_sold decreased
        resp = session.get(f"{BASE_URL}/packages")
        if resp.status_code == 200:
            packages = resp.json()
            pkg = next((p for p in packages if p['id'] == test_ids['package_smart']), None)
            if pkg:
                seats_sold = pkg.get('meraaj', {}).get('seats_sold', 0)
                log(f"   Current seats_sold: {seats_sold}")
                # Should be back to 1 (only MRJ-V325-2 remains)
        
        log(f"✅ Cancellation working correctly")
        return True
        
    except Exception as e:
        log(f"❌ Cancel test error: {e}")
        return False

def test_3_s2s_get_package():
    """TEST 3: S2S GET /api/meraaj/packages/:id"""
    log("\n=== TEST 3: S2S GET /api/meraaj/packages/:id ===")
    
    try:
        path = f"/meraaj/packages/{test_ids['package_smart']}"
        headers = s2s_headers(path)
        
        resp = requests.get(f"{BASE_URL}{path}", headers=headers)
        
        if resp.status_code != 200:
            log(f"❌ S2S GET failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        log(f"✅ S2S GET successful")
        log(f"   Package: {data.get('name')}")
        log(f"   Market pricing rows: {len(data.get('meraaj', {}).get('market_pricing', []))}")
        log(f"   Commission direction: {data.get('meraaj', {}).get('commission_direction')}")
        log(f"   Features: {data.get('features', [])}")
        log(f"   Image URL: {data.get('image_url')}")
        
        # Verify required fields
        meraaj = data.get('meraaj', {})
        if 'market_pricing' not in meraaj:
            log(f"❌ market_pricing missing")
            return False
        if 'commission_direction' not in meraaj:
            log(f"❌ commission_direction missing")
            return False
        if 'features' not in data:
            log(f"❌ features missing")
            return False
        if 'image_url' not in data:
            log(f"❌ image_url missing")
            return False
        
        if len(meraaj.get('market_pricing', [])) != 2:
            log(f"❌ market_pricing should have 2 rows")
            return False
        
        log(f"✅ All required fields present")
        return True
        
    except Exception as e:
        log(f"❌ S2S GET test error: {e}")
        return False

def test_cleanup():
    """Cleanup all test data"""
    log("\n=== CLEANUP ===")
    
    success = True
    
    # List inbound bookings (no delete endpoint)
    try:
        resp = session.get(f"{BASE_URL}/meraaj/inbound-bookings")
        if resp.status_code == 200:
            bookings = resp.json()
            test_bookings = [b for b in bookings if b.get('id') in test_ids['inbound_bookings']]
            if test_bookings:
                log(f"⚠️  Leftover inbound bookings (no delete endpoint): {[b['id'] for b in test_bookings]}")
    except Exception as e:
        log(f"⚠️  Error listing inbound bookings: {e}")
    
    # List meraaj events (no delete endpoint)
    try:
        resp = session.get(f"{BASE_URL}/meraaj/events")
        if resp.status_code == 200:
            events = resp.json()
            test_events = [e for e in events if e.get('payload', {}).get('package_ref') == test_ids['package_smart']]
            if test_events:
                log(f"⚠️  Leftover meraaj_events (no delete endpoint): {[e['id'] for e in test_events]}")
    except Exception as e:
        log(f"⚠️  Error listing meraaj events: {e}")
    
    # Unshare package
    if test_ids['package_smart']:
        try:
            resp = session.post(f"{BASE_URL}/packages/{test_ids['package_smart']}/meraaj-share", json={
                'enabled': False
            })
            if resp.status_code == 200:
                log(f"✅ Package unshared")
            else:
                log(f"⚠️  Unshare failed: {resp.status_code}")
        except Exception as e:
            log(f"⚠️  Unshare error: {e}")
    
    # Delete component
    if test_ids['component'] and test_ids['package_smart']:
        try:
            resp = session.delete(f"{BASE_URL}/packages/{test_ids['package_smart']}/components/{test_ids['component']}")
            if resp.status_code == 200:
                log(f"✅ Component deleted")
            else:
                log(f"⚠️  Component delete failed: {resp.status_code}")
        except Exception as e:
            log(f"⚠️  Component delete error: {e}")
    
    # Delete package SMART-v325
    if test_ids['package_smart']:
        try:
            resp = session.delete(f"{BASE_URL}/packages/{test_ids['package_smart']}")
            if resp.status_code == 200:
                log(f"✅ Package SMART-v325 deleted")
            else:
                log(f"⚠️  Package delete failed: {resp.status_code} - {resp.text}")
                success = False
        except Exception as e:
            log(f"⚠️  Package delete error: {e}")
            success = False
    
    # Delete supplier
    if test_ids['supplier']:
        try:
            resp = session.delete(f"{BASE_URL}/suppliers/{test_ids['supplier']}")
            if resp.status_code == 200:
                log(f"✅ Supplier deleted")
            else:
                log(f"⚠️  Supplier delete failed: {resp.status_code}")
        except Exception as e:
            log(f"⚠️  Supplier delete error: {e}")
    
    return success

def main():
    """Run all tests"""
    log("=" * 80)
    log("v3.25 Backend Test Suite - Smart Meraaj Share + Age-Aware Inbound Booking")
    log("=" * 80)
    
    results = {}
    
    # Setup
    if not test_login():
        log("\n❌ FATAL: Login failed, cannot continue")
        return
    
    if not test_setup_data():
        log("\n❌ FATAL: Setup failed, cannot continue")
        return
    
    # Test 1: Smart Share
    results['1.1_no_room_prices'] = test_1_share_without_room_prices()
    results['1.2_share_deducted'] = test_1_share_smart_deducted()
    results['1.3_share_added'] = test_1_share_added()
    results['1.4_share_percent'] = test_1_share_percent()
    results['1.5_share_overflow'] = test_1_share_overflow()
    results['1.6_restore_config'] = test_1_restore_config()
    results['1.7_auto_resync'] = test_1_auto_resync()
    
    # Test 2: Age-aware inbound bookings
    results['2.1_inbound_match'] = test_2_inbound_booking_match()
    results['2.2_inbound_mismatch'] = test_2_inbound_booking_mismatch()
    results['2.3_inbound_unknown_room'] = test_2_inbound_unknown_room()
    results['2.4_inbound_no_registrants'] = test_2_inbound_no_registrants()
    results['2.5_inbound_infants_only'] = test_2_inbound_infants_only()
    results['2.6_cancel_booking'] = test_2_cancel_booking()
    
    # Test 3: S2S regression
    results['3_s2s_get_package'] = test_3_s2s_get_package()
    
    # Cleanup
    test_cleanup()
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status} - {test}")
    
    log(f"\nTotal: {passed}/{total} tests passed ({passed*100//total}%)")
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED!")
    else:
        log(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == '__main__':
    main()
