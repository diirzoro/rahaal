import requests, json, subprocess, time

BASE = "http://localhost:3000/api"
s = requests.Session()

def step(name, cond, extra=""):
    print(("PASS" if cond else "FAIL"), "|", name, ("| " + str(extra))[:160] if extra else "")
    return cond

# 1. Login
r = s.post(f"{BASE}/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
step("login", r.status_code == 200)

# 2. Create test package with direct room pricing
pkg_body = {
    "name": "TEST-v329-MERAAJ-SHARE",
    "package_type": "umrah",
    "currency": "SAR",
    "start_date": "2026-10-01",
    "end_date": "2026-10-15",
    "pricing_mode": "direct",
    "room_pricing": [
        {"type": "رباعية", "sale_per_pax": 1000, "cost_per_pax": 800, "sale_child": 700, "sale_infant": 100},
        {"type": "ثلاثية", "sale_per_pax": 1200, "cost_per_pax": 900, "sale_child": 800, "sale_infant": 100},
    ],
    "notes": "باكج اختبار تكامل v3.29 — للمشاركة التجريبية في معراج",
}
r = s.post(f"{BASE}/packages", json=pkg_body)
step("create package", r.status_code == 200, r.text[:100])
pkg = r.json()
pid = pkg["id"]
print("   package id:", pid)

# 3. FIRST SHARE → must call REST mock, NOT webhook
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={
    "enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 50,
    "commission_direction": "added", "seats_allocated": 10,
})
d = r.json() if r.status_code == 200 else {}
step("first share returns 200", r.status_code == 200, r.text[:150])
step("registered_via = rest_api", d.get("registered_via") == "rest_api")
step("remote_id stored", bool(d.get("meraaj", {}).get("remote_id")), d.get("meraaj", {}).get("remote_id"))
step("registered_at stored", bool(d.get("meraaj", {}).get("registered_at")))

# 4. Verify mock received the correct payload
time.sleep(0.5)
with open("/app/memory/meraaj_network/meraaj_mock.log") as f:
    lines = [json.loads(l) for l in f if l.strip()]
calls = [l for l in lines if l["url"] == "/api/integrations/rahal/packages/share" and (l["body"] or {}).get("package_ref") == pid]
step("mock received exactly 1 share call", len(calls) == 1, f"count={len(calls)}")
if calls:
    c = calls[0]
    b = c["body"]
    step("X-Rahal-Api-Key header present", bool(c["headers"]["x-rahal-api-key"]))
    required = ["package_ref","title","description","departure_date","return_date","departure_city","transport","hotels","images","available_seats","office_ref","office_name","owner_name","pricing"]
    missing = [k for k in required if k not in b]
    step("all contract fields present", not missing, f"missing={missing}")
    p = b.get("pricing", {})
    step("pricing fields", all(k in p for k in ["net_cost_per_seat","final_sale_price","buyer_office_commission","currency"]), p)
    step("pricing values correct (cheapest adult 1000+50=1050, net 1000)", p.get("final_sale_price") == 1050 and p.get("net_cost_per_seat") == 1000 and p.get("buyer_office_commission") == 50)
    step("available_seats = 10", b.get("available_seats") == 10)
    step("title/office correct", b.get("title") == "TEST-v329-MERAAJ-SHARE" and bool(b.get("office_name")), b.get("office_name"))

# 5. Verify NO package.shared webhook event was created
r = s.get(f"{BASE}/meraaj/events")
evts = r.json()
shared_evts = [e for e in evts if e.get("type") == "package.shared" and (e.get("payload") or {}).get("package_ref") == pid]
api_logs = [e for e in evts if e.get("type") == "package.share_api" and (e.get("payload") or {}).get("package_ref") == pid]
step("NO package.shared webhook event", len(shared_evts) == 0, f"found={len(shared_evts)}")
step("share_api audit log exists (status=sent)", len(api_logs) == 1 and api_logs[0].get("status") == "sent")

# 6. SECOND share (update commission) → webhook package.updated, NO new REST call
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={
    "enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 75,
    "commission_direction": "added", "seats_allocated": 12,
})
step("re-share returns 200", r.status_code == 200, r.text[:100])
time.sleep(0.5)
with open("/app/memory/meraaj_network/meraaj_mock.log") as f:
    lines2 = [json.loads(l) for l in f if l.strip()]
calls2 = [l for l in lines2 if l["url"] == "/api/integrations/rahal/packages/share" and (l["body"] or {}).get("package_ref") == pid]
step("NO second REST call (still 1)", len(calls2) == 1, f"count={len(calls2)}")
r = s.get(f"{BASE}/meraaj/events")
evts = r.json()
upd_evts = [e for e in evts if e.get("type") == "package.updated" and (e.get("payload") or {}).get("package_ref") == pid]
step("package.updated webhook event created", len(upd_evts) >= 1, f"count={len(upd_evts)}")

# 7. FAILURE case: kill the mock, new package share must FAIL with clear error + rollback
subprocess.run("pkill -f meraaj_mock.js", shell=True)
time.sleep(1)
r = s.post(f"{BASE}/packages", json={**pkg_body, "name": "TEST-v329-FAIL-CASE"})
pid2 = r.json()["id"]
r = s.post(f"{BASE}/packages/{pid2}/meraaj-share", json={
    "enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 20,
    "commission_direction": "added", "seats_allocated": 5,
})
step("share fails with 502 when Meraaj is down", r.status_code == 502, r.text[:150])
r = s.get(f"{BASE}/packages")
p2 = next((p for p in r.json() if p["id"] == pid2), None)
step("failed share rolled back (shared=false)", p2 and not (p2.get("meraaj") or {}).get("shared"))

print("\n--- test package ids for cleanup:", pid, pid2)
