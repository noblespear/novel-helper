# NovelHelper

> 一款面向中文网文百万字长篇连载的 AI 深度结合桌面端创作工作台。

## 愿景

传统写作软件(作家助手、Scrivener)擅长项目管理和大纲,但 AI 能力浅尝辄止。NovelHelper 把 **RAG + 文风学习 + 多 AI 切换** 做成一等公民——AI 不只是润色工具,而是**理解你整本书的协作者**。

核心差异化:
- **写得像你** —— AI 学习你的文风,生成内容贴合个人笔触
- **全书可查** —— AI 直接引用前面章节的设定、伏笔、人物言行
- **工作流贯通** —— 角色/设定/细纲/正文/润色 一个工作流跑完

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面壳 | Tauri 2.x |
| 后端 | Rust |
| 前端 | React 18 + TypeScript + Tailwind + shadcn/ui |
| 状态 | Zustand + TanStack Query |
| 编辑器 | CodeMirror 6(百万字级虚拟化) |
| 向量库 | LanceDB |
| 全文索引 | Tantivy (BM25) |
| 本地 LLM | Ollama(可选) |
| 云端 LLM | OpenAI 兼容协议 + Anthropic(可切换) |
| 本地嵌入 | bge-m3 / bge-large-zh-v1.5 |
| 全局快捷键 | Tauri global-shortcut |
| 自动更新 | Tauri updater |

## 路线图

- **Phase 0 · 骨架(2 周)** — 项目/大纲/章节树、CodeMirror 编辑器、暗色主题、沉浸模式
- **Phase 1 · AI 基础(2–3 周)** — 多 Provider、AI 面板、选区润色、流式输出
- **Phase 2 · 创作闭环(3–4 周)** — 角色/设定/细纲系统、AI 辅助生成
- **Phase 3 · RAG + 文风(3–4 周)** — 全书检索、文风学习、一致性检查

详细见 [docs/05-roadmap.md](docs/05-roadmap.md)。

## 文档

- [架构设计](docs/01-architecture.md)
- [数据模型与存储](docs/02-data-model.md)
- [AI 服务与 RAG](docs/03-ai-and-rag.md)
- [UI/UX 设计](docs/04-ui-ux.md)
- [路线图](docs/05-roadmap.md)
- [架构决策记录](docs/decisions/)

## 本地开发

> 阶段 P0 启动后会补充完整的开发环境搭建说明。

## License

MIT
