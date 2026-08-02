#!/usr/bin/env python3
"""
v3.9.7 Chrome Extension Trial Quota Backend Test Suite
Tests the scraper/ping and scraper/ingest endpoints with trial quota enforcement
"""

import requests
import json
import sys
from datetime import datetime

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test credentials
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "Demo@2025"
ADMIN_EMAIL = "admin@targetmedia.com"
ADMIN_PASSWORD = "Target@2025"

def print_test(name, passed, details=""):
    """Print test result"""
    status = "✅ PASSED" if passed else "❌ FAILED"
    print(f"\n{status} - {name}")
    if details:
        print(f"  {details}")

def login(email, password):
    """Login and return session cookie"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", 
                           json={"email": email, "password": password},
                           timeout=30)
        if resp.status_code == 200:
            cookie = resp.cookies.get('rahaal_session')
            print(f"✅ Login successful for {email}")
            return cookie
        else:
            print(f"❌ Login failed for {email}: {resp.status_code} - {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Login error for {email}: {str(e)}")
        return None

def create_pat(session_cookie):
    """Create a PAT token"""
    try:
        resp = requests.post(f"{BASE_URL}/pats",
                           json={"name": "v3.9.7 Test PAT"},
                           cookies={"rahaal_session": session_cookie},
                           timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get('token')
            print(f"✅ PAT created: {token[:20]}...")
            return token
        else:
            print(f"⚠️  PAT creation response: {resp.status_code} - {resp.text[:200]}")
            # Try to get existing PATs
            resp = requests.get(f"{BASE_URL}/pats",
                              cookies={"rahaal_session": session_cookie},
                              timeout=30)
            if resp.status_code == 200:
                pats = resp.json()
                if pats and len(pats) > 0:
                    print(f"⚠️  Using existing PAT (cannot retrieve full token, need to create new one)")
                    return None
            return None
    except Exception as e:
        print(f"❌ PAT creation error: {str(e)}")
        return None

def get_tenant_info(session_cookie):
    """Get tenant info from /auth/me"""
    try:
        resp = requests.get(f"{BASE_URL}/auth/me",
                          cookies={"rahaal_session": session_cookie},
                          timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            tenant = data.get('tenant', {})
            return tenant
        return None
    except Exception as e:
        print(f"❌ Get tenant info error: {str(e)}")
        return None

def get_clients_suppliers(session_cookie):
    """Get first client and supplier IDs"""
    try:
        # Get clients
        resp = requests.get(f"{BASE_URL}/clients",
                          cookies={"rahaal_session": session_cookie},
                          timeout=30)
        clients = resp.json() if resp.status_code == 200 else []
        
        # Get suppliers
        resp = requests.get(f"{BASE_URL}/suppliers",
                          cookies={"rahaal_session": session_cookie},
                          timeout=30)
        suppliers = resp.json() if resp.status_code == 200 else []
        
        if clients and suppliers:
            return clients[0]['id'], suppliers[0]['id']
        return None, None
    except Exception as e:
        print(f"❌ Get clients/suppliers error: {str(e)}")
        return None, None

def test_scraper_ping(pat_token):
    """Test GET /api/scraper/ping"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/scraper/ping with valid PAT")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/scraper/ping",
                          headers={"Authorization": f"Bearer {pat_token}"},
                          timeout=30)
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Verify response structure
        passed = (
            resp.status_code == 200 and
            data.get('ok') == True and
            'tenant' in data and
            'user' in data and
            data.get('version') == '3.9.7' and
            data.get('extension_min_version') == '1.4.0' and
            'usage' in data and
            'plan' in data['usage'] and
            'used' in data['usage'] and
            'limit' in data['usage'] and
            'remaining' in data['usage'] and
            'unlimited' in data['usage']
        )
        
        usage = data.get('usage', {})
        details = f"Plan: {usage.get('plan')}, Used: {usage.get('used')}, Limit: {usage.get('limit')}, Remaining: {usage.get('remaining')}, Unlimited: {usage.get('unlimited')}"
        print_test("GET /api/scraper/ping structure", passed, details)
        
        return passed, data
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print_test("GET /api/scraper/ping", False, str(e))
        return False, None

