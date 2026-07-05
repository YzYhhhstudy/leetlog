// LeetLog background service worker — 事件转发 + 离线队列
// content.js 把事件 sendMessage 过来，由本 worker POST 给本地桥接（127.0.0.1:8763）。
// 桥接不在线时事件存入 chrome.storage.local 队列，恢复后按原顺序回放；
// 事件自带 ts 时间戳，两端桥接都按 ts 计时，所以补录不影响计时准确性。
const SERVER = "http://127.0.0.1:8763/event";
const QUEUE_KEY = "leetlog_queue";
const MAX_QUEUE = 1000; // 超出丢最旧的，保住最近的 AC
const ALARM = "leetlog-flush"; // 队列非空时每 30s 重试一轮

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

async function post(ev) {
  const r = await fetch(SERVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ev),
  });
  if (!r.ok) throw new Error("bridge HTTP " + r.status);
}

// 新事件先入队尾，再从队头逐条发送 —— 顺序永远与发生顺序一致
async function enqueueAndFlush(ev) {
  let q = await getQueue();
  if (ev) {
    q.push(ev);
    if (q.length > MAX_QUEUE) q = q.slice(q.length - MAX_QUEUE);
    await saveQueue(q);
  }
  while (q.length) {
    try {
      await post(q[0]);
    } catch (_) {
      break; // 桥接不在线，剩余的留队列等 alarm 重试
    }
    q.shift();
    await saveQueue(q); // 每送达一条就落盘，worker 被杀也不会重复补录
  }
  await syncBadgeAndAlarm(q.length);
  return { queued: q.length };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.source !== "leetlog" || !msg.type) return;
  serialize(async () => {
    const r = await enqueueAndFlush(msg);
    try { sendResponse(r); } catch (_) {}
  });
  return true; // 保持通道开放，等待异步 sendResponse
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) serialize(() => enqueueAndFlush(null));
});

// worker 每次被唤醒（含浏览器启动）都校准徽章并尝试清队
serialize(() => enqueueAndFlush(null));
