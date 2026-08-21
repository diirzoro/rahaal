import requests, json, subprocess, time

BASE = "http://localhost:3000/api"
STORE = "/app/memory/meraaj_network/meraaj_mock_store.json"
s = requests.Session()

def step(name, cond, extra=""):
    print(("PASS" if cond else "FAIL"), "|", name, ("| " + str(extra))[:150] if extra else "")

def store(pid):
    try:
        with open(STORE) as f: return json.load(f).get(pid, {})
    except Exception:
        return {}

s.post(f"{BASE}/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
subprocess.run("pgrep -f meraaj_mock.js > /dev/null || (export $(grep -v '^#' /app/.env | xargs) && nohup node /app/memory/meraaj_network/meraaj_mock.js >> /app/memory/meraaj_network/mock_server.out 2>&1 &)", shell=True, executable="/bin/bash")
time.sleep(2)

# package with FEATURES + IMAGE
r = s.post(f"{BASE}/packages", json={"name": "TEST-v333-MEDIA", "package_type": "umrah", "currency": "SAR", "start_date": "2027-04-01", "end_date": "2027-04-08", "pricing_mode": "direct", "room_pricing": [{"type": "رباعية", "sale_per_pax": 800, "sale_child": 300, "sale_infant": 40}], "features": ["إفطار مجاني", "مرشد ديني", "قرب الحرم"]})
pid = r.json()["id"]
png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
s.post(f"{BASE}/packages/{pid}/image", json={"data": png})

# 1. FIRST SHARE → features + absolute image URL in payload
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 30, "commission_direction": "added", "seats_allocated": 5})
step("share 200", r.status_code == 200)
st = store(pid)
step("features reached Meraaj on FIRST SHARE", st.get("features") == ["إفطار مجاني", "مرشد ديني", "قرب الحرم"], st.get("features"))
imgs = st.get("images", [])
step("image URL present, absolute https (not relative/localhost)", len(imgs) == 1 and imgs[0].startswith("https://") and "localhost" not in imgs[0] and "127.0.0.1" not in imgs[0], imgs)
step("image URL format /api/meraaj/packages/{ref}/image", imgs and imgs[0].endswith(f"/api/meraaj/packages/{pid}/image"))

# 2. Image endpoint PUBLICLY accessible (no auth headers at all)
anon = requests.get(f"http://localhost:3000/api/meraaj/packages/{pid}/image")
step("image loads WITHOUT any auth (public)", anon.status_code == 200 and anon.headers.get("Content-Type", "").startswith("image/"), f"{anon.status_code} {anon.headers.get('Content-Type')}")

# 3. package.updated keeps features + images after edits
r = s.patch(f"{BASE}/packages/{pid}", json={"features": ["ميزة جديدة v333"]})
step("PATCH features 200", r.status_code == 200)
time.sleep(1)
st = store(pid)
step("updated features reflected in Meraaj", st.get("features") == ["ميزة جديدة v333"], st.get("features"))
step("images still present in package.updated payload", len(st.get("images", [])) == 1)

# 4. unshared package image → blocked
s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": False})
anon2 = requests.get(f"http://localhost:3000/api/meraaj/packages/{pid}/image")
step("image blocked (404) once unshared", anon2.status_code == 404)

# regression + cleanup
s.post(f"{BASE}/packages/{pid}/archive", json={"archived": True})
active = s.get(f"{BASE}/packages").json()
step("cleanup + pre-existing 585b9e89 untouched", not [x for x in active if "v333" in x["name"]] and next((x for x in active if x["id"].startswith("585b9e89")), {}).get("meraaj", {}).get("shared") is True)
