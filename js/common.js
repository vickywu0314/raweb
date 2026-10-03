"use strict";
const $=(s)=>document.querySelector(s);
const escapeHTML=(v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const icon=(n,c="")=>`<img src="img/${n}.svg" alt="" class="${c}">`;
const badge=(t,v="")=>`<span class="badge ${v}">${escapeHTML(t)}</span>`;
// ===== 演示数据的本地保存（浏览器 localStorage）：建档、随访、档案修改、质控处理、修改记录 =====
// 接入后端后，这一层替换为接口调用；页面读取 patients / demoVisits 的方式不变。
const STORE_KEY='ra-demo-store-v1';
const store=(()=>{let s=null;try{s=JSON.parse(localStorage.getItem(STORE_KEY))}catch(e){}
  s=s&&typeof s==='object'?s:{};return {patients:{},added:[],visits:{},visitEdits:{},deletedVisits:{},qc:{},audit:[],...s}})();
function saveStore(){try{localStorage.setItem(STORE_KEY,JSON.stringify(store))}catch(e){}}
function resetStore(){try{localStorage.removeItem(STORE_KEY)}catch(e){}}
function audit(pid,action,detail){const u=currentUser();store.audit.unshift({t:new Date().toISOString(),pid,user:u?`${u.name}（${u.role}）`:'陈医生',action,detail});store.audit=store.audit.slice(0,500);saveStore()}
function patchPatient(id,fields){store.patients[id]={...(store.patients[id]||{}),...fields};const p=patients.find(x=>x.id===id);if(p)Object.assign(p,fields);saveStore()}

const patients=[...INITIAL_PATIENTS,...store.added].map(p=>({...p,...(store.patients[p.id]||{})}));
function patientById(id){return patients.find(p=>p.id===id)||patients[0]}

// ===== 随访周期与下次随访 =====
const DAY_MS=864e5, TODAY=new Date(new Date().toDateString());
const ymd=d=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
const addMonths=(d,m)=>{const x=new Date(d);x.setMonth(x.getMonth()+m);return x};
const cycleLabel=m=>m?`每 ${m} 个月`:'未设置';
// 未脱落患者：有访视 → 上次随访 + 周期；尚无访视 → 以「随访观察起始」（或建档日期）作为首次应访日期
function nextFollowup(p){
  if(p.lost)return null;
  const cycle=+p.followCycle||6, first=!p.visits||!p.last;
  const base=first?(p.followStart||p.created):p.last; if(!base)return null;
  const due=first?new Date(base):addMonths(base,cycle), days=Math.round((due-TODAY)/DAY_MS);
  return {cycle,due:ymd(due),days,first,status:days<0?'overdue':days<=14?'soon':'later'};
}
patients.forEach(p=>{const n=nextFollowup(p);p.due=!!n&&n.days<=14;});
function followupStatus(p){if(p.lost)return{label:"已脱落",tone:"danger"};if(!p.visits)return{label:"待首次随访",tone:"neutral"};const n=nextFollowup(p);if(n&&n.status==='overdue')return{label:"随访逾期",tone:"danger"};if(p.due)return{label:"近期需随访",tone:"warning"};return{label:"随访中",tone:"success"}}
function queryParam(n){return new URLSearchParams(location.search).get(n)}
const NAV_ICONS={
 overview:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
 dashboard:'<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V7"/><path d="M17 16v-8"/>',
 patients:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/><path d="M17.5 14.2c1.6.6 2.7 2.2 3 4.8"/>',
 followups:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m9 15 2 2 4-4"/>',
 quality:'<path d="M12 3 5 6v5c0 4.4 2.9 8.3 7 9.5 4.1-1.2 7-5.1 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
 ai:'<path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9 12 4.5Z"/><path d="M18.5 3.5v3M17 5h3M6 16.5v3M4.5 18h3"/>',
 guideData:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6v2.5H9z"/><path d="M9 12h6M9 16h4"/>',
 learning:'<path d="M4 5.5C6.5 4.3 9.3 4.3 12 6c2.7-1.7 5.5-1.7 8-.5V19c-2.5-1.2-5.3-1.2-8 .5-2.7-1.7-5.5-1.7-8-.5V5.5Z"/><path d="M12 6v13.5"/>',
 release:'<path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 3.5Z"/>',
 help:'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4"/><path d="M12 16.8v.2"/>'
};
const navIcon=n=>`<svg class="nav-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[n]}</svg>`;
// 平台版本：侧栏「更新亮点」入口与更新亮点页共用，发版时只改这里
const APP_VERSION='v1.0';
const STUDIES=[
 {code:'RA',name:'类风湿关节炎',en:'Rheumatoid Arthritis',ready:true,patients:patients.length,abnormal:patients.filter(p=>p.abnormal).length}, // 异常检验：最近一次访视任一检验超出参考区间的患者数
 {code:'AS',name:'强直性脊柱炎',en:'Ankylosing Spondylitis'}, // 接入后补充 ready:true 与 url（该库患者页地址），病史弹窗即可直接跳转
 {code:'SS',name:'系统性硬化症',en:'Systemic Sclerosis'},
 {code:'RA-ILD',name:'类风湿关节炎相关间质性肺病',en:'RA-associated Interstitial Lung Disease'},
 {code:'RA-MS',name:'类风湿关节炎肌少症',en:'RA & Sarcopenia'},
 {code:'FM',name:'纤维肌痛',en:'Fibromyalgia'}
];
function shell(active){
 const sidebar=document.querySelector('.sidebar');
 // 顶栏账号：显示当前登录用户，并提供退出登录
 const acc=document.querySelector('.account'), u=currentUser();
 if(acc&&u){acc.innerHTML=`<span class="avatar">${escapeHTML(u.name.slice(0,1))}</span><span>${escapeHTML(u.name)}<small>${escapeHTML(u.role)}</small></span><button type="button" class="logout-btn" title="退出登录" aria-label="退出登录"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/></svg></button>`;acc.querySelector('.logout-btn').onclick=()=>{if(confirm('确定退出登录？'))signOut()};}
 document.querySelectorAll('.header-knowledge-links,.header-study').forEach(el=>el.remove());
 if(sidebar){
   const cur=STUDIES[0];
   const studyItems=STUDIES.map(st=>st.ready
     ?`<a class="study-item is-current" href="projects.html" role="menuitem" aria-current="true"><span class="study-code">${st.code}</span><span class="study-text"><b>${st.code} ${st.name}</b><small>${st.en}</small><em class="study-meta"><i>${st.patients}</i> 患者 · <i>${st.abnormal}</i> 异常检验</em></span><span class="study-state ready">已接入</span></a>`
     :`<div class="study-item is-pending" role="menuitem" aria-disabled="true" title="该研究库尚未接入，暂不可进入"><span class="study-code">${st.code}</span><span class="study-text"><b>${st.code} ${st.name}</b><small>${st.en}</small></span><span class="study-state">待接入</span></div>`).join('');
   const item=(key,href,ic,label,count)=>`<a class="nav-item" data-nav="${key}" href="${href}">${navIcon(ic)}<span class="nav-text">${label}</span>${count?`<span class="nav-count">${count}</span>`:''}</a>`;
   sidebar.innerHTML=`<div class="project-context" id="project-context"><button type="button" id="project-switch" aria-haspopup="true" aria-expanded="false" aria-controls="project-menu"><span class="pc-code">${cur.code}</span><span class="pc-text"><b>${cur.name}</b><small><i class="pc-dot"></i>研究库已接入</small></span><svg class="pc-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5"/></svg></button><div class="project-menu" id="project-menu" role="menu" aria-label="研究数据平台"><div class="project-menu-head"><b>研究数据平台</b><span>1 个已接入 · ${STUDIES.length-1} 个待接入</span></div><div class="project-menu-list">${studyItems}</div><p class="project-menu-foot">更多病种研究库将陆续接入，接入后可在此直接切换，工作台功能一致复用。</p></div></div><nav aria-label="主导航"><p class="nav-label">概览</p><div class="sidebar-nav-group">${item('projects','projects.html','overview','项目总览')}${item('dashboard','dashboard.html','dashboard','数据看板')}</div><p class="nav-label">研究执行</p><div class="sidebar-nav-group">${item('patients','patients.html','patients','患者管理')}${item('followups','followups.html','followups','随访管理')}${item('quality','data-quality.html','quality','数据质控')}</div><p class="nav-label">智能分析</p><div class="sidebar-nav-group">${item('ai','ai-analysis.html','ai','AI 智能分析')}</div><p class="nav-label">帮助与学习</p><div class="sidebar-nav-group">${item('data-guide','data-guide.html','help','使用指南')}${item('learning','learning-center.html','learning','学习中心')}</div></nav><div class="sidebar-footer-nav">${item('guide','system-guide.html','release',`${APP_VERSION} 更新亮点`)}</div>`;
   const act=sidebar.querySelector(`[data-nav="${active}"]`);
   if(act){act.classList.add('active');act.setAttribute('aria-current','page');}
   const ctx=sidebar.querySelector('#project-context');
   const sw=sidebar.querySelector('#project-switch');
   const setOpen=o=>{ctx.classList.toggle('open',o);sw.setAttribute('aria-expanded',String(o));};
   sw.addEventListener('click',e=>{e.stopPropagation();setOpen(!ctx.classList.contains('open'));});
   document.addEventListener('click',e=>{if(!ctx.contains(e.target))setOpen(false);});
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ctx.classList.contains('open')){setOpen(false);sw.focus();}});
   sidebar.querySelectorAll('.study-item.is-pending').forEach(el=>el.addEventListener('click',()=>{el.classList.remove('nudge');void el.offsetWidth;el.classList.add('nudge');}));
 }
 const map={dashboard:'dashboard.html',patients:'patients.html',projects:'projects.html',followups:'followups.html',quality:'data-quality.html',ai:'ai-analysis.html'};
 document.querySelectorAll('[data-home]').forEach(a=>a.href=map[active]||'patients.html');
}

