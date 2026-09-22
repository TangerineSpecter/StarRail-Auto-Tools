import { invoke } from "@/shared/api/invoke";
import type { ModelProviderSettings } from "@/types";

export const modelProviderApi = {
  getSettings: () => invoke<ModelProviderSettings>("get_model_provider_settings"),
  saveSettings: (settings: ModelProviderSettings) =>
    invoke<ModelProviderSettings>("save_model_provider_settings", { settings }),
};
