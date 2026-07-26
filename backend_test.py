#!/usr/bin/env python3
"""
Backend Test Suite for v2.2 - Journal Quota & Delete Operations
Tests quota enforcement, delete with balance reversal, and super admin top-up
"""

import requests
import json
from datetime import datetime

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test credentials
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "Demo@2025"
ADMIN_EMAIL = "admin@targetmedia.com"
ADMIN_PASSWORD = "Target@2025"

def login(email, password):
    """Login and return session cookie"""
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if resp.status_code != 200:
        print(f"❌ Login failed for {email}: {resp.status_code} {resp.text}")
        return None
    cookies = resp.cookies
    print(f"✅ Logged in as {email}")
    return cookies

def test_quota_in_auth_me(cookies):
    """Test 1: Quota field in auth/me"""
    print("\n=== TEST 1: Quota in auth/me ===")
    resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    if resp.status_code != 200:
        print(f"❌ GET /auth/me failed: {resp.status_code}")
        return False
    
    data = resp.json()
    if not data.get("tenant"):
        print("❌ No tenant in response")
        return False
    
    quota = data["tenant"].get("journal_quota")
    if not quota:
        print("❌ journal_quota field missing")
        return False
    
    if "used" not in quota or "limit" not in quota or "top_ups" not in quota:
        print(f"❌ journal_quota missing required fields: {quota}")
        return False
    
    if not isinstance(quota["used"], (int, float)) or not isinstance(quota["limit"], (int, float)):
        print(f"❌ journal_quota used/limit not numbers: {quota}")
        return False
    
    if not isinstance(quota["top_ups"], list):
        print(f"❌ journal_quota top_ups not array: {quota}")
        return False
    
    print(f"✅ journal_quota exists: used={quota['used']}, limit={quota['limit']}, top_ups count={len(quota['top_ups'])}")
    
    if quota["used"] <= 0:
        print("⚠️  WARNING: quota.used is 0, expected > 0 given previous tests")
    else:
        print(f"✅ quota.used > 0 ({quota['used']})")
    
    return True, quota

