import { useEffect, useMemo, useState } from 'react'
import './app.css'

const navItems = [
  { id: 'overview', label: '总览' },
  { id: 'tasks', label: '任务' },
  { id: 'assets', label: '资产' },
  { id: 'conversations', label: '会话' },
  { id: 'brand', label: '品牌资料' },
  { id: 'channels', label: '通道状态' },
  { id: 'settings', label: '设置' },
]

const quickExamples = [
  '帮我创建一个美国健身类 TikTok 达人首轮触达任务，目标 50 人，合作方式为寄样 + 佣金，佣金不超过 14%。',
  '整理一批适合筋膜枪冷启动的 Deal 站，并给出首轮建联切入点。',
  '建立一个 YouTube 测评合作任务，先找 20 个可寄样、粉丝 10 万以下的账号。',
  '创建健康类媒体 PR 名单任务，输出媒体名单、联系人线索和首轮沟通框架。',
]

const channelPresets = [
  { name: 'Gmail', ability: '可发送', status: '已授权', note: '适合邮件首轮触达与长文本沟通' },
  { name: 'Instagram DM', ability: '可发送 / 可跟进', status: '已授权', note: '适合红人私信和轻量跟进' },
  { name: 'TikTok', ability: '可抓取', status: '可用', note: '适合候选对象搜集，私信权限受平台限制' },
  { name: 'YouTube', ability: '可抓取', status: '可用', note: '适合测评账号与媒体型对象发现' },
  { name: 'OpenCloud', ability: '外部 Agent 执行', status: '可接入', note: '适合跑搜集、整理、回填任务' },
  { name: 'Codex', ability: '外部 Agent 执行', status: '可接入', note: '适合执行结构化任务和回填执行结果' },
]

const emptyDashboard = {
  brandId: '',
  overview: {
    tagline: '',
    weeklyCreatorGoal: 0,
    outreachInProgress: 0,
    warmLeads: 0,
    todayTaskCount: 0,
    recentResultCount: 0,
    pendingRefillCount: 0,
    reminderCount: 0,
  },
  dataCenter: {
    influencerPool: 0,
    dealSitePool: 0,
    mediaPool: 0,
    activeOutreach: 0,
    historyTaskCount: 0,
  },
  recentResults: [],
  reminders: [],
  tasks: [],
  activeTaskId: '',
  leadsByTask: {},
}

const loginSeed = {
  username: 'demo@fangzhou.ai',
  password: 'demo123',
}

const brandProfileSeed = {
  intro: '我们是一套套在外部 Agent 之上的跨境外联业务壳层，负责统一记忆、任务编排、回填和资产沉淀。',
  productPoints: '筋膜枪 / 恢复类设备 / 居家健身',
  cooperationModes: '寄样 + 佣金，优先长期合作，默认不接受固定坑位费',
  campaignProof: '首轮重点验证 TikTok / Instagram / YouTube / Deal 站的外联效率和回填闭环。',
  faq: '是否支持寄样、佣金边界、物流周期、品牌卖点、竞品差异。',
}

const settingsSeed = {
  englishTone: '自然专业',
  followupRule: '48 小时后自动提醒复查，复杂对话进入人工接管',
  summaryRule: '每次回填后自动生成摘要、下一步动作和资产更新建议',
}

async function apiFetch(path, options = {}, token = '') {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(path, { ...options, headers })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || payload.detail || 'REQUEST_FAILED')
  }

  return response.json()
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function shortDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function normalizeTaskStatus(status) {
  if (!status) return '草稿'
  if (String(status).includes('完成')) return '已完成'
  if (String(status).includes('执行中')) return '执行中'
  if (String(status).includes('回填')) return '待回填'
  if (String(status).includes('生成')) return '待发送'
  return status
}

function parseInstruction(task) {
  const lines = String(task?.instruction || '').split('\n')
  const getValue = (label) => {
    const line = lines.find((item) => item.startsWith(`${label}：`))
    return line ? line.slice(label.length + 1).trim() : ''
  }

  return {
    title: getValue('任务名称') || task?.structuredTask?.objective || '未命名任务',
    product: getValue('产品') || '未填写产品',
    market: getValue('市场') || '未填写市场',
    direction: getValue('行业方向') || '未填写方向',
    platforms: getValue('目标平台') || '未填写平台',
    outreach: getValue('触达方式') || '未填写方式',
    constraints: getValue('合作约束') || '未填写约束',
    target: getValue('目标触达') || '未填写目标',
  }
}

function promptBlueprint(prompt) {
  const text = String(prompt || '')
  const lowered = text.toLowerCase()
  const targets = []
  if (lowered.includes('tiktok')) targets.push('TikTok')
  if (lowered.includes('instagram')) targets.push('Instagram')
  if (lowered.includes('youtube')) targets.push('YouTube')
  if (text.includes('Deal')) targets.push('Deal 站')
  if (text.includes('媒体') || lowered.includes('pr')) targets.push('媒体 / PR')
  if (targets.length === 0) targets.push('TikTok', 'Instagram')

  const objectType =
    text.includes('Deal') ? 'Deal 站 / 导购站'
      : text.includes('媒体') || lowered.includes('pr') ? '媒体 / PR'
        : text.includes('联盟') ? '联盟客 / Affiliate'
          : '达人 / 创作者'

  const workflow =
    text.includes('话术') || text.includes('回复') ? 'AI 辅助回复'
      : text.includes('名单') || text.includes('搜集') ? '外部 Agent 搜集 + 人工复核'
        : '外部 Agent 搜集 + 云端回填'

  return {
    objectType,
    workflow,
    targets,
    deliverables: ['结构化名单', '首轮触达框架', '回填摘要', '下一步动作'],
    memory: ['品牌资料', '历史会话', '合作约束', '资产标签'],
  }
}

