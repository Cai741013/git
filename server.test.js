const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPainFacts, groundScenario, buildPrompt } = require('./server');

test('splits a short customer statement into explicit facts', () => {
  assert.deepEqual(
    extractPainFacts('过于依赖熟客，想转型自媒体引流但不起色'),
    ['过于依赖熟客', '想转型自媒体引流但不起色']
  );
});

test('keeps numbered pain points in their original order', () => {
  assert.deepEqual(
    extractPainFacts('1. 策划案版本不同步；2. 项目进度靠经理手工统计；3. 外包返工率高'),
    ['策划案版本不同步', '项目进度靠经理手工统计', '外包返工率高']
  );
});

test('removes unsupported rows from the confirmed diagnosis table', () => {
  const scenario = groundScenario({
    rows: [
      ['依赖熟客', '缺少新客渠道', '新客增长'],
      ['自媒体不起色', '内容缺少复盘', '获客效率'],
      ['客户管理粗放', '没有客户档案', '客户复购'],
      ['经营依赖经验', '没有数据看板', '经营决策']
    ],
    assumptions: []
  }, { painPoints: '过于依赖熟客，想转型自媒体引流但不起色' });

  assert.equal(scenario.rows.length, 2);
  assert.deepEqual(scenario.rows.map(row => row[0]), ['过于依赖熟客', '想转型自媒体引流但不起色']);
  assert.match(scenario.assumptions.join('\n'), /客户管理粗放/);
  assert.match(scenario.assumptions.join('\n'), /经营依赖经验/);
});

test('iteration prompt includes the current proposal and requires material changes', () => {
  const prompt = buildPrompt({
    clientName: '测试客户', industry: '零售', scale: '10人', painPoints: '新客增长困难',
    feedback: '增加店长视角', version: 2,
    aiScenario: { products: [['飞书多维表格', '记录线索']] }
  });

  assert.match(prompt, /这是需要修改的当前方案/);
  assert.match(prompt, /增加店长视角/);
  assert.match(prompt, /必须直接修改与反馈相关/);
  assert.match(prompt, /飞书多维表格/);
});