def test_delete_ticket_reverses_balances(cookies):
    """Test 2: Delete ticket reverses balances + JE + decrements quota"""
    print("\n=== TEST 2: Delete Ticket Reverses Balances ===")
    
    # Create fresh client and supplier
    client_resp = requests.post(f"{BASE_URL}/clients", json={"name": "DelTestClient", "phone": "1234567890"}, cookies=cookies)
    if client_resp.status_code != 200:
        print(f"❌ Failed to create client: {client_resp.status_code}")
        return False
    client = client_resp.json()
    print(f"✅ Created client: {client['name']} (id={client['id']})")
    
    supplier_resp = requests.post(f"{BASE_URL}/suppliers", json={"name": "DelTestSup", "phone": "0987654321"}, cookies=cookies)
    if supplier_resp.status_code != 200:
        print(f"❌ Failed to create supplier: {supplier_resp.status_code}")
        return False
    supplier = supplier_resp.json()
    print(f"✅ Created supplier: {supplier['name']} (id={supplier['id']})")
    
    # Note initial balances (should be 0)
    initial_client_balance = client["balances"]["SAR"]
    initial_supplier_balance = supplier["balances"]["SAR"]
    print(f"Initial balances: client SAR={initial_client_balance}, supplier SAR={initial_supplier_balance}")
    
    # Get current quota
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    quota_before = me_resp.json()["tenant"]["journal_quota"]["used"]
    print(f"Quota before ticket: {quota_before}")
    
    # Create ticket (credit payment)
    ticket_data = {
        "client_id": client["id"],
        "supplier_id": supplier["id"],
        "currency": "SAR",
        "cost": 100,
        "sale_price": 150,
        "payment_method": "credit",
        "pnr": "DELTEST001",
        "route": "RUH-JED",
        "passenger_name": "Test Passenger"
    }
    ticket_resp = requests.post(f"{BASE_URL}/tickets", json=ticket_data, cookies=cookies)
    if ticket_resp.status_code != 200:
        print(f"❌ Failed to create ticket: {ticket_resp.status_code} {ticket_resp.text}")
        return False
    ticket = ticket_resp.json()
    print(f"✅ Created ticket: PNR={ticket['pnr']} (id={ticket['id']})")
    
    # Verify client balance increased by sale_price
    client_resp = requests.get(f"{BASE_URL}/clients", cookies=cookies)
    clients = client_resp.json()
    client_after = next((c for c in clients if c["id"] == client["id"]), None)
    if not client_after:
        print("❌ Client not found after ticket creation")
        return False
    
    if client_after["balances"]["SAR"] != initial_client_balance + 150:
        print(f"❌ Client balance incorrect: expected {initial_client_balance + 150}, got {client_after['balances']['SAR']}")
        return False
    print(f"✅ Client balance increased to {client_after['balances']['SAR']} SAR")
    
    # Verify supplier balance increased by cost
    supplier_resp = requests.get(f"{BASE_URL}/suppliers", cookies=cookies)
    suppliers = supplier_resp.json()
    supplier_after = next((s for s in suppliers if s["id"] == supplier["id"]), None)
    if not supplier_after:
        print("❌ Supplier not found after ticket creation")
        return False
    
    if supplier_after["balances"]["SAR"] != initial_supplier_balance + 100:
        print(f"❌ Supplier balance incorrect: expected {initial_supplier_balance + 100}, got {supplier_after['balances']['SAR']}")
        return False
    print(f"✅ Supplier balance increased to {supplier_after['balances']['SAR']} SAR")
    
    # Verify quota increased
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    quota_after_create = me_resp.json()["tenant"]["journal_quota"]["used"]
    if quota_after_create != quota_before + 1:
        print(f"❌ Quota not incremented: expected {quota_before + 1}, got {quota_after_create}")
        return False
    print(f"✅ Quota incremented to {quota_after_create}")
    
    # Get journal entries before delete
    je_resp = requests.get(f"{BASE_URL}/journal-entries", cookies=cookies)
    jes_before = je_resp.json()
    je_for_ticket = next((je for je in jes_before if je.get("ref_id") == ticket["id"]), None)
    if not je_for_ticket:
        print("❌ Journal entry for ticket not found")
        return False
    print(f"✅ Found journal entry for ticket (id={je_for_ticket['id']})")
    
    # DELETE ticket
    delete_resp = requests.delete(f"{BASE_URL}/tickets/{ticket['id']}", cookies=cookies)
    if delete_resp.status_code != 200:
        print(f"❌ Failed to delete ticket: {delete_resp.status_code} {delete_resp.text}")
        return False
    delete_data = delete_resp.json()
    if not delete_data.get("success"):
        print(f"❌ Delete response missing success: {delete_data}")
        return False
    print(f"✅ Deleted ticket: {delete_data}")
    
    # Verify client balance reverted
    client_resp = requests.get(f"{BASE_URL}/clients", cookies=cookies)
    clients = client_resp.json()
    client_final = next((c for c in clients if c["id"] == client["id"]), None)
    if not client_final:
        print("❌ Client not found after delete")
        return False
    
    if client_final["balances"]["SAR"] != initial_client_balance:
        print(f"❌ Client balance not reverted: expected {initial_client_balance}, got {client_final['balances']['SAR']}")
        return False
    print(f"✅ Client balance reverted to {client_final['balances']['SAR']} SAR")
    
    # Verify supplier balance reverted
    supplier_resp = requests.get(f"{BASE_URL}/suppliers", cookies=cookies)
    suppliers = supplier_resp.json()
    supplier_final = next((s for s in suppliers if s["id"] == supplier["id"]), None)
    if not supplier_final:
        print("❌ Supplier not found after delete")
        return False
    
    if supplier_final["balances"]["SAR"] != initial_supplier_balance:
        print(f"❌ Supplier balance not reverted: expected {initial_supplier_balance}, got {supplier_final['balances']['SAR']}")
        return False
    print(f"✅ Supplier balance reverted to {supplier_final['balances']['SAR']} SAR")
    
    # Verify quota decremented
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    quota_after_delete = me_resp.json()["tenant"]["journal_quota"]["used"]
    if quota_after_delete != quota_before:
        print(f"❌ Quota not decremented: expected {quota_before}, got {quota_after_delete}")
        return False
    print(f"✅ Quota decremented to {quota_after_delete}")
    
    # Verify JE deleted
    je_resp = requests.get(f"{BASE_URL}/journal-entries", cookies=cookies)
    jes_after = je_resp.json()
    je_still_exists = any(je.get("ref_id") == ticket["id"] for je in jes_after)
    if je_still_exists:
        print("❌ Journal entry still exists after delete")
        return False
    print("✅ Journal entry deleted")
    
    return True

