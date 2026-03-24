import { useEffect, useMemo, useState } from 'react'
import './app.css'

const navItems = [
  { id: 'overview', label: '工作台' },
  { id: 'tasks', label: '任务' },
  { id: 'assets', label: '资产' },
  { id: 'conversations', label: '会话' },
  { id: 'brand', label: '品牌资料' },
  { id: 'channels', label: '通道状态' },
  { id: 'settings', label: '设置' },
]

const quickExamples = [
  '帮我创建一个美国健身类 TikTok 达人首轮触达任务，目标 50 位对象，合作方式为寄样 + 佣金，佣金不超过 14%。',
  '帮我整理一批适合筋膜枪冷启动的 Deal 站，输出可联系邮箱、推荐切入点和优先级。',
  '帮我创建一个 YouTube 测评合作任务，优先 10 万粉以内、支持寄样的账号。',
  '帮我整理一批健康类媒体与 PR 名单，并生成首轮建联框架。',
]

const stageOptions = ['已抓取', '初筛通过', '已触达', '待回复', '洽谈中', '已合作', '待接管']
const handlingOptions = ['自动触达', 'AI辅助回复', '人工接管']

const loginSeed = {
  username: 'demo@fangzhou.ai',
  password: 'demo123',
}

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

const brandProfileSeed = {
  intro: '方洲AI 是一层套在外部 Agent 之上的跨境外联业务壳层，负责统一任务、统一记忆、统一回填与资产沉淀。',
  productPoints: '筋膜枪 / 恢复类设备 / 居家健身',
  cooperationModes: '寄样 + 佣金，优先长期合作，不接受固定坑位费。',
  campaignProof: '重点验证 TikTok、Instagram、YouTube 与 Deal 站的冷启动合作效率。',
  faq: '是否支持寄样、佣金边界、物流周期、品牌差异点、竞品对比。',
}

const channelConfigSeed = {
  opencloudUrl: 'https://app.opencloud.com',
  codexUrl: 'https://chatgpt.com',
  gmailSender: '',
  gmailSignature: 'Best regards,\nFangzhou AI',
  whatsappNumber: '',
  youtubeWorkspace: '',
  instagramWorkspace: '',
  tiktokWorkspace: '',
}

