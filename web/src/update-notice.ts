import { icon } from './icons';
import './update-notice.css';

/** Keep the refresh action reachable even while a native modal is open. */
export function showUpdateNotice(onRefresh: () => void): () => void {
  const root = document.documentElement;
  const previousHeight = root.style.getPropertyValue('--update-notice-height');
  const previousPriority = root.style.getPropertyPriority('--update-notice-height');
  const wasVisible = root.classList.contains('update-notice-visible');
  const wasFallback = root.classList.contains('update-notice-fallback');
  let removed = false;
  const notice = document.createElement('aside');
  notice.className = 'update-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-atomic', 'true');
  notice.innerHTML = `${icon('refresh')}<div class="update-notice-copy"><strong>An update is available.</strong><p>Refresh when you’re ready.</p></div><div class="update-notice-actions"><button class="update-notice-refresh" type="button">Refresh page</button><button class="update-notice-later" type="button">Later</button></div>`;

  // A manual popover stays in the top layer without a backdrop or autofocus.
  // Its modal ancestor keeps it interactive when the rest of the page is inert.
  let usePopover = typeof notice.showPopover === 'function';
  if (usePopover) notice.setAttribute('popover', 'manual');
  else root.classList.add('update-notice-fallback');
  root.classList.add('update-notice-visible');
  const refreshButton = notice.querySelector<HTMLButtonElement>('.update-notice-refresh')!;
  const laterButton = notice.querySelector<HTMLButtonElement>('.update-notice-later')!;
  refreshButton.addEventListener('click', onRefresh);
  laterButton.addEventListener('click', cleanup);

  const measureHeight = () => {
    if (removed || !notice.isConnected) return;
    const height = Math.ceil(notice.getBoundingClientRect().height);
    if (height > 0 && root.style.getPropertyValue('--update-notice-height') !== `${height}px`) {
      root.style.setProperty('--update-notice-height', `${height}px`);
    }
  };

  const syncHost = () => {
    if (removed) return;
    const dialog = document.querySelector<HTMLDialogElement>('#dialog');
    const menu = document.querySelector<HTMLDialogElement>('#menu-layer');
    const host = dialog?.open && !dialog.hidden ? dialog : menu?.open && !menu.hidden ? menu : document.body;
    if (notice.parentElement !== host) host.append(notice);
    if (usePopover && !notice.matches(':popover-open')) {
      try {
        notice.showPopover();
      } catch {
        // Older implementations can reject a popover inside a modal. The card
        // remains inside the modal so its button still participates in focus.
        usePopover = false;
        notice.removeAttribute('popover');
        root.classList.add('update-notice-fallback');
      }
    }
    measureHeight();
  };

  // Dialog content is replaced between encounters, so retain the same card and
  // listener and attach it again whenever its current host is rebuilt.
  const observer = new MutationObserver(syncHost);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
  const resizeObserver = new ResizeObserver(measureHeight);
  resizeObserver.observe(notice);
  window.addEventListener('resize', measureHeight);
  syncHost();

  function cleanup() {
    if (removed) return;
    removed = true;
    observer.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener('resize', measureHeight);
    refreshButton.removeEventListener('click', onRefresh);
    laterButton.removeEventListener('click', cleanup);
    notice.remove();
    if (!wasVisible) root.classList.remove('update-notice-visible');
    if (!wasFallback) root.classList.remove('update-notice-fallback');
    if (previousHeight) root.style.setProperty('--update-notice-height', previousHeight, previousPriority);
    else root.style.removeProperty('--update-notice-height');
  }
  return cleanup;
}
