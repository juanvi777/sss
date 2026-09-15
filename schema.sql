CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('client','owner') NOT NULL DEFAULT 'client',
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  client_name VARCHAR(120) NOT NULL,
  service VARCHAR(120) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appointments_date_time (appointment_date, appointment_time),
  KEY idx_appointments_user_date (user_id, appointment_date),
  CONSTRAINT fk_appointments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portfolio_photos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(120) NOT NULL DEFAULT 'Diseño Suldery Nails',
  image_url VARCHAR(500) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_portfolio_order (display_order),
  KEY idx_portfolio_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS working_hours (
  id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  weekday TINYINT UNSIGNED NOT NULL,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  start_time TIME NULL,
  end_time TIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_working_hours_weekday (weekday)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO working_hours (weekday, is_open, start_time, end_time) VALUES
  (1,1,'07:00:00','18:00:00'),
  (2,1,'07:00:00','18:00:00'),
  (3,1,'07:00:00','18:00:00'),
  (4,1,'07:00:00','18:00:00'),
  (5,1,'07:00:00','18:00:00'),
  (6,1,'07:00:00','18:00:00'),
  (7,0,NULL,NULL);


CREATE TABLE IF NOT EXISTS blocked_dates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  blocked_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blocked_dates_date (blocked_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
