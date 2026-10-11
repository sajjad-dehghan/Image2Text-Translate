import { validateFile, prepareText, textDownload, MAX_IMAGE_PIXELS, MAX_TEXT_LENGTH } from './state.js';
const $ = (id) => document.getElementById(id);
const original = $('original'), translated = $('translated');
const number = new Intl.NumberFormat('fa-IR');
let image = null, imageUrl = '', worker = null, busy = false, csrf = '', apiReady = false;

function status(message, tone = '') {
  $('status').textContent = message;
  document.querySelector('.status-area').dataset.tone = tone;
}
function sync() {
  const hasText = !!original.value.trim();
  for (const id of ['dropzone', 'sample', 'file']) $(id).disabled = busy;
  $('extract').disabled = busy || !image;
  $('translate').disabled = busy || !hasText || !apiReady;
  $('reset').disabled = busy || (!image && !original.value && !translated.value);
  $('copy-original').disabled = !hasText;
  $('copy-translated').disabled = !translated.value.trim();
  $('download').disabled = !hasText;
  original.disabled = busy;
  $('original-count').textContent = `${number.format(original.value.length)} نویسه`;
  document.querySelector('.workspace').setAttribute('aria-busy', String(busy));
}
async function selectImage(file) {
  if (busy) return;
  const error = validateFile(file);
  if (error) return status(error, 'error');
  const url = URL.createObjectURL(file);
  const check = new Image();
  check.src = url;
  try { await check.decode(); }
  catch { URL.revokeObjectURL(url); return status('این فایل عکس قابل‌خواندن نیست. یک عکس دیگر انتخاب کن.', 'error'); }
  if (check.naturalWidth * check.naturalHeight > MAX_IMAGE_PIXELS) {
    URL.revokeObjectURL(url); return status('ابعاد عکس خیلی بزرگه؛ یک نسخهٔ کوچک‌تر از ۲۴ مگاپیکسل انتخاب کن.', 'error');
  }
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = url; image = file;
  $('preview').src = url; $('preview').hidden = false;
  $('empty-image').hidden = true; $('replace-label').hidden = false;
  $('filename').textContent = file.name;
  original.value = ''; translated.value = ''; $('ocr-quality').textContent = '';
  status('عکس آماده‌ست. برای خواندنش «استخراج متن» رو بزن.'); sync();
}
$('dropzone').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', () => { const file = $('file').files[0]; $('file').value = ''; if (file) selectImage(file); });
for (const event of ['dragenter', 'dragover']) $('dropzone').addEventListener(event, (e) => { e.preventDefault(); if (!busy) $('dropzone').classList.add('dragging'); });
for (const event of ['dragleave', 'drop']) $('dropzone').addEventListener(event, () => $('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) selectImage(e.dataTransfer.files[0]); });
document.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.items ?? [])].find((item) => item.type.startsWith('image/'))?.getAsFile();
  if (file && !busy) { e.preventDefault(); selectImage(file); }
});
$('sample').addEventListener('click', async () => {
  busy = true; sync();
  try {
    const response = await fetch('sample.png', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    busy = false;
    await selectImage(new File([blob], 'نمونهٔ اصلی پروژه.png', { type: 'image/png' }));
  } catch { status('عکس نمونه بارگذاری نشد. می‌تونی عکس خودت رو انتخاب کنی.', 'error'); }
  finally { busy = false; sync(); }
});
$('extract').addEventListener('click', async () => {
  if (!image || busy) return;
  busy = true; sync(); $('progress').hidden = false; $('progress').value = 0;
  translated.value = ''; $('ocr-quality').textContent = '';
  status('در حال آماده‌کردن موتور خواندن متن…');
  let timeout, cancelled = false;
  try {
    const recognize = async () => {
      if (!window.Tesseract) throw new Error('OCR_NOT_READY');
      if (!worker) {
        const created = await window.Tesseract.createWorker('eng', 1, {
        workerPath: new URL('vendor/worker.min.js', location.href).href,
        corePath: new URL('vendor/core/', location.href).href,
        langPath: new URL('vendor/lang', location.href).href,
        gzip: false,
        logger: (message) => {
          if (message.status === 'recognizing text') {
            $('progress').value = message.progress;
            status(`در حال خواندن متن… ${number.format(Math.round(message.progress * 100))}٪`);
          }
        },
        });
        if (cancelled) { await created.terminate(); throw new Error('OCR_TIMEOUT'); }
        worker = created;
      }
      return worker.recognize(image);
    };
    const result = await Promise.race([recognize(), new Promise((_, reject) => { timeout = setTimeout(() => { cancelled = true; reject(new Error('OCR_TIMEOUT')); }, 90000); })]);
    const text = prepareText(result.data.text);
    if (text.length > MAX_TEXT_LENGTH) throw new Error('TEXT_TOO_LONG');
    original.value = text;
    if (text) {
      $('ocr-quality').textContent = `اطمینان OCR: ${number.format(Math.round(result.data.confidence))}٪`;
      status('متن استخراج شد. بررسی و اصلاحش کن، بعد ترجمه رو بزن.', 'success');
    } else status('متنی پیدا نشد. عکس واضح‌تری از نوشتهٔ انگلیسی انتخاب کن.', 'error');
  } catch (error) {
    if (worker) { await worker.terminate().catch(() => {}); worker = null; }
    status(error.message === 'TEXT_TOO_LONG' ? 'متن طولانی‌تر از ۱۲ هزار نویسه‌ست؛ عکس رو به بخش‌های کوچک‌تر تقسیم کن.' : 'استخراج متن انجام نشد. دوباره امتحان کن یا عکس کوچک‌تری انتخاب کن.', 'error');
  } finally { clearTimeout(timeout); busy = false; $('progress').hidden = true; sync(); }
});
original.addEventListener('input', () => {
  if (translated.value) { translated.value = ''; status('متن تغییر کرد؛ برای نتیجهٔ جدید دوباره ترجمه کن.'); }
  sync();
});
$('translate').addEventListener('click', async () => {
  if (busy || !original.value.trim() || !apiReady) return;
  busy = true; translated.value = ''; sync(); status('در حال ترجمهٔ متن به فارسی…');
  try {
    const response = await fetch('api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ text: prepareText(original.value) }), signal: AbortSignal.timeout(50000) });
    const data = await response.json();
    if (!response.ok || !data.translation) throw new Error(data.error || 'ترجمه پاسخی نداد. دوباره امتحان کن.');
    translated.value = data.translation;
    status('ترجمه آماده‌ست. می‌تونی کپی‌اش کنی یا فایل متن رو بگیری.', 'success');
  } catch (error) { status(error.name === 'TimeoutError' ? 'ترجمه بیش از حد طول کشید. متن محفوظ مونده؛ دوباره امتحان کن.' : error.message === 'Failed to fetch' ? 'ارتباط با سرویس ترجمه قطع شد؛ متن استخراج‌شده محفوظ مونده.' : error.message, 'error'); }
  finally { busy = false; sync(); }
});
for (const [id, area] of [['copy-original', original], ['copy-translated', translated]]) $(id).addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(area.value); status('متن کپی شد.', 'success'); }
  catch { area.focus(); area.select(); status('کپی خودکار ممکن نیست؛ متن انتخاب شد، با Ctrl+C کپی کن.'); }
});
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob(['\ufeff', textDownload(original.value, translated.value)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'image2text.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('reset').addEventListener('click', () => {
  if (busy) return;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  image = null; imageUrl = ''; $('preview').removeAttribute('src'); $('preview').hidden = true;
  $('empty-image').hidden = false; $('replace-label').hidden = true;
  $('filename').textContent = 'هنوز تصویری انتخاب نشده'; original.value = ''; translated.value = ''; $('ocr-quality').textContent = '';
  status('برای شروع یک عکس انتخاب کن، یا عکس نمونه رو امتحان کن.'); sync();
});
async function health() {
  try {
    const response = await fetch('api/health', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error();
    const data = await response.json(); csrf = data.csrf; apiReady = data.translation === true;
    $('api-state').textContent = apiReady ? 'اتصال ترجمه آماده‌ست' : 'برای ترجمه، وابستگی‌های پایتون رو نصب کن.';
  } catch { $('api-state').textContent = 'ترجمه به اجرای سرور محلی پایتون نیاز داره.'; }
  sync();
}
window.addEventListener('pagehide', () => { if (imageUrl) URL.revokeObjectURL(imageUrl); worker?.terminate(); });
sync(); health();
