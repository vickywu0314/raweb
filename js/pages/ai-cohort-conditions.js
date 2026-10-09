/* 本页条件入口；不恢复结果资源或身份。ID一直保留十进制字符串。 */
"use strict";
window.RACohortConditions=(()=>{
  const defaults={studyCode:'RA',sex:'',age:'',sero:'',tx:'',at:'now',act:'',cm:'',data:'',ids:null};
  const enums={studyCode:['RA'],sex:['F','M'],sero:['1'],tx:['csDMARD','bio','TNFi','JAKi','IL-6i','Abatacept'],at:['now','6m'],act:['target','mod-high','remission','low','moderate','high'],cm:['FM','AS','none'],data:['complete','missing']};
  const validId=id=>typeof id==='string'&&/^[1-9][0-9]*$/.test(id)&&(id.length<19||(id.length===19&&id<='9223372036854775807'));
  const invalid=()=>Object.assign(new Error('条件无效，请修改条件或清空后重新分析'),{code:'INVALID_FILTER'});
  function decode(search) {
    const filters={...defaults},params=new URLSearchParams(search),seen=new Set();
    for(const [key,value] of params) {
      if(!Object.hasOwn(defaults,key)) throw Object.assign(new Error('此入口待接入，请清空条件重新分析'),{code:'ENTRY_NOT_READY'});
      if(seen.has(key)) throw invalid();seen.add(key);
      if(key==='ids') {
        const ids=value===''?[]:value.split(',');
        if(ids.length>5000 || ids.some(id=>!validId(id)))throw invalid();
        filters.ids=ids;continue;
      }
      const text=key==='sex'?({'女':'F','男':'M'}[value]||value):value;
      if(text==='')continue;
      if(key==='age'){
        if(!/^[0-9]{1,3}-[0-9]{0,3}$/.test(text))throw invalid();
        const [min,max]=text.split('-');if(Number(min)>120 || (max!==''&&(Number(max)>120||Number(min)>Number(max))))throw invalid();
      }else if(!enums[key].includes(text))throw invalid();
      filters[key]=text;
    }
    return filters;
  }
  function encode(filters) {
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries(filters)) {
      if(!Object.hasOwn(defaults,key))throw invalid();
      if(key==='ids')continue;
      if(value!==null&&value!==undefined&&typeof value!=='string')throw invalid();
      if(value && !(key==='studyCode'&&value==='RA') && !(key==='at'&&value==='now'))params.set(key,value);
    }
    if(filters.ids!==null && filters.ids!==undefined){
      if(!Array.isArray(filters.ids)||filters.ids.length>5000||filters.ids.some(id=>!validId(id)))throw invalid();
      params.set('ids',filters.ids.join(','));
    }
    const normalized=decode(params);if(params.has('sex'))params.set('sex',normalized.sex);
    return params.size?'?'+params.toString():'';
  }
  return Object.freeze({decode,encode});
})();
