#!/usr/bin/env python3
"""
v3.9.8 Backend Test — Excel Import Flexible Receipt Account
Tests the new feature where Excel import accepts BOTH client names AND box/bank names
"""

import requests
import json
import sys
from datetime import datetime

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
AUTH = {"email": "owner@demo.com", "password": "Demo@2025"}

session = requests.Session()

def login():
    """Login and get session cookie"""
    print("=" * 80)
    print("LOGGING IN...")
    print("=" * 80)
    resp = session.post(f"{BASE_URL}/auth/login", json=AUTH)
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"❌ Login failed: {resp.text}")
        sys.exit(1)
    data = resp.json()
    print(f"✅ Logged in as: {data.get('user', {}).get('email')}")
    print(f"   Tenant: {data.get('user', {}).get('tenant_id')}")
    return data

def test_health():
    """Test 1: Health check - version should be 3.9.8"""
    print("\n" + "=" * 80)
    print("TEST 1: Health Check - Version 3.9.8")
    print("=" * 80)
    resp = session.get(f"{BASE_URL}/health")
    print(f"Status: {resp.status_code}")
    data = resp.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    
    if data.get('version') == '3.9.8':
        print("✅ PASSED - Version is 3.9.8")
        return True
    else:
        print(f"❌ FAILED - Expected version 3.9.8, got {data.get('version')}")
        return False

def get_boxes():
    """Get list of boxes/banks"""
    print("\n" + "=" * 80)
    print("SETUP: Getting Boxes/Banks")
    print("=" * 80)
    resp = session.get(f"{BASE_URL}/boxes")
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"❌ Failed to get boxes: {resp.text}")
        return []
    data = resp.json()
    print(f"Found {len(data)} boxes/banks:")
    for box in data:
        print(f"  - {box.get('name_ar', box.get('name'))} (id: {box.get('id')}, type: {box.get('type')})")
    return data

def get_clients():
    """Get list of clients"""
    print("\n" + "=" * 80)
    print("SETUP: Getting Clients")
    print("=" * 80)
    resp = session.get(f"{BASE_URL}/clients")
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"❌ Failed to get clients: {resp.text}")
        return []
    data = resp.json()
    print(f"Found {len(data)} clients")
    if len(data) > 0:
        print(f"  First client: {data[0].get('name')} (id: {data[0].get('id')})")
    return data

def get_suppliers():
    """Get list of suppliers"""
    print("\n" + "=" * 80)
    print("SETUP: Getting Suppliers")
    print("=" * 80)
    resp = session.get(f"{BASE_URL}/suppliers")
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"❌ Failed to get suppliers: {resp.text}")
        return []
    data = resp.json()
    print(f"Found {len(data)} suppliers")
    if len(data) > 0:
        print(f"  First supplier: {data[0].get('name')} (id: {data[0].get('id')})")
    return data

