// @ts-check
"use strict";

/**
 * @typedef {Object} DiscoveredJob
 * @property {string} id
 * @property {"Gupy"|"LinkedIn"|"InfoJobs"} platform
 * @property {string} title
 * @property {string} company
 * @property {string} location
 * @property {"remoto"|"hibrido"|"presencial"} workplaceType
 * @property {string} url
 * @property {string} description
 * @property {string} [publishedAt]
 */

/**
 * @typedef {Object} AdapterSearchResult
 * @property {"Gupy"|"LinkedIn"|"InfoJobs"} platform
 * @property {DiscoveredJob[]} jobs
 * @property {string | null} error
 * @property {number} latencyMs
 * @property {string} [source]
 */

/**
 * @typedef {import('./resume-validator.js').StandardizedResume} StandardizedResume
 */

/**
 * Decodes HTML entities (named, decimal, and hex) and strips HTML tags safely without DOM parser.
 * @param {string} raw
 * @param {number} [max]
 * @returns {string}
 */
export function stripHtml(raw, max = 4000) {
  return String(raw || "")
    .replace(/<(script|style|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Formats detailed fetch/network errors including `error.cause?.code`, HTTP status, and attempted URL.
 * Also identifies offline/sandbox conditions (`ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`, `ERR_INTERNET_DISCONNECTED`).
 * @param {string} platform
 * @param {unknown} err
 * @param {string} attemptedUrl
 * @param {number} [httpStatus]
 * @returns {string}
 */
export function formatDetailedFetchError(platform, err, attemptedUrl, httpStatus = 0) {
  const shortUrl = String(attemptedUrl || "").slice(0, 120);
  if (httpStatus > 0) {
    return `HTTP_${httpStatus}_${platform.toUpperCase()} [url=${shortUrl}]`;
  }
  const e = /** @type {any} */ (err);
  const causeCode = e?.cause?.code || e?.code || "";
  const causeMsg = e?.cause?.message || "";
  const msg = e instanceof Error ? e.message : String(err || "unknown error");
  const combined = `${causeCode} ${causeMsg} ${msg}`;

  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/i.test(combined)) {
    return `OFFLINE_SANDBOX [${causeCode || msg}] [url=${shortUrl}]`;
  }
  return `FALHA_REDE_${platform.toUpperCase()} [code=${causeCode || "FETCH_ERR"}] [msg=${msg}${causeMsg ? ` (${causeMsg})` : ""}] [url=${shortUrl}]`;
}

/**
 * Infers workplace modality from text/metadata.
 * @param {string} text
 * @returns {"remoto"|"hibrido"|"presencial"}
 */
export function inferModality(text) {
  const norm = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\b(remoto|remote|home\s*office|teletrabalho|100%\s*remoto|anywhere)\b/.test(norm)) return "remoto";
  if (/\b(hibrido|hybrid)\b/.test(norm)) return "hibrido";
  return "presencial";
}

/**
 * Builds search queries from a standardized resume.
 * @param {StandardizedResume} resume
 * @returns {string[]}
 */
export function buildSearchQueries(resume) {
  const keywords = Array.isArray(resume.palavras_chave_busca) ? resume.palavras_chave_busca : [];
  const skills = Array.isArray(resume.hard_skills) ? resume.hard_skills : [];
  const primarySkill = skills[0] || "";
  const combined = [
    keywords[0],
    primarySkill,
    keywords[1],
    resume.perfil?.titulo,
    skills.slice(0, 2).join(" ")
  ]
    .map(q => String(q || "").trim())
    .filter(Boolean);
  return [...new Set(combined)].slice(0, 3);
}

/**
 * Normalizes an adapter execution output into an explicit AdapterSearchResult.
 * Never returns silent hardcoded jobs when network/parser fails.
 * @param {"Gupy"|"LinkedIn"|"InfoJobs"} platform
 * @param {AdapterSearchResult | DiscoveredJob[]} raw
 * @param {number} latencyMs
 * @returns {AdapterSearchResult}
 */
export function normalizeAdapterOutcome(platform, raw, latencyMs) {
  if (Array.isArray(raw)) {
    return { platform, jobs: raw, error: null, latencyMs };
  }
  return {
    platform: raw.platform || platform,
    jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
    error: raw.error ?? null,
    latencyMs: typeof raw.latencyMs === "number" ? raw.latencyMs : latencyMs,
    source: raw.source || "http"
  };
}

/**
 * Adapter for Gupy (`portal.api.gupy.io` + `portal.gupy.io/job-search/term=` SSR `__NEXT_DATA__` + Content Script DOM fallback).
 */
export class GupyAdapter {
  constructor() {
    /** @type {"Gupy"} */
    this.platform = "Gupy";
  }

  /**
   * Maps raw Gupy job JSON items into DiscoveredJob objects.
   * @param {any[]} items
   * @param {Map<string, DiscoveredJob>} jobsMap
   */
  collectGupyJsonItems(items, jobsMap) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.id || item.jobId || "").trim();
      const title = stripHtml(item.name || item.title || "", 200);
      if (!id || !title) continue;
      const company = stripHtml(item.careerPageName || item.companyName || "Empresa na Gupy", 150);
      const city = stripHtml(item.city || "", 80);
      const state = stripHtml(item.state || "", 40);
      const location = [city, state].filter(Boolean).join(" - ") || stripHtml(item.country || "Brasil", 80);
      const rawWorkplace = String(item.workplaceType || item.type || "");
      const description = stripHtml(
        `${item.description || ""} ${item.prerequisites || ""} ${item.responsibilities || ""} ${title} ${company}`,
        4000
      );
      const workplaceType = inferModality(`${rawWorkplace} ${location} ${description}`);
      const jobUrl =
        typeof item.jobUrl === "string" && item.jobUrl.startsWith("https://")
          ? item.jobUrl
          : `https://portal.gupy.io/job-search/term=${encodeURIComponent(title)}`;

      if (!jobsMap.has(id)) {
        jobsMap.set(id, {
          id: `gupy-${id}`,
          platform: "Gupy",
          title,
          company,
          location,
          workplaceType,
          url: jobUrl,
          description,
          publishedAt: item.publishedDate || item.applicationDeadline || undefined
        });
      }
    }
  }

  /**
   * Parses Gupy Portal HTML (`__NEXT_DATA__` JSON payload or rendered job cards).
   * @param {string} html
   * @param {string} fallbackQuery
   * @param {Map<string, DiscoveredJob>} jobsMap
   */
  parseGupyPortalHtml(html, fallbackQuery, jobsMap) {
    const nextMatch = String(html || "").match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextMatch) {
      try {
        const parsed = JSON.parse(nextMatch[1]);
        const initialList = parsed?.props?.pageProps?.initialJobList;
        const items = Array.isArray(initialList)
          ? initialList
          : Array.isArray(initialList?.data)
            ? initialList.data
            : Array.isArray(parsed?.props?.pageProps?.jobs)
              ? parsed.props.pageProps.jobs
              : [];
        this.collectGupyJsonItems(items, jobsMap);
        if (jobsMap.size > 0) return;
      } catch {}
    }

    // Fallback HTML card extraction for Gupy Portal DOM
    const linkRegex = /<a[^>]+href="(https:\/\/[a-z0-9-]+\.gupy\.io\/jobs\/\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    let idx = 0;
    while ((m = linkRegex.exec(String(html || ""))) !== null && idx < 15) {
      idx++;
      const url = m[1];
      const text = stripHtml(m[2], 300);
      if (!text) continue;
      const idMatch = url.match(/\/jobs\/(\d+)/);
      const id = idMatch ? idMatch[1] : `${idx}`;
      if (!jobsMap.has(id)) {
        jobsMap.set(id, {
          id: `gupy-${id}`,
          platform: "Gupy",
          title: text.slice(0, 160),
          company: "Portal Gupy",
          location: "Brasil",
          workplaceType: inferModality(text),
          url,
          description: `${text} (${fallbackQuery})`
        });
      }
    }
  }

  /**
   * Searches open jobs on Gupy Portal API and SSR Portal Search (`portal.gupy.io/job-search/term=`).
   * Never returns fake/mock jobs on error.
   * @param {StandardizedResume} resume
   * @param {(input: string, init?: RequestInit) => Promise<Response>} [fetchFn]
   * @param {AbortSignal} [signal]
   * @param {((platform: "Gupy"|"LinkedIn"|"InfoJobs", query: string) => Promise<DiscoveredJob[]>) | null} [domFallback]
   * @returns {Promise<AdapterSearchResult>}
   */
  async search(resume, fetchFn = fetch, signal = undefined, domFallback = null) {
    const start = Date.now();
    const queries = buildSearchQueries(resume);
    /** @type {Map<string, DiscoveredJob>} */
    const jobsMap = new Map();
    /** @type {string | null} */
    let lastError = null;
    let successfulResponses = 0;

    for (const query of queries.slice(0, 3)) {
      const encoded = encodeURIComponent(query);
      const apiUrl = `https://portal.api.gupy.io/api/v1/jobs?jobName=${encoded}&limit=15&offset=0`;
      try {
        const res = await fetchFn(apiUrl, {
          method: "GET",
          signal,
          credentials: "omit",
          headers: { Accept: "application/json, text/html" }
        });

        if (res.ok) {
          const body = await res.json();
          const items = Array.isArray(body?.data) ? body.data : Array.isArray(body?.jobs) ? body.jobs : null;
          if (items) {
            successfulResponses++;
            this.collectGupyJsonItems(items, jobsMap);
            continue;
          }
          lastError = `FORMATO_JSON_INESPERADO_GUPY [url=${apiUrl}]`;
        } else if (res.status === 404 || res.status === 403) {
          // Gupy migrated public search to SSR Next.js on https://portal.gupy.io/job-search/term=<query>
          const ssrUrl = `https://portal.gupy.io/job-search/term=${encoded}`;
          try {
            const ssrRes = await fetchFn(ssrUrl, {
              method: "GET",
              signal,
              credentials: "omit",
              headers: { Accept: "text/html,application/xhtml+xml,application/json" }
            });
            if (ssrRes.ok && typeof ssrRes.text === "function") {
              const html = await ssrRes.text();
              if (html && (html.includes("__NEXT_DATA__") || html.includes(".gupy.io/jobs/"))) {
                successfulResponses++;
                this.parseGupyPortalHtml(html, query, jobsMap);
                lastError = null;
                continue;
              }
            }
            lastError = formatDetailedFetchError("Gupy", null, apiUrl, res.status);
          } catch {
            lastError = formatDetailedFetchError("Gupy", null, apiUrl, res.status);
          }
        } else {
          lastError = formatDetailedFetchError("Gupy", null, apiUrl, res.status);
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = formatDetailedFetchError("Gupy", err, apiUrl);
      }
    }

    // Fallback via Content Script / DOM Extractor if direct HTTP returned 0 jobs and domFallback is available
    if (jobsMap.size === 0 && typeof domFallback === "function") {
      try {
        const domJobs = await domFallback("Gupy", queries[0] || "Desenvolvedor");
        if (Array.isArray(domJobs) && domJobs.length > 0) {
          return {
            platform: "Gupy",
            jobs: domJobs,
            error: null,
            latencyMs: Math.max(1, Date.now() - start),
            source: "content-script-dom"
          };
        }
      } catch {}
    }

    const jobs = [...jobsMap.values()];
    return {
      platform: "Gupy",
      jobs,
      error: successfulResponses === 0 && lastError ? lastError : null,
      latencyMs: Math.max(1, Date.now() - start)
    };
  }
}

