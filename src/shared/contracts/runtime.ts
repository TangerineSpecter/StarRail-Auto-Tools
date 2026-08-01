import { inject, type InjectionKey, type Ref } from "vue";
import type { DirectReadSnapshot, InventorySummary } from "@/types";

export interface RuntimeContext {
  direct: Ref<DirectReadSnapshot>;
  summary: Ref<InventorySummary>;
  busy: Ref<boolean>;
  error: Ref<string>;
  notice: Ref<string>;
  inventoryRevision: Ref<number>;
}

export const runtimeContextKey: InjectionKey<RuntimeContext> = Symbol("runtime-context");

export function useRuntimeContext(): RuntimeContext {
  const context = inject(runtimeContextKey);
  if (!context) throw new Error("Runtime context is not available");
  return context;
}
