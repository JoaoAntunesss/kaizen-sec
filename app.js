import { GROQ_API_KEY, FIREBASE_CONFIG, COL_REUNIOES, COL_FOTOS, EQUIPA as EQUIPA_INICIAL, POWERBI_URL, MAPAS } from "./config.js";
import { MODELOS_OFICIO, modelosRelevantes } from "./modelos-oficio.js";
import { CONTACTOS_BASE } from "./contactos-base.js";
import { MANUAL_BASE, AREAS_MANUAL, procedimentosRelevantes } from "./manual-base.js";
import { lerValor, valorCompleto, fmtEuros, eurosPorExtenso } from "./extenso.js";
const COL_EQUIPA = "kaizen_equipa";
const COL_URGENTES = "kaizen_urgentes";
const COL_MAPAS = "kaizen_mapas";
const COL_REGRAS = "kaizen_regras";
const COL_CONTACTOS = "kaizen_contactos";
const COL_RECADOS = "kaizen_recados";
const COL_HORARIO = "kaizen_horario";
const COL_MANUAL = "kaizen_manual";
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
const VISTAS = ["vLogin", "vConfig", "vPainel", "vReuniao", "vRegistar", "vImprimir", "vEquipa", "vRelatorio", "vPowerBI", "vDiario", "vMapas", "vOficios", "vRegras", "vManual", "vContactos", "vHorario"];
function mostrar(v) {
  for (const id of VISTAS) $(id).hidden = id !== v;
  $("fab").hidden = v !== "vPainel";
  $("btnNovaTop").hidden = v !== "vPainel";
  $("btnSair").hidden = !est.user;
  $("mainNav").hidden = !est.user || v === "vLogin" || v === "vConfig";
  const sec = { vEquipa: "vPainel", vRelatorio: "vPainel", vReuniao: "vPainel", vRegistar: "vPainel", vImprimir: "vPainel" }[v] || v;
  document.querySelectorAll("#mainNav .nav-b").forEach((b) => b.classList.toggle("on", b.dataset.v === sec));
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
    if ($("vLogin").hidden === false || $("vConfig").hidden === false || VISTAS.every((v) => $(v).hidden)) abrirDiario();
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
  const lerLista = (col, chave, depois) => D.onValue(D.ref(db, col), (snap) => {
    est[chave] = Object.entries(snap.val() || {}).map(([id, r]) => ({ id, ...r })).filter((r) => r && typeof r === "object");
    depois();
  }, () => {});
  lerLista(COL_CONTACTOS, "contactos", () => desenharContactos());
  lerLista(COL_RECADOS, "recados", () => desenharEquipaHoje());
  lerLista(COL_MANUAL, "manualBD", () => desenharManual());
  D.onValue(D.ref(db, COL_HORARIO), (snap) => { const v = snap.val() || {}; est.horario = { equipas: v.equipas || {}, dias: v.dias || {} }; desenharHorario(); desenharEquipaHoje(); }, () => {});
  D.onValue(D.ref(db, COL_REGRAS), (snap) => {
    const v = snap.val() || {};
    est.regras = Object.entries(v).map(([id, r]) => ({ id, ...r })).filter((r) => r && r.texto);
    desenharRegras();
  }, () => { $("regrasStatus").textContent = "Não consegui ler as regras."; $("regrasStatus").className = "status err"; });
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
const DEVOLVIDO = "Devolvido para correção";
// quem assina os ofícios (destaque do botão «Devolver» no computador dela)
const QUEM_ASSINA = (EQUIPA_INICIAL[0] && EQUIPA_INICIAL[0].nome) || "";
const SITUACOES = ["Por oficiar", "Ofício por assinar", DEVOLVIDO, "Aguarda execução", "Aguarda entidade externa", "Em análise técnica", "Outro"];
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
est.recados = est.recados || []; est.contactos = est.contactos || [];
function itemUrg(u, feito) {
  const atraso = !feito && isoData(u.prazo) && u.prazo < hoje();
  const prazoHoje = !feito && u.prazo === hoje();
  const dsit = diasDesde(u.situacaoEm || u.criadoEm);
  const chips = [
    u.resp ? `<span class="chip">${esc(u.resp)}</span>` : "",
    isoData(u.prazo) ? `<span class="chip ${atraso ? "late" : prazoHoje ? "warn" : ""}">${atraso ? "Em atraso · " : prazoHoje ? "Hoje · " : "Prazo "}${esc(fmt(u.prazo))}</span>` : "",
    !feito && u.situacao === DEVOLVIDO && u.devolucao ? `<span class="chip late urg-dev">Devolvido por ${esc(u.devolucao.por || "")} a ${esc(quando(u.devolucao.em))}${u.devolucao.motivo ? ` · ${esc(u.devolucao.motivo)}` : ""}</span>` : "",
    !feito && u.devolucoes ? `<span class="chip none">${u.devolucoes} devoluç${u.devolucoes === 1 ? "ão" : "ões"}</span>` : "",
    !feito && dsit !== null ? `<span class="chip ${dsit > 7 ? "late" : "none"}">${dsit === 0 ? "nesta situação desde hoje" : `há ${dsit} dia${dsit === 1 ? "" : "s"} nesta situação`}</span>` : "",
  ].join("");
  const sit = feito ? (u.situacao ? `<span class="chip">${esc(u.situacao)}</span>` : "")
    : `<select class="urg-sit" data-urg="sit" data-id="${esc(u.id)}" aria-label="Situação do ${esc(u.edoc)}">${SITUACOES.map((s) => `<option${s === (u.situacao || "Outro") ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>`;
  const meta = feito ? `Tratado por ${esc(u.tratadoPor || "")} a ${esc(quando(u.tratadoEm))} · adicionado por ${esc(u.criadoPor || "")} a ${esc(quando(u.criadoEm))}` : `Adicionado por ${esc(u.criadoPor || "")} a ${esc(quando(u.criadoEm))}`;
  const acts = feito
    ? `<button class="btn small ghost" type="button" data-urg="desfazer" data-id="${esc(u.id)}">Desfazer</button>`
    : `${u.situacao === "Ofício por assinar" ? `<button class="btn small ${euNome() === QUEM_ASSINA ? "primary" : "ghost"}" type="button" data-urg="devolver" data-id="${esc(u.id)}">Devolver para corrigir</button>` : ""}
       ${u.situacao === DEVOLVIDO ? `<button class="btn small primary" type="button" data-urg="reenviar" data-id="${esc(u.id)}">Reenviar para assinatura</button>` : ""}
       <button class="btn small ok" type="button" data-urg="tratado" data-id="${esc(u.id)}">Marcar como tratado</button>
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
  const semana = new Date(Date.now() - 7 * 864e5).toISOString();
  const nAtraso = abertos.filter((u) => isoData(u.prazo) && u.prazo < hoje()).length;
  const tiles = [
    ["", "Por tratar", abertos.length, ""],
    ["", "Muito urgentes", abertos.filter((u) => prioDe(u) === 1).length, "t-late"],
    ["", "Em atraso", nAtraso, nAtraso ? "t-late" : ""],
    ["Ofício por assinar", "Por assinar", cont["Ofício por assinar"] || 0, "t-sign"],
    ["", "Tratados em 7 dias", feitos.filter((u) => String(u.tratadoEm || "") >= semana).length, "t-ok"],
  ];
  $("urgResumo").innerHTML = tiles.map(([f, t, n, c]) => `<${f ? `button type="button" data-filtro="${esc(f)}"` : "div"} class="ur-t ${c}${f && f === urgFiltro ? " on" : ""}"><span class="ur-n">${n}</span><span class="ur-l">${esc(t)}</span></${f ? "button" : "div"}>`).join("");
  const todosAbertos = est.urgentes.filter((u) => !u.tratado);
  $("bdgUrg").hidden = !todosAbertos.length; $("bdgUrg").textContent = todosAbertos.length;
  $("bdgUrg").classList.toggle("late", todosAbertos.some((u) => prioDe(u) === 1 || (isoData(u.prazo) && u.prazo < hoje())));
}
$("btnDiario").addEventListener("click", () => abrirDiario());
$("btnOficios").addEventListener("click", () => mostrar("vOficios"));
$("btnKaizen").addEventListener("click", () => { mostrar("vPainel"); desenharPainel(); });
function formNovo(abrir) { $("urgNovo").hidden = !abrir; $("btnUrgNovo").setAttribute("aria-expanded", String(abrir)); $("btnUrgNovo").textContent = abrir ? "Fechar" : "+ Adicionar Edoc"; if (abrir) $("urgEdoc").focus(); }
$("btnUrgNovo").addEventListener("click", () => formNovo($("urgNovo").hidden));
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
    $("urgForm").reset(); $("urgSit").value = SITUACOES[0]; $("urgPrio").value = "2"; $("urgPor").value = porEsc; st.textContent = `${edoc} adicionado.`; st.className = "status"; formNovo(false);
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
$("urgLista").addEventListener("click", (e) => { if (e.target.closest("[data-cancel]")) e.target.closest(".urg-linkbox")?.remove(); if (e.target.closest("[data-cancel-dev]")) e.target.closest(".urg-devbox")?.remove(); });
$("urgLista").addEventListener("submit", async (e) => {
  const f = e.target.closest(".urg-devbox"); if (!f) return;
  e.preventDefault();
  const u = est.urgentes.find((x) => x.id === f.dataset.id); if (!u) return;
  const st = $("urgStatus"), agora = new Date().toISOString(), por = euNome() || quem();
  try {
    await fb.D.update(fb.D.ref(fb.db, `${COL_URGENTES}/${u.id}`), {
      situacao: DEVOLVIDO, situacaoEm: agora, situacaoPor: por,
      devolucao: { por, em: agora, motivo: f.querySelector("input").value.trim().slice(0, 300) }, devolucoes: (u.devolucoes || 0) + 1,
    });
    st.textContent = `${u.edoc} devolvido para correção.`; st.className = "status";
  } catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; }
});
$("urgResumo").addEventListener("click", (e) => { const b = e.target.closest("[data-filtro]"); if (!b) return; urgFiltro = urgFiltro === b.dataset.filtro ? "" : b.dataset.filtro; desenharUrgentes(); });
$("urgFiltros").addEventListener("click", (e) => { const b = e.target.closest("[data-filtro]"); if (!b) return; urgFiltro = b.dataset.filtro; desenharUrgentes(); });
$("urgLista").addEventListener("change", async (e) => {
  const s = e.target.closest('[data-urg="sit"], [data-urg="prio"]'); if (!s) return;
  const dados = s.dataset.urg === "prio" ? { prio: +s.value } : { situacao: s.value, situacaoEm: new Date().toISOString(), situacaoPor: euNome() || quem() };
  try { await fb.D.update(fb.D.ref(fb.db, `${COL_URGENTES}/${s.dataset.id}`), dados); }
  catch { $("urgStatus").textContent = "Não consegui guardar. Verifique a internet."; $("urgStatus").className = "status err"; }
});
$("vDiario").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-urg]"); if (!b) return;
  const id = b.dataset.id, acao = b.dataset.urg, ref = fb.D.ref(fb.db, `${COL_URGENTES}/${id}`);
  const st = $("urgStatus");
  if (acao === "devolver") {
    const item = b.closest(".urg-item"); if (!item || item.querySelector(".urg-devbox")) return;
    item.insertAdjacentHTML("beforeend", `<form class="urg-devbox" data-id="${esc(id)}"><label class="f">O que há a corrigir (opcional)<input type="text" maxlength="300" placeholder="Ex.: falta o n.º de submissão; prazo errado"></label><button class="btn small ghost" type="button" data-cancel-dev>Cancelar</button><button class="btn small primary" type="submit">Devolver</button></form>`);
    item.querySelector(".urg-devbox input").focus(); return;
  }
  if (acao === "reenviar") {
    b.disabled = true;
    try { await fb.D.update(ref, { situacao: "Ofício por assinar", situacaoEm: new Date().toISOString(), situacaoPor: euNome() || quem(), reenviadoEm: new Date().toISOString() }); st.textContent = "Reenviado para assinatura."; st.className = "status"; }
    catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; b.disabled = false; }
    return;
  }
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
  lista.forEach((u) => { agora[u.id] = `${u.situacao || ""}|${u.tratado ? 1 : 0}|${prioDe(u)}|${u.situacaoEm || ""}`; });
  const porAssinar = lista.filter((u) => !u.tratado && u.situacao === "Ofício por assinar").length;
  try { if (navigator.setAppBadge) porAssinar ? navigator.setAppBadge(porAssinar) : navigator.clearAppBadge(); } catch {}
  if (avisosVistos === null) { avisosVistos = agora; return; } // primeira leitura: não avisar do que já existia
  const eus = new Set([euNome(), quem()].filter(Boolean));
  const fuiEu = (n) => n && eus.has(n);
  const meu = (u) => fuiEu(u.criadoPor);
  // cada aviso diz a urgência e, ao clicar, abre o Edoc
  const enviar = (u, acao, extra) => {
    const urg = PRIO[prioDe(u)] || "Urgente";
    avisar(`${urg} · ${acao}`, `${u.edoc}${u.assunto ? " — " + u.assunto : ""}${extra ? " · " + extra : ""}${linkDe(u) ? "\nClique para abrir no Edoc." : ""}`, u.situacao || "", linkDe(u));
  };
  lista.forEach((u) => {
    const antes = avisosVistos[u.id];
    const [sitAntes, tratAntes, , emAntes] = (antes || "").split("|");
    if (u.tratado) {
      if (!antes || tratAntes === "1" || fuiEu(u.tratadoPor)) return;
      if ((notifPref.meu && meu(u)) || notifPref.muito) enviar(u, "Edoc tratado", u.tratadoPor ? "por " + u.tratadoPor : "");
      return;
    }
    if (!antes) {
      if (fuiEu(u.criadoPor) || !notifPref.assinar) return;
      enviar(u, u.situacao === "Ofício por assinar" ? "Novo ofício por assinar" : "Novo Edoc urgente", u.criadoPor ? "adicionado por " + u.criadoPor : "");
      return;
    }
    if (u.situacao === sitAntes && (u.situacaoEm || "") === emAntes) return;
    if (fuiEu(u.situacaoPor)) return;
    if (u.situacao === DEVOLVIDO) {
      if ((notifPref.meu && (meu(u) || fuiEu(u.resp))) || notifPref.muito)
        enviar(u, "Ofício devolvido para correção", [u.devolucao && u.devolucao.por ? "por " + u.devolucao.por : "", u.devolucao && u.devolucao.motivo].filter(Boolean).join(": "));
    } else if (u.situacao === "Ofício por assinar" && notifPref.assinar)
      enviar(u, sitAntes === DEVOLVIDO ? "Ofício corrigido, reenviado para assinatura" : "Ofício por assinar", u.situacaoPor ? "por " + u.situacaoPor : "");
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
const MODELOS = MODELOS_OFICIO.map((m) => [m.t, m.x, m.g]);
let modAtual = 0;
function desenharModelos() {
  const grupos = [...new Set(MODELOS.map((m) => m[2]))];
  $("modTabs").innerHTML = grupos.map((g) => `<div class="mod-g"><span class="mod-gt">${esc(g)}</span>${MODELOS.map(([t, , gg], i) => gg !== g ? "" : `<button type="button" class="fchip${i === modAtual ? " on" : ""}" data-mod="${i}" aria-pressed="${i === modAtual}">${esc(t)}</button>`).join("")}</div>`).join("");
  $("modTexto").value = MODELOS[modAtual][1]; $("modStatus").textContent = "";
}
$("modTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-mod]"); if (!b) return; modAtual = +b.dataset.mod; desenharModelos(); });
$("btnModAssinar").addEventListener("click", () => {
  const box = $("modAssinar"); if (box.innerHTML) { box.innerHTML = ""; return; }
  box.innerHTML = formAssinar($("modTexto").value); box.querySelector('[name="link"]').focus();
});
$("modAssinar").addEventListener("click", (e) => { if (e.target.closest("[data-fechar-assinar]")) $("modAssinar").innerHTML = ""; });
$("modAssinar").addEventListener("submit", async (e) => {
  const f = e.target.closest("form.assinar"); if (!f) return; e.preventDefault();
  if (await submeterAssinar(f, $("modStatus"))) $("modAssinar").innerHTML = "";
});
$("btnModWord").addEventListener("click", async () => {
  const st = $("modStatus");
  try { await passarAWord($("modTexto").value); st.textContent = "Word descarregado: reveja os campos entre [ ]."; st.className = "status"; }
  catch { st.textContent = "Não consegui gerar o Word."; st.className = "status err"; }
});
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

