import 'dotenv/config'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { supabase, supabaseEnabled, supabaseAuthEnabled, supabasePublic } from './supabase.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const clientDistDir = path.join(rootDir, 'dist', 'client')
const PORT = Number(process.env.PORT || 8787)

const TASK_STATUS = {
  packaged: '待执行',
  externalRunning: '外部执行中',
  waitingRefill: '待贴回结果',
  completed: '已回填',
}

const users = [
  {
    id: 'user-demo-1',
    username: 'demo@fangzhou.ai',
    password: 'demo123',
    name: 'Demo Operator',
  },
]

const demoBrands = [
  {
    id: 'brand-demo-1',
    name: '方洲AI Demo Brand',
    overview: '当前工作区用于创建外联任务、整理合作对象、处理回复并沉淀品牌资产。',
  },
  {
    id: 'brand-demo-2',
    name: 'North Star Wellness',
    overview: '用于跨境外联推进的品牌空间，可管理任务、资产、会话和品牌记忆。',
  },
]

const modules = [
  {
    id: 'traffic-acquisition',
    name: '流量获取',
    status: '当前主打',
    locked: false,
    description: '围绕创作者外联、渠道站点、媒体合作和联盟拓展，先做最容易卖、最容易验证的增长模块。',
    quickTasks: [
      '为品牌输出本周 50 个创作者合作对象',
      '为 10 个重点对象生成首轮外联话术',
      '整理本周可推进的渠道站点和媒体名单',
    ],
  },
  {
    id: 'content-social',
    name: '内容与社媒',
    status: '第二阶段',
    locked: true,
    description: '社媒运营、内容发布、评论互动和社媒监控，暂不作为第一阶段主打。',
    quickTasks: [],
  },
  {
    id: 'conversion-scale',
    name: '转化与放大',
    status: '第三阶段',
    locked: true,
    description: '联盟营销、红人复投、ROI 分析和效果放大，后续作为第二层业务扩展。',
    quickTasks: [],
  },
]

const userTokens = new Map()
const memoryTasks = []
const memoryLeads = []
const memoryMessages = []
const memoryPreferences = new Map()
let bootstrapped = false

function defaultPreferences() {
  return {
    brandProfile: {
      intro: 'North Star Wellness 是一个做居家恢复和热感护理产品的品牌，重点卖筋膜枪、热敷贴和 Recovery Wrap。',
      primaryProducts: '筋膜枪 / 热敷贴 / Recovery Wrap',
      productLinks: 'https://northstarbeauty.com/products/recovery-wrap-pro\nhttps://northstarbeauty.com/products/heat-relief-patch',
      quarterFocus: '本季度主推 Recovery Wrap 和热感贴，重点打母亲节礼品与恢复场景。',
      pricingStrategy: '默认寄样 + CPS / CPA；固定费用需要单独审批。',
      productPoints: '恢复速度快、居家场景强、送礼属性清晰、内容容易拍。',
      cooperationModes: '寄样 + 佣金优先，必要时按对象级别单独谈固定费用。',
      campaignProof: '已有创作者测评、newsletter 资源和 deal 站冷启动样例。',
      faq: '品牌一句话介绍、价格带、寄样周期、佣金范围、是否接受独家。',
    },
    channelConfig: {
      provider: 'codex',
      opencloudName: 'OpenClaw',
      opencloudUrl: '',
      codexName: 'Codex',
      codexUrl: '',
      gmailSender: '',
      gmailSignature: 'Best regards,\nFangzhou AI',
      whatsappNumber: '',
      youtubeWorkspace: '',
      instagramWorkspace: '',
      tiktokWorkspace: '',
    },
    settings: {
      englishTone: '自然专业',
      followupRule: '48 小时后自动提醒复查，复杂对话进入人工接管',
      summaryRule: '每次回填后自动生成摘要、下一步动作和资产更新建议',
    },
  }
}