function buildMockAssets(task) {
  const summary = parseInstruction(task)
  const titleHint = summary.title || '当前任务'

  return [
    {
      id: `mock-${task.id}-1`,
      taskId: task.id,
      name: 'Mia Moves',
      type: '达人',
      platform: 'TikTok',
      fitScore: 92,
      contact: 'Instagram DM',
      status: '待回复',
      handling: 'AI 辅助回复',
      relationship: '首次沟通',
      lastAction: '对方回复可合作，但提出固定费用',
      nextAction: '给出 3 版回复建议，判断是否人工接管',
      reminderAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      note: `${titleHint} 的高匹配对象，适合优先推进。`,
      conversation: [
        { role: 'agent', text: 'Hi Mia, we are exploring a sample + commission collaboration for the US fitness audience.' },
        { role: 'external', text: 'I can do it, but I usually charge a fixed fee. What is your budget?' },
      ],
    },
    {
      id: `mock-${task.id}-2`,
      taskId: task.id,
      name: 'Wellness Weekly',
      type: '媒体 / PR',
      platform: 'Editorial',
      fitScore: 84,
      contact: 'Gmail',
      status: '待接管',
      handling: '人工接管',
      relationship: '索要品牌资料',
      lastAction: '要求提供品牌背景与过往案例',
      nextAction: '调用品牌资料页内容，补发品牌介绍与 campaign case',
      reminderAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      note: '媒体型对象，需要更完整的资料底座。',
      conversation: [
        { role: 'external', text: 'Please share your brand background, KPI expectations and previous campaign examples.' },
      ],
    },
    {
      id: `mock-${task.id}-3`,
      taskId: task.id,
      name: 'Gym Deal Hunter',
      type: 'Deal 站',
      platform: 'Deal Site',
      fitScore: 79,
      contact: 'Gmail',
      status: '已触达',
      handling: '自动触达',
      relationship: '已进入候选池',
      lastAction: '首轮触达已发出',
      nextAction: '48 小时后自动检查是否回复',
      reminderAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      note: '标准化对象，适合自动化处理。',
      conversation: [
        { role: 'agent', text: 'Hello, we are launching a new recovery product and would love to explore a feature on your site.' },
      ],
    },
    {
      id: `mock-${task.id}-4`,
      taskId: task.id,
      name: 'PowerCore Jay',
      type: 'YouTube 测评',
      platform: 'YouTube',
      fitScore: 88,
      contact: 'Gmail',
      status: '已合作',
      handling: '人工接管',
      relationship: '已建立合作',
      lastAction: '样品与佣金方案已确认',
      nextAction: '推进履约与发布时间',
      reminderAt: null,
      note: '可作为后续案例与素材沉淀。',
      conversation: [
        { role: 'external', text: 'Sounds good. I am happy with gifted product + commission. Let us move forward.' },
      ],
    },
  ]
}

function buildSuggestionSet(asset) {
  if (!asset) return []

  const latestIncoming = asset.conversation.filter((item) => item.role === 'external').at(-1)?.text || ''
  if (/fee|budget|charge/i.test(latestIncoming)) {
    return [
      { title: '控制预算版', body: '感谢回复。我们这轮更偏向寄样 + 佣金合作，当前暂不接受固定费用。如果你愿意，我们可以先从一轮测试合作开始。' },
      { title: '继续推进版', body: '谢谢你给出报价。为了确保这轮合作匹配，我先把 deliverables 和 campaign 目标发给你，你看过后我们再一起确认方式。' },
      { title: '转人工版', body: '这个对象已经触碰合作约束，建议转人工接管，由你决定是否放宽边界。' },
    ]
  }

  if (/brand background|campaign|examples/i.test(latestIncoming)) {
    return [
      { title: '补品牌资料版', body: '当然可以。我先把品牌背景、产品卖点和过往合作方式整理给你，如果方向一致，我们再确认下一步节奏。' },
      { title: '压缩沟通版', body: '我先发你一页简版资料：品牌定位、产品卖点和本次合作目标。你看过后我们就能快速判断是否值得推进。' },
      { title: '人工接管提醒', body: '这类问题适合调用品牌资料页内容，并由人工做最后确认。' },
    ]
  }

  return [{ title: '常规跟进版', body: '收到，我这边先整理更完整的信息给你。你方便的话，我们本周继续往下推进。' }]
}

function assetStageCounts(assets) {
  const counts = {
    已抓取: 0,
    初筛通过: 0,
    已触达: 0,
    待回复: 0,
    洽谈中: 0,
    已合作: 0,
    待接管: 0,
  }

  assets.forEach((asset) => {
    if (counts[asset.status] !== undefined) counts[asset.status] += 1
  })

  return counts
}

