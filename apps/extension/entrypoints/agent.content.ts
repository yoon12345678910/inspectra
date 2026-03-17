import { defineContentScript } from 'wxt/utils/define-content-script';
import { bootstrapInspectraAgent } from '@inspectra/agent-main';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  main() {
    bootstrapInspectraAgent();
  }
});
