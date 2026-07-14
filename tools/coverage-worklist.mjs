// Reads coverage/coverage-summary.json (written by `pnpm test:coverage`) and prints
// the totals plus the remaining files ranked by uncovered lines — the loop's queue.
// Run: node tools/coverage-worklist.mjs
import { readFileSync } from "node:fs";

const summary = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));
const { total, ...files } = summary;

console.log("=== TOTALS ===");
for (const k of ["statements", "branches", "functions", "lines"]) {
  const m = total[k];
  console.log(`  ${k.padEnd(11)} ${String(m.pct + "%").padStart(7)}  (${m.covered}/${m.total})`);
}

const rel = (p) => p.replace(/^.*coverage-100[\\/]/, "").replaceAll("\\", "/");
const remaining = Object.entries(files)
  .map(([path, m]) => ({
    file: rel(path),
    missLines: m.lines.total - m.lines.covered,
    missBranch: m.branches.total - m.branches.covered,
    missFns: m.functions.total - m.functions.covered,
    pct: m.lines.pct,
  }))
  .filter((f) => f.missLines > 0 || f.missBranch > 0 || f.missFns > 0)
  .sort((a, b) => b.missLines - a.missLines || b.missBranch - a.missBranch);

const done = Object.keys(files).length - remaining.length;
console.log(`\n=== AT 100%: ${done}/${Object.keys(files).length} files ===`);
console.log(
  `=== WORKLIST: ${remaining.length} files | ${remaining.reduce((a, b) => a + b.missLines, 0)} uncovered lines, ` +
    `${remaining.reduce((a, b) => a + b.missBranch, 0)} branches, ${remaining.reduce((a, b) => a + b.missFns, 0)} fns ===`,
);
remaining.forEach((f, i) => {
  const n = String(i + 1).padStart(3);
  console.log(
    `${n}. ${String(f.missLines).padStart(4)}L ${String(f.missBranch).padStart(3)}B ${String(f.missFns).padStart(3)}F  ` +
      `${String(f.pct + "%").padStart(7)}  ${f.file}`,
  );
});
