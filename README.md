# 🎯 QualiVaga — Motor Multi-Plataforma de Vagas & Copiloto de Candidatura (Manifest V3)

> **Motor de Descoberta, Curadoria de Vagas e Copiloto Ético de Candidatura de Precisão**  
> Extensão nativa para Google Chrome (**Manifest V3**) construída em **JavaScript Vanilla (Zero Build)**, com isolamento **Shadow DOM**, busca ativa multi-plataforma (**Gupy**, **LinkedIn** e **InfoJobs**), cálculo híbrido de **Match Score (%)**, trava anti-alucinação via **OpenAI Structured Outputs (`gpt-4o-mini`)** e suíte de auditoria **Playwright/CDP**.

---

## 💡 Visão do Produto

O **QualiVaga** **NÃO** é um disparador de spam de currículos em massa. Ele atua como um **Radar Inteligente e Copiloto de Precisão** sob controle humano:

1. **Currículo JSON Padronizado (`resume.schema.json`):** O usuário importa ou edita seu currículo estruturado localmente em `chrome.storage.local` (ou cola texto livre para conversão automática).
2. **Descoberta Multi-Plataforma em Tempo Real:** Com um clique em *"Rodar Busca pelo Meu Currículo"*, o Service Worker pesquisa simultaneamente vagas abertas na **Gupy**, **LinkedIn** e **InfoJobs**.
3. **Match Score Híbrido Explicável (60% Determinístico + 40% Semântico):**
   - **Camada 1 (Local / Rápida — Peso 60%):** Cruza deterministicamente `hard_skills`, senioridade (`estagio`, `junior`, `pleno`, `senior`, `especialista`, `lead`) e modalidade (`remoto`, `hibrido`, `presencial`) sem gastar tokens.
   - **Camada 2 (Semântica via `gpt-4o-mini` — Peso 40%):** Avalia a aderência real entre os projetos/experiências do candidato e os requisitos da vaga.
4. **Painel Consolidado ("Encontramos X vagas compatíveis com o seu currículo"):** Lista ranqueada por Match Score (%), com filtros por plataforma, tags de competências encontradas/faltantes e botão *"Abrir com Copiloto"*.
5. **Copiloto Ético na Página da Vaga (Zero Alucinação):** Gera rascunhos em primeira pessoa exigindo citação explícita do item real do currículo (`fato_base_curriculo`) e preenche formulários reativos (**React 16+**, **Vue 3** e `contenteditable="true"`) simulando a cadeia completa de eventos nativos do navegador.

---

## 📌 Status dos Módulos

| Módulo / Funcionalidade | Status | Descrição |
| :--- | :---: | :--- |
| **Arquitetura Manifest V3 (Zero Build)** | ✅ Concluído | Service Worker ES6 Modules (`background.js`), Content Script e Popup/Options UI sem bundlers em produção. |
| **Schema & Validador de Currículo (`resume.schema.json`)** | ✅ Concluído | Validação estrita, normalização e conversão de texto livre em `src/resume-validator.js`. |
| **Job Discovery Engine (`Gupy`, `LinkedIn`, `InfoJobs`)** | ✅ Concluído | Padrão Adapter (`src/adapters.js`) com fallback SSR/DOM e diagnóstico transparente sem mocks silenciosos. |
| **Motor de Match Score Híbrido (`src/match-engine.js`)** | ✅ Concluído | Ponderação 60% determinística local + 40% semântica via `gpt-4o-mini`. |
| **Trava Anti-Alucinação (`strict: true` + `store: false`)** | ✅ Concluído | OpenAI Structured Outputs com `fato_base_curriculo` obrigatório e sanitização de PII. |
| **Injeção Resiliente em DOM Reativo (React / Vue / Rich Text)** | ✅ Concluído | Bypass de Virtual DOM via native prototype setters + cadeia de 7 eventos e `MutationObserver`. |
| **Telemetria Local de KPIs & Matriz de Decisão Alpha/Beta** | ✅ Concluído | Medição local em `src/telemetry-debug.js` e veredito automático em `scripts/evaluate-mvp.cjs`. |

