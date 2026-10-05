/* visit-edit.html 页面脚本（依赖 boot.js → data.js → common.js）
   编辑已有随访：基本信息只读；随访日期和 7 个病历模块可改。
   数据：POST /api/ra/patient/patientDetail（基本信息）、POST /api/ra/visit/visitEditForm（表单）、POST /api/ra/visit/updateVisit（保存，JSON）。
   后端只写有变化的字段并保持老系统数据结构；关节数、DAS28、HAQ 得分保存时由后端按老系统算法自动计算。 */
"use strict";
shell('patients');
const patientId=queryParam('id'), visitId=queryParam('visit');
const detailUrl=withFrom(`visit-detail.html?id=${encodeURIComponent(patientId||'')}&visit=${encodeURIComponent(visitId||'')}`);
const visitsUrl=withFrom(`patient-visits.html?id=${encodeURIComponent(patientId||'')}`);
const HAQ=['无困难','稍有困难','很困难','不能进行'];
let form=null, p=null, dirty=false, saving=false;
$('#crumb-visits').href=visitsUrl;$('#crumb-detail').href=detailUrl;$('#cancel-edit').href=detailUrl;bindBack($('#back-detail'),detailUrl);

const val=x=>escapeHTML(x==null||x===''?'未提供':x);
const listText=v=>Array.isArray(v)?v.join('、'):(v||'');
const showError=msg=>{const e=$('#edit-error');e.hidden=!msg;e.innerHTML=msg||''};

function fieldHTML(col,f){
 const attrs=`data-col="${col}" data-key="${escapeHTML(f.key)}" data-type="${f.type}" data-orig="${escapeHTML(JSON.stringify(f.value??null))}"`;
 const unit=f.unit?`<small class="field-unit">${escapeHTML(f.unit)}</small>`:'';
 const wx=f.wx==null?'':`<label class="wx-check"><input type="checkbox" class="wx-input" data-col="${col}" data-key="${escapeHTML(f.key)}" ${f.wx?'checked':''}> 未查</label>`;
 let control;
 if(f.type==='wxonly')control='';
 else if(f.type==='computed'||f.type==='readonly')control=`<input value="${escapeHTML(f.value??'')}" readonly class="computed-input" placeholder="${f.type==='computed'?'保存时自动计算':'—'}" title="${f.type==='computed'?'由系统按老系统算法自动计算':'只读'}">`;
 else if(f.type==='haq'){const opts=f.value&&!HAQ.includes(f.value)?[...HAQ,f.value]:HAQ;control=`<select ${attrs} class="edit-input"><option value="">未填写</option>${opts.map(o=>`<option${o===f.value?' selected':''}>${escapeHTML(o)}</option>`).join('')}</select>`}
 else if(f.type==='date'&&isPlainDate(f.value))control=`<input type="date" ${attrs} class="edit-input" value="${escapeHTML(f.value||'')}">`;
 else if(f.type==='list')control=`<input ${attrs} class="edit-input" value="${escapeHTML(listText(f.value))}" placeholder="多个用「、」分隔">`;
 else if(f.type==='number')control=`<input ${attrs} class="edit-input" inputmode="decimal" value="${escapeHTML(f.value||'')}">`;
 else if(String(f.value||'').includes('\n'))control=`<textarea ${attrs} class="edit-input" rows="${Math.min(6,String(f.value).split('\n').length+1)}">${escapeHTML(f.value)}</textarea>`;
 else control=`<input ${attrs} class="edit-input" value="${escapeHTML(f.value||'')}">`;
 const wide=f.type==='list'&&String(listText(f.value)).length>24||f.key.startsWith('q')&&f.type==='haq';
 return `<div class="form-field${wide?' span-3':''}${f.type==='computed'?' is-computed':''}"><span>${escapeHTML(f.label)}${unit}${f.type==='computed'?'<em class="auto-tag">自动计算</em>':''}</span>${control}${wx}</div>`;
}
// 日期选择框只能显示 yyyy-MM-dd；老数据里其它写法（如 2018-1-1、带时间）用文本框，避免看起来被清空
const isPlainDate=v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v);
function cellHTML(c,v){
 const attrs=`class="table-input" data-key="${escapeHTML(c.key)}" data-type="${c.type}" data-orig="${escapeHTML(JSON.stringify(v??null))}"`;
 if(c.type!=='list'&&String(v||'').includes('\n'))return `<textarea ${attrs} rows="3">${escapeHTML(v)}</textarea>`;
 return `<input ${attrs} ${c.type==='date'&&isPlainDate(v)?'type="date"':''} value="${escapeHTML(c.type==='list'?listText(v):(v??''))}"${c.type==='list'?' placeholder="多个用「、」分隔"':''}>`;
}
function rowHTML(col,t,r){
 return `<tr data-row="${r&&r._row!=null?r._row:''}">${t.columns.map(c=>`<td>${cellHTML(c,r?.[c.key])}</td>`).join('')}<td><button type="button" class="button compact row-del" title="删除这一行">删除</button></td></tr>`;
}
function moduleHTML(m,i){
 let body='';
 if(!m.editable){
  body=`<p class="module-readonly-note">该模块存的是非结构化文字，暂不支持在此修改：</p><div class="visit-record">${escapeHTML(m.record||'')}</div>`;
 }else{
  body+=m.groups.filter(g=>g.fields.length).map(g=>`<div class="subgroup">${g.title?`<h3>${escapeHTML(g.title)}</h3>`:''}<div class="form-grid">${g.fields.map(f=>fieldHTML(m.column,f)).join('')}</div></div>`).join('');
  body+=m.tables.map(t=>`<div class="subgroup edit-table-group" data-col="${m.column}" data-table="${escapeHTML(t.key)}"><h3>${escapeHTML(t.title)}</h3><div class="visit-table-wrap"><table class="visit-table edit-table"><thead><tr>${t.columns.map(c=>`<th>${escapeHTML(c.label)}</th>`).join('')}<th></th></tr></thead><tbody>${t.rows.map(r=>rowHTML(m.column,t,r)).join('')}</tbody></table></div><button type="button" class="button compact row-add">＋ 添加一行</button></div>`).join('');
  body+=(m.images||[]).map(g=>`<div class="subgroup"><h3>${escapeHTML(g.title)} <small class="table-count">${g.urls.length} 张 · 只读</small></h3><div class="visit-images">${g.urls.map(u=>`<a href="${escapeHTML(u)}" target="_blank" rel="noopener"><img src="${escapeHTML(u)}" alt="" loading="lazy"></a>`).join('')}</div></div>`).join('');
  if(m.others&&m.others.length)body+=`<div class="subgroup"><h3>其他字段 <small class="table-count">只读 · 保存时原样保留</small></h3><div class="detail-fields">${m.others.map(o=>`<div class="detail-field"><span>${escapeHTML(o.label)}</span><strong>${escapeHTML(o.value)}</strong></div>`).join('')}</div></div>`;
  if(!body)body='<p class="module-empty">本模块暂无可编辑字段</p>';
 }
 return `<details class="create-section" id="mod-${m.key}"${i===0?' open':''}><summary class="create-section-head"><h2>${escapeHTML(m.title)}</h2><span>${m.editable?'可修改':'只读'}</span><span class="section-toggle" aria-hidden="true"></span></summary><div class="create-section-body">${body}</div></details>`;
}

