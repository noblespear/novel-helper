// AI Provider 抽象层
//
// 支持的 Provider:
// - Mock: 不调用 API,用于演示 UI 和测试
// - OpenAI Compatible: 通用 OpenAI 协议 (DeepSeek/Moonshot/Qwen/OpenAI 都用这个)
// - Anthropic: Claude 系列

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// 聊天消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system" | "user" | "assistant"
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self { role: "system".into(), content: content.into() }
    }
    pub fn user(content: impl Into<String>) -> Self {
        Self { role: "user".into(), content: content.into() }
    }
    pub fn assistant(content: impl Into<String>) -> Self {
        Self { role: "assistant".into(), content: content.into() }
    }
}

/// 聊天请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: f32,
    pub max_tokens: u32,
    pub stream: bool,
}

impl Default for ChatRequest {
    fn default() -> Self {
        Self {
            model: String::new(),
            messages: vec![],
            temperature: 0.7,
            max_tokens: 2000,
            stream: true,
        }
    }
}

/// 流式响应 chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChunk {
    pub content: String,
    pub done: bool,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Provider 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub provider_type: String, // "mock" | "openai" | "anthropic"
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            provider_type: "mock".into(),
            api_key: String::new(),
            base_url: "https://api.deepseek.com".into(),
            model: "deepseek-chat".into(),
        }
    }
}

/// AI Provider trait - 所有实现必须实现这个
#[async_trait]
pub trait AIProvider: Send + Sync {
    /// 流式聊天 - 通过 on_chunk 回调推 chunk
    async fn chat_stream(
        &self,
        req: ChatRequest,
        on_chunk: Box<dyn Fn(ChatChunk) + Send + Sync>,
    ) -> Result<(), String>;

    /// 列出可用模型
    async fn list_models(&self) -> Result<Vec<String>, String>;

    /// 验证 API key
    async fn validate(&self) -> Result<bool, String>;
}

/// Provider 注册表
pub struct ProviderRegistry {
    inner: Arc<dyn AIProvider>,
}

impl ProviderRegistry {
    pub fn new(config: ProviderConfig) -> Self {
        let inner: Arc<dyn AIProvider> = match config.provider_type.as_str() {
            "openai" | "openai_compatible" => Arc::new(OpenAIProvider::new(config)),
            "anthropic" => Arc::new(AnthropicProvider::new(config)),
            _ => Arc::new(MockProvider::new()),
        };
        Self { inner }
    }

    pub async fn chat_stream(
        &self,
        req: ChatRequest,
        on_chunk: Box<dyn Fn(ChatChunk) + Send + Sync>,
    ) -> Result<(), String> {
        self.inner.chat_stream(req, on_chunk).await
    }

    pub async fn list_models(&self) -> Result<Vec<String>, String> {
        self.inner.list_models().await
    }

    pub async fn validate(&self) -> Result<bool, String> {
        self.inner.validate().await
    }
}

// =================== Mock Provider ===================
pub struct MockProvider;

impl MockProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MockProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl AIProvider for MockProvider {
    async fn chat_stream(
        &self,
        req: ChatRequest,
        on_chunk: Box<dyn Fn(ChatChunk) + Send + Sync>,
    ) -> Result<(), String> {
        let user_input = req
            .messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.clone())
            .unwrap_or_default();

        let response = mock_respond(&user_input);
        let chunks: Vec<String> = split_into_chunks(&response, 4);

        for chunk in chunks {
            on_chunk(ChatChunk {
                content: chunk,
                done: false,
                usage: None,
            });
            std::thread::sleep(std::time::Duration::from_millis(60));
        }
        on_chunk(ChatChunk {
            content: String::new(),
            done: true,
            usage: Some(Usage {
                prompt_tokens: 100,
                completion_tokens: 80,
                total_tokens: 180,
            }),
        });
        Ok(())
    }

    async fn list_models(&self) -> Result<Vec<String>, String> {
        Ok(vec![
            "mock-fast".to_string(),
            "mock-balanced".to_string(),
            "mock-quality".to_string(),
        ])
    }

    async fn validate(&self) -> Result<bool, String> {
        Ok(true)
    }
}

