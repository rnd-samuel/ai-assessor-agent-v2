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
-- We will add tables for 'evidence', 'analysis', etc. later