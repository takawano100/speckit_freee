const assert = require('node:assert/strict');
const {
  FEATURE_CATALOG,
  VIEW_DEFINITIONS,
  createInitialState,
  normalizeState,
  getFeatureCompleteness,
  getOpenIssues,
  getViewHealth,
  findNextQuestion,
  buildMarkdown,
  createRequirementPr,
  savePrSnapshot,
  restorePrVersion,
  mergeRequirementPr,
  closeRequirementPr,
  reopenRequirementPr,
  diffFeatureSets,
  isViewChanged,
  countFeatureChanges,
  getViewChanges,
  resetViewToBaseline,
  resetFeatureToBaseline,
  addBreakdownNode,
  removeBreakdownNode,
  setBreakdownText,
  setBreakdownLink,
  flattenNodes,
  listLinkTargets,
  PURPOSE_AXES,
  PURPOSE_SLOTS,
  PURPOSE_TARGETS,
  normalizePurpose,
  BREAKDOWN_MAX_DEPTH,
  baselineBreakdownOf,
  isBaselineNodeText,
  getPurposeProgress,
  findNextPurposeSlot,
  choosePurposeOption,
  setPurposeTarget,
  purposeAnswerText,
} = require('./app.js');

const state = createInitialState();

assert.equal(VIEW_DEFINITIONS.length, 4, '4視点であること');
assert.deepEqual(VIEW_DEFINITIONS.map((view) => view.label), ['目標', '人間', 'システム', 'データ']);
assert.equal(Object.keys(state.features).length, FEATURE_CATALOG.length, '全機能に状態があること');
assert.equal(state.project.apiPolicy, 'GET_ONLY', 'freeeはGET限定であること');

/* 出発点は「freeeが今実現していること」。4視点すべてが埋まっている */
for (const feature of FEATURE_CATALOG) {
  const featureState = state.features[feature.id];
  for (const view of VIEW_DEFINITIONS) {
    assert.equal(typeof featureState.views[view.id], 'string', `${feature.id}に${view.id}視点があること`);
    assert.ok(featureState.views[view.id].trim(), `${feature.id}の${view.id}がfreee基準で埋まっていること`);
    assert.equal(featureState.views[view.id], feature.baseline[view.id], 'freee基準のコピーから始まること');
    assert.equal(isViewChanged(state, feature.id, view.id), false, '初期状態では変更なしであること');
    assert.ok(Array.isArray(featureState.breakdown[view.id]), '分解木を持つこと');
  }
  assert.equal(featureState.confirmed, false, '初期状態では人間の確定がないこと');
  assert.equal(countFeatureChanges(state, feature.id), 0);
  assert.ok(getFeatureCompleteness(featureState) >= 0 && getFeatureCompleteness(featureState) <= 100);
}

/* STEP 0 — 目的文の5W1H分解（書かせず、選ばせる） */
assert.equal(state.purpose.statement, '前日の労務費を、翌朝までに見えるようにする');
assert.equal(Object.keys(state.purpose.slots).length, PURPOSE_SLOTS.length, '全スロットに状態があること');
for (const slot of PURPOSE_SLOTS) {
  assert.ok(PURPOSE_AXES.some((axis) => axis.id === slot.axis), `${slot.id}が5W1Hのどれかに属すること`);
  assert.ok(VIEW_DEFINITIONS.some((view) => view.id === slot.viewId), `${slot.id}がどの視点へ渡すか決まっていること`);
  assert.ok(slot.choices.length >= 3, `${slot.id}に選択肢が用意されていること`);
  for (const choice of slot.choices) assert.ok(choice.note, `${slot.id}/${choice.id}に「選ぶと何が起きるか」があること`);
  assert.ok(slot.targets.length, `${slot.id}にfreee側の対象が結び付いていること`);
  for (const targetId of slot.targets) {
    assert.ok(PURPOSE_TARGETS.some((target) => target.id === targetId), `${slot.id}の対象${targetId}が実在すること`);
  }
}
for (const target of PURPOSE_TARGETS) {
  if (!target.featureId) continue;
  assert.ok(FEATURE_CATALOG.some((feature) => feature.id === target.featureId), `${target.id}がカタログの機能に対応すること`);
}
assert.deepEqual(
  PURPOSE_SLOTS.filter((slot) => slot.axis === 'why').map((slot) => slot.id),
  ['why-purpose', 'why-decision', 'why-action'],
  '何のために・見て決めること・そのあとの行動を先に置くこと',
);