/**
 * Adapter for LinkedIn Public Guest Jobs Search (`jobs-guest/jobs/api/seeMoreJobPostings/search`).
 */
export class LinkedInAdapter {
  constructor() {
    /** @type {"LinkedIn"} */
    this.platform = "LinkedIn";
  }

  /**
   * Searches public jobs on LinkedIn Guest API/HTML or falls back to Content Script DOM extractor.
   * Never returns silent fake jobs on failure.
   * @param {StandardizedResume} resume
   * @param {(input: string, init?: RequestInit) => Promise<Response>} [fetchFn]
   * @param {AbortSignal} [signal]
   * @param {((platform: "Gupy"|"LinkedIn"|"InfoJobs", query: string) => Promise<DiscoveredJob[]>) | null} [domFallback]
   * @returns {Promise<AdapterSearchResult>}
   */
  async search(resume, fetchFn = fetch, signal = undefined, domFallback = null) {
    const start = Date.now();
    const queries = buildSearchQueries(resume);
    const locationPref = resume.preferencias_vaga?.localidades?.[0] || "Brazil";
    /** @type {Map<string, DiscoveredJob>} */
    const jobsMap = new Map();
    /** @type {string | null} */
    let lastError = null;
    let successfulResponses = 0;

    for (const query of queries.slice(0, 2)) {
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(locationPref)}&start=0`;
      try {
        const res = await fetchFn(url, {
          method: "GET",
          signal,
          credentials: "omit",
          headers: { Accept: "text/html,application/json" }
        });
        if (!res.ok) {
          lastError = formatDetailedFetchError("LinkedIn", null, url, res.status);
          continue;
        }
        const contentType = res.headers?.get?.("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : null;
          if (!list) {
            lastError = `FORMATO_JSON_INESPERADO_LINKEDIN [url=${url}]`;
            continue;
          }
          successfulResponses++;
          for (const item of list) {
            const id = String(item.id || "").trim();
            const title = stripHtml(item.title || "", 200);
            if (!id || !title) continue;
            const company = stripHtml(item.company || "Empresa no LinkedIn", 150);
            const location = stripHtml(item.location || locationPref, 120);
            const description = stripHtml(item.description || `${title} - ${company} (${query})`, 4000);
            jobsMap.set(id, {
              id: `linkedin-${id}`,
              platform: "LinkedIn",
              title,
              company,
              location,
              workplaceType: inferModality(`${item.workplaceType || ""} ${location} ${description}`),
              url: item.url || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(title)}`,
              description
            });
          }
          continue;
        }

        const html = await res.text();
        if (/authwall|security-challenge|captcha/i.test(html) && !/<li\b/i.test(html)) {
          lastError = `BLOQUEIO_AUTHWALL_OU_CAPTCHA_LINKEDIN [url=${url}]`;
          continue;
        }
        successfulResponses++;
        const cards = this.parseLinkedInHtml(html, query);
        if (cards.length === 0 && html.trim().length > 0 && !/<li\b/i.test(html)) {
          lastError = `SELETORES_HTML_NAO_ENCONTRADOS_LINKEDIN [url=${url}]`;
        }
        for (const card of cards) {
          if (!jobsMap.has(card.id)) jobsMap.set(card.id, card);
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = formatDetailedFetchError("LinkedIn", err, url);
      }
    }

    if (jobsMap.size === 0 && typeof domFallback === "function") {
      try {
        const domJobs = await domFallback("LinkedIn", queries[0] || "Desenvolvedor");
        if (Array.isArray(domJobs) && domJobs.length > 0) {
          return {
            platform: "LinkedIn",
            jobs: domJobs,
            error: null,
            latencyMs: Math.max(1, Date.now() - start),
            source: "content-script-dom"
          };
        }
      } catch {}
    }

    const jobs = [...jobsMap.values()];
    return {
      platform: "LinkedIn",
      jobs,
      error: (successfulResponses === 0 || (jobs.length === 0 && lastError)) ? lastError : null,
      latencyMs: Math.max(1, Date.now() - start)
    };
  }

  /**
   * Parses LinkedIn guest job cards HTML (`<li>` with `.base-search-card`) into DiscoveredJob objects.
   * @param {string} html
   * @param {string} fallbackQuery
   * @returns {DiscoveredJob[]}
   */
  parseLinkedInHtml(html, fallbackQuery) {
    /** @type {DiscoveredJob[]} */
    const results = [];
    const blocks = String(html || "").split(/<li\b[^>]*>/i).slice(1, 16);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const urnMatch = block.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/i);
      const id = urnMatch ? urnMatch[1] : `${i + 1}`;
      const titleMatch =
        block.match(/class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i) ||
        block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const companyMatch =
        block.match(/class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/i) ||
        block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
      const locMatch = block.match(/class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const linkMatch = block.match(
        /href="(https:\/\/[a-z]{2,3}\.linkedin\.com\/jobs\/view\/[^"?]+|https:\/\/www\.linkedin\.com\/jobs\/view\/[^"?]+)"/i
      );
      const descMatch = block.match(/class="[^"]*job-search-card__snippet[^"]*"[^>]*>([\s\S]*?)<\/p>/i);

      const title = stripHtml(titleMatch ? titleMatch[1] : "", 200);
      if (!title) continue;
      const company = stripHtml(companyMatch ? companyMatch[1] : "Empresa LinkedIn", 150);
      const location = stripHtml(locMatch ? locMatch[1] : "Brasil", 120);
      const snippet = stripHtml(descMatch ? descMatch[1] : "", 2000);
      const url = linkMatch ? linkMatch[1] : `https://www.linkedin.com/jobs/view/${id}`;
      const description = stripHtml(`${title} na ${company}. Local: ${location}. ${snippet} Palavras-chave: ${fallbackQuery}`, 4000);

      results.push({
        id: `linkedin-${id}`,
        platform: "LinkedIn",
        title,
        company,
        location,
        workplaceType: inferModality(`${title} ${location} ${snippet}`),
        url,
        description
      });
    }
    return results;
  }
}

