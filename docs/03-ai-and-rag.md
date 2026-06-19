# AI 服务与 RAG

## 1. AI Provider 抽象

```rust
#[async_trait]
trait AIProvider {
    async fn chat_stream(&self, req: ChatRequest) -> Stream<ChatChunk>;
    async fn chat(&self, req: ChatRequest) -> ChatResponse;
    async fn embed(&self, texts: Vec<String>) -> Vec<Vec<f32>>;
    fn capabilities(&self) -> Capabilities;
    fn pricing(&self) -> PricingInfo;
}
```

实现:
- `OpenAICompatible` — 通用 OpenAI 协议(覆盖 OpenAI/DeepSeek/Moonshot/Qwen/智谱/本地 OpenAI 兼容服务)
- `Anthropic` — Claude 系列
- `Ollama` — 本地 llama.cpp 兼容
- `Mock` — 开发态

## 2. Prompt 模板系统

`prompts/<feature>.toml`,Jinja2-like 语法,变量注入:

```toml
# prompts/polish.toml
[meta]
name = "章节润色"
description = "保持文风,只改通顺度/错别字"

[template]
system = """
你是中文网文润色助手。{{style_context}}
规则:
- 不改变情节、不增减人物
- 保留作者原文的所有用词习惯和句式
- 只修正:错别字、病句、明显不通顺
"""
user = """
[细纲参考]
{{outline}}

[待润色片段]
{{selection}}
"""
```

特性:
- 用户可在设置里编辑、版本化、导入导出
- 每个项目可覆盖默认模板
- 模板调用链可追溯

## 3. AI 功能清单

| 功能 | 触发 | 输入 | 输出 |
|---|---|---|---|
| 选区润色 | 浮动工具条 | 选区 + 项目文风 | diff 流式 |
| 续写 | `Ctrl+Enter` | 前文 + 细纲 + 文风 | 流式续写 |
| 细纲扩写章节 | 章节页"AI 写本章" | 细纲 + 角色 + 设定 + 文风 | 整章流式 |
| 角色设计 | 角色页"AI 辅助" | 用户提示 + 已有角色 | 完整角色卡 |
| 设定设计 | 设定页"AI 辅助" | 用户提示 + 已有设定 | 设定 + 一致性 |
| 一致性检查 | 整章生成后 | 章节 + 出场角色卡 | 报告 + 建议 |
| 章节摘要 | 章节写完后 | 章节全文 | 摘要(用于 RAG) |
| RAG 问答 | RAG 面板 | 用户提问 | 引用片段 + 跳转 |
| 吐槽/批注 | 选中段落 | 段落 + 上下文 | 批注 |

## 4. RAG 流水线

### 4.1 索引构建

```
[content.md]
   ↓
[Scene Splitter]    ← 按 "# 场景" / POV切换 / 时间跳变切分
   ↓
[Chunker]           ← 512 tokens, 64 overlap,带元数据
   ↓
[Metadata Enrich]   ← 自动识别角色名、地点、引用,挂到 chunk metadata
   ↓
[Embedder]          ← bge-m3 (本地) / text-embedding-3-small (云)
   ↓
[LanceDB 存储]      ← chapters.lance, lore.lance
[BM25 索引]         ← Tantivy,字符 n-gram + jieba 分词
```

### 4.2 检索流程

```
[用户问题]
   ↓
[Query Rewrite]     ← LLM 改写为多个检索 query
   ↓
[Hybrid Retrieve]   ← BM25(top 50) + Vector(top 50) → RRF 融合
   ↓
[Rerank]            ← bge-reranker-v2-m3 (本地) / cohere-rerank
   ↓
[Top 5 Chunks + Metadata]
   ↓
[LLM 生成答案]      ← 引用编号,支持跳转原文
```

### 4.3 典型查询

```
你: 林远在第三章向师父坦白身世,师父当时是怎么回应的?

AI: 第三章《云落峰》中,师父玄青子的原话是:
     > "你的来处,为师早已知晓。但为师收徒,从不论出身。"
     [引用: vol-01/0003-云落峰/content.md §12]
```

## 5. 文风学习系统

### 5.1 工作流

1. **样本标注** — 用户右键 → "标记为文风样本",累计 ≥ 3 万字才有意义
2. **特征提取**(LLM 一次性分析):
   - 句长分布、段长分布
   - 对话/心理/描写比例
   - 词汇等级(文言/口语/网络用语)
   - 标志性句式、转折方式
   - 高频意象、修辞偏好
   - POV 与视角切换模式
3. **Few-shot 注入** — 所有"生成"类 prompt 自动追加 top-3 最相关样本
4. **风格偏离度反馈** — 每次生成后给出"风格偏离度"评分

### 5.2 关键设计

- 文风样本**默认存本地**,不上传(隐私)
- 提供"风格滑块":写得更像 A / 折中 / 写得更像 B
- 风格特征可视化
