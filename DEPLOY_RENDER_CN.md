# 方洲AI 正式上线步骤

这份说明只做一件事：
把现在本地可运行的 `fangzhou-workbench-demo` 正式上线到 Render。

上线完成后，你会得到一个固定网址，格式类似：

- `https://fangzhou-workbench-demo.onrender.com`

## 现在项目状态

这套项目已经准备好了这些东西：

- 已接入 Supabase
- 已接入 Supabase Auth
- 已有 Render 配置文件
- 已能本地运行

所以现在不是继续开发，而是做部署。

## 第 1 步：把项目传到 GitHub

Render 最稳的方式，是直接从 GitHub 拉代码。

你需要做的是：

1. 打开 GitHub
2. 新建一个仓库
3. 仓库名建议直接叫：
   - `fangzhou-workbench-demo`
4. 把这个文件夹上传上去：
   - `C:\Users\34159\Documents\Playground\fangzhou-workbench-demo`

注意：

- 不要上传 `.env`
- `.env` 已经在 `.gitignore` 里，正常不会被传上去

## 第 2 步：登录 Render

打开：

- [https://render.com/](https://render.com/)

登录后：

1. 点击 `New +`
2. 选择 `Web Service`
3. 连接你的 GitHub
4. 选择刚才上传的仓库：
   - `fangzhou-workbench-demo`

## 第 3 步：Render 会自动识别配置

项目里已经有这个文件：

- [render.yaml](C:/Users/34159/Documents/Playground/fangzhou-workbench-demo/render.yaml)

所以 Render 会自动用这些设置：

- Build Command：`npm install && npm run build`
- Start Command：`npm run start`
- Health Check：`/healthz`

## 第 4 步：在 Render 填环境变量

这是最关键的一步。

在 Render 项目的 `Environment` 里，填这 3 个：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

值就用你现在本地 `.env` 里的那三个。

不要把这些值发给别人。

## 第 5 步：点 Deploy

Render 开始部署后，等几分钟。

部署成功以后，你会拿到一个固定网址。

## 第 6 步：上线后检查

部署完先检查这两个地址：

1. 首页
2. `/healthz`

例如：

- `https://你的项目地址.onrender.com`
- `https://你的项目地址.onrender.com/healthz`

如果 `/healthz` 返回里有：

```json
{"ok":true,"storage":"supabase"}
```

就说明数据库已经接上了。

## 上线后你该怎么用

1. 打开正式网址
2. 注册账号
3. 登录
4. 创建任务
5. 查看任务、线索、会话、提醒

## 如果你想更正式

后面还可以继续做：

- 绑定你自己的域名
- 配品牌 Logo
- 配邮件通知
- 做 HTTPS 正式品牌站

但这些都不是现在上线的前提。

## 这次上线的最短结论

你现在只差两件事：

1. 把项目传到 GitHub
2. 在 Render 里连 GitHub 并填 3 个环境变量

做到这里，方洲AI 就正式上线了。
