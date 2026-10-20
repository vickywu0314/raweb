/* 截图回归：字面合同与静态装配；几何行为由同名 browser case 单独证明。 */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=p=>fs.readFileSync(path.join(root,p),'utf8');
function page(hash=''){
 const nodes=new Map(),events=new Map(),pending=[];
 const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',value:'',dataset:{},href:'',hidden:false,disabled:false,checked:false,events:{},addEventListener(k,fn){this.events[k]=fn;},focus(){}});return nodes.get(s);};
 node('#suggest').innerHTML=source('ai-chat.html').match(/id="suggest">(.*?)<\/div>/s)[1];
 const context=vm.createContext({window:{addEventListener(k,fn){events.set(k,fn);}},document:{querySelector:node,referrer:''},URL,URLSearchParams,AbortController,Response,structuredClone,location:new URL('http://fixture.invalid/ai-chat.html'+hash),history:{length:1},currentUser:()=>({name:'合成医生',doctorId:'101'}),fetch(...args){pending.push(args);return new Promise(()=>{});},setTimeout:()=>1,clearTimeout(){}});
 vm.runInContext(source('js/shared/user-display.js'),context);
 for(const file of ['ai-cohort-conditions.js','ai-chat-entry.js','ai-cohort-api.js','ai-chat.js'])vm.runInContext(source('js/pages/'+file),context);
 return {context,node,pending};
}
test('screenshots:repair-contract',async t=>{
 await t.test('病程内容占可伸缩列，指标表有自己的窄屏滚动容器',()=>{
  const css=source('css/pages/patient-insight.css'),js=source('js/pages/patient-insight.js');
  assert.match(js,/<article class="insight-record"><time>/);
  assert.match(js,/<div class="journey-content"><strong>/);
  assert.match(js,/<div class="insight-table-wrap"><table>/);
  assert.match(css,/\.insight-record\s*\{[^}]*grid-template-columns:\s*88px\s+minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(css,/grid-template-columns:\s*(?:66px|52px)\s+18px\s+1fr/);
  assert.match(css,/\.journey-content\s*\{[^}]*min-width:\s*0/);
  assert.match(css,/\.insight-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
 });
 await t.test('导出申请按钮、人数说明、外置搜索提示与比较表可达性装配',()=>{
  const cohort=source('ai-cohort.html'),home=source('ai-analysis.html');
  assert.match(cohort,/受影响人数是整个受阻聚合的有效人数，人数不可跨原因相加/);assert.doesNotMatch(cohort,/affectedN/);
  for(const id of ['export-default','export-confirm','export-eligible','application-open','export-cancel','application-submit','application-dismiss','application-replay','application-retry-notification','application-cancel']){const button=cohort.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>'))?.[0];assert.ok(button,id);assert.match(button,/class="[^"]*\bbutton\b/);}
  assert.match(source('css/common.css'),/\.button:disabled\s*\{[^}]*cursor:not-allowed/);
  assert.match(cohort,/id="compare-table-scroll"[^>]*tabindex="0"[^>]*aria-describedby="compare-scroll-hint"/);assert.match(source('css/pages/ai-cohort.css'),/\.statistics-table-wrap\s*\{[^}]*overflow-x:auto/);assert.match(source('css/pages/ai-cohort.css'),/#compare-table\{[^}]*min-width:900px/);
  assert.match(home,/placeholder="输入姓名、ID号或研究编号选择患者" aria-describedby="patient-search-hint"/);assert.match(home,/<p id="patient-search-hint">输入时显示本人 RA 患者候选，最多 8 位。<\/p>/);
 });
 await t.test('聊天共用导航语义和皮肤，保持零演示脚本',()=>{
  const html=source('ai-chat.html'),css=source('css/pages/ai-chat.css');
  assert.match(html,/css\/shared\/ai-analytics\.css\?v=/);
  assert.match(html,/<nav aria-label="主导航">/);
  // 与其它页面同一份侧栏：「AI 智能分析」为当前项
  assert.match(html,/class="nav-item active"[^>]*data-nav="ai"[^>]*href="ai-analysis\.html"[^>]*aria-current="page"/);
  assert.doesNotMatch(html,/js\/(?:data|common)\.js/);
  assert.doesNotMatch(css,/\.sidebar nav\s*\{/);
 });
 await t.test('推荐问题随整个库、完整队列、患者全程和本次范围更新且不自动请求',()=>{
  const all=page();assert.equal(all.node('#scope-subtitle').textContent,'每次根据当前本人 RA 研究库的实际记录，回答数据查询、统计与变化问题。');assert.match(all.node('#suggest').innerHTML,/疾病活动分布/);
  const course=page('#kind=PATIENT&patientId=9007199254740993');assert.match(course.node('#scope-subtitle').textContent,/当前患者全程/);
  assert.match(course.node('#suggest').innerHTML,/患者全程.*实测/);assert.match(course.node('#suggest').innerHTML,/治疗记录/);assert.doesNotMatch(course.node('#suggest').innerHTML,/达标率|活动分布|成对/);
  const visit=page('#kind=PATIENT&patientId=9007199254740993&visitId=9007199254741003');
  assert.match(visit.node('#scope-subtitle').textContent,/当前患者本次访视/);assert.match(visit.node('#suggest').innerHTML,/本次访视.*实测/);assert.match(visit.node('#suggest').innerHTML,/本次访视.*用药/);assert.doesNotMatch(visit.node('#suggest').innerHTML,/达标率|活动分布|患者全程/);
  visit.node('#patient-course').events.click();assert.match(visit.node('#suggest').innerHTML,/患者全程.*实测/);
  visit.node('#patient-visit').events.click();assert.match(visit.node('#suggest').innerHTML,/本次访视.*实测/);
  visit.node('#scope-all').events.change();assert.match(visit.node('#suggest').innerHTML,/疾病活动分布/);
  const encoded=vm.runInContext('window.RACohortChatEntry.encode({kind:"COHORT",filters:window.RACohortChatEntry.normalize({})})',all.context);
  const cohort=page(encoded);assert.match(cohort.node('#scope-subtitle').textContent,/完整当前队列/);assert.match(cohort.node('#suggest').innerHTML,/疾病活动分布/);
  for(const h of [all,course,visit,cohort])assert.equal(h.pending.length,0);
 });
 await t.test('服务拒绝、配置、大小、繁忙、超时与模型失败有固定安全文案',()=>{
  const display=require('../../js/shared/user-display.js');
  const cases=[
   [503,'CHAT_DISABLED','研究问答尚未启用，请联系管理员'],
   [403,'CHAT_OUTBOUND_NOT_APPROVED','当前范围尚未获准使用研究问答，请联系管理员'],
   [503,'AI_CONFIG_UNAVAILABLE','智能服务配置暂不可用，请联系管理员'],
   [413,'CONTEXT_TOO_LARGE','本轮数据超出问答上限，请缩小范围或切换本次访视'],
   [429,'AI_BUSY','智能服务繁忙，请稍后重试'],
   [504,'AI_TIMEOUT','智能服务等待超时，请重试'],
   [502,'AI_HTTP_ERROR','智能服务暂不可用，请稍后重试'],
   [503,'AI_IO_ERROR','智能服务连接中断，请重试'],
   [502,'AI_INVALID_RESPONSE','智能服务返回的结果无法使用，请重试']
  ];
  for(const [status,code,message] of cases){const text=display.error({status,code,message:'SECRET_PROMPT <script> credential',traceId:'private-trace'},'请求失败');assert.equal(text,message);assert.doesNotMatch(text,/SECRET|script|credential|private-trace|AI_|CHAT_/);}
  assert.equal(display.error({status:401,code:'CHAT_OUTBOUND_NOT_APPROVED'}),'登录已失效，请重新登录');
  assert.equal(display.error({status:403,code:'FORBIDDEN'}),'当前账号没有此操作权限');
  assert.equal(display.error({status:404,code:'NOT_FOUND'}),'所需记录不存在或当前账号无法访问');
  assert.equal(display.error({status:500,code:'UNKNOWN',message:'SECRET'},'请求失败'),'请求失败');
 });
});
