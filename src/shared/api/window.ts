import { getCurrentWindow } from "@tauri-apps/api/window";

/** Window operations are kept behind the shared desktop boundary. */
export const windowApi = {
  minimize: () => getCurrentWindow().minimize(),
  maximize: () => getCurrentWindow().maximize(),
  unmaximize: () => getCurrentWindow().unmaximize(),
  close: () => getCurrentWindow().close(),
  hide: () => getCurrentWindow().hide(),
  show: () => getCurrentWindow().show(),
  setFullscreen: (fullscreen: boolean) => getCurrentWindow().setFullscreen(fullscreen),
};
