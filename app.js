import { GROQ_API_KEY, FIREBASE_CONFIG, COL_REUNIOES, COL_FOTOS } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const COLS = ["A fazer", "Em curso", "Pendente", "Concluído"];
const COL_CORES = ["#1f4e79", "#3f7cb8", "#c48a1a", "#2e8b57"];
const MODELOS_VISAO = ["qwen/qwen3.8-27b", "qwen/qwen3.6-27b", "meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const isoData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const fmt = (s) => { if (!isoData(s)) return s || ""; const [a, m, d] = s.split("-"); return `${d}/${m}/${a}`; };
const semanaISO = (s) => { const d = new Date(s + "T12:00:00"); if (isNaN(d)) return ""; d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7); };
const colIdx = (c) => Math.max(0, COLS.indexOf(c));
const emAtraso = (t, ref) => t.coluna !== "Concluído" && isoData(t.prazo) && t.prazo < ref;

const est = { user: null, reunioes: [], selId: null, editId: null, foto: null, fotoUrl: null, linhas: [], stream: null };
let fb = null; // { db, auth, mod }

/* ---------------- Vistas ---------------- */
function mostrar(v) {
  for (const id of ["vLogin", "vConfig", "vPainel", "vRegistar"]) $(id).hidden = id !== v;
  $("fab").hidden = v !== "vPainel";
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
    mostrar("vPainel");
    subscrever();
  });
}
function msgErroLogin(e) {
  const c = e && e.code || "";
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
    est.reunioes = Object.keys(v).map((id) => ({ id, ...v[id], tarefas: Object.values(v[id].tarefas || {}) }))
      .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    if (est.selId && !est.reunioes.some((r) => r.id === est.selId)) est.selId = null;
    desenhar();
  }, (e) => {
    $("board").innerHTML = `<div class="empty">${String(e.code || e.message).includes("permission") ? "Sem permissão para ler as reuniões. Confirme as regras da base de dados." : "Não consegui ligar aos dados. Verifique a internet."}</div>`;
  });
}

/* ---------------- Painel ---------------- */
const selecionada = () => est.reunioes.find((r) => r.id === est.selId) || est.reunioes[0] || null;

