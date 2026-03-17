import type { RuntimeCapabilities } from './capabilities';
import type { OverlaySettings } from './settings';
import type { DebugEvent } from './types';

export interface SessionExportPayload {
  version: 1;
  sessionMeta: {
    sessionId: string;
    pageUrl: string;
    generatedAt: string;
  };
  capabilities: RuntimeCapabilities;
  settingsSnapshot: OverlaySettings;
  redactionReport: {
    enabled: boolean;
  };
  events: DebugEvent[];
}

export const buildSessionExport = (input: {
  sessionId: string;
  pageUrl: string;
  events: DebugEvent[];
  capabilities: RuntimeCapabilities;
  settings: OverlaySettings;
}): SessionExportPayload => ({
  version: 1,
  sessionMeta: {
    sessionId: input.sessionId,
    pageUrl: input.pageUrl,
    generatedAt: new Date().toISOString()
  },
  capabilities: input.capabilities,
  settingsSnapshot: input.settings,
  redactionReport: {
    enabled: input.settings.redactionEnabled
  },
  events: input.events
});

