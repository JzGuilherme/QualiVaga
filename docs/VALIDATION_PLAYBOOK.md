# Playbook de Validação de Hipótese, Testes Alpha/Beta e Debug de Dados — QualiVaga

Este documento consolida a metodologia de engenharia de produto e QA do **QualiVaga** para distinguir **bugs técnicos de código** de **falhas na proposta de valor** e embasar decisões de **Escalar, Iterar ou Pivotar**.

---

## 1. Hipóteses de Produto

### 1.1 Hipótese de Valor (Value Hypothesis)
> *"O usuário carrega seu currículo JSON padronizado (`resume.schema.json`), descobre vagas reais aderentes na **Gupy**, **LinkedIn** e **InfoJobs** em `< 5.000 ms` ranqueadas por Match Score Híbrido explicável, e preenche formulários reativos (React 16+, Vue 3, `contenteditable`) com **100% de retenção no DOM** e **zero alucinação** (`fato_base_curriculo` obrigatório)."*

### 1.2 Hipótese de Crescimento (Growth Hypothesis)
> *"Candidatos técnicos (Desenvolvedores, Engenheiros de Software e QAs) adotam e recomendam o QualiVaga organicamente (Build in Public / GitHub Open Source) porque ele elimina o atrito mecânico de buscar vagas em múltiplos portais e redigir respostas repetitivas, mantendo 100% de privacidade local (`chrome.storage.local` + `store: false` na OpenAI) e controle humano antes do envio."*

---

## 2. Personas Sintéticas de Validação (`tests/fixtures/personas/`)

Para eliminar viés de teste manual, toda validação Alpha executa contra **3 Personas padronizadas**:

| Persona | Arquivo | Senioridade | Stack Principal (`hard_skills`) |
| :--- | :--- | :--- | :--- |
| **1. Dev Júnior** | `persona-dev-junior.json` | `junior` | `React`, `Next.js`, `TypeScript`, `Node.js`, `PostgreSQL`, `Prisma`, `JavaScript`, `HTML5`, `CSS3`, `Git` |
| **2. Eng. Back-end Pleno** | `persona-eng-backend-pleno.json` | `pleno` | `Java`, `Spring Boot`, `Docker`, `AWS`, `PostgreSQL`, `MySQL`, `Kafka`, `Redis`, `CI/CD`, `Linux` |
| **3. QA / SDET Pleno** | `persona-qa-sdet.json` | `pleno` | `Playwright`, `Cypress`, `Jest`, `TypeScript`, `JavaScript`, `CI/CD`, `REST API`, `SQL`, `Docker`, `Node.js` |

---

## 3. Resultados Esperados no Motor de Match Híbrido (`src/match-engine.js`)

O cálculo híbrido combina:
- **Camada 1 Determinística (`computeDeterministicMatch` — Peso 60%):**
  - *Hard Skills (até 65 pts)* + *Senioridade (até 20 pts)* + *Modalidade Remoto/Híbrido/Presencial (até 15 pts)*.
- **Camada 2 Semântica (`gpt-4o-mini` / `estimateExperienceRelevance` — Peso 40%):**
  - Avalia a correlação real entre os projetos/experiências (`projetos_e_experiencias`) da Persona e os requisitos da vaga.
- **Score Final (`combineHybridScore`):** $\text{round}(\text{Determinístico} \times 0.60 + \text{Semântico} \times 0.40)$.

### Matriz de Aderência Esperada por Persona

| Persona | Vaga Alvo Compatível (Alta Aderência) | Vaga Desalinhada (Baixa Aderência) |
| :--- | :--- | :--- |
| `persona-dev-junior.json` | **Vaga Dev Full Stack Júnior (React/Next.js/Node/PostgreSQL - Remoto)**: `deterministicScore >= 85`, `finalScore >= 85` | **Vaga Eng. Java Sênior Presencial**: `deterministicScore <= 35`, `missingSkills` inclui `Java`, `Spring Boot`, `AWS` |
| `persona-eng-backend-pleno.json` | **Vaga Eng. Back-end Java Pleno (Spring Boot/AWS/Docker/Kafka - Remoto)**: `deterministicScore >= 85`, `finalScore >= 85` | **Vaga Front-end Estágio React/Vue**: `deterministicScore <= 40`, `missingSkills` inclui `React`, `Vue` |
| `persona-qa-sdet.json` | **Vaga QA Automation / SDET Pleno (Playwright/TypeScript/CI-CD - Híbrido)**: `deterministicScore >= 85`, `finalScore >= 85` | **Vaga DBA Oracle Sênior**: `deterministicScore <= 35` |

---

## 4. Protocolo de Testes: Alpha vs. Beta

1. **Teste Alpha (`npm run test:alpha` — Ambiente Controlado e Determinístico):**
   - Isola flutuações externas da internet usando fixtures HTML/JSON fieis às estruturas reais da Gupy, LinkedIn e InfoJobs e mock na rota `**/v1/chat/completions`.
   - Verifica se os Adapters reportam erros explícitos (`HTTP_503`, `BLOQUEIO_AUTHWALL_OU_CAPTCHA`, `SELETORES_HTML_NAO_ENCONTRADOS`) sem jamais injetar vagas falsas silenciosas.
   - Audita o Shadow DOM (`mode: "open"`) e a retenção de valores injetados em inputs controlados por React 19, `<textarea>` e `contenteditable="true"`.
2. **Teste Beta (`npm run test:beta` — Simulação Real / Early Adopters):**
   - Executa contra endpoints reais da rede e perfil autenticado (`.test-profile-auth/`, preservando abas restauradas via `selectStartPage`) para aferir saúde dos seletores e latência real.

---

## 5. Telemetria Local e Matriz de Decisão (`src/telemetry-debug.js` & `scripts/evaluate-mvp.cjs`)

Nenhum dado sai da máquina do usuário. O módulo `src/telemetry-debug.js` grava em `chrome.storage.local.qualivagaTelemetry`:
- `time_to_first_value_ms`: Meta `< 5000 ms`.
- `adapter_health_by_platform`: Status, latência (ms) e contagem de vagas para `Gupy`, `LinkedIn` e `InfoJobs`.
- `dom_injection_retention_rate`: Meta `100%` (verificado `100ms+` após `injectReactiveValue`).
- `grounding_compliance_rate`: Meta `100%` (presença obrigatória de `fato_base_curriculo` válido).
- `user_edit_ratio`: Taxa de caracteres editados manualmente pelo candidato após a sugestão da IA (`< 0.35` ideal; `> 0.50` indica necessidade de refinar o prompt).
