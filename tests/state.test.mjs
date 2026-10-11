import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFile, prepareText, textDownload, MAX_IMAGE_BYTES } from '../web/state.js';
test('only bounded supported images are accepted', () => {
  assert.equal(validateFile({ type: 'image/png', size: 1200 }), '');
  for (const file of [{ type: 'image/svg+xml', size: 30 }, { type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 }, { type: 'image/png', size: 0 }]) assert.ok(validateFile(file));
});
test('text is preserved rather than split destructively on every period', () => {
  assert.equal(prepareText('  Version 1.2.\r\nNext line.  '), 'Version 1.2.\nNext line.');
});
test('downloads include both real outputs and no placeholder translation', () => {
  assert.equal(textDownload('Hello', ''), 'ENGLISH\n\nHello\n');
  assert.ok(textDownload('Hello', 'سلام').includes('فارسی\n\nسلام'));
});
