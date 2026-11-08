-- UNIDA ONE — processa a fila do WhatsApp a cada minuto (garante o envio mesmo se o app não disparar)
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'unida-whatsapp';
select cron.schedule(
  'unida-whatsapp',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://fpmxrpaneklmmnwswyqw.supabase.co/functions/v1/whatsapp',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb) $$
);

-- Limpa o histórico do agendador (mantém 3 dias)
select cron.unschedule(jobid) from cron.job where jobname = 'unida-limpa-cron';
select cron.schedule('unida-limpa-cron', '17 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '3 days' $$);