function desenhar() {
  const r = selecionada();
  if (r) est.selId = r.id;
  const ts = r ? r.tarefas || [] : [];
  const ref = hoje();
  $("tAbertas").textContent = ts.filter((t) => t.coluna !== "Concluído").length;
  $("tAtraso").textContent = ts.filter((t) => emAtraso(t, ref)).length;
  $("tFeitas").textContent = ts.filter((t) => t.coluna === "Concluído").length;
  $("tReunioes").textContent = est.reunioes.length;
  $("boardTitle").textContent = r ? `Reunião de ${fmt(r.data)}${r.semana ? " · semana " + r.semana : ""}` : "Ainda não há reuniões";
  $("btnEditar").hidden = $("btnApagar").hidden = !r;

  $("board").innerHTML = COLS.map((c, ci) => {
    const lista = ts.filter((t) => colIdx(t.coluna) === ci);
    return `<div class="col"><div class="col-h" style="border-bottom-color:${COL_CORES[ci]}"><span>${esc(c)}</span><span class="c">${lista.length}</span></div><div class="col-b">${
      lista.length ? lista.map((t) => {
        const at = emAtraso(t, ref);
        return `<div class="card"><div class="t">${esc(t.tarefa)}</div><div class="meta">${t.responsavel ? `<span class="chip">${esc(t.responsavel)}</span>` : `<span class="chip none">sem responsável</span>`}${t.prazo ? `<span class="chip ${at ? "late" : t.coluna === "Concluído" ? "ok" : ""}">${at ? "Atrasada · " : "Até "}${esc(fmt(t.prazo))}</span>` : ""}</div></div>`;
      }).join("") : `<div class="empty">${r ? "Sem post-its" : "Toque em «Registar reunião» depois da reunião."}</div>`
    }</div></div>`;
  }).join("");

  $("extra").innerHTML = r ? `${r.temFoto ? `<details id="fotoDet"><summary>Ver a foto original do quadro</summary><div id="fotoBox" class="status">A carregar…</div></details>` : ""}${r.notas ? `<p><strong>Notas:</strong> ${esc(r.notas)}</p>` : ""}` : "";
  const det = $("fotoDet");
  if (det) det.addEventListener("toggle", () => { if (det.open) carregarFoto(r.id); }, { once: true });

  const mapa = {};
  ts.forEach((t) => { const k = (t.responsavel || "").trim() || "Sem responsável"; const m = (mapa[k] ||= { a: 0, l: 0, c: 0 }); t.coluna === "Concluído" ? m.c++ : m.a++; if (emAtraso(t, ref)) m.l++; });
  const nomes = Object.keys(mapa).sort((a, b) => mapa[b].a - mapa[a].a || a.localeCompare(b, "pt"));
  $("respTable").tBodies[0].innerHTML = nomes.length ? nomes.map((n) => `<tr><td>${esc(n)}</td><td class="num">${mapa[n].a}</td><td class="num"${mapa[n].l ? ' style="color:var(--late);font-weight:700"' : ""}>${mapa[n].l}</td><td class="num">${mapa[n].c}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">Sem dados.</td></tr>`;

  $("legend").innerHTML = COLS.map((c, i) => `<span><i style="background:${COL_CORES[i]}"></i>${esc(c)}</span>`).join("");
  $("histTable").tBodies[0].innerHTML = est.reunioes.length ? est.reunioes.map((m) => {
    const t = m.tarefas || [], tot = t.length || 1;
    const barra = COLS.map((c, i) => { const n = t.filter((x) => colIdx(x.coluna) === i).length; return n ? `<span title="${esc(c)}: ${n}" style="width:${(n / tot) * 100}%;background:${COL_CORES[i]}"></span>` : ""; }).join("");
    return `<tr class="hist-row${m.id === est.selId ? " sel" : ""}" data-id="${esc(m.id)}" tabindex="0"><td>${esc(fmt(m.data))}</td><td>${esc(m.semana ?? "")}</td><td class="num">${t.length}</td><td><div class="minibar">${barra}</div></td></tr>`;
  }).join("") : `<tr><td colspan="4" class="empty">Sem reuniões registadas.</td></tr>`;
}

async function carregarFoto(id) {
  const box = $("fotoBox"); if (!box) return;
  try {
    const d = await fb.D.get(fb.D.ref(fb.db, COL_FOTOS + "/" + id));
    const img = d.exists() ? String(d.val().img || "") : "";
    box.outerHTML = img.startsWith("data:image/") ? `<img class="photo" src="${esc(img)}" alt="Foto do quadro de post-its">` : `<p class="status">Foto não encontrada.</p>`;
  } catch { box.textContent = "Não consegui carregar a foto."; }
}

$("histTable").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) { est.selId = tr.dataset.id; esconderConfirm(); desenhar(); window.scrollTo({ top: 0, behavior: "smooth" }); } });
$("histTable").addEventListener("keydown", (e) => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-id]"); if (tr) { est.selId = tr.dataset.id; desenhar(); } } });

function esconderConfirm() { $("confirmBox").hidden = true; $("confirmBox").innerHTML = ""; }
$("btnApagar").addEventListener("click", () => {
  const r = selecionada(); if (!r) return;
  const box = $("confirmBox"); box.hidden = false;
  box.innerHTML = `<div class="confirm"><span>Apagar a reunião de <strong>${esc(fmt(r.data))}</strong> e as ${(r.tarefas || []).length} tarefas? Não dá para desfazer.</span><button class="btn small danger" id="cSim" type="button">Apagar</button><button class="btn small" id="cNao" type="button">Cancelar</button></div>`;
  $("cNao").onclick = esconderConfirm;
  $("cSim").onclick = async () => {
    try { await fb.D.remove(fb.D.ref(fb.db, COL_REUNIOES + "/" + r.id)); await fb.D.remove(fb.D.ref(fb.db, COL_FOTOS + "/" + r.id)).catch(() => {}); est.selId = null; esconderConfirm(); }
    catch { box.innerHTML = `<div class="confirm">Não consegui apagar. Verifique a ligação e as permissões.</div>`; }
  };
});

