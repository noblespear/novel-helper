//! 存储层 - 项目、章节、设定的文件 IO

use crate::commands::Chapter;
use crate::project::{Project, ProjectSummary, Volume};
use anyhow::{anyhow, Result};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use uuid::Uuid;
use walkdir::WalkDir;

pub struct Storage {
    _app: AppHandle,
}

#[allow(dead_code)]
impl Storage {
    fn _placeholder(&self) {}
}

impl Storage {
    pub fn new(app: AppHandle) -> Result<Self> {
        Ok(Self { _app: app })
    }

    fn project_path(root: &Path, project_id: &str) -> PathBuf {
        root.join("projects").join(project_id)
    }

    pub fn create_project(&self, root: &Path, project: &Project) -> Result<()> {
        let dir = Self::project_path(root, &project.id);
        fs::create_dir_all(&dir)?;
        fs::create_dir_all(dir.join("chapters"))?;
        fs::create_dir_all(dir.join("outlines"))?;
        fs::create_dir_all(dir.join("index"))?;
        fs::create_dir_all(dir.join("style"))?;

        // 写入 meta.json
        let meta = serde_json::to_string_pretty(project)?;
        fs::write(dir.join("meta.json"), meta)?;

        // P0: 卷概念先简化,所有章节放入一个虚拟卷 "default"
        let volume = Volume {
            id: "default".to_string(),
            project_id: project.id.clone(),
            title: "第一卷".to_string(),
            order: 1,
            summary: String::new(),
        };
        let volumes = vec![volume];
        fs::write(
            dir.join("volumes.json"),
            serde_json::to_string_pretty(&volumes)?,
        )?;

        // 创建结构文件
        fs::write(dir.join("structure.json"), "{\"volumes\":[]}")?;

        Ok(())
    }

    pub fn list_projects(&self, root: &Path) -> Result<Vec<ProjectSummary>> {
        let projects_dir = root.join("projects");
        if !projects_dir.exists() {
            fs::create_dir_all(&projects_dir)?;
            return Ok(vec![]);
        }

        let mut summaries = Vec::new();
        for entry in fs::read_dir(&projects_dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let meta_path = entry.path().join("meta.json");
            if !meta_path.exists() {
                continue;
            }
            let meta_str = fs::read_to_string(&meta_path)?;
            let project: Project = serde_json::from_str(&meta_str)
                .map_err(|e| anyhow!("解析 meta.json 失败 {:?}: {}", meta_path, e))?;

            // 计算总字数
            let word_count = count_words_in_project(&entry.path());
            // 获取最后一章标题
            let last_chapter_title = get_last_chapter_title(&entry.path());

            summaries.push(ProjectSummary {
                id: project.id,
                name: project.name,
                synopsis: project.synopsis,
                word_count,
                target_words: project.target_words,
                status: "ongoing".to_string(),
                created_at: project.created_at,
                updated_at: project.updated_at,
                last_chapter_title,
            });
        }

        // 按更新时间倒序
        summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(summaries)
    }

    pub fn open_project(&self, root: &Path, project_id: &str) -> Result<Project> {
        let dir = Self::project_path(root, project_id);
        let meta_str = fs::read_to_string(dir.join("meta.json"))?;
        let project: Project = serde_json::from_str(&meta_str)?;
        Ok(project)
    }

    pub fn delete_project(&self, root: &Path, project_id: &str) -> Result<()> {
        let dir = Self::project_path(root, project_id);
        if dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        Ok(())
    }

    pub fn create_chapter(
        &self,
        root: &Path,
        project_id: &str,
        volume_id: &str,
        title: &str,
    ) -> Result<Chapter> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let order = get_next_chapter_order(root, project_id)?;
        let chapter = Chapter {
            id: id.clone(),
            volume_id: volume_id.to_string(),
            title: title.to_string(),
            order,
            word_count: 0,
            status: "draft".to_string(),
            content: String::new(),
            outline: String::new(),
            created_at: now.clone(),
            updated_at: now,
        };

        // 目录: chapters/<chapter_id>/  (P0 简化为单层,卷 id 只作为元数据)
        let chapter_dir = Self::project_path(root, project_id)
            .join("chapters")
            .join(&id);
        fs::create_dir_all(&chapter_dir)?;
        fs::write(chapter_dir.join("content.md"), "")?;
        fs::write(chapter_dir.join("outline.md"), "")?;
        fs::write(
            chapter_dir.join("meta.json"),
            serde_json::to_string_pretty(&chapter)?,
        )?;

