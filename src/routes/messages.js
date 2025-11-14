const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  const { userId } = req.body; // In a real app, get this from auth.

  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in to view your chats.' });
  }

  try {
    const query = `
      SELECT
        cr.id,
        r.id as "ride.id",
        r.source as "ride.source",
        r.destination as "ride.destination",
        r.date as "ride.date",
        r.time as "ride.time",
        r.seats_left as "ride.seatsLeft",
        r.status as "ride.status",
        (
          SELECT json_build_object(
            'content', m.content,
            'createdAt', m.createdAt,
            'author', json_build_object('fullname', u.fullname)
          )
          FROM messages m
          JOIN users u ON m.authorId = u.id
          WHERE m.chatRoomId = cr.id
          ORDER BY m.createdAt DESC
          LIMIT 1
        ) as "lastMessage",
        0 as "unreadCount" -- Placeholder
      FROM chat_rooms cr
      JOIN rides r ON cr.rideId = r.id
      WHERE EXISTS (
        SELECT 1
        FROM chat_room_users cru
        WHERE cru.chatRoomId = cr.id AND cru.userId = $1
      ) OR r.creatorId = $1
      ORDER BY (SELECT MAX(createdAt) FROM messages WHERE chatRoomId = cr.id) DESC
    `;

    const result = await db.query(query, [userId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching user chats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch chats' });
  }
});

router.get('/:chatRoomId', async (req, res) => {
  const { chatRoomId } = req.params;
  const { userId } = req.body; // In a real app, get this from auth.

  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in to view messages.' });
  }

  try {
    const chatRoomUserResult = await db.query(
      'SELECT 1 FROM chat_room_users WHERE userId = $1 AND chatRoomId = $2',
      [userId, chatRoomId]
    );

    if (chatRoomUserResult.rows.length === 0) {
      return res.status(403).json({ error: "You don't have access to this chat." });
    }

    const query = `
      SELECT
        m.id,
        m.content,
        m.createdAt,
        json_build_object(
          'id', u.id,
          'fullname', u.fullname,
          'email', u.email
        ) as author
      FROM messages m
      JOIN users u ON m.authorId = u.id
      WHERE m.chatRoomId = $1
      ORDER BY m.createdAt ASC
    `;

    const result = await db.query(query, [chatRoomId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: 'Failed to load messages' });
  }
});

router.post('/:chatRoomId', async (req, res) => {
  const { chatRoomId } = req.params;
  const { userId, content } = req.body; // In a real app, get userId from auth.

  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in to send messages.' });
  }

  try {
    const chatRoomUserResult = await db.query(
      'SELECT 1 FROM chat_room_users WHERE userId = $1 AND chatRoomId = $2',
      [userId, chatRoomId]
    );

    if (chatRoomUserResult.rows.length === 0) {
      return res.status(403).json({ error: "You don't have access to this chat." });
    }

    const rideResult = await db.query(
      'SELECT status FROM rides WHERE id = (SELECT rideId FROM chat_rooms WHERE id = $1)',
      [chatRoomId]
    );

    if (rideResult.rows.length > 0 && rideResult.rows[0].status === 'COMPLETED') {
      return res.status(403).json({ error: 'Cannot send messages to completed rides' });
    }

    const query = `
      INSERT INTO messages (content, chatRoomId, authorId)
      VALUES ($1, $2, $3)
      RETURNING id, content, createdAt, (SELECT row_to_json(u) FROM users u WHERE u.id = $3) as author
    `;

    const result = await db.query(query, [content, chatRoomId, userId]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

module.exports = router;
