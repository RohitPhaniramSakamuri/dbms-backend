import express from 'express';
import { pool } from '../db.js';
const router = express.Router();

router.get('/monthly/:user_id/:month/:year', async (req, res) => {
  const { user_id, month, year } = req.params;
  try {
    const result = await pool.query('SELECT * FROM monthly_summary WHERE user_id=$1 AND month=$2 AND year=$3', [user_id, month, year]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});


router.get("/daily-earnings", async (_, res) => {
  try {
    const result = await pool.query("SELECT * FROM calc_daily_earnings()");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error calculating daily earnings");
  }
});


export default router;
