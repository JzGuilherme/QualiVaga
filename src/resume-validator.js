// @ts-check
"use strict";

/**
 * @typedef {Object} ResumeProfileInfo
 * @property {string} titulo
 * @property {"estagio"|"junior"|"pleno"|"senior"|"especialista"|"lead"} senioridade
 * @property {number} [anos_experiencia]
 * @property {string} resumo
 * @property {Array<{idioma: string, nivel: string}>} [idiomas]
 */

/**
 * @typedef {Object} ResumeExperienceItem
 * @property {string} [id]
 * @property {"experiencia"|"projeto"|"voluntariado"|"academico"} [tipo]
 * @property {string} titulo
 * @property {string} organizacao
 * @property {string} [periodo]
 * @property {string} descricao
 * @property {string[]} [resultados]
 * @property {string[]} tecnologias
 */

/**
 * @typedef {Object} ResumeEducationItem
 * @property {string} curso
 * @property {string} instituicao
 * @property {string} [nivel]
 * @property {string} [status]
 * @property {string} [ano_conclusao]
 */

/**
 * @typedef {Object} ResumePreferences
 * @property {Array<"remoto"|"hibrido"|"presencial">} modalidades
 * @property {string[]} [localidades]
 * @property {Array<"Gupy"|"LinkedIn"|"InfoJobs">} [plataformas_ativas]
 * @property {number} [nivel_minimo_match]
 */

/**
 * @typedef {Object} StandardizedResume
 * @property {ResumeProfileInfo} perfil
 * @property {string[]} palavras_chave_busca
 * @property {string[]} hard_skills
 * @property {ResumeExperienceItem[]} projetos_e_experiencias
 * @property {ResumeEducationItem[]} formacao
 * @property {ResumePreferences} preferencias_vaga
 */

const VALID_SENIORITIES = new Set(["estagio", "junior", "pleno", "senior", "especialista", "lead"]);
const VALID_MODALITIES = new Set(["remoto", "hibrido", "presencial"]);
const VALID_PLATFORMS = new Set(["Gupy", "LinkedIn", "InfoJobs"]);

/**
 * Normalizes a string by removing diacritics and lowercasing.
 * @param {string} value
 * @returns {string}
 */
export function normalizeToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Converts a legacy or partial resume JSON object into the standardized QualiVaga format.
 * Also supports converting plain text into a draft StandardizedResume.
 * @param {unknown} input
 * @returns {StandardizedResume}
 */