/* ---------------- Recados (post-its à direita do Trabalho diário) ---------------- */
const isoMais = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
function ehMsg(t, erro) { $("ehStatus").textContent = t; $("ehStatus").className = "status" + (erro ? " err" : ""); }
function desenharEquipaHoje() {
  { const { e, nota } = equipaDeHoje(); const el = $("horHoje");
    if (el) el.innerHTML = e || nota ? `<span class="muted small">Hoje</span>${e ? `<span class="hor-chip" style="background:${esc(e.cor)};color:${corTexto(e.cor)}">Equipa ${esc(e.nome)}</span>` : ""}${nota ? `<span class="small">${esc(nota)}</span>` : ""}` : ""; }
  const rec = est.recados.filter((r) => r.texto && (r.ate || "") >= hoje()).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  $("recLista").innerHTML = rec.map((r, i) => `<div class="recado c${i % 3}"><p>${esc(r.texto)}</p><div class="rec-meta"><span>${esc(r.criadoPor || "")} · até ${esc(fmt(r.ate))}</span><button type="button" class="rec-x" data-rec-rm="${esc(r.id)}" aria-label="Retirar recado">Retirar</button></div></div>`).join("");
  $("recVazio").hidden = !!rec.length || !$("recForm").hidden;
  // recados expirados há mais de 30 dias são apagados (limpeza)
  est.recados.filter((r) => r.ate && r.ate < isoMais(-30)).forEach((r) => fb.D.remove(fb.D.ref(fb.db, `${COL_RECADOS}/${r.id}`)).catch(() => {}));
}
function abrirForm(qual) {
  ["recForm"].forEach((id) => { $(id).hidden = id !== qual || !$(id).hidden; });
  $("btnRecadoNovo").setAttribute("aria-expanded", String(!$("recForm").hidden));
  desenharEquipaHoje();
  if (!$("recForm").hidden) { if (!$("recAte").value) $("recAte").value = isoMais(7); $("recTexto").focus(); }
}
$("btnRecadoNovo").addEventListener("click", () => abrirForm("recForm"));
$("recForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = $("recTexto").value.trim().slice(0, 200), ate = $("recAte").value;
  if (!texto || !isoData(ate)) return;
  try { await fb.D.set(fb.D.push(fb.D.ref(fb.db, COL_RECADOS)), { texto, ate, criadoPor: euNome() || quem(), criadoEm: new Date().toISOString() });
    $("recTexto").value = ""; $("recAte").value = ""; abrirForm(""); ehMsg("Recado afixado."); } catch { ehMsg("Não consegui guardar o recado.", true); }
});
$("equipaHoje").addEventListener("click", async (e) => {
  const r = e.target.closest("[data-rec-rm]");
  if (!r || !confirm("Retirar este recado?")) return;
  try { await fb.D.remove(fb.D.ref(fb.db, `${COL_RECADOS}/${r.dataset.recRm}`)); } catch { ehMsg("Não consegui apagar.", true); }
});

