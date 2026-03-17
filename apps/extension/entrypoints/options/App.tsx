import { useEffect, useState, type CSSProperties } from 'react';
import { defaultSettings, type OverlaySettings } from '@inspectra/core';
import { browser } from 'wxt/browser';

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 6
};

const checkboxStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center'
};

const cardStyle: CSSProperties = {
  background: '#ffffff',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 18px 60px rgba(13, 18, 24, 0.08)'
};

export default function App() {
  const [settings, setSettings] = useState<OverlaySettings>(defaultSettings());
  const [savedAt, setSavedAt] = useState<string>('');

  useEffect(() => {
    browser.storage.local.get('overlaySettings').then((stored) => {
      setSettings({
        ...defaultSettings(),
        ...(stored.overlaySettings as Partial<OverlaySettings> | undefined)
      });
    });
  }, []);

  const save = async (next: OverlaySettings) => {
    setSettings(next);
    await browser.storage.local.set({
      overlaySettings: next
    });
    setSavedAt(new Date().toLocaleTimeString());
  };

  const updateBoolean = (key: keyof Pick<
    OverlaySettings,
    'redactionEnabled' | 'captureNetworkBodies' | 'captureWebSocketPayloads' | 'collapsedByDefault'
  >) => {
    const next = {
      ...settings,
      [key]: !settings[key]
    };
    void save(next);
  };

  const updateNumber = (
    key: keyof Pick<
      OverlaySettings,
      'maxEventBuffer' | 'maxBodyPreviewBytes' | 'maxWsPreviewBytes'
    >,
    value: string
  ) => {
    const next = {
      ...settings,
      [key]: Number(value)
    };
    void save(next);
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(160deg, #f7efe8 0%, #f0f6f8 45%, #ffffff 100%)',
        color: '#0c1115',
        fontFamily:
          '"IBM Plex Sans", "Segoe UI", "Helvetica Neue", sans-serif',
        padding: 32
      }}
    >
      <section style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div>
          <div style={{ letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 12, color: '#8f4a31' }}>
            Inspectra
          </div>
          <h1 style={{ margin: '8px 0 0', fontSize: 36 }}>Overlay Debugger Settings</h1>
          <p style={{ maxWidth: 560, color: '#46535f', lineHeight: 1.6 }}>
            Redaction stays on by default. These options tune how much payload data the overlay keeps in memory and exports.
          </p>
          {savedAt ? <p style={{ color: '#6b7781' }}>Saved at {savedAt}</p> : null}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={checkboxStyle}>
              <input
                type="checkbox"
                checked={settings.redactionEnabled}
                onChange={() => updateBoolean('redactionEnabled')}
              />
              <span>Enable redaction by default</span>
            </label>
            <label style={checkboxStyle}>
              <input
                type="checkbox"
                checked={settings.captureNetworkBodies}
                onChange={() => updateBoolean('captureNetworkBodies')}
              />
              <span>Capture HTTP body previews</span>
            </label>
            <label style={checkboxStyle}>
              <input
                type="checkbox"
                checked={settings.captureWebSocketPayloads}
                onChange={() => updateBoolean('captureWebSocketPayloads')}
              />
              <span>Capture WebSocket payload previews</span>
            </label>
            <label style={checkboxStyle}>
              <input
                type="checkbox"
                checked={settings.collapsedByDefault}
                onChange={() => updateBoolean('collapsedByDefault')}
              />
              <span>Start with the overlay collapsed</span>
            </label>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={fieldStyle}>
              <span>Max buffered events</span>
              <input
                type="number"
                value={settings.maxEventBuffer}
                onChange={(event) => updateNumber('maxEventBuffer', event.target.value)}
              />
            </label>
            <label style={fieldStyle}>
              <span>Max HTTP body preview bytes</span>
              <input
                type="number"
                value={settings.maxBodyPreviewBytes}
                onChange={(event) => updateNumber('maxBodyPreviewBytes', event.target.value)}
              />
            </label>
            <label style={fieldStyle}>
              <span>Max WebSocket preview bytes</span>
              <input
                type="number"
                value={settings.maxWsPreviewBytes}
                onChange={(event) => updateNumber('maxWsPreviewBytes', event.target.value)}
              />
            </label>
          </div>
        </div>
      </section>
    </main>
  );
}
