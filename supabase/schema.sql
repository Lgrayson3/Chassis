-- ============================================
-- CLINICS (Clinic entities)
-- ============================================
CREATE TABLE public.clinics (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  address               text,
  referral_code         text UNIQUE NOT NULL,
  created_at            timestamptz DEFAULT now()
);

-- ============================================
-- CLINIC_USERS (Clinic staff mappings)
-- ============================================
CREATE TABLE public.clinic_users (
  id                    uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  clinic_id             uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_at            timestamptz DEFAULT now()
);

-- ============================================
-- PROFILES (user health data, encrypted)
-- ============================================
CREATE TABLE public.profiles (
  id                    uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  first_name            text,
  tier                  text NOT NULL DEFAULT 'glucose' CHECK (tier IN ('glucose', 'longevity', 'glp1')),
  body_weight_kg        numeric(5,2),
  protein_target_g      numeric(5,1),
  texture_preference    text DEFAULT 'standard' CHECK (texture_preference IN 
                        ('liquid', 'soft', 'standard', 'emergency')),
  meal_schedule         jsonb DEFAULT '{"breakfast": "07:00", "snack1": "10:30", 
                        "lunch": "13:00", "snack2": "16:00", "dinner": "19:00"}',
  nudge_sensitivity     text DEFAULT 'standard' CHECK (nudge_sensitivity IN 
                        ('gentle', 'standard', 'aggressive')),
  dnd_start             time DEFAULT '22:00',
  dnd_end               time DEFAULT '07:00',
  medical_disclaimer    boolean DEFAULT false,
  pt_referral_code      text,
  clinic_id             uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  onboarding_complete   boolean DEFAULT false,
  push_token            text,
  stripe_customer_id    text,
  stripe_subscription_id text,
  subscription_status   text DEFAULT 'essential',
  created_at            timestamptz DEFAULT now()
);

-- ============================================
-- MEAL_BLUEPRINTS (weekly meal plans)
-- ============================================
CREATE TABLE public.meal_blueprints (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  week_start          date NOT NULL,
  day_of_week         int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meals               jsonb NOT NULL,
  -- [{meal_type, name, protein_g, calories, prep_time_min, ingredients[], instructions, swap_options[]}]
  texture_category    text,
  generated_at        timestamptz DEFAULT now()
);

-- ============================================
-- PROTEIN_LOGS (every eating event)
-- ============================================
CREATE TABLE public.protein_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  amount_g            numeric(5,1) NOT NULL,
  source              text,
  meal_type           text CHECK (meal_type IN ('breakfast', 'snack1', 'lunch', 
                        'snack2', 'dinner', 'emergency')),
  logged_at           timestamptz DEFAULT now(),
  from_blueprint      boolean DEFAULT false,
  -- Tracks whether user followed plan or went off-script
  notes               text
);

-- ============================================
-- NUDGE_EVENTS (every notification sent)
-- ============================================
CREATE TABLE public.nudge_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  nudge_type          text NOT NULL,
  -- 'meal_reminder', 'protein_deficit', 'catabolic_warning', 'emergency_fuel', 'workout_fuel_gate'
  level               int NOT NULL CHECK (level BETWEEN 1 AND 5),
  catabolic_score     int,
  message             text,
  channel             text CHECK (channel IN ('in_app', 'push', 'sms', 'email')),
  sent_at             timestamptz DEFAULT now(),
  opened_at           timestamptz,
  action_taken        text,
  -- 'logged_protein', 'dismissed', 'snoozed', 'booked_session', 'no_action'
  action_at           timestamptz
);

-- ============================================
-- WORKOUT_LOGS (fuel-gated sessions)
-- ============================================
CREATE TABLE public.workout_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  scheduled_for       date,
  fuel_status         text CHECK (fuel_status IN ('green', 'yellow', 'orange', 'red')),
  status              text DEFAULT 'scheduled' CHECK (status IN 
                        ('scheduled', 'completed', 'skipped_underfueled', 
                         'skipped_emergency', 'rescheduled')),
  protein_at_start_g  numeric(5,1),
  exercises           jsonb DEFAULT '[]',
  duration_min        int,
  completed_at        timestamptz
);