/**
 * Adapter for InfoJobs Brasil (`https://www.infojobs.com.br/empregos.aspx?palabra=<query>` and `/vagas-de-emprego-<slug>.aspx`).
 */
export class InfoJobsAdapter {
  constructor() {
    /** @type {"InfoJobs"} */
    this.platform = "InfoJobs";
  }

  /**
   * Searches public jobs on InfoJobs Brasil or falls back to Content Script DOM extractor.
   * Never returns silent fake jobs on failure.
   * @param {StandardizedResume} resume
   * @param {(input: string, init?: RequestInit) => Promise<Response>} [fetchFn]
   * @param {AbortSignal} [signal]
   * @param {((platform: "Gupy"|"LinkedIn"|"InfoJobs", query: string) => Promise<DiscoveredJob[]>) | null} [domFallback]
   * @returns {Promise<AdapterSearchResult>}
   */
  async search(resume, fetchFn = fetch, signal = undefined, domFallback = null) {
    const start = Date.now();
    const queries = buildSearchQueries(resume);
    /** @type {Map<string, DiscoveredJob>} */
    const jobsMap = new Map();
    /** @type {string | null} */
    let lastError = null;
    let successfulResponses = 0;

    for (const query of queries.slice(0, 2)) {
      const url = `https://www.infojobs.com.br/empregos.aspx?palabra=${encodeURIComponent(query)}`;
      try {
        const res = await fetchFn(url, {
          method: "GET",
          signal,
          credentials: "omit",
          headers: { Accept: "text/html,application/json" }
        });
        if (!res.ok) {
          lastError = formatDetailedFetchError("InfoJobs", null, url, res.status);
          continue;
        }
        const contentType = res.headers?.get?.("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : null;
          if (!list) {
            lastError = `FORMATO_JSON_INESPERADO_INFOJOBS [url=${url}]`;
            continue;
          }
          successfulResponses++;
          for (const item of list) {
            const id = String(item.id || "").trim();
            const title = stripHtml(item.title || "", 200);
            if (!id || !title) continue;
            const company = stripHtml(item.company || "Empresa no InfoJobs", 150);
            const location = stripHtml(item.location || "Brasil", 120);
            const description = stripHtml(item.description || `${title} - ${company} (${query})`, 4000);
            jobsMap.set(id, {
              id: `infojobs-${id}`,
              platform: "InfoJobs",
              title,
              company,
              location,
              workplaceType: inferModality(`${item.workplaceType || ""} ${location} ${description}`),
              url: item.url || `https://www.infojobs.com.br/vaga-de-${encodeURIComponent(title.toLowerCase().replace(/\s+/g, "-"))}__${id}.aspx`,
              description
            });
          }
          continue;
        }

        const html = await res.text();
        if (/cloudflare|attention required|captcha|access denied/i.test(html) && !/js_rowCard|vaga-de-/i.test(html)) {
          lastError = `BLOQUEIO_WAF_OU_CAPTCHA_INFOJOBS [url=${url}]`;
          continue;
        }
        successfulResponses++;
        const cards = this.parseInfoJobsHtml(html, query);
        if (cards.length === 0 && html.trim().length > 0 && !/js_rowCard|data-id=|\/vaga-de-/i.test(html)) {
          lastError = `SELETORES_HTML_NAO_ENCONTRADOS_INFOJOBS [url=${url}]`;
        }
        for (const card of cards) {
          if (!jobsMap.has(card.id)) jobsMap.set(card.id, card);
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = formatDetailedFetchError("InfoJobs", err, url);
      }
    }

    if (jobsMap.size === 0 && typeof domFallback === "function") {
      try {
        const domJobs = await domFallback("InfoJobs", queries[0] || "Desenvolvedor");
        if (Array.isArray(domJobs) && domJobs.length > 0) {
          return {
            platform: "InfoJobs",
            jobs: domJobs,
            error: null,
            latencyMs: Math.max(1, Date.now() - start),
            source: "content-script-dom"
          };
        }
      } catch {}
    }

    const jobs = [...jobsMap.values()];
    return {
      platform: "InfoJobs",
      jobs,
      error: (successfulResponses === 0 || (jobs.length === 0 && lastError)) ? lastError : null,
      latencyMs: Math.max(1, Date.now() - start)
    };
  }

  /**
   * Parses InfoJobs HTML listings (both `.js_rowCard` / `data-id` blocks and `/vaga-de-...__ID.aspx` anchors) into DiscoveredJob objects.
   * @param {string} html
   * @param {string} fallbackQuery
   * @returns {DiscoveredJob[]}
   */
  parseInfoJobsHtml(html, fallbackQuery) {
    /** @type {Map<string, DiscoveredJob>} */
    const map = new Map();
    const rawHtml = String(html || "");

    // Strategy 1: Split by data-id or js_rowCard blocks (supports nested divs on live InfoJobs SSR)
    const blocks = rawHtml.split(/(?=<div[^>]+(?:id="vacancy\d+"|data-id="\d+"|class="[^"]*js_rowCard[^"]*"))/i);
    for (const block of blocks) {
      if (!/data-id="\d+"|js_rowCard/i.test(block)) continue;
      if (map.size >= 15) break;

      const idMatch = block.match(/data-id="(\d+)"/i) || block.match(/__(\d+)\.aspx/i);
      const id = idMatch ? idMatch[1] : `${map.size + 1}`;
      const titleMatch =
        block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) ||
        block.match(/class="[^"]*(?:js_vacancyTitle|vagaTitle)[^"]*"[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i) ||
        block.match(/<a[^>]+href="[^"]*\/vaga-de-[^"]+\.aspx"[^>]*>([\s\S]*?)<\/a>/i);

      const title = stripHtml(titleMatch ? titleMatch[1] : "", 200);
      if (!title) continue;

      const companyMatch =
        block.match(/href="https:\/\/www\.infojobs\.com\.br\/empresa-[^"]+"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
        block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const locMatch = block.match(/class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const descMatch =
        block.match(/class="[^"]*vagaDesc[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const hrefMatch =
        block.match(/data-href="(\/vaga-de-[^"]+\.aspx)"/i) ||
        block.match(/href="(\/vaga-de-[^"]+\.aspx|https:\/\/www\.infojobs\.com\.br\/vaga-de-[^"]+\.aspx)"/i);

      const company = stripHtml(companyMatch ? companyMatch[1].replace(/Este selo indica[\s\S]*/i, "") : "Empresa InfoJobs", 150);
      const location = stripHtml(locMatch ? locMatch[1] : "Brasil", 120);
      const snippet = stripHtml(descMatch ? descMatch[1] : "", 2000);
      const rawUrl = hrefMatch
        ? hrefMatch[1]
        : `https://www.infojobs.com.br/empregos.aspx?palabra=${encodeURIComponent(title)}`;
      const url = rawUrl.startsWith("http") ? rawUrl : `https://www.infojobs.com.br${rawUrl}`;
      const description = stripHtml(`${title} na ${company}. Local: ${location}. ${snippet} Busca: ${fallbackQuery}`, 4000);

      if (!map.has(id)) {
        map.set(id, {
          id: `infojobs-${id}`,
          platform: "InfoJobs",
          title,
          company,
          location,
          workplaceType: inferModality(`${title} ${location} ${snippet}`),
          url,
          description
        });
      }
    }

    // Strategy 2: Direct anchor extraction if card classes changed
    if (map.size === 0) {
      const anchorRegex = /<a[^>]+href="([^"]*\/vaga-de-[^"]+__(\d+)\.aspx)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = anchorRegex.exec(rawHtml)) !== null && map.size < 12) {
        const rawHref = m[1];
        const id = m[2];
        const title = stripHtml(m[3], 200);
        if (!title || map.has(id)) continue;
        const url = rawHref.startsWith("http") ? rawHref : `https://www.infojobs.com.br${rawHref}`;
        map.set(id, {
          id: `infojobs-${id}`,
          platform: "InfoJobs",
          title,
          company: "Empresa InfoJobs",
          location: "Brasil",
          workplaceType: inferModality(title),
          url,
          description: `${title} (${fallbackQuery})`
        });
      }
    }

    return [...map.values()];
  }
}

/**
 * Orchestrates multi-platform job discovery across Gupy, LinkedIn, and InfoJobs
 * with explicit per-platform error and health reporting (zero silent mocks).
 */
export class JobDiscoveryEngine {
  /**
   * @param {Object} [options]
   * @param {Array<GupyAdapter|LinkedInAdapter|InfoJobsAdapter>} [options.adapters]
   * @param {(input: string, init?: RequestInit) => Promise<Response>} [options.fetchFn]
   * @param {((platform: "Gupy"|"LinkedIn"|"InfoJobs", query: string) => Promise<DiscoveredJob[]>) | null} [options.domFallback]
   */
  constructor(options = {}) {
    this.adapters = options.adapters || [
      new GupyAdapter(),
      new LinkedInAdapter(),
      new InfoJobsAdapter()
    ];
    this.fetchFn = options.fetchFn || ((url, init) => fetch(url, init));
    this.domFallback = options.domFallback || null;
  }

