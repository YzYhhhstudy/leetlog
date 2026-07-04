<div align="right">English | <a href="./README.zh-CN.md">简体中文</a></div>

# 📗 LeetLog

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

## Install (two steps)

### 1. Start the local bridge

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

### 2. Load the browser extension

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
---

# 13. Roman to Integer

## Attempt 1 · 2026-07-03 Fri
⏱ start 10:34 → first submit 10:42 · coding 8 min → AC 10:49 · 2 submits / 1 AC · 15 min on problem

### ✅ Accepted · python3 · 10:49 (12 ms · 17.1 MB)
```python
class Solution: ...
```

### 💭 Thoughts & insights
### 📚 What I learned (new functions / data structures / patterns)
### 🔀 Alternative solutions
````

The frontmatter is designed for Obsidian Properties / Dataview — one query gives you a
"mistake notebook", "problems untouched for 30+ days", or per-tag accuracy.

## Timing semantics

```
⏱ start 11:10 → first submit 11:18 · coding 8 min → AC 11:25 · 2 submits / 1 AC · 20 min on problem
   ↑ first keystroke   ↑ first submit   ↑ keystroke→submit   ↑ first Accepted     ↑ keystroke→leave/switch
```

- **Coding time** = first keystroke → first submit (your real "solving" time)
- **Time on problem** = first keystroke → closing the page / switching to another problem
  (includes post-submit review & optimization)
- Keep optimizing after AC: code blocks append, counters accumulate
- Coming back within 6 hours counts as the same attempt; later opens "Attempt N+1"
- 🌐 Note template language: English or 中文 (Obsidian plugin setting / `lang` in the Python config)

## Session rules

- Judge results come through two channels: after capturing the `submission_id`, the extension
  polls `/check/`, falling back to GraphQL `submissionDetails` — no DOM dependency
- Server restarts don't lose state (`~/.config/leetlog/state.json`)
- Solving while the bridge is down? Events are dropped (the browser console shows a `[LeetLog]`
  warning). The sibling CLI project [lc-notes](../lc-notes) can backfill via `lc sync`

## Known limits

- Relies on LeetCode's current submit endpoints (`/submit/` + `/submissions/detail/<id>/check/`);
  far more stable than DOM scraping, but an API overhaul would need an interceptor update
- Chrome 111+ (content script MAIN world)
- leetcode.cn URL patterns are included but lightly tested

## Roadmap

**v1.0 (current)**: extension + Python bridge, verified end-to-end on production LeetCode

**v2.0 — kill the "start a server" step (two tracks)**
- [ ] **Obsidian plugin as the bridge (preferred)**: port the bridge to a TypeScript Obsidian
      community plugin (plugins run in Electron and can listen on localhost — precedent:
      the Local REST API plugin). UX becomes: install Chrome extension + install Obsidian
      plugin. No terminal, no Python, auto-updates via the plugin marketplace
- [ ] **Extension-only mode (alternative)**: File System Access API — pick your vault folder
      once, the extension writes Markdown directly, Obsidian not even required
- [ ] Offline queue in the extension: buffer events in `chrome.storage` when the bridge is
      down, replay on reconnect — never lose a session

**Features**
- [ ] Package for Chrome Web Store / Firefox
- [ ] Capture the problem statement into the note (offline reading)
- [ ] Dataview index templates (mistake notebook / spaced-repetition reminders)
- [ ] `lc import`: split legacy hand-written notes into per-problem files
- [ ] Count Run (non-submit) executions

## ❤️ Support

LeetLog is free and local-first, and will stay that way. If it saves you time,
consider [sponsoring on GitHub](https://github.com/sponsors/YzYhhhstudy) — it keeps the
roadmap moving.

## License

MIT
