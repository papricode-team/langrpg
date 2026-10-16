/**
 * The admin map editor's document. Edits apply locally at once and publish in
 * the background, one batch at a time. The server still checks every batch;
 * a refused batch is taken back out and the view is rebuilt without it.
 *
 * The view is always the last published document plus the batches still on
 * their way, so a slow or refused request never leaves the screen behind.
 */
import type {WorldSceneDocument} from './scene-schema';
import {applyEditOps,inverseEditOps,type WorldEditOp} from './world-edit-ops';
import type {WorldProblem} from './world-edit-rules';
import type {EditResult} from './world-edit-session';

export interface EditTransport { send(ops: WorldEditOp[]): Promise<EditResult>; }
interface Entry { ops: WorldEditOp[]; inverse: WorldEditOp[]; label: string; }
interface Pending { entry: Entry; direction: 'do' | 'undo' | 'redo'; ops: WorldEditOp[]; retried?: boolean; }
export interface StoreFailure { label: string; message: string; problems: WorldProblem[]; }
export interface StoreListener {
  /** The view changed; the towns that changed are listed. */
  changed(maps: ReadonlySet<string>): void;
  /** A batch was refused and taken back out of the view. */
  failed(failure: StoreFailure): void;
  /** The server holds a newer world than this view: the caller reloads it and calls `rebase`. */
  stale(): void | Promise<void>;
  /** The server accepted a batch but has something to point out. */
  warned?(problems: readonly WorldProblem[]): void;
  /** Saving started or finished. */
  saving(active: boolean): void;
}

const UNDO_LIMIT = 100;
const mapsOf = (ops: readonly WorldEditOp[]) => new Set(ops.map(op => op.map));

export class MapEditStore {
  private confirmed: WorldSceneDocument;
  private confirmedVersion: string;
  private current: WorldSceneDocument;
  private readonly undoStack: Entry[] = [];
  private readonly redoStack: Entry[] = [];
  private readonly queue: Pending[] = [];
  private sending = false;
  private readonly transport: EditTransport;
  private readonly listener: StoreListener;
  lastSaved?: Date;

  constructor(document: WorldSceneDocument, version: string, transport: EditTransport, listener: StoreListener) {
    this.confirmed = this.current = document; this.confirmedVersion = version;
    this.transport = transport; this.listener = listener;
  }

