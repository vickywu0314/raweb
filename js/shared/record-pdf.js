/* 下载病历 PDF（患者详情「下载病历」、访视详情「下载本次病历」共用；依赖 common.js）
   内容：患者基础信息（POST /api/ra/patient/patientDetail 的 p）+ 最近一次随访（访视详情传入本次随访）的 7 个病历模块（POST /api/ra/visit/visitDetail）。
   做法：用 Canvas 按 A4 排版画出每一页（中文用系统字体，不依赖 PDF 字体），再用 jsPDF 拼成 PDF 直接下载。
   jsPDF 放在 js/vendor/，第一次点下载时才加载。 */
"use strict";

const RECORD_PDF_LIB = 'js/vendor/jspdf-2.5.1.umd.min.js';
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const old = document.querySelector(`script[data-src="${src}"]`);
    if (old) return old.dataset.loaded ? resolve() : old.addEventListener('load', resolve);
    const s = document.createElement('script'); s.src = src; s.dataset.src = src;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); }; s.onerror = () => reject(new Error('PDF 组件加载失败，请刷新页面重试'));
    document.head.appendChild(s);
  });
}

const pdfText = v => v == null || v === '' ? '—' : String(v);
// 病历内容 → 排版块：title / meta / h2 / h3 / h4 / grid（3 列键值）/ list（1 列键值）/ empty
function recordBlocks(p, v, isThisVisit) {
  const ab = a => !a || a.value == null ? '未检测' : `${a.value}（${a.statusLabel || ''}${a.visitDate ? `，${a.visitDate}` : ''}）`;
  const now = new Date(), stamp = `${ymd(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const cms = (p.comorbidities || []).map(c => `${c.code} ${c.name || ''}${c.sinceYear ? `（${c.sinceYear} 年起）` : ''}`).join('、');
  const blocks = [
    { t: 'title', text: `${p.name} · 病历` },
    { t: 'meta', text: `RA类风湿关节炎数据研究库 · 研究编号 ${pdfText(p.studyNo)} · ID号 ${p.patientId} · 导出时间 ${stamp}` },
    { t: 'h2', text: '患者基础信息' },
    { t: 'grid', rows: [
      ['姓名', p.name], ['性别', p.sex], ['出生年份 / 年龄', p.birthYear == null ? null : `${p.birthYear} 年 · ${p.age} 岁`],
      ['ID号', p.patientId], ['研究编号', p.studyNo], ['疾病分型', p.subtype || '待补充'],
      ['随访状态', p.followStatusLabel], ['手机号', p.mobile], ['身份证号', p.cardNoMasked],
      ['民族', p.nation], ['婚史', p.marryLabel], ['建档日期', p.createDate],
      ['确诊日期', p.confirmDate], ['发病时间', p.happenDate], ['随访周期', p.followCycle ? cycleLabel(p.followCycle) : null],
      ['ACR/EULAR 2010', p.acrEularScore == null ? '未评估' : `${p.acrEularScore} 分（${p.acrEularLabel || ''}）`],
      ['诊断结果告知', p.diagnosisInformed == null ? '未填写' : p.diagnosisInformed === 1 ? '已告知' : '未告知'],
      ['知情同意书', p.consentSigned == null ? '未填写' : p.consentSigned === 1 ? '已签订' : '未签订'],
      ['DAS28-CRP', p.latestDas28 == null ? null : `${p.latestDas28}${p.das28ActivityLabel ? `（${p.das28ActivityLabel}）` : ''}`],
      ['类风湿因子 RF', ab(p.rf)], ['抗CCP抗体', ab(p.ccp)],
      ['身高 (cm)', p.height], ['体重 (kg)', p.weight], ['BMI', p.bmi],
      ['腰围 (cm)', p.waistline], ['心率 (次/分)', p.heartRate], ['血压 (mmHg)', p.systolic || p.diastolic ? `${pdfText(p.systolic)} / ${pdfText(p.diastolic)}` : null],
      ['吸烟史', p.smoking], ['过敏史', p.allergy], ['家族史', p.familyHistory]
    ] },
    { t: 'list', rows: [['常见相关疾病', cms || '无'], ['其他病史', p.pastHistory]] }
  ];
  const which = isThisVisit ? '本次随访' : '最近一次随访';
  if (!v) { blocks.push({ t: 'h2', text: which }, { t: 'empty', text: '暂无随访记录' }); return blocks; }
  blocks.push({ t: 'h2', text: `${which}：${v.visitType || ''} · ${v.visitDate || '日期未填'}` },
    { t: 'meta', text: `记录医生：${v.doctorName || (v.doctorId ? `ID ${v.doctorId}` : '—')} · 已填 ${v.filledCount ?? '—'} / ${(v.modules || []).length} 个模块` });
  (v.modules || []).forEach(m => {
    blocks.push({ t: 'h3', text: m.title });
    let any = false;
    (m.groups || []).forEach(g => {
      const rows = (g.items || []).filter(it => (it.value != null && it.value !== '') || it.notChecked)
        .map(it => [it.label, it.notChecked ? '未查' : `${it.value}${it.unit ? ` ${it.unit}` : ''}`]);
      if (!rows.length) return;
      any = true;
      if (g.title) blocks.push({ t: 'h4', text: g.title });
      blocks.push({ t: 'list', rows });
    });
    if (!m.filled || !any) blocks.push({ t: 'empty', text: '本次未填写' });
  });
  return blocks;
}

// ===== Canvas 排版：A4（595×842pt）按 2.5 倍像素画，每页一张图 =====
const RP = { W: 595, H: 842, M: 36, S: 2.5, font: '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif' };
function recordPages(blocks) {
  const pages = [];
  let ctx, y;
  const newPage = () => {
    const c = document.createElement('canvas'); c.width = RP.W * RP.S; c.height = RP.H * RP.S;
    ctx = c.getContext('2d'); ctx.scale(RP.S, RP.S); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, RP.W, RP.H); ctx.textBaseline = 'top';
    pages.push(c); y = RP.M;
  };
  const font = (size, weight) => { ctx.font = `${weight || 400} ${size}px ${RP.font}`; };
  // 按字符折行（中文无空格）
  const wrap = (text, width, size, weight) => {
    font(size, weight); const out = [];
    String(text).split('\n').forEach(para => {
      let line = '';
      for (const ch of para) { if (line && ctx.measureText(line + ch).width > width) { out.push(line); line = ch; } else line += ch; }
      out.push(line);
    });
    return out;
  };
  const room = h => { if (y + h > RP.H - RP.M) newPage(); };
  const textLines = (lines, x, top, size, color, weight, lh) => { font(size, weight); ctx.fillStyle = color; lines.forEach((l, i) => ctx.fillText(l, x, top + i * lh)); };
  // 键值表：cols 组（标签+值）一行；标签列宽 labelW，值列平分剩余
  const table = (rows, cols, labelW) => {
    const full = RP.W - RP.M * 2, pair = full / cols, valW = pair - labelW, pad = 5, size = 9.5, lh = 13;
    for (let i = 0; i < rows.length; i += cols) {
      const cells = rows.slice(i, i + cols).map(([k, v]) => ({ k: wrap(k, labelW - pad * 2, size), v: wrap(pdfText(v), valW - pad * 2, size) }));
      const h = Math.max(...cells.map(c => Math.max(c.k.length, c.v.length))) * lh + pad * 2;
      room(h);
      cells.forEach((c, j) => {
        const x = RP.M + j * pair;
        ctx.fillStyle = '#f5f7fa'; ctx.fillRect(x, y, labelW, h);
        ctx.strokeStyle = '#dfe3ea'; ctx.lineWidth = 0.6; ctx.strokeRect(x, y, labelW, h); ctx.strokeRect(x + labelW, y, valW, h);
        textLines(c.k, x + pad, y + pad, size, '#55657a', 400, lh);
        textLines(c.v, x + labelW + pad, y + pad, size, '#1d2939', 400, lh);
      });
      y += h;
    }
  };
  newPage();
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    const keep = next && (next.t === 'grid' || next.t === 'list' || next.t === 'empty') ? 40 : 0;   // 标题不单独留在页底
    if (b.t === 'title') { const l = wrap(b.text, RP.W - RP.M * 2, 18, 600); textLines(l, RP.M, y, 18, '#1d2939', 600, 24); y += l.length * 24 + 2; }
    else if (b.t === 'meta') { const l = wrap(b.text, RP.W - RP.M * 2, 8.5); room(l.length * 12 + 6); textLines(l, RP.M, y, 8.5, '#667085', 400, 12); y += l.length * 12 + 6; }
    else if (b.t === 'h2') { y += 6; room(22 + keep); ctx.fillStyle = '#e4e7ec'; ctx.fillRect(RP.M, y, RP.W - RP.M * 2, 0.8); y += 8; textLines([b.text], RP.M, y, 13, '#0b57d0', 600, 16); y += 20; }
    else if (b.t === 'h3') { y += 6; room(20 + keep); textLines([b.text], RP.M, y, 12, '#0b57d0', 600, 15); y += 18; }
    else if (b.t === 'h4') { y += 2; room(16 + keep); textLines([b.text], RP.M, y, 10, '#344054', 600, 13); y += 15; }
    else if (b.t === 'grid') table(b.rows, 3, 86);
    else if (b.t === 'list') table(b.rows, 1, 150);
    else if (b.t === 'empty') { room(16); textLines([b.text], RP.M, y, 9.5, '#98a2b3', 400, 13); y += 16; }
  });
  // 页脚页码
  pages.forEach((c, i) => { const x = c.getContext('2d'); x.font = `400 8px ${RP.font}`; x.fillStyle = '#98a2b3'; x.textAlign = 'center'; x.fillText(`${i + 1} / ${pages.length}`, RP.W / 2, RP.H - 22); });
  return pages;
}

// 生成并下载：p 为 patientDetail 的返回；btn 为触发按钮（生成期间禁用）；visit 传了就用这次随访，否则取最近一次
// options.isCurrent 由页面绑定显示世代；撤权后任何迟到结果均不得下载或写回 UI。
async function downloadRecordPdf(p, btn, visit, options = {}) {
  const active = () => !!p && (!options.isCurrent || options.isCurrent());
  if (!active()) return;
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
  try {
    await loadScriptOnce(RECORD_PDF_LIB);
    if (!active()) return;
    const last = (p.visits || [])[0];
    const v = visit || (last ? await apiPost('/api/ra/visit/visitDetail', { doctorId: currentDoctorId(), patientId: p.patientId, visitId: last.visitId }) : null);
    if (!active()) return;
    const pages = recordPages(recordBlocks(p, v, !!visit));
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
    pages.forEach((c, i) => { if (i) pdf.addPage(); pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, RP.W, RP.H); });
    const name = `病历_${p.name}_${p.studyNo || p.patientId}${visit && v ? `_${v.visitDate || ''}` : ''}.pdf`;
    if (!active()) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(pdf.output('blob')); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast('病历 PDF 已生成');
  } catch (e) { if (active()) { console.error(e); toast(`生成病历失败：${e.message}`); } }
  finally { if (btn && active()) { btn.disabled = false; btn.textContent = label; } }
}
