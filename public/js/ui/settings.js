import { $ } from '../utils.js';
import { CUELUME_SOUNDS, Sound } from '../sound.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { buildPattern } from '../bg-patterns.js';

export const SettingsMethods = {
bindSettings() {
      // Botão de configurações da barra lateral (nav) — único gatilho do popover
      const anchor = this.dom.navSettings || this.dom.btnSettings;
      if (anchor) {
        anchor.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleSettingsPopover();
        });
      }
      document.addEventListener('click', (e) => {
        const p = this.dom.settingsPopover;
        if (!p.classList.contains('hidden') && !p.contains(e.target) && !anchor?.contains(e.target)) {
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
      // densidade ativa
      const density = (Store.data && Store.data.ui && Store.data.ui.density) || 'comfortable';
      document.documentElement.dataset.density = density;
      p.querySelectorAll('[data-set="density"]').forEach((b) => b.classList.toggle('active', b.dataset.val === density));
      // fonte salva (aplicada no boot para toda a interface)
      const savedFont = (Store.data && Store.data.ui && Store.data.ui.fontFamily) || '';
      if (savedFont) document.documentElement.style.setProperty('--app-font', savedFont);
      // fundo padrão da área principal (aplicado no boot, com escala do glifo)
      const SIZES_BOOT = [0.6, 0.8, 1.0, 1.3, 1.7, 2.2];
      const clampScale = (v) => {
        const n = parseFloat(v);
        if (isNaN(n)) return 1;
        return SIZES_BOOT.reduce((best, cur) => Math.abs(cur - n) < Math.abs(best - n) ? cur : best, SIZES_BOOT[2]);
      };
      const savedBg = (Store.data && Store.data.ui && Store.data.ui.chatBgPattern) || '';
      const savedScaleBoot = clampScale((Store.data && Store.data.ui && Store.data.ui.chatBgScale) || 1);
      const chatEl = document.querySelector('.chat');
      if (chatEl) {
        if (savedBg) {
          chatEl.dataset.bg = savedBg;
          chatEl.style.setProperty('--pattern-image', buildPattern(savedBg, savedScaleBoot));
        }
      }
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
      // ---- Cabeçalho: usar a cor do caderno ----
      const hm = $('#hdr-match-color');
      if (hm) {
        hm.checked = !!(Store.data.ui && Store.data.ui.headerMatchColor);
        hm.addEventListener('change', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.headerMatchColor = hm.checked; Store.save();
          if (this.activeThread) this.applyThreadHeaderColor(this.activeThread);
        });
      }
      // ---- Fonte da interface ----
      const fs = $('#font-select');
      if (fs) {
        const fsSaved = (Store.data.ui && Store.data.ui.fontFamily) || '';
        fs.value = fsSaved;
        if (fsSaved) document.documentElement.style.setProperty('--app-font', fsSaved);
        const preview = $('#font-preview');
        if (preview) preview.style.fontFamily = fsSaved || 'var(--app-font)';
        fs.addEventListener('change', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.fontFamily = fs.value;
          Store.save();
          document.documentElement.style.setProperty('--app-font', fs.value || '');
          if (preview) preview.style.fontFamily = fs.value || 'var(--app-font)';
        });
      }
      // ---- Fundo padrão da área principal ----
      // O glifo escala DENTRO do tile fixo de 320px (gerado via JS): mudar o tamanho
      // NÃO altera o espaçamento — não é zoom.
      const bgWrap = $('#bg-patterns');
      if (bgWrap) {
        const chatEl = document.querySelector('.chat');
        const applyPattern = (val, scale) => {
          if (!chatEl) return;
          if (val) chatEl.dataset.bg = val; else delete chatEl.dataset.bg;
          if (val) chatEl.style.setProperty('--pattern-image', buildPattern(val, scale || 1));
          else chatEl.style.removeProperty('--pattern-image');
          bgWrap.querySelectorAll('.bg-pat').forEach((b) => b.classList.toggle('active', b.dataset.bg === val));
        };
        const savedPattern = (Store.data.ui && Store.data.ui.chatBgPattern) || '';
        const savedScale = (Store.data.ui && Store.data.ui.chatBgScale) || 1;
        applyPattern(savedPattern, savedScale);
        bgWrap.querySelectorAll('.bg-pat').forEach((b) => b.addEventListener('click', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.chatBgPattern = b.dataset.bg; Store.save();
          const cur = parseFloat(($('#pat-size') || {}).value || savedScale) || 1;
          applyPattern(b.dataset.bg, cur);
        }));
        // ---- Tamanho dos ícones do padrão: 6 tamanhos fixos ----
        const SIZES = [0.6, 0.8, 1.0, 1.3, 1.7, 2.2];
        const toIdx = (v) => {
          const n = parseFloat(v);
          if (isNaN(n)) return 2;
          let best = 0, bestDiff = Infinity;
          SIZES.forEach((s, i) => { const d = Math.abs(s - n); if (d < bestDiff) { bestDiff = d; best = i; } });
          return best;
        };
        const toVal = (i) => SIZES[Math.max(0, Math.min(5, parseInt(i, 10) || 2))];
        const slider = $('#pat-size');
        const resetBtn = $('#pat-size-reset');
        if (slider) {
          slider.value = String(toIdx(savedScale));
          slider.addEventListener('input', () => {
            const v = toVal(slider.value);
            const pat = (Store.data.ui && Store.data.ui.chatBgPattern) || '';
            if (chatEl && pat) chatEl.style.setProperty('--pattern-image', buildPattern(pat, v));
            clearTimeout(slider._t);
            slider._t = setTimeout(() => {
              Store.data.ui = Store.data.ui || {};
              Store.data.ui.chatBgScale = v; Store.save();
            }, 200);
          });
        }
        if (resetBtn) resetBtn.addEventListener('click', () => {
          const fixed = SIZES[2];
          if (slider) slider.value = String(toIdx(fixed));
          const pat = (Store.data.ui && Store.data.ui.chatBgPattern) || '';
          if (chatEl && pat) chatEl.style.setProperty('--pattern-image', buildPattern(pat, fixed));
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.chatBgScale = 1; Store.save();
        });
      }
      // ---- Limpar cache do app (desregistra SW + caches) ----
      const clearSw = $('#btn-clear-sw');
      if (clearSw) {
        clearSw.addEventListener('click', async () => {
          try {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              regs.forEach((r) => r.unregister());
            }
            if (window.caches && caches.keys) {
              const ks = await caches.keys();
              await Promise.all(ks.map((k) => caches.delete(k)));
            }
            this.toast('Cache limpo — recarregando…', { kind: 'info', duration: 1500 });
            setTimeout(() => location.reload(), 1200);
          } catch (err) {
            console.error('[settings] falha ao limpar cache:', err);
          }
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
      } else if (act === 'density') {
        Store.data.ui = Store.data.ui || {}; Store.data.ui.density = val; Store.save();
        document.documentElement.dataset.density = val;
        this.dom.settingsPopover.querySelectorAll('[data-set="density"]').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
      } else if (act === 'export') {
        const data = JSON.stringify({ threads: Store.data.threads, folders: Store.data.folders, notes: Store.data.notes }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'notethread.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } else if (act === 'clear') {
        const body = `<p style="font-size:14px;line-height:1.55;color:var(--text)">Tem certeza que deseja apagar <b>TODAS</b> as conversas, cadernos e notas?</p>
          <p style="font-size:13px;color:var(--text-dim);margin-top:8px">Esta ação não pode ser desfeita e afetará todos os dispositivos sincronizados.</p>`;
        this.showModal('Apagar tudo', body, () => {
          Store.data.threads = {}; Store.data.folders = {}; Store.data.notes = {}; Store.save();
          this.activeThread = null; this.renderedClientIds = new Set(); this.oldestTs = null;
          $('#chat-name').textContent = 'Selecione uma conversa'; $('#messages').querySelectorAll('.bubble,.day-sep').forEach((n) => n.remove());
          $('#empty-state').classList.remove('hidden'); this.dom.btnPin.classList.add('hidden');
          this.setChatActiveUi(false);
          this.renderTree();
          this.closeModal();
          this.dom.settingsPopover.classList.add('hidden');
        });
        const okBtn2 = this.dom.modalOk;
        okBtn2.classList.add('btn-danger');
        okBtn2.textContent = 'Apagar tudo';
      } else if (act === 'reconnect') {
        try { if (Sync.ws) Sync.ws.close(); } catch {}
        Sync.connect();
        this.dom.settingsPopover.classList.add('hidden');
      }
    },

    toggleSettingsPopover() {
      const p = this.dom.settingsPopover;
      if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
      // ancora no perfil (novo) ou nos botões legados
      const anchor = document.getElementById('profile-btn') || this.dom.navSettings || this.dom.btnSettings;
      if (!anchor) return;
      p.classList.remove('hidden');
      p.style.visibility = 'hidden'; // mede sem piscar na posição errada
      const r = anchor.getBoundingClientRect();
      const pw = Math.min(340, window.innerWidth - 16);
      // altura real do conteúdo (o popover cresce conforme o tema/seções)
      p.style.left = '0px'; p.style.top = '0px';
      const ph = p.offsetHeight || 460;
      const margin = 8;
      // horizontal: prefere ao lado direito da nav; se não couber, à esquerda; nunca sai da tela
      let left = r.right + 12;
      if (left + pw > window.innerWidth - margin) left = Math.max(margin, r.left - pw - 12);
      if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
      // vertical: abaixo do botão se couber; senão alinha ao fundo da tela (clamp nas duas bordas)
      let top = r.bottom + 8;
      if (top + ph > window.innerHeight - margin) {
        // tenta acima do botão
        const above = r.top - ph - 8;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - ph - margin);
      }
      if (top < margin) top = margin;
      if (top + ph > window.innerHeight - margin) {
        // última garantia: popover maior que a tela → ancora no topo e permite scroll interno
        top = margin;
        p.style.maxHeight = (window.innerHeight - margin * 2) + 'px';
        p.style.overflowY = 'auto';
      } else {
        p.style.maxHeight = '';
        p.style.overflowY = '';
      }
      p.style.left = left + 'px';
      p.style.top = top + 'px';
      p.style.visibility = '';
    },
};
