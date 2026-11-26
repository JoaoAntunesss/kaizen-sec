// Painéis dos mapas Excel (Empreitadas e Fornecimentos): leitura das folhas e indicadores.
// Os dados vêm do Excel que cada pessoa carrega na app e ficam só na base de dados (nunca no código).

export const ANO_INICIO = 2024;

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// «19 090,58 €», «19090.58», «1.234,5» → número
export function numero(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/[€\s ]/g, "");
  if (!s || s === "-") return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Série do Excel (45371), «12/03/2024», «2024-03-12» → «2024-03-12». Datas antes de 2000 são restos de fórmulas sem dados.
export function data(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  let d = null;
  if (/^\d+(\.\d+)?$/.test(s)) { const n = +s; if (n > 36526 && n < 80000) d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5); }
  else if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.slice(0, 10) + "T00:00:00Z");
  else { const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) d = new Date(Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1])); }
  if (!d || isNaN(d) || d.getUTCFullYear() < 2000) return "";
  return d.toISOString().slice(0, 10);
}

const anoFolha = (nome) => { const m = String(nome).trim().match(/^(?:DC\s*)?(20\d\d)$/i); return m ? +m[1] : 0; };

// Que mapa é este Excel?
export function tipoMapa(folhas) {
  const cab = folhas.flatMap((f) => f.rows.slice(0, 12)).flat().map(norm).join("|");
  if (/diretor de fiscalizacao|n\.o de obra|auto de rp/.test(cab)) return "empreitadas";
  if (/tipo de procedimento|total faturado|por faturar/.test(cab)) return "fornecimentos";
  return "";
}

function estadoCod(s) {
  const t = norm(s);
  if (!t) return "";
  if (/cancel|anulad|sem efeito/.test(t)) return "canc";
  if (/suspens/.test(t)) return "susp";
  if (/conclu|terminad|finaliz/.test(t)) return "conc";
  if (/execu|curso|a decorrer/.test(t)) return "exec";
  return "outro";
}

const COLS = {
  empreitadas: {
    edoc: /^edoc$/, div: /^divisao/, obra: /^n\.o de obra/, des: /^designacao/, gestor: /^gestor/, fisc: /fiscalizacao/, adj: /^adjudicatario/,
    dCont: /data da contratualizacao/, valor: /valor s\/ ?iva/, valorIva: /valor c\/ ?iva/, prazo: /^prazo/, cons: /^consignacao/, concl: /^conclusao/,
    estado: /ponto de situacao/, obs: /^observac/, rp: /auto de rp/, a1: /auto do 1/, e1: /edoc da 1/, a2: /auto do 2/, e2: /edoc da 2/, a3: /auto do 3/, e3: /edoc da 3/,
    a4: /auto do 4/, e4: /edoc da 4/, a5: /auto do 5/, e5: /edoc da 5/, rd: /auto de rd/, eRd: /edoc da rd/,
  },
  fornecimentos: {
    edoc: /^edoc$/, div: /^divisao/, des: /^designacao/, gestor: /^gestor/, adj: /^adjudicatario/, proc: /tipo de procedimento/, dCont: /data da contratualizacao/,
    valor: /^valor/, prazo: /^prazo/, ini: /^inicio/, concl: /^conclusao/, estado: /^estado$/, ponto: /ponto de situacao/, fat: /total faturado/, porFat: /por faturar/,
  },
};
const DATAS = new Set(["dCont", "cons", "concl", "rp", "a1", "a2", "a3", "a4", "a5", "rd", "ini"]);
const NUMS = new Set(["valor", "valorIva", "prazo", "fat", "porFat"]);

// Lê as folhas anuais (a partir de ANO_INICIO) e devolve as linhas normalizadas.
export function lerMapa(folhas, tipo = tipoMapa(folhas)) {
  const mapa = COLS[tipo]; if (!mapa) return { tipo: "", linhas: [], folhas: [] };
  const linhas = [], usadas = [];
  for (const f of folhas) {
    const ano = anoFolha(f.nome); if (!ano || ano < ANO_INICIO) continue;
    const h = f.rows.findIndex((r) => r.some((c) => /^designacao$/.test(norm(c)))); if (h < 0) continue;
    const cab = f.rows[h].map(norm), idx = {};
    for (const [k, rx] of Object.entries(mapa)) { const i = cab.findIndex((c, j) => c && rx.test(c) && !Object.values(idx).includes(j)); if (i >= 0) idx[k] = i; }
    let n = 0;
    for (const r of f.rows.slice(h + 1)) {
      const des = (r[idx.des] || "").trim(); if (!des || /^total/i.test(des)) continue;
      const o = { ano };
      for (const [k, i] of Object.entries(idx)) {
        const v = r[i];
        if (DATAS.has(k)) { const d = data(v); if (d) o[k] = d; }
        else if (NUMS.has(k)) { const x = numero(v); if (x !== null) o[k] = Math.round(x * 100) / 100; }
        else { const t = String(v || "").replace(/\s+/g, " ").trim(); if (t && t !== "-") o[k] = t.slice(0, 300); }
      }
      o.est = estadoCod(o.estado);
      if (!o.est && tipo === "fornecimentos") { const p = estadoCod(o.ponto); if (p !== "outro") o.est = p; }
      linhas.push(o); n++;
    }
    usadas.push(`${f.nome.trim()} (${n})`);
  }
  return { tipo, linhas, folhas: usadas };
}

