import { createNode, submitNode } from "../spu-runtime.ts";

import type { GateEvaluation, Proof, SPUNode } from "../spu-types.ts";

type JsonSchema = {
  type: string;
  description?: string;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

type NodeContext = {
  stake?: string;
  location?: string;
};

type StoredSpuNode = {
  nodeId: string;
  spuId: string;
  context?: NodeContext;
  node: SPUNode;
};

export type CreateSpuNodeInput = {
  spuId: string;
  containerId?: string;
  context?: NodeContext;
};

export type ExecuteSpuNodeInput = {
  nodeId: string;
  formData: Record<string, number>;
};

export type GetSpuNodeInput = {
  nodeId: string;
};

export type ValidateSpuDirectInput = {
  spuId: string;
  containerId?: string;
  formData: Record<string, number>;
  context?: NodeContext;
};

export type CreateSpuNodeOutput = {
  nodeId: string;
  spuId: string;
  status: "READY";
};

export type SpuNodeExecutionView = {
  nodeId?: string;
  spuId: string;
  status: SPUNode["status"];
  resultStatus?: "PASS" | "FAIL";
  inputs?: Record<string, number>;
  outputs?: Record<string, number>;
  gate?: GateEvaluation;
  proof?: Proof;
};

export type SpuMcpToolDefinition = {
  name: "create_spu_node" | "execute_spu_node" | "get_spu_node" | "validate_spu_direct";
  description: string;
  input_schema: JsonSchema;
};

let nextNodeSequence = 1;

function createNodeId(): string {
  const sequence = String(nextNodeSequence++).padStart(4, "0");
  return `spu-node-${Date.now().toString(36)}-${sequence}`;
}

function cloneNode(node: SPUNode): SPUNode {
  return {
    ...node,
    dependsOn: [...node.dependsOn],
    blockedByFailure: node.blockedByFailure,
    isAutoUnlocked: node.isAutoUnlocked,
    loadedForms: [...node.loadedForms],
    loadedPath: [...node.loadedPath],
    loadedRules: [...node.loadedRules],
    execution_result: node.execution_result ? { ...node.execution_result } : undefined,
    gate_result: node.gate_result
      ? {
          ...node.gate_result,
          results: node.gate_result.results.map((result) => ({ ...result })),
        }
      : undefined,
    proof: node.proof
      ? {
          ...node.proof,
          result: { ...node.proof.result },
          calculationTrace: node.proof.calculationTrace.map((trace) => ({
            ...trace,
            inputs: { ...trace.inputs },
          })),
          gateDecisions: node.proof.gateDecisions.map((decision) => ({ ...decision })),
          requiredSignatures: [...node.proof.requiredSignatures],
          pendingSignatures: [...node.proof.pendingSignatures],
          signedBy: node.proof.signedBy ? [...node.proof.signedBy] : undefined,
          inputs: node.proof.inputs ? { ...node.proof.inputs } : undefined,
          outputs: node.proof.outputs ? { ...node.proof.outputs } : undefined,
          trace: node.proof.trace ? node.proof.trace.map((trace) => ({ ...trace })) : undefined,
          gate: node.proof.gate
            ? {
                ...node.proof.gate,
                results: node.proof.gate.results.map((result) => ({ ...result })),
              }
            : undefined,
        }
      : undefined,
  };
}

function toExecutionView(entry: StoredSpuNode): SpuNodeExecutionView {
  const node = entry.node;
  return {
    nodeId: entry.nodeId,
    spuId: entry.spuId,
    status: node.status,
    resultStatus: node.proof?.result.status,
    inputs: node.proof?.inputs ? { ...node.proof.inputs } : undefined,
    outputs: node.execution_result ? { ...node.execution_result } : undefined,
    gate: node.gate_result
      ? {
          ...node.gate_result,
          results: node.gate_result.results.map((result) => ({ ...result })),
        }
      : undefined,
    proof: node.proof
      ? {
          ...node.proof,
          result: { ...node.proof.result },
          calculationTrace: node.proof.calculationTrace.map((trace) => ({
            ...trace,
            inputs: { ...trace.inputs },
          })),
          gateDecisions: node.proof.gateDecisions.map((decision) => ({ ...decision })),
          requiredSignatures: [...node.proof.requiredSignatures],
          pendingSignatures: [...node.proof.pendingSignatures],
          signedBy: node.proof.signedBy ? [...node.proof.signedBy] : undefined,
          inputs: node.proof.inputs ? { ...node.proof.inputs } : undefined,
          outputs: node.proof.outputs ? { ...node.proof.outputs } : undefined,
          trace: node.proof.trace ? node.proof.trace.map((trace) => ({ ...trace })) : undefined,
          gate: node.proof.gate
            ? {
                ...node.proof.gate,
                results: node.proof.gate.results.map((result) => ({ ...result })),
              }
            : undefined,
        }
      : undefined,
  };
}

function createToolDefinition(
  name: SpuMcpToolDefinition["name"],
  description: string,
  properties: Record<string, JsonSchema>,
  required: string[],
): SpuMcpToolDefinition {
  return {
    name,
    description,
    input_schema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };
}

function createNodeStore(): Record<string, StoredSpuNode> {
  return {};
}

export const nodeStore = createNodeStore();

export const spuMcpToolDefinitions: SpuMcpToolDefinition[] = [
  createToolDefinition(
    "create_spu_node",
    "创建规范节点，不执行。",
    {
      spuId: { type: "string", description: "SPU identifier" },
      containerId: { type: "string", description: "Optional Space Container id" },
      context: {
        type: "object",
        description: "Optional execution context",
        additionalProperties: false,
        properties: {
          stake: { type: "string" },
          location: { type: "string" },
        },
      },
    },
    ["spuId"],
  ),
  createToolDefinition(
    "execute_spu_node",
    "执行规范节点并返回结果。",
    {
      nodeId: { type: "string", description: "Node identifier returned by create_spu_node" },
      formData: { type: "object", description: "Numeric form inputs" },
    },
    ["nodeId", "formData"],
  ),
  createToolDefinition(
    "get_spu_node",
    "查询规范节点当前状态。",
    {
      nodeId: { type: "string", description: "Node identifier" },
    },
    ["nodeId"],
  ),
  createToolDefinition(
    "validate_spu_direct",
    "创建并执行规范节点，直接返回结果。",
    {
      spuId: { type: "string", description: "SPU identifier" },
      containerId: { type: "string", description: "Optional Space Container id" },
      formData: { type: "object", description: "Numeric form inputs" },
      context: {
        type: "object",
        description: "Optional execution context",
        additionalProperties: false,
        properties: {
          stake: { type: "string" },
          location: { type: "string" },
        },
      },
    },
    ["spuId", "formData"],
  ),
];

export function resetSpuMcpNodeStore(): void {
  for (const key of Object.keys(nodeStore)) {
    delete nodeStore[key];
  }
  nextNodeSequence = 1;
}

export function createSpuNodeTool(input: CreateSpuNodeInput): CreateSpuNodeOutput {
  const node = createNode({
    spuId: input.spuId,
    containerId: input.containerId,
  });
  const nodeId = createNodeId();
  nodeStore[nodeId] = {
    nodeId,
    spuId: input.spuId,
    context: input.context,
    node: cloneNode(node),
  };

  return {
    nodeId,
    spuId: input.spuId,
    status: "READY",
  };
}

export function executeSpuNodeTool(input: ExecuteSpuNodeInput): SpuNodeExecutionView {
  const entry = nodeStore[input.nodeId];
  if (!entry) {
    throw new Error(`SPU node not found: ${input.nodeId}`);
  }

  const runtimeNode = createNode({
    spuId: entry.spuId,
    containerId: entry.node.container_ref,
  });
  const executedNode = submitNode(runtimeNode, input.formData);
  const nextEntry: StoredSpuNode = {
    ...entry,
    node: cloneNode(executedNode),
  };
  nodeStore[input.nodeId] = nextEntry;

  return toExecutionView(nextEntry);
}

export function getSpuNodeTool(input: GetSpuNodeInput): SpuNodeExecutionView {
  const entry = nodeStore[input.nodeId];
  if (!entry) {
    throw new Error(`SPU node not found: ${input.nodeId}`);
  }

  return toExecutionView(entry);
}

export function validateSpuDirectTool(input: ValidateSpuDirectInput): SpuNodeExecutionView {
  const runtimeNode = createNode({
    spuId: input.spuId,
    containerId: input.containerId,
  });
  const executedNode = submitNode(runtimeNode, input.formData);
  return toExecutionView({
    nodeId: createNodeId(),
    spuId: input.spuId,
    context: input.context,
    node: cloneNode(executedNode),
  });
}

export const spuMcpToolHandlers = {
  create_spu_node: createSpuNodeTool,
  execute_spu_node: executeSpuNodeTool,
  get_spu_node: getSpuNodeTool,
  validate_spu_direct: validateSpuDirectTool,
} as const;

export function invokeSpuMcpTool(
  name: keyof typeof spuMcpToolHandlers,
  input: CreateSpuNodeInput | ExecuteSpuNodeInput | GetSpuNodeInput | ValidateSpuDirectInput,
): CreateSpuNodeOutput | SpuNodeExecutionView {
  const handler = spuMcpToolHandlers[name] as (payload: typeof input) => CreateSpuNodeOutput | SpuNodeExecutionView;
  return handler(input);
}

export function registerSpuMcpTools(
  register: (
    definition: SpuMcpToolDefinition,
    handler: (input: Record<string, unknown>) => CreateSpuNodeOutput | SpuNodeExecutionView,
  ) => void,
): void {
  for (const definition of spuMcpToolDefinitions) {
    const handler = spuMcpToolHandlers[definition.name] as (input: Record<string, unknown>) => CreateSpuNodeOutput | SpuNodeExecutionView;
    register(definition, handler);
  }
}
