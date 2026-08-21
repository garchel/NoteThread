const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Testa lógica pura extraída de public/app.js Store (sem DOM)
// Reimplementa helpers mínimos para não depender de localStorage

function createStore() {
  return {
    data: { threads: {}, folders: {}, notes: {}, ui: { expanded: {} } },
    upsertThread(t) { this.data.threads[t.id] = { ...(this.data.threads[t.id]||{}), ...t }; },
    threadList() { return Object.values(this.data.threads); },
    upsertNote(n) {
      this.data.notes[n.threadId] = this.data.notes[n.threadId] || [];
      const arr = this.data.notes[n.threadId];
      const i = arr.findIndex(x => x.clientId === n.clientId);
      if (i>=0) arr[i] = { ...arr[i], ...n }; else { arr.push(n); arr.sort((a,b)=>(a.sortOrder||a.ts)-(b.sortOrder||b.ts)); }
    },
    pageNotes(threadId, beforeTs, count) {
      const all = (this.data.notes[threadId]||[]).slice().sort((a,b)=>(a.sortOrder!=null?a.sortOrder:a.ts)-(b.sortOrder!=null?b.sortOrder:b.ts));
      const key = x => x.sortOrder!=null?x.sortOrder:x.ts;
      const idx = beforeTs==null ? all.length : all.findIndex(x=>key(x)>=beforeTs);
      const end = idx<0?all.length:idx;
      const start=Math.max(0,end-count);
      return { items: all.slice(start,end), hasMore:start>0 };
    }
  };
}

describe('Store', () => {
  let s;
  beforeEach(()=>{ s=createStore(); });

  it('upsertThread cria e atualiza', ()=>{
    s.upsertThread({ id:'a', name:'Ideias' });
    assert.equal(s.threadList().length, 1);
    s.upsertThread({ id:'a', name:'Ideias 2' });
    assert.equal(s.data.threads.a.name, 'Ideias 2');
  });

  it('pageNotes lazy loading', ()=>{
    for(let i=0;i<60;i++) s.upsertNote({ threadId:'t1', clientId:'c'+i, text:'n'+i, ts:1000+i, sortOrder:i });
    const p1=s.pageNotes('t1', null, 25);
    assert.equal(p1.items.length,25);
    assert.equal(p1.hasMore,true);
    const p2=s.pageNotes('t1', p1.items[0].sortOrder, 25);
    assert.equal(p2.items.length,25);
  });

  it('upsertNote ordena por sortOrder', ()=>{
    s.upsertNote({ threadId:'t1', clientId:'c2', text:'b', ts:2000, sortOrder:2 });
    s.upsertNote({ threadId:'t1', clientId:'c1', text:'a', ts:1000, sortOrder:1 });
    assert.equal(s.data.notes.t1[0].clientId,'c1');
  });
});