def test_delete_visa_reverses_balances(cookies):
    """Test 3: Delete visa reverses balances"""
    print("\n=== TEST 3: Delete Visa Reverses Balances ===")
    
    # Create fresh client and supplier
    client_resp = requests.post(f"{BASE_URL}/clients", json={"name": "VisaDelClient", "phone": "1111111111"}, cookies=cookies)
    client = client_resp.json()
    
    supplier_resp = requests.post(f"{BASE_URL}/suppliers", json={"name": "VisaDelSup", "phone": "2222222222"}, cookies=cookies)
    supplier = supplier_resp.json()
    
    print(f"✅ Created client and supplier")
    
    # Get current quota
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    quota_before = me_resp.json()["tenant"]["journal_quota"]["used"]
    
    # Create visa (credit payment)
    visa_data = {
        "client_id": client["id"],
        "supplier_id": supplier["id"],
        "currency": "SAR",
        "cost": 50,
        "sale_price": 80,
        "payment_method": "credit",
        "service_type": "تأشيرة عمرة",
        "passenger_name": "Visa Test Passenger",
        "passport_no": "V123456"
    }
    visa_resp = requests.post(f"{BASE_URL}/visas", json=visa_data, cookies=cookies)
    if visa_resp.status_code != 200:
        print(f"❌ Failed to create visa: {visa_resp.status_code} {visa_resp.text}")
        return False
    visa = visa_resp.json()
    print(f"✅ Created visa (id={visa['id']})")
    
    # Verify balances increased
    client_resp = requests.get(f"{BASE_URL}/clients", cookies=cookies)
    clients = client_resp.json()
    client_after = next((c for c in clients if c["id"] == client["id"]), None)
    if client_after["balances"]["SAR"] != 80:
        print(f"❌ Client balance incorrect: expected 80, got {client_after['balances']['SAR']}")
        return False
    print(f"✅ Client balance: {client_after['balances']['SAR']} SAR")
    
    # DELETE visa
    delete_resp = requests.delete(f"{BASE_URL}/visas/{visa['id']}", cookies=cookies)
    if delete_resp.status_code != 200:
        print(f"❌ Failed to delete visa: {delete_resp.status_code} {delete_resp.text}")
        return False
    print(f"✅ Deleted visa")
    
    # Verify balances reverted
    client_resp = requests.get(f"{BASE_URL}/clients", cookies=cookies)
    clients = client_resp.json()
    client_final = next((c for c in clients if c["id"] == client["id"]), None)
    if client_final["balances"]["SAR"] != 0:
        print(f"❌ Client balance not reverted: expected 0, got {client_final['balances']['SAR']}")
        return False
    print(f"✅ Client balance reverted to 0 SAR")
    
    # Verify quota decremented
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    quota_after = me_resp.json()["tenant"]["journal_quota"]["used"]
    if quota_after != quota_before:
        print(f"❌ Quota not decremented: expected {quota_before}, got {quota_after}")
        return False
    print(f"✅ Quota decremented")
    
    return True

