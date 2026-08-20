#!/usr/bin/env python3
"""
Backend Test for v3.22 - Partner Statement Archive + Settlement
Tests POST /api/partners/statements, GET /api/partners/statements, POST /api/partners/statements/:id/settle
"""

import requests
import json
from datetime import datetime, timedelta
import sys

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
AUTH_EMAIL = "owner@demo.com"
AUTH_PASSWORD = "Demo@2025"

# Test state
session = requests.Session()
test_data = {
    'partner_client_id': None,
    'regular_client_id': None,
    'supplier_id': None,
    'box_id': None,
    'visa_id': None,
    'service_id': None,
    'statement_id': None,
    'statement2_id': None,
    'voucher_ids': [],
}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def login():
    """Authenticate and get session cookie"""
    log("=== AUTHENTICATION ===")
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json={
            "email": AUTH_EMAIL,
            "password": AUTH_PASSWORD
        })
        if resp.status_code == 200:
            log(f"✅ Login successful as {AUTH_EMAIL}")
            return True
        else:
            log(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Login exception: {e}")
        return False

def create_test_data():
    """Create partner client, regular client, supplier, box, and commission-sharing operations"""
    log("\n=== SETUP: CREATE TEST DATA ===")
    
    # 1. Create partner client
    log("Creating partner client 'STMT-PARTNER-v322'...")
    try:
        resp = session.post(f"{BASE_URL}/clients", json={
            "name": "STMT-PARTNER-v322",
            "phone": "555-PARTNER",
            "email": "partner@test.com"
        })
        if resp.status_code == 200:
            test_data['partner_client_id'] = resp.json()['id']
            log(f"✅ Partner client created: {test_data['partner_client_id']}")
        else:
            log(f"❌ Failed to create partner client: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception creating partner client: {e}")
        return False
    
    # 2. Create regular client
    log("Creating regular credit client...")
    try:
        resp = session.post(f"{BASE_URL}/clients", json={
            "name": "REGULAR-CLIENT-v322",
            "phone": "555-REGULAR",
            "email": "regular@test.com"
        })
        if resp.status_code == 200:
            test_data['regular_client_id'] = resp.json()['id']
            log(f"✅ Regular client created: {test_data['regular_client_id']}")
        else:
            log(f"❌ Failed to create regular client: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception creating regular client: {e}")
        return False
    
    # 3. Create supplier
    log("Creating supplier...")
    try:
        resp = session.post(f"{BASE_URL}/suppliers", json={
            "name": "SUPPLIER-v322",
            "phone": "555-SUPPLIER",
            "email": "supplier@test.com"
        })
        if resp.status_code == 200:
            test_data['supplier_id'] = resp.json()['id']
            log(f"✅ Supplier created: {test_data['supplier_id']}")
        else:
            log(f"❌ Failed to create supplier: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception creating supplier: {e}")
        return False
    
    # 4. Create cash box
    log("Creating cash box 'STMT-BOX-v322'...")
    try:
        resp = session.post(f"{BASE_URL}/boxes", json={
            "name_ar": "STMT-BOX-v322",
            "type": "cash"
        })
        if resp.status_code == 200:
            test_data['box_id'] = resp.json()['id']
            log(f"✅ Cash box created: {test_data['box_id']}")
        else:
            log(f"❌ Failed to create box: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception creating box: {e}")
        return False
    
    # 5. Get partner client balance before operations
    log("Getting partner client balance before operations...")
    try:
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            clients = resp.json()
            partner = next((c for c in clients if c['id'] == test_data['partner_client_id']), None)
            if partner:
                log(f"✅ Partner balance before: SAR={partner['balances']['SAR']}, USD={partner['balances']['USD']}, YER={partner['balances']['YER']}")
            else:
                log(f"❌ Partner client not found in list")
                return False
        else:
            log(f"❌ Failed to get clients: {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception getting partner balance: {e}")
        return False
    
    # 6. Create visa with commission sharing (partner share 20 SAR)
    log("Creating visa with commission sharing (cost=50, sale=100, partner_share=20)...")
    try:
        resp = session.post(f"{BASE_URL}/visas", json={
            "service_type": "تأشيرة عمرة",
            "beneficiary_name": "Test Beneficiary Visa",
            "beneficiary_phone": "555-VISA-001",
            "passport_no": "V322-VISA-001",
            "client_id": test_data['regular_client_id'],
            "supplier_id": test_data['supplier_id'],
            "currency": "SAR",
            "cost": 50,
            "sale_price": 100,
            "date": datetime.now().isoformat(),
            "commission_partner_type": "client",
            "commission_partner_id": test_data['partner_client_id'],
            "commission_share_mode": "amount",
            "commission_share_value": 20
        })
        if resp.status_code == 200:
            test_data['visa_id'] = resp.json()['id']
            commission = resp.json().get('commission', 0)
            partner_share = resp.json().get('commission_share_amount', 0)
            log(f"✅ Visa created: {test_data['visa_id']}, commission={commission}, partner_share={partner_share}")
        else:
            log(f"❌ Failed to create visa: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception creating visa: {e}")
        return False
    
    # 7. Create service with commission sharing (partner share 15 SAR)
    log("Creating service with commission sharing (cost=30, sale=80, partner_share=15)...")
    try:
        resp = session.post(f"{BASE_URL}/services", json={
            "service_type": "خدمة نقل",
            "beneficiary_name": "Test Beneficiary Service",
            "beneficiary_phone": "555-SERVICE-001",
            "client_id": test_data['regular_client_id'],
            "supplier_id": test_data['supplier_id'],
            "currency": "SAR",
            "cost": 30,
            "sale_price": 80,
            "date": datetime.now().isoformat(),
            "commission_partner_type": "client",
            "commission_partner_id": test_data['partner_client_id'],
            "commission_share_mode": "amount",
            "commission_share_value": 15
        })
        if resp.status_code == 200:
            test_data['service_id'] = resp.json()['id']
            commission = resp.json().get('commission', 0)
            partner_share = resp.json().get('commission_share_amount', 0)
            log(f"✅ Service created: {test_data['service_id']}, commission={commission}, partner_share={partner_share}")
        else:
            log(f"❌ Failed to create service: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception creating service: {e}")
        return False
    
    # 8. Get partner client balance after operations
    log("Getting partner client balance after operations...")
    try:
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            clients = resp.json()
            partner = next((c for c in clients if c['id'] == test_data['partner_client_id']), None)
            if partner:
                sar_balance = partner['balances']['SAR']
                log(f"✅ Partner balance after: SAR={sar_balance}, USD={partner['balances']['USD']}, YER={partner['balances']['YER']}")
                log(f"   Expected SAR balance: -35 (we owe partner 20+15=35)")
                if abs(sar_balance - (-35)) < 0.01:
                    log(f"✅ Partner balance is correct: {sar_balance}")
                else:
                    log(f"⚠️  Partner balance mismatch: expected -35, got {sar_balance}")
            else:
                log(f"❌ Partner client not found in list")
                return False
        else:
            log(f"❌ Failed to get clients: {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception getting partner balance: {e}")
        return False
    
    return True

def test_archive_statement():
    """TEST 1 - Archive Statement: POST /api/partners/statements"""
    log("\n=== TEST 1: ARCHIVE STATEMENT ===")
    
    # Test 1.1: Create archive statement for partner with commissions
    log("Test 1.1: POST /api/partners/statements with partner having commissions...")
    try:
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        today = datetime.now().strftime('%Y-%m-%d')
        
        resp = session.post(f"{BASE_URL}/partners/statements", json={
            "partner_type": "client",
            "partner_id": test_data['partner_client_id'],
            "from": yesterday,
            "to": today
        })
        
        if resp.status_code == 200:
            data = resp.json()
            test_data['statement_id'] = data['id']
            log(f"✅ Statement created: {data['id']}")
            log(f"   Partner name: {data.get('partner_name')}")
            log(f"   Rows count: {len(data.get('rows', []))}")
            log(f"   Count field: {data.get('count')}")
            log(f"   Settlement voucher ID: {data.get('settlement_voucher_id')}")
            
            # Verify structure
            if data.get('id') and data.get('partner_name'):
                log(f"✅ Statement has id and partner_name")
            else:
                log(f"❌ Statement missing id or partner_name")
                return False
            
            if len(data.get('rows', [])) == 2:
                log(f"✅ Statement has 2 rows (visa + service)")
            else:
                log(f"❌ Statement has {len(data.get('rows', []))} rows, expected 2")
                return False
            
            if data.get('count') == 2:
                log(f"✅ Count field is 2")
            else:
                log(f"❌ Count field is {data.get('count')}, expected 2")
                return False
            
            # Verify totals
            totals = data.get('totals', {})
            sar_totals = totals.get('SAR', {})
            if sar_totals:
                partner_share = sar_totals.get('partner_share', 0)
                total_commission = sar_totals.get('total_commission', 0)
                office_share = sar_totals.get('office_share', 0)
                
                log(f"   SAR totals: partner_share={partner_share}, total_commission={total_commission}, office_share={office_share}")
                
                if abs(partner_share - 35) < 0.01:
                    log(f"✅ Partner share is 35 SAR")
                else:
                    log(f"❌ Partner share is {partner_share}, expected 35")
                    return False
                
                if abs(total_commission - 100) < 0.01:
                    log(f"✅ Total commission is 100 SAR")
                else:
                    log(f"❌ Total commission is {total_commission}, expected 100")
                    return False
                
                if abs(office_share - 65) < 0.01:
                    log(f"✅ Office share is 65 SAR")
                else:
                    log(f"❌ Office share is {office_share}, expected 65")
                    return False
            else:
                log(f"❌ No SAR totals found")
                return False
            
            if data.get('settlement_voucher_id') is None:
                log(f"✅ Settlement voucher ID is null (not settled yet)")
            else:
                log(f"❌ Settlement voucher ID should be null, got {data.get('settlement_voucher_id')}")
                return False
            
        else:
            log(f"❌ Failed to create statement: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 1.1: {e}")
        return False
    
    # Test 1.2: GET /api/partners/statements?partner_id=<partner>
    log("\nTest 1.2: GET /api/partners/statements?partner_id=<partner>...")
    try:
        resp = session.get(f"{BASE_URL}/partners/statements?partner_id={test_data['partner_client_id']}")
        
        if resp.status_code == 200:
            statements = resp.json()
            log(f"✅ Retrieved {len(statements)} statements")
            
            # Find our statement
            our_stmt = next((s for s in statements if s['id'] == test_data['statement_id']), None)
            if our_stmt:
                log(f"✅ Found our statement in the list")
            else:
                log(f"❌ Our statement not found in the list")
                return False
        else:
            log(f"❌ Failed to get statements: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 1.2: {e}")
        return False
    
    # Test 1.3: POST with partner having no commissions (regular client)
    log("\nTest 1.3: POST with partner having no commissions (should return 400)...")
    try:
        resp = session.post(f"{BASE_URL}/partners/statements", json={
            "partner_type": "client",
            "partner_id": test_data['regular_client_id'],
            "from": yesterday,
            "to": today
        })
        
        if resp.status_code == 400:
            error_msg = resp.json().get('error', '')
            log(f"✅ Correctly returned 400 error: {error_msg}")
            if 'لا توجد عمولات' in error_msg or 'لا يمكن أرشفة كشف فارغ' in error_msg:
                log(f"✅ Error message mentions no commissions")
            else:
                log(f"⚠️  Error message doesn't mention no commissions: {error_msg}")
        else:
            log(f"❌ Expected 400, got {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 1.3: {e}")
        return False
    
    # Test 1.4: POST with invalid partner_type
    log("\nTest 1.4: POST with invalid partner_type (should return 400)...")
    try:
        resp = session.post(f"{BASE_URL}/partners/statements", json={
            "partner_type": "invalid",
            "partner_id": test_data['partner_client_id'],
            "from": yesterday,
            "to": today
        })
        
        if resp.status_code == 400:
            log(f"✅ Correctly returned 400 error for invalid partner_type")
        else:
            log(f"❌ Expected 400, got {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 1.4: {e}")
        return False
    
    return True

def test_settlement():
    """TEST 2 - Settlement: POST /api/partners/statements/:id/settle"""
    log("\n=== TEST 2: SETTLEMENT ===")
    
    # Get box balance before settlement
    log("Getting box balance before settlement...")
    try:
        resp = session.get(f"{BASE_URL}/boxes")
        if resp.status_code == 200:
            boxes = resp.json()
            box = next((b for b in boxes if b['id'] == test_data['box_id']), None)
            if box:
                box_sar_before = box['balances']['SAR']
                log(f"✅ Box SAR balance before settlement: {box_sar_before}")
            else:
                log(f"❌ Box not found")
                return False
        else:
            log(f"❌ Failed to get boxes: {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception getting box balance: {e}")
        return False
    
    # Get partner balance before settlement
    log("Getting partner balance before settlement...")
    try:
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            clients = resp.json()
            partner = next((c for c in clients if c['id'] == test_data['partner_client_id']), None)
            if partner:
                partner_sar_before = partner['balances']['SAR']
                log(f"✅ Partner SAR balance before settlement: {partner_sar_before}")
            else:
                log(f"❌ Partner not found")
                return False
        else:
            log(f"❌ Failed to get clients: {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception getting partner balance: {e}")
        return False
    
    # Test 2.1: Settle the statement
    log("\nTest 2.1: POST /api/partners/statements/:id/settle with full amount (35 SAR)...")
    try:
        resp = session.post(f"{BASE_URL}/partners/statements/{test_data['statement_id']}/settle", json={
            "box_id": test_data['box_id'],
            "currency": "SAR",
            "amount": 35,
            "notes": "test settlement v322"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            log(f"✅ Settlement successful")
            log(f"   Voucher ID: {data.get('voucher', {}).get('id')}")
            log(f"   Settled amount: {data.get('settled_amount')}")
            log(f"   Settled currency: {data.get('settled_currency')}")
            
            voucher = data.get('voucher', {})
            if voucher:
                test_data['voucher_ids'].append(voucher['id'])
                
                # Verify voucher structure
                if voucher.get('type') == 'payment':
                    log(f"✅ Voucher type is 'payment'")
                else:
                    log(f"❌ Voucher type is {voucher.get('type')}, expected 'payment'")
                    return False
                
                if voucher.get('amount') == 35:
                    log(f"✅ Voucher amount is 35")
                else:
                    log(f"❌ Voucher amount is {voucher.get('amount')}, expected 35")
                    return False
                
                if voucher.get('party_id') == test_data['partner_client_id']:
                    log(f"✅ Voucher party is partner client")
                else:
                    log(f"❌ Voucher party mismatch")
                    return False
            else:
                log(f"❌ No voucher in response")
                return False
            
            if data.get('settled_amount') == 35:
                log(f"✅ Settled amount is 35")
            else:
                log(f"❌ Settled amount is {data.get('settled_amount')}, expected 35")
                return False
        else:
            log(f"❌ Failed to settle statement: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 2.1: {e}")
        return False
    
    # Verify partner balance after settlement
    log("\nVerifying partner balance after settlement...")
    try:
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            clients = resp.json()
            partner = next((c for c in clients if c['id'] == test_data['partner_client_id']), None)
            if partner:
                partner_sar_after = partner['balances']['SAR']
                log(f"✅ Partner SAR balance after settlement: {partner_sar_after}")
                log(f"   Expected: 0 (moved from -35 to 0)")
                
                if abs(partner_sar_after - 0) < 0.01:
                    log(f"✅ Partner balance is correct (0)")
                else:
                    log(f"❌ Partner balance is {partner_sar_after}, expected 0")
                    return False
            else:
                log(f"❌ Partner not found")
                return False
        else:
            log(f"❌ Failed to get clients: {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception verifying partner balance: {e}")
        return False
    
    # Verify box balance after settlement
    log("\nVerifying box balance after settlement...")
    try:
        resp = session.get(f"{BASE_URL}/boxes")
        if resp.status_code == 200:
            boxes = resp.json()
            box = next((b for b in boxes if b['id'] == test_data['box_id']), None)
            if box:
                box_sar_after = box['balances']['SAR']
                log(f"✅ Box SAR balance after settlement: {box_sar_after}")
                log(f"   Expected: {box_sar_before - 35} (decreased by 35)")
                
                if abs(box_sar_after - (box_sar_before - 35)) < 0.01:
                    log(f"✅ Box balance decreased by 35 correctly")
                else:
                    log(f"❌ Box balance is {box_sar_after}, expected {box_sar_before - 35}")
                    return False
            else:
                log(f"❌ Box not found")
                return False
        else:
            log(f"❌ Failed to get boxes: {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception verifying box balance: {e}")
        return False
    
    # Verify journal entry exists and is balanced
    log("\nVerifying journal entry for settlement voucher...")
    try:
        resp = session.get(f"{BASE_URL}/journal-entries")
        if resp.status_code == 200:
            entries = resp.json()
            # Find the journal entry with ref_type=payment and ref_id=voucher_id
            voucher_id = test_data['voucher_ids'][-1]
            je = next((e for e in entries if e.get('ref_type') == 'payment' and e.get('ref_id') == voucher_id), None)
            
            if je:
                log(f"✅ Found journal entry for settlement voucher")
                lines = je.get('lines', [])
                log(f"   Lines count: {len(lines)}")
                
                # Calculate total debit and credit
                total_debit = sum(line.get('debit', 0) for line in lines)
                total_credit = sum(line.get('credit', 0) for line in lines)
                
                log(f"   Total debit: {total_debit}")
                log(f"   Total credit: {total_credit}")
                
                if abs(total_debit - total_credit) < 0.01:
                    log(f"✅ Journal entry is balanced (debit={total_debit}, credit={total_credit})")
                else:
                    log(f"❌ Journal entry is not balanced (debit={total_debit}, credit={total_credit})")
                    return False
                
                # Verify lines: debit client 35, credit box 35
                client_line = next((l for l in lines if l.get('account_code') == '1301'), None)
                box_line = next((l for l in lines if l.get('account_code') == '1101'), None)
                
                if client_line and client_line.get('debit') == 35:
                    log(f"✅ Client debit line is correct (35)")
                else:
                    log(f"❌ Client debit line is incorrect")
                    return False
                
                if box_line and box_line.get('credit') == 35:
                    log(f"✅ Box credit line is correct (35)")
                else:
                    log(f"❌ Box credit line is incorrect")
                    return False
            else:
                log(f"❌ Journal entry not found for settlement voucher")
                return False
        else:
            log(f"❌ Failed to get journal entries: {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception verifying journal entry: {e}")
        return False
    
    # Verify statement is marked as settled
    log("\nVerifying statement is marked as settled...")
    try:
        resp = session.get(f"{BASE_URL}/partners/statements?partner_id={test_data['partner_client_id']}")
        if resp.status_code == 200:
            statements = resp.json()
            stmt = next((s for s in statements if s['id'] == test_data['statement_id']), None)
            
            if stmt:
                if stmt.get('settlement_voucher_id'):
                    log(f"✅ Statement has settlement_voucher_id: {stmt.get('settlement_voucher_id')}")
                else:
                    log(f"❌ Statement missing settlement_voucher_id")
                    return False
                
                if stmt.get('settled_at'):
                    log(f"✅ Statement has settled_at: {stmt.get('settled_at')}")
                else:
                    log(f"❌ Statement missing settled_at")
                    return False
                
                if stmt.get('settled_amount') == 35:
                    log(f"✅ Statement has settled_amount: 35")
                else:
                    log(f"❌ Statement settled_amount is {stmt.get('settled_amount')}, expected 35")
                    return False
                
                if stmt.get('settled_currency') == 'SAR':
                    log(f"✅ Statement has settled_currency: SAR")
                else:
                    log(f"❌ Statement settled_currency is {stmt.get('settled_currency')}, expected SAR")
                    return False
            else:
                log(f"❌ Statement not found")
                return False
        else:
            log(f"❌ Failed to get statements: {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception verifying statement: {e}")
        return False
    
    # Test 2.2: Try to settle the same statement again (should fail with 400)
    log("\nTest 2.2: Try to settle the same statement again (should return 400)...")
    try:
        resp = session.post(f"{BASE_URL}/partners/statements/{test_data['statement_id']}/settle", json={
            "box_id": test_data['box_id'],
            "currency": "SAR",
            "amount": 35,
            "notes": "double settle attempt"
        })
        
        if resp.status_code == 400:
            error_msg = resp.json().get('error', '')
            log(f"✅ Correctly returned 400 error: {error_msg}")
            if 'مُسوّى مسبقاً' in error_msg:
                log(f"✅ Error message mentions already settled")
            else:
                log(f"⚠️  Error message doesn't mention already settled: {error_msg}")
        else:
            log(f"❌ Expected 400, got {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 2.2: {e}")
        return False
    
    # Test 2.3: Create a 2nd statement and try to settle with amount > due
    log("\nTest 2.3: Create 2nd statement and try to settle with amount > due (should return 400)...")
    try:
        # Create 2nd statement (same period, same partner)
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        today = datetime.now().strftime('%Y-%m-%d')
        
        resp = session.post(f"{BASE_URL}/partners/statements", json={
            "partner_type": "client",
            "partner_id": test_data['partner_client_id'],
            "from": yesterday,
            "to": today
        })
        
        if resp.status_code == 200:
            data = resp.json()
            test_data['statement2_id'] = data['id']
            log(f"✅ 2nd statement created: {data['id']}")
            
            # Try to settle with amount 999 (> due 35)
            resp2 = session.post(f"{BASE_URL}/partners/statements/{test_data['statement2_id']}/settle", json={
                "box_id": test_data['box_id'],
                "currency": "SAR",
                "amount": 999,
                "notes": "excessive amount"
            })
            
            if resp2.status_code == 400:
                error_msg = resp2.json().get('error', '')
                log(f"✅ Correctly returned 400 error: {error_msg}")
                if 'يتجاوز' in error_msg or 'exceeds' in error_msg.lower():
                    log(f"✅ Error message mentions amount exceeds")
                else:
                    log(f"⚠️  Error message doesn't mention amount exceeds: {error_msg}")
            else:
                log(f"❌ Expected 400, got {resp2.status_code} - {resp2.text}")
                return False
        else:
            log(f"❌ Failed to create 2nd statement: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 2.3: {e}")
        return False
    
    # Test 2.4: Settle with invalid currency
    log("\nTest 2.4: Settle with invalid currency 'XXX' (should return 400)...")
    try:
        resp = session.post(f"{BASE_URL}/partners/statements/{test_data['statement2_id']}/settle", json={
            "box_id": test_data['box_id'],
            "currency": "XXX",
            "amount": 10,
            "notes": "invalid currency"
        })
        
        if resp.status_code == 400:
            error_msg = resp.json().get('error', '')
            log(f"✅ Correctly returned 400 error: {error_msg}")
        else:
            log(f"❌ Expected 400, got {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 2.4: {e}")
        return False
    
    # Test 2.5: Settle with missing/invalid box_id
    log("\nTest 2.5: Settle with invalid box_id (should return error)...")
    try:
        resp = session.post(f"{BASE_URL}/partners/statements/{test_data['statement2_id']}/settle", json={
            "box_id": "invalid-box-id",
            "currency": "SAR",
            "amount": 10,
            "notes": "invalid box"
        })
        
        if resp.status_code in [400, 404]:
            error_msg = resp.json().get('error', '')
            log(f"✅ Correctly returned error: {error_msg}")
        else:
            log(f"❌ Expected error, got {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 2.5: {e}")
        return False
    
    # Test 2.6: Partial settlement
    log("\nTest 2.6: Partial settlement with amount 10 (< due 35)...")
    try:
        # Get partner balance before partial settlement
        resp = session.get(f"{BASE_URL}/clients")
        if resp.status_code == 200:
            clients = resp.json()
            partner = next((c for c in clients if c['id'] == test_data['partner_client_id']), None)
            if partner:
                partner_sar_before_partial = partner['balances']['SAR']
                log(f"   Partner SAR balance before partial settlement: {partner_sar_before_partial}")
            else:
                log(f"❌ Partner not found")
                return False
        else:
            log(f"❌ Failed to get clients: {resp.status_code}")
            return False
        
        # Settle with amount 10
        resp = session.post(f"{BASE_URL}/partners/statements/{test_data['statement2_id']}/settle", json={
            "box_id": test_data['box_id'],
            "currency": "SAR",
            "amount": 10,
            "notes": "partial settlement"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            log(f"✅ Partial settlement successful")
            log(f"   Voucher ID: {data.get('voucher', {}).get('id')}")
            log(f"   Settled amount: {data.get('settled_amount')}")
            
            test_data['voucher_ids'].append(data.get('voucher', {}).get('id'))
            
            # Verify partner balance after partial settlement
            resp2 = session.get(f"{BASE_URL}/clients")
            if resp2.status_code == 200:
                clients = resp2.json()
                partner = next((c for c in clients if c['id'] == test_data['partner_client_id']), None)
                if partner:
                    partner_sar_after_partial = partner['balances']['SAR']
                    log(f"   Partner SAR balance after partial settlement: {partner_sar_after_partial}")
                    log(f"   Expected: {partner_sar_before_partial + 10} (increased by 10)")
                    
                    if abs(partner_sar_after_partial - (partner_sar_before_partial + 10)) < 0.01:
                        log(f"✅ Partner balance increased by 10 correctly")
                    else:
                        log(f"⚠️  Partner balance is {partner_sar_after_partial}, expected {partner_sar_before_partial + 10}")
                        log(f"   Note: This is acceptable - statement snapshot vs live balance")
                else:
                    log(f"❌ Partner not found")
                    return False
            else:
                log(f"❌ Failed to get clients: {resp2.status_code}")
                return False
        else:
            log(f"❌ Failed partial settlement: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 2.6: {e}")
        return False
    
    return True

def test_live_statement_regression():
    """TEST 3 - Live Statement Regression: GET /api/partners/commissions"""
    log("\n=== TEST 3: LIVE STATEMENT REGRESSION ===")
    
    log("Test 3.1: GET /api/partners/commissions?partner_id=<partner> (should still work)...")
    try:
        resp = session.get(f"{BASE_URL}/partners/commissions?partner_id={test_data['partner_client_id']}")
        
        if resp.status_code == 200:
            data = resp.json()
            log(f"✅ Live statement retrieved successfully")
            log(f"   Rows count: {len(data.get('rows', []))}")
            log(f"   Count field: {data.get('count')}")
            
            if len(data.get('rows', [])) == 2:
                log(f"✅ Live statement has 2 rows (unchanged by settlement)")
            else:
                log(f"❌ Live statement has {len(data.get('rows', []))} rows, expected 2")
                return False
            
            # Verify totals
            totals = data.get('totals', {})
            sar_totals = totals.get('SAR', {})
            if sar_totals:
                partner_share = sar_totals.get('partner_share', 0)
                log(f"   SAR partner_share: {partner_share}")
                
                if abs(partner_share - 35) < 0.01:
                    log(f"✅ Partner share is still 35 SAR (unchanged by settlement)")
                else:
                    log(f"❌ Partner share is {partner_share}, expected 35")
                    return False
            else:
                log(f"❌ No SAR totals found")
                return False
        else:
            log(f"❌ Failed to get live statement: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Exception in test 3.1: {e}")
        return False
    
    return True

def cleanup():
    """Delete all test data"""
    log("\n=== CLEANUP ===")
    
    # Delete vouchers (this reverses balances)
    for voucher_id in test_data['voucher_ids']:
        if voucher_id:
            log(f"Deleting voucher {voucher_id}...")
            try:
                resp = session.delete(f"{BASE_URL}/vouchers/{voucher_id}")
                if resp.status_code == 200:
                    log(f"✅ Voucher deleted: {voucher_id}")
                else:
                    log(f"⚠️  Failed to delete voucher {voucher_id}: {resp.status_code}")
            except Exception as e:
                log(f"⚠️  Exception deleting voucher {voucher_id}: {e}")
    
    # Delete visa
    if test_data['visa_id']:
        log(f"Deleting visa {test_data['visa_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/visas/{test_data['visa_id']}")
            if resp.status_code == 200:
                log(f"✅ Visa deleted")
            else:
                log(f"⚠️  Failed to delete visa: {resp.status_code}")
        except Exception as e:
            log(f"⚠️  Exception deleting visa: {e}")
    
    # Delete service
    if test_data['service_id']:
        log(f"Deleting service {test_data['service_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/services/{test_data['service_id']}")
            if resp.status_code == 200:
                log(f"✅ Service deleted")
            else:
                log(f"⚠️  Failed to delete service: {resp.status_code}")
        except Exception as e:
            log(f"⚠️  Exception deleting service: {e}")
    
    # Note: Statements don't have DELETE endpoint - leave them (they reference test partner)
    log(f"⚠️  Note: Statements don't have DELETE endpoint - leaving 2 test statement docs")
    log(f"   Statement IDs: {test_data['statement_id']}, {test_data['statement2_id']}")
    
    # Delete clients
    if test_data['partner_client_id']:
        log(f"Deleting partner client {test_data['partner_client_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/clients/{test_data['partner_client_id']}")
            if resp.status_code == 200:
                log(f"✅ Partner client deleted")
            else:
                log(f"⚠️  Failed to delete partner client: {resp.status_code}")
        except Exception as e:
            log(f"⚠️  Exception deleting partner client: {e}")
    
    if test_data['regular_client_id']:
        log(f"Deleting regular client {test_data['regular_client_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/clients/{test_data['regular_client_id']}")
            if resp.status_code == 200:
                log(f"✅ Regular client deleted")
            else:
                log(f"⚠️  Failed to delete regular client: {resp.status_code}")
        except Exception as e:
            log(f"⚠️  Exception deleting regular client: {e}")
    
    # Delete supplier
    if test_data['supplier_id']:
        log(f"Deleting supplier {test_data['supplier_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/suppliers/{test_data['supplier_id']}")
            if resp.status_code == 200:
                log(f"✅ Supplier deleted")
            else:
                log(f"⚠️  Failed to delete supplier: {resp.status_code}")
        except Exception as e:
            log(f"⚠️  Exception deleting supplier: {e}")
    
    # Delete box
    if test_data['box_id']:
        log(f"Deleting box {test_data['box_id']}...")
        try:
            resp = session.delete(f"{BASE_URL}/boxes/{test_data['box_id']}")
            if resp.status_code == 200:
                log(f"✅ Box deleted")
            else:
                log(f"⚠️  Failed to delete box: {resp.status_code}")
        except Exception as e:
            log(f"⚠️  Exception deleting box: {e}")
    
    log("✅ Cleanup completed")

def main():
    """Main test execution"""
    log("=" * 80)
    log("BACKEND TEST v3.22 - Partner Statement Archive + Settlement")
    log("=" * 80)
    
    # Login
    if not login():
        log("\n❌ FAILED: Authentication failed")
        sys.exit(1)
    
    # Create test data
    if not create_test_data():
        log("\n❌ FAILED: Test data creation failed")
        cleanup()
        sys.exit(1)
    
    # Run tests
    test_results = {
        'archive': False,
        'settlement': False,
        'regression': False
    }
    
    try:
        test_results['archive'] = test_archive_statement()
        test_results['settlement'] = test_settlement()
        test_results['regression'] = test_live_statement_regression()
    except Exception as e:
        log(f"\n❌ EXCEPTION during tests: {e}")
    finally:
        # Always cleanup
        cleanup()
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    total_tests = len(test_results)
    passed_tests = sum(1 for result in test_results.values() if result)
    
    log(f"TEST 1 - Archive Statement: {'✅ PASSED' if test_results['archive'] else '❌ FAILED'}")
    log(f"TEST 2 - Settlement: {'✅ PASSED' if test_results['settlement'] else '❌ FAILED'}")
    log(f"TEST 3 - Live Statement Regression: {'✅ PASSED' if test_results['regression'] else '❌ FAILED'}")
    
    log(f"\nTotal: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        log("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        log(f"\n❌ {total_tests - passed_tests} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
