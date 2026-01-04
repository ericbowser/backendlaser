-- Migration: Update tag table schema
-- Description: Remove tagside column, convert text_line columns to TEXT, add is_qr_code and qr_code_svg columns
-- Date: 2025-01-XX

-- Start transaction
BEGIN;

-- Drop the tagside column (no longer needed)
ALTER TABLE lasertg.tag DROP COLUMN IF EXISTS tagside;

-- Rename and convert text_line columns to include side information
-- Rename columns to make side mapping explicit: side_1_text_line_1, side_1_text_line_2, etc.
ALTER TABLE lasertg.tag 
    RENAME COLUMN text_line_1 TO side_1_text_line_1;
ALTER TABLE lasertg.tag 
    RENAME COLUMN text_line_2 TO side_1_text_line_2;
ALTER TABLE lasertg.tag 
    RENAME COLUMN text_line_3 TO side_1_text_line_3;
ALTER TABLE lasertg.tag 
    RENAME COLUMN text_line_4 TO side_2_text_line_1;
ALTER TABLE lasertg.tag 
    RENAME COLUMN text_line_5 TO side_2_text_line_2;
ALTER TABLE lasertg.tag 
    RENAME COLUMN text_line_6 TO side_2_text_line_3;

-- Convert renamed columns from array types to TEXT (if needed)
ALTER TABLE lasertg.tag 
    ALTER COLUMN side_1_text_line_1 TYPE TEXT USING side_1_text_line_1::TEXT,
    ALTER COLUMN side_1_text_line_2 TYPE TEXT USING side_1_text_line_2::TEXT,
    ALTER COLUMN side_1_text_line_3 TYPE TEXT USING side_1_text_line_3::TEXT,
    ALTER COLUMN side_2_text_line_1 TYPE TEXT USING side_2_text_line_1::TEXT,
    ALTER COLUMN side_2_text_line_2 TYPE TEXT USING side_2_text_line_2::TEXT,
    ALTER COLUMN side_2_text_line_3 TYPE TEXT USING side_2_text_line_3::TEXT;

-- Add is_qr_code column (BOOLEAN, default false, NOT NULL)
ALTER TABLE lasertg.tag 
    ADD COLUMN IF NOT EXISTS is_qr_code BOOLEAN NOT NULL DEFAULT false;

-- Add qr_code_svg column (TEXT, nullable)
ALTER TABLE lasertg.tag 
    ADD COLUMN IF NOT EXISTS qr_code_svg TEXT;

-- Commit transaction
COMMIT;