-- ============================================
-- GROCERY_LISTS (auto-generated procurement)
-- ============================================
CREATE TABLE public.grocery_lists (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  week_start          date NOT NULL,
  items               jsonb NOT NULL,
  -- [{category, name, quantity, unit, estimated_price, in_pantry, purchased}]
  total_estimated     numeric(6,2),
  store_preference    text,
  sent_to             text,
  -- 'instacart', 'walmart', 'amazon_fresh', 'manual'
  generated_at        timestamptz DEFAULT now()
);

-- ============================================
-- NUDGE_ENGINE_SCHEDULE (recurring nudge logic)
-- ============================================
CREATE TABLE public.nudge_schedule (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  nudge_type          text NOT NULL,
  scheduled_time      time,
  days_of_week        int[] DEFAULT '{0,1,2,3,4,5,6}',
  is_active           boolean DEFAULT true,
  last_triggered      timestamptz
);

-- ============================================
-- ANALYTICS_EVENTS
-- ============================================
CREATE TABLE public.analytics_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_name          text NOT NULL,
  properties          jsonb DEFAULT '{}',
  occurred_at         timestamptz DEFAULT now()
);

-- ============================================
-- RLS (ROW LEVEL SECURITY)
-- ============================================
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protein_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nudge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nudge_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Policies for clinics
CREATE POLICY "Anyone can read clinics" ON public.clinics
  FOR SELECT USING (true);

-- Policies for clinic_users
CREATE POLICY "Clinicians can read their own profile" ON public.clinic_users
  FOR SELECT USING (auth.uid() = id);

-- Policies for profiles
CREATE POLICY "Users can manage their own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Clinicians can view patient profiles in their clinic" ON public.profiles
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE id = auth.uid()));

-- Policies for user-specific tables
CREATE POLICY "Users can manage their own meal_blueprints" ON public.meal_blueprints
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own protein_logs" ON public.protein_logs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own nudge_events" ON public.nudge_events
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own workout_logs" ON public.workout_logs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own grocery_lists" ON public.grocery_lists
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own nudge_schedule" ON public.nudge_schedule
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own analytics_events" ON public.analytics_events
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, tier, body_weight_kg, subscription_status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'tier', 'glucose'),
    COALESCE((new.raw_user_meta_data->>'body_weight_kg')::numeric, 70.0),
    'essential'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- RPC FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION public.get_clinic_patient_summary(clinic_id_param uuid)