function nowIso() {
  return new Date().toISOString()
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

function moduleById(moduleId) {
  return modules.find((item) => item.id === moduleId) || modules[0]
}

function appendLogs(task, messages) {
  task.logs.push(
    ...messages.map((message) => ({
      at: nowIso(),
      level: 'info',
      message,
    })),
  )
}

function detectServiceTrack(instruction) {
  const text = instruction.toLowerCase()

  if (/pr|媒体|记者|magazine|press/.test(text)) {
    return {
      name: '人工BD',
      description: '高价值资源保留人工推进，由你亲自谈判。',
      deliverables: ['资源名单', '切入理由', '沟通策略', '优先级建议'],
      targets: ['媒体名单', '历史报道', '品牌卖点', '联系人线索'],
    }
  }

  if (/中腰|话术|跟进|合作|reply|dm|邮件/.test(text)) {
    return {
      name: 'AI辅助处理',
      description: '中等复杂度对象由 AI 辅助拆解并生成外联话术。',
      deliverables: ['分层名单', '首轮话术', '跟进节奏', '风险提醒'],
      targets: ['TikTok', 'Instagram', '达人主页', '历史合作记录'],
    }
  }

  return {
    name: '自动BD',
    description: '适合标准化抓取与批量推进的小红人、Deal 站和基础名单任务。',
    deliverables: ['候选名单', '基础筛选', '优先级排序', '可批量建联清单'],
    targets: ['TikTok', 'Instagram', 'YouTube', 'Deal 站'],
  }
}

function parseRefillResult(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const evidence = lines.filter((line) => line.startsWith('-') || line.startsWith('•')).slice(0, 6)
  const summaryLines = lines.slice(0, 4)
  const suggestedActions = lines.filter((line) => /建议|下一步|跟进|动作/i.test(line)).slice(0, 4)

  return {
    rawText,
    summary: summaryLines.join(' ') || '已收到回填结果，建议人工确认后进入下一轮 BD 推进。',
    evidence:
      evidence.length > 0
        ? evidence
        : ['已收到结果，但当前未识别出标准化名单或证据，请人工补充。'],
    nextActions:
      suggestedActions.length > 0 ? suggestedActions : ['人工复核回填结果，并拆分下一步推进任务。'],
    receivedAt: nowIso(),
  }
}

function publicTask(task) {
  return {
    id: task.id,
    brandId: task.brandId,
    userId: task.userId,
    moduleId: task.moduleId,
    type: task.type,
    instruction: task.instruction,
    status: task.status,
    createdAt: task.createdAt,
    submittedAt: task.submittedAt,
    completedAt: task.completedAt,
    structuredTask: task.structuredTask,
    executionPackage: task.executionPackage,
    refill: task.refill,
    logs: task.logs,
  }
}

function mapBrandRow(row) {
  return {
    id: row.id,
    name: row.name,
    overview: row.overview || '',
  }
}

function mapTaskRow(row) {
  return {
    id: row.id,
    brandId: row.brand_id,
    userId: row.user_id,
    moduleId: row.module_id,
    type: row.type,
    instruction: row.instruction,
    status: row.status,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    structuredTask: row.structured_task || {},
    executionPackage: row.execution_package || {},
    refill: row.refill || null,
    logs: Array.isArray(row.logs) ? row.logs : [],
  }
}

function mapLeadRow(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    brandId: row.brand_id,
    name: row.name,
    platform: row.platform,
    followers: row.followers,
    fitScore: row.fit_score,
    contact: row.contact,
    status: row.status,
    handling: row.handling,
    lastAction: row.last_action,
    nextAction: row.next_action,
    intent: row.intent,
    risk: row.risk,
    notes: row.notes,
    reminderAt: row.reminder_at,
    reminderNote: row.reminder_note || '',
    createdAt: row.created_at,
  }
}

function mapMessageRow(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    taskId: row.task_id,
    role: row.role,
    text: row.text,
    createdAt: row.created_at,
  }
}

function taskToRow(task) {
  return {
    id: task.id,
    brand_id: task.brandId,
    user_id: task.userId,
    module_id: task.moduleId,
    type: task.type,
    instruction: task.instruction,
    status: task.status,
    created_at: task.createdAt,
    submitted_at: task.submittedAt,
    completed_at: task.completedAt,
    structured_task: task.structuredTask,
    execution_package: task.executionPackage,
    refill: task.refill,
    logs: task.logs,
  }
}

function leadToRow(lead) {
  return {
    id: lead.id,
    task_id: lead.taskId,
    brand_id: lead.brandId,
    name: lead.name,
    platform: lead.platform,
    followers: lead.followers,
    fit_score: lead.fitScore,
    contact: lead.contact,
    status: lead.status,
    handling: lead.handling,
    last_action: lead.lastAction,
    next_action: lead.nextAction,
    intent: lead.intent,
    risk: lead.risk,
    notes: lead.notes,
    reminder_at: lead.reminderAt,
    reminder_note: lead.reminderNote || '',
    created_at: lead.createdAt,
  }
}

function messageToRow(message) {
  return {
    id: message.id,
    lead_id: message.leadId,
    task_id: message.taskId,
    role: message.role,
    text: message.text,
    created_at: message.createdAt,
  }
}

function getDemoUserByToken(req) {
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const userId = userTokens.get(token)
  return users.find((item) => item.id === userId) || null
}

async function resolveAuthUser(req) {
  const demoUser = getDemoUserByToken(req)
  if (demoUser) return { ...demoUser, authMode: 'demo' }

  if (!supabaseAuthEnabled) return null

  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  return {
    id: data.user.id,
    username: data.user.email || '',
    name: data.user.user_metadata?.name || data.user.email || 'Supabase User',
    authMode: 'supabase',
  }
}

async function loadUserPreferences(user, brandId) {
  const base = defaultPreferences()

  if (user.authMode !== 'supabase' || !supabaseAuthEnabled) {
    const stored = memoryPreferences.get(user.id) || {}
    return stored[brandId] || base
  }

  const { data, error } = await supabase.auth.admin.getUserById(user.id)
  if (error || !data.user) return base

  const stored = data.user.user_metadata?.brandPreferences?.[brandId] || {}
  return {
    ...base,
    ...stored,
    brandProfile: { ...base.brandProfile, ...(stored.brandProfile || {}) },
    channelConfig: { ...base.channelConfig, ...(stored.channelConfig || {}) },
    settings: { ...base.settings, ...(stored.settings || {}) },
  }
}

async function saveUserPreferences(user, brandId, nextPreferences) {
  const merged = {
    ...defaultPreferences(),
    ...nextPreferences,
    brandProfile: { ...defaultPreferences().brandProfile, ...(nextPreferences.brandProfile || {}) },
    channelConfig: { ...defaultPreferences().channelConfig, ...(nextPreferences.channelConfig || {}) },
    settings: { ...defaultPreferences().settings, ...(nextPreferences.settings || {}) },
  }

  if (user.authMode !== 'supabase' || !supabaseAuthEnabled) {
    const existing = memoryPreferences.get(user.id) || {}
    memoryPreferences.set(user.id, { ...existing, [brandId]: merged })
    return merged
  }

  const { data, error } = await supabase.auth.admin.getUserById(user.id)
  if (error || !data.user) throw error || new Error('USER_NOT_FOUND')

  const metadata = data.user.user_metadata || {}
  const existingBrandPreferences = metadata.brandPreferences || {}
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...metadata,
      brandPreferences: {
        ...existingBrandPreferences,
        [brandId]: merged,
      },
    },
  })

  if (updateError) throw updateError
  return merged
}

