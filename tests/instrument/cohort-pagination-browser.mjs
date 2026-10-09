import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const firstIds=['1','2','3','4','5','6','7','8','9','10'];
const middleIds=['11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'];
const lastIds=['31','32','33','34','35','36','9223372036854775807'];
export async function paginationBrowser(context,port,identity,owner,probe,pid,id,fixture) {
  const origin=`http://127.0.0.1:${port}`,requests=[],responses=[],reads=[],allowed=[],blocked=[],pageErrors=[];let tamper=false;
  await context.addInitScript(()=>sessionStorage.setItem('ra-auth',JSON.stringify({name:'合成页面用户',role:'研究者',expires:0})));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(owner.controller.signal.aborted||url.origin!==origin){blocked.push(request.url());await route.abort('blockedbyclient');return;}
    allowed.push(request.url());
    if(url.pathname.startsWith('/api/')){
      const input=request.postDataJSON(),record={url:request.url(),method:request.method(),headers:request.headers(),body:input};requests.push(record);
      if(tamper&&url.pathname.endsWith('/cohortPatients')){
        tamper=false;const original=input.cursor,index=original.indexOf('.')+1;assert.ok(index>0);const cursor=original.slice(0,index)+(original[index]==='A'?'B':'A')+original.slice(index+1);
        assert.equal([...original].filter((char,i)=>char!==cursor[i]).length,1);record.originalCursor=original;record.wireBody={...input,cursor};await route.continue({postData:JSON.stringify(record.wireBody)});return;
      }
    }
    await route.continue();
  });
  const page=await context.newPage();owner.event('page-created',{pid,port});page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))reads.push((async()=>responses.push({status:response.status(),trace:response.headers()['x-trace-id'],json:await response.json()}))());});
  const rows=()=>page.locator('#patient-rows [data-patient-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.patientId));
  const perform=async(action,path,status=200)=>{const awaited=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/ra/ai/${path}`&&response.request().method()==='POST');await action();const response=await awaited;assert.equal(response.status(),status);return (await response.json()).data;};
  const open=query=>perform(()=>page.goto(`${origin}/ai-cohort.html${query}`,{waitUntil:'load'}),'cohort');
  const more=()=>perform(()=>page.locator('#more').click(),'cohortPatients');
  const analyze=()=>perform(()=>page.locator('#question-form button[type="submit"]').click(),'cohort');
  const counts=async(n,total)=>{await expect(page.locator('#cohort-n')).toHaveText(String(n));await expect(page.locator('#study-total')).toHaveText(String(total));await expect(page.locator('#cohort-state')).toHaveAttribute('data-state',n===0?'empty':'success');};
  const cleared=async(code,state)=>{await expect(page.locator('#cohort-state')).toHaveAttribute('data-state',state);await expect(page.locator('#error-message')).toContainText(code);await expect(page.locator('#patient-rows .ai-row')).toHaveCount(0);await expect(page.locator('#cohort-n')).toHaveText('—');await expect(page.locator('#more')).toBeHidden();await expect(page.locator('#no-result')).toBeHidden();await expect(page.locator('#export')).toBeDisabled();assert.equal(await page.locator('#results').getAttribute('data-analysis-id'),null);};
  const noRetry=async(count)=>{assert.equal(requests.length,count);await page.locator('#more').evaluate(button=>button.click());assert.equal(requests.length,count);};
  try {
    if(id==='cohort:browser-pagination'){
      const original=await open('?act=target');await counts(37,37);assert.deepEqual(await rows(),firstIds);assert.ok(original.patients.items.every(patient=>patient.das28At===1));
      await owner.mysqlQuery("UPDATE ra_synthetic_test.patient_follow_up_history SET bqpg='{\"result\":{\"crpScore\":4.5}}' WHERE id=1011 AND patient_basic_info_id=11; UPDATE ra_synthetic_test.patient_basic_info SET name='合成新名11' WHERE id=11");
      assert.equal((await owner.mysqlQuery("SELECT name FROM ra_synthetic_test.patient_basic_info WHERE id=11")).trim(),'合成新名11');
      const middle=await more();assert.equal(middle.analysisId,original.analysisId);assert.deepEqual(middle.patients.items.map(patient=>patient.patientId),middleIds);assert.equal(middle.patients.returnedCount,20);assert.equal(middle.patients.items[0].das28At,1);assert.equal(middle.patients.items[0].name,'合成新名11');assert.equal(middle.patients.total,37);await counts(37,37);await expect(page.locator('[data-patient-id="11"]')).toContainText('合成新名11');
      assert.equal(requests.at(-1).body.cursor,original.patients.nextCursor);assert.equal(requests.at(-1).body.analysisId,original.analysisId);
      const last=await more();assert.deepEqual(last.patients.items.map(patient=>patient.patientId),lastIds);assert.equal(last.patients.returnedCount,7);assert.equal(last.patients.hasMore,false);assert.equal(last.patients.nextCursor,null);assert.equal(requests.at(-1).body.cursor,middle.patients.nextCursor);
      await expect(page.locator('#patient-rows .ai-row')).toHaveCount(37);assert.deepEqual(await rows(),[...firstIds,...middleIds,...lastIds]);assert.equal(new Set(await rows()).size,37);await expect(page.locator('#more')).toBeHidden();
      const changed=await analyze();await counts(36,37);assert.notEqual(changed.analysisId,original.analysisId);assert.equal(requests.at(-1).body.filters.act,'target');assert.equal(new URL(page.url()).searchParams.get('act'),'target');await more();await more();await expect(page.locator('#patient-rows .ai-row')).toHaveCount(36);assert.deepEqual(await rows(),[...firstIds,...middleIds.slice(1),...lastIds]);assert.ok(!(await rows()).includes('11'));
    }else if(id==='cohort:browser-ids'){
      await open('');await counts(37,37);assert.equal(Object.hasOwn(requests.at(-1).body.filters,'ids'),false);
      const empty=await open('?ids=');await counts(0,37);assert.deepEqual(empty.patients.items,[]);assert.deepEqual(requests.at(-1).body.filters.ids,[]);assert.equal(new URL(page.url()).search,'?ids=');
      await open('?ids=9223372036854775807,999');await counts(1,37);assert.deepEqual(await rows(),['9223372036854775807']);assert.deepEqual(requests.at(-1).body.filters.ids,['9223372036854775807','999']);
      for(const query of ['?ids=01','?ids=9223372036854775808']){const count=requests.length;await page.goto(`${origin}/ai-cohort.html${query}`,{waitUntil:'load'});await expect(page.locator('#cohort-state')).toHaveAttribute('data-state','error');assert.equal(requests.length,count);}
      const original=await open('');await counts(37,37);await owner.control(fixture,'IDENTITY_202');
      const observations=fixture.events.filter(event=>event.type==='http-observation'),before=observations.at(-1).borrowed,count=requests.length;
      await perform(()=>page.locator('#more').click(),'cohortPatients',404);await cleared('RESOURCE_NOT_FOUND','error');await noRetry(count+1);assert.deepEqual(requests.at(-1).body,{analysisId:original.analysisId,cursor:original.patients.nextCursor});
      await expect.poll(()=>fixture.events.filter(event=>event.type==='http-observation').length).toBe(observations.length+1);assert.equal(fixture.events.filter(event=>event.type==='http-observation').at(-1).borrowed,before);
      const other=await analyze();await counts(1,1);assert.notEqual(other.analysisId,original.analysisId);assert.deepEqual(await rows(),['9223372036854775807']);
    }else{
      let original=await open('');await counts(37,37);tamper=true;let count=requests.length;
      await perform(()=>page.locator('#more').click(),'cohortPatients',400);await cleared('CURSOR_INVALID','error');await noRetry(count+1);assert.equal(requests.at(-1).body.cursor,original.patients.nextCursor);assert.notEqual(requests.at(-1).wireBody.cursor,original.patients.nextCursor);
      original=await analyze();await counts(37,37);await owner.mysqlQuery('DELETE FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=36');assert.equal((await owner.mysqlQuery('SELECT COUNT(*) FROM ra_synthetic_test.patient_relation_doctor WHERE doctor_id=101 AND patient_id=36')).trim(),'0');count=requests.length;
      await perform(()=>page.locator('#more').click(),'cohortPatients',409);await cleared('SCOPE_CHANGED','scope-changed');await noRetry(count+1);
      const current=await analyze();await counts(36,36);assert.notEqual(current.analysisId,original.analysisId);await owner.control(fixture,'ADVANCE_TTL');count=requests.length;
      const observations=fixture.events.filter(event=>event.type==='http-observation'),before=observations.at(-1).borrowed;
      await perform(()=>page.locator('#more').click(),'cohortPatients',410);await cleared('ANALYSIS_EXPIRED','expired');await noRetry(count+1);await expect.poll(()=>fixture.events.filter(event=>event.type==='http-observation').length).toBe(observations.length+1);assert.equal(fixture.events.filter(event=>event.type==='http-observation').at(-1).borrowed,before);
    }
    await Promise.all(reads);assert.deepEqual(blocked,[]);assert.deepEqual(pageErrors,[]);assert.ok(requests.every(request=>request.method==='POST'&&request.headers['content-type']==='application/json;charset=UTF-8'&&!request.headers['x-doctor-id']&&!request.headers.authorization));assert.ok(responses.every(response=>response.trace));await expect(page.locator('#clinical-panels')).toBeHidden();
    owner.report.http.push(...responses.map(response=>({...response,port,via:'page'})));
    await writeFile(`${owner.dir}/browser-observation.json`,JSON.stringify({scenario:id,pid,identity,version:context.browser().version(),url:page.url(),requests,responses,dom:await page.locator('main').innerText(),allowed,blocked,pageErrors},null,2)+'\n');
  }catch(error){owner.fail(error.message);throw error;}finally{await writeFile(`${owner.dir}/network.json`,JSON.stringify({requests,responses,allowed,blocked,pageErrors},null,2)+'\n');await page.close();}
}
