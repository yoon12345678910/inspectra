import {
  DEFAULT_MAX_BODY_PREVIEW_BYTES,
  DEFAULT_MAX_EVENT_BUFFER,
  DEFAULT_MAX_WS_PREVIEW_BYTES
} from './constants';

export interface OverlaySettings {
  redactionEnabled: boolean;
  captureNetworkBodies: boolean;
  captureWebSocketPayloads: boolean;
  collapsedByDefault: boolean;
  maxEventBuffer: number;
  maxBodyPreviewBytes: number;
  maxWsPreviewBytes: number;
}

export const defaultSettings = (): OverlaySettings => ({
  redactionEnabled: true,
  captureNetworkBodies: true,
  captureWebSocketPayloads: true,
  collapsedByDefault: false,
  maxEventBuffer: DEFAULT_MAX_EVENT_BUFFER,
  maxBodyPreviewBytes: DEFAULT_MAX_BODY_PREVIEW_BYTES,
  maxWsPreviewBytes: DEFAULT_MAX_WS_PREVIEW_BYTES
});