async function requireUser(req, res, next) {
  const user = await resolveAuthUser(req)
  if (!user) {
    res.status(401).json({ error: 'UNAUTHORIZED' })
    return
  }

  req.user = user
  next()
}

function createStructuredTask({ brandId, userId, moduleId, instruction, brands }) {
  const module = moduleById(moduleId)
  const brand = brands.find((item) => item.id === brandId)
  const serviceTrack = detectServiceTrack(instruction)
  const taskId = createId('task')

  const structuredTask = {
    objective: instruction.trim(),
    moduleId,
    moduleName: module.name,
    serviceTrack: serviceTrack.name,
    trackDescription: serviceTrack.description,
    targets: serviceTrack.targets,
    deliverables: serviceTrack.deliverables,
    steps: [
      `确认品牌目标与本周交付方向：${brand?.name || '当前品牌'}`,
      `判断任务属于 ${serviceTrack.name}，并确认抓取来源：${serviceTrack.targets.join(' / ')}`,
      '生成适合外部 Agent 使用的执行包，便于快速完成搜集与初步整理',
      '结果回填后自动生成交付摘要、后续推进动作和历史记录',
    ],
  }

  const packageContent = [
    '# 方洲AI外联执行提示',
    '',
    `品牌：${brand?.name || '-'}`,
    `业务模块：${module.name}`,
    `工作模式：${serviceTrack.name}`,
    `任务目标：${instruction.trim()}`,
    '',
    '## 你现在要完成的工作',
    '请你作为具备浏览器访问能力的外部执行提供方，围绕本任务完成对象搜集、初步筛选和结构化整理。',
    '',
    '## 重点来源',
    ...serviceTrack.targets.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## 需要交付的内容',
    ...serviceTrack.deliverables.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## 回填格式',
    '### 执行摘要',
    '- 用 3-5 条概括本次外联产出',
    '',
    '### 对象 / 证据',
    '- 给出对象名称、平台、链接、匹配理由或资源说明',
    '',
    '### 建议后续动作',
    '- 输出下一步应推进的 3 条动作',
  ].join('\n')

  return {
    id: taskId,
    brandId,
    userId,
    moduleId,
    type: module.name,
    instruction: instruction.trim(),
    status: TASK_STATUS.packaged,
    createdAt: nowIso(),
    submittedAt: null,
    completedAt: null,
    structuredTask,
    executionPackage: {
      title: `${module.name} · ${serviceTrack.name}执行提示`,
      content: packageContent,
      exportName: `${taskId}.txt`,
      externalStatus: '未提交',
    },
    refill: null,
    logs: [
      {
        at: nowIso(),
        level: 'info',
        message: `任务已完成结构化，当前归类到 ${serviceTrack.name}。`,
      },
    ],
  }
}

