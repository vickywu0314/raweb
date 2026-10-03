/* guideline-kb.html（指南精华速查）页面脚本（依赖 boot.js → data.js → common.js → shared/guidelines-data.js） */
"use strict";
document.addEventListener('DOMContentLoaded', () => {
  shell('learning');
  const params = new URLSearchParams(location.search);
  const state = { q: params.get('q') || '', type: params.get('type') || '', guides: new Set((params.get('g') || '').split(',').filter(Boolean)), topic: params.get('topic') || '' };
  const TONE = { '国际推荐': 'intl', '西医指南': 'west', '中医指南': 'tcm', '中西医结合共识': 'mix' };
  const G = Object.fromEntries(GUIDELINES.map(g => [g.meta.id, g.meta]));
  const TOPIC_ORDER = ['诊断与分类', '治疗目标', '评估与监测', '治疗策略', 'csDMARD', 'b/tsDMARD', '糖皮质激素', '减停药', '中医辨证', '中药与中成药', '非药物治疗', '特殊人群', '合并症与安全', '其他'];
  const points = GUIDELINES.flatMap(g => g.points.map(p => ({ ...p, g: g.meta.id })));
  const cases = GUIDELINES.flatMap(g => g.cases.map(c => ({ ...c, g: g.meta.id })));
  const byId = Object.fromEntries(points.map(p => [p.id, p]));
  // 同义词：医生常用的不同说法
  const SYN = [['jak', 'jaki', 'jak抑制剂', '托法替布', '巴瑞替尼', '乌帕替尼'], ['激素', '糖皮质激素', 'gc', '泼尼松'], ['mtx', '甲氨蝶呤'], ['tnf', 'tnfi', 'tnf抑制剂', 'tnfα', '阿达木', '依那西普', '英夫利'], ['妊娠', '孕', '备孕', '哺乳', '生育'], ['减停', '减量', '停药', '逐渐减'], ['难治', 'd2t'], ['乙肝', 'hbv', '结核', '感染筛查'], ['雷公藤', '雷公藤多苷'], ['肺', 'ild', '间质性肺']];
  const expand = t => { const l = t.toLowerCase(); const s = SYN.find(g => g.some(x => l.includes(x) || x.includes(l))); return s ? [l, ...s] : [l]; };
  const terms = () => state.q.trim().split(/\s+/).filter(Boolean).map(expand);
  const hay = x => `${x.title} ${x.content || ''} ${x.scenario || ''} ${(x.steps || []).join(' ')} ${(x.keywords || []).join(' ')} ${x.topic || ''} ${x.grade || ''}`.toLowerCase();
  const match = x => terms().every(alts => alts.some(a => hay(x).includes(a)));
  const mark = s => { let h = escapeHTML(s); terms().flat().filter(t => t.length > 1).sort((a, b) => b.length - a.length).forEach(t => { h = h.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`); }); return h; };
  const src = (gid, page) => { const m = G[gid]; return `<a class="kb-src ${TONE[m.kind]}" href="${encodeURI(m.file)}#page=${page}" target="_blank" rel="noopener" title="打开原文 PDF 第 ${page} 页">${escapeHTML(m.short)} · PDF 第 ${page} 页 ↗</a>`; };

  // ---- 筛选项 ----
  const topicCount = {}; points.forEach(p => topicCount[p.topic] = (topicCount[p.topic] || 0) + 1);
  $('#f-guide').innerHTML = GUIDELINES.map(g => `<label class="kb-opt ${TONE[g.meta.kind]}"><input type="checkbox" value="${g.meta.id}"><i></i><span>${escapeHTML(g.meta.short)}<small>${escapeHTML(g.meta.kind)} · ${g.points.length} 条</small></span></label>`).join('');
  $('#f-topic').innerHTML = `<button type="button" data-topic="">全部主题<small>${points.length}</small></button>` + TOPIC_ORDER.filter(t => topicCount[t]).map(t => `<button type="button" data-topic="${t}">${t}<small>${topicCount[t]}</small></button>`).join('');
  $('#kb-hot').innerHTML = '<span>常搜：</span>' + ['JAK 风险', '激素桥接', '减停药', '难治性', '湿热痹阻', '雷公藤', '妊娠', '感染筛查'].map(t => `<button type="button" data-q="${t}">${t}</button>`).join('');
  $('#kb-sub').textContent = `${GUIDELINES.length} 部最新指南 · ${points.length} 条要点 · ${cases.length} 个治疗案例。推荐意见、关键阈值、用药与辨证要点，每条标注出处页码。`;

  function render() {
    const q = new URLSearchParams(); if (state.q) q.set('q', state.q); if (state.type) q.set('type', state.type); if (state.guides.size) q.set('g', [...state.guides].join(',')); if (state.topic) q.set('topic', state.topic);
    history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
    $('#kb-q').value = state.q;
    document.querySelectorAll('.kb-type button').forEach(b => b.classList.toggle('active', b.dataset.type === state.type));
    document.querySelectorAll('#f-guide input').forEach(i => i.checked = state.guides.has(i.value));
    document.querySelectorAll('#f-topic button').forEach(b => b.classList.toggle('active', b.dataset.topic === state.topic));
    const inG = x => !state.guides.size || state.guides.has(x.g);
    const P = state.type === 'case' ? [] : points.filter(p => inG(p) && (!state.topic || p.topic === state.topic) && match(p));
    const C = state.type === 'point' ? [] : cases.filter(c => inG(c) && (!state.topic || (c.refs || []).some(r => byId[r]?.topic === state.topic)) && match(c));
    $('#kb-count').innerHTML = `找到 <b>${P.length}</b> 条要点 · <b>${C.length}</b> 个案例${state.q ? `（关键词「${escapeHTML(state.q)}」）` : ''}`;
    const card = p => `<article class="kb-card" id="${p.id}"><div class="kb-card-head"><span class="kb-topic">${escapeHTML(p.topic)}</span>${p.grade && p.grade.length <= 18 ? `<span class="kb-grade" title="推荐强度 / 证据等级（按原文标注）">${mark(p.grade)}</span>` : ''}</div><h3>${mark(p.title)}</h3><p>${mark(p.content)}</p>${p.grade && p.grade.length > 18 ? `<div class="kb-grade-block"><b>推荐等级</b>${p.grade.split('；').map(x => `<span>${mark(x)}</span>`).join('')}</div>` : ''}<div class="kb-card-foot">${src(p.g, p.page)}<span class="kb-kw">${(p.keywords || []).map(k => `<button type="button" data-q="${escapeHTML(k)}">${escapeHTML(k)}</button>`).join('')}</span></div></article>`;
    const groups = TOPIC_ORDER.map(t => [t, P.filter(p => p.topic === t)]).filter(([, l]) => l.length);
    const pointsHTML = groups.map(([t, l]) => `<section class="kb-group"><h2>${t}<small>${l.length}</small></h2><div class="kb-list">${l.map(card).join('')}</div></section>`).join('');
    const caseHTML = C.length ? `<section class="kb-group kb-cases"><h2>治疗案例<small>${C.length}</small></h2><div class="kb-case-list">${C.map(c => `<article class="kb-case" id="${c.id}"><div class="kb-card-head"><span class="kb-topic case">案例 · 教学示意</span>${src(c.g, c.page)}</div><h3>${mark(c.title)}</h3><p class="kb-scn"><b>情境</b>${mark(c.scenario)}</p><ol>${c.steps.map(s => `<li>${mark(s)}</li>`).join('')}</ol>${(c.refs || []).length ? `<div class="kb-refs"><span>依据要点：</span>${c.refs.filter(r => byId[r]).map(r => `<a href="#${r}" data-ref="${r}">${escapeHTML(byId[r].title)}</a>`).join('')}</div>` : ''}</article>`).join('')}</div></section>` : '';
    $('#kb-results').innerHTML = (P.length || C.length) ? (state.type === 'case' ? caseHTML : pointsHTML + caseHTML) : `<div class="kb-empty"><h2>没有找到相关内容</h2><p>换个说法试试，例如「JAK」「激素」「减停」，或清空左侧筛选。</p></div>`;
  }

  // ---- 交互 ----
  let t; $('#kb-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; render(); }, 200); });
  $('#kb-form').addEventListener('submit', e => { e.preventDefault(); state.q = $('#kb-q').value; render(); });
  document.querySelector('.kb-type').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) { state.type = b.dataset.type; render(); } });
  $('#f-guide').addEventListener('change', e => { e.target.checked ? state.guides.add(e.target.value) : state.guides.delete(e.target.value); render(); });
  $('#f-topic').addEventListener('click', e => { const b = e.target.closest('[data-topic]'); if (b) { state.topic = b.dataset.topic; render(); } });
  $('#kb-clear').onclick = () => { state.q = ''; state.type = ''; state.topic = ''; state.guides.clear(); render(); };
  document.addEventListener('click', e => {
    const q = e.target.closest('[data-q]'); if (q) { state.q = q.dataset.q; render(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const r = e.target.closest('[data-ref]'); if (r) {
      e.preventDefault(); let el = document.getElementById(r.dataset.ref);
      if (!el) { state.q = ''; state.topic = ''; state.type = ''; render(); el = document.getElementById(r.dataset.ref); }
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('is-target'); void el.offsetWidth; el.classList.add('is-target'); }
    }
  });
  render();
});
