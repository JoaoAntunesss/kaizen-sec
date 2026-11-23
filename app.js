import { GROQ_API_KEY, FIREBASE_CONFIG, COL_REUNIOES, COL_FOTOS, EQUIPA as EQUIPA_INICIAL, POWERBI_URL, MAPAS } from "./config.js";
const COL_EQUIPA = "kaizen_equipa";
const COL_URGENTES = "kaizen_urgentes";
const COL_MAPAS = "kaizen_mapas";
// Equipa: vem da base de dados (editável na app); enquanto não houver, usa a lista do config.js
let EQUIPA = EQUIPA_INICIAL.map((p) => ({ ...p }));

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const COLS = ["A fazer", "Em curso", "Pendente", "Concluído"];
const COL_CORES = ["var(--s0)", "var(--s1)", "var(--s2)", "var(--s3)"];
const MODELOS_VISAO = ["qwen/qwen3.8-27b", "qwen/qwen3.6-27b", "meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"];
const EST_PRES = { P: "Presente", F: "Falta", J: "Justificada" };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const isoData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const fmt = (s) => { if (!isoData(s)) return s || ""; const [a, m, d] = s.split("-"); return `${d}/${m}/${a}`; };
const fmtCurto = (s) => isoData(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : s || "";
const semanaISO = (s) => { const d = new Date(s + "T12:00:00"); if (isNaN(d)) return ""; d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7); };
const colIdx = (c) => Math.max(0, COLS.indexOf(c));
const emAtraso = (t, ref) => t.coluna !== "Concluído" && isoData(t.prazo) && t.prazo < ref;

const est = { user: null, urgentes: [], mapas: [], reunioes: [], abertaId: null, tab: "presencas", editId: null, fotos: {}, linhas: [], pres: {}, stream: null };
const TIPOS_FOTO = { postits: "quadro de post-its", presencas: "folha de presenças", acoes: "folha de ações", notas: "folha de apontamentos" };
const temFotoDe = (r, k) => !!((r.fotos && r.fotos[k]) || (k === "postits" && r.temFoto));
let fb = null;

/* ---------------- Vistas ---------------- */
const VISTAS = ["vLogin", "vConfig", "vPainel", "vReuniao", "vRegistar", "vImprimir", "vEquipa", "vRelatorio", "vPowerBI", "vDiario", "vMapas"];
function mostrar(v) {
  for (const id of VISTAS) $(id).hidden = id !== v;
  $("fab").hidden = v !== "vPainel";
  $("btnNovaTop").hidden = v !== "vPainel";
  $("btnSair").hidden = !est.user;
  if (v !== "vRegistar") pararCamera();
  window.scrollTo(0, 0);
}

/* ---------------- Instalar (PWA) ---------------- */
let pedidoInstalar = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalar = e; $("btnInstalar").hidden = false; });
window.addEventListener("appinstalled", () => { $("btnInstalar").hidden = true; pedidoInstalar = null; });
$("btnInstalar").addEventListener("click", async () => {
  if (!pedidoInstalar) return;
  pedidoInstalar.prompt();
  await pedidoInstalar.userChoice.catch(() => null);
  pedidoInstalar = null; $("btnInstalar").hidden = true;
});
const instalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
try { if (ios && !instalada && !localStorage.getItem("kz-ios-ok")) $("iosHint").hidden = false; } catch {}
$("iosFechar").addEventListener("click", () => { $("iosHint").hidden = true; try { localStorage.setItem("kz-ios-ok", "1"); } catch {} });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------------- Firebase ---------------- */
async function iniciarFirebase() {
  if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) { mostrar("vConfig"); return; }
  const [appM, authM, dbM] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-database.js")]);
  const app = appM.initializeApp(FIREBASE_CONFIG);
  fb = { auth: authM.getAuth(app), db: dbM.getDatabase(app), A: authM, D: dbM };
  fb.A.getRedirectResult(fb.auth).catch((e) => { $("loginStatus").textContent = msgErroLogin(e); $("loginStatus").className = "status err"; });
  fb.A.onAuthStateChanged(fb.auth, (u) => {
    est.user = u;
    $("btnMestreAbrir").hidden = !u; if (u) olaMestre();
    if (!u) { chatLimparUI(); fecharMestre(); mostrar("vLogin"); return; }
    if ($("vLogin").hidden === false || $("vConfig").hidden === false || VISTAS.every((v) => $(v).hidden)) mostrar("vPainel");
    subscrever();
  });
}
function msgErroLogin(e) {
  const c = (e && e.code) || "";
  if (c.includes("unauthorized-domain")) return "Este endereço ainda não está autorizado no Firebase (Authentication > Settings > Authorized domains).";
  if (c.includes("popup-closed")) return "A janela de login foi fechada antes de terminar.";
  return "Não foi possível entrar. Tente outra vez.";
}
$("btnLogin").addEventListener("click", async () => {
  if (!fb) return;
  const prov = new fb.A.GoogleAuthProvider();
  $("loginStatus").textContent = "A abrir o login…"; $("loginStatus").className = "status";
  try { await fb.A.signInWithPopup(fb.auth, prov); }
  catch (e) {
    if (String(e.code).includes("popup-blocked") || String(e.code).includes("operation-not-supported")) { await fb.A.signInWithRedirect(fb.auth, prov); return; }
    $("loginStatus").textContent = msgErroLogin(e); $("loginStatus").className = "status err";
  }
});
$("btnSair").addEventListener("click", () => fb && fb.A.signOut(fb.auth));

let pararSub = null;
function subscrever() {
  if (pararSub) return;
  const { D, db } = fb;
  D.onValue(D.ref(db, COL_EQUIPA), (snap) => {
    const v = snap.val();
    if (v) EQUIPA = Object.entries(v).filter(([, p]) => p && p.ativo !== false).map(([mec, p]) => ({ mec, nome: p.nome || "", ordem: p.ordem ?? 999 }))
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"));
    est.equipaBD = v || null;
    desenharPainel();
    if (!$("vEquipa").hidden) desenharEquipa();
  }, () => {});
  D.onValue(D.ref(db, COL_MAPAS), (snap) => {
    const v = snap.val() || {};
    est.mapas = Object.entries(v).map(([id, m]) => ({ id, ...m }));
    desenharMapas();
  }, () => { $("mapasStatus").textContent = "Não consegui ler os mapas."; $("mapasStatus").className = "status err"; });
  D.onValue(D.ref(db, COL_URGENTES), (snap) => {
    const v = snap.val() || {};
    est.urgentes = Object.entries(v).map(([id, u]) => ({ id, ...u }));
    verificarAvisos(est.urgentes);
    desenharUrgentes();
    if (abrirPendente) { abrirPendente = false; abrirDiario("Ofício por assinar"); history.replaceState(null, "", location.pathname); }
  }, () => { $("urgStatus").textContent = "Não consegui ler os Edocs urgentes."; $("urgStatus").className = "status err"; });
  pararSub = D.onValue(D.ref(db, COL_REUNIOES), (snap) => {
    const v = snap.val() || {};
    est.reunioes = Object.keys(v).map((id) => ({ id, ...v[id], tarefas: Object.entries(v[id].tarefas || {}).map(([k, t]) => ({ ...t, _k: k })), presencas: v[id].presencas || {} }))
      .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    desenharPainel();
    if (!$("vReuniao").hidden) { if (reuniaoAberta()) desenharReuniao(); else mostrar("vPainel"); }
  }, (e) => {
    $("meetList").innerHTML = `<p class="empty">${String(e.code || e.message).includes("permission") ? "Sem permissão para ler as reuniões. Confirme as regras da base de dados." : "Não consegui ligar aos dados. Verifique a internet."}</p>`;
  });
}

/* ---------------- Painel ---------------- */
// Equipa de cada reunião: guardada com a reunião (quem fazia parte nessa altura). Reuniões antigas sem essa
// informação usam a equipa atual mais quem tenha presença registada nelas.
function nomesConhecidos() {
  const m = {};
  EQUIPA_INICIAL.forEach((p) => (m[p.mec] = p.nome));
  Object.entries(est.equipaBD || {}).forEach(([mec, p]) => { if (p && p.nome) m[mec] = p.nome; });
  est.reunioes.forEach((r) => (r.equipa || []).forEach((p) => { if (p && p.mec && !m[p.mec]) m[p.mec] = p.nome; }));
  EQUIPA.forEach((p) => (m[p.mec] = p.nome));
  return m;
}
function equipaDe(r) {
  if (Array.isArray(r.equipa) && r.equipa.length) return r.equipa;
  const nomes = nomesConhecidos(), l = EQUIPA.map((p) => ({ mec: p.mec, nome: p.nome }));
  Object.keys(r.presencas || {}).forEach((mec) => { if (!l.some((p) => p.mec === mec)) l.push({ mec, nome: nomes[mec] || mec }); });
  return l;
}
function equipaDoConjunto(rs) {
  const vistos = new Map();
  EQUIPA.forEach((p) => { if (rs.some((r) => equipaDe(r).some((q) => q.mec === p.mec))) vistos.set(p.mec, p); });
  rs.forEach((r) => equipaDe(r).forEach((p) => { if (!vistos.has(p.mec)) vistos.set(p.mec, { ...p, saiu: !EQUIPA.some((q) => q.mec === p.mec) }); }));
  const l = [...vistos.values()];
  return l.length ? l : EQUIPA;
}
const contaPres = (r) => equipaDe(r).filter((p) => r.presencas[p.mec] === "P").length;
const tamEq = (r) => equipaDe(r).length;
const marcada = (r) => Object.keys(r.presencas || {}).length > 0;

/* Ano em consulta: o painel mostra um ano de cada vez (o histórico dos anos anteriores fica consultável) */
const anoAtual = () => String(new Date().getFullYear());
const anosDisponiveis = () => [...new Set([anoAtual(), ...est.reunioes.map((r) => String(r.data || "").slice(0, 4)).filter((a) => /^\d{4}$/.test(a))])].sort().reverse();
const doAno = () => est.reunioes.filter((r) => String(r.data || "").startsWith(est.ano || anoAtual()));
function desenharAnos() {
  const anos = anosDisponiveis();
  if (!est.ano || !anos.includes(est.ano)) est.ano = anos.includes(anoAtual()) && (doAnoDe(anoAtual()).length || anos.length === 1) ? anoAtual() : anos.find((a) => doAnoDe(a).length) || anoAtual();
  $("anos").innerHTML = anos.map((a) => `<button type="button" class="ano" data-ano="${a}" aria-pressed="${a === est.ano}">${a}${a === anoAtual() ? "" : " · arquivo"}</button>`).join("");
  $("anoAviso").hidden = est.ano === anoAtual();
  $("anoAviso").textContent = `Está a ver o arquivo de ${est.ano}. As reuniões novas ficam em ${anoAtual()}.`;
}
const doAnoDe = (a) => est.reunioes.filter((r) => String(r.data || "").startsWith(a));
$("anos").addEventListener("click", (e) => { const b = e.target.closest("[data-ano]"); if (b) { est.ano = b.dataset.ano; desenharPainel(); } });