def test_scraper_ingest_flight(pat_token, client_id, supplier_id):
    """Test POST /api/scraper/ingest with flight ticket"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/scraper/ingest (flight ticket)")
    print("="*80)
    
    payload = {
        "traveler": {
            "name_ar": "احمد علي",
            "passport_no": "MK0011",
            "phone": "777123456"
        },
        "booking": {
            "doc_type": "flight",
            "pnr": "ABC123",
            "ticket_no": "T-9001",
            "carrier": "IY",
            "route_from": "SAH",
            "route_to": "CAI"
        },
        "dates": {
            "issued_at": "2026-08-02T10:00:00Z",
            "trip_date": "2026-09-01"
        },
        "financial": {
            "amount": 150,
            "currency": "USD"
        },
        "client_id": client_id,
        "supplier_id": supplier_id,
        "cost": 120,
        "payment_method": "credit"
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/scraper/ingest",
                           headers={"Authorization": f"Bearer {pat_token}"},
                           json=payload,
                           timeout=30)
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Verify response structure
        passed = (
            resp.status_code == 200 and
            data.get('ok') == True and
            data.get('record_type') == 'ticket' and
            'record_id' in data and
            'usage' in data and
            'used' in data['usage']
        )
        
        usage = data.get('usage', {})
        details = f"Record Type: {data.get('record_type')}, Usage: {usage.get('used')}/{usage.get('limit')}"
        print_test("POST /api/scraper/ingest (flight)", passed, details)
        
        return passed, data
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print_test("POST /api/scraper/ingest (flight)", False, str(e))
        return False, None

def test_scraper_ingest_visa(pat_token, client_id, supplier_id):
    """Test POST /api/scraper/ingest with umrah visa"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/scraper/ingest (umrah visa)")
    print("="*80)
    
    payload = {
        "traveler": {
            "name_ar": "خديجة سعيد",
            "passport_no": "16439690",
            "nationality": "يمني",
            "phone": "777888999"
        },
        "booking": {
            "doc_type": "umrah_visa",
            "visa_no": "6169794577",
            "application_no": "E821262038"
        },
        "dates": {
            "issued_at": "2026-08-02T10:00:00Z",
            "valid_from": "2026-07-17",
            "valid_until": "2026-10-15"
        },
        "financial": {
            "amount": 800,
            "currency": "SAR"
        },
        "client_id": client_id,
        "supplier_id": supplier_id,
        "cost": 500,
        "payment_method": "credit"
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/scraper/ingest",
                           headers={"Authorization": f"Bearer {pat_token}"},
                           json=payload,
                           timeout=30)
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Verify response structure
        passed = (
            resp.status_code == 200 and
            data.get('ok') == True and
            data.get('record_type') == 'visa' and
            'record_id' in data and
            'usage' in data and
            'used' in data['usage']
        )
        
        usage = data.get('usage', {})
        details = f"Record Type: {data.get('record_type')}, Usage: {usage.get('used')}/{usage.get('limit')}"
        print_test("POST /api/scraper/ingest (umrah visa)", passed, details)
        
        return passed, data
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print_test("POST /api/scraper/ingest (umrah visa)", False, str(e))
        return False, None

