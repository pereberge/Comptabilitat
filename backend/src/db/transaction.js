export async function withTransaction(pool, action) {
  for (let attempt = 0; ; attempt++) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const result = await action(db);
      await db.commit();
      return result;
    } catch (error) {
      await db.rollback();
      if (error.code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error;
    } finally { db.release(); }
    await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
  }
}
