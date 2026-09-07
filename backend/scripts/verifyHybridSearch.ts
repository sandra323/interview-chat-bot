import { loadEnvFiles } from '../src/config/env.js';
import { initPg, resetPoolForTests } from '../src/rag/pg.js';
import { hybridSearch } from '../src/rag/hybridSearch.js';

async function main(): Promise<void> {
  loadEnvFiles();
  await initPg();

  const owner = process.env.VERIFY_OWNER ?? 'demo_test_user';
  const kbId =
    process.env.VERIFY_KB_ID ?? 'ebf6c024-780f-4489-8a87-a7159d5c7fac';
  const queries = (process.env.VERIFY_QUERIES ?? '赏花,私人知识库 RAG,DeepSeek').split(
    ',',
  );

  for (const query of queries) {
    const trimmed = query.trim();
    if (!trimmed) continue;
    const hits = await hybridSearch({
      ownerUsername: owner,
      knowledgeBaseId: kbId,
      query: trimmed,
    });
    console.log('--- query:', JSON.stringify(trimmed));
    console.log('hitCount:', hits.length);
    for (const hit of hits.slice(0, 5)) {
      console.log(
        JSON.stringify({
          preview: hit.content.slice(0, 80).replace(/\n/g, ' '),
          rrfScore: Number(hit.rrfScore.toFixed(6)),
          fromVector: hit.fromVector,
          fromKeyword: hit.fromKeyword,
          vectorRank: hit.vectorRank,
          keywordRank: hit.keywordRank,
        }),
      );
    }
  }

  await resetPoolForTests();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
