#!/usr/bin/env python3
"""
Rahaal ERP v3.9.17 Backend Test Suite
Tests 2 new admin endpoints: topup and reset-password
"""

import requests
import json
from typing import Dict, Any, Optional

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@targetmedia.com"
ADMIN_PASSWORD = "Target@2025"
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "Demo@2025"

class TestSession:
    def __init__(self):
        self.session = requests.Session()
        self.cookies = {}
    
    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Login and store session cookie"""
        resp = self.session.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password}
        )
        if resp.status_code == 200:
            # Store cookies
            self.cookies = dict(resp.cookies)
        return resp
    
    def get(self, path: str, **kwargs) -> requests.Response:
        """GET request with session cookies"""
        return self.session.get(f"{BASE_URL}{path}", **kwargs)
    
    def post(self, path: str, **kwargs) -> requests.Response:
        """POST request with session cookies"""
        return self.session.post(f"{BASE_URL}{path}", **kwargs)
    
    def get_cookie_header(self) -> Dict[str, str]:
        """Get cookie header for manual requests"""
        if self.cookies:
            cookie_str = "; ".join([f"{k}={v}" for k, v in self.cookies.items()])
            return {"Cookie": cookie_str}
        return {}

def print_test(name: str):
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_result(passed: bool, message: str):
    status = "✅ PASSED" if passed else "❌ FAILED"
    print(f"{status}: {message}")

def main():
    print("="*80)
    print("Rahaal ERP v3.9.17 Backend Test Suite")
    print("Testing: POST /api/admin/tenants/{id}/topup")
    print("Testing: POST /api/admin/tenants/{id}/reset-password")
    print("="*80)
    
    # Test 1: Health Check
    print_test("1. Health Check - Version 3.9.17")
    try:
        resp = requests.get(f"{BASE_URL}/health")
        data = resp.json()
        passed = resp.status_code == 200 and data.get('version') == '3.9.17'
        print_result(passed, f"Status: {resp.status_code}, Version: {data.get('version')}")
        if not passed:
            print(f"Response: {json.dumps(data, indent=2)}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 2: Login as Super Admin
    print_test("2. Login as Super Admin")
    admin_session = TestSession()
    try:
        resp = admin_session.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        data = resp.json()
        passed = resp.status_code == 200 and data.get('user', {}).get('role') == 'super_admin'
        print_result(passed, f"Status: {resp.status_code}, Role: {data.get('user', {}).get('role')}")
        if not passed:
            print(f"Response: {json.dumps(data, indent=2)}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 3: Get Tenants List and Note Current Quota
    print_test("3. GET /api/admin/tenants - Get Demo Tenant Info")
    demo_tenant_id = None
    initial_quota_limit = None
    try:
        resp = admin_session.get("/admin/tenants")
        data = resp.json()
        tenants = data.get('tenants', []) if isinstance(data, dict) else data
        passed = resp.status_code == 200 and isinstance(tenants, list)
        
        # Find demo tenant
        demo_tenant = next((t for t in tenants if t.get('slug') == 'demo'), None)
        if demo_tenant:
            demo_tenant_id = demo_tenant.get('id')
            initial_quota_limit = demo_tenant.get('journal_quota', {}).get('limit', 500)
            print_result(passed, f"Found demo tenant: {demo_tenant_id}, Current quota limit: {initial_quota_limit}")
        else:
            print_result(False, "Demo tenant not found")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    if not demo_tenant_id:
        print("❌ Cannot continue without demo tenant ID")
        return
    
    # Test 4a: Valid Topup
    print_test("4a. POST /api/admin/tenants/{id}/topup - Valid topup (500 credits)")
    try:
        resp = admin_session.post(
            f"/admin/tenants/{demo_tenant_id}/topup",
            json={"amount": 500, "note": "شحن تجريبي — دفعة تجريبية"}
        )
        data = resp.json()
        passed = (
            resp.status_code == 200 and
            data.get('success') == True and
            data.get('added') == 500 and
            data.get('prev_limit') == initial_quota_limit and
            data.get('new_limit') == initial_quota_limit + 500 and
            data.get('tenant_id') == demo_tenant_id
        )
        print_result(passed, f"Status: {resp.status_code}, Added: {data.get('added')}, New limit: {data.get('new_limit')}, Prev limit: {data.get('prev_limit')}")
        if not passed:
            print(f"Response: {json.dumps(data, indent=2)}")
        
        # Update expected limit for next test
        if passed:
            initial_quota_limit = data.get('new_limit')
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 4b: Verify Topup Persisted
    print_test("4b. GET /api/admin/tenants - Verify topup persisted")
    try:
        resp = admin_session.get("/admin/tenants")
        data = resp.json()
        tenants = data.get('tenants', []) if isinstance(data, dict) else data
        demo_tenant = next((t for t in tenants if t.get('id') == demo_tenant_id), None)
        
        if demo_tenant:
            new_limit = demo_tenant.get('journal_quota', {}).get('limit')
            topups = demo_tenant.get('wallet', {}).get('topups', [])
            latest_topup = topups[-1] if topups else None
            
            passed = (
                new_limit == initial_quota_limit and
                latest_topup is not None and
                latest_topup.get('amount') == 500 and
                latest_topup.get('note') == "شحن تجريبي — دفعة تجريبية" and
                latest_topup.get('by') == ADMIN_EMAIL
            )
            print_result(passed, f"Quota limit: {new_limit}, Latest topup: {latest_topup.get('amount') if latest_topup else 'None'}")
            if not passed:
                print(f"Topup entry: {json.dumps(latest_topup, indent=2, ensure_ascii=False)}")
        else:
            print_result(False, "Demo tenant not found")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 4c: Edge case - amount=0
    print_test("4c. POST topup - Edge case: amount=0 (should return 400)")
    try:
        resp = admin_session.post(
            f"/admin/tenants/{demo_tenant_id}/topup",
            json={"amount": 0, "note": "invalid"}
        )
        data = resp.json()
        passed = resp.status_code == 400
        print_result(passed, f"Status: {resp.status_code}, Error: {data.get('error', 'N/A')}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 4d: Edge case - amount=-100
    print_test("4d. POST topup - Edge case: amount=-100 (should return 400)")
    try:
        resp = admin_session.post(
            f"/admin/tenants/{demo_tenant_id}/topup",
            json={"amount": -100, "note": "invalid"}
        )
        data = resp.json()
        passed = resp.status_code == 400
        print_result(passed, f"Status: {resp.status_code}, Error: {data.get('error', 'N/A')}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 4e: Edge case - amount=2000000 (exceeds 1M cap)
    print_test("4e. POST topup - Edge case: amount=2000000 (should return 400)")
    try:
        resp = admin_session.post(
            f"/admin/tenants/{demo_tenant_id}/topup",
            json={"amount": 2000000, "note": "invalid"}
        )
        data = resp.json()
        passed = resp.status_code == 400
        print_result(passed, f"Status: {resp.status_code}, Error: {data.get('error', 'N/A')}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 4f: Edge case - no amount
    print_test("4f. POST topup - Edge case: no amount (should return 400)")
    try:
        resp = admin_session.post(
            f"/admin/tenants/{demo_tenant_id}/topup",
            json={"note": "invalid"}
        )
        data = resp.json()
        passed = resp.status_code == 400
        print_result(passed, f"Status: {resp.status_code}, Error: {data.get('error', 'N/A')}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 4g: Edge case - bogus tenant id
    print_test("4g. POST topup - Edge case: bogus tenant id (should return 404)")
    try:
        resp = admin_session.post(
            f"/admin/tenants/nonexistent-tenant-id/topup",
            json={"amount": 100, "note": "test"}
        )
        data = resp.json()
        passed = resp.status_code == 404 and "المكتب غير موجود" in data.get('error', '')
        print_result(passed, f"Status: {resp.status_code}, Error: {data.get('error', 'N/A')}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 4h: Non-admin tries topup
    print_test("4h. POST topup - Non-admin user (should return 403)")
    owner_session = TestSession()
    try:
        # Login as owner
        resp = owner_session.login(OWNER_EMAIL, OWNER_PASSWORD)
        if resp.status_code == 200:
            # Try topup
            resp = owner_session.post(
                f"/admin/tenants/{demo_tenant_id}/topup",
                json={"amount": 100, "note": "unauthorized"}
            )
            data = resp.json()
            passed = resp.status_code == 403
            print_result(passed, f"Status: {resp.status_code}, Error: {data.get('error', 'N/A')}")
        else:
            print_result(False, f"Owner login failed: {resp.status_code}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 5a: Reset Password - Setup (login as owner, verify session works)
    print_test("5a. Reset Password - Setup: Login as owner@demo.com")
    owner_session = TestSession()
    owner_old_cookie = None
    try:
        resp = owner_session.login(OWNER_EMAIL, OWNER_PASSWORD)
        data = resp.json()
        passed = resp.status_code == 200 and data.get('user', {}).get('email') == OWNER_EMAIL
        
        if passed:
            # Verify GET /api/auth/me works
            me_resp = owner_session.get("/auth/me")
            me_data = me_resp.json()
            user_email = me_data.get('user', {}).get('email') if me_data.get('user') else None
            passed = me_resp.status_code == 200 and user_email == OWNER_EMAIL
            owner_old_cookie = owner_session.get_cookie_header()
            print_result(passed, f"Owner logged in, session working, email: {user_email}")
        else:
            print_result(False, f"Login failed: {resp.status_code}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 5b: Reset Password - Auto-generate
    print_test("5b. POST /api/admin/tenants/{id}/reset-password - Auto-generate password")
    new_password = None
    try:
        resp = admin_session.post(
            f"/admin/tenants/{demo_tenant_id}/reset-password",
            json={}
        )
        data = resp.json()
        new_password = data.get('new_password')
        passed = (
            resp.status_code == 200 and
            data.get('success') == True and
            data.get('tenant_id') == demo_tenant_id and
            data.get('owner_email') == OWNER_EMAIL and
            new_password is not None and
            len(new_password) == 10
        )
        print_result(passed, f"Status: {resp.status_code}, New password length: {len(new_password) if new_password else 0}, Owner: {data.get('owner_email')}")
        if not passed:
            print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 5c: Verify old session invalidated
    print_test("5c. Verify old session invalidated (GET /api/auth/me with old cookie)")
    try:
        # Use the old session object which still has the cookie
        me_resp = owner_session.get("/auth/me")
        me_data = me_resp.json()
        # Session is invalidated if user is null (even if status is 200)
        user_is_null = me_data.get('user') is None
        passed = me_resp.status_code == 200 and user_is_null
        print_result(passed, f"Status: {me_resp.status_code}, User is null: {user_is_null} (session invalidated)")
        if not passed:
            print(f"Response: {me_data}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 5d: Try login with old password
    print_test("5d. Try login with old password (should fail with 401)")
    try:
        old_pwd_session = TestSession()
        resp = old_pwd_session.login(OWNER_EMAIL, OWNER_PASSWORD)
        data = resp.json()
        passed = resp.status_code == 401
        print_result(passed, f"Status: {resp.status_code}, Error: {data.get('error', 'N/A')}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 5e: Login with new password
    print_test("5e. Login with new password (should succeed)")
    try:
        if new_password:
            new_pwd_session = TestSession()
            resp = new_pwd_session.login(OWNER_EMAIL, new_password)
            data = resp.json()
            passed = resp.status_code == 200 and data.get('user', {}).get('email') == OWNER_EMAIL
            print_result(passed, f"Status: {resp.status_code}, Email: {data.get('user', {}).get('email')}")
        else:
            print_result(False, "No new password to test")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 5f: Reset password back to Demo@2025
    print_test("5f. Reset password back to Demo@2025 (restore demo credential)")
    try:
        resp = admin_session.post(
            f"/admin/tenants/{demo_tenant_id}/reset-password",
            json={"new_password": OWNER_PASSWORD}
        )
        data = resp.json()
        passed = (
            resp.status_code == 200 and
            data.get('success') == True and
            data.get('new_password') == OWNER_PASSWORD
        )
        print_result(passed, f"Status: {resp.status_code}, Password restored")
        
        # Verify login works with restored password
        if passed:
            restored_session = TestSession()
            login_resp = restored_session.login(OWNER_EMAIL, OWNER_PASSWORD)
            login_passed = login_resp.status_code == 200
            print_result(login_passed, f"Login with restored password: {login_resp.status_code}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 5g: Edge case - password < 6 chars
    print_test("5g. POST reset-password - Edge case: password < 6 chars (should return 400)")
    try:
        resp = admin_session.post(
            f"/admin/tenants/{demo_tenant_id}/reset-password",
            json={"new_password": "abc"}
        )
        data = resp.json()
        passed = resp.status_code == 400
        print_result(passed, f"Status: {resp.status_code}, Error: {data.get('error', 'N/A')}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 5h: Non-admin tries reset-password
    print_test("5h. POST reset-password - Non-admin user (should return 403)")
    try:
        # Login as owner
        owner_session2 = TestSession()
        resp = owner_session2.login(OWNER_EMAIL, OWNER_PASSWORD)
        if resp.status_code == 200:
            # Try reset-password
            resp = owner_session2.post(
                f"/admin/tenants/{demo_tenant_id}/reset-password",
                json={"new_password": "NewPass123"}
            )
            data = resp.json()
            passed = resp.status_code == 403
            print_result(passed, f"Status: {resp.status_code}, Error: {data.get('error', 'N/A')}")
        else:
            print_result(False, f"Owner login failed: {resp.status_code}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 6: Regression - GET /api/admin/tenants
    print_test("6a. Regression - GET /api/admin/tenants still works")
    try:
        resp = admin_session.get("/admin/tenants")
        data = resp.json()
        tenants = data.get('tenants', []) if isinstance(data, dict) else data
        passed = resp.status_code == 200 and isinstance(tenants, list) and len(tenants) > 0
        print_result(passed, f"Status: {resp.status_code}, Tenants count: {len(tenants)}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    # Test 6b: Regression - POST /api/tickets
    print_test("6b. Regression - POST /api/tickets still works")
    try:
        # Login as owner
        owner_session3 = TestSession()
        resp = owner_session3.login(OWNER_EMAIL, OWNER_PASSWORD)
        if resp.status_code == 200:
            # Get clients and suppliers
            clients_resp = owner_session3.get("/clients")
            suppliers_resp = owner_session3.get("/suppliers")
            
            if clients_resp.status_code == 200 and suppliers_resp.status_code == 200:
                clients = clients_resp.json()
                suppliers = suppliers_resp.json()
                
                if clients and suppliers:
                    # Create ticket
                    ticket_resp = owner_session3.post(
                        "/tickets",
                        json={
                            "pnr": f"TEST-REGR-{int(requests.get(f'{BASE_URL}/health').json().get('uptime_sec', 0))}",
                            "client_id": clients[0]['id'],
                            "supplier_id": suppliers[0]['id'],
                            "cost": 100,
                            "sale_price": 150,
                            "currency": "SAR",
                            "payment_method": "credit"
                        }
                    )
                    ticket_data = ticket_resp.json()
                    passed = ticket_resp.status_code == 200 and ticket_data.get('id') is not None
                    print_result(passed, f"Status: {ticket_resp.status_code}, Ticket ID: {ticket_data.get('id', 'N/A')}")
                else:
                    print_result(False, "No clients or suppliers found")
            else:
                print_result(False, f"Failed to get clients/suppliers: {clients_resp.status_code}/{suppliers_resp.status_code}")
        else:
            print_result(False, f"Owner login failed: {resp.status_code}")
    except Exception as e:
        print_result(False, f"Exception: {e}")
    
    print("\n" + "="*80)
    print("TEST SUITE COMPLETED")
    print("="*80)

if __name__ == "__main__":
    main()