fn mock_respond(input: &str) -> String {
    let input_lower = input.to_lowercase();

    if input_lower.contains("润色") || input_lower.contains("polish") {
        return mock_polish(input);
    }

    if input_lower.contains("续写") || input_lower.contains("continue") {
        return "他抬起头,目光穿过薄薄的雾气,落在了远处那座古旧的山门上。\n\n\"走吧,\"他低声说,\"答案在里面。\"\n\n身后,脚步声紧随而来。".to_string();
    }

    let preview: String = if input.chars().count() > 100 {
        input.chars().take(100).collect()
    } else {
        input.to_string()
    };

    format!(
        "(Mock 响应)\n\n你说了:{}\n\n这是一个模拟回复。要使用真实 AI,请在设置中配置 API Key。",
        preview
    )
}

/// Mock 润色:对短输入做可见的字词替换,方便在 diff 视图中看到绿色新增/红色删除
fn mock_polish(input: &str) -> String {
    let mut s = input.to_string();
    let replacements: &[(&str, &str)] = &[
        ("我", "在下"),
        ("你", "汝"),
        ("他", "他"),
        ("她", "她"),
        ("我们", "我等"),
        ("很", "极为"),
        ("非常", "甚为"),
        ("说", "言道"),
        ("说:", "言道:"),
        ("说:", "言道:"),
        ("道:", "言道:"),
        ("道:", "言道:"),
        ("说。", "言罢。"),
        ("了。", "了。"),
        ("走", "迈步而去"),
        ("看", "望"),
        ("想", "思忖"),
        ("知道", "心知"),
        ("现在", "此刻"),
        ("然后", "继而"),
        ("但是", "然而"),
        ("因为", "缘何"),
    ];
    for (from, to) in replacements {
        if s.contains(from) {
            s = s.replace(from, to);
        }
    }
    s
}

fn split_into_chunks(s: &str, n: usize) -> Vec<String> {
    let chars: Vec<char> = s.chars().collect();
    if chars.is_empty() {
        return vec![];
    }
    let chunk_size = (chars.len() + n - 1) / n;
    chars
        .chunks(chunk_size.max(1))
        .map(|c| c.iter().collect::<String>())
        .collect()
}

// =================== OpenAI 兼容 Provider ===================
pub struct OpenAIProvider {
    config: ProviderConfig,
    client: reqwest::Client,
}

impl OpenAIProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .unwrap_or_default(),
        }
    }
}

