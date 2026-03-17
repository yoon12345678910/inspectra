import type { DebugEvent, OverlaySettings } from '@inspectra/core';

export interface AgentBootstrapPayload {
  sessionId: string;
  settings: OverlaySettings;
}

export type ContentToAgentMessage =
  | {
      channel: string;
      source: 'inspectra-content';
      type: 'agent:bootstrap';
      payload: AgentBootstrapPayload;
    }
  | {
      channel: string;
      source: 'inspectra-content';
      type: 'inspect:set-active';
      payload: { active: boolean };
    }
  | {
      channel: string;
      source: 'inspectra-content';
      type: 'settings:update';
      payload: OverlaySettings;
    }
  | {
      channel: string;
      source: 'inspectra-content';
      type: 'storage:snapshot:request';
      payload: undefined;
    };

export type AgentToContentMessage =
  | {
      channel: string;
      source: 'inspectra-agent';
      type: 'agent:events';
      payload: { events: DebugEvent[] };
    }
  | {
      channel: string;
      source: 'inspectra-agent';
      type: 'agent:status';
      payload: { bootstrapped: boolean };
    };

