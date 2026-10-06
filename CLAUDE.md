# raweb · RA 类风湿研究平台前端

纯 HTML / CSS / JS 静态页面，无需构建。本地运行：`npm install`（首次）→ `npm run dev`，打开 http://localhost:8090。后端工程：raapi（接口说明见 raapi 的 `docs/API.md`）。

## Git 协作规则（多人开发，必须遵守）

1. **开始改代码前先更新**：`git pull --rebase origin master`。
2. **提交前、推送前再更新一次**：`git pull --rebase origin master`，没有冲突再 `git push origin master`。
3. **有冲突时停下来**：不要用 `git push --force`、不要用 `git checkout --theirs/--ours` 整个文件覆盖别人的改动。逐处看清双方改了什么、合并后保证两边的改动都保留；拿不准就先问，不要自己决定丢掉哪一边。
4. **只提交自己改的文件**：`git add` 具体文件，不要 `git add -A` 把别人未提交的、本地临时文件一起带上；提交前 `git status` / `git diff --cached` 看一遍。
5. **一次提交只做一件事**，提交说明用中文写清楚改了什么、为什么。
6. **永远不要强推 master**，不要改写已经推送的历史（rebase / amend 已推送的提交）。

## 约定

- 文件三层结构：`css|js/common.*` 全站通用；`css|js/shared/*` 2–3 个页面共用；`css|js/pages/<页面>.*` 单页专属。
- 调后端用 `js/common.js` 的 `apiPost`（表单参数）/ `apiPostJson`（JSON 请求体），后端地址只改 `API_BASE`。
- 当前医生 ID 用 `currentDoctorId()`（登录信息里的 doctorId）。
- 改了 js / css 后，把引用它的 html 里的 `?v=` 版本号加 1，避免浏览器缓存旧文件。
- 尚未接入后端的按钮：提示「开发中」，不要只改本机演示数据冒充保存成功。
