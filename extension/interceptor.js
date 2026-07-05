// LeetLog interceptor — 运行在页面主世界（MAIN world）
// 职责：
//   1) 首次击键 → start 事件
//   2) 拦截提交请求 → 拿到 submission_id / 代码 / 语言
//   3) 自己轮询判题结果（/check/ 接口，失败则 GraphQL submissionDetails 兜底）→ result 事件
// 只通过 window.postMessage 把事件交给 content.js（隔离世界）转发给本地服务。
(() => {
  "use strict";
  // 防重复挂钩：扩展更新后 background 会向已打开页面补注入，页面里可能已有本脚本
  if (window.__leetlogInterceptorLoaded) return;
  window.__leetlogInterceptorLoaded = true;

  const log = (...a) => console.debug("[LeetLog]", ...a);
  const slugOf = () => (location.pathname.match(/\/problems\/([^/?#]+)/) || [])[1] || null;

  const SITE = location.hostname.endsWith("leetcode.cn") ? "cn" : "com";

  function emit(type, payload = {}, slugOverride) {
    const slug = slugOverride || slugOf();
    if (!slug) return;
    window.postMessage({ source: "leetlog", type, slug, site: SITE, ts: Math.floor(Date.now() / 1000), ...payload }, "*");
  }

  // ---------- 1) 首次击键计时 ----------
  let startedSlug = null;
  document.addEventListener("keydown", (e) => {
    const slug = slugOf();
    if (!slug || slug === startedSlug) return;
    const t = e.target;
    const inEditor =
      (t && t.closest && t.closest(".monaco-editor")) ||
      (document.activeElement && document.activeElement.closest && document.activeElement.closest(".monaco-editor"));
    if (inEditor) {
      startedSlug = slug;
      const pre = prefetchProblem(slug);
      // 元数据先于 start 发出（extension-only 模式靠它命名/填充笔记），题面随后
      if (pre.value) {
        if (pre.value.meta) emit("meta", pre.value.meta, slug);
        emit("start");
        if (pre.value.md) emit("statement", { md: pre.value.md }, slug);
      } else {
        emit("start");
        pre.p.then((v) => {
          if (!v) return;
          if (v.meta) emit("meta", v.meta, slug);
          if (v.md) emit("statement", { md: v.md }, slug);
        });
      }
      log("start →", slug);
    }
  }, true);

  // ---------- 1.5) 题目预取（元数据 + 题面） ----------
  // 页面加载时就发一次 GraphQL（leetcode.cn 题面优先中文翻译），首次击键时直接从缓存发事件。
  // meta 供 extension-only 模式命名笔记；statement 由桥接作为默认折叠 callout 插入（幂等）。

  function htmlToMd(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const conv = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue || "").replace(/ /g, " ");
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const kids = () => Array.from(node.childNodes).map(conv).join("");
      switch (node.tagName) {
        case "P": { const t = kids().trim(); return t ? t + "\n\n" : ""; }
        case "PRE": return "```\n" + (node.textContent || "").replace(/ /g, " ").trim() + "\n```\n\n";
        case "CODE": return "`" + (node.textContent || "").replace(/ /g, " ") + "`";
        case "STRONG": case "B": { const t = kids().trim(); return t ? "**" + t + "**" : ""; }
        case "EM": case "I": { const t = kids().trim(); return t ? "*" + t + "*" : ""; }
        case "SUP": return "^" + kids();
        case "SUB": return "~" + kids();
        case "BR": return "\n";
        case "IMG": return "![](" + (node.getAttribute("src") || "") + ")";
        case "UL": case "OL": {
          let i = 0;
          const items = Array.from(node.children)
            .filter((c) => c.tagName === "LI")
            .map((li) => (node.tagName === "OL" ? `${++i}. ` : "- ") +
              Array.from(li.childNodes).map(conv).join("").trim().replace(/\n+/g, "\n  "));
          return items.join("\n") + "\n\n";
        }
        default: return kids();
      }
    };
    return conv(doc.body).replace(/\n{3,}/g, "\n\n").trim();
  }

  const prefetched = {}; // slug -> { p: Promise, value?: {meta, md} }

  function prefetchProblem(slug) {
    if (!slug) return { p: Promise.resolve(null) };
    if (prefetched[slug]) return prefetched[slug];
    const entry = {};
    entry.p = (async () => {
      const r = await origFetch(`${location.origin}/graphql/`, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: "query($s:String!){question(titleSlug:$s){questionFrontendId title difficulty topicTags{name} content translatedContent}}",
          variables: { s: slug },
        }),
      });
      const d = await r.json();
      const q = d && d.data && d.data.question;
      const meta = q ? {
        id: parseInt(q.questionFrontendId, 10) || 0,
        title: q.title || slug,
        difficulty: q.difficulty || "?",
        tags: (q.topicTags || []).map((t) => t.name),
        url: `${location.origin}/problems/${slug}/description/`,
      } : null;
      const html = (location.hostname.endsWith("leetcode.cn") && q && q.translatedContent) || (q && q.content) || "";
      const md = html ? htmlToMd(html) : ""; // 付费题/未登录拿不到题面，只发 meta
      if (meta && md) meta.gist = md.replace(/\s+/g, " ").slice(0, 200); // 闪卡正面的精简题面（用户内容）
      entry.value = { meta, md };
      log("预取完成：", slug, meta ? `#${meta.id}` : "(无元数据)", md ? `${md.length} chars` : "(无题面)");
      return entry.value;
    })().catch((e) => {
      delete prefetched[slug]; // 失败允许重试
      log("题目预取失败：", String(e));
      return null;
    });
    prefetched[slug] = entry;
    return entry;
  }

  // ---------- 3) 判题结果轮询 ----------
  const STATUS = {
    10: "Accepted", 11: "Wrong Answer", 12: "Memory Limit Exceeded",
    13: "Output Limit Exceeded", 14: "Time Limit Exceeded", 15: "Runtime Error",
    16: "Internal Error", 20: "Compile Error", 30: "Timeout",
  };

  async function pollCheck(id) {
    const r = await fetch(`${location.origin}/submissions/detail/${id}/check/`, { credentials: "same-origin" });
    if (!r.ok) throw new Error("check HTTP " + r.status);
    return r.json();
  }

  async function pollGraphql(id) {
    const r = await fetch(`${location.origin}/graphql/`, {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationName: "submissionDetails",
        variables: { submissionId: Number(id) },
        query: "query submissionDetails($submissionId: Int!){ submissionDetails(submissionId:$submissionId){ runtimeDisplay memoryDisplay code statusCode lang{ name } question{ titleSlug } } }",
      }),
    });
    const d = await r.json();
    return d && d.data && d.data.submissionDetails;
  }

  async function watchSubmission(id, meta) {
    log("提交已捕获，开始轮询结果：", id, meta.slug);
    const deadline = Date.now() + 60_000;
    let checkBroken = false;
    while (Date.now() < deadline) {
      if (!checkBroken) {
        try {
          const d = await pollCheck(id);
          if (d && d.state === "SUCCESS" && d.status_msg) {
            emit("result", {
              status: d.status_msg,
              lang: d.pretty_lang || meta.lang || "",
              code: meta.code || "",
              runtime: d.status_runtime || "",
              memory: d.status_memory || "",
              submissionId: id,
            }, meta.slug);
            log("result（check 通道）：", d.status_msg);
            return;
          }
        } catch (e) {
          checkBroken = true;
          log("check 通道不可用，切换 GraphQL 兜底：", String(e));
        }
      } else {
        try {
          const s = await pollGraphql(id);
          if (s && s.statusCode) {
            emit("result", {
              status: STATUS[s.statusCode] || `Status ${s.statusCode}`,
              lang: (s.lang && s.lang.name) || meta.lang || "",
              code: s.code || meta.code || "",
              runtime: s.runtimeDisplay || "",
              memory: s.memoryDisplay || "",
              submissionId: id,
            }, meta.slug);
            log("result（GraphQL 通道）：", s.statusCode);
            return;
          }
        } catch (e2) {
          log("GraphQL 轮询出错：", String(e2));
        }
      }
      await new Promise((r) => setTimeout(r, 1300));
    }
    log("⚠️ 轮询超时，未拿到判题结果：", id);
  }

  // ---------- 2) 提交拦截 ----------
  function submitMetaFrom(url, bodyText) {
    if (!/\/problems\/[^/]+\/submit\/?($|\?)/.test(url)) return null;
    const slug = (url.match(/\/problems\/([^/?#]+)\//) || [])[1] || slugOf();
    try {
      const b = JSON.parse(bodyText || "{}");
      return { slug, code: b.typed_code || "", lang: b.lang || "" };
    } catch (_) {
      return { slug, code: "", lang: "" };
    }
  }

  // Run（非提交执行）→ run 事件，只计数不追结果
  function emitRun(url) {
    const slug = (String(url).match(/\/problems\/([^/?#]+)\//) || [])[1];
    emit("run", {}, slug);
    log("run →", slug || "(当前题)");
  }

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (url && url.includes("/interpret_solution")) emitRun(url);
    let meta = null;
    if (url && url.includes("/submit")) {
      let body = init && typeof init.body === "string" ? init.body : null;
      if (body == null && typeof Request !== "undefined" && input instanceof Request) {
        try { body = await input.clone().text(); } catch (_) {}
      }
      meta = submitMetaFrom(url, body);
    }
    const resp = await origFetch.apply(this, arguments);
    if (meta) {
      try {
        const d = await resp.clone().json();
        if (d && d.submission_id) watchSubmission(String(d.submission_id), meta);
        else log("submit 响应里没有 submission_id：", d);
      } catch (e) {
        log("submit 响应解析失败：", String(e));
      }
    }
    return resp;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__leetlog_url = url || "";
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__leetlog_url || "";
    if (url.includes("/interpret_solution")) emitRun(url);
    const meta = (url.includes("/submit") && typeof body === "string") ? submitMetaFrom(url, body) : null;
    if (meta) {
      this.addEventListener("load", () => {
        try {
          const d = JSON.parse(this.responseText);
          if (d && d.submission_id) watchSubmission(String(d.submission_id), meta);
        } catch (_) {}
      });
    }
    return origSend.apply(this, arguments);
  };

  // 页面加载即预取当前题（fetch 钩子已装好，走 origFetch）
  const initialSlug = slugOf();
  if (initialSlug) prefetchProblem(initialSlug);

  log("interceptor 已加载（v0.5）");
})();
