# SPU Regression Test System

Updated: 2026-04-23

## Goal

Build a stable regression baseline for existing SPU/Gate behavior.
After any SPU or Gate change, run one command to detect behavior drift early.

This work does not add new business features. It standardizes test data and execution.

## Scope

- Runtime: `apps/executable-spec-web`
- Execution path: `Gate evaluate` (`evaluateGateRequest`)
- Coverage baseline: all SPUs currently registered in `PlatformService` default registry

## Directory Layout

```text
apps/executable-spec-web/tests/spu_regression/
  runner.ts
  spu-regression-suite.test.ts
  cases/
    highway.subgrade.compaction.4.2.1@v1.json
    highway.subgrade.thickness.4.2.3@v1.json
    highway.subgrade.deflection.4.2.2@v1.json
```

## Case Data Contract

Each SPU file must include:

1. `passCases`
2. `failCases`
3. `boundaryCases`

Minimal structure:

```json
{
  "spuId": "highway.subgrade.compaction.4.2.1@v1",
  "passCases": [
    {
      "caseId": "example_pass",
      "inputs": {},
      "expected": {
        "status": "PASS",
        "result": {
          "outcome": "PASS",
          "gateStatus": "PASS",
          "passed": true
        },
        "explanationIncludes": ["Gate evaluation passed"],
        "matchedRules": [{ "ruleId": "RULE-XXX", "passed": true }],
        "outputChecks": [{ "field": "outputField", "operator": "gte", "value": 0 }]
      }
    }
  ],
  "failCases": [],
  "boundaryCases": []
}
```

`outputChecks.operator` supports:

- `eq`
- `gte`
- `lte`
- `approx` (`tolerance` optional)

## Generic Runner Behavior

Runner file: `apps/executable-spec-web/tests/spu_regression/runner.ts`

Pipeline per case:

1. Load case suite JSON.
2. Check coverage:
   1. every registered SPU has a suite file
   2. no unknown SPU suite exists
3. Build an isolated container bound to one SPU.
4. Call `evaluateGateRequest` (Gate evaluate).
5. Compare key fields:
   1. `status`
   2. `result.outcome`
   3. `result.gateStatus`
   4. `result.passed`
   5. `explanation` keyword
   6. `matchedRules` (rule id + pass/fail)
   7. selected outputs
6. Aggregate failure report with failed rule ids for quick diagnosis.

## One-Command Regression

From `apps/executable-spec-web`:

```bash
npm run test:spu-regression
```

## Current Baseline (Core 3 SPUs)

Configured suites:

1. `highway.subgrade.compaction.4.2.1@v1`
2. `highway.subgrade.thickness.4.2.3@v1`
3. `highway.subgrade.deflection.4.2.2@v1`

Each suite includes pass/fail/boundary samples.

## How Failures Are Reported

Failure lines include:

1. `spuId`
2. case category (`pass|fail|boundary`)
3. `caseId`
4. expected vs actual status
5. failed rule ids (if any)
6. assertion message

This makes it fast to locate which rule type regressed.
