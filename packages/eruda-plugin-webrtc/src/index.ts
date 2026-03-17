import type eruda from 'eruda';

export const INSPECTRA_WEBRTC_EVENT = 'inspectra:webrtc:update';
const STORE_KEY = '__INSPECTRA_ERUDA_STATE__';

export interface WebRtcEvent {
  id: string;
  type: 'webrtc';
  ts: number;
  sessionId: string;
  pageUrl: string;
  peerId: string;
  phase: 'created' | 'state-change' | 'stats' | 'closed';
  data: Record<string, unknown>;
}

type ErudaPanelElement = {
  html(value: string): void;
  show(): void;
  hide(): void;
};

export interface InspectraErudaState {
  sessionId: string;
  webrtcEvents: WebRtcEvent[];
}

declare global {
  interface Window {
    __INSPECTRA_ERUDA_STATE__?: InspectraErudaState;
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

const formatMetric = (value: unknown, suffix = '') => {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }

  if (typeof value === 'number') {
    const rounded = Math.round(value * 100) / 100;
    return `${rounded}${suffix}`;
  }

  return `${String(value)}${suffix}`;
};

const summarizeEvent = (event: WebRtcEvent) => {
  const data = event.data;
  return [
    ['connection', formatMetric(data.connectionState)],
    ['ice', formatMetric(data.iceConnectionState)],
    ['signal', formatMetric(data.signalingState)],
    ['rtt', formatMetric(data.currentRoundTripTime, 's')],
    ['jitter', formatMetric(data.jitter)],
    ['lost', formatMetric(data.packetsLost)],
    ['fps', formatMetric(data.framesPerSecond)],
    ['dropped', formatMetric(data.framesDropped)]
  ]
    .filter(([, value]) => value !== 'N/A')
    .slice(0, 6);
};

const buildHeaderStats = (events: WebRtcEvent[]) => {
  const peerIds = new Set(events.map((event) => event.peerId));
  const latest = events[events.length - 1];

  return [
    ['Peers', String(peerIds.size)],
    ['Events', String(events.length)],
    ['Last phase', latest ? latest.phase : 'N/A'],
    ['Last update', latest ? new Date(latest.ts).toLocaleTimeString() : 'N/A']
  ];
};

export const getInspectraErudaState = (): InspectraErudaState => {
  if (!window[STORE_KEY]) {
    window[STORE_KEY] = {
      sessionId: '',
      webrtcEvents: []
    };
  }

  return window[STORE_KEY];
};

export const createErudaWebRtcPlugin = () => (erudaApi: typeof eruda) => {
  class InspectraWebRtcTool extends erudaApi.Tool {
    name = 'webrtc';
    private panel?: ErudaPanelElement;
    private onUpdate = () => this.render();
    private scrollTop = 0;

    private findScrollContainer() {
      return document.querySelector('.inspectra-webrtc .inspectra-scroll') as HTMLElement | null;
    }

    private bindScrollState() {
      const container = this.findScrollContainer();
      if (!container) {
        return;
      }

      container.scrollTop = this.scrollTop;
      container.addEventListener(
        'scroll',
        () => {
          this.scrollTop = container.scrollTop;
        },
        { passive: true }
      );
    }

    init($el: unknown) {
      super.init($el);
      this.panel = $el as ErudaPanelElement;
      window.addEventListener(INSPECTRA_WEBRTC_EVENT, this.onUpdate);
      this.render();
    }

    render() {
      if (!this.panel) {
        return;
      }

      const state = getInspectraErudaState();
      const recent = [...state.webrtcEvents].reverse().slice(0, 12);
      const headerStats = buildHeaderStats(state.webrtcEvents);
      const rows =
        recent.length === 0
          ? '<div class="inspectra-empty">No RTCPeerConnection activity yet.</div>'
          : recent
              .map(
                (event) => {
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

                  return `
                  <article class="inspectra-card">
                    <div class="inspectra-row">
                      <strong>${escapeHtml(event.phase)}</strong>
                      <span>${escapeHtml(new Date(event.ts).toLocaleTimeString())}</span>
                    </div>
                    <div class="inspectra-peer">${escapeHtml(event.peerId)}</div>
                    ${summary ? `<div class="inspectra-chip-row">${summary}</div>` : ''}
                    <pre>${formatData(event.data)}</pre>
                  </article>
                `
                }
              )
              .join('');

      const header = headerStats
        .map(
          ([label, value]) => `
            <div class="inspectra-header-stat">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `
        )
        .join('');

      const previousScrollTop = this.findScrollContainer()?.scrollTop ?? this.scrollTop;
      this.scrollTop = previousScrollTop;

      this.panel.html(`
        <div class="inspectra-webrtc">
          <style>
            .inspectra-webrtc {
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
              padding: 10px;
              box-sizing: border-box;
            }
            .inspectra-meta {
              margin-bottom: 10px;
              opacity: 0.72;
              font-size: 12px;
            }
            .inspectra-card {
              border: 1px solid rgba(127,127,127,0.25);
              border-radius: 8px;
              padding: 10px;
              margin-bottom: 10px;
              overflow: hidden;
            }
            .inspectra-row {
              display: flex;
              justify-content: space-between;
              gap: 8px;
              margin-bottom: 6px;
            }
            .inspectra-peer {
              font-size: 12px;
              opacity: 0.78;
              margin-bottom: 8px;
              word-break: break-word;
            }
            .inspectra-chip-row {
              display: flex;
              flex-wrap: wrap;
              gap: 6px;
              margin-bottom: 8px;
            }
            .inspectra-chip {
              display: inline-flex;
              gap: 6px;
              align-items: center;
              padding: 4px 6px;
              border-radius: 999px;
              background: rgba(127,127,127,0.14);
              font-size: 11px;
            }
            .inspectra-chip strong {
              opacity: 0.72;
              font-weight: 600;
            }
            .inspectra-webrtc pre {
              margin: 0;
              white-space: pre-wrap;
              word-break: break-word;
              font-size: 11px;
              line-height: 1.45;
              max-height: 220px;
              overflow: auto;
            }
            .inspectra-empty {
              opacity: 0.72;
              font-size: 12px;
            }
          </style>
          <div class="inspectra-header">${header}</div>
          <div class="inspectra-scroll">
            <div class="inspectra-meta">Session: ${escapeHtml(state.sessionId || 'N/A')}</div>
            ${rows}
          </div>
        </div>
      `);

      requestAnimationFrame(() => {
        this.bindScrollState();
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
      window.removeEventListener(INSPECTRA_WEBRTC_EVENT, this.onUpdate);
      super.destroy();
    }
  }

  return new InspectraWebRtcTool();
};
