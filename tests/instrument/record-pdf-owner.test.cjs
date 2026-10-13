const test=require('node:test'),assert=require('node:assert/strict');
const {detail,visit,flush,harness}=require('../fixtures/issue1-patient-detail.cjs');

// 执行真实 HTML 脚本、页面 owner 和 PDF 排版；仅提供浏览器 Canvas/jsPDF 外部能力。
async function pdfHarness(page='patient-visits',patient=detail()){
 const h=harness(page);await flush();await h.answer(0,patient);
 if(page==='visit-detail')await h.answer(1,visit());
 const scripts=[],downloads=[],toasts=[],blobs=[],revoked=[];
 let constructions=0;
 const create=h.context.document.createElement,query=h.context.document.querySelector;
 h.context.document.querySelector=selector=>selector.startsWith('script[data-src=')?scripts.find(s=>selector.includes(s.dataset.src))||null:query(selector);
 const draw={scale(){},fillRect(){},strokeRect(){},fillText(text){blobs.push(String(text));},measureText(text){return {width:String(text).length*5}}};
 h.context.document.createElement=tag=>{
  if(tag==='canvas')return {getContext:()=>draw,toDataURL:()=> 'data:image/jpeg;base64,synthetic'};
  if(tag==='a')return {click(){downloads.push(this.download)},remove(){}};
  return create(tag);
 };
 h.context.document.head={appendChild(s){scripts.push(s)}};
 h.context.URL=class extends URL{};
 h.context.URL.createObjectURL=()=> 'blob:synthetic';
 h.context.URL.revokeObjectURL=url=>revoked.push(url);
 h.context.jspdf={jsPDF:class{constructor(){constructions++}addPage(){}addImage(){}output(){return {type:'application/pdf'}}}};
 h.context.toast=message=>toasts.push(message);
 const selector=page==='visit-detail'?'#download-one':'#download-all';
 const button=h.node(selector);button.textContent=page==='visit-detail'?'下载本次病历':'下载病历';
 return {...h,scripts,downloads,toasts,blobs,revoked,button,get constructions(){return constructions},
  start(){const promise=button.onclick({currentTarget:button});return promise},
  async ready(){assert.equal(scripts.length,1,'PDF loader really started');scripts[0].onload();scripts[0].dispatchEvent({type:'load'});await flush()}};
}

