import { describe, expect, it } from 'vitest';
import { KB_NAME_MAX } from '@ai-chat/shared';
import { validateKbDescription, validateKbName } from '../validateKbName';

describe('validateKbName', () => {
  it('rejects empty after trim', () => {
    expect(validateKbName('   ', [])).toBeTruthy();
  });

  it('rejects names longer than 100', () => {
    expect(validateKbName('测'.repeat(KB_NAME_MAX + 1), [])).toBeTruthy();
  });

  it('rejects a name that already exists', () => {
    expect(validateKbName(' 项目库 ', ['项目库'])).toContain('同名');
  });

  it('allows renaming to the same name', () => {
    expect(
      validateKbName('项目库', ['项目库', '另一库'], { currentName: '项目库' }),
    ).toBeNull();
  });

  it('is case-sensitive', () => {
    expect(validateKbName('Foo', ['foo'])).toBeNull();
  });

  it('accepts a 1–100 trimmed name', () => {
    expect(validateKbName('  资料  ', [])).toBeNull();
  });
});

describe('validateKbDescription', () => {
  it('rejects descriptions over 2000', () => {
    expect(validateKbDescription('x'.repeat(2001))).toBeTruthy();
  });
});
