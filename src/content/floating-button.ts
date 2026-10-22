/**
 * Floating "Scan with <product>" button rendered inside a closed Shadow DOM so the page's CSS
 * cannot style it and our CSS cannot leak into the page. It only sends messages; it never
 * reads page content.
 */
export interface FloatingButtonHandlers {
  onScan: () => void;
  onDismiss: () => void;
}

const HOST_ID = 'codeguard-extension-root';

const STYLES = `
:host { all: initial; }
.wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif; }
.bar { display: inline-flex; align-items: center; border-radius: 999px; background: #0B1020; box-shadow: 0 6px 20px rgba(2,6,23,.35);
  border: 1px solid #273259; overflow: hidden; }
button { all: unset; cursor: pointer; color: #fff; display: inline-flex; align-items: center; gap: 8px; }
.scan { padding: 9px 12px 9px 10px; background: #2563EB; }
.scan:hover { background: #1D4ED8; }
.close { padding: 9px 10px; color: #94A3B8; font-size: 14px; line-height: 1; }
.close:hover { color: #fff; }
button:focus-visible { outline: 2px solid #60A5FA; outline-offset: -2px; }
.toast { max-width: 260px; padding: 8px 12px; border-radius: 8px; background: #111833; color: #E2E8F0; border: 1px solid #273259;
  box-shadow: 0 6px 20px rgba(2,6,23,.35); font-size: 12px; line-height: 1.4; }
svg { flex: none; }
`;

const SHIELD = `<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 4 6.5v8.2c0 7.4 5.1 13.6 12 15.3 6.9-1.7 12-7.9 12-15.3V6.5L16 2Z" fill="#fff" fill-opacity=".95"/><path d="m11 16.2 3.4 3.4L21.5 12" stroke="#2563EB" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export class FloatingButton {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly handlers: FloatingButtonHandlers) {}

  get mounted(): boolean {
    return !!this.host?.isConnected;
  }

  mount(productName: string): void {
    if (this.mounted) {
      this.setLabel(productName);
      return;
    }
    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    const bar = document.createElement('div');
    bar.className = 'bar';

    const scan = document.createElement('button');
    scan.className = 'scan';
    scan.type = 'button';
    scan.innerHTML = SHIELD; // static, trusted markup
    const label = document.createElement('span');
    label.className = 'label';
    scan.appendChild(label);
    scan.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onScan();
    });

    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Hide this button on this site');
    close.title = 'Hide on this site';
    close.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onDismiss();
      this.unmount();
    });

    bar.append(scan, close);
    wrap.append(bar);
    root.append(style, wrap);
    (document.body ?? document.documentElement).appendChild(host);
    this.host = host;
    this.root = root;
    this.setLabel(productName);
  }

  private setLabel(productName: string): void {
    const label = this.root?.querySelector('.label');
    if (label) label.textContent = `Scan with ${productName}`;
    this.root?.querySelector('.scan')?.setAttribute('aria-label', `Scan with ${productName} — opens the side panel`);
  }

  toast(text: string): void {
    const wrap = this.root?.querySelector('.wrap');
    if (!wrap) return;
    wrap.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = text;
    wrap.prepend(t);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.remove(), 5000);
  }

  unmount(): void {
    this.host?.remove();
    this.host = null;
    this.root = null;
  }
}
