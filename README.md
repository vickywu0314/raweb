# RA 患者数据研究平台 · 前端原型（v1.1）

直接用浏览器打开 `index.html`，会进入登录页，无需 npm 或构建。

## 登录（演示版）

- `login.html`：用户名 + 密码登录，不开放注册，账号由项目管理员开通。
- 演示账号：`chen / ra2026`（陈医生 · 研究者）、`admin / ra2026`（李敏 · 数据管理员）。
- 勾选「记住我」后 30 天内免登录，并记住用户名；不勾选时关闭浏览器即退出。
- 未登录访问任何页面都会跳到登录页，登录后回到原页面。退出按钮在右上角账号旁边。
- 登录状态由 `js/boot.js` 管理，账号写在 `js/pages/login.js`。接入后端后，这两处改为登录接口和服务端会话。

## 页面

| 分组 | 页面 | 说明 |
|---|---|---|
| 概览 | `projects.html` 项目总览、`dashboard.html` 数据看板 | 看板数字由患者数据实时计算，风险卡片可查看名单 |
| 患者 | `patients.html` 患者列表 | 筛选、数据完整性、其他病史（FM / AS）、数据导出 |
| | `patient-create.html` 新建患者 | 8 个模块（基本信息 + 7 个病例模块，共 120 个病例字段）；常见相关疾病 FM / AS；草稿存本机 |
| | `patient-edit.html?id=` 编辑档案 | 基本信息、出生日期、常见相关疾病、**随访周期（每 3 / 6 / 12 个月）**，逐项留痕 |
| | `patient-visits.html?id=` 患者详情 | 基本信息、随访周期与下次随访、随访时间线、修改记录、**标记脱落** |
| | `visit-create.html?id=` 新增随访 / `&visit=` 编辑随访 | 基本信息只读；7 个病例模块可填写和再次编辑；用药、不良事件可多行；DAS28 自动计算 |
| | `visit-detail.html?id=&visit=` 访视详情 | 7 个模块 + 本次录入内容；**删除本次随访**（需填原因） |
| | `patient-insight.html?id=` 病程分析 | 参考结论着色、疾病历程（可筛选）、治疗响应、相似患者、智能洞察 |
| 研究执行 | `followups.html` 随访管理 | 按「上次随访 + 随访周期」推算下次随访；单选患者新增随访 |
| | `data-quality.html` 数据质控 | 点击问题定位到病历位置；可标记已处理 |
| 智能分析 | `ai-analysis.html` / `ai-cohort.html` / `ai-chat.html` | AI 入口、队列分析、研究数据对话 |
| 帮助与学习 | `data-guide.html` 使用指南、`learning-center.html` + `learning-topic.html?t=` 学习中心 | 任务式操作指南、录入规范、FAQ；6 个 RA 知识专题 |
| | `guideline-kb.html` 指南精华速查 | 4 部最新指南的要点与治疗案例，可按指南 / 主题 / 关键词检索；原文 PDF 在 `guides/` |
| 底部 | `system-guide.html` v1.0 更新亮点 | 本次更新 + 平台亮点 |

## 文件结构（三层）

- `css/common.css`、`js/common.js`（外加 `js/boot.js`、`js/data.js`）：全站通用。
- `css/shared/*`、`js/shared/*`：2–3 个页面共用的模块。
  - `crf-schema`：**病例字段定义（CRF）唯一来源**，表单按它渲染，保存的数据结构 = 后端接口 JSON。改字段只改这里。
  - `case-form`：病例录入表单的渲染、读写、草稿（本机）、多行组与自动计算。
  - `qc-rules`：质控规则（演示），数据质控页与项目总览共用。
  - `patient-list`：列表页样式。
  - `ai-analytics`：分析数据、筛选、统计、图表。
- `css/pages/<页面>.css`、`js/pages/<页面>.js`：单页专属。
- `css/_unused.css`：历史无引用样式，仅留档，不加载。
- `docs/`：后端对接材料。`后端接口说明-一期-v0.2.xlsx`（以此为准）；`crf-dictionary-v1.1.csv/.json` 病例字段（由 crf-schema.js 导出）；`example-*.json` 请求示例；`openapi.yaml` 为 v0.1 草稿，待按 v0.2 同步。
- `guides/`：指南原文 PDF。要点数据在 `js/shared/guidelines-data.js`；新增指南时，把 PDF 放入 `guides/`，再在数据文件里追加一项。

## 数据说明（演示版）

- 患者基础数据在 `js/data.js`。DAS28、治疗、CRP 等分析字段由 `js/shared/ai-analytics.js` 按规则生成，页面标注「演示数据」。
- 新建患者、新增 / 编辑随访、编辑档案、质控处理和修改记录，都保存在**当前浏览器的 localStorage** 中（`js/common.js` 的 `store`），刷新后仍在。
- 使用指南 → 常见问题中可以「清空本机演示数据」。
- 接入后端时：把 `store` 的读写和 `data.js` 替换为接口；AI 部分替换 `parseQuestion`、`buildInsights` 和对话页的 `answer()`。

## 版本

侧栏「v1.0 更新亮点」的版本号在 `js/common.js` 的 `APP_VERSION` 中修改。
