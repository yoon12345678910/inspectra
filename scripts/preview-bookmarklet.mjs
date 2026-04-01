import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'bookmarklet');
const PORT = Number(process.env.PORT) || 5555;

// Build first
console.log('Building bookmarklet...');
execSync('node scripts/build-bookmarklet.mjs', { cwd: rootDir, stdio: 'inherit' });

const bookmarkletJs = await readFile(path.join(distDir, 'inspectra-bookmarklet.js'), 'utf8');
const jsUrl = `http://localhost:${PORT}/inspectra-bookmarklet.js`;
const bookmarkletUrl = `javascript:(function(){var w=window;if(w.__inspectraBookmarkletLaunch){w.__inspectraBookmarkletLaunch();return;}var d=document,s=d.createElement('script');s.src='${jsUrl}?t='+Date.now();s.async=true;d.documentElement.appendChild(s);}());`;

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inspectra Bookmarklet</title>
  <style>
    body { font-family: -apple-system, 'Pretendard', sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; color: #222; }
    h1 { font-size: 24px; }
    .bookmarklet-link {
      display: inline-block;
      padding: 12px 24px;
      background: #2563eb;
      color: #fff;
      text-decoration: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: grab;
      margin: 20px 0;
    }
    .bookmarklet-link:hover { background: #1d4ed8; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    pre { background: #f1f5f9; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
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
    <a class="bookmarklet-link" href="${bookmarkletUrl.replaceAll('"', '&quot;')}">Inspectra</a>
    <p>이후 아무 페이지에서 북마크를 클릭하면 Inspectra가 실행됩니다.</p>
  </div>

  <div class="or">
    <h3>방법 2: 이 페이지에서 바로 실행</h3>
    <p>버튼을 클릭하면 이 페이지에 Inspectra가 주입됩니다:</p>
    <button onclick="var s=document.createElement('script');s.src='${jsUrl}?t='+Date.now();document.documentElement.appendChild(s);">
      Inspectra 실행
    </button>
  </div>

  <div class="step">
    <h3>방법 3: 콘솔에서 실행</h3>
    <p>DevTools 콘솔을 열고 아래 코드를 붙여넣으세요:</p>
    <pre>var s=document.createElement('script');s.src='${jsUrl}?t='+Date.now();document.documentElement.appendChild(s);</pre>
  </div>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;">
  <p style="opacity: 0.6; font-size: 13px;"><code>dist/bookmarklet/</code> 디렉토리를 포트 ${PORT}에서 서빙 중</p>
</body>
</html>`;

const MIME = {
  '.js': 'application/javascript',
  '.html': 'text/html',
  '.txt': 'text/plain',
  '.md': 'text/plain'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders });
    res.end(html);
    return;
  }

  const filePath = path.join(distDir, url.pathname);
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      ...corsHeaders
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\nInspectra Bookmarklet Preview`);
  console.log(`────────────────────────────`);
  console.log(`Open:  http://localhost:${PORT}`);
  console.log(`JS:    ${jsUrl}`);
  console.log(`\nDrag the bookmarklet link to your bookmark bar, or click "Launch" to test.\n`);
});