function render(){
 document.title=`${p.name} · 编辑随访 · 患者数据研究平台`;
 $('#visit-title').textContent=`编辑随访 · ${p.name}`;
 $('#visit-sub').textContent=`研究编号 ${p.studyNo||'—'} · ${form.visitType} ${form.visitDate||''} · 保存后会写入该患者的修改记录`;
 $('#edit-profile').href=`patient-edit.html?id=${encodeURIComponent(p.patientId)}&back=visit`;
 const birth=p.birthYear==null?'未知':`${p.birthYear} 年（${p.age} 岁）`;
 $('#basic-readonly').innerHTML=[['患者姓名',p.name],['性别',p.sex],['出生年份',birth],['民族',p.nation],['婚史',p.marryLabel],['患者手机号',p.mobile],['患者身份证号',p.cardNoMasked],['研究编号',p.studyNo],['ID号',p.patientId],['随访周期',cycleLabel(p.followCycle)],['随访观察起始',p.followStartDate]].map(([k,v])=>`<div><span>${k}</span><b>${val(v)}</b></div>`).join('');
 $('#visit-date').value=form.visitDate||'';$('#visit-date').max=ymd(TODAY);
 $('#visit-type').textContent=`${form.visitType}（时间最早的一次随访为基线访视）`;
 $('#edit-sections').innerHTML=form.modules.map(moduleHTML).join('');
 $('#save-edit').disabled=false;
}

