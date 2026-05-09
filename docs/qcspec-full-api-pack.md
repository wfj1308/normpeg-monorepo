# DocPeg 联调 API 清单（执行体逻辑版）

> 用途：直接转给 QCSPEC 前端同事联调。
> 范围：昨晚执行体逻辑落地后的可用 API，按业务闭环顺序整理。

## 0. 统一约定

### Base URL
- `https://api.docpeg.cn`

### OpenAPI
- `GET /openapi.json`

### 通用请求头
- `Content-Type: application/json`
- `x-actor-role: designer|contractor|supervisor|owner|admin`
- `x-actor-name: designer-user`
- 需要幂等时：`x-idempotency-key: <uuid>`

### 通用响应包
大多数接口：

```json
{
  "ok": true,
  "...": "业务字段"
}
```

---

## 1) 项目创建与基础信息（DocPeg）

### 1.1 创建项目
`POST /projects`

#### 请求参数
- Header：`x-idempotency-key`（可选）
- Body：

```json
{
  "project_id": "PJT-D34A70B8",
  "name": "PJT-D34A70B8",
  "description": "demo project"
}
```

#### 返回结构

```json
{
  "ok": true,
  "project": {
    "id": "PJT-D34A70B8",
    "name": "PJT-D34A70B8",
    "description": "demo project",
    "created_at": "2026-04-11T00:00:00.000Z"
  }
}
```

### 1.2 项目列表
`GET /projects`

#### 请求参数
- Query：`q`（可选）、`limit`（可选）、`offset`（可选）

#### 返回结构

```json
{
  "ok": true,
  "items": [
    {
      "id": "PJT-D34A70B8",
      "name": "PJT-D34A70B8",
      "description": "demo",
      "created_at": "..."
    }
  ],
  "total": 1
}
```

### 1.3 项目详情
`GET /projects/{projectId}`

#### 请求参数
- Path：`projectId`

#### 返回结构

