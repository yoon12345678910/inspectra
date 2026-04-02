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

const esc = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

const fmtDuration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
};

const fmtBytes = (v: unknown) => {
  if (typeof v !== 'number') return 'N/A';
  if (v < 1024) return `${v} B`;
  if (v < 1048576) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1048576).toFixed(1)} MB`;
};

const fmtBitrate = (bps: unknown) => {
  if (typeof bps !== 'number' || bps <= 0) return '';
  if (bps < 1000) return `${bps.toFixed(0)} bps`;
  if (bps < 1e6) return `${(bps / 1000).toFixed(1)} Kbps`;
  return `${(bps / 1e6).toFixed(1)} Mbps`;
};

const fmtMetric = (v: unknown, suffix = '') => {
  if (v === undefined || v === null || v === '') return 'N/A';
  if (typeof v === 'number') return `${Math.round(v * 100) / 100}${suffix}`;
  return `${v}${suffix}`;
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

const CSS = /* css */ `
.rtc-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: inherit;
  box-sizing: border-box;
  overflow: hidden;
}
.rtc-root * { box-sizing: border-box; }

/* tabs */
.rtc-tabs {
  display: flex;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  flex-shrink: 0;
  overflow-x: auto;
}
.rtc-tab {
  padding: 7px 14px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: inherit;
  opacity: .5;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}
