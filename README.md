# 朝阳园产业园区地图

在朝阳区全域画幅上叠加园区点、区块和区界，配置专题样式，并按印刷尺寸或指定像素导出 PNG／JPG。浏览器读取本地矢量文件，项目业务资料保存在使用者设备上。

## 本地运行

```sh
npm ci
npm run dev
```

Vite 默认监听本机 5173 端口。工作台打开时载入开放预览底图、参考区界和明确标记的示例专题。导入业务图层后，工作台自动移除示例，保留使用者已经导入的其他图层。

## 导入和成图

- 支持 GeoJSON、Shapefile 和 GeoPackage 点、线、面。Shapefile 可选择 ZIP，也可一次选择同名 SHP、DBF、PRJ、CPG 等文件。GeoPackage 中可读取多张矢量表。界面按文件声明识别坐标系，也接受 EPSG、WKT 或 PROJ 的显式定义。常用 WGS84、Web Mercator 和 CGCS2000 高斯克吕格定义已内置。使用北京地方坐标时，先按项目口径转换为 WGS84。
- 点击“图层”设置名称字段、分类字段、点形状、大小、颜色与描边。线、面及朝阳区界有各自的线型、宽度、透明度或颜色控制。区块可按存储六位十六进制色值的字段填色。
- 点击“版式”调整图名、图例和指北针。分类图例可复用当前分类字段和配色。编号名录按唯一编号字段联动图面编号和侧边名录，字段缺失或重复时按图层顺序自动编号。文字、符号、分栏、排序、背景和版位可配置。在“预览与导出”里可直接拖动图例框和图名框，拖框的右下角调整大小，标题可加副标题。
- 默认 A1 竖版为 594 × 841 毫米、300 DPI、7016 × 9933 像素。预设另含 A0 竖版、240 DPI。也可输入纸张宽高或直接编辑像素，界面按所选 DPI 显示印刷尺寸。导出重新绘制地图与整张图纸，写入 PNG／JPG 分辨率元数据。成图会保留完整朝阳区范围，包括分离图斑。大画幅受设备的 WebGL 和图像编码能力约束。地图画布分辨率因设备降低时，工作台会在导出结果中提示。

## 底图和标注

| 来源 | 矢量样式 |
| --- | --- |
| Esri | Light Gray、Dark Gray、Streets |
| CARTO | Positron、Dark Matter、Voyager |
| OpenFreeMap | 浅色与深色开放预览 |

Esri 与 CARTO 底图用各自的浏览器 API key。点击“底图凭据”填写后访问供应商矢量服务，密钥保留在当前页面会话中。生产部署可在供应商账户内为浏览器 key 配置域名限制。底图采用供应商服务直接供图。 [Esri 底图文档](https://developers.arcgis.com/rest/basemap-styles/) · [CARTO 矢量底图](https://github.com/CartoDB/basemap-styles)

Esri 请求简体中文地名。各供应商的地名字段经过汉字和标点检查，缺少可辨中文名时保留几何图形并留空标注。重点地名可调字体、字号、文字颜色和描边。建筑、绿地、水系、道路等可按组及具体样式层控制。主次道路可分别改色。默认使用低饱和的开放浅色底图和简洁地名。分组与详细标注层均可滑动调整标注密度，密度较低时优先保留主要路名、地名和水系。字号按印刷 pt 输入。底图中文地名的实际覆盖取决于样式、缩放和数据源。

默认朝阳区界来自 OpenStreetMap 关系 2988933，由两部分组成，按 ODbL 1.0 分发。它用于取景和参考，正式出图可在“底图”中替换为指定的朝阳区面数据。 [区界数据来源](https://www.openstreetmap.org/relation/2988933) · [OpenStreetMap 许可](https://www.openstreetmap.org/copyright)

## 交给 Coding Agent 继续出图

通过“配置”保存或应用出图 JSON。配置保存底图样式、区界样式、图层字段与配色、画幅和版式。浏览器导入的业务图层可按图层名称在再次导入后匹配样式。开发者可给配置文件的图层项添加同源 `src` 字段，指向部署中获准提供的 GeoJSON。

- `src/project.ts` 定义配置读取与校验，`src/model.ts` 定义字段、默认值和分类逻辑。
- `src/map/basemap.ts` 注册矢量底图，并设置地名与道路分组。
- `src/map/compose.ts` 叠加点线面，`src/map/sheet.ts` 绘制带版式的成图。
- `src/data/import.worker.ts` 在浏览器后台线程读取本地矢量文件。

## Cloudflare Workers

`npm run build` 生成 `dist/`。部署配置让 Worker 先校验口令会话，再提供工作页和静态资源。部署时需在 Cloudflare 配置 `WORKSPACE_PASSCODE` 与独立的 `WORKSPACE_SESSION_KEY`。后者使用至少 32 字符的随机值。首次部署可使用 Wrangler 的 `--secrets-file` 指定保存在 Git 之外的临时秘密配置文件。 [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) · [静态资源路由](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)

项目源码采用 MIT 许可。参考区界、在线切片与字体分别沿用原许可。思源黑体和思源宋体的 SIL OFL 许可随构建产物一并提供。
