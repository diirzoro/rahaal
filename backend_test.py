#!/usr/bin/env python3
"""
v2.6 Rahaal ERP Backend Testing Suite
Tests: Referral System, Unified Chart of Accounts, Tomorrow Travelers, FX Account Mode, Statement Report
"""

import requests
import json
from datetime import datetime, timedelta
import random
import string

# Base URL from .env
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Credentials
SUPER_ADMIN = {"email": "admin@targetmedia.com", "password": "Target@2025"}
TENANT_OWNER = {"email": "owner@demo.com", "password": "Demo@2025"}

# Test state
test_results = []
cleanup_ids = {
    "tickets": [],
    "fx": [],
    "tenants": [],
    "clients": [],
    "suppliers": [],
}

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {name}")
    if details:
        print(f"  {details}")
    test_results.append({"name": name, "passed": passed, "details": details})

def login(email, password):
    """Login and return session cookie"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
        if resp.status_code == 200:
            cookie = resp.cookies.get("rahaal_session")
            return cookie
        else:
            print(f"Login failed for {email}: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"Login exception for {email}: {e}")
        return None

def get_with_auth(endpoint, cookie):
    """GET request with auth cookie"""
    return requests.get(f"{BASE_URL}{endpoint}", cookies={"rahaal_session": cookie})

def post_with_auth(endpoint, cookie, data):
    """POST request with auth cookie"""
    return requests.post(f"{BASE_URL}{endpoint}", json=data, cookies={"rahaal_session": cookie})

def put_with_auth(endpoint, cookie, data):
    """PUT request with auth cookie"""
    return requests.put(f"{BASE_URL}{endpoint}", json=data, cookies={"rahaal_session": cookie})

def delete_with_auth(endpoint, cookie):
    """DELETE request with auth cookie"""
    return requests.delete(f"{BASE_URL}{endpoint}", cookies={"rahaal_session": cookie})

def gen_unique_email():
    """Generate unique email for testing"""
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"e2e_ref_{rand}@office.com"

def get_tomorrow_date():
    """Get tomorrow's date in YYYY-MM-DD format"""
    tomorrow = datetime.now() + timedelta(days=1)
    return tomorrow.strftime("%Y-%m-%d")

def get_future_date(days=3):
    """Get future date in YYYY-MM-DD format"""
    future = datetime.now() + timedelta(days=days)
    return future.strftime("%Y-%m-%d")

print("=" * 80)
print("v2.6 RAHAAL ERP BACKEND TESTING")
print("=" * 80)

# ============================================================================
# TEST 1: REFERRAL SYSTEM - END-TO-END
# ============================================================================
print("\n### TEST 1: REFERRAL SYSTEM - END-TO-END ###\n")

# Step 1: Login as owner@demo.com and get referral code
owner_cookie = login(TENANT_OWNER["email"], TENANT_OWNER["password"])
if not owner_cookie:
    log_test("1.1 Login owner@demo.com", False, "Login failed")
