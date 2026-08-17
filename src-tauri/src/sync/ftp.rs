use std::{io::Cursor, sync::Arc};

use suppaftp::{types::FileType, FtpError, FtpStream, RustlsConnector, RustlsFtpStream};

use crate::error::AppError;

use super::{
    settings::FtpSettings,
    transport::{
        assert_safe_filename, join_remote_path, normalize_remote_directory, parse_port,
        RemoteTransport,
    },
};

pub struct FtpTransport {
    settings: FtpSettings,
}

impl FtpTransport {
    pub fn new(settings: &FtpSettings) -> Result<Self, AppError> {
        settings.validate()?;
        Ok(Self {
            settings: settings.clone(),
        })
    }

    async fn with_client<T, F>(&self, action: F) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce(&mut FtpClient) -> Result<T, AppError> + Send + 'static,
    {
        let settings = self.settings.clone();
        tokio::task::spawn_blocking(move || {
            let mut client = FtpClient::connect(&settings)?;
            let result = action(&mut client);
            client.quit();
            result
        })
        .await
        .map_err(|error| AppError::Sync(format!("FTP 任务中断：{error}")))?
    }
}

impl RemoteTransport for FtpTransport {
    async fn test(&self) -> Result<(), AppError> {
        self.with_client(|client| client.probe()).await
    }

    async fn put(&self, file: &str, payload: Vec<u8>) -> Result<(), AppError> {
        let file = file.to_owned();
        self.with_client(move |client| client.put(&file, payload))
            .await
    }

    async fn get(&self, file: &str) -> Result<Vec<u8>, AppError> {
        let file = file.to_owned();
        self.with_client(move |client| client.get(&file)).await
    }

    async fn put_many(&self, files: Vec<(String, Vec<u8>)>) -> Result<(), AppError> {
        self.with_client(move |client| {
            for (file, payload) in files {
                client.put(&file, payload)?;
            }
            Ok(())
        })
        .await
    }
}

enum FtpClient {
    Plain(FtpStream),
    Tls(RustlsFtpStream),
}

impl FtpClient {
    fn connect(settings: &FtpSettings) -> Result<Self, AppError> {
        let host = settings.host.trim();
        let port = parse_port(settings.port)?;
        let addr = format!("{host}:{port}");
        let mut client = if settings.secure {
            let stream = RustlsFtpStream::connect(&addr)
                .map_err(|error| map_ftp_error("无法连接 FTP 服务器", error))?
                .into_secure(RustlsConnector::from(danger_tls_config()?), host)
                .map_err(|error| map_ftp_error("无法建立 FTPS 连接", error))?;
            Self::Tls(stream)
        } else {
            Self::Plain(
                FtpStream::connect(&addr)
                    .map_err(|error| map_ftp_error("无法连接 FTP 服务器", error))?,
            )
        };
        client
            .login(settings.username.trim(), &settings.password)
            .map_err(|error| map_ftp_error("认证失败，请检查用户名和密码", error))?;
        let directory = normalize_remote_directory(&settings.remote_path)?;
        client
            .cwd(&directory)
            .map_err(|error| map_ftp_error("远端同步目录不存在或无权访问", error))?;
        client
            .transfer_type(FileType::Binary)
            .map_err(|error| map_ftp_error("无法切换到二进制传输", error))?;
        Ok(client)
    }

    fn login(&mut self, username: &str, password: &str) -> Result<(), FtpError> {
        match self {
            Self::Plain(stream) => stream.login(username, password),
            Self::Tls(stream) => stream.login(username, password),
        }
    }

    fn cwd(&mut self, path: &str) -> Result<(), FtpError> {
        match self {
            Self::Plain(stream) => stream.cwd(path),
            Self::Tls(stream) => stream.cwd(path),
        }
    }

    fn transfer_type(&mut self, file_type: FileType) -> Result<(), FtpError> {
        match self {
            Self::Plain(stream) => stream.transfer_type(file_type),
            Self::Tls(stream) => stream.transfer_type(file_type),
        }
    }

    fn probe(&mut self) -> Result<(), AppError> {
        let _ = join_remote_path(".", "probe.json")?;
        match self {
            Self::Plain(stream) => stream.pwd(),
            Self::Tls(stream) => stream.pwd(),
        }
        .map(|_| ())
        .map_err(|error| map_ftp_error("无法访问远端同步目录", error))
    }

    fn put(&mut self, file: &str, payload: Vec<u8>) -> Result<(), AppError> {
        assert_safe_filename(file)?;
        let mut reader = Cursor::new(payload);
        match self {
            Self::Plain(stream) => stream.put_file(file, &mut reader).map(|_| ()),
            Self::Tls(stream) => stream.put_file(file, &mut reader).map(|_| ()),
        }
        .map_err(|error| map_ftp_error("无法上传同步文件", error))
    }

    fn get(&mut self, file: &str) -> Result<Vec<u8>, AppError> {
        assert_safe_filename(file)?;
        let cursor = match self {
            Self::Plain(stream) => stream.retr_as_buffer(file),
            Self::Tls(stream) => stream.retr_as_buffer(file),
        }
        .map_err(|error| map_ftp_error("远端同步文件不存在", error))?;
        Ok(cursor.into_inner())
    }

    fn quit(self) {
        match self {
            Self::Plain(mut stream) => {
                let _ = stream.quit();
            }
            Self::Tls(mut stream) => {
                let _ = stream.quit();
            }
        }
    }
}

fn map_ftp_error(message: &str, error: FtpError) -> AppError {
    AppError::Sync(format!("{message}：{error}"))
}

fn danger_tls_config() -> Result<Arc<suppaftp::rustls::ClientConfig>, AppError> {
    let _ = suppaftp::rustls::crypto::ring::default_provider().install_default();
    let config = suppaftp::rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AcceptAnyCert))
        .with_no_client_auth();
    Ok(Arc::new(config))
}

#[derive(Debug)]
struct AcceptAnyCert;

impl suppaftp::rustls::client::danger::ServerCertVerifier for AcceptAnyCert {
    fn verify_server_cert(
        &self,
        _end_entity: &suppaftp::rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[suppaftp::rustls::pki_types::CertificateDer<'_>],
        _server_name: &suppaftp::rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: suppaftp::rustls::pki_types::UnixTime,
    ) -> Result<suppaftp::rustls::client::danger::ServerCertVerified, suppaftp::rustls::Error> {
        Ok(suppaftp::rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &suppaftp::rustls::pki_types::CertificateDer<'_>,
        _dss: &suppaftp::rustls::DigitallySignedStruct,
    ) -> Result<suppaftp::rustls::client::danger::HandshakeSignatureValid, suppaftp::rustls::Error>
    {
        Ok(suppaftp::rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &suppaftp::rustls::pki_types::CertificateDer<'_>,
        _dss: &suppaftp::rustls::DigitallySignedStruct,
    ) -> Result<suppaftp::rustls::client::danger::HandshakeSignatureValid, suppaftp::rustls::Error>
    {
        Ok(suppaftp::rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<suppaftp::rustls::SignatureScheme> {
        suppaftp::rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}