def test_delete_voucher_reverses_balances(cookies):
    """Test 4: Delete voucher (receipt) reverses balances"""
    print("\n=== TEST 4: Delete Voucher Reverses Balances ===")
    
    # Create client
    client_resp = requests.post(f"{BASE_URL}/clients", json={"name": "VoucherDelClient", "phone": "3333333333"}, cookies=cookies)
    client = client_resp.json()
    
    # Get a box
    boxes_resp = requests.get(f"{BASE_URL}/boxes", cookies=cookies)
    boxes = boxes_resp.json()
    box = boxes[0]
    
    initial_box_balance = box["balances"]["SAR"]
    print(f"Initial box balance: {initial_box_balance} SAR")
    
    # Create a ticket first to give client a balance
    supplier_resp = requests.post(f"{BASE_URL}/suppliers", json={"name": "VoucherDelSup"}, cookies=cookies)
    supplier = supplier_resp.json()
    
    ticket_resp = requests.post(f"{BASE_URL}/tickets", json={
        "client_id": client["id"],
        "supplier_id": supplier["id"],
        "currency": "SAR",
        "cost": 100,
        "sale_price": 200,
        "payment_method": "credit",
        "pnr": "VDEL001"
    }, cookies=cookies)
    ticket = ticket_resp.json()
    print(f"✅ Created ticket to give client balance of 200 SAR")
    
    # Get current quota
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    quota_before = me_resp.json()["tenant"]["journal_quota"]["used"]
    
    # Create receipt voucher (client pays 100 SAR)
    voucher_data = {
        "type": "receipt",
        "currency": "SAR",
        "amount": 100,
        "party_type": "client",
        "party_id": client["id"],
        "box_id": box["id"],
        "description": "Test receipt"
    }
    voucher_resp = requests.post(f"{BASE_URL}/vouchers", json=voucher_data, cookies=cookies)
    if voucher_resp.status_code != 200:
        print(f"❌ Failed to create voucher: {voucher_resp.status_code} {voucher_resp.text}")
        return False
    voucher = voucher_resp.json()
    print(f"✅ Created receipt voucher (id={voucher['id']})")
    
    # Verify box balance increased
    boxes_resp = requests.get(f"{BASE_URL}/boxes", cookies=cookies)
    boxes = boxes_resp.json()
    box_after = next((b for b in boxes if b["id"] == box["id"]), None)
    expected_box_balance = initial_box_balance + 100
    if abs(box_after["balances"]["SAR"] - expected_box_balance) > 0.01:
        print(f"❌ Box balance incorrect: expected {expected_box_balance}, got {box_after['balances']['SAR']}")
        return False
    print(f"✅ Box balance increased to {box_after['balances']['SAR']} SAR")
    
    # Verify client balance decreased
    client_resp = requests.get(f"{BASE_URL}/clients", cookies=cookies)
    clients = client_resp.json()
    client_after = next((c for c in clients if c["id"] == client["id"]), None)
    if client_after["balances"]["SAR"] != 100:  # 200 - 100
        print(f"❌ Client balance incorrect: expected 100, got {client_after['balances']['SAR']}")
        return False
    print(f"✅ Client balance decreased to {client_after['balances']['SAR']} SAR")
    
    # DELETE voucher
    delete_resp = requests.delete(f"{BASE_URL}/vouchers/{voucher['id']}", cookies=cookies)
    if delete_resp.status_code != 200:
        print(f"❌ Failed to delete voucher: {delete_resp.status_code} {delete_resp.text}")
        return False
    print(f"✅ Deleted voucher")
    
    # Verify box balance reverted
    boxes_resp = requests.get(f"{BASE_URL}/boxes", cookies=cookies)
    boxes = boxes_resp.json()
    box_final = next((b for b in boxes if b["id"] == box["id"]), None)
    if abs(box_final["balances"]["SAR"] - initial_box_balance) > 0.01:
        print(f"❌ Box balance not reverted: expected {initial_box_balance}, got {box_final['balances']['SAR']}")
        return False
    print(f"✅ Box balance reverted to {box_final['balances']['SAR']} SAR")
    
    # Verify client balance reverted
    client_resp = requests.get(f"{BASE_URL}/clients", cookies=cookies)
    clients = client_resp.json()
    client_final = next((c for c in clients if c["id"] == client["id"]), None)
    if client_final["balances"]["SAR"] != 200:  # Back to original
        print(f"❌ Client balance not reverted: expected 200, got {client_final['balances']['SAR']}")
        return False
    print(f"✅ Client balance reverted to {client_final['balances']['SAR']} SAR")
    
    # Verify quota decremented
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    quota_after = me_resp.json()["tenant"]["journal_quota"]["used"]
    if quota_after != quota_before:
        print(f"❌ Quota not decremented: expected {quota_before}, got {quota_after}")
        return False
    print(f"✅ Quota decremented")
    
    return True

