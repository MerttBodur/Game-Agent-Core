import { pool } from "@workspace/db";

type Row = { content: string; metadata: Record<string, unknown>; score: number };

export async function similaritySearch(embedding: number[], topK: number): Promise<Row[]> {
  const result = await pool.query<Row>(
    `SELECT content, metadata, 1 - (embedding <=> $1::vector) AS score
     FROM knowledge_chunks
     WHERE metadata->>'sourceType' = 'catalog'
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [`[${embedding.join(",")}]`, topK],
  );
  return result.rows;
}

export async function upsertChunks(
  chunks: Array<{ id: string; content: string; metadata: Record<string, unknown>; embedding: number[] }>,
): Promise<void> {
  for (const chunk of chunks) {
    await pool.query(
      `INSERT INTO knowledge_chunks (id, content, metadata, embedding)
       VALUES ($1, $2, $3::jsonb, $4::vector)
       ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding`,
      [chunk.id, chunk.content, JSON.stringify(chunk.metadata), `[${chunk.embedding.join(",")}]`],
    );
  }
}

export async function deleteChunks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query("DELETE FROM knowledge_chunks WHERE id = ANY($1::uuid[])", [ids]);
}