function createDemoLeadSet(task) {
  const rows = [
    {
      name: 'Pulse Review Lab',
      platform: 'YouTube',
      followers: '频道',
      fitScore: 91,
      contact: 'Gmail',
      status: '已回复',
      handling: 'AI辅助回复',
      lastAction: '对方回复要媒体包与合作条件',
      nextAction: '补一版品牌说明与报价边界',
      intent: '有兴趣，但需要更多资料',
      risk: '品牌记忆不完整会拖慢推进',
      notes: '适合做测评合作，重点看发布时间和栏目形式。',
      reminderAt: null,
      reminderNote: '',
      messages: [
        { role: 'system', text: '当前合作约束：优先寄样 + CPA；避免先承诺固定媒体包费用。' },
        { role: 'agent', text: 'Hi, we are planning a spring recovery product push and would like to explore a review collaboration.' },
        { role: 'creator', text: 'Can you share a short brand intro, launch timing, and budget structure first?' },
      ],
    },
    {
      name: 'Deal Circle Daily',
      platform: '渠道站点',
      followers: '站点',
      fitScore: 88,
      contact: 'Gmail',
      status: '洽谈中',
      handling: '人工接管',
      lastAction: '对方确认可排进 4 月 newsletter',
      nextAction: '确认样品、折扣和追踪链接方案',
      intent: '高价值候选，需要定最终方案',
      risk: '需要确定折扣机制与 tracking 口径',
      notes: '可直接带动首轮冷启动，适合人工确认细节。',
      reminderAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reminderNote: '明天确认 newsletter 资源位和追踪链接',
      messages: [
        { role: 'system', text: '高价值对象，建议人工接管。' },
        { role: 'creator', text: 'We can feature this in our April wellness newsletter if you confirm discount, sample timing, and tracking links.' },
      ],
    },
    {
      name: 'North Star Weekly Picks',
      platform: 'Affiliate',
      followers: '联盟客',
      fitScore: 84,
      contact: 'Gmail',
      status: '已触达',
      handling: '自动触达',
      lastAction: '首轮合作说明已发',
      nextAction: '等待 48 小时后检查是否需要二次跟进',
      intent: '等待回复',
      risk: '暂无',
      notes: '适合标准化首轮推进，先验证转化位和佣金模式。',
      reminderAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      reminderNote: '48 小时后检查是否需要二次触达',
      messages: [{ role: 'system', text: '已发送首轮触达，暂时无需人工介入。' }],
    },
    {
      name: 'Lifted Living Editorial',
      platform: '媒体合作',
      followers: '站点',
      fitScore: 81,
      contact: 'Gmail',
      status: '初筛通过',
      handling: '自动触达',
      lastAction: '已进入本周候选池',
      nextAction: '等待首轮媒体外联',
      intent: '可批量推进',
      risk: '需确认内容栏目与产品切口匹配',
      notes: '媒体栏目偏恢复和 wellness，适合作为品牌背书位。',
      reminderAt: null,
      reminderNote: '',
      messages: [{ role: 'system', text: '已通过初筛，等待首轮建联。' }],
    },
    {
      name: 'Studio Cart Finds',
      platform: 'Instagram',
      followers: '12.8万',
      fitScore: 82,
      contact: 'Instagram DM',
      status: '已抓取',
      handling: '自动触达',
      lastAction: '抓取到主页与联系入口',
      nextAction: '判断是否进入本周名单',
      intent: '待初筛',
      risk: '暂无',
      notes: '偏生活方式与礼物推荐，待确认是否匹配本季切口。',
      reminderAt: null,
      reminderNote: '',
      messages: [{ role: 'system', text: '刚进入候选池，还没有会话。' }],
    },
    {
      name: 'Recovery Notes Media',
      platform: '媒体合作',
      followers: '媒体',
      fitScore: 76,
      contact: 'Gmail',
      status: '待人工接管',
      handling: '人工接管',
      lastAction: '对方要求品牌背景、定价和 campaign 目标',
      nextAction: '补齐品牌记忆后再回',
      intent: '需提供更完整品牌信息',
      risk: '信息不完整会影响推进',
      notes: '对内容要求细，适合人工确认叙事和 KPI。',
      reminderAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reminderNote: '补品牌背景与 KPI 资料',
      messages: [{ role: 'creator', text: 'Please send over your brand background, KPIs, campaign examples, and the key product angle for this quarter.' }],
    },
    {
      name: 'Everyday Reset Picks',
      platform: 'Affiliate',
      followers: '联盟客',
      fitScore: 86,
      contact: 'Gmail',
      status: '已确认合作',
      handling: '人工接管',
      lastAction: '已确认样品寄送 + CPS 机制',
      nextAction: '移交履约并跟踪发布时间',
      intent: '已达成合作',
      risk: '需跟踪发样和发布时间',
      notes: '可作为当前品牌外联的示范资产。',
      reminderAt: null,
      reminderNote: '',
      messages: [{ role: 'creator', text: 'Sounds good. Gifted product plus CPS works for us. Please share the final links and shipping plan.' }],
    },
  ]

  const leads = rows.map((item, index) => ({
    id: `${task.id}-lead-${index + 1}`,
    taskId: task.id,
    brandId: task.brandId,
    name: item.name,
    platform: item.platform,
    followers: item.followers,
    fitScore: item.fitScore,
    contact: item.contact,
    status: item.status,
    handling: item.handling,
    lastAction: item.lastAction,
    nextAction: item.nextAction,
    intent: item.intent,
    risk: item.risk,
    notes: item.notes,
    reminderAt: item.reminderAt,
    reminderNote: item.reminderNote,
    createdAt: task.createdAt,
  }))

  const messages = leads.flatMap((lead, leadIndex) =>
    rows[leadIndex].messages.map((message, messageIndex) => ({
      id: `${lead.id}-msg-${messageIndex + 1}`,
      leadId: lead.id,
      taskId: task.id,
      role: message.role,
      text: message.text,
      createdAt: task.createdAt,
    })),
  )

  return { leads, messages }
}

async function getBrands() {
  if (!supabaseEnabled) return demoBrands

  const { data, error } = await supabase.from('brands').select('id,name,overview').order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapBrandRow)
}

async function listTasks(userId, brandId) {
  if (!supabaseEnabled) {
    return memoryTasks
      .filter((item) => item.userId === userId && item.brandId === brandId)
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data.map(mapTaskRow)
}

async function listLeadsByTask(taskId) {
  if (!supabaseEnabled) {
    return memoryLeads.filter((item) => item.taskId === taskId)
  }

  const { data, error } = await supabase.from('leads').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapLeadRow)
}

async function listMessagesByTask(taskId) {
  if (!supabaseEnabled) {
    return memoryMessages.filter((item) => item.taskId === taskId)
  }

  const { data, error } = await supabase.from('messages').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
  if (error) throw error
  return data.map(mapMessageRow)
}

async function getTaskById(taskId, userId) {
  if (!supabaseEnabled) {
    return memoryTasks.find((item) => item.id === taskId && item.userId === userId) || null
  }

  const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ? mapTaskRow(data) : null
}

async function getLeadById(leadId) {
  if (!supabaseEnabled) {
    return memoryLeads.find((item) => item.id === leadId) || null
  }

  const { data, error } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (error) throw error
  return data ? mapLeadRow(data) : null
}

async function saveTask(task) {
  if (!supabaseEnabled) {
    const index = memoryTasks.findIndex((item) => item.id === task.id)
    if (index >= 0) memoryTasks[index] = task
    else memoryTasks.unshift(task)
    return task
  }

  const { data, error } = await supabase.from('tasks').upsert(taskToRow(task)).select('*').single()
  if (error) throw error
  return mapTaskRow(data)
}

