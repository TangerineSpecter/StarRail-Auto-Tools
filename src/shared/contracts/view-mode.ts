import { inject, type InjectionKey } from "vue";

/** Read-only viewers may calculate scores, but must not write derived caches. */
export const readOnlyViewKey: InjectionKey<boolean> = Symbol("read-only-view");
export const useReadOnlyView = () => inject(readOnlyViewKey, false);
