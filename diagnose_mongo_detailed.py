#!/usr/bin/env python3
"""
Detailed diagnostic script to check actual field names
"""

from pymongo import MongoClient
import json

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "your_database_name"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

print("="*80)
print("CHECKING ACTUAL EVENT DOCUMENT STRUCTURE")
print("="*80)

# Get one event and print all fields
event = db.meraaj_events.find_one()
if event:
    print("\nSample event document fields:")
    for key in event.keys():
        print(f"  - {key}: {type(event[key]).__name__}")
    
    print("\nFull event document:")
    print(json.dumps({k: str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v 
                      for k, v in event.items()}, indent=2, ensure_ascii=False))
else:
    print("No events found")

print("\n" + "="*80)
print("CHECKING ACTUAL INBOUND BOOKING DOCUMENT STRUCTURE")
print("="*80)

# Get one inbound booking and print all fields
inbound = db.meraaj_inbound_bookings.find_one()
if inbound:
    print("\nSample inbound booking document fields:")
    for key in inbound.keys():
        print(f"  - {key}: {type(inbound[key]).__name__}")
    
    print("\nFull inbound booking document (first 1000 chars):")
    doc_str = json.dumps({k: str(v) if not isinstance(v, (str, int, float, bool, type(None), list)) else v 
                          for k, v in inbound.items()}, indent=2, ensure_ascii=False)
    print(doc_str[:1000])
else:
    print("No inbound bookings found")
