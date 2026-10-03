"use strict";

// 原页面的演示数据；接入接口时替换此文件的数据入口。
const NAMES = ["林书豪","王秀英","赵明远","李文静","陈海涛","周雅琴","孙志强","吴敏","郑国华","何小雨","徐建平","马丽娟","高鹏","罗雪梅","黄志伟","彭晓东"];
const CENTERS = ["北京协和医院","中日友好医院","北大人民医院","北京协和医院","上海仁济医院","中日友好医院","北大人民医院","上海仁济医院"];
const MISSING_ITEMS = ["缺 DAS28 评分","缺基线检验","缺合并疾病记录","缺用药史"];

const FOLLOWUPS = [
  { label: "7 日内待随访", n: "11", note: "含 6 位已逾期", warn: true },
  { label: "14 日内待随访", n: "19", note: "需提前电话确认", warn: false },
  { label: "30 日内待随访", n: "41", note: "占活跃患者 40%", warn: false },
  { label: "已完成本期随访", n: "62", note: "本季度计划内", warn: false }
];

const ABNORMAL = [
  { name: "炎症指标升高", n: 21, pct: 62 },
  { name: "血液学异常", n: 14, pct: 41 },
  { name: "肝功能异常", n: 8, pct: 24 },
  { name: "肾功能异常", n: 5, pct: 15 }
];

const DAS = [
  { label: "缓解 < 2.6", n: "44", pct: "34%", color: "#0b57d0" },
  { label: "低活动 2.6–3.2", n: "36", pct: "28%", color: "#5a8ce0" },
  { label: "中活动 3.2–5.1", n: "30", pct: "24%", color: "#9dbaee" },
  { label: "高活动 > 5.1", n: "18", pct: "14%", color: "#d6e2f8" }
];

const MISSING = [
  { name: "缺 DAS28 评分", n: 9 },
  { name: "缺基线检验结果", n: 7 },
  { name: "缺合并疾病记录", n: 4 },
  { name: "缺用药史", n: 3 }
];

const STUDY = [
  { name: "达到 12 个月随访", v: "68 人" },
  { name: "达到 24 个月随访", v: "31 人" },
  { name: "本季度新增访视", v: "54 次" }
];

const RISKS = [
  { id: "activity", name: "疾病活动度持续恶化", n: "8", level: "高", note: "连续两次 DAS28 上升且 ≥ 5.1" },
  { id: "critical", name: "检验危急值未处理", n: "5", level: "高", note: "含重度贫血与肝酶显著升高" },
  { id: "overdue", name: "随访逾期超 3 个月", n: "8", level: "中", note: "存在失访风险，建议电话随访" }
];

const NEW_ABNORMAL = [
  { name: "王秀英", item: "CRP 42.6 mg/L", date: "09/17" },
  { name: "赵明远", item: "ESR 78 mm/h", date: "09/16" },
  { name: "李文静", item: "血红蛋白 86 g/L", date: "09/15" },
  { name: "陈海涛", item: "ALT 121 U/L", date: "09/14" },
  { name: "周雅琴", item: "血小板 468 ×10⁹/L", date: "09/13" }
];

const NEW_VISITS = [
  { name: "林书豪", item: "第 6 次随访 · 已完成", date: "09/17" },
  { name: "孙志强", item: "第 3 次随访 · 已完成", date: "09/17" },
  { name: "吴敏", item: "第 9 次随访 · 已完成", date: "09/16" },
  { name: "郑国华", item: "建档 + 首次随访", date: "09/15" },
  { name: "何小雨", item: "第 2 次随访 · 已完成", date: "09/14" }
];


// 其他病史（演示数据）：部分患者合并 FM 纤维肌痛 / AS 强直性脊柱炎，其余为「无」。
function comorbidOf(i) {
  const codes = [[], ["FM"], [], ["AS"], ["FM"], [], ["FM", "AS"]][i % 7];
  const out = {};
  codes.forEach(code => {
    if (code === "FM") out.FM = {
      since: 2016 + (i % 8),
      status: ["症状稳定，间断加重", "近 3 个月疼痛加重", "症状控制良好"][i % 3],
      core: [`WPI ${7 + (i % 6)} · SSS ${5 + (i % 5)}`, ["睡眠障碍、疲劳", "疲劳、晨起僵硬感", "睡眠障碍、注意力下降"][i % 3]],
      treatment: ["度洛西汀 60 mg/日 + 有氧运动", "普瑞巴林 75 mg bid", "规律运动 + 认知行为治疗"][i % 3]
    };
    if (code === "AS") {
      const basdai = 2.1 + (i % 5) * 0.8;
      out.AS = {
        since: 2008 + (i % 10),
        status: basdai >= 4 ? "疾病活动（BASDAI ≥ 4）" : "低疾病活动",
        core: [`BASDAI ${basdai.toFixed(1)} · HLA-B27 阳性`, ["双侧骶髂关节炎 II 级（X 线）", "双侧骶髂关节炎 III 级，腰椎韧带骨赘", "MRI 骶髂关节骨髓水肿"][i % 3]],
        treatment: ["NSAIDs 按需", "阿达木单抗 40 mg q2w", "司库奇尤单抗 150 mg q4w"][i % 3]
      };
    }
  });
  return out;
}

