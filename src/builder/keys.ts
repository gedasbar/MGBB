/**
 * Keyboard shortcuts of the Build screen (chunk 21a). `keyAction` is a pure function from a key event to the action it means, so the
 * mapping is unit-tested without a browser; BuildScreen does the action. Touch is untouched: these are extra ways in.
 *
 *   R / Shift+R   rotate the selected block right / left     Q   rotate left
 *   D, Delete, Backspace   delete the selected block         A   auto-orient the selected block
 *   Ctrl+Z   undo      Ctrl+Y or Ctrl+Shift+Z   redo
 *   Esc   close the open sheet, else deselect                F   fly
 * (Cmd works like Ctrl.) Nothing fires while typing in an input, for a repeating key, or for a combination this table does not list.
 */
export type BuildKeyAction = 'rotateRight' | 'rotateLeft' | 'delete' | 'autoOrient' | 'undo' | 'redo' | 'escape' | 'fly';

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}

/** The list the Help screen shows (one line per shortcut). */
export const BUILD_KEY_HELP: readonly string[] = [
  'R / Shift+R or Q: rotate the selected block right / left',
  'D, Delete or Backspace: delete the selected block',
  'A: auto-orient the selected block',
  'Ctrl+Z: undo.  Ctrl+Y or Ctrl+Shift+Z: redo',
  'Esc: close the sheet, or deselect',
  'F: fly',
];

export function isTypingTarget(t: KeyLike['target']): boolean {
  if (!t) return false;
  const tag = (t.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

export function keyAction(e: KeyLike): BuildKeyAction | null {
  if (isTypingTarget(e.target)) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return null;
    if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (k === 'y' && !e.shiftKey) return 'redo';
    return null; // Ctrl+R (reload), Ctrl+D, Ctrl+A ... belong to the browser
  }
  if (e.altKey) return null;
  if (k === 'Escape') return 'escape';
  if (e.repeat && k !== 'Delete' && k !== 'Backspace') return null;
  switch (k) {
    case 'r': return e.shiftKey ? 'rotateLeft' : 'rotateRight';
    case 'q': return 'rotateLeft';
    case 'd': case 'Delete': case 'Backspace': return 'delete';
    case 'a': return 'autoOrient';
    case 'f': return 'fly';
    default: return null;
  }
}
