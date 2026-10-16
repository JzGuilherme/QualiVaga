(() => {
  "use strict";
  if (globalThis.__qualiVagaLoaded) return;
  globalThis.__qualiVagaLoaded = true;

  const prefix = "gupy-ai-helper-";
  const host = document.createElement("div");
  host.id = `${prefix}root`;
  // Closed shadow root prevents accidental page styling/access, not a security boundary.
  const shadow = host.attachShadow({ mode: "closed" });
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("styles.css");
  shadow.append(stylesheet);
  const make = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = prefix + className;
    return el;
  };
  const panel = make("section", "", "panel");
  panel.setAttribute("aria-label", "Assistente QualiVaga");
  const header = make("div", "", "header");
  header.append(make("strong", "QualiVaga"));
  const toggle = make("button", "Minimizar", "secondary");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-controls", `${prefix}body`);
  header.append(toggle);
  const body = make("div", "", "body");
  body.id = `${prefix}body`;
  const title = make("p", "", "job-title");
  const count = make("p", "", "muted");
  const details = make("details");
  details.append(make("summary", "Revisar descrição enviada"));
  const jdLabel = make("label", "Descrição da vaga (editável)");
  const jd = make("textarea");
  jd.rows = 8;
  jd.maxLength = 24000;
  jdLabel.append(jd);
  details.append(jdLabel, make("p", "Remova nomes, endereços e qualquer informação pessoal restante. A limpeza automática é heurística.", "muted"));
  const questionPreview = make("div", "", "questions");
  details.append(questionPreview);
  const consent = make("label", "", "consent");
  const consentBox = make("input");
  consentBox.type = "checkbox";
  consent.append(consentBox, document.createTextNode(" Enviar descrição, perguntas e perfil profissional à OpenAI para esta análise."));
  const actions = make("div", "", "actions");
  const analyze = make("button", "Analisar");
  const refresh = make("button", "Reler página", "secondary");
  const settings = make("button", "Configurações", "secondary");
  for (const button of [analyze, refresh, settings]) button.type = "button";
  actions.append(analyze, refresh, settings);
  const status = make("p", "Revise a descrição e autorize o envio para começar.", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const results = make("div", "", "results");
  const fill = make("button", "Preencher respostas selecionadas");
  fill.type = "button";
  fill.hidden = true;
  body.append(title, count, details, consent, actions, status, results, fill,
    make("p", "Revise os fatos antes de preencher. O assistente não envia a candidatura.", "muted"));
  panel.append(header, body);
  shadow.append(panel);
  document.documentElement.append(host);

  let route = location.href;
  let fields = [];
  let revision = 0;
  let busy = false;
  let jdEdited = false;
  let entries = [];

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
      .replace(/\s+/g, " ").trim().slice(0, max);
  }

  function visible(el) {
    const style = getComputedStyle(el);
    return el.isConnected && !el.closest('[hidden], [aria-hidden="true"], [inert]') &&
      el.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function readText(root, ranges = null) {
    const parts = [];
    let size = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (ranges && !ranges.some(range => range.intersectsNode(node))) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest("script, style, noscript, iframe, nav, header, footer, form, input, textarea, select, button, [contenteditable], [hidden], [aria-hidden='true']") ||
            !visible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode() && size < 48000) {
      const text = walker.currentNode.textContent.trim();
      if (text) { parts.push(text); size += text.length; }
    }
    return clean(parts.join("\n"));
  }

  function readJob() {
    const heading = [...document.querySelectorAll('[data-testid="job-title"], [data-testid="jobTitle"], h1')].find(visible);
    // Gupy public pages expose the job as adjacent sections, not one JD element.
    const sectionTitles = [...document.querySelectorAll('h2[data-testid^="section-"]')].filter(visible);
    const relevantTitles = sectionTitles.filter(el => /^(descricao da vaga|responsabilidades e atribuicoes|requisitos e qualificacoes|informacoes adicionais)$/i.test(normalize(el.textContent)));
    const sections = relevantTitles.map(el => {
      const range = document.createRange();
      range.setStartBefore(el);
      const next = sectionTitles[sectionTitles.indexOf(el) + 1];
      if (next) range.setEndBefore(next);
      else {
        const container = el.closest('section') || el.parentElement;
        range.setEndAfter(container);
      }
      return range;
    });
    let sectionText = '';
    if (sections.length) {
      const main = document.querySelector('main, [role="main"]');
      if (main) sectionText = readText(main, sections);
    }
    const selectors = ['[data-testid="job-description"]', '[data-testid="jobDescription"]',
      '[id="job-description"]', '[itemprop="description"]', 'main', '[role="main"]', 'article'];
    let description = sectionText.length >= 100 ? sectionText : "";
    for (const selector of selectors) {
      if (description) break;
      const nodes = [...document.querySelectorAll(selector)].filter(visible);
      const text = nodes.map(readText).join("\n");
      if (text.length >= 100) { description = clean(text); break; }
    }
    // Never scrape document.body: it may contain account or application details.
    return { title: clean(heading?.textContent || document.title, 500), description };
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function labelText(node) {
    if (!node) return '';
    if (node.matches('input,textarea,select,button,output,[contenteditable]')) return '';
    // React mirrors textarea values into text nodes; do not send them as part of labels.
    const clone = node.cloneNode(true);
    clone.querySelectorAll('input,textarea,select,button,output,[contenteditable],script,style,[hidden],[aria-hidden="true"]').forEach(el => el.remove());
    return clean(clone.textContent, 650);
  }

  function labelFor(el) {
    const labelledBy = (el.getAttribute("aria-labelledby") || "").split(/\s+/)
      .map(id => labelText(document.getElementById(id))).join(" ").trim();
    const labels = [...(el.labels || [])].map(labelText).join(" ").trim();
    const explicit = labelledBy || labels || el.getAttribute('aria-label');
    if (explicit) return clean(explicit, 650);
    // Only accept a nearby heading when its container has exactly one answer control.
    // Never assign the first question in a multi-question group to every field.
    let container = el.parentElement;
    for (let depth = 0; container && depth < 4; depth++, container = container.parentElement) {
      if (container.matches('form,main,body') || container.querySelectorAll('input,textarea,select,[contenteditable="true"]').length !== 1) break;
      const headings = [...container.querySelectorAll('legend,label,h2,h3,h4,[data-testid*="question-title"]')].filter(visible);
      if (headings.length === 1 && labelText(headings[0])) return labelText(headings[0]);
    }
    const placeholder = clean(el.getAttribute('placeholder'), 650);
    return /^(digite|escreva|insira|sua resposta|responda|type|enter|your answer)/i.test(normalize(placeholder)) ? '' : placeholder;
  }

  function eligible(el, label) {
    if (!label || !visible(el) || el.matches(':disabled') || el.readOnly || el.closest('[aria-disabled="true"]')) return false;
    if (el.tagName === "INPUT" && el.type !== "text") return false;
    if (el.getAttribute("role") === "combobox" || el.hasAttribute("list")) return false;
    const identity = normalize(`${label} ${el.name} ${el.id} ${el.autocomplete}`).replace(/[_-]/g, ' ').replace(/\bbancos? de dados\b/g, 'database');
    if (/\b(nome|name|email|e-mail|cpf|cnpj|rg|telefone|phone|celular|senha|password|endereco|address|cep|nascimento|birth|genero|gender|sexo|sexual|raca|racial|etnia|religiao|saude|health|deficiencia|pcd|banco|bank|pix|salario|salary|pretensao|pesquisar|search|buscar|login|url|linkedin|github|teste|prova|assessment)\b/.test(identity)) return false;
    return el.tagName === "TEXTAREA" || /\?|descreva|conte|experiencia|motivacao|por que|porque|habilidade|apresente|trajetoria|objetivo|describe|experience|why/i.test(normalize(label));
  }

  function scanFields() {
    return [...document.querySelectorAll("textarea, input:not([type]), input[type='text']")]
      .map(el => ({ el, label: labelFor(el), maxLength: el.maxLength }))
      .filter(field => eligible(field.el, field.label)).slice(0, 20);
  }

  async function message(type, payload) {
    const result = await chrome.runtime.sendMessage({ type, payload });
    if (!result?.ok) throw new Error(result?.error || "Sem resposta do serviço. Recarregue a página.");
    return result.data;
  }

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
    if (changedRoute) { route = location.href; jdEdited = false; }
    const next = scanFields();
    const changedFields = next.length !== fields.length || next.some((field, i) =>
      field.el !== fields[i]?.el || field.label !== fields[i]?.label || field.maxLength !== fields[i]?.maxLength);
    if (changedRoute || changedFields || force) {
      invalidate("Página atualizada. Revise os dados e analise novamente.");
      fields = next;
      count.textContent = `${fields.length} campo(s) de texto elegível(is), no máximo 20 por análise.`;
      questionPreview.replaceChildren(make("strong", "Perguntas que serão enviadas:"));
      for (const field of fields) questionPreview.append(make("p", field.label));
    }
    // Refresh extraction only until manual editing/analysis, so SPA loading is detected.
    if (changedRoute || force || (!jdEdited && !busy && !entries.length)) {
      const job = readJob();
      title.textContent = job.title || "Vaga Gupy";
      if (force || changedRoute || !jdEdited) jd.value = job.description;
    }
  }

  function render(data, snapshot) {
    results.replaceChildren(make("h2", `${Math.round(data.match_score)}% de compatibilidade estimada`),
      make("p", data.match_reason),
      make("p", `Competências encontradas: ${data.key_skills_found.join(", ") || "Nenhuma identificada"}`),
      make("p", `Lacunas: ${data.missing_skills.join(", ") || "Nenhuma identificada"}`));
    entries = [];
    for (const answer of data.answers) {
      const field = snapshot.find(item => item.hint === answer.field_label_hint);
      if (!field) continue;
      const card = make("div", "", "answer");
      const label = make("label");
      const selected = make("input");
      selected.type = "checkbox";
      selected.checked = true;
      label.append(selected, document.createTextNode(` Preencher: ${field.label}`));
      const editorLabel = make("label", "Resposta sugerida (editável)");
      const editor = make("textarea");
      editor.rows = 5;
      editor.maxLength = field.maxLength > 0 ? Math.min(field.maxLength, 2000) : 2000;
      editor.value = answer.generated_answer;
      editorLabel.append(editor);
      card.append(label, editorLabel);
      results.append(card);
      entries.push({ field, editor, selected });
    }
    fill.hidden = entries.length === 0;
    status.textContent = entries.length ? "Análise concluída. Revise e edite as respostas antes de preencher." : "Análise concluída sem respostas preenchíveis. Pode não haver dados suficientes no perfil.";
  }

  analyze.addEventListener("click", async () => {
    if (busy) return;
    updatePage();
    if (!consentBox.checked) { status.textContent = "Autorize o envio à OpenAI antes de analisar."; return; }
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
      const data = await message("ANALYZE", { title: title.textContent, description,
        questions: snapshot.map(field => ({ field_label_hint: field.hint, max_length: field.maxLength })) });
      updatePage();
      if (version !== revision || url !== location.href) return;
      render(data, snapshot);
    } catch (error) {
      if (version === revision) status.textContent = error.message || "Falha na análise. Recarregue a página e tente novamente.";
    } finally { busy = false; analyze.disabled = false; }
  });

  fill.addEventListener("click", async () => {
    updatePage();
    const version = revision;
    const selectedEntries = entries.filter(entry => entry.selected.checked);
    let filled = 0;
    let skipped = 0;
    fill.disabled = true;
    for (const { field, editor } of selectedEntries) {
      const el = field.el;
      const value = editor.value.trim();
      if (version !== revision || route !== location.href || !eligible(el, labelFor(el)) ||
          labelFor(el) !== field.label || el.value.trim() || !value ||
          (el.maxLength >= 0 && value.length > el.maxLength)) { skipped++; continue; }
      try {
        // Bypass React's per-element value tracker using the native prototype setter.
        const prototype = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (!setter) { skipped++; continue; }
        el.focus();
        // Focusing may synchronously restore a draft or replace/disable this field.
        if (el.value.trim() || !eligible(el, labelFor(el)) || labelFor(el) !== field.label ||
            version !== revision || route !== location.href || (el.maxLength >= 0 && value.length > el.maxLength)) {
          skipped++; continue;
        }
        setter.call(el, value);
        for (const type of ["input", "change", "blur"]) el.dispatchEvent(new Event(type, { bubbles: true }));
        el.blur();
        await new Promise(resolve => setTimeout(resolve, 120));
        if (el.isConnected && el.value === value) filled++;
        else skipped++;
      } catch { skipped++; }
    }
    fill.disabled = false;
    status.textContent = `${filled} campo(s) preenchido(s); ${skipped} ignorado(s) ou não confirmado(s). Confira os valores na Gupy antes de continuar.`;
  });

  jd.addEventListener("input", () => { jdEdited = true; invalidate("Descrição alterada. Autorize e analise novamente."); });
  refresh.addEventListener("click", () => { jdEdited = false; updatePage(true); });
  settings.addEventListener("click", () => { message("OPEN_OPTIONS").catch(error => { status.textContent = error.message; }); });
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? "Abrir" : "Minimizar";
    toggle.setAttribute("aria-expanded", String(!body.hidden));
  });

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; updatePage(); }, 350);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["hidden", "aria-hidden", "aria-disabled", "inert", "disabled", "readonly", "aria-label", "aria-labelledby", "maxlength", "placeholder", "type", "for", "id", "class", "style"] });
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  // pushState/replaceState do not dispatch popstate; URL polling covers routes without DOM mutations.
  setInterval(() => { if (route !== location.href) schedule(); }, 1000);
  updatePage(true);
})();
