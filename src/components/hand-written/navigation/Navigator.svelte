<script lang="ts">
  import { attachNavigator } from "./navigator-host.svelte.ts";
  import type { NavigatorComponentProps } from "./navigator-props.ts";
  import type { ContentControl as ContentControlNative } from "#src/components/generated/bindings.js";
  import ContentControl from "#src/components/generated/ContentControl.svelte";
  import NavigationThemeTransition from "#src/components/generated/NavigationThemeTransition.svelte";
  import { control } from "#src/components/runtime.js";
  import { untrack } from "svelte";

  // Pages (Svelte components) shown in a content control, with a back and
  // forward history. Put it where the page goes; navigate through `handle`.
  let {
    handle = $bindable(),
    transition,
    onReady,
    cacheSize,
    onNavigated,
    ...rest
  }: NavigatorComponentProps = $props();

  function open(slot: ContentControlNative) {
    const attached = attachNavigator({
      slot,
      props: {
        get cacheSize() {
          return cacheSize;
        },
        get onNavigated() {
          return onNavigated;
        }
      }
    });
    handle = attached.handle;
    onReady?.(attached.handle);
    return attached.dispose;
  }
</script>

<ContentControl
  {@attach control((slot: ContentControlNative) => untrack(() => open(slot)))}
  horizontalContentAlignment="Stretch"
  verticalContentAlignment="Stretch"
  {...rest}
>
  {#snippet contentTransitions()}
    <NavigationThemeTransition>
      {@render transition?.()}
    </NavigationThemeTransition>
  {/snippet}
</ContentControl>
