export type GatekeeperDirection = 'BUY' | 'SELL';
export type ChecklistAnswer = 'yes' | 'no' | null;

export const BUY_CHECKLIST_VERSION = 'buy-v2';
export const SELL_CHECKLIST_VERSION = 'sell-v1';

export interface ChecklistItemDef {
  id: string;
  group: string;
  title: string;
  mistake: string;
  standard: string;
}

export const BUY_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {
    id: 'buy_motivation_fomo',
    group: '动机与情绪',
    title: '我没有在 FOMO 追高',
    mistake: '看到连续大涨、社交媒体热议而担心错过，在偏离合理价值或关键支撑时追入。',
    standard: '若价格已明显偏离合理区间，不追涨，等待回调或放弃。',
  },
  {
    id: 'buy_motivation_revenge',
    group: '动机与情绪',
    title: '我当前不是在报复性交易',
    mistake: '刚经历重大亏损，急于用下一笔大额交易快速回本，导致仓位失控。',
    standard: '若近 24 小时出现超预期亏损，应进入冷却期，避免新开仓。',
  },
  {
    id: 'buy_motivation_signal',
    group: '动机与情绪',
    title: '这是明确机会，不是为交易而交易',
    mistake: '手痒、无法忍受现金，把波动当成参与理由，频繁换手。',
    standard: '若没有满足你系统规则的明确信号，空仓就是当前最优策略。',
  },
  {
    id: 'buy_logic_thesis',
    group: '逻辑与信息',
    title: '买入逻辑没有漂移',
    mistake: '本为短线博弈，被套后改口做「长期价值投资」而不止损。',
    standard: '明确是趋势还是配置；初始理由证伪则离场，禁止中途改投资属性。',
  },
  {
    id: 'buy_logic_bias',
    group: '逻辑与信息',
    title: '我能客观列出至少三大风险',
    mistake: '建仓后只看利好，对空头观点与不利数据视而不见。',
    standard: '若只能看到利好，说明研究尚未客观。',
  },
  {
    id: 'buy_logic_research',
    group: '逻辑与信息',
    title: '依据来自自己的研究，而非小道消息',
    mistake: '盲信群聊、网红或传闻，说不清商业模式与估值边界。',
    standard: '用三句话讲清：如何持续赚钱？估值是否透支？跌 50% 是否仍敢持有？',
  },
  {
    id: 'buy_risk_max_risk',
    group: '仓位与风控',
    title: '单笔最大亏损在账户 Max Risk 以内',
    mistake: '单笔重仓或杠杆，一次黑天鹅即可重创本金。',
    standard: '结合下方计算器：拟下单风险应 ≤ 你设定的 Max Risk（默认 0.5%）。',
  },
  {
    id: 'buy_risk_martingale',
    group: '仓位与风控',
    title: '不是在逻辑破坏下盲目补仓',
    mistake: '基本面恶化或趋势未反转时越跌越补，小亏滚成大亏。',
    standard: '未触发纪律信号或逻辑破坏时不下注加仓；仅在右侧或低估逻辑强化时分批。',
  },
  {
    id: 'buy_risk_diversification',
    group: '仓位与风控',
    title: '这笔不会让我持仓过度同质化',
    mistake: '多只同名不同码但同属一个周期/行业，下跌时一齐受损。',
    standard: '检查与现有持仓的相关性与流动性风险。',
  },
  {
    id: 'buy_exit_stop',
    group: '退出机制',
    title: '我已设定明确、可执行的止损',
    mistake: '只算能赚多少，不设亏损退出点，临到破位又撤止损。',
    standard: '下单同时有硬件或纪律止损位，触碰即退出、不带情绪。',
  },
  {
    id: 'buy_exit_disposition',
    group: '退出机制',
    title: '我有止盈与盈亏比纪律',
    mistake: '小赚急跑、大亏死扛，盈亏比极不对称。',
    standard: '有分批止盈或让利润奔跑的规则，同时严格截断亏损。',
  },
  {
    id: 'buy_exit_black_swan',
    group: '退出机制',
    title: '我考虑过黑天鹅最坏情形',
    mistake: '假定流动性与交易机制始终正常。',
    standard: '停牌、跳空、流动性枯竭下的损失是否在承受范围内？',
  },
  {
    id: 'buy_timing_volatility',
    group: '买入时机',
    title: '波动率：当前环境适合买入吗？',
    mistake: '在近期波动明显偏高时仍按平时仓位追买，容易被洗出局。',
    standard:
      '请自行判断近期波动是否偏高（无系统计算）。高波动下边际买入的亏损概率往往更高；若心里没底，选「否」并缩小仓位或等待波动收敛。',
  },
  {
    id: 'buy_timing_session',
    group: '买入时机',
    title: '时段：是否避开盘前与开盘约 1 小时？',
    mistake: '在盘前或刚开盘的迷惑时段冲动下单，容易被假突破误导。',
    standard:
      'A 股 / 港股 / 美股均适用：盘前竞价与开盘后约 1 小时内走势噪音大。若尚未看清方向，选「否」，等待走势明朗后再下单。',
  },
];

