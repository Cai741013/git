const defaultPrompts = [
  { id: '01', title: '系统 Prompt', text: '你是一位资深的飞书商业化售前顾问，拥有5年企业数字化转型咨询经验。所有分析必须基于客户实际业务场景，具体到飞书产品功能模块，并量化时间、成本与效率价值。语气专业、结构化、有咨询感。' },
  { id: '02', title: '行业调研 Agent', text: '针对 {industry} 行业，输出3条有场景与数据支撑的数字化趋势、Top 5 业务痛点、2个标杆案例及政策/合规要求。痛点必须对应具体岗位或业务流程，禁止泛泛而谈。' },
  { id: '03', title: '痛点诊断 Agent', text: '基于客户行业、规模、自述痛点与行业调研，输出表面问题→根因映射、影响程度×紧迫性优先级、6个月风险和解决方向预判。' },
  { id: '04', title: '方案匹配 Agent', text: '基于诊断结果设计飞书产品组合，说明典型业务流程、方案架构、功能模块、AI 增强点与三期实施路径，具体到产品与使用角色。' },
  { id: '05', title: '文档生成 Agent', text: '将调研、诊断和方案整合为3-4页 A4 提案：客户现状、行业洞察、解决方案、量化 ROI、实施保障、下一步行动。每段不超过3行，关键数字加粗。' }
];
const products = [
  ['多维表格', '轻量业务系统搭建，自动化流程与数据看板', '▦'], ['审批', '条件分支、多级审批、移动端请假调班', '✓'], ['项目', 'OKR、甘特图、里程碑与资源分配', '◫'], ['知识库', '权限管理、全文检索与版本控制', '⌂'], ['妙记', '录音转文字，自动提取待办与会议纪要', '◌'], ['智能伙伴', '问答、内容生成与数据分析', '✦'], ['群机器人', '接入业务系统，自动推送关键消息', '♢'], ['日历', '智能日程、会议室预订与忙闲视图', '◷'], ['文档', '实时协同编辑、评论与多维表格嵌入', '▤']
];
let memories = JSON.parse(localStorage.getItem('feishu_memories') || '[]');
let promptState = JSON.parse(localStorage.getItem('feishu_prompts') || 'null') || defaultPrompts;
let currentProposal = null;
let timer;

const $ = (id) => document.getElementById(id);
const toast = (msg) => { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2200); };
const formatDate = (d = new Date()) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
function updateMemoryUI(){ $('historyCount').textContent = memories.length; $('memoryLabel').textContent = `记忆 ${memories.length} 条`; }
function toggleCustomIndustry(){ const custom=$('industry').value==='__custom__'; $('customIndustry').classList.toggle('hidden',!custom); $('customIndustry').required=custom; if(custom) $('customIndustry').focus(); }
function getIndustryValue(){ return $('industry').value==='__custom__' ? $('customIndustry').value.trim() : $('industry').value; }
function setIndustryValue(value){
  const exists=[...$('industry').options].some(option=>option.value===value);
  $('industry').value=exists?value:'__custom__';
  $('customIndustry').value=exists?'':value;
  toggleCustomIndustry();
}
async function checkAgentStatus(){
  try{ const response=await fetch('/api/status'); const status=await response.json(); $('agentStatus').textContent=status.configured?'AI 已配置':'AI 尚未配置'; $('agentDetail').textContent=status.configured?`${status.provider} · ${status.model}`:'当前使用本地兜底'; }
  catch{ $('agentStatus').textContent='本地演示模式'; $('agentDetail').textContent='请使用 Node 服务启动'; }
}

