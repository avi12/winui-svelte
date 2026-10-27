// fallow-ignore-file unused-class-member
// Stand-ins for WinUI's controls, for the tests: plain objects with the
// members the renderer reads (a panel's children, a toggle's isOn and its
// Toggled event), registered under the names a tag spells. They run the real
// renderer (host.ts) without WinUI; the renderer reaches their members by
// name, which no static check follows.

class FakeCollection {
  readonly items: object[] = [];

  get size() {
    return this.items.length;
  }

  indexOf(item: object) {
    return this.items.indexOf(item);
  }

  // WinUI's own InsertAt(index, item), which the renderer calls by name.
  // eslint-disable-next-line no-restricted-syntax -- mirrors WinUI's signature
  insertAt(index: number, item: object) {
    this.items.splice(index, 0, item);
  }

  removeAt(index: number) {
    this.items.splice(index, 1);
  }

  append(item: object) {
    this.items.push(item);
  }

  clear() {
    this.items.length = 0;
  }
}

export class FakePanel {
  readonly margin = null;
  readonly children = new FakeCollection();
  // What the host last handed the class handler.
  className = "";
}

export class FakeToggle {
  readonly margin = null;
  isOn = false;
  onContent = "";
  // AutomationProperties.LabeledBy, as the label test sets it.
  labeledBy: object | null = null;
  subscriptions = 0;

  onToggled(_handler: (isOn: boolean) => void) {
    this.subscriptions++;
    return () => {
      this.subscriptions--;
    };
  }
}

export class FakeBorder {
  readonly margin = null;
  child: object | null = null;
}

export class FakeTextBlock {
  readonly margin = null;
  text = "";
}

// By the class names a tag spells: <fake-panel> is FakePanel.
export const fakeControls = Object.fromEntries(
  [FakePanel, FakeToggle, FakeBorder, FakeTextBlock].map(control => [control.name, control])
);
