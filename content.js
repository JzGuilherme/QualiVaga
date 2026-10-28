// @ts-check
(() => {
  "use strict";
  if (/** @type {any} */ (globalThis).__qualiVagaLoaded) return;
  /** @type {any} */ (globalThis).__qualiVagaLoaded = true;

  const prefix = "gupy-ai-helper-";
  const host = document.createElement("div");
  host.id = `${prefix}root`;
  // Open shadow root maintains 100% CSS encapsulation against the host page while allowing E2E Playwright auditability.
  const shadow = host.attachShadow({ mode: "open" });
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("styles.css");
  shadow.append(stylesheet);

  /**
   * Safe DOM element factory using textContent only.
   * @param {string} tag
   * @param {string} [text]
   * @param {string} [className]
   * @returns {HTMLElement}
   */
  const make = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = prefix + className;
    return el;
  };

  const panel = make("section", "", "panel");
  panel.setAttribute("aria-label", "Assistente QualiVaga");
  const header = make("div", "", "header");
  const brandWrap = make("div", "", "brand-wrap");
  brandWrap.append(make("strong", "QualiVaga"), make("span", detectPlatformName(), "badge"));
  const toggle = /** @type {HTMLButtonElement} */ (make("button", "Minimizar", "secondary"));
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-controls", `${prefix}body`);
  header.append(brandWrap, toggle);

  const body = make("div", "", "body");
  body.id = `${prefix}body`;

  // Navigation Tabs inside Shadow DOM Panel: Copiloto | Radar de Vagas | Meu Currículo
  const nav = make("div", "", "tabs");
  const tabCopilotBtn = /** @type {HTMLButtonElement} */ (make("button", "Copiloto", "tab-active"));
  const tabRadarBtn = /** @type {HTMLButtonElement} */ (make("button", "Radar de Vagas", "secondary"));
  const tabResumeBtn = /** @type {HTMLButtonElement} */ (make("button", "Meu Currículo", "secondary"));
  for (const b of [tabCopilotBtn, tabRadarBtn, tabResumeBtn]) b.type = "button";
  nav.append(tabCopilotBtn, tabRadarBtn, tabResumeBtn);

  // --- SECTION 1: COPILOTO DE CANDIDATURA (Current Page) ---
  const copilotSection = make("div", "", "section-copilot");
  const title = make("p", "", "job-title");
  const count = make("p", "", "muted");
  const details = /** @type {HTMLDetailsElement} */ (make("details"));
  details.append(make("summary", "Revisar descrição enviada"));
  const jdLabel = make("label", "Descrição da vaga (editável)");
  const jd = /** @type {HTMLTextAreaElement} */ (make("textarea"));
  jd.rows = 8;
  jd.maxLength = 24000;
  jdLabel.append(jd);
  details.append(
    jdLabel,
    make("p", "Remova nomes, endereços e qualquer informação pessoal restante. A limpeza automática é heurística.", "muted")
  );
  const questionPreview = make("div", "", "questions");
  details.append(questionPreview);

  const consent = make("label", "", "consent");
  const consentBox = /** @type {HTMLInputElement} */ (make("input"));
  consentBox.type = "checkbox";
  consent.append(
    consentBox,
    document.createTextNode(" Enviar descrição, perguntas e perfil profissional à OpenAI para esta análise.")
  );

  const actions = make("div", "", "actions");
  const analyze = /** @type {HTMLButtonElement} */ (make("button", "Analisar"));
  const refresh = /** @type {HTMLButtonElement} */ (make("button", "Reler página", "secondary"));
  const settings = /** @type {HTMLButtonElement} */ (make("button", "Configurações", "secondary"));
  for (const button of [analyze, refresh, settings]) button.type = "button";
  actions.append(analyze, refresh, settings);

  const status = make("p", "Revise a descrição e autorize o envio para começar.", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const results = make("div", "", "results");
  const fill = /** @type {HTMLButtonElement} */ (make("button", "Preencher respostas selecionadas"));
  fill.type = "button";
  fill.hidden = true;

  copilotSection.append(
    title,
    count,
    details,
    consent,
    actions,
    status,
    results,
    fill,
    make("p", "Revise os fatos antes de preencher. O assistente não envia a candidatura.", "muted")
  );

  // --- SECTION 2: RADAR DE VAGAS (Multi-platform Discovery) ---
  const radarSection = make("div", "", "section-radar");
  radarSection.hidden = true;
  const runSearchBtn = /** @type {HTMLButtonElement} */ (make("button", "Rodar Busca pelo Meu Currículo", "primary-full"));
  runSearchBtn.type = "button";
  const radarStatus = make("p", "Varra Gupy, LinkedIn e InfoJobs em busca de vagas compatíveis.", "status");
  const radarHeader = make("h3", "", "radar-headline");
  radarHeader.hidden = true;

  const filterBar = make("div", "", "filter-bar");
  let activePlatformFilter = "Todas";
  const filterButtons = ["Todas", "Gupy", "LinkedIn", "InfoJobs"].map(plat => {
    const btn = /** @type {HTMLButtonElement} */ (make("button", plat, plat === "Todas" ? "tab-active" : "secondary"));
    btn.type = "button";
    btn.addEventListener("click", () => {
      activePlatformFilter = plat;
      for (const b of filterButtons) {
        b.className = prefix + (b.textContent === plat ? "tab-active" : "secondary");
      }
      renderRadarJobs(cachedDiscovery);
    });
    return btn;
  });
  filterBar.append(...filterButtons);
  const radarList = make("div", "", "radar-list");
  radarSection.append(runSearchBtn, radarStatus, radarHeader, filterBar, radarList);

  // --- SECTION 3: MEU CURRÍCULO (Inline Quick Editor) ---
  const resumeSection = make("div", "", "section-resume");
  resumeSection.hidden = true;
  const resumeHelp = make("p", "Cole seu currículo JSON padronizado (ou texto livre para conversão automática):", "muted");
  const resumeEditor = /** @type {HTMLTextAreaElement} */ (make("textarea"));
  resumeEditor.rows = 10;
  resumeEditor.maxLength = 25000;
  const saveResumeBtn = /** @type {HTMLButtonElement} */ (make("button", "Salvar Meu Currículo"));
  saveResumeBtn.type = "button";
  const resumeMsg = make("p", "", "muted");
  resumeSection.append(resumeHelp, resumeEditor, saveResumeBtn, resumeMsg);

  body.append(nav, copilotSection, radarSection, resumeSection);
  panel.append(header, body);
  shadow.append(panel);
  document.documentElement.append(host);

  function switchTab(target) {
    copilotSection.hidden = target !== "copilot";
    radarSection.hidden = target !== "radar";
    resumeSection.hidden = target !== "resume";
    tabCopilotBtn.className = prefix + (target === "copilot" ? "tab-active" : "secondary");
    tabRadarBtn.className = prefix + (target === "radar" ? "tab-active" : "secondary");
    tabResumeBtn.className = prefix + (target === "resume" ? "tab-active" : "secondary");
  }
  tabCopilotBtn.addEventListener("click", () => switchTab("copilot"));
  tabRadarBtn.addEventListener("click", () => {
    switchTab("radar");
    loadRadarState();
  });
  tabResumeBtn.addEventListener("click", () => {
    switchTab("resume");
  });

  let route = location.href;
  /** @type {Array<{el: HTMLElement, label: string, maxLength: number}>} */
  let fields = [];
  let revision = 0;
  let busy = false;
  let jdEdited = false;
  /** @type {Array<{field: {el: HTMLElement, label: string, maxLength: number, hint: string}, editor: HTMLTextAreaElement, selected: HTMLInputElement, originalDraft: string}>} */
  let entries = [];
  /** @type {any} */
  let cachedDiscovery = null;

  function detectPlatformName() {
    const h = location.hostname.toLowerCase();
    if (h.includes("linkedin.com")) return "LinkedIn";
    if (h.includes("infojobs.com.br")) return "InfoJobs";
    return "Gupy";
  }

  /**
   * Sanitizes text before displaying or sending to the background service worker.
   * @param {unknown} value
   * @param {number} [max]
   * @returns {string}
   */
  function clean(value, max = 24000) {
    return String(value || "")
      .replace(/<(script|style|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\bsk-[a-zA-Z0-9_-]+\b/g, "[CHAVE REMOVIDA]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL REMOVIDO]")
      .replace(/https?:\/\/\S+/gi, "[LINK REMOVIDO]")
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF REMOVIDO]")
      .replace(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}\b/g, "[TELEFONE REMOVIDO]")
      .replace(/\b(?:senha|password|token|api[_ -]?key|cpf|rg|endereço|address)\s*[:=][^\n]+/gi, "[DADO REMOVIDO]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  /**
   * @param {Element} el
   * @returns {boolean}
   */
  function visible(el) {
    const style = getComputedStyle(el);
    return (
      el.isConnected &&
      !el.closest('[hidden], [aria-hidden="true"], [inert]') &&
      el.getClientRects().length > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  /**
   * @param {Node} root
   * @param {Range[] | null} [ranges]
   * @returns {string}
   */
  function readText(root, ranges = null) {
    const parts = [];
    let size = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (ranges && !ranges.some(range => range.intersectsNode(node))) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest(
            "script, style, noscript, iframe, nav, header, footer, form, input, textarea, select, button, [contenteditable], [hidden], [aria-hidden='true']"
          ) ||
          !visible(parent)
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode() && size < 48000) {
      const text = (walker.currentNode.textContent || "").trim();
      if (text) {
        parts.push(text);
        size += text.length;
      }
    }
    return clean(parts.join("\n"));
  }

  function readJob() {
    const heading = [
      ...document.querySelectorAll(
        '[data-testid="job-title"], [data-testid="jobTitle"], .job-details-jobs-unified-top-card__job-title, .js_jobTitle, h1'
      )
    ].find(visible);
    // Gupy public pages expose the job as adjacent sections, not one JD element.
    const sectionTitles = [...document.querySelectorAll('h2[data-testid^="section-"]')].filter(visible);
    const relevantTitles = sectionTitles.filter(el =>
      /^(descricao da vaga|responsabilidades e atribuicoes|requisitos e qualificacoes|informacoes adicionais)$/i.test(
        normalize(el.textContent)
      )
    );
    const sections = relevantTitles.map(el => {
      const range = document.createRange();
      range.setStartBefore(el);
      const next = sectionTitles[sectionTitles.indexOf(el) + 1];
      if (next) range.setEndBefore(next);
      else {
        const container = el.closest("section") || el.parentElement;
        if (container) range.setEndAfter(container);
      }
      return range;
    });
    let sectionText = "";
    if (sections.length) {
      const main = document.querySelector('main, [role="main"]');
      if (main) sectionText = readText(main, sections);
    }
    const selectors = [
      '[data-testid="job-description"]',
      '[data-testid="jobDescription"]',
      '[id="job-description"]',
      '[id="job-details"]',
      '.jobs-description__content',
      '.js_vacancyDataPanels',
      '[itemprop="description"]',
      "main",
      '[role="main"]',
      "article"
    ];
    let description = sectionText.length >= 100 ? sectionText : "";
    for (const selector of selectors) {
      if (description) break;
      const nodes = [...document.querySelectorAll(selector)].filter(visible);
      const text = nodes.map(n => readText(n)).join("\n");
      if (text.length >= 100) {
        description = clean(text);
        break;
      }
    }
    return { title: clean(heading?.textContent || document.title, 500), description };
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /**
   * @param {Element | null} node
   * @returns {string}
   */
  function labelText(node) {
    if (!node) return "";
    if (node.matches("input,textarea,select,button,output,[contenteditable]")) return "";
    const clone = /** @type {Element} */ (node.cloneNode(true));
    clone
      .querySelectorAll('input,textarea,select,button,output,[contenteditable],script,style,[hidden],[aria-hidden="true"]')
      .forEach(el => el.remove());
    return clean(clone.textContent, 650);
  }

  /**
   * @param {HTMLElement} el
   * @returns {string}
   */
  function labelFor(el) {
    const labelledBy = (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map(id => labelText(document.getElementById(id)))
      .join(" ")
      .trim();
    const htmlEl = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el);
    const labels = [...(htmlEl.labels || [])].map(labelText).join(" ").trim();
    const explicit = labelledBy || labels || el.getAttribute("aria-label");
    if (explicit) return clean(explicit, 650);
    let container = el.parentElement;
    for (let depth = 0; container && depth < 4; depth++, container = container.parentElement) {
      if (
        container.matches("form,main,body") ||
        container.querySelectorAll('input,textarea,select,[contenteditable="true"]').length !== 1
      ) {
        break;
      }
      const headings = [...container.querySelectorAll('legend,label,h2,h3,h4,[data-testid*="question-title"]')].filter(
        visible
      );
      if (headings.length === 1 && labelText(headings[0])) return labelText(headings[0]);
    }
    const placeholder = clean(el.getAttribute("placeholder"), 650);
    return /^(digite|escreva|insira|sua resposta|responda|type|enter|your answer)/i.test(normalize(placeholder))
      ? ""
      : placeholder;
  }

  /**
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function isRichText(el) {
    return el.isContentEditable || el.getAttribute("contenteditable") === "true";
  }

  /**
   * Reads the current text value of an input, textarea, or contenteditable element.
   * @param {HTMLElement} el
   * @returns {string}
   */
  function getFieldValue(el) {
    if (isRichText(el)) return (el.textContent || "").trim();
    return String(/** @type {HTMLInputElement | HTMLTextAreaElement} */ (el).value || "").trim();
  }

  /**
   * @param {HTMLElement} el
   * @param {string} label
   * @returns {boolean}
   */
  function eligible(el, label) {
    const inputEl = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el);
    if (
      !label ||
      !visible(el) ||
      el.matches(":disabled") ||
      inputEl.readOnly ||
      el.getAttribute("aria-readonly") === "true" ||
      el.closest('[aria-disabled="true"], fieldset:disabled')
    ) {
      return false;
    }
    if (el.tagName === "INPUT" && inputEl.type !== "text") return false;
    if (el.getAttribute("role") === "combobox" || el.hasAttribute("list")) return false;
    const identity = normalize(`${label} ${inputEl.name || ""} ${el.id || ""} ${inputEl.autocomplete || ""}`)
      .replace(/[_-]/g, " ")
      .replace(/\bbancos? de dados\b/g, "database");
    if (
      /\b(nome|name|email|e-mail|cpf|cnpj|rg|telefone|phone|celular|senha|password|endereco|address|cep|nascimento|birth|genero|gender|sexo|sexual|raca|racial|etnia|religiao|saude|health|deficiencia|pcd|banco|bank|pix|salario|salary|pretensao|pesquisar|search|buscar|login|url|linkedin|github|teste|prova|assessment)\b/.test(
        identity
      )
    ) {
      return false;
    }
    return (
      el.tagName === "TEXTAREA" ||
      isRichText(el) ||
      /\?|descreva|conte|experiencia|motivacao|por que|porque|habilidade|apresente|trajetoria|objetivo|describe|experience|why/i.test(
        normalize(label)
      )
    );
  }

  function scanFields() {
    return [
      ...document.querySelectorAll("textarea, input:not([type]), input[type='text'], [contenteditable='true']")
    ]
      .map(node => {
        const el = /** @type {HTMLElement} */ (node);
        const maxAttr = Number(el.getAttribute("maxlength"));
        const maxProp = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (el).maxLength;
        const maxLength = Number.isInteger(maxProp) && maxProp > 0 ? maxProp : Number.isInteger(maxAttr) && maxAttr > 0 ? maxAttr : -1;
        return { el, label: labelFor(el), maxLength };
      })
      .filter(field => eligible(field.el, field.label))
      .slice(0, 20);
  }

  /**
   * Injects text into React 16+, Vue 3, or contenteditable elements using native prototype setters
   * and the full synthetic event chain required by modern reactive frameworks.
   *
   * Event sequence:
   * 1. element.focus()
   * 2. new FocusEvent('focusin', { bubbles: true })
   * 3. Native prototype setter mutation (or textContent for contenteditable)
   * 4. new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value })
   * 5. new Event('change', { bubbles: true })
   * 6. new FocusEvent('blur', { bubbles: true })
   * 7. new FocusEvent('focusout', { bubbles: true })
   *
   * @param {HTMLElement} el
   * @param {string} value
   * @param {string} expectedLabel
   * @param {number} expectedVersion
   * @returns {Promise<boolean>}
   */
  async function injectReactiveValue(el, value, expectedLabel, expectedVersion) {
    el.focus();
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    // Focusing may synchronously restore a draft or replace/disable this field.
    const maxLen = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (el).maxLength;
    if (
      getFieldValue(el) ||
      !eligible(el, labelFor(el)) ||
      labelFor(el) !== expectedLabel ||
      expectedVersion !== revision ||
      route !== location.href ||
      (typeof maxLen === "number" && maxLen >= 0 && value.length > maxLen)
    ) {
      return false;
    }

    if (isRichText(el)) {
      el.textContent = value;
    } else {
      const prototype =
        el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) return false;
      setter.call(el, value);
    }

    const inputEvt =
      typeof InputEvent === "function"
        ? new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: value })
        : new Event("input", { bubbles: true, cancelable: true });
    el.dispatchEvent(inputEvt);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    el.blur();

    await new Promise(resolve => setTimeout(resolve, 120));
    return el.isConnected && getFieldValue(el) === value;
  }

  /**
   * @param {string} type
   * @param {any} [payload]
   */
  async function message(type, payload) {
    const result = await chrome.runtime.sendMessage({ type, payload });
    if (!result?.ok) throw new Error(result?.error || "Sem resposta do serviço. Recarregue a página.");
    return result.data;
  }

  /**
   * @param {string} text
   */
  function invalidate(text) {
    revision++;
    results.replaceChildren();
    entries = [];
    fill.hidden = true;
    consentBox.checked = false;
    if (busy) message("CANCEL").catch(() => {});
    status.textContent = text;
  }

  function updatePage(force = false) {
    if (!host.isConnected) document.documentElement.append(host);
    const changedRoute = route !== location.href;
    if (changedRoute) {
      route = location.href;
      jdEdited = false;
    }
    const next = scanFields();
    const changedFields =
      next.length !== fields.length ||
      next.some(
        (field, i) =>
          field.el !== fields[i]?.el ||
          field.label !== fields[i]?.label ||
          field.maxLength !== fields[i]?.maxLength
      );
    if (changedRoute || changedFields || force) {
      invalidate("Página atualizada. Revise os dados e analise novamente.");
      fields = next;
      count.textContent = `${fields.length} campo(s) de texto elegível(is), no máximo 20 por análise.`;
      questionPreview.replaceChildren(make("strong", "Perguntas que serão enviadas:"));
      for (const field of fields) questionPreview.append(make("p", field.label));
    }
    if (changedRoute || force || (!jdEdited && !busy && !entries.length)) {
      const job = readJob();
      title.textContent = job.title || `Vaga ${detectPlatformName()}`;
      if (force || changedRoute || !jdEdited) jd.value = job.description;
    }
  }

  /**
   * @param {any} data
   * @param {Array<{el: HTMLElement, label: string, maxLength: number, hint: string}>} snapshot
   */
  function render(data, snapshot) {
    results.replaceChildren(
      make("h2", `${Math.round(data.match_score)}% de compatibilidade estimada`),
      make("p", data.match_reason),
      make("p", `Competências encontradas: ${data.key_skills_found.join(", ") || "Nenhuma identificada"}`),
      make("p", `Lacunas: ${data.missing_skills.join(", ") || "Nenhuma identificada"}`)
    );
    entries = [];
    for (const answer of data.answers) {
      const field = snapshot.find(item => item.hint === answer.field_label_hint);
      if (!field) continue;
      const card = make("div", "", "answer");
      const label = make("label");
      const selected = /** @type {HTMLInputElement} */ (make("input"));
      selected.type = "checkbox";
      selected.checked = true;
      label.append(selected, document.createTextNode(` Preencher: ${field.label}`));

      if (answer.fato_base_curriculo) {
        const groundingBadge = make("p", `Evidência do currículo: ${answer.fato_base_curriculo}`, "muted");
        card.append(groundingBadge);
      }

      const editorLabel = make("label", "Resposta sugerida (editável)");
      const editor = /** @type {HTMLTextAreaElement} */ (make("textarea"));
      editor.rows = 5;
      editor.maxLength = field.maxLength > 0 ? Math.min(field.maxLength, 2000) : 2000;
      const originalDraft = answer.rascunho_resposta || answer.generated_answer || "";
      editor.value = originalDraft;
      editorLabel.append(editor);
      card.append(label, editorLabel);
      results.append(card);
      entries.push({ field, editor, selected, originalDraft });
    }
    fill.hidden = entries.length === 0;
    status.textContent = entries.length
      ? "Análise concluída. Revise e edite as respostas antes de preencher."
      : "Análise concluída sem respostas preenchíveis. Pode não haver dados suficientes no perfil.";
  }

  /**
   * Renders the multi-platform Radar de Vagas inside the Shadow DOM panel.
   * @param {any} discovery
   */
  function renderRadarJobs(discovery) {
    radarList.replaceChildren();
    if (!discovery || !Array.isArray(discovery.jobs)) {
      radarHeader.hidden = true;
      return;
    }
    const allJobs = discovery.jobs;
    radarHeader.hidden = false;
    radarHeader.textContent = `Encontramos ${allJobs.length} vagas compatíveis com o seu currículo`;

    const filtered = activePlatformFilter === "Todas"
      ? allJobs
      : allJobs.filter((/** @type {any} */ j) => j.platform === activePlatformFilter);

    if (filtered.length === 0) {
      radarList.append(make("p", "Nenhuma vaga encontrada para este filtro.", "muted"));
      return;
    }

    for (const job of filtered) {
      const card = make("div", "", "job-card");
      const topRow = make("div", "", "job-card-header");
      topRow.append(
        make("strong", `${Math.round(job.matchScore ?? job.deterministicScore ?? 0)}% Match`),
        make("span", `${job.platform} • ${job.workplaceType || "remoto"}`, "badge")
      );
      const jobTitle = make("p", `${job.title} — ${job.company}`, "job-title");
      const matched = Array.isArray(job.matchedSkills) && job.matchedSkills.length
        ? `Pontos fortes: ${job.matchedSkills.join(", ")}`
        : "Alinhado ao perfil";
      const missing = Array.isArray(job.missingSkills) && job.missingSkills.length
        ? ` | Faltantes: ${job.missingSkills.join(", ")}`
        : "";
      const skillsInfo = make("p", `${matched}${missing}`, "muted");
      const openBtn = /** @type {HTMLButtonElement} */ (make("button", "Abrir com Copiloto", "secondary"));
      openBtn.type = "button";
      openBtn.addEventListener("click", () => {
        window.open(job.url, "_blank", "noopener,noreferrer");
      });
      card.append(topRow, jobTitle, skillsInfo, openBtn);
      radarList.append(card);
    }
  }

  async function loadRadarState() {
    try {
      const state = await message("GET_DISCOVERY_STATE");
      if (state?.lastDiscovery?.jobs?.length) {
        cachedDiscovery = state.lastDiscovery;
        renderRadarJobs(cachedDiscovery);
      }
    } catch {}
  }

  runSearchBtn.addEventListener("click", async () => {
    runSearchBtn.disabled = true;
    radarStatus.textContent = "Varrendo Gupy, LinkedIn e InfoJobs em tempo real…";
    try {
      const discovery = await message("DISCOVER_JOBS");
      cachedDiscovery = discovery;
      radarStatus.textContent = `Varredura concluída (Gupy: ${discovery.platformCounts?.Gupy || 0}, LinkedIn: ${discovery.platformCounts?.LinkedIn || 0}, InfoJobs: ${discovery.platformCounts?.InfoJobs || 0}).`;
      renderRadarJobs(discovery);
    } catch (err) {
      radarStatus.textContent = err instanceof Error ? err.message : "Erro ao buscar vagas.";
    } finally {
      runSearchBtn.disabled = false;
    }
  });

  saveResumeBtn.addEventListener("click", async () => {
    try {
      const saved = await message("SAVE_RESUME", { resume: resumeEditor.value });
      resumeEditor.value = JSON.stringify(saved.resume, null, 2);
      resumeMsg.textContent = "Currículo validado e salvo em chrome.storage.local!";
    } catch (err) {
      resumeMsg.textContent = err instanceof Error ? err.message : "Falha ao salvar currículo.";
    }
  });

  analyze.addEventListener("click", async () => {
    if (busy) return;
    updatePage();
    if (!consentBox.checked) {
      status.textContent = "Autorize o envio à OpenAI antes de analisar.";
      return;
    }
    const description = clean(jd.value);
    jd.value = description;
    if (description.length < 100) {
      details.open = true;
      status.textContent = "Descrição insuficiente. Cole a descrição completa no campo de revisão.";
      jd.focus();
      return;
    }
    const snapshot = fields.map((field, i) => ({ ...field, hint: `[Q${i + 1}] ${field.label}` }));
    const version = revision;
    const url = location.href;
    busy = true;
    jdEdited = true;
    analyze.disabled = true;
    results.replaceChildren();
    entries = [];
    fill.hidden = true;
    status.textContent = "Analisando… falhas temporárias terão até duas retentativas.";
    try {
      const data = await message("ANALYZE", {
        title: title.textContent,
        description,
        questions: snapshot.map(field => ({ field_label_hint: field.hint, max_length: field.maxLength }))
      });
      updatePage();
      if (version !== revision || url !== location.href) return;
      render(data, snapshot);
    } catch (error) {
      if (version === revision) {
        status.textContent =
          (error instanceof Error && error.message) || "Falha na análise. Recarregue a página e tente novamente.";
      }
    } finally {
      busy = false;
      analyze.disabled = false;
    }
  });

  function calculateEditRatio(originalDraft, finalValue) {
    const a = String(originalDraft || "").trim();
    const b = String(finalValue || "").trim();
    if (!a && !b) return 0;
    if (!a || !b) return 1;
    if (a === b) return 0;
    const maxLen = Math.max(a.length, b.length);
    let diff = Math.abs(a.length - b.length);
    const minLen = Math.min(a.length, b.length);
    for (let i = 0; i < minLen; i++) {
      if (a[i] !== b[i]) diff++;
    }
    return Number(Math.min(1, diff / maxLen).toFixed(3));
  }

  fill.addEventListener("click", async () => {
    updatePage();
    const version = revision;
    const selectedEntries = entries.filter(entry => entry.selected.checked);
    let filled = 0;
    let skipped = 0;
    let attempted = 0;
    const editRatios = [];
    fill.disabled = true;
    for (const { field, editor, originalDraft } of selectedEntries) {
      const el = field.el;
      const value = editor.value.trim();
      const maxLen = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (el).maxLength;
      if (
        version !== revision ||
        route !== location.href ||
        !eligible(el, labelFor(el)) ||
        labelFor(el) !== field.label ||
        getFieldValue(el) ||
        !value ||
        (typeof maxLen === "number" && maxLen >= 0 && value.length > maxLen)
      ) {
        skipped++;
        continue;
      }
      attempted++;
      editRatios.push(calculateEditRatio(originalDraft, value));
      try {
        const ok = await injectReactiveValue(el, value, field.label, version);
        if (ok) filled++;
        else skipped++;
      } catch {
        skipped++;
      }
    }
    if (attempted > 0) {
      message("RECORD_DOM_TELEMETRY", {
        totalAttempted: attempted,
        retainedAfter100ms: filled,
        editRatios
      }).catch(() => {});
    }
    fill.disabled = false;
    status.textContent = `${filled} campo(s) preenchido(s); ${skipped} ignorado(s) ou não confirmado(s). Confira os valores antes de continuar.`;
  });

  jd.addEventListener("input", () => {
    jdEdited = true;
    invalidate("Descrição alterada. Autorize e analise novamente.");
  });
  refresh.addEventListener("click", () => {
    jdEdited = false;
    updatePage(true);
  });
  settings.addEventListener("click", () => {
    message("OPEN_OPTIONS").catch(error => {
      status.textContent = error.message;
    });
  });
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? "Abrir" : "Minimizar";
    toggle.setAttribute("aria-expanded", String(!body.hidden));
  });

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      updatePage();
    }, 350);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "hidden",
      "aria-hidden",
      "aria-disabled",
      "inert",
      "disabled",
      "readonly",
      "aria-label",
      "aria-labelledby",
      "maxlength",
      "placeholder",
      "type",
      "for",
      "id",
      "class",
      "style",
      "contenteditable"
    ]
  });
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  setInterval(() => {
    if (route !== location.href) schedule();
  }, 1000);

  // Content Script DOM Extractor Fallback for JobDiscoveryEngine (Gupy, LinkedIn, InfoJobs)
  if (chrome.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "EXTRACT_JOBS_DOM") {
        try {
          const plat = detectPlatformName();
          const extracted = [];
          const links = [...document.querySelectorAll('a[href*="/jobs/"], a[href*="/vaga-de-"]')].slice(0, 15);
          for (let i = 0; i < links.length; i++) {
            const a = /** @type {HTMLAnchorElement} */ (links[i]);
            const titleText = clean(a.textContent, 180);
            if (!titleText || titleText.length < 4) continue;
            extracted.push({
              id: `${plat.toLowerCase()}-dom-${i + 1}`,
              platform: plat,
              title: titleText,
              company: `${plat} Portal`,
              location: "Brasil",
              workplaceType: "remoto",
              url: a.href,
              description: `${titleText} (${msg.payload?.query || ""})`
            });
          }
          sendResponse({ ok: true, jobs: extracted });
        } catch (err) {
          sendResponse({ ok: false, jobs: [], error: err instanceof Error ? err.message : "DOM extract error" });
        }
        return true;
      }
      return false;
    });
  }

  updatePage(true);
})();