  /** The document as the admin sees it, including edits still being saved. */
  get document(): WorldSceneDocument { return this.current; }
  /** The published version the view is built on. */
  get version(): string { return this.confirmedVersion; }
  get busy(): boolean { return this.queue.length > 0; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string | undefined { return this.undoStack.at(-1)?.label; }
  get redoLabel(): string | undefined { return this.redoStack.at(-1)?.label; }

  /**
   * Apply operations now and publish them. Throws a `WorldEditError` when the
   * operations do not apply to the current view, leaving everything unchanged.
   */
  commit(ops: WorldEditOp[], label: string): void {
    if (!ops.length) return;
    // Each inverse is measured against the document as the previous operation left it.
    let document = this.current;
    const steps: WorldEditOp[][] = [];
    for (const op of ops) { steps.push(inverseEditOps(document, op)); document = applyEditOps(document, [op]).document; }
    const entry = {ops, inverse: steps.reverse().flat(), label};
    this.undoStack.push(entry);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.enqueue({entry, direction: 'do', ops}, document);
  }

  undo(): string | undefined {
    const entry = this.undoStack.pop();
    if (!entry) return undefined;
    if (!this.tryEnqueue({entry, direction: 'undo', ops: entry.inverse})) { this.drop(entry); return undefined; }
    this.redoStack.push(entry);
    return entry.label;
  }

  redo(): string | undefined {
    const entry = this.redoStack.pop();
    if (!entry) return undefined;
    if (!this.tryEnqueue({entry, direction: 'redo', ops: entry.ops})) { this.drop(entry); return undefined; }
    this.undoStack.push(entry);
    return entry.label;
  }

  /** Forget the history, for example after a whole-world import. */
  clearHistory(): void { this.undoStack.length = 0; this.redoStack.length = 0; }

  /**
   * Build on a newer published document. Edits still on their way are applied
   * again on top; any that no longer fit are dropped.
   */
  rebase(document: WorldSceneDocument, version: string): void {
    this.confirmed = document; this.confirmedVersion = version;
    this.rebuild(new Set(Object.keys(document.maps)));
  }

  private tryEnqueue(pending: Pending): boolean {
    try { this.enqueue(pending, applyEditOps(this.current, pending.ops).document); return true; }
    catch (error) {
      this.listener.failed({label: pending.entry.label, message: error instanceof Error ? error.message : String(error), problems: problemsOf(error)});
      return false;
    }
  }

  private enqueue(pending: Pending, next: WorldSceneDocument): void {
    this.queue.push(pending);
    this.current = next;
    this.listener.changed(mapsOf(pending.ops));
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    this.listener.saving(true);
    try {
      while (this.queue.length) {
        const pending = this.queue[0];
        try {
          const result = await this.transport.send(pending.ops);
          this.queue.shift();
          if (result.from !== this.confirmedVersion) {
            // Someone else published in between: our base is out of date.
            this.confirmedVersion = result.contentVersion;
            await this.listener.stale();
            continue;
          }
          // The server's operations, including footprints it worked out, become the base.
          this.confirmed = applyEditOps(this.confirmed, result.applied).document;
          this.confirmedVersion = result.contentVersion;
          this.lastSaved = new Date();
          if (result.warnings.length) this.listener.warned?.(result.warnings);
          // Nothing else is waiting: the server's version is exactly what is on screen.
          if (!this.queue.length) this.current = this.confirmed;
        } catch (error) {
          // The server's copy moved on: catch up and send the same edit once more.
          if (problemsOf(error)[0]?.code === 'stale' && !pending.retried) {
            pending.retried = true;
            await this.listener.stale();
            // A whole-ground edit names the ground it replaces. When the reloaded world no longer matches,
            // sending it again would only fail the same way; report it once instead.
            if (this.applies(pending.ops)) continue;
          }
          this.queue.shift();
          this.reject(pending);
          this.listener.failed({label: pending.entry.label, message: error instanceof Error ? error.message : 'The change could not be saved.', problems: problemsOf(error)});
        }
      }
    } finally {
      this.sending = false;
      this.listener.saving(false);
    }
  }

  /** Whether the next batch still fits the published document it would be applied to. */
  private applies(ops: readonly WorldEditOp[]): boolean {
    try { applyEditOps(this.confirmed, ops); return true; }
    catch { return false; }
  }

  /** Take a refused batch out of the history so undo never replays it. */
  private reject(pending: Pending): void {
    const {entry, direction} = pending;
    if (direction === 'undo') {
      // The edit is still in place: it can be undone again.
      const index = this.redoStack.lastIndexOf(entry);
      if (index >= 0) { this.redoStack.splice(index, 1); this.undoStack.push(entry); }
    } else if (direction === 'redo') {
      const index = this.undoStack.lastIndexOf(entry);
      if (index >= 0) { this.undoStack.splice(index, 1); this.redoStack.push(entry); }
    } else this.drop(entry);
    this.rebuild(mapsOf(pending.ops));
  }

  private drop(entry: Entry): void {
    for (const stack of [this.undoStack, this.redoStack]) { const index = stack.lastIndexOf(entry); if (index >= 0) stack.splice(index, 1); }
  }

  /** The view is the published document with every waiting batch applied again. */
  private rebuild(changed: Set<string>): void {
    let document = this.confirmed;
    for (const pending of [...this.queue]) {
      try { document = applyEditOps(document, pending.ops).document; for (const map of mapsOf(pending.ops)) changed.add(map); }
      catch {
        // A batch that no longer fits is skipped here; the server will refuse it too.
      }
    }
    this.current = document;
    this.listener.changed(changed);
  }
}

function problemsOf(error: unknown): WorldProblem[] {
  const problems = (error as {problems?: unknown})?.problems;
  return Array.isArray(problems) ? problems as WorldProblem[] : [];
}
