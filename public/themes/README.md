# 首页主题包规范

每个主题使用独立目录，目录名必须与 `theme.json` 中的 `id` 一致，并且只能使用小写字母、数字和连字符。

```text
public/themes/theme-id/
├── theme.json
├── index.html
├── theme.css
└── preview.png
```

`theme.json` 字段：

- `id`：主题唯一标识。
- `name`：后台展示名称。
- `description`：适用场景说明。
- `version`：主题版本。
- `contractVersion`：首页公共运行时协议版本，当前为 `2`。
- `scene`：后台主题标签。
- `entry`：主题 HTML 入口，必须位于当前主题目录内。
- `previewImage`：后台卡片预览图，建议使用 `1280×720` PNG。
- `isDefault`：只允许一个主题设为 `true`。
- `pageSettings`：该主题支持的首页文案设置定义；不需要后台配置时可不声明或使用空字段数组。

`pageSettings.fields` 中每个字段支持：

- `key`：主题内唯一配置键，使用小驼峰命名。
- `label`：后台表单标签。
- `defaultValue`：该主题自己的默认文案。
- `required`：是否必填，默认 `true`。
- `maxLength`：最大字符数，默认 `60`，上限 `200`。
- `description`：可选的表单说明。

主题只负责页面结构和样式。询盘、成交、成员、目标、音乐、庆祝动画和 SSE 实时数据继续使用 `/public/js/` 下的公共业务脚本，不得在主题目录中复制业务逻辑。

需要配置文案的元素添加 `data-theme-setting="字段 key"`；同一个字段可以挂载到多个元素。不声明的字段不会出现在后台，也不会修改主题 HTML 中的默认文案。

新主题应从 `classic-red` 复制 DOM 数据挂载点，保留 `data-theme-id`、`/js/theme-runtime.js` 和现有公共脚本，再替换页面布局与主题样式。后台预览路由会话鉴权保护，预览模式会自动禁音；只有点击“启用主题”才会更改线上首页。
