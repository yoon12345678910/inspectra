import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist', 'bookmarklet');
const entryFile = path.join(rootDir, 'apps', 'bookmarklet', 'src', 'index.ts');

const loadDotEnv = async () => {
  try {
    const content = await readFile(path.join(rootDir, '.env'), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional
  }
};

const bookmarkletUrl = () => process.env.INSPECTRA_BOOKMARKLET_URL ?? '__INSPECTRA_BOOKMARKLET_URL__';
const relayUrl = () => process.env.INSPECTRA_RELAY_URL ?? '__INSPECTRA_RELAY_URL__';
const relayRoom = () => process.env.INSPECTRA_RELAY_ROOM ?? '__INSPECTRA_RELAY_ROOM__';

const findEsbuild = async () => {
  const pnpmDir = path.join(rootDir, 'node_modules', '.pnpm');
  const entries = await import('node:fs/promises').then(({ readdir }) => readdir(pnpmDir));
  const match = entries.find((entry) => entry.startsWith('esbuild@'));

  if (!match) {
    throw new Error('esbuild was not found under node_modules/.pnpm');
  }

  const esbuildPath = path.join(pnpmDir, match, 'node_modules', 'esbuild', 'lib', 'main.js');
  const esbuildModule = await import(pathToFileURL(esbuildPath).href);
  return esbuildModule;
};

const writeBookmarkletFiles = async () => {
  const url = bookmarkletUrl();
  const template = `javascript:(function(){var w=window;if(w.__inspectraBookmarkletLaunch){w.__inspectraBookmarkletLaunch();return;}var d=document,s=d.createElement('script');s.src='${url}?t='+Date.now();s.async=true;d.documentElement.appendChild(s);}());`;
  await writeFile(path.join(outDir, 'BOOKMARKLET.template.txt'), `${template}\n`, 'utf8');

  if (url !== '__INSPECTRA_BOOKMARKLET_URL__') {
    await writeFile(path.join(outDir, 'BOOKMARKLET.txt'), `${template}\n`, 'utf8');
  }

  const guide = `# Inspectra Bookmarklet\n\nBundle: inspectra-bookmarklet.js\n\n1. Host \`inspectra-bookmarklet.js\` on HTTPS.\n2. Replace \`__INSPECTRA_BOOKMARKLET_URL__\` in \`BOOKMARKLET.template.txt\` with the hosted URL.\n3. Save the resulting string as a browser bookmark URL.\n`;
  await writeFile(path.join(outDir, 'README.md'), guide, 'utf8');
};

const main = async () => {
  await loadDotEnv();
  await mkdir(outDir, { recursive: true });
  const { build } = await findEsbuild();

  await build({
    absWorkingDir: rootDir,
    entryPoints: [entryFile],
    outfile: path.join(outDir, 'inspectra-bookmarklet.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    tsconfig: path.join(rootDir, 'tsconfig.base.json'),
    sourcemap: false,
    minify: true,
    logLevel: 'info',
    define: {
      __INSPECTRA_RELAY_URL__: JSON.stringify(relayUrl()),
      __INSPECTRA_RELAY_ROOM__: JSON.stringify(relayRoom())
    },
    banner: {
      js: '/* Inspectra bookmarklet bundle */'
    }
  });

  await writeBookmarkletFiles();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
