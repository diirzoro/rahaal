import requests, json, subprocess, time, os

BASE = "http://localhost:3000/api"
LOG = "/app/memory/meraaj_network/meraaj_mock.log"
STORE = "/app/memory/meraaj_network/meraaj_mock_store.json"
s = requests.Session()
results = []

def step(name, cond, extra=""):
    results.append(cond)
    print(("PASS" if cond else "FAIL"), "|", name, ("| " + str(extra))[:170] if extra else "")
    return cond

def mock_log():
    with open(LOG) as f:
        return [json.loads(l) for l in f if l.strip()]

def store():
    with open(STORE) as f:
        return json.load(f)

open(LOG, "w").close()  # fresh log for this run
if os.path.exists(STORE): os.remove(STORE)

r = s.post(f"{BASE}/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
step("login", r.status_code == 200)

pkg_body = {
    "name": "TEST-v330-CONTRACT", "package_type": "umrah", "currency": "SAR",
    "start_date": "2026-11-01", "end_date": "2026-11-12", "pricing_mode": "direct",
    "room_pricing": [{"type": "رباعية", "sale_per_pax": 1500, "cost_per_pax": 1100, "sale_child": 900, "sale_infant": 100}],
    "notes": "وصف اولي v330",
}
r = s.post(f"{BASE}/packages", json=pkg_body); pid = r.json()["id"]
step("create pkg A", r.status_code == 200, pid[:8])

# ===== 1. FIRST SHARE via REST =====
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 100, "commission_direction": "added", "seats_allocated": 6})
step("first share 200 via rest_api", r.status_code == 200 and r.json().get("registered_via") == "rest_api", r.text[:100])
st = store().get(pid, {})
step("Meraaj store: package CREATED & listed", st.get("listed") is True and st.get("title") == "TEST-v330-CONTRACT")
step("contract mapping on share (description/departure/return)", st.get("description") == "وصف اولي v330" and bool(st.get("departure_date")) and bool(st.get("return_date")))

# ===== 2. PACKAGE UPDATE → webhook package.updated must ACTUALLY update Meraaj =====
r = s.patch(f"{BASE}/packages/{pid}", json={"name": "TEST-v330-CONTRACT-RENAMED", "notes": "وصف محدث v330"})
step("PATCH pkg 200", r.status_code == 200)
time.sleep(1)
wh = [l for l in mock_log() if l["url"] == "/api/integrations/rahal/webhooks" and (l["body"] or {}).get("type") == "package.updated" and (l["body"]["data"] or {}).get("package_ref") == pid]
step("package.updated webhook delivered", len(wh) >= 1, f"count={len(wh)}")
if wh:
    w = wh[-1]
    step("X-Rahal-Signature valid (HMAC raw body)", w.get("signature_valid") is True)
    step("NO forbidden legacy headers", w["headers"]["x-rahaal-signature"] is None and w["headers"]["x-rahaal-timestamp"] is None)
    d = w["body"]["data"]
    step("webhook payload uses CONTRACT names", d.get("title") == "TEST-v330-CONTRACT-RENAMED" and d.get("description") == "وصف محدث v330" and "departure_date" in d and "return_date" in d and "pricing" in d)
    step("no non-contract keys (name/notes/start_date)", all(k not in d for k in ["name", "notes", "start_date", "end_date"]))
st = store().get(pid, {})
step("Meraaj store ACTUALLY UPDATED (title+description)", st.get("title") == "TEST-v330-CONTRACT-RENAMED" and st.get("description") == "وصف محدث v330")

# ===== 3. RE-SHARE (settings change) → package.updated only, no 2nd REST registration =====
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 120, "commission_direction": "added", "seats_allocated": 7})
step("re-share 200", r.status_code == 200)
time.sleep(1)
rest_calls = [l for l in mock_log() if l["url"].endswith("/packages/share") and (l["body"] or {}).get("package_ref") == pid]
step("still exactly 1 REST registration (no duplicates)", len(rest_calls) == 1, f"count={len(rest_calls)}")
st = store().get(pid, {})
step("Meraaj store seats updated via webhook", st.get("available_seats") == 7 and st.get("pricing", {}).get("final_sale_price") == 1620, st.get("pricing"))