function desenharPainel() {
  desenharAnos();
  const ref = hoje();
  const ult = doAno()[0];
  const ts = ult ? ult.tarefas : [];
  $("tAbertas").textContent = ts.filter((t) => t.coluna !== "Concluído").length;
  $("tAtraso").textContent = ts.filter((t) => emAtraso(t, ref)).length;
  const comPres = doAno().filter(marcada);
  $("tPresenca").textContent = comPres.length ? Math.round((comPres.reduce((s, r) => s + contaPres(r), 0) / comPres.reduce((s, r) => s + tamEq(r), 0)) * 100) + "%" : "–";
  $("tReunioes").textContent = doAno().length;

  // Tarefas por fechar da última reunião, com troca rápida de estado
  const abertas = ult ? ult.tarefas.filter((t) => t.coluna !== "Concluído").sort((a, b) => (emAtraso(b, ref) - emAtraso(a, ref)) || String(a.prazo || "9").localeCompare(String(b.prazo || "9"))) : [];
  $("tarefasSub").textContent = ult ? `da reunião de ${fmt(ult.data)}` : "";
  $("tReunioesL").textContent = `Reuniões em ${est.ano}`;
  $("tarefasLista").innerHTML = abertas.length ? abertas.map((t) => `<div class="tarefa-row"><div class="tr-main"><b>${esc(t.tarefa)}</b><div class="meta">${t.responsavel ? `<span class="chip">${esc(t.responsavel)}</span>` : ""}${t.prazo ? `<span class="chip ${emAtraso(t, ref) ? "late" : ""}">${emAtraso(t, ref) ? "Atrasada · " : "Até "}${esc(fmt(t.prazo))}</span>` : ""}</div></div>${botoesEstado(ult, t)}</div>`).join("") : `<p class="empty">${ult ? "Tudo concluído." : "Sem tarefas ainda."}</p>`;

  $("meetList").innerHTML = doAno().length ? doAno().map((r) => {
    const t = r.tarefas, ab = t.filter((x) => x.coluna !== "Concluído").length, at = t.filter((x) => emAtraso(x, ref)).length;
    return `<button class="meet" type="button" data-id="${esc(r.id)}">
      <div><div class="d">${esc(fmt(r.data))}</div><div class="w">${r.semana ? "Semana " + esc(r.semana) : ""}</div></div>
      <div class="info">${marcada(r) ? `<span class="chip ok">${contaPres(r)}/${tamEq(r)} presentes</span>` : ""}<span class="chip">${t.length} post-its</span>${ab ? `<span class="chip">${ab} por fechar</span>` : ""}${at ? `<span class="chip late">${at} em atraso</span>` : ""}${r.notas ? `<span class="chip">apontamentos</span>` : ""}${Object.keys(TIPOS_FOTO).some((k) => temFotoDe(r, k)) ? `<span class="chip">fotos</span>` : ""}</div>
      <span class="go" aria-hidden="true">Abrir</span></button>`;
  }).join("") : `<p class="empty">Ainda não há reuniões. Depois da reunião, carregue em «Registar reunião».</p>`;

  // Mapa de presenças (como a folha em papel, com a coluna Total)
  const rs = [...doAno()].filter(marcada).reverse().slice(-12);
  $("mapaSub").textContent = rs.length === 1 ? "1 reunião" : rs.length ? `últimas ${rs.length} reuniões` : "";
  $("mapa").innerHTML = rs.length ? `<table class="mapa"><thead><tr><th>N.º Mec.</th><th>Nome</th>${rs.map((r) => `<th class="c">${esc(fmtCurto(r.data))}</th>`).join("")}<th class="c">Total</th></tr></thead><tbody>${
    equipaDoConjunto(rs).map((p) => `<tr><td class="num">${esc(p.mec)}</td><td>${esc(p.nome)}${p.saiu ? ' <span class="chip none">saiu</span>' : ""}</td>${rs.map((r) => { const v = r.presencas[p.mec]; return `<td class="c"><span class="mk ${v || ""}" title="${esc(EST_PRES[v] || "sem registo")}">${v || "·"}</span></td>`; }).join("")}<td class="c"><b>${rs.filter((r) => r.presencas[p.mec] === "P").length}</b></td></tr>`).join("")
  }<tr><td></td><td><b>Presentes</b></td>${rs.map((r) => `<td class="c"><b>${contaPres(r)}</b></td>`).join("")}<td></td></tr></tbody></table>` : `<p class="empty">As presenças aparecem aqui quando registar a primeira reunião.</p>`;
  desenharIndicadores();
}
/* ---------------- Indicadores (estilo Power BI) ---------------- */
const graficos = {};
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function tabelaHTML(cab, linhas) { return `<table><thead><tr>${cab.map((c, i) => `<th${i ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((v, i) => `<td${i ? ' class="num"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
function legendaEstados(id) { $(id).innerHTML = COLS.map((c, i) => `<span><i class="sw" style="background:var(--s${i})"></i>${esc(c)}</span>`).join(""); }
function desenharGrafico(id, cfg) {
  if (!window.Chart) return;
  Chart.defaults.font.family = "'Public Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
  if (graficos[id]) graficos[id].destroy();
  graficos[id] = new Chart($(id), cfg);
}
function baseOpcoes(extra = {}) {
  const txt = cssVar("--muted"), grid = cssVar("--grid");
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "nearest", intersect: true },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: cssVar("--surface"), titleColor: cssVar("--ink"), bodyColor: cssVar("--ink"), borderColor: grid, borderWidth: 1, padding: 10 } },
    scales: {
      x: { grid: { display: false }, ticks: { color: txt, font: { size: 12 } }, border: { color: grid } },
      y: { beginAtZero: true, grid: { color: grid }, ticks: { color: txt, precision: 0, font: { size: 12 } }, border: { display: false } }
    },
    ...extra
  };
}
function desenharIndicadores() {
  const sur = cssVar("--surface");
  const cores = [0, 1, 2, 3].map((i) => cssVar("--s" + i));
  const rs = [...doAno()].reverse().slice(-12);
  const ref = hoje();
  // 1. Estado das tarefas por reunião (barras empilhadas)
  legendaEstados("lgEstados");
  desenharGrafico("chEstados", {
    type: "bar",
    data: { labels: rs.map((r) => fmtCurto(r.data)), datasets: COLS.map((c, i) => ({ label: c, data: rs.map((r) => r.tarefas.filter((t) => colIdx(t.coluna) === i).length), backgroundColor: cores[i], borderColor: sur, borderWidth: { top: 2 }, borderSkipped: false, borderRadius: 4, maxBarThickness: 36 })) },
    options: baseOpcoes({ scales: { ...baseOpcoes().scales, x: { ...baseOpcoes().scales.x, stacked: true }, y: { ...baseOpcoes().scales.y, stacked: true } } })
  });
  $("tbEstados").innerHTML = tabelaHTML(["Reunião", ...COLS], rs.map((r) => [fmt(r.data), ...COLS.map((c, i) => r.tarefas.filter((t) => colIdx(t.coluna) === i).length)]));

  // 2. Presença por reunião (%)
  const rp = rs.filter(marcada);
  desenharGrafico("chPresReu", {
    type: "bar",
    data: { labels: rp.map((r) => fmtCurto(r.data)), datasets: [{ label: "Presença", data: rp.map((r) => Math.round((contaPres(r) / tamEq(r)) * 100)), backgroundColor: cores[1], borderRadius: 4, borderSkipped: "start", maxBarThickness: 36 }] },
    options: baseOpcoes({ plugins: { ...baseOpcoes().plugins, tooltip: { ...baseOpcoes().plugins.tooltip, callbacks: { label: (c) => ` ${c.parsed.y}% (${contaPres(rp[c.dataIndex])} de ${tamEq(rp[c.dataIndex])})` } } }, scales: { ...baseOpcoes().scales, y: { ...baseOpcoes().scales.y, max: 100, ticks: { ...baseOpcoes().scales.y.ticks, callback: (v) => v + "%" } } } })
  });
  $("tbPresReu").innerHTML = tabelaHTML(["Reunião", "Presentes", "%"], rp.map((r) => [fmt(r.data), `${contaPres(r)} de ${tamEq(r)}`, Math.round((contaPres(r) / tamEq(r)) * 100) + "%"]));

  // 3. Tarefas por responsável (última reunião, empilhado por estado)
  const ult = doAno()[0];
  const ts = ult ? ult.tarefas : [];
  $("subResp").textContent = ult ? `reunião de ${fmt(ult.data)}` : "";
  const nomes = [...new Set(ts.map((t) => (t.responsavel || "").trim() || "Sem responsável"))].sort((a, b) => ts.filter((t) => ((t.responsavel || "").trim() || "Sem responsável") === b).length - ts.filter((t) => ((t.responsavel || "").trim() || "Sem responsável") === a).length);
  const conta = (n, i) => ts.filter((t) => ((t.responsavel || "").trim() || "Sem responsável") === n && colIdx(t.coluna) === i).length;
  legendaEstados("lgResp");
  desenharGrafico("chResp", {
    type: "bar",
    data: { labels: nomes, datasets: COLS.map((c, i) => ({ label: c, data: nomes.map((n) => conta(n, i)), backgroundColor: cores[i], borderColor: sur, borderWidth: { right: 2 }, borderSkipped: false, borderRadius: 4, maxBarThickness: 26 })) },
    options: baseOpcoes({ indexAxis: "y", scales: { x: { ...baseOpcoes().scales.y, stacked: true }, y: { ...baseOpcoes().scales.x, stacked: true } } })
  });
  $("tbResp").innerHTML = tabelaHTML(["Responsável", ...COLS, "Em atraso"], nomes.map((n) => [n, ...COLS.map((c, i) => conta(n, i)), ts.filter((t) => ((t.responsavel || "").trim() || "Sem responsável") === n && emAtraso(t, ref)).length]));

  // 4. Assiduidade por pessoa (%)
  const tot = doAno().filter(marcada);
  const eqA = equipaDoConjunto(tot);
  const deles = (p) => tot.filter((r) => equipaDe(r).some((q) => q.mec === p.mec));
  const pct = eqA.map((p) => { const d = deles(p); return d.length ? Math.round((d.filter((r) => r.presencas[p.mec] === "P").length / d.length) * 100) : 0; });
  desenharGrafico("chPresPes", {
    type: "bar",
    data: { labels: eqA.map((p) => p.nome + (p.saiu ? " (saiu)" : "")), datasets: [{ label: "Assiduidade", data: pct, backgroundColor: cores[3], borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 }] },
    options: baseOpcoes({ indexAxis: "y", plugins: { ...baseOpcoes().plugins, tooltip: { ...baseOpcoes().plugins.tooltip, callbacks: { label: (c) => ` ${c.parsed.x}% (${deles(eqA[c.dataIndex]).filter((r) => r.presencas[eqA[c.dataIndex].mec] === "P").length} de ${deles(eqA[c.dataIndex]).length} reuniões)` } } }, scales: { x: { ...baseOpcoes().scales.y, max: 100, ticks: { ...baseOpcoes().scales.y.ticks, callback: (v) => v + "%" } }, y: { ...baseOpcoes().scales.x } } })
  });
  $("tbPresPes").innerHTML = tabelaHTML(["Pessoa", "Presenças", "%"], eqA.map((p, i) => [p.nome + (p.saiu ? " (saiu)" : ""), `${deles(p).filter((r) => r.presencas[p.mec] === "P").length} de ${deles(p).length}`, pct[i] + "%"]));
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (!$("vPainel").hidden) desenharIndicadores(); });

$("meetList").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) abrirReuniao(b.dataset.id); });

/* ---------------- Mudar o estado de uma tarefa ---------------- */
const CURTO = { "A fazer": "A fazer", "Em curso": "Em curso", "Pendente": "Pendente", "Concluído": "Feito" };
const botoesEstado = (r, t) => `<div class="estado" role="group" aria-label="Estado da tarefa">${COLS.map((c, i) =>
  `<button type="button" class="e${i}" data-r="${esc(r.id)}" data-k="${esc(t._k)}" data-col="${esc(c)}" aria-pressed="${t.coluna === c}">${esc(CURTO[c])}</button>`).join("")}</div>`;
async function mudarEstado(rid, k, col, btn) {
  const grupo = btn.closest(".estado");
  grupo.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  try { await fb.D.update(fb.D.ref(fb.db, `${COL_REUNIOES}/${rid}/tarefas/${k}`), { coluna: col, estadoPor: est.user.email || "", estadoEm: new Date().toISOString() }); }
  catch { grupo.insertAdjacentHTML("afterend", `<p class="status err">Não consegui mudar o estado. Verifique a internet.</p>`); }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".estado button[data-k]");
  if (b && b.getAttribute("aria-pressed") !== "true") mudarEstado(b.dataset.r, b.dataset.k, b.dataset.col, b);
});

/* ---------------- Uma reunião ---------------- */
const reuniaoAberta = () => est.reunioes.find((r) => r.id === est.abertaId) || null;
function abrirReuniao(id, tab) { est.abertaId = id; if (tab) est.tab = tab; esconderConfirm(); desenharReuniao(); mostrar("vReuniao"); }
function desenharReuniao() {
  const r = reuniaoAberta(); if (!r) return;
  const ref = hoje(), ts = r.tarefas;
  $("rTitulo").textContent = `Reunião de ${fmt(r.data)}`;
  $("rSub").textContent = [r.semana ? `Semana ${r.semana}` : "", r.criadoPor ? `registada por ${r.criadoPor}` : ""].filter(Boolean).join(" · ");
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === est.tab)));
  document.querySelectorAll(".tabpane").forEach((p) => (p.hidden = p.dataset.pane !== est.tab));

  // Presenças
  $("pPresencas").innerHTML = (marcada(r) ? `<p class="muted">${contaPres(r)} de ${tamEq(r)} presentes.</p>` : `<p class="empty">As presenças desta reunião não foram registadas. Use «Editar» para as marcar.</p>`) +
    equipaDe(r).map((p) => { const v = r.presencas[p.mec]; return `<div class="pres-row"><span class="m">${esc(p.mec)}</span><span>${esc(p.nome)}</span><span class="st ${v || "N"}">${esc(EST_PRES[v] || "—")}</span></div>`; }).join("") +
    (r.convidados ? `<p><strong>Convidados:</strong> ${esc(r.convidados)}</p>` : "") + blocoFoto(r, "presencas");

  // Post-its
  $("board").innerHTML = COLS.map((c, ci) => {
    const l = ts.filter((t) => colIdx(t.coluna) === ci);
    return `<div class="col"><div class="col-h" style="border-bottom-color:${COL_CORES[ci]}"><span>${esc(c)}</span><span class="c">${l.length}</span></div><div class="col-b">${
      l.length ? l.map((t) => { const at = emAtraso(t, ref); return `<div class="card"><div class="t">${esc(t.tarefa)}</div><div class="meta">${t.responsavel ? `<span class="chip">${esc(t.responsavel)}</span>` : `<span class="chip none">sem responsável</span>`}${t.prazo ? `<span class="chip ${at ? "late" : t.coluna === "Concluído" ? "ok" : ""}">${at ? "Atrasada · " : "Até "}${esc(fmt(t.prazo))}</span>` : ""}</div>${botoesEstado(r, t)}</div>`; }).join("") : `<div class="empty">Sem post-its</div>`
    }</div></div>`;
  }).join("");
  $("fotoPostits").innerHTML = blocoFoto(r, "postits");

  // Folha de ações
  const ord = [...ts].sort((a, b) => colIdx(a.coluna) - colIdx(b.coluna));
  $("pAcoes").innerHTML = ord.length ? `<div class="scroll"><table><thead><tr><th class="num">N.º</th><th>O que fazer</th><th>Responsável</th><th>Prazo</th><th>Estado</th></tr></thead><tbody>${
    ord.map((t, i) => `<tr><td class="num">${i + 1}</td><td>${esc(t.tarefa)}</td><td>${esc(t.responsavel)}</td><td>${esc(fmt(t.prazo))}${emAtraso(t, ref) ? ' <span class="chip late">atraso</span>' : ""}</td><td>${botoesEstado(r, t)}</td></tr>`).join("")
  }</tbody></table></div>` : `<p class="empty">Sem tarefas registadas.</p>`;
  $("pAcoes").innerHTML += blocoFoto(r, "acoes");

  // Apontamentos
  $("pNotas").innerHTML = (r.notas ? `<p class="notes">${esc(r.notas)}</p>` : `<p class="empty">Sem apontamentos. Use «Editar» para os escrever.</p>`) + blocoFoto(r, "notas");
  document.querySelectorAll("details[data-foto]").forEach((d) => d.addEventListener("toggle", () => { if (d.open) carregarFoto(r.id, d.dataset.foto, d.querySelector(".fbox")); }, { once: true }));
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { est.tab = b.dataset.tab; desenharReuniao(); }));
$("btnVoltar3").addEventListener("click", () => mostrar("vPainel"));

function blocoFoto(r, k) {
  return temFotoDe(r, k) ? `<details data-foto="${k}" class="foto-orig"><summary>Ver a foto original ${k === "postits" ? "do" : "da"} ${esc(TIPOS_FOTO[k])}</summary><div class="fbox status">A carregar…</div></details>` : "";
}
async function carregarFoto(id, k, box) {
  if (!box) return;
  try {
    const d = await fb.D.get(fb.D.ref(fb.db, COL_FOTOS + "/" + id));
    const v = d.exists() ? d.val() : {};
    const img = String((k === "postits" ? v.postits || v.img : v[k]) || "");
    box.outerHTML = img.startsWith("data:image/") ? `<img class="photo" src="${esc(img)}" alt="Foto do quadro de post-its">` : `<p class="status">Foto não encontrada.</p>`;
  } catch { box.textContent = "Não consegui carregar a foto."; }
}

function esconderConfirm() { $("confirmBox").hidden = true; $("confirmBox").innerHTML = ""; }
$("btnApagar").addEventListener("click", () => {
  const r = reuniaoAberta(); if (!r) return;
  const box = $("confirmBox"); box.hidden = false;
  box.innerHTML = `<div class="confirm"><span>Apagar a reunião de <strong>${esc(fmt(r.data))}</strong> com presenças, post-its e apontamentos? Não dá para desfazer.</span><button class="btn small danger" id="cSim" type="button">Apagar</button><button class="btn small" id="cNao" type="button">Cancelar</button></div>`;
  $("cNao").onclick = esconderConfirm;
  $("cSim").onclick = async () => {
    try { await fb.D.remove(fb.D.ref(fb.db, COL_REUNIOES + "/" + r.id)); await fb.D.remove(fb.D.ref(fb.db, COL_FOTOS + "/" + r.id)).catch(() => {}); est.abertaId = null; mostrar("vPainel"); }
    catch { box.innerHTML = `<div class="confirm">Não consegui apagar. Verifique a ligação.</div>`; }
  };
});

/* ---------------- Imprimir ---------------- */
const CAB = (titulo) => `<div class="sh-head"><img src="icons/logo-matosinhos.png" alt="Câmara Municipal de Matosinhos"><div class="sh-title"><b>${titulo}</b><span>Subunidade Orgânica da Conservação — Secretaria</span></div><img src="icons/logo-kaizen.png" alt="Kaizen Institute"></div>`;
function abrirImprimir() {
  const r = reuniaoAberta(); if (!r) return;
  const ts = r.tarefas;
  const meta = `<div class="sh-meta"><span>Data: <b>${esc(fmt(r.data))}</b></span><span>Semana n.º: <b>${esc(r.semana ?? "")}</b></span></div>`;
  $("folhaPres").innerHTML = CAB("Reunião Kaizen — Presenças") + meta +
    `<table class="sh-table"><thead><tr><th class="c" style="width:22mm">N.º Mec.</th><th>Nome</th><th style="width:40mm">Presença</th></tr></thead><tbody>${
      equipaDe(r).map((p) => `<tr><td class="c">${esc(p.mec)}</td><td>${esc(p.nome)}</td><td>${esc(EST_PRES[r.presencas[p.mec]] || "")}</td></tr>`).join("")
    }<tr><td></td><td><b>Presentes</b></td><td><b>${contaPres(r)} de ${tamEq(r)}</b></td></tr></tbody></table>` +
    (r.convidados ? `<div class="sh-notes"><b>Convidados</b><div class="box" style="min-height:0">${esc(r.convidados)}</div></div>` : "") +
    `<div class="sh-notes"><b>Apontamentos da reunião</b><div class="box" style="min-height:90mm">${esc(r.notas || "")}</div></div>`;
  const ord = [...ts].sort((a, b) => colIdx(a.coluna) - colIdx(b.coluna));
  const hj = hoje();
  const linhas = ord.map((t, i) => `<tr><td class="c">${i + 1}</td><td>${esc(t.tarefa)}</td><td>${esc(t.responsavel)}</td><td>${esc(fmt(t.prazo))}${emAtraso(t, hj) ? ' <span class="sh-tag late">atraso</span>' : ""}</td><td><span class="sh-tag">${esc(t.coluna)}</span></td><td class="c"><span class="sh-box">${t.coluna === "Concluído" ? "X" : ""}</span></td></tr>`);
  for (let i = ord.length; i < Math.max(15, ord.length); i++) linhas.push(`<tr><td class="c">${i + 1}</td><td></td><td></td><td></td><td></td><td class="c"><span class="sh-box"></span></td></tr>`);
  $("folhaAcoes").innerHTML = CAB("Reunião Kaizen — Ações") + meta +
    `<table class="sh-table"><thead><tr><th class="c" style="width:9mm">N.º</th><th>O que fazer</th><th style="width:34mm">Responsável</th><th style="width:26mm">Prazo</th><th style="width:22mm">Estado</th><th class="c" style="width:13mm">Feito</th></tr></thead><tbody>${linhas.join("")}</tbody></table>`;
  $("folhaQuadro").innerHTML = CAB("Quadro Kaizen") + meta + `<div class="sh-board">${COLS.map((c, ci) => {
    const l = ts.filter((t) => colIdx(t.coluna) === ci);
    return `<div class="sh-col"><div class="sh-col-h"><b>${esc(c)}</b><span>${l.length}</span></div><div class="sh-col-b">${l.map((t) => `<div class="sh-post${emAtraso(t, hj) ? " late" : ""}"><b>${esc(t.tarefa)}</b>${t.responsavel ? `<small>${esc(t.responsavel)}</small>` : ""}${t.prazo ? `<small>Até ${esc(fmt(t.prazo))}</small>` : ""}</div>`).join("")}</div></div>`;
  }).join("")}</div><div class="sh-foot"><span>Em cada post-it: o quê · quem · até quando</span><span>Registado a partir da foto do quadro</span></div>`;
  mostrar("vImprimir");
}
function imprimir(tipo) {
  document.body.classList.remove("p-a4", "p-a3", "p-pres");
  document.body.classList.add("p-" + tipo);
  setTimeout(() => window.print(), 50);
}
window.addEventListener("afterprint", () => document.body.classList.remove("p-a4", "p-a3", "p-pres"));
$("btnImprimir").addEventListener("click", abrirImprimir);
$("btnVoltar2").addEventListener("click", () => mostrar("vReuniao"));
$("btnPrintPres").addEventListener("click", () => imprimir("pres"));
$("btnPrintA4").addEventListener("click", () => imprimir("a4"));
$("btnPrintA3").addEventListener("click", () => imprimir("a3"));

/* ---------------- Registar / editar ---------------- */
function abrirRegisto(r) {
  est.editId = r ? r.id : null;
  est.fotos = {};
  for (const id of ["presStatus", "acoesStatus", "notasStatus"]) { $(id).textContent = ""; $(id).className = "status"; }
  $("regTitle").textContent = r ? "Editar reunião" : "Registar reunião";
  $("fData").value = r ? r.data : hoje();
  $("fSemana").value = r ? r.semana ?? "" : semanaISO(hoje());
  $("fNotas").value = r ? r.notas || "" : "";
  $("fConvidados").value = r ? r.convidados || "" : "";
  est.pres = r ? { ...r.presencas } : {};
  est.eqForm = r ? equipaDe(r).map((p) => ({ mec: p.mec, nome: p.nome })) : EQUIPA.map((p) => ({ mec: p.mec, nome: p.nome }));
  est.linhas = r ? r.tarefas.map((t) => ({ ...t })) : [];
  $("shot").hidden = true; $("video").hidden = true;
  $("btnCamera").hidden = false; $("btnTirar").hidden = true; $("btnRepetir").hidden = true;
  $("readStatus").textContent = GROQ_API_KEY.startsWith("__") ? "A leitura automática ainda não está configurada (falta a chave do Groq). Pode escrever as tarefas à mão." : (r && temFotoDe(r, "postits") ? "Esta reunião já tem foto do quadro. Tire outra só se quiser substituir." : "");
  $("readStatus").className = "status";
  $("saveStatus").textContent = "";
  desenharPres();
  desenharLinhas();
  mostrar("vRegistar");
}
$("fab").addEventListener("click", () => abrirRegisto(null));
$("btnNovaTop").addEventListener("click", () => abrirRegisto(null));
$("btnEditar").addEventListener("click", () => { const r = reuniaoAberta(); if (r) abrirRegisto(r); });
$("btnVoltar").addEventListener("click", () => (est.editId ? abrirReuniao(est.editId) : mostrar("vPainel")));
$("fData").addEventListener("change", () => { if (!est.editId) $("fSemana").value = semanaISO($("fData").value); });

function desenharPres() {
  $("presEdit").innerHTML = est.eqForm.map((p) => `<div class="pres-row"><span class="m">${esc(p.mec)}</span><span>${esc(p.nome)}</span><span class="seg" role="group" aria-label="Presença de ${esc(p.nome)}">${
    Object.keys(EST_PRES).map((k) => `<button type="button" class="${k}" data-mec="${esc(p.mec)}" data-v="${k}" aria-pressed="${est.pres[p.mec] === k}">${k === "P" ? "Presente" : k === "F" ? "Falta" : "Just."}</button>`).join("")
  }</span></div>`).join("");
}
$("presEdit").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mec]"); if (!b) return;
  const m = b.dataset.mec, v = b.dataset.v;
  if (est.pres[m] === v) delete est.pres[m]; else est.pres[m] = v;
  desenharPres();
});
$("btnTodos").addEventListener("click", () => { est.eqForm.forEach((p) => { if (!est.pres[p.mec] || est.pres[p.mec] === "F") est.pres[p.mec] = "P"; }); desenharPres(); });

function desenharLinhas() {
  const box = $("rows");
  if (!est.linhas.length) { box.innerHTML = `<p class="empty">Sem tarefas ainda. Tire a foto ao quadro ou acrescente à mão.</p>`; return; }
  box.innerHTML = est.linhas.map((t, i) => `<div class="task" data-i="${i}">
    <select id="c${i}" aria-label="Coluna da tarefa ${i + 1}">${COLS.map((c) => `<option${c === t.coluna ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>
    <input class="tk" type="text" id="t${i}" aria-label="Tarefa ${i + 1}" placeholder="O que fazer" value="${esc(t.tarefa)}">
    <input type="text" id="r${i}" aria-label="Responsável da tarefa ${i + 1}" placeholder="Responsável" value="${esc(t.responsavel)}" list="nomesEquipa">
    <input type="date" id="p${i}" aria-label="Prazo da tarefa ${i + 1}" value="${isoData(t.prazo) ? t.prazo : ""}">
    <button class="btn small danger del" type="button" data-del="${i}" aria-label="Remover tarefa ${i + 1}">Remover</button></div>`).join("") +
    `<datalist id="nomesEquipa">${EQUIPA.map((p) => `<option value="${esc(p.nome.split(" ")[0])}"></option>`).join("")}</datalist>`;
}
function lerLinhas() {
  est.linhas = est.linhas.map((t, i) => ({ ...t, coluna: $("c" + i)?.value ?? t.coluna, tarefa: ($("t" + i)?.value ?? t.tarefa).trim(), responsavel: ($("r" + i)?.value ?? t.responsavel).trim(), prazo: $("p" + i)?.value ?? t.prazo }));
}
$("rows").addEventListener("click", (e) => { const b = e.target.closest("[data-del]"); if (b) { lerLinhas(); est.linhas.splice(+b.dataset.del, 1); desenharLinhas(); } });
$("btnAddRow").addEventListener("click", () => { lerLinhas(); est.linhas.push({ coluna: "A fazer", tarefa: "", responsavel: "", prazo: "" }); desenharLinhas(); $("t" + (est.linhas.length - 1))?.focus(); });

/* ---------------- Câmara ---------------- */
async function abrirCamera() {
  try {
    est.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
    const v = $("video"); v.srcObject = est.stream; v.hidden = false; $("shot").hidden = true;
    $("btnCamera").hidden = true; $("btnTirar").hidden = false; $("btnRepetir").hidden = true;
    $("readStatus").textContent = ""; $("readStatus").className = "status";
  } catch {
    $("readStatus").textContent = "Não consegui abrir a câmara. Autorize a câmara no browser, ou use «Escolher da galeria».";
    $("readStatus").className = "status err";
  }
}
function pararCamera() { if (est.stream) { est.stream.getTracks().forEach((t) => t.stop()); est.stream = null; } }
$("btnCamera").addEventListener("click", abrirCamera);
$("btnRepetir").addEventListener("click", abrirCamera);
$("btnTirar").addEventListener("click", () => {
  const v = $("video"); if (!v.videoWidth) return;
  const cv = document.createElement("canvas"); cv.width = v.videoWidth; cv.height = v.videoHeight;
  cv.getContext("2d").drawImage(v, 0, 0);
  pararCamera();
  cv.toBlob((b) => b && usarFoto(b), "image/jpeg", 0.92);
});
$("fGaleria").addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) usarFoto(f); e.target.value = ""; });

