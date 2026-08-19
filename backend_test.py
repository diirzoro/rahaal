#!/usr/bin/env python3
"""
v3.18 Duplicate Rule Fix - Regression Test
Tests the critical bug fix where dedup key fell back to transaction date (r.date)
when travel_date was empty, causing false duplicates.

NOW: tickets dedup uses travel_date ONLY, visas use entry_date ONLY.
If that date is empty → NO dedup blocking at all.
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
LOGIN_EMAIL = "owner@demo.com"
LOGIN_PASSWORD = "Demo@2025"

session = requests.Session()

def login():
    """Login and get session cookie"""
    print("=" * 80)
    print("STEP 1: LOGIN")
    print("=" * 80)
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json={
            "email": LOGIN_EMAIL,
            "password": LOGIN_PASSWORD
        })
        print(f"Login status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Logged in as: {data.get('user', {}).get('email')}")
            print(f"   Tenant: {data.get('tenant', {}).get('name')}")
            return True
        else:
            print(f"❌ Login failed: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False

def get_clients_and_suppliers():
    """Get existing client and supplier names"""
    print("\n" + "=" * 80)
    print("STEP 2: GET CLIENTS AND SUPPLIERS")
    print("=" * 80)
    try:
        clients_resp = session.get(f"{BASE_URL}/clients")
        suppliers_resp = session.get(f"{BASE_URL}/suppliers")
        
        if clients_resp.status_code == 200 and suppliers_resp.status_code == 200:
            clients = clients_resp.json()
            suppliers = suppliers_resp.json()
            
            client_name = clients[0]['name'] if clients else None
            supplier_name = suppliers[0]['name'] if suppliers else None
            
            print(f"✅ Found {len(clients)} clients, using: {client_name}")
            print(f"✅ Found {len(suppliers)} suppliers, using: {supplier_name}")
            
            return client_name, supplier_name
        else:
            print(f"❌ Failed to get clients/suppliers")
            return None, None
    except Exception as e:
        print(f"❌ Error getting clients/suppliers: {e}")
        return None, None

def test_tickets_case_1(client_name, supplier_name):
    """
    CASE 1: THE USER'S EXACT SCENARIO
    Rows all sharing date:"2026-08-19" (transaction date), same passenger_name "صالح محمد قائد",
    NO pnr, travel_date "2026-09-01" for row A and travel_date "2026-10-15" for row B
    → BOTH must have __dup === false.
    """
    print("\n" + "=" * 80)
    print("TICKETS CASE 1: User's Exact Scenario - Same name, same transaction date, DIFFERENT travel dates")
    print("=" * 80)
    
    rows = [
        {
            "date": "2026-08-19",
            "passenger_name": "صالح محمد قائد",
            "travel_date": "2026-09-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        {
            "date": "2026-08-19",
            "passenger_name": "صالح محمد قائد",
            "travel_date": "2026-10-15",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        }
    ]
    
    try:
        resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows})
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result_rows = data.get('rows', [])
            
            row_a_dup = result_rows[0].get('__dup', False)
            row_b_dup = result_rows[1].get('__dup', False)
            
            print(f"Row A (travel_date=2026-09-01): __dup = {row_a_dup}")
            print(f"Row B (travel_date=2026-10-15): __dup = {row_b_dup}")
            
            if row_a_dup == False and row_b_dup == False:
                print("✅ CASE 1 PASSED: Both rows accepted (no false duplicate)")
                return True
            else:
                print(f"❌ CASE 1 FAILED: Expected both __dup=false, got A={row_a_dup}, B={row_b_dup}")
                return False
        else:
            print(f"❌ Request failed: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_tickets_case_2(client_name, supplier_name):
    """
    CASE 2: Same name + SAME travel_date "2026-09-01" twice in batch
    → second row __dup mentions 'اسم + نفس تاريخ السفر'.
    """
    print("\n" + "=" * 80)
    print("TICKETS CASE 2: Same name + SAME travel_date in batch")
    print("=" * 80)
    
    rows = [
        {
            "date": "2026-08-19",
            "passenger_name": "أحمد علي محمد",
            "travel_date": "2026-09-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        {
            "date": "2026-08-19",
            "passenger_name": "أحمد علي محمد",
            "travel_date": "2026-09-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        }
    ]
    
    try:
        resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows})
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result_rows = data.get('rows', [])
            
            row_a_dup = result_rows[0].get('__dup', False)
            row_b_dup = result_rows[1].get('__dup', False)
            
            print(f"Row A: __dup = {row_a_dup}")
            print(f"Row B: __dup = {row_b_dup}")
            
            if row_a_dup == False and row_b_dup and 'اسم' in str(row_b_dup) and 'تاريخ السفر' in str(row_b_dup):
                print(f"✅ CASE 2 PASSED: Second row flagged as duplicate with message: {row_b_dup}")
                return True
            else:
                print(f"❌ CASE 2 FAILED: Expected second row to be flagged, got A={row_a_dup}, B={row_b_dup}")
                return False
        else:
            print(f"❌ Request failed: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_tickets_case_3(client_name, supplier_name):
    """
    CASE 3: Same name, travel_date EMPTY on both rows, date:"2026-08-19" identical
    → BOTH __dup === false (no date => no block).
    """
    print("\n" + "=" * 80)
    print("TICKETS CASE 3: Same name, EMPTY travel_date, same transaction date")
    print("=" * 80)
    
    rows = [
        {
            "date": "2026-08-19",
            "passenger_name": "خالد سعيد",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        {
            "date": "2026-08-19",
            "passenger_name": "خالد سعيد",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        }
    ]
    
    try:
        resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows})
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result_rows = data.get('rows', [])
            
            row_a_dup = result_rows[0].get('__dup', False)
            row_b_dup = result_rows[1].get('__dup', False)
            
            print(f"Row A (no travel_date): __dup = {row_a_dup}")
            print(f"Row B (no travel_date): __dup = {row_b_dup}")
            
            if row_a_dup == False and row_b_dup == False:
                print("✅ CASE 3 PASSED: Both rows accepted (empty travel_date = no dedup)")
                return True
            else:
                print(f"❌ CASE 3 FAILED: Expected both __dup=false, got A={row_a_dup}, B={row_b_dup}")
                return False
        else:
            print(f"❌ Request failed: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_tickets_case_4(client_name, supplier_name):
    """
    CASE 4: PNR "XX99" on two rows with different travel_dates → both false;
    same travel_date → second flagged (PNR + نفس تاريخ السفر).
    """
    print("\n" + "=" * 80)
    print("TICKETS CASE 4: PNR dedup with different and same travel dates")
    print("=" * 80)
    
    # Test 4a: Same PNR, different travel dates
    rows_4a = [
        {
            "date": "2026-08-19",
            "pnr": "XX99",
            "passenger_name": "محمد أحمد",
            "travel_date": "2026-09-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        {
            "date": "2026-08-19",
            "pnr": "XX99",
            "passenger_name": "محمد أحمد",
            "travel_date": "2026-10-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        }
    ]
    
    try:
        resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows_4a})
        print(f"Status (4a - different dates): {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result_rows = data.get('rows', [])
            
            row_a_dup = result_rows[0].get('__dup', False)
            row_b_dup = result_rows[1].get('__dup', False)
            
            print(f"  Row A (PNR=XX99, travel=2026-09-01): __dup = {row_a_dup}")
            print(f"  Row B (PNR=XX99, travel=2026-10-01): __dup = {row_b_dup}")
            
            test_4a_pass = (row_a_dup == False and row_b_dup == False)
            if test_4a_pass:
                print("  ✅ 4a PASSED: Different travel dates accepted")
            else:
                print(f"  ❌ 4a FAILED: Expected both false, got A={row_a_dup}, B={row_b_dup}")
        else:
            print(f"  ❌ Request failed: {resp.text}")
            test_4a_pass = False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        test_4a_pass = False
    
    # Test 4b: Same PNR, same travel date
    rows_4b = [
        {
            "date": "2026-08-19",
            "pnr": "YY88",
            "passenger_name": "علي حسن",
            "travel_date": "2026-09-15",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        },
        {
            "date": "2026-08-19",
            "pnr": "YY88",
            "passenger_name": "علي حسن",
            "travel_date": "2026-09-15",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        }
    ]
    
    try:
        resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows_4b})
        print(f"\nStatus (4b - same date): {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result_rows = data.get('rows', [])
            
            row_a_dup = result_rows[0].get('__dup', False)
            row_b_dup = result_rows[1].get('__dup', False)
            
            print(f"  Row A (PNR=YY88, travel=2026-09-15): __dup = {row_a_dup}")
            print(f"  Row B (PNR=YY88, travel=2026-09-15): __dup = {row_b_dup}")
            
            test_4b_pass = (row_a_dup == False and row_b_dup and 'PNR' in str(row_b_dup) and 'تاريخ السفر' in str(row_b_dup))
            if test_4b_pass:
                print(f"  ✅ 4b PASSED: Second row flagged with: {row_b_dup}")
            else:
                print(f"  ❌ 4b FAILED: Expected second row flagged, got A={row_a_dup}, B={row_b_dup}")
        else:
            print(f"  ❌ Request failed: {resp.text}")
            test_4b_pass = False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        test_4b_pass = False
    
    if test_4a_pass and test_4b_pass:
        print("\n✅ CASE 4 PASSED: PNR dedup working correctly")
        return True
    else:
        print("\n❌ CASE 4 FAILED")
        return False

def test_tickets_case_5(client_name, supplier_name):
    """
    CASE 5: DB-side test
    Create ONE real ticket via POST /api/tickets (passenger "اختبار قاعدة v318", 
    travel_date "2026-09-10", pnr "V318P") then preview rows:
    - same name travel_date "2026-09-10" → dup
    - same name travel_date "2026-09-11" → NOT dup
    - same pnr "V318P" with travel_date "2026-09-11" → NOT dup
    Then DELETE that ticket (cleanup).
    """
    print("\n" + "=" * 80)
    print("TICKETS CASE 5: DB-side dedup test")
    print("=" * 80)
    
    # Get client and supplier IDs
    try:
        clients_resp = session.get(f"{BASE_URL}/clients")
        suppliers_resp = session.get(f"{BASE_URL}/suppliers")
        
        if clients_resp.status_code != 200 or suppliers_resp.status_code != 200:
            print("❌ Failed to get client/supplier IDs")
            return False
        
        clients = clients_resp.json()
        suppliers = suppliers_resp.json()
        
        client_id = clients[0]['id'] if clients else None
        supplier_id = suppliers[0]['id'] if suppliers else None
        
        if not client_id or not supplier_id:
            print("❌ No client or supplier found")
            return False
            
    except Exception as e:
        print(f"❌ Error getting IDs: {e}")
        return False
    
    # Create a real ticket
    ticket_payload = {
        "passenger_name": "اختبار قاعدة v318",
        "travel_date": "2026-09-10",
        "pnr": "V318P",
        "currency": "USD",
        "cost": 100,
        "sale_price": 150,
        "client_id": client_id,
        "supplier_id": supplier_id,
        "date": "2026-08-19",
        "passport_no": "V318PASS",
        "route": "صنعاء - القاهرة",
        "passenger_phone": "777123456"
    }
    
    ticket_id = None
    
    try:
        # Create ticket
        resp = session.post(f"{BASE_URL}/tickets", json=ticket_payload)
        print(f"Create ticket status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ Failed to create ticket: {resp.text}")
            return False
        
        ticket_data = resp.json()
        ticket_id = ticket_data.get('id')
        print(f"✅ Created ticket with ID: {ticket_id}")
        
        # Test 5a: Same name, same travel_date → should be dup
        rows_5a = [{
            "date": "2026-08-19",
            "passenger_name": "اختبار قاعدة v318",
            "travel_date": "2026-09-10",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        }]
        
        resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows_5a})
        print(f"\nTest 5a (same name, same date) status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            row_dup = data.get('rows', [{}])[0].get('__dup', False)
            print(f"  __dup = {row_dup}")
            test_5a_pass = bool(row_dup) and 'موجود مسبقاً' in str(row_dup)
            if test_5a_pass:
                print(f"  ✅ 5a PASSED: Detected as duplicate: {row_dup}")
            else:
                print(f"  ❌ 5a FAILED: Expected duplicate, got {row_dup}")
        else:
            print(f"  ❌ Request failed: {resp.text}")
            test_5a_pass = False
        
        # Test 5b: Same name, different travel_date → should NOT be dup
        rows_5b = [{
            "date": "2026-08-19",
            "passenger_name": "اختبار قاعدة v318",
            "travel_date": "2026-09-11",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        }]
        
        resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows_5b})
        print(f"\nTest 5b (same name, different date) status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            row_dup = data.get('rows', [{}])[0].get('__dup', False)
            print(f"  __dup = {row_dup}")
            test_5b_pass = (row_dup == False)
            if test_5b_pass:
                print(f"  ✅ 5b PASSED: NOT detected as duplicate")
            else:
                print(f"  ❌ 5b FAILED: Expected NOT duplicate, got {row_dup}")
        else:
            print(f"  ❌ Request failed: {resp.text}")
            test_5b_pass = False
        
        # Test 5c: Same PNR, different travel_date → should NOT be dup
        rows_5c = [{
            "date": "2026-08-19",
            "pnr": "V318P",
            "passenger_name": "مسافر آخر",
            "travel_date": "2026-09-11",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name
        }]
        
        resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows_5c})
        print(f"\nTest 5c (same PNR, different date) status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            row_dup = data.get('rows', [{}])[0].get('__dup', False)
            print(f"  __dup = {row_dup}")
            test_5c_pass = (row_dup == False)
            if test_5c_pass:
                print(f"  ✅ 5c PASSED: NOT detected as duplicate")
            else:
                print(f"  ❌ 5c FAILED: Expected NOT duplicate, got {row_dup}")
        else:
            print(f"  ❌ Request failed: {resp.text}")
            test_5c_pass = False
        
        # Cleanup: Delete the ticket
        if ticket_id:
            resp = session.delete(f"{BASE_URL}/tickets/{ticket_id}")
            print(f"\nCleanup - Delete ticket status: {resp.status_code}")
            if resp.status_code == 200:
                print("✅ Ticket deleted successfully")
            else:
                print(f"⚠️ Failed to delete ticket: {resp.text}")
        
        if test_5a_pass and test_5b_pass and test_5c_pass:
            print("\n✅ CASE 5 PASSED: DB-side dedup working correctly")
            return True
        else:
            print("\n❌ CASE 5 FAILED")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        # Cleanup on error
        if ticket_id:
            try:
                session.delete(f"{BASE_URL}/tickets/{ticket_id}")
                print("Cleanup: Deleted ticket after error")
            except Exception:
                pass
        return False

def test_visas_case_6(client_name, supplier_name):
    """
    CASE 6: Two rows same passenger_name "معتمر تجربة v318", same date:"2026-08-19",
    entry_date "2026-09-01" vs "2026-10-01" → both __dup false.
    """
    print("\n" + "=" * 80)
    print("VISAS CASE 6: Same name, same transaction date, DIFFERENT entry dates")
    print("=" * 80)
    
    rows = [
        {
            "date": "2026-08-19",
            "passenger_name": "معتمر تجربة v318",
            "entry_date": "2026-09-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name,
            "service_type": "تأشيرة عمرة"
        },
        {
            "date": "2026-08-19",
            "passenger_name": "معتمر تجربة v318",
            "entry_date": "2026-10-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name,
            "service_type": "تأشيرة عمرة"
        }
    ]
    
    try:
        resp = session.post(f"{BASE_URL}/import/visas/preview", json={"rows": rows})
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result_rows = data.get('rows', [])
            
            row_a_dup = result_rows[0].get('__dup', False)
            row_b_dup = result_rows[1].get('__dup', False)
            
            print(f"Row A (entry_date=2026-09-01): __dup = {row_a_dup}")
            print(f"Row B (entry_date=2026-10-01): __dup = {row_b_dup}")
            
            if row_a_dup == False and row_b_dup == False:
                print("✅ CASE 6 PASSED: Both rows accepted (different entry dates)")
                return True
            else:
                print(f"❌ CASE 6 FAILED: Expected both __dup=false, got A={row_a_dup}, B={row_b_dup}")
                return False
        else:
            print(f"❌ Request failed: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_visas_case_7(client_name, supplier_name):
    """
    CASE 7: Same passport_no "V318PP" same entry_date twice → second flagged;
    different entry dates → both false.
    """
    print("\n" + "=" * 80)
    print("VISAS CASE 7: Passport dedup with same and different entry dates")
    print("=" * 80)
    
    # Test 7a: Same passport, same entry_date
    rows_7a = [
        {
            "date": "2026-08-19",
            "passport_no": "V318PP",
            "passenger_name": "معتمر أول",
            "entry_date": "2026-09-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name,
            "service_type": "تأشيرة عمرة"
        },
        {
            "date": "2026-08-19",
            "passport_no": "V318PP",
            "passenger_name": "معتمر أول",
            "entry_date": "2026-09-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name,
            "service_type": "تأشيرة عمرة"
        }
    ]
    
    try:
        resp = session.post(f"{BASE_URL}/import/visas/preview", json={"rows": rows_7a})
        print(f"Status (7a - same entry date): {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result_rows = data.get('rows', [])
            
            row_a_dup = result_rows[0].get('__dup', False)
            row_b_dup = result_rows[1].get('__dup', False)
            
            print(f"  Row A: __dup = {row_a_dup}")
            print(f"  Row B: __dup = {row_b_dup}")
            
            test_7a_pass = (row_a_dup == False and row_b_dup and 'جواز' in str(row_b_dup))
            if test_7a_pass:
                print(f"  ✅ 7a PASSED: Second row flagged: {row_b_dup}")
            else:
                print(f"  ❌ 7a FAILED: Expected second row flagged, got A={row_a_dup}, B={row_b_dup}")
        else:
            print(f"  ❌ Request failed: {resp.text}")
            test_7a_pass = False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        test_7a_pass = False
    
    # Test 7b: Same passport, different entry dates
    rows_7b = [
        {
            "date": "2026-08-19",
            "passport_no": "V318PP2",
            "passenger_name": "معتمر ثاني",
            "entry_date": "2026-09-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name,
            "service_type": "تأشيرة عمرة"
        },
        {
            "date": "2026-08-19",
            "passport_no": "V318PP2",
            "passenger_name": "معتمر ثاني",
            "entry_date": "2026-10-01",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name,
            "service_type": "تأشيرة عمرة"
        }
    ]
    
    try:
        resp = session.post(f"{BASE_URL}/import/visas/preview", json={"rows": rows_7b})
        print(f"\nStatus (7b - different entry dates): {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result_rows = data.get('rows', [])
            
            row_a_dup = result_rows[0].get('__dup', False)
            row_b_dup = result_rows[1].get('__dup', False)
            
            print(f"  Row A: __dup = {row_a_dup}")
            print(f"  Row B: __dup = {row_b_dup}")
            
            test_7b_pass = (row_a_dup == False and row_b_dup == False)
            if test_7b_pass:
                print(f"  ✅ 7b PASSED: Both rows accepted (different entry dates)")
            else:
                print(f"  ❌ 7b FAILED: Expected both false, got A={row_a_dup}, B={row_b_dup}")
        else:
            print(f"  ❌ Request failed: {resp.text}")
            test_7b_pass = False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        test_7b_pass = False
    
    if test_7a_pass and test_7b_pass:
        print("\n✅ CASE 7 PASSED: Passport dedup working correctly")
        return True
    else:
        print("\n❌ CASE 7 FAILED")
        return False

def test_visas_case_8(client_name, supplier_name):
    """
    CASE 8: Empty entry_date on both, same name → both false.
    """
    print("\n" + "=" * 80)
    print("VISAS CASE 8: Same name, EMPTY entry_date")
    print("=" * 80)
    
    rows = [
        {
            "date": "2026-08-19",
            "passenger_name": "معتمر بدون تاريخ",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name,
            "service_type": "تأشيرة عمرة"
        },
        {
            "date": "2026-08-19",
            "passenger_name": "معتمر بدون تاريخ",
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "client_name": client_name,
            "supplier_name": supplier_name,
            "service_type": "تأشيرة عمرة"
        }
    ]
    
    try:
        resp = session.post(f"{BASE_URL}/import/visas/preview", json={"rows": rows})
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result_rows = data.get('rows', [])
            
            row_a_dup = result_rows[0].get('__dup', False)
            row_b_dup = result_rows[1].get('__dup', False)
            
            print(f"Row A (no entry_date): __dup = {row_a_dup}")
            print(f"Row B (no entry_date): __dup = {row_b_dup}")
            
            if row_a_dup == False and row_b_dup == False:
                print("✅ CASE 8 PASSED: Both rows accepted (empty entry_date = no dedup)")
                return True
            else:
                print(f"❌ CASE 8 FAILED: Expected both __dup=false, got A={row_a_dup}, B={row_b_dup}")
                return False
        else:
            print(f"❌ Request failed: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    """Run all v3.18 dedup tests"""
    print("\n" + "=" * 80)
    print("v3.18 DUPLICATE RULE FIX - COMPREHENSIVE REGRESSION TEST")
    print("=" * 80)
    print("Testing the critical bug fix where dedup key fell back to transaction date")
    print("when travel_date/entry_date was empty, causing false duplicates.")
    print("=" * 80)
    
    # Login
    if not login():
        print("\n❌ FATAL: Login failed, cannot proceed")
        return
    
    # Get client and supplier
    client_name, supplier_name = get_clients_and_suppliers()
    if not client_name or not supplier_name:
        print("\n❌ FATAL: Could not get client/supplier names")
        return
    
    # Run all test cases
    results = {
        "TICKETS CASE 1 (User's Exact Scenario)": test_tickets_case_1(client_name, supplier_name),
        "TICKETS CASE 2 (Same name + same travel_date)": test_tickets_case_2(client_name, supplier_name),
        "TICKETS CASE 3 (Empty travel_date)": test_tickets_case_3(client_name, supplier_name),
        "TICKETS CASE 4 (PNR dedup)": test_tickets_case_4(client_name, supplier_name),
        "TICKETS CASE 5 (DB-side dedup)": test_tickets_case_5(client_name, supplier_name),
        "VISAS CASE 6 (Different entry dates)": test_visas_case_6(client_name, supplier_name),
        "VISAS CASE 7 (Passport dedup)": test_visas_case_7(client_name, supplier_name),
        "VISAS CASE 8 (Empty entry_date)": test_visas_case_8(client_name, supplier_name),
    }
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print("\n" + "=" * 80)
    print(f"FINAL RESULT: {passed}/{total} tests passed")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - v3.18 dedup fix is working correctly!")
        print("\nKEY VERIFICATIONS:")
        print("✅ Tickets use travel_date ONLY for dedup (not transaction date)")
        print("✅ Visas use entry_date ONLY for dedup (not transaction date)")
        print("✅ Empty travel_date/entry_date = NO dedup blocking")
        print("✅ Different travel/entry dates = NOT duplicates")
        print("✅ Same travel/entry dates = correctly flagged as duplicates")
        print("✅ DB-side dedup working correctly")
    else:
        print(f"\n⚠️ {total - passed} test(s) failed - review output above")

if __name__ == "__main__":
    main()
