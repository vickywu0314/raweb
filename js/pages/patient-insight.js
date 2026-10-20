/* 本人 RA 单患者实测病程；每次请求拥有独立终态与发布权。 */
"use strict";
(()=>{
 const display=window.RAUserDisplay;
 const $=selector=>document.querySelector(selector),baseTitle='患者病程分析 · 中国中医风湿病注册研究信息平台';
 const id=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&(value.length<19||(value.length===19&&value<='9223372036854775807'));
 const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const params=new URLSearchParams(location.search),from=params.get('from')||'ai-analysis',patientId=params.get('id');
 const valid=[...params.keys()].every(k=>['id','from'].includes(k))&&params.getAll('id').length===1&&params.getAll('from').length<=1&&['ai-analysis','ai-cohort'].includes(from)&&(!params.has('from')||params.get('from')===from)&&id(patientId);
 let flight=null,generation=0,hidden=false;
 shell('ai');
 function clear(){
   document.title=baseTitle;$('#patient-name').textContent='患者病程分析';$('#patient-meta').textContent='';
   for(const selector of ['#journey','#unplaced-visits','#treatment','#clinical-source','#evidence','#evidence-boundary','#dims','#resp','#similar-tags','#similar-summary','#similar-tx','#ai-cards','#target-note'])$(selector).innerHTML='';
   for(const selector of ['#st-status','#st-since','#das-trend'])$(selector).textContent='—';$('#insight-body').hidden=true;similarGeneration++;
   $('#insight-source').textContent='';
   for(const selector of ['#back-patient','#visit-record','#similar-detail','#insight-chat-link','#insight-chat-more']){$(selector).removeAttribute('href');$(selector).setAttribute('aria-disabled','true');}
 }
 function state(kind,message){$('#insight-state').dataset.state=kind;$('#insight-state').textContent=message;$('#cancel-load').hidden=kind!=='loading';$('#retry-load').hidden=!['error','timeout','cancelled'].includes(kind);}
 function finish(owner,kind,publish,abort=false){
   if(flight!==owner||owner.generation!==generation||owner.terminal)return false;
   owner.terminal=kind;clearTimeout(owner.timer);flight=null;if(abort)owner.controller.abort();publish();return true;
 }
 function invalidate(kind='cancelled',message='患者病程已清空，请重新加载'){
   const owner=flight;
   if(owner)finish(owner,kind,()=>{},true);
   generation++;clear();state(kind,message);
 }
 const originHref=from==='ai-cohort'?'ai-cohort.html':'ai-analysis.html';
 $('#crumb-origin').href=originHref;$('#crumb-origin').textContent=from==='ai-cohort'?'研究队列':'AI 智能分析';
 $('#back-link').href=originHref;
 $('#back-link').addEventListener('click',event=>{
   if(history.length<=1||!document.referrer)return;
   try{const previous=new URL(document.referrer),current=new URL(location.href);if(previous.origin!==current.origin||previous.pathname!==new URL(originHref,current).pathname||previous.search||previous.hash)return;event.preventDefault();history.back();}catch{}
 });

 function render(data){
   const p=data.patient,meta=data.meta,visits=new Set(data.visits.map(v=>v.visitId));
   const visitHref=visitId=>'visit-detail.html?id='+encodeURIComponent(patientId)+'&visit='+encodeURIComponent(visitId)+'&from='+from;
   const link=visitId=>id(visitId)&&visits.has(visitId)?'<a href="'+visitHref(visitId)+'">来源访视 '+esc(visitId)+'</a>':'来源访视不可链接';
   document.title=(p.name||'未知姓名')+' · '+baseTitle;$('#patient-name').textContent=(p.name||'未知姓名')+' · 病程分析';
   const unknown=value=>value===null?'未知':String(value);
   $('#patient-meta').textContent='研究编号 '+unknown(p.studyNo)+' · 性别 '+({M:'男',F:'女'}[p.sex]||'未知')+' · 年龄 '+unknown(p.age)+' · 病程年数 '+unknown(p.diseaseDurationYears)+' · 血清学 '+display.code(p.sero)+' · 纤维肌痛 '+display.patientFm(p.fm,p.clinicalProvenance.fm)+' · 强直性脊柱炎 '+display.code(p.as);
   const labels={das28Crp:'DAS28-CRP',tjc:'TJC28',sjc:'SJC28',gh:'GH',haq:'HAQ',crp:'CRP',pain:'疼痛'};
   function record(v,extra){extra=extra&&typeof extra==='object'?extra:{};return '<article class="insight-record"><time>'+esc(v.observedAt||'日期未知')+'</time><div class="journey-content"><strong>'+link(v.visitId)+(extra.title?' · '+esc(extra.title):'')+'</strong>'+(extra.summary?'<p>'+esc(extra.summary)+'</p>':'')+(extra.tags||'')+'<details class="journey-detail"><summary>指标明细与来源</summary><div class="insight-table-wrap"><table><thead><tr><th>指标</th><th>实测值</th><th>单位 / 量表范围</th><th>来源与质量</th></tr></thead><tbody>'+Object.entries(v.metrics).map(([key,m])=>'<tr><td>'+labels[key]+'</td><td>'+esc(unknown(m.value))+'</td><td>'+esc(display.measurementUnit(m.unit))+'</td><td>'+esc(display.label(m.sourceField))+' · <time>'+esc(m.observedAt||'日期未知')+'</time> · '+esc(display.measurementQuality(m))+'</td></tr>').join('')+'</tbody></table></div></details></div></article>';}
   const observed=data.visits.filter(v=>v.temporalStatus==='OBSERVED'),excluded=data.visits.filter(v=>v.temporalStatus!=='OBSERVED');
   const view=analysis(data,observed);
   $('#journey').innerHTML=observed.length?observed.map((v,i)=>record(v,view.events[i])).join(''):'<p>暂无有真实日期的当前观察记录</p>';
   const journeyNodes=typeof $('#journey').querySelectorAll==='function'?[...($('#journey').querySelectorAll(':scope > .insight-record')||[])]:[];
   if(observed.length)journeyNodes.forEach((node,i)=>{const e=view.events[i];if(!e||!node.classList)return;for(const c of e.cls.split(' ').filter(Boolean))node.classList.add(c);node.dataset.kind=e.kind;});
   $('#unplaced-visits').innerHTML=excluded.length?excluded.map(v=>'<p>'+esc(v.temporalStatus==='UNDATED'?'无有效日期，未纳入当前时序':'未来记录，未纳入当前时序')+'</p>'+record(v)).join(''):'<p>无未纳入时序的访视</p>';
   if(data.visits.length===0)$('#journey').innerHTML='<p>暂无访视记录</p>';
   const tx=data.treatment,names=new Map(tx.drugNames.map(drug=>[drug.id,drug.name]));
   function episode(e,current){return '<article><strong>'+esc(display.code(e.state))+' · '+esc(display.code(e.category,'未知方案'))+'</strong><p>'+esc(e.genericDrugIds.map(generic=>names.get(generic)||'未知药物').join(' / ')||'未知药物')+' · 线数 '+esc(unknown(e.line))+' · 靶向药史 '+esc(e.targetedDrugHistoryN)+'</p><p>开始 '+esc(e.startDate||e.estimatedStartDate||'未知')+' · 起点 '+esc(display.code(e.startConfidence,'未知'))+' · 结束 '+esc(e.endDate||'未记录')+(current?' · 当前方案月数 '+esc(unknown(e.schemeDurationMonths)):'')+'</p><p>'+link(e.provenance.visitId)+' · '+esc(display.label(e.provenance.field))+' · '+esc(display.list(e.provenance.quality))+' · '+esc(e.provenance.missingReason?display.code(e.provenance.missingReason):'')+'</p></article>';}
   $('#treatment').innerHTML='<h3>当前方案</h3>'+episode(tx.current,true)+'<h3>方案历史</h3>'+tx.history.map(e=>episode(e,false)).join('');
   $('#clinical-source').innerHTML=Object.entries(p.clinicalProvenance).map(([key,value])=>'<p>'+esc(display.label(key))+' · '+esc(display.code(value.source))+' · '+esc(display.label(value.sourceField))+' · '+esc(display.list(value.quality))+' · '+esc(value.missingReason?display.code(value.missingReason):'')+'</p>').join('');
   $('#insight-source').textContent='RA · 截至 '+meta.asOfDate+' · 读取 '+meta.readStartedAt+' — '+meta.readCompletedAt+' · 来源与统计口径仍待医学核验';
   for(const selector of ['#back-patient','#visit-record']){$(selector).href='patient-visits.html?id='+encodeURIComponent(patientId)+'&from='+from;$(selector).removeAttribute('aria-disabled');}
   $('#insight-chat-link').href='ai-chat.html'+window.RACohortChatEntry.encode({kind:'PATIENT',patientId,visitId:null});$('#insight-chat-link').removeAttribute('aria-disabled');
   $('#similar-detail').href='ai-cohort.html?preset=similar&id='+encodeURIComponent(patientId);$('#similar-detail').removeAttribute('aria-disabled');
   $('#insight-chat-more').href=$('#insight-chat-link').href;$('#insight-chat-more').removeAttribute('aria-disabled');
   paint(view);$('#insight-body').hidden=false;watchSimilar();
 }
 // ---------- 病程分析视图（全部由本次读取的实测记录计算；缺失保持未知，不补数） ----------
 const ACT={remission:'缓解',low:'低疾病活动',moderate:'中疾病活动',high:'高疾病活动'};
 const actOf=v=>v==null?null:v<2.3?'remission':v<=2.7?'low':v<=4.1?'moderate':'high';
 const num=m=>m&&typeof m.value==='number'&&Number.isFinite(m.value)?m.value:null;
 const f1=v=>v==null?'—':(Math.round(v*10)/10).toString(),f2=v=>v==null?'—':(Math.round(v*100)/100).toString();
 const ym=d=>d?d.slice(0,7).replace('-','.'):'—';
 const metricLine=m=>[['DAS28-CRP',num(m.das28Crp),f2],['SJC28',num(m.sjc),f1],['TJC28',num(m.tjc),f1],['CRP',num(m.crp),f1],['HAQ',num(m.haq),f2]].filter(x=>x[1]!=null).map(x=>x[0]+' '+x[2](x[1])).join(' · ');
 function analysis(data,observed){
   const tx=data.treatment,names=new Map(tx.drugNames.map(d=>[d.id,d.name])),drugs=e=>e.genericDrugIds.map(g=>names.get(g)||'未知药物').join(' / ')||'未知药物';
   const scored=observed.filter(v=>num(v.metrics.das28Crp)!=null),last=scored[scored.length-1]||null,prev=scored.length>1?scored[scored.length-2]:null,first=scored[0]||null;
   const latest=observed[observed.length-1]||null;
   const seen=new Set(),starts=[tx.current,...tx.history].filter(e=>{if(!e||!e.startDate)return false;const k=e.startDate+'|'+e.genericDrugIds.join(',');if(seen.has(k))return false;seen.add(k);return true;});
   const events=observed.map((v,i)=>{
     const das=num(v.metrics.das28Crp),before=scored.filter(x=>x.observedAt<v.observedAt||(x.observedAt===v.observedAt&&x!==v&&observed.indexOf(x)<i)).pop(),delta=das!=null&&before?das-num(before.metrics.das28Crp):null;
     const started=starts.filter(e=>e.startDate===v.observedAt);
     const tags=started.map(e=>'<span class="event-treatment">开始 '+esc(drugs(e))+'（'+esc(display.code(e.category,'未知方案'))+(e.line?' · '+esc(e.line)+' 线':'')+'）</span>');
     let kind=started.length?'treat':'',cls='';
     if(delta!=null&&delta<=-0.6){kind=kind||'good';cls='good';tags.push('<span class="event-response">较上次改善 '+f2(-delta)+'</span>');}
     else if(delta!=null&&delta>=0.6){kind='alert';cls='alert';tags.push('<span class="event-alert">较上次回升 '+f2(delta)+'</span>');}
     const isLast=i===observed.length-1;if(isLast){cls+=' current';if(das!=null&&actOf(das)!=='remission'&&actOf(das)!=='low')tags.push('<span class="event-alert">尚未达到治疗目标</span>');else if(das!=null)tags.push('<span class="event-response">已达到治疗目标</span>');}
     const title=(isLast&&i>0?'最近访视':i===0?'首次记录':'随访')+(das!=null?' · '+ACT[actOf(das)]:'');
     return {cls,kind,title,summary:metricLine(v.metrics)||'本次未记录疾病活动指标',tags:tags.join(' ')};
   });
   return {tx,drugs,observed,scored,last,prev,first,latest,events,months:tx.current&&tx.current.state==='ACTIVE'?tx.current.schemeDurationMonths:null};
 }
 function paint(view){
   const {tx,drugs,last,prev,first,latest}=view,das=last?num(last.metrics.das28Crp):null,act=actOf(das),cur=tx.current;
   // 顶部状态条
   const reached=act==='remission'||act==='low';
   $('#st-status').className=act?(reached?'good':act==='high'?'bad':'warn'):'';$('#st-status').textContent=act?ACT[act]+' · '+(reached?'已达标':'未达标'):'暂无评分';
   $('#st-since').textContent=cur&&cur.state==='ACTIVE'?(view.months==null?'时长未知':view.months+' 个月')+'（'+drugs(cur)+'）':'暂无在用方案';
   const pd=prev?num(prev.metrics.das28Crp):null,delta=das!=null&&pd!=null?das-pd:null,tone=delta==null?'stable':delta<=-0.6?'improved':delta>=0.6?'worsened':'stable';
   $('#das-label').textContent='DAS28-CRP（较上次 '+ym(prev&&prev.observedAt)+'）';
   $('#das-trend').innerHTML=das==null?'—':pd==null?esc(f2(das)):esc(f2(pd))+' → '+esc(f2(das))+' <em class="tone-'+tone+'">'+(tone==='improved'?'↓':tone==='worsened'?'↑':'→')+' '+esc(f2(Math.abs(delta)))+'</em>';
   const label={improved:'改善',stable:'稳定',worsened:'恶化'}[tone];
   const text=das==null?'暂无 DAS28-CRP 评分，无法判断变化趋势。':pd==null?'只有一次评分，暂不能判断变化趋势。':tone==='improved'?(reached?'病情较前改善，已达到治疗目标。':'病情较前改善，但当前仍未达到目标。'):tone==='worsened'?'病情较前加重（DAS28-CRP 升高 ≥ 0.6），建议复核治疗依从性与近期事件。':(reached?'病情与上次基本持平，维持在治疗目标内。':'病情与上次基本持平（变化 < 0.6），当前仍未达到目标。');
   $('#target-note').className='target-note tone-'+tone;
   $('#target-note').innerHTML='<b class="tone-label">参考结论 · '+label+'</b><span>'+esc(text)+'请结合完整病历进行临床判断。</span><span class="tone-legend" aria-hidden="true"><i class="tone-improved">改善</i><i class="tone-stable">稳定</i><i class="tone-worsened">恶化</i></span>';
   // 研究数据覆盖（按最近一次访视）
   const m=latest?latest.metrics:{},has=k=>num(m[k])!=null;
   const domain=(name,keys,labels)=>{const n=keys.filter(has).length;return [name,n===keys.length?'完整':n?'部分':'缺失',labels,n===0];};
   const domains=[domain('疾病活动',['das28Crp','tjc','sjc'],'DAS28-CRP · TJC28 · SJC28'),domain('实验室',['crp'],'CRP'),
     ['治疗暴露',cur&&cur.state!=='UNKNOWN'?'完整':tx.history.length?'部分':'缺失','当前方案 · 方案历史 '+tx.history.length+' 段',!(cur&&cur.state!=='UNKNOWN')&&!tx.history.length],
     domain('患者报告 PRO',['gh','haq','pain'],'患者总体评价 · HAQ · 疼痛'),['影像 / 结构损伤','待补充','当前缺少可比对影像',true]];
   $('#evidence').innerHTML=domains.map(([n,st,l,miss])=>'<div class="evidence-domain'+(miss?' missing':'')+'"><span>'+n+'</span><strong>'+st+'</strong><small>'+l+'</small></div>').join('');
   const gaps=domains.filter(d=>d[1]!=='完整').map(d=>d[0]);
   $('#evidence-boundary').innerHTML='<b>分析边界：</b> 当前洞察基于疾病活动、炎症、治疗与 PRO 中已记录的数据'+(gaps.length?'；'+esc(gaps.join('、'))+' 不完整，相关结论不生成或仅作提示':'')+'；影像证据不足时，不生成结构损伤进展结论。';
   // 多维疾病画像（最近一次有评分的访视）
   const lm=last?last.metrics:m,fm=first?first.metrics:{},v=k=>num(lm[k]),v0=k=>num(fm[k]);
   const crp=v('crp'),sjc=v('sjc'),tjc=v('tjc'),haq=v('haq'),gh=v('gh'),pain=v('pain'),pro=pain!=null?pain:gh;
   const dims=[['疾病活动',act?ACT[act].replace('疾病活动',''):'未记录',das==null?0:das/7.5*100,'DAS28-CRP '+f2(das)],
     ['炎症',crp==null?'未记录':crp<10?'正常':crp<30?'轻度升高':'明显升高',crp==null?0:crp/50*100,'CRP '+f1(crp)+' mg/L'],
     ['关节体征',sjc==null?'未记录':v0('sjc')!=null&&sjc<=v0('sjc')-2?'改善':sjc<=2?'稳定':'仍有肿胀',sjc==null?0:sjc/12*100,'SJC28 '+f1(sjc)+' · TJC28 '+f1(tjc)],
     ['症状 / PRO',pro==null?'未记录':pro>=60?'仍需关注':'可接受',pro==null?0:pro,(pain!=null?'疼痛 ':'患者总体评价 ')+f1(pro)],
     ['功能',haq==null?'未记录':v0('haq')!=null&&haq<=v0('haq')-0.3?'改善':haq<1?'轻度受限':'受限',haq==null?0:haq/3*100,'HAQ '+f2(haq)],
     ['安全性','见随访记录',0,'不良反应以随访记录为准']];
   $('#dims').innerHTML=dims.map(([n,l,val,sm])=>'<div><span>'+n+'</span><b>'+esc(l)+'</b><meter min="0" max="100" value="'+Math.max(0,Math.min(100,Math.round(val)))+'"></meter><small>'+esc(sm)+'</small></div>').join('');
   // 治疗响应：当前方案开始后的首次评分 → 最近一次
   // 调整前 = 当前方案开始当天及之前的最后一次评分（不含最近一次）；没有就取最早一次
   const earlier=view.scored.filter(x=>x!==last),base=(cur&&cur.startDate?earlier.filter(x=>x.observedAt<=cur.startDate).pop():null)||earlier[0]||first;
   const row=(name,k,fmt,unit)=>{const a=base?num(base.metrics[k]):null,b=last?num(last.metrics[k]):null;return '<dt>'+name+'</dt><dd>'+esc(fmt(a))+' <b>→ '+esc(fmt(b))+'</b>'+(unit?' '+unit:'')+'</dd>';};
   $('#resp').innerHTML=cur&&cur.state==='ACTIVE'?'<div><strong>'+esc(drugs(cur))+'</strong><span>'+esc(display.code(cur.category,'未知方案'))+(cur.line?' · '+esc(cur.line)+' 线':'')+' · 已使用 '+(view.months==null?'未知':view.months+' 个月')+'</span></div><dl>'+row('DAS28-CRP','das28Crp',f2)+row('CRP','crp',f1,'mg/L')+row('SJC28','sjc',f1)+row('HAQ','haq',f2)+'</dl>':'<div><strong>暂无在用方案</strong><span>方案历史见下方明细</span></div>';
   // 智能洞察（规则计算）
   const cards=[];
   if(first&&last&&first!==last){
     const d0=num(first.metrics.das28Crp),dd=das-d0,parts=[['压痛关节数','tjc',x=>0.56*Math.sqrt(x)],['肿胀关节数','sjc',x=>0.28*Math.sqrt(x)],['CRP','crp',x=>0.36*Math.log(x+1)],['患者总体评价','gh',x=>0.014*x]].map(([n,k,fn])=>{const a=num(first.metrics[k]),b=num(last.metrics[k]);return a==null||b==null?null:{n,a,b,c:fn(b)-fn(a)};}).filter(Boolean).sort((x,y)=>Math.abs(y.c)-Math.abs(x.c));
     const top=parts[0];
     cards.push(['01 · 评分贡献','DAS28-CRP 较首次'+(dd<=0?'下降 ':'上升 ')+f2(Math.abs(dd))+(top?'，主要来自'+top.n+'（'+f1(top.a)+' → '+f1(top.b)+'）':''),'首次 '+first.observedAt+' → 最近 '+last.observedAt+'；按 DAS28-CRP 各分项权重估算贡献。','#journey','查看证据数据 →']);
     const dir=(k,lower)=>{const a=num(first.metrics[k]),b=num(last.metrics[k]);return a==null||b==null?null:(b<a)===lower;};
     const agree=[dir('crp',true),dir('sjc',true),dir('haq',true)].filter(x=>x!=null),down=dd<=0,same=agree.filter(x=>x===down).length;
     cards.push(['02 · 多维一致',agree.length?(same===agree.length?'炎症、关节体征与功能变化方向与 DAS28-CRP 一致':'部分指标变化方向与 DAS28-CRP 不一致，建议复核'):'可比较的多维指标不足','CRP '+f1(crp)+' mg/L · SJC28 '+f1(sjc)+' · HAQ '+f2(haq)+'（最近一次）','#dims','查看相关趋势 →']);
   }else cards.push(['01 · 评分贡献','评分记录不足','至少需要两次含 DAS28-CRP 评分的访视才能比较变化。','#journey','查看病程 →']);
   const mo=view.months;
   cards.push(['03 · 关键节点',mo==null?'当前方案时长未知':'当前方案已使用 '+mo+' 个月',mo==null?'方案开始日期未记录，无法判断评估时点。':mo<6?'尚未到 6 个月评估时点；按 Treat-to-Target，可在 3 个月时评估是否改善。':reached?'已达到治疗目标，按计划随访。':'已使用 6 个月以上仍未达标，可结合临床复核方案。','#journey .insight-record:last-child','定位到病程节点 →']);
   $('#ai-cards').innerHTML=cards.map(([k,t,d,target,txt])=>'<article><span>'+esc(k)+'</span><strong>'+esc(t)+'</strong><p>'+esc(d)+'</p><button type="button" class="text-button" data-locate="'+esc(target)+'">'+esc(txt)+'</button></article>').join('');
 }
 // 相似患者：与队列分析「相似患者」入口同一规则（resolveEntry），再按该条件统计；滚动到该区块才计算（较重）
 let similarGeneration=0,similarObserver=null;
 function watchSimilar(){
   if(similarObserver)similarObserver.disconnect();
   const target=$('#similar-summary');$('#similar-summary').innerHTML='<p class="metric-note">滚动到这里时统计相似患者…</p>';
   if(typeof window.IntersectionObserver!=='function')return;
   const mine=similarGeneration;similarObserver=new window.IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){similarObserver.disconnect();similarObserver=null;if(mine===similarGeneration)loadSimilar();}});similarObserver.observe(target);
 }
 const SIM_LABEL={sex:v=>v==='F'?'女性':v==='M'?'男性':'',age:v=>{const [a,b]=String(v).split('-');return b?a+'–'+b+' 岁':a+' 岁以上';},sero:()=>'RF / ACPA 阳性',tx:v=>'当前治疗：'+v,cm:v=>v==='none'?'无合并 FM / AS':'合并 '+v};
 async function loadSimilar(){
   const mine=++similarGeneration,api=window.RACohortAPI,pct=v=>typeof v==='number'?Math.round(v*100)+'%':'—';
   $('#similar-summary').innerHTML='<p class="metric-note">正在统计相似患者…</p>';
   try{
     const entry=await api.resolveEntry(patientId);if(mine!==similarGeneration)return;
     const filters={...entry.data.filters};delete filters.studyCode;
     $('#similar-tags').innerHTML=Object.entries(filters).map(([k,v])=>v!=null&&SIM_LABEL[k]?'<span>'+esc(SIM_LABEL[k](v))+'</span>':'').join('');
     const [cohort,preview]=await Promise.all([api.cohort(filters,{completeFilters:true}),apiPostJson('/api/ra/dashboard/cohortPreview',{filters}).catch(()=>null)]);if(mine!==similarGeneration)return;
     const d=cohort.data,st=d.stats||{},n=d.n;
     $('#similar-summary').innerHTML=[['当前匹配',n+' 名','同性别 · 年龄相近 · 同血清学'],['当前达标率',pct(st.targetRate),'DAS28-CRP ≤ 2.7'],['方案持续 ≥ 12 月',preview&&n?Math.round(preview.scheme12/n*100)+'%':'—','研究库观察值'],['数据完整度',pct(st.completeRate),'资料完整患者占比']].map(([a,b,c])=>'<div><span>'+a+'</span><strong>'+esc(b)+'</strong><small>'+c+'</small></div>').join('');
     const groups=(d.byTx&&d.byTx.groups)||[],max=Math.max(1,...groups.map(g=>g.n||0));
     $('#similar-tx').innerHTML=groups.filter(g=>g.n).map(g=>'<div class="outcome-row"><span>'+esc(g.tx)+'</span><i style="--w:'+Math.round(g.n/max*100)+'%"></i><b>'+esc(g.n)+'</b></div>').join('')||'<p class="metric-note">相似患者中暂无可分组的当前治疗</p>';
   }catch(error){if(mine!==similarGeneration)return;$('#similar-summary').innerHTML='<p class="metric-note">相似患者暂不可用：'+esc(display.error(error,'请稍后重试'))+'</p>';}
 }
 $('#ai-cards').addEventListener('click',event=>{const b=event.target.closest('[data-locate]');if(!b)return;const node=document.querySelector(b.dataset.locate);if(node){node.scrollIntoView({behavior:'smooth',block:'center'});node.classList.remove('is-located');void node.offsetWidth;node.classList.add('is-located');}});
 $('#filter-toggle').addEventListener('click',()=>{const f=$('#journey-filter');f.hidden=!f.hidden;$('#filter-toggle').setAttribute('aria-expanded',String(!f.hidden));});
 $('#journey-filter').addEventListener('click',event=>{const b=event.target.closest('[data-f]');if(!b)return;$('#journey-filter').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));$('#journey').querySelectorAll('.insight-record').forEach(n=>n.hidden=b.dataset.f!=='all'&&n.dataset.kind!==b.dataset.f);});
 async function load(){
   if(hidden)return;
   invalidate('loading','正在智能分析患者数据…');
   if(!valid){state('invalid','患者入口无效');return;}
   const owner={generation,controller:new AbortController(),timer:null,terminal:null};flight=owner;
   owner.timer=setTimeout(()=>finish(owner,'timeout',()=>{clear();state('timeout','患者病程读取超时');},true),30000);
   try{const result=await window.RACohortAPI.patientInsight(patientId,{signal:owner.controller.signal});finish(owner,'success',()=>{render(result.data);state('success','已显示实际记录；未知和缺失保留。');});}
   catch(error){finish(owner,'error',()=>{clear();state('error',display.error(error,'患者病程暂不可用'));});}
 }
 $('#cancel-load').addEventListener('click',()=>invalidate());$('#retry-load').addEventListener('click',load);
 window.addEventListener('storage',event=>{if(!event.key||['ra-auth','ra-user','user','token','doctorId','ra-login'].includes(event.key))invalidate();});
 window.addEventListener('ra-auth-changed',()=>invalidate());window.addEventListener('pagehide',()=>{hidden=true;invalidate();});
 window.addEventListener('pageshow',event=>{if(event.persisted){hidden=false;load();}});
 window.loadPatientInsight=load;
 load();
})();
