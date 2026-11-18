# 朝阳园产业园区地图

在朝阳区全域画幅上叠加园区点、区块和区界，配置专题样式，并按印刷尺寸或指定像素导出 PNG／JPG。浏览器在本地读取使用者导入的矢量文件。项目可另行配置受口令保护的默认图层。

[打开在线工作台](https://cy-industrial-parks-mapping.pages.dev/)

## 本地运行

```sh
npm ci
npm run dev
```

Vite 默认监听本机 5173 端口。工作台打开时载入开放预览底图和参考区界。通用代码使用明确标记的示例专题，配置了默认业务图层的工作台会载入相应的园区数据。导入业务图层后，工作台自动移除示例，保留使用者已经导入的其他图层。

## 协作修改

责任规划师及同事可在 GitHub 公开访问本仓库，以 MIT 许可 Fork 并修改源码。用示例图层本地验收后，可向原仓库提交 Pull Request。实际园区数据经工作台口令访问。部署凭据由 Cloudflare 管理。

## 导入和成图

- 支持 GeoJSON、Shapefile 和 GeoPackage 点、线、面。Shapefile 可选择 ZIP，也可一次选择同名 SHP、DBF、PRJ、CPG 等文件。GeoPackage 中可读取多张矢量表。界面按文件声明识别坐标系，也接受 EPSG、WKT 或 PROJ 的显式定义。常用 WGS84、Web Mercator 和 CGCS2000 高斯克吕格定义已内置。使用北京地方坐标时，先按项目口径转换为 WGS84。
- 点击“图层”设置名称字段、分类字段、点形状、大小、颜色与描边。点名默认单行，可选择最多 2 至 6 行、左中右对齐、行距或固定方向。自动标注先尝试近处方向，空间紧张时尝试用短引线连接。网页与出图使用相同的点名排布规则。“朝阳区行政区界”图层可独立调线色、线宽、线型和不透明度。区块可按存储六位十六进制色值的字段填色。
- 点击地图上的园区点或示意区块可查看属性。在地图顶部搜索园区名称、地址或产业关键词，点击候选或用方向键和回车定位。仅有区县级参考位置的项目会标明“位置待核”，选择后打开台账详情。
- 工具栏左侧可收起制图面板。右上角可一键切换明暗界面，也可在“外观设置”选择自动跟随底图。外观设置还支持主题色、透明度、高斯模糊与实色模式。点图层可从“分类色系”统一配色，再逐类调整颜色和符号。地图上的“定位当前位置”使用设备定位，“返回朝阳区全域”恢复制图范围。
- 点击“版式”调整图名、图例和指北针。分类图例可复用当前分类字段和配色。编号名录按唯一编号字段联动图面编号和侧边名录，字段缺失或重复时按图层顺序自动编号。文字、符号、分栏、排序、背景和版位可配置。在“预览与导出”里可直接拖动图例框和图名框，拖框的右下角调整大小，标题可加副标题。预览工具提供放大、缩小、拖动平移和适合窗口。
- 图纸标题支持字体、对齐、阴影和描边。图例标题可独立选择字体、字号与颜色。地图框四边可输入到纸边的毫米距离，留空时沿用自动版式。
- 默认 A1 竖版为 594 × 841 毫米、300 DPI、7016 × 9933 像素。预设另含 A0 竖版、240 DPI。也可输入纸张宽高或直接编辑像素，界面按所选 DPI 显示印刷尺寸。导出重新绘制地图与整张图纸，写入 PNG／JPG 分辨率元数据。成图会保留完整朝阳区范围，包括分离图斑。大画幅受设备的 WebGL 和图像编码能力约束。地图画布分辨率因设备降低时，工作台会在导出结果中提示。

## 底图和标注

| 来源 | 可用底图 |
| --- | --- |
| Esri | Light Gray、Dark Gray、Streets、Topo（含地形晕渲） |
| CARTO | Positron、Dark Matter、Voyager |
| OpenFreeMap | 浅色与深色开放预览 |
| 天地图 | 矢量底图与中文注记，由官方 WMTS 提供图像切片 |

Esri 与 CARTO 底图用各自的浏览器 API key。点击“底图凭据”填写后访问供应商矢量服务，密钥保留在当前页面会话中。生产部署可用 `ESRI_BROWSER_API_KEY`、`CARTO_BROWSER_API_KEY` 和 `TIANDITU_BROWSER_TK` 三个可选 Cloudflare Secret，由通过口令的浏览器自动载入。应在供应商账户内将浏览器 key 的权限及来源域名限定到这个工作台。Esri 使用 Basemap Styles 服务，浏览器 key 须具有 `premium:user:basemaps` 权限。底图采用供应商服务直接供图。 [Esri 底图文档](https://developers.arcgis.com/rest/basemap-styles/) · [CARTO 矢量底图](https://github.com/CartoDB/basemap-styles)

Esri 请求简体中文地名。各供应商的地名字段经过汉字和标点检查，缺少可辨中文名时保留几何图形并留空标注。重点地名可调字体、字号、文字颜色和描边。建筑、绿地、水系、道路等可按组及具体样式层控制。主次道路可分别改色。默认使用低饱和的开放浅色底图和简洁地名。分组与详细标注层均可滑动调整标注密度，密度较低时优先保留主要路名、地名和水系。字号按印刷 pt 输入。底图中文地名的实际覆盖取决于样式、缩放和数据源。“底图 → 注记范围”可将底图文字和天地图独立注记限制在朝阳区及其沿界注记余量内，网页与导出共用这项设置。天地图使用球面墨卡托 WMTS 的 `vec_w` 和 `cva_w`，中文注记可开关，底图字形和道路颜色由供应商绘制。 [天地图地图服务](https://lbs.tianditu.gov.cn/server/MapService.html)

默认朝阳区界来自 OpenStreetMap 关系 2988933，由两部分组成，按 ODbL 1.0 分发。它用于取景和参考，正式出图可在“底图”中替换为指定的朝阳区面数据。 [区界数据来源](https://www.openstreetmap.org/relation/2988933) · [OpenStreetMap 许可](https://www.openstreetmap.org/copyright)

## 交给 Coding Agent 继续出图

通过“配置”保存或应用出图 JSON。配置保存底图样式、区界样式、图层字段与配色、画幅和版式。浏览器导入的业务图层可按图层名称在再次导入后匹配样式。开发者可给配置文件的图层项添加同源 `src` 字段，指向部署中获准提供的 GeoJSON。

- `src/project.ts` 定义配置读取与校验，`src/model.ts` 定义字段、默认值和分类逻辑。
- `src/map/basemap.ts` 注册矢量底图，并设置地名与道路分组。
- `src/map/compose.ts` 叠加点线面，`src/map/sheet.ts` 绘制带版式的成图。
- `src/data/import.worker.ts` 在浏览器后台线程读取本地矢量文件。

## Cloudflare 部署

`pages/` 配置 Pages 入口，并通过服务绑定调用负责口令和静态资源的 Worker。旧 Workers 首页跳转到 Pages。更新工作台用 `npm run deploy`。修改 Pages 入口配置时用 `npm run deploy:pages`。 [Pages 服务绑定](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)

`npm run build` 生成 `dist/`。Worker 先校验口令会话，再提供工作页和静态资源。部署时需在 Cloudflare 配置 `WORKSPACE_PASSCODE` 与独立的 `WORKSPACE_SESSION_KEY`。后者使用至少 32 字符的随机值。首次部署可使用 Wrangler 的 `--secrets-file` 指定保存在 Git 之外的临时秘密配置文件。 [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) · [静态资源路由](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)

工作台从 `public/workspace-data/project.json` 读取可选的默认项目配置。该目录在 Git 中忽略，构建时作为静态资源提供，由 Cloudflare Worker 统一校验口令会话。图层可通过 `where` 指定字段和文本值，复用同一份 GeoJSON 形成多个可控图层。

项目源码采用 MIT 许可。参考区界、在线切片与字体分别沿用原许可。思源黑体和思源宋体的 SIL OFL 许可随构建产物一并提供。

This product includes color specifications and designs developed by Cynthia Brewer (http://colorbrewer.org/). [ColorBrewer 许可](./public/licenses/ColorBrewer.txt)
