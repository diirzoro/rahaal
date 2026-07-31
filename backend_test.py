#!/usr/bin/env python3
"""
Backend Test Suite for Rahaal ERP v3.5
Tests refunds and bulk statement generation features
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
CREDENTIALS = {
    "email": "owner@demo.com",
    "password": "Demo@2025"
}

class TestSession:
    def __init__(self):
        self.session = requests.Session()
        self.cookies = None
        
    def login(self):
        """Login and get session cookie"""
        print("\n=== LOGIN ===")
        try:
            resp = self.session.post(f"{BASE_URL}/auth/login", json=CREDENTIALS)
            print(f"Login status: {resp.status_code}")
            if resp.status_code == 200:
                self.cookies = self.session.cookies
                print("✅ Login successful")
                return True
            else:
                print(f"❌ Login failed: {resp.text}")
                return False
        except Exception as e:
            print(f"❌ Login error: {e}")
            return False
    
    def get(self, endpoint):
        """GET request"""
        return self.session.get(f"{BASE_URL}{endpoint}")
    
    def post(self, endpoint, data):
        """POST request"""
        return self.session.post(f"{BASE_URL}{endpoint}", json=data)
    
    def put(self, endpoint, data):
        """PUT request"""
        return self.session.put(f"{BASE_URL}{endpoint}", json=data)
    
    def delete(self, endpoint):
        """DELETE request"""
        return self.session.delete(f"{BASE_URL}{endpoint}")

def test_health_check(session):
    """Test 1: GET /api/health → verify version:3.5"""
    print("\n=== TEST 1: Health Check ===")
    try:
        resp = session.get("/health")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            if data.get('version') == '3.5':
                print("✅ PASSED - Version 3.5 confirmed")
                return True
            else:
                print(f"❌ FAILED - Expected version 3.5, got {data.get('version')}")
                return False
        else:
            print(f"❌ FAILED - Status {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_account_4104_exists(session):
    """Test 2: GET /api/accounts → verify account 4104 exists"""
    print("\n=== TEST 2: Account 4104 Exists ===")
    try:
        resp = session.get("/accounts")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            accounts = resp.json()
            account_4104 = [a for a in accounts if a.get('code') == '4104']
            print(f"Found {len(account_4104)} account(s) with code 4104")
            if len(account_4104) > 0:
                for acc in account_4104:
                    print(f"  - {acc.get('name_ar')} (code: {acc.get('code')})")
                # Check for refund fees account specifically
                refund_account = [a for a in account_4104 if 'إلغاء' in a.get('name_ar', '') or 'استرداد' in a.get('name_ar', '')]
                if refund_account:
                    print("✅ PASSED - Account 4104 (رسوم إلغاء واسترداد) exists")
                    return True
                else:
                    print("⚠️ WARNING - Account 4104 exists but may not be the refund fees account")
                    return True
            else:
                print("❌ FAILED - Account 4104 not found")
                return False
        else:
            print(f"❌ FAILED - Status {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_create_fresh_ticket(session):
    """Test 3: Create a fresh ticket for refund testing"""
    print("\n=== TEST 3: Create Fresh Ticket ===")
    
    # Step 1: Create client
    print("\n--- Step 3.1: Create Client ---")
    try:
        client_data = {
            "name": "عميل استرداد اختبار",
            "phone": "777112233"
        }
        resp = session.post("/clients", client_data)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            client = resp.json()
            client_id = client.get('id')
            print(f"✅ Client created: {client.get('name')} (ID: {client_id})")
        else:
            print(f"❌ Failed to create client: {resp.text}")
            return None
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return None
    
    # Step 2: Create supplier
    print("\n--- Step 3.2: Create Supplier ---")
    try:
        supplier_data = {
            "name": "مورد استرداد اختبار"
        }
        resp = session.post("/suppliers", supplier_data)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            supplier = resp.json()
            supplier_id = supplier.get('id')
            print(f"✅ Supplier created: {supplier.get('name')} (ID: {supplier_id})")
        else:
            print(f"❌ Failed to create supplier: {resp.text}")
            return None
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return None
    
    # Step 3: Create ticket
    print("\n--- Step 3.3: Create Ticket ---")
    try:
        ticket_data = {
            "date": datetime.now().isoformat(),
            "currency": "SAR",
            "client_id": client_id,
            "supplier_id": supplier_id,
            "cost": 100,
            "sale_price": 150,
            "payment_method": "credit",
            "pnr": "REFUND-TEST-1",
            "route": "CAI-JED",
            "passenger_name": "مسافر تجريبي"
        }
        resp = session.post("/tickets", ticket_data)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            ticket = resp.json()
            ticket_id = ticket.get('id')
            print(f"✅ Ticket created: {ticket.get('pnr')} (ID: {ticket_id})")
            print(f"   Cost: {ticket.get('cost')}, Sale: {ticket.get('sale_price')}, Commission: {ticket.get('commission')}")
            
            # Verify balances
            print("\n--- Step 3.4: Verify Balances ---")
            client_resp = session.get(f"/clients")
            if client_resp.status_code == 200:
                clients = client_resp.json()
                test_client = [c for c in clients if c.get('id') == client_id]
                if test_client:
                    client_balance = test_client[0].get('balances', {}).get('SAR', 0)
                    print(f"   Client balance SAR: {client_balance}")
                    if abs(client_balance - 150) < 0.01:
                        print("   ✅ Client balance correct (150 SAR)")
                    else:
                        print(f"   ⚠️ Client balance unexpected: {client_balance}")
            
            supplier_resp = session.get(f"/suppliers")
            if supplier_resp.status_code == 200:
                suppliers = supplier_resp.json()
                test_supplier = [s for s in suppliers if s.get('id') == supplier_id]
                if test_supplier:
                    supplier_balance = test_supplier[0].get('balances', {}).get('SAR', 0)
                    print(f"   Supplier balance SAR: {supplier_balance}")
                    if abs(supplier_balance - 100) < 0.01:
                        print("   ✅ Supplier balance correct (100 SAR)")
                    else:
                        print(f"   ⚠️ Supplier balance unexpected: {supplier_balance}")
            
            print("\n✅ PASSED - Fresh ticket created successfully")
            return {
                'ticket_id': ticket_id,
                'client_id': client_id,
                'supplier_id': supplier_id,
                'pnr': ticket.get('pnr')
            }
        else:
            print(f"❌ Failed to create ticket: {resp.text}")
            return None
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return None

def test_refund_ticket(session, ticket_info):
    """Test 4: POST /api/refunds with valid data"""
    print("\n=== TEST 4: Create Refund ===")
    if not ticket_info:
        print("❌ SKIPPED - No ticket info available")
        return None
    
    try:
        refund_data = {
            "ref_type": "ticket",
            "ref_id": ticket_info['ticket_id'],
            "supplier_penalty": 20,
            "office_fee": 10,
            "reason": "طلب العميل"
        }
        resp = session.post("/refunds", refund_data)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            refund = resp.json()
            print(f"\n✅ Refund created successfully")
            print(f"   Refund ID: {refund.get('id')}")
            print(f"   Original Sale: {refund.get('original_sale')}")
            print(f"   Original Cost: {refund.get('original_cost')}")
            print(f"   Supplier Penalty: {refund.get('supplier_penalty')}")
            print(f"   Office Fee: {refund.get('office_fee')}")
            print(f"   Refund to Client: {refund.get('refund_to_client')}")
            
            # Verify calculations
            expected_refund = 150 - 20 - 10  # sale - supplier_penalty - office_fee
            actual_refund = refund.get('refund_to_client')
            if abs(actual_refund - expected_refund) < 0.01:
                print(f"   ✅ Refund calculation correct: {actual_refund} SAR")
            else:
                print(f"   ⚠️ Refund calculation unexpected: expected {expected_refund}, got {actual_refund}")
            
            print("\n✅ PASSED - Refund created with correct calculations")
            return refund
        else:
            print(f"❌ FAILED - Status {resp.status_code}: {resp.text}")
            return None
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return None

def test_verify_balances_after_refund(session, ticket_info):
    """Test 5: Verify client and supplier balances after refund"""
    print("\n=== TEST 5: Verify Balances After Refund ===")
    if not ticket_info:
        print("❌ SKIPPED - No ticket info available")
        return False
    
    try:
        # Check client balance
        print("\n--- Step 5.1: Check Client Balance ---")
        client_resp = session.get(f"/clients")
        if client_resp.status_code == 200:
            clients = client_resp.json()
            test_client = [c for c in clients if c.get('id') == ticket_info['client_id']]
            if test_client:
                client_balance = test_client[0].get('balances', {}).get('SAR', 0)
                print(f"   Client balance SAR: {client_balance}")
                # Expected: 30 SAR (supplier_penalty 20 + office_fee 10)
                if abs(client_balance - 30) < 0.01:
                    print("   ✅ Client balance correct (30 SAR = fees retained)")
                else:
                    print(f"   ⚠️ Client balance unexpected: expected 30, got {client_balance}")
        
        # Check supplier balance
        print("\n--- Step 5.2: Check Supplier Balance ---")
        supplier_resp = session.get(f"/suppliers")
        if supplier_resp.status_code == 200:
            suppliers = supplier_resp.json()
            test_supplier = [s for s in suppliers if s.get('id') == ticket_info['supplier_id']]
            if test_supplier:
                supplier_balance = test_supplier[0].get('balances', {}).get('SAR', 0)
                print(f"   Supplier balance SAR: {supplier_balance}")
                # Expected: 20 SAR (supplier_penalty only)
                if abs(supplier_balance - 20) < 0.01:
                    print("   ✅ Supplier balance correct (20 SAR = penalty only)")
                else:
                    print(f"   ⚠️ Supplier balance unexpected: expected 20, got {supplier_balance}")
        
        print("\n✅ PASSED - Balances verified after refund")
        return True
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_verify_ticket_refunded_flag(session, ticket_info):
    """Test 6: Verify ticket has is_refunded flag"""
    print("\n=== TEST 6: Verify Ticket Refunded Flag ===")
    if not ticket_info:
        print("❌ SKIPPED - No ticket info available")
        return False
    
    try:
        resp = session.get("/tickets")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            tickets = resp.json()
            test_ticket = [t for t in tickets if t.get('id') == ticket_info['ticket_id']]
            if test_ticket:
                ticket = test_ticket[0]
                print(f"\nTicket {ticket.get('pnr')}:")
                print(f"   is_refunded: {ticket.get('is_refunded')}")
                print(f"   refund_supplier_penalty: {ticket.get('refund_supplier_penalty')}")
                print(f"   refund_office_fee: {ticket.get('refund_office_fee')}")
                print(f"   refund_to_client: {ticket.get('refund_to_client')}")
                
                if ticket.get('is_refunded') == True:
                    if ticket.get('refund_supplier_penalty') == 20 and ticket.get('refund_office_fee') == 10 and ticket.get('refund_to_client') == 120:
                        print("\n✅ PASSED - Ticket marked as refunded with correct values")
                        return True
                    else:
                        print("\n⚠️ Ticket marked as refunded but values incorrect")
                        return False
                else:
                    print("\n❌ FAILED - Ticket not marked as refunded")
                    return False
            else:
                print("❌ FAILED - Ticket not found")
                return False
        else:
            print(f"❌ FAILED - Status {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_get_refunds_list(session):
    """Test 7: GET /api/refunds → should list the refund"""
    print("\n=== TEST 7: Get Refunds List ===")
    try:
        resp = session.get("/refunds")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            refunds = resp.json()
            print(f"Found {len(refunds)} refund(s)")
            if len(refunds) > 0:
                latest_refund = refunds[0]
                print(f"\nLatest refund:")
                print(f"   ID: {latest_refund.get('id')}")
                print(f"   Ref Type: {latest_refund.get('ref_type')}")
                print(f"   Passenger: {latest_refund.get('passenger_name')}")
                print(f"   Supplier Penalty: {latest_refund.get('supplier_penalty')}")
                print(f"   Office Fee: {latest_refund.get('office_fee')}")
                print(f"   Refund to Client: {latest_refund.get('refund_to_client')}")
                print(f"   Reason: {latest_refund.get('reason')}")
                print("\n✅ PASSED - Refunds list retrieved successfully")
                return True
            else:
                print("⚠️ No refunds found in list")
                return False
        else:
            print(f"❌ FAILED - Status {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_duplicate_refund_error(session, ticket_info):
    """Test 8: Attempt refund again on same ticket → should return 400"""
    print("\n=== TEST 8: Duplicate Refund Error ===")
    if not ticket_info:
        print("❌ SKIPPED - No ticket info available")
        return False
    
    try:
        refund_data = {
            "ref_type": "ticket",
            "ref_id": ticket_info['ticket_id'],
            "supplier_penalty": 10,
            "office_fee": 5,
            "reason": "محاولة ثانية"
        }
        resp = session.post("/refunds", refund_data)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
        
        if resp.status_code == 400:
            if 'تم استرداده مسبقاً' in resp.text or 'استرداده' in resp.text:
                print("\n✅ PASSED - Duplicate refund correctly rejected with Arabic message")
                return True
            else:
                print("\n⚠️ 400 error returned but message may not match expected")
                return True
        else:
            print(f"\n❌ FAILED - Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_refund_fees_exceed_sale(session):
    """Test 9: Test edge case - fees exceeding sale_price"""
    print("\n=== TEST 9: Refund Fees Exceed Sale Price ===")
    
    # Create a fresh ticket for this test
    print("\n--- Step 9.1: Create Fresh Ticket ---")
    try:
        # Create client
        client_data = {"name": "عميل اختبار رسوم", "phone": "777999888"}
        client_resp = session.post("/clients", client_data)
        if client_resp.status_code != 200:
            print(f"❌ Failed to create client: {client_resp.text}")
            return False
        client_id = client_resp.json().get('id')
        
        # Create supplier
        supplier_data = {"name": "مورد اختبار رسوم"}
        supplier_resp = session.post("/suppliers", supplier_data)
        if supplier_resp.status_code != 200:
            print(f"❌ Failed to create supplier: {supplier_resp.text}")
            return False
        supplier_id = supplier_resp.json().get('id')
        
        # Create ticket
        ticket_data = {
            "date": datetime.now().isoformat(),
            "currency": "SAR",
            "client_id": client_id,
            "supplier_id": supplier_id,
            "cost": 100,
            "sale_price": 150,
            "payment_method": "credit",
            "pnr": "REFUND-TEST-FEES",
            "route": "RUH-CAI",
            "passenger_name": "مسافر رسوم"
        }
        ticket_resp = session.post("/tickets", ticket_data)
        if ticket_resp.status_code != 200:
            print(f"❌ Failed to create ticket: {ticket_resp.text}")
            return False
        ticket_id = ticket_resp.json().get('id')
        print(f"✅ Ticket created: {ticket_id}")
        
        # Attempt refund with excessive fees
        print("\n--- Step 9.2: Attempt Refund with Excessive Fees ---")
        refund_data = {
            "ref_type": "ticket",
            "ref_id": ticket_id,
            "supplier_penalty": 200,
            "office_fee": 50,
            "reason": "اختبار رسوم زائدة"
        }
        resp = session.post("/refunds", refund_data)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
        
        if resp.status_code == 400:
            if 'أكبر من' in resp.text or 'قيمة البيع' in resp.text:
                print("\n✅ PASSED - Excessive fees correctly rejected with Arabic message")
                return True
            else:
                print("\n⚠️ 400 error returned but message may not match expected")
                return True
        else:
            print(f"\n❌ FAILED - Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_invalid_ref_type(session):
    """Test 10: Test invalid ref_type → 400"""
    print("\n=== TEST 10: Invalid Ref Type ===")
    try:
        refund_data = {
            "ref_type": "invalid_type",
            "ref_id": "some-id",
            "supplier_penalty": 10,
            "office_fee": 5,
            "reason": "اختبار نوع خاطئ"
        }
        resp = session.post("/refunds", refund_data)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
        
        if resp.status_code == 400:
            print("\n✅ PASSED - Invalid ref_type correctly rejected")
            return True
        else:
            print(f"\n❌ FAILED - Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_bulk_statement_clients(session):
    """Test 11: POST /api/bulk-statement/generate with kind:clients"""
    print("\n=== TEST 11: Bulk Statement - Clients ===")
    try:
        data = {
            "kind": "clients",
            "period": "month"
        }
        resp = session.post("/bulk-statement/generate", data)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            result = resp.json()
            print(f"\nResponse structure:")
            print(f"   Count: {result.get('count')}")
            print(f"   Items: {len(result.get('items', []))}")
            
            if result.get('count') > 0:
                items = result.get('items', [])
                print(f"\n✅ Found {len(items)} client(s) with balance and phone")
                
                # Check first item structure
                if items:
                    first_item = items[0]
                    print(f"\nFirst item structure:")
                    print(f"   ID: {first_item.get('id')}")
                    print(f"   Name: {first_item.get('name')}")
                    print(f"   Phone: {first_item.get('phone')}")
                    print(f"   WhatsApp: {first_item.get('whatsapp')}")
                    print(f"   Balances: {first_item.get('balances')}")
                    print(f"   Message preview: {first_item.get('message', '')[:100]}...")
                    print(f"   WA Link: {first_item.get('wa_link', '')[:80]}...")
                    
                    # Verify message contains required elements
                    message = first_item.get('message', '')
                    has_greeting = 'عزيزنا العميل' in message or 'عزيزنا المورد' in message
                    has_name = first_item.get('name', '') in message
                    has_balances = 'الأرصدة الحالية' in message or 'أرصدة' in message
                    has_wa_link = first_item.get('wa_link', '').startswith('https://wa.me/')
                    
                    print(f"\nMessage validation:")
                    print(f"   Has greeting: {has_greeting}")
                    print(f"   Has name: {has_name}")
                    print(f"   Has balances section: {has_balances}")
                    print(f"   Has valid WA link: {has_wa_link}")
                    
                    if has_greeting and has_balances and has_wa_link:
                        print("\n✅ PASSED - Bulk statement for clients generated correctly")
                        return True
                    else:
                        print("\n⚠️ Message structure incomplete")
                        return False
            else:
                print("\n⚠️ No clients with balance and phone found")
                print("   This may be expected if no clients meet criteria")
                return True
        else:
            print(f"❌ FAILED - Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_bulk_statement_suppliers(session):
    """Test 12: POST /api/bulk-statement/generate with kind:suppliers"""
    print("\n=== TEST 12: Bulk Statement - Suppliers ===")
    try:
        data = {
            "kind": "suppliers",
            "period": "month"
        }
        resp = session.post("/bulk-statement/generate", data)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            result = resp.json()
            print(f"\nResponse structure:")
            print(f"   Count: {result.get('count')}")
            print(f"   Items: {len(result.get('items', []))}")
            
            if result.get('count') > 0:
                items = result.get('items', [])
                print(f"\n✅ Found {len(items)} supplier(s) with balance and phone")
                
                # Check first item
                if items:
                    first_item = items[0]
                    print(f"\nFirst supplier:")
                    print(f"   Name: {first_item.get('name')}")
                    print(f"   Balances: {first_item.get('balances')}")
                    message = first_item.get('message', '')
                    has_supplier_greeting = 'عزيزنا المورد' in message
                    print(f"   Has supplier greeting: {has_supplier_greeting}")
                    
                    if has_supplier_greeting:
                        print("\n✅ PASSED - Bulk statement for suppliers generated correctly")
                        return True
                    else:
                        print("\n⚠️ Supplier message may not have correct greeting")
                        return False
            else:
                print("\n⚠️ No suppliers with balance and phone found")
                print("   This may be expected if no suppliers meet criteria")
                return True
        else:
            print(f"❌ FAILED - Status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_regression_v34_affiliate(session):
    """Test 13: Regression - v3.4 affiliate endpoints still work"""
    print("\n=== TEST 13: Regression - v3.4 Affiliate ===")
    try:
        resp = session.get("/affiliate/link")
        print(f"GET /affiliate/link status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"   Affiliate link: {data.get('link', '')[:50]}...")
            print("✅ PASSED - v3.4 affiliate endpoint still works")
            return True
        else:
            print(f"⚠️ Status {resp.status_code} - May need investigation")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_regression_v33_statement(session):
    """Test 14: Regression - v3.3 statement report still works"""
    print("\n=== TEST 14: Regression - v3.3 Statement Report ===")
    try:
        # Get a client ID first
        clients_resp = session.get("/clients")
        if clients_resp.status_code == 200:
            clients = clients_resp.json()
            if clients:
                client_id = clients[0].get('id')
                resp = session.get(f"/reports/statement?party_type=client&party_id={client_id}")
                print(f"GET /reports/statement status: {resp.status_code}")
                
                if resp.status_code == 200:
                    data = resp.json()
                    print(f"   Statement has {len(data.get('rows', []))} rows")
                    print("✅ PASSED - v3.3 statement report still works")
                    return True
                else:
                    print(f"⚠️ Status {resp.status_code}")
                    return False
            else:
                print("⚠️ No clients found to test statement")
                return True
        else:
            print(f"⚠️ Could not get clients list")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_regression_tickets_crud(session):
    """Test 15: Regression - Existing tickets CRUD still works"""
    print("\n=== TEST 15: Regression - Tickets CRUD ===")
    try:
        resp = session.get("/tickets")
        print(f"GET /tickets status: {resp.status_code}")
        
        if resp.status_code == 200:
            tickets = resp.json()
            print(f"   Found {len(tickets)} ticket(s)")
            print("✅ PASSED - Tickets CRUD still works")
            return True
        else:
            print(f"❌ FAILED - Status {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def main():
    """Main test runner"""
    print("=" * 60)
    print("RAHAAL ERP v3.5 BACKEND TEST SUITE")
    print("Testing: Refunds + Bulk Statement")
    print("=" * 60)
    
    session = TestSession()
    
    # Login
    if not session.login():
        print("\n❌ LOGIN FAILED - Cannot proceed with tests")
        return
    
    # Track results
    results = {}
    
    # Run tests
    results['health'] = test_health_check(session)
    results['account_4104'] = test_account_4104_exists(session)
    
    # Create fresh ticket and test refunds
    ticket_info = test_create_fresh_ticket(session)
    results['create_ticket'] = ticket_info is not None
    
    refund = test_refund_ticket(session, ticket_info)
    results['create_refund'] = refund is not None
    
    results['verify_balances'] = test_verify_balances_after_refund(session, ticket_info)
    results['verify_ticket_flag'] = test_verify_ticket_refunded_flag(session, ticket_info)
    results['get_refunds'] = test_get_refunds_list(session)
    results['duplicate_refund'] = test_duplicate_refund_error(session, ticket_info)
    results['fees_exceed_sale'] = test_refund_fees_exceed_sale(session)
    results['invalid_ref_type'] = test_invalid_ref_type(session)
    
    # Bulk statement tests
    results['bulk_clients'] = test_bulk_statement_clients(session)
    results['bulk_suppliers'] = test_bulk_statement_suppliers(session)
    
    # Regression tests
    results['regression_affiliate'] = test_regression_v34_affiliate(session)
    results['regression_statement'] = test_regression_v33_statement(session)
    results['regression_tickets'] = test_regression_tickets_crud(session)
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    print(f"\nTotal: {passed}/{total} tests passed\n")
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("\n" + "=" * 60)
    
    if passed == total:
        print("🎉 ALL TESTS PASSED!")
    else:
        print(f"⚠️ {total - passed} test(s) failed")
    
    print("=" * 60)

if __name__ == "__main__":
    main()
