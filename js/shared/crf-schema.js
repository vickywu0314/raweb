/* RA 病例报告表（CRF）字段定义 —— 全站唯一来源
   · 新建患者、新增 / 编辑随访的表单按此渲染；保存的数据结构与后端接口 JSON 一致。
   · 字段路径 path：访视级字段直接写（visitDate、method），其余为「模块.字段」，重复组为「模块.组[].字段」。
   · 选项 value 为接口传输的编码，label 为页面显示；导出 SPSS / Stata 时按选项顺序 1、2、3… 编整数码。
   · 检验参考区间仅用于界面异常提示，正式以医院检验科区间为准；取值范围 min/max 用于质控。
   依赖：无。需在 case-form.js 之前加载。 */
"use strict";

const CRF_SCHEMA = (() => {
const O = (...pairs) => pairs.map(p => { const [value, label] = p.split('='); return { value, label: label ?? value }; });
const YN = O('no=否', 'yes=是');
const POSNEG = O('negative=阴性', 'positive=阳性', 'not_done=未做');
const SYNDROMES = O('wind_damp=风湿痹阻证', 'cold_damp=寒湿痹阻证', 'damp_heat=湿热痹阻证', 'phlegm_stasis=痰瘀痹阻证', 'blood_stasis=瘀血痹阻证', 'qi_blood_def=气血两虚证', 'liver_kidney_def=肝肾不足证', 'qi_yin_def=气阴两虚证');
const AE_NAMES = ['白细胞下降', '血小板下降', '中性粒细胞下降', '贫血', '全血细胞下降', '淋巴细胞下降', '口腔溃疡', '口/舌疼痛', '恶心、呕吐', '腹泻', '腹痛', '肝功异常', '消化不良', '咳嗽', '咳痰', '哮喘', '呼吸困难', '血尿', '蛋白尿', '肾功异常', '肾衰竭', '少尿', '心梗', '头晕', '头痛', '失眠', '皮疹', '皮肤瘙痒', '色素沉着', '月经延迟', '肿瘤', '体重减轻', '脱发', '结节', '感染']
  .map((label, i) => ({ value: 'AE' + String(i + 1).padStart(2, '0'), label })).concat([{ value: 'other', label: '其他' }]);
const lab = (key, label, unit, ref, min, max, step = 'any') => ({ key, label, type: 'number', unit, ref, min, max, step });

return {
  study: 'RA',
  version: '1.1',
  sections: [
    { id: 'history', key: 'history', title: '病史病情', desc: '疾病时间轴、病史与症状', groups: [
      { title: '本次就诊与疾病概况', fields: [
        { key: 'visitDate', path: 'visitDate', label: '本次随访时间', type: 'date', required: true, note: '访视级字段' },
        { key: 'method', path: 'method', label: '访视方式', type: 'single', options: O('outpatient=门诊随访', 'phone=电话随访', 'inpatient=住院随访'), default: 'outpatient', note: '访视级字段' },
        { key: 'subtype', label: '疾病分型', type: 'single', options: O('sero_pos=血清阳性 RA（RF 和/或抗 CCP 阳性）', 'sero_neg=血清阴性 RA', 'undetermined=待定'), note: '医生根据患者情况填写' },
        { key: 'firstVisitDate', label: '首诊时间', type: 'date' },
        { key: 'onsetDate', label: '发病时间', type: 'date', note: '首次出现相关症状日期' },
        { key: 'diagnosisDate', label: '确诊时间', type: 'date' },
        { key: 'chiefComplaint', label: '主诉', type: 'text', span: 3, placeholder: '如：双手关节肿痛伴晨僵 3 月' },
        { key: 'course', label: '首发症状 / 病程', type: 'longtext', span: 3, placeholder: '记录首发症状、病程演变等' }
      ] },
      { title: '既往及个人史', fields: [
        { key: 'pastHistory', label: '既往史', type: 'longtext' },
        { key: 'familyHistory', label: '家族史', type: 'longtext' },
        { key: 'comorbidity', label: '合并疾病', type: 'longtext', note: 'FM / AS 等常见相关疾病在「基本信息」中结构化记录' },
        { key: 'smoking', label: '吸烟史', type: 'single', options: O('never=从不吸烟', 'former=既往吸烟', 'current=目前吸烟') },
        { key: 'allergy', label: '过敏史', type: 'text', placeholder: '无 / 具体过敏原' }
      ] },
      { title: '加重诱因', fields: [
        { key: 'flareTriggers', label: '加重诱因', type: 'multi', hideLabel: true, options: O('none=无', 'stop=停药', 'reduce=减药', 'switch=换药', 'irregular=间断服药', 'fatigue=劳累', 'cold=感冒', 'infection=感染', 'emotion=情绪刺激', 'childbirth=分娩或小产', 'diet=饮食不当', 'trauma=创伤', 'surgery=手术', 'weather=天气变化', 'other=其他') },
        { key: 'flareTriggerOther', label: '其他诱因', type: 'text', when: { key: 'flareTriggers', has: 'other' } }
      ] },
      { title: '关节症状', fields: [
        { key: 'jointPain', label: '关节疼痛', type: 'single', options: O('none=无', 'mild=疼痛较轻', 'moderate=疼痛较重，可以忍受', 'severe=疼痛很重，难以忍受') },
        { key: 'painNature', label: '疼痛性质', type: 'single', options: O('unclear=不明确', 'distending=胀痛', 'stabbing=刺痛', 'cold=冷痛', 'aching=酸痛') },
        { key: 'painSitePattern', label: '疼痛部位特点', type: 'single', options: O('fixed=痛有定处', 'migratory=游走不定') },
        { key: 'painWorseTime', label: '疼痛加重时间', type: 'single', options: O('none=无明显时间性', 'morning=晨起', 'afternoon=午后', 'night=夜间') },
        { key: 'morningStiffness', label: '关节晨僵', type: 'single', options: O('none=无', 'lt30m=<30分钟', '30m_1h=30分钟~1小时', '1h_2h=1小时~2小时', 'gt2h=>2小时') },
        { key: 'jointSwelling', label: '关节肿胀', type: 'single', options: O('none=无', 'mild=很轻', 'moderate=较重', 'severe=极重') },
        { key: 'jointHeat', label: '关节触热', type: 'single', options: O('none=无', 'hot_feel=触热且有热感', 'hot_nofeel=触热但无热感') },
        { key: 'skinRedness', label: '皮色发红', type: 'single', options: O('no=无', 'yes=有') },
        { key: 'coldHeatChange', label: '寒热变化', type: 'single', options: O('none=无明显变化', 'heat_worse=遇热加重', 'cold_worse=遇寒加重') },
        { key: 'subcutaneousNodule', label: '皮下结节', type: 'single', options: O('no=无', 'yes=有') },
        { key: 'deformityJoints', label: '屈伸不利 / 关节畸形部位', type: 'multi', grid: 'joint', options: O('elbow=肘', 'wrist=腕', 'mcp=掌指关节', 'pip=近端指关节', 'dip=远端指关节', 'knee=膝', 'foot=足') }
      ] },
      { title: '全身及其他症状', fields: [
        { key: 'appetite', label: '胃口', type: 'single', options: O('good=很好', 'fair=有点差', 'poor=很差', 'none=一点胃口都没有') },
        { key: 'insomnia', label: '失眠多梦', type: 'single', options: O('none=无', 'occasional=偶尔', 'often=时常', 'always=总是') },
        { key: 'restlessness', label: '心烦不安', type: 'single', options: O('almost_never=几乎没有', 'occasional=偶尔', 'often=常常', 'almost_always=几乎总是') },
        { key: 'fatigue', label: '神疲乏力', type: 'single', options: O('none=无', 'mild=有疲乏', 'moderate=很疲乏', 'severe=非常疲乏，不能干任何事') },
        { key: 'aversionWindCold', label: '怕风怕凉', type: 'single', options: O('none=无', 'slight=稍感，无需加盖衣被', 'relieved=加盖衣被可缓解', 'unrelieved=加盖衣被不缓解') },
        { key: 'menstruation', label: '月经（适用时）', type: 'text' },
        { key: 'urine', label: '小便', type: 'text' },
        { key: 'stool', label: '大便', type: 'text' }
      ] }
    ] },
    { id: 'exam', key: 'exam', title: '辅助检查', desc: '检验、影像及其他检查', note: '可手工录入，也可拍照识别后回填。检验值只填数字，单位已固定；未检查的项目留空。', groups: [
      { title: '炎症与血常规', actions: 'cbc', desc: '血象报告属于血常规检查，可直接拍照识别 WBC、HGB、PLT 等结果。', fields: [
        lab('esr', 'ESR 血沉', 'mm/h', [0, 20], 0, 150, 1),
        lab('crp', 'CRP C-反应蛋白', 'mg/L', [0, 10], 0, 300),
        lab('hscrp', 'hsCRP 超敏 CRP', 'mg/L', [0, 3], 0, 50),
        lab('wbc', 'WBC 白细胞', '×10⁹/L', [3.5, 9.5], 0, 100),
        lab('hgb', 'HGB 血红蛋白', 'g/L', [115, 175], 30, 250, 1),
        lab('plt', 'PLT 血小板', '×10⁹/L', [125, 350], 0, 1500, 1)
      ] },
      { title: '免疫与自身抗体', fields: [
        lab('rf', 'RF 类风湿因子', 'IU/mL', [0, 20], 0, 5000),
        lab('antiCcp', '抗 CCP 抗体', 'U/mL', [0, 17], 0, 5000),
        { key: 'ana', label: 'ANA 抗核抗体', type: 'single', options: POSNEG },
        { key: 'antiSsa', label: '抗 SSA', type: 'single', options: POSNEG },
        { key: 'antiSsb', label: '抗 SSB', type: 'single', options: POSNEG },
        { key: 'antiRo52', label: '抗 Ro-52 抗体', type: 'single', options: POSNEG },
        lab('igg', 'IgG', 'g/L', [7, 16], 0, 60),
        lab('iga', 'IgA', 'g/L', [0.7, 4], 0, 20),
        lab('igm', 'IgM', 'g/L', [0.4, 2.3], 0, 20)
      ] },
      { title: '肝肾功能与其他生化', fields: [
        lab('alt', 'ALT 谷丙转氨酶', 'U/L', [7, 40], 0, 3000),
        lab('ast', 'AST 谷草转氨酶', 'U/L', [13, 35], 0, 3000),
        lab('ggt', 'GGT 谷氨酰转移酶', 'U/L', [7, 45], 0, 3000),
        lab('dbil', 'DBIL 直接胆红素', 'μmol/L', [0, 6.8], 0, 500),
        lab('urea', 'UREA 尿素', 'mmol/L', [2.6, 7.5], 0, 100),
        lab('crea', 'CREA 肌酐', 'μmol/L', [41, 111], 0, 3000),
        lab('dDimer', 'D-二聚体', 'mg/L FEU', [0, 0.55], 0, 100),
        lab('hcy', 'HCY 同型半胱氨酸', 'μmol/L', [0, 15], 0, 300)
      ] },
      { title: '血脂与血糖', fields: [
        lab('cho', 'CHO 总胆固醇', 'mmol/L', [0, 5.2], 0, 30),
        lab('tg', 'TG 甘油三酯', 'mmol/L', [0, 1.7], 0, 50),
        lab('hdlc', 'HDL-C', 'mmol/L', [1.0, null], 0, 10),
        lab('ldlc', 'LDL-C', 'mmol/L', [0, 3.4], 0, 20),
        lab('glu', 'GLU 葡萄糖', 'mmol/L', [3.9, 6.1], 0, 50)
      ] },
      { title: '影像与检查报告', fields: [
        { key: 'xrayDate', label: '关节 X 线日期', type: 'date' },
        { key: 'xrayNo', label: '检查号', type: 'text' },
        { key: 'xraySites', label: '检查部位', type: 'multi', options: O('hand=手', 'foot=足', 'knee=膝', 'elbow=肘', 'other=其他') },
        { key: 'reportText', label: '检验 / 影像报告', type: 'longtext', span: 3 },
        { key: 'ecgResult', label: '心电图', type: 'single', options: O('normal=正常', 'abnormal=异常', 'not_done=未做') },
        { key: 'ecgAbnormalTypes', label: '心电图异常类型', type: 'multi', options: O('t_wave=T 波改变', 'st=ST 改变', 'block=传导阻滞', 'arrhythmia=心律失常', 'other=其他'), when: { key: 'ecgResult', eq: 'abnormal' } },
        { key: 'echoResult', label: '超声心动', type: 'single', options: O('normal=正常', 'abnormal=异常', 'not_done=未做') },
        { key: 'echoDetail', label: '超声心动所见', type: 'text', when: { key: 'echoResult', eq: 'abnormal' } }
      ] }
    ] },
    { id: 'assessment', key: 'assessment', title: '病情评估', desc: 'RA 疾病活动度与功能评估', groups: [
      { title: '关节与 VAS', fields: [
        { key: 'tjc28', label: '压痛关节数 TJC28', type: 'number', min: 0, max: 28, step: 1 },
        { key: 'sjc28', label: '肿胀关节数 SJC28', type: 'number', min: 0, max: 28, step: 1 },
        { key: 'morningStiffnessMin', label: '晨僵持续时间', type: 'number', unit: '分钟', min: 0, max: 1440, step: 1 },
        { key: 'painVas', label: '患者疼痛 VAS', type: 'number', unit: '0–100', min: 0, max: 100, step: 1 },
        { key: 'ptgaVas', label: '患者疾病总体 VAS', type: 'number', unit: '0–100', min: 0, max: 100, step: 1 },
        { key: 'phgaVas', label: '医生疾病总体 VAS', type: 'number', unit: '0–100', min: 0, max: 100, step: 1 }
      ] },
      { title: '功能与疾病活动度', fields: [
        { key: 'haq', label: 'HAQ 评分', type: 'number', unit: '0–3', min: 0, max: 3, step: 0.125 },
        { key: 'das28Esr', label: 'DAS28-ESR', type: 'computed', formula: 'das28Esr', note: '自动计算：TJC28、SJC28、ESR、患者疾病总体 VAS' },
        { key: 'das28Crp', label: 'DAS28-CRP', type: 'computed', formula: 'das28Crp', note: '自动计算：TJC28、SJC28、CRP、患者疾病总体 VAS' },
        { key: 'acrResponse', label: 'ACR 疗效', type: 'single', options: O('none=未达 ACR20', 'acr20=ACR20', 'acr50=ACR50', 'acr70=ACR70') }
      ] },
      { title: '脏器受累', fields: [
        { key: 'organInvolvement', label: '受累脏器', type: 'multi', hideLabel: true, options: O('none=无', 'vasculitis=类风湿血管炎', 'lung=肺、胸膜病变', 'heart=心脏病变', 'nerve=神经病变', 'kidney=肾脏病变', 'other=其他系统') },
        { key: 'organDetail', label: '具体表现', type: 'longtext', span: 3, placeholder: '如：肺间质病变、胸腔积液、皮肤指端坏死等', when: { key: 'organInvolvement', hasAny: ['vasculitis', 'lung', 'heart', 'nerve', 'kidney', 'other'] } }
      ] }
    ] },
    { id: 'tcm', key: 'tcm', title: '中医诊断', desc: '主证、兼证与四诊信息', groups: [
      { title: '证型', fields: [
        { key: 'mainSyndrome', label: '主证', type: 'single', options: SYNDROMES },
        { key: 'secondarySyndromes', label: '兼证', type: 'multi', options: SYNDROMES, span: 3 }
      ] },
      { title: '舌脉', fields: [
        { key: 'tongueColor', label: '舌色', type: 'single', options: O('pale=淡白', 'light_red=淡红', 'red=红', 'crimson=绛', 'purple=紫暗') },
        { key: 'tongueShape', label: '舌形', type: 'single', options: O('normal=正常', 'enlarged=胖大', 'thin=瘦薄', 'teeth_marks=齿痕', 'fissured=裂纹') },
        { key: 'coatingTexture', label: '苔质', type: 'single', options: O('thin=薄', 'thick=厚', 'greasy=腻', 'dry=燥', 'peeled=剥') },
        { key: 'coatingColor', label: '苔色', type: 'single', options: O('white=白', 'yellow=黄', 'grey_black=灰黑') },
        { key: 'pulse', label: '脉象', type: 'text', placeholder: '如：弦滑、沉细' }
      ] }
    ] },
    { id: 'treatment', key: 'treatment', title: '治疗方案', desc: '西药、中成药与中药饮片', groups: [
      { title: '与上次治疗比较', fields: [
        { key: 'regimenChanged', label: '治疗方案是否调整', type: 'single', options: O('na=首次建档 / 无上次方案', 'no=否', 'yes=是') },
        { key: 'changeReason', label: '调整原因', type: 'single', options: O('poor_efficacy=疗效不佳', 'adverse=不良事件', 'economic=经济原因', 'other=其他'), when: { key: 'regimenChanged', eq: 'yes' } }
      ] },
      { title: '用药明细', repeat: { key: 'medications', item: '药物', add: '添加药物' }, desc: '每种药一行；中药饮片处方写在下方。', fields: [
        { key: 'drugType', label: '药物类型', type: 'single', options: O('western=西药', 'chinese_patent=中成药', 'herbal=中药饮片'), default: 'western' },
        { key: 'drugCategory', label: '药物类别', type: 'single', options: O('csdmard=传统合成 DMARD', 'bdmard=生物制剂', 'tsdmard=靶向合成 DMARD（JAK 抑制剂）', 'gc=糖皮质激素', 'nsaid=非甾体抗炎药', 'other=其他 / 辅助用药'), when: { key: 'drugType', eq: 'western' } },
        { key: 'drugName', label: '药品名称', type: 'text', required: true },
        { key: 'brandName', label: '商品名称', type: 'text' },
        { key: 'manufacturer', label: '厂家', type: 'text' },
        { key: 'spec', label: '规格', type: 'text', placeholder: '如：2.5 mg × 16 片' },
        { key: 'dose', label: '单次剂量', type: 'number', min: 0, step: 'any' },
        { key: 'doseUnit', label: '剂量单位', type: 'single', options: O('mg', 'g', 'μg', 'ml', '片', '粒', '袋', '支') },
        { key: 'route', label: '给药方式', type: 'single', options: O('oral=口服', 'sc=皮下注射', 'iv=静脉滴注', 'im=肌肉注射', 'topical=外用', 'other=其他') },
        { key: 'frequency', label: '给药频次', type: 'single', options: O('qd=每日一次', 'bid=每日两次', 'tid=每日三次', 'qw=每周一次', 'biw=每周两次', 'q2w=每两周一次', 'q4w=每四周一次', 'prn=必要时', 'other=其他') },
        { key: 'startDate', label: '起始时间', type: 'date' },
        { key: 'cumulativeDose', label: '累积剂量', type: 'number', min: 0, step: 'any', note: '单位同剂量单位' },
        { key: 'adjustProcess', label: '调药过程', type: 'text', span: 3 },
        { key: 'adjustReason', label: '调药原因', type: 'text', span: 3 }
      ] },
      { title: '中药饮片处方', fields: [
        { key: 'herbalFormula', label: '主方', type: 'text', placeholder: '如：独活寄生汤' },
        { key: 'herbalDoses', label: '剂数', type: 'number', unit: '剂', min: 0, step: 1 },
        { key: 'herbalAdd', label: '加味药物', type: 'text', span: 3, placeholder: '药名 + 剂量，逗号分隔' },
        { key: 'herbalRemove', label: '减味药物', type: 'text', span: 3 }
      ] }
    ] },
    { id: 'adverse', key: 'adverse', title: '不良反应', desc: '药物相关不良事件记录', groups: [
      { title: '本次是否发生', fields: [
        { key: 'occurred', label: '是否发生不良反应', type: 'single', options: YN, default: 'no' }
      ] },
      { title: '不良事件', repeat: { key: 'events', item: '不良事件', add: '添加不良事件' }, when: { key: 'occurred', eq: 'yes' }, fields: [
        { key: 'name', label: '不良反应名称', type: 'single', options: AE_NAMES, required: true },
        { key: 'nameOther', label: '其他名称', type: 'text', when: { key: 'name', eq: 'other' } },
        { key: 'startDate', label: '发生日期', type: 'date' },
        { key: 'endDate', label: '结束日期', type: 'date' },
        { key: 'action', label: '药物处理措施', type: 'single', options: O('unchanged=剂量不变', 'reduce=减少剂量', 'stop=停止用药', 'symptomatic=对症治疗', 'other=其他措施') },
        { key: 'isSae', label: '是否 SAE', type: 'single', options: YN, default: 'no' },
        { key: 'saeCategories', label: 'SAE 类别', type: 'multi', span: 3, options: O('death=致命', 'life_threatening=危及生命', 'hospitalization=需要住院治疗或延长住院时间', 'disability=导致永久或严重的残疾 / 能力丧失', 'congenital=母亲使用研究药物导致新生儿不良事件', 'important=由医生判断为重大医疗事件'), when: { key: 'isSae', eq: 'yes' } },
        { key: 'detail', label: '事件详情', type: 'longtext', span: 3 }
      ] }
    ] },
    { id: 'case', key: 'caseRecord', title: '随诊病例', desc: '病例文本及附件', groups: [
      { title: '', fields: [
        { key: 'note', label: '随诊病例记录', type: 'longtext', span: 3, placeholder: '可录入或粘贴本次病例内容' },
        { key: 'attachments', label: '病例附件', type: 'file', span: 3, note: '上传后得到附件 ID（fileIds），随访视一起提交' }
      ] }
    ] }
  ]
};
})();

