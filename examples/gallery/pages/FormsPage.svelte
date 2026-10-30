<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    AutoSuggestBox,
    CalendarDatePicker,
    CheckBox,
    ComboBox,
    ComboBoxItem,
    DatePicker,
    NumberBox,
    PasswordBox,
    RadioButtons,
    RatingControl,
    Slider,
    StackPanel,
    TextBlock,
    TextBox,
    TimePicker,
    ToggleSwitch
  } from "winui-svelte/components";
  import { NumberBoxSpinButtonPlacementMode } from "winui-svelte/enums";
  import { z } from "zod";

  const MINIMUM_NAME = 2;
  const MINIMUM_PASSWORD = 8;
  const MINIMUM_AGE = 18;
  const MAXIMUM_AGE = 120;
  const DEFAULT_AGE = 30;
  const DEFAULT_VOLUME = 40;
  const DEFAULT_RATING = 3;
  const PLANS = ["Free", "Pro", "Team"];
  const CITIES = ["Haifa", "Tel Aviv", "Jerusalem"];

  const formSchema = z.object({
    name: z.string().min(MINIMUM_NAME, "A name has at least 2 letters"),
    password: z.string().min(MINIMUM_PASSWORD, "A password has at least 8 characters"),
    age: z.number().min(MINIMUM_AGE, "Adults only").max(MAXIMUM_AGE, "Too old to be true"),
    accepted: z.literal(true, "Accept the terms")
  });

  let name = $state("");
  let password = $state("");
  let age = $state(DEFAULT_AGE);
  let isAccepted = $state(false);
  let isOn = $state(true);
  let volume = $state(DEFAULT_VOLUME);
  let plan = $state(0);
  let city = $state(0);
  let rating = $state(DEFAULT_RATING);
  let search = $state("");
  let birthday = $state<Date | undefined>();
  let appointment = $state<Date | undefined>();
  let wake = $state<number | undefined>();

  const result = $derived(
    formSchema.safeParse({
      name,
      password,
      age,
      accepted: isAccepted
    })
  );
  function summary() {
    if (result.success) {
      return "The form is valid";
    }

    return result.error.issues.map(issue => issue.message).join(" / ");
  }
</script>

<PageFrame
  caption="Every control binds with bind:. The form is checked by a zod schema; the problems are derived, so they follow each keystroke."
  title="Forms and binding"
>
  <StackPanel class="form-block">
    <TextBox {@attach keyControl("forms")} header="Name" bind:text={name} />
    <PasswordBox header="Password" bind:password />
    <NumberBox
      header="Age"
      minimum={0}
      spinButtonPlacementMode={NumberBoxSpinButtonPlacementMode.Inline}
      bind:value={age}
    />
    <CheckBox bind:isChecked={isAccepted}>I accept the terms</CheckBox>
    <TextBlock>{summary()}</TextBlock>
  </StackPanel>
  <StackPanel class="form-block">
    <ToggleSwitch header="Notifications" bind:isOn />
    <Slider header="Volume: {volume}" bind:value={volume} />
    <RadioButtons header="Plan" bind:selectedIndex={plan}>
      {#snippet items()}
        {#each PLANS as label (label)}
          <TextBlock>{label}</TextBlock>
        {/each}
      {/snippet}
    </RadioButtons>
    <ComboBox header="City" bind:selectedIndex={city}>
      {#each CITIES as label (label)}
        <ComboBoxItem content={label} />
      {/each}
    </ComboBox>
    <RatingControl bind:value={rating} />
    <AutoSuggestBox header="Search" bind:text={search} />
  </StackPanel>
  <StackPanel class="form-block">
    <DatePicker header="Birthday" bind:date={birthday} />
    <CalendarDatePicker header="Appointment" bind:date={appointment} />
    <TimePicker header="Wake up" bind:time={wake} />
    <TextBlock>{PLANS[plan]}, {CITIES[city]}, {rating} stars, {volume}% volume, search '{search}'</TextBlock>
  </StackPanel>
</PageFrame>

<style>
  .form-block {
    gap: 8px;
    max-width: 420px;
  }
</style>
