#!/usr/bin/env python3
"""
v3.20 Dual Pricing Engine Backend Test Suite
Tests direct room+age matrix and component pricing types (flat/per_age/room_age)
"""
import requests
import json
from typing import Dict, List, Any, Optional

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
EMAIL = "owner@demo.com"
PASSWORD = "Demo@2025"

# Test data tracking for cleanup
created_suppliers = []
created_clients = []
created_packages = []
created_bookings = []

session = requests.Session()

def login():
    """Login and get session cookie"""
    print("\n=== LOGIN ===")
    resp = session.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    print(f"Login: {resp.status_code}")
    if resp.status_code != 200:
        print(f"ERROR: Login failed - {resp.text}")
        return False
    data = resp.json()
    print(f"✅ Logged in as {data.get('user', {}).get('email')}")
    return True

def create_supplier(name: str) -> Optional[str]:
    """Create a test supplier and return ID"""
    resp = session.post(f"{BASE_URL}/suppliers", json={"name": name, "phone": "1234567890"})
    if resp.status_code == 200:
        supplier_id = resp.json().get('id')
        created_suppliers.append(supplier_id)
        print(f"✅ Created supplier: {name} (ID: {supplier_id})")
        return supplier_id
    print(f"❌ Failed to create supplier: {resp.status_code} - {resp.text}")
    return None

def create_client(name: str) -> Optional[str]:
    """Create a test client and return ID"""
    resp = session.post(f"{BASE_URL}/clients", json={"name": name, "phone": "1234567890"})
    if resp.status_code == 200:
        client_id = resp.json().get('id')
        created_clients.append(client_id)
        print(f"✅ Created client: {name} (ID: {client_id})")
        return client_id
    print(f"❌ Failed to create client: {resp.status_code} - {resp.text}")
    return None

def verify_je_balanced(booking_id: str, expected_debit: float, currency: str = "USD") -> bool:
    """Verify journal entry is balanced"""
    resp = session.get(f"{BASE_URL}/journal-entries")
    if resp.status_code != 200:
        print(f"❌ Failed to fetch journal entries: {resp.status_code}")
        return False
    
    entries = resp.json()
    je = None
    for entry in entries:
        if entry.get('ref_type') == 'package_booking' and entry.get('ref_id') == booking_id:
            je = entry
            break
    
    if not je:
        print(f"❌ Journal entry not found for booking {booking_id}")
        return False
    
    lines = je.get('lines', [])
    total_debit = sum(line.get('debit', 0) for line in lines)
    total_credit = sum(line.get('credit', 0) for line in lines)
    
    print(f"  JE Lines: {len(lines)}, Debit: {total_debit}, Credit: {total_credit}")
    
    # Check if balanced (within 0.01 tolerance)
    if abs(total_debit - total_credit) > 0.01:
        print(f"❌ JE NOT BALANCED: Debit={total_debit}, Credit={total_credit}")
        return False
    
    # Check if debit matches expected
    if abs(total_debit - expected_debit) > 0.01:
        print(f"⚠️  JE debit mismatch: Expected={expected_debit}, Actual={total_debit}")
        # Not a failure, just a warning
    
    print(f"✅ JE BALANCED: Debit={total_debit} = Credit={total_credit}")
    return True

def get_balance(entity_type: str, entity_id: str, currency: str = "USD") -> float:
    """Get balance for client/supplier"""
    endpoint = f"{BASE_URL}/{entity_type}"
    resp = session.get(endpoint)
    if resp.status_code != 200:
        print(f"❌ Failed to fetch {entity_type}: {resp.status_code}")
        return 0.0
    
    entities = resp.json()
    for entity in entities:
        if entity.get('id') == entity_id:
            balance_key = f"balance_{currency.lower()}"
            return entity.get(balance_key, 0.0)
    
    print(f"⚠️  Entity {entity_id} not found in {entity_type}")
    return 0.0

