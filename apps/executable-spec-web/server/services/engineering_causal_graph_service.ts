export type CausalNodeType =
  | "Body"
  | "RuntimeEvent"
  | "Sensor"
  | "Equipment"
  | "Process"
  | "Weather"
  | "Gate"
  | "Proof"
  | "Conclusion";

export type CausalEdgeType = "causes" | "contributes_to" | "blocks" | "amplifies" | "correlates";

export interface CausalNode {
  id: string;
  type: CausalNodeType;
  label: string;
  attributes?: Record<string, unknown>;
}

export interface CausalEdge {
  from: string;
  to: string;
  relation: CausalEdgeType;
  weight: number;
  evidence?: string;
}

interface GraphState {
  nodes: Map<string, CausalNode>;
  edges: CausalEdge[];
  out: Map<string, CausalEdge[]>;
  in: Map<string, CausalEdge[]>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function ensureArr(map: Map<string, CausalEdge[]>, key: string): CausalEdge[] {
  const found = map.get(key);
  if (found) return found;
  const created: CausalEdge[] = [];
  map.set(key, created);
  return created;
}

export class EngineeringCausalGraphService {
  private state: GraphState = {
    nodes: new Map(),
    edges: [],
    out: new Map(),
    in: new Map(),
  };

  getSchema() {
    return {
      causal_graph_schema: {
        node_types: ["Body", "RuntimeEvent", "Sensor", "Equipment", "Process", "Weather", "Gate", "Proof", "Conclusion"],
        edge_types: ["causes", "contributes_to", "blocks", "amplifies", "correlates"],
      },
      root_cause_algorithm: {
        method: "reverse weighted traversal + relation severity scoring",
        precedence: ["causes", "blocks", "amplifies", "contributes_to", "correlates"],
      },
      page_plan: {
        title: "Causal Explorer",
        sections: ["graph schema", "root cause analysis", "causal traversal", "downstream impact prediction", "example chain"],
      },
    };
  }

  buildGraph(payload: {
    body?: Array<Record<string, unknown>>;
    runtime_events?: Array<Record<string, unknown>>;
    sensors?: Array<Record<string, unknown>>;
    equipments?: Array<Record<string, unknown>>;
    processes?: Array<Record<string, unknown>>;
    weather?: Array<Record<string, unknown>>;
    gates?: Array<Record<string, unknown>>;
    proofs?: Array<Record<string, unknown>>;
    conclusions?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
  }) {
    const next: GraphState = {
      nodes: new Map(),
      edges: [],
      out: new Map(),
      in: new Map(),
    };

    const addNode = (type: CausalNodeType, item: Record<string, unknown>, fallbackPrefix: string, index: number) => {
      const id = text(item.id ?? item.node_id ?? item.slotKey ?? item.event_id ?? `${fallbackPrefix}_${index + 1}`) || `${fallbackPrefix}_${index + 1}`;
      const label = text(item.label ?? item.name ?? item.title ?? id) || id;
      next.nodes.set(id, { id, type, label, attributes: { ...item } });
    };

    (payload.body ?? []).forEach((item, i) => addNode("Body", item, "body", i));
    (payload.runtime_events ?? []).forEach((item, i) => addNode("RuntimeEvent", item, "event", i));
    (payload.sensors ?? []).forEach((item, i) => addNode("Sensor", item, "sensor", i));
    (payload.equipments ?? []).forEach((item, i) => addNode("Equipment", item, "equipment", i));
    (payload.processes ?? []).forEach((item, i) => addNode("Process", item, "process", i));
    (payload.weather ?? []).forEach((item, i) => addNode("Weather", item, "weather", i));
    (payload.gates ?? []).forEach((item, i) => addNode("Gate", item, "gate", i));
    (payload.proofs ?? []).forEach((item, i) => addNode("Proof", item, "proof", i));
    (payload.conclusions ?? []).forEach((item, i) => addNode("Conclusion", item, "conclusion", i));

    const edges = (payload.edges ?? [])
      .filter((item) => isRecord(item))
      .map((item) => {
        const from = text(item.from);
        const to = text(item.to);
        const relation = text(item.relation) as CausalEdgeType;
        const weightRaw = Number(item.weight ?? 0.6);
        const weight = Number.isFinite(weightRaw) ? Math.max(0, Math.min(1, weightRaw)) : 0.6;
        return {
          from,
          to,
          relation,
          weight,
          evidence: text(item.evidence) || undefined,
        } as CausalEdge;
      })
      .filter((e) => e.from && e.to && next.nodes.has(e.from) && next.nodes.has(e.to));

    for (const e of edges) {
      next.edges.push(e);
      ensureArr(next.out, e.from).push(e);
      ensureArr(next.in, e.to).push(e);
    }

    this.state = next;
    return {
      graph: this.snapshot(),
      summary: {
        node_count: next.nodes.size,
        edge_count: next.edges.length,
      },
    };
  }

