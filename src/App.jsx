import { useEffect, useMemo, useState } from 'react'
import './app.css'

const emptyDashboard = {
  tasks: [],
  leadsByTask: {},
  reminders: [],
}

const taskPageTabs = [
  { id: 'create', label: '创建任务' },
  { id: 'execute', label: '任务执行' },
  { id: 'conversation', label: '会话处理' },
]

const taskStatusFilters = ['全部', '草稿', '执行中', '待回复', '已完成']
const inboxStatusFilters = ['全部', '待处理', '待接管', '已回复']
const leadStatuses = ['已抓取', '初筛通过', '已触达', '已回复', '洽谈中', '待人工接管', '已确认合作']
const handlingModes = ['自动触达', 'AI辅助回复', '人工接管']

const defaultForm = {
  taskName: '美国健身达人首轮触达',
  productName: '筋膜枪 SKU-01',
  market: '美国',
  industryDirection: '健身',
  platforms: { TikTok: true, Instagram: true, YouTube: false, Deal站: false },
  outreachMethods: { Gmail: true, 'Instagram DM': true, 'TikTok DM': false, WhatsApp: false },
  creatorTier: '5k - 100k',
  cooperationModel: '寄样 + 佣金',
  commissionCap: 14,
  allowSeeding: true,
  allowFixedFee: false,
  avoidCompetitors: true,
  targetReach: 50,
}

async function apiFetch(path, options = {}, token = '') {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(path, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'REQUEST_FAILED')
  }
  return response.json()
}

function formatTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function toDateTimeLocalValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function makeReminderIso(hoursAhead) {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString()
}

function enabledLabels(record) {
  return Object.entries(record)
    .filter(([, enabled]) => enabled)
    .map(([label]) => label)
}

function normalizeTaskStatus(status) {
  const value = String(status || '').toLowerCase()
  if (['done', 'success', 'completed', '已完成', '执行成功'].includes(value)) return '已完成'
  if (['needs_reply', 'waiting_reply', '待回复'].includes(value)) return '待回复'
  if (['running', 'submitted', '执行中', '已发送到本地连接器'].includes(value)) return '执行中'
  if (['draft', 'pending', '待执行', '草稿', '待执行中'].includes(value)) return '草稿'
  return status || '草稿'
}

function buildTaskInstruction(form) {
  const platforms = enabledLabels(form.platforms).join(' / ')
  const methods = enabledLabels(form.outreachMethods).join(' / ')
  const constraints = [
    `佣金上限 ${form.commissionCap}%`,
    form.allowSeeding ? '可寄样' : '不可寄样',
    form.allowFixedFee ? '可接受固定费' : '不接受固定费',
    form.avoidCompetitors ? '排除竞品达人' : '可接受竞品达人',
  ]

  return [
    `任务名称：${form.taskName}`,
    `产品：${form.productName}`,
    `市场：${form.market}`,
    `行业方向：${form.industryDirection}`,
    `目标平台：${platforms || '未选择'}`,
    `触达方式：${methods || '未选择'}`,
    `达人范围：${form.creatorTier}`,
    `合作方式：${form.cooperationModel}`,
    `合作约束：${constraints.join('；')}`,
    `目标触达：${form.targetReach} 位达人`,
  ].join('\n')
}

function buildTaskDraft(form) {
  const platforms = enabledLabels(form.platforms)
  const methods = enabledLabels(form.outreachMethods)
  const estimatedPool = form.targetReach * 2 + 26
  const autoReach = Math.max(12, Math.round(form.targetReach * 0.62))
  const assistReach = Math.max(6, Math.round(form.targetReach * 0.26))
  const manualReach = Math.max(2, form.targetReach - autoReach - assistReach)
  const constraints = [
    `佣金上限：${form.commissionCap}%`,
    `寄样：${form.allowSeeding ? '允许' : '不允许'}`,
    `固定坑位费：${form.allowFixedFee ? '允许' : '不允许'}`,
    `竞品达人：${form.avoidCompetitors ? '排除' : '可接受'}`,
  ]

  return {
    taskName: form.taskName,
    productName: form.productName,
    market: form.market,
    industryDirection: form.industryDirection,
    platforms,
    outreachMethods: methods,
    creatorTier: form.creatorTier,
    cooperationModel: form.cooperationModel,
    targetReach: form.targetReach,
    estimatedPool,
    autoReach,
    assistReach,
    manualReach,
    constraints,
    missingInfo: methods.length === 0 ? ['至少选择一种触达方式'] : [],
  }
}

function summarizeTask(task, draft = null) {
  if (!task) {
    return {
      title: draft?.taskName || '未创建任务',
      meta: draft?.productName || '-',
      status: '草稿',
    }
  }

  const instruction = task.instruction || ''
  const taskName = instruction.match(/任务名称：(.+)/)?.[1]?.trim()
  const productName = instruction.match(/产品：(.+)/)?.[1]?.trim()
  const market = instruction.match(/市场：(.+)/)?.[1]?.trim()
  const target = instruction.match(/目标触达：(.+位达人)/)?.[1]?.trim()

  return {
    title: taskName || `${market || '市场未写'} / ${target || '目标未写'}`,
    meta: productName || '产品未写',
    status: normalizeTaskStatus(task.status),
  }
}

