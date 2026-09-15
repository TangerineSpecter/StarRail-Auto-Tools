import type { CatalogueAbility } from "../contracts/catalogue-rules";

export interface CatalogueAccountVariant {
  gameId: number;
  /** Canonical path, e.g. Preservation; names and slugs are not identities. */
  path: string;
  abilityVersion: number;
}
export const accountLevelBindings = [
  "basic",
  "skill",
  "ult",
  "talent",
  "elation",
  "memosprite:basic",
  "memosprite:skill",
  "memosprite:ult",
  "memosprite:talent",
  "memosprite:elation",
] as const;
export type AccountLevelBinding = (typeof accountLevelBindings)[number];
export interface AccountLevelDelta {
  id: string;
  binding: AccountLevelBinding;
  delta: number;
  cap?: number;
  status: "reviewed" | "pending";
  sourceRef: string;
  sourceHash: string;
  unlock: { trace: string } | { eidolon: number };
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const own = (value: Record<string, unknown>, key: string) =>
  Object.hasOwn(value, key) ? value[key] : undefined;
const integer = (value: unknown, min: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min;

/** Read-only adapter for InventoryDetail.data; never synthesizes missing unlocks. */
export function adaptCatalogueAccount(
  detail: Readonly<Record<string, unknown>>,
  variant: CatalogueAccountVariant,
  abilities: readonly CatalogueAbility[] = [],
  deltas: readonly AccountLevelDelta[] = [],
) {
  const missingFields: string[] = [];
  for (const key of ["characterId", "path", "abilityVersion"])
    if (own(detail, key) === undefined) missingFields.push(key);
  const identityMatched =
    integer(detail.characterId, 1) &&
    integer(detail.abilityVersion, 0) &&
    integer(variant.gameId, 1) &&
    integer(variant.abilityVersion, 0) &&
    typeof detail.path === "string" &&
    variant.path.length > 0 &&
    detail.characterId === variant.gameId &&
    detail.path === variant.path &&
    detail.abilityVersion === variant.abilityVersion;
  const baseLevels: Partial<Record<AccountLevelBinding, number>> = {};
  const reviewedDeltas: Partial<Record<AccountLevelBinding, number>> = {};
  const effectiveLevels: Partial<Record<AccountLevelBinding, number>> = {};
  for (const binding of accountLevelBindings) {
    const [container, key] = binding.startsWith("memosprite:")
      ? ["memosprite", binding.slice("memosprite:".length)]
      : ["skills", binding];
    const value = own(record(own(detail, container)), key);
    if (!integer(value, 1)) missingFields.push(`${container}.${key}`);
    else if (identityMatched) baseLevels[binding] = value;
  }
  const traces: Record<string, boolean> = {};
  const rawTraces = own(detail, "traces");
  if (rawTraces === null || typeof rawTraces !== "object" || Array.isArray(rawTraces))
    missingFields.push("traces");
  else if (identityMatched)
    for (const [key, value] of Object.entries(rawTraces))
      if (typeof value === "boolean") traces[key] = value;
      else missingFields.push(`traces.${key}`);
  const eidolon = integer(detail.eidolon, 0) && detail.eidolon <= 6 ? detail.eidolon : null;
  if (eidolon === null) missingFields.push("eidolon");
  const rejectedDeltas: string[] = [];
  const ids = new Set<string>();
  for (const delta of deltas) {
    const sources = abilities.filter((ability) => ability.id === delta.sourceRef);
    const unlocked =
      "trace" in delta.unlock
        ? own(traces, delta.unlock.trace) === true
        : eidolon !== null &&
          integer(delta.unlock.eidolon, 0) &&
          delta.unlock.eidolon <= 6 &&
          eidolon >= delta.unlock.eidolon;
    if ("trace" in delta.unlock && !Object.hasOwn(traces, delta.unlock.trace))
      missingFields.push(`traces.${delta.unlock.trace}`);
    if (
      !identityMatched ||
      !delta.id ||
      ids.has(delta.id) ||
      deltas.filter((entry) => entry.id === delta.id).length !== 1 ||
      delta.status !== "reviewed" ||
      !integer(delta.delta, 0) ||
      (delta.cap !== undefined && !integer(delta.cap, 1)) ||
      !unlocked ||
      sources.length !== 1 ||
      !delta.sourceHash ||
      sources[0]!.sourceHash !== delta.sourceHash ||
      !["character", "trace", "eidolon", "summon"].includes(sources[0]!.sourceKind) ||
      (sources[0]!.ownerId !== `character:${variant.gameId}` &&
        sources[0]!.ownerId !== `summon:${variant.gameId}:servant`) ||
      baseLevels[delta.binding] === undefined
    ) {
      rejectedDeltas.push(delta.id);
      continue;
    }
    ids.add(delta.id);
    const current = baseLevels[delta.binding]! + (reviewedDeltas[delta.binding] ?? 0);
    const addition =
      delta.cap === undefined
        ? delta.delta
        : Math.max(0, Math.min(delta.delta, delta.cap - current));
    reviewedDeltas[delta.binding] = (reviewedDeltas[delta.binding] ?? 0) + addition;
  }
  for (const binding of accountLevelBindings) {
    const base = baseLevels[binding];
    if (base !== undefined) effectiveLevels[binding] = base + (reviewedDeltas[binding] ?? 0);
  }
  return {
    identityMatched,
    baseLevels,
    reviewedDeltas,
    effectiveLevels,
    bindings: effectiveLevels,
    traces,
    eidolon: identityMatched ? eidolon : null,
    missingFields: [...new Set(missingFields)],
    rejectedDeltas,
  };
}
