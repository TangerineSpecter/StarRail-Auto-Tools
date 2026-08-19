use std::sync::{Arc, Mutex};

use axum::{
    extract::Request,
    http::StatusCode,
    middleware::{self, Next},
    response::Response,
    Router,
};
use rmcp::transport::streamable_http_server::{
    session::never::NeverSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

use crate::{error::AppError, inventory::InventoryStore, sync::SyncStore};

use super::{
    auth::is_authorized,
    settings::{catalog_tools, McpSettings, McpStatus, McpStore, MCP_BIND_HOST},
    tools::StarRailMcp,
};

#[derive(Clone)]
pub struct McpRuntime {
    store: McpStore,
    inventory: InventoryStore,
    sync: SyncStore,
    app: AppHandle,
    auth_token: Arc<Mutex<String>>,
    inner: Arc<Mutex<RuntimeInner>>,
    lifecycle: Arc<tokio::sync::Mutex<()>>,
}

struct RuntimeInner {
    settings: McpSettings,
    server: Option<RunningServer>,
    last_error: Option<String>,
    running: bool,
}

struct RunningServer {
    cancel: CancellationToken,
    join: tauri::async_runtime::JoinHandle<()>,
}

impl McpRuntime {
    pub fn new(
        store: McpStore,
        inventory: InventoryStore,
        sync: SyncStore,
        app: AppHandle,
    ) -> Self {
        let settings = store.load().unwrap_or_default();
        Self {
            store,
            inventory,
            sync,
            app,
            auth_token: Arc::new(Mutex::new(settings.token.clone())),
            inner: Arc::new(Mutex::new(RuntimeInner {
                settings,
                server: None,
                last_error: None,
                running: false,
            })),
            lifecycle: Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    pub fn load_settings(&self) -> Result<McpSettings, AppError> {
        self.store.load()
    }

    pub fn status(&self) -> McpStatus {
        let inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
        let settings = inner.settings.clone();
        McpStatus {
            enabled: settings.enabled,
            running: inner.running,
            bind_address: MCP_BIND_HOST.to_owned(),
            port: settings.port,
            endpoint: settings.endpoint(),
            last_error: inner.last_error.clone(),
            tools: catalog_tools(),
        }
    }

    pub fn save_settings(&self, settings: McpSettings) -> Result<McpSettings, AppError> {
        let saved = self.store.save(settings)?;
        self.replace_token(&saved.token);
        Ok(saved)
    }

    pub fn regenerate_token(&self) -> Result<McpSettings, AppError> {
        let mut settings = self.store.load()?;
        settings.token = super::settings::generate_token()?;
        let saved = self.store.save(settings)?;
        self.replace_token(&saved.token);
        let mut inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
        inner.settings.token = saved.token.clone();
        Ok(saved)
    }

    pub async fn apply(&self, settings: &McpSettings) -> Result<(), AppError> {
        let _guard = self.lifecycle.lock().await;
        self.stop_current().await;
        {
            let mut inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
            inner.settings = settings.clone();
            inner.last_error = None;
        }
        self.replace_token(&settings.token);
        if !settings.enabled {
            return Ok(());
        }
        match self.spawn_server(settings).await {
            Ok(server) => {
                let mut inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
                inner.server = Some(server);
                inner.running = true;
                inner.last_error = None;
                Ok(())
            }
            Err(error) => {
                let mut inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
                inner.running = false;
                inner.last_error = Some(error.to_string());
                Err(error)
            }
        }
    }

    pub async fn apply_saved(&self) -> Result<(), AppError> {
        let settings = self.store.load()?;
        self.apply(&settings).await
    }

    async fn stop_current(&self) {
        let server = {
            let mut inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
            inner.running = false;
            inner.server.take()
        };
        if let Some(server) = server {
            server.cancel.cancel();
            let _ = server.join.await;
        }
    }

    fn replace_token(&self, token: &str) {
        if let Ok(mut current) = self.auth_token.lock() {
            *current = token.to_owned();
        }
    }

    async fn spawn_server(&self, settings: &McpSettings) -> Result<RunningServer, AppError> {
        if settings.token.trim().is_empty() {
            return Err(AppError::Mcp(
                "MCP 访问令牌为空，请重新生成后再启用".to_owned(),
            ));
        }
        let addr = (MCP_BIND_HOST, settings.port);
        let listener = tokio::net::TcpListener::bind(addr).await.map_err(|error| {
            AppError::Mcp(format!(
                "无法在 {MCP_BIND_HOST}:{} 监听：{error}",
                settings.port
            ))
        })?;
        let cancel = CancellationToken::new();
        let inventory = self.inventory.clone();
        let sync = self.sync.clone();
        let app = self.app.clone();
        let auth_token = self.auth_token.clone();
        let service = StreamableHttpService::new(
            move || {
                Ok(StarRailMcp::new(
                    inventory.clone(),
                    sync.clone(),
                    app.clone(),
                ))
            },
            // The desktop process can restart while an AI client keeps an old
            // Mcp-Session-Id. This server stores capture tasks in application
            // state rather than in HTTP sessions, so stateless requests avoid
            // stale-session failures and work across client reconnects.
            NeverSessionManager::default().into(),
            StreamableHttpServerConfig::default()
                .with_legacy_session_mode(false)
                .with_json_response(true)
                .with_cancellation_token(cancel.child_token()),
        );
        let router = Router::new()
            .nest_service("/mcp", service)
            .layer(middleware::from_fn(move |request, next| {
                let auth_token = auth_token.clone();
                async move { authorize_request(auth_token, request, next).await }
            }));
        let shutdown = cancel.clone();
        let join = tauri::async_runtime::spawn(async move {
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    shutdown.cancelled().await;
                })
                .await;
        });
        Ok(RunningServer { cancel, join })
    }
}

async fn authorize_request(
    token: Arc<Mutex<String>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let expected = token.lock().map(|value| value.clone()).unwrap_or_default();
    if is_authorized(&expected, request.headers()) {
        Ok(next.run(request).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}
