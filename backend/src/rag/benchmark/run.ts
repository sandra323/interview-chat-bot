import { sha256Hex } from '../contentHash.js';
import { DEFAULT_EMBEDDING_MODEL } from '../chunkConfig.js';
import {
  createDeterministicEmbeddings,
  embedTexts,
  resetEmbedderForTests,
  setEmbedderForTests,
} from '../embedder.js';
import { createKnowledgeBase, deleteForOwner, listByOwner } from '../knowledgeBaseStore.js';
import { insert } from '../pgDocumentStore.js';
import { replaceForDocument } from '../chunkStore.js';
import { EmbedQuotaError } from '../ingestErrors.js';
import { RetrievalUnavailableError } from '../retrievalErrors.js';
import { searchWithRerank } from '../searchWithRerank.js';
import {
  BENCH_DOCUMENTS,
  BENCH_OWNER,
  BENCH_QUERIES,
  type BenchDocument,
} from './fixtures.js';
import { bindRelevantKeys, hitKey, type SeededChunk } from './gold.js';
import { mean, precisionAtK, recallAtK, reciprocalRank } from './metrics.js';
import type { BenchmarkReport, QueryScore } from './types.js';

export const BENCH_RECALL12_K = 12;
export const BENCH_CONTEXT_K = 5;

export interface RunBenchmarkInput {
  mode: 'offline' | 'live';
  /** live 下覆盖检索入参；offline 忽略扫描。 */
  vectorK?: number;
  keywordK?: number;
  fusionTopN?: number;
  rerankTopN?: number;
}

/**
 * 建隔离 KB、写入带锚点的 chunk，再走 searchWithRerank。
 * 结束和失败都删除 owner=bench 的库，禁止 TRUNCATE 全表。
 */
export async function runBenchmark(
  input: RunBenchmarkInput,
): Promise<BenchmarkReport> {
  const previousVoyage = process.env.VOYAGE_API_KEY;
  if (input.mode === 'offline') {
    setEmbedderForTests(async (texts) => createDeterministicEmbeddings(texts));
    delete process.env.VOYAGE_API_KEY;
  }
  await cleanupBench();
  const kb = await createKnowledgeBase(BENCH_OWNER, `bench-${crypto.randomUUID()}`);
  try {
    const seeded = await seedDocuments(kb.id, input.mode);
    return await scoreQueries({
      mode: input.mode,
      knowledgeBaseId: kb.id,
      seeded,
      vectorK: input.vectorK,
      keywordK: input.keywordK,
      fusionTopN: input.fusionTopN,
      rerankTopN: input.rerankTopN,
    });
  } finally {
    await cleanupBench();
    if (input.mode === 'offline') {
      resetEmbedderForTests();
      if (previousVoyage === undefined) {
        delete process.env.VOYAGE_API_KEY;
      } else {
        process.env.VOYAGE_API_KEY = previousVoyage;
      }
    }
  }
}

export async function cleanupBench(): Promise<void> {
  const rows = await listByOwner(BENCH_OWNER);
  for (const row of rows) {
    await deleteForOwner(row.id, BENCH_OWNER);
  }
}

async function seedDocuments(
  knowledgeBaseId: string,
  mode: 'offline' | 'live',
): Promise<SeededChunk[]> {
  const seeded: SeededChunk[] = [];
  for (const doc of BENCH_DOCUMENTS) {
    const written = await writeDocument(knowledgeBaseId, doc, mode);
    seeded.push(...written);
  }
  return seeded;
}

async function writeDocument(
  knowledgeBaseId: string,
  doc: BenchDocument,
  mode: 'offline' | 'live',
): Promise<SeededChunk[]> {
  const documentId = crypto.randomUUID();
  const chunks = doc.sections.map((section) => {
    const content = `${section.title}\n${section.body}`;
    return {
      content,
      slug: doc.slug,
      anchor: section.anchor,
      metadata: {
        filename: doc.filename,
        file_type: 'markdown',
        section_title: section.title,
        slug: doc.slug,
        anchor: section.anchor,
      },
    };
  });
  const embeddings =
    mode === 'offline'
      ? createDeterministicEmbeddings(chunks.map((chunk) => chunk.content))
      : await embedTexts(chunks.map((chunk) => chunk.content));

  await insert({
    id: documentId,
    knowledgeBaseId,
    ownerUsername: BENCH_OWNER,
    filename: doc.filename,
    mimeType: 'text/markdown',
    sizeBytes: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
    storagePath: `${BENCH_OWNER}/${documentId}.md`,
    contentHash: sha256Hex(Buffer.from(documentId)),
    status: 'pending',
    progress: 0,
    error: null,
    sourceRelativePath: null,
  });

  await replaceForDocument({
    ownerUsername: BENCH_OWNER,
    documentId,
    knowledgeBaseId,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    embeddingModelVersion: 'bench',
    chunks: chunks.map((chunk, index) => ({
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: embeddings[index]!,
      chunkIndex: index,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    })),
  });

  return chunks.map((chunk) => ({
    slug: chunk.slug,
    anchor: chunk.anchor,
    content: chunk.content,
  }));
}