async function saveLead(lead) {
  if (!supabaseEnabled) {
    const index = memoryLeads.findIndex((item) => item.id === lead.id)
    if (index >= 0) memoryLeads[index] = lead
    else memoryLeads.push(lead)
    return lead
  }

  const { data, error } = await supabase.from('leads').upsert(leadToRow(lead)).select('*').single()
  if (error) throw error
  return mapLeadRow(data)
}

async function saveMessage(message) {
  if (!supabaseEnabled) {
    const index = memoryMessages.findIndex((item) => item.id === message.id)
    if (index >= 0) memoryMessages[index] = message
    else memoryMessages.push(message)
    return message
  }

  const { data, error } = await supabase.from('messages').insert(messageToRow(message)).select('*').single()
  if (error) throw error
  return mapMessageRow(data)
}

async function saveLeadSet(leads, messages) {
  if (!supabaseEnabled) {
    leads.forEach((lead) => {
      const index = memoryLeads.findIndex((item) => item.id === lead.id)
      if (index >= 0) memoryLeads[index] = lead
      else memoryLeads.push(lead)
    })

    messages.forEach((message) => {
      const index = memoryMessages.findIndex((item) => item.id === message.id)
      if (index >= 0) memoryMessages[index] = message
      else memoryMessages.push(message)
    })
    return
  }

  const { error: leadError } = await supabase.from('leads').upsert(leads.map(leadToRow))
  if (leadError) throw leadError

  const { error: messageError } = await supabase.from('messages').upsert(messages.map(messageToRow))
  if (messageError) throw messageError
}

async function seedDemoData() {
  if (bootstrapped) return

  const baseTaskPayloads = [
    {
      brandId: 'brand-demo-2',
      instruction: '任务名称：North Star 春季外联启动\n产品：Recovery Wrap Pro\n市场：美国\n行业方向：Recovery / Wellness\n目标平台：YouTube / 渠道站点 / 媒体合作\n触达方式：Gmail / Instagram DM\n对象范围：测评频道 / 渠道站点 / 媒体合作方\n合作方式：寄样 + CPS\n合作约束：优先寄样 + CPS；默认不接受固定媒体包费用；优先近 90 天无竞品合作对象\n目标触达：30 个合作对象',
      completed: true,
    },
    {
      brandId: 'brand-demo-2',
      instruction: '任务名称：Mother’s Day 渠道合作名单\n产品：Heat Relief Patch\n市场：美国\n行业方向：Gift / Wellness\n目标平台：渠道站点 / Affiliate / 媒体合作\n触达方式：Gmail\n对象范围：newsletter / coupon partner / affiliate partner\n合作方式：名单整理 + 首轮话术\n合作约束：优先 CPA / CPS；可寄样；需要可追踪链接\n目标触达：18 个合作对象',
      completed: false,
    },
  ]

  if (!supabaseEnabled) {
    const hasInvestorDemo = memoryTasks.some((item) => item.brandId === 'brand-demo-2' && item.userId === 'user-demo-1')
    if (!hasInvestorDemo) {
      const brands = demoBrands
      for (const payload of baseTaskPayloads) {
        const task = createStructuredTask({
          brandId: payload.brandId,
          userId: 'user-demo-1',
          moduleId: 'traffic-acquisition',
          instruction: payload.instruction,
          brands,
        })

        if (payload.completed) {
          task.status = TASK_STATUS.completed
          task.submittedAt = nowIso()
          task.completedAt = nowIso()
          task.executionPackage.externalStatus = '已回填'
          task.refill = parseRefillResult(`### 执行摘要
- 已完成一轮 spring launch 外联清单整理，覆盖测评频道、渠道站点和媒体合作对象。
- 当前已有 4 个高优先级对象进入沟通，其中 1 个渠道站点已确认 4 月合作窗口。
- 品牌记忆已经补进任务上下文，下一轮可以继续放大到 affiliate 和 newsletter 合作。

### 对象 / 证据
- Pulse Review Lab：YouTube 测评频道，已回复并索要品牌记忆资料。
- Deal Circle Daily：渠道站点，已进入 4 月 newsletter 洽谈。
- Recovery Notes Media：媒体合作方，要求补品牌背景和 KPI。

### 建议后续动作
- 先把品牌背景、价格策略和主推产品补到统一资料页。
- 下一轮优先扩大 affiliate / channel partner 名单，而不是继续加更多泛创作者。
- 把已回复对象统一推进到具体合作条件确认。`)
          appendLogs(task, ['首轮外联清单已完成回填。', '系统已生成下一轮推进建议。'])
        } else {
          appendLogs(task, ['等待发给外部 Agent 执行。'])
        }

        memoryTasks.push(task)
        const { leads, messages } = createDemoLeadSet(task)
        memoryLeads.push(...leads)
        memoryMessages.push(...messages)
      }
    }

    bootstrapped = true
    return
  }

  const { error: brandError } = await supabase.from('brands').upsert(
    demoBrands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      overview: brand.overview,
    })),
    { onConflict: 'id' },
  )
  if (brandError) throw brandError

  const { count, error: countError } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', 'user-demo-1')
    .eq('brand_id', 'brand-demo-2')

  if (countError) throw countError
  if ((count || 0) > 0) {
    bootstrapped = true
    return
  }

  const brands = demoBrands
  for (const payload of baseTaskPayloads) {
    const task = createStructuredTask({
      brandId: payload.brandId,
      userId: 'user-demo-1',
      moduleId: 'traffic-acquisition',
      instruction: payload.instruction,
      brands,
    })

    if (payload.completed) {
      task.status = TASK_STATUS.completed
      task.submittedAt = nowIso()
      task.completedAt = nowIso()
      task.executionPackage.externalStatus = '已回填'
      task.refill = parseRefillResult(`### 执行摘要
- 已完成一轮 spring launch 外联清单整理，覆盖测评频道、渠道站点和媒体合作对象。
- 当前已有 4 个高优先级对象进入沟通，其中 1 个渠道站点已确认 4 月合作窗口。
- 品牌记忆已经补进任务上下文，下一轮可以继续放大到 affiliate 和 newsletter 合作。

### 对象 / 证据
- Pulse Review Lab：YouTube 测评频道，已回复并索要品牌记忆资料。
- Deal Circle Daily：渠道站点，已进入 4 月 newsletter 洽谈。
- Recovery Notes Media：媒体合作方，要求补品牌背景和 KPI。

### 建议后续动作
- 先把品牌背景、价格策略和主推产品补到统一资料页。
- 下一轮优先扩大 affiliate / channel partner 名单，而不是继续加更多泛创作者。
- 把已回复对象统一推进到具体合作条件确认。`)
      appendLogs(task, ['首轮外联清单已完成回填。', '系统已生成下一轮推进建议。'])
    } else {
      appendLogs(task, ['等待发给外部 Agent 执行。'])
    }

    await saveTask(task)
    const { leads, messages } = createDemoLeadSet(task)
    await saveLeadSet(leads, messages)
  }

  bootstrapped = true
}

