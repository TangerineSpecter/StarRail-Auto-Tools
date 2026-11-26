import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";
import vue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import vueParser from "vue-eslint-parser";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/target/**", "public/**", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["src/**/*.vue"],
    languageOptions: {
      globals: globals.browser,
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: [".vue"] },
    },
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
  {
    files: ["src/**/*.{ts,vue}"],
    languageOptions: { globals: globals.browser },
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "mobile", pattern: "src/mobile/**" },
        { type: "pages", pattern: "src/pages/**" },
        { type: "feature", pattern: "src/features/(*)/**", capture: ["featureName"] },
        { type: "shared", pattern: "src/shared/**" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: {
                to: { element: { types: { anyOf: ["app", "pages", "feature", "shared"] } } },
              },
            },
            {
              from: { element: { type: "mobile" } },
              allow: {
                to: {
                  element: { types: { anyOf: ["mobile", "app", "pages", "feature", "shared"] } },
                },
              },
            },
            {
              from: { element: { type: "pages" } },
              allow: { to: { element: { types: { anyOf: ["pages", "feature", "shared"] } } } },
            },
            {
              from: { element: { type: "feature" } },
              allow: [
                { to: { element: { type: "shared" } } },
                {
                  to: {
                    element: {
                      type: "feature",
                      captured: { featureName: "{{ from.captured.featureName }}" },
                    },
                  },
                },
              ],
            },
            {
              from: { element: { type: "shared" } },
              allow: { to: { element: { type: "shared" } } },
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/{pages,features,mobile}/**/*.{ts,vue}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tauri-apps/*"],
              message: "请通过 @/shared/api/<domain> 调用 Tauri API，不要直接导入 @tauri-apps/*。",
            },
          ],
        },
      ],
    },
  },
  prettier,
];
