export interface SiteConfig {
  id: string;
  match: string[];
  editor: string;
  send: string;
  /** Paths where a conversation has no stable id yet — vault mapping migrates when the URL changes away from them. */
  draftPaths: string[];
}

export const SITES: SiteConfig[] = [
  {
    id: 'chatgpt',
    match: ['chatgpt.com', 'chat.openai.com'],
    editor: '#prompt-textarea, div.ProseMirror, [contenteditable="true"]',
    send: 'button[data-testid="send-button"], [data-testid="fruitjuice-send-button"]',
    draftPaths: ['/']
  },
  {
    id: 'claude',
    match: ['claude.ai'],
    editor: 'div.ProseMirror[contenteditable="true"], [role="textbox"]',
    send: 'button[aria-label*="Send"], button[aria-label*="Отправить"]',
    draftPaths: ['/', '/new']
  },
  {
    id: 'gemini',
    match: ['gemini.google.com'],
    editor: 'div[contenteditable="true"].ql-editor, [role="textbox"]',
    send: 'button[aria-label*="Send"], button[aria-label*="Отправить"]',
    draftPaths: ['/app']
  },
  {
    id: 'perplexity',
    match: ['perplexity.ai'],
    editor: 'textarea, [role="textbox"]',
    send: 'button[aria-label*="Submit"], button[aria-label*="Отправить"]',
    draftPaths: ['/']
  },
  {
    id: 'poe',
    match: ['poe.com'],
    editor: 'textarea[class*="GrowingTextArea"], textarea, [role="textbox"]',
    send: 'button[class*="sendButton"], button[aria-label*="Send"]',
    draftPaths: []
  }
];

export function getCurrentSite(host: string = window.location.hostname): SiteConfig | undefined {
  // Exact or dot-suffix match only: "mypoe.company.com" must NOT match "poe.com".
  return SITES.find(s => s.match.some(m => host === m || host.endsWith('.' + m)));
}

/**
 * Fallback selector for unknown sites
 */
export const FALLBACK_EDITOR = 'textarea, [contenteditable="true"], [role="textbox"]';
