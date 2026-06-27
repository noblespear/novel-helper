// AI 区域管理 - 与前端 aiRegion.ts 镜像
// 用于: 导出时清理 / 统计 AI 修改的字数

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiRegionState {
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRegion {
    pub id: String,
    pub state: AiRegionState,
    /// 整段(含注释)的起止偏移
    pub start: usize,
    pub end: usize,
    /// AI 内容的起止偏移(不含注释)
    pub ai_start: usize,
    pub ai_end: usize,
    pub kind: String, // "replace" | "insert"
    pub original_text: String,
}

/// 解析 AI 区域
pub fn parse_ai_regions(text: &str) -> Vec<AiRegion> {
    let mut regions = Vec::new();
    let mut i = 0;
    while i < text.len() {
        // 找 "<!-- @ai:id:"
        let needle = "<!-- @ai:id:";
        let start_offset = match text[i..].find(needle) {
            Some(p) => i + p,
            None => break,
        };
        // 读 id
        let after_id_prefix = start_offset + needle.len();
        let id_end = match text[after_id_prefix..].find(' ') {
            Some(p) => after_id_prefix + p,
            None => break,
        };
        let id = text[after_id_prefix..id_end].to_string();
        // id 之后是空格,然后是 "state:..."
        let after_id = id_end + 1;
        // 读 state: "state:pending" 格式
        if !text[after_id..].starts_with("state:") {
            i = after_id;
            continue;
        }
        let after_state_prefix = after_id + "state:".len();
        // state 后面要么是空格(接 original)要么是 " -->"
        let state_end = match text[after_state_prefix..].find(|c: char| c == ' ' || c == '>') {
            Some(p) => after_state_prefix + p,
            None => break,
        };
        let state_str = &text[after_state_prefix..state_end];
        let state = match state_str {
            "pending" => AiRegionState::Pending,
            "accepted" => AiRegionState::Accepted,
            "rejected" => AiRegionState::Rejected,
            _ => {
                i = state_end;
                continue;
            }
        };
        // 可选 original:base64
        let mut after_state = state_end;
        let mut original_text = String::new();
        if text[after_state..].starts_with(" original:") {
            after_state += " original:".len();
            let orig_end = match text[after_state..].find(' ') {
                Some(p) => after_state + p,
                None => match text[after_state..].find("-->") {
                    Some(p) => after_state + p,
                    None => break,
                },
            };
            original_text = decode_base64(&text[after_state..orig_end]);
            after_state = orig_end;
        }
        // 找 " -->"
        if !text[after_state..].starts_with(" -->") {
            i = after_state;
            continue;
        }
        let inner_start = after_state + " -->".len();
        // 找 "<!-- /ai:id:xxx -->"
        let closing = format!("<!-- /ai:id:{} -->", id);
        let closing_offset = match text[inner_start..].find(&closing) {
            Some(p) => inner_start + p,
            None => break,
        };
        let inner_end = closing_offset;
        let full_end = closing_offset + closing.len();

        // 计算 ai 内容的实际起止(trim 头尾换行)
        let inner = &text[inner_start..inner_end];
        let lead = inner
            .chars()
            .take_while(|c| *c == '\n')
            .count();
        let tail = inner
            .chars()
            .rev()
            .take_while(|c| *c == '\n')
            .count();
        // 计算字符偏移(utf8 边界,这里用字节偏移要小心)
        let ai_start = inner_start + lead; // lead 字符数 = lead 字节(都是 \n)
        let ai_end = inner_end - tail;

        regions.push(AiRegion {
            id,
            state,
            start: start_offset,
            end: full_end,
            ai_start,
            ai_end,
            kind: "replace".to_string(),
            original_text,
        });
        i = full_end;
    }
    regions
}

fn decode_base64(s: &str) -> String {
    use base64::{engine::general_purpose, Engine as _};
    match general_purpose::STANDARD.decode(s) {
        Ok(b) => String::from_utf8(b).unwrap_or_default(),
        Err(_) => String::new(),
    }
}

fn encode_base64(s: &str) -> String {
    use base64::{engine::general_purpose, Engine as _};
    general_purpose::STANDARD.encode(s.as_bytes())
}

/// 接受一个区域(删除注释,只保留 AI 内容)
pub fn accept_region(text: &str, region: &AiRegion) -> String {
    let before = &text[..region.start];
    let after = &text[region.end..];
    let inner = &text[region.ai_start..region.ai_end];
    format!("{}{}{}", before, inner, after)
}

/// 拒绝一个区域(删除整段,还原 original)
pub fn reject_region(text: &str, region: &AiRegion) -> String {
    let before = &text[..region.start];
    let after = &text[region.end..];
    format!("{}{}{}", before, region.original_text, after)
}

/// 统计 AI 贡献的字数(accepted 状态的)
pub fn count_ai_chars(text: &str) -> usize {
    let regions = parse_ai_regions(text);
    regions
        .iter()
        .filter(|r| r.state == AiRegionState::Accepted)
        .map(|r| {
            text[r.ai_start..r.ai_end]
                .chars()
                .filter(|c| !c.is_whitespace())
                .count()
        })
        .sum()
}

/// 生成 AI 区域(供前端调用时生成可序列化的 id/original)
pub fn build_ai_region(ai_text: &str, original_text: &str) -> (String, String) {
    let id = format!(
        "{}_{:x}_{:x}",
        chrono::Utc::now().timestamp_millis(),
        rand_u32(),
        rand_u32()
    );
    let orig_b64 = encode_base64(original_text);
    let safe = ai_text.replace("<!--", "<!‐‐");
    let wrapped = if orig_b64.is_empty() {
        format!(
            "<!-- @ai:id:{} state:pending -->{}<!-- /ai:id:{} -->",
            id, safe, id
        )
    } else {
        format!(
            "<!-- @ai:id:{} state:pending original:{} -->{}<!-- /ai:id:{} -->",
            id, orig_b64, safe, id
        )
    };
    (id, wrapped)
}

fn rand_u32() -> u32 {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    nanos ^ (std::process::id() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple() {
        let text = "hello<!-- @ai:id:abc123 state:pending -->world<!-- /ai:id:abc123 -->end";
        let regions = parse_ai_regions(text);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].id, "abc123");
        assert_eq!(regions[0].state, AiRegionState::Pending);
        assert_eq!(&text[regions[0].ai_start..regions[0].ai_end], "world");
    }

    #[test]
    fn test_parse_with_newlines() {
        let text = "before\n<!-- @ai:id:xyz state:pending -->\nAI text\n<!-- /ai:id:xyz -->\nafter";
        let regions = parse_ai_regions(text);
        assert_eq!(regions.len(), 1);
        assert_eq!(&text[regions[0].ai_start..regions[0].ai_end], "AI text");
    }

    #[test]
    fn test_parse_with_original() {
        let orig = "原选区文本";
        let orig_b64 = encode_base64(orig);
        let text = format!(
            "hello<!-- @ai:id:a1 state:pending original:{} -->new text<!-- /ai:id:a1 -->end",
            orig_b64
        );
        let regions = parse_ai_regions(&text);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].original_text, orig);
    }

    #[test]
    fn test_parse_multiple() {
        let text = "<!-- @ai:id:a state:pending -->A<!-- /ai:id:a --> mid <!-- @ai:id:b state:accepted -->B<!-- /ai:id:b -->";
        let regions = parse_ai_regions(&text);
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].state, AiRegionState::Pending);
        assert_eq!(regions[1].state, AiRegionState::Accepted);
    }

    #[test]
    fn test_accept_region() {
        let text = "hello<!-- @ai:id:x state:pending -->world<!-- /ai:id:x -->end";
        let regions = parse_ai_regions(&text);
        let new_text = accept_region(&text, &regions[0]);
        assert_eq!(new_text, "helloworldend");
    }

    #[test]
    fn test_reject_region_with_original() {
        let orig = "原选区";
        let orig_b64 = encode_base64(orig);
        let text = format!(
            "hello<!-- @ai:id:y state:pending original:{} -->new<!-- /ai:id:y -->end",
            orig_b64
        );
        let regions = parse_ai_regions(&text);
        let new_text = reject_region(&text, &regions[0]);
        assert_eq!(new_text, format!("hello{}end", orig));
    }

    #[test]
    fn test_reject_region_without_original() {
        let text = "hello<!-- @ai:id:z state:pending -->new<!-- /ai:id:z -->end";
        let regions = parse_ai_regions(&text);
        let new_text = reject_region(&text, &regions[0]);
        assert_eq!(new_text, "helloend");
    }

    #[test]
    fn test_count_ai_chars() {
        let text = "<!-- @ai:id:a state:accepted -->中文abc<!-- /ai:id:a --> \
                    <!-- @ai:id:b state:pending -->不计入<!-- /ai:id:b -->";
        let count = count_ai_chars(text);
        // accepted: "中文abc" = 5 chars
        assert_eq!(count, 5);
    }

    #[test]
    fn test_build_ai_region() {
        let (id, wrapped) = build_ai_region("ai text", "original");
        assert!(wrapped.contains(&format!("id:{}", id)));
        assert!(wrapped.contains("original:"));
        assert!(wrapped.contains("ai text"));
    }

    #[test]
    fn test_no_regions() {
        let regions = parse_ai_regions("普通文本,没有 AI 标记");
        assert_eq!(regions.len(), 0);
    }
}