assert.equal(getPurposeProgress(state).open, PURPOSE_SLOTS.length, '最初はすべて未選択であること');
assert.equal(findNextPurposeSlot(state).id, 'why-purpose', '最初に聞くのは「何のために」であること');
assert.equal(state.purpose.slots['when-day'].targetId, 'work-records', '対象が1つしかない問いは最初から選ばれていること');

assert.equal(choosePurposeOption(state, 'why-purpose', 'find-red'), true);
assert.equal(state.purpose.slots['why-purpose'].status, 'assumed', '選んだ時点で仮決定になること');
assert.equal(purposeAnswerText(state, 'why-purpose'), '赤字になりかけた案件を、早く見つける');
assert.equal(findNextPurposeSlot(state).id, 'why-decision', '選んだら次の問いへ進むこと');
assert.equal(getPurposeProgress(state).open, PURPOSE_SLOTS.length - 1);
assert.equal(choosePurposeOption(state, 'why-purpose', 'bogus'), false, '無い選択肢は受け付けないこと');
assert.equal(choosePurposeOption(state, 'why-purpose', 'find-red'), true);
assert.equal(state.purpose.slots['why-purpose'].choiceId, '', '同じものを押したら選択を外せること');
assert.equal(state.purpose.slots['why-purpose'].status, 'open', '外したら未選択へ戻ること');
choosePurposeOption(state, 'why-purpose', 'find-red');
state.purpose.slots['why-purpose'].note = '月末を待たない';
assert.equal(purposeAnswerText(state, 'why-purpose'), '赤字になりかけた案件を、早く見つける（月末を待たない）', '補足を添えられること');
state.purpose.slots['why-purpose'].status = 'decided';
assert.equal(getPurposeProgress(state).decided, 1);

assert.equal(setPurposeTarget(state, 'who-subject', 'work-records'), true);
assert.equal(setPurposeTarget(state, 'who-subject', 'books'), false, '関係のない対象は選べないこと');

const purposeRoundTrip = normalizePurpose(JSON.parse(JSON.stringify(state.purpose)));
assert.equal(purposeRoundTrip.slots['why-purpose'].choiceId, 'find-red', '選んだ答えを復元すること');
assert.equal(purposeRoundTrip.slots['why-purpose'].status, 'decided');
const brokenPurpose = normalizePurpose({ slots: { 'why-purpose': { choiceId: 'bogus', targetId: 'bogus', status: 'bogus', note: 7 } } });
assert.equal(brokenPurpose.slots['why-purpose'].choiceId, '', '壊れた保存値を初期値へ戻すこと');
assert.equal(brokenPurpose.slots['why-purpose'].status, 'open');

const health = getViewHealth(state);
for (const view of VIEW_DEFINITIONS) {
  assert.equal(health[view.id].total, FEATURE_CATALOG.length);
  assert.equal(health[view.id].filled, FEATURE_CATALOG.length, '全機能の全視点がfreee基準で埋まっていること');
  assert.equal(getViewChanges(state)[view.id].changed, 0, '変更はまだ0件であること');
}

const openBefore = getOpenIssues(state).length;
assert.ok(openBefore > 0, '初期状態に確認事項があること');
state.features['allocation'].issues[0].status = 'decided';
state.features['allocation'].issues[0].answer = 'プロジェクト＋工程の2階層にする';
assert.equal(getOpenIssues(state).length, openBefore - 1, '決定済み論点が確認一覧から除外されること');

