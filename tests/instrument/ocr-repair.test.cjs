const test=require('node:test'),assert=require('node:assert/strict');
const {ID,VISIT,detail,form,flush,harness}=require('../fixtures/issue1-patient-detail.cjs');
const A='20261017/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',B='20261017/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg';
async function loaded(){const h=harness('visit-create');await flush();await h.answer(0,detail());await h.answer(1,form(true));
 h.context.ocrBanner=(anchor,html)=>{const b=h.node('.ocr-banner');b.innerHTML=html;return b;};h.node('.ocr-filled').closest=()=>null;
 const values={};h.context.vfFieldEl=()=>null;h.context.vfCurrent=(box,col,k)=>values[k]||'';h.context.vfSetValue=(box,col,k,v)=>{values[k]=v;return true;};
 return Object.assign(h,{values});}
const draft=(file,fzjc)=>({mode:'visit',patientId:ID,fileId:file,url:'/api/ra/files/ocr/'+file,basic:{},fzjc,at:Date.now()});
const creates=h=>h.requests.filter(r=>r.url.endsWith('/createVisit'));
test('ocr:multi-source-contract',async()=>{
 const h=await loaded();h.context.da=draft(A,{cfydb:'8.5'});h.context.db=draft(B,{xc:'20',cfydb:'99'});
 h.eval('applyOcr(da)');h.values.cfydb='9.25';h.eval('applyOcr(db)');
 assert.equal(h.values.cfydb,'9.25','later OCR preserves physician edits');assert.equal(h.values.xc,'20');
 await h.submit();const body=JSON.parse(creates(h)[0].options.body);
 assert.deepEqual(body.ocrFileIds,[A,B],'both applied image sources reach persistence');
 h.eval("ocrManualFields.add('rbc')");h.context.dc=draft(B,{rbc:'3'});h.eval('applyOcr(dc)');assert.equal(h.values.rbc,undefined,'manual blank is protected');
 const noLabs=await loaded();noLabs.context.da=draft(A,{cfydb:'8.5'});noLabs.context.db=draft(B,{});noLabs.eval('applyOcr(da);applyOcr(db)');await noLabs.submit();assert.deepEqual(JSON.parse(creates(noLabs)[0].options.body).ocrFileIds,[A,B]);
});
test('ocr:partial-recovery-contract',async()=>{
 const h=await loaded();h.context.da=draft(A,{cfydb:'8.5'});h.eval('applyOcr(da)');await h.submit();const first=h.requests.length-1;
 await h.answer(first,{patientId:ID,visitId:VISIT,filledCount:1,ocrLink:{status:'PENDING',linkedFileIds:[],pendingFileIds:[A],retryable:true,message:'病历已保存，原图尚未关联'}});
 assert.equal(h.navigation.length,0,'partial success remains visible');assert.match(h.node('#edit-error').innerHTML,/已保存|原图/);
 await h.submit();assert.equal(creates(h).length,1,'known saved ID blocks duplicate creation');
 const retry=h.node('#ocr-retry-link');assert.equal(typeof retry.onclick,'function');retry.onclick();await flush();assert.ok(h.requests.at(-1).url.endsWith('/ocr/linkImages'));
 assert.deepEqual(JSON.parse(h.requests.at(-1).options.body),{patientId:ID,visitId:VISIT,ocrFileIds:[A]});
 h.requests.at(-1).reject(Error('lost synthetic link acknowledgement'));await flush();retry.onclick();await flush();
 assert.equal(creates(h).length,1);assert.deepEqual(JSON.parse(h.requests.at(-1).options.body),{patientId:ID,visitId:VISIT,ocrFileIds:[A]});
 await h.answer(h.requests.length-1,{status:'LINKED',linkedFileIds:[A],pendingFileIds:[],retryable:true});assert.equal(creates(h).length,1);assert.equal(h.navigation.length,1);
 const unknown=await loaded();await unknown.submit();unknown.requests.at(-1).reject(Error('lost create acknowledgement'));await flush();await unknown.submit();assert.equal(creates(unknown).length,1,'unknown outcome must never blindly recreate');assert.match(unknown.node('#edit-error').innerHTML,/结果未知/);assert.equal(unknown.requests.some(r=>r.url.endsWith('/ocr/linkImages')),false,'no invented ID retry');
});
test('ocr:session-fence-contract',async()=>{
 const h=await loaded();h.context.da=draft(A,{cfydb:'8.5'});h.eval('ocrSaveDraft(da)');assert.ok(h.eval('ocrDraft()'));
 h.eval("signIn({doctorId:'202',name:'Other',role:'研究者'},false)");assert.equal(h.eval('ocrDraft()'),null,'new identity cannot read old draft');
 h.context.sessionStorage.setItem('ra-ocr-draft',JSON.stringify(draft(A,{cfydb:'8.5'})));assert.equal(h.eval('ocrDraft()'),null,'unbound legacy draft is not adopted');
 const queued=await loaded();queued.context.da=draft(A,{cfydb:'8.5'});queued.eval('ocrSaveDraft(da);globalThis.queuedToken=ocrToken()');
 const oldA=JSON.stringify({doctorId:'101',at:1}),sameA=JSON.stringify({doctorId:'101',at:2}),otherB=JSON.stringify({doctorId:'202'});
 await queued.event('storage',{key:'ra-auth',oldValue:oldA,newValue:sameA});assert.equal(queued.eval('ocrTokenCurrent(queuedToken)'),true,'same-doctor profile refresh keeps active OCR token');
 await queued.event('storage',{key:'ra-auth',oldValue:oldA,newValue:otherB});assert.equal(queued.eval('ocrTokenCurrent(queuedToken)'),false,'delivered switch payload revokes token even when current identity is already A again');assert.equal(queued.eval('ocrDraft()'),null);
 const late=await loaded();late.context.da=draft(A,{cfydb:'8.5'});late.eval('applyOcr(da)');await late.submit();const pending=late.requests.length-1;await late.event('pagehide');
 await late.answer(pending,{patientId:ID,visitId:VISIT,filledCount:1,ocrLink:{status:'PENDING',linkedFileIds:[],pendingFileIds:[A],retryable:true}});
 assert.equal(late.navigation.length,0);assert.equal(late.eval('ocrDraft()?.saved || null'),null,'late save cannot restore disposed recovery UI');
});
function patientHarness(){
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../..'),nodes=new Map(),requests=[],events=new Map(),winEvents=new Map(),stored=new Map(),navigation=[];
 const node=k=>{if(!nodes.has(k))nodes.set(k,{value:'',textContent:'',innerHTML:'',disabled:false,checked:false,options:[],classList:{add(){}},querySelector:q=>node(q),querySelectorAll:()=>[],addEventListener:(t,f)=>events.set(t,f),focus(){},remove(){},closest:()=>node('parent')});return nodes.get(k)};
 const formNode=node('form');formNode.reset=()=>{for(const [k,n] of nodes)if(k.startsWith('field-'))n.value='';};formNode.elements=new Proxy({},{get:(x,k)=>node('field-'+String(k))});formNode.querySelector=q=>q.includes(':checked')?null:node(q);
 const ctx={console,Date,Map,Set,URLSearchParams,RadioNodeList:class{},Event:class{},API_BASE:'',currentUser:()=>({doctorId:'101'}),sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},window:{addEventListener(t,f){if(!winEvents.has(t))winEvents.set(t,[]);winEvents.get(t).push(f);}},document:{querySelector:()=>null,querySelectorAll:()=>[]},$:node,form:formNode,field:n=>formNode.elements[n],EDIT_ID:null,queryParam:()=>null,refresh(){},checkCard(){},escapeHTML:String,apiErrorMessage:e=>e.message,toastNext(){},apiPostJson(url,body){return new Promise((resolve,reject)=>requests.push({url,body,resolve,reject}));},location:{set href(x){navigation.push(x)}},TODAY:new Date('2026-10-17'),idInfo:()=>true};
 vm.createContext(ctx);const run=s=>vm.runInContext(s,ctx);run(fs.readFileSync(path.join(root,'js/shared/ocr-import.js'),'utf8'));ctx.ocrBanner=(anchor,html)=>{const b=node('banner');b.innerHTML=html;return b;};
 const source=fs.readFileSync(path.join(root,'js/pages/patient-create.js'),'utf8');run(source.slice(source.indexOf('const ocrManualBasics ='),source.indexOf('// ===== 联动')));run(source.slice(source.indexOf('// ===== 保存 ====='),source.indexOf('// ===== 编辑档案 =====')));ctx.formData=()=>({name:'Synthetic',gender:1});
 return {ctx,node,requests,navigation,run,async event(t,e={}){for(const f of winEvents.get(t)||[])f(e);await flush();},async submit(){events.get('submit')({preventDefault(){}});await flush();}};
}
test('ocr:patient-create-contract',async()=>{
 const h=patientHarness();h.ctx.da={...draft(A,{cfydb:'8.5'}),mode:'patient',patientId:null,basic:{name:'First'}};h.ctx.db={...draft(B,{xc:'20'}),mode:'patient',patientId:null,basic:{name:'Second'}};
 h.run('applyOcr(da)');h.node('field-name').value='Physician';h.run('applyOcr(db)');assert.equal(h.node('field-name').value,'Physician');await h.submit();assert.deepEqual(Array.from(h.requests[0].body.ocrFileIds),[A,B]);
 h.requests[0].resolve({patientId:ID,studyNo:'SYNTHETIC',action:'created',ocrLink:{status:'PENDING',linkedFileIds:[B],pendingFileIds:[A],retryable:true}});await flush();assert.equal(h.navigation.length,0);await h.submit();assert.equal(h.requests.length,1);
 const retry=h.node('#ocr-retry-link');retry.onclick();await flush();assert.equal(h.requests[1].url,'/api/ra/ocr/linkImages');assert.equal(h.requests[1].body.patientId,ID);assert.equal(h.requests[1].body.visitId,null);assert.deepEqual(Array.from(h.requests[1].body.ocrFileIds),[A]);
 h.requests[1].resolve({status:'LINKED',linkedFileIds:[A],pendingFileIds:[],retryable:true});await flush();assert.equal(h.navigation.length,1);assert.match(h.navigation[0],new RegExp('visit-create.html\\?id='+ID));const kept=h.run('ocrDraft()');assert.deepEqual(Array.from(kept.fileIds),[A,B]);assert.equal(kept.patientId,ID);assert.equal(h.requests.filter(r=>r.url.endsWith('/createPatient')).length,1);
 const switched=patientHarness();switched.ctx.da={...draft(A,{}),patientId:null,basic:{name:'OLD-SYNTHETIC'}};switched.run('applyOcr(da)');await switched.submit();switched.ctx.currentUser=()=>({doctorId:'202'});await switched.event('ra-auth-changed');assert.equal(switched.node('field-name').value,'');switched.requests[0].resolve({patientId:ID,ocrLink:{status:'LINKED',linkedFileIds:[A],pendingFileIds:[]}});await flush();assert.equal(switched.navigation.length,0);assert.equal(switched.run('ocrDraft()'),null);
 const unknown=patientHarness();await unknown.submit();unknown.requests[0].reject(Error('lost acknowledgement'));await flush();await unknown.submit();assert.equal(unknown.requests.length,1);assert.match(unknown.node('#form-error').textContent,/结果未知/);
});
function dialogHarness(){
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),nodes=new Map(),events=new Map(),store=new Map();let doctor='101',dialog=null;const uploads=[],recognitions=[];
 const node=k=>{if(!nodes.has(k))nodes.set(k,{innerHTML:'',hidden:false,disabled:false,value:'',files:[{name:'synthetic.png',size:10}],listeners:{},dataset:{},classList:{add(){},remove(){},toggle(){}},querySelector:q=>node(q),querySelectorAll:()=>[],addEventListener(t,f){this.listeners[t]=f},remove(){if(this===dialog)dialog=null;this.removed=true;},close(){this.listeners.close?.()},showModal(){}});return nodes.get(k)};
 const ctx={console,Map,Set,Date,API_BASE:'',currentUser:()=>({doctorId:doctor}),sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},window:{addEventListener:(t,f)=>events.set(t,f)},document:{querySelector:s=>s==='#ocr-dialog'?dialog:null,createElement:()=>node('dialog'),body:{appendChild:n=>dialog=n}},escapeHTML:String,apiErrorMessage:e=>e.message,apiPost:(url,body)=>new Promise((resolve,reject)=>recognitions.push({url,body,resolve,reject}))};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../js/shared/ocr-import.js'),'utf8'),ctx);ctx.ocrUpload=()=>new Promise(resolve=>uploads.push(resolve));
 return {ctx,node,uploads,recognitions,change(){doctor='202';events.get('ra-auth-changed')();},hide(){events.get('pagehide')();},start(){ctx.openOcrImport({mode:'visit',onApply:()=>{throw Error('stale application')}});node('input[type=file]').listeners.change();}};
}
test('ocr:async-owner-contract',async()=>{
 const early=dialogHarness();early.start();early.change();early.uploads[0]({fileId:A,url:'/api/ra/files/ocr/'+A});await flush();assert.equal(early.recognitions.length,0,'identity revoked after upload must stop before recognition');
 for(const revoke of ['change','hide']){const h=dialogHarness();h.start();h.uploads[0]({fileId:A,url:'/api/ra/files/ocr/'+A});await flush();assert.equal(h.recognitions.length,1);h[revoke]();h.recognitions[0].resolve({fileId:A,url:'/api/ra/files/ocr/'+A,basic:{name:'STALE-SYNTHETIC-NAME'},items:[],fieldOptions:[],fzjc:{}});await flush();assert.doesNotMatch(h.node('#ocr-result').innerHTML,/STALE-SYNTHETIC-NAME/);assert.equal(h.ctx.ocrDraft(),null);}
});


