-- SAN-1622: validate existing audit rows in a separate, lower-impact step.
-- VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE; ordinary check-in reads
-- and writes remain permitted while pre-existing rows are scanned.
alter table public.event_check_ins
  validate constraint event_check_ins_result_check;
