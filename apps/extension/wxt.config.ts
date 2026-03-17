import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Inspectra',
    description: 'Overlay debugger for live web pages.',
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Toggle Inspectra overlay'
    },
    web_accessible_resources: [
      {
        resources: ['main-world.js'],
        matches: ['<all_urls>']
      }
    ]
  }
});

