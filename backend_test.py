#!/usr/bin/env python3
"""
v2.8 Backend Testing Suite — Rahaal ERP
Tests: Referral Simplification, Announcements, Suspend/Impersonate, Plans, Quota-Exceeded Flag
"""

import requests
import json
import time
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Auth credentials
SUPER_ADMIN = {"email": "admin@targetmedia.com", "password": "Target@2025"}
DEMO_OWNER = {"email": "owner@demo.com", "password": "Demo@2025"}

# Session storage
sessions = {}

def login(creds, label):
    """Login and store session cookie"""
    print(f"\n🔐 Logging in as {label}...")
    r = requests.post(f"{BASE_URL}/auth/login", json=creds)
    if r.status_code != 200:
        print(f"❌ Login failed: {r.status_code} {r.text}")
        return None
    cookie = r.cookies.get("rahaal_session")
    if not cookie:
        print(f"❌ No session cookie returned")
        return None
    sessions[label] = cookie
    print(f"✅ Logged in as {label}")
    return cookie

def get_headers(label):
    """Get headers with session cookie"""
    cookie = sessions.get(label)
    if not cookie:
        print(f"❌ No session for {label}")
        return None
    return {"Cookie": f"rahaal_session={cookie}"}

def get_me(label):
    """Get current user info"""
    h = get_headers(label)
    if not h:
        return None
    r = requests.get(f"{BASE_URL}/auth/me", headers=h)
    if r.status_code != 200:
        print(f"❌ GET /auth/me failed: {r.status_code}")
        return None
    return r.json()

