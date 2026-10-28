// @ts-check
"use strict";

import { normalizeResume, validateResume } from "./src/resume-validator.js";
import { getTelemetrySnapshot } from "./src/telemetry-debug.js";

const form = /** @type {HTMLFormElement} */ (document.getElementById("settings"));
const keyInput = /** @type {HTMLInputElement} */ (document.getElementById("api-key"));
const profileInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("profile"));
const quickKeywords = /** @type {HTMLInputElement} */ (document.getElementById("quick-keywords"));
const quickSkills = /** @type {HTMLInputElement} */ (document.getElementById("quick-skills"));
const status = /** @type {HTMLElement} */ (document.getElementById("status"));
const keyState = /** @type {HTMLElement} */ (document.getElementById("key-state"));

const tabRadarBtn = /** @type {HTMLButtonElement} */ (document.getElementById("tab-radar-btn"));
const tabResumeBtn = /** @type {HTMLButtonElement} */ (document.getElementById("tab-resume-btn"));
const sectionRadar = /** @type {HTMLElement} */ (document.getElementById("section-radar"));
const sectionResume = /** @type {HTMLElement} */ (document.getElementById("section-resume"));

const runDiscoveryBtn = /** @type {HTMLButtonElement} */ (document.getElementById("run-discovery-btn"));
const discoveryStatus = /** @type {HTMLElement} */ (document.getElementById("discovery-status"));
const discoveryProgress = /** @type {HTMLElement} */ (document.getElementById("discovery-progress"));
const discoveryHeadline = /** @type {HTMLElement} */ (document.getElementById("discovery-headline"));
const discoveryResults = /** @type {HTMLElement} */ (document.getElementById("discovery-results"));
const pillGupy = /** @type {HTMLElement} */ (document.getElementById("pill-gupy"));
const pillLinkedin = /** @type {HTMLElement} */ (document.getElementById("pill-linkedin"));
const pillInfojobs = /** @type {HTMLElement} */ (document.getElementById("pill-infojobs"));

const importJsonBtn = /** @type {HTMLButtonElement} */ (document.getElementById("import-json-btn"));
const exportJsonBtn = /** @type {HTMLButtonElement} */ (document.getElementById("export-json-btn"));
const loadExampleBtn = /** @type {HTMLButtonElement} */ (document.getElementById("load-example-btn"));
const importFileInput = /** @type {HTMLInputElement} */ (document.getElementById("import-file-input"));
const exportTelemetryBtn = /** @type {HTMLButtonElement} */ (document.getElementById("export-telemetry-btn"));

const DEFAULT_EXAMPLE = {
  perfil: {
    titulo: "Desenvolvedor Full Stack JavaScript",
    senioridade: "pleno",
    anos_experiencia: 3,
    resumo: "Desenvolvedor Full Stack com experiência prática em JavaScript, TypeScript, React, Node.js e bancos de dados relacionais.",
    idiomas: [{ idioma: "Português", nivel: "Nativo" }]
  },
  palavras_chave_busca: ["Desenvolvedor Full Stack", "Engenheiro Front-end React", "Desenvolvedor Node.js"],
  hard_skills: ["JavaScript", "TypeScript", "React", "Node.js", "PostgreSQL", "SQL", "HTML5", "CSS3", "Playwright", "Git"],
  projetos_e_experiencias: [
    {
      id: "exp-1",
      tipo: "experiencia",
      titulo: "Desenvolvedor Web Full Stack",
      organizacao: "Tech Solutions Brasil",
      periodo: "2024 - Atual",
      descricao: "Desenvolvimento de aplicações SPA em React e APIs REST em Node.js com PostgreSQL.",
      resultados: ["Implementação de suíte E2E com Playwright e redução de tempo de resposta em endpoints críticos."],
      tecnologias: ["React", "TypeScript", "Node.js", "PostgreSQL", "Playwright"]
    }
  ],
  formacao: [
    {
      curso: "Análise e Desenvolvimento de Sistemas",
      instituicao: "Faculdade de Tecnologia",
      nivel: "Graduação",
      status: "Concluído",
      ano_conclusao: "2024"
    }
  ],
  preferencias_vaga: {
    modalidades: ["remoto", "hibrido"],
    localidades: ["Brasil"],
    plataformas_ativas: ["Gupy", "LinkedIn", "InfoJobs"],
    nivel_minimo_match: 40
  }
};

