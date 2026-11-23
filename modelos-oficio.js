// Modelos de ofício da Secretaria (Departamento de Conservação), tirados dos ofícios reais e sem dados pessoais.
// Campos a preencher entre [ ]. As linhas «Destinatário:», «Referência:» e «Assunto:» vão para o cabeçalho do modelo Word;
// a assinatura (A Coordenadora Técnica, Departamento de Conservação, subdelegação) já está no modelo Word.
// p: palavras que ajudam o MESTRE a escolher o modelo certo.

export const MODELOS_OFICIO = [
  // ---------------- Munícipes ----------------
  { g: "Munícipes", t: "Resposta a reclamação", p: ["reclamação", "munícipe", "resposta", "executad", "reparad"], x:
`Destinatário: EXMO. SENHOR | [Nome do requerente] | [E-mail ou morada]
Referência: [OD/AAAA/NNNNN]
Assunto: [Assunto da reclamação] – [Rua], [Freguesia]

Reportando-me ao assunto identificado em epígrafe, registado nesta Câmara Municipal sob o n.º de submissão [AAAA-CMM-NNNNN], cumpre informar V. Ex.ª, em cumprimento do despacho da Senhora Chefe da Divisão de Conservação do Espaço Público e Sistema Pluvial, que a situação foi analisada pelos serviços municipais.

[Descrever o que foi verificado e o que foi feito ou vai ser feito, com a data, se houver.]

Sem outro assunto de momento, permanece esta Câmara Municipal à disposição de V. Ex.ª para quaisquer esclarecimentos adicionais que se revelem necessários.

Com os melhores cumprimentos,` },

  { g: "Munícipes", t: "Informar o munícipe do encaminhamento a entidade", p: ["indaqua", "e-redes", "entidade", "encaminh", "munícipe"], x:
`Destinatário: EXMO. SENHOR | [Nome do requerente] | [E-mail ou morada]
Referência: [OD/AAAA/NNNNN]
Assunto: [Assunto da reclamação] – [Rua], [Freguesia]

Reportando-me ao assunto mencionado em epígrafe, registado nesta Câmara Municipal sob o n.º de submissão [AAAA-CMM-NNNNN], relativo a [descrição breve], cumpre informar V. Ex.ª, em cumprimento do despacho da Senhora Chefe da Divisão de Conservação do Espaço Público e Sistema Pluvial, que a situação foi analisada pelos serviços municipais.

Na sequência da verificação efetuada no local, foi remetida comunicação à [Entidade responsável], entidade responsável pela [rede ou serviço], solicitando a avaliação da situação e a adoção das medidas adequadas, nomeadamente [medidas pedidas].

Sem outro assunto de momento, permanece esta Câmara Municipal à disposição de V. Ex.ª para quaisquer esclarecimentos adicionais que se revelem necessários.

Com os melhores cumprimentos,` },

  // ---------------- Entidades externas ----------------
  { g: "Entidades", t: "Pedido de intervenção a entidade externa", p: ["indaqua", "entidade", "intervenção", "pedido", "rede", "matosinhoshabit"], x:
`Destinatário: EXMO. SENHOR | Presidente do Conselho de Administração | [Entidade] | [E-mail da entidade]
Referência: [OD/AAAA/NNNNN]
Assunto: [Assunto] – [Rua, junto ao n.º], [Freguesia]

Na sequência da reclamação apresentada por munícipe relativa a [descrição], na [Rua], junto ao n.º [n.º], [Código postal] [Localidade], [enquadramento: por que razão a situação compete a essa entidade].

Assim, e conforme despacho da Senhora Chefe da Divisão de Conservação do Espaço Público e Sistema Pluvial, solicita-se a V. Exas. que promovam, com a maior brevidade possível, a avaliação da situação e [ações pedidas], por forma a [objetivo].

Solicita-se que na resposta à presente comunicação seja identificada a nossa refª [OD/AAAA/NNNNN].

Com os melhores cumprimentos,` },

  { g: "Entidades", t: "Notificação para correção de inconformidades", p: ["notificação", "inconformidade", "correção", "reposição", "pavimento", "alvará", "fiscalização"], x:
`Destinatário: EXMO. SENHOR | Presidente do Conselho de Administração | [Entidade] | [E-mail da entidade]
Referência: [EDOC/AAAA/NNNNN]
Assunto: Notificação para correção de inconformidades na reposição do pavimento – Alvará de Licença de Ocupação de Espaço Público n.º [n.º/AAAA] – [Rua, n.º], em [Freguesia]

Na sequência da autorização para [trabalhos], Alvará de Licença de Ocupação de Espaço Público n.º [n.º/AAAA], na [Rua, n.º], em [Freguesia], informo V. Exas., conforme despacho da [Chefia], que foram detetadas inconformidades em termos da qualidade da reposição do pavimento, as quais devem ser corrigidas, mediante a realização das seguintes ações:
- [Ação 1];
- [Ação 2].

Nos termos do citado despacho, notificam-se V. Exas. para procederem à correção no prazo de 10 (dez) dias úteis, contados da data da presente notificação.

Anexa-se cópia do Alvará e registo fotográfico das inconformidades detetadas, para melhor esclarecimento.

Informa-se ainda que deverão comunicar a esta Câmara, com a antecedência mínima de 5 dias, o início dos trabalhos.

Solicita-se que na resposta à presente comunicação seja identificada a nossa refª [EDOC/AAAA/NNNNN].

Com os melhores cumprimentos,` },

  // ---------------- Indemnizações ----------------
  { g: "Indemnizações", t: "Audiência prévia (art. 121.º CPA)", p: ["audiência", "121", "indemnização", "intenção", "parecer"], x:
`Destinatário: EXMO. SENHOR | [Nome do requerente] | [E-mail ou morada]
Referência: [OD/AAAA/NNNNN]
Assunto: AUDIÊNCIA PRÉVIA (Artigo 121.º e ss. do CPA) ao pedido de indemnização por danos na viatura alegadamente provocados por [anomalia] na [Rua], em [Freguesia]

O Município de Matosinhos vem, nos termos e para os efeitos do artigo 121.º e ss. do Código do Procedimento Administrativo e conforme despacho da Chefe de Divisão de Conservação do Espaço Público e Sistema Pluvial, notificá-lo para, em face da sua pretensão apresentada em sede de participação de acidente, datada de [data], se pronunciar por escrito, no prazo de 10 dias úteis, em sede de audiência de interessados, acerca do sentido provável da decisão a proferir.

Na verdade, e apurada toda a matéria de facto, concluiu o parecer jurídico:
"[Transcrever as conclusões do parecer jurídico.]"

Nos termos da legislação aplicável, é intenção do Município [indeferir o pedido / deferir parcialmente o pedido no valor de € [valor] ([valor por extenso])].

O processo pode ser consultado durante o horário de expediente na Câmara Municipal de Matosinhos – Loja do Munícipe, mediante agendamento prévio, para o mail@cm-matosinhos.pt, ou através do telf. 229390900 / 229392400, fazendo refª ao [OD/AAAA/NNNNN].

Com os melhores cumprimentos,` },

  { g: "Indemnizações", t: "Indeferimento definitivo (sem pronúncia)", p: ["indeferimento", "definitivo", "sem pronúncia", "não se pronunciou", "indemnização"], x:
`Destinatário: EXMO. SENHOR | [Nome do requerente] | [E-mail ou morada]
Referência: [OD/AAAA/NNNNN]
Assunto: Pedido de indemnização por [danos] na [Rua], em [Freguesia] – INDEFERIMENTO DEFINITIVO

Na sequência do assunto mencionado em título, informo que foi V. Ex.ª notificado pelo ofício [saida_DMOAC/AAAA/NNNN], de [data], onde lhe foi dado conhecimento da intenção de indeferimento do pedido de indemnização apresentado, tendo-lhe sido concedido o prazo de 10 dias úteis, nos termos do artigo 121.º e ss. do Código do Procedimento Administrativo, para exercer, caso estivesse interessado, o seu direito de pronúncia, por escrito.

Findo este prazo, verificou-se que não se pronunciou, não tendo, pois, contestado a intenção de indeferimento.

Face ao exposto, e uma vez que não foram trazidos ao processo elementos novos que pudessem, de algum modo, colocar em crise a intenção de indeferimento por falta de provas da conduta ilícita da autarquia geradora de responsabilidade civil extracontratual, comunico, conforme o despacho exarado pela Exma. Senhora Vereadora da área respetiva em [data], a decisão do indeferimento da pretensão, a título definitivo.

Com os melhores cumprimentos,` },

  { g: "Indemnizações", t: "Indeferimento definitivo (com pronúncia)", p: ["indeferimento", "definitivo", "pronúncia", "com pronúncia", "indemnização"], x:
`Destinatário: EXMO. SENHOR | [Nome do requerente] | [E-mail ou morada]
Referência: [OD/AAAA/NNNNN]
Assunto: Pedido de indemnização por [danos] na [Rua], em [Freguesia] – INDEFERIMENTO DEFINITIVO

Na sequência do assunto mencionado em título, informo V. Ex.ª de que, pela sua pronúncia em sede de audiência prévia, se verifica que não foram carreados para os autos novos elementos que contrariem a intenção de indeferimento comunicada pelo nosso ofício [saida_DMOAC/AAAA/NNNN], de [data].

Analisada a referida pronúncia, foi elaborado parecer jurídico, que concluiu:
"[Transcrever as conclusões do parecer jurídico.]"

Face ao exposto, e uma vez que não foram trazidos ao processo elementos novos que pudessem, de algum modo, colocar em crise a intenção de indeferimento por falta de provas da conduta ilícita da autarquia geradora de responsabilidade civil extracontratual, comunico, conforme o despacho exarado pela Exma. Senhora Vereadora da área respetiva em [data], a decisão do indeferimento da pretensão, a título definitivo.

Com os melhores cumprimentos,` },

  { g: "Indemnizações", t: "Via não municipal (informar o requerente)", p: ["via norte", "infraestruturas de portugal", "não municipal", "ip", "estrada nacional", "competência"], x:
`Destinatário: EXMO. SENHOR | [Nome do requerente] | [E-mail ou morada]
Referência: [OD/AAAA/NNNNN]
Assunto: Pedido de indemnização por danos na viatura por anomalias no piso na [Via], [Freguesia]

Reportando-me ao assunto mencionado em título, registado nesta Câmara Municipal sob o n.º [AAAA-CMM-NNNNN], cumpre-me informar V. Ex.ª, nos termos do despacho da Chefe de Divisão, que, após análise técnica e jurídica ao pedido de indemnização apresentado, se concluiu que a responsabilidade pela via onde ocorreram os alegados danos não é municipal.

A anomalia descrita situa-se na [Via], cuja gestão, conservação e manutenção é da competência da [Entidade gestora], pelo que o pedido de indemnização deverá ser diretamente endereçado a essa entidade.

Mais se informa que, ao abrigo do Regulamento Geral sobre a Proteção de Dados (RGPD), esta Câmara Municipal não pode remeter o processo, nem transmitir dados pessoais do reclamante a entidades terceiras sem fundamento legal ou sem o respetivo consentimento expresso, conforme decorre dos artigos 5.º, n.º 1, alíneas a) e b), e 6.º. Nesses termos, o próprio interessado deverá submeter o pedido diretamente à [Entidade gestora].

Com os melhores cumprimentos,` },

  { g: "Indemnizações", t: "Envio do pedido à Junta de Freguesia", p: ["junta", "freguesia", "remete", "envio do pedido", "indemnização"], x:
`Destinatário: EXMO. SENHOR | Presidente da Junta de Freguesia de [Freguesia] | [E-mail da Junta]
Referência: [OD/AAAA/NNNNN]
Assunto: Pedido de indemnização por danos no veículo devido a anomalia no pavimento na [Rua], em [Freguesia]

Na sequência do pedido de indemnização apresentado neste Município, por alegados danos no veículo decorrentes de uma anomalia existente na [Rua], em [Freguesia], informa-se que o processo foi analisado pelos serviços técnicos e jurídicos competentes, tendo-se concluído que a via onde ocorreu o acidente se encontra sob a responsabilidade dessa Junta de Freguesia.

Assim, e em cumprimento do despacho da Chefe de Divisão, remete-se o processo relativo ao acidente ocorrido em [data], para que V. Exas. procedam à respetiva apreciação do pedido de indemnização apresentado.

Em anexo, seguem os seguintes elementos instrutórios:
- [Documento 1];
- [Documento 2].

Mais se informa que, na presente data, o reclamante foi notificado do encaminhamento do processo para essa Junta de Freguesia.

Com os melhores cumprimentos,` },

  // ---------------- Empreitadas (CCP) ----------------
  { g: "Empreitadas", t: "Liberação de caução (retenção nos autos)", p: ["caução", "liberação", "295", "vistoria", "retenção", "ano"], x:
`Destinatário: EXMOS. SENHORES | [Empresa] | [E-mail ou morada]
Referência: [EDOC/AAAA/NNNNN]
Assunto: "[Designação da empreitada]" – LIBERAÇÃO DE CAUÇÃO – [N].º ano

Relativamente ao assunto mencionado em epígrafe, levo ao conhecimento de V. Exas. que, de acordo com o disposto no artigo 295.º do CCP, se procedeu à vistoria da empreitada em epígrafe, no dia [data], da qual se anexa auto.

A caução total da obra corresponde a 10% do seu valor global, tendo neste caso o valor de [valor] € ([valor por extenso]), e foi efetuada da seguinte forma:
- [valor] € ([valor por extenso]) através de retenção nos autos de medição efetuados, correspondente a 10% do valor da adjudicação.

Nesta conformidade, e de acordo com o despacho da Exma. Senhora [Presidente / Vereadora da área respetiva] de [data], será liberado [percentagem]% do valor total da caução, que corresponde à liberação de [valor] € ([valor por extenso]) do valor retido através dos autos de medição.

Com os melhores cumprimentos,` },

  { g: "Empreitadas", t: "Liberação de caução (seguro-caução ou garantia)", p: ["caução", "seguro-caução", "garantia", "garante", "liberação", "295"], x:
`Destinatário: EXMOS. SENHORES | [Empresa] | [E-mail ou morada]
Referência: [EDOC/AAAA/NNNNN]
Assunto: [Designação da empreitada] – Liberação de caução [N].º ano

Relativamente ao assunto mencionado em epígrafe, levo ao conhecimento de V. Exas. que, de acordo com o disposto no artigo 295.º do CCP, se procedeu à vistoria da empreitada em epígrafe, da qual se anexa o auto.

A caução prestada para garantia do cumprimento das obrigações contratuais ascende ao montante de [valor] € ([valor por extenso]), correspondente a 10% do valor contratual da empreitada, tendo sido constituída através do [Seguro-caução / Garantia bancária] n.º [n.º], emitido pela [Entidade garante].

Assim, informa-se que, na sequência do despacho da Exma. Senhora Presidente da Câmara Municipal que autorizou a presente liberação parcial da caução, foi igualmente comunicada essa decisão à entidade garante, [Entidade garante], para efeitos de redução do montante garantido, em conformidade com a liberação de [percentagem]% da caução, correspondente ao valor de [valor] € ([valor por extenso]).

Com os melhores cumprimentos,` },

  { g: "Empreitadas", t: "Auto de receção definitiva", p: ["receção definitiva", "recepção definitiva", "auto", "totalidade da caução"], x:
`Destinatário: EXMOS. SENHORES | [Empresa] | [E-mail ou morada]
Referência: [EDOC/AAAA/NNNNN]
Assunto: [Designação da empreitada] – Auto de Receção Definitiva

Relativamente à empreitada mencionada em epígrafe, junto se envia o Auto de Receção Definitiva efetuado em [data].

Nesta conformidade, e de acordo com o despacho da Exma. Senhora Presidente de [data], informo V. Exas. de que foi aprovada a liberação da totalidade da caução.

Com os melhores cumprimentos,` },

  { g: "Empreitadas", t: "Auto de suspensão ou retoma dos trabalhos", p: ["suspensão", "retoma", "365", "auto de suspensão"], x:
`Destinatário: EXMOS. SENHORES | [Empresa] | [E-mail ou morada]
Referência: [EDOC/AAAA/NNNNN]
Assunto: [Designação da empreitada] – Auto de [Suspensão / Retoma]

Relativamente à empreitada mencionada em epígrafe, comunico a V. Exas. que, por despacho exarado pela Exma. Senhora Vereadora da área respetiva em [data], foi aprovada a [suspensão / retoma] dos trabalhos a partir de [data], justificada por [motivo], de acordo com o previsto na alínea [x)] do artigo 365.º do CCP.

Com os melhores cumprimentos,` },

  { g: "Empreitadas", t: "Conta final", p: ["conta final", "401", "402", "basegov", "homologada"], x:
`Destinatário: EXMOS. SENHORES | [Empresa] | [E-mail ou morada]
Referência: [EDOC/AAAA/NNNNN]
Assunto: [Designação da empreitada] – Conta Final

Para conhecimento e devidos efeitos, comunico a V. Exas. que, por despacho da Exma. Senhora Presidente de [data], foi homologada a conta final da empreitada mencionada em epígrafe.

De acordo com o n.º 1 do artigo 401.º do CCP, junto se envia cópia da referida conta final, para que o responsável por esta obra, no prazo de 15 (quinze) dias, assine e devolva a mesma ou deduza a sua reclamação devidamente fundamentada.

Findo este prazo, e nada dizendo sobre o assunto, a Conta Final será dada por aceite.

Nos termos do n.º 1 do artigo 402.º do CCP, findo aquele prazo, o relatório final da obra será publicitado no Portal BASE.

Com os melhores cumprimentos,` },

  { g: "Empreitadas", t: "Revisão de preços", p: ["revisão de preços", "requisição externa", "red", "fatura"], x:
`Destinatário: EXMOS. SENHORES | [Empresa] | [E-mail ou morada]
Referência: [EDOC/AAAA/NNNNN]
Assunto: [Designação da empreitada] – Revisão de Preços

Relativamente ao assunto mencionado em epígrafe, e em conformidade com o despacho da Exma. Senhora Vereadora da área respetiva de [data], informa-se que foi aprovada a Revisão de Preços no montante de [valor] € ([valor por extenso]), ao qual acresce o respetivo IVA.

Mais se comunica que à referida Revisão de Preços foi atribuída a Requisição Externa n.º [n.º/AAAA], que se remete em anexo para os devidos efeitos.

Por fim, informa-se que nas faturas a apresentar deverá obrigatoriamente constar o número da Requisição Externa (RED) acima identificado.

Com os melhores cumprimentos,` },
];

// Escolhe os modelos mais parecidos com o pedido (para dar ao MESTRE só os que interessam).
export function modelosRelevantes(texto, max = 2) {
  const t = String(texto || "").toLowerCase();
  return MODELOS_OFICIO.map((m) => ({ m, s: m.p.reduce((n, p) => n + (t.includes(p) ? (p.length > 6 ? 2 : 1) : 0), 0) + (t.includes(m.t.toLowerCase()) ? 5 : 0) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.m);
}
