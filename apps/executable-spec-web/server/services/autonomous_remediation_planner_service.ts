import { randomUUID } from "node:crypto";

interface RemediationPlanInput {
  failed_gate: Record<string, unknown>;
  runtime_reasoning: Record<string, unknown>;
  historical_remediation: Array<Record<string, unknown>>;
  project_context: Record<string, unknown>;
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

function arr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter((i) => i && typeof i === "object" && !Array.isArray(i)) as Array<Record<string, unknown>> : [];
}

export class AutonomousRemediationPlannerService {
  getSchema() {
    return {
      remediation_schema: {
        input: ["failed_gate", "runtime_reasoning", "historical_remediation", "project_context"],
        output: [
          "remediation_steps",
          "responsible_roles",
          "required_materials",
          "expected_result",
          "estimated_risk_reduction",
        ],
        constraints: [
          "remediation plan must include SpecIR and Gate traceability",
          "planner is suggestion-only and must not auto execute remediation",
        ],
      },
      planning_workflow: [
        "collect_failed_gate_and_reasoning",
        "retrieve_historical_successful_remediation",
        "compose_prioritized_steps_with_role_and_material",
        "estimate_expected_result_and_risk_reduction",
        "attach_traceability_and_non_execution_guard",
      ],
      page_plan: {
        title: "Remediation Planner",
        sections: [
          "remediation schema",
          "planning workflow",
          "plan result",
          "traceability",
          "execution guard",
        ],
      },
    };
  }

  plan(input: RemediationPlanInput) {
    const failedGate = input.failed_gate ?? {};
    const reasoning = input.runtime_reasoning ?? {};
    const historical = arr(input.historical_remediation);
    const context = input.project_context ?? {};

    const gateId = text(failedGate.gate_id ?? failedGate.gateId ?? "unknown_gate");
    const slotKey = text(failedGate.slotKey ?? failedGate.slot_key ?? "unknown_slot");
    const ruleId = text(failedGate.rule_id ?? failedGate.ruleId ?? "unknown_rule");
    const actualValue = num(failedGate.actual_value ?? failedGate.actual);
    const expectedValue = num(failedGate.expected_value ?? failedGate.expected ?? failedGate.threshold);
    const severity = text(failedGate.severity || "medium").toLowerCase();

    const rootCauses = arr(reasoning.root_causes);
    const causeTypes = rootCauses.map((c) => text(c.type).toLowerCase()).filter(Boolean);

    const reused = historical
      .filter((h) => text(h.memory_type).includes("successful") || text(h.memory_type).includes("accepted"))
      .slice(0, 5);

    const remediationSteps: Array<Record<string, unknown>> = [];
    remediationSteps.push({
      step_id: "step_1",
      title: "现场复核失败 Gate 输入",
      detail: `复核 ${slotKey} 实测值与采集链路，确认 Gate(${gateId}) 失败数据可复现。`,
      based_on: "failed_gate",
    });

    if (causeTypes.includes("abnormal_sensor_data")) {
      remediationSteps.push({
        step_id: "step_2",
        title: "传感器校准与异常点剔除",
        detail: "对异常传感器执行校准，剔除异常尖峰数据后进行模拟复算。",
        based_on: "runtime_reasoning.root_causes.abnormal_sensor_data",
      });
    }
    if (causeTypes.includes("material_issue")) {
      remediationSteps.push({
        step_id: "step_3",
        title: "材料与含水率纠偏",
        detail: "复检材料批次与含水率，必要时调整材料配比并复测。",
        based_on: "runtime_reasoning.root_causes.material_issue",
      });
    }
    if (causeTypes.includes("process_issue") || causeTypes.includes("sequencing_issue")) {
      remediationSteps.push({
        step_id: "step_4",
        title: "工序重排与参数补偿",
        detail: "按依赖链重排工序并补偿关键工艺参数，完成后触发复检。",
        based_on: "runtime_reasoning.root_causes.process_or_sequence",
      });
    }
    if (causeTypes.includes("missing_proof")) {
      remediationSteps.push({
        step_id: "step_5",
        title: "补齐缺失 Proof 证据",
        detail: "补录所需证据与签名，确保 Proof 完整可追溯。",
        based_on: "runtime_reasoning.root_causes.missing_proof",
      });
    }

    if (reused.length > 0) {
      remediationSteps.push({
        step_id: `step_${remediationSteps.length + 1}`,
        title: "复用历史成功整改案例",
        detail: `优先参考 ${reused.length} 条历史成功案例的整改动作与参数窗口。`,
        based_on: "historical_remediation",
      });
    }

    remediationSteps.push({
      step_id: `step_${remediationSteps.length + 1}`,
      title: "执行前评估与复检计划确认",
      detail: "输出建议方案并提交负责人审核；仅在人工确认后执行复检。",
      based_on: "planner_guard",
    });

    const responsibleRoles = Array.from(new Set([
      "site_engineer",
      "qa_inspector",
      causeTypes.includes("equipment_issue") ? "equipment_engineer" : "",
      causeTypes.includes("material_issue") ? "material_engineer" : "",
      text(context.owner_role),
    ].filter(Boolean)));

    const requiredMaterials = Array.from(new Set([
      "inspection_checklist",
      "sensor_calibration_kit",
      causeTypes.includes("material_issue") ? "material_test_report" : "",
      causeTypes.includes("missing_proof") ? "proof_template_bundle" : "",
      text(context.required_material_hint),
    ].filter(Boolean)));

    const delta = actualValue !== null && expectedValue !== null ? Math.max(0, expectedValue - actualValue) : null;
    const baseReduction = severity === "critical" ? 0.42 : severity === "high" ? 0.34 : 0.26;
    const reuseBoost = reused.length > 0 ? Math.min(0.18, reused.length * 0.04) : 0;
    const riskReduction = Number(Math.min(0.9, baseReduction + reuseBoost).toFixed(3));

    return {
      plan_id: `remediation_plan_${randomUUID()}`,
      remediation_steps: remediationSteps,
      responsible_roles: responsibleRoles,
      required_materials: requiredMaterials,
      expected_result: {
        target_gate_id: gateId,
        target_slot: slotKey,
        expectation: expectedValue !== null
          ? `将 ${slotKey} 从当前值提升并达到 >= ${expectedValue}`
          : `使 Gate ${gateId} 重新满足规则 ${ruleId}`,
        estimated_recheck_pass_probability: Number((0.5 + riskReduction * 0.4).toFixed(3)),
      },
      estimated_risk_reduction: {
        value: riskReduction,
        unit: "ratio",
        rationale: delta !== null ? `current gap=${delta}; severity=${severity}; historical_reuse=${reused.length}` : `severity=${severity}; historical_reuse=${reused.length}`,
      },
      traceability: {
        SpecIR: {
          specir_id: text(failedGate.specir_id ?? failedGate.specirId ?? "unknown_specir"),
          normRef: text(failedGate.normRef ?? failedGate.normref ?? "unknown_normref"),
        },
        Gate: {
          gate_id: gateId,
          rule_id: ruleId,
          result: text(failedGate.result ?? "FAIL"),
        },
      },
      execution_guard: {
        auto_execute: false,
        policy: "suggestion_only",
        message: "Autonomous Remediation Planner only outputs suggestions and cannot execute remediation automatically.",
      },
      reused_historical_cases: reused,
    };
  }
}