function App() {
  const [bootstrap, setBootstrap] = useState({ brands: [], modules: [], demoCredentials: loginSeed, storageMode: 'memory', authMode: 'demo' })
  const [token, setToken] = useState(() => localStorage.getItem('fangzhou_shell_token') || '')
  const [currentUser, setCurrentUser] = useState(null)
  const [dashboard, setDashboard] = useState(emptyDashboard)
  const [brandId, setBrandId] = useState('')
  const [pageId, setPageId] = useState('overview')
  const [activeTaskId, setActiveTaskId] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [assetSearch, setAssetSearch] = useState('')
  const [conversationSearch, setConversationSearch] = useState('')
  const [taskPrompt, setTaskPrompt] = useState(quickExamples[0])
  const [replyDraft, setReplyDraft] = useState('')
  const [refillDraft, setRefillDraft] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [authTab, setAuthTab] = useState('login')
  const [loginForm, setLoginForm] = useState(loginSeed)
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' })
  const [brandProfile, setBrandProfile] = useState(brandProfileSeed)
  const [settingsState, setSettingsState] = useState(settingsSeed)
  const [localAssetsByTask, setLocalAssetsByTask] = useState({})

  useEffect(() => {
    localStorage.setItem('fangzhou_shell_token', token)
  }, [token])

  async function loadBootstrap() {
    const data = await apiFetch('/api/bootstrap')
    setBootstrap(data)
    setLoginForm((prev) => ({
      username: prev.username || data.demoCredentials?.username || loginSeed.username,
      password: prev.password || data.demoCredentials?.password || loginSeed.password,
    }))
    if (!brandId && data.brands?.length) setBrandId(data.brands[0].id)
  }

  async function loadSession(authToken, nextBrandId = brandId) {
    const me = await apiFetch('/api/me', {}, authToken)
    setCurrentUser(me.user)
    const resolvedBrandId = nextBrandId || me.brands?.[0]?.id || ''
    if (resolvedBrandId) setBrandId(resolvedBrandId)
    const dash = await apiFetch(`/api/dashboard?brandId=${resolvedBrandId}`, {}, authToken)
    setDashboard(dash)
    setActiveTaskId(dash.activeTaskId || dash.tasks?.[0]?.id || '')
  }

  useEffect(() => {
    loadBootstrap().catch((loadError) => setError(loadError.message))
  }, [])

  useEffect(() => {
    if (!token || !brandId) return
    loadSession(token, brandId).catch((loadError) => {
      setError(loadError.message)
      setToken('')
      setCurrentUser(null)
    })
  }, [token, brandId])

  useEffect(() => {
    if (!dashboard.tasks.length) return
    setLocalAssetsByTask((prev) => {
      let changed = false
      const next = { ...prev }
      dashboard.tasks.forEach((task) => {
        const realAssets = dashboard.leadsByTask?.[task.id] || []
        if (realAssets.length === 0 && !next[task.id]) {
          next[task.id] = buildMockAssets(task)
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [dashboard])

  const currentBrand = useMemo(
    () => bootstrap.brands.find((item) => item.id === brandId) || bootstrap.brands[0] || null,
    [bootstrap.brands, brandId],
  )

  const tasks = useMemo(() => dashboard.tasks || [], [dashboard.tasks])

  const visibleTasks = useMemo(() => {
    if (!taskSearch.trim()) return tasks
    const query = taskSearch.trim().toLowerCase()
    return tasks.filter((task) => {
      const summary = parseInstruction(task)
      return [summary.title, summary.product, summary.market, summary.direction].join(' ').toLowerCase().includes(query)
    })
  }, [tasks, taskSearch])

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) || visibleTasks[0] || null,
    [tasks, activeTaskId, visibleTasks],
  )

  useEffect(() => {
    if (!activeTask && !visibleTasks.length) return
    if (!activeTaskId && activeTask?.id) setActiveTaskId(activeTask.id)
  }, [activeTask, activeTaskId, visibleTasks])

  const taskAssetsMap = useMemo(() => {
    const result = {}
    tasks.forEach((task) => {
      const realAssets = dashboard.leadsByTask?.[task.id] || []
      result[task.id] = realAssets.length > 0 ? realAssets : (localAssetsByTask[task.id] || [])
    })
    return result
  }, [dashboard.leadsByTask, localAssetsByTask, tasks])

  const activeAssets = useMemo(
    () => (activeTask ? taskAssetsMap[activeTask.id] || [] : []),
    [activeTask, taskAssetsMap],
  )

  const filteredAssets = useMemo(() => {
    if (!assetSearch.trim()) return activeAssets
    const query = assetSearch.trim().toLowerCase()
    return activeAssets.filter((asset) =>
      [asset.name, asset.type, asset.platform, asset.contact, asset.status, asset.handling].join(' ').toLowerCase().includes(query),
    )
  }, [activeAssets, assetSearch])

  useEffect(() => {
    if (!filteredAssets.length) {
      setSelectedAssetId('')
      return
    }
    if (!selectedAssetId || !filteredAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(filteredAssets[0].id)
    }
  }, [filteredAssets, selectedAssetId])

  const selectedAsset = useMemo(
    () => activeAssets.find((asset) => asset.id === selectedAssetId) || filteredAssets[0] || null,
    [activeAssets, filteredAssets, selectedAssetId],
  )

  const allConversationAssets = useMemo(
    () =>
      tasks.flatMap((task) =>
        (taskAssetsMap[task.id] || []).map((asset) => ({
          ...asset,
          taskTitle: parseInstruction(task).title,
        })),
      ),
    [taskAssetsMap, tasks],
  )

  const inboxAssets = useMemo(() => {
    if (!conversationSearch.trim()) return allConversationAssets
    const query = conversationSearch.trim().toLowerCase()
    return allConversationAssets.filter((asset) =>
      [asset.name, asset.platform, asset.status, asset.handling, asset.lastAction].join(' ').toLowerCase().includes(query),
    )
  }, [allConversationAssets, conversationSearch])

  const selectedConversationAsset = useMemo(() => {
    if (pageId === 'conversations') {
      return inboxAssets.find((asset) => asset.id === selectedAssetId) || inboxAssets[0] || null
    }
    return selectedAsset
  }, [inboxAssets, pageId, selectedAsset, selectedAssetId])

  const stageCounts = useMemo(() => assetStageCounts(activeAssets), [activeAssets])
  const promptDraft = useMemo(() => promptBlueprint(taskPrompt), [taskPrompt])
  const activeTaskSummary = useMemo(() => (activeTask ? parseInstruction(activeTask) : null), [activeTask])
  const selectedSuggestions = useMemo(() => buildSuggestionSet(selectedConversationAsset), [selectedConversationAsset])

  function updateLocalAsset(taskId, assetId, updater) {
    setLocalAssetsByTask((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).map((asset) => (asset.id === assetId ? updater(asset) : asset)),
    }))
  }

  async function handleLogin() {
    setLoading(true)
    setError('')
    try {
      const payload = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      })
      setToken(payload.token)
      setCurrentUser(payload.user)
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister() {
    setLoading(true)
    setError('')
    try {
      const payload = await apiFetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          name: registerForm.name,
          email: registerForm.email,
          password: registerForm.password,
        }),
      })
      setToken(payload.token)
      setCurrentUser(payload.user)
    } catch (registerError) {
      setError(registerError.message)
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    setToken('')
    setCurrentUser(null)
    setDashboard(emptyDashboard)
    setActiveTaskId('')
    setSelectedAssetId('')
    setPageId('overview')
  }

  async function reloadDashboard(nextTaskId = activeTaskId) {
    const dash = await apiFetch(`/api/dashboard?brandId=${brandId}`, {}, token)
    setDashboard(dash)
    setActiveTaskId(nextTaskId || dash.activeTaskId || dash.tasks?.[0]?.id || '')
  }

  async function createTask() {
    if (!taskPrompt.trim()) {
      setError('请先输入任务目标。')
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          brandId,
          moduleId: 'traffic-acquisition',
          instruction: taskPrompt.trim(),
        }),
      }, token)
      await reloadDashboard(payload.task.id)
      setPageId('tasks')
      setRefillDraft('')
    } catch (taskError) {
      setError(taskError.message)
    } finally {
      setLoading(false)
    }
  }

  async function sendToExternalAgent() {
    if (!activeTask) return
    setLoading(true)
    setError('')
    try {
      await apiFetch(`/api/tasks/${activeTask.id}/submit`, { method: 'POST' }, token)
      await reloadDashboard(activeTask.id)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  async function markWaitingRefill() {
    if (!activeTask) return
    setLoading(true)
    setError('')
    try {
      await apiFetch(`/api/tasks/${activeTask.id}/mark-refill`, { method: 'POST' }, token)
      await reloadDashboard(activeTask.id)
    } catch (markError) {
      setError(markError.message)
    } finally {
      setLoading(false)
    }
  }

  async function submitRefill() {
    if (!activeTask || !refillDraft.trim()) {
      setError('请先粘贴外部 Agent 的执行结果。')
      return
    }

    setLoading(true)
    setError('')
    try {
      await apiFetch(`/api/tasks/${activeTask.id}/refill`, {
        method: 'POST',
        body: JSON.stringify({ rawText: refillDraft }),
      }, token)
      await reloadDashboard(activeTask.id)
      setRefillDraft('')
    } catch (refillError) {
      setError(refillError.message)
    } finally {
      setLoading(false)
    }
  }

  async function sendReply() {
    if (!selectedConversationAsset || !replyDraft.trim()) return

    setLoading(true)
    setError('')
    try {
      const hasRealAssets = (dashboard.leadsByTask?.[selectedConversationAsset.taskId] || []).length > 0
      if (hasRealAssets) {
        await apiFetch(
          `/api/leads/${selectedConversationAsset.id}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({ text: replyDraft.trim() }),
          },
          token,
        )
        await reloadDashboard(selectedConversationAsset.taskId)
      } else {
        updateLocalAsset(selectedConversationAsset.taskId, selectedConversationAsset.id, (asset) => ({
          ...asset,
          status: '洽谈中',
          lastAction: '已发送回复',
          nextAction: '等待对方下一轮反馈',
          conversation: [...asset.conversation, { role: 'agent', text: replyDraft.trim() }],
        }))
      }
      setReplyDraft('')
    } catch (replyError) {
      setError(replyError.message)
    } finally {
      setLoading(false)
    }
  }

  function renderOverviewPage() {
    return (
      <div className="page-stack">
        <section className="hero-band">
          <div className="hero-copy">
            <p className="eyebrow">External Agent Shell</p>
            <h1>方洲AI 外联业务壳层</h1>
            <p>
              不是再做一个 Agent，而是把外部 Agent 包进你的跨境业务流程里。
              所有任务、会话、摘要、结果和合作关系，统一沉淀在云端。
            </p>
          </div>
          <div className="hero-grid">
            <article>
              <span>云端记忆层</span>
              <strong>会话 / 约束 / 资产统一沉淀</strong>
            </article>
            <article>
              <span>外部执行层</span>
              <strong>OpenCloud / Codex / 人工都能接</strong>
            </article>
            <article>
              <span>业务回填层</span>
              <strong>回填后自动生成摘要与下一步动作</strong>
            </article>
          </div>
        </section>

        <section className="metric-strip">
          <article>
            <span>执行中任务</span>
            <strong>{dashboard.overview.todayTaskCount}</strong>
          </article>
          <article>
            <span>外联推进中</span>
            <strong>{dashboard.overview.outreachInProgress}</strong>
          </article>
          <article>
            <span>已沉淀资产</span>
            <strong>{dashboard.dataCenter.influencerPool + dashboard.dataCenter.dealSitePool + dashboard.dataCenter.mediaPool}</strong>
          </article>
          <article>
            <span>待回填</span>
            <strong>{dashboard.overview.pendingRefillCount}</strong>
          </article>
        </section>

        <div className="two-column">
          <section className="surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">系统价值</p>
                <h2>为什么不用直接 Agent，而要用这层壳</h2>
              </div>
            </div>
            <div className="value-grid">
              <article>
                <strong>统一上下文</strong>
                <p>不用每次重新告诉 Agent 你的品牌、SKU、合作边界和历史沟通。</p>
              </article>
              <article>
                <strong>统一回填</strong>
                <p>所有执行结果都回到同一个任务和资产池里，而不是散落在不同窗口。</p>
              </article>
              <article>
                <strong>统一资产沉淀</strong>
                <p>达人、媒体、Deal 站、联盟客都会沉淀成品牌自己的外联资产。</p>
              </article>
              <article>
                <strong>统一下一步动作</strong>
                <p>系统自动给出后续建议、提醒和接管判断，不让沟通断掉。</p>
              </article>
            </div>
          </section>

          <section className="surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">最近结果</p>
                <h2>已经跑出来的交付</h2>
              </div>
            </div>
            <div className="timeline-list">
              {dashboard.recentResults.length ? (
                dashboard.recentResults.map((item) => (
                  <article key={item.id} className="timeline-row">
                    <span>{shortDate(item.completedAt)}</span>
                    <strong>{parseInstruction({ instruction: item.instruction }).title}</strong>
                    <p>{item.summary || '已完成回填。'}</p>
                  </article>
                ))
              ) : (
                <article className="empty-state">还没有最近结果，创建一个新任务后这里会展示回填摘要。</article>
              )}
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderTasksPage() {
    return (
      <div className="page-stack">
        <div className="two-column wide-right">
          <section className="surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">创建任务</p>
                <h2>先告诉系统你要推进什么合作</h2>
              </div>
            </div>

            <label className="field">
              <span>自然语言任务输入</span>
              <textarea
                className="prompt-box"
                value={taskPrompt}
                onChange={(event) => setTaskPrompt(event.target.value)}
                placeholder="例如：帮我创建一个美国健身类 TikTok 达人首轮触达任务，目标 50 人，佣金不超过 14%。"
              />
            </label>

            <div className="chip-row">
              {quickExamples.map((item) => (
                <button key={item} type="button" className="soft-chip" onClick={() => setTaskPrompt(item)}>
                  {item}
                </button>
              ))}
            </div>

            <div className="draft-grid">
              <article>
                <span>对象类型</span>
                <strong>{promptDraft.objectType}</strong>
              </article>
              <article>
                <span>建议工作流</span>
                <strong>{promptDraft.workflow}</strong>
              </article>
              <article>
                <span>目标平台</span>
                <strong>{promptDraft.targets.join(' / ')}</strong>
              </article>
            </div>

            <div className="surface-note">
              <strong>这层壳会自动附带的上下文</strong>
              <p>{promptDraft.memory.join(' · ')}</p>
            </div>

            <div className="action-row">
              <button type="button" className="primary-button" onClick={createTask} disabled={loading}>
                {loading ? '处理中...' : '创建任务'}
              </button>
            </div>
          </section>

          <section className="surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">任务编排台</p>
                <h2>{activeTaskSummary?.title || '还没有选中任务'}</h2>
              </div>
              <span className="status-pill">{normalizeTaskStatus(activeTask?.status)}</span>
            </div>

            {activeTask ? (
              <div className="task-orchestration">
                <div className="meta-grid">
                  <article>
                    <span>产品 / SKU</span>
                    <strong>{activeTaskSummary.product}</strong>
                  </article>
                  <article>
                    <span>市场 / 方向</span>
                    <strong>{`${activeTaskSummary.market} / ${activeTaskSummary.direction}`}</strong>
                  </article>
                  <article>
                    <span>目标平台</span>
                    <strong>{activeTaskSummary.platforms}</strong>
                  </article>
                  <article>
                    <span>触达方式</span>
                    <strong>{activeTaskSummary.outreach}</strong>
                  </article>
                </div>

                <section className="mini-surface">
                  <div className="section-head compact">
                    <div>
                      <p className="eyebrow">执行说明</p>
                      <h3>系统给外部 Agent 的任务包</h3>
                    </div>
                  </div>
                  <div className="package-text">
                    <strong>{activeTask.executionPackage?.title || '执行方案'}</strong>
                    <p>{activeTask.executionPackage?.externalStatus || '尚未发送到外部执行端'}</p>
                    <pre>{activeTask.executionPackage?.content || '暂无执行方案。'}</pre>
                  </div>
                </section>

                <section className="mini-surface">
                  <div className="section-head compact">
                    <div>
                      <p className="eyebrow">回填结果</p>
                      <h3>外部 Agent 跑完之后贴回这里</h3>
                    </div>
                  </div>
                  <textarea
                    className="prompt-box compact"
                    value={refillDraft}
                    onChange={(event) => setRefillDraft(event.target.value)}
                    placeholder="把外部 Agent 的执行摘要、名单证据和下一步动作粘贴进来。"
                  />
                </section>

                <div className="action-row split">
                  <button type="button" className="secondary-button" onClick={sendToExternalAgent} disabled={loading}>
                    提交到外部 Agent
                  </button>
                  <button type="button" className="secondary-button" onClick={markWaitingRefill} disabled={loading}>
                    标记待回填
                  </button>
                  <button type="button" className="primary-button" onClick={submitRefill} disabled={loading}>
                    回填结果
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">先创建一个任务，这里会生成执行说明、发送动作和回填入口。</div>
            )}
          </section>
        </div>
      </div>
    )
  }

  function renderAssetsPage() {
    return (
      <div className="page-stack">
        <section className="surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">品牌资产池</p>
              <h2>{activeTaskSummary?.title || '当前任务资产'}</h2>
            </div>
            <input
              className="search-input"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="搜索对象、平台、状态、触达方式"
            />
          </div>

          <div className="funnel-strip">
            {Object.entries(stageCounts).map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <div className="asset-table">
            <div className="asset-table-head">
              <span>对象</span>
              <span>类型</span>
              <span>平台</span>
              <span>匹配度</span>
              <span>状态</span>
              <span>处理方式</span>
              <span>下一步</span>
            </div>
            <div className="asset-table-body">
              {filteredAssets.length ? (
                filteredAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={asset.id === selectedAssetId ? 'asset-row active' : 'asset-row'}
                    onClick={() => setSelectedAssetId(asset.id)}
                  >
                    <span>
                      <strong>{asset.name}</strong>
                      <small>{asset.contact}</small>
                    </span>
                    <span>{asset.type}</span>
                    <span>{asset.platform}</span>
                    <span>{asset.fitScore}</span>
                    <span>{asset.status}</span>
                    <span>{asset.handling}</span>
                    <span>{asset.nextAction}</span>
                  </button>
                ))
              ) : (
                <div className="empty-state">当前没有符合条件的资产结果。</div>
              )}
            </div>
          </div>
        </section>
      </div>
    )
  }

  function renderConversationsPage() {
    return (
      <div className="conversation-grid">
        <section className="surface inbox-surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">会话列表</p>
              <h2>待处理沟通</h2>
            </div>
          </div>
          <input
            className="search-input"
            value={conversationSearch}
            onChange={(event) => setConversationSearch(event.target.value)}
            placeholder="搜索会话、状态、平台"
          />

          <div className="inbox-list">
            {inboxAssets.length ? (
              inboxAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className={selectedConversationAsset?.id === asset.id ? 'inbox-item active' : 'inbox-item'}
                  onClick={() => {
                    setActiveTaskId(asset.taskId)
                    setSelectedAssetId(asset.id)
                  }}
                >
                  <div className="inbox-topline">
                    <strong>{asset.name}</strong>
                    <span>{asset.status}</span>
                  </div>
                  <small>{asset.taskTitle}</small>
                  <p>{asset.lastAction}</p>
                </button>
              ))
            ) : (
              <div className="empty-state">还没有会话对象。</div>
            )}
          </div>
        </section>

        <section className="surface thread-surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">完整消息流</p>
              <h2>{selectedConversationAsset?.name || '选择一条会话'}</h2>
            </div>
          </div>

          <div className="thread-meta">
            <span>{selectedConversationAsset?.platform || '-'}</span>
            <span>{selectedConversationAsset?.handling || '-'}</span>
            <span>{selectedConversationAsset?.status || '-'}</span>
          </div>

          <div className="message-stream">
            {selectedConversationAsset ? (
              selectedConversationAsset.conversation.map((message, index) => (
                <article key={`${message.role}-${index}`} className={`message-bubble ${message.role}`}>
                  <strong>{message.role === 'agent' ? '我方' : '对方'}</strong>
                  <p>{message.text}</p>
                </article>
              ))
            ) : (
              <div className="empty-state">选择一条会话后，这里会展示完整上下文。</div>
            )}
          </div>

          <label className="field">
            <span>回复草稿</span>
            <textarea
              className="prompt-box compact"
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              placeholder="在这里编辑要发出的回复。"
            />
          </label>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={sendReply} disabled={loading || !replyDraft.trim()}>
              发送回复
            </button>
          </div>
        </section>
      </div>
    )
  }

  function renderBrandPage() {
    return (
      <section className="surface">
        <div className="section-head">
          <div>
            <p className="eyebrow">品牌资料底座</p>
            <h2>这里是整个壳层调用品牌上下文的来源</h2>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>品牌介绍</span>
            <textarea value={brandProfile.intro} onChange={(event) => setBrandProfile((prev) => ({ ...prev, intro: event.target.value }))} />
          </label>
          <label className="field">
            <span>产品卖点 / SKU</span>
            <textarea value={brandProfile.productPoints} onChange={(event) => setBrandProfile((prev) => ({ ...prev, productPoints: event.target.value }))} />
          </label>
          <label className="field">
            <span>可接受合作方式</span>
            <textarea value={brandProfile.cooperationModes} onChange={(event) => setBrandProfile((prev) => ({ ...prev, cooperationModes: event.target.value }))} />
          </label>
          <label className="field">
            <span>过往案例 / 证明</span>
            <textarea value={brandProfile.campaignProof} onChange={(event) => setBrandProfile((prev) => ({ ...prev, campaignProof: event.target.value }))} />
          </label>
          <label className="field full">
            <span>常见问题 / FAQ</span>
            <textarea value={brandProfile.faq} onChange={(event) => setBrandProfile((prev) => ({ ...prev, faq: event.target.value }))} />
          </label>
        </div>
      </section>
    )
  }

  function renderChannelsPage() {
    return (
      <section className="surface">
        <div className="section-head">
          <div>
            <p className="eyebrow">通道状态</p>
            <h2>当前这套壳层能抓、能发、能接什么执行端</h2>
          </div>
        </div>
        <div className="channel-grid">
          {channelPresets.map((channel) => (
            <article key={channel.name} className="channel-card">
              <div className="channel-head">
                <strong>{channel.name}</strong>
                <span>{channel.status}</span>
              </div>
              <p>{channel.ability}</p>
              <small>{channel.note}</small>
            </article>
          ))}
        </div>
      </section>
    )
  }

  function renderSettingsPage() {
    return (
      <section className="surface">
        <div className="section-head">
          <div>
            <p className="eyebrow">系统设置</p>
            <h2>定义默认语气、跟进规则和总结规则</h2>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>默认英文风格</span>
            <input value={settingsState.englishTone} onChange={(event) => setSettingsState((prev) => ({ ...prev, englishTone: event.target.value }))} />
          </label>
          <label className="field">
            <span>自动跟进规则</span>
            <input value={settingsState.followupRule} onChange={(event) => setSettingsState((prev) => ({ ...prev, followupRule: event.target.value }))} />
          </label>
          <label className="field full">
            <span>回填总结规则</span>
            <textarea value={settingsState.summaryRule} onChange={(event) => setSettingsState((prev) => ({ ...prev, summaryRule: event.target.value }))} />
          </label>
        </div>
      </section>
    )
  }

  function renderCenterContent() {
    if (pageId === 'overview') return renderOverviewPage()
    if (pageId === 'tasks') return renderTasksPage()
    if (pageId === 'assets') return renderAssetsPage()
    if (pageId === 'conversations') return renderConversationsPage()
    if (pageId === 'brand') return renderBrandPage()
    if (pageId === 'channels') return renderChannelsPage()
    return renderSettingsPage()
  }

  function renderRightRail() {
    if (pageId === 'tasks') {
      return (
        <div className="right-stack">
          <section className="surface compact-surface">
            <p className="eyebrow">当前任务摘要</p>
            {activeTaskSummary ? (
              <>
                <h3>{activeTaskSummary.title}</h3>
                <div className="detail-list">
                  <article><span>产品</span><strong>{activeTaskSummary.product}</strong></article>
                  <article><span>市场</span><strong>{activeTaskSummary.market}</strong></article>
                  <article><span>平台</span><strong>{activeTaskSummary.platforms}</strong></article>
                  <article><span>约束</span><strong>{activeTaskSummary.constraints}</strong></article>
                </div>
              </>
            ) : (
              <p className="empty-note">还没有任务。</p>
            )}
          </section>

          <section className="surface compact-surface">
            <p className="eyebrow">壳层下一步</p>
            <div className="todo-list">
              <p>1. 创建任务并生成执行说明。</p>
              <p>2. 发送给外部 Agent 跑搜集 / 筛选 / 结构化整理。</p>
              <p>3. 把结果回填回来，沉淀到资产和会话里。</p>
            </div>
          </section>
        </div>
      )
    }

    if (pageId === 'assets') {
      return (
        <div className="right-stack">
          <section className="surface compact-surface">
            <p className="eyebrow">资产详情</p>
            {selectedAsset ? (
              <>
                <h3>{selectedAsset.name}</h3>
                <div className="detail-list">
                  <article><span>对象类型</span><strong>{selectedAsset.type}</strong></article>
                  <article><span>当前阶段</span><strong>{selectedAsset.status}</strong></article>
                  <article><span>处理方式</span><strong>{selectedAsset.handling}</strong></article>
                  <article><span>关系温度</span><strong>{selectedAsset.relationship}</strong></article>
                </div>
                <div className="surface-note">
                  <strong>推荐动作</strong>
                  <p>{selectedAsset.nextAction}</p>
                </div>
              </>
            ) : (
              <p className="empty-note">选择一条资产后，这里会显示关系与建议。</p>
            )}
          </section>
        </div>
      )
    }

    if (pageId === 'conversations') {
      return (
        <div className="right-stack">
          <section className="surface compact-surface">
            <p className="eyebrow">AI 副驾驶</p>
            {selectedConversationAsset ? (
              <>
                <h3>{selectedConversationAsset.name}</h3>
                <div className="detail-list">
                  <article><span>当前判断</span><strong>{selectedConversationAsset.status}</strong></article>
                  <article><span>处理建议</span><strong>{selectedConversationAsset.handling}</strong></article>
                </div>
              </>
            ) : (
              <p className="empty-note">选择一条会话后，这里会给出回复建议。</p>
            )}
          </section>

          {selectedSuggestions.map((item) => (
            <section key={item.title} className="surface compact-surface suggestion-block">
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <button type="button" className="soft-chip align-left" onClick={() => setReplyDraft(item.body)}>
                放入回复框
              </button>
            </section>
          ))}
        </div>
      )
    }

    if (pageId === 'brand') {
      return (
        <div className="right-stack">
          <section className="surface compact-surface">
            <p className="eyebrow">为什么品牌资料重要</p>
            <p className="empty-note">
              这页不是摆设。外部 Agent 回答品牌背景、卖点、合作边界、过往案例时，都应该从这里抽信息。
            </p>
          </section>
        </div>
      )
    }

    if (pageId === 'channels') {
      return (
        <div className="right-stack">
          <section className="surface compact-surface">
            <p className="eyebrow">通道说明</p>
            <p className="empty-note">
              这一层只负责告诉系统：哪些地方能抓，哪些地方能发，哪些外部 Agent 能接任务。
            </p>
          </section>
        </div>
      )
    }

    if (pageId === 'settings') {
      return (
        <div className="right-stack">
          <section className="surface compact-surface">
            <p className="eyebrow">设置作用</p>
            <p className="empty-note">
              这里定义系统默认语气、自动跟进节奏和总结方式，让壳层在不同任务里保持一致。
            </p>
          </section>
        </div>
      )
    }

    return (
      <div className="right-stack">
        <section className="surface compact-surface">
          <p className="eyebrow">当前品牌</p>
          <h3>{currentBrand?.name || '未选择品牌'}</h3>
          <p className="empty-note">{currentBrand?.overview || '这里会显示当前品牌的工作语境。'}</p>
        </section>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="login-shell">
        <section className="login-hero">
          <p className="eyebrow">Outreach Shell for External Agents</p>
          <h1>方洲AI</h1>
          <p className="login-copy">
            把 OpenCloud、Codex、人工执行都包进同一套跨境外联流程里。
            统一任务、统一记忆、统一回填、统一资产沉淀。
          </p>
          <div className="login-points">
            <article><strong>任务中枢</strong><span>自然语言创建任务，系统自动生成执行说明</span></article>
            <article><strong>云端记忆</strong><span>所有会话、约束、资料和结果都留在云端</span></article>
            <article><strong>外部执行</strong><span>外部 Agent 跑执行，你的系统只负责编排与沉淀</span></article>
          </div>
        </section>

        <section className="login-card">
          <div className="auth-tabs">
            <button type="button" className={authTab === 'login' ? 'soft-chip active' : 'soft-chip'} onClick={() => setAuthTab('login')}>
              登录
            </button>
            <button type="button" className={authTab === 'register' ? 'soft-chip active' : 'soft-chip'} onClick={() => setAuthTab('register')}>
              注册
            </button>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}

          {authTab === 'login' ? (
            <div className="form-grid single">
              <label className="field">
                <span>邮箱</span>
                <input value={loginForm.username} onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))} />
              </label>
              <label className="field">
                <span>密码</span>
                <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))} />
              </label>
              <button type="button" className="primary-button" onClick={handleLogin} disabled={loading}>
                {loading ? '登录中...' : '进入系统'}
              </button>
            </div>
          ) : (
            <div className="form-grid single">
              <label className="field">
                <span>姓名</span>
                <input value={registerForm.name} onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label className="field">
                <span>邮箱</span>
                <input value={registerForm.email} onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))} />
              </label>
              <label className="field">
                <span>密码</span>
                <input type="password" value={registerForm.password} onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))} />
              </label>
              <button type="button" className="primary-button" onClick={handleRegister} disabled={loading}>
                {loading ? '注册中...' : '注册并进入'}
              </button>
            </div>
          )}

          <div className="login-footnote">
            <span>当前存储：{bootstrap.storageMode}</span>
            <span>当前账号模式：{bootstrap.authMode}</span>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="shell-app">
      {error ? <div className="error-banner floating">{error}</div> : null}

      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-mark">方</div>
          <div>
            <p className="eyebrow">Fangzhou AI</p>
            <strong>外联业务壳层</strong>
          </div>
        </div>

        <label className="workspace-switch">
          <span>品牌空间</span>
          <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
            {bootstrap.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="primary-button sidebar-button" onClick={() => setPageId('tasks')}>
          + 新建任务
        </button>

        <input
          className="search-input"
          value={taskSearch}
          onChange={(event) => setTaskSearch(event.target.value)}
          placeholder="搜索任务 / SKU / 市场"
        />

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button key={item.id} type="button" className={pageId === item.id ? 'nav-button active' : 'nav-button'} onClick={() => setPageId(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        <section className="sidebar-section">
          <div className="section-head compact">
            <div>
              <p className="eyebrow">最近任务</p>
            </div>
          </div>
          <div className="sidebar-scroll">
            {visibleTasks.length ? (
              visibleTasks.map((task) => {
                const summary = parseInstruction(task)
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={activeTask?.id === task.id ? 'task-link active' : 'task-link'}
                    onClick={() => {
                      setActiveTaskId(task.id)
                      setPageId('tasks')
                    }}
                  >
                    <strong>{summary.title}</strong>
                    <small>{`${summary.market} · ${summary.product}`}</small>
                    <span>{normalizeTaskStatus(task.status)}</span>
                  </button>
                )
              })
            ) : (
              <div className="empty-note">还没有任务。</div>
            )}
          </div>
        </section>

        <section className="sidebar-section">
          <div className="section-head compact">
            <div>
              <p className="eyebrow">最近会话</p>
            </div>
          </div>
          <div className="sidebar-scroll slim">
            {allConversationAssets.slice(0, 5).map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="task-link slim"
                onClick={() => {
                  setPageId('conversations')
                  setActiveTaskId(asset.taskId)
                  setSelectedAssetId(asset.id)
                }}
              >
                <strong>{asset.name}</strong>
                <small>{asset.lastAction}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="sidebar-bottom">
          <div className="user-card">
            <strong>{currentUser?.name || '当前用户'}</strong>
            <small>{currentUser?.username || '-'}</small>
          </div>
          <button type="button" className="soft-chip align-left" onClick={handleLogout}>
            退出
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="context-bar">
          <div className="context-left">
            <strong>{currentBrand?.name || '未选择品牌'}</strong>
            <span>{currentBrand?.overview || '这里显示当前品牌的工作语境。'}</span>
          </div>
          <div className="context-tags">
            <span>{bootstrap.storageMode}</span>
            <span>{bootstrap.authMode}</span>
            <span>{currentUser?.authMode || 'session'}</span>
          </div>
        </header>

        <section className="content-area">{renderCenterContent()}</section>
      </main>

      <aside className="assistant-rail">{renderRightRail()}</aside>
    </div>
  )
}

export default App
