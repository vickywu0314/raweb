/* data-guide.html（使用指南）页面脚本（依赖 boot.js → data.js → common.js） */
"use strict";
document.addEventListener('DOMContentLoaded',()=>{
  shell('data-guide');
  // 任务搜索：按标题、关键词、入口位置过滤
  const input=document.getElementById('task-search'), tasks=[...document.querySelectorAll('.task')], groups=[...document.querySelectorAll('.task-group')].filter(g=>g.querySelector('.task'));
  input.addEventListener('input',()=>{
    const q=input.value.trim().toLowerCase();
    tasks.forEach(t=>t.hidden=!!q&&!t.dataset.kw.toLowerCase().includes(q));
    groups.forEach(g=>g.hidden=![...g.querySelectorAll('.task')].some(t=>!t.hidden));
    document.getElementById('search-empty').hidden=!q||tasks.some(t=>!t.hidden);
  });
  // 目录高亮当前区块
  const links=[...document.querySelectorAll('.guide-nav a')], secs=links.map(a=>document.querySelector(a.getAttribute('href')));
  const setActive=el=>links.forEach((a,i)=>a.classList.toggle('active',secs[i]===el));
  let lockUntil=0;
  const sync=()=>{
    if(Date.now()<lockUntil)return;
    const visible=secs.filter(s=>s&&!s.hidden);
    // 已滚到页底：选中最后一个出现在视口里的区块
    if(innerHeight+scrollY>=document.documentElement.scrollHeight-4){const last=[...visible].reverse().find(s=>s.getBoundingClientRect().top<innerHeight*0.8);if(last){setActive(last);return;}}
    let cur=visible[0];visible.forEach(s=>{if(s.getBoundingClientRect().top<160)cur=s});setActive(cur);
  };
  // 点击目录：立即选中并平滑滚动，滚动期间不被滚动监听覆盖
  links.forEach((a,i)=>a.addEventListener('click',e=>{const s=secs[i];if(!s)return;e.preventDefault();setActive(s);lockUntil=Date.now()+900;s.scrollIntoView({behavior:'smooth',block:'start'});history.replaceState(null,'',a.getAttribute('href'));}));
  addEventListener('scroll',sync,{passive:true});sync();
  // 清空本机演示数据（新建患者、随访、档案修改、质控处理、修改记录）
  document.getElementById('reset-demo')?.addEventListener('click',()=>{if(!confirm('确定清空本机保存的演示数据？新建的患者、录入的随访和修改记录都会被删除。'))return;resetStore();try{Object.keys(sessionStorage).filter(k=>k.startsWith('list:')).forEach(k=>sessionStorage.removeItem(k))}catch(e){}location.reload();});
  flashHashTarget();
});
