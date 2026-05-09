import { randomUUID } from "node:crypto";

import type { ExecutionNode, SPUDefinition } from "../../src/platform/types.ts";
import type { PlatformService } from "../../src/platform/workflow/platform-service.ts";

export type SemanticConsistencyIssueType =
  | "slot_consistency"
  | "unit_consistency"
  | "formula_consistency"
  | "runtime_dependency_consistency"
  | "proof_lineage_consistency";

interface ConsistencyIssue {
  issue_id: string;
  type: SemanticConsistencyIssueType;
  severity: "high" | "medium" | "low";
  entity_type: "container" | "node" | "spu" | "proof";
  entity_id: string;
  message: string;
  suggestion: string;
}

interface InconsistencyEvent {
  event_id: string;
  created_at: string;
  project_id: string;
  form_code: string | null;
  issue: ConsistencyIssue;
  actions: {
    block_publish: boolean;
    request_review: boolean;
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function issue(params: Omit<ConsistencyIssue, "issue_id">): ConsistencyIssue {
  return {
    issue_id: `sc_issue_${randomUUID()}`,
    ...params,
  };
}

function extractInputUnitMap(spu: SPUDefinition): Map<string, string> {
  const map = new Map<string, string>();
  for (const input of spu.data.inputs) {
    const key = normalizeText(input.name);
    if (!key) continue;
    const unit = normalizeText(input.unit || "");
    if (unit) map.set(key, unit);
  }
  return map;
}

function formulaOutputVar(formula: string): string | null {
  const m = formula.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return m?.[1] ?? null;
}

export class RuntimeSemanticConsistencyService {
  private readonly events: InconsistencyEvent[] = [];

  getSchema() {
    return {
      consistency_rules: {
        slot_consistency: "container slot and node/container reference must align",
        unit_consistency: "body input unit must match SPU definition unit",
        formula_consistency: "path formula output variable must exist in SPU outputs",
        runtime_dependency_consistency: "SPU dependencies must be bound in same container",
        proof_lineage_consistency: "proof chain links must resolve and remain coherent",
      },
      detection_engine: {
        mode: "runtime semantic validation",
        trigger: ["manual_run", "pre_publish_check", "runtime_event"],
        actions_on_issue: ["create inconsistency event", "block publish", "request review"],
      },
      remediation_workflow: {
        states: ["detected", "blocked", "in_review", "resolved", "revalidated"],
        owners: ["runtime_engine", "reviewer", "publisher"],
      },
    };
  }

  runCheck(service: PlatformService, payload: { project_id: string; form_code?: string }) {
    const projectId = normalizeText(payload.project_id) || "unknown_project";
    const formCode = normalizeText(payload.form_code) || null;

    const registry = service.getRegistry();
    const spuById = new Map(registry.map((item) => [item.spuId, item]));

    const all = service.listContainers();
    const scoped = all.filter((item) => normalizeText(item.container.projectId) === projectId);

    const issues: ConsistencyIssue[] = [];

    for (const item of scoped) {
      const container = item.container;
      const nodes = item.nodes;

      // 1) slot consistency
      if (!normalizeText(container.geoSlotRef)) {
        issues.push(issue({
          type: "slot_consistency",
          severity: "high",
          entity_type: "container",
          entity_id: container.containerId,
          message: "container.geoSlotRef is empty",
          suggestion: "bind container to a valid slot before publish",
        }));
      }

      for (const node of nodes) {
        if (normalizeText(node.containerRef) !== container.containerId) {
          issues.push(issue({
            type: "slot_consistency",
            severity: "high",
            entity_type: "node",
            entity_id: node.nodeId,
            message: "node.containerRef mismatches owning container",
            suggestion: "repair node/container linkage and rerun execution",
          }));
        }
      }

      for (const binding of container.specBindings) {
        const spu = spuById.get(binding.spuId);
        if (!spu) {
          issues.push(issue({
            type: "runtime_dependency_consistency",
            severity: "high",
            entity_type: "spu",
            entity_id: binding.spuId,
            message: "bound SPU not found in registry",
            suggestion: "rebind a published and existing SPU version",
          }));
          continue;
        }

        const outputSet = new Set(spu.data.outputs.map((out) => normalizeText(out.name)).filter(Boolean));
        for (const step of spu.path) {
          const outVar = formulaOutputVar(String(step.formula ?? ""));
          if (!outVar || !outputSet.has(outVar)) {
            issues.push(issue({
              type: "formula_consistency",
              severity: "medium",
              entity_type: "spu",
              entity_id: spu.spuId,
              message: `formula output variable is not declared in outputs: ${step.formula}`,
              suggestion: "align path formula LHS variable with outputs[]",
            }));
          }
        }

        const ext = isRecord(spu.meta.extensions) ? spu.meta.extensions : {};
        const depRaw = ext.dependsOn;
        const requiredDeps = Array.isArray(depRaw) ? depRaw.map((d) => normalizeText(d)).filter(Boolean) : [];
        if (requiredDeps.length > 0) {
          const boundSet = new Set(container.specBindings.map((b) => normalizeText(b.spuId)));
          for (const dep of requiredDeps) {
            if (!boundSet.has(dep)) {
              issues.push(issue({
                type: "runtime_dependency_consistency",
                severity: "high",
                entity_type: "container",
                entity_id: container.containerId,
                message: `dependency spu not bound in container: ${dep}`,
                suggestion: "bind all required dependency SPUs before publish",
              }));
            }
          }
        }
      }

      for (const node of nodes) {
        const spu = spuById.get(node.spuId);
        if (!spu) continue;

        // 2) unit consistency
        const unitMap = extractInputUnitMap(spu);
        for (const [slotKey, expectedUnit] of unitMap.entries()) {
          const runtimeValue = node.inputs[slotKey];
          if (isRecord(runtimeValue) && runtimeValue.unit !== undefined) {
            const actualUnit = normalizeText(runtimeValue.unit);
            if (actualUnit && expectedUnit && actualUnit !== expectedUnit) {
              issues.push(issue({
                type: "unit_consistency",
                severity: "high",
                entity_type: "node",
                entity_id: node.nodeId,
                message: `unit mismatch on ${slotKey}: expected ${expectedUnit}, got ${actualUnit}`,
                suggestion: "normalize unit conversion before gate evaluation",
              }));
            }
          }
        }

        // 5) proof lineage consistency
        this.checkProofLineage(node, nodes, issues);
      }
    }

    const createdEvents = issues.map((it) => this.createEvent(projectId, formCode, it));
    const hasHighRisk = issues.some((it) => it.severity === "high");

    return {
      consistency_rules: this.getSchema().consistency_rules,
      detection_engine: this.getSchema().detection_engine,
      remediation_workflow: this.getSchema().remediation_workflow,
      summary: {
        project_id: projectId,
        form_code: formCode,
        issue_count: issues.length,
        high_risk_count: issues.filter((it) => it.severity === "high").length,
        publish_blocked: hasHighRisk,
        review_required: issues.length > 0,
      },
      issues,
      inconsistency_events: createdEvents,
      publish_gate: {
        blocked: hasHighRisk,
        reason: hasHighRisk ? "high-risk semantic inconsistency exists" : "no high-risk inconsistency",
      },
      review_request: {
        requested: issues.length > 0,
        queue: createdEvents.map((ev) => ({ event_id: ev.event_id, issue_id: ev.issue.issue_id, status: "pending_review" })),
      },
    };
  }

  listEvents(params?: { project_id?: string; limit?: number }) {
    const projectId = normalizeText(params?.project_id);
    const limit = Math.max(1, Math.min(500, Math.floor(params?.limit ?? 100)));
    const scoped = projectId
      ? this.events.filter((item) => item.project_id === projectId)
      : this.events;
    return { items: scoped.slice(0, limit) };
  }

  private createEvent(projectId: string, formCode: string | null, it: ConsistencyIssue): InconsistencyEvent {
    const event: InconsistencyEvent = {
      event_id: `inconsistency_evt_${randomUUID()}`,
      created_at: nowIso(),
      project_id: projectId,
      form_code: formCode,
      issue: it,
      actions: {
        block_publish: it.severity === "high",
        request_review: true,
      },
    };
    this.events.unshift(event);
    if (this.events.length > 1000) this.events.length = 1000;
    return event;
  }

  private checkProofLineage(node: ExecutionNode, nodes: ExecutionNode[], issues: ConsistencyIssue[]) {
    const proof = node.proof;
    if (!proof) {
      issues.push(issue({
        type: "proof_lineage_consistency",
        severity: "medium",
        entity_type: "node",
        entity_id: node.nodeId,
        message: "node proof missing",
        suggestion: "finalize/sign node before publish",
      }));
      return;
    }

    const chain = proof.proofChain;
    if (!chain) {
      issues.push(issue({
        type: "proof_lineage_consistency",
        severity: "medium",
        entity_type: "proof",
        entity_id: proof.proofId,
        message: "proofChain missing",
        suggestion: "regenerate proof with chain link",
      }));
      return;
    }

    if (chain.previousProofId) {
      const hasPrev = nodes.some((n) => normalizeText(n.proof?.proofId) === normalizeText(chain.previousProofId));
      if (!hasPrev) {
        issues.push(issue({
          type: "proof_lineage_consistency",
          severity: "high",
          entity_type: "proof",
          entity_id: proof.proofId,
          message: `previousProofId not found in runtime scope: ${chain.previousProofId}`,
          suggestion: "repair or replay proof lineage before publish",
        }));
      }
    }
  }
}
