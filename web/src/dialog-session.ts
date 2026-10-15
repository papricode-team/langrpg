/**
 * The page has one encounter dialog (#dialog). Openers that load before they paint into it can finish after
 * the player has moved on, so every such opener holds a check from this session and stops when it fails.
 *
 * The check fails once the dialog is opened or closed again, another opener starts, or the signed-in player
 * changes. That one rule replaces the per-launcher counters that previously missed each other's dialogs.
 */
export class DialogSession {
  private generation = 0;
  constructor(private readonly owner: () => string = () => '') {}

  /** The dialog opened or closed: openers still loading are no longer wanted. */
  invalidate(): void { this.generation++; }

  /** Start an async opener. The returned check stays true until the dialog changes or a newer opener starts. */
  begin(): () => boolean {
    const generation = ++this.generation, owner = this.owner();
    return () => generation === this.generation && owner === this.owner();
  }
}

export interface AsyncDialogHost {
  session: DialogSession;
  dialog(): HTMLDialogElement;
  /** Paint into the dialog and show it; this invalidates the session. */
  open(html: string, className: string): void;
}

/**
 * Show a loading placeholder, load, then mount, unless the dialog moved on while loading. `mount` and `fail`
 * run only for the opener that still owns the dialog; errors thrown by `mount` are reported through `fail`.
 * Resolves true when the content was mounted.
 */
export async function openAsyncDialog<T>(host: AsyncDialogHost, placeholder: string, className: string,
  load: () => Promise<T>, mount: (value: T, dialog: HTMLDialogElement) => void, fail: (error: unknown, dialog: HTMLDialogElement) => void): Promise<boolean> {
  host.open(placeholder, className);
  const current = host.session.begin(), dialog = host.dialog();
  try {
    const value = await load();
    if (!current() || !dialog.open) return false;
    mount(value, dialog);
    return true;
  } catch (error) {
    if (current()) fail(error, dialog);
    return false;
  }
}

/**
 * A dialog's close event arrives a task after close(), so an opener started right after closing (for example
 * "close this, then open the next scene") would be cancelled by its own predecessor's close event. Invalidate
 * as the dialog starts closing instead; the returned function tells the close-event handler whether that
 * already happened, so a close by any other route is still counted once.
 */
export function trackDialogClose(dialog: HTMLDialogElement, session: DialogSession): () => boolean {
  let invalidated = false;
  const close = dialog.close.bind(dialog);
  dialog.close = (returnValue?: string) => {
    if (dialog.open) { session.invalidate(); invalidated = true; }
    close(returnValue);
  };
  dialog.addEventListener('cancel', () => { session.invalidate(); invalidated = true; });
  return () => { const done = invalidated; invalidated = false; return done; };
}
