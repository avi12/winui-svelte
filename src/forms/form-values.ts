import type { FieldValue } from "./validity.ts";

/** A form's values by field name: one value for a name that appears once, an array for one that repeats. */
export type FormObject = Record<string, FieldValue | FieldValue[]>;

/**
 * The entries a form collects: the web's `FormData`, widened to hold what WinUI's
 * controls hold (numbers, booleans, dates) instead of only strings and files.
 * A name may repeat (a group of check boxes), in the order the fields were
 * registered. It iterates as `[name, value]` pairs, so
 * `Object.fromEntries(values)` and `new Map(values)` work.
 */
export class FormValues {
  private readonly entriesList: Array<[string, FieldValue]> = [];

  constructor(entries: Iterable<readonly [string, FieldValue]> = []) {
    for (const [name, value] of entries) {
      this.append({
        name,
        value
      });
    }
  }

  /** Adds an entry after the ones already there, even when the name is taken. */
  append({ name, value }: {
    name: string;
    value: FieldValue;
  }) {
    this.entriesList.push([name, value]);
  }

  /** Makes the value the name's only entry, kept where the first one was. */
  set({ name, value }: {
    name: string;
    value: FieldValue;
  }) {
    const iFirst = this.entriesList.findIndex(([entryName]) => entryName === name);
    const isNew = iFirst === -1;
    if (isNew) {
      this.append({
        name,
        value
      });
      return;
    }

    this.entriesList[iFirst] = [name, value];
    this.removeNamed({
      name,
      from: iFirst + 1
    });
  }

  /** The first value of a name, or null when there is none. */
  get(name: string) {
    return this.entriesList.find(([entryName]) => entryName === name)?.[1] ?? null;
  }

  /** Every value of a name, in order. */
  getAll(name: string) {
    return this.entriesList.filter(([entryName]) => entryName === name).map(([, value]) => value);
  }

  /** Whether the name has an entry. */
  has(name: string) {
    return this.entriesList.some(([entryName]) => entryName === name);
  }

  /** Removes every entry of a name. */
  delete(name: string) {
    this.removeNamed({
      name,
      from: 0
    });
  }

  private removeNamed({ name, from }: {
    name: string;
    from: number;
  }) {
    for (let i = this.entriesList.length - 1; i >= from; i--) {
      const isNamed = this.entriesList[i]?.[0] === name;
      if (isNamed) {
        this.entriesList.splice(i, 1);
      }
    }
  }

  /** The number of entries. */
  get size() {
    return this.entriesList.length;
  }

  *entries() {
    yield* this.entriesList;
  }

  *keys() {
    for (const [name] of this.entriesList) {
      yield name;
    }
  }

  *values() {
    for (const [, value] of this.entriesList) {
      yield value;
    }
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  /** The entries as an object: a name that repeats holds an array of its values. */
  toObject() {
    const object: FormObject = {};
    for (const name of new Set(this.keys())) {
      const all = this.getAll(name);
      object[name] = all.length === 1 ? (all[0] ?? null) : all;
    }
    return object;
  }

  /** A web `FormData` of the entries, each value as text (a date as ISO 8601, null as empty), for `fetch`. */
  toFormData() {
    const formData = new FormData();
    for (const [name, value] of this.entriesList) {
      formData.append(name, textOf(value));
    }
    return formData;
  }
}

function textOf(value: FieldValue) {
  const isEmpty = value === null;
  if (isEmpty) {
    return "";
  }

  return value instanceof Date ? value.toISOString() : String(value);
}
