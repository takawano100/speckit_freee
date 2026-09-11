/*
 * freee 差分要求ワークベンチ
 * - freee API は呼び出さない。要求の判断は localStorage にのみ保存する。
 * - 目標・人間・システム・データの4視点を、機能ごとに相互照合する。
 * - 人間が「確定」したかどうかを、AI生成や入力充足とは別に管理する。
 */

const STORAGE_KEY = 'speckit-freee-requirements-v1';
const SCHEMA_VERSION = 3;

const VIEW_DEFINITIONS = [
  { id: 'goal', label: '目標', question: 'この機能によって、何が分かり、何を決められるようにするか' },
  { id: 'human', label: '人間', question: '誰が、いつ使い、間違えたときにどう直すか' },
  { id: 'system', label: 'システム', question: 'freeeと外部システムの境界をどこに引くか' },
  { id: 'data', label: 'データ', question: '何を読み、何を新しく記録し、何を残さないか' },
];

const DELTA_OPTIONS = [
  { id: 'reuse', label: 'そのまま利用' },
  { id: 'add', label: '機能を追加' },
  { id: 'change', label: '扱いを変更' },
  { id: 'external', label: '外部で補完' },
  { id: 'exclude', label: '対象外' },
  { id: 'hold', label: '保留' },
];

const ISSUE_STATES = {
  open: '未決定',
  assumed: '仮決定',
  decided: '決定済み',
};

const BREAKDOWN_MAX_DEPTH = 3;

/*
 * baseline = freeeが今それを実現している状態を、4視点で書いたもの。
 * 機能は「目的を実現する手段」であり、人間・システム・データが噛み合って初めて成立する。
 * 既に動いている機能では、その3つは必ず埋まっていて、言語化されていないのは目標だけ。
 * だから白紙から書かず、freee基準から出発して「どう変えるか」を書く。いつでもここへ戻せる。
 */
const FEATURE_CATALOG = [
  {
    id: 'work-records',
    name: '日次勤怠・打刻',
    product: 'freee人事労務',
    kind: 'verified',
    freeeGiven: true,
    source: 'GET /api/v1/employees/{employee_id}/work_records/{date}',
    evidence: '開発用事業所12755401・従業員4174944で2026-08-14分を取得確認済み',
    description: '誰が、いつ、何分働いたか。所定・時間外・深夜・休日の内訳をfreeeが持っています。',
    action: 'reuse',
    confirmed: false,
    baseline: {
      goal: '働いた事実を正しく記録し、給与計算と法定の労働時間管理に使える状態にする。',
      human: '経営者本人がfreeeで打刻する。数日分を後からまとめて確認・修正することもある。',
      system: 'freee人事労務が勤怠を保持する。外部からはGETで読むだけで、登録・修正はしない。',
      data: '従業員ID、日付、所定・時間外・深夜・休日の分数、打刻時刻を持つ。',
    },
    baselineBreakdown: {
      goal: [
        { id: 'wr-g1', text: '働いた事実を、給与計算にそのまま使える形で確定させる', children: [
          { id: 'wr-g1a', text: '所定・時間外・深夜・休日が分かれているので、割増賃金を法令どおり計算できる' },
        ] },
        { id: 'wr-g2', text: '労働時間が法定の枠に収まっているかを、日ごとに確認できる', children: [
          { id: 'wr-g2a', text: '時間外の上限、休憩の取得、休日労働の有無を見る' },
        ] },
        { id: 'wr-g3', text: 'この機能が答えないこと：その時間が「何の仕事」だったかは分からない' },
      ],
      human: [
        { id: 'wr-h1', text: '打刻する人 — 従業員が出勤・退勤・休憩をfreeeの画面／アプリで打つ', children: [
          { id: 'wr-h1a', text: '次に打てる操作はfreeeが持つ（未出勤なら available_types は clock_in だけ）' },
        ] },
        { id: 'wr-h2', text: '直す人 — 本人または管理者が、日次勤怠の画面で後から分数を修正する', children: [
          { id: 'wr-h2a', text: '数日分をまとめて直すことがある。だから「いつ確定とみなすか」が要る' },
        ] },
        { id: 'wr-h3', text: '使う人 — 経営者が月次で勤怠を締めて、給与計算へ回す' },
        { id: 'wr-h4', text: 'いま誰もしていないこと：その時間をどの案件に使ったかの入力' },
      ],
      system: [
        { id: 'wr-s1', text: 'freee人事労務が打刻を受け、日次勤怠へ集約する', children: [
          { id: 'wr-s1a', text: '打刻 time_clocks → 日次勤怠 work_records の順に積み上がる' },
        ] },
        { id: 'wr-s2', text: '働き方設定が分数の判定ルール（固定時間制・9:00-18:00・休憩1h・法定休日=日曜・割増は法定どおり）' },
        { id: 'wr-s3', text: '外部からはGETで読むだけ。登録・修正はfreeeの画面で行い、こちらからは書かない' },
        { id: 'wr-s4', text: '境界：work_record_segments という明細の器はあるが、案件を入れる場所がない' },
      ],
      data: [
        { id: 'wr-d1', text: 'キー：従業員ID × 日付（例 4174944 × 2026-08-14）' },
        { id: 'wr-d2', text: '時間：normal_work_mins / total_overtime_work_mins / total_latenight_work_mins / total_holiday_work_mins / total_excess_statutory_work_mins', children: [
          { id: 'wr-d2a', text: '所定と割増が最初から分かれている。単価を分けて掛けられる' },
        ] },
        { id: 'wr-d3', text: '時刻：normal_work_clock_in_at / normal_work_clock_out_at（+09:00 付き）', children: [
          { id: 'wr-d3a', text: '日跨ぎ勤務がどちらの日に付くかは、この日付キーの決め方で決まる' },
        ] },
        { id: 'wr-d4', text: '明細：break_records（休憩）／work_record_segments（勤務の区切り）' },
        { id: 'wr-d5', text: '持っていない：案件・工程・単価。だから労務費はこの中では出せない' },
      ],
    },
    issues: [
      { id: 'missing-record', viewId: 'system', title: '勤怠が未入力の日', prompt: '未入力を0時間とみなすか、集計失敗として表示するか。', status: 'open', answer: '' },
      { id: 'day-boundary', viewId: 'data', title: '日跨ぎ勤務の日付', prompt: '22:00-翌6:00の勤務は、開始した日と終わった日のどちらの労務費にするか。', status: 'open', answer: '' },
      { id: 'fix-window', viewId: 'human', title: '勤怠を直せる期間', prompt: '翌朝に出した数字を、あとから直された場合に出し直すか、その日の数字として残すか。', status: 'open', answer: '' },
    ],
  },
  {
    id: 'payroll-rate',
    name: '給与・予定単価',
    product: 'freee人事労務＋外部',
    kind: 'pending',
    freeeGiven: false,
    source: '給与情報の取得パスと参照範囲は要確認',
    evidence: 'REQUEST.mdでは基本給をfreeeから読み、予定単価は外部で持つ方針',
    description: '給与計算はfreeeに任せ、日次計算に使う予定単価だけを外部で管理します。',
    action: 'external',
    confirmed: false,
    baseline: {
      goal: '毎月の給与を、法令どおり正しく確定させて支払う。',
      human: '経営者本人が給与を確定させる。確定するのは月に一度。',
      system: 'freee人事労務が給与を計算し確定する。日次で使う予定単価はfreeeが持たない。',
      data: '確定した給与額、支給項目、控除項目を月単位で持つ。日次に割れる単価はない。',
    },
    issues: [
      { id: 'rate-components', viewId: 'data', title: '予定単価に含める費用', prompt: '基本給だけか、賞与・社会保険の会社負担分まで含めるか。', status: 'open', answer: '' },
      { id: 'rate-revision', viewId: 'data', title: '予定単価の改定時期', prompt: '昇給ごとか、年1回か。過去分を遡って変えるか。', status: 'open', answer: '' },
      { id: 'premium', viewId: 'human', title: '残業・深夜・休日の割増', prompt: '通常分と割増分を分けて見せるか、単価へ混ぜるか。', status: 'open', answer: '' },
    ],
  },
  {
    id: 'sections',
    name: '会計部門',
    product: 'freee会計',
    kind: 'verified',
    freeeGiven: true,
    source: 'GET /api/1/sections',
    evidence: '開発用事業所12755401で部門一覧の取得を確認済み',
    description: 'freee会計の部門を参照し、外部のプロジェクトと対応付ける候補です。',
    action: 'reuse',
    confirmed: false,
    baseline: {
      goal: '会計上の数字を、組織の区分ごとに分けて見られるようにする。',
      human: '経営者本人がfreee会計で部門を作り、仕訳のときに部門を選ぶ。',
      system: 'freee会計が部門を保持する。外部からはGETで読むだけで、作成・変更はfreee側で行う。',
      data: 'freee部門ID、部門名、階層を持つ。案件や工程という区分は持たない。',
    },
    issues: [
      { id: 'section-mapping', viewId: 'data', title: 'プロジェクトと部門の対応', prompt: '1対1か、複数プロジェクトを1部門へまとめるか、対応付け自体をしないか。', status: 'open', answer: '' },
    ],
  },
  {
    id: 'pm',
    name: 'freee工数管理',
    product: 'freee工数管理',
    kind: 'pending',
    freeeGiven: true,
    source: '/pm は利用不可',
    evidence: '対象の開発用事業所に製品が導入されていないことを確認済み',
    description: '利用できない機能です。工数管理がfreee内にある前提を置かないため、明示的に対象外とします。',
    action: 'exclude',
    confirmed: false,
    baseline: {
      goal: '（この事業所では実現していない）案件ごとの工数を、freee内で管理する。',
      human: 'この事業所には利用者がいない。契約がなく、誰も入力していない。',
      system: 'freee工数管理APIは利用できない。接続先として存在しない。',
      data: '工数管理由来のデータはこの事業所に存在しない。',
    },
    issues: [],
  },
  {
    id: 'allocation',
    name: 'プロジェクト・工程への時間配分',
    product: '外部で作る',
    kind: 'local',
    freeeGiven: false,
    source: 'freeeには「何の仕事か」がない',
    evidence: 'REQUEST.mdで本システムの中心的な差分として定義',
    description: 'freeeの日次勤怠を、プロジェクトと工程へ割り当てます。',
    action: 'external',
    confirmed: false,
    baseline: {
      goal: '（今は実現していない）働いた時間が、何の仕事に使われたかを説明できるようにする。',
      human: '今は誰もやっていない。月次で給与が確定したあと、人が手で振り分けている。',
      system: 'freeeに時間の割り当て先を持つ仕組みがない。勤怠と案件が結び付いていない。',
      data: '勤怠は「何分働いたか」までしか持たない。案件・工程という軸がない。',
    },
    issues: [
      { id: 'process-level', viewId: 'data', title: '工程を持つか', prompt: 'プロジェクト＋工程の2階層にするか、プロジェクト単位に限定するか。', status: 'open', answer: '' },
      { id: 'entry-timing', viewId: 'human', title: '入力するタイミング', prompt: '1日の終わりか、数日分をまとめるか。未配分をどのように知らせるか。', status: 'open', answer: '' },
      { id: 'over-allocation', viewId: 'system', title: '配分時間の整合性', prompt: '勤務時間との不一致を禁止するか、仮保存を許可して警告するか。', status: 'open', answer: '' },
    ],
  },
  {
    id: 'daily-cost',
    name: '日次労務費・月次差異',
    product: '外部で作る',
    kind: 'local',
    freeeGiven: false,
    source: 'freeeには確定前の日次管理値がない',
    evidence: '財務帳簿と管理用の概算値を分離する方針',
    description: '予定単価で日次労務費を計算し、月末に確定給与との差異を見せます。',
    action: 'external',
    confirmed: false,
    baseline: {
      goal: '（今は実現していない）案件ごとにいくらかかったかを、確定を待たずに知る。',
      human: '今は月次で給与が確定したあと、経営者が手で集計している。翌朝には分からない。',
      system: '確定前の概算値を置く場所がない。freee会計は確定した数字のための器。',
      data: '日別・案件別の概算額を持つ場所がない。差異を残す仕組みもない。',
    },
    issues: [
      { id: 'variance-policy', viewId: 'data', title: '月末差異の扱い', prompt: '差異を月末の1行として残すか、日次へ遡って洗い替えるか。', status: 'open', answer: '' },
      { id: 'morning-deadline', viewId: 'goal', title: '「翌朝」の時刻', prompt: '何時までに完了すれば要件を満たすか。失敗時の表示方法も決める。', status: 'open', answer: '' },
    ],
  },
  {
    id: 'accounting-books',
    name: '仕訳・試算表・決算書',
    product: 'freee会計',
    kind: 'verified',
    freeeGiven: true,
    source: 'freee会計の確定帳簿',
    evidence: '確定前の管理値を財務会計へ混ぜない方針',
    description: '日次の概算労務費では触らない領域です。境界を明示するため一覧に残します。',
    action: 'exclude',
    confirmed: false,
    baseline: {
      goal: '税務と財務に使える、確定した帳簿を作る。',
      human: '経営者と税理士が、確定した数字として読む。日々書き換わることを想定していない。',
      system: 'freee会計が仕訳・試算表・決算書を保持する。確定した記録のための器。',
      data: '仕訳、勘定科目、試算表、決算書を持つ。確定前の概算値は持たない。',
    },
    issues: [],
  },
];

