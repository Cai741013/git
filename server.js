const http = require('http');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '.env'));
const PORT = Number(process.env.PORT || 4173);
const PROVIDER = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const isDeepSeek = PROVIDER === 'deepseek';
const API_KEY = isDeepSeek ? (process.env.DEEPSEEK_API_KEY || '') : (process.env.OPENAI_API_KEY || '');
const MODEL = process.env.AI_MODEL || (isDeepSeek ? 'deepseek-chat' : (process.env.OPENAI_MODEL || 'gpt-5.6-terra'));
const OPENAI_URL = `${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/responses`;
const DEEPSEEK_URL = `${(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')}/chat/completions`;
const HOST = process.env.HOST || '127.0.0.1';
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const RATE_LIMIT_PER_HOUR = Math.max(1, Number(process.env.RATE_LIMIT_PER_HOUR || 20));
const requestBuckets = new Map();

const productKnowledge = `
- 飞书多维表格：轻量业务系统，支持自动化、关联数据、表单和数据看板
- 飞书审批：条件分支、多级审批和移动端操作
- 飞书项目：任务、甘特图、里程碑、依赖关系与资源分配
- 飞书知识库：权限、全文检索和版本控制
- 飞书妙记：会议录音转文字、自动提取待办和生成纪要
- 飞书智能伙伴：企业 AI 助手，支持问答、生成和数据分析
- 飞书群机器人：自动消息推送和业务系统接入
- 飞书日历：日程、资源预订和忙闲视图
- 飞书文档：实时协作、评论、提醒和嵌入多维表格`;

const proposalSchema = {
  type: 'object', additionalProperties: false,
  required: ['researchTrends','rows','assumptions','products','flow','metrics','values','risk','conclusion','ai','phases','benefit','sources'],
  properties: {
    researchTrends: { type:'array', minItems:3, maxItems:3, items:{type:'string'} },
    rows: { type:'array', minItems:1, maxItems:5, items:{ type:'array', minItems:3, maxItems:3, items:{type:'string'} } },
    assumptions: { type:'array', maxItems:3, items:{type:'string'} },
    products: { type:'array', minItems:3, maxItems:6, items:{ type:'array', minItems:2, maxItems:2, items:{type:'string'} } },
    flow: { type:'array', minItems:4, maxItems:6, items:{type:'string'} },
    metrics: { type:'array', minItems:3, maxItems:3, items:{ type:'array', minItems:2, maxItems:2, items:{type:'string'} } },
    values: { type:'array', minItems:3, maxItems:5, items:{ type:'array', minItems:4, maxItems:4, items:{type:'string'} } },
    risk: { type:'string' }, conclusion: { type:'string' }, ai: { type:'string' }, benefit: { type:'string' },
    phases: { type:'array', minItems:3, maxItems:3, items:{type:'string'} },
    sources: { type:'array', maxItems:6, items:{ type:'object', additionalProperties:false, required:['title','url'], properties:{title:{type:'string'},url:{type:'string'}} } }
  }
};

