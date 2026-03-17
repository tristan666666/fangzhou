import fs from 'node:fs'
import os from 'node:os'
import { chromium } from 'playwright-core'

const API_URL = process.env.FZ_API_URL || 'http://localhost:8787'
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

const TASK_STATUS = {
  running: '执行中',
  success: '执行成功',
  failed: '执行失败',
}

const connectorConfig = {
  username: process.env.FZ_DEMO_USERNAME || 'demo@fangzhou.ai',
  password: process.env.FZ_DEMO_PASSWORD || 'demo123',
  brandId: process.env.FZ_DEMO_BRAND_ID || 'brand-demo-1',
  deviceName: `${os.hostname()}-local-connector`,
  version: '0.1.0',
}

const state = {
  token: '',
  connectorId: '',
  browserAvailable: false,
  runningTask: false,
}

function findBrowserPath() {
  return CHROME_PATHS.find((item) => fs.existsSync(item)) || ''
}

async function request(pathname, options = {}, token = '') {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || `REQUEST_FAILED_${response.status}`)
  }

  return response.json()
}

async function pushLogs(taskId, messages) {
  await request(
    `/api/tasks/${taskId}/logs`,
    {
      method: 'POST',
      body: JSON.stringify({
        entries: messages.map((message) => ({
          level: 'info',
          message,
        })),
      }),
    },
    state.token,
  )
}

async function updateStatus(taskId, status, error = null) {
  await request(
    `/api/tasks/${taskId}/status`,
    {
      method: 'POST',
      body: JSON.stringify({ status, error }),
    },
    state.token,
  )
}

async function executeTask(task) {
  const executablePath = findBrowserPath()
  if (!executablePath) {
    throw new Error('LOCAL_BROWSER_NOT_FOUND')
  }

  await updateStatus(task.id, TASK_STATUS.running)
  await pushLogs(task.id, [
    '浏览器执行环境已启动。',
    `准备访问 ${task.params.targetUrls.length} 个页面。`,
  ])

  const browser = await chromium.launch({
    headless: true,
    executablePath,
  })

  const pages = []

  try {
    for (const targetUrl of task.params.targetUrls) {
      await pushLogs(task.id, [`正在打开页面：${targetUrl}`])
      const page = await browser.newPage({
        viewport: { width: 1400, height: 900 },
      })

      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      })
      await page.waitForTimeout(1500)

      const extracted = await page.evaluate(() => {
        const collect = (selector) =>
          [...document.querySelectorAll(selector)]
            .map((item) => item.textContent?.trim())
            .filter(Boolean)
            .slice(0, 5)

        const title = document.title || 'Untitled'
        const headings = [...new Set([...collect('h1'), ...collect('h2'), ...collect('h3')])].slice(0, 5)
        const snippet = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1000)

        return { title, headings, snippet }
      })

      const screenshotBuffer = await page.screenshot({
        type: 'png',
        fullPage: false,
      })

      pages.push({
        url: targetUrl,
        title: extracted.title,
        headings: extracted.headings,
        snippet: extracted.snippet,
        screenshotDataUrl: `data:image/png;base64,${screenshotBuffer.toString('base64')}`,
      })

      await pushLogs(task.id, [`页面抓取完成：${extracted.title}`])
      await page.close()
    }

    await request(
      `/api/tasks/${task.id}/result`,
      {
        method: 'POST',
        body: JSON.stringify({ pages }),
      },
      state.token,
    )

    await updateStatus(task.id, TASK_STATUS.success)
  } finally {
    await browser.close()
  }
}

async function heartbeat() {
  if (!state.token || !state.connectorId) {
    return
  }

  await request(
    `/api/connectors/${state.connectorId}/heartbeat`,
    {
      method: 'POST',
      body: JSON.stringify({
        browserAvailable: state.browserAvailable,
        version: connectorConfig.version,
      }),
    },
    state.token,
  )
}

async function claimLoop() {
  if (!state.token || !state.connectorId || state.runningTask) {
    return
  }

  const response = await request(
    `/api/connectors/${state.connectorId}/claim`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    state.token,
  )

  if (!response.task) {
    return
  }

  state.runningTask = true

  try {
    await executeTask(response.task)
  } catch (error) {
    await pushLogs(response.task.id, [`任务执行失败：${error.message}`]).catch(() => {})
    await updateStatus(response.task.id, TASK_STATUS.failed, error.message).catch(() => {})
  } finally {
    state.runningTask = false
  }
}

async function boot() {
  state.browserAvailable = Boolean(findBrowserPath())

  const login = await request('/api/connector/login', {
    method: 'POST',
    body: JSON.stringify({
      ...connectorConfig,
      browserAvailable: state.browserAvailable,
    }),
  })

  state.token = login.token
  state.connectorId = login.connector.id

  console.log(`Connector online: ${login.connector.deviceName} -> ${API_URL}`)
  console.log(`Browser available: ${state.browserAvailable}`)

  await heartbeat()

  setInterval(() => {
    heartbeat().catch((error) => console.error('Heartbeat failed:', error.message))
  }, 5000)

  setInterval(() => {
    claimLoop().catch((error) => console.error('Claim loop failed:', error.message))
  }, 2000)
}

boot().catch((error) => {
  console.error('Connector boot failed:', error.message)
  process.exitCode = 1
})