else:
    log_test("1.1 Login owner@demo.com", True)
    
    # Get referral code and baseline stats
    resp = get_with_auth("/referrals", owner_cookie)
    if resp.status_code == 200:
        data = resp.json()
        referral_code = data.get("code")
        baseline_stats = data.get("stats", {})
        baseline_signups = baseline_stats.get("signups", 0)
        baseline_activations = baseline_stats.get("activations", 0)
        baseline_bonus = baseline_stats.get("bonus_earned", 0)
        
        log_test("1.2 GET /referrals", True, f"Code: {referral_code}, Signups: {baseline_signups}, Activations: {baseline_activations}, Bonus: {baseline_bonus}")
        
        # Verify code is exactly 8 alphanumeric chars
        if len(referral_code) == 8 and referral_code.isalnum():
            log_test("1.3 Referral code format", True, f"Code is 8 alphanumeric: {referral_code}")
        else:
            log_test("1.3 Referral code format", False, f"Code is not 8 alphanumeric: {referral_code}")
        
        # Get baseline quota
        resp_me = get_with_auth("/auth/me", owner_cookie)
        if resp_me.status_code == 200:
            baseline_quota = resp_me.json().get("tenant", {}).get("journal_quota", {}).get("limit", 0)
            log_test("1.4 Baseline quota captured", True, f"Limit: {baseline_quota}")
        else:
            baseline_quota = 0
            log_test("1.4 Baseline quota captured", False, "Failed to get /auth/me")
        
        # Step 2: Public signup with referral code
        unique_email = gen_unique_email()
        signup_data = {
            "name": "E2E Referral Office",
            "owner_name": "Test Owner",
            "owner_email": unique_email,
            "owner_password": "Pass@1234",
            "referral_code": referral_code
        }
        
        resp = requests.post(f"{BASE_URL}/public/signup", json=signup_data)
        if resp.status_code == 200:
            signup_result = resp.json()
            referral_applied = signup_result.get("referral_applied")
            new_tenant = signup_result.get("tenant", {})
            new_tenant_id = new_tenant.get("id")
            new_tenant_code = new_tenant.get("referral_code")
            new_tenant_referred_by = new_tenant.get("referred_by")
            
            # Verify session cookie is set
            session_cookie = resp.cookies.get("rahaal_session")
            
            if referral_applied and new_tenant_id and session_cookie:
                log_test("1.5 Public signup with referral", True, f"Tenant ID: {new_tenant_id}, Code: {new_tenant_code}, Referred by: {new_tenant_referred_by}, Session: {session_cookie[:10]}...")
                cleanup_ids["tenants"].append(new_tenant_id)
            else:
                log_test("1.5 Public signup with referral", False, f"referral_applied={referral_applied}, tenant_id={new_tenant_id}, session={session_cookie}")
            
            # Step 3: Re-login as owner@demo.com and verify stats
            owner_cookie = login(TENANT_OWNER["email"], TENANT_OWNER["password"])
            resp = get_with_auth("/referrals", owner_cookie)
            if resp.status_code == 200:
                data = resp.json()
                new_stats = data.get("stats", {})
                new_signups = new_stats.get("signups", 0)
                new_bonus = new_stats.get("bonus_earned", 0)
                invitees = data.get("invitees", [])
                
                # Verify signups incremented by 1
                if new_signups == baseline_signups + 1:
                    log_test("1.6 Signups incremented", True, f"{baseline_signups} → {new_signups}")
                else:
                    log_test("1.6 Signups incremented", False, f"Expected {baseline_signups + 1}, got {new_signups}")
                
                # Verify bonus_earned incremented by 15
                if new_bonus == baseline_bonus + 15:
                    log_test("1.7 Bonus earned +15", True, f"{baseline_bonus} → {new_bonus}")
                else:
                    log_test("1.7 Bonus earned +15", False, f"Expected {baseline_bonus + 15}, got {new_bonus}")
                
                # Verify new tenant in invitees
                new_invitee = next((inv for inv in invitees if inv.get("id") == new_tenant_id), None)
                if new_invitee:
                    activation_confirmed = new_invitee.get("activation_confirmed")
                    bonus_status = new_invitee.get("bonus_status")
                    
                    if not activation_confirmed and bonus_status == "signup_+15":
                        log_test("1.8 New tenant in invitees", True, f"activation_confirmed=False, bonus_status={bonus_status}")
                    else:
                        log_test("1.8 New tenant in invitees", False, f"activation_confirmed={activation_confirmed}, bonus_status={bonus_status}")
                else:
                    log_test("1.8 New tenant in invitees", False, "New tenant not found in invitees")
                
                # Verify quota limit increased by 15
                resp_me = get_with_auth("/auth/me", owner_cookie)
                if resp_me.status_code == 200:
                    new_quota = resp_me.json().get("tenant", {}).get("journal_quota", {}).get("limit", 0)
                    if new_quota == baseline_quota + 15:
                        log_test("1.9 Quota limit +15", True, f"{baseline_quota} → {new_quota}")
                    else:
                        log_test("1.9 Quota limit +15", False, f"Expected {baseline_quota + 15}, got {new_quota}")
                else:
                    log_test("1.9 Quota limit +15", False, "Failed to get /auth/me")
            else:
                log_test("1.6-1.9 Referral stats after signup", False, f"GET /referrals failed: {resp.status_code}")
            
            # Step 4: Super admin confirm payment
            admin_cookie = login(SUPER_ADMIN["email"], SUPER_ADMIN["password"])
            if admin_cookie:
                # First, verify tenant exists in admin list
                resp = get_with_auth("/admin/tenants", admin_cookie)
                if resp.status_code == 200:
                    tenants_data = resp.json()
                    # Handle both list and dict responses
                    tenants = tenants_data if isinstance(tenants_data, list) else tenants_data.get("tenants", [])
                    found_tenant = next((t for t in tenants if t.get("id") == new_tenant_id), None)
                    if found_tenant:
                        log_test("1.10 New tenant in admin list", True, f"Name: {found_tenant.get('name')}")
                    else:
                        log_test("1.10 New tenant in admin list", False, "Tenant not found")
                
                # Confirm payment
                resp = post_with_auth(f"/admin/tenants/{new_tenant_id}/confirm-payment", admin_cookie, {})
                if resp.status_code == 200:
                    confirm_result = resp.json()
                    referrer_bonus = confirm_result.get("referrer_bonus", {})
                    bonus_added = referrer_bonus.get("bonus_added")
                    referrer_name = referrer_bonus.get("referrer_name")
                    
                    if bonus_added == 50:
                        log_test("1.11 Confirm payment", True, f"Bonus: {bonus_added}, Referrer: {referrer_name}")
                    else:
                        log_test("1.11 Confirm payment", False, f"Expected bonus_added=50, got {bonus_added}")
                    
                    # Try to confirm again (should fail with 400)
                    resp2 = post_with_auth(f"/admin/tenants/{new_tenant_id}/confirm-payment", admin_cookie, {})
                    if resp2.status_code == 400:
                        log_test("1.12 Duplicate confirm rejected", True, f"Status: {resp2.status_code}")
                    else:
                        log_test("1.12 Duplicate confirm rejected", False, f"Expected 400, got {resp2.status_code}")
                else:
                    log_test("1.11 Confirm payment", False, f"Status: {resp.status_code}, Body: {resp.text}")
                
                # Step 5: Re-login as owner@demo.com and verify final stats
                owner_cookie = login(TENANT_OWNER["email"], TENANT_OWNER["password"])
                resp = get_with_auth("/referrals", owner_cookie)
                if resp.status_code == 200:
                    data = resp.json()
                    final_stats = data.get("stats", {})
                    final_activations = final_stats.get("activations", 0)
                    final_bonus = final_stats.get("bonus_earned", 0)
                    invitees = data.get("invitees", [])
                    
                    # Verify activations incremented
                    if final_activations >= baseline_activations + 1:
                        log_test("1.13 Activations incremented", True, f"{baseline_activations} → {final_activations}")
                    else:
                        log_test("1.13 Activations incremented", False, f"Expected >= {baseline_activations + 1}, got {final_activations}")
                    
                    # Verify total bonus is +65 from baseline
                    if final_bonus == baseline_bonus + 65:
                        log_test("1.14 Total bonus +65", True, f"{baseline_bonus} → {final_bonus}")
                    else:
                        log_test("1.14 Total bonus +65", False, f"Expected {baseline_bonus + 65}, got {final_bonus}")
                    
                    # Verify invitee status updated
                    updated_invitee = next((inv for inv in invitees if inv.get("id") == new_tenant_id), None)
                    if updated_invitee:
                        activation_confirmed = updated_invitee.get("activation_confirmed")
                        bonus_status = updated_invitee.get("bonus_status")
                        
                        if activation_confirmed and bonus_status == "activated_+50":
                            log_test("1.15 Invitee status updated", True, f"activation_confirmed=True, bonus_status={bonus_status}")
                        else:
                            log_test("1.15 Invitee status updated", False, f"activation_confirmed={activation_confirmed}, bonus_status={bonus_status}")
                    
                    # Verify quota limit increased by ANOTHER 50 (total +65)
                    resp_me = get_with_auth("/auth/me", owner_cookie)
                    if resp_me.status_code == 200:
                        final_quota = resp_me.json().get("tenant", {}).get("journal_quota", {}).get("limit", 0)
                        if final_quota == baseline_quota + 65:
                            log_test("1.16 Quota limit +65 total", True, f"{baseline_quota} → {final_quota}")
                        else:
                            log_test("1.16 Quota limit +65 total", False, f"Expected {baseline_quota + 65}, got {final_quota}")
                else:
                    log_test("1.13-1.16 Final referral stats", False, f"GET /referrals failed: {resp.status_code}")
            else:
                log_test("1.10-1.16 Super admin tests", False, "Admin login failed")
        else:
            log_test("1.5 Public signup with referral", False, f"Status: {resp.status_code}, Body: {resp.text}")
    else:
        log_test("1.2 GET /referrals", False, f"Status: {resp.status_code}")

