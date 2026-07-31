#!/usr/bin/env python3
"""
v3.0 Backend Testing Suite for Rahaal ERP
Tests: Services Module, Visa Alerts, Strict Excel Import Validation, Regression
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Credentials
TENANT_OWNER = {"email": "owner@demo.com", "password": "Demo@2025"}
SUPER_ADMIN = {"email": "admin@targetmedia.com", "password": "Target@2025"}

session = requests.Session()

def login(creds):
    """Login and store session cookie"""
    resp = session.post(f"{BASE_URL}/auth/login", json=creds)
    print(f"✓ Login as {creds['email']}: {resp.status_code}")
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()

def test_health():
    """Test health endpoint returns version 3.0"""
    print("\n=== TEST: Health Endpoint ===")
    resp = session.get(f"{BASE_URL}/health")
    print(f"GET /health: {resp.status_code}")
    assert resp.status_code == 200, f"Health check failed: {resp.text}"
    data = resp.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    assert data.get("status") == "ok", "Health status not ok"
    assert data.get("version") == "3.0", f"Expected version 3.0, got {data.get('version')}"
    print("✅ PASSED - Health endpoint returns version 3.0")

def test_services_module():
    """Test v3.0.1 Services Module CRUD + service-types catalog"""
    print("\n=== TEST: v3.0.1 Services Module ===")
    
    # Login as tenant owner
    login(TENANT_OWNER)
    
    # 1. GET /api/service-types — should return at least 4 default types
    print("\n1. GET /service-types")
    resp = session.get(f"{BASE_URL}/service-types")
    assert resp.status_code == 200, f"Failed to get service types: {resp.text}"
    types = resp.json()
    print(f"Service types count: {len(types)}")
    assert len(types) >= 4, f"Expected at least 4 default service types, got {len(types)}"
    default_names = [t['name'] for t in types]
    print(f"Default service types: {default_names}")
    assert 'حجز فندق' in default_names, "Missing 'حجز فندق'"
    assert 'تصديق شهادات' in default_names, "Missing 'تصديق شهادات'"
    assert 'خدمة نقل / ترحيل' in default_names, "Missing 'خدمة نقل / ترحيل'"
    assert 'خدمات متنوعة' in default_names, "Missing 'خدمات متنوعة'"
    print("✅ PASSED - Default service types seeded correctly")
    
    # 2. POST /api/service-types with body { name: 'إصدار جواز' }
    print("\n2. POST /service-types - Create new service type")
    resp = session.post(f"{BASE_URL}/service-types", json={"name": "إصدار جواز"})
    assert resp.status_code == 200, f"Failed to create service type: {resp.text}"
    new_type = resp.json()
    new_type_id = new_type['id']
    print(f"Created service type: {new_type['name']} (ID: {new_type_id})")
    print("✅ PASSED - Service type created")
    
    # 3. Test duplicate name should return 400
    print("\n3. POST /service-types - Duplicate name should fail")
    resp = session.post(f"{BASE_URL}/service-types", json={"name": "إصدار جواز"})
    assert resp.status_code == 400, f"Expected 400 for duplicate, got {resp.status_code}"
    print(f"Duplicate rejected with 400: {resp.json().get('error')}")
    print("✅ PASSED - Duplicate service type rejected")
    
    # 4. Create a client and supplier for services
    print("\n4. Create client and supplier")
    resp = session.post(f"{BASE_URL}/clients", json={"name": "عميل خدمات", "phone": "123456"})
    assert resp.status_code == 200, f"Failed to create client: {resp.text}"
    client = resp.json()
    client_id = client['id']
    print(f"Created client: {client['name']} (ID: {client_id})")
    
    resp = session.post(f"{BASE_URL}/suppliers", json={"name": "مورد خدمات", "phone": "789012"})
    assert resp.status_code == 200, f"Failed to create supplier: {resp.text}"
    supplier = resp.json()
    supplier_id = supplier['id']
    print(f"Created supplier: {supplier['name']} (ID: {supplier_id})")
    print("✅ PASSED - Client and supplier created")
    
    # Get quota before creating service
    resp = session.get(f"{BASE_URL}/auth/me")
    quota_before = resp.json()['tenant']['journal_quota']['used']
    print(f"\nQuota before service creation: {quota_before}")
    
    # 5. POST /api/services with all required fields
    print("\n5. POST /services - Create service transaction")
    service_data = {
        "date": datetime.now().isoformat(),
        "service_type": "حجز فندق",
        "currency": "SAR",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "cost": 100,
        "sale_price": 150,
        "payment_method": "credit",
        "beneficiary_name": "أحمد",
        "reference_no": "REF-001",
        "description": "حجز فندق 5 نجوم"
    }
    resp = session.post(f"{BASE_URL}/services", json=service_data)
    assert resp.status_code == 200, f"Failed to create service: {resp.text}"
    service = resp.json()
    service_id = service['id']
    print(f"Created service: {service['service_type']} (ID: {service_id})")
    assert service['commission'] == 50, f"Expected commission 50, got {service['commission']}"
    print(f"Commission calculated correctly: {service['commission']}")
    print("✅ PASSED - Service created with correct commission")
    
    # Verify quota incremented
    resp = session.get(f"{BASE_URL}/auth/me")
    quota_after_create = resp.json()['tenant']['journal_quota']['used']
    print(f"Quota after service creation: {quota_after_create}")
    assert quota_after_create == quota_before + 1, f"Quota should increment by 1, was {quota_before}, now {quota_after_create}"
    print("✅ PASSED - Quota incremented by 1")
    
    # 6. GET /api/services — should list the created one
    print("\n6. GET /services - List services")
    resp = session.get(f"{BASE_URL}/services")
    assert resp.status_code == 200, f"Failed to get services: {resp.text}"
    services = resp.json()
    assert len(services) > 0, "No services found"
    found = any(s['id'] == service_id for s in services)
    assert found, f"Created service {service_id} not found in list"
    print(f"Found {len(services)} services, including our new service")
    print("✅ PASSED - Service appears in list")
    
    # 7. Verify /api/journal-entries lists the JE with ref_type='service'
    print("\n7. GET /journal-entries - Verify JE created")
    resp = session.get(f"{BASE_URL}/journal-entries")
    assert resp.status_code == 200, f"Failed to get journal entries: {resp.text}"
    jes = resp.json()
    service_je = next((je for je in jes if je['ref_type'] == 'service' and je['ref_id'] == service_id), None)
    assert service_je is not None, "Journal entry with ref_type='service' not found"
    print(f"Journal entry found: {service_je['description']}")
    assert len(service_je['lines']) == 3, f"Expected 3 lines, got {len(service_je['lines'])}"
    print(f"JE has 3 lines: {[l['account_code'] for l in service_je['lines']]}")
    # Verify account 4103 is used for revenue
    revenue_line = next((l for l in service_je['lines'] if l['account_code'] == '4103'), None)
    assert revenue_line is not None, "Revenue line with account 4103 not found"
    assert revenue_line['credit'] == 50, f"Expected revenue credit 50, got {revenue_line['credit']}"
    print("✅ PASSED - Journal entry created with account 4103 for revenue")
    
    # 8. Verify accounting: supplier balance and client balance
    print("\n8. Verify accounting balances")
    resp = session.get(f"{BASE_URL}/clients")
    clients = resp.json()
    client_data = next((c for c in clients if c['id'] == client_id), None)
    assert client_data is not None, "Client not found"
    print(f"Client balance SAR: {client_data['balances']['SAR']}")
    assert client_data['balances']['SAR'] == 150, f"Expected client balance 150, got {client_data['balances']['SAR']}"
    
    resp = session.get(f"{BASE_URL}/suppliers")
    suppliers = resp.json()
    supplier_data = next((s for s in suppliers if s['id'] == supplier_id), None)
    assert supplier_data is not None, "Supplier not found"
    print(f"Supplier balance SAR: {supplier_data['balances']['SAR']}")
    assert supplier_data['balances']['SAR'] == 100, f"Expected supplier balance 100, got {supplier_data['balances']['SAR']}"
    print("✅ PASSED - Accounting balances correct")
    
    # 9. PUT /api/services/:id — modify sale_price to 200
    print("\n9. PUT /services/:id - Edit service")
    quota_before_edit = quota_after_create
    edit_data = {**service_data, "sale_price": 200}
    resp = session.put(f"{BASE_URL}/services/{service_id}", json=edit_data)
    assert resp.status_code == 200, f"Failed to edit service: {resp.text}"
    edited_service = resp.json()
    print(f"Edited service sale_price: {edited_service['sale_price']}")
    assert edited_service['sale_price'] == 200, f"Expected sale_price 200, got {edited_service['sale_price']}"
    assert edited_service['commission'] == 100, f"Expected commission 100, got {edited_service['commission']}"
    print(f"Commission recalculated correctly: {edited_service['commission']}")
    
    # Verify quota NOT incremented (edit should preserve quota)
    resp = session.get(f"{BASE_URL}/auth/me")
    quota_after_edit = resp.json()['tenant']['journal_quota']['used']
    print(f"Quota after edit: {quota_after_edit}")
    assert quota_after_edit == quota_before_edit, f"Quota should NOT change on edit, was {quota_before_edit}, now {quota_after_edit}"
    print("✅ PASSED - Service edited, commission recalculated, quota preserved")
    
    # Verify JE was reversed and re-posted
    resp = session.get(f"{BASE_URL}/journal-entries")
    jes = resp.json()
    service_jes = [je for je in jes if je['ref_type'] == 'service' and je['ref_id'] == service_id]
    assert len(service_jes) == 1, f"Expected 1 JE for service, found {len(service_jes)}"
    latest_je = service_jes[0]
    revenue_line = next((l for l in latest_je['lines'] if l['account_code'] == '4103'), None)
    assert revenue_line['credit'] == 100, f"Expected revenue credit 100 after edit, got {revenue_line['credit']}"
    print("✅ PASSED - JE reversed and re-posted with new commission")
    
    # Verify client balance updated correctly (net effect should be +200 SAR)
    resp = session.get(f"{BASE_URL}/clients")
    clients = resp.json()
    client_data = next((c for c in clients if c['id'] == client_id), None)
    print(f"Client balance SAR after edit: {client_data['balances']['SAR']}")
    assert client_data['balances']['SAR'] == 200, f"Expected client balance 200 after edit, got {client_data['balances']['SAR']}"
    print("✅ PASSED - Client balance updated correctly after edit")
    
    # 10. DELETE /api/services/:id
    print("\n10. DELETE /services/:id - Delete service")
    quota_before_delete = quota_after_edit
    resp = session.delete(f"{BASE_URL}/services/{service_id}")
    assert resp.status_code == 200, f"Failed to delete service: {resp.text}"
    print(f"Service deleted: {service_id}")
    
    # Verify quota decremented
    resp = session.get(f"{BASE_URL}/auth/me")
    quota_after_delete = resp.json()['tenant']['journal_quota']['used']
    print(f"Quota after delete: {quota_after_delete}")
    assert quota_after_delete == quota_before_delete - 1, f"Quota should decrement by 1, was {quota_before_delete}, now {quota_after_delete}"
    print("✅ PASSED - Quota decremented by 1")
    
    # Verify balances reversed
    resp = session.get(f"{BASE_URL}/clients")
    clients = resp.json()
    client_data = next((c for c in clients if c['id'] == client_id), None)
    print(f"Client balance SAR after delete: {client_data['balances']['SAR']}")
    assert client_data['balances']['SAR'] == 0, f"Expected client balance 0 after delete, got {client_data['balances']['SAR']}"
    
    resp = session.get(f"{BASE_URL}/suppliers")
    suppliers = resp.json()
    supplier_data = next((s for s in suppliers if s['id'] == supplier_id), None)
    print(f"Supplier balance SAR after delete: {supplier_data['balances']['SAR']}")
    assert supplier_data['balances']['SAR'] == 0, f"Expected supplier balance 0 after delete, got {supplier_data['balances']['SAR']}"
    print("✅ PASSED - Balances reversed correctly after delete")
    
    # Verify JE deleted
    resp = session.get(f"{BASE_URL}/journal-entries")
    jes = resp.json()
    service_jes = [je for je in jes if je['ref_type'] == 'service' and je['ref_id'] == service_id]
    assert len(service_jes) == 0, f"Expected 0 JEs for deleted service, found {len(service_jes)}"
    print("✅ PASSED - Journal entry deleted")
    
    # 11. DELETE service type
    print("\n11. DELETE /service-types/:id")
    resp = session.delete(f"{BASE_URL}/service-types/{new_type_id}")
    assert resp.status_code == 200, f"Failed to delete service type: {resp.text}"
    print(f"Service type deleted: {new_type_id}")
    print("✅ PASSED - Service type deleted")
    
    print("\n✅✅✅ ALL SERVICES MODULE TESTS PASSED ✅✅✅")

def test_visa_alerts():
    """Test v3.0.2 Visa Entry/Exit Date + Dashboard Alerts"""
    print("\n=== TEST: v3.0.2 Visa Entry/Exit Date + Dashboard Alerts ===")
    
    # Login as tenant owner
    login(TENANT_OWNER)
    
    # Get or create client and supplier
    resp = session.get(f"{BASE_URL}/clients")
    clients = resp.json()
    if len(clients) == 0:
        resp = session.post(f"{BASE_URL}/clients", json={"name": "عميل تأشيرات", "phone": "111222"})
        client = resp.json()
        client_id = client['id']
    else:
        client_id = clients[0]['id']
    
    resp = session.get(f"{BASE_URL}/suppliers")
    suppliers = resp.json()
    if len(suppliers) == 0:
        resp = session.post(f"{BASE_URL}/suppliers", json={"name": "مورد تأشيرات", "phone": "333444"})
        supplier = resp.json()
        supplier_id = supplier['id']
    else:
        supplier_id = suppliers[0]['id']
    
    # 1. Create a visa with entry_date: today, expected_exit_date: today+5 days
    print("\n1. Create visa with expected_exit_date in 5 days")
    today = datetime.now()
    exit_5_days = today + timedelta(days=5)
    visa_data_1 = {
        "date": today.isoformat(),
        "service_type": "تأشيرة عمرة",
        "currency": "SAR",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "cost": 50,
        "sale_price": 80,
        "payment_method": "credit",
        "passenger_name": "محمد أحمد",
        "passport_no": "A12345678",
        "nationality": "يمني",
        "entry_date": today.isoformat(),
        "expected_exit_date": exit_5_days.isoformat()
    }
    resp = session.post(f"{BASE_URL}/visas", json=visa_data_1)
    assert resp.status_code == 200, f"Failed to create visa: {resp.text}"
    visa_1 = resp.json()
    visa_1_id = visa_1['id']
    print(f"Created visa 1: {visa_1['passenger_name']} (ID: {visa_1_id})")
    print(f"Entry date: {visa_1.get('entry_date')}, Expected exit: {visa_1.get('expected_exit_date')}")
    print("✅ PASSED - Visa 1 created with entry/exit dates")
    
    # 2. GET /api/dashboard — should have visa_alerts[] with the visa
    print("\n2. GET /dashboard - Check visa_alerts")
    resp = session.get(f"{BASE_URL}/dashboard")
    assert resp.status_code == 200, f"Failed to get dashboard: {resp.text}"
    dashboard = resp.json()
    assert 'visa_alerts' in dashboard, "visa_alerts not in dashboard response"
    alerts = dashboard['visa_alerts']
    print(f"Visa alerts count: {len(alerts)}")
    
    alert_1 = next((a for a in alerts if a['id'] == visa_1_id), None)
    assert alert_1 is not None, f"Visa 1 not found in alerts"
    print(f"Alert 1: {alert_1['passenger_name']}, days_left={alert_1['days_left']}, overdue={alert_1['overdue']}")
    assert alert_1['days_left'] in [4, 5], f"Expected days_left 4 or 5, got {alert_1['days_left']}"
    assert alert_1['overdue'] == False, f"Expected overdue=False, got {alert_1['overdue']}"
    print("✅ PASSED - Visa 1 appears in alerts with correct days_left and overdue=False")
    
    # 3. Create another visa with expected_exit_date = today - 2 days (overdue)
    print("\n3. Create overdue visa (exit date 2 days ago)")
    exit_overdue = today - timedelta(days=2)
    visa_data_2 = {
        "date": (today - timedelta(days=10)).isoformat(),
        "service_type": "تأشيرة عمرة",
        "currency": "SAR",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "cost": 60,
        "sale_price": 90,
        "payment_method": "credit",
        "passenger_name": "فاطمة علي",
        "passport_no": "B98765432",
        "nationality": "سعودي",
        "entry_date": (today - timedelta(days=10)).isoformat(),
        "expected_exit_date": exit_overdue.isoformat()
    }
    resp = session.post(f"{BASE_URL}/visas", json=visa_data_2)
    assert resp.status_code == 200, f"Failed to create visa 2: {resp.text}"
    visa_2 = resp.json()
    visa_2_id = visa_2['id']
    print(f"Created visa 2: {visa_2['passenger_name']} (ID: {visa_2_id})")
    print("✅ PASSED - Overdue visa created")
    
    # 4. GET /api/dashboard — should show overdue=true
    print("\n4. GET /dashboard - Check overdue visa in alerts")
    resp = session.get(f"{BASE_URL}/dashboard")
    dashboard = resp.json()
    alerts = dashboard['visa_alerts']
    
    alert_2 = next((a for a in alerts if a['id'] == visa_2_id), None)
    assert alert_2 is not None, f"Visa 2 not found in alerts"
    print(f"Alert 2: {alert_2['passenger_name']}, days_left={alert_2['days_left']}, overdue={alert_2['overdue']}")
    assert alert_2['days_left'] < 0, f"Expected negative days_left, got {alert_2['days_left']}"
    assert alert_2['overdue'] == True, f"Expected overdue=True, got {alert_2['overdue']}"
    print("✅ PASSED - Overdue visa appears in alerts with overdue=True")
    
    # 5. Create a visa with expected_exit_date = today + 20 days — should NOT appear
    print("\n5. Create visa with exit date 20 days away (outside 10-day window)")
    exit_20_days = today + timedelta(days=20)
    visa_data_3 = {
        "date": today.isoformat(),
        "service_type": "تأشيرة عمرة",
        "currency": "SAR",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "cost": 70,
        "sale_price": 100,
        "payment_method": "credit",
        "passenger_name": "عبدالله حسن",
        "passport_no": "C11223344",
        "nationality": "مصري",
        "entry_date": today.isoformat(),
        "expected_exit_date": exit_20_days.isoformat()
    }
    resp = session.post(f"{BASE_URL}/visas", json=visa_data_3)
    assert resp.status_code == 200, f"Failed to create visa 3: {resp.text}"
    visa_3 = resp.json()
    visa_3_id = visa_3['id']
    print(f"Created visa 3: {visa_3['passenger_name']} (ID: {visa_3_id})")
    
    resp = session.get(f"{BASE_URL}/dashboard")
    dashboard = resp.json()
    alerts = dashboard['visa_alerts']
    alert_3 = next((a for a in alerts if a['id'] == visa_3_id), None)
    assert alert_3 is None, f"Visa 3 should NOT appear in alerts (20 days away)"
    print("✅ PASSED - Visa with exit date 20 days away does NOT appear in alerts")
    
    # 6. Create a visa WITHOUT expected_exit_date — should NOT appear
    print("\n6. Create visa without expected_exit_date")
    visa_data_4 = {
        "date": today.isoformat(),
        "service_type": "تأشيرة عمرة",
        "currency": "SAR",
        "client_id": client_id,
        "supplier_id": supplier_id,
        "cost": 40,
        "sale_price": 70,
        "payment_method": "credit",
        "passenger_name": "سارة محمود",
        "passport_no": "D55667788",
        "nationality": "أردني"
    }
    resp = session.post(f"{BASE_URL}/visas", json=visa_data_4)
    assert resp.status_code == 200, f"Failed to create visa 4: {resp.text}"
    visa_4 = resp.json()
    visa_4_id = visa_4['id']
    print(f"Created visa 4: {visa_4['passenger_name']} (ID: {visa_4_id})")
    
    resp = session.get(f"{BASE_URL}/dashboard")
    dashboard = resp.json()
    alerts = dashboard['visa_alerts']
    alert_4 = next((a for a in alerts if a['id'] == visa_4_id), None)
    assert alert_4 is None, f"Visa 4 should NOT appear in alerts (no expected_exit_date)"
    print("✅ PASSED - Visa without expected_exit_date does NOT appear in alerts")
    
    # 7. POST /api/visas/:id/mark-exited
    print("\n7. POST /visas/:id/mark-exited")
    resp = session.post(f"{BASE_URL}/visas/{visa_1_id}/mark-exited")
    assert resp.status_code == 200, f"Failed to mark visa as exited: {resp.text}"
    result = resp.json()
    assert result['success'] == True, "mark-exited did not return success"
    assert result['is_exited'] == True, "is_exited not set to True"
    print(f"Visa 1 marked as exited: {result}")
    print("✅ PASSED - Visa marked as exited")
    
    # 8. GET /api/dashboard — visa 1 should no longer appear in alerts
    print("\n8. GET /dashboard - Verify exited visa removed from alerts")
    resp = session.get(f"{BASE_URL}/dashboard")
    dashboard = resp.json()
    alerts = dashboard['visa_alerts']
    alert_1_after = next((a for a in alerts if a['id'] == visa_1_id), None)
    assert alert_1_after is None, f"Visa 1 should NOT appear in alerts after marking as exited"
    print("✅ PASSED - Exited visa removed from alerts")
    
    # 9. POST /api/visas/:id/unmark-exited
    print("\n9. POST /visas/:id/unmark-exited")
    resp = session.post(f"{BASE_URL}/visas/{visa_1_id}/unmark-exited")
    assert resp.status_code == 200, f"Failed to unmark visa: {resp.text}"
    result = resp.json()
    assert result['success'] == True, "unmark-exited did not return success"
    assert result['is_exited'] == False, "is_exited not set to False"
    print(f"Visa 1 unmarked: {result}")
    
    resp = session.get(f"{BASE_URL}/dashboard")
    dashboard = resp.json()
    alerts = dashboard['visa_alerts']
    alert_1_restored = next((a for a in alerts if a['id'] == visa_1_id), None)
    assert alert_1_restored is not None, f"Visa 1 should re-appear in alerts after unmarking"
    print("✅ PASSED - Unmarked visa re-appears in alerts")
    
    print("\n✅✅✅ ALL VISA ALERTS TESTS PASSED ✅✅✅")

def test_strict_import_validation():
    """Test v3.0.3 Strict Excel Import Validation (no auto-create)"""
    print("\n=== TEST: v3.0.3 Strict Excel Import Validation ===")
    
    # Login as tenant owner
    login(TENANT_OWNER)
    
    # Get existing clients and suppliers count
    resp = session.get(f"{BASE_URL}/clients")
    clients_before = len(resp.json())
    resp = session.get(f"{BASE_URL}/suppliers")
    suppliers_before = len(resp.json())
    print(f"Clients before: {clients_before}, Suppliers before: {suppliers_before}")
    
    # Create one valid client and supplier for row (a)
    resp = session.post(f"{BASE_URL}/clients", json={"name": "عميل استيراد صحيح", "phone": "555666"})
    valid_client = resp.json()
    resp = session.post(f"{BASE_URL}/suppliers", json={"name": "مورد استيراد صحيح", "phone": "777888"})
    valid_supplier = resp.json()
    
    # 1. POST /api/import/tickets/preview with 3 rows
    print("\n1. POST /import/tickets/preview - Test validation")
    rows = [
        {  # (a) Valid row
            "pnr": "VALID001",
            "route": "صنعاء - جدة",
            "passenger_name": "أحمد محمد",
            "client_name": "عميل استيراد صحيح",
            "supplier_name": "مورد استيراد صحيح",
            "currency": "SAR",
            "cost": 500,
            "sale_price": 600
        },
        {  # (b) Non-existent client
            "pnr": "INVALID001",
            "route": "عدن - الرياض",
            "passenger_name": "فاطمة علي",
            "client_name": "عميل غير موجود XYZ",
            "supplier_name": "مورد استيراد صحيح",
            "currency": "SAR",
            "cost": 400,
            "sale_price": 500
        },
        {  # (c) Non-existent supplier
            "pnr": "INVALID002",
            "route": "تعز - دبي",
            "passenger_name": "خالد حسن",
            "client_name": "عميل استيراد صحيح",
            "supplier_name": "مورد غير موجود ABC",
            "currency": "SAR",
            "cost": 600,
            "sale_price": 700
        }
    ]
    
    resp = session.post(f"{BASE_URL}/import/tickets/preview", json={"rows": rows, "skip_duplicates": True})
    assert resp.status_code == 200, f"Failed to preview import: {resp.text}"
    preview = resp.json()
    print(f"Preview response: valid_count={preview.get('valid_count')}")
    
    # 2. Response should show __errors for rows (b) and (c)
    print("\n2. Verify __errors for invalid rows")
    validated_rows = preview['rows']
    assert len(validated_rows) == 3, f"Expected 3 rows, got {len(validated_rows)}"
    
    row_a = validated_rows[0]
    row_b = validated_rows[1]
    row_c = validated_rows[2]
    
    print(f"Row A errors: {row_a.get('__errors')}")
    assert len(row_a['__errors']) == 0, f"Row A should have no errors, got {row_a['__errors']}"
    print("✅ Row A (valid) has no errors")
    
    print(f"Row B errors: {row_b.get('__errors')}")
    assert len(row_b['__errors']) > 0, "Row B should have errors"
    error_text_b = ' '.join(row_b['__errors'])
    assert 'غير موجود في دليل الحسابات' in error_text_b, f"Expected Arabic error message in row B, got: {error_text_b}"
    assert 'عميل غير موجود XYZ' in error_text_b, f"Expected client name in error, got: {error_text_b}"
    print("✅ Row B (non-existent client) has correct error message")
    
    print(f"Row C errors: {row_c.get('__errors')}")
    assert len(row_c['__errors']) > 0, "Row C should have errors"
    error_text_c = ' '.join(row_c['__errors'])
    assert 'غير موجود في دليل الحسابات' in error_text_c, f"Expected Arabic error message in row C, got: {error_text_c}"
    assert 'مورد غير موجود ABC' in error_text_c, f"Expected supplier name in error, got: {error_text_c}"
    print("✅ Row C (non-existent supplier) has correct error message")
    
    assert preview['valid_count'] == 1, f"Expected valid_count=1, got {preview['valid_count']}"
    print("✅ PASSED - Preview validation correct")
    
    # 3. POST /api/import/tickets with same rows
    print("\n3. POST /import/tickets - Attempt import")
    resp = session.post(f"{BASE_URL}/import/tickets", json={"rows": rows, "skip_duplicates": True})
    assert resp.status_code == 200, f"Failed to import: {resp.text}"
    import_result = resp.json()
    print(f"Import result: created={import_result['created']}, failed={import_result['failed']}, skipped={import_result['skipped']}")
    
    assert import_result['created'] == 1, f"Expected 1 created, got {import_result['created']}"
    assert import_result['failed'] == 2, f"Expected 2 failed, got {import_result['failed']}"
    assert len(import_result['errors']) == 2, f"Expected 2 error entries, got {len(import_result['errors'])}"
    
    # Verify error messages contain Arabic text
    for err in import_result['errors']:
        error_msg = ' '.join(err['errors'])
        assert 'غير موجود في دليل الحسابات' in error_msg, f"Expected Arabic error in import errors, got: {error_msg}"
    print("✅ PASSED - Import created 1, failed 2 with correct error messages")
    
    # 4. Verify NO new client/supplier documents were auto-created
    print("\n4. Verify no auto-creation of clients/suppliers")
    resp = session.get(f"{BASE_URL}/clients")
    clients_after = len(resp.json())
    resp = session.get(f"{BASE_URL}/suppliers")
    suppliers_after = len(resp.json())
    print(f"Clients after: {clients_after}, Suppliers after: {suppliers_after}")
    
    # We created 1 valid client for testing, so clients_after should be clients_before + 1
    assert clients_after == clients_before + 1, f"Clients count changed unexpectedly: before={clients_before}, after={clients_after}"
    assert suppliers_after == suppliers_before + 1, f"Suppliers count changed unexpectedly: before={suppliers_before}, after={suppliers_after}"
    print("✅ PASSED - No auto-creation of non-existent clients/suppliers")
    
    # 5. Repeat for visas
    print("\n5. POST /import/visas/preview - Test validation")
    visa_rows = [
        {  # Valid
            "passport_no": "V12345678",
            "passenger_name": "محمد أحمد",
            "service_type": "تأشيرة عمرة",
            "client_name": "عميل استيراد صحيح",
            "supplier_name": "مورد استيراد صحيح",
            "currency": "SAR",
            "cost": 300,
            "sale_price": 400
        },
        {  # Non-existent client
            "passport_no": "V87654321",
            "passenger_name": "فاطمة علي",
            "service_type": "تأشيرة عمرة",
            "client_name": "عميل تأشيرات غير موجود",
            "supplier_name": "مورد استيراد صحيح",
            "currency": "SAR",
            "cost": 250,
            "sale_price": 350
        }
    ]
    
    resp = session.post(f"{BASE_URL}/import/visas/preview", json={"rows": visa_rows, "skip_duplicates": True})
    assert resp.status_code == 200, f"Failed to preview visa import: {resp.text}"
    preview = resp.json()
    print(f"Visa preview: valid_count={preview.get('valid_count')}")
    
    validated_rows = preview['rows']
    assert len(validated_rows) == 2, f"Expected 2 rows, got {len(validated_rows)}"
    assert len(validated_rows[0]['__errors']) == 0, "First visa row should be valid"
    assert len(validated_rows[1]['__errors']) > 0, "Second visa row should have errors"
    error_text = ' '.join(validated_rows[1]['__errors'])
    assert 'غير موجود في دليل الحسابات' in error_text, f"Expected Arabic error in visa preview, got: {error_text}"
    print("✅ PASSED - Visa preview validation correct")
    
    print("\n6. POST /import/visas - Attempt import")
    resp = session.post(f"{BASE_URL}/import/visas", json={"rows": visa_rows, "skip_duplicates": True})
    assert resp.status_code == 200, f"Failed to import visas: {resp.text}"
    import_result = resp.json()
    print(f"Visa import result: created={import_result['created']}, failed={import_result['failed']}")
    
    assert import_result['created'] == 1, f"Expected 1 visa created, got {import_result['created']}"
    assert import_result['failed'] == 1, f"Expected 1 visa failed, got {import_result['failed']}"
    print("✅ PASSED - Visa import created 1, failed 1")
    
    print("\n✅✅✅ ALL STRICT IMPORT VALIDATION TESTS PASSED ✅✅✅")

def test_regression():
    """Test regression - ensure existing features still work"""
    print("\n=== TEST: Regression Tests ===")
    
    # 1. Health endpoint
    print("\n1. GET /health")
    resp = session.get(f"{BASE_URL}/health")
    assert resp.status_code == 200, f"Health check failed: {resp.text}"
    data = resp.json()
    assert data.get("status") == "ok", "Health status not ok"
    print("✅ PASSED - Health endpoint working")
    
    # Login as tenant owner
    login(TENANT_OWNER)
    
    # 2. Standard ticket create/edit/delete flow
    print("\n2. Ticket create/edit/delete flow")
    resp = session.get(f"{BASE_URL}/clients")
    clients = resp.json()
    client_id = clients[0]['id'] if len(clients) > 0 else None
    resp = session.get(f"{BASE_URL}/suppliers")
    suppliers = resp.json()
    supplier_id = suppliers[0]['id'] if len(suppliers) > 0 else None
    
    if not client_id or not supplier_id:
        print("⚠️ SKIPPED - No clients/suppliers available")
    else:
        ticket_data = {
            "date": datetime.now().isoformat(),
            "pnr": "REG001",
            "route": "صنعاء - القاهرة",
            "passenger_name": "اختبار",
            "currency": "USD",
            "client_id": client_id,
            "supplier_id": supplier_id,
            "cost": 100,
            "sale_price": 150,
            "payment_method": "credit"
        }
        resp = session.post(f"{BASE_URL}/tickets", json=ticket_data)
        assert resp.status_code == 200, f"Failed to create ticket: {resp.text}"
        ticket = resp.json()
        ticket_id = ticket['id']
        print(f"Created ticket: {ticket_id}")
        
        # Edit
        resp = session.put(f"{BASE_URL}/tickets/{ticket_id}", json={**ticket_data, "sale_price": 180})
        assert resp.status_code == 200, f"Failed to edit ticket: {resp.text}"
        print(f"Edited ticket: {ticket_id}")
        
        # Delete
        resp = session.delete(f"{BASE_URL}/tickets/{ticket_id}")
        assert resp.status_code == 200, f"Failed to delete ticket: {resp.text}"
        print(f"Deleted ticket: {ticket_id}")
        print("✅ PASSED - Ticket CRUD working")
    
    # 3. Visa create with OLD payload (no entry_date/expected_exit_date)
    print("\n3. Visa create with old payload (backward compatibility)")
    if not client_id or not supplier_id:
        print("⚠️ SKIPPED - No clients/suppliers available")
    else:
        visa_data = {
            "date": datetime.now().isoformat(),
            "service_type": "تأشيرة عمرة",
            "passenger_name": "اختبار قديم",
            "passport_no": "OLD123456",
            "currency": "SAR",
            "client_id": client_id,
            "supplier_id": supplier_id,
            "cost": 200,
            "sale_price": 300,
            "payment_method": "credit"
        }
        resp = session.post(f"{BASE_URL}/visas", json=visa_data)
        assert resp.status_code == 200, f"Failed to create visa with old payload: {resp.text}"
        visa = resp.json()
        print(f"Created visa with old payload: {visa['id']}")
        print("✅ PASSED - Visa backward compatibility working")
    
    # 4. Voucher receipt/payment
    print("\n4. Voucher receipt/payment")
    resp = session.get(f"{BASE_URL}/boxes")
    boxes = resp.json()
    if len(boxes) == 0:
        print("⚠️ SKIPPED - No boxes available")
    else:
        box_id = boxes[0]['id']
        if client_id:
            voucher_data = {
                "type": "receipt",
                "date": datetime.now().isoformat(),
                "currency": "SAR",
                "amount": 100,
                "party_type": "client",
                "party_id": client_id,
                "box_id": box_id,
                "description": "اختبار سند قبض"
            }
            resp = session.post(f"{BASE_URL}/vouchers", json=voucher_data)
            assert resp.status_code == 200, f"Failed to create receipt voucher: {resp.text}"
            print(f"Created receipt voucher")
            print("✅ PASSED - Voucher working")
        else:
            print("⚠️ SKIPPED - No client available")
    
    # 5. FX buy/sell
    print("\n5. FX buy/sell")
    resp = session.get(f"{BASE_URL}/boxes")
    boxes = resp.json()
    if len(boxes) < 2:
        print("⚠️ SKIPPED - Need at least 2 boxes for FX")
    else:
        fx_data = {
            "type": "buy",
            "date": datetime.now().isoformat(),
            "currency": "USD",
            "amount": 100,
            "counter_currency": "SAR",
            "exchange_rate": 3.75,
            "payment_method": "cash",
            "box_currency_id": boxes[0]['id'],
            "box_counter_id": boxes[1]['id']
        }
        resp = session.post(f"{BASE_URL}/fx", json=fx_data)
        assert resp.status_code == 200, f"Failed to create FX: {resp.text}"
        print(f"Created FX transaction")
        print("✅ PASSED - FX working")
    
    # 6. Super admin: GET /api/admin/tenants
    print("\n6. Super admin: GET /admin/tenants")
    login(SUPER_ADMIN)
    resp = session.get(f"{BASE_URL}/admin/tenants")
    assert resp.status_code == 200, f"Failed to get tenants: {resp.text}"
    tenants = resp.json()
    assert 'tenants' in tenants, "tenants key not in response"
    print(f"Found {len(tenants['tenants'])} tenants")
    print("✅ PASSED - Super admin endpoints working")
    
    print("\n✅✅✅ ALL REGRESSION TESTS PASSED ✅✅✅")

def main():
    """Run all tests"""
    print("=" * 80)
    print("RAHAAL ERP v3.0 BACKEND TESTING SUITE")
    print("=" * 80)
    
    try:
        # Test health first
        test_health()
        
        # Test v3.0 features
        test_services_module()
        test_visa_alerts()
        test_strict_import_validation()
        
        # Test regression
        test_regression()
        
        print("\n" + "=" * 80)
        print("🎉🎉🎉 ALL TESTS PASSED SUCCESSFULLY 🎉🎉🎉")
        print("=" * 80)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        raise

if __name__ == "__main__":
    main()
