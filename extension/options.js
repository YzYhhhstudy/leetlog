// LeetLog 设置页 — 模式切换 / 文件夹选择与授权 / 语言（界面即时跟随）
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let U = NW_UI.zh;

  async function saveSettings(patch) {
    const s = await nwGetSettings();
    Object.assign(s, patch);
    await chrome.storage.local.set({ leetlog_settings: s });
    chrome.runtime.sendMessage({ source: "leetlog", type: "__flush" }).catch(() => {});
    return s;
  }

  function renderText() {
    document.title = U.optTitle.replace("📗 ", "");
    $("optTitle").textContent = U.optTitle;
    $("secMode").textContent = U.secMode;
    $("modeBridgeLabel").textContent = U.modeBridge;
    $("modeBridgeDesc").textContent = U.modeBridgeDesc;
    $("modeFolderLabel").textContent = U.modeFolder;
    $("modeFolderDesc").textContent = U.modeFolderDesc;
    $("pickFolder").textContent = U.pick;
    $("grantFolder").textContent = U.regrant;
    $("secLang").textContent = U.secLang;
    $("langDesc").textContent = U.langDesc;
    $("footer").textContent = U.footer;
    $("secCloud").textContent = U.secCloud;
    $("cloudDesc").textContent = U.cloudDesc;
    $("cloudUrlLabel").textContent = U.cloudUrl + "：";
    $("cloudCodeLabel").textContent = U.cloudCode + "：";
    $("cloudConnect").textContent = U.cloudConnect;
    $("cloudDisconnect").textContent = U.cloudDisconnect;
  }

  async function refreshCloudStatus() {
    const s = await nwGetSettings();
    const el = $("cloudStatus");
    const form = $("cloudForm");
    const disc = $("cloudDisconnect");
    if (s.cloud.enabled && s.cloud.token) {
      el.innerHTML = `<span class="ok">${U.cloudOn(s.cloud.deviceId ?? "?")}</span>`;
      form.classList.add("hidden");
      disc.classList.remove("hidden");
    } else {
      el.innerHTML = s.cloud.error === "token-revoked"
        ? `<span class="bad">${U.cloudRevoked}</span>`
        : `<span class="warn">${U.cloudOff}</span>`;
      form.classList.remove("hidden");
      disc.classList.add("hidden");
      if (s.cloud.url) $("cloudUrl").value = s.cloud.url;
    }
  }

  async function refreshFolderStatus() {
    const st = await nwDirStatus();
    const el = $("folderStatus");
    const grant = $("grantFolder");
    grant.classList.add("hidden");
    if (st === "unset") {
      el.innerHTML = `<span class="warn">${U.statusUnset}</span>`;
    } else if (st === "granted") {
      const dir = await nwGetDir();
      el.innerHTML = `<span class="ok">${U.statusGranted(dir.name)}</span>`;
    } else {
      const dir = await nwGetDir();
      el.innerHTML = `<span class="bad">${U.statusLost(dir.name)}</span>`;
      grant.classList.remove("hidden");
    }
  }

  $("pickFolder").addEventListener("click", async () => {
    try {
      const dir = await window.showDirectoryPicker({ mode: "readwrite" });
      await nwSetDir(dir);
      await refreshFolderStatus();
      chrome.runtime.sendMessage({ source: "leetlog", type: "__flush" }).catch(() => {});
    } catch (_) { /* 用户取消 */ }
  });

  $("grantFolder").addEventListener("click", async () => {
    const dir = await nwGetDir();
    if (!dir) return;
    await dir.requestPermission({ mode: "readwrite" });
    await refreshFolderStatus();
    chrome.runtime.sendMessage({ source: "leetlog", type: "__flush" }).catch(() => {});
  });

  $("cloudConnect").addEventListener("click", async () => {
    const url = $("cloudUrl").value.trim().replace(/\/$/, "");
    const code = $("cloudCode").value.trim().toUpperCase();
    if (!url || !code) return;
    try {
      const r = await fetch(url + "/v1/pair/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, device_name: `chrome-${navigator.platform || "browser"}` }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      await saveSettings({ cloud: { enabled: true, url, token: d.token, deviceId: d.device_id } });
      $("cloudCode").value = "";
    } catch (_) {
      $("cloudStatus").innerHTML = `<span class="bad">${U.cloudBadCode}</span>`;
      return;
    }
    await refreshCloudStatus();
  });

  $("cloudDisconnect").addEventListener("click", async () => {
    await saveSettings({ cloud: { enabled: false, url: "", token: "" } });
    await refreshCloudStatus();
  });

  $("modeBridge").addEventListener("change", () => saveSettings({ mode: "bridge" }));
  $("modeFolder").addEventListener("change", () => saveSettings({ mode: "folder" }));
  $("lang").addEventListener("change", async (e) => {
    await saveSettings({ lang: e.target.value });
    U = NW_UI[e.target.value] || NW_UI.zh;
    renderText();
    await refreshFolderStatus();
  });

  (async () => {
    const s = await nwGetSettings();
    U = NW_UI[s.lang] || NW_UI.zh;
    renderText();
    ($(s.mode === "folder" ? "modeFolder" : "modeBridge")).checked = true;
    $("lang").value = s.lang;
    await refreshFolderStatus();
    await refreshCloudStatus();
  })();
})();
