#!/usr/bin/env python3
"""
Rahaal ERP v2.5 Edit Mode Engine Backend Test Suite
Tests PUT endpoints for tickets, visas, vouchers, fx, and journal-entries
with balance reversal + JE reversal + quota preservation
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "Demo@2025"

# Global session
session = requests.Session()

def print_test(msg):
    print(f"\n{'='*80}")
    print(f"TEST: {msg}")
    print('='*80)

def print_result(passed, msg):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {msg}")

def print_error(msg):
    print(f"❌ ERROR: {msg}")

# ============ SETUP ============
def test_login():
    """Login as tenant owner and establish session"""
    print_test("Login as tenant owner")
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"User: {data.get('user', {}).get('email')}")
            print(f"Tenant: {data.get('tenant', {}).get('name')}")
            print_result(True, "Login successful")
            return True
        else:
            print_error(f"Login failed: {resp.text}")
            return False
    except Exception as e:
        print_error(f"Login exception: {e}")
        return False

def get_quota():
    """Get current journal quota"""
    try:
        resp = session.get(f"{BASE_URL}/auth/me")
        if resp.status_code == 200:
            data = resp.json()
            quota = data.get('tenant', {}).get('journal_quota', {})
            used = quota.get('used', 0)
            limit = quota.get('limit', 0)
            print(f"Quota: {used}/{limit}")
            return used
        else:
            print_error(f"Failed to get quota: {resp.text}")
            return None
    except Exception as e:
        print_error(f"Get quota exception: {e}")
        return None

def setup_parties():
    """Setup client, supplier, and boxes for testing"""
    print_test("Setup: Create/Get Client, Supplier, and Boxes")
    
    # Get existing clients
    resp = session.get(f"{BASE_URL}/clients")
    clients = resp.json() if resp.status_code == 200 else []
    
    if len(clients) > 0:
        client_id = clients[0]['id']
        print(f"Using existing client: {clients[0]['name']} ({client_id})")
    else:
        # Create client
        resp = session.post(f"{BASE_URL}/clients", json={"name": "E2E Test Client"})
        if resp.status_code == 200:
            client_id = resp.json()['id']
            print(f"Created client: {client_id}")
        else:
            print_error(f"Failed to create client: {resp.text}")
            return None, None, None, None
    
    # Get existing suppliers
    resp = session.get(f"{BASE_URL}/suppliers")
    suppliers = resp.json() if resp.status_code == 200 else []
    
    if len(suppliers) > 0:
        supplier_id = suppliers[0]['id']
        print(f"Using existing supplier: {suppliers[0]['name']} ({supplier_id})")
    else:
        # Create supplier
        resp = session.post(f"{BASE_URL}/suppliers", json={"name": "E2E Test Supplier"})
        if resp.status_code == 200:
            supplier_id = resp.json()['id']
            print(f"Created supplier: {supplier_id}")
        else:
            print_error(f"Failed to create supplier: {resp.text}")
            return None, None, None, None
    
    # Get boxes
    resp = session.get(f"{BASE_URL}/boxes")
    boxes = resp.json() if resp.status_code == 200 else []
    
    if len(boxes) >= 2:
        box1_id = boxes[0]['id']
        box2_id = boxes[1]['id']
        print(f"Using boxes: {boxes[0]['name_ar']} ({box1_id}), {boxes[1]['name_ar']} ({box2_id})")
    elif len(boxes) == 1:
        box1_id = boxes[0]['id']
        # Create second box
        resp = session.post(f"{BASE_URL}/boxes", json={"name_ar": "صندوق USD", "type": "cash"})
        if resp.status_code == 200:
            box2_id = resp.json()['id']
            print(f"Created second box: {box2_id}")
        else:
            print_error(f"Failed to create second box: {resp.text}")
            return None, None, None, None
    else:
        print_error("No boxes found")
        return None, None, None, None
    
    print_result(True, f"Setup complete: client={client_id}, supplier={supplier_id}, box1={box1_id}, box2={box2_id}")
    return client_id, supplier_id, box1_id, box2_id

def get_balance(entity_type, entity_id, currency):
    """Get balance for client, supplier, or box"""
    try:
        resp = session.get(f"{BASE_URL}/{entity_type}")
        if resp.status_code == 200:
            entities = resp.json()
            for e in entities:
                if e['id'] == entity_id:
                    return e.get('balances', {}).get(currency, 0)
        return None
    except Exception as e:
        print_error(f"Get balance exception: {e}")
        return None

# ============ TEST 1: TICKET EDIT ============
def test_ticket_edit(client_id, supplier_id, box_id):
    """Test PUT /tickets/:id with balance reversal and quota preservation"""
    print_test("1. Ticket Edit - PUT /tickets/:id")
    
    # Get baseline quota
    q0 = get_quota()
    if q0 is None:
        print_error("Failed to get baseline quota")
        return False
    
    # Get baseline balances
    client_bal_before = get_balance('clients', client_id, 'USD')
    supplier_bal_before = get_balance('suppliers', supplier_id, 'USD')
    print(f"Baseline - Client USD: {client_bal_before}, Supplier USD: {supplier_bal_before}, Quota: {q0}")
    
    # Create ticket
    ticket_data = {
        "date": "2025-06-10",
        "currency": "USD",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "pnr": "E2ET-1",
        "cost": 100,
        "sale_price": 150,
        "payment_method": "credit"
    }
    
    resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
    if resp.status_code != 200:
        print_error(f"Failed to create ticket: {resp.text}")
        return False
    
    ticket = resp.json()
    ticket_id = ticket['id']
    print(f"Created ticket: {ticket_id}, PNR: {ticket['pnr']}, Commission: {ticket['commission']}")
    
    # Verify balances after create
    client_bal_after_create = get_balance('clients', client_id, 'USD')
    supplier_bal_after_create = get_balance('suppliers', supplier_id, 'USD')
    q1 = get_quota()
    print(f"After create - Client USD: {client_bal_after_create}, Supplier USD: {supplier_bal_after_create}, Quota: {q1}")
    
    # Verify quota incremented
    if q1 != q0 + 1:
        print_error(f"Quota not incremented correctly: expected {q0+1}, got {q1}")
        return False
    
    # Edit ticket
    edit_data = {
        "date": "2025-06-10",
        "currency": "USD",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "pnr": "E2ET-1-EDIT",
        "cost": 120,
        "sale_price": 200,
        "payment_method": "credit"
    }
    
    resp = session.put(f"{BASE_URL}/tickets/{ticket_id}", json=edit_data)
    print(f"PUT Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print_error(f"Failed to edit ticket: {resp.text}")
        # Cleanup
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    edited_ticket = resp.json()
    print(f"Edited ticket: ID={edited_ticket['id']}, PNR={edited_ticket['pnr']}, Commission={edited_ticket['commission']}")
    
    # Verify response
    if edited_ticket['id'] != ticket_id:
        print_error(f"ID changed after edit: {ticket_id} -> {edited_ticket['id']}")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    if edited_ticket['pnr'] != "E2ET-1-EDIT":
        print_error(f"PNR not updated: expected 'E2ET-1-EDIT', got '{edited_ticket['pnr']}'")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    if edited_ticket['commission'] != 80:
        print_error(f"Commission incorrect: expected 80, got {edited_ticket['commission']}")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    # Verify balances after edit
    client_bal_after_edit = get_balance('clients', client_id, 'USD')
    supplier_bal_after_edit = get_balance('suppliers', supplier_id, 'USD')
    q2 = get_quota()
    print(f"After edit - Client USD: {client_bal_after_edit}, Supplier USD: {supplier_bal_after_edit}, Quota: {q2}")
    
    # CRITICAL: Quota must be unchanged
    if q2 != q1:
        print_error(f"❌ CRITICAL: Quota changed after edit: {q1} -> {q2}")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    # Verify balance changes
    expected_client = client_bal_before + 200  # Net effect: +200 (not +150 then +200)
    expected_supplier = supplier_bal_before + 120  # Net effect: +120 (not +100 then +120)
    
    if abs(client_bal_after_edit - expected_client) > 0.01:
        print_error(f"Client balance incorrect: expected {expected_client}, got {client_bal_after_edit}")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    if abs(supplier_bal_after_edit - expected_supplier) > 0.01:
        print_error(f"Supplier balance incorrect: expected {expected_supplier}, got {supplier_bal_after_edit}")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    # Verify journal entry
    resp = session.get(f"{BASE_URL}/journal-entries")
    if resp.status_code == 200:
        jes = resp.json()
        ticket_jes = [je for je in jes if je.get('ref_id') == ticket_id]
        if len(ticket_jes) == 1:
            je = ticket_jes[0]
            if 'تعديل' in je.get('description', ''):
                print(f"✅ Journal entry has 'تعديل' in description")
            else:
                print(f"⚠️  Journal entry missing 'تعديل' marker")
        else:
            print_error(f"Expected 1 JE for ticket, found {len(ticket_jes)}")
    
    # Cleanup
    resp = session.delete(f"{BASE_URL}/tickets/{ticket_id}")
    if resp.status_code == 200:
        print("Cleanup: Ticket deleted")
    
    print_result(True, "Ticket edit test passed - quota preserved, balances correct")
    return True

# ============ TEST 2: VISA EDIT ============
def test_visa_edit(client_id, supplier_id, box_id):
    """Test PUT /visas/:id"""
    print_test("2. Visa Edit - PUT /visas/:id")
    
    q0 = get_quota()
    client_bal_before = get_balance('clients', client_id, 'SAR')
    supplier_bal_before = get_balance('suppliers', supplier_id, 'SAR')
    
    # Create visa
    visa_data = {
        "date": "2025-06-10",
        "service_type": "تأشيرة عمرة",
        "currency": "SAR",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "passenger_name": "E2E Passenger",
        "passport_no": "P123",
        "cost": 50,
        "sale_price": 80,
        "payment_method": "credit"
    }
    
    resp = session.post(f"{BASE_URL}/visas", json=visa_data)
    if resp.status_code != 200:
        print_error(f"Failed to create visa: {resp.text}")
        return False
    
    visa = resp.json()
    visa_id = visa['id']
    print(f"Created visa: {visa_id}, Commission: {visa['commission']}")
    
    q1 = get_quota()
    
    # Edit visa
    edit_data = {
        "date": "2025-06-10",
        "service_type": "تأشيرة سياحية",
        "currency": "SAR",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "passenger_name": "E2E Edited",
        "passport_no": "P123",
        "cost": 60,
        "sale_price": 100,
        "payment_method": "credit"
    }
    
    resp = session.put(f"{BASE_URL}/visas/{visa_id}", json=edit_data)
    print(f"PUT Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print_error(f"Failed to edit visa: {resp.text}")
        session.delete(f"{BASE_URL}/visas/{visa_id}")
        return False
    
    edited_visa = resp.json()
    print(f"Edited visa: ID={edited_visa['id']}, Commission={edited_visa['commission']}")
    
    # Verify
    if edited_visa['id'] != visa_id:
        print_error(f"ID changed after edit")
        session.delete(f"{BASE_URL}/visas/{visa_id}")
        return False
    
    if edited_visa['commission'] != 40:
        print_error(f"Commission incorrect: expected 40, got {edited_visa['commission']}")
        session.delete(f"{BASE_URL}/visas/{visa_id}")
        return False
    
    q2 = get_quota()
    if q2 != q1:
        print_error(f"❌ CRITICAL: Quota changed after edit: {q1} -> {q2}")
        session.delete(f"{BASE_URL}/visas/{visa_id}")
        return False
    
    # Verify balances
    client_bal_after = get_balance('clients', client_id, 'SAR')
    supplier_bal_after = get_balance('suppliers', supplier_id, 'SAR')
    
    expected_client = client_bal_before + 100
    expected_supplier = supplier_bal_before + 60
    
    if abs(client_bal_after - expected_client) > 0.01:
        print_error(f"Client balance incorrect: expected {expected_client}, got {client_bal_after}")
        session.delete(f"{BASE_URL}/visas/{visa_id}")
        return False
    
    if abs(supplier_bal_after - expected_supplier) > 0.01:
        print_error(f"Supplier balance incorrect: expected {expected_supplier}, got {supplier_bal_after}")
        session.delete(f"{BASE_URL}/visas/{visa_id}")
        return False
    
    # Cleanup
    session.delete(f"{BASE_URL}/visas/{visa_id}")
    
    print_result(True, "Visa edit test passed - quota preserved, balances correct")
    return True

# ============ TEST 3: VOUCHER EDIT (RECEIPT) ============
def test_voucher_receipt_edit(client_id, box_id):
    """Test PUT /vouchers/:id for receipt"""
    print_test("3. Voucher Receipt Edit - PUT /vouchers/:id")
    
    q0 = get_quota()
    client_bal_before = get_balance('clients', client_id, 'SAR')
    box_bal_before = get_balance('boxes', box_id, 'SAR')
    
    # Create receipt
    voucher_data = {
        "type": "receipt",
        "date": "2025-06-10",
        "currency": "SAR",
        "amount": 100,
        "party_type": "client",
        "party_id": client_id,
        "box_id": box_id
    }
    
    resp = session.post(f"{BASE_URL}/vouchers", json=voucher_data)
    if resp.status_code != 200:
        print_error(f"Failed to create receipt: {resp.text}")
        return False
    
    voucher = resp.json()
    voucher_id = voucher['id']
    print(f"Created receipt: {voucher_id}, Amount: {voucher['amount']}")
    
    q1 = get_quota()
    
    # Edit receipt
    edit_data = {
        "type": "receipt",
        "date": "2025-06-10",
        "currency": "SAR",
        "amount": 150,
        "party_type": "client",
        "party_id": client_id,
        "box_id": box_id
    }
    
    resp = session.put(f"{BASE_URL}/vouchers/{voucher_id}", json=edit_data)
    print(f"PUT Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print_error(f"Failed to edit receipt: {resp.text}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    edited_voucher = resp.json()
    print(f"Edited receipt: ID={edited_voucher['id']}, Amount={edited_voucher['amount']}")
    
    # Verify
    if edited_voucher['id'] != voucher_id:
        print_error(f"ID changed after edit")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    if edited_voucher['amount'] != 150:
        print_error(f"Amount incorrect: expected 150, got {edited_voucher['amount']}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    q2 = get_quota()
    if q2 != q1:
        print_error(f"❌ CRITICAL: Quota changed after edit: {q1} -> {q2}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    # Verify balances
    client_bal_after = get_balance('clients', client_id, 'SAR')
    box_bal_after = get_balance('boxes', box_id, 'SAR')
    
    expected_client = client_bal_before - 150  # Receipt reduces client balance
    expected_box = box_bal_before + 150  # Receipt increases box balance
    
    if abs(client_bal_after - expected_client) > 0.01:
        print_error(f"Client balance incorrect: expected {expected_client}, got {client_bal_after}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    if abs(box_bal_after - expected_box) > 0.01:
        print_error(f"Box balance incorrect: expected {expected_box}, got {box_bal_after}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    # Cleanup
    session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
    
    print_result(True, "Voucher receipt edit test passed - quota preserved, balances correct")
    return True

# ============ TEST 4: VOUCHER EDIT (PAYMENT) ============
def test_voucher_payment_edit(supplier_id, box_id):
    """Test PUT /vouchers/:id for payment"""
    print_test("4. Voucher Payment Edit - PUT /vouchers/:id")
    
    q0 = get_quota()
    supplier_bal_before = get_balance('suppliers', supplier_id, 'SAR')
    box_bal_before = get_balance('boxes', box_id, 'SAR')
    
    # Create payment
    voucher_data = {
        "type": "payment",
        "date": "2025-06-10",
        "currency": "SAR",
        "amount": 80,
        "party_type": "supplier",
        "party_id": supplier_id,
        "box_id": box_id
    }
    
    resp = session.post(f"{BASE_URL}/vouchers", json=voucher_data)
    if resp.status_code != 200:
        print_error(f"Failed to create payment: {resp.text}")
        return False
    
    voucher = resp.json()
    voucher_id = voucher['id']
    print(f"Created payment: {voucher_id}, Amount: {voucher['amount']}")
    
    q1 = get_quota()
    
    # Edit payment
    edit_data = {
        "type": "payment",
        "date": "2025-06-10",
        "currency": "SAR",
        "amount": 120,
        "party_type": "supplier",
        "party_id": supplier_id,
        "box_id": box_id
    }
    
    resp = session.put(f"{BASE_URL}/vouchers/{voucher_id}", json=edit_data)
    print(f"PUT Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print_error(f"Failed to edit payment: {resp.text}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    edited_voucher = resp.json()
    print(f"Edited payment: ID={edited_voucher['id']}, Amount={edited_voucher['amount']}")
    
    # Verify
    if edited_voucher['id'] != voucher_id:
        print_error(f"ID changed after edit")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    if edited_voucher['amount'] != 120:
        print_error(f"Amount incorrect: expected 120, got {edited_voucher['amount']}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    q2 = get_quota()
    if q2 != q1:
        print_error(f"❌ CRITICAL: Quota changed after edit: {q1} -> {q2}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    # Verify balances
    supplier_bal_after = get_balance('suppliers', supplier_id, 'SAR')
    box_bal_after = get_balance('boxes', box_id, 'SAR')
    
    expected_supplier = supplier_bal_before - 120  # Payment reduces supplier balance
    expected_box = box_bal_before - 120  # Payment reduces box balance
    
    if abs(supplier_bal_after - expected_supplier) > 0.01:
        print_error(f"Supplier balance incorrect: expected {expected_supplier}, got {supplier_bal_after}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    if abs(box_bal_after - expected_box) > 0.01:
        print_error(f"Box balance incorrect: expected {expected_box}, got {box_bal_after}")
        session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
        return False
    
    # Cleanup
    session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
    
    print_result(True, "Voucher payment edit test passed - quota preserved, balances correct")
    return True

# ============ TEST 5: FX EDIT (BUY) ============
def test_fx_buy_edit(box1_id, box2_id):
    """Test PUT /fx/:id for buy"""
    print_test("5. FX Buy Edit - PUT /fx/:id")
    
    q0 = get_quota()
    box1_bal_before = get_balance('boxes', box1_id, 'USD')
    box2_bal_before = get_balance('boxes', box2_id, 'SAR')
    
    # Create FX buy
    fx_data = {
        "type": "buy",
        "date": "2025-06-10",
        "currency": "USD",
        "counter_currency": "SAR",
        "amount": 100,
        "exchange_rate": 3.75,
        "box_currency_id": box1_id,
        "box_counter_id": box2_id,
        "customer_name": "E2E FX",
        "id_type": "هوية وطنية",
        "id_number": "1234"
    }
    
    resp = session.post(f"{BASE_URL}/fx", json=fx_data)
    if resp.status_code != 200:
        print_error(f"Failed to create FX buy: {resp.text}")
        return False
    
    fx = resp.json()
    fx_id = fx['id']
    print(f"Created FX buy: {fx_id}, Amount: {fx['amount']}, Counter: {fx['counter_amount']}")
    
    q1 = get_quota()
    
    # Edit FX buy
    edit_data = {
        "type": "buy",
        "date": "2025-06-10",
        "currency": "USD",
        "counter_currency": "SAR",
        "amount": 120,
        "exchange_rate": 3.80,
        "box_currency_id": box1_id,
        "box_counter_id": box2_id,
        "customer_name": "E2E FX",
        "id_type": "هوية وطنية",
        "id_number": "1234"
    }
    
    resp = session.put(f"{BASE_URL}/fx/{fx_id}", json=edit_data)
    print(f"PUT Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print_error(f"Failed to edit FX buy: {resp.text}")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    edited_fx = resp.json()
    print(f"Edited FX buy: ID={edited_fx['id']}, Amount={edited_fx['amount']}, Counter={edited_fx['counter_amount']}")
    
    # Verify
    if edited_fx['id'] != fx_id:
        print_error(f"ID changed after edit")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    expected_counter = 120 * 3.80
    if abs(edited_fx['counter_amount'] - expected_counter) > 0.01:
        print_error(f"Counter amount incorrect: expected {expected_counter}, got {edited_fx['counter_amount']}")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    q2 = get_quota()
    if q2 != q1:
        print_error(f"❌ CRITICAL: Quota changed after edit: {q1} -> {q2}")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    # Verify balances
    box1_bal_after = get_balance('boxes', box1_id, 'USD')
    box2_bal_after = get_balance('boxes', box2_id, 'SAR')
    
    expected_box1 = box1_bal_before + 120  # Buy increases USD box
    expected_box2 = box2_bal_before - 456  # Buy decreases SAR box (120 * 3.80)
    
    if abs(box1_bal_after - expected_box1) > 0.01:
        print_error(f"Box1 USD balance incorrect: expected {expected_box1}, got {box1_bal_after}")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    if abs(box2_bal_after - expected_box2) > 0.01:
        print_error(f"Box2 SAR balance incorrect: expected {expected_box2}, got {box2_bal_after}")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    # Cleanup
    session.delete(f"{BASE_URL}/fx/{fx_id}")
    
    print_result(True, "FX buy edit test passed - quota preserved, balances correct")
    return True

# ============ TEST 6: FX EDIT (SELL) ============
def test_fx_sell_edit(box1_id, box2_id):
    """Test PUT /fx/:id for sell"""
    print_test("6. FX Sell Edit - PUT /fx/:id")
    
    q0 = get_quota()
    box1_bal_before = get_balance('boxes', box1_id, 'USD')
    box2_bal_before = get_balance('boxes', box2_id, 'SAR')
    
    # Create FX sell
    fx_data = {
        "type": "sell",
        "date": "2025-06-10",
        "currency": "USD",
        "counter_currency": "SAR",
        "amount": 50,
        "exchange_rate": 3.75,
        "box_currency_id": box1_id,
        "box_counter_id": box2_id,
        "customer_name": "E2E FX Sell",
        "id_type": "هوية وطنية",
        "id_number": "5678"
    }
    
    resp = session.post(f"{BASE_URL}/fx", json=fx_data)
    if resp.status_code != 200:
        print_error(f"Failed to create FX sell: {resp.text}")
        return False
    
    fx = resp.json()
    fx_id = fx['id']
    print(f"Created FX sell: {fx_id}, Amount: {fx['amount']}, Counter: {fx['counter_amount']}")
    
    q1 = get_quota()
    
    # Edit FX sell
    edit_data = {
        "type": "sell",
        "date": "2025-06-10",
        "currency": "USD",
        "counter_currency": "SAR",
        "amount": 60,
        "exchange_rate": 3.80,
        "box_currency_id": box1_id,
        "box_counter_id": box2_id,
        "customer_name": "E2E FX Sell",
        "id_type": "هوية وطنية",
        "id_number": "5678"
    }
    
    resp = session.put(f"{BASE_URL}/fx/{fx_id}", json=edit_data)
    print(f"PUT Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print_error(f"Failed to edit FX sell: {resp.text}")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    edited_fx = resp.json()
    print(f"Edited FX sell: ID={edited_fx['id']}, Amount={edited_fx['amount']}, Counter={edited_fx['counter_amount']}")
    
    # Verify
    if edited_fx['id'] != fx_id:
        print_error(f"ID changed after edit")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    q2 = get_quota()
    if q2 != q1:
        print_error(f"❌ CRITICAL: Quota changed after edit: {q1} -> {q2}")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    # Verify balances
    box1_bal_after = get_balance('boxes', box1_id, 'USD')
    box2_bal_after = get_balance('boxes', box2_id, 'SAR')
    
    expected_box1 = box1_bal_before - 60  # Sell decreases USD box
    expected_box2 = box2_bal_before + 228  # Sell increases SAR box (60 * 3.80)
    
    if abs(box1_bal_after - expected_box1) > 0.01:
        print_error(f"Box1 USD balance incorrect: expected {expected_box1}, got {box1_bal_after}")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    if abs(box2_bal_after - expected_box2) > 0.01:
        print_error(f"Box2 SAR balance incorrect: expected {expected_box2}, got {box2_bal_after}")
        session.delete(f"{BASE_URL}/fx/{fx_id}")
        return False
    
    # Cleanup
    session.delete(f"{BASE_URL}/fx/{fx_id}")
    
    print_result(True, "FX sell edit test passed - quota preserved, balances correct")
    return True

# ============ TEST 7: MANUAL JE EDIT (SINGLE CURRENCY) ============
def test_manual_je_single_edit(client_id, supplier_id):
    """Test PUT /journal-entries/:id for manual single-currency JE"""
    print_test("7. Manual JE Single Currency Edit - PUT /journal-entries/:id")
    
    q0 = get_quota()
    client_bal_before = get_balance('clients', client_id, 'SAR')
    supplier_bal_before = get_balance('suppliers', supplier_id, 'SAR')
    
    # Create manual JE
    je_data = {
        "date": "2025-06-10",
        "currency": "SAR",
        "description": "E2E manual",
        "lines": [
            {
                "account_code": "1301",
                "account_name": "العملاء",
                "party_type": "client",
                "party_id": client_id,
                "debit": 200,
                "credit": 0
            },
            {
                "account_code": "2101",
                "account_name": "الموردون",
                "party_type": "supplier",
                "party_id": supplier_id,
                "debit": 0,
                "credit": 200
            }
        ]
    }
    
    resp = session.post(f"{BASE_URL}/journal-entries", json=je_data)
    if resp.status_code != 200:
        print_error(f"Failed to create manual JE: {resp.text}")
        return False
    
    je = resp.json()
    je_id = je['id']
    print(f"Created manual JE: {je_id}")
    
    q1 = get_quota()
    
    # Edit manual JE
    edit_data = {
        "date": "2025-06-10",
        "currency": "SAR",
        "description": "E2E manual edited",
        "lines": [
            {
                "account_code": "1301",
                "account_name": "العملاء",
                "party_type": "client",
                "party_id": client_id,
                "debit": 300,
                "credit": 0
            },
            {
                "account_code": "2101",
                "account_name": "الموردون",
                "party_type": "supplier",
                "party_id": supplier_id,
                "debit": 0,
                "credit": 300
            }
        ]
    }
    
    resp = session.put(f"{BASE_URL}/journal-entries/{je_id}", json=edit_data)
    print(f"PUT Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print_error(f"Failed to edit manual JE: {resp.text}")
        return False
    
    edited_je = resp.json()
    print(f"Edited manual JE: ID={edited_je['id']}")
    
    # Verify
    if edited_je['id'] != je_id:
        print_error(f"ID changed after edit")
        return False
    
    q2 = get_quota()
    if q2 != q1:
        print_error(f"❌ CRITICAL: Quota changed after edit: {q1} -> {q2}")
        return False
    
    # Verify balances
    client_bal_after = get_balance('clients', client_id, 'SAR')
    supplier_bal_after = get_balance('suppliers', supplier_id, 'SAR')
    
    expected_client = client_bal_before + 300  # Debit increases client balance
    expected_supplier = supplier_bal_before + 300  # Credit increases supplier balance
    
    if abs(client_bal_after - expected_client) > 0.01:
        print_error(f"Client balance incorrect: expected {expected_client}, got {client_bal_after}")
        return False
    
    if abs(supplier_bal_after - expected_supplier) > 0.01:
        print_error(f"Supplier balance incorrect: expected {expected_supplier}, got {supplier_bal_after}")
        return False
    
    print_result(True, "Manual JE single currency edit test passed - quota preserved, balances correct")
    return True

# ============ TEST 8: MANUAL JE EDIT (DUAL CURRENCY) ============
def test_manual_je_dual_edit(box1_id, box2_id):
    """Test PUT /journal-entries/:id for manual dual-currency JE"""
    print_test("8. Manual JE Dual Currency Edit - PUT /journal-entries/:id")
    
    q0 = get_quota()
    box1_bal_before = get_balance('boxes', box1_id, 'USD')
    box2_bal_before = get_balance('boxes', box2_id, 'SAR')
    
    # Create manual dual JE
    je_data = {
        "dual": True,
        "date": "2025-06-10",
        "description": "E2E dual",
        "debit_account_code": "1101",
        "debit_account_name": "صندوق دولار",
        "debit_currency": "USD",
        "debit_amount": 100,
        "debit_party_type": "box",
        "debit_party_id": box1_id,
        "credit_account_code": "1102",
        "credit_account_name": "صندوق ريال",
        "credit_currency": "SAR",
        "credit_amount": 375,
        "credit_party_type": "box",
        "credit_party_id": box2_id
    }
    
    resp = session.post(f"{BASE_URL}/journal-entries", json=je_data)
    if resp.status_code != 200:
        print_error(f"Failed to create manual dual JE: {resp.text}")
        return False
    
    je = resp.json()
    je_id = je['id']
    print(f"Created manual dual JE: {je_id}")
    
    q1 = get_quota()
    
    # Edit manual dual JE
    edit_data = {
        "dual": True,
        "date": "2025-06-10",
        "description": "E2E dual edited",
        "debit_account_code": "1101",
        "debit_account_name": "صندوق دولار",
        "debit_currency": "USD",
        "debit_amount": 120,
        "debit_party_type": "box",
        "debit_party_id": box1_id,
        "credit_account_code": "1102",
        "credit_account_name": "صندوق ريال",
        "credit_currency": "SAR",
        "credit_amount": 456,
        "credit_party_type": "box",
        "credit_party_id": box2_id
    }
    
    resp = session.put(f"{BASE_URL}/journal-entries/{je_id}", json=edit_data)
    print(f"PUT Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print_error(f"Failed to edit manual dual JE: {resp.text}")
        return False
    
    edited_je = resp.json()
    print(f"Edited manual dual JE: ID={edited_je['id']}")
    
    # Verify
    if edited_je['id'] != je_id:
        print_error(f"ID changed after edit")
        return False
    
    q2 = get_quota()
    if q2 != q1:
        print_error(f"❌ CRITICAL: Quota changed after edit: {q1} -> {q2}")
        return False
    
    # Verify balances
    box1_bal_after = get_balance('boxes', box1_id, 'USD')
    box2_bal_after = get_balance('boxes', box2_id, 'SAR')
    
    expected_box1 = box1_bal_before + 120  # Debit increases box balance
    expected_box2 = box2_bal_before - 456  # Credit decreases box balance
    
    if abs(box1_bal_after - expected_box1) > 0.01:
        print_error(f"Box1 USD balance incorrect: expected {expected_box1}, got {box1_bal_after}")
        return False
    
    if abs(box2_bal_after - expected_box2) > 0.01:
        print_error(f"Box2 SAR balance incorrect: expected {expected_box2}, got {box2_bal_after}")
        return False
    
    print_result(True, "Manual JE dual currency edit test passed - quota preserved, balances correct")
    return True

# ============ TEST 9: NON-EDITABLE JE RETURNS 400 ============
def test_non_editable_je(client_id, supplier_id, box_id):
    """Test that editing non-manual JE returns 400"""
    print_test("9. Non-Editable JE Returns 400")
    
    # Create a ticket (which creates a non-editable JE)
    ticket_data = {
        "date": "2025-06-10",
        "currency": "SAR",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "pnr": "NON-EDIT",
        "cost": 100,
        "sale_price": 150,
        "payment_method": "credit"
    }
    
    resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
    if resp.status_code != 200:
        print_error(f"Failed to create ticket: {resp.text}")
        return False
    
    ticket = resp.json()
    ticket_id = ticket['id']
    
    # Get the JE for this ticket
    resp = session.get(f"{BASE_URL}/journal-entries")
    if resp.status_code != 200:
        print_error(f"Failed to get journal entries: {resp.text}")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    jes = resp.json()
    ticket_je = None
    for je in jes:
        if je.get('ref_id') == ticket_id and je.get('ref_type') == 'ticket':
            ticket_je = je
            break
    
    if not ticket_je:
        print_error(f"Could not find JE for ticket {ticket_id}")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    je_id = ticket_je['id']
    print(f"Found ticket JE: {je_id}")
    
    # Try to edit this JE (should return 400)
    edit_data = {
        "date": "2025-06-10",
        "currency": "SAR",
        "description": "Trying to edit non-manual JE",
        "lines": [
            {"account_code": "1301", "account_name": "العملاء", "debit": 100, "credit": 0},
            {"account_code": "2101", "account_name": "الموردون", "debit": 0, "credit": 100}
        ]
    }
    
    resp = session.put(f"{BASE_URL}/journal-entries/{je_id}", json=edit_data)
    print(f"PUT Status: {resp.status_code}")
    
    if resp.status_code == 400:
        error_msg = resp.json().get('error', '')
        print(f"Error message: {error_msg}")
        if 'تعديل' in error_msg or 'مباشرة' in error_msg:
            print_result(True, "Non-editable JE correctly returns 400 with Arabic message")
            session.delete(f"{BASE_URL}/tickets/{ticket_id}")
            return True
        else:
            print_error(f"400 returned but message doesn't contain expected Arabic text")
            session.delete(f"{BASE_URL}/tickets/{ticket_id}")
            return False
    else:
        print_error(f"Expected 400, got {resp.status_code}")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False

# ============ TEST 10: 404 CHECKS ============
def test_404_checks():
    """Test that PUT on non-existent IDs returns 404"""
    print_test("10. 404 Checks for Non-Existent IDs")
    
    results = []
    
    # Test tickets
    resp = session.put(f"{BASE_URL}/tickets/nonexistent-id", json={"date": "2025-06-10"})
    if resp.status_code == 404:
        print_result(True, "PUT /tickets/nonexistent-id returns 404")
        results.append(True)
    else:
        print_error(f"PUT /tickets/nonexistent-id returned {resp.status_code}, expected 404")
        results.append(False)
    
    # Test visas
    resp = session.put(f"{BASE_URL}/visas/nonexistent-id", json={"date": "2025-06-10"})
    if resp.status_code == 404:
        print_result(True, "PUT /visas/nonexistent-id returns 404")
        results.append(True)
    else:
        print_error(f"PUT /visas/nonexistent-id returned {resp.status_code}, expected 404")
        results.append(False)
    
    # Test vouchers
    resp = session.put(f"{BASE_URL}/vouchers/nonexistent-id", json={"date": "2025-06-10"})
    if resp.status_code == 404:
        print_result(True, "PUT /vouchers/nonexistent-id returns 404")
        results.append(True)
    else:
        print_error(f"PUT /vouchers/nonexistent-id returned {resp.status_code}, expected 404")
        results.append(False)
    
    # Test fx
    resp = session.put(f"{BASE_URL}/fx/nonexistent-id", json={"date": "2025-06-10"})
    if resp.status_code == 404:
        print_result(True, "PUT /fx/nonexistent-id returns 404")
        results.append(True)
    else:
        print_error(f"PUT /fx/nonexistent-id returned {resp.status_code}, expected 404")
        results.append(False)
    
    # Test journal-entries
    resp = session.put(f"{BASE_URL}/journal-entries/nonexistent-id", json={"date": "2025-06-10"})
    if resp.status_code == 404:
        print_result(True, "PUT /journal-entries/nonexistent-id returns 404")
        results.append(True)
    else:
        print_error(f"PUT /journal-entries/nonexistent-id returned {resp.status_code}, expected 404")
        results.append(False)
    
    return all(results)

# ============ TEST 11: REGRESSION - POST STILL WORKS ============
def test_regression_post(client_id, supplier_id):
    """Test that POST endpoints still work and increment quota"""
    print_test("11. Regression - POST Endpoints Still Work")
    
    q0 = get_quota()
    
    # Test POST ticket
    ticket_data = {
        "date": "2025-06-10",
        "currency": "SAR",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "pnr": "REGRESSION-1",
        "cost": 100,
        "sale_price": 150,
        "payment_method": "credit"
    }
    
    resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
    if resp.status_code != 200:
        print_error(f"POST /tickets failed: {resp.text}")
        return False
    
    ticket = resp.json()
    ticket_id = ticket['id']
    print(f"✅ POST /tickets works: {ticket_id}")
    
    q1 = get_quota()
    if q1 != q0 + 1:
        print_error(f"Quota not incremented after POST: expected {q0+1}, got {q1}")
        session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        return False
    
    print_result(True, f"POST /tickets increments quota correctly: {q0} -> {q1}")
    
    # Cleanup
    session.delete(f"{BASE_URL}/tickets/{ticket_id}")
    
    return True

# ============ MAIN ============
def main():
    print("\n" + "="*80)
    print("RAHAAL ERP v2.5 EDIT MODE ENGINE - BACKEND TEST SUITE")
    print("="*80)
    
    # Login
    if not test_login():
        print("\n❌ FATAL: Login failed. Aborting tests.")
        return
    
    # Setup
    client_id, supplier_id, box1_id, box2_id = setup_parties()
    if not all([client_id, supplier_id, box1_id, box2_id]):
        print("\n❌ FATAL: Setup failed. Aborting tests.")
        return
    
    # Run tests
    results = {}
    
    try:
        results['ticket_edit'] = test_ticket_edit(client_id, supplier_id, box1_id)
    except Exception as e:
        print_error(f"Ticket edit test exception: {e}")
        results['ticket_edit'] = False
    
    try:
        results['visa_edit'] = test_visa_edit(client_id, supplier_id, box1_id)
    except Exception as e:
        print_error(f"Visa edit test exception: {e}")
        results['visa_edit'] = False
    
    try:
        results['voucher_receipt_edit'] = test_voucher_receipt_edit(client_id, box1_id)
    except Exception as e:
        print_error(f"Voucher receipt edit test exception: {e}")
        results['voucher_receipt_edit'] = False
    
    try:
        results['voucher_payment_edit'] = test_voucher_payment_edit(supplier_id, box1_id)
    except Exception as e:
        print_error(f"Voucher payment edit test exception: {e}")
        results['voucher_payment_edit'] = False
    
    try:
        results['fx_buy_edit'] = test_fx_buy_edit(box1_id, box2_id)
    except Exception as e:
        print_error(f"FX buy edit test exception: {e}")
        results['fx_buy_edit'] = False
    
    try:
        results['fx_sell_edit'] = test_fx_sell_edit(box1_id, box2_id)
    except Exception as e:
        print_error(f"FX sell edit test exception: {e}")
        results['fx_sell_edit'] = False
    
    try:
        results['manual_je_single_edit'] = test_manual_je_single_edit(client_id, supplier_id)
    except Exception as e:
        print_error(f"Manual JE single edit test exception: {e}")
        results['manual_je_single_edit'] = False
    
    try:
        results['manual_je_dual_edit'] = test_manual_je_dual_edit(box1_id, box2_id)
    except Exception as e:
        print_error(f"Manual JE dual edit test exception: {e}")
        results['manual_je_dual_edit'] = False
    
    try:
        results['non_editable_je'] = test_non_editable_je(client_id, supplier_id, box1_id)
    except Exception as e:
        print_error(f"Non-editable JE test exception: {e}")
        results['non_editable_je'] = False
    
    try:
        results['404_checks'] = test_404_checks()
    except Exception as e:
        print_error(f"404 checks test exception: {e}")
        results['404_checks'] = False
    
    try:
        results['regression_post'] = test_regression_post(client_id, supplier_id)
    except Exception as e:
        print_error(f"Regression POST test exception: {e}")
        results['regression_post'] = False
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! v2.5 Edit Mode Engine is working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")

if __name__ == "__main__":
    main()
