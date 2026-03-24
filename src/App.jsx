import { useEffect, useMemo, useState } from 'react'
import './app.css'

const TOKEN_KEY = 'fangzhou_auth_token'

const loginSeed = {
  username: 'demo@fangzhou.ai',
  password: 'demo123',
}

const quickPrompts = [
  '帮我创建一个美国市场的春季外联任务，目标对象包含测评频道、渠道站点和 affiliate partner。',
  '帮我整理一批适合新品冷启动的渠道站点，输出联系人、切入点和优先级。',
  '帮我建立一个 YouTube 测评合作任务，优先支持寄样和 CPS 的账号。',
  '帮我整理一批 wellness 媒体合作名单，并生成第一轮沟通框架。',
]

const navItems = [
  { id: 'tasks', label: '案件对话' },
  { id: 'brand', label: '品牌记忆' },
  { id: 'channels', label: 'Agent 连接' },
  { id: 'settings', label: '系统偏好' },
]

const funnelOrder = ['已抓取', '初筛通过', '已触达', '已回复', '洽谈中', '已确认合作', '待人工接管']
const handlingOptions = ['自动触达', 'AI辅助回复', '人工接管']
const stageOptions = ['已抓取', '初筛通过', '已触达', '已回复', '洽谈中', '已确认合作', '待人工接管']

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

const defaultPreferences = {
  brandProfile: {
    intro: '',
    primaryProducts: '',
    productLinks: '',
    quarterFocus: '',
    pricingStrategy: '',
    productPoints: '',
    cooperationModes: '',
    campaignProof: '',
    faq: '',
  },
  channelConfig: {
    provider: 'codex',
    opencloudName: 'OpenClaw Workspace',
    opencloudUrl: '',
    codexName: 'Codex / ChatGPT',
    codexUrl: 'https://chatgpt.com',
    gmailSender: '',
    gmailSignature: 'Best regards,\nFangzhou AI',
    whatsappNumber: '',
    youtubeWorkspace: '',
    instagramWorkspace: '',
    tiktokWorkspace: '',
  },
  settings: {
    englishTone: '自然专业',
    followupRule: '',
    summaryRule: '',
  },
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

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(href)
}

function copyText(text) {
  if (!text) return Promise.resolve()
  return navigator.clipboard?.writeText(text) || Promise.resolve()
}

function inferObjectType(text) {
  const lowered = String(text || '').toLowerCase()
  if (!lowered.trim()) return '待解析'
  const matchedCategories = [
    /deal/.test(lowered),
    /pr|媒体/.test(lowered),
    /affiliate|联盟/.test(lowered),
    /creator|influencer|达人|红人|tiktok|instagram|youtube/.test(lowered),
  ].filter(Boolean).length

  if (matchedCategories >= 2) return '外联对象组合'
  if (lowered.includes('deal')) return 'Deal 站'
  if (lowered.includes('pr') || lowered.includes('媒体')) return '媒体 / PR'
  if (lowered.includes('affiliate') || lowered.includes('联盟')) return '联盟客'
  return '创作者 / 合作对象'
}

function inferPlatforms(text) {
  const lowered = String(text || '').toLowerCase()
  if (!lowered.trim()) return '待解析'
  const matches = []
  if (lowered.includes('tiktok')) matches.push('TikTok')
  if (lowered.includes('instagram')) matches.push('Instagram')
  if (lowered.includes('youtube')) matches.push('YouTube')
  if (lowered.includes('deal')) matches.push('Deal 站')
  if (!matches.length) matches.push('TikTok', 'Instagram')
  return matches.join(' / ')
}

function inferChannel(text) {
  const lowered = String(text || '').toLowerCase()
  if (!lowered.trim()) return '待解析'
  if (lowered.includes('gmail') || lowered.includes('email') || lowered.includes('邮箱')) return 'Gmail / 邮件'
  if (lowered.includes('whatsapp')) return 'WhatsApp'
  if (lowered.includes('dm')) return '私信'
  return '邮件 + 私信'
}

function inferMarket(text) {
  const lowered = String(text || '').toLowerCase()
  if (!lowered.trim()) return '待确认'
  if (lowered.includes('美国') || lowered.includes('us')) return '美国'
  if (lowered.includes('英国') || lowered.includes('uk')) return '英国'
  if (lowered.includes('欧洲') || lowered.includes('eu')) return '欧洲'
  return '未限定'
}

function inferGoal(text) {
  if (!String(text || '').trim()) return '待确认'
  const match = String(text || '').match(/(\d+)\s*(位|个|条|人)/)
  return match ? `${match[1]} ${match[2]}` : '待确认'
}