function viewOf(viewId) {
  return VIEW_DEFINITIONS.find((view) => view.id === viewId) || VIEW_DEFINITIONS[0];
}

function featureOf(featureId) {
  return FEATURE_CATALOG.find((feature) => feature.id === featureId) || FEATURE_CATALOG[0];
}

function emptyBreakdown() {
  return Object.fromEntries(VIEW_DEFINITIONS.map((view) => [view.id, []]));
}

function makeNodeId() {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeLink(link) {
  if (!link || typeof link !== 'object') return null;
  if (!VIEW_DEFINITIONS.some((view) => view.id === link.viewId)) return null;
  if (!FEATURE_CATALOG.some((feature) => feature.id === link.featureId)) return null;
  return {
    viewId: link.viewId,
    featureId: link.featureId,
    nodeId: typeof link.nodeId === 'string' ? link.nodeId : '',
  };
}

function normalizeNodes(candidate, depth = 1) {
  if (!Array.isArray(candidate) || depth > BREAKDOWN_MAX_DEPTH) return [];
  return candidate.slice(0, 40).flatMap((node) => {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string') return [];
    return [{
      id: node.id,
      text: typeof node.text === 'string' ? node.text : '',
      link: normalizeLink(node.link),
      children: normalizeNodes(node.children, depth + 1),
    }];
  });
}

function normalizeBreakdown(candidate) {
  const result = emptyBreakdown();
  if (!candidate || typeof candidate !== 'object') return result;
  for (const view of VIEW_DEFINITIONS) result[view.id] = normalizeNodes(candidate[view.id]);
  return result;
}

function fillNodes(candidate, depth = 1) {
  if (!Array.isArray(candidate) || depth > BREAKDOWN_MAX_DEPTH) return [];
  return candidate.map((node) => ({
    id: node.id,
    text: node.text,
    link: node.link ? { ...node.link } : null,
    children: fillNodes(node.children, depth + 1),
  }));
}

/* freeeが今実現していることを、4視点の分解木として取り出す */
function baselineBreakdownOf(featureId) {
  const feature = featureOf(featureId);
  const source = feature.baselineBreakdown || {};
  return Object.fromEntries(VIEW_DEFINITIONS.map((view) => [view.id, fillNodes(source[view.id])]));
}

function breakdownSignature(nodes) {
  return flattenNodes(nodes)
    .filter(({ node }) => node.text.trim())
    .map(({ node, depth }) => `${depth}|${node.text.trim()}|${node.link ? `${node.link.featureId}.${node.link.viewId}.${node.link.nodeId}` : ''}`)
    .join('\n');
}

/* その行がfreee基準から来たものか、人が足したものか */
function isBaselineNodeText(featureId, viewId, text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return flattenNodes(baselineBreakdownOf(featureId)[viewId]).some(({ node }) => node.text.trim() === value);
}

function findNodeById(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

function nodeDepth(nodes, id, depth = 1) {
  for (const node of nodes) {
    if (node.id === id) return depth;
    const found = nodeDepth(node.children, id, depth + 1);
    if (found) return found;
  }
  return 0;
}

function flattenNodes(nodes, depth = 1) {
  return nodes.flatMap((node) => [{ node, depth }, ...flattenNodes(node.children, depth + 1)]);
}

function addBreakdownNode(state, featureId, viewId, parentId = null, makeId = makeNodeId) {
  const nodes = state.features[featureId].breakdown[viewId];
  const node = { id: makeId(), text: '', link: null, children: [] };
  if (!parentId) {
    nodes.push(node);
    return node;
  }
  const parent = findNodeById(nodes, parentId);
  if (!parent || nodeDepth(nodes, parentId) >= BREAKDOWN_MAX_DEPTH) return null;
  parent.children.push(node);
  return node;
}

function removeBreakdownNode(state, featureId, viewId, nodeId) {
  const removeFrom = (nodes) => {
    const index = nodes.findIndex((node) => node.id === nodeId);
    if (index >= 0) {
      nodes.splice(index, 1);
      return true;
    }
    return nodes.some((node) => removeFrom(node.children));
  };
  const removed = removeFrom(state.features[featureId].breakdown[viewId]);
  if (!removed) return false;
  /* 消えたノードを指していたリンクは外す */
  for (const feature of FEATURE_CATALOG) {
    for (const view of VIEW_DEFINITIONS) {
      for (const { node } of flattenNodes(state.features[feature.id].breakdown[view.id])) {
        if (node.link && node.link.viewId === viewId && node.link.featureId === featureId && node.link.nodeId === nodeId) node.link = null;
      }
    }
  }
  return true;
}

function setBreakdownText(state, featureId, viewId, nodeId, text) {
  const node = findNodeById(state.features[featureId].breakdown[viewId], nodeId);
  if (!node) return false;
  node.text = text;
  return true;
}

function setBreakdownLink(state, featureId, viewId, nodeId, value) {
  const node = findNodeById(state.features[featureId].breakdown[viewId], nodeId);
  if (!node) return false;
  if (!value) {
    node.link = null;
    return true;
  }
  const [linkViewId, linkFeatureId, linkNodeId = ''] = String(value).split(':');
  node.link = normalizeLink({ viewId: linkViewId, featureId: linkFeatureId, nodeId: linkNodeId });
  return true;
}

/* 別の視点へ渡す先の候補 */
function listLinkTargets(state, currentViewId) {
  return VIEW_DEFINITIONS.filter((view) => view.id !== currentViewId).map((view) => ({
    viewId: view.id,
    viewLabel: view.label,
    options: FEATURE_CATALOG.flatMap((feature) => {
      const featureState = state.features[feature.id];
      const rootText = String(featureState.views[view.id] || '').trim();
      const rows = rootText ? [{ value: `${view.id}:${feature.id}:`, label: `${feature.name} — ${rootText.slice(0, 30)}` }] : [];
      return rows.concat(flattenNodes(featureState.breakdown[view.id])
        .filter(({ node }) => node.text.trim())
        .map(({ node }) => ({ value: `${view.id}:${feature.id}:${node.id}`, label: `${feature.name} ▸ ${node.text.trim().slice(0, 30)}` })));
    }),
  })).filter((group) => group.options.length);
}

function describeLink(state, link) {
  if (!link) return '';
  const view = viewOf(link.viewId);
  const feature = featureOf(link.featureId);
  if (!link.nodeId) {
    const text = String(state.features[feature.id].views[link.viewId] || '').trim();
    return `${view.label} / ${feature.name}${text ? ` — ${text.slice(0, 40)}` : ''}`;
  }
  const node = findNodeById(state.features[feature.id].breakdown[link.viewId], link.nodeId);
  return `${view.label} / ${feature.name} ▸ ${node ? node.text.trim().slice(0, 40) : '（削除済み）'}`;
}

/* freee基準からどれだけ動かしたか */
function isViewChanged(state, featureId, viewId) {
  const feature = featureOf(featureId);
  const featureState = state.features[featureId];
  if (String(featureState.views[viewId] || '').trim() !== String(feature.baseline[viewId] || '').trim()) return true;
  return breakdownSignature(featureState.breakdown[viewId]) !== breakdownSignature(baselineBreakdownOf(featureId)[viewId]);
}

function countFeatureChanges(state, featureId) {
  return VIEW_DEFINITIONS.filter((view) => isViewChanged(state, featureId, view.id)).length;
}

function getViewChanges(state) {
  return Object.fromEntries(VIEW_DEFINITIONS.map((view) => [view.id, {
    changed: FEATURE_CATALOG.filter((feature) => isViewChanged(state, feature.id, view.id)).length,
    total: FEATURE_CATALOG.length,
  }]));
}

function resetViewToBaseline(state, featureId, viewId) {
  const feature = featureOf(featureId);
  state.features[featureId].views[viewId] = feature.baseline[viewId];
  state.features[featureId].breakdown[viewId] = baselineBreakdownOf(featureId)[viewId];
  return true;
}

function resetFeatureToBaseline(state, featureId) {
  for (const view of VIEW_DEFINITIONS) resetViewToBaseline(state, featureId, view.id);
  return true;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInitialState() {
  const features = Object.fromEntries(FEATURE_CATALOG.map((feature) => [feature.id, {
    action: feature.action,
    confirmed: feature.confirmed,
    views: clone(feature.baseline),
    breakdown: baselineBreakdownOf(feature.id),
    issues: clone(feature.issues),
  }]));
  return {
    schemaVersion: SCHEMA_VERSION,
    selectedFeatureId: FEATURE_CATALOG[0].id,
    activeViewId: VIEW_DEFINITIONS[0].id,
    project: {
      title: '勤怠に「何の仕事か」を足して、日々の労務費を出す',
      companyId: '12755401',
      apiPolicy: 'GET_ONLY',
    },
    purpose: createPurposeState(),
    baselineRevision: 1,
    baselineFeatures: clone(features),
    looseDraftFeatures: clone(features),
    features,
    pullRequests: [],
    activePrId: null,
    prPanelOpen: false,
  };
}

function normalizeState(candidate) {
  const initial = createInitialState();
  if (!candidate || ![1, 2, SCHEMA_VERSION].includes(candidate.schemaVersion)) return initial;
  for (const feature of FEATURE_CATALOG) {
    const saved = candidate.features && candidate.features[feature.id];
    if (!saved) continue;
    initial.features[feature.id].action = DELTA_OPTIONS.some((option) => option.id === saved.action) ? saved.action : feature.action;
    initial.features[feature.id].confirmed = Boolean(saved.confirmed);
    for (const view of VIEW_DEFINITIONS) {
      if (typeof saved.views?.[view.id] === 'string') initial.features[feature.id].views[view.id] = saved.views[view.id];
    }
    const savedBreakdown = normalizeBreakdown(saved.breakdown);
    for (const view of VIEW_DEFINITIONS) {
      const stale = candidate.schemaVersion < SCHEMA_VERSION && !savedBreakdown[view.id].length;
      initial.features[feature.id].breakdown[view.id] = stale
        ? baselineBreakdownOf(feature.id)[view.id]
        : savedBreakdown[view.id];
    }
    for (const issue of initial.features[feature.id].issues) {
      const savedIssue = saved.issues?.find((item) => item.id === issue.id);
      if (!savedIssue) continue;
      issue.status = Object.hasOwn(ISSUE_STATES, savedIssue.status) ? savedIssue.status : issue.status;
      issue.answer = typeof savedIssue.answer === 'string' ? savedIssue.answer : '';
    }
  }
  if (FEATURE_CATALOG.some((feature) => feature.id === candidate.selectedFeatureId)) {
    initial.selectedFeatureId = candidate.selectedFeatureId;
  }
  if (VIEW_DEFINITIONS.some((view) => view.id === candidate.activeViewId)) {
    initial.activeViewId = candidate.activeViewId;
  }
  initial.purpose = normalizePurpose(candidate.purpose);
  if (candidate.schemaVersion === 1) {
    initial.baselineFeatures = clone(initial.features);
    initial.looseDraftFeatures = clone(initial.features);
    return initial;
  }
  initial.baselineRevision = Number.isInteger(candidate.baselineRevision) && candidate.baselineRevision > 0 ? candidate.baselineRevision : 1;
  initial.baselineFeatures = normalizeFeatureSet(candidate.baselineFeatures, initial.baselineFeatures);
  initial.looseDraftFeatures = normalizeFeatureSet(candidate.looseDraftFeatures, initial.features);
  initial.pullRequests = Array.isArray(candidate.pullRequests)
    ? candidate.pullRequests.map(normalizePullRequest).filter(Boolean)
    : [];
  initial.activePrId = initial.pullRequests.some((pr) => pr.id === candidate.activePrId) ? candidate.activePrId : null;
  initial.prPanelOpen = Boolean(candidate.prPanelOpen);
  const activePr = initial.pullRequests.find((pr) => pr.id === initial.activePrId);
  initial.features = activePr ? clone(activePr.draftFeatures) : clone(initial.looseDraftFeatures);
  return initial;
}

function normalizeFeatureSet(candidate, fallback) {
  const result = clone(fallback);
  if (!candidate || typeof candidate !== 'object') return result;
  for (const feature of FEATURE_CATALOG) {
    const saved = candidate[feature.id];
    if (!saved) continue;
    if (DELTA_OPTIONS.some((option) => option.id === saved.action)) result[feature.id].action = saved.action;
    result[feature.id].confirmed = Boolean(saved.confirmed);
    for (const view of VIEW_DEFINITIONS) {
      if (typeof saved.views?.[view.id] === 'string') result[feature.id].views[view.id] = saved.views[view.id];
    }
    result[feature.id].breakdown = normalizeBreakdown(saved.breakdown);
    for (const issue of result[feature.id].issues) {
      const savedIssue = saved.issues?.find((item) => item.id === issue.id);
      if (!savedIssue) continue;
      if (Object.hasOwn(ISSUE_STATES, savedIssue.status)) issue.status = savedIssue.status;
      if (typeof savedIssue.answer === 'string') issue.answer = savedIssue.answer;
    }
  }
  return result;
}

function normalizePullRequest(candidate) {
  if (!candidate || typeof candidate !== 'object' || typeof candidate.id !== 'string') return null;
  const fallback = createInitialState().features;
  const versions = Array.isArray(candidate.versions) ? candidate.versions.map((version, index) => ({
    number: Number.isInteger(version.number) ? version.number : index + 1,
    label: typeof version.label === 'string' ? version.label : `版 ${index + 1}`,
    createdAt: typeof version.createdAt === 'string' ? version.createdAt : new Date(0).toISOString(),
    features: normalizeFeatureSet(version.features, fallback),
  })) : [];
  return {
    id: candidate.id,
    number: Number.isInteger(candidate.number) ? candidate.number : 1,
    title: typeof candidate.title === 'string' ? candidate.title : '名称未設定の変更',
    reason: typeof candidate.reason === 'string' ? candidate.reason : '',
    status: ['open', 'merged', 'closed'].includes(candidate.status) ? candidate.status : 'open',
    baseRevision: Number.isInteger(candidate.baseRevision) ? candidate.baseRevision : 1,
    baseFeatures: normalizeFeatureSet(candidate.baseFeatures, fallback),
    draftFeatures: normalizeFeatureSet(candidate.draftFeatures, fallback),
    versions,
    events: Array.isArray(candidate.events) ? candidate.events.filter((event) => event && typeof event.type === 'string') : [],
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date(0).toISOString(),
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date(0).toISOString(),
    mergedAt: typeof candidate.mergedAt === 'string' ? candidate.mergedAt : null,
  };
}

function loadState(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createInitialState();
  } catch (error) {
    console.warn('保存済み要求を読み込めませんでした。初期状態を使用します。', error);
    return createInitialState();
  }
}

function saveState(storage, state) {
  if (!storage) return false;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  return true;
}

function nowIso(clock = () => new Date()) {
  return clock().toISOString();
}

function syncCurrentDraft(state) {
  const active = state.pullRequests.find((pr) => pr.id === state.activePrId);
  if (active) {
    active.draftFeatures = clone(state.features);
    active.updatedAt = nowIso();
  } else {
    state.looseDraftFeatures = clone(state.features);
  }
}

function nextPrNumber(state) {
  return state.pullRequests.reduce((max, pr) => Math.max(max, pr.number || 0), 0) + 1;
}

function createRequirementPr(state, title, reason, clock = () => new Date()) {
  syncCurrentDraft(state);
  const number = nextPrNumber(state);
  const createdAt = nowIso(clock);
  const draftFeatures = clone(state.features);
  const pr = {
    id: `req-pr-${String(number).padStart(3, '0')}`,
    number,
    title: String(title).trim(),
    reason: String(reason).trim(),
    status: 'open',
    baseRevision: state.baselineRevision,
    baseFeatures: clone(state.baselineFeatures),
    draftFeatures,
    versions: [{ number: 1, label: 'PR作成時', createdAt, features: clone(draftFeatures) }],
    events: [{ type: 'created', at: createdAt, message: '変更PRを作成' }],
    createdAt,
    updatedAt: createdAt,
    mergedAt: null,
  };
  state.pullRequests.unshift(pr);
  state.activePrId = pr.id;
  state.features = clone(pr.draftFeatures);
  state.prPanelOpen = true;
  return pr;
}

function savePrSnapshot(state, label, clock = () => new Date()) {
  const pr = state.pullRequests.find((item) => item.id === state.activePrId);
  if (!pr || pr.status !== 'open') return null;
  syncCurrentDraft(state);
  const last = pr.versions.at(-1);
  if (last && JSON.stringify(last.features) === JSON.stringify(pr.draftFeatures)) return null;
  const createdAt = nowIso(clock);
  const version = {
    number: pr.versions.reduce((max, item) => Math.max(max, item.number), 0) + 1,
    label: String(label || '').trim() || `スナップショット ${pr.versions.length + 1}`,
    createdAt,
    features: clone(pr.draftFeatures),
  };
  pr.versions.push(version);
  pr.events.push({ type: 'snapshot', at: createdAt, message: `版 ${version.number} を保存: ${version.label}` });
  pr.updatedAt = createdAt;
  return version;
}

function restorePrVersion(state, versionNumber, clock = () => new Date()) {
  const pr = state.pullRequests.find((item) => item.id === state.activePrId);
  if (!pr || pr.status !== 'open') return false;
  const version = pr.versions.find((item) => item.number === Number(versionNumber));
  if (!version) return false;
  const restoredAt = nowIso(clock);
  pr.draftFeatures = clone(version.features);
  state.features = clone(version.features);
  pr.events.push({ type: 'restored', at: restoredAt, message: `版 ${version.number}「${version.label}」へ戻した` });
  pr.updatedAt = restoredAt;
  return true;
}

function mergeRequirementPr(state, clock = () => new Date()) {
  const pr = state.pullRequests.find((item) => item.id === state.activePrId);
  if (!pr || pr.status !== 'open') return false;
  syncCurrentDraft(state);
  const mergedAt = nowIso(clock);
  state.baselineFeatures = clone(pr.draftFeatures);
  state.baselineRevision += 1;
  pr.status = 'merged';
  pr.mergedAt = mergedAt;
  pr.updatedAt = mergedAt;
  pr.events.push({ type: 'merged', at: mergedAt, message: `確定ベースライン Revision ${state.baselineRevision} へマージ` });
  return true;
}

function closeRequirementPr(state, clock = () => new Date()) {
  const pr = state.pullRequests.find((item) => item.id === state.activePrId);
  if (!pr || pr.status !== 'open') return false;
  syncCurrentDraft(state);
  const closedAt = nowIso(clock);
  pr.status = 'closed';
  pr.updatedAt = closedAt;
  pr.events.push({ type: 'closed', at: closedAt, message: '変更案を取り下げ' });
  return true;
}

function reopenRequirementPr(state, clock = () => new Date()) {
  const pr = state.pullRequests.find((item) => item.id === state.activePrId);
  if (!pr || pr.status === 'open') return false;
  const reopenedAt = nowIso(clock);
  pr.status = 'open';
  pr.baseRevision = state.baselineRevision;
  pr.baseFeatures = clone(state.baselineFeatures);
  pr.mergedAt = null;
  pr.updatedAt = reopenedAt;
  pr.events.push({ type: 'reopened', at: reopenedAt, message: `Revision ${state.baselineRevision} を起点に再オープン` });
  state.features = clone(pr.draftFeatures);
  return true;
}

function switchActivePr(state, prId) {
  syncCurrentDraft(state);
  const target = state.pullRequests.find((pr) => pr.id === prId);
  if (!target) return false;
  state.activePrId = target.id;
  state.features = clone(target.draftFeatures);
  return true;
}

function leavePr(state) {
  syncCurrentDraft(state);
  state.activePrId = null;
  state.features = clone(state.looseDraftFeatures);
}

function flattenFeatureSet(features) {
  const rows = {};
  for (const feature of FEATURE_CATALOG) {
    const state = features[feature.id];
    rows[`${feature.id}.action`] = { label: `${feature.name} / 差分判断`, value: state.action };
    rows[`${feature.id}.confirmed`] = { label: `${feature.name} / 人間の確定`, value: state.confirmed ? '確定' : '仮置き' };
    for (const view of VIEW_DEFINITIONS) {
      rows[`${feature.id}.views.${view.id}`] = { label: `${feature.name} / ${view.label}`, value: state.views[view.id] || '' };
      for (const { node, depth } of flattenNodes(state.breakdown?.[view.id] || [])) {
        const link = node.link ? ` ⇄ ${node.link.viewId}/${node.link.featureId}${node.link.nodeId ? `/${node.link.nodeId}` : ''}` : '';
        rows[`${feature.id}.breakdown.${view.id}.${node.id}`] = { label: `${feature.name} / ${view.label} / 下位要求(第${depth}層)`, value: `${node.text}${link}` };
      }
    }
    for (const issue of state.issues) {
      rows[`${feature.id}.issues.${issue.id}.status`] = { label: `${feature.name} / ${issue.title} / 状態`, value: ISSUE_STATES[issue.status] };
      rows[`${feature.id}.issues.${issue.id}.answer`] = { label: `${feature.name} / ${issue.title} / 回答`, value: issue.answer || '' };
    }
  }
  return rows;
}

function diffFeatureSets(before, after) {
  const left = flattenFeatureSet(before);
  const right = flattenFeatureSet(after);
  return Object.keys({ ...left, ...right }).flatMap((key) => {
    const beforeValue = left[key]?.value ?? '';
    const afterValue = right[key]?.value ?? '';
    return beforeValue === afterValue ? [] : [{ key, label: right[key]?.label || left[key]?.label || key, before: beforeValue, after: afterValue }];
  });
}

function formatLocalDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getFeatureCompleteness(featureState) {
  const filledViews = VIEW_DEFINITIONS.filter((view) => String(featureState.views[view.id] || '').trim()).length;
  const actionChosen = featureState.action !== 'hold';
  return Math.round(((filledViews + Number(actionChosen) + Number(featureState.confirmed)) / 6) * 100);
}

function getOpenIssues(state) {
  return FEATURE_CATALOG.flatMap((feature) => state.features[feature.id].issues
    .filter((issue) => issue.status !== 'decided')
    .map((issue) => ({ ...issue, featureId: feature.id, featureName: feature.name })));
}

function getViewHealth(state) {
  return Object.fromEntries(VIEW_DEFINITIONS.map((view) => {
    const filled = FEATURE_CATALOG.filter((feature) => String(state.features[feature.id].views[view.id] || '').trim()).length;
    return [view.id, { filled, total: FEATURE_CATALOG.length }];
  }));
}

function findNextQuestion(featureState) {
  const emptyView = VIEW_DEFINITIONS.find((view) => !String(featureState.views[view.id] || '').trim());
  if (emptyView) return `${emptyView.label}の視点：${emptyView.question}`;
  const openIssue = featureState.issues.find((issue) => issue.status === 'open');
  if (openIssue) return `次に確かめる：${openIssue.prompt}`;
  const assumedIssue = featureState.issues.find((issue) => issue.status === 'assumed');
  if (assumedIssue) return `仮決定をレビューする：${assumedIssue.title}`;
  if (!featureState.confirmed) return '4視点を読み合わせ、この機能の判断を人間が確定してください。';
  return 'この機能に未決定事項はありません。別の機能を確認できます。';
}

function buildMarkdown(state) {
  const confirmed = FEATURE_CATALOG.filter((feature) => state.features[feature.id].confirmed);
  const provisional = FEATURE_CATALOG.filter((feature) => !state.features[feature.id].confirmed);
  const openIssues = getOpenIssues(state);
  const lines = [
    `# 要求入力 — ${state.project.title}`,
    '',
    '> 4視点ワークベンチから出力。確定済みと仮置きを分離している。',
    `> 確定ベースライン: Revision ${state.baselineRevision}${state.activePrId ? ` / 変更PR: ${state.activePrId}` : ' / PRなしの作業ドラフト'}`,
    '',
    '## 固定した境界',
    '',
    `- 対象事業所: freee開発用テスト事業所 \`${state.project.companyId}\``,
    '- freeeへのアクセス: MCP経由のGETのみ',
    '- freeeへの書き込み、仕訳、試算表、決算書は対象外',
    '',
    '## 目的の分解（5W1H）',
    '',
    `> 「${state.purpose.statement}」を、そのまま仕様にしない。`,
    '',
  ];

  for (const axis of PURPOSE_AXES) {
    const slots = PURPOSE_SLOTS.filter((slot) => slot.axis === axis.id);
    if (!slots.length) continue;
    lines.push(`### ${axis.label} — ${axis.jp}`, '');
    for (const slot of slots) {
      const answer = state.purpose.slots[slot.id];
      const target = purposeTargetOf(answer.targetId);
      const text = purposeAnswerText(state, slot.id) || '**未選択**';
      lines.push(`- [${ISSUE_STATES[answer.status]}] **${slot.title}**（${viewOf(slot.viewId).label}${target ? ` / ${target.label}` : ''}）: ${text}`);
      const choice = purposeChoiceOf(slot, answer.choiceId);
      if (choice) lines.push(`  - これを選ぶと: ${choice.note}`);
    }
    lines.push('');
  }

  lines.push(
    '## 4つの視点',
    '',
  );

  for (const view of VIEW_DEFINITIONS) {
    lines.push(`### ${view.label}`, '');
    const written = (list) => list.filter((feature) => {
      const featureState = state.features[feature.id];
      const rootText = String(featureState.views[view.id] || '').trim();
      return rootText || flattenNodes(featureState.breakdown[view.id]).some(({ node }) => node.text.trim());
    });
    const pushFeature = (feature) => {
      const featureState = state.features[feature.id];
      const given = isViewChanged(state, feature.id, view.id) ? '' : '（freee基準のまま）';
      const rootText = String(featureState.views[view.id] || '').trim();
      lines.push(`- **${feature.name}**${given}: ${rootText || '（本文は未記入。下位要求のみ）'}`);
      for (const { node, depth } of flattenNodes(featureState.breakdown[view.id])) {
        if (!node.text.trim()) continue;
        const link = node.link ? ` ⇄ ${describeLink(state, node.link)}` : '';
        lines.push(`${'  '.repeat(depth)}- ${node.text.trim()}${link}`);
      }
    };
    for (const feature of written(confirmed)) pushFeature(feature);
    const rest = written(provisional);
    if (rest.length) {
      lines.push('', '_以下は仮置き（人間の確定なし）_', '');
      for (const feature of rest) pushFeature(feature);
    }
    lines.push('');
  }

  lines.push('## 確定済みの機能判断', '');
  for (const feature of confirmed) {
    const action = DELTA_OPTIONS.find((option) => option.id === state.features[feature.id].action)?.label || '未分類';
    lines.push(`### ${feature.name} — ${action}`, '', feature.description, '', `- 根拠: ${feature.evidence}`, `- 接点: \`${feature.source}\``, '');
  }

  lines.push('## 仮置き（仕様として未確定）', '');
  if (!provisional.length) lines.push('- なし', '');
  for (const feature of provisional) {
    const action = DELTA_OPTIONS.find((option) => option.id === state.features[feature.id].action)?.label || '未分類';
    lines.push(`- **${feature.name}**: ${action}（人間による確定が必要）`);
  }
  lines.push('');

  lines.push('## Clarifications', '');
  if (!openIssues.length) lines.push('- なし', '');
  for (const issue of openIssues) {
    const answer = issue.answer.trim() ? ` 現在の回答: ${issue.answer.trim()}` : '';
    lines.push(`- [${ISSUE_STATES[issue.status]}] **${issue.featureName} / ${issue.title}**: ${issue.prompt}${answer}`);
  }
  lines.push('');

  lines.push('## トレーサビリティ', '', '| 機能 | freee／外部 | 差分判断 | 確定 |', '|---|---|---|---|');
  for (const feature of FEATURE_CATALOG) {
    const featureState = state.features[feature.id];
    const action = DELTA_OPTIONS.find((option) => option.id === featureState.action)?.label || '未分類';
    lines.push(`| ${feature.name} | ${feature.product} | ${action} | ${featureState.confirmed ? '確定' : '仮置き'} |`);
  }
  lines.push('', '## 成功条件の素材', '', '- 前日分の労務費が翌朝の時点で見えている割合を100%にする。', '- 集計に失敗した場合も翌朝の時点で失敗が分かる。', '- 工数の入力率そのものは成功指標にしない。', '');
  return lines.join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function featureKindLabel(kind) {
  if (kind === 'verified') return 'API確認済み';
  if (kind === 'local') return '外部で作る候補';
  return '要確認';
}

function renderFeatureList(state) {
  return FEATURE_CATALOG.map((feature) => {
    const featureState = state.features[feature.id];
    const changed = countFeatureChanges(state, feature.id);
    return `
      <button class="feature-button${changed ? ' is-changed' : ''}" type="button" data-action="select-feature" data-feature-id="${feature.id}" aria-current="${feature.id === state.selectedFeatureId}">
        <i class="dot ${feature.kind}"></i>
        <span class="feature-name">${escapeHtml(feature.name)}<span class="feature-product">${escapeHtml(feature.product)}</span></span>
        <span class="feature-status">${featureState.confirmed ? '確定' : changed ? `✲ ${changed}` : 'freee基準'}</span>
      </button>`;
  }).join('');
}

function renderLinkSelect(state, feature, view, node, disabled) {
  const groups = listLinkTargets(state, view.id).map((group) => `
    <optgroup label="${group.viewLabel}">
      ${group.options.map((option) => `<option value="${option.value}" ${node.link && `${node.link.viewId}:${node.link.featureId}:${node.link.nodeId}` === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
    </optgroup>`).join('');
  return `
    <select class="quad-node-link" data-field="node-link" data-feature-id="${feature.id}" data-view-id="${view.id}" data-node-id="${node.id}" aria-label="別の視点へ渡す先" ${disabled}>
      <option value="">⇄ 渡す先なし</option>
      ${groups}
    </select>`;
}

function renderBreakdownNodes(state, feature, view, nodes, disabled, depth = 1) {
  return nodes.map((node) => {
    const fromBaseline = isBaselineNodeText(feature.id, view.id, node.text);
    return `
    <li class="quad-node${fromBaseline ? ' is-base' : ' is-added'}" data-depth="${depth}">
      <div class="quad-node-row">
        <span class="quad-node-mark${fromBaseline ? '' : ' is-added'}" aria-hidden="true" title="${fromBaseline ? 'freeeが今実現していること' : '人が足した行'}">${fromBaseline ? '●' : '✲'}</span>
        <input class="quad-node-text" id="node-${node.id}" data-field="node-text" data-feature-id="${feature.id}" data-view-id="${view.id}" data-node-id="${node.id}"
               value="${escapeHtml(node.text)}" placeholder="下位の要求を1行で" aria-label="${view.label}の下位要求" ${disabled}>
        ${depth < BREAKDOWN_MAX_DEPTH ? `<button class="quad-node-button" type="button" data-action="add-node" data-feature-id="${feature.id}" data-view-id="${view.id}" data-parent-id="${node.id}" title="さらに分解する" ${disabled}>＋</button>` : ''}
        <button class="quad-node-button danger" type="button" data-action="remove-node" data-feature-id="${feature.id}" data-view-id="${view.id}" data-node-id="${node.id}" title="この行を削除" ${disabled}>×</button>
      </div>
      ${node.text.trim() ? renderLinkSelect(state, feature, view, node, disabled) : ''}
      ${node.link ? `<p class="quad-node-link-label">⇄ ${escapeHtml(describeLink(state, node.link))}</p>` : ''}
      ${node.children.length ? `<ul class="quad-node-children">${renderBreakdownNodes(state, feature, view, node.children, disabled, depth + 1)}</ul>` : ''}
    </li>`;
  }).join('');
}

function renderQuadIssues(state, feature, view, disabled) {
  const issues = state.features[feature.id].issues.filter((issue) => (issue.viewId || 'system') === view.id);
  if (!issues.length) return '';
  return `
    <div class="quad-issues">
      ${issues.map((issue) => `
        <div class="issue-row">
          <div class="issue-copy">
            <strong>${escapeHtml(issue.title)}</strong>
            <p>${escapeHtml(issue.prompt)}</p>
            <textarea data-field="issue-answer" data-feature-id="${feature.id}" data-issue-id="${issue.id}" aria-label="${escapeHtml(issue.title)}への回答" placeholder="判断、具体例、根拠を記入" ${disabled}>${escapeHtml(issue.answer)}</textarea>
          </div>
          <select class="issue-state" data-field="issue-status" data-feature-id="${feature.id}" data-issue-id="${issue.id}" aria-label="${escapeHtml(issue.title)}の状態" ${disabled}>
            ${Object.entries(ISSUE_STATES).map(([id, label]) => `<option value="${id}" ${issue.status === id ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>`;
}

function renderQuadFlags(feature, view, changed, openIssues, disabled) {
  return `
    ${openIssues ? `<span class="quad-open">未決定 ${openIssues}</span>` : ''}
    <span class="quad-flag${changed ? '' : ' is-base'}">${changed ? '✲ 変更あり' : 'freee基準のまま'}</span>
    ${changed ? `<button class="quad-reset" type="button" data-action="reset-view" data-feature-id="${feature.id}" data-view-id="${view.id}" title="この視点をfreee基準へ戻す" ${disabled}>↺</button>` : ''}`;
}

function renderQuadrant(state, feature, view, disabled) {
  const featureState = state.features[feature.id];
  const value = String(featureState.views[view.id] || '');
  const baseline = feature.baseline[view.id] || '';
  const baseNodes = baselineBreakdownOf(feature.id)[view.id];
  const changed = isViewChanged(state, feature.id, view.id);
  const active = view.id === state.activeViewId;
  const openIssues = featureState.issues.filter((issue) => (issue.viewId || 'system') === view.id && issue.status !== 'decided').length;
  return `
    <article class="quad quad-${view.id}${changed ? ' is-changed' : ''}${active ? ' is-active' : ''}" data-view-id="${view.id}">
      <header class="quad-head">
        <h3><span class="quad-index" aria-hidden="true"></span>${view.label}</h3>
        <div class="quad-flags">${renderQuadFlags(feature, view, changed, openIssues, disabled)}</div>
      </header>
      <p class="quad-question">${view.question}</p>
      <textarea class="quad-text" id="view-${view.id}" data-field="view" data-feature-id="${feature.id}" data-view-id="${view.id}"
                aria-label="${escapeHtml(feature.name)}の${view.label}" placeholder="${escapeHtml(view.question)}" ${disabled}>${escapeHtml(value)}</textarea>
      ${changed && baseline ? `
      <details class="quad-baseline">
        <summary>freeeが今実現していること</summary>
        <p>${escapeHtml(baseline)}</p>
        ${baseNodes.length ? `<ul>${flattenNodes(baseNodes).map(({ node, depth: d }) => `<li data-depth="${d}">${escapeHtml(node.text)}</li>`).join('')}</ul>` : ''}
      </details>` : ''}
      <ul class="quad-nodes">${renderBreakdownNodes(state, feature, view, featureState.breakdown[view.id], disabled)}</ul>
      <button class="quad-add" type="button" data-action="add-node" data-feature-id="${feature.id}" data-view-id="${view.id}" data-parent-id="" ${disabled}>＋ 下位要求へ分解する</button>
      ${renderQuadIssues(state, feature, view, disabled)}
    </article>`;
}

function renderChainBand(state, feature) {
  return `
    <div class="chain-band" aria-label="4視点の連鎖">
      ${VIEW_DEFINITIONS.map((view, index) => {
        const changed = isViewChanged(state, feature.id, view.id);
        const active = view.id === state.activeViewId;
        return `${index ? '<span class="chain-arrow" aria-hidden="true">▸</span>' : ''}
        <button class="chain-step${changed ? ' is-changed' : ''}${active ? ' is-active' : ''}" type="button" data-action="focus-view" data-view-id="${view.id}">
          <strong>${view.label}</strong>
          <span>${changed ? '変更あり' : 'freee基準'}</span>
        </button>`;
      }).join('')}
    </div>`;
}

function renderFeatureDetail(state) {
  const feature = featureOf(state.selectedFeatureId);
  const featureState = state.features[feature.id];
  const activePr = state.pullRequests.find((pr) => pr.id === state.activePrId);
  const readOnly = Boolean(activePr && activePr.status !== 'open');
  const disabled = readOnly ? 'disabled' : '';
  const changedViews = countFeatureChanges(state, feature.id);
  const actionOptions = DELTA_OPTIONS.map((option) => `
    <label class="delta-option">
      <input type="radio" name="delta-action" value="${option.id}" data-field="action" data-feature-id="${feature.id}" ${featureState.action === option.id ? 'checked' : ''} ${disabled}>
      <span>${option.label}</span>
    </label>`).join('');

  return `
    ${readOnly ? `<p class="readonly-notice">このPRは${activePr.status === 'merged' ? 'マージ済み' : '取り下げ済み'}です。編集するには変更履歴から再オープンしてください。</p>` : ''}
    <div class="feature-header">
      <div>
        <p class="section-kicker">STEP 2 — freeeが今実現していることから、どう変えるか</p>
        <h2>${escapeHtml(feature.name)}</h2>
        <p>${escapeHtml(feature.description)}</p>
        <div class="feature-meta">
          <span class="tag ${feature.freeeGiven ? 'green' : feature.kind === 'local' ? '' : 'orange'}">${feature.freeeGiven ? 'freee実装済み' : featureKindLabel(feature.kind)}</span>
          <span class="tag gray">${escapeHtml(feature.product)}</span>
          <span class="tag ${changedViews ? 'orange' : ''}">${changedViews ? `✲ ${changedViews}視点を変更` : 'freee基準のまま'}</span>
        </div>
      </div>
      <div class="confirmation">
        <button class="button button-confirm ${featureState.confirmed ? 'is-confirmed' : ''}" type="button" data-action="toggle-confirmed" data-feature-id="${feature.id}" ${disabled}>
          ${featureState.confirmed ? '✓ 人間が確定済み' : 'この判断を確定する'}
        </button>
        <button class="button button-quiet" type="button" data-action="reset-feature" data-feature-id="${feature.id}" ${changedViews ? '' : 'disabled'} ${disabled}>freee基準に戻す</button>
      </div>
    </div>

    <div class="evidence-strip"><strong>根拠</strong><span>${escapeHtml(feature.evidence)}</span><code>${escapeHtml(feature.source)}</code></div>

    <section class="delta-section" aria-labelledby="delta-title">
      <div class="subheading"><h3 id="delta-title">この機能をどう扱うか</h3><p>白紙ではなく、現在との差分を選びます</p></div>
      <div class="delta-options">${actionOptions}</div>
    </section>

    <section class="quad-board" aria-label="目標・人間・システム・データの4視点">
      ${VIEW_DEFINITIONS.map((view) => renderQuadrant(state, feature, view, disabled)).join('')}
    </section>

    ${renderChainBand(state, feature)}

    <div class="analysis-footer">
      <div class="next-question"><strong>AIが次に聞くなら：</strong> ${escapeHtml(findNextQuestion(featureState))}</div>
      <button class="button button-quiet" type="button" data-action="copy-summary" data-feature-id="${feature.id}">この機能をコピー</button>
    </div>`;
}

const VIEW_MAP_CELLS = {
  goal: { points: '270,0 135,234 405,234', x: 270, y: 146 },
  system: { points: '135,234 405,234 270,468', x: 270, y: 312 },
  human: { points: '135,234 0,468 270,468', x: 135, y: 388 },
  data: { points: '405,234 270,468 540,468', x: 405, y: 388 },
};

function viewFillLevel(changes, viewId) {
  const { changed, total } = changes[viewId];
  if (!changed) return 'is-empty';
  return changed >= total ? 'is-full' : 'is-partial';
}

function renderViewMapFigure(state) {
  const changes = getViewChanges(state);
  const feature = featureOf(state.selectedFeatureId);
  const cells = VIEW_DEFINITIONS.map((view) => {
    const cell = VIEW_MAP_CELLS[view.id];
    const active = view.id === state.activeViewId;
    const here = isViewChanged(state, feature.id, view.id);
    return `
      <polygon class="view-cell view-cell-${view.id} ${viewFillLevel(changes, view.id)}${active ? ' is-active' : ''}" points="${cell.points}"
               data-action="focus-view" data-view-id="${view.id}" role="button" tabindex="-1">
        <title>${view.label} — ${feature.name}は${here ? 'freee基準から変更あり' : 'freee基準のまま'}（全体で${changes[view.id].changed}/${changes[view.id].total}機能が変更）</title>
      </polygon>`;
  }).join('');
  const labels = VIEW_DEFINITIONS.map((view) => {
    const cell = VIEW_MAP_CELLS[view.id];
    return `
      <text class="view-label view-label-${view.id}${view.id === state.activeViewId ? ' is-active' : ''}" x="${cell.x}" y="${cell.y}">${view.label}</text>
      <text class="view-count" x="${cell.x}" y="${cell.y + 26}">${changes[view.id].changed}/${changes[view.id].total}</text>`;
  }).join('');
  return `
    <svg viewBox="-8 -8 556 484" role="img" aria-label="目標を頂点に、システム・人間・データを配置した4視点の図">
      <defs>
        <marker id="view-arrowhead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
          <path d="M0,0 L10,4 L0,8 z" />
        </marker>
      </defs>
      ${cells}${labels}
      <line class="view-arrow" x1="270" y1="190" x2="270" y2="272" />
      <line class="view-arrow" x1="226" y1="194" x2="154" y2="344" />
      <line class="view-arrow" x1="314" y1="194" x2="386" y2="344" />
    </svg>
    <figcaption>数字はfreee基準から変更した機能数。面を押すと、その視点へ移動します。</figcaption>`;
}

function renderViewMapLegend(state) {
  const changes = getViewChanges(state);
  const feature = featureOf(state.selectedFeatureId);
  const rows = VIEW_DEFINITIONS.map((view) => {
    const active = view.id === state.activeViewId;
    const here = isViewChanged(state, feature.id, view.id);
    return `
      <button class="view-map-row${active ? ' is-active' : ''}" type="button" data-action="focus-view" data-view-id="${view.id}" aria-current="${active}">
        <span class="view-map-dot ${viewFillLevel(changes, view.id)}" aria-hidden="true"></span>
        <span class="view-map-row-copy">
          <strong>${view.label}<em>変更 ${changes[view.id].changed}/${changes[view.id].total}</em></strong>
          <span class="view-map-row-note">${escapeHtml(feature.name)}: ${here ? '✲ 変更あり' : 'freee基準のまま'}</span>
        </span>
        <span class="view-map-state">${active ? '選択中' : '開く'}</span>
      </button>`;
  }).join('');
  return `<p class="view-map-selected">freeeが今実現している姿を出発点に、変えたところだけが色づきます。</p>${rows}`;
}

/*
 * STEP 0 — 目的文を、選ぶだけで具体にする。
 * 「前日の労務費を、翌朝までに見えるようにする」はそのままでは作れない。
 * ただし freee を前提にするなら、対象も取りうる答えも既に分かっている。
 * だから白紙で書かせず、「freeeのどこを」→「どうしたいか」を選んでもらう。書くのは補足だけ。
 */
const PURPOSE_AXES = [
  { id: 'why', label: 'Why', jp: '何のために' },
  { id: 'who', label: 'Who', jp: '誰が・誰の' },
  { id: 'what', label: 'What', jp: '何を' },
  { id: 'when', label: 'When', jp: 'いつ' },
  { id: 'where', label: 'Where', jp: 'どこで・どの単位で' },
  { id: 'how', label: 'How', jp: 'どのように・いくらで' },
];

/* freeeのどこの話か。すべて検証済みの事実に対応している */
const PURPOSE_TARGETS = [
  { id: 'work-records', featureId: 'work-records', label: 'freeeの勤怠', note: '日付・従業員ごとに所定/時間外/深夜/休日の分数を持つ。GETで取得確認済み。' },
  { id: 'payroll', featureId: 'payroll-rate', label: 'freeeの給与', note: '月単位の確定給与を持つ。日次へ割れる単価はfreeeにない。' },
  { id: 'sections', featureId: 'sections', label: 'freee会計の部門', note: '部門の一覧をGETで取得確認済み。案件・工程という軸は持たない。' },
  { id: 'books', featureId: 'accounting-books', label: 'freeeの帳簿', note: '仕訳・試算表・決算書。確定した数字の器で、日次の概算は載せない。' },
  { id: 'allocation', featureId: 'allocation', label: '外部の配分記録', note: 'freeeにない。勤務分数を案件・工程へ割り当てる新しい記録。' },
  { id: 'daily-cost', featureId: 'daily-cost', label: '外部の日次労務費', note: 'freeeにない。予定単価×分数で毎日計算する概算値。' },
  { id: 'people', featureId: null, label: 'freeeの外（人の決めごと）', note: 'システムの話ではなく、人が決めること。' },
];

const PURPOSE_SLOTS = [
  {
    id: 'why-purpose',
    axis: 'why',
    viewId: 'goal',
    fragment: '見えるようにする',
    title: '何のために見えるようにするのか',
    prompt: '見えた結果、何が変わるのか。ここが空のまま作ると、誰も開かない画面ができる。',
    targets: ['people'],
    choices: [
      { id: 'find-red', label: '赤字になりかけた案件を、早く見つける', note: '月末の確定を待たずに気づくことが目的になる。精度より速さを優先する。' },
      { id: 'estimate-gap', label: '見積と実績のずれを、早く知る', note: '案件ごとの見積値を外部に持つ必要が出る。' },
      { id: 'assign-people', label: '誰をどの案件に張るかを、決める', note: '人単位・案件単位の両方で見える必要が出る。' },
      { id: 'billing-evidence', label: '請求や原価の裏付けを、手元に持つ', note: '正確さが要る。概算のままでは足りなくなる。' },
      { id: 'close-faster', label: '月末の締め作業を、減らす', note: '日次の入力が月次集計にそのまま使えることが条件になる。' },
    ],
  },
  {
    id: 'why-decision',
    axis: 'why',
    viewId: 'goal',
    fragment: '見えるようにする',
    title: '見た結果、何を決めるのか',
    prompt: '数字を見て下す判断を1つ選ぶ。判断が言えないなら、その数字は要らない。',
    targets: ['people'],
    choices: [
      { id: 'staffing', label: 'この案件に、これ以上人を張るかどうか', note: '案件別の累計と、残りの見込みが要る。' },
      { id: 'extra-charge', label: '追加費用を客先に相談するかどうか', note: '見積との差が説明できる形で要る。' },
      { id: 'stop-work', label: '見積の範囲を超えた作業を、止めるかどうか', note: '案件別の上限を持つ必要が出る。' },
      { id: 'fix-estimate', label: '次からの見積の作り方を、直すかどうか', note: '日次より、案件が終わったあとの振り返りが主になる。' },
      { id: 'none', label: '決めることは、いまは無い', note: 'この場合、この機能自体を作る必要がない。まずここを疑う。' },
    ],
  },
  {
    id: 'why-action',
    axis: 'why',
    viewId: 'human',
    fragment: '見えるようにする',
    title: 'その判断のあと、何をするのか',
    prompt: '判断の次に起きる行動。行動が変わらないなら、見えても意味がない。',
    targets: ['people'],
    choices: [
      { id: 'reassign', label: '担当の割り当てを変える', note: '人×案件の予定が要る。実績だけでは足りない。' },
      { id: 'talk-client', label: '客先に連絡して、費用や納期を相談する', note: '相手に出せる粒度の資料が要る。' },
      { id: 'stop-scope', label: '作業範囲を止める・絞る', note: '止める判断が現場に伝わる導線が要る。' },
      { id: 'fix-template', label: '見積のやり方を直す', note: '案件が終わったあとの集計が主になる。日次でなくてよい可能性がある。' },
      { id: 'record-only', label: '記録を残すだけ（すぐには動かない）', note: 'それなら翌朝である必要はない。締切を緩められる。' },
    ],
  },
  {
    id: 'who-viewer',
    axis: 'who',
    viewId: 'human',
    fragment: '見えるようにする',
    title: '誰が見るのか',
    prompt: '見る人が1人か複数か、役割が違う人が混ざるかで、作るものが変わる。',
    targets: ['people'],
    choices: [
      { id: 'owner-only', label: '経営者本人だけ', note: '承認も権限分けも要らない。いちばん軽い。' },
      { id: 'owner-staff', label: '経営者と、現場の担当者', note: '入力する人と見る人が分かれる。入力の動機づけが要る。' },
      { id: 'with-accounting', label: '経理担当も見る', note: '確定値との違いを、誤解されない形で示す必要が出る。' },
      { id: 'client', label: '客先にも出す', note: '外へ出せる正確さと体裁が要る。概算のままでは出せない。' },
    ],
  },
  {
    id: 'who-subject',
    axis: 'who',
    viewId: 'data',
    fragment: '労務',
    title: '誰の労務費か',
    prompt: '対象になる「働いた人」の範囲。freeeの勤怠に載っている人と、載っていない人がいる。',
    targets: ['work-records', 'people'],
    choices: [
      { id: 'employees', label: 'freeeに登録している従業員だけ', note: 'freeeの勤怠だけで完結する。いちばん確実。' },
      { id: 'with-officers', label: '役員も含める', note: '役員報酬は勤怠と結び付かない。単価の決め方を別に用意する。' },
      { id: 'with-contractors', label: '外注・委託も含める', note: 'freeeの勤怠に無い。工数の入力元を外部に作る必要が出る。' },
      { id: 'some-employees', label: '一部の従業員だけ', note: '対象者の指定を外部に持つ。誰を含めるかの管理が増える。' },
    ],
  },
  {
    id: 'what-cost',
    axis: 'what',
    viewId: 'data',
    fragment: '労務費',
    title: '労務費とは何か（時間 × いくら）',
    prompt: '労務費＝働いた時間 × 賃金。どの賃金で換算するかを選ぶ。',
    targets: ['work-records', 'payroll', 'daily-cost'],
    choices: [
      { id: 'planned-base', label: '予定単価（基本給ベースの時間単価）× 分数', note: 'いちばん単純。確定給与とはずれる。ずれは月末に出る。' },
      { id: 'planned-loaded', label: '予定単価（賞与・社会保険の会社負担込み）× 分数', note: '実際の負担に近いが、単価の算出根拠を残す必要が出る。' },
      { id: 'actual-split', label: '確定した給与を、あとから按分する', note: '正確だが月次まで待つ。「翌朝までに」と両立しない。' },
      { id: 'flat-rate', label: '全員一律の単価を使う', note: '個人の給与を扱わずに済む。案件間の比較には足りる場合がある。' },
    ],
  },
  {
    id: 'what-evidence',
    axis: 'what',
    viewId: 'data',
    fragment: '労務費',
    title: 'その数字の裏付けは何を残すか',
    prompt: '見えた金額を疑われたとき、何をたどれば説明できるか。',
    targets: ['allocation', 'daily-cost', 'work-records'],
    choices: [
      { id: 'full-trace', label: '日付・従業員・案件・分数・適用単価の5点を残す', note: '1件ずつ説明できる。記録は増えるが、あとで困らない。' },
      { id: 'daily-total', label: '日ごとの集計結果だけ残す', note: '軽いが、「なぜこの額か」を説明できない。' },
      { id: 'link-only', label: 'freeeの勤怠へ戻れるIDだけ持つ', note: 'freee側が変わると過去の数字も変わる。締めた分は固定するか決める。' },
    ],
  },
  {
    id: 'when-day',
    axis: 'when',
    viewId: 'data',
    fragment: '前日',
    title: '「前日」とは、どこからどこまでか',
    prompt: '日を跨いだ勤務を、どちらの日に入れるか。ここを決めないと数字が合わない。',
    targets: ['work-records'],
    choices: [
      { id: 'freee-workday', label: 'freeeの勤務日に合わせる（打刻を開始した日）', note: 'freeeと同じ数字になる。突き合わせが楽。既定にすべき。' },
      { id: 'end-day', label: '終業した日に寄せる', note: 'freeeと日付がずれる。毎回の変換が要る。' },
      { id: 'midnight', label: '24時で切って、日ごとに分ける', note: '深夜勤務を2日に割る。freeeの分数をそのまま使えない。' },
      { id: 'custom-cutoff', label: '別の締め時刻を決める（例：朝5時）', note: '夜勤がある場合に有効。変換規則を1か所に持つ。' },
    ],
  },
  {
    id: 'when-deadline',
    axis: 'when',
    viewId: 'system',
    fragment: '翌朝までに',
    title: '「翌朝までに」とは何時か',
    prompt: '何時までに出ていれば要件を満たすか。間に合わなかったことも分かる必要がある。',
    targets: ['daily-cost'],
    choices: [
      { id: '0800', label: '平日 8:00 まで', note: '前夜のうちに計算を回す。失敗しても直す時間がない。' },
      { id: '0830', label: '平日 8:30 まで', note: '始業前に見る前提。失敗時のやり直しが1回できる。' },
      { id: '0900', label: '平日 9:00 まで', note: '始業と同時。遅れると使われなくなる。' },
      { id: 'before-start', label: '始業前ならいつでもよい', note: '時刻を決めないと、遅れを検知できない。' },
      { id: 'no-deadline', label: '時刻は決めない', note: '「翌朝までに」を目標から外すことになる。ここは要注意。' },
    ],
  },
  {
    id: 'where-unit',
    axis: 'where',
    viewId: 'data',
    fragment: '労務費',
    title: 'どの単位で分けて見るのか',
    prompt: '案件か、工程か、部門か、人か。分ける軸が、そのまま作る記録になる。',
    targets: ['sections', 'allocation'],
    choices: [
      { id: 'freee-sections', label: 'freee会計の部門をそのまま使う', note: '新しい記録が要らない。ただし案件ごとには見えない。' },
      { id: 'external-projects', label: '外部に案件を作って、案件別に見る', note: '本命の差分。案件マスタと配分記録が要る。' },
      { id: 'project-process', label: '案件＋工程の2階層で見る', note: '入力の手間が倍になる。工程を持つ価値があるか先に確かめる。' },
      { id: 'person-only', label: '人単位だけで見る', note: '案件を作らずに済む。ただし「何の仕事か」は分からないままになる。' },
    ],
  },
  {
    id: 'how-form',
    axis: 'how',
    viewId: 'human',
    fragment: '見えるようにする',
    title: 'どの形で見えるのか',
    prompt: '見に行くのか、届くのか。毎日開く価値があるかで変わる。',
    targets: ['daily-cost', 'people'],
    choices: [
      { id: 'daily-list', label: '案件別の一覧を、朝に開く', note: '見に行く運用。開かなくなると価値が消える。' },
      { id: 'single-number', label: '合計を1つだけ見る', note: 'いちばん軽い。ただし案件別の判断はできない。' },
      { id: 'alert-only', label: '異常なとき（未配分・超過）だけ知らせる', note: '毎朝見る必要がなくなる。しきい値を決める必要が出る。' },
      { id: 'push', label: 'メールやチャットで届く', note: '外部への送信が増える。宛先と失敗時の扱いを決める。' },
    ],
  },
  {
    id: 'how-precision',
    axis: 'how',
    viewId: 'data',
    fragment: '労務費',
    title: 'いくらの精度でよいのか',
    prompt: '概算でよいのか、確定と一致すべきか。ここは目的で決まる。',
    targets: ['daily-cost', 'books'],
    choices: [
      { id: 'rough-with-variance', label: '概算でよい。月末に確定との差を1行で残す', note: '日次は管理用、月次は会計用と分けられる。既定に向く。' },
      { id: 'rough-only', label: '概算でよい。差は追わない', note: 'いちばん軽い。ただし数字の信頼は上がらない。' },
      { id: 'must-match', label: '確定給与と一致させる', note: '月次確定を待つことになり、「翌朝までに」と両立しない。' },
    ],
  },
];

function purposeTargetOf(targetId) {
  return PURPOSE_TARGETS.find((target) => target.id === targetId) || null;
}

function purposeSlotOf(slotId) {
  return PURPOSE_SLOTS.find((slot) => slot.id === slotId) || null;
}

function purposeChoiceOf(slot, choiceId) {
  return slot.choices.find((choice) => choice.id === choiceId) || null;
}

function createPurposeState() {
  return {
    statement: '前日の労務費を、翌朝までに見えるようにする',
    slots: Object.fromEntries(PURPOSE_SLOTS.map((slot) => [slot.id, {
      targetId: slot.targets.length === 1 ? slot.targets[0] : '',
      choiceId: '',
      note: '',
      status: 'open',
    }])),
  };
}

function normalizePurpose(candidate) {
  const purpose = createPurposeState();
  if (!candidate || typeof candidate !== 'object') return purpose;
  if (typeof candidate.statement === 'string' && candidate.statement.trim()) purpose.statement = candidate.statement;
  for (const slot of PURPOSE_SLOTS) {
    const saved = candidate.slots?.[slot.id];
    if (!saved || typeof saved !== 'object') continue;
    const answer = purpose.slots[slot.id];
    if (slot.targets.includes(saved.targetId)) answer.targetId = saved.targetId;
    if (slot.choices.some((choice) => choice.id === saved.choiceId)) answer.choiceId = saved.choiceId;
    if (typeof saved.note === 'string') answer.note = saved.note;
    if (Object.hasOwn(ISSUE_STATES, saved.status)) answer.status = saved.status;
  }
  return purpose;
}

/* 選んだ時点で仮決定。人が確かめたら決定済みへ上げる */
function choosePurposeOption(state, slotId, choiceId) {
  const slot = purposeSlotOf(slotId);
  const answer = state.purpose.slots[slotId];
  if (!slot || !answer) return false;
  if (!slot.choices.some((choice) => choice.id === choiceId)) return false;
  answer.choiceId = answer.choiceId === choiceId ? '' : choiceId;
  if (!answer.choiceId) answer.status = 'open';
  else if (answer.status === 'open') answer.status = 'assumed';
  return true;
}

function setPurposeTarget(state, slotId, targetId) {
  const slot = purposeSlotOf(slotId);
  if (!slot || !slot.targets.includes(targetId)) return false;
  state.purpose.slots[slotId].targetId = targetId;
  return true;
}

function purposeAnswerText(state, slotId) {
  const slot = purposeSlotOf(slotId);
  const answer = state.purpose.slots[slotId];
  const choice = purposeChoiceOf(slot, answer.choiceId);
  if (!choice) return '';
  return answer.note.trim() ? `${choice.label}（${answer.note.trim()}）` : choice.label;
}

function getPurposeProgress(state) {
  const slots = PURPOSE_SLOTS.map((slot) => state.purpose.slots[slot.id]);
  return {
    total: PURPOSE_SLOTS.length,
    decided: slots.filter((slot) => slot.status === 'decided').length,
    assumed: slots.filter((slot) => slot.status === 'assumed').length,
    open: slots.filter((slot) => !slot.choiceId).length,
  };
}

/* 次に選ぶべき1つ。Why（何のために・判断・行動）を先に埋めさせる */
function findNextPurposeSlot(state) {
  return PURPOSE_SLOTS.find((slot) => !state.purpose.slots[slot.id].choiceId)
    || PURPOSE_SLOTS.find((slot) => state.purpose.slots[slot.id].status !== 'decided')
    || null;
}

function renderPurposeChain(state) {
  const chain = [
    { id: 'why-purpose', caption: '何のために' },
    { id: 'why-decision', caption: '見て決めること' },
    { id: 'why-action', caption: 'そのあとの行動' },
  ];
  return `
    <div class="purpose-chain" aria-label="見る・判断する・行動する">
      ${chain.map((item, index) => {
        const answer = state.purpose.slots[item.id];
        const choice = purposeChoiceOf(purposeSlotOf(item.id), answer.choiceId);
        return `${index ? '<span class="purpose-chain-arrow" aria-hidden="true">▶</span>' : ''}
        <button class="purpose-chain-step${choice ? ' is-filled' : ''}" type="button" data-action="focus-slot" data-slot-id="${item.id}">
          <span>${item.caption}</span>
          <strong>${choice ? escapeHtml(choice.label) : '未選択 — ここが空だと作れない'}</strong>
        </button>`;
      }).join('')}
    </div>`;
}

function renderPurposeSlot(state, slot) {
  const answer = state.purpose.slots[slot.id];
  const view = viewOf(slot.viewId);
  const chosen = purposeChoiceOf(slot, answer.choiceId);
  const target = purposeTargetOf(answer.targetId);
  const targets = slot.targets.map((targetId) => {
    const item = purposeTargetOf(targetId);
    return `
      <button class="slot-target${answer.targetId === targetId ? ' is-selected' : ''}" type="button" data-action="pick-target" data-slot-id="${slot.id}" data-target-id="${targetId}">
        ${escapeHtml(item.label)}
      </button>`;
  }).join('');
  const choices = slot.choices.map((choice) => `
    <button class="slot-choice${answer.choiceId === choice.id ? ' is-selected' : ''}" type="button" data-action="pick-choice" data-slot-id="${slot.id}" data-choice-id="${choice.id}">
      <span class="slot-choice-mark" aria-hidden="true"></span>
      <span class="slot-choice-copy">
        <strong>${escapeHtml(choice.label)}</strong>
        <em>${escapeHtml(choice.note)}</em>
      </span>
    </button>`).join('');
  return `
    <article class="slot slot-${answer.status}${chosen ? ' is-filled' : ''}" id="slot-${slot.id}">
      <header class="slot-head">
        <h4>${escapeHtml(slot.title)}</h4>
        <div class="slot-flags">
          <span class="slot-view slot-view-${view.id}">${view.label}へ</span>
          <span class="slot-fragment">「${escapeHtml(slot.fragment)}」</span>
        </div>
      </header>
      <p class="slot-prompt">${escapeHtml(slot.prompt)}</p>
      <div class="slot-targets">
        <span class="slot-targets-label">freeeのどこ</span>
        ${targets}
      </div>
      ${target ? `<p class="slot-note"><strong>${escapeHtml(target.label)}</strong>${escapeHtml(target.note)}</p>` : ''}
      <div class="slot-choices" id="answer-${slot.id}" role="group" aria-label="${escapeHtml(slot.title)}の選択肢">${choices}</div>
      ${chosen ? `
      <div class="slot-tail">
        <input class="slot-note-input" data-field="purpose-note" data-slot-id="${slot.id}" value="${escapeHtml(answer.note)}"
               placeholder="補足があれば（任意）" aria-label="${escapeHtml(slot.title)}の補足">
        <select data-field="purpose-status" data-slot-id="${slot.id}" aria-label="${escapeHtml(slot.title)}の状態">
          ${Object.entries(ISSUE_STATES).map(([id, label]) => `<option value="${id}" ${answer.status === id ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>` : ''}
    </article>`;
}

function renderPurposeSlots(state) {
  return PURPOSE_AXES.map((axis) => {
    const slots = PURPOSE_SLOTS.filter((slot) => slot.axis === axis.id);
    if (!slots.length) return '';
    return `
      <section class="purpose-axis" aria-label="${axis.label}">
        <h3 class="purpose-axis-head"><span class="purpose-axis-tag">${axis.label}</span>${axis.jp}</h3>
        ${slots.map((slot) => renderPurposeSlot(state, slot)).join('')}
      </section>`;
  }).join('');
}

function renderPurposeProgress(state) {
  const progress = getPurposeProgress(state);
  const next = findNextPurposeSlot(state);
  return `
    <div class="purpose-counts">
      <span class="purpose-count${progress.open ? ' is-open' : ''}"><strong>${progress.open}</strong>未選択</span>
      <span class="purpose-count"><strong>${progress.assumed}</strong>仮決定</span>
      <span class="purpose-count"><strong>${progress.decided}</strong>決定済み<em>/ ${progress.total}</em></span>
    </div>
    ${next ? `
    <button class="button button-primary" type="button" data-action="next-slot" data-slot-id="${next.id}">
      次の問いへ
    </button>` : '<span class="tag green">分解は埋まりました</span>'}`;
}

function renderPurpose(state) {
  const next = findNextPurposeSlot(state);
  return `
    <div class="purpose-head">
      <div>
        <p class="section-kicker">STEP 0 — 目的文を、選ぶだけで具体にする</p>
        <h2 id="purpose-title">「${escapeHtml(state.purpose.statement)}」</h2>
        <p>この一文はこのままでは作れません。ただしfreeeを前提にするなら、<b>対象も、取りうる答えも既に分かっています</b>。書くのではなく、「freeeのどこを」→「どうしたいか」を選んでください。選ぶと、その先に何が必要になるかが出ます。</p>
      </div>
      <div class="purpose-progress" id="purpose-progress">${renderPurposeProgress(state)}</div>
    </div>
    ${renderPurposeChain(state)}
    ${next ? `<p class="purpose-next"><strong>いま選ぶなら：</strong>${escapeHtml(next.title)} — ${escapeHtml(next.prompt)}</p>` : ''}
    <div class="purpose-grid">${renderPurposeSlots(state)}</div>`;
}

function renderOverview(state) {
  const confirmed = FEATURE_CATALOG.filter((feature) => state.features[feature.id].confirmed).length;
  const health = getViewHealth(state);
  const changes = getViewChanges(state);
  return {
    progressText: `${confirmed} / ${FEATURE_CATALOG.length}`,
    progressWidth: `${Math.round((confirmed / FEATURE_CATALOG.length) * 100)}%`,
    mapFigureHtml: renderViewMapFigure(state),
    mapLegendHtml: renderViewMapLegend(state),
    healthHtml: VIEW_DEFINITIONS.map((view) => `<span class="health-chip${changes[view.id].changed ? ' is-changed' : ''}">${view.label}<strong>変更 ${changes[view.id].changed}/${changes[view.id].total}</strong></span>`).join(''),
  };
}

function renderHandoff(state) {
  const confirmed = FEATURE_CATALOG.filter((feature) => state.features[feature.id].confirmed).length;
  const provisional = FEATURE_CATALOG.length - confirmed;
  const open = getOpenIssues(state);
  const decidedIssues = FEATURE_CATALOG.flatMap((feature) => state.features[feature.id].issues).filter((issue) => issue.status === 'decided').length;
  return `
    <div class="handoff-card"><span>確定済み</span><strong>${confirmed} 機能</strong><p>Spec Kit入力の「確定済み要求」へ出力</p></div>
    <div class="handoff-card"><span>仮置き</span><strong>${provisional} 機能</strong><p>仕様と混ぜず、レビュー対象として出力</p></div>
    <div class="handoff-card"><span>意思決定</span><strong>${decidedIssues} 済み / ${open.length} 要確認</strong><p>未決定事項はClarificationsへ出力</p></div>`;
}

function prStatusLabel(status) {
  return status === 'merged' ? 'マージ済み' : status === 'closed' ? '取り下げ' : 'レビュー中';
}

function renderActivePrSummary(state) {
  const pr = state.pullRequests.find((item) => item.id === state.activePrId);
  if (!pr) return '<div class="active-pr empty"><div><span>現在の作業</span><strong>PRなしの下書き — 変更は確定版と分離されています</strong></div></div>';
  const changes = diffFeatureSets(pr.baseFeatures, state.features).length;
  return `<div class="active-pr"><div><span>現在の変更PR</span><strong>#${pr.number} ${escapeHtml(pr.title)} · ${prStatusLabel(pr.status)} · ${changes}件の差分</strong></div></div>`;
}

function renderPrList(state) {
  const working = `
    <button class="pr-list-button" type="button" data-action="leave-pr" aria-current="${!state.activePrId}">
      <span><strong>PRなしの作業下書き</strong><small>ベースラインへ直接反映されません</small></span>
      <span class="pr-status">作業中</span>
    </button>`;
  if (!state.pullRequests.length) return `${working}<p class="pr-list-empty">まだ変更PRはありません。4視点を編集してから、変更理由とともにPRを作成してください。</p>`;
  return working + state.pullRequests.map((pr) => `
    <button class="pr-list-button" type="button" data-action="select-pr" data-pr-id="${pr.id}" aria-current="${state.activePrId === pr.id}">
      <span><strong>#${pr.number} ${escapeHtml(pr.title)}</strong><small>Rev.${pr.baseRevision} 起点 · ${formatLocalDate(pr.updatedAt)}</small></span>
      <span class="pr-status ${pr.status}">${prStatusLabel(pr.status)}</span>
    </button>`).join('');
}

function renderDiffTable(changes) {
  if (!changes.length) return '<div class="diff-empty">確定ベースラインとの差分はありません</div>';
  const shown = changes.slice(0, 30);
  return `
    <div class="diff-table-wrap">
      <table class="diff-table">
        <thead><tr><th>変更箇所</th><th>変更前</th><th>変更後</th></tr></thead>
        <tbody>${shown.map((change) => `<tr><td>${escapeHtml(change.label)}</td><td class="diff-value">${escapeHtml(change.before || '—')}</td><td class="diff-value">${escapeHtml(change.after || '—')}</td></tr>`).join('')}</tbody>
      </table>
      ${changes.length > shown.length ? `<p class="panel-help">ほか ${changes.length - shown.length} 件。JSON出力にはすべて含まれます。</p>` : ''}
    </div>`;
}

function renderPrDetail(state) {
  const pr = state.pullRequests.find((item) => item.id === state.activePrId);
  if (!pr) {
    const changes = diffFeatureSets(state.baselineFeatures, state.features);
    return `
      <div class="pr-detail-header"><div><span class="pr-number">WORKING DRAFT</span><h3>PRなしの作業下書き</h3><p>編集内容は自動保存されますが、確定ベースラインには反映されません。</p></div></div>
      <div class="pr-metrics"><span>ベースライン Revision ${state.baselineRevision}</span><span>${changes.length}件の未提出差分</span></div>
      <h4 class="diff-heading">確定ベースラインとの差分</h4>${renderDiffTable(changes)}`;
  }
  const changes = diffFeatureSets(pr.baseFeatures, state.features);
  const openButtons = pr.status === 'open' ? `
    <button class="button button-merge button-small" type="button" data-action="merge-pr">マージ</button>
    <button class="button button-danger button-small" type="button" data-action="close-pr">取り下げ</button>` : `
    <button class="button button-secondary button-small" type="button" data-action="reopen-pr">再オープン</button>`;
  const versions = pr.versions.map((version) => `<option value="${version.number}">版 ${version.number} — ${escapeHtml(version.label)} (${formatLocalDate(version.createdAt)})</option>`).join('');
  return `
    <div class="pr-detail-header">
      <div><span class="pr-number">REQ-PR-${String(pr.number).padStart(3, '0')}</span><h3>${escapeHtml(pr.title)}</h3><p>${escapeHtml(pr.reason)}</p></div>
      <div class="pr-toolbar">${openButtons}</div>
    </div>
    <div class="pr-metrics"><span>${prStatusLabel(pr.status)}</span><span>Revision ${pr.baseRevision} 起点</span><span>${changes.length}件の差分</span><span>${pr.versions.length}版を保存</span></div>
    <div class="version-controls snapshot-controls">
      <label for="snapshot-label">現在の版を保存</label>
      <input id="snapshot-label" maxlength="60" placeholder="例：工程の扱いを決める前" ${pr.status !== 'open' ? 'disabled' : ''}>
      <button class="button button-secondary button-small" type="button" data-action="save-snapshot" ${pr.status !== 'open' ? 'disabled' : ''}>版を保存</button>
    </div>
    <div class="version-controls">
      <label for="pr-version-select">過去版</label>
      <select id="pr-version-select" ${pr.status !== 'open' ? 'disabled' : ''}>${versions}</select>
      <button class="button button-quiet button-small" type="button" data-action="restore-version" ${pr.status !== 'open' ? 'disabled' : ''}>この版へ戻す</button>
    </div>
    <h4 class="diff-heading">PR作成時のベースラインとの差分</h4>
    ${renderDiffTable(changes)}`;
}

function featureSummary(state, featureId) {
  const feature = FEATURE_CATALOG.find((item) => item.id === featureId);
  const featureState = state.features[featureId];
  const action = DELTA_OPTIONS.find((option) => option.id === featureState.action)?.label || '未分類';
  return [
    `【${feature.name}】${action} / ${featureState.confirmed ? '確定' : '仮置き'}`,
    ...VIEW_DEFINITIONS.flatMap((view) => [
      `${view.label}: ${featureState.views[view.id]}`,
      ...flattenNodes(featureState.breakdown[view.id]).filter(({ node }) => node.text.trim()).map(({ node, depth }) => `${'  '.repeat(depth)}- ${node.text.trim()}`),
    ]),
    ...featureState.issues.map((issue) => `論点(${ISSUE_STATES[issue.status]}): ${issue.title} — ${issue.answer || issue.prompt}`),
  ].join('\n');
}

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function startApp(doc, storage) {
  let state = loadState(storage);
  let toastTimer = null;

  const elements = {
    purpose: doc.getElementById('purpose'),
    list: doc.getElementById('feature-list'),
    detail: doc.getElementById('feature-detail'),
    progressValue: doc.getElementById('progress-value'),
    progressBar: doc.getElementById('progress-bar'),
    viewHealth: doc.getElementById('view-health'),
    viewMapFigure: doc.getElementById('view-map-figure'),
    viewMapLegend: doc.getElementById('view-map-legend'),
    openIssueCount: doc.getElementById('open-issue-count'),
    handoff: doc.getElementById('handoff-preview'),
    saveState: doc.getElementById('save-state'),
    toast: doc.getElementById('toast'),
    baselineRevision: doc.getElementById('baseline-revision'),
    activePrSummary: doc.getElementById('active-pr-summary'),
    prPanel: doc.getElementById('pr-panel'),
    prList: doc.getElementById('pr-list'),
    prDetail: doc.getElementById('pr-detail'),
    prDialog: doc.getElementById('pr-dialog'),
    prForm: doc.getElementById('pr-form'),
    prTitle: doc.getElementById('pr-title'),
    prReason: doc.getElementById('pr-reason'),
  };

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2600);
  }

  function persist() {
    syncCurrentDraft(state);
    saveState(storage, state);
    elements.saveState.textContent = `保存済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function renderAll() {
    elements.purpose.innerHTML = renderPurpose(state);
    elements.list.innerHTML = renderFeatureList(state);
    elements.detail.innerHTML = renderFeatureDetail(state);
    const overview = renderOverview(state);
    elements.progressValue.textContent = overview.progressText;
    elements.progressBar.style.width = overview.progressWidth;
    elements.viewHealth.innerHTML = overview.healthHtml;
    elements.viewMapFigure.innerHTML = overview.mapFigureHtml;
    elements.viewMapLegend.innerHTML = overview.mapLegendHtml;
    const openCount = getOpenIssues(state).length;
    elements.openIssueCount.textContent = openCount ? `${openCount}件の確認が必要` : '未決定事項なし';
    elements.handoff.innerHTML = renderHandoff(state);
    elements.baselineRevision.textContent = `Revision ${state.baselineRevision}`;
    elements.activePrSummary.innerHTML = renderActivePrSummary(state);
    elements.prPanel.hidden = !state.prPanelOpen;
    elements.prList.innerHTML = renderPrList(state);
    elements.prDetail.innerHTML = renderPrDetail(state);
    const panelToggle = doc.querySelector('[data-action="toggle-pr-panel"]');
    if (panelToggle) panelToggle.setAttribute('aria-expanded', String(state.prPanelOpen));
  }

  function isReadOnly() {
    const activePr = state.pullRequests.find((pr) => pr.id === state.activePrId);
    return Boolean(activePr && activePr.status !== 'open');
  }

  doc.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'pick-choice') {
      choosePurposeOption(state, target.dataset.slotId, target.dataset.choiceId);
      persist();
      renderAll();
      return;
    } else if (action === 'pick-target') {
      setPurposeTarget(state, target.dataset.slotId, target.dataset.targetId);
      persist();
      renderAll();
      return;
    } else if (action === 'next-slot' || action === 'focus-slot') {
      const field = doc.getElementById(`answer-${target.dataset.slotId}`);
      if (field) {
        field.focus();
        field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } else if (action === 'select-feature') {
      state.selectedFeatureId = target.dataset.featureId;
      persist();
      renderAll();
    } else if (action === 'focus-view') {
      state.activeViewId = target.dataset.viewId;
      persist();
      renderAll();
      const field = doc.getElementById(`view-${state.activeViewId}`);
      if (field) {
        field.focus();
        field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } else if (action === 'reset-view') {
      if (isReadOnly()) return;
      resetViewToBaseline(state, target.dataset.featureId, target.dataset.viewId);
      persist();
      renderAll();
      showToast(`${viewOf(target.dataset.viewId).label}をfreee基準へ戻しました`);
    } else if (action === 'reset-feature') {
      if (isReadOnly()) return;
      if (!window.confirm('この機能の4視点を、freeeが今実現している内容へ戻しますか？ 分解した下位要求も消えます。')) return;
      resetFeatureToBaseline(state, target.dataset.featureId);
      persist();
      renderAll();
      showToast('freee基準へ戻しました');
    } else if (action === 'toggle-confirmed') {
      if (isReadOnly()) return;
      const featureId = target.dataset.featureId || state.selectedFeatureId;
      const current = state.features[featureId];
      state.selectedFeatureId = featureId;
      current.confirmed = !current.confirmed;
      persist();
      renderAll();
      showToast(current.confirmed ? '人間の判断として確定しました' : '仮置きへ戻しました');
    } else if (action === 'add-node') {
      if (isReadOnly()) return;
      const node = addBreakdownNode(state, target.dataset.featureId, target.dataset.viewId, target.dataset.parentId || null);
      persist();
      renderAll();
      if (node) doc.getElementById(`node-${node.id}`)?.focus();
    } else if (action === 'remove-node') {
      if (isReadOnly()) return;
      removeBreakdownNode(state, target.dataset.featureId, target.dataset.viewId, target.dataset.nodeId);
      persist();
      renderAll();
      showToast('下位要求を削除しました');
    } else if (action === 'use-reference') {
      if (isReadOnly()) return;
      const feature = featureOf(target.dataset.featureId);
      const viewId = target.dataset.viewId;
      state.features[feature.id].views[viewId] = feature.reference?.[viewId] || '';
      persist();
      renderAll();
      showToast('前の版の記述を入れました。ここから書き換えてください');
    } else if (action === 'export-json') {
      downloadFile('freee-requirements.json', JSON.stringify(state, null, 2), 'application/json;charset=utf-8');
      showToast('JSONを書き出しました');
    } else if (action === 'export-markdown') {
      downloadFile('speckit-input.md', buildMarkdown(state), 'text/markdown;charset=utf-8');
      showToast('Spec Kit入力を書き出しました');
    } else if (action === 'copy-summary') {
      const featureId = target.dataset.featureId || state.selectedFeatureId;
      try {
        await navigator.clipboard.writeText(featureSummary(state, featureId));
        showToast('この機能の4視点をコピーしました');
      } catch (error) {
        showToast('コピーできませんでした。画面を選択してからもう一度お試しください');
      }
    } else if (action === 'reset') {
      if (window.confirm('入力内容を初期状態に戻しますか？')) {
        state = createInitialState();
        persist();
        renderAll();
        showToast('初期状態へ戻しました');
      }
    } else if (action === 'toggle-pr-panel') {
      state.prPanelOpen = !state.prPanelOpen;
      persist();
      renderAll();
    } else if (action === 'open-pr-dialog') {
      elements.prTitle.value = '';
      elements.prReason.value = '';
      elements.prDialog.showModal();
      elements.prTitle.focus();
    } else if (action === 'close-pr-dialog') {
      elements.prDialog.close();
    } else if (action === 'select-pr') {
      if (switchActivePr(state, target.dataset.prId)) {
        persist();
        renderAll();
      }
    } else if (action === 'leave-pr') {
      leavePr(state);
      persist();
      renderAll();
    } else if (action === 'save-snapshot') {
      const labelInput = doc.getElementById('snapshot-label');
      const version = savePrSnapshot(state, labelInput?.value || 'レビュー前');
      persist();
      renderAll();
      showToast(version ? `版 ${version.number} を保存しました` : '前の版から変更がありません');
    } else if (action === 'restore-version') {
      const select = doc.getElementById('pr-version-select');
      if (!select) return;
      if (!window.confirm(`版 ${select.value} の内容へ戻しますか？ 現在の版は履歴に残ります。`)) return;
      if (restorePrVersion(state, select.value)) {
        persist();
        renderAll();
        showToast(`版 ${select.value} の内容へ戻しました`);
      }
    } else if (action === 'merge-pr') {
      const active = state.pullRequests.find((pr) => pr.id === state.activePrId);
      if (!active || !window.confirm(`REQ-PR-${String(active.number).padStart(3, '0')} を確定ベースラインへマージしますか？`)) return;
      if (mergeRequirementPr(state)) {
        persist();
        renderAll();
        showToast(`Revision ${state.baselineRevision} として確定しました`);
      }
    } else if (action === 'close-pr') {
      if (!window.confirm('この変更PRを取り下げますか？ 内容と履歴は残ります。')) return;
      if (closeRequirementPr(state)) {
        persist();
        renderAll();
        showToast('変更PRを取り下げました');
      }
    } else if (action === 'reopen-pr') {
      if (reopenRequirementPr(state)) {
        persist();
        renderAll();
        showToast('現在のベースラインを起点に再オープンしました');
      }
    }
  });

  elements.prForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!elements.prForm.reportValidity()) return;
    const pr = createRequirementPr(state, elements.prTitle.value, elements.prReason.value);
    elements.prDialog.close();
    persist();
    renderAll();
    showToast(`REQ-PR-${String(pr.number).padStart(3, '0')} を作成しました`);
  });

  doc.addEventListener('change', (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    if (field === 'purpose-status') {
      state.purpose.slots[event.target.dataset.slotId].status = event.target.value;
      persist();
      renderAll();
      return;
    }
    const activePr = state.pullRequests.find((pr) => pr.id === state.activePrId);
    if (activePr && activePr.status !== 'open') return;
    const featureId = event.target.dataset.featureId || state.selectedFeatureId;
    const featureState = state.features[featureId];
    state.selectedFeatureId = featureId;
    if (field === 'action') featureState.action = event.target.value;
    if (field === 'node-link') setBreakdownLink(state, featureId, event.target.dataset.viewId, event.target.dataset.nodeId, event.target.value);
    if (field === 'issue-status') {
      const issue = featureState.issues.find((item) => item.id === event.target.dataset.issueId);
      if (issue) issue.status = event.target.value;
    }
    persist();
    renderAll();
  });

  doc.addEventListener('input', (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    if (field === 'purpose-note') {
      state.purpose.slots[event.target.dataset.slotId].note = event.target.value;
      persist();
      return;
    }
    const activePr = state.pullRequests.find((pr) => pr.id === state.activePrId);
    if (activePr && activePr.status !== 'open') return;
    const featureId = event.target.dataset.featureId || state.selectedFeatureId;
    const featureState = state.features[featureId];
    state.selectedFeatureId = featureId;
    if (field === 'view') featureState.views[event.target.dataset.viewId] = event.target.value;
    if (field === 'node-text') setBreakdownText(state, featureId, event.target.dataset.viewId, event.target.dataset.nodeId, event.target.value);
    if (field === 'issue-answer') {
      const issue = featureState.issues.find((item) => item.id === event.target.dataset.issueId);
      if (issue) issue.answer = event.target.value;
    }
    persist();
    refreshQuadFlags();
    elements.list.innerHTML = renderFeatureList(state);
    const overview = renderOverview(state);
    elements.viewHealth.innerHTML = overview.healthHtml;
    elements.viewMapFigure.innerHTML = overview.mapFigureHtml;
    elements.viewMapLegend.innerHTML = overview.mapLegendHtml;
    elements.activePrSummary.innerHTML = renderActivePrSummary(state);
    elements.prDetail.innerHTML = renderPrDetail(state);
    elements.handoff.innerHTML = renderHandoff(state);
  });

  /* 入力欄には触れず、変更の印だけを描き直す */
  function refreshQuadFlags() {
    const feature = featureOf(state.selectedFeatureId);
    const disabled = isReadOnly() ? 'disabled' : '';
    for (const view of VIEW_DEFINITIONS) {
      const quad = elements.detail.querySelector(`.quad[data-view-id="${view.id}"]`);
      if (!quad) continue;
      const changed = isViewChanged(state, feature.id, view.id);
      const openIssues = state.features[feature.id].issues
        .filter((issue) => (issue.viewId || 'system') === view.id && issue.status !== 'decided').length;
      quad.classList.toggle('is-changed', changed);
      const flags = quad.querySelector('.quad-flags');
      if (flags) flags.innerHTML = renderQuadFlags(feature, view, changed, openIssues, disabled);
    }
  }

  renderAll();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => startApp(document, window.localStorage));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FEATURE_CATALOG,
    VIEW_DEFINITIONS,
    BREAKDOWN_MAX_DEPTH,
    PURPOSE_AXES,
    PURPOSE_SLOTS,
    PURPOSE_TARGETS,
    createPurposeState,
    normalizePurpose,
    getPurposeProgress,
    findNextPurposeSlot,
    choosePurposeOption,
    setPurposeTarget,
    purposeAnswerText,
    isViewChanged,
    countFeatureChanges,
    getViewChanges,
    resetViewToBaseline,
    resetFeatureToBaseline,
    baselineBreakdownOf,
    isBaselineNodeText,
    addBreakdownNode,
    removeBreakdownNode,
    setBreakdownText,
    setBreakdownLink,
    findNodeById,
    flattenNodes,
    listLinkTargets,
    describeLink,
    DELTA_OPTIONS,
    ISSUE_STATES,
    createInitialState,
    normalizeState,
    getFeatureCompleteness,
    getOpenIssues,
    getViewHealth,
    findNextQuestion,
    buildMarkdown,
    featureSummary,
    syncCurrentDraft,
    createRequirementPr,
    savePrSnapshot,
    restorePrVersion,
    mergeRequirementPr,
    closeRequirementPr,
    reopenRequirementPr,
    switchActivePr,
    leavePr,
    diffFeatureSets,
  };
}