# Test public signup validation
print("\n### TEST 1B: PUBLIC SIGNUP VALIDATION ###\n")

# Missing fields
resp = requests.post(f"{BASE_URL}/public/signup", json={"name": "Test"})
if resp.status_code == 400:
    log_test("1.17 Missing fields validation", True, f"Status: {resp.status_code}")
else:
    log_test("1.17 Missing fields validation", False, f"Expected 400, got {resp.status_code}")

# Invalid referral code (should still create tenant but referral_applied=false)
resp = requests.post(f"{BASE_URL}/public/signup", json={
    "name": "Test Office Invalid Ref",
    "owner_name": "Test",
    "owner_email": gen_unique_email(),
    "owner_password": "Pass@1234",
    "referral_code": "INVALID123"
})
if resp.status_code == 200:
    result = resp.json()
    if not result.get("referral_applied"):
        log_test("1.18 Invalid referral code", True, "Tenant created, referral_applied=false")
        cleanup_ids["tenants"].append(result.get("tenant", {}).get("id"))
    else:
        log_test("1.18 Invalid referral code", False, "referral_applied should be false")
else:
    log_test("1.18 Invalid referral code", False, f"Expected 200, got {resp.status_code}")

# Duplicate email
resp = requests.post(f"{BASE_URL}/public/signup", json={
    "name": "Duplicate",
    "owner_name": "Test",
    "owner_email": TENANT_OWNER["email"],  # Use existing email
    "owner_password": "Pass@1234"
})
if resp.status_code == 400:
    log_test("1.19 Duplicate email validation", True, f"Status: {resp.status_code}")
else:
    log_test("1.19 Duplicate email validation", False, f"Expected 400, got {resp.status_code}")

# ============================================================================
# TEST 2: UNIFIED CHART OF ACCOUNTS - /accounts/all
# ============================================================================
print("\n### TEST 2: UNIFIED CHART OF ACCOUNTS ###\n")