def test_delete_fx_reverses_balances(cookies):
    """Test 5: Delete FX transaction reverses both box balances"""
    print("\n=== TEST 5: Delete FX Transaction Reverses Balances ===")
    
    # Get boxes
    boxes_resp = requests.get(f"{BASE_URL}/boxes", cookies=cookies)
    boxes = boxes_resp.json()
    box1 = boxes[0]
    box2 = boxes[1] if len(boxes) > 1 else boxes[0]
    
    initial_box1_usd = box1["balances"]["USD"]
    initial_box2_sar = box2["balances"]["SAR"]
    print(f"Initial balances: box1 USD={initial_box1_usd}, box2 SAR={initial_box2_sar}")
    
    # Get current quota
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    quota_before = me_resp.json()["tenant"]["journal_quota"]["used"]
    
    # Create FX BUY transaction (buy 50 USD with SAR)
    fx_data = {
        "type": "buy",
        "currency": "USD",
        "amount": 50,
        "exchange_rate": 3.75,
        "counter_currency": "SAR",
        "box_currency_id": box1["id"],
        "box_counter_id": box2["id"],
        "customer_name": "FX Test Customer"
    }
    fx_resp = requests.post(f"{BASE_URL}/fx", json=fx_data, cookies=cookies)
    if fx_resp.status_code != 200:
        print(f"❌ Failed to create FX: {fx_resp.status_code} {fx_resp.text}")
        return False
    fx = fx_resp.json()
    print(f"✅ Created FX transaction (id={fx['id']})")
    
    # Verify balances changed
    boxes_resp = requests.get(f"{BASE_URL}/boxes", cookies=cookies)
    boxes = boxes_resp.json()
    box1_after = next((b for b in boxes if b["id"] == box1["id"]), None)
    box2_after = next((b for b in boxes if b["id"] == box2["id"]), None)
    
    expected_box1_usd = initial_box1_usd + 50
    expected_box2_sar = initial_box2_sar - 187.5  # 50 * 3.75
    
    if abs(box1_after["balances"]["USD"] - expected_box1_usd) > 0.01:
        print(f"❌ Box1 USD balance incorrect: expected {expected_box1_usd}, got {box1_after['balances']['USD']}")
        return False
    print(f"✅ Box1 USD balance: {box1_after['balances']['USD']}")
    
    if abs(box2_after["balances"]["SAR"] - expected_box2_sar) > 0.01:
        print(f"❌ Box2 SAR balance incorrect: expected {expected_box2_sar}, got {box2_after['balances']['SAR']}")
        return False
    print(f"✅ Box2 SAR balance: {box2_after['balances']['SAR']}")
    
    # DELETE FX
    delete_resp = requests.delete(f"{BASE_URL}/fx/{fx['id']}", cookies=cookies)
    if delete_resp.status_code != 200:
        print(f"❌ Failed to delete FX: {delete_resp.status_code} {delete_resp.text}")
        return False
    print(f"✅ Deleted FX transaction")
    
    # Verify balances reverted
    boxes_resp = requests.get(f"{BASE_URL}/boxes", cookies=cookies)
    boxes = boxes_resp.json()
    box1_final = next((b for b in boxes if b["id"] == box1["id"]), None)
    box2_final = next((b for b in boxes if b["id"] == box2["id"]), None)
    
    if abs(box1_final["balances"]["USD"] - initial_box1_usd) > 0.01:
        print(f"❌ Box1 USD balance not reverted: expected {initial_box1_usd}, got {box1_final['balances']['USD']}")
        return False
    print(f"✅ Box1 USD balance reverted to {box1_final['balances']['USD']}")
    
    if abs(box2_final["balances"]["SAR"] - initial_box2_sar) > 0.01:
        print(f"❌ Box2 SAR balance not reverted: expected {initial_box2_sar}, got {box2_final['balances']['SAR']}")
        return False
    print(f"✅ Box2 SAR balance reverted to {box2_final['balances']['SAR']}")
    
    # Verify quota decremented
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
    quota_after = me_resp.json()["tenant"]["journal_quota"]["used"]
    if quota_after != quota_before:
        print(f"❌ Quota not decremented: expected {quota_before}, got {quota_after}")
        return False
    print(f"✅ Quota decremented")
    
    return True