function buildLeadRows(task, draft) {
  if (!task) return []

  const baseRows = [
    {
      name: 'Mia Moves',
      platform: 'TikTok',
      followers: '12.4万',
      fitScore: 92,
      contact: 'Gmail',
      status: '已回复',
      handling: 'AI辅助回复',
      lastAction: '达人报 $250 + 寄样',
      nextAction: '给 3 个回复版本',
      intent: '有兴趣，但报价超约束',
      risk: '固定费超出当前合作约束',
      notes: '内容风格贴近居家健身，评论区互动质量高。',
      conversation: [
        { role: 'system', text: `当前合作约束：${draft.constraints.join('；')}` },
        { role: 'agent', text: 'Hi Mia, we are exploring a sample + commission collaboration for the US fitness audience.' },
        { role: 'creator', text: 'I can do it for $250 + gifted product.' },
      ],
    },
    {
      name: 'Coach Lena',
      platform: 'Instagram',
      followers: '31万',
      fitScore: 89,
      contact: 'Instagram DM',
      status: '洽谈中',
      handling: '人工接管',
      lastAction: '对方询问排期和历史案例',
      nextAction: '补品牌资料并人工跟进',
      intent: '高价值候选，需要深聊',
      risk: '涉及排期、案例和 exclusivity',
      notes: '账号内容质量高，适合品牌形象合作。',
      conversation: [
        { role: 'system', text: '高价值对象，建议人工接管。' },
        { role: 'creator', text: 'Can you share more details about timing, expected deliverables, and previous campaigns?' },
      ],
    },
    {
      name: 'HomeGym Abby',
      platform: 'TikTok',
      followers: '6.8万',
      fitScore: 87,
      contact: 'Gmail',
      status: '已触达',
      handling: '自动触达',
      lastAction: '首轮消息已发',
      nextAction: '等待 48 小时后自动二跟',
      intent: '等待回复',
      risk: '暂无',
      notes: '适合标准化首轮触达。',
      conversation: [{ role: 'system', text: '已发送首轮触达，暂时无需人工介入。' }],
    },
    {
      name: 'Fit Deals Hub',
      platform: 'Deal站',
      followers: '站点',
      fitScore: 81,
      contact: 'Gmail',
      status: '初筛通过',
      handling: '自动触达',
      lastAction: '已进入候选池',
      nextAction: '等待批量发送',
      intent: '可批量推进',
      risk: '需确认站点受众匹配',
      notes: 'Deal 站资源，适合低成本引流测试。',
      conversation: [{ role: 'system', text: '已通过初筛，等待首轮建联。' }],
    },
    {
      name: 'Lift With Nora',
      platform: 'Instagram',
      followers: '8.2万',
      fitScore: 84,
      contact: 'Instagram DM',
      status: '已抓取',
      handling: '自动触达',
      lastAction: '抓取到主页与邮箱',
      nextAction: '判断内容风格是否入池',
      intent: '待初筛',
      risk: '暂无',
      notes: '主页风格偏女性力量训练，待确认是否匹配产品受众。',
      conversation: [{ role: 'system', text: '刚进入候选池，还没有会话。' }],
    },
    {
      name: 'Wellness Weekly',
      platform: '媒体 PR',
      followers: '媒体',
      fitScore: 76,
      contact: 'Gmail',
      status: '待人工接管',
      handling: '人工接管',
      lastAction: '对方要求品牌背景与媒体包',
      nextAction: '准备品牌资料后再回',
      intent: '需提供更完整品牌信息',
      risk: '信息不完整会影响推进',
      notes: '媒体方问得比较细，不适合自动回复。',
      conversation: [{ role: 'creator', text: 'Please send over your brand background, KPIs, and campaign examples.' }],
    },
    {
      name: 'PowerCore Jay',
      platform: 'YouTube',
      followers: '22万',
      fitScore: 83,
      contact: 'Gmail',
      status: '已确认合作',
      handling: '人工接管',
      lastAction: '已确认寄样 + 佣金',
      nextAction: '移交履约',
      intent: '已达成合作',
      risk: '需跟踪发样和发布时间',
      notes: '可作为本任务示范案例。',
      conversation: [{ role: 'creator', text: 'Sounds good. I am happy with gifted product + commission. Let us move ahead.' }],
    },
  ]

  return baseRows.map((lead, index) => ({
    id: `${task.id}-lead-${index + 1}`,
    ...lead,
  }))
}

function buildFunnel(leads) {
  const counts = {
    已抓取: 0,
    初筛通过: 0,
    已触达: 0,
    已回复: 0,
    洽谈中: 0,
    已确认合作: 0,
    待人工接管: 0,
  }

  leads.forEach((lead) => {
    if (counts[lead.status] !== undefined) counts[lead.status] += 1
  })

  return counts
}

function buildTaskTimeline(task, draft, funnel) {
  if (!task) return []
  if (Array.isArray(task.logs) && task.logs.length > 0) {
    return task.logs
      .slice()
      .reverse()
      .map((log) => ({
        time: formatTime(log.at),
        title: log.level === 'info' ? '系统动作' : '系统记录',
        detail: log.message,
      }))
  }
  return [
    { time: formatTime(task.createdAt), title: '创建任务', detail: `${draft.taskName} 已创建` },
    { time: '今天 09:42', title: '抓取候选池', detail: `已抓取 ${draft.estimatedPool} 个候选对象` },
    { time: '今天 10:10', title: '初筛完成', detail: `当前有 ${funnel.初筛通过} 位进入首轮候选` },
    { time: '今天 11:25', title: '开始触达', detail: `已触达 ${funnel.已触达 + funnel.已回复 + funnel.洽谈中 + funnel.已确认合作} 位达人` },
    { time: '今天 12:06', title: '会话升级', detail: `需要 AI辅助回复 ${funnel.已回复} 位，人工接管 ${funnel.待人工接管 + funnel.洽谈中} 位` },
  ]
}

function aiSuggestions(lead, draft) {
  if (!lead) return []

  const latestIncoming = lead.conversation.filter((item) => item.role === 'creator').at(-1)?.text || ''

  if (/250|fee|报价|price/i.test(latestIncoming)) {
    return [
      {
        label: '压价版',
        text: `谢谢回复。我们这轮主要按 ${draft.cooperationModel} 的合作方式推进，当前佣金上限是 ${draft.constraints[0].replace('佣金上限：', '')}。如果你愿意，我们可以先从轻量测试开始。`,
        reason: '适合先守住当前合作约束。',
      },
      {
        label: '换纯佣版',
        text: 'Thanks for sharing. We may not be able to support that fixed fee on this round, but we can offer a stronger commission-first structure if the fit is right.',
        reason: '适合坚持不接受固定费的约束。',
      },
      {
        label: '继续聊版',
        text: '感谢你给报价。先让我把这次 campaign 目标和 deliverables 发你，你看完我们再一起确认是否值得推进。',
        reason: '适合先保留对话，再判断是否转人工接管。',
      },
    ]
  }

  if (/details|timing|deliverables|campaign/i.test(latestIncoming)) {
    return [
      {
        label: '品牌说明版',
        text: `当然可以。我先把 ${draft.productName} 的品牌背景、这次合作目标和 deliverables 发你，你看完我们再确认排期。`,
        reason: '适合品牌资料型问题。',
      },
      {
        label: 'KPI 说明版',
        text: '这次我们更看重内容匹配和实际转化，所以希望先做一轮测试合作，再决定是否扩大预算。',
        reason: '适合对 KPI 和合作形式做预期管理。',
      },
      {
        label: '推进版',
        text: '我今天就把 deliverables、时间线和合作方式整理给你。如果你这边没问题，我们本周就可以开始推进。',
        reason: '适合尽快锁定下一步动作。',
      },
    ]
  }

  return [
    {
      label: '常规跟进',
      text: '收到，我这边先把更多细节整理给你。如果你方便，我们可以继续往下推进。',
      reason: '适合一般性回复。',
    },
  ]
}

