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
  })();
})();
