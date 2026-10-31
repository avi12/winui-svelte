<script lang="ts">
  // Children placed by attached properties, for the mount test
  // (mount-all.svelte.ts): a Canvas child and a Grid child, each handed to the
  // test by name.
  import { Border, Canvas, Grid } from "#src/components/index.js";
  import { control } from "#src/index.js";

  interface Props {
    onFound: (found: {
      name: string;
      native: object;
    }) => void;
  }

  const props: Props = $props();

  function found(name: string) {
    return control((native: object) => props.onFound({
      name,
      native
    }));
  }
</script>

<Grid columns="40, 40" rows="40, 40">
  <Canvas gridColumn={0} gridRow={0}>
    <Border {@attach found("canvasChild")} canvasLeft={7} canvasTop={9} height={10} width={10} />
  </Canvas>
  <Border {@attach found("gridChild")} gridColumn={1} gridRow={1} height={10} width={10} />
</Grid>