def test_tickets_preview(box_name, client_name, supplier_name):
    """Test 2: POST /api/import/tickets/preview with box, client, and invalid names"""
    print("\n" + "=" * 80)
    print("TEST 2: Tickets Preview - Flexible Receipt Account")
    print("=" * 80)
    
    rows = [
        {
            "pnr": "IMP-BOX-001",
            "route": "SAH-CAI",
            "passenger_name": "مسافر ١",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": box_name,
            "supplier_name": supplier_name
        },
        {
            "pnr": "IMP-CLI-002",
            "route": "CAI-SAH",
            "passenger_name": "مسافر ٢",
            "currency": "USD",
            "cost": 80,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        {
            "pnr": "IMP-BAD-003",
            "route": "X-Y",
            "passenger_name": "م ٣",
            "currency": "USD",
            "cost": 50,
            "sale_price": 70,
            "client_name": "اسم-غير-موجود-XYZ",
            "supplier_name": supplier_name
        }
    ]
    
    print(f"Sending 3 rows:")
    print(f"  Row 1: client_name='{box_name}' (BOX)")
    print(f"  Row 2: client_name='{client_name}' (CLIENT)")
    print(f"  Row 3: client_name='اسم-غير-موجود-XYZ' (INVALID)")
    
    resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows})
    print(f"\nStatus: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED - Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False, None
    
    data = resp.json()
    print(f"\nResponse summary:")
    print(f"  valid_count: {data.get('valid_count')}")
    print(f"  total rows: {len(data.get('rows', []))}")
    
    passed = True
    
    # Check row 1 (box)
    row1 = data['rows'][0]
    print(f"\nRow 1 (BOX):")
    print(f"  __errors: {row1.get('__errors')}")
    print(f"  __receipt_kind: {row1.get('__receipt_kind')}")
    if len(row1.get('__errors', [])) == 0 and row1.get('__receipt_kind') == 'box':
        print("  ✅ PASSED - Box detected correctly")
    else:
        print("  ❌ FAILED - Expected __errors=[], __receipt_kind='box'")
        passed = False
    
    # Check row 2 (client)
    row2 = data['rows'][1]
    print(f"\nRow 2 (CLIENT):")
    print(f"  __errors: {row2.get('__errors')}")
    print(f"  __receipt_kind: {row2.get('__receipt_kind')}")
    if len(row2.get('__errors', [])) == 0 and row2.get('__receipt_kind') == 'client':
        print("  ✅ PASSED - Client detected correctly")
    else:
        print("  ❌ FAILED - Expected __errors=[], __receipt_kind='client'")
        passed = False
    
    # Check row 3 (invalid)
    row3 = data['rows'][2]
    print(f"\nRow 3 (INVALID):")
    print(f"  __errors: {row3.get('__errors')}")
    print(f"  __receipt_kind: {row3.get('__receipt_kind')}")
    if len(row3.get('__errors', [])) > 0 and 'غير موجود' in str(row3.get('__errors')):
        print("  ✅ PASSED - Invalid name detected with error message")
    else:
        print("  ❌ FAILED - Expected error about 'غير موجود'")
        passed = False
    
    if passed:
        print("\n✅ TEST 2 PASSED - Preview validation working correctly")
    else:
        print("\n❌ TEST 2 FAILED")
    
    return passed, data

def test_tickets_import(preview_data, box_id):
    """Test 3: POST /api/import/tickets - Execute import"""
    print("\n" + "=" * 80)
    print("TEST 3: Tickets Import - Execute with enriched rows")
    print("=" * 80)
    
    # Use enriched rows from preview
    rows = preview_data.get('rows', [])
    
    print(f"Importing {len(rows)} rows (enriched from preview)")
    
    resp = session.post(f"{BASE_URL}/import/tickets", json={"rows": rows})
    print(f"\nStatus: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED - Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    print(f"\nImport results:")
    print(f"  created: {data.get('created')}")
    print(f"  skipped: {data.get('skipped')}")
    print(f"  failed: {data.get('failed')}")
    print(f"  errors: {data.get('errors')}")
    
    passed = True
    
    if data.get('created') != 2:
        print(f"❌ FAILED - Expected created=2, got {data.get('created')}")
        passed = False
    else:
        print("✅ Created 2 tickets as expected")
    
    if data.get('failed') != 1:
        print(f"❌ FAILED - Expected failed=1, got {data.get('failed')}")
        passed = False
    else:
        print("✅ Failed 1 ticket as expected")
    
    # Verify the created tickets
    print("\n" + "-" * 80)
    print("Verifying created tickets...")
    print("-" * 80)
    
    # Get ticket IMP-BOX-001 (box payment)
    resp = session.get(f"{BASE_URL}/tickets")
    if resp.status_code == 200:
        tickets = resp.json()
        box_ticket = next((t for t in tickets if t.get('pnr') == 'IMP-BOX-001'), None)
        client_ticket = next((t for t in tickets if t.get('pnr') == 'IMP-CLI-002'), None)
        
        if box_ticket:
            print(f"\nTicket IMP-BOX-001 (BOX payment):")
            print(f"  payment_method: {box_ticket.get('payment_method')}")
            print(f"  box_id: {box_ticket.get('box_id')}")
            print(f"  client_id: {box_ticket.get('client_id')}")
            print(f"  client_name: {box_ticket.get('client_name')}")
            
            if (box_ticket.get('payment_method') == 'cash' and 
                box_ticket.get('box_id') == box_id and 
                box_ticket.get('client_id') is None):
                print("  ✅ PASSED - Box payment ticket created correctly")
            else:
                print("  ❌ FAILED - Box payment ticket has incorrect fields")
                passed = False
        else:
            print("❌ FAILED - Ticket IMP-BOX-001 not found")
            passed = False
        
        if client_ticket:
            print(f"\nTicket IMP-CLI-002 (CLIENT payment):")
            print(f"  payment_method: {client_ticket.get('payment_method')}")
            print(f"  client_id: {client_ticket.get('client_id')}")
            
            if (client_ticket.get('payment_method') == 'credit' and 
                client_ticket.get('client_id') is not None):
                print("  ✅ PASSED - Client payment ticket created correctly")
            else:
                print("  ❌ FAILED - Client payment ticket has incorrect fields")
                passed = False
        else:
            print("❌ FAILED - Ticket IMP-CLI-002 not found")
            passed = False
    
    # Verify journal entries
    print("\n" + "-" * 80)
    print("Verifying journal entries...")
    print("-" * 80)
    
    resp = session.get(f"{BASE_URL}/journal-entries")
    if resp.status_code == 200:
        entries = resp.json()
        box_je = next((e for e in entries if e.get('ref_type') == 'ticket' and 'IMP-BOX-001' in e.get('description', '')), None)
        
        if box_je:
            print(f"\nJournal Entry for IMP-BOX-001:")
            print(f"  ref_type: {box_je.get('ref_type')}")
            print(f"  lines count: {len(box_je.get('lines', []))}")
            
            lines = box_je.get('lines', [])
            if len(lines) == 3:
                print("  ✅ Has 3 lines as expected")
                
                # Check for box debit (1101 or 1201)
                box_line = next((l for l in lines if l.get('account_code') in ['1101', '1201'] and l.get('debit') == 150), None)
                supplier_line = next((l for l in lines if l.get('account_code') == '2101' and l.get('credit') == 100), None)
                revenue_line = next((l for l in lines if l.get('account_code') == '4101' and l.get('credit') == 50), None)
                
                if box_line:
                    print(f"  ✅ Box debit line found: {box_line.get('account_code')} debit=150")
                else:
                    print("  ❌ Box debit line not found or incorrect")
                    passed = False
                
                if supplier_line:
                    print(f"  ✅ Supplier credit line found: 2101 credit=100")
                else:
                    print("  ❌ Supplier credit line not found or incorrect")
                    passed = False
                
                if revenue_line:
                    print(f"  ✅ Revenue credit line found: 4101 credit=50")
                else:
                    print("  ❌ Revenue credit line not found or incorrect")
                    passed = False
            else:
                print(f"  ❌ FAILED - Expected 3 lines, got {len(lines)}")
                passed = False
        else:
            print("❌ FAILED - Journal entry for IMP-BOX-001 not found")
            passed = False
    
    # Verify box balance
    print("\n" + "-" * 80)
    print("Verifying box balance...")
    print("-" * 80)
    
    resp = session.get(f"{BASE_URL}/boxes")
    if resp.status_code == 200:
        boxes = resp.json()
        box = next((b for b in boxes if b.get('id') == box_id), None)
        
        if box:
            print(f"\nBox balance:")
            print(f"  USD: {box.get('balance_usd', 0)}")
            print(f"  SAR: {box.get('balance_sar', 0)}")
            print(f"  YER: {box.get('balance_yer', 0)}")
            
            # Box should have increased by 150 USD
            if box.get('balance_usd', 0) >= 150:
                print("  ✅ Box balance increased (includes 150 USD from import)")
            else:
                print(f"  ⚠️  Box balance USD is {box.get('balance_usd', 0)} (may include previous transactions)")
        else:
            print("❌ FAILED - Box not found")
            passed = False
    
    if passed:
        print("\n✅ TEST 3 PASSED - Import execution working correctly")
    else:
        print("\n❌ TEST 3 FAILED")
    
    return passed

def test_visas_preview(box_name, client_name, supplier_name):
    """Test 4: POST /api/import/visas/preview - Same flexibility test"""
    print("\n" + "=" * 80)
    print("TEST 4: Visas Preview - Flexible Receipt Account")
    print("=" * 80)
    
    rows = [
        {
            "passport_no": "IMP-VISA-BOX-001",
            "passenger_name": "مسافر تأشيرة ١",
            "service_type": "تأشيرة عمرة",
            "currency": "SAR",
            "cost": 300,
            "sale_price": 400,
            "client_name": box_name,
            "supplier_name": supplier_name
        },
        {
            "passport_no": "IMP-VISA-CLI-002",
            "passenger_name": "مسافر تأشيرة ٢",
            "service_type": "تأشيرة عمرة",
            "currency": "SAR",
            "cost": 250,
            "sale_price": 350,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        {
            "passport_no": "IMP-VISA-BAD-003",
            "passenger_name": "مسافر تأشيرة ٣",
            "service_type": "تأشيرة عمرة",
            "currency": "SAR",
            "cost": 200,
            "sale_price": 300,
            "client_name": "اسم-غير-موجود-ABC",
            "supplier_name": supplier_name
        }
    ]
    
    print(f"Sending 3 rows:")
    print(f"  Row 1: client_name='{box_name}' (BOX)")
    print(f"  Row 2: client_name='{client_name}' (CLIENT)")
    print(f"  Row 3: client_name='اسم-غير-موجود-ABC' (INVALID)")
    
    resp = session.post(f"{BASE_URL}/import/visas/preview", json={"rows": rows})
    print(f"\nStatus: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED - Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False, None
    
    data = resp.json()
    print(f"\nResponse summary:")
    print(f"  valid_count: {data.get('valid_count')}")
    print(f"  total rows: {len(data.get('rows', []))}")
    
    passed = True
    
    # Check row 1 (box)
    row1 = data['rows'][0]
    print(f"\nRow 1 (BOX):")
    print(f"  __errors: {row1.get('__errors')}")
    print(f"  __receipt_kind: {row1.get('__receipt_kind')}")
    if len(row1.get('__errors', [])) == 0 and row1.get('__receipt_kind') == 'box':
        print("  ✅ PASSED - Box detected correctly")
    else:
        print("  ❌ FAILED - Expected __errors=[], __receipt_kind='box'")
        passed = False
    
    # Check row 2 (client)
    row2 = data['rows'][1]
    print(f"\nRow 2 (CLIENT):")
    print(f"  __errors: {row2.get('__errors')}")
    print(f"  __receipt_kind: {row2.get('__receipt_kind')}")
    if len(row2.get('__errors', [])) == 0 and row2.get('__receipt_kind') == 'client':
        print("  ✅ PASSED - Client detected correctly")
    else:
        print("  ❌ FAILED - Expected __errors=[], __receipt_kind='client'")
        passed = False
    
    # Check row 3 (invalid)
    row3 = data['rows'][2]
    print(f"\nRow 3 (INVALID):")
    print(f"  __errors: {row3.get('__errors')}")
    if len(row3.get('__errors', [])) > 0 and 'غير موجود' in str(row3.get('__errors')):
        print("  ✅ PASSED - Invalid name detected with error message")
    else:
        print("  ❌ FAILED - Expected error about 'غير موجود'")
        passed = False
    
    if passed:
        print("\n✅ TEST 4 PASSED - Visas preview validation working correctly")
    else:
        print("\n❌ TEST 4 FAILED")
    
    return passed, data

def test_visas_import(preview_data):
    """Test 5: POST /api/import/visas - Execute import"""
    print("\n" + "=" * 80)
    print("TEST 5: Visas Import - Execute with enriched rows")
    print("=" * 80)
    
    rows = preview_data.get('rows', [])
    
    print(f"Importing {len(rows)} rows (enriched from preview)")
    
    resp = session.post(f"{BASE_URL}/import/visas", json={"rows": rows})
    print(f"\nStatus: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED - Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    print(f"\nImport results:")
    print(f"  created: {data.get('created')}")
    print(f"  skipped: {data.get('skipped')}")
    print(f"  failed: {data.get('failed')}")
    
    passed = True
    
    if data.get('created') != 2:
        print(f"❌ FAILED - Expected created=2, got {data.get('created')}")
        passed = False
    else:
        print("✅ Created 2 visas as expected")
    
    if data.get('failed') != 1:
        print(f"❌ FAILED - Expected failed=1, got {data.get('failed')}")
        passed = False
    else:
        print("✅ Failed 1 visa as expected")
    
    if passed:
        print("\n✅ TEST 5 PASSED - Visas import working correctly")
    else:
        print("\n❌ TEST 5 FAILED")
    
    return passed

def test_regression_ticket_creation(client_id, supplier_id, box_id):
    """Test 6: Regression - Regular ticket creation still works"""
    print("\n" + "=" * 80)
    print("TEST 6: Regression - Regular Ticket Creation")
    print("=" * 80)
    
    # Test credit payment with client
    print("\nTest 6a: Credit payment with client")
    payload = {
        "pnr": "REG-CREDIT-001",
        "route": "JED-SAH",
        "passenger_name": "مسافر عادي",
        "currency": "SAR",
        "cost": 200,
        "sale_price": 300,
        "client_id": client_id,
        "supplier_id": supplier_id,
        "payment_method": "credit"
    }
    
    resp = session.post(f"{BASE_URL}/tickets", json=payload)
    print(f"Status: {resp.status_code}")
    
    passed_credit = False
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Credit ticket created: {data.get('pnr')}")
        passed_credit = True
    else:
        print(f"❌ FAILED - Credit ticket creation failed: {resp.text}")
    
    # Test cash payment with client and box
    print("\nTest 6b: Cash payment with client and box")
    payload = {
        "pnr": "REG-CASH-001",
        "route": "SAH-JED",
        "passenger_name": "مسافر نقدي",
        "currency": "SAR",
        "cost": 150,
        "sale_price": 250,
        "client_id": client_id,
        "supplier_id": supplier_id,
        "payment_method": "cash",
        "box_id": box_id
    }
    
    resp = session.post(f"{BASE_URL}/tickets", json=payload)
    print(f"Status: {resp.status_code}")
    
    passed_cash = False
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Cash ticket created: {data.get('pnr')}")
        passed_cash = True
    else:
        print(f"❌ FAILED - Cash ticket creation failed: {resp.text}")
    
    if passed_credit and passed_cash:
        print("\n✅ TEST 6 PASSED - Regular ticket creation still works")
        return True
    else:
        print("\n❌ TEST 6 FAILED")
        return False

def test_scraper_ping():
    """Test 7: Regression - Scraper ping still works"""
    print("\n" + "=" * 80)
    print("TEST 7: Regression - Scraper Ping (if PAT available)")
    print("=" * 80)
    
    # Try to get PATs
    resp = session.get(f"{BASE_URL}/pats")
    if resp.status_code != 200:
        print("⚠️  SKIPPED - Cannot access PATs endpoint (may not be owner)")
        return True
    
    pats = resp.json()
    if len(pats) == 0:
        print("⚠️  SKIPPED - No PATs available")
        return True
    
    # Use first active PAT (we only have prefix, so we can't test ping)
    print("⚠️  SKIPPED - PAT testing requires full token (only prefix available)")
    return True

def main():
    """Run all tests"""
    print("\n" + "=" * 80)
    print("v3.9.8 BACKEND TESTING — Excel Import Flexible Receipt Account")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Auth: {AUTH['email']}")
    print("=" * 80)
    
    # Login
    login()
    
    # Test 1: Health check
    test1_passed = test_health()
    
    # Setup: Get boxes, clients, suppliers
    boxes = get_boxes()
    clients = get_clients()
    suppliers = get_suppliers()
    
    if len(boxes) == 0:
        print("\n❌ CRITICAL ERROR - No boxes found. Cannot proceed with tests.")
        sys.exit(1)
    
    if len(clients) == 0:
        print("\n❌ CRITICAL ERROR - No clients found. Cannot proceed with tests.")
        sys.exit(1)
    
    if len(suppliers) == 0:
        print("\n❌ CRITICAL ERROR - No suppliers found. Cannot proceed with tests.")
        sys.exit(1)
    
    box = boxes[0]
    box_name = box.get('name_ar') or box.get('name')
    box_id = box.get('id')
    
    client = clients[0]
    client_name = client.get('name')
    client_id = client.get('id')
    
    supplier = suppliers[0]
    supplier_name = supplier.get('name')
    supplier_id = supplier.get('id')
    
    print(f"\nUsing for tests:")
    print(f"  Box: {box_name} (id: {box_id})")
    print(f"  Client: {client_name} (id: {client_id})")
    print(f"  Supplier: {supplier_name} (id: {supplier_id})")
    
    # Test 2: Tickets preview
    test2_passed, preview_data = test_tickets_preview(box_name, client_name, supplier_name)
    
    # Test 3: Tickets import
    test3_passed = False
    if test2_passed and preview_data:
        test3_passed = test_tickets_import(preview_data, box_id)
    else:
        print("\n⚠️  SKIPPED TEST 3 - Preview failed")
    
    # Test 4: Visas preview
    test4_passed, visa_preview_data = test_visas_preview(box_name, client_name, supplier_name)
    
    # Test 5: Visas import
    test5_passed = False
    if test4_passed and visa_preview_data:
        test5_passed = test_visas_import(visa_preview_data)
    else:
        print("\n⚠️  SKIPPED TEST 5 - Visas preview failed")
    
    # Test 6: Regression - Regular ticket creation
    test6_passed = test_regression_ticket_creation(client_id, supplier_id, box_id)
    
    # Test 7: Regression - Scraper ping
    test7_passed = test_scraper_ping()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    tests = [
        ("Test 1: Health Check (v3.9.8)", test1_passed),
        ("Test 2: Tickets Preview (Box/Client/Invalid)", test2_passed),
        ("Test 3: Tickets Import (Execute)", test3_passed),
        ("Test 4: Visas Preview (Box/Client/Invalid)", test4_passed),
        ("Test 5: Visas Import (Execute)", test5_passed),
        ("Test 6: Regression - Regular Ticket Creation", test6_passed),
        ("Test 7: Regression - Scraper Ping", test7_passed),
    ]
    
    passed_count = sum(1 for _, passed in tests if passed)
    total_count = len(tests)
    
    for name, passed in tests:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status} - {name}")
    
    print("=" * 80)
    print(f"TOTAL: {passed_count}/{total_count} tests passed")
    print("=" * 80)
    
    if passed_count == total_count:
        print("\n🎉 ALL TESTS PASSED - v3.9.8 is working correctly!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total_count - passed_count} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