function reduzir(blob, max, q) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(blob);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv.toDataURL("image/jpeg", q)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("imagem")); };
    img.src = url;
  });
}
async function usarFoto(blob) {
  try {
    const grande = await reduzir(blob, 1600, 0.85);
    est.fotos.postits = await reduzir(blob, 1000, 0.6);
    const sh = $("shot"); sh.src = grande; sh.hidden = false; $("video").hidden = true;
    $("btnCamera").hidden = true; $("btnTirar").hidden = true; $("btnRepetir").hidden = false;
    lerPostits(grande);
  } catch { $("readStatus").textContent = "Não consegui abrir essa imagem. Tente outra."; $("readStatus").className = "status err"; }
}

/* ---------------- Leitura com o Groq ---------------- */
let modelosDisp = null;
async function escolherModelo() {
  if (!modelosDisp) {
    try { const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: "Bearer " + GROQ_API_KEY } }); const j = await r.json(); modelosDisp = new Set((j.data || []).map((m) => m.id)); }
    catch { modelosDisp = new Set(); }
  }
  return MODELOS_VISAO.find((m) => modelosDisp.has(m)) || MODELOS_VISAO[0];
}
function extrairJSON(txt) {
  const limpo = String(txt).replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "");
  const a = limpo.indexOf("{"), b = limpo.lastIndexOf("}");
  return JSON.parse(a >= 0 && b > a ? limpo.slice(a, b + 1) : limpo);
}
const semChave = () => !GROQ_API_KEY || GROQ_API_KEY.startsWith("__");
async function groqVisao(dataUrl, prompt) {
  const modelo = await escolherModelo();
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ_API_KEY },
    body: JSON.stringify({ model: modelo, temperature: 0.1, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }] })
  });
  if (!r.ok) throw new Error("groq " + r.status);
  const j = await r.json();
  return extrairJSON(j.choices?.[0]?.message?.content || "");
}
const erroGroq = (e, oQue) => String(e && e.message).includes("429") ? "Muitos pedidos seguidos à IA. Espere um minuto e tente outra vez." : `A leitura da ${oQue} falhou. Tente outra foto ou preencha à mão.`;
const REGRAS = `Não inventes: palavras ilegíveis ficam [?]. Corrige só erros de ortografia óbvios. Responde APENAS com JSON, sem texto à volta.`;
const normTarefa = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function juntarTarefas(novas) {
  lerLinhas();
  const atuais = est.linhas.filter((t) => t.tarefa);
  let juntas = 0;
  for (const n of novas) {
    const k = normTarefa(n.tarefa);
    const igual = atuais.find((t) => { const a = normTarefa(t.tarefa); return a && k && (a === k || a.includes(k) || k.includes(a)); });
    if (igual) { igual.responsavel ||= n.responsavel; igual.prazo ||= n.prazo; if (n.coluna === "Concluído") igual.coluna = "Concluído"; juntas++; }
    else atuais.push(n);
  }
  est.linhas = atuais; desenharLinhas();
  return juntas;
}
const prazoOk = (p) => (isoData(p) ? p : "");

