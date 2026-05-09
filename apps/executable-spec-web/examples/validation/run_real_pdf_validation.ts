import fs from "node:fs";
import path from "node:path";

import {
  buildValidationCalibrationReport,
  validateRealPdfSample,
} from "../../src/spec-compiler/validation/index.ts";

interface ValidationCase {
  name: string;
  pdfPath: string;
  editedMarkdownPath: string;
  manualMode: "edited" | "confirm_only";
  reviewedWarnings: Array<{ code: string; message: string }>;
}

interface CaseRunOutput {
  case: string;
  machine: Awaited<ReturnType<typeof validateRealPdfSample>>;
  manual: Awaited<ReturnType<typeof validateRealPdfSample>>;
}

const CASES: ValidationCase[] = [
  {
    name: "compaction",
    pdfPath: "uploads/normref/20260415122744-c0a274e3-1_JTG_T_3610-2019____________.pdf",
    editedMarkdownPath: "apps/executable-spec-web/examples/validation/compaction_case.md",
    manualMode: "edited",
    reviewedWarnings: [{ code: "OCR_USED", message: "OCR was used for extraction" }],
  },
  {
    name: "thickness",
    pdfPath: "translation-bot/runtime/uploads/5a53c366-68fc-49bf-bfe0-e083fa2ff6dc-JTG_5220_2020_.pdf",
    editedMarkdownPath: "apps/executable-spec-web/examples/validation/thickness_case.md",
    manualMode: "edited",
    reviewedWarnings: [
      { code: "INPUTS_INFERRED", message: "Input params inferred from text" },
      { code: "RULES_INFERRED", message: "Rules inferred from text" },
      { code: "OCR_TEXT_NOISY", message: "OCR text quality is noisy" },
    ],
  },
  {
    name: "deflection",
    pdfPath: "translation-bot/runtime/uploads/e84a2a51-2f9f-46bb-be6a-154751bb548b-JTG_5220_2020_.pdf",
    editedMarkdownPath: "apps/executable-spec-web/examples/validation/deflection_case.md",
    manualMode: "confirm_only",
    reviewedWarnings: [{ code: "OCR_USED", message: "OCR was used for extraction" }],
  },
];

async function runCase(root: string, item: ValidationCase): Promise<CaseRunOutput> {
  const machine = await validateRealPdfSample(path.resolve(root, item.pdfPath), {
    confirmClauseMode: "none",
    confirmWarning: false,
  });

  const baseManualOptions = {
    reviewedWarnings: item.reviewedWarnings,
    confirmClauseMode: "all" as const,
    confirmWarning: true,
  };

  const manual =
    item.manualMode === "edited"
      ? await validateRealPdfSample(path.resolve(root, item.pdfPath), {
          ...baseManualOptions,
          editedMarkdown: fs.readFileSync(path.resolve(root, item.editedMarkdownPath), "utf8"),
        })
      : await validateRealPdfSample(path.resolve(root, item.pdfPath), baseManualOptions);

  return { case: item.name, machine, manual };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const cases: CaseRunOutput[] = [];

  for (const item of CASES) {
    cases.push(await runCase(root, item));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalCases: cases.length,
    cases,
    calibration: {
      machineDraft: buildValidationCalibrationReport(cases.map((item) => item.machine)),
      manualReviewed: buildValidationCalibrationReport(cases.map((item) => item.manual)),
    },
  };

  const outputPath = path.resolve(root, "apps/executable-spec-web/examples/validation/real_pdf_validation_report.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  const concise = cases.map((item) => ({
    case: item.case,
    machineStatus: item.machine.preRegisterDecision.status,
    manualStatus: item.manual.preRegisterDecision.status,
    machineWarnings: item.machine.extraction.warnings.map((warning) => warning.code),
    manualWarnings: item.manual.extraction.warnings.map((warning) => warning.code),
  }));

  console.log(JSON.stringify({ outputPath, concise, calibration: report.calibration }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
