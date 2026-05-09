import fs from "node:fs";
import path from "node:path";

export interface ExtractionBenchmarkCase {
  caseId: string;
  fileName: string;
  category: "compaction" | "thickness" | "deflection" | "other";
  rawText: string;
  expected: {
    primaryClause?: string | null;
    formulas?: Array<{
      leftVar: string | null;
      expression?: string | null;
      completeness: "full" | "partial";
    }>;
    inputs?: Array<{
      name: string;
      unit?: string;
      label?: string;
    }>;
    rules?: Array<{
      field: string;
      operator: string;
      value: string | number;
    }>;
  };
}

export function loadExtractionBenchmarkCase(filePath: string): ExtractionBenchmarkCase {
  const absolute = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(absolute, "utf8")) as ExtractionBenchmarkCase;
}

export function loadExtractionBenchmarkCases(dirPath: string): ExtractionBenchmarkCase[] {
  const absoluteDir = path.resolve(dirPath);
  const files = fs
    .readdirSync(absoluteDir)
    .filter((file) => file.endsWith("_case.json"))
    .sort((a, b) => a.localeCompare(b, "en"));
  return files.map((file) => loadExtractionBenchmarkCase(path.join(absoluteDir, file)));
}