function renderProposal(data){
  const root = $('proposalResult');
  const modeLabel=data.generationMode==='ai'?'AI 实时生成':'本地规则兜底';
  root.innerHTML = `<div class="proposal-toolbar"><span class="proposal-status">● ${modeLabel} · ${formatDate()}</span><div class="proposal-actions"><button class="tool-btn" id="copyBtn">□ 复制 Markdown</button><button class="tool-btn" id="downloadBtn">↓ 导出 .md</button><button class="tool-btn" id="feishuDocBtn">▤ 写入飞书文档</button></div></div><div class="proposal-body"><div class="proposal-kicker">FEISHU AI SOLUTION / 2026</div><h2>${data.clientName} · 飞书 AI 数字化转型方案</h2><div class="proposal-meta">${data.industry}  ·  ${data.scale}  ·  售前第 ${data.version||1} 版</div><div class="proposal-tabs"><button class="proposal-tab active" data-tab="diagnosis">01 痛点诊断</button><button class="proposal-tab" data-tab="solution">02 解决方案</button><button class="proposal-tab" data-tab="value">03 预期价值</button></div><div id="proposalPanel"></div><div class="iteration-box"><label>让方案更贴近客户 · 输入反馈即可迭代</label><div class="iteration-row"><input id="feedbackInput" placeholder="例如：补充区域经理的管理视角" /><button id="iterateBtn">迭代方案 →</button></div></div></div>`;
  if(data.generationMode==='local'){
    const warning=document.createElement('div'); warning.className='generation-warning';
    const copy=document.createElement('div'); copy.innerHTML='<strong>DeepSeek 未参与本次生成</strong><span></span>';
    copy.querySelector('span').textContent=data.generationError||'模型服务暂不可用，当前内容仅为本地规则分析。';
    const retry=document.createElement('button'); retry.textContent='重试 AI'; retry.onclick=()=>runGeneration(data);
    warning.append(copy,retry); root.querySelector('.proposal-meta').after(warning);
  }
  $('copyBtn').onclick = () => { navigator.clipboard?.writeText(toMarkdown(data)); toast('Markdown 已复制'); };
  $('downloadBtn').onclick = () => downloadMarkdown(data);
  $('feishuDocBtn').onclick = () => { toast('已生成飞书文档草稿 · 接入 API 后可自动写入'); };
  root.querySelectorAll('.proposal-tab').forEach(btn => btn.onclick = () => { root.querySelectorAll('.proposal-tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); renderPanel(btn.dataset.tab, data); });
  $('iterateBtn').onclick = () => { const v = $('feedbackInput').value.trim(); if(!v) return toast('请先写下你的修改意见'); data.feedback = v; data.version = (data.version || 1) + 1; runGeneration(data); };
  renderPanel('diagnosis', data);
}
function splitPainPoints(text){
  const numbered = text.split(/(?:^|\s*)\d+[.、．]\s*/).map(x=>x.trim().replace(/[；;]$/,'')).filter(Boolean);
  return numbered.length > 1 ? numbered : text.split(/[；;\n]+/).map(x=>x.trim()).filter(Boolean);
}
function diagnosePain(point){
  const rules = [
    [/新客|客源|获客|引流|自媒体|营销|投放|曝光/, ['缺少稳定的内容获客机制、渠道来源标签和“内容—咨询—到店—成交”转化追踪，无法判断哪些动作真正带来新客', '获客增长与营销投入产出']],
    [/成交|转化|到店/, ['潜客从咨询到到店、成交的关键状态没有统一记录，也缺少跟进节奏和转化复盘', '销售转化与客户增长']],
    [/预约|撞单|等位/, ['预约入口、服务时段与人员产能没有统一管理，也缺少自动确认和冲突校验', '客户体验与门店产能']],
    [/会员|客户档案|偏好/, ['缺少跨门店统一会员档案，消费记录、服务偏好和历史项目无法授权共享', '复购与服务连续性']],
    [/排班|提成|业绩/, ['排班、服务订单与提成规则彼此割裂，月底只能依靠人工核算', '员工信任与管理成本']],
    [/库存|缺货|调货/, ['服务项目与库存扣减没有联动，缺少安全库存和跨门店调拨预警', '成交率与库存周转']],
    [/流失|召回|触达|复购/, ['没有按最近到店、消费频次和偏好建立客户标签及自动召回任务', '会员生命周期价值']],
    [/版本|文档|策划案/, ['缺少唯一版本源和变更确认机制，团队无法确认当前生效内容', '返工与交付周期']],
    [/外包|验收|返工/, ['需求、交付物和验收标准没有结构化留痕，反馈散落在即时沟通工具中', '外包质量与成本']],
    [/会议|站会|纪要|待办/, ['会议结论没有自动沉淀为责任人明确、带截止时间的可追踪任务', '执行落地']],
    [/项目|进度|延期|Excel/, ['进度数据依赖人工收集，缺少自动汇总、依赖关系和风险预警', '管理效率与延期风险']]
  ];
  const hit = rules.find(([pattern])=>pattern.test(point));
  return hit ? hit[1] : ['该事项依赖个人记录和人工转发，缺少统一数据、责任人和状态闭环', '业务效率与可控性'];
}
function getScenario(data){
  if(data.aiScenario) return data.aiScenario;
  const text = `${data.industry} ${data.painPoints}`;
  if (data.useLegacyTemplate && /美发|沙龙|头皮|发型师|染烫|理发/i.test(text)) return {
    kind: 'salon',
    rows: [
      ['微信手工登记预约，高峰期撞单，客户等位超 40 分钟', '预约入口、发型师档期与服务时长没有统一管理，缺少容量校验和自动确认', '客户体验与门店产能'],
      ['3200 名会员信息分散在纸档和前台手机', '缺少跨 5 家门店共享且有权限控制的会员主档，历史项目与药水偏好无法随客流转', '复购与服务连续性'],
      ['排班和业绩提成由店长月底手算 Excel', '排班、服务订单、业绩归属和提成规则相互割裂，没有统一计算底表', '员工信任与管理成本'],
      ['染烫产品缺货后才临时调货，客户等待 2 小时', '服务项目与库存扣减未联动，缺少安全库存、批次和跨店调拨预警', '成交率与库存周转'],
      ['客户离店后零触达，无法识别 3 个月未到店会员', '没有按最近消费时间、项目和偏好建立客户标签及自动召回流程', '客户流失与生命周期价值']
    ],
    products: [['飞书多维表格', '搭建预约、会员、业绩提成与库存四张关联业务表'], ['飞书日历', '同步发型师档期，按服务时长管理可预约时段'], ['飞书审批', '处理调班、提成调整与跨门店库存调拨'], ['飞书智能伙伴', '识别流失会员、生成召回话术和门店经营摘要'], ['飞书群机器人', '发送预约提醒、缺货预警和会员召回任务'], ['飞书知识库', '统一沉淀服务流程、染烫配方规范与会员服务标准']],
    flow: ['客户提交预约', '自动匹配发型师档期', '到店服务并更新会员档案', '库存自动扣减', 'AI 识别流失并发起召回'],
    metrics: [['40 → <10 分钟', '高峰期客户等位目标'], ['↓ 80%', '店长月底提成核算时间'], ['30/60/90 天', '会员自动召回周期']],
    values: [['预约接待', '微信手工登记、撞单频发', '统一预约表与档期冲突校验', '客户平均等位目标降至 10 分钟内'], ['提成核算', '5 家门店月底手算 Excel', '订单与提成规则自动汇总', '核算时间预计减少 80%'], ['库存管理', '缺货后临时调货约 2 小时', '安全库存与跨店调拨预警', '紧急缺货次数目标减少 70%'], ['会员运营', '3 个月未到店客户不可识别', '按标签自动生成召回名单', '3200 名会员状态 100% 可追踪']],
    risk: '若保持微信、纸档和 Excel 并行，门店扩张会进一步放大撞单、提成纠纷和库存缺货；会员资产仍留在个人手机中，持续流失却无法识别。',
    conclusion: '本质问题是预约、会员、员工绩效和库存没有围绕一次客户服务形成统一数据链路。',
    ai: '飞书智能伙伴每天识别 30/60/90 天未到店会员并生成个性化召回话术；多维表格 AI 字段汇总门店经营异常，群机器人自动通知店长。',
    phases: ['一期 1-2 周：选择 1 家门店上线预约、发型师档期与会员档案。', '二期 1 个月：覆盖 5 家门店，接入提成核算和库存预警。', '三期 3 个月：建立会员分层、自动召回与连锁经营看板。'],
    benefit: '以单店试点验证预约与会员数据闭环，再复制到 5 家门店；优先减少撞单、提成核算和紧急调货带来的直接损失。'
  };
  if (data.useLegacyTemplate && /游戏|MMORPG|手游|美术外包|研发与发行/i.test(text)) return {
    kind: 'game',
    rows: [
      ['策划案改了 5 版，程序仍按第 2 版开发', '需求没有统一版本源与变更确认机制，研发、策划、美术缺少同一条变更链路', '版本延期与返工'],
      ['项目经理每周花 2 天做 Excel 进度表', '进度数据分散在个人表格，缺少任务状态自动汇总与风险预警', '管理成本与延期风险'],
      ['美术外包返工率高达 30%', '需求、验收标准和反馈记录分散在微信群，交付物没有结构化验收清单', '外包成本与交付质量'],
      ['站会纪要和待办经常遗忘', '会议内容没有自动沉淀，责任人和截止时间未进入可追踪任务', '执行落地'],
      ['版本更新日志分散，运营与研发断层', '版本知识没有统一权限与检索入口，跨团队发布信息靠人工转发', '发行协同']
    ],
    products: [['飞书项目', '按项目、版本和里程碑管理研发任务'], ['飞书知识库', '沉淀策划案、版本日志与验收规范'], ['飞书多维表格', '管理外包需求、交付物与验收状态'], ['飞书妙记', '站会录音转纪要，自动提取待办'], ['飞书智能伙伴', '生成周报、识别延期风险与版本摘要'], ['飞书群机器人', '将状态变化和风险自动通知到协作群']],
    flow: ['策划提交需求变更', '知识库生成新版本', '项目任务同步更新', 'AI 检查延期风险', '机器人通知责任人'],
    metrics: [['↓ 2 天/周', '项目经理进度统计时间'], ['30% → 15%', '美术外包返工率目标'], ['100%', '版本信息可检索覆盖率']],
    values: [['进度统计', '每周手工制作 Excel 约 2 天', '项目数据自动汇总', '每月释放约 8 个工作日'], ['外包返工', '返工率约 30%', '结构化需求与验收清单', '返工率目标降至 15%'], ['版本协作', '日志分散在多个文档', '知识库统一版本入口', '运营获取信息从 T+1 到实时']],
    risk: '若继续依赖微信群和个人 Excel，版本返工与延期会在项目后期集中暴露，外包成本可能继续上升，运营无法及时准备版本发布。',
    conclusion: '本质问题是研发需求、项目进度、外包验收与版本知识没有形成一条可追踪的协作链路。',
    ai: '飞书智能伙伴自动生成项目周报与版本摘要；妙记提取站会待办；多维表格 AI 字段识别延期风险、需求冲突和验收缺项。',
    phases: ['一期 1-2 周：建立统一需求与项目台账，选择 1 个在研项目试点。', '二期 1 个月：覆盖 3 个项目，接入外包需求、验收与知识库。', '三期 3 个月：接入版本发布数据，建立研发与运营协同看板。'],
    benefit: '先以一个项目试点验证价值，再复制到全部在研项目，减少手工汇总、需求追问和外包返工带来的隐性成本。'
  };
  const points = splitPainPoints(data.painPoints).slice(0,5);
  const rows = points.map(point=>[point, ...diagnosePain(point)]);
  const suggested = [['飞书多维表格', '把客户描述的业务事项转为统一数据台账和实时看板']];
  if(/项目|进度|任务|延期/.test(text)) suggested.push(['飞书项目', '管理任务、里程碑、依赖关系与风险']);
  if(/文档|知识|版本|资料/.test(text)) suggested.push(['飞书知识库', '统一文档版本、权限和检索入口']);
  if(/会议|纪要|站会/.test(text)) suggested.push(['飞书妙记', '自动生成纪要并提取待办']);
  if(/审批|排班|调班|提成|调货/.test(text)) suggested.push(['飞书审批', '将关键确认与例外处理标准化']);
  if(/预约|日程|档期/.test(text)) suggested.push(['飞书日历', '统一人员档期和业务日程']);
  const isMarketing=/新客|客源|获客|引流|自媒体|营销|投放|曝光|成交|转化/.test(text);
  if(isMarketing) suggested.push(['飞书文档', '建立选题库、内容日历和可复用的营销素材模板']);
  suggested.push(['飞书智能伙伴', '分析异常、生成摘要和行动建议'], ['飞书群机器人', '自动通知状态变化与责任人']);
  const flow=isMarketing?['沉淀目标客群与选题','智能伙伴生成内容草稿','记录发布渠道和线索来源','多维表格跟踪咨询到店','每周复盘新客转化']:['一线人员提交业务记录','多维表格关联客户与事项','规则自动流转','AI 分析异常','机器人触达责任人'];
  const metrics=isMarketing?[[`每周 3-5 条`,'稳定内容发布目标'],['100%','新客来源可追踪'],['逐周提升','咨询到店转化率']]:[['↓ 60%','手工汇总与重复沟通'],['实时','关键状态可见性'],['100%','业务记录可追溯']];
  return {
    kind: 'adaptive', rows,
    products: suggested.slice(0,6),
    flow, metrics, values: rows.slice(0,3).map((r,i)=>[r[2], r[0], isMarketing?'建立内容、渠道与新客转化台账':i===0?'统一入口与实时看板':'自动流转与责任人提醒', isMarketing?'形成可持续复盘的获客闭环':i===0?'减少重复录入和沟通':'降低遗漏与返工']), risk: `若继续沿用当前方式，“${points.slice(0,2).join('”“')}”等问题会随业务规模扩大而放大，人工协调成本和服务风险持续增加。`, conclusion: `客户当前的 ${rows.map(r=>r[2]).slice(0,3).join('、')} 问题，需要通过统一数据、流程自动化与智能提醒共同解决。`,
    ai: isMarketing?'飞书智能伙伴根据目标客群生成选题、标题和内容初稿；多维表格汇总不同渠道的新客数量与到店转化，辅助每周调整内容方向。':'飞书智能伙伴基于统一业务数据生成每日摘要、识别异常并给出行动建议；群机器人将风险自动推送给对应责任人。',
    phases: ['一期 1-2 周：选择一个高频核心流程试点，建立统一数据台账。', '二期 1 个月：扩展到相关团队，接入审批、通知和知识沉淀。', '三期 3 个月：建立经营看板与 AI 分析，持续优化规则。'],
    benefit: isMarketing?'先建立“内容发布—线索来源—到店成交”的最小闭环，用连续 4 周数据识别有效渠道，再逐步放大新客增长。':'以最影响客户体验或交付效率的流程切入，先验证量化价值，再逐步扩展到其他业务环节。'
  };
}
function renderPanel(tab, data){
  const panel = $('proposalPanel'); const s = getScenario(data);
  if(tab === 'diagnosis') panel.innerHTML = `${data.version>1&&s.revisionSummary?`<div class="proposal-section-title">本轮迭代结果</div><p class="proposal-lead"><strong>修改意见：</strong>${data.feedback}<br /><strong>实际调整：</strong>${s.revisionSummary}</p>`:''}<div class="proposal-section-title">客户事实 → 顾问诊断</div><table class="diagnosis-table"><thead><tr><th>客户明确描述</th><th>根因诊断</th><th>影响范围</th></tr></thead><tbody>${s.rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td><span class="pill mid">${r[2]}</span></td></tr>`).join('')}</tbody></table>${s.assumptions?.length?`<div class="proposal-section-title">待确认假设</div><p class="proposal-lead">${s.assumptions.map(x=>`• ${x}`).join('<br />')}</p>`:''}<div class="proposal-section-title">6 个月风险预判</div><p class="proposal-lead">${s.risk}</p><div class="proposal-section-title">诊断结论</div><p class="proposal-lead">${s.conclusion}</p>`;
  if(tab === 'solution') panel.innerHTML = `<div class="proposal-section-title">核心产品组合</div><div class="product-stack">${s.products.slice(0,6).map(p=>`<div class="product-card"><b>${p[0]}</b><span>${p[1]}</span></div>`).join('')}</div><div class="proposal-section-title">典型业务流程</div><div class="arch-flow">${s.flow.map((x,i)=>`${i?'<i class="arch-arrow">→</i>':''}<span class="arch-node">${x}</span>`).join('')}</div><p class="proposal-lead">AI 增强：${s.ai}</p><div class="proposal-section-title">三期实施路径</div><p class="proposal-lead">${s.phases.map((p,i)=>`<strong>${['一期','二期','三期'][i]}</strong>：${p.replace(/^.*?：/,'')}`).join('<br />')}</p>`;
  if(tab === 'value') panel.innerHTML = `<div class="proposal-section-title">量化价值预估</div><div class="value-highlight">${s.metrics.map(m=>`<div class="metric"><strong>${m[0]}</strong><span>${m[1]}</span></div>`).join('')}</div><table class="value-table"><thead><tr><th>指标</th><th>当前状态</th><th>预期改善</th><th>量化价值</th></tr></thead><tbody>${s.values.map(v=>`<tr><td>${v[0]}</td><td>${v[1]}</td><td>${v[2]}</td><td>${v[3]}</td></tr>`).join('')}</tbody></table><div class="proposal-section-title">方案收益</div><p class="proposal-lead">${s.benefit}</p>`;
}
function toMarkdown(d){ const s=getScenario(d); const trends=s.researchTrends?.length?s.researchTrends:[`${d.industry} 正在从分散记录转向统一业务数据与实时协同。`,'流程自动化与 AI 分析可以减少人工汇总并提前识别异常。','应从高频核心流程试点，再逐步扩展到完整业务链路。']; return `# ${d.clientName} 飞书 AI 数字化转型方案\n\n## 一、客户现状与痛点\n- 行业：${d.industry}\n- 规模：${d.scale}\n- 痛点：${d.painPoints}\n\n### 痛点诊断\n|客户明确描述|根因诊断|影响范围|\n|---|---|---|\n${s.rows.map(r=>`|${r.join('|')}|`).join('\n')}${s.assumptions?.length?`\n\n### 待确认假设\n${s.assumptions.map(x=>`- ${x}`).join('\n')}`:''}\n\n## 二、行业洞察\n${trends.map(x=>`- ${x}`).join('\n')}\n\n## 三、解决方案设计\n${s.products.map(p=>`- ${p[0]}：${p[1]}`).join('\n')}\n\n业务流程：${s.flow.join(' → ')}\n\nAI 增强：${s.ai}\n\n## 四、预期价值与 ROI\n|指标|当前状态|预期改善|量化价值|\n|---|---|---|---|\n${s.values.map(v=>`|${v.join('|')}|`).join('\n')}\n\n## 五、实施保障\n${s.phases.map(x=>`- ${x}`).join('\n')}\n\n## 六、下一步行动\n本周完成需求确认会，下周输出详细蓝图与试点项目清单。`; }
function downloadMarkdown(d){ const blob = new Blob([toMarkdown(d)],{type:'text/markdown;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${d.clientName}-飞书AI方案.md`; a.click(); URL.revokeObjectURL(a.href); toast('方案已导出'); }
function saveMemory(data){ const i=memories.findIndex(x=>x.clientName===data.clientName); if(i>=0) memories[i]=data; else memories.unshift(data); memories=memories.slice(0,20); localStorage.setItem('feishu_memories',JSON.stringify(memories)); updateMemoryUI(); }
function updateGenerationStep(steps,index){ const [key,title,pct]=steps[Math.min(index,steps.length-1)]; $('loadingTitle').textContent=title; $('progressBar').style.width=pct+'%'; document.querySelectorAll('.load-step').forEach(el=>{const pos=steps.findIndex(s=>s[0]===el.dataset.step); el.classList.toggle('active',pos===index); el.querySelector('i').textContent=pos<index?'已完成':pos===index?'进行中':'等待中';}); }
async function runGeneration(data){
  $('resultEmpty').classList.add('hidden'); $('proposalResult').classList.add('hidden'); $('resultLoading').classList.remove('hidden');
  const steps=[['research','正在调研行业趋势与业务场景',18],['diagnosis','正在逐条拆解业务根因',42],['matching','正在组合飞书产品能力',68],['document','正在整理结构化提案文档',88]];
  let step=0; updateGenerationStep(steps,step); clearInterval(timer); timer=setInterval(()=>{if(step<steps.length-1){step++;updateGenerationStep(steps,step);}},1800);
  try{
    let accessCode=sessionStorage.getItem('proposal_access_code')||'';
    let response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','X-Access-Code':accessCode},body:JSON.stringify(data)});
    let result=await response.json();
    if(response.status===401 && result.code==='ACCESS_REQUIRED'){
      accessCode=window.prompt('请输入提案工坊访问口令')||'';
      if(!accessCode) throw new Error('未输入访问口令');
      sessionStorage.setItem('proposal_access_code',accessCode);
      response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','X-Access-Code':accessCode},body:JSON.stringify(data)});
      result=await response.json();
      if(response.status===401) sessionStorage.removeItem('proposal_access_code');
    }
    if(!response.ok) throw Object.assign(new Error(result.message||'AI 生成失败'),{code:result.code});
    data.aiScenario=result.scenario; data.generationMode='ai'; data.model=result.model;
  } catch(error){
    data.aiScenario=null; data.generationMode='local'; data.generationError=error.message;
    toast(error.code==='CONFIG_MISSING'?'未配置 API 密钥，当前使用本地规则兜底':`AI 暂不可用，已使用本地兜底：${error.message}`);
  } finally {
    clearInterval(timer); $('progressBar').style.width='100%'; document.querySelectorAll('.load-step').forEach(el=>{el.classList.remove('active');el.querySelector('i').textContent='已完成';});
    setTimeout(()=>{ $('resultLoading').classList.add('hidden'); $('proposalResult').classList.remove('hidden'); currentProposal=data; saveMemory(data); renderProposal(data); $('crumbTitle').textContent=data.clientName; if(data.generationMode==='ai')toast('AI 方案已生成，可继续迭代'); },350);
  }
}

function renderHistory(){
  const el=$('historyList');
  if(!memories.length){el.innerHTML='<div class="result-empty" style="min-height:300px"><h3>还没有提案记忆</h3><p>生成第一份方案后，客户上下文会自动保存在这里。</p></div>';return;}
  el.innerHTML=memories.map((m,i)=>`<div class="history-card"><div><h3>${m.clientName} · ${m.industry}</h3><p>${m.scale}　${m.painPoints.slice(0,65)}${m.painPoints.length>65?'…':''}</p></div><div><span class="history-date">${m.savedAt || '刚刚保存'}</span><button class="tool-btn open-memory" data-index="${i}">打开</button></div></div>`).join('');
  el.querySelectorAll('.open-memory').forEach(btn=>btn.onclick=()=>{ const m=memories[btn.dataset.index]; $('clientName').value=m.clientName; setIndustryValue(m.industry); $('scale').value=m.scale; $('painPoints').value=m.painPoints; showView('workspace'); renderProposal(m); $('resultEmpty').classList.add('hidden'); $('proposalResult').classList.remove('hidden'); $('resultLoading').classList.add('hidden'); $('crumbTitle').textContent=m.clientName; });
}
function renderPrompts(){ $('promptGrid').innerHTML=promptState.map(p=>`<article class="prompt-card"><header><b>${p.id}</b><strong>${p.title}</strong></header><textarea data-prompt="${p.id}">${p.text}</textarea><button class="save-prompt" data-save="${p.id}">保存修改</button></article>`).join(''); $('promptGrid').querySelectorAll('.save-prompt').forEach(btn=>btn.onclick=()=>{ const id=btn.dataset.save; const area=$(`promptGrid`).querySelector(`textarea[data-prompt="${id}"]`); promptState.find(p=>p.id===id).text=area.value; localStorage.setItem('feishu_prompts',JSON.stringify(promptState)); toast('Prompt 已保存'); }); }
function renderProducts(){ $('productGrid').innerHTML=products.map(p=>`<article class="library-card"><div class="lib-icon">${p[2]}</div><h3>飞书${p[0]}</h3><p>${p[1]}</p></article>`).join(''); }
function showView(view){ document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); $(`${view}View`).classList.remove('hidden'); document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view)); if(view==='history')renderHistory(); if(view==='prompts')renderPrompts(); if(view==='products')renderProducts(); }

document.querySelectorAll('.nav-item').forEach(btn=>btn.onclick=()=>showView(btn.dataset.view));
$('newProposalBtn').onclick=()=>{showView('workspace'); $('clientForm').reset(); $('customIndustry').value=''; toggleCustomIndustry(); $('resultEmpty').classList.remove('hidden'); $('proposalResult').classList.add('hidden'); $('resultLoading').classList.add('hidden'); $('crumbTitle').textContent='新建提案';};
$('industry').onchange=toggleCustomIndustry;
document.querySelectorAll('.tag').forEach(btn=>btn.onclick=()=>{$('painPoints').value=btn.dataset.pain;});
$('clientForm').onsubmit=(e)=>{e.preventDefault(); const data={clientName:$('clientName').value.trim(),industry:getIndustryValue(),scale:$('scale').value.trim(),painPoints:$('painPoints').value.trim(),savedAt:formatDate(),version:1}; if(!data.clientName||!data.industry||!data.scale||!data.painPoints)return toast('请补全客户画像'); runGeneration(data);};
$('clearHistoryBtn').onclick=()=>{if(!memories.length)return; memories=[]; localStorage.removeItem('feishu_memories'); updateMemoryUI(); renderHistory(); toast('记忆已清空');};
$('resetPromptsBtn').onclick=()=>{promptState=defaultPrompts.map(p=>({...p})); localStorage.removeItem('feishu_prompts'); renderPrompts(); toast('Prompt 已恢复默认');};
updateMemoryUI(); renderProducts(); checkAgentStatus();
