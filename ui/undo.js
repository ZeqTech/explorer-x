// Undo / redo history. Each entry is { label, undo: async fn, redo: async fn }.

export class UndoStack {
  constructor(limit = 100) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }

  /** Records an operation that has just been done. Anything that could be redone is dropped. */
  push(entry) {
    this.past.push(entry);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get undoLabel() { return this.past.length ? this.past[this.past.length - 1].label : ''; }
  get redoLabel() { return this.future.length ? this.future[this.future.length - 1].label : ''; }

  /**
   * Undoes the latest operation and returns its label, or null when there is nothing to undo.
   * If undoing fails the entry is discarded (it can no longer be trusted) and the error is rethrown.
   */
  async undo() {
    const entry = this.past.pop();
    if (!entry) return null;
    await entry.undo();
    this.future.push(entry);
    return entry.label;
  }

  async redo() {
    const entry = this.future.pop();
    if (!entry) return null;
    await entry.redo();
    this.past.push(entry);
    return entry.label;
  }
}
