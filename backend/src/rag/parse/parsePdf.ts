import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  getDocument,
  GlobalWorkerOptions,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ParseEmptyError, collapseWhitespace, type ParsedDocument } from './types.js';

const require = createRequire(import.meta.url);
const workerSrc = pathToFileURL(
  require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href; // 获取PDF.js的worker源
GlobalWorkerOptions.workerSrc = workerSrc;

/** 解析PDF文件 */
export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const data = Uint8Array.from(buffer); // 将Buffer转换为Uint8Array
  const loadingTask = getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  }); // 创建一个PDF.js的加载任务

  try {
    const pdf = await loadingTask.promise; // 等待PDF.js的加载任务完成
    const pages: Array<{ page: number; text: string }> = [];
    const parts: string[] = []; // 创建一个数组，用于存储PDF的文本内容

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum); // 获取PDF的第pageNum页
      const content = await page.getTextContent(); // 获取PDF的第pageNum页的文本内容
      const text = collapseWhitespace(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' '),
      ); // 将PDF的文本内容转换为字符串
      pages.push({ page: pageNum, text }); // 将PDF的文本内容添加到数组中
      if (text) {
        parts.push(text); // 将PDF的文本内容添加到数组中
      }
    }

    await pdf.destroy();

    const combined = collapseWhitespace(parts.join('\n\n'));
    if (!combined) {
      throw new ParseEmptyError();
    }

    return { kind: 'pdf', text: combined, pages };
  } finally {
    await loadingTask.destroy().catch(() => {
      // 忽略
    });
  }
}
