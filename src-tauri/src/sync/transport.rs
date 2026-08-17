use crate::error::AppError;

pub fn assert_safe_filename(file: &str) -> Result<(), AppError> {
    if file.is_empty()
        || file.contains('/')
        || file.contains('\\')
        || file.contains("..")
        || file.contains('\0')
    {
        return Err(AppError::Sync("非法的同步文件名".to_owned()));
    }
    Ok(())
}

fn trim_remote_directory(directory: &str) -> String {
    let trimmed = directory.trim();
    let without_slash = trimmed.trim_end_matches('/');
    if without_slash.is_empty() && trimmed.starts_with('/') {
        "/".to_owned()
    } else {
        without_slash.to_owned()
    }
}

pub fn join_remote_path(directory: &str, file: &str) -> Result<String, AppError> {
    assert_safe_filename(file)?;
    let directory = trim_remote_directory(directory);
    if directory.is_empty() {
        Ok(file.to_owned())
    } else if directory == "/" {
        Ok(format!("/{file}"))
    } else {
        Ok(format!("{directory}/{file}"))
    }
}

pub fn normalize_remote_directory(path: &str) -> Result<String, AppError> {
    let path = path.trim();
    if path.is_empty() {
        return Err(AppError::Sync("请填写远端同步目录".to_owned()));
    }
    if path.contains("..") || path.contains('\\') || path.contains('\0') {
        return Err(AppError::Sync("远端同步目录不合法".to_owned()));
    }
    Ok(trim_remote_directory(path))
}

pub fn parse_port(port: u16) -> Result<u16, AppError> {
    if port == 0 {
        return Err(AppError::Sync("端口必须在 1 到 65535 之间".to_owned()));
    }
    Ok(port)
}

pub trait RemoteTransport {
    fn test(&self) -> impl std::future::Future<Output = Result<(), AppError>> + Send;
    fn put(
        &self,
        file: &str,
        payload: Vec<u8>,
    ) -> impl std::future::Future<Output = Result<(), AppError>> + Send;
    fn get(
        &self,
        file: &str,
    ) -> impl std::future::Future<Output = Result<Vec<u8>, AppError>> + Send;

    fn put_many(
        &self,
        files: Vec<(String, Vec<u8>)>,
    ) -> impl std::future::Future<Output = Result<(), AppError>> + Send;
}

pub async fn put_files_sequentially<T: RemoteTransport>(
    transport: &T,
    files: Vec<(String, Vec<u8>)>,
) -> Result<(), AppError> {
    for (file, payload) in files {
        transport.put(&file, payload).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_account_root_and_trims_nested_directories() {
        assert_eq!(normalize_remote_directory("/").unwrap(), "/");
        assert_eq!(normalize_remote_directory("///").unwrap(), "/");
        assert_eq!(
            normalize_remote_directory("/StarRailTools/").unwrap(),
            "/StarRailTools"
        );
        assert_eq!(
            normalize_remote_directory("StarRailTools").unwrap(),
            "StarRailTools"
        );
        assert!(normalize_remote_directory("").is_err());
    }

    #[test]
    fn joins_files_under_root_and_nested_directories() {
        assert_eq!(
            join_remote_path("/", "manifest.json").unwrap(),
            "/manifest.json"
        );
        assert_eq!(
            join_remote_path("/StarRailTools/", "manifest.json").unwrap(),
            "/StarRailTools/manifest.json"
        );
        assert_eq!(
            join_remote_path("StarRailTools", "manifest.json").unwrap(),
            "StarRailTools/manifest.json"
        );
    }
}
