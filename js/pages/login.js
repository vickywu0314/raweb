/* login.html 页面脚本（依赖 boot.js）。
   登录：POST /api/ra/auth/login（后端校验账号、建立会话），返回医生 ID / 姓名；之后 AI 队列分析等接口按会话里的医生鉴权。
   测试账号在后端 application.properties 的 ra.auth.accounts 配置（内部测试用 yanwenjing → 医生 82394 言文静）。 */
"use strict";
const REMEMBER_KEY = 'ra-remember-user';
document.addEventListener('DOMContentLoaded', () => {
  const next = new URLSearchParams(location.search).get('next');
  const go = () => location.replace(next && !/^(https?:)?\/\//.test(next) ? next : 'projects.html');
  if (currentUser()) { go(); return; }
  const form = document.getElementById('login-form'), user = document.getElementById('username'), pw = document.getElementById('password');
  const err = document.getElementById('login-error'), remember = document.getElementById('remember');
  try { const r = localStorage.getItem(REMEMBER_KEY); if (r) { user.value = r; remember.checked = true; pw.focus(); } else user.focus(); } catch (e) { user.focus(); }
  const showErr = msg => { err.textContent = msg; err.hidden = !msg; };
  [user, pw].forEach(i => i.addEventListener('input', () => showErr('')));
  document.getElementById('pw-toggle').onclick = e => { const b = e.currentTarget, on = pw.type === 'password'; pw.type = on ? 'text' : 'password'; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? '隐藏密码' : '显示密码'); pw.focus(); };
  pw.addEventListener('keyup', e => { document.getElementById('caps-tip').hidden = !(e.getModifierState && e.getModifierState('CapsLock')); });
  document.getElementById('forgot').onclick = () => showErr('请联系项目数据管理员重置密码。');
  document.querySelector('.demo-accounts').addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (!b) return; user.value = b.dataset.u; pw.value = b.dataset.p; showErr(''); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const u = user.value.trim(), p = pw.value;
    if (!u) { showErr('请输入用户名'); user.focus(); return; }
    if (!p) { showErr('请输入密码'); pw.focus(); return; }
    const btn = document.getElementById('login-submit'); btn.disabled = true; btn.textContent = '登录中…';
    const base = typeof window.RA_CONFIG?.apiBase === 'string' ? window.RA_CONFIG.apiBase : '';
    fetch(base + '/api/ra/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams({ username: u, password: p, remember: remember.checked }) })
      .then(res => { if (!res.ok) throw new Error(`登录服务暂不可用（HTTP ${res.status}），请确认后端已启动`); return res.json(); })
      .then(r => {
        if (!r.success) { showErr(r.message || '用户名或密码错误'); pw.select(); return; }
        try { remember.checked ? localStorage.setItem(REMEMBER_KEY, u) : localStorage.removeItem(REMEMBER_KEY); } catch (e2) {}
        signIn(r.data, remember.checked);
        go();
      })
      .catch(ex => showErr(ex.message === 'Failed to fetch' ? '无法连接后端服务，请确认后端已启动' : ex.message))
      .finally(() => { btn.disabled = false; btn.textContent = '登 录'; });
  });
});