function loadEnv(file){
  if(!fs.existsSync(file)) return;
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const match=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if(match) process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
}
function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});
  res.end(Buffer.isBuffer(body) || typeof body==='string' ? body : JSON.stringify(body));
}
function clientIp(req){ return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function allowRequest(req){
  const now=Date.now(); const ip=clientIp(req); const bucket=requestBuckets.get(ip);
  if(!bucket || now-bucket.startedAt>=3_600_000){ requestBuckets.set(ip,{startedAt:now,count:1}); return true; }
  if(bucket.count>=RATE_LIMIT_PER_HOUR) return false;
  bucket.count++; return true;
}
function readBody(req){ return new Promise((resolve,reject)=>{ let raw=''; req.on('data',c=>{raw+=c;if(raw.length>1_000_000)reject(new Error('请求内容过大'));}); req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'));}catch{reject(new Error('JSON 格式错误'));}}); req.on('error',reject); }); }
function outputText(response){
  if(response.output_text) return response.output_text;
  for(const item of response.output||[]) for(const content of item.content||[]) if(content.type==='output_text' && content.text) return content.text;
  return '';
}
function extractPainFacts(text){
  const source=String(text||'').trim();
  if(!source) return [];
  let facts=source.split(/(?:^|[\s；;])\d+[.、．)]\s*/).map(x=>x.trim().replace(/[；;。]$/,'')).filter(Boolean);
  if(facts.length<=1) facts=source.split(/[；;\n]+/).map(x=>x.trim().replace(/[。]$/,'')).filter(Boolean);
  if(facts.length<=1) facts=source.split(/[，,]+/).map(x=>x.trim().replace(/[。]$/,'')).filter(x=>x.length>=4);
  return [...new Set(facts)].slice(0,5);
}
function buildPrompt(customer){
  const painFacts=extractPainFacts(customer.painPoints);
  return `角色：你是一位拥有5年企业数字化转型经验的飞书商业化售前顾问。\n\n目标：针对以下客户生成精准、可落地的飞书 AI 解决方案。\n客户名称：${customer.clientName}\n行业：${customer.industry}\n规模：${customer.scale}\n客户原始痛点：${customer.painPoints}\n已拆分的客户事实（必须按此顺序逐条诊断，不得增加）：\n${painFacts.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n${customer.feedback ? `本轮用户反馈：${customer.feedback}\n请在保留客户事实的前提下，按反馈优化方案。\n` : ''}\n飞书产品知识库：${productKnowledge}\n\n事实边界（必须严格遵守）：\n1. rows 只能包含上面的“客户事实”，数量和顺序必须完全一致；rows 第一列直接使用对应客户事实，不得新增“客户管理粗放”等客户未提及的问题。\n2. 根因是顾问诊断，不得写成已经证实的客户事实；信息不足时写“具体原因待需求访谈确认”。\n3. 可能有价值但客户未提供依据的判断，只能写入 assumptions，并明确为待确认假设；不得放入 rows、risk 或“当前状态”。没有则返回空数组。\n4. risk、conclusion 和 values 的“当前状态”只能引用客户输入；预测数字必须明确写“目标值”或“预计”，不得编造已发生数据。\n\n方案标准：\n1. 每个根因具体到岗位、数据、流程或责任机制，禁止用“信息分散、流程人工”等空话替代客户场景。\n2. 产品组合必须具体到上述飞书模块，明确如何操作、由谁使用。\n3. 数字必须基于客户输入或标注为“目标/预计”。\n4. 给出三期实施路径：1-2周试点、1个月推广、3个月智能化。\n5. 如使用网络搜索，只引用可靠来源；找不到可靠数据时明确使用合理目标值，不伪造案例。\n6. 输出简体中文，短句、专业、有咨询感。\n\n只返回一个 JSON 对象，不要输出 Markdown 代码围栏或其他文字。字段必须为：researchTrends（三条字符串）、rows（一至五个[客户事实,顾问根因诊断,影响范围]）、assumptions（零至三个待确认假设字符串）、products（三至六个[飞书产品,具体用法]）、flow（四至六步）、metrics（三个[目标值,指标名]）、values（三至五个[指标,当前状态,预期改善,量化价值]）、risk、conclusion、ai、phases（三期字符串）、benefit、sources（来源对象数组，无实时来源时返回空数组）。`;
}
async function requestOpenAI(customer,useSearch){
  const payload = {
    model: MODEL,
    input: [{role:'user',content:[{type:'input_text',text:buildPrompt(customer)}]}],
    reasoning: {effort:'medium'},
    text: {verbosity:'medium',format:{type:'json_schema',name:'feishu_solution',strict:true,schema:proposalSchema}}
  };
  if(useSearch) payload.tools=[{type:'web_search'}];
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),useSearch?45_000:75_000);
  try{
    const response=await fetch(OPENAI_URL,{method:'POST',headers:{Authorization:`Bearer ${API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    const json=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(json.error?.message || `模型请求失败（${response.status}）`);
    const text=outputText(json); if(!text) throw new Error('模型没有返回可解析的方案');
    return JSON.parse(text);
  } finally { clearTimeout(timeout); }
}
function parseJson(text){
  const clean=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const start=clean.indexOf('{'); const end=clean.lastIndexOf('}');
  const parsed=JSON.parse(start>=0 && end>start ? clean.slice(start,end+1) : clean);
  for(const key of ['researchTrends','rows','products','flow','metrics','values','phases']) if(!Array.isArray(parsed[key])) throw new Error(`模型结果缺少数组字段：${key}`);
  for(const key of ['risk','conclusion','ai','benefit']) if(typeof parsed[key]!=='string') throw new Error(`模型结果缺少文本字段：${key}`);
  if(!Array.isArray(parsed.sources)) parsed.sources=[];
  if(!Array.isArray(parsed.assumptions)) parsed.assumptions=[];
  return parsed;
}
function groundScenario(scenario,customer){
  const facts=extractPainFacts(customer.painPoints);
  const generatedRows=Array.isArray(scenario.rows)?scenario.rows:[];
  const overflow=generatedRows.slice(facts.length)
    .map(row=>Array.isArray(row)?`${row[0]}：${row[1]||'具体情况待确认'}`:'')
    .filter(Boolean);
  scenario.rows=facts.map((fact,index)=>{
    const row=Array.isArray(generatedRows[index])?generatedRows[index]:[];
    return [fact,row[1]||'具体原因待需求访谈确认',row[2]||'影响范围待确认'];
  });
  scenario.assumptions=[...(Array.isArray(scenario.assumptions)?scenario.assumptions:[]),...overflow]
    .map(x=>String(x).replace(/^待确认(?:假设)?[：:]?\s*/,''))
    .filter(Boolean).slice(0,3);
  return scenario;
}
async function requestDeepSeek(customer){
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),75_000);
  const payload={model:MODEL,messages:[{role:'system',content:'你只输出合法 JSON。所有方案必须忠于客户原始业务场景，禁止套用其他行业模板。'},{role:'user',content:buildPrompt(customer)}],response_format:{type:'json_object'},temperature:0.2};
  try{
    const response=await fetch(DEEPSEEK_URL,{method:'POST',headers:{Authorization:`Bearer ${API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    const json=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(json.error?.message || `DeepSeek 请求失败（${response.status}）`);
    return parseJson(json.choices?.[0]?.message?.content);
  } finally { clearTimeout(timeout); }
}
async function callModel(customer){
  if(isDeepSeek) return requestDeepSeek(customer);
  try { return await requestOpenAI(customer,true); }
  catch(error){
    if(/invalid.api.key|incorrect api key|401/i.test(`${error.message} ${error.cause?.message||''}`)) throw error;
    return requestOpenAI(customer,false);
  }
}
async function handleGenerate(req,res){
  if(ACCESS_CODE && req.headers['x-access-code']!==ACCESS_CODE) return send(res,401,{code:'ACCESS_REQUIRED',message:'请输入访问口令'});
  if(!allowRequest(req)) return send(res,429,{code:'RATE_LIMITED',message:'本小时生成次数已用完，请稍后再试'});
  if(!API_KEY || API_KEY.includes('your-key')) return send(res,503,{code:'CONFIG_MISSING',message:`尚未配置 ${isDeepSeek?'DEEPSEEK_API_KEY':'OPENAI_API_KEY'}`});
  try{
    const customer=await readBody(req);
    for(const key of ['clientName','industry','scale','painPoints']) if(!String(customer[key]||'').trim()) return send(res,400,{message:`缺少字段：${key}`});
    const scenario=groundScenario(await callModel(customer),customer); send(res,200,{scenario,model:MODEL,provider:PROVIDER});
  } catch(error){
    console.error(error);
    const detail=[error.message,error.cause?.message,error.cause?.code].filter(Boolean).join(' · ');
    try{
      const logDir=path.join(__dirname,'logs'); fs.mkdirSync(logDir,{recursive:true});
      fs.appendFileSync(path.join(logDir,'agent-errors.log'),`${new Date().toISOString()} ${detail}\n`,'utf8');
    }catch{}
    send(res,500,{message:error.name==='AbortError'?'生成超时，请重试':detail});
  }
}
function serveStatic(req,res){
  const requestPath=decodeURIComponent(req.url.split('?')[0]);
  const relative=requestPath==='/'?'index.html':requestPath.replace(/^\/+/, '');
  const file=path.resolve(__dirname,relative);
  if(!file.startsWith(path.resolve(__dirname)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res,404,'Not found','text/plain; charset=utf-8');
  const ext=path.extname(file); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
  fs.readFile(file,(err,data)=>err?send(res,500,'Read error','text/plain; charset=utf-8'):send(res,200,data,types[ext]||'application/octet-stream'));
}
const server=http.createServer((req,res)=>{
  if(req.method==='GET' && req.url.startsWith('/healthz')) return send(res,200,{status:'ok'});
  if(req.method==='GET' && req.url.startsWith('/api/status')) return send(res,200,{configured:Boolean(API_KEY&&!API_KEY.includes('your-key')),model:MODEL,provider:PROVIDER,protected:Boolean(ACCESS_CODE)});
  if(req.method==='POST' && req.url.startsWith('/api/generate')) return handleGenerate(req,res);
  if(req.method==='GET') return serveStatic(req,res);
  send(res,405,{message:'Method not allowed'});
});
if(require.main===module) server.listen(PORT,HOST,()=>console.log(`提案工坊已启动：http://${HOST==='0.0.0.0'?'localhost':HOST}:${PORT}`));

module.exports={extractPainFacts,groundScenario,buildPrompt};
