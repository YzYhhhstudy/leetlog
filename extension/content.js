// LeetLog content script — 运行在隔离世界
// 职责：把 interceptor.js 发出的事件转发给本地桥接服务（127.0.0.1:8763）
(() => {
  "use strict";
  const SERVER = "http://127.0.0.1:8763/event";
  let warned = false;

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== "leetlog" || !d.type) return;
    fetch(SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    }).then(() => {
      console.debug(`[LeetLog] ${d.type} → 已记录 (${d.slug})`);
    }).catch(() => {
      if (!warned) {
        warned = true;
        console.warn("[LeetLog] 本地服务未运行，事件未记录。启动：python3 leetlog_server.py");
      }
    });
  });

  // 关闭/离开题目页 → leave 事件（keepalive 保证卸载中也能送达），
  // 服务端据此结算「本题停留」时间
  window.addEventListener("pagehide", () => {
    const slug = (location.pathname.match(/\/problems\/([^/?#]+)/) || [])[1];
    if (!slug) return;
    fetch(SERVER, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "leetlog", type: "leave", slug, ts: Math.floor(Date.now() / 1000) }),
    }).catch(() => {});
  });
})();
