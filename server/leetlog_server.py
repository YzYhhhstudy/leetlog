#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LeetLog 本地桥接服务 — 接收浏览器扩展的事件，自动写 Obsidian 刷题笔记

  python3 leetlog_server.py            # 启动（默认端口 8763）

事件流：
  start   浏览器里敲下第一个键        → 建/续写笔记，开始计时
  result  每次提交出判题结果          → 计数；Accepted 时写入用时 + 通过代码

全部数据只在本机流动：LeetCode 页面 → 127.0.0.1 → 你的 Obsidian vault。
配置：~/.config/leetlog/config.json（首次运行自动探测 Obsidian vault）
"""

import functools
import json
import os
import re
import sys
import threading
import time
import urllib.request

# 无论 TTY 还是 launchd/nohup 环境，日志都实时输出
print = functools.partial(print, flush=True)
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "0.4.2"
PORT = int(os.environ.get("LEETLOG_PORT", "8763"))
CONFIG_DIR = Path(os.environ.get("LEETLOG_CONFIG", str(Path.home() / ".config" / "leetlog")))
CONFIG_FILE = CONFIG_DIR / "config.json"
CACHE_FILE = CONFIG_DIR / "problems.json"
STATE_FILE = CONFIG_DIR / "state.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
SESSION_GAP = 6 * 3600          # 超过 6 小时没动静就视为新的一次做题
LOCK = threading.Lock()

# 笔记模板双语字符串表（config.json 里 "lang": "zh" | "en"）
STRINGS = {
    "zh": {
        "weekdays": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
        "attempt": "第 {n} 次",
        "start": "⏱ 开始 {t}",
        "first_submit": "→ 首提 {t} · 编码 {m} 分钟",
        "ac": lambda t, s, a: f"→ AC {t} · 提交 {s} 次 / 通过 {a} 次",
        "submitted": lambda s: f"· 已提交 {s} 次（未 AC）",
        "in_progress": "→ （进行中）",
        "runs": lambda r: f"· 运行 {r} 次",
        "stay": "· 本题停留 {m} 分钟",
        "stmt": "题面",
        "code_header": "### ✅ 通过代码 · {lang} · {t}",
        "code_fold": "代码",
        "sections": "### 💭 思路 & 感悟\n-\n\n### 📚 学到了什么（新函数 / 新数据结构 / 新套路）\n-\n\n### 🔀 多种解法\n-\n",
        "link": "题目链接",
        "log_new": "🆕 {id}. {title} — 建立笔记",
        "log_again": "📖 {id}. {title} — 第 {n} 次（上次 {last}）",
        "log_ac": "✅ {slug} Accepted！编码 {m} 分钟（提交 {s} 次）→ 代码已存入笔记",
        "log_leave": "👋 {slug} 会话结束（{reason}）· 本题停留 {m} 分钟",
    },
    "en": {
        "weekdays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "attempt": "Attempt {n}",
        "start": "⏱ start {t}",
        "first_submit": "→ first submit {t} · coding {m} min",
        "ac": lambda t, s, a: f"→ AC {t} · {s} submit{'s' if s != 1 else ''} / {a} AC",
        "submitted": lambda s: f"· {s} submitted (no AC yet)",
        "in_progress": "→ (in progress)",
        "runs": lambda r: f"· {r} run{'s' if r != 1 else ''}",
        "stay": "· {m} min on problem",
        "stmt": "Problem",
        "code_header": "### ✅ Accepted · {lang} · {t}",
        "code_fold": "Code",
        "sections": "### 💭 Thoughts & insights\n-\n\n### 📚 What I learned (new functions / data structures / patterns)\n-\n\n### 🔀 Alternative solutions\n-\n",
        "link": "Problem link",
        "log_new": "🆕 {id}. {title} — note created",
        "log_again": "📖 {id}. {title} — attempt {n} (last: {last})",
        "log_ac": "✅ {slug} Accepted! coding {m} min ({s} submits) → code saved to note",
        "log_leave": "👋 {slug} session ended ({reason}) · {m} min on problem",
    },
}


def get_strings(cfg):
    return STRINGS.get(cfg.get("lang", "zh"), STRINGS["zh"])

# 语言名 → Markdown 代码块标记
LANG_MD = {
    "python3": "python", "python": "python", "cpp": "cpp", "c++": "cpp", "java": "java",
    "javascript": "javascript", "typescript": "typescript", "golang": "go", "go": "go",
    "rust": "rust", "c": "c", "csharp": "csharp", "c#": "csharp", "kotlin": "kotlin",
    "swift": "swift", "ruby": "ruby", "scala": "scala", "mysql": "sql", "sql": "sql",
}


# ---------------- 配置 / 缓存 ----------------

def detect_obsidian_vault():
    p = Path.home() / "Library" / "Application Support" / "obsidian" / "obsidian.json"
    try:
        vaults = json.loads(p.read_text())["vaults"]
        for v in vaults.values():
            if v.get("open"):
                return v["path"]
        return list(vaults.values())[0]["path"]
    except Exception:
        return None


def load_config():
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text())
    cfg = {
        "vault": detect_obsidian_vault() or str(Path.home() / "LeetLogNotes"),
        "folder": "LeetCode",
        "lang": "zh",
    }
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2))
    print(f"🆕 已生成配置 {CONFIG_FILE}（vault = {cfg['vault']}，可手动修改）")
    return cfg


def http_json(url, payload=None):
    headers = {"User-Agent": UA, "Referer": "https://leetcode.com"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def load_problem_cache(force=False):
    if CACHE_FILE.exists() and not force:
        return json.loads(CACHE_FILE.read_text())
    print("⏳ 下载 LeetCode 题库索引…")
    raw = http_json("https://leetcode.com/api/problems/all/")
    cache = {}
    for p in raw["stat_status_pairs"]:
        st = p["stat"]
        cache[st["question__title_slug"]] = {
            "id": st["frontend_question_id"],
            "title": st["question__title"],
            "difficulty": ["", "Easy", "Medium", "Hard"][p["difficulty"]["level"]],
        }
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False))
    print(f"✅ 已缓存 {len(cache)} 道题")
    return cache


def resolve_problem(slug):
    """slug → {id,title,difficulty,tags,url}；标签走 GraphQL，失败降级缓存"""
    tags = []
    try:
        d = http_json("https://leetcode.com/graphql", {
            "query": "query($s:String!){question(titleSlug:$s){questionFrontendId title difficulty topicTags{name}}}",
            "variables": {"s": slug}})
        q = d["data"]["question"]
        return {"id": int(q["questionFrontendId"]), "title": q["title"], "difficulty": q["difficulty"],
                "tags": [t["name"] for t in q["topicTags"]],
                "url": f"https://leetcode.com/problems/{slug}/description/"}
    except Exception:
        pass
    cache = load_problem_cache()
    hit = cache.get(slug) or load_problem_cache(force=True).get(slug)
    if not hit:
        return {"id": 0, "title": slug, "difficulty": "?", "tags": [],
                "url": f"https://leetcode.com/problems/{slug}/description/"}
    return {"id": int(hit["id"]), "title": hit["title"], "difficulty": hit["difficulty"], "tags": tags,
            "url": f"https://leetcode.com/problems/{slug}/description/"}


# ---------------- 会话状态 ----------------

def load_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False))


# ---------------- 笔记读写 ----------------

def fm_get(text, key):
    m = re.search(rf"^{key}:\s*(.*)$", text, re.M)
    return m.group(1).strip() if m else None


def fm_set(text, key, value):
    if re.search(rf"^{key}:", text, re.M):
        return re.sub(rf"^{key}:.*$", f"{key}: {value}", text, count=1, flags=re.M)
    return text.replace("---\n", f"---\n{key}: {value}\n", 1)


def note_path(cfg, prob, slug):
    folder = Path(cfg["vault"]) / cfg["folder"]
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{prob['id']:04d}-{slug}.md"


def new_note(prob, now, S):
    tags = ", ".join(prob["tags"])
    return f"""---
