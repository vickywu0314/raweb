/* login.html 页面脚本（依赖 boot.js）。演示版：账号写在前端，接入后端后改为登录接口。 */
"use strict";
// doctorId：对应后端 user.id / patient_relation_doctor.doctor_id，接口按它只返回该医生名下的患者。
// 测试期两个账号都用 82394（库里患者最多的医生），接入登录接口后由后端返回。
const DEMO_USERS = [
  { username: 'chen', password: 'ra2026', name: '陈医生', role: '研究者', doctorId: 82394 },
  { username: 'admin', password: 'ra2026', name: '李敏', role: '数据管理员', doctorId: 82394 }
];
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
    const hit = DEMO_USERS.find(x => x.username === u && x.password === p);
    if (!hit) { showErr('用户名或密码错误'); pw.select(); return; }
    const btn = document.getElementById('login-submit'); btn.disabled = true; btn.textContent = '登录中…';
    try { remember.checked ? localStorage.setItem(REMEMBER_KEY, u) : localStorage.removeItem(REMEMBER_KEY); } catch (e2) {}
    signIn({ username: hit.username, name: hit.name, role: hit.role, doctorId: hit.doctorId }, remember.checked);
    setTimeout(go, 350);
  });
});
