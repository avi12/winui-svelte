import { svelte } from "eslint-config-avi12/svelte";

export default [
  ...svelte({
    ignores: [
      ".winapp/",
      "src/components/generated/",
      "src/components/fluent-glyph.ts",
      "ide/webstorm/",
      "ide/vscode/dist/"
    ]
  }),
  {
    files: ["src/**/*.svelte.ts", "test/**/*.svelte.ts"],
    rules: {
      "svelte/prefer-svelte-reactivity": "off"
    }
  }
];
