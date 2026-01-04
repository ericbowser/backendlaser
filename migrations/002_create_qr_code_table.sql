-- Migration: Create qr_code table
-- Description: Create separate table for QR code data with JSONB storage for SVG and metadata
-- Date: 2025-01-XX

-- Start transaction
BEGIN;

-- Create qr_code table
CREATE TABLE IF NOT EXISTS lasertg.qr_code (
    id SERIAL PRIMARY KEY,
    tag_id INTEGER NOT NULL REFERENCES lasertg.tag(id) ON DELETE CASCADE,
    qr_code_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on tag_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_qr_code_tag_id ON lasertg.qr_code(tag_id);

-- Create GIN index on qr_code_data for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_qr_code_data_gin ON lasertg.qr_code USING GIN(qr_code_data);

-- Create unique constraint to ensure one QR code per tag
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_code_tag_id_unique ON lasertg.qr_code(tag_id);

-- Commit transaction
COMMIT;
