const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const ID='9007199254740993',VISIT='9007199254741003';
const detail=(id=ID)=>({patientId:id,name:'SYNTHETIC-ODD',studyNo:'RA-ODD',hasCardNo:true,cardNoMasked:'SYNTHETIC-MASKED',visits:[{visitId:VISIT,doctorId:'101',visitDate:'2026-10-01',visitType:'基线访视'}],comorbidities:[],visitCount:1,followUpCount:0,followStatus:'active',followStatusLabel:'随访中',diagnosisInformed:1,consentSigned:1,acrEularScore:7});
// 手写合法旧 DTO；独立于生产 renderer，保留详情/编辑七模块、新增六模块。
const visit=()=>({patientId:ID,visitId:VISIT,doctorId:'101',visitDate:'2026-10-01',visitType:'基线访视',filledCount:7,modules:[
 {key:'history',title:'病史病情',column:'bsbq',filled:true,record:'SYNTHETIC-HISTORY',recordDate:'2026-10-01',groups:[],tables:[],images:[]},
 {key:'exam',title:'辅助检查',column:'fzjc',filled:true,groups:[{title:'炎症指标',items:[{label:'CRP',value:'12.50',unit:'mg/L',notChecked:false}]}],tables:[],images:[]},
 {key:'assessment',title:'病情评估',column:'bqpg',filled:true,groups:[{title:'HAQ 健康评估问卷',items:[{label:'能自己梳头吗',value:'稍有困难'}]}],tables:[],images:[]},
 {key:'tcm',title:'中医诊断',column:'zyzd',filled:true,groups:[{title:'证型',items:[{label:'主证',value:'风寒湿痹证'}]}],tables:[],images:[{title:'舌面',urls:['img/record.svg']}]},
 {key:'treatment',title:'治疗方案',column:'zlfa',filled:true,groups:[],tables:[{title:'西药',columns:['药品名称','剂量'],rows:[['SYNTHETIC-DRUG','5 mg']]}],images:[]},
 {key:'adverse',title:'不良反应',column:'blsj',filled:true,groups:[{title:'',items:[{label:'不良反应',value:'无'}]}],tables:[],images:[]},
 {key:'adverseEvent',title:'不良事件',column:'bblsj',filled:true,record:'SYNTHETIC-ADVERSE-EVENT',groups:[],tables:[],images:[]}
]});
const form=(create=false)=>({patientId:ID,visitId:create?null:VISIT,visitNo:create?2:null,visitType:create?'常规随访':'基线访视',visitDate:'2026-10-01',version:'synthetic-version',optionSets:{},modules:[
 {key:'history',title:'病史病情',column:'bsbq',editable:true,groups:[{title:'病程',fields:[{key:'followDate',label:'随访时间',type:'date',value:'2026-10-01'}]}],tables:[],images:[],others:[]},
 {key:'exam',title:'辅助检查',column:'fzjc',editable:true,groups:[{title:'炎症指标',fields:[{key:'cfydb',label:'CRP',type:'number',value:'12.50',unit:'mg/L',wx:false}]}],tables:[],images:[],others:[]},
 {key:'assessment',title:'病情评估',column:'bqpg',editable:true,groups:[{title:'HAQ 健康评估问卷',fields:[{key:'q2',label:'能自己梳头吗',type:'haq',value:'稍有困难'}]}],tables:[],images:[],others:[]},
 {key:'tcm',title:'中医诊断',column:'zyzd',editable:true,groups:[{title:'证型',fields:[{key:'zz',label:'主证',type:'radio',value:'风寒湿痹证',options:['风寒湿痹证','湿热痹阻证']}]}],tables:[],images:[{title:'舌面',urls:['img/record.svg']}],others:[]},
 {key:'treatment',title:'治疗方案',column:'zlfa',editable:true,groups:[],tables:[{key:'xyList',title:'西药',columns:[{key:'drugName',label:'药品名称',type:'text'},{key:'dosis',label:'剂量',type:'text'}],rows:[{_row:0,drugName:'SYNTHETIC-DRUG',dosis:'5 mg'}]}],images:[],others:[{label:'SYNTHETIC-UNKNOWN-FIELD',value:'SYNTHETIC-PRESERVED'}]},
 {key:'adverse',title:'不良反应',column:'blsj',editable:true,groups:[{title:'',fields:[{key:'event',label:'不良反应',type:'radio',value:'无',options:['无','有']}]}],tables:[],images:[],others:[]},
 ...(create?[]:[{key:'adverseEvent',title:'不良事件',column:'bblsj',editable:false,record:'SYNTHETIC-ADVERSE-EVENT',groups:[],tables:[],images:[],others:[]}])
]});
async function flush(){for(let i=0;i<35;i++)await Promise.resolve();}
function harness(page='patient-visits',query=`?id=${ID}${['visit-detail','visit-edit'].includes(page)?'&visit='+VISIT:''}`){
 const html=fs.readFileSync(path.join(root,page+'.html'),'utf8');
 const staticIds=new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1])),attachedIds=new Set(),removedIds=new Set();
 const auditMarkup=html.match(/<details\b[^>]*\bid="audit"[^>]*>[\s\S]*?<\/details>/)?.[0]||'';
 const nodes=new Map(),requests=[],events=new Map(),docEvents=new Map(),timers=new Map(),navigation=[],alerts=[];let now=0,seq=0;
 const node=selector=>{const auditId=selector==='.audit-list'?'audit-list':selector==='.audit-count'?'audit-count':null;const s=auditId&&staticIds.has(auditId)?'#'+auditId:selector;if(!nodes.has(s)){const listeners=new Map();nodes.set(s,{id:s.startsWith('#')?s.slice(1):'',innerHTML:'',textContent:'',value:'2026-10-01',hidden:false,open:false,disabled:false,attributes:{},style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},setAttribute(k,v){this.attributes[k]=String(v)},getAttribute(k){return this.attributes[k]},removeAttribute(k){delete this.attributes[k];delete this[k]},querySelector:q=>{if(s==='#audit'&&['.audit-list','.audit-count'].includes(q)&&!new RegExp('\\bclass="[^"]*\\b'+q.slice(1)+'\\b').test(auditMarkup))return null;return q.startsWith('#')?querySelector(q):q.startsWith('.identity-')?identityNode(q):node(q)},querySelectorAll:()=>[],addEventListener(t,f){if(!listeners.has(t))listeners.set(t,[]);listeners.get(t).push(f)},removeEventListener(t,f){listeners.set(t,(listeners.get(t)||[]).filter(x=>x!==f))},dispatchEvent(e){for(const f of listeners.get(e.type)||[])f(e);if(e.type==='click'&&this.onclick)this.onclick(e);return true},remove(){attachedIds.delete(this.id);removedIds.add(this.id);for(const [key,value] of nodes)if(value===this)nodes.delete(key)},close(){this.open=false},showModal(){this.open=true},appendChild(){},insertBefore(){},scrollIntoView(){}})}return nodes.get(s)};
 // 身份证行查询必须由实际 renderer 提供标记，不能凭空创造错误/重试控件。
 function identityNode(selector){
  const name=selector.slice(1),markup=[...nodes.values()].map(n=>n.innerHTML).join('');
  const tag=[...markup.matchAll(/<[^>]+\bclass="[^"]*"[^>]*>/g)].map(m=>m[0]).find(t=>new RegExp('class="[^"]*\\b'+name+'\\b').test(t));
  if(!tag)return null;
  const n=node(selector);if(!n.markupInitialized){for(const m of tag.matchAll(/([\w-]+)="([^"]*)"/g))n.setAttribute(m[1],m[2]);n.hidden=/\shidden(?:[\s>]|=)/.test(tag);n.markupInitialized=true;}return n;
 }
 // ID 查询依据真实 HTML；已渲染内容和实际附加的对话框可提供新增 ID。
 const querySelector=selector=>{if(selector.startsWith('#')){const id=selector.slice(1);if((!staticIds.has(id)||removedIds.has(id))&&!attachedIds.has(id)&&![...nodes.values()].some(n=>new RegExp('\\sid=[\"\']'+id+'[\"\']').test(n.innerHTML)))return null;}return ['.sidebar','.account'].includes(selector)?null:node(selector)};
 const local=new Map([['ra-auth',JSON.stringify({doctorId:'101',name:'Synthetic',role:'研究者'})]]),session=new Map();const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
 const location=new URL('http://fixture.invalid/'+page+'.html'+query);location.replace=x=>navigation.push(x);location.assign=x=>navigation.push(x);location.reload=()=>navigation.push('reload');
 const add=(m,t,f)=>{if(!m.has(t))m.set(t,[]);m.get(t).push(f)};
 const context={URL,URLSearchParams,AbortController,Date,console:{error(){}},location,history:{length:1,back(){navigation.push('back')}},localStorage:storage(local),sessionStorage:storage(session),performance:{getEntriesByType:()=>[]},Event:class{constructor(type){this.type=type}preventDefault(){}},CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},document:{referrer:'',title:'',querySelector,querySelectorAll:()=>[],getElementById:id=>querySelector('#'+id),createElement:t=>node('created-'+t),body:{appendChild(n){attachedIds.add(n.id);removedIds.delete(n.id);nodes.set('#'+n.id,n)}},documentElement:{scrollHeight:0},addEventListener:(t,f)=>add(docEvents,t,f)},innerHeight:1000,scrollY:0,scrollTo(){},alert:x=>alerts.push(x),confirm:()=>false,setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,at:now+ms});return id},clearTimeout(id){timers.delete(id)},addEventListener:(t,f)=>add(events,t,f),removeEventListener(t,f){events.set(t,(events.get(t)||[]).filter(x=>x!==f))},dispatchEvent(e){for(const f of events.get(e.type)||[])f(e);return true},fetch(url,options={}){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});requests.push({url,options,resolve,reject});return promise}};
 context.window=context;vm.createContext(context);
 const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].map(m=>m[1].split('?')[0]);
 for(const file of scripts)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 return {context,nodes,node,requests,timers,scripts,navigation,alerts,async event(t,value={}){for(const f of events.get(t)||[])f(value);await flush()},async domReady(){for(const f of docEvents.get('DOMContentLoaded')||[])f({});await flush()},async advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn()}await flush()},async answer(i,data,status=200,code='200',extra={}){requests[i].resolve({ok:status>=200&&status<300,status,headers:{get:k=>k.toLowerCase()==='content-type'?'application/json':k.toLowerCase()==='x-trace-id'?'synthetic-trace':null},json:async()=>({success:status===200,code,message:'synthetic-response',data}),...extra});await flush()},eval:s=>vm.runInContext(s,context),async submit(){node(page==='visit-edit'?'#edit-form':'#create-form').dispatchEvent({type:'submit',preventDefault(){}});await flush()}};
}
module.exports={ID,VISIT,detail,visit,form,flush,harness};
