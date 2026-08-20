#!/usr/bin/env python3
"""
v3.21 Backend Test Suite
Tests 3 new endpoints:
1. POST /api/packages/:id/duplicate - Duplicate package with components
2. GET /api/partners/commissions - Partner commission statement
3. GET /api/my/installment-alert - Installment alert for tenant
"""
import requests
import json
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
EMAIL = "owner@demo.com"
PASSWORD = "Demo@2025"

# Test data tracking for cleanup
created_suppliers = []
created_clients = []
created_packages = []
created_bookings = []
created_visas = []
created_services = []
created_boxes = []

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

def create_client(name: str, client_type: str = "regular") -> Optional[str]:
    """Create a test client and return ID"""
    resp = session.post(f"{BASE_URL}/clients", json={"name": name, "phone": "1234567890", "client_type": client_type})
    if resp.status_code == 200:
        client_id = resp.json().get('id')
        created_clients.append(client_id)
        print(f"✅ Created client: {name} (ID: {client_id}, type: {client_type})")
        return client_id
    print(f"❌ Failed to create client: {resp.status_code} - {resp.text}")
    return None

def get_or_create_cash_box() -> Optional[str]:
    """Get existing cash box or create one"""
    resp = session.get(f"{BASE_URL}/boxes")
    if resp.status_code == 200:
        boxes = resp.json()
        for box in boxes:
            if box.get('type') == 'cash':
                print(f"✅ Using existing cash box: {box.get('id')}")
                return box.get('id')
    # If no cash box found, create one
    resp = session.post(f"{BASE_URL}/boxes", json={"name_ar": "صندوق اختبار v321", "type": "cash"})
    if resp.status_code == 200:
        box_id = resp.json().get('id')
        created_boxes.append(box_id)
        print(f"✅ Created cash box: {box_id}")
        return box_id
    print(f"❌ Failed to get/create cash box: {resp.status_code} - {resp.text}")
    return None

def cleanup():
    """Delete all created test data"""
    print("\n=== CLEANUP ===")
    
    # Delete bookings
    for booking_id in created_bookings:
        # Find package_id for this booking
        for pkg_id in created_packages:
            resp = session.delete(f"{BASE_URL}/packages/{pkg_id}/bookings/{booking_id}")
            if resp.status_code == 200:
                print(f"✅ Deleted booking: {booking_id}")
                break
    
    # Delete visas
    for visa_id in created_visas:
        resp = session.delete(f"{BASE_URL}/visas/{visa_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted visa: {visa_id}")
    
    # Delete services
    for service_id in created_services:
        resp = session.delete(f"{BASE_URL}/services/{service_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted service: {service_id}")
    
    # Delete packages
    for pkg_id in created_packages:
        resp = session.delete(f"{BASE_URL}/packages/{pkg_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted package: {pkg_id}")
    
    # Delete clients
    for client_id in created_clients:
        resp = session.delete(f"{BASE_URL}/clients/{client_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted client: {client_id}")
    
    # Delete suppliers
    for supplier_id in created_suppliers:
        resp = session.delete(f"{BASE_URL}/suppliers/{supplier_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted supplier: {supplier_id}")
    
    # Delete boxes (only ones we created)
    for box_id in created_boxes:
        resp = session.delete(f"{BASE_URL}/boxes/{box_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted box: {box_id}")
    
    print("✅ Cleanup complete")

# ============================================================================
# TEST 1: DUPLICATE PACKAGE
# ============================================================================