def test_delete_nonexistent_returns_404(cookies):
    """Test 6: Delete non-existent id returns 404"""
    print("\n=== TEST 6: Delete Non-Existent ID Returns 404 ===")
    
    delete_resp = requests.delete(f"{BASE_URL}/tickets/nonexistent-id-12345", cookies=cookies)
    if delete_resp.status_code != 404:
        print(f"❌ Expected 404, got {delete_resp.status_code}")
        return False
    
    print(f"✅ DELETE non-existent ticket returns 404")
    
    delete_resp = requests.delete(f"{BASE_URL}/visas/nonexistent-id-67890", cookies=cookies)
    if delete_resp.status_code != 404:
        print(f"❌ Expected 404, got {delete_resp.status_code}")
        return False
    
    print(f"✅ DELETE non-existent visa returns 404")
    
    return True

def test_super_admin_top_up(admin_cookies, owner_cookies):
    """Test 7: Super admin top-up increases limit and adds to top_ups array"""
    print("\n=== TEST 7: Super Admin Top-Up ===")
    
    # Get demo tenant id
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=owner_cookies)
    demo_tenant_id = me_resp.json()["tenant"]["id"]
    print(f"Demo tenant id: {demo_tenant_id}")
    
    # Get current quota limit as admin
    tenants_resp = requests.get(f"{BASE_URL}/admin/tenants", cookies=admin_cookies)
    if tenants_resp.status_code != 200:
        print(f"❌ Failed to get tenants: {tenants_resp.status_code}")
        return False
    
    tenants_data = tenants_resp.json()
    tenants = tenants_data.get("tenants", [])
    demo_tenant = next((t for t in tenants if t["id"] == demo_tenant_id), None)
    if not demo_tenant:
        print("❌ Demo tenant not found in admin list")
        return False
    
    limit_before = demo_tenant["journal_quota"]["limit"]
    top_ups_count_before = len(demo_tenant["journal_quota"]["top_ups"])
    print(f"Quota before top-up: limit={limit_before}, top_ups count={top_ups_count_before}")
    
    # Top-up by 100
    patch_resp = requests.patch(f"{BASE_URL}/admin/tenants/{demo_tenant_id}", 
                                json={"top_up_amount": 100}, 
                                cookies=admin_cookies)
    if patch_resp.status_code != 200:
        print(f"❌ Failed to top-up: {patch_resp.status_code} {patch_resp.text}")
        return False
    print(f"✅ Top-up request successful")
    
    # Verify limit increased
    tenants_resp = requests.get(f"{BASE_URL}/admin/tenants", cookies=admin_cookies)
    tenants_data = tenants_resp.json()
    tenants = tenants_data.get("tenants", [])
    demo_tenant_after = next((t for t in tenants if t["id"] == demo_tenant_id), None)
    
    limit_after = demo_tenant_after["journal_quota"]["limit"]
    top_ups_after = demo_tenant_after["journal_quota"]["top_ups"]
    
    if limit_after != limit_before + 100:
        print(f"❌ Limit not increased: expected {limit_before + 100}, got {limit_after}")
        return False
    print(f"✅ Limit increased to {limit_after}")
    
    if len(top_ups_after) != top_ups_count_before + 1:
        print(f"❌ top_ups count not increased: expected {top_ups_count_before + 1}, got {len(top_ups_after)}")
        return False
    
    latest_top_up = top_ups_after[-1]
    if latest_top_up["amount"] != 100:
        print(f"❌ Latest top-up amount incorrect: expected 100, got {latest_top_up['amount']}")
        return False
    
    if "date" not in latest_top_up or "by" not in latest_top_up:
        print(f"❌ Latest top-up missing fields: {latest_top_up}")
        return False
    
    print(f"✅ top_ups array updated: {latest_top_up}")
    
    return True

