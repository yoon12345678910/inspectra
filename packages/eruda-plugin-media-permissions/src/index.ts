import type eruda from 'eruda';

export const INSPECTRA_MEDIA_PERMISSIONS_EVENT = 'inspectra:media-permissions:update';
const STORE_KEY = '__INSPECTRA_ERUDA_STATE__';

export type MediaPermissionStateValue =
  | PermissionState
  | 'unsupported'
  | 'unknown'
  | 'error';

export interface MediaPermissionRequest {
  ts: number;
  audio: boolean;
  video: boolean;
  outcome: 'pending' | 'granted' | 'denied' | 'error';
  errorName?: string;
  errorMessage?: string;
}

export interface MediaPermissionSnapshot {
  secureContext: boolean;
  permissionsApiSupported: boolean;
  camera: MediaPermissionStateValue;
  microphone: MediaPermissionStateValue;
  devices: {
    audioInputs: number;
    audioOutputs: number;
    videoInputs: number;
  };
  lastUpdated: number;
  lastRequest?: MediaPermissionRequest;
}

export interface InspectraMediaPermissionsState {
  sessionId: string;
  mediaPermissions: MediaPermissionSnapshot;
}

type ErudaPanelElement = {
  html(value: string): void;
  show(): void;
  hide(): void;
};

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

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) {
    return 'N/A';
  }

  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const formatStateTone = (value: MediaPermissionStateValue) => {
  switch (value) {
    case 'granted':
      return 'is-good';
    case 'denied':
      return 'is-bad';
    case 'prompt':
      return 'is-warn';
    default:
      return 'is-neutral';
  }
};

export const createDefaultMediaPermissionSnapshot = (): MediaPermissionSnapshot => ({
  secureContext: window.isSecureContext,
  permissionsApiSupported: typeof navigator !== 'undefined' && 'permissions' in navigator,
  camera: 'unknown',
  microphone: 'unknown',
  devices: {
    audioInputs: 0,
    audioOutputs: 0,
    videoInputs: 0
  },
  lastUpdated: Date.now()
});

export const getInspectraMediaPermissionsState = (): InspectraMediaPermissionsState => {
  const store = window[STORE_KEY] ?? {};
  return {
    sessionId: typeof store.sessionId === 'string' ? store.sessionId : '',
    mediaPermissions:
      typeof store.mediaPermissions === 'object' && store.mediaPermissions !== null
        ? (store.mediaPermissions as MediaPermissionSnapshot)
        : createDefaultMediaPermissionSnapshot()
  };
};

