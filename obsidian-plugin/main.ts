/**
 * LeetLog Bridge — Obsidian 插件版桥接服务
 * 在 Obsidian 内监听 127.0.0.1:<port>，接收 LeetLog 浏览器扩展的事件，
 * 通过 Obsidian Vault API 写刷题笔记。与 Python 版 leetlog_server.py 接口完全一致。
 */
import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, normalizePath, requestUrl } from "obsidian";

// Obsidian 桌面端（Electron 渲染进程）通过 require 提供 Node 的 http 模块。
// 这里用最小化的自持类型声明，避免依赖 @types/node（社区审查的 lint 环境没有它）。
interface HttpIncomingMessage {
  method?: string;
  url?: string;
  on(event: "data", cb: (chunk: unknown) => void): void;
  on(event: "end", cb: () => void): void;
}
interface HttpServerResponse {
  setHeader(name: string, value: string): void;
  writeHead(code: number, headers?: Record<string, string>): void;
  end(body?: string): void;
}
interface HttpServer {
  close(): void;
  on(event: "error", cb: (e: { code?: string; message: string }) => void): void;
  listen(port: number, host: string, cb?: () => void): void;
}
interface HttpModule {
  createServer(handler: (req: HttpIncomingMessage, res: HttpServerResponse) => void): HttpServer;
}
const http = (window as unknown as { require: (m: string) => unknown }).require("http") as HttpModule;

// ---------------- 类型 ----------------

interface Session {
  start: number;
  last_seen: number;
  submits: number;
  acs: number;
  runs?: number;   // 旧版本持久化的会话没有该字段
  first_submit: number | null;
  first_ac: number | null;
  closed: boolean;
  path: string;
  n: number;
}

interface LeetLogSettings {
  port: number;
  folder: string;
  lang: "zh" | "en";   // 笔记模板语言 / note template language
}

interface PersistedData {
  settings: LeetLogSettings;
  state: Record<string, Session>;
}

interface LeetLogEvent {
  type: "start" | "result" | "leave" | "run" | "statement";
  slug: string;
  ts?: number;
  status?: string;
  lang?: string;
  code?: string;
  runtime?: string;
  memory?: string;
  md?: string;     // statement 事件：扩展端已转好的题面 Markdown
  site?: string;   // "com" | "cn"
}

interface ProblemMeta {
  id: number;
  title: string;
  difficulty: string;
  tags: string[];
  url: string;
}

const DEFAULTS: PersistedData = {
  settings: { port: 8763, folder: "LeetCode", lang: "zh" },
  state: {},
};

const SESSION_GAP = 6 * 3600; // 超过 6 小时视为新的一次做题

// 笔记模板双语字符串表
const STRINGS = {
  zh: {
    weekdays: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    attempt: (n: number) => `第 ${n} 次`,
    start: (t: string) => `⏱ 开始 ${t}`,
    firstSubmit: (t: string, m: number) => `→ 首提 ${t} · 编码 ${m} 分钟`,
    ac: (t: string, s: number, a: number) => `→ AC ${t} · 提交 ${s} 次 / 通过 ${a} 次`,
    submitted: (s: number) => `· 已提交 ${s} 次（未 AC）`,
    inProgress: "→ （进行中）",
    runs: (r: number) => `· 运行 ${r} 次`,
    stay: (m: number) => `· 本题停留 ${m} 分钟`,
    stmt: "题面",
    videos: "讲解视频",
    codeHeader: (lang: string, t: string, perf: string) =>
      `### ✅ 通过代码 · ${lang} · ${t}` + (perf ? `（${perf}）` : ""),
    codeFold: "代码",
    sections: "### 💭 思路 & 感悟\n-\n\n### 📚 学到了什么（新函数 / 新数据结构 / 新套路）\n-\n\n### 🔀 多种解法\n-\n",
    link: "题目链接",
    nNew: (id: number, title: string) => `🆕 ${id}. ${title} — 建立笔记`,
    nAgain: (id: number, title: string, n: number, last: string | null) =>
      `📖 ${id}. ${title} — 第 ${n} 次（上次 ${last ?? "?"}）`,
    nAccepted: (slug: string, m: number) => `✅ ${slug} Accepted！编码 ${m} 分钟 → 已存入笔记`,
  },
  en: {
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    attempt: (n: number) => `Attempt ${n}`,
    start: (t: string) => `⏱ start ${t}`,
    firstSubmit: (t: string, m: number) => `→ first submit ${t} · coding ${m} min`,
    ac: (t: string, s: number, a: number) => `→ AC ${t} · ${s} submit${s > 1 ? "s" : ""} / ${a} AC`,
    submitted: (s: number) => `· ${s} submitted (no AC yet)`,
    inProgress: "→ (in progress)",
    runs: (r: number) => `· ${r} run${r !== 1 ? "s" : ""}`,
    stay: (m: number) => `· ${m} min on problem`,
    stmt: "Problem",
    videos: "Video solutions",
    codeHeader: (lang: string, t: string, perf: string) =>
      `### ✅ Accepted · ${lang} · ${t}` + (perf ? ` (${perf})` : ""),
    codeFold: "Code",
    sections: "### 💭 Thoughts & insights\n-\n\n### 📚 What I learned (new functions / data structures / patterns)\n-\n\n### 🔀 Alternative solutions\n-\n",
    link: "Problem link",
    nNew: (id: number, title: string) => `🆕 ${id}. ${title} — note created`,
    nAgain: (id: number, title: string, n: number, last: string | null) =>
      `📖 ${id}. ${title} — attempt ${n} (last: ${last ?? "?"})`,
    nAccepted: (slug: string, m: number) => `✅ ${slug} Accepted! coding ${m} min → saved to note`,
  },
} as const;
const LANG_MD: Record<string, string> = {
  python3: "python", python: "python", cpp: "cpp", "c++": "cpp", java: "java",
  javascript: "javascript", typescript: "typescript", golang: "go", go: "go",
  rust: "rust", c: "c", csharp: "csharp", "c#": "csharp", kotlin: "kotlin",
  swift: "swift", ruby: "ruby", scala: "scala", mysql: "sql", sql: "sql",
};

