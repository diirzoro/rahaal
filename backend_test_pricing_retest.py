#!/usr/bin/env python3
"""
Focused retest of PUT /api/admin/pricing-config after MongoDB _id fix.
Tests only the pricing-config endpoint as per review request.
"""

import requests
import json
import sys

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@targetmedia.com"
ADMIN_PASSWORD = "Target@2025"
DEMO_EMAIL = "owner@demo.com"
DEMO_PASSWORD = "Demo@2025"

def login(email, password):
    """Login and return session cookies"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=10)
        if resp.status_code == 200:
            print(f"✅ Login successful as {email}")
            return resp.cookies
        else:
            print(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return None

def test_pricing_config_retest():
    """
    Focused retest of PUT /api/admin/pricing-config after _id fix.
    Steps:
    1. GET current config (record discount_percent and silver features)
    2. PUT with discount_percent: 25 → expect 200
    3. GET /api/pricing to verify silver annual final = 375 and installment final_per = 75
    4. PUT with modified silver features (append 'ميزة اختبار') → 200, GET confirms
    5. RESTORE: PUT back to original values, GET confirms restoration (silver annual final 250)
    """
    print("\n" + "="*80)
    print("FOCUSED RETEST: PUT /api/admin/pricing-config (MongoDB _id fix)")
    print("="*80)
    
    # Login as super admin
    cookies = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not cookies:
        print("❌ CRITICAL: Cannot login as super admin")
        return False
    
    all_passed = True
    original_discount = None
    original_silver_features = None
    
    # Step 1: GET current config
    print("\n[Step 1] GET /api/admin/pricing-config - Record current state")
    try:
        resp = requests.get(f"{BASE_URL}/admin/pricing-config", cookies=cookies, timeout=10)
        if resp.status_code == 200:
            config = resp.json()
            original_discount = config.get('discount_percent')
            plans = config.get('plans', [])
            silver_plan = next((p for p in plans if p['key'] == 'silver'), None)
            if silver_plan:
                original_silver_features = silver_plan.get('features', []).copy()
                print(f"✅ Current config retrieved: discount_percent={original_discount}, silver features count={len(original_silver_features)}")
            else:
                print("❌ Silver plan not found in config")
                all_passed = False
        else:
            print(f"❌ GET /admin/pricing-config failed: {resp.status_code} - {resp.text}")
            all_passed = False
    except Exception as e:
        print(f"❌ Exception in step 1: {e}")
        all_passed = False
    
    # Step 2: PUT with discount_percent: 25
    print("\n[Step 2] PUT /api/admin/pricing-config with discount_percent=25")
    try:
        resp = requests.put(f"{BASE_URL}/admin/pricing-config", 
                           json={"discount_percent": 25}, 
                           cookies=cookies, 
                           timeout=10)
        if resp.status_code == 200:
            print(f"✅ PUT discount_percent=25 succeeded: {resp.status_code}")
        else:
            print(f"❌ PUT discount_percent=25 failed: {resp.status_code} - {resp.text}")
            all_passed = False
    except Exception as e:
        print(f"❌ Exception in step 2: {e}")
        all_passed = False
    
    # Step 3: GET /api/pricing to verify calculations (need to login as tenant owner)
    print("\n[Step 3] GET /api/pricing - Verify silver annual.final=375, installment.final_per=75")
    try:
        # Login as demo owner to access /api/pricing
        demo_cookies = login(DEMO_EMAIL, DEMO_PASSWORD)
        if not demo_cookies:
            print("❌ Cannot login as demo owner")
            all_passed = False
        else:
            resp = requests.get(f"{BASE_URL}/pricing", cookies=demo_cookies, timeout=10)
            if resp.status_code == 200:
                pricing = resp.json()
                plans = pricing.get('plans', [])
                silver = next((p for p in plans if p['key'] == 'silver'), None)
                if silver:
                    # Check if pricing is nested under 'pricing' key
                    pricing_data = silver.get('pricing', silver)
                    annual_final = pricing_data.get('annual', {}).get('final')
                    installment_final_per = pricing_data.get('installment', {}).get('final_per')
                    if annual_final == 375 and installment_final_per == 75:
                        print(f"✅ Silver pricing correct: annual.final={annual_final}, installment.final_per={installment_final_per}")
                    else:
                        print(f"❌ Silver pricing incorrect: annual.final={annual_final} (expected 375), installment.final_per={installment_final_per} (expected 75)")
                        all_passed = False
                else:
                    print("❌ Silver plan not found in pricing response")
                    all_passed = False
            else:
                print(f"❌ GET /pricing failed: {resp.status_code} - {resp.text}")
                all_passed = False
    except Exception as e:
        print(f"❌ Exception in step 3: {e}")
        all_passed = False
    
    # Step 4: PUT with modified silver features
    print("\n[Step 4] PUT /api/admin/pricing-config - Add 'ميزة اختبار' to silver features")
    try:
        # Get current config again to get full structure
        resp = requests.get(f"{BASE_URL}/admin/pricing-config", cookies=cookies, timeout=10)
        if resp.status_code == 200:
            config = resp.json()
            plans = config.get('plans', [])
            silver_plan = next((p for p in plans if p['key'] == 'silver'), None)
            if silver_plan:
                modified_features = silver_plan.get('features', []).copy()
                modified_features.append('ميزة اختبار')
                
                # Update silver plan features
                updated_plans = []
                for p in plans:
                    if p['key'] == 'silver':
                        p['features'] = modified_features
                    updated_plans.append(p)
                
                resp = requests.put(f"{BASE_URL}/admin/pricing-config", 
                                   json={"plans": updated_plans}, 
                                   cookies=cookies, 
                                   timeout=10)
                if resp.status_code == 200:
                    print(f"✅ PUT with modified silver features succeeded: {resp.status_code}")
                    
                    # Verify the feature was added
                    resp = requests.get(f"{BASE_URL}/admin/pricing-config", cookies=cookies, timeout=10)
                    if resp.status_code == 200:
                        config = resp.json()
                        plans = config.get('plans', [])
                        silver_plan = next((p for p in plans if p['key'] == 'silver'), None)
                        if silver_plan:
                            features = silver_plan.get('features', [])
                            if 'ميزة اختبار' in features:
                                print(f"✅ Feature 'ميزة اختبار' confirmed in silver plan (total features: {len(features)})")
                            else:
                                print(f"❌ Feature 'ميزة اختبار' NOT found in silver plan")
                                all_passed = False
                        else:
                            print("❌ Silver plan not found after update")
                            all_passed = False
                    else:
                        print(f"❌ GET after feature update failed: {resp.status_code}")
                        all_passed = False
                else:
                    print(f"❌ PUT with modified features failed: {resp.status_code} - {resp.text}")
                    all_passed = False
            else:
                print("❌ Silver plan not found in config")
                all_passed = False
        else:
            print(f"❌ GET /admin/pricing-config failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        print(f"❌ Exception in step 4: {e}")
        all_passed = False
    
    # Step 5: RESTORE original values
    print("\n[Step 5] RESTORE - PUT back to discount_percent=50 and original silver features")
    try:
        # Get current config to restore properly
        resp = requests.get(f"{BASE_URL}/admin/pricing-config", cookies=cookies, timeout=10)
        if resp.status_code == 200:
            config = resp.json()
            plans = config.get('plans', [])
            
            # Restore silver features (remove test feature)
            updated_plans = []
            for p in plans:
                if p['key'] == 'silver' and original_silver_features:
                    p['features'] = original_silver_features
                updated_plans.append(p)
            
            # Restore discount_percent to 50 and plans
            restore_payload = {
                "discount_percent": 50,
                "plans": updated_plans
            }
            
            resp = requests.put(f"{BASE_URL}/admin/pricing-config", 
                               json=restore_payload, 
                               cookies=cookies, 
                               timeout=10)
            if resp.status_code == 200:
                print(f"✅ RESTORE PUT succeeded: {resp.status_code}")
                
                # Verify restoration (login as demo owner)
                demo_cookies = login(DEMO_EMAIL, DEMO_PASSWORD)
                if not demo_cookies:
                    print("❌ Cannot login as demo owner for verification")
                    all_passed = False
                else:
                    resp = requests.get(f"{BASE_URL}/pricing", cookies=demo_cookies, timeout=10)
                    if resp.status_code == 200:
                        pricing = resp.json()
                        discount = pricing.get('discount_percent')
                        plans = pricing.get('plans', [])
                        silver = next((p for p in plans if p['key'] == 'silver'), None)
                        if silver:
                            # Check if pricing is nested under 'pricing' key
                            pricing_data = silver.get('pricing', silver)
                            annual_final = pricing_data.get('annual', {}).get('final')
                            if discount == 50 and annual_final == 250:
                                print(f"✅ Restoration confirmed: discount_percent={discount}, silver annual.final={annual_final}")
                            else:
                                print(f"❌ Restoration incomplete: discount_percent={discount} (expected 50), annual.final={annual_final} (expected 250)")
                                all_passed = False
                        else:
                            print("❌ Silver plan not found after restoration")
                            all_passed = False
                    else:
                        print(f"❌ GET /pricing after restoration failed: {resp.status_code}")
                        all_passed = False
            else:
                print(f"❌ RESTORE PUT failed: {resp.status_code} - {resp.text}")
                all_passed = False
        else:
            print(f"❌ GET /admin/pricing-config for restoration failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        print(f"❌ Exception in step 5: {e}")
        all_passed = False
    
    print("\n" + "="*80)
    if all_passed:
        print("✅ ALL STEPS PASSED - PUT /api/admin/pricing-config is working correctly")
    else:
        print("❌ SOME STEPS FAILED - See details above")
    print("="*80)
    
    return all_passed

if __name__ == "__main__":
    try:
        success = test_pricing_config_retest()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
