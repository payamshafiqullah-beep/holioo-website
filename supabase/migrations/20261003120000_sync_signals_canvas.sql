-- Holioo: the Notes page (free canvas, tablet / computer) is one more thing the devices of an account share.
-- Same rule as the other signals: it only says "this séance's page changed, look in your Drive" — a séance id and the
-- Drive file id, never the page itself. Backward compatible: older apps never send this kind, and an app that sends
-- it before this migration is applied only loses the instant notification (the other device reads the page when it
-- opens it, and at its next sync).

alter table public.sync_signals drop constraint if exists sync_signals_kind_check;
alter table public.sync_signals
  add constraint sync_signals_kind_check check (kind in ('state', 'photo', 'note', 'canvas'));

comment on column public.sync_signals.ref_id is 'photo id for ''photo'', séance id for ''note'' and ''canvas''';
