export type RuntimeDependencyNodeKind = "body" | "gate" | "proof" | "conclusion";

export interface RuntimeDependencyNode {
  id: string;
  kind: RuntimeDependencyNodeKind;
  label: string;
  version: number;
  dirty: boolean;
  dirtyReason: string | null;
  invalidated: boolean;
  lastComputedAt: string | null;
  metadata?: Record<string, unknown>;
}

export interface RuntimeDependencyEdge {
  from: string;
  to: string;
  reason: string;
}

export interface RuntimeDependencyBuildInput {
  registry: Array<{
    spuId: string;
    forms?: Array<{ formCode: string }>;
    data: { inputs: Array<{ name: string }> };
    rules: Array<{ ruleId?: string; field: string; threshold?: unknown }>;
  }>;
  containers: Array<{
    container: {
      projectId?: string | null;
      specBindings?: Array<{ spuId: string }>;
    };
  }>;
}

interface DependencyGraphState {
  nodes: Map<string, RuntimeDependencyNode>;
  forward: Map<string, Set<string>>;
  reverse: Map<string, Set<string>>;
  blockedEdges: RuntimeDependencyEdge[];
}

interface RecomputeRequest {
  body_id?: string;
  slotKey?: string;
  form_code?: string;
  project_id?: string;
  gate_id?: string;
  gate_ids?: string[];
  proof_id?: string;
  proof_ids?: string[];
  force?: boolean;
}

interface DirtyResult {
  affectedBodies: string[];
  affectedGates: string[];
  affectedProofs: string[];
  affectedConclusions: string[];
  dirtyNodeIds: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ensureSet(map: Map<string, Set<string>>, key: string): Set<string> {
  const current = map.get(key);
  if (current) return current;
  const created = new Set<string>();
  map.set(key, created);
  return created;
}

function normalizeFormCodes(forms: Array<{ formCode: string }> | undefined, spuId: string): string[] {
  const normalized = (forms ?? []).map((item) => String(item.formCode ?? "").trim()).filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [`${spuId}:default`];
}

function normalizeRuleId(spuId: string, rule: { ruleId?: string; field: string }, index: number): string {
  const explicit = String(rule.ruleId ?? "").trim();
  if (explicit) return `gate:${spuId}:${explicit}`;
  const field = String(rule.field ?? "").trim() || `rule_${index + 1}`;
  return `gate:${spuId}:${field}`;
}

function extractRuleInputRefs(rule: { field: string; threshold?: unknown }, knownInputNames: string[]): string[] {
  const refs = new Set<string>();
  const field = String(rule.field ?? "").trim();
  if (field && knownInputNames.includes(field)) {
    refs.add(field);
  }

  const threshold = rule.threshold;
  if (isRecord(threshold)) {
    const inputRef = String(threshold.inputRef ?? "").trim();
    if (inputRef && knownInputNames.includes(inputRef)) {
      refs.add(inputRef);
    }
  }

  return Array.from(refs);
}

function sortUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort();
}

export class RuntimeDependencyEngine {
  private state: DependencyGraphState = {
    nodes: new Map(),
    forward: new Map(),
    reverse: new Map(),
    blockedEdges: [],
  };

  sync(input: RuntimeDependencyBuildInput): void {
    const previous = this.state.nodes;
    this.state = {
      nodes: new Map(),
      forward: new Map(),
      reverse: new Map(),
      blockedEdges: [],
    };

    const spuById = new Map(input.registry.map((spu) => [spu.spuId, spu]));

    for (const spu of input.registry) {
      const forms = normalizeFormCodes(spu.forms, spu.spuId);
      const inputNames = spu.data.inputs.map((item) => String(item.name ?? "").trim()).filter(Boolean);

      for (const formCode of forms) {
        for (const inputName of inputNames) {
          this.addNode({
            id: `body:${formCode}:${inputName}`,
            kind: "body",
            label: `${formCode}.${inputName}`,
            version: 1,
            dirty: false,
            dirtyReason: null,
            invalidated: false,
            lastComputedAt: null,
            metadata: { formCode, slotKey: inputName },
          }, previous);
        }
      }

      for (let i = 0; i < spu.rules.length; i += 1) {
        const rule = spu.rules[i];
        const gateId = normalizeRuleId(spu.spuId, rule, i);
        this.addNode({
          id: gateId,
          kind: "gate",
          label: gateId,
          version: 1,
          dirty: false,
          dirtyReason: null,
          invalidated: false,
          lastComputedAt: null,
          metadata: { spuId: spu.spuId },
        }, previous);

        const refs = extractRuleInputRefs(rule, inputNames);
        for (const formCode of forms) {
          for (const ref of refs) {
            this.addEdge(`body:${formCode}:${ref}`, gateId, `rule:${rule.ruleId ?? rule.field}`);
          }
        }
      }

      const proofId = `proof:${spu.spuId}`;
      this.addNode({
        id: proofId,
        kind: "proof",
        label: `proof(${spu.spuId})`,
        version: 1,
        dirty: false,
        dirtyReason: null,
        invalidated: false,
        lastComputedAt: null,
        metadata: { spuId: spu.spuId },
      }, previous);

      for (let i = 0; i < spu.rules.length; i += 1) {
        this.addEdge(normalizeRuleId(spu.spuId, spu.rules[i], i), proofId, "gate_to_proof");
      }

      for (const formCode of forms) {
        const globalConclusionId = `conclusion:*:${formCode}`;
        this.addNode({
          id: globalConclusionId,
          kind: "conclusion",
          label: `conclusion(*,${formCode})`,
          version: 1,
          dirty: false,
          dirtyReason: null,
          invalidated: false,
          lastComputedAt: null,
          metadata: { projectId: "*", formCode },
        }, previous);
        this.addEdge(proofId, globalConclusionId, "proof_to_conclusion");
      }
    }

    for (const item of input.containers) {
      const projectId = String(item.container.projectId ?? "").trim();
      if (!projectId) continue;
      const bindings = item.container.specBindings ?? [];
      for (const binding of bindings) {
        const spu = spuById.get(binding.spuId);
        if (!spu) continue;
        const forms = normalizeFormCodes(spu.forms, spu.spuId);
        for (const formCode of forms) {
          const id = `conclusion:${projectId}:${formCode}`;
          this.addNode({
            id,
            kind: "conclusion",
            label: `conclusion(${projectId},${formCode})`,
            version: 1,
            dirty: false,
            dirtyReason: null,
            invalidated: false,
            lastComputedAt: null,
            metadata: { projectId, formCode },
          }, previous);
          this.addEdge(`proof:${spu.spuId}`, id, "proof_to_project_conclusion");
        }
      }
    }
  }

