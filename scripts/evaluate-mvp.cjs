#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const alphaPath = path.join(root, "test-results/alpha-personas-kpis.json");
const betaPath = path.join(root, "test-results/beta-live-kpis.json");

function pad(str, len) {
  const s = String(str ?? "");
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

function evaluate() {
  if (!fs.existsSync(alphaPath)) {
    console.error("Arquivo test-results/alpha-personas-kpis.json não encontrado. Execute npm run test:alpha primeiro.");
    process.exit(1);
  }

  const alphaData = JSON.parse(fs.readFileSync(alphaPath, "utf8"));
  const betaData = fs.existsSync(betaPath) ? JSON.parse(fs.readFileSync(betaPath, "utf8")) : null;
  const personas = alphaData.personas || [];

  console.log("\n==========================================================================================");
  console.log("  QUALIVAGA — MATRIZ DE DECISÃO DE PRODUTO & AUDITORIA DE KPIs (ALPHA / BETA)");
  console.log("==========================================================================================\n");

  console.log("1. DESEMPENHO POR PERSONA SINTÉTICA (AMBIENTE ALPHA CONTROLADO):");
  console.log("------------------------------------------------------------------------------------------");
  console.log(
    `${pad("Persona", 28)} | ${pad("TTFV (ms)", 10)} | ${pad("Top Match", 10)} | ${pad("Mismatch", 9)} | ${pad("DOM Ret.", 9)} | ${pad("Grounding", 9)}`
  );
  console.log("------------------------------------------------------------------------------------------");

  let allAlphaOperational = true;
  let maxTtfv = 0;
  let minRetention = 100;
  let minGrounding = 100;
  const issues = [];

  for (const p of personas) {
    maxTtfv = Math.max(maxTtfv, p.time_to_first_value_ms);
    minRetention = Math.min(minRetention, p.dom_injection_retention_rate);
    minGrounding = Math.min(minGrounding, p.grounding_compliance_rate);

    const gOk = p.adapter_health_by_platform?.Gupy?.ok && p.adapter_health_by_platform.Gupy.jobsExtracted > 0;
    const lOk = p.adapter_health_by_platform?.LinkedIn?.ok && p.adapter_health_by_platform.LinkedIn.jobsExtracted > 0;
    const iOk = p.adapter_health_by_platform?.InfoJobs?.ok && p.adapter_health_by_platform.InfoJobs.jobsExtracted > 0;

    if (!gOk || !lOk || !iOk) {
      allAlphaOperational = false;
      issues.push(`Persona ${p.personaId}: falha em um dos adapters no modo controlado.`);
    }
    if (p.topMatchScore < 75 || p.mismatchScore > 45) {
      issues.push(`Persona ${p.personaId}: calibração de Match Score fora da margem esperada.`);
    }

    console.log(
      `${pad(p.personaId, 28)} | ${pad(`${p.time_to_first_value_ms}ms`, 10)} | ${pad(`${p.topMatchScore}%`, 10)} | ${pad(`${p.mismatchScore}%`, 9)} | ${pad(`${p.dom_injection_retention_rate}%`, 9)} | ${pad(`${p.grounding_compliance_rate}%`, 9)}`
    );
  }
  console.log("------------------------------------------------------------------------------------------\n");

  let betaOnlinePlatforms = 0;
  let betaOfflinePlatforms = 0;
  const betaWarnings = [];

  if (betaData && betaData.platformStatuses) {
    console.log("2. SAÚDE DOS ADAPTERS EM REDE REAL (SONDA BETA / CHROMIUM MV3 LIVE NETWORK):");
    console.log("------------------------------------------------------------------------------------------");
    console.log(
      `${pad("Plataforma", 14)} | ${pad("Status", 16)} | ${pad("Vagas Extraídas", 16)} | ${pad("Latência", 10)} | ${pad("Diagnóstico / Fonte", 32)}`
    );
    console.log("------------------------------------------------------------------------------------------");
    for (const plat of ["Gupy", "LinkedIn", "InfoJobs"]) {
      const st = betaData.platformStatuses[plat] || {};
      const jobsCount = st.jobs?.length ?? 0;
      const errStr = String(st.error || "");
      let statusText = "EMPTY (0 vagas)";
      let diagText = "0 vagas p/ query ou DOM alterado";

      if (errStr.startsWith("OFFLINE_SANDBOX")) {
        statusText = "OFFLINE_SANDBOX";
        diagText = errStr;
        betaOfflinePlatforms++;
      } else if (errStr) {
        statusText = "WARN/BLOCK";
        diagText = errStr;
        betaWarnings.push(`${plat}: ${errStr}`);
      } else if (jobsCount > 0) {
        statusText = "ONLINE";
        diagText = `OK (${jobsCount} vagas reais extraídas)`;
        betaOnlinePlatforms++;
      } else {
        betaWarnings.push(`${plat}: retornou 0 vagas em rede real`);
      }

      console.log(
        `${pad(plat, 14)} | ${pad(statusText, 16)} | ${pad(jobsCount, 16)} | ${pad(`${st.latencyMs ?? 0}ms`, 10)} | ${pad(diagText, 32)}`
      );
    }
    console.log("------------------------------------------------------------------------------------------\n");

    const topJobs = Array.isArray(betaData.topJobs) ? betaData.topJobs : [];
    if (topJobs.length > 0) {
      console.log("3. TOP 10 VAGAS REAIS ENCONTRADAS (GUPY, LINKEDIN E INFOJOBS — CURRÍCULO ATIVO):");
      console.log("------------------------------------------------------------------------------------------");
      console.log(
        `${pad("#", 3)} | ${pad("Match", 7)} | ${pad("Plataforma", 10)} | ${pad("Mod.", 10)} | ${pad("Cargo / Empresa", 52)}`
      );
      console.log("------------------------------------------------------------------------------------------");
      topJobs.slice(0, 10).forEach((job, idx) => {
        const score = `${Math.round(job.matchScore ?? job.deterministicScore ?? 0)}%`;
        const roleCompany = `${job.title} — ${job.company}`;
        console.log(
          `${pad(idx + 1, 3)} | ${pad(score, 7)} | ${pad(job.platform, 10)} | ${pad(job.workplaceType || "remoto", 10)} | ${pad(roleCompany, 52)}`
        );
      });
      console.log("------------------------------------------------------------------------------------------\n");
    }
  }

  // Strict Honesty Decision Matrix Logic:
  // - 🔴 PIVOTAR: All live platforms failed/blocked (and not in an offline sandbox) or Alpha core failed completely.
  // - 🟡 ITERAR: Any live platform in Beta failed/returned 0 jobs, or offline sandbox prevented live verification, or Alpha thresholds missed.
  // - 🟢 ESCALAR: All 3 Alpha Personas passed AND all 3 live Beta platforms are ONLINE with > 0 real jobs extracted, TTFV < 5000ms, DOM retention == 100%, Grounding == 100%.
  let verdict = "🟢 ESCALAR";
  let explanation =
    "Todos os 3 adapters operacionais em Alpha e em Rede Real (Beta Chromium MV3) com Vagas Extraídas > 0 nas 3 plataformas, time_to_first_value_ms < 5000ms, dom_injection_retention_rate == 100% e grounding_compliance_rate == 100%.";

  if (betaData && betaOnlinePlatforms === 0 && betaOfflinePlatforms < 3) {
    verdict = "🔴 PIVOTAR";
    explanation =
      "Nenhuma plataforma retornou vagas em rede real no Chromium MV3. Necessário revisar arquitetura de coleta ou migrar para extração ativa nas abas abertas.";
  } else if (
    !allAlphaOperational ||
    maxTtfv >= 5000 ||
    minRetention < 100 ||
    minGrounding < 100 ||
    issues.length > 0 ||
    !betaData ||
    betaOnlinePlatforms < 3
  ) {
    verdict = "🟡 ITERAR";
    const reasons = [...issues, ...betaWarnings];
    if (betaOfflinePlatforms > 0) {
      reasons.push(`${betaOfflinePlatforms} plataforma(s) em OFFLINE_SANDBOX sem internet externa.`);
    }
    explanation = `Ajustes necessários antes de escalar: ${reasons.join("; ") || "Nem todas as 3 plataformas extraíram vagas em rede real."}`;
  }

  console.log("==========================================================================================");
  console.log(`  VEREDITO AUTOMÁTICO DA MATRIZ DE DECISÃO: ${verdict}`);
  console.log("==========================================================================================");
  console.log(`  • Diagnóstico Executivo: ${explanation}`);
  console.log(`  • Plataformas Online em Rede Real (Beta Chromium MV3): ${betaOnlinePlatforms}/3`);
  console.log(`  • Time to First Value Alpha Máximo: ${maxTtfv}ms | Beta Rede Real: ${betaData?.time_to_first_value_ms ?? 0}ms`);
  console.log(`  • Retenção de Injeção no DOM (React/Textarea/ContentEditable): ${minRetention}% (Meta: 100%)`);
  console.log(`  • Conformidade Anti-Alucinação (fato_base_curriculo): ${minGrounding}% (Meta: 100%)`);
  console.log("==========================================================================================\n");
}

evaluate();