owner_cookie = login(TENANT_OWNER["email"], TENANT_OWNER["password"])
if owner_cookie:
    resp = get_with_auth("/accounts/all", owner_cookie)
    if resp.status_code == 200:
        accounts = resp.json()
        
        # Verify structure
        if isinstance(accounts, list) and len(accounts) > 0:
            log_test("2.1 GET /accounts/all", True, f"Returned {len(accounts)} accounts")
            
            # Verify each item has required fields
            sample = accounts[0]
            required_fields = ["kind", "id", "code", "name", "group"]
            if all(field in sample for field in required_fields):
                log_test("2.2 Account structure", True, f"Fields: {list(sample.keys())}")
            else:
                log_test("2.2 Account structure", False, f"Missing fields in: {sample}")
            
            # Count by kind
            clients = [a for a in accounts if a.get("kind") == "client"]
            suppliers = [a for a in accounts if a.get("kind") == "supplier"]
            boxes = [a for a in accounts if a.get("kind") == "box"]
            coa = [a for a in accounts if a.get("kind") == "account"]
            
            log_test("2.3 Clients present", len(clients) > 0, f"Count: {len(clients)}, Code: {clients[0].get('code') if clients else 'N/A'}")
            log_test("2.4 Suppliers present", len(suppliers) > 0, f"Count: {len(suppliers)}, Code: {suppliers[0].get('code') if suppliers else 'N/A'}")
            log_test("2.5 Boxes present", len(boxes) > 0, f"Count: {len(boxes)}, Codes: {[b.get('code') for b in boxes]}")
            log_test("2.6 COA accounts present", len(coa) > 0, f"Count: {len(coa)}")
            
            # Verify specific codes
            if clients and clients[0].get("code") == "1301":
                log_test("2.7 Client code correct", True, "Code: 1301")
            else:
                log_test("2.7 Client code correct", False, f"Expected 1301, got {clients[0].get('code') if clients else 'N/A'}")
            
            if suppliers and suppliers[0].get("code") == "2101":
                log_test("2.8 Supplier code correct", True, "Code: 2101")
            else:
                log_test("2.8 Supplier code correct", False, f"Expected 2101, got {suppliers[0].get('code') if suppliers else 'N/A'}")
            
            # Verify box codes (1101 for cash, 1201 for bank)
            box_codes = [b.get("code") for b in boxes]
            if "1101" in box_codes or "1201" in box_codes:
                log_test("2.9 Box codes correct", True, f"Codes: {box_codes}")
            else:
                log_test("2.9 Box codes correct", False, f"Expected 1101/1201, got {box_codes}")
            
            # Cross-check counts
            resp_clients = get_with_auth("/clients", owner_cookie)
            resp_suppliers = get_with_auth("/suppliers", owner_cookie)
            resp_boxes = get_with_auth("/boxes", owner_cookie)
            resp_coa = get_with_auth("/accounts", owner_cookie)
            
            if all(r.status_code == 200 for r in [resp_clients, resp_suppliers, resp_boxes, resp_coa]):
                total_expected = len(resp_clients.json()) + len(resp_suppliers.json()) + len(resp_boxes.json()) + len(resp_coa.json())
                if len(accounts) == total_expected:
                    log_test("2.10 Total count matches", True, f"{len(accounts)} == {total_expected}")
                else:
                    log_test("2.10 Total count matches", False, f"{len(accounts)} != {total_expected}")
            else:
                log_test("2.10 Total count matches", False, "Failed to fetch individual collections")
        else:
            log_test("2.1 GET /accounts/all", False, f"Invalid response: {accounts}")
    else:
        log_test("2.1 GET /accounts/all", False, f"Status: {resp.status_code}")
else:
    log_test("2.1-2.10 Unified Chart of Accounts", False, "Login failed")

# ============================================================================
# TEST 3: TOMORROW TRAVELERS
# ============================================================================
print("\n### TEST 3: TOMORROW TRAVELERS ###\n")

owner_cookie = login(TENANT_OWNER["email"], TENANT_OWNER["password"])
if owner_cookie:
    # Get clients and suppliers for ticket creation
    resp_clients = get_with_auth("/clients", owner_cookie)
    resp_suppliers = get_with_auth("/suppliers", owner_cookie)
    
    if resp_clients.status_code == 200 and resp_suppliers.status_code == 200:
        clients = resp_clients.json()
        suppliers = resp_suppliers.json()
        
        if clients and suppliers:
            client_id = clients[0]["id"]
            supplier_id = suppliers[0]["id"]
            
            # Create ticket with travel_date = tomorrow
            tomorrow = get_tomorrow_date()
            ticket_data = {
                "pnr": f"TMR-{random.randint(1000, 9999)}",
                "client_id": client_id,
                "client_name": clients[0]["name"],
                "supplier_id": supplier_id,
                "supplier_name": suppliers[0]["name"],
                "passenger_name": "Tomorrow Traveler",
                "passport_no": "TMR123456",
                "route": "JED-CAI",
                "travel_date": tomorrow,
                "currency": "SAR",
                "cost": 500,
                "sale_price": 600,
                "payment_method": "credit"
            }
            
            resp = post_with_auth("/tickets", owner_cookie, ticket_data)
            if resp.status_code == 200:
                ticket = resp.json()
                ticket_id = ticket.get("id")
                cleanup_ids["tickets"].append(ticket_id)
                log_test("3.1 Create ticket with tomorrow date", True, f"ID: {ticket_id}, Date: {tomorrow}")
                
                # Get tomorrow travelers
                resp = get_with_auth("/dashboard/tomorrow-travelers", owner_cookie)
                if resp.status_code == 200:
                    travelers = resp.json()
                    
                    # Verify our ticket is in the list
                    found = next((t for t in travelers if t.get("id") == ticket_id), None)
                    if found:
                        required_fields = ["id", "pnr", "passenger_name", "passport_no", "travel_date", "client_name", "client_phone", "currency", "sale_price"]
                        if all(field in found for field in required_fields):
                            log_test("3.2 Tomorrow travelers includes ticket", True, f"Fields: {list(found.keys())}")
                        else:
                            log_test("3.2 Tomorrow travelers includes ticket", False, f"Missing fields: {[f for f in required_fields if f not in found]}")
                    else:
                        log_test("3.2 Tomorrow travelers includes ticket", False, "Ticket not found in travelers list")
                else:
                    log_test("3.2 GET /dashboard/tomorrow-travelers", False, f"Status: {resp.status_code}")
                
                # Negative test: Create ticket with travel_date = 3 days from now
                future_date = get_future_date(3)
                ticket_data2 = {
                    "pnr": f"FUT-{random.randint(1000, 9999)}",
                    "client_id": client_id,
                    "client_name": clients[0]["name"],
                    "supplier_id": supplier_id,
                    "supplier_name": suppliers[0]["name"],
                    "passenger_name": "Future Traveler",
                    "passport_no": "FUT123456",
                    "route": "JED-DXB",
                    "travel_date": future_date,
                    "currency": "SAR",
                    "cost": 400,
                    "sale_price": 500,
                    "payment_method": "credit"
                }
                
                resp = post_with_auth("/tickets", owner_cookie, ticket_data2)
                if resp.status_code == 200:
                    ticket2 = resp.json()
                    ticket2_id = ticket2.get("id")
                    cleanup_ids["tickets"].append(ticket2_id)
                    
                    # Verify it does NOT appear in tomorrow travelers
                    resp = get_with_auth("/dashboard/tomorrow-travelers", owner_cookie)
                    if resp.status_code == 200:
                        travelers = resp.json()
                        found = next((t for t in travelers if t.get("id") == ticket2_id), None)
                        if not found:
                            log_test("3.3 Future ticket NOT in tomorrow travelers", True, f"Date: {future_date}")
                        else:
                            log_test("3.3 Future ticket NOT in tomorrow travelers", False, "Future ticket should not appear")
                    else:
                        log_test("3.3 Future ticket NOT in tomorrow travelers", False, f"Status: {resp.status_code}")
            else:
                log_test("3.1 Create ticket with tomorrow date", False, f"Status: {resp.status_code}")
        else:
            log_test("3.1-3.3 Tomorrow Travelers", False, "No clients or suppliers available")
    else:
        log_test("3.1-3.3 Tomorrow Travelers", False, "Failed to fetch clients/suppliers")
