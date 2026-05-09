# Catalog Asset Layer（第三阶段最小版）

更新时间：2026-04-23

目标：将现有 `catalog / market` 从“展示聚合”升级为“可管理资产层”，让 SPU/SpecBundle/模板都能以统一资产对象管理。

## 1. CatalogItem 结构

资产对象统一为 `CatalogItem`：

- `itemId`
- `type`：`spu | spec | template | specbundle`
- `title`
- `normSource`
- `version`
- `owner`
- `visibility`：`internal | public`
- `tags`
- `dependencies`
- `status`：`draft | published | deprecated`

补充字段（实现层）：

- `refSpuId`（当 `type=spu` 时关联已注册 SPU）
- `sourceType`
- `createdAt` / `updatedAt`

代码位置：`apps/executable-spec-web/server/services/component_catalog_service.ts`

## 2. 最小能力

### 2.1 browse

- `GET /api/catalog-assets`
- 支持过滤：`scope/types/statuses/owner/tags/includeDeprecated/limit`

### 2.2 search

- `GET /api/catalog-assets/search?q=...`
- 在 `title/itemId/normSource/tags/owner/dependencies` 上做最小相关性检索

### 2.3 publish

- `POST /api/catalog-assets/{itemId}/publish`
- 将资产提升为 `status=published`，默认切换为 `visibility=public`

### 2.4 deprecate

- `POST /api/catalog-assets/{itemId}/deprecate`
- 将资产状态置为 `deprecated`

### 2.5 import

- `POST /api/catalog-assets/import`
- 支持两类导入：
  1. `spu`：可附带 `definitionText`，先导入 registry，再生成/更新资产对象
  2. 非 `spu`（`spec/template/specbundle`）：直接创建资产对象

## 3. internal 与 market/public 区分

- `visibility=internal`：内部目录资产
- `visibility=public` 且 `status=published`：市场公开资产

兼容旧接口：

- `GET /api/component-catalogs`：目录汇总（兼容旧展示）
- `GET /api/component-catalogs/{catalogId}`
- `GET /api/component-catalogs/{catalogId}/components`
- `GET /api/component-market/listings`：仅返回 public + published 聚合结果

## 4. 与现有注册流程对接

系统在以下路径自动同步资产层：

1. `POST /api/registry/import`：导入 SPU 后创建/更新 `spu` 资产（默认 internal + draft）
2. `POST /api/registry/spu-versions/publish`：发布 SPU 后同步资产为 published（默认 public）
3. `POST /api/approval/candidates/{id}/publish`：审批发布时同步资产发布状态

因此“已注册 SPU”不再只是列表项，而是正式资产对象。

## 5. 前端接线

`apps/executable-spec-web/src/platform/api-client.ts` 新增：

- `browseCatalogAssets`
- `searchCatalogAssets`
- `importCatalogAsset`
- `publishCatalogAsset`
- `deprecateCatalogAsset`

`apps/executable-spec-web/src/SPUApp.tsx` 的构件目录区新增：

- internal/public/all 视图切换
- 资产搜索
- 对单项资产执行 publish / deprecate
- 显示资产核心元数据（owner/visibility/status/tags）

## 6. 验收映射

1. 已注册 SPU 是正式资产对象：  
`browseCatalogItems(..., { types: ["spu"] })` 返回含 `itemId/type/owner/visibility/status` 的资产对象。

2. 支持内部/公开两类可见性：  
`visibility` 明确区分 `internal/public`，`market` 聚合仅收敛 `public + published`。

3. 最小能力完整：  
browse/search/publish/deprecate/import 全部有后端 API 与前端 client。

## 7. 测试

`apps/executable-spec-web/server/services/component_catalog_service.test.ts` 覆盖：

- 注册 SPU -> 正式资产对象
- browse/search
- publish/deprecate
- manual import（specbundle）
- 旧 catalog 接口兼容性
