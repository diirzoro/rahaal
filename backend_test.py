#!/usr/bin/env python3
"""
Backend Test for v3.20 - PATCH Package Booking: Smart Discount + Partner Commission
Tests PATCH /api/packages/:pkgId/bookings/:bookingId with discount_apply_cost and commission_share_*
"""

import requests
import json
from typing import Dict, Any, Optional

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
EMAIL = "owner@demo.com"
PASSWORD = "Demo@2025"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

# Test data IDs (will be populated during test)
test_data = {
    "supplier_id": None,
    "client_id": None,
    "partner_id": None,
    "box_id": None,
    "package_id": None,
    "component_id": None,
    "booking_id": None,
}

def log(msg: str):
    """Print test log message"""
    print(f"[TEST] {msg}")

def login() -> bool:
    """Login and get session cookie"""
    try:
        log("Logging in as owner@demo.com...")
        resp = session.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if resp.status_code == 200:
            log("✅ Login successful")
            return True
        else:
            log(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Login error: {e}")
        return False

def get_balance(entity_type: str, entity_id: str, currency: str = "USD") -> float:
    """Get balance for client/supplier"""
    try:
        # Get all entities and find the one with matching ID
        resp = session.get(f"{BASE_URL}/{entity_type}")
        if resp.status_code == 200:
            entities = resp.json()
            entity = next((e for e in entities if e.get("id") == entity_id), None)
            if entity:
                balances = entity.get("balances", {})
                return float(balances.get(currency, 0))
        return 0.0
    except Exception:
        return 0.0

def verify_je_balanced(booking_id: str) -> tuple[bool, dict]:
    """Verify journal entry is balanced (sum debits == sum credits)"""
    try:
        resp = session.get(f"{BASE_URL}/journal-entries")
        if resp.status_code != 200:
            return False, {"error": "Failed to fetch journal entries"}
        
        entries = resp.json()
        je = None
        for entry in entries:
            if entry.get("ref_type") == "package_booking" and entry.get("ref_id") == booking_id:
                je = entry
                break
        
        if not je:
            return False, {"error": "Journal entry not found"}
        
        lines = je.get("lines", [])
        total_debit = sum(float(line.get("debit", 0)) for line in lines)
        total_credit = sum(float(line.get("credit", 0)) for line in lines)
        
        balanced = abs(total_debit - total_credit) < 0.01
        
        return balanced, {
            "total_debit": round(total_debit, 2),
            "total_credit": round(total_credit, 2),
            "lines": lines,
            "balanced": balanced
        }
    except Exception as e:
        return False, {"error": str(e)}

def setup_test_data() -> bool:
    """Create all test entities"""
    try:
        import time
        timestamp = str(int(time.time()))
        
        # 1. Create supplier
        log("Creating test supplier...")
        resp = session.post(f"{BASE_URL}/suppliers", json={
            "name": f"TEST_SUPPLIER_V320_{timestamp}",
            "phone": "1234567890"
        })
        if resp.status_code != 200:
            log(f"❌ Failed to create supplier: {resp.text}")
            return False
        test_data["supplier_id"] = resp.json()["id"]
        log(f"✅ Supplier created: {test_data['supplier_id']}")
        
        # 2. Create client (credit)
        log("Creating test client...")
        resp = session.post(f"{BASE_URL}/clients", json={
            "name": f"TEST_CLIENT_V320_{timestamp}",
            "phone": "9876543210"
        })
        if resp.status_code != 200:
            log(f"❌ Failed to create client: {resp.text}")
            return False
        test_data["client_id"] = resp.json()["id"]
        log(f"✅ Client created: {test_data['client_id']}")
        
        # 3. Create partner client
        log("Creating test partner client...")
        resp = session.post(f"{BASE_URL}/clients", json={
            "name": f"TEST_PARTNER_V320_{timestamp}",
            "phone": "5555555555"
        })
        if resp.status_code != 200:
            log(f"❌ Failed to create partner: {resp.text}")
            return False
        test_data["partner_id"] = resp.json()["id"]
        log(f"✅ Partner created: {test_data['partner_id']}")
        
        # 4. Get existing box or create one
        log("Getting cash box...")
        resp = session.get(f"{BASE_URL}/boxes")
        if resp.status_code == 200:
            boxes = resp.json()
            if boxes:
                test_data["box_id"] = boxes[0]["id"]
                log(f"✅ Using existing box: {test_data['box_id']}")
            else:
                # Create box if none exists
                resp = session.post(f"{BASE_URL}/boxes", json={
                    "name_ar": "TEST_BOX_V320",
                    "name_en": "TEST_BOX_V320",
                    "type": "cash",
                    "currency": "USD"
                })
                if resp.status_code == 200:
                    test_data["box_id"] = resp.json()["id"]
                    log(f"✅ Box created: {test_data['box_id']}")
                else:
                    log(f"❌ Failed to create box: {resp.text}")
                    return False
        
        # 5. Create package
        log("Creating test package...")
        resp = session.post(f"{BASE_URL}/packages", json={
            "name": f"TEST_PACKAGE_V320_{timestamp}",
            "package_type": "عمرة",
            "currency": "USD",
            "status": "open"
        })
        if resp.status_code != 200:
            log(f"❌ Failed to create package: {resp.text}")
            return False
        test_data["package_id"] = resp.json()["id"]
        log(f"✅ Package created: {test_data['package_id']}")
        
        # 6. Add component to package
        log("Adding component to package...")
        resp = session.post(f"{BASE_URL}/packages/{test_data['package_id']}/components", json={
            "name": f"TEST_COMPONENT_V320_{timestamp}",
            "supplier_id": test_data["supplier_id"],
            "cost_per_pax": 100,
            "sale_per_pax": 150
        })
        if resp.status_code != 200:
            log(f"❌ Failed to create component: {resp.text}")
            return False
        test_data["component_id"] = resp.json()["id"]
        log(f"✅ Component created: {test_data['component_id']}")
        
        return True
    except Exception as e:
        log(f"❌ Setup error: {e}")
        return False

def test_create_booking_with_discount_and_commission() -> bool:
    """Test POST booking with discount_apply_cost=true and partner commission"""
    try:
        log("\n=== TEST A: Create booking with Smart Discount + Partner Commission ===")
        
        # Get partner name from test_data
        resp = session.get(f"{BASE_URL}/clients")
        partner_name = "TEST_PARTNER_V320"
        if resp.status_code == 200:
            clients = resp.json()
            partner = next((c for c in clients if c.get("id") == test_data["partner_id"]), None)
            if partner:
                partner_name = partner.get("name", "TEST_PARTNER_V320")
        
        # Get initial balances
        client_balance_before = get_balance("clients", test_data["client_id"], "USD")
        supplier_balance_before = get_balance("suppliers", test_data["supplier_id"], "USD")
        partner_balance_before = get_balance("clients", test_data["partner_id"], "USD")
        
        log(f"Initial balances - Client: {client_balance_before}, Supplier: {supplier_balance_before}, Partner: {partner_balance_before}")
        
        # Create booking
        booking_data = {
            "client_id": test_data["client_id"],
            "pax_count": 2,
            "discount": 50,
            "discount_apply_cost": True,
            "discount_reason": "test smart discount",
            "commission_partner_type": "client",
            "commission_partner_id": test_data["partner_id"],
            "commission_partner_name": partner_name,
            "commission_share_mode": "amount",
            "commission_share_value": 30,
            "payment_method": "credit"
        }
        
        log(f"Creating booking with data: {json.dumps(booking_data, indent=2)}")
        resp = session.post(f"{BASE_URL}/packages/{test_data['package_id']}/bookings", json=booking_data)
        
        if resp.status_code != 200:
            log(f"❌ Failed to create booking: {resp.status_code} - {resp.text}")
            return False
        
        booking = resp.json()
        test_data["booking_id"] = booking["id"]
        log(f"✅ Booking created: {test_data['booking_id']}")
        
        # Verify booking fields
        log("\nVerifying booking fields...")
        expected_base_sale = 300  # 150 * 2
        expected_base_cost = 200  # 100 * 2
        expected_sale = 250  # 300 - 50
        expected_cost = 150  # 200 - 50
        expected_commission = 100  # 250 - 150
        expected_partner_share = 30
        
        if booking.get("discount_apply_cost") != True:
            log(f"❌ discount_apply_cost should be True, got {booking.get('discount_apply_cost')}")
            return False
        
        if abs(booking.get("total_sale", 0) - expected_sale) > 0.01:
            log(f"❌ total_sale should be {expected_sale}, got {booking.get('total_sale')}")
            return False
        
        if abs(booking.get("total_cost", 0) - expected_cost) > 0.01:
            log(f"❌ total_cost should be {expected_cost}, got {booking.get('total_cost')}")
            return False
        
        if abs(booking.get("commission", 0) - expected_commission) > 0.01:
            log(f"❌ commission should be {expected_commission}, got {booking.get('commission')}")
            return False
        
        if abs(booking.get("commission_share_amount", 0) - expected_partner_share) > 0.01:
            log(f"❌ commission_share_amount should be {expected_partner_share}, got {booking.get('commission_share_amount')}")
            return False
        
        log("✅ All booking fields correct")
        
        # Verify journal entry is balanced
        log("\nVerifying journal entry...")
        balanced, je_data = verify_je_balanced(test_data["booking_id"])
        
        if not balanced:
            log(f"❌ Journal entry NOT balanced: {je_data}")
            return False
        
        log(f"✅ Journal entry balanced: Debit={je_data['total_debit']}, Credit={je_data['total_credit']}")
        
        # Verify JE lines
        lines = je_data["lines"]
        client_debit = next((l for l in lines if l.get("party_type") == "client" and l.get("party_id") == test_data["client_id"]), None)
        supplier_credit = next((l for l in lines if l.get("party_type") == "supplier" and l.get("party_id") == test_data["supplier_id"]), None)
        partner_credit = next((l for l in lines if l.get("party_type") == "client" and l.get("party_id") == test_data["partner_id"]), None)
        revenue_credit = next((l for l in lines if l.get("party_type") == "revenue"), None)
        
        if not client_debit or abs(client_debit.get("debit", 0) - 250) > 0.01:
            log(f"❌ Client debit should be 250, got {client_debit}")
            return False
        
        if not supplier_credit or abs(supplier_credit.get("credit", 0) - 150) > 0.01:
            log(f"❌ Supplier credit should be 150, got {supplier_credit}")
            return False
        
        if not partner_credit or abs(partner_credit.get("credit", 0) - 30) > 0.01:
            log(f"❌ Partner credit should be 30, got {partner_credit}")
            return False
        
        if not revenue_credit or abs(revenue_credit.get("credit", 0) - 70) > 0.01:
            log(f"❌ Revenue credit should be 70, got {revenue_credit}")
            return False
        
        log("✅ All JE lines correct")
        
        # Verify balances
        log("\nVerifying balances...")
        client_balance_after = get_balance("clients", test_data["client_id"], "USD")
        supplier_balance_after = get_balance("suppliers", test_data["supplier_id"], "USD")
        partner_balance_after = get_balance("clients", test_data["partner_id"], "USD")
        
        expected_client_balance = client_balance_before + 250
        expected_supplier_balance = supplier_balance_before + 150
        expected_partner_balance = partner_balance_before - 30
        
        if abs(client_balance_after - expected_client_balance) > 0.01:
            log(f"❌ Client balance should be {expected_client_balance}, got {client_balance_after}")
            return False
        
        if abs(supplier_balance_after - expected_supplier_balance) > 0.01:
            log(f"❌ Supplier balance should be {expected_supplier_balance}, got {supplier_balance_after}")
            return False
        
        if abs(partner_balance_after - expected_partner_balance) > 0.01:
            log(f"❌ Partner balance should be {expected_partner_balance}, got {partner_balance_after}")
            return False
        
        log(f"✅ All balances correct - Client: {client_balance_after}, Supplier: {supplier_balance_after}, Partner: {partner_balance_after}")
        
        return True
    except Exception as e:
        log(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_light_update() -> bool:
    """Test PATCH with only pilgrim_name change (light update)"""
    try:
        log("\n=== TEST B: Light update (pilgrim_name only) ===")
        
        # Get current booking
        resp = session.get(f"{BASE_URL}/packages/{test_data['package_id']}/bookings")
        if resp.status_code != 200:
            log(f"❌ Failed to get bookings: {resp.text}")
            return False
        
        bookings = resp.json()
        booking = next((b for b in bookings if b["id"] == test_data["booking_id"]), None)
        if not booking:
            log("❌ Booking not found")
            return False
        
        old_sale = booking["total_sale"]
        old_cost = booking["total_cost"]
        
        # PATCH with only pilgrim_name
        resp = session.patch(
            f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking_id']}",
            json={"pilgrim_name": "UPDATED_NAME_LIGHT"}
        )
        
        if resp.status_code != 200:
            log(f"❌ PATCH failed: {resp.status_code} - {resp.text}")
            return False
        
        updated = resp.json()
        
        # Verify _light_update flag
        if not updated.get("_light_update"):
            log(f"❌ _light_update flag should be True, got {updated.get('_light_update')}")
            return False
        
        # Verify amounts unchanged
        if abs(updated.get("total_sale", 0) - old_sale) > 0.01:
            log(f"❌ total_sale should be unchanged ({old_sale}), got {updated.get('total_sale')}")
            return False
        
        if abs(updated.get("total_cost", 0) - old_cost) > 0.01:
            log(f"❌ total_cost should be unchanged ({old_cost}), got {updated.get('total_cost')}")
            return False
        
        log("✅ Light update successful - no balance changes")
        return True
    except Exception as e:
        log(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_change_discount() -> bool:
    """Test PATCH with discount change (full recalc)"""
    try:
        log("\n=== TEST C: Change discount amount (full recalc) ===")
        
        # Get balances before
        client_balance_before = get_balance("clients", test_data["client_id"], "USD")
        supplier_balance_before = get_balance("suppliers", test_data["supplier_id"], "USD")
        partner_balance_before = get_balance("clients", test_data["partner_id"], "USD")
        
        log(f"Balances before - Client: {client_balance_before}, Supplier: {supplier_balance_before}, Partner: {partner_balance_before}")
        
        # PATCH with new discount
        resp = session.patch(
            f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking_id']}",
            json={
                "discount": 80,
                "discount_apply_cost": True
            }
        )
        
        if resp.status_code != 200:
            log(f"❌ PATCH failed: {resp.status_code} - {resp.text}")
            return False
        
        updated = resp.json()
        
        # Expected: sale=300-80=220, cost=200-80=120, commission=100, partner share still 30
        expected_sale = 220
        expected_cost = 120
        expected_commission = 100
        expected_partner_share = 30
        
        if abs(updated.get("total_sale", 0) - expected_sale) > 0.01:
            log(f"❌ total_sale should be {expected_sale}, got {updated.get('total_sale')}")
            return False
        
        if abs(updated.get("total_cost", 0) - expected_cost) > 0.01:
            log(f"❌ total_cost should be {expected_cost}, got {updated.get('total_cost')}")
            return False
        
        if abs(updated.get("commission", 0) - expected_commission) > 0.01:
            log(f"❌ commission should be {expected_commission}, got {updated.get('commission')}")
            return False
        
        log("✅ Booking amounts updated correctly")
        
        # Verify JE balanced
        balanced, je_data = verify_je_balanced(test_data["booking_id"])
        if not balanced:
            log(f"❌ Journal entry NOT balanced: {je_data}")
            return False
        
        log(f"✅ Journal entry balanced: Debit={je_data['total_debit']}, Credit={je_data['total_credit']}")
        
        # Verify balances show NET of new values only (not old + new)
        client_balance_after = get_balance("clients", test_data["client_id"], "USD")
        supplier_balance_after = get_balance("suppliers", test_data["supplier_id"], "USD")
        partner_balance_after = get_balance("clients", test_data["partner_id"], "USD")
        
        log(f"Balances after - Client: {client_balance_after}, Supplier: {supplier_balance_after}, Partner: {partner_balance_after}")
        
        # Client should have 220 (not 250+220), supplier 120, partner -30
        # But we need to account for the initial balances
        # The change should be: client -30 (250->220), supplier -30 (150->120), partner 0 (no change)
        expected_client_change = -30
        expected_supplier_change = -30
        expected_partner_change = 0
        
        actual_client_change = client_balance_after - client_balance_before
        actual_supplier_change = supplier_balance_after - supplier_balance_before
        actual_partner_change = partner_balance_after - partner_balance_before
        
        if abs(actual_client_change - expected_client_change) > 0.01:
            log(f"❌ Client balance change should be {expected_client_change}, got {actual_client_change}")
            return False
        
        if abs(actual_supplier_change - expected_supplier_change) > 0.01:
            log(f"❌ Supplier balance change should be {expected_supplier_change}, got {actual_supplier_change}")
            return False
        
        if abs(actual_partner_change - expected_partner_change) > 0.01:
            log(f"❌ Partner balance change should be {expected_partner_change}, got {actual_partner_change}")
            return False
        
        log("✅ Balances correctly show NET values (old amounts reversed)")
        
        return True
    except Exception as e:
        log(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_change_partner_commission() -> bool:
    """Test PATCH with partner commission change"""
    try:
        log("\n=== TEST D: Change partner commission (percent mode) ===")
        
        partner_balance_before = get_balance("clients", test_data["partner_id"], "USD")
        
        # PATCH with percent mode
        resp = session.patch(
            f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking_id']}",
            json={
                "commission_share_mode": "percent",
                "commission_share_value": 50
            }
        )
        
        if resp.status_code != 200:
            log(f"❌ PATCH failed: {resp.status_code} - {resp.text}")
            return False
        
        updated = resp.json()
        
        # commission=100, 50% = 50
        expected_partner_share = 50
        
        if abs(updated.get("commission_share_amount", 0) - expected_partner_share) > 0.01:
            log(f"❌ commission_share_amount should be {expected_partner_share}, got {updated.get('commission_share_amount')}")
            return False
        
        log("✅ Partner commission updated to 50 (50% of 100)")
        
        # Verify JE
        balanced, je_data = verify_je_balanced(test_data["booking_id"])
        if not balanced:
            log(f"❌ Journal entry NOT balanced: {je_data}")
            return False
        
        # Check partner line is 50
        lines = je_data["lines"]
        partner_credit = next((l for l in lines if l.get("party_type") == "client" and l.get("party_id") == test_data["partner_id"]), None)
        
        if not partner_credit or abs(partner_credit.get("credit", 0) - 50) > 0.01:
            log(f"❌ Partner credit should be 50, got {partner_credit}")
            return False
        
        log("✅ JE partner line correct (50)")
        
        # Verify partner balance change
        partner_balance_after = get_balance("clients", test_data["partner_id"], "USD")
        expected_change = -20  # Old -30 reversed (+30), new -50 applied (-50) = -20
        actual_change = partner_balance_after - partner_balance_before
        
        if abs(actual_change - expected_change) > 0.01:
            log(f"❌ Partner balance change should be {expected_change}, got {actual_change}")
            return False
        
        log(f"✅ Partner balance changed correctly by {actual_change}")
        
        return True
    except Exception as e:
        log(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_remove_partner() -> bool:
    """Test PATCH to remove partner commission"""
    try:
        log("\n=== TEST E: Remove partner commission ===")
        
        partner_balance_before = get_balance("clients", test_data["partner_id"], "USD")
        
        # PATCH to remove partner
        resp = session.patch(
            f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking_id']}",
            json={
                "commission_partner_id": "",
                "commission_share_value": 0
            }
        )
        
        if resp.status_code != 200:
            log(f"❌ PATCH failed: {resp.status_code} - {resp.text}")
            return False
        
        updated = resp.json()
        
        if updated.get("commission_share_amount", 0) != 0:
            log(f"❌ commission_share_amount should be 0, got {updated.get('commission_share_amount')}")
            return False
        
        log("✅ Partner commission removed")
        
        # Verify JE has no partner line
        balanced, je_data = verify_je_balanced(test_data["booking_id"])
        if not balanced:
            log(f"❌ Journal entry NOT balanced: {je_data}")
            return False
        
        lines = je_data["lines"]
        partner_line = next((l for l in lines if l.get("party_id") == test_data["partner_id"]), None)
        
        if partner_line:
            log(f"❌ Partner line should not exist, got {partner_line}")
            return False
        
        log("✅ JE has no partner line")
        
        # Verify partner balance back to original (or close to it)
        partner_balance_after = get_balance("clients", test_data["partner_id"], "USD")
        expected_change = 50  # Old -50 reversed
        actual_change = partner_balance_after - partner_balance_before
        
        if abs(actual_change - expected_change) > 0.01:
            log(f"❌ Partner balance change should be {expected_change}, got {actual_change}")
            return False
        
        log(f"✅ Partner balance restored (change: {actual_change})")
        
        return True
    except Exception as e:
        log(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_turn_off_cost_discount() -> bool:
    """Test PATCH to turn off discount_apply_cost"""
    try:
        log("\n=== TEST F: Turn off cost discount ===")
        
        # PATCH with discount_apply_cost=false
        resp = session.patch(
            f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking_id']}",
            json={
                "discount": 80,
                "discount_apply_cost": False
            }
        )
        
        if resp.status_code != 200:
            log(f"❌ PATCH failed: {resp.status_code} - {resp.text}")
            return False
        
        updated = resp.json()
        
        # Expected: sale=300-80=220, cost=200 (no discount), commission=20
        expected_sale = 220
        expected_cost = 200
        expected_commission = 20
        
        if abs(updated.get("total_sale", 0) - expected_sale) > 0.01:
            log(f"❌ total_sale should be {expected_sale}, got {updated.get('total_sale')}")
            return False
        
        if abs(updated.get("total_cost", 0) - expected_cost) > 0.01:
            log(f"❌ total_cost should be {expected_cost}, got {updated.get('total_cost')}")
            return False
        
        if abs(updated.get("commission", 0) - expected_commission) > 0.01:
            log(f"❌ commission should be {expected_commission}, got {updated.get('commission')}")
            return False
        
        log("✅ Cost discount turned off correctly")
        
        # Verify JE balanced
        balanced, je_data = verify_je_balanced(test_data["booking_id"])
        if not balanced:
            log(f"❌ Journal entry NOT balanced: {je_data}")
            return False
        
        log(f"✅ Journal entry balanced: Debit={je_data['total_debit']}, Credit={je_data['total_credit']}")
        
        # Verify supplier credit is 200
        lines = je_data["lines"]
        supplier_credit = next((l for l in lines if l.get("party_type") == "supplier"), None)
        
        if not supplier_credit or abs(supplier_credit.get("credit", 0) - 200) > 0.01:
            log(f"❌ Supplier credit should be 200, got {supplier_credit}")
            return False
        
        log("✅ Supplier credit correct (200)")
        
        return True
    except Exception as e:
        log(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_change_pax_count() -> bool:
    """Test PATCH with pax_count change"""
    try:
        log("\n=== TEST G: Change pax_count (2->3) ===")
        
        # PATCH with new pax_count
        resp = session.patch(
            f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking_id']}",
            json={
                "pax_count": 3,
                "discount": 80,
                "discount_apply_cost": False
            }
        )
        
        if resp.status_code != 200:
            log(f"❌ PATCH failed: {resp.status_code} - {resp.text}")
            return False
        
        updated = resp.json()
        
        # Expected: sale=450-80=370, cost=300, commission=70
        expected_sale = 370
        expected_cost = 300
        expected_commission = 70
        
        if abs(updated.get("total_sale", 0) - expected_sale) > 0.01:
            log(f"❌ total_sale should be {expected_sale}, got {updated.get('total_sale')}")
            return False
        
        if abs(updated.get("total_cost", 0) - expected_cost) > 0.01:
            log(f"❌ total_cost should be {expected_cost}, got {updated.get('total_cost')}")
            return False
        
        if abs(updated.get("commission", 0) - expected_commission) > 0.01:
            log(f"❌ commission should be {expected_commission}, got {updated.get('commission')}")
            return False
        
        log("✅ Pax count changed correctly")
        
        # Verify JE balanced
        balanced, je_data = verify_je_balanced(test_data["booking_id"])
        if not balanced:
            log(f"❌ Journal entry NOT balanced: {je_data}")
            return False
        
        log(f"✅ Journal entry balanced: Debit={je_data['total_debit']}, Credit={je_data['total_credit']}")
        
        return True
    except Exception as e:
        log(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_edge_negative_revenue() -> bool:
    """Test edge case where revenue would be negative"""
    try:
        log("\n=== TEST H: Edge case - negative revenue (sale < cost) ===")
        
        # PATCH with very high discount
        resp = session.patch(
            f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking_id']}",
            json={
                "pax_count": 1,
                "discount": 50,
                "discount_apply_cost": False
            }
        )
        
        if resp.status_code != 200:
            log(f"❌ PATCH failed: {resp.status_code} - {resp.text}")
            return False
        
        updated = resp.json()
        
        # Expected: sale=150-50=100, cost=100, commission=0
        expected_sale = 100
        expected_cost = 100
        expected_commission = 0
        
        if abs(updated.get("total_sale", 0) - expected_sale) > 0.01:
            log(f"❌ total_sale should be {expected_sale}, got {updated.get('total_sale')}")
            return False
        
        if abs(updated.get("total_cost", 0) - expected_cost) > 0.01:
            log(f"❌ total_cost should be {expected_cost}, got {updated.get('total_cost')}")
            return False
        
        log("✅ Edge case handled correctly")
        
        # Verify JE balanced even with zero/negative revenue
        balanced, je_data = verify_je_balanced(test_data["booking_id"])
        if not balanced:
            log(f"❌ Journal entry NOT balanced: {je_data}")
            return False
        
        log(f"✅ Journal entry balanced even with zero commission: Debit={je_data['total_debit']}, Credit={je_data['total_credit']}")
        
        return True
    except Exception as e:
        log(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def cleanup_test_data() -> bool:
    """Delete all test entities"""
    try:
        log("\n=== CLEANUP: Deleting test data ===")
        
        # Delete booking
        if test_data["booking_id"]:
            log(f"Deleting booking {test_data['booking_id']}...")
            resp = session.delete(f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['booking_id']}")
            if resp.status_code == 200:
                log("✅ Booking deleted")
            else:
                log(f"⚠️ Failed to delete booking: {resp.text}")
        
        # Delete package (will cascade delete components)
        if test_data["package_id"]:
            log(f"Deleting package {test_data['package_id']}...")
            resp = session.delete(f"{BASE_URL}/packages/{test_data['package_id']}")
            if resp.status_code == 200:
                log("✅ Package deleted")
            else:
                log(f"⚠️ Failed to delete package: {resp.text}")
        
        # Delete clients
        for key in ["client_id", "partner_id"]:
            if test_data[key]:
                log(f"Deleting client {test_data[key]}...")
                resp = session.delete(f"{BASE_URL}/clients/{test_data[key]}")
                if resp.status_code == 200:
                    log(f"✅ Client deleted")
                else:
                    log(f"⚠️ Failed to delete client: {resp.text}")
        
        # Delete supplier
        if test_data["supplier_id"]:
            log(f"Deleting supplier {test_data['supplier_id']}...")
            resp = session.delete(f"{BASE_URL}/suppliers/{test_data['supplier_id']}")
            if resp.status_code == 200:
                log("✅ Supplier deleted")
            else:
                log(f"⚠️ Failed to delete supplier: {resp.text}")
        
        log("✅ Cleanup completed")
        return True
    except Exception as e:
        log(f"❌ Cleanup error: {e}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("BACKEND TEST: v3.20 - PATCH Package Booking Smart Discount + Partner Commission")
    print("="*80 + "\n")
    
    # Login
    if not login():
        print("\n❌ FAILED: Could not login")
        return False
    
    # Setup
    if not setup_test_data():
        print("\n❌ FAILED: Could not setup test data")
        cleanup_test_data()
        return False
    
    # Run tests
    tests = [
        ("Create booking with discount + commission", test_create_booking_with_discount_and_commission),
        ("Light update (name only)", test_light_update),
        ("Change discount amount", test_change_discount),
        ("Change partner commission", test_change_partner_commission),
        ("Remove partner", test_remove_partner),
        ("Turn off cost discount", test_turn_off_cost_discount),
        ("Change pax count", test_change_pax_count),
        ("Edge case - negative revenue", test_edge_negative_revenue),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            log(f"❌ Test '{name}' crashed: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    # Cleanup
    cleanup_test_data()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return True
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
