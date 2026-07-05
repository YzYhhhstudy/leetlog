# 📗 LeetLog Dashboard

> Requires the **Dataview** community plugin (enable *JavaScript queries* in its settings for
> the tag table). Notes are read from the `LeetCode/` folder — if you changed the note folder
> in your LeetLog settings, replace `"LeetCode"` in every query below.
>
> 需要 **Dataview** 插件（标签统计表需在其设置里开启 JavaScript queries）。
> 如果你的笔记文件夹不是 `LeetCode/`，把下面查询里的 `"LeetCode"` 换成你的文件夹名。

## 🧮 Totals · 总览

```dataviewjs
const pages = dv.pages('"LeetCode"').where(p => p.id);
const sum = (f) => pages.array().reduce((s, x) => s + (x[f] ?? 0), 0);
const by = (d) => pages.where(x => x.difficulty === d).length;
dv.paragraph(
  `**${pages.length}** problems（🟢 ${by("Easy")} Easy / 🟡 ${by("Medium")} Medium / 🔴 ${by("Hard")} Hard）` +
  ` · ${sum("total_submissions")} submissions · ${sum("total_ac")} AC · ${sum("total_runs")} runs`
);
```

## 🔴 Mistake notebook · 错题本 — attempted but never accepted

```dataview
TABLE WITHOUT ID file.link AS Problem, difficulty AS Difficulty,
      total_submissions AS Submits, last_attempt AS "Last try"
FROM "LeetCode"
WHERE id AND total_ac = 0
SORT last_attempt DESC
```

## 🕸 Getting rusty · 温故 — accepted, but untouched for 30+ days

```dataview
TABLE WITHOUT ID file.link AS Problem, difficulty AS Difficulty,
      attempts AS Attempts, last_attempt AS "Last try"
FROM "LeetCode"
WHERE id AND total_ac > 0 AND date(last_attempt) <= date(today) - dur(30 days)
SORT last_attempt ASC
LIMIT 30
```

## 📊 Accuracy by tag · 按标签统计正确率

```dataviewjs
const pages = dv.pages('"LeetCode"').where(p => p.id);
const agg = {};
for (const p of pages) {
  for (const t of (p.tags ?? [])) {
    const a = (agg[t] ??= { n: 0, sub: 0, ac: 0 });
    a.n++;
    a.sub += p.total_submissions ?? 0;
    a.ac += p.total_ac ?? 0;
  }
}
dv.table(
  ["Tag", "Problems", "Submits", "AC", "Accuracy"],
  Object.entries(agg)
    .sort((x, y) => y[1].n - x[1].n)
    .map(([t, a]) => [t, a.n, a.sub, a.ac, a.sub ? Math.round((100 * a.ac) / a.sub) + "%" : "—"])
);
```