const settingsSeed = {
  englishTone: '自然专业',
  followupRule: '48 小时后自动提醒复查，复杂会话升级为人工接管。',
  summaryRule: '每次回填后自动生成摘要、下一步动作和资产更新建议。',
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

function localPreferenceKey(brandId) {
  return `fangzhou_shell_preferences_${brandId}`
}

function readLocalPreferences(brandId) {
  try {
    const raw = localStorage.getItem(localPreferenceKey(brandId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeLocalPreferences(brandId, payload) {
  localStorage.setItem(localPreferenceKey(brandId), JSON.stringify(payload))
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
  if (String(status).includes('执行')) return '执行中'
  if (String(status).includes('回填')) return '待回填'
  if (String(status).includes('生成')) return '待发送'
  return String(status)
}

function parseInstruction(task) {
  const text = String(task?.instruction || '')
  const lines = text.split('\n')
  const getValue = (label) => {
    const line = lines.find((item) => item.startsWith(`${label}：`) || item.startsWith(`${label}:`))
    if (!line) return ''
    return line.slice(line.indexOf('：') >= 0 ? line.indexOf('：') + 1 : line.indexOf(':') + 1).trim()
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
  if (text.includes('Deal') || text.includes('deal')) targets.push('Deal 站')
  if (text.includes('媒体') || lowered.includes('pr')) targets.push('媒体 / PR')
  if (!targets.length) targets.push('TikTok', 'Instagram')

  const objectType =
    text.includes('Deal') || text.includes('deal')
      ? 'Deal 站 / 导购站'
      : text.includes('媒体') || lowered.includes('pr')
        ? '媒体 / PR'
        : text.includes('联盟')
          ? '联盟客 / Affiliate'
          : '达人 / 创作者'

  const workflow =
    text.includes('话术') || text.includes('回复')
      ? 'AI辅助回复'
      : text.includes('名单') || text.includes('整理') || text.includes('搜索')
        ? '外部 Agent 搜集 + 人工复核'
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
      brandId: task.brandId,
      name: 'Mia Moves',
      type: '达人',
      platform: 'TikTok',
      profileUrl: 'https://www.tiktok.com',
      email: 'mia@example.com',
      phone: '15551234567',
      fitScore: 92,
      followers: '12.4 万',
      contact: 'Instagram DM',
      status: '待回复',
      handling: 'AI辅助回复',
      relationship: '首次沟通',
      lastAction: '对方提出固定费用合作',
      nextAction: '生成 3 版回复并判断是否接管',
      reminderAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reminderNote: '明天跟进报价策略',
      notes: `${titleHint} 的高匹配对象，适合优先推进。`,
      conversation: [
        { role: 'agent', text: 'Hi Mia, we are exploring a sample + commission collaboration for the US fitness audience.' },
        { role: 'external', text: 'I can do it, but I usually charge a fixed fee. What is your budget?' },
      ],
    },
    {
      id: `mock-${task.id}-2`,
      taskId: task.id,
      brandId: task.brandId,
      name: 'Wellness Weekly',
      type: '媒体 / PR',
      platform: 'Editorial',
      profileUrl: 'https://www.google.com/search?q=wellness+weekly',
      email: 'editor@wellnessweekly.com',
      fitScore: 84,
      followers: '媒体',
      contact: 'Gmail',
      status: '待接管',
      handling: '人工接管',
      relationship: '索要品牌资料',
      lastAction: '要求提供品牌背景与过往案例',
      nextAction: '补品牌资料后继续推进',
      reminderAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      reminderNote: '补一页品牌介绍与 KPI',
      notes: '媒体对象，需要更完整的资料底座。',
      conversation: [{ role: 'external', text: 'Please share your brand background, KPI expectations and previous campaign examples.' }],
    },
  ]
}

function buildSuggestionSet(asset) {
  if (!asset) return []

  const latestIncoming = asset.conversation?.filter((item) => item.role === 'external').at(-1)?.text || ''
  if (/fee|budget|charge|报价|费用/i.test(latestIncoming)) {
    return [
      { title: '压预算版', body: '感谢回复。我们这轮更偏向寄样 + 佣金合作，当前暂不接受固定费用。如果你愿意，我们可以先从一轮测试合作开始。' },
      { title: '继续推进版', body: '谢谢你给出报价。为了确保这轮合作匹配，我先把 deliverables 和 campaign 目标发给你，你看过后我们再一起确认方式。' },
      { title: '建议接管', body: '这个对象已经触及合作约束，建议转人工接管，由你决定是否放宽边界。' },
    ]
  }

  if (/brand background|campaign|examples|案例|背景/i.test(latestIncoming)) {
    return [
      { title: '品牌资料版', body: '当然可以。我先把品牌背景、产品卖点和过往合作方式整理给你，如果方向一致，我们再确认下一步节奏。' },
      { title: '压缩沟通版', body: '我先发你一页简版资料：品牌定位、产品卖点和本次合作目标。你看过后我们就能快速判断是否值得推进。' },
      { title: '建议接管', body: '这类问题适合调品牌资料页内容，并由人工做最后确认。' },
    ]
  }

  return [
    { title: '常规跟进版', body: '收到，我这边先整理更完整的信息给你。你方便的话，我们本周继续往下推进。' },
    { title: '确认意向版', body: '感谢回复。为了让合作更高效，我先确认一下你更偏好的合作方式和时间节奏。' },
  ]
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

function buildEmailDraft(asset, brandProfile, channelConfig) {
  return [
    `Hi ${asset?.name || 'there'},`,
    '',
    `I am reaching out about a potential collaboration related to ${brandProfile.productPoints}.`,
    `Our current cooperation mode is ${brandProfile.cooperationModes}.`,
    '',
    brandProfile.intro,
    '',
    channelConfig.gmailSignature || '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildAssetLinks(asset, brandProfile, channelConfig) {
  const summary = encodeURIComponent(buildEmailDraft(asset, brandProfile, channelConfig))
  const subject = encodeURIComponent(`${brandProfile.productPoints} 合作沟通`)
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(asset?.email || '')}&su=${subject}&body=${summary}`
  const whatsappUrl = asset?.phone ? `https://wa.me/${String(asset.phone).replace(/\D/g, '')}?text=${summary}` : ''
  const profileUrl =
    asset?.profileUrl
    || (asset?.platform === 'YouTube' ? `https://www.youtube.com/results?search_query=${encodeURIComponent(asset.name)}` : '')
    || (asset?.platform === 'TikTok' ? `https://www.tiktok.com/search?q=${encodeURIComponent(asset.name)}` : '')
    || `https://www.google.com/search?q=${encodeURIComponent(asset?.name || '')}`

  return { gmailUrl, whatsappUrl, profileUrl }
}

async function copyText(text) {
  await navigator.clipboard.writeText(text)
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function openUrl(url) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function toDatetimeInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function fromDatetimeInputValue(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function stageClass(status) {
  const map = {
    已抓取: 'slate',
    初筛通过: 'blue',
    已触达: 'purple',
    待回复: 'amber',
    洽谈中: 'green',
    已合作: 'green-strong',
    待接管: 'red',
  }
  return map[status] || 'slate'
}

function App() {
  const [bootstrap, setBootstrap] = useState({ brands: [], demoCredentials: loginSeed, storageMode: 'memory', authMode: 'demo' })
  const [token, setToken] = useState(() => localStorage.getItem('fangzhou_shell_token') || '')
  const [currentUser, setCurrentUser] = useState(null)
  const [dashboard, setDashboard] = useState(emptyDashboard)
  const [brandId, setBrandId] = useState('')
  const [pageId, setPageId] = useState('tasks')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [selectedAssetIds, setSelectedAssetIds] = useState([])
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
  const [channelConfig, setChannelConfig] = useState(channelConfigSeed)
  const [settingsState, setSettingsState] = useState(settingsSeed)
  const [localAssetsByTask, setLocalAssetsByTask] = useState({})
  const [assetEditor, setAssetEditor] = useState({ status: '', handling: '', nextAction: '', reminderAt: '', reminderNote: '' })
  const [bulkAction, setBulkAction] = useState({ status: '', handling: '', nextAction: '', reminderAt: '', reminderNote: '' })
  const [notice, setNotice] = useState('')

  useEffect(() => {
    localStorage.setItem('fangzhou_shell_token', token)
  }, [token])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])

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
    if (!token || !brandId) return

    apiFetch(`/api/preferences?brandId=${brandId}`, {}, token)
      .then((preferences) => {
        setBrandProfile({ ...brandProfileSeed, ...(preferences.brandProfile || {}) })
        setChannelConfig({ ...channelConfigSeed, ...(preferences.channelConfig || {}) })
        setSettingsState({ ...settingsSeed, ...(preferences.settings || {}) })
      })
      .catch(() => {
        const localPreferences = readLocalPreferences(brandId)
        if (localPreferences) {
          setBrandProfile({ ...brandProfileSeed, ...(localPreferences.brandProfile || {}) })
          setChannelConfig({ ...channelConfigSeed, ...(localPreferences.channelConfig || {}) })
          setSettingsState({ ...settingsSeed, ...(localPreferences.settings || {}) })
        }
      })
  }, [token, brandId])

  useEffect(() => {
    if (!dashboard.tasks.length) return
    setLocalAssetsByTask((prev) => {
      let changed = false
      const next = { ...prev }
      dashboard.tasks.forEach((task) => {
        const realAssets = dashboard.leadsByTask?.[task.id] || []
        if (!realAssets.length && !next[task.id]) {
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
      result[task.id] = realAssets.length ? realAssets : (localAssetsByTask[task.id] || [])
    })
    return result
  }, [dashboard.leadsByTask, localAssetsByTask, tasks])

  const activeAssets = useMemo(() => (activeTask ? taskAssetsMap[activeTask.id] || [] : []), [activeTask, taskAssetsMap])

  const filteredAssets = useMemo(() => {
    if (!assetSearch.trim()) return activeAssets
    const query = assetSearch.trim().toLowerCase()
    return activeAssets.filter((asset) =>
      [asset.name, asset.type, asset.platform, asset.contact, asset.status, asset.handling, asset.nextAction].join(' ').toLowerCase().includes(query),
    )
  }, [activeAssets, assetSearch])

  useEffect(() => {
    if (!filteredAssets.length) {
      setSelectedAssetId('')
      setSelectedAssetIds([])
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

  useEffect(() => {
    if (!selectedAsset) return
    setAssetEditor({
      status: selectedAsset.status || '',
      handling: selectedAsset.handling || '',
      nextAction: selectedAsset.nextAction || '',
      reminderAt: toDatetimeInputValue(selectedAsset.reminderAt),
      reminderNote: selectedAsset.reminderNote || '',
    })
  }, [selectedAsset])

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
      [asset.name, asset.platform, asset.status, asset.handling, asset.lastAction, asset.taskTitle].join(' ').toLowerCase().includes(query),
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
  const selectedLinks = useMemo(() => buildAssetLinks(selectedAsset, brandProfile, channelConfig), [selectedAsset, brandProfile, channelConfig])
  const selectedConversationLinks = useMemo(
    () => buildAssetLinks(selectedConversationAsset, brandProfile, channelConfig),
    [selectedConversationAsset, brandProfile, channelConfig],
  )

  function setLocalAsset(taskId, assetId, updater) {
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
    setSelectedAssetIds([])
    setPageId('tasks')
  }

  async function reloadDashboard(nextTaskId = activeTaskId) {
    const dash = await apiFetch(`/api/dashboard?brandId=${brandId}`, {}, token)
    setDashboard(dash)
    setActiveTaskId(nextTaskId || dash.activeTaskId || dash.tasks?.[0]?.id || '')
  }

  async function savePreferences(kind) {
    setLoading(true)
    setError('')
    const payload = {
      brandId,
      brandProfile,
      channelConfig,
      settings: settingsState,
    }

    try {
      await apiFetch('/api/preferences', { method: 'PUT', body: JSON.stringify(payload) }, token)
      writeLocalPreferences(brandId, payload)
      setNotice(`${kind}已保存`)
    } catch {
      writeLocalPreferences(brandId, payload)
      setNotice(`${kind}已先保存到浏览器，本地继续可用`)
    } finally {
      setLoading(false)
    }
  }

  async function createTask() {
    if (!taskPrompt.trim()) {
      setError('请先输入任务目标。')
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload = await apiFetch(
        '/api/tasks',
        {
          method: 'POST',
          body: JSON.stringify({
            brandId,
            moduleId: 'traffic-acquisition',
            instruction: taskPrompt.trim(),
          }),
        },
        token,
      )
      await reloadDashboard(payload.task.id)
      setPageId('tasks')
      setRefillDraft('')
      setNotice('任务已创建')
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
      setNotice('任务已标记为外部执行中')
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
      setNotice('任务已进入待回填')
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
      await apiFetch(
        `/api/tasks/${activeTask.id}/refill`,
        {
          method: 'POST',
          body: JSON.stringify({ rawText: refillDraft }),
        },
        token,
      )
      await reloadDashboard(activeTask.id)
      setRefillDraft('')
      setNotice('回填已写入系统')
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
        setLocalAsset(selectedConversationAsset.taskId, selectedConversationAsset.id, (asset) => ({
          ...asset,
          status: asset.status === '待回复' ? '洽谈中' : asset.status,
          lastAction: '已发送回复',
          nextAction: '等待对方下一轮反馈',
          conversation: [...(asset.conversation || []), { role: 'agent', text: replyDraft.trim() }],
        }))
      }
      setReplyDraft('')
      setNotice('回复已写入会话')
    } catch (replyError) {
      setError(replyError.message)
    } finally {
      setLoading(false)
    }
  }

  async function copyExecutionPackage() {
    if (!activeTask?.executionPackage?.content) return
    try {
      await copyText(activeTask.executionPackage.content)
      setNotice('执行包已复制')
    } catch (copyError) {
      setError(copyError.message)
    }
  }

  function downloadExecutionPackage() {
    if (!activeTask?.executionPackage?.content) return
    downloadText(activeTask.executionPackage.exportName || `${activeTask.id}.txt`, activeTask.executionPackage.content)
    setNotice('执行包已下载')
  }

  async function launchExternal(baseUrl, label) {
    if (!activeTask?.executionPackage?.content) {
      setError('当前没有可执行任务包。')
      return
    }

    try {
      if (!String(activeTask.status || '').includes('执行')) {
        await apiFetch(`/api/tasks/${activeTask.id}/submit`, { method: 'POST' }, token)
        await reloadDashboard(activeTask.id)
      }
      await copyText(activeTask.executionPackage.content)
      openUrl(baseUrl)
      setNotice(`已复制执行包并打开 ${label}`)
    } catch (launchError) {
      setError(launchError.message)
    }
  }

  async function applyLeadUpdate(targetLeadId, changes) {
    if (!activeTask) return
    const hasRealAssets = (dashboard.leadsByTask?.[activeTask.id] || []).length > 0

    if (hasRealAssets) {
      await apiFetch(
        `/api/leads/${targetLeadId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(changes),
        },
        token,
      )
      await reloadDashboard(activeTask.id)
      return
    }

    setLocalAsset(activeTask.id, targetLeadId, (asset) => ({
      ...asset,
      ...changes,
      reminderAt: changes.reminderAt !== undefined ? changes.reminderAt : asset.reminderAt,
      reminderNote: changes.reminderNote !== undefined ? changes.reminderNote : asset.reminderNote,
      lastAction: '已更新资产状态',
    }))
  }

  async function saveSelectedAsset() {
    if (!selectedAsset) return
    setLoading(true)
    setError('')
    try {
      await applyLeadUpdate(selectedAsset.id, {
        status: assetEditor.status,
        handling: assetEditor.handling,
        nextAction: assetEditor.nextAction,
        reminderAt: fromDatetimeInputValue(assetEditor.reminderAt),
        reminderNote: assetEditor.reminderNote,
      })
      setNotice('资产已更新')
    } catch (updateError) {
      setError(updateError.message)
    } finally {
      setLoading(false)
    }
  }

  async function applyBulkUpdate() {
    if (!selectedAssetIds.length || !activeTask) return
    const hasRealAssets = (dashboard.leadsByTask?.[activeTask.id] || []).length > 0
    const payload = {
      ids: selectedAssetIds,
      status: bulkAction.status || undefined,
      handling: bulkAction.handling || undefined,
      nextAction: bulkAction.nextAction || undefined,
      reminderAt: bulkAction.reminderAt ? fromDatetimeInputValue(bulkAction.reminderAt) : undefined,
      reminderNote: bulkAction.reminderNote || undefined,
    }

    setLoading(true)
    setError('')
    try {
      if (hasRealAssets) {
        await apiFetch('/api/leads/bulk-update', { method: 'POST', body: JSON.stringify(payload) }, token)
        await reloadDashboard(activeTask.id)
      } else {
        selectedAssetIds.forEach((id) => {
          setLocalAsset(activeTask.id, id, (asset) => ({
            ...asset,
            status: payload.status || asset.status,
            handling: payload.handling || asset.handling,
            nextAction: payload.nextAction || asset.nextAction,
            reminderAt: payload.reminderAt !== undefined ? payload.reminderAt : asset.reminderAt,
            reminderNote: payload.reminderNote !== undefined ? payload.reminderNote : asset.reminderNote,
            lastAction: '已批量更新资产',
          }))
        })
      }
      setBulkAction({ status: '', handling: '', nextAction: '', reminderAt: '', reminderNote: '' })
      setSelectedAssetIds([])
      setNotice('批量操作已应用')
    } catch (bulkError) {
      setError(bulkError.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleAssetSelection(assetId) {
    setSelectedAssetIds((prev) => (prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]))
  }

  function selectAllVisibleAssets() {
    setSelectedAssetIds((prev) => (prev.length === filteredAssets.length ? [] : filteredAssets.map((asset) => asset.id)))
  }

  function renderOverviewPage() {
    return (
      <div className="panel-stack">
        <section className="hero-panel compact-hero">
          <div className="hero-copy">
            <p className="hero-kicker">Workspace</p>
            <h1>先告诉系统你要推进什么合作，再把执行结果收回来。</h1>
            <p>这页只保留你今天真正要看的东西：任务、提醒、回填和最近结果。</p>
          </div>
          <div className="hero-facts">
            <article><span>今日任务</span><strong>{dashboard.overview.todayTaskCount}</strong></article>
            <article><span>待回填</span><strong>{dashboard.overview.pendingRefillCount}</strong></article>
            <article><span>待提醒</span><strong>{dashboard.overview.reminderCount}</strong></article>
          </div>
        </section>

        <section className="stats-grid">
          <article className="stat-card"><span>已沉淀资产</span><strong>{dashboard.dataCenter.influencerPool + dashboard.dataCenter.dealSitePool + dashboard.dataCenter.mediaPool}</strong><small>达人、Deal 站、媒体统一沉淀</small></article>
          <article className="stat-card"><span>外联推进中</span><strong>{dashboard.overview.outreachInProgress}</strong><small>仍在推进的合作对象</small></article>
          <article className="stat-card"><span>高意向线索</span><strong>{dashboard.overview.warmLeads}</strong><small>已经回复或进入谈判</small></article>
          <article className="stat-card"><span>历史任务</span><strong>{dashboard.dataCenter.historyTaskCount}</strong><small>全部任务都能回看复盘</small></article>
        </section>

        <div className="content-grid two-up">
          <section className="workspace-card">
            <div className="section-title">
              <p>今天的待办</p>
              <h2>当前工作区里最值得优先处理的动作</h2>
            </div>
            <div className="bullet-grid">
              <article><strong>去任务页写清目标</strong><p>自然语言输入你要找谁、在哪个平台、怎么合作，系统会给出执行任务。</p></article>
              <article><strong>把任务交给外部执行器</strong><p>复制任务包后，可以直接带去小龙虾 OpenCloud、CloudX 或 ChatGPT 执行。</p></article>
              <article><strong>把结果贴回来</strong><p>外部执行后的名单、摘要和建议都需要回填回来，系统才会更新资产和后续动作。</p></article>
              <article><strong>去资产和会话继续推进</strong><p>回填后的对象会进入资产池和会话页，后续跟进都在这里继续做。</p></article>
            </div>
          </section>

          <section className="workspace-card">
            <div className="section-title">
              <p>最近结果</p>
              <h2>已经写回系统的执行结果</h2>
            </div>
            <div className="timeline-list">
              {dashboard.recentResults.length ? dashboard.recentResults.map((item) => (
                <article key={item.id} className="timeline-item">
                  <header><strong>{parseInstruction({ instruction: item.instruction }).title}</strong><span>{shortDate(item.completedAt)}</span></header>
                  <p>{item.summary || '已完成回填。'}</p>
                </article>
              )) : <div className="empty-box">还没有最近结果，先创建一个任务再推进一次完整回填。</div>}
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderTasksPage() {
    const counts = assetStageCounts(activeAssets)
    return (
      <div className="panel-stack">
        <div className="content-grid two-up wide-right">
          <section className="workspace-card">
            <div className="section-title">
              <p>新任务</p>
              <h2>像 ChatGPT 一样输入目标，但输出的是可执行的外联任务。</h2>
            </div>

            <label className="field-block">
              <span>自然语言任务输入</span>
              <textarea className="textarea large" value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} placeholder="例如：帮我找 50 个美国健身类 TikTok 达人，合作方式是寄样 + 佣金，佣金不超过 14%。" />
            </label>

            <div className="chip-row">
              {quickExamples.map((item) => (
                <button key={item} type="button" className="chip-button" onClick={() => setTaskPrompt(item)}>
                  {item}
                </button>
              ))}
            </div>

            <div className="draft-grid">
              <article><span>对象类型</span><strong>{promptDraft.objectType}</strong></article>
              <article><span>执行方式</span><strong>{promptDraft.workflow}</strong></article>
              <article><span>目标平台</span><strong>{promptDraft.targets.join(' / ')}</strong></article>
              <article><span>沉淀内容</span><strong>{promptDraft.memory.join(' / ')}</strong></article>
            </div>

            <div className="action-bar">
              <button type="button" className="primary-button" onClick={createTask} disabled={loading}>{loading ? '创建中...' : '创建任务'}</button>
            </div>
          </section>

          <section className="workspace-card">
            <div className="section-title">
              <p>当前任务</p>
              <h2>{activeTaskSummary?.title || '先从左侧选择一个任务'}</h2>
            </div>

            {activeTask ? (
              <>
                <div className="summary-grid">
                  <article><span>产品</span><strong>{activeTaskSummary.product}</strong></article>
                  <article><span>市场</span><strong>{activeTaskSummary.market}</strong></article>
                  <article><span>平台</span><strong>{activeTaskSummary.platforms}</strong></article>
                  <article><span>约束</span><strong>{activeTaskSummary.constraints}</strong></article>
                </div>

                <div className="funnel-grid compact">
                  {Object.entries(counts).map(([label, value]) => (
                    <article key={label} className={`funnel-card ${stageClass(label)}`}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </article>
                  ))}
                </div>

                <div className="package-block">
                  <div className="section-title compact">
                    <p>执行任务包</p>
                    <h3>{activeTask.executionPackage?.title || '当前暂无执行任务包'}</h3>
                  </div>
                  <pre>{activeTask.executionPackage?.content || '创建任务后，这里会生成真正可复制、可下载、可带去外部执行器的任务包。'}</pre>
                  <div className="action-bar wrap">
                    <button type="button" className="secondary-button" onClick={copyExecutionPackage}>仅复制任务包</button>
                    <button type="button" className="secondary-button" onClick={downloadExecutionPackage}>下载 txt</button>
                    <button type="button" className="primary-button" onClick={() => launchExternal(channelConfig.opencloudUrl, '小龙虾 OpenCloud')} disabled={loading}>复制给小龙虾 OpenCloud</button>
                    <button type="button" className="secondary-button" onClick={() => launchExternal(channelConfig.codexUrl, 'CloudX / ChatGPT')} disabled={loading}>复制给 CloudX / ChatGPT</button>
                    <button type="button" className="secondary-button" onClick={markWaitingRefill} disabled={loading}>我已经跑完，准备回填</button>
                  </div>
                </div>

                <div className="workspace-subgrid">
                  <section className="subsurface">
                    <div className="section-title compact">
                      <p>回填结果</p>
                      <h3>把外部执行器跑出来的结果贴回来。</h3>
                    </div>
                    <textarea className="textarea medium" value={refillDraft} onChange={(event) => setRefillDraft(event.target.value)} placeholder="把小龙虾 OpenCloud、CloudX、ChatGPT 或人工执行后的摘要、名单、证据与建议粘贴在这里。" />
                    <button type="button" className="primary-button" onClick={submitRefill} disabled={loading}>写入结果</button>
                  </section>

                  <section className="subsurface">
                    <div className="section-title compact">
                      <p>执行日志</p>
                      <h3>任务真实推进记录</h3>
                    </div>
                    <div className="timeline-list compact">
                      {(activeTask.logs || []).length ? activeTask.logs.map((item, index) => (
                        <article key={`${item.at}-${index}`} className="timeline-item">
                          <header><strong>{item.message}</strong><span>{shortDate(item.at)}</span></header>
                          <p>{formatDateTime(item.at)}</p>
                        </article>
                      )) : <div className="empty-box">还没有日志。</div>}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="empty-box">还没有任务。左边可以新建或切换任务。</div>
            )}
          </section>
        </div>
      </div>
    )
  }

  function renderAssetsPage() {
    return (
      <div className="panel-stack">
        <section className="workspace-card">
          <div className="section-title">
            <p>品牌资产池</p>
            <h2>这不是红人名单，而是长期可复用的外联资产。</h2>
          </div>

          <div className="toolbar-row">
            <input className="search-input" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="搜索名称、平台、状态、处理方式" />
            <div className="toolbar-spacer" />
            <button type="button" className="secondary-button" onClick={selectAllVisibleAssets}>
              {selectedAssetIds.length === filteredAssets.length && filteredAssets.length ? '取消全选' : '全选当前结果'}
            </button>
          </div>

          <div className="funnel-grid">
            {stageOptions.map((label) => (
              <article key={label} className={`funnel-card ${stageClass(label)}`}>
                <span>{label}</span>
                <strong>{stageCounts[label] || 0}</strong>
              </article>
            ))}
          </div>

          {selectedAssetIds.length ? (
            <div className="bulk-strip">
              <strong>已选 {selectedAssetIds.length} 条资产</strong>
              <select value={bulkAction.status} onChange={(event) => setBulkAction((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="">批量修改状态</option>
                {stageOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select value={bulkAction.handling} onChange={(event) => setBulkAction((prev) => ({ ...prev, handling: event.target.value }))}>
                <option value="">批量修改处理方式</option>
                {handlingOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <input value={bulkAction.nextAction} onChange={(event) => setBulkAction((prev) => ({ ...prev, nextAction: event.target.value }))} placeholder="统一下一步动作" />
              <input type="datetime-local" value={bulkAction.reminderAt} onChange={(event) => setBulkAction((prev) => ({ ...prev, reminderAt: event.target.value }))} />
              <input value={bulkAction.reminderNote} onChange={(event) => setBulkAction((prev) => ({ ...prev, reminderNote: event.target.value }))} placeholder="提醒备注" />
              <button type="button" className="primary-button" onClick={applyBulkUpdate} disabled={loading}>应用批量操作</button>
            </div>
          ) : null}

          <div className="data-table">
            <div className="table-head">
              <span />
              <span>对象</span>
              <span>类型 / 平台</span>
              <span>匹配</span>
              <span>状态</span>
              <span>处理方式</span>
              <span>触达方式</span>
              <span>下一步</span>
            </div>
            <div className="table-body">
              {filteredAssets.length ? filteredAssets.map((asset) => (
                <button key={asset.id} type="button" className={selectedAsset?.id === asset.id ? 'table-row active' : 'table-row'} onClick={() => setSelectedAssetId(asset.id)}>
                  <span onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAssetSelection(asset.id)} />
                  </span>
                  <span><strong>{asset.name}</strong><small>{asset.followers || asset.relationship || '-'}</small></span>
                  <span><strong>{asset.type}</strong><small>{asset.platform}</small></span>
                  <span>{asset.fitScore}</span>
                  <span><em className={`status-chip ${stageClass(asset.status)}`}>{asset.status}</em></span>
                  <span>{asset.handling}</span>
                  <span>{asset.contact}</span>
                  <span>{asset.nextAction}</span>
                </button>
              )) : <div className="empty-box">当前任务还没有资产结果。</div>}
            </div>
          </div>
        </section>
      </div>
    )
  }

  function renderConversationsPage() {
    return (
      <div className="panel-stack">
        <div className="conversation-layout">
          <section className="workspace-card slim-card">
            <div className="section-title">
              <p>会话收件箱</p>
              <h2>集中处理所有回复</h2>
            </div>
            <input className="search-input" value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="搜索对象、状态、任务" />
            <div className="inbox-list">
              {inboxAssets.length ? inboxAssets.map((asset) => (
                <button key={asset.id} type="button" className={selectedConversationAsset?.id === asset.id ? 'inbox-item active' : 'inbox-item'} onClick={() => { setSelectedAssetId(asset.id); setActiveTaskId(asset.taskId) }}>
                  <div><strong>{asset.name}</strong><small>{asset.taskTitle}</small></div>
                  <em className={`status-chip ${stageClass(asset.status)}`}>{asset.status}</em>
                  <p>{asset.lastAction}</p>
                </button>
              )) : <div className="empty-box">暂时没有会话。</div>}
            </div>
          </section>

          <section className="workspace-card">
            <div className="section-title">
              <p>消息流</p>
              <h2>{selectedConversationAsset?.name || '选择一条会话'}</h2>
            </div>

            {selectedConversationAsset ? (
              <>
                <div className="thread-meta">
                  <span>{selectedConversationAsset.platform}</span>
                  <span>{selectedConversationAsset.contact}</span>
                  <span>{selectedConversationAsset.handling}</span>
                  <span>{selectedConversationAsset.taskTitle || parseInstruction(activeTask || {}).title}</span>
                </div>

                <div className="message-stream">
                  {(selectedConversationAsset.conversation || []).map((message, index) => (
                    <article key={`${selectedConversationAsset.id}-${index}`} className={`message-bubble ${message.role === 'agent' ? 'mine' : 'theirs'}`}>
                      <strong>{message.role === 'agent' ? '我方' : '对方'}</strong>
                      <p>{message.text}</p>
                    </article>
                  ))}
                </div>

                <label className="field-block">
                  <span>回复草案</span>
                  <textarea className="textarea medium" value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} placeholder="在这里编辑要发出的回复。" />
                </label>

                <div className="action-bar wrap">
                  <button type="button" className="primary-button" onClick={sendReply} disabled={loading || !replyDraft.trim()}>发送回复</button>
                  <button type="button" className="secondary-button" onClick={() => openUrl(selectedConversationLinks.profileUrl)}>打开对象页面</button>
                  <button type="button" className="secondary-button" onClick={() => openUrl(selectedConversationLinks.gmailUrl)}>Gmail</button>
                  <button type="button" className="secondary-button" disabled={!selectedConversationLinks.whatsappUrl} onClick={() => openUrl(selectedConversationLinks.whatsappUrl)}>WhatsApp</button>
                </div>
              </>
            ) : <div className="empty-box">先从左侧选择一条会话。</div>}
          </section>
        </div>
      </div>
    )
  }

  function renderBrandPage() {
    return (
      <section className="workspace-card">
        <div className="section-title">
          <p>品牌资料底座</p>
          <h2>这里是整套系统调用上下文的来源。</h2>
        </div>
        <div className="form-grid">
          <label className="field-block"><span>品牌介绍</span><textarea className="textarea medium" value={brandProfile.intro} onChange={(event) => setBrandProfile((prev) => ({ ...prev, intro: event.target.value }))} /></label>
          <label className="field-block"><span>产品卖点 / SKU</span><textarea className="textarea medium" value={brandProfile.productPoints} onChange={(event) => setBrandProfile((prev) => ({ ...prev, productPoints: event.target.value }))} /></label>
          <label className="field-block"><span>可接受合作方式</span><textarea className="textarea medium" value={brandProfile.cooperationModes} onChange={(event) => setBrandProfile((prev) => ({ ...prev, cooperationModes: event.target.value }))} /></label>
          <label className="field-block"><span>过往案例 / 证明</span><textarea className="textarea medium" value={brandProfile.campaignProof} onChange={(event) => setBrandProfile((prev) => ({ ...prev, campaignProof: event.target.value }))} /></label>
          <label className="field-block full"><span>常见问题 / FAQ</span><textarea className="textarea medium" value={brandProfile.faq} onChange={(event) => setBrandProfile((prev) => ({ ...prev, faq: event.target.value }))} /></label>
        </div>
        <div className="action-bar"><button type="button" className="primary-button" onClick={() => savePreferences('品牌资料')} disabled={loading}>保存品牌资料</button></div>
      </section>
    )
  }

  function renderChannelsPage() {
    const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(channelConfig.youtubeWorkspace || brandProfile.productPoints)}`
    const instagramUrl = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(channelConfig.instagramWorkspace || brandProfile.productPoints)}`
    const tiktokUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(channelConfig.tiktokWorkspace || brandProfile.productPoints)}`
    const whatsappTestUrl = channelConfig.whatsappNumber ? `https://wa.me/${String(channelConfig.whatsappNumber).replace(/\D/g, '')}?text=${encodeURIComponent('Hello from Fangzhou AI')}` : ''

    return (
      <section className="workspace-card">
        <div className="section-title">
          <p>通道状态</p>
          <h2>这里不是摆设，而是你实际启动外部动作的地方。</h2>
        </div>

        <div className="connector-grid">
          <article className="connector-card"><header><strong>小龙虾 OpenCloud</strong><em>外部执行器</em></header><p>复制任务包后，直接把外联任务送去跑。</p><button type="button" className="secondary-button" onClick={() => openUrl(channelConfig.opencloudUrl)}>打开小龙虾 OpenCloud</button></article>
          <article className="connector-card"><header><strong>CloudX / ChatGPT</strong><em>外部执行器</em></header><p>适合文本处理、执行总结、补结构化回填。</p><button type="button" className="secondary-button" onClick={() => openUrl(channelConfig.codexUrl)}>打开 CloudX / ChatGPT</button></article>
          <article className="connector-card"><header><strong>YouTube</strong><em>可抓取</em></header><p>按工作空间关键词直接打开搜索结果页。</p><button type="button" className="secondary-button" onClick={() => openUrl(youtubeUrl)}>打开 YouTube 工作空间</button></article>
          <article className="connector-card"><header><strong>Instagram</strong><em>可抓取 / 可私信</em></header><p>按工作空间关键词打开探索搜索。</p><button type="button" className="secondary-button" onClick={() => openUrl(instagramUrl)}>打开 Instagram 工作空间</button></article>
          <article className="connector-card"><header><strong>TikTok</strong><em>可抓取</em></header><p>直接用关键词进入 TikTok 搜索结果。</p><button type="button" className="secondary-button" onClick={() => openUrl(tiktokUrl)}>打开 TikTok 工作空间</button></article>
          <article className="connector-card"><header><strong>WhatsApp</strong><em>可发起会话</em></header><p>配置测试号码后，可以直接拉起 WhatsApp 会话。</p><button type="button" className="secondary-button" disabled={!whatsappTestUrl} onClick={() => openUrl(whatsappTestUrl)}>测试 WhatsApp</button></article>
        </div>

        <div className="form-grid">
          <label className="field-block"><span>小龙虾 OpenCloud 地址</span><input value={channelConfig.opencloudUrl} onChange={(event) => setChannelConfig((prev) => ({ ...prev, opencloudUrl: event.target.value }))} /></label>
          <label className="field-block"><span>CloudX / ChatGPT 地址</span><input value={channelConfig.codexUrl} onChange={(event) => setChannelConfig((prev) => ({ ...prev, codexUrl: event.target.value }))} /></label>
          <label className="field-block"><span>Gmail 发件邮箱</span><input value={channelConfig.gmailSender} onChange={(event) => setChannelConfig((prev) => ({ ...prev, gmailSender: event.target.value }))} /></label>
          <label className="field-block"><span>WhatsApp 测试号码</span><input value={channelConfig.whatsappNumber} onChange={(event) => setChannelConfig((prev) => ({ ...prev, whatsappNumber: event.target.value }))} placeholder="例如 15551234567" /></label>
          <label className="field-block"><span>YouTube 工作空间关键词</span><input value={channelConfig.youtubeWorkspace} onChange={(event) => setChannelConfig((prev) => ({ ...prev, youtubeWorkspace: event.target.value }))} /></label>
          <label className="field-block"><span>Instagram 工作空间关键词</span><input value={channelConfig.instagramWorkspace} onChange={(event) => setChannelConfig((prev) => ({ ...prev, instagramWorkspace: event.target.value }))} /></label>
          <label className="field-block"><span>TikTok 工作空间关键词</span><input value={channelConfig.tiktokWorkspace} onChange={(event) => setChannelConfig((prev) => ({ ...prev, tiktokWorkspace: event.target.value }))} /></label>
          <label className="field-block full"><span>Gmail 默认签名</span><textarea className="textarea medium" value={channelConfig.gmailSignature} onChange={(event) => setChannelConfig((prev) => ({ ...prev, gmailSignature: event.target.value }))} /></label>
        </div>

        <div className="action-bar"><button type="button" className="primary-button" onClick={() => savePreferences('通道配置')} disabled={loading}>保存通道配置</button></div>
      </section>
    )
  }

  function renderSettingsPage() {
    return (
      <section className="workspace-card">
        <div className="section-title">
          <p>系统设置</p>
          <h2>定义默认语气、跟进规则和总结规则。</h2>
        </div>
        <div className="form-grid">
          <label className="field-block"><span>默认英文风格</span><input value={settingsState.englishTone} onChange={(event) => setSettingsState((prev) => ({ ...prev, englishTone: event.target.value }))} /></label>
          <label className="field-block"><span>自动跟进规则</span><input value={settingsState.followupRule} onChange={(event) => setSettingsState((prev) => ({ ...prev, followupRule: event.target.value }))} /></label>
          <label className="field-block full"><span>回填总结规则</span><textarea className="textarea medium" value={settingsState.summaryRule} onChange={(event) => setSettingsState((prev) => ({ ...prev, summaryRule: event.target.value }))} /></label>
        </div>
        <div className="action-bar"><button type="button" className="primary-button" onClick={() => savePreferences('系统设置')} disabled={loading}>保存系统设置</button></div>
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
        <div className="rail-stack">
          <section className="rail-card">
            <p className="rail-kicker">任务说明</p>
            {activeTaskSummary ? (
              <>
                <h3>{activeTaskSummary.title}</h3>
                <dl className="meta-list">
                  <div><dt>产品</dt><dd>{activeTaskSummary.product}</dd></div>
                  <div><dt>市场</dt><dd>{activeTaskSummary.market}</dd></div>
                  <div><dt>平台</dt><dd>{activeTaskSummary.platforms}</dd></div>
                  <div><dt>触达方式</dt><dd>{activeTaskSummary.outreach}</dd></div>
                  <div><dt>合作约束</dt><dd>{activeTaskSummary.constraints}</dd></div>
                  <div><dt>目标</dt><dd>{activeTaskSummary.target}</dd></div>
                </dl>
              </>
            ) : <p className="empty-note">先创建一个任务。</p>}
          </section>
          <section className="rail-card">
            <p className="rail-kicker">AI 建议</p>
            <div className="note-list">
              <p>1. 先把执行包复制出去，再打开外部 Agent。</p>
              <p>2. 跑完后不要只留在聊天窗口里，必须回填回来。</p>
              <p>3. 回填完成后，再去资产页和会话页继续推进。</p>
            </div>
          </section>
        </div>
      )
    }

    if (pageId === 'assets') {
      return (
        <div className="rail-stack">
          <section className="rail-card">
            <p className="rail-kicker">当前资产</p>
            {selectedAsset ? (
              <>
                <h3>{selectedAsset.name}</h3>
                <dl className="meta-list">
                  <div><dt>对象类型</dt><dd>{selectedAsset.type}</dd></div>
                  <div><dt>平台</dt><dd>{selectedAsset.platform}</dd></div>
                  <div><dt>状态</dt><dd>{selectedAsset.status}</dd></div>
                  <div><dt>处理方式</dt><dd>{selectedAsset.handling}</dd></div>
                  <div><dt>触达方式</dt><dd>{selectedAsset.contact}</dd></div>
                </dl>
                <div className="editor-block">
                  <label className="field-block tight"><span>状态</span><select value={assetEditor.status} onChange={(event) => setAssetEditor((prev) => ({ ...prev, status: event.target.value }))}>{stageOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="field-block tight"><span>处理方式</span><select value={assetEditor.handling} onChange={(event) => setAssetEditor((prev) => ({ ...prev, handling: event.target.value }))}>{handlingOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="field-block tight"><span>下一步动作</span><textarea className="textarea small" value={assetEditor.nextAction} onChange={(event) => setAssetEditor((prev) => ({ ...prev, nextAction: event.target.value }))} /></label>
                  <label className="field-block tight"><span>提醒时间</span><input type="datetime-local" value={assetEditor.reminderAt} onChange={(event) => setAssetEditor((prev) => ({ ...prev, reminderAt: event.target.value }))} /></label>
                  <label className="field-block tight"><span>提醒备注</span><input value={assetEditor.reminderNote} onChange={(event) => setAssetEditor((prev) => ({ ...prev, reminderNote: event.target.value }))} /></label>
                  <button type="button" className="primary-button full-width" onClick={saveSelectedAsset} disabled={loading}>保存资产动作</button>
                </div>
                <div className="action-column">
                  <button type="button" className="secondary-button" onClick={() => openUrl(selectedLinks.profileUrl)}>打开对象页面</button>
                  <button type="button" className="secondary-button" onClick={() => openUrl(selectedLinks.gmailUrl)}>Gmail 触达</button>
                  <button type="button" className="secondary-button" disabled={!selectedLinks.whatsappUrl} onClick={() => openUrl(selectedLinks.whatsappUrl)}>WhatsApp 触达</button>
                </div>
              </>
            ) : <p className="empty-note">选择一条资产后，这里会显示真实动作。</p>}
          </section>
        </div>
      )
    }

    if (pageId === 'conversations') {
      return (
        <div className="rail-stack">
          <section className="rail-card">
            <p className="rail-kicker">AI 副驾驶</p>
            {selectedConversationAsset ? (
              <>
                <h3>{selectedConversationAsset.name}</h3>
                <dl className="meta-list">
                  <div><dt>当前状态</dt><dd>{selectedConversationAsset.status}</dd></div>
                  <div><dt>处理方式</dt><dd>{selectedConversationAsset.handling}</dd></div>
                  <div><dt>最近动作</dt><dd>{selectedConversationAsset.lastAction}</dd></div>
                </dl>
              </>
            ) : <p className="empty-note">先选择会话。</p>}
          </section>
          {selectedSuggestions.map((item) => (
            <section key={item.title} className="rail-card suggestion-card">
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <button type="button" className="chip-button align-start" onClick={() => setReplyDraft(item.body)}>放入回复框</button>
            </section>
          ))}
        </div>
      )
    }

    return (
      <div className="rail-stack">
        <section className="rail-card">
          <p className="rail-kicker">当前品牌</p>
          <h3>{currentBrand?.name || '未选择品牌'}</h3>
          <p className="empty-note">{currentBrand?.overview || '这里显示当前品牌的工作语境。'}</p>
        </section>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="login-shell">
        {error ? <div className="error-banner floating">{error}</div> : null}
        <section className="login-panel intro-panel">
          <p className="hero-kicker">Outreach Shell for External Agents</p>
          <h1>方洲AI</h1>
          <p className="login-copy">它不是一个只会建联的工具页。你在这里写任务、看回填、管资产、处理回复，真正的执行再交给外部执行器去跑。</p>
          <div className="intro-grid">
            <article><strong>先写任务</strong><p>像 ChatGPT 一样输入目标，但系统输出的是可执行的外联任务。</p></article>
            <article><strong>再交给外部执行器</strong><p>可以带去小龙虾 OpenCloud、CloudX、ChatGPT，或者你自己的人来跑。</p></article>
            <article><strong>最后收回结果</strong><p>结果贴回来后，会更新成摘要、提醒、会话和品牌资产。</p></article>
          </div>
        </section>

        <section className="login-panel auth-panel">
          <div className="auth-switch">
            <button type="button" className={authTab === 'login' ? 'chip-button active' : 'chip-button'} onClick={() => setAuthTab('login')}>登录</button>
            <button type="button" className={authTab === 'register' ? 'chip-button active' : 'chip-button'} onClick={() => setAuthTab('register')}>注册</button>
          </div>
          {authTab === 'login' ? (
            <div className="form-grid single">
              <label className="field-block"><span>邮箱</span><input value={loginForm.username} onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))} /></label>
              <label className="field-block"><span>密码</span><input type="password" value={loginForm.password} onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))} /></label>
              <button type="button" className="primary-button full-width" onClick={handleLogin} disabled={loading}>{loading ? '登录中...' : '进入系统'}</button>
            </div>
          ) : (
            <div className="form-grid single">
              <label className="field-block"><span>姓名</span><input value={registerForm.name} onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
              <label className="field-block"><span>邮箱</span><input value={registerForm.email} onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))} /></label>
              <label className="field-block"><span>密码</span><input type="password" value={registerForm.password} onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))} /></label>
              <button type="button" className="primary-button full-width" onClick={handleRegister} disabled={loading}>{loading ? '注册中...' : '注册并进入'}</button>
            </div>
          )}
          <div className="auth-footnote"><span>存储：{bootstrap.storageMode}</span><span>账号：{bootstrap.authMode}</span></div>
        </section>
      </div>
    )
  }

  return (
    <div className={sidebarCollapsed ? 'shell-app collapsed' : 'shell-app'}>
      {error ? <div className="error-banner floating">{error}</div> : null}
      {notice ? <div className="notice-banner floating">{notice}</div> : null}

      <aside className="sidebar">
        <div className="sidebar-header">
          <button type="button" className="logo-badge" onClick={() => setSidebarCollapsed((prev) => !prev)}>洲</button>
          {!sidebarCollapsed ? <div className="brand-block"><p>方洲AI</p><strong>外联与资产系统</strong></div> : null}
        </div>
        {!sidebarCollapsed ? (
          <>
            <label className="field-block tight"><span>品牌空间</span><select value={brandId} onChange={(event) => setBrandId(event.target.value)}>{bootstrap.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
            <button type="button" className="primary-button full-width" onClick={() => setPageId('tasks')}>+ 新建任务</button>
            <input className="search-input" value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="搜索任务 / SKU / 市场" />
          </>
        ) : null}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button key={item.id} type="button" className={pageId === item.id ? 'nav-link active' : 'nav-link'} onClick={() => setPageId(item.id)} title={item.label}><span>{item.label}</span></button>
          ))}
        </nav>
        {!sidebarCollapsed ? (
          <>
            <section className="sidebar-section">
              <div className="sidebar-section-head"><p>最近任务</p></div>
              <div className="sidebar-scroll">
                {visibleTasks.length ? visibleTasks.map((task) => {
                  const summary = parseInstruction(task)
                  return <button key={task.id} type="button" className={activeTask?.id === task.id ? 'sidebar-item active' : 'sidebar-item'} onClick={() => { setActiveTaskId(task.id); setPageId('tasks') }}><strong>{summary.title}</strong><small>{summary.market} / {summary.product}</small><em>{normalizeTaskStatus(task.status)}</em></button>
                }) : <div className="sidebar-empty">还没有任务。</div>}
              </div>
            </section>
            <section className="sidebar-section">
              <div className="sidebar-section-head"><p>最近会话</p></div>
              <div className="sidebar-scroll compact-scroll">
                {allConversationAssets.slice(0, 5).map((asset) => (
                  <button key={asset.id} type="button" className="sidebar-item slim" onClick={() => { setPageId('conversations'); setActiveTaskId(asset.taskId); setSelectedAssetId(asset.id) }}>
                    <strong>{asset.name}</strong>
                    <small>{asset.lastAction}</small>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : null}
        <div className="sidebar-footer">
          {!sidebarCollapsed ? (
            <>
              <div className="user-panel"><strong>{currentUser?.name || '当前用户'}</strong><small>{currentUser?.username || '-'}</small></div>
              <button type="button" className="chip-button align-start" onClick={handleLogout}>退出</button>
            </>
          ) : <button type="button" className="chip-button icon-only" onClick={handleLogout} title="退出">退</button>}
        </div>
      </aside>

      <main className="workspace">
        <header className="context-strip">
          <div><strong>{currentBrand?.name || '未选择品牌'}</strong><p>{currentBrand?.overview || '这里显示当前品牌的工作语境。'}</p></div>
          <div className="context-tags"><span>{currentUser?.name || '当前用户'}</span><span>{currentUser?.username || '-'}</span></div>
        </header>
        <section className="workspace-body">{renderCenterContent()}</section>
      </main>

      <aside className="right-rail">{renderRightRail()}</aside>
    </div>
  )
}

export default App
