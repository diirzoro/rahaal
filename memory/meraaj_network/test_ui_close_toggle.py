import asyncio, requests
from playwright.async_api import async_playwright

# prepare a test package via API
s = requests.Session()
s.post("http://localhost:3000/api/auth/login", json={"email": "owner@demo.com", "password": "Demo@2025"})
pid = s.post("http://localhost:3000/api/packages", json={"name": "UI-CLOSE-TEST-v334", "package_type": "umrah", "currency": "SAR", "start_date": "2027-08-01", "end_date": "2027-08-05", "pricing_mode": "direct", "room_pricing": [{"type": "رباعية", "sale_per_pax": 500, "sale_child": 200, "sale_infant": 20}]}).json()["id"]
print("test pkg:", pid)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1920, "height": 900})
        page = await ctx.new_page()
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page.goto("http://localhost:3000", timeout=60000)
        await page.wait_for_timeout(6000)
        await page.click('text=تسجيل الدخول', timeout=15000)
        await page.wait_for_timeout(2000)
        await page.fill('input[type="email"]', "owner@demo.com")
        await page.fill('input[type="password"]', "Demo@2025")
        await page.click('button[type="submit"]')
        await page.wait_for_timeout(7000)
        await page.click('text=الباكجات', timeout=10000)
        await page.wait_for_timeout(4000)

        card = page.locator('div.overflow-hidden', has=page.locator('text=UI-CLOSE-TEST-v334')).first
        n_close = await card.locator('button:has-text("إغلاق")').count()
        n_open = await card.locator('button:has-text("فتح")').count()
        print(f"BEFORE: open card has إغلاق={n_close}, فتح={n_open}")

        # 1. click إغلاق
        await card.locator('button:has-text("إغلاق")').first.click(timeout=10000)
        await page.wait_for_timeout(4000)
        await page.screenshot(path="/tmp/ui_closed.png", quality=30, type="jpeg")
        # card moves to closed section — re-locate
        card2 = page.locator('div.overflow-hidden', has=page.locator('text=UI-CLOSE-TEST-v334')).first
        n_close2 = await card2.locator('button:has-text("إغلاق")').count()
        n_open2 = await card2.locator('button:has-text("فتح")').count()
        closed_badge = await card2.locator('text=مغلق').count()
        print(f"AFTER CLOSE: إغلاق button={n_close2} (must be 0), فتح/تنشيط button={n_open2} (must be 1), closed badge={closed_badge}")

        # 2. click فتح (reactivate)
        await card2.locator('button:has-text("فتح")').first.click(timeout=10000)
        await page.wait_for_timeout(4000)
        await page.screenshot(path="/tmp/ui_reopened.png", quality=30, type="jpeg")
        card3 = page.locator('div.overflow-hidden', has=page.locator('text=UI-CLOSE-TEST-v334')).first
        n_close3 = await card3.locator('button:has-text("إغلاق")').count()
        n_open3 = await card3.locator('button:has-text("فتح")').count()
        print(f"AFTER REOPEN: إغلاق button={n_close3} (must be 1), فتح button={n_open3} (must be 0)")

        v = (n_close == 1 and n_open == 0 and n_close2 == 0 and n_open2 == 1 and n_close3 == 1 and n_open3 == 0)
        print("UI TOGGLE BEHAVIOR:", "PASS" if v else "FAIL")
        await browser.close()

asyncio.run(main())
# cleanup
print("cleanup delete:", s.delete(f"http://localhost:3000/api/packages/{pid}").status_code)
