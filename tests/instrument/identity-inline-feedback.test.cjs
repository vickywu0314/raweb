const test=require('node:test'),assert=require('node:assert/strict');
const {ID,VISIT,detail,visit,flush,harness}=require('../fixtures/issue1-patient-detail.cjs');
async function ready(page,trusted){
 const h=harness(page,`?id=${ID}${page==='visit-detail'?'&visit='+VISIT:''}${trusted?'&from=ai-cohort':''}`);await flush();
 await h.answer(0,detail());if(page==='visit-detail')await h.answer(1,visit());
 if(page==='visit-detail'){h.node('#basic-collapse').open=true;h.node('#basic-collapse').dispatchEvent({type:'toggle'});await flush();}
 return h;
}
async function click(h,selector){const n=h.node(selector);n.dispatchEvent({type:'click',target:n,preventDefault(){}});await flush();}
const feedback=h=>h.node('.identity-feedback'),retry=h=>h.node('.identity-retry');
function cleared(h){assert.equal(feedback(h).hidden,true);assert.equal(feedback(h).textContent,'');assert.equal(retry(h).hidden,true);assert.equal(h.alerts.length,0);}
function failed(h,timeout=false){assert.equal(feedback(h).hidden,false);assert.equal(feedback(h).textContent,timeout?'身份证号查询超时，请重试。':'身份证号暂不可用，请重试。');assert.equal(retry(h).hidden,false);assert.equal(h.node('.identity-number').textContent,'SYNTHETIC-MASKED');assert.equal(h.node('.identity-toggle').attributes['aria-pressed'],'false');assert.equal(h.alerts.length,0);assert.doesNotMatch(feedback(h).textContent,/RAW|CARD|900719|stack|SQL/);}
test('patient:identity-inline-feedback',async()=>{
 for(const trusted of [true,false])for(const page of ['patient-visits','visit-detail']){
  const h=await ready(page,trusted),box=h.node(page==='patient-visits'?'#patient-basic':'#basic-collapse');
  assert.ok(box.querySelector('.identity-feedback'),'production card row must provide inline feedback');
  assert.ok(box.querySelector('.identity-retry'),'production card row must provide retry');
  assert.equal(feedback(h).getAttribute('role'),'status');assert.equal(feedback(h).getAttribute('aria-live'),'polite');assert.equal(feedback(h).getAttribute('aria-atomic'),'true');
  assert.equal(h.node('.identity-toggle').getAttribute('aria-describedby'),feedback(h).getAttribute('id'));cleared(h);
  await click(h,'.identity-toggle');const at=h.requests.length-1;
  assert.ok(h.requests[at].url.endsWith(trusted?'/api/ra/ai/patientSensitive':'/api/ra/patient/patientSensitive'));
  const body=trusted?JSON.parse(h.requests[at].options.body):Object.fromEntries(new URLSearchParams(h.requests[at].options.body));assert.equal(body.patientId,ID);if(!trusted)assert.equal(body.doctorId,'101');
  h.requests[at].reject(Error('RAW-SQL-CARD-DETAIL'));await flush();failed(h);assert.equal(h.timers.size,0);
  await click(h,'.identity-retry');cleared(h);assert.equal(h.requests.length,at+2);const current=h.requests.length-1;
  await h.answer(current,trusted?{patientId:ID,cardNo:'SYNTHETIC-CARD'}:'SYNTHETIC-CARD');assert.equal(h.node('.identity-number').textContent,'SYNTHETIC-CARD');cleared(h);
  await click(h,'.identity-toggle');assert.equal(h.node('.identity-number').textContent,'SYNTHETIC-MASKED');cleared(h);
  await click(h,'.identity-toggle');const pending=h.requests.length-1;await h.advance(29999);cleared(h);await h.advance(1);failed(h,true);assert.equal(h.timers.size,0);
  if(trusted)assert.equal(h.requests[pending].options.signal.aborted,true);
  await click(h,'.identity-retry');const next=h.requests.length-1;cleared(h);assert.equal(h.timers.size,1);
  await h.answer(pending,trusted?{patientId:ID,cardNo:'LATE-TIMEOUT-CARD'}:'LATE-TIMEOUT-CARD');assert.equal(h.node('.identity-number').textContent,'SYNTHETIC-MASKED');cleared(h);assert.equal(h.timers.size,1);
  await h.answer(next,null,503,'SERVICE_UNAVAILABLE');failed(h);
  if(page==='visit-detail'){box.open=false;box.dispatchEvent({type:'toggle'});await flush();cleared(h);const count=h.requests.length;await click(h,'.identity-retry');assert.equal(h.requests.length,count);box.open=true;box.dispatchEvent({type:'toggle'});await flush();await click(h,'.identity-toggle');}else await click(h,'.identity-retry');const closed=h.requests.length-1;await click(h,'.identity-toggle');cleared(h);assert.equal(h.timers.size,0);
  h.requests[closed].reject(Error('late ignored abort'));await flush();cleared(h);
  for(const signal of ['pagehide','ra-auth-changed','storage'])for(const late of ['success','failure']){
   const cut=await ready(page,trusted);await click(cut,'.identity-toggle');const old=cut.requests.length-1;await cut.event(signal,{key:'ra-auth'});cleared(cut);assert.equal(cut.timers.size,0);
   const count=cut.requests.length;await click(cut,'.identity-retry');assert.equal(cut.requests.length,count,'disposed retry cannot start another read');
   await cut.event('pageshow',{persisted:true});const fresh=count;await cut.answer(fresh,detail());if(page==='visit-detail'){await cut.answer(fresh+1,visit());cut.node('#basic-collapse').open=true;cut.node('#basic-collapse').dispatchEvent({type:'toggle'});await flush();}
   await click(cut,'.identity-toggle');const newRead=cut.requests.length-1;assert.equal(cut.timers.size,1);
   if(late==='success')await cut.answer(old,trusted?{patientId:ID,cardNo:'LATE-OLD-IDENTITY'}:'LATE-OLD-IDENTITY');else{cut.requests[old].reject(Error('late old identity'));await flush();}
   cleared(cut);assert.equal(cut.timers.size,1);assert.equal(cut.node('.identity-number').textContent,'SYNTHETIC-MASKED');
   await cut.answer(newRead,trusted?{patientId:ID,cardNo:'SYNTHETIC-NEW-OWNER'}:'SYNTHETIC-NEW-OWNER');assert.equal(cut.node('.identity-number').textContent,'SYNTHETIC-NEW-OWNER');cleared(cut);assert.equal(cut.timers.size,0);
  }
 }
});
