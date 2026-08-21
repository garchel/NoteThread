// verifica sintaxe ESM de cada módulo como o browser faria
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.join(__dirname, '..', 'public');
const files = ['app.js'];
(function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(path.relative(root, p));
  });
})(path.join(root, 'js'));
let bad = 0;
files.forEach((f) => {
  const full = path.join(root, f);
  try {
    execSync(`node --input-type=module --check -`, { input: fs.readFileSync(full, 'utf8'), stdio: 'pipe' });
    console.log('ok ', f);
  } catch (e) {
    bad++;
    console.log('ERRO', f, '\n', e.stderr.toString().split('\n').slice(0, 6).join('\n'));
  }
});
process.exit(bad ? 1 : 0);
