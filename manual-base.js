// Manual da Secretaria: procedimentos de base, escritos a partir do guia de legislação da app (verificado a 23/11/2026).
// A equipa pode editar cada um (fica guardado na base de dados) e acrescentar procedimentos novos.
// modelos: títulos exatos dos modelos de ofício (modelos-oficio.js) usados neste procedimento.
// p: palavras que ajudam o MESTRE a reconhecer o procedimento num pedido.

export const MANUAL_BASE = [
  {
    id: "base-indemnizacao", area: "Indemnizações", titulo: "Pedido de indemnização por danos",
    quando: "Um munícipe pede ao Município que pague danos (por exemplo, num veículo, por causa do estado da via).",
    passos: [
      "Confirmar no Edoc se o local é via municipal. Se não for, usar o modelo «Via não municipal (informar o requerente)».",
      "Se o assunto for da competência da Junta de Freguesia, usar o modelo «Envio do pedido à Junta de Freguesia».",
      "Verificar se o pedido traz a prova necessária (fotos, orçamentos, faturas, participação policial, identificação do veículo). Se faltar, pedir os documentos em falta (art. 117.º CPA).",
      "Sem resposta ao pedido de prova: indeferimento definitivo por falta de pronúncia.",
      "Antes de indeferir, fazer a audiência prévia: comunicar o sentido provável da decisão e dar pelo menos 10 dias úteis para o requerente se pronunciar (arts. 121.º e ss. CPA).",
      "Sem pronúncia na audiência prévia: «Indeferimento definitivo (sem pronúncia)».",
      "Com pronúncia: analisar os argumentos e decidir. A decisão final tem de responder ao que o requerente alegou («Indeferimento definitivo (com pronúncia)»).",
    ],
    prazos: "Audiência prévia: pelo menos 10 dias úteis. Notificação por carta registada: 3.º dia útil após o registo. Por e-mail: quando é aberto ou, se não for, no 5.º dia útil após o envio (art. 113.º CPA).",
    legislacao: "Lei n.º 67/2007 (responsabilidade civil extracontratual); CPA (DL n.º 4/2015): arts. 113.º, 117.º, 121.º e 122.º.",
    modelos: ["Via não municipal (informar o requerente)", "Envio do pedido à Junta de Freguesia", "Audiência prévia (art. 121.º CPA)", "Indeferimento definitivo (sem pronúncia)", "Indeferimento definitivo (com pronúncia)"],
    notas: "Registar a data de notificação de cada ofício e usar a calculadora de prazos em Ofícios e legislação.",
    p: ["indemniza", "danos", "pneu", "viatura", "veículo", "buraco", "responsabilidade civil", "audiência prévia", "indeferimento"],
  },
  {
    id: "base-caucao", area: "Empreitadas", titulo: "Liberação de caução",
    quando: "Depois da receção provisória de uma empreitada, quando chega o ano de liberar parte da caução ou o empreiteiro o pede.",
    passos: [
      "Confirmar a data da receção provisória e que não há defeitos por corrigir (art. 295.º CCP).",
      "Ver o tipo de caução: retenção nos autos, ou seguro-caução ou garantia bancária. Escolher o modelo de ofício correspondente.",
      "Calcular a percentagem a liberar. Habitual: 30% no 1.º ano, 30% no 2.º, 15% no 3.º, 15% no 4.º e 10% no 5.º, salvo se o contrato ou o despacho disser outra coisa. Usar a calculadora de liberação de caução.",
      "Escrever os valores por extenso (calculadora «Valor por extenso»).",
      "Preparar o ofício e seguir a lista «Antes de enviar um ofício».",
      "Enviar para assinatura.",
    ],
    prazos: "Faseada a contar da data da receção provisória.",
    legislacao: "Código dos Contratos Públicos (DL n.º 18/2008, revisto pelo DL n.º 177/2026): art. 295.º.",
    modelos: ["Liberação de caução (retenção nos autos)", "Liberação de caução (seguro-caução ou garantia)"],
    notas: "",
    p: ["caução", "caucao", "liberação", "liberar", "garantia bancária", "seguro-caução", "retenção"],
  },
  {
    id: "base-reclamacao", area: "Munícipes", titulo: "Resposta a reclamação de munícipe",
    quando: "Chega uma reclamação ou pedido de um munícipe sobre o espaço público e é preciso responder por ofício.",
    passos: [
      "Abrir o 1.º registo do Edoc e confirmar o nome, o contacto (e-mail ou morada), o n.º de submissão e a referência OD.",
      "Confirmar o despacho da Senhora Chefe de Divisão e o que os serviços verificaram ou fizeram no local.",
      "Se a resolução for de uma entidade externa (Indaqua, E-Redes…), pedir a intervenção à entidade e informar o munícipe do encaminhamento.",
      "Caso contrário, usar o modelo «Resposta a reclamação», descrevendo o que foi verificado e o que foi ou vai ser feito. A resposta deve ter: confirmação da receção, resumo da situação, factos verificados, enquadramento e a solução ou decisão.",
      "Seguir a lista «Antes de enviar um ofício» (destinatário certo, só os dados necessários).",
      "Enviar para assinatura e associar ao processo no Edoc. Insistências do mesmo munícipe ficam associadas ao processo original.",
    ],
    prazos: "Reclamações: a regra da Câmara é responder em 15 dias úteis a contar da data da reclamação, ou enviar resposta intermédia com o prazo expectável (ver «Tratamento de reclamações»). Para outros pedidos, quando a lei não fixa prazo, o prazo geral é de 10 dias úteis (art. 86.º CPA). Pedido de informação sobre o andamento do processo: 10 dias (art. 82.º CPA).",
    legislacao: "CPA: arts. 13.º (dever de decidir), 82.º, 86.º e 87.º.",
    modelos: ["Resposta a reclamação", "Pedido de intervenção a entidade externa", "Informar o munícipe do encaminhamento a entidade"],
    notas: "",
    p: ["reclamação", "reclamacao", "munícipe", "municipe", "resposta", "queixa", "pedido", "insistência"],
  },
  {
    id: "base-lada", area: "Munícipes", titulo: "Pedido de acesso a documentos",
    quando: "Alguém pede cópia ou consulta de documentos de um processo.",
    passos: [
      "Confirmar quem pede e que documentos quer.",
      "Ver se os documentos têm dados de terceiros. Se tiverem, podem precisar de expurgo antes de serem entregues.",
      "Responder ou entregar dentro do prazo.",
    ],
    prazos: "10 dias úteis.",
    legislacao: "Lei n.º 26/2016 (LADA).",
    modelos: [],
    notas: "Em caso de dúvida sobre dados de terceiros, falar com o Encarregado de Proteção de Dados.",
    p: ["acesso a documentos", "cópia", "consulta do processo", "lada", "certidão"],
  },
  {
    id: "base-livro", area: "Munícipes", titulo: "Livro de Reclamações",
    quando: "Chega uma reclamação feita no Livro de Reclamações.",
    passos: [
      "Registar no mapa «Controlo LIVRO DE RECLAMAÇÕES» (aba Mapas).",
      "Tratar a reclamação e responder ao reclamante, seguindo o regime próprio da Administração Pública.",
    ],
    prazos: "",
    legislacao: "DL n.º 135/99, arts. 38.º e 39.º (não o DL n.º 156/2005).",
    modelos: ["Resposta a reclamação"],
    notas: "",
    p: ["livro de reclamações", "livro amarelo"],
  },
  {
    id: "base-suspensao", area: "Empreitadas", titulo: "Suspensão ou retoma dos trabalhos",
    quando: "Os trabalhos de uma empreitada param ou recomeçam.",
    passos: [
      "Registar em auto quando os trabalhos param e quando recomeçam, com o motivo.",
      "O prazo de execução é prorrogado pelo tempo da suspensão.",
    ],
    prazos: "",
    legislacao: "CCP: art. 365.º.",
    modelos: ["Auto de suspensão ou retoma dos trabalhos"],
    notas: "",
    p: ["suspensão", "suspensao", "retoma", "trabalhos parados"],
  },
  {
    id: "base-rgpd", area: "Dados pessoais", titulo: "Erro com dados pessoais",
    quando: "Um e-mail ou carta foi para a pessoa errada, ou perdeu-se um documento com dados pessoais.",
    passos: [
      "Avisar logo a chefia e o Encarregado de Proteção de Dados.",
      "Juntar o que aconteceu: que dados, de quem, para quem foram, quando.",
    ],
    prazos: "A Câmara tem 72 horas para notificar a CNPD (art. 33.º RGPD).",
    legislacao: "Regulamento (UE) 2016/679 (RGPD) e Lei n.º 58/2019.",
    modelos: [],
    notas: "",
    p: ["rgpd", "dados pessoais", "pessoa errada", "violação de dados"],
  },
  {
    id: "base-reclamacoes", area: "Reclamações", titulo: "Tratamento de reclamações",
    quando: "Chega uma reclamação: manifestação de insatisfação dirigida à Câmara sobre um serviço prestado ou pedido, uma decisão ou a atuação dos serviços, para a qual se espera resposta. Não confundir com participação (aviso de uma anomalia ou dano no território ou num equipamento municipal, que pede intervenção e não necessariamente uma resposta).",
    passos: [
      "Receção e registo: confirmar que a reclamação está na distribuição Edoc, com canal de entrada, data e unidade orgânica responsável. A Loja do Munícipe regista-a no ficheiro «Reclamações Gerais da CMM».",
      "Triagem e classificação: assunto, motivo (morosidade, insatisfação com a decisão, falta de resposta, comportamento indevido…), impacto, urgência e se pode haver uma não conformidade.",
      "Análise e investigação: verificar os factos internamente e no terreno quando for preciso (não fechar sem verificação), juntar as evidências e procurar a causa-raiz.",
      "Responder ao reclamante dentro de 15 dias úteis. Uma boa resposta tem: 1) confirmação da receção; 2) resumo claro da situação; 3) análise dos factos verificados; 4) justificação ou enquadramento; 5) solução, decisão ou medidas a tomar.",
      "Se a resposta final não for possível no prazo, enviar resposta intermédia com o ponto de situação e o prazo expectável de resolução ou de resposta final.",
      "Quem assina e quem expede depende do canal (ver Notas). Juntar sempre a evidência da resposta à distribuição Edoc da reclamação.",
      "A distribuição da reclamação só termina quando a reclamação está resolvida.",
      "Ação corretiva: se a reclamação revelar uma falha do serviço (não conformidade), corrigir a causa para não se repetir. Nem todas as reclamações são não conformidades, mas todas devem ser analisadas para ver se há falha por trás.",
    ],
    prazos: "15 dias úteis, contados da data em que o reclamante fez a reclamação (não da data em que chegou ao serviço) até à data em que a resposta é enviada. Não sendo possível, resposta intermédia com prazo expectável.",
    legislacao: "DL n.º 135/99 (modernização administrativa; comunicações escritas e informação sobre o tempo de resposta), incluindo o art. 35.º-A (sistema de elogios, sugestões e reclamações online); DL n.º 156/2005 (Livro de Reclamações físico e eletrónico); Portaria n.º 659/2006 (modelo do Livro de Reclamações nas autarquias). ISO 9001: 5.1.2, 7.4, 8.2/8.5, 9.1/10.2.",
    modelos: [],
    notas: "Quem assina e expede, por canal (apresentação do GACGE, junho de 2026): Livro de Reclamações físico ou digital: a UO elabora, a resposta final é assinada pela Senhora Presidente e expedida pelo Gabinete de Comunicação e Relações Públicas. Portal da Queixa: a UO elabora, o Senhor Vereador ou Vereadora com o pelouro (SH) assina, a UO expede e o GACGE regista a resposta no Portal. E-mail, Loja do Munícipe, Happy or Not e inquéritos de satisfação: a UO elabora, SH assina, a UO expede (GAOA quando a resposta vai em papel). Formulário no site da CMM: a UO elabora, SH assina; resposta por e-mail ou ofício, conforme o contacto indicado. Reuniões de Câmara públicas e Assembleia Municipal: só entram se não forem respondidas presencialmente; assina a Presidente da Câmara ou da Assembleia Municipal e expede o GAOA. Canal de Denúncias: a UO elabora, SH assina, a UO expede quando há identificação; quando é anónima, o GACGE regista a resposta no Canal. Política da Administração: dar sempre resposta ao reclamante, com as decisões tomadas ou o ponto de situação. Motivos mais comuns até 2025: morosidade, insatisfação com a decisão e falta de resposta. Assunto mais frequente: anomalias na via pública. Trimestralmente é feito um relatório do estado das reclamações para a Administração.",
    p: ["reclama", "queixa", "portal da queixa", "livro de reclamações", "livro amarelo", "insatisf", "morosidade", "demora", "falta de resposta", "resposta intermédia", "participação"],
  },
];

export const AREAS_MANUAL = ["Reclamações", "Munícipes", "Indemnizações", "Empreitadas", "Entidades", "Dados pessoais", "Outro"];

// procedimentos mais parecidos com um pedido (para o MESTRE)
export function procedimentosRelevantes(lista, texto, max = 2) {
  const t = String(texto || "").toLowerCase();
  return lista.map((m) => ({ m, s: (m.p || []).reduce((n, p) => n + (t.includes(p) ? (p.length > 6 ? 2 : 1) : 0), 0) + (t.includes(String(m.titulo).toLowerCase()) ? 5 : 0) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.m);
}
