use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("扫描任务已经在运行")]
    AlreadyScanning,
    #[error("目标窗口名称不能为空")]
    EmptyWindowTitle,
    #[error("采样间隔必须在 200 到 5000 毫秒之间")]
    InvalidInterval,
    #[error("画面变化阈值必须在 0 到 1 之间")]
    InvalidThreshold,
    #[error("找不到文件：{0}")]
    MissingFile(String),
    #[error("OCR 初始化或推理失败：{0}")]
    Ocr(String),
    #[error("Windows 游戏窗口采集尚未在当前平台启用")]
    CaptureUnavailable,
    #[error("截图失败：{0}")]
    Capture(String),
    #[error("内部状态不可用")]
    StateUnavailable,
    #[error("本地数据库错误：{0}")]
    Database(String),
    #[error("数据导出失败：{0}")]
    Export(String),
    #[error("游戏数据直读失败：{0}")]
    DirectRead(String),
    #[error("分页参数无效")]
    InvalidPage,
    #[error("删除请求必须包含明确的数据 ID")]
    EmptyDeleteRequest,
    #[error("检测到不同游戏账号，需确认清空当前数据后再切换")]
    AccountMismatch,
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