function compactText(text, max = 24) {
  const value = String(text || '').trim()
  if (!value) return '未命名任务'
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function deriveTaskTitle(text) {
  const content = String(text || '').trim()
  const market = inferMarket(content)
  if (/deal/i.test(content)) return `${market} 渠道站点搜集`
  if (/youtube/i.test(content)) return `${market} YouTube 外联`
  if (/pr|媒体/i.test(content)) return `${market} 媒体合作`
  if (/affiliate|联盟/i.test(content)) return `${market} 联盟客拓展`
  if (/达人|tiktok|instagram/i.test(content)) return `${market} 创作者外联`
  return compactText(content, 18)
}

function getLineValue(text, label) {
  const line = String(text || '')
    .split('\n')
    .find((item) => item.startsWith(`${label}：`) || item.startsWith(`${label}:`))

  if (!line) return ''
  const separatorIndex = line.includes('：') ? line.indexOf('：') : line.indexOf(':')
  return line.slice(separatorIndex + 1).trim()
}

function parseTaskSummary(task) {
  const instruction = String(task?.instruction || '')
  const objective = task?.structuredTask?.objective || instruction
  const fallbackTitle = deriveTaskTitle(objective.split('\n')[0] || objective)
  const rawTitle = getLineValue(instruction, '任务名称')
  const title = rawTitle && !/达人|红人|deal|首轮/i.test(rawTitle) ? rawTitle : fallbackTitle
  const product = getLineValue(instruction, '产品') || '未填写产品'
  const market = getLineValue(instruction, '市场') || inferMarket(objective)
  const platforms = getLineValue(instruction, '目标平台') || inferPlatforms(objective)
  const channel = getLineValue(instruction, '触达方式') || inferChannel(objective)
  const constraints = getLineValue(instruction, '合作约束') || '未填写合作约束'
  const goal = getLineValue(instruction, '目标触达') || inferGoal(objective)

  return {
    title: normalizeDisplayText(title),
    product,
    market,
    objectType: normalizeDisplayText(inferObjectType(objective)),
    platforms: normalizeDisplayText(platforms),
    channel,
    constraints,
    goal,
  }
}

function buildTaskDraft(prompt) {
  const text = String(prompt || '').trim()
  return {
    title: text ? deriveTaskTitle(text) : '等待输入目标',
    objectType: inferObjectType(text),
    market: inferMarket(text),
    platforms: inferPlatforms(text),
    channel: inferChannel(text),
    goal: inferGoal(text),
    constraints: text.includes('佣金') ? '按输入中的佣金边界执行' : '待补充合作约束',
  }
}

function channelState(config) {
  return [
    {
      name: config.opencloudName || 'OpenClaw Workspace',
      status: config.opencloudUrl ? '已配置' : '未配置',
      description: '这里放主 Agent 的网址。点“开始执行”时，会优先打开这里。',
    },
    {
      name: config.codexName || 'Codex / ChatGPT',
      status: config.codexUrl ? '已配置' : '未配置',
      description: '这里放备用 Agent 的网址。主 Agent 不可用时可以切到这里。',
    },
    {
      name: 'Gmail',
      status: config.gmailSender ? `发件身份：${config.gmailSender}` : '未配置发件身份',
      description: '用于从案件页直接拉起邮件草稿。',
    },
    {
      name: 'WhatsApp',
      status: config.whatsappNumber ? `号码：${config.whatsappNumber}` : '未配置号码',
      description: '用于从案件页直接拉起 WhatsApp 对话。',
    },
  ]
}

function getProviderOptions(config) {
  return [
    {
      id: 'opencloud',
      label: config.opencloudName || 'OpenClaw Workspace',
      url: config.opencloudUrl,
      hint: '主 Agent',
    },
    {
      id: 'codex',
      label: config.codexName || 'Codex / ChatGPT',
      url: config.codexUrl,
      hint: '备用 Agent',
    },
  ]
}

function sanitizePreferences(rawPreferences = {}) {
  const merged = {
    brandProfile: { ...defaultPreferences.brandProfile, ...(rawPreferences.brandProfile || {}) },
    channelConfig: { ...defaultPreferences.channelConfig, ...(rawPreferences.channelConfig || {}) },
    settings: { ...defaultPreferences.settings, ...(rawPreferences.settings || {}) },
  }

  if (merged.channelConfig.opencloudName === 'OpenCloud') merged.channelConfig.opencloudName = 'OpenClaw Workspace'
  if (merged.channelConfig.codexName === 'ChatGPT / CloudX') merged.channelConfig.codexName = 'Codex / ChatGPT'
  if (merged.channelConfig.opencloudUrl === 'https://app.opencloud.com') merged.channelConfig.opencloudUrl = ''
  if (!merged.channelConfig.codexUrl) merged.channelConfig.codexUrl = defaultPreferences.channelConfig.codexUrl
  if (String(merged.brandProfile.productLinks || '').includes('example.com')) {
    merged.brandProfile.productLinks = defaultPreferences.brandProfile.productLinks
  }

  if (!merged.channelConfig.opencloudUrl && merged.channelConfig.codexUrl) {
    merged.channelConfig.provider = merged.channelConfig.provider === 'opencloud' ? 'codex' : merged.channelConfig.provider
  }

  return merged
}

function buildMemoryDigest(profile) {
  return [
    { label: '本季度主推', value: profile.quarterFocus || '还没写' },
    { label: '主力产品', value: profile.primaryProducts || '还没写' },
    { label: '价格策略', value: profile.pricingStrategy || '还没写' },
    { label: '产品链接', value: profile.productLinks || '还没写' },
  ]
}

function displayTaskStatus(status) {
  const mapping = {
    '已生成交付包': '待执行',
    '执行中': '外部执行中',
    '待回填结果': '待贴回结果',
    '已完成交付': '已回填',
    '已提交给外部执行 Agent': '已发给外部 Agent',
    '等待回填结果': '等待贴回结果',
  }

  return mapping[status] || status || '待执行'
}

function statusClass(status) {
  if (status === '已确认合作' || status === '已回填' || String(status).includes('已完成')) return 'ok'
  if (status === '外部执行中' || status === '已发给外部 Agent') return 'hot'
  if (status === '待人工接管' || String(status).includes('待')) return 'warn'
  if (status === '洽谈中' || status === '已回复') return 'hot'
  return 'soft'
}

function buildSuggestions(lead, prefs) {
  if (!lead) return []
  const latest = lead.conversation?.at(-1)?.text || ''
  const intro = prefs.brandProfile.intro || '品牌记忆还没有补全'

  if (/fee|budget|报价|价格|charge/i.test(latest)) {
    return [
      { title: '压预算版', body: '感谢回复。这轮合作我们优先走寄样 + 佣金模式，当前不接受固定坑位费。如果你愿意，我们可以先跑一轮测试合作。' },
      { title: '继续沟通版', body: '谢谢你的报价。为了判断是否匹配，我先把本次合作目标和交付方式发给你，你看完后我们再确认更合适的合作结构。' },
      { title: '人工接管建议', body: '这条对话已经碰到预算边界，建议你人工接手，决定是否放宽当前合作约束。' },
    ]
  }

  if (/background|campaign|案例|品牌/i.test(latest)) {
    return [
      { title: '补品牌记忆', body: `这里建议先回品牌背景和合作目标。当前品牌记忆里的核心描述：${intro}` },
      { title: '补证明材料', body: '建议补品牌介绍、过往合作证明和这次的目标，再继续推进。' },
      { title: '先降复杂度', body: '如果目前资料不全，先给简版介绍和合作方向，再约下一轮更详细沟通。' },
    ]
  }

  return [
    { title: '自然版回复', body: '收到，我先整理一下这轮合作的重点信息，稍后把更完整的方案发给你。' },
    { title: '专业版回复', body: '感谢回复。我们会基于本轮目标和当前合作边界补一版更清楚的合作说明，再同步给你确认。' },
    { title: '推进下一步', body: '建议明确下一步动作，例如补资料、二次跟进或转人工接管，不要让会话停住。' },
  ]
}

function normalizePackageContent(content) {
  return String(content || '')
    .replace('# 方洲AI红人增长执行方案', '# 方洲AI外联执行提示')
    .replace('执行方案', '执行提示')
    .replace(/红人/g, '合作对象')
    .replace(/达人范围/g, '对象范围')
    .replace(/达人名称/g, '对象名称')
}

function normalizeLogMessage(message) {
  return normalizeDisplayText(message)
}

function normalizeObjectiveText(text) {
  return normalizeDisplayText(text)
}

function normalizeDisplayText(text) {
  return String(text || '')
    .replace(/红人/g, '创作者')
    .replace(/达人/g, '创作者')
    .replace(/Deal 站/g, '渠道站点')
    .replace(/Deal站/g, '渠道站点')
    .replace(/媒体\s*\/\s*PR/g, '媒体合作')
    .replace(/媒体 PR/g, '媒体合作')
    .replace(/辅助BD/g, 'AI辅助处理')
    .replace(/人工BD/g, '人工接管')
    .replace(/自动BD/g, '自动触达')
    .replace(/对象池/g, '资产')
    .replace(/达人名单/g, '对象名单')
}

function App() {
  const [bootstrapping, setBootstrapping] = useState(true)
  const [bootstrap, setBootstrap] = useState({ brands: [], modules: [] })
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(loginSeed)
  const [authMessage, setAuthMessage] = useState('')
  const [user, setUser] = useState(null)
  const [brands, setBrands] = useState([])
  const [brandId, setBrandId] = useState('')
  const [dashboard, setDashboard] = useState(emptyDashboard)
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [currentPage, setCurrentPage] = useState('tasks')
  const [taskPrompt, setTaskPrompt] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [selectedLeadIds, setSelectedLeadIds] = useState([])
  const [replyDraft, setReplyDraft] = useState('')
  const [refillDraft, setRefillDraft] = useState('')
  const [workspaceMessage, setWorkspaceMessage] = useState('')
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [savingBulk, setSavingBulk] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const [assetSearch, setAssetSearch] = useState('')
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkHandling, setBulkHandling] = useState('')
  const [bulkNextAction, setBulkNextAction] = useState('')
  const [bulkReminderNote, setBulkReminderNote] = useState('')
  const [bulkReminderAt, setBulkReminderAt] = useState('')
  const visibleBrands = useMemo(() => {
    if (user?.username === 'demo@fangzhou.ai') {
      return brands.filter((item) => item.id === 'brand-demo-2')
    }
    return brands
  }, [brands, user])

  const activeBrand = useMemo(
    () => visibleBrands.find((item) => item.id === brandId) || visibleBrands[0] || null,
    [visibleBrands, brandId],
  )

  const tasks = useMemo(() => dashboard.tasks || [], [dashboard.tasks])

  const filteredTasks = useMemo(() => {
    const keyword = taskSearch.trim().toLowerCase()
    if (!keyword) return tasks
    return tasks.filter((task) => {
      const summary = parseTaskSummary(task)
      return [summary.title, summary.market, summary.product, summary.platforms]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  }, [taskSearch, tasks])

  const activeTask = useMemo(() => {
    return tasks.find((task) => task.id === selectedTaskId) || tasks.find((task) => task.id === dashboard.activeTaskId) || tasks[0] || null
  }, [tasks, selectedTaskId, dashboard.activeTaskId])

  const currentTaskId = activeTask?.id || ''
  const currentLeads = useMemo(() => dashboard.leadsByTask?.[currentTaskId] || [], [dashboard.leadsByTask, currentTaskId])

  const filteredLeads = useMemo(() => {
    const keyword = assetSearch.trim().toLowerCase()
    if (!keyword) return currentLeads
    return currentLeads.filter((lead) =>
      [lead.name, lead.platform, lead.contact, lead.status, lead.handling, lead.notes]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [assetSearch, currentLeads])

  const activeLead = useMemo(() => {
    return currentLeads.find((lead) => lead.id === selectedLeadId) || currentLeads[0] || null
  }, [currentLeads, selectedLeadId])

  const taskSummary = useMemo(() => parseTaskSummary(activeTask), [activeTask])
  const taskDraft = useMemo(() => buildTaskDraft(taskPrompt), [taskPrompt])
  const taskSuggestions = useMemo(() => buildSuggestions(activeLead, preferences), [activeLead, preferences])
  const packageContent = useMemo(() => normalizePackageContent(activeTask?.executionPackage?.content || ''), [activeTask])
  const currentPageLabel = useMemo(() => navItems.find((item) => item.id === currentPage)?.label || '任务', [currentPage])
  const activeTaskStatus = displayTaskStatus(activeTask?.status)
  const providerOptions = useMemo(() => getProviderOptions(preferences.channelConfig), [preferences.channelConfig])
  const connectedProvider = useMemo(() => providerOptions.find((item) => item.id === preferences.channelConfig.provider) || providerOptions[0], [providerOptions, preferences.channelConfig.provider])
  const providerReady = Boolean(connectedProvider?.url)
  const memoryDigest = useMemo(() => buildMemoryDigest(preferences.brandProfile), [preferences.brandProfile])

  const taskSnapshot = useMemo(() => {
    const waitingForYou = currentLeads.filter((lead) => ['待人工接管', '已回复', '洽谈中'].includes(lead.status)).length
    const activeReplies = currentLeads.filter((lead) => ['已触达', '已回复', '洽谈中'].includes(lead.status)).length
    const nextReminder = [...currentLeads]
      .filter((lead) => lead.reminderAt)
      .sort((left, right) => String(left.reminderAt).localeCompare(String(right.reminderAt)))[0]

    return [
      {
        label: '当前状态',
        value: activeTaskStatus,
        note: activeTask?.refill ? '最新一轮结果已贴回系统' : '这条线程还在持续推进',
      },
      {
        label: '已沉淀对象',
        value: `${currentLeads.length}`,
        note: activeReplies ? `${activeReplies} 条已进入沟通` : '还没有进入沟通的对象',
      },
      {
        label: '待你处理',
        value: `${waitingForYou}`,
        note: waitingForYou ? '存在需要人工判断或跟进的对象' : '当前没有卡在人工处理的对象',
      },
      {
        label: '最近提醒',
        value: nextReminder ? shortDate(nextReminder.reminderAt) : '暂无',
        note: nextReminder ? `${nextReminder.name} · ${nextReminder.reminderNote || nextReminder.nextAction}` : '这条线程还没有设置提醒',
      },
    ]
  }, [currentLeads])

  const recentConversations = useMemo(() => {
    return [...currentLeads]
      .filter((lead) => Array.isArray(lead.conversation) && lead.conversation.length > 0)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 6)
  }, [currentLeads])

  useEffect(() => {
    if (!visibleBrands.length) return
    if (!visibleBrands.some((item) => item.id === brandId)) {
      setBrandId(visibleBrands[0].id)
    }
  }, [visibleBrands, brandId])

  useEffect(() => {
    let cancelled = false

    async function loadBootstrap() {
      try {
        const data = await apiFetch('/api/bootstrap')
        if (cancelled) return
        setBootstrap(data)
      } catch (error) {
        if (!cancelled) setWorkspaceMessage(error.message)
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    }

    loadBootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadUser() {
      if (!token) {
        setUser(null)
        setBrands([])
        setDashboard(emptyDashboard)
        return
      }

      try {
        const data = await apiFetch('/api/me', {}, token)
        if (cancelled) return
        setUser(data.user)
        setBrands(data.brands || [])
        setBrandId((current) => {
          if (current) return current
          const polishedDefault = data.brands?.find((brand) => brand.id === 'brand-demo-2')
          return polishedDefault?.id || data.brands?.[0]?.id || ''
        })
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        if (cancelled) return
        setToken('')
        setUser(null)
        setBrands([])
        setAuthMode('login')
      }
    }

    loadUser()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token || !brandId) return
    refreshWorkspace(brandId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, brandId])

  async function refreshWorkspace(targetBrandId = brandId) {
    try {
      const [dash, prefs] = await Promise.all([
        apiFetch(`/api/dashboard?brandId=${targetBrandId}`, {}, token),
        apiFetch(`/api/preferences?brandId=${targetBrandId}`, {}, token),
      ])
      setDashboard(dash)
      setPreferences(sanitizePreferences(prefs))
      setSelectedTaskId((current) => current || dash.activeTaskId || dash.tasks?.[0]?.id || '')
      setSelectedLeadId('')
      setSelectedLeadIds([])
    } catch (error) {
      setWorkspaceMessage(error.message)
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthMessage('')

    try {
      const endpoint = authMode === 'login' ? '/api/login' : '/api/register'
      const payload = await apiFetch(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify(authForm),
        },
        '',
      )
      localStorage.setItem(TOKEN_KEY, payload.token)
      setToken(payload.token)
    } catch (error) {
      setAuthMessage(error.message)
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setUser(null)
    setDashboard(emptyDashboard)
    setWorkspaceMessage('')
  }

  async function handleCreateTask() {
    if (!taskPrompt.trim() || !brandId) return
    if (!providerReady) {
      setCurrentPage('channels')
      setWorkspaceMessage('先去 Agent 连接页把地址填好，再创建任务。')
      return
    }
    setCreatingTask(true)
    setWorkspaceMessage('')

    try {
      await apiFetch(
        '/api/tasks',
        {
          method: 'POST',
          body: JSON.stringify({
            brandId,
            moduleId: bootstrap.modules?.[0]?.id || 'traffic-acquisition',
            instruction: taskPrompt.trim(),
          }),
        },
        token,
      )
      setTaskPrompt('')
      await refreshWorkspace(brandId)
      setCurrentPage('tasks')
      setWorkspaceMessage('新案件已创建。下一步把提示交给你连接的 Agent 去执行。')
    } catch (error) {
      setWorkspaceMessage(error.message)
    } finally {
      setCreatingTask(false)
    }
  }

  async function handleSubmitTask() {
    if (!activeTask) return
    try {
      await apiFetch(`/api/tasks/${activeTask.id}/submit`, { method: 'POST' }, token)
      await refreshWorkspace()
      setWorkspaceMessage('任务已标记为外部执行中。')
    } catch (error) {
      setWorkspaceMessage(error.message)
    }
  }

  async function handleMarkRefill() {
    if (!activeTask) return
    try {
      await apiFetch(`/api/tasks/${activeTask.id}/mark-refill`, { method: 'POST' }, token)
      await refreshWorkspace()
      setWorkspaceMessage('任务已切换为等待回填。')
    } catch (error) {
      setWorkspaceMessage(error.message)
    }
  }

  async function handleRefill() {
    if (!activeTask || !refillDraft.trim()) return
    try {
      await apiFetch(
        `/api/tasks/${activeTask.id}/refill`,
        {
          method: 'POST',
          body: JSON.stringify({ rawText: refillDraft.trim() }),
        },
        token,
      )
      setRefillDraft('')
      await refreshWorkspace()
      setWorkspaceMessage('结果已写入系统，并生成后续建议。')
    } catch (error) {
      setWorkspaceMessage(error.message)
    }
  }

  async function handleSendMessage() {
    if (!activeLead || !replyDraft.trim()) return
    try {
      await apiFetch(
        `/api/leads/${activeLead.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text: replyDraft.trim() }),
        },
        token,
      )
      setReplyDraft('')
      await refreshWorkspace()
      setWorkspaceMessage('回复已写入会话记录。')
    } catch (error) {
      setWorkspaceMessage(error.message)
    }
  }

  async function handleLeadPatch(patch) {
    if (!activeLead) return
    try {
      await apiFetch(
        `/api/leads/${activeLead.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        },
        token,
      )
      await refreshWorkspace()
      setWorkspaceMessage('对象状态已更新。')
    } catch (error) {
      setWorkspaceMessage(error.message)
    }
  }

  async function handleBulkApply() {
    if (!selectedLeadIds.length) return
    setSavingBulk(true)
    try {
      await apiFetch(
        '/api/leads/bulk-update',
        {
          method: 'POST',
          body: JSON.stringify({
            ids: selectedLeadIds,
            status: bulkStatus || undefined,
            handling: bulkHandling || undefined,
            nextAction: bulkNextAction || undefined,
            reminderAt: bulkReminderAt || undefined,
            reminderNote: bulkReminderNote || undefined,
          }),
        },
        token,
      )
      setSelectedLeadIds([])
      setBulkStatus('')
      setBulkHandling('')
      setBulkNextAction('')
      setBulkReminderAt('')
      setBulkReminderNote('')
      await refreshWorkspace()
      setWorkspaceMessage('批量操作已应用。')
    } catch (error) {
      setWorkspaceMessage(error.message)
    } finally {
      setSavingBulk(false)
    }
  }

  async function handleSavePreferences() {
    if (!brandId) return
    setSavingPreferences(true)
    try {
      await apiFetch(
        '/api/preferences',
        {
          method: 'PUT',
          body: JSON.stringify({
            brandId,
            brandProfile: preferences.brandProfile,
            channelConfig: preferences.channelConfig,
            settings: preferences.settings,
          }),
        },
        token,
      )
      setWorkspaceMessage('设置已保存。')
    } catch (error) {
      setWorkspaceMessage(error.message)
    } finally {
      setSavingPreferences(false)
    }
  }

  async function handleOpenWorkspace() {
    if (!providerReady) {
      setCurrentPage('channels')
      setWorkspaceMessage('先去 Agent 连接页把当前 Agent 地址填好。')
      return
    }

    try {
      if (activeTask && activeTask.status === '待执行') {
        await apiFetch(`/api/tasks/${activeTask.id}/submit`, { method: 'POST' }, token)
      }
      if (packageContent) {
        await copyText(packageContent)
      }
      openExternal(connectedProvider?.url)
      await refreshWorkspace()
      setWorkspaceMessage(`这条案件已标记为执行中，并已打开 ${connectedProvider?.label}。`)
    } catch (error) {
      setWorkspaceMessage(error.message)
    }
  }

  function openExternal(url) {
    if (!url) {
      setWorkspaceMessage('当前 Agent 还没有配置地址。')
      setCurrentPage('channels')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function openGmail(lead, draft = '') {
    const to = encodeURIComponent(lead?.email || '')
    const subject = encodeURIComponent(taskSummary.title || '合作沟通')
    const body = encodeURIComponent(draft || replyDraft || preferences.channelConfig.gmailSignature || '')
    openExternal(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`)
  }

  function openWhatsApp(lead, draft = '') {
    const phone = String(lead?.phone || preferences.channelConfig.whatsappNumber || '').replace(/[^\d]/g, '')
    if (!phone) return
    const text = encodeURIComponent(draft || replyDraft || '')
    openExternal(`https://wa.me/${phone}${text ? `?text=${text}` : ''}`)
  }

  function openProfile(lead) {
    const query = encodeURIComponent(`${lead?.name || ''} ${lead?.platform || ''}`)
    openExternal(`https://www.google.com/search?q=${query}`)
  }

  function toggleLeadSelection(id) {
    setSelectedLeadIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  if (bootstrapping) {
    return <div className="boot-screen">正在加载方洲AI…</div>
  }

  if (!token || !user) {
    return (
      <div className="login-layout">
        <section className="login-copy-panel">
          <p className="eyebrow">External Ops</p>
          <h1>方洲AI</h1>
          <p className="lead-copy">把目标、执行指令、回填结果和合作资产放在同一个系统里，别再散在多个网页和聊天窗口。</p>
          <div className="login-points">
            <div><strong>1.</strong><span>先用自然语言描述你的目标。</span></div>
            <div><strong>2.</strong><span>复制系统生成的执行提示，发给你常用的外部 Agent。</span></div>
            <div><strong>3.</strong><span>把执行结果贴回系统，沉淀成任务、会话和品牌资产。</span></div>
          </div>
        </section>

        <form className="auth-card" onSubmit={handleAuthSubmit}>
          <div className="auth-switch">
            <button type="button" className={authMode === 'login' ? 'tab-button active' : 'tab-button'} onClick={() => setAuthMode('login')}>登录</button>
            <button type="button" className={authMode === 'register' ? 'tab-button active' : 'tab-button'} onClick={() => setAuthMode('register')}>注册</button>
          </div>

          <label className="field">
            <span>邮箱</span>
            <input value={authForm.username} onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))} />
          </label>

          <label className="field">
            <span>密码</span>
            <input type="password" value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} />
          </label>

          <button className="primary-button hero" type="submit">{authMode === 'login' ? '进入系统' : '注册并进入'}</button>
          <p className="auth-tip">演示账号：demo@fangzhou.ai / demo123</p>
          {authMessage ? <p className="error-text">{authMessage}</p> : null}
        </form>
      </div>
    )
  }

  return (
    <div className="shell-layout">
      <aside className="sidebar-shell">
        <div className="sidebar-top">
          <div className="brand-mark">方</div>
          <div>
            <strong>方洲AI</strong>
            <p>跨境外联操作台</p>
          </div>
        </div>

        <label className="field subtle">
          <span>品牌空间</span>
          <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
            {visibleBrands.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.name}</option>
            ))}
          </select>
        </label>

        <button className="primary-button full" type="button" onClick={() => setCurrentPage('tasks')}>+ 新建任务</button>

        <label className="field subtle">
          <span>搜索任务</span>
          <input placeholder="任务名 / 产品 / 市场" value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} />
        </label>

        <nav className="side-nav">
          {navItems.map((item) => (
            <button key={item.id} type="button" className={currentPage === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setCurrentPage(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        <section className="sidebar-group">
          <div className="section-head"><strong>最近任务</strong></div>
          <div className="list-scroll">
            {filteredTasks.length ? filteredTasks.map((task) => {
              const summary = parseTaskSummary(task)
              const taskStatus = displayTaskStatus(task.status)
              return (
                <button key={task.id} type="button" className={currentTaskId === task.id ? 'task-chip active' : 'task-chip'} onClick={() => { setSelectedTaskId(task.id); setCurrentPage('tasks') }}>
                  <strong>{summary.title}</strong>
                  <span className="task-chip-meta">{summary.product} · {summary.market}</span>
                  <div className="task-chip-foot">
                    <span>{summary.platforms}</span>
                    <em className={`status-pill ${statusClass(taskStatus)}`}>{taskStatus}</em>
                  </div>
                </button>
              )
            }) : <div className="empty-copy">还没有任务，先从上面的主输入框开始。</div>}
          </div>
        </section>

        <section className="sidebar-group">
          <div className="section-head"><strong>待处理对象</strong></div>
          <div className="list-scroll compact">
            {recentConversations.length ? recentConversations.map((lead) => (
              <button key={lead.id} type="button" className={activeLead?.id === lead.id ? 'task-chip compact active' : 'task-chip compact'} onClick={() => { setSelectedTaskId(lead.taskId); setSelectedLeadId(lead.id); setCurrentPage('tasks') }}>
                <strong>{normalizeDisplayText(lead.name)}</strong>
                <div className="task-chip-foot">
                  <span>{normalizeDisplayText(lead.platform)}</span>
                  <em className={`status-pill ${statusClass(lead.status)}`}>{normalizeDisplayText(lead.status)}</em>
                </div>
              </button>
            )) : <div className="empty-copy">当前还没有需要处理的对象。</div>}
          </div>
        </section>

        <div className="sidebar-bottom">
          <div>
            <strong>{user.name}</strong>
            <p>{user.username}</p>
          </div>
          <button className="secondary-button" type="button" onClick={handleLogout}>退出</button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="top-context">
          <div>
            <p className="eyebrow">当前品牌</p>
            <h2>{activeBrand?.name || '未选择品牌'}</h2>
          </div>
          <div className="context-meta">
            <em className="status-pill soft">{currentPageLabel}</em>
            <span>{tasks.length} 个任务</span>
            <span>{activeTask ? taskSummary.title : '等待选择任务'}</span>
          </div>
        </header>

        {workspaceMessage ? <div className="notice-strip">{workspaceMessage}</div> : null}

        {currentPage === 'tasks' ? (
          <section className="page-shell">
            <div className="composer-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">创建任务</p>
                  <h3>先把目标说清楚，系统会帮你整理成一条可执行线程</h3>
                </div>
                <span className="sub-note">像聊天一样先描述目标，再由系统帮你整理案件、推进对象和记录结果。</span>
              </div>

              <div className={providerReady ? 'connection-banner ready' : 'connection-banner'}>
                <div>
                  <strong>{providerReady ? `当前已连接 Agent：${connectedProvider.label}` : '还没有连接 Agent'}</strong>
                  <p>{providerReady ? '创建案件后，系统会整理好执行提示。你只需要打开这个 Agent，把提示发过去，再把结果贴回来。' : '先去“Agent 连接”页填好主 Agent 或备用 Agent 的地址。'}</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => setCurrentPage('channels')}>
                  {providerReady ? 'Agent 连接' : '去连接 Agent'}
                </button>
              </div>

              <textarea className="hero-input" placeholder="例如：帮我创建一个美国市场的春季外联任务，目标对象包含测评频道、渠道站点和 affiliate partner。" value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} />

              <div className="prompt-row">
                {quickPrompts.map((item) => (
                  <button key={item} type="button" className="sample-pill" onClick={() => setTaskPrompt(item)}>{item}</button>
                ))}
              </div>

              <div className="draft-grid">
                <div className="mini-card"><span>对象类型</span><strong>{taskDraft.objectType}</strong></div>
                <div className="mini-card"><span>目标平台</span><strong>{taskDraft.platforms}</strong></div>
                <div className="mini-card"><span>触达方式</span><strong>{taskDraft.channel}</strong></div>
                <div className="mini-card"><span>计划联系人数</span><strong>{taskDraft.goal}</strong></div>
              </div>

              <div className="action-row">
                <button className="primary-button" type="button" onClick={handleCreateTask} disabled={creatingTask}>{creatingTask ? '正在创建…' : '创建任务'}</button>
              </div>
            </div>

            {activeTask ? (
              <div className="task-workspace">
                <section className="stack-panel task-main-column">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">当前线程</p>
                      <h3>{taskSummary.title}</h3>
                    </div>
                    <em className={`status-pill ${statusClass(activeTaskStatus)}`}>{activeTaskStatus}</em>
                  </div>

                  <div className="summary-strip">
                    <div className="summary-chip"><span>对象</span><strong>{taskSummary.objectType}</strong></div>
                    <div className="summary-chip"><span>市场</span><strong>{taskSummary.market}</strong></div>
                    <div className="summary-chip"><span>平台</span><strong>{taskSummary.platforms}</strong></div>
                    <div className="summary-chip"><span>触达</span><strong>{taskSummary.channel}</strong></div>
                    <div className="summary-chip"><span>计划联系</span><strong>{taskSummary.goal}</strong></div>
                    <div className="summary-chip wide"><span>合作约束</span><strong>{taskSummary.constraints}</strong></div>
                  </div>

                  <div className="thread-stream">
                    <div className="thread-entry user">
                      <span className="thread-role">任务目标</span>
                      <p>{normalizeObjectiveText(activeTask.structuredTask?.objective || activeTask.instruction)}</p>
                    </div>

                    <div className="thread-entry assistant">
                      <span className="thread-role">系统理解</span>
                      <div className="thread-points">
                        <p><strong>对象：</strong>{taskSummary.objectType}</p>
                        <p><strong>平台：</strong>{taskSummary.platforms}</p>
                        <p><strong>触达：</strong>{taskSummary.channel}</p>
                        <p><strong>约束：</strong>{taskSummary.constraints}</p>
                      </div>
                      <p className="thread-copy">系统不会替你假装已经接通外部执行器。当前只负责把任务整理清楚、把品牌记忆带进去，并把后续结果沉淀回来。</p>
                    </div>

                    <div className="thread-entry assistant">
                      <span className="thread-role">发送给 Agent 的指令</span>
                      <p className="thread-copy">点击“开始执行”后，系统会自动复制这段指令并打开你连接的 Agent。你不需要自己再整理一遍。</p>
                      <textarea className="package-box" value={packageContent} readOnly />
                      <div className="action-row wrap">
                        <button type="button" className="primary-button" onClick={handleOpenWorkspace} disabled={!providerReady}>开始执行</button>
                        <button type="button" className="secondary-button" onClick={() => copyText(packageContent).then(() => setWorkspaceMessage('执行指令已复制。'))}>只复制指令</button>
                        <button type="button" className="secondary-button" onClick={() => downloadText(activeTask.executionPackage?.exportName || 'task.txt', packageContent)}>导出指令</button>
                        <button type="button" className="secondary-button" onClick={() => setCurrentPage('channels')}>Agent 连接</button>
                      </div>
                      <div className="manual-note">
                        <strong>当前版本不会骗你说“已经自动发出去了”。</strong>
                        <p>这里负责整理任务、带上品牌记忆、接收结果。真正的执行动作仍然在你连接的 Agent 里完成。</p>
                      </div>
                    </div>

                    <div className="thread-entry result">
                      <span className="thread-role">结果贴回</span>
                      <label className="field">
                        <span>把外部 Agent 的结果粘贴到这里</span>
                        <textarea className="refill-box" placeholder="把外部 Agent 跑完后的结果粘贴到这里。" value={refillDraft} onChange={(event) => setRefillDraft(event.target.value)} />
                      </label>
                      <div className="action-row">
                        <button type="button" className="primary-button" onClick={handleRefill}>写入结果</button>
                      </div>
                      {activeTask.refill ? <div className="result-block"><strong>最近一次结果摘要</strong><p>{activeTask.refill.summary}</p></div> : null}
                    </div>
                  </div>

                  <section className="stack-panel">
                    <div className="panel-head">
                      <div>
                        <p className="eyebrow">当前对象</p>
                        <h3>这个案件正在推进谁</h3>
                      </div>
                      <span className="sub-note">{currentLeads.length} 个对象</span>
                    </div>

                    {currentLeads.length ? (
                      <>
                        <div className="lead-pile">
                          {currentLeads.map((lead) => (
                            <button
                              key={lead.id}
                              type="button"
                              className={activeLead?.id === lead.id ? 'lead-inline-card active' : 'lead-inline-card'}
                              onClick={() => setSelectedLeadId(lead.id)}
                            >
                              <div>
                                <strong>{normalizeDisplayText(lead.name)}</strong>
                                <span>{normalizeDisplayText(lead.platform)} · {lead.followers}</span>
                              </div>
                              <em className={`status-pill ${statusClass(lead.status)}`}>{normalizeDisplayText(lead.status)}</em>
                            </button>
                          ))}
                        </div>

                        {activeLead ? (
                          <div className="inline-thread-grid">
                            <div className="stack-panel">
                              <div className="panel-head">
                                <div>
                                  <p className="eyebrow">对象详情</p>
                                  <h3>{normalizeDisplayText(activeLead.name)}</h3>
                                </div>
                                <em className={`status-pill ${statusClass(activeLead.status)}`}>{normalizeDisplayText(activeLead.status)}</em>
                              </div>
                              <div className="meta-grid">
                                <div><span>平台</span><strong>{normalizeDisplayText(activeLead.platform)}</strong></div>
                                <div><span>处理方式</span><strong>{normalizeDisplayText(activeLead.handling)}</strong></div>
                                <div className="wide"><span>下一步</span><strong>{normalizeDisplayText(activeLead.nextAction)}</strong></div>
                              </div>
                              <div className="action-row wrap">
                                <button type="button" className="secondary-button" onClick={() => openProfile(activeLead)}>搜索对象资料</button>
                                <button type="button" className="secondary-button" onClick={() => openGmail(activeLead)}>打开 Gmail 草稿</button>
                                <button type="button" className="secondary-button" onClick={() => openWhatsApp(activeLead)}>打开 WhatsApp</button>
                              </div>
                            </div>

                            <div className="stack-panel">
                              <div className="panel-head">
                                <div>
                                  <p className="eyebrow">沟通记录</p>
                                  <h3>直接在这里处理回复</h3>
                                </div>
                              </div>

                              <div className="message-list compact">
                                {(activeLead.conversation || []).map((message) => (
                                  <div key={message.id} className={`message-bubble ${message.role === 'creator' ? 'incoming' : 'outgoing'}`}>
                                    <span>{message.role === 'creator' ? '对方' : message.role === 'agent' ? '我方' : '系统'}</span>
                                    <p>{message.text}</p>
                                  </div>
                                ))}
                              </div>

                              <div className="composer-inline">
                                <textarea placeholder="先在这里写回复，再决定是记到记录里，还是打开 Gmail / WhatsApp 去发。" value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} />
                                <div className="action-row wrap">
                                  <button type="button" className="primary-button" onClick={handleSendMessage}>写入沟通记录</button>
                                  <button type="button" className="secondary-button" onClick={() => openGmail(activeLead, replyDraft)}>带着草稿打开 Gmail</button>
                                  <button type="button" className="secondary-button" onClick={() => openWhatsApp(activeLead, replyDraft)}>带着草稿打开 WhatsApp</button>
                                  <button type="button" className="secondary-button" onClick={() => handleLeadPatch({ status: '洽谈中' })}>标记洽谈中</button>
                                  <button type="button" className="secondary-button" onClick={() => handleLeadPatch({ status: '待人工接管', handling: '人工接管' })}>标记待接管</button>
                                </div>
                                <div className="mini-suggestion-row">
                                  {taskSuggestions.map((item) => (
                                    <button key={item.title} type="button" className="suggestion-chip" onClick={() => setReplyDraft(item.body)}>
                                      {item.title}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="empty-workspace compact">
                        <strong>这条案件还没有生成对象</strong>
                        <p>先把外部 Agent 的结果贴回上面，系统才会把对象和沟通记录沉淀到这里。</p>
                      </div>
                    )}
                  </section>
                </section>

                <aside className="task-side-column">
                  <section className="stack-panel">
                    <div className="section-head">
                      <strong>任务概览</strong>
                      <span>{activeBrand?.name || '当前品牌'}</span>
                    </div>
                    <div className="snapshot-grid">
                      {taskSnapshot.map((item) => (
                        <div key={item.label} className="snapshot-card">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                          <p>{item.note}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="stack-panel memory-panel">
                    <div className="section-head">
                      <strong>品牌记忆</strong>
                      <span>这部分会进入任务上下文</span>
                    </div>
                    <div className="memory-grid">
                      {memoryDigest.map((item) => (
                        <div key={item.label} className="memory-card">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="stack-panel">
                    <div className="section-head">
                      <strong>最近更新</strong>
                      <span>{(activeTask.logs || []).length} 条记录</span>
                    </div>
                    <div className="activity-list">
                      {(activeTask.logs || []).slice(-5).reverse().map((log, index) => (
                        <div key={`${log.at}-${index}`} className="activity-row">
                          <span>{shortDate(log.at)}</span>
                          <p>{normalizeLogMessage(log.message)}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </aside>
              </div>
            ) : (
              <div className="empty-workspace">
                <strong>还没有任务</strong>
                <p>先在上面的主输入框里写一个目标。创建后，这里会出现执行提示、进度和结果回填。</p>
              </div>
            )}
          </section>
        ) : null}

        {currentPage === 'assets' ? (
          <section className="page-shell">
            <div className="panel-head">
              <div>
                <p className="eyebrow">资产</p>
                <h3>把每次触达沉淀成品牌自己的合作资产</h3>
              </div>
              <input className="inline-search" placeholder="搜索名称、平台、状态" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} />
            </div>

            {selectedLeadIds.length ? (
              <div className="bulk-toolbar">
                <span>已选 {selectedLeadIds.length} 条</span>
                <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>
                  <option value="">批量改状态</option>
                  {stageOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={bulkHandling} onChange={(event) => setBulkHandling(event.target.value)}>
                  <option value="">批量改处理方式</option>
                  {handlingOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <input placeholder="下一步动作" value={bulkNextAction} onChange={(event) => setBulkNextAction(event.target.value)} />
                <input type="datetime-local" value={bulkReminderAt} onChange={(event) => setBulkReminderAt(event.target.value)} />
                <input placeholder="提醒备注" value={bulkReminderNote} onChange={(event) => setBulkReminderNote(event.target.value)} />
                <button type="button" className="primary-button small" onClick={handleBulkApply} disabled={savingBulk}>{savingBulk ? '应用中…' : '应用'}</button>
              </div>
            ) : null}

            {filteredLeads.length ? (
              <div className="table-shell">
                <div className="table-head">
                  <span />
                  <span>名称</span>
                  <span>类型 / 平台</span>
                  <span>匹配度</span>
                  <span>状态</span>
                  <span>处理方式</span>
                  <span>下一步</span>
                </div>
                {filteredLeads.map((lead) => (
                  <button key={lead.id} type="button" className={activeLead?.id === lead.id ? 'table-row active' : 'table-row'} onClick={() => setSelectedLeadId(lead.id)}>
                    <span onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLeadSelection(lead.id)} />
                    </span>
                    <span><strong>{normalizeDisplayText(lead.name)}</strong><small>{lead.followers}</small></span>
                    <span>{normalizeDisplayText(lead.platform)}</span>
                    <span>{lead.fitScore}</span>
                    <span><em className={`status-pill ${statusClass(lead.status)}`}>{normalizeDisplayText(lead.status)}</em></span>
                    <span>{normalizeDisplayText(lead.handling)}</span>
                    <span>{normalizeDisplayText(lead.nextAction)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-workspace">
                <strong>当前还没有资产</strong>
                <p>先创建任务并回填结果，系统才会在这里沉淀对象、状态和下一步动作。</p>
              </div>
            )}

            {filteredLeads.length && activeLead ? (
              <div className="stack-panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">当前对象</p>
                    <h3>{normalizeDisplayText(activeLead.name)}</h3>
                  </div>
                  <em className={`status-pill ${statusClass(activeLead.status)}`}>{normalizeDisplayText(activeLead.status)}</em>
                </div>
                <div className="meta-grid">
                  <div><span>平台</span><strong>{normalizeDisplayText(activeLead.platform)}</strong></div>
                  <div><span>处理方式</span><strong>{normalizeDisplayText(activeLead.handling)}</strong></div>
                  <div className="wide"><span>下一步</span><strong>{normalizeDisplayText(activeLead.nextAction)}</strong></div>
                </div>
                <div className="action-row wrap">
                  <button type="button" className="secondary-button" onClick={() => openProfile(activeLead)}>搜索对象资料</button>
                  <button type="button" className="secondary-button" onClick={() => openGmail(activeLead)}>用 Gmail 写信</button>
                  <button type="button" className="secondary-button" onClick={() => openWhatsApp(activeLead)}>打开 WhatsApp</button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {currentPage === 'conversations' ? (
          <section className="conversation-shell">
            <div className="conversation-list">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">沟通记录</p>
                  <h3>集中处理回复</h3>
                </div>
              </div>
              {recentConversations.length ? recentConversations.map((lead) => (
                <button key={lead.id} type="button" className={activeLead?.id === lead.id ? 'conversation-chip active' : 'conversation-chip'} onClick={() => { setSelectedTaskId(lead.taskId); setSelectedLeadId(lead.id) }}>
                  <strong>{normalizeDisplayText(lead.name)}</strong>
                  <span>{normalizeDisplayText(lead.platform)} · {normalizeDisplayText(lead.status)}</span>
                </button>
              )) : <div className="empty-copy dark">还没有需要处理的会话。</div>}
            </div>

            <div className="message-shell">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">当前会话</p>
                  <h3>{activeLead ? normalizeDisplayText(activeLead.name) : '暂无对象'}</h3>
                </div>
                {activeLead ? <em className={`status-pill ${statusClass(activeLead.status)}`}>{normalizeDisplayText(activeLead.status)}</em> : null}
              </div>

              {activeLead ? (
                <>
                  <div className="message-list">
                    {(activeLead.conversation || []).map((message) => (
                      <div key={message.id} className={`message-bubble ${message.role === 'creator' ? 'incoming' : 'outgoing'}`}>
                        <span>{message.role === 'creator' ? '对方' : message.role === 'agent' ? '我方' : '系统'}</span>
                        <p>{message.text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="composer-inline">
                    <textarea placeholder="在这里写回复。系统会把这条消息保存到当前会话。" value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} />
                    <div className="action-row">
                      <button type="button" className="primary-button" onClick={handleSendMessage}>写入沟通记录</button>
                      <button type="button" className="secondary-button" onClick={() => openGmail(activeLead)}>打开 Gmail 草稿</button>
                      <button type="button" className="secondary-button" onClick={() => openWhatsApp(activeLead)}>打开 WhatsApp</button>
                      <button type="button" className="secondary-button" onClick={() => handleLeadPatch({ status: '待人工接管', handling: '人工接管' })}>标记待接管</button>
                      <button type="button" className="secondary-button" onClick={() => handleLeadPatch({ status: '洽谈中' })}>标记洽谈中</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-workspace compact">
                  <strong>还没有会话</strong>
                  <p>等任务回填并产生对象后，这里会集中处理回复和跟进。</p>
                </div>
              )}
            </div>

            <div className="assistant-shell">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">副驾驶</p>
                  <h3>当前建议</h3>
                </div>
              </div>
              <div className="suggestion-list">
                {taskSuggestions.map((item) => (
                  <button key={item.title} type="button" className="suggestion-card" onClick={() => setReplyDraft(item.body)}>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </button>
                ))}
              </div>
              {activeLead ? (
                <div className="result-block">
                  <strong>当前对象</strong>
                  <p>{activeLead.name} · {activeLead.platform}</p>
                  <p>{activeLead.nextAction}</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {currentPage === 'brand' ? (
          <section className="form-shell">
            <div className="panel-head">
              <div>
                <p className="eyebrow">品牌记忆库</p>
                <h3>这里保存品牌长期信息，任务和沟通都会调用这里</h3>
              </div>
            </div>
            <div className="stack-panel">
              <div className="section-head">
                <strong>品牌定位</strong>
                <span>让系统知道你是谁、这一季在推什么</span>
              </div>
              <div className="form-grid two">
                <label className="field">
                  <span>品牌背景</span>
                  <textarea value={preferences.brandProfile.intro} onChange={(event) => setPreferences((current) => ({ ...current, brandProfile: { ...current.brandProfile, intro: event.target.value } }))} />
                </label>
                <label className="field">
                  <span>本季度主推</span>
                  <textarea value={preferences.brandProfile.quarterFocus} onChange={(event) => setPreferences((current) => ({ ...current, brandProfile: { ...current.brandProfile, quarterFocus: event.target.value } }))} />
                </label>
              </div>
            </div>

            <div className="stack-panel">
              <div className="section-head">
                <strong>产品与策略</strong>
                <span>决定系统怎么写、怎么谈、怎么筛</span>
              </div>
              <div className="form-grid two">
                <label className="field">
                  <span>主要产品</span>
                  <textarea value={preferences.brandProfile.primaryProducts} onChange={(event) => setPreferences((current) => ({ ...current, brandProfile: { ...current.brandProfile, primaryProducts: event.target.value } }))} />
                </label>
                <label className="field">
                  <span>产品链接</span>
                  <textarea value={preferences.brandProfile.productLinks} onChange={(event) => setPreferences((current) => ({ ...current, brandProfile: { ...current.brandProfile, productLinks: event.target.value } }))} />
                </label>
                <label className="field">
                  <span>价格策略</span>
                  <textarea value={preferences.brandProfile.pricingStrategy} onChange={(event) => setPreferences((current) => ({ ...current, brandProfile: { ...current.brandProfile, pricingStrategy: event.target.value } }))} />
                </label>
                <label className="field">
                  <span>核心卖点</span>
                  <textarea value={preferences.brandProfile.productPoints} onChange={(event) => setPreferences((current) => ({ ...current, brandProfile: { ...current.brandProfile, productPoints: event.target.value } }))} />
                </label>
              </div>
            </div>

            <div className="stack-panel">
              <div className="section-head">
                <strong>合作素材</strong>
                <span>这里的内容会被回复建议和执行提示反复调用</span>
              </div>
              <div className="form-grid two">
                <label className="field">
                  <span>可接受合作方式</span>
                  <textarea value={preferences.brandProfile.cooperationModes} onChange={(event) => setPreferences((current) => ({ ...current, brandProfile: { ...current.brandProfile, cooperationModes: event.target.value } }))} />
                </label>
                <label className="field">
                  <span>过往合作证明</span>
                  <textarea value={preferences.brandProfile.campaignProof} onChange={(event) => setPreferences((current) => ({ ...current, brandProfile: { ...current.brandProfile, campaignProof: event.target.value } }))} />
                </label>
                <label className="field full">
                  <span>常用回复素材</span>
                  <textarea value={preferences.brandProfile.faq} onChange={(event) => setPreferences((current) => ({ ...current, brandProfile: { ...current.brandProfile, faq: event.target.value } }))} />
                </label>
              </div>
            </div>
            <button className="primary-button" type="button" onClick={handleSavePreferences} disabled={savingPreferences}>{savingPreferences ? '保存中…' : '保存品牌记忆'}</button>
          </section>
        ) : null}

        {currentPage === 'channels' ? (
          <section className="form-shell">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Agent 连接</p>
                <h3>把你常用的 Agent 地址放在这里，案件页会直接跳过去</h3>
              </div>
            </div>

            <div className="provider-picker">
              {providerOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={preferences.channelConfig.provider === item.id ? 'provider-card active' : 'provider-card'}
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      channelConfig: { ...current.channelConfig, provider: item.id },
                    }))
                  }
                >
                  <strong>{item.label}</strong>
                  <span>{item.hint}</span>
                  <em>{item.url ? '已配置地址' : '还没配置地址'}</em>
                </button>
              ))}
            </div>

            <div className="channel-grid">
              {channelState(preferences.channelConfig).map((item) => (
                <div key={item.name} className="channel-card">
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                  <em>{item.status}</em>
                </div>
              ))}
            </div>

            <div className="form-grid two">
              <label className="field">
                <span>主 Agent 名称</span>
                <input value={preferences.channelConfig.opencloudName} onChange={(event) => setPreferences((current) => ({ ...current, channelConfig: { ...current.channelConfig, opencloudName: event.target.value } }))} />
              </label>
              <label className="field">
                <span>主 Agent 地址</span>
                <input value={preferences.channelConfig.opencloudUrl} onChange={(event) => setPreferences((current) => ({ ...current, channelConfig: { ...current.channelConfig, opencloudUrl: event.target.value } }))} />
              </label>
              <label className="field">
                <span>备用 Agent 名称</span>
                <input value={preferences.channelConfig.codexName} onChange={(event) => setPreferences((current) => ({ ...current, channelConfig: { ...current.channelConfig, codexName: event.target.value } }))} />
              </label>
              <label className="field">
                <span>备用 Agent 地址</span>
                <input value={preferences.channelConfig.codexUrl} onChange={(event) => setPreferences((current) => ({ ...current, channelConfig: { ...current.channelConfig, codexUrl: event.target.value } }))} />
              </label>
              <label className="field">
                <span>Gmail 发件身份</span>
                <input value={preferences.channelConfig.gmailSender} onChange={(event) => setPreferences((current) => ({ ...current, channelConfig: { ...current.channelConfig, gmailSender: event.target.value } }))} />
              </label>
              <label className="field">
                <span>WhatsApp 号码</span>
                <input value={preferences.channelConfig.whatsappNumber} onChange={(event) => setPreferences((current) => ({ ...current, channelConfig: { ...current.channelConfig, whatsappNumber: event.target.value } }))} />
              </label>
              <label className="field full">
                <span>Gmail 签名</span>
                <textarea value={preferences.channelConfig.gmailSignature} onChange={(event) => setPreferences((current) => ({ ...current, channelConfig: { ...current.channelConfig, gmailSignature: event.target.value } }))} />
              </label>
            </div>

            <button className="primary-button" type="button" onClick={handleSavePreferences} disabled={savingPreferences}>{savingPreferences ? '保存中…' : '保存 Agent 连接'}</button>
          </section>
        ) : null}

        {currentPage === 'settings' ? (
          <section className="form-shell">
            <div className="panel-head">
              <div>
                <p className="eyebrow">系统设置</p>
                <h3>把默认英语风格、跟进规则和摘要习惯写清楚</h3>
              </div>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>英语风格</span>
                <input value={preferences.settings.englishTone} onChange={(event) => setPreferences((current) => ({ ...current, settings: { ...current.settings, englishTone: event.target.value } }))} />
              </label>
              <label className="field">
                <span>默认跟进规则</span>
                <textarea value={preferences.settings.followupRule} onChange={(event) => setPreferences((current) => ({ ...current, settings: { ...current.settings, followupRule: event.target.value } }))} />
              </label>
              <label className="field">
                <span>摘要规则</span>
                <textarea value={preferences.settings.summaryRule} onChange={(event) => setPreferences((current) => ({ ...current, settings: { ...current.settings, summaryRule: event.target.value } }))} />
              </label>
            </div>
            <button className="primary-button" type="button" onClick={handleSavePreferences} disabled={savingPreferences}>{savingPreferences ? '保存中…' : '保存系统设置'}</button>
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default App