function groupMessagesByLead(messages) {
  return messages.reduce((acc, message) => {
    if (!acc[message.leadId]) acc[message.leadId] = []
    acc[message.leadId].push({
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
    })
    return acc
  }, {})
}

function attachConversations(leads, messages) {
  const grouped = groupMessagesByLead(messages)
  return leads.map((lead) => ({
    ...lead,
    conversation: grouped[lead.id] || [],
  }))
}

async function buildDashboard(userId, brandId) {
  const brandTasks = await listTasks(userId, brandId)
  const completedTasks = brandTasks.filter((item) => item.status === TASK_STATUS.completed)
  const today = new Date().toDateString()
  const todayTasks = brandTasks.filter((item) => new Date(item.createdAt).toDateString() === today)
  const activeTask = brandTasks[0] || null
  const leadsByTask = {}

  await Promise.all(
    brandTasks.map(async (task) => {
      const [leads, messages] = await Promise.all([listLeadsByTask(task.id), listMessagesByTask(task.id)])
      leadsByTask[task.id] = attachConversations(leads, messages)
    }),
  )

  const reminderLeads = Object.values(leadsByTask)
    .flat()
    .filter((lead) => lead.reminderAt)
    .sort((left, right) => String(left.reminderAt).localeCompare(String(right.reminderAt)))
    .slice(0, 8)

  const allLeads = Object.values(leadsByTask).flat()
  const dealSitePool = allLeads.filter((lead) => /deal/i.test(String(lead.platform)) || /deal/i.test(String(lead.type || ''))).length
  const mediaPool = allLeads.filter((lead) => /媒体|editorial|pr|youtube/i.test([lead.platform, lead.type].join(' '))).length
  const influencerPool = allLeads.length - dealSitePool - mediaPool
  const activeOutreach = allLeads.filter((lead) => ['已触达', '待回复', '洽谈中', '待接管'].includes(lead.status)).length
  const warmLeads = allLeads.filter((lead) => ['待回复', '洽谈中', '已合作', '待接管'].includes(lead.status)).length
  const weeklyCreatorGoal = allLeads.length || 0

  return {
    brandId,
    overview: {
      tagline: '跨境外联任务系统',
      weeklyCreatorGoal,
      outreachInProgress: activeOutreach,
      warmLeads,
      todayTaskCount: todayTasks.length,
      recentResultCount: completedTasks.length,
      pendingRefillCount: brandTasks.filter((item) => item.status === TASK_STATUS.waitingRefill).length,
      reminderCount: reminderLeads.length,
    },
    dataCenter: {
      influencerPool,
      dealSitePool,
      mediaPool,
      activeOutreach,
      historyTaskCount: brandTasks.length,
    },
    recentResults: completedTasks.slice(0, 3).map((item) => ({
      id: item.id,
      instruction: item.instruction,
      summary: item.refill?.summary || '',
      completedAt: item.completedAt,
    })),
    reminders: reminderLeads,
    tasks: brandTasks.map(publicTask),
    activeTaskId: activeTask?.id || null,
    leadsByTask,
  }
}

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    storage: supabaseEnabled ? 'supabase' : 'memory',
    uptime: process.uptime(),
    now: nowIso(),
  })
})

app.get('/api/bootstrap', async (_req, res) => {
  await seedDemoData()
  const brands = await getBrands()

  res.json({
    brands,
    modules,
    storageMode: supabaseEnabled ? 'supabase' : 'memory',
    authMode: supabaseAuthEnabled ? 'supabase' : 'demo',
    demoCredentials: {
      username: 'demo@fangzhou.ai',
      password: 'demo123',
    },
  })
})

