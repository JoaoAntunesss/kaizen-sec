import json, asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        async def resp(r):
            if "screenservices" in r.url:
                try: body = await r.text()
                except: body = ""
                print("RESP", r.url, "\nREQ", (r.request.post_data or "")[:1500], "\nBODY", body[:1500], "\n----")
        pg.on("response", resp)
        await pg.goto("https://diariodarepublica.pt/dr/home", wait_until="networkidle", timeout=90000)
        await pg.wait_for_timeout(5000)
        links = await pg.eval_on_selector_all("a", "els=>els.map(e=>e.href+' | '+e.innerText.trim().slice(0,60)).filter(x=>/detalhe|serie|calend|dia/i.test(x)).slice(0,60)")
        print("LINKS", json.dumps(links, ensure_ascii=False, indent=0))
        await b.close()
asyncio.run(main())
