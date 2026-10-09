/* raweb mock server —— 无外部依赖，直接 `npm run mock` 启动
   - API mock : http://localhost:8065  （raweb 依赖 raapi 的 13 个接口，对照 raapi/docs/API.md）
   - 静态托管 : http://localhost:8090  （raweb 站点本体，等价于 http-server . -p 8090）
   数据：首次启动用 mock/seed.js 生成确定性演示数据，之后突变（建档/编辑/删除/导出申请）
   持久化到 mock/db.json，删除该文件即可重置。 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const seed = require("./seed");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(__dirname, "db.json");
const API_PORT = 8065;
const STATIC_PORT = 8090;
const DOCTOR = { doctorId: 82394, doctorName: "陈医生" };

// ---------- 数据 ----------
function loadDb() {
  if (fs.existsSync(DB_PATH)) {
    try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch (e) { /* 损坏则重建 */ }
  }
  const patients = seed.buildPatients();
  const db = { patients, audit: [], exportApplications: [], studySeq: patients.length };
  saveDb(db);
  return db;
}
function saveDb(db) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db)); } catch (e) { console.error("db 写入失败：", e.message); }
}
const db = loadDb();

// ---------- 工具 ----------
function ok(data) {
  return { success: true, code: "200", message: "成功", data, dataList: null, page: null, params: null, dataMap: null };
}
function fail(code, message) { return { success: false, code: String(code), message, data: null, dataList: null, page: null, params: null, dataMap: null }; }
function readBody(req) {
  return new Promise(resolve => {
    let s = ""; req.on("data", c => (s += c)); req.on("end", () => resolve(s));
  });
}
// 支持查询串与 urlencoded 两种入参（apiPost 用表单体，页面跳转也可能带查询串）
async function readParams(req, url) {
  const p = Object.fromEntries(url.searchParams.entries());
  const body = await readBody(req);
  if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
    try { return { ...p, ...(body ? JSON.parse(body) : {}) }; } catch (e) { return { ...p, __badJson: true }; }
  }
  for (const [k, v] of new URLSearchParams(body).entries()) p[k] = v;
  return p;
}
const num = v => (v == null || v === "" ? null : Number(v));
const byId = id => db.patients.find(p => p.patientId === Number(id));
const byVisit = vid => {
  for (const p of db.patients) { const v = p.visits.find(x => x.visitId === Number(vid)); if (v) return [p, v]; }
  return [null, null];
};
function recordAudit(patientId, visitId, action, detail, operator) {
  db.audit.unshift({
    time: new Date().toISOString().slice(0, 16).replace("T", " "),
    action, visitId: visitId == null ? null : visitId, detail,
    operator: operator || `${DOCTOR.doctorName}（研究者）`
  });
}
const FREE_MONTHS = 6;
function freeStartDate() {
  const d = new Date(); d.setMonth(d.getMonth() - FREE_MONTHS); d.setDate(1);
  return seed.ymd(d);
}

