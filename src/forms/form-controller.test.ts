import type {
  ButtonKind as ButtonKindOf,
  FieldBinding,
  FormOptions,
  FormSubmission
} from "./form-controller.svelte.ts";
import type { Constraints, FieldValue } from "./validity.ts";
import "#src/state/test-support/svelte-runes.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

// The form's rules on stand-ins for the controls: the real controller and
// reactive state, with the typing, blurring and clicking done by hand.

const { ButtonKind, FormController } = await import("./form-controller.svelte.ts");

class FakeField {
  value: FieldValue;
  isEnabled = true;
  shown = "";
  focused = 0;
  private readonly initial: FieldValue;
  private readonly listeners = new Set<() => void>();
  readonly binding: FieldBinding;

  constructor({ name, value = "", constraints = {}, checkedValue, isTextEntry = true }: {
    name: string;
    value?: FieldValue;
    constraints?: Constraints;
    checkedValue?: FieldValue;
    isTextEntry?: boolean;
  }) {
    this.value = value;
    this.initial = value;
    this.binding = {
      name,
      constraints,
      messages: {},
      checkedValue,
      isTextEntry,
      read: () => this.value,
      subscribe: listener => {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      },
      capture: () => {
        const captured = this.value;
        return () => {
          this.value = captured;
          this.fire();
        };
      },
      focus: () => {
        this.focused++;
        return true;
      },
      isEnabled: () => this.isEnabled,
      setEnabled: isEnabled => {
        this.isEnabled = isEnabled;
      },
      present: message => {
        this.shown = message;
      }
    };
  }

  type(value: FieldValue) {
    this.value = value;
    this.fire();
  }

  get initialValue() {
    return this.initial;
  }

