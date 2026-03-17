import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { create } from 'zustand';
import {
  RingBuffer,
  defaultSettings,
  type DebugEvent,
  type InspectEvent,
  type OverlaySettings,
  type RuntimeCapabilities
} from '@inspectra/core';

type PanelId =
  | 'console'
  | 'elements'
  | 'network'
  | 'websocket'
  | 'performance'
  | 'webrtc'
  | 'export';

interface OverlayState {
  visible: boolean;
  inspectActive: boolean;
  activePanel: PanelId;
  settings: OverlaySettings;
  capabilities: RuntimeCapabilities;
  events: DebugEvent[];
  ringBuffer: RingBuffer<DebugEvent>;
  setVisible: (next: boolean) => void;
  setInspectActive: (next: boolean) => void;
  setActivePanel: (panel: PanelId) => void;
  setSettings: (settings: OverlaySettings) => void;
  setCapabilities: (capabilities: RuntimeCapabilities) => void;
  pushEvents: (events: DebugEvent[]) => void;
  clearEvents: () => void;
}

export const useOverlayStore = create<OverlayState>()((set, get) => ({
  visible: false,
  inspectActive: false,
  activePanel: 'console',
  settings: defaultSettings(),
  capabilities: {
    consoleHook: true,
    errorHook: true,
    elementInspector: true,
    networkHttp: true,
    networkWebSocket: true,
    longTask: true,
    webRtcStats: true,
    storageSnapshot: true,
    chromiumDeepMode: false,
    devtoolsPanel: false,
    sameOriginIframeInspect: false
  },
  events: [],
  ringBuffer: new RingBuffer<DebugEvent>(defaultSettings().maxEventBuffer),
  setVisible: (visible) => set({ visible }),
  setInspectActive: (inspectActive) => set({ inspectActive }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setSettings: (settings) => {
    const ringBuffer = new RingBuffer<DebugEvent>(settings.maxEventBuffer);
    ringBuffer.pushMany(get().events);
    set({
      settings,
      ringBuffer,
      events: ringBuffer.toArray()
    });
  },
  setCapabilities: (capabilities) => set({ capabilities }),
  pushEvents: (events) => {
    const ringBuffer = get().ringBuffer;
    ringBuffer.pushMany(events);
    set({ events: ringBuffer.toArray() });
  },
  clearEvents: () => {
    get().ringBuffer.clear();
    set({ events: [] });
  }
}));

const shellStyle: Record<string, string | number> = {
  position: 'fixed',
  right: 20,
  bottom: 20,
  width: 440,
  maxWidth: 'min(440px, calc(100vw - 24px))',
  height: 'min(72vh, 760px)',
  background: '#0e1418',
  color: '#f6f7f8',
  borderRadius: 18,
  boxShadow: '0 20px 80px rgba(0, 0, 0, 0.35)',
  zIndex: 2147483647,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily:
    '"IBM Plex Sans", "Segoe UI", "Helvetica Neue", sans-serif'
};

const panelButtonStyle = (active: boolean): Record<string, string | number> => ({
  border: 'none',
  background: active ? '#ff6a3d' : 'transparent',
  color: active ? '#111' : '#d8dcdf',
  borderRadius: 999,
  padding: '8px 12px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600
});

const sectionCardStyle: Record<string, string | number> = {
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 12,
  padding: 12,
  marginBottom: 10,
  border: '1px solid rgba(255,255,255,0.04)'
};

const EventRow = ({ title, subtitle, detail }: { title: string; subtitle?: string; detail?: string }) => (
  <div style={sectionCardStyle}>
    <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
    {subtitle ? <div style={{ marginTop: 6, fontSize: 12, color: '#adb5bb' }}>{subtitle}</div> : null}
    {detail ? (
      <pre
        style={{
          marginTop: 8,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 11,
          color: '#dfe6eb'
        }}
      >
        {detail}
      </pre>
    ) : null}
  </div>
);

const ConsolePanel = ({ events }: { events: DebugEvent[] }) => {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<'all' | 'log' | 'info' | 'warn' | 'error' | 'debug'>('all');

  const filtered = useMemo(
    () =>
      events
        .filter((event) => event.type === 'console' || event.type === 'runtime-error')
        .filter((event) => {
          if (event.type === 'console' && level !== 'all' && event.level !== level) {
            return false;
          }
          if (!query) {
            return true;
          }
          return JSON.stringify(event).toLowerCase().includes(query.toLowerCase());
        }),
    [events, level, query]
  );

  return (
    <div>
      <FilterBar query={query} onQueryChange={setQuery} extra={
        <select value={level} onChange={(event) => setLevel(event.target.value as typeof level)} style={selectStyle}>
          <option value="all">All levels</option>
          <option value="log">log</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
          <option value="debug">debug</option>
        </select>
      } />
      {filtered.map((event) =>
        event.type === 'console' ? (
          <EventRow
            key={event.id}
            title={`${event.level.toUpperCase()} · ${new Date(event.ts).toLocaleTimeString()}`}
            detail={JSON.stringify(event.args, null, 2)}
          />
        ) : (
          <EventRow
            key={event.id}
            title={`${event.kind} · ${event.message}`}
            subtitle={event.source}
            detail={event.stack}
          />
        )
      )}
    </div>
  );
};

const ElementsPanel = ({ events }: { events: DebugEvent[] }) => {
  const selected = [...events]
    .reverse()
    .find((event): event is InspectEvent => event.type === 'inspect' && event.action === 'select');

  if (!selected) {
    return <EmptyState title="선택된 요소가 없습니다." description="Inspect 버튼을 눌러 페이지 요소를 선택하세요." />;
  }

  return (
    <div>
      <EventRow
        title={selected.selector ?? selected.tagName}
        subtitle={selected.domPath}
        detail={JSON.stringify(
          {
            rect: selected.rect,
            boxModel: selected.boxModel,
            computed: selected.computedStyleSummary,
            textPreview: selected.textPreview
          },
          null,
          2
        )}
      />
    </div>
  );
};

const NetworkPanel = ({ events }: { events: DebugEvent[] }) => {
  const [query, setQuery] = useState('');
  const items = useMemo(
    () =>
      events
        .filter((event) => event.type === 'network-http')
        .filter((event) => JSON.stringify(event).toLowerCase().includes(query.toLowerCase())),
    [events, query]
  );

  return (
    <div>
      <FilterBar query={query} onQueryChange={setQuery} />
      {items.map((event) => (
        <EventRow
          key={event.id}
          title={`${event.method} ${event.status ?? 'ERR'} · ${Math.round(event.durationMs ?? 0)}ms`}
          subtitle={event.url}
          detail={JSON.stringify(
            {
              requestHeaders: event.requestHeaders,
              responseHeaders: event.responseHeaders,
              requestBodyPreview: event.requestBodyPreview,
              responseBodyPreview: event.responseBodyPreview,
              errorReason: event.errorReason
            },
            null,
            2
          )}
        />
      ))}
    </div>
  );
};

const WebSocketPanel = ({ events }: { events: DebugEvent[] }) => {
  const [query, setQuery] = useState('');
  const items = useMemo(
    () =>
      events
        .filter((event) => event.type === 'network-ws')
        .filter((event) => JSON.stringify(event).toLowerCase().includes(query.toLowerCase())),
    [events, query]
  );

  return (
    <div>
      <FilterBar query={query} onQueryChange={setQuery} />
      {items.map((event) => (
        <EventRow
          key={event.id}
          title={`${event.phase.toUpperCase()} · ${event.byteLength ?? 0} bytes`}
          subtitle={event.url}
          detail={event.preview}
        />
      ))}
    </div>
  );
};

const PerformancePanel = ({ events }: { events: DebugEvent[] }) => {
  const items = events.filter((event) => event.type === 'perf');
  return (
    <div>
      {items.map((event) => (
        <EventRow
          key={event.id}
          title={event.metric}
          detail={JSON.stringify(event.data, null, 2)}
        />
      ))}
    </div>
  );
};

const WebRtcPanel = ({ events }: { events: DebugEvent[] }) => {
  const items = events.filter((event) => event.type === 'webrtc');
  return (
    <div>
      {items.length === 0 ? (
        <EmptyState title="활성 PeerConnection이 없습니다." description="WebRTC 연결이 만들어지면 상태와 stats가 표시됩니다." />
      ) : (
        items.map((event) => (
          <EventRow
            key={event.id}
            title={`${event.phase} · ${event.peerId}`}
            detail={JSON.stringify(event.data, null, 2)}
          />
        ))
      )}
    </div>
  );
};

const ExportPanel = ({
  sessionId,
  onExport
}: {
  sessionId: string;
  onExport: () => void;
}) => {
  const settings = useOverlayStore((state) => state.settings);
  return (
    <div>
      <EventRow
        title={`Session ${sessionId}`}
        detail={JSON.stringify(
          {
            redactionEnabled: settings.redactionEnabled,
            captureNetworkBodies: settings.captureNetworkBodies,
            captureWebSocketPayloads: settings.captureWebSocketPayloads,
            maxEventBuffer: settings.maxEventBuffer
          },
          null,
          2
        )}
      />
      <button style={actionButtonStyle('#ff6a3d', '#111')} onClick={onExport}>
        JSON Export
      </button>
    </div>
  );
};

const selectStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: '#f6f7f8',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  padding: '8px 10px'
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'rgba(255,255,255,0.08)',
  color: '#f6f7f8',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  padding: '8px 10px'
};