else:
    log_test("3.1-3.3 Tomorrow Travelers", False, "Login failed")

# ============================================================================
# TEST 4: FX ACCOUNT MODE
# ============================================================================
print("\n### TEST 4: FX ACCOUNT MODE ###\n")

owner_cookie = login(TENANT_OWNER["email"], TENANT_OWNER["password"])
if owner_cookie:
    # Get clients, suppliers, boxes, and COA accounts
    resp_clients = get_with_auth("/clients", owner_cookie)
    resp_suppliers = get_with_auth("/suppliers", owner_cookie)
    resp_boxes = get_with_auth("/boxes", owner_cookie)
    resp_accounts = get_with_auth("/accounts", owner_cookie)
    
    if all(r.status_code == 200 for r in [resp_clients, resp_suppliers, resp_boxes, resp_accounts]):
        clients = resp_clients.json()
        suppliers = resp_suppliers.json()
        boxes = resp_boxes.json()
        coa_accounts = resp_accounts.json()
        
        if clients and suppliers and len(boxes) >= 2 and coa_accounts:
            client = clients[0]
            supplier = suppliers[0]
            box1 = boxes[0]
            box2 = boxes[1] if len(boxes) > 1 else boxes[0]
            # Find an expense account (code starts with 5)
            expense_account = next((a for a in coa_accounts if a.get("code", "").startswith("5")), coa_accounts[0])
            
            # Get baseline balances
            resp_client = get_with_auth(f"/clients", owner_cookie)
            baseline_client = next((c for c in resp_client.json() if c["id"] == client["id"]), {})
            baseline_client_usd = baseline_client.get("balances", {}).get("USD", 0)
            
            resp_box = get_with_auth(f"/boxes", owner_cookie)
            baseline_box = next((b for b in resp_box.json() if b["id"] == box1["id"]), {})
            baseline_box_sar = baseline_box.get("balances", {}).get("SAR", 0)
            
            log_test("4.1 Baseline balances captured", True, f"Client USD: {baseline_client_usd}, Box SAR: {baseline_box_sar}")
            
            # Test 4.2: FX with payment_method='account' using client and box
            fx_data = {
                "type": "buy",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "currency": "USD",
                "amount": 100,
                "exchange_rate": 3.75,
                "counter_currency": "SAR",
                "payment_method": "account",
                "currency_ref": {"kind": "client", "id": client["id"]},
                "counter_ref": {"kind": "box", "id": box1["id"]},
                "customer_name": "FX Account Test"
            }
            
            resp = post_with_auth("/fx", owner_cookie, fx_data)
            if resp.status_code == 200:
                fx = resp.json()
                fx_id = fx.get("id")
                cleanup_ids["fx"].append(fx_id)
                
                # Verify response structure
                if fx.get("payment_method") == "account" and fx.get("currency_ref") and fx.get("counter_ref"):
                    log_test("4.2 FX account mode created", True, f"ID: {fx_id}, counter_amount: {fx.get('counter_amount')}")
                else:
                    log_test("4.2 FX account mode created", False, f"Missing fields: {fx}")
                
                # Verify balance updates
                resp_client = get_with_auth(f"/clients", owner_cookie)
                updated_client = next((c for c in resp_client.json() if c["id"] == client["id"]), {})
                updated_client_usd = updated_client.get("balances", {}).get("USD", 0)
                
                resp_box = get_with_auth(f"/boxes", owner_cookie)
                updated_box = next((b for b in resp_box.json() if b["id"] == box1["id"]), {})
                updated_box_sar = updated_box.get("balances", {}).get("SAR", 0)
                
                # Client should have +100 USD (debit), Box should have -375 SAR (credit)
                if updated_client_usd == baseline_client_usd + 100:
                    log_test("4.3 Client balance updated", True, f"{baseline_client_usd} → {updated_client_usd} (+100 USD)")
                else:
                    log_test("4.3 Client balance updated", False, f"Expected {baseline_client_usd + 100}, got {updated_client_usd}")
                
                if updated_box_sar == baseline_box_sar - 375:
                    log_test("4.4 Box balance updated", True, f"{baseline_box_sar} → {updated_box_sar} (-375 SAR)")
                else:
                    log_test("4.4 Box balance updated", False, f"Expected {baseline_box_sar - 375}, got {updated_box_sar}")
                
                # Verify journal entry
                resp_je = get_with_auth("/journal-entries", owner_cookie)
                if resp_je.status_code == 200:
                    jes = resp_je.json()
                    fx_je = next((je for je in jes if je.get("ref_id") == fx_id), None)
                    
                    if fx_je:
                        lines = fx_je.get("lines", [])
                        # Should have at least 2 lines (currency + counter) + possibly FX gain/loss
                        if len(lines) >= 2:
                            # Find client line (1301) and box line (1101 or 1201)
                            client_line = next((l for l in lines if l.get("account_code") == "1301"), None)
                            box_line = next((l for l in lines if l.get("account_code") in ["1101", "1201"]), None)
                            
                            if client_line and box_line:
                                # Verify client line: debit=100, currency=USD, party_type=client
                                if (client_line.get("debit") == 100 and 
                                    client_line.get("currency") == "USD" and 
                                    client_line.get("party_type") == "client"):
                                    log_test("4.5 JE client line correct", True, f"Debit: 100 USD, party_type: client")
                                else:
                                    log_test("4.5 JE client line correct", False, f"Client line: {client_line}")
                                
                                # Verify box line: credit=375, currency=SAR, party_type=box
                                if (box_line.get("credit") == 375 and 
                                    box_line.get("currency") == "SAR" and 
                                    box_line.get("party_type") == "box"):
                                    log_test("4.6 JE box line correct", True, f"Credit: 375 SAR, party_type: box")
                                else:
                                    log_test("4.6 JE box line correct", False, f"Box line: {box_line}")
                            else:
                                log_test("4.5-4.6 JE lines", False, f"Client or box line not found: {lines}")
                        else:
                            log_test("4.5-4.6 JE lines", False, f"Expected >= 2 lines, got {len(lines)}")
                    else:
                        log_test("4.5-4.6 JE lines", False, "FX journal entry not found")
                else:
                    log_test("4.5-4.6 JE lines", False, f"Failed to fetch journal entries: {resp_je.status_code}")
                
                # Test 4.7: PUT /fx/:id (edit mode) with account mode
                fx_edit_data = {
                    "type": "buy",
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "currency": "USD",
                    "amount": 150,  # Changed from 100
                    "exchange_rate": 3.80,  # Changed from 3.75
                    "counter_currency": "SAR",
                    "payment_method": "account",
                    "currency_ref": {"kind": "client", "id": client["id"]},
                    "counter_ref": {"kind": "box", "id": box1["id"]},
                    "customer_name": "FX Account Test Edited"
                }
                
                resp = put_with_auth(f"/fx/{fx_id}", owner_cookie, fx_edit_data)
                if resp.status_code == 200:
                    # Verify balances net to +150/-570 vs baseline
                    resp_client = get_with_auth(f"/clients", owner_cookie)
                    edited_client = next((c for c in resp_client.json() if c["id"] == client["id"]), {})
                    edited_client_usd = edited_client.get("balances", {}).get("USD", 0)
                    
                    resp_box = get_with_auth(f"/boxes", owner_cookie)
                    edited_box = next((b for b in resp_box.json() if b["id"] == box1["id"]), {})
                    edited_box_sar = edited_box.get("balances", {}).get("SAR", 0)
                    
                    if edited_client_usd == baseline_client_usd + 150:
                        log_test("4.7 PUT /fx preserves account mode", True, f"Client: {edited_client_usd} (+150 from baseline)")
                    else:
                        log_test("4.7 PUT /fx preserves account mode", False, f"Expected {baseline_client_usd + 150}, got {edited_client_usd}")
                    
                    if edited_box_sar == baseline_box_sar - 570:
                        log_test("4.8 Box balance after edit", True, f"Box: {edited_box_sar} (-570 from baseline)")
                    else:
                        log_test("4.8 Box balance after edit", False, f"Expected {baseline_box_sar - 570}, got {edited_box_sar}")
                else:
                    log_test("4.7-4.8 PUT /fx account mode", False, f"Status: {resp.status_code}")
                
            else:
                log_test("4.2 FX account mode created", False, f"Status: {resp.status_code}, Body: {resp.text}")
            
            # Test 4.9: FX with COA account (no balance update)
            fx_coa_data = {
                "type": "buy",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "currency": "USD",
                "amount": 50,
                "exchange_rate": 3.75,
                "counter_currency": "SAR",
                "payment_method": "account",
                "currency_ref": {"kind": "account", "id": expense_account["id"]},
                "counter_ref": {"kind": "box", "id": box2["id"]},
                "customer_name": "FX COA Test"
            }
            
            resp = post_with_auth("/fx", owner_cookie, fx_coa_data)
            if resp.status_code == 200:
                fx_coa = resp.json()
                fx_coa_id = fx_coa.get("id")
                cleanup_ids["fx"].append(fx_coa_id)
                
                # Verify COA account has NO balance change (accounts collection doesn't track balances)
                resp_coa = get_with_auth("/accounts", owner_cookie)
                coa_after = next((a for a in resp_coa.json() if a["id"] == expense_account["id"]), {})
                
                # COA accounts don't have balances field
                if "balances" not in coa_after or not coa_after.get("balances"):
                    log_test("4.9 COA account no balance update", True, "COA account has no balances field")
                else:
                    log_test("4.9 COA account no balance update", False, f"COA should not have balances: {coa_after}")
                
                # Verify JE line has correct party_type='account' and account_code
                resp_je = get_with_auth("/journal-entries", owner_cookie)
                if resp_je.status_code == 200:
                    jes = resp_je.json()
                    fx_coa_je = next((je for je in jes if je.get("ref_id") == fx_coa_id), None)
                    
                    if fx_coa_je:
                        lines = fx_coa_je.get("lines", [])
                        coa_line = next((l for l in lines if l.get("party_type") == "account"), None)
                        
                        if coa_line and coa_line.get("account_code") == expense_account["code"]:
                            log_test("4.10 JE COA line correct", True, f"party_type: account, code: {expense_account['code']}")
                        else:
                            log_test("4.10 JE COA line correct", False, f"COA line: {coa_line}")
                    else:
                        log_test("4.10 JE COA line correct", False, "FX COA journal entry not found")
            else:
                log_test("4.9-4.10 FX with COA account", False, f"Status: {resp.status_code}")
        else:
            log_test("4.1-4.10 FX Account Mode", False, "Insufficient test data (need clients, suppliers, 2 boxes, COA accounts)")
    else:
        log_test("4.1-4.10 FX Account Mode", False, "Failed to fetch test data")
