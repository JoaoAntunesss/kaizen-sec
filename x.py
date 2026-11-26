import json, asyncio, re
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        etapa = {"n": ""}
        async def resp(r):
            if "screenservices" in r.url:
                try: body = await r.text()
                except: body = ""
                c = body.lower().count("matosinhos")
                if c or "esquisa" in r.url: print("RESP", etapa["n"], r.url.split("screenservices/")[1], len(body), "matosinhos:", c); print("REQ", (r.request.post_data or "")[:1200]); print("BODY", body[:1800]); print("---")
        pg.on("response", resp)
        etapa["n"] = "diario"
        await pg.goto("https://diariodarepublica.pt/dr/detalhe/diario-republica/227-2026-1196996214", wait_until="networkidle", timeout=90000); await pg.wait_for_timeout(6000)
        t = await pg.inner_text("body"); print("DIARIO texto", len(t), "ocorr", t.lower().count("matosinhos")); print(t[:1500])
        etapa["n"] = "pesquisa"
        await pg.goto("https://diariodarepublica.pt/dr/home", wait_until="networkidle", timeout=90000)
        inp = pg.locator("input[type=text], input[type=search]").first
        await inp.fill("Matosinhos"); await inp.press("Enter"); await pg.wait_for_timeout(10000)
        print("URL", pg.url); t = await pg.inner_text("body"); print("PESQ texto", len(t), "ocorr", t.lower().count("matosinhos")); print(t[:3000])
        await b.close()
asyncio.run(main())
