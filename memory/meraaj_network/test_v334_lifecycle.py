import requests, json, subprocess, time

BASE = "http://localhost:3000/api"
STORE = "/app/memory/meraaj_network/meraaj_mock_store.json"
s = requests.Session()

def step(name, cond, extra=""):
    print(("PASS" if cond else "FAIL"), "|", name, ("| " + str(extra))[:140] if extra else "")

def store(pid):
    try:
        with open(STORE) as f: return json.load(f).get(pid, {})
    except Exception:
        return {}

def events(pid):
    return [e for e in s.get(f"{BASE}/meraaj/events").json() if (e.get("payload") or {}).get("package_ref") == pid]

s.post(f"{BASE}/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
subprocess.run("pkill -f meraaj_mock.js", shell=True); time.sleep(1)
subprocess.run("export $(grep -v '^#' /app/.env | xargs) && nohup node /app/memory/meraaj_network/meraaj_mock.js >> /app/memory/meraaj_network/mock_server.out 2>&1 &", shell=True, executable="/bin/bash")
time.sleep(2)

# ONE real shared package lifecycle + ONE normal unshared package (control)
r = s.post(f"{BASE}/packages", json={"name": "TEST-v334-LIFECYCLE", "package_type": "umrah", "currency": "SAR", "start_date": "2027-05-01", "end_date": "2027-05-10", "pricing_mode": "direct", "room_pricing": [{"type": "رباعية", "sale_per_pax": 1000, "sale_child": 500, "sale_infant": 50}], "features": ["ميزة أ"]})
pid = r.json()["id"]
r = s.post(f"{BASE}/packages", json={"name": "TEST-v334-CONTROL-UNSHARED", "package_type": "umrah", "currency": "SAR", "start_date": "2027-05-01", "end_date": "2027-05-05", "pricing_mode": "direct", "room_pricing": [{"type": "رباعية", "sale_per_pax": 500, "sale_child": 200, "sale_infant": 20}]})
ctrl = r.json()["id"]

r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 50, "commission_direction": "added", "seats_allocated": 8})
remote_id = r.json()["meraaj"].get("remote_id")
step("1. share OK, Meraaj listed", store(pid).get("listed") is True and bool(remote_id))

# 2. UPDATE name → Meraaj record ACTUALLY changed (matched via meraaj_package_id, NOT package_ref)
s.patch(f"{BASE}/packages/{pid}", json={"name": "TEST-v334-RENAMED"}); time.sleep(1)
step("2. update name → Meraaj title ACTUALLY changed", store(pid).get("title") == "TEST-v334-RENAMED", store(pid).get("title"))
ev = [e for e in events(pid) if e["type"] == "package.updated"][-1]
step("   event carries rahal_ref + meraaj_package_id", ev["payload"].get("rahal_ref") == pid and ev["payload"].get("meraaj_package_id") == remote_id)

# 3. UPDATE price + date → reflected
s.patch(f"{BASE}/packages/{pid}", json={"room_pricing": [{"type": "رباعية", "sale_per_pax": 1300, "sale_child": 600, "sale_infant": 60}], "end_date": "2027-05-15"}); time.sleep(1)
st = store(pid)
step("3. price+date → Meraaj reflected (1350 sale, return 05-15)", st.get("pricing", {}).get("final_sale_price") == 1350 and str(st.get("return_date", "")).startswith("2027-05-15"), st.get("pricing"))

# 4. CLOSE → unlisted in Meraaj
s.patch(f"{BASE}/packages/{pid}", json={"status": "closed"}); time.sleep(1)
step("4. close → Meraaj UNLISTED (closed_by_office)", store(pid).get("listed") is False and store(pid).get("deactivate_reason") == "closed_by_office")

# 5. reopen + UNSHARE → unlisted; unshare BLOCKED when Meraaj down
s.patch(f"{BASE}/packages/{pid}", json={"status": "open"}); time.sleep(1)
step("5a. reopen → listed again", store(pid).get("listed") is True)
subprocess.run("pkill -f meraaj_mock.js", shell=True); time.sleep(1)
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": False})
step("5b. unshare BLOCKED (502) while Meraaj down, still shared", r.status_code == 502 and next(p for p in s.get(f"{BASE}/packages").json() if p["id"] == pid)["meraaj"]["shared"] is True, r.text[:80])
subprocess.run("export $(grep -v '^#' /app/.env | xargs) && nohup node /app/memory/meraaj_network/meraaj_mock.js >> /app/memory/meraaj_network/mock_server.out 2>&1 &", shell=True, executable="/bin/bash")
time.sleep(2)
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": False})
step("5c. unshare OK when Meraaj back → UNLISTED", r.status_code == 200 and store(pid).get("listed") is False)

# 6. DELETE (registered pkg) → deactivated delivered, local delete completes
r = s.delete(f"{BASE}/packages/{pid}")
step("6. delete → 200, gone locally, Meraaj unlisted (deleted_by_office)", r.status_code == 200 and pid not in [p["id"] for p in s.get(f"{BASE}/packages").json()] and store(pid).get("listed") is False and store(pid).get("deactivate_reason") == "deleted_by_office")

# 7. CONTROL: normal unshared package NOT affected (no meraaj events at all)
s.patch(f"{BASE}/packages/{ctrl}", json={"name": "TEST-v334-CONTROL-EDITED"})
s.patch(f"{BASE}/packages/{ctrl}", json={"status": "closed"})
r = s.delete(f"{BASE}/packages/{ctrl}")
step("7. control pkg: edit/close/delete OK with ZERO meraaj events", r.status_code == 200 and len(events(ctrl)) == 0)

# 8. quick regression: first-share + features + image URL + duplicate (one pass)
r = s.post(f"{BASE}/packages", json={"name": "TEST-v334-REG", "package_type": "umrah", "currency": "SAR", "start_date": "2027-06-01", "end_date": "2027-06-05", "pricing_mode": "direct", "room_pricing": [{"type": "رباعية", "sale_per_pax": 700, "sale_child": 300, "sale_infant": 30}], "features": ["ر1", "ر2"]})
rid_ = r.json()["id"]
r = s.post(f"{BASE}/packages/{rid_}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 20, "commission_direction": "added", "seats_allocated": 3})
d = s.post(f"{BASE}/packages/{rid_}/duplicate", json={}).json()
step("8. regression: first-share rest_api + features + duplicate clean", r.json().get("registered_via") == "rest_api" and store(rid_).get("features") == ["ر1", "ر2"] and not (d.get("meraaj") or {}).get("remote_id"))

# cleanup (soft) + existing pkg untouched
s.post(f"{BASE}/packages/{rid_}/meraaj-share", json={"enabled": False})
for p in (rid_, d["id"]):
    s.post(f"{BASE}/packages/{p}/archive", json={"archived": True})
active = s.get(f"{BASE}/packages").json()
step("9. cleanup + pre-existing 585b9e89 untouched", not [x for x in active if "v334" in x["name"]] and next((x for x in active if x["id"].startswith("585b9e89")), {}).get("meraaj", {}).get("shared") is True)