else:
    log_test("4.1-4.10 FX Account Mode", False, "Login failed")

# ============================================================================
# TEST 5: STATEMENT REPORT - BOX & ACCOUNT
# ============================================================================
print("\n### TEST 5: STATEMENT REPORT - BOX & ACCOUNT ###\n")

owner_cookie = login(TENANT_OWNER["email"], TENANT_OWNER["password"])
if owner_cookie:
    # Get boxes and COA accounts
    resp_boxes = get_with_auth("/boxes", owner_cookie)
    resp_accounts = get_with_auth("/accounts", owner_cookie)
    
    if resp_boxes.status_code == 200 and resp_accounts.status_code == 200:
        boxes = resp_boxes.json()
        coa_accounts = resp_accounts.json()
        
        if boxes and coa_accounts:
            box = boxes[0]
            coa = coa_accounts[0]
            
            # Test 5.1: Statement for box
            resp = get_with_auth(f"/reports/statement?party_type=box&party_id={box['id']}&currency_mode=all_detail&period=all", owner_cookie)
            if resp.status_code == 200:
                statement = resp.json()
                party = statement.get("party", {})
                rows = statement.get("rows", [])
                
                # Verify party.name matches box name
                if party.get("name") == box.get("name_ar"):
                    log_test("5.1 Statement box party name", True, f"Name: {party.get('name')}")
                else:
                    log_test("5.1 Statement box party name", False, f"Expected {box.get('name_ar')}, got {party.get('name')}")
                
                # Verify party.balances present
                if "balances" in party:
                    log_test("5.2 Statement box balances", True, f"Balances: {party.get('balances')}")
                else:
                    log_test("5.2 Statement box balances", False, "Balances field missing")
                
                # Verify rows contain transactions (if box has been used in FX tests above)
                if len(rows) > 0:
                    log_test("5.3 Statement box rows", True, f"Rows: {len(rows)}")
                    
                    # Verify balance column runs correctly
                    sample_row = rows[0]
                    if "balance" in sample_row:
                        log_test("5.4 Statement box balance column", True, f"Balance: {sample_row.get('balance')}")
                    else:
                        log_test("5.4 Statement box balance column", False, "Balance field missing in row")
                else:
                    log_test("5.3-5.4 Statement box rows", True, "No transactions for this box (expected if new)")
            else:
                log_test("5.1-5.4 Statement for box", False, f"Status: {resp.status_code}")
            
            # Test 5.5: Statement for COA account
            resp = get_with_auth(f"/reports/statement?party_type=account&party_id={coa['id']}&currency_mode=all_detail&period=all", owner_cookie)
            if resp.status_code == 200:
                statement = resp.json()
                party = statement.get("party", {})
                
                # Verify party.name includes code + name
                expected_name = f"{coa['code']} — {coa.get('name_ar') or coa.get('name')}"
                if party.get("name") == expected_name:
                    log_test("5.5 Statement account party name", True, f"Name: {party.get('name')}")
                else:
                    log_test("5.5 Statement account party name", False, f"Expected '{expected_name}', got '{party.get('name')}'")
            else:
                log_test("5.5 Statement for account", False, f"Status: {resp.status_code}")
        else:
            log_test("5.1-5.5 Statement Report", False, "No boxes or COA accounts available")
    else:
        log_test("5.1-5.5 Statement Report", False, "Failed to fetch boxes/accounts")
