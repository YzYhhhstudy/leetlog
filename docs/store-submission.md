# 上架提交手册（Chrome Web Store + Obsidian 社区插件）

> 照着本文档逐步执行即可。所有文案可直接复制。

---

## A. GitHub Release（Obsidian 上架的前置条件，先做这个）

Obsidian 要求：release 的 **tag 必须和 manifest.json 的 version 完全一致**（`0.1.0`，不带 v 前缀），
且附件包含 `manifest.json` 和 `main.js`。一条命令搞定：

```bash
cd ~/Desktop/Testall/Mine/leetlog
gh release create 0.1.0 \
  obsidian-plugin/manifest.json \
  obsidian-plugin/main.js \
  obsidian-plugin/versions.json \
  --title "LeetLog 0.1.0 — extension + dual bridges" \
  --notes "First public release: Chrome extension (MV3) + Python bridge + Obsidian plugin bridge. Auto-timing from first keystroke, submission counting, accepted-code capture into local Obsidian notes. 100% local."
```

---

## B. Chrome Web Store

### 1. 开发者账号
[chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) → 一次性 $5 注册费。

### 2. 上传
"New item" → 上传 `dist/leetlog-extension-0.2.0.zip`（已打好；以后更新跑
`cd extension && zip -r ../dist/leetlog-extension-<版本>.zip . -x ".*"`）。

### 3. 商店信息（Store listing）

- **名称**：`LeetLog — LeetCode practice logger for Obsidian`
- **摘要（Summary，≤132 字符）**：
  `Auto-log your LeetCode practice into local Obsidian notes: typing starts the timer, AC saves your code. 100% local, zero upload.`
- **类别**：Productivity → Developer Tools
- **语言**：English（可再加 Chinese (Simplified) 本地化，描述用下方中文版）
- **描述（英文）**：

```
LeetLog automatically captures your LeetCode practice into your local Obsidian vault — you only write the insights.

⌨️ Type your first keystroke on a problem → timer starts
📤 Every submission is counted automatically
✅ Get Accepted → your code, runtime stats and timing are written into a structured note
📖 Redo an old problem → the same note accumulates every attempt, so you can see what past-you was thinking

TIMING THAT MATTERS
• Coding time = first keystroke → first submit (your real solving time)
• Time on problem = first keystroke → leaving the page (includes review & optimization)

100% LOCAL
Your data flows from the LeetCode page to 127.0.0.1 on your own machine — nothing is ever uploaded. No account, no analytics, no third-party servers. Fully open source: https://github.com/YzYhhhstudy/leetlog

REQUIRES
A local bridge on your machine: either the LeetLog Bridge Obsidian plugin (recommended) or the bundled Python server. Setup takes ~2 minutes — see the GitHub README.
```

- **描述（中文，用于 zh-CN 本地化）**：

```
LeetLog 把你的 LeetCode 刷题过程自动记录进本地 Obsidian —— 你只负责写感悟。

⌨️ 在题目页敲下第一个键 → 自动开始计时
📤 每次提交自动计数
✅ AC 的瞬间 → 通过代码、运行数据、用时写进结构化笔记
📖 重做旧题 → 同一篇笔记累积每次尝试，温故知新

计时语义：编码时间 = 首次击键 → 首次提交；本题停留 = 首次击键 → 离开页面。

100% 本地：数据只从 LeetCode 页面流向你电脑上的 127.0.0.1，永不上传。无账号、无埋点、无第三方服务器，完全开源。

需要本机运行一个桥接（推荐 LeetLog Bridge Obsidian 插件，或自带的 Python 服务），配置约 2 分钟，见 GitHub README。
```

- **图标**：需要 128×128 PNG（待做：可从 📗 emoji 或自定 logo 生成）
- **截图**：至少 1 张 1280×800。建议三张：
  1. LeetCode AC 页面 + Obsidian 笔记并排（最有说服力）
  2. 扩展 popup（🟢 状态面板）
  3. `docs/demo.svg` 导出成 PNG（浏览器打开 → 截图）

### 4. 隐私（Privacy 标签页，审核重点）

- **Single purpose（单一用途声明）**：
  `Automatically record the user's own LeetCode practice activity (solve timing, submission counts, accepted code) into the user's local note system via a localhost bridge.`
- **权限理由（Permission justifications）**：
  - `host_permissions: http://127.0.0.1/*` →
    `Send captured practice events to the user's own local bridge application. No external hosts are contacted.`
  - `content_scripts on leetcode.com/leetcode.cn problem pages` →
    `Detect when the user starts typing (timing signal) and read the user's own submissions and judge results in order to log them locally.`
- **数据使用（Data usage）**：勾选收集 "User activity"（说明：typing-start signal and the
  user's own submitted code）→ 声明 **数据不出设备、不出售、不用于无关用途、无远程代码**。
- **Privacy policy URL**：`https://github.com/YzYhhhstudy/leetlog/blob/master/PRIVACY.md`

### 5. 给审核员的备注（Review notes，可选但强烈建议）

```
This extension only communicates with a bridge on the user's own machine (127.0.0.1).
No data leaves the device. Full source code: https://github.com/YzYhhhstudy/leetlog
To test: run `python3 server/leetlog_server.py` from the repo, open any LeetCode problem,
type in the editor, submit — a Markdown note is created locally.
```

审核通常 1~3 个工作日。被打回最常见原因是权限理由写得含糊——上面的文案已按官方口径写好。

---

## C. Obsidian 社区插件市场

### 前置检查（都已满足 ✓）
- [x] 公开仓库，含开源协议（MIT）
- [x] `manifest.json` 位于**仓库根目录**（已从 obsidian-plugin/ 复制，两处保持同步）
- [x] Release tag = manifest version（步骤 A 的 `0.1.0`）
- [x] manifest description 为英文
- [x] `isDesktopOnly: true`（用了 Node http，移动端不支持）

### 提交 PR
1. Fork [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
2. 编辑 `community-plugins.json`，在**末尾**追加：

```json
{
  "id": "leetlog-bridge",
  "name": "LeetLog Bridge",
  "author": "YzYhhhstudy",
  "description": "Receives events from the LeetLog browser extension and auto-writes LeetCode practice notes (timing, submissions, accepted code) into your vault.",
  "repo": "YzYhhhstudy/leetlog"
}
```

3. 提 PR，标题 `Add plugin: LeetLog Bridge`，按 PR 模板勾选 checklist
4. 机器人会立刻自动校验（release 资产、manifest 位置等），有红叉按提示修
5. 人工审核 1~4 周；期间审核员可能提代码建议（常见：要求用 Obsidian API 替代原生 API），
   跟着改就行

### 用户侧安装路径（上架后）
Obsidian → 设置 → 第三方插件 → 浏览 → 搜 "LeetLog" → Install & Enable。

---

## D. 上架后 checklist

- [ ] README 顶部加两个徽章：Chrome Web Store 版本徽章 + Obsidian 下载量徽章（shields.io）
- [ ] README 安装章节改为商店链接优先，load-unpacked 降级为开发者方式
- [ ] 发布帖：Obsidian 论坛 Share & Showcase 板块、r/ObsidianMD、V2EX/即刻（中文用户）
- [ ] Firefox 版（manifest 加 `browser_specific_settings.gecko.id`，提交 addons.mozilla.org）
