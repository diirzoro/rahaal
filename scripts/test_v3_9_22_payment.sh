#!/bin/bash
# v3.9.22 Payment Refactor — Backend smoke test
set -e
BASE="http://localhost:3000/api"
COOKIE=/tmp/rahaal_smoke.txt
rm -f $COOKIE

echo "==> LOGIN"
curl -s -c $COOKIE -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"owner@demo.com","password":"<DEMO_PASSWORD-see-memory/test_credentials.md>"}' > /tmp/login.json
grep -o '"email":"[^"]*"' /tmp/login.json | head -1

echo; echo "==> VERSION"
curl -s "$BASE/health" | python3 -c "import json,sys;d=json.load(sys.stdin);print('version:',d['version'])"

echo; echo "==> LOOKUP IDs"
CLIENT_ID=$(curl -s -b $COOKIE "$BASE/clients" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
SUPPLIER_ID=$(curl -s -b $COOKIE "$BASE/suppliers" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
BOX_ID=$(curl -s -b $COOKIE "$BASE/boxes" | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((b['id'] for b in d if b.get('type')=='cash'), (d[0]['id'] if d else '')))")
BANK_BOX_ID=$(curl -s -b $COOKIE "$BASE/boxes" | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((b['id'] for b in d if b.get('type')=='bank'), ''))")
echo "CLIENT=$CLIENT_ID"
echo "SUPPLIER=$SUPPLIER_ID"
echo "CASH_BOX=$BOX_ID"
echo "BANK_BOX=$BANK_BOX_ID"

# TEST 1 — CREDIT TICKET (payment_method=credit, client_id required)
echo; echo "==> TEST 1: CREDIT TICKET"
RES1=$(curl -s -b $COOKIE -X POST "$BASE/tickets" -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$CLIENT_ID\",\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"USD\",\"exchange_rate\":1,\"cost\":100,\"sale_price\":150,\"payment_method\":\"credit\",\"pnr\":\"TEST-CREDIT-1\",\"passenger_name\":\"عميل آجل\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "$RES1" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| box_id:',d.get('box_id'),'| client_name:',d.get('client_name'))"

# TEST 2 — CASH TICKET (payment_method=cash, box_id required, client_id EMPTY → should default to 'عميل نقدي')
echo; echo "==> TEST 2: CASH TICKET (no client_id, cash box)"
RES2=$(curl -s -b $COOKIE -X POST "$BASE/tickets" -H "Content-Type: application/json" \
  -d "{\"client_id\":\"\",\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"USD\",\"exchange_rate\":1,\"cost\":100,\"sale_price\":150,\"payment_method\":\"cash\",\"box_id\":\"$BOX_ID\",\"pnr\":\"TEST-CASH-1\",\"passenger_name\":\"عميل نقدي\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "$RES2" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| box_id:',d.get('box_id'),'| client_name:',d.get('client_name'),'| client_id:',d.get('client_id'))"

# TEST 3 — CASH TICKET via BANK box (bank-type box_id)
if [ -n "$BANK_BOX_ID" ]; then
  echo; echo "==> TEST 3: CASH TICKET via BANK box"
  RES3=$(curl -s -b $COOKIE -X POST "$BASE/tickets" -H "Content-Type: application/json" \
    -d "{\"client_id\":\"\",\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"USD\",\"exchange_rate\":1,\"cost\":100,\"sale_price\":150,\"payment_method\":\"cash\",\"box_id\":\"$BANK_BOX_ID\",\"pnr\":\"TEST-BANK-1\",\"passenger_name\":\"عميل تحويل بنكي\",\"date\":\"$(date +%Y-%m-%d)\"}")
  echo "$RES3" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| box_id:',d.get('box_id'),'| box_name:',d.get('box_name'))"
else
  echo "  (no bank box in demo tenant — skipping test 3)"
fi

# TEST 4 — VISA CREDIT
echo; echo "==> TEST 4: CREDIT VISA"
RES4=$(curl -s -b $COOKIE -X POST "$BASE/visas" -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$CLIENT_ID\",\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"SAR\",\"exchange_rate\":0.267,\"cost\":300,\"sale_price\":500,\"payment_method\":\"credit\",\"service_type\":\"تأشيرة عمرة\",\"passenger_name\":\"معتمر تجريبي\",\"passport_no\":\"V-CREDIT-1\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "$RES4" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| client_name:',d.get('client_name'))"

# TEST 5 — VISA CASH (no client_id, only box_id)
echo; echo "==> TEST 5: CASH VISA (no client_id)"
RES5=$(curl -s -b $COOKIE -X POST "$BASE/visas" -H "Content-Type: application/json" \
  -d "{\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"SAR\",\"exchange_rate\":0.267,\"cost\":300,\"sale_price\":500,\"payment_method\":\"cash\",\"box_id\":\"$BOX_ID\",\"service_type\":\"تأشيرة عمرة\",\"passenger_name\":\"معتمر نقدي\",\"passport_no\":\"V-CASH-1\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "$RES5" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  id:',d.get('id'),'| pm:',d.get('payment_method'),'| box_id:',d.get('box_id'),'| client_id:',d.get('client_id'),'| client_name:',d.get('client_name'))"

# TEST 6 — Validation: cash without box_id should fail
echo; echo "==> TEST 6: VALIDATION — cash without box_id (should fail)"
RES6=$(curl -s -b $COOKIE -X POST "$BASE/tickets" -H "Content-Type: application/json" \
  -d "{\"client_id\":\"\",\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"USD\",\"cost\":100,\"sale_price\":150,\"payment_method\":\"cash\",\"pnr\":\"TEST-FAIL\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "$RES6" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  error:',d.get('error'),'| status expected 400')"

# TEST 7 — Validation: credit without client_id should fail
echo; echo "==> TEST 7: VALIDATION — credit without client_id (should fail)"
RES7=$(curl -s -b $COOKIE -X POST "$BASE/tickets" -H "Content-Type: application/json" \
  -d "{\"supplier_id\":\"$SUPPLIER_ID\",\"currency\":\"USD\",\"cost\":100,\"sale_price\":150,\"payment_method\":\"credit\",\"pnr\":\"TEST-FAIL-CREDIT\",\"date\":\"$(date +%Y-%m-%d)\"}")
echo "$RES7" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  error:',d.get('error'),'| status expected 400')"

echo; echo "==> DONE"
