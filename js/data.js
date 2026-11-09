'use strict';
/* ============================================================
 *  三国杀 · 单机版   —— 数据层
 *  牌堆 / 卡牌定义 / 武将定义
 * ============================================================ */

const SUIT_SYM = { s: '♠', h: '♥', c: '♣', d: '♦' };
const SUIT_CN  = { s: '黑桃', h: '红桃', c: '梅花', d: '方块' };
const SUIT_KEYS = ['s', 'h', 'c', 'd'];

const isRed   = c => c.suit === 'h' || c.suit === 'd';
const isBlack = c => c.suit === 's' || c.suit === 'c';
const numText = n => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[n] || String(n);

/* ---------------- 卡牌定义 ----------------
 * type : basic 基本牌 / trick 锦囊 / equip 装备
 * sub  : weapon armor horseMinus horsePlus   (仅装备)
 * delay: 延时类锦囊
 * range: 武器攻击范围
 */
const CARD_INFO = {
  /* ---- 基本牌 ---- */
  sha:     { name: '杀',   type: 'basic', keyword: '杀',
             desc: '出牌阶段，对攻击范围内的一名角色使用。目标需打出一张【闪】，否则受到1点伤害。' },
  huosha:  { name: '火杀', type: 'basic', keyword: '杀', nature: 'fire',
             desc: '火属性【杀】。造成伤害时为火属性伤害。' },
  leisha:  { name: '雷杀', type: 'basic', keyword: '杀', nature: 'thunder',
             desc: '雷属性【杀】。造成伤害时为雷属性伤害。' },
  shan:    { name: '闪',   type: 'basic', keyword: '闪',
             desc: '当你成为【杀】的目标时，打出以抵消之。' },
  tao:     { name: '桃',   type: 'basic', keyword: '桃',
             desc: '出牌阶段对自己使用，回复1点体力；或在有角色濒死时使用，令其回复1点体力。' },
  jiu:     { name: '酒',   type: 'basic', keyword: '酒',
             desc: '出牌阶段使用：本回合下一张【杀】伤害+1（每回合限一次）；或于濒死时使用，回复1点体力。' },

  /* ---- 锦囊 ---- */
  juedou:   { name: '决斗',       type: 'trick',
              desc: '出牌阶段，对一名其他角色使用。由其开始，双方轮流打出一张【杀】，首先不出者受到1点伤害。' },
  guohe:    { name: '过河拆桥',   type: 'trick',
              desc: '出牌阶段，对一名有牌的其他角色使用。弃置其一张牌。' },
  shunshou: { name: '顺手牵羊',   type: 'trick',
              desc: '出牌阶段，对距离1以内的一名有牌的其他角色使用。获得其一张牌。' },
  wuzhong:  { name: '无中生有',   type: 'trick',
              desc: '出牌阶段，对自己使用。摸两张牌。' },
  jiedao:   { name: '借刀杀人',   type: 'trick',
              desc: '出牌阶段，对一名装备了武器的其他角色使用。令其对你指定的另一名角色使用一张【杀】，否则其将武器交给你。' },
  nanman:   { name: '南蛮入侵',   type: 'trick',
              desc: '出牌阶段，对所有其他角色使用。目标需打出一张【杀】，否则受到1点伤害。' },
  wanjian:  { name: '万箭齐发',   type: 'trick',
              desc: '出牌阶段，对所有其他角色使用。目标需打出一张【闪】，否则受到1点伤害。' },
  taoyuan:  { name: '桃园结义',   type: 'trick',
              desc: '出牌阶段，对所有角色使用。每名目标回复1点体力。' },
  wugu:     { name: '五谷丰登',   type: 'trick',
              desc: '出牌阶段，对所有角色使用。亮出等同目标数的牌，由目标依次选择获得其中一张。' },
  wuxie:    { name: '无懈可击',   type: 'trick',
              desc: '当一张锦囊牌生效前，打出一张【无懈可击】抵消之。' },
  lebu:     { name: '乐不思蜀',   type: 'trick', delay: true,
              desc: '出牌阶段，对一名其他角色使用。判定：若结果不为红桃，其跳过出牌阶段。' },
  shandian: { name: '闪电',       type: 'trick', delay: true,
              desc: '出牌阶段，对自己使用。判定：若结果为黑桃2~9，你受到3点雷电伤害，否则将此牌移到下家判定区。' },
  bingliang:{ name: '兵粮寸断',   type: 'trick', delay: true,
              desc: '出牌阶段，对距离1以内的一名其他角色使用。判定：若结果不为梅花，其跳过摸牌阶段。' },
  huogong:  { name: '火攻',       type: 'trick',
              desc: '出牌阶段，对一名有手牌的角色使用。其展示一张手牌，你可以弃置一张同花色的手牌，对其造成1点火属性伤害。' },
  tiesuo:   { name: '铁索连环',   type: 'trick', recast: true,
              desc: '出牌阶段，对一至两名角色使用。横置或重置其武将牌。你也可以重铸此牌（弃置之并摸一张牌）。' },

  /* ---- 武器 ---- */
  zhuge:    { name: '诸葛连弩',   type: 'equip', sub: 'weapon', range: 1,
              desc: '攻击范围1。你使用【杀】无次数限制。' },
  qinggang: { name: '青釭剑',     type: 'equip', sub: 'weapon', range: 2,
              desc: '攻击范围2。你使用【杀】指定目标时，无视其防具。' },
  cixiong:  { name: '雌雄双股剑', type: 'equip', sub: 'weapon', range: 2,
              desc: '攻击范围2。你使用【杀】指定异性目标后，可令其选择：弃一张手牌，或你摸一张牌。' },
  qinglong: { name: '青龙偃月刀', type: 'equip', sub: 'weapon', range: 3,
              desc: '攻击范围3。你使用的【杀】被目标以【闪】抵消后，你可以对其再使用一张【杀】。' },
  zhangba:  { name: '丈八蛇矛',   type: 'equip', sub: 'weapon', range: 3,
              desc: '攻击范围3。你可以将两张手牌当【杀】使用或打出。' },
  guanshi:  { name: '贯石斧',     type: 'equip', sub: 'weapon', range: 3,
              desc: '攻击范围3。你使用的【杀】被抵消后，你可以弃置两张牌，令此【杀】依然造成伤害。' },
  fangtian: { name: '方天画戟',   type: 'equip', sub: 'weapon', range: 4,
              desc: '攻击范围4。你使用【杀】时若为最后一张手牌，可额外指定至多两个目标。' },
  qilin:    { name: '麒麟弓',     type: 'equip', sub: 'weapon', range: 5,
              desc: '攻击范围5。你使用【杀】造成伤害时，可以弃置目标的一匹马。' },
  guding:   { name: '古锭刀',     type: 'equip', sub: 'weapon', range: 2,
              desc: '攻击范围2。你使用【杀】造成伤害时，若目标没有手牌，此伤害+1。' },
  zhuque:   { name: '朱雀羽扇',   type: 'equip', sub: 'weapon', range: 4,
              desc: '攻击范围4。你可以将一张普通【杀】当火【杀】使用。' },

  /* ---- 防具 ---- */
  bagua:    { name: '八卦阵',     type: 'equip', sub: 'armor',
              desc: '当你需要使用或打出一张【闪】时，你可以进行判定：若为红色，视为你打出了一张【闪】。' },
  renwang:  { name: '仁王盾',     type: 'equip', sub: 'armor',
              desc: '锁定技，黑色【杀】对你无效。' },
  tengjia:  { name: '藤甲',       type: 'equip', sub: 'armor',
              desc: '锁定技，【南蛮入侵】、【万箭齐发】和普通【杀】对你无效；当你受到火焰伤害时，此伤害+1。' },
  baiyin:   { name: '白银狮子',   type: 'equip', sub: 'armor',
              desc: '锁定技，你每次受到伤害时，至多受到1点伤害；当你失去装备区里的【白银狮子】时，回复1点体力。' },

  /* ---- 坐骑 ---- */
  chitu:     { name: '赤兔',       type: 'equip', sub: 'horseMinus', desc: '你计算与其他角色的距离-1。' },
  dawan:     { name: '大宛',       type: 'equip', sub: 'horseMinus', desc: '你计算与其他角色的距离-1。' },
  zixing:    { name: '紫骍',       type: 'equip', sub: 'horseMinus', desc: '你计算与其他角色的距离-1。' },
  dilu:      { name: '的卢',       type: 'equip', sub: 'horsePlus',  desc: '其他角色计算与你的距离+1。' },
  jueying:   { name: '绝影',       type: 'equip', sub: 'horsePlus',  desc: '其他角色计算与你的距离+1。' },
  zhuahuang: { name: '爪黄飞电',   type: 'equip', sub: 'horsePlus',  desc: '其他角色计算与你的距离+1。' },
  hualiu:    { name: '骅骝',       type: 'equip', sub: 'horsePlus',  desc: '其他角色计算与你的距离+1。' },
};

