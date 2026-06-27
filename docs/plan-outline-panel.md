# 大纲编辑面板 - 实现计划

## 目标
在右栏"大纲"标签页实现三级结构化大纲编辑器（总纲/卷/章细纲），支持拖拽排序。

## 数据模型

### 存储格式
单文件 `projects/<project_id>/outline.json`，包含节点数组：

```json
[
  {
    "id": "uuid",
    "level": "macro" | "volume" | "chapter",
    "parent_id": null | "uuid",
    "title": "节点标题",
    "content": "详细内容(markdown)",
    "order": 1,
    "created_at": "rfc3339",
    "updated_at": "rfc3339"
  }
]
```

### 三级结构
- **Macro（总纲）**：全书主线、核心冲突、结局走向
- **Volume（卷）**：每卷的故事弧、主要事件
- **Chapter（章细纲）**：每章的具体情节要点

## 实现步骤

### Step 1: Rust 后端（~30 min）
| 文件 | 变更 |
|------|------|
| `src-tauri/src/outline.rs` | **新建** - 数据模型 + 存储逻辑 + 单元测试 |
| `src-tauri/src/lib.rs` | 添加 `mod outline` |
| `src-tauri/src/commands.rs` | 添加 6 个 Tauri 命令 |
| `src-tauri/Cargo.toml` | 添加 `[dev-dependencies] tempfile = "3"` |

**Tauri 命令：**
- `load_outline(project_id)` → 树形结构
- `load_outline_flat(project_id)` → 扁平列表
- `add_outline_node(project_id, level, parent_id, title)` → 新节点
- `update_outline_node(project_id, node)` → 更新
- `delete_outline_node(project_id, node_id)` → 删除（级联）
- `reorder_outline_nodes(project_id, ordered_ids)` → 排序

### Step 2: TypeScript 类型（~10 min）
| 文件 | 变更 |
|------|------|
| `src/types.ts` | 添加 `OutlineLevel`, `OutlineNode`, `OutlineNodeTree` 类型 |

### Step 3: API 层（~10 min）
| 文件 | 变更 |
|------|------|
| `src/lib/api.ts` | 添加 6 个 outline 相关方法 |

### Step 4: Zustand 状态（~15 min）
| 文件 | 变更 |
|------|------|
| `src/stores/app.ts` | 添加 `outline` 状态 + actions |

### Step 5: UI 组件（~60 min）
| 文件 | 变更 |
|------|------|
| `src/components/RightPanel.tsx` | 替换 `OutlinePanel` 占位符 |

**UI 功能：**
- 树形展示（缩进层级）
- 每个节点：标题（可编辑）、内容折叠展开
- 添加按钮（+图标，选择级别）
- 删除按钮（确认后删除）
- 拖拽排序（使用原生 drag API）
- 双击编辑标题

### Step 6: 集成（~15 min）
| 文件 | 变更 |
|------|------|
| `src/App.tsx` | 打开项目时加载大纲 |

## UI 设计

```
┌─────────────────────────────┐
│ 📋 大纲              [+ 添加] │
├─────────────────────────────┤
│ ▼ 总纲                        │
│   ├─ ▼ 第一卷                 │
│   │   ├─ 第一章：xxx          │
│   │   └─ 第二章：xxx          │
│   └─ ▼ 第二卷                 │
│       └─ 第三章：xxx          │
└─────────────────────────────┘
```

## 验证方式
1. `cargo test -p novel-helper outline` — 后端单元测试
2. 打开应用 → 选择项目 → 点击右栏"大纲"标签
3. 测试：添加节点、编辑、删除、拖拽排序
4. 重启应用 → 验证数据持久化

## 预估总工时
**~2.5 小时**（后端 + 前端 + 集成）
