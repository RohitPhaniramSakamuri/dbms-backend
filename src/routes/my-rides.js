const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  const { userId } = req.body; // In a real app, get this from auth.

  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in to view your rides.' });
  }

  try {
    const query = `
      SELECT
        r.id,
        r.source,
        r.destination,
        r.date,
        r.time,
        r.car_class,
        r.car_model,
        r.total_seats,
        r.seats_left,
        r.ride_cost,
        r.gender_pref,
        r.air_conditioning,
        r.desc_text,
        r.status,
        r.creatorId,
        c.fullname as "creator.fullname",
        c.email as "creator.email",
        (
          SELECT COALESCE(json_agg(json_build_object(
            'id', p.id,
            'user.id', u.id,
            'user.fullname', u.fullname,
            'user.email', u.email
          )), '[]')
          FROM passengers p
          JOIN users u ON p.userId = u.id
          WHERE p.rideId = r.id AND p.userId != r.creatorId
        ) as passengers,
        (r.creatorId = $1) as "isOwner",
        EXISTS (
          SELECT 1
          FROM passengers p
          WHERE p.rideId = r.id AND p.userId = $1 AND p.userId != r.creatorId
        ) as "isParticipant"
      FROM rides r
      JOIN users c ON r.creatorId = c.id
      WHERE (r.creatorId = $1 OR EXISTS (
        SELECT 1
        FROM passengers p
        WHERE p.rideId = r.id AND p.userId = $1
      )) AND r.status = 'ONGOING'
      ORDER BY r.date ASC
    `;

    const result = await db.query(query, [userId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching user rides:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch rides' });
  }
});

router.delete('/:rideId', async (req, res) => {
  const { rideId } = req.params;
  const { userId } = req.body; // In a real app, get this from auth.

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const rideResult = await client.query('SELECT creatorId FROM rides WHERE id = $1', [rideId]);
    const ride = rideResult.rows[0];

    if (!ride) {
      throw new Error('Ride not found');
    }

    if (ride.creatorId !== userId) {
      throw new Error('Only ride owner can delete the ride');
    }

    await client.query('DELETE FROM rides WHERE id = $1', [rideId]);

    await client.query('COMMIT');

    res.status(200).json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting ride:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

router.post('/:rideId/leave', async (req, res) => {
  const { rideId } = req.params;
  const { userId } = req.body; // In a real app, get this from auth.

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const passengerResult = await client.query('SELECT id FROM passengers WHERE rideId = $1 AND userId = $2', [rideId, userId]);
    const passenger = passengerResult.rows[0];

    if (!passenger) {
      throw new Error('Passenger not found');
    }

    await client.query('DELETE FROM passengers WHERE id = $1', [passenger.id]);
    await client.query('UPDATE rides SET seats_left = seats_left + 1 WHERE id = $1', [rideId]);

    await client.query('COMMIT');

    res.status(200).json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error leaving ride:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

router.post('/remove-passenger', async (req, res) => {
  const { passengerId, userId } = req.body; // In a real app, get userId from auth.

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const passengerResult = await client.query('SELECT id, rideId FROM passengers WHERE id = $1', [passengerId]);
    const passenger = passengerResult.rows[0];

    if (!passenger) {
      throw new Error('Passenger not found');
    }

    const rideResult = await client.query('SELECT creatorId FROM rides WHERE id = $1', [passenger.rideId]);
    const ride = rideResult.rows[0];

    if (ride.creatorId !== userId) {
      throw new Error('Only ride owner can remove passengers');
    }

    await client.query('DELETE FROM passengers WHERE id = $1', [passengerId]);
    await client.query('UPDATE rides SET seats_left = seats_left + 1 WHERE id = $1', [passenger.rideId]);

    await client.query('COMMIT');

    res.status(200).json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error removing passenger:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