  private fire() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function fakeButton(kind: ButtonKindOf = ButtonKind.SUBMIT) {
  const button = {
    kind,
    isEnabledNow: true,
    isEnabled: () => button.isEnabledNow,
    setEnabled(isEnabled: boolean) {
      button.isEnabledNow = isEnabled;
    }
  };
  return button;
}

function noop() {}

function startForm(overrides: Partial<FormOptions> = {}) {
  const submissions: Array<FormSubmission<unknown>> = [];
  const log: {
    invalid: string[][];
    resets: number;
    cancels: number;
    errors: unknown[];
  } = {
    invalid: [],
    resets: 0,
    cancels: 0,
    errors: []
  };
  const options: FormOptions = {
    schema: undefined,
    isNoValidate: false,
    onSubmit(submission) {
      submissions.push(submission);
    },
    action: () => undefined,
    onInvalid: fields => log.invalid.push(fields.map(field => field.name)),
    onReset: () => log.resets++,
    onCancel: () => log.cancels++,
    onError: error => log.errors.push(error),
    ...overrides
  };
  const form = new FormController(options);
  function join(field: FakeField) {
    return form.register(field.binding);
  }
  return {
    form,
    submissions,
    log,
    join
  };
}

test("fields collect into FormValues in registration order, disabled ones left out", () => {
  const { form, join } = startForm();
  join(
    new FakeField({
      name: "first",
      value: "Ada"
    })
  );
  join(
    new FakeField({
      name: "age",
      value: 36
    })
  );
  const disabled = new FakeField({
    name: "secret",
    value: "x"
  });
  disabled.isEnabled = false;
  join(disabled);
  assert.deepEqual(Object.fromEntries(form.values()), {
    first: "Ada",
    age: 36
  });
});

test("a check box with a checkedValue is collected when checked and left out when not; same names repeat", () => {
  const { form, join } = startForm();
  const red = new FakeField({
    name: "color",
    value: true,
    checkedValue: "red",
    isTextEntry: false
  });
  const blue = new FakeField({
    name: "color",
    value: false,
    checkedValue: "blue",
    isTextEntry: false
  });
  join(red);
  join(blue);
  assert.deepEqual(form.values().getAll("color"), ["red"]);
  blue.type(true);
  assert.deepEqual(form.values().getAll("color"), ["red", "blue"]);
});

test("an invalid form is not submitted: onInvalid lists the fields and the first is focused", async () => {
  const { form, join, submissions, log } = startForm();
  const email = new FakeField({
    name: "email",
    constraints: {
      required: true,
      type: "email"
    }
  });
  const name = new FakeField({
    name: "name",
    constraints: {
      required: true
    }
  });
  join(email);
  join(name);
  const isSubmitted = await form.requestSubmit();
  assert.equal(isSubmitted, false);
  assert.equal(submissions.length, 0);
  assert.deepEqual(log.invalid, [["email", "name"]]);
  assert.equal(email.focused, 1);
  assert.equal(name.focused, 0);
  assert.equal(email.shown, "Fill in this field");
  assert.equal(form.field("email")?.validity.valueMissing, true);
});

test("a valid form submits its data, and novalidate submits an invalid one", async () => {
  const { form, join, submissions } = startForm();
  const email = new FakeField({
    name: "email",
    value: "a@b.co",
    constraints: {
      required: true,
      type: "email"
    }
  });
  join(email);
  assert.equal(await form.requestSubmit(), true);
  assert.deepEqual(submissions[0]?.data, { email: "a@b.co" });
  email.type("nope");
  assert.equal(await form.requestSubmit(), false);
  const lenient = startForm({ isNoValidate: true });
  lenient.join(
    new FakeField({
      name: "email",
      value: "nope",
      constraints: {
        type: "email"
      }
    })
  );
  assert.equal(await lenient.form.requestSubmit(), true);
  await form.submit();
  assert.equal(submissions.length, 2);
});

test("the error shows after the field is left, then follows the typing (user-invalid)", () => {
  const { form, join } = startForm();
  const name = new FakeField({
    name: "name",
    constraints: {
      minLength: 3
    }
  });
  join(name);
  name.type("ab");
  const field = form.field("name");
  assert.equal(field?.isValid, false);
  assert.equal(field?.isUserInvalid, false);
  assert.equal(name.shown, "");

  const hasField = field !== undefined;
  if (!hasField) {
    assert.fail("the field joined");
  }

  field.isTouched = true;
  form.refresh();
  assert.equal(field.isUserInvalid, true);
  assert.equal(name.shown, "Enter at least 3 characters");
  name.type("abc");
  assert.equal(name.shown, "");
  assert.equal(field.isDirty, true);
});

test("setCustomValidity blocks submit until it is cleared", async () => {
  const { form, join } = startForm();
  join(
    new FakeField({
      name: "user",
      value: "ada"
    })
  );
  form.field("user")?.setCustomValidity("Taken");
  assert.equal(form.checkValidity(), false);
  assert.equal(form.field("user")?.message, "Taken");
  assert.equal(await form.requestSubmit(), false);
  form.field("user")?.setCustomValidity("");
  assert.equal(form.checkValidity(), true);
});

test("a zod schema types the data and maps issues to fields by path", async () => {
  const schema = z.object({
    email: z.email("Not an e-mail"),
    age: z.number().min(18, "Adults only")
  });
  const { form, join, submissions, log } = startForm({ schema });
  const email = new FakeField({
    name: "email",
    value: "nope"
  });
  const age = new FakeField({
    name: "age",
    value: 12
  });
  join(email);
  join(age);
  assert.equal(await form.requestSubmit(), false);
  assert.equal(form.field("email")?.message, "Not an e-mail");
  assert.equal(form.field("age")?.message, "Adults only");
  assert.deepEqual(log.invalid, [["email", "age"]]);
  assert.equal(email.shown, "Not an e-mail");
  email.type("a@b.co");
  age.type(30);
  assert.equal(await form.requestSubmit(), true);
  assert.deepEqual(submissions[0]?.data, {
    email: "a@b.co",
    age: 30
  });
});

test("the schema's output (a transform) is the submitted data", async () => {
  const schema = z.object({ count: z.number().transform(count => count * 2) });
  const { form, join, submissions } = startForm({ schema });
  join(
    new FakeField({
      name: "count",
      value: 4
    })
  );
  await form.requestSubmit();
  assert.deepEqual(submissions[0]?.data, { count: 8 });
});

test("reset puts the values back and clears touched, dirty, custom errors and submitted", async () => {
  const { form, join, log } = startForm();
  const name = new FakeField({
    name: "name",
    value: "Ada",
    constraints: {
      required: true
    }
  });
  join(name);
  name.type("");
  await form.requestSubmit();
  assert.equal(name.shown, "Fill in this field");
  form.reset();
  assert.equal(name.value, "Ada");
  assert.equal(name.shown, "");
  assert.equal(form.isSubmitted, false);
  assert.equal(form.field("name")?.isTouched, false);
  assert.equal(form.field("name")?.isDirty, false);
  assert.equal(log.resets, 1);
});

test("an async action disables the controls and buttons while it runs, and pending says so", async () => {
  let finish = noop;
  const { form, join } = startForm({
    action: () => new Promise<void>(resolve => {
      finish = resolve;
    })
  });
  const name = new FakeField({
    name: "name",
    value: "Ada"
  });
  const button = fakeButton();
  join(name);
  form.addButton(button);
  const submitting = form.requestSubmit({ submitter: button });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(form.isPending, true);
  assert.equal(name.isEnabled, false);
  assert.equal(button.isEnabledNow, false);
  assert.equal(await form.requestSubmit(), false, "a second submit while pending is refused");
  finish();
  await submitting;
  assert.equal(form.isPending, false);
  assert.equal(name.isEnabled, true);
  assert.equal(button.isEnabledNow, true);
});

test("the submitter is the button that was clicked", async () => {
  const { form, join, submissions } = startForm();
  join(new FakeField({ name: "name" }));
  const button = fakeButton();
  await form.requestSubmit({ submitter: button });
  assert.equal(submissions[0]?.event.submitter, button);
});

test("Enter submits through the first enabled submit button, or alone when one text field and no button", async () => {
  const withButton = startForm();
  withButton.join(new FakeField({ name: "a" }));
  withButton.join(new FakeField({ name: "b" }));
  withButton.form.submitImplicitly();
  await Promise.resolve();
  assert.equal(withButton.submissions.length, 0, "two fields and no button: nothing");
  const button = fakeButton();
  withButton.form.addButton(button);
  withButton.form.submitImplicitly();
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(withButton.submissions.length, 1);
  assert.equal(withButton.submissions[0]?.event.submitter, button);
  button.isEnabledNow = false;
  withButton.form.submitImplicitly();
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(withButton.submissions.length, 1, "a disabled submit button does not submit");

  const single = startForm();
  single.join(new FakeField({ name: "query" }));
  single.form.submitImplicitly();
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(single.submissions.length, 1);
});

test("Escape tells the app, and an error from onSubmit goes to onError", async () => {
  const failure = new Error("server down");
  const { form, join, log } = startForm({
    onSubmit() {
      throw failure;
    }
  });
  join(new FakeField({ name: "name" }));
  form.cancel();
  assert.equal(log.cancels, 1);
  form.trigger(null);
  await new Promise(resolve => setTimeout(resolve));
  assert.deepEqual(log.errors, [failure]);
});

test("a field that leaves the form is no longer collected, and its error is cleared", () => {
  const { form, join } = startForm();
  const name = new FakeField({
    name: "name",
    constraints: {
      required: true
    }
  });
  const joined = join(name);
  form.field("name")?.reportValidity();
  assert.equal(name.shown, "Fill in this field");
  joined.unregister();
  assert.equal(name.shown, "");
  assert.equal(form.fields.length, 0);
  assert.equal(form.isValid, true);
});
