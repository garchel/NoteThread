import { $ } from '../utils.js';
import { Store } from '../store.js';
import { USE_SUPABASE, getSupa, Sync } from '../sync-supabase.js';

export const AuthMethods = {
_getSupa() {
      if (Sync && Sync.supa) return Sync.supa;
      return null;
    },

async _ensureSupa() {
      if (this._getSupa()) return this._getSupa();
      if (!USE_SUPABASE) return null;
      const c = await getSupa();
      if (Sync) Sync.supa = c;
      return c;
    },

_showAuthMsg(text, kind) {
      const el = $('#auth-msg'); if (!el) return;
      el.textContent = text; el.className = 'auth-msg ' + (kind || 'info'); el.classList.remove('hidden');
    },

_clearAuthMsg() { const el = $('#auth-msg'); if (el) { el.textContent = ''; el.classList.add('hidden'); } },

bindAuth() {
      const emailInput = $('#email-input'), passInput = $('#password-input'), passField = $('#password-field');
      const submitBtn = $('#email-submit'), links = $('#auth-links'), switchBtn = $('#btn-switch-mode');
      const toggleBtn = $('#toggle-pass'), forgotBtn = $('#btn-forgot');
      let mode = 'login'; // login | signup
      const setMode = (m) => {
        mode = m;
        if (switchBtn) switchBtn.textContent = m === 'login' ? 'Criar conta' : 'Já tenho conta';
        if (submitBtn) submitBtn.textContent = m === 'login' ? 'Entrar' : 'Criar conta';
      };
      setMode('login');
      const revealPassword = () => {
        if (passField) passField.classList.remove('hidden');
        if (links) links.classList.remove('hidden');
        if ($('#remember-row')) $('#remember-row').classList.remove('hidden');
        if (passInput) { passInput.required = true; passInput.focus(); }
      };
      // aplica "lembrar-me": unchecked → não auto-loga na próxima visita
      const applyRemember = () => {
        const rm = $('#remember-me');
        Store.data.ui = Store.data.ui || {};
        Store.data.ui.rememberMe = rm ? !!rm.checked : true;
        Store.save();
      };

      // toggle senha
      if (toggleBtn && passInput) {
        toggleBtn.addEventListener('click', () => {
          const isPass = passInput.type === 'password';
          passInput.type = isPass ? 'text' : 'password';
          toggleBtn.textContent = isPass ? '◑' : '◐';
        });
      }
      if (switchBtn) switchBtn.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
      if (forgotBtn) forgotBtn.addEventListener('click', async () => {
        const mail = emailInput.value.trim(); if (!mail) { this._showAuthMsg('Digite seu e-mail primeiro', 'error'); return; }
        const supa = await this._ensureSupa(); if (!supa) { this._showAuthMsg('Recuperação indisponível offline', 'error'); return; }
        const { error } = await supa.auth.resetPasswordForEmail(mail, { redirectTo: location.origin });
        this._showAuthMsg(error ? error.message : 'Link de recuperação enviado — verifique seu e-mail', error ? 'error' : 'success');
      });

      $('#btn-google').addEventListener('click', async () => {
        if (USE_SUPABASE) {
          const supa = await this._ensureSupa();
          const { error } = await supa.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
          if (error) this._showAuthMsg(error.message, 'error');
          return;
        }
        Store.setUser({ name: 'Google User', mail: 'voce@gmail.com', provider: 'google' });
        this.renderAuthOrApp();
      });

      $('#email-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const mail = emailInput.value.trim();
        if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { this._showAuthMsg('E-mail inválido', 'error'); return; }
        // passo 1: revela senha se ainda escondida
        if (passField && passField.classList.contains('hidden')) {
          revealPassword();
          this._showAuthMsg(mode === 'login' ? 'Digite sua senha para entrar' : 'Crie uma senha (mín. 6 caracteres)', 'info');
          return;
        }
        const pass = passInput ? passInput.value : '';
        if (!pass || pass.length < 6) { this._showAuthMsg('Senha precisa de 6+ caracteres', 'error'); return; }
        this._clearAuthMsg(); submitBtn.disabled = true; submitBtn.textContent = 'Aguarde…';
        try {
          if (USE_SUPABASE) {
            const supa = await this._ensureSupa();
            if (mode === 'signup') {
              const { error } = await supa.auth.signUp({ email: mail, password: pass, options: { emailRedirectTo: location.origin } });
              if (error) throw error;
              this._showAuthMsg('Conta criada! Confirme seu e-mail — depois volte e entre com a senha', 'success');
              setMode('login');
            } else {
              const { error } = await supa.auth.signInWithPassword({ email: mail, password: pass });
              if (error) throw error;
              applyRemember();
              const { data: { session } } = await supa.auth.getSession();
              if (session && session.user) {
                Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id });
                this.renderAuthOrApp();
                return;
              }
            }
          } else {
            Store.setUser({ name: mail.split('@')[0], mail, provider: 'email' });
            this.renderAuthOrApp();
          }
        } catch (err) {
          const msg = err && err.message ? err.message : 'Falha no login';
          // se usuário não existe e tentou login, sugerir criar conta
          if (/Invalid login/i.test(msg) || /Email not confirmed/i.test(msg)) {
            this._showAuthMsg(msg + ' — use Criar conta ou confirme o e-mail', 'error');
          } else {
            this._showAuthMsg(msg, 'error');
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
        }
      });

      $('#btn-logout').addEventListener('click', async () => {
        const supa = this._getSupa();
        if (supa) try { await supa.auth.signOut(); } catch {}
        Store.setUser(null); this.renderAuthOrApp();
        // reseta form
        if (passField) passField.classList.add('hidden');
        if (links) links.classList.add('hidden');
        if (passInput) { passInput.value = ''; passInput.required = false; }
        this._clearAuthMsg(); setMode('login');
      });

      // se já há sessão Supabase, sincroniza — apenas 1 listener global
      if (USE_SUPABASE) {
        this._ensureSupa().then(supa => {
          if (!supa || supa._bound) return;
          supa._bound = true; // marca para não duplicar onAuthStateChange
          supa.auth.getSession().then(({ data: { session } }) => {
            if (session && session.user) {
              // "lembrar-me" desmarcado → encerra a sessão local (não auto-loga)
              if (Store.data.ui && Store.data.ui.rememberMe === false) { supa.auth.signOut(); return; }
              const wasLogged = !!Store.user;
              applyRemember();
              Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id });
              if (!wasLogged) this.renderAuthOrApp();
            }
          });
          supa.auth.onAuthStateChange((_ev, sess) => {
            if (sess && sess.user && (!Store.user || Store.user.mail !== sess.user.email)) {
              Store.setUser({ name: sess.user.email.split('@')[0], mail: sess.user.email, provider: 'supabase', id: sess.user.id });
              this.renderAuthOrApp();
            }
          });
        });
      }
    },

renderAuthOrApp() {
      if (Store.user) {
        $('#auth-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
        this.renderMe();
        this.renderTree();
        // conecta apenas 1× — evita channel duplicado a cada onAuthStateChange
        if (!Sync.connected && !Sync._connecting) Sync.connect();
        this.setChatActiveUi(false);
      } else {
        $('#auth-screen').classList.remove('hidden');
        $('#app').classList.add('hidden');
      }
    },

renderMe() {
      const u = Store.user;
      $('#me-name').textContent = u.name || 'Usuário';
      $('#me-mail').textContent = u.mail || '';
      $('#me-avatar').textContent = (u.name || 'U').charAt(0).toUpperCase();
    },
};