const INITIAL_PATIENTS = Array.from({ length: 128 }, (_, i) => ({
  id: String(611991 + i * 17),
  name: NAMES[i % NAMES.length],
  center: CENTERS[i % CENTERS.length],
  phone: "138" + String(10000000 + i * 7919).slice(-8),
  identityNo: "110101" + String(19580101 + i * 10013).padStart(8, "0").slice(-8) + String(1000 + i).slice(-4),
  maritalStatus: ["已婚", "未婚", "离异", "丧偶"][i % 4],
  ethnicity: i % 9 === 0 ? "满族" : "汉族",
  sex: i % 3 === 0 ? "男" : "女",
  year: 1958 + ((i * 7) % 40),
  code: "RA-2026-" + String(101 + i * 3).padStart(4, "0"),
  subtype: null,
  das28: null, // 原文件没有患者级疾病分型依据或 DAS28 数值。
  visits: 1 + ((i * 3) % 9),
  last: "2026-" + String(1 + ((i * 5) % 9)).padStart(2, "0") + "-" + String(1 + ((i * 11) % 27)).padStart(2, "0"),
  due: i % 5 === 1,
  incomplete: i % 3 === 1 || i % 7 === 0,
  missing: MISSING_ITEMS[i % MISSING_ITEMS.length],
  abnormal: i < 34,
  lost: i === 0 || i >= 112,
  followCycle: [3, 6, 6, 12][i % 4], // 随访周期（月）：该患者按方案每几个月随访一次
  comorbid: comorbidOf(i)
}));

// 修改记录示例（演示）：展示建档、随访录入与更正、质控处理、档案修改、脱落标记等留痕方式。
// 本机新产生的记录保存在 common.js 的 store.audit 中，与这里的示例合并显示。
const SEED_AUDIT = {
  "611991": [
    { t: "2026-06-18T09:48:00", user: "王芳（研究协调员）", action: "标记脱落", detail: "随访状态：随访中 → 已脱落；脱落原因：失访（连续 2 次电话随访未联系上）" },
    { t: "2026-03-20T11:02:00", user: "陈医生（研究者）", action: "修改档案", detail: "随访周期：每 3 个月 → 每 6 个月；原因：连续 2 次评估处于低疾病活动" },
    { t: "2026-02-15T16:30:00", user: "王芳（研究协调员）", action: "修改档案", detail: "手机号：138****7919 → 139****2206；原因：患者更换联系方式" },
    { t: "2026-01-08T10:22:00", user: "李敏（数据管理员）", action: "质控处理", detail: "问题：生物制剂开始日期早于基线日期（逻辑冲突）；状态：待处理 → 已处理；生物制剂开始日期：2025-12-20 → 2026-01-05（核对原始病历后更正）" },
    { t: "2026-01-05T15:40:00", user: "李敏（数据管理员）", action: "质控发起", detail: "问题：ESR 158 mm/h 超出常见数据范围（异常值）；状态：新发现 → 待研究者核实" },
    { t: "2026-01-03T14:05:00", user: "陈医生（研究者）", action: "编辑随访", detail: "基线访视 2026-01-01；ESR：158 → 58 mm/h（录入笔误）；TJC28：6 → 5；患者总体评价：55 → 50" },
    { t: "2026-01-01T09:40:00", user: "陈医生（研究者）", action: "新增随访", detail: "第 1 次随访 · 2026-01-01 · 基线访视 · 填写 42 项" },
    { t: "2026-01-01T09:12:00", user: "陈医生（研究者）", action: "新建档案", detail: "林书豪 · RA-2026-0101 · 随访周期：每 3 个月" }
  ]
};
