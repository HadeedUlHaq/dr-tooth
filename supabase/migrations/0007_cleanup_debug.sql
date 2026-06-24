-- ─────────────────────────────────────────────────────────────────────────────
-- Dr Tooth — drop the temporary diagnostic added in 0006 (no longer needed now that
-- the Third-Party Auth bridge is verified working).
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.debug_whoami();
