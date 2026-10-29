<script lang="ts">
  // Collections the renderer makes, for host.test.ts: a panel's transitions
  // (null until it has some) with one that comes and goes with a flag, the
  // whole <property> element that comes and goes with another, and a panel
  // whose <property> element has nothing in it. The class is a prop so a test
  // can name one that was not registered.
  interface Props {
    isShown: boolean;
    hasProperty: boolean;
    collection: string;
  }

  const props: Props = $props();
</script>

<fake-panel>
  <fake-panel>
    {#if props.hasProperty}
      <property name="childrenTransitions" collection={props.collection}>
        <fake-transition></fake-transition>
        {#if props.isShown}
          <fake-transition></fake-transition>
        {/if}
      </property>
    {/if}
  </fake-panel>
  <fake-panel>
    <property name="childrenTransitions" collection={props.collection}></property>
  </fake-panel>
</fake-panel>