        Ok(chapter)
    }

    pub fn list_chapters(&self, root: &Path, project_id: &str) -> Result<Vec<Chapter>> {
        let chapters_dir = Self::project_path(root, project_id).join("chapters");
        if !chapters_dir.exists() {
            return Ok(vec![]);
        }
        let mut chapters = Vec::new();
        for chapter_entry in fs::read_dir(&chapters_dir)? {
            let chapter_entry = chapter_entry?;
            if !chapter_entry.file_type()?.is_dir() {
                continue;
            }
            let meta_path = chapter_entry.path().join("meta.json");
            if !meta_path.exists() {
                continue;
            }
            let meta_str = fs::read_to_string(&meta_path)?;
            let chapter: Chapter = serde_json::from_str(&meta_str)?;
            chapters.push(chapter);
        }
        chapters.sort_by(|a, b| a.order.cmp(&b.order));
        Ok(chapters)
    }

    pub fn load_chapter(
        &self,
        root: &Path,
        project_id: &str,
        chapter_id: &str,
    ) -> Result<Chapter> {
        let chapter_dir = Self::project_path(root, project_id)
            .join("chapters")
            .join(chapter_id);
        if !chapter_dir.exists() {
            return Err(anyhow!("Chapter not found: {}", chapter_id));
        }
        let meta_str = fs::read_to_string(chapter_dir.join("meta.json"))?;
        let mut chapter: Chapter = serde_json::from_str(&meta_str)?;
        if let Ok(content) = fs::read_to_string(chapter_dir.join("content.md")) {
            chapter.content = content;
        }
        if let Ok(outline) = fs::read_to_string(chapter_dir.join("outline.md")) {
            chapter.outline = outline;
        }
        Ok(chapter)
    }

    pub fn save_chapter(
        &self,
        root: &Path,
        project_id: &str,
        chapter_id: &str,
        content: &str,
        outline: &str,
    ) -> Result<()> {
        let chapter_dir = Self::project_path(root, project_id)
            .join("chapters")
            .join(chapter_id);
        if !chapter_dir.exists() {
            return Err(anyhow!("Chapter not found: {}", chapter_id));
        }
        fs::write(chapter_dir.join("content.md"), content)?;
        fs::write(chapter_dir.join("outline.md"), outline)?;
        let meta_str = fs::read_to_string(chapter_dir.join("meta.json"))?;
        let mut chapter: Chapter = serde_json::from_str(&meta_str)?;
        chapter.content = content.to_string();
        chapter.outline = outline.to_string();
        chapter.word_count = count_words(content);
        chapter.updated_at = Utc::now().to_rfc3339();
        fs::write(
            chapter_dir.join("meta.json"),
            serde_json::to_string_pretty(&chapter)?,
        )?;
        touch_project(root, project_id)?;
        Ok(())
    }

    pub fn delete_chapter(
        &self,
        root: &Path,
        project_id: &str,
        chapter_id: &str,
    ) -> Result<()> {
        let chapter_dir = Self::project_path(root, project_id)
            .join("chapters")
            .join(chapter_id);
        if !chapter_dir.exists() {
            return Err(anyhow!("Chapter not found: {}", chapter_id));
        }
        fs::remove_dir_all(&chapter_dir)?;
        Ok(())
    }
}

fn get_next_chapter_order(root: &Path, project_id: &str) -> Result<u32> {
    let chapters_dir = Storage::project_path(root, project_id).join("chapters");
    if !chapters_dir.exists() {
        return Ok(1);
    }
    let mut max_order = 0u32;
    for entry in fs::read_dir(&chapters_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let meta = entry.path().join("meta.json");
        if meta.exists() {
            if let Ok(s) = fs::read_to_string(&meta) {
                if let Ok(c) = serde_json::from_str::<Chapter>(&s) {
                    if c.order > max_order {
                        max_order = c.order;
                    }
                }
            }
        }
    }
    Ok(max_order + 1)
}

fn touch_project(root: &Path, project_id: &str) -> Result<()> {
    let meta_path = Storage::project_path(root, project_id).join("meta.json");
    let s = fs::read_to_string(&meta_path)?;
    let mut project: Project = serde_json::from_str(&s)?;
    project.updated_at = Utc::now().to_rfc3339();
    fs::write(&meta_path, serde_json::to_string_pretty(&project)?)?;
    Ok(())
}

fn count_words(text: &str) -> u32 {
    // 简单字数统计:中文字符 + 英文单词
    let mut count = 0u32;
    for ch in text.chars() {
        if ch.is_alphanumeric() {
            count += 1;
        }
    }
    count
}

impl Storage {
    /// 公开的 count_words(供 setup seed 使用)
    pub fn count_words_pub(text: &str) -> u32 {
        count_words(text)
    }
}

fn count_words_in_project(project_dir: &Path) -> u32 {
    let mut total = 0u32;
    let chapters_dir = project_dir.join("chapters");
    if !chapters_dir.exists() {
        return 0;
    }
    for entry in WalkDir::new(&chapters_dir).into_iter().flatten() {
        if entry.file_name() == "content.md" {
            if let Ok(s) = fs::read_to_string(entry.path()) {
                total += count_words(&s);
            }
        }
    }
    total
}

fn get_last_chapter_title(project_dir: &Path) -> Option<String> {
    let chapters_dir = project_dir.join("chapters");
    if !chapters_dir.exists() {
        return None;
    }
    let mut chapters = Vec::new();
    for chapter_entry in fs::read_dir(&chapters_dir).ok()? {
        let chapter_entry = chapter_entry.ok()?;
        if !chapter_entry.file_type().ok()?.is_dir() {
            continue;
        }
        let meta = chapter_entry.path().join("meta.json");
        if meta.exists() {
            if let Ok(s) = fs::read_to_string(&meta) {
                if let Ok(c) = serde_json::from_str::<Chapter>(&s) {
                    chapters.push(c);
                }
            }
        }
    }
    chapters.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    chapters.first().map(|c| c.title.clone())
}