// ---------- 模块展开（visitDetail / visitEditForm 共用骨架） ----------
const MODULE_META = [
  ["bsbq", "病史病情", "bsbq"], ["fzjc", "辅助检查", "fzjc"], ["bqpg", "病情评估", "bqpg"],
  ["zyzd", "中医诊断", "zyzd"], ["zlfa", "治疗方案", "zlfa"], ["blsj", "不良反应", "blsj"], ["bblsj", "不良事件", "bblsj"]
];
const FIELD_LABELS = {
  bsbq: { chiefComplaint: "主诉", presentHistory: "现病史" },
  fzjc: { xuechen: "血沉", cfydb: "C反应蛋白", lfsyz: "类风湿因子", note: "备注" },
  bqpg: { zhengzhuangScore: "肿胀关节数", yachuangScore: "压痛关节数", patientScore: "患者总体评价", crpScore: "DAS28-CRP", haqScore: "HAQ 评分", doctorFeel: "医生小结" },
  zyzd: { zyzz: "中医证型" },
  zlfa: { westernMedicine: "西药", chineseMedicine: "中成药" }
};
const FIELD_UNITS = { fzjc: { xuechen: "mm/h", cfydb: "mg/L", lfsyz: "IU/mL" }, bqpg: { crpScore: "", haqScore: "分" } };
function moduleFilled(col, data) {
  if (data == null) return false;
  if (typeof data === "string") return data.trim() !== "";
  return Object.values(data).some(v => v != null && v !== "" && !(Array.isArray(v) && !v.length));
}
function flatItems(col, data) {
  const labels = FIELD_LABELS[col] || {};
  const units = FIELD_UNITS[col] || {};
  const out = [];
  const walk = (obj, pre) => Object.entries(obj || {}).forEach(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) return walk(v, pre ? `${pre}.${k}` : k);
    if (v == null || v === "") return;
    out.push({ key: pre ? `${pre}.${k}` : k, label: labels[k] || k, value: Array.isArray(v) ? v.join("、") : String(v), unit: units[k] || "", notChecked: false });
  });
  walk(data, "");
  return out;
}
function visitTypeOf(p, v) {
  const baseline = p.visits.slice().sort((a, b) => a.visitDate.localeCompare(b.visitDate))[0];
  return baseline && baseline.visitId === v.visitId ? "基线访视" : "常规随访";
}
function visitDetailData(p, v) {
  return {
    visitId: v.visitId, patientId: p.patientId, visitDate: v.visitDate,
    visitType: visitTypeOf(p, v), baseline: visitTypeOf(p, v) === "基线访视",
    doctorId: v.doctorId, doctorName: v.doctorName,
    filledCount: MODULE_META.filter(([col]) => moduleFilled(col, v.modules[col])).length,
    modules: MODULE_META.map(([key, title, col]) => {
      const data = v.modules[col];
      return {
        key, title, column: col, filled: moduleFilled(col, data),
        groups: moduleFilled(col, data) ? [{ title: "", items: flatItems(col, data) }] : [],
        tables: [], images: [], record: typeof data === "string" ? data : null, recordDate: null
      };
    })
  };
}
function visitEditFormData(p, v) {
  return {
    visitId: v.visitId, visitDate: v.visitDate, visitType: visitTypeOf(p, v), version: v.version,
    modules: MODULE_META.map(([key, title, col]) => {
      const data = v.modules[col];
      const structured = data && typeof data === "object";
      return {
        key, title, column: col,
        editable: structured,
        record: structured ? null : (data || ""),
        groups: structured ? Object.keys(data).map(gk => ({
          title: FIELD_LABELS[col] && FIELD_LABELS[col][gk] ? "" : gk,
          fields: Object.entries(data[gk] || {}).map(([k, val]) => ({
            key: `${gk}.${k}`, label: (FIELD_LABELS[col] && FIELD_LABELS[col][k]) || k,
            unit: (FIELD_UNITS[col] && FIELD_UNITS[col][k]) || "", type: "text",
            value: Array.isArray(val) ? val.join("、") : (val == null ? "" : String(val)),
            wx: null
          }))
        })) : [],
        tables: [], images: [], others: []
      };
    })
  };
}

