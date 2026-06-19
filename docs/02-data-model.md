# 数据模型与存储

## 1. 文件布局(纯本地、可 git 备份)

```
%USERPROFILE%/Documents/NovelHelper/
├── projects/
│   └── <project_id>/
│       ├── meta.json                # 名称/简介/目标/封面
│       ├── structure.json           # 卷/章 树
│       ├── characters.json          # 角色集合
│       ├── locations.json           # 地点
│       ├── factions.json            # 势力
│       ├── lore/                    # 设定集(md 文件)
│       │   ├── magic.md
│       │   └── history.md
│       ├── outlines/
│       │   ├── macro.md             # 总体大纲
│       │   ├── volume-01.md
│       │   └── chapter-0001.md      # 细纲(可与章节 1:1)
│       ├── chapters/
│       │   └── vol-01/
│       │       └── 0001-第一章/
│       │           ├── content.md   # 正文
│       │           ├── notes.md     # 备注/批注
│       │           └── versions/    # 自动快照
│       ├── index/                   # 索引文件
│       │   ├── chapters.lance/      # 章节向量
│       │   ├── lore.lance/          # 设定向量
│       │   └── chapters.tantivy/    # BM25 索引
│       └── style/
│           ├── samples/             # 手动标注的文风样本
│           └── features.json        # 提取的风格特征
└── settings/
    ├── global.json                  # 主题/快捷键
    └── ai_providers.json            # AI 配置(密钥加密存储)
```

**设计原则**:内容是 md,元数据是 json,索引是 lancedb/tantivy。一切可读、可备份、可 git。

## 2. 核心数据结构

### Project

```ts
{
  id: string,                // uuid
  name: string,
  type: "web_novel" | "traditional",
  target_words: number,
  daily_goal: number,
  cover?: string,
  synopsis: string,
  created_at: ISO8601,
  updated_at: ISO8601
}
```

### Volume / Chapter / Scene

```ts
Volume {
  id, project_id, title, order, summary
}

Chapter {
  id, volume_id, title, order,
  word_count, target_words, status: "draft" | "finished" | "published",
  outline_id,           // 指向细纲
  content_path,         // 指向 content.md
  tags: string[],
  characters: string[], // 出场角色 id
  location?: string,
  pov?: string,         // 视角角色
  beats: Beat[]
}

Beat {
  id, summary, type: "setup" | "conflict" | "climax" | "resolution"
}
```

### Character

```ts
{
  id, name, aliases: string[], role, age?, appearance,
  personality: string,    // 性格描述
  background: string,     // 背景故事
  motivation: string,     // 核心动机
  arc: CharacterArc,      // 角色弧光(起/承/转/合)
  speech_style: string,   // 说话风格
  relationships: Relation[]
}

Relation { from, to, type, description }

CharacterArc {
  start_state: string,
  end_state: string,
  key_turning_points: { chapter_id, event }[]
}
```

### Lore / Setting

```ts
{
  id, category, title, content, tags: string[]
}
// category: "magic" | "geography" | "history" | "faction" | "item" | "other"
```

### Outline

```ts
{
  id, level: "macro" | "volume" | "chapter",
  parent_id?, content  // markdown
}
```

### StyleSample

```ts
{
  id, source_chapter, range: { start, end },
  text,                // 原文片段
  features: {
    sentence_length_avg, sentence_length_dist,
    vocabulary_level,   // "文言" | "半文半白" | "白话" | "网络用语"
    dialogue_ratio,
    description_ratio,
    rhythm,             // 节奏
    tropes: string[],   // 标志性手法
    signature_phrases: string[]
  }
}
```

## 3. 存储选型理由

| 数据 | 格式 | 理由 |
|---|---|---|
| 章节正文 | Markdown | 可读、可 diff、可 git 备份、跨平台 |
| 元数据 | JSON | 结构化、易解析、人可读 |
| 向量索引 | LanceDB | 单文件、Rust 原生、适合本地 |
| 全文索引 | Tantivy | Rust 高性能 BM25、中文分词友好 |
| AI 配置 | JSON (keyring 加密) | 密钥不进文件、复用系统级加密 |
| 主题/快捷键 | JSON | 用户可编辑、可导入导出 |