test('ocr:mixed-recovery-contract',async()=>{
 const h=await loaded();h.context.da=draft(A,{cfydb:'8.5'});h.context.db=draft(B,{xc:'20'});h.eval('applyOcr(da);applyOcr(db)');await h.submit();
 await h.answer(h.requests.length-1,{patientId:ID,visitId:VISIT,filledCount:2,ocrLink:{status:'PENDING',linkedFileIds:[],pendingFileIds:[A,B],retryableFileIds:[B],retryable:true}});
 const retry=h.node('#ocr-retry-link');assert.equal(retry.disabled,false);retry.onclick();await flush();
 assert.deepEqual(JSON.parse(h.requests.at(-1).options.body),{patientId:ID,visitId:VISIT,ocrFileIds:[B]},'retry only recoverable subset, preserve the permanently blocked source');
 await h.answer(h.requests.length-1,{status:'LINKED',linkedFileIds:[B],pendingFileIds:[],retryableFileIds:[],retryable:false});
 assert.equal(h.navigation.length,0,'one blocked source prevents false complete');assert.equal(retry.disabled,true);const state=h.eval('ocrDraft().saved.ocrLink');assert.deepEqual(Array.from(state.linkedFileIds),[B]);assert.deepEqual(Array.from(state.pendingFileIds),[A]);assert.deepEqual(Array.from(state.retryableFileIds),[]);assert.deepEqual(Array.from(h.eval('ocrSourceFiles(ocrDraft())')),[A,B]);
 assert.match(h.node('.ocr-recovery-sources').innerHTML,/原图 1[^<]*|原图 1/);assert.match(h.node('.ocr-recovery-sources').innerHTML,/需人工核对/);assert.match(h.node('.ocr-recovery-sources').innerHTML,/已关联/);await h.submit();assert.equal(creates(h).length,1);
});

