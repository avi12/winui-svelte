// The app's own types, shared by its host (launch.ts) and its window: what a
// Rust or other native host would generate, written by hand for this example.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- only a type alias is assignable to Json, whose objects have an index signature
export type CounterView = {
  count: number;
  history: number[];
};

export type CounterAction = { kind: "increment" } | { kind: "fail" };

export const VIEW_NAME = "view";
