import type { CSDTask, CSDSchedulerInput } from "../../types/CSDSchedulerInput.ts";
import { evaluateConstraintExpression } from "./constraintExpression.ts";

function isCompactionTask(spuId: string): boolean {
  return spuId.toLowerCase().includes("compaction");
}

function normalize(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseHourMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function isWithinAnyWorkHour(currentTime: string, ranges: string[]): boolean {
  const value = String(currentTime || "").trim();
  if (!value) {
    return true;
  }
  const timePart = value.includes("T")
    ? value.split("T")[1]?.slice(0, 5) ?? ""
    : value.slice(0, 5);
  const minuteOfDay = parseHourMinute(timePart);
  if (minuteOfDay === null) {
    return true;
  }
  for (const range of ranges) {
    const parts = String(range || "").split("-");
    if (parts.length !== 2) {
      continue;
    }
    const start = parseHourMinute(parts[0]);
    const end = parseHourMinute(parts[1]);
    if (start === null || end === null) {
      continue;
    }
    if (minuteOfDay >= start && minuteOfDay <= end) {
      return true;
    }
  }
  return false;
}

function extractTimeOfDay(currentTime: string): string {
  const value = String(currentTime || "").trim();
  if (!value) {
    return "";
  }
  return value.includes("T")
    ? value.split("T")[1]?.slice(0, 5) ?? ""
    : value.slice(0, 5);
}

function looksLikePureHourRange(expression: string): boolean {
  const text = String(expression || "").trim();
  return /^[0-2]?\d:[0-5]\d(\s*-\s*[0-2]?\d:[0-5]\d)(\s*,\s*[0-2]?\d:[0-5]\d\s*-\s*[0-2]?\d:[0-5]\d)*$/.test(text);
}

function splitHourRanges(expression: string): string[] {
  return String(expression || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function checkTime(
  task: CSDTask,
  timeConstraints: CSDSchedulerInput["timeConstraints"],
  normConstraints?: CSDSchedulerInput["normConstraints"],
): { ok: boolean; reason: string } {
  const weather = normalize(timeConstraints.weather);
  const season = normalize(timeConstraints.season);
  const currentTime = String(timeConstraints.currentTime ?? "").trim();
  const timeOfDay = extractTimeOfDay(currentTime);

  if (weather === "rain" && isCompactionTask(task.spuId)) {
    return { ok: false, reason: "time constraint blocked: rain disables compaction" };
  }

  const rules = normConstraints?.timeWindowConstraints ?? [];
  for (const rule of rules) {
    const expression = String(rule.expression || "").trim();
    if (!expression) {
      continue;
    }
    if (rule.type === "work_hour" && looksLikePureHourRange(expression)) {
      if (currentTime && !isWithinAnyWorkHour(currentTime, splitHourRanges(expression))) {
        return { ok: false, reason: `time constraint blocked: work hour rule (${rule.expression})` };
      }
      continue;
    }

    const passed = evaluateConstraintExpression(expression, {
      weather,
      season,
      time: timeOfDay,
      currentTime: timeOfDay,
      current_time: timeOfDay,
      task: task.spuId.toLowerCase(),
    });
    if (!passed) {
      return { ok: false, reason: `time constraint blocked: ${rule.type} rule (${rule.expression})` };
    }
  }

  const workHourRanges = [
    ...(timeConstraints.workHours ?? []),
    ...rules
      .filter((rule) => rule.type === "work_hour")
      .map((rule) => String(rule.expression || "").trim())
      .filter((ruleExpression) => ruleExpression && looksLikePureHourRange(ruleExpression)),
  ];
  if (workHourRanges.length > 0) {
    const currentTime = String(timeConstraints.currentTime ?? "").trim();
    if (currentTime && !isWithinAnyWorkHour(currentTime, workHourRanges)) {
      return { ok: false, reason: "time constraint blocked: outside work hour window" };
    }
  }

  return { ok: true, reason: "time constraint satisfied" };
}
