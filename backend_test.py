#!/usr/bin/env python3
"""
Backend Test Suite for Visa Monitoring API v3.11 (B2B)
Tests all visa-monitor endpoints with comprehensive validation
"""

import requests
import json
from datetime import datetime, timedelta
import sys

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
AUTH_EMAIL = "owner@demo.com"
AUTH_PASSWORD = "<DEMO_PASSWORD-see-memory/test_credentials.md>"

# Global variables
session = requests.Session()
created_records = []

def log_test(test_name, passed, details=""):
    """Log test results"""
    status = "✅ PASSED" if passed else "❌ FAILED"
    print(f"{status} - {test_name}")
    if details:
        print(f"  Details: {details}")
    return passed

def login():
    """Login and get authentication session"""
    try:
        print("\n=== AUTHENTICATION ===")
        response = session.post(
            f"{BASE_URL}/auth/login",
            json={"email": AUTH_EMAIL, "password": AUTH_PASSWORD},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            # Check if we have a session cookie
            if 'rahaal_session' in session.cookies:
                log_test("Login successful", True, f"Session cookie received")
                return True
            else:
                log_test("Login failed", False, "No session cookie in response")
                return False
        else:
            log_test("Login failed", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Login failed", False, f"Exception: {str(e)}")
        return False

def get_headers():
    """Get headers with authentication"""
    return {
        "Content-Type": "application/json"
    }

def test_mandatory_field_validation():
    """Test 1: POST /api/visa-monitor - mandatory field validation"""
    print("\n=== TEST 1: MANDATORY FIELD VALIDATION ===")
    
    mandatory_fields = [
        ("traveler_name", "اسم المعتمر مطلوب"),
        ("passport_no", "رقم الجواز مطلوب"),
        ("agent_name", "اسم الوكيل مطلوب"),
        ("agent_phone", "رقم جوال الوكيل (واتساب) مطلوب"),
        ("visa_no", "رقم التأشيرة مطلوب"),
        ("visa_issue_date", "تاريخ إصدار التأشيرة مطلوب"),
        ("entry_date", "تاريخ الدخول مطلوب")
    ]
    
    base_payload = {
        "traveler_name": "Test Traveler",
        "passport_no": "TEST001",
        "agent_name": "مكتب الاختبار",
        "agent_phone": "967700000001",
        "visa_no": "V-TEST-1",
        "visa_issue_date": "2026-06-01",
        "entry_date": "2026-06-15"
    }
    
    all_passed = True
    for field, expected_error in mandatory_fields:
        try:
            payload = base_payload.copy()
            del payload[field]
            
            response = session.post(
                f"{BASE_URL}/visa-monitor",
                headers=get_headers(),
                json=payload,
                timeout=10
            )
            
            if response.status_code == 400:
                error_msg = response.json().get("error", "")
                if expected_error in error_msg:
                    log_test(f"Validation for missing {field}", True, f"Got expected error: {expected_error}")
                else:
                    log_test(f"Validation for missing {field}", False, f"Expected '{expected_error}', got '{error_msg}'")
                    all_passed = False
            else:
                log_test(f"Validation for missing {field}", False, f"Expected 400, got {response.status_code}")
                all_passed = False
        except Exception as e:
            log_test(f"Validation for missing {field}", False, f"Exception: {str(e)}")
            all_passed = False
    
    return all_passed

def test_create_records_with_status():
    """Test 2: POST /api/visa-monitor - create records for each track status"""
    print("\n=== TEST 2: CREATE RECORDS WITH DIFFERENT STATUSES ===")
    
    today = datetime.now().date()
    all_passed = True
    
    # Test case 1: GREEN status (remaining ~85 days)
    try:
        payload = {
            "traveler_name": "Green Test Traveler",
            "passport_no": "TEST-GREEN-001",
            "nationality": "YE",
            "agent_name": "مكتب الاختبار",
            "agent_phone": "967700000001",
            "visa_no": "V-TEST-GREEN-1",
            "visa_issue_date": "2026-06-01",
            "host_name": "Test Host",
            "entry_date": today.isoformat(),
            "entry_port": "منفذ الوديعة",
            "allowed_days": 85,
            "notes": "AUTOTEST"
        }
        
        response = session.post(
            f"{BASE_URL}/visa-monitor",
            headers=get_headers(),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            created_records.append(data.get("id"))
            
            # Verify computed fields
            expected_exit = (today + timedelta(days=85)).isoformat()
            remaining = data.get("remaining_days")
            track_status = data.get("track_status")
            
            checks = [
                (data.get("expected_exit_date") == expected_exit, f"expected_exit_date = {expected_exit}"),
                (80 <= remaining <= 85, f"remaining_days ~85 (got {remaining})"),
                (track_status == "green", f"track_status = green (got {track_status})")
            ]
            
            if all(c[0] for c in checks):
                log_test("GREEN status record", True, f"remaining={remaining}, status={track_status}")
            else:
                failed = [c[1] for c in checks if not c[0]]
                log_test("GREEN status record", False, f"Failed: {', '.join(failed)}")
                all_passed = False
        else:
            log_test("GREEN status record", False, f"Status {response.status_code}: {response.text}")
            all_passed = False
    except Exception as e:
        log_test("GREEN status record", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test case 2: Default allowed_days (should be 85)
    try:
        payload = {
            "traveler_name": "Default Days Traveler",
            "passport_no": "TEST-DEFAULT-001",
            "agent_name": "مكتب الاختبار",
            "agent_phone": "967700000002",
            "visa_no": "V-TEST-DEFAULT-1",
            "visa_issue_date": "2026-06-01",
            "entry_date": today.isoformat(),
            "notes": "AUTOTEST"
        }
        
        response = session.post(
            f"{BASE_URL}/visa-monitor",
            headers=get_headers(),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            created_records.append(data.get("id"))
            
            expected_exit = (today + timedelta(days=85)).isoformat()
            if data.get("expected_exit_date") == expected_exit:
                log_test("Default allowed_days=85", True, f"expected_exit_date computed correctly")
            else:
                log_test("Default allowed_days=85", False, f"Expected {expected_exit}, got {data.get('expected_exit_date')}")
                all_passed = False
        else:
            log_test("Default allowed_days=85", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("Default allowed_days=85", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test case 3: YELLOW status (remaining ~25 days)
    try:
        entry_date = (today - timedelta(days=60)).isoformat()
        payload = {
            "traveler_name": "Yellow Test Traveler",
            "passport_no": "TEST-YELLOW-001",
            "agent_name": "مكتب الاختبار",
            "agent_phone": "967700000003",
            "visa_no": "V-TEST-YELLOW-1",
            "visa_issue_date": "2026-04-01",
            "entry_date": entry_date,
            "allowed_days": 85,
            "notes": "AUTOTEST"
        }
        
        response = session.post(
            f"{BASE_URL}/visa-monitor",
            headers=get_headers(),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            created_records.append(data.get("id"))
            
            remaining = data.get("remaining_days")
            track_status = data.get("track_status")
            
            if track_status == "yellow" and 16 <= remaining <= 30:
                log_test("YELLOW status record", True, f"remaining={remaining}, status={track_status}")
            else:
                log_test("YELLOW status record", False, f"Expected yellow with 16-30 days, got {track_status} with {remaining} days")
                all_passed = False
        else:
            log_test("YELLOW status record", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("YELLOW status record", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test case 4: RED status (remaining ~10 days)
    try:
        entry_date = (today - timedelta(days=75)).isoformat()
        payload = {
            "traveler_name": "Red Test Traveler",
            "passport_no": "TEST-RED-001",
            "agent_name": "مكتب الاختبار",
            "agent_phone": "967700000004",
            "visa_no": "V-TEST-RED-1",
            "visa_issue_date": "2026-03-15",
            "entry_date": entry_date,
            "allowed_days": 85,
            "notes": "AUTOTEST"
        }
        
        response = session.post(
            f"{BASE_URL}/visa-monitor",
            headers=get_headers(),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            created_records.append(data.get("id"))
            
            remaining = data.get("remaining_days")
            track_status = data.get("track_status")
            
            if track_status == "red" and 0 <= remaining <= 15:
                log_test("RED status record", True, f"remaining={remaining}, status={track_status}")
            else:
                log_test("RED status record", False, f"Expected red with 0-15 days, got {track_status} with {remaining} days")
                all_passed = False
        else:
            log_test("RED status record", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("RED status record", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test case 5: OVERSTAY status (remaining negative)
    try:
        entry_date = (today - timedelta(days=100)).isoformat()
        payload = {
            "traveler_name": "Overstay Test Traveler",
            "passport_no": "TEST-OVERSTAY-001",
            "agent_name": "مكتب الاختبار",
            "agent_phone": "967700000005",
            "visa_no": "V-TEST-OVERSTAY-1",
            "visa_issue_date": "2026-02-20",
            "entry_date": entry_date,
            "allowed_days": 85,
            "notes": "AUTOTEST"
        }
        
        response = session.post(
            f"{BASE_URL}/visa-monitor",
            headers=get_headers(),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            created_records.append(data.get("id"))
            
            remaining = data.get("remaining_days")
            track_status = data.get("track_status")
            
            if track_status == "overstay" and remaining < 0:
                log_test("OVERSTAY status record", True, f"remaining={remaining}, status={track_status}")
            else:
                log_test("OVERSTAY status record", False, f"Expected overstay with negative days, got {track_status} with {remaining} days")
                all_passed = False
        else:
            log_test("OVERSTAY status record", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("OVERSTAY status record", False, f"Exception: {str(e)}")
        all_passed = False
    
    return all_passed

def test_get_filters():
    """Test 3: GET /api/visa-monitor - verify filters"""
    print("\n=== TEST 3: GET FILTERS ===")
    
    all_passed = True
    
    # Test track=inside (should return all non-departed)
    try:
        response = session.get(
            f"{BASE_URL}/visa-monitor?track=inside",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            non_departed = [r for r in data if r.get("track_status") != "departed"]
            if len(data) == len(non_departed) and len(data) >= 5:
                log_test("GET track=inside", True, f"Returned {len(data)} non-departed records")
            else:
                log_test("GET track=inside", False, f"Expected all non-departed, got {len(data)} total, {len(non_departed)} non-departed")
                all_passed = False
        else:
            log_test("GET track=inside", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("GET track=inside", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test track=alerts (should return yellow+red+overstay)
    try:
        response = session.get(
            f"{BASE_URL}/visa-monitor?track=alerts",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            alert_statuses = [r.get("track_status") for r in data]
            valid_alerts = all(s in ["yellow", "red", "overstay"] for s in alert_statuses)
            if valid_alerts and len(data) >= 3:
                log_test("GET track=alerts", True, f"Returned {len(data)} alert records (yellow/red/overstay)")
            else:
                log_test("GET track=alerts", False, f"Expected only yellow/red/overstay, got statuses: {set(alert_statuses)}")
                all_passed = False
        else:
            log_test("GET track=alerts", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("GET track=alerts", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test track=overstay
    try:
        response = session.get(
            f"{BASE_URL}/visa-monitor?track=overstay",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            overstay_only = all(r.get("track_status") == "overstay" for r in data)
            if overstay_only and len(data) >= 1:
                log_test("GET track=overstay", True, f"Returned {len(data)} overstay records")
            else:
                log_test("GET track=overstay", False, f"Expected only overstay records")
                all_passed = False
        else:
            log_test("GET track=overstay", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("GET track=overstay", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test agent filter
    try:
        response = session.get(
            f"{BASE_URL}/visa-monitor?agent=اختبار",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            matching = all("اختبار" in r.get("agent_name", "") for r in data)
            if matching and len(data) >= 5:
                log_test("GET agent filter", True, f"Returned {len(data)} records with 'اختبار' in agent_name")
            else:
                log_test("GET agent filter", False, f"Filter not working correctly")
                all_passed = False
        else:
            log_test("GET agent filter", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("GET agent filter", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test search filter
    try:
        response = session.get(
            f"{BASE_URL}/visa-monitor?search=TEST-GREEN",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            found = any("TEST-GREEN" in r.get("passport_no", "") for r in data)
            if found:
                log_test("GET search filter", True, f"Found record with passport TEST-GREEN")
            else:
                log_test("GET search filter", False, f"Search did not find TEST-GREEN passport")
                all_passed = False
        else:
            log_test("GET search filter", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("GET search filter", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test sorting (overstay/lowest remaining first)
    try:
        response = session.get(
            f"{BASE_URL}/visa-monitor?track=inside",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if len(data) >= 2:
                # Check if sorted by remaining_days ascending (overstay first)
                remaining_values = [r.get("remaining_days") for r in data if r.get("track_status") != "departed"]
                is_sorted = all(remaining_values[i] <= remaining_values[i+1] for i in range(len(remaining_values)-1))
                if is_sorted:
                    log_test("GET sorting", True, f"Records sorted by remaining_days ascending")
                else:
                    log_test("GET sorting", False, f"Records not properly sorted: {remaining_values[:5]}")
                    all_passed = False
            else:
                log_test("GET sorting", True, f"Not enough records to verify sorting")
        else:
            log_test("GET sorting", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("GET sorting", False, f"Exception: {str(e)}")
        all_passed = False
    
    return all_passed

def test_patch_actions():
    """Test 4: PATCH /api/visa-monitor/:id - action=exited and reactivate"""
    print("\n=== TEST 4: PATCH ACTIONS ===")
    
    all_passed = True
    
    # Find the GREEN record
    green_id = None
    try:
        response = session.get(
            f"{BASE_URL}/visa-monitor?search=TEST-GREEN-001",
            headers=get_headers(),
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data:
                green_id = data[0].get("id")
    except Exception:
        pass
    
    if not green_id:
        log_test("PATCH action=exited", False, "Could not find GREEN record")
        return False
    
    # Test action=exited
    try:
        payload = {
            "action": "exited",
            "exit_port": "مطار جدة"
        }
        
        response = session.patch(
            f"{BASE_URL}/visa-monitor/{green_id}",
            headers=get_headers(),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            # Verify the record is now departed (use track=all to include departed records)
            response = session.get(
                f"{BASE_URL}/visa-monitor?search=TEST-GREEN-001&track=all",
                headers=get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data:
                    record = data[0]
                    track_status = record.get("track_status")
                    actual_exit = record.get("actual_exit_date")
                    exit_port = record.get("exit_port")
                    
                    if track_status == "departed" and actual_exit and exit_port == "مطار جدة":
                        log_test("PATCH action=exited", True, f"Record marked as departed with exit_port saved")
                    else:
                        log_test("PATCH action=exited", False, f"Status={track_status}, exit_date={actual_exit}, port={exit_port}")
                        all_passed = False
                else:
                    log_test("PATCH action=exited", False, "Record not found after update")
                    all_passed = False
            else:
                log_test("PATCH action=exited", False, f"GET failed with status {response.status_code}")
                all_passed = False
        else:
            log_test("PATCH action=exited", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("PATCH action=exited", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test action=reactivate
    try:
        payload = {
            "action": "reactivate"
        }
        
        response = session.patch(
            f"{BASE_URL}/visa-monitor/{green_id}",
            headers=get_headers(),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            # Verify the record is back to non-departed
            response = session.get(
                f"{BASE_URL}/visa-monitor?search=TEST-GREEN-001",
                headers=get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data:
                    record = data[0]
                    track_status = record.get("track_status")
                    actual_exit = record.get("actual_exit_date")
                    
                    if track_status != "departed" and not actual_exit:
                        log_test("PATCH action=reactivate", True, f"Record reactivated, status={track_status}")
                    else:
                        log_test("PATCH action=reactivate", False, f"Status={track_status}, exit_date={actual_exit}")
                        all_passed = False
                else:
                    log_test("PATCH action=reactivate", False, "Record not found")
                    all_passed = False
            else:
                log_test("PATCH action=reactivate", False, f"GET failed")
                all_passed = False
        else:
            log_test("PATCH action=reactivate", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("PATCH action=reactivate", False, f"Exception: {str(e)}")
        all_passed = False
    
    # Test field update (change allowed_days)
    try:
        payload = {
            "allowed_days": 24
        }
        
        response = session.patch(
            f"{BASE_URL}/visa-monitor/{green_id}",
            headers=get_headers(),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            # Verify expected_exit_date was recomputed
            response = session.get(
                f"{BASE_URL}/visa-monitor?search=TEST-GREEN-001",
                headers=get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data:
                    record = data[0]
                    entry_date = datetime.fromisoformat(record.get("entry_date")).date()
                    expected_exit = datetime.fromisoformat(record.get("expected_exit_date")).date()
                    expected_computed = entry_date + timedelta(days=24)
                    
                    if expected_exit == expected_computed:
                        log_test("PATCH field update (allowed_days)", True, f"expected_exit_date recomputed to entry+24 days")
                    else:
                        log_test("PATCH field update (allowed_days)", False, f"Expected {expected_computed}, got {expected_exit}")
                        all_passed = False
                else:
                    log_test("PATCH field update (allowed_days)", False, "Record not found")
                    all_passed = False
            else:
                log_test("PATCH field update (allowed_days)", False, f"GET failed")
                all_passed = False
        else:
            log_test("PATCH field update (allowed_days)", False, f"Status {response.status_code}")
            all_passed = False
    except Exception as e:
        log_test("PATCH field update (allowed_days)", False, f"Exception: {str(e)}")
        all_passed = False
    
    return all_passed

def test_import():
    """Test 5: POST /api/visa-monitor/import - bulk upsert"""
    print("\n=== TEST 5: IMPORT BULK UPSERT ===")
    
    all_passed = True
    today = datetime.now().date().isoformat()
    
    rows = [
        # New row with all mandatory fields
        {
            "traveler_name": "Import Test 1",
            "passport_no": "TEST-IMP-001",
            "agent_name": "مكتب الاستيراد",
            "agent_phone": "967700000010",
            "visa_no": "V-IMP-001",
            "visa_issue_date": "2026-06-01",
            "entry_date": today,
            "notes": "AUTOTEST"
        },
        # Row missing agent_phone (should be skipped)
        {
            "traveler_name": "Import Test 2",
            "passport_no": "TEST-IMP-002",
            "agent_name": "مكتب الاستيراد",
            "visa_no": "V-IMP-002",
            "visa_issue_date": "2026-06-01",
            "entry_date": today,
            "notes": "AUTOTEST"
        },
        # Existing passport (should update)
        {
            "passport_no": "TEST-GREEN-001",
            "agent_name": "مكتب محدث",
            "agent_phone": "967700000099"
        }
    ]
    
    try:
        response = session.post(
            f"{BASE_URL}/visa-monitor/import",
            headers=get_headers(),
            json={"rows": rows},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            inserted = data.get("inserted", 0)
            updated = data.get("updated", 0)
            skipped = data.get("skipped", 0)
            skip_reasons = data.get("skip_reasons", [])
            total = data.get("total", 0)
            
            checks = [
                (inserted + updated >= 2, f"inserted + updated >= 2 (got {inserted + updated})"),
                (skipped == 1, f"skipped=1 (got {skipped})"),
                (total == 3, f"total=3 (got {total})"),
                (any("جوال الوكيل" in str(r) for r in skip_reasons), "skip_reasons mentions جوال الوكيل")
            ]
            
            if all(c[0] for c in checks):
                log_test("Import bulk upsert", True, f"inserted={inserted}, updated={updated}, skipped={skipped}")
                
                # Track the new record for cleanup
                response = session.get(
                    f"{BASE_URL}/visa-monitor?search=TEST-IMP-001",
                    headers=get_headers(),
                    timeout=10
                )
                if response.status_code == 200:
                    data = response.json()
                    if data:
                        created_records.append(data[0].get("id"))
                
                # Verify the update happened
                response = session.get(
                    f"{BASE_URL}/visa-monitor?search=TEST-GREEN-001",
                    headers=get_headers(),
                    timeout=10
                )
                if response.status_code == 200:
                    data = response.json()
                    if data:
                        record = data[0]
                        if record.get("agent_name") == "مكتب محدث":
                            log_test("Import update verification", True, "agent_name updated correctly")
                        else:
                            log_test("Import update verification", False, f"agent_name not updated: {record.get('agent_name')}")
                            all_passed = False
            else:
                failed = [c[1] for c in checks if not c[0]]
                log_test("Import bulk upsert", False, f"Failed: {', '.join(failed)}")
                all_passed = False
        else:
            log_test("Import bulk upsert", False, f"Status {response.status_code}: {response.text}")
            all_passed = False
    except Exception as e:
        log_test("Import bulk upsert", False, f"Exception: {str(e)}")
        all_passed = False
    
    return all_passed

def test_stats():
    """Test 6: GET /api/visa-monitor/stats - counts by status"""
    print("\n=== TEST 6: STATS ENDPOINT ===")
    
    try:
        response = session.get(
            f"{BASE_URL}/visa-monitor/stats",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            required_fields = ["green", "yellow", "red", "overstay", "departed", "total", "inside", "alerts"]
            has_all_fields = all(field in data for field in required_fields)
            
            if has_all_fields:
                # Verify calculations
                inside_calc = data["green"] + data["yellow"] + data["red"] + data["overstay"]
                alerts_calc = data["yellow"] + data["red"] + data["overstay"]
                
                checks = [
                    (data["inside"] == inside_calc, f"inside = green+yellow+red+overstay"),
                    (data["alerts"] == alerts_calc, f"alerts = yellow+red+overstay"),
                    (data["total"] >= 6, f"total >= 6 (created records)")
                ]
                
                if all(c[0] for c in checks):
                    log_test("Stats endpoint", True, f"All counts correct: green={data['green']}, yellow={data['yellow']}, red={data['red']}, overstay={data['overstay']}, departed={data['departed']}")
                    return True
                else:
                    failed = [c[1] for c in checks if not c[0]]
                    log_test("Stats endpoint", False, f"Failed: {', '.join(failed)}")
                    return False
            else:
                missing = [f for f in required_fields if f not in data]
                log_test("Stats endpoint", False, f"Missing fields: {missing}")
                return False
        else:
            log_test("Stats endpoint", False, f"Status {response.status_code}")
            return False
    except Exception as e:
        log_test("Stats endpoint", False, f"Exception: {str(e)}")
        return False

def test_alerts():
    """Test 7: GET /api/visa-monitor/alerts - dashboard widget"""
    print("\n=== TEST 7: ALERTS ENDPOINT ===")
    
    try:
        response = session.get(
            f"{BASE_URL}/visa-monitor/alerts",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            required_fields = ["counts", "rows", "total"]
            has_all_fields = all(field in data for field in required_fields)
            
            if has_all_fields:
                counts = data["counts"]
                rows = data["rows"]
                total = data["total"]
                
                # Verify only yellow/red/overstay in rows
                valid_statuses = all(r.get("track_status") in ["yellow", "red", "overstay"] for r in rows)
                
                # Verify counts match
                counts_sum = counts.get("yellow", 0) + counts.get("red", 0) + counts.get("overstay", 0)
                
                # Verify required fields in rows (fields should exist, but agent_phone might be null for old records)
                has_required_fields = all(
                    "track_status" in r and "remaining_days" in r
                    for r in rows
                )
                
                checks = [
                    (valid_statuses, "All rows have yellow/red/overstay status"),
                    (counts_sum == total, f"counts sum ({counts_sum}) = total ({total})"),
                    (has_required_fields, "All rows have track_status, remaining_days"),
                    (total >= 3, f"total >= 3 (expected yellow+red+overstay)")
                ]
                
                if all(c[0] for c in checks):
                    log_test("Alerts endpoint", True, f"Returned {total} alerts: yellow={counts.get('yellow')}, red={counts.get('red')}, overstay={counts.get('overstay')}")
                    return True
                else:
                    failed = [c[1] for c in checks if not c[0]]
                    log_test("Alerts endpoint", False, f"Failed: {', '.join(failed)}")
                    return False
            else:
                missing = [f for f in required_fields if f not in data]
                log_test("Alerts endpoint", False, f"Missing fields: {missing}")
                return False
        else:
            log_test("Alerts endpoint", False, f"Status {response.status_code}")
            return False
    except Exception as e:
        log_test("Alerts endpoint", False, f"Exception: {str(e)}")
        return False

def cleanup():
    """Cleanup: Delete all test records"""
    print("\n=== CLEANUP ===")
    
    try:
        # Get all test records (use track=all to include departed records)
        response = session.get(
            f"{BASE_URL}/visa-monitor?track=all",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            test_records = [r.get("id") for r in data if "AUTOTEST" in r.get("notes", "") or r.get("passport_no", "").startswith("TEST-")]
            
            deleted_count = 0
            for record_id in test_records:
                try:
                    response = session.delete(
                        f"{BASE_URL}/visa-monitor/{record_id}",
                        headers=get_headers(),
                        timeout=10
                    )
                    if response.status_code == 200:
                        deleted_count += 1
                except Exception:
                    pass
            
            log_test("Cleanup", True, f"Deleted {deleted_count} test records")
        else:
            log_test("Cleanup", False, f"Could not fetch test records")
    except Exception as e:
        log_test("Cleanup", False, f"Exception: {str(e)}")

def main():
    """Main test runner"""
    print("=" * 80)
    print("VISA MONITORING API v3.11 (B2B) - BACKEND TEST SUITE")
    print("=" * 80)
    
    # Login
    if not login():
        print("\n❌ AUTHENTICATION FAILED - Cannot proceed with tests")
        sys.exit(1)
    
    # Run tests
    results = []
    
    results.append(("Mandatory Field Validation", test_mandatory_field_validation()))
    results.append(("Create Records with Status", test_create_records_with_status()))
    results.append(("GET Filters", test_get_filters()))
    results.append(("PATCH Actions", test_patch_actions()))
    results.append(("Import Bulk Upsert", test_import()))
    results.append(("Stats Endpoint", test_stats()))
    results.append(("Alerts Endpoint", test_alerts()))
    
    # Cleanup
    cleanup()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status} - {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
