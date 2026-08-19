#!/usr/bin/env python3
"""
Backend Test Script for v3.13 Duplicate Detection Rule
Tests import preview endpoints for tickets and visas
"""

import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
EMAIL = "owner@demo.com"
PASSWORD = "Demo@2025"

# Global session variable
session_cookie = None
tenant_id = None

def login():
    """Login and get session cookie"""
    global session_cookie, tenant_id
    print("\n" + "="*80)
    print("AUTHENTICATION")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": EMAIL, "password": PASSWORD},
            timeout=30
        )
        print(f"✓ Login request sent: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Login successful: {data.get('user', {}).get('email')}")
            
            # Get session cookie
            if 'rahaal_session' in response.cookies:
                session_cookie = response.cookies['rahaal_session']
                print(f"✓ Session cookie obtained")
            
            # Get tenant_id
            if 'tenant' in data and 'id' in data['tenant']:
                tenant_id = data['tenant']['id']
                print(f"✓ Tenant ID: {tenant_id}")
            
            return True
        else:
            print(f"✗ Login failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"✗ Login error: {str(e)}")
        return False

def get_headers():
    """Get headers with session cookie"""
    headers = {"Content-Type": "application/json"}
    if session_cookie:
        headers["Cookie"] = f"rahaal_session={session_cookie}"
    return headers

def get_existing_client_and_supplier():
    """Get existing client and supplier IDs and names"""
    print("\n" + "="*80)
    print("SETUP: Getting existing client and supplier")
    print("="*80)
    
    try:
        # Get clients
        response = requests.get(f"{BASE_URL}/clients", headers=get_headers(), timeout=30)
        if response.status_code == 200:
            clients = response.json()
            if clients and len(clients) > 0:
                client_id = clients[0]['id']
                client_name = clients[0]['name']
                print(f"✓ Found client: {client_name} (ID: {client_id})")
            else:
                print(f"✗ No clients found")
                return None, None, None, None
        else:
            print(f"✗ Failed to get clients: {response.status_code}")
            return None, None, None, None
        
        # Get suppliers
        response = requests.get(f"{BASE_URL}/suppliers", headers=get_headers(), timeout=30)
        if response.status_code == 200:
            suppliers = response.json()
            if suppliers and len(suppliers) > 0:
                supplier_id = suppliers[0]['id']
                supplier_name = suppliers[0]['name']
                print(f"✓ Found supplier: {supplier_name} (ID: {supplier_id})")
            else:
                print(f"✗ No suppliers found")
                return None, None, None, None
        else:
            print(f"✗ Failed to get suppliers: {response.status_code}")
            return None, None, None, None
        
        return client_id, client_name, supplier_id, supplier_name
    except Exception as e:
        print(f"✗ Error getting client/supplier: {str(e)}")
        return None, None, None, None

def create_test_ticket(client_id, supplier_id):
    """Create a test ticket for duplicate detection testing"""
    print("\n" + "="*80)
    print("SETUP: Creating test ticket")
    print("="*80)
    
    ticket_data = {
        "passenger_name": "اختبار التكرار",
        "pnr": "DUPTEST1",
        "travel_date": "2026-09-01",
        "phone": "555-0001",
        "currency": "USD",
        "cost": 100,
        "sale_price": 120,
        "client_id": client_id,
        "supplier_id": supplier_id,
        "payment_method": "credit"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/tickets",
            json=ticket_data,
            headers=get_headers(),
            timeout=30
        )
        print(f"✓ Create ticket request sent: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            ticket_id = data.get('id')
            print(f"✓ Test ticket created successfully")
            print(f"  - ID: {ticket_id}")
            print(f"  - PNR: {ticket_data['pnr']}")
            print(f"  - Passenger: {ticket_data['passenger_name']}")
            print(f"  - Date: {ticket_data['travel_date']}")
            return ticket_id
        else:
            print(f"✗ Failed to create ticket: {response.status_code}")
            print(f"  Response: {response.text}")
            return None
    except Exception as e:
        print(f"✗ Error creating ticket: {str(e)}")
        return None

def create_test_visa(client_id, supplier_id):
    """Create a test visa for duplicate detection testing"""
    print("\n" + "="*80)
    print("SETUP: Creating test visa")
    print("="*80)
    
    visa_data = {
        "passenger_name": "اختبار التكرار فيزا",
        "beneficiary_name": "اختبار التكرار فيزا",
        "passport_no": "DUPP0001",
        "entry_date": "2026-09-01",
        "phone": "555-0002",
        "service_type": "تأشيرة عمرة",
        "currency": "USD",
        "cost": 100,
        "sale_price": 120,
        "client_id": client_id,
        "supplier_id": supplier_id,
        "payment_method": "credit"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/visas",
            json=visa_data,
            headers=get_headers(),
            timeout=30
        )
        print(f"✓ Create visa request sent: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            visa_id = data.get('id')
            print(f"✓ Test visa created successfully")
            print(f"  - ID: {visa_id}")
            print(f"  - Passport: {visa_data['passport_no']}")
            print(f"  - Passenger: {visa_data['passenger_name']}")
            print(f"  - Date: {visa_data['entry_date']}")
            return visa_id
        else:
            print(f"✗ Failed to create visa: {response.status_code}")
            print(f"  Response: {response.text}")
            return None
    except Exception as e:
        print(f"✗ Error creating visa: {str(e)}")
        return None

def test_ticket_import_preview(client_name, supplier_name):
    """Test ticket import preview with duplicate detection scenarios"""
    print("\n" + "="*80)
    print("TEST: Ticket Import Preview - Duplicate Detection")
    print("="*80)
    
    test_results = []
    
    # Test rows covering all scenarios
    rows = [
        # Case 1: Same PNR + SAME date → expect duplicate
        {
            "passenger_name": "مسافر 1",
            "pnr": "DUPTEST1",
            "travel_date": "2026-09-01",
            "phone": "555-1001",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        # Case 2: Same PNR + DIFFERENT date → expect NOT duplicate ✅
        {
            "passenger_name": "مسافر 2",
            "pnr": "DUPTEST1",
            "travel_date": "2026-09-05",
            "phone": "555-1002",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        # Case 3: Same name + SAME date (no PNR) → expect duplicate
        {
            "passenger_name": "اختبار التكرار",
            "travel_date": "2026-09-01",
            "phone": "555-1003",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        # Case 4: Same name + DIFFERENT date (no PNR) → expect NOT duplicate ✅
        {
            "passenger_name": "اختبار التكرار",
            "travel_date": "2026-09-03",
            "phone": "555-1004",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        # Case 5a: In-batch duplicate - same PNR + same date
        {
            "passenger_name": "مسافر 5a",
            "pnr": "BATCH001",
            "travel_date": "2026-09-10",
            "phone": "555-1005",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        # Case 5b: In-batch duplicate - same PNR + same date (should be flagged)
        {
            "passenger_name": "مسافر 5b",
            "pnr": "BATCH001",
            "travel_date": "2026-09-10",
            "phone": "555-1006",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        # Case 5c: Same PNR but DIFFERENT date (should NOT be flagged)
        {
            "passenger_name": "مسافر 5c",
            "pnr": "BATCH001",
            "travel_date": "2026-09-15",
            "phone": "555-1007",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        }
    ]
    
    try:
        response = requests.post(
            f"{BASE_URL}/import/tickets/preview",
            json={"rows": rows},
            headers=get_headers(),
            timeout=30
        )
        print(f"✓ Preview request sent: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            preview_rows = data.get('rows', [])
            
            print(f"\n✓ Preview response received with {len(preview_rows)} rows")
            print(f"  Valid count: {data.get('valid_count', 0)}")
            
            # Test Case 1: Same PNR + SAME date
            row1 = preview_rows[0] if len(preview_rows) > 0 else {}
            if row1.get('__dup') and 'PNR' in str(row1.get('__dup')) and 'نفس التاريخ' in str(row1.get('__dup')):
                print(f"\n✅ CASE 1 PASSED: Same PNR + same date flagged as duplicate")
                print(f"   Row 1: {row1.get('__dup')}")
                test_results.append(("Case 1: Same PNR + same date", True, row1.get('__dup')))
            else:
                print(f"\n❌ CASE 1 FAILED: Same PNR + same date NOT flagged as duplicate")
                print(f"   Row 1 __dup: {row1.get('__dup')}")
                test_results.append(("Case 1: Same PNR + same date", False, row1.get('__dup')))
            
            # Test Case 2: Same PNR + DIFFERENT date
            row2 = preview_rows[1] if len(preview_rows) > 1 else {}
            if not row2.get('__dup') or row2.get('__dup') == False:
                print(f"\n✅ CASE 2 PASSED: Same PNR + different date NOT flagged as duplicate")
                print(f"   Row 2 __dup: {row2.get('__dup')}")
                test_results.append(("Case 2: Same PNR + different date", True, row2.get('__dup')))
            else:
                print(f"\n❌ CASE 2 FAILED: Same PNR + different date incorrectly flagged")
                print(f"   Row 2 __dup: {row2.get('__dup')}")
                test_results.append(("Case 2: Same PNR + different date", False, row2.get('__dup')))
            
            # Test Case 3: Same name + SAME date
            row3 = preview_rows[2] if len(preview_rows) > 2 else {}
            if row3.get('__dup') and ('اسم' in str(row3.get('__dup')) or 'تاريخ' in str(row3.get('__dup'))):
                print(f"\n✅ CASE 3 PASSED: Same name + same date flagged as duplicate")
                print(f"   Row 3 __dup: {row3.get('__dup')}")
                test_results.append(("Case 3: Same name + same date", True, row3.get('__dup')))
            else:
                print(f"\n❌ CASE 3 FAILED: Same name + same date NOT flagged as duplicate")
                print(f"   Row 3 __dup: {row3.get('__dup')}")
                test_results.append(("Case 3: Same name + same date", False, row3.get('__dup')))
            
            # Test Case 4: Same name + DIFFERENT date
            row4 = preview_rows[3] if len(preview_rows) > 3 else {}
            if not row4.get('__dup') or row4.get('__dup') == False:
                print(f"\n✅ CASE 4 PASSED: Same name + different date NOT flagged as duplicate")
                print(f"   Row 4 __dup: {row4.get('__dup')}")
                test_results.append(("Case 4: Same name + different date", True, row4.get('__dup')))
            else:
                print(f"\n❌ CASE 4 FAILED: Same name + different date incorrectly flagged")
                print(f"   Row 4 __dup: {row4.get('__dup')}")
                test_results.append(("Case 4: Same name + different date", False, row4.get('__dup')))
            
            # Test Case 5: In-batch duplicates
            row5a = preview_rows[4] if len(preview_rows) > 4 else {}
            row5b = preview_rows[5] if len(preview_rows) > 5 else {}
            row5c = preview_rows[6] if len(preview_rows) > 6 else {}
            
            # First occurrence should not be flagged
            if not row5a.get('__dup') or row5a.get('__dup') == False:
                print(f"\n✅ CASE 5a PASSED: First occurrence of PNR+date NOT flagged")
                print(f"   Row 5a __dup: {row5a.get('__dup')}")
                test_results.append(("Case 5a: First occurrence", True, row5a.get('__dup')))
            else:
                print(f"\n❌ CASE 5a FAILED: First occurrence incorrectly flagged")
                print(f"   Row 5a __dup: {row5a.get('__dup')}")
                test_results.append(("Case 5a: First occurrence", False, row5a.get('__dup')))
            
            # Second occurrence with same PNR+date should be flagged
            if row5b.get('__dup') and 'مكرر' in str(row5b.get('__dup')) and 'الملف' in str(row5b.get('__dup')):
                print(f"\n✅ CASE 5b PASSED: In-batch duplicate (same PNR+date) flagged")
                print(f"   Row 5b __dup: {row5b.get('__dup')}")
                test_results.append(("Case 5b: In-batch duplicate same date", True, row5b.get('__dup')))
            else:
                print(f"\n❌ CASE 5b FAILED: In-batch duplicate NOT flagged")
                print(f"   Row 5b __dup: {row5b.get('__dup')}")
                test_results.append(("Case 5b: In-batch duplicate same date", False, row5b.get('__dup')))
            
            # Same PNR but different date should NOT be flagged
            if not row5c.get('__dup') or row5c.get('__dup') == False:
                print(f"\n✅ CASE 5c PASSED: Same PNR + different date in batch NOT flagged")
                print(f"   Row 5c __dup: {row5c.get('__dup')}")
                test_results.append(("Case 5c: Same PNR different date in batch", True, row5c.get('__dup')))
            else:
                print(f"\n❌ CASE 5c FAILED: Same PNR + different date incorrectly flagged")
                print(f"   Row 5c __dup: {row5c.get('__dup')}")
                test_results.append(("Case 5c: Same PNR different date in batch", False, row5c.get('__dup')))
            
        else:
            print(f"✗ Preview request failed: {response.status_code}")
            print(f"  Response: {response.text}")
            test_results.append(("Ticket preview request", False, f"Status {response.status_code}"))
    
    except Exception as e:
        print(f"✗ Error testing ticket preview: {str(e)}")
        test_results.append(("Ticket preview request", False, str(e)))
    
    return test_results

def test_visa_import_preview(client_name, supplier_name):
    """Test visa import preview with duplicate detection scenarios"""
    print("\n" + "="*80)
    print("TEST: Visa Import Preview - Duplicate Detection")
    print("="*80)
    
    test_results = []
    
    # Test rows covering all scenarios
    rows = [
        # Case 6: Same passport + SAME date → expect duplicate
        {
            "passenger_name": "معتمر 1",
            "beneficiary_name": "معتمر 1",
            "passport_no": "DUPP0001",
            "entry_date": "2026-09-01",
            "phone": "555-2001",
            "service_type": "تأشيرة عمرة",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        # Case 7: Same passport + DIFFERENT date → expect NOT duplicate ✅
        {
            "passenger_name": "معتمر 2",
            "beneficiary_name": "معتمر 2",
            "passport_no": "DUPP0001",
            "entry_date": "2026-09-05",
            "phone": "555-2002",
            "service_type": "تأشيرة عمرة",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        # Case 8a: Same name + SAME date → expect duplicate
        {
            "passenger_name": "اختبار التكرار فيزا",
            "beneficiary_name": "اختبار التكرار فيزا",
            "entry_date": "2026-09-01",
            "phone": "555-2003",
            "service_type": "تأشيرة عمرة",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        # Case 8b: Same name + DIFFERENT date → expect NOT duplicate ✅
        {
            "passenger_name": "اختبار التكرار فيزا",
            "beneficiary_name": "اختبار التكرار فيزا",
            "entry_date": "2026-09-03",
            "phone": "555-2004",
            "service_type": "تأشيرة عمرة",
            "currency": "USD",
            "cost": 100,
            "sale_price": 120,
            "client_name": client_name,
            "supplier_name": supplier_name
        }
    ]
    
    try:
        response = requests.post(
            f"{BASE_URL}/import/visas/preview",
            json={"rows": rows},
            headers=get_headers(),
            timeout=30
        )
        print(f"✓ Preview request sent: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            preview_rows = data.get('rows', [])
            
            print(f"\n✓ Preview response received with {len(preview_rows)} rows")
            print(f"  Valid count: {data.get('valid_count', 0)}")
            
            # Test Case 6: Same passport + SAME date
            row6 = preview_rows[0] if len(preview_rows) > 0 else {}
            if row6.get('__dup') and 'جواز' in str(row6.get('__dup')) and 'نفس التاريخ' in str(row6.get('__dup')):
                print(f"\n✅ CASE 6 PASSED: Same passport + same date flagged as duplicate")
                print(f"   Row 1 __dup: {row6.get('__dup')}")
                test_results.append(("Case 6: Same passport + same date", True, row6.get('__dup')))
            else:
                print(f"\n❌ CASE 6 FAILED: Same passport + same date NOT flagged as duplicate")
                print(f"   Row 1 __dup: {row6.get('__dup')}")
                test_results.append(("Case 6: Same passport + same date", False, row6.get('__dup')))
            
            # Test Case 7: Same passport + DIFFERENT date
            row7 = preview_rows[1] if len(preview_rows) > 1 else {}
            if not row7.get('__dup') or row7.get('__dup') == False:
                print(f"\n✅ CASE 7 PASSED: Same passport + different date NOT flagged as duplicate")
                print(f"   Row 2 __dup: {row7.get('__dup')}")
                test_results.append(("Case 7: Same passport + different date", True, row7.get('__dup')))
            else:
                print(f"\n❌ CASE 7 FAILED: Same passport + different date incorrectly flagged")
                print(f"   Row 2 __dup: {row7.get('__dup')}")
                test_results.append(("Case 7: Same passport + different date", False, row7.get('__dup')))
            
            # Test Case 8a: Same name + SAME date
            row8a = preview_rows[2] if len(preview_rows) > 2 else {}
            if row8a.get('__dup') and ('اسم' in str(row8a.get('__dup')) or 'تاريخ' in str(row8a.get('__dup'))):
                print(f"\n✅ CASE 8a PASSED: Same name + same date flagged as duplicate")
                print(f"   Row 3 __dup: {row8a.get('__dup')}")
                test_results.append(("Case 8a: Same name + same date", True, row8a.get('__dup')))
            else:
                print(f"\n❌ CASE 8a FAILED: Same name + same date NOT flagged as duplicate")
                print(f"   Row 3 __dup: {row8a.get('__dup')}")
                test_results.append(("Case 8a: Same name + same date", False, row8a.get('__dup')))
            
            # Test Case 8b: Same name + DIFFERENT date
            row8b = preview_rows[3] if len(preview_rows) > 3 else {}
            if not row8b.get('__dup') or row8b.get('__dup') == False:
                print(f"\n✅ CASE 8b PASSED: Same name + different date NOT flagged as duplicate")
                print(f"   Row 4 __dup: {row8b.get('__dup')}")
                test_results.append(("Case 8b: Same name + different date", True, row8b.get('__dup')))
            else:
                print(f"\n❌ CASE 8b FAILED: Same name + different date incorrectly flagged")
                print(f"   Row 4 __dup: {row8b.get('__dup')}")
                test_results.append(("Case 8b: Same name + different date", False, row8b.get('__dup')))
            
        else:
            print(f"✗ Preview request failed: {response.status_code}")
            print(f"  Response: {response.text}")
            test_results.append(("Visa preview request", False, f"Status {response.status_code}"))
    
    except Exception as e:
        print(f"✗ Error testing visa preview: {str(e)}")
        test_results.append(("Visa preview request", False, str(e)))
    
    return test_results

def cleanup_test_data(ticket_id, visa_id):
    """Delete test ticket and visa"""
    print("\n" + "="*80)
    print("CLEANUP: Deleting test data")
    print("="*80)
    
    cleanup_results = []
    
    # Delete ticket
    if ticket_id:
        try:
            response = requests.delete(
                f"{BASE_URL}/tickets/{ticket_id}",
                headers=get_headers(),
                timeout=30
            )
            if response.status_code == 200:
                print(f"✓ Test ticket deleted: {ticket_id}")
                cleanup_results.append(("Delete ticket", True, ticket_id))
            else:
                print(f"⚠ Failed to delete ticket {ticket_id}: {response.status_code}")
                print(f"  Note: Ticket ID {ticket_id} may need manual cleanup")
                cleanup_results.append(("Delete ticket", False, f"Status {response.status_code}"))
        except Exception as e:
            print(f"⚠ Error deleting ticket: {str(e)}")
            cleanup_results.append(("Delete ticket", False, str(e)))
    
    # Delete visa
    if visa_id:
        try:
            response = requests.delete(
                f"{BASE_URL}/visas/{visa_id}",
                headers=get_headers(),
                timeout=30
            )
            if response.status_code == 200:
                print(f"✓ Test visa deleted: {visa_id}")
                cleanup_results.append(("Delete visa", True, visa_id))
            else:
                print(f"⚠ Failed to delete visa {visa_id}: {response.status_code}")
                print(f"  Note: Visa ID {visa_id} may need manual cleanup")
                cleanup_results.append(("Delete visa", False, f"Status {response.status_code}"))
        except Exception as e:
            print(f"⚠ Error deleting visa: {str(e)}")
            cleanup_results.append(("Delete visa", False, str(e)))
    
    return cleanup_results

def print_summary(ticket_results, visa_results, cleanup_results):
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    all_results = ticket_results + visa_results
    passed = sum(1 for _, result, _ in all_results if result)
    total = len(all_results)
    
    print(f"\nTicket Import Preview Tests:")
    for test_name, result, detail in ticket_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")
        if not result:
            print(f"         Detail: {detail}")
    
    print(f"\nVisa Import Preview Tests:")
    for test_name, result, detail in visa_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")
        if not result:
            print(f"         Detail: {detail}")
    
    print(f"\nCleanup:")
    for test_name, result, detail in cleanup_results:
        status = "✅" if result else "⚠"
        print(f"  {status}: {test_name} - {detail}")
    
    print(f"\n{'='*80}")
    print(f"OVERALL RESULT: {passed}/{total} tests passed ({passed*100//total if total > 0 else 0}%)")
    print(f"{'='*80}")
    
    return passed == total

def main():
    """Main test execution"""
    print("\n" + "="*80)
    print("v3.13 DUPLICATE DETECTION RULE TEST")
    print("Testing import preview endpoints for tickets and visas")
    print("="*80)
    
    # Step 1: Login
    if not login():
        print("\n❌ FATAL: Login failed. Cannot proceed with tests.")
        return False
    
    # Step 2: Get existing client and supplier
    client_id, client_name, supplier_id, supplier_name = get_existing_client_and_supplier()
    
    if not client_id or not supplier_id:
        print("\n❌ FATAL: Failed to get client/supplier. Cannot proceed with tests.")
        return False
    
    # Step 3: Create test data
    ticket_id = create_test_ticket(client_id, supplier_id)
    visa_id = create_test_visa(client_id, supplier_id)
    
    if not ticket_id or not visa_id:
        print("\n⚠ WARNING: Failed to create test data. Some tests may fail.")
    
    # Step 4: Run tests
    ticket_results = test_ticket_import_preview(client_name, supplier_name)
    visa_results = test_visa_import_preview(client_name, supplier_name)
    
    # Step 5: Cleanup
    cleanup_results = cleanup_test_data(ticket_id, visa_id)
    
    # Step 6: Print summary
    all_passed = print_summary(ticket_results, visa_results, cleanup_results)
    
    return all_passed

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
