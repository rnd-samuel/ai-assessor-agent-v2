-- backend/test-data.sql
-- This script adds test data to your database so you can
-- test the New Report page.

-- 1. Get the ID of your admin user (replace if you used a different email)
-- We'll use this as the 'created_by' user.
WITH admin_user AS (
  SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1
)

-- 2. Insert a new Competency Dictionary
INSERT INTO competency_dictionaries (name, created_by, content)
VALUES (
  'Standard Leadership Dictionary',
  (SELECT id FROM admin_user),
  '{
    "namaKamus": "Standard Leadership Dictionary",
    "kompetensi": [
      {
        "id": "comp-ps",
        "name": "Problem Solving",
        "definisiKompetensi": "Menganalisis situasi, mengidentifikasi akar masalah, dan mengembangkan solusi yang efektif.",
        "level": [
          {
            "nomor": "1",
            "penjelasan": "Deskripsi Level 1 untuk Problem Solving.",
            "keyBehavior": [
              "KB 1.1: Identifikasi masalah yang jelas.",
              "KB 1.2: Kumpulkan informasi relevan."
            ]
          },
          {
            "nomor": "2",
            "penjelasan": "Deskripsi Level 2 untuk Problem Solving.",
            "keyBehavior": [
              "KB 2.1: Analisis data untuk menemukan pola.",
              "KB 2.2: Usulkan solusi sederhana."
            ]
          }
        ]
      },
      {
        "id": "comp-comm",
        "name": "Communication",
        "definisiKompetensi": "Menyampaikan informasi secara jelas, efektif, dan persuasif.",
        "level": [
          {
            "nomor": "1",
            "penjelasan": "Deskripsi Level 1 untuk Komunikasi.",
            "keyBehavior": [
              "KB 1.1: Berbicara dengan jelas.",
              "KB 1.2: Mendengarkan secara aktif."
            ]
          },
          {
            "nomor": "2",
            "penjelasan": "Deskripsi Level 2 untuk Komunikasi.",
            "keyBehavior": [
              "KB 2.1: Menstrukturkan pesan dengan logis.",
              "KB 2.2: Menyesuaikan gaya bicara dengan audiens."
            ]
          }
        ]
      }
    ]
  }'
)
ON CONFLICT (name) DO NOTHING; -- Do nothing if it already exists

-- 3. Insert Global Simulation Methods
WITH admin_user AS (
  SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1
)
INSERT INTO global_simulation_methods (name, created_by)
VALUES
  ('Case Study', (SELECT id FROM admin_user)),
  ('Roleplay', (SELECT id FROM admin_user))
ON CONFLICT (name) DO NOTHING; -- Do nothing if they already exist


-- 4. Link this data to your OLDEST project for testing
-- (This assumes you have at least one project created)
WITH first_project AS (
  SELECT id FROM projects ORDER BY created_at ASC LIMIT 1
),
dictionary AS (
  SELECT id FROM competency_dictionaries WHERE name = 'Standard Leadership Dictionary' LIMIT 1
)
-- Link the dictionary
UPDATE projects
SET dictionary_id = (SELECT id FROM dictionary)
WHERE id = (SELECT id FROM first_project);


-- Link the simulation methods
WITH first_project AS (
  SELECT id FROM projects ORDER BY created_at ASC LIMIT 1
),
methods AS (
  SELECT id FROM global_simulation_methods WHERE name IN ('Case Study', 'Roleplay')
)
INSERT INTO projects_to_global_methods (project_id, method_id)
SELECT (SELECT id FROM first_project), id FROM methods
ON CONFLICT DO NOTHING; -- Do nothing if they are already linked

SELECT 'Test data seeded successfully!' AS status;

UPDATE competency_dictionaries
SET content = '{
    "namaKamus": "Standard Leadership Dictionary",
    "kompetensi": [
      {
        "id": "comp-ps",
        "name": "Problem Solving",
        "definisiKompetensi": "Menganalisis situasi, mengidentifikasi akar masalah, dan mengembangkan solusi yang efektif.",
        "level": [
          {
            "nomor": "1",
            "penjelasan": "Deskripsi Level 1 untuk Problem Solving.",
            "keyBehavior": [
              "KB 1.1: Identifikasi masalah yang jelas.",
              "KB 1.2: Kumpulkan informasi relevan."
            ]
          },
          {
            "nomor": "2",
            "penjelasan": "Deskripsi Level 2 untuk Problem Solving.",
            "keyBehavior": [
              "KB 2.1: Analisis data untuk menemukan pola.",
              "KB 2.2: Usulkan solusi sederhana."
            ]
          }
        ]
      },
      {
        "id": "comp-comm",
        "name": "Communication",
        "definisiKompetensi": "Menyampaikan informasi secara jelas, efektif, dan persuasif.",
        "level": [
          {
            "nomor": "1",
            "penjelasan": "Deskripsi Level 1 untuk Komunikasi.",
            "keyBehavior": [
              "KB 1.1: Berbicara dengan jelas.",
              "KB 1.2: Mendengarkan secara aktif."
            ]
          },
          {
            "nomor": "2",
            "penjelasan": "Deskripsi Level 2 untuk Komunikasi.",
            "keyBehavior": [
              "KB 2.1: Menstrukturkan pesan dengan logis.",
              "KB 2.2: Menyesuaikan gaya bicara dengan audiens."
            ]
          }
        ]
      }
    ]
  }'
WHERE id = 'f9a22000-69d1-49d6-8f07-b62f58138918';

-- 4. Give your admin user a name
UPDATE users SET name = 'Samuel Testing' WHERE email = 'admin@example.com';

SELECT 'Test data seeded successfully!' AS status;