def test_duplicate_package():
    """Test POST /api/packages/:id/duplicate"""
    print("\n" + "="*80)
    print("TEST 1: DUPLICATE PACKAGE - POST /api/packages/:id/duplicate")
    print("="*80)
    
    # Setup: Create supplier
    supplier_id = create_supplier("SUPPLIER-DUP-v321")
    if not supplier_id:
        print("❌ TEST 1 FAILED: Could not create supplier")
        return False
    
    # Setup: Create source package with room pricing
    print("\n--- Setup: Create source package ---")
    package_data = {
        "name": "DUP-SRC-v321",
        "package_type": "umrah",
        "currency": "USD",
        "pricing_mode": "direct",
        "room_pricing": [
            {
                "type": "double",
                "sale_per_pax": 200,
                "sale_child": 150,
                "sale_infant": 25
            }
        ]
    }
    resp = session.post(f"{BASE_URL}/packages", json=package_data)
    if resp.status_code != 200:
        print(f"❌ TEST 1 FAILED: Could not create source package - {resp.status_code} - {resp.text}")
        return False
    
    src_pkg = resp.json()
    src_pkg_id = src_pkg.get('id')
    created_packages.append(src_pkg_id)
    print(f"✅ Created source package: {src_pkg_id}")
    
    # Setup: Add 2 components (one flat, one per_age)
    print("\n--- Setup: Add components ---")
    
    # Component 1: Flat pricing
    comp1_data = {
        "name": "Transport",
        "supplier_id": supplier_id,
        "pricing_type": "flat",
        "cost_per_pax": 80,
        "sale_per_pax": 100
    }
    resp = session.post(f"{BASE_URL}/packages/{src_pkg_id}/components", json=comp1_data)
    if resp.status_code != 200:
        print(f"❌ TEST 1 FAILED: Could not create component 1 - {resp.status_code} - {resp.text}")
        return False
    comp1 = resp.json()
    print(f"✅ Created component 1 (flat): {comp1.get('id')}")
    
    # Component 2: Per-age pricing
    comp2_data = {
        "name": "Meals",
        "supplier_id": supplier_id,
        "pricing_type": "per_age",
        "cost_adult": 20,
        "cost_child": 10,
        "cost_infant": 0,
        "sale_adult": 40,
        "sale_child": 20,
        "sale_infant": 0
    }
    resp = session.post(f"{BASE_URL}/packages/{src_pkg_id}/components", json=comp2_data)
    if resp.status_code != 200:
        print(f"❌ TEST 1 FAILED: Could not create component 2 - {resp.status_code} - {resp.text}")
        return False
    comp2 = resp.json()
    print(f"✅ Created component 2 (per_age): {comp2.get('id')}")
    
    # Test 1.1: Duplicate with custom name
    print("\n--- Test 1.1: Duplicate with custom name ---")
    resp = session.post(f"{BASE_URL}/packages/{src_pkg_id}/duplicate", json={"name": "DUP-COPY-v321"})
    if resp.status_code != 200:
        print(f"❌ TEST 1.1 FAILED: Duplicate request failed - {resp.status_code} - {resp.text}")
        return False
    
    dup_pkg = resp.json()
    dup_pkg_id = dup_pkg.get('id')
    created_packages.append(dup_pkg_id)
    
    # Verify response
    if dup_pkg_id == src_pkg_id:
        print(f"❌ TEST 1.1 FAILED: Duplicate has same ID as source")
        return False
    if dup_pkg.get('name') != "DUP-COPY-v321":
        print(f"❌ TEST 1.1 FAILED: Name mismatch - expected 'DUP-COPY-v321', got '{dup_pkg.get('name')}'")
        return False
    if dup_pkg.get('status') != 'open':
        print(f"❌ TEST 1.1 FAILED: Status should be 'open', got '{dup_pkg.get('status')}'")
        return False
    if dup_pkg.get('duplicated_from') != src_pkg_id:
        print(f"❌ TEST 1.1 FAILED: duplicated_from should be '{src_pkg_id}', got '{dup_pkg.get('duplicated_from')}'")
        return False
    if dup_pkg.get('pricing_mode') != 'direct':
        print(f"❌ TEST 1.1 FAILED: pricing_mode should be 'direct', got '{dup_pkg.get('pricing_mode')}'")
        return False
    if dup_pkg.get('components_copied') != 2:
        print(f"❌ TEST 1.1 FAILED: components_copied should be 2, got {dup_pkg.get('components_copied')}")
        return False
    
    # Verify room_pricing preserved
    dup_room_pricing = dup_pkg.get('room_pricing', [])
    if len(dup_room_pricing) != 1:
        print(f"❌ TEST 1.1 FAILED: room_pricing should have 1 entry, got {len(dup_room_pricing)}")
        return False
    room = dup_room_pricing[0]
    if room.get('type') != 'double' or room.get('sale_per_pax') != 200 or room.get('sale_child') != 150 or room.get('sale_infant') != 25:
        print(f"❌ TEST 1.1 FAILED: room_pricing not preserved correctly - {room}")
        return False
    
    print(f"✅ TEST 1.1 PASSED: Duplicate created with ID={dup_pkg_id}, name='DUP-COPY-v321', status='open', duplicated_from={src_pkg_id}, components_copied=2")
    
    # Test 1.2: Verify components copied with new IDs
    print("\n--- Test 1.2: Verify components copied ---")
    resp = session.get(f"{BASE_URL}/packages/{dup_pkg_id}/components")
    if resp.status_code != 200:
        print(f"❌ TEST 1.2 FAILED: Could not fetch components - {resp.status_code} - {resp.text}")
        return False
    
    dup_comps = resp.json()
    if len(dup_comps) != 2:
        print(f"❌ TEST 1.2 FAILED: Expected 2 components, got {len(dup_comps)}")
        return False
    
    # Verify component 1 (flat)
    flat_comp = next((c for c in dup_comps if c.get('pricing_type') == 'flat'), None)
    if not flat_comp:
        print(f"❌ TEST 1.2 FAILED: Flat component not found")
        return False
    if flat_comp.get('id') == comp1.get('id'):
        print(f"❌ TEST 1.2 FAILED: Flat component has same ID as source")
        return False
    if flat_comp.get('cost_per_pax') != 80 or flat_comp.get('sale_per_pax') != 100:
        print(f"❌ TEST 1.2 FAILED: Flat component pricing not preserved - cost_per_pax={flat_comp.get('cost_per_pax')}, sale_per_pax={flat_comp.get('sale_per_pax')}")
        return False
    if flat_comp.get('supplier_id') != supplier_id:
        print(f"❌ TEST 1.2 FAILED: Flat component supplier_id not preserved")
        return False
    
    # Verify component 2 (per_age)
    per_age_comp = next((c for c in dup_comps if c.get('pricing_type') == 'per_age'), None)
    if not per_age_comp:
        print(f"❌ TEST 1.2 FAILED: Per-age component not found")
        return False
    if per_age_comp.get('id') == comp2.get('id'):
        print(f"❌ TEST 1.2 FAILED: Per-age component has same ID as source")
        return False
    if (per_age_comp.get('cost_adult') != 20 or per_age_comp.get('cost_child') != 10 or 
        per_age_comp.get('cost_infant') != 0 or per_age_comp.get('sale_adult') != 40 or 
        per_age_comp.get('sale_child') != 20 or per_age_comp.get('sale_infant') != 0):
        print(f"❌ TEST 1.2 FAILED: Per-age component pricing not preserved")
        return False
    if per_age_comp.get('supplier_id') != supplier_id:
        print(f"❌ TEST 1.2 FAILED: Per-age component supplier_id not preserved")
        return False
    
    print(f"✅ TEST 1.2 PASSED: 2 components copied with new IDs, pricing preserved (flat: cost_per_pax=80/sale_per_pax=100, per_age: 6 age fields)")
    
    # Test 1.3: Verify no bookings copied
    print("\n--- Test 1.3: Verify no bookings copied ---")
    resp = session.get(f"{BASE_URL}/packages/{dup_pkg_id}/bookings")
    if resp.status_code != 200:
        print(f"❌ TEST 1.3 FAILED: Could not fetch bookings - {resp.status_code} - {resp.text}")
        return False
    
    dup_bookings = resp.json()
    if len(dup_bookings) != 0:
        print(f"❌ TEST 1.3 FAILED: Expected 0 bookings, got {len(dup_bookings)}")
        return False
    
    print(f"✅ TEST 1.3 PASSED: No bookings copied (empty array)")
    
    # Test 1.4: Duplicate without body (default name)
    print("\n--- Test 1.4: Duplicate without body (default name) ---")
    resp = session.post(f"{BASE_URL}/packages/{src_pkg_id}/duplicate", json={})
    if resp.status_code != 200:
        print(f"❌ TEST 1.4 FAILED: Duplicate request failed - {resp.status_code} - {resp.text}")
        return False
    
    dup_pkg2 = resp.json()
    dup_pkg2_id = dup_pkg2.get('id')
    created_packages.append(dup_pkg2_id)
    
    expected_name = "DUP-SRC-v321 — نسخة"
    if dup_pkg2.get('name') != expected_name:
        print(f"❌ TEST 1.4 FAILED: Name should be '{expected_name}', got '{dup_pkg2.get('name')}'")
        return False
    
    print(f"✅ TEST 1.4 PASSED: Duplicate without body created with default name '{expected_name}'")
    
    # Test 1.5: Duplicate non-existent package
    print("\n--- Test 1.5: Duplicate non-existent package ---")
    resp = session.post(f"{BASE_URL}/packages/nonexistent-id-v321/duplicate", json={})
    if resp.status_code == 404:
        print(f"✅ TEST 1.5 PASSED: Non-existent package returns 404")
    else:
        print(f"❌ TEST 1.5 FAILED: Expected 404, got {resp.status_code}")
        return False
    
    # Test 1.6: Functional test - Create booking on duplicate
    print("\n--- Test 1.6: Functional test - Create booking on duplicate ---")
    
    # Create client for booking
    client_id = create_client("CLIENT-DUP-v321")
    if not client_id:
        print(f"❌ TEST 1.6 FAILED: Could not create client")
        return False
    
    # Create booking with registrants (1 adult age 30, 1 child age 8, both double room)
    booking_data = {
        "client_id": client_id,
        "payment_method": "credit",
        "registrants": [
            {"name": "Adult A", "age": 30, "room_type": "double"},
            {"name": "Child C", "age": 8, "room_type": "double"}
        ]
    }
    resp = session.post(f"{BASE_URL}/packages/{dup_pkg_id}/bookings", json=booking_data)
    if resp.status_code != 200:
        print(f"❌ TEST 1.6 FAILED: Could not create booking - {resp.status_code} - {resp.text}")
        return False
    
    booking = resp.json()
    booking_id = booking.get('id')
    created_bookings.append(booking_id)
    
    # Verify calculations
    # Room sale: adult (200) + child (150) = 350
    # Component costs: flat (80×2=160) + per_age (adult 20 + child 10 = 30) = 190
    expected_sale = 350
    expected_cost = 190
    expected_commission = expected_sale - expected_cost  # 160
    
    actual_sale = booking.get('total_sale')
    actual_cost = booking.get('total_cost')
    actual_commission = booking.get('commission')
    
    if abs(actual_sale - expected_sale) > 0.01:
        print(f"❌ TEST 1.6 FAILED: total_sale should be {expected_sale}, got {actual_sale}")
        return False
    if abs(actual_cost - expected_cost) > 0.01:
        print(f"❌ TEST 1.6 FAILED: total_cost should be {expected_cost}, got {actual_cost}")
        return False
    if abs(actual_commission - expected_commission) > 0.01:
        print(f"❌ TEST 1.6 FAILED: commission should be {expected_commission}, got {actual_commission}")
        return False
    
    # Verify JE balanced
    resp = session.get(f"{BASE_URL}/journal-entries")
    if resp.status_code != 200:
        print(f"❌ TEST 1.6 FAILED: Could not fetch journal entries - {resp.status_code}")
        return False
    
    entries = resp.json()
    je = None
    for entry in entries:
        if entry.get('ref_type') == 'package_booking' and entry.get('ref_id') == booking_id:
            je = entry
            break
    
    if not je:
        print(f"❌ TEST 1.6 FAILED: Journal entry not found for booking")
        return False
    
    lines = je.get('lines', [])
    total_debit = sum(line.get('debit', 0) for line in lines)
    total_credit = sum(line.get('credit', 0) for line in lines)
    
    if abs(total_debit - total_credit) > 0.01:
        print(f"❌ TEST 1.6 FAILED: JE not balanced - debit={total_debit}, credit={total_credit}")
        return False
    
    print(f"✅ TEST 1.6 PASSED: Booking created on duplicate package - sale={actual_sale}, cost={actual_cost}, commission={actual_commission}, JE balanced")
    
    print("\n" + "="*80)
    print("✅ TEST 1 COMPLETE: All 6 duplicate package tests passed")
    print("="*80)
    return True

