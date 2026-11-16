// Configuração da app Kaizen.
// A chave do Groq NÃO está aqui no Git: o GitHub Actions troca __GROQ_API_KEY__
// pelo segredo GROQ_API_KEY do repositório na altura de publicar o site.
// Atenção: depois de publicada, a chave fica visível para quem abrir o código da página.
export const GROQ_API_KEY = "__GROQ_API_KEY__";

// Configuração da app Web do Firebase (projeto do Freezer).
// Firebase → Definições do projeto → As tuas apps → app Web → firebaseConfig.
// Estes valores não são secretos: o acesso é controlado pelas regras do Firestore.
export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Coleções no Firestore (separadas das do Freezer).
export const COL_REUNIOES = "kaizen_reunioes";
export const COL_FOTOS = "kaizen_fotos";
