import { OAuth2Client } from "google-auth-library";
import { config } from "../config/env.js";
import { pool } from "../db.js";
import { signJwt } from "../utils/jwt.js";

const client = new OAuth2Client(config.googleClientId);

export async function googleLogin(req, res) {
  try {
    const { idToken } = req.body;
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    let user = await pool.query(
      `SELECT * FROM users WHERE google_id = $1 OR email = $2 LIMIT 1`,
      [googleId, email]
    );

    if (user.rows.length === 0) {
      user = await pool.query(
        `INSERT INTO users (name, email, google_id, avatar_url)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, email, googleId, picture]
      );
    } else {
      user = user.rows[0];
    }

    const token = signJwt({ id: user.id, email: user.email });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Google login failed" });
  }
}
