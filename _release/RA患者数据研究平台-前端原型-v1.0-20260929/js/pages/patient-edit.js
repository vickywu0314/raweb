/* patient-edit.html 页面脚本（依赖 boot.js → data.js → common.js）：编辑患者基本信息与随访周期，逐项写入修改记录 */
"use strict";
document.addEventListener('DOMContentLoaded',()=>{
  shell('patients');
  const p=patientById(queryParam('id')), pid=encodeURIComponent(p.id);
  const fromVisit=queryParam('back')==='visit';
  const back=fromVisit?`visit-create.html?id=${pid}`:`patient-visits.html?id=${pid}`;
  document.querySelectorAll('.js-back').forEach(a=>a.href=back);
  if(fromVisit)document.querySelector('.back-link').textContent='← 返回新增随访';
  document.getElementById('edit-title').textContent=`编辑患者档案 · ${p.name}`;
  document.title=`${p.name} · 编辑档案 · 患者数据研究平台`;

  const form=document.getElementById('edit-form');
  const LABELS={name:'患者姓名',phone:'手机号',identityNo:'身份证号',code:'研究编号',ethnicity:'民族',sex:'性别',year:'出生年份',maritalStatus:'婚史',height:'身高',weight:'体重',followStart:'随访观察起始',followCycle:'随访周期'};
  const initial=Object.fromEntries(Object.keys(LABELS).map(k=>[k,p[k]==null?'':String(p[k])]));
  if(!initial.followStart)initial.followStart=p.last||'';
  form.elements.id.value=p.id;
  Object.entries(initial).forEach(([k,v])=>{if(k==='sex'){const r=form.querySelector(`[name="sex"][value="${v}"]`);if(r)r.checked=true;return;}const el=form.elements[k];if(el)el.value=v;});
  const read=()=>Object.fromEntries(Object.keys(LABELS).map(k=>[k,k==='sex'?(form.querySelector('[name="sex"]:checked')?.value||''):String(form.elements[k].value).trim()]));
  const changes=()=>{const now=read();return Object.keys(LABELS).filter(k=>now[k]!==initial[k]).map(k=>({k,from:initial[k],to:now[k]}))};
  const fmtVal=(k,v)=>!v?'空':k==='followCycle'?cycleLabel(+v):v;
  const refresh=()=>{
    const ch=changes();
    form.querySelectorAll('.form-field').forEach(f=>f.classList.remove('is-changed'));
    ch.forEach(c=>form.querySelector(`[name="${c.k}"]`)?.closest('.form-field')?.classList.add('is-changed'));
    document.getElementById('change-hint').textContent=ch.length?`已修改 ${ch.length} 项：${ch.map(c=>LABELS[c.k]).join('、')}`:'未修改';
    const n=nextFollowup({...p,followCycle:+form.elements.followCycle.value});
    document.getElementById('next-preview').textContent=n?`${n.due}（${cycleLabel(n.cycle)}，${n.days<0?`已逾期 ${-n.days} 天`:`${n.days} 天后`}）`:'无随访记录或已脱落，暂不推算';
  };
  form.addEventListener('input',refresh);form.addEventListener('change',refresh);refresh();

  form.addEventListener('submit',e=>{
    e.preventDefault(); if(!form.reportValidity())return;
    const ch=changes(); if(!ch.length){location.href=back;return;}
    const fields=Object.fromEntries(ch.map(c=>[c.k,['year','followCycle','height','weight'].includes(c.k)&&c.to!==''?+c.to:c.to]));
    patchPatient(p.id,fields);
    audit(p.id,'修改档案',ch.map(c=>`${LABELS[c.k]}：${fmtVal(c.k,c.from)} → ${fmtVal(c.k,c.to)}`).join('；'));
    const t=document.createElement('div');t.className='save-toast';t.textContent=`已保存 ${ch.length} 项修改`;document.body.appendChild(t);
    setTimeout(()=>location.href=back,1000);
  });
});
