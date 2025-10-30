import express from 'express';
import { pool } from '../db.js';
const router = express.Router();

// Transaction with SQL Transaction (BEGIN-COMMIT-ROLLBACK)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { user_id, category_id, amount, txn_date, note } = req.body;
    await client.query('BEGIN');

    const insertTxn = `
      INSERT INTO transactions (user_id, category_id, amount, txn_date, note)
      VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `;
    const txnResult = await client.query(insertTxn, [user_id, category_id, amount, txn_date, note]);

    // Cursor Example: Fetch recent 5 transactions
    const cursor = client.query('DECLARE txn_cursor CURSOR FOR SELECT * FROM transactions ORDER BY txn_date DESC LIMIT 5;');
    const fetchCursor = await client.query('FETCH FORWARD 5 FROM txn_cursor;');
    await client.query('CLOSE txn_cursor;');

    await client.query('COMMIT');
    res.json({ inserted: txnResult.rows[0], recent: fetchCursor.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Transaction failed' });
  } finally {
    client.release();
  }
});

export default router;