/* ---------------- Registar / editar ---------------- */
function abrirRegisto(r) {
  est.editId = r ? r.id : null;
  est.foto = null;
  $("regTitle").textContent = r ? "Editar reunião" : "Registar reunião";
  $("fData").value = r ? r.data : hoje();
  $("fSemana").value = r ? r.semana ?? "" : semanaISO(hoje());
  $("fNotas").value = r ? r.notas || "" : "";
  est.linhas = r ? (r.tarefas || []).map((t) => ({ ...t })) : [];
  $("shot").hidden = true; $("video").hidden = true;
  $("btnCamera").hidden = false; $("btnTirar").hidden = true; $("btnRepetir").hidden = true;
  $("readStatus").textContent = GROQ_API_KEY.startsWith("__") ? "A leitura automática ainda não está configurada (falta a chave do Groq). Pode escrever as tarefas à mão." : "";
  $("readStatus").className = "status";
  $("saveStatus").textContent = "";
  desenharLinhas();
  mostrar("vRegistar");
}
$("fab").addEventListener("click", () => abrirRegisto(null));
$("btnEditar").addEventListener("click", () => { const r = selecionada(); if (r) abrirRegisto(r); });
$("btnVoltar").addEventListener("click", () => mostrar("vPainel"));
$("fData").addEventListener("change", () => { if (!est.editId) $("fSemana").value = semanaISO($("fData").value); });

