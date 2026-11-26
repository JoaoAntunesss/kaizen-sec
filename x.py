import json, asyncio, re
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        etapa = {"n": "inicio"}
        async def resp(r):
            if "screenservices" in r.url and "Serie" in r.url:
                try: body = await r.text()
                except: body = ""
                print("RESP", etapa["n"], r.url.split("screenservices/")[1], len(body), "matosinhos:", body.lower().count("matosinhos"))
                if "Serie2" in r.url: print("REQ", (r.request.post_data or "")[:700]); print("BODY", body[:2500]); print("---")
        pg.on("response", resp)
        await pg.goto("https://diariodarepublica.pt/dr/home", wait_until="networkidle", timeout=90000)
        etapa["n"] = "serie2"; await pg.get_by_text("2.ª Série", exact=True).first.click(); await pg.wait_for_timeout(6000)
        for d in ["25", "23"]:
            etapa["n"] = "dia" + d
            await pg.locator("a", has_text=re.compile(rf"^\s*{d}\s*$")).first.click(); await pg.wait_for_timeout(8000)
            t = await pg.inner_text("body"); i = t.lower().find("matosinhos")
            print("TEXTO", d, len(t), "ocorr", t.lower().count("matosinhos"), t[max(0,i-300):i+200] if i>=0 else t[:800])
        await b.close()
asyncio.run(main())