export function normalizeResume(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      try {
        input = JSON.parse(trimmed);
      } catch {
        throw new Error("JSON inválido. Confira aspas, vírgulas e chaves.");
      }
    } else if (trimmed.length >= 20) {
      return textToResumeDraft(trimmed);
    } else {
      throw new Error("Currículo muito curto ou formato inválido.");
    }
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("O perfil deve ser um objeto JSON válido.");
  }

  const raw = /** @type {Record<string, any>} */ (input);

  // Support both standardized schema and legacy masterProfile format
  const rawPerfil = raw.perfil && typeof raw.perfil === "object" ? raw.perfil : {};
  const titulo = String(rawPerfil.titulo || raw.titulo || raw.cargo || "Profissional de Tecnologia").trim();
  const rawSeniority = normalizeToken(rawPerfil.senioridade || raw.senioridade || "pleno");
  const senioridade = /** @type {ResumeProfileInfo["senioridade"]} */ (
    VALID_SENIORITIES.has(rawSeniority) ? rawSeniority : "pleno"
  );
  const resumo = String(rawPerfil.resumo || raw.resumo || raw.objetivos || "Resumo profissional.").trim();
  const anos = Number(rawPerfil.anos_experiencia ?? raw.anos_experiencia ?? 2);

  /** @type {string[]} */
  const rawSkills = Array.isArray(raw.hard_skills)
    ? raw.hard_skills
    : Array.isArray(raw.habilidades)
      ? raw.habilidades
      : [];
  const hard_skills = [...new Set(rawSkills.map(s => String(s || "").trim()).filter(Boolean))].slice(0, 60);

  /** @type {string[]} */
  const rawKeywords = Array.isArray(raw.palavras_chave_busca)
    ? raw.palavras_chave_busca
    : [titulo, ...hard_skills.slice(0, 3)];
  const palavras_chave_busca = [...new Set(rawKeywords.map(k => String(k || "").trim()).filter(k => k.length >= 2))].slice(0, 15);

  /** @type {ResumeExperienceItem[]} */
  const rawExps = Array.isArray(raw.projetos_e_experiencias)
    ? raw.projetos_e_experiencias
    : [
        ...(Array.isArray(raw.experiencias) ? raw.experiencias : []),
        ...(Array.isArray(raw.projetos) ? raw.projetos : [])
      ];

  const projetos_e_experiencias = rawExps.slice(0, 25).map((item, idx) => {
    if (typeof item === "string") {
      return {
        id: `item-${idx + 1}`,
        tipo: /** @type {const} */ ("projeto"),
        titulo: item.slice(0, 120),
        organizacao: " Independente",
        descricao: item,
        resultados: [],
        tecnologias: hard_skills.slice(0, 5)
      };
    }
    const obj = item && typeof item === "object" ? item : {};
    const tituloItem = String(obj.titulo || obj.cargo || obj.nome || `Experiência ${idx + 1}`).trim();
    const orgItem = String(obj.organizacao || obj.empresa || obj.instituicao || "Organização").trim();
    const atividades = Array.isArray(obj.atividades) ? obj.atividades.join(". ") : "";
    const descItem = String(obj.descricao || atividades || tituloItem).trim();
    const resultados = Array.isArray(obj.resultados)
      ? obj.resultados.map((/** @type {any} */ r) => String(r || "").trim()).filter(Boolean)
      : [];
    const tecnologias = Array.isArray(obj.tecnologias)
      ? obj.tecnologias.map((/** @type {any} */ t) => String(t || "").trim()).filter(Boolean)
      : hard_skills.slice(0, 5);
    return {
      id: String(obj.id || `exp-${idx + 1}`),
      tipo: /** @type {ResumeExperienceItem["tipo"]} */ (obj.tipo || "experiencia"),
      titulo: tituloItem,
      organizacao: orgItem,
      periodo: String(obj.periodo || "").trim(),
      descricao: descItem,
      resultados,
      tecnologias
    };
  });

  const rawFormacao = Array.isArray(raw.formacao) ? raw.formacao : [];
  const formacao = rawFormacao.slice(0, 15).map((item) => {
    if (typeof item === "string") {
      return { curso: item, instituicao: "Instituição de Ensino" };
    }
    const obj = item && typeof item === "object" ? item : {};
    return {
      curso: String(obj.curso || obj.grau || "Formação").trim(),
      instituicao: String(obj.instituicao || obj.escola || "Instituição").trim(),
      nivel: obj.nivel ? String(obj.nivel).trim() : undefined,
      status: obj.status ? String(obj.status).trim() : undefined,
      ano_conclusao: obj.ano_conclusao ? String(obj.ano_conclusao).trim() : undefined
    };
  });

  const rawPrefs = raw.preferencias_vaga && typeof raw.preferencias_vaga === "object" ? raw.preferencias_vaga : {};
  const rawMods = Array.isArray(rawPrefs.modalidades) ? rawPrefs.modalidades : ["remoto", "hibrido", "presencial"];
  const modalidades = /** @type {Array<"remoto"|"hibrido"|"presencial">} */ (
    [...new Set(rawMods.map(normalizeToken).filter(m => VALID_MODALITIES.has(m)))]
  );
  if (modalidades.length === 0) modalidades.push("remoto", "hibrido");

  const rawPlats = Array.isArray(rawPrefs.plataformas_ativas)
    ? rawPrefs.plataformas_ativas
    : ["Gupy", "LinkedIn", "InfoJobs"];
  const plataformas_ativas = /** @type {Array<"Gupy"|"LinkedIn"|"InfoJobs">} */ (
    rawPlats.filter((/** @type {any} */ p) => VALID_PLATFORMS.has(p))
  );

  return {
    perfil: {
      titulo,
      senioridade,
      anos_experiencia: Number.isFinite(anos) && anos >= 0 ? Math.min(anos, 60) : 2,
      resumo,
      idiomas: Array.isArray(rawPerfil.idiomas || raw.idiomas)
        ? (rawPerfil.idiomas || raw.idiomas).slice(0, 10).map((/** @type {any} */ lang) =>
            typeof lang === "string"
              ? { idioma: lang, nivel: "Intermediário" }
              : { idioma: String(lang?.idioma || "Português"), nivel: String(lang?.nivel || "Fluente") }
          )
        : [{ idioma: "Português", nivel: "Nativo" }]
    },
    palavras_chave_busca: palavras_chave_busca.length ? palavras_chave_busca : ["Desenvolvedor"],
    hard_skills,
    projetos_e_experiencias,
    formacao,
    preferencias_vaga: {
      modalidades,
      localidades: Array.isArray(rawPrefs.localidades)
        ? rawPrefs.localidades.map((/** @type {any} */ l) => String(l).trim()).filter(Boolean)
        : ["Brasil"],
      plataformas_ativas: plataformas_ativas.length ? plataformas_ativas : ["Gupy", "LinkedIn", "InfoJobs"],
      nivel_minimo_match: typeof rawPrefs.nivel_minimo_match === "number" ? rawPrefs.nivel_minimo_match : 35
    }
  };
}

