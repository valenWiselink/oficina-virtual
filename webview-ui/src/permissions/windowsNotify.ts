import { isFocused, noteWhileFocused } from '../focus/focusMode.js';

/** The notices for a wait that is not a permission ("te espera"); the
 *  rest (permissions) are urgent. */
const WAIT_TAG_PREFIX = 'oficina-espera-';

/**
 * Windows toast via the browser Notifications API (localhost is a secure
 * context, so it is available). Shown only while the office is not in view:
 * when the tab is visible the card itself, the character and the sound
 * already say it, and a toast on top would be noise. In focus mode only
 * urgent ones go out (a permission blocks an agent); by default a notice is
 * urgent unless its tag is a wait's.
 */
export function notifyWindows(
  title: string,
  body: string,
  tag: string,
  urgent = !tag.startsWith(WAIT_TAG_PREFIX),
): void {
  if (!urgent && isFocused()) {
    noteWhileFocused('tetoca');
    return;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const toast = new Notification(title, { body, tag });
    toast.onclick = () => {
      window.focus();
      toast.close();
    };
  } catch {
    /* a blocked or unsupported toast must never break the office */
  }
}

/**
 * Ask for notification permission on the first click or key press: browsers
 * mute (or refuse) a permission prompt that is not tied to a user gesture.
 * Returns the cleanup for useEffect.
 */
export function requestNotificationPermissionOnFirstGesture(): () => void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') {
    return () => {};
  }
  const ask = (): void => {
    cleanup();
    void Notification.requestPermission().catch(() => {});
  };
  const cleanup = (): void => {
    window.removeEventListener('pointerdown', ask);
    window.removeEventListener('keydown', ask);
  };
  window.addEventListener('pointerdown', ask);
  window.addEventListener('keydown', ask);
  return cleanup;
}
