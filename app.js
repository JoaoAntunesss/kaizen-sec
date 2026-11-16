import { GROQ_API_KEY, FIREBASE_CONFIG, COL_REUNIOES, COL_FOTOS, EQUIPA } from "./config.js";

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

const est = { user: null, reunioes: [], abertaId: null, tab: "presencas", editId: null, fotos: {}, linhas: [], pres: {}, stream: null };
const TIPOS_FOTO = { postits: "quadro de post-its", presencas: "folha de presenças", acoes: "folha de ações", notas: "folha de apontamentos" };
const temFotoDe = (r, k) => !!((r.fotos && r.fotos[k]) || (k === "postits" && r.temFoto));
let fb = null;

/* ---------------- Vistas ---------------- */
const VISTAS = ["vLogin", "vConfig", "vPainel", "vReuniao", "vRegistar", "vImprimir"];
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
    if (!u) { mostrar("vLogin"); return; }
    if ($("vLogin").hidden === false || $("vConfig").hidden === false || VISTAS.every((v) => $(v).hidden)) mostrar("vPainel");
    subscrever();
  });
}
function msgErroLogin(e) {
  const c = (e && e.code) || "";
  if (c.includes("unauthorized-domain")) return "Este endereço ainda não está autorizado no Firebase (Authentication → Settings → Authorized domains).";
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
const contaPres = (r) => EQUIPA.filter((p) => r.presencas[p.mec] === "P").length;
const marcada = (r) => Object.keys(r.presencas || {}).length > 0;

function desenharPainel() {
  const ref = hoje();
  const ult = est.reunioes[0];
  const ts = ult ? ult.tarefas : [];
  $("tAbertas").textContent = ts.filter((t) => t.coluna !== "Concluído").length;
  $("tAtraso").textContent = ts.filter((t) => emAtraso(t, ref)).length;
  const comPres = est.reunioes.filter(marcada);
  $("tPresenca").textContent = comPres.length ? Math.round((comPres.reduce((s, r) => s + contaPres(r), 0) / (comPres.length * EQUIPA.length)) * 100) + "%" : "–";
  $("tReunioes").textContent = est.reunioes.length;

  // Tarefas por fechar da última reunião, com troca rápida de estado
  const abertas = ult ? ult.tarefas.filter((t) => t.coluna !== "Concluído").sort((a, b) => (emAtraso(b, ref) - emAtraso(a, ref)) || String(a.prazo || "9").localeCompare(String(b.prazo || "9"))) : [];
  $("tarefasSub").textContent = ult ? `da reunião de ${fmt(ult.data)}` : "";
  $("tarefasLista").innerHTML = abertas.length ? abertas.map((t) => `<div class="tarefa-row"><div class="tr-main"><b>${esc(t.tarefa)}</b><div class="meta">${t.responsavel ? `<span class="chip">${esc(t.responsavel)}</span>` : ""}${t.prazo ? `<span class="chip ${emAtraso(t, ref) ? "late" : ""}">${emAtraso(t, ref) ? "Atrasada · " : "Até "}${esc(fmt(t.prazo))}</span>` : ""}</div></div>${botoesEstado(ult, t)}</div>`).join("") : `<p class="empty">${ult ? "Tudo concluído." : "Sem tarefas ainda."}</p>`;

  $("meetList").innerHTML = est.reunioes.length ? est.reunioes.map((r) => {
    const t = r.tarefas, ab = t.filter((x) => x.coluna !== "Concluído").length, at = t.filter((x) => emAtraso(x, ref)).length;
    return `<button class="meet" type="button" data-id="${esc(r.id)}">
      <div><div class="d">${esc(fmt(r.data))}</div><div class="w">${r.semana ? "Semana " + esc(r.semana) : ""}</div></div>
      <div class="info">${marcada(r) ? `<span class="chip ok">${contaPres(r)}/${EQUIPA.length} presentes</span>` : ""}<span class="chip">${t.length} post-its</span>${ab ? `<span class="chip">${ab} por fechar</span>` : ""}${at ? `<span class="chip late">${at} em atraso</span>` : ""}${r.notas ? `<span class="chip">apontamentos</span>` : ""}${Object.keys(TIPOS_FOTO).some((k) => temFotoDe(r, k)) ? `<span class="chip">fotos</span>` : ""}</div>
      <span class="go" aria-hidden="true">Abrir →</span></button>`;
  }).join("") : `<p class="empty">Ainda não há reuniões. Depois da reunião, carregue em «Registar reunião».</p>`;

  // Mapa de presenças (como a folha em papel, com a coluna Total)
  const rs = [...est.reunioes].filter(marcada).reverse().slice(-12);
  $("mapaSub").textContent = rs.length ? `últimas ${rs.length} reuniões` : "";
  $("mapa").innerHTML = rs.length ? `<table class="mapa"><thead><tr><th>N.º Mec.</th><th>Nome</th>${rs.map((r) => `<th class="c">${esc(fmtCurto(r.data))}</th>`).join("")}<th class="c">Total</th></tr></thead><tbody>${
    EQUIPA.map((p) => `<tr><td class="num">${esc(p.mec)}</td><td>${esc(p.nome)}</td>${rs.map((r) => { const v = r.presencas[p.mec]; return `<td class="c"><span class="mk ${v || ""}" title="${esc(EST_PRES[v] || "sem registo")}">${v === "P" ? "✓" : v || "·"}</span></td>`; }).join("")}<td class="c"><b>${rs.filter((r) => r.presencas[p.mec] === "P").length}</b></td></tr>`).join("")
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
  const rs = [...est.reunioes].reverse().slice(-12);
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
    data: { labels: rp.map((r) => fmtCurto(r.data)), datasets: [{ label: "Presença", data: rp.map((r) => Math.round((contaPres(r) / EQUIPA.length) * 100)), backgroundColor: cores[1], borderRadius: 4, borderSkipped: "start", maxBarThickness: 36 }] },
    options: baseOpcoes({ plugins: { ...baseOpcoes().plugins, tooltip: { ...baseOpcoes().plugins.tooltip, callbacks: { label: (c) => ` ${c.parsed.y}% (${contaPres(rp[c.dataIndex])} de ${EQUIPA.length})` } } }, scales: { ...baseOpcoes().scales, y: { ...baseOpcoes().scales.y, max: 100, ticks: { ...baseOpcoes().scales.y.ticks, callback: (v) => v + "%" } } } })
  });
  $("tbPresReu").innerHTML = tabelaHTML(["Reunião", "Presentes", "%"], rp.map((r) => [fmt(r.data), `${contaPres(r)} de ${EQUIPA.length}`, Math.round((contaPres(r) / EQUIPA.length) * 100) + "%"]));

  // 3. Tarefas por responsável (última reunião, empilhado por estado)
  const ult = est.reunioes[0];
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
  const tot = est.reunioes.filter(marcada);
  const pct = EQUIPA.map((p) => tot.length ? Math.round((tot.filter((r) => r.presencas[p.mec] === "P").length / tot.length) * 100) : 0);
  desenharGrafico("chPresPes", {
    type: "bar",
    data: { labels: EQUIPA.map((p) => p.nome), datasets: [{ label: "Assiduidade", data: pct, backgroundColor: cores[3], borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 }] },
    options: baseOpcoes({ indexAxis: "y", plugins: { ...baseOpcoes().plugins, tooltip: { ...baseOpcoes().plugins.tooltip, callbacks: { label: (c) => ` ${c.parsed.x}% (${tot.filter((r) => r.presencas[EQUIPA[c.dataIndex].mec] === "P").length} de ${tot.length} reuniões)` } } }, scales: { x: { ...baseOpcoes().scales.y, max: 100, ticks: { ...baseOpcoes().scales.y.ticks, callback: (v) => v + "%" } }, y: { ...baseOpcoes().scales.x } } })
  });
  $("tbPresPes").innerHTML = tabelaHTML(["Pessoa", "Presenças", "%"], EQUIPA.map((p, i) => [p.nome, `${tot.filter((r) => r.presencas[p.mec] === "P").length} de ${tot.length}`, pct[i] + "%"]));
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
  $("pPresencas").innerHTML = (marcada(r) ? `<p class="muted">${contaPres(r)} de ${EQUIPA.length} presentes.</p>` : `<p class="empty">As presenças desta reunião não foram registadas. Use «Editar» para as marcar.</p>`) +
    EQUIPA.map((p) => { const v = r.presencas[p.mec]; return `<div class="pres-row"><span class="m">${esc(p.mec)}</span><span>${esc(p.nome)}</span><span class="st ${v || "N"}">${esc(EST_PRES[v] || "—")}</span></div>`; }).join("") +
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
      EQUIPA.map((p) => `<tr><td class="c">${esc(p.mec)}</td><td>${esc(p.nome)}</td><td>${esc(EST_PRES[r.presencas[p.mec]] || "")}</td></tr>`).join("")
    }<tr><td></td><td><b>Presentes</b></td><td><b>${contaPres(r)} de ${EQUIPA.length}</b></td></tr></tbody></table>` +
    (r.convidados ? `<div class="sh-notes"><b>Convidados</b><div class="box" style="min-height:0">${esc(r.convidados)}</div></div>` : "") +
    `<div class="sh-notes"><b>Apontamentos da reunião</b><div class="box" style="min-height:90mm">${esc(r.notas || "")}</div></div>`;
  const ord = [...ts].sort((a, b) => colIdx(a.coluna) - colIdx(b.coluna));
  const hj = hoje();
  const linhas = ord.map((t, i) => `<tr><td class="c">${i + 1}</td><td>${esc(t.tarefa)}</td><td>${esc(t.responsavel)}</td><td>${esc(fmt(t.prazo))}${emAtraso(t, hj) ? ' <span class="sh-tag late">atraso</span>' : ""}</td><td><span class="sh-tag">${esc(t.coluna)}</span></td><td class="c"><span class="sh-box">${t.coluna === "Concluído" ? "✓" : ""}</span></td></tr>`);
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
  $("presEdit").innerHTML = EQUIPA.map((p) => `<div class="pres-row"><span class="m">${esc(p.mec)}</span><span>${esc(p.nome)}</span><span class="seg" role="group" aria-label="Presença de ${esc(p.nome)}">${
    Object.keys(EST_PRES).map((k) => `<button type="button" class="${k}" data-mec="${esc(p.mec)}" data-v="${k}" aria-pressed="${est.pres[p.mec] === k}">${k === "P" ? "Presente" : k === "F" ? "Falta" : "Just."}</button>`).join("")
  }</span></div>`).join("");
}
$("presEdit").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mec]"); if (!b) return;
  const m = b.dataset.mec, v = b.dataset.v;
  if (est.pres[m] === v) delete est.pres[m]; else est.pres[m] = v;
  desenharPres();
});
$("btnTodos").addEventListener("click", () => { EQUIPA.forEach((p) => { if (!est.pres[p.mec] || est.pres[p.mec] === "F") est.pres[p.mec] = "P"; }); desenharPres(); });

