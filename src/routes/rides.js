// src/routes/rides.js
import express from "express";
import { pool } from "../db.js";
const router = express.Router();

// Start a new ride via stored function
router.post("/request", async (req, res) => {
  const { rider_id, pickup } = req.body;
  try {
    const result = await pool.query("SELECT assign_driver($1, $2)", [rider_id, pickup]);
    res.json({ ride_id: result.rows[0].assign_driver });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error assigning driver");
  }
});

// Mark ride as complete with a payment transaction
router.post("/complete/:id", async (req, res) => {
  const client = await pool.connect();
  const ride_id = req.params.id;
  const { amount, txn } = req.body;

  try {
    await client.query("BEGIN");

    await client.query(
      "UPDATE rides SET status='completed', completed_at=NOW() WHERE ride_id=$1",
      [ride_id]
    );
    await client.query(
      "INSERT INTO payments (ride_id, amount, status, method, transaction_id, paid_at) VALUES ($1,$2,'completed','upi',$3,NOW())",
      [ride_id, amount, txn]
    );
    await client.query(
      "UPDATE drivers SET total_rides = total_rides + 1 WHERE driver_id = (SELECT driver_id FROM rides WHERE ride_id=$1)",
      [ride_id]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).send("Transaction failed");
  } finally {
    client.release();
  }
});

export default router;
