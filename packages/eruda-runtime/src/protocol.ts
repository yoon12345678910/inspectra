const BRIDGE_CHANNEL = 'inspectra:bridge';

export type InspectraRuntimeMessage =
  | {
      channel: string;
      source: 'inspectra-content';
      type: 'agent:bootstrap';
      payload: { sessionId: string };
    }
  | {
      channel: string;
      source: 'inspectra-content';
      type: 'overlay:set-visible';
      payload: { visible: boolean };
    };

export const postToInspectraRuntime = (
  message: Omit<InspectraRuntimeMessage, 'channel' | 'source'>
) => {
  window.postMessage(
    {
      ...message,
      channel: BRIDGE_CHANNEL,
      source: 'inspectra-content'
    },
    '*'
  );
};

export const isInspectraRuntimeMessage = (
  value: unknown
): value is InspectraRuntimeMessage =>
  typeof value === 'object' &&
  value !== null &&
  (value as { channel?: string }).channel === BRIDGE_CHANNEL &&
  (value as { source?: string }).source === 'inspectra-content';