async function lerPostits(dataUrl) {
  if (semChave()) return;
  const st = $("readStatus"); st.className = "status"; st.textContent = "A ler os post-its… (uns segundos)";
  const dataRef = $("fData").value || hoje();
  const prompt = `Transcreve um quadro Kaizen de post-its de uma equipa de secretaria de uma câmara municipal portuguesa.
O quadro tem 4 colunas: "A fazer", "Em curso", "Pendente", "Concluído". Cada post-it é uma tarefa, normalmente com: o quê, quem (responsável) e até quando (prazo).
Transcreve TODOS os post-its legíveis e indica a coluna onde cada um está colado.
A reunião foi a ${dataRef}. Converte prazos escritos à mão (ex.: "20/11", "sexta", "fim do mês") para AAAA-MM-DD a partir dessa data; sem prazo claro usa "".
${REGRAS}
Formato: {"tarefas":[{"coluna":"A fazer|Em curso|Pendente|Concluído","tarefa":"texto","responsavel":"nome ou vazio","prazo":"AAAA-MM-DD ou vazio"}]}`;
  try {
    const v = await groqVisao(dataUrl, prompt);
    const novos = (Array.isArray(v.tarefas) ? v.tarefas : []).filter((t) => t && t.tarefa).map((t) => ({ coluna: COLS.includes(t.coluna) ? t.coluna : "A fazer", tarefa: String(t.tarefa).trim(), responsavel: String(t.responsavel || "").trim(), prazo: prazoOk(t.prazo) }));
    const j = juntarTarefas(novos);
    st.textContent = novos.length ? `Li ${novos.length} post-its${j ? ` (${j} já estavam na lista e foram juntos)` : ""}. Confirme e corrija o que for preciso.` : "Não consegui ler post-its. Tire outra foto mais de frente e com mais luz, ou escreva à mão.";
    st.className = novos.length ? "status" : "status err";
  } catch (e) { st.className = "status err"; st.textContent = erroGroq(e, "foto do quadro"); }
}

/* Folhas em papel: presenças, ações e apontamentos */
async function lerFolha(tipo, file) {
  const stId = { presencas: "presStatus", acoes: "acoesStatus", notas: "notasStatus" }[tipo];
  const st = $(stId);
  if (semChave()) { st.textContent = "A leitura automática não está configurada."; st.className = "status err"; return; }
  let grande;
  try { grande = await reduzir(file, 1600, 0.85); est.fotos[tipo] = await reduzir(file, 1000, 0.6); }
  catch { st.textContent = "Não consegui abrir essa imagem."; st.className = "status err"; return; }
  st.className = "status"; st.textContent = `A ler a ${TIPOS_FOTO[tipo]}… (uns segundos)`;
  const dataRef = $("fData").value || hoje();
  try {
    if (tipo === "presencas") {
      const lista = est.eqForm.map((p) => `${p.mec} – ${p.nome}`).join("\n");
      const v = await groqVisao(grande, `Lê uma folha de presenças em papel de uma reunião Kaizen (câmara municipal portuguesa).
Equipa (N.º mecanográfico – nome):
${lista}
A reunião foi a ${dataRef} (formato AAAA-MM-DD; na folha aparece como ${fmtCurto(dataRef)} ou ${fmt(dataRef)}).
A folha pode ser (a) de uma só reunião, com coluna de assinatura ou presença, ou (b) um mapa semanal com uma coluna por data — nesse caso usa SÓ a coluna da data ${fmtCurto(dataRef)}.
Para cada pessoa da equipa: "P" se tem ✓, x, visto, rubrica ou assinatura; "F" se tem F ou falta; "J" se tem J ou justificada. Se a célula estiver vazia ou não conseguires ler, não incluas a pessoa.
Identifica as pessoas pelo número mecanográfico ou pelo nome. Pessoas escritas na folha que não estão na equipa vão para "convidados".
${REGRAS}
Formato: {"presencas":{"N.º mecanográfico":"P|F|J"},"convidados":"nomes separados por vírgula ou vazio"}`);
      const pres = v.presencas || {};
      let n = 0;
      for (const p of est.eqForm) { const x = String(pres[p.mec] || "").toUpperCase(); if (["P", "F", "J"].includes(x)) { est.pres[p.mec] = x; n++; } }
      if (v.convidados && !$("fConvidados").value.trim()) $("fConvidados").value = String(v.convidados).trim();
      desenharPres();
      st.textContent = n ? `Marquei ${n} de ${est.eqForm.length} pessoas a partir da folha. Confirme em cima.` : "Não consegui ler presenças nesta foto. Marque à mão.";
      st.className = n ? "status" : "status err";
    } else if (tipo === "acoes") {
      const v = await groqVisao(grande, `Lê uma folha em papel "Reunião Kaizen — Ações" preenchida à mão (câmara municipal portuguesa).
A tabela tem colunas: N.º, O que fazer, Responsável, Prazo e Feito (um quadrado que pode estar assinalado). No fundo pode haver uma caixa "Notas / assuntos para a próxima reunião".
Transcreve todas as linhas preenchidas. A reunião foi a ${dataRef}: converte prazos para AAAA-MM-DD a partir dessa data; sem prazo usa "". "feito" é true se o quadrado estiver assinalado.
${REGRAS}
Formato: {"tarefas":[{"tarefa":"texto","responsavel":"nome ou vazio","prazo":"AAAA-MM-DD ou vazio","feito":false}],"notas":"texto da caixa de notas ou vazio"}`);
      const novas = (Array.isArray(v.tarefas) ? v.tarefas : []).filter((t) => t && t.tarefa).map((t) => ({ coluna: t.feito ? "Concluído" : "A fazer", tarefa: String(t.tarefa).trim(), responsavel: String(t.responsavel || "").trim(), prazo: prazoOk(t.prazo) }));
      const j = juntarTarefas(novas);
      if (v.notas) juntarNotas(String(v.notas), "Notas da folha de ações");
      st.textContent = novas.length ? `Li ${novas.length} linhas${j ? ` (${j} já existiam e foram juntas)` : ""}${v.notas ? " e as notas" : ""}. Confirme na lista.` : "Não consegui ler linhas nesta folha. Preencha à mão.";
      st.className = novas.length ? "status" : "status err";
    } else {
      const v = await groqVisao(grande, `Transcreve os apontamentos manuscritos desta folha de uma reunião Kaizen (câmara municipal portuguesa), mantendo a ordem e as quebras de linha. Usa "- " no início de cada ponto quando forem tópicos.
${REGRAS}
Formato: {"texto":"transcrição"}`);
      const t = String(v.texto || "").trim();
      if (t) juntarNotas(t);
      st.textContent = t ? "Apontamentos transcritos para a caixa em cima. Reveja o texto." : "Não consegui ler texto nesta foto. Escreva à mão.";
      st.className = t ? "status" : "status err";
    }
  } catch (e) { st.className = "status err"; st.textContent = erroGroq(e, TIPOS_FOTO[tipo]); }
}
function juntarNotas(texto, titulo) {
  const cx = $("fNotas"), atual = cx.value.trim();
  const bloco = titulo ? `${titulo}:\n${texto}` : texto;
  cx.value = atual ? `${atual}\n\n${bloco}` : bloco;
}
for (const [id, tipo] of [["fPresFoto", "presencas"], ["fAcoesFoto", "acoes"], ["fNotasFoto", "notas"]]) {
  $(id).addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) lerFolha(tipo, f); e.target.value = ""; });
}

/* ---------------- Equipa (editável) ---------------- */
function desenharEquipa() {
  const lista = EQUIPA.map((p, i) => `<div class="eq-row" data-i="${i}">
    <input type="text" inputmode="numeric" id="eqM${i}" aria-label="N.º mecanográfico" value="${esc(p.mec)}">
    <input type="text" id="eqN${i}" aria-label="Nome" value="${esc(p.nome)}">
    <div class="eq-acts"><button class="btn small ghost" type="button" data-up="${i}" aria-label="Subir ${esc(p.nome)}"${i ? "" : " disabled"}>Subir</button><button class="btn small danger" type="button" data-rm="${i}" aria-label="Retirar ${esc(p.nome)} da equipa">Retirar</button></div></div>`).join("");
  $("eqLista").innerHTML = lista || `<p class="empty">Sem pessoas na equipa.</p>`;
}
function lerEquipaForm() {
  return EQUIPA.map((p, i) => ({ mec: ($("eqM" + i)?.value ?? p.mec).trim(), nome: ($("eqN" + i)?.value ?? p.nome).trim() }));
}
$("btnEquipa").addEventListener("click", () => { $("eqStatus").textContent = ""; desenharEquipa(); mostrar("vEquipa"); });
$("btnVoltarEq").addEventListener("click", () => mostrar("vPainel"));
$("eqLista").addEventListener("click", (e) => {
  const up = e.target.closest("[data-up]"), rm = e.target.closest("[data-rm]");
  if (!up && !rm) return;
  const l = lerEquipaForm();
  if (up) { const i = +up.dataset.up; [l[i - 1], l[i]] = [l[i], l[i - 1]]; }
  if (rm) l.splice(+rm.dataset.rm, 1);
  EQUIPA = l; desenharEquipa();
  $("eqStatus").textContent = "Alterações por guardar."; $("eqStatus").className = "status";
});
$("btnEqAdd").addEventListener("click", () => {
  const mec = $("eqNovoMec").value.trim(), nome = $("eqNovoNome").value.trim();
  if (!mec || !nome) { $("eqStatus").textContent = "Escreva o n.º mecanográfico e o nome."; $("eqStatus").className = "status err"; return; }
  EQUIPA = lerEquipaForm(); 
  if (EQUIPA.some((p) => p.mec === mec)) { $("eqStatus").textContent = "Já existe alguém com esse número."; $("eqStatus").className = "status err"; return; }
  EQUIPA.push({ mec, nome }); $("eqNovoMec").value = ""; $("eqNovoNome").value = "";
  desenharEquipa(); $("eqStatus").textContent = "Alterações por guardar."; $("eqStatus").className = "status";
});
$("btnEqGuardar").addEventListener("click", async () => {
  const l = lerEquipaForm();
  const st = $("eqStatus");
  if (l.some((p) => !p.mec || !p.nome)) { st.textContent = "Há linhas sem número ou sem nome."; st.className = "status err"; return; }
  if (new Set(l.map((p) => p.mec)).size !== l.length) { st.textContent = "Há números mecanográficos repetidos."; st.className = "status err"; return; }
  if (l.some((p) => !/^[A-Za-z0-9_-]{1,20}$/.test(p.mec))) { st.textContent = "O n.º mecanográfico só pode ter letras e números."; st.className = "status err"; return; }
  // Quem sai da equipa fica marcado como inativo (o histórico de presenças mantém-se)
  const novo = {};
  Object.entries(est.equipaBD || {}).forEach(([mec, p]) => { novo[mec] = { ...p, ativo: false }; });
  EQUIPA_INICIAL.forEach((p) => { if (!novo[p.mec]) novo[p.mec] = { nome: p.nome, ativo: false, ordem: 999 }; });
  l.forEach((p, i) => { novo[p.mec] = { nome: p.nome, ativo: true, ordem: i }; });
  try {
    st.textContent = "A guardar…"; st.className = "status";
    await fb.D.set(fb.D.ref(fb.db, COL_EQUIPA), novo);
    st.textContent = "Equipa guardada."; 
  } catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; }
});

/* ---------------- Exportar: Excel e relatório PDF ---------------- */
function reunioesDoPeriodo() {
  const per = $("fPeriodo").value;
  if (per === "tudo") return est.reunioes;
  if (per === "ano") return doAno();
  const d = new Date(), ini = per === "mes" ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const fim = per === "mesant" ? new Date(d.getFullYear(), d.getMonth(), 0) : new Date(2999, 0, 1);
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return est.reunioes.filter((r) => r.data >= iso(ini) && r.data <= iso(fim));
}
const nomePeriodo = () => $("fPeriodo").selectedOptions[0].textContent;
$("btnExportar").addEventListener("click", () => { $("expStatus").textContent = ""; $("fPeriodo").querySelector('[value="ano"]').textContent = `Ano ${est.ano || anoAtual()}`; mostrar("vRelatorio"); desenharRelatorio(); });
$("btnVoltarRel").addEventListener("click", () => mostrar("vPainel"));

