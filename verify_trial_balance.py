#!/usr/bin/env python3
"""
Verify trial balance and journal entries
"""

import requests

BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"

# Login
session = requests.Session()
r = session.post(f"{BASE_URL}/auth/login", json={
    "email": "owner@demo.com",
    "password": "<DEMO_PASSWORD-see-memory/test_credentials.md>"
}, timeout=10)

if r.status_code != 200:
    print(f"Login failed: {r.status_code}")
    exit(1)

print("✅ Logged in\n")

# Get journal entries
r = session.get(f"{BASE_URL}/journal-entries", timeout=10)
jes = r.json()

print(f"Total journal entries: {len(jes)}\n")

# Check each journal entry for balance
print("Checking journal entries for balance:")
print("="*80)

for je in jes[:10]:  # Check first 10
    lines = je.get('lines', [])
    currency = je.get('currency', 'UNKNOWN')
    
    # Group by currency if MULTI
    if currency == 'MULTI':
        currency_totals = {}
        for line in lines:
            cur = line.get('currency', 'UNKNOWN')
            if cur not in currency_totals:
                currency_totals[cur] = {'debit': 0, 'credit': 0}
            currency_totals[cur]['debit'] += line.get('debit', 0)
            currency_totals[cur]['credit'] += line.get('credit', 0)
        
        print(f"JE {je.get('id')[:8]}... ({je.get('ref_type')}) - MULTI currency:")
        for cur, totals in currency_totals.items():
            balanced = abs(totals['debit'] - totals['credit']) < 0.01
            status = "✅" if balanced else "❌"
            print(f"  {status} {cur}: D={totals['debit']:.2f}, C={totals['credit']:.2f}")
    else:
        total_debit = sum(l.get('debit', 0) for l in lines)
        total_credit = sum(l.get('credit', 0) for l in lines)
        balanced = abs(total_debit - total_credit) < 0.01
        status = "✅" if balanced else "❌"
        print(f"{status} JE {je.get('id')[:8]}... ({je.get('ref_type')}) - {currency}: D={total_debit:.2f}, C={total_credit:.2f}")

print("\n" + "="*80)

# Get trial balance
r = session.get(f"{BASE_URL}/reports/trial-balance", timeout=10)
tb = r.json()

print("\nTrial Balance Totals:")
print("="*80)
totals = tb.get('totals', {})
for currency, values in totals.items():
    if isinstance(values, dict):
        debit = values.get('d', 0)
        credit = values.get('c', 0)
        diff = abs(debit - credit)
        balanced = diff < 0.01
        status = "✅" if balanced else "❌"
        print(f"{status} {currency}: Debit={debit:.2f}, Credit={credit:.2f}, Diff={diff:.2f}")

print("\n" + "="*80)
print("\nNote: In multi-currency systems with FX transactions, the trial balance")
print("may show imbalances in individual currencies because FX gain/loss lines")
print("are recorded in USD to balance the multi-currency journal entries.")
