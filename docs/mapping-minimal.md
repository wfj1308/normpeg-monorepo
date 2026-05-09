# Mapping Minimal Kernel

## 目标

提供最小 Mapping 核心能力：输入桩号（`stake`），查询并聚合当前执行状态，输出施工可读的最小视图。

本实现只做：

- 查询
- 聚合

不做：

- `v://` 完整协议扩展
- UTXO 复杂模型

## 输入

- `stake`（例如 `K30+020`）

## 输出（最小聚合视图）

`MappingMinimalStakeView`：

- `stake`
- `containers[]`
  - `container`：容器基础信息（id、生命周期、总体状态、当前运行指针）
  - `spuExecutionStatuses[]`：SPU 执行状态（`DRAFT/RUNNING/PASS/FAIL`、版本、最新节点）
  - `proofSummary`
    - `latestProofId`
    - `latestProofStatus`
    - `totalProofs`
    - `items[]`（proof kind/status/hash/time）
  - `currentStateSummary`：当前状态摘要
- `summary`
  - `containerCount`
  - `totalSpuCount`
  - `draftSpuCount / runningSpuCount / passSpuCount / failSpuCount`
  - `totalProofCount`
  - `lastUpdatedAt`

## API

内部：

- `GET /api/mapping/minimal/by-stake?stake=...`

公开：

- `GET /api/public/v1/mappings/minimal/by-stake?stake=...`

## 实现说明

- 复用现有 `MappingEntry` 数据，不引入新协议层。
- 聚合逻辑按 stake 收集所有匹配 container 的 mapping 项，并输出容器级状态 + proof 摘要。
- 保持原有接口兼容：
  - `GET /api/mapping/by-stake` 仍返回单条 `MappingEntry`
  - 新 minimal 接口返回“同桩号全量容器聚合视图”

## 验收对齐

已满足：

- 输入桩号后，可看到该桩号下当前所有容器的执行状态
- 可直接看到 SPU 执行状态与 Proof 摘要
