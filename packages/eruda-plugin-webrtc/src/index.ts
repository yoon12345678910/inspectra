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
  phase: 'created' | 'state-change' | 'stats' | 'closed' | 'ice-candidate' | 'sdp' | 'track';
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

const esc = (v: string) =>
  v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const fmtTs = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

const fmtDur = (ms: number) => {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
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

const fmtBps = (v: unknown) => {
  if (typeof v !== 'number' || v <= 0) return '';
  if (v < 1000) return `${v.toFixed(0)} bps`;
  if (v < 1e6) return `${(v / 1000).toFixed(1)} Kbps`;
  return `${(v / 1e6).toFixed(1)} Mbps`;
};

const fmtVal = (v: unknown) => {
  if (v === undefined || v === null || v === '') return 'N/A';
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  return String(v);
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

interface StatsPoint { ts: number; rtt: number | null; bpsSent: number | null; bpsRecv: number | null; }

export const getInspectraErudaState = (): InspectraErudaState => {
  const store = window[STORE_KEY] ?? {};
  return {
    sessionId: typeof store.sessionId === 'string' ? store.sessionId : '',
    webrtcEvents: Array.isArray(store.webrtcEvents) ? (store.webrtcEvents as WebRtcEvent[]) : [],
    webrtcDevices: Array.isArray(store.webrtcDevices) ? (store.webrtcDevices as DeviceInfo[]) : undefined
  };
};

const CSS = /* css */ `
.rtc{height:100%;display:flex;flex-direction:column;font-size:12px;color:inherit;box-sizing:border-box;overflow:hidden}
.rtc *{box-sizing:border-box}
.rtc-tabs{display:flex;border-bottom:1px solid var(--border,rgba(127,127,127,.2));flex-shrink:0;overflow-x:auto}
.rtc-tab{padding:7px 14px;font-size:12px;cursor:pointer;border:none;background:0 0;color:inherit;opacity:.5;border-bottom:2px solid transparent;white-space:nowrap;flex-shrink:0}
.rtc-tab.on{opacity:1;border-bottom-color:var(--accent,#4a90d9)}
.rtc-bar{display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--border,rgba(127,127,127,.2));background:var(--darker-background,rgba(127,127,127,.06));flex-shrink:0}
.rtc-sel{flex:1;min-width:0;padding:3px 6px;border:1px solid var(--border,rgba(127,127,127,.2));border-radius:4px;background:var(--background,transparent);color:inherit;font-size:11px}
.rtc-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.rtc-dot.ok{background:#39b54a}.rtc-dot.off{background:#999}.rtc-dot.wait{background:#f4b400}.rtc-dot.err{background:#ff5f56}
.rtc-cnt{font-size:11px;opacity:.5;white-space:nowrap}
.rtc-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px}
.rtc-s{margin-bottom:14px}
.rtc-st{font-size:11px;font-weight:600;opacity:.55;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px}
.rtc-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(85px,1fr));gap:5px}
.rtc-b{padding:5px 6px;border:1px solid var(--border,rgba(127,127,127,.12));border-radius:4px;text-align:center;overflow:hidden}
.rtc-bv{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rtc-bl{font-size:10px;opacity:.5;margin-top:1px}
.rtc-bv.good{color:#39b54a}.rtc-bv.warn{color:#f4b400}.rtc-bv.bad{color:#ff5f56}
.rtc-t{width:100%;border-collapse:collapse;font-size:11px}
.rtc-t th{text-align:left;padding:3px 6px;font-weight:500;opacity:.55;border-bottom:1px solid var(--border,rgba(127,127,127,.2));white-space:nowrap}
.rtc-t td{padding:3px 6px;border-bottom:1px solid var(--border,rgba(127,127,127,.06));word-break:break-all}
.rtc-t tr.hi td{background:rgba(57,181,74,.08)}
.rtc-sdp-b{display:flex;gap:0;margin-bottom:6px}
.rtc-sb{padding:4px 10px;border:1px solid var(--border,rgba(127,127,127,.2));background:0 0;color:inherit;font-size:11px;cursor:pointer;opacity:.55}
.rtc-sb:first-child{border-radius:4px 0 0 4px}.rtc-sb:last-child{border-radius:0 4px 4px 0}
.rtc-sb.on{opacity:1;background:var(--accent,#4a90d9);color:#fff;border-color:var(--accent,#4a90d9)}
.rtc-sp{margin:0;white-space:pre-wrap;word-break:break-word;font-size:10px;line-height:1.45;max-height:200px;overflow:auto;padding:8px;border:1px solid var(--border,rgba(127,127,127,.12));border-radius:4px;background:var(--darker-background,rgba(127,127,127,.04))}
.rtc-gr{height:60px;border:1px solid var(--border,rgba(127,127,127,.12));border-radius:4px;overflow:hidden;margin-bottom:4px}
.rtc-gr svg{width:100%;height:100%;display:block}
.rtc-lg{display:flex;gap:10px;font-size:10px;opacity:.55;flex-wrap:wrap}
.rtc-ld{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:3px;vertical-align:middle}
.rtc-di{padding:6px 8px;border:1px solid var(--border,rgba(127,127,127,.12));border-radius:4px;margin-bottom:4px;font-size:11px}
.rtc-dl{font-weight:500;word-break:break-word}.rtc-did{opacity:.4;font-size:10px;word-break:break-all}
.rtc-dg{margin-bottom:12px}
.rtc-tk{padding:8px;border:1px solid var(--border,rgba(127,127,127,.12));border-radius:4px;margin-bottom:5px;cursor:pointer}
.rtc-tk.on{background:rgba(127,127,127,.07);border-color:var(--accent,rgba(127,127,127,.3))}
.rtc-tkh{display:flex;align-items:center;gap:6px}
.rtc-tki{font-size:13px;width:18px;text-align:center;flex-shrink:0}
.rtc-tkn{font-weight:500;font-size:11px;flex:1;min-width:0;word-break:break-word}
.rtc-tks{font-size:10px;padding:1px 5px;border-radius:3px;border:1px solid;flex-shrink:0}
.rtc-tks.live{color:#39b54a;border-color:#39b54a}.rtc-tks.ended{color:#999;border-color:#999}
.rtc-tkf{font-size:11px;opacity:.55;margin-top:2px;margin-left:24px;word-break:break-word}
.rtc-tkd{font-size:11px;padding-top:6px;border-top:1px solid var(--border,rgba(127,127,127,.08));margin-top:6px}
.rtc-tkd dt{display:inline;opacity:.5}.rtc-tkd dt::after{content:': '}
.rtc-tkd dd{display:inline;margin:0;word-break:break-word}.rtc-tkd dd::after{content:'\\A';white-space:pre}
.rtc-empty{padding:20px 10px;text-align:center;opacity:.45;font-size:12px}
`;

export const createErudaWebRtcPlugin = () => (erudaApi: typeof eruda) => {
  class WebRtcTool extends erudaApi.Tool {
    name = 'webrtc';
    private panel?: ErudaPanelElement;
    private tab: TabId = 'peers';
    private peerId: string | null = null;
    private trackId: string | null = null;
    private sdpView: 'local' | 'remote' = 'local';
    private scrollTop = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private hist = new Map<string, StatsPoint[]>();
    private prevB = new Map<string, { s: number; r: number; t: number }>();

    private onScroll = () => {
      const el = this.scrollEl();
      if (el) this.scrollTop = el.scrollTop;
    };

    private scrollEl() {
      // Search within eruda's tool container
      try {
        const panels = document.querySelectorAll('.rtc-body');
        return panels.length ? (panels[panels.length - 1] as HTMLElement) : null;
      } catch { return null; }
    }

    private onUpdate = () => {
      // Defer while user interacts with controls
      const tag = document.activeElement?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT') {
        if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.render(); }, 700);
        return;
      }
      // Throttle to 500ms
      if (this.timer) return;
      this.render();
      this.timer = setTimeout(() => { this.timer = null; }, 500);
    };

    /* data */
    private peers(ev: WebRtcEvent[]): PeerInfo[] {
      const m = new Map<string, PeerInfo>();
      for (const e of ev) {
        let p = m.get(e.peerId);
        if (!p) { p = { peerId: e.peerId, connectionState: 'new', iceState: 'new', signalingState: 'stable', firstSeen: e.ts, lastSeen: e.ts, closed: false }; m.set(e.peerId, p); }
        p.lastSeen = e.ts;
        if (typeof e.data.connectionState === 'string') p.connectionState = e.data.connectionState;
        if (typeof e.data.iceConnectionState === 'string') p.iceState = e.data.iceConnectionState;
        if (typeof e.data.signalingState === 'string') p.signalingState = e.data.signalingState;
        if (e.phase === 'closed') p.closed = true;
      }
      return [...m.values()];
    }

    private lastStats(ev: WebRtcEvent[], pid: string) {
      for (let i = ev.length - 1; i >= 0; i--) { if (ev[i]!.peerId === pid && ev[i]!.phase === 'stats') return ev[i]!.data; }
      return {} as Record<string, unknown>;
    }

    private iceList(ev: WebRtcEvent[], pid: string) { return ev.filter((e) => e.peerId === pid && e.phase === 'ice-candidate'); }

    private sdps(ev: WebRtcEvent[], pid: string) {
      let l: string | undefined, r: string | undefined;
      for (const e of ev) { if (e.peerId !== pid || e.phase !== 'sdp') continue; if (e.data.direction === 'local') l = e.data.sdp as string; if (e.data.direction === 'remote') r = e.data.sdp as string; }
      return { local: l, remote: r };
    }

    private trks(ev: WebRtcEvent[]) {
      const m = new Map<string, WebRtcEvent>();
      for (const e of ev) { if (e.phase === 'track') m.set(String(e.data.trackId ?? e.id), e); }
      return [...m.values()];
    }

    private buildHist(ev: WebRtcEvent[], pid: string) {
      const se = ev.filter((e) => e.peerId === pid && e.phase === 'stats');
      const h: StatsPoint[] = [];
      for (const e of se) {
        const rtt = typeof e.data.currentRoundTripTime === 'number' ? (e.data.currentRoundTripTime as number) * 1000 : null;
        const bs = typeof e.data.bytesSent === 'number' ? (e.data.bytesSent as number) : 0;
        const br = typeof e.data.bytesReceived === 'number' ? (e.data.bytesReceived as number) : 0;
        const prev = this.prevB.get(pid);
        const dt = prev ? (e.ts - prev.t) / 1000 || 1 : 1;
        const sent = prev ? ((bs - prev.s) * 8) / dt : 0;
        const recv = prev ? ((br - prev.r) * 8) / dt : 0;
        this.prevB.set(pid, { s: bs, r: br, t: e.ts });
        h.push({ ts: e.ts, rtt, bpsSent: sent > 0 ? sent : null, bpsRecv: recv > 0 ? recv : null });
      }
      this.hist.set(pid, h.slice(-60));
    }

    /* render helpers */
    private dotCls(p: PeerInfo) { return p.closed || p.connectionState === 'closed' ? 'off' : p.connectionState === 'connected' ? 'ok' : p.connectionState === 'failed' ? 'err' : 'wait'; }
    private rttCls(v: unknown) { if (typeof v !== 'number') return ''; const ms = v * 1000; return ms < 100 ? 'good' : ms < 300 ? 'warn' : 'bad'; }
    private box(lbl: string, val: string, cls = '') { return `<div class="rtc-b"><div class="rtc-bv ${cls}">${esc(val)}</div><div class="rtc-bl">${esc(lbl)}</div></div>`; }

    private graph(pid: string) {
      const pts = this.hist.get(pid) ?? [];
      if (pts.length < 2) return '';
      const W = 300, H = 55;
      const mR = Math.max(...pts.map((p) => p.rtt ?? 0), 10);
      const mB = Math.max(...pts.map((p) => Math.max(p.bpsSent ?? 0, p.bpsRecv ?? 0)), 1000);
      const path = (fn: (p: StatsPoint) => number | null, mx: number) => {
        const d = pts.map((p, i) => { const v = fn(p); return v === null ? null : `${(i / (pts.length - 1)) * W},${H - (v / mx) * (H - 4) - 2}`; }).filter(Boolean);
        return d.length > 1 ? `M${d.join('L')}` : '';
      };
      const rP = path((p) => p.rtt, mR), sP = path((p) => p.bpsSent, mB), rR = path((p) => p.bpsRecv, mB);
      const last = pts[pts.length - 1]!;
      return `<div class="rtc-s"><div class="rtc-st">Real-time</div>
        <div class="rtc-gr"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          ${rP ? `<path d="${rP}" fill="none" stroke="#4a90d9" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` : ''}
          ${sP ? `<path d="${sP}" fill="none" stroke="#39b54a" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''}
          ${rR ? `<path d="${rR}" fill="none" stroke="#e74c3c" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''}
        </svg></div>
        <div class="rtc-lg">
          <span><span class="rtc-ld" style="background:#4a90d9"></span>RTT ${last.rtt !== null ? esc(`${last.rtt.toFixed(0)}ms`) : ''}</span>
          <span><span class="rtc-ld" style="background:#39b54a"></span>Sent ${esc(fmtBps(last.bpsSent))}</span>
          <span><span class="rtc-ld" style="background:#e74c3c"></span>Recv ${esc(fmtBps(last.bpsRecv))}</span>
        </div></div>`;
    }

    /* tab builders */
    private devicesHtml(devs: DeviceInfo[] | undefined) {
      if (!devs?.length) return '<div class="rtc-empty">No devices detected.<br>Grant camera/microphone permission to see device labels.</div>';
      const grp: Record<string, DeviceInfo[]> = { videoinput: [], audioinput: [], audiooutput: [] };
      for (const d of devs) (grp[d.kind] ??= []).push(d);
      const t: Record<string, string> = { videoinput: 'Video Input', audioinput: 'Audio Input', audiooutput: 'Audio Output' };
      let h = '';
      for (const [k, items] of Object.entries(grp)) {
        if (!items.length) continue;
        h += `<div class="rtc-dg"><div class="rtc-st">${esc(t[k] ?? k)} (${items.length})</div>`;
        for (const d of items) h += `<div class="rtc-di"><div class="rtc-dl">${esc(d.label || '(unnamed)')}</div><div class="rtc-did">${esc(d.deviceId)}</div></div>`;
        h += '</div>';
      }
      return h;
    }

    private peersHtml(ev: WebRtcEvent[], peerList: PeerInfo[]) {
      if (!peerList.length) return '<div class="rtc-empty">No RTCPeerConnection activity yet.</div>';
      const peer = peerList.find((p) => p.peerId === this.peerId) ?? peerList[peerList.length - 1]!;
      if (this.peerId !== peer.peerId) this.peerId = peer.peerId;

      const st = this.lastStats(ev, peer.peerId);
      const ice = this.iceList(ev, peer.peerId);
      const sdp = this.sdps(ev, peer.peerId);
      this.buildHist(ev, peer.peerId);
      const dur = fmtDur(peer.lastSeen - peer.firstSeen);
      const rtt = st.currentRoundTripTime;
      const rttMs = typeof rtt === 'number' ? `${(rtt as number * 1000).toFixed(0)}ms` : 'N/A';
      const jitterMs = typeof st.jitter === 'number' ? `${((st.jitter as number) * 1000).toFixed(1)}ms` : 'N/A';

      let h = '';

      // Connection
      h += `<div class="rtc-s"><div class="rtc-st">Connection</div><div class="rtc-g">
        ${this.box('State', peer.connectionState)}${this.box('ICE', peer.iceState)}
        ${this.box('Signaling', peer.signalingState)}${this.box('Duration', dur)}
      </div></div>`;

      // Stats
      h += `<div class="rtc-s"><div class="rtc-st">Stats</div><div class="rtc-g">
        ${this.box('RTT', rttMs, this.rttCls(rtt))}
        ${this.box('Lost', fmtVal(st.packetsLost))}
        ${this.box('Jitter', jitterMs)}
        ${this.box('FPS', fmtVal(st.framesPerSecond))}
        ${this.box('Dropped', fmtVal(st.framesDropped))}
      </div></div>`;

      // Bandwidth
      if (typeof st.bytesSent === 'number' || typeof st.bytesReceived === 'number') {
        h += `<div class="rtc-s"><div class="rtc-st">Bandwidth</div><div class="rtc-g">
          ${this.box('Sent', fmtBytes(st.bytesSent))}${this.box('Received', fmtBytes(st.bytesReceived))}
        </div></div>`;
      }

      // Graph
      h += this.graph(peer.peerId);

      // Codecs
      const codecs = st.codecs;
      if (Array.isArray(codecs) && codecs.length) {
        h += `<div class="rtc-s"><div class="rtc-st">Codecs</div><table class="rtc-t">
          <thead><tr><th>Type</th><th>Codec</th><th>Clock</th><th>Ch</th></tr></thead><tbody>`;
        for (const c of codecs as { kind?: string; mimeType?: string; clockRate?: number; channels?: number }[])
          h += `<tr><td>${esc(c.kind ?? '')}</td><td>${esc(c.mimeType ?? '')}</td><td>${c.clockRate ? `${c.clockRate}Hz` : ''}</td><td>${c.channels ?? ''}</td></tr>`;
        h += '</tbody></table></div>';
      }

      // ICE Candidates
      if (ice.length) {
        const loc = ice.filter((e) => e.data.direction === 'local');
        const rem = ice.filter((e) => e.data.direction === 'remote');
        h += `<div class="rtc-s"><div class="rtc-st">ICE Candidates (${ice.length})</div><table class="rtc-t">
          <thead><tr><th style="width:20px"></th><th>Address</th><th>Port</th><th>Type</th></tr></thead><tbody>`;
        for (const e of loc) { const d = e.data; h += `<tr><td>L</td><td>${esc(String(d.address ?? d.ip ?? ''))}</td><td>${esc(String(d.port ?? ''))}</td><td>${esc(String(d.candidateType ?? ''))} (${esc(String(d.protocol ?? ''))})</td></tr>`; }
        for (const e of rem) { const d = e.data; h += `<tr><td>R</td><td>${esc(String(d.address ?? d.ip ?? ''))}</td><td>${esc(String(d.port ?? ''))}</td><td>${esc(String(d.candidateType ?? ''))} (${esc(String(d.protocol ?? ''))})</td></tr>`; }
        h += '</tbody></table></div>';
      }

      // SDP
      if (sdp.local || sdp.remote) {
        const act = this.sdpView === 'local' ? sdp.local : sdp.remote;
        h += `<div class="rtc-s"><div class="rtc-st">SDP</div>
          <div class="rtc-sdp-b"><button class="rtc-sb${this.sdpView === 'local' ? ' on' : ''}" data-sdp="local">Local${sdp.local ? '' : ' (none)'}</button>
          <button class="rtc-sb${this.sdpView === 'remote' ? ' on' : ''}" data-sdp="remote">Remote${sdp.remote ? '' : ' (none)'}</button></div>
          ${act ? `<pre class="rtc-sp">${esc(act)}</pre>` : '<div class="rtc-empty">No SDP</div>'}
        </div>`;
      }

      return h;
    }

    private tracksHtml(ev: WebRtcEvent[]) {
      const trks = this.trks(ev);
      if (!trks.length) return '<div class="rtc-empty">No media tracks detected.</div>';

      let h = '';
      for (const e of trks) {
        const d = e.data;
        const tid = String(d.trackId ?? e.id);
        const sel = this.trackId === tid;
        const kind = String(d.kind ?? 'unknown');
        const icon = kind === 'video' ? '&#x1F3A5;' : kind === 'audio' ? '&#x1F3A4;' : '&#x2753;';
        const label = String(d.label || d.trackId || 'unknown');
        const state = String(d.readyState ?? d.state ?? 'unknown');
        const dir = d.direction === 'send' ? ' (send)' : d.direction === 'recv' ? ' (recv)' : '';

        const parts: string[] = [];
        if (kind === 'video') { if (d.width && d.height) parts.push(`${d.width}x${d.height}`); if (d.frameRate) parts.push(`${d.frameRate}fps`); }
        else if (kind === 'audio') { if (d.sampleRate) parts.push(`${d.sampleRate}Hz`); if (d.channelCount) parts.push(d.channelCount === 2 ? 'stereo' : 'mono'); }

        h += `<div class="rtc-tk${sel ? ' on' : ''}" data-tid="${esc(tid)}">
          <div class="rtc-tkh"><span class="rtc-tki">${icon}</span><span class="rtc-tkn">${esc(label)}${esc(dir)}</span><span class="rtc-tks ${state === 'live' ? 'live' : 'ended'}">${esc(state)}</span></div>
          ${parts.length ? `<div class="rtc-tkf">${esc(parts.join(' @ '))}</div>` : ''}`;

        if (sel) {
          const skip = new Set(['trackId', 'label', 'kind', 'readyState', 'state', 'direction', 'width', 'height', 'frameRate', 'sampleRate', 'channelCount']);
          const entries = Object.entries(d).filter(([k]) => !skip.has(k));
          if (entries.length) {
            h += '<dl class="rtc-tkd">';
            for (const [k, v] of entries) h += `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))}</dd>`;
            h += '</dl>';
          }
        }
        h += '</div>';
      }
      return h;
    }

    /* main render — always full, with scroll restoration */
    init($el: unknown) {
      super.init($el);
      this.panel = $el as ErudaPanelElement;
      window.addEventListener(INSPECTRA_WEBRTC_EVENT, this.onUpdate);
      this.render();
    }

    render() {
      if (!this.panel) return;

      // Save scroll
      const prevScroll = this.scrollTop;

      const state = getInspectraErudaState();
      const ev = state.webrtcEvents;
      const peerList = this.peers(ev);
      const trkList = this.trks(ev);

      if (!this.peerId && peerList.length) this.peerId = peerList[peerList.length - 1]!.peerId;
      const sp = peerList.find((p) => p.peerId === this.peerId);

      // Tabs
      const tabData: [TabId, string, number | undefined][] = [
        ['devices', 'Devices', state.webrtcDevices?.length],
        ['peers', 'Peers', peerList.length || undefined],
        ['tracks', 'Tracks', trkList.length || undefined]
      ];
      const tabs = tabData.map(([id, lbl, cnt]) =>
        `<button class="rtc-tab${id === this.tab ? ' on' : ''}" data-tab="${id}">${lbl}${cnt ? ` (${cnt})` : ''}</button>`
      ).join('');

      // Peer bar
      let bar = '';
      if (this.tab === 'peers' && peerList.length) {
        const opts = peerList.map((p) => {
          const sel = p.peerId === this.peerId ? ' selected' : '';
          return `<option value="${esc(p.peerId)}"${sel}>${esc(p.peerId)} — ${esc(p.connectionState)}</option>`;
        }).join('');
        bar = `<div class="rtc-bar"><span class="rtc-dot ${sp ? this.dotCls(sp) : 'off'}"></span><select class="rtc-sel" data-role="psel">${opts}</select><span class="rtc-cnt">${peerList.length} peer${peerList.length > 1 ? 's' : ''}</span></div>`;
      }

      // Content
      let content = '';
      switch (this.tab) {
        case 'devices': content = this.devicesHtml(state.webrtcDevices); break;
        case 'peers': content = this.peersHtml(ev, peerList); break;
        case 'tracks': content = this.tracksHtml(ev); break;
      }

      this.panel.html(`<div class="rtc"><style>${CSS}</style>
        <div class="rtc-tabs">${tabs}</div>${bar}
        <div class="rtc-body">${content}</div>
      </div>`);

      // Restore scroll & bind
      requestAnimationFrame(() => {
        const el = this.scrollEl();
        if (el) {
          el.scrollTop = prevScroll;
          el.removeEventListener('scroll', this.onScroll);
          el.addEventListener('scroll', this.onScroll, { passive: true });
        }
        this.bind();
      });
    }

    private bind() {
      // Use querySelectorAll on the whole document — Eruda puts tool content in the main DOM
      const allBtns = document.querySelectorAll<HTMLElement>('.rtc [data-tab]');
      allBtns.forEach((btn) => btn.addEventListener('click', () => { this.tab = btn.dataset.tab as TabId; this.scrollTop = 0; this.render(); }));

      const sels = document.querySelectorAll<HTMLSelectElement>('.rtc [data-role="psel"]');
      sels.forEach((sel) => {
        sel.addEventListener('change', () => { this.peerId = sel.value; this.scrollTop = 0; this.render(); });
        sel.addEventListener('blur', () => { if (this.timer) { clearTimeout(this.timer); this.timer = null; this.render(); } });
      });

      document.querySelectorAll<HTMLElement>('.rtc [data-sdp]').forEach((btn) =>
        btn.addEventListener('click', () => { this.sdpView = btn.dataset.sdp as 'local' | 'remote'; this.render(); })
      );

      document.querySelectorAll<HTMLElement>('.rtc [data-tid]').forEach((card) =>
        card.addEventListener('click', () => { this.trackId = this.trackId === card.dataset.tid ? null : card.dataset.tid!; this.render(); })
      );
    }

    show() { this.panel?.show(); return this; }
    hide() { this.panel?.hide(); return this; }
    destroy() {
      window.removeEventListener(INSPECTRA_WEBRTC_EVENT, this.onUpdate);
      if (this.timer) clearTimeout(this.timer);
      super.destroy();
    }
  }
  return new WebRtcTool();
};
