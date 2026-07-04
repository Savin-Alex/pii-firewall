// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getCurrentSite } from '../src/content/sites';
import { appendInstruction, stripInstruction } from '../src/content/instruction';
import { readEditor, writeEditor, resolveEditor, findFallbackEditor } from '../src/content/editor';
import { Widget } from '../src/content/widget';
import { Vault } from '../src/vault/vault';
import { detect } from '../src/engine/engine';
import { EngineConfig } from '../src/engine/types';

describe('Site matching', () => {
  it('matches known hosts exactly or by dot-suffix', () => {
    expect(getCurrentSite('chatgpt.com')?.id).toBe('chatgpt');
    expect(getCurrentSite('chat.openai.com')?.id).toBe('chatgpt');
    expect(getCurrentSite('claude.ai')?.id).toBe('claude');
    expect(getCurrentSite('www.perplexity.ai')?.id).toBe('perplexity');
    expect(getCurrentSite('poe.com')?.id).toBe('poe');
  });

  it('does not match lookalike hosts by substring', () => {
    expect(getCurrentSite('mypoe.company.com')).toBeUndefined();
    expect(getCurrentSite('chatgpt.com.evil.example')).toBeUndefined();
    expect(getCurrentSite('notclaude.ai.example')).toBeUndefined();
  });
});

describe('Model instruction hygiene', () => {
  it('appends once and stays idempotent', () => {
    const once = appendInstruction('Привет, [PERSON_1]!');
    expect(once).toContain('Сохраняй метки');
    expect(appendInstruction(once)).toBe(once);
  });

  it('strips the instruction so restore never touches its [PERSON_1] example', () => {
    const original = 'Привет, [PERSON_1]!';
    const withInstr = appendInstruction(original);
    expect(stripInstruction(withInstr)).toBe(original);
    expect(stripInstruction(original)).toBe(original);
  });
});

describe('Editor I/O', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('writes textarea via native setter and fires input/change', async () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    const events: string[] = [];
    ta.addEventListener('input', () => events.push('input'));
    ta.addEventListener('change', () => events.push('change'));

    await writeEditor(ta, 'Привет, [PERSON_1]');
    expect(ta.value).toBe('Привет, [PERSON_1]');
    expect(readEditor(ta)).toBe('Привет, [PERSON_1]');
    expect(events).toContain('input');
    expect(events).toContain('change');
  });

  it('writes contenteditable and reads it back', async () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);

    await writeEditor(div, 'Текст с [RU_INN_1]');
    expect(readEditor(div)).toBe('Текст с [RU_INN_1]');
  });

  it('reads ProseMirror-style block markup one line per paragraph', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    // как ChatGPT хранит "строка1\nстрока2\n\nстрока3":
    div.innerHTML = '<p>строка1</p><p>строка2</p><p><br></p><p>строка3</p>';
    document.body.appendChild(div);

    expect(readEditor(div)).toBe('строка1\nстрока2\n\nстрока3');
  });

  it('keeps line structure stable across repeated read cycles (no newline inflation)', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.innerHTML = '<p>Привет! Я [PERSON_1].</p><p>Пиши на [EMAIL_1].</p><p><br></p><p>Проверка второго абзаца.</p>';
    document.body.appendChild(div);

    const first = readEditor(div);
    // Имитируем поведение insertText: каждый \n = новый абзац, пустая строка = <p><br></p>
    div.innerHTML = first
      .split('\n')
      .map(line => (line === '' ? '<p><br></p>' : `<p>${line}</p>`))
      .join('');
    const second = readEditor(div);

    expect(second).toBe(first);
    expect(first).not.toContain('\n\n\n');
  });
});

function mockRect(el: HTMLElement, rect: { top: number; width: number; height: number }) {
  el.getBoundingClientRect = () => ({
    top: rect.top, left: 0, right: rect.width, bottom: rect.top + rect.height,
    width: rect.width, height: rect.height, x: 0, y: rect.top, toJSON: () => ({})
  }) as DOMRect;
}

