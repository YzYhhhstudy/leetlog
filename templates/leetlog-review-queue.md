# 🔁 Review Queue · 间隔复习队列

> Spaced repetition over your solved problems: review intervals of **1 → 3 → 7 → 14 → 30 days**,
> stepped by how many times you've attempted the problem. A problem is **due** once
> `last_attempt + interval(attempts)` is in the past. Requires the **Dataview** plugin with
> *JavaScript queries* enabled; change `"LeetCode"` if you use a different note folder.
>
> 基于做题次数的间隔复习：第 N 次做完后，间隔 1/3/7/14/30 天到期。到期即出现在下面的队列里。

```dataviewjs
const INTERVALS = [1, 3, 7, 14, 30]; // days, indexed by (attempts - 1), capped at 30
const today = dv.date("today");
const due = dv.pages('"LeetCode"')
  .where(p => p.id && (p.total_ac ?? 0) > 0 && p.last_attempt?.plus)
  .map(p => {
    const iv = INTERVALS[Math.min((p.attempts ?? 1) - 1, INTERVALS.length - 1)];
    return { p, iv, due: p.last_attempt.plus({ days: iv }) };
  })
  .where(x => x.due <= today)
  .sort(x => x.due, "asc");
dv.table(
  ["Problem", "Difficulty", "Attempts", "Last try", "Interval", "Due"],
  due.map(x => [
    x.p.file.link, x.p.difficulty, x.p.attempts,
    x.p.last_attempt.toFormat("yyyy-MM-dd"), `${x.iv}d`, x.due.toFormat("yyyy-MM-dd"),
  ])
);
dv.paragraph(due.length ? `**${due.length} due** — oldest first · 从最久未复习的开始` : "🎉 Nothing due today · 今日无待复习");
```
