const test=require('node:test'),assert=require('node:assert/strict');
const {ID,detail,visit,form,flush,harness}=require('../fixtures/issue1-patient-detail.cjs');
test('patient:legacy-detail-contract',async()=>{
 assert.equal(visit().modules.length,7,'detail success fixture preserves all seven legacy modules');
 assert.equal(form().modules.length,7,'edit success fixture preserves all seven legacy modules');
 assert.equal(form(true).modules.length,6,'create success fixture preserves the six writable legacy modules');
 const list=harness('patients','');await flush();await list.answer(0,{items:[detail('9007199254740992'),detail()],total:2,totalPatients:2,incompleteCount:0,page:1,size:8});
 assert.match(list.node('#patients').innerHTML,/href="patient-visits.html\?id=9007199254740993"/);
 assert.match(list.node('#patients').innerHTML,/href="patient-visits.html\?id=9007199254740992"/);
 for(const id of [9007199254740993,'01','9223372036854775808',null]){
  const invalid=harness('patients','');await flush();await invalid.answer(0,{items:[detail(id)],total:1,totalPatients:1,incompleteCount:0,page:1,size:8});
  assert.equal(invalid.node('#patients').innerHTML,'','invalid list identity cannot publish rounded navigation or checkbox');
  assert.match(invalid.node('#empty').querySelector('h2').textContent,/患者列表加载失败/);
 }
 for(const data of [{patientId:ID,visitId:'9007199254741003',filledCount:6},{patientId:ID,visitId:9007199254741003,filledCount:6},{patientId:9007199254740993,visitId:'9007199254741003',filledCount:6},{patientId:'9007199254740992',visitId:'9007199254741003',filledCount:6},{patientId:ID,visitId:'01',filledCount:6}]){
  const saved=harness('visit-create');await flush();await saved.answer(0,detail());await saved.answer(1,form(true));await saved.submit();assert.equal(saved.requests.length,3,'normal save request started');await saved.answer(2,data);
  if(data.patientId===ID&&data.visitId==='9007199254741003')assert.deepEqual(saved.navigation,['visit-detail.html?id='+ID+'&visit=9007199254741003']);
  else {assert.deepEqual(saved.navigation,[],'invalid save response cannot publish rounded or mismatched destination');assert.match(saved.node('#edit-error').innerHTML,/保存响应/);}
  await saved.event('pagehide');
 }
 const related=harness();await flush();await related.answer(0,{...detail(),comorbidities:[{code:'FM',name:'FM',sinceYear:2020,status:'SYNTHETIC-STATUS',coreItems:[],treatment:'SYNTHETIC-TX'}]});related.node('#patient-basic').dispatchEvent({type:'click',target:{closest:()=>({dataset:{comorbid:'FM'}})}});assert.ok(related.nodes.has('#comorbid-dialog'));await related.event('pagehide');assert.equal(related.nodes.has('#comorbid-dialog'),false,'owner dispose clears related clinical dialog');
 const audit=harness();await flush();await audit.answer(0,detail());audit.node('#audit').open=true;audit.node('#audit').dispatchEvent({type:'toggle'});await flush();assert.equal(audit.requests.length,2);await audit.event('pagehide');await audit.answer(1,[{time:'2026-10-01',action:'编辑随访',detail:'OLD-SYNTHETIC-AUDIT',operator:'Synthetic'}]);assert.equal(audit.node('#audit-list').innerHTML,'','disposed audit read cannot resurrect panel');
 const cross=harness();await flush();await cross.domReady();const ci=cross.requests.findIndex(r=>r.url.endsWith('/auth/me'));
 cross.context.localStorage.setItem('ra-auth',JSON.stringify({doctorId:'202',name:'Other',role:'研究者'}));await cross.event('storage',{key:'ra-auth'});await cross.answer(ci,{doctorId:101,name:'Old',role:'研究者'});
 assert.equal(cross.eval('String(currentUser().doctorId)'),'202','storage fences late me');
 const missing=harness('visit-edit','?id='+ID);await flush();assert.equal(missing.requests.length,0,'missing visit ID rejects before any read');
 const denied=harness();await flush();await denied.answer(0,null,401,'200',{headers:{get:()=> 'text/plain'},json:async()=>{throw Error('not json')}});
 assert.equal(denied.eval('currentUser()'),null,'HTTP401 revokes before decoding');assert.match(denied.node('#patient-basic').innerHTML,/请先登录/);
 const broken=harness('visit-edit');await flush();await broken.answer(0,detail());await broken.answer(1,{...form(),modules:null});
 assert.equal(broken.node('#visit-title').attributes['data-state'],'error','render exception terminates group with cleanup');assert.equal(broken.eval('form'),null);
 const sensitive=harness();await flush();await sensitive.answer(0,detail());sensitive.node('.identity-toggle').dispatchEvent({type:'click'});await flush();assert.equal(sensitive.requests.length,2,'sensitive request started');
 await sensitive.event('pagehide');await sensitive.answer(1,'LATE-SYNTHETIC-CARD');
 assert.doesNotMatch(sensitive.node('.identity-number').textContent,/LATE-SYNTHETIC-CARD/,'disposed ordinary sensitive callback cannot publish');
 const me=harness();await flush();await me.domReady();const meIndex=me.requests.findIndex(r=>r.url.endsWith('/auth/me'));assert.ok(meIndex>=0);
 me.eval("signIn({doctorId:'202',name:'Next',role:'研究者'},false)");await me.answer(meIndex,{doctorId:101,name:'Old',role:'研究者'});
 assert.equal(me.eval('String(currentUser().doctorId)'),'202','late auth/me cannot restore replaced identity');
 const auth=harness();await flush();await auth.answer(0,detail());auth.eval('signOut()');
 assert.doesNotMatch(auth.node('#patient-basic').innerHTML,/SYNTHETIC-ODD/,'signOut revokes before pending logout');
 const h=harness();await flush();assert.equal(h.requests.length,1,'detail request really started');
 await h.event('pagehide');await h.answer(0,{...detail(),name:'OLD-PATIENT'});
 assert.doesNotMatch(h.node('#patient-basic').innerHTML,/OLD-PATIENT/,'disposed page cannot resurrect patient');
 assert.equal(h.timers.size,0);
 const edit=harness('visit-edit');await flush();await edit.answer(0,detail('9007199254740992'));if(edit.requests[1])await edit.answer(1,{...form(),patientId:'9007199254740992'});
 assert.equal(edit.eval('form'),null,'mutually consistent wrong response pair cannot publish form');
 await edit.submit();assert.ok(edit.requests.length<=2,'invalid form submit cannot write');
 assert.ok(edit.requests.every(r=>!r.url.endsWith('/updateVisit')));
 const view=harness('visit-detail');await flush();
 assert.equal(view.eval("document.querySelector('#audit-list')"),null,'visit HTML does not invent audit IDs');
 assert.equal(view.eval("document.querySelector('#audit-count')"),null,'visit HTML uses scoped audit classes');
 assert.equal(view.eval("document.querySelector('#audit').querySelector('.audit-list')"),view.node('.audit-list'),'audit list is reachable through its actual panel');
 assert.equal(view.eval("document.querySelector('#audit').querySelector('.audit-count')"),view.node('.audit-count'),'audit count is reachable through its actual panel');
 assert.equal(view.requests.length,1,'visit detail waits for verified patient');
 await view.answer(0,detail());await view.answer(1,visit());assert.match(view.node('#visit-hero').innerHTML,/SYNTHETIC-ODD/);
 view.node('#audit').open=true;view.node('#audit').dispatchEvent({type:'toggle'});await flush();assert.equal(view.requests.length,3,'visit audit request really starts');
 await view.event('pagehide');await view.answer(2,[{time:'2026-10-01',action:'编辑随访',detail:'OLD-VISIT-AUDIT',operator:'Synthetic'}]);assert.equal(view.node('.audit-list').innerHTML,'','disposed visit audit cannot resurrect real class panel');assert.equal(view.node('.audit-count').textContent,'');assert.equal(view.node('#visit-sections').innerHTML,'');assert.doesNotMatch(view.node('#visit-hero').innerHTML,/SYNTHETIC-ODD/);
 const create=harness('visit-create');await flush();assert.equal(create.requests.length,1,'create waits for verified detail before adjacent form');
 await create.answer(0,detail());assert.equal(create.requests.length,2);await create.answer(1,form(true));assert.ok(create.eval('form'));
 const ocr=create.context.document.createElement('dialog');ocr.id='ocr-dialog';create.context.document.body.appendChild(ocr);ocr.open=true;await create.event('pagehide');assert.equal(create.nodes.has('#ocr-dialog'),false,'revoked form closes OCR actions');assert.equal(create.eval('form'),null);await create.submit();assert.equal(create.requests.length,2,'revoked create form cannot write');
 const pages=['patient-visits','visit-detail','visit-create','visit-edit'];
 const stateNode=(h,page)=>h.node(page==='patient-visits'?'#patient-basic':page==='visit-detail'?'#visit-hero':'#visit-title');
 async function answerGroup(h,page,index=0,name='CURRENT-PATIENT'){
  await h.answer(index,{...detail(),name});if(page!=='patient-visits'){const route=page==='visit-detail'?'visitDetail':page==='visit-create'?'visitCreateForm':'visitEditForm';const adjacent=h.requests.findIndex((r,i)=>i>index&&r.url.endsWith('/'+route));assert.ok(adjacent>index,'actual dependent read starts after verified patient');await h.answer(adjacent,page==='visit-detail'?visit():form(page==='visit-create'));}
 }
 for(const page of pages){
  const good=harness(page);await flush();assert.equal(good.requests.length,1);assert.deepEqual(Object.fromEntries(new URLSearchParams(good.requests[0].options.body)),{patientId:ID});
  await good.domReady();const bootstrap=good.requests.findIndex(r=>r.url.endsWith('/auth/me'));assert.ok(bootstrap>=0,'actual common.js starts auth bootstrap');await good.answer(bootstrap,{doctorId:101,name:'Synthetic',role:'研究者'});
  assert.equal(stateNode(good,page).attributes['data-state'],'loading','same-identity bootstrap preserves the active read group');
  await answerGroup(good,page);assert.equal(stateNode(good,page).attributes['data-state'],'success');assert.equal(good.timers.size,0);assert.match(good.context.document.title,/CURRENT-PATIENT/);
  if(page!=='patient-visits'){
   const html=good.node(page==='visit-detail'?'#visit-sections':'#edit-sections').innerHTML;
   assert.equal((html.match(page==='visit-detail'?/class="detail-section(?: is-empty)?"/g:/class="create-section"/g)||[]).length,page==='visit-create'?6:7);
   for(const title of ['病史病情','辅助检查','病情评估','中医诊断','治疗方案','不良反应'])assert.ok(html.includes(title),'normal module remains visible: '+title);
   for(const value of ['12.50','稍有困难','风寒湿痹证','SYNTHETIC-DRUG','5 mg'])assert.ok(html.includes(value),'normal module content remains visible: '+value);
   assert.ok(html.includes('img/record.svg'),'same-origin clinical image remains visible');
   if(page==='visit-detail'){assert.match(html,/SYNTHETIC-HISTORY/);assert.match(html,/记录日期：2026-10-01/);}
   else {assert.match(html,/data-key="followDate"/);assert.match(html,/SYNTHETIC-PRESERVED/);assert.equal(good.eval('VF.form.modules.length'),page==='visit-create'?6:7);}
   if(page==='visit-create')assert.doesNotMatch(html,/不良事件|SYNTHETIC-ADVERSE-EVENT/);
   else {assert.match(html,/不良事件/);assert.match(html,/SYNTHETIC-ADVERSE-EVENT/);}
  }
  good.eval("signIn({doctorId:101,name:'Same',role:'研究者'},false)");assert.equal(stateNode(good,page).attributes['data-state'],'success','same identity does not revoke');
  const pending=harness(page);await flush();assert.equal(pending.requests.length,1);await pending.advance(29999);assert.equal(stateNode(pending,page).attributes['data-state'],'loading');await pending.advance(1);assert.equal(stateNode(pending,page).attributes['data-state'],'timeout');assert.equal(pending.timers.size,0);assert.ok(pending.requests[0].options.signal.aborted);await pending.answer(0,{...detail(),name:'LATE-PENDING'});assert.equal(stateNode(pending,page).attributes['data-state'],'timeout');assert.doesNotMatch(pending.context.document.title,/LATE/);
  for(const signal of ['pagehide','storage','ra-auth-changed'])for(const late of ['success','failure']){
   const h=harness(page);await flush();assert.equal(h.requests.length,1);await h.event(signal,{key:'ra-auth'});assert.equal(h.timers.size,0);
   await h.event('pageshow',{persisted:true});assert.equal(h.requests.length,2);assert.equal(h.timers.size,1);
   await answerGroup(h,page,1,'NEW-PATIENT');assert.equal(stateNode(h,page).attributes['data-state'],'success');
   if(late==='success')await h.answer(0,{...detail(),name:'OLD-PATIENT'});else{h.requests[0].reject(Error('late ignored abort'));await flush();}
   assert.match(h.context.document.title,/NEW-PATIENT/);assert.doesNotMatch(h.context.document.title,/OLD-PATIENT/);assert.equal(h.timers.size,0);
   await h.event('ra-auth-changed');if(page.includes('create')||page.includes('edit')){const reads=h.requests.length;await h.submit();assert.equal(h.requests.length,reads);assert.equal(h.eval('VF.form'),null);}
  }
  for(const mutate of [d=>d.patientId=9007199254740993,d=>d.patientId='9007199254740992',d=>d.visits[0].visitId=9007199254741003,d=>d.visits[0].doctorId=101,d=>d.visits=null]){
   const h=harness(page),d=detail();await flush();mutate(d);await h.answer(0,d);assert.equal(stateNode(h,page).attributes['data-state'],'error');assert.equal(h.requests.length,1,'invalid detail cannot start adjacent reads');assert.equal(h.timers.size,0);
  }
  for(const [status,code] of [[401,'UNAUTHENTICATED'],[403,'FORBIDDEN'],[404,'RESOURCE_NOT_FOUND'],[503,'SERVICE_UNAVAILABLE'],[200,'SERVICE_UNAVAILABLE']]){
   const h=harness(page);await flush();await h.answer(0,null,status,code);assert.equal(stateNode(h,page).attributes['data-state'],'error');assert.equal(h.timers.size,0);if(status===401)assert.equal(h.eval('currentUser()'),null);
   if(page==='visit-detail'){assert.doesNotMatch(stateNode(h,page).innerHTML,/后端服务|API_BASE|fixture\.invalid/,'visit error hides developer environment guidance');assert.match(stateNode(h,page).innerHTML,/返回随访记录重新选择，或稍后重试/);}
  }
  for(const fail of ['nonJSON','malformed','network']){
   const h=harness(page);await flush();if(fail==='network'){h.requests[0].reject(Error('network'));await flush();}else await h.answer(0,null,200,'200',fail==='nonJSON'?{headers:{get:()=> 'text/html'}}:{json:async()=>{throw Error('bad json')}});
   assert.equal(stateNode(h,page).attributes['data-state'],'error');assert.equal(h.timers.size,0);assert.match(stateNode(h,page).innerHTML||h.node('#edit-error').innerHTML,fail==='network'?/网络/:/响应/);
  }
  if(page!=='patient-visits')for(const mutate of [d=>d.patientId=9007199254740993,d=>d.patientId='9007199254740992',d=>d.visitId='9007199254741001',d=>d.visitId=9007199254741003]){
   const h=harness(page);await flush();await h.answer(0,detail());const d=page==='visit-detail'?visit():form(page==='visit-create');mutate(d);await h.answer(1,d);assert.equal(stateNode(h,page).attributes['data-state'],'error');if(page!=='visit-detail'){await h.submit();assert.equal(h.requests.length,2);assert.equal(h.eval('form'),null);}
  }
  for(const bad of ['','0','01','1e1','9223372036854775808']){const h=harness(page,'?id='+bad+(page==='visit-detail'||page==='visit-edit'?'&visit=9007199254741003':''));await flush();assert.equal(h.requests.length,0);assert.equal(stateNode(h,page).attributes['data-state'],'error');}
 }
 const refresh=harness();await flush();await answerGroup(refresh,'patient-visits');await refresh.event('pageshow',{persisted:true});await refresh.answer(1,null,503,'SERVICE_UNAVAILABLE');assert.doesNotMatch(refresh.node('#patient-basic').innerHTML,/CURRENT-PATIENT|download-all|paper-import/);assert.equal(refresh.node('#visit-list').innerHTML,'');
 const off=harness();await flush();await off.domReady();const at=off.requests.findIndex(r=>r.url.endsWith('/auth/me'));await off.event('pagehide');await off.answer(at,{doctorId:202,name:'Late',role:'研究者'});assert.equal(off.eval('String(currentUser().doctorId)'),'101');
});
