#!/usr/bin/env python3
"""
Verify phone storage by checking specific tenant details
"""

import requests
import os

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://visa-booking-5.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

def verify_phone_in_signup():
    print("\n========== Verifying Phone Storage via Direct Signup Check ==========\n")
    
    # Create a new signup with known phone to verify storage
    print("[1] Creating new signup with phone +967771111111...")
    
    test_email = f"phonetest{os.urandom(4).hex()}@gmail.com"
    
    resp = requests.post(f"{API_BASE}/public/signup", json={
        "name": "مكتب اختبار الهاتف",
        "owner_name": "اختبار",
        "owner_email": test_email,
        "owner_password": "Test1234",
        "owner_phone": "+967 77-111 1111"  # With spaces and dashes
    }, timeout=10)
    
    print(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAIL - Signup failed: {resp.text[:200]}")
        return
    
    data = resp.json()
    tenant = data.get("tenant", {})
    tenant_id = tenant.get("id")
    
    print(f"✅ Signup successful")
    print(f"Tenant ID: {tenant_id}")
    print(f"Tenant Name: {tenant.get('name')}")
    print()
    
    # Now login with this account to check if phone is accessible
    print("[2] Login with new account to verify session...")
    resp = requests.post(f"{API_BASE}/auth/login", json={
        "email": test_email,
        "password": "Test1234"
    }, timeout=10)
    
    if resp.status_code != 200:
        print(f"❌ FAIL - Login failed: {resp.text[:200]}")
        return
    
    cookies = resp.cookies
    login_data = resp.json()
    user = login_data.get("user", {})
    
    print(f"✅ Login successful")
    print(f"User ID: {user.get('id')}")
    print(f"User Email: {user.get('email')}")
    print(f"User Phone: {user.get('phone', 'NOT PRESENT')}")
    print()
    
    # Check if phone is normalized
    phone = user.get('phone', '')
    if phone:
        print("[3] Phone normalization check:")
        print(f"  Input: '+967 77-111 1111' (with spaces and dashes)")
        print(f"  Stored: '{phone}'")
        
        if ' ' in phone or '-' in phone:
            print(f"  ❌ FAIL - Phone NOT normalized (contains spaces/dashes)")
        else:
            print(f"  ✅ PASS - Phone is normalized (no spaces/dashes)")
        
        # Expected: +967771111111 or 967771111111
        expected = "+967771111111"
        if phone == expected or phone == expected[1:]:
            print(f"  ✅ PASS - Phone matches expected value")
        else:
            print(f"  ⚠️  WARNING - Phone '{phone}' doesn't match expected '{expected}'")
    else:
        print("  ❌ FAIL - Phone field not present in user object")
    
    print()
    
    # Now check via super admin to see tenant.owner_phone
    print("[4] Verify tenant.owner_phone via super admin...")
    resp = requests.post(f"{API_BASE}/auth/login", json={
        "email": "admin@targetmedia.com",
        "password": "<SUPER_ADMIN_PASSWORD-see-memory/test_credentials.md>"
    }, timeout=10)
    
    if resp.status_code != 200:
        print(f"❌ FAIL - Admin login failed")
        return
    
    admin_cookies = resp.cookies
    
    # Get all tenants and find ours
    resp = requests.get(f"{API_BASE}/admin/tenants", cookies=admin_cookies, timeout=10)
    if resp.status_code != 200:
        print(f"❌ FAIL - Could not get tenants")
        return
    
    tenants = resp.json()
    if isinstance(tenants, list):
        for t in tenants:
            if t.get("id") == tenant_id:
                print(f"✅ Found tenant in admin list")
                print(f"  Tenant owner_phone: {t.get('owner_phone', 'NOT PRESENT')}")
                
                owner_phone = t.get('owner_phone', '')
                if owner_phone:
                    if ' ' in owner_phone or '-' in owner_phone:
                        print(f"  ❌ FAIL - Tenant owner_phone NOT normalized")
                    else:
                        print(f"  ✅ PASS - Tenant owner_phone is normalized")
                else:
                    print(f"  ❌ FAIL - owner_phone field not present in tenant")
                break
    
    print()

if __name__ == "__main__":
    verify_phone_in_signup()
