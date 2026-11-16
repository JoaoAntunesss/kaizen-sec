# Kaizen — Secretaria da Conservação

App web (PWA) para as reuniões Kaizen da Subunidade Orgânica da Conservação — Secretaria (Câmara Municipal de Matosinhos).

Depois da reunião tira-se uma foto ao quadro de post-its; a IA lê cada post-it (coluna, tarefa, responsável, prazo), revê-se a lista e guarda-se. O painel mostra o quadro da semana, tarefas em atraso, tarefas por responsável e o histórico das reuniões.

## Usar

Abrir **https://joaoantunesss.github.io/kaizen-sec/** no telemóvel:

- **Android (Chrome):** aparece «Instalar app» (ou menu ⋮ → Instalar app).
- **iPhone (Safari):** Partilhar → Adicionar ao ecrã principal.

Entra-se com a conta Google.

## Configurar (uma vez)

1. **GitHub Pages:** Settings → Pages → Source: **GitHub Actions**.
2. **Chave do Groq:** Settings → Secrets and variables → Actions → New repository secret → `GROQ_API_KEY` (a mesma do Freezer). O GitHub Actions mete-a no site ao publicar; não fica no Git. Fica visível no código da página publicada.
3. **Firebase (projeto do Freezer):**
   - Definições do projeto → As tuas apps → **Adicionar app → Web**; copiar o `firebaseConfig` para `config.js`.
   - Authentication → Sign-in method → **Google** ativo.
   - Authentication → Settings → Authorized domains → acrescentar **`joaoantunesss.github.io`**.
   - Firestore → Regras: acrescentar as regras abaixo às que já existem do Freezer (sem apagar as outras).

```
match /kaizen_reunioes/{id} {
  allow read, write: if request.auth != null;
}
match /kaizen_fotos/{id} {
  allow read, write: if request.auth != null;
}
```

Cada push no `main` publica o site automaticamente.