export const SELL_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {
    id: 'sell_motivation_impulse',
    group: '动机',
    title: '这次卖出不是冲动或报复性交易',
    mistake: '刚亏后乱卖，或情绪上头一次性砍仓。',
    standard: '卖出决定应冷静、可复述，而非发泄。',
  },
  {
    id: 'sell_motivation_reason',
    group: '动机',
    title: '卖出理由明确（止盈/止损/证伪/再平衡）',
    mistake: '没有计划地「先卖一点看看」。',
    standard: '能一句话说明为何现在卖、卖多少。',
  },
  {
    id: 'sell_logic_panic',
    group: '逻辑',
    title: '我不是仅因短期波动恐慌卖出',
    mistake: '正常波动就砍仓，原逻辑仍成立却未对照纪律。',
    standard: '若逻辑未变，应对照原计划而非盯盘情绪。',
  },
  {
    id: 'sell_discipline_profit',
    group: '退出纪律',
    title: '若盈利：我不是违背原计划「赚一点就跑」',
    mistake: '处置效应：微利急兑现，破坏盈亏比。',
    standard: '对照既定止盈/减仓规则。',
  },
  {
    id: 'sell_discipline_loss',
    group: '退出纪律',
    title: '若亏损：本次卖出符合事先规则',
    mistake: '死扛到被动割肉，而非按计划止损或证伪离场。',
    standard: '卖出应来自纪律触发，而非崩溃式决策。',
  },
  {
    id: 'sell_position_after',
    group: '仓位',
    title: '卖出后剩余仓位/现金仍符合整体风控',
    mistake: '卖完后仍过度集中或现金缓冲不足。',
    standard: '确认卖后组合与现金垫仍合理。',
  },
];

export function checklistItemsForDirection(direction: GatekeeperDirection): ChecklistItemDef[] {
  return direction === 'BUY' ? BUY_CHECKLIST_ITEMS : SELL_CHECKLIST_ITEMS;
}

export function checklistVersionForDirection(direction: GatekeeperDirection): string {
  return direction === 'BUY' ? BUY_CHECKLIST_VERSION : SELL_CHECKLIST_VERSION;
}

export function evaluatePassed(
  direction: GatekeeperDirection,
  answers: Record<string, ChecklistAnswer>
): boolean {
  const items = checklistItemsForDirection(direction);
  return items.every((item) => answers[item.id] === 'yes');
}

export function countAnswered(
  direction: GatekeeperDirection,
  answers: Record<string, ChecklistAnswer>
): { answered: number; total: number; failed: number } {
  const items = checklistItemsForDirection(direction);
  let answered = 0;
  let failed = 0;
  for (const item of items) {
    const a = answers[item.id];
    if (a === 'yes' || a === 'no') answered += 1;
    if (a === 'no') failed += 1;
  }
  return { answered, total: items.length, failed };
}
