import type { AccountStatus } from './api';
import type { MapId } from './maps';

export const canEditWorld = (account: Pick<AccountStatus, 'admin'>, playing: boolean): boolean => playing && account.admin === true;
export const worldEditorURL = (mapId: MapId, embedded = false): string => `/editor.html?map=${encodeURIComponent(mapId)}${embedded ? '&embedded=1' : ''}`;

export function updateWorldEditButton(button: HTMLButtonElement, account: Pick<AccountStatus, 'admin'>, playing: boolean): void {
  button.hidden = !canEditWorld(account, playing);
}

export class WorldEditorOverlay {
  private dialog?: HTMLDialogElement;
  private frame?: HTMLIFrameElement;
  private dirty = false;
  private busy = false;
  constructor(private readonly onOpenChange: () => void, private readonly onSaved: (contentVersion: string) => void) {}
  get isOpen(): boolean { return this.dialog?.open === true; }

  open(mapId: MapId): void {
    if (this.isOpen) return;
    this.dirty = false; this.busy = false;
    const dialog = document.createElement('dialog');
    dialog.className = 'world-editor-overlay';
    dialog.setAttribute('aria-label', 'World editor');
    dialog.innerHTML = '<div class="world-editor-overlay-bar"><span>World Studio</span><span class="world-editor-overlay-status" role="status"></span><button type="button">Back to game</button></div><iframe title="World editor"></iframe>';
    this.dialog = dialog; this.frame = dialog.querySelector('iframe')!;
    this.frame.src = worldEditorURL(mapId, true);
    dialog.querySelector('button')!.onclick = () => { this.close(); };
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    document.body.append(dialog);
    window.addEventListener('message', this.onMessage);
    window.addEventListener('beforeunload', this.beforeUnload);
    dialog.showModal();
    this.onOpenChange();
  }

  close(): boolean {
    if (!this.dialog) return true;
    if (this.busy) {
      this.dialog.querySelector('.world-editor-overlay-status')!.textContent = 'Wait for the current world operation to finish.';
      return false;
    }
    if (this.dirty && !confirm('Close World Studio with unsaved changes? Your draft is kept on this device.')) return false;
    window.removeEventListener('message', this.onMessage);
    window.removeEventListener('beforeunload', this.beforeUnload);
    this.dialog.close(); this.dialog.remove(); this.dialog = undefined; this.frame = undefined;
    this.dirty = false;
    this.onOpenChange();
    return true;
  }

  private beforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.dirty) { event.preventDefault(); event.returnValue = ''; }
  };

  private onMessage = (event: MessageEvent): void => {
    if (!this.isOpen || event.origin !== location.origin || event.source !== this.frame?.contentWindow || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'atlas:editor-state' && typeof event.data.dirty === 'boolean' && typeof event.data.busy === 'boolean') {
      this.dirty = event.data.dirty; this.busy = event.data.busy;
      this.dialog!.querySelector('.world-editor-overlay-status')!.textContent = this.busy ? 'Working…' : this.dirty ? 'Unsaved changes' : 'All changes saved';
    } else if (event.data.type === 'atlas:world-saved' && typeof event.data.contentVersion === 'string' && event.data.contentVersion) {
      this.onSaved(event.data.contentVersion);
    }
  };
}
