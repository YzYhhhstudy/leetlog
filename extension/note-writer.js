// LeetLog note writer — extension-only（文件夹直写）模式的内置桥接
// 与 Python 版 / Obsidian 插件版的笔记逻辑一一对应：同样的模板、计时语义、幂等规则。
// 文件 IO 走 File System Access API（目录句柄存 IndexedDB），会话状态存 chrome.storage.local。
// 本文件同时被 service worker（importScripts）、options 页和 popup（<script>）加载，
// 顶层只定义函数/常量，不执行任何副作用。

const NW_SESSION_GAP = 6 * 3600; // 超过 6 小时视为新的一次做题

const NW_STRINGS = {
  zh: {
    weekdays: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    attempt: (n) => `第 ${n} 次`,
    start: (t) => `⏱ 开始 ${t}`,
    firstSubmit: (t, m) => `→ 首提 ${t} · 编码 ${m} 分钟`,
    ac: (t, s, a) => `→ AC ${t} · 提交 ${s} 次 / 通过 ${a} 次`,
    submitted: (s) => `· 已提交 ${s} 次（未 AC）`,
    inProgress: "→ （进行中）",
    runs: (r) => `· 运行 ${r} 次`,
    stay: (m) => `· 本题停留 ${m} 分钟`,
    codeHeader: (lang, t, perf) => `### ✅ 通过代码 · ${lang} · ${t}` + (perf ? `（${perf}）` : ""),
    codeFold: "代码",
    stmt: "题面",
    videos: "讲解视频",
    sections: "### 💭 思路 & 感悟\n-\n\n### 📚 学到了什么（新函数 / 新数据结构 / 新套路）\n-\n\n### 🔀 多种解法\n-\n",
    link: "题目链接",
  },
  en: {
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    attempt: (n) => `Attempt ${n}`,
    start: (t) => `⏱ start ${t}`,
    firstSubmit: (t, m) => `→ first submit ${t} · coding ${m} min`,
    ac: (t, s, a) => `→ AC ${t} · ${s} submit${s > 1 ? "s" : ""} / ${a} AC`,
    submitted: (s) => `· ${s} submitted (no AC yet)`,
    inProgress: "→ (in progress)",
    runs: (r) => `· ${r} run${r !== 1 ? "s" : ""}`,
    stay: (m) => `· ${m} min on problem`,
    codeHeader: (lang, t, perf) => `### ✅ Accepted · ${lang} · ${t}` + (perf ? ` (${perf})` : ""),
    codeFold: "Code",
    stmt: "Problem",
    videos: "Video solutions",
    sections: "### 💭 Thoughts & insights\n-\n\n### 📚 What I learned (new functions / data structures / patterns)\n-\n\n### 🔀 Alternative solutions\n-\n",
    link: "Problem link",
  },
};

