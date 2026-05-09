import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExecutionLog, ExecutionLogSink } from "../../src/platform/runtime/execution-log.ts";

const DEFAULT_EXECUTION_LOG_DIR = fileURLToPath(new URL("../../.execution-logs", import.meta.url));

function normalizeExecutionId(executionId: string): string {
  const normalized = executionId.trim();
  if (!normalized) {
    return "unknown_execution";
  }
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class LocalExecutionLogFileStore implements ExecutionLogSink {
  private readonly directory: string;

  constructor(directory?: string) {
    this.directory = resolve(directory ?? DEFAULT_EXECUTION_LOG_DIR);
    mkdirSync(this.directory, { recursive: true });
  }

  persist(log: ExecutionLog): void {
    const fileName = `${normalizeExecutionId(log.executionId)}.json`;
    const filePath = resolve(this.directory, fileName);
    writeFileSync(filePath, JSON.stringify(log, null, 2), "utf8");
  }
}