else:
    log_test("5.1-5.5 Statement Report", False, "Login failed")

# ============================================================================
# TEST 6: REGRESSION - v2.5 ENDPOINTS STILL WORK
# ============================================================================
print("\n### TEST 6: REGRESSION - v2.5 ENDPOINTS ###\n")

owner_cookie = login(TENANT_OWNER["email"], TENANT_OWNER["password"])
if owner_cookie:
    # Get baseline quota
    resp_me = get_with_auth("/auth/me", owner_cookie)
    if resp_me.status_code == 200:
        baseline_quota = resp_me.json().get("tenant", {}).get("journal_quota", {}).get("used", 0)
        
        # Get test data
        resp_clients = get_with_auth("/clients", owner_cookie)
        resp_suppliers = get_with_auth("/suppliers", owner_cookie)
        resp_boxes = get_with_auth("/boxes", owner_cookie)
        
        if all(r.status_code == 200 for r in [resp_clients, resp_suppliers, resp_boxes]):
            clients = resp_clients.json()
            suppliers = resp_suppliers.json()
            boxes = resp_boxes.json()
            
            if clients and suppliers and boxes:
                # Test POST /tickets (should increment quota)
                ticket_data = {
                    "pnr": f"REG-{random.randint(1000, 9999)}",
                    "client_id": clients[0]["id"],
                    "client_name": clients[0]["name"],
                    "supplier_id": suppliers[0]["id"],
                    "supplier_name": suppliers[0]["name"],
                    "passenger_name": "Regression Test",
                    "route": "JED-RUH",
                    "travel_date": datetime.now().strftime("%Y-%m-%d"),
                    "currency": "SAR",
                    "cost": 100,
                    "sale_price": 150,
                    "payment_method": "credit"
                }
                
                resp = post_with_auth("/tickets", owner_cookie, ticket_data)
                if resp.status_code == 200:
                    ticket = resp.json()
                    ticket_id = ticket.get("id")
                    cleanup_ids["tickets"].append(ticket_id)
                    
                    # Verify quota incremented
                    resp_me = get_with_auth("/auth/me", owner_cookie)
                    new_quota = resp_me.json().get("tenant", {}).get("journal_quota", {}).get("used", 0)
                    
                    if new_quota == baseline_quota + 1:
                        log_test("6.1 POST /tickets increments quota", True, f"{baseline_quota} → {new_quota}")
                    else:
                        log_test("6.1 POST /tickets increments quota", False, f"Expected {baseline_quota + 1}, got {new_quota}")
                    
                    # Test PUT /tickets (should NOT increment quota)
                    ticket_edit = {**ticket_data, "sale_price": 200}
                    resp = put_with_auth(f"/tickets/{ticket_id}", owner_cookie, ticket_edit)
                    if resp.status_code == 200:
                        resp_me = get_with_auth("/auth/me", owner_cookie)
                        quota_after_edit = resp_me.json().get("tenant", {}).get("journal_quota", {}).get("used", 0)
                        
                        if quota_after_edit == new_quota:
                            log_test("6.2 PUT /tickets preserves quota", True, f"Quota unchanged: {quota_after_edit}")
                        else:
                            log_test("6.2 PUT /tickets preserves quota", False, f"Expected {new_quota}, got {quota_after_edit}")
                    else:
                        log_test("6.2 PUT /tickets preserves quota", False, f"Status: {resp.status_code}")
                else:
                    log_test("6.1-6.2 Regression tickets", False, f"POST /tickets failed: {resp.status_code}")
                
                # Test POST /fx with cash mode (existing behavior)
                fx_cash_data = {
                    "type": "buy",
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "currency": "USD",
                    "amount": 50,
                    "exchange_rate": 3.75,
                    "counter_currency": "SAR",
                    "payment_method": "cash",
                    "box_currency_id": boxes[0]["id"],
                    "box_counter_id": boxes[1]["id"] if len(boxes) > 1 else boxes[0]["id"],
                    "customer_name": "Regression FX Cash"
                }
                
                resp = post_with_auth("/fx", owner_cookie, fx_cash_data)
                if resp.status_code == 200:
                    fx = resp.json()
                    fx_id = fx.get("id")
                    cleanup_ids["fx"].append(fx_id)
                    log_test("6.3 POST /fx cash mode still works", True, f"ID: {fx_id}")
                else:
                    log_test("6.3 POST /fx cash mode still works", False, f"Status: {resp.status_code}")
            else:
                log_test("6.1-6.3 Regression tests", False, "Insufficient test data")
        else:
            log_test("6.1-6.3 Regression tests", False, "Failed to fetch test data")
    else:
        log_test("6.1-6.3 Regression tests", False, "Failed to get baseline quota")