/* ---------------- Trabalho diário: Edocs urgentes ---------------- */
const PRIO = { 1: "Muito urgente", 2: "Urgente", 3: "Normal" };
// Só aceitamos links do Edoc da Câmara (evita guardar endereços de outros sites).
const linkEdoc = (s) => { try { const u = new URL(String(s || "").trim()); return u.protocol === "https:" && u.hostname === "edoc.cm-matosinhos.pt" ? u.href : ""; } catch { return ""; } };
const linkDe = (u) => linkEdoc(u.link);
const prioDe = (u) => (u.prio >= 1 && u.prio <= 3 ? +u.prio : 2);
const SITUACOES = ["Por oficiar", "Ofício por assinar", "Aguarda execução", "Aguarda entidade externa", "Em análise técnica", "Outro"];
let urgFiltro = "";
const diasDesde = (iso) => { const d = new Date(iso); return isNaN(d) ? null : Math.max(0, Math.floor((Date.now() - d) / 864e5)); };
const quem = () => (est.user && (est.user.displayName || est.user.email)) || "";
const quando = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
function opcoesResp() {
  const sel = $("urgResp"), atual = sel.value;
  sel.innerHTML = `<option value="">— Sem responsável —</option>` + EQUIPA.map((p) => `<option>${esc(p.nome)}</option>`).join("");
  sel.value = atual;
  const por = $("urgPor"), porAtual = por.value;
  por.innerHTML = `<option value="">— Escolher —</option>` + EQUIPA.map((p) => `<option>${esc(p.nome)}</option>`).join("");
  let lembrado = ""; try { lembrado = localStorage.getItem("kz-urg-por") || ""; } catch {}
  const eu = EQUIPA.find((p) => quem() && (p.nome === quem() || (p.email && p.email === (est.user && est.user.email))));
  por.value = porAtual || lembrado || (eu ? eu.nome : "");
  if (!por.value) por.value = "";
  const ver = $("urgVerDe"), verAtual = ver.value || (() => { try { return localStorage.getItem("kz-urg-ver") || ""; } catch { return ""; } })();
  ver.innerHTML = `<option value="">Toda a equipa</option>` + EQUIPA.map((p) => `<option>${esc(p.nome)}</option>`).join("");
  ver.value = verAtual; if (ver.value !== verAtual) ver.value = "";
  if (!$("urgSit").options.length) $("urgSit").innerHTML = SITUACOES.map((s) => `<option>${esc(s)}</option>`).join("");
}
function itemUrg(u, feito) {
  const atraso = !feito && isoData(u.prazo) && u.prazo < hoje();
  const prazoHoje = !feito && u.prazo === hoje();
  const dsit = diasDesde(u.situacaoEm || u.criadoEm);
  const chips = [
    u.resp ? `<span class="chip">${esc(u.resp)}</span>` : "",
    isoData(u.prazo) ? `<span class="chip ${atraso ? "late" : prazoHoje ? "warn" : ""}">${atraso ? "Em atraso · " : prazoHoje ? "Hoje · " : "Prazo "}${esc(fmt(u.prazo))}</span>` : "",
    !feito && dsit !== null ? `<span class="chip ${dsit > 7 ? "late" : "none"}">${dsit === 0 ? "nesta situação desde hoje" : `há ${dsit} dia${dsit === 1 ? "" : "s"} nesta situação`}</span>` : "",
  ].join("");
  const sit = feito ? (u.situacao ? `<span class="chip">${esc(u.situacao)}</span>` : "")
    : `<select class="urg-sit" data-urg="sit" data-id="${esc(u.id)}" aria-label="Situação do ${esc(u.edoc)}">${SITUACOES.map((s) => `<option${s === (u.situacao || "Outro") ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>`;
  const meta = feito ? `Tratado por ${esc(u.tratadoPor || "")} a ${esc(quando(u.tratadoEm))} · adicionado por ${esc(u.criadoPor || "")} a ${esc(quando(u.criadoEm))}` : `Adicionado por ${esc(u.criadoPor || "")} a ${esc(quando(u.criadoEm))}`;
  const acts = feito
    ? `<button class="btn small ghost" type="button" data-urg="desfazer" data-id="${esc(u.id)}">Desfazer</button>`
    : `<button class="btn small ok" type="button" data-urg="tratado" data-id="${esc(u.id)}">Marcar como tratado</button>
       <button class="btn small ghost" type="button" data-urg="link" data-id="${esc(u.id)}">${linkDe(u) ? "Alterar link" : "Juntar link"}</button>
       <button class="btn small ghost danger" type="button" data-urg="apagar" data-id="${esc(u.id)}" aria-label="Apagar ${esc(u.edoc)}">Apagar</button>`;
  const p = prioDe(u);
  const prio = feito ? "" : `<select class="urg-prio p${p}" data-urg="prio" data-id="${esc(u.id)}" aria-label="Prioridade do ${esc(u.edoc)}">${[1, 2, 3].map((n) => `<option value="${n}"${n === p ? " selected" : ""}>${PRIO[n]}</option>`).join("")}</select>`;
  return `<div class="urg-item p${p}${atraso ? " late" : ""}${feito ? " done" : ""}">
    <div class="urg-main"><div class="urg-top">${linkDe(u) ? `<a class="urg-edoc urg-a" href="${esc(linkDe(u))}" target="_blank" rel="noopener" title="Abrir no Edoc">${esc(u.edoc)}</a>` : `<strong class="urg-edoc">${esc(u.edoc)}</strong>`}${prio}</div>${u.assunto ? `<span class="urg-assunto">${esc(u.assunto)}</span>` : ""}${u.nota ? `<span class="urg-nota">A fazer: ${esc(u.nota)}</span>` : ""}
      <div class="urg-chips">${sit}${chips}</div><span class="urg-meta">${meta}</span></div>
    <div class="urg-acts">${acts}</div></div>`;
}
function desenharUrgentes() {
  const verDe = $("urgVerDe").value;
  const meus = verDe ? est.urgentes.filter((u) => u.criadoPor === verDe) : est.urgentes;
  const abertos = meus.filter((u) => !u.tratado)
    .sort((a, b) => prioDe(a) - prioDe(b) || (a.prazo || "9999").localeCompare(b.prazo || "9999") || String(a.criadoEm).localeCompare(String(b.criadoEm)));
  const feitos = meus.filter((u) => u.tratado).sort((a, b) => String(b.tratadoEm).localeCompare(String(a.tratadoEm)));
  const cont = {}; abertos.forEach((u) => { const s = u.situacao || "Outro"; cont[s] = (cont[s] || 0) + 1; });
  if (urgFiltro && !cont[urgFiltro]) urgFiltro = "";
  $("urgFiltros").innerHTML = abertos.length ? [["", `Todos (${abertos.length})`], ...SITUACOES.filter((s) => cont[s]).map((s) => [s, `${s} (${cont[s]})`])]
    .map(([v, t]) => `<button type="button" class="fchip${v === urgFiltro ? " on" : ""}" data-filtro="${esc(v)}" aria-pressed="${v === urgFiltro}">${esc(t)}</button>`).join("") : "";
  const vis = urgFiltro ? abertos.filter((u) => (u.situacao || "Outro") === urgFiltro) : abertos;
  $("urgLista").innerHTML = vis.length ? vis.map((u) => itemUrg(u, false)).join("") : `<p class="empty">Sem Edocs urgentes por tratar.</p>`;
  $("urgFeitos").innerHTML = feitos.length ? feitos.slice(0, 100).map((u) => itemUrg(u, true)).join("") : `<p class="empty">Ainda nenhum tratado.</p>`;
  $("urgFeitosN").textContent = `(${feitos.length})`;
  $("urgVerRes").textContent = verDe ? `${verDe}: ${abertos.length} por tratar · ${feitos.length} já tratado${feitos.length === 1 ? "" : "s"}` : "";
  const todosAbertos = est.urgentes.filter((u) => !u.tratado);
  $("bdgUrg").hidden = !todosAbertos.length; $("bdgUrg").textContent = todosAbertos.length;
  $("bdgUrg").classList.toggle("late", todosAbertos.some((u) => prioDe(u) === 1 || (isoData(u.prazo) && u.prazo < hoje())));
}
$("btnDiario").addEventListener("click", () => { opcoesResp(); $("urgStatus").textContent = ""; desenharUrgentes(); mostrar("vDiario"); });
$("btnVoltarDia").addEventListener("click", () => mostrar("vPainel"));
$("urgForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const edoc = $("urgEdoc").value.trim().toUpperCase().replace(/\s+/g, "");
  const st = $("urgStatus");
  if (!edoc) { $("urgEdoc").focus(); return; }
  const lnk = $("urgLink").value.trim();
  if (!lnk) { st.textContent = "Cole o link da página do Edoc para poder adicionar."; st.className = "status err"; $("urgLink").focus(); return; }
  if (!linkEdoc(lnk)) { st.textContent = "O link tem de ser de uma página do Edoc (https://edoc.cm-matosinhos.pt/...)."; st.className = "status err"; $("urgLink").focus(); return; }
  if (!$("urgPor").value) { st.textContent = "Escolha quem está a adicionar o Edoc."; st.className = "status err"; $("urgPor").focus(); return; }
  if (est.urgentes.some((u) => !u.tratado && u.edoc === edoc)) { st.textContent = `O ${edoc} já está na lista de urgentes.`; st.className = "status err"; return; }
  $("btnUrgAdd").disabled = true;
  try {
    await fb.D.set(fb.D.push(fb.D.ref(fb.db, COL_URGENTES)), {
      edoc, assunto: $("urgAssunto").value.trim(), prio: +$("urgPrio").value || 2,
      nota: $("urgNota").value.trim(), resp: $("urgResp").value, prazo: $("urgPrazo").value || "",
      situacao: $("urgSit").value || "Outro", situacaoEm: new Date().toISOString(),
      link: linkEdoc($("urgLink").value),
      tratado: false, criadoPor: $("urgPor").value, criadoEm: new Date().toISOString(),
    });
    const porEsc = $("urgPor").value; try { localStorage.setItem("kz-urg-por", porEsc); } catch {}
    $("urgForm").reset(); $("urgSit").value = SITUACOES[0]; $("urgPrio").value = "2"; $("urgPor").value = porEsc; st.textContent = `${edoc} adicionado.`; st.className = "status"; $("urgEdoc").focus();
  } catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; }
  $("btnUrgAdd").disabled = false;
});
$("urgVerDe").addEventListener("change", () => {
  try { localStorage.setItem("kz-urg-ver", $("urgVerDe").value); } catch {}
  if ($("urgVerDe").value) $("urgFeitosBox").open = true;
  desenharUrgentes();
});
$("urgLista").addEventListener("submit", async (e) => {
  const f = e.target.closest(".urg-linkbox"); if (!f) return;
  e.preventDefault();
  const v = f.querySelector("input").value.trim(), st = $("urgStatus");
  if (!v) { st.textContent = "O link do Edoc é obrigatório."; st.className = "status err"; return; }
  if (!linkEdoc(v)) { st.textContent = "O link tem de ser de uma página do Edoc (https://edoc.cm-matosinhos.pt/...)."; st.className = "status err"; return; }
  try { await fb.D.update(fb.D.ref(fb.db, `${COL_URGENTES}/${f.dataset.id}`), { link: linkEdoc(v) }); st.textContent = "Link guardado."; st.className = "status"; }
  catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; }
});
$("urgLista").addEventListener("click", (e) => { if (e.target.closest("[data-cancel]")) e.target.closest(".urg-linkbox")?.remove(); });
$("urgFiltros").addEventListener("click", (e) => { const b = e.target.closest("[data-filtro]"); if (!b) return; urgFiltro = b.dataset.filtro; desenharUrgentes(); });
$("urgLista").addEventListener("change", async (e) => {
  const s = e.target.closest('[data-urg="sit"], [data-urg="prio"]'); if (!s) return;
  const dados = s.dataset.urg === "prio" ? { prio: +s.value } : { situacao: s.value, situacaoEm: new Date().toISOString(), situacaoPor: quem() };
  try { await fb.D.update(fb.D.ref(fb.db, `${COL_URGENTES}/${s.dataset.id}`), dados); }
  catch { $("urgStatus").textContent = "Não consegui guardar. Verifique a internet."; $("urgStatus").className = "status err"; }
});
$("vDiario").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-urg]"); if (!b) return;
  const id = b.dataset.id, acao = b.dataset.urg, ref = fb.D.ref(fb.db, `${COL_URGENTES}/${id}`);
  const st = $("urgStatus");
  if (acao === "link") {
    const item = b.closest(".urg-item"); if (!item || item.querySelector(".urg-linkbox")) return;
    const u = est.urgentes.find((x) => x.id === id) || {};
    item.querySelector(".urg-main").insertAdjacentHTML("beforeend", `<form class="urg-linkbox" data-id="${esc(id)}">
      <input type="url" aria-label="Link do Edoc" placeholder="https://edoc.cm-matosinhos.pt/..." value="${esc(u.link || "")}">
      <button class="btn small primary" type="submit">Guardar</button><button class="btn small ghost" type="button" data-cancel>Cancelar</button></form>`);
    item.querySelector(".urg-linkbox input").focus();
    return;
  }
  if (acao === "apagar" && b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Confirmar apagar"; setTimeout(() => { b.dataset.ok = ""; b.textContent = "Apagar"; }, 4000); return; }
  b.disabled = true;
  try {
    if (acao === "tratado") await fb.D.update(ref, { tratado: true, tratadoPor: euNome() || quem(), tratadoEm: new Date().toISOString() });
    else if (acao === "desfazer") await fb.D.update(ref, { tratado: false, tratadoPor: null, tratadoEm: null });
    else if (acao === "apagar") await fb.D.remove(ref);
  } catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; b.disabled = false; }
});

/* ---------------- Notificações (neste computador) ---------------- */
const NOTIF_KEY = "kz-notif";
let abrirPendente = new URLSearchParams(location.search).get("abrir") === "diario";
let notifPref = { assinar: false, muito: false, meu: false };
try { notifPref = { ...notifPref, ...JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}") }; } catch {}
let avisosVistos = null; // estado anterior de cada Edoc: "situação|tratado|prio"
const euNome = () => { try { return localStorage.getItem("kz-urg-por") || ""; } catch { return ""; } };
async function avisar(titulo, corpo, filtro, url) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body: corpo, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: `kz-${Date.now()}`, data: { filtro, url: url || "" } };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) { await reg.showNotification(titulo, opts); return; } } catch {}
  try { const n = new Notification(titulo, opts); n.onclick = () => { if (url) window.open(url, "_blank", "noopener"); else { window.focus(); abrirDiario(filtro); } n.close(); }; } catch {}
}
function verificarAvisos(lista) {
  const agora = {};
  lista.forEach((u) => { agora[u.id] = `${u.situacao || ""}|${u.tratado ? 1 : 0}|${prioDe(u)}`; });
  const porAssinar = lista.filter((u) => !u.tratado && u.situacao === "Ofício por assinar").length;
  try { if (navigator.setAppBadge) porAssinar ? navigator.setAppBadge(porAssinar) : navigator.clearAppBadge(); } catch {}
  if (avisosVistos === null) { avisosVistos = agora; return; } // primeira leitura: não avisar do que já existia
  const eu = euNome();
  lista.forEach((u) => {
    const antes = avisosVistos[u.id];
    if (u.tratado) {
      const tratadoAntes = antes && antes.split("|")[1] === "1";
      if (notifPref.meu && antes && !tratadoAntes && eu && u.criadoPor === eu && u.tratadoPor !== eu)
        avisar("Edoc tratado", `${u.edoc}${u.assunto ? " — " + u.assunto : ""}${u.tratadoPor ? " · por " + u.tratadoPor : ""}${linkDe(u) ? " · clique para abrir no Edoc" : ""}`, "", linkDe(u));
      return;
    }
    const [sitAntes] = (antes || "").split("|");
    const autor = antes ? (u.situacaoPor || "") : (u.criadoPor || "");
    if (eu && autor === eu) return;
    const desc = `${u.edoc}${u.assunto ? " — " + u.assunto : ""}`;
    if (notifPref.assinar && u.situacao === "Ofício por assinar" && sitAntes !== "Ofício por assinar")
      avisar("Novo ofício por assinar", `${desc}${prioDe(u) === 1 ? " · MUITO URGENTE" : ""}`, "Ofício por assinar");
    else if (notifPref.muito && !antes && prioDe(u) === 1)
      avisar("Edoc muito urgente", `${desc}${u.criadoPor ? " · adicionado por " + u.criadoPor : ""}`, "");
  });
  avisosVistos = agora;
}
function abrirDiario(filtro) {
  if (!est.user) return;
  opcoesResp(); if (typeof filtro === "string") urgFiltro = filtro; desenharUrgentes(); mostrar("vDiario");
}
function desenharNotif() {
  const sup = "Notification" in window;
  $("notifAssinar").checked = !!notifPref.assinar; $("notifMuito").checked = !!notifPref.muito; $("notifMeu").checked = !!notifPref.meu;
  const perm = sup ? Notification.permission : "denied";
  const ligado = (notifPref.assinar || notifPref.muito || notifPref.meu) && perm === "granted";
  $("notifEst").textContent = !sup ? "(este browser não suporta)" : perm === "denied" ? "(bloqueadas no browser)" : ligado ? "(ligadas)" : "(desligadas)";
  $("notifEst").className = "notif-est" + (ligado ? " on" : "");
}
async function mudarNotif() {
  notifPref = { assinar: $("notifAssinar").checked, muito: $("notifMuito").checked, meu: $("notifMeu").checked };
  const algum = notifPref.assinar || notifPref.muito || notifPref.meu;
  if (algum && "Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch {}
  }
  if ("Notification" in window && Notification.permission === "denied" && algum) {
    $("urgStatus").textContent = "As notificações estão bloqueadas: permita-as nas definições do site (cadeado ao lado do endereço)."; $("urgStatus").className = "status err";
  }
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(notifPref)); } catch {}
  desenharNotif();
}
["notifAssinar", "notifMuito", "notifMeu"].forEach((id) => $(id).addEventListener("change", mudarNotif));
$("btnNotifTeste").addEventListener("click", async () => {
  if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch {} }
  desenharNotif();
  if (!("Notification" in window) || Notification.permission !== "granted") { $("urgStatus").textContent = "Permita as notificações para este site para receber avisos."; $("urgStatus").className = "status err"; return; }
  avisar("Teste — Kaizen Secretaria", "Os avisos estão a funcionar neste computador.", "Ofício por assinar");
});
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data && e.data.abrir === "diario") abrirDiario(e.data.filtro); });
desenharNotif();

/* ---------------- Ferramentas: modelos de resposta e verificação de ofícios ---------------- */
const MODELOS = [
  ["Ponto de situação", `Exmo.(a) Senhor(a) [Nome do requerente],

Na sequência da exposição apresentada por V. Ex.ª em [data], registada com a referência [n.º do Edoc], relativa a [assunto] em [local], informamos que a situação se encontra em tratamento pelos serviços municipais competentes.

Neste momento, [descrever o passo em curso: ex.: aguarda a execução dos trabalhos / está em análise técnica], prevendo-se [próximo passo ou data prevista, se conhecida].

Logo que a intervenção esteja concluída, daremos conhecimento a V. Ex.ª.

Com os melhores cumprimentos,`],
  ["Serviço executado", `Exmo.(a) Senhor(a) [Nome do requerente],

Na sequência da exposição apresentada por V. Ex.ª em [data], registada com a referência [n.º do Edoc], informamos que a intervenção de [descrição dos trabalhos] em [local] foi concluída em [data de conclusão].

Agradecemos a colaboração de V. Ex.ª na identificação da situação.

Com os melhores cumprimentos,`],
  ["Depende de entidade externa", `Exmo.(a) Senhor(a) [Nome do requerente],

Na sequência da exposição apresentada por V. Ex.ª em [data], registada com a referência [n.º do Edoc], relativa a [assunto] em [local], informamos que a resolução da situação é da responsabilidade de [entidade: ex.: E-Redes / Indaqua / concessionário], a quem o Município solicitou a intervenção em [data do pedido].

O Município continuará a acompanhar o assunto junto dessa entidade.

Com os melhores cumprimentos,`],
  ["Insistência (já em tratamento)", `Exmo.(a) Senhor(a) [Nome do requerente],

Em resposta à comunicação de V. Ex.ª de [data], registada com a referência [n.º do Edoc], informamos que o assunto está a ser tratado no âmbito do processo [n.º do processo original], apresentado em [data do pedido original].

Ponto de situação: [descrever o estado atual e o próximo passo].

Com os melhores cumprimentos,`],
  ["Fora da competência municipal", `Exmo.(a) Senhor(a) [Nome do requerente],

Na sequência da exposição apresentada por V. Ex.ª em [data], registada com a referência [n.º do Edoc], informamos que a situação descrita em [local] respeita a [propriedade privada / entidade responsável], pelo que a sua resolução não compete ao Município de Matosinhos.

Sugerimos que o assunto seja apresentado a [entidade e contacto, se conhecido].

Com os melhores cumprimentos,`],
];
let modAtual = 0;
function desenharModelos() {
  $("modTabs").innerHTML = MODELOS.map(([t], i) => `<button type="button" class="fchip${i === modAtual ? " on" : ""}" data-mod="${i}" aria-pressed="${i === modAtual}">${esc(t)}</button>`).join("");
  $("modTexto").value = MODELOS[modAtual][1]; $("modStatus").textContent = "";
}
$("modTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-mod]"); if (!b) return; modAtual = +b.dataset.mod; desenharModelos(); });
$("btnModCopiar").addEventListener("click", async () => {
  const st = $("modStatus");
  try { await navigator.clipboard.writeText($("modTexto").value); st.textContent = "Texto copiado."; st.className = "status"; }
  catch { $("modTexto").select(); st.textContent = "Selecionei o texto: use Ctrl+C para copiar."; st.className = "status"; }
});
desenharModelos();

const VERIFICAR = [
  "Nome e morada ou e-mail do destinatário confirmados no 1.º registo do Edoc (não copiados de outro processo)",
  "Referência do Edoc e, se houver, do processo original indicadas no ofício",
  "O texto responde ao que o munícipe pediu, com o ponto de situação ou a solução",
  "Só os dados pessoais necessários; sem dados de terceiros no texto nem nos anexos (RGPD)",
  "Se a decisão for desfavorável: indicar a audiência prévia ou os meios e prazos para reagir (arts. 114.º e 121.º CPA)",
  "Ofício enviado para assinatura no próprio dia",
  "Depois do envio: comprovativo anexado no Edoc e nota com o destinatário certo",
];
let chk = {};
try { chk = JSON.parse(localStorage.getItem("kz-chk-oficio") || "{}"); } catch {}
function desenharChk() {
  $("chkLista").innerHTML = VERIFICAR.map((t, i) => `<label class="chk-i"><input type="checkbox" data-chk="${i}"${chk[i] ? " checked" : ""}><span>${esc(t)}</span></label>`).join("");
  const n = VERIFICAR.filter((_, i) => chk[i]).length;
  $("chkStatus").textContent = n === VERIFICAR.length ? "Tudo verificado — pode enviar." : `${n} de ${VERIFICAR.length} verificados`;
  $("chkStatus").className = n === VERIFICAR.length ? "status ok-t" : "status";
}
$("chkLista").addEventListener("change", (e) => { const c = e.target.closest("[data-chk]"); if (!c) return; chk[c.dataset.chk] = c.checked; try { localStorage.setItem("kz-chk-oficio", JSON.stringify(chk)); } catch {} desenharChk(); });
$("btnChkLimpar").addEventListener("click", () => { chk = {}; try { localStorage.removeItem("kz-chk-oficio"); } catch {} desenharChk(); });
desenharChk();

/* ---------------- Legislação: calculadora de prazos (art. 87.º CPA) ---------------- */
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function feriados(ano) {
  // Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(ano, mes - 1, dia, 12);
  const desl = (n) => { const x = new Date(pascoa); x.setDate(x.getDate() + n); return isoDe(x); };
  return new Set([`${ano}-01-01`, desl(-2), desl(0), `${ano}-04-25`, `${ano}-05-01`, desl(60), `${ano}-06-10`, `${ano}-08-15`,
    `${ano}-10-05`, `${ano}-11-01`, `${ano}-12-01`, `${ano}-12-08`, `${ano}-12-25`]);
}
const FER = {};
const eUtil = (d) => { const y = d.getFullYear(); FER[y] = FER[y] || feriados(y); return d.getDay() !== 0 && d.getDay() !== 6 && !FER[y].has(isoDe(d)); };
function calcularPrazo() {
  const ini = $("przIni").value, n = Math.min(365, Math.max(1, parseInt($("przN").value, 10) || 0)), tipo = $("przTipo").value;
  if (!isoData(ini) || !n) { $("przRes").textContent = ""; return; }
  const d = new Date(ini + "T12:00:00");
  if (tipo === "uteis") { let c = 0; while (c < n) { d.setDate(d.getDate() + 1); if (eUtil(d)) c++; } }
  else { d.setDate(d.getDate() + n); while (!eUtil(d)) d.setDate(d.getDate() + 1); }
  const fim = isoDe(d), dif = Math.round((new Date(fim + "T12:00:00") - new Date(hoje() + "T12:00:00")) / 864e5);
  const dias = d.toLocaleDateString("pt-PT", { weekday: "long" });
  $("przRes").innerHTML = `Termina a <strong>${esc(fmt(fim))}</strong> (${esc(dias)})` +
    (dif < 0 ? ` · <span class="late-t">já passou há ${-dif} dia${dif === -1 ? "" : "s"}</span>` : dif === 0 ? " · <strong>termina hoje</strong>" : ` · faltam ${dif} dia${dif === 1 ? "" : "s"}`);
}
["przIni", "przN", "przTipo"].forEach((id) => $(id).addEventListener("input", calcularPrazo));
$("przIni").value = hoje(); calcularPrazo();

/* ---------------- MESTRE: assistente (IA via Groq) ---------------- */
// Histórico guardado na base de dados por conta Google (kaizen_chat/<uid>): a app só lê e mostra o da própria conta.
const MODELOS_TEXTO = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "moonshotai/kimi-k2-instruct", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];
const CHAT_MAX_CONV = 40, CHAT_MAX_MSG = 60;
const COL_CHAT = "kaizen_chat";
let chatConvs = [], chatAtual = null, chatOcupado = false, chatSub = null, chatSubUid = "";
const chatRef = (id) => fb.D.ref(fb.db, `${COL_CHAT}/${est.user.uid}${id ? "/" + id : ""}`);
function chatLer() {
  // Subscreve só o histórico da conta com sessão iniciada (sincroniza entre computador e telemóvel).
  if (!est.user || chatSubUid === est.user.uid) return;
  if (chatSub) chatSub();
  chatSubUid = est.user.uid;
  chatSub = fb.D.onValue(chatRef(), (snap) => {
    const v = snap.val() || {};
    chatConvs = Object.entries(v).map(([id, c]) => ({ id, ...c, msgs: Array.isArray(c.msgs) ? c.msgs : Object.values(c.msgs || {}) }))
      .sort((a, b) => String(b.em).localeCompare(String(a.em)));
    if (chatOcupado) return; // não interromper a resposta que está a chegar
    if (chatAtual && !chatConvs.some((x) => x.id === chatAtual) && !chatAtual.startsWith("n")) chatAtual = chatConvs[0]?.id || null;
    if (!$("mestre").hidden) desenharChat();
  }, () => { $("chatStatus").textContent = "Não consegui ler o histórico."; $("chatStatus").className = "status err"; });
}
async function chatGravar(c) {
  if (!est.user || !c) return;
  try {
    await fb.D.set(chatRef(c.id), { titulo: c.titulo || "", em: c.em, msgs: c.msgs.slice(-CHAT_MAX_MSG) });
    const velhas = chatConvs.slice(CHAT_MAX_CONV);
    for (const v of velhas) await fb.D.remove(chatRef(v.id));
  } catch { $("chatStatus").textContent = "Não consegui guardar a conversa. Verifique a internet."; $("chatStatus").className = "status err"; }
}
function chatLimparUI() {
  if (chatSub) chatSub(); chatSub = null; chatSubUid = "";
  chatConvs = []; chatAtual = null;
  if ($("chatMsgs")) { $("chatMsgs").innerHTML = ""; $("chatHist").innerHTML = ""; $("chatTxt").value = ""; }
}
async function modeloTexto() {
  if (!modelosDisp) { try { await escolherModelo(); } catch {} }
  return MODELOS_TEXTO.find((m) => modelosDisp && modelosDisp.has(m)) || MODELOS_TEXTO[0];
}
function contextoTrabalho() {
  // Usa o texto da Legislação de apoio e dos modelos que estão na própria app (fonte única).
  const leg = [...document.querySelectorAll("#vDiario .leg-sec")].filter((d) => !d.querySelector("#przIni")).map((d) => d.innerText.replace(/\s+\n/g, "\n").trim()).join("\n\n");
  const mods = MODELOS.map(([t, x]) => `Modelo «${t}»:\n${x}`).join("\n\n");
  return `${leg}\n\nMODELOS DE RESPOSTA AO MUNÍCIPE USADOS PELA SECRETARIA:\n${mods}`;
}
function promptSistema() {
  return `Chamas-te MESTRE e és o assistente da Secretaria da Subunidade Orgânica da Conservação (Departamento de Conservação) da Câmara Municipal de Matosinhos.
Ajudas a equipa no trabalho administrativo: redigir e rever ofícios e respostas a munícipes, resumir textos, explicar prazos e passos do procedimento (CPA), proteção de dados (RGPD), pedidos de indemnização e documentos de empreitadas (CCP).
Regras:
- Escreve sempre em português de Portugal (norma europeia), em tom profissional e sóbrio. Nunca uses emojis.
- Sê claro e direto; usa listas curtas quando ajudar.
- Em ofícios usa fórmulas da administração pública portuguesa (Exmo.(a) Senhor(a), V. Ex.ª, Com os melhores cumprimentos) e deixa campos a preencher entre [ ].
- Nunca inventes artigos, prazos ou números de processo. Se não tiveres certeza, di-lo e recomenda confirmar no texto da lei ou com os serviços jurídicos.
- Usa os dados que o utilizador fornecer apenas para a tarefa pedida; não peças dados pessoais que não sejam necessários.
- A informação de referência abaixo é a que a Secretaria usa; dá-lhe prioridade (verificada a 23/11/2026).

INFORMAÇÃO DE REFERÊNCIA:
${contextoTrabalho()}`;
}
function fmtResposta(t) {
  const linhas = esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split("\n");
  let html = "", lista = false;
  for (const l of linhas) {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) { if (!lista) { html += "<ul>"; lista = true; } html += `<li>${m[1]}</li>`; continue; }
    if (lista) { html += "</ul>"; lista = false; }
    html += l.trim() ? `<p>${l.replace(/^#{1,4}\s*/, "")}</p>` : "";
  }
  return html + (lista ? "</ul>" : "");
}
const limparPensar = (t) => String(t || "").replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
function desenharChat() {
  const c = chatConvs.find((x) => x.id === chatAtual);
  const msgs = c ? c.msgs : [];
  $("chatMsgs").innerHTML = msgs.length ? msgs.map((m, i) => m.r === "user"
    ? `<div class="msg eu"><div class="bolha">${esc(m.t).replace(/\n/g, "<br>")}</div></div>`
    : `<div class="msg ia"><div class="bolha">${fmtResposta(limparPensar(m.t)) || '<p class="muted">A pensar…</p>'}</div>${m.t ? `<button class="btn small ghost" type="button" data-copiar="${i}">Copiar</button>` : ""}</div>`).join("")
    : `<div class="chat-vazio"><div class="mestre-fig" aria-hidden="true"><img src="icons/mestre-corpo-sem-mao.webp" alt="" width="121" height="200"><img class="mao" src="icons/mestre-mao.webp" alt="" width="121" height="200"></div><p><strong>Olá, sou o MESTRE. Como posso ajudar?</strong></p><p class="muted">Posso redigir ofícios, rever textos, explicar prazos do CPA ou o passo seguinte de um pedido de indemnização.</p></div>`;
  $("chatMsgs").scrollTop = $("chatMsgs").scrollHeight;
  $("chatHist").innerHTML = chatConvs.length ? chatConvs.map((x) => `<div class="hist-i${x.id === chatAtual ? " on" : ""}">
      <button type="button" class="hist-b" data-conv="${esc(x.id)}"><span>${esc(x.titulo || "Conversa")}</span><small>${esc(quando(x.em))}</small></button>
      <button type="button" class="hist-x" data-conv-rm="${esc(x.id)}" aria-label="Apagar conversa">Apagar</button></div>`).join("")
    : `<p class="empty small">Sem conversas guardadas.</p>`;
  $("chatSug").innerHTML = msgs.length ? "" : [
    ["Redigir ofício", "Redige um ofício de resposta ao munícipe a partir destas notas:\n"],
    ["Rever um texto", "Revê este texto, corrige o português e torna-o mais claro e profissional:\n"],
    ["Que prazo se aplica?", "Que prazo se aplica nesta situação e como se conta? Situação: "],
    ["Passo seguinte (indemnização)", "Num pedido de indemnização, qual é o passo seguinte e que ofício devo usar? Situação: "],
  ].map(([t, p]) => `<button type="button" class="fchip" data-sug="${esc(p)}">${esc(t)}</button>`).join("");
}
function abrirAssistente() {
  chatLer();
  if (!chatAtual || !chatConvs.some((x) => x.id === chatAtual)) chatAtual = chatConvs[0]?.id || null;
  $("chatStatus").textContent = semChave() ? "O MESTRE ainda não está configurado (falta a chave do Groq)." : "";
  $("chatStatus").className = semChave() ? "status err" : "status";
  desenharChat(); $("mestreOla").hidden = true; $("mestre").hidden = false; $("btnMestreAbrir").setAttribute("aria-expanded", "true"); $("btnMestreAbrir").classList.add("aberto"); setTimeout(() => $("chatTxt").focus(), 50);
}
async function enviarChat() {
  const txt = $("chatTxt").value.trim(), st = $("chatStatus");
  if (!txt || chatOcupado) return;
  if (semChave()) { st.textContent = "O MESTRE ainda não está configurado (falta a chave do Groq)."; st.className = "status err"; return; }
  let c = chatConvs.find((x) => x.id === chatAtual);
  if (!c) { c = { id: "n" + Date.now().toString(36), titulo: txt.slice(0, 60), em: new Date().toISOString(), msgs: [] }; chatConvs.unshift(c); chatAtual = c.id; }
  c.msgs.push({ r: "user", t: txt }); c.msgs.push({ r: "assistant", t: "" });
  c.em = new Date().toISOString(); chatConvs = [c, ...chatConvs.filter((x) => x.id !== c.id)];
  $("chatTxt").value = ""; chatOcupado = true; $("mestreHead").classList.add("pensando"); $("btnChatEnviar").disabled = true; st.textContent = "A responder…"; st.className = "status";
  desenharChat();
  const resp = c.msgs[c.msgs.length - 1];
  try {
    const hist = c.msgs.slice(0, -1).slice(-20).map((m) => ({ role: m.r, content: limparPensar(m.t) }));
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ_API_KEY },
      body: JSON.stringify({ model: await modeloTexto(), temperature: 0.3, stream: true, messages: [{ role: "system", content: promptSistema() }, ...hist] }),
    });
    if (!r.ok || !r.body) throw new Error("groq " + r.status);
    const leitor = r.body.getReader(), dec = new TextDecoder(); let buf = "", ultimo = 0;
    for (;;) {
      const { done, value } = await leitor.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const partes = buf.split("\n"); buf = partes.pop();
      for (const p of partes) {
        const s = p.trim(); if (!s.startsWith("data:")) continue;
        const d = s.slice(5).trim(); if (d === "[DONE]") continue;
        try { const j = JSON.parse(d); resp.t += j.choices?.[0]?.delta?.content || ""; } catch {}
      }
      if (Date.now() - ultimo > 120) { ultimo = Date.now(); desenharChat(); }
    }
    resp.t = limparPensar(resp.t) || "Não obtive resposta. Tente reformular a pergunta.";
    st.textContent = "";
  } catch (e) {
    resp.t = resp.t || "Não foi possível obter resposta (sem ligação ou limite do serviço atingido). Tente daqui a pouco.";
    st.textContent = String(e.message).includes("429") ? "Limite de pedidos do Groq atingido; aguarde um minuto." : "Erro ao contactar o MESTRE."; st.className = "status err";
  }
  c.msgs = c.msgs.slice(-CHAT_MAX_MSG);
  chatOcupado = false; $("mestreHead").classList.remove("pensando"); $("btnChatEnviar").disabled = false; await chatGravar(c); desenharChat(); $("chatTxt").focus();
}
function olaMestre() {
  try { if (sessionStorage.getItem("kz-mestre-ola")) return; sessionStorage.setItem("kz-mestre-ola", "1"); } catch {}
  setTimeout(() => {
    if ($("btnMestreAbrir").hidden || !$("mestre").hidden) return;
    $("mestreOla").hidden = false;
    setTimeout(() => { $("mestreOla").hidden = true; }, 7000);
  }, 2500);
}
$("mestreOla").addEventListener("click", () => { $("mestreOla").hidden = true; abrirAssistente(); });
function fecharMestre() { $("mestreOla").hidden = true; $("mestre").hidden = true; $("btnMestreAbrir").setAttribute("aria-expanded", "false"); $("btnMestreAbrir").classList.remove("aberto"); }
$("btnAssistente").addEventListener("click", () => ($("mestre").hidden ? abrirAssistente() : fecharMestre()));
$("btnMestreAbrir").addEventListener("click", () => ($("mestre").hidden ? abrirAssistente() : fecharMestre()));
$("btnMestreFechar").addEventListener("click", fecharMestre);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("mestre").hidden) fecharMestre(); });
$("btnMestreConversas").addEventListener("click", () => {
  const box = $("mestreHist"), abrir = box.hidden;
  box.hidden = !abrir; $("btnMestreConversas").setAttribute("aria-expanded", String(abrir));
});
$("btnChatNova").addEventListener("click", () => { chatAtual = null; $("mestreHist").hidden = true; $("chatStatus").textContent = ""; desenharChat(); $("chatTxt").focus(); });
$("chatForm").addEventListener("submit", (e) => { e.preventDefault(); enviarChat(); });
$("chatTxt").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviarChat(); } });
$("chatSug").addEventListener("click", (e) => { const b = e.target.closest("[data-sug]"); if (!b) return; $("chatTxt").value = b.dataset.sug; $("chatTxt").focus(); });
$("chatHist").addEventListener("click", (e) => {
  const rm = e.target.closest("[data-conv-rm]");
  if (rm) { const id = rm.dataset.convRm; chatConvs = chatConvs.filter((x) => x.id !== id); if (chatAtual === id) chatAtual = chatConvs[0]?.id || null; fb.D.remove(chatRef(id)).catch(() => {}); desenharChat(); return; }
  const b = e.target.closest("[data-conv]"); if (!b) return; chatAtual = b.dataset.conv; $("mestreHist").hidden = true; $("btnMestreConversas").setAttribute("aria-expanded", "false"); desenharChat();
});
$("btnChatApagarTudo").addEventListener("click", (e) => {
  const b = e.currentTarget;
  if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Confirmar apagar tudo"; setTimeout(() => { b.dataset.ok = ""; b.textContent = "Apagar histórico"; }, 4000); return; }
  chatConvs = []; chatAtual = null; fb.D.remove(chatRef()).catch(() => {}); b.dataset.ok = ""; b.textContent = "Apagar histórico"; desenharChat();
});
$("chatMsgs").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copiar]"); if (!b) return;
  const c = chatConvs.find((x) => x.id === chatAtual); const m = c && c.msgs[+b.dataset.copiar]; if (!m) return;
  try { await navigator.clipboard.writeText(limparPensar(m.t)); b.textContent = "Copiado"; setTimeout(() => (b.textContent = "Copiar"), 1500); } catch {}
});