/* 論点は視点ごとに割り当てられている */
for (const feature of FEATURE_CATALOG) {
  for (const issue of feature.issues) {
    assert.ok(VIEW_DEFINITIONS.some((view) => view.id === issue.viewId), `${issue.id}が4視点のどれかに属すること`);
  }
}

/* freee基準からの変更と、そこへ戻す操作 */
state.features['allocation'].views.goal = '働いた時間を案件別に説明でき、案件別の日次労務費を翌朝までに出せるようにする。';
assert.equal(isViewChanged(state, 'allocation', 'goal'), true, '書き換えを変更として検出すること');
assert.equal(getViewChanges(state).goal.changed, 1);
assert.equal(countFeatureChanges(state, 'allocation'), 1);
resetViewToBaseline(state, 'allocation', 'goal');
assert.equal(state.features['allocation'].views.goal, FEATURE_CATALOG.find((f) => f.id === 'allocation').baseline.goal, 'freee基準へ戻せること');
assert.equal(isViewChanged(state, 'allocation', 'goal'), false);

/* 要求のブレークダウンと、視点をまたぐ受け渡し */
let nodeSeq = 0;
const nextId = () => `t${(nodeSeq += 1)}`;
state.features['daily-cost'].views.goal = '案件ごとの労務費を、前日分について翌朝までに知る。';
const goalRoot = addBreakdownNode(state, 'daily-cost', 'goal', null, nextId);
assert.equal(goalRoot.id, 't1');
setBreakdownText(state, 'daily-cost', 'goal', 't1', '前日分が翌朝の時点で出ている');
const goalChild = addBreakdownNode(state, 'daily-cost', 'goal', 't1', nextId);
assert.equal(goalChild.id, 't2', '下位要求をさらに分解できること');
setBreakdownText(state, 'daily-cost', 'goal', 't2', '失敗した日も翌朝に分かる');
const third = addBreakdownNode(state, 'daily-cost', 'goal', 't2', nextId);
assert.ok(third, '3階層目までは足せること');
assert.equal(addBreakdownNode(state, 'daily-cost', 'goal', third.id, nextId), null, '4階層目は足せないこと');
assert.equal(flattenNodes(state.features['daily-cost'].breakdown.goal).length, 3);

state.features['daily-cost'].views.human = '経営者本人が朝いちばんに見て、その日の段取りを決める。';
const humanTargets = listLinkTargets(state, 'goal').find((group) => group.viewId === 'human');
assert.ok(humanTargets.options.some((option) => option.value === 'human:daily-cost:'), '別視点の記述を渡す先に選べること');
assert.equal(setBreakdownLink(state, 'daily-cost', 'goal', 't1', 'human:daily-cost:'), true);
assert.equal(state.features['daily-cost'].breakdown.goal[0].link.viewId, 'human');
assert.equal(listLinkTargets(state, 'goal').every((group) => group.viewId !== 'goal'), true, '同じ視点は渡す先に出さないこと');

assert.equal(removeBreakdownNode(state, 'daily-cost', 'goal', 't2'), true);
assert.equal(flattenNodes(state.features['daily-cost'].breakdown.goal).length, 1, '子ごと削除できること');

