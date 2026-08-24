#!/usr/bin/env python3
"""
Check event types for archived packages
"""

from pymongo import MongoClient
import json

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "your_database_name"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

print("="*80)
print("CHECKING ALL UNIQUE EVENT TYPES")
print("="*80)

# Get all unique event types
event_types = db.meraaj_events.distinct("type")
print(f"\nFound {len(event_types)} unique event types:")
for event_type in sorted(event_types):
    count = db.meraaj_events.count_documents({"type": event_type})
    print(f"  - {event_type}: {count} events")

print("\n" + "="*80)
print("CHECKING RECENT EVENTS FOR PACKAGE ff03d451-4e16-4477-8f4e-62731656824e")
print("="*80)

# Get events for the test package
events = list(db.meraaj_events.find({
    "payload.package_ref": "ff03d451-4e16-4477-8f4e-62731656824e"
}).sort("created_at", 1))

print(f"\nFound {len(events)} events:")
for event in events:
    print(f"\n- Type: {event.get('type')}")
    print(f"  Created At: {event.get('created_at')}")
    print(f"  Status: {event.get('status')}")

print("\n" + "="*80)
print("CHECKING MERAAJ AUTO_APPROVE SETTING")
print("="*80)

# Check tenant_settings for auto_approve
tenant_settings = db.tenant_settings.find_one()
if tenant_settings:
    meraaj_auto_approve = tenant_settings.get("meraaj_auto_approve")
    print(f"\nmeraaj_auto_approve: {meraaj_auto_approve}")
else:
    print("\nNo tenant_settings found")