# ===== 4. UNSHARE → deactivated → unlisted =====
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": False})
step("unshare 200", r.status_code == 200)
time.sleep(1)
st = store().get(pid, {})
step("Meraaj store UNLISTED after unshare", st.get("listed") is False and st.get("deactivate_reason") == "unshared_by_office")

# ===== 5. DELETE SHARED PACKAGE → deactivated FIRST, Meraaj must not remain listed =====
r = s.post(f"{BASE}/packages", json={**pkg_body, "name": "TEST-v330-DELETE-CASE"}); pid2 = r.json()["id"]
s.post(f"{BASE}/packages/{pid2}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 50, "commission_direction": "added", "seats_allocated": 4})
time.sleep(0.5)
step("pkg B shared & listed in Meraaj", store().get(pid2, {}).get("listed") is True)
r = s.delete(f"{BASE}/packages/{pid2}")
step("DELETE pkg B 200", r.status_code == 200)
time.sleep(1)
st2 = store().get(pid2, {})
step("Meraaj UNLISTED after local delete (reason=deleted_by_office)", st2.get("listed") is False and st2.get("deactivate_reason") == "deleted_by_office")
r = s.get(f"{BASE}/meraaj/events")
deact = [e for e in r.json() if e.get("type") == "package.deactivated" and (e.get("payload") or {}).get("package_ref") == pid2]
step("deactivated event recorded in outbox (status=sent)", len(deact) == 1 and deact[0].get("status") == "sent", deact[0].get("status") if deact else "none")

# ===== 6. BULK-DELETE shared package → same guarantee =====
r = s.post(f"{BASE}/packages", json={**pkg_body, "name": "TEST-v330-BULKDEL-CASE"}); pid3 = r.json()["id"]
s.post(f"{BASE}/packages/{pid3}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 30, "commission_direction": "added", "seats_allocated": 3})
time.sleep(0.5)
r = s.post(f"{BASE}/packages/bulk-delete", json={"ids": [pid3]})
step("bulk-delete 200", r.status_code == 200 and r.json().get("deleted") == 1)
time.sleep(1)
step("Meraaj UNLISTED after bulk-delete", store().get(pid3, {}).get("listed") is False)

# ===== 7. RETRY / FAILURE: no duplicates =====
subprocess.run("pkill -f meraaj_mock.js", shell=True); time.sleep(1)
r = s.post(f"{BASE}/packages", json={**pkg_body, "name": "TEST-v330-RETRY-CASE"}); pid4 = r.json()["id"]
r = s.post(f"{BASE}/packages/{pid4}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 10, "commission_direction": "added", "seats_allocated": 2})
step("share fails 502 while Meraaj down", r.status_code == 502)
subprocess.run("export $(grep -v '^#' /app/.env | xargs) && nohup node /app/memory/meraaj_network/meraaj_mock.js >> /app/memory/meraaj_network/mock_server.out 2>&1 &", shell=True, executable="/bin/bash")
time.sleep(2)
r = s.post(f"{BASE}/packages/{pid4}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 10, "commission_direction": "added", "seats_allocated": 2})
step("retry share succeeds after Meraaj back", r.status_code == 200)
rest4 = [l for l in mock_log() if l["url"].endswith("/packages/share") and (l["body"] or {}).get("package_ref") == pid4]
step("retry created exactly ONE registration (no duplicate)", len(rest4) == 1, f"count={len(rest4)}")

# ===== 8. NO package.shared anywhere =====
r = s.get(f"{BASE}/meraaj/events")
step("ZERO package.shared webhook events", len([e for e in r.json() if e.get("type") == "package.shared"]) == 0)

# ===== CLEANUP (soft only) =====
s.post(f"{BASE}/packages/{pid4}/meraaj-share", json={"enabled": False})
for p in (pid, pid4):
    s.post(f"{BASE}/packages/{p}/archive", json={"archived": True})
r = s.get(f"{BASE}/packages")
step("cleanup: no v330 test pkgs in active list", not [x for x in r.json() if "v330" in x["name"].lower() or "V330" in x["name"]])
# existing production-like package untouched
r = s.get(f"{BASE}/packages")
p585 = next((x for x in r.json() if x["id"].startswith("585b9e89")), None)
step("existing pkg 585b9e89 untouched (still shared)", p585 and (p585.get("meraaj") or {}).get("shared") is True)

print(f"\n===== {sum(results)}/{len(results)} PASSED =====")
