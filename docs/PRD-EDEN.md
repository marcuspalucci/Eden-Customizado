# PRD - ÉDEN: Plataforma de Estudo Bíblico com IA

**Versão:** 1.0
**Data:** 02/02/2026
**Produto:** ÉDEN – De volta ao princípio
**Status:** Em Produção

---

## 1. VISÃO GERAL DO PRODUTO

### 1.1 Resumo Executivo

**ÉDEN** é uma plataforma de estudo bíblico avançada que utiliza Inteligência Artificial (Google Gemini) para proporcionar uma experiência de aprendizado profunda e interativa. A plataforma oferece análises teológicas, exegéticas, mapas bíblicos interativos, estudo interlinear palavra-por-palavra, devocionais diários e ferramentas de pesquisa — tudo em um único ambiente web responsivo.

### 1.2 Problema que Resolve

- **Fragmentação de ferramentas**: Usuários precisam de múltiplos aplicativos para estudo bíblico completo
- **Barreiras linguísticas**: Dificuldade de acessar textos originais (hebraico/grego)
- **Falta de profundidade**: Apps bíblicos tradicionais oferecem apenas texto, sem análise contextual
- **Custo de materiais**: Comentários teológicos e recursos de estudo são caros
- **Experiência espiritual**: Devocionais genéricos sem personalização

### 1.3 Proposta de Valor

> "Uma plataforma completa que transforma o estudo bíblico em uma experiência visual, interativa e profunda, acessível a qualquer pessoa, em qualquer idioma."

---

## 2. PÚBLICO-ALVO

### 2.1 Personas Primárias

| Persona | Descrição | Necessidades |
|---------|-----------|--------------|
| **Estudante Bíblico** | Cristão leigo querendo aprofundar conhecimento | Análises fáceis de entender, devocionais diários |
| **Seminarista/Teólogo** | Estudante de teologia ou pastor | Estudo interlinear, exegese, Strong's, análise profunda |
| **Professor de EBD** | Líder de escola dominical | Guias de estudo, mapas visuais, material didático |
| **Jovem/Adolescente** | Novos na fé buscando conexão | Conteúdo adaptado por idade, interface moderna |

### 2.2 Segmentação por Idade

- **Crianças (< 12)**: Bíblia Infantil, linguagem simplificada
- **Adolescentes (12-17)**: Bíblia Teen, conteúdo engajante
- **Adultos (18+)**: Traduções completas, análises avançadas

### 2.3 Mercados Geográficos

- **Primário**: Brasil (Português)
- **Secundário**: América Latina (Espanhol), EUA/UK (Inglês)

---

## 3. FUNCIONALIDADES DO PRODUTO

### 3.1 Módulos Principais

#### 📖 **Leitura Bíblica**
- 66 livros completos (Antigo e Novo Testamento)
- 11+ traduções em Português (NVI, ACF, ARA, NAA, NTLH, NVT, KJA, etc.)
- 3+ traduções em Inglês (NIV, KJV, ESV)
- 3+ traduções em Espanhol (RVR1960, NVI-ES)
- Navegação por livro/capítulo/versículo
- Modo de comparação lado-a-lado
- Áudio text-to-speech
- Referências cruzadas clicáveis

#### 📚 **Estudo Interlinear**
- Texto palavra-por-palavra (Hebraico/Grego)
- Transliteração fonética
- Tradução para português
- Códigos Strong para cada palavra
- Análise morfológica
- Clique para estudo lexical detalhado

#### 🎓 **Análise Teológica**
- Geração automática por capítulo
- Estilo Wayne Grudem (Teologia Sistemática)
- Temas doutrinários identificados
- Aplicações práticas
- Cache de sessão para performance

#### 📜 **Exegese Bíblica**
- Análise textual profunda
- Contexto histórico-cultural
- Estrutura literária
- Significado original
- Exegese personalizada (cole seu próprio texto)

#### 🗺️ **Mapas Bíblicos**
- Geração por IA de mapas educacionais
- Localizações extraídas automaticamente do texto
- Elementos didáticos: escala, bússola, legenda
- Contexto histórico e rotas comerciais
- Mapas personalizados por tema

#### 🙏 **Devocionais**
- **Devocional do Dia**: Conteúdo único diário com cache
- **Devocional Personalizado**: Por tema escolhido
- Estrutura: Título, Versículo, Reflexão, Oração, Citação Final
- Compartilhamento WhatsApp/Copiar
- 7 temas rotativos: Esperança, Gratidão, Fé, Amor, Sabedoria, Paz, Propósito

#### 📝 **Guia de Estudo**
- Gerado automaticamente por tema
- Adaptado por idade do usuário
- Material didático estruturado
- Questões para reflexão

### 3.2 Ferramentas Auxiliares (Painel Direito)

| Ferramenta | Descrição |
|------------|-----------|
| **Pesquisa** | Busca full-text em toda a Bíblia |
| **Notas** | Anotações pessoais com auto-save |
| **Estudo de Palavras** | Dicionário Strong's integrado |
| **Pontos de Restauração** | Salvar/carregar sessões de estudo |

### 3.3 Recursos de Conta

- Login com Email/Senha
- Login com Google OAuth
- Acesso como Visitante (temporário)
- Perfil com idade, nacionalidade, idioma
- Histórico de atividades
- Sincronização cross-device

---

## 4. ARQUITETURA TÉCNICA

### 4.1 Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
├─────────────────────────────────────────────────────────────┤
│  React 19  │  TypeScript 5.8  │  Vite 6  │  Tailwind CSS 4  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      FIREBASE SERVICES                       │
├─────────────────────────────────────────────────────────────┤
│    Auth    │   Firestore   │   Storage   │   Functions      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    INTELIGÊNCIA ARTIFICIAL                   │
├─────────────────────────────────────────────────────────────┤
│           Google Gemini 2.5 Flash Lite / Pro                 │
│        (Geração de texto, análises, mapas, imagens)         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Cloud Functions (18 Endpoints)

