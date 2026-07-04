import { Vault, VaultSession, VaultStorageError } from '../vault/vault';
import { PlaceholderStyle } from '../vault/placeholder';
import { detect } from '../engine/engine';
import { Detection, EngineConfig } from '../engine/types';
import { readEditor, writeEditor } from './editor';
import { appendInstruction, stripInstruction } from './instruction';
import { t } from '../i18n';

export class Widget {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private closed = false;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private sessionProvider: () => VaultSession,
    private configProvider: () => EngineConfig,
    private editorResolver: () => HTMLElement | null,
    private instructionProvider: () => boolean = () => true,
    private styleProvider: () => PlaceholderStyle = () => 'square'
  ) {
    this.container = document.createElement('div');
    this.container.id = 'pii-firewall-widget-root';
    this.shadow = this.container.attachShadow({ mode: 'closed' });
    this.render();
    document.body.appendChild(this.container);
  }

  /** Re-attaches the widget if an SPA re-render dropped it (unless the user closed it). */
  ensureAttached() {
    if (!this.closed && !document.body.contains(this.container)) {
      document.body.appendChild(this.container);
    }
  }

  private render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .card {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          padding: 12px;
          width: 240px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        @media (prefers-color-scheme: dark) {
          .card { background: #2c2c2c; border-color: #444; color: #eee; }
        }
        .header { font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; }
        .btn {
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 6px;
          border: none;
          background: #007aff;
          color: white;
          font-size: 13px;
          font-weight: 500;
          text-align: center;
        }
        .btn-secondary { background: #f0f0f0; color: #333; }
        @media (prefers-color-scheme: dark) {
          .btn-secondary { background: #444; color: #eee; }
        }
        .status { font-size: 12px; color: #666; min-height: 15px; }
        @media (prefers-color-scheme: dark) { .status { color: #aaa; } }
        .chips { display: flex; flex-wrap: wrap; gap: 4px; }
        .chips:empty { display: none; }
        .chip {
          font-size: 11px; padding: 2px 8px; border-radius: 10px;
          background: #eaf2ff; color: #0a58c2; white-space: nowrap;
        }
        @media (prefers-color-scheme: dark) { .chip { background: #1d3a5f; color: #9cc4f5; } }
      </style>
      <div class="card">
        <div class="header">
          <span>PII Firewall</span>
          <span style="cursor:pointer" id="close">×</span>
        </div>
        <div class="status" id="status">${t('status_ready')}</div>
        <div class="chips" id="chips"></div>
        <button class="btn" id="mask-btn">${t('btn_mask')}</button>
        <button class="btn btn-secondary" id="restore-btn">${t('btn_restore')}</button>
      </div>
    `;

    this.shadow.getElementById('mask-btn')?.addEventListener('click', () => void this.mask());
    this.shadow.getElementById('restore-btn')?.addEventListener('click', () => void this.restore());
    this.shadow.getElementById('close')?.addEventListener('click', () => {
      this.closed = true;
      this.container.remove();
    });
  }

  async mask(): Promise<void> {
    const editor = this.editorResolver();
    if (!editor) {
      this.showToast(t('toast_no_editor'));
      return;
    }

    const text = readEditor(editor);
    const detections = detect(text, this.configProvider());

    if (detections.length === 0) {
      this.renderChips([]);
      this.showToast(t('toast_no_pii'));
      return;
    }

    try {
      const masked = await Vault.mask(text, detections, this.sessionProvider(), this.styleProvider());
      await writeEditor(editor, this.instructionProvider() ? appendInstruction(masked) : masked);
      this.renderChips(detections);
      this.updateStatus(`${t('widget_protected')}: ${detections.length}`);
    } catch (e) {
      this.showToast(e instanceof VaultStorageError ? t('toast_storage_error') : t('toast_mask_error'));
    }
  }

  async restore(): Promise<void> {
    const session = this.sessionProvider();

    // Selection first: restore an AI reply fragment into the clipboard.
    const selection = window.getSelection()?.toString();
    if (selection && selection.includes('[')) {
      const { text: restored, missing } = await Vault.restore(stripInstruction(selection), session);
      await navigator.clipboard.writeText(restored);
      this.showToast(missing.length ? `${t('toast_clip_missing')}: ${missing.length}` : t('toast_restored'));
      return;
    }

    const editor = this.editorResolver();
    if (!editor) {
      this.showToast(t('toast_no_editor'));
      return;
    }

    const text = stripInstruction(readEditor(editor));
    const { text: restored, missing } = await Vault.restore(text, session);
    await writeEditor(editor, restored);
    if (missing.length > 0) {
      this.showToast(`${t('toast_missing')}: ${missing.length}`);
    } else {
      this.updateStatus(t('status_ready'));
      this.renderChips([]);
    }
  }

  private renderChips(detections: Detection[]) {
    const el = this.shadow.getElementById('chips');
    if (!el) return;
    const counts = new Map<string, number>();
    for (const d of detections) counts.set(d.type, (counts.get(d.type) || 0) + 1);
    el.textContent = '';
    for (const [type, count] of counts) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = count > 1 ? `${type} ×${count}` : type;
      el.appendChild(chip);
    }
  }

  private updateStatus(msg: string) {
    const el = this.shadow.getElementById('status');
    if (el) el.textContent = msg;
  }

  private showToast(msg: string) {
    const el = this.shadow.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.textContent = t('status_ready'); }, 3000);
  }
}
