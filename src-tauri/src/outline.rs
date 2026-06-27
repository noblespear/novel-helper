//! 大纲系统 - 三级结构化大纲（总纲/卷/章细纲）

use anyhow::{anyhow, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use uuid::Uuid;

/// 大纲节点级别
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutlineLevel {
    Macro,   // 总纲
    Volume,  // 卷
    Chapter, // 章细纲
}

/// 大纲节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlineNode {
    pub id: String,
    pub level: OutlineLevel,
    pub parent_id: Option<String>,
    pub title: String,
    pub content: String,
    pub order: u32,
    pub created_at: String,
    pub updated_at: String,
}

impl OutlineNode {
    pub fn new(level: OutlineLevel, parent_id: Option<String>, title: &str, order: u32) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            level,
            parent_id,
            title: title.to_string(),
            content: String::new(),
            order,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

/// 大纲存储
pub struct OutlineStorage;

impl OutlineStorage {
    /// 获取大纲文件路径
    fn outline_path(project_dir: &Path) -> std::path::PathBuf {
        project_dir.join("outline.json")
    }

    /// 加载大纲
    pub fn load(project_dir: &Path) -> Result<Vec<OutlineNode>> {
        let path = Self::outline_path(project_dir);
        if !path.exists() {
            return Ok(vec![]);
        }
        let content = fs::read_to_string(&path)?;
        let nodes: Vec<OutlineNode> = serde_json::from_str(&content)
            .map_err(|e| anyhow!("解析 outline.json 失败: {}", e))?;
        Ok(nodes)
    }

    /// 保存大纲（自动按 order 排序）
    pub fn save(project_dir: &Path, nodes: &[OutlineNode]) -> Result<()> {
        let path = Self::outline_path(project_dir);
        let mut sorted = nodes.to_vec();
        sorted.sort_by_key(|n| n.order);
        let content = serde_json::to_string_pretty(&sorted)?;
        fs::write(&path, content)?;
        Ok(())
    }

    /// 添加节点
    pub fn add_node(
        project_dir: &Path,
        level: OutlineLevel,
        parent_id: Option<String>,
        title: &str,
    ) -> Result<OutlineNode> {
        let mut nodes = Self::load(project_dir)?;

        // 计算同级最大 order
        let max_order = nodes
            .iter()
            .filter(|n| n.parent_id == parent_id)
            .map(|n| n.order)
            .max()
            .unwrap_or(0);

        let node = OutlineNode::new(level, parent_id, title, max_order + 1);
        nodes.push(node.clone());
        Self::save(project_dir, &nodes)?;
        Ok(node)
    }

    /// 更新节点
    pub fn update_node(project_dir: &Path, node: &OutlineNode) -> Result<()> {
        let mut nodes = Self::load(project_dir)?;
        if let Some(existing) = nodes.iter_mut().find(|n| n.id == node.id) {
            existing.title = node.title.clone();
            existing.content = node.content.clone();
            existing.updated_at = Utc::now().to_rfc3339();
            Self::save(project_dir, &nodes)?;
            Ok(())
        } else {
            Err(anyhow!("节点不存在: {}", node.id))
        }
    }

    /// 删除节点（级联删除子节点）
    pub fn delete_node(project_dir: &Path, node_id: &str) -> Result<()> {
        let mut nodes = Self::load(project_dir)?;

        // 收集所有需要删除的节点 ID（包括子节点）
        let mut to_delete = vec![node_id.to_string()];
        let mut changed = true;
        while changed {
            changed = false;
            let current = to_delete.clone();
            for n in &nodes {
                if let Some(ref parent) = n.parent_id {
                    if current.contains(parent) && !to_delete.contains(&n.id) {
                        to_delete.push(n.id.clone());
                        changed = true;
                    }
                }
            }
        }

        nodes.retain(|n| !to_delete.contains(&n.id));
        Self::save(project_dir, &nodes)?;
        Ok(())
    }

    /// 重新排序（接收有序的 ID 列表）
    pub fn reorder_nodes(project_dir: &Path, ordered_ids: &[String]) -> Result<()> {
        let mut nodes = Self::load(project_dir)?;

        // 更新 order
        for (i, id) in ordered_ids.iter().enumerate() {
            if let Some(node) = nodes.iter_mut().find(|n| &n.id == id) {
                node.order = (i as u32) + 1;
            }
        }

        Self::save(project_dir, &nodes)?;
        Ok(())
    }

