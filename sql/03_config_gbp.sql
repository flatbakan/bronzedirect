-- ============================================================
-- Bronze Direct — set default VAT to 20% (UK). Run once in SQL Editor.
-- ============================================================
alter table public.invoices alter column vat_rate set default 20;

-- Optionally update existing draft invoices that still have 24%:
-- update public.invoices set vat_rate = 20 where vat_rate = 24 and status = 'draft';
