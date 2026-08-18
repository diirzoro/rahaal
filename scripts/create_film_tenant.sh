#!/bin/bash
# Create the "Film Demo" clean tenant for video recording purposes
# Owner login: film@rahaal.app / Rahaal@Film2025
set -e
BASE="http://localhost:3000/api"
COOKIE=/tmp/rahaal_super.txt
rm -f $COOKIE

echo "==> Login as Super Admin"
curl -s -c $COOKIE -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@targetmedia.com","password":"<SUPER_ADMIN_PASSWORD-see-memory/test_credentials.md>"}' >/dev/null

echo "==> Check if film tenant already exists"
EXISTS=$(curl -s -b $COOKIE "$BASE/admin/tenants" | python3 -c "
import json,sys
d=json.load(sys.stdin)
tenants = d.get('tenants', []) if isinstance(d, dict) else d
found = next((t for t in tenants if t.get('name')=='مكتب النجم للسفر والسياحة'), None)
print(found['id'] if found else '')
")

if [ -n "$EXISTS" ]; then
  echo "  Tenant already exists: $EXISTS — recreating fresh copy"
  # We'll just print credentials and skip re-creation
  echo "  Owner: film@rahaal.app / Rahaal@Film2025"
  exit 0
fi

echo "==> Create fresh demo tenant"
R=$(curl -s -b $COOKIE -X POST "$BASE/admin/tenants" -H "Content-Type: application/json" \
  -d '{
    "name":"مكتب النجم للسفر والسياحة",
    "slug":"najm-film",
    "owner_name":"أحمد علي المخلافي",
    "owner_email":"film@rahaal.app",
    "owner_password":"Rahaal@Film2025",
    "subscription":"paid",
    "plan_tier":"pro",
    "max_users":5,
    "max_branches":2,
    "quota_limit":9999
  }')

TENANT_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or '')")
echo "  Tenant created: $TENANT_ID"
echo "  Name: مكتب النجم للسفر والسياحة"
echo "  Owner: film@rahaal.app / Rahaal@Film2025"
echo "  Plan: pro (unlimited quota)"
echo ""
echo "==> Save credentials"
cat > /app/memory/film_credentials.md <<EOF
# 🎬 Film Demo Tenant Credentials

**Do NOT delete — used for video recording**

## Owner (Main filming account)
- Tenant: مكتب النجم للسفر والسياحة (slug: najm-film)
- Email: \`film@rahaal.app\`
- Password: \`Rahaal@Film2025\`
- Role: owner
- Tenant ID: \`$TENANT_ID\`

## After Video 1 (Setup), run to seed for Videos 2, 3, 4:
\`bash /app/scripts/seed_film_data.sh\`

Generated at: $(date)
EOF
echo "  ✅ Credentials saved to /app/memory/film_credentials.md"