let activeFilter = "Todas";
/** @type {any} */
let currentDiscovery = null;

/**
 * Helper to create elements safely using textContent.
 * @param {string} tag
 * @param {string} [text]
 * @param {string} [className]
 */
function makeEl(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function switchMainTab(tab) {
  const isRadar = tab === "radar";
  sectionRadar.hidden = !isRadar;
  sectionResume.hidden = isRadar;
  tabRadarBtn.setAttribute("aria-selected", String(isRadar));
  tabResumeBtn.setAttribute("aria-selected", String(!isRadar));
  tabRadarBtn.className = isRadar ? "gupy-ai-helper-tab-active" : "gupy-ai-helper-secondary";
  tabResumeBtn.className = !isRadar ? "gupy-ai-helper-tab-active" : "gupy-ai-helper-secondary";
}

tabRadarBtn?.addEventListener("click", () => switchMainTab("radar"));
tabResumeBtn?.addEventListener("click", () => switchMainTab("resume"));

/**
 * Syncs the quick tag inputs with the JSON textarea.
 * @param {any} profileObj
 */
function syncTagInputsFromProfile(profileObj) {
  try {
    const normalized = normalizeResume(profileObj);
    if (quickKeywords) quickKeywords.value = (normalized.palavras_chave_busca || []).join(", ");
    if (quickSkills) quickSkills.value = (normalized.hard_skills || []).join(", ");
  } catch {}
}

/**
 * Applies changes from quick tag inputs back into the JSON editor.
 */
function applyQuickTagsToEditor() {
  try {
    const parsed = normalizeResume(profileInput.value);
    if (quickKeywords && quickKeywords.value.trim()) {
      parsed.palavras_chave_busca = quickKeywords.value
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    }
    if (quickSkills && quickSkills.value.trim()) {
      parsed.hard_skills = quickSkills.value
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    }
    profileInput.value = JSON.stringify(parsed, null, 2);
  } catch {}
}

quickKeywords?.addEventListener("change", applyQuickTagsToEditor);
quickSkills?.addEventListener("change", applyQuickTagsToEditor);

/**
 * Renders the consolidated multi-platform job list ranked by Match Score (%).
 * @param {any} discovery
 */
function renderDiscoveryList(discovery) {
  discoveryResults.replaceChildren();
  if (!discovery || !Array.isArray(discovery.jobs)) {
    discoveryHeadline.hidden = true;
    return;
  }

  const jobs = discovery.jobs;
  discoveryHeadline.hidden = false;
  discoveryHeadline.textContent = `Encontramos ${jobs.length} vagas compatíveis com o seu currículo`;

  if (discovery.platformCounts) {
    discoveryProgress.hidden = false;
    const gErr = discovery.platformStatuses?.Gupy?.error;
    const lErr = discovery.platformStatuses?.LinkedIn?.error;
    const iErr = discovery.platformStatuses?.InfoJobs?.error;
    pillGupy.textContent = gErr ? `Gupy: erro (${gErr})` : `Gupy: ${discovery.platformCounts.Gupy ?? 0} vaga(s)`;
    pillLinkedin.textContent = lErr ? `LinkedIn: erro (${lErr})` : `LinkedIn: ${discovery.platformCounts.LinkedIn ?? 0} vaga(s)`;
    pillInfojobs.textContent = iErr ? `InfoJobs: erro (${iErr})` : `InfoJobs: ${discovery.platformCounts.InfoJobs ?? 0} vaga(s)`;
  }

  const filtered = activeFilter === "Todas"
    ? jobs
    : jobs.filter((/** @type {any} */ j) => j.platform === activeFilter);

  if (filtered.length === 0) {
    discoveryResults.append(makeEl("p", "Nenhuma vaga encontrada para a plataforma selecionada.", "gupy-ai-helper-muted"));
    return;
  }

  for (const job of filtered) {
    const card = makeEl("article", "", "gupy-ai-helper-job-card");
    const header = makeEl("div", "", "gupy-ai-helper-job-card-header");
    const scoreBadge = makeEl("strong", `${Math.round(job.matchScore ?? job.deterministicScore ?? 0)}% Match`, "gupy-ai-helper-score-badge");
    const platBadge = makeEl("span", `${job.platform} • ${job.workplaceType || "remoto"} • ${job.location || "Brasil"}`, "gupy-ai-helper-badge");
    header.append(scoreBadge, platBadge);

    const titleEl = makeEl("h3", `${job.title} — ${job.company}`, "gupy-ai-helper-job-title");
    const reasonEl = makeEl("p", job.matchReason || "Compatibilidade analisada com base no seu currículo.", "gupy-ai-helper-muted");

    const tagsWrap = makeEl("div", "", "gupy-ai-helper-tags-row");
    const matched = Array.isArray(job.matchedSkills) ? job.matchedSkills : [];
    const missing = Array.isArray(job.missingSkills) ? job.missingSkills : [];

    for (const skill of matched) {
      tagsWrap.append(makeEl("span", `✓ ${skill}`, "gupy-ai-helper-tag-match"));
    }
    for (const miss of missing) {
      tagsWrap.append(makeEl("span", `⚠ Falta: ${miss}`, "gupy-ai-helper-tag-missing"));
    }

    const actionRow = makeEl("div", "", "gupy-ai-helper-actions");
    const openCopilotBtn = /** @type {HTMLButtonElement} */ (makeEl("button", "Abrir com Copiloto", "gupy-ai-helper-primary"));
    openCopilotBtn.type = "button";
    openCopilotBtn.addEventListener("click", () => {
      if (chrome.tabs?.create) {
        chrome.tabs.create({ url: job.url });
      } else {
        window.open(job.url, "_blank", "noopener,noreferrer");
      }
    });
    actionRow.append(openCopilotBtn);

    card.append(header, titleEl, reasonEl, tagsWrap, actionRow);
    discoveryResults.append(card);
  }
}

document.querySelectorAll(".gupy-ai-helper-filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    activeFilter = btn.getAttribute("data-platform") || "Todas";
    document.querySelectorAll(".gupy-ai-helper-filter-btn").forEach(b => {
      b.className = `gupy-ai-helper-filter-btn ${b === btn ? "gupy-ai-helper-tab-active" : "gupy-ai-helper-secondary"}`;
    });
    renderDiscoveryList(currentDiscovery);
  });
});

