-- SQL migration to create tables based on the Prisma schema from the uniride project.

-- Enable uuid-ossp extension for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum for RideStatus
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ridestatus') THEN
        CREATE TYPE RideStatus AS ENUM ('ONGOING', 'COMPLETED');
    END IF;
END$$;

-- Enum for NotificationType
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificationtype') THEN
        CREATE TYPE NotificationType AS ENUM ('JOINED_RIDE', 'LEFT_RIDE', 'NEW_MESSAGE', 'RIDE_REMINDER');
    END IF;
END$$;

-- User Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    fullname VARCHAR(255) NOT NULL,
    regno VARCHAR(255),
    gender VARCHAR(255)
);

-- Ride Table
CREATE TABLE IF NOT EXISTS rides (
    id VARCHAR(255) PRIMARY KEY DEFAULT uuid_generate_v4(),
    source VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    date TIMESTAMP NOT NULL,
    time VARCHAR(255) NOT NULL,
    car_class VARCHAR(255) NOT NULL,
    car_model VARCHAR(255) NOT NULL,
    total_seats INTEGER NOT NULL,
    seats_left INTEGER NOT NULL,
    ride_cost INTEGER NOT NULL,
    gender_pref VARCHAR(255) NOT NULL,
    air_conditioning BOOLEAN NOT NULL,
    desc_text TEXT NOT NULL,
    status RideStatus DEFAULT 'ONGOING',
    creatorId VARCHAR(255) REFERENCES users(id),
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP
);

-- Passenger Table
CREATE TABLE IF NOT EXISTS passengers (
    id VARCHAR(255) PRIMARY KEY DEFAULT uuid_generate_v4(),
    rideId VARCHAR(255) REFERENCES rides(id),
    userId VARCHAR(255) REFERENCES users(id),
    UNIQUE(rideId, userId)
);

-- ChatRoom Table
CREATE TABLE IF NOT EXISTS chat_rooms (
    id VARCHAR(255) PRIMARY KEY DEFAULT uuid_generate_v4(),
    rideId VARCHAR(255) UNIQUE REFERENCES rides(id),
    createdAt TIMESTAMP DEFAULT NOW()
);

-- ChatRoomUser Table
CREATE TABLE IF NOT EXISTS chat_room_users (
    userId VARCHAR(255) REFERENCES users(id),
    chatRoomId VARCHAR(255) REFERENCES chat_rooms(id),
    PRIMARY KEY (userId, chatRoomId)
);

-- Message Table
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(255) PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    chatRoomId VARCHAR(255) REFERENCES chat_rooms(id),
    authorId VARCHAR(255) REFERENCES users(id),
    createdAt TIMESTAMP DEFAULT NOW()
);

-- Notification Table
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(255) PRIMARY KEY DEFAULT uuid_generate_v4(),
    type NotificationType NOT NULL,
    message VARCHAR(255) NOT NULL,
    read BOOLEAN DEFAULT false,
    rideId VARCHAR(255) REFERENCES rides(id),
    userId VARCHAR(255) REFERENCES users(id),
createdAt TIMESTAMP DEFAULT NOW()
);
