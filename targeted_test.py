#!/usr/bin/env python3
"""
TARGETED RE-RUN: 3 sections with timing issues
1. EVENTS LIFECYCLE (package.updated, package.deactivated, reopen)
2. RESYNC EVENTS (resync-all with stale market_pricing)
3. WEBHOOK JOURNAL VERIFICATION (signed webhook with journal balance)
"""

import requests
import json
import hmac
import hashlib
from pymongo import MongoClient
from datetime import datetime
import time

# Configuration from .env
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "your_database_name"
MERAAJ_SHARED_SECRET = "d81273d7aaefbd96b0813cfe9f1cbb5c61eebbc597995e8d5fab5ab38ce00168"

# Credentials
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "Demo@2025"

# Test data tracking for cleanup
test_data = {
    "packages": [],
    "bookings": [],
    "inbound_bookings": [],
    "journal_entries": [],
    "webhook_logs": [],
    "events": []
}

owner_session = None

def log_test(section, test_name, status, details=""):
    """Log test results"""
    symbol = "✅" if status == "PASS" else "❌"
    print(f"\n{symbol} [{section}] {test_name}")
    if details:
        print(f"   {details}")

def login(email, password):
    """Login and return session object with cookies"""
    try:
        session = requests.Session()
        response = session.post(f"{BASE_URL}/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return session
        else:
            print(f"Login failed for {email}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Login exception for {email}: {str(e)}")
        return None

def compute_hmac_signature(payload_str):
    """Compute HMAC-SHA256 hex signature for webhook"""
    return hmac.new(
        MERAAJ_SHARED_SECRET.encode('utf-8'),
        payload_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

def get_mongo_client():
    """Get MongoDB client"""
    return MongoClient(MONGO_URL)

def poll_for_event(db, event_type, package_ref, max_attempts=5, delay=0.5):
    """Poll for event with retries"""
    for attempt in range(max_attempts):
        events = list(db.meraaj_events.find({
            "type": event_type,
            "payload.package_ref": package_ref
        }).sort("created_at", -1).limit(1))
        
        if len(events) > 0:
            return events[0]
        
        if attempt < max_attempts - 1:
            time.sleep(delay)
    
    return None

# ============================================================================
# SECTION 1: EVENTS LIFECYCLE
# ============================================================================

def test_events_lifecycle():
    """Test package lifecycle events with retry polling"""
    print("\n" + "="*80)
    print("SECTION 1: EVENTS LIFECYCLE")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    
    # Create test package with unique name
    timestamp = int(time.time())
    pkg_name = f"TARGETED TEST EVENTS {timestamp}"
    
    pkg_response = owner_session.post(f"{BASE_URL}/packages", json={
        "name": pkg_name,
        "package_type": "عمرة",
        "room_pricing": [{
            "type": "ثنائي",
            "sale_per_pax": 1000,
            "sale_child": 800,
            "sale_infant": None
        }]
    })
    
    if pkg_response.status_code != 200:
        log_test("EVENTS", "Create test package", "FAIL", f"Status: {pkg_response.status_code}")
        return False
    
    pkg_id = pkg_response.json().get("id")
    test_data["packages"].append(pkg_id)
    log_test("EVENTS", "Create test package", "PASS", f"Package ID: {pkg_id}, Name: {pkg_name}")
    
    # Set meraaj config directly in MongoDB
    db.packages.update_one(
        {"id": pkg_id},
        {"$set": {
            "meraaj.shared": True,
            "meraaj.seats_allocated": 10,
            "meraaj.buyer_commission_mode": "amount",
            "meraaj.buyer_commission_value": 100,
            "meraaj.buyer_commission_child_value": 50,
            "meraaj.buyer_commission_infant_value": 0,
            "meraaj.commission_direction": "deducted",
            "meraaj.market_pricing": []  # Empty to trigger recomputation
        }}
    )
    
    log_test("EVENTS", "Set meraaj config in MongoDB", "PASS", 
            "shared=true, seats_allocated=10, commission values set, market_pricing=[]")
    
    # 1.1 PATCH package with room_pricing → package.updated event
    time.sleep(0.5)
    
    response = owner_session.patch(f"{BASE_URL}/packages/{pkg_id}", json={
        "name": f"{pkg_name} (updated)",
        "room_pricing": [{
            "type": "ثنائي",
            "sale_per_pax": 1000,
            "sale_child": 800,
            "sale_infant": None
        }]
    })
    
    if response.status_code != 200:
        log_test("EVENTS", "PATCH package", "FAIL", f"Status: {response.status_code}")
        return False
    
    log_test("EVENTS", "PATCH package", "PASS")
    
    # Poll for package.updated event (up to 5 attempts, 0.5s delay)
    event = poll_for_event(db, "package.updated", pkg_id, max_attempts=5, delay=0.5)
    
    if not event:
        log_test("EVENTS", "Verify package.updated event (with retry)", "FAIL", 
                "No package.updated event found after 5 attempts")
        return False
    
    payload = event["payload"]
    
    # Verify payload structure
    required_fields = ["rahal_ref", "package_ref", "title", "package_type", "room_pricing", "components", "features", "images"]
    missing_fields = [f for f in required_fields if f not in payload]
    
    if missing_fields:
        log_test("EVENTS", "Verify package.updated payload fields", "FAIL", f"Missing fields: {missing_fields}")
        return False
    
    # Verify room_pricing has no nulls
    if payload.get("room_pricing"):
        for room in payload["room_pricing"]:
            for key in ["base", "commission", "net", "customer"]:
                if key in room:
                    for age in ["adult", "child", "infant"]:
                        if age in room[key] and room[key][age] is None:
                            log_test("EVENTS", "Verify no nulls in room_pricing", "FAIL", 
                                    f"Found null in {key}.{age}")
                            return False
    
    log_test("EVENTS", "PATCH → package.updated event (with retry)", "PASS", 
            f"Event found after polling, all required fields present, no nulls in room_pricing")
    
    # 1.2 Close package → package.deactivated event
    time.sleep(0.5)
    
    response = owner_session.patch(f"{BASE_URL}/packages/{pkg_id}", json={"status": "closed"})
    
    if response.status_code != 200:
        log_test("EVENTS", "Close package (status=closed)", "FAIL", f"Status: {response.status_code}")
        return False
    
    log_test("EVENTS", "Close package (status=closed)", "PASS")
    
    # Verify package status is closed in MongoDB
    pkg_doc = db.packages.find_one({"id": pkg_id})
    if not pkg_doc or pkg_doc.get("status") != "closed":
        log_test("EVENTS", "Verify package status=closed in MongoDB", "FAIL", 
                f"Package status not closed: status={pkg_doc.get('status') if pkg_doc else 'NOT FOUND'}")
        return False
    
    log_test("EVENTS", "Verify package status=closed in MongoDB", "PASS")
    
    # Poll for package.deactivated event
    event = poll_for_event(db, "package.deactivated", pkg_id, max_attempts=5, delay=0.5)
    
    if not event:
        log_test("EVENTS", "Verify package.deactivated event (with retry)", "FAIL", 
                "No package.deactivated event found after 5 attempts")
        return False
    
    payload = event["payload"]
    
    if payload.get("reason") != "closed_by_office":
        log_test("EVENTS", "Verify deactivated reason", "FAIL", 
                f"Expected 'closed_by_office', got {payload.get('reason')}")
        return False
    
    log_test("EVENTS", "Close → package.deactivated event (with retry)", "PASS", 
            "Event found with reason='closed_by_office'")
    
    # 1.3 Reopen package → package.updated event
    time.sleep(0.5)
    
    response = owner_session.patch(f"{BASE_URL}/packages/{pkg_id}", json={"status": "open"})
    
    if response.status_code != 200:
        log_test("EVENTS", "Reopen package (status=open)", "FAIL", f"Status: {response.status_code}")
        return False
    
    # Poll for package.updated event (after reopen)
    event = poll_for_event(db, "package.updated", pkg_id, max_attempts=5, delay=0.5)
    
    if not event:
        log_test("EVENTS", "Verify package.updated on reopen (with retry)", "FAIL", 
                "No package.updated event found after 5 attempts")
        return False
    
    log_test("EVENTS", "Reopen → package.updated event (with retry)", "PASS", 
            "Event found after polling")
    
    return True

# ============================================================================
# SECTION 2: RESYNC EVENTS
# ============================================================================

def test_resync_events():
    """Test resync-all with stale market_pricing"""
    print("\n" + "="*80)
    print("SECTION 2: RESYNC EVENTS")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    
    # Create test package with unique name
    timestamp = int(time.time())
    pkg_name = f"TARGETED TEST RESYNC {timestamp}"
    
    pkg_response = owner_session.post(f"{BASE_URL}/packages", json={
        "name": pkg_name,
        "package_type": "عمرة",
        "room_pricing": [{
            "type": "ثنائي",
            "sale_per_pax": 1500,
            "sale_child": 1200,
            "sale_infant": None
        }]
    })
    
    if pkg_response.status_code != 200:
        log_test("RESYNC", "Create test package", "FAIL", f"Status: {pkg_response.status_code}")
        return False
    
    pkg_id = pkg_response.json().get("id")
    test_data["packages"].append(pkg_id)
    log_test("RESYNC", "Create test package", "PASS", f"Package ID: {pkg_id}, Name: {pkg_name}")
    
    # Set meraaj config with STALE market_pricing
    db.packages.update_one(
        {"id": pkg_id},
        {"$set": {
            "meraaj.shared": True,
            "meraaj.seats_allocated": 10,
            "meraaj.buyer_commission_mode": "amount",
            "meraaj.buyer_commission_value": 100,
            "meraaj.buyer_commission_child_value": 50,
            "meraaj.buyer_commission_infant_value": 0,
            "meraaj.commission_direction": "deducted",
            "meraaj.market_pricing": [{
                "room_type": "قديم",  # STALE room type
                "base": {"adult": 999, "child": 999, "infant": 999}
            }]
        }}
    )
    
    log_test("RESYNC", "Set STALE market_pricing in MongoDB", "PASS", 
            "room_type='قديم' (stale data)")
    
    # 2.1 Owner POST /api/meraaj/resync-all
    response = owner_session.post(f"{BASE_URL}/meraaj/resync-all")
    
    if response.status_code != 200:
        log_test("RESYNC", "Owner POST /meraaj/resync-all", "FAIL", 
                f"Status: {response.status_code}, Body: {response.text}")
        return False
    
    result = response.json()
    log_test("RESYNC", "Owner POST /meraaj/resync-all", "PASS", 
            f"total={result.get('total')}, synced={result.get('synced')}, failed={result.get('failed', 0)}")
    
    # 2.2 Verify market_pricing recomputed (stale row gone)
    pkg_doc = db.packages.find_one({"id": pkg_id})
    market_pricing = pkg_doc["meraaj"]["market_pricing"]
    
    if len(market_pricing) == 0:
        log_test("RESYNC", "Verify market_pricing recomputed", "FAIL", "market_pricing is empty")
        return False
    
    # Check if stale row is gone
    stale_rows = [row for row in market_pricing if row.get("room_type") == "قديم"]
    if len(stale_rows) > 0:
        log_test("RESYNC", "Verify stale row removed", "FAIL", "Stale room_type='قديم' still present")
        return False
    
    # Verify correct room_type
    row = market_pricing[0]
    if row.get("room_type") != "ثنائي":
        log_test("RESYNC", "Verify correct room_type", "FAIL", f"Expected 'ثنائي', got {row.get('room_type')}")
        return False
    
    # Verify base.adult matches sale_per_pax
    if row["base"]["adult"] != 1500:
        log_test("RESYNC", "Verify base.adult recomputed", "FAIL", f"Expected 1500, got {row['base']['adult']}")
        return False
    
    # Verify base.child matches sale_child
    if row["base"]["child"] != 1200:
        log_test("RESYNC", "Verify base.child recomputed", "FAIL", f"Expected 1200, got {row['base']['child']}")
        return False
    
    log_test("RESYNC", "Verify market_pricing recomputed", "PASS", 
            f"Stale row removed, room_type='ثنائي', base.adult=1500, base.child=1200")
    
    # 2.3 Poll for package.updated event (with retry)
    event = poll_for_event(db, "package.updated", pkg_id, max_attempts=5, delay=0.5)
    
    if not event:
        log_test("RESYNC", "Verify package.updated event after resync (with retry)", "FAIL", 
                "No package.updated event found after 5 attempts")
        return False
    
    log_test("RESYNC", "Verify package.updated event after resync (with retry)", "PASS", 
            "Event found after polling")
    
    return True

# ============================================================================
# SECTION 3: WEBHOOK JOURNAL VERIFICATION
# ============================================================================

def test_webhook_journal():
    """Test webhook with journal entry balance verification"""
    print("\n" + "="*80)
    print("SECTION 3: WEBHOOK JOURNAL VERIFICATION")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    
    # Ensure auto_approve is OFF at the start
    response = owner_session.post(f"{BASE_URL}/meraaj/settings", json={"auto_approve": False})
    if response.status_code != 200:
        log_test("WEBHOOK", "Ensure auto_approve OFF at start", "FAIL", f"Status: {response.status_code}")
        return False
    
    log_test("WEBHOOK", "Ensure auto_approve OFF at start", "PASS")
    
    # Create test package with unique name
    timestamp = int(time.time())
    pkg_name = f"TARGETED TEST WEBHOOK {timestamp}"
    
    pkg_response = owner_session.post(f"{BASE_URL}/packages", json={
        "name": pkg_name,
        "package_type": "عمرة",
        "room_pricing": [{
            "type": "رباعي",
            "sale_per_pax": 1000,
            "sale_child": 800,
            "sale_infant": None
        }]
    })
    
    if pkg_response.status_code != 200:
        log_test("WEBHOOK", "Create test package", "FAIL", f"Status: {pkg_response.status_code}")
        return False
    
    pkg_id = pkg_response.json().get("id")
    test_data["packages"].append(pkg_id)
    log_test("WEBHOOK", "Create test package", "PASS", f"Package ID: {pkg_id}, Name: {pkg_name}")
    
    # Set meraaj config
    db.packages.update_one(
        {"id": pkg_id},
        {"$set": {
            "meraaj.shared": True,
            "meraaj.seats_allocated": 10,
            "meraaj.buyer_commission_mode": "amount",
            "meraaj.buyer_commission_value": 100,
            "meraaj.buyer_commission_child_value": 50,
            "meraaj.buyer_commission_infant_value": 0,
            "meraaj.commission_direction": "deducted",
            "meraaj.market_pricing": [{
                "room_type": "رباعي",
                "base": {"adult": 1000, "child": 800, "infant": 0},
                "commission": {"adult": 100, "child": 50, "infant": 0},
                "net": {"adult": 900, "child": 750, "infant": 0},
                "customer": {"adult": 1000, "child": 800, "infant": 0}
            }]
        }}
    )
    
    log_test("WEBHOOK", "Set meraaj config in MongoDB", "PASS")
    
    # 3.1 Send valid signed webhook (manual approve flow)
    event_id = f"evt-targeted-manual-{timestamp}"
    webhook_payload = {
        "id": event_id,
        "type": "meraaj.booking.created",
        "data": {
            "package_ref": pkg_id,
            "booking_ref": f"MRJ-TARGETED-{timestamp}",
            "buyer_office_name": "مكتب الاختبار المستهدف",
            "currency": "SAR",
            "registrants": [
                {"name": "مسافر بالغ", "age": 35, "room_type": "رباعي"}
            ]
        }
    }
    
    payload_str = json.dumps(webhook_payload, ensure_ascii=False, separators=(',', ':'))
    signature = compute_hmac_signature(payload_str)
    
    response = requests.post(f"{BASE_URL}/meraaj/webhooks",
        headers={"X-Meraaj-Signature": signature, "Content-Type": "application/json"},
        data=payload_str)
    
    if response.status_code != 200:
        log_test("WEBHOOK", "Send valid signed webhook", "FAIL", 
                f"Status: {response.status_code}, Body: {response.text}")
        return False
    
    result = response.json()
    if not result.get("received"):
        log_test("WEBHOOK", "Verify webhook received", "FAIL", f"received=false: {result}")
        return False
    
    inbound_id = result.get("inbound_booking", {}).get("id")
    if not inbound_id:
        log_test("WEBHOOK", "Get inbound booking ID", "FAIL", "inbound_booking.id not in response")
        return False
    
    test_data["inbound_bookings"].append(inbound_id)
    log_test("WEBHOOK", "Send valid signed webhook", "PASS", f"Inbound ID: {inbound_id}")
    
    # 3.2 Manual approve
    response = owner_session.post(f"{BASE_URL}/meraaj/inbound-bookings/{inbound_id}/approve")
    
    if response.status_code != 200:
        log_test("WEBHOOK", "Manual approve", "FAIL", 
                f"Status: {response.status_code}, Body: {response.text}")
        return False
    
    approve_result = response.json()
    if not approve_result.get("approved"):
        log_test("WEBHOOK", "Verify approval result", "FAIL", f"approved=false: {approve_result}")
        return False
    
    log_test("WEBHOOK", "Manual approve", "PASS")
    
    # 3.3 Verify journal entry (ref_type='package_booking', ref_id=booking_id)
    # First get the booking ID
    response = owner_session.get(f"{BASE_URL}/packages/{pkg_id}/bookings")
    if response.status_code != 200:
        log_test("WEBHOOK", "GET bookings", "FAIL", f"Status: {response.status_code}")
        return False
    
    bookings = response.json()
    meraaj_bookings = [b for b in bookings if b.get("source") == "meraaj" and "مسافر بالغ" in str(b.get("registrants", []))]
    
    if len(meraaj_bookings) != 1:
        log_test("WEBHOOK", "Find manual approved booking", "FAIL", f"Expected 1, got {len(meraaj_bookings)}")
        return False
    
    booking_id = meraaj_bookings[0]["id"]
    test_data["bookings"].append(booking_id)
    
    # Find journal entry by ref_type='package_booking' and ref_id=booking_id
    journal_entries = list(db.journal_entries.find({"ref_type": "package_booking", "ref_id": booking_id}))
    
    if len(journal_entries) == 0:
        log_test("WEBHOOK", "Verify journal entry created", "FAIL", 
                f"No journal entry found for ref_type='package_booking', ref_id={booking_id}")
        return False
    
    # Sum debits and credits from lines array
    total_debit = sum(line.get("debit", 0) for entry in journal_entries for line in entry.get("lines", []))
    total_credit = sum(line.get("credit", 0) for entry in journal_entries for line in entry.get("lines", []))
    
    if total_debit != total_credit:
        log_test("WEBHOOK", "Verify journal entry balanced", "FAIL", 
                f"Debit {total_debit} != Credit {total_credit}")
        return False
    
    log_test("WEBHOOK", "Verify journal entry balanced (manual approve)", "PASS", 
            f"Debit={total_debit}, Credit={total_credit}")
    
    for entry in journal_entries:
        test_data["journal_entries"].append(str(entry["_id"]))
    
    # 3.4 AUTO-APPROVE flow
    # Enable auto-approve
    response = owner_session.post(f"{BASE_URL}/meraaj/settings", json={"auto_approve": True})
    
    if response.status_code != 200:
        log_test("WEBHOOK", "Enable auto-approve", "FAIL", f"Status: {response.status_code}")
        return False
    
    log_test("WEBHOOK", "Enable auto-approve", "PASS")
    
    # Send second webhook with unique event ID
    auto_event_id = f"evt-targeted-auto-{timestamp}-{int(time.time())}"
    auto_webhook_payload = {
        "id": auto_event_id,
        "type": "meraaj.booking.created",
        "data": {
            "package_ref": pkg_id,
            "booking_ref": f"MRJ-TARGETED-AUTO-{timestamp}",
            "buyer_office_name": "مكتب الأوتو",
            "currency": "SAR",
            "registrants": [
                {"name": "مسافر أوتو", "age": 30, "room_type": "رباعي"}
            ]
        }
    }
    
    payload_str = json.dumps(auto_webhook_payload, ensure_ascii=False, separators=(',', ':'))
    signature = compute_hmac_signature(payload_str)
    
    response = requests.post(f"{BASE_URL}/meraaj/webhooks",
        headers={"X-Meraaj-Signature": signature, "Content-Type": "application/json"},
        data=payload_str)
    
    if response.status_code != 200:
        log_test("WEBHOOK", "Send auto-approve webhook", "FAIL", f"Status: {response.status_code}")
        return False
    
    result = response.json()
    if not result.get("auto_approved"):
        log_test("WEBHOOK", "Verify auto_approved flag", "FAIL", f"Expected auto_approved=true, got {result}")
        return False
    
    log_test("WEBHOOK", "Send auto-approve webhook", "PASS", "auto_approved=true")
    
    # Verify inbound status='approved' (search by package_id and booking_ref)
    auto_inbound = db.meraaj_inbound_bookings.find_one({
        "package_id": pkg_id,
        "meraaj_booking_ref": f"MRJ-TARGETED-AUTO-{timestamp}"
    })
    if not auto_inbound:
        log_test("WEBHOOK", "Verify auto-approved inbound", "FAIL", "Inbound not found")
        return False
    
    test_data["inbound_bookings"].append(auto_inbound["id"])
    
    if auto_inbound.get("status") != "approved":
        log_test("WEBHOOK", "Verify inbound status='approved'", "FAIL", 
                f"Expected 'approved', got {auto_inbound.get('status')}")
        return False
    
    log_test("WEBHOOK", "Verify inbound status='approved'", "PASS")
    
    # Get auto-approved booking
    response = owner_session.get(f"{BASE_URL}/packages/{pkg_id}/bookings")
    bookings = response.json()
    auto_bookings = [b for b in bookings if b.get("source") == "meraaj" and "مسافر أوتو" in str(b.get("registrants", []))]
    
    if len(auto_bookings) != 1:
        log_test("WEBHOOK", "Find auto-approved booking", "FAIL", f"Expected 1, got {len(auto_bookings)}")
        return False
    
    auto_booking_id = auto_bookings[0]["id"]
    test_data["bookings"].append(auto_booking_id)
    
    # Verify balanced journal entry for auto-approved booking
    auto_journal_entries = list(db.journal_entries.find({"ref_type": "package_booking", "ref_id": auto_booking_id}))
    
    if len(auto_journal_entries) == 0:
        log_test("WEBHOOK", "Verify auto-approved journal entry", "FAIL", "No journal entry found")
        return False
    
    total_debit = sum(line.get("debit", 0) for entry in auto_journal_entries for line in entry.get("lines", []))
    total_credit = sum(line.get("credit", 0) for entry in auto_journal_entries for line in entry.get("lines", []))
    
    if total_debit != total_credit:
        log_test("WEBHOOK", "Verify auto-approved journal balanced", "FAIL", 
                f"Debit {total_debit} != Credit {total_credit}")
        return False
    
    log_test("WEBHOOK", "Verify journal entry balanced (auto-approve)", "PASS", 
            f"Debit={total_debit}, Credit={total_credit}")
    
    for entry in auto_journal_entries:
        test_data["journal_entries"].append(str(entry["_id"]))
    
    # 3.5 Restore auto_approve=false
    response = owner_session.post(f"{BASE_URL}/meraaj/settings", json={"auto_approve": False})
    
    if response.status_code != 200:
        log_test("WEBHOOK", "Restore auto_approve=false", "FAIL", f"Status: {response.status_code}")
        return False
    
    log_test("WEBHOOK", "Restore auto_approve=false", "PASS")
    
    return True

# ============================================================================
# CLEANUP
# ============================================================================

def cleanup():
    """Clean up all test data"""
    print("\n" + "="*80)
    print("CLEANUP")
    print("="*80)
    
    client = get_mongo_client()
    db = client[DB_NAME]
    
    # Delete bookings via API
    for booking_id in test_data["bookings"]:
        try:
            response = owner_session.delete(f"{BASE_URL}/bookings/{booking_id}")
            if response.status_code == 200:
                print(f"✅ Deleted booking: {booking_id}")
            else:
                print(f"⚠️ Failed to delete booking {booking_id}: {response.status_code}")
        except Exception as e:
            print(f"⚠️ Exception deleting booking {booking_id}: {str(e)}")
    
    # Delete packages via API
    for pkg_id in test_data["packages"]:
        try:
            response = owner_session.delete(f"{BASE_URL}/packages/{pkg_id}")
            if response.status_code == 200:
                print(f"✅ Deleted package: {pkg_id}")
            else:
                print(f"⚠️ Failed to delete package {pkg_id}: {response.status_code}")
        except Exception as e:
            print(f"⚠️ Exception deleting package {pkg_id}: {str(e)}")
    
    # Delete inbound bookings from MongoDB
    for inbound_id in test_data["inbound_bookings"]:
        try:
            result = db.meraaj_inbound_bookings.delete_one({"_id": inbound_id})
            if result.deleted_count > 0:
                print(f"✅ Deleted inbound booking: {inbound_id}")
        except Exception as e:
            print(f"⚠️ Exception deleting inbound {inbound_id}: {str(e)}")
    
    # Delete journal entries from MongoDB
    for journal_id in test_data["journal_entries"]:
        try:
            from bson import ObjectId
            result = db.journal_entries.delete_one({"_id": ObjectId(journal_id)})
            if result.deleted_count > 0:
                print(f"✅ Deleted journal entry: {journal_id}")
        except Exception as e:
            print(f"⚠️ Exception deleting journal {journal_id}: {str(e)}")
    
    # Delete webhook logs for test packages
    for pkg_id in test_data["packages"]:
        try:
            result = db.meraaj_webhook_log.delete_many({"package_ref": pkg_id})
            if result.deleted_count > 0:
                print(f"✅ Deleted {result.deleted_count} webhook log entries for package {pkg_id}")
        except Exception as e:
            print(f"⚠️ Exception deleting webhook logs: {str(e)}")
    
    # Delete events for test packages
    for pkg_id in test_data["packages"]:
        try:
            result = db.meraaj_events.delete_many({"payload.package_ref": pkg_id})
            if result.deleted_count > 0:
                print(f"✅ Deleted {result.deleted_count} events for package {pkg_id}")
        except Exception as e:
            print(f"⚠️ Exception deleting events: {str(e)}")
    
    print("\n✅ Cleanup complete")

# ============================================================================
# MAIN
# ============================================================================

def main():
    global owner_session
    
    print("\n" + "="*80)
    print("TARGETED RE-RUN: 3 SECTIONS WITH TIMING ISSUES")
    print("="*80)
    
    # Login
    print("\nLogging in as owner...")
    owner_session = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_session:
        print("❌ FATAL: Owner login failed")
        return
    
    print("✅ Owner login successful")
    
    # Run tests
    results = {
        "EVENTS LIFECYCLE": False,
        "RESYNC EVENTS": False,
        "WEBHOOK JOURNAL": False
    }
    
    try:
        results["EVENTS LIFECYCLE"] = test_events_lifecycle()
        results["RESYNC EVENTS"] = test_resync_events()
        results["WEBHOOK JOURNAL"] = test_webhook_journal()
    except Exception as e:
        print(f"\n❌ EXCEPTION during testing: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        # Always cleanup
        cleanup()
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    
    for section, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {section}")
    
    all_passed = all(results.values())
    
    if all_passed:
        print("\n🎉 ALL 3 SECTIONS PASSED")
    else:
        print("\n⚠️ SOME SECTIONS FAILED - SEE DETAILS ABOVE")

if __name__ == "__main__":
    main()
