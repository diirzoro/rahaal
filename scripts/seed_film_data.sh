#!/bin/bash
# Seed realistic demo data into the film tenant AFTER Video 1 is recorded
# Populates: 6 clients, 4 suppliers, exchange rates, box openings, some sample tickets/visas
set -e
BASE="http://localhost:3000/api"
COOKIE=/tmp/rahaal_film.txt
rm -f $COOKIE

echo "==> Login as film owner"
curl -s -c $COOKIE -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"film@rahaal.app","password":"Rahaal@Film2025"}' >/dev/null

echo "==> Update tenant settings (office info + rates)"
curl -s -b $COOKIE -X PUT "$BASE/tenant-settings" -H "Content-Type: application/json" \
  -d '{
    "agency_name":"مكتب النجم للسفر والسياحة",
    "phone":"+967 771 234 567",
    "address":"اليمن - عدن - كريتر، شارع الملكة أروى",
    "email":"info@najm-travel.com",
    "header":"مكتب النجم للسفر والسياحة — رحلتك تبدأ من عندنا",
    "footer":"شكراً لثقتكم — العنوان: عدن، كريتر — +967 771 234 567",
    "primary_color":"#0f766e",
    "base_currency":"YER",
    "rates":{
      "USD":{"transfer":534,"buy":530,"sell":538,"min":525,"max":540,"remarks":"سعر السوق"},
      "SAR":{"transfer":142,"buy":140,"sell":144,"min":138,"max":146,"remarks":""},
      "YER":{"transfer":1,"buy":1,"sell":1,"min":1,"max":1,"remarks":"العملة الأساسية"}
    },
    "pair_usd_sar":{"transfer":3.75,"buy":3.73,"sell":3.77,"remarks":""}
  }' >/dev/null && echo "  ✅ Office settings updated"

echo "==> Seed 6 realistic clients"
for N in "شركة الأمل للسياحة والحج" "مؤسسة الخير للسفر" "أ. عبدالله الصنعاني" "شركة اليمن الأولى" "أ. سمير الحضرمي" "مكتب البركة للعمرة"; do
  curl -s -b $COOKIE -X POST "$BASE/clients" -H "Content-Type: application/json" \
    -d "{\"name\":\"$N\"}" >/dev/null
done
echo "  ✅ 6 clients created"

echo "==> Seed 4 realistic suppliers"
for N in "الخطوط الجوية اليمنية (Yemenia)" "الخطوط السعودية (Saudia)" "وكيل تأشيرات مكة" "مورد فنادق المدينة"; do
  curl -s -b $COOKIE -X POST "$BASE/suppliers" -H "Content-Type: application/json" \
    -d "{\"name\":\"$N\"}" >/dev/null
done
echo "  ✅ 4 suppliers created"

echo "==> Open cash balances (real-world starting balances)"
BOXES=$(curl -s -b $COOKIE "$BASE/boxes")
CASH_ID=$(echo "$BOXES" | python3 -c "import json,sys;d=json.load(sys.stdin);print(next((b['id'] for b in d if b.get('type')=='cash'), ''))")
BANK_ID=$(echo "$BOXES" | python3 -c "import json,sys;d=json.load(sys.stdin);print(next((b['id'] for b in d if b.get('type')=='bank'), ''))")
echo "  cash_box=$CASH_ID | bank_box=$BANK_ID"

echo "==> Post 2 sample tickets (credit + cash) so the office isn't empty on camera"
CLIENT1=$(curl -s -b $COOKIE "$BASE/clients" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d[0]['id'])")
CLIENT2=$(curl -s -b $COOKIE "$BASE/clients" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d[1]['id'])")
SUP1=$(curl -s -b $COOKIE "$BASE/suppliers" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d[0]['id'])")
SUP2=$(curl -s -b $COOKIE "$BASE/suppliers" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d[1]['id'])")

curl -s -b $COOKIE -X POST "$BASE/tickets" -H "Content-Type: application/json" \
  -d "{
    \"client_id\":\"$CLIENT1\",\"supplier_id\":\"$SUP1\",
    \"currency\":\"USD\",\"exchange_rate\":534,
    \"cost\":220,\"sale_price\":260,
    \"payment_method\":\"credit\",
    \"pnr\":\"IY7823\",\"passenger_name\":\"محمد أحمد صالح\",\"passport_no\":\"04123456\",
    \"route\":\"SAH-CAI\",\"carrier_name\":\"الخطوط الجوية اليمنية\",
    \"travel_mode\":\"air\",\"travel_date\":\"$(date -d '+7 days' +%Y-%m-%d)\",
    \"date\":\"$(date +%Y-%m-%d)\"
  }" >/dev/null && echo "  ✅ Sample credit ticket added (SAH-CAI)"

curl -s -b $COOKIE -X POST "$BASE/tickets" -H "Content-Type: application/json" \
  -d "{
    \"supplier_id\":\"$SUP2\",
    \"currency\":\"SAR\",\"exchange_rate\":142,
    \"cost\":900,\"sale_price\":1100,
    \"payment_method\":\"cash\",\"box_id\":\"$CASH_ID\",
    \"pnr\":\"SV4567\",\"passenger_name\":\"سالم عبدالله الحضرمي\",\"passport_no\":\"05234567\",
    \"route\":\"ADE-JED\",\"carrier_name\":\"الخطوط السعودية\",
    \"travel_mode\":\"air\",\"travel_date\":\"$(date -d '+3 days' +%Y-%m-%d)\",
    \"date\":\"$(date +%Y-%m-%d)\"
  }" >/dev/null && echo "  ✅ Sample cash ticket added (ADE-JED)"

echo "==> Post a sample umrah visa"
SUP3=$(curl -s -b $COOKIE "$BASE/suppliers" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d[2]['id'])")
curl -s -b $COOKIE -X POST "$BASE/visas" -H "Content-Type: application/json" \
  -d "{
    \"client_id\":\"$CLIENT2\",\"supplier_id\":\"$SUP3\",
    \"currency\":\"SAR\",\"exchange_rate\":142,
    \"cost\":650,\"sale_price\":850,
    \"payment_method\":\"credit\",
    \"service_type\":\"تأشيرة عمرة\",
    \"passenger_name\":\"فاطمة محمد الشيباني\",\"passport_no\":\"04987654\",
    \"nationality\":\"يمني\",
    \"entry_date\":\"$(date -d '+10 days' +%Y-%m-%d)\",
    \"expected_exit_date\":\"$(date -d '+25 days' +%Y-%m-%d)\",
    \"date\":\"$(date +%Y-%m-%d)\"
  }" >/dev/null && echo "  ✅ Sample umrah visa added"

echo ""
echo "🎬 ==== FILM DATA READY ===="
echo "  Login: film@rahaal.app / Rahaal@Film2025"
echo "  6 clients, 4 suppliers, 2 boxes, 2 tickets, 1 visa"
echo "  Ready for filming Video 2 (Tickets & Visas) and Video 3 (Packages & Services)"