```json
{
  "ok": true,
  "project": {
    "id": "PJT-D34A70B8",
    "name": "...",
    "description": "...",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

---

## 2) 主权层 / 执行体（ExecPeg）

### 2.1 执行 TripRole（核心）
`POST /api/v1/execpeg/execute`

#### 请求参数
- Body：

```json
{
  "tripRoleId": "highway_spu_creation@v1.0",
  "projectRef": "v://cn.project/PJT-D34A70B8",
  "componentRef": "v://cn.highway/G42",
  "context": {
    "autoData": {},
    "manualInput": {
      "highway_code": "G42",
      "highway_name": "沪蓉高速"
    }
  },
  "callbackUrl": "https://xxx/callback"
}
```

#### tripRoleId 当前可用
- `highway_spu_creation@v1.0`
- `register_project_participants@v1.0`
- `create_section@v1.0`

#### 返回结构

```json
{
  "ok": true,
  "execId": "EXEC-20260411-0001",
  "status": "EXECUTED",
  "proof": {
    "proofId": "PF-EXEC-...",
    "hash": "sha256:...",
    "valid": true
  },
  "nextRecommendedTrip": "register_project_participants@v1.0",
  "boqUpdate": {
    "componentRef": "v://...",
    "actualQty": 0,
    "smuConfirmed": false
  },
  "gateResult": {
    "passed": true,
    "reasons": []
  },
  "contextEcho": {
    "projectRef": "v://...",
    "componentRef": "v://..."
  }
}
```

### 2.2 查询执行状态
`GET /api/v1/execpeg/status/{execId}`

#### 请求参数
- Path：`execId`

#### 返回结构

```json
{
  "ok": true,
  "exec": {
    "execId": "EXEC-...",
    "status": "EXECUTED",
    "tripRoleId": "create_section@v1.0",
    "projectRef": "v://...",
    "componentRef": "v://...",
    "proofId": "PF-...",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

### 2.3 手工补录上下文
`POST /api/v1/execpeg/manual-input`

#### 请求参数

```json
{
  "execId": "EXEC-...",
  "manualInput": {
    "remarks": "现场补录",
    "operatorDid": "did:ir8:executor:zhangsan"
  }
}
```

#### 返回结构

```json
{
  "ok": true,
  "execId": "EXEC-...",
  "mergedContext": {
    "autoData": {},
    "manualInput": {
      "remarks": "现场补录",
      "operatorDid": "did:..."
    }
  }
}
```

### 2.4 注册执行模板
`POST /api/v1/execpeg/register`

#### 请求参数

```json
{
  "tripRoleId": "custom_trip@v1.0",
  "displayName": "自定义执行体",
  "schema": {},
  "gate": {},
  "actions": []
}
```

#### 返回结构

```json
{
  "ok": true,
  "tripRoleId": "custom_trip@v1.0",
  "version": "v1.0"
}
```

---

## 3) DTORole（角色权限）

### 3.1 写入/更新角色绑定
`POST /api/v1/dtorole/role-bindings`

#### 请求参数

```json
{
  "project_id": "PJT-D34A70B8",
  "subject": "designer-user",
  "role": "designer",
  "scopes": ["project.read", "trip.execute"]
}
```

#### 返回结构

```json
{
  "ok": true,
  "binding": {
    "id": "RB-...",
    "project_id": "PJT-D34A70B8",
    "subject": "designer-user",
    "role": "designer",
    "scopes": ["project.read", "trip.execute"],
    "updated_at": "..."
  }
}
```

### 3.2 查询角色绑定
`GET /api/v1/dtorole/role-bindings?project_id=...&subject=...`

#### 请求参数
- Query：`project_id`（可选）、`subject`（可选）

#### 返回结构

```json
{
  "ok": true,
  "items": [
    {
      "id": "RB-...",
      "project_id": "PJT-D34A70B8",
      "subject": "designer-user",
      "role": "designer",
      "scopes": ["..."]
    }
  ]
}
```

## 16) 项目合同上传与绑定（追加，按文档逻辑）

说明：项目合同建议作为“项目主权链证据对象”进行绑定。  
本节使用当前已落地接口组合实现，不破坏既有流程。

---

### 16.1 上传合同文件（R2）
`POST /upload`  
（别名：`POST /api/v1/files/upload`）

#### Header
- `x-upload-token` 或 `x-upload-session-token`
- `x-actor-role`（建议：`owner` / `designer`）
- `x-actor-name`

#### Body
- `multipart/form-data`
- 文件字段：`file`

#### 返回结构
```json
{
  "ok": true,
  "file": {
    "id": "FILE-...",
    "project_id": "PJT-...",
    "filename": "项目总承包合同.pdf",
    "content_type": "application/pdf",
    "size_bytes": 1234567,
    "sha256": "sha256:...",
    "r2_key": "projects/PJT-.../contracts/...",
    "created_at": "..."
  }
}
```

---

### 16.2 为项目创建“合同文档”对象
`POST /projects/{projectId}/documents`

#### Path 参数
- `projectId`

#### 请求体
```json
{
  "name": "项目合同（主合同）",
  "category": "contract",
  "doc_type": "project_contract",
  "meta": {
    "contract_no": "HT-2026-001",
    "contract_party_a": "业主单位",
    "contract_party_b": "总包单位"
  }
}
```

#### 返回结构
```json
{
  "ok": true,
  "document": {
    "id": "DOC-...",
    "project_id": "PJT-...",
    "name": "项目合同（主合同）",
    "category": "contract",
    "status": "draft",
    "created_at": "..."
  }
}
```

---

### 16.3 创建合同版本并挂接附件
`POST /projects/{projectId}/documents/{documentId}/versions`

#### 请求体
```json
{
  "version_no": "v1.0",
  "note": "首次上传主合同",
  "file_ids": ["FILE-..."]
}
```

#### 返回结构
```json
{
  "ok": true,
  "version": {
    "id": "VER-...",
    "document_id": "DOC-...",
    "version_no": "v1.0",
    "status": "draft",
    "created_at": "..."
  }
}
```

---

### 16.4 生成合同绑定证明（Proof）
`POST /v1/execpeg/execute`  
（别名：`POST /api/v1/execpeg/execute`）

#### 请求体（合同绑定建议 TripRole）
```json
{
  "tripRoleId": "bind_project_contract@v1.0",
  "projectRef": "v://cn.project/PJT-D34A70B8",
  "componentRef": "v://cn.project/PJT-D34A70B8",
  "context": {
    "manualInput": {
      "contract_document_id": "DOC-...",
      "contract_version_id": "VER-...",
      "contract_file_id": "FILE-...",
      "contract_hash": "sha256:..."
    }
  }
}
```

#### 返回结构
```json
{
  "ok": true,
  "execId": "EXEC-...",
  "status": "EXECUTED",
  "proof": {
    "proofId": "PF-...",
    "hash": "sha256:...",
    "valid": true
  },
  "nextRecommendedTrip": null
}
```

---

### 16.5 查询合同绑定状态（执行态）
`GET /v1/execpeg/status/{execId}`  
（别名：`GET /api/v1/execpeg/status/{execId}`）

#### 返回结构（示例关键字段）
```json
{
  "ok": true,
  "execId": "EXEC-...",
  "status": "EXECUTED",
  "gateResult": {
    "passed": true
  },
  "proof": {
    "proofId": "PF-...",
    "hash": "sha256:...",
    "valid": true
  },
  "output": {
    "contract_bound": true,
    "contract_document_id": "DOC-...",
    "contract_version_id": "VER-..."
  }
}
```

---

### 16.6 推荐联调调用顺序（给前端同事）
1. `POST /upload` 上传合同文件，拿到 `file.id` 与 `sha256`
2. `POST /projects/{projectId}/documents` 创建合同文档（`category=contract`）
3. `POST /projects/{projectId}/documents/{documentId}/versions` 创建版本并挂 `file_ids`
4. `POST /v1/execpeg/execute` 执行 `bind_project_contract@v1.0`，产出 `proof`
5. `GET /v1/execpeg/status/{execId}` 轮询确认 `contract_bound=true`

### 3.3 权限校验
`GET /api/v1/dtorole/permission-check?permission=...&project_id=...&actor_role=...&actor_name=...`

#### 请求参数
- Query：
  - `permission`（必填）
  - `project_id`（可选）
  - `actor_role`（可选）
  - `actor_name`（可选）

#### 返回结构

```json
{
  "ok": true,
  "allowed": true,
  "permission": "document.create",
  "actor": {
    "role": "designer",
    "name": "designer-user"
  },
  "reason": "matched_by_role_binding"
}
```

---

## 4) LayerPeg（链状态与锚点）

### 4.1 链健康状态
`GET /api/v1/layerpeg/chain-status?project_id={projectId}`

#### 返回结构

```json
{
  "ok": true,
  "mode": "ready",
  "reason": "all_checks_passed",
  "checks": {
    "docpeg_api": { "ok": true, "count": 1 },
    "normref": { "ok": true, "count": 332 },
    "triprole": { "ok": true, "count": 51 },
    "layerpeg_proof": { "ok": true, "count": 105 },
    "boqitem": { "ok": true, "count": 55 },
    "documents": { "ok": true, "count": 2 }
  }
}
```

### 4.2 写锚点
`POST /api/v1/layerpeg/anchor`

#### 请求参数

```json
{
  "project_id": "PJT-D34A70B8",
  "entity_uri": "v://cn.docpeg/project/PJT-D34A70B8/entity/桥-400-1-1",
  "hash": "hash-test-002",
  "payload": {
    "source": "mobile",
    "note": "anchor from qcspec"
  }
}
```

#### 返回结构

```json
{
  "ok": true,
  "anchor_id": "ANCHOR-...",
  "hash": "hash-test-002",
  "created_at": "2026-04-10 06:12:51"
}
```

### 4.3 查锚点列表
`GET /api/v1/layerpeg/anchor?project_id=...&entity_uri=...`

#### 返回结构

```json
{
  "ok": true,
  "items": [
    {
      "id": "ANCHOR-...",
      "project_id": "PJT-D34A70B8",
      "entity_uri": "v://...",
      "hash": "hash-test-002",
      "payload": null,
      "created_by": "designer-user",
      "created_at": "..."
    }
  ]
}
```

---

## 5) TripRole（执行动作）

### 5.1 Trip 预演
`POST /api/v1/triprole/preview`

#### 请求参数

```json
{
  "project_id": "PJT-D34A70B8",
  "component_uri": "v://cn.docpeg/DJGS/pile/桥-400-1-1",
  "trip_role": "护筒埋设",
  "payload": {
    "inspection_location": "桥400 1 1"
  }
}
```

#### 返回结构

```json
{
  "ok": true,
  "preview": {
    "trip_role": "护筒埋设",
    "allowed": true,
    "required_fields": ["inspection_location"],
    "next_action": "submit"
  }
}
```

### 5.2 Trip 提交
`POST /api/v1/triprole/submit`

#### 请求参数

```json
{
  "project_id": "PJT-D34A70B8",
  "component_uri": "v://cn.docpeg/DJGS/pile/桥-400-1-1",
  "trip_role": "护筒埋设",
  "form_code": "桥施2表",
  "instance_id": "NINST-xxxx",
  "payload": {}
}
```

#### 返回结构

```json
{
  "ok": true,
  "trip_id": "TRIP-...",
  "status": "completed",
  "proof_id": "PROOF-...",
  "next_step": "成孔检查"
}
```

### 5.3 Trip 列表
`GET /api/v1/triprole/trips?project_id=...&component_uri=...`

#### 返回结构

```json
{
  "ok": true,
  "items": [
    {
      "trip_id": "TRIP-...",
      "project_id": "...",
      "component_uri": "...",
      "trip_role": "护筒埋设",
      "status": "completed",
      "proof_id": "PROOF-...",
      "created_at": "..."
    }
  ],
  "total": 1
}
```

---

## 6) NormRef（表单）

### 6.1 表单目录
`GET /api/v1/normref/projects/{projectId}/forms`

#### 返回结构

```json
{
  "ok": true,
  "items": [
    {
      "form_code": "桥施2表",
      "family": "bridge",
      "title": "钻（挖）孔桩护筒（壁）、桩位检查表"
    }
  ]
}
```

### 6.2 表单模板
`GET /api/v1/normref/projects/{projectId}/forms/{formCode}`

#### 返回结构

```json
{
  "ok": true,
  "form": {
    "form_code": "桥施2表",
    "family": "bridge",
    "template": {},
    "protocol_stub": {}
  }
}
```

### 6.3 interpret-preview
`POST /api/v1/normref/projects/{projectId}/forms/{formCode}/interpret-preview`

#### 请求参数

```json
{
  "input_json": {
    "component_uri": "v://...",
    "pile_id": "桥-400-1-1",
    "inspection_location": "桥400 1 1"
  }
}
```

#### 返回结构

```json
{
  "ok": true,
  "preview": {
    "raw": {},
    "normalized": {},
    "derived": {},
    "gate_check": {},
    "proof_preview": {}
  }
}
```

### 6.4 保存草稿
`POST /api/v1/normref/projects/{projectId}/forms/{formCode}/draft-instances`

#### 请求参数

```json
{
  "input_json": {},
  "normalized_json": {},
  "derived_json": {},
  "component_uri": "v://...",
  "pile_id": "桥-400-1-1",
  "inspection_location": "桥400 1 1"
}
```

#### 返回结构

```json
{
  "ok": true,
  "instance_id": "NINST-...",
  "status": "draft",
  "updated_at": "..."
}
```

### 6.5 最新草稿
`GET /api/v1/normref/projects/{projectId}/forms/{formCode}/draft-instances/latest?component_uri=...`

#### 返回结构

```json
{
  "ok": true,
  "instance": {
    "instance_id": "NINST-...",
    "status": "draft",
    "input_json": {},
    "updated_at": "..."
  }
}
```

### 6.6 提交草稿
`POST /api/v1/normref/projects/{projectId}/forms/{formCode}/draft-instances/{instanceId}/submit`

#### 请求参数

```json
{
  "actor_name": "designer-user",
  "actor_role": "designer"
}
```

#### 返回结构

```json
{
  "ok": true,
  "instance_id": "NINST-...",
  "status": "submitted",
  "trip_id": "TRIP-...",
  "proof_id": "PROOF-..."
}
```

### 6.7 最新已提交
`GET /api/v1/normref/projects/{projectId}/forms/{formCode}/latest-submitted?component_uri=...`

#### 返回结构

```json
{
  "ok": true,
  "instance": {
    "instance_id": "NINST-...",
    "status": "submitted",
    "submitted_at": "...",
    "proof_id": "PROOF-..."
  }
}
```

---

## 7) BOQItem（台账）

### 7.1 BOQ items
`GET /api/v1/boqitem/projects/{projectId}/items`

#### 返回结构

```json
{
  "ok": true,
  "items": [
    {
      "boq_item_ref": "桥-400-1-1-M001",
      "name": "Mock item",
      "qty_design": 1000,
      "qty_actual": 0,
      "status": "OPEN"
    }
  ]
}
```

### 7.2 consume
`POST /api/v1/boqitem/projects/{projectId}/consume`

#### 请求参数

```json
{
  "boq_item_ref": "桥-400-1-1-M001",
  "trip_id": "TRIP-...",
  "qty": 10
}
```

#### 返回结构

```json
{
  "ok": true,
  "boq_item_ref": "桥-400-1-1-M001",
  "qty_actual": 10,
  "qty_remaining": 990
}
```

### 7.3 settle
`POST /api/v1/boqitem/projects/{projectId}/settle`

#### 请求参数

```json
{
  "boq_item_ref": "桥-400-1-1-M001",
  "amount": 1000,
  "proof_id": "PROOF-..."
}
```

#### 返回结构

```json
{
  "ok": true,
  "settlement_id": "SETTLE-...",
  "boq_item_ref": "桥-400-1-1-M001",
  "amount": 1000,
  "status": "SETTLED"
}
```

---

## 8) Proof（核验）

### 8.1 Proof 详情
`GET /api/v1/proof/{proofId}`

#### 返回结构

```json
{
  "ok": true,
  "proof": {
    "proof_id": "PROOF-...",
    "hash": "sha256:...",
    "signatures": [],
    "snapshots": [],
    "result": "pass",
    "created_at": "..."
  }
}
```

### 8.2 Proof verify
`POST /api/v1/proof/{proofId}/verify`

#### 请求参数

```json
{
  "actor_name": "qa-user",
  "reason": "manual check"
}
```

#### 返回结构

```json
{
  "ok": true,
  "verified": true,
  "reason": "manual check"
}
```

---

## 9) Files（附件）

### 9.1 文件上传
`POST /api/v1/files/upload`

#### 请求参数
- Header：`x-upload-token`（或 `x-upload-session-token`）
- Body：`multipart/form-data`，字段：`file`

#### 返回结构

```json
{
  "ok": true,
  "file_id": "FILE-...",
  "url": "https://...",
  "hash": "sha256:...",
  "name": "report.docx",
  "size": 12345,
  "uploaded_at": "..."
}
```

### 9.2 绑定附件到 Proof
`POST /api/v1/proof/{proofId}/attachments`

#### 请求参数

```json
{
  "file_ids": ["FILE-1", "FILE-2"]
}
```

#### 返回结构

```json
{
  "ok": true,
  "proof_id": "PROOF-...",
  "attached": [
    { "file_id": "FILE-1", "status": "linked" },
    { "file_id": "FILE-2", "status": "linked" }
  ]
}
```

---

## 10) 工程树（QCSPEC 必需）

### 10.1 实体列表（工程树源）
`GET /projects/{projectId}/entities`

#### 请求参数
- Query：`status`（可选）、`entity_type`（可选：unit/division/subitem）、`search`（可选）

#### 返回结构

```json
{
  "ok": true,
  "items": [
    {
      "id": "ENT-...",
      "entity_uri": "v://cn.docpeg/project/PJT-D34A70B8/entity/桥-400-1-1",
      "entity_code": "桥-400-1-1",
      "entity_name": "钻孔灌注桩",
      "entity_type": "subitem",
      "parent_uri": "v://...",
      "location_chain": "K0+000-K1+000",
      "chain_id": "drilled-pile",
      "status": "active"
    }
  ],
  "total": 39
}
```

### 10.2 创建实体
`POST /projects/{projectId}/entities`

#### 请求参数

```json
{
  "entity_code": "100-1-1",
  "entity_name": "挖方路基",
  "entity_type": "subitem",
  "parent_uri": "v://.../entity/100-1",
  "location_chain": "K0+000-K1+000",
  "chain_id": "subgrade-001"
}
```

#### 返回结构

```json
{
  "ok": true,
  "entity": {
    "id": "ENT-...",
    "entity_uri": "v://...",
    "entity_code": "100-1-1",
    "entity_name": "挖方路基",
    "entity_type": "subitem",
    "chain_id": "subgrade-001",
    "created_at": "..."
  }
}
```

### 10.3 更新实体
`PATCH /projects/{projectId}/entities/{entityId}`

#### 请求参数

```json
{
  "entity_name": "挖方路基（更新）",
  "chain_id": "subgrade-001"
}
```

#### 返回结构

```json
{
  "ok": true,
  "entity": {
    "id": "ENT-...",
    "entity_name": "挖方路基（更新）",
    "chain_id": "subgrade-001",
    "updated_at": "..."
  }
}
```

---

## 11) 工序链（前端主流程）

### 11.1 链总览
`GET /projects/{projectId}/process-chains?source_mode=hybrid`

#### 返回结构

```json
{
  "ok": true,
  "items": [
    {
      "chain_id": "drilled-pile",
      "chain_name": "钻孔灌注桩工序链",
      "in_progress": 0,
      "completed": 0,
      "abnormal": 0
    }
  ]
}
```

### 11.2 链实例列表
`GET /projects/{projectId}/process-chains/{chainId}/list?source_mode=hybrid`

#### 返回结构

```json
{
  "ok": true,
  "items": [
    {
      "component_uri": "v://...",
      "pile_id": "桥-400-1-1",
      "chain_state": "processing",
      "current_step": "钢筋安装",
      "steps": [
        {
          "step_id": "bridge11",
          "step_name": "钢筋安装",
          "form_code": "桥施11表",
          "latest_instance": {
            "instance_id": "NINST-...",
            "status": "submitted",
            "updated_at": "..."
          }
        }
      ]
    }
  ],
  "total": 1
}
```

### 11.3 单体工作台状态
`GET /projects/{projectId}/process-chains/{chainId}/status?component_uri=...`

#### 返回结构

```json
{
  "ok": true,
  "chain_id": "drilled-pile",
  "component_uri": "v://...",
  "chain_state": "processing",
  "current_step": "钢筋安装",
  "complete": false,
  "steps": [
    {
      "step_id": "bridge2",
      "step_name": "护筒埋设",
      "form_code": "桥施2表",
      "latest_instance": {
        "instance_id": "NINST-...",
        "status": "submitted",
        "updated_at": "..."
      }
    }
  ]
}
```

---

## 12) 给前端同事的最小调用顺序（闭环）

1. `POST /projects`（建项目）
2. `POST /api/v1/execpeg/execute` + `highway_spu_creation@v1.0`
3. `POST /api/v1/execpeg/execute` + `register_project_participants@v1.0`
4. `POST /api/v1/execpeg/execute` + `create_section@v1.0`
5. `GET /projects/{projectId}/entities`（取工程树）
6. `GET /projects/{projectId}/process-chains`（取链）
7. `POST /api/v1/normref/.../interpret-preview`
8. `POST /api/v1/normref/.../draft-instances`
9. `POST /api/v1/normref/.../submit`
10. `GET /api/v1/proof/{proofId}` / `POST /api/v1/proof/{proofId}/verify`
11. `POST /api/v1/boqitem/.../consume` / `POST /api/v1/boqitem/.../settle`

---

## 13) projectId 如何确定

- 调 `GET /projects`
- 使用返回中的 `items[].id` 作为 `{projectId}`
- 示例：`PJT-D34A70B8`

---

## 14) 说明

- 本文档是联调用 API 包，不等于前端页面清单。
- 页面是否已切到这些新接口，需要另做前端接线验收。

---

## 15) `projects/new-root` 页面专用接口（已落地）

> 对应页面：`/docpeg/app/projects/new-root`  
> 目标：三步创建（SPU -> 参与方 -> 标段）+ 阶段验收查询。

### 15.1 第 1/2/3 步统一提交（按钮“创建高速公路SPU/注册项目参与方/创建标段”）
`POST /v1/execpeg/execute`  
（别名同样可用：`POST /api/v1/execpeg/execute`）

#### 请求参数（通用）

```json
{
  "tripRoleId": "highway_spu_creation@v1.0",
  "projectRef": "v://cn.highway/YADGS",
  "componentRef": "v://cn.highway/YADGS",
  "context": {
    "manualInput": {}
  },
  "callbackUrl": "https://example.com/callback"
}
```

#### 第 1 步字段映射（`highway_spu_creation@v1.0`）
- `manualInput.highwayName`
- `manualInput.sectionCode`（用于推导 `spuRef`）
- `manualInput.fullName`
- `manualInput.ownerDid`
- `manualInput.startDate`
- `manualInput.endDate`
- `manualInput.description`

#### 第 2 步字段映射（`register_project_participants@v1.0`）
- `manualInput.highwaySpuRef`
- `manualInput.participants[]`：
  - `execType`
  - `participantName`
  - `participantDid`
  - `participantRole`

#### 第 3 步字段映射（`create_section@v1.0`）
- `manualInput.highwaySpuRef`
- `manualInput.sectionCode`
- `manualInput.sectionName`
- `manualInput.sectionType`
- `manualInput.quantity`
- `manualInput.description`

#### 返回结构（通用）

```json
{
  "ok": true,
  "execId": "EXEC-...",
  "tripId": "TRIP-...",
  "status": "EXECUTED",
  "proof": {
    "proofId": "PF-...",
    "hash": "sha256:...",
    "valid": true
  },
  "output": {
    "spuRef": "v://cn.highway/YADGS",
    "sectionRef": "v://cn.highway/YADGS/section/YADGS"
  },
  "nextRecommendedTrip": "register_project_participants@v1.0",
  "callback": {
    "callbackUrl": "https://example.com/callback",
    "status": "pending",
    "httpStatus": null,
    "error": null
  }
}
```

### 15.2 阶段验收：查询执行状态（按钮“查询状态+回调日志”）
`GET /v1/execpeg/status/{execId}`  
（别名：`GET /api/v1/execpeg/status/{execId}`）

#### 返回结构

```json
{
  "ok": true,
  "execution": {
    "execId": "EXEC-...",
    "tripRoleId": "create_section@v1.0",
    "projectId": "PJT-D34A70B8",
    "projectRef": "v://cn.highway/YADGS",
    "componentRef": "v://cn.highway/YADGS/section/YADGS",
    "status": "EXECUTED",
    "context": {},
    "output": {},
    "proof": {},
    "nextRecommendedTrip": null,
    "boqUpdate": null,
    "gateResult": {
      "passed": true
    },
    "callbackStatus": "delivered",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### 15.3 阶段验收：查询回调日志
`GET /v1/execpeg/status/{execId}/callbacks`  
（别名：`GET /api/v1/execpeg/status/{execId}/callbacks`）

#### 返回结构

```json
{
  "ok": true,
  "execId": "EXEC-...",
  "total": 1,
  "items": [
    {
      "id": "CBLOG-...",
      "callbackUrl": "https://example.com/callback",
      "status": "delivered",
      "attemptNo": 1,
      "responseStatus": 200,
      "responseBody": "...",
      "error": null,
      "request": {},
      "createdAt": "..."
    }
  ]
}
```

### 15.4 手工补录（页面调试/修复）
`POST /v1/execpeg/manual-input`  
（别名：`POST /api/v1/execpeg/manual-input`）

#### 请求参数

```json
{
  "execId": "EXEC-...",
  "manualInput": {
    "remarks": "现场补录"
  }
}
```

#### 返回结构

```json
{
  "ok": true,
  "execId": "EXEC-...",
  "context": {
    "manualInput": {
      "remarks": "现场补录"
    }
  },
  "updatedAt": "..."
}
```

### 15.5 项目治理视图：高速公路 SPU 列表
`GET /v1/execpeg/highway-spus?q=...&limit=...&offset=...`  
（别名：`GET /api/v1/execpeg/highway-spus`）

#### 返回结构

```json
{
  "ok": true,
  "total": 1,
  "paging": {
    "limit": 20,
    "offset": 0
  },
  "items": [
    {
      "id": "SPU-...",
      "highway_code": "YADGS",
      "highway_name": "国襄高速",
      "full_name": "国襄高速 YADGS 标段工程",
      "owner_did": "did:ir8:org:guoxiang-highway",
      "start_date": "2026-04-01",
      "end_date": "2028-12-31",
      "description": "....",
      "spu_ref": "v://cn.highway/YADGS",
      "created_by": "designer-user",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### 15.6 项目治理视图：高速公路 SPU 详情（含参与方+标段+执行记录）
`GET /v1/execpeg/highway-spus/{spuRef}`  
（别名：`GET /api/v1/execpeg/highway-spus/{spuRef}`）

#### Path 参数
- `spuRef`（需 URL encode）

#### 返回结构

```json
{
  "ok": true,
  "spu": {
    "id": "SPU-...",
    "highway_code": "YADGS",
    "highway_name": "国襄高速",
    "spu_ref": "v://cn.highway/YADGS"
  },
  "participants": [
    {
      "id": "PART-...",
      "highway_spu_ref": "v://cn.highway/YADGS",
      "exec_type": "owner",
      "participant_name": "国襄高速集团",
      "participant_did": "did:ir8:org:guoxiang-highway",
      "participant_role": "owner",
      "created_by": "designer-user",
      "created_at": "..."
    }
  ],
  "sections": [
    {
      "id": "SEC-...",
      "highway_spu_ref": "v://cn.highway/YADGS",
      "section_code": "YADGS",
      "section_name": "K0+000 ~ K5+000 路基桥梁段",
      "section_type": "sub_project",
      "quantity": "5km",
      "description": "路基及桥梁施工标段",
      "section_ref": "v://cn.highway/YADGS/section/YADGS",
      "created_by": "designer-user",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "executions": [
    {
      "execId": "EXEC-...",
      "tripRoleId": "create_section@v1.0",
      "status": "EXECUTED",
      "gatePassed": true,
      "proof": {
        "proofId": "PF-...",
        "hash": "sha256:...",
        "valid": true
      },
      "nextRecommendedTrip": null,
      "output": {},
      "createdBy": "designer-user",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```
