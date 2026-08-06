#!/usr/bin/env python3
"""
Rahaal ERP v3.9.18 Backend Test Suite
Tests:
1. POST /api/public/signup - Mandatory phone field validation
2. GET /api/affiliate - Referral link with official domain
3. Regression checks
"""

import requests
import json
import os
from datetime import datetime

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://visa-booking-5.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials
SUPER_ADMIN = {"email": "admin@targetmedia.com", "password": "Target@2025"}
DEMO_OWNER = {"email": "owner@demo.com", "password": "Demo@2025"}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_signup_phone_validation():
    """Test POST /api/public/signup with phone validation"""
    log("\n========== TEST 1: POST /api/public/signup - Phone Validation ==========")
    
    results = []
    
    # Test 1.1: Missing phone
    log("\n[1.1] Missing phone field...")
    try:
        resp = requests.post(f"{API_BASE}/public/signup", json={
            "name": "مكتب تجريبي",
            "owner_name": "احمد",
            "owner_email": "test-phone1@gmail.com",
            "owner_password": "Pass1234"
        }, timeout=10)
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:200]}")
        
        if resp.status_code == 400:
            data = resp.json()
            if "رقم الهاتف" in data.get("error", "") and "مطلوب" in data.get("error", ""):
                log("✅ PASS - Missing phone correctly rejected with Arabic error")
                results.append(("Missing phone", True, resp.status_code, data.get("error")))
            else:
                log(f"❌ FAIL - Wrong error message: {data.get('error')}")
                results.append(("Missing phone", False, resp.status_code, data.get("error")))
        else:
            log(f"❌ FAIL - Expected 400, got {resp.status_code}")
            results.append(("Missing phone", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Missing phone", False, 0, str(e)))
    
    # Test 1.2: Invalid phone (letters)
    log("\n[1.2] Invalid phone with letters...")
    try:
        resp = requests.post(f"{API_BASE}/public/signup", json={
            "name": "مكتب تجريبي",
            "owner_name": "احمد",
            "owner_email": "test-phone2@gmail.com",
            "owner_password": "Pass1234",
            "owner_phone": "abc123"
        }, timeout=10)
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:200]}")
        
        if resp.status_code == 400:
            data = resp.json()
            if "غير صالح" in data.get("error", ""):
                log("✅ PASS - Invalid phone correctly rejected")
                results.append(("Invalid phone (letters)", True, resp.status_code, data.get("error")))
            else:
                log(f"❌ FAIL - Wrong error message: {data.get('error')}")
                results.append(("Invalid phone (letters)", False, resp.status_code, data.get("error")))
        else:
            log(f"❌ FAIL - Expected 400, got {resp.status_code}")
            results.append(("Invalid phone (letters)", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Invalid phone (letters)", False, 0, str(e)))
    
    # Test 1.3: Too short phone
    log("\n[1.3] Too short phone (< 7 digits)...")
    try:
        resp = requests.post(f"{API_BASE}/public/signup", json={
            "name": "مكتب تجريبي",
            "owner_name": "احمد",
            "owner_email": "test-phone3@gmail.com",
            "owner_password": "Pass1234",
            "owner_phone": "12345"
        }, timeout=10)
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:200]}")
        
        if resp.status_code == 400:
            data = resp.json()
            log("✅ PASS - Too short phone correctly rejected")
            results.append(("Too short phone", True, resp.status_code, data.get("error")))
        else:
            log(f"❌ FAIL - Expected 400, got {resp.status_code}")
            results.append(("Too short phone", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Too short phone", False, 0, str(e)))
    
    # Test 1.4: Too long phone
    log("\n[1.4] Too long phone (> 15 digits)...")
    try:
        resp = requests.post(f"{API_BASE}/public/signup", json={
            "name": "مكتب تجريبي",
            "owner_name": "احمد",
            "owner_email": "test-phone4@gmail.com",
            "owner_password": "Pass1234",
            "owner_phone": "1234567890123456"
        }, timeout=10)
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:200]}")
        
        if resp.status_code == 400:
            data = resp.json()
            log("✅ PASS - Too long phone correctly rejected")
            results.append(("Too long phone", True, resp.status_code, data.get("error")))
        else:
            log(f"❌ FAIL - Expected 400, got {resp.status_code}")
            results.append(("Too long phone", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Too long phone", False, 0, str(e)))
    
    # Test 1.5: Valid international phone with +
    log("\n[1.5] Valid international phone with +...")
    try:
        resp = requests.post(f"{API_BASE}/public/signup", json={
            "name": "مكتب تجريبي",
            "owner_name": "احمد",
            "owner_email": "phonesignup1@gmail.com",
            "owner_password": "Pass1234",
            "owner_phone": "+967771234567"
        }, timeout=10)
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("tenant"):
                log("✅ PASS - Valid phone with + accepted, tenant created")
                results.append(("Valid phone with +", True, resp.status_code, "Tenant created"))
                # Store tenant ID for cleanup
                tenant_id = data["tenant"].get("id")
                log(f"Created tenant ID: {tenant_id}")
            else:
                log(f"❌ FAIL - No tenant in response")
                results.append(("Valid phone with +", False, resp.status_code, "No tenant"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("Valid phone with +", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Valid phone with +", False, 0, str(e)))
    
    # Test 1.6: Valid phone without +
    log("\n[1.6] Valid phone without +...")
    try:
        resp = requests.post(f"{API_BASE}/public/signup", json={
            "name": "مكتب تجريبي 2",
            "owner_name": "محمد",
            "owner_email": "phonesignup2@gmail.com",
            "owner_password": "Pass1234",
            "owner_phone": "967771234568"
        }, timeout=10)
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("tenant"):
                log("✅ PASS - Valid phone without + accepted, tenant created")
                results.append(("Valid phone without +", True, resp.status_code, "Tenant created"))
            else:
                log(f"❌ FAIL - No tenant in response")
                results.append(("Valid phone without +", False, resp.status_code, "No tenant"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("Valid phone without +", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Valid phone without +", False, 0, str(e)))
    
    # Test 1.7: Phone with spaces/dashes (should be normalized)
    log("\n[1.7] Phone with spaces/dashes (normalization test)...")
    try:
        resp = requests.post(f"{API_BASE}/public/signup", json={
            "name": "مكتب تجريبي 3",
            "owner_name": "علي",
            "owner_email": "phonesignup3@gmail.com",
            "owner_password": "Pass1234",
            "owner_phone": "+967 77-123 4569"
        }, timeout=10)
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("tenant"):
                log("✅ PASS - Phone with spaces/dashes accepted (should be normalized to +967771234569)")
                results.append(("Phone normalization", True, resp.status_code, "Tenant created"))
            else:
                log(f"❌ FAIL - No tenant in response")
                results.append(("Phone normalization", False, resp.status_code, "No tenant"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("Phone normalization", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Phone normalization", False, 0, str(e)))
    
    return results

def test_affiliate_link():
    """Test GET /api/affiliate - Referral link must use official domain"""
    log("\n========== TEST 2: GET /api/affiliate - Official Domain ==========")
    
    results = []
    
    # Login as demo owner
    log("\n[2.1] Login as owner@demo.com...")
    try:
        resp = requests.post(f"{API_BASE}/auth/login", json=DEMO_OWNER, timeout=10)
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL - Login failed: {resp.text[:200]}")
            results.append(("Login demo owner", False, resp.status_code, resp.text[:100]))
            return results
        
        cookies = resp.cookies
        log("✅ Login successful")
        
        # Get affiliate link
        log("\n[2.2] GET /api/affiliate...")
        resp = requests.get(f"{API_BASE}/affiliate", cookies=cookies, timeout=10)
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            link = data.get("link", "")
            log(f"Affiliate link: {link}")
            
            # Check if link starts with official domain
            if link.startswith("https://rahaal.targetmediagrp.com/signup?ref="):
                log("✅ PASS - Affiliate link uses official domain")
                results.append(("Affiliate link domain", True, resp.status_code, link))
            else:
                log(f"❌ FAIL - Affiliate link does NOT use official domain: {link}")
                results.append(("Affiliate link domain", False, resp.status_code, link))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("Affiliate link domain", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Affiliate link domain", False, 0, str(e)))
    
    return results

def test_regression():
    """Test regression checks"""
    log("\n========== TEST 3: Regression Checks ==========")
    
    results = []
    
    # Test 3.1: Health endpoint version
    log("\n[3.1] GET /api/health - Version check...")
    try:
        resp = requests.get(f"{API_BASE}/health", timeout=10)
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:300]}")
        
        if resp.status_code == 200:
            data = resp.json()
            version = data.get("version", "")
            if version == "3.9.18":
                log("✅ PASS - Version is 3.9.18")
                results.append(("Health version", True, resp.status_code, version))
            else:
                log(f"❌ FAIL - Expected version 3.9.18, got {version}")
                results.append(("Health version", False, resp.status_code, version))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("Health version", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Health version", False, 0, str(e)))
    
    # Test 3.2: Existing tenant can still login
    log("\n[3.2] Existing tenant login (owner@demo.com)...")
    try:
        resp = requests.post(f"{API_BASE}/auth/login", json=DEMO_OWNER, timeout=10)
        log(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("user") and data.get("tenant"):
                log("✅ PASS - Existing tenant can login normally")
                results.append(("Existing tenant login", True, resp.status_code, "Login successful"))
                cookies = resp.cookies
                
                # Test 3.3: Topup endpoint (v3.9.17) still works
                log("\n[3.3] POST /api/admin/tenants/{id}/topup sanity check...")
                # First login as super admin
                resp_admin = requests.post(f"{API_BASE}/auth/login", json=SUPER_ADMIN, timeout=10)
                if resp_admin.status_code == 200:
                    admin_cookies = resp_admin.cookies
                    tenant_id = data["tenant"]["id"]
                    
                    resp_topup = requests.post(
                        f"{API_BASE}/admin/tenants/{tenant_id}/topup",
                        json={"amount": 10, "note": "Test topup v3.9.18"},
                        cookies=admin_cookies,
                        timeout=10
                    )
                    log(f"Topup status: {resp_topup.status_code}")
                    
                    if resp_topup.status_code == 200:
                        log("✅ PASS - Topup endpoint still works")
                        results.append(("Topup endpoint", True, resp_topup.status_code, "Working"))
                    else:
                        log(f"❌ FAIL - Topup failed: {resp_topup.text[:200]}")
                        results.append(("Topup endpoint", False, resp_topup.status_code, resp_topup.text[:100]))
                    
                    # Test 3.4: Reset password endpoint (v3.9.17) still works
                    log("\n[3.4] POST /api/admin/tenants/{id}/reset-password sanity check...")
                    resp_reset = requests.post(
                        f"{API_BASE}/admin/tenants/{tenant_id}/reset-password",
                        json={"new_password": "Demo@2025"},
                        cookies=admin_cookies,
                        timeout=10
                    )
                    log(f"Reset password status: {resp_reset.status_code}")
                    
                    if resp_reset.status_code == 200:
                        log("✅ PASS - Reset password endpoint still works (password reset to Demo@2025)")
                        results.append(("Reset password endpoint", True, resp_reset.status_code, "Working"))
                    else:
                        log(f"❌ FAIL - Reset password failed: {resp_reset.text[:200]}")
                        results.append(("Reset password endpoint", False, resp_reset.status_code, resp_reset.text[:100]))
                else:
                    log(f"⚠️ SKIP - Could not login as super admin")
                    results.append(("Topup endpoint", False, 0, "Admin login failed"))
                    results.append(("Reset password endpoint", False, 0, "Admin login failed"))
            else:
                log(f"❌ FAIL - Login response missing user or tenant")
                results.append(("Existing tenant login", False, resp.status_code, "Missing data"))
        else:
            log(f"❌ FAIL - Expected 200, got {resp.status_code}")
            results.append(("Existing tenant login", False, resp.status_code, resp.text[:100]))
    except Exception as e:
        log(f"❌ ERROR: {e}")
        results.append(("Existing tenant login", False, 0, str(e)))
    
    return results

def main():
    log("=" * 80)
    log("Rahaal ERP v3.9.18 Backend Test Suite")
    log("=" * 80)
    
    all_results = []
    
    # Run all tests
    all_results.extend(test_signup_phone_validation())
    all_results.extend(test_affiliate_link())
    all_results.extend(test_regression())
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for r in all_results if r[1])
    failed = sum(1 for r in all_results if not r[1])
    
    log(f"\nTotal Tests: {len(all_results)}")
    log(f"✅ Passed: {passed}")
    log(f"❌ Failed: {failed}")
    
    log("\nDetailed Results:")
    for test_name, passed, status, detail in all_results:
        status_icon = "✅" if passed else "❌"
        log(f"{status_icon} {test_name}: HTTP {status} - {detail}")
    
    log("\n" + "=" * 80)
    
    if failed == 0:
        log("🎉 ALL TESTS PASSED!")
        return 0
    else:
        log(f"⚠️ {failed} TEST(S) FAILED")
        return 1

if __name__ == "__main__":
    exit(main())
