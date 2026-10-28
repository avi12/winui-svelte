// A .svelte component, as TypeScript sees it from a .ts file.
declare module "*.svelte" {
  import type { Component } from "svelte";

  const component: Component<Record<string, never>>;
  // eslint-disable-next-line no-restricted-exports -- a .svelte module's default export is Svelte's own
  export default component;
}
