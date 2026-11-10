import { inject, type InjectionKey } from "vue";

export const mobileViewKey: InjectionKey<boolean> = Symbol("mobile-view");
export const useMobileView = () => inject(mobileViewKey, false);
