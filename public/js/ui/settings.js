import { $ } from '../utils.js';
import { CUELUME_SOUNDS, Sound } from '../sound.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';

export const SettingsMethods = {
bindSettings() {
      this.dom.btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSettingsPopover();
      });
      document.addEventListener('click', (e) => {
        const p = this.dom.settingsPopover;
        if (!p.classList.contains('hidden') && !p.contains(e.target) && e.target !== this.dom.btnSettings) {
          p.classList.add('hidden');
        }
      });
      const p = this.dom.settingsPopover;
      // tema + ações data-set
      p.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => this.handleSetting(b.dataset.set, b.dataset.val)));
      // tema ativo
      const theme = (Store.data && Store.data.ui && Store.data.ui.theme) || 'lavender';
      p.querySelectorAll('[data-set="theme"]').forEach((b) => b.classList.toggle('active', b.dataset.val === theme));
      // ordenação ativa
      const sort = (Store.data && Store.data.ui && Store.data.ui.sort) || 'recent';
      p.querySelectorAll('[data-set="sort"]').forEach((b) => b.classList.toggle('active', b.dataset.val === sort));
      // aplica o tema salvo (resolve "auto")
      this.applyTheme();
      // reage a mudanças de tema do sistema quando em "auto"
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          const t = (Store.data && Store.data.ui && Store.data.ui.theme) || 'lavender';
          if (t === 'auto') this.applyTheme();
        });
      }

      // ---- Sons (cuelume) ----
      Sound.load();
      const s = (Store.data.ui && Store.data.ui.sounds) || { enabled: false, volume: 0.6, map: {} };
      const en = $('#sound-enabled'); if (en) en.checked = !!s.enabled;
      const vol = $('#sound-volume'); if (vol) vol.value = (typeof s.volume === 'number' ? s.volume : 0.6);
      // ---- Checklists: ocultar concluídos ----
      const hd = $('#chk-hide-done');
      if (hd) {
        hd.checked = !!(Store.data.ui && Store.data.ui.hideDoneChecks);
        hd.addEventListener('change', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.hideDoneChecks = hd.checked; Store.save();
          if (this.activeThread) { this.renderedClientIds = new Set(); this.renderMessages(true); }
        });
      }
      // preenche selects com a lista de sons do cuelume
      const selects = p.querySelectorAll('select[data-sound]');
      selects.forEach((sel) => {
        const action = sel.dataset.sound;
        CUELUME_SOUNDS.forEach((name) => {
          const o = document.createElement('option'); o.value = name; o.textContent = name;
          sel.appendChild(o);
        });
        sel.value = (s.map && s.map[action]) || '';
        sel.addEventListener('change', () => {
          Store.data.ui.sounds = Store.data.ui.sounds || { enabled: false, volume: 0.6, map: {} };
          Store.data.ui.sounds.map = Store.data.ui.sounds.map || {};
          Store.data.ui.sounds.map[action] = sel.value || undefined;
          Store.save();
          if (sel.value) { Sound.play(action); } // pré-escuta
        });
      });
      if (en) en.addEventListener('change', () => {
        Store.data.ui.sounds = Store.data.ui.sounds || {};
        Store.data.ui.sounds.enabled = en.checked; Store.save(); Sound.apply();
        if (en.checked) Sound.play('create');
      });
      if (vol) vol.addEventListener('input', () => {
        Store.data.ui.sounds = Store.data.ui.sounds || {};
        Store.data.ui.sounds.volume = parseFloat(vol.value); Store.save(); Sound.apply();
      });
    },

applyTheme() {
      const theme = (Store.data && Store.data.ui && Store.data.ui.theme) || 'lavender';
      let resolved = theme;
      if (theme === 'auto') {
        const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolved = dark ? 'midnight' : 'lavender';
      }
      document.documentElement.dataset.theme = resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        const colors = { lavender:'#7c5cff', dark:'#191622', mint:'#1faa86', peach:'#ff7a59', ocean:'#2b8fd6', midnight:'#0e1525' };
        meta.setAttribute('content', colors[resolved] || '#7c5cff');
      }
    },

handleSetting(act, val) {
      if (act === 'theme') {
        Store.data.ui = Store.data.ui || {}; Store.data.ui.theme = val; Store.save();
        this.applyTheme();
        this.dom.settingsPopover.querySelectorAll('[data-set="theme"]').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
      } else if (act === 'sort') {
        Store.data.ui = Store.data.ui || {}; Store.data.ui.sort = val; Store.save();
        this.renderTree();
        this.dom.settingsPopover.querySelectorAll('[data-set="sort"]').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
      } else if (act === 'export') {
        const data = JSON.stringify({ threads: Store.data.threads, folders: Store.data.folders, notes: Store.data.notes }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'notethread.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } else if (act === 'clear') {
        if (confirm('Apagar TODAS as conversas, pastas e notas? Esta ação não pode ser desfeita.')) {
          Store.data.threads = {}; Store.data.folders = {}; Store.data.notes = {}; Store.save();
          this.activeThread = null; this.renderedClientIds = new Set(); this.oldestTs = null;
          $('#chat-name').textContent = 'Selecione uma conversa'; $('#messages').querySelectorAll('.bubble,.day-sep').forEach((n) => n.remove());
          $('#empty-state').classList.remove('hidden'); this.dom.btnPin.classList.add('hidden');
          this.setChatActiveUi(false);
          this.renderTree();
          this.dom.settingsPopover.classList.add('hidden');
        }
      } else if (act === 'reconnect') {
        try { if (Sync.ws) Sync.ws.close(); } catch {}
        Sync.connect();
        this.dom.settingsPopover.classList.add('hidden');
      }
    },

toggleSettingsPopover() {
      const p = this.dom.settingsPopover;
      if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
      p.classList.remove('hidden');
      const r = this.dom.btnSettings.getBoundingClientRect();
      const pw = 330, ph = 460;
      let left = r.right - pw;
      let top = r.bottom + 8;
      if (left < 8) left = 8;
      if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
      if (top + ph > window.innerHeight) top = r.top - ph - 8;
      p.style.left = left + 'px';
      p.style.top = top + 'px';
    },
};
