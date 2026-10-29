// fallow-ignore-file unused-class-member
// Stand-ins for WinUI's controls, for the tests: plain objects with the
// members the renderer reads (a panel's children, a toggle's isOn and its
// Toggled event), registered under the names a tag spells. They run the real
// renderer (host.ts) without WinUI; the renderer reaches their members by
// name, which no static check follows.

class FakeCollection {
  readonly items: object[] = [];

  private readonly owner: FakeMotionPanel | null;

  constructor(owner: FakeMotionPanel | null = null) {
    this.owner = owner;
  }

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
    this.adopt(item);
  }

  removeAt(index: number) {
    this.items.splice(index, 1);
  }

  append(item: object) {
    this.items.push(item);
    this.adopt(item);
  }

  private adopt(item: object) {
    const isPanel = item instanceof FakeMotionPanel;
    if (isPanel) {
      item.parent = this.owner;
    }
  }

  clear() {
    this.items.length = 0;
  }

  // What the user does to a tab strip or a tree: the control reorders its own
  // collection, and the renderer is not told.
  moveNatively({ from, to }: {
    from: number;
    to: number;
  }) {
    const [item] = this.items.splice(from, 1);
    const isMoved = item !== undefined;
    if (isMoved) {
      this.items.splice(to, 0, item);
    }
  }
}

export class FakePanel {
  readonly margin = null;
  readonly children = new FakeCollection();
  // What the host last handed the class handler.
  className = "";
}

const FAKE_ROW_HEIGHT = 20;
const FAKE_ROW_WIDTH = 100;

// A panel WinUI would move and lay out: the members the transitions touch
// (Opacity, Translation, Scale, Rotation, CenterPoint), a size, and a position
// that follows its place among its parent's children, one row high each.
export class FakeMotionPanel {
  readonly margin = null;
  readonly children = new FakeCollection(this);
  readonly actualSize = {
    x: FAKE_ROW_WIDTH,
    y: FAKE_ROW_HEIGHT
  };

  parent: FakeMotionPanel | null = null;
  translation = {
    x: 0,
    y: 0,
    z: 0
  };

  scale = {
    x: 1,
    y: 1,
    z: 1
  };

  centerPoint = {
    x: 0,
    y: 0,
    z: 0
  };

  rotation = 0;
  isHitTestVisible = true;
  // Every value Opacity was set to, in order.
  readonly opacities: number[] = [1];

  get opacity() {
    return this.opacities.at(-1) ?? 1;
  }

  set opacity(value: number) {
    this.opacities.push(value);
  }

  get top() {
    return (this.parent?.children.indexOf(this) ?? 0) * FAKE_ROW_HEIGHT;
  }

  updateLayout() {
    return undefined;
  }

  transformToVisual(_visual: null) {
    return {
      transformPoint: (point: {
        x: number;
        y: number;
      }) => ({
        x: point.x,
        y: this.top + point.y
      })
    };
  }
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

// An element WinUI would lay out and theme: ActualWidth, ActualHeight and
// ActualTheme, their changed events, and Focus. The test raises the events.
export class FakeElement {
  readonly margin = null;
  actualWidth = 0;
  actualHeight = 0;
  actualTheme = 1;
  // The FocusState each Focus call was given, in order.
  readonly focusCalls: number[] = [];
  isFocusable = true;
  private readonly sizeListeners = new Set<() => void>();
  private readonly themeListeners = new Set<() => void>();

  get listenerCount() {
    return this.sizeListeners.size + this.themeListeners.size;
  }

  onSizeChanged(listener: () => void) {
    this.sizeListeners.add(listener);
    return () => {
      this.sizeListeners.delete(listener);
    };
  }

  onActualThemeChanged(listener: () => void) {
    this.themeListeners.add(listener);
    return () => {
      this.themeListeners.delete(listener);
    };
  }

  resize({ width, height }: {
    width: number;
    height: number;
  }) {
    this.actualWidth = width;
    this.actualHeight = height;
    for (const listener of this.sizeListeners) {
      listener();
    }
  }

  retheme(theme: number) {
    this.actualTheme = theme;
    for (const listener of this.themeListeners) {
      listener();
    }
  }

  focus(state: number) {
    this.focusCalls.push(state);
    return this.isFocusable;
  }
}

export class FakeBorder {
  readonly margin = null;
  child: object | null = null;
}

export class FakeButton {
  readonly margin = null;
  // Set by the app, not by the button's <property> children.
  content: object | string | null = "initial";
  flyout: object | null = null;
}

export class FakeFlyout {
  content: object | null = null;

  showAt() {
    return undefined;
  }
}

export class FakeMenuItem {
  readonly margin = null;
  text = "";
}

export class FakeTextBlock {
  readonly margin = null;
  text = "";
}

// By the class names a tag spells: <fake-panel> is FakePanel.
export const fakeControls = Object.fromEntries(
  [
    FakePanel,
    FakeMotionPanel,
    FakeToggle,
    FakeElement,
    FakeBorder,
    FakeTextBlock,
    FakeButton,
    FakeFlyout,
    FakeMenuItem
  ].map(control => [control.name, control])
);
