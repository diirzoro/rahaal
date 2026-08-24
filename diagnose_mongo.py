#!/usr/bin/env python3
"""
Diagnostic script to check MongoDB state
"""

from pymongo import MongoClient
import json

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "your_database_name"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

print("="*80)
print("CHECKING MERAAJ_EVENTS COLLECTION")
print("="*80)

# Get latest 5 events
events = list(db.meraaj_events.find().sort("created_at", -1).limit(5))
print(f"\nFound {len(events)} recent events:")

for event in events:
    print(f"\n- Event Type: {event.get('event_type')}")
    print(f"  Package Ref: {event.get('payload', {}).get('package_ref')}")
    print(f"  Created At: {event.get('created_at')}")
    print(f"  Delivery Status: {event.get('delivery_status')}")

print("\n" + "="*80)
print("CHECKING MERAAJ_INBOUND_BOOKINGS COLLECTION")
print("="*80)

# Get latest 5 inbound bookings
inbounds = list(db.meraaj_inbound_bookings.find().sort("created_at", -1).limit(5))
print(f"\nFound {len(inbounds)} recent inbound bookings:")

for inbound in inbounds:
    print(f"\n- ID: {inbound.get('_id')}")
    print(f"  Event ID: {inbound.get('event_id')}")
    print(f"  Status: {inbound.get('status')}")
    print(f"  Package Ref: {inbound.get('package_ref')}")
    print(f"  Created At: {inbound.get('created_at')}")

print("\n" + "="*80)
print("CHECKING PACKAGES WITH MERAAJ.SHARED=TRUE")
print("="*80)

# Get packages with meraaj.shared=true
packages = list(db.packages.find({"meraaj.shared": True}).limit(5))
print(f"\nFound {len(packages)} shared packages:")

for pkg in packages:
    print(f"\n- ID: {pkg.get('id')}")
    print(f"  Name: {pkg.get('name')}")
    print(f"  Meraaj Shared: {pkg.get('meraaj', {}).get('shared')}")
    print(f"  Market Pricing Rows: {len(pkg.get('meraaj', {}).get('market_pricing', []))}")
