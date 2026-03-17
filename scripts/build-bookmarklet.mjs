import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist', 'bookmarklet');
const entryFile = path.join(rootDir, 'apps', 'bookmarklet', 'src', 'index.ts');
const bookmarkletUrl = process.env.INSPECTRA_BOOKMARKLET_URL ?? '__INSPECTRA_BOOKMARKLET_URL__';

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
  const template = `javascript:(function(){var w=window;if(w.__inspectraBookmarkletLaunch){w.__inspectraBookmarkletLaunch();return;}var d=document,s=d.createElement('script');s.src='${bookmarkletUrl}?t='+Date.now();s.async=true;d.documentElement.appendChild(s);}());`;
  await writeFile(path.join(outDir, 'BOOKMARKLET.template.txt'), `${template}\n`, 'utf8');

  if (bookmarkletUrl !== '__INSPECTRA_BOOKMARKLET_URL__') {
    await writeFile(path.join(outDir, 'BOOKMARKLET.txt'), `${template}\n`, 'utf8');
  }

  const guide = `# Inspectra Bookmarklet\n\nBundle: inspectra-bookmarklet.js\n\n1. Host \`inspectra-bookmarklet.js\` on HTTPS.\n2. Replace \`__INSPECTRA_BOOKMARKLET_URL__\` in \`BOOKMARKLET.template.txt\` with the hosted URL.\n3. Save the resulting string as a browser bookmark URL.\n`;
  await writeFile(path.join(outDir, 'README.md'), guide, 'utf8');
};

const main = async () => {
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
