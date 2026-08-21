import requests, json, subprocess, time

BASE = "http://localhost:3000/api"
STORE = "/app/memory/meraaj_network/meraaj_mock_store.json"
s = requests.Session()

def step(name, cond, extra=""):
    print(("PASS" if cond else "FAIL"), "|", name, ("| " + str(extra))[:130] if extra else "")

def store(pid):
    try:
        with open(STORE) as f: return json.load(f).get(pid, {})
    except Exception:
        return {}

s.post(f"{BASE}/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
subprocess.run("pgrep -f meraaj_mock.js > /dev/null || (export $(grep -v '^#' /app/.env | xargs) && nohup node /app/memory/meraaj_network/meraaj_mock.js >> /app/memory/meraaj_network/mock_server.out 2>&1 &)", shell=True, executable="/bin/bash")
time.sleep(2)

sups = s.get(f"{BASE}/suppliers").json()
sup_id = sups[0]["id"]
r = s.post(f"{BASE}/packages", json={"name": "TEST-v332-SYNC", "package_type": "umrah", "currency": "SAR", "start_date": "2027-03-01", "end_date": "2027-03-10", "pricing_mode": "direct", "room_pricing": [{"type": "رباعية", "sale_per_pax": 900, "sale_child": 400, "sale_infant": 50}]})
pid = r.json()["id"]
s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 25, "commission_direction": "added", "seats_allocated": 4})
step("setup: shared & listed", store(pid).get("listed") is True)

# 1. ADD hotel component → Meraaj hotels updated
r = s.post(f"{BASE}/packages/{pid}/components", json={"component_type": "hotel", "name": "فندق الاختبار v332", "supplier_id": sup_id, "cost_per_pax": 300, "sale_per_pax": 400, "pricing_type": "flat"})
cid = r.json()["id"]; time.sleep(1)
step("add hotel → Meraaj hotels synced", store(pid).get("hotels") == ["فندق الاختبار v332"], store(pid).get("hotels"))

# 2. DELETE component → Meraaj hotels updated
s.delete(f"{BASE}/packages/{pid}/components/{cid}"); time.sleep(1)
step("delete hotel → Meraaj hotels empty", store(pid).get("hotels") == [])

# 3. ADD transport → package.updated fired (still listed, payload delivered)
before = store(pid).get("updated_at")
s.post(f"{BASE}/packages/{pid}/transports", json={"name": "باص v332", "type": "bus", "capacity": 40}); time.sleep(1)
step("add transport → package.updated delivered", store(pid).get("updated_at") != before)

# 4. IMAGE upload → images synced
png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
s.post(f"{BASE}/packages/{pid}/image", json={"data": png}); time.sleep(1)
step("upload image → Meraaj images synced", len(store(pid).get("images", [])) == 1, store(pid).get("images"))
s.delete(f"{BASE}/packages/{pid}/image"); time.sleep(1)
step("delete image → Meraaj images empty", store(pid).get("images") == [])

# 5. Duplicate sanity (not broken): copy independent, no meraaj
r = s.post(f"{BASE}/packages/{pid}/duplicate", json={})
dup = r.json(); did = dup["id"]
m = dup.get("meraaj")
step("duplicate still works, copy has NO meraaj identity", r.status_code == 200 and did != pid and (m is None or (not m.get("shared") and not m.get("remote_id"))))

# cleanup (soft)
s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": False})
for p in (pid, did):
    s.post(f"{BASE}/packages/{p}/archive", json={"archived": True})
active = s.get(f"{BASE}/packages").json()
step("cleanup done + pre-existing 585b9e89 untouched", not [x for x in active if "v332" in x["name"]] and next((x for x in active if x["id"].startswith("585b9e89")), {}).get("meraaj", {}).get("shared") is True)