id: {prob['id']}
title: "{prob['title']}"
url: {prob['url']}
difficulty: {prob['difficulty']}
tags: [{tags}]
attempts: 0
first_attempt: {now:%Y-%m-%d}
last_attempt: {now:%Y-%m-%d}
total_submissions: 0
total_ac: 0
total_runs: 0
---

# {prob['id']}. {prob['title']}

> {prob['difficulty']} · {' / '.join(prob['tags']) or '—'} · [{S['link']}]({prob['url']})
"""


ATTEMPT_TMPL = """

## {attempt} · {date} {weekday}
{timer}

{sections}"""


def _mins(a, b):
    return max(1, round((b - a) / 60))


def timer_line(sess, S):
    """根据会话状态生成 ⏱ 行（幂等重写）。计时语义：
       编码 = 首次击键 → 首次提交；本题停留 = 首次击键 → 离开页面/换题
    """
    s = datetime.fromtimestamp(sess["start"])
    parts = [S["start"].format(t=f"{s:%H:%M}")]
    fs = sess.get("first_submit")
    if fs:
        parts.append(S["first_submit"].format(t=f"{datetime.fromtimestamp(fs):%H:%M}", m=_mins(sess['start'], fs)))
    if sess.get("first_ac"):
        fa = datetime.fromtimestamp(sess["first_ac"])
        parts.append(S["ac"](f"{fa:%H:%M}", sess['submits'], sess['acs']))
    elif sess["submits"]:
        parts.append(S["submitted"](sess['submits']))
    elif not sess.get("closed"):
        parts.append(S["in_progress"])
    if sess.get("runs"):
        parts.append(S["runs"](sess["runs"]))
    if sess.get("closed"):
        parts.append(S["stay"].format(m=_mins(sess['start'], sess['last_seen'])))
    return " ".join(parts)


def rewrite_timer_line(text, sess, S):
    lines = text.split("\n")
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].startswith("⏱"):
            lines[i] = timer_line(sess, S)
            return "\n".join(lines)
    return text


LEGACY_STMT_MARK = "<!--leetlog:statement-->"


def insert_statement(text, md, S):
    """把题面作为默认折叠的 callout 插到题头之后、第一段做题记录之前。
       幂等判断用题面 callout 本身（[!abstract]-），不写额外标记进笔记"""
    text = text.replace(LEGACY_STMT_MARK + "\n", "")  # 清理旧版写入的 HTML 注释（实时预览模式会显示出来）
    if "[!abstract]-" in text:
        return text
    quoted = "\n".join(("> " + l).rstrip() for l in md.strip().split("\n"))
    block = f"\n> [!abstract]- {S['stmt']}\n{quoted}\n"
    i = text.find("\n## ")
    if i == -1:
        return text + block
    return text[:i] + block + text[i:]


def insert_code_block(text, sess, ev, S):
    """AC 代码以默认折叠的 callout 插到当前（最后一段）⏱ 行之后、感悟区之前"""
    now = datetime.fromtimestamp(ev.get("ts", time.time()))
    lang = (ev.get("lang") or "").strip()
    md_lang = LANG_MD.get(lang.lower(), lang.lower() or "text")
    perf = " · ".join(x for x in [ev.get("runtime", ""), ev.get("memory", "")] if x)
    header = S["code_header"].format(lang=lang or '?', t=f"{now:%H:%M}") + (f"（{perf}）" if S is STRINGS["zh"] and perf else (f" ({perf})" if perf else ""))
    fenced = [f"```{md_lang}", *(ev.get('code') or '').rstrip().split("\n"), "```"]
    inner = "\n".join(("> " + l).rstrip() for l in fenced)
    block = f"\n{header}\n> [!success]- {S['code_fold']}\n{inner}\n"
    idx = text.rfind("⏱")
    line_end = text.find("\n", idx)
    if idx == -1 or line_end == -1:
        return text + block
    return text[:line_end + 1] + block + text[line_end + 1:]


# ---------------- 事件处理 ----------------

def migrate_session(sess):
    """兼容旧版本服务建立的会话（缺少新字段时补默认值），避免 KeyError"""
    sess.setdefault("first_submit", None)
    sess.setdefault("first_ac", None)
    sess.setdefault("closed", False)
    sess.setdefault("submits", 0)
    sess.setdefault("acs", 0)
    sess.setdefault("runs", 0)
    sess.setdefault("last_seen", sess.get("start", int(time.time())))
    return sess


def close_session(state, slug, ts, reason=""):
    """结算某题的会话：写入「本题停留」时间"""
    sess = state.get(slug)
    if not sess or sess.get("closed"):
        return
    migrate_session(sess)
    # 正常离开：停留时间算到当下；若事件迟到超过会话窗口，则不再延长
    if ts - sess.get("last_seen", ts) < SESSION_GAP:
        sess["last_seen"] = max(sess.get("last_seen", ts), ts)
    sess["closed"] = True
    try:
        S = get_strings(load_config())
        path = Path(sess["path"])
        path.write_text(rewrite_timer_line(path.read_text(), sess, S))
        stay = _mins(sess["start"], sess["last_seen"])
        print(S["log_leave"].format(slug=slug, reason=reason, m=stay))
    except Exception as e:
        print(f"⚠️ 结算 {slug} 失败：{e}")


def ensure_attempt(cfg, state, slug, ts):
    """确保该题有一个进行中的会话；没有则新建一段「第 N 次」"""
    sess = state.get(slug)
    # 会话有效的条件：时间窗口内 + 笔记文件还在（被手动删除则重建）
    if sess and ts - sess.get("last_seen", 0) < SESSION_GAP and Path(sess.get("path", "")).exists():
        migrate_session(sess)
        sess["last_seen"] = ts
        sess["closed"] = False   # 离开后又回来：视为同一次做题，继续累计
        return sess

    S = get_strings(cfg)
    prob = resolve_problem(slug)
    now = datetime.fromtimestamp(ts)
    path = note_path(cfg, prob, slug)
    if path.exists():
        text = path.read_text()
        n = int(fm_get(text, "attempts") or 0) + 1
        prev_last = fm_get(text, "last_attempt")
        print(S["log_again"].format(id=prob['id'], title=prob['title'], n=n, last=prev_last))
    else:
        text = new_note(prob, now, S)
        n = 1
        print(S["log_new"].format(id=prob['id'], title=prob['title']))
    text = fm_set(text, "attempts", n)
    text = fm_set(text, "last_attempt", f"{now:%Y-%m-%d}")
    sess = {"start": ts, "last_seen": ts, "submits": 0, "acs": 0, "runs": 0,
            "first_submit": None, "first_ac": None, "closed": False,
            "path": str(path), "n": n}
    text += ATTEMPT_TMPL.format(attempt=S["attempt"].format(n=n), date=f"{now:%Y-%m-%d}",
                                weekday=S["weekdays"][now.weekday()],
                                timer=timer_line(sess, S), sections=S["sections"])
    path.write_text(text)
    state[slug] = sess
    return sess


def handle_event(ev):
    with LOCK:
        cfg = load_config()
        state = load_state()
        slug = ev.get("slug")
        etype = ev.get("type")
        ts = int(ev.get("ts") or time.time())
        if not slug:
            return {"ok": False, "error": "bad event"}
        # 未知事件类型静默忽略（向前兼容：新版扩展先于桥接更新时不报错）
        if etype not in ("start", "result", "leave", "run", "statement"):
            return {"ok": True, "ignored": etype}

        if etype == "leave":
            close_session(state, slug, ts, "关闭/离开页面")
            save_state(state)
            return {"ok": True}

        if etype == "start":
            # 开始做新题 = 结算其他还开着的题（"直到开始做下一个题"）
            for other in list(state.keys()):
                if other != slug:
                    close_session(state, other, ts, f"切换到 {slug}")

        S = get_strings(cfg)
        sess = ensure_attempt(cfg, state, slug, ts)
        path = Path(sess["path"])
        text = path.read_text()

        if etype == "statement":
            md = (ev.get("md") or "").strip()
            if md:
                text = insert_statement(text, md, S)

        if etype == "run":
            sess["runs"] = sess.get("runs", 0) + 1
            text = fm_set(text, "total_runs", int(fm_get(text, "total_runs") or 0) + 1)

        if etype == "result":
            sess["submits"] += 1
            if not sess["first_submit"]:
                sess["first_submit"] = ts
            status = ev.get("status", "")
            if status == "Accepted":
                sess["acs"] += 1
                if not sess["first_ac"]:
                    sess["first_ac"] = ts
                if ev.get("code"):
                    text = insert_code_block(text, sess, ev, S)
                text = fm_set(text, "total_ac", int(fm_get(text, "total_ac") or 0) + 1)
                coding = _mins(sess["start"], sess["first_submit"])
                print(S["log_ac"].format(slug=slug, m=coding, s=sess['submits']))
            else:
                print(f"📝 {slug} {status}（第 {sess['submits']} 次提交）")
            text = fm_set(text, "total_submissions", int(fm_get(text, "total_submissions") or 0) + 1)

        text = rewrite_timer_line(text, sess, S)
        path.write_text(text)
        sess["last_seen"] = ts
        save_state(state)
        return {"ok": True}


# ---------------- HTTP ----------------

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/ping":
            cfg = load_config()
            state = load_state()
            folder = Path(cfg["vault"]) / cfg["folder"]
            notes = len(list(folder.glob("[0-9]*.md"))) if folder.exists() else 0
            active = [s for s, v in state.items()
                      if not v.get("closed") and time.time() - v.get("last_seen", 0) < SESSION_GAP]
            self._json(200, {"ok": True, "version": VERSION, "vault": cfg["vault"], "folder": cfg["folder"],
                             "active": active, "notes": notes})
        else:
            self._json(404, {"ok": False})

    def do_POST(self):
        if self.path != "/event":
            self._json(404, {"ok": False})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            ev = json.loads(self.rfile.read(length).decode())
            self._json(200, handle_event(ev))
        except Exception as e:
            print(f"⚠️ 事件处理失败：{e}")
            self._json(500, {"ok": False, "error": str(e)})

    def log_message(self, *args):
        pass  # 安静模式，只打业务日志


def main():
    cfg = load_config()
    print(f"""📗 LeetLog 桥接服务已启动
   监听:   http://127.0.0.1:{PORT}
   笔记:   {Path(cfg['vault']) / cfg['folder']}
   用法:   保持本窗口运行，去 LeetCode 做题即可；⌃C 退出
""")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
