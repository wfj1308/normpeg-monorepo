export const DRAFT_SECTION_ORDER = [
  "标题",
  "规范来源",
  "条款号",
  "版本",
  "分类",
  "检测项",
  "输入参数",
  "输出参数",
  "计算步骤",
  "判定规则",
  "签字要求",
  "依赖",
] as const;

export type DraftSectionName = (typeof DRAFT_SECTION_ORDER)[number];
export type MarkdownSectionMap = Record<DraftSectionName, string[]>;

const HEADING_TO_SECTION: Record<string, DraftSectionName | null> = {
  输入参数: "输入参数",
  输出参数: "输出参数",
  计算步骤: "计算步骤",
  判定规则: "判定规则",
  签字要求: "签字要求",
  依赖: "依赖",
};

const META_TO_SECTION: Record<string, DraftSectionName | null> = {
  规范来源: "规范来源",
  条款号: "条款号",
  版本: "版本",
  分类: "分类",
  检测项: "检测项",
};

function createEmptySectionMap(): MarkdownSectionMap {
  return {
    标题: [],
    规范来源: [],
    条款号: [],
    版本: [],
    分类: [],
    检测项: [],
    输入参数: [],
    输出参数: [],
    计算步骤: [],
    判定规则: [],
    签字要求: [],
    依赖: [],
  };
}

function normalizeHeading(rawHeading: string): string {
  return rawHeading.trim().replace(/\s+/g, "");
}

function normalizeText(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n");
}

export function splitMarkdownIntoSections(markdown: string): MarkdownSectionMap {
  const sectionMap = createEmptySectionMap();
  const lines = normalizeText(markdown).split("\n");

  let currentSection: DraftSectionName | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const titleMatch = /^#\s+(.+)$/.exec(trimmed);
    if (titleMatch?.[1]) {
      sectionMap["标题"] = [titleMatch[1].trim()];
      currentSection = null;
      continue;
    }

    const sectionHeadingMatch = /^##\s+(.+)$/.exec(trimmed);
    if (sectionHeadingMatch?.[1]) {
      const heading = normalizeHeading(sectionHeadingMatch[1]);
      currentSection = HEADING_TO_SECTION[heading] ?? null;
      continue;
    }

    const metaMatch = /^([^:：]+)\s*[:：]\s*(.+)$/.exec(trimmed);
    if (metaMatch?.[1] && metaMatch[2]) {
      const metaKey = normalizeHeading(metaMatch[1]);
      const mappedSection = META_TO_SECTION[metaKey];
      if (mappedSection) {
        sectionMap[mappedSection] = [metaMatch[2].trim()];
        currentSection = null;
        continue;
      }
    }

    if (currentSection) {
      sectionMap[currentSection].push(trimmed);
    }
  }

  return sectionMap;
}
