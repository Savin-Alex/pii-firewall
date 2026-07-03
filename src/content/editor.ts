/**
 * Robust editor interaction for React/ProseMirror/Lexical/Quill.
 */
import { SiteConfig } from './sites';

export function readEditor(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value;
  }
  return readContentEditable(el);
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/**
 * Rich editors (ProseMirror/Lexical/Quill) model one line per block element.
 * Plain innerText renders a P boundary as "\n\n", and insertText then turns
 * every "\n" into a paragraph split — each read→write cycle would inflate the
 * text with empty paragraphs. Reading block-per-line keeps the cycle stable.
 */
function readContentEditable(el: HTMLElement): string {
  const children = Array.from(el.childNodes);
  const hasLooseText = children.some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
  const blocks = children.filter((n): n is HTMLElement => n instanceof HTMLElement);

  if (!hasLooseText && blocks.length > 0 && blocks.every(b => BLOCK_TAGS.has(b.tagName))) {
    return blocks.map(blockText).join('\n');
  }

  // Non-block content: innerText preserves visible breaks; textContent is the non-layout fallback (e.g. jsdom)
  const text = el.innerText;
  return text !== undefined ? text : (el.textContent ?? '');
}

function blockText(block: HTMLElement): string {
  const text = block.innerText !== undefined ? block.innerText : (block.textContent ?? '');
  // An empty paragraph (<p><br></p>) reads as "\n" — it is one empty line, not two.
  return text.replace(/\n+$/, '');
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
    let inserted = false;
    if (typeof document.execCommand === 'function') {
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch {
        inserted = false;
      }
    }
    if (!inserted) {
      // Last resort outside Chrome (breaks rich-editor internal state; primary path is execCommand)
      el.textContent = text;
    }

    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  }
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

/**
 * Resolves the prompt editor: site selector first (visible elements only),
 * then the geometric fallback.
 */
export function resolveEditor(site?: SiteConfig): HTMLElement | null {
  if (site) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(site.editor));
    const visible = candidates.find(isVisible);
    if (visible) return visible;
  }
  return findFallbackEditor();
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
