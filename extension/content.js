// LeetLog content script — 运行在隔离世界
// 职责：把 interceptor.js 发出的事件转交给 background service worker，
// 由它 POST 给本地桥接；桥接不在线时自动进离线队列，恢复后按原时间戳补录。
(() => {
  "use strict";
  // 防重复注入（onInstalled 的补注入与 manifest 注入可能先后到达同一隔离世界）
  if (globalThis.__leetlogContentLoaded) return;
  globalThis.__leetlogContentLoaded = true;
  let warned = false;
  let orphanWarned = false;

  function relay(d) {
    try {
      chrome.runtime.sendMessage(d).then((r) => {
        if (r && r.queued > 0) {
          if (!warned) {
            warned = true;
            console.warn(`[LeetLog] 本地服务未运行，事件已暂存离线队列（${r.queued} 条），服务恢复后自动补录`);
          }
        } else {
          warned = false;
          console.debug(`[LeetLog] ${d.type} → 已记录 (${d.slug})`);
        }
      }).catch(() => {});
    } catch (_) {
      // 扩展更新后本页的连接已失效。新版扩展会自动补注入接管；
      // 若没接管（极旧版本升级上来），大声提示而不是无声丢事件。
      if (!orphanWarned) {
        orphanWarned = true;
        console.warn("[LeetLog] ⚠️ 扩展已更新，本页连接失效，事件未记录 —— 请刷新页面");
      }
    }
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== "leetlog" || !d.type) return;
    relay(d);
  });

  // 关闭/离开题目页 → leave 事件，服务端据此结算「本题停留」时间
  window.addEventListener("pagehide", () => {
    const slug = (location.pathname.match(/\/problems\/([^/?#]+)/) || [])[1];
    if (!slug) return;
    relay({ source: "leetlog", type: "leave", slug, ts: Math.floor(Date.now() / 1000) });
  });
})();
