import { inject, type InjectionKey, type Ref } from "vue";

export interface MobileSubModeHandlers {
  pageId: string;
  prev: () => void;
  next: () => void;
}

export interface MobileSubModeContext {
  active: Ref<boolean>;
  prev: () => void;
  next: () => void;
  register: (handlers: MobileSubModeHandlers | null) => () => void;
}

export const mobileSubModeKey: InjectionKey<MobileSubModeContext> = Symbol("mobile-sub-mode");

export function useMobileSubMode(): MobileSubModeContext | null {
  return inject(mobileSubModeKey, null);
}
