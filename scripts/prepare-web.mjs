import { copyFile, mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(root, 'web/vendor');
await mkdir(path.join(vendor, 'core'), { recursive: true });
await mkdir(path.join(vendor, 'lang'), { recursive: true });
for (const file of ['tesseract.min.js', 'worker.min.js']) {
  await copyFile(path.join(root, 'node_modules/tesseract.js/dist', file), path.join(vendor, file));
}
for (const file of await readdir(path.join(root, 'node_modules/tesseract.js-core'))) {
  if (file.endsWith('.wasm') || file.endsWith('.wasm.js')) {
    await copyFile(path.join(root, 'node_modules/tesseract.js-core', file), path.join(vendor, 'core', file));
  }
}
await copyFile(path.join(root, 'node_modules/tesseract.js/LICENSE.md'), path.join(vendor, 'TESSERACT-JS-LICENSE'));
await copyFile(path.join(root, 'node_modules/tesseract.js-core/LICENSE'), path.join(vendor, 'TESSERACT-CORE-LICENSE'));
const languageFile = path.join(vendor, 'lang/eng.traineddata');
const url = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata';
const gitBlobSha = 'bbef4675053b5b468cdb477053e28b1c698ba08e';
const valid = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') === gitBlobSha;
let bytes;
try { bytes = await readFile(languageFile); } catch { bytes = Buffer.alloc(0); }
if (!valid(bytes)) {
  const temporary = `${languageFile}.download`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`English model download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(temporary, bytes);
  } catch {
    await promisify(execFile)(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--silent', '--show-error', '--fail', '--location', '--connect-timeout', '15', '--max-time', '180', '--output', temporary, url], { windowsHide: true, timeout: 185000 });
    bytes = await readFile(temporary);
  }
  if (!valid(bytes)) throw new Error('English model checksum does not match the pinned GitHub blob. Retry prepare:web.');
  await rename(temporary, languageFile);
}
await writeFile(path.join(vendor, 'lang/source.json'), JSON.stringify({ url, gitBlobSha, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
console.log('Browser OCR assets prepared locally. No image is uploaded for recognition.');
