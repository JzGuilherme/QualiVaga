"use strict";

const form = document.getElementById("settings");
const keyInput = document.getElementById("api-key");
const profileInput = document.getElementById("profile");
const status = document.getElementById("status");
const keyState = document.getElementById("key-state");
const example = {
  resumo: "SUBSTITUA: seu resumo profissional verdadeiro",
  habilidades: ["SUBSTITUA: habilidades que você possui"],
  experiencias: [{ cargo: "", empresa: "", atividades: [], resultados: [] }],
  formacao: [], idiomas: [], projetos: [], objetivos: ""
};

async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const saved = await chrome.storage.local.get(["apiKey", "masterProfile"]);
  keyState.textContent = saved.apiKey ? "Chave cadastrada. Deixe vazio para mantê-la." : "Nenhuma chave cadastrada.";
  profileInput.value = JSON.stringify(saved.masterProfile || example, null, 2);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const raw = profileInput.value.trim();
    if (raw.length > 20000) throw new Error("O perfil excede 20.000 caracteres.");
    let profile;
    try { profile = JSON.parse(raw); } catch { throw new Error("JSON inválido. Confira aspas, vírgulas e chaves."); }
    if (!profile || Array.isArray(profile) || typeof profile !== "object" || !Object.keys(profile).length) {
      throw new Error("O perfil deve ser um objeto JSON não vazio.");
    }
    if (raw.includes("SUBSTITUA:")) throw new Error("Substitua o perfil de exemplo pelos seus dados reais.");
    const apiKey = keyInput.value.trim();
    if (apiKey && (!apiKey.startsWith("sk-") || /\s/.test(apiKey) || apiKey.length < 20)) {
      throw new Error("Confira o formato da chave OpenAI.");
    }
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    await chrome.storage.local.set({ masterProfile: profile, ...(apiKey ? { apiKey } : {}) });
    keyInput.value = "";
    await initialize();
    status.textContent = "Configurações salvas.";
  } catch (error) { status.textContent = error.message || "Não foi possível salvar."; }
});

document.getElementById("delete-key").addEventListener("click", async () => {
  try {
    await chrome.storage.local.remove("apiKey");
    keyInput.value = "";
    keyState.textContent = "Nenhuma chave cadastrada.";
    status.textContent = "Chave excluída. Análises já em andamento podem concluir.";
  } catch { status.textContent = "Não foi possível excluir a chave."; }
});

initialize().catch(() => { status.textContent = "Falha ao carregar configurações. Reabra esta página."; });
