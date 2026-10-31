export const VIEW_NAME = "counter";

export interface CounterView {
  count: number;
}

export interface ViewReport {
  kind: "view";
  count: number | null;
  isLabelled: boolean;
}
