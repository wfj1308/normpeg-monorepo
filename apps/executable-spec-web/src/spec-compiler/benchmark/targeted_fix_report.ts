import type { TargetedFixComparison } from "./targeted_fix_compare.ts";

function format(value: number): string {
  return value.toFixed(4);
}

export function buildTargetedFixReport(comparisons: TargetedFixComparison[]): string {
  const lines: string[] = [];
  lines.push("Targeted Fix Report");
  lines.push("");

  if (comparisons.length === 0) {
    lines.push("- no targeted fix comparisons");
    return lines.join("\n");
  }

  for (const item of comparisons) {
    lines.push(`Case: ${item.caseId}`);
    lines.push(`- before: ${format(item.beforeScore)}`);
    lines.push(`- after: ${format(item.afterScore)}`);
    lines.push(`- delta: ${item.delta >= 0 ? "+" : ""}${format(item.delta)}`);
    lines.push("- improved:");
    if (item.improvedAreas.length === 0) {
      lines.push("  - none");
    } else {
      for (const area of item.improvedAreas) {
        lines.push(`  - ${area}`);
      }
    }
    lines.push("- remaining:");
    if (item.remainingProblems.length === 0) {
      lines.push("  - none");
    } else {
      for (const problem of item.remainingProblems) {
        lines.push(`  - ${problem}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

