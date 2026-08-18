#!/bin/bash
# v3.9.22 Phase B — Services + Packages payment refactor smoke test
set -e
BASE="http://localhost:3000/api"
COOKIE=/tmp/rahaal_smoke_b.txt
rm -f $COOKIE

echo "==> LOGIN"
curl -s -c $COOKIE -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"owner@demo.com","password":"<DEMO_PASSWORD-see-memory/test_credentials.md>"}' >/dev/null
echo "  logged in"

echo; echo "==> Lookup helpers"
CLIENT_ID=$(curl -s -b $COOKIE "$BASE/clients" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
SUPPLIER_ID=$(curl -s -b $COOKIE "$BASE/suppliers" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
CASH_BOX=$(curl -s -b $COOKIE "$BASE/boxes" | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((b['id'] for b in d if b.get('type')=='cash'), (d[0]['id'] if d else '')))")
BANK_BOX=$(curl -s -b $COOKIE "$BASE/boxes" | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((b['id'] for b in d if b.get('type')=='bank'), ''))")
echo "  CLIENT=$CLIENT_ID | SUP=$SUPPLIER_ID | CASHBOX=$CASH_BOX | BANK=$BANK_BOX"

echo; echo "==> T1: SERVICE credit (client_id required, no box_id)"
R=$(curl -s -b $COOKIE -X POST "$BASE/services" -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$CLIENT_ID\",\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"SAR\",\"exchange_rate\":0.267,\"cost\":200,\"sale_price\":350,\"payment_method\":\"credit\",\"service_type\":\"إقامة فندقية\",\"beneficiary_name\":\"عميل خدمة آجل\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| client:',d.get('client_name'),'| box:',d.get('box_id'))"

echo; echo "==> T2: SERVICE cash (no client_id, cash box)"
R=$(curl -s -b $COOKIE -X POST "$BASE/services" -H "Content-Type: application/json" \
  -d "{\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"SAR\",\"exchange_rate\":0.267,\"cost\":200,\"sale_price\":350,\"payment_method\":\"cash\",\"box_id\":\"$CASH_BOX\",\"service_type\":\"إقامة فندقية\",\"beneficiary_name\":\"عميل خدمة نقد\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| client_id:',d.get('client_id'),'| client_name:',d.get('client_name'),'| box:',d.get('box_name'))"

if [ -n "$BANK_BOX" ]; then
echo; echo "==> T3: SERVICE cash via BANK"
R=$(curl -s -b $COOKIE -X POST "$BASE/services" -H "Content-Type: application/json" \
  -d "{\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"USD\",\"exchange_rate\":1,\"cost\":50,\"sale_price\":80,\"payment_method\":\"cash\",\"box_id\":\"$BANK_BOX\",\"service_type\":\"إقامة فندقية\",\"beneficiary_name\":\"تحويل بنكي\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| box:',d.get('box_name'))"
fi

echo; echo "==> T4: SERVICE credit without client_id (should FAIL)"
R=$(curl -s -b $COOKIE -X POST "$BASE/services" -H "Content-Type: application/json" \
  -d "{\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"SAR\",\"cost\":100,\"sale_price\":150,\"payment_method\":\"credit\",\"service_type\":\"مواصلات\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  error:',d.get('error'))"

# PACKAGE BOOKING TESTS
echo; echo "==> Setup package + component for booking tests"
PKG_ID=$(curl -s -b $COOKIE -X POST "$BASE/packages" -H "Content-Type: application/json" \
  -d '{"name":"باكج اختبار الدفع v3.9.22","package_type":"umrah","currency":"SAR"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
curl -s -b $COOKIE -X POST "$BASE/packages/$PKG_ID/components" -H "Content-Type: application/json" \
  -d "{\"name\":\"فندق تجريبي\",\"component_type\":\"hotel\",\"supplier_id\":\"$SUPPLIER_ID\",\"cost_per_pax\":100,\"sale_per_pax\":150}" >/dev/null
echo "  PKG=$PKG_ID"

echo; echo "==> T5: PACKAGE BOOKING credit"
R=$(curl -s -b $COOKIE -X POST "$BASE/packages/$PKG_ID/bookings" -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$CLIENT_ID\",\"pilgrim_name\":\"معتمر آجل\",\"pax_count\":1,\"payment_method\":\"credit\"}")
BOOK_A=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or '')")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| client:',d.get('client_name'),'| box:',d.get('box_id'))"

echo; echo "==> T6: PACKAGE BOOKING cash (no client_id, cash box)"
R=$(curl -s -b $COOKIE -X POST "$BASE/packages/$PKG_ID/bookings" -H "Content-Type: application/json" \
  -d "{\"pilgrim_name\":\"معتمر نقدي\",\"pax_count\":2,\"payment_method\":\"cash\",\"box_id\":\"$CASH_BOX\"}")
BOOK_B=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or '')")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| client_id:',d.get('client_id'),'| client_name:',d.get('client_name'),'| box:',d.get('box_name'))"

echo; echo "==> T7: PACKAGE BOOKING credit without client_id (should FAIL)"
R=$(curl -s -b $COOKIE -X POST "$BASE/packages/$PKG_ID/bookings" -H "Content-Type: application/json" \
  -d "{\"pilgrim_name\":\"يجب فشل\",\"pax_count\":1,\"payment_method\":\"credit\"}")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  error:',d.get('error'))"

echo; echo "==> T8: PACKAGE BOOKING cash without box_id (should FAIL)"
R=$(curl -s -b $COOKIE -X POST "$BASE/packages/$PKG_ID/bookings" -H "Content-Type: application/json" \
  -d "{\"pilgrim_name\":\"يجب فشل نقد\",\"pax_count\":1,\"payment_method\":\"cash\"}")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  error:',d.get('error'))"

# PATCH tests
if [ -n "$BOOK_B" ]; then
echo; echo "==> T9: PATCH cash booking → switch to credit (needs client_id)"
R=$(curl -s -b $COOKIE -X PATCH "$BASE/packages/$PKG_ID/bookings/$BOOK_B" -H "Content-Type: application/json" \
  -d "{\"payment_method\":\"credit\",\"client_id\":\"$CLIENT_ID\"}")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  pm:',d.get('payment_method'),'| client:',d.get('client_name'),'| box:',d.get('box_id'),'| _full_recalc:',d.get('_full_recalc'))"

echo; echo "==> T10: PATCH credit booking → switch back to cash (needs box_id)"
R=$(curl -s -b $COOKIE -X PATCH "$BASE/packages/$PKG_ID/bookings/$BOOK_B" -H "Content-Type: application/json" \
  -d "{\"payment_method\":\"cash\",\"box_id\":\"$CASH_BOX\"}")
echo "  $R" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  pm:',d.get('payment_method'),'| client_name:',d.get('client_name'),'| box:',d.get('box_name'))"
fi

echo; echo "==> DONE"
