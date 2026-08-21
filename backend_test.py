#!/usr/bin/env python3
"""
v3.26 Backend Test — Approve Meraaj inbound booking + Partners summary
Tests:
1. Setup: Create supplier, package with room pricing, flat component, share it
2. Inject inbound booking via webhook
3. Approve inbound booking (creates real booking + balanced JE)
4. Verify client auto-creation, balances, JE, double-approve rejection, cancelled booking rejection, client reuse
5. Partners summary endpoint
6. Cleanup: Delete all created data
"""

import requests
import json
import hmac
import hashlib
import os
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"
MERAAJ_SECRET = "fadaef8475135533dc526493bf3b87f4bad43682a95f5c2c136d7976cd126531"

# Auth credentials
EMAIL = "owner@demo.com"
PASSWORD = "Demo@2025"

# Test data tracking
created_ids = {
    "suppliers": [],
    "packages": [],
    "components": [],
    "clients": [],
    "bookings": [],
    "visas": [],
    "services": [],
    "boxes": [],
    "meraaj_inbound": [],
    "partner_statements": []
}

session = requests.Session()

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def meraaj_sign(payload):
    """Generate HMAC-SHA256 signature for Meraaj webhook"""
    return hmac.new(
        MERAAJ_SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

def login():
    """Login and get session cookie"""
    log("🔐 Logging in as owner@demo.com...")
    resp = session.post(f"{API_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if resp.status_code != 200:
        log(f"❌ Login failed: {resp.status_code} {resp.text}")
        return False
    data = resp.json()
    log(f"✅ Logged in as {data['user']['email']}")
    return True

def create_supplier(name):
    """Create a supplier"""
    log(f"📦 Creating supplier: {name}")
    resp = session.post(f"{API_URL}/suppliers", json={"name": name, "phone": "", "notes": "Test supplier for v3.26"})
    if resp.status_code != 200:
        log(f"❌ Failed to create supplier: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    created_ids["suppliers"].append(data["id"])
    log(f"✅ Supplier created: {data['id']}")
    return data

def create_package(name, currency="SAR", room_pricing=None):
    """Create a package with room pricing"""
    log(f"📦 Creating package: {name}")
    payload = {
        "name": name,
        "package_type": "عمرة",
        "currency": currency,
        "pricing_mode": "direct",
        "room_pricing": room_pricing or [],
        "features": [],
        "notes": "Test package for v3.26"
    }
    resp = session.post(f"{API_URL}/packages", json=payload)
    if resp.status_code != 200:
        log(f"❌ Failed to create package: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    created_ids["packages"].append(data["id"])
    log(f"✅ Package created: {data['id']}")
    return data

def create_component(package_id, supplier_id, name, cost_per_pax, sale_per_pax):
    """Create a flat component"""
    log(f"📦 Creating component: {name}")
    payload = {
        "name": name,
        "supplier_id": supplier_id,
        "cost_per_pax": cost_per_pax,
        "sale_per_pax": sale_per_pax,
        "pricing_type": "flat",
        "include_infants": False,
        "component_type": "other",
        "notes": "Test component for v3.26"
    }
    resp = session.post(f"{API_URL}/packages/{package_id}/components", json=payload)
    if resp.status_code != 200:
        log(f"❌ Failed to create component: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    created_ids["components"].append(data["id"])
    log(f"✅ Component created: {data['id']}")
    return data

def share_package(package_id, buyer_commission_mode="amount", buyer_commission_value=100, commission_direction="deducted", seats_allocated=10):
    """Share package on Meraaj network"""
    log(f"🌐 Sharing package {package_id} on Meraaj network...")
    payload = {
        "enabled": True,
        "buyer_commission_mode": buyer_commission_mode,
        "buyer_commission_value": buyer_commission_value,
        "commission_direction": commission_direction,
        "seats_allocated": seats_allocated
    }
    resp = session.post(f"{API_URL}/packages/{package_id}/meraaj-share", json=payload)
    if resp.status_code != 200:
        log(f"❌ Failed to share package: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    log(f"✅ Package shared: {data}")
    return data

def inject_webhook(event_id, event_type, event_data):
    """Inject a Meraaj webhook event"""
    log(f"📨 Injecting webhook: {event_type} (id: {event_id})")
    payload = {
        "id": event_id,
        "type": event_type,
        "data": event_data
    }
    payload_str = json.dumps(payload)
    signature = meraaj_sign(payload_str)
    
    headers = {
        "Content-Type": "application/json",
        "x-meraaj-signature": signature
    }
    
    resp = session.post(f"{API_URL}/meraaj/webhooks", data=payload_str, headers=headers)
    if resp.status_code != 200:
        log(f"❌ Webhook failed: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    log(f"✅ Webhook received: {data}")
    return data

def get_inbound_bookings():
    """Get all inbound bookings"""
    resp = session.get(f"{API_URL}/meraaj/inbound-bookings")
    if resp.status_code != 200:
        log(f"❌ Failed to get inbound bookings: {resp.status_code} {resp.text}")
        return []
    return resp.json()

def approve_inbound_booking(inbound_id):
    """Approve an inbound booking"""
    log(f"✅ Approving inbound booking: {inbound_id}")
    resp = session.post(f"{API_URL}/meraaj/inbound-bookings/{inbound_id}/approve")
    if resp.status_code != 200:
        log(f"❌ Failed to approve: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    log(f"✅ Approved: {data}")
    return data

def get_client(client_id):
    """Get client details"""
    resp = session.get(f"{API_URL}/clients")
    if resp.status_code != 200:
        return None
    clients = resp.json()
    for c in clients:
        if c["id"] == client_id:
            return c
    return None

def get_supplier(supplier_id):
    """Get supplier details"""
    resp = session.get(f"{API_URL}/suppliers")
    if resp.status_code != 200:
        return None
    suppliers = resp.json()
    for s in suppliers:
        if s["id"] == supplier_id:
            return s
    return None

def get_journal_entries(ref_type=None, ref_id=None):
    """Get journal entries"""
    resp = session.get(f"{API_URL}/journal-entries")
    if resp.status_code != 200:
        return []
    entries = resp.json()
    if ref_type and ref_id:
        return [e for e in entries if e.get("ref_type") == ref_type and e.get("ref_id") == ref_id]
    return entries

def get_package_bookings():
    """Get all package bookings"""
    resp = session.get(f"{API_URL}/packages/bookings")
    if resp.status_code != 200:
        log(f"❌ Failed to get bookings: {resp.status_code} {resp.text}")
        return []
    return resp.json()

def create_partner_client(name):
    """Create a client to use as partner"""
    log(f"👥 Creating partner client: {name}")
    resp = session.post(f"{API_URL}/clients", json={"name": name, "phone": "", "notes": "Partner for v3.26 test"})
    if resp.status_code != 200:
        log(f"❌ Failed to create client: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    created_ids["clients"].append(data["id"])
    log(f"✅ Partner client created: {data['id']}")
    return data

def create_visa_with_partner(client_id, supplier_id, partner_id, cost, sale, commission_share):
    """Create a visa with partner commission"""
    log(f"📄 Creating visa with partner commission...")
    payload = {
        "client_id": client_id,
        "supplier_id": supplier_id,
        "beneficiary_name": "Test Pilgrim v326",
        "beneficiary_phone": "+966501234567",
        "service_type": "تأشيرة عمرة",
        "passport_no": f"V326-{datetime.now().timestamp()}",
        "cost": cost,
        "sale_price": sale,
        "currency": "SAR",
        "payment_method": "credit",
        "commission_partner_type": "client",
        "commission_partner_id": partner_id,
        "commission_share_mode": "amount",
        "commission_share_value": commission_share
    }
    resp = session.post(f"{API_URL}/visas", json=payload)
    if resp.status_code != 200:
        log(f"❌ Failed to create visa: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    created_ids["visas"].append(data["id"])
    log(f"✅ Visa created: {data['id']}")
    return data

def create_service_with_partner(client_id, supplier_id, partner_id, cost, sale, commission_share):
    """Create a service with partner commission"""
    log(f"🔧 Creating service with partner commission...")
    payload = {
        "client_id": client_id,
        "supplier_id": supplier_id,
        "service_type": "خدمة نقل / ترحيل",
        "cost": cost,
        "sale_price": sale,
        "currency": "SAR",
        "payment_method": "credit",
        "commission_partner_type": "client",
        "commission_partner_id": partner_id,
        "commission_share_mode": "amount",
        "commission_share_value": commission_share
    }
    resp = session.post(f"{API_URL}/services", json=payload)
    if resp.status_code != 200:
        log(f"❌ Failed to create service: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    created_ids["services"].append(data["id"])
    log(f"✅ Service created: {data['id']}")
    return data

def get_partners_summary():
    """Get partners summary"""
    log(f"📊 Getting partners summary...")
    resp = session.get(f"{API_URL}/partners/summary")
    if resp.status_code != 200:
        log(f"❌ Failed to get partners summary: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    log(f"✅ Partners summary: {json.dumps(data, indent=2, ensure_ascii=False)}")
    return data

def create_partner_statement(partner_type, partner_id, from_date, to_date):
    """Create a partner statement"""
    log(f"📋 Creating partner statement...")
    payload = {
        "partner_type": partner_type,
        "partner_id": partner_id,
        "from_date": from_date,
        "to_date": to_date
    }
    resp = session.post(f"{API_URL}/partners/statements", json=payload)
    if resp.status_code != 200:
        log(f"❌ Failed to create statement: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    created_ids["partner_statements"].append(data["id"])
    log(f"✅ Statement created: {data['id']}")
    return data

def settle_partner_statement(statement_id, box_id, currency, amount):
    """Settle a partner statement"""
    log(f"💰 Settling partner statement {statement_id}...")
    payload = {
        "box_id": box_id,
        "currency": currency,
        "amount": amount
    }
    resp = session.post(f"{API_URL}/partners/statements/{statement_id}/settle", json=payload)
    if resp.status_code != 200:
        log(f"❌ Failed to settle: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    log(f"✅ Statement settled: {data}")
    return data

def get_boxes():
    """Get all boxes"""
    resp = session.get(f"{API_URL}/boxes")
    if resp.status_code != 200:
        return []
    return resp.json()

def delete_booking(package_id, booking_id):
    """Delete a package booking"""
    log(f"🗑️ Deleting booking {booking_id}...")
    resp = session.delete(f"{API_URL}/packages/{package_id}/bookings/{booking_id}")
    if resp.status_code != 200:
        log(f"❌ Failed to delete booking: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Booking deleted")
    return True

def delete_visa(visa_id):
    """Delete a visa"""
    log(f"🗑️ Deleting visa {visa_id}...")
    resp = session.delete(f"{API_URL}/visas/{visa_id}")
    if resp.status_code != 200:
        log(f"❌ Failed to delete visa: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Visa deleted")
    return True

def delete_service(service_id):
    """Delete a service"""
    log(f"🗑️ Deleting service {service_id}...")
    resp = session.delete(f"{API_URL}/services/{service_id}")
    if resp.status_code != 200:
        log(f"❌ Failed to delete service: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Service deleted")
    return True

def delete_component(package_id, component_id):
    """Delete a component"""
    log(f"🗑️ Deleting component {component_id}...")
    resp = session.delete(f"{API_URL}/packages/{package_id}/components/{component_id}")
    if resp.status_code != 200:
        log(f"❌ Failed to delete component: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Component deleted")
    return True

def unshare_package(package_id):
    """Unshare a package"""
    log(f"🌐 Unsharing package {package_id}...")
    resp = session.post(f"{API_URL}/packages/{package_id}/meraaj-share", json={"enabled": False})
    if resp.status_code != 200:
        log(f"❌ Failed to unshare: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Package unshared")
    return True

def delete_package(package_id):
    """Delete a package"""
    log(f"🗑️ Deleting package {package_id}...")
    resp = session.delete(f"{API_URL}/packages/{package_id}")
    if resp.status_code != 200:
        log(f"❌ Failed to delete package: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Package deleted")
    return True

def delete_supplier(supplier_id):
    """Delete a supplier"""
    log(f"🗑️ Deleting supplier {supplier_id}...")
    resp = session.delete(f"{API_URL}/suppliers/{supplier_id}")
    if resp.status_code != 200:
        log(f"❌ Failed to delete supplier: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Supplier deleted")
    return True

def delete_client(client_id):
    """Delete a client"""
    log(f"🗑️ Deleting client {client_id}...")
    resp = session.delete(f"{API_URL}/clients/{client_id}")
    if resp.status_code != 200:
        log(f"❌ Failed to delete client: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Client deleted")
    return True

def cleanup():
    """Clean up all created test data"""
    log("\n🧹 CLEANUP: Deleting all created test data...")
    
    # Delete bookings first (reverses balances)
    # We know the package_id from our created_ids
    if created_ids["packages"] and created_ids["bookings"]:
        package_id = created_ids["packages"][0]
        for booking_id in created_ids["bookings"]:
            delete_booking(package_id, booking_id)
    
    # Delete visas
    for visa_id in created_ids["visas"]:
        delete_visa(visa_id)
    
    # Delete services
    for service_id in created_ids["services"]:
        delete_service(service_id)
    
    # Delete components
    for component_id in created_ids["components"]:
        # Find package_id for this component
        for package_id in created_ids["packages"]:
            delete_component(package_id, component_id)
    
    # Unshare and delete packages
    for package_id in created_ids["packages"]:
        unshare_package(package_id)
        delete_package(package_id)
    
    # Delete suppliers
    for supplier_id in created_ids["suppliers"]:
        delete_supplier(supplier_id)
    
    # Delete clients (after all transactions are deleted)
    for client_id in created_ids["clients"]:
        delete_client(client_id)
    
    log("✅ Cleanup complete")

def run_test():
    """Run the complete test suite"""
    try:
        log("=" * 80)
        log("🚀 Starting v3.26 Backend Test — Approve Meraaj inbound booking + Partners summary")
        log("=" * 80)
        
        # Login
        if not login():
            return False
        
        # ===== SETUP =====
        log("\n" + "=" * 80)
        log("📦 SETUP: Creating test data")
        log("=" * 80)
        
        # Create supplier
        supplier = create_supplier("APPR-v326-Supplier")
        if not supplier:
            return False
        
        # Create package with room pricing
        room_pricing = [
            {"type": "double", "sale_per_pax": 2000, "sale_child": 1500, "sale_infant": 100}
        ]
        package = create_package("APPR-v326", "SAR", room_pricing)
        if not package:
            return False
        
        # Create flat component
        component = create_component(package["id"], supplier["id"], "Transport", 800, 1200)
        if not component:
            return False
        
        # Share package
        share_result = share_package(package["id"], "amount", 100, "deducted", 10)
        if not share_result:
            return False
        
        # ===== TEST 1: APPROVE INBOUND BOOKING =====
        log("\n" + "=" * 80)
        log("🧪 TEST 1: APPROVE INBOUND BOOKING")
        log("=" * 80)
        
        # Inject inbound booking via webhook
        event_id_suffix = str(int(datetime.now().timestamp() * 1000))
        webhook_data = {
            "package_ref": package["id"],
            "booking_ref": f"MRJ-V326-1-{event_id_suffix}",
            "buyer_office_name": "مكتب الرحلات الذهبية",
            "registrants": [
                {"name": "A1", "age": 30, "room_type": "double"},
                {"name": "C1", "age": 8, "room_type": "double"},
                {"name": "I1", "age": 1, "room_type": "double"}
            ],
            "currency": "SAR"
        }
        webhook_result = inject_webhook(f"v326-e1-{event_id_suffix}", "meraaj.booking.created", webhook_data)
        if not webhook_result:
            return False
        
        # Get inbound bookings
        inbound_bookings = get_inbound_bookings()
        if not inbound_bookings:
            log("❌ No inbound bookings found")
            return False
        
        inbound = inbound_bookings[0]
        created_ids["meraaj_inbound"].append(inbound["id"])
        log(f"📋 Inbound booking: {json.dumps(inbound, indent=2, ensure_ascii=False)}")
        
        # Verify inbound booking calculations
        expected_total = 2000 + 1500 + 100  # 3600
        expected_net = 1900 + 1400 + 0  # 3300 (after commission deduction)
        expected_seats = 2  # adult + child (infant doesn't count)
        
        log(f"\n📊 Verifying inbound booking calculations:")
        log(f"   Total price: {inbound.get('total_price')} (expected: {expected_total})")
        log(f"   Net to seller: {inbound.get('net_to_seller_total')} (expected: {expected_net})")
        log(f"   Seats: {inbound.get('seats')} (expected: {expected_seats})")
        
        if abs(inbound.get("total_price", 0) - expected_total) > 0.01:
            log(f"❌ Total price mismatch: {inbound.get('total_price')} != {expected_total}")
            return False
        
        if abs(inbound.get("net_to_seller_total", 0) - expected_net) > 0.01:
            log(f"❌ Net to seller mismatch: {inbound.get('net_to_seller_total')} != {expected_net}")
            return False
        
        if inbound.get("seats") != expected_seats:
            log(f"❌ Seats mismatch: {inbound.get('seats')} != {expected_seats}")
            return False
        
        log("✅ Inbound booking calculations correct")
        
        # Approve the inbound booking
        approval_result = approve_inbound_booking(inbound["id"])
        if not approval_result:
            return False
        
        created_ids["bookings"].append(approval_result["booking"]["id"])
        
        # Verify approval result
        log(f"\n📊 Verifying approval result:")
        log(f"   Approved: {approval_result.get('approved')}")
        log(f"   Client name: {approval_result.get('client', {}).get('name')}")
        log(f"   Booking total_sale: {approval_result.get('booking', {}).get('total_sale')}")
        log(f"   Booking total_cost: {approval_result.get('booking', {}).get('total_cost')}")
        log(f"   Booking commission: {approval_result.get('booking', {}).get('commission')}")
        log(f"   Booking source: {approval_result.get('booking', {}).get('source')}")
        log(f"   Booking pax_adults: {approval_result.get('booking', {}).get('pax_adults')}")
        log(f"   Booking pax_children: {approval_result.get('booking', {}).get('pax_children')}")
        log(f"   Booking pax_infants: {approval_result.get('booking', {}).get('pax_infants')}")
        
        if not approval_result.get("approved"):
            log("❌ Booking not approved")
            return False
        
        expected_client_name = "معراج — مكتب الرحلات الذهبية"
        if approval_result.get("client", {}).get("name") != expected_client_name:
            log(f"❌ Client name mismatch: {approval_result.get('client', {}).get('name')} != {expected_client_name}")
            return False
        
        booking = approval_result["booking"]
        expected_cost = 800 * 2  # 1600 (flat component cost × 2 billed pax)
        expected_commission = 3300 - 1600  # 1700
        
        if abs(booking.get("total_sale", 0) - 3300) > 0.01:
            log(f"❌ Booking total_sale mismatch: {booking.get('total_sale')} != 3300")
            return False
        
        if abs(booking.get("total_cost", 0) - expected_cost) > 0.01:
            log(f"❌ Booking total_cost mismatch: {booking.get('total_cost')} != {expected_cost}")
            return False
        
        if abs(booking.get("commission", 0) - expected_commission) > 0.01:
            log(f"❌ Booking commission mismatch: {booking.get('commission')} != {expected_commission}")
            return False
        
        if booking.get("source") != "meraaj":
            log(f"❌ Booking source mismatch: {booking.get('source')} != meraaj")
            return False
        
        if booking.get("pax_adults") != 1:
            log(f"❌ Booking pax_adults mismatch: {booking.get('pax_adults')} != 1")
            return False
        
        if booking.get("pax_children") != 1:
            log(f"❌ Booking pax_children mismatch: {booking.get('pax_children')} != 1")
            return False
        
        if booking.get("pax_infants") != 1:
            log(f"❌ Booking pax_infants mismatch: {booking.get('pax_infants')} != 1")
            return False
        
        log("✅ Approval result correct")
        
        # Verify client auto-creation and balance
        client_id = approval_result["client"]["id"]
        # Check if this client already exists (from previous test runs)
        client_already_existed = client_id in [c["id"] for c in session.get(f"{API_URL}/clients").json() if c.get("created_at", "") < booking.get("created_at", "")]
        if not client_already_existed:
            created_ids["clients"].append(client_id)
        
        client = get_client(client_id)
        if not client:
            log("❌ Client not found")
            return False
        
        log(f"\n📊 Verifying client:")
        log(f"   Client name: {client.get('name')}")
        log(f"   Client SAR balance: {client.get('balances', {}).get('SAR')}")
        
        # The balance should be at least 3300 (could be higher if client existed from previous runs)
        if client.get("balances", {}).get("SAR", 0) < 3300:
            log(f"❌ Client SAR balance too low: {client.get('balances', {}).get('SAR')} < 3300")
            return False
        
        initial_client_balance = client.get("balances", {}).get("SAR", 0)
        log(f"✅ Client auto-created/reused with balance: {initial_client_balance}")
        
        # Verify supplier balance
        supplier_data = get_supplier(supplier["id"])
        if not supplier_data:
            log("❌ Supplier not found")
            return False
        
        log(f"\n📊 Verifying supplier:")
        log(f"   Supplier SAR balance: {supplier_data.get('balances', {}).get('SAR')}")
        
        if abs(supplier_data.get("balances", {}).get("SAR", 0) - 1600) > 0.01:
            log(f"❌ Supplier SAR balance mismatch: {supplier_data.get('balances', {}).get('SAR')} != 1600")
            return False
        
        log("✅ Supplier balance correct")
        
        # Verify journal entry
        journal_entries = get_journal_entries("package_booking", booking["id"])
        if not journal_entries:
            log("❌ Journal entry not found")
            return False
        
        je = journal_entries[0]
        log(f"\n📊 Verifying journal entry:")
        log(f"   JE ref_type: {je.get('ref_type')}")
        log(f"   JE ref_id: {je.get('ref_id')}")
        log(f"   JE lines: {json.dumps(je.get('lines', []), indent=2, ensure_ascii=False)}")
        
        # Verify JE is balanced
        total_debit = sum(line.get("debit", 0) for line in je.get("lines", []))
        total_credit = sum(line.get("credit", 0) for line in je.get("lines", []))
        
        log(f"   Total debit: {total_debit}")
        log(f"   Total credit: {total_credit}")
        
        if abs(total_debit - total_credit) > 0.01:
            log(f"❌ Journal entry not balanced: debit={total_debit}, credit={total_credit}")
            return False
        
        # Verify JE lines
        client_line = next((l for l in je.get("lines", []) if l.get("account_code") == "1301"), None)
        supplier_line = next((l for l in je.get("lines", []) if l.get("account_code") == "2101"), None)
        revenue_line = next((l for l in je.get("lines", []) if l.get("account_code") == "4103"), None)
        
        if not client_line or abs(client_line.get("debit", 0) - 3300) > 0.01:
            log(f"❌ Client line incorrect: {client_line}")
            return False
        
        if not supplier_line or abs(supplier_line.get("credit", 0) - 1600) > 0.01:
            log(f"❌ Supplier line incorrect: {supplier_line}")
            return False
        
        if not revenue_line or abs(revenue_line.get("credit", 0) - 1700) > 0.01:
            log(f"❌ Revenue line incorrect: {revenue_line}")
            return False
        
        log("✅ Journal entry balanced and correct")
        
        # Verify inbound status updated
        inbound_bookings = get_inbound_bookings()
        inbound_updated = next((ib for ib in inbound_bookings if ib["id"] == inbound["id"]), None)
        if not inbound_updated:
            log("❌ Inbound booking not found after approval")
            return False
        
        log(f"\n📊 Verifying inbound status:")
        log(f"   Status: {inbound_updated.get('status')}")
        log(f"   Booking ID: {inbound_updated.get('booking_id')}")
        log(f"   Client ID: {inbound_updated.get('client_id')}")
        
        if inbound_updated.get("status") != "approved":
            log(f"❌ Inbound status not updated: {inbound_updated.get('status')} != approved")
            return False
        
        if inbound_updated.get("booking_id") != booking["id"]:
            log(f"❌ Inbound booking_id mismatch: {inbound_updated.get('booking_id')} != {booking['id']}")
            return False
        
        if inbound_updated.get("client_id") != client_id:
            log(f"❌ Inbound client_id mismatch: {inbound_updated.get('client_id')} != {client_id}")
            return False
        
        log("✅ Inbound status updated correctly")
        
        # Note: Skipping package bookings list check as there's no general bookings endpoint
        # The booking was verified through the approval result
        log("✅ Booking created successfully (verified through approval result)")
        
        # Test double-approve (should return 400)
        log(f"\n🧪 Testing double-approve (should fail)...")
        resp = session.post(f"{API_URL}/meraaj/inbound-bookings/{inbound['id']}/approve")
        if resp.status_code == 400 and "معتمد مسبقاً" in resp.text:
            log("✅ Double-approve correctly rejected")
        else:
            log(f"❌ Double-approve should return 400 with 'معتمد مسبقاً', got {resp.status_code}: {resp.text}")
            return False
        
        # Test approve cancelled booking
        log(f"\n🧪 Testing approve cancelled booking (should fail)...")
        
        # Inject another booking
        event_id_suffix2 = str(int(datetime.now().timestamp() * 1000))
        webhook_data2 = {
            "package_ref": package["id"],
            "booking_ref": f"MRJ-V326-2-{event_id_suffix2}",
            "buyer_office_name": "مكتب الرحلات الذهبية",
            "registrants": [
                {"name": "A2", "age": 30, "room_type": "double"}
            ],
            "currency": "SAR"
        }
        webhook_result2 = inject_webhook(f"v326-e2-{event_id_suffix2}", "meraaj.booking.created", webhook_data2)
        if not webhook_result2:
            return False
        
        inbound_bookings = get_inbound_bookings()
        inbound2 = next((ib for ib in inbound_bookings if ib["meraaj_booking_ref"] == f"MRJ-V326-2-{event_id_suffix2}"), None)
        if not inbound2:
            log("❌ Second inbound booking not found")
            return False
        
        created_ids["meraaj_inbound"].append(inbound2["id"])
        
        # Cancel it
        cancel_data = {
            "booking_ref": f"MRJ-V326-2-{event_id_suffix2}",
            "reason": "Test cancellation"
        }
        cancel_result = inject_webhook(f"v326-e3-{event_id_suffix2}", "meraaj.booking.cancelled", cancel_data)
        if not cancel_result:
            return False
        
        # Try to approve
        resp = session.post(f"{API_URL}/meraaj/inbound-bookings/{inbound2['id']}/approve")
        if resp.status_code == 400 and "ملغى" in resp.text:
            log("✅ Approve cancelled booking correctly rejected")
        else:
            log(f"❌ Approve cancelled should return 400 with 'ملغى', got {resp.status_code}: {resp.text}")
            return False
        
        # Test client reuse
        log(f"\n🧪 Testing client reuse...")
        
        # Inject third booking
        event_id_suffix3 = str(int(datetime.now().timestamp() * 1000))
        webhook_data3 = {
            "package_ref": package["id"],
            "booking_ref": f"MRJ-V326-3-{event_id_suffix3}",
            "buyer_office_name": "مكتب الرحلات الذهبية",
            "registrants": [
                {"name": "A3", "age": 30, "room_type": "double"}
            ],
            "currency": "SAR"
        }
        webhook_result3 = inject_webhook(f"v326-e4-{event_id_suffix3}", "meraaj.booking.created", webhook_data3)
        if not webhook_result3:
            return False
        
        inbound_bookings = get_inbound_bookings()
        inbound3 = next((ib for ib in inbound_bookings if ib["meraaj_booking_ref"] == f"MRJ-V326-3-{event_id_suffix3}"), None)
        if not inbound3:
            log("❌ Third inbound booking not found")
            return False
        
        created_ids["meraaj_inbound"].append(inbound3["id"])
        
        # Approve it
        approval_result3 = approve_inbound_booking(inbound3["id"])
        if not approval_result3:
            return False
        
        created_ids["bookings"].append(approval_result3["booking"]["id"])
        
        # Verify same client ID reused
        if approval_result3.get("client", {}).get("id") != client_id:
            log(f"❌ Client not reused: {approval_result3.get('client', {}).get('id')} != {client_id}")
            return False
        
        log("✅ Client reused correctly (no duplicate client)")
        
        # Verify client balance updated
        client = get_client(client_id)
        expected_balance = initial_client_balance + 1900  # Previous balance + new booking
        if abs(client.get("balances", {}).get("SAR", 0) - expected_balance) > 0.01:
            log(f"❌ Client balance after reuse mismatch: {client.get('balances', {}).get('SAR')} != {expected_balance}")
            return False
        
        log(f"✅ Client balance updated correctly: {client.get('balances', {}).get('SAR')}")
        
        log("\n✅ TEST 1 PASSED: Approve inbound booking")
        
        # ===== TEST 2: PARTNERS SUMMARY =====
        log("\n" + "=" * 80)
        log("🧪 TEST 2: PARTNERS SUMMARY")
        log("=" * 80)
        
        # Create partner client
        partner = create_partner_client("SUMM-PARTNER-v326")
        if not partner:
            return False
        
        # Create regular client for transactions
        regular_client = create_partner_client("REGULAR-CLIENT-v326")
        if not regular_client:
            return False
        
        # Create visa with partner commission
        visa = create_visa_with_partner(regular_client["id"], supplier["id"], partner["id"], 50, 100, 20)
        if not visa:
            return False
        
        # Create service with partner commission
        service = create_service_with_partner(regular_client["id"], supplier["id"], partner["id"], 30, 80, 15)
        if not service:
            return False
        
        # Get partners summary
        summary = get_partners_summary()
        if not summary:
            return False
        
        # Verify partner appears in summary
        partner_data = next((p for p in summary.get("partners", []) if p["partner_id"] == partner["id"]), None)
        if not partner_data:
            log("❌ Partner not found in summary")
            return False
        
        log(f"\n📊 Verifying partner summary:")
        log(f"   Partner: {json.dumps(partner_data, indent=2, ensure_ascii=False)}")
        
        if partner_data.get("ops_count") != 2:
            log(f"❌ ops_count mismatch: {partner_data.get('ops_count')} != 2")
            return False
        
        sar_data = partner_data.get("currencies", {}).get("SAR")
        if not sar_data:
            log("❌ SAR currency data not found")
            return False
        
        expected_earned = 20 + 15  # 35
        if abs(sar_data.get("earned", 0) - expected_earned) > 0.01:
            log(f"❌ Earned mismatch: {sar_data.get('earned')} != {expected_earned}")
            return False
        
        if abs(sar_data.get("settled", 0) - 0) > 0.01:
            log(f"❌ Settled should be 0: {sar_data.get('settled')}")
            return False
        
        if abs(sar_data.get("outstanding", 0) - expected_earned) > 0.01:
            log(f"❌ Outstanding mismatch: {sar_data.get('outstanding')} != {expected_earned}")
            return False
        
        if not partner_data.get("has_outstanding"):
            log("❌ has_outstanding should be true")
            return False
        
        log("✅ Partner summary correct")
        
        # Test partial settlement
        log(f"\n🧪 Testing partial settlement...")
        
        # Create statement
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        today = datetime.now().strftime("%Y-%m-%d")
        statement = create_partner_statement("client", partner["id"], yesterday, today)
        if not statement:
            return False
        
        # Get a box for settlement
        boxes = get_boxes()
        if not boxes:
            log("❌ No boxes found")
            return False
        
        box = boxes[0]
        
        # Settle partially
        settle_result = settle_partner_statement(statement["id"], box["id"], "SAR", 20)
        if not settle_result:
            return False
        
        # Get updated summary
        summary = get_partners_summary()
        if not summary:
            return False
        
        partner_data = next((p for p in summary.get("partners", []) if p["partner_id"] == partner["id"]), None)
        if not partner_data:
            log("❌ Partner not found in summary after settlement")
            return False
        
        log(f"\n📊 Verifying partner summary after settlement:")
        log(f"   Partner: {json.dumps(partner_data, indent=2, ensure_ascii=False)}")
        
        sar_data = partner_data.get("currencies", {}).get("SAR")
        if not sar_data:
            log("❌ SAR currency data not found after settlement")
            return False
        
        if abs(sar_data.get("earned", 0) - 35) > 0.01:
            log(f"❌ Earned should remain 35: {sar_data.get('earned')}")
            return False
        
        if abs(sar_data.get("settled", 0) - 20) > 0.01:
            log(f"❌ Settled mismatch: {sar_data.get('settled')} != 20")
            return False
        
        if abs(sar_data.get("outstanding", 0) - 15) > 0.01:
            log(f"❌ Outstanding mismatch: {sar_data.get('outstanding')} != 15")
            return False
        
        if not partner_data.get("has_outstanding"):
            log("❌ has_outstanding should still be true")
            return False
        
        log("✅ Partial settlement correct")
        
        log("\n✅ TEST 2 PASSED: Partners summary")
        
        # ===== CLEANUP =====
        cleanup()
        
        log("\n" + "=" * 80)
        log("✅ ALL TESTS PASSED")
        log("=" * 80)
        
        return True
        
    except Exception as e:
        log(f"\n❌ TEST FAILED WITH EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = run_test()
    exit(0 if success else 1)
