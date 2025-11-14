-- ========================
-- MIGRATIONS.SQL (FIXED)
-- ========================

-- 1. Tables

-- CREATE TABLE IF NOT EXISTS users (
--   user_id SERIAL PRIMARY KEY,
--   full_name VARCHAR(100) NOT NULL,
--   email VARCHAR(120) UNIQUE NOT NULL,
--   password_hash TEXT NOT NULL,
--   role VARCHAR(20) CHECK (role IN ('rider', 'driver', 'admin')) NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS drivers (
--   driver_id SERIAL PRIMARY KEY,
--   user_id INT UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
--   license_number VARCHAR(50) UNIQUE NOT NULL,
--   is_active BOOLEAN DEFAULT TRUE,
--   rating_avg NUMERIC(3,2) DEFAULT 0.0,
--   total_rides INT DEFAULT 0
-- );

-- CREATE TABLE IF NOT EXISTS vehicles (
--   vehicle_id SERIAL PRIMARY KEY,
--   driver_id INT REFERENCES drivers(driver_id) ON DELETE CASCADE,
--   plate_number VARCHAR(20) UNIQUE NOT NULL,
--   model VARCHAR(50),
--   color VARCHAR(30)
-- );

-- CREATE TABLE IF NOT EXISTS rides (
--   ride_id SERIAL PRIMARY KEY,
--   rider_id INT REFERENCES users(user_id),
--   driver_id INT REFERENCES drivers(driver_id),
--   pickup_location VARCHAR(255),
--   dropoff_location VARCHAR(255),
--   fare NUMERIC(8,2),
--   status VARCHAR(20) CHECK (status IN ('requested', 'accepted', 'completed', 'cancelled')),
--   requested_at TIMESTAMP DEFAULT NOW(),
--   completed_at TIMESTAMP
-- );

-- CREATE TABLE IF NOT EXISTS payments (
--   payment_id SERIAL PRIMARY KEY,
--   ride_id INT REFERENCES rides(ride_id),
--   amount NUMERIC(8,2),
--   status VARCHAR(20) CHECK (status IN ('initiated', 'completed', 'failed')),
--   method VARCHAR(20),
--   transaction_id VARCHAR(100) UNIQUE,
--   paid_at TIMESTAMP,
--   idempotency_key VARCHAR(100)
-- );

-- CREATE TABLE IF NOT EXISTS locations (
--   location_id SERIAL PRIMARY KEY,
--   driver_id INT REFERENCES drivers(driver_id),
--   latitude DECIMAL(9,6),
--   longitude DECIMAL(9,6),
--   updated_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS ratings (
--   rating_id SERIAL PRIMARY KEY,
--   ride_id INT REFERENCES rides(ride_id),
--   driver_id INT REFERENCES drivers(driver_id),
--   rider_id INT REFERENCES users(user_id),
--   rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
--   comment TEXT,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS ride_audit (
--   audit_id SERIAL PRIMARY KEY,
--   ride_id INT,
--   action VARCHAR(50),
--   old_status VARCHAR(20),
--   new_status VARCHAR(20),
--   changed_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS system_logs (
--   log_id SERIAL PRIMARY KEY,
--   message TEXT,
--   log_time TIMESTAMP DEFAULT NOW()
-- );

-- ========================
-- 2. FUNCTIONS & TRIGGERS
-- ========================

-- Assign nearest available driver
-- CREATE OR REPLACE FUNCTION assign_driver(p_rider INT, p_pickup VARCHAR)
-- RETURNS INT AS $$
-- DECLARE
--   d_id INT;
--   r_id INT;
-- BEGIN
--   SELECT driver_id INTO d_id
--   FROM drivers
--   WHERE is_active = TRUE
--   ORDER BY RANDOM() LIMIT 1;

--   INSERT INTO rides (rider_id, driver_id, pickup_location, status)
--   VALUES (p_rider, d_id, p_pickup, 'requested')
--   RETURNING ride_id INTO r_id;

--   RETURN r_id;
-- END;
-- $$ LANGUAGE plpgsql;


-- Log ride status change
-- CREATE OR REPLACE FUNCTION log_ride_update()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF NEW.status <> OLD.status THEN
--     INSERT INTO ride_audit(ride_id, action, old_status, new_status)
--     VALUES (NEW.ride_id, 'STATUS_CHANGE', OLD.status, NEW.status);
--   END IF;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- DROP TRIGGER IF EXISTS trg_ride_update ON rides;
-- CREATE TRIGGER trg_ride_update
-- AFTER UPDATE ON rides
-- FOR EACH ROW
-- EXECUTE FUNCTION log_ride_update();


-- Recalculate driver rating avg
-- CREATE OR REPLACE FUNCTION update_driver_rating()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   UPDATE drivers
--   SET rating_avg = (
--     SELECT AVG(rating)::NUMERIC(3,2)
--     FROM ratings
--     WHERE driver_id = NEW.driver_id
--   )
--   WHERE driver_id = NEW.driver_id;

--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- DROP TRIGGER IF EXISTS trg_ratings_change ON ratings;
-- CREATE TRIGGER trg_ratings_change
-- AFTER INSERT OR UPDATE ON ratings
-- FOR EACH ROW
-- EXECUTE FUNCTION update_driver_rating();


-- Cursor-based daily earnings aggregation
-- CREATE OR REPLACE FUNCTION calc_daily_earnings()
-- RETURNS TABLE(driver_id INT, total NUMERIC) AS $$
-- DECLARE
--   r RECORD;
--   cur CURSOR FOR
--     SELECT r.driver_id, SUM(p.amount) AS total
--     FROM rides r
--     JOIN payments p ON r.ride_id = p.ride_id
--     WHERE p.status = 'completed'
--     GROUP BY r.driver_id;
-- BEGIN
--   OPEN cur;
--   LOOP
--     FETCH cur INTO r;
--     EXIT WHEN NOT FOUND;

--     driver_id := r.driver_id;
--     total := r.total;

--     RETURN NEXT;
--   END LOOP;
--   CLOSE cur;
-- END;
-- $$ LANGUAGE plpgsql;
