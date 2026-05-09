# NormRef Final Brand Architecture

## Brand hierarchy

| 层级 | 域名/名称 | 定位 |
| --- | --- | --- |
| 品牌 | NormRef | 规范数字化品牌 |
| 核心产品 | bot.normref.com | 规范翻译机器人 |
| 官网/文档 | normref.com | 规范库、SPU 标准、开发者文档 |
| 协议层 | LayerPeg | 内部技术架构（SPU / Gate / Proof） |

## Demo line (2 minutes)

1. 这是 bot.normref.com，规范翻译机器人。不是查规范，是执行规范。
2. 上传 PDF -> 生成 SPU -> 输入数据 -> 自动判定。
3. 96% -> 97%，立即响应。
4. 展示双轨输出：`.md` 给人读，`.json` 给机器执行。
5. 规范院用 bot.normref，发布即数字化。

## Delivery checklist

- [x] 三份 SPU YAML 最终命名文件已落地：
  - `apps/executable-spec-web/src/subgrade.compaction.spu.yaml`
  - `apps/executable-spec-web/src/bridge.pile.strength.spu.yaml`
  - `apps/executable-spec-web/src/pavement.flatness.IRI.spu.yaml`
- [x] 双轨输出能力（`.md + .json + .specbundle`）在 Web 页面可直接导出。
- [x] Translation Bot UI 和 API 标题已统一到 NormRef 品牌。
