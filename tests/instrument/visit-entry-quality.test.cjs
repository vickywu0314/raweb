const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(file,extra={}){const context={console,escapeHTML,Map,Set,Date,JSON,Number,Error,...extra};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8'),context);return context;}
test('visit:entry-quality',async()=>{
 const {harness,detail,form,visit,flush}=require('../fixtures/issue1-patient-detail.cjs');
 const edit=harness('visit-edit');await flush();await edit.answer(0,detail());const f=form(false);
 f.modules.at(-1).others=[{label:'SYNTHETIC-UNKNOWN',value:'<script>SYNTHETIC-ESCAPED</script>'}];
 await edit.answer(1,f);const edited=edit.node('#edit-sections').innerHTML;
 assert.doesNotMatch(edited,/<h2>不良事件<\/h2>/);assert.match(edited,/历史附加记录/);assert.match(edited,/SYNTHETIC-ADVERSE-EVENT/);
 assert.match(edited,/&lt;script&gt;SYNTHETIC-ESCAPED&lt;\/script&gt;/);assert.doesNotMatch(edited,/<script>/);
 assert.ok(edited.indexOf('历史附加记录')>edited.indexOf('<h2>不良反应</h2>'));
 assert.doesNotMatch(edited.slice(edited.indexOf('历史附加记录')),/vf-field|vf-input|vf-wx/,'old extra records have no mutable controls');
 assert.equal(edit.eval('VF.form.modules.length'),7);assert.equal(edit.eval('JSON.stringify(vfCollect(document.querySelector("#edit-sections")))'),'{}','read-only bblsj is never copied into blsj or cleared');
 const empty=form(false);empty.modules.at(-1).record='';edit.context.vfRender(edit.node('#edit-sections'),empty);assert.doesNotMatch(edit.node('#edit-sections').innerHTML,/历史附加记录|<h2>不良事件/);
 const view=harness('visit-detail');await flush();await view.answer(0,detail());await view.answer(1,visit());
 for(const trusted of [false,true]){
  const d=visit();d.modules.at(-1).record='<b>SYNTHETIC-LEGACY</b>';view.context.renderSections(d,trusted);
  const html=view.node('#visit-sections').innerHTML;assert.equal((html.match(/class="detail-section(?: is-empty)?"/g)||[]).length,6);assert.match(html,/历史附加记录/);assert.match(html,/&lt;b&gt;SYNTHETIC-LEGACY&lt;\/b&gt;/);assert.doesNotMatch(html,/<h2>不良事件/);
  d.modules.at(-1).filled=false;d.modules.at(-1).record='';view.context.renderSections(d,trusted);assert.doesNotMatch(view.node('#visit-sections').innerHTML,/历史附加记录|SYNTHETIC-LEGACY/);
 }
});
async function validationHarness(key="bxb",unit="×10⁹/L"){
 const {harness,detail,form,flush}=require('../fixtures/issue1-patient-detail.cjs');
 const h=harness('visit-create');await flush();await h.answer(0,detail());const f=form(true);
 f.modules.find(m=>m.column==='fzjc').groups[0].fields=[{key,label:'SYNTHETIC-'+key,unit,type:'text',value:null,wx:false,validation:{kind:'laboratory',required:false,referenceConfigured:true,referenceMin:'3',referenceMax:'10',ruleVersion:'RULE-1',target:'patient:'+detail().patientId+':new'}}];
 await h.answer(1,f);const input={value:'11',focus(){}},wx={checked:false,dataset:{col:'fzjc',key}};
 const field={dataset:{col:'fzjc',key,type:'text',orig:'null'},hidden:false,querySelector:s=>s==='.vf-input'?input:s==='.vf-wx'?wx:null,closest:()=>({open:false}),classList:{add(){},remove(){}}};
 wx.closest=()=>field;h.node('#edit-sections').querySelectorAll=s=>s==='.vf-field'?[field]:s==='.vf-wx'?[wx]:[];
 return {h,input,wx,flush,detail};
}
test('visit:entry-validation',async()=>{
 const {h,input,wx,flush,detail}=await validationHarness();input.value='10000abc';
 await h.submit();
 assert.equal(h.requests.filter(r=>r.url.endsWith('/createVisit')).length,0,'invalid manual or OCR-prefilled values must be rejected before create');
 assert.match(h.node('#edit-error').innerHTML,/数值|数字/);
 input.value='11';let confirmations=0;h.context.confirmDialog=async()=>{confirmations++;return false};await h.submit();
 assert.equal(confirmations,1);assert.equal(h.requests.filter(r=>r.url.endsWith('/createVisit')).length,0);
 assert.equal(h.eval('ocrDraft()?.createPending===true'),false,'cancelled confirmation must not mark creation pending');
 let answer;h.context.confirmDialog=()=>new Promise(resolve=>answer=resolve);await h.submit();input.value='12';answer(true);await flush();
 assert.equal(h.requests.filter(r=>r.url.endsWith('/createVisit')).length,0,'changed values revoke the reviewed snapshot');assert.match(h.node('#edit-error').innerHTML,/已变化/);
 h.context.confirmDialog=async()=>true;await h.submit();
 const creates=h.requests.filter(r=>r.url.endsWith('/createVisit'));assert.equal(creates.length,1);
 const body=JSON.parse(creates[0].options.body);assert.deepEqual(body.modules.fzjc.confirmations.bxb,{value:'12',unit:'×10⁹/L',ruleVersion:'RULE-1',target:'patient:'+detail().patientId+':new'});
 for(const value of ['<9','≤9','>4','≥4'])assert.equal(h.context.vfNeedsReview({referenceMin:'3',referenceMax:'10'},value),true,value);
 assert.equal(h.context.vfNeedsReview({referenceMin:'0',referenceMax:'1'},'1.0000000000000000001'),true,'do not round a boundary into normal');

});

test('visit:serology-unit-compatibility',async()=>{
 for(const [key,unit,value] of [['lfsyz','IU/mL','30 IU/mL'],['kccpkt','U/mL','>25 U/mL']]){
  const {h,input}=await validationHarness(key,unit);h.eval(`VF.defs.fzjc.${key}.validation.referenceConfigured=false;VF.defs.fzjc.${key}.validation.unitSuffixAllowed=true`);input.value=value;
  await h.submit();assert.equal(h.requests.filter(r=>r.url.endsWith('/createVisit')).length,1,'existing serology suffix remains savable: '+value);
  const mismatch=await validationHarness(key,unit);mismatch.h.eval(`VF.defs.fzjc.${key}.validation.referenceConfigured=false;VF.defs.fzjc.${key}.validation.unitSuffixAllowed=true`);mismatch.input.value='30 '+(unit==='IU/mL'?'U/mL':'IU/mL');let checks=0;mismatch.h.context.confirmDialog=async message=>{checks++;assert.match(message,/单位不一致，请核对/);assert.doesNotMatch(message,/无下限|无上限|超出/);return false};await mismatch.h.submit();assert.equal(checks,1);assert.equal(mismatch.h.requests.filter(r=>r.url.endsWith('/createVisit')).length,0);mismatch.h.context.confirmDialog=async()=>true;await mismatch.h.submit();const body=JSON.parse(mismatch.h.requests.find(r=>r.url.endsWith('/createVisit')).options.body);assert.equal(body.modules.fzjc.confirmations[key].value,mismatch.input.value);assert.equal(body.modules.fzjc.confirmations[key].unit,unit);
 }
 const {h,input}=await validationHarness();input.value='30 IU/mL';let reviews=0;h.context.confirmDialog=async()=>{reviews++;return true};await h.submit();assert.equal(reviews,0);assert.equal(h.requests.filter(r=>r.url.endsWith('/createVisit')).length,0);
});
test('visit:confirmation-lifecycle',async()=>{
 for(const revoke of ['pagehide','ra-auth-changed','storage','reload','unchecked']){
  const {h,input,wx,flush}=await validationHarness();let answer,signal;
  h.context.confirmDialog=(_,options)=>{signal=options.signal;return new Promise(resolve=>answer=resolve)};
  await h.submit();assert.ok(signal&&!signal.aborted);
  if(revoke==='unchecked')wx.checked=true;
  else if(revoke==='reload')await h.event('pageshow',{persisted:true});
  else await h.event(revoke,{key:'ra-auth'});
  if(revoke!=='unchecked')assert.equal(signal.aborted,true,'owner revocation aborts its active confirmation: '+revoke);
  answer(true);await flush();assert.equal(h.requests.filter(r=>r.url.endsWith('/createVisit')).length,0,revoke+' prevents create after stale confirmation');
  assert.equal(h.eval('ocrDraft()?.createPending===true'),false);
 }
});

test('visit:confirmation-owner',async()=>{
 const dialogs=[];const c={document:{createElement(){const listeners=new Map(),d={returnValue:'',innerHTML:'',removed:false,shown:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n)},showModal(){this.shown=true},querySelector:()=>({focus(){}}),close(value=''){this.returnValue=value;listeners.get('close')?.()},remove(){this.removed=true}};dialogs.push(d);return d},body:{appendChild(){}}},escapeHTML,Promise};vm.createContext(c);
 const source=fs.readFileSync(path.join(root,'js/common.js'),'utf8');vm.runInContext(source.slice(source.indexOf('function confirmDialog(')),c);
 const aborted=new AbortController();aborted.abort();assert.equal(await c.confirmDialog('SYNTHETIC-REVIEW',{signal:aborted.signal}),false);assert.equal(dialogs.length,0);
 const controller=new AbortController(),work=c.confirmDialog('SYNTHETIC-REVIEW',{signal:controller.signal});assert.equal(dialogs[0].shown,true);controller.abort();assert.equal(dialogs[0].removed,true);assert.equal(await work,false);
 for(const value of ['','cancel','ok']){const old=c.confirmDialog('SYNTHETIC-LEGACY-CALL');dialogs.at(-1).close(value);assert.equal(await old,value==='ok');assert.equal(dialogs.at(-1).removed,true);}
 const late=new AbortController(),accepted=c.confirmDialog('SYNTHETIC-REVIEW',{signal:late.signal});dialogs.at(-1).close('ok');assert.equal(await accepted,true);
 const next=c.confirmDialog('SYNTHETIC-NEXT');const successor=dialogs.at(-1);late.abort();assert.equal(successor.removed,false,'settled old abort cannot remove a successor');successor.close();assert.equal(await next,false);
});
