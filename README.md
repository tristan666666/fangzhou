# 方洲AI MVP

这版已经不是单纯 demo 页面了，而是一套能继续长成平台的 MVP：

- 正式账号体系：支持 Supabase Auth
- 数据落库：任务、线索、会话消息都可进 Supabase
- 会话动作：支持发送回复、改单条状态、改处理方式
- 提醒系统：支持明天跟进、48 小时后提醒、自定义提醒
- 批量操作：支持批量改状态、批量改处理方式、批量推进
- 时间线联动：消息和状态动作会写进任务日志，并反映到执行页

## 当前技术栈

前端：

- React
- Vite

后端：

- Node.js
- Express

存储：

- 未配置时：内存模式
- 配置后：Supabase Postgres

部署：

- Render

## 当前模式

系统支持两种模式：

### 1. Demo 模式

- 没配 Supabase
- 继续使用 demo 登录
- 数据保存在内存里

### 2. 正式 MVP 模式

- 配了 Supabase
- 登录 / 注册走 Supabase Auth
- 任务、线索、会话、提醒落库

## 当前 API

- `GET /healthz`
- `GET /api/bootstrap`
- `POST /api/login`
- `POST /api/register`
- `GET /api/me`
- `GET /api/dashboard`
- `POST /api/tasks`
- `POST /api/tasks/:id/submit`
- `POST /api/tasks/:id/mark-refill`
- `POST /api/tasks/:id/refill`
- `POST /api/leads/:id/messages`
- `PATCH /api/leads/:id`
- `POST /api/leads/bulk-update`

## 当前已落库的数据

- 品牌
- 任务
- 任务状态
- 执行结果回填
- 任务日志
- 线索
- 会话消息
- 跟进提醒

## 当前已实现的业务动作

### 会话动作

- 发送回复
- 放入 AI 建议到输入框
- 更新线索状态
- 更新处理方式

### 提醒动作

- 明天跟进
- 48 小时后提醒
- 自定义提醒时间
- 自定义提醒备注
- 清除提醒

### 批量动作

- 批量改状态
- 批量改处理方式
- 批量设置下一步动作
- 批量设置提醒时间和备注

### 时间线联动

- 发回复会写进任务日志
- 改状态会写进任务日志
- 改处理方式会写进任务日志
- 批量动作会写进任务日志
- 执行页时间线直接读取任务日志

## 本地运行

安装依赖：

```bash
npm install
```

构建前端：

```bash
npm run build
```

启动服务：

```bash
npm run start
```

访问：

- [http://localhost:8787](http://localhost:8787)
- [http://localhost:8787/healthz](http://localhost:8787/healthz)

## 健康检查

你会看到：

- `storage: memory`
  说明当前还在 demo 内存模式

或者：

- `storage: supabase`
  说明已经接上 Supabase 数据库

## 配置 Supabase

### 1. 创建 Supabase 项目

先在 Supabase 后台创建一个项目。

### 2. 执行建表 SQL

在 Supabase SQL Editor 执行：

- [schema.sql](C:/Users/34159/Documents/Playground/fangzhou-workbench-demo/supabase/schema.sql)

### 3. 配置环境变量

复制环境变量模板：

```bash
copy .env.example .env
```

然后填下面 3 个值：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

模板在：

- [.env.example](C:/Users/34159/Documents/Playground/fangzhou-workbench-demo/.env.example)

说明：

- `SERVICE_ROLE_KEY` 给后端写库用
- `ANON_KEY` 给登录 / 注册流程用
- 这些都只放后端环境变量，不暴露到前端代码

### 4. 重启服务

重启后访问：

- [http://localhost:8787/healthz](http://localhost:8787/healthz)

如果返回里有：

```json
{"ok":true,"storage":"supabase",...}
```

就说明已经接好了。

## 当前登录方式

### Demo 模式

演示账号：

- 用户名：`demo@fangzhou.ai`
- 密码：`demo123`

### Supabase 模式

前端登录页会显示：

- 登录
- 注册

注册后会直接拿到 Supabase access token，并用于后续接口鉴权。

## Render 部署

项目已经带：

- [render.yaml](C:/Users/34159/Documents/Playground/fangzhou-workbench-demo/render.yaml)

部署到 Render 时，把这些环境变量加进去：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

Render 会自动执行：

- `npm install && npm run build`
- `npm run start`

## 当前产品能力边界

现在这版已经是“能推进业务的 MVP”，但还不是完整生产版。

还没正式接完的主要是：

- Supabase Auth 下的品牌/组织权限
- 更细的线索字段（报价、排期、历史合作等）
- 消息真正发送到 Gmail / Instagram DM / TikTok DM
- 定时器 / 到期提醒通知
- 更完整的批量筛选器

## 下一步最值得做的 3 件事

### 1. 品牌和成员体系

把用户、品牌、成员关系正式建起来。

### 2. 提醒通知

把“明天跟进 / 48 小时后提醒”变成真正通知：

- 站内提醒
- 邮件提醒
- 到期任务列表

### 3. 线索高级筛选

补这些维度：

- 平台
- 状态
- 处理方式
- 是否有提醒
- 粉丝量范围
- 匹配度范围

## 当前这一版的意义

现在这套系统已经从：

`任务 -> 看线索 -> 看会话`

推进到：

`任务 -> 选线索 -> 发消息 -> 改状态 -> 设提醒 -> 批量推进 -> 写时间线`

这已经是一个真正有业务推进感的 BD 平台骨架。