  traverse(payload: { start_node_id: string; direction?: "upstream" | "downstream"; max_depth?: number; relation_filter?: CausalEdgeType[] }) {
    const start = text(payload.start_node_id);
    if (!this.state.nodes.has(start)) {
      throw new Error("start_node_id not found in causal graph");
    }
    const direction = payload.direction === "upstream" ? "upstream" : "downstream";
    const maxDepth = Number.isFinite(payload.max_depth) ? Math.max(1, Math.min(8, Number(payload.max_depth))) : 4;
    const relFilter = Array.isArray(payload.relation_filter) && payload.relation_filter.length > 0
      ? new Set(payload.relation_filter)
      : null;

    const visited = new Set<string>([start]);
    const queue: Array<{ id: string; depth: number; score: number }> = [{ id: start, depth: 0, score: 1 }];
    const paths: Array<Record<string, unknown>> = [];

    while (queue.length > 0) {
      const current = queue.shift() as { id: string; depth: number; score: number };
      if (current.depth >= maxDepth) continue;
      const candidates = direction === "downstream"
        ? this.state.out.get(current.id) ?? []
        : this.state.in.get(current.id) ?? [];
      for (const edge of candidates) {
        if (relFilter && !relFilter.has(edge.relation)) continue;
        const nextId = direction === "downstream" ? edge.to : edge.from;
        const nextScore = Number((current.score * edge.weight).toFixed(4));
        paths.push({
          from: current.id,
          to: nextId,
          relation: edge.relation,
          depth: current.depth + 1,
          path_score: nextScore,
          evidence: edge.evidence ?? null,
        });
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ id: nextId, depth: current.depth + 1, score: nextScore });
        }
      }
    }

    return {
      start_node_id: start,
      direction,
      max_depth: maxDepth,
      traversed_nodes: Array.from(visited),
      traversed_edges: paths,
    };
  }

  rootCause(payload: { target_node_id: string; max_depth?: number }) {
    const target = text(payload.target_node_id);
    if (!this.state.nodes.has(target)) {
      throw new Error("target_node_id not found in causal graph");
    }
    const maxDepth = Number.isFinite(payload.max_depth) ? Math.max(1, Math.min(8, Number(payload.max_depth))) : 5;

    const relationScore: Record<CausalEdgeType, number> = {
      causes: 1,
      blocks: 0.9,
      amplifies: 0.8,
      contributes_to: 0.65,
      correlates: 0.45,
    };

    const frontier: Array<{ id: string; depth: number; score: number; chain: string[] }> = [{ id: target, depth: 0, score: 1, chain: [target] }];
    const scored: Array<{ node_id: string; score: number; chain: string[] }> = [];
    const visited = new Set<string>();

    while (frontier.length > 0) {
      const cur = frontier.shift() as { id: string; depth: number; score: number; chain: string[] };
      if (cur.depth >= maxDepth) continue;
      const incoming = this.state.in.get(cur.id) ?? [];
      for (const edge of incoming) {
        const parent = edge.from;
        const rel = edge.relation;
        const nextScore = Number((cur.score * edge.weight * (relationScore[rel] ?? 0.5)).toFixed(4));
        const nextChain = [parent, ...cur.chain];
        scored.push({ node_id: parent, score: nextScore, chain: nextChain });
        const visitKey = `${parent}@${cur.depth + 1}`;
        if (!visited.has(visitKey)) {
          visited.add(visitKey);
          frontier.push({ id: parent, depth: cur.depth + 1, score: nextScore, chain: nextChain });
        }
      }
    }

    const bestByNode = new Map<string, { node_id: string; score: number; chain: string[] }>();
    for (const item of scored) {
      const prev = bestByNode.get(item.node_id);
      if (!prev || item.score > prev.score) {
        bestByNode.set(item.node_id, item);
      }
    }

    const ranked = Array.from(bestByNode.values()).sort((a, b) => b.score - a.score).slice(0, 12);
    return {
      target_node_id: target,
      root_causes: ranked.map((item) => ({
        node_id: item.node_id,
        node: this.state.nodes.get(item.node_id) ?? null,
        causal_score: item.score,
        causal_chain: item.chain,
      })),
    };
  }

  predictImpact(payload: { source_node_id: string; max_depth?: number }) {
    const source = text(payload.source_node_id);
    if (!this.state.nodes.has(source)) {
      throw new Error("source_node_id not found in causal graph");
    }
    const traversal = this.traverse({ start_node_id: source, direction: "downstream", max_depth: payload.max_depth ?? 4 });

    const impactByNode = new Map<string, number>();
    for (const e of traversal.traversed_edges as Array<Record<string, unknown>>) {
      const to = text(e.to);
      const score = Number(e.path_score ?? 0);
      const prev = impactByNode.get(to) ?? 0;
      if (score > prev) impactByNode.set(to, score);
    }

    const impacted = Array.from(impactByNode.entries())
      .map(([node_id, score]) => ({
        node_id,
        node: this.state.nodes.get(node_id) ?? null,
        impact_score: Number(score.toFixed(4)),
        impact_level: score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low",
      }))
      .sort((a, b) => b.impact_score - a.impact_score);

    return {
      source_node_id: source,
      impacted_entities: impacted,
    };
  }

  exampleLowCompactionChain() {
    return {
      target: "Body:compaction_degree_low",
      chain: [
        { node: "Weather:rainy", relation: "causes" },
        { node: "Body:moisture_content_high", relation: "causes" },
        { node: "Process:insufficient_rolling_times", relation: "contributes_to" },
        { node: "Body:compaction_degree_low", relation: "causes" },
      ],
      narrative: "压实度低 <- 雨天 <- 含水率高 <- 碾压次数不足",
    };
  }

  snapshot() {
    return {
      nodes: Array.from(this.state.nodes.values()),
      edges: [...this.state.edges],
    };
  }
}
