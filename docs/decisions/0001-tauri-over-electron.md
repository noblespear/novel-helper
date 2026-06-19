# ADR 0001: 选择 Tauri 而非 Electron 作为桌面壳

## 状态

已采纳 — 2026-06-19

## 背景

需要一个 Windows 桌面端框架,要求:
- 启动快(作家打开软件不应等待)
- 安装包小(便于自用,避免膨胀)
- 后端能处理 RAG / 向量索引 / 文件 IO
- 前端能用现代 Web 技术栈(React + Tailwind)

## 选项

### Tauri 2.x
**优点:**
- 安装包 5–10MB(对比 Electron 100MB+)
- 启动 < 1s
- Rust 后端,天然适配 lancedb / tantivy
- 内存占用低

**缺点:**
- 生态比 Electron 略小
- 文档相对稀薄
- 某些边缘场景需翻源码

### Electron
**优点:**
- 生态最成熟(AI 工具链丰富,LangChain.js 等)
- 开发最快
- 文档完善

**缺点:**
- 安装包 100MB+
- 内存占用高
- 启动慢

### 原生 Windows (WinUI 3 / WPF)
**优点:**
- Windows 体验最佳
- 启动最快
- 内存最低

**缺点:**
- 跨平台差
- AI 库需要自己桥接
- UI 现代化成本高

## 决策

采用 **Tauri 2.x + Rust + React 前端**。

理由:个人自用工具,启动速度和安装包大小直接影响使用频率;Rust 后端为 RAG/向量检索提供原生支持;前端用 React 不影响 UI 质量。生态略小的缺点可以通过控制功能范围和分阶段实现来缓解。

## 后果

- 需要学习 Rust(中等学习曲线,但本项目 Rust 部分主要是 IO/索引/AI 编排,业务逻辑放前端)
- 避免使用 Tauri 不友好的库(如大型 native module)
- 跨平台(cross-platform)留到 P4 之后
- 如果某天 Tauri 卡住,Electron 仍可作为 fallback
