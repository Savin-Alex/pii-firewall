export interface SiteConfig {
  id: string;
  match: string[];
  editor: string;
  send: string;
}

export const SITES: SiteConfig[] = [
  {
    id: 'chatgpt',
    match: ['chatgpt.com', 'chat.openai.com'],
    editor: '#prompt-textarea, div.ProseMirror, [contenteditable="true"]',
    send: 'button[data-testid="send-button"], [data-testid="fruitjuice-send-button"]'
  },
  {
    id: 'claude',
    match: ['claude.ai'],
    editor: 'div.ProseMirror[contenteditable="true"], [role="textbox"]',
    send: 'button[aria-label*="Send"], button[aria-label*="Отправить"]'
  },
  {
    id: 'gemini',
    match: ['gemini.google.com'],
    editor: 'div[contenteditable="true"].ql-editor, [role="textbox"]',
    send: 'button[aria-label*="Send"], button[aria-label*="Отправить"]'
  },
  {
    id: 'perplexity',
    match: ['perplexity.ai'],
    editor: 'textarea, [role="textbox"]',
    send: 'button[aria-label*="Submit"], button[aria-label*="Отправить"]'
  },
  {
    id: 'poe',
    match: ['poe.com'],
    editor: 'textarea[class*="GrowingTextArea"], textarea, [role="textbox"]',
    send: 'button[class*="sendButton"], button[aria-label*="Send"]'
  }
];

export function getCurrentSite(): SiteConfig | undefined {
  const host = window.location.hostname;
  return SITES.find(s => s.match.some(m => host.includes(m)));
}

/**
 * Fallback selector for unknown sites
 */
export const FALLBACK_EDITOR = 'textarea, [contenteditable="true"], [role="textbox"]';
