import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { bootstrapInspectraAgent } from '@inspectra/agent-main';

export default defineUnlistedScript(() => {
  bootstrapInspectraAgent();
});