app.post('/api/login', async (req, res) => {
  await seedDemoData()
  const { username, password } = req.body

  const demoUser = users.find((item) => item.username === username && item.password === password)

  if (supabaseAuthEnabled) {
    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email: username,
      password,
    })

    if (!error && data.session && data.user) {
      res.json({
        token: data.session.access_token,
        user: {
          id: data.user.id,
          username: data.user.email || username,
          name: data.user.user_metadata?.name || data.user.email || username,
        },
      })
      return
    }

    // Keep the built-in demo account usable even after switching to Supabase auth.
    if (demoUser) {
      const token = crypto.randomUUID()
      userTokens.set(token, demoUser.id)
      res.json({
        token,
        user: {
          id: demoUser.id,
          username: demoUser.username,
          name: demoUser.name,
        },
      })
      return
    }

    res.status(401).json({ error: 'INVALID_CREDENTIALS' })
    return
  }

  const user = demoUser
  if (!user) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS' })
    return
  }

  const token = crypto.randomUUID()
  userTokens.set(token, user.id)
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
    },
  })
})

app.post('/api/register', async (req, res) => {
  await seedDemoData()

  if (!supabaseAuthEnabled) {
    res.status(400).json({ error: 'SUPABASE_AUTH_NOT_CONFIGURED' })
    return
  }

  const { email, password, name } = req.body
  if (!email?.trim() || !password?.trim()) {
    res.status(400).json({ error: 'INVALID_REGISTER_PAYLOAD' })
    return
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password: password.trim(),
    email_confirm: true,
    user_metadata: {
      name: name?.trim() || email.trim(),
    },
  })

  if (createError || !created.user) {
    res.status(400).json({ error: createError?.message || 'REGISTER_FAILED' })
    return
  }

  const { data: signedIn, error: loginError } = await supabasePublic.auth.signInWithPassword({
    email: email.trim(),
    password: password.trim(),
  })

  if (loginError || !signedIn.session || !signedIn.user) {
    res.status(400).json({ error: loginError?.message || 'LOGIN_AFTER_REGISTER_FAILED' })
    return
  }

  res.status(201).json({
    token: signedIn.session.access_token,
    user: {
      id: signedIn.user.id,
      username: signedIn.user.email || email.trim(),
      name: signedIn.user.user_metadata?.name || name?.trim() || email.trim(),
    },
  })
})

app.get('/api/me', requireUser, async (req, res) => {
  await seedDemoData()
  const brands = await getBrands()
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      authMode: req.user.authMode,
    },
    brands,
  })
})

app.get('/api/preferences', requireUser, async (req, res) => {
  await seedDemoData()
  const brands = await getBrands()
  const brandId = String(req.query.brandId || brands[0]?.id || '')
  res.json(await loadUserPreferences(req.user, brandId))
})

app.put('/api/preferences', requireUser, async (req, res) => {
  await seedDemoData()
  const { brandId, brandProfile, channelConfig, settings } = req.body
  if (!brandId) {
    res.status(400).json({ error: 'INVALID_BRAND_ID' })
    return
  }

  const saved = await saveUserPreferences(req.user, brandId, {
    brandProfile: brandProfile || {},
    channelConfig: channelConfig || {},
    settings: settings || {},
  })

  res.json(saved)
})

app.get('/api/dashboard', requireUser, async (req, res) => {
  await seedDemoData()
  const brands = await getBrands()
  const brandId = String(req.query.brandId || brands[0]?.id || '')
  res.json(await buildDashboard(req.user.id, brandId))
})

app.post('/api/tasks', requireUser, async (req, res) => {
  await seedDemoData()
  const brands = await getBrands()
  const { brandId, moduleId, instruction } = req.body
  const brand = brands.find((item) => item.id === brandId)
  const module = modules.find((item) => item.id === moduleId)

  if (!brand || !module || module.locked || !instruction?.trim()) {
    res.status(400).json({ error: 'INVALID_TASK_PAYLOAD' })
    return
  }

  const task = createStructuredTask({
    brandId,
    userId: req.user.id,
    moduleId,
    instruction,
    brands,
  })

  const savedTask = await saveTask(task)
  const { leads, messages } = createDemoLeadSet(savedTask)
  await saveLeadSet(leads, messages)

  res.status(201).json({ task: publicTask(savedTask) })
})

app.post('/api/tasks/:id/submit', requireUser, async (req, res) => {
  await seedDemoData()
  const task = await getTaskById(req.params.id, req.user.id)

  if (!task) {
    res.status(404).json({ error: 'TASK_NOT_FOUND' })
    return
  }

  task.status = TASK_STATUS.externalRunning
  task.submittedAt = nowIso()
  task.executionPackage.externalStatus = '已发给外部 Agent'
  appendLogs(task, ['执行提示已发出，等待结果贴回。'])

  const savedTask = await saveTask(task)
  res.json({ task: publicTask(savedTask) })
})

app.post('/api/tasks/:id/mark-refill', requireUser, async (req, res) => {
  await seedDemoData()
  const task = await getTaskById(req.params.id, req.user.id)

  if (!task) {
    res.status(404).json({ error: 'TASK_NOT_FOUND' })
    return
  }

  task.status = TASK_STATUS.waitingRefill
  task.executionPackage.externalStatus = '等待贴回结果'
  appendLogs(task, ['当前线程正在等待结果贴回。'])

  const savedTask = await saveTask(task)
  res.json({ task: publicTask(savedTask) })
})

app.post('/api/tasks/:id/refill', requireUser, async (req, res) => {
  await seedDemoData()
  const task = await getTaskById(req.params.id, req.user.id)

  if (!task) {
    res.status(404).json({ error: 'TASK_NOT_FOUND' })
    return
  }

  const { rawText } = req.body
  if (!rawText?.trim()) {
    res.status(400).json({ error: 'INVALID_REFILL_PAYLOAD' })
    return
  }

  task.refill = parseRefillResult(rawText.trim())
  task.status = TASK_STATUS.completed
  task.completedAt = nowIso()
  task.executionPackage.externalStatus = '已完成回填'
  appendLogs(task, ['已收到执行结果。', '系统已生成摘要与下一步推进建议。'])

  const savedTask = await saveTask(task)
  res.json({ task: publicTask(savedTask) })
})

