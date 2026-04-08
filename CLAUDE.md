# ÉDEN — Instruções para o Claude

## Ao iniciar qualquer conversa neste projeto

**Leia o checkpoint antes de qualquer coisa:**

```
C:\Users\User\.claude\projects\c--Projetos-Eden\memory\checkpoint.md
```

Este arquivo contém:
- O estado atual do projeto (último commit, deploy, URLs)
- Tudo que foi implementado nas sessões anteriores
- Próximos passos sugeridos
- Comandos úteis de dev/deploy

---

## Arquitetura resumida

- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4
- **Deploy frontend:** Vercel — `eden-de-volta-ao-principio.vercel.app`
- **Backend:** Firebase Cloud Functions (Node.js) em `us-central1`
- **Deploy backend:** `firebase deploy --only functions`
- **Database:** Firestore + Firebase Auth + Storage
- **IA:** Google Gemini via `@google/generative-ai` (`gemini-2.5-flash-lite`)
- **Project ID Firebase:** `gen-lang-client-0295226702`

---

## Estrutura de código

```
src/
├── App.tsx                          ← Só JSX (thin wrapper)
├── hooks/
│   ├── useAppOrchestrator.ts        ← Estado central + handlers de IA
│   ├── useNotesManager.ts           ← Notas + seleção de texto
│   ├── usePWAInstall.ts             ← PWA install prompt
│   └── queries/                     ← TanStack Query hooks
├── components/
│   ├── common/FeatureErrorBoundary  ← Isolamento de erros por feature
│   ├── layout/                      ← Header, NavSidebar, MainLayout, RightPanel
│   └── views/                       ← ReadingView, TheologyView, etc.
├── contexts/                        ← Auth, Bible, Language, Audio, Toast
└── services/
    ├── firebase.ts
    └── geminiService.ts             ← Chamadas às Cloud Functions
functions/
└── index.js                         ← 21 Cloud Functions (JavaScript)
```

---

## Regras importantes

1. **Firestore Rules** são a causa #1 de erros "permission denied" — checar `firestore.rules` antes de suspeitar de IAM
2. **Deploy separado:** frontend no Vercel, backend no Firebase — `npm run build && npx vercel --prod` ≠ `firebase deploy --only functions`
3. **Modelo Gemini:** sempre `gemini-2.5-flash-lite` para texto — `gemini-1.5-flash-001` está deprecated
4. **NavSidebar** usa `tabToPath` importado de `useAppOrchestrator` — não duplicar o mapeamento de rotas
5. O único erro TypeScript esperado é `AdminMaintenance.tsx` (módulo firebase não resolvido) — não bloqueia build

### Regra de atualização de modelos LLM

**Sempre que encontrar um modelo Gemini desatualizado em qualquer arquivo, atualize imediatamente:**

| Modelo deprecated | Substituto atual |
|---|---|
| `gemini-1.5-flash-001` | `gemini-2.5-flash-lite` |
| `gemini-1.5-pro-001` | `gemini-2.5-flash-preview-05-20` (para imagens) ou `gemini-2.5-flash-lite` (para texto) |
| `gemini-1.5-pro` | `gemini-2.5-flash-lite` |
| `gemini-1.0-pro` | `gemini-2.5-flash-lite` |
| `gemini-2.0-flash-exp` | `gemini-2.5-flash-lite` |
| `gemini-2.0-flash-preview-image-generation` | `gemini-2.5-flash-preview-05-20` (desligado nov/2025) |

**Modelos atuais (referência):**
- Texto/análise: `gemini-2.5-flash-lite` (padrão do projeto)
- Imagens: `gemini-2.5-flash-preview-05-20` (via REST, `responseModalities: ["IMAGE","TEXT"]`)
- Alto desempenho: `gemini-2.5-flash` (se custo não for problema)

---

## Memória persistente

Arquivos em `C:\Users\User\.claude\projects\c--Projetos-Eden\memory\`:
- `MEMORY.md` — índice de todas as memórias
- `checkpoint.md` — estado completo do projeto (LEIA PRIMEIRO)
- `debugging.md` — guia de troubleshooting