describe('Editor resolution', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('fallback picks the largest textbox in the bottom half of the viewport', () => {
    const top = document.createElement('textarea');
    const small = document.createElement('textarea');
    const main = document.createElement('textarea');
    document.body.append(top, small, main);
    mockRect(top, { top: 10, width: 800, height: 100 });                                  // top half — ignored
    mockRect(small, { top: window.innerHeight - 100, width: 200, height: 30 });
    mockRect(main, { top: window.innerHeight - 120, width: 700, height: 80 });

    expect(findFallbackEditor()).toBe(main);
    expect(resolveEditor(undefined)).toBe(main);
  });

  it('site selector prefers a visible match over hidden ones', () => {
    const hidden = document.createElement('textarea');
    hidden.id = 'hidden';
    const visible = document.createElement('textarea');
    visible.id = 'visible';
    document.body.append(hidden, visible);
    mockRect(hidden, { top: 0, width: 0, height: 0 });
    mockRect(visible, { top: 500, width: 600, height: 60 });

    const site = { id: 'x', match: [], editor: 'textarea', send: 'button', draftPaths: [] };
    expect(resolveEditor(site)?.id).toBe('visible');
  });

  it('returns null when nothing suitable exists', () => {
    expect(findFallbackEditor()).toBeNull();
  });
});

describe('Context-menu mask selection (hybrid)', () => {
  const config: EngineConfig = { enabledTypes: ['EMAIL', 'PERSON'], minConfidence: 'medium', language: 'auto' };

  beforeEach(() => {
    document.body.innerHTML = '';
    const store: Record<string, any> = {};
    (globalThis as any).chrome = { storage: { session: {
      get: async (k: string) => ({ [k]: store[k] }),
      set: async (o: Record<string, any>) => { Object.assign(store, o); },
      remove: async () => {}, clear: async () => {}
    } } };
  });

  function selectInTextarea(value: string, sel: string) {
    const ta = document.createElement('textarea');
    ta.value = value;
    document.body.appendChild(ta);
    ta.focus();
    const start = value.indexOf(sel);
    ta.setSelectionRange(start, start + sel.length);
    (window as any).getSelection = () => ({ toString: () => sel, rangeCount: 0, isCollapsed: false });
    return ta;
  }

  function makeWidget() {
    return new Widget(() => ({ tabId: 1, url: 'https://chatgpt.com/c/1' }), () => config, () => null);
  }

  it('masks the WHOLE selection as one block when no PII is recognised', async () => {
    const ta = selectInTextarea('please hide THIS SECRET PHRASE now', 'THIS SECRET PHRASE');
    await makeWidget().maskSelection('THIS SECRET PHRASE');
    expect(ta.value).toBe('please hide [MASKED_1] now');
  });

  it('masks recognised PII per-entity, not as a block', async () => {
    const ta = selectInTextarea('write to test@example.com please', 'test@example.com');
    await makeWidget().maskSelection('test@example.com');
    expect(ta.value).toBe('write to [EMAIL_1] please');
    expect(ta.value).not.toContain('MASKED');
  });

  it('uses the selectionText fallback when window.getSelection() is empty (real textarea case)', async () => {
    const ta = document.createElement('textarea');
    ta.value = 'hide THIS BLOCK now';
    document.body.appendChild(ta);
    ta.focus();
    const sel = 'THIS BLOCK';
    const start = ta.value.indexOf(sel);
    ta.setSelectionRange(start, start + sel.length);
    // Real textareas return "" from window.getSelection() — only selectionText carries the text.
    (window as any).getSelection = () => ({ toString: () => '', rangeCount: 0, isCollapsed: true });

    await makeWidget().maskSelection(sel);
    expect(ta.value).toBe('hide [MASKED_1] now'); // reached via selectionText fallback, replaced via selectionStart/End
  });

  it('does nothing when neither getSelection nor selectionText has text', async () => {
    const ta = document.createElement('textarea');
    ta.value = 'unchanged text';
    document.body.appendChild(ta);
    ta.focus();
    (window as any).getSelection = () => ({ toString: () => '', rangeCount: 0, isCollapsed: true });
    await makeWidget().maskSelection(undefined);
    expect(ta.value).toBe('unchanged text');
  });

  it('restores a selected reply for a non-square placeholder style ({{...}})', async () => {
    const session = { tabId: 7, url: 'https://chatgpt.com/c/7' };
    const cfg: EngineConfig = { enabledTypes: ['RU_INN'], minConfidence: 'medium', language: 'auto' };
    await Vault.mask('ИНН 7712345671', detect('ИНН 7712345671', cfg), session, 'curly'); // -> {{RU_INN_1}}

    const widget = new Widget(() => session, () => cfg, () => null);
    (window as any).getSelection = () => ({ toString: () => 'Ваш {{RU_INN_1}} принят' });
    let clip = '';
    (navigator as any).clipboard = { writeText: async (s: string) => { clip = s; } };

    await widget.restore(); // must enter the selection→clipboard path despite no '['
    expect(clip).toContain('7712345671');
  });
});