function taskStatusSummary(tasks) {
  return `任务 ${tasks.length} 条`
}

function buildTaskTodo(selectedLead, funnel, reminders) {
  if (!selectedLead) {
    return reminders?.length ? reminders.slice(0, 3).map((item) => `${item.name}：${formatTime(item.reminderAt)}`) : ['先选择一条线索，再决定下一步动作。']
  }

  const todos = []
  if (['已回复', '待人工接管'].includes(selectedLead.status)) {
    todos.push(`优先处理 ${selectedLead.name}，当前建议：${selectedLead.nextAction}`)
  }
  if (funnel.待人工接管 > 0) {
    todos.push(`还有 ${funnel.待人工接管} 位线索待人工接管`)
  }
  if (funnel.已回复 > 0) {
    todos.push(`还有 ${funnel.已回复} 位线索等待回复处理`)
  }
  if (reminders?.length) {
    todos.push(`最近提醒：${reminders[0].name}，${formatTime(reminders[0].reminderAt)}`)
  }
  if (todos.length === 0) {
    todos.push('当前没有紧急待办，可以继续扩展新线索或推进洽谈中对象。')
  }
  return todos
}

function hydrateLeadRows(task, dashboardLeads, draft) {
  if (!task) return []
  if (Array.isArray(dashboardLeads) && dashboardLeads.length > 0) return dashboardLeads
  return buildLeadRows(task, draft)
}

