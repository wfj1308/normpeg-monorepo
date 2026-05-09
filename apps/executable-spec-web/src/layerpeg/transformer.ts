import type { AnchorReceipt } from "../platform/proof/anchor-service.ts";
import type { AuditEvent, ContainerProof, ExecutionNode, SPUDefinition, SpaceContainer } from "../platform/types.ts";
import type { LayerPegDocType, LayerPegDocument, LayerPegGateDecision } from "./document.ts";
import {
  buildLayerPegDocumentFromContainerProof,
  buildLayerPegDocumentFromExecutionNode,
  buildLayerPegDocumentFromSpu,
} from "./document_builder.ts";

export interface LayerPegTransformContext {
  ownerDid?: string | null;
  projectRef?: string | null;
  rootRef?: string | null;
  normRef?: {
    normRefId?: string;
    norm?: string;
    clause?: string;
    version?: string;
  } | null;
}

export interface LayerPegSpecTransformOptions extends LayerPegTransformContext {
  usi?: string;
  docVersion?: string;
  dependsOn?: string[];
}

export interface LayerPegNodeTransformOptions extends LayerPegTransformContext {
  usi?: string;
  spu?: SPUDefinition | null;
  container?: SpaceContainer | null;
  auditTrail?: AuditEvent[];
  anchorReceipt?: AnchorReceipt | null;
}

export interface LayerPegContainerProofTransformOptions extends LayerPegTransformContext {
  usi?: string;
  container?: SpaceContainer | null;
  auditTrail?: AuditEvent[];
  anchorReceipt?: AnchorReceipt | null;
}

export interface LayerPegDocumentIndexItem {
  usi: string;
  docType: LayerPegDocType;
  sourceRef: string;
  updatedAt: string;
  version: string;
  decision: LayerPegGateDecision;
  stateCurrent: string;
  payloadType: string;
}

export interface LayerPegDocumentRecordLike {
  usi: string;
  docType: LayerPegDocType;
  sourceRef: string;
  updatedAt: string;
  document: LayerPegDocument;
}

export interface LayerPegStandardOutput {
  format: "LayerPegDocument";
  schemaId: "layerpeg-document.schema.json";
  document: LayerPegDocument;
}

export function layerPegFromSpu(
  spu: SPUDefinition,
  options: LayerPegSpecTransformOptions = {},
): LayerPegDocument {
  return buildLayerPegDocumentFromSpu(spu, options);
}

export function layerPegFromNodeExecution(
  node: ExecutionNode,
  options: LayerPegNodeTransformOptions = {},
): LayerPegDocument {
  return buildLayerPegDocumentFromExecutionNode(node, options);
}

export function layerPegFromContainerProof(
  proof: ContainerProof,
  options: LayerPegContainerProofTransformOptions = {},
): LayerPegDocument {
  return buildLayerPegDocumentFromContainerProof(proof, options);
}

export function buildLayerPegDocumentIndexItem(record: LayerPegDocumentRecordLike): LayerPegDocumentIndexItem {
  return {
    usi: record.usi,
    docType: record.docType,
    sourceRef: record.sourceRef,
    updatedAt: record.updatedAt,
    version: record.document.header.version,
    decision: record.document.gate.decision,
    stateCurrent: String(record.document.state.current ?? ""),
    payloadType: record.document.body.payloadType,
  };
}

export function buildLayerPegDocumentIndex(records: LayerPegDocumentRecordLike[]): LayerPegDocumentIndexItem[] {
  return records.map((record) => buildLayerPegDocumentIndexItem(record));
}

export function toLayerPegStandardOutput(document: LayerPegDocument): LayerPegStandardOutput {
  return {
    format: "LayerPegDocument",
    schemaId: "layerpeg-document.schema.json",
    document,
  };
}
