use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[cfg_attr(not(feature = "ocr"), allow(dead_code))]
    #[error("找不到文件：{0}")]
    MissingFile(String),
    #[error("OCR 初始化或推理失败：{0}")]
    Ocr(String),
    #[error("截图失败：{0}")]
    Capture(String),
    #[error("内部状态不可用")]
    StateUnavailable,
    #[error("本地数据库错误：{0}")]
    Database(String),
    #[error("最低标准不能高于目标值")]
    MinExceedsTarget,
    #[error("数据导出失败：{0}")]
    Export(String),
    #[error("同步失败：{0}")]
    Sync(String),
    #[error("游戏数据直读失败：{0}")]
    DirectRead(String),
    #[error("分页参数无效")]
    InvalidPage,
    #[error("删除请求必须包含明确的数据 ID")]
    EmptyDeleteRequest,
    #[error("检测到不同游戏账号，需确认清空当前数据后再切换")]
    AccountMismatch,
    #[error("MCP 服务失败：{0}")]
    Mcp(String),
    #[error("OCR 模型错误：{0}")]
    OcrModel(String),
    #[error("遗器清理失败：{0}")]
    RelicCleanup(String),
    #[error("大模型配置失败：{0}")]
    ModelProvider(String),
    #[error("配装建议失败：{0}")]
    Advisor(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Export(value.to_string())
    }
}