  getSchema() {
    return {
      node_kinds: ["body", "gate", "proof", "conclusion"],
      edge_semantics: ["body->gate", "gate->proof", "proof->conclusion"],
      invalidation_rules: {
        body_change: ["mark downstream gates dirty", "invalidate downstream proofs", "mark downstream conclusions stale"],
        gate_change: ["invalidate dependent proofs", "mark dependent conclusions stale"],
        proof_change: ["refresh dependent conclusions"],
      },
      recompute_strategy: {
        incremental: "only recompute dirty subgraph",
        lazy: "mark dirty first, recompute on demand",
        topological_order: true,
      },
      cycle_prevention: {
        policy: "reject edge that introduces back-edge",
        blocked_edges: this.state.blockedEdges,
      },
    };
  }

  getGraphSnapshot() {
    const nodes = Array.from(this.state.nodes.values()).map((item) => ({ ...item }));
    const edges: RuntimeDependencyEdge[] = [];
    for (const [from, targets] of this.state.forward.entries()) {
      for (const to of targets) {
        edges.push({ from, to, reason: "runtime_dependency" });
      }
    }
    return { nodes, edges, blocked_edges: this.state.blockedEdges };
  }

  recompute(payload: RecomputeRequest) {
    const dirtySummary = this.applyChange(payload);
    const recomputed = this.recomputeDirty(payload.force === true);
    return {
      dirty_summary: dirtySummary,
      recomputed,
      runtime_state: {
        dirty_nodes: Array.from(this.state.nodes.values()).filter((item) => item.dirty).map((item) => item.id),
      },
    };
  }

  private applyChange(payload: RecomputeRequest): DirtyResult {
    const bodySeeds = this.resolveBodySeeds(payload);
    const gateSeeds = this.resolveGateSeeds(payload);
    const proofSeeds = this.resolveProofSeeds(payload);

    for (const id of bodySeeds) {
      this.markDirty(id, "body_changed", false);
    }
    for (const id of gateSeeds) {
      this.markDirty(id, "gate_changed", true);
    }
    for (const id of proofSeeds) {
      this.markDirty(id, "proof_changed", true);
    }

    const propagated = new Set<string>();
    for (const seed of [...bodySeeds, ...gateSeeds, ...proofSeeds]) {
      const downstream = this.collectDownstream(seed);
      for (const nodeId of downstream) {
        const node = this.state.nodes.get(nodeId);
        if (!node) continue;
        if (node.kind === "gate") {
          this.markDirty(nodeId, "upstream_body_changed", false);
        } else if (node.kind === "proof") {
          this.markDirty(nodeId, "upstream_gate_changed", true);
        } else if (node.kind === "conclusion") {
          this.markDirty(nodeId, "upstream_proof_changed", true);
        }
        propagated.add(nodeId);
      }
    }

    const allDirty = sortUnique(
      Array.from(this.state.nodes.values())
        .filter((item) => item.dirty || item.invalidated)
        .map((item) => item.id),
    );

    return {
      affectedBodies: sortUnique(bodySeeds),
      affectedGates: sortUnique(allDirty.filter((id) => this.state.nodes.get(id)?.kind === "gate")),
      affectedProofs: sortUnique(allDirty.filter((id) => this.state.nodes.get(id)?.kind === "proof")),
      affectedConclusions: sortUnique(allDirty.filter((id) => this.state.nodes.get(id)?.kind === "conclusion")),
      dirtyNodeIds: allDirty,
    };
  }

