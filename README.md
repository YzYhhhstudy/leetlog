<div align="right">English | <a href="./README.zh-CN.md">简体中文</a></div>

# 📗 LeetLog

[![Release](https://img.shields.io/github/v/release/YzYhhhstudy/leetlog?label=release&color=2ea44f)](https://github.com/YzYhhhstudy/leetlog/releases)
[![Obsidian plugin](https://img.shields.io/badge/Obsidian-LeetLog%20Bridge-7c3aed?logo=obsidian&logoColor=white)](https://obsidian.md/plugins?id=leetlog-bridge)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-in%20review-f4b400?logo=googlechrome&logoColor=white)](https://github.com/YzYhhhstudy/leetlog/releases)
[![License: MIT](https://img.shields.io/github/license/YzYhhhstudy/leetlog?color=blue)](LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/YzYhhhstudy)

**Auto-capture your LeetCode grind into your local Obsidian vault — you only write the insights.**

![demo](docs/demo.svg)

The moment you **type your first keystroke** on a problem, the timer starts. Every submission is
counted. The moment you get **Accepted**, your code, runtime stats and timing land in a structured
Obsidian note. Revisiting an old problem? The same note accumulates every attempt — see exactly
what past-you was thinking.

## Why not existing tools?

| | LeetHub family | Timer extensions | LeetPlug | **LeetLog** |
|---|---|---|---|---|
| Archive accepted code | ✅ pushes to GitHub | ❌ | ❌ | ✅ into local notes |
| Auto timing (from first keystroke) | ❌ | ✅ | ✅ | ✅ |
| Submission / AC counts | ❌ | ❌ | ✅ | ✅ |
| Re-attempt history | ❌ | ❌ | partial | ✅ |
| Space for your own insights | ❌ | ❌ | ❌ | ✅ core design |
| Where your data goes | GitHub | local | third-party server | **never leaves your machine** |

## How it works

```
LeetCode page
  │  interceptor.js — hooks fetch/XHR: captures your code on submit,
  │                   polls the judge result; detects first keystroke
  ▼
content.js ──POST──▶ local bridge  127.0.0.1:8763  (leetlog_server.py)
                          │  resolves problem metadata, times the session,
                          │  counts submissions, assembles Markdown
                          ▼
            your-vault/LeetCode/0013-roman-to-integer.md
```

No DOM scraping (breaks on every UI redesign). LeetLog intercepts the network layer instead:
the submit request already contains your code; the judge endpoint returns Accepted/runtime/memory.
Result polling is dual-channel: the classic `/check/` endpoint, with GraphQL `submissionDetails`
as fallback. **Everything flows `leetcode.com page → 127.0.0.1 → local files`. Nothing is uploaded.**

## Install (~2 minutes)

LeetLog is two pieces: the **browser extension** (captures your practice) and a **bridge**
on your machine (writes the notes). Pick **one** bridge — they share port 8763.

### 1. Install a bridge (pick one)

**Option A — Obsidian plugin (recommended, zero terminal)**

In Obsidian: **Settings → Community plugins → Browse** → search **"LeetLog Bridge"** →
Install → Enable — or open [obsidian.md/plugins?id=leetlog-bridge](https://obsidian.md/plugins?id=leetlog-bridge).
Port, notes folder and note template language (English / 中文) live in the plugin settings.
Auto-updates through Obsidian.

**Option B — Python server (works without Obsidian)**

```bash
python3 server/leetlog_server.py
```

Zero dependencies (Python stdlib). First run auto-detects your Obsidian vault and writes
`~/.config/leetlog/config.json` (edit vault path / note folder there).

<details>
<summary>Auto-start on login (macOS launchd, optional)</summary>

```bash
cat > ~/Library/LaunchAgents/com.leetlog.server.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.leetlog.server</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string>
    <string>/absolute/path/to/leetlog/server/leetlog_server.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
EOF
launchctl load ~/Library/LaunchAgents/com.leetlog.server.plist
```
</details>

### 2. Install the browser extension

**The Chrome Web Store listing is in review** — a one-click install link lands here once
it's approved. Until then, load it unpacked:

Chrome / Edge / Arc: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select the `extension/` folder.

Click the extension icon anytime to see 🟢 bridge status, note location, and active problems.

## The generated note

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

> [!abstract]- Problem
> Roman numerals are represented by seven different symbols… *(statement auto-captured
> into a folded callout — read your mistake notebook offline, on the subway)*

## Attempt 1 · 2026-07-03 Fri
⏱ start 10:34 → first submit 10:42 · coding 8 min → AC 10:49 · 2 submits / 1 AC · 6 runs · 15 min on problem

> [!success]- ✅ Accepted · python3 · 10:49 (12 ms · 17.1 MB)
> ```python
> class Solution: ...
> ```
> *(each AC lands in its own folded callout — expand only what you want to reread)*

### 💭 Thoughts & insights
### 📚 What I learned (new functions / data structures / patterns)
### 🔀 Alternative solutions
````

The frontmatter is designed for Obsidian Properties / Dataview — one query gives you a
"mistake notebook", "problems untouched for 30+ days", or per-tag accuracy.

**Ready-made Dataview templates** — copy [`templates/`](templates/) into your vault
(requires the Dataview plugin):

- [`leetlog-dashboard.md`](templates/leetlog-dashboard.md) — totals, mistake notebook,
  rusty problems (30+ days), per-tag accuracy
- [`leetlog-review-queue.md`](templates/leetlog-review-queue.md) — spaced-repetition queue
  (1/3/7/14/30-day intervals stepped by attempt count)

## Timing semantics

```
⏱ start 11:10 → first submit 11:18 · coding 8 min → AC 11:25 · 2 submits / 1 AC · 20 min on problem
   ↑ first keystroke   ↑ first submit   ↑ keystroke→submit   ↑ first Accepted     ↑ keystroke→leave/switch
```

- **Coding time** = first keystroke → first submit (your real "solving" time)
- **Time on problem** = first keystroke → closing the page / switching to another problem
  (includes post-submit review & optimization)
- Keep optimizing after AC: code blocks append, counters accumulate
- **Run** (non-submit) executions are counted too — per-attempt in the ⏱ line, cumulative
  in `total_runs` (debugging intensity is a review signal)
- Coming back within 6 hours counts as the same attempt; later opens "Attempt N+1"
- 🌐 Note template language: English or 中文 (Obsidian plugin setting / `lang` in the Python config)

## Session rules

- Judge results come through two channels: after capturing the `submission_id`, the extension
  polls `/check/`, falling back to GraphQL `submissionDetails` — no DOM dependency
- Server restarts don't lose state (`~/.config/leetlog/state.json`)
- Solving while the bridge is down? Events are buffered in the extension's offline queue
  (toolbar badge shows the count) and replayed with their original timestamps once the
  bridge is back — timing stays accurate, nothing is lost

## Known limits

- Relies on LeetCode's current submit endpoints (`/submit/` + `/submissions/detail/<id>/check/`);
  far more stable than DOM scraping, but an API overhaul would need an interceptor update
- Chrome 111+ (content script MAIN world)
- leetcode.cn is fully supported (verified end-to-end); the statement capture prefers the Chinese translation there

## Roadmap

**v0.2 (current)**: extension + two interchangeable bridges — the **LeetLog Bridge Obsidian
plugin** (live in the community marketplace) and the Python server. Verified end-to-end on
production LeetCode. Chrome Web Store listing in review.

**Next**
- [ ] **Extension-only mode**: File System Access API — pick your vault folder
      once, the extension writes Markdown directly, Obsidian not even required
- [x] Offline queue in the extension: buffer events in `chrome.storage` when the bridge is
      down, replay on reconnect (original timestamps preserved) — never lose a session

**Features**
- [x] Chrome Web Store — submitted, in review · [ ] Firefox port
- [x] Capture the problem statement into the note as a folded callout (offline reading)
- [x] Dataview index templates — see [`templates/`](templates/)
- [x] Count Run (non-submit) executions (`total_runs` + per-attempt ⏱ line)
- [ ] `lc import`: split legacy hand-written notes into per-problem files

## ❤️ Support

LeetLog is free and local-first, and will stay that way. If it saves you time:

- ⭐ **Star this repo** — costs nothing, helps other grinders find it
- 💖 **[Sponsor on GitHub](https://github.com/sponsors/YzYhhhstudy)** — keeps the roadmap moving

[![Star History Chart](docs/star-history.svg)](https://star-history.com/#YzYhhhstudy/leetlog&Date)

## License

MIT
