#!/usr/bin/env python3
"""
Rahaal ERP v2.1 Backend Test Suite
Tests new v2.1 features: FX account, cash payments, currency exchange, manual journals, enhanced reports
"""

import requests
import json
from datetime import datetime

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test results tracking
test_results = []

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results.append({"name": name, "passed": passed, "details": details})
    print(f"{status}: {name}")
    if details:
        print(f"  Details: {details}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for t in test_results if t["passed"])
    total = len(test_results)
    print(f"Total: {total} | Passed: {passed} | Failed: {total - passed}")
    print("="*80)
    
    if total - passed > 0:
        print("\nFailed Tests:")
        for t in test_results:
            if not t["passed"]:
                print(f"  ❌ {t['name']}")
                if t["details"]:
                    print(f"     {t['details']}")

# ============ Test 1: FX 4104 Account Seeded ============
def test_fx_account_seeded(session):
    """Test that FX 4104 account is seeded"""
    try:
        r = session.get(f"{BASE_URL}/accounts", timeout=10)
        if r.status_code != 200:
            log_test("FX 4104 Account Seeded", False, f"Status {r.status_code}: {r.text}")
            return False
        
        accounts = r.json()
        fx_account = next((a for a in accounts if a.get('code') == '4104'), None)
        
        if not fx_account:
            log_test("FX 4104 Account Seeded", False, "Account 4104 not found")
            return False
        
        if 'فروق العملات' not in fx_account.get('name_ar', ''):
            log_test("FX 4104 Account Seeded", False, f"Account 4104 name incorrect: {fx_account.get('name_ar')}")
            return False
        
        log_test("FX 4104 Account Seeded", True, f"Account 4104: {fx_account.get('name_ar')}")
        return True
    except Exception as e:
        log_test("FX 4104 Account Seeded", False, f"Exception: {str(e)}")
        return False

# ============ Test 2: Ticket with payment_method='cash' ============
def test_ticket_cash_payment(session):
    """Test ticket with cash payment method"""
    try:
        # Get client, supplier, and cash box
        r = session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        if not clients:
            r = session.post(f"{BASE_URL}/clients", json={"name": "عميل نقدي", "phone": "0501111111"}, timeout=10)
            client = r.json()
        else:
            client = clients[0]
        
        r = session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers = r.json()
        if not suppliers:
            r = session.post(f"{BASE_URL}/suppliers", json={"name": "مورد نقدي", "phone": "0502222222"}, timeout=10)
            supplier = r.json()
        else:
            supplier = suppliers[0]
        
        r = session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes = r.json()
        if not boxes:
            log_test("Ticket Cash Payment", False, "No boxes found")
            return False
        cash_box = next((b for b in boxes if b.get('type') == 'cash'), boxes[0])
        
        # Get initial balances
        box_balance_before = cash_box['balances']['SAR']
        supplier_balance_before = supplier['balances']['SAR']
        client_balance_before = client['balances']['SAR']
        
        # Create ticket with cash payment
        ticket_data = {
            "client_id": client['id'],
            "supplier_id": supplier['id'],
            "currency": "SAR",
            "cost": 800,
            "sale_price": 1000,
            "payment_method": "cash",
            "box_id": cash_box['id'],
            "pnr": f"CASH001-{datetime.now().timestamp()}",
            "passenger_name": "مسافر نقدي",
            "date": datetime.now().isoformat()
        }
        
        r = session.post(f"{BASE_URL}/tickets", json=ticket_data, timeout=10)
        if r.status_code != 200:
            log_test("Ticket Cash Payment", False, f"Status {r.status_code}: {r.text}")
            return False
        
        ticket = r.json()
        
        # Verify response fields
        if ticket.get('payment_method') != 'cash':
            log_test("Ticket Cash Payment", False, f"payment_method incorrect: {ticket.get('payment_method')}")
            return False
        
        if ticket.get('box_id') != cash_box['id']:
            log_test("Ticket Cash Payment", False, f"box_id incorrect: {ticket.get('box_id')}")
            return False
        
        if not ticket.get('box_name'):
            log_test("Ticket Cash Payment", False, "box_name missing")
            return False
        
        # Verify balances
        r = session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes_after = r.json()
        box_after = next((b for b in boxes_after if b['id'] == cash_box['id']), None)
        
        r = session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers_after = r.json()
        supplier_after = next((s for s in suppliers_after if s['id'] == supplier['id']), None)
        
        r = session.get(f"{BASE_URL}/clients", timeout=10)
        clients_after = r.json()
        client_after = next((c for c in clients_after if c['id'] == client['id']), None)
        
        # Box balance should increase by sale_price (1000)
        expected_box_balance = box_balance_before + 1000
        if abs(box_after['balances']['SAR'] - expected_box_balance) > 0.01:
            log_test("Ticket Cash Payment - Box Balance", False, f"Expected {expected_box_balance}, got {box_after['balances']['SAR']}")
            return False
        
        # Supplier balance should increase by cost (800)
        expected_supplier_balance = supplier_balance_before + 800
        if abs(supplier_after['balances']['SAR'] - expected_supplier_balance) > 0.01:
            log_test("Ticket Cash Payment - Supplier Balance", False, f"Expected {expected_supplier_balance}, got {supplier_after['balances']['SAR']}")
            return False
        
        # Client balance should NOT change (no debit on client for cash payment)
        if abs(client_after['balances']['SAR'] - client_balance_before) > 0.01:
            log_test("Ticket Cash Payment - Client Balance", False, f"Client balance should not change, was {client_balance_before}, now {client_after['balances']['SAR']}")
            return False
        
        # Verify journal entry
        r = session.get(f"{BASE_URL}/journal-entries", timeout=10)
        jes = r.json()
        ticket_je = next((je for je in jes if je.get('ref_type') == 'ticket' and je.get('ref_id') == ticket['id']), None)
        
        if not ticket_je:
            log_test("Ticket Cash Payment - Journal Entry", False, "Journal entry not found")
            return False
        
        lines = ticket_je.get('lines', [])
        if len(lines) != 3:
            log_test("Ticket Cash Payment - Journal Entry Lines", False, f"Expected 3 lines, got {len(lines)}")
            return False
        
        # Line 1: Cash box debit 1000 (account 1101)
        box_line = next((l for l in lines if l.get('account_code') == '1101'), None)
        if not box_line or box_line.get('debit') != 1000:
            log_test("Ticket Cash Payment - Journal Entry Box Line", False, f"Box line incorrect: {box_line}")
            return False
        
        # Line 2: Supplier credit 800 (account 2101)
        supplier_line = next((l for l in lines if l.get('account_code') == '2101'), None)
        if not supplier_line or supplier_line.get('credit') != 800:
            log_test("Ticket Cash Payment - Journal Entry Supplier Line", False, f"Supplier line incorrect: {supplier_line}")
            return False
        
        # Line 3: Revenue credit 200 (account 4101)
        revenue_line = next((l for l in lines if l.get('account_code') == '4101'), None)
        if not revenue_line or revenue_line.get('credit') != 200:
            log_test("Ticket Cash Payment - Journal Entry Revenue Line", False, f"Revenue line incorrect: {revenue_line}")
            return False
        
        # Check description includes '(نقد)'
        if '(نقد)' not in ticket_je.get('description', ''):
            log_test("Ticket Cash Payment - Journal Entry Description", False, f"Description should include '(نقد)': {ticket_je.get('description')}")
            return False
        
        log_test("Ticket Cash Payment", True, f"Ticket created with cash payment, box balance +1000, supplier +800, client unchanged, JE correct with '(نقد)'")
        return True
    except Exception as e:
        log_test("Ticket Cash Payment", False, f"Exception: {str(e)}")
        return False

# ============ Test 3: Ticket with payment_method='credit' (default) ============
def test_ticket_credit_payment(session):
    """Test ticket with credit payment method (default behavior)"""
    try:
        # Get client and supplier
        r = session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        client = clients[0] if clients else None
        
        r = session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers = r.json()
        supplier = suppliers[0] if suppliers else None
        
        if not client or not supplier:
            log_test("Ticket Credit Payment", False, "Client or supplier not found")
            return False
        
        # Get initial balances
        client_balance_before = client['balances']['SAR']
        supplier_balance_before = supplier['balances']['SAR']
        
        # Create ticket with credit payment (no box_id)
        ticket_data = {
            "client_id": client['id'],
            "supplier_id": supplier['id'],
            "currency": "SAR",
            "cost": 500,
            "sale_price": 600,
            "payment_method": "credit",
            "pnr": f"CREDIT001-{datetime.now().timestamp()}",
            "passenger_name": "مسافر آجل",
            "date": datetime.now().isoformat()
        }
        
        r = session.post(f"{BASE_URL}/tickets", json=ticket_data, timeout=10)
        if r.status_code != 200:
            log_test("Ticket Credit Payment", False, f"Status {r.status_code}: {r.text}")
            return False
        
        ticket = r.json()
        
        # Verify balances
        r = session.get(f"{BASE_URL}/clients", timeout=10)
        clients_after = r.json()
        client_after = next((c for c in clients_after if c['id'] == client['id']), None)
        
        r = session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers_after = r.json()
        supplier_after = next((s for s in suppliers_after if s['id'] == supplier['id']), None)
        
        # Client balance should increase by 600
        expected_client_balance = client_balance_before + 600
        if abs(client_after['balances']['SAR'] - expected_client_balance) > 0.01:
            log_test("Ticket Credit Payment - Client Balance", False, f"Expected {expected_client_balance}, got {client_after['balances']['SAR']}")
            return False
        
        # Supplier balance should increase by 500
        expected_supplier_balance = supplier_balance_before + 500
        if abs(supplier_after['balances']['SAR'] - expected_supplier_balance) > 0.01:
            log_test("Ticket Credit Payment - Supplier Balance", False, f"Expected {expected_supplier_balance}, got {supplier_after['balances']['SAR']}")
            return False
        
        # Verify journal entry
        r = session.get(f"{BASE_URL}/journal-entries", timeout=10)
        jes = r.json()
        ticket_je = next((je for je in jes if je.get('ref_type') == 'ticket' and je.get('ref_id') == ticket['id']), None)
        
        if not ticket_je:
            log_test("Ticket Credit Payment - Journal Entry", False, "Journal entry not found")
            return False
        
        lines = ticket_je.get('lines', [])
        
        # Line 1: Client debit 600 (account 1301)
        client_line = next((l for l in lines if l.get('account_code') == '1301'), None)
        if not client_line or client_line.get('debit') != 600:
            log_test("Ticket Credit Payment - Journal Entry Client Line", False, f"Client line incorrect: {client_line}")
            return False
        
        # Line 2: Supplier credit 500 (account 2101)
        supplier_line = next((l for l in lines if l.get('account_code') == '2101'), None)
        if not supplier_line or supplier_line.get('credit') != 500:
            log_test("Ticket Credit Payment - Journal Entry Supplier Line", False, f"Supplier line incorrect: {supplier_line}")
            return False
        
        # Line 3: Revenue credit 100 (account 4101)
        revenue_line = next((l for l in lines if l.get('account_code') == '4101'), None)
        if not revenue_line or revenue_line.get('credit') != 100:
            log_test("Ticket Credit Payment - Journal Entry Revenue Line", False, f"Revenue line incorrect: {revenue_line}")
            return False
        
        # Check description includes '(آجل)'
        if '(آجل)' not in ticket_je.get('description', ''):
            log_test("Ticket Credit Payment - Journal Entry Description", False, f"Description should include '(آجل)': {ticket_je.get('description')}")
            return False
        
        log_test("Ticket Credit Payment", True, f"Ticket created with credit payment, client +600, supplier +500, JE correct with '(آجل)'")
        return True
    except Exception as e:
        log_test("Ticket Credit Payment", False, f"Exception: {str(e)}")
        return False

# ============ Test 4: Visa with cash payment ============
def test_visa_cash_payment(session):
    """Test visa with cash payment method"""
    try:
        # Get client, supplier, and cash box
        r = session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        client = clients[0] if clients else None
        
        r = session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers = r.json()
        supplier = suppliers[0] if suppliers else None
        
        r = session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes = r.json()
        cash_box = next((b for b in boxes if b.get('type') == 'cash'), boxes[0])
        
        if not client or not supplier or not cash_box:
            log_test("Visa Cash Payment", False, "Client, supplier, or box not found")
            return False
        
        # Get initial balances
        box_balance_before = cash_box['balances']['SAR']
        supplier_balance_before = supplier['balances']['SAR']
        client_balance_before = client['balances']['SAR']
        
        # Create visa with cash payment
        visa_data = {
            "client_id": client['id'],
            "supplier_id": supplier['id'],
            "currency": "SAR",
            "cost": 300,
            "sale_price": 400,
            "payment_method": "cash",
            "box_id": cash_box['id'],
            "service_type": "تأشيرة عمرة",
            "passenger_name": "معتمر نقدي",
            "passport_no": f"V{datetime.now().timestamp()}",
            "date": datetime.now().isoformat()
        }
        
        r = session.post(f"{BASE_URL}/visas", json=visa_data, timeout=10)
        if r.status_code != 200:
            log_test("Visa Cash Payment", False, f"Status {r.status_code}: {r.text}")
            return False
        
        visa = r.json()
        
        # Verify response fields
        if visa.get('payment_method') != 'cash':
            log_test("Visa Cash Payment", False, f"payment_method incorrect: {visa.get('payment_method')}")
            return False
        
        # Verify balances
        r = session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes_after = r.json()
        box_after = next((b for b in boxes_after if b['id'] == cash_box['id']), None)
        
        r = session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers_after = r.json()
        supplier_after = next((s for s in suppliers_after if s['id'] == supplier['id']), None)
        
        r = session.get(f"{BASE_URL}/clients", timeout=10)
        clients_after = r.json()
        client_after = next((c for c in clients_after if c['id'] == client['id']), None)
        
        # Box balance should increase by 400
        expected_box_balance = box_balance_before + 400
        if abs(box_after['balances']['SAR'] - expected_box_balance) > 0.01:
            log_test("Visa Cash Payment - Box Balance", False, f"Expected {expected_box_balance}, got {box_after['balances']['SAR']}")
            return False
        
        # Supplier balance should increase by 300
        expected_supplier_balance = supplier_balance_before + 300
        if abs(supplier_after['balances']['SAR'] - expected_supplier_balance) > 0.01:
            log_test("Visa Cash Payment - Supplier Balance", False, f"Expected {expected_supplier_balance}, got {supplier_after['balances']['SAR']}")
            return False
        
        # Client balance should NOT change
        if abs(client_after['balances']['SAR'] - client_balance_before) > 0.01:
            log_test("Visa Cash Payment - Client Balance", False, f"Client balance should not change")
            return False
        
        # Verify journal entry uses account 4102 for visa revenue
        r = session.get(f"{BASE_URL}/journal-entries", timeout=10)
        jes = r.json()
        visa_je = next((je for je in jes if je.get('ref_type') == 'visa' and je.get('ref_id') == visa['id']), None)
        
        if not visa_je:
            log_test("Visa Cash Payment - Journal Entry", False, "Journal entry not found")
            return False
        
        lines = visa_je.get('lines', [])
        revenue_line = next((l for l in lines if l.get('account_code') == '4102'), None)
        if not revenue_line or revenue_line.get('credit') != 100:
            log_test("Visa Cash Payment - Journal Entry Revenue Line", False, f"Revenue line (4102) incorrect: {revenue_line}")
            return False
        
        log_test("Visa Cash Payment", True, f"Visa created with cash payment, box +400, supplier +300, client unchanged, revenue account 4102")
        return True
    except Exception as e:
        log_test("Visa Cash Payment", False, f"Exception: {str(e)}")
        return False

# ============ Test 5: Currency Exchange BUY ============
def test_currency_exchange_buy(session):
    """Test currency exchange BUY operation"""
    try:
        # Get two boxes
        r = session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes = r.json()
        if len(boxes) < 2:
            log_test("Currency Exchange BUY", False, "Need at least 2 boxes")
            return False
        
        box1 = boxes[0]  # Will receive USD
        box2 = boxes[1]  # Will pay SAR
        
        # Get initial balances
        box1_usd_before = box1['balances']['USD']
        box2_sar_before = box2['balances']['SAR']
        
        # Create FX BUY transaction
        fx_data = {
            "type": "buy",
            "currency": "USD",
            "amount": 100,
            "exchange_rate": 3.75,
            "counter_currency": "SAR",
            "box_currency_id": box1['id'],
            "box_counter_id": box2['id'],
            "customer_name": "زبون صرافة",
            "customer_phone": "0555123456",
            "id_type": "هوية وطنية",
            "id_number": "1234567890",
            "source_of_funds": "راتب",
            "purpose": "سياحة",
            "remarks": "test buy",
            "date": datetime.now().isoformat()
        }
        
        r = session.post(f"{BASE_URL}/fx", json=fx_data, timeout=10)
        if r.status_code != 200:
            log_test("Currency Exchange BUY", False, f"Status {r.status_code}: {r.text}")
            return False
        
        fx = r.json()
        
        # Verify response fields
        if fx.get('type') != 'buy':
            log_test("Currency Exchange BUY - Type", False, f"type incorrect: {fx.get('type')}")
            return False
        
        if fx.get('amount') != 100:
            log_test("Currency Exchange BUY - Amount", False, f"amount incorrect: {fx.get('amount')}")
            return False
        
        if fx.get('counter_amount') != 375:
            log_test("Currency Exchange BUY - Counter Amount", False, f"counter_amount incorrect: {fx.get('counter_amount')}, expected 375")
            return False
        
        # fx_gain_usd should be computed (100 USD received - 375 SAR paid in USD equivalent)
        # Using rates: USD=1, SAR=0.267 -> 375*0.267=100.125 -> gain = 100-100.125 = -0.125 (loss)
        if 'fx_gain_usd' not in fx:
            log_test("Currency Exchange BUY - FX Gain", False, "fx_gain_usd missing")
            return False
        
        # Should be negative (loss) around -0.125
        if fx['fx_gain_usd'] > 0:
            log_test("Currency Exchange BUY - FX Gain Sign", False, f"fx_gain_usd should be negative (loss), got {fx['fx_gain_usd']}")
            return False
        
        # Verify balances
        r = session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes_after = r.json()
        box1_after = next((b for b in boxes_after if b['id'] == box1['id']), None)
        box2_after = next((b for b in boxes_after if b['id'] == box2['id']), None)
        
        # Box1 USD should increase by 100
        expected_box1_usd = box1_usd_before + 100
        if abs(box1_after['balances']['USD'] - expected_box1_usd) > 0.01:
            log_test("Currency Exchange BUY - Box1 USD Balance", False, f"Expected {expected_box1_usd}, got {box1_after['balances']['USD']}")
            return False
        
        # Box2 SAR should decrease by 375
        expected_box2_sar = box2_sar_before - 375
        if abs(box2_after['balances']['SAR'] - expected_box2_sar) > 0.01:
            log_test("Currency Exchange BUY - Box2 SAR Balance", False, f"Expected {expected_box2_sar}, got {box2_after['balances']['SAR']}")
            return False
        
        # Verify journal entry
        r = session.get(f"{BASE_URL}/journal-entries", timeout=10)
        jes = r.json()
        fx_je = next((je for je in jes if je.get('ref_type') == 'fx_buy' and je.get('ref_id') == fx['id']), None)
        
        if not fx_je:
            log_test("Currency Exchange BUY - Journal Entry", False, "Journal entry not found")
            return False
        
        lines = fx_je.get('lines', [])
        
        # Line 1: Box1 debit 100 USD
        box1_line = next((l for l in lines if l.get('party_id') == box1['id'] and l.get('debit') > 0), None)
        if not box1_line or box1_line.get('currency') != 'USD' or box1_line.get('debit') != 100:
            log_test("Currency Exchange BUY - JE Box1 Line", False, f"Box1 line incorrect: {box1_line}")
            return False
        
        # Line 2: Box2 credit 375 SAR
        box2_line = next((l for l in lines if l.get('party_id') == box2['id'] and l.get('credit') > 0), None)
        if not box2_line or box2_line.get('currency') != 'SAR' or box2_line.get('credit') != 375:
            log_test("Currency Exchange BUY - JE Box2 Line", False, f"Box2 line incorrect: {box2_line}")
            return False
        
        # Line 3: FX loss (4104 debit in USD)
        fx_line = next((l for l in lines if l.get('account_code') == '4104'), None)
        if not fx_line:
            log_test("Currency Exchange BUY - JE FX Line", False, "FX line (4104) not found")
            return False
        
        if fx_line.get('currency') != 'USD':
            log_test("Currency Exchange BUY - JE FX Line Currency", False, f"FX line currency should be USD, got {fx_line.get('currency')}")
            return False
        
        # Should be debit (loss)
        if fx_line.get('debit') <= 0:
            log_test("Currency Exchange BUY - JE FX Line Debit", False, f"FX line should have debit (loss), got debit={fx_line.get('debit')}")
            return False
        
        log_test("Currency Exchange BUY", True, f"FX BUY: 100 USD @ 3.75 SAR, counter_amount=375, fx_gain_usd={fx['fx_gain_usd']}, balances and JE correct")
        return True
    except Exception as e:
        log_test("Currency Exchange BUY", False, f"Exception: {str(e)}")
        return False

# ============ Test 6: Currency Exchange SELL ============
def test_currency_exchange_sell(session):
    """Test currency exchange SELL operation"""
    try:
        # Get two boxes
        r = session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes = r.json()
        if len(boxes) < 2:
            log_test("Currency Exchange SELL", False, "Need at least 2 boxes")
            return False
        
        box1 = boxes[0]  # Will pay USD
        box2 = boxes[1]  # Will receive SAR
        
        # Get initial balances
        box1_usd_before = box1['balances']['USD']
        box2_sar_before = box2['balances']['SAR']
        
        # Create FX SELL transaction
        fx_data = {
            "type": "sell",
            "currency": "USD",
            "amount": 50,
            "exchange_rate": 3.80,
            "counter_currency": "SAR",
            "box_currency_id": box1['id'],
            "box_counter_id": box2['id'],
            "customer_name": "زبون بيع",
            "customer_phone": "0555999999",
            "date": datetime.now().isoformat()
        }
        
        r = session.post(f"{BASE_URL}/fx", json=fx_data, timeout=10)
        if r.status_code != 200:
            log_test("Currency Exchange SELL", False, f"Status {r.status_code}: {r.text}")
            return False
        
        fx = r.json()
        
        # Verify response fields
        if fx.get('type') != 'sell':
            log_test("Currency Exchange SELL - Type", False, f"type incorrect: {fx.get('type')}")
            return False
        
        if fx.get('counter_amount') != 190:
            log_test("Currency Exchange SELL - Counter Amount", False, f"counter_amount incorrect: {fx.get('counter_amount')}, expected 190")
            return False
        
        # fx_gain_usd should be positive (profit)
        # 50 USD paid, 190 SAR received -> 190*0.267=50.73 USD equivalent -> gain = 50.73-50 = +0.73
        if 'fx_gain_usd' not in fx:
            log_test("Currency Exchange SELL - FX Gain", False, "fx_gain_usd missing")
            return False
        
        if fx['fx_gain_usd'] <= 0:
            log_test("Currency Exchange SELL - FX Gain Sign", False, f"fx_gain_usd should be positive (profit), got {fx['fx_gain_usd']}")
            return False
        
        # Verify balances
        r = session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes_after = r.json()
        box1_after = next((b for b in boxes_after if b['id'] == box1['id']), None)
        box2_after = next((b for b in boxes_after if b['id'] == box2['id']), None)
        
        # Box1 USD should decrease by 50
        expected_box1_usd = box1_usd_before - 50
        if abs(box1_after['balances']['USD'] - expected_box1_usd) > 0.01:
            log_test("Currency Exchange SELL - Box1 USD Balance", False, f"Expected {expected_box1_usd}, got {box1_after['balances']['USD']}")
            return False
        
        # Box2 SAR should increase by 190
        expected_box2_sar = box2_sar_before + 190
        if abs(box2_after['balances']['SAR'] - expected_box2_sar) > 0.01:
            log_test("Currency Exchange SELL - Box2 SAR Balance", False, f"Expected {expected_box2_sar}, got {box2_after['balances']['SAR']}")
            return False
        
        # Verify journal entry
        r = session.get(f"{BASE_URL}/journal-entries", timeout=10)
        jes = r.json()
        fx_je = next((je for je in jes if je.get('ref_type') == 'fx_sell' and je.get('ref_id') == fx['id']), None)
        
        if not fx_je:
            log_test("Currency Exchange SELL - Journal Entry", False, "Journal entry not found")
            return False
        
        lines = fx_je.get('lines', [])
        
        # FX gain line (4104 credit in USD)
        fx_line = next((l for l in lines if l.get('account_code') == '4104'), None)
        if not fx_line:
            log_test("Currency Exchange SELL - JE FX Line", False, "FX line (4104) not found")
            return False
        
        # Should be credit (gain)
        if fx_line.get('credit') <= 0:
            log_test("Currency Exchange SELL - JE FX Line Credit", False, f"FX line should have credit (gain), got credit={fx_line.get('credit')}")
            return False
        
        log_test("Currency Exchange SELL", True, f"FX SELL: 50 USD @ 3.80 SAR, counter_amount=190, fx_gain_usd={fx['fx_gain_usd']} (profit), balances and JE correct")
        return True
    except Exception as e:
        log_test("Currency Exchange SELL", False, f"Exception: {str(e)}")
        return False

# ============ Test 7: Currency Exchange Validation Errors ============
def test_currency_exchange_validation(session):
    """Test currency exchange validation errors"""
    try:
        r = session.get(f"{BASE_URL}/boxes", timeout=10)
        boxes = r.json()
        if len(boxes) < 2:
            log_test("Currency Exchange Validation", False, "Need at least 2 boxes")
            return False
        
        # Test 7.1: Same currency both sides
        fx_data = {
            "type": "buy",
            "currency": "USD",
            "amount": 100,
            "exchange_rate": 1.0,
            "counter_currency": "USD",
            "box_currency_id": boxes[0]['id'],
            "box_counter_id": boxes[1]['id']
        }
        
        r = session.post(f"{BASE_URL}/fx", json=fx_data, timeout=10)
        if r.status_code != 400:
            log_test("Currency Exchange Validation - Same Currency", False, f"Expected 400, got {r.status_code}")
            return False
        
        error = r.json().get('error', '')
        if 'مختلفتين' not in error:
            log_test("Currency Exchange Validation - Same Currency Error", False, f"Error message incorrect: {error}")
            return False
        
        log_test("Currency Exchange Validation - Same Currency", True, f"Correctly rejected: {error}")
        
        # Test 7.2: Amount <= 0
        fx_data['counter_currency'] = 'SAR'
        fx_data['amount'] = 0
        
        r = session.post(f"{BASE_URL}/fx", json=fx_data, timeout=10)
        if r.status_code != 400:
            log_test("Currency Exchange Validation - Zero Amount", False, f"Expected 400, got {r.status_code}")
            return False
        
        log_test("Currency Exchange Validation - Zero Amount", True, "Correctly rejected amount <= 0")
        
        # Test 7.3: Invalid type
        fx_data['amount'] = 100
        fx_data['type'] = 'trade'
        
        r = session.post(f"{BASE_URL}/fx", json=fx_data, timeout=10)
        if r.status_code != 400:
            log_test("Currency Exchange Validation - Invalid Type", False, f"Expected 400, got {r.status_code}")
            return False
        
        log_test("Currency Exchange Validation - Invalid Type", True, "Correctly rejected invalid type")
        
        return True
    except Exception as e:
        log_test("Currency Exchange Validation", False, f"Exception: {str(e)}")
        return False

# ============ Test 8: Manual Journal - Single Currency ============
def test_manual_journal_single_currency(session):
    """Test manual journal entry with single currency"""
    try:
        # Get supplier
        r = session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers = r.json()
        if not suppliers:
            log_test("Manual Journal Single Currency", False, "No suppliers found")
            return False
        supplier = suppliers[0]
        
        # Get initial supplier balance
        supplier_balance_before = supplier['balances']['USD']
        
        # Create manual journal entry
        je_data = {
            "date": datetime.now().isoformat(),
            "currency": "USD",
            "description": "قيد تسوية",
            "lines": [
                {
                    "account_code": "1101",
                    "account_name": "صندوق دولار",
                    "debit": 100,
                    "credit": 0
                },
                {
                    "account_code": "2101",
                    "account_name": "مورد",
                    "party_type": "supplier",
                    "party_id": supplier['id'],
                    "debit": 0,
                    "credit": 100
                }
            ]
        }
        
        r = session.post(f"{BASE_URL}/journal-entries", json=je_data, timeout=10)
        if r.status_code != 200:
            log_test("Manual Journal Single Currency", False, f"Status {r.status_code}: {r.text}")
            return False
        
        je = r.json()
        
        # Verify journal entry created
        if not je.get('id'):
            log_test("Manual Journal Single Currency", False, "Journal entry ID missing")
            return False
        
        # Verify supplier balance decreased by 100 (credit reduces liability)
        r = session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers_after = r.json()
        supplier_after = next((s for s in suppliers_after if s['id'] == supplier['id']), None)
        
        expected_balance = supplier_balance_before - 100
        if abs(supplier_after['balances']['USD'] - expected_balance) > 0.01:
            log_test("Manual Journal Single Currency - Supplier Balance", False, f"Expected {expected_balance}, got {supplier_after['balances']['USD']}")
            return False
        
        log_test("Manual Journal Single Currency", True, f"Manual JE created, supplier balance updated correctly")
        
        # Test 8.2: Unbalanced journal entry (should fail)
        je_data_unbalanced = {
            "date": datetime.now().isoformat(),
            "currency": "USD",
            "description": "قيد غير متوازن",
            "lines": [
                {"account_code": "1101", "account_name": "صندوق", "debit": 100, "credit": 0},
                {"account_code": "2101", "account_name": "مورد", "debit": 0, "credit": 50}
            ]
        }
        
        r = session.post(f"{BASE_URL}/journal-entries", json=je_data_unbalanced, timeout=10)
        if r.status_code != 400:
            log_test("Manual Journal Single Currency - Unbalanced", False, f"Expected 400, got {r.status_code}")
            return False
        
        error = r.json().get('error', '')
        if 'غير متوازن' not in error:
            log_test("Manual Journal Single Currency - Unbalanced Error", False, f"Error message incorrect: {error}")
            return False
        
        log_test("Manual Journal Single Currency - Unbalanced", True, f"Correctly rejected unbalanced entry: {error}")
        
        return True
    except Exception as e:
        log_test("Manual Journal Single Currency", False, f"Exception: {str(e)}")
        return False

# ============ Test 9: Manual Journal - DUAL Currency ============
def test_manual_journal_dual_currency(session):
    """Test manual journal entry with dual currency (currency exchange manual)"""
    try:
        # Create dual currency journal entry
        je_data = {
            "dual": True,
            "date": datetime.now().isoformat(),
            "description": "مصارفة يدوية",
            "debit_account_code": "1101",
            "debit_account_name": "صندوق دولار",
            "debit_currency": "USD",
            "debit_amount": 100,
            "credit_account_code": "1102",
            "credit_account_name": "صندوق سعودي",
            "credit_currency": "SAR",
            "credit_amount": 375
        }
        
        r = session.post(f"{BASE_URL}/journal-entries", json=je_data, timeout=10)
        if r.status_code != 200:
            log_test("Manual Journal Dual Currency", False, f"Status {r.status_code}: {r.text}")
            return False
        
        je = r.json()
        
        # Verify response includes fx_diff_usd
        if 'fx_diff_usd' not in je:
            log_test("Manual Journal Dual Currency - FX Diff", False, "fx_diff_usd missing")
            return False
        
        # Verify lines array
        lines = je.get('lines', [])
        if len(lines) < 3:
            log_test("Manual Journal Dual Currency - Lines Count", False, f"Expected at least 3 lines, got {len(lines)}")
            return False
        
        # Line 1: USD debit 100
        usd_line = next((l for l in lines if l.get('currency') == 'USD' and l.get('debit') == 100), None)
        if not usd_line:
            log_test("Manual Journal Dual Currency - USD Line", False, "USD debit line not found")
            return False
        
        # Line 2: SAR credit 375
        sar_line = next((l for l in lines if l.get('currency') == 'SAR' and l.get('credit') == 375), None)
        if not sar_line:
            log_test("Manual Journal Dual Currency - SAR Line", False, "SAR credit line not found")
            return False
        
        # Line 3: FX diff (4104) in USD
        fx_line = next((l for l in lines if l.get('account_code') == '4104'), None)
        if not fx_line:
            log_test("Manual Journal Dual Currency - FX Line", False, "FX line (4104) not found")
            return False
        
        if fx_line.get('currency') != 'USD':
            log_test("Manual Journal Dual Currency - FX Line Currency", False, f"FX line currency should be USD, got {fx_line.get('currency')}")
            return False
        
        # Should be debit (loss) because 100 USD debit vs 375*0.267=100.125 USD equivalent credit
        if fx_line.get('debit') <= 0:
            log_test("Manual Journal Dual Currency - FX Line Debit", False, f"FX line should have debit (loss), got debit={fx_line.get('debit')}")
            return False
        
        log_test("Manual Journal Dual Currency", True, f"Dual currency JE created, fx_diff_usd={je['fx_diff_usd']}, 3 lines with USD/SAR/FX")
        return True
    except Exception as e:
        log_test("Manual Journal Dual Currency", False, f"Exception: {str(e)}")
        return False

# ============ Test 10: Income Statement includes fx_gain_usd ============
def test_income_statement_fx_gain(session):
    """Test that income statement includes fx_gain_usd"""
    try:
        r = session.get(f"{BASE_URL}/reports/income-statement?from=2020-01-01&to=2030-01-01", timeout=10)
        if r.status_code != 200:
            log_test("Income Statement FX Gain", False, f"Status {r.status_code}: {r.text}")
            return False
        
        report = r.json()
        
        # Verify fx_gain_usd field exists
        if 'fx_gain_usd' not in report:
            log_test("Income Statement FX Gain", False, "fx_gain_usd field missing")
            return False
        
        # Verify net_profit_usd incorporates fx_gain_usd
        if 'net_profit_usd' not in report:
            log_test("Income Statement FX Gain - Net Profit", False, "net_profit_usd field missing")
            return False
        
        # Verify total_revenue_usd exists
        if 'total_revenue_usd' not in report:
            log_test("Income Statement FX Gain - Total Revenue", False, "total_revenue_usd field missing")
            return False
        
        log_test("Income Statement FX Gain", True, f"Income statement includes fx_gain_usd={report['fx_gain_usd']}, net_profit_usd={report['net_profit_usd']}")
        return True
    except Exception as e:
        log_test("Income Statement FX Gain", False, f"Exception: {str(e)}")
        return False

# ============ Test 11: Trial Balance supports per-line currency ============
def test_trial_balance_per_line_currency(session):
    """Test that trial balance supports per-line currency"""
    try:
        r = session.get(f"{BASE_URL}/reports/trial-balance", timeout=10)
        if r.status_code != 200:
            log_test("Trial Balance Per-Line Currency", False, f"Status {r.status_code}: {r.text}")
            return False
        
        report = r.json()
        
        # Verify rows exist
        rows = report.get('rows', [])
        if not rows:
            log_test("Trial Balance Per-Line Currency", False, "No rows in trial balance")
            return False
        
        # Check if rows have currency field
        has_currency = any('currency' in row for row in rows)
        if not has_currency:
            log_test("Trial Balance Per-Line Currency", False, "Rows missing currency field")
            return False
        
        # Check if we have entries with different currencies (USD and SAR from our tests)
        currencies = set(row.get('currency') for row in rows if 'currency' in row)
        if len(currencies) < 2:
            log_test("Trial Balance Per-Line Currency", False, f"Expected multiple currencies, got {currencies}")
            return False
        
        # Verify totals per currency
        totals = report.get('totals', {})
        if not totals:
            log_test("Trial Balance Per-Line Currency - Totals", False, "Totals missing")
            return False
        
        # Check if totals are balanced per currency (debit == credit within tolerance)
        for currency, values in totals.items():
            if isinstance(values, dict):
                debit = values.get('d', 0)
                credit = values.get('c', 0)
                if abs(debit - credit) > 0.01:
                    log_test("Trial Balance Per-Line Currency - Balance", False, f"{currency}: debit={debit} != credit={credit}")
                    return False
        
        log_test("Trial Balance Per-Line Currency", True, f"Trial balance has per-line currency, {len(currencies)} currencies found, all balanced")
        return True
    except Exception as e:
        log_test("Trial Balance Per-Line Currency", False, f"Exception: {str(e)}")
        return False

# ============ Test 12: Ticket cash payment missing box_id error ============
def test_ticket_cash_missing_box_id(session):
    """Test that ticket with cash payment but missing box_id returns error"""
    try:
        # Get client and supplier
        r = session.get(f"{BASE_URL}/clients", timeout=10)
        clients = r.json()
        client = clients[0] if clients else None
        
        r = session.get(f"{BASE_URL}/suppliers", timeout=10)
        suppliers = r.json()
        supplier = suppliers[0] if suppliers else None
        
        if not client or not supplier:
            log_test("Ticket Cash Missing Box ID", False, "Client or supplier not found")
            return False
        
        # Create ticket with cash payment but no box_id
        ticket_data = {
            "client_id": client['id'],
            "supplier_id": supplier['id'],
            "currency": "SAR",
            "cost": 500,
            "sale_price": 600,
            "payment_method": "cash",
            # box_id is missing
            "pnr": f"NOBOX-{datetime.now().timestamp()}",
            "passenger_name": "مسافر بدون صندوق",
            "date": datetime.now().isoformat()
        }
        
        r = session.post(f"{BASE_URL}/tickets", json=ticket_data, timeout=10)
        if r.status_code != 400:
            log_test("Ticket Cash Missing Box ID", False, f"Expected 400, got {r.status_code}")
            return False
        
        error = r.json().get('error', '')
        if 'الصندوق' not in error:
            log_test("Ticket Cash Missing Box ID - Error Message", False, f"Error message incorrect: {error}")
            return False
        
        log_test("Ticket Cash Missing Box ID", True, f"Correctly rejected: {error}")
        return True
    except Exception as e:
        log_test("Ticket Cash Missing Box ID", False, f"Exception: {str(e)}")
        return False

# ============ Main Test Runner ============
def main():
    print("="*80)
    print("Rahaal ERP v2.1 Backend Test Suite")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    print()
    
    # Login as demo owner
    session = requests.Session()
    try:
        r = session.post(f"{BASE_URL}/auth/login", json={
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }, timeout=10)
        
        if r.status_code != 200:
            print(f"❌ Login failed: {r.status_code} - {r.text}")
            return
        
        print("✅ Logged in as owner@demo.com")
        print()
    except Exception as e:
        print(f"❌ Login exception: {str(e)}")
        return
    
    # Run tests
    test_fx_account_seeded(session)
    test_ticket_cash_payment(session)
    test_ticket_credit_payment(session)
    test_visa_cash_payment(session)
    test_currency_exchange_buy(session)
    test_currency_exchange_sell(session)
    test_currency_exchange_validation(session)
    test_manual_journal_single_currency(session)
    test_manual_journal_dual_currency(session)
    test_income_statement_fx_gain(session)
    test_trial_balance_per_line_currency(session)
    test_ticket_cash_missing_box_id(session)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
