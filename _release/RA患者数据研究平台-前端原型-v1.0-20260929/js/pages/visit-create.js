/* visit-create.html 页面脚本（依赖 boot.js → data.js → common.js → shared/case-form.js）
   两种模式：新增随访（?id=）；编辑已有随访（?id=&visit=，由访视详情页「编辑本次随访」进入） */
"use strict";
document.addEventListener('DOMContentLoaded',()=>{
  shell('patients');
  const p=patientById(queryParam('id')), pid=encodeURIComponent(p.id);
  const editId=queryParam('visit'), v=editId?demoVisits(p).find(x=>x.id===editId):null, editing=!!v;
  const nth=(p.visits||0)+1;
  const back=editing?`visit-detail.html?id=${pid}&visit=${v.id}`:`patient-visits.html?id=${pid}`;
  document.title=`${p.name} · ${editing?'编辑随访':'新增随访'} · 患者数据研究平台`;
  document.querySelectorAll('.js-back-visits').forEach(a=>a.href=`patient-visits.html?id=${pid}`);
  const backLink=document.querySelector('.back-link.js-back-visits');
  if(editing){backLink.textContent='← 返回访视详情';backLink.href=back;document.querySelector('.breadcrumb').lastChild.textContent=' 编辑随访';}
  document.getElementById('visit-title').textContent=`${editing?'编辑随访':'新增随访'} · ${p.name}`;
  document.getElementById('visit-sub').textContent=editing
    ?`研究编号 ${p.code} · ${v.type} ${v.date} · 修改后保存，系统会在该患者的修改记录中留痕。`
    :`研究编号 ${p.code} · 第 ${nth} 次随访 · 基本信息沿用患者档案，仅录入本次随访内容；未完成内容可暂存后补。`;
  document.getElementById('edit-profile').href=`patient-edit.html?id=${pid}&back=visit`;

  // 基本信息：只读展示（身份证号、手机号脱敏）
  const mask=(val,keep)=>val?val.slice(0,keep)+'****'+val.slice(-4):'未提供';
  const rows=[['患者姓名',p.name],['性别',p.sex],['出生年份',`${p.year} 年`],['民族',p.ethnicity],['婚史',p.maritalStatus],
    ['患者手机号',mask(p.phone,3)],['患者身份证号',mask(p.identityNo,6)],['研究编号',p.code],['ID号',p.id],['随访周期',cycleLabel(p.followCycle)],['随访观察起始',p.followStart||p.last||'未提供'],['身高 / 体重','未提供']];
  document.getElementById('basic-readonly').innerHTML=rows.map(([k,val])=>`<div><span>${k}</span><b>${escapeHTML(val||'未提供')}</b></div>`).join('');

  const form=document.querySelector('#create-form');
  const defaults=serializeSections(form);
  const vd=document.querySelector('[name="visitDate"]');
  if(editing){restoreSections(form,visitForm(p.id,v.id));if(vd&&!vd.value)vd.value=v.date;}
  else if(vd&&!vd.value) vd.value=ymd(new Date());
  const before=serializeSections(form);

  document.getElementById('basic').open=false;
  const first=document.getElementById('history'); if(first) first.open=true;
  if(editing) document.querySelector('.create-footer .button.primary').textContent='保存修改';

  initCaseForm({
    draftMsg:'随访草稿已暂存（前端演示）',
    onSubmit(form){
      const data=serializeSections(form), date=data['history:visitDate']||ymd(new Date()), summary=(data['case:0']||'').trim();
      if(editing){
        const changed=diffCount(before,data);
        store.visitEdits[p.id]=store.visitEdits[p.id]||{};
        store.visitEdits[p.id][v.id]={form:data,meta:{date,entries:describeEntries(form,defaults,data),...(summary?{summary}:{})}};
        const own=(store.visits[p.id]||[]).find(x=>x.id===v.id); if(own){own.form=data;own.date=date;own.entries=describeEntries(form,defaults,data);if(summary)own.summary=summary;}
        saveStore(); audit(p.id,'编辑随访',`${v.type} ${v.date}${date!==v.date?` → ${date}`:''}：修改 ${changed} 项`);
        return changed?`已保存 ${changed} 项修改`:'没有修改内容';
      }
      const visit={id:'n'+Date.now(),type:'常规随访',date,method:'门诊随访',doctor:'陈医生',status:'completed',summary:summary||'按计划完成本次随访。',dropout:false,dropoutReasons:[],form:data,entries:describeEntries(form,defaults,data)};
      (store.visits[p.id]=store.visits[p.id]||[]).push(visit);
      patchPatient(p.id,{visits:(p.visits||0)+1,last:!p.last||date>p.last?date:p.last});
      audit(p.id,'新增随访',`第 ${nth} 次随访 · ${date} · 填写 ${diffCount(defaults,data)} 项`);
      return `第 ${nth} 次随访已保存，即将返回患者详情`;
    },
    afterSubmit:()=>location.href=back
  });
});