export const createErudaMediaPermissionsPlugin = () => (erudaApi: typeof eruda) => {
  class InspectraMediaPermissionsTool extends erudaApi.Tool {
    name = 'media';
    private panel?: ErudaPanelElement;
    private onUpdate = () => this.render();

    init($el: unknown) {
      super.init($el);
      this.panel = $el as ErudaPanelElement;
      window.addEventListener(INSPECTRA_MEDIA_PERMISSIONS_EVENT, this.onUpdate);
      this.render();
    }

    render() {
      if (!this.panel) {
        return;
      }

      const state = getInspectraMediaPermissionsState();
      const snapshot = state.mediaPermissions;
      const request = snapshot.lastRequest;

      this.panel.html(`
        <div class="inspectra-media">
          <style>
            .inspectra-media {
              padding: 10px;
              color: inherit;
              box-sizing: border-box;
            }
            .inspectra-section {
              margin-bottom: 12px;
              border: 1px solid var(--border, rgba(127,127,127,0.22));
              border-radius: 6px;
              overflow: hidden;
              background: var(--background, transparent);
            }
            .inspectra-section-title {
              padding: 10px;
              font-size: 12px;
              font-weight: 600;
              color: var(--primary, inherit);
              border-bottom: 1px solid var(--border, rgba(127,127,127,0.18));
              background: var(--darker-background, rgba(127,127,127,0.05));
            }
            .inspectra-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 8px;
              padding: 10px;
            }
            .inspectra-card {
              border: 1px solid var(--border, rgba(127,127,127,0.18));
              border-radius: 6px;
              padding: 10px;
              display: grid;
              gap: 4px;
            }
            .inspectra-card span {
              font-size: 11px;
              opacity: 0.7;
            }
            .inspectra-card strong {
              font-size: 13px;
            }
            .inspectra-card.is-good strong { color: #39b54a; }
            .inspectra-card.is-bad strong { color: #ff5f56; }
            .inspectra-card.is-warn strong { color: #f4b400; }
            .inspectra-card.is-neutral strong { color: inherit; }
            .inspectra-list {
              display: grid;
              gap: 8px;
              padding: 10px;
            }
            .inspectra-row {
              display: flex;
              justify-content: space-between;
              gap: 10px;
              font-size: 12px;
            }
            .inspectra-row span:first-child {
              opacity: 0.72;
            }
            .inspectra-meta {
              padding: 0 10px 10px;
              font-size: 11px;
              opacity: 0.72;
            }
          </style>
          <div class="inspectra-section">
            <div class="inspectra-section-title">Permissions</div>
            <div class="inspectra-grid">
              <div class="inspectra-card ${formatStateTone(snapshot.camera)}">
                <span>Camera</span>
                <strong>${escapeHtml(snapshot.camera)}</strong>
              </div>
              <div class="inspectra-card ${formatStateTone(snapshot.microphone)}">
                <span>Microphone</span>
                <strong>${escapeHtml(snapshot.microphone)}</strong>
              </div>
              <div class="inspectra-card ${snapshot.secureContext ? 'is-good' : 'is-bad'}">
                <span>Secure Context</span>
                <strong>${escapeHtml(String(snapshot.secureContext))}</strong>
              </div>
              <div class="inspectra-card ${snapshot.permissionsApiSupported ? 'is-good' : 'is-neutral'}">
                <span>Permissions API</span>
                <strong>${escapeHtml(String(snapshot.permissionsApiSupported))}</strong>
              </div>
            </div>
            <div class="inspectra-meta">
              Session: ${escapeHtml(state.sessionId || 'N/A')} · Updated ${escapeHtml(
                formatTimestamp(snapshot.lastUpdated)
              )}
            </div>
          </div>
          <div class="inspectra-section">
            <div class="inspectra-section-title">Devices</div>
            <div class="inspectra-list">
              <div class="inspectra-row"><span>Audio inputs</span><strong>${escapeHtml(
                String(snapshot.devices.audioInputs)
              )}</strong></div>
              <div class="inspectra-row"><span>Audio outputs</span><strong>${escapeHtml(
                String(snapshot.devices.audioOutputs)
              )}</strong></div>
              <div class="inspectra-row"><span>Video inputs</span><strong>${escapeHtml(
                String(snapshot.devices.videoInputs)
              )}</strong></div>
            </div>
          </div>
          <div class="inspectra-section">
            <div class="inspectra-section-title">Last getUserMedia</div>
            <div class="inspectra-list">
              <div class="inspectra-row"><span>Status</span><strong>${escapeHtml(
                request?.outcome ?? 'none'
              )}</strong></div>
              <div class="inspectra-row"><span>Audio requested</span><strong>${escapeHtml(
                String(request?.audio ?? false)
              )}</strong></div>
              <div class="inspectra-row"><span>Video requested</span><strong>${escapeHtml(
                String(request?.video ?? false)
              )}</strong></div>
              <div class="inspectra-row"><span>At</span><strong>${escapeHtml(
                formatTimestamp(request?.ts)
              )}</strong></div>
              ${
                request?.errorName
                  ? `<div class="inspectra-row"><span>Error</span><strong>${escapeHtml(
                      request.errorName
                    )}</strong></div>`
                  : ''
              }
            </div>
          </div>
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
      window.removeEventListener(INSPECTRA_MEDIA_PERMISSIONS_EVENT, this.onUpdate);
      super.destroy();
    }
  }

  return new InspectraMediaPermissionsTool();
};