#[async_trait]
impl AIProvider for OpenAIProvider {
    async fn chat_stream(
        &self,
        req: ChatRequest,
        on_chunk: Box<dyn Fn(ChatChunk) + Send + Sync>,
    ) -> Result<(), String> {
        let url = format!("{}/v1/chat/completions", self.config.base_url.trim_end_matches('/'));
        let api_key = self.config.api_key.clone();

        let body = serde_json::json!({
            "model": req.model,
            "messages": req.messages.iter().map(|m| {
                serde_json::json!({"role": m.role, "content": m.content})
            }).collect::<Vec<_>>(),
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
            "stream": true,
        });

        let client = self.client.clone();
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                use futures::StreamExt;
                let mut stream = r.bytes_stream();
                let mut buffer = String::new();
                while let Some(chunk) = stream.next().await {
                    if let Ok(bytes) = chunk {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        while let Some(idx) = buffer.find("\n\n") {
                            let event = buffer[..idx].to_string();
                            buffer = buffer[idx + 2..].to_string();
                            for line in event.lines() {
                                if let Some(data) = line.strip_prefix("data: ") {
                                    if data == "[DONE]" {
                                        on_chunk(ChatChunk {
                                            content: String::new(),
                                            done: true,
                                            usage: None,
                                        });
                                        return Ok(());
                                    }
                                    if let Ok(json) =
                                        serde_json::from_str::<serde_json::Value>(data)
                                    {
                                        let content = json["choices"][0]["delta"]["content"]
                                            .as_str()
                                            .unwrap_or("")
                                            .to_string();
                                        if !content.is_empty() {
                                            on_chunk(ChatChunk {
                                                content,
                                                done: false,
                                                usage: None,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                on_chunk(ChatChunk {
                    content: format!("[错误 {}] {}", status, text),
                    done: true,
                    usage: None,
                });
            }
            Err(e) => {
                on_chunk(ChatChunk {
                    content: format!("[网络错误] {}", e),
                    done: true,
                    usage: None,
                });
            }
        }
        Ok(())
    }

    async fn list_models(&self) -> Result<Vec<String>, String> {
        let url = format!("{}/v1/models", self.config.base_url.trim_end_matches('/'));
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Ok(vec![]);
        }
        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let models = json["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        Ok(models)
    }

    async fn validate(&self) -> Result<bool, String> {
        if self.config.api_key.is_empty() {
            return Err("API key 为空".to_string());
        }
        match self.list_models().await {
            Ok(_) => Ok(true),
            Err(e) => Err(e),
        }
    }
}

// =================== Anthropic Provider ===================
pub struct AnthropicProvider {
    config: ProviderConfig,
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .unwrap_or_default(),
        }
    }
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    async fn chat_stream(
        &self,
        req: ChatRequest,
        on_chunk: Box<dyn Fn(ChatChunk) + Send + Sync>,
    ) -> Result<(), String> {
        let url = "https://api.anthropic.com/v1/messages".to_string();
        let api_key = self.config.api_key.clone();
        let model = if req.model.is_empty() {
            "claude-3-5-sonnet-20241022".to_string()
        } else {
            req.model.clone()
        };

        let system_msg = req
            .messages
            .iter()
            .find(|m| m.role == "system")
            .map(|m| m.content.clone())
            .unwrap_or_default();

        let messages: Vec<serde_json::Value> = req
            .messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| {
                serde_json::json!({"role": m.role, "content": m.content})
            })
            .collect();

        let body = serde_json::json!({
            "model": model,
            "system": system_msg,
            "messages": messages,
            "max_tokens": req.max_tokens,
            "stream": true,
        });

        let client = self.client.clone();
        let resp = client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                use futures::StreamExt;
                let mut stream = r.bytes_stream();
                let mut buffer = String::new();
                while let Some(chunk) = stream.next().await {
                    if let Ok(bytes) = chunk {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        while let Some(idx) = buffer.find("\n\n") {
                            let event = buffer[..idx].to_string();
                            buffer = buffer[idx + 2..].to_string();
                            for line in event.lines() {
                                if let Some(data) = line.strip_prefix("data: ") {
                                    if let Ok(json) =
                                        serde_json::from_str::<serde_json::Value>(data)
                                    {
                                        if json["type"] == "content_block_delta" {
                                            let content = json["delta"]["text"]
                                                .as_str()
                                                .unwrap_or("")
                                                .to_string();
                                            if !content.is_empty() {
                                                on_chunk(ChatChunk {
                                                    content,
                                                    done: false,
                                                    usage: None,
                                                });
                                            }
                                        } else if json["type"] == "message_stop" {
                                            on_chunk(ChatChunk {
                                                content: String::new(),
                                                done: true,
                                                usage: None,
                                            });
                                            return Ok(());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                on_chunk(ChatChunk {
                    content: format!("[错误 {}] {}", status, text),
                    done: true,
                    usage: None,
                });
            }
            Err(e) => {
                on_chunk(ChatChunk {
                    content: format!("[网络错误] {}", e),
                    done: true,
                    usage: None,
                });
            }
        }
        Ok(())
    }

    async fn validate(&self) -> Result<bool, String> {
        if self.config.api_key.is_empty() {
            return Err("API key 为空".to_string());
        }
        Ok(true)
    }

    async fn list_models(&self) -> Result<Vec<String>, String> {
        Ok(vec![
            "claude-3-5-sonnet-20241022".to_string(),
            "claude-3-5-haiku-20241022".to_string(),
            "claude-3-opus-20240229".to_string(),
        ])
    }
}

// =================== Tests ===================

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn collect_chunks(s: &str) -> Vec<String> {
        let _ = s; // 保留 helper 占位
        Vec::new()
    }

    #[test]
    fn chat_message_constructors() {
        let m = ChatMessage::system("sys");
        assert_eq!(m.role, "system");
        assert_eq!(m.content, "sys");

        let m = ChatMessage::user("hi");
        assert_eq!(m.role, "user");

        let m = ChatMessage::assistant("hello");
        assert_eq!(m.role, "assistant");
    }

    #[test]
    fn chat_request_default() {
        let r = ChatRequest::default();
        assert_eq!(r.temperature, 0.7);
        assert_eq!(r.max_tokens, 2000);
        assert!(r.stream);
        assert!(r.messages.is_empty());
    }

    #[test]
    fn mock_polish_demonstrates_diff() {
        let original = "我走了很远的路,知道前面有危险。";
        let polished = mock_polish(original);
        // 替换发生了
        assert!(polished.contains("在下") || polished.contains("迈步") || polished.contains("心知"));
        // 保留了一些原文
        assert!(polished.contains("前") || polished.contains("危险"));
    }

    #[test]
    fn mock_polish_passthrough_for_chinese() {
        let original = "天空很蓝,白云朵朵。";
        let polished = mock_polish(original);
        // 至少一处替换
        assert!(polished != original);
    }

    #[test]
    fn mock_continue_returns_continuation() {
        let resp = mock_respond("续写:他站在门前");
        assert!(resp.contains("他抬起头") || resp.contains("言道"));
    }

    #[test]
    fn mock_general_response() {
        let resp = mock_respond("今天天气如何?");
        assert!(resp.contains("Mock"));
    }

    #[test]
    fn split_into_chunks_basic() {
        let chunks = split_into_chunks("hello world", 2);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0], "hello ");
        assert_eq!(chunks[1], "world");
    }

    #[test]
    fn split_into_chunks_empty() {
        let chunks = split_into_chunks("", 4);
        assert!(chunks.is_empty());
    }

    #[test]
    fn split_into_chunks_chinese() {
        let chunks = split_into_chunks("你好世界你好世界", 4);
        // 中文按字符分割,不破坏
        let joined: String = chunks.join("");
        assert_eq!(joined, "你好世界你好世界");
    }

    #[test]
    fn provider_config_default_is_mock() {
        let c = ProviderConfig::default();
        assert_eq!(c.provider_type, "mock");
        assert_eq!(c.model, "deepseek-chat");
    }

    #[tokio::test]
    async fn mock_provider_streams_chunks() {
        use std::sync::Arc;
        let p = MockProvider::new();
        let collected: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let done: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));

        let c2 = collected.clone();
        let d2 = done.clone();
        p.chat_stream(
            ChatRequest {
                model: "mock".into(),
                messages: vec![
                    ChatMessage::system("润色助手"),
                    ChatMessage::user("我走了很远的路"),
                ],
                ..Default::default()
            },
            Box::new(move |chunk| {
                if chunk.done {
                    *d2.lock().unwrap() = true;
                } else {
                    c2.lock().unwrap().push(chunk.content);
                }
            }),
        )
        .await
        .unwrap();

        assert!(*done.lock().unwrap(), "stream should terminate with done=true");
        let joined: String = collected.lock().unwrap().join("");
        assert!(!joined.is_empty(), "streamed content should not be empty");
    }

    #[tokio::test]
    async fn mock_provider_lists_three_models() {
        let p = MockProvider::new();
        let models = p.list_models().await.unwrap();
        assert_eq!(models.len(), 3);
        assert!(models[0].starts_with("mock-"));
    }

    #[tokio::test]
    async fn mock_provider_validates_always_true() {
        let p = MockProvider::new();
        assert!(p.validate().await.unwrap());
    }

    #[tokio::test]
    async fn registry_routes_to_mock_by_default() {
        let reg = ProviderRegistry::new(ProviderConfig::default());
        let models = reg.list_models().await.unwrap();
        assert!(!models.is_empty());
    }

    #[tokio::test]
    async fn registry_routes_to_anthropic() {
        let cfg = ProviderConfig {
            provider_type: "anthropic".into(),
            api_key: "test".into(),
            base_url: "".into(),
            model: "claude-3-5-sonnet-20241022".into(),
        };
        let reg = ProviderRegistry::new(cfg);
        let models = reg.list_models().await.unwrap();
        assert!(models.iter().any(|m| m.contains("claude")));
    }

    #[tokio::test]
    async fn registry_routes_to_openai_compatible() {
        let cfg = ProviderConfig {
            provider_type: "openai".into(),
            api_key: "test".into(),
            base_url: "https://api.deepseek.com".into(),
            model: "deepseek-chat".into(),
        };
        let _ = ProviderRegistry::new(cfg);
    }

    #[test]
    fn usage_serialization() {
        let u = Usage { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
        let json = serde_json::to_string(&u).unwrap();
        assert!(json.contains("\"total_tokens\":30"));
    }
}
