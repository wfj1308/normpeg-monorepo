# v://normref.com/core@v1

**协议类型**：NormRefCore  
**版本**：v1  
**描述**：所有工程逻辑的统一入口和版本控制机制  
**规则**：
- 所有协议必须有 `v://normref.com/...@版本` 格式
- 必须包含 `metadata`、`gates`、`verdict_logic`、`output_schema`
- 变更必须生成 Proof 并记录在对应 `.md` 中
- 支持行业域划分（highway、bridge、building 等）