// ---------------- 小工具 ----------------

const pad2 = (n: number) => String(n).padStart(2, "0");
const hm = (ts: number) => { const d = new Date(ts * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const ymd = (ts: number) => { const d = new Date(ts * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const mins = (a: number, b: number) => Math.max(1, Math.round((b - a) / 60));

function fmGet(text: string, key: string): string | null {
  const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

function fmSet(text: string, key: string, value: string | number): string {
  if (new RegExp(`^${key}:`, "m").test(text)) {
    return text.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`);
  }
  return text.replace("---\n", `---\n${key}: ${value}\n`);
}

// ---------------- 插件主体 ----------------

export default class LeetLogBridge extends Plugin {
  data: PersistedData = DEFAULTS;
  server: HttpServer | null = null;
  private busy: Promise<void> = Promise.resolve(); // 事件串行化（等价 Python 版的锁）

  async onload() {
    const saved = (await this.loadData()) as Partial<PersistedData> | null;
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
    this.server.on("error", (e: { code?: string; message: string }) => {
      if (e.code === "EADDRINUSE") {
        new Notice(`LeetLog Bridge：端口 ${port} 被占用（是不是 Python 版服务还开着？）`, 8000);
      } else {
        new Notice(`LeetLog Bridge 启动失败：${e.message}`, 8000);
      }
      this.server = null;
    });
    this.server.listen(port, "127.0.0.1", () => {
      console.log(`[LeetLog Bridge] listening on 127.0.0.1:${port}`);
    });
  }

  // ---------- HTTP ----------

  private cors(res: HttpServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  }

  private json(res: HttpServerResponse, code: number, obj: unknown) {
    this.cors(res);
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  }

  private route(req: HttpIncomingMessage, res: HttpServerResponse) {
    if (req.method === "OPTIONS") { this.cors(res); res.writeHead(204); res.end(); return; }

    if (req.method === "GET" && req.url === "/ping") {
      const now = Date.now() / 1000;
      const active = Object.entries(this.data.state)
        .filter(([, s]) => !s.closed && now - s.last_seen < SESSION_GAP)
        .map(([slug]) => slug);
      // getAbstractFileByPath + instanceof：兼容老版本 Obsidian（getFolderByPath 是较新 API）
      const af = this.app.vault.getAbstractFileByPath(normalizePath(this.data.settings.folder));
      const folder = af instanceof TFolder ? af : null;
      const notes = folder ? folder.children.filter((f) => f instanceof TFile && /^\d/.test(f.name)).length : 0;
      this.json(res, 200, {
        ok: true, bridge: "obsidian-plugin", version: this.manifest.version,
        vault: this.app.vault.getName(), folder: this.data.settings.folder,
        active, notes,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/event") {
      let body = "";
      req.on("data", (c) => (body += String(c)));
      req.on("end", () => {
        // 串行处理，避免并发读写同一篇笔记
        this.busy = this.busy.then(async () => {
          try {
            const parsed: unknown = JSON.parse(body);
            const ev = parsed as LeetLogEvent;
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

  async handleEvent(ev: LeetLogEvent) {
    const slug = ev.slug;
    const ts = Math.floor(ev.ts ?? Date.now() / 1000);
    if (!slug) throw new Error("bad event");
    // 未知事件类型静默忽略（向前兼容：新版扩展先于插件更新时不至于 500 堵住扩展的离线队列）
    if (!["start", "result", "leave", "run", "statement"].includes(ev.type)) return;

    if (ev.type === "leave") {
      await this.closeSession(slug, ts, "关闭/离开页面");
      await this.saveData(this.data);
      return;
    }

    if (ev.type === "start") {
      for (const other of Object.keys(this.data.state)) {
        if (other !== slug) await this.closeSession(other, ts, `切换到 ${slug}`);
      }
    }

    const sess = await this.ensureAttempt(slug, ts);
    let text = await this.readNote(sess.path);

    if (ev.type === "statement" && ev.md?.trim()) {
      text = this.insertStatement(text, ev.md.trim(), ev.site || "com");
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
        new Notice(this.S.nAccepted(slug, mins(sess.start, sess.first_submit)));
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

  timerLine(s: Session): string {
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

  rewriteTimerLine(text: string, sess: Session): string {
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith("⏱")) { lines[i] = this.timerLine(sess); break; }
    }
    return lines.join("\n");
  }

  // 题面作为默认折叠的 callout 插到题头之后、第一段做题记录之前。
  // 幂等判断用题面 callout 本身（[!abstract]-），不写额外标记进笔记
  // 讲解视频搜索链接（放折叠 callout 之外保证可见；cn 题加 Bilibili）
  videoLine(text: string, site: string): string {
    const m = text.match(/^# (.+)$/m);
    const q = encodeURIComponent(`leetcode ${m ? m[1].trim() : ""}`.trim());
    const links = [`[YouTube](https://www.youtube.com/results?search_query=${q})`];
    if (site === "cn") links.push(`[Bilibili](https://search.bilibili.com/all?keyword=${q})`);
    return `${this.S.videos}: ${links.join(" · ")}`;
  }

  // 题面 callout 块结束处（块后第一个非引用行行首）
  statementBlockEnd(text: string): number {
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

  insertStatement(text: string, md: string, site: string): string {
    text = text.replace("<!--leetlog:statement-->\n", ""); // 清理旧版写入的 HTML 注释（实时预览会显示）
    if (text.includes("[!abstract]-")) {
      // 旧笔记回填：有题面但还没有视频链接行
      if (!text.includes("youtube.com/results")) {
        const end = this.statementBlockEnd(text);
        if (end !== -1) return text.slice(0, end) + "\n" + this.videoLine(text, site) + "\n" + text.slice(end);
      }
      return text;
    }
    const quoted = md.split("\n").map((l) => ("> " + l).trimEnd()).join("\n");
    const block = `\n> [!abstract]- ${this.S.stmt}\n${quoted}\n\n${this.videoLine(text, site)}\n`;
    const i = text.indexOf("\n## ");
    if (i === -1) return text + block;
    return text.slice(0, i) + block + text.slice(i);
  }

  // AC 代码：三级标题（保留在大纲）+ 默认折叠的 callout 包裹代码块
  insertCodeBlock(text: string, ev: LeetLogEvent, ts: number): string {
    const lang = (ev.lang ?? "").trim();
    const mdLang = LANG_MD[lang.toLowerCase()] ?? (lang.toLowerCase() || "text");
    const perf = [ev.runtime, ev.memory].filter(Boolean).join(" · ");
    const header = this.S.codeHeader(lang || "?", hm(ts), perf);
    const fenced = ["```" + mdLang, ...(ev.code ?? "").trimEnd().split("\n"), "```"];
    const inner = fenced.map((l) => ("> " + l).trimEnd()).join("\n");
    const block = `\n${header}\n> [!success]- ${this.S.codeFold}\n${inner}\n`;
    const idx = text.lastIndexOf("⏱");
    const lineEnd = text.indexOf("\n", idx);
    if (idx === -1 || lineEnd === -1) return text + block;
    return text.slice(0, lineEnd + 1) + block + text.slice(lineEnd + 1);
  }

  async closeSession(slug: string, ts: number, reason: string) {
    const sess = this.data.state[slug];
    if (!sess || sess.closed) return;
    if (ts - sess.last_seen < SESSION_GAP) sess.last_seen = Math.max(sess.last_seen, ts);
    sess.closed = true;
    try {
      const text = await this.readNote(sess.path);
      await this.writeNote(sess.path, this.rewriteTimerLine(text, sess));
      console.log(`[LeetLog Bridge] ${slug} 会话结束（${reason}）· 停留 ${mins(sess.start, sess.last_seen)} 分钟`);
    } catch (e) {
      console.error(`[LeetLog Bridge] 结算 ${slug} 失败`, e);
    }
  }

  async ensureAttempt(slug: string, ts: number): Promise<Session> {
    const existing = this.data.state[slug];
    if (existing && ts - existing.last_seen < SESSION_GAP && this.noteFile(existing.path)) {
      existing.last_seen = ts;
      existing.closed = false;
      return existing;
    }

    const prob = await this.resolveProblem(slug);
    const path = normalizePath(`${this.data.settings.folder}/${String(prob.id).padStart(4, "0")}-${slug}.md`);
    let n = 1;
    let text: string;
    const file = this.noteFile(path);
    if (file) {
      text = await this.app.vault.read(file);
      n = parseInt(fmGet(text, "attempts") ?? "0") + 1;
      new Notice(this.S.nAgain(prob.id, prob.title, n, fmGet(text, "last_attempt")));
    } else {
      text = this.newNote(prob, ts);
      new Notice(this.S.nNew(prob.id, prob.title));
    }
    text = fmSet(text, "attempts", n);
    text = fmSet(text, "last_attempt", ymd(ts));

    const sess: Session = {
      start: ts, last_seen: ts, submits: 0, acs: 0, runs: 0,
      first_submit: null, first_ac: null, closed: false, path, n,
    };
    const d = new Date(ts * 1000);
    text += `\n\n## ${this.S.attempt(n)} · ${ymd(ts)} ${this.S.weekdays[d.getDay()]}\n${this.timerLine(sess)}\n\n${this.S.sections}`;
    await this.writeNote(path, text);
    this.data.state[slug] = sess;
    return sess;
  }

  newNote(p: ProblemMeta, ts: number): string {
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
      `> ${p.difficulty} · ${p.tags.join(" / ") || "—"} · [${this.S.link}](${p.url})`,
      "",
    ].join("\n");
  }

  async resolveProblem(slug: string): Promise<ProblemMeta> {
    interface QuestionResp {
      data?: {
        question?: {
          questionFrontendId: string;
          title: string;
          difficulty: string;
          topicTags?: Array<{ name: string }>;
        };
      };
    }
    const url = `https://leetcode.com/problems/${slug}/description/`;
    try {
      const resp = await requestUrl({
        url: "https://leetcode.com/graphql",
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          query: "query($s:String!){question(titleSlug:$s){questionFrontendId title difficulty topicTags{name}}}",
          variables: { s: slug },
        }),
      });
      const q = (resp.json as QuestionResp | undefined)?.data?.question;
      if (q) {
        return {
          id: parseInt(q.questionFrontendId), title: q.title, difficulty: q.difficulty,
          tags: (q.topicTags ?? []).map((t) => t.name), url,
        };
      }
    } catch (e) {
      console.warn("[LeetLog Bridge] 题目元数据获取失败，使用降级信息", e);
    }
    return { id: 0, title: slug, difficulty: "?", tags: [], url };
  }

  // ---------- Vault 读写 ----------

  noteFile(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return f instanceof TFile ? f : null;
  }

  async readNote(path: string): Promise<string> {
    const f = this.noteFile(path);
    if (!f) throw new Error(`笔记不存在：${path}`);
    return this.app.vault.read(f);
  }

  async writeNote(path: string, text: string) {
    const norm = normalizePath(path);
    const dir = norm.split("/").slice(0, -1).join("/");
    if (dir && !(this.app.vault.getAbstractFileByPath(dir) instanceof TFolder)) {
      await this.app.vault.createFolder(dir).catch(() => {});
    }
    const f = this.noteFile(norm);
    if (f) await this.app.vault.modify(f, text);
    else await this.app.vault.create(norm, text);
  }
}

// ---------------- 设置页 ----------------

class LeetLogSettingTab extends PluginSettingTab {
  plugin: LeetLogBridge;

  constructor(app: App, plugin: LeetLogBridge) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("监听端口")
      .setDesc("需与浏览器扩展一致（默认 8763）。注意不要和 Python 版桥接服务同时运行。")
      .addText((t) =>
        t.setValue(String(this.plugin.data.settings.port)).onChange(async (v) => {
          const port = parseInt(v);
          if (port > 0 && port < 65536) {
            this.plugin.data.settings.port = port;
            await this.plugin.saveData(this.plugin.data);
            this.plugin.startServer();
          }
        })
      );

    new Setting(containerEl)
      .setName("笔记文件夹")
      .setDesc("刷题笔记存放的 vault 内路径")
      .addText((t) =>
        t.setValue(this.plugin.data.settings.folder).onChange(async (v) => {
          this.plugin.data.settings.folder = v.trim() || "LeetCode";
          await this.plugin.saveData(this.plugin.data);
        })
      );

    new Setting(containerEl)
      .setName("笔记语言 / Note language")
      .setDesc("生成的笔记模板语言（标题、计时行、感悟分区）。已有笔记不受影响，只作用于之后的新记录。")
      .addDropdown((dd) =>
        dd.addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.data.settings.lang)
          .onChange(async (v) => {
            this.plugin.data.settings.lang = (v === "en" ? "en" : "zh");
            await this.plugin.saveData(this.plugin.data);
          })
      );
  }
}