// 收集表单：只有可编辑模块；后端会和数据库比对，只写有变化的字段
// 多选只按「、」或换行分隔（选项文字本身可能带逗号，如「疼痛遇寒加重，得热通减」）
const splitList=s=>String(s||'').split(/[、\n]/).map(x=>x.trim()).filter(Boolean);
// 输入框的值：没动过就原样传回原值（保证不改任何格式），动过才按类型转换
function inputValue(el){
 let orig=null;try{orig=JSON.parse(el.dataset.orig||'null')}catch(e){}
 const t=el.dataset.type, shown=t==='list'?listText(orig):(orig??'');
 if(el.value===String(shown))return orig??(t==='list'?[]:'');
 return t==='list'?splitList(el.value):el.value.trim();
}
function collect(){
 const modules={};
 const mod=col=>modules[col]=modules[col]||{fields:{},wx:{},tables:{}};
 document.querySelectorAll('.edit-input').forEach(el=>{mod(el.dataset.col).fields[el.dataset.key]=inputValue(el)});
 document.querySelectorAll('.wx-input').forEach(el=>{mod(el.dataset.col).wx[el.dataset.key]=el.checked});
 document.querySelectorAll('.edit-table-group').forEach(g=>{
  mod(g.dataset.col).tables[g.dataset.table]=[...g.querySelectorAll('tbody tr')].map(tr=>{const r={};if(tr.dataset.row!=='')r._row=+tr.dataset.row;tr.querySelectorAll('.table-input').forEach(i=>r[i.dataset.key]=inputValue(i));return r});
 });
 return {doctorId:currentDoctorId(),visitId:form.visitId,version:form.version,visitDate:$('#visit-date').value,modules};
}

$('#edit-sections').addEventListener('click',e=>{
 const add=e.target.closest('.row-add'),del=e.target.closest('.row-del');
 if(add){const g=add.closest('.edit-table-group'),m=form.modules.find(x=>x.column===g.dataset.col),t=m.tables.find(x=>x.key===g.dataset.table);g.querySelector('tbody').insertAdjacentHTML('beforeend',rowHTML(m.column,t,null));g.querySelector('tbody tr:last-child input')?.focus();dirty=true}
 if(del){const tr=del.closest('tr'),name=tr.querySelector('input')?.value||'这一行';if(confirm(`删除「${name}」？保存后生效。`)){tr.remove();dirty=true}}
});
$('#edit-form').addEventListener('input',()=>dirty=true);
$('#edit-form').addEventListener('change',()=>dirty=true);
window.addEventListener('beforeunload',e=>{if(dirty&&!saving){e.preventDefault();e.returnValue=''}});

$('#edit-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!form)return;
 const d=$('#visit-date').value;
 if(!d){showError('请填写随访日期');return}
 if(d>ymd(TODAY)){showError('随访日期不能晚于今天');return}
 const btn=$('#save-edit');btn.disabled=true;btn.textContent='保存中…';showError('');saving=true;
 try{
  const r=await apiPostJson('/api/ra/visit/updateVisit',collect());
  dirty=false;
  if(!r.changedCount){toast('没有修改内容');btn.disabled=false;btn.textContent='保存修改';saving=false;return}
  toast(`已保存 ${r.changedCount} 项修改`);
  setTimeout(()=>location.replace(detailUrl),900);
 }catch(ex){
  saving=false;btn.disabled=false;btn.textContent='保存修改';
  showError(/已被修改/.test(ex.message)?`${escapeHTML(ex.message)} <button type="button" class="button compact" onclick="location.reload()">刷新</button>`:`保存失败：${escapeHTML(ex.message)}`);
  window.scrollTo({top:0,behavior:'smooth'});
 }
});
function toast(msg){const old=document.querySelector('.save-toast');if(old)old.remove();const t=document.createElement('div');t.className='save-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}

async function load(){
 if(!patientId||!visitId){showError('缺少患者 ID 或随访 ID');return}
 try{
  const params={doctorId:currentDoctorId()};
  [p,form]=await Promise.all([apiPost('/api/ra/patient/patientDetail',{...params,patientId}),apiPost('/api/ra/visit/visitEditForm',{...params,visitId})]);
  if(String(form.patientId)!==String(p.patientId)){showError('这条随访记录不属于该患者');return}
  render();
 }catch(ex){console.error(ex);showError(`编辑表单加载失败：${escapeHTML(ex.message)}。请确认后端服务已启动（${escapeHTML(API_BASE)}）。`)}
}
load();
