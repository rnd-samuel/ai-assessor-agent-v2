-- backend/schema.sql

-- Enable the pgvector extension (if not already done)
CREATE EXTENSION IF NOT EXISTS vector;

-- (FR-USER-001) User Management Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('User', 'Project Manager', 'Admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- (FR-PROJ-001) Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  creator_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT false
);

-- (U9, P3) Pivot Table to link Users to Projects
CREATE TABLE IF NOT EXISTS project_users (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

-- (U9, FR-AI-001) Reports Table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT false
);

-- (A13) Table to store Competency Dictionaries
CREATE TABLE IF NOT EXISTS competency_dictionaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  content JSONB NOT NULL, -- Store the whole dictionary as JSON
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- This adds the missing UNIQUE constraint to the competency_dictionaries table.
ALTER TABLE competency_dictionaries
ADD CONSTRAINT competency_dictionaries_name_key UNIQUE (name);

-- (P12) Table to store custom prompts for each project
CREATE TABLE IF NOT EXISTS project_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  general_context TEXT,
  persona_prompt TEXT,
  evidence_prompt TEXT,
  analysis_prompt TEXT,
  summary_prompt TEXT
);

-- (P10) Add a column to 'projects' to link the chosen dictionary
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS dictionary_id UUID REFERENCES competency_dictionaries(id);

-- --- (NEW) Tables for Simulation Methods (A14, NP-4.5) ---

-- Stores the "tags" or "types" of methods (e.g., "Case Study", "Roleplay")
CREATE TABLE IF NOT EXISTS global_simulation_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pivot table to link which projects use which *global* methods
CREATE TABLE IF NOT EXISTS projects_to_global_methods (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  method_id UUID REFERENCES global_simulation_methods(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, method_id)
);

-- Stores project-specific simulation method definitions (if a PM adds a custom one)
CREATE TABLE IF NOT EXISTS project_simulation_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --- (NEW) Table for Report Files (NR-6.2) ---

-- Stores the metadata for each file uploaded for a specific report
CREATE TABLE IF NOT EXISTS report_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  gcs_path VARCHAR(1024) NOT NULL, -- Path to the file in Google Cloud Storage
  
  -- Link to the simulation method used (can be global or project-specific)
  -- We use two separate, nullable foreign keys for this.
  global_method_id UUID REFERENCES global_simulation_methods(id),
  project_method_id UUID REFERENCES project_simulation_methods(id),

  -- Ensures that a file is tagged with one (and only one) method type
  CONSTRAINT chk_method_link CHECK (
    (global_method_id IS NOT NULL AND project_method_id IS NULL) OR
    (global_method_id IS NULL AND project_method_id IS NOT NULL)
  )
);

-- (RP-7.4) Add a status to the reports table
ALTER TABLE reports
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PROCESSING' NOT NULL;

-- (RP-7.4) Table to store Phase 1 AI-generated evidence
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Data from the Zod Schema in ai-phase1-service.ts
  competency TEXT NOT NULL,
  level TEXT NOT NULL,
  kb TEXT NOT NULL,
  quote TEXT NOT NULL,
  source TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  
  -- (RP-7.9) Track edits and deletions
  is_archived BOOLEAN DEFAULT false,
  last_edited_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects_to_global_methods (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  method_id UUID REFERENCES global_simulation_methods(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, method_id)
);

-- Inserts two test methods for your dropdown.
-- Using 'ON CONFLICT' is a safe way to avoid errors if you run this twice.
INSERT INTO global_simulation_methods (id, name) VALUES
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Case Study'),
  ('747ac10b-58cc-4372-a567-0e02b2c3d480', 'Roleplay')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE report_files
ADD COLUMN IF NOT EXISTS simulation_method_tag VARCHAR(255),
ADD COLUMN IF NOT EXISTS file_content TEXT;

-- We'll also drop the complex constraint for now to simplify
ALTER TABLE report_files
DROP CONSTRAINT IF EXISTS chk_method_link,
ALTER COLUMN global_method_id DROP NOT NULL,
ALTER COLUMN project_method_id DROP NOT NULL;

