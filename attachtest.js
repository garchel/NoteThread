const { chromium } = require('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  // cria um PNG mínimo (1x1 vermelho) em base64 p/ usar como arquivo
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const tmp = '/tmp/test-attach.png';
  fs.writeFileSync(tmp, Buffer.from(pngB64, 'base64'));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  const need = await page.evaluate(() => { const a = document.querySelector('#auth-screen'); return a && !a.classList.contains('hidden'); });
  if (need) { await page.click('#btn-google'); await page.waitForTimeout(300); }

  await page.click('#btn-new-thread'); await page.waitForTimeout(150);
  await page.fill('#nt-name', 'Anexos'); await page.click('#modal-ok'); await page.waitForTimeout(250);

  // anexa o PNG
  await page.setInputFiles('#file-input', tmp);
  await page.waitForTimeout(300);
  const previewShown = await page.evaluate(() => !document.querySelector('#attach-preview').classList.contains('hidden'));
  const previewImg = await page.locator('#attach-preview img').count();

  // envia a nota (texto + imagem)
  await page.fill('#composer-input', 'veja a imagem');
  await page.click('#btn-send');
  await page.waitForTimeout(400);

  const bubbleImg = await page.locator('.bubble .bubble-img').count();
  const bubbleText = await page.evaluate(() => document.querySelector('.bubble').textContent.includes('veja a imagem'));

  console.log(JSON.stringify({ previewShown, previewImg, bubbleImg, bubbleText, errors }, null, 2));
  await browser.close();
  fs.unlinkSync(tmp);
})().catch(e => { console.error(e); process.exit(1); });