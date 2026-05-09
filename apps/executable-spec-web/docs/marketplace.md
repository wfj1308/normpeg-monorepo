# Marketplace（规范组件市场）

## 目标

将现有 catalog 升级为可运营的 marketplace，支持规范组件生态：
- 资产发布与流通
- 评分反馈机制
- 下载/引用行为追踪
- 版本兼容说明
- 公共规范与企业私有规范并存

## 核心模型

实现位置：`server/services/component_catalog_service.ts`

### CatalogItem（升级后）

新增 `marketplace` 字段：

- `listingStatus`: `draft | published | deprecated`
- `accessScope`: `public | enterprise_private`
- `publishedAt`
- `publishedBy`
- `rating`
  - `averageScore`
  - `totalRatings`
  - `distribution(1~5)`
  - `lastRatedAt`
- `usage`
  - `downloadCount`
  - `referenceCount`
  - `lastDownloadedAt`
  - `lastReferencedAt`
- `compatibility`
  - `runtimeVersionRange`
  - `compatibleAssetVersions`
  - `notes`
  - `updatedAt`

这套结构即 marketplace item metadata，可直接供前端展示和运营分析。

## 能力清单

### 1) 发布（Publish）

接口：
- `POST /api/catalog-assets/:itemId/publish`

支持：
- 可见性（`public/internal`）
- 标签补充
- 发布时直接写入兼容说明（runtime range / compatible versions / notes）

### 2) 评分（Rating）

接口：
- `POST /api/catalog-assets/:itemId/rate`

行为：
- 每个 reviewer 对同一资产可更新评分
- 自动聚合平均分、评分数、分布、最后评分时间

### 3) 下载/引用（Download/Reference）

接口：
- `POST /api/catalog-assets/:itemId/download`
- `POST /api/catalog-assets/:itemId/reference`

行为：
- 下载计数 + 最后下载时间
- 引用计数 + 最后引用时间
- 引用可写入依赖关系（`dependencies`）

### 4) 兼容说明（Compatibility）

接口：
- `POST /api/catalog-assets/:itemId/compatibility`

行为：
- 更新运行时版本范围
- 更新兼容资产版本列表
- 更新兼容说明备注

### 5) Marketplace 查询

接口：
- `GET /api/marketplace/items`

特点：
- 默认返回已发布资产
- 支持 scope/types/status/tags 等筛选

## 公共规范 vs 企业私有规范

通过两层机制实现：

1. `visibility`
- `public`：公共规范，可进入公共市场
- `internal`：企业私有规范，仅企业内部可见

2. tenant 作用域
- API 请求按 tenant 上下文隔离
- catalog/marketplace 存储按 tenant 命名空间隔离
- 企业私有资产不会跨 tenant 串出

## 生态扩展点

- 评分可扩展为评论审核、信誉加权
- 下载/引用可扩展为计费与分成
- 兼容信息可扩展为自动校验（平台版本、依赖版本）
- marketplace item metadata 可直接对接外部门户

## 验收映射

1. SPU / 模板成为可流通资产
- 资产具备发布、评分、下载、引用、兼容说明全链路能力。

2. 系统具备生态潜力
- 已形成 marketplace 元数据模型 + 行为数据沉淀 + 公共/私有双模式。
