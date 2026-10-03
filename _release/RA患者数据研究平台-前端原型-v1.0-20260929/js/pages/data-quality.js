/* data-quality.html 页面脚本（依赖 boot.js → data.js → common.js） */
"use strict";
shell('quality');
const TYPE_TONE={'缺失':'warning','异常值':'danger','逻辑冲突':'danger','随访缺失':'neutral'};
const STATE_TONE={'待处理':'warning','待确认':'neutral','已处理':'success'};
const MISSING_TEXT={'缺 DAS28 评分':'基线 DAS28 缺少 TJC28 / SJC28 组成项','缺基线检验':'基线 ESR / CRP 检验未录入','缺合并疾病记录':'合并疾病（其他病史）未记录','缺用药史':'既往 csDMARD 用药史缺失'};
// 质控问题（演示）：由患者数据的缺失 / 异常标记派生
// 每类问题对应的病历位置：访视详情的具体模块，或患者详情页的具体区块
const baselineVisit=p=>(demoVisits(p).find(v=>v.type==='基线访视')||demoVisits(p)[0]).id;
const latestVisit=p=>demoVisits(p)[0].id;
const visitAt=(p,v,sec,where)=>({href:`visit-detail.html?id=${encodeURIComponent(p.id)}&visit=${v}&from=quality&entry=direct#section-${sec}`,where});
const pageAt=(p,anchor,where)=>({href:`patient-visits.html?id=${encodeURIComponent(p.id)}&from=quality#${anchor}`,where});
function locate(x){const p=x.p;
  if(x.type==='缺失'){
    if(p.missing==='缺 DAS28 评分')return visitAt(p,baselineVisit(p),2,'基线访视 · 病情评估');
    if(p.missing==='缺基线检验')return visitAt(p,baselineVisit(p),1,'基线访视 · 辅助检查');
    if(p.missing==='缺用药史')return visitAt(p,baselineVisit(p),0,'基线访视 · 病史病情');
    if(p.missing==='缺合并疾病记录')return pageAt(p,'related-history','患者详情 · 常见相关疾病 / 其他病史');
  }
  if(x.type==='异常值')return visitAt(p,latestVisit(p),1,'最近访视 · 辅助检查');
  if(x.type==='逻辑冲突')return visitAt(p,latestVisit(p),4,'最近访视 · 治疗方案');
  if(x.type==='随访缺失')return pageAt(p,'visit-list','患者详情 · 随访时间线');
  return pageAt(p,'patient-basic','患者详情');
}
const issues=[];
patients.forEach((p,i)=>{
  const add=(type,text)=>{const key=`${p.id}|${type}|${text}`;issues.push({p,type,text,key,state:store.qc[key]||['待处理','待确认','待处理','已处理'][issues.length%4]})};
  if(p.incomplete) add('缺失',MISSING_TEXT[p.missing]||p.missing);
  if(p.abnormal&&i%3===0) add('异常值',['CRP 368 mg/L，超出常见数据范围','ESR 142 mm/h，需核对单位','HGB 42 g/L，需核对原始报告'][i%3===0?(i/3)%3:0]);
  if(i%11===5) add('逻辑冲突','生物制剂开始日期早于基线日期');
  const nf=nextFollowup(p); if(nf&&nf.days<-30) add('随访缺失',`计划 ${nf.due} 的随访尚未完成（${cycleLabel(nf.cycle)}，已逾期 ${-nf.days} 天）`);
});
let state=loadListState('quality',{q:'',type:'',st:'',page:1,perPage:8});
if(queryParam('type'))state.type=queryParam('type'); // 看板等页面带条件进入
function kpi(){
  const open=issues.filter(x=>x.state!=='已处理').length, pts=new Set(issues.filter(x=>x.state!=='已处理').map(x=>x.p.id)).size;
  const ok=patients.length-pts, rate=(ok/patients.length*100).toFixed(1);
  $('#dq-kpi').innerHTML=[[rate+'%','无待处理问题的患者占比'],[open,'待处理问题'],[pts,'涉及患者'],[ok,'满足研究级质量要求']].map(([v,l])=>`<article><strong>${v}</strong><span>${l}</span></article>`).join('');
  $('#dq-summary').textContent=`共发现 ${issues.length} 个质控问题 · ${open} 个待处理，涉及 ${pts} 位患者`;
}
function row(x){const p=x.p,loc=locate(x);return `<div class="patient-card selectable"><a class="patient-card-link" href="${loc.href}" title="定位到：${loc.where}"><span class="patient-identity"><span class="record-icon">${icon('record')}</span><span class="patient-info"><span class="patient-name">${escapeHTML(p.name)}</span><span class="patient-meta">${escapeHTML(p.sex)} · ${p.year} 年</span><span class="patient-meta">ID号: ${escapeHTML(p.id)}</span></span></span><span class="patient-cell research-cell"><span class="cell-label">研究信息</span><span class="study-code">${escapeHTML(p.code)}</span><span class="cell-note">已随访 ${p.visits} 次</span></span><span class="patient-cell issue-cell"><span class="cell-label">质控问题</span><span class="issue-text">${escapeHTML(x.text)}</span><span class="cell-note">${x.state==='已处理'?'已核实并更新':`定位到：${loc.where}`}</span></span><span class="patient-cell type-cell"><span class="cell-label">问题类型</span>${badge(x.type,TYPE_TONE[x.type])}</span><span class="patient-cell status-cell"><span class="cell-label">处理状态</span>${badge(x.state,STATE_TONE[x.state])}${x.state!=='已处理'?`<span class="mark-done" role="button" tabindex="0" data-key="${escapeHTML(x.key)}">标记已处理</span>`:''}</span>${icon('chevron','chevron')}</a></div>`}
function rows(){return issues.filter(x=>(!state.q||[x.p.name,x.p.id,x.p.code].some(v=>v.toLowerCase().includes(state.q)))&&(!state.type||x.type===state.type)&&(!state.st||x.state===state.st))}
function render(){saveListState('quality',state);const list=rows(),pages=Math.max(1,Math.ceil(list.length/state.perPage));state.page=Math.min(state.page,pages);const start=(state.page-1)*state.perPage;
  $('#rows').innerHTML=list.slice(start,start+state.perPage).map(row).join('');$('#empty').hidden=!!list.length;
  $('#result-count').textContent=list.length?`显示第 ${start+1}–${Math.min(start+state.perPage,list.length)} 条，共 ${list.length} 条`:'共 0 条匹配记录';
  $('#pagination').innerHTML=Array.from({length:pages},(_,i)=>`<button data-page="${i+1}" class="${i+1===state.page?'active':''}">${i+1}</button>`).slice(Math.max(0,state.page-3),Math.max(5,state.page+2)).join('')}