def test_quota_block_at_limit(admin_cookies, owner_cookies):
    """Test 8: Quota block at limit returns 402, top-up allows creation again"""
    print("\n=== TEST 8: Quota Block at Limit ===")
    
    # Get demo tenant id and current quota
    me_resp = requests.get(f"{BASE_URL}/auth/me", cookies=owner_cookies)
    demo_tenant_id = me_resp.json()["tenant"]["id"]
    current_used = me_resp.json()["tenant"]["journal_quota"]["used"]
    print(f"Current quota used: {current_used}")
    
    # Set limit to current used (as super admin)
    patch_resp = requests.patch(f"{BASE_URL}/admin/tenants/{demo_tenant_id}", 
                                json={"quota_limit": current_used}, 
                                cookies=admin_cookies)
    if patch_resp.status_code != 200:
        print(f"❌ Failed to set quota limit: {patch_resp.status_code} {patch_resp.text}")
        return False
    print(f"✅ Set quota limit to {current_used} (at capacity)")
    
    # Try to create a ticket (should fail with 402)
    client_resp = requests.post(f"{BASE_URL}/clients", json={"name": "QuotaTestClient"}, cookies=owner_cookies)
    client = client_resp.json()
    
    supplier_resp = requests.post(f"{BASE_URL}/suppliers", json={"name": "QuotaTestSup"}, cookies=owner_cookies)
    supplier = supplier_resp.json()
    
    ticket_data = {
        "client_id": client["id"],
        "supplier_id": supplier["id"],
        "currency": "SAR",
        "cost": 100,
        "sale_price": 150,
        "payment_method": "credit",
        "pnr": "QUOTA001"
    }
    ticket_resp = requests.post(f"{BASE_URL}/tickets", json=ticket_data, cookies=owner_cookies)
    if ticket_resp.status_code != 402:
        print(f"❌ Expected 402, got {ticket_resp.status_code}")
        return False
    
    error_msg = ticket_resp.json().get("error", "")
    if "انتهت حصة قيود اليومية" not in error_msg:
        print(f"❌ Error message incorrect: {error_msg}")
        return False
    print(f"✅ Ticket creation blocked with 402: {error_msg}")
    
    # Try manual journal entry (should also fail)
    je_data = {
        "currency": "SAR",
        "description": "Test manual JE",
        "lines": [
            {"account_code": "1301", "account_name": "Test", "debit": 100, "credit": 0},
            {"account_code": "4101", "account_name": "Test", "debit": 0, "credit": 100}
        ]
    }
    je_resp = requests.post(f"{BASE_URL}/journal-entries", json=je_data, cookies=owner_cookies)
    if je_resp.status_code != 402:
        print(f"❌ Manual JE: Expected 402, got {je_resp.status_code}")
        return False
    print(f"✅ Manual journal entry blocked with 402")
    
    # Try voucher (should also fail)
    boxes_resp = requests.get(f"{BASE_URL}/boxes", cookies=owner_cookies)
    box = boxes_resp.json()[0]
    
    voucher_data = {
        "type": "receipt",
        "currency": "SAR",
        "amount": 50,
        "party_type": "client",
        "party_id": client["id"],
        "box_id": box["id"]
    }
    voucher_resp = requests.post(f"{BASE_URL}/vouchers", json=voucher_data, cookies=owner_cookies)
    if voucher_resp.status_code != 402:
        print(f"❌ Voucher: Expected 402, got {voucher_resp.status_code}")
        return False
    print(f"✅ Voucher creation blocked with 402")
    
    # Top-up by 10 (as super admin)
    patch_resp = requests.patch(f"{BASE_URL}/admin/tenants/{demo_tenant_id}", 
                                json={"top_up_amount": 10}, 
                                cookies=admin_cookies)
    if patch_resp.status_code != 200:
        print(f"❌ Failed to top-up: {patch_resp.status_code}")
        return False
    print(f"✅ Topped up by 10")
    
    # Try to create ticket again (should succeed now)
    ticket_data["pnr"] = "QUOTA002"
    ticket_resp = requests.post(f"{BASE_URL}/tickets", json=ticket_data, cookies=owner_cookies)
    if ticket_resp.status_code != 200:
        print(f"❌ Ticket creation still failing after top-up: {ticket_resp.status_code} {ticket_resp.text}")
        return False
    print(f"✅ Ticket creation succeeded after top-up")
    
    return True

