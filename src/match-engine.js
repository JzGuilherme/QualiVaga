// @ts-check
"use strict";

import { normalizeToken } from "./resume-validator.js";

/**
 * @typedef {import('./resume-validator.js').StandardizedResume} StandardizedResume
 * @typedef {import('./adapters.js').DiscoveredJob} DiscoveredJob
 */

/**
 * @typedef {Object} MatchBreakdown
 * @property {number} deterministicScore
 * @property {number} semanticScore
 * @property {number} finalScore
 * @property {string[]} matchedSkills
 * @property {string[]} missingSkills
 * @property {string} reason
 */

const COMMON_MARKET_SKILLS = [
  "JavaScript", "TypeScript", "React", "Vue", "Angular", "Node.js", "Python", "Java", "C#",
  "Go", "PHP", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes",
  "AWS", "GCP", "Azure", "Git", "HTML5", "CSS3", "Playwright", "Cypress", "Jest", "GraphQL",
  "REST API", "Linux", "Next.js", "NestJS", "Spring Boot", "Terraform", "CI/CD", "Kafka"
];

/**
 * Escapes special regex characters.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks if a skill token appears in normalized job text.
 * @param {string} normalizedJobText
 * @param {string} skill
 * @returns {boolean}
 */
export function textContainsSkill(normalizedJobText, skill) {
  const token = normalizeToken(skill);
  if (!token) return false;
  if (/^[a-z0-9]+$/.test(token)) {
    const regex = new RegExp(`\\b${escapeRegex(token)}\\b`, "i");
    return regex.test(normalizedJobText);
  }
  return normalizedJobText.includes(token);
}

/**
 * Infers seniority level from job title and description.
 * @param {string} text
 * @returns {"estagio"|"junior"|"pleno"|"senior"|"especialista"|"lead"|null}
 */
export function inferJobSeniority(text) {
  const norm = normalizeToken(text);
  if (/\b(estagio|estagiario|intern|trainee)\b/.test(norm)) return "estagio";
  if (/\b(junior|jr)\b/.test(norm)) return "junior";
  if (/\b(tech lead|team lead|lider tecnico|staff|principal)\b/.test(norm)) return "lead";
  if (/\b(especialista|specialist)\b/.test(norm)) return "especialista";
  if (/\b(senior|sr)\b/.test(norm)) return "senior";
  if (/\b(pleno|mid|middle)\b/.test(norm)) return "pleno";
  return null;
}

const SENIORITY_RANK = {
  estagio: 1,
  junior: 2,
  pleno: 3,
  senior: 4,
  especialista: 5,
  lead: 5
};

/**
 * Layer 1 (Local/Fast - 60% weight of hybrid score):
 * Deterministically crosses hard skills, seniority level, and workplace modality
 * between the resume JSON and the job description.
 *
 * @param {StandardizedResume} resume
 * @param {{ title: string, description: string, workplaceType?: string }} job
 * @returns {{ score: number, matchedSkills: string[], missingSkills: string[], modalityMatch: boolean, seniorityMatch: boolean }}
 */
