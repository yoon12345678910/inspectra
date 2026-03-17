import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { bootstrapInspectraErudaRuntime } from '@inspectra/eruda-runtime';

export default defineUnlistedScript(() => {
  bootstrapInspectraErudaRuntime();
});
