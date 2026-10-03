/* learning-topic.html 页面脚本（依赖 boot.js → data.js → common.js）：学习中心 6 个专题的正文
   内容为指南与共识的要点摘录，上线前需由项目医学负责人审核；参考文献见学习中心页尾。 */
"use strict";
const tbl = (head, rows) => `<table class="lt-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const TOPICS = [
  { id: 'basics', no: '01', title: '疾病基础与分类', lead: 'RA 的核心疾病特征、临床表现与 2010 ACR/EULAR 分类标准。', refs: [1, 2], sections: [
    ['核心特征', `<ul><li>以对称性、多关节（尤其手足小关节）滑膜炎为主要表现的慢性自身免疫病。</li><li>典型症状：关节肿痛、晨僵（常 &gt; 30 分钟）、活动受限；未控制的炎症可导致骨侵蚀和关节畸形。</li><li>血清学：类风湿因子（RF）和抗环瓜氨酸肽抗体（ACPA / 抗 CCP）阳性提示更高的结构损伤风险。</li><li>常见关节外表现与合并症：间质性肺病、心血管疾病、骨质疏松、贫血等。</li></ul>`],
    ['2010 ACR/EULAR 分类标准', `<p>适用于至少 1 个关节确定有滑膜炎、且无法用其他疾病更好解释的患者。四项得分相加，<b>≥ 6 分（满分 10 分）可分类为 RA</b>。</p>` + tbl(['项目', '情况', '分值'], [
      ['A. 受累关节', '1 个大关节', '0'], ['', '2–10 个大关节', '1'], ['', '1–3 个小关节（伴或不伴大关节）', '2'], ['', '4–10 个小关节（伴或不伴大关节）', '3'], ['', '&gt; 10 个关节（至少 1 个小关节）', '5'],
      ['B. 血清学', 'RF 和 ACPA 均阴性', '0'], ['', 'RF 或 ACPA 低滴度阳性（≤ 3 倍正常上限）', '2'], ['', 'RF 或 ACPA 高滴度阳性（&gt; 3 倍正常上限）', '3'],
      ['C. 急性期反应物', 'CRP 和 ESR 均正常', '0'], ['', 'CRP 或 ESR 异常', '1'],
      ['D. 症状持续时间', '&lt; 6 周', '0'], ['', '≥ 6 周', '1']])],
    ['录入时注意', `<ul><li>确诊日期、症状首次出现日期、入组日期分别记录，不相互替代。</li><li>RF、ACPA 录入原始数值与参考范围，不要只写「阳性」。</li></ul>`]] },
  { id: 'activity', no: '02', title: '疾病活动度评估', lead: '理解 DAS28、CDAI、SDAI 的组成、分层与适用场景，以及 EULAR 应答标准。', refs: [3, 4], sections: [
    ['DAS28 的组成', `<p>基于 28 个关节（双侧肩、肘、腕、掌指关节 1–5、近端指间关节 1–5、膝）：</p><ul><li><b>DAS28-ESR</b> = 0.56 × √TJC28 + 0.28 × √SJC28 + 0.70 × ln(ESR) + 0.014 × 患者总体评价（0–100）</li><li><b>DAS28-CRP</b> = 0.56 × √TJC28 + 0.28 × √SJC28 + 0.36 × ln(CRP mg/L + 1) + 0.014 × 患者总体评价 + 0.96</li></ul><p class="lt-note">系统根据录入的组成项自动计算，无需手算。</p>`],
    ['分层阈值', tbl(['指标', '缓解', '低疾病活动', '中疾病活动', '高疾病活动'], [
      ['DAS28', '&lt; 2.6', '2.6 – ≤ 3.2', '&gt; 3.2 – ≤ 5.1', '&gt; 5.1'],
      ['CDAI', '≤ 2.8', '&gt; 2.8 – ≤ 10', '&gt; 10 – ≤ 22', '&gt; 22'],
      ['SDAI', '≤ 3.3', '&gt; 3.3 – ≤ 11', '&gt; 11 – ≤ 26', '&gt; 26']]) + `<p class="lt-note">CDAI = TJC28 + SJC28 + 患者总体评价（0–10）+ 医生总体评价（0–10），不依赖检验结果；SDAI = CDAI + CRP（mg/dL）。</p>`],
    ['EULAR 应答标准', tbl(['当前 DAS28', '较基线下降 &gt; 1.2', '下降 &gt; 0.6 且 ≤ 1.2', '下降 ≤ 0.6'], [
      ['≤ 3.2', '良好应答', '中等应答', '无应答'], ['&gt; 3.2 且 ≤ 5.1', '中等应答', '中等应答', '无应答'], ['&gt; 5.1', '中等应答', '无应答', '无应答']])],
    ['解读提示', `<ul><li>合并纤维肌痛时，压痛关节数与患者总体评价可能偏高，DAS28 会高估炎症活动，建议对照 SJC28、CRP 或使用 CDAI。</li><li>ESR 受年龄、性别、贫血等因素影响，必要时同时参考 DAS28-CRP。</li></ul>`]] },
  { id: 't2t', no: '03', title: 'Treat-to-Target', lead: '达标治疗：治疗目标、评估频率，以及何时需要调整治疗。', refs: [6, 7], sections: [
    ['核心原则', `<ul><li><b>目标</b>：临床缓解；长病程或难以缓解者，低疾病活动是可接受的替代目标。</li><li><b>评估频率</b>：疾病活动期每 1–3 个月评估一次；达标后可延长至每 6–12 个月。</li><li><b>调整时机</b>：治疗 3 个月内无改善，或 6 个月仍未达标，应调整治疗方案。</li><li>医生与患者共同决策，并考虑结构损伤、功能、合并症与安全性。</li></ul>`],
    ['与本系统的对应', `<ul><li>「随访周期」建议：疾病活动期设为每 3 个月，达标并稳定后设为 6 或 12 个月（在患者档案中修改）。</li><li>病程分析页的「参考结论」按 DAS28 变化 ≥ 0.6 判断改善 / 稳定 / 恶化；是否调整治疗由医生判断。</li></ul>`]] },
  { id: 'drugs', no: '04', title: '药物治疗路径', lead: 'csDMARD、bDMARD、tsDMARD 等治疗类别，以及研究记录时需要理解的关键概念。', refs: [7, 8], sections: [
    ['药物类别', tbl(['类别', '代表药物', '说明'], [
      ['csDMARD（传统合成）', '甲氨蝶呤（MTX）、来氟米特、柳氮磺吡啶、羟氯喹', 'MTX 为首选锚定药物；不耐受时可选其他 csDMARD'],
      ['bDMARD（生物制剂）', 'TNF 抑制剂（阿达木单抗、依那西普、英夫利昔单抗等）、IL-6 受体拮抗剂（托珠单抗）、阿巴西普、利妥昔单抗', '通常与 csDMARD 联用'],
      ['tsDMARD（靶向合成）', 'JAK 抑制剂（托法替布、巴瑞替尼、乌帕替尼）', '使用前需评估心血管、恶性肿瘤、血栓等风险因素'],
      ['糖皮质激素', '泼尼松等', '作为桥接治疗短期使用，并尽快减停']])],
    ['常见治疗路径（EULAR 2022）', `<ol><li>确诊后尽早开始 MTX（可短期联用糖皮质激素）。</li><li>未达标且存在不良预后因素时，加用 bDMARD 或 tsDMARD；无不良预后因素时可换用或联用其他 csDMARD。</li><li>一种 b/tsDMARD 失败后，可换用同类其他药物或不同作用机制的药物。</li><li>持续缓解后可考虑逐步减量。</li></ol>`],
    ['研究记录要点', `<ul><li>「治疗线数」：1 线为 csDMARD；首个生物 / 靶向药为 2 线；换用第二种生物 / 靶向药为 3 线。</li><li>开始、加量、减量、停药、重新启用分别记录，并注明原因（无效、不耐受、不良事件、患者意愿等）。</li></ul>`]] },
  { id: 'outcomes', no: '05', title: '疗效与功能评价', lead: '从疾病活动、疼痛、功能和患者报告结局多维理解疗效。', refs: [5, 9], sections: [
    ['常用工具', tbl(['工具', '范围', '含义'], [
      ['HAQ-DI（健康评估问卷残疾指数）', '0–3', '分数越高功能受限越重；下降 ≥ 0.22 通常视为有临床意义的改善'],
      ['疼痛 VAS', '0–100 mm', '患者自评疼痛程度'], ['患者 / 医生总体评价', '0–100 或 0–10', 'DAS28、CDAI、SDAI 的组成部分'], ['晨僵时间', '分钟', '炎症活动的辅助指标']])],
    ['ACR20 / 50 / 70', `<p>临床试验常用的改善标准：压痛关节数和肿胀关节数均改善 ≥ 20%（50%、70%），且以下 5 项中至少 3 项同等幅度改善：患者总体评价、医生总体评价、疼痛、HAQ、急性期反应物（CRP 或 ESR）。</p>`],
    ['解读提示', `<ul><li>炎症指标下降而疼痛、功能改善不明显时，需考虑已有的结构损伤、合并纤维肌痛或其他疼痛来源。</li><li>患者报告结局按问卷原始结果录入，不要由医生代为估计。</li></ul>`]] },
  { id: 'safety', no: '06', title: '安全性与特殊情况', lead: '实验室监测、不良事件、感染风险与特殊人群的相关知识。', refs: [7, 8], sections: [
    ['用药前筛查', `<ul><li>血常规、肝肾功能；乙型 / 丙型肝炎病毒筛查。</li><li>使用生物制剂或 JAK 抑制剂前筛查结核（如 IGRA 或结核菌素试验，结合胸部影像）。</li><li>按推荐接种疫苗（如流感、肺炎球菌；JAK 抑制剂使用者可考虑带状疱疹疫苗）。</li></ul>`],
    ['MTX 实验室监测（参考 ACR 建议）', tbl(['用药时间', '监测频率', '项目'], [['开始后 3 个月内', '每 2–4 周', '血常规、ALT / AST、肌酐'], ['3–6 个月', '每 8–12 周', '同上'], ['6 个月以后', '每 12 周', '同上']]) + `<p class="lt-note">MTX 通常同时补充叶酸以减少不良反应。</p>`],
    ['需关注的不良事件', `<ul><li>感染（含机会性感染、带状疱疹）、肝功能异常、血细胞减少。</li><li>JAK 抑制剂：带状疱疹、血脂升高、静脉血栓栓塞；高龄、吸烟、心血管高危人群需谨慎。</li><li>不良事件在「不良反应」模块记录，并注明对用药采取的措施；系统不自动推断因果。</li></ul>`],
    ['特殊人群', `<ul><li>妊娠 / 备孕：MTX、来氟米特需提前停用并按要求洗脱；妊娠期用药需与风湿科和产科共同决策。</li><li>老年、合并慢性肾病或间质性肺病者，药物选择与剂量需个体化。</li></ul>`]] }
];
const REFS = { 1: 'Aletaha D, et al. 2010 rheumatoid arthritis classification criteria. Arthritis Rheum. 2010;62(9):2569-2581.', 2: '中华医学会风湿病学分会. 2018 中国类风湿关节炎诊疗指南. 中华内科杂志. 2018;57(4):242-251.', 3: 'Prevoo ML, et al. Modified disease activity scores that include twenty-eight-joint counts. Arthritis Rheum. 1995;38(1):44-48.', 4: 'Aletaha D, Smolen J. The SDAI and the CDAI. Clin Exp Rheumatol. 2005;23(5 Suppl 39):S100-S108.', 5: 'Felson DT, et al. ACR/EULAR provisional definition of remission in RA for clinical trials. Arthritis Rheum. 2011;63(3):573-586.', 6: 'Smolen JS, et al. Treating RA to target: 2014 update. Ann Rheum Dis. 2016;75(1):3-15.', 7: 'Smolen JS, et al. EULAR recommendations for the management of RA: 2022 update. Ann Rheum Dis. 2023;82(1):3-18.', 8: 'Fraenkel L, et al. 2021 ACR guideline for the treatment of RA. Arthritis Care Res. 2021;73(7):924-939.', 9: 'Fries JF, et al. Measurement of patient outcome in arthritis. Arthritis Rheum. 1980;23(2):137-145.' };

document.addEventListener('DOMContentLoaded', () => {
  shell('learning');
  const t = TOPICS.find(x => x.id === queryParam('t')) || TOPICS[0], i = TOPICS.indexOf(t);
  document.title = `${t.title} · 学习中心 · 患者数据研究平台`;
  $('#lt-crumb').textContent = t.title;
  $('#lt-head').innerHTML = `<span class="lt-no">${t.no}</span><div><h1>${t.title}</h1><p>${t.lead}</p></div>`;
  $('#lt-toc').innerHTML = t.sections.map((s, k) => `<a href="#s${k}">${s[0]}</a>`).join('');
  $('#lt-body').innerHTML = t.sections.map((s, k) => `<section class="lt-section" id="s${k}"><h2>${s[0]}</h2>${s[1]}</section>`).join('') +
    `<section class="lt-section lt-refs"><h2>参考文献</h2><ol>${t.refs.map(r => `<li>${REFS[r]}</li>`).join('')}</ol><p class="lt-note">内容为指南与共识要点摘录，不替代原文，也不用于个体诊疗决策；上线前需由项目医学负责人审核。</p></section>`;
  const prev = TOPICS[i - 1], next = TOPICS[i + 1];
  $('#lt-pager').innerHTML = `${prev ? `<a href="learning-topic.html?t=${prev.id}">← ${prev.no} ${prev.title}</a>` : '<span></span>'}<a href="learning-center.html">返回学习中心</a>${next ? `<a href="learning-topic.html?t=${next.id}">${next.no} ${next.title} →</a>` : '<span></span>'}`;
});
