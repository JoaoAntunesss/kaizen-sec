import json, asyncio, re
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        cap = []
        async def resp(r):
            if "Conteudo_Det_Diario/DataActionGetDados" in r.url:
                body = await r.text(); req = r.request.post_data or ""
                d = json.loads(body)["data"]; lst = d["DetalheConteudo"]["List"]
                print("ITENS", len(lst), "keys", list(d.keys())[:20])
                v = json.loads(req)["screenData"]["variables"]
                print("VARS", {k: (v[k] if not isinstance(v[k], (dict, list)) else "...") for k in v})
                print("MATO", [x["Numero"] + " " + x["Emissor"] + " | " + x["Sumario"][:80] for x in lst if "matosinhos" in (x["Emissor"] + x["Sumario"]).lower()])
                cap.append(1)
        pg.on("response", resp)
        await pg.goto("https://diariodarepublica.pt/dr/detalhe/diario-republica/227-2026-1196996214", wait_until="networkidle", timeout=90000); await pg.wait_for_timeout(3000)
        sel = pg.locator("select"); print("SELECTS", await sel.count())
        for i in range(await sel.count()):
            print(i, await sel.nth(i).inner_text())
        try:
            s = pg.locator("select", has_text="200").first; await s.select_option(label="200"); await pg.wait_for_timeout(8000)
        except Exception as e: print("sel err", e)
        t = await pg.inner_text("body"); m = re.search(r"\d+ de \d+ resultados", t); print("TXT", m and m.group(0))
        await b.close()
asyncio.run(main())