-- (RP-7.11) Phase 2: Competency Analysis Results
CREATE TABLE IF NOT EXISTS competency_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  competency VARCHAR(255) NOT NULL,
  
  -- AI Assessment Data
  level_achieved VARCHAR(50),
  explanation TEXT,
  development_recommendations TEXT,
  
  -- Store Key Behaviors status as JSON
  -- Structure: [{ "kb": "...", "fulfilled": true/false, "evidenceIds": [] }]
  key_behaviors_status JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- (RP-7.14) Phase 3: Executive Summary
CREATE TABLE IF NOT EXISTS executive_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  
  strengths TEXT,
  areas_for_improvement TEXT,
  recommendations TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- (ADM-8.7) Stores the actual content/files for global methods (e.g., the specific Case Study text)
CREATE TABLE IF NOT EXISTS global_simulation_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  file_content TEXT, -- Storing text content directly for RAG/Checking
  
  -- Link to the tag (e.g., 'Case Study')
  method_id UUID REFERENCES global_simulation_methods(id) ON DELETE CASCADE,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --- DAY 2 UPDATES: FILE HANDLING & VALIDATION (REVISED) ---

-- 1. Create table for Project-level files
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  gcs_path VARCHAR(1024) NOT NULL,
  file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('template', 'knowledgeBase', 'simulationMethod')),
  file_hash VARCHAR(64), 
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add hash/path columns to existing tables
ALTER TABLE report_files 
ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);

ALTER TABLE global_simulation_files
ADD COLUMN IF NOT EXISTS gcs_path VARCHAR(1024),
ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);

-- 3. (REVISED) Unique Project Name per Creator (Active Only)
-- This allows duplicate names if the old one is archived.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_active_name_creator 
ON projects (lower(name), creator_id) 
WHERE is_archived = false;