---

## 🏗️ Arquitetura Técnica e Segurança

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         QUALIVAGA — ARQUITETURA MV3                          │
├───────────────────────┬──────────────────────────┬───────────────────────────┤
│   Content Script      │   Service Worker (ES6)   │   Portais & OpenAI API    │
│   (content.js)        │   (background.js)        │                           │
│                       │                          │  • Gupy (API + SSR Next)  │
│ • Shadow DOM (open)   │ • JobDiscoveryEngine     │  • LinkedIn Guest Jobs    │
│ • Extração JD/Campos  │ • Match Engine (60/40)   │  • InfoJobs Brasil SSR    │
│ • Native Setter React │ • Sanitização de PII     │  • OpenAI (gpt-4o-mini)   │
│ • DOM Fallback Tab    │ • Storage Session/Local  │    store: false / strict  │
└───────────────────────┴──────────────────────────┴───────────────────────────┘
```

### Garantias de Segurança e Privacidade
* **Isolamento Total da Chave (`TRUSTED_CONTEXTS`):** A `apiKey` da OpenAI jamais transita pelo `content.js` ou páginas de terceiros. Todas as requisições saem exclusivamente do Service Worker (`background.js`) com `"store": false` e `temperature: 0.2`.
* **Sanitização Heurística de PII (`cleanText` / `cleanProfile`):** Antes de qualquer chamada à OpenAI, chaves `sk-*`, CPFs, telefones, e-mails, endereços, senhas e atributos sensíveis são removidos.
* **Evidence-Based Grounding (Proibido Inventar Fatos):** O schema JSON estrito (`response_format: { type: "json_schema", json_schema: { strict: true } }`) obriga o modelo a preencher `fato_base_curriculo` antes de `rascunho_resposta`. Quando há lacuna técnica no currículo, o modelo declara a lacuna honestamente e destaca projetos correlatos e capacidade de aprendizado.
* **Zero `innerHTML`:** Toda construção de interface em `content.js` e `options.js` utiliza exclusivamente `document.createElement` e `textContent`, prevenindo vetores de XSS.

---

## ⚛️ Motor Resiliente de Injeção no DOM (`injectReactiveValue`)

Para garantir que SPAs modernas em **React 16/17/18/19**, **Vue 3** e editores Rich Text (`contenteditable="true"`) reconheçam e persistam o valor preenchido sem sobrescrevê-lo no próximo ciclo de renderização:

1. `element.focus()`
2. `new FocusEvent('focusin', { bubbles: true })`
3. Mutação via **Native Prototype Setter** (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` / `HTMLTextAreaElement.prototype`) ou `textContent` para `isContentEditable`
4. `new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value })`
5. `new Event('change', { bubbles: true })`
6. `new FocusEvent('blur', { bubbles: true })`
7. `new FocusEvent('focusout', { bubbles: true })`

---

## 📂 Estrutura do Repositório

