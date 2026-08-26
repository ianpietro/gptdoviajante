-- AI observability, cost aggregation and server-owned incremental chat summaries.

-- Replace the read-then-update limiter with one atomic UPSERT per IP.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_ip TEXT, p_max_req INTEGER, p_window_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.rate_limits (ip, last_seen, req_count)
  VALUES (p_ip, now(), 1)
  ON CONFLICT (ip) DO UPDATE
  SET req_count = CASE
        WHEN public.rate_limits.last_seen < now() - (p_window_seconds * interval '1 second') THEN 1
        ELSE public.rate_limits.req_count + 1
      END,
      last_seen = CASE
        WHEN public.rate_limits.last_seen < now() - (p_window_seconds * interval '1 second') THEN now()
        ELSE public.rate_limits.last_seen
      END
  RETURNING req_count INTO v_count;
  RETURN v_count > p_max_req;
END;
$$;

ALTER FUNCTION public.reserve_ai_usage(UUID, UUID, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.refund_ai_usage(UUID, UUID) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_ai_usage(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_usage(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_usage(UUID, UUID) TO service_role;

-- Documents are private; the client stores only the object path and requests
-- a short-lived signed URL when the owner opens a file.
UPDATE storage.buckets SET public = FALSE WHERE id = 'boarding-documents';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Boarding documents owner read') THEN
    CREATE POLICY "Boarding documents owner read" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'boarding-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Boarding documents owner insert') THEN
    CREATE POLICY "Boarding documents owner insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'boarding-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Boarding documents owner delete') THEN
    CREATE POLICY "Boarding documents owner delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'boarding-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  trip_id UUID NULL REFERENCES public.trips(id) ON DELETE SET NULL,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens BIGINT NULL,
  output_tokens BIGINT NULL,
  cached_tokens BIGINT NOT NULL DEFAULT 0,
  reasoning_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NULL,
  token_source TEXT NOT NULL DEFAULT 'unavailable' CHECK (token_source IN ('provider', 'estimated', 'unavailable')),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  grounding_used BOOLEAN NOT NULL DEFAULT FALSE,
  success BOOLEAN NOT NULL,
  error_category TEXT NULL,
  error_code TEXT NULL,
  estimated_cost_usd NUMERIC(20, 10) NULL,
  pricing_version TEXT NOT NULL,
  attempt_count SMALLINT NOT NULL DEFAULT 1 CHECK (attempt_count >= 0),
  is_system_task BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_request_logs_trip_created ON public.ai_request_logs (trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_user_created ON public.ai_request_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_provider_model ON public.ai_request_logs (provider, model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_failures ON public.ai_request_logs (created_at DESC) WHERE success = FALSE;

ALTER TABLE public.ai_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_request_logs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_request_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.ai_request_logs TO service_role;

CREATE TABLE IF NOT EXISTS public.ai_chat_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('plan', 'travel')),
  summary_text TEXT NOT NULL DEFAULT '',
  summarized_message_count INTEGER NOT NULL DEFAULT 0 CHECK (summarized_message_count >= 0),
  source_prefix_hash TEXT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, trip_id, chat_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_summaries_trip ON public.ai_chat_summaries (trip_id);
ALTER TABLE public.ai_chat_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_summaries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_chat_summaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_chat_summaries TO service_role;

CREATE OR REPLACE FUNCTION public.save_ai_chat_summary(
  p_user_id UUID,
  p_trip_id UUID,
  p_chat_type TEXT,
  p_expected_revision BIGINT,
  p_summary_text TEXT,
  p_summarized_message_count INTEGER,
  p_source_prefix_hash TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revision BIGINT;
BEGIN
  IF p_chat_type NOT IN ('plan', 'travel') OR p_summarized_message_count < 0 THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id AND user_id = p_user_id) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.ai_chat_summaries (user_id, trip_id, chat_type)
  VALUES (p_user_id, p_trip_id, p_chat_type)
  ON CONFLICT (user_id, trip_id, chat_type) DO NOTHING;

  SELECT revision INTO v_revision
  FROM public.ai_chat_summaries
  WHERE user_id = p_user_id AND trip_id = p_trip_id AND chat_type = p_chat_type
  FOR UPDATE;

  IF v_revision <> COALESCE(p_expected_revision, 0) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.ai_chat_summaries
  SET summary_text = p_summary_text,
      summarized_message_count = p_summarized_message_count,
      source_prefix_hash = p_source_prefix_hash,
      revision = revision + 1,
      updated_at = now()
  WHERE user_id = p_user_id AND trip_id = p_trip_id AND chat_type = p_chat_type;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ai_chat_summary(UUID, UUID, TEXT, BIGINT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_chat_summary(UUID, UUID, TEXT, BIGINT, TEXT, INTEGER, TEXT) TO service_role;

CREATE OR REPLACE VIEW public.ai_cost_by_trip
WITH (security_invoker = true)
AS
SELECT
  trip_id,
  user_id,
  COUNT(*) AS request_count,
  COUNT(*) FILTER (WHERE fallback_used) AS fallback_request_count,
  COUNT(*) FILTER (WHERE grounding_used) AS grounded_request_count,
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(cached_tokens) AS cached_tokens,
  SUM(estimated_cost_usd) AS estimated_cost_usd,
  MIN(created_at) AS first_request_at,
  MAX(created_at) AS last_request_at
FROM public.ai_request_logs
GROUP BY trip_id, user_id;

REVOKE ALL ON public.ai_cost_by_trip FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_cost_by_trip TO service_role;
