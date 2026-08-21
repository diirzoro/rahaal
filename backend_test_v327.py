#!/usr/bin/env python3
"""
v3.27 Backend Test Suite
Tests:
1. Meraaj inbound booking reject endpoint with validation
2. Approve endpoint emits booking.approved event
3. WhatsApp Mini CRM CRUD operations
4. Regression: JE and balance verification
"""

import requests
import json
import hmac
import hashlib
from datetime import datetime
import time

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
MERAAJ_SECRET = "fadaef8475135533dc526493bf3b87f4bad43682a95f5c2c136d7976cd126531"
LOGIN_EMAIL = "owner@demo.com"
LOGIN_PASSWORD = "Demo@2025"

# Unique test run ID to avoid idempotency issues
TEST_RUN_ID = str(int(time.time()))

# Global state
session = requests.Session()
test_data = {
    "supplier_id": None,
    "component_id": None,
    "package_id": None,
    "inbound_e1_id": None,
    "inbound_e2_id": None,
    "approved_booking_id": None,
    "client_id": None,
    "whatsapp_log_id": None,
}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def sign_webhook(payload_str):
    """Generate HMAC-SHA256 signature for webhook"""
    return hmac.new(
        MERAAJ_SECRET.encode(),
        payload_str.encode(),
        hashlib.sha256
    ).hexdigest()

