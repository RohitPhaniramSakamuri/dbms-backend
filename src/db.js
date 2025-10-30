import pkg from "pg";
import { config } from "./config/env.js";
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: config.dbUrl,
  ssl: { rejectUnauthorized: false },
});
