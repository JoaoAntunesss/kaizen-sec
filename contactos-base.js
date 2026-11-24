// Lista inicial de contactos institucionais (informação pública, sem dados pessoais).
// Fontes: site da Câmara Municipal de Matosinhos (Juntas de Freguesia, nov. 2026), Portal da Queixa / sites das entidades.
// Depois de carregada na app, a lista é editada pela equipa no separador «Contactos»; este ficheiro só serve para a primeira carga.
const JF = "Junta de Freguesia";
const jf = (nome, email, morada, telefone, notas = "") => ({
  tipo: JF, entidade: `Junta de Freguesia de ${nome}`, tratamento: "EXMO. SENHOR", cargo: "Presidente da Junta de Freguesia",
  email, morada, telefone, notas: notas || "Confirmar contactos: freguesia reposta em 2025 (antes integrava uma união de freguesias).",
});

export const CONTACTOS_BASE = [
  jf("Custóias", "geral@jf-custoias.pt", "Largo do Souto, 287, 4460-830 Custóias", "229 511 144"),
  jf("Guifões", "geral@jf-guifoes.pt", "Largo Padre Joaquim Pereira dos Santos, 4460-033 Guifões", "229 578 480"),
  jf("Lavra", "geral@jf-lavra.pt", "", "229 285 418"),
  jf("Leça da Palmeira", "geral@jf-lecadapalmeira.pt", "Av. Dr. Fernando Aroso, 371, 4450-665 Leça da Palmeira", "229 997 030"),
  jf("Leça do Balio", "", "Largo do Mosteiro, 4465-703 Leça do Balio", "229 011 390", "E-mail por confirmar. Freguesia reposta em 2025."),
  jf("Matosinhos", "geral@jf-matosinhos.pt", "", "229 380 586"),
  jf("Perafita", "geral@jfperafita.pt", "Largo da Igreja, Apartado 2001, 4451-901 Perafita", "229 998 420"),
  jf("Santa Cruz do Bispo", "geral@jf-santacruzbispo.pt", "Largo da Viscondessa, s/n, 4455-870 Santa Cruz do Bispo", "229 951 352"),
  jf("São Mamede de Infesta", "geral@jf-saomamedeinfesta.pt", "Rua Silva Brinco, s/n, 4465-265 São Mamede de Infesta", "229 069 620"),
  jf("Senhora da Hora", "geral@jf-senhoradahora.pt", "Rua do Actor Vasco de Santana, 4460-437 Senhora da Hora", "229 510 110"),
  { tipo: "Água e saneamento", entidade: "INDAQUA Matosinhos – Gestão de Águas de Matosinhos, S.A.", tratamento: "EXMOS. SENHORES", cargo: "Presidente do Conselho de Administração",
    email: "geralmatosinhos@indaquamatosinhos.pt", morada: "Av. Fabril do Norte, 1601, 4460-316 Senhora da Hora", telefone: "229 393 200", notas: "Concessionária da água e saneamento no concelho." },
  { tipo: "Empresa municipal", entidade: "MatosinhosHabit – MH, E.M.", tratamento: "EXMOS. SENHORES", cargo: "Presidente do Conselho de Administração",
    email: "geral@matosinhoshabit.pt", morada: "Rua Alfredo Cunha, 99, 1.º, 4450-023 Matosinhos", telefone: "229 399 990", notas: "" },
  { tipo: "Energia", entidade: "E-REDES – Distribuição de Eletricidade, S.A.", tratamento: "EXMOS. SENHORES", cargo: "",
    email: "", morada: "", telefone: "", notas: "Avarias na iluminação pública e pedidos das autarquias: Área Reservada Autarquias (balcão digital). Projetos e viabilidades: PLR_Viabilidades@e-redes.pt. Confirmar o interlocutor do município." },
];
