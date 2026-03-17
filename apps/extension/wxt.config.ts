import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Inspectra',
    description: 'Overlay debugger for live web pages.',
    permissions: ['activeTab', 'debugger', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Toggle Inspectra'
    },
    web_accessible_resources: [
      {
        resources: ['main-world.js'],
        matches: ['<all_urls>']
      }
    ]
  }
});
