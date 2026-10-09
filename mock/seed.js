/* mock 演示数据种子（确定性生成，重启不变；突变会落到 db.json）
   字段口径对照 raapi/docs/API.md：患者列表 §2.1、患者详情 §3.1、访视 §4.x。 */
"use strict";

const DAY = 864e5;
const today = () => new Date(new Date().toDateString());
const ymd = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY);
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

const SURNAMES = ["林", "王", "赵", "李", "陈", "周", "孙", "吴", "郑", "何", "徐", "马"];
const GIVEN = ["书豪", "秀英", "明远", "文静", "海涛", "雅琴", "志强", "敏", "国华", "小雨", "建平", "丽娟"];
const pad = (n, w) => String(n).padStart(w, "0");

// 随访模块模板：7 个病历模块（column 为老系统字段名）
function visitModules(seed, withDas28, withLab) {
  const rnd = n => (seed * 37 + n * 101) % 100;
  const bqpg = {
    result: {
      zhengzhuangScore: 2 + (rnd(1) % 5),      // 肿胀关节数
      yachuangScore: 3 + (rnd(2) % 6),         // 压痛关节数
      patientScore: 30 + (rnd(3) % 50),        // 患者总体评价
      crpScore: withDas28 ? +(2 + (rnd(4) % 60) / 10).toFixed(2) : null,
      haqScore: +(rnd(5) % 30) / 10
    },
    doctorFeel: "患者一般情况稳定，按计划完成本次随访。"
  };
  const fzjc = withLab ? {
    xuechen: 10 + (rnd(6) % 60),               // ESR
    cfydb: +(2 + (rnd(7) % 80) / 10).toFixed(1), // CRP
    lfsyz: rnd(8) % 3 === 0 ? null : String(20 + (rnd(9) % 180)), // RF
    note: "检验结果已核对"
  } : null;
  return {
    bsbq: {
      chiefComplaint: "双手关节疼痛伴晨僵",
      presentHistory: "关节肿痛间断加重，活动后减轻。",
      followDate: ""
    },
    fzjc: fzjc,
    bqpg: withDas28 ? bqpg : { doctorFeel: bqpg.doctorFeel },
    zyzd: { zyzz: ["风湿痹阻证", "寒湿痹阻证"][rnd(10) % 2] },
    zlfa: {
      westernMedicine: "甲氨蝶呤 15 mg 每周一次",
      chineseMedicine: "尪痹片 4 片 每日三次"
    },
    blsj: null,
    bblsj: null
  };
}

function buildPatients() {
  const patients = [];
  const t = today();
  for (let i = 0; i < 18; i++) {
    const birthYear = 1958 + (i * 7) % 40;
    const age = new Date().getFullYear() - birthYear;
    const id = 10001 + i;
    const gender = i % 3 === 0 ? 1 : 2;
    const visitsN = i % 6 === 5 ? 0 : 1 + (i * 3) % 5;
    const cycle = [3, 6, 6, 12][i % 4];
    const lost = i === 17;
    const cardNo = `110101${birthYear}${pad(1 + (i * 5) % 12, 2)}${pad(1 + (i * 13) % 28, 2)}${pad(1000 + i, 4)}`;

    const visits = [];
    let last = null;
    for (let v = 0; v < visitsN; v++) {
      // 最后一次访视的位置控制随访状态分布：偶数患者近期随访（active/soon），奇数患者逾期
      const lastShift = v === visitsN - 1
        ? (i % 2 === 1 ? -(cycle * 30 + 15 + (i * 5) % 10) : (i % 4 === 2 ? -(cycle * 30 - 10) : -((i * 3) % 10)))
        : 0;
      const date = ymd(addDays(addDays(addMonths(t, -cycle * (visitsN - 1 - v)), -((i * 3 + v * 7) % 20)), lastShift));
      const isBaseline = v === 0;
      const withDas28 = !(i % 4 === 1 && v === 0);   // 制造缺 DAS28
      const withLab = !(i % 5 === 2 && v === 0);     // 制造缺基线检验
      visits.push({
        visitId: id * 100 + v,
        patientId: id,
        visitDate: date,
        doctorId: 82394,
        doctorName: "陈医生",
        version: 1,
        modules: visitModules(i * 10 + v, withDas28, withLab)
      });
      last = date;
    }

    const das28s = visits.map(v => v.modules.bqpg && v.modules.bqpg.result && v.modules.bqpg.result.crpScore).filter(Boolean);
    const latestDas28 = das28s.length ? Math.max(...das28s) : null;
    const nextDue = lost || !last ? null : ymd(addMonths(last, cycle));
    const nextDueDays = nextDue ? Math.round((new Date(nextDue) - t) / DAY) : null;
    let followStatus = "active";
    if (lost) followStatus = "withdrawn";
    else if (!visitsN) followStatus = "pending_first";
    else if (nextDueDays < 0) followStatus = "overdue";
    else if (nextDueDays <= 14) followStatus = "soon";

    const missing = [];
    if (!das28s.length && visitsN) missing.push("缺 DAS28 评分");
    if (visitsN && visits[0] && !visits[0].modules.fzjc) missing.push("缺基线检验");
    if (i % 7 === 3) missing.push("缺合并疾病记录");
    if (i % 9 === 4) missing.push("缺用药史");

    patients.push({
      patientId: id,
      name: SURNAMES[i % 12] + GIVEN[i % 12],
      gender,
      sex: gender === 1 ? "男" : "女",
      birthYear,
      age,
      cardNo,
      mobile: "138" + pad(10000000 + i * 7919, 8),
      nation: i % 9 === 0 ? "满族" : "汉族",
      marry: i % 4,
      studyNo: `RA-${ymd(t).replace(/-/g, "")}-${pad(1 + i, 5)}`,
      followCycle: cycle,
      followStartDate: visitsN ? visits[0].visitDate : ymd(addDays(t, -30 * (i + 1))),
      createDate: ymd(addDays(t, -120 - i * 7)),
      confirmDate: ymd(addDays(t, -400 - i * 30)),
      happenDate: ymd(addDays(t, -700 - i * 30)),
      height: 155 + (i * 3) % 30,
      weight: 50 + (i * 7) % 35,
      acrEularScore: i % 3 === 0 ? 7 : null,
      lost,
      withdrawal: lost ? { reason: "lost", note: "连续 2 次电话随访未联系上", date: ymd(addDays(t, -20)) } : null,
      visits,
      missing,
      incomplete: missing.length > 0,
      linkedStudyReady: false
    });
  }
  return patients;
}

