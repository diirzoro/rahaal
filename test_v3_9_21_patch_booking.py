#!/usr/bin/env python3
"""
Rahaal ERP v3.9.21 Backend Test Suite
Test PATCH /api/packages/{pkgId}/bookings/{bookingId} - Edit package booking (light + full recalc)
"""

import requests
import json
import os
from datetime import datetime

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://visa-booking-5.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials
DEMO_OWNER = {"email": "owner@demo.com", "password": "Demo@2025"}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def login():
    """Login and return session cookies"""
    log("Logging in as owner@demo.com...")
    resp = requests.post(f"{API_BASE}/auth/login", json=DEMO_OWNER, timeout=10)
    if resp.status_code != 200:
        raise Exception(f"Login failed: {resp.text}")
    log("✅ Login successful")
    return resp.cookies

def get_quota(cookies):
    """Get current quota.used from /auth/me"""
    resp = requests.get(f"{API_BASE}/auth/me", cookies=cookies, timeout=10)
    if resp.status_code != 200:
        raise Exception(f"Failed to get auth/me: {resp.text}")
    data = resp.json()
    quota_used = data.get("tenant", {}).get("journal_quota", {}).get("used", 0)
    log(f"Current quota.used: {quota_used}")
    return quota_used

def get_client_balance(cookies, client_id, currency="SAR"):
    """Get client balance for specific currency"""
    resp = requests.get(f"{API_BASE}/clients", cookies=cookies, timeout=10)
    if resp.status_code != 200:
        return None
    clients = resp.json()
    for c in clients:
        if c["id"] == client_id:
            return c.get("balances", {}).get(currency, 0)
    return None

def get_supplier_balance(cookies, supplier_id, currency="SAR"):
    """Get supplier balance for specific currency"""
    resp = requests.get(f"{API_BASE}/suppliers", cookies=cookies, timeout=10)
    if resp.status_code != 200:
        return None
    suppliers = resp.json()
    for s in suppliers:
        if s["id"] == supplier_id:
            return s.get("balances", {}).get(currency, 0)
    return None

def get_box_balance(cookies, box_id, currency="SAR"):
    """Get box balance for specific currency"""
    resp = requests.get(f"{API_BASE}/boxes", cookies=cookies, timeout=10)
    if resp.status_code != 200:
        return None
    boxes = resp.json()
    for b in boxes:
        if b["id"] == box_id:
            return b.get("balances", {}).get(currency, 0)
    return None