def test_trial_cap_enforcement(pat_token, client_id, supplier_id, tenant_id):
    """Test trial cap enforcement at 30/30"""
    print("\n" + "="*80)
    print("TEST 4: Trial cap enforcement (30/30)")
    print("="*80)
    
    # First, we need to set scraper_usage.count to 30 via MongoDB
    print("⚠️  Note: This test requires manual MongoDB update to set scraper_usage.count=30")
    print(f"   Run: db.tenants.updateOne({{id: '{tenant_id}'}}, {{$set: {{'scraper_usage.count': 30, subscription: 'trial'}}, $unset: {{activation_confirmed: ''}}}})")
    
    # Try to ingest one more
    payload = {
        "traveler": {"name_ar": "اختبار الحد", "passport_no": "TEST999"},
        "booking": {"doc_type": "flight", "pnr": "TEST999"},
        "dates": {"issued_at": "2026-08-02T10:00:00Z"},
        "financial": {"amount": 100, "currency": "USD"},
        "client_id": client_id,
        "supplier_id": supplier_id,
        "cost": 80,
        "payment_method": "credit"
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/scraper/ingest",
                           headers={"Authorization": f"Bearer {pat_token}"},
                           json=payload,
                           timeout=30)
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Should return 402 with quota_exceeded
        passed = (
            resp.status_code == 402 and
            data.get('quota_exceeded') == True and
            'error' in data and
            'usage' in data and
            data['usage'].get('used') == 30 and
            data['usage'].get('limit') == 30 and
            data['usage'].get('remaining') == 0
        )
        
        details = f"Status: {resp.status_code}, Quota Exceeded: {data.get('quota_exceeded')}, Error: {data.get('error', '')[:50]}"
        print_test("Trial cap enforcement (30/30)", passed, details)
        
        return passed, data
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print_test("Trial cap enforcement", False, str(e))
        return False, None

def test_paid_tenant_bypass(pat_token, client_id, supplier_id, tenant_id):
    """Test paid tenant bypass (unlimited)"""
    print("\n" + "="*80)
    print("TEST 5: Paid tenant bypass (unlimited)")
    print("="*80)
    
    print("⚠️  Note: This test requires manual MongoDB update to set subscription='paid'")
    print(f"   Run: db.tenants.updateOne({{id: '{tenant_id}'}}, {{$set: {{subscription: 'paid'}}}})")
    
    # Try to ingest
    payload = {
        "traveler": {"name_ar": "اختبار مدفوع", "passport_no": "PAID001"},
        "booking": {"doc_type": "flight", "pnr": "PAID001"},
        "dates": {"issued_at": "2026-08-02T10:00:00Z"},
        "financial": {"amount": 100, "currency": "USD"},
        "client_id": client_id,
        "supplier_id": supplier_id,
        "cost": 80,
        "payment_method": "credit"
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/scraper/ingest",
                           headers={"Authorization": f"Bearer {pat_token}"},
                           json=payload,
                           timeout=30)
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Should return 200 with unlimited=true
        passed = (
            resp.status_code == 200 and
            data.get('ok') == True and
            'usage' in data and
            data['usage'].get('unlimited') == True and
            data['usage'].get('plan') == 'paid'
        )
        
        usage = data.get('usage', {})
        details = f"Plan: {usage.get('plan')}, Unlimited: {usage.get('unlimited')}"
        print_test("Paid tenant bypass", passed, details)
        
        return passed, data
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print_test("Paid tenant bypass", False, str(e))
        return False, None

def test_regression_health():
    """Test regression: /health endpoint"""
    print("\n" + "="*80)
    print("REGRESSION TEST: GET /api/health")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=30)
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        passed = resp.status_code == 200 and data.get('status') == 'ok'
        print_test("GET /api/health", passed)
        return passed
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print_test("GET /api/health", False, str(e))
        return False

def test_regression_packages(session_cookie):
    """Test regression: /packages endpoint"""
    print("\n" + "="*80)
    print("REGRESSION TEST: GET /api/packages")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/packages",
                          cookies={"rahaal_session": session_cookie},
                          timeout=30)
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: Found {len(data)} packages")
        
        passed = resp.status_code == 200 and isinstance(data, list)
        print_test("GET /api/packages", passed, f"Found {len(data)} packages")
        return passed
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print_test("GET /api/packages", False, str(e))
        return False