function desenharLinhas() {
  const box = $("rows");
  if (!est.linhas.length) { box.innerHTML = `<p class="empty">Sem tarefas ainda. Tire a foto ao quadro ou acrescente à mão.</p>`; return; }
  box.innerHTML = est.linhas.map((t, i) => `<div class="task" data-i="${i}">
    <select id="c${i}" aria-label="Coluna da tarefa ${i + 1}">${COLS.map((c) => `<option${c === t.coluna ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>
    <input class="tk" type="text" id="t${i}" aria-label="Tarefa ${i + 1}" placeholder="O que fazer" value="${esc(t.tarefa)}">
    <input type="text" id="r${i}" aria-label="Responsável da tarefa ${i + 1}" placeholder="Responsável" value="${esc(t.responsavel)}">
    <input type="date" id="p${i}" aria-label="Prazo da tarefa ${i + 1}" value="${isoData(t.prazo) ? t.prazo : ""}">
    <button class="btn small danger del" type="button" data-del="${i}" aria-label="Remover tarefa ${i + 1}">✕</button></div>`).join("");
}
function lerLinhas() {
  est.linhas = est.linhas.map((t, i) => ({ coluna: $("c" + i)?.value ?? t.coluna, tarefa: ($("t" + i)?.value ?? t.tarefa).trim(), responsavel: ($("r" + i)?.value ?? t.responsavel).trim(), prazo: $("p" + i)?.value ?? t.prazo }));
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
    est.foto = await reduzir(blob, 1000, 0.6); // guardada no Realtime Database junto da reunião
    const s = $("shot"); s.src = grande; s.hidden = false; $("video").hidden = true;
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
async function lerPostits(dataUrl) {
  if (GROQ_API_KEY.startsWith("__") || !GROQ_API_KEY) return;
  const st = $("readStatus"); st.className = "status"; st.textContent = "A ler os post-its… (uns segundos)";
  const dataRef = $("fData").value || hoje();
  const prompt = `Transcreve um quadro Kaizen de post-its de uma equipa de secretaria de uma câmara municipal portuguesa.
O quadro tem 4 colunas: "A fazer", "Em curso", "Pendente", "Concluído". Cada post-it é uma tarefa, normalmente com: o quê, quem (responsável) e até quando (prazo).
Transcreve TODOS os post-its legíveis e indica a coluna onde cada um está colado.
A reunião foi a ${dataRef}. Converte prazos escritos à mão (ex.: "20/11", "sexta", "fim do mês") para AAAA-MM-DD a partir dessa data; sem prazo claro usa "".
Não inventes: palavras ilegíveis ficam [?]. Corrige só erros de ortografia óbvios.
Responde APENAS com JSON: {"tarefas":[{"coluna":"A fazer|Em curso|Pendente|Concluído","tarefa":"texto","responsavel":"nome ou vazio","prazo":"AAAA-MM-DD ou vazio"}]}`;
  try {
    const modelo = await escolherModelo();
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ_API_KEY },
      body: JSON.stringify({ model: modelo, temperature: 0.1, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }] })
    });
    if (!r.ok) throw new Error("groq " + r.status);
    const j = await r.json();
    const v = extrairJSON(j.choices?.[0]?.message?.content || "");
    const novos = (Array.isArray(v.tarefas) ? v.tarefas : []).filter((t) => t && t.tarefa).map((t) => ({
      coluna: COLS.includes(t.coluna) ? t.coluna : "A fazer", tarefa: String(t.tarefa).trim(), responsavel: String(t.responsavel || "").trim(), prazo: isoData(t.prazo) ? t.prazo : ""
    }));
    lerLinhas();
    est.linhas = est.linhas.filter((t) => t.tarefa).concat(novos);
    desenharLinhas();
    st.textContent = novos.length ? `Li ${novos.length} post-its. Confirme a lista e corrija o que for preciso.` : "Não consegui ler post-its. Tire outra foto mais de frente e com mais luz, ou escreva à mão.";
    st.className = novos.length ? "status" : "status err";
  } catch (e) {
    st.className = "status err";
    st.textContent = String(e.message).includes("429") ? "Muitos pedidos seguidos à IA. Espere um minuto e tente outra vez (Repetir foto)." : "A leitura falhou. Tente outra vez ou escreva as tarefas à mão.";
  }
}

/* ---------------- Guardar ---------------- */
$("btnGuardar").addEventListener("click", async () => {
  lerLinhas();
  const st = $("saveStatus"), btn = $("btnGuardar");
  const data = $("fData").value;
  if (!data) { st.textContent = "Indique a data da reunião."; st.className = "status err"; return; }
  const tarefas = est.linhas.filter((t) => t.tarefa);
  btn.disabled = true; st.className = "status"; st.textContent = "A guardar…";
  try {
    const { D, db } = fb;
    const ref = est.editId ? D.ref(db, COL_REUNIOES + "/" + est.editId) : D.push(D.ref(db, COL_REUNIOES));
    const ant = est.reunioes.find((r) => r.id === est.editId);
    const agora = new Date().toISOString();
    await D.set(ref, {
      data, semana: $("fSemana").value ? Number($("fSemana").value) : null, notas: $("fNotas").value.trim(), tarefas,
      temFoto: !!est.foto || !!(ant && ant.temFoto),
      criadoPor: ant?.criadoPor || est.user.email || "", criadoEm: ant?.criadoEm || agora,
      atualizadoPor: est.user.email || "", atualizadoEm: agora
    });
    if (est.foto) await D.set(D.ref(db, COL_FOTOS + "/" + ref.key), { img: est.foto });
    est.selId = ref.key;
    mostrar("vPainel");
  } catch (e) {
    st.className = "status err";
    st.textContent = String(e.code || e.message).includes("permission") ? "Sem permissão para guardar. Confirme as regras da base de dados." : "Não consegui guardar. Verifique a internet e tente outra vez.";
  } finally { btn.disabled = false; }
});

iniciarFirebase().catch(() => { mostrar("vConfig"); });
