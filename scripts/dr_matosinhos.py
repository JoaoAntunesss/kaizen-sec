"""Recolhe do Diário da República (RSS das séries I e II do dia) os atos que referem Matosinhos.
Junta-os a dados/dr-matosinhos.json (o mais recente primeiro). Corre no GitHub Actions."""
import json, re, unicodedata, urllib.request, html
from pathlib import Path

FICH = Path(__file__).resolve().parent.parent / "dados" / "dr-matosinhos.json"
FEEDS = {"I": "https://files.diariodarepublica.pt/rss/serie1.xml", "II": "https://files.diariodarepublica.pt/rss/serie2.xml"}
norm = lambda s: unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()

def ler(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Secretaria da Conservacao, CM Matosinhos)"})
    return urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")

def campo(item, nome):
    m = re.search(rf"<{nome}[^>]*>(.*?)</{nome}>", item, re.S)
    if not m: return ""
    t = re.sub(r"^\s*<!\[CDATA\[|\]\]>\s*$", "", m.group(1).strip())
    return html.unescape(re.sub(r"\s+", " ", t)).strip()

atos = json.loads(FICH.read_text("utf-8")) if FICH.exists() else []
vistos = {a["link"] for a in atos}
novos = 0
for serie, url in FEEDS.items():
    try: xml = ler(url)
    except Exception as e: print("falhou", serie, e); continue
    for it in re.findall(r"<item>(.*?)</item>", xml, re.S):
        tit, desc, link = campo(it, "title"), campo(it, "description"), campo(it, "link")
        if not link or link in vistos or "matosinhos" not in norm(tit + " " + desc): continue
        m = re.search(r"(\d{4}-\d{2}-\d{2})\s*$", tit)
        ato = tit.split(" - ")[0].strip()
        atos.append({"data": m.group(1) if m else "", "serie": serie, "ato": ato, "titulo": tit, "sumario": desc, "link": link})
        vistos.add(link); novos += 1
atos.sort(key=lambda a: (a["data"], a["titulo"]), reverse=True)
FICH.parent.mkdir(exist_ok=True)
FICH.write_text(json.dumps(atos[:1000], ensure_ascii=False, indent=0), "utf-8")
print("novos", novos, "total", len(atos))
