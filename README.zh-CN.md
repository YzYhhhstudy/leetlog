<div align="right"><a href="./README.md">English</a> | 简体中文</div>

# 📗 LeetLog

[![Release](https://img.shields.io/github/v/release/YzYhhhstudy/leetlog?label=release&color=2ea44f)](https://github.com/YzYhhhstudy/leetlog/releases)
[![Obsidian plugin](https://img.shields.io/badge/Obsidian-LeetLog%20Bridge-7c3aed?logo=obsidian&logoColor=white)](https://obsidian.md/plugins?id=leetlog-bridge)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/nfdgchmjkdfhcmaglfhngmddhjdogdii?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285f4)](https://chromewebstore.google.com/detail/nfdgchmjkdfhcmaglfhngmddhjdogdii)
[![Chrome Web Store users](https://img.shields.io/chrome-web-store/users/nfdgchmjkdfhcmaglfhngmddhjdogdii?logo=googlechrome&logoColor=white&color=2ea44f)](https://chromewebstore.google.com/detail/nfdgchmjkdfhcmaglfhngmddhjdogdii)
[![License: MIT](https://img.shields.io/github/license/YzYhhhstudy/leetlog?color=blue)](LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/YzYhhhstudy)

**把你的 LeetCode 刷题过程自动记录成本地 Markdown 笔记（Obsidian 就绪）—— 你只负责写感悟。**

![demo](docs/demo.svg)

在题目页**敲下第一个键**自动开始计时，每次提交自动计数，**AC 的瞬间**把通过代码、
运行数据、用时写进结构化的 Obsidian 笔记。重做旧题时，同一篇笔记累积每一次尝试——
一眼看到过去的自己是怎么想的，温故知新。

## 它和现有工具的区别

| | LeetHub 系 | 计时器扩展 | LeetPlug | **LeetLog** |
|---|---|---|---|---|
| AC 代码归档 | ✅ 推到 GitHub | ❌ | ❌ | ✅ 写进本地笔记 |
| 自动计时（首次击键起） | ❌ | ✅ | ✅ | ✅ |
| 提交/通过次数 | ❌ | ❌ | ✅ | ✅ |
| 重做历史 | ❌ | ❌ | 部分 | ✅ |
| 感悟/笔记空间 | ❌ | ❌ | ❌ | ✅ 核心设计 |
| 数据去向 | GitHub | 本地 | 第三方服务器 | **只在你电脑里** |

## 工作原理

```
LeetCode 页面
  │  interceptor.js（拦截 fetch/XHR：提交时捕获代码，主动轮询判题结果，检测首次击键）
  ▼
content.js ──POST──▶ 本地桥接服务 127.0.0.1:8763（leetlog_server.py）
                          │  查题目元数据、计时、计数、组装 Markdown
                          ▼
                你的 vault/LeetCode/0013-roman-to-integer.md
```

不抓取页面 DOM（LeetCode 改版就失效），而是拦截网络层：提交请求体里有你的代码，
判题接口里有 Accepted/运行时间/内存。结果轮询走双通道：经典 `/check/` 接口 +
GraphQL `submissionDetails` 兜底。**所有数据只在 `leetcode.com 页面 → 127.0.0.1 → 本地文件`
之间流动，无任何外部上传。** 直写文件夹模式下扩展跳过桥接、自己写笔记文件。

## 安装（约 2 分钟）

**只装浏览器扩展就够用**——它负责捕获做题过程，还能把 Markdown 笔记直接写进任意文件夹。
桥接（Obsidian 插件 / Python 服务）是可选升级，用于更深的集成。

### 1. 装浏览器扩展

**[Chrome Web Store 一键安装](https://chromewebstore.google.com/detail/nfdgchmjkdfhcmaglfhngmddhjdogdii)**
（Chrome / Edge / Arc / Brave 都能用）。Microsoft Edge Add-ons 商店版审核中。

<details>
<summary>想抢先用最新功能（手动加载）</summary>

商店每次更新有几天审核延迟。要用最新构建：`chrome://extensions` → 打开右上角
"开发者模式" → "加载已解压的扩展程序" → 选本仓库的 `extension/` 文件夹。
</details>

### 2. 选笔记写到哪里（三选一）

**方案 A —— 直写文件夹模式（最简单，零额外软件）**

在扩展的 **⚙️ 设置页**切换到**直写文件夹模式**，选一个文件夹——选 Obsidian vault 里的
`LeetCode/` 子文件夹效果最佳。扩展通过浏览器的 File System Access 授权直接写 Markdown
笔记，数据不离开本机。

**方案 B —— Obsidian 插件桥接（应用内通知、设置界面、旧笔记导入命令）**

Obsidian 里：**设置 → 第三方插件 → 浏览** → 搜索 **"LeetLog Bridge"** → 安装 → 启用
（或直接打开 [obsidian.md/plugins?id=leetlog-bridge](https://obsidian.md/plugins?id=leetlog-bridge)）。
端口、笔记文件夹、笔记模板语言（中文 / English）都在插件设置里，随 Obsidian 自动更新。

**方案 C —— Python 服务（不依赖浏览器文件夹授权，也不用 Obsidian）**

```bash
python3 server/leetlog_server.py
```

零依赖（Python 标准库）。首次运行自动探测你的 Obsidian vault 并生成配置
`~/.config/leetlog/config.json`（可改 vault 路径和笔记文件夹）。

桥接共用 8763 端口，最多开一个；直写文件夹模式两者都不需要。

<details>
<summary>开机自启（macOS launchd，可选）</summary>

```bash
cat > ~/Library/LaunchAgents/com.leetlog.server.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.leetlog.server</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string>
    <string>/绝对路径/leetlog/server/leetlog_server.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
EOF
launchctl load ~/Library/LaunchAgents/com.leetlog.server.plist
```
</details>

点扩展图标可以看到 🟢 状态、笔记位置、进行中的题。

## 生成的笔记

````markdown
---
id: 13
title: "Roman to Integer"
difficulty: Easy
tags: [Hash Table, Math, String]
attempts: 2
first_attempt: 2026-07-03
last_attempt: 2026-08-10
total_submissions: 5
total_ac: 2
total_runs: 9
---

# 13. Roman to Integer

> [!abstract]- 题面
> 罗马数字包含以下七种字符…… *（题面自动抓取，默认折叠——地铁上离线翻错题本也能看题）*

🎬 [Bilibili：罗马数字转整数 题解](…) · [YouTube: Roman to Integer](…)
*（题解视频搜索链接就在题面下方——力扣题带 Bilibili，两站都有 YouTube）*

## 第 1 次 · 2026-07-03 周五
⏱ 开始 10:34 → 首提 10:42 · 编码 8 分钟 → AC 10:49 · 提交 2 次 / 通过 1 次 · 运行 6 次 · 本题停留 15 分钟

### ✅ 通过代码 · python3 · 10:49（12 ms · 17.1 MB）
> [!success]- 代码
> ```python
> class Solution: ...
> ```

*（每次 AC 的标题保留在大纲里；代码本体在默认折叠的 callout 中，想看哪段点开哪段）*

### 💭 思路 & 感悟
### 📚 学到了什么（新函数 / 新数据结构 / 新套路）
### 🔀 多种解法
````

frontmatter 面向 Obsidian Properties / Dataview：一句查询就能做"错题本"、
"超过 30 天没碰的题"、"按标签的正确率"。

**开箱即用的仪表盘** —— 把 [`templates/`](templates/) 复制进 vault 即可：

- [`leetlog.base`](templates/leetlog.base) —— **Obsidian Bases** 版（1.9+ 官方核心功能，
  无需装插件、手机端可用）：错题本、间隔复习到期清单、30 天温故、按难度分组总表
- [`leetlog-dashboard.md`](templates/leetlog-dashboard.md) —— Dataview 版，含 Bases 暂时
  做不了的跨条目聚合（按标签正确率、总览段落）；需要 Dataview 插件
- [`leetlog-review-queue.md`](templates/leetlog-review-queue.md) —— Dataview 版间隔复习队列
  （按做题次数递进 1/3/7/14/30 天）

## 导入旧笔记

多年手写笔记都堆在一个大 markdown 里？一条命令拆成 LeetLog 的每题一文件：

**在 Obsidian 里**（LeetLog Bridge ≥ 0.3.8）：先打开旧笔记 → 命令面板 →
**Import legacy notes / 导入旧笔记** → 预览拆分计划 → 导入。或者用终端：

```bash
python3 server/lc_import.py 旧笔记.md --dry-run   # 先看拆分计划
python3 server/lc_import.py 旧笔记.md             # 执行（也可以传一个 .md 目录）
```

标题里有力扣/LeetCode 题目链接、题号（"13. Roman to Integer"、"LC146 …"、"#13"）
或恰好是题库英文标题，就被识别为一道题；到下一道题之间的内容全部归它——不存在的笔记
自动新建（题号/难度/标签补全），已有的 LeetLog 笔记则**追加**"📥 导入的旧笔记"段落，
已记录的做题数据一字不动。幂等：重复运行自动跳过已导入段落。识别不了的标题列出来
请你人工确认，绝不瞎猜。`--site cn` 让新建笔记的链接指向力扣。

## 可选云同步（内测）

本地优先仍是默认——**不主动开启就没有任何上传**。在扩展的 **⚙️ 设置页**用一次性配对码
连接 **LeetLog Cloud**（私有内测）后，在本地笔记之外还能得到：

- **自动错题本** —— 按"卡壳信号"（WA 率、调试强度、编码耗时）打分排序，每个分数可解释
- **间隔复习闪卡**（1/3/7/14/30 天）+ 到期邮件提醒；扩展徽章显示今天到期数
- **跨站识别**：同一道题在 leetcode.com 和 leetcode.cn 都做过？卡片和列表自动显示双语
  标题（Two Sum · 两数之和），并给出两个站的链接
- Anki 导出、个人数据仪表盘

云同步与本地桥接互相独立——可以只用其一，也可以都用或都不用。

## 计时语义

```
⏱ 开始 11:10 → 首提 11:18 · 编码 8 分钟 → AC 11:25 · 提交 2 次 / 通过 1 次 · 本题停留 20 分钟
   ↑首次击键     ↑首次提交    ↑击键→首提      ↑首个 Accepted                    ↑击键→离开页面/切换题目
```

- **编码时间** = 敲下第一个键 → 首次提交（真实的"写题"时长）
- **本题停留** = 敲下第一个键 → 关闭页面 / 切到另一道题（含提交后复盘、优化的时间）
- AC 后继续优化再提交：代码块追加、计数继续累积
- **Run**（不提交的测试运行）也会计数——当次显示在 ⏱ 行，累计写入 `total_runs`
  （调试强度也是复盘的重要信号）
- 离开后 6 小时内回来算同一次做题；超过则自动开"第 N+1 次"
- 🌐 笔记模板语言可选 中文 / English（Obsidian 插件设置里切换，Python 版改 config 的 `lang`）

## 会话规则

- 判题结果通过双通道获取：拦截到 submission_id 后主动轮询 `/check/` 接口，失效自动切换
  GraphQL `submissionDetails` 兜底（不依赖页面 DOM，不受 UI 改版影响）
- 服务重启不丢状态（会话存在 `~/.config/leetlog/state.json`）
- 服务没开时做题？事件进扩展的离线队列（图标徽章显示积压数），服务恢复后
  按原时间戳自动补录——计时不失真，一条不丢

## 已知边界

- 依赖 LeetCode 当前的提交接口（`/submit/` + `/submissions/detail/<id>/check/`）；
  接口大改需要更新 interceptor（比 DOM 稳定得多）
- Chrome 111+（content script MAIN world）
- leetcode.cn 已完整支持（端到端验证）；题面抓取在 cn 站自动优先中文翻译

## Roadmap

**v0.3（当前）**：扩展（0.6.x）+ 三种可互换的写入端——**LeetLog Bridge Obsidian 插件**
（已上线社区市场）、Python 服务、纯扩展直写文件夹模式；可选云同步私有内测中；
已在 leetcode.com 和 leetcode.cn 端到端验证；Chrome Web Store 已上线，Edge Add-ons 审核中。

**接下来**
- [x] **纯扩展模式**：设置页里选一次文件夹，扩展经 File System Access API 直接写
      Markdown——不装桥接、不装 Obsidian 也能用
- [x] 扩展侧离线队列：桥接不在线时把事件存 `chrome.storage`，恢复后按原时间戳补发，永不丢事件

**功能向**
- [x] Chrome Web Store —— [已上线](https://chromewebstore.google.com/detail/nfdgchmjkdfhcmaglfhngmddhjdogdii) · [x] Edge Add-ons —— 审核中 · [ ] Firefox 移植
- [x] 捕获题目描述存入笔记（默认折叠 callout，离线可读；leetcode.cn 自动取中文题面）
- [x] Dataview 索引页模板 —— 见 [`templates/`](templates/)
- [x] Run（不提交的测试运行）次数统计（`total_runs` + 当次 ⏱ 行）
- [x] 题面下方的题解视频链接（YouTube；力扣题另有 Bilibili）
- [x] 可选云同步：自动错题本、SRS 闪卡、扩展徽章到期数（内测）
- [x] 跨站同题双语标题（.com 和 .cn 都做过时自动启用）
- [x] `lc import`：把旧的手写笔记拆分导入（`server/lc_import.py`）

## ❤️ 支持

LeetLog 免费、本地优先，并将一直如此。如果它帮你省了时间：

- ⭐ **给仓库点个 Star** —— 零成本，帮更多刷题人看到它
- 💖 **[GitHub Sponsors 赞助](https://github.com/sponsors/YzYhhhstudy)** —— 让 Roadmap 跑得更快

[![Star History Chart](docs/star-history.svg)](https://star-history.com/#YzYhhhstudy/leetlog&Date)

## License

MIT
