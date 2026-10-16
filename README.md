```markdown
# 🎯 QualiVaga

> **Assistente Inteligente e Privado de Candidatura para Gupy**  
> Extensão nativa para Google Chrome (Manifest V3) desenvolvida em **JavaScript Vanilla**, sem dependências de execução, sem pipeline de *build* e com foco rigoroso em privacidade, acurácia e resiliência a SPAs.

---

> 🚧 **STATUS DO PROJETO: EM DESENVOLVIMENTO ATIVO (WIP / MVP)**  
> O **QualiVaga** é um projeto experimental em fase de construção, validação técnica e testes iterativos. **Esta aplicação ainda não é um produto finalizado.** Recursos, seletores de DOM e fluxos de IA continuam sendo aprimorados continuamente.

---

## 📌 Status dos Módulos

| Módulo / Funcionalidade | Status | Descrição |
| :--- | :---: | :--- |
| **Arquitetura Base (Manifest V3)** | ✅ Concluído | Comunicação isolada via *Service Worker* e *Options UI*. |
| **Extração de Descrição (JD) e Perguntas** | 🚧 Em Testes | Mapeamento dinâmico no DOM da Gupy (sujeito a variações do layout). |
| **Análise e Matching com IA (`gpt-4o-mini`)** | 🚧 Em Validação | Prompts e estruturação do JSON de resposta em fase de ajustes. |
| **Injeção de Eventos React/Vue** | 🚧 Em Dev | Simulação nativa de `input`/`change`/`blur` para persistência no cliente. |
| **Suíte de Testes Locais e CDP** | 🧪 Ativo | Validações sintéticas ativas via Playwright e formulários em memória. |

---

## ✨ Destaques Técnicos

* **⚡ Zero Build & Zero Dependencies:** Código executável em JS puro. Nenhuma camada de transpilação ou pacote de terceiros em produção.
* **🔒 Privacidade por Design (`store: false`):** Seus dados profissionais e chave de API nunca passam por servidores intermediários; a comunicação ocorre direto entre o navegador e a OpenAI.
* **⚛️ Integração Nativa com React/Vue:** Simulação precisa de eventos do DOM (`input`, `change`, `blur`) e manipuladores de estado nativos para garantir a persistência no formulário da Gupy.
* **🛡️ Execução Segura em Shadow DOM:** Interface do *widget* totalmente isolada do CSS da página hospedeira.

---

## 🚀 Guia de Instalação (Ambiente de Desenvolvimento)

1. Acesse no Chrome: `chrome://extensions`
2. Ative o **Modo do desenvolvedor** no canto superior direito.
3. Clique em **Carregar sem compactação** e selecione a pasta raiz deste repositório (onde está o `manifest.json`).
4. Abra as **Configurações** da extensão (clicando no ícone dela):
   * Insira sua API Key da OpenAI (modelo `gpt-4o-mini`).
   * Cadastre o seu **Master Profile** em formato JSON.
   * Salve as alterações.
5. Acesse ou recarregue qualquer página da **Gupy** (`https://*.gupy.io/*`). O widget aparecerá no canto inferior direito.

---

## 🔄 Fluxo de Uso em 3 Passos

```text
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│  1. Revisar Descrição   │ ──> │   2. Analisar com IA    │ ──> │ 3. Preencher e Aplicar  │
│  Extrai JD e questões.  │     │  Calcula Match Score e  │     │ Injeta respostas no DOM │
│ Ajuste manual se preciso│     │  gera sugestões custom. │     │  mantendo rascunhos.    │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘

```

1. **Revisar Descrição:** Expanda **Revisar descrição enviada**. Confira o texto da vaga (JD) e as perguntas capturadas (cole manualmente se a etapa não contiver a JD).
2. **Analisar:** Autorize o envio e clique em **Analisar**. A extensão avaliará o alinhamento do perfil e gerará sugestões para até 20 perguntas abertas.
3. **Preencher e Aplicar:** Revise a nota estimada, edite os textos gerados conforme necessário, selecione os campos desejados e clique em **Preencher respostas selecionadas**.

---

## 📂 Mapeamento do Repositório

```text
QualiVaga/
├── manifest.json            # Configuração MV3, permissões, content script, worker e CSP
├── options.html / .js       # Interface de configuração, validação de JSON e chave OpenAI
├── background.js            # Service Worker: validação, sanitização e chamadas à OpenAI
├── content.js               # Content Script: extração do DOM, observação de SPAs e auto-fill
├── styles.css               # Estilos prefixados e isolados via Shadow DOM
└── tests/
    ├── background.test.cjs  # Testes unitários do worker (sem API ou libs externas)
    ├── browser.test.cjs     # Testes E2E no Chrome headless via Playwright e CDP
    └── inspect-live.cjs     # Inspeção read-only em vagas públicas da Gupy

```

---

## 🛡️ Arquitetura, Segurança e Privacidade

```text
┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
│  Content Script  │ ────────> │Background Worker │ ────────> │   OpenAI API     │
│ (Captura/Preenche│  ANALYZE  │ (Valida/Sanitiza │ HTTPS Auth│  (gpt-4o-mini)   │
│      DOM)        │  CANCEL   │  e faz Chamada)  │           │                  │
└──────────────────┘           └──────────────────┘           └──────────────────┘

```

* **Isolamento de Comunicação:** Não utiliza `window.postMessage` nem aceita mensagens externas. A chave de API e o perfil são lidos apenas pelo *Worker* e pela tela de *Options*.
* **Storage Local Seguro:** Usa `chrome.storage.local` restrito a `TRUSTED_CONTEXTS`. Sem sincronização em nuvem ou logs de prompts.
* **Sanitização de Payloads:** Remove heuristicamente e-mails, CPFs, telefones, senhas e URLs antes de enviar à OpenAI. Usa `store: false` nas requisições.
* **Resiliência de Rede:** Timeout de 25s, backoff exponencial com jitter e até 3 tentativas automáticas para erros 429/5xx.

---

## 🔍 Regras de Captura, Limitações e DOM

* **Mapeamento Semântico:** Prioriza seções públicas (*Descrição*, *Responsabilidades*, *Requisitos*, *Informações Adicionais*).
* **Notificação ao React/Vue:** Utiliza o *setter* nativo do elemento e dispara manualmente `input`, `change` e `blur`.
* **Campos Preservados:** Nunca sobrescreve campos já preenchidos.
* **Exclusões Heurísticas:** Ignora upload de arquivos, selects, radios, senhas, documentos, contatos e testes automatizados.

---

## 🧪 Verificação e Suíte de Testes

### 1. Testes Nativos de Sintaxe e Worker (Node.js 18+)

```powershell
node --check background.js
node --check content.js
node --check options.js
node --test tests/background.test.cjs

```

### 2. Testes E2E e Automação de Navegador (Node.js 20+)

```powershell
# Instala dependências restritas de teste
npm ci

# Executa a suíte completa
npm test

# Teste de navegador sintético via CDP/Playwright
npm run test:browser

# Inspeção em vaga pública real da Gupy
npm run test:live

```

---

## 🔄 Procedimento de Recarga em Desenvolvimento

Após modificar `content.js` ou `styles.css`:

1. Acesse `chrome://extensions`.
2. Clique em **Recarregar** no cartão da extensão **QualiVaga**.
3. Atualize a aba aberta na Gupy (`F5` ou `Ctrl+R`).

---
