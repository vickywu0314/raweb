const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const pageSource=fs.readFileSync(path.join(__dirname,'../../js/pages/ai-cohort.js'),'utf8');
function productionFunction(name){const start=pageSource.indexOf('function '+name+'(');assert.ok(start>=0,name);const line=pageSource.slice(start,pageSource.indexOf('\n',start));return line.endsWith('}')?line:pageSource.slice(start,pageSource.indexOf('\n}',start)+2);}
function productionListener(selector,type){const start=pageSource.indexOf(`$('${selector}').addEventListener('${type}',`);assert.ok(start>=0,selector);const line=pageSource.slice(start,pageSource.indexOf('\n',start));return line.endsWith('});')?line:pageSource.slice(start,pageSource.indexOf('\n});',start)+5);}
class Element{constructor(){this.children=[];this.dataset={};this.style={setProperty(){}};this.listeners={};this.own='';}set textContent(value){this.own=String(value);this.children=[];}get textContent(){return this.own+this.children.map(child=>child.textContent).join('');}append(...children){this.children.push(...children);}replaceChildren(...children){this.own='';this.children=children;}setAttribute(key,value){this[key]=value;}addEventListener(type,handler){this.listeners[type]=handler;}}
function environment(){const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};const state={ui:require('../../js/shared/user-display.js'),URLSearchParams,Date,structuredClone,document:{createElement:()=>new Element()},$:get,disposed:false,checkIdentity:()=>false,applicationFlight:null,applicationDraft:{decision:{selectionMode:'EXPLICIT'}},exportReferenceCurrent:()=>true,window:{},clearTimeout(){}};vm.createContext(state);return{state,get,elements};}
function find(root,predicate){if(predicate(root))return root;for(const child of root.children){const found=find(child,predicate);if(found)return found;}}
function scenarioLiteral(file,pattern){const source=fs.readFileSync(path.join(__dirname,file),'utf8'),match=source.match(pattern);assert.ok(match,file+' independent browser oracle must exist');return match[1];}
test('display:browser-copy-oracles',()=>{
 const {state:c,get}=environment();let sends=0,prevented=0,aborts=0;
 c.sendApplication=()=>sends++;c.endExport=()=>{};c.endParse=()=>{};c.clearPrivate=()=>{};
 vm.runInContext(['applicationState','applicationDate','applicationReason','comparisonState','clearComparisonResult','endComparison','state','showError','textNode','clinicalText','crpText','sourceBlock','patientSources','patientLongId','appendPatients'].map(productionFunction).join('\n'),c);
 vm.runInContext(productionListener('#application-form','submit'),c);
 const validation='请填写有效日期、用途及1～1000个字符的申请说明。';
 assert.equal(scenarioLiteral('cohort-application.spec.cjs',/for\(const \[id,value\][^\n]+?#application-state'\)\)\.toHaveText\('([^']+)'\)/),validation);
 for(const delta of [{start:'2026-10-08'},{start:'0999-01-01'},{reason:'   '},{reason:'😀'.repeat(1001)},{reason:String.fromCharCode(0xd800)}]){
  const input={start:'2026-01-01',end:'2026-10-07',purpose:'RESEARCH',reason:'普通研究说明',...delta};for(const[key,value]of Object.entries(input))get('#application-'+key).value=value;
  get('#application-form').listeners.submit({preventDefault(){prevented++;}});assert.equal(get('#application-state').dataset.state,'error');assert.equal(get('#application-state').textContent,validation);assert.equal(sends,0,'invalid local input must never issue an application command');
 }
 assert.equal(prevented,5);assert.equal(c.applicationReason('😀'.repeat(1000)).length,2000,'1000 Unicode characters remain supported');assert.equal(c.ui.error({code:'INVALID_REQUEST'}),'输入内容不符合要求，请检查后重试','remote INVALID_REQUEST remains a distinct error contract');
 c.comparisonGeneration=0;c.comparisonResource={compareResultId:'old'};c.comparisonFlight={kind:'compare',controller:{abort(){aborts++;}},timer:null,terminal:null};
 vm.runInContext(productionListener('#compare-cancel','click'),c);get('#compare-cancel').listeners.click();
 const cancelled='已取消等待，结果尚未确认，不能确定是否已提交；重新比较会生成一条新结果。';assert.equal(get('#compare-state').textContent,cancelled);assert.equal(c.comparisonFlight,null);assert.equal(c.comparisonResource,null);assert.equal(get('#compare-result').hidden,true);assert.equal(get('#compare-cancel').hidden,true);assert.equal(aborts,1);
 assert.equal(scenarioLiteral('cohort-comparison.spec.cjs',/if\(terminal==='cancel'\)[^\n]*?#compare-state'\)\)\.toHaveText\('([^']+)'\)/),cancelled);
 const fixtures=require('../fixtures/cohort-p02.json');c.CLINICAL=fixtures.CLINICAL;c.U=fixtures.U;c.B='22222222-2222-2222-2222-222222222222';
 const privateSpec=fs.readFileSync(path.join(__dirname,'cohort-private.spec.cjs'),'utf8');vm.runInContext(privateSpec.slice(privateSpec.indexOf(' const second=',privateSpec.indexOf("test('cohort:private-pending-isolation'")),privateSpec.indexOf(' second.metricMeta.ageMedian=',privateSpec.indexOf("test('cohort:private-pending-isolation'")))+'\nglobalThis.pendingSecond=second;',c);
 assert.equal(c.pendingSecond.patients.items[0].scoreProvenance.missingReason,'NO_VALID_CRP','fixed pending B fixture must retain its missing-CRP fact');c.appendPatients(c.pendingSecond.patients.items,c.pendingSecond.meta);const pending=get('#patient-rows').children[0],score=find(pending,n=>n.className==='patient-score-source');assert.ok(score.textContent.includes('资料来源：未提供说明'));assert.ok(score.textContent.includes('来源项目：未提供'));assert.ok(score.textContent.includes('缺失原因：缺少有效 CRP 记录'));assert.ok(!score.textContent.includes('B-source'));assert.ok(!score.textContent.includes('来源项目：其他资料'));
 const clinicalSpec=fs.readFileSync(path.join(__dirname,'cohort-clinical.spec.cjs'),'utf8');vm.runInContext(clinicalSpec.slice(clinicalSpec.indexOf('  const six='),clinicalSpec.indexOf('  data=six;'))+'\n'+clinicalSpec.slice(clinicalSpec.indexOf('  const configured='),clinicalSpec.indexOf('  await refresh(configured);'))+'\nglobalThis.configuredFixture=configured;',c);const sources=c.patientSources(c.configuredFixture.patients.items[0],c.configuredFixture.meta),fm=find(sources,n=>n.dataset.clinicalSource==='fm');
 assert.ok(fm.textContent.includes('来源记录'),'legitimate observation section must remain visible');assert.ok(!fm.textContent.includes('来源记录：'),'configured evidence has no legacy sourceRowId field');for(const text of ['资料来源：已核定的纤维肌痛依据','资料质量：来源尚未核实','来源依据：已记录，可按记录日期核对','记录日期：2026-10-06','纤维肌痛状态：否'])assert.ok(fm.textContent.includes(text),text);assert.ok(!fm.textContent.includes('synthetic:fm1'));assert.ok(!sources.textContent.includes('RAW_FORBIDDEN_SENTINEL'));assert.match(clinicalSpec,/expect\(configuredFm\)\.not\.toContainText\('来源记录：'\)/);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js/pages/ai-cohort-conditions.js'),'utf8'),c);
 const unsupported='此链接中的条件暂不支持，请清空条件后重新分析';assert.equal(scenarioLiteral('cohort-firstscreen.spec.cjs',/#error-message'\)\)\.toHaveText\('([^']+)'\);expect\(observed.requests.length\)\.toBe\(before\)/),unsupported);
 for(const query of ['?similar=9','?foo=']){let error;try{c.window.RACohortConditions.decodeEntry(query);}catch(e){error=e;}assert.ok(error);assert.equal(error.code,'ENTRY_NOT_READY');error.message='RAW_INTERNAL_DETAIL_SENTINEL';c.showError(error);assert.equal(get('#error-message').textContent,unsupported);assert.equal(get('#error-trace').textContent,'');}
 assert.equal(c.ui.error({code:'INVALID_ENTRY'}),'分析入口无效，请返回重新选择患者或筛选条件');assert.equal(sends,0);
});
