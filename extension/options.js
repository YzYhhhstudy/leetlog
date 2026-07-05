// LeetLog 设置页 — 模式切换 / 文件夹选择与授权 / 模板语言
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  async function saveSettings(patch) {
    const s = await nwGetSettings();
    Object.assign(s, patch);
    await chrome.storage.local.set({ leetlog_settings: s });
    chrome.runtime.sendMessage({ source: "leetlog", type: "__flush" }).catch(() => {});
    return s;
  }

  async function refreshFolderStatus() {
    const st = await nwDirStatus();
    const el = $("folderStatus");
    const grant = $("grantFolder");
    grant.classList.add("hidden");
    if (st === "unset") {
      el.innerHTML = `<span class="warn">尚未选择文件夹</span>`;
    } else if (st === "granted") {
      const dir = await nwGetDir();
      el.innerHTML = `<span class="ok">🟢 已授权：${dir.name}</span>`;
    } else {
      const dir = await nwGetDir();
      el.innerHTML = `<span class="bad">🔴 ${dir.name} 的授权已失效（浏览器重启后需要重新授权一次）</span>`;
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
  $("lang").addEventListener("change", (e) => saveSettings({ lang: e.target.value }));

  (async () => {
    const s = await nwGetSettings();
    ($(s.mode === "folder" ? "modeFolder" : "modeBridge")).checked = true;
    $("lang").value = s.lang;
    await refreshFolderStatus();
  })();
})();
