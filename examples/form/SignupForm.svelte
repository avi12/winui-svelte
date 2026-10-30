<script lang="ts">
  import {
    Button,
    CheckBox,
    ComboBox,
    ComboBoxItem,
    NumberBox,
    TextBlock,
    TextBox,
    ToggleSwitch
  } from "winui-svelte/components";
  import {
    checkField,
    Form,
    formButton,
    FormField,
    numberField,
    selectField,
    switchField,
    textField
  } from "winui-svelte/forms";
  import type { FormHandle } from "winui-svelte/forms";
  import { startTimer } from "winui-svelte/window";
  import { z } from "zod";

  // A sign-up form: every control joins the Form by name, zod types what
  // submit hands over, and the same constraints HTML has (required, minLength,
  // type, min) say which field is wrong and why.
  const MINIMUM_NAME = 2;
  const MINIMUM_AGE = 18;
  const MAXIMUM_AGE = 120;
  const DEFAULT_AGE = 30;
  const SAVE_MILLISECONDS = 300;
  const PLANS = ["Free", "Pro", "Team"];
  const NAME_FIELD = {
    name: "name",
    required: true,
    minLength: MINIMUM_NAME,
    label: "Name"
  };
  const EMAIL_FIELD = {
    name: "email",
    required: true,
    type: "email",
    label: "E-mail"
  } as const;
  const AGE_FIELD = {
    name: "age",
    required: true,
    min: MINIMUM_AGE,
    max: MAXIMUM_AGE,
    label: "Age"
  };
  const PLAN_FIELD = {
    name: "plan",
    required: true,
    values: PLANS,
    label: "Plan"
  };
  const NEWSLETTER_FIELD = {
    name: "newsletter",
    label: "Newsletter"
  };
  const RESET_BUTTON = { kind: "reset" } as const;
  const TERMS_FIELD = {
    name: "accepted",
    required: true,
    label: "Terms"
  };

  const signupSchema = z.object({
    name: z.string().min(MINIMUM_NAME, "A name has at least 2 letters"),
    email: z.email("That is not an e-mail address"),
    age: z.number().min(MINIMUM_AGE, "Adults only").max(MAXIMUM_AGE, "Too old to be true"),
    plan: z.enum(PLANS),
    newsletter: z.boolean(),
    accepted: z.literal(true, "Accept the terms")
  });

  interface Props {
    onsubmitted?: ((data: z.output<typeof signupSchema>) => void) | undefined;
  }

  const props: Props = $props();
  let handle = $state<FormHandle | undefined>();
  let result = $state("Nothing submitted yet");

  function statusText() {
    const isSaving = handle?.isPending === true;
    if (isSaving) {
      return "Saving...";
    }

    return result;
  }

  function save() {
    return new Promise<void>(resolve => {
      startTimer({
        milliseconds: SAVE_MILLISECONDS,
        isRepeating: false,
        onTick: resolve
      });
    });
  }
</script>

<Form
  class="signup-form"
  action={save}
  oninvalid={fields => {
    result = `Fix: ${fields.map(field => field.name).join(", ")}`;
  }}
  onreset={() => {
    result = "Reset";
  }}
  onsubmit={({ data }) => {
    result = `Submitted ${JSON.stringify(data)}`;
    props.onsubmitted?.(data);
  }}
  schema={signupSchema}
  bind:handle
>
  <FormField description="At least two letters" field="name" isRequired label="Name">
    <TextBox {@attach textField(NAME_FIELD)} automationId="name" />
  </FormField>
  <FormField field="email" isRequired label="E-mail">
    <TextBox {@attach textField(EMAIL_FIELD)} automationId="email" />
  </FormField>
  <FormField field="age" label="Age">
    <NumberBox
      {@attach numberField(AGE_FIELD)}
      automationId="age"
      value={DEFAULT_AGE}
    />
  </FormField>
  <FormField field="plan" isRequired label="Plan">
    <ComboBox {@attach selectField(PLAN_FIELD)} automationId="plan">
      {#each PLANS as plan (plan)}
        <ComboBoxItem content={plan} />
      {/each}
    </ComboBox>
  </FormField>
  <ToggleSwitch {@attach switchField(NEWSLETTER_FIELD)} automationId="newsletter" header="Newsletter" />
  <FormField field="accepted">
    <CheckBox {@attach checkField(TERMS_FIELD)} automationId="accepted">
      I accept the terms
    </CheckBox>
  </FormField>
  <stack-panel class="actions">
    <Button {@attach formButton()} automationId="submit">Sign up</Button>
    <Button {@attach formButton(RESET_BUTTON)} automationId="reset">Reset</Button>
  </stack-panel>
  <TextBlock automationId="result">{statusText()}</TextBlock>
</Form>

<style>
  /* Form is a component: svelte-check cannot see a scoped class on an instance */
  :global(.signup-form) {
    gap: 12px;
    max-width: 420px;
  }

  .actions {
    display: flex;
    flex-direction: row;
    gap: 12px;
  }
</style>
