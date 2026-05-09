import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { analyzeSemanticConflict, getSemanticConflictSchema, type SemanticConflictResponse } from "./platform/api-client.ts";

const SAMPLE_RULES = [
  {
    rule_id: "R1",
    slotKey: "compaction_degree",
    operator: ">=",
    threshold: 95,
    scope: "highway_level_1",
    semantic_text: "Compaction degree must be at least 95.",
    standard_level: "industry",
    version: "v1",
  },
  {
    rule_id: "R2",
    slotKey: "compaction_degree",
    operator: ">=",
    threshold: 96,
    scope: "highway_level_1",
    semantic_text: "Compaction degree shall not be below 96.",
    standard_level: "local",
    version: "v2",
  },
  {
    rule_id: "R3",
    slotKey: "compaction_degree",
    operator: "<=",
    threshold: 94,
    scope: "highway_level_1",
    semantic_text: "Compaction degree must not exceed 94.",
    standard_level: "enterprise",
    version: "v1",
  },
];

function parseRules(text: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("rules must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("rules must be a JSON array");
  }
  return parsed.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>>;
}

export default function ConflictExplainability() {
  const [rulesText, setRulesText] = useState(JSON.stringify(SAMPLE_RULES, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<SemanticConflictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getSemanticConflictSchema();
      setSchema((resp?.conflict_schema ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await analyzeSemanticConflict({ rules: parseRules(rulesText) });
      setResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #fff7ed, #ffedd5)", color: "#1f2937", padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", background: "rgba(255,255,255,0.94)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Conflict Explainability</h1>
        <p style={{ marginTop: 0 }}>AI automatic semantic conflict detection with explainability and precedence suggestion.</p>

        <form onSubmit={onAnalyze}>
          <label>
            Rules JSON
            <textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnDark}>{loading ? "Analyzing..." : "Analyze Conflicts"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnLight}>Reload Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>conflict engine</summary>
          <pre>{JSON.stringify(result?.conflict_engine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>semantic compare algorithm</summary>
          <pre>{JSON.stringify(result?.semantic_compare_algorithm ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>precedence rules</summary>
          <pre>{JSON.stringify(result?.precedence_rules ?? schema?.outputs ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>conflict results</summary>
          <pre>{JSON.stringify(result?.conflicts ?? [], null, 2)}</pre>
        </details>
        <details style={panelStyle}>
          <summary>conflict schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 240,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #fdba74",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #fed7aa", borderRadius: 10, padding: 10, background: "#fff7ed" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnDark: CSSProperties = { borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnLight: CSSProperties = { borderRadius: 10, border: "1px solid #9ca3af", background: "#f9fafb", color: "#111827", padding: "8px 12px", cursor: "pointer" };

