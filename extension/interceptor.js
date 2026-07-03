// LeetLog interceptor — 运行在页面主世界（MAIN world）
// 职责：
//   1) 首次击键 → start 事件
//   2) 拦截提交请求 → 拿到 submission_id / 代码 / 语言
//   3) 自己轮询判题结果（/check/ 接口，失败则 GraphQL submissionDetails 兜底）→ result 事件
// 只通过 window.postMessage 把事件交给 content.js（隔离世界）转发给本地服务。
(() => {
  "use strict";

  const log = (...a) => console.debug("[LeetLog]", ...a);
  const slugOf = () => (location.pathname.match(/\/problems\/([^/?#]+)/) || [])[1] || null;

  function emit(type, payload = {}, slugOverride) {
    const slug = slugOverride || slugOf();
    if (!slug) return;
    window.postMessage({ source: "leetlog", type, slug, ts: Math.floor(Date.now() / 1000), ...payload }, "*");
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
      emit("start");
      log("start →", slug);
    }
  }, true);

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

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
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

  log("interceptor 已加载（v0.2）");
})();
