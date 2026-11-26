"""Percorre os diários (séries I e II) dos últimos dias no site do Diário da República e junta a
dados/dr-matosinhos.json os atos cujo emitente ou sumário refere Matosinhos. Complementa o RSS,
que só tem o próprio dia. Corre no GitHub Actions com Playwright. Uso: python dr_dias.py [dias]"""
import asyncio, datetime as dt, json, sys, unicodedata
from pathlib import Path
from playwright.async_api import async_playwright

FICH = Path(__file__).resolve().parent.parent / "dados" / "dr-matosinhos.json"
SITE = "https://diariodarepublica.pt"
DIAS = int(sys.argv[1]) if len(sys.argv) > 1 else 3
norm = lambda s: unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
chave = lambda a: (a.get("data", ""), norm(a.get("ato", "")).replace(" ", ""))

async def main():
    atos = json.loads(FICH.read_text("utf-8")) if FICH.exists() else []
    vistos = {chave(a) for a in atos} | {a.get("link") for a in atos}
    hoje = dt.date.today()
    datas = [d.isoformat() for d in (hoje - dt.timedelta(n) for n in range(DIAS + 1)) if d.weekday() < 5]
    novos = 0
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        modelos = {}
        def guardar_pedido(req):
            for s in ("1", "2"):
                if f"WB_Serie{s}_List/DataAction" in req.url and req.post_data: modelos[s] = (req.url, dict(req.headers), req.post_data)
        pg.on("request", guardar_pedido)
        await pg.goto(f"{SITE}/dr/home", wait_until="networkidle", timeout=120000)
        await pg.get_by_text("2.ª Série", exact=True).first.click(); await pg.wait_for_timeout(5000)
        diarios = []
        for serie, (url, hdr, corpo) in modelos.items():
            hdr = {k: v for k, v in hdr.items() if k.lower() in ("content-type", "x-csrftoken", "accept", "outsystems-locale")}
            for d in datas:
                j = json.loads(corpo); j["screenData"]["variables"]["DataSelecionada"] = d
                if "clientVariables" in j: j["clientVariables"]["Data"] = d
                r = await pg.request.post(url, data=json.dumps(j), headers=hdr)
                try: lst = (await r.json())["data"]["DiarioByDiaList"]["List"]
                except Exception as e: print("falhou lista", serie, d, r.status, e); continue
                for x in lst:
                    if x.get("DataPublicacao") == d and x.get("LinkSitemap"): diarios.append((serie, d, x["LinkSitemap"], x.get("Title", "")))
        print(len(diarios), "diários a ver:", *[t for *_, t in diarios], sep="\n  ")
        for serie, d, link, titulo in diarios:
            fut = asyncio.get_running_loop().create_future()
            async def resp(r):
                if "Conteudo_Det_Diario/DataActionGetDados" in r.url and not fut.done():
                    try: fut.set_result((await r.json())["data"]["DetalheConteudo"]["List"])
                    except Exception as e: fut.set_result([]); print("erro", e)
            pg.on("response", resp)
            try:
                await pg.goto(SITE + link, wait_until="domcontentloaded", timeout=120000)
                lst = await asyncio.wait_for(fut, 90)
            except Exception as e: print("falhou diário", titulo, e); lst = []
            pg.remove_listener("response", resp)
            for x in lst:
                if "matosinhos" not in norm(f"{x.get('Emissor')} {x.get('Sumario')}"): continue
                a = {"data": d, "serie": serie.replace("1", "I").replace("2", "II"), "ato": (x.get("Titulo") or "").strip(),
                     "titulo": f"{(x.get('Titulo') or '').strip()} - {x.get('Emissor') or ''}", "sumario": (x.get("Sumario") or "").strip(),
                     "emissor": x.get("Emissor") or "", "link": SITE + (x.get("LinkSitemap") or link)}
                if chave(a) in vistos or a["link"] in vistos: continue
                atos.append(a); vistos |= {chave(a), a["link"]}; novos += 1
            print(titulo, "->", len(lst), "atos")
        await b.close()
    atos.sort(key=lambda a: (a["data"], a["titulo"]), reverse=True)
    FICH.parent.mkdir(exist_ok=True)
    FICH.write_text(json.dumps(atos[:1000], ensure_ascii=False, indent=0), "utf-8")
    print("novos", novos, "total", len(atos))

asyncio.run(main())