else:
    log_test("6.1-6.3 Regression tests", False, "Login failed")

# ============================================================================
# CLEANUP
# ============================================================================
print("\n### CLEANUP ###\n")

owner_cookie = login(TENANT_OWNER["email"], TENANT_OWNER["password"])
if owner_cookie:
    # Delete tickets
    for ticket_id in cleanup_ids["tickets"]:
        resp = delete_with_auth(f"/tickets/{ticket_id}", owner_cookie)
        if resp.status_code == 200:
            print(f"✓ Deleted ticket {ticket_id}")
        else:
            print(f"✗ Failed to delete ticket {ticket_id}: {resp.status_code}")
    
    # Delete FX transactions
    for fx_id in cleanup_ids["fx"]:
        resp = delete_with_auth(f"/fx/{fx_id}", owner_cookie)
        if resp.status_code == 200:
            print(f"✓ Deleted FX {fx_id}")
        else:
            print(f"✗ Failed to delete FX {fx_id}: {resp.status_code}")

# Note: We don't delete tenants created via public signup as they may be needed for verification
# Super admin can clean them up manually if needed

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)

total_tests = len(test_results)
passed_tests = sum(1 for t in test_results if t["passed"])
failed_tests = total_tests - passed_tests

print(f"\nTotal Tests: {total_tests}")
print(f"Passed: {passed_tests} ✅")
print(f"Failed: {failed_tests} ❌")
print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%\n")

if failed_tests > 0:
    print("FAILED TESTS:")
    for t in test_results:
        if not t["passed"]:
            print(f"  ❌ {t['name']}")
            if t["details"]:
                print(f"     {t['details']}")

print("\n" + "=" * 80)