// ---------- 路由 ----------
const routes = {
  // 一、项目总览
  "POST /api/ra/project/projectsData": () => {
    const N = db.patients.length;
    const tracking = db.patients.filter(p => !p.lost).length;
    const [, days] = [null, null];
    const pending = db.patients.filter(p => { const [d, n] = seed.nextDue(p); return !p.lost && d && n < 0; }).length;
    const qc = db.patients.reduce((s, p) => s + p.missing.length, 0);
    return ok({
      enrolledPatients: N,
      followUpCompletionRate: N ? +(60 + (N % 30)).toFixed(1) : 0,
      followUpDueCount: tracking, followUpDoneCount: Math.max(0, tracking - pending),
      dataQualityRate: N ? +(((N - db.patients.filter(p => p.incomplete).length) / N) * 100).toFixed(1) : 0,
      centerCount: 1,
      trackingPatients: tracking, totalPatients: N,
      trackingRate: N ? +((tracking / N) * 100).toFixed(1) : 0,
      pendingFollowUpPatients: pending,
      pendingQcIssues: qc,
      qcIssuePatients: db.patients.filter(p => p.incomplete).length,
      researchUsableRecords: db.patients.reduce((s, p) => s + p.visits.length, 0)
    });
  },

  // 二、患者列表
  "POST /api/ra/patient/patientsList": q => {
    const page = Math.max(1, num(q.page) || 1);
    const size = Math.min(200, Math.max(1, num(q.size) || 20));
    let items = db.patients.map(seed.publicPatient);
    if (q.keyword) {
      const k = q.keyword.toLowerCase();
      items = items.filter(p => p.name.toLowerCase().includes(k) || String(p.patientId).includes(k) || (p.studyNo || "").toLowerCase().includes(k));
    }
    const STATUS = ["active", "soon", "overdue", "pending_first", "withdrawn"];
    if (q.followStatus) {
      if (!STATUS.includes(q.followStatus)) return fail(400, `随访状态不正确：${q.followStatus}`);
      items = items.filter(p => p.followStatus === q.followStatus);
    }
    if (q.completeness) {
      if (!["complete", "missing"].includes(q.completeness)) return fail(400, `数据完整性不正确：${q.completeness}`);
      items = items.filter(p => (q.completeness === "missing") === p.incomplete);
    }
    items.sort((a, b) => (b.lastVisitDate || "0000").localeCompare(a.lastVisitDate || "0000"));
    const total = items.length;
    const slice = items.slice((page - 1) * size, page * size);
    slice.forEach(x => delete x._nextDueDays);
    return ok({
      totalPatients: db.patients.length,
      incompleteCount: db.patients.filter(p => p.incomplete).length,
      total, page, size, items: slice
    });
  },

  // 三、患者详情
  "POST /api/ra/patient/patientDetail": q => {
    const p = byId(q.patientId);
    if (!p) return fail(403, "患者不存在，或不在您名下");
    const pub = seed.publicPatient(p);
    const [nd, ndDays] = seed.nextDue(p);
    const visits = p.visits.slice().sort((a, b) => b.visitDate.localeCompare(a.visitDate));
    return ok({
      ...pub,
      withdrawReason: p.withdrawal ? `失访（${p.withdrawal.note}） · ${p.withdrawal.date}` : null,
      mobile: p.mobile, cardNoMasked: p.cardNo ? `**** **** **** ${p.cardNo.slice(-4)}` : null, hasCardNo: !!p.cardNo,
      nation: p.nation, marry: p.marry, marryLabel: ["未婚", "已婚", "离异", "丧偶"][p.marry] || null,
      createDate: p.createDate, followStartDate: p.followStartDate,
      confirmDate: p.confirmDate, happenDate: p.happenDate,
      nextDueDays: ndDays,
      height: p.height, weight: p.weight,
      bmi: p.height ? +((p.weight / Math.pow(p.height / 100, 2)).toFixed(1)) : null,
      acrEularScore: p.acrEularScore,
      acrEularLabel: p.acrEularScore == null ? null : p.acrEularScore >= 6 ? "符合 RA 分类" : "暂不符合 RA 分类",
      waistline: null, heartRate: null, systolic: null, diastolic: null,
      smoking: "不吸烟", allergy: "无", familyHistory: null, pastHistory: null,
      visits: visits.map(v => ({
        visitId: v.visitId, visitDate: v.visitDate, visitType: visitTypeOf(p, v),
        baseline: visitTypeOf(p, v) === "基线访视", doctorId: v.doctorId, doctorName: v.doctorName
      }))
    });
  },
  "POST /api/ra/patient/patientSensitive": q => {
    const p = byId(q.patientId);
    if (!p) return fail(403, "患者不存在，或不在您名下");
    return ok(p.cardNo || null);
  },
  "POST /api/ra/patient/auditLogs": q => {
    const p = byId(q.patientId);
    if (!p) return fail(403, "患者不存在，或不在您名下");
    return ok(db.audit.filter(a => a.patientId === p.patientId || a.patientId == null).map(({ patientId, ...rest }) => rest));
  },

  // 四、访视
  "POST /api/ra/visit/visitDetail": q => {
    const [p, v] = byVisit(q.visitId);
    if (!v) return fail(403, "随访记录不存在，或患者不在您名下");
    return ok(visitDetailData(p, v));
  },
  "POST /api/ra/visit/visitEditForm": q => {
    const [p, v] = byVisit(q.visitId);
    if (!v) return fail(403, "随访记录不存在，或患者不在您名下");
    return ok(visitEditFormData(p, v));
  },
  "POST /api/ra/visit/updateVisit": q => {
    const [p, v] = byVisit(q.visitId);
    if (!v) return fail(403, "随访记录不存在，或患者不在您名下");
    if (String(q.version) !== String(v.version)) return fail(409, "数据已被修改，请刷新后重新编辑");
    if (!q.visitDate) return fail(400, "请填写随访日期");
    let changed = 0;
    const changes = [];
    if (q.visitDate !== v.visitDate) { changes.push(`随访日期：${v.visitDate} → ${q.visitDate}`); v.visitDate = q.visitDate; changed++; }
    const mods = q.modules || {};
    for (const [col, m] of Object.entries(mods)) {
      if (!v.modules[col] || typeof v.modules[col] !== "object") continue;
      for (const [gk, fields] of Object.entries((m && m.fields) || {})) {
        if (v.modules[col][gk] == null || typeof v.modules[col][gk] !== "object") continue;
        for (const [k, val] of Object.entries(fields)) {
          const old = v.modules[col][gk][k];
          if (String(old == null ? "" : old) !== String(val == null ? "" : val)) {
            changes.push(`${col}.${gk}.${k}：${old == null ? "空" : old} → ${val == null ? "空" : val}`);
            v.modules[col][gk][k] = val; changed++;
          }
        }
      }
    }
    v.version = (v.version || 1) + 1;
    if (changed) {
      recordAudit(p.patientId, v.visitId, "编辑随访", changes.join("；") || "修改随访内容");
      saveDb(db);
    }
    return ok({ changedCount: changed, changes });
  },
  "POST /api/ra/visit/deleteVisit": q => {
    const [p, v] = byVisit(q.visitId);
    if (!v) return fail(403, "随访记录不存在，或患者不在您名下");
    if (!q.reason || !String(q.reason).trim()) return fail(400, "请填写删除原因");
    p.visits = p.visits.filter(x => x.visitId !== v.visitId);
    recordAudit(p.patientId, v.visitId, "删除随访", `${visitTypeOf(p, v)} ${v.visitDate}；删除原因：${q.reason}`);
    saveDb(db);
    return ok(p.patientId);
  },

  // 五、导出
  "POST /api/ra/export/range": () => ok({
    freeStartDate: freeStartDate(), today: seed.ymd(seed.today()),
    freeMonths: FREE_MONTHS, mailConfigured: false
  }),
  "POST /api/ra/export/visitsCsv": q => {
    if (q.startDate && q.startDate < freeStartDate()) return fail("NEED_APPLY", "开始日期超过半年，需要提交申请");
    const rows = [["患者ID", "研究编号", "姓名", "性别", "出生年份", "年龄", "随访ID", "随访日期", "访视类型", "DAS28-CRP"]];
    for (const p of db.patients) {
      for (const v of p.visits) {
        if (q.startDate && (v.visitDate < q.startDate || v.visitDate > (q.endDate || "9999"))) continue;
        const d28 = v.modules.bqpg && v.modules.bqpg.result ? v.modules.bqpg.result.crpScore : null;
        rows.push([p.patientId, p.studyNo, p.name.slice(0, 1) + "**", p.sex, p.birthYear, p.age, v.visitId, v.visitDate, visitTypeOf(p, v), d28 == null ? "" : d28]);
      }
    }
    const csv = "﻿" + rows.map(r => r.join(",")).join("\n");
    return { __raw: csv, type: "text/csv;charset=utf-8" };
  },
  "POST /api/ra/export/apply": q => {
    if (!q.reason || !String(q.reason).trim()) return fail(400, "请填写申请原因 / 用途");
    const id = `EA-${Date.now()}`;
    db.exportApplications.push({ id, ...q });
    saveDb(db);
    return ok(id);
  },

  // 六、建档
  "POST /api/ra/patient/checkCardNo": q => {
    const card = (q.cardNo || "").trim().toUpperCase();
    if (!card) return ok({ result: "NEW" });
    if (!/^\d{15}(\d{2}[0-9X])?$/.test(card)) return fail(400, "身份证号格式不正确");
    const p = db.patients.find(x => (x.cardNo || "").toUpperCase() === card);
    if (!p) return ok({ result: "NEW" });
    return ok({ result: "MINE", patientId: p.patientId, name: p.name });
  },
  "POST /api/ra/patient/createPatient": q => {
    const b = q.basic || {};
    if (!b.name) return fail(400, "请填写患者姓名");
    if (!b.gender) return fail(400, "请选择性别");
    const card = (b.cardNo || "").trim().toUpperCase();
    if (card) {
      const exist = db.patients.find(x => (x.cardNo || "").toUpperCase() === card);
      if (exist) {
        if (q.transfer === true || q.transfer === "true") {
          recordAudit(exist.patientId, null, "转入名下", `从其他医生转入（演示 mock 无原医生概念）`);
          saveDb(db);
          return ok({ patientId: exist.patientId, studyNo: exist.studyNo, action: "transferred" });
        }
        return fail(409, `该患者已在您名下（${exist.name}，ID号 ${exist.patientId}）`);
      }
    }
    db.studySeq = (db.studySeq || 0) + 1;
    const id = 100000 + db.studySeq;
    const birthYear = card && card.length === 18 ? +card.slice(6, 10) : null;
    const p = {
      patientId: id, name: b.name, gender: +b.gender, sex: +b.gender === 1 ? "男" : "女",
      birthYear, age: birthYear ? new Date().getFullYear() - birthYear : null,
      cardNo: card || null, mobile: b.mobile || null, nation: b.nation || null,
      marry: b.marry == null ? null : +b.marry,
      studyNo: `RA-${seed.ymd(seed.today()).replace(/-/g, "")}-${seed.pad(db.studySeq, 5)}`,
      followCycle: +b.followCycle || 12,
      followStartDate: null, createDate: seed.ymd(seed.today()),
      confirmDate: b.confirmDate || null, happenDate: b.happenDate || null,
      height: num(b.height), weight: num(b.weight),
      acrEularScore: b.acrEular ? (b.acrEular.jointScore || 0) + (b.acrEular.serologyScore || 0) + (b.acrEular.durationScore || 0) + (b.acrEular.acuteScore || 0) : null,
      lost: false, withdrawal: null, visits: [], missing: ["缺基线检验", "缺合并疾病记录", "缺用药史"], incomplete: true
    };
    db.patients.push(p);
    recordAudit(id, null, "新建档案", `${p.name} · ${p.studyNo} · 随访周期：每 ${p.followCycle} 个月`);
    saveDb(db);
    return ok({ patientId: id, studyNo: p.studyNo, action: "created" });
  }
};