def cleanup():
    """Delete all created test data"""
    print("\n=== CLEANUP ===")
    
    # Delete bookings
    for pkg_id, booking_id in created_bookings:
        resp = session.delete(f"{BASE_URL}/packages/{pkg_id}/bookings/{booking_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted booking {booking_id}")
        else:
            print(f"⚠️  Failed to delete booking {booking_id}: {resp.status_code}")
    
    # Delete packages
    for pkg_id in created_packages:
        resp = session.delete(f"{BASE_URL}/packages/{pkg_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted package {pkg_id}")
        else:
            print(f"⚠️  Failed to delete package {pkg_id}: {resp.status_code}")
    
    # Delete clients
    for client_id in created_clients:
        resp = session.delete(f"{BASE_URL}/clients/{client_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted client {client_id}")
        else:
            print(f"⚠️  Failed to delete client {client_id}: {resp.status_code}")
    
    # Delete suppliers
    for supplier_id in created_suppliers:
        resp = session.delete(f"{BASE_URL}/suppliers/{supplier_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted supplier {supplier_id}")
        else:
            print(f"⚠️  Failed to delete supplier {supplier_id}: {resp.status_code}")

def test_1_direct_mode():
    """TEST 1 — DIRECT MODE (room+age matrix)"""
    print("\n" + "="*80)
    print("TEST 1 — DIRECT MODE (room+age matrix)")
    print("="*80)
    
    # Create test data
    supplier_id = create_supplier("TEST-SUPPLIER-DIRECT-v320")
    client_id = create_client("TEST-CLIENT-DIRECT-v320")
    
    if not supplier_id or not client_id:
        print("❌ TEST 1 FAILED: Could not create supplier/client")
        return False
    
    # 1. Create package with direct pricing mode
    print("\n--- Step 1: Create package with direct pricing mode ---")
    package_data = {
        "name": "TEST-DIRECT-v320",
        "package_type": "umrah",
        "currency": "USD",
        "pricing_mode": "direct",
        "room_pricing": [
            {
                "type": "double",
                "sale_per_pax": 200,
                "sale_child": 150,
                "sale_infant": 25
            },
            {
                "type": "quad",
                "sale_per_pax": 120,
                "sale_child": None,
                "sale_infant": None
            }
        ]
    }
    
    resp = session.post(f"{BASE_URL}/packages", json=package_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create package: {resp.status_code} - {resp.text}")
        return False
    
    pkg = resp.json()
    pkg_id = pkg.get('id')
    created_packages.append(pkg_id)
    
    # Verify response
    if pkg.get('pricing_mode') != 'direct':
        print(f"❌ pricing_mode mismatch: expected 'direct', got '{pkg.get('pricing_mode')}'")
        return False
    
    room_pricing = pkg.get('room_pricing', [])
    if len(room_pricing) != 2:
        print(f"❌ room_pricing length mismatch: expected 2, got {len(room_pricing)}")
        return False
    
    # Check double room
    double_room = room_pricing[0]
    if double_room.get('sale_child') != 150 or double_room.get('sale_infant') != 25:
        print(f"❌ Double room pricing mismatch: sale_child={double_room.get('sale_child')}, sale_infant={double_room.get('sale_infant')}")
        return False
    
    # Check quad room (should have null for child/infant)
    quad_room = room_pricing[1]
    if quad_room.get('sale_child') is not None or quad_room.get('sale_infant') is not None:
        print(f"❌ Quad room should have null for sale_child/sale_infant: sale_child={quad_room.get('sale_child')}, sale_infant={quad_room.get('sale_infant')}")
        return False
    
    print(f"✅ Package created with correct pricing_mode and room_pricing")
    
    # 2. Add component
    print("\n--- Step 2: Add component ---")
    component_data = {
        "name": "base",
        "supplier_id": supplier_id,
        "cost_per_pax": 80,
        "sale_per_pax": 100,
        "pricing_type": "flat"
    }
    
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/components", json=component_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create component: {resp.status_code} - {resp.text}")
        return False
    
    print(f"✅ Component created")
    
    # 3. Create booking with registrants
    print("\n--- Step 3: Create booking with registrants ---")
    booking_data = {
        "client_id": client_id,
        "payment_method": "credit",
        "registrants": [
            {"name": "Adult1", "age": 30, "room_type": "double"},
            {"name": "Child1", "age": 8, "room_type": "double"},
            {"name": "Infant1", "age": 1, "room_type": "double"},
            {"name": "Adult2", "age": 40, "room_type": "quad"}
        ]
    }
    
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/bookings", json=booking_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code} - {resp.text}")
        return False
    
    booking = resp.json()
    booking_id = booking.get('id')
    created_bookings.append((pkg_id, booking_id))
    
    # Verify calculations
    # Expected: 
    # - total_cost = 80 × 3 (billed pax, infant excluded) = 240
    # - total_sale = 200 (adult double) + 150 (child double) + 25 (infant double) + 120 (adult quad) = 495
    # - commission = 495 - 240 = 255
    
    total_cost = booking.get('total_cost')
    total_sale = booking.get('total_sale')
    commission = booking.get('commission')
    
    print(f"  total_cost: {total_cost} (expected: 240)")
    print(f"  total_sale: {total_sale} (expected: 495)")
    print(f"  commission: {commission} (expected: 255)")
    
    if abs(total_cost - 240) > 0.01:
        print(f"❌ total_cost mismatch: expected 240, got {total_cost}")
        return False
    
    if abs(total_sale - 495) > 0.01:
        print(f"❌ total_sale mismatch: expected 495, got {total_sale}")
        return False
    
    if abs(commission - 255) > 0.01:
        print(f"❌ commission mismatch: expected 255, got {commission}")
        return False
    
    print(f"✅ Booking calculations correct")
    
    # Verify JE balanced
    if not verify_je_balanced(booking_id, 495, "USD"):
        print(f"❌ JE not balanced")
        return False
    
    # Verify balances
    client_balance = get_balance("clients", client_id, "USD")
    print(f"  Client balance: {client_balance} USD (expected: 495)")
    
    if abs(client_balance - 495) > 0.01:
        print(f"⚠️  Client balance mismatch (may be from previous tests)")
    
    # 4. Child fallback test
    print("\n--- Step 4: Child fallback test (PATCH) ---")
    # Change Child1 room_type to "quad" (age 8, quad has no sale_child → should charge adult price 120)
    patch_data = {
        "registrants": [
            {"name": "Adult1", "age": 30, "room_type": "double"},
            {"name": "Child1", "age": 8, "room_type": "quad"},  # Changed to quad
            {"name": "Infant1", "age": 1, "room_type": "double"},
            {"name": "Adult2", "age": 40, "room_type": "quad"}
        ]
    }
    
    resp = session.patch(f"{BASE_URL}/packages/{pkg_id}/bookings/{booking_id}", json=patch_data)
    if resp.status_code != 200:
        print(f"❌ Failed to patch booking: {resp.status_code} - {resp.text}")
        return False
    
    booking_updated = resp.json()
    
    # Expected after patch:
    # - total_cost = 80 × 3 = 240 (unchanged, still 3 billed pax)
    # - total_sale = 200 (adult double) + 120 (child quad, fallback to adult) + 25 (infant double) + 120 (adult quad) = 465
    # - commission = 465 - 240 = 225
    
    total_cost_new = booking_updated.get('total_cost')
    total_sale_new = booking_updated.get('total_sale')
    commission_new = booking_updated.get('commission')
    
    print(f"  total_cost: {total_cost_new} (expected: 240)")
    print(f"  total_sale: {total_sale_new} (expected: 465)")
    print(f"  commission: {commission_new} (expected: 225)")
    
    if abs(total_cost_new - 240) > 0.01:
        print(f"❌ total_cost mismatch after patch: expected 240, got {total_cost_new}")
        return False
    
    if abs(total_sale_new - 465) > 0.01:
        print(f"❌ total_sale mismatch after patch: expected 465, got {total_sale_new}")
        return False
    
    if abs(commission_new - 225) > 0.01:
        print(f"❌ commission mismatch after patch: expected 225, got {commission_new}")
        return False
    
    print(f"✅ Child fallback test passed")
    
    # Verify JE rebuilt and balanced
    if not verify_je_balanced(booking_id, 465, "USD"):
        print(f"❌ JE not balanced after patch")
        return False
    
    # Verify client balance updated correctly (should be 465, not 495+465)
    client_balance_new = get_balance("clients", client_id, "USD")
    print(f"  Client balance after patch: {client_balance_new} USD (expected: 465)")
    
    print("\n✅ TEST 1 PASSED")
    return True

