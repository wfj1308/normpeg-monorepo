export type GenerateSPURequest = {
  standardCode: string;
  extractedData: Record<string, unknown>;
};

export type SPUGenerationResult = {
  taskId: string;
  status: "success" | "failed";
  spu: Record<string, unknown> | null;
  markdown: string | null;
  json: Record<string, unknown> | null;
  confidence: number;
  reviewPoints: string[];
  error?: string | null;
  downloadUrl?: string | null;
};

export type SPUValidationResult = {
  valid: boolean;
  errors: string[];
};

export class SPUGeneratorAPIClient {
  constructor(private readonly baseUrl = "http://127.0.0.1:8020") {}

  async generate(payload: GenerateSPURequest): Promise<SPUGenerationResult> {
    const response = await fetch(`${this.baseUrl}/v1/spu/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as SPUGenerationResult;
    if (!response.ok || body.status === "failed") {
      throw new Error(body.error ?? `SPU generate failed: ${response.status}`);
    }
    return body;
  }

  async validate(spu: Record<string, unknown>, targetSchema = "SPU-v1"): Promise<SPUValidationResult> {
    const response = await fetch(`${this.baseUrl}/v1/spu/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spu, targetSchema }),
    });
    const body = (await response.json()) as SPUValidationResult;
    if (!response.ok) {
      throw new Error(`SPU validate failed: ${response.status}`);
    }
    return body;
  }
}

