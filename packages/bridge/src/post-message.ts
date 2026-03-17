import { BRIDGE_CHANNEL } from '@inspectra/core';
import type { AgentToContentMessage, ContentToAgentMessage } from './messages';

export const postToAgent = <
  TMessage extends Omit<ContentToAgentMessage, 'channel' | 'source'>
>(
  message: TMessage
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

export const postToContent = <
  TMessage extends Omit<AgentToContentMessage, 'channel' | 'source'>
>(
  message: TMessage
) => {
  window.postMessage(
    {
      ...message,
      channel: BRIDGE_CHANNEL,
      source: 'inspectra-agent'
    },
    '*'
  );
};

export const isInspectraContentMessage = (
  value: unknown
): value is ContentToAgentMessage =>
  typeof value === 'object' &&
  value !== null &&
  (value as { channel?: string }).channel === BRIDGE_CHANNEL &&
  (value as { source?: string }).source === 'inspectra-content';

export const isInspectraAgentMessage = (
  value: unknown
): value is AgentToContentMessage =>
  typeof value === 'object' &&
  value !== null &&
  (value as { channel?: string }).channel === BRIDGE_CHANNEL &&
  (value as { source?: string }).source === 'inspectra-agent';

