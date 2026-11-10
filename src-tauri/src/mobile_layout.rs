//! Reports UIKit's real reserved regions; never infers a hinge from screen size.
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileLayoutRegions {
    width: f64,
    height: f64,
    division: Vec<LayoutRect>,
    occlusion: Vec<LayoutRect>,
}

#[cfg(mobile)]
#[tauri::command]
pub async fn get_mobile_layout_regions(
    webview: tauri::Webview,
) -> Result<Option<MobileLayoutRegions>, String> {
    #[cfg(target_os = "ios")]
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        webview
            .with_webview(move |platform| {
                // UIKit must be queried on its UI thread. On older systems the
                // selector is absent and the ordinary responsive layout remains.
                let result = unsafe { query_regions(platform.inner().cast()) };
                let _ = sender.send(result);
            })
            .map_err(|error| error.to_string())?;
        receiver.await.map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = webview;
        Ok(None)
    }
}

#[cfg(target_os = "ios")]
unsafe fn query_regions(view: *mut objc2::runtime::AnyObject) -> Option<MobileLayoutRegions> {
    use objc2::{msg_send, runtime::AnyClass, sel};
    use objc2_core_foundation::CGRect;
    if view.is_null() {
        return None;
    }
    let available: bool =
        unsafe { msg_send![view, respondsToSelector: sel!(reservedRegionsOfKind:)] };
    if !available {
        return None;
    }
    let kind = AnyClass::get(c"UIViewReservedRegionKind")?;
    let bounds: CGRect = unsafe { msg_send![view, bounds] };
    let division: *mut objc2::runtime::AnyObject = unsafe { msg_send![kind, divisionRegionKind] };
    let occlusion: *mut objc2::runtime::AnyObject = unsafe { msg_send![kind, occlusionRegionKind] };
    Some(MobileLayoutRegions {
        width: bounds.size.width,
        height: bounds.size.height,
        division: unsafe { read_regions(view, division) },
        occlusion: unsafe { read_regions(view, occlusion) },
    })
}

#[cfg(target_os = "ios")]
unsafe fn read_regions(
    view: *mut objc2::runtime::AnyObject,
    kind: *mut objc2::runtime::AnyObject,
) -> Vec<LayoutRect> {
    use objc2::msg_send;
    use objc2_core_foundation::CGRect;
    let regions: *mut objc2::runtime::AnyObject =
        unsafe { msg_send![view, reservedRegionsOfKind: kind] };
    if regions.is_null() {
        return Vec::new();
    }
    let count: usize = unsafe { msg_send![regions, count] };
    (0..count)
        .map(|index| {
            let region: *mut objc2::runtime::AnyObject =
                unsafe { msg_send![regions, objectAtIndex: index] };
            let frame: CGRect = unsafe { msg_send![region, frame] };
            LayoutRect {
                x: frame.origin.x,
                y: frame.origin.y,
                width: frame.size.width,
                height: frame.size.height,
            }
        })
        .collect()
}