/* ---------------- Indicadores ---------------- */
const hojeIso = () => new Date().toISOString().slice(0, 10);
const somaDias = (iso, d) => new Date(Date.parse(iso + "T00:00:00Z") + d * 864e5).toISOString().slice(0, 10);
const contar = (l, f) => { const m = new Map(); for (const x of l) { const k = f(x) || "Sem indicação"; m.set(k, (m.get(k) || 0) + 1); } return m; };
const somar = (l, f, v) => { const m = new Map(); for (const x of l) { const k = f(x) || "Sem indicação"; m.set(k, (m.get(k) || 0) + (v(x) || 0)); } return m; };
const topo = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

// «WEGHO HOME PORTUGAL, SA» e «WEGHO HOME PORTUGAL, S.A.» são a mesma entidade
function topoNomes(l, f, v, n) {
  const m = new Map();
  for (const x of l) { const nome = f(x) || "Sem indicação", k = norm(nome).replace(/\b(s\.?\s?a|lda|unipessoal)\b|[^a-z0-9]/g, ""); const o = m.get(k) || { nome, v: 0 }; o.v += v(x) || 0; m.set(k, o); }
  return [...m.values()].sort((a, b) => b.v - a.v).slice(0, n).map((o) => [o.nome, o.v]);
}

export const ESTADOS = {
  empreitadas: { exec: "Em execução", conc: "Concluída", susp: "Suspensa", canc: "Cancelada", outro: "Outro", "": "Sem estado" },
  fornecimentos: { exec: "Em execução", conc: "Concluído", susp: "Suspenso", canc: "Cancelado", outro: "Outro", "": "Sem estado" },
};
const ORDEM_EST = ["exec", "conc", "susp", "canc", "outro", ""];

// Procedimentos com nomes longos → rótulo curto
export function procCurto(p) {
  const t = norm(p);
  if (!t) return "";
  if (/simplificado/.test(t)) return "Ajuste direto simplificado";
  if (/ajuste direto/.test(t)) return "Ajuste direto";
  if (/concurso publico/.test(t)) return "Concurso público";
  if (/consulta previa/.test(t)) return "Consulta prévia";
  if (/acordo.quadro/.test(t)) return "Acordo-quadro";
  if (/excluid/.test(t)) return "Contratação excluída";
  return String(p).slice(0, 40);
}

const LIBERACOES = [["a1", "e1", "1.º ano (30%)"], ["a2", "e2", "2.º ano (30%)"], ["a3", "e3", "3.º ano (15%)"], ["a4", "e4", "4.º ano (15%)"], ["a5", "e5", "5.º ano (10%)"]];

// Um contrato que passa de um ano para o outro aparece nas duas folhas: em «Todos os anos» conta só a linha do ano mais recente.
const chave = (x) => x.edoc ? x.edoc + "|" + norm(x.des).slice(0, 30) : "";
export function semRepetidos(linhas) {
  const ult = new Map();
  for (const x of linhas) { const k = chave(x); if (k && (!ult.has(k) || ult.get(k).ano < x.ano)) ult.set(k, x); }
  return linhas.filter((x) => { const k = chave(x); return !k || ult.get(k) === x || ult.get(k).ano === x.ano; });
}

export function indicadores(tipo, linhas, { ano = "", hoje = hojeIso(), dias = 60 } = {}) {
  const l = ano ? linhas.filter((x) => String(x.ano) === String(ano)) : semRepetidos(linhas);
  const ativos = l.filter((x) => x.est !== "canc");
  const anos = [...new Set(linhas.map((x) => x.ano))].sort();
  const porAnoEstado = anos.map((a) => ({ ano: a, ...Object.fromEntries(ORDEM_EST.map((e) => [e, linhas.filter((x) => x.ano === a && x.est === e).length])) }));
  const limite = somaDias(hoje, dias);
  const base = {
    tipo, anos, total: l.length, porAnoEstado,
    estados: ORDEM_EST.map((e) => [e, l.filter((x) => x.est === e).length]).filter((x) => x[1]),
    valor: ativos.reduce((s, x) => s + (x.valor || 0), 0),
    valorDiv: topo(somar(ativos, (x) => x.div, (x) => x.valor), 10),
    nDiv: topo(contar(l, (x) => x.div), 10),
    exec: l.filter((x) => x.est === "exec"),
    atrasados: l.filter((x) => x.est === "exec" && x.concl && x.concl < hoje).sort((a, b) => a.concl.localeCompare(b.concl)),
    aTerminar: l.filter((x) => x.est === "exec" && x.concl && x.concl >= hoje && x.concl <= limite).sort((a, b) => a.concl.localeCompare(b.concl)),
    topAdj: topoNomes(ativos, (x) => x.adj, (x) => x.valor, 8),
    execGestor: topo(contar(l.filter((x) => x.est === "exec"), (x) => x.gestor), 8),
  };
  if (tipo === "empreitadas") {
    const lib = [];
    for (const x of l) {
      if (x.est === "canc" || !x.rp) continue;
      for (const [a, e, rot] of LIBERACOES) if (x[a] && !x[e] && x[a] <= limite) lib.push({ ...x, quando: x[a], fase: rot, atraso: x[a] < hoje });
    }
    lib.sort((a, b) => a.quando.localeCompare(b.quando));
    base.liberacoes = lib;
    base.semRp = l.filter((x) => x.est === "conc" && !x.rp);
  } else {
    base.faturado = ativos.reduce((s, x) => s + (x.fat || 0), 0);
    base.porFaturar = ativos.reduce((s, x) => s + (x.porFat > 0.5 ? x.porFat : 0), 0);
    base.procs = topo(contar(ativos, (x) => procCurto(x.proc)), 8);
    base.valorProc = topo(somar(ativos, (x) => procCurto(x.proc), (x) => x.valor), 8);
    base.concluidosPorFaturar = l.filter((x) => x.est === "conc" && x.porFat > 0.5).sort((a, b) => b.porFat - a.porFat);
  }
  return base;
}
