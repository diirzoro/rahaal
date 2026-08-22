import requests, json, hmac, hashlib, time, uuid

BASE = "http://localhost:3000/api"
SECRET = [l.split('=',1)[1].strip() for l in open('/app/.env') if l.startswith('MERAAJ_SHARED_SECRET=')][0]
TENANT = "d89bc41d-e19b-430f-be93-e3f8ca6d404a"  # demo office (owner@demo.com) — the "linked office"
s = requests.Session()
s.post(f"{BASE}/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
R = []

def step(name, cond, extra=""):
    R.append((name, bool(cond)))
    print(("PASS" if cond else "FAIL"), "|", name, ("| " + str(extra))[:150] if extra else "")

def send_event(evt):
    raw = json.dumps(evt, ensure_ascii=False)
    sig = hmac.new(SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return requests.post(f"{BASE}/meraaj/webhooks", data=raw.encode(), headers={"Content-Type": "application/json", "x-meraaj-signature": sig})

MRJ_ID = "MRJ-E2E-REFLECT-001"
full_data = {
    "meraaj_package_id": MRJ_ID,
    "office_ref": TENANT,
    "title": "برنامج أنشئ من معراج — اختبار الانعكاس",
    "description": "أنشأه المكتب من واجهة معراج مباشرة",
    "package_type": "umrah",
    "departure_date": "2026-12-01", "return_date": "2026-12-14",
    "currency": "SAR",
    "room_pricing": [
        {"room_type": "ثنائي", "base": {"adult": 2800, "child": 1900, "infant": 180}},
        {"room_type": "ثلاثي", "base": {"adult": 2300, "child": 1600, "infant": 140}},
        {"room_type": "رباعي", "base": {"adult": 1900, "child": 1300, "infant": 90}},
    ],
    "package_transports": [{"name": "باص معراج 1", "type": "bus", "capacity": 50}],
    "components": [{"name": "فندق الصفوة", "component_type": "hotel"}, {"name": "إعاشة كاملة", "component_type": "meal"}],
    "hotels": ["فندق الصفوة"],
    "features": ["إفطار", "مرشد"],
    "images": ["https://umrah-exchange.preview.emergentagent.com/media/pkg-e2e.jpg"],
    "available_seats": 30,
}
EVT_ID = str(uuid.uuid4())

# ===== 1. REFLECTION: publish from Meraaj → must be STORED in Rahaal DB, linked to correct office =====
r = send_event({"id": EVT_ID, "type": "meraaj.package.published", "timestamp": int(time.time()), "data": full_data})
d = r.json() if r.status_code == 200 else {}
step("Reflection: event accepted + created", r.status_code == 200 and d.get("reflected") == "created", r.text[:120])
rahal_ref = d.get("rahal_ref")
step("Reflection: linked to CORRECT office (tenant_id match)", d.get("tenant_id") == TENANT)

# DB verification (via authenticated API of that office)
pkgs = s.get(f"{BASE}/packages").json()
p = next((x for x in pkgs if x["id"] == rahal_ref), None)
step("DB: package exists in office account", p is not None)
if p:
    step("DB: title/type/dates/currency stored", p["name"] == full_data["title"] and p["package_type"] == "umrah" and p["start_date"].startswith("2026-12-01") and p["currency"] == "SAR")
    step("DB: 3 room types stored with prices", len(p.get("room_pricing", [])) == 3 and p["room_pricing"][0]["sale_per_pax"] == 2800)
    step("DB: features stored", p.get("features") == ["إفطار", "مرشد"])
    m = p.get("meraaj") or {}
    step("DB: matched by meraaj_package_id (remote_id stored)", m.get("remote_id") == MRJ_ID)
    refl = m.get("reflection") or {}
    step("DB: transports/components/hotels/images snapshot stored", len(refl.get("package_transports", [])) == 1 and len(refl.get("components", [])) == 2 and refl.get("hotels") == ["فندق الصفوة"] and len(refl.get("images", [])) == 1)

# ===== 2. IDEMPOTENCY: same event id again → duplicate, NO second package =====
r = send_event({"id": EVT_ID, "type": "meraaj.package.published", "timestamp": int(time.time()), "data": full_data})
dup_flag = r.status_code == 200 and r.json().get("duplicate") is True
count = len([x for x in s.get(f"{BASE}/packages").json() if (x.get("meraaj") or {}).get("remote_id") == MRJ_ID])
step("Idempotency: duplicate ack + still exactly 1 package", dup_flag and count == 1, f"count={count}")

# ===== 3. PARTIAL UPDATE from Meraaj: title only → other fields NOT wiped =====
r = send_event({"id": str(uuid.uuid4()), "type": "meraaj.package.updated", "timestamp": int(time.time()),
                "data": {"meraaj_package_id": MRJ_ID, "office_ref": TENANT, "title": "برنامج معراج — العنوان المحدث"}})
step("Partial update: accepted (matched by meraaj_package_id)", r.status_code == 200 and r.json().get("reflected") == "updated")
p2 = next((x for x in s.get(f"{BASE}/packages").json() if x["id"] == rahal_ref), None)
step("Partial update: title changed, rooms/features/dates INTACT", p2 and p2["name"] == "برنامج معراج — العنوان المحدث" and len(p2["room_pricing"]) == 3 and p2["features"] == ["إفطار", "مرشد"] and p2["start_date"].startswith("2026-12-01"))

# ===== 4. SECURITY: wrong signature rejected + office mismatch rejected =====
raw = json.dumps({"id": str(uuid.uuid4()), "type": "meraaj.package.updated", "data": {"meraaj_package_id": MRJ_ID, "title": "hack"}}, ensure_ascii=False)
r = requests.post(f"{BASE}/meraaj/webhooks", data=raw.encode(), headers={"Content-Type": "application/json", "x-meraaj-signature": "bad"})
step("Security: invalid HMAC rejected 401", r.status_code == 401)
r = send_event({"id": str(uuid.uuid4()), "type": "meraaj.package.updated", "timestamp": int(time.time()),
                "data": {"meraaj_package_id": MRJ_ID, "office_ref": "wrong-office-id", "title": "x"}})
step("Security: office mismatch rejected 403", r.status_code == 403)

# ===== 5. OUTBOUND Rahaal → Meraaj Preview (real attempt — requires temp secret configured at Meraaj) =====
sup = s.get(f"{BASE}/suppliers").json()[0]["id"]
pid = s.post(f"{BASE}/packages", json={"name": "E2E-OUT-v338", "package_type": "umrah", "currency": "SAR", "start_date": "2026-12-20", "end_date": "2026-12-30", "pricing_mode": "direct", "room_pricing": [{"type": "رباعي", "sale_per_pax": 1500, "sale_child": 900, "sale_infant": 80}], "features": ["ف1"]}).json()["id"]
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 50, "commission_direction": "added", "seats_allocated": 5})
out_ok = r.status_code == 200
step("Outbound REAL share to Meraaj Preview", out_ok, r.text[:130])
if out_ok:
    s.patch(f"{BASE}/packages/{pid}", json={"name": "E2E-OUT-v338-RENAMED"})
    time.sleep(1)
    ev = [e for e in s.get(f"{BASE}/meraaj/events").json() if (e.get("payload") or {}).get("package_ref") == pid and e["type"] == "package.updated"]
    step("Outbound package.updated delivered", ev and ev[-1]["status"] == "sent", ev[-1].get("last_error") if ev else "")

# ===== CLEANUP (soft) =====
send_event({"id": str(uuid.uuid4()), "type": "meraaj.package.deactivated", "timestamp": int(time.time()), "data": {"meraaj_package_id": MRJ_ID}})
s.post(f"{BASE}/packages/{rahal_ref}/archive", json={"archived": True})
if not out_ok:
    s.delete(f"{BASE}/packages/{pid}")  # never shared → plain local test pkg
p585 = next((x for x in s.get(f"{BASE}/packages").json() if x["id"].startswith("585b9e89")), None)
step("Pre-existing data untouched (585b9e89 intact)", p585 is not None)

print("\n===== SUMMARY =====")
for n, ok_ in R: print(("PASS" if ok_ else "FAIL"), "|", n)
print(f"TOTAL: {sum(1 for _, x in R if x)}/{len(R)}")
