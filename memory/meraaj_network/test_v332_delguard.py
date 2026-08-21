import requests, json, subprocess, time

BASE = "http://localhost:3000/api"
s = requests.Session()

def step(name, cond, extra=""):
    print(("PASS" if cond else "FAIL"), "|", name, ("| " + str(extra))[:140] if extra else "")

s.post(f"{BASE}/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})

# ensure mock running
subprocess.run("pgrep -f meraaj_mock.js > /dev/null || (export $(grep -v '^#' /app/.env | xargs) && nohup node /app/memory/meraaj_network/meraaj_mock.js >> /app/memory/meraaj_network/mock_server.out 2>&1 &)", shell=True, executable="/bin/bash")
time.sleep(2)

r = s.post(f"{BASE}/packages", json={"name": "TEST-v332-DELGUARD", "package_type": "umrah", "currency": "SAR", "start_date": "2027-02-01", "end_date": "2027-02-10", "pricing_mode": "direct", "room_pricing": [{"type": "رباعية", "sale_per_pax": 1000, "sale_child": 500, "sale_infant": 50}]})
pid = r.json()["id"]
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 40, "commission_direction": "added", "seats_allocated": 3})
step("setup: pkg shared to Meraaj", r.status_code == 200)

# 1. Meraaj DOWN → delete must be BLOCKED
subprocess.run("pkill -f meraaj_mock.js", shell=True); time.sleep(1)
r = s.delete(f"{BASE}/packages/{pid}")
step("delete BLOCKED (502) while Meraaj unreachable", r.status_code == 502, r.text[:120])
pkgs = [p["id"] for p in s.get(f"{BASE}/packages").json()]
step("package still exists locally", pid in pkgs)

# bulk-delete also blocked
r = s.post(f"{BASE}/packages/bulk-delete", json={"ids": [pid]})
d = r.json()
step("bulk-delete skips it (failed=1, deleted=0)", d.get("deleted") == 0 and d.get("failed") == 1, d)
step("package still exists after bulk attempt", pid in [p["id"] for p in s.get(f"{BASE}/packages").json()])

# 2. Meraaj BACK → delete succeeds, Meraaj unlisted
subprocess.run("export $(grep -v '^#' /app/.env | xargs) && nohup node /app/memory/meraaj_network/meraaj_mock.js >> /app/memory/meraaj_network/mock_server.out 2>&1 &", shell=True, executable="/bin/bash")
time.sleep(2)
r = s.delete(f"{BASE}/packages/{pid}")
step("delete succeeds when Meraaj reachable", r.status_code == 200)
step("package gone locally", pid not in [p["id"] for p in s.get(f"{BASE}/packages").json()])
with open("/app/memory/meraaj_network/meraaj_mock_store.json") as f:
    st = json.load(f).get(pid, {})
step("Meraaj UNLISTED (deleted_by_office)", st.get("listed") is False and st.get("deactivate_reason") == "deleted_by_office")

# regression: existing pkg untouched
p585 = next((x for x in s.get(f"{BASE}/packages").json() if x["id"].startswith("585b9e89")), None)
step("pre-existing pkg 585b9e89 untouched", p585 is not None and (p585.get("meraaj") or {}).get("shared") is True)
