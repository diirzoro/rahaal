import requests, time

BASE = "http://localhost:3000/api"
s = requests.Session()
R = {}

def pkg(pid):
    return next((p for p in s.get(f"{BASE}/packages").json() if p["id"] == pid), None)

s.post(f"{BASE}/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
sup_id = s.get(f"{BASE}/suppliers").json()[0]["id"]
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

body = {"name": "RPT-v334-MAIN", "package_type": "umrah", "currency": "SAR", "start_date": "2027-07-01", "end_date": "2027-07-10", "pricing_mode": "direct", "room_pricing": [{"type": "رباعية", "sale_per_pax": 1000, "sale_child": 400, "sale_infant": 40}], "features": ["ميزة 1"]}
pid = s.post(f"{BASE}/packages", json=body).json()["id"]
s.post(f"{BASE}/packages/{pid}/components", json={"component_type": "hotel", "name": "فندق أ", "supplier_id": sup_id, "cost_per_pax": 100, "sale_per_pax": 150, "pricing_type": "flat"})

# 1. DUPLICATE — independent copy with full data (UI opens full edit form: verified via Playwright in v3.31)
d = s.post(f"{BASE}/packages/{pid}/duplicate", json={}).json()
did = d.get("id")
R["Duplicate"] = bool(did) and did != pid and d.get("components_copied") == 1 and len(d.get("room_pricing", [])) == 1 and not (d.get("meraaj") or {}).get("remote_id")

# 2. UPDATE — name + price + dates persisted
r = s.patch(f"{BASE}/packages/{pid}", json={"name": "RPT-v334-RENAMED", "start_date": "2027-07-02", "end_date": "2027-07-12", "room_pricing": [{"type": "رباعية", "sale_per_pax": 1200, "sale_child": 500, "sale_infant": 50}]})
p = pkg(pid)
R["Update"] = r.status_code == 200 and p["name"] == "RPT-v334-RENAMED" and p["room_pricing"][0]["sale_per_pax"] == 1200 and p["start_date"].startswith("2027-07-02") and p["end_date"].startswith("2027-07-12")

# 3. CLOSE
r = s.patch(f"{BASE}/packages/{pid}", json={"status": "closed"})
R["Close"] = r.status_code == 200 and pkg(pid)["status"] == "closed"

# 4. REOPEN
r = s.patch(f"{BASE}/packages/{pid}", json={"status": "open"})
R["Reopen"] = r.status_code == 200 and pkg(pid)["status"] == "open"

# 5. UNSHARE — share (to local mock) then unshare; local state must flip
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": True, "buyer_commission_mode": "amount", "buyer_commission_value": 10, "commission_direction": "added", "seats_allocated": 2})
shared_ok = r.status_code == 200 and (pkg(pid).get("meraaj") or {}).get("shared") is True
r = s.post(f"{BASE}/packages/{pid}/meraaj-share", json={"enabled": False})
R["Unshare"] = shared_ok and r.status_code == 200 and (pkg(pid).get("meraaj") or {}).get("shared") is False

# 8. COMPONENTS — add / edit (delete+re-add, matching UI) / delete + independence between original & copy
c1 = s.post(f"{BASE}/packages/{pid}/components", json={"component_type": "transport", "name": "باص أ", "supplier_id": sup_id, "cost_per_pax": 30, "sale_per_pax": 50, "pricing_type": "flat"}).json()
add_ok = bool(c1.get("id"))
del_ok = s.delete(f"{BASE}/packages/{pid}/components/{c1['id']}").status_code == 200
c2 = s.post(f"{BASE}/packages/{pid}/components", json={"component_type": "transport", "name": "باص أ معدل", "supplier_id": sup_id, "cost_per_pax": 35, "sale_per_pax": 60, "pricing_type": "flat"}).json()
edit_ok = bool(c2.get("id"))
orig_comps = s.get(f"{BASE}/packages/{pid}/components").json()
copy_comps = s.get(f"{BASE}/packages/{did}/components").json()
independent = len(copy_comps) == 1 and copy_comps[0]["name"] == "فندق أ" and len(orig_comps) == 2
R["Components"] = add_ok and del_ok and edit_ok and independent

# 9. IMAGE — upload / fetch / replace / delete
up = s.post(f"{BASE}/packages/{pid}/image", json={"data": PNG}).status_code == 200
got = s.get(f"{BASE}/packages/{pid}/image")
fetch_ok = got.status_code == 200 and got.headers.get("Content-Type", "").startswith("image/")
rep = s.post(f"{BASE}/packages/{pid}/image", json={"data": PNG}).status_code == 200
has_flag = pkg(pid).get("has_image") is True
del_img = s.delete(f"{BASE}/packages/{pid}/image").status_code == 200 and pkg(pid).get("has_image") is False
R["Image"] = up and fetch_ok and rep and has_flag and del_img

# 10. FEATURES — edit + persisted
r = s.patch(f"{BASE}/packages/{pid}", json={"features": ["ميزة جديدة", "ميزة ثانية"]})
R["Features"] = r.status_code == 200 and pkg(pid).get("features") == ["ميزة جديدة", "ميزة ثانية"]

# 6. DELETE — test pkg without bookings
r = s.delete(f"{BASE}/packages/{did}")
R["Delete"] = r.status_code == 200 and pkg(did) is None

# 7. BULK DELETE — only targeted items affected
b1 = s.post(f"{BASE}/packages", json={**body, "name": "RPT-v334-BULK1"}).json()["id"]
b2 = s.post(f"{BASE}/packages", json={**body, "name": "RPT-v334-BULK2"}).json()["id"]
ctrl = s.post(f"{BASE}/packages", json={**body, "name": "RPT-v334-KEEP"}).json()["id"]
r = s.post(f"{BASE}/packages/bulk-delete", json={"ids": [b1, b2]})
res = r.json()
R["Bulk Delete"] = res.get("deleted") == 2 and pkg(b1) is None and pkg(b2) is None and pkg(ctrl) is not None

# cleanup (delete = allowed on own test pkgs without bookings)
s.delete(f"{BASE}/packages/{ctrl}")
s.delete(f"{BASE}/packages/{pid}")
p585 = next((x for x in s.get(f"{BASE}/packages").json() if x["id"].startswith("585b9e89")), None)

order = ["Duplicate", "Update", "Close", "Reopen", "Unshare", "Delete", "Bulk Delete", "Components", "Image", "Features"]
for k in order:
    print(f"{k}: {'PASS' if R.get(k) else 'FAIL'}")
n = sum(1 for k in order if R.get(k))
print(f"PASS: {n}/10 | FAIL: {10-n}/10")
print("pre-existing 585b9e89 untouched:", p585 is not None and (p585.get('meraaj') or {}).get('shared') is True)