/* ---------------- Mapas (Excel partilhados no SharePoint/OneDrive da Câmara) ---------------- */
// Os links ficam na base de dados (só visível com sessão iniciada), nunca no código, que é público.
const linkMapa = (s) => { try { const u = new URL(String(s || "").trim()); return u.protocol === "https:" && /^(cmmat|cmmat-my)\.sharepoint\.com$/.test(u.hostname) ? u.href : ""; } catch { return ""; } };
function origemMapa(l) {
  try {
    const u = new URL(l), p = u.pathname;
    const pes = p.match(/\/personal\/([a-z0-9_]+?)_cm-matosinhos_pt/i);
    if (pes) return "OneDrive de " + pes[1].split("_").map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(" ");
    const site = p.match(/\/s\/([^/]+)/); if (site) return "SharePoint · " + decodeURIComponent(site[1]);
  } catch {}
  return "SharePoint da Câmara";
}
function desenharMapas() {
  const fixos = (MAPAS || []).map((m, i) => ({ ...m, id: "", fixo: true, ordem: i }));
  const extra = [...est.mapas].sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999) || String(a.nome).localeCompare(String(b.nome), "pt"));
  const l = [...fixos, ...extra];
  $("mapasLista").innerHTML = l.length ? l.map((m) => `<div class="mapa">
      <div class="mapa-main"><strong>${esc(m.nome)}</strong>${m.desc ? `<span>${esc(m.desc)}</span>` : ""}<span class="muted small">${esc(origemMapa(m.link))}</span></div>
      <div class="mapa-acts">${linkMapa(m.link) ? `<a class="btn small primary" href="${esc(linkMapa(m.link))}" target="_blank" rel="noopener">Abrir</a>` : ""}
        ${m.fixo ? "" : `<button class="btn small ghost danger" type="button" data-mapa-rm="${esc(m.id)}" aria-label="Retirar ${esc(m.nome)}">Retirar</button>`}</div></div>`).join("")
    : `<p class="empty">Ainda não há mapas. Use «Adicionar mapa» para juntar os links dos Excel partilhados.</p>`;
  if (!l.length) $("mapasAddBox").open = true;
}
$("btnMapas").addEventListener("click", () => { $("mapasStatus").textContent = ""; desenharMapas(); mostrar("vMapas"); });
$("btnVoltarMapas").addEventListener("click", () => mostrar("vPainel"));
$("mapaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("mapasStatus"), nome = $("mapaNome").value.trim(), link = linkMapa($("mapaLink").value);
  if (!nome) { $("mapaNome").focus(); return; }
  if (!link) { st.textContent = "O link tem de ser de um ficheiro no SharePoint/OneDrive da Câmara (cmmat.sharepoint.com ou cmmat-my.sharepoint.com)."; st.className = "status err"; $("mapaLink").focus(); return; }
  try {
    await fb.D.set(fb.D.push(fb.D.ref(fb.db, COL_MAPAS)), { nome, desc: $("mapaDesc").value.trim(), link, ordem: (MAPAS || []).length + est.mapas.length, criadoPor: euNome() || quem(), criadoEm: new Date().toISOString() });
    $("mapaForm").reset(); st.textContent = `«${nome}» adicionado.`; st.className = "status"; $("mapaNome").focus();
  } catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; }
});
$("mapasLista").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-mapa-rm]"); if (!b) return;
  if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Confirmar retirar"; setTimeout(() => { b.dataset.ok = ""; b.textContent = "Retirar"; }, 4000); return; }
  try { await fb.D.remove(fb.D.ref(fb.db, `${COL_MAPAS}/${b.dataset.mapaRm}`)); }
  catch { $("mapasStatus").textContent = "Não consegui retirar. Verifique a internet."; $("mapasStatus").className = "status err"; }
});

