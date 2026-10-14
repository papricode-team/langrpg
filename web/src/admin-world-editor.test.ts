// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSession, type SessionResult } from './api';
import { canEditWorld, updateWorldEditButton, worldEditorURL, WorldEditorOverlay } from './admin-world-editor';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('admin edit access', () => {
  it('normalizes only an explicit boolean from server account metadata', () => {
    const session = { account: { registered: true, email: 'admin@example.com', admin: true } } as SessionResult;
    expect(normalizeSession(session).account.admin).toBe(true);
    expect(normalizeSession({ ...session, account: { registered: true, email: 'admin@example.com' } }).account.admin).toBe(false);
    expect(normalizeSession({ ...session, account: { ...session.account, admin: 'true' } } as unknown as SessionResult).account.admin).toBe(false);
  });

  it('shows Edit only while an authorized admin is playing', () => {
    const button = document.createElement('button');
    for (const [admin, playing, visible] of [[true, true, true], [true, false, false], [false, true, false]] as const) {
      expect(canEditWorld({ admin }, playing)).toBe(visible);
      updateWorldEditButton(button, { admin }, playing); expect(button.hidden).toBe(!visible);
    }
    expect(worldEditorURL('waldruh', true)).toBe('/editor.html?map=waldruh&embedded=1');
  });

  it('embeds the editor over the existing game and protects dirty drafts and running saves', () => {
    // Keep the iframe available for source checks without navigating to a test server.
    const setSource = vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(() => {});
    const game = document.createElement('main'); game.id = 'game'; document.body.append(game);
    const onOpenChange = vi.fn(), onSaved = vi.fn(), overlay = new WorldEditorOverlay(onOpenChange, onSaved);
    const confirm = vi.fn().mockReturnValue(false); vi.stubGlobal('confirm', confirm);
    overlay.open('lindenhafen');
    expect(setSource).toHaveBeenCalledWith('/editor.html?map=lindenhafen&embedded=1');
    const frame = document.querySelector('iframe')!, dialog = document.querySelector('dialog')!;
    expect(overlay.isOpen).toBe(true); expect(document.querySelector('#game')).toBe(game);
    const post = (data: unknown, origin = location.origin, source: Window | null = frame.contentWindow) => window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
    post({ type: 'atlas:world-saved', contentVersion: 'forged' }, 'https://another.example');
    post({ type: 'atlas:world-saved', contentVersion: 'forged' }, location.origin, window);
    expect(onSaved).not.toHaveBeenCalled();
    post({ type: 'atlas:editor-state', dirty: true, busy: true });
    expect(overlay.close()).toBe(false); expect(confirm).not.toHaveBeenCalled();
    post({ type: 'atlas:editor-state', dirty: true, busy: false });
    expect(overlay.close()).toBe(false); expect(confirm).toHaveBeenCalledOnce();
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel); expect(cancel.defaultPrevented).toBe(true); expect(overlay.isOpen).toBe(true);
    post({ type: 'atlas:world-saved', contentVersion: 'published' }); expect(onSaved).toHaveBeenCalledWith('published');
    post({ type: 'atlas:editor-state', dirty: false, busy: false });
    expect(overlay.close()).toBe(true); expect(dialog.isConnected).toBe(false); expect(document.querySelector('#game')).toBe(game);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });
});
