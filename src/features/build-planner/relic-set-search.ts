import type { RelicSetOption } from "@/types";

export function filterRelicSetOptions(options: RelicSetOption[], query: string): RelicSetOption[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return options;

  return options.filter((option) => {
    const name = option.name.toLocaleLowerCase();
    return terms.every((term) => name.includes(term));
  });
}
