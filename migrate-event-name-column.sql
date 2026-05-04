-- Migration: Increase event_name column size from VARCHAR(150) to VARCHAR(500)
-- and add warmup_time column to meet_days
-- This allows for longer event names with session tags and gender prefixes
-- and stores warmup timing information for each session

USE hello_db;

ALTER TABLE meet_events MODIFY COLUMN event_name VARCHAR(500) NOT NULL;
ALTER TABLE meet_days ADD COLUMN warmup_time VARCHAR(100) NULL;

SELECT 'Migration completed: meet_events.event_name expanded to VARCHAR(500) and meet_days.warmup_time added' AS status;