function desenharLinhas() {
  const box = $("rows");
  if (!est.linhas.length) { box.innerHTML = `<p class="empty">Sem tarefas ainda. Tire a foto ao quadro ou acrescente à mão.</p>`; return; }
  box.innerHTML = est.linhas.map((t, i) => `<div class="task" data-i="${i}">
    <select id="c${i}" aria-label="Coluna da tarefa ${i + 1}">${COLS.map((c) => `<option${c === t.coluna ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>
    <input class="tk" type="text" id="t${i}" aria-label="Tarefa ${i + 1}" placeholder="O que fazer" value="${esc(t.tarefa)}">
    <input type="text" id="r${i}" aria-label="Responsável da tarefa ${i + 1}" placeholder="Responsável" value="${esc(t.responsavel)}" list="nomesEquipa">
    <input type="date" id="p${i}" aria-label="Prazo da tarefa ${i + 1}" value="${isoData(t.prazo) ? t.prazo : ""}">
    <button class="btn small danger del" type="button" data-del="${i}" aria-label="Remover tarefa ${i + 1}">✕</button></div>`).join("") +
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
      const lista = EQUIPA.map((p) => `${p.mec} – ${p.nome}`).join("\n");
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
      for (const p of EQUIPA) { const x = String(pres[p.mec] || "").toUpperCase(); if (["P", "F", "J"].includes(x)) { est.pres[p.mec] = x; n++; } }
      if (v.convidados && !$("fConvidados").value.trim()) $("fConvidados").value = String(v.convidados).trim();
      desenharPres();
      st.textContent = n ? `Marquei ${n} de ${EQUIPA.length} pessoas a partir da folha. Confirme em cima.` : "Não consegui ler presenças nesta foto. Marque à mão.";
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
      presencas: est.pres, convidados: $("fConvidados").value.trim(),
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