app.post('/api/leads/:id/messages', requireUser, async (req, res) => {
  await seedDemoData()
  const lead = await getLeadById(req.params.id)

  if (!lead) {
    res.status(404).json({ error: 'LEAD_NOT_FOUND' })
    return
  }

  const task = await getTaskById(lead.taskId, req.user.id)
  if (!task) {
    res.status(404).json({ error: 'TASK_NOT_FOUND' })
    return
  }

  const { text } = req.body
  if (!text?.trim()) {
    res.status(400).json({ error: 'INVALID_MESSAGE_PAYLOAD' })
    return
  }

  const message = await saveMessage({
    id: createId('msg'),
    leadId: lead.id,
    taskId: lead.taskId,
    role: 'agent',
    text: text.trim(),
    createdAt: nowIso(),
  })

  lead.lastAction = '已发送回复'
  lead.nextAction = '等待对方回复'
  if (lead.status === '已回复' || lead.status === '待人工接管') {
    lead.status = '洽谈中'
  }
  await saveLead(lead)

  appendLogs(task, [`已向 ${lead.name} 发送回复，当前状态进入 ${lead.status}。`])
  await saveTask(task)

  res.status(201).json({ message, lead })
})

app.patch('/api/leads/:id', requireUser, async (req, res) => {
  await seedDemoData()
  const lead = await getLeadById(req.params.id)

  if (!lead) {
    res.status(404).json({ error: 'LEAD_NOT_FOUND' })
    return
  }

  const task = await getTaskById(lead.taskId, req.user.id)
  if (!task) {
    res.status(404).json({ error: 'TASK_NOT_FOUND' })
    return
  }

  const { status, handling, nextAction, reminderAt, reminderNote } = req.body
  const prevStatus = lead.status
  const prevHandling = lead.handling
  if (status) lead.status = status
  if (handling) lead.handling = handling
  if (nextAction) lead.nextAction = nextAction
  if (reminderAt !== undefined) lead.reminderAt = reminderAt || null
  if (reminderNote !== undefined) lead.reminderNote = reminderNote || ''
  lead.lastAction = '已更新线索状态'

  const savedLead = await saveLead(lead)
  const logParts = [`已更新 ${lead.name}`]
  if (status && prevStatus !== savedLead.status) logParts.push(`状态：${prevStatus} -> ${savedLead.status}`)
  if (handling && prevHandling !== savedLead.handling) logParts.push(`处理方式：${prevHandling} -> ${savedLead.handling}`)
  if (nextAction) logParts.push(`下一步：${savedLead.nextAction}`)
  if (reminderAt) logParts.push(`提醒：${savedLead.reminderAt}`)
  if (reminderAt === null || reminderAt === '') logParts.push('提醒已清除')
  appendLogs(task, [logParts.join(' ｜ ')])
  await saveTask(task)

  res.json({ lead: savedLead })
})

app.post('/api/leads/bulk-update', requireUser, async (req, res) => {
  await seedDemoData()
  const { ids, status, handling, nextAction, reminderAt, reminderNote } = req.body

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'INVALID_BULK_PAYLOAD' })
    return
  }

  const touchedTasks = new Map()
  const updatedLeads = []

  for (const id of ids) {
    const lead = await getLeadById(id)
    if (!lead) continue

    const task = await getTaskById(lead.taskId, req.user.id)
    if (!task) continue

    const prevStatus = lead.status
    const prevHandling = lead.handling
    if (status) lead.status = status
    if (handling) lead.handling = handling
    if (nextAction) lead.nextAction = nextAction
    if (reminderAt !== undefined) lead.reminderAt = reminderAt || null
    if (reminderNote !== undefined) lead.reminderNote = reminderNote || ''
    lead.lastAction = '已批量更新线索'

    const savedLead = await saveLead(lead)
    updatedLeads.push(savedLead)

    const taskLogs = touchedTasks.get(task.id) || { task, logs: [] }
    const logParts = [`批量更新 ${lead.name}`]
    if (status && prevStatus !== savedLead.status) logParts.push(`状态：${prevStatus} -> ${savedLead.status}`)
    if (handling && prevHandling !== savedLead.handling) logParts.push(`处理方式：${prevHandling} -> ${savedLead.handling}`)
    if (reminderAt) logParts.push(`提醒：${savedLead.reminderAt}`)
    if (nextAction) logParts.push(`下一步：${savedLead.nextAction}`)
    taskLogs.logs.push(logParts.join(' ｜ '))
    touchedTasks.set(task.id, taskLogs)
  }

  for (const { task, logs } of touchedTasks.values()) {
    appendLogs(task, logs)
    await saveTask(task)
  }

  res.json({ updatedCount: updatedLeads.length, leads: updatedLeads })
})

app.use(express.static(clientDistDir))
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next()
    return
  }

  res.sendFile(path.join(clientDistDir, 'index.html'))
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({
    error: 'SERVER_ERROR',
    detail: error.message,
  })
})

app.listen(PORT, async () => {
  try {
    await seedDemoData()
    console.log(`Fangzhou workbench server running on http://localhost:${PORT}`)
    console.log(`Storage mode: ${supabaseEnabled ? 'supabase' : 'memory'}`)
  } catch (error) {
    console.error('Bootstrap failed:', error.message)
  }
})
