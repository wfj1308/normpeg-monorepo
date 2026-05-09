import { randomUUID } from "node:crypto";

interface PredictiveInput {
  historical_runtime_traces: Array<Record<string, unknown>>;
  current_body_values: Record<string, unknown>;
  sensor_trends: Array<Record<string, unknown>>;
  weather: Record<string, unknown>;
  process_schedule: Record<string, unknown>;
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export class PredictiveRuntimeEngineService {
  getSchema() {
    return {
      prediction_schema: {
        input: ["historical_runtime_traces", "current_body_values", "sensor_trends", "weather", "process_schedule"],
        output: ["predicted_failures", "risk_probability", "affected_forms", "suggested_prevention"],
        constraints: ["prediction must include confidence", "prediction must not modify gate state"],
      },
      forecasting_pipeline: [
        "feature_extraction_from_history",
        "trend_risk_scoring",
        "context_adjustment_by_weather_and_schedule",
        "gate_failure_probability_estimation",
        "prevention_recommendation_generation",
      ],
      page_plan: {
        title: "Predictive Risk Dashboard",
        sections: ["prediction schema", "forecasting pipeline", "predicted failures", "risk probability", "affected forms", "suggested prevention"],
      },
    };
  }

  predict(input: PredictiveInput) {
    const traces = Array.isArray(input.historical_runtime_traces) ? input.historical_runtime_traces : [];
    const trends = Array.isArray(input.sensor_trends) ? input.sensor_trends : [];
    const body = input.current_body_values ?? {};
    const weather = input.weather ?? {};
    const schedule = input.process_schedule ?? {};

    const historicalFailRate = (() => {
      if (traces.length === 0) return 0.2;
      const fail = traces.filter((t) => text(t.result ?? t.status).toUpperCase() === "FAIL").length;
      return fail / traces.length;
    })();

    const trendRisk = (() => {
      if (trends.length === 0) return 0.2;
      let score = 0;
      for (const t of trends) {
        const slope = num(t.slope) ?? num(t.delta) ?? 0;
        const anomaly = String(t.anomaly ?? "").toLowerCase() === "true";
        if (Math.abs(slope) > 5) score += 0.18;
        if (anomaly) score += 0.25;
      }
      return clamp(score / Math.max(1, trends.length), 0, 1);
    })();

    const bodyRisk = (() => {
      let score = 0;
      const comp = num((body as Record<string, unknown>).compaction_degree);
      const moisture = num((body as Record<string, unknown>).moisture_content);
      if (comp !== null && comp < 95) score += 0.35;
      if (moisture !== null && moisture > 8) score += 0.25;
      return clamp(score, 0, 1);
    })();

    const weatherRisk = (() => {
      const rainy = text((weather as Record<string, unknown>).condition).toLowerCase().includes("rain");
      const humidity = num((weather as Record<string, unknown>).humidity) ?? 0;
      let score = 0;
      if (rainy) score += 0.25;
      if (humidity > 85) score += 0.15;
      return clamp(score, 0, 1);
    })();

    const scheduleRisk = (() => {
      const compressed = String((schedule as Record<string, unknown>).compressed ?? "").toLowerCase() === "true";
      const pendingCritical = num((schedule as Record<string, unknown>).pending_critical_steps) ?? 0;
      let score = 0;
      if (compressed) score += 0.2;
      if (pendingCritical > 3) score += 0.2;
      return clamp(score, 0, 1);
    })();

    const riskProbability = clamp(
      historicalFailRate * 0.3 + trendRisk * 0.2 + bodyRisk * 0.25 + weatherRisk * 0.15 + scheduleRisk * 0.1,
      0,
      1,
    );

    const confidence = clamp(0.45 + Math.min(0.45, traces.length / 200 + trends.length / 120), 0.45, 0.9);

    const predictedFailures = [] as Array<Record<string, unknown>>;
    if (riskProbability >= 0.4) {
      predictedFailures.push({
        prediction_id: `pred_fail_${randomUUID()}`,
        gate_id: "default_gate",
        likely_failure: true,
        probability: Number(riskProbability.toFixed(3)),
        confidence: Number(confidence.toFixed(3)),
        horizon: "next_execution_window",
        reason_signals: {
          historical_fail_rate: Number(historicalFailRate.toFixed(3)),
          trend_risk: Number(trendRisk.toFixed(3)),
          body_risk: Number(bodyRisk.toFixed(3)),
          weather_risk: Number(weatherRisk.toFixed(3)),
          schedule_risk: Number(scheduleRisk.toFixed(3)),
        },
      });
    }

    const affectedForms = Array.from(new Set(
      traces.map((t) => text(t.form_code)).filter(Boolean)
        .concat(trends.map((t) => text(t.form_code)).filter(Boolean)),
    ));

    const suggestedPrevention: string[] = [];
    if (bodyRisk > 0.2) suggestedPrevention.push("Pre-adjust key body parameters and run precheck gate simulation");
    if (trendRisk > 0.2) suggestedPrevention.push("Inspect sensor trend drift and recalibrate abnormal devices");
    if (weatherRisk > 0.2) suggestedPrevention.push("Apply rainy-weather process protection and extend curing/compaction window");
    if (scheduleRisk > 0.2) suggestedPrevention.push("Decompress critical process schedule and clear dependency bottlenecks");
    if (suggestedPrevention.length === 0) suggestedPrevention.push("Keep current process and continue live monitoring");

    return {
      predicted_failures: predictedFailures,
      risk_probability: {
        overall: Number(riskProbability.toFixed(3)),
        confidence: Number(confidence.toFixed(3)),
        level: riskProbability >= 0.75 ? "high" : riskProbability >= 0.45 ? "medium" : "low",
      },
      affected_forms: affectedForms,
      suggested_prevention: suggestedPrevention,
      non_mutation_guard: {
        gate_modified: false,
        message: "predictive engine is read-only and does not mutate gate state",
      },
    };
  }
}
