// Valores em euros por extenso (português de Portugal), como nos ofícios: «45.656,16 € (quarenta e cinco mil seiscentos e cinquenta e seis euros e dezasseis cêntimos)».
const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n) {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100, p = [];
  if (c) p.push(CEM[c]);
  if (r) p.push(r < 20 ? UN[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? " e " + UN[r % 10] : ""));
  return p.join(" e ");
}
// Inteiro por extenso (até 999 999 999 999).
export function inteiroPorExtenso(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const grupos = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  const nomes = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["mil milhões", "mil milhões"]];
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]; if (!g) continue;
    let txt;
    if (i === 1) txt = g === 1 ? "mil" : `${ate999(g)} mil`;
    else if (i >= 2) txt = `${g === 1 ? "um" : ate999(g)} ${nomes[i][g === 1 ? 0 : 1]}`;
    else txt = ate999(g);
    partes.push({ txt, g, i });
  }
  // «e» antes do último grupo quando este é menor que 100 ou uma centena redonda (ex.: mil e quinhentos, mil e cinquenta).
  let s = partes[0].txt;
  for (let k = 1; k < partes.length; k++) {
    const p = partes[k], ultimo = k === partes.length - 1;
    s += (ultimo && (p.g < 100 || p.g % 100 === 0)) ? " e " + p.txt : " " + p.txt;
  }
  return s;
}
// Lê «45656,16», «45.656,16», «45656.16», «45 656,16 €».
export function lerValor(txt) {
  let s = String(txt || "").replace(/[€\s]/g, "").replace(/euros?/i, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const v = Number(s);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
}
export const fmtEuros = (v) => { const [i, d] = v.toFixed(2).split("."); return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`; };
export function eurosPorExtenso(v) {
  const e = Math.floor(v + 1e-9), c = Math.round((v - e) * 100);
  const pe = e ? `${inteiroPorExtenso(e)}${e % 1000000 === 0 && e >= 1000000 ? " de" : ""} ${e === 1 ? "euro" : "euros"}` : "";
  const pc = c ? `${inteiroPorExtenso(c)} ${c === 1 ? "cêntimo" : "cêntimos"}` : "";
  return pe && pc ? `${pe} e ${pc}` : pe || pc || "zero euros";
}
// «45.656,16 € (quarenta e cinco mil … cêntimos)»
export const valorCompleto = (v) => `${fmtEuros(v)} € (${eurosPorExtenso(v)})`;
