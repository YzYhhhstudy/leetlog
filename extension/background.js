// LeetLog background service worker — 事件分发 + 离线队列
// content.js 把事件 sendMessage 过来，按设置分发：
//   bridge 模式（默认）→ POST 给本地桥接（127.0.0.1:8763，Obsidian 插件或 Python 服务）
//   folder 模式（extension-only）→ note-writer.js 直写用户选定的文件夹（FSA）
// 目标不可用（桥接离线 / 文件夹未授权）时事件进 chrome.storage.local 队列，恢复后按原顺序回放；
// 事件自带 ts 时间戳，计时不受补录影响。
importScripts("note-writer.js");

const SERVER = "http://127.0.0.1:8763/event";
const QUEUE_KEY = "leetlog_queue";
const CLOUD_QUEUE_KEY = "leetlog_cloud_queue"; // 云端独立队列：本地与云端各自的可用性互不拖累
const MAX_QUEUE = 1000; // 超出丢最旧的，保住最近的 AC
const ALARM = "leetlog-flush"; // 任一队列非空时每 30s 重试一轮
const CLOUD_BATCH = 200;

// 队列操作全部串行，避免 alarm 重试与新事件并发读写 storage 打乱顺序
let chain = Promise.resolve();
const serialize = (fn) => (chain = chain.then(fn, fn));

async function getQueue() {
  const o = await chrome.storage.local.get(QUEUE_KEY);
  return o[QUEUE_KEY] || [];
}

async function saveQueue(q) {
  await chrome.storage.local.set({ [QUEUE_KEY]: q });
}

async function syncBadgeAndAlarm(n) {
  await chrome.action.setBadgeText({ text: n ? String(n) : "" });
  if (n) {
    await chrome.action.setBadgeBackgroundColor({ color: "#e8a13c" });
    chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
  } else {
    chrome.alarms.clear(ALARM);
  }
}

// 返回 true=送达；false=桥接在线但拒绝了该事件（如旧版桥接不认识新事件类型，
// 重试无意义，调用方应丢弃，否则会堵住整个队列）；抛异常=桥接不在线
async function post(ev) {
  const r = await fetch(SERVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ev),
  });
  return r.ok;
}

// 按设置分发单个事件。语义与 post 一致：true=送达/已处理；false=丢弃；抛异常=留队列重试
async function deliver(ev) {
  const s = await nwGetSettings();
  if (s.mode === "folder") {
    try {
      await nwHandleEvent(ev, s.lang);
      return true;
    } catch (e) {
      if (e && e.retryable) throw e; // 未选文件夹 / 授权失效 → 队列保留
      console.error("[LeetLog] 笔记写入失败，事件已丢弃：", ev && ev.type, e);
      return true; // 意外错误不堵队列
    }
  }
  return post(ev);
}

// 每个事件分配单调递增 seq：云端 dedupe_key 的一部分（同秒两次 Run 也不会合并）
async function nextSeq() {
  const o = await chrome.storage.local.get("leetlog_seq");
  const seq = (o.leetlog_seq || 0) + 1;
  await chrome.storage.local.set({ leetlog_seq: seq });
  return seq;
}

// ---------- 云端队列（可选，独立于本地队列） ----------

async function getCloudQueue() {
  const o = await chrome.storage.local.get(CLOUD_QUEUE_KEY);
  return o[CLOUD_QUEUE_KEY] || [];
}

const saveCloudQueue = (q) => chrome.storage.local.set({ [CLOUD_QUEUE_KEY]: q });

// 批量 POST 到云端。成功清出已发送段；401 = token 失效，自动断开避免队列无限膨胀
async function flushCloud(settings) {
  const cloud = settings.cloud || {};
  if (!cloud.enabled || !cloud.token || !cloud.url) return 0;
  let q = await getCloudQueue();
  while (q.length) {
    const batch = q.slice(0, CLOUD_BATCH);
    let resp;
    try {
      resp = await fetch(cloud.url.replace(/\/$/, "") + "/v1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cloud.token}` },
        body: JSON.stringify({ events: batch }),
      });
    } catch (_) {
      break; // 网络不可达，留队列
    }
    if (resp.status === 401) {
      console.warn("[LeetLog] 云端 token 已失效，自动断开云同步（设置页可重新配对）");
      const s = await nwGetSettings();
      s.cloud = { ...s.cloud, enabled: false, error: "token-revoked" };
      await chrome.storage.local.set({ leetlog_settings: s });
      break;
    }
    if (!resp.ok) break; // 429/5xx：留队列等下轮
    q = q.slice(batch.length);
    await saveCloudQueue(q);
  }
  return q.length;
}

// 新事件先入队尾，再从队头逐条发送 —— 顺序永远与发生顺序一致
async function enqueueAndFlush(ev) {
  const settings = await nwGetSettings();
  let q = await getQueue();
  if (ev) {
    ev.seq = await nextSeq();
    q.push(ev);
    if (q.length > MAX_QUEUE) q = q.slice(q.length - MAX_QUEUE);
    await saveQueue(q);
    if (settings.cloud && settings.cloud.enabled) {
      let cq = await getCloudQueue();
      cq.push(ev);
      if (cq.length > MAX_QUEUE) cq = cq.slice(cq.length - MAX_QUEUE);
      await saveCloudQueue(cq);
    }
  }
  while (q.length) {
    let delivered = false;
    try {
      delivered = await deliver(q[0]);
    } catch (_) {
      break; // 目标不可用（桥接离线/文件夹未授权），剩余的留队列等 alarm 重试
    }
    if (!delivered) console.warn("[LeetLog] 桥接拒绝事件，已丢弃（桥接版本过旧？）：", q[0] && q[0].type);
    q.shift();
    await saveQueue(q); // 每处理一条就落盘，worker 被杀也不会重复补录
  }
  const cloudPending = await flushCloud(settings);
  await syncBadgeAndAlarm(q.length + cloudPending);
  return { queued: q.length, cloudQueued: cloudPending };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.source !== "leetlog" || !msg.type) return;
  if (msg.type === "__flush") {
    // options/popup 在授权或切换模式后主动触发清队
    serialize(async () => {
      const r = await enqueueAndFlush(null);
      try { sendResponse(r); } catch (_) {}
    });
    return true;
  }
  serialize(async () => {
    const r = await enqueueAndFlush(msg);
    try { sendResponse(r); } catch (_) {}
  });
  return true; // 保持通道开放，等待异步 sendResponse
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) serialize(() => enqueueAndFlush(null));
});

// 扩展安装/更新会孤立已打开页面里的 content script（chrome.runtime 失效，事件静默丢失）。
// 把脚本重新注入所有已打开的题目页，长期开着的标签页无需手动刷新。
// 两个脚本都有自愈守卫：interceptor 靠页面 window 标记防止重复挂钩，content 靠隔离世界标记防重复监听。
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({
    url: ["*://leetcode.com/problems/*", "*://leetcode.cn/problems/*"],
  });
  for (const t of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["interceptor.js"], world: "MAIN" });
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["content.js"] });
    } catch (_) {
      // 睡眠/崩溃的标签页注入失败没关系，用户刷新后 manifest 声明的注入会接管
    }
  }
});

// worker 每次被唤醒（含浏览器启动）都校准徽章并尝试清队
serialize(() => enqueueAndFlush(null));
