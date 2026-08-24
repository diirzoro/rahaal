#!/usr/bin/env python3
"""Debug passport-report endpoint"""

import requests
import os
from datetime import datetime
from pymongo import MongoClient
import uuid

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://visa-booking-5.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'your_database_name')

OWNER_EMAIL = 'owner@demo.com'
OWNER_PASSWORD = 'Demo@2025'

def login(email, password):
    resp = requests.post(f"{API_URL}/auth/login", json={'email': email, 'password': password})
    return resp.cookies

def get_tenant_id(cookies):
    resp = requests.get(f"{API_URL}/auth/me", cookies=cookies)
    return resp.json().get('tenant_id')

owner_cookies = login(OWNER_EMAIL, OWNER_PASSWORD)
tenant_id = get_tenant_id(owner_cookies)

print(f"Tenant ID: {tenant_id}")

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Create test data
bk1_id = f"bk-debug-{uuid.uuid4().hex[:8]}"
i1_id = f"inb-debug-{uuid.uuid4().hex[:8]}"

print(f"\nCreating package_bookings: {bk1_id}")
bk1_doc = {
    'id': bk1_id,
    'tenant_id': tenant_id,
    'package_id': 'pp1',
    'registrants': [
        {'name': 'م1', 'age': 30, 'passport_no': 'A1111111'},
        {'name': 'م2', 'age': 25, 'passport_no': ''}
    ],
    'pax_adults': 2,
    'total_sale': 2000,
    'created_at': datetime.utcnow()
}
db.package_bookings.insert_one(bk1_doc)
print(f"✅ Created package_bookings")

print(f"\nCreating inbound: {i1_id}")
i1_doc = {
    'id': i1_id,
    'tenant_id': tenant_id,
    'status': 'approved',
    'booking_id': bk1_id,
    'package_id': 'pp1',
    'package_name': 'باكج تقرير 1',
    'buyer_office_name': 'مكتب ت1',
    'meraaj_booking_ref': 'R1',
    'registrants': [
        {'name': 'م1', 'passport_no': ''},
        {'name': 'م2', 'passport_no': ''}
    ],
    'seats': 2,
    'total_price': 2000,
    'net_to_seller_total': 1800,
    'currency': 'SAR',
    'created_at': datetime.utcnow()
}
db.meraaj_inbound_bookings.insert_one(i1_doc)
print(f"✅ Created inbound")

# Verify in DB
print(f"\nVerifying in MongoDB...")
inb_check = db.meraaj_inbound_bookings.find_one({'id': i1_id})
print(f"  Inbound found: {inb_check is not None}")
if inb_check:
    print(f"  tenant_id: {inb_check['tenant_id']}")
    print(f"  status: {inb_check['status']}")
    print(f"  booking_id: {inb_check['booking_id']}")

bk_check = db.package_bookings.find_one({'id': bk1_id})
print(f"  Booking found: {bk_check is not None}")
if bk_check:
    print(f"  tenant_id: {bk_check['tenant_id']}")
    print(f"  registrants: {bk_check['registrants']}")

# Query like the endpoint does
print(f"\nQuerying like endpoint...")
q = {'tenant_id': tenant_id, 'status': 'approved'}
inbounds = list(db.meraaj_inbound_bookings.find(q).limit(10))
print(f"  Found {len(inbounds)} approved inbounds")

# Call API
print(f"\nCalling GET /api/meraaj/passport-report...")
resp = requests.get(f"{API_URL}/meraaj/passport-report", cookies=owner_cookies)
print(f"  Status: {resp.status_code}")
if resp.status_code == 200:
    data = resp.json()
    print(f"  total_missing: {data.get('total_missing')}")
    print(f"  scanned_bookings: {data.get('scanned_bookings')}")
    print(f"  rows: {len(data.get('rows', []))}")
    if data.get('rows'):
        for row in data['rows']:
            print(f"    - {row['name']} (inbound_id: {row['inbound_id']})")
else:
    print(f"  Error: {resp.text}")

# Cleanup
print(f"\nCleaning up...")
db.meraaj_inbound_bookings.delete_one({'id': i1_id})
db.package_bookings.delete_one({'id': bk1_id})
print(f"✅ Cleaned up")

client.close()
