import { detect } from '../engine/engine';
import { Detection, EngineConfig } from '../engine/types';
import { Vault, VaultSession } from '../vault/vault';
import { readEditor, writeEditor } from './editor';
import { appendInstruction } from './instruction';
import { getCurrentSite } from './sites';
import { incrementLeakCount } from '../settings';
import { PlaceholderStyle } from '../vault/placeholder';
import { t } from '../i18n';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

export interface GuardHooks {
  /** Whether guard is on for the current site (global toggle + per-site). */
  activeProvider: () => boolean;
  /** Whether to append the model instruction after masking. */
  instructionProvider: () => boolean;
  /** Placeholder bracket style. */
  styleProvider: () => PlaceholderStyle;
}

export class Guard {
  private isProcessing = false;

  constructor(
    private configProvider: () => EngineConfig,
    private sessionProvider: () => VaultSession,
    private hooks: GuardHooks
  ) {
    this.setupListeners();
  }

  private setupListeners() {
    // Capture phase to intercept events before the site's own listeners
    document.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
    document.addEventListener('click', (e) => this.handleClick(e), true);
  }

  private async handleKeyDown(e: KeyboardEvent) {
    if (this.isProcessing || !this.hooks.activeProvider()) return;

    // Intercept Enter without Shift
    if (e.key === 'Enter' && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (this.isEditor(target)) {
        await this.intercept(e, target);
      }
    }
  }

  private async handleClick(e: MouseEvent) {
    if (this.isProcessing || !this.hooks.activeProvider()) return;

    const site = getCurrentSite();
    if (!site) return;

    const target = e.target as HTMLElement;
    const sendButton = target.closest(site.send);

    if (sendButton) {
      const editor = document.querySelector(site.editor) as HTMLElement;
      if (editor) {
        await this.intercept(e, editor);
      }
    }
  }

  private isEditor(el: HTMLElement): boolean {
    return el.matches('textarea, [contenteditable="true"], [role="textbox"]');
  }

  private async intercept(e: Event, editor: HTMLElement) {
    const text = readEditor(editor);
    const detections = detect(text, this.configProvider());

    if (detections.length > 0) {
      // Stop the original event
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      this.showGuardModal(editor, text, detections);
    }
  }

  private showGuardModal(editor: HTMLElement, text: string, detections: Detection[]) {
    const modalRoot = document.createElement('div');
    modalRoot.id = 'pii-firewall-guard-modal';
    const shadow = modalRoot.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
      <style>
        .overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.6); z-index: 1000000;
          display: flex; align-items: center; justify-content: center;
          font-family: system-ui, sans-serif;
        }
        .modal {
          background: #fff; padding: 24px; border-radius: 16px;
          max-width: 500px; width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }
        @media (prefers-color-scheme: dark) {
          .modal { background: #2c2c2c; color: #eee; }
        }
        h2 { margin-top: 0; color: #ff3b30; font-size: 20px; }
        .preview {
          background: #f5f5f5; padding: 12px; border-radius: 8px;
          margin: 16px 0; font-size: 14px; max-height: 200px; overflow-y: auto;
          white-space: pre-wrap; border: 1px solid #ddd;
        }
        @media (prefers-color-scheme: dark) {
          .preview { background: #1a1a1a; border-color: #444; }
        }
        .highlight { background: #ffcc00; color: #000; border-radius: 2px; padding: 0 2px; }
        .actions { display: flex; flex-direction: column; gap: 10px; }
        .btn {
          padding: 12px; border-radius: 8px; border: none; cursor: pointer;
          font-weight: 600; font-size: 15px;
        }
        .btn-primary { background: #007aff; color: #fff; }
        .btn-outline { background: transparent; border: 1px solid #888; color: #888; }
      </style>
      <div class="overlay">
        <div class="modal">
          <h2>${t('guard_title')}</h2>
          <p>${t('guard_desc')}</p>
          <div class="preview">${this.highlightText(text, detections)}</div>
          <div class="actions">
            <button class="btn btn-primary" id="mask-send">${t('btn_mask_send')}</button>
            <button class="btn btn-outline" id="send-anyway">${t('btn_send_anyway')}</button>
            <button class="btn btn-outline" id="cancel">${t('btn_cancel')}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalRoot);

    shadow.getElementById('mask-send')?.addEventListener('click', async () => {
      this.isProcessing = true;
      try {
        const masked = await Vault.mask(text, detections, this.sessionProvider(), this.hooks.styleProvider());
        await writeEditor(editor, this.hooks.instructionProvider() ? appendInstruction(masked) : masked);
        void incrementLeakCount(); // a leak was prevented — bump the popup counter
        modalRoot.remove();
        // Flag stays up through triggerSubmit so our own capture listeners pass the event through
        this.triggerSubmit(editor);
      } finally {
        this.isProcessing = false;
      }
    });

    shadow.getElementById('send-anyway')?.addEventListener('click', () => {
      this.isProcessing = true;
      modalRoot.remove();
      this.triggerSubmit(editor);
      this.isProcessing = false;
    });

    shadow.getElementById('cancel')?.addEventListener('click', () => {
      modalRoot.remove();
    });
  }

  private highlightText(text: string, detections: Detection[]): string {
    // User-controlled text goes into innerHTML — every segment must be escaped.
    let result = '';
    let lastIndex = 0;
    const sorted = [...detections].sort((a, b) => a.start - b.start);

    for (const det of sorted) {
      result += escapeHtml(text.substring(lastIndex, det.start));
      result += `<span class="highlight">${escapeHtml(text.substring(det.start, det.end))}</span>`;
      lastIndex = det.end;
    }
    result += escapeHtml(text.substring(lastIndex));
    return result;
  }

  private triggerSubmit(editor: HTMLElement) {
    const site = getCurrentSite();
    if (site) {
      const btn = document.querySelector(site.send) as HTMLElement;
      if (btn) {
        btn.click();
        return;
      }
    }
    // Fallback: trigger Enter
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
}
