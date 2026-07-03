import { Vault, VaultSession } from '../vault/vault';
import { detect } from '../engine/engine';
import { EngineConfig } from '../engine/types';
import { readEditor, writeEditor } from './editor';

export class Widget {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private session: VaultSession;
  private config: EngineConfig;

  constructor(session: VaultSession, config: EngineConfig) {
    this.session = session;
    this.config = config;
    this.container = document.createElement('div');
    this.container.id = 'pii-firewall-widget-root';
    this.shadow = this.container.attachShadow({ mode: 'closed' });
    this.render();
    document.body.appendChild(this.container);
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
        .status { font-size: 12px; color: #666; }
      </style>
      <div class="card">
        <div class="header">
          <span>PII Firewall</span>
          <span style="cursor:pointer" id="close">×</span>
        </div>
        <div class="status" id="status">Готов к защите</div>
        <button class="btn" id="mask-btn">Замаскировать</button>
        <button class="btn btn-secondary" id="restore-btn">Восстановить</button>
      </div>
    `;

    this.shadow.getElementById('mask-btn')?.addEventListener('click', () => this.handleMask());
    this.shadow.getElementById('restore-btn')?.addEventListener('click', () => this.handleRestore());
    this.shadow.getElementById('close')?.addEventListener('click', () => this.container.remove());
  }

  private async handleMask() {
    const editor = this.getActiveEditor();
    if (!editor) return;

    const text = readEditor(editor);
    const detections = detect(text, this.config);
    
    if (detections.length === 0) {
      this.showToast('ПДн не обнаружены');
      return;
    }

    const masked = await Vault.mask(text, detections, this.session);
    const instruction = "\n\nСохраняй метки в квадратных скобках вида [PERSON_1] в ответе без изменений.";
    await writeEditor(editor, masked + instruction);
    
    this.updateStatus(`Защищено сущностей: ${detections.length}`);
  }

  private async handleRestore() {
    const selection = window.getSelection()?.toString();
    if (selection && selection.includes('[')) {
      const { text: restored } = await Vault.restore(selection, this.session);
      await navigator.clipboard.writeText(restored);
      this.showToast('Восстановлено в буфер обмена');
      return;
    }

    const editor = this.getActiveEditor();
    if (!editor) return;

    const text = readEditor(editor);
    const { text: restored } = await Vault.restore(text, this.session);
    await writeEditor(editor, restored);
  }

  private getActiveEditor(): HTMLElement | null {
    // Simple implementation for now, will be improved in index.ts
    return document.querySelector('textarea, [contenteditable="true"]');
  }

  private updateStatus(msg: string) {
    const el = this.shadow.getElementById('status');
    if (el) el.textContent = msg;
  }

  private showToast(msg: string) {
    alert(msg); // Temporary, will replace with proper UI toast
  }
}