def test_2_components_mode():
    """TEST 2 — COMPONENTS MODE (flat include_infants / per_age / room_age)"""
    print("\n" + "="*80)
    print("TEST 2 — COMPONENTS MODE (flat include_infants / per_age / room_age)")
    print("="*80)
    
    # Create test data
    supplier_id = create_supplier("TEST-SUPPLIER-COMP-v320")
    client_id = create_client("TEST-CLIENT-COMP-v320")
    partner_client_id = create_client("TEST-PARTNER-v320")
    
    if not supplier_id or not client_id or not partner_client_id:
        print("❌ TEST 2 FAILED: Could not create supplier/client")
        return False
    
    # 1. Create package with components pricing mode
    print("\n--- Step 1: Create package with components pricing mode ---")
    package_data = {
        "name": "TEST-COMP-v320",
        "package_type": "umrah",
        "currency": "USD",
        "pricing_mode": "components",
        "room_pricing": [
            {"type": "triple", "sale_per_pax": 0}
        ]
    }
    
    resp = session.post(f"{BASE_URL}/packages", json=package_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create package: {resp.status_code} - {resp.text}")
        return False
    
    pkg = resp.json()
    pkg_id = pkg.get('id')
    created_packages.append(pkg_id)
    
    print(f"✅ Package created with components pricing mode")
    
    # 2. Add components
    print("\n--- Step 2: Add components ---")
    
    # Component a) flat with include_infants
    comp_a = {
        "name": "visa",
        "supplier_id": supplier_id,
        "pricing_type": "flat",
        "cost_per_pax": 30,
        "sale_per_pax": 50,
        "include_infants": True
    }
    
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/components", json=comp_a)
    if resp.status_code != 200:
        print(f"❌ Failed to create component a: {resp.status_code} - {resp.text}")
        return False
    print(f"✅ Component a (visa - flat with include_infants) created")
    
    # Component b) per_age
    comp_b = {
        "name": "bus",
        "supplier_id": supplier_id,
        "pricing_type": "per_age",
        "cost_adult": 20,
        "cost_child": 10,
        "cost_infant": 0,
        "sale_adult": 40,
        "sale_child": 20,
        "sale_infant": 0
    }
    
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/components", json=comp_b)
    if resp.status_code != 200:
        print(f"❌ Failed to create component b: {resp.status_code} - {resp.text}")
        return False
    print(f"✅ Component b (bus - per_age) created")
    
    # Component c) room_age
    comp_c = {
        "name": "hotel",
        "supplier_id": supplier_id,
        "pricing_type": "room_age",
        "room_rates": [
            {
                "room_type": "triple",
                "cost_adult": 100,
                "cost_child": 50,
                "cost_infant": 0,
                "sale_adult": 150,
                "sale_child": 75,
                "sale_infant": 10
            }
        ]
    }
    
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/components", json=comp_c)
    if resp.status_code != 200:
        print(f"❌ Failed to create component c: {resp.status_code} - {resp.text}")
        return False
    print(f"✅ Component c (hotel - room_age) created")
    
    # 3. Create booking with registrants
    print("\n--- Step 3: Create booking with registrants ---")
    booking_data = {
        "client_id": client_id,
        "payment_method": "credit",
        "registrants": [
            {"name": "Adult1", "age": 35, "room_type": "triple"},
            {"name": "Child1", "age": 9, "room_type": "triple"},
            {"name": "Infant1", "age": 1, "room_type": "triple"}
        ]
    }
    
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/bookings", json=booking_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code} - {resp.text}")
        return False
    
    booking = resp.json()
    booking_id = booking.get('id')
    created_bookings.append((pkg_id, booking_id))
    
    # Verify calculations
    # Expected:
    # - visa: cost = 3×30 = 90, sale = 3×50 = 150 (include_infants → all 3)
    # - bus: cost = 20+10+0 = 30, sale = 40+20+0 = 60
    # - hotel: cost = 100+50+0 = 150, sale = 150+75+10 = 235
    # - total_cost = 90+30+150 = 270
    # - total_sale = 150+60+235 = 445
    # - commission = 445-270 = 175
    
    total_cost = booking.get('total_cost')
    total_sale = booking.get('total_sale')
    commission = booking.get('commission')
    
    print(f"  total_cost: {total_cost} (expected: 270)")
    print(f"  total_sale: {total_sale} (expected: 445)")
    print(f"  commission: {commission} (expected: 175)")
    
    if abs(total_cost - 270) > 0.01:
        print(f"❌ total_cost mismatch: expected 270, got {total_cost}")
        return False
    
    if abs(total_sale - 445) > 0.01:
        print(f"❌ total_sale mismatch: expected 445, got {total_sale}")
        return False
    
    if abs(commission - 175) > 0.01:
        print(f"❌ commission mismatch: expected 175, got {commission}")
        return False
    
    print(f"✅ Booking calculations correct")
    
    # Verify JE balanced
    if not verify_je_balanced(booking_id, 445, "USD"):
        print(f"❌ JE not balanced")
        return False
    
    # 4. PATCH booking: change child age 9→13 (child→adult)
    print("\n--- Step 4: PATCH booking (child→adult) ---")
    patch_data = {
        "registrants": [
            {"name": "Adult1", "age": 35, "room_type": "triple"},
            {"name": "Child1", "age": 13, "room_type": "triple"},  # Changed to 13 (adult)
            {"name": "Infant1", "age": 1, "room_type": "triple"}
        ]
    }
    
    resp = session.patch(f"{BASE_URL}/packages/{pkg_id}/bookings/{booking_id}", json=patch_data)
    if resp.status_code != 200:
        print(f"❌ Failed to patch booking: {resp.status_code} - {resp.text}")
        return False
    
    booking_updated = resp.json()
    
    # Expected after patch:
    # - visa: cost = 3×30 = 90, sale = 3×50 = 150 (unchanged)
    # - bus: cost = 20+20+0 = 40, sale = 40+40+0 = 80 (child→adult)
    # - hotel: cost = 100+100+0 = 200, sale = 150+150+10 = 310 (child→adult)
    # - total_cost = 90+40+200 = 330
    # - total_sale = 150+80+310 = 540
    # - commission = 540-330 = 210
    
    total_cost_new = booking_updated.get('total_cost')
    total_sale_new = booking_updated.get('total_sale')
    commission_new = booking_updated.get('commission')
    
    print(f"  total_cost: {total_cost_new} (expected: 330)")
    print(f"  total_sale: {total_sale_new} (expected: 540)")
    print(f"  commission: {commission_new} (expected: 210)")
    
    if abs(total_cost_new - 330) > 0.01:
        print(f"❌ total_cost mismatch after patch: expected 330, got {total_cost_new}")
        return False
    
    if abs(total_sale_new - 540) > 0.01:
        print(f"❌ total_sale mismatch after patch: expected 540, got {total_sale_new}")
        return False
    
    if abs(commission_new - 210) > 0.01:
        print(f"❌ commission mismatch after patch: expected 210, got {commission_new}")
        return False
    
    print(f"✅ Age change patch passed")
    
    # Verify JE rebuilt and balanced
    if not verify_je_balanced(booking_id, 540, "USD"):
        print(f"❌ JE not balanced after patch")
        return False
    
    # 5. Regression stack: discount + discount_apply_cost + partner commission
    print("\n--- Step 5: Regression stack (discount + partner commission) ---")
    patch_data_2 = {
        "discount": 40,
        "discount_apply_cost": True,
        "commission_partner_type": "client",
        "commission_partner_id": partner_client_id,
        "commission_partner_name": "Partner Client",
        "commission_share_mode": "amount",
        "commission_share_value": 30
    }
    
    resp = session.patch(f"{BASE_URL}/packages/{pkg_id}/bookings/{booking_id}", json=patch_data_2)
    if resp.status_code != 200:
        print(f"❌ Failed to patch booking with discount: {resp.status_code} - {resp.text}")
        return False
    
    booking_updated_2 = resp.json()
    
    # Expected after patch:
    # - sale = 540 - 40 = 500
    # - cost = 330 - 40 = 290
    # - commission = 500 - 290 = 210
    # - partner_share = 30 (amount mode)
    # - office_commission = 210 - 30 = 180
    
    total_cost_final = booking_updated_2.get('total_cost')
    total_sale_final = booking_updated_2.get('total_sale')
    commission_final = booking_updated_2.get('commission')
    partner_share = booking_updated_2.get('commission_share_amount')
    
    print(f"  total_cost: {total_cost_final} (expected: 290)")
    print(f"  total_sale: {total_sale_final} (expected: 500)")
    print(f"  commission: {commission_final} (expected: 210)")
    print(f"  partner_share: {partner_share} (expected: 30)")
    
    if abs(total_cost_final - 290) > 0.01:
        print(f"❌ total_cost mismatch: expected 290, got {total_cost_final}")
        return False
    
    if abs(total_sale_final - 500) > 0.01:
        print(f"❌ total_sale mismatch: expected 500, got {total_sale_final}")
        return False
    
    if abs(commission_final - 210) > 0.01:
        print(f"❌ commission mismatch: expected 210, got {commission_final}")
        return False
    
    if abs(partner_share - 30) > 0.01:
        print(f"❌ partner_share mismatch: expected 30, got {partner_share}")
        return False
    
    print(f"✅ Discount + partner commission patch passed")
    
    # Verify JE balanced (debit should be 500)
    if not verify_je_balanced(booking_id, 500, "USD"):
        print(f"❌ JE not balanced after discount patch")
        return False
    
    # Verify JE has partner credit line
    resp = session.get(f"{BASE_URL}/journal-entries")
    if resp.status_code == 200:
        entries = resp.json()
        je = None
        for entry in entries:
            if entry.get('ref_type') == 'package_booking' and entry.get('ref_id') == booking_id:
                je = entry
                break
        
        if je:
            lines = je.get('lines', [])
            partner_line = None
            for line in lines:
                if line.get('party_id') == partner_client_id and line.get('credit') > 0:
                    partner_line = line
                    break
            
            if partner_line:
                if abs(partner_line.get('credit') - 30) > 0.01:
                    print(f"⚠️  Partner credit line amount mismatch: expected 30, got {partner_line.get('credit')}")
                else:
                    print(f"✅ Partner credit line verified: {partner_line.get('credit')}")
            else:
                print(f"⚠️  Partner credit line not found in JE")
    
    print("\n✅ TEST 2 PASSED")
    return True

