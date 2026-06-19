# 架构设计

## 1. 分层架构

```
┌────────────────────────────────────────────────────┐
│ UI 层 (React)                                      │
│  树形导航 / 编辑器 / 角色卡 / 设定 / AI 面板      │
│  命令面板 / RAG 检索 / 沉浸模式                   │
├────────────────────────────────────────────────────┤
│ 状态/查询层 (Zustand + TanStack Query)            │
│  项目状态 / 编辑器状态 / AI 会话 / 缓存            │
├────────────────────────────────────────────────────┤
│ IPC 桥 (Tauri Commands + Events + Streams)       │
│  文件 IO / 索引构建 / AI 流式响应 / 事件总线       │
├────────────────────────────────────────────────────┤
│ 领域服务 (Rust)                                    │
│  ProjectService / OutlineService /                │
│  CharacterService / AIService /                   │
│  RAGService / StyleService                        │
├────────────────────────────────────────────────────┤
│ 基础设施 (Rust crates)                             │
│  lancedb / tantivy / reqwest / ollama-rs /        │
│  serde / tokio                                     │
└────────────────────────────────────────────────────┘
```

## 2. IPC 设计原则

- **命令式操作** 用 `#[tauri::command]`(同步/异步)
- **流式响应** 用 Tauri Channel(流式 AI 输出)
- **事件总线** 用 Tauri Event(进度通知、保存完成等)
- **避免** 把大对象跨边界序列化(传引用 ID,数据放内存或文件)

## 3. 关键模块依赖

```
Project / File IO
  └→ Editor
  └→ Sidebar Tree
       └→ Outline System
            └→ Character System
                 └→ AI Service
                      └→ RAG
                           └→ Style Learning
```

## 4. 性能预算

- 编辑器打开百万字: < 2s
- 单次 AI 润色响应: < 3s 起流
- RAG 检索(百万字库): < 500ms
- 索引构建(单章): < 1s
- 应用启动: < 1.5s

## 5. 错误处理

- **Tauri commands**: 返回 `Result<T, AppError>`,前端用 try/catch 捕获
- **流式 AI**: 错误通过 stream 的最后一个 chunk 传回
- **文件 IO**: 失败时保留旧版本,绝不破坏用户数据
- **崩溃恢复**: 章节自动保存版本快照,启动时检测异常退出
