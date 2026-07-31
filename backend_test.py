#!/usr/bin/env python3
"""
Backend Test Suite for Rahaal ERP v3.6 — Packages Module
Tests all package endpoints, bookings, components, reports, and regressions
"""

import requests
import json
import os
from datetime import datetime, timedelta

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://visa-booking-5.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Test credentials
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "Demo@2025"

# Global session
session = requests.Session()
session.headers.update({'Content-Type': 'application/json'})

# Test data storage
test_data = {
    'supplier1_id': None,
    'supplier2_id': None,
    'client_id': None,
    'package_id': None,
    'booking_id': None,
    'empty_package_id': None
}

def print_test(msg):
    """Print test step"""
    print(f"\n{'='*80}")
    print(f"TEST: {msg}")
    print('='*80)

def print_result(success, msg):
    """Print test result"""
    status = "✅ PASSED" if success else "❌ FAILED"
    print(f"{status}: {msg}")

def login():
    """Login and get session cookie"""
    print_test("Login as owner@demo.com")
    try:
        resp = session.post(f"{API_URL}/auth/login", json={
            'email': OWNER_EMAIL,
            'password': OWNER_PASSWORD
        })
        if resp.status_code == 200:
            print_result(True, f"Login successful, session cookie set")
            return True
        else:
            print_result(False, f"Login failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Login exception: {str(e)}")
        return False

def test_health():
    """Test 1: GET /api/health → verify version:3.6"""
    print_test("1. GET /api/health → verify version:3.6")
    try:
        resp = session.get(f"{API_URL}/health")
        if resp.status_code == 200:
            data = resp.json()
            if data.get('version') == '3.6':
                print_result(True, f"Health check passed, version=3.6")
                return True
            else:
                print_result(False, f"Version mismatch: expected 3.6, got {data.get('version')}")
                return False
        else:
            print_result(False, f"Health check failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Health check exception: {str(e)}")
        return False

def test_create_suppliers_and_client():
    """Test 2: Create suppliers and client for testing"""
    print_test("2. Create suppliers and client for testing")
    
    # Create supplier 1 (visa supplier)
    try:
        resp = session.post(f"{API_URL}/suppliers", json={
            'name': 'مورد تأشيرات باكج'
        })
        if resp.status_code == 200:
            data = resp.json()
            test_data['supplier1_id'] = data.get('id')
            print_result(True, f"Supplier 1 created: {test_data['supplier1_id']}")
        else:
            print_result(False, f"Supplier 1 creation failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Supplier 1 exception: {str(e)}")
        return False
    
    # Create supplier 2 (hotel supplier)
    try:
        resp = session.post(f"{API_URL}/suppliers", json={
            'name': 'فندق باكج'
        })
        if resp.status_code == 200:
            data = resp.json()
            test_data['supplier2_id'] = data.get('id')
            print_result(True, f"Supplier 2 created: {test_data['supplier2_id']}")
        else:
            print_result(False, f"Supplier 2 creation failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Supplier 2 exception: {str(e)}")
        return False
    
    # Create client
    try:
        resp = session.post(f"{API_URL}/clients", json={
            'name': 'عميل باكج اختبار',
            'phone': '777500500'
        })
        if resp.status_code == 200:
            data = resp.json()
            test_data['client_id'] = data.get('id')
            print_result(True, f"Client created: {test_data['client_id']}")
            return True
        else:
            print_result(False, f"Client creation failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Client exception: {str(e)}")
        return False

def test_create_package():
    """Test 3: POST /api/packages"""
    print_test("3. POST /api/packages - Create package")
    try:
        resp = session.post(f"{API_URL}/packages", json={
            'name': 'عمرة رجب اختبار',
            'package_type': 'umrah',
            'currency': 'SAR',
            'start_date': '2025-01-01',
            'end_date': '2025-01-15',
            'notes': 'باقة اقتصادية'
        })
        if resp.status_code == 200:
            data = resp.json()
            test_data['package_id'] = data.get('id')
            status = data.get('status')
            if status == 'open':
                print_result(True, f"Package created: {test_data['package_id']}, status={status}")
                return True
            else:
                print_result(False, f"Package status incorrect: expected 'open', got '{status}'")
                return False
        else:
            print_result(False, f"Package creation failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Package creation exception: {str(e)}")
        return False

