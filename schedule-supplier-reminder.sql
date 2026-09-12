-- Run this in Supabase SQL Editor (Finance project: mbwsfwebbrzurpozyxks)
-- Schedules the supplier invoice reminder edge function daily at 08:00 UAE (04:00 UTC)

select cron.schedule(
  'supplier-invoice-reminder',        -- job name
  '0 4 * * *',                        -- 04:00 UTC = 08:00 UAE daily
  $$
  select net.http_post(
    url    := 'https://mbwsfwebbrzurpozyxks.supabase.co/functions/v1/supplier-invoice-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body   := '{}'::jsonb
  );
  $$
);

-- Verify it was created:
-- select * from cron.job where jobname = 'supplier-invoice-reminder';
