import type eruda from 'eruda';

export const INSPECTRA_WEBSOCKET_EVENT = 'inspectra:websocket:update';
const STORE_KEY = '__INSPECTRA_ERUDA_STATE__';

export interface WebSocketEvent {
  id: string;
  type: 'websocket';
  ts: number;
  sessionId: string;
  pageUrl: string;
  socketId: string;
  phase: 'created' | 'handshake-request' | 'open' | 'sent' | 'message' | 'error' | 'closed';
  data: Record<string, unknown>;
}

export interface WebSocketDebuggerState {
  status: 'idle' | 'attached' | 'detached' | 'error' | 'conflict';
  message?: string;
  lastUpdated?: number;
}

type ErudaPanelElement = {
  html(value: string): void;
  show(): void;
  hide(): void;
};

export interface InspectraWebSocketState {
  sessionId: string;
  websocketEvents: WebSocketEvent[];
  websocketDebugger: WebSocketDebuggerState;
}

declare global {
  interface Window {
    __INSPECTRA_ERUDA_STATE__?: Record<string, unknown>;
  }
}

/* ── helpers ── */

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatTimestamp = (ts: number) => {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
};

const formatSize = (size: unknown) => {
  if (typeof size !== 'number') return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const prettyJson = (str: string) => {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
};

const closeCodeLabel = (code: unknown): string => {
  if (typeof code !== 'number') return '';
  const labels: Record<number, string> = {
    1000: 'Normal Closure',
    1001: 'Going Away',
    1002: 'Protocol Error',
    1003: 'Unsupported Data',
    1005: 'No Status Received',
    1006: 'Abnormal Closure',
    1007: 'Invalid Payload',
    1008: 'Policy Violation',
    1009: 'Message Too Big',
    1010: 'Missing Extension',
    1011: 'Internal Error',
    1015: 'TLS Handshake'
  };
  return labels[code] ?? `Code ${code}`;
};

type DirectionFilter = 'all' | 'sent' | 'received';

interface SocketInfo {
  socketId: string;
  url: string;
  open: boolean;
  eventCount: number;
  firstSeen: number;
}

const createDefaultDebuggerState = (): WebSocketDebuggerState => ({
  status: 'idle'
});

const formatStatusLabel = (status: WebSocketDebuggerState['status']) => {
  switch (status) {
    case 'attached': return 'Debugger attached';
    case 'detached': return 'Debugger detached';
    case 'conflict': return 'Debugger conflict';
    case 'error': return 'Debugger error';
    default: return 'Debugger idle';
  }
};

const formatPayloadDetail = (data: Record<string, unknown>) => {
  if (typeof data.payload === 'string') {
    return escapeHtml(prettyJson(data.payload)) + (data.truncated ? '\n… (truncated)' : '');
  }

  if (typeof data.payloadBase64 === 'string') {
    const sections: string[] = [];
    if (typeof data.payloadText === 'string') {
      sections.push(`── decoded (UTF-8) ──\n${escapeHtml(data.payloadText as string)}`);
    }
    if (typeof data.payloadHex === 'string') {
      sections.push(`── hex dump ──\n${escapeHtml(data.payloadHex as string)}`);
    }
    sections.push(`── raw (base64) ──\n${escapeHtml(data.payloadBase64 as string)}`);
    if (data.truncated) sections.push('… (truncated)');
    return sections.join('\n\n');
  }

  return '';
};

const formatHeadersDetail = (data: Record<string, unknown>) => {
  const headers = data.headers as Record<string, unknown> | undefined;
  const response = data.response as Record<string, unknown> | undefined;
  const sections: string[] = [];

  if (headers && typeof headers === 'object') {
    sections.push('── Request Headers ──');
    for (const [k, v] of Object.entries(headers)) {
      sections.push(`${escapeHtml(k)}: ${escapeHtml(String(v))}`);
    }
  }

  if (response && typeof response === 'object') {
    sections.push('\n── Response ──');
    sections.push(escapeHtml(JSON.stringify(response, null, 2)));
  }

  return sections.join('\n');
};

export const getInspectraWebSocketState = (): InspectraWebSocketState => {
  const store = window[STORE_KEY] ?? {};
  return {
    sessionId: typeof store.sessionId === 'string' ? store.sessionId : '',
    websocketEvents: Array.isArray(store.websocketEvents)
      ? (store.websocketEvents as WebSocketEvent[])
      : [],
    websocketDebugger:
      typeof store.websocketDebugger === 'object' && store.websocketDebugger !== null
        ? (store.websocketDebugger as WebSocketDebuggerState)
        : createDefaultDebuggerState()
  };
};

/* ── CSS ── */

const CSS = `
.ws-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: inherit;
  box-sizing: border-box;
}

/* ── toolbar ── */
.ws-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  background: var(--darker-background, rgba(127,127,127,.06));
  flex-shrink: 0;
}
.ws-filter-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--border, rgba(127,127,127,.2));
  border-radius: 4px;
  background: var(--background, transparent);
  color: inherit;
  font-size: 11px;
  outline: none;
}
.ws-filter-input:focus {
  border-color: var(--accent, #4a90d9);
}
.ws-dir-btn {
  padding: 3px 8px;
  border: 1px solid var(--border, rgba(127,127,127,.2));
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  opacity: .6;
}
.ws-dir-btn.is-active {
  opacity: 1;
  background: var(--accent, #4a90d9);
  color: #fff;
  border-color: var(--accent, #4a90d9);
}

/* ── debugger status ── */
.ws-debugger {
  padding: 4px 10px;
  font-size: 11px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
.ws-debugger-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #999;
  flex-shrink: 0;
}
.ws-debugger.is-attached .ws-debugger-dot { background: #39b54a; }
.ws-debugger.is-detached .ws-debugger-dot { background: #f4b400; }
.ws-debugger.is-error .ws-debugger-dot,
.ws-debugger.is-conflict .ws-debugger-dot { background: #ff5f56; }

/* ── body (connection selector + main) ── */
.ws-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── connection selector (dropdown) ── */
.ws-conn-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  background: var(--darker-background, rgba(127,127,127,.06));
  flex-shrink: 0;
}
.ws-conn-select {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid var(--border, rgba(127,127,127,.2));
  border-radius: 4px;
  background: var(--background, transparent);
  color: inherit;
  font-size: 11px;
}
.ws-conn-status {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ws-conn-status.is-open { background: #39b54a; }
.ws-conn-status.is-closed { background: #999; }
.ws-conn-count {
  font-size: 11px;
  opacity: .6;
  white-space: nowrap;
}

/* ── message table ── */
.ws-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.ws-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.ws-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--darker-background, rgba(127,127,127,.06));
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  text-align: left;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  white-space: nowrap;
  opacity: .7;
}
.ws-table td {
  padding: 4px 8px;
  font-size: 11px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.1));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.ws-table tr:hover td {
  background: rgba(127,127,127,.06);
}
.ws-table tr.is-selected td {
  background: rgba(127,127,127,.12);
}
.ws-col-dir { width: 24px; text-align: center; }
.ws-col-data { }
.ws-col-size { width: 60px; text-align: right; }
.ws-col-time { width: 75px; text-align: right; }

.ws-arrow-up { color: #39b54a; }
.ws-arrow-down { color: #e74c3c; }
.ws-phase-badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  border: 1px solid var(--border, rgba(127,127,127,.2));
  opacity: .8;
}
.ws-phase-open { color: #39b54a; border-color: #39b54a; }
.ws-phase-closed { color: #e74c3c; border-color: #e74c3c; }
.ws-phase-error { color: #ff5f56; border-color: #ff5f56; }

/* ── detail panel ── */
.ws-detail {
  flex-shrink: 0;
  border-top: 1px solid var(--border, rgba(127,127,127,.2));
  display: flex;
  flex-direction: column;
  max-height: 45%;
  min-height: 0;
}
.ws-detail-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  flex-shrink: 0;
}
.ws-detail-tab {
  padding: 5px 12px;
  font-size: 11px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: inherit;
  opacity: .6;
  border-bottom: 2px solid transparent;
}
.ws-detail-tab.is-active {
  opacity: 1;
  border-bottom-color: var(--accent, #4a90d9);
}
.ws-detail-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
}
.ws-detail-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11px;
  line-height: 1.5;
}
.ws-detail-meta {
  font-size: 11px;
  line-height: 1.6;
}
.ws-detail-meta dt {
  display: inline;
  opacity: .6;
}
.ws-detail-meta dt::after { content: ': '; }
.ws-detail-meta dd {
  display: inline;
  margin: 0;
}
.ws-detail-meta dd::after { content: '\\A'; white-space: pre; }

.ws-empty {
  padding: 20px 10px;
  text-align: center;
  opacity: .5;
  font-size: 12px;
}
`;

/* ── plugin ── */

export const createErudaWebSocketPlugin = () => (erudaApi: typeof eruda) => {
  class InspectraWebSocketTool extends erudaApi.Tool {
    name = 'websocket';
    private panel?: ErudaPanelElement;
    private onUpdate = () => this.render();

    private selectedSocketId: string | null = null;
    private selectedEventId: string | null = null;
    private detailTab: 'payload' | 'headers' | 'meta' = 'payload';
    private filterText = '';
    private directionFilter: DirectionFilter = 'all';
    private tableScrollTop = 0;

    private getSocketList(events: WebSocketEvent[]): SocketInfo[] {
      const map = new Map<string, SocketInfo>();
      for (const e of events) {
        let info = map.get(e.socketId);
        if (!info) {
          info = {
            socketId: e.socketId,
            url: String(e.data.url ?? e.socketId),
            open: false,
            eventCount: 0,
            firstSeen: e.ts
          };
          map.set(e.socketId, info);
        }
        info.eventCount++;
        if (e.phase === 'open') info.open = true;
        if (e.phase === 'closed' || e.phase === 'error') info.open = false;
        if (typeof e.data.url === 'string') info.url = e.data.url;
      }
      return [...map.values()];
    }

    private getFilteredMessages(events: WebSocketEvent[]): WebSocketEvent[] {
      let filtered = events;

      if (this.selectedSocketId) {
        filtered = filtered.filter((e) => e.socketId === this.selectedSocketId);
      }

      const messagePhases = new Set<string>(['sent', 'message', 'open', 'closed', 'error', 'created', 'handshake-request']);
      filtered = filtered.filter((e) => messagePhases.has(e.phase));

      if (this.directionFilter === 'sent') {
        filtered = filtered.filter((e) => e.phase === 'sent' || (e.data.direction === 'outgoing'));
      } else if (this.directionFilter === 'received') {
        filtered = filtered.filter((e) => e.phase === 'message' || (e.data.direction === 'incoming'));
      }

      if (this.filterText) {
        const q = this.filterText.toLowerCase();
        filtered = filtered.filter((e) => {
          const preview = typeof e.data.preview === 'string' ? e.data.preview.toLowerCase() : '';
          const payload = typeof e.data.payload === 'string' ? e.data.payload.toLowerCase() : '';
          const url = typeof e.data.url === 'string' ? e.data.url.toLowerCase() : '';
          return preview.includes(q) || payload.includes(q) || url.includes(q) || e.phase.includes(q);
        });
      }

      return filtered;
    }

    private renderDataColumn(event: WebSocketEvent): string {
      const isFrame = event.phase === 'sent' || event.phase === 'message';
      if (isFrame) {
        const preview = typeof event.data.preview === 'string' ? event.data.preview : '';
        return escapeHtml(preview.length > 200 ? preview.slice(0, 200) + '…' : preview);
      }

      if (event.phase === 'open') return '<span class="ws-phase-badge ws-phase-open">Connected</span>';
      if (event.phase === 'closed') {
        const label = closeCodeLabel(event.data.code);
        return `<span class="ws-phase-badge ws-phase-closed">Closed${label ? ' — ' + escapeHtml(label) : ''}</span>`;
      }
      if (event.phase === 'error') return '<span class="ws-phase-badge ws-phase-error">Error</span>';
      if (event.phase === 'created') return '<span class="ws-phase-badge">Created</span>';
      if (event.phase === 'handshake-request') return '<span class="ws-phase-badge">Handshake</span>';
      return escapeHtml(event.phase);
    }

    private renderDirectionColumn(event: WebSocketEvent): string {
      if (event.phase === 'sent' || event.data.direction === 'outgoing') {
        return '<span class="ws-arrow-up" title="Sent">↑</span>';
      }
      if (event.phase === 'message' || event.data.direction === 'incoming') {
        return '<span class="ws-arrow-down" title="Received">↓</span>';
      }
      return '';
    }

    private renderDetailPanel(event: WebSocketEvent | undefined): string {
      if (!event) {
        return '<div class="ws-empty">Select a message to view details</div>';
      }

      const isFrame = event.phase === 'sent' || event.phase === 'message';
      const hasHeaders = event.phase === 'handshake-request' || event.phase === 'open';
      const hasBinary = typeof event.data.payloadBase64 === 'string';

      const tabs: { id: string; label: string }[] = [];
      if (isFrame) tabs.push({ id: 'payload', label: 'Payload' });
      if (hasHeaders) tabs.push({ id: 'headers', label: 'Headers' });
      tabs.push({ id: 'meta', label: 'Meta' });

      const activeTab = tabs.find((t) => t.id === this.detailTab) ? this.detailTab : tabs[0]?.id ?? 'meta';

      const tabHtml = tabs.map((t) =>
        `<button class="ws-detail-tab${t.id === activeTab ? ' is-active' : ''}" data-tab="${t.id}">${t.label}${t.id === 'payload' && hasBinary ? ' (binary)' : ''}</button>`
      ).join('');

      let bodyHtml = '';
      if (activeTab === 'payload') {
        const detail = formatPayloadDetail(event.data);
        bodyHtml = detail ? `<pre>${detail}</pre>` : '<div class="ws-empty">No payload</div>';
      } else if (activeTab === 'headers') {
        const detail = formatHeadersDetail(event.data);
        bodyHtml = detail ? `<pre>${detail}</pre>` : '<div class="ws-empty">No headers</div>';
      } else {
        const meta = { ...event.data };
        delete meta.payload;
        delete meta.payloadBase64;
        delete meta.payloadText;
        delete meta.payloadHex;
        delete meta.preview;
        delete meta.headers;
        delete meta.response;
        const entries = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null && v !== '');
        bodyHtml = '<dl class="ws-detail-meta">' + entries.map(([k, v]) =>
          `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</dd>`
        ).join('') + '</dl>';
        bodyHtml += `<br><dl class="ws-detail-meta">
          <dt>socketId</dt><dd>${escapeHtml(event.socketId)}</dd>
          <dt>phase</dt><dd>${escapeHtml(event.phase)}</dd>
          <dt>timestamp</dt><dd>${escapeHtml(formatTimestamp(event.ts))}</dd>
          <dt>pageUrl</dt><dd>${escapeHtml(event.pageUrl)}</dd>
        </dl>`;
      }

      return `
        <div class="ws-detail-tabs">${tabHtml}</div>
        <div class="ws-detail-body">${bodyHtml}</div>
      `;
    }

    init($el: unknown) {
      super.init($el);
      this.panel = $el as ErudaPanelElement;
      window.addEventListener(INSPECTRA_WEBSOCKET_EVENT, this.onUpdate);
      this.render();
    }

    render() {
      if (!this.panel) return;

      const state = getInspectraWebSocketState();
      const events = state.websocketEvents;
      const debuggerState = state.websocketDebugger;
      const sockets = this.getSocketList(events);

      if (!this.selectedSocketId && sockets.length > 0) {
        this.selectedSocketId = sockets[sockets.length - 1]!.socketId;
      }

      const selectedSocket = sockets.find((s) => s.socketId === this.selectedSocketId);
      const messages = this.getFilteredMessages(events);
      const selectedEvent = events.find((e) => e.id === this.selectedEventId);

      /* ── connection selector ── */
      const connOptions = sockets.length === 0
        ? '<option>No connections</option>'
        : sockets.map((s) => {
            const label = s.url.replace(/^wss?:\/\//, '');
            const sel = s.socketId === this.selectedSocketId ? ' selected' : '';
            return `<option value="${escapeHtml(s.socketId)}"${sel}>${escapeHtml(label)} (${s.eventCount})</option>`;
          }).join('');

      /* ── table rows ── */
      const tableRows = messages.length === 0
        ? `<tr><td colspan="4" class="ws-empty">No messages${this.filterText ? ' matching filter' : ''}</td></tr>`
        : messages.map((e) => {
            const sel = e.id === this.selectedEventId ? ' is-selected' : '';
            return `<tr class="${sel}" data-event-id="${escapeHtml(e.id)}">
              <td class="ws-col-dir">${this.renderDirectionColumn(e)}</td>
              <td class="ws-col-data">${this.renderDataColumn(e)}</td>
              <td class="ws-col-size">${escapeHtml(formatSize(e.data.size))}</td>
              <td class="ws-col-time">${escapeHtml(formatTimestamp(e.ts))}</td>
            </tr>`;
          }).join('');

      /* ── detail ── */
      const detail = this.selectedEventId ? this.renderDetailPanel(selectedEvent) : this.renderDetailPanel(undefined);

      this.panel.html(`
        <div class="ws-root">
          <style>${CSS}</style>

          <div class="ws-toolbar">
            <input class="ws-filter-input" type="text" placeholder="Filter messages…" value="${escapeHtml(this.filterText)}" data-role="filter" />
            <button class="ws-dir-btn${this.directionFilter === 'all' ? ' is-active' : ''}" data-dir="all">All</button>
            <button class="ws-dir-btn${this.directionFilter === 'sent' ? ' is-active' : ''}" data-dir="sent">↑ Sent</button>
            <button class="ws-dir-btn${this.directionFilter === 'received' ? ' is-active' : ''}" data-dir="received">↓ Recv</button>
          </div>

          <div class="ws-debugger is-${escapeHtml(debuggerState.status)}">
            <span class="ws-debugger-dot"></span>
            <span>${escapeHtml(formatStatusLabel(debuggerState.status))}</span>
          </div>

          <div class="ws-conn-bar">
            <span class="ws-conn-status ${selectedSocket?.open ? 'is-open' : 'is-closed'}"></span>
            <select class="ws-conn-select" data-role="conn-select">${connOptions}</select>
            <span class="ws-conn-count">${sockets.length} conn</span>
          </div>

          <div class="ws-body">
            <div class="ws-table-wrap" data-role="table-wrap">
              <table class="ws-table">
                <thead>
                  <tr>
                    <th class="ws-col-dir"></th>
                    <th class="ws-col-data">Data</th>
                    <th class="ws-col-size">Size</th>
                    <th class="ws-col-time">Time</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>

            <div class="ws-detail" data-role="detail">
              ${detail}
            </div>
          </div>
        </div>
      `);

      requestAnimationFrame(() => this.bindEvents());
    }

    private bindEvents() {
      const root = document.querySelector('.ws-root');
      if (!root) return;

      /* filter input */
      const filterInput = root.querySelector('[data-role="filter"]') as HTMLInputElement | null;
      filterInput?.addEventListener('input', () => {
        this.filterText = filterInput.value;
        this.render();
      });

      /* direction buttons */
      root.querySelectorAll<HTMLElement>('[data-dir]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.directionFilter = (btn.dataset.dir ?? 'all') as DirectionFilter;
          this.render();
        });
      });

      /* connection select */
      const connSelect = root.querySelector('[data-role="conn-select"]') as HTMLSelectElement | null;
      connSelect?.addEventListener('change', () => {
        this.selectedSocketId = connSelect.value;
        this.selectedEventId = null;
        this.render();
      });

      /* table row clicks */
      root.querySelectorAll<HTMLElement>('tr[data-event-id]').forEach((row) => {
        row.addEventListener('click', () => {
          const id = row.dataset.eventId!;
          this.selectedEventId = this.selectedEventId === id ? null : id;
          this.detailTab = 'payload';
          this.render();
        });
      });

      /* detail tabs */
      root.querySelectorAll<HTMLElement>('[data-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
          this.detailTab = tab.dataset.tab as 'payload' | 'headers' | 'meta';
          this.render();
        });
      });

      /* restore table scroll */
      const tableWrap = root.querySelector('[data-role="table-wrap"]') as HTMLElement | null;
      if (tableWrap) {
        tableWrap.scrollTop = this.tableScrollTop;
        tableWrap.addEventListener('scroll', () => {
          this.tableScrollTop = tableWrap.scrollTop;
        }, { passive: true });
      }
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
      window.removeEventListener(INSPECTRA_WEBSOCKET_EVENT, this.onUpdate);
      super.destroy();
    }
  }

  return new InspectraWebSocketTool();
};