test('patient:record-pdf-owner-contract',async()=>{
 const stateSelector=page=>page==='visit-detail'?'#visit-hero':'#patient-basic';
 for(const page of ['patient-visits','visit-detail']){
  for(const revoke of ['signOut','signIn','pagehide','storage']){
   const h=await pdfHarness(page);const work=h.start();assert.equal(h.button.disabled,true);
   assert.equal(h.scripts.length,1,'export entered delayed loader');
   const reads=h.requests.length;
   if(revoke==='signOut')h.eval('signOut()');
   else if(revoke==='signIn')h.eval("signIn({doctorId:'202',name:'New',role:'研究者'},false)");
   else await h.event(revoke,{key:'ra-auth'});
   await flush();assert.equal(h.node(stateSelector(page)).attributes['data-state'],'cancelled','real page owner revoked before peer returns');
   const afterRevoke=h.requests.length;
   await h.ready();await work;
   assert.equal(h.requests.length,afterRevoke,'revoked loader cannot start another detail read');
   assert.equal(h.downloads.length,0,page+': '+revoke+' export must never download');
   assert.equal(h.constructions,0,'revoked export cannot render a PDF');
   assert.equal(h.toasts.length,0,'revoked completion cannot publish a toast');
   assert.equal(h.button.disabled,true,'old completion cannot restore a revoked button');
   assert.equal(h.button.textContent,'生成中…');
   assert.ok(afterRevoke===reads||revoke==='signOut');
   await h.start();assert.equal(h.requests.length,afterRevoke,'retained old click callback cannot export after revoke');
   assert.equal(h.downloads.length,0);assert.equal(h.scripts.length,1);
  }
  const staleError=await pdfHarness(page);const staleWork=staleError.start();await staleError.event('pagehide');
  staleError.scripts[0].onerror();await staleWork;assert.equal(staleError.toasts.length,0);assert.equal(staleError.button.disabled,true);
  // 当前 owner 正常导出：患者页仍取最近随访；访视页仍使用本次已验证访视。
  const good=await pdfHarness(page);const work=good.start();await good.ready();
  if(page==='patient-visits'){
   assert.equal(good.requests.length,2,'latest visit read really started');
   const params=new URLSearchParams(good.requests[1].options.body);
   assert.equal(params.get('patientId'),detail().patientId);assert.equal(params.get('visitId'),visit().visitId);
   await good.answer(1,visit());
  }else assert.equal(good.requests.length,2,'this-visit export does not refetch');
  await work;assert.equal(good.downloads.length,1);assert.equal(good.constructions,1);
  assert.equal(good.toasts.length,1);assert.equal(good.button.disabled,false);
  assert.equal(good.button.textContent,page==='visit-detail'?'下载本次病历':'下载病历');
  assert.match(good.downloads[0],page==='visit-detail'?/_2026-10-01\.pdf$/:/RA-ODD\.pdf$/);
  assert.ok(good.blobs.includes('CRP'));assert.ok(good.blobs.includes('12.50 mg/L'));
  assert.ok(good.blobs.some(text=>text.includes(detail().patientId)),'exact patient ID survives PDF layout');
  await good.advance(30000);assert.deepEqual(good.revoked,['blob:synthetic'],'successful blob URL still cleaned');
  // loader 失败仍给当前页面错误，并恢复当前按钮。
  const failed=await pdfHarness(page);const failure=failed.start();failed.scripts[0].onerror();await failure;
  assert.equal(failed.downloads.length,0);assert.equal(failed.button.disabled,false);assert.match(failed.toasts[0],/生成病历失败/);
 }
 // 第二个 await 的撤权切点：peer 忽略本地撤权后，旧响应仍不能导出。
 for(const late of ['success','error']){
  const h=await pdfHarness();const work=h.start();await h.ready();assert.equal(h.requests.length,2);
  h.eval('signOut()');await flush();assert.equal(h.node('#patient-basic').attributes['data-state'],'cancelled');
  if(late==='success')await h.answer(1,visit());else{h.requests[1].reject(Error('late visit failed'));await flush();}
  await work;assert.equal(h.downloads.length,0);assert.equal(h.constructions,0);assert.equal(h.toasts.length,0);assert.equal(h.button.disabled,true);
 }
 // 刷新建立 B owner，迟到 A 不下载，也不清理 B 的按钮或结果。
 for(const page of ['patient-visits','visit-detail']){
  const h=await pdfHarness(page);const old=h.start();const oldButton=h.button;
  await h.event('pageshow',{persisted:true});
  const selector=page==='patient-visits'?'#download-all':'#download-one';
  // 真实 innerHTML 替换生成新的 button；fake DOM 显式丢弃已移除节点。
  h.nodes.delete(selector);
  const at=page==='patient-visits'?1:2;await h.answer(at,{...detail(),name:'NEW-PATIENT'});
  if(page==='visit-detail')await h.answer(at+1,visit());
  const current=h.node(selector);current.textContent='NEW-DOWNLOAD';
  const next=current.onclick({currentTarget:current});await h.ready();
  if(page==='patient-visits')await h.answer(at+1,visit());
  await Promise.all([old,next]);assert.equal(h.downloads.length,1);assert.match(h.downloads[0],/NEW-PATIENT/);
  assert.equal(current.disabled,false);assert.equal(current.textContent,'NEW-DOWNLOAD');assert.equal(oldButton.disabled,true);
  assert.equal(h.toasts.length,1);assert.equal(h.node(stateSelector(page)).attributes['data-state'],'success');
 }
 const noVisit=await pdfHarness('patient-visits',{...detail(),visits:[]});const empty=noVisit.start();await noVisit.ready();await empty;
 assert.equal(noVisit.requests.length,1);assert.equal(noVisit.downloads.length,1);assert.ok(noVisit.blobs.includes('暂无随访记录'));
});
