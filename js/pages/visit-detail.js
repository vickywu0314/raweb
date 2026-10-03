/* visit-detail.html 页面脚本（依赖 boot.js → data.js → common.js） */
"use strict";
shell(pageOrigin().nav);
// API loading skeleton: shown before visit data is available.
$('#visit-hero').innerHTML=`<div class="skeleton skeleton-title"></div><div class="skeleton skeleton-tags"></div><div class="skeleton-grid">${Array.from({length:6},()=>'<div><i class="skeleton skeleton-label"></i><i class="skeleton skeleton-value"></i></div>').join('')}</div>`;
$('#visit-sections').innerHTML=Array.from({length:4},(_,i)=>`<section class="detail-section skeleton-section"><i class="skeleton skeleton-heading"></i><div class="skeleton-card-grid"><i class="skeleton skeleton-card"></i><i class="skeleton skeleton-card"></i></div></section>`).join('');
document.querySelector('.detail-anchor').classList.add('is-loading');
setTimeout(()=>{
const p=patientById(queryParam('id')), visits=demoVisits(p), v=visits.find(x=>x.id===queryParam('visit'))||visits[0];
document.title=`${p.name} · ${v.type} · 患者数据研究平台`; {const o=pageOrigin(),visitsUrl=withFrom(`patient-visits.html?id=${encodeURIComponent(p.id)}`),direct=queryParam('entry')==='direct';
 const c=$('#crumb-origin');c.textContent=o.crumb;c.href=o.href;$('#crumb-visits').href=visitsUrl;
 // 从列表直接跳入（如数据质控定位缺失项）时，返回回到来源列表；否则返回随访记录
 const b=$('#back-visits');b.textContent=direct?`← 返回${o.label}`:'← 返回随访记录';bindBack(b,direct?o.href:visitsUrl);}
const eye=`<svg class="eye-icon eye-open" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg><svg class="eye-icon eye-closed" viewBox="0 0 24 24"><path d="m3 3 18 18M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8M6.1 6.1C3.8 7.7 2.5 12 2.5 12s3.5 6 9.5 6c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
const masked=p.identityNo.slice(0,-4)+'****';
$('#visit-hero').innerHTML=`<div class="patient-basic-head"><div class="patient-basic-title"><div class="patient-name-line"><h1>${escapeHTML(p.name)}</h1>${p.lost?`<span class="patient-dropout">已脱落</span><span class="patient-dropout-reason">脱落原因：${escapeHTML(withdrawText(p))}</span>`:''}</div><div class="basic-tags">${badge('研究编号: '+p.code)} ${badge('ID号: '+p.id)} ${badge('疾病分型: '+(p.subtype||'待补充'))} ${badge(p.sex)} ${badge(p.year+'年出生')}</div></div><div class="heading-actions"><input id="ai-case-images" type="file" accept="image/*" multiple hidden><button class="button" id="ai-import">AI纸质病历拍照导入</button><button class="button" id="ask-ai">问问AI</button><button class="button danger-outline" id="delete-visit" type="button">删除本次随访</button><a class="button" id="edit-visit" href="visit-create.html?id=${encodeURIComponent(p.id)}&visit=${v.id}">编辑本次随访</a><button class="button primary" id="download-one">下载本次病历</button></div></div><div class="reference-basic-grid"><div><span>患者手机号</span><b>${escapeHTML(p.phone)}</b></div><div><span>患者身份证号</span><b class="identity-value"><em id="identity-no" data-full="${escapeHTML(p.identityNo)}" data-masked="${escapeHTML(masked)}">${escapeHTML(masked)}</em><button class="identity-toggle" id="identity-toggle" aria-label="显示完整身份证号" aria-pressed="false">${eye}</button></b></div><div><span>民族</span><b>${escapeHTML(p.ethnicity)}</b></div><div><span>婚史</span><b>${escapeHTML(p.maritalStatus)}</b></div><div><span>建档日期</span><b>2026-01-01</b></div><div><span>随访观察起始</span><b>2026-01-01</b></div></div>`;
$('#download-one').onclick=()=>downloadCase(p,v);
// 删除本次随访（接口 V05）：逻辑删除，必须填写原因；基线访视在还有其他访视时不能删除
$('#delete-visit').onclick=()=>{
  const all=demoVisits(p);
  if(v.type==='基线访视'&&all.length>1){alert('基线访视之后还有其他访视，不能删除基线访视。如基线数据有误，请使用「编辑本次随访」修改。');return;}
  let d=document.getElementById('delete-dialog');
  if(!d){d=document.createElement('dialog');d.id='delete-dialog';d.innerHTML=`<form method="dialog" class="dialog-form"><div class="dialog-header"><h2>删除本次随访</h2><button class="icon-button" value="cancel" formnovalidate aria-label="关闭">×</button></div><p class="dialog-note">将删除 ${escapeHTML(p.name)} 的「${escapeHTML(v.type)} ${escapeHTML(v.date)}」。删除后不再计入随访次数、统计与质控；原始数据保留在系统中，修改记录会留痕。</p><label class="form-field"><span>删除原因 <b class="required">*</b></span><textarea name="reason" rows="3" required placeholder="如：重复录入；录错患者"></textarea></label><div class="dialog-footer"><button class="button" value="cancel" formnovalidate>取消</button><button class="button danger" value="ok">确认删除</button></div></form>`;document.body.appendChild(d);
   d.addEventListener('close',()=>{if(d.returnValue!=='ok')return;const reason=d.querySelector('[name=reason]').value.trim();
     (store.deletedVisits[p.id]=store.deletedVisits[p.id]||[]).push(v.id);
     const rest=demoVisits(p), last=rest.reduce((m,x)=>x.date>m?x.date:m,'');
     patchPatient(p.id,{visits:Math.max(0,(p.visits||1)-1),last:last||null});
     audit(p.id,'删除随访',`${v.type} ${v.date}（${v.method}）；删除原因：${reason}`);
     location.href=withFrom(`patient-visits.html?id=${encodeURIComponent(p.id)}`);});}
  d.returnValue='';d.showModal();
};$('#ask-ai').onclick=()=>openAIChat({scope:'visit',patient:p,visit:v});
const aiInput=$('#ai-case-images');
$('#ai-import').onclick=()=>aiInput.click();
aiInput.onchange=()=>{
  const files=[...aiInput.files]; if(!files.length)return;
  const old=$('#ai-import-preview'); if(old)old.remove();
  const panel=document.createElement('div'); panel.id='ai-import-preview'; panel.className='ai-import-preview panel';
  panel.innerHTML=`<div class="ai-import-head"><div><strong>已选择 ${files.length} 张病历照片</strong><span>确认照片清晰、完整后，可交给 AI 识别并回填结构化字段。</span></div><button class="button compact" id="clear-ai-images">重新选择</button></div><div class="ai-image-grid"></div><div class="ai-import-actions"><span>图片仅用于当前导入流程，演示版不会上传到服务器。</span><button class="button primary" id="start-ai-import">开始 AI 识别</button></div>`;
  $('#visit-hero').after(panel);
  const grid=panel.querySelector('.ai-image-grid');
  files.forEach((file,i)=>{const url=URL.createObjectURL(file);const item=document.createElement('div');item.className='ai-image-item';item.innerHTML=`<img src="${url}" alt="病历照片 ${i+1}"><small>${escapeHTML(file.name)}</small>`;grid.appendChild(item)});
  panel.querySelector('#clear-ai-images').onclick=()=>{aiInput.value='';panel.remove();aiInput.click()};
  panel.querySelector('#start-ai-import').onclick=e=>{const b=e.currentTarget;b.disabled=true;b.textContent='AI 识别中…';setTimeout(()=>{b.textContent='识别完成 · 待确认';panel.classList.add('recognized')},900)};
};
$('#identity-toggle').onclick=e=>{const b=e.currentTarget,n=$('#identity-no'),open=b.getAttribute('aria-pressed')==='true';b.setAttribute('aria-pressed',String(!open));n.textContent=open?n.dataset.masked:n.dataset.full};
const field=(k,val)=>`<div class="detail-field"><span>${escapeHTML(k)}</span><strong>${escapeHTML(val)}</strong></div>`;
const chips=(a,c='')=>`<div class="data-chips ${c}">${a.map(x=>`<span>${escapeHTML(x)}</span>`).join('')}</div>`;
const mt=(t,r)=>`<div class="subcard metric-card"><h3>${t}</h3><div class="metric-list">${r.map(x=>{const status=x[3]||'';return `<div class="${status?'metric-row '+status:''}"><span>${x[0]}</span><strong>${x[1]}${status==='high'?'<b class="abnormal-arrow">↑</b>':status==='low'?'<b class="abnormal-arrow">↓</b>':''}</strong><small>${x[2]||''}${x[4]?`<em>${x[4]}</em>`:''}</small></div>`}).join('')}</div></div>`;
const abnormalSummary=`<div class="abnormal-toolbar"><div><strong>异常指标 2 项</strong><span>红色高亮用于快速定位；参考范围仅作界面演示，正式版应以后端检验参考区间为准。</span></div><button class="button compact" id="toggle-abnormal">仅看异常</button></div>`;
const sections=[
['病史病情',`<div class="detail-fields">${field('首诊时间','2026-01-01')}${field('随访时间',v.date)}${field('发病时间','未提供')}${field('确诊时间','未提供')}${field('主诉','关节晨僵约 35 分钟，近期症状总体稳定')}${field('既往史','未提供')}${field('家族史','未提供')}${field('吸烟史','未提供')}</div>`],
['辅助检查',`${abnormalSummary}<div class="module-note">按原型完整保留检查分类；“未查 / 未做”与“异常”视觉区分，医生可切换仅看异常。</div><div class="subcard-grid lab-grid">${mt('血常规',[['白细胞 WBC','6.12','×10⁹/L'],['血红蛋白 HGB','116','g/L','low','偏低'],['血小板 PLT','306','×10⁹/L']])}${mt('炎症指标',[['血沉 ESR','22','mm/h','high','偏高'],['C-反应蛋白 CRP','4.54','mg/L'],['超敏CRP hsCRP','未查','']])}${mt('免疫指标',[['类风湿因子 RF','未查','IU/L'],['免疫球蛋白G IgG','未查','g/L'],['免疫球蛋白A IgA','未查','g/L'],['免疫球蛋白M IgM','未查','g/L']])}${mt('肝功能',[['谷丙转氨酶 ALT','27.4','U/L'],['谷草转氨酶 AST','35.6','U/L'],['谷氨酰转移酶 GGT','未查','U/L']])}${mt('肾功能',[['尿素 UREA','未查','μmol/L'],['肌酐 CREA','60','μmol/L']])}${mt('自身抗体',[['ANA','未做',''],['抗SSA','未做',''],['抗SSB','未做',''],['抗Ro-52抗体','未做',''],['抗CCP抗体','未做','']])}${mt('其他生化',[['D-二聚体 D-Dimer','未查','ng/ml'],['同型半胱氨酸 HCY','未查','μmol/L'],['直接胆红素 DBIL','未查','μmol/L']])}${mt('血脂 / 血糖',[['总胆固醇 CHO','未查','mmol/L'],['甘油三酯 TG','未查','mmol/L'],['HDL-C','未查','mmol/L'],['LDL-C','未查','mmol/L'],['葡萄糖 GLU','未查','μmol/L']])}</div><div class="subcard"><h3>关节 X 线检查</h3><div class="detail-fields compact-fields">${field('检查日期','未提供')}${field('检查号（非必填）','未提供')}${field('部位','手 / 足 / 膝 / 肘 / 其他：未记录')}${field('检验报告','未上传')}</div></div><div class="subcard-grid">${mt('心电图',[['结果','正常',''],['异常类型','—','T波改变 / ST改变 / 传导阻滞 / 心律失常 / 其他'],['检验报告','未上传','']])}${mt('超声心动',[['结果','未查',''],['检验报告','未上传','']])}</div>`],
['病情评估',`<div class="assessment-summary"><div><span>DAS28-ESR</span><strong>未提供</strong></div><div><span>DAS28-CRP</span><strong>未提供</strong></div><div><span>晨僵持续时间</span><strong>35 分钟</strong></div><div><span>HAQ</span><strong>未完成</strong></div></div><div class="subcard-grid">${mt('关节评估',[['肿胀关节数','未提供','肩 / 肘 / 腕 / 膝 / 手掌等'],['压痛关节数','未提供','肩 / 肘 / 腕 / 膝 / 手掌等']])}${mt('VAS 评分',[['患者疼痛 VAS','30','/ 100'],['疾病总体状况 VAS（患者）','未提供','/ 100'],['疾病总体状况 VAS（医生）','未提供','/ 100']])}</div><div class="subcard"><h3>健康评估问卷（HAQ）</h3><p class="muted-copy">原型按“无困难 / 稍有困难 / 很困难 / 不能进行”记录过去一周活动能力，包括穿衣等日常活动。当前访视未完成问卷。</p></div><div class="subcard"><h3>脏器受累</h3>${chips(['类风湿血管炎：否','肺、胸膜病变：否','心脏病变：否','神经病变：否','肾脏病变：否','其他系统：否'],'soft')}<p class="muted-copy organ-note">原型支持继续记录具体表现，例如类风湿血管炎相关皮肤指端坏死、视网膜炎等，以及肺/胸膜病变中的胸膜炎、胸腔积液、肺间质病变等。</p></div><div class="subcard"><h3>本次评估结果 / 与上次评估比较</h3><div class="comparison-grid"><div><span>本次评估</span><strong>DAS28、关节数、VAS、HAQ 待数据完整后生成</strong></div><div><span>治疗反应</span><strong>ACR20 / ACR50 / ACR70：未评估</strong></div><div><span>与上次比较</span><strong>暂无可比较数据</strong></div></div></div>`],
['中医诊断',`<div class="tcm-grid"><div class="subcard"><h3>证型</h3>${chips(['主证：风湿痹阻证','兼证：未录入'])}</div><div class="subcard"><h3>舌诊</h3>${chips(['舌色：淡红','舌形：正常','苔质：薄','苔色：白'])}</div><div class="subcard"><h3>脉象</h3>${chips(['脉象：浮'])}</div></div><div class="module-note">证型包含风湿痹阻证、寒湿痹阻证、湿热痹阻证、痰瘀痹阻证、瘀血痹阻证、气血两虚证、肝肾不足证、气阴两虚证等主证/兼证；舌色、舌形、苔质、苔色、脉象按原型分别记录。</div>`],
['治疗方案',`<div class="treatment-head"><span>本次治疗</span><strong>西药 2 项 · 中成药 1 项 · 中药饮片未开药</strong></div><div class="treatment-change"><div class="treatment-change-main"><span>与上次相比治疗方案是否调整</span><strong class="change-yes">是</strong></div><div class="treatment-change-reason"><span>调整原因</span><strong>疗效不佳</strong><small>可选：疗效不佳 / 不良事件 / 经济原因 / 其他</small></div></div><div class="treatment-groups"><div class="subcard"><h3>西药</h3><div class="drug-row"><div><strong>甲氨蝶呤</strong><small>抗风湿药物</small></div><span>10 mg · 每周一次</span></div><div class="drug-row"><div><strong>叶酸片</strong><small>辅助用药</small></div><span>5 mg · 每周一次</span></div></div><div class="subcard"><h3>中成药</h3><div class="drug-row"><div><strong>雷公藤多苷片</strong><small>演示药品</small></div><span>剂量待接入</span></div></div><div class="subcard"><h3>中药饮片</h3><p class="muted-copy">暂未开药。原型支持按证型进入方剂，记录主方、补充草药和删减草药。</p></div></div><div class="subcard"><h3>用药详情字段</h3>${chips(['药品类别','药品名称','商品名称','厂家','剂量','单位','给药方式','给药频次','起始时间','调药过程','调药原因','累积剂量'],'soft')}</div>`],
['不良反应',`<div class="adverse-status"><span class="status-dot good"></span><div><span>本次是否发生不良反应</span><strong>无</strong></div></div><div class="subcard"><h3>不良反应名称</h3>${chips(['白细胞下降','血小板下降','中性粒细胞下降','贫血','全血细胞下降','淋巴细胞下降','口腔溃疡','口/舌疼痛','恶心、呕吐','腹泻','腹痛','肝功异常','消化不良','咳嗽','咳痰','哮喘','呼吸困难','血尿','蛋白尿','肾功异常','肾衰竭','少尿','心梗','头晕','头痛','失眠','皮疹','皮肤瘙痒','色素沉着','月经延迟','肿瘤','体重减轻','脱发','结节','感染'],'soft')}</div><div class="subcard-grid">${mt('事件信息',[['发生日期','—',''],['结束日期','—',''],['不良事件详情','—','']])}${mt('采取与药物的相关措施',[['剂量不变','—',''],['减少剂量','—',''],['停止用药','—',''],['对症治疗','—',''],['其他措施','—','']])}</div><div class="subcard"><h3>SAE 类别</h3>${chips(['致命','危及生命','需要住院治疗或延长住院时间','导致永久或严重的残疾 / 能力丧失','母亲使用研究药物导致新生儿不良事件','由医生判断为重大医疗事件'],'soft')}</div>`],
['随诊病例',`<div class="detail-fields">${field('病例摘要',v.summary)}${field('记录医生',v.doctor)}${field('记录状态','已完成')}</div>`]
];
// 本机录入 / 修改过的内容：按模块列出，便于核对
const entries=v.entries||[];
const groupsE=entries.reduce((m,e)=>{(m[e.sec]=m[e.sec]||[]).push(e);return m},{});
const entriesHTML=entries.length?`<section class="detail-section entries-section" id="entries"><div class="detail-section-head"><span class="section-check">✎</span><h2>本次录入内容 <small>${entries.length} 项 · 保存在本机浏览器（演示）</small></h2></div>${Object.entries(groupsE).map(([sec,list])=>`<div class="entries-group"><h3>${escapeHTML(sec)}</h3><dl>${list.map(e=>`<div><dt>${escapeHTML(e.label)}</dt><dd>${escapeHTML(e.value)}</dd></div>`).join('')}</dl></div>`).join('')}</section>`:'';
$('#visit-sections').innerHTML=entriesHTML+sections.map((g,i)=>`<section class="detail-section" id="section-${i}"><div class="detail-section-head"><span class="section-check">✓</span><h2>${g[0]}</h2></div>${g[1]}</section>`).join('');

// UX: abnormal-only view + active section navigation
const abnormalBtn=$('#toggle-abnormal');
if(abnormalBtn) abnormalBtn.onclick=()=>{const root=$('#section-1'),on=root.classList.toggle('abnormal-only');abnormalBtn.textContent=on?'查看全部指标':'仅看异常';};
const anchors=[...document.querySelectorAll('.detail-anchor a')];
const detailSections=[...document.querySelectorAll('.detail-section')];
const setActive=id=>anchors.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+id));
anchors.forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const target=document.querySelector(a.getAttribute('href'));if(!target)return;setActive(target.id);target.scrollIntoView({behavior:'smooth',block:'start'});}));
const syncActiveSection=()=>{if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-8){setActive(detailSections.at(-1).id);return;}const y=window.scrollY+130;let current=detailSections[0];for(const section of detailSections){if(section.offsetTop<=y)current=section;else break;}setActive(current.id)};
window.addEventListener('scroll',syncActiveSection,{passive:true});
window.addEventListener('resize',syncActiveSection);syncActiveSection();

document.querySelector('.detail-anchor').classList.remove('is-loading');

// 从病程分析的洞察卡片跳入：定位到对应数据区块并高亮，提供返回入口
const hashTarget=flashHashTarget();
if(hashTarget&&hashTarget.classList.contains('detail-section')) setActive(hashTarget.id);
if(queryParam('from')==='insight'){
  const back=document.createElement('a');back.className='from-insight';back.href=`patient-insight.html?id=${encodeURIComponent(p.id)}`;back.textContent='← 返回病程分析';
  const main=document.getElementById('main');main.insertBefore(back,main.querySelector('.breadcrumb')?.nextSibling||main.firstChild);
}
},650);
