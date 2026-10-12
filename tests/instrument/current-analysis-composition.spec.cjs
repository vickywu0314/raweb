const {test,expect}=require('@playwright/test');
const {writeFile}=require('node:fs/promises');
const f=require('./current-analysis-fixture.cjs');
test('cohort:current-composition',async({page,context,browser})=>{
 test.setTimeout(90000);
 const origin=process.env.RA_STATIC_URL,requests=[],blocked=[],errors=[];let serial=1,saved=null;
 page.on('pageerror',error=>errors.push(error.message));await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin){blocked.push(req.url());return route.abort('blockedbyclient');}if(!url.pathname.startsWith('/api/'))return route.continue();
  const body=req.postDataJSON(),path=url.pathname;requests.push({path,body,method:req.method(),headers:req.headers()});let data;
  const kind=x=>Array.isArray(x.ids)&&x.ids.length===0?'EMPTY':x.age==='35-45'?'SIMILAR':x.sex==='F'?'F':x.sex==='M'?'M':'ALL';
  switch(path){
   case '/api/ra/ai/overview':data=f.overview();break;
   case '/api/ra/ai/cohort':data=f.cohort(kind(body.filters||{}),serial++);break;
   case '/api/ra/ai/parse':data=f.parse(body.question.includes('吸烟'));break;
   case '/api/ra/ai/applyParse':data={questionRef:body.questionRef,parseStatus:body.parseStatus,applyMode:body.parseStatus==='PARTIAL'?'REQUIRE_CONFIRMATION':'REPLACE_EXCEPT_IDS',applied:body.parseStatus==='OK'||body.confirmPartial===true,filters:f.filters({sex:'F',ids:body.currentFilters.ids??null}),meta:f.parse().meta};break;
   case '/api/ra/ai/patientSearch':data={items:[{patientId:'1',name:'合成患者1',studyNo:'RA-P07-1'}],total:1,page:body.page,size:body.size};break;
   case '/api/ra/ai/patientDetail':data=f.detail();break;
   case '/api/ra/ai/visitDetail':data=f.visit();break;
   case '/api/ra/ai/patientInsight':data=f.insight();break;
   case '/api/ra/ai/resolveEntry':data=f.entry();break;
   case '/api/ra/ai/chat':data=f.chat(body.scope.kind,body.scope.filters,body.scope.visitId??null);break;
   case '/api/ra/cohort/save':saved={cohortId:'00000000-0000-4000-8000-000000000700',name:body.name,note:body.note??null,filters:f.filters({sex:'F'}),version:1,createdAt:'2026-10-07T02:00:00Z',updatedAt:'2026-10-07T02:00:00Z',currentN:null};data={cohortId:saved.cohortId,version:1,meta:{traceId:f.TRACE}};break;
   case '/api/ra/cohort/list':data={page:body.page,size:20,total:saved?1:0,items:saved?[saved]:[],meta:{traceId:f.TRACE}};break;
   case '/api/ra/cohort/open':data={cohort:saved,analysis:f.cohort('F',serial++),meta:{traceId:f.TRACE}};break;
   case '/api/ra/ai/compare':data=f.comparison(body,saved);break;
   default:throw Error('Unexpected current journey path '+path);
  }
  return route.fulfill({status:200,contentType:'application/json',headers:{'X-Trace-Id':f.TRACE},body:JSON.stringify({success:true,code:'200',message:'成功',data})});
 });
 try{const {currentAnalysisJourney}=await import('./current-analysis-composition-browser.mjs');await currentAnalysisJourney(page,origin);expect(errors).toEqual([]);expect(blocked).toEqual([]);expect(requests.every(r=>r.method==='POST'&&!r.headers.authorization&&!r.headers['x-doctor-id']&&!r.body.doctorId)).toBe(true);expect(requests.filter(r=>r.path==='/api/ra/ai/parse').map(r=>r.body.question)).toEqual(['女性','女性且吸烟']);}
 finally{const evidence={scenario:'cohort:current-composition',version:browser.version(),requests,blocked,errors,dom:await page.locator('main').innerText().catch(()=>null)};for(const name of ['network.json','browser-observation.json'])await writeFile(process.env.RA_RUN_DIR+'/'+name,JSON.stringify(evidence,null,2)+'\n');}
});