const markdown = buildMarkdown(state);
assert.match(markdown, /## 目的の分解（5W1H）/);
assert.match(markdown, /### Why — 何のために/);
assert.match(markdown, /\*\*未選択\*\*/, 'まだ選んでいない問いを出力に出すこと');
assert.match(markdown, /これを選ぶと: /, '選択がその先に何を招くかを出力へ残すこと');
assert.match(markdown, /赤字になりかけた案件を、早く見つける/, '選んだ答えを出力へ出すこと');
assert.match(markdown, /## 4つの視点/);
assert.match(markdown, /### 目標/);
assert.match(markdown, /## Clarifications/);
assert.match(markdown, /GETのみ/);
assert.match(markdown, /確定済みの機能判断/);
assert.match(markdown, /（freee基準のまま）/, '手を入れていない視点はfreee基準として示すこと');
assert.match(markdown, /前日分が翌朝の時点で出ている/, '分解した下位要求を出力へ含めること');
assert.match(markdown, /仮置き（人間の確定なし）/, '確定していない記述を仮置きとして分けること');
assert.doesNotMatch(markdown, /プロジェクト・工程への時間配分 — 外部で補完\n\nfreeeの日次勤怠/,
  '未確定機能を確定済み要求へ混ぜないこと');

/* 保存と復元（アプリは保存のたびに作業下書きへ同期している） */
state.looseDraftFeatures = JSON.parse(JSON.stringify(state.features));
const savedRoundTrip = normalizeState(JSON.parse(JSON.stringify(state)));
assert.equal(savedRoundTrip.activeViewId, state.activeViewId, '見ていた視点を復元すること');
assert.equal(savedRoundTrip.features['daily-cost'].views.goal, state.features['daily-cost'].views.goal, '書き換えた記述を復元すること');
assert.equal(flattenNodes(savedRoundTrip.features['daily-cost'].breakdown.goal).length, 1, '分解木を復元すること');
resetFeatureToBaseline(savedRoundTrip, 'daily-cost');
assert.equal(countFeatureChanges(savedRoundTrip, 'daily-cost'), 0, '機能まるごとfreee基準へ戻せること');
assert.equal(flattenNodes(savedRoundTrip.features['daily-cost'].breakdown.goal).length, 0, '戻したら分解木も消えること');

const damaged = { schemaVersion: 1, selectedFeatureId: 'unknown', features: { 'work-records': { action: 'invalid', views: { goal: 42 } } } };
const normalized = normalizeState(damaged);
assert.equal(normalized.selectedFeatureId, FEATURE_CATALOG[0].id);
assert.equal(normalized.features['work-records'].action, 'reuse');
assert.equal(typeof normalized.features['work-records'].views.goal, 'string');

const next = findNextQuestion(state.features['allocation']);
assert.ok(next.includes('確かめる') || next.includes('仮決定') || next.includes('確定'), '次の問いを出せること');

/* 要求変更PR */
const prState = createInitialState();
prState.features['allocation'].views.goal += ' 工程別にも確認する。';
assert.ok(diffFeatureSets(prState.baselineFeatures, prState.features).length > 0, '作業下書きとベースラインを比較できること');
const pr = createRequirementPr(prState, '工程別集計を追加', '工程ごとの赤字を発見するため', () => new Date('2026-08-30T10:00:00Z'));
assert.equal(prState.activePrId, pr.id);
assert.equal(pr.versions.length, 1);
assert.equal(pr.baseRevision, 1);
assert.equal(savePrSnapshot(prState, '変更なし'), null, '同じ内容の版を重複保存しないこと');
prState.features['allocation'].views.data += ' 工程IDを必須にする。';
const version2 = savePrSnapshot(prState, '工程IDを追加', () => new Date('2026-08-30T10:10:00Z'));
assert.equal(version2.number, 2);
assert.equal(restorePrVersion(prState, 1, () => new Date('2026-08-30T10:20:00Z')), true);
assert.doesNotMatch(prState.features['allocation'].views.data, /工程IDを必須/);
assert.equal(mergeRequirementPr(prState, () => new Date('2026-08-30T10:30:00Z')), true);
assert.equal(prState.baselineRevision, 2);
assert.equal(pr.status, 'merged');
assert.deepEqual(prState.baselineFeatures, prState.features);
assert.equal(reopenRequirementPr(prState, () => new Date('2026-08-30T10:40:00Z')), true);
assert.equal(pr.status, 'open');
assert.equal(pr.baseRevision, 2);
assert.equal(closeRequirementPr(prState, () => new Date('2026-08-30T10:50:00Z')), true);
assert.equal(pr.status, 'closed');

const normalizedV2 = normalizeState(JSON.parse(JSON.stringify(prState)));
assert.equal(normalizedV2.pullRequests.length, 1, 'PR履歴を再読込できること');
assert.equal(normalizedV2.pullRequests[0].versions.length, 2, '版履歴を再読込できること');

/* 分解木もPRの差分に乗ること */
const nodeState = createInitialState();
addBreakdownNode(nodeState, 'allocation', 'goal', null, () => 'x1');
setBreakdownText(nodeState, 'allocation', 'goal', 'x1', '案件別に説明できる');
assert.ok(diffFeatureSets(nodeState.baselineFeatures, nodeState.features).some((row) => row.after.includes('案件別に説明できる')),
  '下位要求の追加も変更として比較できること');

/* freeeに実装ずみの勤怠管理が、4視点へ配置されていること */
const workRecords = FEATURE_CATALOG.find((f) => f.id === 'work-records');
assert.equal(workRecords.kind, 'verified', '勤怠は実機で取得確認ずみの機能であること');
const wrBase = baselineBreakdownOf('work-records');
for (const view of VIEW_DEFINITIONS) {
  assert.ok(wrBase[view.id].length >= 3, view.label + '視点へ勤怠が配置されていること');
  assert.deepEqual(state.features['work-records'].breakdown[view.id], wrBase[view.id], '出発点はfreee基準の配置そのものであること');
  assert.equal(isViewChanged(state, 'work-records', view.id), false, '配置ずみでも初期状態は変更0であること');
  for (const { node, depth } of flattenNodes(wrBase[view.id])) {
    assert.ok(node.text.trim(), '空の行を置かないこと');
    assert.ok(depth <= BREAKDOWN_MAX_DEPTH, '3階層までに収めること');
    assert.equal(isBaselineNodeText('work-records', view.id, node.text), true, 'freee基準の行として見分けられること');
  }
}

/* 実機で確認した事実が、配置のなかに残っていること */
assert.ok(flattenNodes(wrBase.data).some(({ node }) => node.text.includes('normal_work_mins')), '取得できる項目名をデータ視点に残すこと');
assert.ok(flattenNodes(wrBase.system).some(({ node }) => node.text.includes('work_record_segments')), '明細の器があることをシステム視点に残すこと');
assert.ok(flattenNodes(wrBase.goal).some(({ node }) => node.text.includes('この機能が答えないこと')), '穴がどこかを目標視点に残すこと');
assert.ok(flattenNodes(wrBase.human).some(({ node }) => node.text.includes('いま誰もしていないこと')), '人がしていないことを人間視点に残すこと');
assert.equal(isBaselineNodeText('work-records', 'goal', '人があとから足した行'), false, '人が足した行はfreee基準と区別すること');

/* 足した行があっても、freee基準の配置へ丸ごと戻せること */
const wrNode = addBreakdownNode(state, 'work-records', 'data', null, () => 'wr-test');
setBreakdownText(state, 'work-records', 'data', wrNode.id, '案件IDを持たせる');
assert.equal(isViewChanged(state, 'work-records', 'data'), true, '行を足したら変更として検出すること');
assert.equal(countFeatureChanges(state, 'work-records'), 1);
resetViewToBaseline(state, 'work-records', 'data');
assert.deepEqual(state.features['work-records'].breakdown.data, wrBase.data, 'freee基準の配置へ戻せること');
assert.equal(isViewChanged(state, 'work-records', 'data'), false);


console.log(`OK: 目的文を${PURPOSE_SLOTS.length}個の5W1H問い（選択式・${PURPOSE_SLOTS.reduce((n, slot) => n + slot.choices.length, 0)}択）へ分解、${FEATURE_CATALOG.length}機能 × ${VIEW_DEFINITIONS.length}視点をfreee基準で初期化（勤怠管理は4視点へ配置ずみ）、${openBefore}件の確認事項、freee基準への復帰、分解木とリンク、要求PRの作成・版保存・復元・マージ・再オープンを検証しました。`);