/* ---------------- Horário das equipas ---------------- */
est.horario = est.horario || { equipas: {}, dias: {} };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEM = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
let horMes = hoje().slice(0, 7), horSel = null;
const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const eqsOrd = () => Object.entries(est.horario.equipas).map(([id, e]) => ({ id, ...e })).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || String(a.nome).localeCompare(b.nome, "pt"));
const corTexto = (hex) => { const h = String(hex || "#ffffff").replace("#", ""); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 255); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1b1b1b" : "#ffffff"; };
const horMsg = (t, erro) => { $("horStatus").textContent = t; $("horStatus").className = "status" + (erro ? " err" : ""); };
function desenharHorario() {
  if (!$("horGrid")) return;
  const [y, m] = horMes.split("-").map(Number);
  $("horMes").textContent = `${MESES[m - 1]} ${y}`;
  const eqs = est.horario.equipas;
  $("horLeg").innerHTML = eqsOrd().map((e) => `<span class="hor-chip" style="background:${esc(e.cor)};color:${corTexto(e.cor)}">${esc(e.nome)}</span>`).join("");
  const ini = new Date(y, m - 1, 1); ini.setDate(1 - ((ini.getDay() + 6) % 7));
  const fim = new Date(y, m, 0); fim.setDate(fim.getDate() + ((7 - fim.getDay()) % 7));
  let html = DIAS_SEM.map((d, i) => `<div class="hor-h${i > 4 ? " fds" : ""}">${d}</div>`).join("");
  for (const d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
    const iso = isoD(d), reg = est.horario.dias[iso] || {}, e = reg.eq && eqs[reg.eq];
    const fds = d.getDay() === 0 || d.getDay() === 6, fora = d.getMonth() !== m - 1, feriado = /feriado/i.test(reg.nota || "");
    html += `<button type="button" class="hor-d${fds ? " fds" : ""}${fora ? " fora" : ""}${iso === hoje() ? " hoje" : ""}${iso === horSel ? " sel" : ""}${feriado ? " fer" : ""}" data-dia="${iso}"
      ${e ? `style="--eq:${esc(e.cor)};--eqt:${corTexto(e.cor)}"` : ""} aria-label="${fmt(iso)}${e ? ", equipa " + esc(e.nome) : ""}${reg.nota ? ", " + esc(reg.nota) : ""}">
      <span class="hor-n">${d.getDate()}</span>${e ? `<span class="hor-eq">${esc(e.nome)}</span>` : ""}${reg.nota ? `<span class="hor-nota">${esc(reg.nota)}</span>` : ""}</button>`;
  }
  $("horGrid").innerHTML = html;
  $("horEdEq").innerHTML = `<option value="">— Nenhuma —</option>` + eqsOrd().map((e) => `<option value="${esc(e.id)}">${esc(e.nome)}</option>`).join("");
  if (!$("horEqsEditor").hidden) desenharEqsEditor();
}
function abrirDia(iso) {
  horSel = iso; const reg = est.horario.dias[iso] || {};
  $("horEd").hidden = false; $("horEdTit").textContent = `${["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][new Date(iso + "T12:00").getDay()]}, ${fmt(iso)}`;
  desenharHorario(); $("horEdEq").value = reg.eq || ""; $("horEdNota").value = reg.nota || ""; $("horEdSemana").checked = false; $("horEdEq").focus();
}
$("btnHorario").addEventListener("click", () => { horMsg(""); desenharHorario(); mostrar("vHorario"); });
$("btnHorAnt").addEventListener("click", () => { const [y, m] = horMes.split("-").map(Number); horMes = isoD(new Date(y, m - 2, 1)).slice(0, 7); desenharHorario(); });
$("btnHorSeg").addEventListener("click", () => { const [y, m] = horMes.split("-").map(Number); horMes = isoD(new Date(y, m, 1)).slice(0, 7); desenharHorario(); });
$("btnHorHoje").addEventListener("click", () => { horMes = hoje().slice(0, 7); desenharHorario(); });
$("horGrid").addEventListener("click", (e) => { const b = e.target.closest("[data-dia]"); if (b) abrirDia(b.dataset.dia); });
$("btnHorEdFechar").addEventListener("click", () => { horSel = null; $("horEd").hidden = true; desenharHorario(); });
$("horEd").addEventListener("submit", async (e) => {
  e.preventDefault(); if (!horSel) return;
  const eq = $("horEdEq").value, nota = $("horEdNota").value.trim().slice(0, 200), upd = {}, por = euNome() || quem();
  upd[`dias/${horSel}`] = eq || nota ? { eq, nota, por } : null;
  if ($("horEdSemana").checked) {
    const d = new Date(horSel + "T12:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    for (let i = 0; i < 5; i++, d.setDate(d.getDate() + 1)) { const iso = isoD(d); if (iso === horSel) continue; const r = est.horario.dias[iso] || {}; upd[`dias/${iso}`] = eq || r.nota ? { eq, nota: r.nota || "", por } : null; }
  }
  try { await fb.D.update(fb.D.ref(fb.db, COL_HORARIO), upd); horMsg("Guardado."); } catch { horMsg("Não consegui guardar. Verifique a internet.", true); }
});
// equipas e cores
function desenharEqsEditor() {
  $("horEqsLista").innerHTML = eqsOrd().map((e) => `<div class="hor-eqr" data-eq="${esc(e.id)}"><input type="color" value="${esc(e.cor || "#cccccc")}" aria-label="Cor de ${esc(e.nome)}" data-eq-cor><input type="text" value="${esc(e.nome)}" maxlength="40" aria-label="Nome da equipa" data-eq-nome><button class="btn small ghost danger" type="button" data-eq-rm>Apagar</button></div>`).join("") || `<p class="muted small">Ainda não há equipas. Importe o Excel ou acrescente-as aqui.</p>`;
}
$("btnHorEquipas").addEventListener("click", () => { $("horEqsEditor").hidden = !$("horEqsEditor").hidden; $("btnHorEquipas").setAttribute("aria-expanded", String(!$("horEqsEditor").hidden)); desenharEqsEditor(); });
$("btnHorEqNova").addEventListener("click", async () => { try { await fb.D.set(fb.D.push(fb.D.ref(fb.db, `${COL_HORARIO}/equipas`)), { nome: "Nova equipa", cor: "#9ec5e8", ordem: eqsOrd().length + 1 }); } catch { horMsg("Não consegui guardar.", true); } });
$("horEqsLista").addEventListener("change", async (e) => {
  const r = e.target.closest("[data-eq]"); if (!r) return;
  const k = e.target.matches("[data-eq-cor]") ? "cor" : e.target.matches("[data-eq-nome]") ? "nome" : null; if (!k) return;
  const v = e.target.value.trim(); if (!v) return;
  try { await fb.D.update(fb.D.ref(fb.db, `${COL_HORARIO}/equipas/${r.dataset.eq}`), { [k]: v }); } catch { horMsg("Não consegui guardar.", true); }
});
$("horEqsLista").addEventListener("click", async (e) => {
  if (!e.target.closest("[data-eq-rm]")) return; const r = e.target.closest("[data-eq]"); const eq = est.horario.equipas[r.dataset.eq];
  const usados = Object.values(est.horario.dias).filter((d) => d.eq === r.dataset.eq).length;
  if (!confirm(`Apagar a equipa «${eq?.nome}»?${usados ? ` Está marcada em ${usados} dia(s), que ficam sem equipa.` : ""}`)) return;
  const upd = { [`equipas/${r.dataset.eq}`]: null }; Object.entries(est.horario.dias).forEach(([d, v]) => { if (v.eq === r.dataset.eq) upd[`dias/${d}/eq`] = ""; });
  try { await fb.D.update(fb.D.ref(fb.db, COL_HORARIO), upd); } catch { horMsg("Não consegui apagar.", true); }
});
// Importar o Excel do horário: cada folha é um mês; a cor de cada dia diz a equipa (legenda «Equipa N - Nome»); a linha de baixo tem as notas.
$("btnHorImportar").addEventListener("click", () => $("horFicheiro").click());
async function lerHorarioXlsx(buf) {
  const z = await JSZip.loadAsync(buf);
  const txt = async (n) => (z.file(n) ? await z.file(n).async("string") : "");
  const ss = [...(await txt("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlTxt([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const th = await txt("xl/theme/theme1.xml");
  const tema = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"].map((k) => { const m = th.match(new RegExp(`<a:${k}>[\\s\\S]*?(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"`)); return m ? m[1] : "FFFFFF"; });
  const st = await txt("xl/styles.xml");
  const fills = [...((st.match(/<fills[^>]*>([\s\S]*?)<\/fills>/) || [])[1] || "").matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((f) => {
    if (!/patternType="solid"/.test(f[1])) return null;
    const fg = (f[1].match(/<fgColor([^>]*)\/?>/) || [])[1] || ""; const rgb = (fg.match(/rgb="[0-9A-Fa-f]{0,2}([0-9A-Fa-f]{6})"/) || [])[1];
    let hex = rgb; if (!hex) { const t = (fg.match(/theme="(\d+)"/) || [])[1]; if (t === undefined) return null; hex = tema[+t] || "FFFFFF"; }
    const tint = parseFloat((fg.match(/tint="([-\d.eE]+)"/) || [])[1] || 0);
    const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((v) => Math.round(tint < 0 ? v * (1 + tint) : v + (255 - v) * tint));
    return c;
  });
  const xfs = [...((st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || "").matchAll(/<xf\b([^>]*)/g)].map((x) => +((x[1].match(/fillId="(\d+)"/) || [])[1] || 0));
  const wb = await txt("xl/workbook.xml"), rels = await txt("xl/_rels/workbook.xml.rels");
  const folhas = [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ nome: xmlTxt(m[1]), alvo: (rels.match(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`)) || [])[1] || "" }));
  const equipas = {}, dias = {};
  const hexDe = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const serialIso = (n) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5); return d.toISOString().slice(0, 10); };
  for (const f of folhas) {
    const xml = await txt("xl/" + f.alvo.replace(/^\/?xl\//, "").replace(/^\//, ""));
    const cel = {}; // "r,c" -> {v, cor}
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = (c[1].match(/r="([A-Z]+)(\d+)"/) || []); if (!ref[1]) continue;
      const t = (c[1].match(/t="(\w+)"/) || [])[1], s = +((c[1].match(/ s="(\d+)"/) || [])[1] || 0), corpo = c[2] || "";
      const v = (corpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const val = t === "s" ? ss[+v] || "" : t === "inlineStr" ? xmlTxt((corpo.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "") : t === "str" ? xmlTxt(v || "") : v === undefined ? "" : +v;
      cel[`${+ref[2]},${colLetra(ref[1])}`] = { v: val, cor: fills[xfs[s]] || null };
    }
    const leg = [];
    Object.values(cel).forEach((c) => { const m = typeof c.v === "string" && c.v.match(/equipa\s*\d+\s*[-–]\s*(.+)/i); if (m && c.cor) leg.push({ nome: m[1].trim(), cor: c.cor }); });
    leg.forEach((l) => { const k = normCt(l.nome); equipas[k] = { nome: l.nome, cor: hexDe(l.cor), ordem: equipas[k] ? equipas[k].ordem : Object.keys(equipas).length + 1 }; }); // a cor do mês mais recente fica
    const mesFolha = MESES.findIndex((m) => normCt(f.nome).startsWith(normCt(m)));
    for (const [k, c] of Object.entries(cel)) {
      if (typeof c.v !== "number" || c.v < 40000 || c.v > 60000) continue;
      const [rr, cc] = k.split(",").map(Number), iso = serialIso(c.v);
      const proprio = mesFolha < 0 || +iso.slice(5, 7) === mesFolha + 1;
      const nb = cel[`${rr + 1},${cc}`], nota = nb && typeof nb.v === "string" ? nb.v.replace(/\s+/g, " ").trim() : "";
      let eq = "";
      const cinza = c.cor && Math.max(...c.cor) - Math.min(...c.cor) < 40; // fundos cinzentos/brancos (fins de semana, dias sem equipa)
      if (c.cor && !cinza && leg.length) { const best = leg.map((l) => ({ l, d: dist(l.cor, c.cor) })).sort((a, b) => a.d - b.d)[0]; if (best.d < 90) eq = normCt(best.l.nome); }
      if (/feriado/i.test(nota)) eq = "";
      if (!eq && !nota) continue;
      if (dias[iso] && !proprio) continue; // o mês da própria folha manda
      dias[iso] = { eq, nota };
    }
  }
  return { equipas, dias };
}
$("horFicheiro").addEventListener("change", async () => {
  const f = $("horFicheiro").files[0]; $("horFicheiro").value = ""; if (!f) return;
  try {
    const r = await lerHorarioXlsx(await f.arrayBuffer());
    const nEq = Object.keys(r.equipas).length, nD = Object.keys(r.dias).length;
    if (!nEq || !nD) { horMsg("Não encontrei equipas («Equipa N - Nome») ou dias com cor neste ficheiro.", true); return; }
    const anos = [...new Set(Object.keys(r.dias).map((d) => d.slice(0, 4)))].join(", ");
    if (!confirm(`Ficheiro ${f.name}:\n- ${nEq} equipas: ${Object.values(r.equipas).map((e) => e.nome).join(", ")}\n- ${nD} dias com equipa ou nota (${anos})\n\nOs dias deste ficheiro substituem o que estiver na app nessas datas. Continuar?`)) return;
    const upd = {}, idPorNome = {};
    eqsOrd().forEach((e) => (idPorNome[normCt(e.nome)] = e.id));
    Object.entries(r.equipas).forEach(([k, e]) => { if (!idPorNome[k]) { const id = fb.D.push(fb.D.ref(fb.db, `${COL_HORARIO}/equipas`)).key; idPorNome[k] = id; upd[`equipas/${id}`] = e; } });
    const por = euNome() || quem();
    Object.entries(r.dias).forEach(([d, v]) => (upd[`dias/${d}`] = { eq: v.eq ? idPorNome[v.eq] || "" : "", nota: v.nota, por }));
    await fb.D.update(fb.D.ref(fb.db, COL_HORARIO), upd);
    horMsg(`Importado: ${nEq} equipas e ${nD} dias.`);
  } catch { horMsg("Não consegui ler ou guardar o ficheiro. Verifique se é o Excel do horário (.xlsx) e a internet.", true); }
});
const equipaDeHoje = () => { const r = est.horario.dias[hoje()]; const e = r && r.eq && est.horario.equipas[r.eq]; return { e, nota: r && r.nota }; };

/* ---------------- Contactos das entidades ---------------- */
const TIPOS_CT = ["Junta de Freguesia", "Água e saneamento", "Energia", "Empresa municipal", "Serviços municipais", "Fiscalização / empreitadas", "Empresa", "Outro"];
const tiposCt = () => [...new Set([...TIPOS_CT, ...est.contactos.map((c) => c.tipo).filter(Boolean)])];
const ordTipo = (t) => { const i = TIPOS_CT.indexOf(t); return i < 0 ? 50 : i; };
let ctEdit = null;
const ctMsg = (t, erro) => { $("ctStatus").textContent = t; $("ctStatus").className = "status" + (erro ? " err" : ""); };
const linhaDest = (c) => `Destinatário: ${c.tratamento || "EXMOS. SENHORES"} | ${[c.cargo, c.nome, c.entidade, c.email || c.morada].filter(Boolean).join(" | ")}`;
const normCt = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function desenharContactos() {
  const q = normCt($("ctBusca").value.trim());
  const l = est.contactos.filter((c) => c.entidade && (!q || normCt([c.entidade, c.cargo, c.nome, c.email, c.morada, c.notas, c.tipo].join(" ")).includes(q)))
    .sort((a, b) => ordTipo(a.tipo) - ordTipo(b.tipo) || String(a.tipo).localeCompare(String(b.tipo), "pt") || a.entidade.localeCompare(b.entidade, "pt"));
  $("ctSub").textContent = est.contactos.length ? `${l.length} de ${est.contactos.length} contacto${est.contactos.length === 1 ? "" : "s"}` : "";
  if (!est.contactos.length) {
    $("ctLista").innerHTML = `<div class="empty ct-vazio"><p>Ainda não há contactos.</p><p class="muted small">Pode carregar a lista inicial com os contactos públicos das 10 juntas de freguesia do concelho, da INDAQUA Matosinhos, da MatosinhosHabit e da E-REDES, e depois importar o vosso Excel.</p><button class="btn primary" type="button" id="btnCtBase">Carregar lista inicial</button></div>`;
    return;
  }
  let tipo = "";
  $("ctLista").innerHTML = l.length ? l.map((c) => {
    const cab = c.tipo !== tipo ? `<h3 class="sec-ttl regra-tema">${esc((tipo = c.tipo) || "Outro")}</h3>` : "";
    return `${cab}<div class="ct">
      <div class="ct-main">
        <strong class="ct-ent">${esc(c.entidade)}${c.obrigatorio ? ` <span class="chip ok">Dar sempre conhecimento</span>` : ""}</strong>
        ${c.cargo || c.nome ? `<span class="ct-cargo">${esc([c.tratamento, c.cargo, c.nome].filter(Boolean).join(" · "))}</span>` : ""}
        <span class="ct-dados">${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : `<span class="chip none">sem e-mail</span>`}${c.telefone ? `<span>${esc(c.telefone)}</span>` : ""}${c.morada ? `<span>${esc(c.morada)}</span>` : ""}</span>
        ${c.notas ? `<span class="muted small">${esc(c.notas)}</span>` : ""}
      </div>
      <div class="regra-acts"><button class="btn small ghost" type="button" data-ct-copiar="${esc(c.id)}">Copiar destinatário</button><button class="btn small ghost" type="button" data-ct-edit="${esc(c.id)}">Editar</button><button class="btn small ghost danger" type="button" data-ct-rm="${esc(c.id)}">Apagar</button></div>
    </div>`;
  }).join("") : `<p class="empty">Nenhum contacto encontrado.</p>`;
}
function formCt(c) {
  ctEdit = c ? c.id : null; $("ctForm").hidden = false; $("btnCtNovo").setAttribute("aria-expanded", "true");
  const v = c || { tipo: "Outro", tratamento: "EXMOS. SENHORES" };
  [["ctTipo", "tipo"], ["ctEntidade", "entidade"], ["ctTrat", "tratamento"], ["ctCargo", "cargo"], ["ctNome", "nome"], ["ctEmail", "email"], ["ctTel", "telefone"], ["ctMorada", "morada"], ["ctNotas", "notas"]]
    .forEach(([id, k]) => ($(id).value = v[k] || ""));
  $("ctTipos").innerHTML = tiposCt().map((t) => `<option value="${esc(t)}">`).join(""); if (!$("ctTipo").value) $("ctTipo").value = "Outro"; if (!$("ctTrat").value) $("ctTrat").value = "EXMOS. SENHORES";
  $("btnCtGuardar").textContent = c ? "Guardar alterações" : "Guardar contacto"; $("ctEntidade").focus();
}
function fecharCt() { ctEdit = null; $("ctForm").hidden = true; $("btnCtNovo").setAttribute("aria-expanded", "false"); }
const limpaCt = (c) => { const o = {}; ["tipo", "entidade", "tratamento", "cargo", "nome", "email", "telefone", "morada", "notas"].forEach((k) => (o[k] = String(c[k] || "").trim().slice(0, k === "notas" ? 300 : 200))); if (!o.tipo) o.tipo = "Outro"; o.obrigatorio = !!c.obrigatorio; if (!o.tratamento) o.tratamento = "EXMOS. SENHORES"; return o; };
$("btnContactos").addEventListener("click", () => { ctMsg(""); desenharContactos(); mostrar("vContactos"); });
$("btnCtNovo").addEventListener("click", () => ($("ctForm").hidden ? formCt(null) : fecharCt()));
$("btnCtCancelar").addEventListener("click", fecharCt);
$("ctBusca").addEventListener("input", desenharContactos);
$("ctForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const c = limpaCt({ obrigatorio: ctEdit ? !!(est.contactos.find((x) => x.id === ctEdit) || {}).obrigatorio : false, tipo: $("ctTipo").value, entidade: $("ctEntidade").value, tratamento: $("ctTrat").value, cargo: $("ctCargo").value, nome: $("ctNome").value, email: $("ctEmail").value, telefone: $("ctTel").value, morada: $("ctMorada").value, notas: $("ctNotas").value });
  if (!c.entidade) return;
  try {
    if (ctEdit) await fb.D.update(fb.D.ref(fb.db, `${COL_CONTACTOS}/${ctEdit}`), { ...c, editadoPor: euNome() || quem(), editadoEm: new Date().toISOString() });
    else await fb.D.set(fb.D.push(fb.D.ref(fb.db, COL_CONTACTOS)), { ...c, criadoPor: euNome() || quem(), criadoEm: new Date().toISOString() });
    ctMsg(ctEdit ? "Contacto atualizado." : "Contacto guardado."); fecharCt();
  } catch { ctMsg("Não consegui guardar. Verifique a internet.", true); }
});
async function gravarVarios(lista, origem) {
  const emailDe = (c) => normCt(c.email).trim();
  const porEmail = new Map(est.contactos.filter((c) => c.email).map((c) => [emailDe(c), c]));
  const porEnt = new Map(est.contactos.map((c) => [normCt(c.entidade), c]));
  const novos = [], fundir = {}; let iguais = 0;
  lista.map(limpaCt).forEach((c) => {
    if (!c.entidade) return;
    const exE = porEnt.get(normCt(c.entidade));
    const ex = (c.email && porEmail.get(emailDe(c))) || (exE && (!c.email || !exE.email) ? exE : null);
    if (ex) {
      const up = {}; ["nome", "cargo", "telefone", "morada", "notas"].forEach((k) => { if (c[k] && !ex[k]) up[k] = c[k]; });
      if (c.obrigatorio && !ex.obrigatorio) up.obrigatorio = true;
      if (Object.keys(up).length && ex.id) fundir[ex.id] = { ...(fundir[ex.id] || {}), ...up }; else iguais++;
      return;
    }
    novos.push(c); if (c.email) porEmail.set(emailDe(c), c); porEnt.set(normCt(c.entidade), c);
  });
  const nF = Object.keys(fundir).length;
  if (!novos.length && !nF) { ctMsg("Não há contactos novos (já existiam todos)."); return; }
  if (!confirm(`${origem}:\n- ${novos.length} contacto(s) novo(s)\n- ${nF} contacto(s) já existente(s) completado(s) com dados em falta\n- ${iguais} repetido(s) ignorado(s)\n\nContinuar?`)) return;
  const upd = {}; const por = euNome() || quem(), em = new Date().toISOString();
  try {
    novos.forEach((c) => { upd[fb.D.push(fb.D.ref(fb.db, COL_CONTACTOS)).key] = { ...c, criadoPor: por, criadoEm: em }; });
    Object.entries(fundir).forEach(([id, up]) => Object.entries(up).forEach(([k, v]) => (upd[`${id}/${k}`] = v)));
    await fb.D.update(fb.D.ref(fb.db, COL_CONTACTOS), upd);
    ctMsg(`${novos.length} contacto(s) acrescentado(s)${nF ? ` e ${nF} completado(s)` : ""}.`);
  } catch { ctMsg("Não consegui guardar. Verifique a internet.", true); }
}
$("ctLista").addEventListener("click", async (e) => {
  if (e.target.closest("#btnCtBase")) { gravarVarios(CONTACTOS_BASE, "Lista inicial de contactos públicos"); return; }
  const cp = e.target.closest("[data-ct-copiar]"), ed = e.target.closest("[data-ct-edit]"), rm = e.target.closest("[data-ct-rm]");
  const c = est.contactos.find((x) => x.id === (cp || ed || rm || {}).dataset?.[cp ? "ctCopiar" : ed ? "ctEdit" : "ctRm"]);
  if (!c) return;
  if (cp) { try { await navigator.clipboard.writeText(linhaDest(c)); cp.textContent = "Copiado"; setTimeout(() => (cp.textContent = "Copiar destinatário"), 1500); } catch {} return; }
  if (ed) { formCt(c); $("ctForm").scrollIntoView({ block: "nearest" }); return; }
  if (rm && confirm(`Apagar o contacto «${c.entidade}»?`)) { try { await fb.D.remove(fb.D.ref(fb.db, `${COL_CONTACTOS}/${c.id}`)); ctMsg("Contacto apagado."); } catch { ctMsg("Não consegui apagar.", true); } }
});
// Importar Excel (.xlsx, primeira folha) ou CSV
$("btnCtImportar").addEventListener("click", () => $("ctFicheiro").click());
const colLetra = (ref) => { let n = 0; for (const ch of String(ref).replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const xmlTxt = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
async function folhasXlsx(buf) {
  const z = await JSZip.loadAsync(buf);
  const txt = async (n) => (z.file(n) ? await z.file(n).async("string") : "");
  const ss = [...(await txt("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlTxt([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  // estilos: que células têm fundo verde («a verde as entidades que obrigatoriamente devem ser contactadas»)
  const st = await txt("xl/styles.xml");
  const fills = [...((st.match(/<fills[^>]*>([\s\S]*?)<\/fills>/) || [])[1] || "").matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((f) => ((f[1].match(/fgColor[^>]*rgb="([0-9A-Fa-f]{6,8})"/) || [])[1] || ""));
  const xfs = [...((st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || "").matchAll(/<xf\b([^>]*)/g)].map((x) => +((x[1].match(/fillId="(\d+)"/) || [])[1] || 0));
  const verde = (s) => { const rgb = fills[xfs[s]] || ""; if (rgb.length < 6) return false; const h = rgb.slice(-6); const [r, g, b] = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)); return g > 120 && g > r + 50 && g > b + 50; };
  const wb = await txt("xl/workbook.xml"), rels = await txt("xl/_rels/workbook.xml.rels");
  const folhas = [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ nome: xmlTxt(m[1]), alvo: ((rels.match(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`)) || [])[1] || "") }));
  const out = [];
  for (const f of folhas) {
    const xml = await txt("xl/" + f.alvo.replace(/^\/?xl\//, "").replace(/^\//, ""));
    const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
      const lin = []; let g = false;
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (c[1].match(/r="([A-Z]+\d+)"/) || [])[1], t = (c[1].match(/t="(\w+)"/) || [])[1], s = +((c[1].match(/ s="(\d+)"/) || [])[1] || 0), corpo = c[2] || "";
        const v = (corpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        const val = t === "s" ? ss[+v] || "" : t === "inlineStr" ? xmlTxt((corpo.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "") : xmlTxt(v || "");
        lin[ref ? colLetra(ref) : lin.length] = val.replace(/ /g, " ").trim();
        if (val && s && verde(s)) g = true;
      }
      const a = Array.from(lin, (x) => x || ""); a.verde = g; return a;
    });
    out.push({ nome: f.nome, rows });
  }
  return out;
}
const linhasCsv = (txt) => { const sep = (txt.split("\n")[0].match(/;/g) || []).length >= (txt.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  return txt.split(/\r?\n/).filter((l) => l.trim()).map((l) => { const o = []; let cur = "", aspas = false; for (const ch of l) { if (ch === '"') aspas = !aspas; else if (ch === sep && !aspas) { o.push(cur.trim()); cur = ""; } else cur += ch; } o.push(cur.trim()); return o; }); };
const RX_CT = { entidade: /entidade|organismo|empresa|institui/, nome: /^nome|representante|pessoa|interlocutor/, cargo: /cargo|fun[cç][aã]o|destinat/, email: /mail|correio/, morada: /morada|endere[cç]o/, codpostal: /c[oó]d.{0,3}postal|codigo postal/, telefone: /telef|telem|tlm|^tel|^contacto$|^contactos$/, tipo: /^tipo|categoria/, notas: /nota|obs/, tratamento: /tratamento/ };
const ehCab = (r) => r.filter((x) => x && Object.values(RX_CT).some((rx) => rx.test(normCt(x).trim()))).length >= 2;
function mapearFolha(nomeFolha, rows) {
  const out = []; let idx = null, seccao = /lista tel/i.test(nomeFolha) ? "" : nomeFolha;
  for (const r of rows) {
    const cheias = r.filter(Boolean);
    if (!cheias.length) continue;
    if (ehCab(r)) {
      idx = {}; const cab = r.map((x) => normCt(x).trim());
      Object.entries(RX_CT).forEach(([k, rx]) => { const i = cab.findIndex((x, j) => x && rx.test(x) && !Object.values(idx).includes(j)); if (i >= 0) idx[k] = i; });
      if (idx.entidade === undefined) { // ex.: «Outros | Email | Contacto»: a 1.ª coluna sem título reconhecido é a entidade e dá nome à secção
        const i = r.findIndex((x, j) => x && !Object.values(idx).includes(j));
        if (i >= 0 && idx.nome === undefined) { idx.entidade = i; if (!/^nome$/i.test(r[i])) seccao = r[i]; }
        else if (idx.nome !== undefined) { idx.entidade = idx.nome; delete idx.nome; }
      }
      continue;
    }
    if (cheias.length === 1 && String(cheias[0]).length > 2 && (!idx || !r[idx.email] )) { if (idx || !seccao) seccao = cheias[0]; continue; }
    if (!idx || cheias.length < 2) continue;
    const c = {}; Object.entries(idx).forEach(([k, i]) => (c[k] = (r[i] || "").trim()));
    // «EXMO. SENHOR / Presidente do Conselho de Administração / INDAQUA…» numa só célula: separar tratamento, cargo e entidade
    { const ls = (c.entidade || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
      if (ls.length > 1 && /^exm[oa]s?\.?\s/i.test(ls[0])) c.tratamento = c.tratamento || ls.shift();
      if (ls.length > 1 && /^(presidente|gestor|gestora|diretor|diretora|director|vereador|vereadora|chefe|administrador|comandante|coordenador|coordenadora)\b/i.test(ls[0])) c.cargo = c.cargo || ls.shift();
      c.entidade = ls.join(" – "); }
    const mails = (c.email || "").split(/[\s;,]+/).filter((x) => /@/.test(x));
    c.email = mails[0] || ""; const outros = mails.slice(1);
    if (/@/.test(c.morada || "") && !/\s/.test(c.morada.trim())) { outros.push(c.morada.trim()); c.morada = ""; }
    if (/@/.test(c.telefone || "")) { outros.push(...c.telefone.split(/[\s;,]+/).filter((x) => /@/.test(x) && x !== c.email)); c.telefone = ""; }
    c.morada = [c.morada, c.codpostal].filter(Boolean).join(", ").replace(/\s*\n\s*/g, ", "); delete c.codpostal;
    c.telefone = (c.telefone || "").replace(/\s*\n\s*/g, " / ");
    c.notas = [c.notas && c.notas.replace(/\s*\n+\s*/g, " "), [...new Set(outros)].filter((x) => x !== c.email).length ? `Outros e-mails: ${[...new Set(outros)].filter((x) => x !== c.email).join(", ")}` : "",
      /^uni[aã]o d(as|e) freguesias/i.test(c.entidade) ? "União de freguesias extinta em 2025 (freguesias repostas): confirmar se ainda se usa." : ""].filter(Boolean).join(" · ");
    c.obrigatorio = !!r.verde;
    c.tipo = c.tipo || (/junta de freguesia|uni[aã]o d(as|e) freguesias/i.test(c.entidade) ? "Junta de Freguesia" : seccao || "Outro");
    if (c.tratamento) { const t = c.tratamento.toUpperCase(); c.tratamento = /SENHORES|EXMOS/.test(t) ? "EXMOS. SENHORES" : /SENHORA|EXMA/.test(t) ? "EXMA. SENHORA" : "EXMO. SENHOR"; }
    else c.tratamento = c.nome ? "EXMO.(A) SENHOR(A)" : "EXMOS. SENHORES";
    if (c.entidade) out.push(c);
  }
  return out;
}
$("ctFicheiro").addEventListener("change", async () => {
  const f = $("ctFicheiro").files[0]; $("ctFicheiro").value = ""; if (!f) return;
  try {
    const folhas = /\.csv$/i.test(f.name) ? [{ nome: "", rows: linhasCsv(await f.text()) }] : await folhasXlsx(await f.arrayBuffer());
    const lista = folhas.flatMap((x) => mapearFolha(x.nome, x.rows));
    if (!folhas.some((x) => x.rows.some(ehCab))) { ctMsg("Não encontrei a linha de títulos. O Excel precisa de colunas como «Entidade», «E-mail», «Morada» ou «Cargo».", true); return; }
    if (!lista.length) { ctMsg("O ficheiro não tem contactos.", true); return; }
    gravarVarios(lista, `Ficheiro ${f.name} (${folhas.length} folha${folhas.length === 1 ? "" : "s"}, ${lista.length} contactos lidos)`);
  } catch { ctMsg("Não consegui ler o ficheiro. Guarde-o como .xlsx ou .csv e tente de novo.", true); }
});
const contactosPrompt = (pedido) => {
  if (!est.contactos.length) return "";
  const linha = (c) => `- ${linhaDest(c).replace(/^Destinatário: /, "")}${c.morada && c.email ? ` | morada: ${c.morada}` : ""}${c.notas ? ` | nota: ${c.notas}` : ""}${c.obrigatorio ? " | dar sempre conhecimento" : ""}`;
  let l = est.contactos.map(linha).join("\n");
  if (l.length > 5000) { const p = normCt(pedido); l = est.contactos.filter((c) => normCt(c.entidade).split(/[^a-z0-9]+/).some((w) => w.length > 4 && p.includes(w))).map(linha).join("\n").slice(0, 5000); }
  return l;
};

/* ---------------- Regras do MESTRE (memória partilhada da equipa) ---------------- */
est.regras = est.regras || [];
const TEMAS_REGRA = ["Escrita dos ofícios", "Preferências da chefia", "Entidades e contactos", "Prazos e procedimentos", "Outro"];
let regraEdit = null;
function desenharRegras() {
  const l = [...est.regras].sort((a, b) => TEMAS_REGRA.indexOf(a.tema) - TEMAS_REGRA.indexOf(b.tema) || String(a.criadoEm).localeCompare(String(b.criadoEm)));
  $("regrasSub").textContent = l.length ? `${l.length} regra${l.length === 1 ? "" : "s"} memorizada${l.length === 1 ? "" : "s"}` : "";
  let tema = "";
  $("regrasLista").innerHTML = l.length ? l.map((r) => {
    const cab = r.tema !== tema ? `<h3 class="sec-ttl regra-tema">${esc((tema = r.tema) || "Outro")}</h3>` : "";
    const corpo = regraEdit === r.id
      ? `<form class="regra-ed" data-regra-ed="${esc(r.id)}"><textarea rows="2" maxlength="500" required>${esc(r.texto)}</textarea><div class="actions"><button class="btn small ghost" type="button" data-regra-cancel>Cancelar</button><button class="btn small primary" type="submit">Guardar</button></div></form>`
      : `<p class="regra-t">${esc(r.texto)}</p><span class="muted small">Por ${esc(r.criadoPor || "")} a ${esc(quando(r.editadoEm || r.criadoEm))}${r.editadoEm ? " (editada)" : ""}</span>`;
    return `${cab}<div class="regra"><div class="regra-main">${corpo}</div>${regraEdit === r.id ? "" : `<div class="regra-acts"><button class="btn small ghost" type="button" data-regra-edit="${esc(r.id)}">Editar</button><button class="btn small ghost danger" type="button" data-regra-rm="${esc(r.id)}">Apagar</button></div>`}</div>`;
  }).join("") : `<p class="empty">Ainda não há regras. A primeira que guardar passa logo a ser seguida pelo MESTRE.</p>`;
}
async function guardarRegra(texto, tema, st) {
  texto = String(texto || "").trim().slice(0, 500);
  if (!texto) return false;
  if (est.regras.length >= 80) { st.textContent = "Já há 80 regras. Apague ou junte algumas antes de acrescentar."; st.className = "status err"; return false; }
  try {
    await fb.D.set(fb.D.push(fb.D.ref(fb.db, COL_REGRAS)), { texto, tema: TEMAS_REGRA.includes(tema) ? tema : "Outro", criadoPor: euNome() || quem(), criadoEm: new Date().toISOString() });
    st.textContent = "Regra guardada. O MESTRE passa a segui-la."; st.className = "status"; return true;
  } catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; return false; }
}
$("btnRegras").addEventListener("click", () => { $("regrasStatus").textContent = ""; desenharRegras(); mostrar("vRegras"); });
$("regraForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (await guardarRegra($("regraTexto").value, $("regraTema").value, $("regrasStatus"))) { $("regraTexto").value = ""; }
});
$("regrasLista").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-regra-edit]"), rm = e.target.closest("[data-regra-rm]");
  if (e.target.closest("[data-regra-cancel]")) { regraEdit = null; desenharRegras(); return; }
  if (ed) { regraEdit = ed.dataset.regraEdit; desenharRegras(); $("regrasLista").querySelector(".regra-ed textarea")?.focus(); return; }
  if (rm) {
    const r = est.regras.find((x) => x.id === rm.dataset.regraRm);
    if (!r || !confirm(`Apagar esta regra?\n\n${r.texto}`)) return;
    try { await fb.D.remove(fb.D.ref(fb.db, `${COL_REGRAS}/${r.id}`)); $("regrasStatus").textContent = "Regra apagada."; $("regrasStatus").className = "status"; }
    catch { $("regrasStatus").textContent = "Não consegui apagar."; $("regrasStatus").className = "status err"; }
  }
});
$("regrasLista").addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-regra-ed]"); if (!f) return; e.preventDefault();
  const texto = f.querySelector("textarea").value.trim().slice(0, 500); if (!texto) return;
  try { await fb.D.update(fb.D.ref(fb.db, `${COL_REGRAS}/${f.dataset.regraEd}`), { texto, editadoPor: euNome() || quem(), editadoEm: new Date().toISOString() }); regraEdit = null; desenharRegras(); }
  catch { $("regrasStatus").textContent = "Não consegui guardar."; $("regrasStatus").className = "status err"; }
});
const textoRegras = () => est.regras.length ? est.regras.map((r) => `- [${r.tema || "Outro"}] ${r.texto}`).join("\n").slice(0, 6000) : "";

/* ---------------- Ferramentas: valor por extenso e liberação de caução ---------------- */
function calcExtenso() { const v = lerValor($("extValor").value); $("extRes").textContent = v === null ? "" : valorCompleto(v); }
$("extValor").addEventListener("input", calcExtenso);
$("btnExtCopiar").addEventListener("click", async () => { const t = $("extRes").textContent; if (!t) return; try { await navigator.clipboard.writeText(t); $("btnExtCopiar").textContent = "Copiado"; setTimeout(() => ($("btnExtCopiar").textContent = "Copiar"), 1500); } catch {} });
const CAU_PCT = { 1: 30, 2: 30, 3: 15, 4: 15, 5: 10 };
const pctTxt = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
const anosTxt = (anos) => { const t = anos.map((n) => `${n}.º`); return (t.length > 1 ? t.slice(0, -1).join(", ") + " e " + t.at(-1) + " anos" : t[0] + " ano"); };
// Liberação de um ou mais anos (ex.: 1.º e 2.º juntos = 60%). Devolve null se faltar algo.
function calcLiberacao(total, anos, pctManual) {
  anos = [...new Set(anos)].filter((n) => CAU_PCT[n]).sort((x, y) => x - y);
  if (!total || !anos.length) return null;
  const pct = pctManual ?? anos.reduce((s, n) => s + CAU_PCT[n], 0);
  const lib = Math.round(total * pct) / 100;
  const ate = Math.max(...anos), acum = Math.min(100, Object.entries(CAU_PCT).filter(([n]) => +n < ate && !anos.includes(+n)).reduce((s, [, p]) => s + p, 0) + pct);
  const libTotal = Math.round(total * acum) / 100;
  const det = anos.length > 1 && pctManual == null ? ` (${anos.map((n) => `${CAU_PCT[n]}% do ${n}.º ano`).join(" e ")})` : "";
  return { anos, pct, lib, acum, libTotal, resta: Math.max(0, Math.round((total - libTotal) * 100) / 100),
    frase: `será liberado ${pctTxt(pct)}% do valor total da caução${det}, relativo ${anos.length > 1 ? "aos" : "ao"} ${anosTxt(anos)} após a receção provisória, que corresponde à liberação de ${valorCompleto(lib)}` };
}
let cauFrase = "";
const cauAnosSel = () => [...$("cauAnos").querySelectorAll("input:checked")].map((i) => +i.value);
function calcCaucao() {
  const v = lerValor($("cauValor").value), anos = cauAnosSel();
  if (!$("cauPct").dataset.mexido) $("cauPct").value = anos.reduce((s, n) => s + CAU_PCT[n], 0) || "";
  const pm = $("cauPct").dataset.mexido ? Math.min(100, Math.max(0, parseFloat(String($("cauPct").value).replace(",", ".")) || 0)) : null;
  const r = v ? calcLiberacao(v, anos, pm) : null;
  if (!r) { $("cauRes").innerHTML = ""; cauFrase = ""; return; }
  cauFrase = r.frase;
  $("cauRes").innerHTML = `<p><strong>A liberar (${esc(anosTxt(r.anos))}):</strong> ${esc(valorCompleto(r.lib))}</p>
    <p class="muted small">Caução total: ${esc(fmtEuros(v))} € · liberado no total depois desta liberação: ${pctTxt(r.acum)}% = ${esc(fmtEuros(r.libTotal))} € · fica retido: ${esc(fmtEuros(r.resta))} €</p>
    <p class="cau-frase">«…${esc(cauFrase)}.»</p>`;
}
$("cauValor").addEventListener("input", calcCaucao);
$("cauAnos").addEventListener("change", () => { delete $("cauPct").dataset.mexido; calcCaucao(); });
$("cauPct").addEventListener("input", () => { $("cauPct").dataset.mexido = "1"; calcCaucao(); });
$("btnCauCopiar").addEventListener("click", async () => { if (!cauFrase) return; try { await navigator.clipboard.writeText(cauFrase + "."); $("cauStatus").textContent = "Frase copiada."; $("cauStatus").className = "status"; } catch {} });
$("cauPct").value = CAU_PCT[1];

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
  const leg = [...document.querySelectorAll("#vOficios .leg-sec")].filter((d) => d.id !== "eoSec" && !d.querySelector("#przIni, #modTabs")).map((d) => d.innerText.replace(/\s+\n/g, "\n").trim()).join("\n\n");
  const mods = MODELOS_OFICIO.map((m) => `- ${m.g}: ${m.t}`).join("\n");
  return `${leg.slice(0, 7000)}\n\nMODELOS DE OFÍCIO DA SECRETARIA (o utilizador pode pedir qualquer um):\n${mods}`;
}
function dadosApp() {
  const L = [];
  const ab = est.urgentes.filter((u) => !u.tratado).sort((x, y) => prioDe(x) - prioDe(y) || (x.prazo || "9").localeCompare(y.prazo || "9"));
  L.push(`Edocs urgentes por tratar (${ab.length}):`);
  ab.forEach((u) => L.push(`- ${u.edoc} | ${PRIO[prioDe(u)]} | ${u.situacao || "Outro"}${u.assunto ? " | " + u.assunto : ""}${u.nota ? " | a fazer: " + u.nota : ""}${u.resp ? " | resp.: " + u.resp : ""}${u.prazo ? " | prazo " + fmt(u.prazo) + (u.prazo < hoje() ? " (EM ATRASO)" : "") : ""} | adicionado por ${u.criadoPor || "?"} há ${diasDesde(u.criadoEm) ?? "?"} dias${u.situacaoEm ? ", nesta situação há " + diasDesde(u.situacaoEm) + " dias" : ""}`));
  const tr = est.urgentes.filter((u) => u.tratado).sort((x, y) => String(y.tratadoEm).localeCompare(String(x.tratadoEm))).slice(0, 15);
  L.push(`Últimos tratados (${tr.length}):`);
  tr.forEach((u) => L.push(`- ${u.edoc}${u.assunto ? " | " + u.assunto : ""} | tratado por ${u.tratadoPor || "?"} em ${quando(u.tratadoEm)} | adicionado por ${u.criadoPor || "?"}`));
  const rs = [...est.reunioes].sort((x, y) => String(y.data).localeCompare(String(x.data))).slice(0, 2);
  rs.forEach((r) => {
    const t = r.tarefas.filter((x) => x.coluna !== "Concluído");
    L.push(`Reunião Kaizen de ${fmt(r.data)}: ${r.tarefas.length} tarefas, ${t.length} por concluir:`);
    t.slice(0, 25).forEach((x) => L.push(`- ${x.tarefa}${x.responsavel ? " | " + x.responsavel : ""} | ${x.coluna || ""}${x.prazo ? " | até " + fmt(x.prazo) : ""}`));
  });
  L.push(`Equipa: ${EQUIPA.map((p) => p.nome).join(", ")}.`);
  { const d = new Date(); const lin = []; for (let i = 0; i < 14; i++, d.setDate(d.getDate() + 1)) { const iso = isoD(d), r = est.horario.dias[iso]; if (!r) continue; const e = r.eq && est.horario.equipas[r.eq]; lin.push(`${fmt(iso)}: ${e ? "equipa " + e.nome : "sem equipa"}${r.nota ? " (" + r.nota + ")" : ""}`); }
    if (lin.length) L.push(`Horário das equipas (próximos 14 dias): ${lin.join("; ")}.`); }
  const recA = est.recados.filter((r) => r.ate >= hoje()); if (recA.length) L.push(`Recados da equipa: ${recA.map((r) => `«${r.texto}» (${r.criadoPor || ""})`).join("; ")}.`);
  L.push(`Mapas Excel partilhados (só os nomes; o MESTRE não abre os ficheiros): ${[...(MAPAS || []), ...est.mapas].map((m) => m.nome).join("; ")}.`);
  return L.join("\n").slice(0, 5000);
}
function promptSistema(pedido = "") {
  return `Chamas-te MESTRE e és o assistente da Secretaria da Subunidade Orgânica da Conservação (Departamento de Conservação) da Câmara Municipal de Matosinhos.
Ajudas a equipa no trabalho administrativo: redigir e rever ofícios e respostas a munícipes, resumir textos, explicar prazos e passos do procedimento (CPA), proteção de dados (RGPD), pedidos de indemnização e documentos de empreitadas (CCP).
Regras:
- Escreve sempre em português de Portugal (norma europeia), em tom profissional e sóbrio. Nunca uses emojis.
- Sê claro e direto; usa listas curtas quando ajudar.
- Ofícios: segue o estilo da Secretaria. Quando redigires um ofício, começa SEMPRE com estas três linhas (uma por linha) e depois o corpo:
  Destinatário: EXMO. SENHOR | [Nome ou cargo] | [Entidade, se houver] | [E-mail ou morada]
  Referência: [OD/AAAA/NNNNN]
  Assunto: [assunto curto]
  (use EXMA. SENHORA quando for uma senhora; para entidades, o cargo, ex.: «Presidente do Conselho de Administração», e o nome da entidade)
- Corpo do ofício, sem saudação inicial (o destinatário já vai no cabeçalho): começa com «Reportando-me ao assunto identificado em epígrafe, registado nesta Câmara Municipal sob o n.º de submissão [AAAA-CMM-NNNNN], cumpre informar V. Ex.ª, em cumprimento do despacho da Senhora Chefe da Divisão de Conservação do Espaço Público e Sistema Pluvial, que …» (ou «Em resposta ao assunto identificado em epígrafe…» / «Na sequência da reclamação apresentada…»). Parágrafos curtos e objetivos, linguagem técnica clara.
- A munícipes, termina com «Sem outro assunto de momento, permanece esta Câmara Municipal à disposição de V. Ex.ª para quaisquer esclarecimentos adicionais que se revelem necessários.» e «Com os melhores cumprimentos,».
- A entidades externas (Indaqua, MatosinhosHabit, empresas) trata por «V. Exas.», pede «com a maior brevidade possível» o que for preciso, e termina com «Solicita-se que na resposta à presente comunicação seja identificada a nossa refª [referência].» e «Com os melhores cumprimentos,». Notificações com prazo: indica o prazo por extenso, ex.: «no prazo de 10 (dez) dias úteis, contados da data da presente notificação».
- Não escrevas a assinatura (A Coordenadora Técnica, Departamento de Conservação, subdelegação): o modelo Word já a tem. Deixa entre [ ] o que não souberes.
- Nunca inventes artigos, prazos ou números de processo. Se não tiveres certeza, di-lo e recomenda confirmar no texto da lei ou com os serviços jurídicos.
- Usa os dados que o utilizador fornecer apenas para a tarefa pedida; não peças dados pessoais que não sejam necessários.
- A informação de referência abaixo é a que a Secretaria usa; dá-lhe prioridade (verificada a 23/11/2026).
- Tens acesso aos dados atuais da app (Edocs urgentes, tarefas Kaizen, equipa, mapas) na secção DADOS DA APP. Responde a perguntas como «o que está por assinar?» ou «o que tenho em atraso?» só com base nesses dados; se não estiver lá, diz que não tens essa informação.
- Quando o utilizador pedir para acrescentar um Edoc aos urgentes, confirma os dados e termina a resposta com uma linha exatamente neste formato (sem mais nada nessa linha):
[[ADICIONAR_URGENTE {"edoc":"OD/2026/12345","assunto":"...","nota":"o que há a fazer","prio":2,"situacao":"Por oficiar","resp":"","prazo":"AAAA-MM-DD"}]]
  (prio: 1 muito urgente, 2 urgente, 3 normal; situacao: uma de ${SITUACOES.join(", ")}; resp: nome da equipa ou vazio; prazo vazio se não houver). A app pede depois o link do Edoc e a confirmação.
- Quando o utilizador pedir para te lembrares de algo para o futuro («lembra-te que…», «a partir de agora…», «memoriza…»), reescreve-o como uma regra curta e clara e termina a resposta com uma linha exatamente neste formato:
[[LEMBRAR {"tema":"Escrita dos ofícios","texto":"..."}]]
  (tema: uma de ${TEMAS_REGRA.join(", ")}). A app pede confirmação antes de guardar em «Regras do MESTRE».
- Nos contactos, «dar sempre conhecimento» marca as entidades que a Secretaria contacta obrigatoriamente (ex.: forças de segurança, bombeiros, proteção civil em cortes de trânsito ou obras); lembra-as quando o assunto o justificar.
- Ofícios a entidades (juntas de freguesia, INDAQUA, E-REDES, MatosinhosHabit, etc.): se a entidade estiver em CONTACTOS DAS ENTIDADES, preenche a linha «Destinatário:» exatamente com esses dados, pela mesma ordem (tratamento | cargo | nome, se houver | entidade | e-mail ou morada). Se não estiver na lista, não inventes contactos: deixa [ ] e diz na Nota que a entidade não está nos Contactos.
- PEDIDOS DE OFÍCIO (regra principal, acima das indicações de estilo):
  a) Se pedirem um ofício e ainda não tiveres o relatório detalhado do Edoc (anexado ou colado, com os dados do processo: requerente, contactos, n.º de submissão, OD, local, despacho), NÃO escrevas o ofício. Responde só, em poucas linhas: «Para fazer o ofício, anexe (PDF) ou cole aqui o relatório detalhado do Edoc.» Se o tipo de ofício não for claro, pergunta também qual é, indicando 2 ou 3 nomes de modelos da lista que possam servir.
  b) Com o relatório: escolhe o modelo da Secretaria que corresponde ao caso (os textos completos estão no fim, em MODELO(S) DA SECRETARIA). Copia o modelo palavra a palavra: as três linhas iniciais, todos os parágrafos, a pontuação e as fórmulas finais. Só podes (1) substituir os campos entre [ ] pelos dados do relatório (nome, e-mail ou morada, OD, n.º de submissão, rua, freguesia, datas, valores) e (2) escolher entre alternativas que o próprio modelo indique, retirando a que não se aplica. Não reescrevas, não resumas, não melhores frases, não acrescentes nem retires parágrafos. O que o relatório não disser fica entre [ ].
  c) Se o modelo tiver um campo de descrição livre (ex.: [Descrever o que foi verificado…]), preenche-o só com o que estiver no relatório, em uma ou duas frases no mesmo registo; se o relatório não tiver essa informação, deixa o campo entre [ ].
  d) No fim, depois de «Com os melhores cumprimentos,», escreve uma linha começada por «Nota:» com o nome do modelo usado e os campos que ficaram por preencher.
  e) Só se nenhum modelo servir é que redige de raiz no estilo da Secretaria, e di-lo na Nota.
- Quando houver um documento anexado, resume-o, diz claramente o que é pedido e, se fizer sentido, propõe um rascunho de resposta.
- Valores em euros: escreve SEMPRE [[EXTENSO valor]] (ex.: [[EXTENSO 45656,16]]) e a app converte em «45.656,16 € (quarenta e cinco mil … cêntimos)». Não escrevas tu o extenso. Faz as contas com cuidado (ex.: 30% de 14.490,40 = 4.347,12).
- Liberação de caução (art. 295.º CCP), faseada a contar da receção provisória: 30% no 1.º ano, 30% no 2.º, 15% no 3.º, 15% no 4.º e 10% no 5.º, salvo se o contrato ou o despacho indicar outra coisa.
- Para a frase da liberação escreve [[CAUCAO valor_total anos]] (ex.: [[CAUCAO 14490,40 1]] ou, para o 1.º e 2.º anos juntos, [[CAUCAO 14490,40 1-2]]; anos soltos: [[CAUCAO 14490,40 1,3]]) e a app escreve «será liberado …% do valor total da caução …, que corresponde à liberação de … € (…)». Usa-a sempre que houver liberação, também quando são vários anos de uma vez.
- Revisão de ofício (quando pedirem para rever ou anexarem o Word final): responde com uma lista curta «Verificação», em que cada ponto começa por «OK:» ou «Atenção:», cobrindo: destinatário e tratamento (EXMO./EXMA., V. Ex.ª/V. Exas.); referência (OD/EDOC) igual no cabeçalho e no texto; assunto; datas, prazos e artigos citados (CPA/CCP) corretos e coerentes; valores e extensos certos; campos [ ] ou «xxx» por preencher; português (norma europeia, acordo ortográfico); dados pessoais desnecessários; fórmula final. Depois indica só as correções necessárias, com o texto corrigido.

${contactosPrompt(pedido) ? `CONTACTOS DAS ENTIDADES (formato: tratamento | cargo | nome | entidade | e-mail ou morada):
${contactosPrompt(pedido)}

` : ""}${manualPrompt(pedido) ? `MANUAL DA SECRETARIA (procedimentos escritos pela equipa; segue estes passos quando o pedido for sobre um destes procedimentos e indica o procedimento na resposta):
${manualPrompt(pedido)}

` : ""}${textoRegras() ? `REGRAS DA SECRETARIA (definidas pela equipa; têm prioridade sobre as indicações gerais e sobre os modelos):
${textoRegras()}

` : ""}INFORMAÇÃO DE REFERÊNCIA:
${contextoTrabalho()}

DADOS DA APP (hoje: ${fmt(hoje())}; utilizador: ${euNome() || quem() || "desconhecido"}):
${dadosApp()}${(() => { const r = modelosRelevantes(pedido); return r.length ? `\n\nMODELO(S) DA SECRETARIA MAIS ADEQUADO(S) A ESTE PEDIDO (segue a estrutura e as fórmulas; adapta ao caso e mantém [ ] no que não souberes):\n${r.map((m) => `«${m.t}»:\n${m.x}`).join("\n\n")}` : ""; })()}`;
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
// O MESTRE escreve [[EXTENSO 45656,16]] e a app troca pelo valor formatado e por extenso (sem erros de contas).
const expandirCaucao = (t) => String(t || "").replace(/\[\[CAUCAO\s+([\d.,]+)\s+([\d\s,e+-]+?)\s*\]\]/gi, (m, v, an) => {
  let anos = []; for (const p of an.split(/[\s,e+]+/).filter(Boolean)) { const [x, y] = p.split("-").map(Number); if (y) for (let n = x; n <= y; n++) anos.push(n); else anos.push(x); }
  const r = calcLiberacao(lerValor(v), anos); return r ? r.frase : m;
});
const expandirExtenso = (t) => String(t || "").replace(/\[\[EXTENSO\s+([\d.,\s]+?)\s*\]\]/g, (m, v) => { const n = lerValor(v); return n === null ? m : valorCompleto(n); });
const RX_ACAO = /\[\[ADICIONAR_URGENTE\s+(\{[\s\S]*?\})\s*\]\]/;
function lerAcao(t) { const m = String(t || "").match(RX_ACAO); if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; } }
const RX_LEMBRAR = /\[\[LEMBRAR\s+(\{[\s\S]*?\})\s*\]\]/;
function lerLembrar(t) { const m = String(t || "").match(RX_LEMBRAR); if (!m) return null; try { const r = JSON.parse(m[1]); return r && r.texto ? r : null; } catch { return null; } }
const semAcao = (t) => limparPensar(t).replace(RX_ACAO, "").replace(RX_LEMBRAR, "").trim();
function msgIA(m, i) {
  const ac = !chatOcupado || m.t ? lerAcao(m.t) : null;
  const card = ac && ac.edoc ? `<form class="acao" data-acao="${i}">
      <div><strong>Adicionar aos Edocs urgentes</strong>: ${esc(normEdocTxt(ac.edoc))}${ac.assunto ? " — " + esc(ac.assunto) : ""}<br><span class="muted small">${esc(PRIO[ac.prio] || PRIO[2])} · ${esc(SITUACOES.includes(ac.situacao) ? ac.situacao : "Outro")}${ac.resp ? " · " + esc(ac.resp) : ""}${isoData(ac.prazo) ? " · prazo " + esc(fmt(ac.prazo)) : ""}</span></div>
      ${m.feito ? `<span class="ok-t">Adicionado.</span>` : `<input type="url" placeholder="Link do Edoc (obrigatório)" aria-label="Link do Edoc"><button class="btn small primary" type="submit">Adicionar</button>`}</form>` : "";
  const lb = !chatOcupado || m.t ? lerLembrar(m.t) : null;
  const cardL = lb ? `<form class="acao lembrar" data-lembrar="${i}"><div><strong>Guardar nas Regras do MESTRE</strong> (${esc(TEMAS_REGRA.includes(lb.tema) ? lb.tema : "Outro")})<br><span class="small">${esc(String(lb.texto).slice(0, 500))}</span></div>
      ${m.lembrado ? `<span class="ok-t">Guardada.</span>` : `<button class="btn small primary" type="submit">Guardar regra</button>`}</form>` : "";
  return `<div class="msg ia"><div class="bolha">${fmtResposta(semAcao(m.t)) || '<p class="muted">A pensar…</p>'}</div>${card}${cardL}${m.t && !(chatOcupado && i === (chatConvs.find((x) => x.id === chatAtual)?.msgs.length || 0) - 1) ? `<div class="msg-acts"><button class="btn small ghost" type="button" data-copiar="${i}">Copiar</button><button class="btn small ghost" type="button" data-word="${i}">Passar a Word</button><button class="btn small ghost" type="button" data-assinar="${i}">Enviar para assinatura</button></div><div class="assinar-box" data-box="${i}"></div>` : ""}</div>`;
}
const normEdocTxt = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
function desenharChat() {
  const c = chatConvs.find((x) => x.id === chatAtual);
  const msgs = c ? c.msgs : [];
  $("chatMsgs").innerHTML = msgs.length ? msgs.map((m, i) => m.r === "user"
    ? `<div class="msg eu"><div class="bolha">${esc(m.t).replace(/\n/g, "<br>")}${m.anexo ? `<div class="anexo-tag">Anexo: ${esc(m.anexo)}</div>` : ""}</div></div>`
    : msgIA(m, i)).join("")
    : `<div class="chat-vazio"><div class="mestre-fig" aria-hidden="true"><img src="icons/mestre-corpo-sem-mao.webp" alt="" width="121" height="200"><img class="mao" src="icons/mestre-mao.webp" alt="" width="121" height="200"></div><p><strong>Olá, sou o MESTRE. Como posso ajudar?</strong></p><p class="muted">Posso redigir ofícios, rever textos, explicar prazos do CPA ou o passo seguinte de um pedido de indemnização.</p></div>`;
  $("chatMsgs").scrollTop = $("chatMsgs").scrollHeight;
  $("chatHist").innerHTML = chatConvs.length ? chatConvs.map((x) => `<div class="hist-i${x.id === chatAtual ? " on" : ""}">
      <button type="button" class="hist-b" data-conv="${esc(x.id)}"><span>${esc(x.titulo || "Conversa")}</span><small>${esc(quando(x.em))}</small></button>
      <button type="button" class="hist-x" data-conv-rm="${esc(x.id)}" aria-label="Apagar conversa">Apagar</button></div>`).join("")
    : `<p class="empty small">Sem conversas guardadas.</p>`;
  $("chatSug").innerHTML = msgs.length ? "" : [
    ["Fazer ofício", "Quero fazer um ofício. Segue o relatório detalhado do Edoc (anexe o PDF ou cole o texto):\n"],
    ["Rever um texto", "Revê este texto, corrige o português e torna-o mais claro e profissional:\n"],
    ["Que prazo se aplica?", "Que prazo se aplica nesta situação e como se conta? Situação: "],
    ["Passo seguinte (indemnização)", "Num pedido de indemnização, qual é o passo seguinte e que ofício devo usar? Situação: "],
    ["Rever ofício", "Revê este ofício antes de seguir para assinatura (anexe o Word ou cole o texto):\n"],
    ["O que está por assinar?", "O que está por assinar e há quanto tempo?"],
    ["O que está em atraso?", "Que Edocs urgentes estão em atraso ou parados há mais tempo?"],
  ].map(([t, p]) => `<button type="button" class="fchip" data-sug="${esc(p)}">${esc(t)}</button>`).join("");
}
function abrirAssistente() {
  chatLer();
  if (!chatAtual || !chatConvs.some((x) => x.id === chatAtual)) chatAtual = chatConvs[0]?.id || null;
  $("chatStatus").textContent = semChave() ? "O MESTRE ainda não está configurado (falta a chave do Groq)." : "";
  $("chatStatus").className = semChave() ? "status err" : "status";
  desenharChat(); $("mestreOla").hidden = true; $("mestre").hidden = false; $("btnMestreAbrir").setAttribute("aria-expanded", "true"); $("btnMestreAbrir").classList.add("aberto"); setTimeout(() => $("chatTxt").focus(), 50);
}
/* Anexos: imagens vão ao modelo de visão; PDF com texto é lido no browser (pdf.js); PDF digitalizado é convertido em imagens. */
let chatAnexo = null; // { nome, tipo: "img"|"doc", imgs: [dataUrl], texto }
let pdfjs = null;
async function carregarPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(new URL("vendor/pdf.min.mjs", location.href).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.mjs", location.href).href;
  return pdfjs;
}
function lerFicheiroURL(f) { return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); }); }
async function reduzirImagem(src, max = 1600) {
  const img = new Image(); img.src = src; await img.decode();
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}
async function prepararAnexo(f) {
  const st = $("chatStatus");
  if (f.size > 15 * 1024 * 1024) { st.textContent = "Ficheiro demasiado grande (máximo 15 MB)."; st.className = "status err"; return; }
  st.textContent = `A ler «${f.name}»…`; st.className = "status";
  try {
    if (f.type.startsWith("image/")) chatAnexo = { nome: f.name, tipo: "img", imgs: [await reduzirImagem(await lerFicheiroURL(f))] };
    else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      const lib = await carregarPdfjs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      let texto = "";
      for (let p = 1; p <= Math.min(pdf.numPages, 20); p++) { const pg = await pdf.getPage(p); const tc = await pg.getTextContent(); texto += tc.items.map((i) => i.str).join(" ") + "\n\n"; }
      texto = texto.replace(/[ \t]+/g, " ").trim();
      if (texto.length > 200) chatAnexo = { nome: f.name, tipo: "doc", texto: texto.slice(0, 15000), paginas: pdf.numPages };
      else {
        const imgs = [];
        for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
          const pg = await pdf.getPage(p); const vp = pg.getViewport({ scale: 1.6 });
          const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
          await pg.render({ canvasContext: c.getContext("2d"), viewport: vp, canvas: c }).promise;
          imgs.push(await reduzirImagem(c.toDataURL("image/jpeg", 0.85)));
        }
        chatAnexo = { nome: f.name, tipo: "img", imgs, paginas: pdf.numPages };
      }
    } else if (/\.docx$/i.test(f.name)) {
      const z = await JSZip.loadAsync(await f.arrayBuffer());
      const x = await z.file("word/document.xml").async("string");
      const texto = x.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
      chatAnexo = { nome: f.name, tipo: "doc", texto: texto.slice(0, 15000), word: true };
    } else chatAnexo = { nome: f.name, tipo: "doc", texto: (await f.text()).slice(0, 15000) };
    st.textContent = "";
  } catch { chatAnexo = null; st.textContent = "Não consegui ler esse ficheiro."; st.className = "status err"; }
  desenharAnexo();
}
function desenharAnexo() {
  const box = $("chatAnexo");
  if (!chatAnexo) { box.hidden = true; box.innerHTML = ""; return; }
  const det = chatAnexo.tipo === "img" ? `${chatAnexo.imgs.length} imagem(ns)` : `${chatAnexo.paginas ? chatAnexo.paginas + " página(s), " : ""}texto lido`;
  box.innerHTML = `<span>Anexo: <strong>${esc(chatAnexo.nome)}</strong> · ${esc(det)}${chatAnexo.paginas > (chatAnexo.tipo === "img" ? 3 : 20) ? " (só as primeiras páginas)" : ""}</span><button type="button" class="ct-b" id="btnAnexoTirar">Retirar</button>`;
  box.hidden = false;
}
$("btnChatAnexar").addEventListener("click", () => $("chatFicheiro").click());
$("chatFicheiro").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) prepararAnexo(f); });
$("chatAnexo").addEventListener("click", (e) => { if (e.target.id === "btnAnexoTirar") { chatAnexo = null; desenharAnexo(); } });
$("mestre").addEventListener("dragover", (e) => { e.preventDefault(); });
$("mestre").addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) prepararAnexo(f); });
$("chatTxt").addEventListener("paste", (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f && f.type.startsWith("image/")) { e.preventDefault(); prepararAnexo(f); } });

/* Ditado por voz (Chrome/Edge) */
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
let ditado = null;
if (!Reconhecimento) $("btnChatDitar").hidden = true;
$("btnChatDitar").addEventListener("click", () => {
  if (ditado) { ditado.stop(); return; }
  ditado = new Reconhecimento(); ditado.lang = "pt-PT"; ditado.continuous = true; ditado.interimResults = true;
  const base = $("chatTxt").value; let final = "";
  ditado.onresult = (ev) => {
    let prov = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) final += t + " "; else prov += t; }
    $("chatTxt").value = (base ? base + " " : "") + final + prov;
  };
  ditado.onerror = (ev) => { $("chatStatus").textContent = ev.error === "not-allowed" ? "Permita o microfone para este site para poder ditar." : "O ditado parou."; $("chatStatus").className = "status err"; };
  ditado.onend = () => { ditado = null; $("btnChatDitar").textContent = "Ditar"; $("btnChatDitar").setAttribute("aria-pressed", "false"); $("btnChatDitar").classList.remove("on"); };
  ditado.start(); $("btnChatDitar").textContent = "A ouvir… parar"; $("btnChatDitar").setAttribute("aria-pressed", "true"); $("btnChatDitar").classList.add("on");
  $("chatStatus").textContent = "Fale normalmente; carregue outra vez para parar."; $("chatStatus").className = "status";
});

async function enviarChat() {
  if (ditado) ditado.stop();
  const txt = $("chatTxt").value.trim() || (chatAnexo ? (chatAnexo.word ? "Revê este ofício antes de seguir para assinatura." : "Resume este documento, diz o que é pedido e propõe um rascunho de resposta.") : ""), st = $("chatStatus");
  if (!txt || chatOcupado) return;
  if (semChave()) { st.textContent = "O MESTRE ainda não está configurado (falta a chave do Groq)."; st.className = "status err"; return; }
  let c = chatConvs.find((x) => x.id === chatAtual);
  if (!c) { c = { id: "n" + Date.now().toString(36), titulo: txt.slice(0, 60), em: new Date().toISOString(), msgs: [] }; chatConvs.unshift(c); chatAtual = c.id; }
  const anexo = chatAnexo; chatAnexo = null; desenharAnexo();
  const mu = { r: "user", t: txt };
  if (anexo) { mu.anexo = anexo.nome; if (anexo.tipo === "doc") mu.doc = anexo.texto; }
  c.msgs.push(mu); c.msgs.push({ r: "assistant", t: "" });
  c.em = new Date().toISOString(); chatConvs = [c, ...chatConvs.filter((x) => x.id !== c.id)];
  $("chatTxt").value = ""; chatOcupado = true; $("mestreHead").classList.add("pensando"); $("btnChatEnviar").disabled = true; st.textContent = "A responder…"; st.className = "status";
  desenharChat();
  const resp = c.msgs[c.msgs.length - 1];
  try {
    const hist = c.msgs.slice(0, -1).slice(-20).map((m) => ({ role: m.r, content: limparPensar(m.t) + (m.doc ? `\n\n[Documento anexado «${m.anexo}»]:\n${m.doc}` : m.anexo ? `\n\n[Foi anexado «${m.anexo}» (imagem)]` : "") }));
    const comImg = anexo && anexo.tipo === "img";
    if (comImg) { const u = hist[hist.length - 1]; u.content = [{ type: "text", text: u.content }, ...anexo.imgs.map((url) => ({ type: "image_url", image_url: { url } }))]; }
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ_API_KEY },
      body: JSON.stringify({ model: comImg ? await escolherModelo() : await modeloTexto(), temperature: 0.15, stream: true, messages: [{ role: "system", content: promptSistema(c.msgs.slice(-4).map((m) => m.t + " " + (m.doc || "").slice(0, 3000)).join(" ")) }, ...hist] }),
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
    resp.t = expandirExtenso(expandirCaucao(limparPensar(resp.t))) || "Não obtive resposta. Tente reformular a pergunta.";
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
/* Enviar para assinatura: cria o Edoc urgente «Ofício por assinar» (o link do Edoc é obrigatório). */
function formAssinar(texto) {
  const o = partesOficio(texto);
  const edoc = ((o.ref || "").match(/[A-Z_]+\/\d{4}\/\d+/i) || [""])[0].toUpperCase();
  const assunto = /^\[/.test(o.assunto) ? "" : o.assunto;
  return `<form class="acao assinar">
    <strong>Enviar para assinatura</strong>
    <span class="muted small">Cria o Edoc urgente na situação «Ofício por assinar» e avisa quem tem as notificações ligadas.</span>
    <label class="f">N.º do Edoc<input type="text" name="edoc" value="${esc(edoc)}" placeholder="Ex.: OD/2026/36597" required></label>
    <label class="f">De que se trata<input type="text" name="assunto" value="${esc(assunto ? "Ofício: " + assunto : "Ofício")}"></label>
    <label class="f">Prioridade<select name="prio"><option value="1">Muito urgente</option><option value="2" selected>Urgente</option><option value="3">Normal</option></select></label>
    <label class="f">Link do Edoc<input type="url" name="link" placeholder="https://edoc.cm-matosinhos.pt/..." required></label>
    <div class="actions"><button class="btn small ghost" type="button" data-fechar-assinar>Cancelar</button><button class="btn small primary" type="submit">Criar «Ofício por assinar»</button></div>
  </form>`;
}
async function submeterAssinar(f, st) {
  const edoc = normEdocTxt(f.edoc.value), link = linkEdoc(f.link.value);
  if (!edoc) { st.textContent = "Indique o n.º do Edoc."; st.className = "status err"; f.edoc.focus(); return false; }
  if (!link) { st.textContent = "Cole o link da página do Edoc (https://edoc.cm-matosinhos.pt/...)."; st.className = "status err"; f.link.focus(); return false; }
  const ja = est.urgentes.find((u) => !u.tratado && u.edoc === edoc);
  try {
    if (ja) await fb.D.update(fb.D.ref(fb.db, `${COL_URGENTES}/${ja.id}`), { situacao: "Ofício por assinar", situacaoEm: new Date().toISOString(), situacaoPor: euNome() || quem(), link: ja.link || link });
    else await fb.D.set(fb.D.push(fb.D.ref(fb.db, COL_URGENTES)), {
      edoc, assunto: f.assunto.value.trim().slice(0, 200), prio: +f.prio.value || 2, nota: "Assinar o ofício", resp: "", prazo: "",
      situacao: "Ofício por assinar", situacaoEm: new Date().toISOString(), link, tratado: false, criadoPor: euNome() || quem(), criadoEm: new Date().toISOString(),
    });
    st.textContent = ja ? `${edoc} já estava nos urgentes: passou para «Ofício por assinar».` : `${edoc} criado como «Ofício por assinar».`; st.className = "status";
    return true;
  } catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; return false; }
}
$("chatMsgs").addEventListener("submit", async (e) => {
  const fl = e.target.closest("form.lembrar");
  if (fl) {
    e.preventDefault();
    const c = chatConvs.find((x) => x.id === chatAtual); const m = c && c.msgs[+fl.dataset.lembrar]; const lb = m && lerLembrar(m.t); if (!lb) return;
    if (await guardarRegra(lb.texto, lb.tema, $("chatStatus"))) { m.lembrado = true; chatGravar(c); desenharChat(); }
    return;
  }
  const fa = e.target.closest("form.assinar");
  if (fa) { e.preventDefault(); if (await submeterAssinar(fa, $("chatStatus"))) fa.outerHTML = `<p class="ok-t small">Enviado para assinatura.</p>`; return; }
  const f = e.target.closest("form.acao"); if (!f) return; e.preventDefault();
  const c = chatConvs.find((x) => x.id === chatAtual); const m = c && c.msgs[+f.dataset.acao]; const ac = m && lerAcao(m.t); if (!ac) return;
  const link = linkEdoc(f.querySelector("input").value), st = $("chatStatus");
  if (!link) { st.textContent = "Cole o link da página do Edoc (https://edoc.cm-matosinhos.pt/...)."; st.className = "status err"; f.querySelector("input").focus(); return; }
  const edoc = normEdocTxt(ac.edoc);
  if (est.urgentes.some((u) => !u.tratado && u.edoc === edoc)) { st.textContent = `O ${edoc} já está na lista de urgentes.`; st.className = "status err"; return; }
  try {
    await fb.D.set(fb.D.push(fb.D.ref(fb.db, COL_URGENTES)), {
      edoc, assunto: String(ac.assunto || "").slice(0, 200), prio: [1, 2, 3].includes(+ac.prio) ? +ac.prio : 2, nota: String(ac.nota || "").slice(0, 300),
      resp: EQUIPA.some((p) => p.nome === ac.resp) ? ac.resp : "", prazo: isoData(ac.prazo) ? ac.prazo : "",
      situacao: SITUACOES.includes(ac.situacao) ? ac.situacao : "Outro", situacaoEm: new Date().toISOString(), link,
      tratado: false, criadoPor: euNome() || quem(), criadoEm: new Date().toISOString(),
    });
    m.feito = true; await chatGravar(c); desenharChat(); st.textContent = `${edoc} adicionado aos Edocs urgentes.`; st.className = "status";
  } catch { st.textContent = "Não consegui guardar. Verifique a internet."; st.className = "status err"; }
});
/* Passar a Word: usa o modelo de ofício da Secretaria (vendor/modelo-oficio.docx), com os campos {{...}} preenchidos. */
const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const iniciais = (n) => String(n || "").split(/\s+/).filter((p) => p && !/^(d[aeo]s?|e)$/i.test(p)).map((p) => p[0].toUpperCase()).filter((c, k, l) => k === 0 || k === l.length - 1).join("") || "[iniciais]";
function partesOficio(texto) {
  const r = { trat: "EXMO.(A) SENHOR(A)", dest: ["[Nome do destinatário]", "[E-mail ou morada]"], ref: "[Referência]", assunto: "[Assunto]", corpo: [] };
  const fecho = /^(com os melhores cumprimentos|a coordenadora|o coordenador|departamento de conservação|cd\/|\(\*\)|pede-se o favor|nota\s*:|modelo usado\s*:)/i;
  for (const l0 of String(texto).replace(/\*\*/g, "").split("\n")) {
    const l = l0.trim(); if (!l) continue;
    let m;
    if ((m = l.match(/^destinat[aá]rio\s*:\s*(.+)$/i))) { const p = m[1].split("|").map((x) => x.trim()).filter(Boolean); if (p.length) { if (/^exm[oa]/i.test(p[0])) r.trat = p.shift().toUpperCase(); if (p.length) r.dest = p; } continue; }
    if ((m = l.match(/^(?:nossa\s+)?refer[eê]ncia\s*:\s*(.+)$/i))) { r.ref = m[1]; continue; }
    if ((m = l.match(/^assunto\s*:\s*(.+)$/i))) { r.assunto = m[1]; continue; }
    if (fecho.test(l)) continue;
    if (!r.corpo.length && /^exm[oa]\.?/i.test(l)) continue; // saudação: no modelo o destinatário vai no cabeçalho
    r.corpo.push(l.replace(/^\s*(?:[-*•])\s+/, "- ").replace(/^#{1,4}\s*/, ""));
  }
  return r;
}
function trocarParagrafo(xml, marca, linhas) {
  const i = xml.indexOf(marca); if (i < 0) return xml;
  const a = xml.lastIndexOf("<w:p ", i), b = xml.indexOf("</w:p>", i) + 6;
  const p = xml.slice(a, b);
  return xml.slice(0, a) + linhas.map((t) => p.replace(marca, xmlEsc(t))).join("") + xml.slice(b);
}
async function passarAWord(texto) {
  if (!window.JSZip) throw new Error("sem JSZip");
  const zip = await JSZip.loadAsync(await (await fetch("vendor/modelo-oficio.docx")).arrayBuffer());
  let x = await zip.file("word/document.xml").async("string");
  const o = partesOficio(texto);
  const dest = o.dest.length > 1 ? o.dest : [o.dest[0], ""];
  x = trocarParagrafo(x, "{{DEST1}}", dest.slice(0, -1));
  x = x.replace("{{DEST2}}", xmlEsc(dest[dest.length - 1]));
  x = x.replace("{{TRAT}}", xmlEsc(o.trat)).replace("{{REF}}", xmlEsc(o.ref)).replace("{{DATA}}", xmlEsc(new Date().toLocaleDateString("pt-PT")))
    .replace("{{ASSUNTO}}", xmlEsc(o.assunto)).replace("{{INI}}", xmlEsc(iniciais(euNome())));
  x = trocarParagrafo(x, "{{CORPO}}", o.corpo.length ? o.corpo : ["[Texto do ofício]"]);
  zip.file("word/document.xml", x);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const nome = `Oficio_${(o.ref.match(/[A-Z_]+\/\d{4}\/\d+/) || [new Date().toISOString().slice(0, 10)])[0].replace(/\//g, "-")}.docx`;
  const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = nome; el.click();
  setTimeout(() => URL.revokeObjectURL(el.href), 5000);
}
$("chatMsgs").addEventListener("click", async (e) => {
  if (e.target.closest("[data-fechar-assinar]")) { e.target.closest("form.assinar").remove(); return; }
  const as = e.target.closest("[data-assinar]");
  if (as) {
    const c = chatConvs.find((x) => x.id === chatAtual); const m = c && c.msgs[+as.dataset.assinar]; if (!m) return;
    const box = $("chatMsgs").querySelector(`[data-box="${as.dataset.assinar}"]`); if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = formAssinar(semAcao(m.t)); box.querySelector('[name="link"]').focus(); return;
  }
  const w = e.target.closest("[data-word]");
  if (w) {
    const c = chatConvs.find((x) => x.id === chatAtual); const m = c && c.msgs[+w.dataset.word]; if (!m) return;
    w.disabled = true; w.textContent = "A preparar…";
    try { await passarAWord(semAcao(m.t)); w.textContent = "Word descarregado"; }
    catch { $("chatStatus").textContent = "Não consegui gerar o Word."; $("chatStatus").className = "status err"; w.textContent = "Passar a Word"; }
    setTimeout(() => { w.disabled = false; w.textContent = "Passar a Word"; }, 2500);
    return;
  }
  const b = e.target.closest("[data-copiar]"); if (!b) return;
  const c = chatConvs.find((x) => x.id === chatAtual); const m = c && c.msgs[+b.dataset.copiar]; if (!m) return;
  try { await navigator.clipboard.writeText(semAcao(m.t)); b.textContent = "Copiado"; setTimeout(() => (b.textContent = "Copiar"), 1500); } catch {}
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

/* MESTRE em ecrã grande (fica lembrado neste computador) */
function mestreGrande(on) {
  $("mestre").classList.toggle("grande", on);
  $("btnMestreGrande").setAttribute("aria-pressed", String(on));
  $("btnMestreGrande").textContent = on ? "Ecrã pequeno" : "Ecrã grande";
  try { localStorage.setItem("kz-mestre-grande", on ? "1" : ""); } catch {}
  const m = $("chatMsgs"); m.scrollTop = m.scrollHeight;
}
$("btnMestreGrande").addEventListener("click", () => mestreGrande(!$("mestre").classList.contains("grande")));
try { if (localStorage.getItem("kz-mestre-grande")) mestreGrande(true); } catch {}

/* ---------------- Do Edoc ao ofício ---------------- */
let eoModeloUsado = "";
function desenharEoModelos(sel = "") {
  const grupos = [...new Set(MODELOS_OFICIO.map((m) => m.g))];
  $("eoModelo").innerHTML = `<option value="">Escolher automaticamente pelo relatório</option>` + grupos.map((g) => `<optgroup label="${esc(g)}">${MODELOS_OFICIO.map((m, i) => m.g !== g ? "" : `<option value="${i}"${String(i) === String(sel) ? " selected" : ""}>${esc(m.t)}</option>`).join("")}</optgroup>`).join("");
}
desenharEoModelos();
async function textoDeFicheiro(f) {
  if (f.size > 15 * 1024 * 1024) throw new Error("grande");
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
    const lib = await carregarPdfjs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    let t = "";
    for (let p = 1; p <= Math.min(pdf.numPages, 20); p++) { const pg = await pdf.getPage(p); const tc = await pg.getTextContent(); t += tc.items.map((i) => i.str).join(" ") + "\n\n"; }
    return t.replace(/[ \t]+/g, " ").trim();
  }
  if (/\.docx$/i.test(f.name)) {
    const z = await JSZip.loadAsync(await f.arrayBuffer());
    const x = await z.file("word/document.xml").async("string");
    return x.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
  }
  return (await f.text()).trim();
}
const eoMsg = (id, t, err) => { $(id).textContent = t; $(id).className = "status" + (err ? " err" : ""); };
$("btnEoAnexar").addEventListener("click", () => $("eoFicheiro").click());
$("eoFicheiro").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  eoMsg("eoStatus", `A ler «${f.name}»…`);
  try {
    const t = await textoDeFicheiro(f);
    if (t.length < 80) { eoMsg("eoStatus", "Este PDF parece digitalizado (sem texto). Copie o texto do relatório no Edoc e cole-o aqui.", true); return; }
    $("eoRel").value = t.slice(0, 15000); $("eoAnexo").textContent = f.name; eoMsg("eoStatus", "");
  } catch (err) { eoMsg("eoStatus", err.message === "grande" ? "Ficheiro demasiado grande (máximo 15 MB)." : "Não consegui ler esse ficheiro.", true); }
});
function camposPorPreencher(t) { return [...new Set((t.match(/\[[^\]\n]{2,80}\]/g) || []).filter((c) => !/^\[\[/.test(c)))]; }
function desenharEoInfo() {
  const t = $("eoTexto").value, falta = camposPorPreencher(t);
  $("eoInfo").innerHTML = `<p><strong>Modelo:</strong> ${esc(eoModeloUsado)}</p>` + (falta.length
    ? `<p class="eo-falta"><strong>${falta.length} campo${falta.length > 1 ? "s" : ""} por preencher:</strong> ${falta.map((c) => `<span class="eo-c">${esc(c)}</span>`).join(" ")}</p>`
    : `<p class="eo-ok">Todos os campos preenchidos. Reveja o texto antes de enviar.</p>`);
}
$("eoTexto").addEventListener("input", () => desenharEoInfo());
$("btnEoPreencher").addEventListener("click", async () => {
  const rel = $("eoRel").value.trim(), b = $("btnEoPreencher");
  if (rel.length < 80) { eoMsg("eoStatus", "Cole primeiro o relatório detalhado do Edoc (ou anexe o PDF).", true); $("eoRel").focus(); return; }
  if (semChave()) { eoMsg("eoStatus", "O MESTRE ainda não está configurado (falta a chave do Groq).", true); return; }
  let m = $("eoModelo").value !== "" ? MODELOS_OFICIO[+$("eoModelo").value] : modelosRelevantes(rel, 1)[0];
  if (!m) { eoMsg("eoStatus", "Não consegui perceber o tipo de ofício pelo relatório. Escolha o modelo na lista.", true); $("eoModelo").focus(); return; }
  eoModeloUsado = m.t + ($("eoModelo").value === "" ? " (escolhido automaticamente)" : "");
  b.disabled = true; eoMsg("eoStatus", `A preencher «${m.t}»…`);
  const pedido = `Faz o ofício com o modelo «${m.t}» a partir deste relatório detalhado do Edoc.
Copia o modelo abaixo palavra a palavra e substitui apenas os campos entre [ ] pelos dados do relatório. O que o relatório não disser fica entre [ ]. Responde só com o ofício (as três linhas iniciais e o corpo) e, no fim, a linha «Nota:».

MODELO «${m.t}»:
${m.x}

RELATÓRIO DETALHADO DO EDOC:
${rel.slice(0, 12000)}`;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ_API_KEY },
      body: JSON.stringify({ model: await modeloTexto(), temperature: 0.05, messages: [{ role: "system", content: promptSistema(m.t + " " + rel.slice(0, 3000)) }, { role: "user", content: pedido }] }),
    });
    if (!r.ok) throw new Error("groq " + r.status);
    const j = await r.json();
    let t = expandirExtenso(expandirCaucao(limparPensar(j.choices?.[0]?.message?.content || "")));
    if (!t) throw new Error("vazio");
    $("eoTexto").value = t; $("eoRes").hidden = false; $("eoAssinar").innerHTML = ""; desenharEoInfo(); eoMsg("eoStatus", ""); eoMsg("eoStatus2", "");
    $("eoRes").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    eoMsg("eoStatus", String(e.message).includes("429") ? "Limite de pedidos do Groq atingido; aguarde um minuto." : "Não consegui contactar o MESTRE. Verifique a internet e tente outra vez.", true);
  }
  b.disabled = false;
});
$("btnEoCopiar").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("eoTexto").value); eoMsg("eoStatus2", "Texto copiado."); }
  catch { $("eoTexto").select(); eoMsg("eoStatus2", "Selecionei o texto: use Ctrl+C para copiar."); }
});
$("btnEoWord").addEventListener("click", async () => {
  try { await passarAWord($("eoTexto").value); eoMsg("eoStatus2", "Word descarregado: reveja os campos entre [ ]."); } catch { eoMsg("eoStatus2", "Não consegui gerar o Word.", true); }
});
$("btnEoAssinar").addEventListener("click", () => {
  const box = $("eoAssinar"); if (box.innerHTML) { box.innerHTML = ""; return; }
  box.innerHTML = formAssinar($("eoTexto").value); box.querySelector('[name="link"]').focus();
});
$("eoAssinar").addEventListener("click", (e) => { if (e.target.closest("[data-fechar-assinar]")) $("eoAssinar").innerHTML = ""; });
$("eoAssinar").addEventListener("submit", async (e) => {
  const f = e.target.closest("form.assinar"); if (!f) return; e.preventDefault();
  if (await submeterAssinar(f, $("eoStatus2"))) $("eoAssinar").innerHTML = "";
});
function abrirEdocOficio(titulo) {
  const i = MODELOS_OFICIO.findIndex((m) => m.t === titulo);
  desenharEoModelos(i >= 0 ? i : "");
  $("eoSec").open = true; mostrar("vOficios");
  setTimeout(() => { $("eoSec").scrollIntoView({ behavior: "smooth", block: "start" }); $("eoRel").focus({ preventScroll: true }); }, 50);
}