/* ---------------- Reclamações (Power BI) ---------------- */
// O painel só é carregado quando se abre esta aba, para não pesar no arranque da app.
if (!POWERBI_URL) $("btnPowerBI").hidden = true;
$("pbiAbrir").href = POWERBI_URL || "#";
$("btnPowerBI").addEventListener("click", () => {
  const f = $("pbiFrame");
  if (!f.getAttribute("src")) f.src = POWERBI_URL;
  $("pbiStatus").hidden = navigator.onLine;
  mostrar("vPowerBI");
});
$("btnVoltarPbi").addEventListener("click", () => mostrar("vPainel"));
$("fPeriodo").addEventListener("change", desenharRelatorio);

function desenharRelatorio() {
  const rs = reunioesDoPeriodo(), ref = hoje();
  const todas = rs.flatMap((r) => r.tarefas.map((t) => ({ ...t, reuniao: r.data })));
  const ult = rs[0];
  const abertas = ult ? ult.tarefas.filter((t) => t.coluna !== "Concluído") : [];
  const comPres = rs.filter(marcada);
  const media = comPres.length ? Math.round((comPres.reduce((s, r) => s + contaPres(r), 0) / comPres.reduce((s, r) => s + tamEq(r), 0)) * 100) : null;
  const CAB = `<div class="sh-head"><img src="icons/logo-matosinhos.png" alt="Câmara Municipal de Matosinhos"><div class="sh-title"><b>Relatório Kaizen</b><span>Subunidade Orgânica da Conservação — Secretaria</span></div><img src="icons/logo-kaizen.png" alt="Kaizen Institute"></div>`;
  const kpi = (n, l) => `<div class="rk"><b>${n}</b><span>${l}</span></div>`;
  const ordRs = [...rs].reverse();
  $("folhaRel").innerHTML = CAB +
    `<div class="sh-meta"><span>Período: <b>${esc(nomePeriodo())}</b></span><span>Reuniões: <b>${rs.length}</b></span><span>Gerado a <b>${esc(fmt(ref))}</b></span></div>` +
    `<div class="rel-kpis">${kpi(rs.length, "Reuniões")}${kpi(media == null ? "–" : media + "%", "Presença média")}${kpi(todas.filter((t) => t.coluna === "Concluído").length, "Tarefas concluídas (registos)")}${kpi(abertas.length, "Por fechar na última reunião")}${kpi(abertas.filter((t) => emAtraso(t, ref)).length, "Em atraso")}</div>` +
    `<h3 class="rel-h">Reuniões</h3><table class="sh-table"><thead><tr><th>Data</th><th class="c">Semana</th><th class="c">Presentes</th>${COLS.map((c) => `<th class="c">${esc(c)}</th>`).join("")}</tr></thead><tbody>${
      rs.map((r) => `<tr><td>${esc(fmt(r.data))}</td><td class="c">${esc(r.semana ?? "")}</td><td class="c">${marcada(r) ? `${contaPres(r)}/${tamEq(r)}` : "—"}</td>${COLS.map((c, i) => `<td class="c">${r.tarefas.filter((t) => colIdx(t.coluna) === i).length}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="7">Sem reuniões neste período.</td></tr>`
    }</tbody></table>` +
    `<h3 class="rel-h">Tarefas por fechar${ult ? ` (reunião de ${esc(fmt(ult.data))})` : ""}</h3><table class="sh-table"><thead><tr><th>O que fazer</th><th>Responsável</th><th>Prazo</th><th>Estado</th></tr></thead><tbody>${
      abertas.map((t) => `<tr><td>${esc(t.tarefa)}</td><td>${esc(t.responsavel)}</td><td>${esc(fmt(t.prazo))}${emAtraso(t, ref) ? ' <span class="sh-tag late">atraso</span>' : ""}</td><td>${esc(t.coluna)}</td></tr>`).join("") || `<tr><td colspan="4">Nenhuma.</td></tr>`
    }</tbody></table>` +
    `<h3 class="rel-h">Presenças</h3><table class="sh-table rel-pres"><thead><tr><th>N.º</th><th>Nome</th>${ordRs.map((r) => `<th class="c">${esc(fmtCurto(r.data))}</th>`).join("")}<th class="c">Total</th></tr></thead><tbody>${
      equipaDoConjunto(rs).map((p) => `<tr><td>${esc(p.mec)}</td><td>${esc(p.nome)}${p.saiu ? " (saiu)" : ""}</td>${ordRs.map((r) => { const v = r.presencas[p.mec]; return `<td class="c">${esc(v || "")}</td>`; }).join("")}<td class="c"><b>${ordRs.filter((r) => r.presencas[p.mec] === "P").length}</b></td></tr>`).join("")
    }</tbody></table>`;
}
$("btnPdf").addEventListener("click", () => {
  document.body.classList.remove("p-a4", "p-a3", "p-pres"); document.body.classList.add("p-rel");
  setTimeout(() => window.print(), 50);
});
window.addEventListener("afterprint", () => document.body.classList.remove("p-rel"));

/* Excel: preenche o modelo-kaizen.xlsx (tabelas + painel com gráficos ligados) */
const xe = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const serial = (iso) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
const letra = (i) => String.fromCharCode(65 + i);
function celula(ref, v, s) {
  const st = s ? ` s="${s}"` : "";
  if (v === null || v === undefined || v === "") return `<c r="${ref}"${st}/>`;
  if (typeof v === "object") return isoData(v.d) ? `<c r="${ref}"${st}><v>${serial(v.d)}</v></c>` : `<c r="${ref}"${st}/>`;
  if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
  return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
}
function preencherFolha(xml, linhas) {
  // estilos de cada coluna tirados da linha de exemplo (linha 2) do modelo
  const ex = (xml.match(/<row r="2"[^>]*>([\s\S]*?)<\/row>/) || [])[1] || "";
  const estilos = {};
  ex.replace(/<c r="([A-Z]+)2"(?:[^>]*?s="(\d+)")?/g, (m, col, st) => { estilos[col] = st; return m; });
  const n = Math.max(1, linhas.length);
  const rows = (linhas.length ? linhas : [[]]).map((l, i) => `<row r="${i + 2}">${l.map((v, j) => celula(letra(j) + (i + 2), v, estilos[letra(j)])).join("")}</row>`).join("");
  return { xml: xml.replace(/<row r="2"[^>]*>[\s\S]*?<\/row>/, rows).replace(/<dimension ref="A1:([A-Z]+)\d+"\/>/, (m, c) => `<dimension ref="A1:${c}${n + 1}"/>`), n };
}
function porCelula(xml, ref, novo) {
  const r = ref.replace(/[A-Z]+/, "");
  const re = new RegExp(`<c r="${ref}"(?:[^>]*/>|[^>]*>[\\s\\S]*?</c>)`);
  if (re.test(xml)) return xml.replace(re, novo);
  return xml.replace(new RegExp(`(<row r="${r}"[^>]*>)`), `$1${novo}`);
}
async function exportarExcel() {
  const st = $("expStatus");
  if (!window.JSZip) { st.textContent = "Não consegui carregar o gerador de Excel. Verifique a internet."; st.className = "status err"; return; }
  st.className = "status"; st.textContent = "A preparar o Excel…";
  try {
    const zip = await JSZip.loadAsync(await (await fetch("modelo-kaizen.xlsx", { cache: "no-cache" })).arrayBuffer());
    const rs = [...reunioesDoPeriodo()].reverse(), ref = hoje();
    const ESTN = { P: "Presente", F: "Falta", J: "Justificada" };
    const folhas = {
      2: rs.map((r) => [{ d: r.data }, r.semana ?? "", marcada(r) ? contaPres(r) : "", tamEq(r), marcada(r) ? contaPres(r) / tamEq(r) : "", ...COLS.map((c, i) => r.tarefas.filter((t) => colIdx(t.coluna) === i).length), r.tarefas.filter((t) => emAtraso(t, ref)).length, r.notas || "", r.convidados || ""]),
      3: rs.flatMap((r) => r.tarefas.map((t) => [{ d: r.data }, t.tarefa, t.responsavel || "", { d: t.prazo }, t.coluna, emAtraso(t, ref) ? "Sim" : "Não"])),
      4: rs.flatMap((r) => equipaDe(r).filter((p) => r.presencas[p.mec]).map((p) => [{ d: r.data }, String(p.mec), p.nome, ESTN[r.presencas[p.mec]]]))
    };
    const tam = {};
    for (const [i, linhas] of Object.entries(folhas)) {
      const f = `xl/worksheets/sheet${i}.xml`;
      const { xml, n } = preencherFolha(await zip.file(f).async("string"), linhas);
      zip.file(f, xml); tam[i] = n;
      const tf = `xl/tables/table${i - 1}.xml`;
      let t = await zip.file(tf).async("string");
      t = t.replace(/ref="A1:([A-Z]+)\d+"/g, (m, c) => `ref="A1:${c}${n + 1}"`);
      zip.file(tf, t);
    }
    // Painel: responsáveis da última reunião e equipa
    const ult = rs[rs.length - 1];
    const resp = ult ? [...new Set(ult.tarefas.map((t) => (t.responsavel || "").trim()).filter(Boolean))].slice(0, 20) : [];
    const eq = equipaDoConjunto(rs).slice(0, 20);
    let pn = await zip.file("xl/worksheets/sheet1.xml").async("string");
    for (let k = 0; k < 20; k++) {
      pn = porCelula(pn, `A${20 + k}`, celula(`A${20 + k}`, resp[k] ?? ""));
      pn = porCelula(pn, `B${44 + k}`, celula(`B${44 + k}`, eq[k] ? String(eq[k].mec) : ""));
      pn = porCelula(pn, `A${44 + k}`, celula(`A${44 + k}`, eq[k] ? eq[k].nome : ""));
    }
    zip.file("xl/worksheets/sheet1.xml", pn);
    // Gráficos: acertar os intervalos ao número real de linhas
    const ajusta = async (f, de, para) => { let x = await zip.file(f).async("string"); x = x.split(de).join(para); zip.file(f, x); };
    await ajusta("xl/charts/chart2.xml", "$61<", `$${tam[2] + 1}<`);
    await ajusta("xl/charts/chart3.xml", "$61<", `$${tam[2] + 1}<`);
    await ajusta("xl/charts/chart4.xml", "$39<", `$${19 + Math.max(1, resp.length)}<`);
    await ajusta("xl/charts/chart5.xml", "$63<", `$${43 + Math.max(1, eq.length)}<`);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `Kaizen_Secretaria_${$("fPeriodo").value}_${hoje()}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    st.textContent = "Excel descarregado. Abra a folha «Painel» para ver os gráficos.";
  } catch (e) { st.textContent = "Não consegui gerar o Excel. Tente outra vez."; st.className = "status err"; }
}
$("btnExcel").addEventListener("click", exportarExcel);

