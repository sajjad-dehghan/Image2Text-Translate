export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
export const MAX_TEXT_LENGTH = 12000;
export function validateFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'فقط عکس PNG، JPG یا WEBP انتخاب کن.';
  if (!file.size || file.size > MAX_IMAGE_BYTES) return 'حجم عکس باید بیشتر از صفر و حداکثر ۱۰ مگابایت باشه.';
  return '';
}
export function prepareText(value) { return value.replace(/\r\n?/g, '\n').trim(); }
export function textDownload(original, translated) {
  return `ENGLISH\n\n${prepareText(original)}${translated.trim() ? `\n\nفارسی\n\n${translated.trim()}` : ''}\n`;
}
