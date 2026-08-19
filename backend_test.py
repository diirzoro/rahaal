#!/usr/bin/env python3
"""
Backend Test Suite for Rahaal ERP v3.14 - Pricing & Plans APIs
Tests pricing configuration, plan assignment, billing modes, and quota bypass
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
SUPER_ADMIN_EMAIL = "admin@targetmedia.com"
SUPER_ADMIN_PASSWORD = "Target@2025"
DEMO_OWNER_EMAIL = "owner@demo.com"
DEMO_OWNER_PASSWORD = "Demo@2025"

# Test state
super_admin_session = None
demo_owner_session = None
demo_tenant_id = None
demo_tenant_original_state = {}

def print_test(msg: str):
    """Print test step"""
    print(f"\n{'='*80}")
    print(f"TEST: {msg}")
    print('='*80)

def print_result(passed: bool, msg: str):
    """Print test result"""
    status = "✅ PASSED" if passed else "❌ FAILED"
    print(f"{status}: {msg}")

def login(email: str, password: str) -> Optional[requests.Session]:
    """Login and return session with cookie"""
    try:
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Login successful: {email} (role: {data.get('user', {}).get('role')})")
            return session
        else:
            print(f"❌ Login failed for {email}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {email}: {e}")
        return None

def get_demo_tenant_id(session: requests.Session) -> Optional[str]:
    """Get demo tenant ID by finding tenant with slug 'demo'"""
    try:
        response = session.get(f"{BASE_URL}/admin/tenants", timeout=10)
        if response.status_code == 200:
            data = response.json()
            tenants = data.get('tenants', []) if isinstance(data, dict) else data
            for tenant in tenants:
                if tenant.get('slug') == 'demo':
                    print(f"✅ Found demo tenant: {tenant['id']} (name: {tenant.get('name')})")
                    return tenant['id']
            print("❌ Demo tenant not found")
            return None
        else:
            print(f"❌ Failed to get tenants: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Exception getting demo tenant: {e}")
        return None

def save_demo_tenant_state(session: requests.Session, tenant_id: str) -> Dict[str, Any]:
    """Save original demo tenant state for restoration"""
    try:
        response = session.get(f"{BASE_URL}/admin/tenants", timeout=10)
        if response.status_code == 200:
            data = response.json()
            tenants = data.get('tenants', []) if isinstance(data, dict) else data
            for tenant in tenants:
                if tenant['id'] == tenant_id:
                    state = {
                        'max_users': tenant.get('max_users'),
                        'max_branches': tenant.get('max_branches'),
                        'plan_tier': tenant.get('plan_tier'),
                        'billing_mode': tenant.get('billing_mode'),
                        'unlimited_journals': tenant.get('unlimited_journals'),
                        'subscription': tenant.get('subscription')
                    }
                    print(f"✅ Saved original demo tenant state: {state}")
                    return state
        print("❌ Failed to save demo tenant state")
        return {}
    except Exception as e:
        print(f"❌ Exception saving demo tenant state: {e}")
        return {}

def restore_demo_tenant_state(session: requests.Session, tenant_id: str, state: Dict[str, Any]):
    """Restore demo tenant to original state"""
    try:
        print(f"\n🔄 Restoring demo tenant to original state: {state}")
        response = session.patch(
            f"{BASE_URL}/admin/tenants/{tenant_id}",
            json=state,
            timeout=10
        )
        if response.status_code == 200:
            print("✅ Demo tenant restored successfully")
        else:
            print(f"❌ Failed to restore demo tenant: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Exception restoring demo tenant: {e}")

def test_1_get_pricing_as_demo_owner():
    """Test 1: GET /api/pricing as demo owner"""
    print_test("1. GET /api/pricing as demo owner - verify structure and calculations")
    
    try:
        response = demo_owner_session.get(f"{BASE_URL}/pricing", timeout=10)
        
        if response.status_code != 200:
            print_result(False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Check required fields
        required_fields = ['discount_enabled', 'discount_percent', 'installments_count', 'plans', 'current']
        for field in required_fields:
            if field not in data:
                print_result(False, f"Missing required field: {field}")
                return False
        
        # Check default config
        if data['discount_enabled'] != True:
            print_result(False, f"Expected discount_enabled=true, got {data['discount_enabled']}")
            return False
        
        if data['discount_percent'] != 50:
            print_result(False, f"Expected discount_percent=50, got {data['discount_percent']}")
            return False
        
        if data['installments_count'] != 5:
            print_result(False, f"Expected installments_count=5, got {data['installments_count']}")
            return False
        
        # Check plans array
        if len(data['plans']) != 3:
            print_result(False, f"Expected 3 plans, got {len(data['plans'])}")
            return False
        
        # Verify silver plan calculations
        silver = next((p for p in data['plans'] if p['key'] == 'silver'), None)
        if not silver:
            print_result(False, "Silver plan not found")
            return False
        
        if silver['annual_price'] != 500:
            print_result(False, f"Silver annual_price should be 500, got {silver['annual_price']}")
            return False
        
        # Check pricing calculations for silver
        pricing = silver.get('pricing', {})
        annual = pricing.get('annual', {})
        installment = pricing.get('installment', {})
        
        # annual.original = 500, annual.final = 250 (50% discount)
        if annual.get('original') != 500:
            print_result(False, f"Silver annual.original should be 500, got {annual.get('original')}")
            return False
        
        if annual.get('final') != 250:
            print_result(False, f"Silver annual.final should be 250 (50% discount), got {annual.get('final')}")
            return False
        
        # installment.original_per = 100 (500/5), installment.final_per = 50 (250/5)
        if installment.get('original_per') != 100:
            print_result(False, f"Silver installment.original_per should be 100, got {installment.get('original_per')}")
            return False
        
        if installment.get('final_per') != 50:
            print_result(False, f"Silver installment.final_per should be 50, got {installment.get('final_per')}")
            return False
        
        # Verify gold plan calculations (1000 -> 500, 200 -> 100)
        gold = next((p for p in data['plans'] if p['key'] == 'gold'), None)
        if not gold:
            print_result(False, "Gold plan not found")
            return False
        
        gold_pricing = gold.get('pricing', {})
        gold_annual = gold_pricing.get('annual', {})
        gold_installment = gold_pricing.get('installment', {})
        
        if gold_annual.get('original') != 1000 or gold_annual.get('final') != 500:
            print_result(False, f"Gold annual pricing incorrect: original={gold_annual.get('original')}, final={gold_annual.get('final')}")
            return False
        
        if gold_installment.get('original_per') != 200 or gold_installment.get('final_per') != 100:
            print_result(False, f"Gold installment pricing incorrect: original_per={gold_installment.get('original_per')}, final_per={gold_installment.get('final_per')}")
            return False
        
        # Verify enterprise plan calculations (2000 -> 1000, 400 -> 200)
        enterprise = next((p for p in data['plans'] if p['key'] == 'enterprise'), None)
        if not enterprise:
            print_result(False, "Enterprise plan not found")
            return False
        
        ent_pricing = enterprise.get('pricing', {})
        ent_annual = ent_pricing.get('annual', {})
        ent_installment = ent_pricing.get('installment', {})
        
        if ent_annual.get('original') != 2000 or ent_annual.get('final') != 1000:
            print_result(False, f"Enterprise annual pricing incorrect: original={ent_annual.get('original')}, final={ent_annual.get('final')}")
            return False
        
        if ent_installment.get('original_per') != 400 or ent_installment.get('final_per') != 200:
            print_result(False, f"Enterprise installment pricing incorrect: original_per={ent_installment.get('original_per')}, final_per={ent_installment.get('final_per')}")
            return False
        
        print_result(True, "All pricing calculations correct for all 3 plans")
        return True
        
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return False

def test_2_get_pricing_config_authorization():
    """Test 2: GET /api/admin/pricing-config authorization"""
    print_test("2. GET /api/admin/pricing-config - super admin gets full config, demo owner gets 403")
    
    try:
        # Test as super admin - should succeed
        response = super_admin_session.get(f"{BASE_URL}/admin/pricing-config", timeout=10)
        
        if response.status_code != 200:
            print_result(False, f"Super admin should get 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Super admin response: {json.dumps(data, indent=2)}")
        
        # Check full config fields
        required_fields = ['id', 'discount_enabled', 'discount_percent', 'installments_count', 'plans']
        for field in required_fields:
            if field not in data:
                print_result(False, f"Missing field in super admin response: {field}")
                return False
        
        print("✅ Super admin can access full pricing config")
        
        # Test as demo owner - should get 403
        response = demo_owner_session.get(f"{BASE_URL}/admin/pricing-config", timeout=10)
        
        if response.status_code != 403:
            print_result(False, f"Demo owner should get 403, got {response.status_code}")
            return False
        
        print("✅ Demo owner correctly denied access (403)")
        print_result(True, "Authorization working correctly")
        return True
        
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return False

def test_3_put_pricing_config_discount():
    """Test 3: PUT /api/admin/pricing-config - update discount_percent and verify calculations"""
    print_test("3. PUT /api/admin/pricing-config - change discount to 25%, verify calculations, then restore to 50%")
    
    try:
        # Update discount to 25%
        response = super_admin_session.put(
            f"{BASE_URL}/admin/pricing-config",
            json={"discount_percent": 25},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"PUT failed: {response.status_code} - {response.text}")
            return False
        
        print("✅ Updated discount_percent to 25%")
        
        # Verify via GET /api/pricing
        response = demo_owner_session.get(f"{BASE_URL}/pricing", timeout=10)
        
        if response.status_code != 200:
            print_result(False, f"GET /pricing failed: {response.status_code}")
            return False
        
        data = response.json()
        
        if data['discount_percent'] != 25:
            print_result(False, f"Expected discount_percent=25, got {data['discount_percent']}")
            return False
        
        # Check silver calculations with 25% discount
        silver = next((p for p in data['plans'] if p['key'] == 'silver'), None)
        pricing = silver.get('pricing', {})
        annual = pricing.get('annual', {})
        installment = pricing.get('installment', {})
        
        # annual.final = 375 (500 * 0.75), installment.final_per = 75 (375/5)
        if annual.get('final') != 375:
            print_result(False, f"Silver annual.final should be 375 (25% discount), got {annual.get('final')}")
            return False
        
        if installment.get('final_per') != 75:
            print_result(False, f"Silver installment.final_per should be 75, got {installment.get('final_per')}")
            return False
        
        print("✅ Pricing calculations correct with 25% discount")
        
        # Restore discount to 50%
        response = super_admin_session.put(
            f"{BASE_URL}/admin/pricing-config",
            json={"discount_percent": 50},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to restore discount: {response.status_code}")
            return False
        
        print("✅ Restored discount_percent to 50%")
        
        # Verify restoration
        response = demo_owner_session.get(f"{BASE_URL}/pricing", timeout=10)
        data = response.json()
        
        if data['discount_percent'] != 50:
            print_result(False, f"Failed to restore discount to 50%, got {data['discount_percent']}")
            return False
        
        print_result(True, "Discount update and restoration successful")
        return True
        
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return False

def test_4_put_pricing_config_features():
    """Test 4: PUT /api/admin/pricing-config - update features and verify persistence"""
    print_test("4. PUT /api/admin/pricing-config - add feature to silver, verify persistence, then restore")
    
    try:
        # Get current config
        response = super_admin_session.get(f"{BASE_URL}/admin/pricing-config", timeout=10)
        original_config = response.json()
        original_plans = original_config.get('plans', [])
        
        # Find silver plan and add a test feature
        modified_plans = []
        for plan in original_plans:
            if plan['key'] == 'silver':
                features = plan.get('features', []).copy()
                features.append('ميزة اختبار مؤقتة')
                modified_plans.append({**plan, 'features': features})
            else:
                modified_plans.append(plan)
        
        # Update config with modified plans
        response = super_admin_session.put(
            f"{BASE_URL}/admin/pricing-config",
            json={"plans": modified_plans},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"PUT failed: {response.status_code} - {response.text}")
            return False
        
        print("✅ Added test feature to silver plan")
        
        # Verify persistence
        response = super_admin_session.get(f"{BASE_URL}/admin/pricing-config", timeout=10)
        data = response.json()
        
        silver = next((p for p in data['plans'] if p['key'] == 'silver'), None)
        if not silver:
            print_result(False, "Silver plan not found after update")
            return False
        
        if 'ميزة اختبار مؤقتة' not in silver.get('features', []):
            print_result(False, "Test feature not persisted")
            return False
        
        print("✅ Feature persisted correctly")
        
        # Restore original features
        response = super_admin_session.put(
            f"{BASE_URL}/admin/pricing-config",
            json={"plans": original_plans},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to restore features: {response.status_code}")
            return False
        
        print("✅ Restored original features")
        
        print_result(True, "Feature update and restoration successful")
        return True
        
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return False

def test_5_patch_tenant_plan_assignment():
    """Test 5: PATCH /api/admin/tenants/:id - test plan_key assignments"""
    print_test("5. PATCH /api/admin/tenants/:id - test silver/gold/enterprise plan assignments")
    
    try:
        # Test 5a: Assign silver plan
        response = super_admin_session.patch(
            f"{BASE_URL}/admin/tenants/{demo_tenant_id}",
            json={"plan_key": "silver"},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to assign silver plan: {response.status_code} - {response.text}")
            return False
        
        # Verify tenant state
        response = super_admin_session.get(f"{BASE_URL}/admin/tenants", timeout=10)
        data = response.json()
        tenants = data.get('tenants', []) if isinstance(data, dict) else data
        demo_tenant = next((t for t in tenants if t['id'] == demo_tenant_id), None)
        
        if demo_tenant['max_users'] != 2:
            print_result(False, f"Silver plan should set max_users=2, got {demo_tenant['max_users']}")
            return False
        
        if demo_tenant['max_branches'] != 1:
            print_result(False, f"Silver plan should set max_branches=1, got {demo_tenant['max_branches']}")
            return False
        
        if demo_tenant['plan_tier'] != 'silver':
            print_result(False, f"plan_tier should be 'silver', got {demo_tenant['plan_tier']}")
            return False
        
        print("✅ 5a: Silver plan assigned correctly (max_users=2, max_branches=1)")
        
        # Test 5b: Assign gold plan
        response = super_admin_session.patch(
            f"{BASE_URL}/admin/tenants/{demo_tenant_id}",
            json={"plan_key": "gold"},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to assign gold plan: {response.status_code}")
            return False
        
        response = super_admin_session.get(f"{BASE_URL}/admin/tenants", timeout=10)
        data = response.json()
        tenants = data.get('tenants', []) if isinstance(data, dict) else data
        demo_tenant = next((t for t in tenants if t['id'] == demo_tenant_id), None)
        
        if demo_tenant['max_users'] != 8:
            print_result(False, f"Gold plan should set max_users=8, got {demo_tenant['max_users']}")
            return False
        
        if demo_tenant['max_branches'] != 3:
            print_result(False, f"Gold plan should set max_branches=3, got {demo_tenant['max_branches']}")
            return False
        
        print("✅ 5b: Gold plan assigned correctly (max_users=8, max_branches=3)")
        
        # Test 5c: Assign enterprise plan
        response = super_admin_session.patch(
            f"{BASE_URL}/admin/tenants/{demo_tenant_id}",
            json={"plan_key": "enterprise"},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to assign enterprise plan: {response.status_code}")
            return False
        
        response = super_admin_session.get(f"{BASE_URL}/admin/tenants", timeout=10)
        data = response.json()
        tenants = data.get('tenants', []) if isinstance(data, dict) else data
        demo_tenant = next((t for t in tenants if t['id'] == demo_tenant_id), None)
        
        if demo_tenant['max_users'] != 9999:
            print_result(False, f"Enterprise plan should set max_users=9999, got {demo_tenant['max_users']}")
            return False
        
        if demo_tenant['max_branches'] != 9999:
            print_result(False, f"Enterprise plan should set max_branches=9999, got {demo_tenant['max_branches']}")
            return False
        
        print("✅ 5c: Enterprise plan assigned correctly (max_users=9999, max_branches=9999)")
        
        print_result(True, "All plan assignments working correctly")
        return True
        
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return False

def test_6_patch_tenant_billing_mode():
    """Test 6: PATCH /api/admin/tenants/:id - test billing_mode changes"""
    print_test("6. PATCH /api/admin/tenants/:id - test billing_mode annual/installments")
    
    try:
        # Test 6d: Set billing_mode to annual (should set unlimited_journals=true)
        response = super_admin_session.patch(
            f"{BASE_URL}/admin/tenants/{demo_tenant_id}",
            json={"billing_mode": "annual"},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to set billing_mode=annual: {response.status_code} - {response.text}")
            return False
        
        # Verify unlimited_journals is true
        response = super_admin_session.get(f"{BASE_URL}/admin/tenants", timeout=10)
        data = response.json()
        tenants = data.get('tenants', []) if isinstance(data, dict) else data
        demo_tenant = next((t for t in tenants if t['id'] == demo_tenant_id), None)
        
        if demo_tenant.get('unlimited_journals') != True:
            print_result(False, f"billing_mode=annual should set unlimited_journals=true, got {demo_tenant.get('unlimited_journals')}")
            return False
        
        print("✅ 6d: billing_mode=annual correctly sets unlimited_journals=true")
        
        # Test 6e: Set billing_mode to installments (should set unlimited_journals=false)
        response = super_admin_session.patch(
            f"{BASE_URL}/admin/tenants/{demo_tenant_id}",
            json={"billing_mode": "installments"},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to set billing_mode=installments: {response.status_code}")
            return False
        
        response = super_admin_session.get(f"{BASE_URL}/admin/tenants", timeout=10)
        data = response.json()
        tenants = data.get('tenants', []) if isinstance(data, dict) else data
        demo_tenant = next((t for t in tenants if t['id'] == demo_tenant_id), None)
        
        if demo_tenant.get('unlimited_journals') != False:
            print_result(False, f"billing_mode=installments should set unlimited_journals=false, got {demo_tenant.get('unlimited_journals')}")
            return False
        
        print("✅ 6e: billing_mode=installments correctly sets unlimited_journals=false")
        
        print_result(True, "Billing mode changes working correctly")
        return True
        
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return False

def test_7_patch_tenant_unlimited_journals_toggle():
    """Test 7: PATCH /api/admin/tenants/:id - manual unlimited_journals toggle"""
    print_test("7. PATCH /api/admin/tenants/:id - manual unlimited_journals toggle")
    
    try:
        # Set unlimited_journals to true manually
        response = super_admin_session.patch(
            f"{BASE_URL}/admin/tenants/{demo_tenant_id}",
            json={"unlimited_journals": True},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to set unlimited_journals=true: {response.status_code} - {response.text}")
            return False
        
        # Verify
        response = super_admin_session.get(f"{BASE_URL}/admin/tenants", timeout=10)
        data = response.json()
        tenants = data.get('tenants', []) if isinstance(data, dict) else data
        demo_tenant = next((t for t in tenants if t['id'] == demo_tenant_id), None)
        
        if demo_tenant.get('unlimited_journals') != True:
            print_result(False, f"Manual toggle failed, unlimited_journals={demo_tenant.get('unlimited_journals')}")
            return False
        
        print("✅ 6f: Manual unlimited_journals=true toggle works")
        
        print_result(True, "Manual unlimited_journals toggle working correctly")
        return True
        
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return False

def test_8_quota_bypass():
    """Test 8: Quota bypass with unlimited_journals=true"""
    print_test("8. Quota bypass test - verify unlimited_journals=true bypasses quota")
    
    try:
        # Ensure unlimited_journals is true
        response = super_admin_session.patch(
            f"{BASE_URL}/admin/tenants/{demo_tenant_id}",
            json={"unlimited_journals": True},
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to set unlimited_journals=true: {response.status_code}")
            return False
        
        # Verify via GET /auth/me as demo owner
        response = demo_owner_session.get(f"{BASE_URL}/auth/me", timeout=10)
        
        if response.status_code != 200:
            print_result(False, f"GET /auth/me failed: {response.status_code}")
            return False
        
        data = response.json()
        tenant = data.get('tenant', {})
        
        if tenant.get('unlimited_journals') != True:
            print_result(False, f"unlimited_journals should be true, got {tenant.get('unlimited_journals')}")
            return False
        
        print("✅ Verified unlimited_journals=true via /auth/me")
        
        # Note: Creating a journal entry to test quota bypass is complex
        # The review request says if creating JE is complex, verify via /auth/me and report as partial
        print("ℹ️  Note: Full quota bypass test (creating journal entry) skipped due to complexity")
        print("ℹ️  Verified unlimited_journals=true is set correctly via /auth/me")
        
        print_result(True, "Quota bypass verification (partial) - unlimited_journals=true confirmed")
        return True
        
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return False

def main():
    """Main test execution"""
    global super_admin_session, demo_owner_session, demo_tenant_id, demo_tenant_original_state
    
    print("\n" + "="*80)
    print("RAHAAL ERP v3.14 - PRICING & PLANS API TEST SUITE")
    print("="*80)
    
    # Login
    print("\n📝 Logging in...")
    super_admin_session = login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    demo_owner_session = login(DEMO_OWNER_EMAIL, DEMO_OWNER_PASSWORD)
    
    if not super_admin_session or not demo_owner_session:
        print("\n❌ LOGIN FAILED - Cannot proceed with tests")
        sys.exit(1)
    
    # Get demo tenant ID
    print("\n📝 Getting demo tenant ID...")
    demo_tenant_id = get_demo_tenant_id(super_admin_session)
    
    if not demo_tenant_id:
        print("\n❌ DEMO TENANT NOT FOUND - Cannot proceed with tests")
        sys.exit(1)
    
    # Save original state
    print("\n📝 Saving original demo tenant state...")
    demo_tenant_original_state = save_demo_tenant_state(super_admin_session, demo_tenant_id)
    
    # Run tests
    results = []
    
    try:
        results.append(("Test 1: GET /pricing as demo owner", test_1_get_pricing_as_demo_owner()))
        results.append(("Test 2: GET /admin/pricing-config authorization", test_2_get_pricing_config_authorization()))
        results.append(("Test 3: PUT /admin/pricing-config discount", test_3_put_pricing_config_discount()))
        results.append(("Test 4: PUT /admin/pricing-config features", test_4_put_pricing_config_features()))
        results.append(("Test 5: PATCH tenant plan assignment", test_5_patch_tenant_plan_assignment()))
        results.append(("Test 6: PATCH tenant billing_mode", test_6_patch_tenant_billing_mode()))
        results.append(("Test 7: PATCH tenant unlimited_journals toggle", test_7_patch_tenant_unlimited_journals_toggle()))
        results.append(("Test 8: Quota bypass verification", test_8_quota_bypass()))
        
    finally:
        # Always restore demo tenant state
        if demo_tenant_id and demo_tenant_original_state:
            restore_demo_tenant_state(super_admin_session, demo_tenant_id, demo_tenant_original_state)
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({int(passed/total*100)}%)")
    print("="*80)
    
    # Exit with appropriate code
    sys.exit(0 if passed == total else 1)

if __name__ == "__main__":
    main()