// 访视列表：本地新增的随访（最新在前）+ 原演示访视；编辑过的访视叠加本地修改
function demoVisits(p){
 const gone=new Set(store.deletedVisits[p.id]||[]);
 return demoVisitsAll(p).filter(v=>!gone.has(v.id));
}
function demoVisitsAll(p){
 const added=(store.visits[p.id]||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 const baseCount=p.visits+(store.deletedVisits[p.id]||[]).length-added.length;
 const orig=INITIAL_PATIENTS.find(x=>x.id===p.id), lastBase=orig?orig.last:p.last;
 const demo=baseCount>0?[{id:'v1',type:baseCount===1?'基线访视':'常规随访',date:lastBase||'2026-09-08',method:'门诊随访',doctor:'陈医生',status:'completed',summary:'患者一般情况稳定，按计划完成本次随访。',dropout:!!p.lost,dropoutReasons:p.lost?['失访']:[]},{id:'v0',type:'基线访视',date:'2026-03-12',method:'门诊随访',doctor:'陈医生',status:'completed',summary:'完成基线资料采集。',dropout:false,dropoutReasons:[]}].filter((v,i)=>i===0||baseCount>1):[];
 if(!demo.length&&added.length)added[added.length-1].type='基线访视';
 const edits=store.visitEdits[p.id]||{};
 return [...added,...demo].map(v=>edits[v.id]?{...v,...edits[v.id].meta}:v);
}
function visitForm(pid,vid){const a=(store.visits[pid]||[]).find(v=>v.id===vid);return (store.visitEdits[pid]||{})[vid]?.form||a?.form||null}
function downloadCase(p,v){const text=`RA 随诊病例（演示）\n患者：${p.name}\n患者ID：${p.id}\n研究编号：${p.code}\n访视：${v? v.type+' '+v.date:'全部随访记录'}\n\n当前为前端演示文件，真实病例下载需接入后端文档接口。`;const u=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=`${p.name}-${v?v.date:'随诊病例'}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}

// v23 contextual AI assistant drawer (front-end demo)
window.openAIChat=function(opts={}){
  const scope=opts.scope||'patient';
  const patient=opts.patient||{};
  const visit=opts.visit||null;
  let drawer=document.getElementById('ai-assistant-drawer');
  if(!drawer){
    const backdrop=document.createElement('div');backdrop.id='ai-drawer-backdrop';backdrop.className='ai-drawer-backdrop';document.body.appendChild(backdrop);
    drawer=document.createElement('aside');drawer.id='ai-assistant-drawer';drawer.className='ai-drawer';drawer.setAttribute('aria-label','AI 病情助手');
    drawer.innerHTML=`<div class="ai-drawer-head"><div class="ai-drawer-title"><span class="ai-drawer-title-mark">AI</span><span><strong>AI 病情助手</strong><small>基于当前患者研究数据对话</small></span></div><div class="ai-drawer-tools"><button class="ai-icon-btn" id="ai-drawer-expand" title="展开">↔</button><button class="ai-icon-btn" id="ai-drawer-close" title="关闭">×</button></div></div><div class="ai-context" id="ai-context"></div><div class="ai-chat" id="ai-chat"></div><div class="ai-compose"><div class="ai-compose-box"><textarea id="ai-input" rows="1" placeholder="针对当前患者病情提问……"></textarea><button class="ai-send" id="ai-send">发送</button></div><div class="ai-disclaimer">AI 内容基于当前研究数据生成，仅供临床参考，请结合实际情况判断。</div></div>`;
    document.body.appendChild(drawer);
    backdrop.onclick=()=>window.closeAIChat();
    drawer.querySelector('#ai-drawer-close').onclick=()=>window.closeAIChat();
    drawer.querySelector('#ai-drawer-expand').onclick=()=>{drawer.classList.toggle('wide');document.body.classList.toggle('ai-drawer-wide',drawer.classList.contains('wide'));drawer.querySelector('#ai-drawer-expand').textContent=drawer.classList.contains('wide')?'↔':'↔';};
    drawer.querySelector('#ai-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();drawer.querySelector('#ai-send').click();}});
  }
  drawer._ctx={scope,patient,visit};
  const context=drawer.querySelector('#ai-context');
  const visitText=visit?`${visit.date||''} ${visit.type||'本次访视'}`:'全部随访记录';
  context.innerHTML=`<strong>当前患者：</strong>${escapeHTML(patient.name||'当前患者')} <span class="ai-context-badge">${scope==='visit'?'单次访视':'患者全程'}</span><br><strong>当前上下文：</strong>${escapeHTML(visitText)}`;
  const chat=drawer.querySelector('#ai-chat');
  const suggestions=scope==='visit'?['总结本次访视需要关注的问题','哪些检查指标异常？','本次治疗方案有什么变化？']:['总结患者近期病情变化','哪些指标持续异常？','治疗方案历次如何调整？'];
  chat.innerHTML=`<div class="ai-msg assistant"><span class="ai-msg-label">AI 病情助手</span>我已载入${escapeHTML(patient.name||'该患者')}的${scope==='visit'?'本次访视及必要历史对照':'基础资料与历次随访'}。你可以一边查看左侧病历，一边针对病情继续提问。<div class="ai-suggestions">${suggestions.map(x=>`<button class="ai-suggestion">${escapeHTML(x)}</button>`).join('')}</div></div>`;
  chat.querySelectorAll('.ai-suggestion').forEach(b=>b.onclick=()=>{drawer.querySelector('#ai-input').value=b.textContent;drawer.querySelector('#ai-send').click();});
  drawer.querySelector('#ai-send').onclick=()=>{
    const input=drawer.querySelector('#ai-input');const q=input.value.trim();if(!q)return;input.value='';
    chat.insertAdjacentHTML('beforeend',`<div class="ai-msg user"><span class="ai-msg-label">医生</span>${escapeHTML(q)}</div>`);chat.scrollTop=chat.scrollHeight;
    const loading=document.createElement('div');loading.className='ai-msg assistant';loading.innerHTML='<span class="ai-msg-label">AI 病情助手</span>正在结合当前患者数据分析…';chat.appendChild(loading);chat.scrollTop=chat.scrollHeight;
    setTimeout(()=>{loading.innerHTML=`<span class="ai-msg-label">AI 病情助手</span>${scope==='visit'?'从当前访视看，建议优先关注已标记的异常检查指标、疾病活动度以及治疗方案相较上次的调整情况。':'从现有随访数据看，可以从疾病活动度趋势、持续异常指标和历次用药调整三个维度梳理。'}\n\n这是前端交互演示；接入 AI 接口后，这里会根据患者真实结构化数据生成回答，并支持连续追问。`;chat.scrollTop=chat.scrollHeight;},650);
  };
  document.getElementById('ai-drawer-backdrop').classList.add('open');drawer.classList.add('open');document.body.classList.add('ai-drawer-open');
  setTimeout(()=>drawer.querySelector('#ai-input').focus(),220);
};
window.closeAIChat=function(){const d=document.getElementById('ai-assistant-drawer'),b=document.getElementById('ai-drawer-backdrop');if(d)d.classList.remove('open');if(b)b.classList.remove('open');document.body.classList.remove('ai-drawer-open','ai-drawer-wide');};


// ===== 其他病史 / 常见相关疾病：病程简要弹窗（患者列表与随访页共用） =====
const COMORBIDITY_INFO={
 FM:{code:'FM',name:'纤维肌痛',en:'Fibromyalgia',
  intro:'以慢性广泛性疼痛为核心，常伴疲劳、睡眠障碍和认知症状（“纤维雾”）。病程慢性、波动，一般不造成关节或器官结构损害，但对生活质量影响明显。',
  stages:[['起病','局部或多部位疼痛，数月内逐渐扩展为全身广泛疼痛'],['确立','疼痛持续 ≥ 3 个月，WPI / SSS 达到诊断标准，伴睡眠与疲劳问题'],['慢性波动','症状时轻时重，应激、睡眠不足、天气变化常诱发加重'],['管理','以运动、认知行为治疗等非药物干预为主，可联合度洛西汀、普瑞巴林等']],
  relevance:'RA 患者合并 FM 时，压痛关节数与患者总体评估可能偏高，导致 DAS28 高估疾病活动，解读时需与炎症指标（CRP/ESR、肿胀关节数）对照。'},
 AS:{code:'AS',name:'强直性脊柱炎',en:'Ankylosing Spondylitis',
  intro:'以骶髂关节和脊柱慢性炎症为主的脊柱关节炎，典型表现为 40 岁前起病的炎性腰背痛，HLA-B27 阳性率高。',
  stages:[['早期','炎性腰背痛、晨僵，MRI 可见骶髂关节骨髓水肿'],['进展','骶髂关节侵蚀、硬化，脊柱出现韧带骨赘'],['晚期','脊柱部分或完全融合（“竹节样脊柱”），活动度明显受限'],['伴随表现','可出现外周关节炎、肌腱端炎、葡萄膜炎；以 BASDAI / ASDAS 评估活动度']],
  relevance:'RA 与 AS 同时存在较少见，需核实诊断依据（影像、HLA-B27、RF/抗 CCP）；两者生物制剂选择存在交叉，分析治疗暴露时需一并考虑。'}
};
const comorbidCodes=p=>Object.keys((p&&p.comorbid)||{});
// 常见相关疾病编辑（新建患者 / 编辑档案共用）：FM、AS 勾选后填写起病年份、当前状态、核心指标、治疗；或勾选「已确认无」
function comorbidEditorHTML(){
 const det=c=>`<div class="comorbid-detail" data-cm-detail="${c}" hidden><b>${c} ${COMORBIDITY_INFO[c].name}</b><label class="form-field"><span>起病年份</span><input type="number" name="cm_${c}_since" min="1950" max="2100" step="1" placeholder="如 2019"></label><label class="form-field"><span>当前状态</span><input name="cm_${c}_status" placeholder="如：症状稳定，间断加重"></label><label class="form-field"><span>核心指标</span><input name="cm_${c}_core" placeholder="多项用；分隔"></label><label class="form-field"><span>治疗</span><input name="cm_${c}_treatment" placeholder="如：度洛西汀 60 mg/日"></label></div>`;
 return `<div class="form-field span-3 comorbid-editor" id="comorbid-editor"><span>常见相关疾病（其他病史）</span><div class="choice-row">${Object.keys(COMORBIDITY_INFO).map(c=>`<label><input type="checkbox" name="cm_has" value="${c}"> ${c} ${COMORBIDITY_INFO[c].name}</label>`).join('')}<label><input type="checkbox" name="cm_none" value="1"> 已确认无常见相关疾病</label></div>${Object.keys(COMORBIDITY_INFO).map(det).join('')}</div>`;
}
function bindComorbidEditor(root){
 const box=root.querySelector('#comorbid-editor');if(!box)return;
 const sync=e=>{
  if(e&&e.target.name==='cm_none'&&e.target.checked)box.querySelectorAll('[name=cm_has]').forEach(x=>x.checked=false);
  if(e&&e.target.name==='cm_has'&&e.target.checked)box.querySelector('[name=cm_none]').checked=false;
  box.querySelectorAll('[name=cm_has]').forEach(x=>box.querySelector(`[data-cm-detail="${x.value}"]`).hidden=!x.checked);
 };
 box.addEventListener('change',sync);sync();
}
function readComorbid(root){
 const box=root.querySelector('#comorbid-editor'),out={};if(!box)return {comorbid:{},none:false};
 box.querySelectorAll('[name=cm_has]:checked').forEach(x=>{const c=x.value,v=n=>(box.querySelector(`[name=cm_${c}_${n}]`)?.value||'').trim();out[c]={since:+v('since')||null,status:v('status'),core:v('core')?v('core').split(/[；;]/).map(t=>t.trim()).filter(Boolean):[],treatment:v('treatment')}});
 return {comorbid:out,none:!!box.querySelector('[name=cm_none]')?.checked};
}
function fillComorbid(root,p){
 const box=root.querySelector('#comorbid-editor');if(!box)return;
 Object.entries(p.comorbid||{}).forEach(([c,d])=>{const cb=box.querySelector(`[name=cm_has][value="${c}"]`);if(!cb)return;cb.checked=true;const set=(n,v)=>{const el=box.querySelector(`[name=cm_${c}_${n}]`);if(el)el.value=v??''};set('since',d.since);set('status',d.status);set('core',(d.core||[]).join('；'));set('treatment',d.treatment)});
 box.querySelector('[name=cm_none]').checked=!!p.comorbidNone&&!comorbidCodes(p).length;
 box.dispatchEvent(new Event('change'));
}
// 资料完整性（演示）：按质控缺失规则 QC-M01~M04 检查基线访视数据，返回首个缺失项；完整返回 null
function caseMissing(p,base){
 const b=base||{},a=b.assessment||{},e=b.exam||{};
 if(a.das28Crp==null&&a.das28Esr==null)return '缺 DAS28 评分';
 if(e.esr==null&&e.crp==null)return '缺基线检验';
 if(!(b.treatment?.medications||[]).length)return '缺用药史';
 if(!comorbidCodes(p).length&&!p.comorbidNone)return '缺合并疾病记录';
 return null;
}
const comorbidSummary=p=>comorbidCodes(p).length?comorbidCodes(p).join('、'):(p.comorbidNone?'已确认无':'未记录');
// 脱落原因
const WITHDRAW_REASONS={lost:'失访',withdraw_consent:'撤回知情同意',adverse:'不良事件',death:'死亡',other:'其他'};
function withdrawText(p){if(p.withdrawal)return `${WITHDRAW_REASONS[p.withdrawal.reason]||p.withdrawal.reason}${p.withdrawal.note?`（${p.withdrawal.note}）`:''} · ${p.withdrawal.date}`;return '失访'}

function openComorbidity(code,p){
 const info=COMORBIDITY_INFO[code];if(!info)return;
 const st=STUDIES.find(s=>s.code===code)||{};
 const d=p&&p.comorbid&&p.comorbid[code];
 let dlg=document.getElementById('comorbid-dialog');
 if(!dlg){dlg=document.createElement('dialog');dlg.id='comorbid-dialog';dlg.className='comorbid-dialog';document.body.appendChild(dlg);
  dlg.addEventListener('click',e=>{if(e.target===dlg||e.target.closest('[data-close]'))dlg.close();});}
 dlg.innerHTML=`<div class="cd-head"><span class="cd-code">${info.code}</span><div><h2>${info.name}</h2><small>${info.en} · 病程发展简要</small></div><button type="button" class="cd-x" data-close aria-label="关闭">×</button></div>
 ${d?`<section class="cd-patient"><h3>${escapeHTML(p.name)} 的病程</h3><dl><div><dt>起病</dt><dd>${d.since} 年起（约 ${2026-d.since} 年）</dd></div><div><dt>当前情况</dt><dd>${escapeHTML(d.status)}</dd></div><div><dt>核心指标</dt><dd>${d.core.map(escapeHTML).join('；')}</dd></div><div><dt>治疗</dt><dd>${escapeHTML(d.treatment)}</dd></div></dl></section>`:''}
 <p class="cd-intro">${info.intro}</p>
 <ol class="cd-stages">${info.stages.map(s=>`<li><b>${s[0]}</b><span>${s[1]}</span></li>`).join('')}</ol>
 <p class="cd-relevance"><b>对 RA 研究的影响：</b>${info.relevance}</p>
 <p class="cd-note" id="cd-note" hidden></p>
 <div class="cd-actions"><button type="button" class="button" data-close>关闭</button><button type="button" class="button primary" id="cd-enter">进入 ${info.code} ${info.name}研究库查看数据 →</button></div>
 <p class="cd-foot">演示数据 · 病程说明为通用医学概述，不替代临床判断</p>`;
 dlg.querySelector('#cd-enter').onclick=()=>{
  if(st.ready&&st.url){location.href=st.url+(p?`${st.url.includes('?')?'&':'?'}patient=${encodeURIComponent(p.id)}`:'');return;}
  const n=dlg.querySelector('#cd-note');n.hidden=false;n.textContent=`${info.code} ${info.name}研究库尚未接入。接入后点击此处将直接打开${p?`「${p.name}」`:'该患者'}在 ${info.code} 库中的记录。`;
 };
 dlg.showModal();
}


// ===== 来源感知的返回（goBack(-1) 语义） =====
// 从随访管理 / 数据质控进入患者详情时带 from 参数：面包屑、侧栏高亮、返回按钮都回到来源列表；
// 返回优先 history.back()，保留列表的筛选、分页与滚动位置；直接打开链接时回退到来源列表地址。
const PAGE_ORIGINS={
 patients:{nav:'patients',crumb:'患者管理 / 患者列表',label:'患者列表',href:'patients.html'},
 followups:{nav:'followups',crumb:'研究执行 / 随访管理',label:'随访管理',href:'followups.html'},
 quality:{nav:'quality',crumb:'研究执行 / 数据质控',label:'数据质控',href:'data-quality.html'},
 ai:{nav:'ai',crumb:'智能分析 / AI 智能分析',label:'AI 智能分析',href:'ai-analysis.html'},
 'ai-cohort':{nav:'ai',crumb:'智能分析 / 队列分析',label:'队列分析',href:'ai-cohort.html'}
};
function pageOrigin(){return PAGE_ORIGINS[queryParam('from')]||PAGE_ORIGINS.patients}
function withFrom(url){const f=queryParam('from');return f&&PAGE_ORIGINS[f]?url.replace(/(#.*)?$/,m=>`${url.includes('?')?'&':'?'}from=${f}${m}`):url}
function canGoBack(){if(history.length<2)return false;if(!document.referrer)return true;try{return new URL(document.referrer).origin===location.origin}catch(e){return false}}
function bindBack(a,fallback){a.href=fallback;a.addEventListener('click',e=>{if(canGoBack()){e.preventDefault();history.back()}})}
// 定位到 hash 指向的区块并短暂高亮（数据质控 / 病程分析跳入时使用）
function flashHashTarget(){const t=location.hash&&document.querySelector(location.hash);if(!t)return null;t.scrollIntoView({block:'start'});t.classList.add('is-target');setTimeout(()=>t.classList.remove('is-target'),2600);return t}

// 列表页状态（检索词、筛选、分页）：仅在“返回”回到列表时恢复，正常从菜单进入时为默认状态
function loadListState(key,defaults){try{const nav=performance.getEntriesByType('navigation')[0];if(nav&&nav.type==='back_forward'){const s=JSON.parse(sessionStorage.getItem('list:'+key));if(s)return {...defaults,...s}}}catch(e){}return {...defaults}}
function saveListState(key,state){try{sessionStorage.setItem('list:'+key,JSON.stringify(state))}catch(e){}}

// ===== 后端接口（raapi） =====
// API_BASE：后端地址 + context-path；部署到其它环境时只改这里。
// 统一返回 DataResult：{success, code, message, data}；success=false 时抛出 message。
const API_BASE='http://localhost:8065/gk';
const DEFAULT_DOCTOR_ID=5065; // 登录接口接入前，演示账号没有医生 ID 时使用
const currentDoctorId=()=>(currentUser()||{}).doctorId||DEFAULT_DOCTOR_ID;
async function apiPost(path,params){
  const res=await fetch(API_BASE+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams(params||{})});
  if(!res.ok)throw new Error(`接口请求失败（HTTP ${res.status}）`);
  const r=await res.json();
  if(!r.success)throw new Error(r.message||'接口返回失败');
  return r.data;
}