```text
QualiVaga/
├── manifest.json                         # Configuração Chrome Extension Manifest V3
├── jsconfig.json                         # Tipagem estática Zero-Build com checkJs: true
├── background.js                         # Service Worker: Orquestração, Segurança e OpenAI API
├── content.js                            # Content Script: Painel Shadow DOM e Injeção Reativa
├── options.html / options.js             # UI Principal: Radar de Vagas, Meu Currículo e KPIs
├── styles.css                            # Estilos encapsulados do Shadow DOM e Options UI
├── resume.schema.json                    # JSON Schema Draft 2020-12 do currículo padronizado
├── resume.example.json                   # Exemplo público de currículo estruturado
├── .env.example                          # Template de variáveis para testes locais/Playwright
├── src/
│   ├── adapters.js                       # GupyAdapter, LinkedInAdapter, InfoJobsAdapter e Engine
│   ├── match-engine.js                   # Cálculo de Match Score Híbrido (Determinístico + Semântico)
│   ├── resume-validator.js               # Validador, normalizador e conversor Texto -> JSON
│   └── telemetry-debug.js                # Coleta 100% local de KPIs técnicos e de produto
├── docs/
│   └── VALIDATION_PLAYBOOK.md            # Hipóteses de Valor/Crescimento e Matriz de Personas
├── scripts/
│   └── evaluate-mvp.cjs                  # Runner da Matriz de Decisão (Escalar, Iterar ou Pivotar)
└── tests/
    ├── alpha-personas.test.cjs           # Testes Alpha controlados com as 3 Personas sintéticas
    ├── beta-live.test.cjs                # Sonda Beta em Rede Real dentro do Chromium MV3
    ├── background.test.cjs               # Testes unitários de segurança, retry e sanitização
    ├── browser.test.cjs                  # Testes E2E Playwright/CDP com React 19 e Shadow DOM
    ├── auth-session.test.cjs             # Testes de preservação de sessão autenticada da Gupy
    ├── load-env.cjs                      # Carregador Zero-Build de variáveis do arquivo .env
    └── fixtures/personas/                # Currículos sintéticos (Dev Jr, Back-end Pleno, QA SDET)
```

---

## 🚀 Instalação e Configuração

### 1. Carregar a Extensão no Google Chrome
1. Abra `chrome://extensions` no navegador.
2. Ative a chave **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta raiz `QualiVaga`.
4. Clique no ícone da extensão para abrir o painel **Radar Multi-Plataforma & Currículo**:
   - Na aba **Meu Currículo**, importe seu JSON (seguindo `resume.example.json`) ou cole seu currículo e salve.
   - Opcionalmente, adicione sua chave `sk-...` da OpenAI para habilitar a Camada 2 semântica e o Copiloto de respostas abertas.
   - Na aba **Radar de Vagas**, clique em **Rodar Busca pelo Meu Currículo**.

### 2. Configuração do `.env` para Scripts de Terminal / Playwright
Copie o arquivo `.env.example` para `.env` na raiz (o arquivo `.env` e `meu-curriculo.json` são ignorados pelo `.gitignore`):

```dotenv
# Arquivo .env (Ignorado pelo .gitignore — Uso exclusivo dos scripts Node/Playwright)
OPENAI_API_KEY=sk-proj-sua-chave-aqui-se-for-testar-no-terminal
QUALIVAGA_RESUME_PATH=./meu-curriculo.json
QUALIVAGA_HEADLESS=true
```

---

## 🧪 Suíte de Testes (Alpha, Beta e Matriz de Decisão)

```powershell
# 1. Instalar dependências de desenvolvimento (Playwright, React p/ fixture E2E, esbuild)
npm ci

# 2. Executar testes rápidos (Unitários + Segurança + Personas Alpha)
npm test

# 3. Executar Suíte Alpha Completa (Mocks determinísticos + E2E Chromium/React/Shadow DOM)
npm run test:alpha

# 4. Executar Sonda Beta em Rede Real (Chromium MV3 Service Worker consultando Gupy, LinkedIn e InfoJobs)
npm run test:beta

# 5. Executar Pipeline Completo de Validação de MVP + Matriz de Decisão (Escalar / Iterar / Pivotar)
npm run validate:mvp
```

---

## 🗺️ Roadmap Futuro (Pós-MVP)

O MVP atual mantém foco estrito e alta confiabilidade nas **3 maiores plataformas de empregos do Brasil (`Gupy`, `LinkedIn` e `InfoJobs`)**. As próximas evoluções previstas incluem:
- [ ] Novos Adapters especializados para portais nichados de tecnologia (**Programathor**, **GeekHunter**, **Remotar**, **Coodesh**).
- [ ] Adapters para agregadores globais e nacionais (**Glassdoor**, **Indeed**, **Catho**, **Wellfound**).
- [ ] Modo de comparação lado a lado de requisitos faltantes (*Gap Analysis*) com trilha de estudos recomendada.
- [ ] Exportação de histórico de candidaturas realizadas em formato CSV/Markdown local.