| Função | Propósito |
|--------|-----------|
| `getBibleContent` | Texto bíblico com cache 30 dias |
| `searchBibleReferences` | Pesquisa full-text |
| `generateTheologyAnalysis` | Análise teológica |
| `generateExegesisAnalysis` | Análise exegética |
| `generateStudyGuide` | Guia de estudo |
| `generateThematicStudy` | Estudo temático |
| `generateDailyDevotional` | Devocional por tema |
| `getDailyDevotional` | Devocional do dia (cached) |
| `findBiblicalLocations` | Extrair localizações + mapa |
| `generateCustomMapAnalysis` | Mapa personalizado |
| `generateInterlinearChapter` | Interlinear palavra-por-palavra |
| `getWordDefinition` | Definição lexical Strong's |
| `analyzeKeywordsInVerse` | Análise de palavras-chave |
| `generateImage` | Geração de imagens |
| `translateForAudio` | Tradução para TTS |
| `askLibraryAgent` | Agente IA para biblioteca |
| `cleanOldCache` | Limpeza de cache |
| `clearStrongCache` | Reset cache Strong's |

### 4.3 Coleções Firestore

| Coleção | Propósito | TTL |
|---------|-----------|-----|
| `users` | Perfis de usuário | Permanente |
| `users/{id}/restore_points` | Sessões salvas | Permanente |
| `users/{id}/notes` | Notas pessoais | Permanente |
| `bible_cache` | Cache de texto bíblico | 30 dias |
| `daily_devotionals` | Cache devocionais | 24 horas |
| `library` | Recursos de estudo | Permanente |
| `history` | Histórico de atividade | Permanente |

---

## 5. REQUISITOS NÃO-FUNCIONAIS

### 5.1 Performance

| Métrica | Meta |
|---------|------|
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3s |
| Geração de conteúdo IA | < 10s |
| Cache hit rate | > 80% |

### 5.2 Disponibilidade

- **Uptime**: 99.5%
- **Recuperação de desastres**: Firebase automatic backups
- **CDN**: Vercel Edge Network

### 5.3 Segurança

- Autenticação Firebase Auth
- Regras Firestore baseadas em roles
- API keys no servidor (não expostas)
- HTTPS obrigatório
- Rate limiting em Cloud Functions

### 5.4 Escalabilidade

- Cloud Functions auto-scaling
- Firestore horizontal scaling
- Cache em múltiplas camadas (memória + Firestore)

### 5.5 Internacionalização

- 3 idiomas suportados (PT, EN, ES)
- UI totalmente traduzida
- Conteúdo gerado no idioma do usuário
- Traduções bíblicas por região

---

## 6. ROADMAP

### 6.1 Versão Atual (v1.0) ✅

- [x] Leitura bíblica com múltiplas traduções
- [x] Estudo interlinear Hebraico/Grego
- [x] Análises teológicas e exegéticas
- [x] Mapas bíblicos educacionais
- [x] Devocionais diários e personalizados
- [x] Sistema de notas e pontos de restauração
- [x] Autenticação Google/Email
- [x] Suporte a 3 idiomas

### 6.2 Próximas Versões

**v1.1 - Melhorias de UX**
- [ ] Highlight de parágrafos durante áudio
- [ ] Temas visuais (claro/escuro/sépia)
- [ ] Atalhos de teclado
- [ ] PWA offline mode

**v1.2 - Recursos Sociais**
- [ ] Compartilhamento de estudos
- [ ] Grupos de estudo
- [ ] Comentários em versículos
- [ ] Planos de leitura

**v2.0 - Expansão**
- [ ] App mobile nativo (React Native)
- [ ] Mais idiomas (Francês, Alemão)
- [ ] Integração com YouTube (sermões)
- [ ] API pública para desenvolvedores

---

## 7. MÉTRICAS DE SUCESSO

### 7.1 KPIs de Produto

| Métrica | Meta Mensal |
|---------|-------------|
| Usuários Ativos | 1.000+ |
| Sessões por usuário | 5+ |
| Tempo médio de sessão | 15+ min |
| Taxa de retenção D7 | > 40% |
| NPS | > 50 |

### 7.2 KPIs Técnicos

| Métrica | Meta |
|---------|------|
| Error rate | < 1% |
| P95 latency | < 5s |
| Custo por usuário | < $0.05/mês |

---

## 8. RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Custo de API Gemini | Média | Alto | Cache agressivo, rate limiting |
| Conteúdo gerado impreciso | Baixa | Médio | Prompts refinados, disclaimers |
| Indisponibilidade Firebase | Baixa | Alto | Monitoramento, fallbacks |
| LGPD/Privacidade | Média | Alto | Política de privacidade, consent |

---

## 9. GLOSSÁRIO

| Termo | Definição |
|-------|-----------|
| **Interlinear** | Texto bíblico com tradução palavra-por-palavra |
| **Strong's** | Sistema de numeração para palavras hebraicas/gregas |
| **Exegese** | Análise crítica e interpretação de texto bíblico |
| **Devocional** | Texto curto para reflexão espiritual diária |
| **Cache TTL** | Tempo de vida de dados em cache |

---

## 10. CONTATOS

| Papel | Responsável |
|-------|-------------|
| Product Owner | Marcus Palucci |
| Desenvolvimento | Equipe ÉDEN |
| Infraestrutura | Firebase/Vercel |
| IA/ML | Google Gemini |

---

**Documento gerado em:** 02/02/2026
**Última atualização:** 02/02/2026
**Próxima revisão:** 02/03/2026
