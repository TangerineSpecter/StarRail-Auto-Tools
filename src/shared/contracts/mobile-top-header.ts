import { computed, inject, type InjectionKey, type Ref } from "vue";

export interface MobileTopHeaderContext {
  host: Ref<HTMLElement | null>;
  isUnfoldedPortrait: Ref<boolean>;
  activePage: Ref<string>;
}

export const mobileTopHeaderKey: InjectionKey<MobileTopHeaderContext> = Symbol("mobile-top-header");

/** Resolve the fixed top header portal when unfolded portrait displays this active page. */
export function useMobileTopHeaderTarget(
  pageId: string,
  active: Ref<boolean>,
): {
  host: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
} {
  const context = inject(mobileTopHeaderKey, null);
  const host = computed(() => context?.host.value ?? null);
  const enabled = computed(() =>
    Boolean(
      context &&
      context.isUnfoldedPortrait.value &&
      context.host.value &&
      active.value &&
      context.activePage.value === pageId,
    ),
  );
  return { host, enabled };
}
