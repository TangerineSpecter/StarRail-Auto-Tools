use std::sync::Mutex;

use crate::{
    domain::{ScanPhase, ScanSnapshot, StartScanRequest},
    error::AppError,
};

#[derive(Default)]
pub struct ScannerState {
    snapshot: Mutex<ScanSnapshot>,
}

impl ScannerState {
    pub fn snapshot(&self) -> Result<ScanSnapshot, AppError> {
        self.snapshot
            .lock()
            .map(|snapshot| snapshot.clone())
            .map_err(|_| AppError::StateUnavailable)
    }

    pub fn start(&self, request: StartScanRequest) -> Result<ScanSnapshot, AppError> {
        let target_window = request.target_window.trim();
        if target_window.is_empty() {
            return Err(AppError::EmptyWindowTitle);
        }
        if !(200..=5000).contains(&request.interval_ms) {
            return Err(AppError::InvalidInterval);
        }
        if !(0.0..=1.0).contains(&request.change_threshold) {
            return Err(AppError::InvalidThreshold);
        }

        let snapshot = self
            .snapshot
            .lock()
            .map_err(|_| AppError::StateUnavailable)?;
        if matches!(snapshot.phase, ScanPhase::Scanning) {
            return Err(AppError::AlreadyScanning);
        }
        drop(snapshot);

        Err(AppError::CaptureUnavailable)
    }

    pub fn stop(&self) -> Result<ScanSnapshot, AppError> {
        let mut snapshot = self
            .snapshot
            .lock()
            .map_err(|_| AppError::StateUnavailable)?;
        snapshot.phase = ScanPhase::Idle;
        snapshot.last_message = "扫描已停止".to_owned();
        Ok(snapshot.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_interval() {
        let scanner = ScannerState::default();
        let result = scanner.start(StartScanRequest {
            target_window: "Game".to_owned(),
            interval_ms: 50,
            change_threshold: 0.08,
        });
        assert!(matches!(result, Err(AppError::InvalidInterval)));
    }

    #[test]
    fn rejects_empty_window_title() {
        let scanner = ScannerState::default();
        let result = scanner.start(StartScanRequest {
            target_window: " ".to_owned(),
            interval_ms: 750,
            change_threshold: 0.08,
        });
        assert!(matches!(result, Err(AppError::EmptyWindowTitle)));
    }
}
