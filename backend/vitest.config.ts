import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // PG 集成测试会 TRUNCATE 同一 *_test 库，禁止跨文件并行以免互相清空。
    fileParallelism: false,
  },
});