runDiscoveryBtn?.addEventListener("click", async () => {
  runDiscoveryBtn.disabled = true;
  discoveryProgress.hidden = false;
  pillGupy.textContent = "Gupy: varrendo…";
  pillLinkedin.textContent = "LinkedIn: varrendo…";
  pillInfojobs.textContent = "InfoJobs: varrendo…";
  discoveryStatus.textContent = "Pesquisando vagas em Gupy, LinkedIn e InfoJobs e calculando Match Score…";

  try {
    let customResume;
    if (profileInput?.value.trim()) {
      const check = validateResume(profileInput.value.trim());
      if (check.valid && check.resume) {
        customResume = check.resume;
        await chrome.storage.local.set({ masterProfile: customResume });
      }
    }
    const response = await chrome.runtime.sendMessage({
      type: "DISCOVER_JOBS",
      payload: { resume: customResume }
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Falha ao executar busca de vagas.");
    }
    currentDiscovery = response.data;
    discoveryStatus.textContent = "Varredura concluída com sucesso! Veja abaixo as vagas ranqueadas por Match Score.";
    renderDiscoveryList(currentDiscovery);
  } catch (error) {
    discoveryStatus.textContent = error instanceof Error ? error.message : "Erro durante a busca de vagas.";
  } finally {
    runDiscoveryBtn.disabled = false;
  }
});

async function initialize() {
  if (chrome.storage?.local?.setAccessLevel) {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
  }
  const saved = await chrome.storage.local.get(["apiKey", "masterProfile", "lastDiscovery"]);
  keyState.textContent = saved.apiKey ? "Chave cadastrada. Deixe vazio para mantê-la." : "Nenhuma chave cadastrada.";
  const activeProfile = saved.masterProfile || DEFAULT_EXAMPLE;
  profileInput.value = JSON.stringify(activeProfile, null, 2);
  syncTagInputsFromProfile(activeProfile);

  if (saved.lastDiscovery && Array.isArray(saved.lastDiscovery.jobs) && saved.lastDiscovery.jobs.length > 0) {
    currentDiscovery = saved.lastDiscovery;
    renderDiscoveryList(currentDiscovery);
  }
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const raw = profileInput.value.trim();
    if (raw.length > 25000) throw new Error("O perfil excede 25.000 caracteres.");
    const validation = validateResume(raw);
    if (!validation.valid || !validation.resume) {
      throw new Error(validation.errors[0] || "JSON inválido. Confira os campos obrigatórios.");
    }
    const apiKey = keyInput.value.trim();
    if (apiKey && (!apiKey.startsWith("sk-") || /\s/.test(apiKey) || apiKey.length < 20)) {
      throw new Error("Confira o formato da chave OpenAI.");
    }
    if (chrome.storage?.local?.setAccessLevel) {
      await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
    }
    await chrome.storage.local.set({
      masterProfile: validation.resume,
      ...(apiKey ? { apiKey } : {})
    });
    keyInput.value = "";
    await initialize();
    status.textContent = "Currículo e configurações salvos com sucesso em chrome.storage.local.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Não foi possível salvar.";
  }
});