-- 4. (REVISED) Unique Report Title per Project (Active Only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_active_title_project 
ON reports (lower(title), project_id) 
WHERE is_archived = false;

-- 5. (OPTIONAL) Enforce File Uniqueness Scope
-- This ensures a file (by hash) is unique per project, but allowed in others.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_files_hash
ON project_files (project_id, file_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_files_hash
ON report_files (report_id, file_hash);

-- DAY 3: Project Configuration & Validation

-- 1. Add configuration flags to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS enable_analysis BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_summary BOOLEAN DEFAULT true;

-- 1. Support for Password Reset (AUTH-1.2)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;

-- 2. Support for Simulation Method Descriptions (NP-4.5 / ADM-8.7)
ALTER TABLE global_simulation_methods
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE project_simulation_methods
ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Support for Simulation Method Tag in Files (Cleanup/Verify)
-- (We already have simulation_method_tag in report_files, but we might need to formalize it later. 
-- For now, the current schema is fine for Sprint 1's logic, but for ADM-8.7 we might need a 'tag' column if 'name' isn't enough. 
-- Let's assume 'name' is the tag for now.)

-- Link projects to specific global simulation files (ADM-8.7 / NP-4.5 Revised)
CREATE TABLE IF NOT EXISTS projects_to_simulation_files (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_id UUID REFERENCES global_simulation_files(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, file_id)
);

-- (ADM-8.8 / ADM-8.9) System Settings Table
-- Stores configuration as JSONB (e.g., key='ai_config', value={...})
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- (ADM-8.11) AI Models Management
CREATE TABLE IF NOT EXISTS ai_models (
  id VARCHAR(255) PRIMARY KEY, -- The OpenRouter Model ID (e.g., "openai/gpt-4o")
  name VARCHAR(255), -- Friendly name (optional, or same as ID)
  context_window INT DEFAULT 128000,
  input_cost_per_m NUMERIC(10, 4) DEFAULT 0, -- Cost in USD per 1M tokens
  output_cost_per_m NUMERIC(10, 4) DEFAULT 0,
  supports_temperature BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Seed initial data (so the app isn't empty)
INSERT INTO ai_models (id, name, context_window, input_cost_per_m, output_cost_per_m)
VALUES 
  ('openrouter/openai/gpt-4o', 'GPT-4o', 128000, 5.00, 15.00),
  ('openrouter/anthropic/claude-3-opus', 'Claude 3 Opus', 200000, 15.00, 75.00),
  ('openrouter/google/gemini-pro-1.5', 'Gemini 1.5 Pro', 1000000, 3.50, 10.50)
ON CONFLICT DO NOTHING;

-- 1. Enable vector extension (if not already)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the Chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Polymorphic link: Can belong to a Report File OR a Global Sim File
  report_file_id UUID REFERENCES report_files(id) ON DELETE CASCADE,
  global_file_id UUID REFERENCES global_simulation_files(id) ON DELETE CASCADE,
  
  chunk_index INT NOT NULL, -- To keep order
  chunk_content TEXT NOT NULL,
  embedding vector(1536), -- Dimensions for text-embedding-3-small (OpenAI) or similar
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure a chunk belongs to only one type of file
  CONSTRAINT chk_file_source CHECK (
    (report_file_id IS NOT NULL AND global_file_id IS NULL) OR
    (report_file_id IS NULL AND global_file_id IS NOT NULL)
  )
);

-- 3. Create Index for faster similarity search
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 4. Cleanup old columns (OPTIONAL - Run only if you want to drop data now)
-- ALTER TABLE report_files DROP COLUMN IF EXISTS file_content;
-- ALTER TABLE global_simulation_files DROP COLUMN IF EXISTS file_content;

-- 1. Remove the inefficient index we just made
DROP INDEX IF EXISTS document_chunks_embedding_idx;

-- 2. Create an HNSW index instead (Better for dynamic data)
CREATE INDEX document_chunks_embedding_idx 
ON document_chunks 
USING hnsw (embedding vector_cosine_ops);

-- 1. Add the missing column for Project Files
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS project_file_id UUID REFERENCES project_files(id) ON DELETE CASCADE;

-- 2. Drop the old constraint (if it exists)
ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS chk_file_source;

-- 3. Add a stricter constraint: Exactly one ID must be present
ALTER TABLE document_chunks 
ADD CONSTRAINT chk_file_source CHECK (
  (
    (report_file_id IS NOT NULL)::integer + 
    (global_file_id IS NOT NULL)::integer + 
    (project_file_id IS NOT NULL)::integer
  ) = 1
);

ALTER TABLE report_files 
ADD COLUMN IF NOT EXISTS extracted_text TEXT;

ALTER TABLE report_files 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE evidence 
ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;

-- 1. Add text column to Project Files (Knowledge Base)
ALTER TABLE project_files 
ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- 2. Add text column to Global Files (For future use)
ALTER TABLE global_simulation_files 
ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- 1. Allow projects to store their specific guide and initialization status
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS context_guide TEXT,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'READY'; 
-- 'status' will track if the AI is still reading the KB files (INITIALIZING vs READY)

-- 2. Allow simulation methods to store their specific guide
ALTER TABLE global_simulation_methods 
ADD COLUMN IF NOT EXISTS context_guide TEXT;

-- Note: The 'Global Knowledge Context' will be stored in your existing 'system_settings' table 
-- under the key 'global_context_guide', so no schema change is needed there.

CREATE TABLE IF NOT EXISTS global_knowledge_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  gcs_path VARCHAR(1024) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- 1. Add context_guide to the specific FILES table
ALTER TABLE global_simulation_files 
ADD COLUMN IF NOT EXISTS context_guide TEXT;

-- 2. (Optional) Remove it from the methods table to avoid confusion
ALTER TABLE global_simulation_methods DROP COLUMN IF EXISTS context_guide;

-- Run this in your database console
ALTER TABLE reports ADD COLUMN active_job_id VARCHAR(255);

ALTER TABLE reports ADD COLUMN IF NOT EXISTS active_job_id VARCHAR(255);