/* ---------------- 牌堆 ----------------
 * 写法： 花色 + 点数 : 牌id
 * s=黑桃 h=红桃 c=梅花 d=方块
 */
const DECK_STANDARD = `
sA:juedou sA:shandian s2:bagua s2:cixiong s3:guohe s3:shunshou s4:guohe s4:shunshou
s5:qinglong s5:jueying s6:qinggang s6:lebu s7:sha s7:sha s7:nanman s8:sha s8:sha s8:sha
s9:sha s9:sha s10:sha s10:sha sJ:wuxie sJ:shunshou sQ:zhangba sQ:guohe sK:nanman sK:dawan
hA:taoyuan hA:wanjian h2:shan h2:shan h3:tao h3:wugu h4:tao h4:wugu h5:chitu h5:qilin
h6:tao h6:lebu h7:tao h7:wuzhong h8:tao h8:wuzhong h9:tao h9:wuzhong h10:sha h10:sha
hJ:sha hJ:wuzhong hQ:tao hQ:guohe hK:shan hK:zhuahuang
cA:zhuge cA:juedou c2:bagua c2:renwang c3:guohe c3:sha c4:guohe c4:sha c5:dilu c5:sha
c6:lebu c6:sha c7:nanman c7:sha c8:sha c8:sha c9:sha c9:sha c10:sha c10:sha cJ:sha cJ:sha
cQ:jiedao cQ:wuxie cK:jiedao cK:wuxie
dA:zhuge dA:juedou d2:shan d2:shan d3:shan d3:shunshou d4:shan d4:shunshou d5:guanshi d5:shan
d6:shan d6:sha d7:shan d7:sha d8:shan d8:sha d9:shan d9:sha d10:shan d10:sha dJ:shan dJ:sha
dQ:tao dQ:fangtian dK:shan dK:zixing
`;

