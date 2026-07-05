// LeetLog popup — 按模式显示桥接/文件夹状态、离线队列、设置入口
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  chrome.storage.local.get("leetlog_queue").then((o) => {
    const n = (o.leetlog_queue || []).length;
    if (n) {
      $("queue").innerHTML = `<span class="bad">⏳ 离线队列 <b>${n}</b> 条</span>，目标恢复后自动补录`;
    }
  });

  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  async function showFolderMode() {
    const st = await nwDirStatus();
    if (st === "granted") {
      const dir = await nwGetDir();
      let notes = 0;
      try {
        for await (const [name] of dir.entries()) {
          if (/^\d{4}-.*\.md$/.test(name)) notes++;
        }
      } catch (_) {}
      $("status").innerHTML = `<span class="ok">🟢 直写文件夹模式</span>`;
      $("info").innerHTML = `笔记位置：<b>${dir.name}/</b><br>累计记录：<b>${notes} 篇</b>`;
    } else if (st === "unset") {
      $("status").innerHTML = `<span class="bad">🔴 尚未选择笔记文件夹</span>`;
      $("info").innerHTML = `请到 <a href="#" id="goOpt">设置页</a> 选择文件夹`;
      $("goOpt").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    } else {
      $("status").innerHTML = `<span class="bad">🔴 文件夹授权已失效</span>`;
      $("info").innerHTML = `<button id="regrant">重新授权</button>`;
      $("regrant").addEventListener("click", async () => {
        const dir = await nwGetDir();
        if (!dir) return;
        await dir.requestPermission({ mode: "readwrite" });
        chrome.runtime.sendMessage({ source: "leetlog", type: "__flush" }).catch(() => {});
        location.reload();
      });
    }
  }

  function showBridgeMode() {
    fetch("http://127.0.0.1:8763/ping")
      .then((r) => r.json())
      .then((d) => {
        const bridge = d.bridge === "obsidian-plugin" ? "Obsidian 插件" : "Python 服务";
        const ver = d.version ? ` v${d.version}` : "";
        $("status").innerHTML = `<span class="ok">🟢 本地服务运行中</span>（${bridge}${ver}）`;
        $("info").innerHTML =
          `笔记位置：<b>${d.folder}</b><br>` +
          `Vault：<b>${d.vault}</b><br>` +
          `进行中的题：<b>${d.active.length ? d.active.join(", ") : "无"}</b><br>` +
          `累计记录：<b>${d.notes} 篇</b>`;
      })
      .catch(() => {
        $("status").innerHTML = `<span class="bad">🔴 本地服务未运行</span>`;
        $("info").innerHTML =
          `启动 Obsidian（LeetLog Bridge 插件）或运行：<br><code>python3 leetlog_server.py</code><br>` +
          `不用 Obsidian？<a href="#" id="goOpt2">设置</a>里可切换为直写文件夹模式`;
        $("goOpt2").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
      });
  }

  nwGetSettings().then((s) => {
    if (s.mode === "folder") showFolderMode();
    else showBridgeMode();
  });
})();
