const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=p=>fs.readFileSync(path.join(root,p),'utf8');
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
const patient=(id='9007199254740993')=>({patientId:id,name:'合成患者',comorbidities:[],followStatus:'soon',followStatusLabel:'近期需随访'});
const list=(extra={})=>({items:[],total:0,totalPatients:0,incompleteCount:0,page:1,size:8,...extra});
function patients(){
 const nodes=new Map(),requests=[],navigation={href:''};
 const node=s=>{if(!nodes.has(s)){let html='',text='';const n={value:'',hidden:false,disabled:false,checked:false,indeterminate:false,events:{},addEventListener(k,fn){this.events[k]=fn},querySelector:()=>node('#empty-title'),querySelectorAll:()=>[]};Object.defineProperties(n,{innerHTML:{get:()=>html,set:v=>{html=String(v);text=html.replace(/<[^>]*>/g,'')}},textContent:{get:()=>text,set:v=>{text=String(v);html=text}}});nodes.set(s,n)}return nodes.get(s)};
 const context=vm.createContext({URL,URLSearchParams,Set,API_BASE:'',console:{error(){}},location:navigation,queryParam:()=>null,shell(){},loadListState:(_key,d)=>d,saveListState(){},$:node,currentDoctorId:()=>101,apiPost(url,body){let resolve;const promise=new Promise(yes=>{resolve=yes});requests.push({url,body,resolve});return promise},escapeHTML:x=>String(x??''),badge:x=>`<b>${x}</b>`,cycleLabel:()=>'',icon:()=>'',COMORBIDITY_INFO:{},alert(){},openComorbidity(){}});
 vm.runInContext(source('js/pages/patients.js'),context,{filename:'patients.js'});
 return {node,requests,navigation,async answer(index,data){requests[index].resolve(data);await flush()},async event(selector,type,target){node(selector).events[type]({preventDefault(){},target});await flush()}};
}
function chat(){
 const nodes=new Map(),requests=[],events=new Map();
 const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',value:'',dataset:{},href:'',hidden:false,disabled:false,checked:false,events:{},addEventListener(k,fn){this.events[k]=fn},focus(){}});return nodes.get(s)};
 const context=vm.createContext({window:{addEventListener(k,fn){events.set(k,fn)}},document:{querySelector:node,referrer:''},URL,URLSearchParams,AbortController,structuredClone,location:new URL('http://fixture.invalid/ai-chat.html'),history:{length:1},currentUser:()=>({name:'合成医生',id:'101'}),setTimeout:()=>1,clearTimeout(){}});
 context.window.RACohortAPI={chat(command){requests.push(command);return new Promise(()=>{})}};
 for(const file of ['js/shared/user-display.js','js/pages/ai-cohort-conditions.js','js/pages/ai-chat-entry.js','js/pages/ai-chat.js'])vm.runInContext(source(file),context,{filename:file});
 return {node,requests};
}
test('patient:summary-plain-counter',async()=>{
 const p=patients();await p.answer(0,list({totalPatients:7,incompleteCount:3}));
 assert.match(p.node('#patient-summary').innerHTML,/<button type="button" class="summary-link" id="show-incomplete"[^>]*>3<\/button>/);
 const html=source('patients.html');assert.match(html,/css\/pages\/patients\.css\?v=\d+/);
 const rule=source('css/pages/patients.css').match(/\.summary-link\s*\{([^}]+)\}/)[1];
 assert.match(rule,/text-decoration\s*:\s*none\s*;/,'计数按钮的已链接样式须去掉下划线；此为源码样式合同，非浏览器computed-style结果');
 assert.match(source('css/common.css'),/button:focus-visible,[\s\S]*?outline:3px solid #8ebaff/,'保留键盘焦点轮廓');
 await p.event('#patient-summary','click',{closest:s=>s==='#show-incomplete'?{}:null});
 assert.deepEqual({...p.requests[1].body},{doctorId:101,page:1,size:8,completeness:'missing'});
 assert.equal(p.node('#data-status').value,'missing');assert.equal(p.node('#query').value,'');assert.equal(p.node('#visit-status').value,'');
});
test('patient:list-response-shape',async()=>{
 const invalid=[{},null,[],{items:[]},list({items:null}),list({items:{}}),list({total:'0'}),list({total:-1}),list({page:0}),list({page:1.5}),list({size:0}),list({size:201}),list({totalPatients:-1}),list({incompleteCount:'0'})];
 for(const field of ['items','total','totalPatients','incompleteCount','page','size']){const data=list();delete data[field];invalid.push(data)}
 for(const data of invalid){const p=patients();await p.answer(0,data);assert.equal(p.node('#empty').hidden,false);assert.match(p.node('#empty-title').textContent,/患者列表加载失败/,'成功信封内缺少现有VO必要结构必须报错');assert.doesNotMatch(p.node('#empty-title').textContent,/未找到匹配患者/);assert.equal(p.node('#patient-summary').innerHTML,'');assert.equal(p.requests.length,1,'坏结构不得引起自动翻页请求')}
 const zero=patients();await zero.answer(0,list());assert.equal(zero.node('#empty-title').textContent,'暂无患者');assert.equal(zero.node('#result-count').textContent,'共 0 条匹配记录');assert.match(zero.node('#patient-summary').innerHTML,/共 0 位患者已建档/);
 const filteredZero=patients();await filteredZero.answer(0,list({items:[patient()],total:1,totalPatients:7,incompleteCount:3}));filteredZero.node('#query').value='合成未命中';await filteredZero.event('#search-form','submit',{});await filteredZero.answer(1,list({totalPatients:7,incompleteCount:3}));assert.equal(filteredZero.node('#empty-title').textContent,'没有符合条件的患者：关键字「合成未命中」。可修改条件或点「重置」查看全部');assert.equal(filteredZero.requests.length,2,'空结果不得自行扩大查询条件');
 const normal=patients();await normal.answer(0,list({items:[patient()],total:9,totalPatients:10,incompleteCount:4,page:2}));assert.match(normal.node('#result-count').textContent,/显示第 9–9 条，共 9 条/);assert.equal(normal.node('#empty').hidden,true);assert.match(normal.node('#patients').innerHTML,/9007199254740993/);
 const last=patients();await last.answer(0,list({total:1,totalPatients:1,page:3}));assert.equal(last.requests[1].body.page,1,'合法越界页仍回到最后一页');await last.answer(1,list({items:[patient()],total:1,totalPatients:1}));assert.match(last.node('#result-count').textContent,/显示第 1–1 条，共 1 条/);
});
test('patient:analysis-selection-guidance',async()=>{
 const html=source('patients.html');assert.match(html,/<(?:span|p)[^>]*id="ai-selection-hint"[^>]*>未勾选患者时进入 AI 智能分析首页；勾选患者后对这些患者做队列分析<\/(?:span|p)>/,'未选患者时入口行为须作为可见文本，不能只放title');
 assert.match(html,/id="ai-analysis"[^>]*aria-describedby="ai-selection-hint"/);
 const p=patients();await p.answer(0,list({items:[patient()],total:1,totalPatients:1}));assert.equal(p.node('#ai-analysis').disabled,false);assert.equal(p.node('#ai-selection-hint').hidden,false);p.node('#ai-analysis').onclick();assert.equal(p.navigation.href,'ai-analysis.html','未勾选患者时进入分析首页');assert.equal(p.requests.length,1,'进入分析首页不自动发起AI请求');
 await p.event('#patients','change',{matches:s=>s==='.patient-check',checked:true,value:'9007199254740993'});assert.equal(p.node('#ai-analysis').disabled,false);assert.equal(p.node('#ai-selection-hint').hidden,true);assert.match(p.node('#ai-analysis').textContent,/已选 1 人/);
 assert.equal(p.requests.length,1,'勾选不得自动发起AI请求');p.node('#ai-analysis').onclick();assert.equal(p.navigation.href,'ai-cohort.html?ids=9007199254740993');
 await p.event('#patients','change',{matches:s=>s==='.patient-check',checked:false,value:'9007199254740993'});assert.equal(p.node('#ai-analysis').disabled,false);assert.equal(p.node('#ai-selection-hint').hidden,false);
 p.node('#ai-analysis').onclick();assert.equal(p.navigation.href,'ai-analysis.html','取消全部勾选后仍可进入分析首页');assert.equal(p.requests.length,1,'导航不得自动发起分析请求');
});
test('patient:management-query-characterization',async()=>{
 for(const [choice,followStatus] of Object.entries({ongoing:'active',due:'soon',overdue:'overdue',none:'pending_first',lost:'withdrawn'})){
  const p=patients();await p.answer(0,list());p.node('#query').value=' 合成%原词 ';p.node('#visit-status').value=choice;p.node('#data-status').value='missing';
  assert.equal(p.requests.length,1,'修改控件本身不自动请求');await p.event('#search-form','submit',{});
  assert.deepEqual({...p.requests[1].body},{doctorId:101,page:1,size:8,keyword:'合成%原词',followStatus,completeness:'missing'});
  p.node('#reset').onclick();await flush();assert.deepEqual({...p.requests[2].body},{doctorId:101,page:1,size:8});
 }
});
test('chat:scope-change-guidance',async()=>{
 const p=chat();assert.equal(p.requests.length,0);p.node('#scope-all').events.change();
 assert.equal(p.node('#chat-state').textContent,'已切换分析范围，请输入问题或选择下方推荐问题。');assert.equal(p.requests.length,0,'切换范围后必须零AI请求');
 const q='当前范围的达标率是多少？';p.node('#suggest').events.click({target:{closest:()=>({dataset:{q}})}});assert.equal(p.node('#chat-input').value,q);assert.equal(p.requests.length,0,'推荐问题只填入输入框');
 p.node('#chat-form').events.submit({preventDefault(){}});await flush();assert.equal(p.requests.length,1,'显式提交才请求AI');assert.equal(p.requests[0].question,q);assert.equal(p.requests[0].scope.kind,'ALL');
});