def test_get_packages():
    """Test 4: GET /api/packages → verify returned list"""
    print_test("4. GET /api/packages → verify returned list")
    try:
        resp = session.get(f"{API_URL}/packages")
        if resp.status_code == 200:
            data = resp.json()
            packages = data if isinstance(data, list) else data.get('packages', [])
            
            # Find our package
            our_package = None
            for pkg in packages:
                if pkg.get('id') == test_data['package_id']:
                    our_package = pkg
                    break
            
            if our_package:
                components_count = our_package.get('components_count', 0)
                bookings_count = our_package.get('bookings_count', 0)
                if components_count == 0 and bookings_count == 0:
                    print_result(True, f"Package found with components_count=0, bookings_count=0")
                    return True
                else:
                    print_result(False, f"Package counts incorrect: components={components_count}, bookings={bookings_count}")
                    return False
            else:
                print_result(False, f"Package {test_data['package_id']} not found in list")
                return False
        else:
            print_result(False, f"GET packages failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"GET packages exception: {str(e)}")
        return False

def test_add_components():
    """Test 5: POST /api/packages/{package_id}/components"""
    print_test("5. POST /api/packages/{package_id}/components - Add 2 components")
    
    # Add visa component
    try:
        resp = session.post(f"{API_URL}/packages/{test_data['package_id']}/components", json={
            'name': 'تأشيرة عمرة',
            'component_type': 'visa',
            'supplier_id': test_data['supplier1_id'],
            'cost_per_pax': 200,
            'sale_per_pax': 300
        })
        if resp.status_code == 200:
            print_result(True, f"Visa component added successfully")
        else:
            print_result(False, f"Visa component failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Visa component exception: {str(e)}")
        return False
    
    # Add hotel component
    try:
        resp = session.post(f"{API_URL}/packages/{test_data['package_id']}/components", json={
            'name': 'فندق 3 ليال',
            'component_type': 'hotel',
            'supplier_id': test_data['supplier2_id'],
            'cost_per_pax': 400,
            'sale_per_pax': 600
        })
        if resp.status_code == 200:
            print_result(True, f"Hotel component added successfully")
            return True
        else:
            print_result(False, f"Hotel component failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Hotel component exception: {str(e)}")
        return False

def test_get_components():
    """Test 6: GET /api/packages/{package_id}/components → verify 2 components"""
    print_test("6. GET /api/packages/{package_id}/components → verify 2 components")
    try:
        resp = session.get(f"{API_URL}/packages/{test_data['package_id']}/components")
        if resp.status_code == 200:
            data = resp.json()
            components = data if isinstance(data, list) else data.get('components', [])
            if len(components) == 2:
                print_result(True, f"2 components returned: {[c.get('name') for c in components]}")
                return True
            else:
                print_result(False, f"Expected 2 components, got {len(components)}")
                return False
        else:
            print_result(False, f"GET components failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"GET components exception: {str(e)}")
        return False

def test_create_booking():
    """Test 7: POST /api/packages/{package_id}/bookings"""
    print_test("7. POST /api/packages/{package_id}/bookings - Create booking with 2 pax")
    try:
        resp = session.post(f"{API_URL}/packages/{test_data['package_id']}/bookings", json={
            'client_id': test_data['client_id'],
            'pilgrim_name': 'معتمر أول',
            'passport_no': 'YE123',
            'pax_count': 2,
            'payment_method': 'credit'
        })
        if resp.status_code == 200:
            data = resp.json()
            test_data['booking_id'] = data.get('id')
            
            # Verify calculations
            total_cost = data.get('total_cost')
            total_sale = data.get('total_sale')
            commission = data.get('commission')
            component_snapshots = data.get('component_snapshots', [])
            
            expected_cost = (200 + 400) * 2  # 1200
            expected_sale = (300 + 600) * 2  # 1800
            expected_commission = expected_sale - expected_cost  # 600
            
            checks = []
            checks.append(('total_cost', total_cost == expected_cost, f"{total_cost} == {expected_cost}"))
            checks.append(('total_sale', total_sale == expected_sale, f"{total_sale} == {expected_sale}"))
            checks.append(('commission', commission == expected_commission, f"{commission} == {expected_commission}"))
            checks.append(('component_snapshots', len(component_snapshots) == 2, f"len={len(component_snapshots)} == 2"))
            
            # Verify component snapshots have cost_total
            if len(component_snapshots) == 2:
                for snap in component_snapshots:
                    cost_total = snap.get('cost_total')
                    cost_per_pax = snap.get('cost_per_pax')
                    expected_total = cost_per_pax * 2
                    checks.append((f"component {snap.get('name')} cost_total", cost_total == expected_total, f"{cost_total} == {expected_total}"))
            
            all_passed = all(check[1] for check in checks)
            if all_passed:
                print_result(True, f"Booking created: {test_data['booking_id']}, all calculations correct")
                for name, passed, msg in checks:
                    print(f"  ✓ {name}: {msg}")
                return True
            else:
                print_result(False, f"Booking calculations incorrect")
                for name, passed, msg in checks:
                    status = "✓" if passed else "✗"
                    print(f"  {status} {name}: {msg}")
                return False
        else:
            print_result(False, f"Booking creation failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Booking creation exception: {str(e)}")
        return False

def test_verify_balances():
    """Test 8: Verify balances after booking"""
    print_test("8. Verify balances - Client and Suppliers")
    
    # Get client balance
    try:
        resp = session.get(f"{API_URL}/clients")
        if resp.status_code == 200:
            data = resp.json()
            clients = data if isinstance(data, list) else data.get('clients', [])
            client = next((c for c in clients if c.get('id') == test_data['client_id']), None)
            if client:
                balances = client.get('balances', {})
                balance_sar = balances.get('SAR', 0)
                # Client should have 1800 SAR balance (or delta of 1800 from initial)
                print(f"  Client balance SAR: {balance_sar}")
                # We'll check if it's >= 1800 since there might be previous transactions
                if balance_sar >= 1800:
                    print_result(True, f"Client balance SAR >= 1800 (actual: {balance_sar})")
                else:
                    print_result(False, f"Client balance SAR < 1800 (actual: {balance_sar})")
                    return False
            else:
                print_result(False, f"Client not found")
                return False
        else:
            print_result(False, f"GET clients failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"GET clients exception: {str(e)}")
        return False
    
    # Get suppliers balances
    try:
        resp = session.get(f"{API_URL}/suppliers")
        if resp.status_code == 200:
            data = resp.json()
            suppliers = data if isinstance(data, list) else data.get('suppliers', [])
            
            supplier1 = next((s for s in suppliers if s.get('id') == test_data['supplier1_id']), None)
            supplier2 = next((s for s in suppliers if s.get('id') == test_data['supplier2_id']), None)
            
            if supplier1 and supplier2:
                balances1 = supplier1.get('balances', {})
                balances2 = supplier2.get('balances', {})
                balance1_sar = balances1.get('SAR', 0)
                balance2_sar = balances2.get('SAR', 0)
                
                print(f"  Supplier1 (visa) balance SAR: {balance1_sar}")
                print(f"  Supplier2 (hotel) balance SAR: {balance2_sar}")
                
                # Supplier1 should have 400 SAR (200*2), Supplier2 should have 800 SAR (400*2)
                checks = []
                checks.append(balance1_sar >= 400)
                checks.append(balance2_sar >= 800)
                
                if all(checks):
                    print_result(True, f"Supplier balances correct: supplier1={balance1_sar}, supplier2={balance2_sar}")
                    return True
                else:
                    print_result(False, f"Supplier balances incorrect")
                    return False
            else:
                print_result(False, f"Suppliers not found")
                return False
        else:
            print_result(False, f"GET suppliers failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"GET suppliers exception: {str(e)}")
        return False

def test_get_bookings():
    """Test 9: GET /api/packages/{package_id}/bookings → verify 1 booking"""
    print_test("9. GET /api/packages/{package_id}/bookings → verify 1 booking")
    try:
        resp = session.get(f"{API_URL}/packages/{test_data['package_id']}/bookings")
        if resp.status_code == 200:
            data = resp.json()
            bookings = data if isinstance(data, list) else data.get('bookings', [])
            if len(bookings) >= 1:
                print_result(True, f"{len(bookings)} booking(s) returned")
                return True
            else:
                print_result(False, f"Expected at least 1 booking, got {len(bookings)}")
                return False
        else:
            print_result(False, f"GET bookings failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"GET bookings exception: {str(e)}")
        return False

def test_package_report():
    """Test 10: GET /api/packages/{package_id}/report"""
    print_test("10. GET /api/packages/{package_id}/report - Verify totals and breakdown")
    try:
        resp = session.get(f"{API_URL}/packages/{test_data['package_id']}/report")
        if resp.status_code == 200:
            data = resp.json()
            
            totals = data.get('totals', {})
            margin_pct = data.get('margin_pct', 0)
            supplier_breakdown = data.get('supplier_breakdown', [])
            
            # Verify totals
            checks = []
            checks.append(('bookings', totals.get('bookings') >= 1, f"{totals.get('bookings')} >= 1"))
            checks.append(('pax', totals.get('pax') >= 2, f"{totals.get('pax')} >= 2"))
            checks.append(('revenue', totals.get('revenue') >= 1800, f"{totals.get('revenue')} >= 1800"))
            checks.append(('cost', totals.get('cost') >= 1200, f"{totals.get('cost')} >= 1200"))
            checks.append(('profit', totals.get('profit') >= 600, f"{totals.get('profit')} >= 600"))
            
            # Verify margin_pct (should be around 33.33%)
            expected_margin = (600 / 1800) * 100  # 33.33
            margin_ok = abs(margin_pct - expected_margin) < 1  # Allow 1% tolerance
            checks.append(('margin_pct', margin_ok, f"{margin_pct:.2f} ≈ {expected_margin:.2f}"))
            
            # Verify supplier_breakdown has 2 rows
            checks.append(('supplier_breakdown count', len(supplier_breakdown) == 2, f"len={len(supplier_breakdown)} == 2"))
            
            # Verify sorted desc by cost (hotel 800, visa 400)
            if len(supplier_breakdown) == 2:
                first_cost = supplier_breakdown[0].get('cost', 0)
                second_cost = supplier_breakdown[1].get('cost', 0)
                checks.append(('sorted desc', first_cost >= second_cost, f"{first_cost} >= {second_cost}"))
            
            all_passed = all(check[1] for check in checks)
            if all_passed:
                print_result(True, f"Package report correct")
                for name, passed, msg in checks:
                    print(f"  ✓ {name}: {msg}")
                return True
            else:
                print_result(False, f"Package report incorrect")
                for name, passed, msg in checks:
                    status = "✓" if passed else "✗"
                    print(f"  {status} {name}: {msg}")
                return False
        else:
            print_result(False, f"GET report failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"GET report exception: {str(e)}")
        return False

def test_close_package():
    """Test 11: PATCH /api/packages/{package_id} with status:closed"""
    print_test("11. PATCH /api/packages/{package_id} - Close package")
    try:
        resp = session.patch(f"{API_URL}/packages/{test_data['package_id']}", json={
            'status': 'closed'
        })
        if resp.status_code == 200:
            print_result(True, f"Package closed successfully")
            return True
        else:
            print_result(False, f"Close package failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Close package exception: {str(e)}")
        return False

def test_booking_on_closed_package():
    """Test 12: POST /api/packages/{package_id}/bookings on closed package → expect 400"""
    print_test("12. POST booking on closed package → expect 400 'الباكج مغلق'")
    try:
        resp = session.post(f"{API_URL}/packages/{test_data['package_id']}/bookings", json={
            'client_id': test_data['client_id'],
            'pilgrim_name': 'معتمر ثاني',
            'passport_no': 'YE456',
            'pax_count': 1,
            'payment_method': 'credit'
        })
        if resp.status_code == 400:
            error_msg = resp.text
            if 'مغلق' in error_msg or 'closed' in error_msg.lower():
                print_result(True, f"Booking on closed package correctly rejected: {error_msg}")
                return True
            else:
                print_result(False, f"Wrong error message: {error_msg}")
                return False
        else:
            print_result(False, f"Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Booking on closed package exception: {str(e)}")
        return False

def test_reopen_package():
    """Test 13: PATCH /api/packages/{package_id} with status:open"""
    print_test("13. PATCH /api/packages/{package_id} - Reopen package")
    try:
        resp = session.patch(f"{API_URL}/packages/{test_data['package_id']}", json={
            'status': 'open'
        })
        if resp.status_code == 200:
            print_result(True, f"Package reopened successfully")
            return True
        else:
            print_result(False, f"Reopen package failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Reopen package exception: {str(e)}")
        return False

def test_delete_package_with_bookings():
    """Test 14: DELETE /api/packages/{package_id} with bookings → expect 400"""
    print_test("14. DELETE package with bookings → expect 400 'لا يمكن حذف باكج به تسجيلات'")
    try:
        resp = session.delete(f"{API_URL}/packages/{test_data['package_id']}")
        if resp.status_code == 400:
            error_msg = resp.text
            if 'تسجيلات' in error_msg or 'bookings' in error_msg.lower():
                print_result(True, f"Delete package with bookings correctly rejected: {error_msg}")
                return True
            else:
                print_result(False, f"Wrong error message: {error_msg}")
                return False
        else:
            print_result(False, f"Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Delete package with bookings exception: {str(e)}")
        return False

def test_create_and_delete_empty_package():
    """Test 15: Create empty package and delete it → success"""
    print_test("15. Create empty package and delete it → success")
    
    # Create empty package
    try:
        resp = session.post(f"{API_URL}/packages", json={
            'name': 'باكج فارغ للحذف',
            'package_type': 'hajj',
            'currency': 'SAR',
            'start_date': '2025-02-01',
            'end_date': '2025-02-15'
        })
        if resp.status_code == 200:
            data = resp.json()
            test_data['empty_package_id'] = data.get('id')
            print(f"  Empty package created: {test_data['empty_package_id']}")
        else:
            print_result(False, f"Empty package creation failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Empty package creation exception: {str(e)}")
        return False
    
    # Delete empty package
    try:
        resp = session.delete(f"{API_URL}/packages/{test_data['empty_package_id']}")
        if resp.status_code == 200:
            print_result(True, f"Empty package deleted successfully")
            return True
        else:
            print_result(False, f"Empty package deletion failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Empty package deletion exception: {str(e)}")
        return False

def test_journal_entry():
    """Test 16: Verify journal entry for package booking"""
    print_test("16. Verify journal entry - ref_type='package_booking'")
    try:
        resp = session.get(f"{API_URL}/journal-entries")
        if resp.status_code == 200:
            data = resp.json()
            entries = data if isinstance(data, list) else data.get('entries', [])
            
            # Find journal entry for our booking
            booking_je = None
            for entry in entries:
                if entry.get('ref_type') == 'package_booking' and entry.get('ref_id') == test_data['booking_id']:
                    booking_je = entry
                    break
            
            if booking_je:
                lines = booking_je.get('lines', [])
                
                # Verify structure: should have lines for client debit, supplier credits, commission credit
                # Expected: client debit 1800, supplier1 credit 400, supplier2 credit 800, commission credit 600
                # Total debits should equal total credits
                
                total_debit = sum(line.get('debit', 0) for line in lines)
                total_credit = sum(line.get('credit', 0) for line in lines)
                
                checks = []
                checks.append(('ref_type', booking_je.get('ref_type') == 'package_booking', f"ref_type={booking_je.get('ref_type')}"))
                checks.append(('ref_id', booking_je.get('ref_id') == test_data['booking_id'], f"ref_id matches"))
                checks.append(('balanced', abs(total_debit - total_credit) < 0.01, f"debit={total_debit}, credit={total_credit}"))
                checks.append(('lines count', len(lines) >= 3, f"lines={len(lines)} >= 3"))
                
                all_passed = all(check[1] for check in checks)
                if all_passed:
                    print_result(True, f"Journal entry correct")
                    for name, passed, msg in checks:
                        print(f"  ✓ {name}: {msg}")
                    return True
                else:
                    print_result(False, f"Journal entry incorrect")
                    for name, passed, msg in checks:
                        status = "✓" if passed else "✗"
                        print(f"  {status} {name}: {msg}")
                    return False
            else:
                print_result(False, f"Journal entry for booking {test_data['booking_id']} not found")
                return False
        else:
            print_result(False, f"GET journal entries failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"GET journal entries exception: {str(e)}")
        return False

def test_regression_refunds():
    """Test 17: Regression - v3.5 refunds still work"""
    print_test("17. REGRESSION - v3.5 refunds still work")
    
    # Create a ticket first
    try:
        # Get a client and supplier
        resp = session.get(f"{API_URL}/clients")
        clients = resp.json() if resp.status_code == 200 else []
        if isinstance(clients, dict):
            clients = clients.get('clients', [])
        
        resp = session.get(f"{API_URL}/suppliers")
        suppliers = resp.json() if resp.status_code == 200 else []
        if isinstance(suppliers, dict):
            suppliers = suppliers.get('suppliers', [])
        
        if not clients or not suppliers:
            print_result(False, f"No clients or suppliers available for regression test")
            return False
        
        client_id = clients[0].get('id')
        supplier_id = suppliers[0].get('id')
        
        # Create ticket
        resp = session.post(f"{API_URL}/tickets", json={
            'pnr': f'REGR-{datetime.now().strftime("%H%M%S")}',
            'client_id': client_id,
            'supplier_id': supplier_id,
            'passenger_name': 'مسافر اختبار',
            'passport_no': 'YE-REGR-1',
            'currency': 'SAR',
            'cost': 100,
            'sale_price': 150,
            'payment_method': 'credit'
        })
        
        if resp.status_code != 200:
            print_result(False, f"Ticket creation failed: {resp.status_code}")
            return False
        
        ticket_data = resp.json()
        ticket_id = ticket_data.get('id')
        
        # Create refund using v3.5 endpoint: POST /refunds
        resp = session.post(f"{API_URL}/refunds", json={
            'ref_type': 'ticket',
            'ref_id': ticket_id,
            'supplier_penalty': 20,
            'office_fee': 10,
            'reason': 'اختبار استرجاع'
        })
        
        if resp.status_code == 200:
            print_result(True, f"v3.5 refunds still working")
            return True
        else:
            print_result(False, f"Refund failed: {resp.status_code} - {resp.text}")
            return False
            
    except Exception as e:
        print_result(False, f"Regression refunds exception: {str(e)}")
        return False

def test_regression_permissions():
    """Test 18: Regression - v3.4 permissions/affiliate still work"""
    print_test("18. REGRESSION - v3.4 permissions/affiliate still work")
    
    # Just verify we can access auth/me and it has expected structure
    try:
        resp = session.get(f"{API_URL}/auth/me")
        if resp.status_code == 200:
            data = resp.json()
            user = data.get('user')
            if user and user.get('role'):
                print_result(True, f"v3.4 permissions still working, role={user.get('role')}")
                return True
            else:
                print_result(False, f"User structure incorrect")
                return False
        else:
            print_result(False, f"Auth/me failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Regression permissions exception: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("RAHAAL ERP v3.6 — PACKAGES MODULE BACKEND TEST SUITE")
    print("="*80)
    
    # Login first
    if not login():
        print("\n❌ LOGIN FAILED - Cannot proceed with tests")
        return
    
    # Run all tests
    results = []
    
    results.append(("Health Check v3.6", test_health()))
    results.append(("Create Suppliers and Client", test_create_suppliers_and_client()))
    results.append(("Create Package", test_create_package()))
    results.append(("Get Packages List", test_get_packages()))
    results.append(("Add Components", test_add_components()))
    results.append(("Get Components", test_get_components()))
    results.append(("Create Booking", test_create_booking()))
    results.append(("Verify Balances", test_verify_balances()))
    results.append(("Get Bookings", test_get_bookings()))
    results.append(("Package Report", test_package_report()))
    results.append(("Close Package", test_close_package()))
    results.append(("Booking on Closed Package", test_booking_on_closed_package()))
    results.append(("Reopen Package", test_reopen_package()))
    results.append(("Delete Package with Bookings", test_delete_package_with_bookings()))
    results.append(("Create and Delete Empty Package", test_create_and_delete_empty_package()))
    results.append(("Verify Journal Entry", test_journal_entry()))
    results.append(("Regression - Refunds", test_regression_refunds()))
    results.append(("Regression - Permissions", test_regression_permissions()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - v3.6 Packages Module is working correctly!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed - Review failures above")

if __name__ == "__main__":
    main()
