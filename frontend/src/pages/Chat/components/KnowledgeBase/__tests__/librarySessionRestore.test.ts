import { describe, expect, it } from 'vitest';
import {
  shouldLeaveDeletedKbDetail,
  shouldRestoreLibraryDetail,
} from '../librarySessionRestore';

describe('librarySessionRestore', () => {
  it('restores detail when stored kb still exists', () => {
    expect(shouldRestoreLibraryDetail('kb-1', ['kb-1', 'kb-2'])).toBe(true);
  });

  it('does not restore when stored kb is missing', () => {
    expect(shouldRestoreLibraryDetail('gone', ['kb-1'])).toBe(false);
  });

  it('leaves detail when active kb was deleted', () => {
    expect(shouldLeaveDeletedKbDetail('gone', ['kb-1'])).toBe(true);
  });

  it('stays on detail while active kb still exists', () => {
    expect(shouldLeaveDeletedKbDetail('kb-1', ['kb-1'])).toBe(false);
  });
});
