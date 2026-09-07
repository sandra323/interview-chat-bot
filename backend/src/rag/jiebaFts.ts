import { createRequire } from 'node:module';
import { logger } from '../utils/logger.js';

export type CutFn = (text: string) => string[];

const PUNCT_ONLY_RE = /^[\p{P}\p{S}\p{Zs}]+$/u;
const HAN_SPLIT_RE = /(\p{Script=Han}+)/u;
const HAN_ONLY_RE = /^\p{Script=Han}+$/u;
const LATIN_SPLIT_RE = /[^\p{L}\p{N}_-]+/u;

let nativeCut: CutFn | null = null;
let overrideCut: CutFn | null = null;

function tryLoadNativeCut(): CutFn | null {
  try {
    const require = createRequire(import.meta.url);
    const { Jieba } = require('@node-rs/jieba') as {
      Jieba: {
        withDict: (dict: Uint8Array) => {
          cut: (sentence: string, hmm?: boolean | null) => string[];
        };
      };
    };
    const { dict } = require('@node-rs/jieba/dict') as { dict: Uint8Array };
    const jieba = Jieba.withDict(dict);
    return (text) => jieba.cut(text);
  } catch {
    return null;
  }
}

nativeCut = tryLoadNativeCut();
if (!nativeCut) {
  logger.warn('jieba native unavailable, using bigram fallback');
}

function getCut(): CutFn {
  return overrideCut ?? nativeCut ?? fallbackCut;
}

/** 测试用：注入分词器；传 null 恢复默认（native 或 bigram）。 */
export function setTokenizerForTests(fn: CutFn | null): void {
  overrideCut = fn;
}

export function resetTokenizerForTests(): void {
  overrideCut = null;
}

function isPunctuationOnly(token: string): boolean {
  return PUNCT_ONLY_RE.test(token);
}

/**
 * Native jieba 不可用时的兜底：汉字 bigram，其余按空白/标点切开。
 * 入库与查询共用，保证无 native 时 FTS 仍有 lexeme。
 */
export function fallbackCut(text: string): string[] {
  const tokens: string[] = [];
  for (const part of text.split(HAN_SPLIT_RE)) {
    if (!part) {
      continue;
    }
    if (HAN_ONLY_RE.test(part)) {
      if (part.length === 1) {
        tokens.push(part);
      } else {
        for (let i = 0; i < part.length - 1; i += 1) {
          tokens.push(part.slice(i, i + 2));
        }
      }
      continue;
    }
    for (const word of part.split(LATIN_SPLIT_RE)) {
      const token = word.trim().toLowerCase();
      if (token) {
        tokens.push(token);
      }
    }
  }
  return tokens;
}

function normalizeTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (const raw of tokens) {
    const token = raw.trim().toLowerCase();
    if (!token || isPunctuationOnly(token)) {
      continue;
    }
    out.push(token);
  }
  return out;
}

/**
 * 把文本切成 PG `simple` FTS 用的空格分隔 lexeme。
 * 空串 / 纯标点返回 ''；分词抛错时打 warn 并返回 ''，不阻断 ingest。
 */
export function tokenizeForFts(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  try {
    return normalizeTokens(getCut()(trimmed)).join(' ');
  } catch (error) {
    logger.warn('fts tokenize failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return '';
  }
}