function App() {
  const [bootstrap, setBootstrap] = useState({ brands: [] })
  const [token, setToken] = useState(() => localStorage.getItem('fz_workbench_token') || '')
  const [currentUser, setCurrentUser] = useState(null)
  const [dashboard, setDashboard] = useState(emptyDashboard)
  const [brandId, setBrandId] = useState('')
  const [pageId, setPageId] = useState('execute')
  const [currentTaskId, setCurrentTaskId] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [stageFilter, setStageFilter] = useState('全部')
  const [taskQuery, setTaskQuery] = useState('')
  const [taskFilter, setTaskFilter] = useState('全部')
  const [leadQuery, setLeadQuery] = useState('')
  const [conversationQuery, setConversationQuery] = useState('')
  const [conversationFilter, setConversationFilter] = useState('全部')
  const [error, setError] = useState('')
  const [authTab, setAuthTab] = useState('login')
  const [loggingIn, setLoggingIn] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [updatingLead, setUpdatingLead] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: 'demo@fangzhou.ai', password: 'demo123' })
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' })
  const [taskForm, setTaskForm] = useState(defaultForm)
  const [replyDraft, setReplyDraft] = useState('')
  const [selectedLeadIds, setSelectedLeadIds] = useState([])
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkHandling, setBulkHandling] = useState('')
  const [bulkNextAction, setBulkNextAction] = useState('')
  const [bulkReminderAt, setBulkReminderAt] = useState('')
  const [bulkReminderNote, setBulkReminderNote] = useState('')
  const [leadReminderAt, setLeadReminderAt] = useState('')
  const [leadReminderNote, setLeadReminderNote] = useState('')

  const taskDraft = useMemo(() => buildTaskDraft(taskForm), [taskForm])

  const normalizedTasks = useMemo(
    () =>
      dashboard.tasks.map((task) => ({
        ...task,
        display: summarizeTask(task, taskDraft),
      })),
    [dashboard.tasks, taskDraft],
  )

  const filteredTasks = useMemo(() => {
    return normalizedTasks.filter((task) => {
      const matchFilter = taskFilter === '全部' || task.display.status === taskFilter
      const keyword = `${task.display.title} ${task.display.meta} ${task.instruction || ''}`.toLowerCase()
      const matchQuery = !taskQuery.trim() || keyword.includes(taskQuery.trim().toLowerCase())
      return matchFilter && matchQuery
    })
  }, [normalizedTasks, taskFilter, taskQuery])

  const currentTask = useMemo(
    () =>
      filteredTasks.find((task) => task.id === currentTaskId) ??
      normalizedTasks.find((task) => task.id === currentTaskId) ??
      filteredTasks[0] ??
      normalizedTasks[0] ??
      null,
    [filteredTasks, normalizedTasks, currentTaskId],
  )

  const activeTaskSummary = useMemo(() => summarizeTask(currentTask, taskDraft), [currentTask, taskDraft])
  const leads = useMemo(
    () => hydrateLeadRows(currentTask, dashboard.leadsByTask?.[currentTask?.id] || [], taskDraft),
    [currentTask, dashboard.leadsByTask, taskDraft],
  )
  const taskReminders = useMemo(
    () =>
      leads
        .filter((lead) => lead.reminderAt)
        .slice()
        .sort((left, right) => String(left.reminderAt).localeCompare(String(right.reminderAt))),
    [leads],
  )
  const funnel = useMemo(() => buildFunnel(leads), [leads])
  const timeline = useMemo(() => buildTaskTimeline(currentTask, taskDraft, funnel), [currentTask, taskDraft, funnel])

  const searchedLeads = useMemo(() => {
    return leads.filter((lead) => {
      const keyword = `${lead.name} ${lead.platform} ${lead.contact} ${lead.status} ${lead.handling}`.toLowerCase()
      return !leadQuery.trim() || keyword.includes(leadQuery.trim().toLowerCase())
    })
  }, [leads, leadQuery])

  const filteredLeads = useMemo(() => {
    if (stageFilter === '全部') return searchedLeads
    return searchedLeads.filter((lead) => lead.status === stageFilter)
  }, [searchedLeads, stageFilter])

  const selectedLead = useMemo(
    () =>
      filteredLeads.find((lead) => lead.id === selectedLeadId) ??
      leads.find((lead) => lead.id === selectedLeadId) ??
      filteredLeads[0] ??
      leads[0] ??
      null,
    [filteredLeads, leads, selectedLeadId],
  )
  const taskTodos = useMemo(() => buildTaskTodo(selectedLead, funnel, taskReminders), [selectedLead, funnel, taskReminders])

  const inboxLeads = useMemo(() => {
    return leads
      .filter((lead) => ['已回复', '洽谈中', '待人工接管'].includes(lead.status))
      .filter((lead) => {
        const matchStatus =
          conversationFilter === '全部' ||
          (conversationFilter === '待处理' && ['已回复', '洽谈中'].includes(lead.status)) ||
          (conversationFilter === '待接管' && lead.status === '待人工接管') ||
          (conversationFilter === '已回复' && lead.status === '已回复')

        const keyword = `${lead.name} ${lead.platform} ${lead.intent} ${lead.status}`.toLowerCase()
        const matchQuery = !conversationQuery.trim() || keyword.includes(conversationQuery.trim().toLowerCase())
        return matchStatus && matchQuery
      })
  }, [leads, conversationFilter, conversationQuery])

  const messages = useMemo(() => selectedLead?.conversation || [], [selectedLead])

  const suggestions = useMemo(() => aiSuggestions(selectedLead, taskDraft), [selectedLead, taskDraft])

  async function refreshDashboard(activeToken, nextBrandId) {
    const board = await apiFetch(`/api/dashboard?brandId=${nextBrandId}`, {}, activeToken)
    setDashboard(board)
  }

  useEffect(() => {
    apiFetch('/api/bootstrap')
      .then((data) => {
        setBootstrap(data)
        setBrandId(data.brands[0]?.id || '')
      })
      .catch((requestError) => setError(requestError.message))
  }, [])

  useEffect(() => {
    if (!token) return
    apiFetch('/api/me', {}, token)
      .then((me) => {
        setCurrentUser(me.user)
        return refreshDashboard(token, brandId || me.brands[0]?.id || '')
      })
      .catch((requestError) => setError(requestError.message))
  }, [token, brandId])

  useEffect(() => {
    if (currentTask) {
      setCurrentTaskId(currentTask.id)
      setStageFilter('全部')
    }
  }, [currentTask?.id])

  useEffect(() => {
    if (selectedLead) setSelectedLeadId(selectedLead.id)
  }, [selectedLead?.id])

  useEffect(() => {
    setSelectedLeadIds((prev) => prev.filter((id) => leads.some((lead) => lead.id === id)))
  }, [leads])

  useEffect(() => {
    setLeadReminderAt(toDateTimeLocalValue(selectedLead?.reminderAt))
    setLeadReminderNote(selectedLead?.reminderNote || '')
  }, [selectedLead?.id, selectedLead?.reminderAt, selectedLead?.reminderNote])

  async function handleLogin(event) {
    event.preventDefault()
    setLoggingIn(true)
    try {
      const response = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      })
      localStorage.setItem('fz_workbench_token', response.token)
      setToken(response.token)
      setCurrentUser(response.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    setRegistering(true)
    try {
      const response = await apiFetch('/api/register', {
        method: 'POST',
        body: JSON.stringify(registerForm),
      })
      localStorage.setItem('fz_workbench_token', response.token)
      setToken(response.token)
      setCurrentUser(response.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setRegistering(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('fz_workbench_token')
    setToken('')
    setCurrentUser(null)
    setDashboard(emptyDashboard)
  }

  async function createTask() {
    if (!token || !brandId) return
    setCreatingTask(true)
    try {
      const response = await apiFetch(
        '/api/tasks',
        {
          method: 'POST',
          body: JSON.stringify({
            brandId,
            moduleId: 'traffic-acquisition',
            instruction: buildTaskInstruction(taskForm),
          }),
        },
        token,
      )
      setCurrentTaskId(response.task.id)
      await refreshDashboard(token, brandId)
      setPageId('execute')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreatingTask(false)
    }
  }

  async function startExecution() {
    if (!currentTask || !token) return
    await apiFetch(`/api/tasks/${currentTask.id}/submit`, { method: 'POST', body: JSON.stringify({}) }, token)
    await refreshDashboard(token, brandId)
    setPageId('execute')
  }

  function applySuggestion(text) {
    setReplyDraft(text)
  }

  async function sendReply(prefilledText = '') {
    if (!selectedLead) return
    const text = (prefilledText || replyDraft).trim()
    if (!text || !token) return

    setSendingReply(true)
    try {
      await apiFetch(
        `/api/leads/${selectedLead.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text }),
        },
        token,
      )
      setReplyDraft('')
      await refreshDashboard(token, brandId)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSendingReply(false)
    }
  }

  async function updateLead(values) {
    if (!selectedLead || !token) return
    setUpdatingLead(true)
    try {
      await apiFetch(
        `/api/leads/${selectedLead.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(values),
        },
        token,
      )
      await refreshDashboard(token, brandId)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingLead(false)
    }
  }

  async function saveLeadReminder(values) {
    await updateLead(values)
  }

  function toggleLeadSelection(leadId) {
    setSelectedLeadIds((prev) => (prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]))
  }

  function toggleSelectAllFilteredLeads() {
    const ids = filteredLeads.map((lead) => lead.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedLeadIds.includes(id))
    if (allSelected) {
      setSelectedLeadIds((prev) => prev.filter((id) => !ids.includes(id)))
      return
    }
    setSelectedLeadIds((prev) => [...new Set([...prev, ...ids])])
  }

  async function applyBulkUpdate() {
    if (!token || selectedLeadIds.length === 0) return
    setUpdatingLead(true)
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
            reminderAt: bulkReminderAt ? new Date(bulkReminderAt).toISOString() : undefined,
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
      await refreshDashboard(token, brandId)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingLead(false)
    }
  }

  function renderDetailPanel() {
    if (pageId === 'conversation' && selectedLead) {
      return (
        <>
          <section className="detail-card">
            <p className="section-label">当前会话</p>
            <h3>{selectedLead.name}</h3>
            <div className="detail-list">
              <article><span>处理方式</span><strong>{selectedLead.handling}</strong></article>
              <article><span>当前状态</span><strong>{selectedLead.status}</strong></article>
              <article><span>对方意图</span><strong>{selectedLead.intent}</strong></article>
              <article><span>风险提醒</span><strong>{selectedLead.risk}</strong></article>
              <article><span>跟进提醒</span><strong>{selectedLead.reminderAt ? formatTime(selectedLead.reminderAt) : '未设置'}</strong></article>
            </div>
          </section>

          <section className="detail-card">
            <p className="section-label">AI 辅助回复</p>
            <div className="detail-note">
              <strong>推荐动作</strong>
              <p>{selectedLead.nextAction}</p>
            </div>
            <div className="detail-note">
              <strong>更新线索状态</strong>
              <div className="tag-row">
                {leadStatuses.map((status) => (
                  <button key={status} type="button" className={selectedLead.status === status ? 'filter-chip active' : 'filter-chip'} onClick={() => updateLead({ status })} disabled={updatingLead}>
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div className="detail-note">
              <strong>更新处理方式</strong>
              <div className="tag-row">
                {handlingModes.map((handling) => (
                  <button key={handling} type="button" className={selectedLead.handling === handling ? 'filter-chip active' : 'filter-chip'} onClick={() => updateLead({ handling })} disabled={updatingLead}>
                    {handling}
                  </button>
                ))}
              </div>
            </div>
            <div className="detail-note">
              <strong>跟进提醒</strong>
              <div className="tag-row">
                <button type="button" className="filter-chip" onClick={() => saveLeadReminder({ reminderAt: makeReminderIso(24), reminderNote: '明天跟进' })} disabled={updatingLead}>
                  明天跟进
                </button>
                <button type="button" className="filter-chip" onClick={() => saveLeadReminder({ reminderAt: makeReminderIso(48), reminderNote: '48 小时后提醒' })} disabled={updatingLead}>
                  48 小时后提醒
                </button>
                <button type="button" className="filter-chip" onClick={() => saveLeadReminder({ reminderAt: '', reminderNote: '' })} disabled={updatingLead}>
                  清除提醒
                </button>
              </div>
              <div className="detail-form">
                <label>
                  <span>自定义提醒时间</span>
                  <input type="datetime-local" value={leadReminderAt} onChange={(event) => setLeadReminderAt(event.target.value)} />
                </label>
                <label>
                  <span>提醒备注</span>
                  <input value={leadReminderNote} onChange={(event) => setLeadReminderNote(event.target.value)} placeholder="例如：明天确认报价回复" />
                </label>
              </div>
              <div className="panel-actions">
                <button type="button" className="chip-button" onClick={() => saveLeadReminder({ reminderAt: leadReminderAt ? new Date(leadReminderAt).toISOString() : '', reminderNote: leadReminderNote })} disabled={updatingLead}>
                  保存提醒
                </button>
              </div>
            </div>
            {suggestions.map((suggestion) => (
              <article key={suggestion.label} className="suggestion-card">
                <div className="suggestion-head">
                  <strong>{suggestion.label}</strong>
                  <button type="button" className="text-button" onClick={() => applySuggestion(suggestion.text)}>
                    放入输入框
                  </button>
                </div>
                <p>{suggestion.text}</p>
                <span>{suggestion.reason}</span>
              </article>
            ))}
          </section>
        </>
      )
    }

    if (pageId === 'execute' && selectedLead) {
      return (
        <>
          <section className="detail-card">
            <p className="section-label">线索详情</p>
            <h3>{selectedLead.name}</h3>
            <div className="detail-list">
              <article><span>平台</span><strong>{selectedLead.platform}</strong></article>
              <article><span>粉丝量</span><strong>{selectedLead.followers}</strong></article>
              <article><span>匹配度</span><strong>{selectedLead.fitScore}</strong></article>
              <article><span>触达方式</span><strong>{selectedLead.contact}</strong></article>
              <article><span>处理方式</span><strong>{selectedLead.handling}</strong></article>
              <article><span>下一步</span><strong>{selectedLead.nextAction}</strong></article>
            </div>
            <div className="detail-note">
              <strong>备注</strong>
              <p>{selectedLead.notes}</p>
            </div>
          </section>

          <section className="detail-card">
            <p className="section-label">任务进展板</p>
            <div className="detail-note">
              <strong>当前进度</strong>
              <p>{`已触达 ${funnel.已触达 + funnel.已回复 + funnel.洽谈中 + funnel.已确认合作} / 已回复 ${funnel.已回复} / 洽谈中 ${funnel.洽谈中}`}</p>
            </div>
            <div className="detail-note">
              <strong>当前待办</strong>
              <div className="todo-list">
                {taskTodos.map((todo) => (
                  <p key={todo}>{todo}</p>
                ))}
              </div>
            </div>
            <div className="detail-note">
              <strong>最近提醒</strong>
              <div className="todo-list">
                {taskReminders.slice(0, 4).map((lead) => (
                  <p key={lead.id}>{`${lead.name} ｜ ${formatTime(lead.reminderAt)} ｜ ${lead.reminderNote || lead.nextAction}`}</p>
                ))}
                {taskReminders.length === 0 ? <p>当前任务还没有设置提醒。</p> : null}
              </div>
            </div>
            <div className="timeline-list">
              {timeline.map((item, index) => (
                <article key={`${item.time}-${item.title}-${index}`} className="timeline-item">
                  <span>{item.time}</span>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )
    }

    return (
      <>
        <section className="detail-card">
          <p className="section-label">任务说明</p>
          <h3>{taskDraft.taskName}</h3>
          <div className="detail-list">
            <article><span>产品</span><strong>{taskDraft.productName}</strong></article>
            <article><span>市场</span><strong>{taskDraft.market}</strong></article>
            <article><span>行业方向</span><strong>{taskDraft.industryDirection}</strong></article>
            <article><span>目标平台</span><strong>{taskDraft.platforms.join(' / ') || '未选择'}</strong></article>
            <article><span>触达方式</span><strong>{taskDraft.outreachMethods.join(' / ') || '未选择'}</strong></article>
            <article><span>目标触达</span><strong>{taskDraft.targetReach} 位达人</strong></article>
          </div>
        </section>

        <section className="detail-card">
          <p className="section-label">合作约束</p>
          <div className="tag-row">
            {taskDraft.constraints.map((item) => (
              <span key={item} className="soft-tag">
                {item}
              </span>
            ))}
          </div>
          <div className="detail-note">
            <strong>执行方案</strong>
            <textarea className="plan-box" readOnly value={buildTaskInstruction(taskForm)} />
          </div>
        </section>
      </>
    )
  }

  if (!currentUser) {
    return (
      <div className="login-shell">
        <div className="login-hero">
          <p className="eyebrow">Creator BD</p>
          <h1>方洲AI</h1>
          <p>帮跨境品牌把红人 BD 从“找人”推进到“会话”和“结果”。</p>
          <p className="helper-text">{bootstrap.authMode === 'supabase' ? '当前已启用正式账号体系' : '当前还是 demo 登录，接上 Supabase Auth 后可启用正式账号'}</p>
        </div>
        <div className="login-panel">
          <div className="filter-row">
            <button type="button" className={authTab === 'login' ? 'filter-chip active' : 'filter-chip'} onClick={() => setAuthTab('login')}>
              登录
            </button>
            <button type="button" className={authTab === 'register' ? 'filter-chip active' : 'filter-chip'} onClick={() => setAuthTab('register')}>
              注册
            </button>
          </div>

          {authTab === 'login' ? (
            <form onSubmit={handleLogin} className="auth-form">
              <label>
                <span>邮箱</span>
                <input value={loginForm.username} onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))} />
              </label>
              <label>
                <span>密码</span>
                <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))} />
              </label>
              <button type="submit" className="primary-button" disabled={loggingIn}>
                {loggingIn ? '登录中...' : '进入系统'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-form">
              <label>
                <span>姓名</span>
                <input value={registerForm.name} onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label>
                <span>邮箱</span>
                <input value={registerForm.email} onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))} />
              </label>
              <label>
                <span>密码</span>
                <input type="password" value={registerForm.password} onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))} />
              </label>
              {bootstrap.authMode !== 'supabase' ? <p className="helper-text">先把 `SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY` 配好，注册入口才会生效。</p> : null}
              <button type="submit" className="primary-button" disabled={registering || bootstrap.authMode !== 'supabase'}>
                {registering ? '注册中...' : '创建账号'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="workspace-header">
        <div className="brand-inline">
          <div className="brand-stack">
            <strong>方洲AI</strong>
            <span>红人 BD 系统</span>
          </div>
        </div>
        <div className="toolbar-inline">
          <div className="context-pill">
            <span>当前品牌</span>
            <strong>{bootstrap.brands.find((brand) => brand.id === brandId)?.name || '-'}</strong>
          </div>
          <div className="context-pill">
            <span>当前任务</span>
            <strong>{activeTaskSummary.title}</strong>
          </div>
          <div className="context-pill">
            <span>触达方式可用</span>
            <strong>{`${taskDraft.outreachMethods.length}/${Object.keys(taskForm.outreachMethods).length}`}</strong>
          </div>
          <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
            {bootstrap.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
          <div className="user-chip">{currentUser.name}</div>
          <button type="button" className="chip-button" onClick={handleLogout}>
            退出
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="workspace-grid">
        <aside className="left-rail">
          <section className="panel rail-panel">
            <div className="rail-head">
              <div>
                <p className="section-label">任务列表</p>
                <h3>{taskStatusSummary(normalizedTasks)}</h3>
              </div>
            </div>

            <input
              className="search-input"
              placeholder="搜索任务 / 产品 / 市场"
              value={taskQuery}
              onChange={(event) => setTaskQuery(event.target.value)}
            />

            <div className="filter-row">
              {taskStatusFilters.map((item) => (
                <button key={item} type="button" className={taskFilter === item ? 'filter-chip active' : 'filter-chip'} onClick={() => setTaskFilter(item)}>
                  {item}
                </button>
              ))}
            </div>

            <div className="task-list">
              {filteredTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className={task.id === currentTask?.id ? 'task-row active' : 'task-row'}
                  onClick={() => {
                    setCurrentTaskId(task.id)
                    setPageId('execute')
                  }}
                >
                  <div className="task-row-top">
                    <strong>{task.display.title}</strong>
                    <span className="status-tag">{task.display.status}</span>
                  </div>
                  <span>{task.display.meta}</span>
                  <small>{formatTime(task.createdAt)}</small>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="center-column">
          <section className="panel summary-strip">
            <div className="summary-block">
              <span>产品</span>
              <strong>{taskDraft.productName}</strong>
            </div>
            <div className="summary-block">
              <span>市场</span>
              <strong>{taskDraft.market}</strong>
            </div>
            <div className="summary-block">
              <span>行业方向</span>
              <strong>{taskDraft.industryDirection}</strong>
            </div>
            <div className="summary-block">
              <span>合作约束</span>
              <strong>{`佣金 ≤ ${taskForm.commissionCap}%`}</strong>
            </div>
            <div className="summary-block">
              <span>目标触达</span>
              <strong>{`${taskForm.targetReach} 位达人`}</strong>
            </div>
          </section>

          <section className="panel tab-panel">
            <div className="mode-switch">
              {taskPageTabs.map((tab) => (
                <button key={tab.id} type="button" className={pageId === tab.id ? 'mode-chip active' : 'mode-chip'} onClick={() => setPageId(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>

            {pageId === 'create' ? (
              <div className="create-layout">
                <section className="form-card">
                  <h4>任务信息</h4>
                  <div className="field-grid">
                    <label>
                      <span>任务名称</span>
                      <input value={taskForm.taskName} onChange={(event) => setTaskForm((prev) => ({ ...prev, taskName: event.target.value }))} />
                    </label>
                    <label>
                      <span>产品 / SKU</span>
                      <input value={taskForm.productName} onChange={(event) => setTaskForm((prev) => ({ ...prev, productName: event.target.value }))} />
                    </label>
                    <label>
                      <span>市场</span>
                      <select value={taskForm.market} onChange={(event) => setTaskForm((prev) => ({ ...prev, market: event.target.value }))}>
                        <option>美国</option>
                        <option>英国</option>
                        <option>德国</option>
                      </select>
                    </label>
                    <label>
                      <span>行业方向</span>
                      <input value={taskForm.industryDirection} onChange={(event) => setTaskForm((prev) => ({ ...prev, industryDirection: event.target.value }))} />
                    </label>
                    <label>
                      <span>达人范围</span>
                      <select value={taskForm.creatorTier} onChange={(event) => setTaskForm((prev) => ({ ...prev, creatorTier: event.target.value }))}>
                        <option>5k - 100k</option>
                        <option>50k - 300k</option>
                        <option>300k+</option>
                      </select>
                    </label>
                    <label>
                      <span>合作方式</span>
                      <select value={taskForm.cooperationModel} onChange={(event) => setTaskForm((prev) => ({ ...prev, cooperationModel: event.target.value }))}>
                        <option>寄样 + 佣金</option>
                        <option>纯佣金</option>
                        <option>固定费 + 佣金</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="form-card">
                  <h4>目标平台</h4>
                  <div className="toggle-grid">
                    {Object.entries(taskForm.platforms).map(([label, enabled]) => (
                      <button
                        key={label}
                        type="button"
                        className={enabled ? 'toggle-pill active' : 'toggle-pill'}
                        onClick={() =>
                          setTaskForm((prev) => ({
                            ...prev,
                            platforms: { ...prev.platforms, [label]: !prev.platforms[label] },
                          }))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <h4>触达方式</h4>
                  <div className="toggle-grid">
                    {Object.entries(taskForm.outreachMethods).map(([label, enabled]) => (
                      <button
                        key={label}
                        type="button"
                        className={enabled ? 'toggle-pill active' : 'toggle-pill'}
                        onClick={() =>
                          setTaskForm((prev) => ({
                            ...prev,
                            outreachMethods: { ...prev.outreachMethods, [label]: !prev.outreachMethods[label] },
                          }))
                        }
                      >
                        {enabled ? `${label} 已授权` : `${label} 未授权`}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="form-card">
                  <h4>合作约束</h4>
                  <label>
                    <span>佣金上限 {taskForm.commissionCap}%</span>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      value={taskForm.commissionCap}
                      onChange={(event) => setTaskForm((prev) => ({ ...prev, commissionCap: Number(event.target.value) }))}
                    />
                  </label>
                  <label>
                    <span>目标触达人数</span>
                    <input
                      type="number"
                      min="1"
                      value={taskForm.targetReach}
                      onChange={(event) => setTaskForm((prev) => ({ ...prev, targetReach: Number(event.target.value) || 1 }))}
                    />
                  </label>
                  <div className="constraint-grid">
                    <button type="button" className={taskForm.allowSeeding ? 'toggle-pill active' : 'toggle-pill'} onClick={() => setTaskForm((prev) => ({ ...prev, allowSeeding: !prev.allowSeeding }))}>
                      {taskForm.allowSeeding ? '允许寄样' : '不允许寄样'}
                    </button>
                    <button type="button" className={taskForm.allowFixedFee ? 'toggle-pill active' : 'toggle-pill'} onClick={() => setTaskForm((prev) => ({ ...prev, allowFixedFee: !prev.allowFixedFee }))}>
                      {taskForm.allowFixedFee ? '允许固定费' : '不允许固定费'}
                    </button>
                    <button type="button" className={taskForm.avoidCompetitors ? 'toggle-pill active' : 'toggle-pill'} onClick={() => setTaskForm((prev) => ({ ...prev, avoidCompetitors: !prev.avoidCompetitors }))}>
                      {taskForm.avoidCompetitors ? '排除竞品达人' : '接受竞品达人'}
                    </button>
                  </div>
                  {taskDraft.missingInfo.length > 0 ? <p className="helper-text">{taskDraft.missingInfo.join('；')}</p> : null}
                </section>

                <section className="form-card">
                  <h4>动作</h4>
                  <div className="detail-note">
                    <strong>当前任务说明</strong>
                    <p>{`${taskDraft.taskName} ｜ ${taskDraft.market} ｜ ${taskDraft.industryDirection} ｜ 目标触达 ${taskDraft.targetReach} 位达人`}</p>
                  </div>
                  <div className="panel-actions">
                    <button type="button" className="primary-button" disabled={creatingTask} onClick={createTask}>
                      {creatingTask ? '创建中...' : '创建任务'}
                    </button>
                    <button type="button" className="chip-button" disabled={!currentTask} onClick={startExecution}>
                      开始执行
                    </button>
                  </div>
                </section>
              </div>
            ) : null}

            {pageId === 'execute' ? (
              <div className="execute-layout">
                <div className="execute-toolbar">
                  <p className="helper-text">这里只统计“当前任务”里的线索。点上方任一状态，会筛出对应对象。</p>
                  <input
                    className="search-input"
                    placeholder="搜索达人 / 平台 / 联系方式"
                    value={leadQuery}
                    onChange={(event) => setLeadQuery(event.target.value)}
                  />
                </div>

                <section className="bulk-panel">
                  <div className="table-card-head">
                    <div>
                      <p className="section-label">批量操作</p>
                      <h3>{selectedLeadIds.length > 0 ? `已选 ${selectedLeadIds.length} 条线索` : '先勾选线索再批量操作'}</h3>
                    </div>
                    <button type="button" className="chip-button" onClick={toggleSelectAllFilteredLeads}>
                      {filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.includes(lead.id)) ? '取消全选' : '全选当前筛选结果'}
                    </button>
                  </div>
                  <div className="bulk-grid">
                    <label>
                      <span>批量状态</span>
                      <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>
                        <option value="">不修改</option>
                        {leadStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>批量处理方式</span>
                      <select value={bulkHandling} onChange={(event) => setBulkHandling(event.target.value)}>
                        <option value="">不修改</option>
                        {handlingModes.map((handling) => (
                          <option key={handling} value={handling}>
                            {handling}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>批量提醒时间</span>
                      <input type="datetime-local" value={bulkReminderAt} onChange={(event) => setBulkReminderAt(event.target.value)} />
                    </label>
                    <label>
                      <span>批量提醒备注</span>
                      <input value={bulkReminderNote} onChange={(event) => setBulkReminderNote(event.target.value)} placeholder="例如：48 小时后统一二次跟进" />
                    </label>
                  </div>
                  <label className="bulk-note">
                    <span>批量下一步动作</span>
                    <input value={bulkNextAction} onChange={(event) => setBulkNextAction(event.target.value)} placeholder="例如：统一进入第二轮触达" />
                  </label>
                  <div className="panel-actions">
                    <button type="button" className="primary-button" disabled={updatingLead || selectedLeadIds.length === 0} onClick={applyBulkUpdate}>
                      {updatingLead ? '批量处理中...' : '应用批量操作'}
                    </button>
                  </div>
                </section>

                <div className="funnel-grid">
                  <button type="button" className={stageFilter === '全部' ? 'stage-card active' : 'stage-card'} onClick={() => setStageFilter('全部')}>
                    <span>全部</span>
                    <strong>{leads.length}</strong>
                  </button>
                  {Object.entries(funnel).map(([label, value]) => (
                    <button key={label} type="button" className={stageFilter === label ? 'stage-card active' : 'stage-card'} onClick={() => setStageFilter(label)}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </button>
                  ))}
                </div>

                <div className="execute-main">
                  <section className="table-card">
                    <div className="table-card-head">
                      <div>
                        <p className="section-label">线索表</p>
                        <h3>{activeTaskSummary.title}</h3>
                      </div>
                      <span className="muted-text">{`${filteredLeads.length} 条结果`}</span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>选择</th>
                            <th>名称</th>
                            <th>平台</th>
                            <th>粉丝量</th>
                            <th>匹配度</th>
                            <th>触达方式</th>
                            <th>当前状态</th>
                            <th>处理方式</th>
                            <th>跟进提醒</th>
                            <th>最近动作</th>
                            <th>下一步动作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeads.map((lead) => (
                            <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)}>
                              <td onClick={(event) => event.stopPropagation()}>
                                <input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLeadSelection(lead.id)} />
                              </td>
                              <td>{lead.name}</td>
                              <td>{lead.platform}</td>
                              <td>{lead.followers}</td>
                              <td>{lead.fitScore}</td>
                              <td>{lead.contact}</td>
                              <td><span className="status-tag inline">{lead.status}</span></td>
                              <td>{lead.handling}</td>
                              <td>{lead.reminderAt ? formatTime(lead.reminderAt) : '-'}</td>
                              <td>{lead.lastAction}</td>
                              <td>{lead.nextAction}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="timeline-card">
                    <div className="table-card-head">
                      <div>
                        <p className="section-label">任务进展板</p>
                        <h3>最近动作</h3>
                      </div>
                    </div>
                    <div className="timeline-list">
                      {timeline.map((item) => (
                        <article key={`${item.time}-${item.title}`} className="timeline-item">
                          <span>{item.time}</span>
                          <strong>{item.title}</strong>
                          <p>{item.detail}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}

            {pageId === 'conversation' ? (
              <div className="conversation-page">
                <section className="inbox-panel">
                  <div className="table-card-head">
                    <div>
                      <p className="section-label">会话收件箱</p>
                      <h3>待处理会话</h3>
                    </div>
                  </div>
                  <input
                    className="search-input"
                    placeholder="搜索达人 / 状态 / 意图"
                    value={conversationQuery}
                    onChange={(event) => setConversationQuery(event.target.value)}
                  />
                  <div className="filter-row">
                    {inboxStatusFilters.map((item) => (
                      <button key={item} type="button" className={conversationFilter === item ? 'filter-chip active' : 'filter-chip'} onClick={() => setConversationFilter(item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                  <div className="inbox-list">
                    {inboxLeads.map((lead) => (
                      <button key={lead.id} type="button" className={selectedLead?.id === lead.id ? 'inbox-row active' : 'inbox-row'} onClick={() => setSelectedLeadId(lead.id)}>
                        <div className="task-row-top">
                          <strong>{lead.name}</strong>
                          <span className="status-tag">{lead.status}</span>
                        </div>
                        <span>{`${lead.platform} ｜ ${lead.handling}`}</span>
                        <small>{lead.intent}</small>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="thread-panel">
                  <div className="table-card-head">
                    <div>
                      <p className="section-label">当前完整会话</p>
                      <h3>{selectedLead ? selectedLead.name : '未选中会话'}</h3>
                    </div>
                  </div>
                  <div className="thread-meta">
                    <span>{selectedLead?.platform || '-'}</span>
                    <span>{selectedLead?.contact || '-'}</span>
                    <span>{selectedLead?.handling || '-'}</span>
                  </div>
                  <div className="conversation-thread fixed">
                    {messages.map((message, index) => (
                      <article
                        key={`${message.role}-${index}`}
                        className={message.role === 'creator' ? 'message creator' : message.role === 'agent' ? 'message agent' : 'message system'}
                      >
                        <strong>{message.role === 'creator' ? '对方' : message.role === 'agent' ? '我方' : '系统'}</strong>
                        <p>{message.text}</p>
                      </article>
                    ))}
                  </div>
                  <div className="composer-panel">
                    <label className="composer-field">
                      <span>回复内容</span>
                      <textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        placeholder="输入你要发给对方的话，或先点右侧 AI 建议放入输入框。"
                      />
                    </label>
                    <div className="panel-actions">
                      <button type="button" className="primary-button" onClick={() => sendReply()} disabled={sendingReply || !replyDraft.trim()}>
                        {sendingReply ? '发送中...' : '发送回复'}
                      </button>
                      <button type="button" className="chip-button" onClick={() => setReplyDraft('')} disabled={sendingReply || !replyDraft}>
                        清空
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </section>
        </main>

        <aside className="right-rail">
          <section className="panel detail-panel">{renderDetailPanel()}</section>
        </aside>
      </div>
    </div>
  )
}

export default App