/**
 * Validates a standardized or legacy resume object against schema constraints.
 * Returns { valid, errors, normalized }.
 * @param {unknown} input
 * @returns {{ valid: boolean, errors: string[], resume: StandardizedResume | null }}
 */
export function validateResume(input) {
  /** @type {string[]} */
  const errors = [];
  if (!input) {
    return { valid: false, errors: ["Currículo vazio."], resume: null };
  }

  const rawString = typeof input === "string" ? input : JSON.stringify(input);
  if (rawString.length > 25000) {
    errors.push("O currículo excede o limite de 25.000 caracteres.");
    return { valid: false, errors, resume: null };
  }
  if (rawString.includes("SUBSTITUA:")) {
    errors.push("Substitua os campos de exemplo ('SUBSTITUA:') pelos seus dados reais.");
  }

  try {
    const resume = normalizeResume(input);
    if (!resume.perfil.titulo || resume.perfil.titulo.length < 2) {
      errors.push("O título profissional em 'perfil.titulo' é obrigatório.");
    }
    if (!resume.perfil.resumo || resume.perfil.resumo.length < 10) {
      errors.push("O resumo profissional em 'perfil.resumo' deve ter pelo menos 10 caracteres.");
    }
    if (!Array.isArray(resume.hard_skills) || resume.hard_skills.length === 0) {
      errors.push("Informe pelo menos 1 competência em 'hard_skills'.");
    }
    if (!Array.isArray(resume.palavras_chave_busca) || resume.palavras_chave_busca.length === 0) {
      errors.push("Informe pelo menos 1 termo em 'palavras_chave_busca'.");
    }
    return { valid: errors.length === 0, errors, resume: errors.length === 0 ? resume : null };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Erro ao validar currículo.");
    return { valid: false, errors, resume: null };
  }
}

/**
 * Converts unstructured resume text into a structured StandardizedResume object.
 * @param {string} text
 * @returns {StandardizedResume}
 */
export function textToResumeDraft(text) {
  const clean = text.replace(/\r\n/g, "\n").trim();
  const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);
  const firstLine = lines[0] || "Profissional";

  const knownTechs = [
    "JavaScript", "TypeScript", "React", "Vue", "Angular", "Node.js", "Python", "Java", "C#",
    "Go", "Rust", "PHP", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes",
    "AWS", "GCP", "Azure", "Git", "HTML5", "CSS3", "Tailwind", "Playwright", "Cypress", "Jest",
    "GraphQL", "REST API", "Linux", "Scrum", "Kanban", "Figma", "Next.js", "NestJS", "Spring Boot"
  ];
  const lowerText = normalizeToken(clean);
  const detectedSkills = knownTechs.filter(tech => {
    const token = normalizeToken(tech);
    return lowerText.includes(token);
  });

  if (detectedSkills.length === 0) {
    detectedSkills.push("Comunicação", "Resolução de Problemas");
  }

  let senioridade = /** @type {ResumeProfileInfo["senioridade"]} */ ("pleno");
  if (/\b(estagi|intern|trainee)\b/i.test(lowerText)) senioridade = "estagio";
  else if (/\b(junior|jr)\b/i.test(lowerText)) senioridade = "junior";
  else if (/\b(senior|sr|especialista|staff|lead|principal)\b/i.test(lowerText)) senioridade = "senior";

  return {
    perfil: {
      titulo: firstLine.slice(0, 100),
      senioridade,
      anos_experiencia: senioridade === "senior" ? 5 : senioridade === "pleno" ? 3 : 1,
      resumo: clean.slice(0, 800),
      idiomas: [{ idioma: "Português", nivel: "Nativo" }]
    },
    palavras_chave_busca: [firstLine.slice(0, 60), ...detectedSkills.slice(0, 3)],
    hard_skills: detectedSkills,
    projetos_e_experiencias: [
      {
        id: "exp-1",
        tipo: "experiencia",
        titulo: firstLine.slice(0, 120),
        organizacao: "Experiência Extraída do Texto",
        periodo: "Recente",
        descricao: clean.slice(0, 1500),
        resultados: [],
        tecnologias: detectedSkills.slice(0, 6)
      }
    ],
    formacao: [],
    preferencias_vaga: {
      modalidades: ["remoto", "hibrido", "presencial"],
      localidades: ["Brasil"],
      plataformas_ativas: ["Gupy", "LinkedIn", "InfoJobs"],
      nivel_minimo_match: 35
    }
  };
}
