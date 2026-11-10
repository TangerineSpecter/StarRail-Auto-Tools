use objc2::{msg_send, runtime::AnyObject};
use std::ptr::NonNull;

pub fn disable_page_zoom(webview: &tauri::Webview) -> tauri::Result<()> {
    webview.with_webview(|platform| {
        // Runs on the UI thread after page load. UIKit may still return no
        // recognizer; the viewport and touch-action limits cover that case.
        unsafe {
            let Some(view) = NonNull::new(platform.inner().cast::<AnyObject>()) else {
                return;
            };
            let scroll: *mut AnyObject = msg_send![view.as_ptr(), scrollView];
            let Some(scroll) = NonNull::new(scroll) else {
                return;
            };
            let pinch: *mut AnyObject = msg_send![scroll.as_ptr(), pinchGestureRecognizer];
            if let Some(pinch) = NonNull::new(pinch) {
                let _: () = msg_send![pinch.as_ptr(), setEnabled: false];
            }
        }
    })
}
