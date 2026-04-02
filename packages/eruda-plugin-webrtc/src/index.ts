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
  phase:
    | 'created'
    | 'state-change'
    | 'stats'
    | 'closed'
    | 'ice-candidate'
    | 'sdp'
    | 'track';
  data: Record<string, unknown>;
}

export interface DeviceInfo {
  deviceId: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  label: string;
  groupId: string;
}

type ErudaPanelElement = {
  html(value: string): void;
  show(): void;
  hide(): void;
};

export interface InspectraErudaState {
  sessionId: string;
  webrtcEvents: WebRtcEvent[];
  webrtcDevices?: DeviceInfo[];
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
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

const formatDuration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
};

const formatBytes = (bytes: unknown) => {
  if (typeof bytes !== 'number') return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatBitrate = (bps: unknown) => {
  if (typeof bps !== 'number' || bps <= 0) return '';
  if (bps < 1000) return `${bps.toFixed(0)} bps`;
  if (bps < 1_000_000) return `${(bps / 1000).toFixed(1)} Kbps`;
  return `${(bps / 1_000_000).toFixed(1)} Mbps`;
};

type TabId = 'devices' | 'peers' | 'tracks';

interface PeerInfo {
  peerId: string;
  connectionState: string;
  iceState: string;
  signalingState: string;
  firstSeen: number;
  lastSeen: number;
  closed: boolean;
}

interface StatsPoint {
  ts: number;
  rtt: number | null;
  bitrateSent: number | null;
  bitrateRecv: number | null;
}

export const getInspectraErudaState = (): InspectraErudaState => {
  const store = window[STORE_KEY] ?? {};
  return {
    sessionId: typeof store.sessionId === 'string' ? store.sessionId : '',
    webrtcEvents: Array.isArray(store.webrtcEvents)
      ? (store.webrtcEvents as WebRtcEvent[])
      : [],
    webrtcDevices: Array.isArray(store.webrtcDevices)
      ? (store.webrtcDevices as DeviceInfo[])
      : undefined
  };
};

/* ── CSS ── */

const CSS = `
.rtc-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: inherit;
  box-sizing: border-box;
}

/* tabs bar */
.rtc-tabs {
  display: flex;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  flex-shrink: 0;
}
.rtc-tab {
  padding: 7px 14px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: inherit;
  opacity: .55;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}
.rtc-tab.is-active {
  opacity: 1;
  border-bottom-color: var(--accent, #4a90d9);
}

/* scroll container */
.rtc-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
}

/* ── devices tab ── */
.rtc-device-group {
  margin-bottom: 12px;
}
.rtc-device-group-title {
  font-size: 11px;
  font-weight: 600;
  opacity: .6;
  text-transform: uppercase;
  letter-spacing: .04em;
  margin-bottom: 6px;
}
.rtc-device-item {
  padding: 6px 8px;
  border: 1px solid var(--border, rgba(127,127,127,.15));
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 11px;
}
.rtc-device-label {
  font-weight: 500;
  margin-bottom: 2px;
}
.rtc-device-id {
  opacity: .5;
  font-size: 10px;
  word-break: break-all;
}

/* ── peers tab ── */
.rtc-peer-select-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  background: var(--darker-background, rgba(127,127,127,.06));
  flex-shrink: 0;
}
.rtc-peer-select {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid var(--border, rgba(127,127,127,.2));
  border-radius: 4px;
  background: var(--background, transparent);
  color: inherit;
  font-size: 11px;
}
.rtc-peer-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.rtc-peer-dot.is-connected { background: #39b54a; }
.rtc-peer-dot.is-closed { background: #999; }
.rtc-peer-dot.is-connecting { background: #f4b400; }
.rtc-peer-dot.is-failed { background: #ff5f56; }

/* sections inside peers */
.rtc-section {
  margin-bottom: 14px;
}
.rtc-section-title {
  font-size: 11px;
  font-weight: 600;
  opacity: .6;
  text-transform: uppercase;
  margin-bottom: 6px;
  letter-spacing: .04em;
}
.rtc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 6px;
}
.rtc-stat-box {
  padding: 6px 8px;
  border: 1px solid var(--border, rgba(127,127,127,.15));
  border-radius: 4px;
  text-align: center;
}
.rtc-stat-value {
  font-size: 14px;
  font-weight: 600;
}
.rtc-stat-label {
  font-size: 10px;
  opacity: .55;
  margin-top: 2px;
}
.rtc-stat-value.is-good { color: #39b54a; }
.rtc-stat-value.is-warn { color: #f4b400; }
.rtc-stat-value.is-bad { color: #ff5f56; }

/* mini table for ICE/codecs */
.rtc-mini-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 11px;
}
.rtc-mini-table th {
  text-align: left;
  padding: 3px 6px;
  font-weight: 500;
  opacity: .6;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  white-space: nowrap;
}
.rtc-mini-table td {
  padding: 3px 6px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.08));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rtc-mini-table tr.is-active td {
  background: rgba(57,181,74,.08);
}

/* SDP viewer */
.rtc-sdp-toggle {
  display: flex;
  gap: 0;
  margin-bottom: 6px;
}
.rtc-sdp-btn {
  padding: 4px 10px;
  border: 1px solid var(--border, rgba(127,127,127,.2));
  background: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
  opacity: .6;
}
.rtc-sdp-btn:first-child { border-radius: 4px 0 0 4px; }
.rtc-sdp-btn:last-child { border-radius: 0 4px 4px 0; }
.rtc-sdp-btn.is-active {
  opacity: 1;
  background: var(--accent, #4a90d9);
  color: #fff;
  border-color: var(--accent, #4a90d9);
}
.rtc-sdp-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 10px;
  line-height: 1.5;
  max-height: 200px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border, rgba(127,127,127,.15));
  border-radius: 4px;
  background: var(--darker-background, rgba(127,127,127,.04));
}

/* graph */
.rtc-graph-wrap {
  height: 60px;
  position: relative;
  border: 1px solid var(--border, rgba(127,127,127,.15));
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 4px;
}
.rtc-graph-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.rtc-graph-legend {
  display: flex;
  gap: 12px;
  font-size: 10px;
  opacity: .6;
}
.rtc-graph-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 3px;
  vertical-align: middle;
}

/* ── tracks tab ── */
.rtc-track-card {
  padding: 8px;
  border: 1px solid var(--border, rgba(127,127,127,.15));
  border-radius: 4px;
  margin-bottom: 6px;
  cursor: pointer;
}
.rtc-track-card.is-selected {
  background: rgba(127,127,127,.08);
  border-color: var(--accent, rgba(127,127,127,.35));
}
.rtc-track-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.rtc-track-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
}
.rtc-track-name {
  font-weight: 500;
  font-size: 11px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rtc-track-state {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid;
}
.rtc-track-state.is-live { color: #39b54a; border-color: #39b54a; }
.rtc-track-state.is-ended { color: #999; border-color: #999; }
.rtc-track-detail {
  font-size: 11px;
  padding-top: 6px;
  border-top: 1px solid var(--border, rgba(127,127,127,.1));
  margin-top: 6px;
}
.rtc-track-detail dt {
  display: inline;
  opacity: .55;
}
.rtc-track-detail dt::after { content: ': '; }
.rtc-track-detail dd {
  display: inline;
  margin: 0;
}
.rtc-track-detail dd::after { content: '\\A'; white-space: pre; }

.rtc-empty {
  padding: 20px 10px;
  text-align: center;
  opacity: .5;
  font-size: 12px;
}
.rtc-kv-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 11px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.06));
}
.rtc-kv-label { opacity: .55; }
.rtc-kv-value { font-weight: 500; text-align: right; }
`;

/* ── plugin ── */

export const createErudaWebRtcPlugin = () => (erudaApi: typeof eruda) => {
  class InspectraWebRtcTool extends erudaApi.Tool {
    name = 'webrtc';
    private panel?: ErudaPanelElement;
    private onUpdate = () => this.render();

    private activeTab: TabId = 'peers';
    private selectedPeerId: string | null = null;
    private selectedTrackId: string | null = null;
    private sdpView: 'local' | 'remote' = 'local';
    private scrollTop = 0;

    // Stats history per peer for graph
    private statsHistory = new Map<string, StatsPoint[]>();
    private prevBytesSent = new Map<string, number>();
    private prevBytesRecv = new Map<string, number>();
    private prevStatsTs = new Map<string, number>();

    private getPeerList(events: WebRtcEvent[]): PeerInfo[] {
      const map = new Map<string, PeerInfo>();
      for (const e of events) {
        let info = map.get(e.peerId);
        if (!info) {
          info = {
            peerId: e.peerId,
            connectionState: 'new',
            iceState: 'new',
            signalingState: 'stable',
            firstSeen: e.ts,
            lastSeen: e.ts,
            closed: false
          };
          map.set(e.peerId, info);
        }
        info.lastSeen = e.ts;
        if (typeof e.data.connectionState === 'string') info.connectionState = e.data.connectionState;
        if (typeof e.data.iceConnectionState === 'string') info.iceState = e.data.iceConnectionState;
        if (typeof e.data.signalingState === 'string') info.signalingState = e.data.signalingState;
        if (e.phase === 'closed') info.closed = true;
      }
      return [...map.values()];
    }

    private getPeerDotClass(peer: PeerInfo): string {
      if (peer.closed || peer.connectionState === 'closed') return 'is-closed';
      if (peer.connectionState === 'connected') return 'is-connected';
      if (peer.connectionState === 'failed') return 'is-failed';
      return 'is-connecting';
    }

    private getLatestStats(events: WebRtcEvent[], peerId: string): Record<string, unknown> {
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i]!.peerId === peerId && events[i]!.phase === 'stats') {
          return events[i]!.data;
        }
      }
      return {};
    }

    private getIceCandidates(events: WebRtcEvent[], peerId: string): WebRtcEvent[] {
      return events.filter((e) => e.peerId === peerId && e.phase === 'ice-candidate');
    }

    private getSdpEvents(events: WebRtcEvent[], peerId: string): { local?: string; remote?: string } {
      let local: string | undefined;
      let remote: string | undefined;
      for (const e of events) {
        if (e.peerId !== peerId || e.phase !== 'sdp') continue;
        if (e.data.direction === 'local') local = e.data.sdp as string;
        if (e.data.direction === 'remote') remote = e.data.sdp as string;
      }
      return { local, remote };
    }

    private getTrackEvents(events: WebRtcEvent[], peerId?: string): WebRtcEvent[] {
      return events.filter((e) => e.phase === 'track' && (!peerId || e.peerId === peerId));
    }

    private updateStatsHistory(events: WebRtcEvent[], peerId: string) {
      const statsEvents = events.filter((e) => e.peerId === peerId && e.phase === 'stats');
      const history: StatsPoint[] = [];

      for (const e of statsEvents) {
        const rtt = typeof e.data.currentRoundTripTime === 'number'
          ? e.data.currentRoundTripTime * 1000
          : null;

        const bytesSent = typeof e.data.bytesSent === 'number' ? e.data.bytesSent : 0;
        const bytesRecv = typeof e.data.bytesReceived === 'number' ? e.data.bytesReceived : 0;

        const prevSent = this.prevBytesSent.get(peerId) ?? bytesSent;
        const prevRecv = this.prevBytesRecv.get(peerId) ?? bytesRecv;
        const prevTs = this.prevStatsTs.get(peerId) ?? e.ts;
        const dtSec = (e.ts - prevTs) / 1000 || 1;

        const bitrateSent = ((bytesSent - prevSent) * 8) / dtSec;
        const bitrateRecv = ((bytesRecv - prevRecv) * 8) / dtSec;

        this.prevBytesSent.set(peerId, bytesSent);
        this.prevBytesRecv.set(peerId, bytesRecv);
        this.prevStatsTs.set(peerId, e.ts);

        history.push({
          ts: e.ts,
          rtt,
          bitrateSent: bitrateSent > 0 ? bitrateSent : null,
          bitrateRecv: bitrateRecv > 0 ? bitrateRecv : null
        });
      }

      // Keep last 60 points (~2 minutes at 2s interval)
      this.statsHistory.set(peerId, history.slice(-60));
    }

    private renderGraph(peerId: string): string {
      const points = this.statsHistory.get(peerId) ?? [];
      if (points.length < 2) return '';

      const W = 300;
      const H = 55;
      const maxRtt = Math.max(...points.map((p) => p.rtt ?? 0), 10);
      const maxBitrate = Math.max(
        ...points.map((p) => Math.max(p.bitrateSent ?? 0, p.bitrateRecv ?? 0)),
        1000
      );

      const buildPath = (getValue: (p: StatsPoint) => number | null, maxVal: number) => {
        const pts = points
          .map((p, i) => {
            const v = getValue(p);
            if (v === null) return null;
            const x = (i / (points.length - 1)) * W;
            const y = H - (v / maxVal) * (H - 4) - 2;
            return `${x},${y}`;
          })
          .filter(Boolean);
        return pts.length > 1 ? `M${pts.join('L')}` : '';
      };

      const rttPath = buildPath((p) => p.rtt, maxRtt);
      const sentPath = buildPath((p) => p.bitrateSent, maxBitrate);
      const recvPath = buildPath((p) => p.bitrateRecv, maxBitrate);

      const lastP = points[points.length - 1]!;
      const rttLabel = lastP.rtt !== null ? `${lastP.rtt.toFixed(0)}ms` : '';
      const sentLabel = lastP.bitrateSent ? formatBitrate(lastP.bitrateSent) : '';
      const recvLabel = lastP.bitrateRecv ? formatBitrate(lastP.bitrateRecv) : '';

      return `
        <div class="rtc-section">
          <div class="rtc-section-title">Real-time Stats</div>
          <div class="rtc-graph-wrap">
            <svg class="rtc-graph-canvas" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
              ${rttPath ? `<path d="${rttPath}" fill="none" stroke="#4a90d9" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` : ''}
              ${sentPath ? `<path d="${sentPath}" fill="none" stroke="#39b54a" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''}
              ${recvPath ? `<path d="${recvPath}" fill="none" stroke="#e74c3c" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''}
            </svg>
          </div>
          <div class="rtc-graph-legend">
            <span><span class="rtc-graph-dot" style="background:#4a90d9"></span>RTT ${escapeHtml(rttLabel)}</span>
            <span><span class="rtc-graph-dot" style="background:#39b54a"></span>Sent ${escapeHtml(sentLabel)}</span>
            <span><span class="rtc-graph-dot" style="background:#e74c3c"></span>Recv ${escapeHtml(recvLabel)}</span>
          </div>
        </div>
      `;
    }

    private rttClass(rtt: unknown): string {
      if (typeof rtt !== 'number') return '';
      const ms = rtt * 1000;
      if (ms < 100) return 'is-good';
      if (ms < 300) return 'is-warn';
      return 'is-bad';
    }

    /* ── tab renderers ── */

    private renderDevicesTab(devices: DeviceInfo[] | undefined): string {
      if (!devices || devices.length === 0) {
        return '<div class="rtc-empty">No devices detected. Grant camera/microphone permission to see device labels.</div>';
      }

      const groups: Record<string, DeviceInfo[]> = {
        videoinput: [],
        audioinput: [],
        audiooutput: []
      };
      for (const d of devices) {
        (groups[d.kind] ??= []).push(d);
      }

      const titles: Record<string, string> = {
        videoinput: 'Video Input',
        audioinput: 'Audio Input',
        audiooutput: 'Audio Output'
      };

      let html = '';
      for (const [kind, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<div class="rtc-device-group">`;
        html += `<div class="rtc-device-group-title">${escapeHtml(titles[kind] ?? kind)} (${items.length})</div>`;
        for (const d of items) {
          const label = d.label || '(unnamed device)';
          html += `<div class="rtc-device-item">
            <div class="rtc-device-label">${escapeHtml(label)}</div>
            <div class="rtc-device-id">${escapeHtml(d.deviceId.slice(0, 24))}…</div>
          </div>`;
        }
        html += '</div>';
      }
      return html;
    }

    private renderPeersTab(events: WebRtcEvent[], peers: PeerInfo[]): string {
      if (peers.length === 0) {
        return '<div class="rtc-empty">No RTCPeerConnection activity yet.</div>';
      }

      const peer = peers.find((p) => p.peerId === this.selectedPeerId) ?? peers[peers.length - 1]!;
      if (this.selectedPeerId !== peer.peerId) this.selectedPeerId = peer.peerId;

      const stats = this.getLatestStats(events, peer.peerId);
      const iceCandidates = this.getIceCandidates(events, peer.peerId);
      const sdp = this.getSdpEvents(events, peer.peerId);
      this.updateStatsHistory(events, peer.peerId);

      const duration = formatDuration(peer.lastSeen - peer.firstSeen);

      /* connection state */
      let html = `<div class="rtc-section">
        <div class="rtc-section-title">Connection</div>
        <div class="rtc-grid">
          <div class="rtc-stat-box">
            <div class="rtc-stat-value">${escapeHtml(peer.connectionState)}</div>
            <div class="rtc-stat-label">State</div>
          </div>
          <div class="rtc-stat-box">
            <div class="rtc-stat-value">${escapeHtml(peer.iceState)}</div>
            <div class="rtc-stat-label">ICE</div>
          </div>
          <div class="rtc-stat-box">
            <div class="rtc-stat-value">${escapeHtml(peer.signalingState)}</div>
            <div class="rtc-stat-label">Signaling</div>
          </div>
          <div class="rtc-stat-box">
            <div class="rtc-stat-value">${escapeHtml(duration)}</div>
            <div class="rtc-stat-label">Duration</div>
          </div>
        </div>
      </div>`;

      /* live stats */
      const rtt = stats.currentRoundTripTime;
      const rttMs = typeof rtt === 'number' ? `${(rtt * 1000).toFixed(0)}ms` : 'N/A';
      html += `<div class="rtc-section">
        <div class="rtc-section-title">Stats</div>
        <div class="rtc-grid">
          <div class="rtc-stat-box">
            <div class="rtc-stat-value ${this.rttClass(rtt)}">${escapeHtml(rttMs)}</div>
            <div class="rtc-stat-label">RTT</div>
          </div>
          <div class="rtc-stat-box">
            <div class="rtc-stat-value">${escapeHtml(stats.packetsLost !== undefined ? String(stats.packetsLost) : 'N/A')}</div>
            <div class="rtc-stat-label">Lost</div>
          </div>
          <div class="rtc-stat-box">
            <div class="rtc-stat-value">${escapeHtml(typeof stats.jitter === 'number' ? `${(stats.jitter as number * 1000).toFixed(1)}ms` : 'N/A')}</div>
            <div class="rtc-stat-label">Jitter</div>
          </div>
          <div class="rtc-stat-box">
            <div class="rtc-stat-value">${escapeHtml(stats.framesPerSecond !== undefined ? String(stats.framesPerSecond) : 'N/A')}</div>
            <div class="rtc-stat-label">FPS</div>
          </div>
          <div class="rtc-stat-box">
            <div class="rtc-stat-value">${escapeHtml(stats.framesDropped !== undefined ? String(stats.framesDropped) : 'N/A')}</div>
            <div class="rtc-stat-label">Dropped</div>
          </div>
        </div>
      </div>`;

      /* bandwidth */
      if (typeof stats.bytesSent === 'number' || typeof stats.bytesReceived === 'number') {
        html += `<div class="rtc-section">
          <div class="rtc-section-title">Bandwidth</div>
          <div class="rtc-grid">
            <div class="rtc-stat-box">
              <div class="rtc-stat-value">${escapeHtml(formatBytes(stats.bytesSent))}</div>
              <div class="rtc-stat-label">Sent</div>
            </div>
            <div class="rtc-stat-box">
              <div class="rtc-stat-value">${escapeHtml(formatBytes(stats.bytesReceived))}</div>
              <div class="rtc-stat-label">Received</div>
            </div>
          </div>
        </div>`;
      }

      /* real-time graph */
      html += this.renderGraph(peer.peerId);

      /* codecs */
      const codecs = stats.codecs;
      if (Array.isArray(codecs) && codecs.length > 0) {
        html += `<div class="rtc-section">
          <div class="rtc-section-title">Codecs</div>
          <table class="rtc-mini-table">
            <thead><tr><th>Type</th><th>Codec</th><th>Clock</th><th>Channels</th></tr></thead>
            <tbody>`;
        for (const c of codecs as { kind?: string; mimeType?: string; clockRate?: number; channels?: number }[]) {
          html += `<tr>
            <td>${escapeHtml(c.kind ?? '')}</td>
            <td>${escapeHtml(c.mimeType ?? '')}</td>
            <td>${c.clockRate ? `${c.clockRate}Hz` : ''}</td>
            <td>${c.channels ?? ''}</td>
          </tr>`;
        }
        html += '</tbody></table></div>';
      }

      /* ICE candidates */
      if (iceCandidates.length > 0) {
        const localCandidates: WebRtcEvent[] = [];
        const remoteCandidates: WebRtcEvent[] = [];
        for (const e of iceCandidates) {
          if (e.data.direction === 'local') localCandidates.push(e);
          else remoteCandidates.push(e);
        }
        const activePair = stats.selectedCandidatePair;

        html += `<div class="rtc-section">
          <div class="rtc-section-title">ICE Candidates</div>
          <table class="rtc-mini-table">
            <thead><tr><th style="width:22px"></th><th>Address</th><th>Port</th><th>Type</th></tr></thead>
            <tbody>`;

        for (const e of localCandidates) {
          const d = e.data;
          const active = d.candidateId === activePair;
          html += `<tr${active ? ' class="is-active"' : ''}>
            <td>L</td>
            <td>${escapeHtml(String(d.address ?? d.ip ?? ''))}</td>
            <td>${escapeHtml(String(d.port ?? ''))}</td>
            <td>${escapeHtml(String(d.candidateType ?? ''))} (${escapeHtml(String(d.protocol ?? ''))})</td>
          </tr>`;
        }
        for (const e of remoteCandidates) {
          const d = e.data;
          html += `<tr>
            <td>R</td>
            <td>${escapeHtml(String(d.address ?? d.ip ?? ''))}</td>
            <td>${escapeHtml(String(d.port ?? ''))}</td>
            <td>${escapeHtml(String(d.candidateType ?? ''))} (${escapeHtml(String(d.protocol ?? ''))})</td>
          </tr>`;
        }
        html += '</tbody></table></div>';
      }

      /* SDP */
      if (sdp.local || sdp.remote) {
        const activeSdp = this.sdpView === 'local' ? sdp.local : sdp.remote;
        html += `<div class="rtc-section">
          <div class="rtc-section-title">SDP</div>
          <div class="rtc-sdp-toggle">
            <button class="rtc-sdp-btn${this.sdpView === 'local' ? ' is-active' : ''}" data-sdp="local">Local${sdp.local ? '' : ' (none)'}</button>
            <button class="rtc-sdp-btn${this.sdpView === 'remote' ? ' is-active' : ''}" data-sdp="remote">Remote${sdp.remote ? '' : ' (none)'}</button>
          </div>
          ${activeSdp ? `<pre class="rtc-sdp-pre">${escapeHtml(activeSdp)}</pre>` : '<div class="rtc-empty">No SDP available</div>'}
        </div>`;
      }

      return html;
    }

    private renderTracksTab(events: WebRtcEvent[]): string {
      const trackEvents = this.getTrackEvents(events);
      if (trackEvents.length === 0) {
        return '<div class="rtc-empty">No media tracks detected.</div>';
      }

      // Deduplicate by trackId, keep latest
      const trackMap = new Map<string, WebRtcEvent>();
      for (const e of trackEvents) {
        const tid = String(e.data.trackId ?? e.id);
        trackMap.set(tid, e);
      }
      const tracks = [...trackMap.values()];

      let html = '';
      for (const e of tracks) {
        const d = e.data;
        const tid = String(d.trackId ?? e.id);
        const selected = this.selectedTrackId === tid;
        const kind = String(d.kind ?? 'unknown');
        const icon = kind === 'video' ? '&#x1F3A5;' : kind === 'audio' ? '&#x1F3A4;' : '&#x2753;';
        const label = String(d.label ?? d.trackId ?? 'unknown');
        const state = String(d.readyState ?? d.state ?? 'unknown');
        const dir = d.direction === 'send' ? ' (send)' : d.direction === 'recv' ? ' (recv)' : '';

        let settings = '';
        if (kind === 'video') {
          const w = d.width;
          const h = d.height;
          const fps = d.frameRate;
          if (w && h) settings = `${w}x${h}`;
          if (fps) settings += settings ? ` @ ${fps}fps` : `${fps}fps`;
        } else if (kind === 'audio') {
          const rate = d.sampleRate;
          const channels = d.channelCount;
          if (rate) settings = `${rate}Hz`;
          if (channels) settings += settings ? ` ${channels === 2 ? 'stereo' : 'mono'}` : `${channels}ch`;
        }

        html += `<div class="rtc-track-card${selected ? ' is-selected' : ''}" data-track-id="${escapeHtml(tid)}">
          <div class="rtc-track-header">
            <span class="rtc-track-icon">${icon}</span>
            <span class="rtc-track-name">${escapeHtml(label)}${escapeHtml(dir)}</span>
            <span class="rtc-track-state ${state === 'live' ? 'is-live' : 'is-ended'}">${escapeHtml(state)}</span>
          </div>
          ${settings ? `<div style="font-size:11px;opacity:.6;margin-left:26px">${escapeHtml(settings)}</div>` : ''}`;

        if (selected) {
          const entries = Object.entries(d).filter(([k]) => !['trackId', 'label', 'kind', 'readyState', 'state'].includes(k));
          html += `<dl class="rtc-track-detail">`;
          for (const [k, v] of entries) {
            html += `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))}</dd>`;
          }
          html += '</dl>';
        }

        html += '</div>';
      }
      return html;
    }

    /* ── main render ── */

    init($el: unknown) {
      super.init($el);
      this.panel = $el as ErudaPanelElement;
      window.addEventListener(INSPECTRA_WEBRTC_EVENT, this.onUpdate);
      this.render();
    }

    render() {
      if (!this.panel) return;

      const state = getInspectraErudaState();
      const events = state.webrtcEvents;
      const peers = this.getPeerList(events);

      if (!this.selectedPeerId && peers.length > 0) {
        this.selectedPeerId = peers[peers.length - 1]!.peerId;
      }

      const selectedPeer = peers.find((p) => p.peerId === this.selectedPeerId);

      const tabDefs: { id: TabId; label: string; badge?: string }[] = [
        { id: 'devices', label: 'Devices', badge: state.webrtcDevices ? String(state.webrtcDevices.length) : undefined },
        { id: 'peers', label: 'Peers', badge: peers.length > 0 ? String(peers.length) : undefined },
        { id: 'tracks', label: 'Tracks' }
      ];

      const tabs = tabDefs.map((t) =>
        `<button class="rtc-tab${t.id === this.activeTab ? ' is-active' : ''}" data-tab="${t.id}">${t.label}${t.badge ? ` (${t.badge})` : ''}</button>`
      ).join('');

      /* peer selector (for peers tab) */
      let peerBar = '';
      if (this.activeTab === 'peers' && peers.length > 0) {
        const options = peers.map((p) => {
          const label = `${p.peerId.slice(0, 8)}… — ${p.connectionState}`;
          const sel = p.peerId === this.selectedPeerId ? ' selected' : '';
          return `<option value="${escapeHtml(p.peerId)}"${sel}>${escapeHtml(label)}</option>`;
        }).join('');
        const dotClass = selectedPeer ? this.getPeerDotClass(selectedPeer) : 'is-closed';
        peerBar = `<div class="rtc-peer-select-bar">
          <span class="rtc-peer-dot ${dotClass}"></span>
          <select class="rtc-peer-select" data-role="peer-select">${options}</select>
          <span style="font-size:11px;opacity:.6">${peers.length} peer${peers.length > 1 ? 's' : ''}</span>
        </div>`;
      }

      /* tab content */
      let content = '';
      switch (this.activeTab) {
        case 'devices':
          content = this.renderDevicesTab(state.webrtcDevices);
          break;
        case 'peers':
          content = this.renderPeersTab(events, peers);
          break;
        case 'tracks':
          content = this.renderTracksTab(events);
          break;
      }

      this.panel.html(`
        <div class="rtc-root">
          <style>${CSS}</style>
          <div class="rtc-tabs">${tabs}</div>
          ${peerBar}
          <div class="rtc-scroll" data-role="scroll">${content}</div>
        </div>
      `);

      requestAnimationFrame(() => this.bindEvents());
    }

    private bindEvents() {
      const root = document.querySelector('.rtc-root');
      if (!root) return;

      /* tabs */
      root.querySelectorAll<HTMLElement>('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.activeTab = btn.dataset.tab as TabId;
          this.render();
        });
      });

      /* peer select */
      const peerSelect = root.querySelector('[data-role="peer-select"]') as HTMLSelectElement | null;
      peerSelect?.addEventListener('change', () => {
        this.selectedPeerId = peerSelect.value;
        this.render();
      });

      /* SDP buttons */
      root.querySelectorAll<HTMLElement>('[data-sdp]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.sdpView = btn.dataset.sdp as 'local' | 'remote';
          this.render();
        });
      });

      /* track cards */
      root.querySelectorAll<HTMLElement>('[data-track-id]').forEach((card) => {
        card.addEventListener('click', () => {
          const tid = card.dataset.trackId!;
          this.selectedTrackId = this.selectedTrackId === tid ? null : tid;
          this.render();
        });
      });

      /* restore scroll */
      const scrollEl = root.querySelector('[data-role="scroll"]') as HTMLElement | null;
      if (scrollEl) {
        scrollEl.scrollTop = this.scrollTop;
        scrollEl.addEventListener('scroll', () => {
          this.scrollTop = scrollEl.scrollTop;
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
      window.removeEventListener(INSPECTRA_WEBRTC_EVENT, this.onUpdate);
      super.destroy();
    }
  }

  return new InspectraWebRtcTool();
};