const FilterBar = ({
  query,
  onQueryChange,
  extra
}: {
  query: string;
  onQueryChange: (next: string) => void;
  extra?: ReactNode;
}) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
    <input
      placeholder="Search"
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      style={inputStyle}
    />
    {extra}
  </div>
);

const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <div style={{ ...sectionCardStyle, textAlign: 'center', paddingTop: 24, paddingBottom: 24 }}>
    <div style={{ fontWeight: 700 }}>{title}</div>
    <div style={{ marginTop: 8, color: '#adb5bb', fontSize: 13 }}>{description}</div>
  </div>
);

const actionButtonStyle = (background: string, color: string): CSSProperties => ({
  border: 'none',
  background,
  color,
  borderRadius: 999,
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 700
});

export interface OverlayAppProps {
  sessionId: string;
  onInspectToggle: (next: boolean) => void;
  onExport: () => void;
  onClose: () => void;
}

export const OverlayApp = ({
  sessionId,
  onInspectToggle,
  onExport,
  onClose
}: OverlayAppProps) => {
  const visible = useOverlayStore((state) => state.visible);
  const inspectActive = useOverlayStore((state) => state.inspectActive);
  const activePanel = useOverlayStore((state) => state.activePanel);
  const events = useOverlayStore((state) => state.events);
  const capabilities = useOverlayStore((state) => state.capabilities);
  const setInspectActive = useOverlayStore((state) => state.setInspectActive);
  const setActivePanel = useOverlayStore((state) => state.setActivePanel);
  const clearEvents = useOverlayStore((state) => state.clearEvents);

  if (!visible) {
    return (
      <button
        style={{
          ...actionButtonStyle('#ff6a3d', '#111'),
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 2147483647
        }}
        onClick={() => useOverlayStore.getState().setVisible(true)}
      >
        Inspectra
      </button>
    );
  }

  const panels: Array<{ id: PanelId; label: string }> = [
    { id: 'console', label: 'Console' },
    { id: 'elements', label: 'Elements' },
    { id: 'network', label: 'Network' },
    { id: 'websocket', label: 'WebSocket' },
    { id: 'performance', label: 'Perf' },
    { id: 'webrtc', label: 'WebRTC' },
    { id: 'export', label: 'Export' }
  ];

  const panelContent = (() => {
    switch (activePanel) {
      case 'console':
        return <ConsolePanel events={events} />;
      case 'elements':
        return <ElementsPanel events={events} />;
      case 'network':
        return <NetworkPanel events={events} />;
      case 'websocket':
        return <WebSocketPanel events={events} />;
      case 'performance':
        return <PerformancePanel events={events} />;
      case 'webrtc':
        return <WebRtcPanel events={events} />;
      case 'export':
        return <ExportPanel sessionId={sessionId} onExport={onExport} />;
      default:
        return null;
    }
  })();

  return (
    <div style={shellStyle}>
      <div
        style={{
          padding: 14,
          background:
            'linear-gradient(135deg, rgba(255,106,61,0.25), rgba(36,48,58,0.9))'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: '#f9c6b6' }}>
              Inspectra
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Overlay Debugger</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={actionButtonStyle(inspectActive ? '#ffe95a' : '#182026', inspectActive ? '#111' : '#f6f7f8')}
              onClick={() => {
                const next = !inspectActive;
                setInspectActive(next);
                onInspectToggle(next);
              }}
            >
              {inspectActive ? 'Inspecting' : 'Inspect'}
            </button>
            <button style={actionButtonStyle('#182026', '#f6f7f8')} onClick={clearEvents}>
              Clear
            </button>
            <button style={actionButtonStyle('#182026', '#f6f7f8')} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {panels.map((panel) => (
            <button
              key={panel.id}
              style={panelButtonStyle(activePanel === panel.id)}
              onClick={() => setActivePanel(panel.id)}
            >
              {panel.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 14, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
        <EventRow
          title={`${events.length} buffered events`}
          subtitle={`Session ${sessionId}`}
          detail={undefined}
        />
        <EventRow
          title={capabilities.chromiumDeepMode ? 'Chromium deep mode ready' : 'Overlay-only mode'}
          subtitle="Deep mode adapter is scaffolded but disabled."
        />
      </div>

      <div style={{ padding: '0 14px 14px', overflow: 'auto', flex: 1 }}>{panelContent}</div>
    </div>
  );
};
