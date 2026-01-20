# 🔄 Pontos de Restauração

Este arquivo documenta os commits importantes para facilitar a restauração.

## Como Usar

Para voltar a qualquer ponto:
```bash
git reset --hard <hash>
```

---

## Histórico

### ✅ v1.3 - Correção de Paralelos + UI Limpa
**Hash:** `17cd5ae`  
**Data:** 2026-01-20  
**Comando:** `git reset --hard 17cd5ae`

**Melhorias:**
- 🐛 **Correção Crítica:** Referências agora abrem o livro correto (antes clicava em "Salmos" e abria "Gênesis")
- 🎨 **UI:** Referências cruzadas agora ficam colapsadas ("🔗 2 Referências") para não poluir a tela
- ⚙️ **Backend:** Prompt atualizado para gerar referências cruzadas corretamente

---

### ✅ v1.2 - Deploy Vercel (Leitura por Voz)
**Hash:** `64446f4`  
**Data:** 2026-01-20  
**Comando:** `git reset --hard 64446f4`

**Funcionalidades:**
- Leitura por versículo com destaque, auto-scroll, velocidade e idioma
- Deploy público Vercel

---

### ✅ v1.0 - Backup Antes da Leitura por Voz
**Hash:** `1e98a87`  
**Data:** 2026-01-20  
**Comando:** `git reset --hard 1e98a87`

**Estado:** Versão estável antes das modificações de leitura por voz.

---

## Links Importantes

- **Produção:** https://eden-de-volta-ao-principio.vercel.app