/* ---------------- Guardar ---------------- */
$("btnGuardar").addEventListener("click", async () => {
  lerLinhas();
  const st = $("saveStatus"), btn = $("btnGuardar");
  const data = $("fData").value;
  if (!data) { st.textContent = "Indique a data da reunião."; st.className = "status err"; return; }
  btn.disabled = true; st.className = "status"; st.textContent = "A guardar…";
  try {
    const { D, db } = fb;
    const ref = est.editId ? D.ref(db, COL_REUNIOES + "/" + est.editId) : D.push(D.ref(db, COL_REUNIOES));
    const ant = est.reunioes.find((r) => r.id === est.editId);
    const agora = new Date().toISOString();
    await D.set(ref, {
      data, semana: $("fSemana").value ? Number($("fSemana").value) : null,
      presencas: est.pres, equipa: est.eqForm, convidados: $("fConvidados").value.trim(),
      tarefas: est.linhas.filter((t) => t.tarefa).map(({ _k, ...t }) => t), notas: $("fNotas").value.trim(),
      temFoto: !!est.fotos.postits || !!(ant && ant.temFoto),
      fotos: Object.fromEntries(Object.keys(TIPOS_FOTO).map((k) => [k, !!est.fotos[k] || !!(ant && temFotoDe(ant, k))])),
      criadoPor: ant?.criadoPor || est.user.email || "", criadoEm: ant?.criadoEm || agora,
      atualizadoPor: est.user.email || "", atualizadoEm: agora
    });
    const novasFotos = Object.fromEntries(Object.entries(est.fotos).filter(([, v]) => v));
    if (Object.keys(novasFotos).length) await D.update(D.ref(db, COL_FOTOS + "/" + ref.key), novasFotos);
    abrirReuniao(ref.key, "postits");
  } catch (e) {
    st.className = "status err";
    st.textContent = String(e.code || e.message).includes("permission") ? "Sem permissão para guardar. Confirme as regras da base de dados." : "Não consegui guardar. Verifique a internet e tente outra vez.";
  } finally { btn.disabled = false; }
});

iniciarFirebase().catch(() => { mostrar("vConfig"); });
