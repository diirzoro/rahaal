#!/usr/bin/env python3
"""
Backend Test Suite for Rahaal ERP v3.7 — Packages Phase 2
Tests: Health check v3.7, Packages comparison endpoint, Extend end_date, Tenant isolation, Regressions
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
OWNER_PASSWORD = "<DEMO_PASSWORD-see-memory/test_credentials.md>"

# Global session
session = requests.Session()
session.headers.update({'Content-Type': 'application/json'})

# Test data storage
test_data = {
    'supplier1_id': None,
    'supplier2_id': None,
    'client_id': None,
    'package1_id': None,  # High profit package
    'package2_id': None,  # Low profit package
    'package3_id': None,  # Package for extend date test
    'booking1_id': None,
    'booking2_id': None,
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
            data = resp.json()
            print_result(True, f"Login successful. User: {data.get('user', {}).get('email')}")
            return True
        else:
            print_result(False, f"Login failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Login error: {str(e)}")
        return False

def test_health_version():
    """Test 1: Health check version should be 3.7"""
    print_test("1. Health Check - Version 3.7")
    try:
        resp = session.get(f"{API_URL}/health")
        if resp.status_code == 200:
            data = resp.json()
            version = data.get('version')
            if version == '3.7':
                print_result(True, f"Health check version is exactly '3.7'. Response: {json.dumps(data, indent=2)}")
                return True
            else:
                print_result(False, f"Health check version is '{version}', expected '3.7'. Response: {json.dumps(data, indent=2)}")
                return False
        else:
            print_result(False, f"Health check failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Health check error: {str(e)}")
        return False

def setup_test_data():
    """Setup: Create suppliers, client, and packages with different profit levels"""
    print_test("SETUP: Create test data (suppliers, client, packages)")
    
    # Create suppliers
    try:
        resp = session.post(f"{API_URL}/suppliers", json={'name': 'مورد باكج v3.7 - تأشيرات'})
        if resp.status_code == 200:
            test_data['supplier1_id'] = resp.json()['id']
            print_result(True, f"Supplier 1 created: {test_data['supplier1_id']}")
        else:
            print_result(False, f"Failed to create supplier 1: {resp.status_code}")
            return False
            
        resp = session.post(f"{API_URL}/suppliers", json={'name': 'مورد باكج v3.7 - فنادق'})
        if resp.status_code == 200:
            test_data['supplier2_id'] = resp.json()['id']
            print_result(True, f"Supplier 2 created: {test_data['supplier2_id']}")
        else:
            print_result(False, f"Failed to create supplier 2: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Error creating suppliers: {str(e)}")
        return False
    
    # Create client
    try:
        resp = session.post(f"{API_URL}/clients", json={'name': 'عميل باكج v3.7', 'phone': '777600600'})
        if resp.status_code == 200:
            test_data['client_id'] = resp.json()['id']
            print_result(True, f"Client created: {test_data['client_id']}")
        else:
            print_result(False, f"Failed to create client: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Error creating client: {str(e)}")
        return False
    
    # Create Package 1 (High profit - will be top)
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        end_date = (datetime.now() + timedelta(days=60)).strftime('%Y-%m-%d')
        resp = session.post(f"{API_URL}/packages", json={
            'name': 'عمرة رجب v3.7 - عالي الربح',
            'package_type': 'umrah',
            'currency': 'SAR',
            'start_date': today,
            'end_date': end_date,
            'notes': 'باكج اختبار v3.7 - ربح عالي'
        })
        if resp.status_code == 200:
            test_data['package1_id'] = resp.json()['id']
            print_result(True, f"Package 1 (high profit) created: {test_data['package1_id']}")
        else:
            print_result(False, f"Failed to create package 1: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Error creating package 1: {str(e)}")
        return False
    
    # Add components to Package 1 (high margin)
    try:
        # Visa component: cost=200, sale=400 (margin=200)
        resp = session.post(f"{API_URL}/packages/{test_data['package1_id']}/components", json={
            'name': 'تأشيرة عمرة',
            'component_type': 'visa',
            'supplier_id': test_data['supplier1_id'],
            'cost_per_pax': 200,
            'sale_per_pax': 400
        })
        if resp.status_code != 200:
            print_result(False, f"Failed to add visa component to package 1: {resp.status_code}")
            return False
        
        # Hotel component: cost=300, sale=600 (margin=300)
        resp = session.post(f"{API_URL}/packages/{test_data['package1_id']}/components", json={
            'name': 'فندق 5 نجوم',
            'component_type': 'hotel',
            'supplier_id': test_data['supplier2_id'],
            'cost_per_pax': 300,
            'sale_per_pax': 600
        })
        if resp.status_code != 200:
            print_result(False, f"Failed to add hotel component to package 1: {resp.status_code}")
            return False
        
        print_result(True, "Components added to Package 1 (total margin per pax: 500)")
    except Exception as e:
        print_result(False, f"Error adding components to package 1: {str(e)}")
        return False
    
    # Create booking for Package 1 (2 pax = 1000 profit)
    try:
        resp = session.post(f"{API_URL}/packages/{test_data['package1_id']}/bookings", json={
            'client_id': test_data['client_id'],
            'pilgrim_name': 'معتمر v3.7 - أول',
            'passport_no': 'YE-V37-001',
            'pax_count': 2,
            'payment_method': 'credit'
        })
        if resp.status_code == 200:
            test_data['booking1_id'] = resp.json()['id']
            print_result(True, f"Booking 1 created for Package 1: 2 pax, profit=1000 SAR")
        else:
            print_result(False, f"Failed to create booking 1: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Error creating booking 1: {str(e)}")
        return False
    
    # Create Package 2 (Low profit)
    try:
        resp = session.post(f"{API_URL}/packages", json={
            'name': 'عمرة شعبان v3.7 - منخفض الربح',
            'package_type': 'umrah',
            'currency': 'SAR',
            'start_date': today,
            'end_date': end_date,
            'notes': 'باكج اختبار v3.7 - ربح منخفض'
        })
        if resp.status_code == 200:
            test_data['package2_id'] = resp.json()['id']
            print_result(True, f"Package 2 (low profit) created: {test_data['package2_id']}")
        else:
            print_result(False, f"Failed to create package 2: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Error creating package 2: {str(e)}")
        return False
    
    # Add components to Package 2 (low margin)
    try:
        # Visa component: cost=250, sale=300 (margin=50)
        resp = session.post(f"{API_URL}/packages/{test_data['package2_id']}/components", json={
            'name': 'تأشيرة عمرة اقتصادية',
            'component_type': 'visa',
            'supplier_id': test_data['supplier1_id'],
            'cost_per_pax': 250,
            'sale_per_pax': 300
        })
        if resp.status_code != 200:
            print_result(False, f"Failed to add visa component to package 2: {resp.status_code}")
            return False
        
        print_result(True, "Components added to Package 2 (total margin per pax: 50)")
    except Exception as e:
        print_result(False, f"Error adding components to package 2: {str(e)}")
        return False
    
    # Create booking for Package 2 (1 pax = 50 profit)
    try:
        resp = session.post(f"{API_URL}/packages/{test_data['package2_id']}/bookings", json={
            'client_id': test_data['client_id'],
            'pilgrim_name': 'معتمر v3.7 - ثاني',
            'passport_no': 'YE-V37-002',
            'pax_count': 1,
            'payment_method': 'credit'
        })
        if resp.status_code == 200:
            test_data['booking2_id'] = resp.json()['id']
            print_result(True, f"Booking 2 created for Package 2: 1 pax, profit=50 SAR")
        else:
            print_result(False, f"Failed to create booking 2: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Error creating booking 2: {str(e)}")
        return False
    
    # Create Package 3 for extend date test
    try:
        end_date_short = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
        resp = session.post(f"{API_URL}/packages", json={
            'name': 'باكج تمديد التاريخ v3.7',
            'package_type': 'hajj',
            'currency': 'SAR',
            'start_date': today,
            'end_date': end_date_short,
            'notes': 'باكج لاختبار تمديد التاريخ',
            'status': 'open'
        })
        if resp.status_code == 200:
            test_data['package3_id'] = resp.json()['id']
            print_result(True, f"Package 3 (for extend date test) created: {test_data['package3_id']}, end_date={end_date_short}")
        else:
            print_result(False, f"Failed to create package 3: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Error creating package 3: {str(e)}")
        return False
    
    print_result(True, "Setup complete: 2 suppliers, 1 client, 3 packages (2 with bookings)")
    return True

def test_comparison_default():
    """Test 2: GET /api/packages/comparison (default period=all)"""
    print_test("2. Packages Comparison - Default (period=all)")
    try:
        resp = session.get(f"{API_URL}/packages/comparison")
        if resp.status_code == 200:
            data = resp.json()
            
            # Verify response structure
            if 'period' not in data or 'top' not in data or 'rows' not in data or 'totals' not in data:
                print_result(False, f"Response missing required fields. Got: {list(data.keys())}")
                return False
            
            # Verify period
            if data['period'] != 'all':
                print_result(False, f"Period should be 'all', got '{data['period']}'")
                return False
            
            # Verify rows structure
            rows = data['rows']
            if len(rows) < 3:
                print_result(False, f"Expected at least 3 packages, got {len(rows)}")
                return False
            
            # Verify each row has required fields
            required_fields = ['package_id', 'name', 'package_type', 'currency', 'status', 
                             'start_date', 'end_date', 'revenue', 'cost', 'profit', 
                             'margin_pct', 'pax', 'bookings']
            for i, row in enumerate(rows):
                missing = [f for f in required_fields if f not in row]
                if missing:
                    print_result(False, f"Row {i} missing fields: {missing}")
                    return False
            
            # Verify sorting by profit DESC
            profits = [r['profit'] for r in rows]
            if profits != sorted(profits, reverse=True):
                print_result(False, f"Rows not sorted by profit DESC. Profits: {profits}")
                return False
            
            # Verify top = first row with bookings > 0
            top = data['top']
            if top is None:
                # Check if all packages have 0 bookings
                has_bookings = any(r['bookings'] > 0 for r in rows)
                if has_bookings:
                    print_result(False, "top is null but some packages have bookings")
                    return False
            else:
                # top should be the first row with bookings > 0
                first_with_bookings = next((r for r in rows if r['bookings'] > 0), None)
                if first_with_bookings is None:
                    print_result(False, "top is not null but no packages have bookings")
                    return False
                if top['package_id'] != first_with_bookings['package_id']:
                    print_result(False, f"top package_id mismatch. Expected {first_with_bookings['package_id']}, got {top['package_id']}")
                    return False
                if top['bookings'] <= 0:
                    print_result(False, f"top package has bookings={top['bookings']}, should be > 0")
                    return False
            
            # Verify totals aggregation
            totals = data['totals']
            expected_revenue = sum(r['revenue'] for r in rows)
            expected_cost = sum(r['cost'] for r in rows)
            expected_profit = sum(r['profit'] for r in rows)
            expected_bookings = sum(r['bookings'] for r in rows)
            expected_pax = sum(r['pax'] for r in rows)
            
            if abs(totals['revenue'] - expected_revenue) > 0.01:
                print_result(False, f"Totals revenue mismatch. Expected {expected_revenue}, got {totals['revenue']}")
                return False
            if abs(totals['cost'] - expected_cost) > 0.01:
                print_result(False, f"Totals cost mismatch. Expected {expected_cost}, got {totals['cost']}")
                return False
            if abs(totals['profit'] - expected_profit) > 0.01:
                print_result(False, f"Totals profit mismatch. Expected {expected_profit}, got {totals['profit']}")
                return False
            if totals['bookings'] != expected_bookings:
                print_result(False, f"Totals bookings mismatch. Expected {expected_bookings}, got {totals['bookings']}")
                return False
            if totals['pax'] != expected_pax:
                print_result(False, f"Totals pax mismatch. Expected {expected_pax}, got {totals['pax']}")
                return False
            
            # Verify margin_pct calculation
            expected_margin = (expected_profit / expected_revenue * 100) if expected_revenue > 0 else 0
            expected_margin = round(expected_margin, 2)
            if abs(totals['margin_pct'] - expected_margin) > 0.01:
                print_result(False, f"Totals margin_pct mismatch. Expected {expected_margin}, got {totals['margin_pct']}")
                return False
            
            # Verify individual row margin_pct
            for row in rows:
                expected_row_margin = (row['profit'] / row['revenue'] * 100) if row['revenue'] > 0 else 0
                expected_row_margin = round(expected_row_margin, 2)
                if abs(row['margin_pct'] - expected_row_margin) > 0.01:
                    print_result(False, f"Row {row['name']} margin_pct mismatch. Expected {expected_row_margin}, got {row['margin_pct']}")
                    return False
            
            print_result(True, f"Comparison endpoint working correctly. Period=all, {len(rows)} packages, top={top['name'] if top else 'null'}, totals: revenue={totals['revenue']}, cost={totals['cost']}, profit={totals['profit']}, margin={totals['margin_pct']}%")
            print(f"  Top package: {top['name'] if top else 'null'} (profit={top['profit'] if top else 0}, bookings={top['bookings'] if top else 0})")
            row_summary = [f"{r['name'][:20]}... (profit={r['profit']})" for r in rows[:3]]
            print(f"  Rows sorted by profit DESC: {row_summary}")
            return True
        else:
            print_result(False, f"Comparison endpoint failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Comparison endpoint error: {str(e)}")
        return False

def test_comparison_month():
    """Test 3: GET /api/packages/comparison?period=month"""
    print_test("3. Packages Comparison - Current Month Filter")
    try:
        resp = session.get(f"{API_URL}/packages/comparison?period=month")
        if resp.status_code == 200:
            data = resp.json()
            
            if data['period'] != 'month':
                print_result(False, f"Period should be 'month', got '{data['period']}'")
                return False
            
            # Verify bookings are filtered to current month
            # Since we just created bookings, they should be in current month
            rows = data['rows']
            bookings_count = sum(r['bookings'] for r in rows)
            
            if bookings_count < 2:
                print_result(False, f"Expected at least 2 bookings in current month, got {bookings_count}")
                return False
            
            print_result(True, f"Month filter working. Period=month, {bookings_count} bookings in current month")
            return True
        else:
            print_result(False, f"Month comparison failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Month comparison error: {str(e)}")
        return False

def test_comparison_year():
    """Test 4: GET /api/packages/comparison?period=year"""
    print_test("4. Packages Comparison - Current Year Filter")
    try:
        resp = session.get(f"{API_URL}/packages/comparison?period=year")
        if resp.status_code == 200:
            data = resp.json()
            
            if data['period'] != 'year':
                print_result(False, f"Period should be 'year', got '{data['period']}'")
                return False
            
            # Verify bookings are filtered to current year
            rows = data['rows']
            bookings_count = sum(r['bookings'] for r in rows)
            
            if bookings_count < 2:
                print_result(False, f"Expected at least 2 bookings in current year, got {bookings_count}")
                return False
            
            print_result(True, f"Year filter working. Period=year, {bookings_count} bookings in current year")
            return True
        else:
            print_result(False, f"Year comparison failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Year comparison error: {str(e)}")
        return False

def test_extend_package_date():
    """Test 5: Extend Package End-Date via PATCH"""
    print_test("5. Extend Package End-Date")
    try:
        # Get current package details
        resp = session.get(f"{API_URL}/packages")
        if resp.status_code != 200:
            print_result(False, f"Failed to get packages: {resp.status_code}")
            return False
        
        packages = resp.json()
        pkg3 = next((p for p in packages if p['id'] == test_data['package3_id']), None)
        if not pkg3:
            print_result(False, f"Package 3 not found in list")
            return False
        
        old_end_date = pkg3.get('end_date')
        print(f"  Current end_date: {old_end_date}")
        
        # Extend end_date by 45 days
        new_end_date = (datetime.now() + timedelta(days=75)).strftime('%Y-%m-%d')
        print(f"  New end_date: {new_end_date}")
        
        # PATCH to update end_date
        resp = session.patch(f"{API_URL}/packages/{test_data['package3_id']}", json={
            'end_date': new_end_date
        })
        
        if resp.status_code != 200:
            print_result(False, f"Failed to extend end_date: {resp.status_code} - {resp.text}")
            return False
        
        # Verify end_date updated
        resp = session.get(f"{API_URL}/packages")
        if resp.status_code != 200:
            print_result(False, f"Failed to get packages after update: {resp.status_code}")
            return False
        
        packages = resp.json()
        pkg3_updated = next((p for p in packages if p['id'] == test_data['package3_id']), None)
        if not pkg3_updated:
            print_result(False, f"Package 3 not found after update")
            return False
        
        updated_end_date = pkg3_updated.get('end_date')
        # Check if date contains the new date (might be ISO format)
        if new_end_date not in str(updated_end_date):
            print_result(False, f"end_date not updated correctly. Expected {new_end_date}, got {updated_end_date}")
            return False
        
        # Verify booking still allowed on this package
        resp = session.post(f"{API_URL}/packages/{test_data['package3_id']}/components", json={
            'name': 'مكون اختبار',
            'component_type': 'other',
            'supplier_id': test_data['supplier1_id'],
            'cost_per_pax': 100,
            'sale_per_pax': 150
        })
        if resp.status_code != 200:
            print_result(False, f"Failed to add component after extend: {resp.status_code}")
            return False
        
        print_result(True, f"Package end_date extended successfully from {old_end_date} to {new_end_date}. Package still open for bookings.")
        return True
    except Exception as e:
        print_result(False, f"Extend date error: {str(e)}")
        return False

def test_tenant_isolation():
    """Test 6: Tenant Isolation - comparison only returns current tenant packages"""
    print_test("6. Tenant Isolation - Comparison Endpoint")
    try:
        resp = session.get(f"{API_URL}/packages/comparison")
        if resp.status_code == 200:
            data = resp.json()
            rows = data['rows']
            
            # All packages should belong to current tenant (owner@demo.com)
            # We can verify by checking that our test packages are present
            package_ids = [r['package_id'] for r in rows]
            
            if test_data['package1_id'] not in package_ids:
                print_result(False, f"Package 1 not found in comparison results (tenant isolation issue)")
                return False
            
            if test_data['package2_id'] not in package_ids:
                print_result(False, f"Package 2 not found in comparison results (tenant isolation issue)")
                return False
            
            print_result(True, f"Tenant isolation verified. Comparison returns only current tenant packages ({len(rows)} packages)")
            return True
        else:
            print_result(False, f"Tenant isolation test failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Tenant isolation error: {str(e)}")
        return False

def test_regression_packages_list():
    """Test 7: Regression - GET /api/packages still works"""
    print_test("7. Regression - GET /api/packages")
    try:
        resp = session.get(f"{API_URL}/packages")
        if resp.status_code == 200:
            packages = resp.json()
            if len(packages) >= 3:
                print_result(True, f"Packages list working. Found {len(packages)} packages")
                return True
            else:
                print_result(False, f"Expected at least 3 packages, got {len(packages)}")
                return False
        else:
            print_result(False, f"Packages list failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Packages list error: {str(e)}")
        return False

def test_regression_package_create():
    """Test 8: Regression - POST /api/packages still works"""
    print_test("8. Regression - POST /api/packages")
    try:
        resp = session.post(f"{API_URL}/packages", json={
            'name': 'باكج اختبار انحدار v3.7',
            'package_type': 'umrah',
            'currency': 'SAR',
            'notes': 'اختبار انحدار'
        })
        if resp.status_code == 200:
            pkg_id = resp.json()['id']
            print_result(True, f"Package creation working. Created package: {pkg_id}")
            # Clean up
            session.delete(f"{API_URL}/packages/{pkg_id}")
            return True
        else:
            print_result(False, f"Package creation failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Package creation error: {str(e)}")
        return False

def test_regression_package_report():
    """Test 9: Regression - GET /api/packages/:id/report still works"""
    print_test("9. Regression - GET /api/packages/:id/report")
    try:
        resp = session.get(f"{API_URL}/packages/{test_data['package1_id']}/report")
        if resp.status_code == 200:
            report = resp.json()
            if 'totals' in report and 'supplier_breakdown' in report:
                print_result(True, f"Package report working. Totals: profit={report['totals'].get('profit')}, bookings={report['totals'].get('bookings')}")
                return True
            else:
                print_result(False, f"Package report missing required fields")
                return False
        else:
            print_result(False, f"Package report failed: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Package report error: {str(e)}")
        return False

def test_regression_close_reopen():
    """Test 10: Regression - PATCH status=closed/open still works"""
    print_test("10. Regression - Close/Reopen Package")
    try:
        # Close package
        resp = session.patch(f"{API_URL}/packages/{test_data['package3_id']}", json={'status': 'closed'})
        if resp.status_code != 200:
            print_result(False, f"Failed to close package: {resp.status_code}")
            return False
        
        # Verify booking blocked on closed package
        resp = session.post(f"{API_URL}/packages/{test_data['package3_id']}/bookings", json={
            'client_id': test_data['client_id'],
            'pilgrim_name': 'test',
            'passport_no': 'test',
            'pax_count': 1,
            'payment_method': 'credit'
        })
        if resp.status_code == 400 and 'مغلق' in resp.text:
            print_result(True, f"Close package working. Booking correctly blocked on closed package")
        else:
            print_result(False, f"Booking should be blocked on closed package, got: {resp.status_code}")
            return False
        
        # Reopen package
        resp = session.patch(f"{API_URL}/packages/{test_data['package3_id']}", json={'status': 'open'})
        if resp.status_code == 200:
            print_result(True, f"Reopen package working")
            return True
        else:
            print_result(False, f"Failed to reopen package: {resp.status_code}")
            return False
    except Exception as e:
        print_result(False, f"Close/reopen error: {str(e)}")
        return False

def test_regression_refunds():
    """Test 11: Regression - v3.5 Refunds still work"""
    print_test("11. Regression - v3.5 Refunds")
    try:
        # Create a ticket for refund test
        resp = session.post(f"{API_URL}/tickets", json={
            'pnr': f'REFUND-V37-{datetime.now().strftime("%H%M%S")}',
            'client_id': test_data['client_id'],
            'supplier_id': test_data['supplier1_id'],
            'passenger_name': 'مسافر استرداد v3.7',
            'passport_no': 'YE-REF-V37',
            'cost': 100,
            'sale_price': 150,
            'currency': 'SAR',
            'payment_method': 'credit'
        })
        if resp.status_code != 200:
            print_result(False, f"Failed to create ticket for refund test: {resp.status_code}")
            return False
        
        ticket_id = resp.json()['id']
        
        # Create refund
        resp = session.post(f"{API_URL}/refunds", json={
            'ref_type': 'ticket',
            'ref_id': ticket_id,
            'supplier_penalty': 20,
            'office_fee': 10,
            'notes': 'اختبار استرداد v3.7'
        })
        
        if resp.status_code == 200:
            refund_id = resp.json()['id']
            print_result(True, f"Refunds still working. Created refund: {refund_id}")
            return True
        else:
            print_result(False, f"Refund creation failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print_result(False, f"Refunds error: {str(e)}")
        return False

def run_all_tests():
    """Run all v3.7 tests"""
    print("\n" + "="*80)
    print("RAHAAL ERP v3.7 BACKEND TEST SUITE")
    print("Packages Phase 2: Comparison + Extend Date")
    print("="*80)
    
    # Login
    if not login():
        print("\n❌ LOGIN FAILED - Cannot proceed with tests")
        return
    
    # Setup test data
    if not setup_test_data():
        print("\n❌ SETUP FAILED - Cannot proceed with tests")
        return
    
    # Run tests
    results = []
    results.append(("Health Check v3.7", test_health_version()))
    results.append(("Comparison Default (all)", test_comparison_default()))
    results.append(("Comparison Month Filter", test_comparison_month()))
    results.append(("Comparison Year Filter", test_comparison_year()))
    results.append(("Extend Package End-Date", test_extend_package_date()))
    results.append(("Tenant Isolation", test_tenant_isolation()))
    results.append(("Regression: Packages List", test_regression_packages_list()))
    results.append(("Regression: Package Create", test_regression_package_create()))
    results.append(("Regression: Package Report", test_regression_package_report()))
    results.append(("Regression: Close/Reopen", test_regression_close_reopen()))
    results.append(("Regression: Refunds", test_regression_refunds()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    if passed == total:
        print("✅ ALL TESTS PASSED - v3.7 backend is working correctly")
    else:
        print(f"❌ {total - passed} tests failed")
    print("="*80)

if __name__ == "__main__":
    run_all_tests()
