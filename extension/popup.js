chrome.storage.local.get("leetlog_queue").then((o) => {
  const n = (o.leetlog_queue || []).length;
  if (n) {
    document.getElementById("queue").innerHTML =
      `<span class="bad">⏳ 离线队列 <b>${n}</b> 条</span>，服务恢复后自动补录`;
  }
});

fetch("http://127.0.0.1:8763/ping")
  .then((r) => r.json())
  .then((d) => {
    const bridge = d.bridge === "obsidian-plugin" ? "Obsidian 插件" : "Python 服务";
    document.getElementById("status").innerHTML = `<span class="ok">🟢 本地服务运行中</span>（${bridge}）`;
    document.getElementById("info").innerHTML =
      `笔记位置：<b>${d.folder}</b><br>` +
      `Vault：<b>${d.vault}</b><br>` +
      `进行中的题：<b>${d.active.length ? d.active.join(", ") : "无"}</b><br>` +
      `累计记录：<b>${d.notes} 篇</b>`;
  })
  .catch(() => {
    document.getElementById("status").innerHTML = `<span class="bad">🔴 本地服务未运行</span>`;
    document.getElementById("info").innerHTML =
      `请在终端启动：<br><code>python3 leetlog_server.py</code><br>（见 LeetLog README）`;
  });