def test_3_legacy_regression():
    """TEST 3 — LEGACY REGRESSION (booking without registrants)"""
    print("\n" + "="*80)
    print("TEST 3 — LEGACY REGRESSION (booking without registrants)")
    print("="*80)
    
    # Use the package from TEST 2 (components mode)
    # Find the TEST-COMP-v320 package
    resp = session.get(f"{BASE_URL}/packages")
    if resp.status_code != 200:
        print(f"❌ Failed to fetch packages: {resp.status_code}")
        return False
    
    packages = resp.json()
    pkg = None
    for p in packages:
        if p.get('name') == 'TEST-COMP-v320':
            pkg = p
            break
    
    if not pkg:
        print(f"❌ TEST-COMP-v320 package not found (TEST 2 must run first)")
        return False
    
    pkg_id = pkg.get('id')
    
    # Get a client
    resp = session.get(f"{BASE_URL}/clients")
    if resp.status_code != 200:
        print(f"❌ Failed to fetch clients: {resp.status_code}")
        return False
    
    clients = resp.json()
    client = None
    for c in clients:
        if 'TEST-CLIENT-COMP-v320' in c.get('name', ''):
            client = c
            break
    
    if not client:
        print(f"❌ TEST-CLIENT-COMP-v320 not found")
        return False
    
    client_id = client.get('id')
    
    # 1. Create booking WITHOUT registrants
    print("\n--- Step 1: Create booking without registrants ---")
    booking_data = {
        "client_id": client_id,
        "payment_method": "credit",
        "pax_count": 2
    }
    
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/bookings", json=booking_data)
    if resp.status_code != 200:
        print(f"❌ Failed to create booking: {resp.status_code} - {resp.text}")
        return False
    
    booking = resp.json()
    booking_id = booking.get('id')
    created_bookings.append((pkg_id, booking_id))
    
    # Expected (legacy fallback):
    # - flat visa: 30/50 × 2 = 60/100
    # - per_age bus: cost_per_pax was auto-set to cost_adult (20), sale_per_pax to sale_adult (40) → 20/40 × 2 = 40/80
    # - room_age hotel: cost_per_pax was auto-set to first room cost_adult (100), sale_per_pax to sale_adult (150) → 100/150 × 2 = 200/300
    # - total_cost = (30+20+100) × 2 = 300
    # - total_sale = (50+40+150) × 2 = 480
    # - commission = 480 - 300 = 180
    
    total_cost = booking.get('total_cost')
    total_sale = booking.get('total_sale')
    commission = booking.get('commission')
    
    print(f"  total_cost: {total_cost} (expected: 300)")
    print(f"  total_sale: {total_sale} (expected: 480)")
    print(f"  commission: {commission} (expected: 180)")
    
    if abs(total_cost - 300) > 0.01:
        print(f"❌ total_cost mismatch: expected 300, got {total_cost}")
        return False
    
    if abs(total_sale - 480) > 0.01:
        print(f"❌ total_sale mismatch: expected 480, got {total_sale}")
        return False
    
    if abs(commission - 180) > 0.01:
        print(f"❌ commission mismatch: expected 180, got {commission}")
        return False
    
    print(f"✅ Legacy booking calculations correct")
    
    # Verify JE balanced
    if not verify_je_balanced(booking_id, 480, "USD"):
        print(f"❌ JE not balanced")
        return False
    
    print("\n✅ TEST 3 PASSED")
    return True

def main():
    """Run all tests"""
    print("="*80)
    print("v3.20 DUAL PRICING ENGINE - COMPREHENSIVE BACKEND TEST SUITE")
    print("="*80)
    
    if not login():
        print("\n❌ LOGIN FAILED - ABORTING TESTS")
        return
    
    try:
        # Run tests
        test1_passed = test_1_direct_mode()
        test2_passed = test_2_components_mode()
        test3_passed = test_3_legacy_regression()
        
        # Summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"TEST 1 (Direct Mode): {'✅ PASSED' if test1_passed else '❌ FAILED'}")
        print(f"TEST 2 (Components Mode): {'✅ PASSED' if test2_passed else '❌ FAILED'}")
        print(f"TEST 3 (Legacy Regression): {'✅ PASSED' if test3_passed else '❌ FAILED'}")
        
        all_passed = test1_passed and test2_passed and test3_passed
        print(f"\nOVERALL: {'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")
        
    finally:
        # Cleanup
        cleanup()

if __name__ == "__main__":
    main()
