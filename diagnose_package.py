#!/usr/bin/env python3
"""
Check package structure and archived field
"""

from pymongo import MongoClient
import json

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "your_database_name"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

print("="*80)
print("CHECKING PACKAGE STRUCTURE")
print("="*80)

# Get one package and print all top-level fields
pkg = db.packages.find_one()
if pkg:
    print("\nSample package document top-level fields:")
    for key in sorted(pkg.keys()):
        value_type = type(pkg[key]).__name__
        if isinstance(pkg[key], (str, int, float, bool, type(None))):
            print(f"  - {key}: {value_type} = {pkg[key]}")
        else:
            print(f"  - {key}: {value_type}")
else:
    print("No packages found")

print("\n" + "="*80)
print("CHECKING FOR ARCHIVED PACKAGES")
print("="*80)

# Check if any packages have archived field
archived_packages = list(db.packages.find({"archived": True}).limit(5))
print(f"\nFound {len(archived_packages)} archived packages")

if len(archived_packages) > 0:
    print("\nSample archived package:")
    pkg = archived_packages[0]
    print(f"  - ID: {pkg.get('id')}")
    print(f"  - Name: {pkg.get('name')}")
    print(f"  - Archived: {pkg.get('archived')}")

# Check for packages with status field
print("\n" + "="*80)
print("CHECKING FOR PACKAGES WITH STATUS FIELD")
print("="*80)

status_packages = list(db.packages.find({"status": {"$exists": True}}).limit(5))
print(f"\nFound {len(status_packages)} packages with status field")

if len(status_packages) > 0:
    print("\nSample package with status:")
    pkg = status_packages[0]
    print(f"  - ID: {pkg.get('id')}")
    print(f"  - Name: {pkg.get('name')}")
    print(f"  - Status: {pkg.get('status')}")
