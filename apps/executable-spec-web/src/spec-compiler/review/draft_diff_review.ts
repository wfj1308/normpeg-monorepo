import { diffMarkdownLines, diffMarkdownSections, type DraftLineDiff, type DraftSectionDiff } from "./markdown_diff.ts";
import {
  getActiveRuleConfig,
  resolveDiffRiskLevelFromSectionKey,
  resolveDiffSectionKey,
  type RuleConfig,
} from "../calibration/rule_config.ts";

export interface DraftDiffSummary {
  added: number;
  removed: number;
  modified: number;
}

export interface DraftDiffReviewResult {
  hasChanges: boolean;
  summary: DraftDiffSummary;
  sectionChanges: DraftSectionDiff[];
  lineDiffs: DraftLineDiff[];
}

function buildSummary(lineDiffs: DraftLineDiff[]): DraftDiffSummary {
  return lineDiffs.reduce<DraftDiffSummary>(
    (acc, item) => {
      if (item.type === "added") {
        acc.added += 1;
      } else if (item.type === "removed") {
        acc.removed += 1;
      } else if (item.type === "modified") {
        acc.modified += 1;
      }
      return acc;
    },
    { added: 0, removed: 0, modified: 0 },
  );
}

function applyConfiguredSectionRisk(sectionChanges: DraftSectionDiff[], config: RuleConfig): DraftSectionDiff[] {
  return sectionChanges.map((item) => {
    const sectionKey = resolveDiffSectionKey(item.section);
    const configuredRisk = resolveDiffRiskLevelFromSectionKey(sectionKey, config);
    if (configuredRisk === item.riskLevel) {
      return item;
    }
    return {
      ...item,
      riskLevel: configuredRisk,
    };
  });
}

export function buildDraftDiffReview(
  originalDraftMarkdown: string,
  editedMarkdown: string,
  config: RuleConfig = getActiveRuleConfig(),
): DraftDiffReviewResult {
  const lineDiffs = diffMarkdownLines(originalDraftMarkdown, editedMarkdown);
  const sectionChanges = applyConfiguredSectionRisk(diffMarkdownSections(originalDraftMarkdown, editedMarkdown), config);
  const summary = buildSummary(lineDiffs);
  const hasChanges = lineDiffs.length > 0 || sectionChanges.length > 0;

  return {
    hasChanges,
    summary,
    sectionChanges,
    lineDiffs,
  };
}

export function extractChangedSections(
  originalDraftMarkdown: string,
  editedMarkdown: string,
  config?: RuleConfig,
): string[] {
  const review = buildDraftDiffReview(originalDraftMarkdown, editedMarkdown, config);
  const seen = new Set<string>();
  const sections: string[] = [];
  for (const item of review.sectionChanges) {
    if (seen.has(item.section)) {
      continue;
    }
    seen.add(item.section);
    sections.push(item.section);
  }
  return sections;
}

export function detectHighRiskDiff(
  originalDraftMarkdown: string,
  editedMarkdown: string,
  config?: RuleConfig,
): boolean {
  const review = buildDraftDiffReview(originalDraftMarkdown, editedMarkdown, config);
  return review.sectionChanges.some((item) => item.riskLevel === "high");
}
