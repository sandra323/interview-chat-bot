import { loadEnvFiles } from '../src/config/env.js';
import { initPg, resetPoolForTests } from '../src/rag/pg.js';
import { buildRagMessages } from '../src/rag/buildRagMessages.js';
import { retrieveForChat } from '../src/rag/retrieveForChat.js';
import type { RerankedHit } from '../src/rag/retrievalTypes.js';

async function main(): Promise<void> {
  loadEnvFiles();
  await initPg();

  const owner = process.env.VERIFY_OWNER ?? 'demo_test_user';
  const kbId =
    process.env.VERIFY_KB_ID ?? 'ebf6c024-780f-4489-8a87-a7159d5c7fac';
  const query = process.env.VERIFY_QUERY ?? '赏花';

  console.log('=== retrieveForChat ===');
  const result = await retrieveForChat({
    ownerUsername: owner,
    knowledgeBaseId: kbId,
    query,
  });
  console.log('kind:', result.kind);
  if (result.kind === 'hits') {
    console.log('kb:', result.kb.name);
    console.log('hitCount:', result.hits.length);
    console.log('top1 preview:', result.hits[0]?.content.slice(0, 80));
  } else if (result.kind === 'empty' || result.kind === 'unavailable') {
    console.log('kb:', result.kb?.name ?? null);
  } else if (result.kind === 'kb_missing') {
    console.log('knowledgeBaseId:', result.knowledgeBaseId);
  }

  const history = [{ role: 'user' as const, content: query }];
  let mode: 'hits' | 'empty' | 'unavailable' | 'kb_missing' = 'empty';
  let kbName = '';
  let hits: RerankedHit[] = [];

  switch (result.kind) {
    case 'hits':
      mode = 'hits';
      kbName = result.kb.name;
      hits = result.hits;
      break;
    case 'empty':
      mode = 'empty';
      kbName = result.kb.name;
      break;
    case 'unavailable':
      mode = 'unavailable';
      kbName = result.kb?.name ?? '';
      break;
    case 'kb_missing':
      mode = 'kb_missing';
      break;
    case 'unbound':
      console.log('\n(no knowledge base bound — nothing to build)');
      await resetPoolForTests();
      return;
  }

  console.log('\n=== buildRagMessages (ephemeral LLM input) ===');
  const llmMessages = buildRagMessages({ history, kbName, hits, mode });
  console.log('messageCount:', llmMessages.length);
  console.log('roles:', llmMessages.map((m) => m.role).join(', '));
  console.log('status preview:', llmMessages[1]?.content.slice(0, 240));

  await resetPoolForTests();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
