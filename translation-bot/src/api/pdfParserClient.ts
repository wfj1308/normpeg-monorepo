export type ParseOptions = {
  extractTables?: boolean;
  extractFormulas?: boolean;
  ocrLanguage?: string;
};

export type ExtractedData = {
  metadata: Record<string, unknown>;
  chapters: Array<Record<string, unknown>>;
  tables: Array<Record<string, unknown>>;
  formulas: Array<Record<string, unknown>>;
  clauses: Array<Record<string, unknown>>;
};

export type ParseResult = {
  parseId: string;
  status: "success" | "partial" | "failed";
  extractedData: ExtractedData;
  rawText: string;
  confidence: number;
  reviewRequired: boolean;
  error?: string;
};

export type ValidateResult = {
  valid: boolean;
  errors: string[];
};

export class PDFParseAPIClient {
  constructor(private readonly baseUrl = "http://127.0.0.1:8010") {}

  async parse(file: File, standardCode: string, options: ParseOptions = {}): Promise<ParseResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("standardCode", standardCode);
    formData.append(
      "options",
      JSON.stringify({
        extractTables: options.extractTables ?? true,
        extractFormulas: options.extractFormulas ?? true,
        ocrLanguage: options.ocrLanguage ?? "chi_sim+eng",
      }),
    );

    const response = await fetch(`${this.baseUrl}/v1/pdf/parse`, {
      method: "POST",
      body: formData,
    });
    const body = (await response.json()) as ParseResult;
    if (!response.ok || body.status === "failed") {
      throw new Error(body.error ?? `PDF parse failed: ${response.status}`);
    }
    return body;
  }

  async validate(extractedData: ExtractedData, targetSchema = "SPU-v1"): Promise<ValidateResult> {
    const response = await fetch(`${this.baseUrl}/v1/pdf/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extractedData, targetSchema }),
    });
    const body = (await response.json()) as ValidateResult;
    if (!response.ok) {
      throw new Error(`PDF validate failed: ${response.status}`);
    }
    return body;
  }
}