// ---------- API 服务 ----------
const apiServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${API_PORT}`);
  const key = `${req.method} ${url.pathname}`;
  const handler = routes[key];
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!handler) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify(fail(404, `mock 未实现：${key}`))); return; }
  try {
    const params = await readParams(req, url);
    const out = handler(params);
    if (out && out.__raw) {
      res.writeHead(200, { "Content-Type": out.type });
      res.end(out.__raw);
    } else {
      res.writeHead(200, { "Content-Type": "application/json;charset=UTF-8" });
      res.end(JSON.stringify(out));
    }
  } catch (e) {
    console.error(e);
    res.writeHead(200, { "Content-Type": "application/json;charset=UTF-8" });
    res.end(JSON.stringify(fail(500, `mock 内部错误：${e.message}`)));
  }
});

// ---------- 静态托管（等价 http-server . -p 8090） ----------
const MIME = { ".html": "text/html;charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".csv": "text/csv" };
const staticServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${STATIC_PORT}`);
  let fp = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (fp.includes("..")) { res.writeHead(403); res.end(); return; }
  if (!fp) fp = "index.html";
  const full = path.join(ROOT, fp);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain;charset=utf-8" });
    res.end("404 Not Found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
});

apiServer.listen(API_PORT, () => console.log(`[mock] raapi 接口  → http://localhost:${API_PORT}`));
staticServer.listen(STATIC_PORT, () => console.log(`[mock] raweb 站点 → http://localhost:${STATIC_PORT}/index.html`));
console.log("[mock] 演示数据见 mock/db.json，删除该文件重置；Ctrl+C 退出");
