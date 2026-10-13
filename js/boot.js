"use strict";
window.addEventListener('error',()=>{const n=document.getElementById('app-load-status');if(n){n.hidden=false;n.textContent='交互加载异常，请确认 css、js、img 目录与页面文件一起保存。'}});

// ===== 登录状态：后端会话（/api/ra/auth/login）+ 浏览器里存一份用户信息用于显示 =====
// 勾选「记住我」存 localStorage（30 天有效），否则存 sessionStorage（关闭浏览器即退出）。
const AUTH_KEY='ra-auth';
function currentUser(){
  for(const s of [sessionStorage,localStorage]){
    try{const u=JSON.parse(s.getItem(AUTH_KEY)||'null');if(u&&(!u.expires||u.expires>Date.now()))return u;}catch(e){}
  }
  return null;
}
let authGeneration=0;
window.addEventListener('storage',event=>{if(event.key===AUTH_KEY||event.key===null)authGeneration++;});
window.addEventListener('pagehide',()=>{authGeneration++;});
function authChanged(){authGeneration++;window.dispatchEvent(new Event('ra-auth-changed'));}
function clearAuth(){try{localStorage.removeItem(AUTH_KEY);sessionStorage.removeItem(AUTH_KEY)}catch(e){}authChanged();}
function signIn(user,remember){
 const previous=currentUser();const u={...user,at:Date.now(),expires:remember?Date.now()+30*864e5:0};
 try{localStorage.removeItem(AUTH_KEY);sessionStorage.removeItem(AUTH_KEY);(remember?localStorage:sessionStorage).setItem(AUTH_KEY,JSON.stringify(u))}catch(e){}
 if(!previous||String(previous.doctorId)!==String(u.doctorId))authChanged();
 return u;
}
// Revoke displayed data immediately; logout's peer may remain pending.
function signOut(){clearAuth();const base=typeof window.RA_CONFIG?.apiBase==='string'?window.RA_CONFIG.apiBase:'';fetch(base+'/api/ra/auth/logout',{method:'POST',credentials:'same-origin'}).catch(()=>{}).finally(()=>location.href='login.html')}
// 未登录访问任何页面 → 跳转登录页，登录后回到原页面
(function guard(){
  const page=location.pathname.split('/').pop()||'index.html';
  if(page==='login.html'||currentUser())return;
  location.replace('login.html?next='+encodeURIComponent(page+location.search+location.hash));
})();