// 每个字段补齐完整路径，便于检索
CRF_SCHEMA.sections.forEach(s => s.groups.forEach(g => g.fields.forEach(f => {
  f.path = f.path || (g.repeat ? `${s.key}.${g.repeat.key}[].${f.key}` : `${s.key}.${f.key}`);
})));
const CRF_FIELDS = CRF_SCHEMA.sections.flatMap(s => s.groups.flatMap(g => g.fields.map(f => ({ ...f, section: s, group: g }))));

// DAS28 计算（与后端同一公式；缺任一组成项返回 null）
const CRF_FORMULAS = {
  das28Esr: v => { const a = v.assessment || {}, e = v.exam || {}; if ([a.tjc28, a.sjc28, e.esr, a.ptgaVas].some(x => x === '' || x == null) || +e.esr <= 0) return null; return Math.round((0.56 * Math.sqrt(+a.tjc28) + 0.28 * Math.sqrt(+a.sjc28) + 0.70 * Math.log(+e.esr) + 0.014 * +a.ptgaVas) * 100) / 100; },
  das28Crp: v => { const a = v.assessment || {}, e = v.exam || {}; if ([a.tjc28, a.sjc28, e.crp, a.ptgaVas].some(x => x === '' || x == null)) return null; return Math.round((0.56 * Math.sqrt(+a.tjc28) + 0.28 * Math.sqrt(+a.sjc28) + 0.36 * Math.log(+e.crp + 1) + 0.014 * +a.ptgaVas + 0.96) * 100) / 100; }
};
const crfOptionLabel = (f, v) => (f.options || []).find(o => o.value === v)?.label ?? v;
