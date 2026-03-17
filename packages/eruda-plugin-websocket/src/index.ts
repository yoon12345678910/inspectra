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
  phase: 'created' | 'open' | 'sent' | 'message' | 'error' | 'closed';
  data: Record<string, unknown>;
}

type ErudaPanelElement = {
  html(value: string): void;
  show(): void;
  hide(): void;
};

export interface InspectraWebSocketState {
  sessionId: string;
  websocketEvents: WebSocketEvent[];
}

declare global {
  interface Window {
    __INSPECTRA_ERUDA_STATE__?: Record<string, unknown>;
  }
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatData = (data: Record<string, unknown>) => {
  try {
    return escapeHtml(JSON.stringify(data, null, 2));
  } catch {
    return '';
  }
};

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

const formatMetric = (value: unknown, fallback = 'N/A') => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value);
};

const summarizeEvent = (event: WebSocketEvent) => {
  const data = event.data;
  return [
    ['phase', event.phase],
    ['direction', formatMetric(data.direction)],
    ['type', formatMetric(data.payloadType)],
    ['size', formatMetric(data.size)],
    ['state', formatMetric(data.readyState)],
    ['code', formatMetric(data.code)]
  ]
    .filter(([, value]) => value !== 'N/A')
    .slice(0, 6);
};

const buildHeaderStats = (events: WebSocketEvent[]) => {
  const socketIds = new Set(events.map((event) => event.socketId));
  const latest = events[events.length - 1];

  return [
    ['Sockets', String(socketIds.size)],
    ['Events', String(events.length)],
    ['Last phase', latest ? latest.phase : 'N/A'],
    ['Last update', latest ? formatTimestamp(latest.ts) : 'N/A']
  ];
};

const summarizePreview = (data: Record<string, unknown>) => {
  const preview = typeof data.preview === 'string' ? data.preview.trim() : '';
  if (!preview) {
    return '';
  }

  return preview.length > 96 ? `${preview.slice(0, 96)}...` : preview;
};

export const getInspectraWebSocketState = (): InspectraWebSocketState => {
  const store = window[STORE_KEY] ?? {};
  return {
    sessionId: typeof store.sessionId === 'string' ? store.sessionId : '',
    websocketEvents: Array.isArray(store.websocketEvents)
      ? (store.websocketEvents as WebSocketEvent[])
      : []
  };
};

