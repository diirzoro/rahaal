#!/usr/bin/env python3
"""
Comprehensive backend test for Rahaal Travel Office ERP
Tests all API endpoints and flows as specified in the review request
"""

import requests
import json
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/.env')

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://visa-booking-5.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

print(f"Testing API at: {API_BASE}")
print("=" * 80)

# Store IDs for cross-test usage
test_data = {
    'client_id': None,
    'supplier_id': None,
    'box_cash_id': None,
    'box_bank_id': None,
    'ticket_id': None,
    'visa_id': None,
}

def test_health_and_seeding():
    """Test 1: Health & seeding"""
    print("\n### TEST 1: Health & Seeding ###")
    
    try:
        # Test root endpoint
        print("Testing GET /api/root...")
        resp = requests.get(f"{API_BASE}/root", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert data.get('ok') == True, "Expected ok: true"
        print("✅ GET /api/root -> { ok: true }")
        
        # Test rates endpoint
        print("\nTesting GET /api/rates...")
        resp = requests.get(f"{API_BASE}/rates", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        rates = data.get('rates', {})
        assert 'USD' in rates and 'SAR' in rates and 'YER' in rates, "Missing currency rates"
        print(f"✅ GET /api/rates -> {rates}")
        
        # Test accounts endpoint
        print("\nTesting GET /api/accounts...")
        resp = requests.get(f"{API_BASE}/accounts", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        accounts = resp.json()
        assert isinstance(accounts, list) and len(accounts) > 0, "Expected non-empty array"
        codes = [acc.get('code') for acc in accounts]
        required_codes = ['1', '11', '1101', '1301', '2101', '4101', '4102', '4103', '5101']
        for code in required_codes:
            assert code in codes, f"Missing account code {code}"
        print(f"✅ GET /api/accounts -> {len(accounts)} accounts with required codes")
        
        # Test boxes endpoint
        print("\nTesting GET /api/boxes...")
        resp = requests.get(f"{API_BASE}/boxes", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        boxes = resp.json()
        assert isinstance(boxes, list) and len(boxes) >= 2, "Expected at least 2 boxes"
        for box in boxes:
            balances = box.get('balances', {})
            assert balances.get('USD') == 0 and balances.get('SAR') == 0 and balances.get('YER') == 0, "Expected zero balances"
            if box.get('type') == 'cash':
                test_data['box_cash_id'] = box.get('id')
            elif box.get('type') == 'bank':
                test_data['box_bank_id'] = box.get('id')
        print(f"✅ GET /api/boxes -> {len(boxes)} boxes with zero balances")
        print(f"   Cash box ID: {test_data['box_cash_id']}")
        print(f"   Bank box ID: {test_data['box_bank_id']}")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_clients_and_suppliers():
    """Test 2: Clients & Suppliers"""
    print("\n### TEST 2: Clients & Suppliers ###")
    
    try:
        # Create client
        print("Testing POST /api/clients...")
        client_data = {"name": "عميل تجريبي", "phone": "123456789"}
        resp = requests.post(f"{API_BASE}/clients", json=client_data, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        client = resp.json()
        assert 'id' in client, "Missing client id"
        test_data['client_id'] = client['id']
        balances = client.get('balances', {})
        assert balances.get('USD') == 0 and balances.get('SAR') == 0 and balances.get('YER') == 0, "Expected zero balances"
        print(f"✅ POST /api/clients -> created with id: {client['id']}")
        
        # Create supplier
        print("\nTesting POST /api/suppliers...")
        supplier_data = {"name": "مورد تجريبي", "phone": "987654321"}
        resp = requests.post(f"{API_BASE}/suppliers", json=supplier_data, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        supplier = resp.json()
        assert 'id' in supplier, "Missing supplier id"
        test_data['supplier_id'] = supplier['id']
        balances = supplier.get('balances', {})
        assert balances.get('USD') == 0 and balances.get('SAR') == 0 and balances.get('YER') == 0, "Expected zero balances"
        print(f"✅ POST /api/suppliers -> created with id: {supplier['id']}")
        
        # Get clients
        print("\nTesting GET /api/clients...")
        resp = requests.get(f"{API_BASE}/clients", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        clients = resp.json()
        assert any(c['id'] == test_data['client_id'] for c in clients), "Created client not found"
        print(f"✅ GET /api/clients -> includes created client")
        
        # Get suppliers
        print("\nTesting GET /api/suppliers...")
        resp = requests.get(f"{API_BASE}/suppliers", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        suppliers = resp.json()
        assert any(s['id'] == test_data['supplier_id'] for s in suppliers), "Created supplier not found"
        print(f"✅ GET /api/suppliers -> includes created supplier")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_ticket_booking():
    """Test 3: Ticket booking (aha moment)"""
    print("\n### TEST 3: Ticket Booking ###")
    
    try:
        # Create ticket with SAR
        print("Testing POST /api/tickets (SAR)...")
        ticket_data = {
            "client_id": test_data['client_id'],
            "supplier_id": test_data['supplier_id'],
            "currency": "SAR",
            "cost": 1000,
            "sale_price": 1200,
            "pnr": "ABC123",
            "route": "RUH-JED",
            "passenger_name": "محمد أحمد"
        }
        resp = requests.post(f"{API_BASE}/tickets", json=ticket_data, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        ticket = resp.json()
        assert 'id' in ticket, "Missing ticket id"
        test_data['ticket_id'] = ticket['id']
        assert ticket.get('commission') == 200, f"Expected commission 200, got {ticket.get('commission')}"
        assert ticket.get('client_name') == "عميل تجريبي", "Missing client_name"
        assert ticket.get('supplier_name') == "مورد تجريبي", "Missing supplier_name"
        print(f"✅ POST /api/tickets (SAR) -> commission: {ticket['commission']}")
        
        # Verify client balance
        print("\nVerifying client balance...")
        resp = requests.get(f"{API_BASE}/clients", timeout=10)
        clients = resp.json()
        client = next((c for c in clients if c['id'] == test_data['client_id']), None)
        assert client is not None, "Client not found"
        assert client['balances']['SAR'] == 1200, f"Expected client SAR balance 1200, got {client['balances']['SAR']}"
        print(f"✅ Client SAR balance: {client['balances']['SAR']}")
        
        # Verify supplier balance
        print("\nVerifying supplier balance...")
        resp = requests.get(f"{API_BASE}/suppliers", timeout=10)
        suppliers = resp.json()
        supplier = next((s for s in suppliers if s['id'] == test_data['supplier_id']), None)
        assert supplier is not None, "Supplier not found"
        assert supplier['balances']['SAR'] == 1000, f"Expected supplier SAR balance 1000, got {supplier['balances']['SAR']}"
        print(f"✅ Supplier SAR balance: {supplier['balances']['SAR']}")
        
        # Verify journal entry
        print("\nVerifying journal entry...")
        resp = requests.get(f"{API_BASE}/journal-entries", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        jes = resp.json()
        ticket_je = next((je for je in jes if je.get('ref_type') == 'ticket' and je.get('ref_id') == test_data['ticket_id']), None)
        assert ticket_je is not None, "Ticket journal entry not found"
        assert ticket_je.get('currency') == 'SAR', "Wrong currency in JE"
        lines = ticket_je.get('lines', [])
        assert len(lines) == 3, f"Expected 3 lines, got {len(lines)}"
        
        # Verify line 1: 1301 debit 1200
        line1 = next((l for l in lines if l.get('account_code') == '1301'), None)
        assert line1 is not None, "Missing 1301 line"
        assert line1.get('debit') == 1200, f"Expected debit 1200, got {line1.get('debit')}"
        assert line1.get('credit') == 0, f"Expected credit 0, got {line1.get('credit')}"
        
        # Verify line 2: 2101 credit 1000
        line2 = next((l for l in lines if l.get('account_code') == '2101'), None)
        assert line2 is not None, "Missing 2101 line"
        assert line2.get('debit') == 0, f"Expected debit 0, got {line2.get('debit')}"
        assert line2.get('credit') == 1000, f"Expected credit 1000, got {line2.get('credit')}"
        
        # Verify line 3: 4101 credit 200
        line3 = next((l for l in lines if l.get('account_code') == '4101'), None)
        assert line3 is not None, "Missing 4101 line"
        assert line3.get('debit') == 0, f"Expected debit 0, got {line3.get('debit')}"
        assert line3.get('credit') == 200, f"Expected credit 200, got {line3.get('credit')}"
        
        # Verify balanced
        total_debit = sum(l.get('debit', 0) for l in lines)
        total_credit = sum(l.get('credit', 0) for l in lines)
        assert total_debit == total_credit == 1200, f"JE not balanced: debit={total_debit}, credit={total_credit}"
        print(f"✅ Journal entry verified: 3 lines, balanced (debit=credit=1200)")
        
        # Test with USD
        print("\nTesting POST /api/tickets (USD)...")
        ticket_data_usd = {
            "client_id": test_data['client_id'],
            "supplier_id": test_data['supplier_id'],
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "pnr": "XYZ789",
            "route": "JED-CAI",
            "passenger_name": "علي حسن"
        }
        resp = requests.post(f"{API_BASE}/tickets", json=ticket_data_usd, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        ticket_usd = resp.json()
        assert ticket_usd.get('commission') == 50, f"Expected commission 50, got {ticket_usd.get('commission')}"
        print(f"✅ POST /api/tickets (USD) -> commission: {ticket_usd['commission']}")
        
        # Verify balances are per currency
        print("\nVerifying multi-currency balances...")
        resp = requests.get(f"{API_BASE}/clients", timeout=10)
        clients = resp.json()
        client = next((c for c in clients if c['id'] == test_data['client_id']), None)
        assert client['balances']['SAR'] == 1200, "SAR balance changed incorrectly"
        assert client['balances']['USD'] == 150, f"Expected USD balance 150, got {client['balances']['USD']}"
        print(f"✅ Client balances: SAR={client['balances']['SAR']}, USD={client['balances']['USD']}")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_visa_booking():
    """Test 4: Visa booking"""
    print("\n### TEST 4: Visa Booking ###")
    
    try:
        print("Testing POST /api/visas...")
        visa_data = {
            "client_id": test_data['client_id'],
            "supplier_id": test_data['supplier_id'],
            "service_type": "تأشيرة عمرة",
            "currency": "SAR",
            "cost": 300,
            "sale_price": 400,
            "passenger_name": "فاطمة محمد"
        }
        resp = requests.post(f"{API_BASE}/visas", json=visa_data, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        visa = resp.json()
        assert 'id' in visa, "Missing visa id"
        test_data['visa_id'] = visa['id']
        assert visa.get('commission') == 100, f"Expected commission 100, got {visa.get('commission')}"
        print(f"✅ POST /api/visas -> commission: {visa['commission']}")
        
        # Verify journal entry
        print("\nVerifying visa journal entry...")
        resp = requests.get(f"{API_BASE}/journal-entries", timeout=10)
        jes = resp.json()
        visa_je = next((je for je in jes if je.get('ref_type') == 'visa' and je.get('ref_id') == test_data['visa_id']), None)
        assert visa_je is not None, "Visa journal entry not found"
        lines = visa_je.get('lines', [])
        
        # Verify 4102 revenue account
        revenue_line = next((l for l in lines if l.get('account_code') == '4102'), None)
        assert revenue_line is not None, "Missing 4102 revenue line"
        assert revenue_line.get('credit') == 100, f"Expected credit 100, got {revenue_line.get('credit')}"
        
        # Verify 1301 debit 400
        client_line = next((l for l in lines if l.get('account_code') == '1301'), None)
        assert client_line is not None, "Missing 1301 line"
        assert client_line.get('debit') == 400, f"Expected debit 400, got {client_line.get('debit')}"
        
        # Verify 2101 credit 300
        supplier_line = next((l for l in lines if l.get('account_code') == '2101'), None)
        assert supplier_line is not None, "Missing 2101 line"
        assert supplier_line.get('credit') == 300, f"Expected credit 300, got {supplier_line.get('credit')}"
        
        print(f"✅ Visa JE verified: 4102 credit 100, 1301 debit 400, 2101 credit 300")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_receipt_voucher():
    """Test 5: Receipt voucher (customer pays us)"""
    print("\n### TEST 5: Receipt Voucher ###")
    
    try:
        print("Testing POST /api/vouchers (receipt)...")
        receipt_data = {
            "type": "receipt",
            "currency": "SAR",
            "amount": 500,
            "party_type": "client",
            "party_id": test_data['client_id'],
            "box_id": test_data['box_cash_id'],
            "description": "دفعة أولى"
        }
        resp = requests.post(f"{API_BASE}/vouchers", json=receipt_data, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        receipt = resp.json()
        assert 'id' in receipt, "Missing receipt id"
        print(f"✅ POST /api/vouchers (receipt) -> created")
        
        # Verify client balance reduced
        print("\nVerifying client balance reduced...")
        resp = requests.get(f"{API_BASE}/clients", timeout=10)
        clients = resp.json()
        client = next((c for c in clients if c['id'] == test_data['client_id']), None)
        # Client had 1200 SAR from ticket + 400 SAR from visa = 1600, now -500 = 1100
        expected_balance = 1600 - 500
        assert client['balances']['SAR'] == expected_balance, f"Expected client SAR balance {expected_balance}, got {client['balances']['SAR']}"
        print(f"✅ Client SAR balance: {client['balances']['SAR']} (reduced by 500)")
        
        # Verify box balance increased
        print("\nVerifying box balance increased...")
        resp = requests.get(f"{API_BASE}/boxes", timeout=10)
        boxes = resp.json()
        cash_box = next((b for b in boxes if b['id'] == test_data['box_cash_id']), None)
        assert cash_box['balances']['SAR'] == 500, f"Expected box SAR balance 500, got {cash_box['balances']['SAR']}"
        print(f"✅ Cash box SAR balance: {cash_box['balances']['SAR']}")
        
        # Verify journal entry
        print("\nVerifying receipt journal entry...")
        resp = requests.get(f"{API_BASE}/journal-entries", timeout=10)
        jes = resp.json()
        receipt_je = next((je for je in jes if je.get('ref_type') == 'receipt' and je.get('ref_id') == receipt['id']), None)
        assert receipt_je is not None, "Receipt journal entry not found"
        lines = receipt_je.get('lines', [])
        assert len(lines) == 2, f"Expected 2 lines, got {len(lines)}"
        
        # Verify balanced
        total_debit = sum(l.get('debit', 0) for l in lines)
        total_credit = sum(l.get('credit', 0) for l in lines)
        assert total_debit == total_credit == 500, f"JE not balanced: debit={total_debit}, credit={total_credit}"
        
        # Box account debit 500
        box_line = next((l for l in lines if l.get('party_type') == 'box'), None)
        assert box_line is not None, "Missing box line"
        assert box_line.get('debit') == 500, f"Expected box debit 500, got {box_line.get('debit')}"
        
        # 1301 credit 500
        client_line = next((l for l in lines if l.get('account_code') == '1301'), None)
        assert client_line is not None, "Missing 1301 line"
        assert client_line.get('credit') == 500, f"Expected credit 500, got {client_line.get('credit')}"
        
        print(f"✅ Receipt JE verified: 2 lines balanced (box debit 500, 1301 credit 500)")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_payment_voucher():
    """Test 6: Payment voucher (we pay supplier)"""
    print("\n### TEST 6: Payment Voucher (Supplier) ###")
    
    try:
        print("Testing POST /api/vouchers (payment to supplier)...")
        payment_data = {
            "type": "payment",
            "currency": "SAR",
            "amount": 700,
            "party_type": "supplier",
            "party_id": test_data['supplier_id'],
            "box_id": test_data['box_cash_id'],
            "description": "دفعة للمورد"
        }
        resp = requests.post(f"{API_BASE}/vouchers", json=payment_data, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        payment = resp.json()
        assert 'id' in payment, "Missing payment id"
        print(f"✅ POST /api/vouchers (payment) -> created")
        
        # Verify supplier balance reduced
        print("\nVerifying supplier balance reduced...")
        resp = requests.get(f"{API_BASE}/suppliers", timeout=10)
        suppliers = resp.json()
        supplier = next((s for s in suppliers if s['id'] == test_data['supplier_id']), None)
        # Supplier had 1000 SAR from ticket + 300 SAR from visa = 1300, now -700 = 600
        expected_balance = 1300 - 700
        assert supplier['balances']['SAR'] == expected_balance, f"Expected supplier SAR balance {expected_balance}, got {supplier['balances']['SAR']}"
        print(f"✅ Supplier SAR balance: {supplier['balances']['SAR']} (reduced by 700)")
        
        # Verify box balance decreased
        print("\nVerifying box balance decreased...")
        resp = requests.get(f"{API_BASE}/boxes", timeout=10)
        boxes = resp.json()
        cash_box = next((b for b in boxes if b['id'] == test_data['box_cash_id']), None)
        # Box had 500, now -700 = -200
        expected_box_balance = 500 - 700
        assert cash_box['balances']['SAR'] == expected_box_balance, f"Expected box SAR balance {expected_box_balance}, got {cash_box['balances']['SAR']}"
        print(f"✅ Cash box SAR balance: {cash_box['balances']['SAR']}")
        
        # Verify journal entry
        print("\nVerifying payment journal entry...")
        resp = requests.get(f"{API_BASE}/journal-entries", timeout=10)
        jes = resp.json()
        payment_je = next((je for je in jes if je.get('ref_type') == 'payment' and je.get('ref_id') == payment['id']), None)
        assert payment_je is not None, "Payment journal entry not found"
        lines = payment_je.get('lines', [])
        assert len(lines) == 2, f"Expected 2 lines, got {len(lines)}"
        
        # 2101 debit 700
        supplier_line = next((l for l in lines if l.get('account_code') == '2101'), None)
        assert supplier_line is not None, "Missing 2101 line"
        assert supplier_line.get('debit') == 700, f"Expected debit 700, got {supplier_line.get('debit')}"
        
        # Box credit 700
        box_line = next((l for l in lines if l.get('party_type') == 'box'), None)
        assert box_line is not None, "Missing box line"
        assert box_line.get('credit') == 700, f"Expected box credit 700, got {box_line.get('credit')}"
        
        print(f"✅ Payment JE verified: 2101 debit 700, box credit 700")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_payment_voucher_expense():
    """Test 7: Payment voucher for expense (no party_id, needs party_name)"""
    print("\n### TEST 7: Payment Voucher (Expense) ###")
    
    try:
        print("Testing POST /api/vouchers (payment for expense)...")
        expense_data = {
            "type": "payment",
            "currency": "USD",
            "amount": 50,
            "party_type": "expense",
            "party_name": "إيجار مكتب",
            "box_id": test_data['box_bank_id'],
            "description": "إيجار شهر يناير"
        }
        resp = requests.post(f"{API_BASE}/vouchers", json=expense_data, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        expense = resp.json()
        assert 'id' in expense, "Missing expense id"
        print(f"✅ POST /api/vouchers (expense) -> created")
        
        # Verify box USD reduced
        print("\nVerifying box USD balance reduced...")
        resp = requests.get(f"{API_BASE}/boxes", timeout=10)
        boxes = resp.json()
        bank_box = next((b for b in boxes if b['id'] == test_data['box_bank_id']), None)
        assert bank_box['balances']['USD'] == -50, f"Expected box USD balance -50, got {bank_box['balances']['USD']}"
        print(f"✅ Bank box USD balance: {bank_box['balances']['USD']}")
        
        # Verify journal entry
        print("\nVerifying expense journal entry...")
        resp = requests.get(f"{API_BASE}/journal-entries", timeout=10)
        jes = resp.json()
        expense_je = next((je for je in jes if je.get('ref_type') == 'payment' and je.get('ref_id') == expense['id']), None)
        assert expense_je is not None, "Expense journal entry not found"
        lines = expense_je.get('lines', [])
        
        # 5101 debit 50
        expense_line = next((l for l in lines if l.get('account_code') == '5101'), None)
        assert expense_line is not None, "Missing 5101 line"
        assert expense_line.get('debit') == 50, f"Expected debit 50, got {expense_line.get('debit')}"
        
        # Box credit 50
        box_line = next((l for l in lines if l.get('party_type') == 'box'), None)
        assert box_line is not None, "Missing box line"
        assert box_line.get('credit') == 50, f"Expected box credit 50, got {box_line.get('credit')}"
        
        print(f"✅ Expense JE verified: 5101 debit 50, box credit 50")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_dashboard():
    """Test 8: Dashboard"""
    print("\n### TEST 8: Dashboard ###")
    
    try:
        print("Testing GET /api/dashboard...")
        resp = requests.get(f"{API_BASE}/dashboard", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        # Verify KPI structure
        print("\nVerifying KPI structure...")
        assert 'kpi' in data, "Missing kpi"
        kpi = data['kpi']
        assert 'sales_today' in kpi, "Missing sales_today"
        assert 'profit_today' in kpi, "Missing profit_today"
        assert 'count_today' in kpi, "Missing count_today"
        assert 'tickets_today' in kpi, "Missing tickets_today"
        assert 'visas_today' in kpi, "Missing visas_today"
        
        sales_today = kpi['sales_today']
        profit_today = kpi['profit_today']
        assert 'USD' in sales_today and 'SAR' in sales_today and 'YER' in sales_today, "Missing currencies in sales_today"
        assert 'USD' in profit_today and 'SAR' in profit_today and 'YER' in profit_today, "Missing currencies in profit_today"
        print(f"✅ KPI structure verified")
        print(f"   Sales today: {sales_today}")
        print(f"   Profit today: {profit_today}")
        print(f"   Count today: {kpi['count_today']}")
        
        # Verify line chart (30 days)
        print("\nVerifying line chart...")
        assert 'line' in data, "Missing line"
        line = data['line']
        assert isinstance(line, list), "Line should be array"
        assert len(line) == 30, f"Expected 30 items, got {len(line)}"
        for item in line:
            assert 'date' in item and 'sales' in item and 'profit' in item, "Missing fields in line item"
        print(f"✅ Line chart verified: 30 items with date, sales, profit")
        
        # Verify pie chart
        print("\nVerifying pie chart...")
        assert 'pie' in data, "Missing pie"
        pie = data['pie']
        assert isinstance(pie, list), "Pie should be array"
        for item in pie:
            assert 'name' in item and 'value' in item, "Missing fields in pie item"
        # Should include tickets and visas
        names = [item['name'] for item in pie]
        assert 'تذاكر' in names or 'تأشيرات عمرة' in names, "Missing service types in pie"
        print(f"✅ Pie chart verified: {len(pie)} items")
        print(f"   Services: {names}")
        
        # Verify activity feed
        print("\nVerifying activity feed...")
        assert 'activity' in data, "Missing activity"
        activity = data['activity']
        assert isinstance(activity, list), "Activity should be array"
        for item in activity:
            assert 'kind' in item, "Missing kind in activity item"
            assert item['kind'] in ['ticket', 'visa', 'receipt', 'payment'], f"Invalid kind: {item['kind']}"
        print(f"✅ Activity feed verified: {len(activity)} items")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_reports():
    """Test 9: Reports"""
    print("\n### TEST 9: Reports ###")
    
    try:
        # Test profits report
        print("Testing GET /api/reports/profits...")
        today = datetime.now().strftime('%Y-%m-%d')
        thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        resp = requests.get(f"{API_BASE}/reports/profits?from={thirty_days_ago}&to={today}", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        profits = resp.json()
        assert 'rows' in profits, "Missing rows"
        assert 'totals_profit' in profits, "Missing totals_profit"
        assert isinstance(profits['rows'], list), "Rows should be array"
        totals = profits['totals_profit']
        assert 'USD' in totals and 'SAR' in totals and 'YER' in totals, "Missing currencies in totals"
        print(f"✅ Profits report verified: {len(profits['rows'])} rows")
        print(f"   Totals profit: {totals}")
        
        # Test statement report
        print("\nTesting GET /api/reports/statement...")
        resp = requests.get(f"{API_BASE}/reports/statement?party_type=client&party_id={test_data['client_id']}", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        statement = resp.json()
        assert 'party' in statement, "Missing party"
        assert 'rows' in statement, "Missing rows"
        party = statement['party']
        assert party is not None, "Party should not be null"
        assert 'id' in party and 'name' in party and 'balances' in party, "Missing party fields"
        rows = statement['rows']
        assert isinstance(rows, list), "Rows should be array"
        # Each row should have running balance per currency
        for row in rows:
            assert 'date' in row and 'description' in row and 'currency' in row and 'balance' in row, "Missing fields in statement row"
        print(f"✅ Statement report verified: {len(rows)} rows for {party['name']}")
        
        # Test trial balance
        print("\nTesting GET /api/reports/trial-balance...")
        resp = requests.get(f"{API_BASE}/reports/trial-balance", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        trial = resp.json()
        assert 'rows' in trial, "Missing rows"
        assert 'totals' in trial, "Missing totals"
        totals = trial['totals']
        assert 'USD' in totals and 'SAR' in totals and 'YER' in totals, "Missing currencies in totals"
        
        # Verify balanced per currency (within 0.01 tolerance)
        for currency in ['USD', 'SAR', 'YER']:
            debit = totals[currency]['d']
            credit = totals[currency]['c']
            diff = abs(debit - credit)
            assert diff <= 0.01, f"{currency}: debit={debit}, credit={credit}, diff={diff} > 0.01"
        print(f"✅ Trial balance verified: {len(trial['rows'])} rows")
        print(f"   USD: debit={totals['USD']['d']}, credit={totals['USD']['c']}")
        print(f"   SAR: debit={totals['SAR']['d']}, credit={totals['SAR']['c']}")
        print(f"   YER: debit={totals['YER']['d']}, credit={totals['YER']['c']}")
        
        # Test income statement
        print("\nTesting GET /api/reports/income-statement...")
        resp = requests.get(f"{API_BASE}/reports/income-statement?from={thirty_days_ago}&to={today}", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        income = resp.json()
        assert 'revenue' in income, "Missing revenue"
        assert 'expenses' in income, "Missing expenses"
        assert 'total_revenue_usd' in income, "Missing total_revenue_usd"
        assert 'total_expenses_usd' in income, "Missing total_expenses_usd"
        assert 'net_profit_usd' in income, "Missing net_profit_usd"
        
        revenue = income['revenue']
        assert 'tickets' in revenue and 'visas' in revenue, "Missing revenue categories"
        assert 'SAR' in revenue['tickets'], "Missing SAR in tickets revenue"
        # We created 2 tickets with SAR (commission 200) and 1 with USD (commission 50)
        # and 1 visa with SAR (commission 100)
        print(f"✅ Income statement verified")
        print(f"   Revenue tickets: {revenue['tickets']}")
        print(f"   Revenue visas: {revenue['visas']}")
        print(f"   Expenses: {income['expenses']}")
        print(f"   Net profit USD: {income['net_profit_usd']}")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_error_cases():
    """Test 10: Error cases"""
    print("\n### TEST 10: Error Cases ###")
    
    try:
        # Test ticket without client_id
        print("Testing POST /api/tickets without client_id...")
        resp = requests.post(f"{API_BASE}/tickets", json={"supplier_id": test_data['supplier_id'], "currency": "SAR"}, timeout=10)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print(f"✅ POST /api/tickets without client_id -> 400")
        
        # Test voucher with amount <= 0
        print("\nTesting POST /api/vouchers with amount <= 0...")
        resp = requests.post(f"{API_BASE}/vouchers", json={
            "type": "receipt",
            "currency": "SAR",
            "amount": 0,
            "party_type": "client",
            "party_id": test_data['client_id'],
            "box_id": test_data['box_cash_id']
        }, timeout=10)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print(f"✅ POST /api/vouchers with amount=0 -> 400")
        
        # Test voucher with invalid currency
        print("\nTesting POST /api/vouchers with invalid currency...")
        resp = requests.post(f"{API_BASE}/vouchers", json={
            "type": "receipt",
            "currency": "EUR",
            "amount": 100,
            "party_type": "client",
            "party_id": test_data['client_id'],
            "box_id": test_data['box_cash_id']
        }, timeout=10)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print(f"✅ POST /api/vouchers with invalid currency -> 400")
        
        # Test statement without params
        print("\nTesting GET /api/reports/statement without params...")
        resp = requests.get(f"{API_BASE}/reports/statement", timeout=10)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print(f"✅ GET /api/reports/statement without params -> 400")
        
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def main():
    """Run all tests"""
    print("=" * 80)
    print("RAHAAL TRAVEL OFFICE ERP - COMPREHENSIVE BACKEND TEST")
    print("=" * 80)
    
    results = {
        "Health & Seeding": test_health_and_seeding(),
        "Clients & Suppliers": test_clients_and_suppliers(),
        "Ticket Booking": test_ticket_booking(),
        "Visa Booking": test_visa_booking(),
        "Receipt Voucher": test_receipt_voucher(),
        "Payment Voucher (Supplier)": test_payment_voucher(),
        "Payment Voucher (Expense)": test_payment_voucher_expense(),
        "Dashboard": test_dashboard(),
        "Reports": test_reports(),
        "Error Cases": test_error_cases(),
    }
    
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print("=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("=" * 80)
    
    return passed == total


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
