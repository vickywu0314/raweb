import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const all=['patientId','sex','age','studyNo','treatmentCategory','genericDrugIds','line','schemeDurationMonths','das28Base','das28At','das28Current','crpCurrent','fm','as','completeness'];
const scores=['3.7','3.6','3.5','3.4','3.3','3.2','3.1','3','2.9','2.8','2.7','2.6','2.5','2.4','2.3','2.2','2.1','2','1.9','1.8','1.7','1.6','1.5','1.4','1.3','1.2','1.1','1','0.9','0.8','0.7','0.6','0.5','0.4','0.3','0.2','0.1'];
const crps=['10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','43','44','45','46'];
export async function exportBrowser(context,port,identity,owner,probe,pid){
 const origin=`http://127.0.0.1:${port}`,requests=[],responses=[],downloads=[],errors=[],audit={};
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 await context.route('**/*',async route=>{const r=route.request(),url=new URL(r.url());if(url.origin!==origin)return route.abort('blockedbyclient');if(url.pathname.startsWith('/api/'))requests.push({path:url.pathname,method:r.method(),body:r.postDataJSON(),headers:r.headers()});return route.continue();});
 const page=await context.newPage();await page.setViewportSize({width:1280,height:720});page.setDefaultTimeout(30000);await page.bringToFront();owner.event('page-created',{pid,port});
 page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d.suggestedFilename()));
 const perform=async(action,path)=>{const ready=page.waitForResponse(r=>new URL(r.url()).pathname===path);await action();const response=await ready;responses.push({path,status:response.status(),headers:response.headers()});return response;};
 const inspect=async filename=>{await owner.command(`${owner.javaEnv.JAVA_HOME}/bin/java`,['-cp',owner.classpath,'com.wenwen.ai.cohort.WebExportWorkbookInspector',owner.dir+'/'+filename,owner.dir+'/workbook-observation.json'],{env:owner.javaEnv,cwd:owner.repo},'workbook-inspector',10000);const observed=JSON.parse(await readFile(owner.dir+'/workbook-observation.json','utf8')),bytes=await readFile(owner.dir+'/'+filename);assert.equal(observed.filename,filename);assert.equal(observed.bytes,bytes.length);assert.equal(observed.sha256,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(observed.sheetNames,['cohort','metadata']);return observed;};
 const assertMetadata=(o,id,selection,n)=>{assert.equal(o.metadata.source,'COHORT');assert.equal(o.metadata.referenceId,id);assert.equal(o.metadata.selectionMode,selection.length===15?'DEFAULT':'EXPLICIT');assert.deepEqual(JSON.parse(o.metadata.selected),selection);assert.equal(o.metadata.selectedItemsN,String(selection.length));assert.equal(o.metadata.rowN,String(n));assert.equal(o.metadata.status,n?'DATA':'EMPTY');assert.equal(o.metadata.freeStart,'2026-04-01');assert.equal(o.metadata.today,'2026-10-07');assert.equal(o.metadata.policyVersion,'dev-export-v01');assert.equal(o.metadata.at,'now');const conditions=JSON.parse(o.metadata.conditions);assert.deepEqual(Object.keys(conditions.ids).sort(),['effectiveIdsN','mode','submittedUniqueIdsN']);assert.ok(!Array.isArray(conditions.ids));for(let id=101;id<=137;id++){assert.ok(!JSON.stringify(o.metadata).includes('合成文件患者'+id));assert.ok(!JSON.stringify(o.metadata).includes('EXPORT-'+id));}};
 const file=async(filename,action,id,n)=>{const downloaded=page.waitForEvent('download');const response=await perform(action,'/api/ra/export/xlsx');assert.equal(response.status(),200);assert.equal(response.headers()['content-type'].split(';')[0].trim().toLowerCase(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.equal(response.headers()['cache-control'],'no-store');assert.match(response.headers()['content-disposition'],/attachment/);const download=await downloaded;assert.match(download.suggestedFilename(),/\.xlsx$/);await download.saveAs(owner.dir+'/'+filename);await expect(page.locator('#export-state')).toHaveAttribute('data-state','success');const trace=response.headers()['x-trace-id'];assert.match(trace,/^[0-9a-f-]{36}$/);await expect.poll(async()=>(await owner.mysqlQuery(`SELECT generation_status,transfer_status,file_rows,file_bytes,reference_id,source FROM ra_synthetic_test.ra_ai_export_audit WHERE id='${trace}' AND actor_doctor_id=101`)).trim(),{timeout:5000}).toBe(`READY\tWRITTEN\t${n}\t${(await readFile(owner.dir+'/'+filename)).length}\t${id}\tCOHORT`);audit[filename]={trace,serverWriteOnly:true,observed:(await owner.mysqlQuery(`SELECT generation_status,transfer_status,file_rows,file_bytes FROM ra_synthetic_test.ra_ai_export_audit WHERE id='${trace}' AND actor_doctor_id=101`)).trim()};};
 try{
  const first=await perform(()=>page.goto(origin+'/ai-cohort.html'),'/api/ra/ai/cohort'),cohort=(await first.json()).data;assert.equal(cohort.n,37);assert.equal(cohort.studyTotal,37);await expect(page.locator('#patient-rows .ai-row')).toHaveCount(10);await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#export').click();const count=requests.length;const rejection=await perform(()=>page.locator('#export-default').click(),'/api/ra/export/xlsx');assert.equal(rejection.status(),409);const rejected=await rejection.json(),d=rejected.data;assert.equal(rejected.code,'NEED_APPLY');assert.deepEqual(Object.keys(d).sort(),['decision','source','referenceId','selectionMode','requested','eligible','blocked','freeStart','today','policyVersion'].sort());assert.equal(d.referenceId,cohort.analysisId);assert.equal(d.source,'COHORT');assert.equal(d.selectionMode,'DEFAULT');assert.deepEqual(d.requested,all);assert.deepEqual(d.eligible,['das28At','das28Current','crpCurrent']);const incomplete=['treatmentCategory','genericDrugIds','line','schemeDurationMonths','fm','as','completeness'];assert.deepEqual(d.blocked,all.filter(f=>!['das28At','das28Current','crpCurrent'].includes(f)).map(field=>({field,side:null,reason:incomplete.includes(field)?'INCOMPLETE_SOURCE_EVIDENCE':'MISSING_SOURCE_DATE',affectedN:37})));assert.equal(d.freeStart,'2026-04-01');assert.equal(d.today,'2026-10-07');assert.equal(d.policyVersion,'dev-export-v01');await expect(page.locator('#export-decision')).toContainText('affectedN=37');await page.locator('#export-eligible').click();assert.equal(requests.length,count+1);await page.locator('#export-cancel').click();assert.equal(requests.length,count+1);assert.equal(downloads.length,0);
  await page.locator('#export').click();for(const field of ['das28Current','crpCurrent'])await page.locator(`#export-fields input[value="${field}"]`).check();await file('cohort-download.xlsx',()=>page.locator('#export-confirm').click(),cohort.analysisId,37);assert.deepEqual(requests.at(-1).body,{source:'COHORT',analysisId:cohort.analysisId,fields:['das28Current','crpCurrent']});const observed=await inspect('cohort-download.xlsx');assertMetadata(observed,cohort.analysisId,['das28Current','crpCurrent'],37);const sheet=observed.sheets[0];assert.equal(sheet.rows,38);assert.equal(sheet.cells.length,76);assert.deepEqual(sheet.cells.filter(c=>c.row===0).map(c=>[c.column,c.type,c.string]),[[0,'STRING','das28Current'],[1,'STRING','crpCurrent']]);for(let i=0;i<37;i++)for(const [column,raw] of [[0,scores[i]],[1,crps[i]]])assert.deepEqual(sheet.cells.find(c=>c.row===i+1&&c.column===column),{row:i+1,column,type:'NUMERIC',raw,string:null});
  const emptyResponse=await perform(()=>page.goto(origin+'/ai-cohort.html?ids='),'/api/ra/ai/cohort'),empty=(await emptyResponse.json()).data;assert.equal(empty.n,0);assert.notEqual(empty.analysisId,cohort.analysisId);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','empty');await expect(page.locator('#export')).toBeEnabled();await page.locator('#export').click();await file('empty-cohort-download.xlsx',()=>page.locator('#export-default').click(),empty.analysisId,0);assert.deepEqual(requests.at(-1).body,{source:'COHORT',analysisId:empty.analysisId});const emptyObserved=await inspect('empty-cohort-download.xlsx');assertMetadata(emptyObserved,empty.analysisId,all,0);assert.equal(emptyObserved.sheets[0].rows,1);assert.deepEqual(emptyObserved.sheets[0].cells.map(c=>[c.row,c.column,c.type,c.string]),all.map((f,i)=>[0,i,'STRING',f==='das28At'?'评估 DAS28（now）':f]));await writeFile(owner.dir+'/workbook-observation.json',JSON.stringify({cohort:observed,empty:emptyObserved},null,2)+'\n');assert.equal(downloads.length,2);assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.path==='/api/ra/export/xlsx').length,3);assert.ok(requests.every(r=>r.headers.authorization===undefined&&r.headers['x-doctor-id']===undefined));
 }finally{const observation={scenario:'cohort:browser-export-cohort',requests,responses,downloads,errors,audit,dom:await page.locator('main').innerText().catch(()=>null)};await writeFile(owner.dir+'/browser-observation.json',JSON.stringify(observation,null,2)+'\n');await writeFile(owner.dir+'/network.json',JSON.stringify({requests,responses},null,2)+'\n');}
}

// P06b的实际宽表真值只来自冻结字面与独立Decimal/SciPy oracle，不调用产品builder。
export async function exportComparisonBrowser(context,port,identity,owner,probe,pid,fixture){
 assert.equal(identity,'synthetic');assert.equal(fixture.scenario,'p06-comparison');
 const origin=`http://127.0.0.1:${port}`,requests=[],responses=[],downloads=[],errors=[],blocked=[],audit={},pages=[];
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 const directory=['n','age','duration','das28At','crpAt','haqAt','female','sero','target','complete','activity','line'];
 const metrics=['n','das28At','crpAt','haqAt','target','activity'];
 const columns=['metric','kind','category','aN','bN','aValidN','bValidN','aUnknownN','bUnknownN','aDenominator','bDenominator','aKnownN','bKnownN','aNumerator','bNumerator','aQ1','aMedian','aQ3','aIqr','bQ1','bMedian','bQ3','bIqr','aValue','bValue','aCount','bCount','difference','pValue','displayP','method','testStatus','reason','nA','nB','testDenominator','warnings'];
 const idsA=['1','2','3','4','5','6','7','8'],idsB=['7','8','9','10','11','12','13','14'];
 const filters=ids=>({studyCode:'RA',at:'now',act:null,ids,sex:null,age:null,sero:null,cm:null,tx:null,data:null});
 const savedName='saved-comparison-name-CANARY',savedNote='saved-comparison-note-CANARY';
 const proof={oracle:'Frozen P06b literals and p04b/independent-oracles.json; actual workbook cells read by Java8 POI/ZipFile',scope:'Synthetic Principal 101, fixed 14-person seed and Clock2026-10-07T02:00:00Z'};
 let savedId,savedVersion,firstId,excludedId,comparisonObserved,excludedObserved;
 const exactKeys=(value,keys,label)=>assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),label);
 const act=async(page,action)=>{await page.bringToFront();return action();};
 const perform=async(page,action,path)=>{
  const pending=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='POST');pending.catch(()=>{});
  await act(page,action);const response=await pending,headers=response.headers();
  const observed={path,status:response.status(),headers,body:response.request().postDataJSON()};
  if(headers['content-type']?.includes('application/json'))observed.json=await response.json();
  responses.push(observed);return {response,...observed};
 };
 const success=result=>{assert.equal(result.status,200);assert.equal(result.json.success,true);assert.equal(result.json.code,'200');assert.match(result.headers['x-trace-id'],uuid);return result.json.data;};
 const exportRequests=()=>requests.filter(request=>request.path==='/api/ra/export/xlsx');
 const comparisonRequests=()=>requests.filter(request=>request.path==='/api/ra/ai/compare');
 const createPage=async label=>{
  const page=await context.newPage();pages.push(page);await page.setViewportSize({width:1280,height:720});page.setDefaultTimeout(30000);
  page.on('pageerror',error=>errors.push({label,error:error.message}));page.on('download',download=>downloads.push({label,suggestedFilename:download.suggestedFilename()}));
  owner.event('page-created',{pid,port,label});return page;
 };
 const currentComparison=async(page,data)=>{
  await expect(page.locator('#compare-state')).toHaveAttribute('data-state','success');
  await expect(page.locator('#compare-result')).toHaveAttribute('data-compare-result-id',data.compareResultId);
  await expect(page.locator('#compare-export')).toBeEnabled();assert.deepEqual(await page.evaluate(()=>window.RACohortComparison.getResource()),data);
 };
 const createComparison=async(page,excludeOverlap)=>{
  const result=await perform(page,()=>page.locator('#compare-start').click(),'/api/ra/ai/compare'),data=success(result);
  assert.deepEqual(result.body,{a:{source:'FILTERS',filters:{...filters(idsA),act:'',age:'',cm:'',data:'',sero:'',sex:'',tx:''}},b:{source:'SAVED',cohortId:savedId},excludeOverlap});
  assert.match(data.compareResultId,uuid);assert.equal(data.studyTotal,14);assert.equal(data.overlapN,2);assert.equal(data.excludeOverlap,excludeOverlap);
  assert.equal(data.a.source,'FILTERS');assert.equal(data.b.source,'SAVED');assert.equal(data.b.cohortId,savedId);assert.equal(data.b.cohortVersion,savedVersion);
  for(const side of ['a','b']){assert.equal(data[side].nBeforeExclusion,8);assert.equal(data[side].n,excludeOverlap?6:8);assert.equal(data[side].evalN,excludeOverlap?6:8);assert.equal(data[side].submittedUniqueIdsN,8);assert.equal(data[side].effectiveIdsN,8);}
  assert.equal(data.rows.length,12);assert.deepEqual(data.rows.map(row=>row.metric),directory);assert.equal(data.meta.computedAt,'2026-10-07T02:00:00Z');assert.equal(data.meta.expiresAt,'2026-10-07T02:15:00Z');
  await currentComparison(page,data);return data;
 };
 const decimal=value=>{
  const match=String(value).match(/^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/);assert.ok(match,'raw finite decimal '+value);
  let coefficient=BigInt(match[1]+match[2]+(match[3]||'')),scale=(match[3]||'').length-Number(match[4]||0);
  if(coefficient===0n)return '0';while(coefficient%10n===0n){coefficient/=10n;scale--;}
  return coefficient+':'+scale;
 };
 const approximate=(actual,expected,label)=>{
  assert.ok(Number.isFinite(actual),label);const difference=Math.abs(actual-expected);
  assert.ok(difference<=1e-12&&(expected===0||difference/Math.abs(expected)<=1e-10),`${label}: raw ${actual} differs from independent ${expected}`);
 };
 const before={
  n:8,
  continuous:{
   das28At:{a:['2.225','2.85','4.025','1.8'],b:['4.575','4.85','5.325','0.75'],valid:8,unknown:0,difference:'-2'},
   crpAt:{a:['1.1','1.8','2.5','1.4'],b:['3.5','4.2','4.9','1.4'],valid:8,unknown:0,difference:'-2.4'},
   haqAt:{a:['0.25','0.3','0.45','0.2'],b:['0.85','1','1.15','0.3'],valid:7,unknown:1,difference:'-0.7'}
  },
  target:{numerators:[4,0],values:['0.5','0'],difference:'50'},
  activity:{aCounts:[2,2,3,1],bCounts:[0,0,1,7],aValues:['0.25','0.25','0.375','0.125'],bValues:['0','0','0.125','0.875']}
 };
 const excluded={
  n:6,
  continuous:{
   das28At:{a:['2.075','2.5','2.925','0.85'],b:['4.775','5.05','5.775','1'],valid:6,unknown:0,difference:'-2.55',p:0.0021645021645021645,displayP:'0.002',method:'MANN_WHITNEY_EXACT'},
   crpAt:{a:['0.9','1.4','1.9','1'],b:['4.1','4.6','5.1','1'],valid:6,unknown:0,difference:'-3.2',p:0.0021645021645021645,displayP:'0.002',method:'MANN_WHITNEY_EXACT'},
   haqAt:{a:['0.225','0.3','0.375','0.15'],b:['0.925','1.05','1.175','0.25'],valid:6,unknown:0,difference:'-0.75',p:0.004998124765082457,displayP:'0.005',method:'MANN_WHITNEY_ASYMPTOTIC',warnings:'SMALL_SAMPLE_TIES'}
  },
  target:{numerators:[4,0],values:[{approx:2/3},'0'],difference:{approx:200/3},p:0.060606060606060615,displayP:'0.061',method:'FISHER_EXACT'},
  activity:{aCounts:[2,2,2,0],bCounts:[0,0,0,6],aValues:[{approx:1/3},{approx:1/3},{approx:1/3},'0'],bValues:['0','0','0','1'],p:0.007383160505359769,displayP:'0.007',method:'CHI_SQUARE',warnings:'SPARSE_EXPECTED_COUNTS'}
 };
 const assertWorkbook=(observed,id,excludedMode)=>{
  assert.deepEqual(observed.sheetNames,['comparison','metadata']);assert.equal(observed.sheets.length,2);
  const sheet=observed.sheets[0],wanted=excludedMode?excluded:before;
  assert.equal(sheet.name,'comparison');assert.equal(sheet.rows,10);assert.equal(sheet.cells.length,10*37);
  const cells=new Map(sheet.cells.map(cell=>[cell.row+':'+cell.column,cell]));assert.equal(cells.size,10*37);
  const blank=cell=>assert.deepEqual(cell,{row:cell.row,column:cell.column,type:'BLANK',raw:null,string:null});
  const check=(row,column,value)=>{
   const cell=cells.get(row+':'+column),label=`${excludedMode?'excluded':'overlap'} row=${row} ${columns[column]}`;assert.ok(cell,label);
   if(value===undefined||value===null){blank(cell);return;}
   if(typeof value==='object'&&Object.hasOwn(value,'text')){assert.equal(cell.type,'STRING',label);assert.equal(cell.string,value.text,label);return;}
   if(typeof value==='object'&&value.emptyWarnings){if(cell.type==='BLANK')blank(cell);else{assert.equal(cell.type,'STRING',label);assert.equal(cell.string,'',label);}return;}
   assert.equal(cell.type,'NUMERIC',label);assert.equal(cell.string,null,label);assert.equal(typeof cell.raw,'string',label);
   assert.ok(Number.isFinite(Number(cell.raw)),label);if(typeof value==='object')approximate(Number(cell.raw),value.approx,label);else assert.equal(decimal(cell.raw),decimal(value),label);
  };
  columns.forEach((name,column)=>check(0,column,{text:name}));
  const rows=[{metric:{text:'n'},kind:{text:'COUNT'},aN:wanted.n,bN:wanted.n}];
  const test=(sample,denominator,n)=>excludedMode?{pValue:{approx:sample.p},displayP:{text:sample.displayP},method:{text:sample.method},testStatus:{text:'OK'},nA:n,nB:n,testDenominator:{text:denominator},warnings:sample.warnings?{text:sample.warnings}:{emptyWarnings:true}}:{displayP:{text:'—'},testStatus:{text:'OVERLAP'},reason:{text:'COHORTS_OVERLAP'},nA:n,nB:n,testDenominator:{text:denominator},warnings:{emptyWarnings:true}};
  for(const metric of ['das28At','crpAt','haqAt']){
   const sample=wanted.continuous[metric],row={metric:{text:metric},kind:{text:'CONTINUOUS'},difference:sample.difference,...test(sample,'NON_MISSING_METRIC',sample.valid)};
   for(const side of ['a','b']){row[side+'ValidN']=sample.valid;row[side+'UnknownN']=sample.unknown;['Q1','Median','Q3','Iqr'].forEach((field,index)=>row[side+field]=sample[side][index]);}rows.push(row);
  }
  const target={metric:{text:'target'},kind:{text:'BINARY'},difference:wanted.target.difference,...test(wanted.target,'EVALUABLE_TARGET',wanted.n)};
  for(const [index,side] of ['a','b'].entries()){target[side+'Numerator']=wanted.target.numerators[index];target[side+'Denominator']=wanted.n;target[side+'KnownN']=wanted.n;target[side+'UnknownN']=0;target[side+'Value']=wanted.target.values[index];}rows.push(target);
  for(const [index,category] of ['remission','low','moderate','high'].entries()){
   const row={metric:{text:'activity'},kind:{text:'DISTRIBUTION'},category:{text:category},...(index===0?test(wanted.activity,'EVALUABLE_ACTIVITY',wanted.n):{})};
   for(const side of ['a','b']){row[side+'Denominator']=wanted.n;row[side+'KnownN']=wanted.n;row[side+'UnknownN']=0;row[side+'Count']=wanted.activity[side+'Counts'][index];row[side+'Value']=wanted.activity[side+'Values'][index];}rows.push(row);
  }
  assert.equal(rows.length,9);rows.forEach((row,index)=>columns.forEach((name,column)=>check(index+1,column,row[name])));
  const metadata=observed.metadata;
  for(const [key,value] of Object.entries({source:'COMPARE',referenceId:id,selectionMode:'EXPLICIT',selectedItemsN:'6',rowN:'9',aN:String(wanted.n),bN:String(wanted.n),status:'DATA',freeStart:'2026-04-01',today:'2026-10-07',policyVersion:'dev-export-v01',at:'now',asOf:'2026-10-07',computedAt:'2026-10-07T02:00:00Z',generatedAt:'2026-10-07T02:00:00Z'}))assert.equal(metadata[key],value,'metadata '+key);
  assert.deepEqual(JSON.parse(metadata.selected),metrics);
  const conditions=JSON.parse(metadata.conditions);exactKeys(conditions,['a','b','excludeOverlap','overlapN'],'safe comparison conditions');assert.equal(conditions.excludeOverlap,excludedMode);assert.equal(conditions.overlapN,2);
  assert.equal(conditions.a.source,'FILTERS');assert.equal(conditions.a.cohortId,null);assert.equal(conditions.a.cohortVersion,null);
  assert.equal(conditions.b.source,'SAVED');assert.equal(conditions.b.cohortId,savedId);assert.equal(conditions.b.cohortVersion,savedVersion);
  const {ids:unused,...safeFilters}=filters(idsA);
  for(const side of ['a','b']){
   exactKeys(conditions[side],['source','cohortId','cohortVersion','filters','ids'],'safe '+side);assert.deepEqual(conditions[side].filters,safeFilters);
   exactKeys(conditions[side].ids,['mode','submittedUniqueIdsN','effectiveIdsN'],'safe selection count '+side);assert.equal(typeof conditions[side].ids.mode,'string');assert.equal(conditions[side].ids.submittedUniqueIdsN,8);assert.equal(conditions[side].ids.effectiveIdsN,8);
  }
  const assertSafe=value=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){assert.ok(!['name','note','rawJson','question','prompt','patientIds','includedPatientIds','intersectionPatientIds'].includes(key),'private condition key '+key);if(key==='ids')assert.ok(item!==null&&typeof item==='object'&&!Array.isArray(item));assertSafe(item);}};assertSafe(conditions);
  const exposed=observed.sheets.flatMap(value=>value.cells).filter(cell=>cell.type==='STRING').map(cell=>cell.string).join('\n');
  for(const canary of ['synthetic-comparison-name-CANARY','synthetic-comparison-case-CANARY','synthetic-unmapped-drug-CANARY',savedName,savedNote,...Array.from({length:14},(_,index)=>`110101${2006-index}10070011`)])assert.ok(!exposed.includes(canary),'workbook leaks '+canary);
  assert.ok(!/"ids"\s*:\s*\[/.test(exposed));assert.ok(!/"(?:patientIds|includedPatientIds|intersectionPatientIds)"\s*:/.test(exposed));
 };
 const inspect=async(filename,id,excludedMode)=>{
  await owner.command(`${owner.javaEnv.JAVA_HOME}/bin/java`,['-cp',owner.classpath,'com.wenwen.ai.cohort.WebExportWorkbookInspector',owner.dir+'/'+filename,owner.dir+'/workbook-observation.json'],{env:owner.javaEnv,cwd:owner.repo},'workbook-inspector',10000);
  const observed=JSON.parse(await readFile(owner.dir+'/workbook-observation.json','utf8')),bytes=await readFile(owner.dir+'/'+filename);
  assert.equal(observed.filename,filename);assert.equal(observed.bytes,bytes.length);assert.equal(observed.sha256,createHash('sha256').update(bytes).digest('hex'));assertWorkbook(observed,id,excludedMode);return observed;
 };
 const downloadFile=async(page,filename,id,n)=>{
  const pending=page.waitForEvent('download');pending.catch(()=>{});const result=await perform(page,()=>page.locator('#export-confirm').click(),'/api/ra/export/xlsx');
  assert.equal(result.status,200);assert.deepEqual(result.body,{source:'COMPARE',compareResultId:id,metrics});assert.equal(result.headers['content-type'].split(';')[0].trim().toLowerCase(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.equal(result.headers['cache-control'],'no-store');assert.match(result.headers['content-disposition'],/attachment/);
  const download=await pending;assert.match(download.suggestedFilename(),/\.xlsx$/);await download.saveAs(owner.dir+'/'+filename);await expect(page.locator('#export-state')).toHaveAttribute('data-state','success');
  const bytes=await readFile(owner.dir+'/'+filename),trace=result.headers['x-trace-id'];assert.match(trace,uuid);assert.match(id,uuid);
  const sql=`SELECT generation_status,transfer_status,file_rows,file_bytes,reference_id,source,cohort_a_n,cohort_b_n FROM ra_synthetic_test.ra_ai_export_audit WHERE id='${trace}' AND actor_doctor_id=101`;
  const expected=`READY\tWRITTEN\t9\t${bytes.length}\t${id}\tCOMPARE\t${n}\t${n}`;
  await expect.poll(async()=>(await owner.mysqlQuery(sql)).trim(),{timeout:5000}).toBe(expected);
  audit[filename]={trace,referenceId:id,source:'COMPARE',fileRows:9,fileBytes:bytes.length,cohortAN:n,cohortBN:n,observed:expected,serverWriteOnly:true,delivery:'actual browser download saved and independently inspected'};
 };
 await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin||owner.controller.signal.aborted){blocked.push(request.url());return route.abort('blockedbyclient');}
  if(url.pathname.startsWith('/api/'))requests.push({path:url.pathname,page:pages.indexOf(request.frame().page()),method:request.method(),body:request.postDataJSON(),headers:request.headers()});return route.continue();
 });
 try{
  const a=await createPage('A current FILTERS'),b=await createPage('B saved definition');
  for(const [page,ids] of [[a,idsA],[b,idsB]]){const data=success(await perform(page,()=>page.goto(origin+'/ai-cohort.html?ids='+ids.join(',')),'/api/ra/ai/cohort'));assert.equal(data.n,8);assert.equal(data.studyTotal,14);await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','success');}
  await act(a,()=>a.locator('#compare-current-a').click());await act(b,()=>b.locator('#save-cohort').click());await act(b,()=>b.locator('#private-name').fill(savedName));await act(b,()=>b.locator('#private-note').fill(savedNote));
  const saved=success(await perform(b,()=>b.locator('#private-save').click(),'/api/ra/cohort/save'));savedId=saved.cohortId;savedVersion=saved.version;assert.match(savedId,uuid);assert.equal(savedVersion,1);await expect(b.locator('#private-save-state')).toHaveAttribute('data-state','success');await expect(b.locator('#private-list-state')).toHaveAttribute('data-state','success');
  const listed=success(await perform(a,()=>a.locator('#private-list-load').click(),'/api/ra/cohort/list'));assert.equal(listed.total,1);assert.equal(listed.items.length,1);assert.equal(listed.items[0].cohortId,savedId);assert.equal(listed.items[0].version,savedVersion);assert.deepEqual(listed.items[0].filters,filters(idsB));
  await act(a,()=>a.locator(`[data-compare-side="b"][data-compare-cohort="${savedId}"]`).click());await expect(a.locator('#compare-start')).toBeEnabled();
  const created=await createComparison(a,false);firstId=created.compareResultId;
  const retainedResult=await perform(a,()=>a.locator('#compare-read').click(),'/api/ra/ai/compareResult'),retained=success(retainedResult);assert.deepEqual(retainedResult.body,{compareResultId:firstId});assert.equal(retained.compareResultId,firstId);assert.deepEqual(retained.rows,created.rows);assert.deepEqual(retained.a,created.a);assert.deepEqual(retained.b,created.b);assert.equal(retained.meta.computedAt,created.meta.computedAt);assert.equal(retained.meta.expiresAt,created.meta.expiresAt);await currentComparison(a,retained);
  const requestsBeforeOpen=requests.length;await act(a,()=>a.locator('#compare-export').click());await expect(a.locator('#export-dialog')).toBeVisible();assert.deepEqual(await a.locator('#export-fields input').evaluateAll(inputs=>inputs.map(input=>input.value)),directory);assert.equal(requests.length,requestsBeforeOpen);
  const rejection=await perform(a,()=>a.locator('#export-default').click(),'/api/ra/export/xlsx');assert.equal(rejection.status,409);assert.equal(rejection.json.success,false);assert.equal(rejection.json.code,'NEED_APPLY');assert.deepEqual(rejection.body,{source:'COMPARE',compareResultId:firstId});
  const decision=rejection.json.data;exactKeys(decision,['decision','source','referenceId','selectionMode','requested','eligible','blocked','freeStart','today','policyVersion'],'full ten-field NEED_APPLY');
  assert.equal(decision.decision,'NEED_APPLY');assert.equal(decision.source,'COMPARE');assert.equal(decision.referenceId,firstId);assert.equal(decision.selectionMode,'DEFAULT');assert.deepEqual(decision.requested,directory);assert.deepEqual(decision.eligible,metrics);assert.equal(decision.freeStart,'2026-04-01');assert.equal(decision.today,'2026-10-07');assert.equal(decision.policyVersion,'dev-export-v01');
  assert.deepEqual(decision.blocked,[['age','MISSING_SOURCE_DATE',8,8],['duration','MISSING_SOURCE_DATE',8,8],['female','MISSING_SOURCE_DATE',8,8],['sero','INCOMPLETE_SOURCE_EVIDENCE',6,7],['complete','INCOMPLETE_SOURCE_EVIDENCE',8,8],['line','INCOMPLETE_SOURCE_EVIDENCE',7,7]].flatMap(([field,reason,a,b])=>[{field,side:'A',reason,affectedN:a},{field,side:'B',reason,affectedN:b}]));
  await expect(a.locator('#export-state')).toHaveAttribute('data-state','need-apply');assert.ok((await a.locator('#export-decision').innerText()).includes(JSON.stringify(decision,null,2)));
  const requestCount=requests.length;await act(a,()=>a.locator('#export-eligible').click());await expect(a.locator('#export-fields input:checked')).toHaveCount(6);assert.equal(requests.length,requestCount);await act(a,()=>a.locator('#export-cancel').click());await expect(a.locator('#export-dialog')).toBeHidden();assert.equal(requests.length,requestCount);assert.equal(downloads.length,0);assert.equal(exportRequests().length,1);
  await act(a,()=>a.locator('#compare-export').click());for(const metric of metrics)await act(a,()=>a.locator(`#export-fields input[value="${metric}"]`).check());assert.equal(requests.length,requestCount);
  await downloadFile(a,'comparison-download.xlsx',firstId,8);comparisonObserved=await inspect('comparison-download.xlsx',firstId,false);
  await act(a,()=>a.locator('#compare-exclude').check());assert.equal(await a.evaluate(()=>window.RACohortComparison.getResource()),null);assert.equal(comparisonRequests().length,1);
  const newComparison=await createComparison(a,true);excludedId=newComparison.compareResultId;assert.notEqual(excludedId,firstId);
  await act(a,()=>a.locator('#compare-export').click());for(const metric of metrics)await act(a,()=>a.locator(`#export-fields input[value="${metric}"]`).check());await downloadFile(a,'excluded-comparison-download.xlsx',excludedId,6);excludedObserved=await inspect('excluded-comparison-download.xlsx',excludedId,true);
  await writeFile(owner.dir+'/workbook-observation.json',JSON.stringify({comparison:comparisonObserved,excluded:excludedObserved},null,2)+'\n');
  assert.equal(downloads.length,2);assert.equal(exportRequests().length,3);assert.equal(comparisonRequests().length,2);assert.equal(requests.filter(request=>request.path==='/api/ra/ai/compareResult').length,1);assert.equal(requests.filter(request=>request.path==='/api/ra/cohort/open').length,0);
  assert.ok(requests.every(request=>request.method==='POST'&&request.headers.authorization===undefined&&request.headers['x-doctor-id']===undefined));assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
  proof.compareResultId=firstId;proof.excludedCompareResultId=excludedId;proof.savedDefinition={cohortId:savedId,version:savedVersion};proof.viewports=pages.map(page=>page.viewportSize());proof.tabSelection='bringToFront before every corresponding page action';
  owner.report.http.push(...responses.map(({response,...value})=>({...value,port})));
 }catch(error){owner.fail(error.message);throw error;}
 finally{
  await writeFile(owner.dir+'/browser-observation.json',JSON.stringify({scenario:'cohort:browser-export-comparison',requests,responses,downloads,errors,blocked,audit,proof,dom:await pages[0]?.locator('main').innerText().catch(()=>null)},null,2)+'\n');
  await writeFile(owner.dir+'/network.json',JSON.stringify({requests,responses,proof},null,2)+'\n');await Promise.allSettled(pages.map(page=>page.close()));
 }
}