export const createErudaWebSocketPlugin = () => (erudaApi: typeof eruda) => {
  class InspectraWebSocketTool extends erudaApi.Tool {
    name = 'websocket';
    private panel?: ErudaPanelElement;
    private onUpdate = () => this.render();
    private onScroll = () => {
      const container = this.findScrollContainer();
      if (container) {
        this.scrollTop = container.scrollTop;
      }
    };
    private scrollTop = 0;
    private selectedEventId?: string;
    private expandAllDetails = false;
    private scrollBoundElement?: HTMLElement;

    private findScrollContainer() {
      return document.querySelector('.inspectra-websocket .inspectra-scroll') as HTMLElement | null;
    }

    private bindScrollState() {
      const container = this.findScrollContainer();
      if (!container || this.scrollBoundElement === container) {
        return;
      }

      this.scrollBoundElement?.removeEventListener('scroll', this.onScroll);
      container.addEventListener('scroll', this.onScroll, { passive: true });
      this.scrollBoundElement = container;
    }

    private captureViewportAnchor() {
      const container = this.findScrollContainer();
      const selectedCard = container?.querySelector('.inspectra-card.is-selected') as HTMLElement | null;

      return {
        scrollTop: container?.scrollTop ?? this.scrollTop,
        selectedOffset:
          container && selectedCard
            ? selectedCard.getBoundingClientRect().top - container.getBoundingClientRect().top
            : null
      };
    }

    private restoreViewportAnchor(anchor: { scrollTop: number; selectedOffset: number | null }) {
      const container = this.findScrollContainer();
      if (!container) {
        return;
      }

      if (anchor.selectedOffset !== null && this.selectedEventId) {
        const selectedCard = container.querySelector('.inspectra-card.is-selected') as HTMLElement | null;
        if (selectedCard) {
          const nextOffset = selectedCard.getBoundingClientRect().top - container.getBoundingClientRect().top;
          container.scrollTop += nextOffset - anchor.selectedOffset;
          this.scrollTop = container.scrollTop;
          return;
        }
      }

      container.scrollTop = anchor.scrollTop;
      this.scrollTop = anchor.scrollTop;
    }

    private bindInteractionState() {
      const root = document.querySelector('.inspectra-websocket');
      if (!root) {
        return;
      }

      const expandToggle = root.querySelector('[data-role="expand-details"]') as HTMLInputElement | null;
      expandToggle?.addEventListener('change', () => {
        this.expandAllDetails = expandToggle.checked;
        this.render();
      });

      root.querySelectorAll<HTMLElement>('[data-event-id]').forEach((card) => {
        card.addEventListener('click', () => {
          const eventId = card.dataset.eventId;
          if (!eventId) {
            return;
          }

          this.selectedEventId = this.selectedEventId === eventId ? undefined : eventId;
          this.render();
        });
      });
    }

    init($el: unknown) {
      super.init($el);
      this.panel = $el as ErudaPanelElement;
      window.addEventListener(INSPECTRA_WEBSOCKET_EVENT, this.onUpdate);
      this.render();
    }

    render() {
      if (!this.panel) {
        return;
      }

      const state = getInspectraWebSocketState();
      const recent = [...state.websocketEvents].reverse();
      const header = buildHeaderStats(state.websocketEvents)
        .map(
          ([label, value]) => `
            <div class="inspectra-header-stat">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `
        )
        .join('');
      const selectedEvent = state.websocketEvents.find((event) => event.id === this.selectedEventId);
      const rows =
        recent.length === 0
          ? '<div class="inspectra-empty">No WebSocket activity yet.</div>'
          : recent
              .map((event) => {
                const showDetails = this.expandAllDetails || this.selectedEventId === event.id;
                const summary = summarizeEvent(event)
                  .map(
                    ([label, value]) => `
                      <span class="inspectra-chip">
                        <strong>${escapeHtml(label)}</strong>
                        <span>${escapeHtml(value)}</span>
                      </span>
                    `
                  )
                  .join('');
                const preview = summarizePreview(event.data);

                return `
                  <article
                    class="inspectra-card${showDetails ? ' is-selected' : ''}"
                    data-event-id="${escapeHtml(event.id)}"
                  >
                    <div class="inspectra-row">
                      <strong>${escapeHtml(event.phase)}</strong>
                      <span>${escapeHtml(formatTimestamp(event.ts))}</span>
                    </div>
                    <div class="inspectra-peer">${escapeHtml(formatMetric(event.data.url, event.socketId))}</div>
                    ${summary ? `<div class="inspectra-chip-row">${summary}</div>` : ''}
                    ${preview ? `<div class="inspectra-preview">${escapeHtml(preview)}</div>` : ''}
                    <div class="inspectra-card-footer">
                      <span>${showDetails ? 'Hide details' : 'Show details'}</span>
                    </div>
                    ${showDetails ? `<pre>${formatData(event.data)}</pre>` : ''}
                  </article>
                `;
              })
              .join('');
      const toolbar = `
        <div class="inspectra-toolbar">
          <div class="inspectra-session">Session: ${escapeHtml(state.sessionId || 'N/A')}</div>
          <label class="inspectra-toggle">
            <input
              type="checkbox"
              data-role="expand-details"
              ${this.expandAllDetails ? 'checked' : ''}
            />
            <span>Expand details</span>
          </label>
        </div>
        <div class="inspectra-selection">
          ${
            selectedEvent
              ? `Selected: ${escapeHtml(selectedEvent.phase)} at ${escapeHtml(
                  formatTimestamp(selectedEvent.ts)
                )}`
              : 'Select an item to inspect the full payload metadata.'
          }
        </div>
      `;
      const viewportAnchor = this.captureViewportAnchor();

      this.panel.html(`
        <div class="inspectra-websocket">
          <style>
            .inspectra-websocket {
              height: 100%;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              color: inherit;
            }
            .inspectra-header {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 8px;
              padding: 10px;
              border-bottom: 1px solid rgba(127,127,127,0.2);
              background: inherit;
              position: sticky;
              top: 0;
              z-index: 2;
            }
            .inspectra-header-stat {
              display: grid;
              gap: 2px;
              min-width: 0;
            }
            .inspectra-header-stat span {
              opacity: 0.68;
              font-size: 11px;
            }
            .inspectra-header-stat strong {
              font-size: 12px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .inspectra-scroll {
              flex: 1;
              min-height: 0;
              overflow: auto;
              box-sizing: border-box;
              padding: 0 10px 10px;
            }
            .inspectra-toolbar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              padding: 10px;
              margin: 0 -10px;
              border-bottom: 1px solid var(--border, rgba(127,127,127,0.2));
              background: var(--darker-background, rgba(127,127,127,0.06));
            }
            .inspectra-session {
              opacity: 0.72;
              font-size: 12px;
              word-break: break-word;
            }
            .inspectra-toggle {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              font-size: 12px;
              cursor: pointer;
              user-select: none;
              white-space: nowrap;
            }
            .inspectra-selection {
              padding: 10px;
              margin: 0 -10px 8px;
              opacity: 0.72;
              font-size: 12px;
              border-bottom: 1px solid var(--border, rgba(127,127,127,0.2));
            }
            .inspectra-card {
              position: relative;
              padding: 10px 12px;
              margin-bottom: 12px;
              border: 1px solid var(--border, rgba(127,127,127,0.28));
              border-radius: 6px;
              background: var(--background, transparent);
              overflow: hidden;
              cursor: pointer;
              box-shadow: inset 0 0 0 1px rgba(127,127,127,0.05);
            }
            .inspectra-card.is-selected {
              background: rgba(127,127,127,0.12);
              border-color: var(--accent, rgba(127,127,127,0.35));
              box-shadow:
                0 0 0 1px var(--accent, rgba(127,127,127,0.28)),
                inset 0 0 0 1px rgba(127,127,127,0.16);
            }
            .inspectra-row {
              display: flex;
              justify-content: space-between;
              gap: 8px;
              margin-bottom: 6px;
              padding-bottom: 6px;
              border-bottom: 1px solid rgba(127,127,127,0.14);
              align-items: baseline;
            }
            .inspectra-row strong {
              color: var(--primary, inherit);
              font-size: 12px;
              font-weight: 600;
              text-transform: capitalize;
            }
            .inspectra-row span {
              font-size: 11px;
              opacity: 0.72;
            }
            .inspectra-peer {
              font-size: 12px;
              opacity: 0.78;
              margin-bottom: 6px;
              padding-bottom: 6px;
              border-bottom: 1px solid rgba(127,127,127,0.14);
              word-break: break-word;
            }
            .inspectra-chip-row {
              display: flex;
              flex-wrap: wrap;
              gap: 6px;
              margin-bottom: 6px;
              padding-bottom: 6px;
              border-bottom: 1px solid rgba(127,127,127,0.14);
            }
            .inspectra-chip {
              display: inline-flex;
              gap: 7px;
              align-items: center;
              padding: 2px 6px;
              border-radius: 999px;
              border: 1px solid var(--border, rgba(127,127,127,0.18));
              background: var(--darker-background, rgba(127,127,127,0.06));
              font-size: 10px;
              box-sizing: border-box;
            }
            .inspectra-chip strong {
              opacity: 0.72;
              font-weight: 500;
              font-size: 10px;
              letter-spacing: 0.01em;
              text-transform: lowercase;
            }
            .inspectra-chip span {
              font-size: 10px;
              font-weight: 400;
            }
            .inspectra-preview {
              margin-bottom: 6px;
              padding-bottom: 6px;
              border-bottom: 1px solid rgba(127,127,127,0.14);
              font-size: 11px;
              opacity: 0.78;
              word-break: break-word;
            }
            .inspectra-card-footer {
              margin-top: 2px;
              margin-bottom: 0;
              opacity: 0.68;
              font-size: 11px;
              color: var(--primary, inherit);
            }
            .inspectra-websocket pre {
              margin: 6px 0 0;
              white-space: pre-wrap;
              word-break: break-word;
              font-size: 11px;
              line-height: 1.45;
              max-height: 220px;
              overflow: auto;
              padding: 10px;
              border-bottom: 1px solid var(--border, rgba(127,127,127,0.2));
              color: var(--foreground, inherit);
              background: var(--background, transparent);
            }
            .inspectra-empty {
              padding: 10px;
              opacity: 0.72;
              font-size: 12px;
            }
          </style>
          <div class="inspectra-header">${header}</div>
          <div class="inspectra-scroll">
            ${toolbar}
            ${rows}
          </div>
        </div>
      `);

      requestAnimationFrame(() => {
        this.bindScrollState();
        this.restoreViewportAnchor(viewportAnchor);
        this.bindInteractionState();
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
      window.removeEventListener(INSPECTRA_WEBSOCKET_EVENT, this.onUpdate);
      this.scrollBoundElement?.removeEventListener('scroll', this.onScroll);
      super.destroy();
    }
  }

  return new InspectraWebSocketTool();
};
