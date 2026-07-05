"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => LeetLogBridge
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var http = window.require("http");
var DEFAULTS = {
  settings: { port: 8763, folder: "LeetCode", lang: "zh" },
  state: {}
};
var SESSION_GAP = 6 * 3600;
var STRINGS = {
  zh: {
    weekdays: ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"],
    attempt: (n) => `\u7B2C ${n} \u6B21`,
    start: (t) => `\u23F1 \u5F00\u59CB ${t}`,
    firstSubmit: (t, m) => `\u2192 \u9996\u63D0 ${t} \xB7 \u7F16\u7801 ${m} \u5206\u949F`,
    ac: (t, s, a) => `\u2192 AC ${t} \xB7 \u63D0\u4EA4 ${s} \u6B21 / \u901A\u8FC7 ${a} \u6B21`,
    submitted: (s) => `\xB7 \u5DF2\u63D0\u4EA4 ${s} \u6B21\uFF08\u672A AC\uFF09`,
    inProgress: "\u2192 \uFF08\u8FDB\u884C\u4E2D\uFF09",
    runs: (r) => `\xB7 \u8FD0\u884C ${r} \u6B21`,
    stay: (m) => `\xB7 \u672C\u9898\u505C\u7559 ${m} \u5206\u949F`,
    stmt: "\u9898\u9762",
    codeHeader: (lang, t, perf) => `### \u2705 \u901A\u8FC7\u4EE3\u7801 \xB7 ${lang} \xB7 ${t}` + (perf ? `\uFF08${perf}\uFF09` : ""),
    sections: "### \u{1F4AD} \u601D\u8DEF & \u611F\u609F\n-\n\n### \u{1F4DA} \u5B66\u5230\u4E86\u4EC0\u4E48\uFF08\u65B0\u51FD\u6570 / \u65B0\u6570\u636E\u7ED3\u6784 / \u65B0\u5957\u8DEF\uFF09\n-\n\n### \u{1F500} \u591A\u79CD\u89E3\u6CD5\n-\n",
    link: "\u9898\u76EE\u94FE\u63A5",
    nNew: (id, title) => `\u{1F195} ${id}. ${title} \u2014 \u5EFA\u7ACB\u7B14\u8BB0`,
    nAgain: (id, title, n, last) => `\u{1F4D6} ${id}. ${title} \u2014 \u7B2C ${n} \u6B21\uFF08\u4E0A\u6B21 ${last ?? "?"}\uFF09`,
    nAccepted: (slug, m) => `\u2705 ${slug} Accepted\uFF01\u7F16\u7801 ${m} \u5206\u949F \u2192 \u5DF2\u5B58\u5165\u7B14\u8BB0`
  },
  en: {
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    attempt: (n) => `Attempt ${n}`,
    start: (t) => `\u23F1 start ${t}`,
    firstSubmit: (t, m) => `\u2192 first submit ${t} \xB7 coding ${m} min`,
    ac: (t, s, a) => `\u2192 AC ${t} \xB7 ${s} submit${s > 1 ? "s" : ""} / ${a} AC`,
    submitted: (s) => `\xB7 ${s} submitted (no AC yet)`,
    inProgress: "\u2192 (in progress)",
    runs: (r) => `\xB7 ${r} run${r !== 1 ? "s" : ""}`,
    stay: (m) => `\xB7 ${m} min on problem`,
    stmt: "Problem",
    codeHeader: (lang, t, perf) => `### \u2705 Accepted \xB7 ${lang} \xB7 ${t}` + (perf ? ` (${perf})` : ""),
    sections: "### \u{1F4AD} Thoughts & insights\n-\n\n### \u{1F4DA} What I learned (new functions / data structures / patterns)\n-\n\n### \u{1F500} Alternative solutions\n-\n",
    link: "Problem link",
    nNew: (id, title) => `\u{1F195} ${id}. ${title} \u2014 note created`,
    nAgain: (id, title, n, last) => `\u{1F4D6} ${id}. ${title} \u2014 attempt ${n} (last: ${last ?? "?"})`,
    nAccepted: (slug, m) => `\u2705 ${slug} Accepted! coding ${m} min \u2192 saved to note`
  }
};
var LANG_MD = {
  python3: "python",
  python: "python",
  cpp: "cpp",
  "c++": "cpp",
  java: "java",
  javascript: "javascript",
  typescript: "typescript",
  golang: "go",
  go: "go",
  rust: "rust",
  c: "c",
  csharp: "csharp",
  "c#": "csharp",
  kotlin: "kotlin",
  swift: "swift",
  ruby: "ruby",
  scala: "scala",
  mysql: "sql",
  sql: "sql"
};
var pad2 = (n) => String(n).padStart(2, "0");
var hm = (ts) => {
  const d = new Date(ts * 1e3);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
var ymd = (ts) => {
  const d = new Date(ts * 1e3);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
var mins = (a, b) => Math.max(1, Math.round((b - a) / 60));
function fmGet(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return m ? m[1].trim() : null;
}
function fmSet(text, key, value) {
  if (new RegExp(`^${key}:`, "m").test(text)) {
    return text.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`);
  }
  return text.replace("---\n", `---
${key}: ${value}
`);
}
var LeetLogBridge = class extends import_obsidian.Plugin {
  data = DEFAULTS;
  server = null;
  busy = Promise.resolve();
  // 事件串行化（等价 Python 版的锁）
  async onload() {
    const saved = await this.loadData();
    this.data = Object.assign({}, DEFAULTS, saved ?? {});
    this.data.settings = Object.assign({}, DEFAULTS.settings, saved?.settings ?? {});
    this.addSettingTab(new LeetLogSettingTab(this.app, this));
    this.startServer();
  }
  onunload() {
    this.server?.close();
    this.server = null;
  }
  startServer() {
    this.server?.close();
    const port = this.data.settings.port;
    this.server = http.createServer((req, res) => this.route(req, res));
    this.server.on("error", (e) => {
      if (e.code === "EADDRINUSE") {
        new import_obsidian.Notice(`LeetLog Bridge\uFF1A\u7AEF\u53E3 ${port} \u88AB\u5360\u7528\uFF08\u662F\u4E0D\u662F Python \u7248\u670D\u52A1\u8FD8\u5F00\u7740\uFF1F\uFF09`, 8e3);
      } else {
        new import_obsidian.Notice(`LeetLog Bridge \u542F\u52A8\u5931\u8D25\uFF1A${e.message}`, 8e3);
      }
      this.server = null;
    });
    this.server.listen(port, "127.0.0.1", () => {
      console.log(`[LeetLog Bridge] listening on 127.0.0.1:${port}`);
    });
  }
  // ---------- HTTP ----------
  cors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  }
  json(res, code, obj) {
    this.cors(res);
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  }
  route(req, res) {
    if (req.method === "OPTIONS") {
      this.cors(res);
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/ping") {
      const now = Date.now() / 1e3;
      const active = Object.entries(this.data.state).filter(([, s]) => !s.closed && now - s.last_seen < SESSION_GAP).map(([slug]) => slug);
      const af = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(this.data.settings.folder));
      const folder = af instanceof import_obsidian.TFolder ? af : null;
      const notes = folder ? folder.children.filter((f) => f instanceof import_obsidian.TFile && /^\d/.test(f.name)).length : 0;
      this.json(res, 200, {
        ok: true,
        bridge: "obsidian-plugin",
        version: this.manifest.version,
        vault: this.app.vault.getName(),
        folder: this.data.settings.folder,
        active,
        notes
      });
      return;
    }
    if (req.method === "POST" && req.url === "/event") {
      let body = "";
      req.on("data", (c) => body += String(c));
      req.on("end", () => {
        this.busy = this.busy.then(async () => {
          try {
            const parsed = JSON.parse(body);
            const ev = parsed;
            await this.handleEvent(ev);
            this.json(res, 200, { ok: true });
          } catch (e) {
            console.error("[LeetLog Bridge]", e);
            this.json(res, 500, { ok: false, error: String(e) });
          }
        });
      });
      return;
    }
    this.json(res, 404, { ok: false });
  }
  // ---------- 事件处理（与 Python 版逻辑一一对应） ----------
  async handleEvent(ev) {
    const slug = ev.slug;
    const ts = Math.floor(ev.ts ?? Date.now() / 1e3);
    if (!slug) throw new Error("bad event");
    if (!["start", "result", "leave", "run", "statement"].includes(ev.type)) return;
    if (ev.type === "leave") {
      await this.closeSession(slug, ts, "\u5173\u95ED/\u79BB\u5F00\u9875\u9762");
      await this.saveData(this.data);
      return;
    }
    if (ev.type === "start") {
      for (const other of Object.keys(this.data.state)) {
        if (other !== slug) await this.closeSession(other, ts, `\u5207\u6362\u5230 ${slug}`);
      }
    }
    const sess = await this.ensureAttempt(slug, ts);
    let text = await this.readNote(sess.path);
    if (ev.type === "statement" && ev.md?.trim()) {
      text = this.insertStatement(text, ev.md.trim());
    }
    if (ev.type === "run") {
      sess.runs = (sess.runs ?? 0) + 1;
      text = fmSet(text, "total_runs", parseInt(fmGet(text, "total_runs") ?? "0") + 1);
    }
    if (ev.type === "result") {
      sess.submits += 1;
      if (!sess.first_submit) sess.first_submit = ts;
      if (ev.status === "Accepted") {
        sess.acs += 1;
        if (!sess.first_ac) sess.first_ac = ts;
        if (ev.code) text = this.insertCodeBlock(text, ev, ts);
        text = fmSet(text, "total_ac", parseInt(fmGet(text, "total_ac") ?? "0") + 1);
        new import_obsidian.Notice(this.S.nAccepted(slug, mins(sess.start, sess.first_submit)));
      }
      text = fmSet(text, "total_submissions", parseInt(fmGet(text, "total_submissions") ?? "0") + 1);
    }
    text = this.rewriteTimerLine(text, sess);
    await this.writeNote(sess.path, text);
    sess.last_seen = ts;
    await this.saveData(this.data);
  }
  get S() {
    return STRINGS[this.data.settings.lang] ?? STRINGS.zh;
  }
  timerLine(s) {
    const S = this.S;
    const parts = [S.start(hm(s.start))];
    if (s.first_submit) parts.push(S.firstSubmit(hm(s.first_submit), mins(s.start, s.first_submit)));
    if (s.first_ac) parts.push(S.ac(hm(s.first_ac), s.submits, s.acs));
    else if (s.submits) parts.push(S.submitted(s.submits));
    else if (!s.closed) parts.push(S.inProgress);
    if (s.runs) parts.push(S.runs(s.runs));
    if (s.closed) parts.push(S.stay(mins(s.start, s.last_seen)));
    return parts.join(" ");
  }
  rewriteTimerLine(text, sess) {
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith("\u23F1")) {
        lines[i] = this.timerLine(sess);
        break;
      }
    }
    return lines.join("\n");
  }
  // 题面作为默认折叠的 callout 插到题头之后、第一段做题记录之前。
  // 幂等判断用题面 callout 本身（[!abstract]-），不写额外标记进笔记
  insertStatement(text, md) {
    text = text.replace("<!--leetlog:statement-->\n", "");
    if (text.includes("[!abstract]-")) return text;
    const quoted = md.split("\n").map((l) => ("> " + l).trimEnd()).join("\n");
    const block = `
> [!abstract]- ${this.S.stmt}
${quoted}
`;
    const i = text.indexOf("\n## ");
    if (i === -1) return text + block;
    return text.slice(0, i) + block + text.slice(i);
  }
  // AC 代码：三级标题 + 原生代码块
  insertCodeBlock(text, ev, ts) {
    const lang = (ev.lang ?? "").trim();
    const mdLang = LANG_MD[lang.toLowerCase()] ?? (lang.toLowerCase() || "text");
    const perf = [ev.runtime, ev.memory].filter(Boolean).join(" \xB7 ");
    const header = this.S.codeHeader(lang || "?", hm(ts), perf);
    const block = `
${header}
\`\`\`${mdLang}
${(ev.code ?? "").trimEnd()}
\`\`\`
`;
    const idx = text.lastIndexOf("\u23F1");
    const lineEnd = text.indexOf("\n", idx);
    if (idx === -1 || lineEnd === -1) return text + block;
    return text.slice(0, lineEnd + 1) + block + text.slice(lineEnd + 1);
  }
  async closeSession(slug, ts, reason) {
    const sess = this.data.state[slug];
    if (!sess || sess.closed) return;
    if (ts - sess.last_seen < SESSION_GAP) sess.last_seen = Math.max(sess.last_seen, ts);
    sess.closed = true;
    try {
      const text = await this.readNote(sess.path);
      await this.writeNote(sess.path, this.rewriteTimerLine(text, sess));
      console.log(`[LeetLog Bridge] ${slug} \u4F1A\u8BDD\u7ED3\u675F\uFF08${reason}\uFF09\xB7 \u505C\u7559 ${mins(sess.start, sess.last_seen)} \u5206\u949F`);
    } catch (e) {
      console.error(`[LeetLog Bridge] \u7ED3\u7B97 ${slug} \u5931\u8D25`, e);
    }
  }
  async ensureAttempt(slug, ts) {
    const existing = this.data.state[slug];
    if (existing && ts - existing.last_seen < SESSION_GAP && this.noteFile(existing.path)) {
      existing.last_seen = ts;
      existing.closed = false;
      return existing;
    }
    const prob = await this.resolveProblem(slug);
    const path = (0, import_obsidian.normalizePath)(`${this.data.settings.folder}/${String(prob.id).padStart(4, "0")}-${slug}.md`);
    let n = 1;
    let text;
    const file = this.noteFile(path);
    if (file) {
      text = await this.app.vault.read(file);
      n = parseInt(fmGet(text, "attempts") ?? "0") + 1;
      new import_obsidian.Notice(this.S.nAgain(prob.id, prob.title, n, fmGet(text, "last_attempt")));
    } else {
      text = this.newNote(prob, ts);
      new import_obsidian.Notice(this.S.nNew(prob.id, prob.title));
    }
    text = fmSet(text, "attempts", n);
    text = fmSet(text, "last_attempt", ymd(ts));
    const sess = {
      start: ts,
      last_seen: ts,
      submits: 0,
      acs: 0,
      runs: 0,
      first_submit: null,
      first_ac: null,
      closed: false,
      path,
      n
    };
    const d = new Date(ts * 1e3);
    text += `

## ${this.S.attempt(n)} \xB7 ${ymd(ts)} ${this.S.weekdays[d.getDay()]}
${this.timerLine(sess)}

${this.S.sections}`;
    await this.writeNote(path, text);
    this.data.state[slug] = sess;
    return sess;
  }
  newNote(p, ts) {
    return [
      "---",
      `id: ${p.id}`,
      `title: "${p.title}"`,
      `url: ${p.url}`,
      `difficulty: ${p.difficulty}`,
      `tags: [${p.tags.join(", ")}]`,
      "attempts: 0",
      `first_attempt: ${ymd(ts)}`,
      `last_attempt: ${ymd(ts)}`,
      "total_submissions: 0",
      "total_ac: 0",
      "total_runs: 0",
      "---",
      "",
      `# ${p.id}. ${p.title}`,
      "",
      `> ${p.difficulty} \xB7 ${p.tags.join(" / ") || "\u2014"} \xB7 [${this.S.link}](${p.url})`,
      ""
    ].join("\n");
  }
  async resolveProblem(slug) {
    const url = `https://leetcode.com/problems/${slug}/description/`;
    try {
      const resp = await (0, import_obsidian.requestUrl)({
        url: "https://leetcode.com/graphql",
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          query: "query($s:String!){question(titleSlug:$s){questionFrontendId title difficulty topicTags{name}}}",
          variables: { s: slug }
        })
      });
      const q = resp.json?.data?.question;
      if (q) {
        return {
          id: parseInt(q.questionFrontendId),
          title: q.title,
          difficulty: q.difficulty,
          tags: (q.topicTags ?? []).map((t) => t.name),
          url
        };
      }
    } catch (e) {
      console.warn("[LeetLog Bridge] \u9898\u76EE\u5143\u6570\u636E\u83B7\u53D6\u5931\u8D25\uFF0C\u4F7F\u7528\u964D\u7EA7\u4FE1\u606F", e);
    }
    return { id: 0, title: slug, difficulty: "?", tags: [], url };
  }
  // ---------- Vault 读写 ----------
  noteFile(path) {
    const f = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(path));
    return f instanceof import_obsidian.TFile ? f : null;
  }
  async readNote(path) {
    const f = this.noteFile(path);
    if (!f) throw new Error(`\u7B14\u8BB0\u4E0D\u5B58\u5728\uFF1A${path}`);
    return this.app.vault.read(f);
  }
  async writeNote(path, text) {
    const norm = (0, import_obsidian.normalizePath)(path);
    const dir = norm.split("/").slice(0, -1).join("/");
    if (dir && !(this.app.vault.getAbstractFileByPath(dir) instanceof import_obsidian.TFolder)) {
      await this.app.vault.createFolder(dir).catch(() => {
      });
    }
    const f = this.noteFile(norm);
    if (f) await this.app.vault.modify(f, text);
    else await this.app.vault.create(norm, text);
  }
};
var LeetLogSettingTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("\u76D1\u542C\u7AEF\u53E3").setDesc("\u9700\u4E0E\u6D4F\u89C8\u5668\u6269\u5C55\u4E00\u81F4\uFF08\u9ED8\u8BA4 8763\uFF09\u3002\u6CE8\u610F\u4E0D\u8981\u548C Python \u7248\u6865\u63A5\u670D\u52A1\u540C\u65F6\u8FD0\u884C\u3002").addText(
      (t) => t.setValue(String(this.plugin.data.settings.port)).onChange(async (v) => {
        const port = parseInt(v);
        if (port > 0 && port < 65536) {
          this.plugin.data.settings.port = port;
          await this.plugin.saveData(this.plugin.data);
          this.plugin.startServer();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u7B14\u8BB0\u6587\u4EF6\u5939").setDesc("\u5237\u9898\u7B14\u8BB0\u5B58\u653E\u7684 vault \u5185\u8DEF\u5F84").addText(
      (t) => t.setValue(this.plugin.data.settings.folder).onChange(async (v) => {
        this.plugin.data.settings.folder = v.trim() || "LeetCode";
        await this.plugin.saveData(this.plugin.data);
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u7B14\u8BB0\u8BED\u8A00 / Note language").setDesc("\u751F\u6210\u7684\u7B14\u8BB0\u6A21\u677F\u8BED\u8A00\uFF08\u6807\u9898\u3001\u8BA1\u65F6\u884C\u3001\u611F\u609F\u5206\u533A\uFF09\u3002\u5DF2\u6709\u7B14\u8BB0\u4E0D\u53D7\u5F71\u54CD\uFF0C\u53EA\u4F5C\u7528\u4E8E\u4E4B\u540E\u7684\u65B0\u8BB0\u5F55\u3002").addDropdown(
      (dd) => dd.addOption("zh", "\u4E2D\u6587").addOption("en", "English").setValue(this.plugin.data.settings.lang).onChange(async (v) => {
        this.plugin.data.settings.lang = v === "en" ? "en" : "zh";
        await this.plugin.saveData(this.plugin.data);
      })
    );
  }
};
