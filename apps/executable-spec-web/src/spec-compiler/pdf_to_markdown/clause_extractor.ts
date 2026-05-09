import { normalizeClauseText } from "./clause_normalizer.ts";
import type { ClauseCandidate, ClauseExtractionResult } from "./types.ts";

const CLAUSE_PATTERNS: RegExp[] = [
  /条款号\s*[:：]?\s*(\d+(?:\.\d+){1,3}(?:-\d+)?)/g,
  /第\s*(\d+(?:\.\d+){1,3}(?:-\d+)?)\s*条/g,
  /(^|[^\d])(\d+(?:\.\d+){1,3}(?:-\d+)?)(?=\s*(?:[^\d]|$))/g,
];

function clausePartsCount(clause: string): number {
  return clause.split(".").length;
}

function normalizeClauseToken(token: string): string {
  return token
    .trim()
    .replace(/[．。｡]/g, ".")
    .replace(/\s+/g, "")
    .replace(/(\d+\.\d+\.)[lI|]/g, "$11")
    .replace(/(\d+\.)[lI|](\.\d+)/g, "$11$2");
}

function isValidClauseToken(token: string): boolean {
  return /^\d+(?:\.\d+){1,3}(?:-\d+)?$/.test(token);
}

function dedupeCandidates(candidates: ClauseCandidate[]): ClauseCandidate[] {
  const seen = new Set<string>();
  return candidates
    .slice()
    .sort((a, b) => a.index - b.index)
    .filter((candidate) => {
      const key = `${candidate.clause}@${candidate.index}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function findLikelyTitleIndex(text: string): number {
  const lines = text.split("\n");
  let offset = 0;
  let fallback = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      offset += line.length + 1;
      continue;
    }
    if (fallback === 0) {
      fallback = offset;
    }
    if (/路基|压实度|厚度|弯沉|检测|试验|规范|compaction|thickness|deflection/i.test(trimmed) && trimmed.length <= 80) {
      return offset;
    }
    offset += line.length + 1;
  }
  return fallback;
}

function scoreCandidate(candidate: ClauseCandidate, titleIndex: number): number {
  const distance = Math.abs(candidate.index - titleIndex);
  const completenessBonus = clausePartsCount(candidate.clause) >= 3 ? -20 : 0;
  const nearTitleBonus = distance <= 160 ? -15 : 0;
  return distance + completenessBonus + nearTitleBonus;
}

export function extractClauseCandidates(rawText: string): ClauseCandidate[] {
  const normalized = normalizeClauseText(rawText);
  const collected: ClauseCandidate[] = [];

  for (const pattern of CLAUSE_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(normalized);
    while (match) {
      const rawClause = (match[2] ?? match[1] ?? "").trim();
      const clause = normalizeClauseToken(rawClause);
      if (isValidClauseToken(clause)) {
        const inMatchOffset = match[0].indexOf(rawClause);
        const index = match.index + (inMatchOffset >= 0 ? inMatchOffset : 0);
        collected.push({ clause, index });
      }
      match = pattern.exec(normalized);
    }
  }

  return dedupeCandidates(collected);
}

export function selectPrimaryClause(candidates: ClauseCandidate[], titleIndex: number): ClauseExtractionResult {
  if (candidates.length === 0) {
    return {
      primaryClause: null,
      candidates: [],
      confidence: "low",
    };
  }

  const sorted = candidates.slice().sort((a, b) => scoreCandidate(a, titleIndex) - scoreCandidate(b, titleIndex));
  const primary = sorted[0] ?? null;
  if (!primary) {
    return {
      primaryClause: null,
      candidates,
      confidence: "low",
    };
  }

  const uniqueClauseCount = new Set(candidates.map((item) => item.clause)).size;
  const primaryDistance = Math.abs(primary.index - titleIndex);
  const primaryCompleteness = clausePartsCount(primary.clause);

  let confidence: ClauseExtractionResult["confidence"] = "medium";
  if (uniqueClauseCount === 1 && primaryDistance <= 240 && primaryCompleteness >= 3) {
    confidence = "high";
  } else if (primaryDistance > 900 || primaryCompleteness <= 2) {
    confidence = "low";
  }

  return {
    primaryClause: primary.clause,
    candidates,
    confidence,
  };
}