// 扩展 UI 字符串（popup / options），跟随 leetlog_settings.lang
const NW_UI = {
  zh: {
    settings: "⚙️ 设置",
    checking: "检测中…",
    queue: (n) => `⏳ 离线队列 <b>${n}</b> 条，目标恢复后自动补录`,
    folderMode: "🟢 直写文件夹模式",
    notesPlace: "笔记位置",
    total: "累计记录",
    notesUnit: (n) => `${n} 篇`,
    folderUnset: "🔴 尚未选择笔记文件夹",
    goPick: (link) => `请到 ${link} 选择文件夹`,
    settingsPage: "设置页",
    permLost: "🔴 文件夹授权已失效",
    regrant: "重新授权",
    bridgeRunning: (b, v) => `🟢 本地服务运行中（${b}${v}）`,
    bridgeObsidian: "Obsidian 插件",
    bridgePython: "Python 服务",
    vault: "Vault",
    active: "进行中的题",
    noneActive: "无",
    bridgeDown: "🔴 本地服务未运行",
    bridgeDownHint: (opt) => `启动 Obsidian（LeetLog Bridge 插件）或运行：<br><code>python3 leetlog_server.py</code><br>不用 Obsidian？${opt}里可切换为直写文件夹模式`,
    settingsWord: "设置",
    // options 页
    optTitle: "📗 LeetLog 设置",
    secMode: "笔记写入方式",
    modeBridge: "本地桥接（默认）",
    modeBridgeDesc: "事件发给 127.0.0.1:8763 —— LeetLog Bridge Obsidian 插件或 Python 服务。适合 Obsidian 用户，笔记模板语言在桥接侧设置。",
    modeFolder: "直写文件夹（无需 Obsidian）",
    modeFolderDesc: "扩展直接把 Markdown 笔记写进你选的文件夹（浏览器 File System Access 授权，数据同样不离开本机）。选 Obsidian vault 里的子文件夹也可以，效果与桥接一致。",
    pick: "选择文件夹…",
    secLang: "语言 / Language",
    langDesc: "扩展界面语言，同时是直写文件夹模式的笔记模板语言（桥接模式的笔记语言请在桥接侧设置）。",
    statusUnset: "尚未选择文件夹",
    statusGranted: (name) => `🟢 已授权：${name}`,
    statusLost: (name) => `🔴 ${name} 的授权已失效（浏览器重启后需要重新授权一次）`,
    footer: "修改即时生效。切换模式不影响已积压的离线队列——队列会发往新的目标。",
    secCloud: "云端同步（可选）",
    cloudDesc: "把事件同时发送到 LeetLog Cloud：自动错题本、间隔复习提醒、仪表盘。本地笔记完全不受影响，随时可断开。",
    cloudUrl: "服务地址",
    cloudCode: "配对码",
    cloudConnect: "连接",
    cloudDisconnect: "断开",
    cloudOn: (n) => `🟢 已连接（设备 #${n}）`,
    cloudOff: "未连接",
    cloudRevoked: "🔴 连接已失效（token 被吊销），请重新配对",
    cloudBadCode: "配对失败：配对码无效或已过期",
    cloudPending: (n) => `☁️ 云同步排队 ${n} 条，服务可达后自动补发`,
    dueTitle: (n) => `🔁 今天该复习 <b>${n}</b> 题`,
    dueNone: "🎉 今天没有到期的复习题",
    dueMore: (n) => `…还有 ${n} 题`,
  },
  en: {
    settings: "⚙️ Settings",
    checking: "Checking…",
    queue: (n) => `⏳ Offline queue: <b>${n}</b> pending — auto-replayed once the target is back`,
    folderMode: "🟢 Folder mode",
    notesPlace: "Notes folder",
    total: "Total notes",
    notesUnit: (n) => `${n}`,
    folderUnset: "🔴 No notes folder selected",
    goPick: (link) => `Pick a folder in ${link}`,
    settingsPage: "Settings",
    permLost: "🔴 Folder permission expired",
    regrant: "Re-grant",
    bridgeRunning: (b, v) => `🟢 Local bridge running (${b}${v})`,
    bridgeObsidian: "Obsidian plugin",
    bridgePython: "Python server",
    vault: "Vault",
    active: "Active problems",
    noneActive: "none",
    bridgeDown: "🔴 Local bridge not running",
    bridgeDownHint: (opt) => `Start Obsidian (LeetLog Bridge plugin) or run:<br><code>python3 leetlog_server.py</code><br>No Obsidian? Switch to folder mode in ${opt}`,
    settingsWord: "Settings",
    // options page
    optTitle: "📗 LeetLog Settings",
    secMode: "How notes are written",
    modeBridge: "Local bridge (default)",
    modeBridgeDesc: "Events go to 127.0.0.1:8763 — the LeetLog Bridge Obsidian plugin or the Python server. Best for Obsidian users; note template language is configured on the bridge side.",
    modeFolder: "Write to a folder (no Obsidian needed)",
    modeFolderDesc: "The extension writes Markdown notes straight into a folder you pick (browser File System Access permission; nothing leaves your machine). A subfolder inside your Obsidian vault works too — identical notes.",
    pick: "Choose folder…",
    secLang: "Language / 语言",
    langDesc: "Extension UI language, and the note template language for folder mode (bridge-mode note language is set on the bridge side).",
    statusUnset: "No folder selected yet",
    statusGranted: (name) => `🟢 Granted: ${name}`,
    statusLost: (name) => `🔴 Permission for ${name} expired (needs one re-grant after a browser restart)`,
    footer: "Changes apply immediately. Switching modes keeps the offline queue — pending events go to the new target.",
    secCloud: "Cloud sync (optional)",
    cloudDesc: "Also send events to LeetLog Cloud: auto mistake notebook, spaced-repetition reminders, dashboards. Local notes are unaffected; disconnect anytime.",
    cloudUrl: "Server URL",
    cloudCode: "Pairing code",
    cloudConnect: "Connect",
    cloudDisconnect: "Disconnect",
    cloudOn: (n) => `🟢 Connected (device #${n})`,
    cloudOff: "Not connected",
    cloudRevoked: "🔴 Connection expired (token revoked) — pair again",
    cloudBadCode: "Pairing failed: invalid or expired code",
    cloudPending: (n) => `☁️ ${n} events queued for cloud — auto-syncs when reachable`,
    dueTitle: (n) => `🔁 <b>${n}</b> problem(s) due for review today`,
    dueNone: "🎉 Nothing due for review today",
    dueMore: (n) => `…and ${n} more`,
  },
};

