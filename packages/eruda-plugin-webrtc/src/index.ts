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
      const rows =
        recent.length === 0
          ? '<div class="inspectra-empty">No RTCPeerConnection activity yet.</div>'
          : recent
              .map(
                (event) => `
                  <article class="inspectra-card">
                    <div class="inspectra-row">
                      <strong>${escapeHtml(event.phase)}</strong>
                      <span>${escapeHtml(new Date(event.ts).toLocaleTimeString())}</span>
                    </div>
                    <div class="inspectra-peer">${escapeHtml(event.peerId)}</div>
                    <pre>${formatData(event.data)}</pre>
                  </article>
                `
              )
              .join('');

      this.panel.html(`
        <div class="inspectra-webrtc">
          <style>
            .inspectra-webrtc { padding: 10px; color: inherit; }
            .inspectra-meta { margin-bottom: 10px; opacity: 0.72; font-size: 12px; }
            .inspectra-card {
              border: 1px solid rgba(127,127,127,0.25);
              border-radius: 8px;
              padding: 10px;
              margin-bottom: 10px;
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
            .inspectra-webrtc pre {
              margin: 0;
              white-space: pre-wrap;
              word-break: break-word;
              font-size: 11px;
              line-height: 1.45;
            }
            .inspectra-empty {
              opacity: 0.72;
              font-size: 12px;
            }
          </style>
          <div class="inspectra-meta">Session: ${escapeHtml(state.sessionId || 'N/A')}</div>
          ${rows}
        </div>
      `);
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
