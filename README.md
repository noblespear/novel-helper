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
| 前端 | React 18 + TypeScript + Tailwind 3 |
| 状态 | Zustand |
| 编辑器 | CodeMirror 6 (虚拟化) |
| 文件存储 | Markdown + JSON (本地文件系统) |

## 路线图

- **Phase 0 · 骨架** ✅  完成 — 三栏布局/树形导航/CodeMirror/主题/沉浸/命令面板
- **Phase 1 · AI 基础** — 多 Provider、AI 面板、选区润色、流式输出
- **Phase 2 · 创作闭环** — 角色/设定/细纲系统、AI 辅助生成
- **Phase 3 · RAG + 文风** — 全书检索、文风学习、一致性检查

详细见 [docs/05-roadmap.md](docs/05-roadmap.md)。

## 本地开发

### 前置要求

- **Node.js** 18+ (本项目用 22.14.0)
- **Rust** stable (本项目用 1.96.0)
- **Visual Studio 2022** Community 或 Build Tools(MSVC + Windows 10/11 SDK)
- **WebView2** Runtime(Win11 默认安装,Win10 需手动装)

### 一次性设置

```powershell
# 1. 安装 Rust(MSVC toolchain)
#    下载 https://win.rustup.rs/x86_64 并运行 -y --default-host x86_64-pc-windows-msvc

# 2. 克隆并安装依赖
git clone https://github.com/noblespear/novel-helper.git
cd novel-helper
npm install

# 3. 运行开发模式
npm run tauri:dev

# 4. 打包发布版本
npm run tauri:build
```

### Windows 上 Rust 编译

由于本项目用 MSVC 工具链,需在 Visual Studio Developer 环境编译。两种方式:

**方式 A(推荐)**:创建 `D:\Tools\with_env.bat` 包装脚本:
```bat
@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" 1>nul
set PATH=C:\Users\<USER>\.cargo\bin;%PATH%
%*
```

然后用 `D:\Tools\with_env.bat cargo build` 调用。

**方式 B**:每次在 "Developer Command Prompt for VS 2022" 里操作。

### 项目结构

```
novel-helper/
├── docs/                    # 设计文档
│   ├── 01-architecture.md
│   ├── 02-data-model.md
│   ├── 03-ai-and-rag.md
│   ├── 04-ui-ux.md
│   ├── 05-roadmap.md
│   └── decisions/
├── src/                     # React 前端
│   ├── components/
│   ├── stores/
│   ├── lib/
│   ├── types.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── src-tauri/               # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands.rs
│   │   ├── project.rs
│   │   └── storage.rs
│   ├── capabilities/
│   ├── icons/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## 文档

- [架构设计](docs/01-architecture.md)
- [数据模型与存储](docs/02-data-model.md)
- [AI 服务与 RAG](docs/03-ai-and-rag.md)
- [UI/UX 设计](docs/04-ui-ux.md)
- [路线图](docs/05-roadmap.md)
- [架构决策记录](docs/decisions/)

## License

MIT
