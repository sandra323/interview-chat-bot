export function shouldRestoreLibraryDetail(
  storedId: string | null,
  itemIds: string[],
): boolean {
  return Boolean(storedId && itemIds.includes(storedId));
}

export function shouldLeaveDeletedKbDetail(
  activeKbId: string | null,
  itemIds: string[],
): boolean {
  return Boolean(activeKbId && !itemIds.includes(activeKbId));
}