# ============================================================================
# TEST 2: PARTNER COMMISSION STATEMENT
# ============================================================================

def test_partner_commissions():
    """Test GET /api/partners/commissions"""
    print("\n" + "="*80)
    print("TEST 2: PARTNER COMMISSION STATEMENT - GET /api/partners/commissions")
    print("="*80)
    
    # Setup: Create partner client
    partner_id = create_client("PARTNER-v321", client_type="client")
    if not partner_id:
        print("❌ TEST 2 FAILED: Could not create partner client")
        return False
    
    # Setup: Create regular client
    regular_client_id = create_client("REGULAR-CLIENT-v321")
    if not regular_client_id:
        print("❌ TEST 2 FAILED: Could not create regular client")
        return False
    
    # Setup: Create supplier
    supplier_id = create_supplier("SUPPLIER-PARTNER-v321")
    if not supplier_id:
        print("❌ TEST 2 FAILED: Could not create supplier")
        return False
    
    # Setup: Get cash box
    box_id = get_or_create_cash_box()
    if not box_id:
        print("❌ TEST 2 FAILED: Could not get cash box")
        return False
    
    # Setup: Create visa with commission sharing
    print("\n--- Setup: Create visa with commission sharing ---")
    visa_data = {
        "client_id": regular_client_id,
        "supplier_id": supplier_id,
        "service_type": "تأشيرة عمرة",
        "beneficiary_name": "Visa Beneficiary",
        "beneficiary_phone": "1234567890",
        "passport_no": "VP321001",
        "cost": 50,
        "sale_price": 100,
        "currency": "USD",
        "payment_method": "credit",
        "commission_partner_type": "client",
        "commission_partner_id": partner_id,
        "commission_share_mode": "amount",
        "commission_share_value": 20
    }
    resp = session.post(f"{BASE_URL}/visas", json=visa_data)
    if resp.status_code != 200:
        print(f"❌ TEST 2 FAILED: Could not create visa - {resp.status_code} - {resp.text}")
        return False
    visa = resp.json()
    visa_id = visa.get('id')
    created_visas.append(visa_id)
    print(f"✅ Created visa with commission_share_value=20, commission=50")
    
    # Setup: Create service with commission sharing
    print("\n--- Setup: Create service with commission sharing ---")
    service_data = {
        "client_id": regular_client_id,
        "supplier_id": supplier_id,
        "service_type": "خدمة نقل",
        "beneficiary_name": "Service Beneficiary",
        "cost": 30,
        "sale_price": 80,
        "currency": "USD",
        "payment_method": "credit",
        "commission_partner_type": "client",
        "commission_partner_id": partner_id,
        "commission_share_mode": "amount",
        "commission_share_value": 15
    }
    resp = session.post(f"{BASE_URL}/services", json=service_data)
    if resp.status_code != 200:
        print(f"❌ TEST 2 FAILED: Could not create service - {resp.status_code} - {resp.text}")
        return False
    service = resp.json()
    service_id = service.get('id')
    created_services.append(service_id)
    print(f"✅ Created service with commission_share_value=15, commission=50")
    
    # Setup: Create package booking with commission sharing
    print("\n--- Setup: Create package booking with commission sharing ---")
    
    # First create a package
    package_data = {
        "name": "PKG-PARTNER-v321",
        "package_type": "umrah",
        "currency": "USD",
        "pricing_mode": "direct",
        "room_pricing": [
            {"type": "double", "sale_per_pax": 100}
        ]
    }
    resp = session.post(f"{BASE_URL}/packages", json=package_data)
    if resp.status_code != 200:
        print(f"❌ TEST 2 FAILED: Could not create package - {resp.status_code} - {resp.text}")
        return False
    pkg = resp.json()
    pkg_id = pkg.get('id')
    created_packages.append(pkg_id)
    
    # Add component to package
    comp_data = {
        "name": "Hotel",
        "supplier_id": supplier_id,
        "pricing_type": "flat",
        "cost_per_pax": 50,
        "sale_per_pax": 80
    }
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/components", json=comp_data)
    if resp.status_code != 200:
        print(f"❌ TEST 2 FAILED: Could not create component - {resp.status_code} - {resp.text}")
        return False
    
    # Create booking with commission sharing
    booking_data = {
        "client_id": regular_client_id,
        "payment_method": "credit",
        "registrants": [
            {"name": "Pilgrim A", "age": 30, "room_type": "double"}
        ],
        "discount": 0,
        "commission_partner_type": "client",
        "commission_partner_id": partner_id,
        "commission_share_mode": "amount",
        "commission_share_value": 25
    }
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/bookings", json=booking_data)
    if resp.status_code != 200:
        print(f"❌ TEST 2 FAILED: Could not create booking - {resp.status_code} - {resp.text}")
        return False
    booking = resp.json()
    booking_id = booking.get('id')
    created_bookings.append(booking_id)
    print(f"✅ Created package booking with commission_share_value=25")
    
    # Test 2.1: Get partner commissions
    print("\n--- Test 2.1: Get partner commissions ---")
    resp = session.get(f"{BASE_URL}/partners/commissions?partner_id={partner_id}")
    if resp.status_code != 200:
        print(f"❌ TEST 2.1 FAILED: Request failed - {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    rows = data.get('rows', [])
    totals = data.get('totals', {})
    count = data.get('count', 0)
    
    # Verify at least 3 rows (visa, service, package)
    if len(rows) < 3:
        print(f"❌ TEST 2.1 FAILED: Expected at least 3 rows, got {len(rows)}")
        return False
    
    # Find visa row
    visa_row = next((r for r in rows if r.get('module') == 'visa'), None)
    if not visa_row:
        print(f"❌ TEST 2.1 FAILED: Visa row not found")
        return False
    if visa_row.get('module_label') != '🛂 تأشيرة':
        print(f"❌ TEST 2.1 FAILED: Visa module_label should be '🛂 تأشيرة', got '{visa_row.get('module_label')}'")
        return False
    if abs(visa_row.get('partner_share', 0) - 20) > 0.01:
        print(f"❌ TEST 2.1 FAILED: Visa partner_share should be 20, got {visa_row.get('partner_share')}")
        return False
    if abs(visa_row.get('total_commission', 0) - 50) > 0.01:
        print(f"❌ TEST 2.1 FAILED: Visa total_commission should be 50, got {visa_row.get('total_commission')}")
        return False
    
    # Find service row
    service_row = next((r for r in rows if r.get('module') == 'service'), None)
    if not service_row:
        print(f"❌ TEST 2.1 FAILED: Service row not found")
        return False
    if service_row.get('module_label') != '🧾 خدمة':
        print(f"❌ TEST 2.1 FAILED: Service module_label should be '🧾 خدمة', got '{service_row.get('module_label')}'")
        return False
    if abs(service_row.get('partner_share', 0) - 15) > 0.01:
        print(f"❌ TEST 2.1 FAILED: Service partner_share should be 15, got {service_row.get('partner_share')}")
        return False
    if abs(service_row.get('total_commission', 0) - 50) > 0.01:
        print(f"❌ TEST 2.1 FAILED: Service total_commission should be 50, got {service_row.get('total_commission')}")
        return False
    
    # Find package row
    package_row = next((r for r in rows if r.get('module') == 'package'), None)
    if not package_row:
        print(f"❌ TEST 2.1 FAILED: Package row not found")
        return False
    if package_row.get('module_label') != '📦 باكج':
        print(f"❌ TEST 2.1 FAILED: Package module_label should be '📦 باكج', got '{package_row.get('module_label')}'")
        return False
    if abs(package_row.get('partner_share', 0) - 25) > 0.01:
        print(f"❌ TEST 2.1 FAILED: Package partner_share should be 25, got {package_row.get('partner_share')}")
        return False
    
    # Verify totals
    if 'USD' not in totals:
        print(f"❌ TEST 2.1 FAILED: USD totals not found")
        return False
    
    usd_totals = totals['USD']
    expected_partner_share = 20 + 15 + 25  # 60
    if abs(usd_totals.get('partner_share', 0) - expected_partner_share) > 0.01:
        print(f"❌ TEST 2.1 FAILED: USD partner_share should be {expected_partner_share}, got {usd_totals.get('partner_share')}")
        return False
    
    expected_total_commission = 50 + 50 + booking.get('commission', 0)
    if abs(usd_totals.get('total_commission', 0) - expected_total_commission) > 0.01:
        print(f"❌ TEST 2.1 FAILED: USD total_commission should be {expected_total_commission}, got {usd_totals.get('total_commission')}")
        return False
    
    expected_office_share = expected_total_commission - expected_partner_share
    if abs(usd_totals.get('office_share', 0) - expected_office_share) > 0.01:
        print(f"❌ TEST 2.1 FAILED: USD office_share should be {expected_office_share}, got {usd_totals.get('office_share')}")
        return False
    
    if usd_totals.get('count', 0) < 3:
        print(f"❌ TEST 2.1 FAILED: USD count should be at least 3, got {usd_totals.get('count')}")
        return False
    
    print(f"✅ TEST 2.1 PASSED: Partner commissions returned {len(rows)} rows with correct module_labels (🛂, 🧾, 📦), partner_shares (20, 15, 25), and totals")
    
    # Test 2.2: Date filter
    print("\n--- Test 2.2: Date filter ---")
    
    # Test with future date (should return 0 rows)
    tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    resp = session.get(f"{BASE_URL}/partners/commissions?partner_id={partner_id}&from={tomorrow}")
    if resp.status_code != 200:
        print(f"❌ TEST 2.2 FAILED: Request with future date failed - {resp.status_code}")
        return False
    
    data = resp.json()
    if len(data.get('rows', [])) != 0:
        print(f"❌ TEST 2.2 FAILED: Future date filter should return 0 rows, got {len(data.get('rows', []))}")
        return False
    
    print(f"✅ TEST 2.2a PASSED: Future date filter returns 0 rows")
    
    # Test with past date range (should return all rows)
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    today = datetime.now().strftime('%Y-%m-%d')
    resp = session.get(f"{BASE_URL}/partners/commissions?partner_id={partner_id}&from={yesterday}&to={today}")
    if resp.status_code != 200:
        print(f"❌ TEST 2.2 FAILED: Request with date range failed - {resp.status_code}")
        return False
    
    data = resp.json()
    if len(data.get('rows', [])) < 3:
        print(f"❌ TEST 2.2 FAILED: Date range filter should return at least 3 rows, got {len(data.get('rows', []))}")
        return False
    
    print(f"✅ TEST 2.2b PASSED: Date range filter returns all rows")
    
    # Test 2.3: Missing partner_id
    print("\n--- Test 2.3: Missing partner_id ---")
    resp = session.get(f"{BASE_URL}/partners/commissions")
    if resp.status_code == 400:
        print(f"✅ TEST 2.3 PASSED: Missing partner_id returns 400 error")
    else:
        print(f"❌ TEST 2.3 FAILED: Expected 400, got {resp.status_code}")
        return False
    
    # Test 2.4: Partner with no commissions
    print("\n--- Test 2.4: Partner with no commissions ---")
    resp = session.get(f"{BASE_URL}/partners/commissions?partner_id={regular_client_id}")
    if resp.status_code != 200:
        print(f"❌ TEST 2.4 FAILED: Request failed - {resp.status_code}")
        return False
    
    data = resp.json()
    if len(data.get('rows', [])) != 0:
        print(f"❌ TEST 2.4 FAILED: Partner with no commissions should return 0 rows, got {len(data.get('rows', []))}")
        return False
    if len(data.get('totals', {})) != 0:
        print(f"❌ TEST 2.4 FAILED: Partner with no commissions should return empty totals, got {data.get('totals')}")
        return False
    
    print(f"✅ TEST 2.4 PASSED: Partner with no commissions returns rows:[], totals:{{}}")
    
    print("\n" + "="*80)
    print("✅ TEST 2 COMPLETE: All 4 partner commission tests passed")
    print("="*80)
    return True

# ============================================================================
# TEST 3: INSTALLMENT ALERT
# ============================================================================

def test_installment_alert():
    """Test GET /api/my/installment-alert"""
    print("\n" + "="*80)
    print("TEST 3: INSTALLMENT ALERT - GET /api/my/installment-alert")
    print("="*80)
    
    # Test 3.1: Get installment alert (expect null for demo tenant)
    print("\n--- Test 3.1: Get installment alert ---")
    resp = session.get(f"{BASE_URL}/my/installment-alert")
    if resp.status_code != 200:
        print(f"❌ TEST 3.1 FAILED: Request failed - {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    alert = data.get('alert')
    
    # Demo tenant likely doesn't have billing_mode='installments', so expect null
    if alert is None:
        print(f"✅ TEST 3.1 PASSED: Demo tenant not in installments mode, alert=null (EXPECTED)")
    else:
        # If tenant happens to have installments, verify alert structure
        print(f"⚠️  Demo tenant has installments mode enabled, verifying alert structure...")
        
        required_fields = ['no', 'amount', 'due_date', 'days_left', 'overdue', 'paid_count', 'total_count']
        for field in required_fields:
            if field not in alert:
                print(f"❌ TEST 3.1 FAILED: Alert missing required field '{field}'")
                return False
        
        # Verify days_left calculation
        due_date = datetime.fromisoformat(alert['due_date'].replace('Z', '+00:00'))
        today = datetime.now()
        expected_days_left = (due_date.date() - today.date()).days
        
        if abs(alert['days_left'] - expected_days_left) > 1:  # Allow 1 day tolerance for timezone
            print(f"❌ TEST 3.1 FAILED: days_left calculation incorrect - expected ~{expected_days_left}, got {alert['days_left']}")
            return False
        
        # Verify overdue flag
        expected_overdue = alert['days_left'] < 0
        if alert['overdue'] != expected_overdue:
            print(f"❌ TEST 3.1 FAILED: overdue flag incorrect - expected {expected_overdue}, got {alert['overdue']}")
            return False
        
        print(f"✅ TEST 3.1 PASSED: Alert structure valid - no={alert['no']}, amount={alert['amount']}, days_left={alert['days_left']}, overdue={alert['overdue']}")
    
    # Test 3.2: Verify endpoint requires auth
    print("\n--- Test 3.2: Verify endpoint requires auth ---")
    
    # Create new session without login
    unauth_session = requests.Session()
    resp = unauth_session.get(f"{BASE_URL}/my/installment-alert")
    
    if resp.status_code == 401:
        print(f"✅ TEST 3.2 PASSED: Unauthenticated request returns 401")
    else:
        print(f"❌ TEST 3.2 FAILED: Expected 401 for unauthenticated request, got {resp.status_code}")
        return False
    
    print("\n" + "="*80)
    print("✅ TEST 3 COMPLETE: All 2 installment alert tests passed")
    print("="*80)
    return True

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    """Run all v3.21 tests"""
    print("\n" + "="*80)
    print("v3.21 BACKEND TEST SUITE")
    print("Testing 3 new endpoints:")
    print("1. POST /api/packages/:id/duplicate")
    print("2. GET /api/partners/commissions")
    print("3. GET /api/my/installment-alert")
    print("="*80)
    
    try:
        # Login
        if not login():
            print("\n❌ FATAL: Login failed, cannot proceed")
            return
        
        # Run tests
        test1_passed = test_duplicate_package()
        test2_passed = test_partner_commissions()
        test3_passed = test_installment_alert()
        
        # Cleanup
        cleanup()
        
        # Summary
        print("\n" + "="*80)
        print("FINAL SUMMARY")
        print("="*80)
        print(f"TEST 1 (Duplicate Package): {'✅ PASSED' if test1_passed else '❌ FAILED'}")
        print(f"TEST 2 (Partner Commissions): {'✅ PASSED' if test2_passed else '❌ FAILED'}")
        print(f"TEST 3 (Installment Alert): {'✅ PASSED' if test3_passed else '❌ FAILED'}")
        print("="*80)
        
        if test1_passed and test2_passed and test3_passed:
            print("\n🎉 ALL TESTS PASSED 🎉")
        else:
            print("\n⚠️  SOME TESTS FAILED")
    
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        cleanup()

if __name__ == "__main__":
    main()
