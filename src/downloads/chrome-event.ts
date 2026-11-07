/** Chrome's `chrome.events.Event`: listeners are added and removed, never replaced. */
export class ChromeEvent<Listener extends (...parameters: never[]) => void> {
  protected readonly listeners = new Set<Listener>();

  /** Calls `listener` every time the event fires. */
  addListener(listener: Listener) {
    this.listeners.add(listener);
  }

  /** Stops calling `listener`. */
  removeListener(listener: Listener) {
    this.listeners.delete(listener);
  }

  /** Whether `listener` is registered. */
  hasListener(listener: Listener) {
    return this.listeners.has(listener);
  }

  /** Whether any listener is registered. */
  hasListeners() {
    return this.listeners.size > 0;
  }

  /**
   * Calls every listener; one that throws is reported on its own turn and does
   * not stop the others, as `reportError` does in a page.
   *
   * @param parameters - What the listeners are called with.
   */
  dispatch(...parameters: Parameters<Listener>) {
    for (const listener of this.listeners.values().toArray()) {
      try {
        listener(...parameters);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}