RETURNS TABLE (
  id uuid,
  first_name text,
  created_at timestamptz,
  body_weight_kg numeric,
  protein_target_g numeric,
  tier text,
  onboarding_complete boolean,
  protein_pct numeric,
  response_rate numeric,
  completed_workouts bigint,
  status text,
  status_color text
) AS $$
BEGIN
  RETURN QUERY
  WITH patient_profiles AS (
    SELECT 
      p.id as p_id, 
      p.first_name as p_first_name, 
      p.created_at as p_created_at, 
      p.body_weight_kg as p_body_weight_kg, 
      p.protein_target_g as p_protein_target_g, 
      p.tier as p_tier, 
      p.onboarding_complete as p_onboarding_complete
    FROM public.profiles p
    WHERE p.clinic_id = clinic_id_param AND p.onboarding_complete = true
  ),
  daily_protein_logs AS (
    SELECT 
      pl.user_id,
      pl.logged_at::date as log_date,
      sum(pl.amount_g) as daily_sum
    FROM public.protein_logs pl
    WHERE pl.logged_at >= date_trunc('week', now())
    GROUP BY pl.user_id, pl.logged_at::date
  ),
  weekly_protein_avg AS (
    SELECT
      dp.user_id,
      avg(dp.daily_sum) as avg_protein
    FROM daily_protein_logs dp
    GROUP BY dp.user_id
  ),
  weekly_nudges AS (
    SELECT
      ne.user_id,
      count(*) as total_nudges,
      count(CASE WHEN ne.action_taken IS NOT NULL AND ne.action_taken <> 'no_action' AND ne.action_taken <> 'no_response' THEN 1 END) as responded_nudges
    FROM public.nudge_events ne
    WHERE ne.sent_at >= date_trunc('week', now())
    GROUP BY ne.user_id
  ),
  weekly_workouts AS (
    SELECT
      wl.user_id,
      count(*) as completed_count
    FROM public.workout_logs wl
    WHERE wl.status = 'completed' AND wl.scheduled_for >= date_trunc('week', now())::date
    GROUP BY wl.user_id
  )
  SELECT 
    pp.p_id as id,
    pp.p_first_name as first_name,
    pp.p_created_at as created_at,
    pp.p_body_weight_kg as body_weight_kg,
    pp.p_protein_target_g as protein_target_g,
    pp.p_tier as tier,
    pp.p_onboarding_complete as onboarding_complete,
    COALESCE(
      CASE 
        WHEN pp.p_protein_target_g > 0 THEN ROUND((COALESCE(pa.avg_protein, 0) / pp.p_protein_target_g) * 100)
        ELSE 0 
      END, 
      0
    )::numeric as protein_pct,
    COALESCE(
      CASE 
        WHEN wn.total_nudges > 0 THEN ROUND((wn.responded_nudges::float / wn.total_nudges) * 100)
        ELSE 100 
      END,
      100
    )::numeric as response_rate,
    COALESCE(ww.completed_count, 0)::bigint as completed_workouts,
    CASE 
      WHEN (extract(epoch from (now() - pp.p_created_at)) / 86400) < 7 THEN 'New'
      WHEN 
        COALESCE(CASE WHEN pp.p_protein_target_g > 0 THEN (COALESCE(pa.avg_protein, 0) / pp.p_protein_target_g) * 100 ELSE 0 END, 0) < 50 
        OR COALESCE(CASE WHEN wn.total_nudges > 0 THEN (wn.responded_nudges::float / wn.total_nudges) * 100 ELSE 100 END, 100) < 25 
      THEN 'Non-Compliant'
      WHEN 
        COALESCE(CASE WHEN pp.p_protein_target_g > 0 THEN (COALESCE(pa.avg_protein, 0) / pp.p_protein_target_g) * 100 ELSE 0 END, 0) < 80 
        OR COALESCE(CASE WHEN wn.total_nudges > 0 THEN (wn.responded_nudges::float / wn.total_nudges) * 100 ELSE 100 END, 100) < 50 
      THEN 'Needs Attention'
      ELSE 'On Track'
    END::text as status,
    CASE 
      WHEN (extract(epoch from (now() - pp.p_created_at)) / 86400) < 7 THEN '#94a3b8'
      WHEN 
        COALESCE(CASE WHEN pp.p_protein_target_g > 0 THEN (COALESCE(pa.avg_protein, 0) / pp.p_protein_target_g) * 100 ELSE 0 END, 0) < 50 
        OR COALESCE(CASE WHEN wn.total_nudges > 0 THEN (wn.responded_nudges::float / wn.total_nudges) * 100 ELSE 100 END, 100) < 25 
      THEN '#ef4444'
      WHEN 
        COALESCE(CASE WHEN pp.p_protein_target_g > 0 THEN (COALESCE(pa.avg_protein, 0) / pp.p_protein_target_g) * 100 ELSE 0 END, 0) < 80 
        OR COALESCE(CASE WHEN wn.total_nudges > 0 THEN (wn.responded_nudges::float / wn.total_nudges) * 100 ELSE 100 END, 100) < 50 
      THEN '#f59e0b'
      ELSE '#10b981'
    END::text as status_color
  FROM patient_profiles pp
  LEFT JOIN weekly_protein_avg pa ON pp.p_id = pa.user_id
  LEFT JOIN weekly_nudges wn ON pp.p_id = wn.user_id
  LEFT JOIN weekly_workouts ww ON pp.p_id = ww.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;