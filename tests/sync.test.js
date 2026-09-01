const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('fs');

// Verifica que supabase.sql tem RLS + Realtime
describe('supabase.sql', ()=>{
  const sql = readFileSync('supabase.sql','utf8');
  it('tem tabelas', ()=>{ assert.match(sql, /create table if not exists threads/); assert.match(sql, /create table if not exists notes/); });
  it('tem RLS', ()=>{ assert.match(sql, /enable row level security/); assert.match(sql, /auth\.uid\(\) = user_id/); });
  it('tem Realtime', ()=>{ assert.match(sql, /supabase_realtime add table notes/); });
  it('revoga execute público do event trigger de auto-RLS', ()=>{ assert.match(sql, /revoke execute on function public\.rls_auto_enable\(\) from anon, authenticated, public/); });
});

// Verifica manifest e icons
describe('PWA', ()=>{
  it('manifest tem icons', ()=>{
    const m = JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
    assert.ok(m.icons.length >= 2);
    assert.ok(m.icons.find(i=>i.src.includes('logo')));
    assert.equal(m.short_name, 'SaveChat');
  });
  it('sw.js é v82', ()=>{
    const sw=readFileSync('public/sw.js','utf8');
    assert.match(sw, /notethread-v82/);
  });
  it('CHANGELOG é servido pelo site (toast "what\'s new" em prod)', ()=>{
    assert.ok(existsSync('public/CHANGELOG.md'));
  });
});