  /**
   * Runs job discovery across all active platforms in parallel.
   * @param {StandardizedResume} resume
   * @param {AbortSignal} [signal]
   * @returns {Promise<{
   *   jobs: DiscoveredJob[],
   *   platformCounts: Record<string, number>,
   *   platformStatuses: Record<string, AdapterSearchResult>
   * }>}
   */
  async discover(resume, signal = undefined) {
    const activePlatforms = new Set(
      resume.preferencias_vaga?.plataformas_ativas?.length
        ? resume.preferencias_vaga.plataformas_ativas
        : ["Gupy", "LinkedIn", "InfoJobs"]
    );

    const selectedAdapters = this.adapters.filter(a => activePlatforms.has(a.platform));
    /** @type {Record<string, number>} */
    const platformCounts = { Gupy: 0, LinkedIn: 0, InfoJobs: 0 };
    /** @type {Record<string, AdapterSearchResult>} */
    const platformStatuses = {};

    const settled = await Promise.allSettled(
      selectedAdapters.map(async adapter => {
        const t0 = Date.now();
        const raw = await adapter.search(resume, this.fetchFn, signal, this.domFallback);
        return normalizeAdapterOutcome(adapter.platform, raw, Math.max(1, Date.now() - t0));
      })
    );

    /** @type {DiscoveredJob[]} */
    const allJobs = [];
    selectedAdapters.forEach((adapter, idx) => {
      const outcome = settled[idx];
      if (outcome.status === "fulfilled" && outcome.value) {
        const statusObj = outcome.value;
        platformCounts[adapter.platform] = statusObj.jobs.length;
        platformStatuses[adapter.platform] = statusObj;
        allJobs.push(...statusObj.jobs);
      } else {
        const errReason =
          outcome.status === "rejected" && outcome.reason instanceof Error
            ? outcome.reason.message
            : "FALHA_INESPERADA_ADAPTER";
        platformCounts[adapter.platform] = 0;
        platformStatuses[adapter.platform] = {
          platform: adapter.platform,
          jobs: [],
          error: errReason,
          latencyMs: 0
        };
      }
    });

    return { jobs: allJobs, platformCounts, platformStatuses };
  }
}
