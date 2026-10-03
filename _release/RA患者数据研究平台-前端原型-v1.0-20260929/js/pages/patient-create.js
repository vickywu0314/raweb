/* patient-create.html 页面脚本（依赖 boot.js → data.js → common.js → shared/case-form.js） */
"use strict";
document.addEventListener('DOMContentLoaded',()=>{
  shell('patients');
  const form=document.querySelector('#create-form');
  const defaults=serializeSections(form);
  initCaseForm({
    draftMsg:'草稿已暂存（前端演示）',
    // 保存：新患者写入本地演示数据；若已录入病例模块，同时生成首次（基线）访视
    onSubmit(form){
      const v=n=>(form.querySelector(`[name="${n}"]`)?.value||'').trim();
      const maxId=Math.max(...patients.map(p=>+p.id||0)), id=v('patientId')||String(maxId+17);
      if(patients.some(p=>p.id===id)){caseToast(`ID号 ${id} 已存在，请更换`);return false;}
      const sections=serializeSections(form), hasCase=diffCount(sections,defaults)>0;
      const today=ymd(new Date()), visitDate=hasCase?(sections['history:visitDate']||today):null;
      const p={id,name:v('name'),center:'北京协和医院',phone:v('phone'),identityNo:v('idcard'),maritalStatus:v('marital'),ethnicity:v('ethnicity')||'',
        sex:form.querySelector('[name="sex"]:checked')?.value||'女',year:v('birth')?+v('birth').slice(0,4):1970,
        code:v('studyNo')||'RA-2026-'+String(101+patients.length*3).padStart(4,'0'),subtype:null,das28:null,
        visits:hasCase?1:0,last:visitDate,due:false,incomplete:true,missing:'缺 DAS28 评分',abnormal:false,lost:false,
        followCycle:+v('followCycle')||6,followStart:v('followStart')||visitDate,comorbid:{},created:today};
      store.added.push(p);
      if(hasCase){store.visits[id]=[{id:'n'+Date.now(),type:'基线访视',date:visitDate,method:'门诊随访',doctor:'陈医生',status:'completed',summary:(sections['case:0']||'完成建档与基线资料采集。'),dropout:false,dropoutReasons:[],form:sections,entries:describeEntries(form,defaults,sections)}];}
      saveStore();
      audit(id,'新建档案',`${p.name} · ${p.code}${hasCase?' · 同时录入基线访视':''}`);
      setTimeout(()=>location.href=`patient-visits.html?id=${encodeURIComponent(id)}`,1200);
      return `患者「${p.name}」已建档（保存在本机浏览器，演示用）`;
    }
  });
});