document.getElementById("delete-key")?.addEventListener("click", async () => {
  try {
    await chrome.storage.local.remove("apiKey");
    keyInput.value = "";
    keyState.textContent = "Nenhuma chave cadastrada.";
    status.textContent = "Chave excluída. Análises já em andamento podem concluir.";
  } catch {
    status.textContent = "Não foi possível excluir a chave.";
  }
});

importJsonBtn?.addEventListener("click", () => {
  importFileInput?.click();
});

importFileInput?.addEventListener("change", async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const check = validateResume(text);
    if (!check.valid || !check.resume) {
      throw new Error(check.errors.join(" "));
    }
    profileInput.value = JSON.stringify(check.resume, null, 2);
    syncTagInputsFromProfile(check.resume);
    await chrome.storage.local.set({ masterProfile: check.resume });
    status.textContent = "Currículo importado e salvo com sucesso!";
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : "Arquivo JSON inválido.";
  } finally {
    importFileInput.value = "";
  }
});

exportJsonBtn?.addEventListener("click", () => {
  try {
    const check = validateResume(profileInput.value);
    const dataToExport = check.resume || JSON.parse(profileInput.value);
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meu-curriculo.qualivaga.json";
    a.click();
    URL.revokeObjectURL(url);
    status.textContent = "Currículo exportado com sucesso.";
  } catch {
    status.textContent = "Corrija o JSON antes de exportar.";
  }
});

loadExampleBtn?.addEventListener("click", async () => {
  try {
    const res = await fetch(chrome.runtime.getURL("resume.example.json"));
    const json = await res.json();
    profileInput.value = JSON.stringify(json, null, 2);
    syncTagInputsFromProfile(json);
    status.textContent = "Exemplo padrão carregado. Revise e clique em Salvar.";
  } catch {
    profileInput.value = JSON.stringify(DEFAULT_EXAMPLE, null, 2);
    syncTagInputsFromProfile(DEFAULT_EXAMPLE);
  }
});

exportTelemetryBtn?.addEventListener("click", async () => {
  try {
    const snap = await getTelemetrySnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qualivaga-telemetry-kpis.json";
    a.click();
    URL.revokeObjectURL(url);
    status.textContent = "Diagnóstico de KPIs exportado com sucesso.";
  } catch {
    status.textContent = "Não foi possível exportar o diagnóstico de KPIs.";
  }
});

initialize().catch(() => {
  status.textContent = "Falha ao carregar configurações. Reabra esta página.";
});
