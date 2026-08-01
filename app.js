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

function renderProposal(data){
  const root = $('proposalResult');
  root.innerHTML = `<div class="proposal-toolbar"><span class="proposal-status">● 已完成 · 生成于 ${formatDate()}</span><div class="proposal-actions"><button class="tool-btn" id="copyBtn">□ 复制 Markdown</button><button class="tool-btn" id="downloadBtn">↓ 导出 .md</button><button class="tool-btn" id="feishuDocBtn">▤ 写入飞书文档</button></div></div><div class="proposal-body"><div class="proposal-kicker">FEISHU AI SOLUTION / 2026</div><h2>${data.clientName} · 飞书 AI 数字化转型方案</h2><div class="proposal-meta">${data.industry}  ·  ${data.scale}  ·  售前初版</div><div class="proposal-tabs"><button class="proposal-tab active" data-tab="diagnosis">01 痛点诊断</button><button class="proposal-tab" data-tab="solution">02 解决方案</button><button class="proposal-tab" data-tab="value">03 预期价值</button></div><div id="proposalPanel"></div><div class="iteration-box"><label>让方案更贴近客户 · 输入反馈即可迭代</label><div class="iteration-row"><input id="feedbackInput" placeholder="例如：补充区域经理的管理视角" /><button id="iterateBtn">迭代方案 →</button></div></div></div>`;
  $('copyBtn').onclick = () => { navigator.clipboard?.writeText(toMarkdown(data)); toast('Markdown 已复制'); };
  $('downloadBtn').onclick = () => downloadMarkdown(data);
  $('feishuDocBtn').onclick = () => { toast('已生成飞书文档草稿 · 接入 API 后可自动写入'); };
  root.querySelectorAll('.proposal-tab').forEach(btn => btn.onclick = () => { root.querySelectorAll('.proposal-tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); renderPanel(btn.dataset.tab, data); });
  $('iterateBtn').onclick = () => { const v = $('feedbackInput').value.trim(); if(!v) return toast('请先写下你的修改意见'); data.feedback = v; data.version = (data.version || 1) + 1; saveMemory(data); renderPanel('solution', data); $('feedbackInput').value=''; toast('已根据反馈更新方案'); };
  renderPanel('diagnosis', data);
}
function getScenario(data){
  const text = `${data.industry} ${data.painPoints}`;
  if (/游戏|MMORPG|手游|美术外包|研发与发行/i.test(text)) return {
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
    conclusion: '本质问题是研发需求、项目进度、外包验收与版本知识没有形成一条可追踪的协作链路。'
  };
  return {
    kind: 'generic', rows: [['信息分散', '缺少统一业务数据入口与责任人机制', '协作效率'], ['流程依赖人工', '状态更新、审批或汇总没有自动化', '管理成本'], ['风险发现滞后', '缺少实时看板、提醒与异常预警', '交付风险']],
    products: [['飞书多维表格', '统一业务数据与状态看板'], ['飞书审批', '将关键流程标准化、自动流转'], ['飞书知识库', '沉淀制度、文档与历史经验'], ['飞书智能伙伴', '生成分析、摘要与行动建议'], ['飞书群机器人', '自动通知关键变化']],
    flow: ['业务人员提交信息', '多维表格统一记录', '审批按规则流转', '智能伙伴分析异常', '机器人触达责任人'], metrics: [['↓ 60%', '重复沟通时间'], ['实时', '关键状态可见性'], ['100%', '流程记录可追溯']], values: [['信息同步', '人工转发、状态滞后', '统一看板实时更新', '每月节省沟通时间'], ['流程执行', '依赖个人经验', '审批与提醒自动化', '减少遗漏与返工'], ['管理决策', '周报汇总后才发现问题', '实时数据与 AI 分析', '提前识别风险']], risk: '若继续依赖人工汇总与分散沟通，问题会在交付后期集中暴露，管理成本和返工成本持续增加。', conclusion: '本质问题是信息没有进入统一、可追踪、可自动提醒的业务流程。'
  };
}
function renderPanel(tab, data){
  const panel = $('proposalPanel'); const s = getScenario(data);
  if(tab === 'diagnosis') panel.innerHTML = `<div class="proposal-section-title">表面问题 → 根因映射</div><table class="diagnosis-table"><thead><tr><th>客户描述</th><th>根因分析</th><th>影响范围</th></tr></thead><tbody>${s.rows.map((r,i)=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td><span class="pill ${i<2?'high':'mid'}">${i<2?'高影响':'重点关注'}</span></td></tr>`).join('')}</tbody></table><div class="proposal-section-title">6 个月风险预判</div><p class="proposal-lead">${s.risk}</p><div class="proposal-section-title">诊断结论</div><p class="proposal-lead">${s.conclusion}</p>`;
  if(tab === 'solution') panel.innerHTML = `<div class="proposal-section-title">核心产品组合</div><div class="product-stack">${s.products.slice(0,6).map(p=>`<div class="product-card"><b>${p[0]}</b><span>${p[1]}</span></div>`).join('')}</div><div class="proposal-section-title">典型业务流程</div><div class="arch-flow">${s.flow.map((x,i)=>`${i?'<i class="arch-arrow">→</i>':''}<span class="arch-node">${x}</span>`).join('')}</div><p class="proposal-lead">AI 增强：飞书智能伙伴自动生成项目周报与版本摘要；妙记提取站会待办；多维表格 AI 字段识别延期风险、需求冲突和验收缺项。</p><div class="proposal-section-title">三期实施路径</div><p class="proposal-lead"><strong>一期 1-2 周</strong>：建立统一需求/项目台账，选择 1 个在研项目试点。<br /><strong>二期 1 个月</strong>：覆盖 3 个项目，接入外包需求、验收与知识库。<br /><strong>三期 3 个月</strong>：接入版本发布数据，建立研发与运营协同看板。</p>`;
  if(tab === 'value') panel.innerHTML = `<div class="proposal-section-title">量化价值预估</div><div class="value-highlight">${s.metrics.map(m=>`<div class="metric"><strong>${m[0]}</strong><span>${m[1]}</span></div>`).join('')}</div><table class="value-table"><thead><tr><th>指标</th><th>当前状态</th><th>预期改善</th><th>量化价值</th></tr></thead><tbody>${s.values.map(v=>`<tr><td>${v[0]}</td><td>${v[1]}</td><td>${v[2]}</td><td>${v[3]}</td></tr>`).join('')}</tbody></table><div class="proposal-section-title">方案收益</div><p class="proposal-lead">先以一个项目试点验证价值，再复制到全部在研项目；预计首期即可减少手工汇总、需求追问和外包返工带来的隐性成本。</p>`;
}
function toMarkdown(d){ const s=getScenario(d); return `# ${d.clientName} 飞书 AI 数字化转型方案\n\n## 一、客户现状与痛点\n- 行业：${d.industry}\n- 规模：${d.scale}\n- 痛点：${d.painPoints}\n\n## 二、行业洞察\n- ${d.industry} 的核心协作挑战是信息分散、版本不可追踪和风险发现滞后。\n- 统一知识、项目与自动化通知，能够把跨团队协作从“人找信息”变成“信息找人”。\n\n## 三、解决方案设计\n${s.products.map(p=>`- ${p[0]}：${p[1]}`).join('\n')}\n\n业务流程：${s.flow.join(' → ')}\n\n## 四、预期价值与 ROI\n|指标|当前状态|预期改善|量化价值|\n|---|---|---|---|\n${s.values.map(v=>`|${v.join('|')}|`).join('\n')}\n\n## 五、实施保障\n- 一期 1-2 周试点，二期 1 个月覆盖核心团队，三期 3 个月完成数据看板与智能分析。\n\n## 六、下一步行动\n本周完成需求确认会，下周输出详细蓝图与试点项目清单。`; }
function downloadMarkdown(d){ const blob = new Blob([toMarkdown(d)],{type:'text/markdown;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${d.clientName}-飞书AI方案.md`; a.click(); URL.revokeObjectURL(a.href); toast('方案已导出'); }
function saveMemory(data){ const i=memories.findIndex(x=>x.clientName===data.clientName); if(i>=0) memories[i]=data; else memories.unshift(data); memories=memories.slice(0,20); localStorage.setItem('feishu_memories',JSON.stringify(memories)); updateMemoryUI(); }
function runGeneration(data){ $('resultEmpty').classList.add('hidden'); $('proposalResult').classList.add('hidden'); $('resultLoading').classList.remove('hidden'); let step=0; const steps=[['research','正在检索行业趋势与案例',24],['diagnosis','正在拆解业务根因',46],['matching','正在组合飞书产品能力',72],['document','正在整理 3 页提案文档',100]]; clearInterval(timer); timer=setInterval(()=>{ if(step>=steps.length){ clearInterval(timer); setTimeout(()=>{ $('resultLoading').classList.add('hidden'); $('proposalResult').classList.remove('hidden'); currentProposal=data; saveMemory(data); renderProposal(data); $('crumbTitle').textContent=data.clientName; toast('方案已生成，可继续迭代'); },450); return; } const [key,title,pct]=steps[step]; $('loadingTitle').textContent=title; $('progressBar').style.width=pct+'%'; document.querySelectorAll('.load-step').forEach(el=>{const active=el.dataset.step===key; const done=steps.findIndex(s=>s[0]===el.dataset.step)<step; el.classList.toggle('active',active); el.querySelector('i').textContent=done?'已完成':active?'进行中':'等待中';}); step++; },850); }

function renderHistory(){ const el=$('historyList'); if(!memories.length){el.innerHTML='<div class="result-empty" style="min-height:300px"><h3>还没有提案记忆</h3><p>生成第一份方案后，客户上下文会自动保存在这里。</p></div>';return;} el.innerHTML=memories.map((m,i)=>`<div class="history-card"><div><h3>${m.clientName} · ${m.industry}</h3><p>${m.scale}　${m.painPoints.slice(0,65)}${m.painPoints.length>65?'…':''}</p></div><div><span class="history-date">${m.savedAt || '刚刚保存'}</span><button class="tool-btn open-memory" data-index="${i}">打开</button></div></div>`).join(''); el.querySelectorAll('.open-memory').forEach(btn=>btn.onclick=()=>{ const m=memories[btn.dataset.index]; $('clientName').value=m.clientName; $('industry').value=m.industry; $('scale').value=m.scale; $('painPoints').value=m.painPoints; showView('workspace'); renderProposal(m); $('resultEmpty').classList.add('hidden'); $('proposalResult').classList.remove('hidden'); $('resultLoading').classList.add('hidden'); $('crumbTitle').textContent=m.clientName; }); }
function renderPrompts(){ $('promptGrid').innerHTML=promptState.map(p=>`<article class="prompt-card"><header><b>${p.id}</b><strong>${p.title}</strong></header><textarea data-prompt="${p.id}">${p.text}</textarea><button class="save-prompt" data-save="${p.id}">保存修改</button></article>`).join(''); $('promptGrid').querySelectorAll('.save-prompt').forEach(btn=>btn.onclick=()=>{ const id=btn.dataset.save; const area=$(`promptGrid`).querySelector(`textarea[data-prompt="${id}"]`); promptState.find(p=>p.id===id).text=area.value; localStorage.setItem('feishu_prompts',JSON.stringify(promptState)); toast('Prompt 已保存'); }); }
function renderProducts(){ $('productGrid').innerHTML=products.map(p=>`<article class="library-card"><div class="lib-icon">${p[2]}</div><h3>飞书${p[0]}</h3><p>${p[1]}</p></article>`).join(''); }
function showView(view){ document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); $(`${view}View`).classList.remove('hidden'); document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view)); if(view==='history')renderHistory(); if(view==='prompts')renderPrompts(); if(view==='products')renderProducts(); }

document.querySelectorAll('.nav-item').forEach(btn=>btn.onclick=()=>showView(btn.dataset.view));
$('newProposalBtn').onclick=()=>{showView('workspace'); $('resultEmpty').classList.remove('hidden'); $('proposalResult').classList.add('hidden'); $('resultLoading').classList.add('hidden'); $('crumbTitle').textContent='新建提案';};
document.querySelectorAll('.tag').forEach(btn=>btn.onclick=()=>{$('painPoints').value=btn.dataset.pain;});
$('clientForm').onsubmit=(e)=>{e.preventDefault(); const data={clientName:$('clientName').value.trim(),industry:$('industry').value,scale:$('scale').value.trim(),painPoints:$('painPoints').value.trim(),savedAt:formatDate(),version:1}; if(!data.clientName||!data.scale||!data.painPoints)return toast('请补全客户画像'); runGeneration(data);};
$('clearHistoryBtn').onclick=()=>{if(!memories.length)return; memories=[]; localStorage.removeItem('feishu_memories'); updateMemoryUI(); renderHistory(); toast('记忆已清空');};
$('resetPromptsBtn').onclick=()=>{promptState=defaultPrompts.map(p=>({...p})); localStorage.removeItem('feishu_prompts'); renderPrompts(); toast('Prompt 已恢复默认');};
updateMemoryUI(); renderProducts();
