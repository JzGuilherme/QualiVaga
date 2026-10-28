// @ts-check
"use strict";

/**
 * @typedef {Object} PlatformHealthMetric
 * @property {boolean} ok
 * @property {number} successRate
 * @property {number} latencyMs
 * @property {number} jobsExtracted
 * @property {string | null} lastError
 */

/**
 * @typedef {Object} TelemetrySnapshot
 * @property {string} updatedAt
 * @property {number} time_to_first_value_ms
 * @property {Record<"Gupy"|"LinkedIn"|"InfoJobs", PlatformHealthMetric>} adapter_health_by_platform
 * @property {number} dom_injection_retention_rate
 * @property {number} grounding_compliance_rate
 * @property {number} user_edit_ratio
 * @property {{ totalInjections: number, retainedInjections: number, totalAnswers: number, groundedAnswers: number }} counters
 */

const STORAGE_KEY = "qualivagaTelemetry";

/**
 * Returns an initialized default telemetry snapshot.
 * @returns {TelemetrySnapshot}
 */
export function createEmptyTelemetry() {
  return {
    updatedAt: new Date().toISOString(),
    time_to_first_value_ms: 0,
    adapter_health_by_platform: {
      Gupy: { ok: true, successRate: 100, latencyMs: 0, jobsExtracted: 0, lastError: null },
      LinkedIn: { ok: true, successRate: 100, latencyMs: 0, jobsExtracted: 0, lastError: null },
      InfoJobs: { ok: true, successRate: 100, latencyMs: 0, jobsExtracted: 0, lastError: null }
    },
    dom_injection_retention_rate: 100,
    grounding_compliance_rate: 100,
    user_edit_ratio: 0,
    counters: {
      totalInjections: 0,
      retainedInjections: 0,
      totalAnswers: 0,
      groundedAnswers: 0
    }
  };
}

/**
 * Loads the current telemetry snapshot from `chrome.storage.local` (100% local, zero external requests).
 * @returns {Promise<TelemetrySnapshot>}
 */
export async function getTelemetrySnapshot() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local?.get) {
      const saved = await chrome.storage.local.get(STORAGE_KEY);
      if (saved && saved[STORAGE_KEY] && typeof saved[STORAGE_KEY] === "object") {
        return { ...createEmptyTelemetry(), ...saved[STORAGE_KEY] };
      }
    }
  } catch {}
  return createEmptyTelemetry();
}

/**
 * Saves an updated telemetry snapshot to `chrome.storage.local`.
 * @param {TelemetrySnapshot} snapshot
 * @returns {Promise<TelemetrySnapshot>}
 */
export async function saveTelemetrySnapshot(snapshot) {
  snapshot.updatedAt = new Date().toISOString();
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local?.set) {
      await chrome.storage.local.set({ [STORAGE_KEY]: snapshot });
    }
  } catch {}
  return snapshot;
}

/**
 * Records multi-platform discovery KPIs (`time_to_first_value_ms` and `adapter_health_by_platform`).
 * @param {number} durationMs
 * @param {Record<string, { platform: string, jobs: any[], error: string | null, latencyMs: number }>} platformStatuses
 * @returns {Promise<TelemetrySnapshot>}
 */
export async function recordDiscoveryTelemetry(durationMs, platformStatuses) {
  const snap = await getTelemetrySnapshot();
  snap.time_to_first_value_ms = Math.max(1, Math.round(durationMs));

  for (const plat of /** @type {const} */ (["Gupy", "LinkedIn", "InfoJobs"])) {
    const st = platformStatuses?.[plat];
    if (!st) continue;
    const ok = st.error === null;
    snap.adapter_health_by_platform[plat] = {
      ok,
      successRate: ok ? 100 : 0,
      latencyMs: Math.max(1, Math.round(st.latencyMs || durationMs)),
      jobsExtracted: Array.isArray(st.jobs) ? st.jobs.length : 0,
      lastError: st.error || null
    };
  }
  return saveTelemetrySnapshot(snap);
}

/**
 * Computes and records Evidence-Based Grounding compliance rate (`grounding_compliance_rate`).
 * Checks that every generated answer contains a valid non-empty `fato_base_curriculo` grounded in the resume or honest gap declaration.
 * @param {Array<{ fato_base_curriculo?: string, rascunho_resposta?: string, generated_answer?: string }>} answers
 * @param {any} [resume]
 * @returns {Promise<TelemetrySnapshot>}
 */
export async function recordGroundingTelemetry(answers, resume = null) {
  const snap = await getTelemetrySnapshot();
  if (!Array.isArray(answers) || answers.length === 0) return snap;

  const resumeString = resume ? JSON.stringify(resume).toLowerCase() : "";
  let groundedCount = 0;

  for (const ans of answers) {
    const fact = String(ans?.fato_base_curriculo || "").trim();
    if (fact.length >= 5) {
      if (!resumeString) {
        groundedCount++;
      } else {
        const isHonestGap = /lacuna|aprendizado|correlat|baseado|curriculo|perfil|experiencia|skill|projeto/i.test(
          fact.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        const tokens = fact
          .toLowerCase()
          .split(/[\s,.;:()/]+/)
          .filter(t => t.length >= 3);
        const hasTokenOverlap = tokens.some(t => resumeString.includes(t));
        if (isHonestGap || hasTokenOverlap) groundedCount++;
      }
    }
  }

  snap.counters.totalAnswers += answers.length;
  snap.counters.groundedAnswers += groundedCount;
  snap.grounding_compliance_rate = Math.round((snap.counters.groundedAnswers / snap.counters.totalAnswers) * 100);
  return saveTelemetrySnapshot(snap);
}

/**
 * Calculates the character edit ratio (`user_edit_ratio`) between the original AI draft and the final injected text.
 * 0.0 means the user kept the AI draft as-is; 1.0 means completely rewritten.
 * @param {string} originalDraft
 * @param {string} finalUserText
 * @returns {number}
 */
export function computeEditRatio(originalDraft, finalUserText) {
  const a = String(originalDraft || "").trim();
  const b = String(finalUserText || "").trim();
  if (!a && !b) return 0;
  if (!a || !b) return 1;
  if (a === b) return 0;

  const maxLen = Math.max(a.length, b.length);
  let diffChars = Math.abs(a.length - b.length);
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) diffChars++;
  }
  return Number(Math.min(1, diffChars / maxLen).toFixed(3));
}

/**
 * Records DOM injection retention rate (`dom_injection_retention_rate`) and `user_edit_ratio`.
 * @param {{ totalAttempted: number, retainedAfter100ms: number, editRatios: number[] }} stats
 * @returns {Promise<TelemetrySnapshot>}
 */
export async function recordDomInjectionTelemetry(stats) {
  const snap = await getTelemetrySnapshot();
  const attempted = Math.max(0, Number(stats.totalAttempted) || 0);
  const retained = Math.max(0, Number(stats.retainedAfter100ms) || 0);

  if (attempted > 0) {
    snap.counters.totalInjections += attempted;
    snap.counters.retainedInjections += retained;
    snap.dom_injection_retention_rate = Math.round(
      (snap.counters.retainedInjections / snap.counters.totalInjections) * 100
    );
  }

  if (Array.isArray(stats.editRatios) && stats.editRatios.length > 0) {
    const avg = stats.editRatios.reduce((acc, v) => acc + v, 0) / stats.editRatios.length;
    snap.user_edit_ratio = Number(avg.toFixed(3));
  }

  return saveTelemetrySnapshot(snap);
}