export function computeDeterministicMatch(resume, job) {
  const combinedText = `${job.title || ""} ${job.description || ""}`;
  const normText = normalizeToken(combinedText);

  const resumeSkills = Array.isArray(resume.hard_skills) ? resume.hard_skills : [];
  const normResumeSkills = new Set(resumeSkills.map(normalizeToken));

  // Identify skills demanded in the job description (from resume skills + market catalog)
  /** @type {string[]} */
  const matchedSkills = [];
  /** @type {string[]} */
  const missingSkills = [];

  for (const skill of resumeSkills) {
    if (textContainsSkill(normText, skill)) {
      matchedSkills.push(skill);
    }
  }

  for (const marketSkill of COMMON_MARKET_SKILLS) {
    const normMarket = normalizeToken(marketSkill);
    if (!normResumeSkills.has(normMarket) && textContainsSkill(normText, marketSkill)) {
      missingSkills.push(marketSkill);
    }
  }

  // 1. Hard Skills Subscore (0 to 65 points of Layer 1)
  const totalJobSkills = matchedSkills.length + missingSkills.length;
  let skillScore = 0;
  if (totalJobSkills > 0) {
    skillScore = (matchedSkills.length / totalJobSkills) * 65;
  } else if (resumeSkills.length > 0) {
    // Check title/keyword overlap when job snippet is brief
    const keywords = resume.palavras_chave_busca || [];
    const kwHits = keywords.filter(kw => {
      const parts = normalizeToken(kw).split(/\s+/).filter(p => p.length > 2);
      return parts.some(p => normText.includes(p));
    });
    skillScore = kwHits.length > 0 ? 45 : 25;
  }

  // 2. Seniority Subscore (0 to 20 points of Layer 1)
  const jobSen = inferJobSeniority(combinedText);
  const resSen = resume.perfil?.senioridade || "pleno";
  let seniorityScore = 18;
  let seniorityMatch = true;
  if (jobSen) {
    const diff = Math.abs((SENIORITY_RANK[jobSen] || 3) - (SENIORITY_RANK[resSen] || 3));
    if (diff === 0) {
      seniorityScore = 20;
    } else if (diff === 1) {
      seniorityScore = 13;
    } else {
      seniorityScore = 5;
      seniorityMatch = false;
    }
  }

  // 3. Modality Subscore (0 to 15 points of Layer 1)
  const prefs = resume.preferencias_vaga?.modalidades || ["remoto", "hibrido", "presencial"];
  const jobMod = /** @type {"remoto"|"hibrido"|"presencial"} */ (
    job.workplaceType || (/\b(remoto|remote|home\s*office)\b/.test(normText) ? "remoto" : /\b(hibrido|hybrid)\b/.test(normText) ? "hibrido" : "presencial")
  );
  const modalityMatch = prefs.includes(jobMod);
  const modalityScore = modalityMatch ? 15 : 5;

  const rawScore = Math.round(Math.min(100, Math.max(0, skillScore + seniorityScore + modalityScore)));
  return {
    score: rawScore,
    matchedSkills,
    missingSkills: missingSkills.slice(0, 10),
    modalityMatch,
    seniorityMatch
  };
}

/**
 * Layer 2 (Heuristic fallback when semantic AI score is not yet computed or combined with AI):
 * Combines Layer 1 (Weight 60%) + Layer 2 Semantic Score (Weight 40%).
 *
 * @param {number} deterministicScore - Score 0..100 from Layer 1
 * @param {number} semanticScore - Score 0..100 from Layer 2 (gpt-4o-mini or local experience similarity)
 * @returns {number} Final hybrid Match Score (0..100)
 */
export function combineHybridScore(deterministicScore, semanticScore) {
  const det = Math.min(100, Math.max(0, Number(deterministicScore) || 0));
  const sem = Math.min(100, Math.max(0, Number(semanticScore) || 0));
  return Math.round(det * 0.6 + sem * 0.4);
}

/**
 * Computes a local project/experience relevance estimate when semantic API is skipped or for pre-ranking.
 * @param {StandardizedResume} resume
 * @param {{ title: string, description: string }} job
 * @returns {number}
 */
export function estimateExperienceRelevance(resume, job) {
  const normJob = normalizeToken(`${job.title || ""} ${job.description || ""}`);
  const exps = Array.isArray(resume.projetos_e_experiencias) ? resume.projetos_e_experiencias : [];
  if (exps.length === 0) return 50;

  let hits = 0;
  let totalTechs = 0;
  for (const exp of exps) {
    const techs = Array.isArray(exp.tecnologias) ? exp.tecnologias : [];
    for (const tech of techs) {
      totalTechs++;
      if (textContainsSkill(normJob, tech)) hits++;
    }
  }
  if (totalTechs === 0) return 60;
  return Math.min(100, Math.round(40 + (hits / totalTechs) * 60));
}