def test_regression_auth_me(session_cookie):
    """Test regression: /auth/me returns journal_quota"""
    print("\n" + "="*80)
    print("REGRESSION TEST: GET /api/auth/me (journal_quota)")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/auth/me",
                          cookies={"rahaal_session": session_cookie},
                          timeout=30)
        print(f"Status: {resp.status_code}")
        data = resp.json()
        
        tenant = data.get('tenant', {})
        journal_quota = tenant.get('journal_quota', {})
        print(f"Journal Quota: {json.dumps(journal_quota, indent=2, ensure_ascii=False)}")
        
        passed = (
            resp.status_code == 200 and
            'journal_quota' in tenant and
            'used' in journal_quota and
            'limit' in journal_quota
        )
        print_test("GET /api/auth/me (journal_quota)", passed)
        return passed
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print_test("GET /api/auth/me", False, str(e))
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("v3.9.7 CHROME EXTENSION TRIAL QUOTA - BACKEND TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started: {datetime.now().isoformat()}")
    
    results = []
    
    # Login as owner
    print("\n" + "="*80)
    print("SETUP: Login and create PAT")
    print("="*80)
    session_cookie = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not session_cookie:
        print("❌ FATAL: Cannot login as owner. Aborting tests.")
        sys.exit(1)
    
    # Get tenant info
    tenant = get_tenant_info(session_cookie)
    tenant_id = tenant.get('id') if tenant else None
    print(f"Tenant ID: {tenant_id}")
    print(f"Tenant Name: {tenant.get('name') if tenant else 'Unknown'}")
    
    # Create PAT
    pat_token = create_pat(session_cookie)
    if not pat_token:
        print("❌ FATAL: Cannot create PAT. Please create one manually via the app.")
        print("   Go to Settings → Extension tab → Create new PAT")
        print("   Then set PAT_TOKEN environment variable and re-run this script.")
        sys.exit(1)
    
    # Get client and supplier IDs
    client_id, supplier_id = get_clients_suppliers(session_cookie)
    if not client_id or not supplier_id:
        print("❌ FATAL: Cannot get client/supplier IDs. Aborting tests.")
        sys.exit(1)
    print(f"Client ID: {client_id}")
    print(f"Supplier ID: {supplier_id}")
    
    # Run tests
    passed, data = test_scraper_ping(pat_token)
    results.append(("GET /api/scraper/ping", passed))
    
    passed, data = test_scraper_ingest_flight(pat_token, client_id, supplier_id)
    results.append(("POST /api/scraper/ingest (flight)", passed))
    
    passed, data = test_scraper_ingest_visa(pat_token, client_id, supplier_id)
    results.append(("POST /api/scraper/ingest (umrah visa)", passed))
    
    # Note: Tests 4 and 5 require manual MongoDB updates
    print("\n" + "="*80)
    print("MANUAL TESTS (require MongoDB updates)")
    print("="*80)
    print("TEST 4: Trial cap enforcement (30/30)")
    mongo_cmd = f"db.tenants.updateOne({{id: '{tenant_id}'}}, {{$set: {{'scraper_usage.count': 30, subscription: 'trial'}}, $unset: {{activation_confirmed: ''}}}})"
    print(f"  1. Run: {mongo_cmd}")
    print(f"  2. Then call POST /api/scraper/ingest - should return 402 with quota_exceeded=true")
    print("")
    print("TEST 5: Paid tenant bypass")
    mongo_cmd2 = f"db.tenants.updateOne({{id: '{tenant_id}'}}, {{$set: {{subscription: 'paid'}}}})"
    print(f"  1. Run: {mongo_cmd2}")
    print(f"  2. Then call POST /api/scraper/ingest - should return 200 with unlimited=true")
    
    # Regression tests
    passed = test_regression_health()
    results.append(("Regression: GET /api/health", passed))
    
    passed = test_regression_packages(session_cookie)
    results.append(("Regression: GET /api/packages", passed))
    
    passed = test_regression_auth_me(session_cookie)
    results.append(("Regression: GET /api/auth/me", passed))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    total = len(results)
    passed_count = sum(1 for _, p in results if p)
    
    for name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status} - {name}")
    
    print(f"\nTotal: {passed_count}/{total} tests passed")
    print(f"Completed: {datetime.now().isoformat()}")
    
    if passed_count == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed_count} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