test('ocr:patient-bfcache-recovery-contract',async()=>{
 const h=patientHarness();h.ctx.da={...draft(A,{cfydb:'8.5'}),mode:'patient',patientId:null};h.run('applyOcr(da)');await h.submit();h.requests[0].resolve({patientId:ID,studyNo:'SYNTHETIC',action:'created',ocrLink:{status:'PENDING',linkedFileIds:[],pendingFileIds:[A],retryableFileIds:[A],retryable:true}});await flush();
 const stale=h.node('#ocr-retry-link').onclick;await h.event('pagehide');stale();await flush();assert.equal(h.requests.length,1,'disposed token cannot send');await h.event('pageshow',{persisted:true});h.node('#ocr-retry-link').onclick();await flush();
 assert.equal(h.requests.length,2,'same-doctor bfcache restores usable recovery');assert.deepEqual(JSON.parse(JSON.stringify(h.requests[1].body)),{patientId:ID,visitId:null,ocrFileIds:[A]});assert.equal(h.requests.filter(r=>r.url.endsWith('/createPatient')).length,1);h.requests[1].resolve({status:'LINKED',linkedFileIds:[A],pendingFileIds:[],retryableFileIds:[],retryable:false});await flush();assert.equal(h.navigation.length,1);
 const aba=patientHarness();aba.ctx.da={...draft(A,{}),mode:'patient',patientId:null,basic:{name:'OLD-SYNTHETIC'}};aba.run('applyOcr(da)');await aba.submit();aba.requests[0].resolve({patientId:ID,ocrLink:{status:'PENDING',linkedFileIds:[],pendingFileIds:[A],retryableFileIds:[A],retryable:true}});await flush();await aba.event('pagehide');aba.ctx.currentUser=()=>({doctorId:'202'});await aba.event('ra-auth-changed');aba.ctx.currentUser=()=>({doctorId:'101'});await aba.event('ra-auth-changed');await aba.event('pageshow',{persisted:true});aba.node('#ocr-retry-link').onclick();await flush();await aba.submit();assert.equal(aba.requests.length,1,'ABA identity must never revive saved recovery or recreate');assert.equal(aba.node('field-name').value,'');assert.equal(aba.run('ocrDraft()'),null);
 const queued=patientHarness();queued.ctx.da={...draft(A,{}),mode:'patient',patientId:null,basic:{name:'QUEUED-SYNTHETIC'}};queued.run('applyOcr(da)');await queued.submit();queued.requests[0].resolve({patientId:ID,ocrLink:{status:'PENDING',linkedFileIds:[],pendingFileIds:[A],retryableFileIds:[A],retryable:true}});await flush();await queued.event('pagehide');
 const oldA=JSON.stringify({doctorId:'101'}),otherB=JSON.stringify({doctorId:'202'});queued.ctx.currentUser=()=>({doctorId:'101'});
 await queued.event('storage',{key:'ra-auth',oldValue:oldA,newValue:otherB});await queued.event('storage',{key:'ra-auth',oldValue:otherB,newValue:oldA});await queued.event('pageshow',{persisted:true});queued.node('#ocr-retry-link').onclick();await flush();await queued.submit();
 assert.equal(queued.requests.length,1,'delivered queued A-to-B-to-A events permanently revoke old saved recovery');assert.equal(queued.node('field-name').value,'');assert.equal(queued.run('ocrDraft()'),null);assert.equal(queued.navigation.length,0);
 const currentB=patientHarness();currentB.ctx.da={...draft(A,{}),mode:'patient',patientId:null,basic:{name:'OLD-A-SYNTHETIC'}};currentB.run('applyOcr(da)');currentB.ctx.currentUser=()=>({doctorId:'202'});await currentB.event('storage',{key:'ra-auth',oldValue:oldA,newValue:otherB});await currentB.event('pageshow',{persisted:true});await currentB.submit();assert.equal(currentB.node('field-name').value,'');assert.equal(currentB.run('ocrDraft()'),null);assert.equal(currentB.requests.length,0,'current B cannot save or restore old A form');
 const unknown=patientHarness();await unknown.submit();unknown.requests[0].reject(Error('unknown creation outcome'));await flush();await unknown.event('pagehide');await unknown.event('pageshow',{persisted:true});await unknown.submit();assert.equal(unknown.requests.length,1);assert.equal(unknown.requests.some(r=>r.url.endsWith('/linkImages')),false);
});

test('ocr:numeric-result-contract',()=>{
 const h=dialogHarness();
 for(const value of ['10000abc','4.2↑','12 mg/L','NaN','Infinity','1e309'])assert.equal(h.ctx.ocrValue({type:'text'},value),'','must not silently truncate '+value);
 for(const value of ['<5','≤5','>5','≥5','4.2','1e2'])assert.equal(h.ctx.ocrValue({type:'text'},value),value);
 assert.equal(h.ctx.ocrValue({type:'radioList'},'-1'),'','a numeric negative must not become a qualitative negative');
 for(const [field,value] of [['lfsyz','30 IU/mL'],['kccpkt','>25 U/mL']])assert.equal(h.ctx.ocrValue({field,type:'text'},value),value);
 assert.equal(h.ctx.ocrValue({field:'bxb',type:'text'},'30 IU/mL'),'');
});