const DECK_JUNZHENG = `
sA:guding s2:tengjia s3:jiu s4:leisha s5:leisha s6:leisha s7:leisha s8:leisha s9:jiu
s10:bingliang sJ:tiesuo sQ:tiesuo sK:sha
h2:huogong h3:huogong h4:huosha h5:sha h6:sha h7:huosha h10:huosha h2:shan hK:shan
cA:baiyin c2:tengjia c3:jiu c4:bingliang c5:leisha c6:leisha c7:leisha c8:sha c9:jiu
c10:tiesuo cJ:tiesuo cQ:tiesuo cK:tiesuo
dA:zhuque d2:shan d3:shan d4:huosha d5:huosha d6:sha d7:sha d8:sha d9:jiu dJ:tiesuo dK:hualiu
`;

function parseDeck(str) {
  const out = [];
  str.trim().split(/\s+/).forEach(tok => {
    if (!tok) return;
    const i = tok.indexOf(':');
    const key = tok.slice(0, i), id = tok.slice(i + 1);
    const suit = key[0], ns = key.slice(1);
    const num = ns === 'A' ? 1 : ns === 'J' ? 11 : ns === 'Q' ? 12 : ns === 'K' ? 13 : parseInt(ns, 10);
    if (!CARD_INFO[id]) { console.warn('未知卡牌', id); return; }
    out.push({ id, suit, num });
  });
  return out;
}

const FULL_DECK = parseDeck(DECK_STANDARD + DECK_JUNZHENG);

/* ---------------- 武将 ----------------
 * kingdom: wei / shu / wu / qun
 * hp: 体力上限
 * lord: 主公技（用于标识）
 */
const KINGDOM_CN = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };

const GENERALS = [
  /* ===== 魏 ===== */
  { id: 'caocao',   name: '曹操',   kingdom: 'wei', hp: 4, sex: 'm', skills: ['jianxiong', 'hujia'], lord: 'hujia',
    quote: '宁教我负天下人，休教天下人负我！' },
  { id: 'simayi',   name: '司马懿', kingdom: 'wei', hp: 3, sex: 'm', skills: ['fankui', 'guicai'] },
  { id: 'xiahoudun',name: '夏侯惇', kingdom: 'wei', hp: 4, sex: 'm', skills: ['ganglie'] },
  { id: 'zhangliao',name: '张辽',   kingdom: 'wei', hp: 4, sex: 'm', skills: ['tuxi'] },
  { id: 'xuchu',    name: '许褚',   kingdom: 'wei', hp: 4, sex: 'm', skills: ['luoyi'] },
  { id: 'guojia',   name: '郭嘉',   kingdom: 'wei', hp: 3, sex: 'm', skills: ['tiandu', 'yiji'] },
  { id: 'zhenji',   name: '甄姬',   kingdom: 'wei', hp: 3, sex: 'f', skills: ['qingguo', 'luoshen'] },

  /* ===== 蜀 ===== */
  { id: 'liubei',   name: '刘备',   kingdom: 'shu', hp: 4, sex: 'm', skills: ['rende', 'jijiang'], lord: 'jijiang',
    quote: '惟贤惟德，能服于人。' },
  { id: 'guanyu',   name: '关羽',   kingdom: 'shu', hp: 4, sex: 'm', skills: ['wusheng'] },
  { id: 'zhangfei', name: '张飞',   kingdom: 'shu', hp: 4, sex: 'm', skills: ['paoxiao'] },
  { id: 'zhugeliang',name:'诸葛亮', kingdom: 'shu', hp: 3, sex: 'm', skills: ['guanxing', 'kongcheng'] },
  { id: 'zhaoyun',  name: '赵云',   kingdom: 'shu', hp: 4, sex: 'm', skills: ['longdan'] },
  { id: 'machao',   name: '马超',   kingdom: 'shu', hp: 4, sex: 'm', skills: ['mashu', 'tieji'] },
  { id: 'huangyueying', name: '黄月英', kingdom: 'shu', hp: 3, sex: 'f', skills: ['jizhi', 'qicai'] },

  /* ===== 吴 ===== */
  { id: 'sunquan',  name: '孙权',   kingdom: 'wu', hp: 4, sex: 'm', skills: ['zhiheng', 'jiuyuan'], lord: 'jiuyuan',
    quote: '生子当如孙仲谋！' },
  { id: 'ganning',  name: '甘宁',   kingdom: 'wu', hp: 4, sex: 'm', skills: ['qixi'] },
  { id: 'lvmeng',   name: '吕蒙',   kingdom: 'wu', hp: 4, sex: 'm', skills: ['keji'] },
  { id: 'huanggai', name: '黄盖',   kingdom: 'wu', hp: 4, sex: 'm', skills: ['kurou'] },
  { id: 'zhouyu',   name: '周瑜',   kingdom: 'wu', hp: 3, sex: 'm', skills: ['yingzi', 'fanjian'] },
  { id: 'daqiao',   name: '大乔',   kingdom: 'wu', hp: 3, sex: 'f', skills: ['guose', 'liuli'] },
  { id: 'luxun',    name: '陆逊',   kingdom: 'wu', hp: 3, sex: 'm', skills: ['qianxun', 'lianying'] },
  { id: 'sunshangxiang', name: '孙尚香', kingdom: 'wu', hp: 3, sex: 'f', skills: ['jieyin', 'xiaoji'] },

  /* ===== 群 ===== */
  { id: 'huatuo',   name: '华佗',   kingdom: 'qun', hp: 3, sex: 'm', skills: ['jijiu', 'qingnang'] },
  { id: 'lvbu',     name: '吕布',   kingdom: 'qun', hp: 4, sex: 'm', skills: ['wushuang'] },
  { id: 'diaochan', name: '貂蝉',   kingdom: 'qun', hp: 3, sex: 'f', skills: ['lijian', 'biyue'] },

  /* ===== 军争篇 ===== */
  { id: 'caopi',    name: '曹丕',   kingdom: 'wei', hp: 3, sex: 'm', skills: ['xingshang', 'fangzhu', 'songwei'], lord: 'songwei' },
  { id: 'xuhuang',  name: '徐晃',   kingdom: 'wei', hp: 4, sex: 'm', skills: ['duanliang'] },
  { id: 'menghuo',  name: '孟获',   kingdom: 'qun', hp: 4, sex: 'm', skills: ['huoshou', 'zaiqi'] },
  { id: 'zhurong',  name: '祝融',   kingdom: 'qun', hp: 4, sex: 'f', skills: ['juxiang', 'lieren'] },
  { id: 'dongzhuo', name: '董卓',   kingdom: 'qun', hp: 8, sex: 'm', skills: ['jiuchi', 'roulin', 'benghuai'] },
  { id: 'jiaxu',    name: '贾诩',   kingdom: 'qun', hp: 3, sex: 'm', skills: ['wansha', 'weimu', 'luanwu'] },
  { id: 'lusu',     name: '鲁肃',   kingdom: 'wu', hp: 3, sex: 'm', skills: ['haoshi', 'dimeng'] },
  { id: 'sunjian',  name: '孙坚',   kingdom: 'wu', hp: 4, sex: 'm', skills: ['yinghun'] },
];