  private recomputeDirty(force: boolean) {
    const order = this.topoOrder();
    const recomputed: string[] = [];
    for (const id of order) {
      const node = this.state.nodes.get(id);
      if (!node) continue;
      if (!force && !node.dirty && !node.invalidated) continue;
      if (node.kind === "body") {
        node.dirty = false;
        node.invalidated = false;
        continue;
      }
      node.version += 1;
      node.dirty = false;
      node.invalidated = false;
      node.dirtyReason = null;
      node.lastComputedAt = nowIso();
      recomputed.push(id);
    }
    return {
      mode: force ? "incremental+force" : "incremental+lazy",
      recomputed_nodes: recomputed,
      recomputed_gates: recomputed.filter((id) => this.state.nodes.get(id)?.kind === "gate"),
      recomputed_proofs: recomputed.filter((id) => this.state.nodes.get(id)?.kind === "proof"),
      refreshed_conclusions: recomputed.filter((id) => this.state.nodes.get(id)?.kind === "conclusion"),
    };
  }

  private topoOrder(): string[] {
    const indegree = new Map<string, number>();
    for (const nodeId of this.state.nodes.keys()) {
      indegree.set(nodeId, 0);
    }
    for (const targets of this.state.forward.values()) {
      for (const to of targets) {
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
      }
    }
    const queue = Array.from(indegree.entries()).filter(([, d]) => d === 0).map(([id]) => id);
    const result: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      result.push(id);
      const targets = this.state.forward.get(id) ?? new Set<string>();
      for (const to of targets) {
        const next = (indegree.get(to) ?? 0) - 1;
        indegree.set(to, next);
        if (next === 0) {
          queue.push(to);
        }
      }
    }
    for (const id of this.state.nodes.keys()) {
      if (!result.includes(id)) result.push(id);
    }
    return result;
  }

  private resolveBodySeeds(payload: RecomputeRequest): string[] {
    const direct = String(payload.body_id ?? "").trim();
    if (direct && this.state.nodes.has(direct)) {
      return [direct];
    }
    const slotKey = String(payload.slotKey ?? "").trim();
    const formCode = String(payload.form_code ?? "").trim();
    const matched: string[] = [];
    for (const node of this.state.nodes.values()) {
      if (node.kind !== "body") continue;
      const metaSlot = String(node.metadata?.slotKey ?? "").trim();
      const metaForm = String(node.metadata?.formCode ?? "").trim();
      if (slotKey && metaSlot !== slotKey) continue;
      if (formCode && metaForm !== formCode) continue;
      matched.push(node.id);
    }
    return matched;
  }

  private resolveGateSeeds(payload: RecomputeRequest): string[] {
    const explicit = [
      ...((payload.gate_ids ?? []).map((item) => String(item).trim()).filter(Boolean)),
      String(payload.gate_id ?? "").trim(),
    ].filter(Boolean);
    return explicit.filter((id) => this.state.nodes.get(id)?.kind === "gate");
  }

  private resolveProofSeeds(payload: RecomputeRequest): string[] {
    const explicit = [
      ...((payload.proof_ids ?? []).map((item) => String(item).trim()).filter(Boolean)),
      String(payload.proof_id ?? "").trim(),
    ].filter(Boolean);
    return explicit.filter((id) => this.state.nodes.get(id)?.kind === "proof");
  }

  private collectDownstream(startId: string): string[] {
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      const targets = this.state.forward.get(id) ?? new Set<string>();
      for (const to of targets) {
        if (visited.has(to)) continue;
        visited.add(to);
        queue.push(to);
      }
    }
    return Array.from(visited);
  }

  private markDirty(nodeId: string, reason: string, invalidate: boolean): void {
    const node = this.state.nodes.get(nodeId);
    if (!node) return;
    node.dirty = true;
    node.dirtyReason = reason;
    if (invalidate) {
      node.invalidated = true;
    }
  }

  private addNode(node: RuntimeDependencyNode, previous: Map<string, RuntimeDependencyNode>): void {
    const prev = previous.get(node.id);
    this.state.nodes.set(node.id, prev ? { ...node, version: prev.version, dirty: prev.dirty, dirtyReason: prev.dirtyReason, invalidated: prev.invalidated, lastComputedAt: prev.lastComputedAt } : node);
  }

  private addEdge(from: string, to: string, reason: string): void {
    if (!this.state.nodes.has(from) || !this.state.nodes.has(to) || from === to) {
      return;
    }
    if (this.hasPath(to, from)) {
      this.state.blockedEdges.push({ from, to, reason: `${reason}:cycle_prevented` });
      return;
    }
    ensureSet(this.state.forward, from).add(to);
    ensureSet(this.state.reverse, to).add(from);
  }

  private hasPath(start: string, target: string): boolean {
    if (start === target) return true;
    const visited = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (id === target) return true;
      if (visited.has(id)) continue;
      visited.add(id);
      const targets = this.state.forward.get(id) ?? new Set<string>();
      for (const to of targets) {
        queue.push(to);
      }
    }
    return false;
  }
}
