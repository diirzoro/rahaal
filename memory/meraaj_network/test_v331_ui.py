import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1920, "height": 800})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
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
        # click first نسخ button (confirm auto-accepted)
        await page.locator('button:has-text("نسخ")').first.click(timeout=10000)
        await page.wait_for_timeout(5000)
        # Full edit dialog should be open with copied data
        try:
            await page.wait_for_selector('text=تعديل الباكج', timeout=10000)
            print("FULL EDIT FORM OPENED after duplicate")
            name_val = await page.locator('div[role="dialog"] input').first.input_value()
            print("Name field value:", name_val)
            print("Has نسخة suffix:", "نسخة" in name_val)
        except Exception as e:
            print("edit dialog:", e)
        await page.screenshot(path="/tmp/ss_dup_edit_form.png", quality=30, type="jpeg")
        print("=== JS ERRORS ===")
        for e in errors[:5]:
            print(e)
        await browser.close()

asyncio.run(main())
