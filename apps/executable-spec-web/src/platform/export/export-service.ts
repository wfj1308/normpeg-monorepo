import { getPlatformApiBase } from "../api-client.ts";
import type { ContainerProof, SPUDefinition } from "../types.ts";

export type ExportedSpuArtifacts = {
  markdown: string;
  json: Record<string, unknown>;
  bundleBlob: Blob;
  bundleFileName: string;
};

type ExportResponse = {
  markdown: string;
  json: Record<string, unknown>;
  downloadUrl: string;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      detail = parsed.error ?? text;
    } catch {
      // Keep raw text as fallback.
    }
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("平台导出接口返回了非 JSON 内容");
  }
}

function normalizeBundleFileName(spuId: string, downloadUrl: string): string {
  const fromUrl = downloadUrl.split("/").pop() ?? "";
  const cleaned = decodeURIComponent(fromUrl).trim();
  if (cleaned) {
    return cleaned;
  }
  return `${spuId}.specbundle`;
}

export async function exportSpuArtifacts(spu: SPUDefinition): Promise<ExportedSpuArtifacts> {
  const apiBase = getPlatformApiBase();
  const exportResp = await fetch(`${apiBase}/api/v1/spec/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ spuId: spu.spuId }),
  });
  const exportData = await readJsonResponse<ExportResponse>(exportResp);

  const downloadResp = await fetch(`${apiBase}${exportData.downloadUrl}`);
  if (!downloadResp.ok) {
    throw new Error(`下载 SpecBundle 失败: ${downloadResp.status} ${downloadResp.statusText}`);
  }
  const bundleBlob = await downloadResp.blob();

  return {
    markdown: exportData.markdown,
    json: exportData.json,
    bundleBlob,
    bundleFileName: normalizeBundleFileName(spu.spuId, exportData.downloadUrl),
  };
}

export async function spuToMarkdown(spu: SPUDefinition): Promise<string> {
  const output = await exportSpuArtifacts(spu);
  return output.markdown;
}

export function proofToMarkdown(proof: ContainerProof): string {
  const specLines = proof.specResults
    .map((item) => `- \`${item.spuId}\`: ${item.status}, attempts=${item.attempts}, finalNode=${item.finalNodeId}`)
    .join("\n");
  const signatureLines = proof.signatures
    .map((item) => `${item.role}:${item.status}${item.signer ? `(${item.signer})` : ""}`)
    .join(", ");
  return `# Container Proof

- containerId: \`${proof.containerId}\`
- geoSlotRef: \`${proof.geoSlotRef}\`
- overallStatus: ${proof.overallStatus}
- archivedAt: ${proof.archivedAt}
- hash: \`${proof.hash ?? "-"}\`
- proofId: \`${proof.proofId}\`
- executionId: \`${proof.executionId ?? "-"}\`

## Spec Results
${specLines}

## Signatures
${signatureLines}

## Audit Count
${proof.auditTrail.length}
`;
}

export async function buildSpuSpecBundle(spu: SPUDefinition): Promise<Blob> {
  const output = await exportSpuArtifacts(spu);
  return output.bundleBlob;
}
