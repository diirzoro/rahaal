#!/usr/bin/env python3
"""
Final cleanup of remaining test data
"""

from pymongo import MongoClient

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "your_database_name"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

print("="*80)
print("FINAL CLEANUP OF REMAINING TEST DATA")
print("="*80)

# Delete packages with "TARGETED TEST" in name
result = db.packages.delete_many({"name": {"$regex": "TARGETED TEST"}})
print(f"\n✅ Deleted {result.deleted_count} test packages")

# Delete inbound bookings for test packages (already deleted, but check)
result = db.meraaj_inbound_bookings.delete_many({"package_name": {"$regex": "TARGETED TEST"}})
print(f"✅ Deleted {result.deleted_count} test inbound bookings")

# Delete events for test packages (already deleted, but check)
result = db.meraaj_events.delete_many({"payload.package_ref": {"$regex": "TARGETED TEST"}})
print(f"✅ Deleted {result.deleted_count} test events")

# Delete webhook logs for test packages
result = db.meraaj_webhook_log.delete_many({"package_ref": {"$regex": "TARGETED TEST"}})
print(f"✅ Deleted {result.deleted_count} test webhook logs")

print("\n✅ Final cleanup complete")
