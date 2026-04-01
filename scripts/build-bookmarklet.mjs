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

  const indexHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inspectra Bookmarklet</title>
  <style>
    body { font-family: -apple-system, 'Pretendard', sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; color: #222; }
    h1 { font-size: 24px; }
    .bookmarklet-link {
      display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff;
      text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;
      cursor: grab; margin: 20px 0;
    }
    .bookmarklet-link:hover { background: #1d4ed8; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    pre { background: #f1f5f9; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; word-break: break-all; }
    .step { margin: 16px 0; }
    .or { margin: 24px 0; padding: 16px; background: #fffbeb; border-radius: 8px; border: 1px solid #fbbf24; }
    button { padding: 8px 16px; background: #059669; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    button:hover { background: #047857; }
  </style>
</head>
<body>
  <h1>Inspectra Bookmarklet</h1>

  <div class="step">
    <h3>방법 1: 북마크 바에 드래그</h3>
    <p>아래 버튼을 북마크 바로 드래그하세요:</p>
    <a class="bookmarklet-link" href="${template.replaceAll('"', '&quot;')}">Inspectra</a>
    <p>이후 아무 페이지에서 북마크를 클릭하면 Inspectra가 실행됩니다.</p>
  </div>

  <div class="or">
    <h3>방법 2: 이 페이지에서 바로 실행</h3>
    <p>버튼을 클릭하면 이 페이지에 Inspectra가 주입됩니다:</p>
    <button onclick="var s=document.createElement('script');s.src='${url}?t='+Date.now();document.documentElement.appendChild(s);">
      Inspectra 실행
    </button>
  </div>

  <div class="step">
    <h3>방법 3: 콘솔에서 실행</h3>
    <p>DevTools 콘솔을 열고 아래 코드를 붙여넣으세요:</p>
    <pre>var s=document.createElement('script');s.src='${url}?t='+Date.now();document.documentElement.appendChild(s);</pre>
  </div>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;">
  <p style="opacity: 0.6; font-size: 13px;">Inspectra Bookmarklet v0.1.0</p>
</body>
</html>`;
  await writeFile(path.join(outDir, 'index.html'), indexHtml, 'utf8');
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
