"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Loads environment variables from `.env` in the project root (Zero-Build, zero external dependencies).
 * Existing process.env variables take precedence over `.env` values.
 * @param {string} [rootDir]
 * @returns {{ apiKey: string, resumePath: string, headless: boolean, gupyTestUrl: string }}
 */
function loadLocalEnv(rootDir = path.resolve(__dirname, "..")) {
  const envFile = path.join(rootDir, ".env");
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }

  const rawKey = (process.env.OPENAI_API_KEY || "").trim();
  const isPlaceholderKey = !rawKey || rawKey.includes("sua-chave-aqui") || !rawKey.startsWith("sk-");
  const apiKey = isPlaceholderKey ? "" : rawKey;

  const configuredResume = (process.env.QUALIVAGA_RESUME_PATH || "./meu-curriculo.json").trim();
  let resumePath = path.join(rootDir, "tests/fixtures/personas/persona-dev-junior.json");
  if (configuredResume) {
    const resolved = path.resolve(rootDir, configuredResume);
    if (fs.existsSync(resolved)) {
      resumePath = resolved;
    }
  }

  const rawHeadless = String(process.env.QUALIVAGA_HEADLESS ?? "true").trim().toLowerCase();
  const headless = rawHeadless !== "false" && rawHeadless !== "0";

  const gupyTestUrl = (process.env.GUPY_TEST_URL || "https://vagasisasaude.gupy.io/jobs/12641879").trim();

  return { apiKey, resumePath, headless, gupyTestUrl };
}

module.exports = { loadLocalEnv };
