import { InputType, ValidityFlag, validityOf } from "./validity.ts";
import type { Constraints, FieldValue } from "./validity.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// HTML constraint validation on plain values.

function flagsOf({ value, constraints }: {
  value: FieldValue;
  constraints: Constraints;
}) {
  const { validity } = validityOf({
    value,
    constraints
  });
  return Object.values(ValidityFlag).filter(flag => validity[flag]);
}

test("required fails for no value, an empty string, NaN and an unchecked box", () => {
  for (const value of [null, "", Number.NaN, false]) {
    assert.deepEqual(
      flagsOf({
        value,
        constraints: {
          required: true
        }
      }), [ValidityFlag.VALUE_MISSING], String(value)
    );
  }
  assert.deepEqual(
    flagsOf({
      value: 0,
      constraints: {
        required: true
      }
    }), []
  );
  assert.deepEqual(
    flagsOf({
      value: true,
      constraints: {
        required: true
      }
    }), []
  );
});

test("an empty value fails only required", () => {
  assert.deepEqual(
    flagsOf({
      value: "",
      constraints: {
        minLength: 3,
        type: InputType.EMAIL,
        pattern: "a+"
      }
    }), []
  );
});

test("minLength and maxLength give tooShort and tooLong", () => {
  const constraints = {
    minLength: 3,
    maxLength: 5
  };
  assert.deepEqual(
    flagsOf({
      value: "ab",
      constraints
    }), [ValidityFlag.TOO_SHORT]
  );
  assert.deepEqual(
    flagsOf({
      value: "abcdef",
      constraints
    }), [ValidityFlag.TOO_LONG]
  );
  assert.deepEqual(
    flagsOf({
      value: "abcd",
      constraints
    }), []
  );
});

test("type email and url give typeMismatch", () => {
  assert.deepEqual(
    flagsOf({
      value: "nope",
      constraints: {
        type: InputType.EMAIL
      }
    }), [ValidityFlag.TYPE_MISMATCH]
  );
  assert.deepEqual(
    flagsOf({
      value: "a@b.co",
      constraints: {
        type: InputType.EMAIL
      }
    }), []
  );
  assert.deepEqual(
    flagsOf({
      value: "example.com",
      constraints: {
        type: InputType.URL
      }
    }), [ValidityFlag.TYPE_MISMATCH]
  );
  assert.deepEqual(
    flagsOf({
      value: "https://example.com",
      constraints: {
        type: InputType.URL
      }
    }), []
  );
});

test("a string pattern is anchored; a RegExp is used as written", () => {
  assert.deepEqual(
    flagsOf({
      value: "abc1",
      constraints: {
        pattern: "[a-z]+"
      }
    }), [ValidityFlag.PATTERN_MISMATCH]
  );
  assert.deepEqual(
    flagsOf({
      value: "abc",
      constraints: {
        pattern: "[a-z]+"
      }
    }), []
  );
  assert.deepEqual(
    flagsOf({
      value: "abc1",
      constraints: {
        pattern: /[a-z]+/u
      }
    }), []
  );
});

test("min, max and step give rangeUnderflow, rangeOverflow and stepMismatch", () => {
  const constraints = {
    min: 2,
    max: 10,
    step: 2
  };
  assert.deepEqual(
    flagsOf({
      value: 0,
      constraints
    }), [ValidityFlag.RANGE_UNDERFLOW]
  );
  assert.deepEqual(
    flagsOf({
      value: 12,
      constraints
    }), [ValidityFlag.RANGE_OVERFLOW]
  );
  assert.deepEqual(
    flagsOf({
      value: 5,
      constraints
    }), [ValidityFlag.STEP_MISMATCH]
  );
  assert.deepEqual(
    flagsOf({
      value: 6,
      constraints
    }), []
  );
  assert.deepEqual(
    flagsOf({
      value: 0.3,
      constraints: {
        step: 0.1
      }
    }), []
  );
});

test("dates are compared by time", () => {
  const constraints = {
    min: new Date("2026-01-01"),
    max: new Date("2026-12-31")
  };
  assert.deepEqual(
    flagsOf({
      value: new Date("2025-06-01"),
      constraints
    }), [ValidityFlag.RANGE_UNDERFLOW]
  );
  assert.deepEqual(
    flagsOf({
      value: new Date("2027-06-01"),
      constraints
    }), [ValidityFlag.RANGE_OVERFLOW]
  );
});

test("number-typed text that is not a number is badInput; a number is range-checked", () => {
  assert.deepEqual(
    flagsOf({
      value: "abc",
      constraints: {
        type: InputType.NUMBER
      }
    }), [ValidityFlag.BAD_INPUT]
  );
  assert.deepEqual(
    flagsOf({
      value: "50",
      constraints: {
        type: InputType.NUMBER,
        max: 10
      }
    }), [ValidityFlag.RANGE_OVERFLOW]
  );
});

test("a custom message makes the field invalid and is the message told first", () => {
  const result = validityOf({
    value: "",
    constraints: {
      required: true
    },
    customMessage: "Taken"
  });
  assert.equal(result.validity.customError, true);
  assert.equal(result.validity.valid, false);
  assert.equal(result.message, "Taken");
});

test("the message is the first failure's: the default, a function of the constraints, or the field's own", () => {
  assert.equal(
    validityOf({
      value: "ab",
      constraints: {
        minLength: 3
      }
    }).message, "Enter at least 3 characters"
  );
  assert.equal(
    validityOf({
      value: "ab",
      constraints: {
        minLength: 3
      },
      messages: {
        tooShort: "Too short"
      }
    }).message, "Too short"
  );
  assert.equal(
    validityOf({
      value: "ab",
      constraints: {}
    }).message, ""
  );
});