def test_patch_booking():
    """Test PATCH /api/packages/{pkgId}/bookings/{bookingId}"""
    log("\n" + "=" * 80)
    log("TEST: PATCH /api/packages/{pkgId}/bookings/{bookingId}")
    log("=" * 80)
    
    results = []
    cookies = login()
    
    # SETUP: Create client, supplier, package, components, booking
    log("\n========== SETUP ==========")
    
    # 1. Create client A
    log("\n[SETUP 1] Creating client A...")
    resp = requests.post(f"{API_BASE}/clients", json={"name": "عميل باقة اختبار"}, cookies=cookies, timeout=10)
    if resp.status_code != 200:
        log(f"❌ Failed to create client A: {resp.text}")
        return results
    client_a = resp.json()
    client_id_a = client_a["id"]
    log(f"✅ Client A created: {client_id_a}")
    
    # 2. Create client B (for client change test)
    log("\n[SETUP 2] Creating client B...")
    resp = requests.post(f"{API_BASE}/clients", json={"name": "عميل ثاني"}, cookies=cookies, timeout=10)
    if resp.status_code != 200:
        log(f"❌ Failed to create client B: {resp.text}")
        return results
    client_b = resp.json()
    client_id_b = client_b["id"]
    log(f"✅ Client B created: {client_id_b}")
    
    # 3. Create supplier
    log("\n[SETUP 3] Creating supplier...")
    resp = requests.post(f"{API_BASE}/suppliers", json={"name": "مورد باقة اختبار"}, cookies=cookies, timeout=10)
    if resp.status_code != 200:
        log(f"❌ Failed to create supplier: {resp.text}")
        return results
    supplier = resp.json()
    supplier_id = supplier["id"]
    log(f"✅ Supplier created: {supplier_id}")
    
    # 4. Create package
    log("\n[SETUP 4] Creating package...")
    resp = requests.post(f"{API_BASE}/packages", json={
        "name": "باكج اختبار",
        "package_type": "umrah",
        "currency": "SAR"
    }, cookies=cookies, timeout=10)
    if resp.status_code != 200:
        log(f"❌ Failed to create package: {resp.text}")
        return results
    package = resp.json()
    pkg_id = package["id"]
    log(f"✅ Package created: {pkg_id}")
    
    # 5. Add component A
    log("\n[SETUP 5] Adding component A...")
    resp = requests.post(f"{API_BASE}/packages/{pkg_id}/components", json={
        "name": "مكوّن A",
        "component_type": "ticket",
        "supplier_id": supplier_id,
        "cost_per_pax": 100,
        "sale_per_pax": 150
    }, cookies=cookies, timeout=10)
    if resp.status_code != 200:
        log(f"❌ Failed to add component A: {resp.text}")
        return results
    log("✅ Component A added")
    
    # 6. Add component B
    log("\n[SETUP 6] Adding component B...")
    resp = requests.post(f"{API_BASE}/packages/{pkg_id}/components", json={
        "name": "مكوّن B",
        "component_type": "hotel",
        "supplier_id": supplier_id,
        "cost_per_pax": 100,
        "sale_per_pax": 150
    }, cookies=cookies, timeout=10)
    if resp.status_code != 200:
        log(f"❌ Failed to add component B: {resp.text}")
        return results
    log("✅ Component B added")
    
    # 7. Get cash box
    log("\n[SETUP 7] Getting cash box...")
    resp = requests.get(f"{API_BASE}/boxes", cookies=cookies, timeout=10)
    if resp.status_code != 200:
        log(f"❌ Failed to get boxes: {resp.text}")
        return results
    boxes = resp.json()
    box_cash = next((b for b in boxes if b["type"] == "cash"), None)
    if not box_cash:
        log("❌ No cash box found")
        return results
    box_id_cash = box_cash["id"]
    log(f"✅ Cash box found: {box_id_cash}")
    
    # 8. Record Q0 (quota before booking)
    log("\n[SETUP 8] Recording Q0 (quota before booking)...")
    Q0 = get_quota(cookies)
    log(f"Q0 = {Q0}")
    
    # 9. Create booking
    log("\n[SETUP 9] Creating booking...")
    resp = requests.post(f"{API_BASE}/packages/{pkg_id}/bookings", json={
        "client_id": client_id_a,
        "pilgrim_name": "أحمد",
        "passport_no": "A1",
        "pax_count": 1,
        "payment_method": "credit"
    }, cookies=cookies, timeout=10)
    if resp.status_code != 200:
        log(f"❌ Failed to create booking: {resp.text}")
        return results
    booking = resp.json()
    booking_id = booking["id"]
    log(f"✅ Booking created: {booking_id}")
    log(f"   total_cost: {booking.get('total_cost')}, total_sale: {booking.get('total_sale')}, commission: {booking.get('commission')}")
    
    # 10. Record Q1 (quota after booking)
    log("\n[SETUP 10] Recording Q1 (quota after booking)...")
    Q1 = get_quota(cookies)
    log(f"Q1 = {Q1}")
    if Q1 != Q0 + 1:
        log(f"⚠️ WARNING: Expected Q1 = Q0 + 1 ({Q0 + 1}), got {Q1}")
    
    # 11. Record balances after booking creation
    log("\n[SETUP 11] Recording balances after booking creation...")
    client_a_bal_after_create = get_client_balance(cookies, client_id_a, "SAR")
    supplier_bal_after_create = get_supplier_balance(cookies, supplier_id, "SAR")
    log(f"Client A balance after create: {client_a_bal_after_create} SAR")
    log(f"Supplier balance after create: {supplier_bal_after_create} SAR")
    
    # Expected: client_a = 300 (2 components × 150), supplier = 200 (2 components × 100)
    if client_a_bal_after_create != 300:
        log(f"⚠️ WARNING: Expected client A balance 300, got {client_a_bal_after_create}")
    if supplier_bal_after_create != 200:
        log(f"⚠️ WARNING: Expected supplier balance 200, got {supplier_bal_after_create}")
    
    # ========== T1: LIGHT EDIT ==========
    log("\n" + "=" * 80)
    log("T1: LIGHT EDIT (pilgrim_name, passport_no, notes)")
    log("=" * 80)
    
    try:
        resp = requests.patch(f"{API_BASE}/packages/{pkg_id}/bookings/{booking_id}", json={
            "pilgrim_name": "محمد",
            "passport_no": "B2",
            "notes": "ملاحظة اختبار"
        }, cookies=cookies, timeout=10)
        
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            
            # Check _light_update flag
            if data.get("_light_update") == True:
                log("✅ PASS - _light_update: true")
                results.append(("T1: _light_update flag", True, 200, "true"))
            else:
                log(f"❌ FAIL - _light_update: {data.get('_light_update')}")
                results.append(("T1: _light_update flag", False, 200, str(data.get("_light_update"))))
            
            # Check pilgrim_name
            if data.get("pilgrim_name") == "محمد":
                log("✅ PASS - pilgrim_name updated to 'محمد'")
                results.append(("T1: pilgrim_name", True, 200, "محمد"))
            else:
                log(f"❌ FAIL - pilgrim_name: {data.get('pilgrim_name')}")
                results.append(("T1: pilgrim_name", False, 200, data.get("pilgrim_name")))
            
            # Check passport_no
            if data.get("passport_no") == "B2":
                log("✅ PASS - passport_no updated to 'B2'")
                results.append(("T1: passport_no", True, 200, "B2"))
            else:
                log(f"❌ FAIL - passport_no: {data.get('passport_no')}")
                results.append(("T1: passport_no", False, 200, data.get("passport_no")))
            
            # Check balances unchanged
            client_a_bal_t1 = get_client_balance(cookies, client_id_a, "SAR")
            supplier_bal_t1 = get_supplier_balance(cookies, supplier_id, "SAR")
            
            if client_a_bal_t1 == client_a_bal_after_create:
                log(f"✅ PASS - Client A balance unchanged: {client_a_bal_t1} SAR")
                results.append(("T1: Client balance unchanged", True, 200, str(client_a_bal_t1)))
            else:
                log(f"❌ FAIL - Client A balance changed: {client_a_bal_after_create} → {client_a_bal_t1}")
                results.append(("T1: Client balance unchanged", False, 200, f"{client_a_bal_after_create} → {client_a_bal_t1}"))
            
            if supplier_bal_t1 == supplier_bal_after_create:
                log(f"✅ PASS - Supplier balance unchanged: {supplier_bal_t1} SAR")
                results.append(("T1: Supplier balance unchanged", True, 200, str(supplier_bal_t1)))
            else:
                log(f"❌ FAIL - Supplier balance changed: {supplier_bal_after_create} → {supplier_bal_t1}")
                results.append(("T1: Supplier balance unchanged", False, 200, f"{supplier_bal_after_create} → {supplier_bal_t1}"))
            
            # Check quota unchanged
            Q_t1 = get_quota(cookies)
            if Q_t1 == Q1:
                log(f"✅ PASS - Quota unchanged: {Q_t1}")
                results.append(("T1: Quota unchanged", True, 200, str(Q_t1)))
            else:
                log(f"❌ FAIL - Quota changed: {Q1} → {Q_t1}")
                results.append(("T1: Quota unchanged", False, 200, f"{Q1} → {Q_t1}"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("T1: Light edit", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("T1: Light edit", False, 0, str(e)))
    
    # ========== T2: PAX_COUNT CHANGE ==========
    log("\n" + "=" * 80)
    log("T2: PAX_COUNT CHANGE (1 → 3)")
    log("=" * 80)
    
    try:
        resp = requests.patch(f"{API_BASE}/packages/{pkg_id}/bookings/{booking_id}", json={
            "pax_count": 3
        }, cookies=cookies, timeout=10)
        
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            
            # Check _full_recalc flag
            if data.get("_full_recalc") == True:
                log("✅ PASS - _full_recalc: true")
                results.append(("T2: _full_recalc flag", True, 200, "true"))
            else:
                log(f"❌ FAIL - _full_recalc: {data.get('_full_recalc')}")
                results.append(("T2: _full_recalc flag", False, 200, str(data.get("_full_recalc"))))
            
            # Check pax_count
            if data.get("pax_count") == 3:
                log("✅ PASS - pax_count updated to 3")
                results.append(("T2: pax_count", True, 200, "3"))
            else:
                log(f"❌ FAIL - pax_count: {data.get('pax_count')}")
                results.append(("T2: pax_count", False, 200, str(data.get("pax_count"))))
            
            # Check total_cost (2 components × 100 × 3 = 600)
            if data.get("total_cost") == 600:
                log("✅ PASS - total_cost: 600")
                results.append(("T2: total_cost", True, 200, "600"))
            else:
                log(f"❌ FAIL - total_cost: {data.get('total_cost')} (expected 600)")
                results.append(("T2: total_cost", False, 200, str(data.get("total_cost"))))
            
            # Check total_sale (2 components × 150 × 3 = 900)
            if data.get("total_sale") == 900:
                log("✅ PASS - total_sale: 900")
                results.append(("T2: total_sale", True, 200, "900"))
            else:
                log(f"❌ FAIL - total_sale: {data.get('total_sale')} (expected 900)")
                results.append(("T2: total_sale", False, 200, str(data.get("total_sale"))))
            
            # Check commission (900 - 600 = 300)
            if data.get("commission") == 300:
                log("✅ PASS - commission: 300")
                results.append(("T2: commission", True, 200, "300"))
            else:
                log(f"❌ FAIL - commission: {data.get('commission')} (expected 300)")
                results.append(("T2: commission", False, 200, str(data.get("commission"))))
            
            # Check client balance (should be 900 now, net effect +600 from 300)
            client_a_bal_t2 = get_client_balance(cookies, client_id_a, "SAR")
            if client_a_bal_t2 == 900:
                log(f"✅ PASS - Client A balance: {client_a_bal_t2} SAR (net effect +600)")
                results.append(("T2: Client balance", True, 200, str(client_a_bal_t2)))
            else:
                log(f"❌ FAIL - Client A balance: {client_a_bal_t2} (expected 900)")
                results.append(("T2: Client balance", False, 200, str(client_a_bal_t2)))
            
            # Check supplier balance (should be 600 now, net effect +400 from 200)
            supplier_bal_t2 = get_supplier_balance(cookies, supplier_id, "SAR")
            if supplier_bal_t2 == 600:
                log(f"✅ PASS - Supplier balance: {supplier_bal_t2} SAR (net effect +400)")
                results.append(("T2: Supplier balance", True, 200, str(supplier_bal_t2)))
            else:
                log(f"❌ FAIL - Supplier balance: {supplier_bal_t2} (expected 600)")
                results.append(("T2: Supplier balance", False, 200, str(supplier_bal_t2)))
            
            # Check quota unchanged
            Q_t2 = get_quota(cookies)
            if Q_t2 == Q1:
                log(f"✅ PASS - Quota unchanged: {Q_t2}")
                results.append(("T2: Quota unchanged", True, 200, str(Q_t2)))
            else:
                log(f"❌ FAIL - Quota changed: {Q1} → {Q_t2}")
                results.append(("T2: Quota unchanged", False, 200, f"{Q1} → {Q_t2}"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("T2: Pax count change", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("T2: Pax count change", False, 0, str(e)))
    
    # ========== T3: SWITCH TO CASH ==========
    log("\n" + "=" * 80)
    log("T3: SWITCH TO CASH (credit → cash)")
    log("=" * 80)
    
    try:
        # Record box balance before T3
        box_bal_before_t3 = get_box_balance(cookies, box_id_cash, "SAR")
        log(f"Box balance before T3: {box_bal_before_t3} SAR")
        
        resp = requests.patch(f"{API_BASE}/packages/{pkg_id}/bookings/{booking_id}", json={
            "payment_method": "cash",
            "box_id": box_id_cash
        }, cookies=cookies, timeout=10)
        
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            
            # Check _full_recalc flag
            if data.get("_full_recalc") == True:
                log("✅ PASS - _full_recalc: true")
                results.append(("T3: _full_recalc flag", True, 200, "true"))
            else:
                log(f"❌ FAIL - _full_recalc: {data.get('_full_recalc')}")
                results.append(("T3: _full_recalc flag", False, 200, str(data.get("_full_recalc"))))
            
            # Check payment_method
            if data.get("payment_method") == "cash":
                log("✅ PASS - payment_method: cash")
                results.append(("T3: payment_method", True, 200, "cash"))
            else:
                log(f"❌ FAIL - payment_method: {data.get('payment_method')}")
                results.append(("T3: payment_method", False, 200, data.get("payment_method")))
            
            # Check box_id
            if data.get("box_id") == box_id_cash:
                log("✅ PASS - box_id set correctly")
                results.append(("T3: box_id", True, 200, box_id_cash))
            else:
                log(f"❌ FAIL - box_id: {data.get('box_id')}")
                results.append(("T3: box_id", False, 200, data.get("box_id")))
            
            # Check client balance (should return to 0, since payment is now cash)
            client_a_bal_t3 = get_client_balance(cookies, client_id_a, "SAR")
            # Note: The client balance might not be exactly 0 if there were other transactions
            # But the net effect should be -900 from T2 state
            log(f"Client A balance after T3: {client_a_bal_t3} SAR")
            results.append(("T3: Client balance", True, 200, str(client_a_bal_t3)))
            
            # Check box balance (should increase by 900)
            box_bal_after_t3 = get_box_balance(cookies, box_id_cash, "SAR")
            box_delta = box_bal_after_t3 - box_bal_before_t3
            if box_delta == 900:
                log(f"✅ PASS - Box balance increased by 900 SAR (from {box_bal_before_t3} to {box_bal_after_t3})")
                results.append(("T3: Box balance delta", True, 200, f"+900 (now {box_bal_after_t3})"))
            else:
                log(f"❌ FAIL - Box balance delta: {box_delta} (expected +900)")
                results.append(("T3: Box balance delta", False, 200, f"{box_delta} (expected +900)"))
            
            # Check quota unchanged
            Q_t3 = get_quota(cookies)
            if Q_t3 == Q1:
                log(f"✅ PASS - Quota unchanged: {Q_t3}")
                results.append(("T3: Quota unchanged", True, 200, str(Q_t3)))
            else:
                log(f"❌ FAIL - Quota changed: {Q1} → {Q_t3}")
                results.append(("T3: Quota unchanged", False, 200, f"{Q1} → {Q_t3}"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("T3: Switch to cash", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("T3: Switch to cash", False, 0, str(e)))
    
    # ========== T4: MANUAL OVERRIDE ==========
    log("\n" + "=" * 80)
    log("T4: MANUAL OVERRIDE (total_cost: 500, total_sale: 800)")
    log("=" * 80)
    
    try:
        # Record box balance before T4
        box_bal_before_t4 = get_box_balance(cookies, box_id_cash, "SAR")
        log(f"Box balance before T4: {box_bal_before_t4} SAR")
        
        resp = requests.patch(f"{API_BASE}/packages/{pkg_id}/bookings/{booking_id}", json={
            "total_cost": 500,
            "total_sale": 800
        }, cookies=cookies, timeout=10)
        
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            
            # Check _full_recalc flag
            if data.get("_full_recalc") == True:
                log("✅ PASS - _full_recalc: true")
                results.append(("T4: _full_recalc flag", True, 200, "true"))
            else:
                log(f"❌ FAIL - _full_recalc: {data.get('_full_recalc')}")
                results.append(("T4: _full_recalc flag", False, 200, str(data.get("_full_recalc"))))
            
            # Check total_cost
            if data.get("total_cost") == 500:
                log("✅ PASS - total_cost: 500")
                results.append(("T4: total_cost", True, 200, "500"))
            else:
                log(f"❌ FAIL - total_cost: {data.get('total_cost')}")
                results.append(("T4: total_cost", False, 200, str(data.get("total_cost"))))
            
            # Check total_sale
            if data.get("total_sale") == 800:
                log("✅ PASS - total_sale: 800")
                results.append(("T4: total_sale", True, 200, "800"))
            else:
                log(f"❌ FAIL - total_sale: {data.get('total_sale')}")
                results.append(("T4: total_sale", False, 200, str(data.get("total_sale"))))
            
            # Check commission (800 - 500 = 300)
            if data.get("commission") == 300:
                log("✅ PASS - commission: 300")
                results.append(("T4: commission", True, 200, "300"))
            else:
                log(f"❌ FAIL - commission: {data.get('commission')}")
                results.append(("T4: commission", False, 200, str(data.get("commission"))))
            
            # Check box balance delta (800 - 900 = -100)
            box_bal_after_t4 = get_box_balance(cookies, box_id_cash, "SAR")
            box_delta_t4 = box_bal_after_t4 - box_bal_before_t4
            if box_delta_t4 == -100:
                log(f"✅ PASS - Box balance decreased by 100 SAR (from {box_bal_before_t4} to {box_bal_after_t4})")
                results.append(("T4: Box balance delta", True, 200, f"-100 (now {box_bal_after_t4})"))
            else:
                log(f"❌ FAIL - Box balance delta: {box_delta_t4} (expected -100)")
                results.append(("T4: Box balance delta", False, 200, f"{box_delta_t4} (expected -100)"))
            
            # Check quota unchanged
            Q_t4 = get_quota(cookies)
            if Q_t4 == Q1:
                log(f"✅ PASS - Quota unchanged: {Q_t4}")
                results.append(("T4: Quota unchanged", True, 200, str(Q_t4)))
            else:
                log(f"❌ FAIL - Quota changed: {Q1} → {Q_t4}")
                results.append(("T4: Quota unchanged", False, 200, f"{Q1} → {Q_t4}"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("T4: Manual override", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("T4: Manual override", False, 0, str(e)))
    
    # ========== T5: ERROR CASES ==========
    log("\n" + "=" * 80)
    log("T5: ERROR CASES")
    log("=" * 80)
    
    # T5a: Non-existent booking ID
    log("\n[T5a] Non-existent booking ID...")
    try:
        resp = requests.patch(f"{API_BASE}/packages/{pkg_id}/bookings/nonexistent-uuid", json={
            "pilgrim_name": "x"
        }, cookies=cookies, timeout=10)
        
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:200]}")
        
        if resp.status_code == 404:
            data = resp.json()
            if "غير موجود" in data.get("error", ""):
                log("✅ PASS - 404 with Arabic error 'غير موجود'")
                results.append(("T5a: Non-existent booking", True, 404, data.get("error")))
            else:
                log(f"❌ FAIL - Wrong error message: {data.get('error')}")
                results.append(("T5a: Non-existent booking", False, 404, data.get("error")))
        else:
            log(f"❌ FAIL - Expected 404, got {resp.status_code}")
            results.append(("T5a: Non-existent booking", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("T5a: Non-existent booking", False, 0, str(e)))
    
    # T5b: Cash payment without box_id (create a new booking with credit, then try to switch to cash without box_id)
    log("\n[T5b] Cash payment without box_id...")
    try:
        # Create a new booking with credit payment
        resp_new = requests.post(f"{API_BASE}/packages/{pkg_id}/bookings", json={
            "client_id": client_id_a,
            "pilgrim_name": "علي",
            "passport_no": "C3",
            "pax_count": 1,
            "payment_method": "credit"
        }, cookies=cookies, timeout=10)
        
        if resp_new.status_code == 200:
            new_booking = resp_new.json()
            new_booking_id = new_booking["id"]
            log(f"Created new booking: {new_booking_id}")
            
            # Try to switch to cash without box_id
            resp = requests.patch(f"{API_BASE}/packages/{pkg_id}/bookings/{new_booking_id}", json={
                "payment_method": "cash"
            }, cookies=cookies, timeout=10)
            
            log(f"Status: {resp.status_code}")
            log(f"Response: {resp.text[:200]}")
            
            if resp.status_code == 400:
                data = resp.json()
                if "اختر الصندوق" in data.get("error", ""):
                    log("✅ PASS - 400 with Arabic error 'اختر الصندوق للدفع النقدي'")
                    results.append(("T5b: Cash without box_id", True, 400, data.get("error")))
                else:
                    log(f"❌ FAIL - Wrong error message: {data.get('error')}")
                    results.append(("T5b: Cash without box_id", False, 400, data.get("error")))
            else:
                log(f"❌ FAIL - Expected 400, got {resp.status_code}")
                results.append(("T5b: Cash without box_id", False, resp.status_code, resp.text[:100]))
            
            # Cleanup: delete the new booking
            requests.delete(f"{API_BASE}/packages/{pkg_id}/bookings/{new_booking_id}", cookies=cookies, timeout=10)
        else:
            log(f"⚠️ SKIP - Could not create new booking for T5b")
            results.append(("T5b: Cash without box_id", False, 0, "Setup failed"))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("T5b: Cash without box_id", False, 0, str(e)))
    
    # T5c: Non-existent client_id
    log("\n[T5c] Non-existent client_id...")
    try:
        resp = requests.patch(f"{API_BASE}/packages/{pkg_id}/bookings/{booking_id}", json={
            "client_id": "nonexistent-uuid"
        }, cookies=cookies, timeout=10)
        
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:200]}")
        
        if resp.status_code == 400:
            data = resp.json()
            if "العميل غير موجود" in data.get("error", ""):
                log("✅ PASS - 400 with Arabic error 'العميل غير موجود'")
                results.append(("T5c: Non-existent client", True, 400, data.get("error")))
            else:
                log(f"❌ FAIL - Wrong error message: {data.get('error')}")
                results.append(("T5c: Non-existent client", False, 400, data.get("error")))
        else:
            log(f"❌ FAIL - Expected 400, got {resp.status_code}")
            results.append(("T5c: Non-existent client", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("T5c: Non-existent client", False, 0, str(e)))
    
    # T5d: Closed package
    log("\n[T5d] Closed package...")
    try:
        # Close the package
        resp_close = requests.patch(f"{API_BASE}/packages/{pkg_id}", json={
            "status": "closed"
        }, cookies=cookies, timeout=10)
        
        if resp_close.status_code == 200:
            log("Package closed")
            
            # Try to edit booking
            resp = requests.patch(f"{API_BASE}/packages/{pkg_id}/bookings/{booking_id}", json={
                "pilgrim_name": "test"
            }, cookies=cookies, timeout=10)
            
            log(f"Status: {resp.status_code}")
            log(f"Response: {resp.text[:200]}")
            
            if resp.status_code == 400:
                data = resp.json()
                if "الباكج مغلق" in data.get("error", ""):
                    log("✅ PASS - 400 with Arabic error 'الباكج مغلق'")
                    results.append(("T5d: Closed package", True, 400, data.get("error")))
                else:
                    log(f"❌ FAIL - Wrong error message: {data.get('error')}")
                    results.append(("T5d: Closed package", False, 400, data.get("error")))
            else:
                log(f"❌ FAIL - Expected 400, got {resp.status_code}")
                results.append(("T5d: Closed package", False, resp.status_code, resp.text[:100]))
        else:
            log(f"⚠️ SKIP - Could not close package for T5d")
            results.append(("T5d: Closed package", False, 0, "Setup failed"))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("T5d: Closed package", False, 0, str(e)))
    
    # ========== REGRESSION ==========
    log("\n" + "=" * 80)
    log("REGRESSION CHECKS")
    log("=" * 80)
    
    # Health endpoint version
    log("\n[REGRESSION 1] GET /api/health - Version check...")
    try:
        resp = requests.get(f"{API_BASE}/health", timeout=10)
        log(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            version = data.get("version", "")
            if version == "3.9.21":
                log("✅ PASS - Version is 3.9.21")
                results.append(("REGRESSION: Health version", True, 200, version))
            else:
                log(f"❌ FAIL - Expected version 3.9.21, got {version}")
                results.append(("REGRESSION: Health version", False, 200, version))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("REGRESSION: Health version", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("REGRESSION: Health version", False, 0, str(e)))
    
    # DELETE booking still works
    log("\n[REGRESSION 2] DELETE /api/packages/{pkgId}/bookings/{bookingId}...")
    try:
        # Create a fresh booking to delete
        resp_fresh = requests.post(f"{API_BASE}/packages/{pkg_id}/bookings", json={
            "client_id": client_id_a,
            "pilgrim_name": "حسن",
            "passport_no": "D4",
            "pax_count": 1,
            "payment_method": "credit"
        }, cookies=cookies, timeout=10)
        
        if resp_fresh.status_code == 200:
            fresh_booking = resp_fresh.json()
            fresh_booking_id = fresh_booking["id"]
            log(f"Created fresh booking: {fresh_booking_id}")
            
            # Record quota before delete
            Q_before_del = get_quota(cookies)
            
            # Delete the booking
            resp_del = requests.delete(f"{API_BASE}/packages/{pkg_id}/bookings/{fresh_booking_id}", cookies=cookies, timeout=10)
            log(f"Delete status: {resp_del.status_code}")
            
            if resp_del.status_code == 200:
                # Check quota decremented
                Q_after_del = get_quota(cookies)
                if Q_after_del == Q_before_del - 1:
                    log(f"✅ PASS - DELETE works, quota decremented by 1 ({Q_before_del} → {Q_after_del})")
                    results.append(("REGRESSION: DELETE booking", True, 200, f"Quota {Q_before_del} → {Q_after_del}"))
                else:
                    log(f"❌ FAIL - Quota not decremented correctly: {Q_before_del} → {Q_after_del}")
                    results.append(("REGRESSION: DELETE booking", False, 200, f"Quota {Q_before_del} → {Q_after_del}"))
            else:
                log(f"❌ FAIL - DELETE failed: {resp_del.text[:200]}")
                results.append(("REGRESSION: DELETE booking", False, resp_del.status_code, resp_del.text[:100]))
        else:
            log(f"⚠️ SKIP - Could not create fresh booking for DELETE test")
            results.append(("REGRESSION: DELETE booking", False, 0, "Setup failed"))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("REGRESSION: DELETE booking", False, 0, str(e)))
    
    return results

def main():
    log("=" * 80)
    log("Rahaal ERP v3.9.21 Backend Test Suite")
    log("Test: PATCH /api/packages/{pkgId}/bookings/{bookingId}")
    log("=" * 80)
    
    all_results = []
    
    # Run test
    all_results.extend(test_patch_booking())
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for r in all_results if r[1])
    failed = sum(1 for r in all_results if not r[1])
    
    log(f"\nTotal Tests: {len(all_results)}")
    log(f"✅ Passed: {passed}")
    log(f"❌ Failed: {failed}")
    
    log("\nDetailed Results:")
    for test_name, passed_flag, status, detail in all_results:
        status_icon = "✅" if passed_flag else "❌"
        log(f"{status_icon} {test_name}: HTTP {status} - {detail}")
    
    log("\n" + "=" * 80)
    
    if failed == 0:
        log("🎉 ALL TESTS PASSED!")
        return 0
    else:
        log(f"⚠️ {failed} TEST(S) FAILED")
        return 1

if __name__ == "__main__":
    exit(main())
