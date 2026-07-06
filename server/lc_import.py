#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lc import — 把旧的手写刷题笔记拆分成 LeetLog 的每题一文件

  python3 server/lc_import.py 旧笔记.md            # 拆分单个文件
  python3 server/lc_import.py 旧笔记目录/           # 目录下所有 .md
  python3 server/lc_import.py 旧笔记.md --dry-run   # 只看拆分计划，不写文件

识别规则（任一命中即认为"这个标题是一道题"，从此处切分到下一道题）：
  1. 标题或其后 3 行内含 leetcode.com/leetcode.cn 的题目链接 → 直接取 slug
  2. 标题含题号：如 "13. Roman to Integer"、"LC13 罗马数字"、"#13"、"题13"
  3. 标题恰好是题库里的英文标题（大小写不敏感）

写入规则：
  - 目标文件不存在 → 按 LeetLog 模板建笔记（题号/标题/难度/标签自动补全），内容放
    "📥 导入的旧笔记" 段落
  - 目标文件已存在（LeetLog 已在记录这道题）→ 追加同名段落，原有内容一字不动
  - 幂等：每段导入内容带指纹注释，重复运行自动跳过已导入的段落

不认识的标题原样保留在报告里，绝不猜测；识别不了的内容一律不动源文件。
"""
import argparse
import hashlib
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from leetlog_server import (  # noqa: E402
    get_strings, load_config, load_problem_cache, new_note, note_path, resolve_problem,
)

URL_RE = re.compile(r"leetcode\.(?:com|cn)/problems/([a-z0-9-]+)")
# "13. Two Sum" / "LC13" / "#13：两数之和" / "题目 13" —— 题号是最可靠的锚点
NUM_RE = re.compile(r"(?:^|[\s#（(])(?:LC|LeetCode|力扣|题目?)?\s*#?(\d{1,4})\s*[.、·:：）)\s]", re.I)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")

IMPORT_HEADER = {"zh": "📥 导入的旧笔记", "en": "📥 Imported legacy notes"}


def build_index(cache):
    by_id, by_title = {}, {}
    for slug, meta in cache.items():
        by_id[int(meta["id"])] = slug
        by_title[meta["title"].lower()] = slug
    return by_id, by_title


def identify(heading, body_head, by_id, by_title, cache):
    """标题（+段落前几行）→ slug 或 None"""
    for text in (heading, body_head):
        m = URL_RE.search(text)
        if m and m.group(1) in cache:
            return m.group(1)
    m = NUM_RE.search(heading + " ")
    if m and int(m.group(1)) in by_id:
        return by_id[int(m.group(1))]
    plain = re.sub(r"[*_`\[\]]", "", heading).strip().lower()
    return by_title.get(plain)


def split_legacy(text, by_id, by_title, cache):
    """→ (preamble, [(slug, heading, content)], [unmatched_headings])"""
    lines = text.splitlines()
    sections, unmatched = [], []
    cur_slug, cur_head, cur_buf, preamble = None, None, [], []
    for i, line in enumerate(lines):
        m = HEADING_RE.match(line)
        slug = None
        if m:
            body_head = "\n".join(lines[i + 1:i + 4])
            slug = identify(m.group(2), body_head, by_id, by_title, cache)
            if slug is None and NUM_RE.search(m.group(2) + " "):
                unmatched.append(m.group(2))  # 长得像题目但题库里查不到，进报告
        if slug:
            if cur_slug:
                sections.append((cur_slug, cur_head, "\n".join(cur_buf).strip()))
            elif cur_buf:
                preamble = cur_buf
            cur_slug, cur_head, cur_buf = slug, m.group(2), []
        else:
            cur_buf.append(line)
    if cur_slug:
        sections.append((cur_slug, cur_head, "\n".join(cur_buf).strip()))
    elif cur_buf:
        preamble = cur_buf
    return "\n".join(preamble).strip(), sections, unmatched


def import_block(content, src_name, header, fp):
    # 指纹用 %% %%（Obsidian 原生注释）：实时预览/阅读模式都不可见；HTML 注释会显示出来
    today = datetime.now().strftime("%Y-%m-%d")
    return f"\n\n## {header} · {today} · {src_name}\n%% lc-import: {fp} %%\n\n{content}\n"


def run(paths, dry_run=False, site="com"):
    cfg = load_config()
    S = get_strings(cfg)
    header = IMPORT_HEADER.get(cfg.get("lang", "zh"), IMPORT_HEADER["zh"])
    cache = load_problem_cache()
    by_id, by_title = build_index(cache)

    files = []
    for p in paths:
        p = Path(p).expanduser()
        if p.is_dir():
            files += sorted(p.glob("*.md"))
        elif p.exists():
            files.append(p)
        else:
            sys.exit(f"❌ 找不到 {p}")

    created = appended = skipped = 0
    all_unmatched = []
    for f in files:
        text = f.read_text(encoding="utf-8")
        preamble, sections, unmatched = split_legacy(text, by_id, by_title, cache)
        all_unmatched += [f"{f.name}: {h}" for h in unmatched]
        if preamble:
            print(f"ℹ️  {f.name}: 第一道题之前的 {len(preamble.splitlines())} 行前言不会被导入")
        for slug, heading, content in sections:
            if not content:
                continue
            fp = hashlib.sha1(content.encode()).hexdigest()[:12]
            meta = cache[slug]
            prob = {"id": int(meta["id"]), "title": meta["title"],
                    "difficulty": meta["difficulty"], "tags": [],
                    "url": f"https://leetcode.{site}/problems/{slug}/description/"}
            target = Path(cfg["vault"]) / cfg["folder"] / f"{prob['id']:04d}-{slug}.md"
            if target.exists() and f"lc-import: {fp}" in target.read_text(encoding="utf-8"):
                skipped += 1
                continue
            action = "追加" if target.exists() else "新建"
            print(f"{'🔍' if dry_run else '✅'} {prob['id']:>4}. {meta['title']}  ←  {f.name}「{heading}」 → {action} {target.name}")
            if dry_run:
                continue
            if target.exists():
                target.write_text(target.read_text(encoding="utf-8").rstrip() +
                                  import_block(content, f.name, header, fp) , encoding="utf-8")
                appended += 1
            else:
                prob = resolve_problem(slug)  # 建新笔记时联网补难度/标签，失败自动降级缓存
                if site == "cn":
                    prob["url"] = f"https://leetcode.cn/problems/{slug}/description/"
                note = new_note(prob, datetime.now(), S).rstrip()
                note_path(cfg, prob, slug).write_text(
                    note + import_block(content, f.name, header, fp), encoding="utf-8")
                created += 1

    print(f"\n📊 新建 {created} · 追加 {appended} · 已导入跳过 {skipped}"
          + (f" · 待人工确认 {len(all_unmatched)}" if all_unmatched else ""))
    if all_unmatched:
        print("⚠️  这些标题像题目但没匹配到题库（题号不存在或纯中文标题无题号），请手动处理：")
        for h in all_unmatched:
            print(f"   - {h}")
    if dry_run:
        print("（dry-run：以上只是计划，没有写任何文件）")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="把旧的手写刷题笔记拆分成 LeetLog 每题一文件")
    ap.add_argument("paths", nargs="+", help="旧笔记 .md 文件或目录")
    ap.add_argument("--dry-run", action="store_true", help="只打印拆分计划，不写文件")
    ap.add_argument("--site", choices=["com", "cn"], default="com", help="新建笔记的题目链接指向哪个站（默认 com）")
    args = ap.parse_args()
    run(args.paths, dry_run=args.dry_run, site=args.site)
