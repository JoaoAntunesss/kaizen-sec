// Configuração da app Kaizen.
// A chave do Groq NÃO está aqui no Git: o GitHub Actions troca __GROQ_API_KEY__
// pelo segredo GROQ_API_KEY do repositório na altura de publicar o site.
// Atenção: depois de publicada, a chave fica visível para quem abrir o código da página.
export const GROQ_API_KEY = "__GROQ_API_KEY__";

// Configuração da app Web do Firebase (projeto do Freezer).
// Firebase → Definições do projeto → As tuas apps → app Web → firebaseConfig.
// Estes valores não são secretos: o acesso é controlado pelas regras da base de dados.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDlDfDdCTDTCFgxyKKrh3xe8I23iqNH0pg",
  authDomain: "congelador-bdba6.firebaseapp.com",
  databaseURL: "https://congelador-bdba6-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "congelador-bdba6",
  storageBucket: "congelador-bdba6.firebasestorage.app",
  messagingSenderId: "761914486599",
  appId: "1:761914486599:web:53cc9a7c1b8ef591966662"
};

// Painel Power BI das reclamações do espaço público (link público «Publicar na Web»).
// Para trocar de painel, basta mudar este link.
export const POWERBI_URL = "https://app.powerbi.com/view?r=eyJrIjoiZGI3MGM4ZjItYzYwOC00YTEwLTg0ODctMDZjMmFmNDIwNzBiIiwidCI6Ijg1ZmYwZDc5LTI2YzQtNDQ5OS05MDg1LWQyZjEwOWFkZjE3YSIsImMiOjh9&pageName=cf552c686754b9ad0793";

// Nós no Realtime Database (separados dos do Freezer).
export const COL_REUNIOES = "kaizen_reunioes";
export const COL_FOTOS = "kaizen_fotos";

// Equipa (mapa de presenças). Para acrescentar alguém, juntar uma linha e fazer push.
export const EQUIPA = [
  { mec: "5195", nome: "Cristina Delca" },
  { mec: "3746", nome: "Bárbara Dias" },
  { mec: "5215", nome: "Carlos Ribeiro" },
  { mec: "4564", nome: "Daniela Rodrigues" },
  { mec: "4539", nome: "Inês Miranda" },
  { mec: "4544", nome: "Isabel Pereira" },
  { mec: "4523", nome: "João Antunes" },
  { mec: "4553", nome: "Sandra Peixoto" }
];