def test_admin_tenants_includes_quota(admin_cookies):
    """Test 9: Admin tenants list includes journal_quota field"""
    print("\n=== TEST 9: Admin Tenants List Includes journal_quota ===")
    
    resp = requests.get(f"{BASE_URL}/admin/tenants", cookies=admin_cookies)
    if resp.status_code != 200:
        print(f"❌ Failed to get tenants: {resp.status_code}")
        return False
    
    data = resp.json()
    tenants = data.get("tenants", [])
    if not tenants:
        print("❌ No tenants in response")
        return False
    
    print(f"Found {len(tenants)} tenants")
    
    all_have_quota = True
    for tenant in tenants:
        if "journal_quota" not in tenant:
            print(f"❌ Tenant {tenant.get('name', 'unknown')} missing journal_quota")
            all_have_quota = False
        else:
            quota = tenant["journal_quota"]
            if "used" not in quota or "limit" not in quota or "top_ups" not in quota:
                print(f"❌ Tenant {tenant.get('name', 'unknown')} journal_quota missing fields: {quota}")
                all_have_quota = False
            else:
                print(f"✅ Tenant '{tenant['name']}': quota used={quota['used']}, limit={quota['limit']}, top_ups={len(quota['top_ups'])}")
    
    if not all_have_quota:
        return False
    
    print(f"✅ All tenants have journal_quota field")
    return True

def main():
    print("=" * 80)
    print("V2.2 BACKEND TEST SUITE - Journal Quota & Delete Operations")
    print("=" * 80)
    
    # Login as owner
    owner_cookies = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_cookies:
        print("❌ Failed to login as owner")
        return
    
    # Login as super admin
    admin_cookies = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not admin_cookies:
        print("❌ Failed to login as super admin")
        return
    
    results = {}
    
    # Test 1: Quota in auth/me
    try:
        result = test_quota_in_auth_me(owner_cookies)
        results["Test 1: Quota in auth/me"] = result[0] if isinstance(result, tuple) else result
    except Exception as e:
        print(f"❌ Test 1 exception: {e}")
        results["Test 1: Quota in auth/me"] = False
    
    # Test 2: Delete ticket
    try:
        results["Test 2: Delete ticket reverses balances"] = test_delete_ticket_reverses_balances(owner_cookies)
    except Exception as e:
        print(f"❌ Test 2 exception: {e}")
        results["Test 2: Delete ticket reverses balances"] = False
    
    # Test 3: Delete visa
    try:
        results["Test 3: Delete visa reverses balances"] = test_delete_visa_reverses_balances(owner_cookies)
    except Exception as e:
        print(f"❌ Test 3 exception: {e}")
        results["Test 3: Delete visa reverses balances"] = False
    
    # Test 4: Delete voucher
    try:
        results["Test 4: Delete voucher reverses balances"] = test_delete_voucher_reverses_balances(owner_cookies)
    except Exception as e:
        print(f"❌ Test 4 exception: {e}")
        results["Test 4: Delete voucher reverses balances"] = False
    
    # Test 5: Delete FX
    try:
        results["Test 5: Delete FX reverses balances"] = test_delete_fx_reverses_balances(owner_cookies)
    except Exception as e:
        print(f"❌ Test 5 exception: {e}")
        results["Test 5: Delete FX reverses balances"] = False
    
    # Test 6: Delete non-existent
    try:
        results["Test 6: Delete non-existent returns 404"] = test_delete_nonexistent_returns_404(owner_cookies)
    except Exception as e:
        print(f"❌ Test 6 exception: {e}")
        results["Test 6: Delete non-existent returns 404"] = False
    
    # Test 7: Super admin top-up
    try:
        results["Test 7: Super admin top-up"] = test_super_admin_top_up(admin_cookies, owner_cookies)
    except Exception as e:
        print(f"❌ Test 7 exception: {e}")
        results["Test 7: Super admin top-up"] = False
    
    # Test 8: Quota block at limit
    try:
        results["Test 8: Quota block at limit"] = test_quota_block_at_limit(admin_cookies, owner_cookies)
    except Exception as e:
        print(f"❌ Test 8 exception: {e}")
        results["Test 8: Quota block at limit"] = False
    
    # Test 9: Admin tenants includes quota
    try:
        results["Test 9: Admin tenants includes quota"] = test_admin_tenants_includes_quota(admin_cookies)
    except Exception as e:
        print(f"❌ Test 9 exception: {e}")
        results["Test 9: Admin tenants includes quota"] = False
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("=" * 80)
    
    if passed == total:
        print("🎉 ALL TESTS PASSED!")
    else:
        print(f"⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
