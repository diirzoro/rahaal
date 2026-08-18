#!/usr/bin/env python3
"""
v3.4 Backend Testing Suite for Rahaal ERP
Tests: Employee Permissions (18 flags), Affiliate Module (balance, payout methods, cashout), Individual vs Office minimums
"""

import requests
import json
from datetime import datetime, timedelta
import sys

# Base URL from .env
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Test credentials
OWNER_EMAIL = "owner@demo.com"
OWNER_PASSWORD = "<DEMO_PASSWORD-see-memory/test_credentials.md>"

# Session for cookies
session = requests.Session()

def log(msg):
    print(f"[TEST] {msg}")

def log_pass(msg):
    print(f"✅ PASS: {msg}")

def log_fail(msg):
    print(f"❌ FAIL: {msg}")

def login(email, password):
    """Login and store session cookie"""
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=10)
        if resp.status_code == 200:
            log_pass(f"Login successful: {email}")
            return True
        else:
            log_fail(f"Login failed: {email} - {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        log_fail(f"Login exception: {e}")
        return False

# ============================================================
# v3.4.1 — EMPLOYEE PERMISSIONS
# ============================================================

def test_health_version_34():
    """Test 1: GET /health should return version:3.4"""
    log("Testing GET /health for version 3.4...")
    try:
        resp = session.get(f"{BASE_URL}/health", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("version") == "3.4":
                log_pass("Health check returns version 3.4")
                return True
            else:
                log_fail(f"Health check version mismatch: expected 3.4, got {data.get('version')}")
                return False
        else:
            log_fail(f"Health check failed: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"Health check exception: {e}")
        return False

def test_auth_me_permissions():
    """Test 2: GET /auth/me should return user.permissions object with 18 keys, all true for owner"""
    log("Testing GET /auth/me for permissions object...")
    try:
        resp = session.get(f"{BASE_URL}/auth/me", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            user = data.get("user")
            if not user:
                log_fail("No user object in /auth/me response")
                return False
            
            permissions = user.get("permissions")
            if not permissions:
                log_fail("No permissions object in user")
                return False
            
            # Check for 18 permission keys
            expected_keys = [
                "tickets_view", "tickets_add", "tickets_edit", "tickets_delete",
                "visas_view", "visas_add", "visas_edit", "visas_delete",
                "services_view", "services_add", "services_edit", "services_delete",
                "reports_view", "show_profit",
                "vouchers_manage", "accounts_manage",
                "edit_price", "apply_discount"
            ]
            
            if len(permissions) != 18:
                log_fail(f"Expected 18 permission keys, got {len(permissions)}")
                return False
            
            # Check all keys present
            for key in expected_keys:
                if key not in permissions:
                    log_fail(f"Missing permission key: {key}")
                    return False
            
            # For owner, all should be true
            if user.get("role") == "owner":
                all_true = all(permissions[key] == True for key in expected_keys)
                if all_true:
                    log_pass("Owner has all 18 permissions set to true")
                    return True
                else:
                    log_fail("Owner permissions not all true")
                    return False
            else:
                log_pass("Permissions object has 18 keys")
                return True
        else:
            log_fail(f"GET /auth/me failed: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_auth_me_permissions exception: {e}")
        return False

def test_tenant_users_permissions():
    """Test 3: GET /tenant/users should return each user with permissions object"""
    log("Testing GET /tenant/users for permissions in each user...")
    try:
        resp = session.get(f"{BASE_URL}/tenant/users", timeout=10)
        if resp.status_code == 200:
            users = resp.json()
            if len(users) == 0:
                log_fail("No users returned from /tenant/users")
                return False
            
            # Check each user has permissions
            for user in users:
                if "permissions" not in user:
                    log_fail(f"User {user.get('email')} missing permissions object")
                    return False
                
                # Owner should have all true
                if user.get("role") == "owner":
                    permissions = user.get("permissions")
                    if not all(permissions.values()):
                        log_fail(f"Owner user {user.get('email')} does not have all permissions true")
                        return False
            
            log_pass(f"All {len(users)} users have permissions object. Owner shows all-true.")
            return True
        else:
            log_fail(f"GET /tenant/users failed: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_tenant_users_permissions exception: {e}")
        return False

def test_patch_user_permissions():
    """Test 4: PATCH /tenant/users/:id with permissions object (sanitization test)"""
    log("Testing PATCH /tenant/users/:id with permissions...")
    try:
        # Get list of users to find a non-owner user
        resp = session.get(f"{BASE_URL}/tenant/users", timeout=10)
        if resp.status_code != 200:
            log_fail(f"Failed to get users: {resp.status_code}")
            return False
        
        users = resp.json()
        non_owner_user = None
        for user in users:
            if user.get("role") != "owner":
                non_owner_user = user
                break
        
        if not non_owner_user:
            log("No non-owner user found. Skipping PATCH test (demo tenant on standard plan blocks user creation).")
            return True
        
        user_id = non_owner_user["id"]
        
        # PATCH with permissions including invalid key
        patch_payload = {
            "permissions": {
                "tickets_view": True,
                "tickets_add": False,
                "invalid_key": True  # Should be ignored
            }
        }
        
        resp = session.patch(f"{BASE_URL}/tenant/users/{user_id}", json=patch_payload, timeout=10)
        if resp.status_code == 200:
            # Verify permissions were saved correctly
            resp = session.get(f"{BASE_URL}/tenant/users", timeout=10)
            if resp.status_code == 200:
                users = resp.json()
                for user in users:
                    if user["id"] == user_id:
                        permissions = user.get("permissions")
                        if "invalid_key" in permissions:
                            log_fail("Invalid key 'invalid_key' was not filtered out")
                            return False
                        if permissions.get("tickets_view") == True and permissions.get("tickets_add") == False:
                            log_pass("PATCH /tenant/users/:id updated permissions correctly, invalid keys filtered")
                            return True
                        else:
                            log_fail(f"Permissions not updated correctly: tickets_view={permissions.get('tickets_view')}, tickets_add={permissions.get('tickets_add')}")
                            return False
                log_fail("User not found after PATCH")
                return False
            else:
                log_fail(f"Failed to verify PATCH: {resp.status_code}")
                return False
        else:
            log_fail(f"PATCH /tenant/users/:id failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        log_fail(f"test_patch_user_permissions exception: {e}")
        return False

def test_delete_owner_blocked():
    """Test 5: DELETE /tenant/users/OWNER_ID should return 400 with Arabic error"""
    log("Testing DELETE /tenant/users/OWNER_ID (should be blocked)...")
    try:
        # Get owner user ID
        resp = session.get(f"{BASE_URL}/tenant/users", timeout=10)
        if resp.status_code != 200:
            log_fail(f"Failed to get users: {resp.status_code}")
            return False
        
        users = resp.json()
        owner_id = None
        for user in users:
            if user.get("role") == "owner":
                owner_id = user["id"]
                break
        
        if not owner_id:
            log_fail("Owner user not found")
            return False
        
        # Try to delete owner
        resp = session.delete(f"{BASE_URL}/tenant/users/{owner_id}", timeout=10)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "لا يمكن حذف حساب المالك" in error_msg:
                log_pass("DELETE owner correctly blocked with Arabic error message")
                return True
            else:
                log_fail(f"Error message incorrect: {error_msg}")
                return False
        else:
            log_fail(f"DELETE owner should return 400, got {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_delete_owner_blocked exception: {e}")
        return False

# ============================================================
# v3.4.2 — AFFILIATE MODULE
# ============================================================

def test_affiliate_get_initial():
    """Test 6: GET /affiliate should return complete structure"""
    log("Testing GET /affiliate for structure and fields...")
    try:
        resp = session.get(f"{BASE_URL}/affiliate", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            
            # Check required fields
            required_fields = [
                "code", "link", "balance_usd", "total_earned_usd", "commission_rate",
                "min_cashout_usd", "is_individual", "referred_offices", "activated_offices",
                "pending_offices", "withdrawals", "payout_methods", "banners"
            ]
            
            for field in required_fields:
                if field not in data:
                    log_fail(f"Missing field in /affiliate response: {field}")
                    return False
            
            # Check specific values (not balance which may have accumulated)
            if data.get("commission_rate") != 0.1:
                log_fail(f"Expected commission_rate=0.1, got {data.get('commission_rate')}")
                return False
            
            if data.get("min_cashout_usd") != 50:  # Default office mode
                log_fail(f"Expected min_cashout_usd=50 (office), got {data.get('min_cashout_usd')}")
                return False
            
            if data.get("is_individual") != False:
                log_fail(f"Expected is_individual=false, got {data.get('is_individual')}")
                return False
            
            if not isinstance(data.get("banners"), list) or len(data.get("banners")) != 2:
                log_fail(f"Expected banners array with 2 items, got {len(data.get('banners', []))}")
                return False
            
            log_pass(f"GET /affiliate returns complete structure (balance=${data.get('balance_usd')}, total_earned=${data.get('total_earned_usd')})")
            return True, data.get("balance_usd", 0)
        else:
            log_fail(f"GET /affiliate failed: {resp.status_code}")
            return False, 0
    except Exception as e:
        log_fail(f"test_affiliate_get_initial exception: {e}")
        return False, 0

def test_affiliate_seed_balance(initial_balance):
    """Test 7: POST /affiliate/dev-seed-balance to credit $200"""
    log("Testing POST /affiliate/dev-seed-balance with $200...")
    try:
        payload = {
            "amount_usd": 200,
            "is_individual": False
        }
        resp = session.post(f"{BASE_URL}/affiliate/dev-seed-balance", json=payload, timeout=10)
        if resp.status_code == 200:
            # Verify balance increased by 200
            resp = session.get(f"{BASE_URL}/affiliate", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                expected_balance = initial_balance + 200
                if data.get("balance_usd") == expected_balance:
                    log_pass(f"Seeded $200 to affiliate balance successfully (${initial_balance} → ${expected_balance})")
                    return True, expected_balance
                else:
                    log_fail(f"Balance not updated correctly: expected {expected_balance}, got {data.get('balance_usd')}")
                    return False, data.get("balance_usd", 0)
            else:
                log_fail(f"Failed to verify balance: {resp.status_code}")
                return False, initial_balance
        else:
            log_fail(f"POST /affiliate/dev-seed-balance failed: {resp.status_code} {resp.text}")
            return False, initial_balance
    except Exception as e:
        log_fail(f"test_affiliate_seed_balance exception: {e}")
        return False, initial_balance

def test_affiliate_payout_method_validation():
    """Test 8: POST /affiliate/payout-methods with invalid data (validation tests)"""
    log("Testing POST /affiliate/payout-methods validation...")
    try:
        # Test 1: Invalid method_type (usdt not allowed)
        payload = {
            "method_type": "usdt",
            "account_name": "test"
        }
        resp = session.post(f"{BASE_URL}/affiliate/payout-methods", json=payload, timeout=10)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "نوع طريقة السحب غير صالح" in error_msg:
                log_pass("Invalid method_type correctly rejected")
            else:
                log_fail(f"Invalid method_type error message incorrect: {error_msg}")
                return False
        else:
            log_fail(f"Invalid method_type should return 400, got {resp.status_code}")
            return False
        
        # Test 2: Missing account_name
        payload = {
            "method_type": "wallet"
        }
        resp = session.post(f"{BASE_URL}/affiliate/payout-methods", json=payload, timeout=10)
        if resp.status_code == 400:
            log_pass("Missing account_name correctly rejected")
        else:
            log_fail(f"Missing account_name should return 400, got {resp.status_code}")
            return False
        
        return True
    except Exception as e:
        log_fail(f"test_affiliate_payout_method_validation exception: {e}")
        return False

def test_affiliate_payout_method_create_wallet():
    """Test 9: POST /affiliate/payout-methods with valid wallet data"""
    log("Testing POST /affiliate/payout-methods with valid wallet...")
    try:
        payload = {
            "method_type": "wallet",
            "provider": "كريمي",
            "account_name": "أحمد الاختبار",
            "phone": "777123456",
            "is_default": True
        }
        resp = session.post(f"{BASE_URL}/affiliate/payout-methods", json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "id" in data:
                log_pass("Created wallet payout method successfully")
                return True, data["id"]
            else:
                log_fail("No id in response")
                return False, None
        else:
            log_fail(f"POST /affiliate/payout-methods failed: {resp.status_code} {resp.text}")
            return False, None
    except Exception as e:
        log_fail(f"test_affiliate_payout_method_create_wallet exception: {e}")
        return False, None

def test_affiliate_payout_method_create_bank():
    """Test 10: POST /affiliate/payout-methods with bank type"""
    log("Testing POST /affiliate/payout-methods with bank...")
    try:
        payload = {
            "method_type": "bank",
            "provider": "البنك اليمني للإنشاء",
            "account_name": "مكتب رحال",
            "account_number": "YE-IBAN-123",
            "is_default": False
        }
        resp = session.post(f"{BASE_URL}/affiliate/payout-methods", json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "id" in data:
                log_pass("Created bank payout method successfully")
                return True, data["id"]
            else:
                log_fail("No id in response")
                return False, None
        else:
            log_fail(f"POST /affiliate/payout-methods failed: {resp.status_code} {resp.text}")
            return False, None
    except Exception as e:
        log_fail(f"test_affiliate_payout_method_create_bank exception: {e}")
        return False, None

def test_affiliate_payout_methods_get():
    """Test 11: GET /affiliate/payout-methods should list 2 methods"""
    log("Testing GET /affiliate/payout-methods...")
    try:
        resp = session.get(f"{BASE_URL}/affiliate/payout-methods", timeout=10)
        if resp.status_code == 200:
            methods = resp.json()
            if len(methods) >= 2:
                # Check wallet is default
                wallet_default = False
                bank_not_default = False
                for method in methods:
                    if method.get("method_type") == "wallet" and method.get("is_default") == True:
                        wallet_default = True
                    if method.get("method_type") == "bank" and method.get("is_default") == False:
                        bank_not_default = True
                
                if wallet_default and bank_not_default:
                    log_pass("GET /affiliate/payout-methods lists 2+ methods with correct default flags")
                    return True
                else:
                    log_fail(f"Default flags incorrect: wallet_default={wallet_default}, bank_not_default={bank_not_default}")
                    return False
            else:
                log_fail(f"Expected at least 2 payout methods, got {len(methods)}")
                return False
        else:
            log_fail(f"GET /affiliate/payout-methods failed: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_affiliate_payout_methods_get exception: {e}")
        return False

def test_affiliate_payout_method_set_default(bank_id):
    """Test 12: PUT /affiliate/payout-methods/:id to set bank as default"""
    log("Testing PUT /affiliate/payout-methods/:id to set bank as default...")
    try:
        payload = {
            "is_default": True
        }
        resp = session.put(f"{BASE_URL}/affiliate/payout-methods/{bank_id}", json=payload, timeout=10)
        if resp.status_code == 200:
            # Verify only bank is default now
            resp = session.get(f"{BASE_URL}/affiliate/payout-methods", timeout=10)
            if resp.status_code == 200:
                methods = resp.json()
                bank_default = False
                wallet_not_default = False
                for method in methods:
                    if method.get("method_type") == "bank" and method.get("is_default") == True:
                        bank_default = True
                    if method.get("method_type") == "wallet" and method.get("is_default") == False:
                        wallet_not_default = True
                
                if bank_default and wallet_not_default:
                    log_pass("PUT /affiliate/payout-methods/:id set bank as default, wallet no longer default")
                    return True
                else:
                    log_fail(f"Default flags after PUT incorrect: bank_default={bank_default}, wallet_not_default={wallet_not_default}")
                    return False
            else:
                log_fail(f"Failed to verify PUT: {resp.status_code}")
                return False
        else:
            log_fail(f"PUT /affiliate/payout-methods/:id failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        log_fail(f"test_affiliate_payout_method_set_default exception: {e}")
        return False

def test_affiliate_cashout_validation(payout_method_id, current_balance):
    """Test 13: POST /affiliate/cashout validation (below min, above balance, missing method)"""
    log("Testing POST /affiliate/cashout validation...")
    try:
        # Test 1: Amount below minimum ($50 for office)
        payload = {
            "amount_usd": 30,
            "payout_method_id": payout_method_id
        }
        resp = session.post(f"{BASE_URL}/affiliate/cashout", json=payload, timeout=10)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "الحد الأدنى للسحب هو 50 USD" in error_msg:
                log_pass("Amount below minimum correctly rejected")
            else:
                log_fail(f"Below minimum error message incorrect: {error_msg}")
                return False
        else:
            log_fail(f"Amount below minimum should return 400, got {resp.status_code}")
            return False
        
        # Test 2: Amount above balance
        payload = {
            "amount_usd": current_balance + 100,  # More than current balance
            "payout_method_id": payout_method_id
        }
        resp = session.post(f"{BASE_URL}/affiliate/cashout", json=payload, timeout=10)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "الرصيد غير كافٍ" in error_msg:
                log_pass("Amount above balance correctly rejected")
            else:
                log_fail(f"Above balance error message incorrect: {error_msg}")
                return False
        else:
            log_fail(f"Amount above balance should return 400, got {resp.status_code}")
            return False
        
        # Test 3: Missing payout_method_id
        payload = {
            "amount_usd": 60
        }
        resp = session.post(f"{BASE_URL}/affiliate/cashout", json=payload, timeout=10)
        if resp.status_code == 400:
            log_pass("Missing payout_method_id correctly rejected")
        else:
            log_fail(f"Missing payout_method_id should return 400, got {resp.status_code}")
            return False
        
        return True
    except Exception as e:
        log_fail(f"test_affiliate_cashout_validation exception: {e}")
        return False

def test_affiliate_cashout_success(payout_method_id, current_balance):
    """Test 14: POST /affiliate/cashout with valid data ($60)"""
    log("Testing POST /affiliate/cashout with $60...")
    try:
        payload = {
            "amount_usd": 60,
            "payout_method_id": payout_method_id,
            "notes": "اختبار"
        }
        resp = session.post(f"{BASE_URL}/affiliate/cashout", json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "pending":
                # Verify balance decreased
                resp = session.get(f"{BASE_URL}/affiliate", timeout=10)
                if resp.status_code == 200:
                    affiliate_data = resp.json()
                    expected_balance = current_balance - 60
                    if affiliate_data.get("balance_usd") == expected_balance:
                        withdrawals = affiliate_data.get("withdrawals", [])
                        if len(withdrawals) >= 1:
                            # Check if our withdrawal is in the list
                            found = False
                            for w in withdrawals:
                                if w.get("amount_usd") == 60 and w.get("status") == "pending":
                                    found = True
                                    break
                            if found:
                                log_pass(f"Cashout successful: balance decreased to ${expected_balance}, withdrawal in history with status=pending")
                                return True, expected_balance
                            else:
                                log_fail("Withdrawal not found in history")
                                return False, expected_balance
                        else:
                            log_fail("No withdrawals in history")
                            return False, expected_balance
                    else:
                        log_fail(f"Balance not decreased correctly: expected {expected_balance}, got {affiliate_data.get('balance_usd')}")
                        return False, affiliate_data.get("balance_usd", 0)
                else:
                    log_fail(f"Failed to verify balance: {resp.status_code}")
                    return False, current_balance
            else:
                log_fail(f"Cashout status incorrect: {data.get('status')}")
                return False, current_balance
        else:
            log_fail(f"POST /affiliate/cashout failed: {resp.status_code} {resp.text}")
            return False, current_balance
    except Exception as e:
        log_fail(f"test_affiliate_cashout_success exception: {e}")
        return False, current_balance

def test_affiliate_apply_to_subscription(current_balance):
    """Test 15: POST /affiliate/apply-to-subscription with $50"""
    log("Testing POST /affiliate/apply-to-subscription with $50...")
    try:
        payload = {
            "amount_usd": 50
        }
        resp = session.post(f"{BASE_URL}/affiliate/apply-to-subscription", json=payload, timeout=10)
        if resp.status_code == 200:
            # Verify balance decreased
            resp = session.get(f"{BASE_URL}/affiliate", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                expected_balance = current_balance - 50
                if data.get("balance_usd") == expected_balance:
                    withdrawals = data.get("withdrawals", [])
                    # Should have applied_to_subscription withdrawal
                    if len(withdrawals) >= 1:
                        applied_found = False
                        for w in withdrawals:
                            if w.get("amount_usd") == 50 and w.get("status") == "applied_to_subscription":
                                applied_found = True
                                break
                        if applied_found:
                            log_pass(f"Apply-to-subscription successful: balance ${expected_balance}, withdrawal in history")
                            return True, expected_balance
                        else:
                            log_fail("Applied-to-subscription withdrawal not found in history")
                            return False, expected_balance
                    else:
                        log_fail(f"No withdrawals in history")
                        return False, expected_balance
                else:
                    log_fail(f"Balance not decreased correctly: expected {expected_balance}, got {data.get('balance_usd')}")
                    return False, data.get("balance_usd", 0)
            else:
                log_fail(f"Failed to verify balance: {resp.status_code}")
                return False, current_balance
        else:
            log_fail(f"POST /affiliate/apply-to-subscription failed: {resp.status_code} {resp.text}")
            return False, current_balance
    except Exception as e:
        log_fail(f"test_affiliate_apply_to_subscription exception: {e}")
        return False, current_balance

def test_affiliate_delete_payout_method(wallet_id):
    """Test 16: DELETE /affiliate/payout-methods/:id"""
    log("Testing DELETE /affiliate/payout-methods/:id...")
    try:
        resp = session.delete(f"{BASE_URL}/affiliate/payout-methods/{wallet_id}", timeout=10)
        if resp.status_code == 200:
            # Verify only 1 method left
            resp = session.get(f"{BASE_URL}/affiliate/payout-methods", timeout=10)
            if resp.status_code == 200:
                methods = resp.json()
                # Should have at least 1 method (bank), wallet should be gone
                wallet_found = False
                for method in methods:
                    if method.get("id") == wallet_id:
                        wallet_found = True
                        break
                
                if not wallet_found:
                    log_pass("DELETE /affiliate/payout-methods/:id successful, wallet removed")
                    return True
                else:
                    log_fail("Wallet still found after DELETE")
                    return False
            else:
                log_fail(f"Failed to verify DELETE: {resp.status_code}")
                return False
        else:
            log_fail(f"DELETE /affiliate/payout-methods/:id failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        log_fail(f"test_affiliate_delete_payout_method exception: {e}")
        return False

# ============================================================
# v3.4.3 — INDIVIDUAL vs OFFICE MINIMUMS
# ============================================================

def test_affiliate_individual_mode():
    """Test 17: Set is_individual=true, verify min_cashout_usd=10"""
    log("Testing individual mode (min $10)...")
    try:
        # Seed balance as individual
        payload = {
            "amount_usd": 15,
            "is_individual": True
        }
        resp = session.post(f"{BASE_URL}/affiliate/dev-seed-balance", json=payload, timeout=10)
        if resp.status_code != 200:
            log_fail(f"Failed to seed individual balance: {resp.status_code}")
            return False
        
        # Verify min_cashout_usd = 10
        resp = session.get(f"{BASE_URL}/affiliate", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("min_cashout_usd") == 10 and data.get("is_individual") == True:
                log_pass("Individual mode: min_cashout_usd=10, is_individual=true")
                return True
            else:
                log_fail(f"Individual mode values incorrect: min={data.get('min_cashout_usd')}, is_individual={data.get('is_individual')}")
                return False
        else:
            log_fail(f"Failed to verify individual mode: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_affiliate_individual_mode exception: {e}")
        return False

def test_affiliate_individual_cashout_below_min(bank_id):
    """Test 18: Try cashout $8 in individual mode (should fail)"""
    log("Testing individual cashout below $10 minimum...")
    try:
        payload = {
            "amount_usd": 8,
            "payout_method_id": bank_id
        }
        resp = session.post(f"{BASE_URL}/affiliate/cashout", json=payload, timeout=10)
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "الحد الأدنى" in error_msg and "10 USD" in error_msg:
                log_pass("Individual cashout below $10 correctly rejected")
                return True
            else:
                log_fail(f"Error message incorrect: {error_msg}")
                return False
        else:
            log_fail(f"Cashout below min should return 400, got {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_affiliate_individual_cashout_below_min exception: {e}")
        return False

def test_affiliate_individual_cashout_success(bank_id):
    """Test 19: Cashout $12 in individual mode (should succeed)"""
    log("Testing individual cashout $12 (above $10 minimum)...")
    try:
        payload = {
            "amount_usd": 12,
            "payout_method_id": bank_id
        }
        resp = session.post(f"{BASE_URL}/affiliate/cashout", json=payload, timeout=10)
        if resp.status_code == 200:
            log_pass("Individual cashout $12 successful")
            return True
        else:
            log_fail(f"Individual cashout failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        log_fail(f"test_affiliate_individual_cashout_success exception: {e}")
        return False

def test_affiliate_reset_to_office_mode():
    """Test 20: Reset to office mode (is_individual=false)"""
    log("Testing reset to office mode...")
    try:
        payload = {
            "amount_usd": 0,
            "is_individual": False
        }
        resp = session.post(f"{BASE_URL}/affiliate/dev-seed-balance", json=payload, timeout=10)
        if resp.status_code == 200:
            # Verify min_cashout_usd = 50
            resp = session.get(f"{BASE_URL}/affiliate", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("min_cashout_usd") == 50 and data.get("is_individual") == False:
                    log_pass("Reset to office mode: min_cashout_usd=50, is_individual=false")
                    return True
                else:
                    log_fail(f"Office mode values incorrect: min={data.get('min_cashout_usd')}, is_individual={data.get('is_individual')}")
                    return False
            else:
                log_fail(f"Failed to verify office mode: {resp.status_code}")
                return False
        else:
            log_fail(f"Failed to reset to office mode: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_affiliate_reset_to_office_mode exception: {e}")
        return False

# ============================================================
# REGRESSION TESTS
# ============================================================

def test_regression_services():
    """REGRESSION: GET /services should still work"""
    log("Testing REGRESSION: GET /services...")
    try:
        resp = session.get(f"{BASE_URL}/services", timeout=10)
        if resp.status_code == 200:
            log_pass("REGRESSION: GET /services working")
            return True
        else:
            log_fail(f"REGRESSION: GET /services failed: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_regression_services exception: {e}")
        return False

def test_regression_visas():
    """REGRESSION: GET /visas should still work"""
    log("Testing REGRESSION: GET /visas...")
    try:
        resp = session.get(f"{BASE_URL}/visas", timeout=10)
        if resp.status_code == 200:
            log_pass("REGRESSION: GET /visas working")
            return True
        else:
            log_fail(f"REGRESSION: GET /visas failed: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_regression_visas exception: {e}")
        return False

def test_regression_tickets():
    """REGRESSION: GET /tickets should still work"""
    log("Testing REGRESSION: GET /tickets...")
    try:
        resp = session.get(f"{BASE_URL}/tickets", timeout=10)
        if resp.status_code == 200:
            log_pass("REGRESSION: GET /tickets working")
            return True
        else:
            log_fail(f"REGRESSION: GET /tickets failed: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_regression_tickets exception: {e}")
        return False

def test_regression_dashboard():
    """REGRESSION: GET /dashboard should still work"""
    log("Testing REGRESSION: GET /dashboard...")
    try:
        resp = session.get(f"{BASE_URL}/dashboard", timeout=10)
        if resp.status_code == 200:
            log_pass("REGRESSION: GET /dashboard working")
            return True
        else:
            log_fail(f"REGRESSION: GET /dashboard failed: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_regression_dashboard exception: {e}")
        return False

def test_regression_statement():
    """REGRESSION: GET /reports/statement should still work"""
    log("Testing REGRESSION: GET /reports/statement...")
    try:
        # Get a client ID first
        resp = session.get(f"{BASE_URL}/clients", timeout=10)
        if resp.status_code == 200:
            clients = resp.json()
            if len(clients) > 0:
                client_id = clients[0]["id"]
                resp = session.get(f"{BASE_URL}/reports/statement?party_id={client_id}&party_type=client", timeout=10)
                if resp.status_code == 200:
                    log_pass("REGRESSION: GET /reports/statement working")
                    return True
                else:
                    log_fail(f"REGRESSION: GET /reports/statement failed: {resp.status_code}")
                    return False
            else:
                log_pass("REGRESSION: No clients to test statement (skipped)")
                return True
        else:
            log_fail(f"REGRESSION: Failed to get clients: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_regression_statement exception: {e}")
        return False

def test_regression_login_logout():
    """REGRESSION: Login/logout flow should still work"""
    log("Testing REGRESSION: Login/logout flow...")
    try:
        # Logout
        resp = session.post(f"{BASE_URL}/auth/logout", timeout=10)
        if resp.status_code != 200:
            log_fail(f"REGRESSION: Logout failed: {resp.status_code}")
            return False
        
        # Login again
        resp = session.post(f"{BASE_URL}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=10)
        if resp.status_code == 200:
            log_pass("REGRESSION: Login/logout flow working")
            return True
        else:
            log_fail(f"REGRESSION: Re-login failed: {resp.status_code}")
            return False
    except Exception as e:
        log_fail(f"test_regression_login_logout exception: {e}")
        return False

def main():
    """Run all v3.4 backend tests"""
    print("\n" + "="*80)
    print("v3.4 BACKEND TESTING SUITE - Rahaal ERP")
    print("="*80 + "\n")
    
    # Login as owner
    if not login(OWNER_EMAIL, OWNER_PASSWORD):
        print("\n❌ CRITICAL: Login failed. Cannot proceed with tests.")
        sys.exit(1)
    
    results = {}
    wallet_id = None
    bank_id = None
    current_balance = 0
    
    # v3.4.1 — EMPLOYEE PERMISSIONS
    print("\n" + "-"*80)
    print("v3.4.1 — EMPLOYEE PERMISSIONS")
    print("-"*80)
    results["health_version_34"] = test_health_version_34()
    results["auth_me_permissions"] = test_auth_me_permissions()
    results["tenant_users_permissions"] = test_tenant_users_permissions()
    results["patch_user_permissions"] = test_patch_user_permissions()
    results["delete_owner_blocked"] = test_delete_owner_blocked()
    
    # v3.4.2 — AFFILIATE MODULE
    print("\n" + "-"*80)
    print("v3.4.2 — AFFILIATE MODULE")
    print("-"*80)
    success, current_balance = test_affiliate_get_initial()
    results["affiliate_get_initial"] = success
    
    success, current_balance = test_affiliate_seed_balance(current_balance)
    results["affiliate_seed_balance"] = success
    
    results["affiliate_payout_validation"] = test_affiliate_payout_method_validation()
    
    success, wallet_id = test_affiliate_payout_method_create_wallet()
    results["affiliate_payout_create_wallet"] = success
    
    success, bank_id = test_affiliate_payout_method_create_bank()
    results["affiliate_payout_create_bank"] = success
    
    results["affiliate_payout_methods_get"] = test_affiliate_payout_methods_get()
    
    if bank_id:
        results["affiliate_payout_set_default"] = test_affiliate_payout_method_set_default(bank_id)
        results["affiliate_cashout_validation"] = test_affiliate_cashout_validation(bank_id, current_balance)
        success, current_balance = test_affiliate_cashout_success(bank_id, current_balance)
        results["affiliate_cashout_success"] = success
    else:
        log_fail("Bank ID not available, skipping cashout tests")
        results["affiliate_payout_set_default"] = False
        results["affiliate_cashout_validation"] = False
        results["affiliate_cashout_success"] = False
    
    success, current_balance = test_affiliate_apply_to_subscription(current_balance)
    results["affiliate_apply_to_subscription"] = success
    
    if wallet_id:
        results["affiliate_delete_payout_method"] = test_affiliate_delete_payout_method(wallet_id)
    else:
        log_fail("Wallet ID not available, skipping delete test")
        results["affiliate_delete_payout_method"] = False
    
    # v3.4.3 — INDIVIDUAL vs OFFICE MINIMUMS
    print("\n" + "-"*80)
    print("v3.4.3 — INDIVIDUAL vs OFFICE MINIMUMS")
    print("-"*80)
    results["affiliate_individual_mode"] = test_affiliate_individual_mode()
    
    if bank_id:
        results["affiliate_individual_cashout_below_min"] = test_affiliate_individual_cashout_below_min(bank_id)
        results["affiliate_individual_cashout_success"] = test_affiliate_individual_cashout_success(bank_id)
    else:
        log_fail("Bank ID not available, skipping individual cashout tests")
        results["affiliate_individual_cashout_below_min"] = False
        results["affiliate_individual_cashout_success"] = False
    
    results["affiliate_reset_to_office_mode"] = test_affiliate_reset_to_office_mode()
    
    # REGRESSION
    print("\n" + "-"*80)
    print("REGRESSION TESTS")
    print("-"*80)
    results["regression_services"] = test_regression_services()
    results["regression_visas"] = test_regression_visas()
    results["regression_tickets"] = test_regression_tickets()
    results["regression_dashboard"] = test_regression_dashboard()
    results["regression_statement"] = test_regression_statement()
    results["regression_login_logout"] = test_regression_login_logout()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    
    print("\nDetailed Results:")
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")
    
    print("\n" + "="*80)
    
    if passed == total:
        print("🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print("⚠️  SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