    /// 获取节点的子节点
    pub fn get_children<'a>(nodes: &'a [OutlineNode], parent_id: &str) -> Vec<&'a OutlineNode> {
        let mut children: Vec<&OutlineNode> = nodes
            .iter()
            .filter(|n| n.parent_id.as_deref() == Some(parent_id))
            .collect();
        children.sort_by_key(|n| n.order);
        children
    }

    /// 获取根节点（无 parent_id）
    pub fn get_roots(nodes: &[OutlineNode]) -> Vec<&OutlineNode> {
        let mut roots: Vec<&OutlineNode> = nodes.iter().filter(|n| n.parent_id.is_none()).collect();
        roots.sort_by_key(|n| n.order);
        roots
    }

    /// 转换为树形结构
    pub fn to_tree(nodes: &[OutlineNode]) -> Vec<OutlineNodeTree> {
        fn build_tree(
            nodes: &[OutlineNode],
            parent_id: Option<&str>,
        ) -> Vec<OutlineNodeTree> {
            let mut children: Vec<&OutlineNode> = nodes
                .iter()
                .filter(|n| n.parent_id.as_deref() == parent_id)
                .collect();
            children.sort_by_key(|n| n.order);

            children
                .into_iter()
                .map(|n| OutlineNodeTree {
                    node: n.clone(),
                    children: build_tree(nodes, Some(&n.id)),
                })
                .collect()
        }

        build_tree(nodes, None)
    }
}

/// 树形结构节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlineNodeTree {
    #[serde(flatten)]
    pub node: OutlineNode,
    pub children: Vec<OutlineNodeTree>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_and_load() {
        let tmp = std::env::temp_dir().join("novel_helper_test_outline");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        // 添加总纲
        let node1 = OutlineStorage::add_node(&tmp, OutlineLevel::Macro, None, "总纲").unwrap();
        assert_eq!(node1.title, "总纲");
        assert_eq!(node1.level, OutlineLevel::Macro);

        // 添加卷
        let node2 = OutlineStorage::add_node(&tmp, OutlineLevel::Volume, Some(node1.id.clone()), "第一卷").unwrap();
        assert_eq!(node2.parent_id, Some(node1.id.clone()));

        // 加载验证
        let nodes = OutlineStorage::load(&tmp).unwrap();
        assert_eq!(nodes.len(), 2);

        // 清理
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_update_node() {
        let tmp = std::env::temp_dir().join("novel_helper_test_outline_update");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let mut node = OutlineStorage::add_node(&tmp, OutlineLevel::Macro, None, "旧标题").unwrap();
        node.title = "新标题".to_string();
        node.content = "大纲内容".to_string();

        OutlineStorage::update_node(&tmp, &node).unwrap();

        let nodes = OutlineStorage::load(&tmp).unwrap();
        assert_eq!(nodes[0].title, "新标题");
        assert_eq!(nodes[0].content, "大纲内容");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_delete_cascade() {
        let tmp = std::env::temp_dir().join("novel_helper_test_outline_delete");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let parent = OutlineStorage::add_node(&tmp, OutlineLevel::Macro, None, "父节点").unwrap();
        let child1 = OutlineStorage::add_node(&tmp, OutlineLevel::Volume, Some(parent.id.clone()), "子节点1").unwrap();
        let _child2 = OutlineStorage::add_node(&tmp, OutlineLevel::Chapter, Some(child1.id.clone()), "孙节点").unwrap();

        // 删除父节点应级联删除所有子节点
        OutlineStorage::delete_node(&tmp, &parent.id).unwrap();

        let nodes = OutlineStorage::load(&tmp).unwrap();
        assert_eq!(nodes.len(), 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_reorder() {
        let tmp = std::env::temp_dir().join("novel_helper_test_outline_reorder");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let n1 = OutlineStorage::add_node(&tmp, OutlineLevel::Macro, None, "节点1").unwrap();
        let n2 = OutlineStorage::add_node(&tmp, OutlineLevel::Macro, None, "节点2").unwrap();
        let n3 = OutlineStorage::add_node(&tmp, OutlineLevel::Macro, None, "节点3").unwrap();

        // 重排序: 3, 1, 2
        OutlineStorage::reorder_nodes(&tmp, &[n3.id.clone(), n1.id.clone(), n2.id.clone()]).unwrap();

        let nodes = OutlineStorage::load(&tmp).unwrap();
        assert_eq!(nodes[0].title, "节点3");
        assert_eq!(nodes[1].title, "节点1");
        assert_eq!(nodes[2].title, "节点2");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_to_tree() {
        let tmp = std::env::temp_dir().join("novel_helper_test_outline_tree");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let root = OutlineStorage::add_node(&tmp, OutlineLevel::Macro, None, "总纲").unwrap();
        let vol1 = OutlineStorage::add_node(&tmp, OutlineLevel::Volume, Some(root.id.clone()), "第一卷").unwrap();
        let _vol2 = OutlineStorage::add_node(&tmp, OutlineLevel::Volume, Some(root.id.clone()), "第二卷").unwrap();
        let _ch1 = OutlineStorage::add_node(&tmp, OutlineLevel::Chapter, Some(vol1.id.clone()), "第一章").unwrap();

        let nodes = OutlineStorage::load(&tmp).unwrap();
        let tree = OutlineStorage::to_tree(&nodes);

        assert_eq!(tree.len(), 1); // 只有一个根节点
        assert_eq!(tree[0].children.len(), 2); // 两个卷
        assert_eq!(tree[0].children[0].children.len(), 1); // 第一卷下有一个章

        let _ = fs::remove_dir_all(&tmp);
    }
}
