import type eruda from 'eruda';

export const INSPECTRA_REMOTE_EVENT = 'inspectra:remote:update';

export interface RemoteCommand {
  id: string;
  command:
    | 'eval'
    | 'get-storage'
    | 'set-storage'
    | 'delete-storage'
    | 'get-network'
    | 'clear-network'
    | 'reload'
    | 'navigate';
  params?: Record<string, unknown>;
}

export interface RemoteResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface RemoteDeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  url: string;
  title: string;
  online: boolean;
  ts: number;
}

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: string[];
  ts: number;
}

export interface RemoteState {
  connected: boolean;
  peerCount: number;
  pairingCode: string;
  role: 'source' | 'viewer' | 'idle';
  deviceInfo: RemoteDeviceInfo | null;
  consoleEntries: ConsoleEntry[];
  evalHistory: { input: string; output: string; success: boolean; ts: number }[];
  websocketEvents: unknown[];
  webrtcEvents: unknown[];
  mediaPermissions: unknown | null;
  storageData: { type: string; entries: { key: string; value: string }[] } | null;
  networkRequests: unknown[];
}

declare global {
  interface Window {
    __INSPECTRA_REMOTE__?: RemoteState;
  }
}

const MAX_CONSOLE_ENTRIES = 200;
const MAX_EVAL_HISTORY = 50;
const MAX_REMOTE_EVENTS = 200;