# ============================================================
# TASK 1: Referral Simplification (30 signup quota + 50 immediate)
# ============================================================
def test_task1_referral_simplification():
    print("\n" + "="*80)
    print("TASK 1: Referral Simplification — 30 signup quota + 50 immediate referrer bonus")
    print("="*80)
    
    # Login as super admin
    login(SUPER_ADMIN, "admin")
    
    # Login as demo owner to get referral code
    login(DEMO_OWNER, "demo")
    demo_me = get_me("demo")
    if not demo_me or not demo_me.get("tenant"):
        print("❌ Failed to get demo tenant info")
        return False
    
    demo_tenant_id = demo_me["tenant"]["id"]
    
    # Get demo's referral code
    print("\n📋 Getting demo tenant's referral code...")
    r = requests.get(f"{BASE_URL}/referrals", headers=get_headers("demo"))
    if r.status_code != 200:
        print(f"❌ GET /referrals failed: {r.status_code}")
        return False
    
    ref_data = r.json()
    referral_code = ref_data.get("code")
    print(f"✅ Demo referral code: {referral_code}")
    
    # Get demo's current quota before signup
    demo_quota_before = demo_me["tenant"]["journal_quota"]["limit"]
    demo_bonus_before = demo_me["tenant"]["journal_quota"].get("top_ups", [])
    demo_stats_before = ref_data.get("stats", {})
    print(f"📊 Demo quota before: {demo_quota_before}")
    print(f"📊 Demo referral stats before: {demo_stats_before}")
    
    # Test 1.1: Public signup WITH referral code
    print("\n🧪 Test 1.1: Public signup WITH referral code")
    signup_data = {
        "name": f"Test Office {int(time.time())}",
        "owner_name": "Test Owner",
        "owner_email": f"test{int(time.time())}@example.com",
        "owner_password": "Test@2025",
        "referral_code": referral_code
    }
    r = requests.post(f"{BASE_URL}/public/signup", json=signup_data)
    if r.status_code != 200:
        print(f"❌ Public signup failed: {r.status_code} {r.text}")
        return False
    
    signup_result = r.json()
    new_tenant = signup_result.get("tenant")
    if not new_tenant:
        print(f"❌ No tenant in signup response")
        return False
    
    # Verify new tenant has quota limit = 30
    new_quota = new_tenant.get("journal_quota", {}).get("limit")
    if new_quota != 30:
        print(f"❌ New tenant quota should be 30, got {new_quota}")
        return False
    print(f"✅ New tenant has quota limit = 30")
    
    # Auto-login should work (session cookie set)
    new_session = r.cookies.get("rahaal_session")
    if not new_session:
        print(f"❌ No auto-login session cookie")
        return False
    print(f"✅ Auto-login session created")
    
    # Verify demo tenant's quota increased by +50
    time.sleep(1)  # Give DB time to update
    demo_me_after = get_me("demo")
    if not demo_me_after:
        print(f"❌ Failed to get demo tenant info after signup")
        return False
    
    demo_quota_after = demo_me_after["tenant"]["journal_quota"]["limit"]
    quota_increase = demo_quota_after - demo_quota_before
    if quota_increase != 50:
        print(f"❌ Demo quota should increase by +50, got +{quota_increase} (before: {demo_quota_before}, after: {demo_quota_after})")
        return False
    print(f"✅ Demo quota increased by exactly +50 (from {demo_quota_before} to {demo_quota_after})")
    
    # Verify referral_stats updated
    r = requests.get(f"{BASE_URL}/referrals", headers=get_headers("demo"))
    ref_data_after = r.json()
    stats_after = ref_data_after.get("stats", {})
    
    if stats_after.get("signups", 0) != demo_stats_before.get("signups", 0) + 1:
        print(f"❌ Referral signups should increment by 1")
        return False
    
    if stats_after.get("bonus_earned", 0) != demo_stats_before.get("bonus_earned", 0) + 50:
        print(f"❌ Referral bonus_earned should increment by 50")
        return False
    
    print(f"✅ Referral stats updated: signups +1, bonus_earned +50")
    
    # Verify NO activation_confirmed step needed (bonus applied immediately)
    top_ups = demo_me_after["tenant"]["journal_quota"].get("top_ups", [])
    latest_topup = top_ups[-1] if top_ups else None
    if not latest_topup or latest_topup.get("amount") != 50:
        print(f"❌ Latest top-up should be 50, got {latest_topup}")
        return False
    if latest_topup.get("by") != "referral_signup":
        print(f"❌ Top-up should be by 'referral_signup', got {latest_topup.get('by')}")
        return False
    print(f"✅ Bonus applied immediately (no activation_confirmed step)")
    
    # Test 1.2: Public signup WITHOUT referral code
    print("\n🧪 Test 1.2: Public signup WITHOUT referral code")
    signup_data2 = {
        "name": f"Test Office No Ref {int(time.time())}",
        "owner_name": "Test Owner 2",
        "owner_email": f"test2{int(time.time())}@example.com",
        "owner_password": "Test@2025"
    }
    r = requests.post(f"{BASE_URL}/public/signup", json=signup_data2)
    if r.status_code != 200:
        print(f"❌ Public signup without ref failed: {r.status_code} {r.text}")
        return False
    
    signup_result2 = r.json()
    new_tenant2 = signup_result2.get("tenant")
    new_quota2 = new_tenant2.get("journal_quota", {}).get("limit")
    if new_quota2 != 30:
        print(f"❌ New tenant without ref should have quota 30, got {new_quota2}")
        return False
    print(f"✅ New tenant without ref has quota limit = 30")
    
    # Verify demo quota did NOT increase again
    demo_me_after2 = get_me("demo")
    demo_quota_after2 = demo_me_after2["tenant"]["journal_quota"]["limit"]
    if demo_quota_after2 != demo_quota_after:
        print(f"❌ Demo quota should not change for signup without ref")
        return False
    print(f"✅ Demo quota unchanged (no referrer bonus applied)")
    
    # Test 1.3: Admin route with referral_code
    print("\n🧪 Test 1.3: Admin route POST /admin/tenants with referral_code")
    admin_tenant_data = {
        "name": f"Admin Created Tenant {int(time.time())}",
        "owner_name": "Admin Owner",
        "owner_email": f"admin{int(time.time())}@example.com",
        "owner_password": "Admin@2025",
        "referral_code": referral_code,
        "quota_limit": 30
    }
    r = requests.post(f"{BASE_URL}/admin/tenants", json=admin_tenant_data, headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Admin tenant creation failed: {r.status_code} {r.text}")
        return False
    
    admin_tenant = r.json()
    admin_quota = admin_tenant.get("journal_quota", {}).get("limit")
    if admin_quota != 30:
        print(f"❌ Admin-created tenant should have quota 30, got {admin_quota}")
        return False
    print(f"✅ Admin-created tenant has quota limit = 30")
    
    # Verify demo quota increased by another +50
    time.sleep(1)
    demo_me_after3 = get_me("demo")
    demo_quota_after3 = demo_me_after3["tenant"]["journal_quota"]["limit"]
    if demo_quota_after3 != demo_quota_after2 + 50:
        print(f"❌ Demo quota should increase by +50 again, got {demo_quota_after3 - demo_quota_after2}")
        return False
    print(f"✅ Demo quota increased by +50 again (admin route)")
    
    print("\n✅ TASK 1 PASSED: Referral simplification working correctly")
    return True

# ============================================================
# TASK 2: Announcements CRUD + Active endpoint
# ============================================================
def test_task2_announcements():
    print("\n" + "="*80)
    print("TASK 2: Announcements CRUD + Active endpoint")
    print("="*80)
    
    # Test 2.1: Create popup announcement
    print("\n🧪 Test 2.1: POST /admin/announcements (popup)")
    popup_data = {
        "type": "popup",
        "title": "اختبار نافذة منبثقة",
        "body": "محتوى الإعلان المنبثق",
        "active": True
    }
    r = requests.post(f"{BASE_URL}/admin/announcements", json=popup_data, headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Create popup announcement failed: {r.status_code} {r.text}")
        return False
    
    popup = r.json()
    popup_id = popup.get("id")
    if not popup_id:
        print(f"❌ No id in popup response")
        return False
    print(f"✅ Popup announcement created with id: {popup_id}")
    
    # Test 2.2: Create banner announcement
    print("\n🧪 Test 2.2: POST /admin/announcements (banner)")
    banner_data = {
        "type": "banner",
        "title": "شريط إعلاني",
        "body": "محتوى الشريط الإعلاني",
        "active": True
    }
    r = requests.post(f"{BASE_URL}/admin/announcements", json=banner_data, headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Create banner announcement failed: {r.status_code} {r.text}")
        return False
    
    banner = r.json()
    banner_id = banner.get("id")
    print(f"✅ Banner announcement created with id: {banner_id}")
    
    # Test 2.3: GET /admin/announcements (list all)
    print("\n🧪 Test 2.3: GET /admin/announcements")
    r = requests.get(f"{BASE_URL}/admin/announcements", headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ GET /admin/announcements failed: {r.status_code}")
        return False
    
    announcements = r.json()
    if not isinstance(announcements, list):
        print(f"❌ Expected list, got {type(announcements)}")
        return False
    
    if len(announcements) < 2:
        print(f"❌ Expected at least 2 announcements, got {len(announcements)}")
        return False
    print(f"✅ GET /admin/announcements returned {len(announcements)} announcements")
    
    # Test 2.4: PUT /admin/announcements/:id (toggle active)
    print("\n🧪 Test 2.4: PUT /admin/announcements/:id (toggle active to false)")
    r = requests.put(f"{BASE_URL}/admin/announcements/{popup_id}", json={"active": False}, headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ PUT announcement failed: {r.status_code} {r.text}")
        return False
    print(f"✅ Popup announcement toggled to inactive")
    
    # Test 2.5: GET /announcements/active (tenant view)
    print("\n🧪 Test 2.5: GET /announcements/active (tenant view)")
    r = requests.get(f"{BASE_URL}/announcements/active", headers=get_headers("demo"))
    if r.status_code != 200:
        print(f"❌ GET /announcements/active failed: {r.status_code}")
        return False
    
    active_announcements = r.json()
    if not isinstance(active_announcements, list):
        print(f"❌ Expected list, got {type(active_announcements)}")
        return False
    
    # Should only return the banner (popup is inactive)
    active_ids = [a.get("id") for a in active_announcements]
    if popup_id in active_ids:
        print(f"❌ Inactive popup should NOT appear in /announcements/active")
        return False
    if banner_id not in active_ids:
        print(f"❌ Active banner should appear in /announcements/active")
        return False
    print(f"✅ /announcements/active returns only active announcements (banner visible, popup hidden)")
    
    # Test 2.6: Date window filtering
    print("\n🧪 Test 2.6: Date window filtering (starts_at = tomorrow)")
    tomorrow = (datetime.now() + timedelta(days=1)).isoformat()
    future_data = {
        "type": "popup",
        "title": "Future announcement",
        "body": "This should not appear yet",
        "active": True,
        "starts_at": tomorrow
    }
    r = requests.post(f"{BASE_URL}/admin/announcements", json=future_data, headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Create future announcement failed: {r.status_code}")
        return False
    future_id = r.json().get("id")
    
    # Should NOT appear in /announcements/active
    r = requests.get(f"{BASE_URL}/announcements/active", headers=get_headers("demo"))
    active_announcements = r.json()
    active_ids = [a.get("id") for a in active_announcements]
    if future_id in active_ids:
        print(f"❌ Future announcement should NOT appear in /announcements/active")
        return False
    print(f"✅ Future announcement (starts_at = tomorrow) does NOT appear in /active")
    
    # Test 2.7: Date window filtering (ends_at = yesterday)
    print("\n🧪 Test 2.7: Date window filtering (ends_at = yesterday)")
    yesterday = (datetime.now() - timedelta(days=1)).isoformat()
    past_data = {
        "type": "banner",
        "title": "Past announcement",
        "body": "This should not appear anymore",
        "active": True,
        "ends_at": yesterday
    }
    r = requests.post(f"{BASE_URL}/admin/announcements", json=past_data, headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Create past announcement failed: {r.status_code}")
        return False
    past_id = r.json().get("id")
    
    # Should NOT appear in /announcements/active
    r = requests.get(f"{BASE_URL}/announcements/active", headers=get_headers("demo"))
    active_announcements = r.json()
    active_ids = [a.get("id") for a in active_announcements]
    if past_id in active_ids:
        print(f"❌ Past announcement should NOT appear in /announcements/active")
        return False
    print(f"✅ Past announcement (ends_at = yesterday) does NOT appear in /active")
    
    # Test 2.8: DELETE /admin/announcements/:id
    print("\n🧪 Test 2.8: DELETE /admin/announcements/:id")
    r = requests.delete(f"{BASE_URL}/admin/announcements/{popup_id}", headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ DELETE announcement failed: {r.status_code}")
        return False
    
    # Verify it's gone
    r = requests.get(f"{BASE_URL}/admin/announcements", headers=get_headers("admin"))
    announcements = r.json()
    remaining_ids = [a.get("id") for a in announcements]
    if popup_id in remaining_ids:
        print(f"❌ Deleted announcement still appears in list")
        return False
    print(f"✅ Announcement deleted successfully")
    
    print("\n✅ TASK 2 PASSED: Announcements CRUD + Active endpoint working correctly")
    return True

# ============================================================
# TASK 3: Suspend/Activate + Impersonate + Plan Tier Gate
# ============================================================
def test_task3_suspend_impersonate_tier():
    print("\n" + "="*80)
    print("TASK 3: Suspend/Activate + Impersonate + Plan Tier Gate")
    print("="*80)
    
    # Get demo tenant ID
    demo_me = get_me("demo")
    demo_tenant_id = demo_me["tenant"]["id"]
    
    # Test 3.1: Suspend tenant
    print("\n🧪 Test 3.1: POST /admin/tenants/:id/toggle-status (suspend)")
    r = requests.post(f"{BASE_URL}/admin/tenants/{demo_tenant_id}/toggle-status", headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Toggle status failed: {r.status_code} {r.text}")
        return False
    
    result = r.json()
    if result.get("status") != "suspended":
        print(f"❌ Expected status 'suspended', got {result.get('status')}")
        return False
    print(f"✅ Demo tenant suspended")
    
    # Test 3.2: Verify demo owner is blocked
    print("\n🧪 Test 3.2: Verify suspended tenant owner cannot access")
    r = requests.get(f"{BASE_URL}/auth/me", headers=get_headers("demo"))
    if r.status_code != 200:
        print(f"❌ GET /auth/me failed: {r.status_code}")
        return False
    
    me_data = r.json()
    if me_data.get("user") is not None:
        print(f"❌ Suspended tenant user should be null")
        return False
    if me_data.get("error") != "suspended":
        print(f"❌ Expected error 'suspended', got {me_data.get('error')}")
        return False
    print(f"✅ Suspended tenant owner blocked (user=null, error='suspended')")
    
    # Test 3.3: Reactivate tenant
    print("\n🧪 Test 3.3: POST /admin/tenants/:id/toggle-status (reactivate)")
    r = requests.post(f"{BASE_URL}/admin/tenants/{demo_tenant_id}/toggle-status", headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Toggle status failed: {r.status_code}")
        return False
    
    result = r.json()
    if result.get("status") != "active":
        print(f"❌ Expected status 'active', got {result.get('status')}")
        return False
    print(f"✅ Demo tenant reactivated")
    
    # Test 3.4: Verify demo owner can access again
    print("\n🧪 Test 3.4: Verify reactivated tenant owner can access")
    r = requests.get(f"{BASE_URL}/auth/me", headers=get_headers("demo"))
    if r.status_code != 200:
        print(f"❌ GET /auth/me failed: {r.status_code}")
        return False
    
    me_data = r.json()
    if me_data.get("user") is None:
        print(f"❌ Reactivated tenant user should not be null")
        return False
    print(f"✅ Reactivated tenant owner can access")
    
    # Test 3.5: Impersonate
    print("\n🧪 Test 3.5: POST /admin/tenants/:id/impersonate")
    r = requests.post(f"{BASE_URL}/admin/tenants/{demo_tenant_id}/impersonate", headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Impersonate failed: {r.status_code} {r.text}")
        return False
    
    impersonate_result = r.json()
    session_id = impersonate_result.get("session_id")
    if not session_id:
        print(f"❌ No session_id in impersonate response")
        return False
    print(f"✅ Impersonation session created: {session_id}")
    
    # Test 3.6: Verify impersonation session
    print("\n🧪 Test 3.6: Verify impersonation session shows impersonation=true")
    impersonate_headers = {"Cookie": f"rahaal_session={session_id}"}
    r = requests.get(f"{BASE_URL}/auth/me", headers=impersonate_headers)
    if r.status_code != 200:
        print(f"❌ GET /auth/me with impersonate session failed: {r.status_code}")
        return False
    
    me_data = r.json()
    if not me_data.get("impersonation"):
        print(f"❌ impersonation should be true")
        return False
    if me_data.get("impersonated_by") != SUPER_ADMIN["email"]:
        print(f"❌ impersonated_by should be {SUPER_ADMIN['email']}, got {me_data.get('impersonated_by')}")
        return False
    print(f"✅ Impersonation session verified (impersonation=true, impersonated_by={SUPER_ADMIN['email']})")
    
    # Test 3.7: Plan Tier Gate - Standard plan cannot create users
    print("\n🧪 Test 3.7: Plan Tier Gate - Standard plan cannot create users")
    # Verify demo tenant is standard plan
    demo_me = get_me("demo")
    plan_tier = demo_me["tenant"].get("plan_tier", "standard")
    if plan_tier != "standard":
        print(f"⚠️ Demo tenant is not standard plan ({plan_tier}), setting to standard...")
        r = requests.patch(f"{BASE_URL}/admin/tenants/{demo_tenant_id}", 
                          json={"plan_tier": "standard"}, 
                          headers=get_headers("admin"))
        if r.status_code != 200:
            print(f"❌ Failed to set plan_tier to standard: {r.status_code}")
            return False
    
    # Try to create user as demo owner (standard plan)
    user_data = {
        "name": "Test User",
        "email": f"testuser{int(time.time())}@example.com",
        "password": "Test@2025",
        "role": "staff"
    }
    r = requests.post(f"{BASE_URL}/tenant/users", json=user_data, headers=get_headers("demo"))
    if r.status_code != 403:
        print(f"❌ Expected 403, got {r.status_code}")
        return False
    
    error_msg = r.json().get("error", "")
    if "Gold" not in error_msg:
        print(f"❌ Error message should mention Gold plan, got: {error_msg}")
        return False
    print(f"✅ Standard plan blocked from creating users (403 with Arabic error about Gold plan)")
    
    # Test 3.8: Upgrade to Gold and retry
    print("\n🧪 Test 3.8: Upgrade to Gold plan and retry user creation")
    r = requests.patch(f"{BASE_URL}/admin/tenants/{demo_tenant_id}", 
                      json={"plan_tier": "gold", "max_users": 10}, 
                      headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Failed to upgrade to gold: {r.status_code}")
        return False
    print(f"✅ Demo tenant upgraded to Gold plan")
    
    # Retry user creation
    user_data2 = {
        "name": "Test User Gold",
        "email": f"testusergold{int(time.time())}@example.com",
        "password": "Test@2025",
        "role": "staff"
    }
    r = requests.post(f"{BASE_URL}/tenant/users", json=user_data2, headers=get_headers("demo"))
    if r.status_code != 200:
        print(f"❌ User creation failed on Gold plan: {r.status_code} {r.text}")
        return False
    print(f"✅ User creation succeeded on Gold plan")
    
    # Test 3.9: Downgrade back to standard for cleanup
    print("\n🧪 Test 3.9: Downgrade back to standard for cleanup")
    r = requests.patch(f"{BASE_URL}/admin/tenants/{demo_tenant_id}", 
                      json={"plan_tier": "standard"}, 
                      headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Failed to downgrade to standard: {r.status_code}")
        return False
    print(f"✅ Demo tenant downgraded back to standard")
    
    print("\n✅ TASK 3 PASSED: Suspend/Activate + Impersonate + Plan Tier Gate working correctly")
    return True

# ============================================================
# TASK 4: Subscription Plans + Quota-Exceeded Flag
# ============================================================
def test_task4_plans_quota_exceeded():
    print("\n" + "="*80)
    print("TASK 4: Subscription Plans + Quota-Exceeded Flag")
    print("="*80)
    
    # Test 4.1: GET /plans (tenant view)
    print("\n🧪 Test 4.1: GET /plans (tenant view)")
    r = requests.get(f"{BASE_URL}/plans", headers=get_headers("demo"))
    if r.status_code != 200:
        print(f"❌ GET /plans failed: {r.status_code}")
        return False
    
    plans = r.json()
    if not isinstance(plans, list):
        print(f"❌ Expected list, got {type(plans)}")
        return False
    
    if len(plans) != 3:
        print(f"❌ Expected 3 plans, got {len(plans)}")
        return False
    
    plan_ids = [p.get("id") for p in plans]
    expected_ids = ["voucher_pack_500", "gold_monthly", "gold_annual"]
    for expected_id in expected_ids:
        if expected_id not in plan_ids:
            print(f"❌ Expected plan {expected_id} not found")
            return False
    
    # Verify prices
    voucher_pack = next((p for p in plans if p.get("id") == "voucher_pack_500"), None)
    if not voucher_pack or voucher_pack.get("price_usd") != 50:
        print(f"❌ voucher_pack_500 should have price_usd=50")
        return False
    
    print(f"✅ GET /plans returns 3 active plans with correct IDs and prices")
    
    # Test 4.2: GET /admin/plans
    print("\n🧪 Test 4.2: GET /admin/plans")
    r = requests.get(f"{BASE_URL}/admin/plans", headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ GET /admin/plans failed: {r.status_code}")
        return False
    
    admin_plans = r.json()
    if len(admin_plans) != 3:
        print(f"❌ Expected 3 plans, got {len(admin_plans)}")
        return False
    print(f"✅ GET /admin/plans returns 3 plans")
    
    # Test 4.3: PUT /admin/plans (update price)
    print("\n🧪 Test 4.3: PUT /admin/plans (update voucher_pack_500 price to 60)")
    update_data = {
        "id": "voucher_pack_500",
        "price_usd": 60
    }
    r = requests.put(f"{BASE_URL}/admin/plans", json=update_data, headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ PUT /admin/plans failed: {r.status_code} {r.text}")
        return False
    print(f"✅ Plan price updated")
    
    # Verify update
    r = requests.get(f"{BASE_URL}/admin/plans", headers=get_headers("admin"))
    plans = r.json()
    voucher_pack = next((p for p in plans if p.get("id") == "voucher_pack_500"), None)
    if not voucher_pack or voucher_pack.get("price_usd") != 60:
        print(f"❌ Price should be 60, got {voucher_pack.get('price_usd')}")
        return False
    print(f"✅ Price verified as 60")
    
    # Test 4.4: Restore price back to 50
    print("\n🧪 Test 4.4: Restore price back to 50")
    restore_data = {
        "id": "voucher_pack_500",
        "price_usd": 50
    }
    r = requests.put(f"{BASE_URL}/admin/plans", json=restore_data, headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ PUT /admin/plans failed: {r.status_code}")
        return False
    print(f"✅ Price restored to 50")
    
    # Test 4.5: Quota exceeded response flag
    print("\n🧪 Test 4.5: Quota exceeded response flag test")
    
    # Create a temp tenant with quota_limit = 2
    print("  Creating temp tenant with quota_limit=2...")
    temp_tenant_data = {
        "name": f"Temp Quota Test {int(time.time())}",
        "owner_name": "Temp Owner",
        "owner_email": f"temp{int(time.time())}@example.com",
        "owner_password": "Temp@2025",
        "quota_limit": 2
    }
    r = requests.post(f"{BASE_URL}/admin/tenants", json=temp_tenant_data, headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"❌ Failed to create temp tenant: {r.status_code}")
        return False
    
    temp_tenant = r.json()
    temp_tenant_id = temp_tenant.get("id")
    print(f"  ✅ Temp tenant created: {temp_tenant_id}")
    
    # Login as temp tenant owner
    temp_creds = {
        "email": temp_tenant_data["owner_email"],
        "password": temp_tenant_data["owner_password"]
    }
    login(temp_creds, "temp")
    
    # Create 2 tickets to consume quota
    print("  Creating 2 tickets to consume quota...")
    
    # First, create client and supplier
    client_data = {"name": "Temp Client", "phone": "123"}
    r = requests.post(f"{BASE_URL}/clients", json=client_data, headers=get_headers("temp"))
    if r.status_code != 200:
        print(f"❌ Failed to create client: {r.status_code}")
        return False
    temp_client_id = r.json().get("id")
    
    supplier_data = {"name": "Temp Supplier", "phone": "456"}
    r = requests.post(f"{BASE_URL}/suppliers", json=supplier_data, headers=get_headers("temp"))
    if r.status_code != 200:
        print(f"❌ Failed to create supplier: {r.status_code}")
        return False
    temp_supplier_id = r.json().get("id")
    
    # Create 2 tickets
    for i in range(2):
        ticket_data = {
            "client_id": temp_client_id,
            "supplier_id": temp_supplier_id,
            "currency": "USD",
            "cost": 100,
            "sale_price": 150,
            "pnr": f"TEMP{i+1}",
            "route": "Test Route"
        }
        r = requests.post(f"{BASE_URL}/tickets", json=ticket_data, headers=get_headers("temp"))
        if r.status_code != 200:
            print(f"❌ Failed to create ticket {i+1}: {r.status_code}")
            return False
    print(f"  ✅ Created 2 tickets (quota consumed)")
    
    # Attempt to create 3rd ticket (should fail with 402)
    print("  Attempting to create 3rd ticket (should fail with 402)...")
    ticket_data3 = {
        "client_id": temp_client_id,
        "supplier_id": temp_supplier_id,
        "currency": "USD",
        "cost": 100,
        "sale_price": 150,
        "pnr": "TEMP3",
        "route": "Test Route"
    }
    r = requests.post(f"{BASE_URL}/tickets", json=ticket_data3, headers=get_headers("temp"))
    if r.status_code != 402:
        print(f"❌ Expected 402, got {r.status_code}")
        return False
    
    error_response = r.json()
    if not error_response.get("quota_exceeded"):
        print(f"❌ Response should have quota_exceeded=true")
        return False
    if error_response.get("code") != "QUOTA_EXCEEDED":
        print(f"❌ Response should have code='QUOTA_EXCEEDED'")
        return False
    if not error_response.get("error"):
        print(f"❌ Response should have error message")
        return False
    
    print(f"✅ 3rd ticket blocked with 402, quota_exceeded=true, code='QUOTA_EXCEEDED', Arabic error message")
    
    # Cleanup: Delete temp tenant
    print("  Cleaning up temp tenant...")
    r = requests.delete(f"{BASE_URL}/admin/tenants/{temp_tenant_id}", headers=get_headers("admin"))
    if r.status_code != 200:
        print(f"⚠️ Failed to delete temp tenant: {r.status_code}")
    else:
        print(f"  ✅ Temp tenant deleted")
    
    print("\n✅ TASK 4 PASSED: Subscription Plans + Quota-Exceeded Flag working correctly")
    return True

# ============================================================
# REGRESSION TESTS
# ============================================================
def test_regression():
    print("\n" + "="*80)
    print("REGRESSION TESTS (ensure v2.7 and earlier still work)")
    print("="*80)
    
    # Test health endpoint
    print("\n🧪 Regression: GET /health")
    r = requests.get(f"{BASE_URL}/health")
    if r.status_code != 200:
        print(f"❌ Health check failed: {r.status_code}")
        return False
    
    health = r.json()
    if health.get("status") != "ok":
        print(f"❌ Health status should be 'ok', got {health.get('status')}")
        return False
    
    version = health.get("version")
    if not version or version < "2.7":
        print(f"⚠️ Version should be 2.7 or newer, got {version}")
    
    print(f"✅ Health endpoint working (status=ok, version={version})")
    
    # Test ticket creation (basic flow)
    print("\n🧪 Regression: Create/edit ticket flow")
    
    # Get clients and suppliers
    r = requests.get(f"{BASE_URL}/clients", headers=get_headers("demo"))
    clients = r.json()
    if not clients:
        print(f"❌ No clients found")
        return False
    client_id = clients[0].get("id")
    
    r = requests.get(f"{BASE_URL}/suppliers", headers=get_headers("demo"))
    suppliers = r.json()
    if not suppliers:
        print(f"❌ No suppliers found")
        return False
    supplier_id = suppliers[0].get("id")
    
    # Create ticket
    ticket_data = {
        "client_id": client_id,
        "supplier_id": supplier_id,
        "currency": "USD",
        "cost": 100,
        "sale_price": 150,
        "pnr": f"REG{int(time.time())}",
        "route": "Regression Test"
    }
    r = requests.post(f"{BASE_URL}/tickets", json=ticket_data, headers=get_headers("demo"))
    if r.status_code != 200:
        print(f"❌ Ticket creation failed: {r.status_code}")
        return False
    
    ticket = r.json()
    ticket_id = ticket.get("id")
    print(f"✅ Ticket created successfully")
    
    # Edit ticket
    edit_data = {
        "client_id": client_id,
        "supplier_id": supplier_id,
        "currency": "USD",
        "cost": 120,
        "sale_price": 180,
        "pnr": ticket.get("pnr"),
        "route": "Regression Test Edited"
    }
    r = requests.put(f"{BASE_URL}/tickets/{ticket_id}", json=edit_data, headers=get_headers("demo"))
    if r.status_code != 200:
        print(f"❌ Ticket edit failed: {r.status_code}")
        return False
    print(f"✅ Ticket edited successfully")
    
    # Cleanup
    r = requests.delete(f"{BASE_URL}/tickets/{ticket_id}", headers=get_headers("demo"))
    if r.status_code != 200:
        print(f"⚠️ Ticket cleanup failed: {r.status_code}")
    
    print("\n✅ REGRESSION TESTS PASSED")
    return True

# ============================================================
# MAIN TEST RUNNER
# ============================================================
def main():
    print("\n" + "="*80)
    print("🚀 v2.8 BACKEND TESTING SUITE — Rahaal ERP")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Super Admin: {SUPER_ADMIN['email']}")
    print(f"Demo Owner: {DEMO_OWNER['email']}")
    
    results = {}
    
    try:
        # Run all tests
        results["Task 1: Referral Simplification"] = test_task1_referral_simplification()
        results["Task 2: Announcements CRUD"] = test_task2_announcements()
        results["Task 3: Suspend/Impersonate/Tier"] = test_task3_suspend_impersonate_tier()
        results["Task 4: Plans + Quota-Exceeded"] = test_task4_plans_quota_exceeded()
        results["Regression Tests"] = test_regression()
        
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Print summary
    print("\n" + "="*80)
    print("📊 TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status} - {test_name}")
    
    all_passed = all(results.values())
    
    print("\n" + "="*80)
    if all_passed:
        print("🎉 ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("="*80)
    
    return all_passed

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
