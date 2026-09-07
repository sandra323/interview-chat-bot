import { loadEnvFiles } from '../src/config/env.js';
import { initPg, resetPoolForTests } from '../src/rag/pg.js';
import { hybridSearch } from '../src/rag/hybridSearch.js';
import { searchWithRerank } from '../src/rag/searchWithRerank.js';

function summarizeHit(hit: {
  content: string;
  rrfScore?: number;
  relevanceScore?: number | null;
  reranked?: boolean;
  fromVector?: boolean;
  fromKeyword?: boolean;
}) {
  return {
    preview: hit.content.slice(0, 80).replace(/\n/g, ' '),
    rrfScore:
      hit.rrfScore === undefined ? undefined : Number(hit.rrfScore.toFixed(6)),
    relevanceScore:
      hit.relevanceScore === undefined || hit.relevanceScore === null
        ? hit.relevanceScore ?? null
        : Number(hit.relevanceScore.toFixed(6)),
    reranked: hit.reranked,
    fromVector: hit.fromVector,
    fromKeyword: hit.fromKeyword,
  };
}

async function main(): Promise<void> {
  loadEnvFiles();
  await initPg();

  const owner = process.env.VERIFY_OWNER ?? 'demo_test_user';
  const kbId =
    process.env.VERIFY_KB_ID ?? 'ebf6c024-780f-4489-8a87-a7159d5c7fac';
  const query = process.env.VERIFY_QUERY ?? '赏花';

  const input = {
    ownerUsername: owner,
    knowledgeBaseId: kbId,
    query,
  };

  console.log('=== hybridSearch (RRF Top-12) ===');
  const hybrid = await hybridSearch(input);
  console.log('hitCount:', hybrid.length);
  console.log('top1:', JSON.stringify(summarizeHit(hybrid[0] ?? { content: '' })));

  console.log('\n=== searchWithRerank (Voyage Top-5) ===');
  const reranked = await searchWithRerank(input);
  console.log('hitCount:', reranked.length);
  console.log('top1:', JSON.stringify(summarizeHit(reranked[0] ?? { content: '' })));
  console.log(
    'all reranked flags:',
    reranked.map((hit) => hit.reranked),
  );

  const top1 = reranked[0];
  const ok =
    Boolean(top1?.content.includes('赏花')) &&
    (top1?.reranked === true ||
      !process.env.VOYAGE_API_KEY?.trim());
  console.log('\n=== step4 check ===');
  console.log(
    JSON.stringify({
      query,
      top1Contains赏花: top1?.content.includes('赏花') ?? false,
      reranked: top1?.reranked ?? null,
      voyageConfigured: Boolean(process.env.VOYAGE_API_KEY?.trim()),
      pass: ok,
    }),
  );

  await resetPoolForTests();
  if (!ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
