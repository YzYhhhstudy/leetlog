# 上架提交手册（Chrome Web Store + Obsidian 社区插件）

> 照着本文档逐步执行即可。所有文案可直接复制。

---

## A. GitHub Release（Obsidian 上架的前置条件，先做这个）

Obsidian 要求：release 的 **tag 必须和 manifest.json 的 version 完全一致**（不带 v 前缀），
且附件包含 `manifest.json` 和 `main.js`。**现已全自动**（.github/workflows/release.yml）：

```bash
# 1. 把 obsidian-plugin/manifest.json 的 version 和 versions.json 改到新版本号
# 2. 打 tag 推送即可——CI 自动构建、校验 manifest==tag、创建 release、
#    并把根目录 manifest/versions 同步回 master（Obsidian 商店读根目录判断新版）
git tag 0.3.8 && git push origin 0.3.8
# 3. 发布后本地记得 git pull --rebase（CI 会往 master 推同步提交）
```

---

## B. Chrome Web Store

### 1. 开发者账号
[chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) → 一次性 $5 注册费。

### 2. 上传
"New item" → 上传 `dist/leetlog-extension-<版本>.zip`（当前线上 0.6.7；打包命令
`cd extension && zip -r ../dist/leetlog-extension-<版本>.zip . -x ".*"`）。

### 3. 商店信息（Store listing）

- **名称**：`LeetLog — LeetCode practice logger (Markdown & Obsidian)`
- **摘要（Summary，≤132 字符）**：
  `Auto-log LeetCode practice into local Markdown notes: typing starts the timer, AC saves your code. Obsidian-ready. 100% local.`
- **类别**：Productivity → Developer Tools
- **语言**：English（可再加 Chinese (Simplified) 本地化，描述用下方中文版）
- **描述（英文）**：

```
LeetLog automatically captures your LeetCode practice into local Markdown notes — you only write the insights.

⌨️ Type your first keystroke on a problem → timer starts
📤 Every submission is counted automatically
✅ Get Accepted → your code, runtime stats and timing are written into a structured note
📖 Redo an old problem → the same note accumulates every attempt, so you can see what past-you was thinking

WORKS OUT OF THE BOX
Pick any folder in the extension's options and notes are written straight into it — no extra software needed. Point it at your Obsidian vault and every note lands there ready for Dataview/Bases dashboards (templates included in the repo).

TIMING THAT MATTERS
• Coding time = first keystroke → first submit (your real solving time)
• Time on problem = first keystroke → leaving the page (includes review & optimization)

100% LOCAL BY DEFAULT
Your notes are plain Markdown files on your machine. No account, no analytics, no third-party servers. Optional extras, both off by default: a localhost bridge (LeetLog Bridge Obsidian plugin, or a Python server) for deeper vault integration, and opt-in cloud sync for spaced-repetition flashcards and a mistake notebook. Fully open source: https://github.com/YzYhhhstudy/leetlog
```

- **描述（中文，用于 zh-CN 本地化）**：

```
LeetLog 把你的 LeetCode 刷题过程自动记录成本地 Markdown 笔记 —— 你只负责写感悟。

⌨️ 在题目页敲下第一个键 → 自动开始计时
📤 每次提交自动计数
✅ AC 的瞬间 → 通过代码、运行数据、用时写进结构化笔记
📖 重做旧题 → 同一篇笔记累积每次尝试，温故知新

开箱即用：在扩展设置里选一个文件夹，笔记直接写进去，不需要装任何其他软件。选 Obsidian vault 的文件夹，笔记就直接进库，配合仓库自带的 Dataview/Bases 仪表盘模板食用。

计时语义：编码时间 = 首次击键 → 首次提交；本题停留 = 首次击键 → 离开页面。

默认 100% 本地：笔记就是你电脑上的 Markdown 文件。无账号、无埋点、无第三方服务器。两个可选增强（默认都关闭）：本机桥接（LeetLog Bridge Obsidian 插件或 Python 服务）做更深的 vault 集成；可选云同步提供间隔复习闪卡和自动错题本。完全开源。
```

