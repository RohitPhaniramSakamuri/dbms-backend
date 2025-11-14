const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/auto-complete-rides', async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const now = new Date();

    const ridesToCompleteQuery = `
      UPDATE rides
      SET status = 'COMPLETED'
      WHERE status = 'ONGOING' AND date <= $1
      RETURNING id
    `;
    const ridesToCompleteResult = await client.query(ridesToCompleteQuery, [now]);

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      completedCount: ridesToCompleteResult.rows.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error completing rides:', error);
    res.status(500).json({ success: false, error: 'Failed to complete rides' });
  } finally {
    client.release();
  }
});

module.exports = router;
