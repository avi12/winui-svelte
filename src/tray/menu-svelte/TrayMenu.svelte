<script lang="ts">
  import type { TrayMenuProps } from "./menu-props.ts";
  import { useMenuSource } from "./menu-source.ts";

  // The root of a menu written as markup, inside a TrayIcon. It draws nothing:
  // the tray reads the lines below it each time the menu opens.
  const { profile, children }: TrayMenuProps = $props();
  const source = useMenuSource();

  function register(node: object) {
    return source?.attach({
      node,
      profile: () => profile
    });
  }
</script>

<inert-menu {@attach register}>
  {@render children?.()}
</inert-menu>