const GENERAL_MAP = {};
GENERALS.forEach(g => GENERAL_MAP[g.id] = g);

/* 身份配置 */
const IDENTITY_SETUP = {
  4: ['lord', 'loyal', 'rebel', 'spy'],
  5: ['lord', 'loyal', 'rebel', 'rebel', 'spy'],
  6: ['lord', 'loyal', 'rebel', 'rebel', 'rebel', 'spy'],
  8: ['lord', 'loyal', 'loyal', 'rebel', 'rebel', 'rebel', 'rebel', 'spy'],
};
const IDENTITY_CN = { lord: '主公', loyal: '忠臣', rebel: '反贼', spy: '内奸' };

/* 身份视觉：一种身份 = 一个印章字 + 一种颜色 + 一句胜利条件。
   所有界面（HUD / 座位 / 选将 / 详情 / 结算 / 规则）都走这里，避免各处配色与措辞不一致。 */
const IDENTITY_META = {
  lord:  { cn: '主公', mark: '主', goal: '与忠臣合力消灭所有反贼与内奸', note: '身份公开 · 先手 · 体力上限 +1' },
  loyal: { cn: '忠臣', mark: '忠', goal: '不惜一切保护主公，与主公一同获胜', note: '身份保密 · 阵亡后公开' },
  rebel: { cn: '反贼', mark: '反', goal: '杀死主公即可获胜', note: '身份保密 · 阵亡后公开' },
  spy:   { cn: '内奸', mark: '内', goal: '先除尽反贼，最后与主公单挑取胜', note: '身份保密 · 阵亡后公开' },
  unknown: { cn: '身份未明', mark: '?', goal: '除主公外，身份对所有人隐藏；阵亡后公开', note: '点按查看四种身份的胜利条件' },
};
/* 生成身份牌。opt: sealOnly(只显示印章) / cls / inspect / goal(附胜利条件) / text / guess(玩家猜测标记) */
function idBadge(id, opt) {
  opt = opt || {};
  const m = IDENTITY_META[id] || IDENTITY_META.unknown;
  const key = IDENTITY_META[id] ? id : 'unknown';
  const cls = 'id-badge id-' + key + (opt.goal ? ' with-goal' : '') +
    (opt.guess ? ' is-guess' : '') + (opt.cls ? ' ' + opt.cls : '');
  const seal = '<span class="ib-sealbox"><i class="ib-seal">' + m.mark + '</i>' +
    (opt.guess ? '<i class="ib-q">?</i>' : '') + '</span>';
  const name = opt.sealOnly ? '' : '<span class="ib-name">' + (opt.text || m.cn) + '</span>';
  const goal = opt.goal ? '<span class="ib-goal">' + m.goal + '</span>' : '';
  const attrs = opt.inspect ? ' data-inspect="' + opt.inspect + '" data-tap="1"' : '';
  const tip = opt.guess ? '你的标记：' + m.cn + '（猜测，不影响规则）' : m.cn + ' · ' + m.goal;
  return '<span class="' + cls + '"' + attrs + ' title="' + tip + '">' + seal + name + goal + '</span>';
}
