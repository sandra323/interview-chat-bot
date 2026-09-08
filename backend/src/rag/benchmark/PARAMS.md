# Retrieval 参数结论

本阶段默认保持 `chunkConfig.ts` 实验值。未跑 live，不以 offline 确定性向量的 Recall 改参数，不阻塞合并。

| 因素 | 结论 | 原因 | Recall@5 | 弱相关 Top-5 |
|---|---|---|---|---|
| vector_top_k | 保持 20 | 未跑 live | 未测 | 未测 |
| keyword_top_k | 保持 20 | 未跑 live | 未测 | 未测 |
| rrf_fusion_top_n | 保持 12 | 未跑 live | 未测 | 未测 |
| rerank_top_n | 保持 5 | 未跑 live | 未测 | 未测 |
| chunk_size | 保持 700 | 不进默认扫描之外的改动；未跑 live | 未测 | 未测 |
| rrf_k | 保持 60 | 本阶段不扫描 | — | — |
| chunk_overlap | 保持 100 | 本阶段不扫描 | — | — |
| rerank_min_score | 不引入 | 缺省只截断 Top-N；未证明 Precision@5 提升且弱相关仍在 | — | — |

有 `OPENAI_API_KEY` 与 `*_test` 库时可运行：

```bash
npx tsx backend/scripts/runRetrievalBenchmark.ts --mode live
npx tsx backend/scripts/runRetrievalBenchmark.ts --mode live --sweep
```

`--sweep` 一次只改一个入参（vector/keyword top-k、fusion top-n、rerank top-n），打印对照，不写 `chunkConfig.ts`。`chunk_size` 需要重切分，不进默认扫描。

只有同时满足 Recall@12 提升 ≥ 0.05、Recall@5 不下降、弱相关仍在 Top-5，才允许改 `chunkConfig.ts`。

`Recall@12` 用融合候选（截成 Top-5 之前，最多 12 条），`Recall@5` 用实际注入上下文的那一截。两套数字允许不同。