- **图标**：`extension/icons/icon-128.png`（已生成 ✓，商店 listing 直接上传这张）
- **截图**：至少 1 张 1280×800。**已备好三组（中英各一，`docs/store-screenshots/`）**：
  `store-popup-*.png`（popup 状态+今日复习）、`store-note-*.png`（笔记特写）、
  `store-dash-*.png`（错题本仪表盘）。第四张建议人工补：LeetCode AC 页 + 笔记并排（最有说服力）

### 4. 隐私（Privacy 标签页，审核重点）

- **Single purpose（单一用途声明）**：
  `Automatically record the user's own LeetCode practice activity (solve timing, submission counts, accepted code) into local Markdown notes — written directly to a user-chosen folder, or via a bridge on localhost.`
- **权限理由（Permission justifications）**：
  - `host_permissions: http://127.0.0.1/*` →
    `Send captured practice events to the user's own local bridge application. No external hosts are contacted.`
  - `content_scripts on leetcode.com/leetcode.cn problem pages` →
    `Detect when the user starts typing (timing signal) and read the user's own submissions and judge results in order to log them locally.`
  - `storage`（0.3.0 起新增，离线队列） →
    `Buffer practice events on the user's device when the localhost bridge is offline, so no practice session is lost. Nothing leaves the device.`
  - `alarms`（0.3.0 起新增，离线队列重试） →
    `Periodically (every 30s) retry delivering buffered events to the user's own localhost bridge until it comes back online.`
  - `scripting` + `host_permissions: *://leetcode.com/problems/* 与 *://leetcode.cn/problems/*`（0.4.1 起新增，更新自愈） →
    `After an extension update, re-inject the capture content scripts into already-open LeetCode problem tabs so long-lived tabs keep logging without a manual page refresh. Same origins as the declared content scripts; no new data access.`
- **数据使用（Data usage）**：勾选两项——
  **"User activity"**（对应：打字开始信号 + 拦截自己的 submit/判题网络请求）与
  **"Website content"**（对应：题目标题/难度/标签/链接、用户提交的代码文本、判题结果）
  → 三条 certify 全勾（不出售/不用于无关用途/不用于信贷评估），并声明 **无远程代码**。
- **Privacy policy URL**：`https://github.com/YzYhhhstudy/leetlog/blob/master/PRIVACY.md`
- **0.6.x 起（可选云同步）补充**：Single purpose 末尾追加一句
  `Optionally, and only after the user explicitly pairs with a one-time code, the same events can additionally be synced to the user's own LeetLog Cloud account.`
  数据使用问卷若问"是否传输到开发者服务器"→ 如实答 **是（仅用户显式启用后）**，
  用途勾 App functionality；PRIVACY.md 已含对应条款（2026-07-06 更新）。

### 5. 给审核员的备注（Review notes，可选但强烈建议）

> ⚠️ CWS 的 "Additional instructions" 字段上限 **500 字符**，直接粘贴下面这个压缩版（486 字符）：

```
No account or login required.

Talks only to a local bridge on the user's machine (http://127.0.0.1:8763); no data leaves the device. Source: https://github.com/YzYhhhstudy/leetlog

Test: run server/leetlog_server.py (Python 3 stdlib only). Open https://leetcode.com/problems/two-sum/, type in the editor, submit. A Markdown note (timing, submissions, accepted code) appears in the folder printed at startup.

With no bridge running, the extension stays idle (popup shows disconnected).
```

完整版（无字数限制的场合用，如申诉邮件）：

```
No account or login is required.

The extension communicates only with a bridge on the user's own machine
(http://127.0.0.1:8763). No data is transmitted to any external server.
Source code: https://github.com/YzYhhhstudy/leetlog

Fastest test (no Obsidian needed):
1. Download server/leetlog_server.py from the repo and run: python3 leetlog_server.py
   (Python 3 standard library only)
2. Open any problem, e.g. https://leetcode.com/problems/two-sum/
3. Type in the code editor, then submit a solution.
4. A Markdown note (timing, submission count, accepted code) is written to the
   notes folder printed at server startup (defaults to ~/LeetLogNotes/LeetCode).

End users typically install the "LeetLog Bridge" Obsidian community plugin
instead; both expose the same localhost API. With no bridge running, the
extension stays idle — the popup shows a disconnected status and nothing is
transmitted anywhere.
```

审核通常 1~3 个工作日。被打回最常见原因是权限理由写得含糊——上面的文案已按官方口径写好。

