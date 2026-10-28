<script lang="ts">
  // <property> elements, for host.test.ts: a button's flyout with content of
  // its own, one that comes and goes with a flag, a menu item's text and a
  // panel's children, each filling its parent's property.
  interface Props {
    isShown: boolean;
    label: string;
  }

  const props: Props = $props();
</script>

<fake-panel>
  <fake-button>
    <property name="flyout">
      <fake-flyout>
        <property name="content">
          <fake-text-block>Menu</fake-text-block>
        </property>
      </fake-flyout>
    </property>
  </fake-button>
  <fake-button>
    {#if props.isShown}
      <property name="flyout">
        <fake-flyout></fake-flyout>
      </property>
    {/if}
  </fake-button>
  <fake-menu-item>
    <property name="text">{props.label}</property>
  </fake-menu-item>
  <fake-panel>
    <property name="children">
      <fake-text-block>First</fake-text-block>
      {#if props.isShown}
        <fake-text-block>Second</fake-text-block>
      {/if}
    </property>
  </fake-panel>
</fake-panel>
