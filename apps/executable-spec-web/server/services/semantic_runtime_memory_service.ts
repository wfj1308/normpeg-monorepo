import { randomUUID } from "node:crypto";

export type RuntimeMemoryType =
  | "historical_failure"
  | "successful_remediation"
  | "override_pattern"
  | "recurring_issue"
  | "accepted_ai_patch";

interface RuntimeMemoryRecord {
  memory_id: string;
  memory_type: RuntimeMemoryType;
  project_id: string;
  form_code: string | null;
  slotKey: string | null;
  gate_id: string | null;
  issue_signature: string;
  tags: string[];
  payload: Record<string, unknown>;
  success_score: number;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.map((i) => text(i)).filter(Boolean)));
}

function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sb = new Set(b);
  const hit = a.filter((i) => sb.has(i)).length;
  return hit / Math.max(a.length, b.length);
}

export class SemanticRuntimeMemoryService {
  private readonly memories: RuntimeMemoryRecord[] = [];

  getSchema() {
    return {
      memory_schema: {
        memory_types: [
          "historical_failure",
          "successful_remediation",
          "override_pattern",
          "recurring_issue",
          "accepted_ai_patch",
        ],
        fields: [
          "memory_id",
          "memory_type",
          "project_id",
          "form_code",
          "slotKey",
          "gate_id",
          "issue_signature",
          "tags",
          "payload",
          "success_score",
          "created_at",
          "updated_at",
        ],
      },
      retrieval_strategy: {
        ranking: [
          "issue_signature exact match",
          "slot/gate match",
          "tag overlap similarity",
          "success_score priority",
          "recency tie-break",
        ],
        ai_patch_reuse_policy: "prefer historical successful remediations and accepted_ai_patch records",
      },
      page_plan: {
        title: "Runtime Memory Explorer",
        sections: ["memory schema", "retrieval strategy", "memory timeline", "reasoning context", "ai remediation reuse"],
      },
    };
  }

  upsert(payload: {
    memory_type: RuntimeMemoryType;
    project_id: string;
    form_code?: string;
    slotKey?: string;
    gate_id?: string;
    issue_signature: string;
    tags?: string[];
    payload?: Record<string, unknown>;
    success_score?: number;
  }) {
    const now = nowIso();
    const record: RuntimeMemoryRecord = {
      memory_id: `mem_${randomUUID()}`,
      memory_type: payload.memory_type,
      project_id: text(payload.project_id) || "unknown_project",
      form_code: text(payload.form_code) || null,
      slotKey: text(payload.slotKey) || null,
      gate_id: text(payload.gate_id) || null,
      issue_signature: text(payload.issue_signature) || "unknown_issue",
      tags: normalizeTags(payload.tags ?? []),
      payload: payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload) ? payload.payload : {},
      success_score: Math.max(0, Math.min(1, Number(payload.success_score ?? 0.5))),
      created_at: now,
      updated_at: now,
    };
    this.memories.unshift(record);
    if (this.memories.length > 5000) this.memories.length = 5000;
    return { item: record };
  }

  list(params?: { project_id?: string; memory_type?: RuntimeMemoryType; limit?: number }) {
    const project = text(params?.project_id);
    const type = params?.memory_type;
    const limit = Number.isFinite(params?.limit) ? Math.max(1, Math.min(2000, Number(params?.limit))) : 200;
    const filtered = this.memories.filter((m) => {
      if (project && m.project_id !== project) return false;
      if (type && m.memory_type !== type) return false;
      return true;
    });
    return { items: filtered.slice(0, limit) };
  }

  retrieve(params: {
    issue_signature?: string;
    slotKey?: string;
    gate_id?: string;
    tags?: string[];
    project_id?: string;
    limit?: number;
    prefer_success?: boolean;
  }) {
    const issue = text(params.issue_signature);
    const slot = text(params.slotKey);
    const gate = text(params.gate_id);
    const tags = normalizeTags(params.tags ?? []);
    const project = text(params.project_id);
    const limit = Number.isFinite(params.limit) ? Math.max(1, Math.min(200, Number(params.limit))) : 20;
    const preferSuccess = params.prefer_success !== false;

    const scored = this.memories
      .filter((m) => (project ? m.project_id === project : true))
      .map((m) => {
        let score = 0;
        if (issue && m.issue_signature === issue) score += 0.5;
        if (slot && m.slotKey === slot) score += 0.15;
        if (gate && m.gate_id === gate) score += 0.15;
        score += overlapScore(tags, m.tags) * 0.15;
        if (preferSuccess) score += m.success_score * 0.05;
        return {
          ...m,
          retrieval_score: Number(score.toFixed(4)),
        };
      })
      .sort((a, b) => b.retrieval_score - a.retrieval_score || b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit);

    return {
      query: {
        issue_signature: issue || null,
        slotKey: slot || null,
        gate_id: gate || null,
        tags,
        project_id: project || null,
        prefer_success: preferSuccess,
      },
      items: scored,
    };
  }

  buildReasoningContext(params: {
    issue_signature?: string;
    slotKey?: string;
    gate_id?: string;
    tags?: string[];
    project_id?: string;
  }) {
    const retrieved = this.retrieve({
      issue_signature: params.issue_signature,
      slotKey: params.slotKey,
      gate_id: params.gate_id,
      tags: params.tags,
      project_id: params.project_id,
      limit: 10,
      prefer_success: true,
    });
    return {
      memory_context: retrieved.items,
      memory_summary: {
        matched_count: retrieved.items.length,
        top_patterns: retrieved.items.slice(0, 5).map((i) => ({ memory_id: i.memory_id, type: i.memory_type, score: i.retrieval_score })),
      },
    };
  }

  suggestFromHistory(params: {
    issue_signature?: string;
    slotKey?: string;
    gate_id?: string;
    tags?: string[];
    project_id?: string;
  }) {
    const retrieved = this.retrieve({
      issue_signature: params.issue_signature,
      slotKey: params.slotKey,
      gate_id: params.gate_id,
      tags: params.tags,
      project_id: params.project_id,
      limit: 20,
      prefer_success: true,
    });

    const successful = retrieved.items.filter((i) => i.memory_type === "successful_remediation" || i.memory_type === "accepted_ai_patch");
    const ordered = successful.sort((a, b) => (b.success_score - a.success_score) || (b.retrieval_score - a.retrieval_score));

    return {
      reused_case_count: ordered.length,
      prioritized_cases: ordered.slice(0, 8),
      suggestion_policy: "prefer historical successful_remediation and accepted_ai_patch",
    };
  }
}