.rtc-tab.is-active { opacity: 1; border-bottom-color: var(--accent, #4a90d9); }

/* peer bar */
.rtc-peer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  background: var(--darker-background, rgba(127,127,127,.06));
  flex-shrink: 0;
}
.rtc-peer-sel {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid var(--border, rgba(127,127,127,.2));
  border-radius: 4px;
  background: var(--background, transparent);
  color: inherit;
  font-size: 11px;
}
.rtc-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.rtc-dot.connected { background: #39b54a; }
.rtc-dot.closed { background: #999; }
.rtc-dot.new, .rtc-dot.connecting { background: #f4b400; }
.rtc-dot.failed { background: #ff5f56; }
.rtc-peer-count { font-size: 11px; opacity: .5; white-space: nowrap; }

/* content scroll */
.rtc-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px;
}

/* section */
.rtc-sec { margin-bottom: 14px; }
.rtc-sec-t {
  font-size: 11px; font-weight: 600; opacity: .55;
  text-transform: uppercase; letter-spacing: .03em;
  margin-bottom: 6px;
}

/* stat grid */
.rtc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 5px;
}
.rtc-stat {
  padding: 5px 6px;
  border: 1px solid var(--border, rgba(127,127,127,.12));
  border-radius: 4px;
  text-align: center;
  min-width: 0;
  overflow: hidden;
}
.rtc-stat-v {
  font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rtc-stat-l { font-size: 10px; opacity: .5; margin-top: 1px; }
.rtc-stat-v.good { color: #39b54a; }
.rtc-stat-v.warn { color: #f4b400; }
.rtc-stat-v.bad { color: #ff5f56; }

/* table */
.rtc-tbl {
  width: 100%; border-collapse: collapse; font-size: 11px;
}
.rtc-tbl th {
  text-align: left; padding: 3px 6px; font-weight: 500; opacity: .55;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
  white-space: nowrap;
}
.rtc-tbl td {
  padding: 3px 6px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.06));
  word-break: break-all;
}
.rtc-tbl tr.active td { background: rgba(57,181,74,.08); }

/* SDP */
.rtc-sdp-btns { display: flex; gap: 0; margin-bottom: 6px; }
.rtc-sdp-b {
  padding: 4px 10px;
  border: 1px solid var(--border, rgba(127,127,127,.2));
  background: transparent; color: inherit;
  font-size: 11px; cursor: pointer; opacity: .55;
}
.rtc-sdp-b:first-child { border-radius: 4px 0 0 4px; }
.rtc-sdp-b:last-child { border-radius: 0 4px 4px 0; }
.rtc-sdp-b.on { opacity: 1; background: var(--accent, #4a90d9); color: #fff; border-color: var(--accent, #4a90d9); }
.rtc-sdp-pre {
  margin: 0; white-space: pre-wrap; word-break: break-word;
  font-size: 10px; line-height: 1.45;
  max-height: 200px; overflow: auto; padding: 8px;
  border: 1px solid var(--border, rgba(127,127,127,.12));
  border-radius: 4px;
  background: var(--darker-background, rgba(127,127,127,.04));
}

/* graph */
.rtc-graph { height: 60px; border: 1px solid var(--border, rgba(127,127,127,.12)); border-radius: 4px; overflow: hidden; margin-bottom: 4px; }
.rtc-graph svg { width: 100%; height: 100%; display: block; }
.rtc-legend { display: flex; gap: 10px; font-size: 10px; opacity: .55; flex-wrap: wrap; }
.rtc-ldot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 3px; vertical-align: middle; }

/* device */
.rtc-dev-grp { margin-bottom: 12px; }
.rtc-dev-item {
  padding: 6px 8px;
  border: 1px solid var(--border, rgba(127,127,127,.12));
  border-radius: 4px; margin-bottom: 4px; font-size: 11px;
}
.rtc-dev-label { font-weight: 500; word-break: break-word; }
.rtc-dev-id { opacity: .4; font-size: 10px; word-break: break-all; }

/* track */
.rtc-trk {
  padding: 8px;
  border: 1px solid var(--border, rgba(127,127,127,.12));
  border-radius: 4px; margin-bottom: 5px; cursor: pointer;
}
.rtc-trk.on { background: rgba(127,127,127,.07); border-color: var(--accent, rgba(127,127,127,.3)); }
.rtc-trk-h { display: flex; align-items: center; gap: 6px; }
.rtc-trk-icon { font-size: 13px; width: 18px; text-align: center; flex-shrink: 0; }
.rtc-trk-name {
  font-weight: 500; font-size: 11px; flex: 1; min-width: 0;
  word-break: break-word;
}
.rtc-trk-st {
  font-size: 10px; padding: 1px 5px; border-radius: 3px;
  border: 1px solid; flex-shrink: 0;
}
.rtc-trk-st.live { color: #39b54a; border-color: #39b54a; }
.rtc-trk-st.ended { color: #999; border-color: #999; }
.rtc-trk-info { font-size: 11px; opacity: .55; margin-top: 2px; margin-left: 24px; word-break: break-word; }
.rtc-trk-dl { font-size: 11px; padding-top: 6px; border-top: 1px solid var(--border, rgba(127,127,127,.08)); margin-top: 6px; }
.rtc-trk-dl dt { display: inline; opacity: .5; }
.rtc-trk-dl dt::after { content: ': '; }
.rtc-trk-dl dd { display: inline; margin: 0; word-break: break-word; }
.rtc-trk-dl dd::after { content: '\\A'; white-space: pre; }

.rtc-empty { padding: 20px 10px; text-align: center; opacity: .45; font-size: 12px; }
`;

/* ── plugin ── */

export const createErudaWebRtcPlugin = () => (erudaApi: typeof eruda) => {
  class InspectraWebRtcTool extends erudaApi.Tool {
    name = 'webrtc';
    private panel?: ErudaPanelElement;
    private mounted = false;

    private activeTab: TabId = 'peers';
    private selectedPeerId: string | null = null;
    private selectedTrackId: string | null = null;
    private sdpView: 'local' | 'remote' = 'local';

    private statsHistory = new Map<string, StatsPoint[]>();
    private prevBytes = new Map<string, { sent: number; recv: number; ts: number }>();

    private throttleTimer: ReturnType<typeof setTimeout> | null = null;

    private onUpdate = () => {
      // Never re-render while user interacts with a control
      const tag = document.activeElement?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'BUTTON') {
        // Schedule after blur
        if (!this.throttleTimer) {
          this.throttleTimer = setTimeout(() => {
            this.throttleTimer = null;
            this.updateContent();
          }, 600);
        }
        return;
      }
      if (this.throttleTimer) return;
      this.updateContent();
      this.throttleTimer = setTimeout(() => { this.throttleTimer = null; }, 400);
    };

    /* ── data helpers ── */

    private getPeers(events: WebRtcEvent[]): PeerInfo[] {
      const m = new Map<string, PeerInfo>();
      for (const e of events) {
        let p = m.get(e.peerId);
        if (!p) {
          p = { peerId: e.peerId, connectionState: 'new', iceState: 'new', signalingState: 'stable', firstSeen: e.ts, lastSeen: e.ts, closed: false };
          m.set(e.peerId, p);
        }
        p.lastSeen = e.ts;
        if (typeof e.data.connectionState === 'string') p.connectionState = e.data.connectionState;
        if (typeof e.data.iceConnectionState === 'string') p.iceState = e.data.iceConnectionState;
        if (typeof e.data.signalingState === 'string') p.signalingState = e.data.signalingState;
        if (e.phase === 'closed') p.closed = true;
      }
      return [...m.values()];
    }

    private latestStats(events: WebRtcEvent[], pid: string): Record<string, unknown> {
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i]!.peerId === pid && events[i]!.phase === 'stats') return events[i]!.data;
      }
      return {};
    }

    private iceCandidates(events: WebRtcEvent[], pid: string) {
      return events.filter((e) => e.peerId === pid && e.phase === 'ice-candidate');
    }

    private sdpData(events: WebRtcEvent[], pid: string) {
      let local: string | undefined, remote: string | undefined;
      for (const e of events) {
        if (e.peerId !== pid || e.phase !== 'sdp') continue;
        if (e.data.direction === 'local') local = e.data.sdp as string;
        if (e.data.direction === 'remote') remote = e.data.sdp as string;
      }
      return { local, remote };
    }

    private tracks(events: WebRtcEvent[]) {
      const m = new Map<string, WebRtcEvent>();
      for (const e of events) {
        if (e.phase !== 'track') continue;
        m.set(String(e.data.trackId ?? e.id), e);
      }
      return [...m.values()];
    }

    private buildHistory(events: WebRtcEvent[], pid: string) {
      const se = events.filter((e) => e.peerId === pid && e.phase === 'stats');
      const hist: StatsPoint[] = [];
      for (const e of se) {
        const rtt = typeof e.data.currentRoundTripTime === 'number' ? e.data.currentRoundTripTime * 1000 : null;
        const bs = typeof e.data.bytesSent === 'number' ? e.data.bytesSent : 0;
        const br = typeof e.data.bytesReceived === 'number' ? e.data.bytesReceived : 0;
        const prev = this.prevBytes.get(pid);
        const dt = prev ? (e.ts - prev.ts) / 1000 || 1 : 1;
        const bSent = prev ? ((bs - prev.sent) * 8) / dt : 0;
        const bRecv = prev ? ((br - prev.recv) * 8) / dt : 0;
        this.prevBytes.set(pid, { sent: bs, recv: br, ts: e.ts });
        hist.push({ ts: e.ts, rtt, bitrateSent: bSent > 0 ? bSent : null, bitrateRecv: bRecv > 0 ? bRecv : null });
      }
      this.statsHistory.set(pid, hist.slice(-60));
    }

    /* ── render pieces ── */

    private dotClass(p: PeerInfo) {
      if (p.closed || p.connectionState === 'closed') return 'closed';
      if (p.connectionState === 'connected') return 'connected';
      if (p.connectionState === 'failed') return 'failed';
      return 'connecting';
    }

    private rttCls(v: unknown) {
      if (typeof v !== 'number') return '';
      const ms = v * 1000;
      return ms < 100 ? 'good' : ms < 300 ? 'warn' : 'bad';
    }

    private stat(label: string, value: string, cls = '') {
      return `<div class="rtc-stat"><div class="rtc-stat-v ${cls}">${esc(value)}</div><div class="rtc-stat-l">${esc(label)}</div></div>`;
    }

    private graphSvg(pid: string) {
      const pts = this.statsHistory.get(pid) ?? [];
      if (pts.length < 2) return '';
      const W = 300, H = 55;
      const maxR = Math.max(...pts.map((p) => p.rtt ?? 0), 10);
      const maxB = Math.max(...pts.map((p) => Math.max(p.bitrateSent ?? 0, p.bitrateRecv ?? 0)), 1000);
      const path = (fn: (p: StatsPoint) => number | null, mx: number) => {
        const d = pts.map((p, i) => { const v = fn(p); if (v === null) return null; return `${(i / (pts.length - 1)) * W},${H - (v / mx) * (H - 4) - 2}`; }).filter(Boolean);
        return d.length > 1 ? `M${d.join('L')}` : '';
      };
      const rP = path((p) => p.rtt, maxR), sP = path((p) => p.bitrateSent, maxB), rR = path((p) => p.bitrateRecv, maxB);
      const last = pts[pts.length - 1]!;
      return `<div class="rtc-sec">
        <div class="rtc-sec-t">Real-time</div>
        <div class="rtc-graph"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          ${rP ? `<path d="${rP}" fill="none" stroke="#4a90d9" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` : ''}
          ${sP ? `<path d="${sP}" fill="none" stroke="#39b54a" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''}
          ${rR ? `<path d="${rR}" fill="none" stroke="#e74c3c" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''}
        </svg></div>
        <div class="rtc-legend">
          <span><span class="rtc-ldot" style="background:#4a90d9"></span>RTT ${last.rtt !== null ? esc(`${last.rtt.toFixed(0)}ms`) : ''}</span>
          <span><span class="rtc-ldot" style="background:#39b54a"></span>Sent ${esc(fmtBitrate(last.bitrateSent))}</span>
          <span><span class="rtc-ldot" style="background:#e74c3c"></span>Recv ${esc(fmtBitrate(last.bitrateRecv))}</span>
        </div>
      </div>`;
    }

    /* ── tab content builders ── */

    private htmlDevices(devices: DeviceInfo[] | undefined) {
      if (!devices?.length) return '<div class="rtc-empty">No devices detected.<br>Grant camera/microphone permission to see device labels.</div>';
      const grp: Record<string, DeviceInfo[]> = { videoinput: [], audioinput: [], audiooutput: [] };
      for (const d of devices) (grp[d.kind] ??= []).push(d);
      const t: Record<string, string> = { videoinput: 'Video Input', audioinput: 'Audio Input', audiooutput: 'Audio Output' };
      let h = '';
      for (const [k, items] of Object.entries(grp)) {
        if (!items.length) continue;
        h += `<div class="rtc-dev-grp"><div class="rtc-sec-t">${esc(t[k] ?? k)} (${items.length})</div>`;
        for (const d of items) {
          h += `<div class="rtc-dev-item"><div class="rtc-dev-label">${esc(d.label || '(unnamed)')}</div><div class="rtc-dev-id">${esc(d.deviceId)}</div></div>`;
        }
        h += '</div>';
      }
      return h;
    }

    private htmlPeers(events: WebRtcEvent[], peers: PeerInfo[]) {
      if (!peers.length) return '<div class="rtc-empty">No RTCPeerConnection activity yet.</div>';
      const peer = peers.find((p) => p.peerId === this.selectedPeerId) ?? peers[peers.length - 1]!;
      if (this.selectedPeerId !== peer.peerId) this.selectedPeerId = peer.peerId;

      const st = this.latestStats(events, peer.peerId);
      const ice = this.iceCandidates(events, peer.peerId);
      const sdp = this.sdpData(events, peer.peerId);
      this.buildHistory(events, peer.peerId);
      const dur = fmtDuration(peer.lastSeen - peer.firstSeen);
      const rtt = st.currentRoundTripTime;
      const rttMs = typeof rtt === 'number' ? `${(rtt as number * 1000).toFixed(0)}ms` : 'N/A';

      let h = '';

      /* connection */
      h += `<div class="rtc-sec"><div class="rtc-sec-t">Connection</div><div class="rtc-grid">
        ${this.stat('State', peer.connectionState)}
        ${this.stat('ICE', peer.iceState)}
        ${this.stat('Signaling', peer.signalingState)}
        ${this.stat('Duration', dur)}
      </div></div>`;

      /* stats */
      h += `<div class="rtc-sec"><div class="rtc-sec-t">Stats</div><div class="rtc-grid">
        ${this.stat('RTT', rttMs, this.rttCls(rtt))}
        ${this.stat('Lost', fmtMetric(st.packetsLost))}
        ${this.stat('Jitter', typeof st.jitter === 'number' ? `${((st.jitter as number) * 1000).toFixed(1)}ms` : 'N/A')}
        ${this.stat('FPS', fmtMetric(st.framesPerSecond))}
        ${this.stat('Dropped', fmtMetric(st.framesDropped))}
      </div></div>`;

      /* bandwidth */
      if (typeof st.bytesSent === 'number' || typeof st.bytesReceived === 'number') {
        h += `<div class="rtc-sec"><div class="rtc-sec-t">Bandwidth</div><div class="rtc-grid">
          ${this.stat('Sent', fmtBytes(st.bytesSent))}
          ${this.stat('Received', fmtBytes(st.bytesReceived))}
        </div></div>`;
      }

      /* graph */
      h += this.graphSvg(peer.peerId);

      /* codecs */
      const codecs = st.codecs;
      if (Array.isArray(codecs) && codecs.length) {
        h += `<div class="rtc-sec"><div class="rtc-sec-t">Codecs</div><table class="rtc-tbl">
          <thead><tr><th>Type</th><th>Codec</th><th>Clock</th><th>Ch</th></tr></thead><tbody>`;
        for (const c of codecs as { kind?: string; mimeType?: string; clockRate?: number; channels?: number }[]) {
          h += `<tr><td>${esc(c.kind ?? '')}</td><td>${esc(c.mimeType ?? '')}</td><td>${c.clockRate ? `${c.clockRate}Hz` : ''}</td><td>${c.channels ?? ''}</td></tr>`;
        }
        h += '</tbody></table></div>';
      }

      /* ICE */
      if (ice.length) {
        const loc = ice.filter((e) => e.data.direction === 'local');
        const rem = ice.filter((e) => e.data.direction === 'remote');
        h += `<div class="rtc-sec"><div class="rtc-sec-t">ICE Candidates (${ice.length})</div><table class="rtc-tbl">
          <thead><tr><th style="width:20px"></th><th>Address</th><th>Port</th><th>Type</th></tr></thead><tbody>`;
        for (const e of loc) {
          const d = e.data;
          h += `<tr><td>L</td><td>${esc(String(d.address ?? d.ip ?? ''))}</td><td>${esc(String(d.port ?? ''))}</td><td>${esc(String(d.candidateType ?? ''))} (${esc(String(d.protocol ?? ''))})</td></tr>`;
        }
        for (const e of rem) {
          const d = e.data;
          h += `<tr><td>R</td><td>${esc(String(d.address ?? d.ip ?? ''))}</td><td>${esc(String(d.port ?? ''))}</td><td>${esc(String(d.candidateType ?? ''))} (${esc(String(d.protocol ?? ''))})</td></tr>`;
        }
        h += '</tbody></table></div>';
      }

      /* SDP */
      if (sdp.local || sdp.remote) {
        const act = this.sdpView === 'local' ? sdp.local : sdp.remote;
        h += `<div class="rtc-sec"><div class="rtc-sec-t">SDP</div>
          <div class="rtc-sdp-btns">
            <button class="rtc-sdp-b${this.sdpView === 'local' ? ' on' : ''}" data-sdp="local">Local${sdp.local ? '' : ' (none)'}</button>
            <button class="rtc-sdp-b${this.sdpView === 'remote' ? ' on' : ''}" data-sdp="remote">Remote${sdp.remote ? '' : ' (none)'}</button>
          </div>
          ${act ? `<pre class="rtc-sdp-pre">${esc(act)}</pre>` : '<div class="rtc-empty">No SDP</div>'}
        </div>`;
      }

      return h;
    }

    private htmlTracks(events: WebRtcEvent[]) {
      const trks = this.tracks(events);
      if (!trks.length) return '<div class="rtc-empty">No media tracks detected.</div>';

      let h = '';
      for (const e of trks) {
        const d = e.data;
        const tid = String(d.trackId ?? e.id);
        const sel = this.selectedTrackId === tid;
        const kind = String(d.kind ?? 'unknown');
        const icon = kind === 'video' ? '&#x1F3A5;' : kind === 'audio' ? '&#x1F3A4;' : '&#x2753;';
        const label = String(d.label || d.trackId || 'unknown');
        const state = String(d.readyState ?? d.state ?? 'unknown');
        const dir = d.direction === 'send' ? ' (send)' : d.direction === 'recv' ? ' (recv)' : '';

        let info = '';
        if (kind === 'video') {
          const parts: string[] = [];
          if (d.width && d.height) parts.push(`${d.width}x${d.height}`);
          if (d.frameRate) parts.push(`${d.frameRate}fps`);
          info = parts.join(' @ ');
        } else if (kind === 'audio') {
          const parts: string[] = [];
          if (d.sampleRate) parts.push(`${d.sampleRate}Hz`);
          if (d.channelCount) parts.push(d.channelCount === 2 ? 'stereo' : 'mono');
          info = parts.join(' ');
        }

        h += `<div class="rtc-trk${sel ? ' on' : ''}" data-tid="${esc(tid)}">
          <div class="rtc-trk-h">
            <span class="rtc-trk-icon">${icon}</span>
            <span class="rtc-trk-name">${esc(label)}${esc(dir)}</span>
            <span class="rtc-trk-st ${state === 'live' ? 'live' : 'ended'}">${esc(state)}</span>
          </div>
          ${info ? `<div class="rtc-trk-info">${esc(info)}</div>` : ''}`;

        if (sel) {
          const skip = new Set(['trackId', 'label', 'kind', 'readyState', 'state', 'direction', 'width', 'height', 'frameRate', 'sampleRate', 'channelCount']);
          const entries = Object.entries(d).filter(([k]) => !skip.has(k));
          if (entries.length) {
            h += '<dl class="rtc-trk-dl">';
            for (const [k, v] of entries) h += `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))}</dd>`;
            h += '</dl>';
          }
        }
        h += '</div>';
      }
      return h;
    }

    /* ── mount / update ── */

    init($el: unknown) {
      super.init($el);
      this.panel = $el as ErudaPanelElement;
      window.addEventListener(INSPECTRA_WEBRTC_EVENT, this.onUpdate);
      this.fullRender();
    }

    /** Full render — sets up the shell (tabs, peer bar). Called once or on tab/peer change. */
    private fullRender() {
      if (!this.panel) return;
      this.mounted = true;

      const state = getInspectraErudaState();
      const events = state.webrtcEvents;
      const peers = this.getPeers(events);
      const trks = this.tracks(events);

      if (!this.selectedPeerId && peers.length) this.selectedPeerId = peers[peers.length - 1]!.peerId;
      const sp = peers.find((p) => p.peerId === this.selectedPeerId);

      const tabDefs: [TabId, string, number | undefined][] = [
        ['devices', 'Devices', state.webrtcDevices?.length],
        ['peers', 'Peers', peers.length || undefined],
        ['tracks', 'Tracks', trks.length || undefined]
      ];
      const tabs = tabDefs.map(([id, lbl, cnt]) =>
        `<button class="rtc-tab${id === this.activeTab ? ' is-active' : ''}" data-tab="${id}">${lbl}${cnt !== undefined ? ` (${cnt})` : ''}</button>`
      ).join('');

      let peerBar = '';
      if (this.activeTab === 'peers' && peers.length) {
        const opts = peers.map((p) => {
          const sel = p.peerId === this.selectedPeerId ? ' selected' : '';
          return `<option value="${esc(p.peerId)}"${sel}>${esc(p.peerId)} — ${esc(p.connectionState)}</option>`;
        }).join('');
        peerBar = `<div class="rtc-peer-bar">
          <span class="rtc-dot ${sp ? this.dotClass(sp) : 'closed'}"></span>
          <select class="rtc-peer-sel" data-role="psel">${opts}</select>
          <span class="rtc-peer-count">${peers.length} peer${peers.length > 1 ? 's' : ''}</span>
        </div>`;
      }

      let content = '';
      switch (this.activeTab) {
        case 'devices': content = this.htmlDevices(state.webrtcDevices); break;
        case 'peers': content = this.htmlPeers(events, peers); break;
        case 'tracks': content = this.htmlTracks(events); break;
      }

      this.panel.html(`<div class="rtc-root"><style>${CSS}</style>
        <div class="rtc-tabs">${tabs}</div>
        ${peerBar}
        <div class="rtc-content" data-role="content">${content}</div>
      </div>`);

      requestAnimationFrame(() => this.bind());
    }

    /** Partial update — only replaces inner content, preserves scroll & focus. */
    private updateContent() {
      if (!this.mounted) { this.fullRender(); return; }

      const el = document.querySelector('.rtc-root [data-role="content"]') as HTMLElement | null;
      if (!el) { this.fullRender(); return; }

      const scrollTop = el.scrollTop;

      const state = getInspectraErudaState();
      const events = state.webrtcEvents;
      const peers = this.getPeers(events);
      const trks = this.tracks(events);

      if (!this.selectedPeerId && peers.length) this.selectedPeerId = peers[peers.length - 1]!.peerId;

      // Update tab badges without full re-render
      const tabBtns = document.querySelectorAll<HTMLElement>('.rtc-root [data-tab]');
      const badges: Record<TabId, number | undefined> = {
        devices: state.webrtcDevices?.length,
        peers: peers.length || undefined,
        tracks: trks.length || undefined
      };
      tabBtns.forEach((btn) => {
        const id = btn.dataset.tab as TabId;
        const base = id === 'devices' ? 'Devices' : id === 'peers' ? 'Peers' : 'Tracks';
        const cnt = badges[id];
        btn.textContent = cnt !== undefined ? `${base} (${cnt})` : base;
      });

      // Update peer dot
      const sp = peers.find((p) => p.peerId === this.selectedPeerId);
      const dot = document.querySelector('.rtc-root .rtc-dot') as HTMLElement | null;
      if (dot && sp) { dot.className = `rtc-dot ${this.dotClass(sp)}`; }

      // Update content area
      let html = '';
      switch (this.activeTab) {
        case 'devices': html = this.htmlDevices(state.webrtcDevices); break;
        case 'peers': html = this.htmlPeers(events, peers); break;
        case 'tracks': html = this.htmlTracks(events); break;
      }
      el.innerHTML = html;

      // Restore scroll
      el.scrollTop = scrollTop;

      // Bind content-level events (not tabs/peer-select — those stay)
      this.bindContentEvents();
    }

    private bind() {
      const root = document.querySelector('.rtc-root');
      if (!root) return;

      root.querySelectorAll<HTMLElement>('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => { this.activeTab = btn.dataset.tab as TabId; this.fullRender(); });
      });

      const psel = root.querySelector('[data-role="psel"]') as HTMLSelectElement | null;
      psel?.addEventListener('change', () => { this.selectedPeerId = psel.value; this.fullRender(); });

      this.bindContentEvents();
    }

    private bindContentEvents() {
      const root = document.querySelector('.rtc-root');
      if (!root) return;

      root.querySelectorAll<HTMLElement>('[data-sdp]').forEach((btn) => {
        btn.addEventListener('click', () => { this.sdpView = btn.dataset.sdp as 'local' | 'remote'; this.updateContent(); });
      });

      root.querySelectorAll<HTMLElement>('[data-tid]').forEach((card) => {
        card.addEventListener('click', () => {
          const tid = card.dataset.tid!;
          this.selectedTrackId = this.selectedTrackId === tid ? null : tid;
          this.updateContent();
        });
      });
    }

    show() { this.panel?.show(); return this; }
    hide() { this.panel?.hide(); return this; }

    destroy() {
      window.removeEventListener(INSPECTRA_WEBRTC_EVENT, this.onUpdate);
      if (this.throttleTimer) clearTimeout(this.throttleTimer);
      super.destroy();
    }
  }

  return new InspectraWebRtcTool();
};