---

## C. Obsidian 社区插件市场

### 前置检查（都已满足 ✓）
- [x] 公开仓库，含开源协议（MIT）
- [x] `manifest.json` 位于**仓库根目录**（已从 obsidian-plugin/ 复制，两处保持同步）
- [x] Release tag = manifest version（步骤 A 的自动化流水线保证）
- [x] manifest description 为英文
- [x] `isDesktopOnly: true`（用了 Node http，移动端不支持）

### 提交（2026 新流程：官方门户，不再接受 PR）

> obsidianmd/obsidian-releases 已关闭 PR 提交，现在走 community.obsidian.md 门户 + 自动化审查。

1. 打开 [community.obsidian.md](https://community.obsidian.md)，用 Obsidian 账户登录（没有就注册一个），并按提示**关联 GitHub 账户**（YzYhhhstudy）
2. 侧边栏 **Plugins → New plugin**
3. 填仓库地址：`https://github.com/YzYhhhstudy/leetlog`
4. 勾选同意开发者政策 → Submit
5. 系统**自动审查**（检查根目录 manifest、release 资产、LICENSE、README 等——本仓库已全部就绪），反馈直接显示在门户里；有问题就改仓库、发新 release、重新触发
6. 自动审查通过后进入人工审核队列

### 用户侧安装路径（上架后）
Obsidian → 设置 → 第三方插件 → 浏览 → 搜 "LeetLog" → Install & Enable。

---

## E. Microsoft Edge Add-ons（Partner Center）

注册免费（已完成）。用和 Chrome **完全相同的 zip**，流程约 15 分钟，审核通常 1~7 天。

### 1. 创建
[partner.microsoft.com/dashboard/microsoftedge](https://partner.microsoft.com/dashboard/microsoftedge)
→ **Create new extension** → 上传 `dist/leetlog-extension-<版本>.zip`。

### 2. Availability
- Visibility: **Public**；Markets: **All markets**（默认全选即可）。

### 3. Properties
- **Category**: `Developer tools`
- **Privacy policy URL**: `https://github.com/YzYhhhstudy/leetlog/blob/master/PRIVACY.md`
- **Website / Support URL**: `https://github.com/YzYhhhstudy/leetlog`
- Mature content: **No**

### 4. Listings（先 English，可再加 Chinese (Simplified)）
- **Display name**: `LeetLog — LeetCode practice logger for Obsidian`
- **Description**: 直接复制上文 B.3 的英文长描述（中文列表复制中文版）
- **Short description**: 复制 B.3 的 Summary
- **Store logo（必填，300×300）**: `docs/edge-store-logo-300.png`（已生成）
- **Search terms**: `leetcode, obsidian, notes, timer, practice log, spaced repetition`
- Screenshots（可选，1280×800）：有空可截 popup + 生成的笔记各一张，转化率会高不少

### 5. Notes for certification
复制 B.5 的压缩版审核员备注（同样适用）。

> 提交后状态在 Partner Center 的 Extension overview 页可查；过审后拿到
> `microsoftedge.microsoft.com/addons/detail/<id>` 链接，回填 README 徽章。

---

## D. 上架后 checklist

- [x] CWS **已上线且为最新版**（07-06 过审，07-06 当天 0.6.7 也已发布）：
      扩展 ID `nfdgchmjkdfhcmaglfhngmddhjdogdii`，README 徽章/一键安装区均已就位。
      若 listing 文案还没换成 B.3 新版（extension-first），编辑 listing 即可（文字改动不触发重审）
- [ ] Edge Add-ons 审核中（07-06 提交）：过审后加 README 徽章 + 商店链接
- [x] Obsidian 下载量徽章已上（07-09：community-plugin-stats.json 已收录，首周 25 次下载）
- [ ] 发布帖：Obsidian 论坛 Share & Showcase 板块、r/ObsidianMD、V2EX/即刻（中文用户）
- [ ] Firefox 版（manifest 加 `browser_specific_settings.gecko.id`，提交 addons.mozilla.org）
- [ ] GitHub Action 构建 release 并生成 artifact attestations（actions/attest-build-provenance，回应审查建议）

> 注意：release 资产只放 `manifest.json` + `main.js`（审查建议不要附 versions.json；它保留在仓库里即可）
