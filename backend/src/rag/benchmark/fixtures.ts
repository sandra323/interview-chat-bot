import type { BenchmarkQuery } from './types.js';

export const BENCH_OWNER = 'bench';

export function anchorToken(anchor: string): string {
  return `«${anchor}»`;
}

export function chunkKey(slug: string, anchor: string): string {
  return `${slug}:${anchor}`;
}

export interface BenchSection {
  anchor: string;
  title: string;
  body: string;
}

export interface BenchDocument {
  slug: string;
  filename: string;
  sections: BenchSection[];
}

function section(anchor: string, title: string, body: string): BenchSection {
  return {
    anchor,
    title,
    body: `${body}\n${anchorToken(anchor)}`,
  };
}

/** 短中文夹具。锚点写在段落里，gold 在切分后从实际 chunk 绑定。 */
export const BENCH_DOCUMENTS: BenchDocument[] = [
  {
    slug: 'park',
    filename: 'park.md',
    sections: [
      section(
        'flower-spring',
        '春季赏花',
        '城市公园春季赏花以樱花和海棠为主。建议工作日上午入园，周末赏花人很多。',
      ),
      section(
        'flower-ticket',
        '门票',
        '公园赏花期间门票含园区接驳。儿童与老人凭证件半价，不含园内餐饮。',
      ),
      section(
        'park-transit',
        '交通',
        '地铁二号线公园站出站步行八分钟。自驾请停在北门停车场，南门节假日单行。',
      ),
    ],
  },
  {
    slug: 'pets',
    filename: 'pets.md',
    sections: [
      section(
        'dog-golden',
        '金毛犬护理',
        '金毛犬需要每周梳毛并定期洗澡。幼犬金毛不宜频繁洗澡，注意吹干耳道。',
      ),
      section(
        'dog-walk',
        '遛狗',
        '大型犬每天外出散步两次。夏季避开正午，牵绳并携带饮用水。',
      ),
      section(
        'cat-care',
        '猫咪',
        '家猫以猫粮为主，每月驱虫。不要用狗粮长期替代猫粮。',
      ),
    ],
  },
  {
    slug: 'db',
    filename: 'db.md',
    sections: [
      section(
        'db-index',
        '索引',
        '数据库索引用于加速等值查询。过多索引会拖慢写入，需要定期检查未使用索引。',
      ),
      section(
        'db-isolation',
        '隔离',
        '事务隔离级别包括读已提交与可重复读。检索过滤必须带上所有者，避免串库。',
      ),
    ],
  },
  {
    slug: 'mixed',
    filename: 'mixed.md',
    sections: [
      section(
        'vue-api',
        '前端专名',
        '前端项目使用 Vue3 Composition API 组织页面状态。中文界面文案与英文组件名可以并存。',
      ),
    ],
  },
  {
    slug: 'bridge',
    filename: 'bridge.md',
    sections: [
      section(
        'bridge-ask',
        '跨段问题',
        '读者常问：闭园后丢失物品应去哪里登记。请见下一节办理地点。',
      ),
      section(
        'bridge-answer',
        '跨段答案',
        '闭园后丢失物品到北门服务台登记。凭门票存根领取，保留三十天。',
      ),
    ],
  },
];

export const BENCH_QUERIES: BenchmarkQuery[] = [
  { id: 'q01', query: '春季赏花', anchors: ['flower-spring'], tags: ['exact'] },
  { id: 'q02', query: '樱花和海棠', anchors: ['flower-spring'], tags: ['exact'] },
  { id: 'q03', query: '赏花门票半价', anchors: ['flower-ticket'], tags: ['exact'] },
  { id: 'q04', query: '公园站怎么走', anchors: ['park-transit'], tags: ['exact'] },
  { id: 'q05', query: '北门停车场', anchors: ['park-transit'], tags: ['exact'] },
  { id: 'q06', query: '金毛犬洗澡', anchors: ['dog-golden'], tags: ['exact'] },
  { id: 'q07', query: '幼犬金毛梳毛', anchors: ['dog-golden'], tags: ['exact'] },
  { id: 'q08', query: '大型犬散步', anchors: ['dog-walk'], tags: ['exact'] },
  { id: 'q09', query: '家猫驱虫', anchors: ['cat-care'], tags: ['exact'] },
  { id: 'q10', query: '数据库索引写入', anchors: ['db-index'], tags: ['exact'] },
  { id: 'q11', query: '事务隔离级别', anchors: ['db-isolation'], tags: ['exact'] },
  { id: 'q12', query: 'Vue3 Composition API', anchors: ['vue-api'], tags: ['mixed'] },
  { id: 'q13', query: '丢失物品登记', anchors: ['bridge-answer'], tags: ['cross'] },
  { id: 'q14', query: '北门服务台领取', anchors: ['bridge-answer'], tags: ['cross'] },
  { id: 'q15', query: '小狗狗怎么洗澡', anchors: ['dog-golden'], tags: ['weak'] },
  { id: 'q16', query: '汪星人要梳毛吗', anchors: ['dog-golden'], tags: ['weak'] },
  { id: 'q17', query: '带毛孩子出门遛弯', anchors: ['dog-walk'], tags: ['weak'] },
  { id: 'q18', query: '公园里看花花', anchors: ['flower-spring'], tags: ['weak'] },
  { id: 'q19', query: '周末人挤人看花', anchors: ['flower-spring'], tags: ['exact'] },
  { id: 'q20', query: '老人赏花优惠', anchors: ['flower-ticket'], tags: ['exact'] },
  { id: 'q21', query: '未使用索引', anchors: ['db-index'], tags: ['exact'] },
  { id: 'q22', query: '英文组件名和中文文案', anchors: ['vue-api'], tags: ['mixed'] },
  { id: 'q23', query: '吹干耳道', anchors: ['dog-golden'], tags: ['exact'] },
  { id: 'q24', query: '猫粮不要用狗粮替代', anchors: ['cat-care'], tags: ['exact'] },
];
