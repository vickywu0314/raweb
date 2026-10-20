/* 只用合成后端；不把 Node 静态装配通过当作浏览器几何通过。 */
const {test,expect}=require('@playwright/test');
const {writeFile}=require('node:fs/promises');
const {installAuthBootstrap}=require('../fixtures/auth-bootstrap.cjs');
const {insightFixture}=require('./patient-insight-fixture.cjs');
const walkthroughInsight=()=>{const d=insightFixture();d.visits[0].metrics.gh.value=null;return d;};
test('screenshots:layout-states',async({page,context,browser})=>{
 const origin=process.env.RA_STATIC_URL,errors=[],blocked=[],requests=[],geometry=[];
 const auth=await installAuthBootstrap(context,{origin});
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){blocked.push(url.origin);return route.abort('blockedbyclient');}
  if(await auth.handle(route))return;
  if(!url.pathname.startsWith('/api/'))return route.continue();
  requests.push({path:url.pathname,body:request.postDataJSON()});
  if(url.pathname==='/api/ra/ai/patientInsight')return route.fulfill({status:200,contentType:'application/json',headers:{'X-Trace-Id':'insight-trace'},body:JSON.stringify({success:true,code:'200',message:'',data:walkthroughInsight()})});
  if(url.pathname==='/api/ra/ai/chat')return route.fulfill({status:503,contentType:'application/json',headers:{'X-Trace-Id':'synthetic-private-trace'},body:JSON.stringify({success:false,code:'CHAT_DISABLED',message:'RAW_PRIVATE_SERVICE_SENTINEL',data:null})});
  return route.abort('blockedbyclient');
 });
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   await page.setViewportSize(viewport);
   await page.goto(origin+'/patient-insight.html?id=9007199254740993');
   await expect(page.locator('#insight-state')).toHaveAttribute('data-state','success');
   await page.locator('#journey details').evaluateAll(list=>list.forEach(d=>{d.open=true;}));
   const size=await page.locator('#journey .insight-record').first().evaluate(article=>{
    const date=article.querySelector('time'),range=document.createRange();range.selectNodeContents(date);const dateLines=range.getClientRects().length;const content=article.querySelector('.journey-content'),wrap=article.querySelector('.insight-table-wrap'),link=content.querySelector('a'),box=element=>{const r=element.getBoundingClientRect();return {width:r.width,height:r.height};};
    return {date:date.textContent,dateLines,article:box(article),content:box(content),link:box(link),lineHeight:parseFloat(getComputedStyle(link).lineHeight),wrapWidth:wrap.clientWidth,tableWidth:wrap.scrollWidth,pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
   });
   geometry.push({viewport,...size});expect(size.date).toBe('2026-01-01');expect(size.dateLines).toBe(1);
   expect(size.content.width).toBeGreaterThan(size.article.width*.6);
   expect(size.link.width).toBeGreaterThan(100);
   expect(size.link.height).toBeLessThan(size.lineHeight*2.2);
   expect(size.pageWidth).toBeLessThanOrEqual(size.viewportWidth+1);
   if(viewport.width<700)expect(size.tableWidth).toBeGreaterThan(size.wrapWidth);
   await expect(page.locator('#journey')).toContainText('4.11');const gh=page.locator('#journey tr').filter({has:page.locator('td', {hasText:/^GH$/})});await expect(gh.locator('td').nth(1)).toHaveText('未知');await expect(gh.locator('td').nth(2)).toHaveText('量表范围 0–100');await expect(page.locator('#journey')).toContainText('量表范围 0–3');const pain=page.locator('#journey tr').filter({has:page.locator('td', {hasText:/^疼痛$/})});expect((await pain.innerText()).match(/量表(?:尚)?未核实/g)).toHaveLength(1);
   await expect(page.locator('#journey')).toContainText('历史记录尚未核实');
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/ai-chat.html#kind=PATIENT&patientId=9007199254740993');
  await expect(page.locator('#chat-state')).toHaveAttribute('data-state','idle');
  await expect(page.locator('#suggest')).toContainText('患者全程有哪些实测记录');
  await expect(page.locator('#suggest')).not.toContainText('达标率');
  const nav=await page.locator('.sidebar .nav-item').evaluateAll(items=>items.map(item=>({top:item.getBoundingClientRect().top,height:item.getBoundingClientRect().height,background:getComputedStyle(item).backgroundColor})));
  expect(nav).toHaveLength(3);expect(nav[2].top-nav[0].top).toBeLessThan(120);expect(nav[2].background).not.toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('.sidebar [aria-current="page"]')).toHaveText('研究数据对话');
  await expect(page.locator('.chat-main')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await page.locator('#suggest button').first().click();
  expect(requests.filter(request=>request.path==='/api/ra/ai/chat')).toHaveLength(0);
  await page.locator('#chat-send').click();await expect(page.locator('#chat-state')).toHaveText('研究问答尚未启用，请联系管理员');
  await expect(page.locator('#chat-log')).not.toContainText('RAW_PRIVATE_SERVICE_SENTINEL');
  await expect(page.locator('#chat-log')).not.toContainText('synthetic-private-trace');
  expect(requests.at(-1).body.scope).toEqual({kind:'PATIENT',patientId:'9007199254740993',visitId:null});
  expect(errors).toEqual([]);expect(blocked).toEqual([]);
 }finally{
  await writeFile(`${process.env.RA_RUN_DIR}/screenshot-repair-observation.json`,JSON.stringify({scenario:'screenshots:layout-states',version:browser.version(),geometry,requests,errors,blocked},null,2)+'\n');
 }
});
