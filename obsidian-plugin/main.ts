/**
 * LeetLog Bridge — Obsidian 插件版桥接服务
 * 在 Obsidian 内监听 127.0.0.1:<port>，接收 LeetLog 浏览器扩展的事件，
 * 通过 Obsidian Vault API 写刷题笔记。与 Python 版 leetlog_server.py 接口完全一致。
 */
import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath, requestUrl } from "obsidian";
import * as http from "http";

// ---------------- 类型 ----------------

interface Session {
  start: number;
  last_seen: number;
  submits: number;
  acs: number;
  first_submit: number | null;
  first_ac: number | null;
  closed: boolean;
  path: string;
  n: number;
}

interface LeetLogSettings {
  port: number;
  folder: string;
}

interface PersistedData {
  settings: LeetLogSettings;
  state: Record<string, Session>;
}

interface LeetLogEvent {
  type: "start" | "result" | "leave";
  slug: string;
  ts?: number;
  status?: string;
  lang?: string;
  code?: string;
  runtime?: string;
  memory?: string;
}

interface ProblemMeta {
  id: number;
  title: string;
  difficulty: string;
  tags: string[];
  url: string;
}

const DEFAULTS: PersistedData = {
  settings: { port: 8763, folder: "LeetCode" },
  state: {},
};

const SESSION_GAP = 6 * 3600; // 超过 6 小时视为新的一次做题
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
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
  server: http.Server | null = null;
  private busy: Promise<void> = Promise.resolve(); // 事件串行化（等价 Python 版的锁）

  async onload() {
    this.data = Object.assign({}, DEFAULTS, await this.loadData());
    this.data.settings = Object.assign({}, DEFAULTS.settings, this.data.settings);
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
    this.server.on("error", (e: NodeJS.ErrnoException) => {
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

  private cors(res: http.ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  }

  private json(res: http.ServerResponse, code: number, obj: unknown) {
    this.cors(res);
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  }

  private route(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method === "OPTIONS") { this.cors(res); res.writeHead(204); res.end(); return; }

    if (req.method === "GET" && req.url === "/ping") {
      const now = Date.now() / 1000;
      const active = Object.entries(this.data.state)
        .filter(([, s]) => !s.closed && now - s.last_seen < SESSION_GAP)
        .map(([slug]) => slug);
      const folder = this.app.vault.getFolderByPath(normalizePath(this.data.settings.folder));
      const notes = folder ? folder.children.filter((f) => f instanceof TFile && /^\d/.test(f.name)).length : 0;
      this.json(res, 200, {
        ok: true, bridge: "obsidian-plugin",
        vault: this.app.vault.getName(), folder: this.data.settings.folder,
        active, notes,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/event") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        // 串行处理，避免并发读写同一篇笔记
        this.busy = this.busy.then(async () => {
          try {
            const ev = JSON.parse(body) as LeetLogEvent;
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
    if (!slug || !["start", "result", "leave"].includes(ev.type)) throw new Error("bad event");

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

    if (ev.type === "result") {
      sess.submits += 1;
      if (!sess.first_submit) sess.first_submit = ts;
      if (ev.status === "Accepted") {
        sess.acs += 1;
        if (!sess.first_ac) sess.first_ac = ts;
        if (ev.code) text = this.insertCodeBlock(text, ev, ts);
        text = fmSet(text, "total_ac", parseInt(fmGet(text, "total_ac") ?? "0") + 1);
        new Notice(`✅ ${slug} Accepted！编码 ${mins(sess.start, sess.first_submit)} 分钟 → 已存入笔记`);
      }
      text = fmSet(text, "total_submissions", parseInt(fmGet(text, "total_submissions") ?? "0") + 1);
    }

    text = this.rewriteTimerLine(text, sess);
    await this.writeNote(sess.path, text);
    sess.last_seen = ts;
    await this.saveData(this.data);
  }

  timerLine(s: Session): string {
    const parts = [`⏱ 开始 ${hm(s.start)}`];
    if (s.first_submit) parts.push(`→ 首提 ${hm(s.first_submit)} · 编码 ${mins(s.start, s.first_submit)} 分钟`);
    if (s.first_ac) parts.push(`→ AC ${hm(s.first_ac)} · 提交 ${s.submits} 次 / 通过 ${s.acs} 次`);
    else if (s.submits) parts.push(`· 已提交 ${s.submits} 次（未 AC）`);
    else if (!s.closed) parts.push("→ （进行中）");
    if (s.closed) parts.push(`· 本题停留 ${mins(s.start, s.last_seen)} 分钟`);
    return parts.join(" ");
  }

  rewriteTimerLine(text: string, sess: Session): string {
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith("⏱")) { lines[i] = this.timerLine(sess); break; }
    }
    return lines.join("\n");
  }

  insertCodeBlock(text: string, ev: LeetLogEvent, ts: number): string {
    const lang = (ev.lang ?? "").trim();
    const mdLang = LANG_MD[lang.toLowerCase()] ?? (lang.toLowerCase() || "text");
    const perf = [ev.runtime, ev.memory].filter(Boolean).join(" · ");
    const header = `### ✅ 通过代码 · ${lang || "?"} · ${hm(ts)}` + (perf ? `（${perf}）` : "");
    const block = `\n${header}\n\`\`\`${mdLang}\n${(ev.code ?? "").trimEnd()}\n\`\`\`\n`;
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
      new Notice(`📖 ${prob.id}. ${prob.title} — 第 ${n} 次（上次 ${fmGet(text, "last_attempt")}）`);
    } else {
      text = this.newNote(prob, ts);
      new Notice(`🆕 ${prob.id}. ${prob.title} — 建立笔记`);
    }
    text = fmSet(text, "attempts", n);
    text = fmSet(text, "last_attempt", ymd(ts));

    const sess: Session = {
      start: ts, last_seen: ts, submits: 0, acs: 0,
      first_submit: null, first_ac: null, closed: false, path, n,
    };
    const d = new Date(ts * 1000);
    text += `\n\n## 第 ${n} 次 · ${ymd(ts)} ${WEEKDAYS[d.getDay()]}\n${this.timerLine(sess)}\n\n### 💭 思路 & 感悟\n-\n\n### 📚 学到了什么（新函数 / 新数据结构 / 新套路）\n-\n\n### 🔀 多种解法\n-\n`;
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
      "---",
      "",
      `# ${p.id}. ${p.title}`,
      "",
      `> ${p.difficulty} · ${p.tags.join(" / ") || "—"} · [题目链接](${p.url})`,
      "",
    ].join("\n");
  }

  async resolveProblem(slug: string): Promise<ProblemMeta> {
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
      const q = resp.json?.data?.question;
      if (q) {
        return {
          id: parseInt(q.questionFrontendId), title: q.title, difficulty: q.difficulty,
          tags: (q.topicTags ?? []).map((t: { name: string }) => t.name), url,
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
    if (dir && !this.app.vault.getFolderByPath(dir)) {
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
  }
}
