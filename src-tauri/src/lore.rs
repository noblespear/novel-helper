//! 设定集系统 - 世界观/势力/地点/物品等分类

use anyhow::{anyhow, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use uuid::Uuid;

/// 设定类别
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LoreCategory {
    World,     // 世界观
    Faction,   // 势力
    Location,  // 地点
    Item,      // 物品
    Power,     // 能力/体系
    Custom,    // 自定义
}

/// 设定条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoreEntry {
    pub id: String,
    pub category: LoreCategory,
    pub name: String,
    pub description: String,
    pub details: String,       // 详细内容(markdown)
    pub tags: Vec<String>,     // 标签
    pub related_characters: Vec<String>,  // 关联角色ID
    pub created_at: String,
    pub updated_at: String,
}

impl LoreEntry {
    pub fn new(category: LoreCategory, name: &str) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            category,
            name: name.to_string(),
            description: String::new(),
            details: String::new(),
            tags: Vec::new(),
            related_characters: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

/// 设定集存储
pub struct LoreStorage;

impl LoreStorage {
    /// 获取设定文件路径
    fn lore_path(project_dir: &Path) -> std::path::PathBuf {
        project_dir.join("lore.json")
    }

    /// 加载设定
    pub fn load(project_dir: &Path) -> Result<Vec<LoreEntry>> {
        let path = Self::lore_path(project_dir);
        if !path.exists() {
            return Ok(vec![]);
        }
        let content = fs::read_to_string(&path)?;
        let entries: Vec<LoreEntry> = serde_json::from_str(&content)
            .map_err(|e| anyhow!("解析 lore.json 失败: {}", e))?;
        Ok(entries)
    }

    /// 保存设定
    pub fn save(project_dir: &Path, entries: &[LoreEntry]) -> Result<()> {
        let path = Self::lore_path(project_dir);
        let content = serde_json::to_string_pretty(entries)?;
        fs::write(&path, content)?;
        Ok(())
    }

    /// 添加条目
    pub fn add_entry(
        project_dir: &Path,
        category: LoreCategory,
        name: &str,
    ) -> Result<LoreEntry> {
        let mut entries = Self::load(project_dir)?;
        let entry = LoreEntry::new(category, name);
        entries.push(entry.clone());
        Self::save(project_dir, &entries)?;
        Ok(entry)
    }

    /// 更新条目
    pub fn update_entry(project_dir: &Path, entry: &LoreEntry) -> Result<()> {
        let mut entries = Self::load(project_dir)?;
        if let Some(existing) = entries.iter_mut().find(|e| e.id == entry.id) {
            existing.name = entry.name.clone();
            existing.category = entry.category.clone();
            existing.description = entry.description.clone();
            existing.details = entry.details.clone();
            existing.tags = entry.tags.clone();
            existing.related_characters = entry.related_characters.clone();
            existing.updated_at = Utc::now().to_rfc3339();
            Self::save(project_dir, &entries)?;
            Ok(())
        } else {
            Err(anyhow!("条目不存在: {}", entry.id))
        }
    }

    /// 删除条目
    pub fn delete_entry(project_dir: &Path, entry_id: &str) -> Result<()> {
        let mut entries = Self::load(project_dir)?;
        let before = entries.len();
        entries.retain(|e| e.id != entry_id);
        if entries.len() == before {
            return Err(anyhow!("条目不存在: {}", entry_id));
        }
        Self::save(project_dir, &entries)?;
        Ok(())
    }

    /// 按类别筛选
    pub fn filter_by_category<'a>(entries: &'a [LoreEntry], category: &LoreCategory) -> Vec<&'a LoreEntry> {
        entries.iter().filter(|e| e.category == *category).collect()
    }

    /// 按标签筛选
    pub fn filter_by_tag<'a>(entries: &'a [LoreEntry], tag: &str) -> Vec<&'a LoreEntry> {
        entries.iter().filter(|e| e.tags.contains(&tag.to_string())).collect()
    }

    /// 搜索名称或描述
    pub fn search<'a>(entries: &'a [LoreEntry], query: &str) -> Vec<&'a LoreEntry> {
        let q = query.to_lowercase();
        entries
            .iter()
            .filter(|e| {
                e.name.to_lowercase().contains(&q)
                    || e.description.to_lowercase().contains(&q)
                    || e.details.to_lowercase().contains(&q)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_and_load() {
        let tmp = std::env::temp_dir().join("novel_helper_test_lore");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let entry = LoreStorage::add_entry(&tmp, LoreCategory::World, "蒸汽时代").unwrap();
        assert_eq!(entry.name, "蒸汽时代");
        assert_eq!(entry.category, LoreCategory::World);

        let entries = LoreStorage::load(&tmp).unwrap();
        assert_eq!(entries.len(), 1);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_update_entry() {
        let tmp = std::env::temp_dir().join("novel_helper_test_lore_update");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let mut entry = LoreStorage::add_entry(&tmp, LoreCategory::Faction, "旧势力").unwrap();
        entry.name = "新势力".to_string();
        entry.description = "势力描述".to_string();
        entry.tags = vec!["重要".to_string()];

        LoreStorage::update_entry(&tmp, &entry).unwrap();

        let entries = LoreStorage::load(&tmp).unwrap();
        assert_eq!(entries[0].name, "新势力");
        assert_eq!(entries[0].tags, vec!["重要"]);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_delete_entry() {
        let tmp = std::env::temp_dir().join("novel_helper_test_lore_delete");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let entry = LoreStorage::add_entry(&tmp, LoreCategory::Location, "王都").unwrap();
        LoreStorage::delete_entry(&tmp, &entry.id).unwrap();

        let entries = LoreStorage::load(&tmp).unwrap();
        assert_eq!(entries.len(), 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_filter_by_category() {
        let tmp = std::env::temp_dir().join("novel_helper_test_lore_filter");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        LoreStorage::add_entry(&tmp, LoreCategory::World, "世界观1").unwrap();
        LoreStorage::add_entry(&tmp, LoreCategory::World, "世界观2").unwrap();
        LoreStorage::add_entry(&tmp, LoreCategory::Faction, "势力1").unwrap();

        let entries = LoreStorage::load(&tmp).unwrap();
        let worlds = LoreStorage::filter_by_category(&entries, &LoreCategory::World);
        assert_eq!(worlds.len(), 2);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_search() {
        let tmp = std::env::temp_dir().join("novel_helper_test_lore_search");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let mut e1 = LoreStorage::add_entry(&tmp, LoreCategory::Item, "长剑").unwrap();
        e1.description = "一把锋利的长剑".to_string();
        LoreStorage::update_entry(&tmp, &e1).unwrap();

        LoreStorage::add_entry(&tmp, LoreCategory::Item, "盾牌").unwrap();

        let entries = LoreStorage::load(&tmp).unwrap();
        let results = LoreStorage::search(&entries, "长剑");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "长剑");

        let _ = fs::remove_dir_all(&tmp);
    }
}
