-- stuck_reservations' threshold follows video-generate.ts's maxDuration (0021 set it as a
-- 5-minute buffer above the then-600s limit). That limit is now 2400s: Seedance and Kling poll
-- for up to 30 minutes, and at 600s a long job was killed mid-poll. Left at 15 minutes, the sweep
-- would fail and refund a job that is still running; when it then finished, completeGeneration
-- (which only completes a `running` row) would drop the paid-for video.
--
-- 50 minutes = the 40-minute run limit plus 10 minutes for time spent queued in Trigger.dev before
-- the run starts (the reservation is written when the request is made, not when the run begins).
-- Same definition as 0028 otherwise.
create or replace view stuck_reservations as
select r.generation_id, r.org_id
from credit_transactions r
where r.type = 'reservation'
  and r.generation_id is not null
  and r.created_at < now() - interval '50 minutes'
  and not exists (
    select 1 from credit_transactions t
    where t.generation_id = r.generation_id
      and t.type in ('refund', 'consumption')
  );
