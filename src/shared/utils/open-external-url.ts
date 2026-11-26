import { openerApi } from "@/shared/api/opener";

export function openExternalUrl(url: string): Promise<void> {
  return openerApi.openUrl(url);
}
