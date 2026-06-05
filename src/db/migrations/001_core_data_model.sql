BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE official_data_status AS ENUM ('draft', 'pending_review', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'content_reviewer', 'data_reviewer', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'limited', 'banned', 'deleted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE experience_status AS ENUM ('draft', 'pending_review', 'published', 'rejected', 'hidden');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE verification_status AS ENUM ('pending_review', 'verified', 'rejected', 'hidden');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE report_status AS ENUM ('pending', 'in_review', 'resolved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE ingestion_run_status AS ENUM ('pending', 'running', 'succeeded', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text UNIQUE,
  phone_ciphertext text,
  nickname text NOT NULL,
  grade text CHECK (grade IN ('high_school_g1', 'high_school_g2', 'high_school_g3', 'graduated')),
  default_anonymous boolean NOT NULL DEFAULT true,
  role user_role NOT NULL DEFAULT 'user',
  account_status account_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  province_scope text NOT NULL DEFAULT 'guangdong' CHECK (province_scope = 'guangdong'),
  city text,
  school_type text,
  official_website_url text,
  logo_url text,
  status official_data_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schools_normalized_name_scope_unique UNIQUE (normalized_name, province_scope)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('official_site', 'manual_upload', 'application_portal', 'education_exam_authority')),
  source_url text,
  admission_year integer CHECK (admission_year BETWEEN 2020 AND 2100),
  school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
  keyword text,
  started_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status ingestion_run_status NOT NULL DEFAULT 'pending',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted_guide_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeline_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  formula_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score numeric CHECK (confidence_score >= 0 AND confidence_score <= 1),
  review_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_guide_id uuid,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id uuid REFERENCES ingestion_runs(id) ON DELETE SET NULL,
  school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
  admission_year integer CHECK (admission_year BETWEEN 2020 AND 2100),
  province_scope text NOT NULL DEFAULT 'guangdong' CHECK (province_scope = 'guangdong'),
  source_type text NOT NULL CHECK (
    source_type IN (
      'guangdong_education_exam_authority',
      'chsi_yangguang_gaokao',
      'university_admissions',
      'other_official',
      'third_party_info',
      'official_notice',
      'admission_guide',
      'application_portal',
      'education_exam_authority',
      'manual_upload'
    )
  ),
  title text NOT NULL,
  source_url text NOT NULL,
  raw_text_asset_url text,
  content_hash text,
  storage_key text,
  checksum text,
  status official_data_status NOT NULL DEFAULT 'draft',
  candidate_status text NOT NULL DEFAULT 'candidate' CHECK (candidate_status IN ('candidate', 'accepted', 'rejected')),
  authority_role text NOT NULL DEFAULT 'final_authority' CHECK (authority_role IN ('final_authority', 'discovery_clue')),
  source_priority integer,
  published_at timestamptz,
  fetched_at timestamptz,
  extracted_text text,
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admission_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  admission_year integer NOT NULL CHECK (admission_year BETWEEN 2020 AND 2100),
  province_scope text NOT NULL DEFAULT 'guangdong' CHECK (province_scope = 'guangdong'),
  status official_data_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_current boolean NOT NULL DEFAULT true,
  source_document_id uuid REFERENCES source_documents(id) ON DELETE SET NULL,
  official_source_url text,
  application_url text,
  guide_title text NOT NULL,
  summary text,
  application_status text,
  application_start_at timestamptz,
  application_deadline_at timestamptz,
  preliminary_review_result_at timestamptz,
  confirmation_or_payment_at timestamptz,
  school_assessment_at timestamptz,
  shortlist_publication_at timestamptz,
  volunteer_application_at timestamptz,
  admission_publication_at timestamptz,
  majors jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  academic_test_requirements text,
  assessment_method text,
  admission_rule text,
  fees jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  version_notes text,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admission_guides_school_year_scope_version_unique UNIQUE (school_id, admission_year, province_scope, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS admission_guides_one_current_per_scope
  ON admission_guides (school_id, admission_year, province_scope)
  WHERE is_current;

CREATE TABLE IF NOT EXISTS timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_guide_id uuid NOT NULL REFERENCES admission_guides(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK (
    event_key IN (
      'guide_publication',
      'application_start',
      'application_deadline',
      'preliminary_review_result',
      'confirmation_or_payment',
      'school_assessment',
      'shortlist_publication',
      'volunteer_application',
      'admission_publication'
    )
  ),
  title text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  status official_data_status NOT NULL DEFAULT 'draft',
  source_document_id uuid REFERENCES source_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timeline_events_guide_event_unique UNIQUE (admission_guide_id, event_key)
);

CREATE TABLE IF NOT EXISTS score_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_guide_id uuid REFERENCES admission_guides(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  admission_year integer NOT NULL CHECK (admission_year BETWEEN 2020 AND 2100),
  province_scope text NOT NULL DEFAULT 'guangdong' CHECK (province_scope = 'guangdong'),
  status official_data_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  formula_name text NOT NULL,
  formula_type text NOT NULL CHECK (formula_type IN ('weighted_sum', 'custom', 'not_specified')),
  formula_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation text,
  official_source_url text,
  source_document_id uuid REFERENCES source_documents(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT score_formulas_school_year_scope_version_unique UNIQUE (school_id, admission_year, province_scope, version)
);

CREATE TABLE IF NOT EXISTS experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  admission_year integer NOT NULL CHECK (admission_year BETWEEN 2020 AND 2100),
  province_scope text NOT NULL DEFAULT 'guangdong' CHECK (province_scope = 'guangdong'),
  status experience_status NOT NULL DEFAULT 'pending_review',
  major_group text,
  candidate_track text,
  stage text NOT NULL,
  shortlisted_status boolean,
  admitted_status boolean,
  assessment_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  location text,
  process_summary text NOT NULL,
  question_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  preparation_summary text,
  difficulty_score integer CHECK (difficulty_score BETWEEN 1 AND 5),
  pressure_score integer CHECK (pressure_score BETWEEN 1 AND 5),
  differentiation_score integer CHECK (differentiation_score BETWEEN 1 AND 5),
  advice text,
  is_anonymous boolean NOT NULL DEFAULT true,
  useful_count integer NOT NULL DEFAULT 0 CHECK (useful_count >= 0),
  reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experience_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  material_type text NOT NULL,
  object_storage_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status verification_status NOT NULL DEFAULT 'pending_review',
  reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('school', 'admission_guide', 'timeline_event', 'experience')),
  target_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('favorite', 'useful')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interactions_one_action_per_target UNIQUE (user_id, target_type, target_id, action)
);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('experience', 'user', 'admission_guide', 'source_document')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  description text,
  status report_status NOT NULL DEFAULT 'pending',
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schools_status_idx ON schools (status);
CREATE INDEX IF NOT EXISTS admission_guides_status_year_idx ON admission_guides (status, admission_year);
CREATE INDEX IF NOT EXISTS admission_guides_school_year_idx ON admission_guides (school_id, admission_year);
CREATE INDEX IF NOT EXISTS timeline_events_school_event_idx ON timeline_events (school_id, event_key);
CREATE INDEX IF NOT EXISTS score_formulas_school_year_idx ON score_formulas (school_id, admission_year);
CREATE INDEX IF NOT EXISTS experiences_public_listing_idx ON experiences (status, school_id, admission_year, created_at DESC);
CREATE INDEX IF NOT EXISTS interactions_user_action_idx ON interactions (user_id, action);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status);
CREATE INDEX IF NOT EXISTS source_documents_status_idx ON source_documents (status);
CREATE INDEX IF NOT EXISTS schools_search_idx
  ON schools USING gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(normalized_name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(school_type, '')));
CREATE INDEX IF NOT EXISTS admission_guides_search_idx
  ON admission_guides USING gin (to_tsvector('simple', coalesce(guide_title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(academic_test_requirements, '') || ' ' || coalesce(assessment_method, '') || ' ' || coalesce(admission_rule, '')));
CREATE INDEX IF NOT EXISTS source_documents_search_idx ON source_documents USING gin (search_vector);
CREATE INDEX IF NOT EXISTS experiences_search_idx
  ON experiences USING gin (to_tsvector('simple', coalesce(major_group, '') || ' ' || coalesce(candidate_track, '') || ' ' || coalesce(stage, '') || ' ' || coalesce(process_summary, '') || ' ' || coalesce(preparation_summary, '') || ' ' || coalesce(advice, '')));
CREATE INDEX IF NOT EXISTS ingestion_runs_status_idx ON ingestion_runs (status);

COMMIT;
