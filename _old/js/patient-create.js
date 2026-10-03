document.addEventListener('DOMContentLoaded',()=>{
  if(typeof shell==='function') shell('patients');
  const form=document.querySelector('#create-form');
  const sections=[...document.querySelectorAll('.create-section')];
  const fileInput=document.querySelector('#ai-files'), panel=document.querySelector('#ai-panel'), filesBox=document.querySelector('#import-files');
  const aiImport=document.querySelector('#ai-import');
  if(aiImport&&fileInput) aiImport.addEventListener('click',()=>fileInput.click());
  if(fileInput) fileInput.addEventListener('change',()=>{ filesBox.innerHTML=''; [...fileInput.files].forEach(f=>{const x=document.createElement('span');x.className='import-file';x.textContent=f.name;filesBox.appendChild(x)}); panel.hidden=!fileInput.files.length; });
  const recognize=document.querySelector('#recognize');
  if(recognize) recognize.addEventListener('click',()=>{ recognize.disabled=true;recognize.textContent='AI 识别中…';setTimeout(()=>{recognize.disabled=false;recognize.textContent='识别完成 · 请核对'; toast('已完成演示识别，接入接口后将自动回填对应模块');},900); });

  // 血象报告 = 血常规：提供就地拍照/选图入口，避免医生回到页面顶部。
  const cbcInput=document.querySelector('#cbc-ai-files');
  const cbcButton=document.querySelector('#cbc-ai-import');
  const cbcPanel=document.querySelector('#cbc-ai-panel');
  const cbcNames=document.querySelector('#cbc-ai-file-names');
  const cbcRecognize=document.querySelector('#cbc-recognize');
  if(cbcButton&&cbcInput) cbcButton.addEventListener('click',()=>cbcInput.click());
  if(cbcInput) cbcInput.addEventListener('change',()=>{
    const names=[...cbcInput.files].map(f=>f.name);
    cbcNames.textContent=names.length?`已选择 ${names.length} 张：${names.join('、')}`:'';
    cbcPanel.hidden=!names.length;
  });
  if(cbcRecognize) cbcRecognize.addEventListener('click',()=>{
    cbcRecognize.disabled=true;cbcRecognize.textContent='识别中…';
    setTimeout(()=>{cbcRecognize.disabled=false;cbcRecognize.textContent='识别完成 · 请核对';toast('血象报告识别完成（前端演示），后续接口可回填 WBC / HGB / PLT 等指标');},800);
  });

  function toast(msg){const old=document.querySelector('.save-toast');if(old)old.remove();const t=document.createElement('div');t.className='save-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
  function updateProgress(){
    sections.forEach(s=>{
      const controls=[...s.querySelectorAll('input:not([type=file]),select,textarea')];
      const filled=controls.filter(x=>(x.type==='checkbox'||x.type==='radio')?x.checked:String(x.value||'').trim()).length;
      const head=s.querySelector('.create-section-head');
      let badge=head.querySelector('.section-progress');
      if(!badge){badge=document.createElement('b');badge.className='section-progress';head.insertBefore(badge,head.querySelector('.section-toggle'))}
      badge.className='section-progress';
      if(!filled){badge.textContent='未填写';}
      else if(filled>=Math.max(1,Math.ceil(controls.length*.45))){badge.textContent='已填写';badge.classList.add('done')}
      else{badge.textContent='部分填写';badge.classList.add('partial')}
    })
  }
  form.addEventListener('input',updateProgress);form.addEventListener('change',updateProgress);
  // 保持页面简洁：打开一个业务卡片时，自动收起其他卡片。
  sections.forEach(s=>s.addEventListener('toggle',()=>{
    if(!s.open)return;
    sections.forEach(other=>{if(other!==s)other.open=false});
    requestAnimationFrame(()=>s.scrollIntoView({behavior:'smooth',block:'start'}));
  }));
  const draft=document.querySelector('#draft'); if(draft) draft.addEventListener('click',()=>toast('草稿已暂存（前端演示）'));
  form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;toast('患者建档已保存（前端演示）');});
  updateProgress();
});