type ErudaPanelElement = {
  html(value: string): void;
  show(): void;
  hide(): void;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

const isMobile = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

export const getRemoteState = (): RemoteState => {
  if (!window.__INSPECTRA_REMOTE__) {
    window.__INSPECTRA_REMOTE__ = {
      connected: false,
      peerCount: 0,
      pairingCode: String(Math.floor(1000 + Math.random() * 9000)),
      role: 'idle',
      deviceInfo: null,
      consoleEntries: [],
      evalHistory: [],
      websocketEvents: [],
      webrtcEvents: [],
      mediaPermissions: null,
      storageData: null,
      networkRequests: []
    };
  }
  return window.__INSPECTRA_REMOTE__!;
};

export const pushConsoleEntry = (entry: ConsoleEntry) => {
  const state = getRemoteState();
  state.consoleEntries.push(entry);
  if (state.consoleEntries.length > MAX_CONSOLE_ENTRIES) state.consoleEntries.shift();
  window.dispatchEvent(new CustomEvent(INSPECTRA_REMOTE_EVENT));
};

export const pushRemoteWebSocketEvent = (event: unknown) => {
  const state = getRemoteState();
  state.websocketEvents.push(event);
  if (state.websocketEvents.length > MAX_REMOTE_EVENTS) state.websocketEvents.shift();
  window.dispatchEvent(new CustomEvent(INSPECTRA_REMOTE_EVENT));
};

export const pushRemoteWebRtcEvent = (event: unknown) => {
  const state = getRemoteState();
  state.webrtcEvents.push(event);
  if (state.webrtcEvents.length > MAX_REMOTE_EVENTS) state.webrtcEvents.shift();
  window.dispatchEvent(new CustomEvent(INSPECTRA_REMOTE_EVENT));
};

export const updateRemoteState = (partial: Partial<RemoteState>) => {
  const state = getRemoteState();
  Object.assign(state, partial);
  window.dispatchEvent(new CustomEvent(INSPECTRA_REMOTE_EVENT));
};

const renderMobileUI = (state: RemoteState) => {
  const statusColor = state.connected ? '#39b54a' : '#999';
  const statusText = state.connected ? '연결됨' : '대기 중';
  return `
    <div class="inspectra-remote">
      <style>${STYLES}</style>
      <div class="ir-section">
        <div class="ir-status">
          <span class="ir-dot" style="background:${statusColor}"></span>
          <strong>${statusText}</strong>
          ${state.connected ? `<span>피어: ${state.peerCount}명</span>` : ''}
        </div>
        <div class="ir-code-display">
          <span class="ir-label">연결 코드</span>
          <strong class="ir-code">${escapeHtml(state.pairingCode)}</strong>
        </div>
        <button data-role="regenerate-code" class="ir-btn ir-btn-sm">코드 재생성</button>
        ${state.connected
          ? `<p class="ir-info">PC에서 원격 디버깅 중입니다.</p>
             <button data-role="disconnect" class="ir-btn ir-btn-danger">연결 해제</button>`
          : '<p class="ir-info">PC에서 위 코드를 입력하면 연결됩니다.</p>'}
      </div>
    </div>`;
};

const renderViewerUI = (state: RemoteState) => {
  const di = state.deviceInfo;
  const consoleHtml = state.consoleEntries.length === 0
    ? '<div class="ir-empty">로그 없음</div>'
    : state.consoleEntries.slice(-50).reverse().map(e => {
        const levelClass = e.level === 'error' ? 'ir-log-error' : e.level === 'warn' ? 'ir-log-warn' : '';
        return `<div class="ir-log-entry ${levelClass}">
          <span class="ir-log-time">${formatTime(e.ts)}</span>
          <span class="ir-log-level">[${e.level}]</span>
          <span class="ir-log-msg">${escapeHtml(e.args.join(' '))}</span>
        </div>`;
      }).join('');

  const evalHtml = state.evalHistory.length === 0
    ? ''
    : state.evalHistory.slice(-20).reverse().map(e => `
        <div class="ir-eval-entry">
          <div class="ir-eval-input">&gt; ${escapeHtml(e.input)}</div>
          <div class="ir-eval-output ${e.success ? '' : 'ir-eval-error'}">&lt; ${escapeHtml(e.output)}</div>
        </div>`).join('');

  const wsHtml = state.websocketEvents.length === 0
    ? '<div class="ir-empty">이벤트 없음</div>'
    : (state.websocketEvents as { phase?: string; data?: { url?: string; direction?: string; preview?: string; size?: unknown }; ts?: number }[])
        .slice(-30).reverse().map(e => {
        const d = e.data ?? {};
        return `<div class="ir-event-row">
          <span class="ir-log-time">${e.ts ? formatTime(e.ts) : ''}</span>
          <strong>${escapeHtml(String(e.phase ?? ''))}</strong>
          <span>${escapeHtml(String(d.direction ?? ''))}</span>
          <span>${escapeHtml(String(d.size ?? ''))}B</span>
          <span class="ir-url">${escapeHtml(String(d.url ?? ''))}</span>
          ${d.preview ? `<div class="ir-preview">${escapeHtml(String(d.preview))}</div>` : ''}
        </div>`;
      }).join('');

  const rtcHtml = state.webrtcEvents.length === 0
    ? '<div class="ir-empty">이벤트 없음</div>'
    : (state.webrtcEvents as { phase?: string; data?: Record<string, unknown>; ts?: number }[])
        .slice(-20).reverse().map(e => {
        const d = e.data ?? {};
        return `<div class="ir-event-row">
          <span class="ir-log-time">${e.ts ? formatTime(e.ts) : ''}</span>
          <strong>${escapeHtml(String(e.phase ?? ''))}</strong>
          <span>${escapeHtml(String(d.connectionState ?? ''))}</span>
          ${d.currentRoundTripTime ? `<span>RTT: ${d.currentRoundTripTime}s</span>` : ''}
        </div>`;
      }).join('');

  const mediaHtml = state.mediaPermissions
    ? (() => {
        const m = state.mediaPermissions as Record<string, unknown>;
        const dev = (m.devices ?? {}) as Record<string, number>;
        return `<div class="ir-media-info">
          <span>🎥 Camera: ${m.camera ?? 'unknown'}</span>
          <span>🎤 Mic: ${m.microphone ?? 'unknown'}</span>
          <span>Devices: ${dev.videoInputs ?? 0} video · ${dev.audioInputs ?? 0} audio</span>
        </div>`;
      })()
    : '<div class="ir-empty">데이터 없음</div>';

  const storageHtml = state.storageData
    ? state.storageData.entries.map(e => `
        <div class="ir-storage-row">
          <strong>${escapeHtml(e.key)}</strong>
          <span>${escapeHtml(e.value.length > 80 ? e.value.slice(0, 80) + '...' : e.value)}</span>
          <button data-role="delete-storage" data-key="${escapeHtml(e.key)}" class="ir-btn-icon">✕</button>
        </div>`).join('')
    : '<div class="ir-empty">조회 버튼을 눌러주세요</div>';

  const networkHtml = state.networkRequests.length === 0
    ? '<div class="ir-empty">요청 없음</div>'
    : (state.networkRequests as { method?: string; url?: string; status?: number; size?: number; time?: number }[])
        .slice(-30).reverse().map(r => `
        <div class="ir-event-row">
          <strong>${escapeHtml(String(r.method ?? 'GET'))}</strong>
          <span class="ir-url">${escapeHtml(String(r.url ?? ''))}</span>
          <span>${r.status ?? ''}</span>
          <span>${r.time ? r.time + 'ms' : ''}</span>
        </div>`).join('');

  return `
    <div class="inspectra-remote ir-viewer">
      <style>${STYLES}</style>
      <div class="ir-header">
        <span class="ir-dot" style="background:#39b54a"></span>
        <strong>연결됨</strong>
        ${di ? `<span class="ir-device-summary">${escapeHtml(di.userAgent.slice(0, 60))} · ${di.screenWidth}×${di.screenHeight} @${di.devicePixelRatio}x</span>` : ''}
        <span class="ir-url">${di ? escapeHtml(di.url) : ''}</span>
        <button data-role="disconnect" class="ir-btn ir-btn-danger ir-btn-sm">해제</button>
      </div>

      <div class="ir-section">
        <h3>Remote Console</h3>
        <div class="ir-eval-history">${evalHtml}</div>
        <div class="ir-eval-bar">
          <input data-role="eval-input" class="ir-input" placeholder="JS 입력..." />
          <button data-role="eval-run" class="ir-btn">실행</button>
        </div>
      </div>

      <div class="ir-section ir-collapsible" data-section="console">
        <h3 data-role="toggle-section" data-target="console">Console 스트리밍 <span class="ir-badge">${state.consoleEntries.length}</span></h3>
        <div class="ir-section-body">${consoleHtml}</div>
      </div>

      <div class="ir-section ir-collapsible" data-section="websocket">
        <h3 data-role="toggle-section" data-target="websocket">WebSocket <span class="ir-badge">${state.websocketEvents.length}</span></h3>
        <div class="ir-section-body">${wsHtml}</div>
      </div>

      <div class="ir-section ir-collapsible" data-section="webrtc">
        <h3 data-role="toggle-section" data-target="webrtc">WebRTC <span class="ir-badge">${state.webrtcEvents.length}</span></h3>
        <div class="ir-section-body">${rtcHtml}</div>
      </div>

      <div class="ir-section ir-collapsible" data-section="media">
        <h3 data-role="toggle-section" data-target="media">Media Permissions</h3>
        <div class="ir-section-body">${mediaHtml}</div>
      </div>

      <div class="ir-section ir-collapsible" data-section="storage">
        <h3 data-role="toggle-section" data-target="storage">Storage ${state.storageData ? `(${state.storageData.type})` : ''}</h3>
        <div class="ir-section-body">
          <div class="ir-storage-bar">
            <select data-role="storage-type" class="ir-select">
              <option value="localStorage">localStorage</option>
              <option value="sessionStorage">sessionStorage</option>
              <option value="cookie">cookie</option>
            </select>
            <button data-role="get-storage" class="ir-btn ir-btn-sm">조회</button>
          </div>
          ${storageHtml}
        </div>
      </div>

      <div class="ir-section ir-collapsible" data-section="network">
        <h3 data-role="toggle-section" data-target="network">Network <span class="ir-badge">${state.networkRequests.length}</span></h3>
        <div class="ir-section-body">${networkHtml}</div>
      </div>

      <div class="ir-section">
        <h3>Quick Actions</h3>
        <div class="ir-actions">
          <button data-role="cmd-reload" class="ir-btn ir-btn-sm">🔄 새로고침</button>
          <button data-role="cmd-clear-network" class="ir-btn ir-btn-sm">🧹 Network 클리어</button>
        </div>
        <div class="ir-navigate-bar">
          <input data-role="navigate-url" class="ir-input" placeholder="URL 입력..." />
          <button data-role="cmd-navigate" class="ir-btn ir-btn-sm">🔗 이동</button>
        </div>
      </div>
    </div>`;
};

const renderConnectUI = (state: RemoteState) => `
  <div class="inspectra-remote ir-connect">
    <style>${STYLES}</style>
    <div class="ir-connect-box">
      <h2>Inspectra Remote</h2>
      <p>모바일 기기의 연결 코드를 입력하세요</p>
      <div class="ir-connect-input">
        <input data-role="pairing-input" class="ir-input ir-input-code" maxlength="4" placeholder="0000" />
        <button data-role="connect" class="ir-btn">연결</button>
      </div>
      <p class="ir-info">Relay: ${escapeHtml(String((window as unknown as Record<string, unknown>).__INSPECTRA_RELAY_URL__ ?? 'not configured'))}</p>
    </div>
  </div>`;

const STYLES = `
  .inspectra-remote { height:100%; box-sizing:border-box; display:flex; flex-direction:column; color:inherit; font-size:12px; }
  .ir-viewer { overflow-y:auto; }
  .ir-header { display:flex; align-items:center; gap:8px; padding:10px; border-bottom:1px solid rgba(127,127,127,0.2); flex-wrap:wrap; position:sticky; top:0; background:inherit; z-index:2; }
  .ir-dot { width:8px; height:8px; border-radius:50%; display:inline-block; flex-shrink:0; }
  .ir-section { padding:10px; border-bottom:1px solid rgba(127,127,127,0.15); }
  .ir-section h3 { font-size:12px; margin:0 0 8px; cursor:pointer; user-select:none; }
  .ir-section-body { max-height:200px; overflow-y:auto; }
  .ir-collapsible .ir-section-body { transition: max-height 0.2s; }
  .ir-badge { background:rgba(127,127,127,0.2); padding:1px 6px; border-radius:99px; font-size:10px; font-weight:400; margin-left:4px; }
  .ir-empty { opacity:0.5; padding:8px 0; }
  .ir-btn { padding:4px 12px; background:#2563eb; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; white-space:nowrap; }
  .ir-btn:hover { background:#1d4ed8; }
  .ir-btn-sm { padding:3px 8px; font-size:10px; }
  .ir-btn-danger { background:#ef4444; }
  .ir-btn-danger:hover { background:#dc2626; }
  .ir-btn-icon { background:none; border:none; cursor:pointer; opacity:0.5; font-size:11px; padding:2px 4px; }
  .ir-btn-icon:hover { opacity:1; }
  .ir-input { flex:1; padding:4px 8px; border:1px solid rgba(127,127,127,0.3); border-radius:4px; background:transparent; color:inherit; font-size:11px; font-family:monospace; }
  .ir-input-code { max-width:100px; font-size:20px; text-align:center; letter-spacing:8px; font-weight:700; }
  .ir-select { padding:3px 6px; border:1px solid rgba(127,127,127,0.3); border-radius:4px; background:transparent; color:inherit; font-size:11px; }
  .ir-status { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
  .ir-code-display { margin:12px 0; }
  .ir-code { font-size:28px; letter-spacing:10px; display:block; margin-top:4px; }
  .ir-label { opacity:0.6; font-size:11px; }
  .ir-info { opacity:0.6; font-size:11px; margin:8px 0; }
  .ir-device-summary { opacity:0.7; font-size:11px; }
  .ir-url { opacity:0.6; font-size:11px; word-break:break-all; }
  .ir-eval-bar { display:flex; gap:6px; margin-top:6px; }
  .ir-eval-history { max-height:150px; overflow-y:auto; }
  .ir-eval-entry { margin-bottom:4px; font-family:monospace; font-size:11px; }
  .ir-eval-input { opacity:0.7; }
  .ir-eval-output { color:#39b54a; }
  .ir-eval-error { color:#ef4444; }
  .ir-log-entry { display:flex; gap:6px; font-family:monospace; font-size:11px; padding:2px 0; border-bottom:1px solid rgba(127,127,127,0.08); }
  .ir-log-time { opacity:0.5; flex-shrink:0; }
  .ir-log-level { flex-shrink:0; font-weight:600; }
  .ir-log-msg { word-break:break-all; }
  .ir-log-warn { color:#f59e0b; }
  .ir-log-error { color:#ef4444; }
  .ir-event-row { display:flex; gap:6px; align-items:baseline; font-size:11px; padding:3px 0; border-bottom:1px solid rgba(127,127,127,0.08); flex-wrap:wrap; }
  .ir-preview { font-size:10px; opacity:0.6; width:100%; word-break:break-all; }
  .ir-media-info { display:flex; flex-direction:column; gap:4px; font-size:11px; }
  .ir-storage-bar { display:flex; gap:6px; margin-bottom:8px; }
  .ir-storage-row { display:flex; gap:8px; align-items:center; font-size:11px; padding:3px 0; border-bottom:1px solid rgba(127,127,127,0.08); }
  .ir-storage-row strong { flex-shrink:0; max-width:120px; overflow:hidden; text-overflow:ellipsis; }
  .ir-storage-row span { flex:1; word-break:break-all; opacity:0.7; }
  .ir-actions { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
  .ir-navigate-bar { display:flex; gap:6px; }
  .ir-connect { display:flex; align-items:center; justify-content:center; }
  .ir-connect-box { text-align:center; padding:40px; }
  .ir-connect-box h2 { font-size:18px; margin-bottom:12px; }
  .ir-connect-input { display:flex; gap:8px; justify-content:center; margin:20px 0; }
`;

export const createErudaRemotePlugin = () => (erudaApi: typeof eruda) => {
  class InspectraRemoteTool extends erudaApi.Tool {
    name = 'remote';
    private panel?: ErudaPanelElement;
    private onUpdate = () => this.render();
    private collapsedSections = new Set<string>();

    init($el: unknown) {
      super.init($el);
      this.panel = $el as ErudaPanelElement;
      window.addEventListener(INSPECTRA_REMOTE_EVENT, this.onUpdate);
      this.render();
    }

    render() {
      if (!this.panel) return;
      const state = getRemoteState();

      let html: string;
      if (isMobile()) {
        html = renderMobileUI(state);
      } else if (!state.connected && state.role !== 'viewer') {
        html = renderConnectUI(state);
      } else {
        html = renderViewerUI(state);
      }

      this.panel.html(html);

      requestAnimationFrame(() => {
        this.bindEvents();
      });
    }

    private bindEvents() {
      const root = document.querySelector('.inspectra-remote');
      if (!root) return;

      root.querySelector('[data-role="regenerate-code"]')?.addEventListener('click', () => {
        const state = getRemoteState();
        state.pairingCode = String(Math.floor(1000 + Math.random() * 9000));
        this.render();
      });

      root.querySelector('[data-role="connect"]')?.addEventListener('click', () => {
        const input = root.querySelector('[data-role="pairing-input"]') as HTMLInputElement | null;
        const code = input?.value?.trim();
        if (code && code.length === 4) {
          window.dispatchEvent(new CustomEvent('inspectra:remote:connect', { detail: { code, role: 'viewer' } }));
        }
      });

      root.querySelector('[data-role="pairing-input"]')?.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') {
          (root.querySelector('[data-role="connect"]') as HTMLElement)?.click();
        }
      });

      root.querySelector('[data-role="disconnect"]')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('inspectra:remote:disconnect'));
      });

      root.querySelector('[data-role="eval-run"]')?.addEventListener('click', () => {
        const input = root.querySelector('[data-role="eval-input"]') as HTMLInputElement | null;
        const code = input?.value?.trim();
        if (code) {
          window.dispatchEvent(new CustomEvent('inspectra:remote:command', {
            detail: { command: 'eval', params: { code } }
          }));
          input!.value = '';
        }
      });

      root.querySelector('[data-role="eval-input"]')?.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') {
          (root.querySelector('[data-role="eval-run"]') as HTMLElement)?.click();
        }
      });

      root.querySelector('[data-role="get-storage"]')?.addEventListener('click', () => {
        const select = root.querySelector('[data-role="storage-type"]') as HTMLSelectElement | null;
        window.dispatchEvent(new CustomEvent('inspectra:remote:command', {
          detail: { command: 'get-storage', params: { type: select?.value ?? 'localStorage' } }
        }));
      });

      root.querySelectorAll('[data-role="delete-storage"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const key = (e.currentTarget as HTMLElement).dataset.key;
          const state = getRemoteState();
          window.dispatchEvent(new CustomEvent('inspectra:remote:command', {
            detail: { command: 'delete-storage', params: { type: state.storageData?.type ?? 'localStorage', key } }
          }));
        });
      });

      root.querySelector('[data-role="cmd-reload"]')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('inspectra:remote:command', { detail: { command: 'reload' } }));
      });

      root.querySelector('[data-role="cmd-clear-network"]')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('inspectra:remote:command', { detail: { command: 'clear-network' } }));
      });

      root.querySelector('[data-role="cmd-navigate"]')?.addEventListener('click', () => {
        const input = root.querySelector('[data-role="navigate-url"]') as HTMLInputElement | null;
        const url = input?.value?.trim();
        if (url) {
          window.dispatchEvent(new CustomEvent('inspectra:remote:command', {
            detail: { command: 'navigate', params: { url } }
          }));
        }
      });

      root.querySelectorAll('[data-role="toggle-section"]').forEach(el => {
        el.addEventListener('click', () => {
          const target = (el as HTMLElement).dataset.target;
          if (!target) return;
          const section = root.querySelector(`[data-section="${target}"]`);
          const body = section?.querySelector('.ir-section-body') as HTMLElement | null;
          if (body) {
            const collapsed = body.style.display === 'none';
            body.style.display = collapsed ? '' : 'none';
          }
        });
      });
    }

    show() {
      this.panel?.show();
      return this;
    }

    hide() {
      this.panel?.hide();
      return this;
    }

    destroy() {
      window.removeEventListener(INSPECTRA_REMOTE_EVENT, this.onUpdate);
      super.destroy();
    }
  }

  return new InspectraRemoteTool();
};
