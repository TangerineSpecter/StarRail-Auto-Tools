import type { InjectionKey, Ref } from "vue";

export const catalogueCapsuleHostKey: InjectionKey<Ref<HTMLElement | null>> =
  Symbol("catalogueCapsuleHost");