def test_login():
    """Test 0: Login as owner"""
    log("TEST 0: Login as owner@demo.com")
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json={
            "email": LOGIN_EMAIL,
            "password": LOGIN_PASSWORD
        })
        if resp.status_code != 200:
            log(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return False
        data = resp.json()
        if not data.get("user"):
            log(f"❌ Login response missing user: {data}")
            return False
        log(f"✅ Login successful: {data['user']['email']}")
        return True
    except Exception as e:
        log(f"❌ Login exception: {e}")
        return False

def test_setup():
    """SETUP: Create supplier + package + component + share + inject 2 inbound bookings"""
    log("\n=== SETUP: Create test data ===")
    
    # 1. Create supplier
    log("Creating supplier SUP-v327...")
    try:
        resp = session.post(f"{BASE_URL}/suppliers", json={
            "name": "SUP-v327",
            "phone": "+966500000327",
            "email": "sup327@test.com"
        })
        if resp.status_code != 200:
            log(f"❌ Supplier creation failed: {resp.status_code} - {resp.text}")
            return False
        supplier = resp.json()
        test_data["supplier_id"] = supplier["id"]
        log(f"✅ Supplier created: {supplier['id']}")
    except Exception as e:
        log(f"❌ Supplier creation exception: {e}")
        return False
    
    # 2. Create package with room pricing
    log("Creating package REJ-v327 with room pricing...")
    try:
        resp = session.post(f"{BASE_URL}/packages", json={
            "name": "REJ-v327",
            "description": "Test package for v3.27 reject flow",
            "currency": "SAR",
            "package_type": "direct",
            "room_pricing": [
                {"type": "double", "sale_per_pax": 1000, "sale_child": 800, "sale_infant": 0}
            ]
        })
        if resp.status_code != 200:
            log(f"❌ Package creation failed: {resp.status_code} - {resp.text}")
            return False
        package = resp.json()
        test_data["package_id"] = package["id"]
        log(f"✅ Package created: {package['id']}")
    except Exception as e:
        log(f"❌ Package creation exception: {e}")
        return False
    
    # 3. Create flat component
    log("Creating flat component (cost 400/sale 700)...")
    try:
        resp = session.post(f"{BASE_URL}/packages/{test_data['package_id']}/components", json={
            "name": "COMP-v327",
            "supplier_id": test_data["supplier_id"],
            "cost_per_pax": 400,
            "sale_per_pax": 700,
            "pricing_type": "flat"
        })
        if resp.status_code != 200:
            log(f"❌ Component creation failed: {resp.status_code} - {resp.text}")
            return False
        component = resp.json()
        test_data["component_id"] = component["id"]
        log(f"✅ Component created: {component['id']}")
    except Exception as e:
        log(f"❌ Component creation exception: {e}")
        return False
    
    # 4. Share package with Meraaj
    log("Sharing package with Meraaj (buyer_commission_mode=amount, value=50, deducted, seats=10)...")
    try:
        resp = session.post(f"{BASE_URL}/packages/{test_data['package_id']}/meraaj-share", json={
            "enabled": True,
            "buyer_commission_mode": "amount",
            "buyer_commission_value": 50,
            "commission_direction": "deducted",
            "seats_allocated": 10
        })
        if resp.status_code != 200:
            log(f"❌ Package share failed: {resp.status_code} - {resp.text}")
            return False
        log(f"✅ Package shared with Meraaj")
    except Exception as e:
        log(f"❌ Package share exception: {e}")
        return False
    
    # 5. Inject inbound booking e1 (1 adult double)
    log("Injecting inbound booking e1 (1 adult double)...")
    try:
        webhook_payload = {
            "id": f"v327-e1-{TEST_RUN_ID}",
            "type": "meraaj.booking.created",
            "data": {
                "package_ref": test_data["package_id"],
                "booking_ref": f"MRJ-V327-1-{TEST_RUN_ID}",
                "buyer_office_name": "مكتب v327-أ",
                "registrants": [
                    {"name": "A1", "age": 30, "room_type": "double", "passport_no": "P327001"}
                ],
                "currency": "SAR"
            }
        }
        payload_str = json.dumps(webhook_payload)
        signature = sign_webhook(payload_str)
        
        resp = session.post(
            f"{BASE_URL}/meraaj/webhooks",
            data=payload_str,
            headers={
                "Content-Type": "application/json",
                "x-meraaj-signature": signature
            }
        )
        if resp.status_code != 200:
            log(f"❌ Webhook e1 failed: {resp.status_code} - {resp.text}")
            return False
        result = resp.json()
        log(f"DEBUG: Webhook e1 response: {json.dumps(result, indent=2)}")
        test_data["inbound_e1_id"] = result.get("inbound_booking", {}).get("id")
        log(f"✅ Inbound booking e1 created: {test_data['inbound_e1_id']}, seats: {result.get('inbound_booking', {}).get('seats')}")
    except Exception as e:
        log(f"❌ Webhook e1 exception: {e}")
        return False
    
    # 6. Inject inbound booking e2 (2 adults double)
    log("Injecting inbound booking e2 (2 adults double)...")
    try:
        webhook_payload = {
            "id": f"v327-e2-{TEST_RUN_ID}",
            "type": "meraaj.booking.created",
            "data": {
                "package_ref": test_data["package_id"],
                "booking_ref": f"MRJ-V327-2-{TEST_RUN_ID}",
                "buyer_office_name": "مكتب v327-ب",
                "registrants": [
                    {"name": "B1", "age": 35, "room_type": "double", "passport_no": "P327002"},
                    {"name": "B2", "age": 32, "room_type": "double", "passport_no": "P327003"}
                ],
                "currency": "SAR"
            }
        }
        payload_str = json.dumps(webhook_payload)
        signature = sign_webhook(payload_str)
        
        resp = session.post(
            f"{BASE_URL}/meraaj/webhooks",
            data=payload_str,
            headers={
                "Content-Type": "application/json",
                "x-meraaj-signature": signature
            }
        )
        if resp.status_code != 200:
            log(f"❌ Webhook e2 failed: {resp.status_code} - {resp.text}")
            return False
        result = resp.json()
        test_data["inbound_e2_id"] = result.get("inbound_booking", {}).get("id")
        log(f"✅ Inbound booking e2 created: {test_data['inbound_e2_id']}, seats: {result.get('inbound_booking', {}).get('seats')}")
    except Exception as e:
        log(f"❌ Webhook e2 exception: {e}")
        return False
    
    # 7. Verify seats_sold = 3
    log("Verifying package seats_sold = 3...")
    try:
        resp = session.get(f"{BASE_URL}/packages")
        if resp.status_code != 200:
            log(f"❌ Package fetch failed: {resp.status_code}")
            return False
        packages = resp.json()
        pkg = next((p for p in packages if p.get("id") == test_data["package_id"]), None)
        if not pkg:
            log(f"❌ Package not found in list")
            return False
        seats_sold = pkg.get("meraaj", {}).get("seats_sold", 0)
        if seats_sold != 3:
            log(f"❌ Expected seats_sold=3, got {seats_sold}")
            return False
        log(f"✅ Package seats_sold = {seats_sold}")
    except Exception as e:
        log(f"❌ Package verification exception: {e}")
        return False
    
    log("✅ SETUP COMPLETE")
    return True

def test_reject_without_reason():
    """TEST 1.1: Reject WITHOUT reason → 400"""
    log("\n=== TEST 1.1: Reject without reason ===")
    try:
        resp = session.post(
            f"{BASE_URL}/meraaj/inbound-bookings/{test_data['inbound_e2_id']}/reject",
            json={}
        )
        if resp.status_code != 400:
            log(f"❌ Expected 400, got {resp.status_code}: {resp.text}")
            return False
        data = resp.json()
        if "سبب الرفض إلزامي" not in data.get("error", ""):
            log(f"❌ Expected error message about required reason, got: {data}")
            return False
        log(f"✅ Reject without reason correctly returns 400: {data.get('error')}")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_reject_with_empty_reason():
    """TEST 1.1b: Reject with empty reason → 400"""
    log("\n=== TEST 1.1b: Reject with empty reason ===")
    try:
        resp = session.post(
            f"{BASE_URL}/meraaj/inbound-bookings/{test_data['inbound_e2_id']}/reject",
            json={"reason": ""}
        )
        if resp.status_code != 400:
            log(f"❌ Expected 400, got {resp.status_code}: {resp.text}")
            return False
        data = resp.json()
        if "سبب الرفض إلزامي" not in data.get("error", ""):
            log(f"❌ Expected error message about required reason, got: {data}")
            return False
        log(f"✅ Reject with empty reason correctly returns 400: {data.get('error')}")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_reject_with_reason():
    """TEST 1.2: Reject with reason → verify status, seats, events"""
    log("\n=== TEST 1.2: Reject with reason ===")
    try:
        # Reject e2
        resp = session.post(
            f"{BASE_URL}/meraaj/inbound-bookings/{test_data['inbound_e2_id']}/reject",
            json={"reason": "المقاعد محجوزة لمجموعة أخرى"}
        )
        if resp.status_code != 200:
            log(f"❌ Reject failed: {resp.status_code} - {resp.text}")
            return False
        data = resp.json()
        if not data.get("rejected"):
            log(f"❌ Expected rejected=true, got: {data}")
            return False
        if data.get("released_seats") != 2:
            log(f"❌ Expected released_seats=2, got: {data.get('released_seats')}")
            return False
        log(f"✅ Reject response: rejected={data['rejected']}, released_seats={data['released_seats']}")
        
        # Verify inbound status
        resp = session.get(f"{BASE_URL}/meraaj/inbound-bookings")
        if resp.status_code != 200:
            log(f"❌ Failed to fetch inbound bookings: {resp.status_code}")
            return False
        inbounds = resp.json()
        e2 = next((ib for ib in inbounds if ib["id"] == test_data["inbound_e2_id"]), None)
        if not e2:
            log(f"❌ Inbound e2 not found")
            return False
        if e2.get("status") != "rejected":
            log(f"❌ Expected status=rejected, got: {e2.get('status')}")
            return False
        if e2.get("reject_reason") != "المقاعد محجوزة لمجموعة أخرى":
            log(f"❌ Reject reason mismatch: {e2.get('reject_reason')}")
            return False
        log(f"✅ Inbound e2 status=rejected, reject_reason stored")
        
        # Verify seats_sold back to 1
        resp = session.get(f"{BASE_URL}/packages")
        if resp.status_code != 200:
            log(f"❌ Package fetch failed: {resp.status_code}")
            return False
        packages = resp.json()
        pkg = next((p for p in packages if p.get("id") == test_data["package_id"]), None)
        if not pkg:
            log(f"❌ Package not found")
            return False
        seats_sold = pkg.get("meraaj", {}).get("seats_sold", 0)
        if seats_sold != 1:
            log(f"❌ Expected seats_sold=1, got {seats_sold}")
            return False
        log(f"✅ Package seats_sold back to 1")
        
        # Verify events
        resp = session.get(f"{BASE_URL}/meraaj/events")
        if resp.status_code != 200:
            log(f"❌ Failed to fetch events: {resp.status_code}")
            return False
        events = resp.json()
        
        # Debug: log all event types and booking_refs
        log(f"DEBUG: Found {len(events)} events")
        for e in events[:5]:  # Show first 5
            payload_str = json.dumps(e.get('payload', {}), ensure_ascii=False)[:150]
            log(f"  - type={e.get('type')}, payload={payload_str}")
        
        # Check for booking.rejected event
        rejected_event = next((e for e in events if e.get("type") == "booking.rejected"), None)
        if not rejected_event:
            log(f"❌ booking.rejected event not found")
            return False
        if rejected_event["payload"].get("reason") != "المقاعد محجوزة لمجموعة أخرى":
            log(f"❌ Event reason mismatch: {rejected_event['payload'].get('reason')}")
            return False
        if rejected_event["payload"].get("released_seats") != 2:
            log(f"❌ Event released_seats mismatch: {rejected_event['payload'].get('released_seats')}")
            return False
        log(f"✅ booking.rejected event found with correct reason and released_seats")
        
        # Check for inventory.updated event
        inventory_event = next((e for e in events if e.get("type") == "inventory.updated" and e.get("payload", {}).get("package_ref") == test_data["package_id"]), None)
        if not inventory_event:
            log(f"❌ inventory.updated event not found")
            return False
        log(f"✅ inventory.updated event found")
        
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_double_reject():
    """TEST 1.3: Double reject same booking → 400"""
    log("\n=== TEST 1.3: Double reject same booking ===")
    try:
        resp = session.post(
            f"{BASE_URL}/meraaj/inbound-bookings/{test_data['inbound_e2_id']}/reject",
            json={"reason": "Another reason"}
        )
        if resp.status_code != 400:
            log(f"❌ Expected 400, got {resp.status_code}: {resp.text}")
            return False
        data = resp.json()
        if "مرفوض مسبقاً" not in data.get("error", ""):
            log(f"❌ Expected error about already rejected, got: {data}")
            return False
        log(f"✅ Double reject correctly returns 400: {data.get('error')}")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_approve_e1():
    """TEST 1.4: Approve e1 → verify booking.approved event"""
    log("\n=== TEST 1.4: Approve e1 ===")
    try:
        resp = session.post(
            f"{BASE_URL}/meraaj/inbound-bookings/{test_data['inbound_e1_id']}/approve"
        )
        if resp.status_code != 200:
            log(f"❌ Approve failed: {resp.status_code} - {resp.text}")
            return False
        data = resp.json()
        if not data.get("approved"):
            log(f"❌ Expected approved=true, got: {data}")
            return False
        test_data["approved_booking_id"] = data.get("booking", {}).get("id")
        test_data["client_id"] = data.get("client", {}).get("id")
        log(f"✅ Approve response: approved={data['approved']}, booking_id={test_data['approved_booking_id']}")
        
        # Verify booking.approved event
        resp = session.get(f"{BASE_URL}/meraaj/events")
        if resp.status_code != 200:
            log(f"❌ Failed to fetch events: {resp.status_code}")
            return False
        events = resp.json()
        
        approved_event = next((e for e in events if e.get("type") == "booking.approved"), None)
        if not approved_event:
            log(f"❌ booking.approved event not found")
            return False
        
        event_data = approved_event["payload"]
        if f"MRJ-V327-1-{TEST_RUN_ID}" not in event_data.get("booking_ref", ""):
            log(f"❌ Event booking_ref mismatch: {event_data.get('booking_ref')}")
            return False
        if event_data.get("seats") != 1:
            log(f"❌ Event seats mismatch: {event_data.get('seats')}")
            return False
        
        # Calculate expected net_to_seller_total
        # 1 adult double: customer pays 1000, commission 50 deducted, net to seller = 950
        expected_net = 950
        actual_net = event_data.get("net_to_seller_total")
        if actual_net != expected_net:
            log(f"❌ Event net_to_seller_total mismatch: expected {expected_net}, got {actual_net}")
            return False
        
        log(f"✅ booking.approved event found: booking_ref={event_data.get('booking_ref')}, seats={event_data.get('seats')}, net_to_seller_total={actual_net}")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_reject_approved():
    """TEST 1.5: Reject an APPROVED booking → 400"""
    log("\n=== TEST 1.5: Reject approved booking ===")
    try:
        resp = session.post(
            f"{BASE_URL}/meraaj/inbound-bookings/{test_data['inbound_e1_id']}/reject",
            json={"reason": "Try to reject approved"}
        )
        if resp.status_code != 400:
            log(f"❌ Expected 400, got {resp.status_code}: {resp.text}")
            return False
        data = resp.json()
        if "لا يمكن رفض حجز معتمد" not in data.get("error", ""):
            log(f"❌ Expected error about cannot reject approved, got: {data}")
            return False
        log(f"✅ Reject approved correctly returns 400: {data.get('error')}")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_whatsapp_create():
    """TEST 2.1: POST whatsapp-logs with dirty phone/name → verify sanitization"""
    log("\n=== TEST 2.1: Create WhatsApp log ===")
    try:
        resp = session.post(f"{BASE_URL}/whatsapp-logs", json={
            "package_id": test_data["package_id"],
            "package_name": "REJ-v327",
            "phone": "+967 77x 1234 y56",  # dirty phone
            "customer_name": "  زبون v327  ",  # spaces
            "message": "عرض تجريبي طويل للباكج REJ-v327 مع تفاصيل كثيرة..."
        })
        if resp.status_code != 200:
            log(f"❌ WhatsApp log creation failed: {resp.status_code} - {resp.text}")
            return False
        data = resp.json()
        test_data["whatsapp_log_id"] = data.get("id")
        
        # Verify phone sanitization (only digits and +)
        phone = data.get("phone")
        if phone != "+96777123456":
            log(f"❌ Phone not sanitized correctly: expected '+96777123456', got '{phone}'")
            return False
        
        # Verify customer_name trimmed
        customer_name = data.get("customer_name")
        if customer_name != "زبون v327":
            log(f"❌ Customer name not trimmed: expected 'زبون v327', got '{customer_name}'")
            return False
        
        # Verify sent_by is logged-in user
        sent_by = data.get("sent_by")
        if not sent_by:
            log(f"❌ sent_by not set: {sent_by}")
            return False
        
        # Verify status default
        status = data.get("status")
        if status != "sent":
            log(f"❌ Status not 'sent': {status}")
            return False
        
        log(f"✅ WhatsApp log created: id={test_data['whatsapp_log_id']}, phone={phone}, customer_name={customer_name}, sent_by={sent_by}, status={status}")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_whatsapp_get_all():
    """TEST 2.2a: GET whatsapp-logs → includes created log"""
    log("\n=== TEST 2.2a: GET all WhatsApp logs ===")
    try:
        resp = session.get(f"{BASE_URL}/whatsapp-logs")
        if resp.status_code != 200:
            log(f"❌ GET failed: {resp.status_code} - {resp.text}")
            return False
        logs = resp.json()
        
        found = next((log for log in logs if log.get("id") == test_data["whatsapp_log_id"]), None)
        if not found:
            log(f"❌ Created log not found in list")
            return False
        
        log(f"✅ GET all logs successful, found created log")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_whatsapp_get_filtered():
    """TEST 2.2b: GET whatsapp-logs?package_id=<pkg> → filtered"""
    log("\n=== TEST 2.2b: GET filtered WhatsApp logs ===")
    try:
        resp = session.get(f"{BASE_URL}/whatsapp-logs?package_id={test_data['package_id']}")
        if resp.status_code != 200:
            log(f"❌ GET filtered failed: {resp.status_code} - {resp.text}")
            return False
        logs = resp.json()
        
        # All logs should have matching package_id
        for log_entry in logs:
            if log_entry.get("package_id") != test_data["package_id"]:
                log(f"❌ Found log with different package_id: {log_entry.get('package_id')}")
                return False
        
        found = next((log for log in logs if log.get("id") == test_data["whatsapp_log_id"]), None)
        if not found:
            log(f"❌ Created log not found in filtered list")
            return False
        
        log(f"✅ GET filtered logs successful, found {len(logs)} logs for package")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_whatsapp_patch_valid():
    """TEST 2.3a: PATCH whatsapp-logs/:id with valid status and notes"""
    log("\n=== TEST 2.3a: PATCH WhatsApp log (valid) ===")
    try:
        resp = session.patch(
            f"{BASE_URL}/whatsapp-logs/{test_data['whatsapp_log_id']}",
            json={
                "status": "interested",
                "notes": "سيؤكد غداً"
            }
        )
        if resp.status_code != 200:
            log(f"❌ PATCH failed: {resp.status_code} - {resp.text}")
            return False
        data = resp.json()
        if not data.get("success"):
            log(f"❌ Expected success=true, got: {data}")
            return False
        
        # Verify changes persisted
        resp = session.get(f"{BASE_URL}/whatsapp-logs")
        if resp.status_code != 200:
            log(f"❌ GET failed: {resp.status_code}")
            return False
        logs = resp.json()
        updated = next((log for log in logs if log.get("id") == test_data["whatsapp_log_id"]), None)
        if not updated:
            log(f"❌ Log not found after update")
            return False
        
        if updated.get("status") != "interested":
            log(f"❌ Status not updated: {updated.get('status')}")
            return False
        if updated.get("notes") != "سيؤكد غداً":
            log(f"❌ Notes not updated: {updated.get('notes')}")
            return False
        
        log(f"✅ PATCH successful, status={updated['status']}, notes={updated['notes']}")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_whatsapp_patch_invalid():
    """TEST 2.3b: PATCH with invalid status and no other fields → 400"""
    log("\n=== TEST 2.3b: PATCH WhatsApp log (invalid) ===")
    try:
        resp = session.patch(
            f"{BASE_URL}/whatsapp-logs/{test_data['whatsapp_log_id']}",
            json={"status": "xyz"}
        )
        if resp.status_code != 400:
            log(f"❌ Expected 400, got {resp.status_code}: {resp.text}")
            return False
        data = resp.json()
        if "لا توجد تعديلات" not in data.get("error", ""):
            log(f"❌ Expected error about no updates, got: {data}")
            return False
        log(f"✅ PATCH invalid correctly returns 400: {data.get('error')}")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_whatsapp_patch_nonexistent():
    """TEST 2.3c: PATCH non-existent id → 404"""
    log("\n=== TEST 2.3c: PATCH non-existent WhatsApp log ===")
    try:
        resp = session.patch(
            f"{BASE_URL}/whatsapp-logs/nonexistent-id-v327",
            json={"status": "interested"}
        )
        if resp.status_code != 404:
            log(f"❌ Expected 404, got {resp.status_code}: {resp.text}")
            return False
        data = resp.json()
        if "السجل غير موجود" not in data.get("error", ""):
            log(f"❌ Expected error about not found, got: {data}")
            return False
        log(f"✅ PATCH non-existent correctly returns 404: {data.get('error')}")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_regression_je_and_balances():
    """TEST 3: Verify approved booking JE and balances"""
    log("\n=== TEST 3: Regression - JE and balances ===")
    try:
        # Get the approved booking
        resp = session.get(f"{BASE_URL}/packages/{test_data['package_id']}/bookings")
        if resp.status_code != 200:
            log(f"❌ Failed to fetch bookings: {resp.status_code}")
            return False
        bookings = resp.json()
        booking = next((b for b in bookings if b.get("id") == test_data["approved_booking_id"]), None)
        if not booking:
            log(f"❌ Approved booking not found")
            return False
        
        # Expected values:
        # 1 adult double: room sale = 1000, commission = 50 (deducted), net to seller = 950
        # Component: cost = 400, sale = 700
        # Total sale to client = 950 (room net) + 700 (component) = 1650? NO!
        # Actually, the booking total_sale should be the net_to_seller from room pricing
        # Let me check the actual values
        
        total_sale = booking.get("total_sale")
        total_cost = booking.get("total_cost")
        
        log(f"Booking: total_sale={total_sale}, total_cost={total_cost}")
        
        # Get client balance
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code != 200:
            log(f"❌ Failed to fetch clients: {resp.status_code}")
            return False
        clients = resp.json()
        log(f"DEBUG: Found {len(clients)} clients")
        client = next((c for c in clients if c.get("id") == test_data["client_id"]), None)
        if not client:
            log(f"❌ Client not found, looking for id={test_data['client_id']}")
            log(f"DEBUG: Available client IDs: {[c.get('id') for c in clients[:5]]}")
            return False
        client_balance_sar = client.get("balance_SAR", 0)
        if client_balance_sar == 0:
            # Try balances.SAR
            client_balance_sar = client.get("balances", {}).get("SAR", 0)
        log(f"Client: id={client.get('id')}, name={client.get('name')}, balance_SAR={client_balance_sar}")
        
        log(f"Client balance SAR: {client_balance_sar}")
        
        # Get supplier balance
        resp = session.get(f"{BASE_URL}/suppliers")
        if resp.status_code != 200:
            log(f"❌ Failed to fetch suppliers: {resp.status_code}")
            return False
        suppliers = resp.json()
        supplier = next((s for s in suppliers if s.get("id") == test_data["supplier_id"]), None)
        if not supplier:
            log(f"❌ Supplier not found")
            return False
        supplier_balance_sar = supplier.get("balance_SAR", 0)
        if supplier_balance_sar == 0:
            # Try balances.SAR
            supplier_balance_sar = supplier.get("balances", {}).get("SAR", 0)
        
        log(f"Supplier balance SAR: {supplier_balance_sar}")
        
        # Get journal entry
        resp = session.get(f"{BASE_URL}/journal-entries")
        if resp.status_code != 200:
            log(f"❌ Failed to fetch journal entries: {resp.status_code}")
            return False
        entries = resp.json()
        
        # Find the booking's JE
        je = next((e for e in entries if e.get("ref_id") == test_data["approved_booking_id"]), None)
        if not je:
            log(f"❌ Journal entry not found for booking")
            return False
        
        lines = je.get("lines", [])
        log(f"Journal entry has {len(lines)} lines")
        for i, line in enumerate(lines):
            log(f"  Line {i+1}: account={line.get('account_code')}, debit={line.get('debit')}, credit={line.get('credit')}, party={line.get('party_name')}")
        
        # Verify JE is balanced
        total_debit = sum(line.get("debit", 0) for line in lines)
        total_credit = sum(line.get("credit", 0) for line in lines)
        
        if abs(total_debit - total_credit) > 0.01:
            log(f"❌ JE not balanced: debit={total_debit}, credit={total_credit}")
            return False
        
        log(f"✅ JE balanced: debit={total_debit}, credit={total_credit}")
        
        # Verify client balance matches total_sale
        if abs(client_balance_sar - total_sale) > 0.01:
            log(f"❌ Client balance mismatch: expected {total_sale}, got {client_balance_sar}")
            return False
        
        log(f"✅ Client balance matches total_sale: {client_balance_sar}")
        
        # Verify supplier balance matches total_cost
        if abs(supplier_balance_sar - total_cost) > 0.01:
            log(f"❌ Supplier balance mismatch: expected {total_cost}, got {supplier_balance_sar}")
            return False
        
        log(f"✅ Supplier balance matches total_cost: {supplier_balance_sar}")
        
        # Verify revenue = total_sale - total_cost
        expected_revenue = total_sale - total_cost
        
        # Find revenue line (credit on account 4103 - package revenue)
        revenue_line = next((line for line in lines if line.get("credit", 0) > 0 and line.get("account_code") == "4103"), None)
        if not revenue_line:
            log(f"❌ Revenue line not found in JE")
            return False
        
        actual_revenue = revenue_line.get("credit", 0)
        if abs(actual_revenue - expected_revenue) > 0.01:
            log(f"❌ Revenue mismatch: expected {expected_revenue}, got {actual_revenue}")
            return False
        
        log(f"✅ Revenue correct: {actual_revenue}")
        
        # Verify auto-created client name
        client_name = client.get("name")
        if "معراج" not in client_name or "v327-أ" not in client_name:
            log(f"❌ Client name doesn't match expected pattern: {client_name}")
            return False
        
        log(f"✅ Auto-created client name correct: {client_name}")
        
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_whatsapp_delete():
    """TEST 2.4: DELETE whatsapp-logs/:id"""
    log("\n=== TEST 2.4: DELETE WhatsApp log ===")
    try:
        resp = session.delete(f"{BASE_URL}/whatsapp-logs/{test_data['whatsapp_log_id']}")
        if resp.status_code != 200:
            log(f"❌ DELETE failed: {resp.status_code} - {resp.text}")
            return False
        data = resp.json()
        if not data.get("deleted"):
            log(f"❌ Expected deleted=true, got: {data}")
            return False
        
        # Verify it's gone
        resp = session.get(f"{BASE_URL}/whatsapp-logs")
        if resp.status_code != 200:
            log(f"❌ GET failed: {resp.status_code}")
            return False
        logs = resp.json()
        found = next((log for log in logs if log.get("id") == test_data["whatsapp_log_id"]), None)
        if found:
            log(f"❌ Log still exists after delete")
            return False
        
        log(f"✅ DELETE successful, log removed")
        return True
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_cleanup():
    """CLEANUP: Delete all test data"""
    log("\n=== CLEANUP: Delete all test data ===")
    
    # 1. Delete approved booking
    if test_data["approved_booking_id"]:
        log(f"Deleting approved booking {test_data['approved_booking_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/packages/{test_data['package_id']}/bookings/{test_data['approved_booking_id']}")
            if resp.status_code == 200:
                log(f"✅ Approved booking deleted")
            else:
                log(f"⚠️ Failed to delete approved booking: {resp.status_code}")
        except Exception as e:
            log(f"⚠️ Exception deleting approved booking: {e}")
    
    # 2. Unshare package
    if test_data["package_id"]:
        log(f"Unsharing package {test_data['package_id']}...")
        try:
            resp = session.post(f"{BASE_URL}/packages/{test_data['package_id']}/meraaj-share", json={
                "enabled": False
            })
            if resp.status_code == 200:
                log(f"✅ Package unshared")
            else:
                log(f"⚠️ Failed to unshare package: {resp.status_code}")
        except Exception as e:
            log(f"⚠️ Exception unsharing package: {e}")
    
    # 3. Delete package
    if test_data["package_id"]:
        log(f"Deleting package {test_data['package_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/packages/{test_data['package_id']}")
            if resp.status_code == 200:
                log(f"✅ Package deleted")
            else:
                log(f"⚠️ Failed to delete package: {resp.status_code}")
        except Exception as e:
            log(f"⚠️ Exception deleting package: {e}")
    
    # 4. Delete auto-created client
    if test_data["client_id"]:
        log(f"Deleting auto-created client {test_data['client_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/clients/{test_data['client_id']}")
            if resp.status_code == 200:
                log(f"✅ Client deleted")
            else:
                log(f"⚠️ Failed to delete client: {resp.status_code}")
        except Exception as e:
            log(f"⚠️ Exception deleting client: {e}")
    
    # 5. Delete supplier
    if test_data["supplier_id"]:
        log(f"Deleting supplier {test_data['supplier_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/suppliers/{test_data['supplier_id']}")
            if resp.status_code == 200:
                log(f"✅ Supplier deleted")
            else:
                log(f"⚠️ Failed to delete supplier: {resp.status_code}")
        except Exception as e:
            log(f"⚠️ Exception deleting supplier: {e}")
    
    # 6. Check for leftover meraaj_* documents
    log("Checking for leftover meraaj_* documents...")
    try:
        # Check inbound bookings
        resp = session.get(f"{BASE_URL}/meraaj/inbound-bookings")
        if resp.status_code == 200:
            inbounds = resp.json()
            v327_inbounds = [ib for ib in inbounds if "v327" in ib.get("meraaj_booking_ref", "").lower() or "v327" in ib.get("buyer_office_name", "").lower()]
            if v327_inbounds:
                log(f"⚠️ Found {len(v327_inbounds)} leftover inbound bookings:")
                for ib in v327_inbounds:
                    log(f"   - {ib.get('id')} ({ib.get('meraaj_booking_ref')})")
            else:
                log(f"✅ No leftover inbound bookings")
        
        # Check events
        resp = session.get(f"{BASE_URL}/meraaj/events")
        if resp.status_code == 200:
            events = resp.json()
            v327_events = [e for e in events if "v327" in str(e.get("data", {})).lower()]
            if v327_events:
                log(f"⚠️ Found {len(v327_events)} leftover events (expected - events are kept for audit)")
            else:
                log(f"✅ No leftover events")
        
        # Check whatsapp logs
        resp = session.get(f"{BASE_URL}/whatsapp-logs")
        if resp.status_code == 200:
            logs = resp.json()
            v327_logs = [l for l in logs if "v327" in l.get("customer_name", "").lower() or "v327" in l.get("package_name", "").lower()]
            if v327_logs:
                log(f"⚠️ Found {len(v327_logs)} leftover whatsapp logs:")
                for wl in v327_logs:
                    log(f"   - {wl.get('id')} ({wl.get('customer_name')})")
            else:
                log(f"✅ No leftover whatsapp logs")
    except Exception as e:
        log(f"⚠️ Exception checking leftovers: {e}")
    
    log("✅ CLEANUP COMPLETE")
    return True

def main():
    """Run all tests"""
    log("=" * 80)
    log("v3.27 Backend Test Suite - Meraaj Reject + WhatsApp Mini CRM")
    log("=" * 80)
    
    results = {}
    
    # Test 0: Login
    results["Login"] = test_login()
    if not results["Login"]:
        log("\n❌ LOGIN FAILED - Cannot continue")
        return
    
    # Setup
    results["Setup"] = test_setup()
    if not results["Setup"]:
        log("\n❌ SETUP FAILED - Cannot continue")
        return
    
    # Test 1: Reject endpoint
    results["Reject without reason"] = test_reject_without_reason()
    results["Reject with empty reason"] = test_reject_with_empty_reason()
    results["Reject with reason"] = test_reject_with_reason()
    results["Double reject"] = test_double_reject()
    results["Approve e1"] = test_approve_e1()
    results["Reject approved"] = test_reject_approved()
    
    # Test 2: WhatsApp Mini CRM
    results["WhatsApp create"] = test_whatsapp_create()
    results["WhatsApp get all"] = test_whatsapp_get_all()
    results["WhatsApp get filtered"] = test_whatsapp_get_filtered()
    results["WhatsApp patch valid"] = test_whatsapp_patch_valid()
    results["WhatsApp patch invalid"] = test_whatsapp_patch_invalid()
    results["WhatsApp patch nonexistent"] = test_whatsapp_patch_nonexistent()
    
    # Test 3: Regression
    results["Regression JE and balances"] = test_regression_je_and_balances()
    
    # Test 2.4: WhatsApp delete (after regression test)
    results["WhatsApp delete"] = test_whatsapp_delete()
    
    # Cleanup
    results["Cleanup"] = test_cleanup()
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status}: {test_name}")
    log("=" * 80)
    log(f"TOTAL: {passed}/{total} tests passed")
    log("=" * 80)
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED!")
    else:
        log(f"\n⚠️ {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
