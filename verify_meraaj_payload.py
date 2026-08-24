#!/usr/bin/env python3
"""
Verify that supplier_id is NOT included in Meraaj package.updated event payloads
"""
import requests
import os
from pymongo import MongoClient

BASE_URL = "http://localhost:3000/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "your_database_name")

# Login
print("🔐 Logging in as owner...")
resp = requests.post(f"{BASE_URL}/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
if resp.status_code != 200:
    print(f"❌ Login failed: {resp.status_code}")
    exit(1)
cookies = resp.cookies
print("✅ Login successful")

# Create test package with supplier_id
print("\n📝 Creating test package with supplier_id...")
resp = requests.post(f"{BASE_URL}/packages", json={
    "name": "Meraaj Payload Test",
    "package_type": "umrah",
    "currency": "SAR",
    "supplier_id": "test-supplier-123"
}, cookies=cookies)
if resp.status_code != 200:
    print(f"❌ Failed to create package: {resp.text}")
    exit(1)
pkg_id = resp.json()["id"]
print(f"✅ Package created: {pkg_id}")

# Mark package as shared in MongoDB
print("\n🔧 Marking package as shared in MongoDB...")
client = MongoClient(MONGO_URL)
db = client[DB_NAME]
result = db.packages.update_one(
    {"id": pkg_id},
    {"$set": {"meraaj.shared": True}}
)
if result.modified_count == 0:
    print("❌ Failed to mark package as shared")
    exit(1)
print("✅ Package marked as shared")

# Trigger package.updated event by PATCHing the package
print("\n🔄 Triggering package.updated event...")
resp = requests.patch(f"{BASE_URL}/packages/{pkg_id}", json={
    "notes": "Trigger event for Meraaj payload test"
}, cookies=cookies)
if resp.status_code != 200:
    print(f"❌ Failed to PATCH package: {resp.text}")
    exit(1)
print("✅ Package updated (event should be emitted)")

# Check meraaj_events collection for the latest package.updated event
print("\n🔍 Checking meraaj_events for package.updated payload...")
event = db.meraaj_events.find_one(
    {"type": "package.updated", "payload.package_ref": pkg_id},
    sort=[("created_at", -1)]
)

if not event:
    print("❌ No package.updated event found")
    exit(1)

print(f"✅ Found package.updated event: {event['id']}")

# Check if supplier_id or supplier is in the payload
payload = event.get("payload", {})
has_supplier_id = "supplier_id" in payload
has_supplier = "supplier" in payload

print(f"\n📋 Payload inspection:")
print(f"   Has 'supplier_id' key: {has_supplier_id}")
print(f"   Has 'supplier' key: {has_supplier}")

if has_supplier_id or has_supplier:
    print(f"\n❌ FAIL: Meraaj payload contains supplier field(s)")
    if has_supplier_id:
        print(f"   supplier_id value: {payload.get('supplier_id')}")
    if has_supplier:
        print(f"   supplier value: {payload.get('supplier')}")
    exit(1)
else:
    print(f"\n✅ PASS: Meraaj payload does NOT contain supplier_id or supplier")

# Verify package document still has supplier_id
pkg_doc = db.packages.find_one({"id": pkg_id}, {"supplier_id": 1})
if pkg_doc and pkg_doc.get("supplier_id") == "test-supplier-123":
    print(f"✅ Package document still has supplier_id (internal field preserved)")
else:
    print(f"⚠️ Package document supplier_id: {pkg_doc.get('supplier_id') if pkg_doc else 'NOT FOUND'}")

# Cleanup
print("\n🗑️ Cleaning up...")
resp = requests.delete(f"{BASE_URL}/packages/{pkg_id}", cookies=cookies)
if resp.status_code == 200:
    print("✅ Test package deleted")
else:
    print(f"⚠️ Could not delete package: {resp.status_code}")

print("\n✅ Meraaj payload verification complete!")
