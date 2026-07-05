// LeetLog popup — 按模式显示桥接/文件夹状态、离线队列、设置入口（界面语言跟随设置）
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  async function showFolderMode(U) {
    const st = await nwDirStatus();
    if (st === "granted") {
      const dir = await nwGetDir();
      let notes = 0;
      try {
        for await (const [name] of dir.entries()) {
          if (/^\d{4}-.*\.md$/.test(name)) notes++;
        }
      } catch (_) {}
      $("status").innerHTML = `<span class="ok">${U.folderMode}</span>`;
      $("info").innerHTML = `${U.notesPlace}：<b>${dir.name}/</b><br>${U.total}：<b>${U.notesUnit(notes)}</b>`;
    } else if (st === "unset") {
      $("status").innerHTML = `<span class="bad">${U.folderUnset}</span>`;
      $("info").innerHTML = U.goPick(`<a href="#" id="goOpt">${U.settingsPage}</a>`);
      $("goOpt").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    } else {
      $("status").innerHTML = `<span class="bad">${U.permLost}</span>`;
      $("info").innerHTML = `<button id="regrant">${U.regrant}</button>`;
      $("regrant").addEventListener("click", async () => {
        const dir = await nwGetDir();
        if (!dir) return;
        await dir.requestPermission({ mode: "readwrite" });
        chrome.runtime.sendMessage({ source: "leetlog", type: "__flush" }).catch(() => {});
        location.reload();
      });
    }
  }

  function showBridgeMode(U) {
    fetch("http://127.0.0.1:8763/ping")
      .then((r) => r.json())
      .then((d) => {
        const bridge = d.bridge === "obsidian-plugin" ? U.bridgeObsidian : U.bridgePython;
        const ver = d.version ? ` v${d.version}` : "";
        $("status").innerHTML = `<span class="ok">${U.bridgeRunning(bridge, ver)}</span>`;
        $("info").innerHTML =
          `${U.notesPlace}：<b>${d.folder}</b><br>` +
          `${U.vault}：<b>${d.vault}</b><br>` +
          `${U.active}：<b>${d.active.length ? d.active.join(", ") : U.noneActive}</b><br>` +
          `${U.total}：<b>${U.notesUnit(d.notes)}</b>`;
      })
      .catch(() => {
        $("status").innerHTML = `<span class="bad">${U.bridgeDown}</span>`;
        $("info").innerHTML = U.bridgeDownHint(`<a href="#" id="goOpt2">${U.settingsWord}</a>`);
        $("goOpt2").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
      });
  }

  nwGetSettings().then((s) => {
    const U = NW_UI[s.lang] || NW_UI.zh;
    $("openOptions").textContent = U.settings;
    $("status").textContent = U.checking;
    chrome.storage.local.get(["leetlog_queue", "leetlog_cloud_queue"]).then((o) => {
      const n = (o.leetlog_queue || []).length;
      const cn = (o.leetlog_cloud_queue || []).length;
      const parts = [];
      if (n) parts.push(U.queue(n));
      if (s.cloud && s.cloud.enabled && cn) parts.push(U.cloudPending(cn));
      if (parts.length) $("queue").innerHTML = `<span class="bad">${parts.join("<br>")}</span>`;
    });
    if (s.mode === "folder") showFolderMode(U);
    else showBridgeMode(U);
  });
})();
