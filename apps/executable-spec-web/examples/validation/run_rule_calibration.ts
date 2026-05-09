import fs from "node:fs";
import path from "node:path";

import {
  buildRuleConfigFromCalibrationWithNotes,
  type RuleAdjustmentNote,
  rerunValidationWithNewRules,
  type ValidationRerunSample,
} from "../../src/spec-compiler/calibration/index.ts";

interface StoredValidationReport {
  calibration: {
    machineDraft: {
      total: number;
      blocked: number;
      warning: number;
      ready: number;
      commonBlockingReasons: string[];
      commonWarningReasons: string[];
      ruleAdjustmentSuggestions: string[];
    };
    manualReviewed: {
      total: number;
      blocked: number;
      warning: number;
      ready: number;
      commonBlockingReasons: string[];
      commonWarningReasons: string[];
      ruleAdjustmentSuggestions: string[];
    };
  };
  cases: Array<{
    case: string;
    machine: unknown;
    manual: unknown;
  }>;
}

function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function dedupeNotes(notes: RuleAdjustmentNote[]): RuleAdjustmentNote[] {
  const seen = new Set<string>();
  const output: RuleAdjustmentNote[] = [];
  for (const note of notes) {
    const key = `${note.area}|${note.before}|${note.after}|${note.reason}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(note);
  }
  return output;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const validationReportPath = path.resolve(root, "apps/executable-spec-web/examples/validation/real_pdf_validation_report.json");
  const raw = readUtf8(validationReportPath);
  const report = JSON.parse(raw) as StoredValidationReport;

  const firstPass = buildRuleConfigFromCalibrationWithNotes(report.calibration.machineDraft);
  const secondPass = buildRuleConfigFromCalibrationWithNotes(report.calibration.manualReviewed, firstPass.config);
  const calibratedConfig = secondPass.config;
  const notes = dedupeNotes([...firstPass.notes, ...secondPass.notes]);

  const manualCasesByName = new Map<string, unknown>();
  for (const item of report.cases) {
    manualCasesByName.set(item.case, item.manual);
  }

  const samples: ValidationRerunSample[] = [
    {
      file: path.resolve(root, "uploads/normref/20260415122744-c0a274e3-1_JTG_T_3610-2019____________.pdf"),
      fileName: "compaction.pdf",
      beforeResult: manualCasesByName.get("compaction") as any,
      options: {
        editedMarkdown: readUtf8(path.resolve(root, "apps/executable-spec-web/examples/validation/compaction_case.md")),
        reviewedWarnings: [{ code: "OCR_USED", message: "OCR was used for extraction" }],
        confirmClauseMode: "all",
        confirmWarning: true,
      },
    },
    {
      file: path.resolve(root, "translation-bot/runtime/uploads/5a53c366-68fc-49bf-bfe0-e083fa2ff6dc-JTG_5220_2020_.pdf"),
      fileName: "thickness.pdf",
      beforeResult: manualCasesByName.get("thickness") as any,
      options: {
        editedMarkdown: readUtf8(path.resolve(root, "apps/executable-spec-web/examples/validation/thickness_case.md")),
        reviewedWarnings: [
          { code: "INPUTS_INFERRED", message: "Input params inferred from text" },
          { code: "RULES_INFERRED", message: "Rules inferred from text" },
          { code: "OCR_TEXT_NOISY", message: "OCR text quality is noisy" },
        ],
        confirmClauseMode: "all",
        confirmWarning: true,
      },
    },
    {
      file: path.resolve(root, "translation-bot/runtime/uploads/e84a2a51-2f9f-46bb-be6a-154751bb548b-JTG_5220_2020_.pdf"),
      fileName: "deflection.pdf",
      beforeResult: manualCasesByName.get("deflection") as any,
      options: {
        reviewedWarnings: [{ code: "OCR_USED", message: "OCR was used for extraction" }],
        confirmClauseMode: "all",
        confirmWarning: true,
      },
    },
  ];

  const rerun = await rerunValidationWithNewRules(samples, calibratedConfig);
  const output = {
    generatedAt: new Date().toISOString(),
    calibratedConfig,
    ruleAdjustmentNotes: notes,
    comparisons: rerun.comparisons,
    summary: {
      changed: rerun.comparisons.filter((item) => item.changed).length,
      unchanged: rerun.comparisons.filter((item) => !item.changed).length,
    },
  };

  const outputPath = path.resolve(root, "apps/executable-spec-web/examples/validation/rule_calibration_report.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log(JSON.stringify({ outputPath, ...output.summary, comparisons: output.comparisons }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
