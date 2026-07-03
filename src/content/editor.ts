/**
 * Robust editor interaction for React/ProseMirror/Lexical/Quill.
 */

export function readEditor(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value;
  }
  // For contenteditable, we use innerText to preserve line breaks correctly
  return (el as HTMLElement).innerText || '';
}

export async function writeEditor(el: HTMLElement, text: string): Promise<void> {
  el.focus();

  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    // Native setter bypass for React/Vue
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;
    
    if (nativeValueSetter) {
      nativeValueSetter.call(el, text);
    } else {
      el.value = text;
    }
    
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // For ProseMirror/Lexical/Quill (contenteditable)
    // We use selectAll + insertText to ensure the internal state of the editor is updated
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);

    // execCommand is deprecated but still the most reliable way to update 
    // complex editor states without breaking their internal models.
    document.execCommand('insertText', false, text);
    
    // Fallback if execCommand failed or didn't trigger events
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  }
}

/**
 * Finds the most likely editor on the page if the specific selector fails.
 * Looks for the largest visible textbox in the bottom half of the screen.
 */
export function findFallbackEditor(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"], [role="textbox"]'));
  const viewportHeight = window.innerHeight;
  
  return candidates
    .filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 100 && rect.height > 20 && rect.top > viewportHeight / 2;
    })
    .sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return (rectB.width * rectB.height) - (rectA.width * rectA.height);
    })[0] || null;
}
