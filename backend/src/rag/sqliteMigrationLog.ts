import { getPool } from './pg.js';

export async function isLegacySqliteDocumentHandled(
  documentId: string,
): Promise<boolean> {
  const result = await getPool().query<{ document_id: string }>(
    `SELECT document_id
     FROM legacy_sqlite_document_migrations
     WHERE document_id = $1
     LIMIT 1`,
    [documentId],
  );
  return result.rows.length > 0;
}

export async function markLegacySqliteDocumentHandled(
  documentId: string,
  ownerUsername: string,
): Promise<void> {
  await getPool().query(
    `INSERT INTO legacy_sqlite_document_migrations (document_id, owner_username)
     VALUES ($1, $2)
     ON CONFLICT (document_id) DO NOTHING`,
    [documentId, ownerUsername],
  );
}