/* ---------------- Manual da Secretaria ---------------- */
est.manualBD = est.manualBD || [];
let manArea = "", manEditar = null;
function manualLista() {
  const bd = Object.fromEntries((est.manualBD || []).map((r) => [r.id, r]));
  const base = MANUAL_BASE.filter((m) => !(bd[m.id] && bd[m.id].apagado)).map((m) => (bd[m.id] && bd[m.id].titulo ? { ...m, ...bd[m.id], base: true, editado: true } : { ...m, base: true }));
  const novos = (est.manualBD || []).filter((r) => !r.id.startsWith("base-") && !r.apagado && r.titulo);
  return [...base, ...novos];
}
function manualPrompt(pedido) {
  const r = procedimentosRelevantes(manualLista(), pedido, 2);
  return r.map((m) => `«${m.titulo}» (${m.area})\nQuando: ${m.quando || "-"}\nPassos:\n${(m.passos || []).map((p, i) => `${i + 1}. ${p}`).join("\n")}${m.prazos ? "\nPrazos: " + m.prazos : ""}${m.legislacao ? "\nLegislação: " + m.legislacao : ""}${(m.modelos || []).length ? "\nModelos: " + m.modelos.join("; ") : ""}${m.notas ? "\nNotas: " + m.notas : ""}`).join("\n\n").slice(0, 3500);
}
const semAcento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function desenharManual() {
  if (!$("manLista")) return;
  const todos = manualLista(), q = semAcento($("manQ").value.trim());
  const areas = [...new Set(todos.map((m) => m.area))];
  $("manAreas").innerHTML = [["", "Todos"], ...areas.map((a) => [a, a])].map(([v, t]) => `<button type="button" class="fchip${v === manArea ? " on" : ""}" data-area="${esc(v)}" aria-pressed="${v === manArea}">${esc(t)} <span class="muted">${v ? todos.filter((m) => m.area === v).length : todos.length}</span></button>`).join("");
  const lista = todos.filter((m) => (!manArea || m.area === manArea) && (!q || semAcento([m.titulo, m.quando, ...(m.passos || []), m.legislacao, ...(m.p || [])].join(" ")).includes(q)));
  $("manSub").textContent = `${todos.length} procedimentos`;
  $("manLista").innerHTML = lista.length ? lista.map((m) => `<details class="man-item" data-id="${esc(m.id)}">
    <summary><span class="man-t">${esc(m.titulo)}</span><span class="man-a">${esc(m.area)}</span></summary>
    <div class="man-corpo">
      ${m.quando ? `<p class="man-q">${esc(m.quando)}</p>` : ""}
      <h4>Passos</h4><ol class="man-passos">${(m.passos || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
      ${m.prazos ? `<h4>Prazos</h4><p>${esc(m.prazos)}</p>` : ""}
      ${m.legislacao ? `<h4>Legislação</h4><p>${esc(m.legislacao)}</p>` : ""}
      ${m.notas ? `<h4>Notas</h4><p>${esc(m.notas)}</p>` : ""}
      ${(m.modelos || []).length ? `<h4>Modelos de ofício</h4><div class="man-mods">${m.modelos.map((t) => `<button type="button" class="ct-b" data-man-mod="${esc(t)}" title="Abrir em Do Edoc ao ofício">${esc(t)}</button>`).join("")}</div>` : ""}
      <div class="man-acoes">
        <span class="muted small">${m.editadoEm ? `Atualizado por ${esc(m.editadoPor || "?")} em ${esc(quando(m.editadoEm))}` : "Versão inicial do manual"}</span>
        <button type="button" class="ct-b" data-man-perg="${esc(m.id)}">Perguntar ao MESTRE</button>
        <button type="button" class="ct-b" data-man-edit="${esc(m.id)}">Editar</button>
        ${m.editado ? `<button type="button" class="ct-b" data-man-repor="${esc(m.id)}">Repor original</button>` : ""}
        ${!m.base ? `<button type="button" class="ct-b" data-man-rm="${esc(m.id)}">Apagar</button>` : ""}
      </div>
    </div></details>`).join("") : `<p class="muted">Nenhum procedimento encontrado.</p>`;
}
$("manQ").addEventListener("input", desenharManual);
$("manAreas").addEventListener("click", (e) => { const b = e.target.closest("[data-area]"); if (!b) return; manArea = b.dataset.area; desenharManual(); });
function abrirManForm(m) {
  manEditar = m ? m.id : null;
  $("manFormT").textContent = m ? "Editar procedimento" : "Novo procedimento";
  $("mfArea").innerHTML = AREAS_MANUAL.map((a) => `<option${m && m.area === a ? " selected" : ""}>${esc(a)}</option>`).join("");
  $("mfTitulo").value = m ? m.titulo : ""; $("mfQuando").value = m ? m.quando || "" : "";
  $("mfPassos").value = m ? (m.passos || []).join("\n") : ""; $("mfPrazos").value = m ? m.prazos || "" : "";
  $("mfLeg").value = m ? m.legislacao || "" : ""; $("mfNotas").value = m ? m.notas || "" : "";
  const sel = new Set(m ? m.modelos || [] : []);
  $("mfMods").innerHTML = MODELOS_OFICIO.map((x) => `<label class="mf-chk"><input type="checkbox" value="${esc(x.t)}"${sel.has(x.t) ? " checked" : ""}> ${esc(x.t)}</label>`).join("");
  $("manForm").hidden = false; $("manForm").scrollIntoView({ behavior: "smooth", block: "start" }); $("mfTitulo").focus({ preventScroll: true });
}
$("btnManNovo").addEventListener("click", () => abrirManForm(null));
$("btnManCancelar").addEventListener("click", () => { $("manForm").hidden = true; manEditar = null; });
const manMsg = (t, err) => { $("manStatus").textContent = t; $("manStatus").className = "status" + (err ? " err" : ""); };
$("manForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const passos = $("mfPassos").value.split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean).slice(0, 30);
  if (!$("mfTitulo").value.trim() || !passos.length) { manMsg("Indique o título e pelo menos um passo.", true); return; }
  const atual = manEditar ? manualLista().find((m) => m.id === manEditar) : null;
  const dados = { titulo: $("mfTitulo").value.trim().slice(0, 120), area: $("mfArea").value, quando: $("mfQuando").value.trim().slice(0, 400), passos,
    prazos: $("mfPrazos").value.trim().slice(0, 600), legislacao: $("mfLeg").value.trim().slice(0, 600), notas: $("mfNotas").value.trim().slice(0, 600),
    modelos: [...$("mfMods").querySelectorAll("input:checked")].map((i) => i.value), p: atual ? atual.p || [] : [],
    editadoPor: euNome() || quem(), editadoEm: new Date().toISOString() };
  try {
    if (manEditar) await fb.D.set(fb.D.ref(fb.db, `${COL_MANUAL}/${manEditar}`), dados);
    else await fb.D.set(fb.D.push(fb.D.ref(fb.db, COL_MANUAL)), { ...dados, criadoPor: dados.editadoPor, criadoEm: dados.editadoEm });
    $("manForm").hidden = true; manEditar = null; manMsg("Procedimento guardado.");
  } catch { manMsg("Não consegui guardar. Verifique a internet.", true); }
});
$("manLista").addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const lista = manualLista();
  if (b.dataset.manMod) return abrirEdocOficio(b.dataset.manMod);
  if (b.dataset.manEdit) return abrirManForm(lista.find((m) => m.id === b.dataset.manEdit));
  if (b.dataset.manPerg) { const m = lista.find((x) => x.id === b.dataset.manPerg); abrirAssistente(); $("chatTxt").value = `Tenho um caso de «${m.titulo}». `; $("chatTxt").focus(); return; }
  const id = b.dataset.manRepor || b.dataset.manRm; if (!id) return;
  if (b.dataset.ok !== "1") { const t = b.textContent; b.dataset.ok = "1"; b.textContent = "Confirmar"; setTimeout(() => { b.dataset.ok = ""; b.textContent = t; }, 4000); return; }
  try { await fb.D.remove(fb.D.ref(fb.db, `${COL_MANUAL}/${id}`)); manMsg(b.dataset.manRepor ? "Reposta a versão original." : "Procedimento apagado."); } catch { manMsg("Não consegui guardar. Verifique a internet.", true); }
});
$("btnManual").addEventListener("click", () => { manMsg(""); desenharManual(); mostrar("vManual"); });
desenharManual();
