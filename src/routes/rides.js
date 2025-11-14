const express = require('express');
const router = express.Router();
const db = require('../db');
const { z } = require('zod');

const rideFormSchema = z
  .object({
    source: z.string().trim().min(2),
    destination: z.string().trim().min(2),
    date: z.coerce.date(),
    time: z.string().min(1),
    car_class: z.string().trim().min(1),
    car_model: z.string().trim().min(2),
    total_seats: z.number().min(2).max(20),
    ride_cost: z.number().min(1).max(4000),
    gender_pref: z.enum(["any", "male", "female"]),
    air_conditioning: z.enum(["ac", "nonac"]),
    desc_text: z
      .string()
      .trim()
      .min(10)
      .max(100)
      .refine((text) => text.replace(/\s/g, "").length > 0)
      .refine((text) => !/[<>{}]/.test(text)),
  })
  .refine((data) => data.source !== data.destination, {
    message: "Pickup and destination must be different.",
    path: ["destination"],
  });

router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT
        r.id,
        c.fullname,
        c.email,
        r.ride_cost,
        r.source,
        r.destination,
        r.time,
        r.date,
        r.seats_left,
        r.total_seats,
        r.desc_text,
        r.car_class,
        r.car_model,
        r.air_conditioning,
        r.gender_pref,
        r.status,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'id', u.id,
            'fullname', u.fullname,
            'email', u.email
          )), '[]')
          FROM passengers p
          JOIN users u ON p.userId = u.id
          WHERE p.rideId = r.id
        ) as passengers,
        cr.id as "chatRoomId"
      FROM rides r
      JOIN users c ON r.creatorId = c.id
      LEFT JOIN chat_rooms cr ON r.id = cr.rideId
      WHERE r.status != 'COMPLETED'
      ORDER BY r.createdAt DESC
    `;

    const result = await db.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Failed to fetch rides:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch rides' });
  }
});

router.post('/', async (req, res) => {
  // For now, we'll get the user ID from the request body.
  // In a real application, you would get this from the session or a token.
  const { userId, ...formData } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in to create a ride.' });
  }

  const client = await db.getClient();

  try {
    const processedData = {
      ...formData,
      total_seats: Number(formData.total_seats),
      ride_cost: Number(formData.ride_cost),
      date: new Date(formData.date),
      time: formData.time,
    };

    const result = rideFormSchema.safeParse(processedData);

    if (!result.success) {
      const errors = result.error.flatten();
      console.error("Validation errors:", errors);
      return res.status(400).json({
        error: Object.entries(errors.fieldErrors)
          .map(([field, messages]) => `${field}: ${messages?.join(", ")}`)
          .join(" | "),
      });
    }

    const data = result.data;

    await client.query('BEGIN');

    const rideQuery = `
      INSERT INTO rides (source, destination, date, time, car_class, car_model, total_seats, seats_left, ride_cost, gender_pref, air_conditioning, desc_text, status, creatorId)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ONGOING', $13)
      RETURNING id, date
    `;
    const rideValues = [
      data.source,
      data.destination,
      data.date,
      data.time,
      data.car_class,
      data.car_model,
      data.total_seats,
      data.total_seats - 1,
      data.ride_cost,
      data.gender_pref,
      data.air_conditioning === 'ac',
      data.desc_text,
      userId,
    ];
    const rideResult = await client.query(rideQuery, rideValues);
    const newRide = rideResult.rows[0];

    const chatRoomQuery = `
      INSERT INTO chat_rooms (rideId)
      VALUES ($1)
      RETURNING id
    `;
    const chatRoomResult = await client.query(chatRoomQuery, [newRide.id]);
    const newChatRoom = chatRoomResult.rows[0];

    const chatRoomUserQuery = `
      INSERT INTO chat_room_users (userId, chatRoomId)
      VALUES ($1, $2)
    `;
    await client.query(chatRoomUserQuery, [userId, newChatRoom.id]);

    const passengerQuery = `
      INSERT INTO passengers (userId, rideId)
      VALUES ($1, $2)
    `;
    await client.query(passengerQuery, [userId, newRide.id]);

    await client.query('COMMIT');

    res.status(201).json({ success: true, redirect: '/messages' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in createRide:', error);
    res.status(500).json({ success: false, error: 'Failed to create ride' });
  } finally {
    client.release();
  }
});

router.post('/:rideId/join', async (req, res) => {
  const { rideId } = req.params;
  const { userId } = req.body; // In a real app, get this from auth.

  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in to join a ride.' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Get user
    const userResult = await client.query('SELECT id, gender FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      throw new Error('User not found');
    }

    // Get ride
    const rideResult = await client.query('SELECT * FROM rides WHERE id = $1', [rideId]);
    const ride = rideResult.rows[0];
    if (!ride) {
      throw new Error('Ride not found');
    }

    // Check if ride is full
    if (ride.seats_left <= 0) {
      throw new Error('This ride is already full');
    }

    // Check if user is already a passenger
    const passengerResult = await client.query('SELECT id FROM passengers WHERE rideId = $1 AND userId = $2', [rideId, userId]);
    if (passengerResult.rows.length > 0) {
      throw new Error("You've already joined this ride");
    }

    // Check gender preference
    if (ride.gender_pref !== 'any' && ride.gender_pref !== user.gender.toLowerCase()) {
      throw new Error(`This ride is for ${ride.gender_pref} only`);
    }

    // Add user as passenger
    await client.query('INSERT INTO passengers (userId, rideId) VALUES ($1, $2)', [userId, rideId]);

    // Add user to chat room
    const chatRoomResult = await client.query('SELECT id FROM chat_rooms WHERE rideId = $1', [rideId]);
    if (chatRoomResult.rows.length > 0) {
      const chatRoomId = chatRoomResult.rows[0].id;
      await client.query('INSERT INTO chat_room_users (userId, chatRoomId) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, chatRoomId]);
    }

    // Update available seats
    await client.query('UPDATE rides SET seats_left = seats_left - 1 WHERE id = $1', [rideId]);

    await client.query('COMMIT');

    res.status(200).json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error joining ride:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

router.get('/:rideId/details', async (req, res) => {
  const { rideId } = req.params;
  const { userId } = req.body; // In a real app, get this from auth.

  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in to view ride details.' });
  }

  try {
    const rideQuery = `
      SELECT
        r.id,
        r.source,
        r.destination,
        r.date,
        r.time,
        r.car_class as "carClass",
        r.car_model as "carModel",
        r.total_seats as "totalSeats",
        r.seats_left as "seatsLeft",
        r.ride_cost as "rideCost",
        r.gender_pref as "genderPref",
        r.air_conditioning as "airConditioning",
        r.desc_text as "descText",
        r.status,
        r.creatorId,
        (
          SELECT json_build_object(
            'id', u.id,
            'fullname', u.fullname,
            'email', u.email
          )
          FROM users u
          WHERE u.id = r.creatorId
        ) as creator,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'id', u.id,
            'fullname', u.fullname,
            'email', u.email
          )), '[]')
          FROM passengers p
          JOIN users u ON p.userId = u.id
          WHERE p.rideId = r.id
        ) as passengers
      FROM rides r
      WHERE r.id = $1
    `;

    const rideResult = await db.query(rideQuery, [rideId]);
    const ride = rideResult.rows[0];

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    const isPassenger = ride.passengers.some(p => p.id === userId);
    if (ride.creatorId !== userId && !isPassenger) {
      return res.status(403).json({ error: "You don't have access to this ride" });
    }

    const members = [
      {
        id: ride.creator.id,
        fullname: ride.creator.fullname,
        email: ride.creator.email,
        isOwner: true,
      },
      ...ride.passengers
        .filter((p) => p.id !== ride.creatorId)
        .map((p) => ({
          id: p.id,
          fullname: p.fullname,
          email: p.email,
          isOwner: false,
        })),
    ];

    res.status(200).json({ ...ride, members });
  } catch (error) {
    console.error('Error fetching ride details:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ride details' });
  }
});

module.exports = router;