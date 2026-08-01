#!/usr/bin/env python3
"""
v3.9 Backend Testing Script for Rahaal ERP
Tests: Gmail-only Signup + Deferred Referral Bonus
"""

import requests
import json
import time
from datetime import datetime

# Base URL from environment
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Super Admin credentials
SUPER_ADMIN_EMAIL = "admin@targetmedia.com"
SUPER_ADMIN_PASSWORD = "Target@2025"

# Test results tracking
test_results = []

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASSED" if passed else "❌ FAILED"
    print(f"{status} - {test_name}")
    if details:
        print(f"  Details: {details}")
    test_results.append({
        "test": test_name,
        "passed": passed,
        "details": details
    })

def print_summary():
    """Print test summary"""
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    print(f"\n{'='*60}")
    print(f"TEST SUMMARY: {passed}/{total} PASSED")
    print(f"{'='*60}")
    for r in test_results:
        status = "✅" if r["passed"] else "❌"
        print(f"{status} {r['test']}")
    print(f"{'='*60}\n")

def test_health_version():
    """Test 1: Health endpoint returns version 3.9"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        data = response.json()
        
        if response.status_code == 200 and data.get("version") == "3.9":
            log_test("Health version 3.9", True, f"Version: {data.get('version')}")
            return True
        else:
            log_test("Health version 3.9", False, f"Expected version 3.9, got {data.get('version')}")
            return False
    except Exception as e:
        log_test("Health version 3.9", False, f"Error: {str(e)}")
        return False

def test_gmail_only_yahoo():
    """Test 2a: Non-Gmail signup (Yahoo) should be rejected"""
    try:
        payload = {
            "name": "Test Office Yahoo",
            "owner_name": "Test User Yahoo",
            "owner_email": "testuser@yahoo.com",
            "owner_password": "Pass@2025"
        }
        response = requests.post(f"{BASE_URL}/public/signup", json=payload, timeout=10)
        
        if response.status_code == 400:
            error_text = response.json().get("error", "")
            if "Gmail" in error_text or "gmail" in error_text.lower():
                log_test("Gmail-only: Yahoo rejected", True, f"Error: {error_text}")
                return True
            else:
                log_test("Gmail-only: Yahoo rejected", False, f"Wrong error message: {error_text}")
                return False
        else:
            log_test("Gmail-only: Yahoo rejected", False, f"Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        log_test("Gmail-only: Yahoo rejected", False, f"Error: {str(e)}")
        return False

def test_gmail_only_hotmail():
    """Test 2b: Non-Gmail signup (Hotmail) should be rejected"""
    try:
        payload = {
            "name": "Test Office Hotmail",
            "owner_name": "Test User Hotmail",
            "owner_email": "testuser@hotmail.com",
            "owner_password": "Pass@2025"
        }
        response = requests.post(f"{BASE_URL}/public/signup", json=payload, timeout=10)
        
        if response.status_code == 400:
            error_text = response.json().get("error", "")
            if "Gmail" in error_text or "gmail" in error_text.lower():
                log_test("Gmail-only: Hotmail rejected", True, f"Error: {error_text}")
                return True
            else:
                log_test("Gmail-only: Hotmail rejected", False, f"Wrong error message: {error_text}")
                return False
        else:
            log_test("Gmail-only: Hotmail rejected", False, f"Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        log_test("Gmail-only: Hotmail rejected", False, f"Error: {str(e)}")
        return False

def test_gmail_alias_rejected():
    """Test 2c: Gmail with + alias should be rejected"""
    try:
        payload = {
            "name": "Test Office Alias",
            "owner_name": "Test User Alias",
            "owner_email": "testuser+alias@gmail.com",
            "owner_password": "Pass@2025"
        }
        response = requests.post(f"{BASE_URL}/public/signup", json=payload, timeout=10)
        
        if response.status_code == 400:
            error_text = response.json().get("error", "")
            if "+" in error_text or "alias" in error_text.lower() or "gmail" in error_text.lower():
                log_test("Gmail-only: Alias rejected", True, f"Error: {error_text}")
                return True
            else:
                log_test("Gmail-only: Alias rejected", False, f"Wrong error message: {error_text}")
                return False
        else:
            log_test("Gmail-only: Alias rejected", False, f"Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        log_test("Gmail-only: Alias rejected", False, f"Error: {str(e)}")
        return False

def test_valid_gmail_signup():
    """Test 2d: Valid Gmail signup should succeed"""
    try:
        timestamp = int(time.time())
        email = f"rahal.test.{timestamp}@gmail.com"
        
        payload = {
            "name": f"Test Office {timestamp}",
            "owner_name": "Test User Valid",
            "owner_email": email,
            "owner_password": "Pass@2025"
        }
        response = requests.post(f"{BASE_URL}/public/signup", json=payload, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("tenant") and data.get("tenant", {}).get("id"):
                tenant_id = data["tenant"]["id"]
                referral_code = data["tenant"].get("referral_code", "")
                log_test("Gmail-only: Valid Gmail accepted", True, 
                        f"Tenant ID: {tenant_id}, Referral Code: {referral_code}")
                return True, tenant_id, referral_code, email
            else:
                log_test("Gmail-only: Valid Gmail accepted", False, "No tenant in response")
                return False, None, None, None
        else:
            log_test("Gmail-only: Valid Gmail accepted", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False, None, None, None
    except Exception as e:
        log_test("Gmail-only: Valid Gmail accepted", False, f"Error: {str(e)}")
        return False, None, None, None

def test_deferred_referral_flow():
    """Test 3: Deferred referral bonus flow"""
    try:
        # Step 1: Create tenant A with valid Gmail
        timestamp_a = int(time.time())
        email_a = f"rahal.refa.{timestamp_a}@gmail.com"
        
        payload_a = {
            "name": f"Tenant A {timestamp_a}",
            "owner_name": "Owner A",
            "owner_email": email_a,
            "owner_password": "Pass@2025"
        }
        response_a = requests.post(f"{BASE_URL}/public/signup", json=payload_a, timeout=10)
        
        if response_a.status_code != 200:
            log_test("Deferred Referral: Signup A", False, f"Failed to create tenant A: {response_a.text}")
            return False
        
        data_a = response_a.json()
        tenant_a_id = data_a["tenant"]["id"]
        referral_code_a = data_a["tenant"].get("referral_code", "")
        
        if not referral_code_a:
            log_test("Deferred Referral: Signup A", False, "No referral code in response")
            return False
        
        log_test("Deferred Referral: Signup A", True, 
                f"Tenant A ID: {tenant_a_id}, Referral Code: {referral_code_a}")
        
        # Step 2: Create tenant B with referral code from A
        time.sleep(1)  # Ensure different timestamp
        timestamp_b = int(time.time())
        email_b = f"rahal.refb.{timestamp_b}@gmail.com"
        
        payload_b = {
            "name": f"Tenant B {timestamp_b}",
            "owner_name": "Owner B",
            "owner_email": email_b,
            "owner_password": "Pass@2025",
            "referral_code": referral_code_a
        }
        response_b = requests.post(f"{BASE_URL}/public/signup", json=payload_b, timeout=10)
        
        if response_b.status_code != 200:
            log_test("Deferred Referral: Signup B with referral", False, 
                    f"Failed to create tenant B: {response_b.text}")
            return False
        
        data_b = response_b.json()
        tenant_b_id = data_b["tenant"]["id"]
        referral_applied = data_b.get("referral_applied", False)
        
        if not referral_applied:
            log_test("Deferred Referral: Signup B with referral", False, 
                    "referral_applied not true in response")
            return False
        
        log_test("Deferred Referral: Signup B with referral", True, 
                f"Tenant B ID: {tenant_b_id}, referral_applied: {referral_applied}")
        
        # Step 3: Login as super admin
        login_payload = {
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        }
        login_response = requests.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=10)
        
        if login_response.status_code != 200:
            log_test("Deferred Referral: Super admin login", False, 
                    f"Failed to login: {login_response.text}")
            return False
        
        # Get session cookie
        session_cookie = login_response.cookies.get("rahaal_session")
        if not session_cookie:
            log_test("Deferred Referral: Super admin login", False, "No session cookie")
            return False
        
        log_test("Deferred Referral: Super admin login", True, "Session cookie obtained")
        
        # Step 4: Check tenant A BEFORE payment confirmation
        headers = {"Cookie": f"rahaal_session={session_cookie}"}
        tenants_response = requests.get(f"{BASE_URL}/admin/tenants", headers=headers, timeout=10)
        
        if tenants_response.status_code != 200:
            log_test("Deferred Referral: Check A before payment", False, 
                    f"Failed to get tenants: {tenants_response.text}")
            return False
        
        tenants_data = tenants_response.json()
        # Handle both list and dict responses
        if isinstance(tenants_data, dict):
            tenants = tenants_data.get("tenants", [])
        else:
            tenants = tenants_data
        
        tenant_a = next((t for t in tenants if t["id"] == tenant_a_id), None)
        
        if not tenant_a:
            log_test("Deferred Referral: Check A before payment", False, "Tenant A not found")
            return False
        
        # Verify BEFORE payment confirmation
        referral_stats = tenant_a.get("referral_stats", {})
        journal_quota = tenant_a.get("journal_quota", {})
        pending_referrals = referral_stats.get("pending_referrals", [])
        
        signups_before = referral_stats.get("signups", 0)
        activations_before = referral_stats.get("activations", 0)
        bonus_earned_before = referral_stats.get("bonus_earned", 0)
        quota_limit_before = journal_quota.get("limit", 0)
        
        # Check pending_referrals
        pending_entry = next((p for p in pending_referrals if p.get("referred_tenant") == tenant_b_id), None)
        
        checks_before = []
        checks_before.append(f"signups={signups_before} (expected ≥1)")
        checks_before.append(f"activations={activations_before} (expected 0)")
        checks_before.append(f"bonus_earned={bonus_earned_before} (expected 0)")
        checks_before.append(f"quota.limit={quota_limit_before} (expected 30)")
        checks_before.append(f"pending_referrals entry exists: {pending_entry is not None}")
        if pending_entry:
            checks_before.append(f"pending_referrals.paid={pending_entry.get('paid', None)} (expected false)")
        
        all_checks_pass = (
            signups_before >= 1 and
            activations_before == 0 and
            bonus_earned_before == 0 and
            quota_limit_before == 30 and
            pending_entry is not None and
            pending_entry.get("paid") == False
        )
        
        if all_checks_pass:
            log_test("Deferred Referral: Check A before payment", True, 
                    ", ".join(checks_before))
        else:
            log_test("Deferred Referral: Check A before payment", False, 
                    ", ".join(checks_before))
            return False
        
        # Step 5: Confirm payment for tenant B
        confirm_response = requests.post(
            f"{BASE_URL}/admin/tenants/{tenant_b_id}/confirm-payment",
            headers=headers,
            timeout=10
        )
        
        if confirm_response.status_code != 200:
            log_test("Deferred Referral: Confirm payment", False, 
                    f"Failed to confirm payment: {confirm_response.text}")
            return False
        
        confirm_data = confirm_response.json()
        referrer_bonus = confirm_data.get("referrer_bonus", {})
        bonus_added = referrer_bonus.get("bonus_added", 0)
        
        if bonus_added != 50:
            log_test("Deferred Referral: Confirm payment", False, 
                    f"Expected bonus_added=50, got {bonus_added}")
            return False
        
        log_test("Deferred Referral: Confirm payment", True, 
                f"bonus_added={bonus_added}")
        
        # Step 6: Check tenant A AFTER payment confirmation
        tenants_response_after = requests.get(f"{BASE_URL}/admin/tenants", headers=headers, timeout=10)
        
        if tenants_response_after.status_code != 200:
            log_test("Deferred Referral: Check A after payment", False, 
                    f"Failed to get tenants: {tenants_response_after.text}")
            return False
        
        tenants_data_after = tenants_response_after.json()
        # Handle both list and dict responses
        if isinstance(tenants_data_after, dict):
            tenants_after = tenants_data_after.get("tenants", [])
        else:
            tenants_after = tenants_data_after
        
        tenant_a_after = next((t for t in tenants_after if t["id"] == tenant_a_id), None)
        
        if not tenant_a_after:
            log_test("Deferred Referral: Check A after payment", False, "Tenant A not found")
            return False
        
        # Verify AFTER payment confirmation
        referral_stats_after = tenant_a_after.get("referral_stats", {})
        journal_quota_after = tenant_a_after.get("journal_quota", {})
        pending_referrals_after = referral_stats_after.get("pending_referrals", [])
        
        signups_after = referral_stats_after.get("signups", 0)
        activations_after = referral_stats_after.get("activations", 0)
        bonus_earned_after = referral_stats_after.get("bonus_earned", 0)
        quota_limit_after = journal_quota_after.get("limit", 0)
        
        # Check pending_referrals entry is now paid
        pending_entry_after = next((p for p in pending_referrals_after if p.get("referred_tenant") == tenant_b_id), None)
        
        checks_after = []
        checks_after.append(f"quota.limit={quota_limit_after} (expected 80)")
        checks_after.append(f"activations={activations_after} (expected 1)")
        checks_after.append(f"bonus_earned={bonus_earned_after} (expected 50)")
        if pending_entry_after:
            checks_after.append(f"pending_referrals.paid={pending_entry_after.get('paid', None)} (expected true)")
        else:
            checks_after.append("pending_referrals entry not found")
        
        # Check top_ups array
        top_ups = journal_quota_after.get("top_ups", [])
        referral_top_up = next((t for t in top_ups if t.get("by") == "referral_activation"), None)
        if referral_top_up:
            checks_after.append(f"top_ups entry with by='referral_activation' and amount={referral_top_up.get('amount', 0)}")
        else:
            checks_after.append("top_ups entry with by='referral_activation' NOT FOUND")
        
        all_checks_pass_after = (
            quota_limit_after == 80 and
            activations_after == 1 and
            bonus_earned_after == 50 and
            pending_entry_after is not None and
            pending_entry_after.get("paid") == True and
            referral_top_up is not None and
            referral_top_up.get("amount") == 50
        )
        
        if all_checks_pass_after:
            log_test("Deferred Referral: Check A after payment", True, 
                    ", ".join(checks_after))
            return True
        else:
            log_test("Deferred Referral: Check A after payment", False, 
                    ", ".join(checks_after))
            return False
        
    except Exception as e:
        log_test("Deferred Referral Flow", False, f"Error: {str(e)}")
        return False

def test_regression_v38_pats():
    """Test 4: Regression - v3.8 PATs still work"""
    try:
        # Login as demo owner
        login_payload = {
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }
        login_response = requests.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=10)
        
        if login_response.status_code != 200:
            log_test("Regression: v3.8 PATs", False, f"Failed to login: {login_response.text}")
            return False
        
        session_cookie = login_response.cookies.get("rahaal_session")
        headers = {"Cookie": f"rahaal_session={session_cookie}"}
        
        # Get existing PATs and delete one if at limit
        pats_response = requests.get(f"{BASE_URL}/pats", headers=headers, timeout=10)
        if pats_response.status_code == 200:
            existing_pats = pats_response.json()
            active_pats = [p for p in existing_pats if not p.get("revoked_at")]
            if len(active_pats) >= 5:
                # Delete the oldest active PAT
                oldest_pat = active_pats[0]
                requests.delete(f"{BASE_URL}/pats/{oldest_pat['id']}", headers=headers, timeout=10)
        
        # Create a PAT
        pat_payload = {"name": f"Test PAT v3.9 {int(time.time())}"}
        pat_response = requests.post(f"{BASE_URL}/pats", json=pat_payload, headers=headers, timeout=10)
        
        if pat_response.status_code != 200:
            log_test("Regression: v3.8 PATs", False, f"Failed to create PAT: {pat_response.text}")
            return False
        
        pat_data = pat_response.json()
        token = pat_data.get("token", "")
        
        if not token or not token.startswith("rhl_pat_"):
            log_test("Regression: v3.8 PATs", False, f"Invalid token format: {token}")
            return False
        
        # Test Bearer auth with scraper/ping
        bearer_headers = {"Authorization": f"Bearer {token}"}
        ping_response = requests.get(f"{BASE_URL}/scraper/ping", headers=bearer_headers, timeout=10)
        
        if ping_response.status_code == 200:
            ping_data = ping_response.json()
            if ping_data.get("ok") and ping_data.get("version") == "3.9":
                log_test("Regression: v3.8 PATs", True, 
                        f"PAT created and Bearer auth working, version={ping_data.get('version')}")
                return True
            else:
                log_test("Regression: v3.8 PATs", False, 
                        f"Unexpected ping response: {ping_data}")
                return False
        else:
            log_test("Regression: v3.8 PATs", False, 
                    f"Ping failed with status {ping_response.status_code}")
            return False
        
    except Exception as e:
        log_test("Regression: v3.8 PATs", False, f"Error: {str(e)}")
        return False

def test_regression_v37_packages():
    """Test 5: Regression - v3.7 packages/comparison still works"""
    try:
        # Login as demo owner
        login_payload = {
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }
        login_response = requests.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=10)
        
        if login_response.status_code != 200:
            log_test("Regression: v3.7 packages/comparison", False, 
                    f"Failed to login: {login_response.text}")
            return False
        
        session_cookie = login_response.cookies.get("rahaal_session")
        headers = {"Cookie": f"rahaal_session={session_cookie}"}
        
        # Test packages/comparison endpoint
        comparison_response = requests.get(f"{BASE_URL}/packages/comparison", 
                                          headers=headers, timeout=10)
        
        if comparison_response.status_code == 200:
            data = comparison_response.json()
            if "period" in data and "rows" in data and "totals" in data:
                log_test("Regression: v3.7 packages/comparison", True, 
                        f"Comparison endpoint working, found {len(data.get('rows', []))} packages")
                return True
            else:
                log_test("Regression: v3.7 packages/comparison", False, 
                        f"Missing expected fields in response")
                return False
        else:
            log_test("Regression: v3.7 packages/comparison", False, 
                    f"Expected 200, got {comparison_response.status_code}")
            return False
        
    except Exception as e:
        log_test("Regression: v3.7 packages/comparison", False, f"Error: {str(e)}")
        return False

def test_regression_v36_packages():
    """Test 6: Regression - v3.6 packages still work"""
    try:
        # Login as demo owner
        login_payload = {
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }
        login_response = requests.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=10)
        
        if login_response.status_code != 200:
            log_test("Regression: v3.6 packages", False, f"Failed to login: {login_response.text}")
            return False
        
        session_cookie = login_response.cookies.get("rahaal_session")
        headers = {"Cookie": f"rahaal_session={session_cookie}"}
        
        # Test packages endpoint
        packages_response = requests.get(f"{BASE_URL}/packages", headers=headers, timeout=10)
        
        if packages_response.status_code == 200:
            packages = packages_response.json()
            if isinstance(packages, list):
                log_test("Regression: v3.6 packages", True, 
                        f"Packages endpoint working, found {len(packages)} packages")
                return True
            else:
                log_test("Regression: v3.6 packages", False, "Response is not a list")
                return False
        else:
            log_test("Regression: v3.6 packages", False, 
                    f"Expected 200, got {packages_response.status_code}")
            return False
        
    except Exception as e:
        log_test("Regression: v3.6 packages", False, f"Error: {str(e)}")
        return False

def test_regression_v35_refunds():
    """Test 7: Regression - v3.5 refunds still work"""
    try:
        # Login as demo owner
        login_payload = {
            "email": "owner@demo.com",
            "password": "Demo@2025"
        }
        login_response = requests.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=10)
        
        if login_response.status_code != 200:
            log_test("Regression: v3.5 refunds", False, f"Failed to login: {login_response.text}")
            return False
        
        session_cookie = login_response.cookies.get("rahaal_session")
        headers = {"Cookie": f"rahaal_session={session_cookie}"}
        
        # Test refunds endpoint
        refunds_response = requests.get(f"{BASE_URL}/refunds", headers=headers, timeout=10)
        
        if refunds_response.status_code == 200:
            refunds = refunds_response.json()
            if isinstance(refunds, list):
                log_test("Regression: v3.5 refunds", True, 
                        f"Refunds endpoint working, found {len(refunds)} refunds")
                return True
            else:
                log_test("Regression: v3.5 refunds", False, "Response is not a list")
                return False
        else:
            log_test("Regression: v3.5 refunds", False, 
                    f"Expected 200, got {refunds_response.status_code}")
            return False
        
    except Exception as e:
        log_test("Regression: v3.5 refunds", False, f"Error: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("v3.9 BACKEND TESTING - Rahaal ERP")
    print("Gmail-only Signup + Deferred Referral Bonus")
    print("="*60 + "\n")
    
    # Test 1: Health version
    print("\n--- Test 1: Health Version Check ---")
    test_health_version()
    
    # Test 2: Gmail-only signup enforcement
    print("\n--- Test 2: Gmail-only Signup Enforcement ---")
    test_gmail_only_yahoo()
    test_gmail_only_hotmail()
    test_gmail_alias_rejected()
    test_valid_gmail_signup()
    
    # Test 3: Deferred referral bonus flow
    print("\n--- Test 3: Deferred Referral Bonus Flow ---")
    test_deferred_referral_flow()
    
    # Test 4-7: Regression tests
    print("\n--- Test 4-7: Regression Tests ---")
    test_regression_v38_pats()
    test_regression_v37_packages()
    test_regression_v36_packages()
    test_regression_v35_refunds()
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