const NW_LANG_MD = {
  python3: "python", python: "python", cpp: "cpp", "c++": "cpp", java: "java",
  javascript: "javascript", typescript: "typescript", golang: "go", go: "go",
  rust: "rust", c: "c", csharp: "csharp", "c#": "csharp", kotlin: "kotlin",
  swift: "swift", ruby: "ruby", scala: "scala", mysql: "sql", sql: "sql",
};

// ---------------- 小工具（与插件版一致） ----------------

const nwPad2 = (n) => String(n).padStart(2, "0");
const nwHm = (ts) => { const d = new Date(ts * 1000); return `${nwPad2(d.getHours())}:${nwPad2(d.getMinutes())}`; };
const nwYmd = (ts) => { const d = new Date(ts * 1000); return `${d.getFullYear()}-${nwPad2(d.getMonth() + 1)}-${nwPad2(d.getDate())}`; };
const nwMins = (a, b) => Math.max(1, Math.round((b - a) / 60));

function nwFmGet(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

function nwFmSet(text, key, value) {
  if (new RegExp(`^${key}:`, "m").test(text)) {
    return text.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`);
  }
  return text.replace("---\n", `---\n${key}: ${value}\n`);
}

// ---------------- IndexedDB：目录句柄 ----------------

function nwIdb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("leetlog", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function nwIdbGet(key) {
  const db = await nwIdb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("kv").objectStore("kv").get(key);
    t.onsuccess = () => resolve(t.result);
    t.onerror = () => reject(t.error);
  });
}

async function nwIdbSet(key, val) {
  const db = await nwIdb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("kv", "readwrite").objectStore("kv").put(val, key);
    t.onsuccess = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

const nwGetDir = () => nwIdbGet("dirHandle");
const nwSetDir = (h) => nwIdbSet("dirHandle", h);

// 'unset' | 'granted' | 'prompt' | 'denied'
async function nwDirStatus() {
  const h = await nwGetDir();
  if (!h) return "unset";
  return h.queryPermission({ mode: "readwrite" });
}

// ---------------- 设置 / 会话 / 元数据缓存（chrome.storage.local） ----------------

async function nwGetSettings() {
  const o = await chrome.storage.local.get("leetlog_settings");
  const s = Object.assign({ mode: "bridge", lang: "zh" }, o.leetlog_settings || {});
  s.cloud = Object.assign({ enabled: false, url: "", token: "" }, s.cloud || {});
  return s;
}

async function nwGetSessions() {
  const o = await chrome.storage.local.get("leetlog_sessions");
  return o.leetlog_sessions || {};
}

const nwSaveSessions = (s) => chrome.storage.local.set({ leetlog_sessions: s });

async function nwGetMetaCache() {
  const o = await chrome.storage.local.get("leetlog_meta");
  return o.leetlog_meta || {};
}

const nwSaveMetaCache = (m) => chrome.storage.local.set({ leetlog_meta: m });

// ---------------- 文件 IO ----------------

async function nwRead(dir, name) {
  try {
    const fh = await dir.getFileHandle(name);
    return await (await fh.getFile()).text();
  } catch (_) {
    return null; // 不存在
  }
}

async function nwWrite(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

// ---------------- 笔记组装（与两个桥接版逐行对应） ----------------

function nwTimerLine(s, S) {
  const parts = [S.start(nwHm(s.start))];
  if (s.first_submit) parts.push(S.firstSubmit(nwHm(s.first_submit), nwMins(s.start, s.first_submit)));
  if (s.first_ac) parts.push(S.ac(nwHm(s.first_ac), s.submits, s.acs));
  else if (s.submits) parts.push(S.submitted(s.submits));
  else if (!s.closed) parts.push(S.inProgress);
  if (s.runs) parts.push(S.runs(s.runs));
  if (s.closed) parts.push(S.stay(nwMins(s.start, s.last_seen)));
  return parts.join(" ");
}

function nwRewriteTimerLine(text, sess, S) {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("⏱")) { lines[i] = nwTimerLine(sess, S); break; }
  }
  return lines.join("\n");
}

// 讲解视频搜索链接（放折叠 callout 之外保证可见；cn 题加 Bilibili）
function nwVideoLine(text, site, S) {
  const m = text.match(/^# (.+)$/m);
  const q = encodeURIComponent(`leetcode ${m ? m[1].trim() : ""}`.trim());
  const links = [`[YouTube](https://www.youtube.com/results?search_query=${q})`];
  if (site === "cn") links.push(`[Bilibili](https://search.bilibili.com/all?keyword=${q})`);
  return `${S.videos}: ${links.join(" · ")}`;
}

// 题面 callout 块结束处（块后第一个非引用行行首）
function nwStatementBlockEnd(text) {
  const i = text.indexOf("[!abstract]-");
  if (i === -1) return -1;
  let pos = text.indexOf("\n", i);
  while (pos !== -1) {
    const nxt = text.indexOf("\n", pos + 1);
    const line = text.slice(pos + 1, nxt === -1 ? text.length : nxt);
    if (!line.startsWith(">")) return pos + 1;
    pos = nxt;
  }
  return text.length;
}

function nwInsertStatement(text, md, S, site) {
  if (text.includes("[!abstract]-")) {
    // 旧笔记回填：有题面但还没有视频链接行
    if (!text.includes("youtube.com/results")) {
      const end = nwStatementBlockEnd(text);
      if (end !== -1) return text.slice(0, end) + "\n" + nwVideoLine(text, site, S) + "\n" + text.slice(end);
    }
    return text;
  }
  const quoted = md.split("\n").map((l) => ("> " + l).trimEnd()).join("\n");
  const block = `\n> [!abstract]- ${S.stmt}\n${quoted}\n\n${nwVideoLine(text, site, S)}\n`;
  const i = text.indexOf("\n## ");
  if (i === -1) return text + block;
  return text.slice(0, i) + block + text.slice(i);
}

function nwInsertCodeBlock(text, ev, ts, S) {
  const lang = (ev.lang || "").trim();
  const mdLang = NW_LANG_MD[lang.toLowerCase()] || (lang.toLowerCase() || "text");
  const perf = [ev.runtime, ev.memory].filter(Boolean).join(" · ");
  const header = S.codeHeader(lang || "?", nwHm(ts), perf);
  const fenced = ["```" + mdLang, ...(ev.code || "").trimEnd().split("\n"), "```"];
  const inner = fenced.map((l) => ("> " + l).trimEnd()).join("\n");
  const block = `\n${header}\n> [!success]- ${S.codeFold}\n${inner}\n`;
  const idx = text.lastIndexOf("⏱");
  const lineEnd = text.indexOf("\n", idx);
  if (idx === -1 || lineEnd === -1) return text + block;
  return text.slice(0, lineEnd + 1) + block + text.slice(lineEnd + 1);
}

function nwNewNote(p, ts, S) {
  return [
    "---",
    `id: ${p.id}`,
    `title: "${p.title}"`,
    `url: ${p.url}`,
    `difficulty: ${p.difficulty}`,
    `tags: [${p.tags.join(", ")}]`,
    "attempts: 0",
    `first_attempt: ${nwYmd(ts)}`,
    `last_attempt: ${nwYmd(ts)}`,
    "total_submissions: 0",
    "total_ac: 0",
    "total_runs: 0",
    "---",
    "",
    `# ${p.id}. ${p.title}`,
    "",
    `> ${p.difficulty} · ${p.tags.join(" / ") || "—"} · [${S.link}](${p.url})`,
    "",
  ].join("\n");
}

const nwNoteFile = (id, slug) => `${String(id).padStart(4, "0")}-${slug}.md`;

// ---------------- 会话 / 事件处理 ----------------

async function nwCloseSession(dir, sessions, slug, ts, S) {
  const sess = sessions[slug];
  if (!sess || sess.closed) return;
  if (ts - sess.last_seen < NW_SESSION_GAP) sess.last_seen = Math.max(sess.last_seen, ts);
  sess.closed = true;
  const text = await nwRead(dir, sess.file);
  if (text !== null) await nwWrite(dir, sess.file, nwRewriteTimerLine(text, sess, S));
}

async function nwEnsureAttempt(dir, sessions, slug, ts, S) {
  const existing = sessions[slug];
  if (existing && ts - existing.last_seen < NW_SESSION_GAP && (await nwRead(dir, existing.file)) !== null) {
    existing.last_seen = ts;
    existing.closed = false; // 离开后又回来：同一次做题继续累计
    return existing;
  }

  const meta = (await nwGetMetaCache())[slug] || {
    id: 0, title: slug, difficulty: "?", tags: [],
    url: `https://leetcode.com/problems/${slug}/description/`,
  };
  const file = nwNoteFile(meta.id, slug);
  let text = await nwRead(dir, file);
  let n = 1;
  if (text !== null) {
    n = parseInt(nwFmGet(text, "attempts") || "0", 10) + 1;
  } else {
    text = nwNewNote(meta, ts, S);
  }
  text = nwFmSet(text, "attempts", n);
  text = nwFmSet(text, "last_attempt", nwYmd(ts));

  const sess = {
    start: ts, last_seen: ts, submits: 0, acs: 0, runs: 0,
    first_submit: null, first_ac: null, closed: false, file, n,
  };
  const d = new Date(ts * 1000);
  text += `\n\n## ${S.attempt(n)} · ${nwYmd(ts)} ${S.weekdays[d.getDay()]}\n${nwTimerLine(sess, S)}\n\n${S.sections}`;
  await nwWrite(dir, file, text);
  sessions[slug] = sess;
  return sess;
}

// meta 迟到时的补救：把占位笔记（0000-slug.md，元数据缺失）迁移成正式命名和题头
async function nwMigratePlaceholder(dir, sessions, slug, meta) {
  const sess = sessions[slug];
  if (!sess || !meta || !meta.id || !sess.file.startsWith("0000-")) return false;
  let text = await nwRead(dir, sess.file);
  if (text === null) return false;
  text = nwFmSet(text, "id", meta.id);
  text = nwFmSet(text, "title", `"${meta.title}"`);
  text = nwFmSet(text, "difficulty", meta.difficulty);
  text = nwFmSet(text, "tags", `[${meta.tags.join(", ")}]`);
  text = text.replace(`# 0. ${slug}`, `# ${meta.id}. ${meta.title}`);
  text = text.replace(/^> \? · — · /m, `> ${meta.difficulty} · ${meta.tags.join(" / ") || "—"} · `);
  const newFile = nwNoteFile(meta.id, slug);
  await nwWrite(dir, newFile, text);
  try { await dir.removeEntry(sess.file); } catch (_) {}
  sess.file = newFile;
  return true;
}

// 主入口。retryable 错误（未选文件夹 / 授权失效）会抛出，由离线队列保留重试；
// 其余情况正常返回（事件视为已处理）。
async function nwHandleEvent(ev, lang) {
  const dir = await nwGetDir();
  if (!dir) { const e = new Error("folder-unset"); e.retryable = true; throw e; }
  if ((await dir.queryPermission({ mode: "readwrite" })) !== "granted") {
    const e = new Error("folder-permission"); e.retryable = true; throw e;
  }

  const S = NW_STRINGS[lang] || NW_STRINGS.zh;
  const slug = ev.slug;
  const ts = Math.floor(ev.ts || Date.now() / 1000);
  if (!slug) return;

  if (ev.type === "meta" && ev.id !== undefined) {
    const cache = await nwGetMetaCache();
    cache[slug] = { id: ev.id, title: ev.title, difficulty: ev.difficulty, tags: ev.tags || [], url: ev.url };
    await nwSaveMetaCache(cache);
    const sessions = await nwGetSessions();
    if (await nwMigratePlaceholder(dir, sessions, slug, cache[slug])) await nwSaveSessions(sessions);
    return;
  }

  if (!["start", "result", "leave", "run", "statement"].includes(ev.type)) return; // 未知类型静默忽略

  const sessions = await nwGetSessions();

  if (ev.type === "leave") {
    await nwCloseSession(dir, sessions, slug, ts, S);
    await nwSaveSessions(sessions);
    return;
  }

  // statement 只补写已存在的笔记（题面 callout / 视频链接回填）——
  // 0.6.6 起页面加载即触发，没做过的题绝不因此建笔记、开会话
  if (ev.type === "statement") {
    const md = (ev.md || "").trim();
    if (!md) return;
    const meta = (await nwGetMetaCache())[slug];
    const file = (sessions[slug] && sessions[slug].file) ||
                 (meta && meta.id ? nwNoteFile(meta.id, slug) : null);
    if (!file) return;
    const text0 = await nwRead(dir, file);
    if (text0 === null) return;
    const updated = nwInsertStatement(text0, md, S, ev.site || "com");
    if (updated !== text0) await nwWrite(dir, file, updated);
    return;
  }

  if (ev.type === "start") {
    for (const other of Object.keys(sessions)) {
      if (other !== slug) await nwCloseSession(dir, sessions, other, ts, S);
    }
  }

  const sess = await nwEnsureAttempt(dir, sessions, slug, ts, S);
  let text = await nwRead(dir, sess.file);
  if (text === null) { await nwSaveSessions(sessions); return; }

  if (ev.type === "run") {
    sess.runs = (sess.runs || 0) + 1;
    text = nwFmSet(text, "total_runs", parseInt(nwFmGet(text, "total_runs") || "0", 10) + 1);
  }

  if (ev.type === "result") {
    sess.submits += 1;
    if (!sess.first_submit) sess.first_submit = ts;
    if (ev.status === "Accepted") {
      sess.acs += 1;
      if (!sess.first_ac) sess.first_ac = ts;
      if (ev.code) text = nwInsertCodeBlock(text, ev, ts, S);
      text = nwFmSet(text, "total_ac", parseInt(nwFmGet(text, "total_ac") || "0", 10) + 1);
    }
    text = nwFmSet(text, "total_submissions", parseInt(nwFmGet(text, "total_submissions") || "0", 10) + 1);
  }

  text = nwRewriteTimerLine(text, sess, S);
  await nwWrite(dir, sess.file, text);
  sess.last_seen = ts;
  await nwSaveSessions(sessions);
}
