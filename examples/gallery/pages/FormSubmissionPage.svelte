<script lang="ts">
  import SignupForm from "#examples/form/SignupForm.svelte";
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { StackPanel } from "winui-svelte/components";
</script>

<PageFrame
  caption="Controls join a Form by name with an attachment. Required, minLength, type and min work as in HTML; a zod schema types the submitted data; the first wrong field takes focus; Enter submits."
  title="Form submission"
>
  <StackPanel {@attach keyControl("form-submission")}>
    <SignupForm />
  </StackPanel>
</PageFrame>