// 标记已处理：保存在本地并写入该患者的修改记录
const markDone=e=>{const b=e.target.closest('.mark-done');if(!b)return false;e.preventDefault();e.stopPropagation();const x=issues.find(i=>i.key===b.dataset.key);if(!x)return true;const prev=x.state;x.state='已处理';store.qc[x.key]='已处理';saveStore();audit(x.p.id,'质控处理',`问题：${x.text}（${x.type}）；状态：${prev} → 已处理`);kpi();render();return true};
$('#rows').addEventListener('click',markDone);
$('#rows').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.mark-done'))markDone(e)});
$('#run-check').onclick=e=>{const b=e.currentTarget;b.disabled=true;b.textContent='质控检查中…';setTimeout(()=>{b.disabled=false;b.textContent='运行质控检查';kpi();render();const t=document.createElement('div');t.className='save-toast';t.textContent=`质控检查完成：共 ${issues.length} 个问题（前端演示）`;document.body.appendChild(t);setTimeout(()=>t.remove(),2400)},900)};
$('#search-form').addEventListener('submit',e=>{e.preventDefault();state.q=$('#query').value.trim().toLowerCase();state.type=$('#dq-type').value;state.st=$('#dq-state').value;state.page=1;render()});
$('#dq-type').addEventListener('change',e=>{state.type=e.target.value;state.page=1;render()});
$('#dq-state').addEventListener('change',e=>{state.st=e.target.value;state.page=1;render()});
$('#pagination').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){state.page=+b.dataset.page;render()}});
$('#page-size').addEventListener('change',e=>{state.perPage=+e.target.value;state.page=1;render()});
$('#reset').onclick=()=>{state={q:'',type:'',st:'',page:1,perPage:state.perPage};$('#query').value='';$('#dq-type').value='';$('#dq-state').value='';render()};
$('#query').value=state.q;$('#dq-type').value=state.type;$('#dq-state').value=state.st;$('#page-size').value=state.perPage;kpi();render();