async function scoreQueries(input: {
  mode: 'offline' | 'live';
  knowledgeBaseId: string;
  seeded: SeededChunk[];
  vectorK?: number;
  keywordK?: number;
  fusionTopN?: number;
  rerankTopN?: number;
}): Promise<BenchmarkReport> {
  const queries: QueryScore[] = [];
  let degraded = 0;

  for (const query of BENCH_QUERIES) {
    const relevant = bindRelevantKeys(query, input.seeded);
    if (relevant.length === 0) {
      queries.push({
        id: query.id,
        tags: query.tags,
        status: 'invalid-gold',
        relevantCount: 0,
        rank: null,
        recallAt5: 0,
        recallAt12: 0,
        precisionAt5: 0,
        mrr: 0,
      });
      continue;
    }

    try {
      let fusionKeys: string[] = [];
      const hits = await searchWithRerank({
        ownerUsername: BENCH_OWNER,
        knowledgeBaseId: input.knowledgeBaseId,
        query: query.query,
        vectorK: input.vectorK,
        keywordK: input.keywordK,
        fusionTopN: input.fusionTopN,
        rerankTopN: input.rerankTopN,
        onDegraded: () => {
          degraded += 1;
        },
        onFusionHits: (fusionHits) => {
          fusionKeys = fusionHits
            .map((hit) => hitKey(hit.metadata))
            .filter((key): key is string => Boolean(key));
        },
      });
      const ranked = hits
        .map((hit) => hitKey(hit.metadata))
        .filter((key): key is string => Boolean(key));
      const rankIndex = ranked.findIndex((key) => relevant.includes(key));
      queries.push({
        id: query.id,
        tags: query.tags,
        status: 'ok',
        relevantCount: relevant.length,
        rank: rankIndex < 0 ? null : rankIndex + 1,
        recallAt5: recallAtK(ranked, relevant, BENCH_CONTEXT_K),
        recallAt12: recallAtK(fusionKeys, relevant, BENCH_RECALL12_K),
        precisionAt5: precisionAtK(ranked, relevant, BENCH_CONTEXT_K),
        mrr: reciprocalRank(ranked, relevant),
      });
    } catch (error) {
      if (error instanceof EmbedQuotaError) {
        throw error;
      }
      queries.push({
        id: query.id,
        tags: query.tags,
        status: 'error',
        relevantCount: relevant.length,
        rank: null,
        recallAt5: 0,
        recallAt12: 0,
        precisionAt5: 0,
        mrr: 0,
        error:
          error instanceof RetrievalUnavailableError
            ? 'retrieval-unavailable'
            : error instanceof Error
              ? error.name
              : 'unknown',
      });
    }
  }

  const scored = queries.filter((row) => row.status === 'ok');
  const weak = queries.filter((row) => row.tags.includes('weak') && row.status === 'ok');
  return {
    mode: input.mode,
    knowledgeBaseId: input.knowledgeBaseId,
    queryCount: BENCH_QUERIES.length,
    scoredCount: scored.length,
    invalidGold: queries.filter((row) => row.status === 'invalid-gold').length,
    errors: queries.filter((row) => row.status === 'error').length,
    degraded,
    recallAt5: mean(scored.map((row) => row.recallAt5)),
    recallAt12: mean(scored.map((row) => row.recallAt12)),
    precisionAt5: mean(scored.map((row) => row.precisionAt5)),
    mrr: mean(scored.map((row) => row.mrr)),
    weakInTop5: weak.filter((row) => row.recallAt5 > 0).length,
    weakTotal: BENCH_QUERIES.filter((query) => query.tags.includes('weak')).length,
    queries,
  };
}

const SWEEP = {
  vectorK: [10, 20, 30],
  keywordK: [10, 20, 30],
  fusionTopN: [8, 12, 16],
  rerankTopN: [3, 5, 8],
} as const;

/**
 * 一次只动一个入参。不改 chunkConfig。调用方用 Recall@12 / Recall@5 / 弱相关决定是否采纳。
 */
export async function sweepLiveFactors(): Promise<string> {
  const lines = ['sweep=live-params', 'factor\tcandidate\tRecall@5\tRecall@12\tweak-in-top5'];
  const baseline = await runBenchmark({ mode: 'live' });
  lines.push(formatSweepRow('baseline', 'current', baseline));

  for (const [factor, values] of Object.entries(SWEEP) as Array<
    [keyof typeof SWEEP, readonly number[]]
  >) {
    for (const value of values) {
      const report = await runBenchmark({
        mode: 'live',
        [factor]: value,
      });
      lines.push(formatSweepRow(factor, String(value), report));
    }
  }
  return lines.join('\n');
}

function formatSweepRow(
  factor: string,
  candidate: string,
  report: BenchmarkReport,
): string {
  return [
    factor,
    candidate,
    report.recallAt5.toFixed(3),
    report.recallAt12.toFixed(3),
    `${report.weakInTop5}/${report.weakTotal}`,
  ].join('\t');
}

export function formatReport(report: BenchmarkReport): string {
  const lines = [
    `mode=${report.mode}`,
    `queries=${report.queryCount} scored=${report.scoredCount} invalid-gold=${report.invalidGold} errors=${report.errors} degraded=${report.degraded}`,
    `Recall@5=${report.recallAt5.toFixed(3)} Recall@12=${report.recallAt12.toFixed(3)} MRR=${report.mrr.toFixed(3)} Precision@5=${report.precisionAt5.toFixed(3)}`,
    `weak-in-top5=${report.weakInTop5}/${report.weakTotal}`,
    'id\tstatus\trank\ttags',
  ];
  for (const row of report.queries) {
    lines.push(
      `${row.id}\t${row.status}\t${row.rank ?? '-'}\t${row.tags.join(',')}`,
    );
  }
  return lines.join('\n');
}