// 把内部存储形态展开成 API.md 的出参形态
function das28Of(p) {
  const scores = p.visits.map(v => v.modules.bqpg && v.modules.bqpg.result && v.modules.bqpg.result.crpScore).filter(Boolean);
  return scores.length ? Math.max(...scores) : null;
}
function activity(d) {
  if (d == null) return [null, null];
  return d < 2.6 ? ["remission", "临床缓解"] : d <= 3.2 ? ["low", "低疾病活动度"] : d <= 5.1 ? ["moderate", "中疾病活动度"] : ["high", "高疾病活动度"];
}
function lastVisitDate(p) { return p.visits.length ? p.visits[p.visits.length - 1].visitDate : null; }
function nextDue(p) {
  if (p.lost) return [null, null];
  const last = lastVisitDate(p);
  if (!last) return [null, null];
  const d = ymd(addMonths(last, p.followCycle));
  return [d, Math.round((new Date(d) - today()) / DAY)];
}
function followStatusOf(p) {
  const [d, days] = nextDue(p);
  if (p.lost) return ["withdrawn", "已脱落"];
  if (!p.visits.length) return ["pending_first", "待首次随访"];
  if (days < 0) return ["overdue", "随访逾期"];
  if (days <= 14) return ["soon", "近期需随访"];
  return ["active", "随访中"];
}
function publicPatient(p) {
  const d28 = das28Of(p);
  const [act, actLabel] = activity(d28);
  const [nd, ndDays] = nextDue(p);
  const [fs, fsLabel] = followStatusOf(p);
  const lv = lastVisitDate(p);
  return {
    patientId: p.patientId, name: p.name, gender: p.gender, sex: p.sex,
    birthYear: p.birthYear, age: p.age, studyNo: p.studyNo,
    visitCount: p.visits.length, followCycle: p.followCycle,
    subtype: d28 != null ? "血清阳性" : null,
    rf: { status: "high_positive", statusLabel: "高滴度阳性", value: "86", uln: 20.0, visitDate: lv },
    ccp: { status: "untested", statusLabel: "未检测", value: null, uln: 25.0, visitDate: null },
    latestDas28: d28, das28Activity: act, das28ActivityLabel: actLabel,
    comorbidities: [],
    lastVisitDate: lv, nextDueDate: nd,
    followStatus: fs, followStatusLabel: fsLabel,
    incomplete: p.incomplete,
    missingItems: p.missing,
    _nextDueDays: ndDays
  };
}

module.exports = { buildPatients, publicPatient, das28Of, activity, lastVisitDate, nextDue, followStatusOf, ymd, today, pad };
