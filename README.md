# 颜祖全案设计委托书

GitHub Pages 静态问卷。打开 `index.html` 时请使用 HTTP 服务，ES modules 不能通过 `file://` 加载。

## 导出与草稿

- 导出在本机生成，不上传答案或照片。PDF 由分段分页的高清画布组成，长文本会跨页，图片保持比例；中文使用浏览器系统字体。PDF 中的文字不能选择，复制文字请用「复制文字答卷」或「下载图文答卷」。
- 手机「下载 PDF」「打开 PDF」使用用户直接点击的链接；支持文件分享的浏览器同时显示「分享 PDF」。不依赖 `window.print()`。
- HTML 图文答卷内嵌照片，可离线打开；JSON 完整备份包含所有答案和照片，可导入其他设备。
- 自动保存优先使用 IndexedDB；不可用时尝试完整 localStorage 备份。保存失败会提示导出备份。既有 `yanzu-brief-draft-v1` 文字草稿会自动迁移。
- 照片最长边压缩到 1600 像素保存。旧版本未保存的照片无法恢复，需要重新上传。

## 文件结构

- `assets/questionnaire.js`：保留原发布版本的问卷内容和样式，仅替换状态、上传、导出组件；问卷仍使用 React。
- `assets/react-runtime.js`：从原发布文件提取的 React 19.2.6 生产运行时。
- `assets/brief-tools.js`：图片、自动保存、导出窗口和导入组件。
- `assets/brief-document.js`：备份校验、文本和图文答卷、分页 PDF。
- `assets/brief-tools.css`：新增控件样式。

原发布 bundle 保留以便追溯，但页面不再加载它。后续更新问卷时请修改 `questionnaire.js`，并更新 `index.html` 中的版本号。

## 回归验证

安装开发依赖和 Playwright 浏览器后运行 `npm test`。测试使用合成照片、独立浏览器上下文和本地 HTTP 服务，不接触客户数据。若使用已有 Chrome，可设置 `BROWSER_EXECUTABLE` 为浏览器可执行文件路径。

覆盖手机直接下载、旧草稿迁移、长文本 PDF 分页、照片刷新后恢复、跨设备导入、删除经历的照片归属，以及存储/剪贴板/分享/PDF 生成失败时的备用路径。测试输出在 `test-results/`，不发布。
