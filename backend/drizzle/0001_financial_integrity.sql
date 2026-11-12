-- Custom SQL migration file, put your code below! --
-- Financial invariants across rows. Keep this migration versioned alongside schemas.
CREATE FUNCTION public.mf_month_day(month_date date, wanted_day integer)
RETURNS date LANGUAGE sql IMMUTABLE STRICT SET search_path = public, pg_temp AS $$
  SELECT date_trunc('month', month_date::timestamp)::date
    + least(wanted_day, extract(day FROM (date_trunc('month', month_date::timestamp) + interval '1 month - 1 day'))::integer) - 1;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mf_invoice_calendar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE expected_due date;
BEGIN
  IF TG_OP = 'UPDATE' AND
     ROW(NEW.id, NEW.user_id, NEW.credit_card_id, NEW.period, NEW.closes_on, NEW.due_on, NEW.closing_day, NEW.due_day)
       IS DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.credit_card_id, OLD.period, OLD.closes_on, OLD.due_on, OLD.closing_day, OLD.due_day)
     AND EXISTS (SELECT 1 FROM card_installments WHERE invoice_id = OLD.id) THEN
    RAISE EXCEPTION 'Invoice calendar with installments is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'invoices_calendar_locked';
  END IF;
  expected_due := mf_month_day(
    (date_trunc('month', NEW.closes_on::timestamp)
      + CASE WHEN NEW.due_day <= NEW.closing_day THEN interval '1 month' ELSE interval '0 months' END)::date,
    NEW.due_day);
  IF NEW.closes_on <> mf_month_day(NEW.closes_on, NEW.closing_day) OR NEW.due_on <> expected_due THEN
    RAISE EXCEPTION 'Invoice dates must match the snapshotted closing and due days'
      USING ERRCODE = '23514', CONSTRAINT = 'invoices_calendar_check';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoices_calendar BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.mf_invoice_calendar();
--> statement-breakpoint
CREATE FUNCTION public.mf_validate_purchase(purchase_uuid uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE purchase_row record; part_count bigint; part_total numeric; first_invoice record; previous_close date;
BEGIN
  SELECT * INTO purchase_row FROM card_purchases WHERE id = purchase_uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*), coalesce(sum(amount_cents), 0) INTO part_count, part_total
    FROM card_installments WHERE purchase_id = purchase_uuid;
  IF part_count <> purchase_row.installment_count OR part_total <> purchase_row.total_cents
     OR EXISTS (
       SELECT 1 FROM card_installments part WHERE part.purchase_id = purchase_uuid
         AND (part.installment_number > purchase_row.installment_count
           OR part.amount_cents <> purchase_row.total_cents / purchase_row.installment_count
             + CASE WHEN part.installment_number <= purchase_row.total_cents % purchase_row.installment_count THEN 1 ELSE 0 END)
     ) THEN
    RAISE EXCEPTION 'Purchase requires complete, exactly allocated installments'
      USING ERRCODE = '23514', CONSTRAINT = 'card_purchases_complete_installments';
  END IF;
  SELECT inv.* INTO first_invoice FROM card_installments part
    JOIN invoices inv ON inv.id = part.invoice_id
    WHERE part.purchase_id = purchase_uuid AND part.installment_number = 1;
  previous_close := mf_month_day((date_trunc('month', first_invoice.closes_on::timestamp) - interval '1 month')::date, first_invoice.closing_day);
  IF purchase_row.purchased_on > first_invoice.closes_on OR purchase_row.purchased_on <= previous_close
     OR EXISTS (
       SELECT 1 FROM card_installments part JOIN invoices inv ON inv.id = part.invoice_id
         WHERE part.purchase_id = purchase_uuid
           AND inv.period <> (first_invoice.period + (part.installment_number - 1) * interval '1 month')::date
     ) THEN
    RAISE EXCEPTION 'Installments require consecutive invoice months and a matching purchase cycle'
      USING ERRCODE = '23514', CONSTRAINT = 'card_purchases_invoice_sequence';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mf_validate_invoice(invoice_uuid uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE invoice_total numeric;
BEGIN
  SELECT coalesce(sum(amount_cents), 0) INTO invoice_total FROM card_installments WHERE invoice_id = invoice_uuid;
  IF invoice_total > 9007199254740991 THEN
    RAISE EXCEPTION 'Invoice total exceeds the safe integer range'
      USING ERRCODE = '23514', CONSTRAINT = 'invoices_total_safe';
  END IF;
  IF EXISTS (SELECT 1 FROM invoice_payments WHERE invoice_id = invoice_uuid AND amount_cents <> invoice_total) THEN
    RAISE EXCEPTION 'Invoice payment must equal its complete total'
      USING ERRCODE = '23514', CONSTRAINT = 'invoice_payments_full_settlement';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mf_purchase_constraint() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM mf_validate_purchase(OLD.id); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM mf_validate_purchase(NEW.id); END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER card_purchases_complete_installments
AFTER INSERT OR UPDATE OR DELETE ON public.card_purchases DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.mf_purchase_constraint();
--> statement-breakpoint
CREATE FUNCTION public.mf_installment_constraint() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM mf_validate_purchase(OLD.purchase_id);
    PERFORM mf_validate_invoice(OLD.invoice_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM mf_validate_purchase(NEW.purchase_id);
    PERFORM mf_validate_invoice(NEW.invoice_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER card_installments_financial_integrity
AFTER INSERT OR UPDATE OR DELETE ON public.card_installments DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.mf_installment_constraint();
--> statement-breakpoint
CREATE FUNCTION public.mf_lock_installment_aggregates() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE purchase_ids uuid[]; invoice_ids uuid[]; aggregate_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    purchase_ids := ARRAY[NEW.purchase_id]; invoice_ids := ARRAY[NEW.invoice_id];
  ELSIF TG_OP = 'DELETE' THEN
    purchase_ids := ARRAY[OLD.purchase_id]; invoice_ids := ARRAY[OLD.invoice_id];
  ELSE
    purchase_ids := ARRAY[OLD.purchase_id, NEW.purchase_id]; invoice_ids := ARRAY[OLD.invoice_id, NEW.invoice_id];
  END IF;
  -- Actual parent updates serialize child writes, also preventing write skew at RR.
  FOR aggregate_id IN SELECT id FROM card_purchases WHERE id = ANY(purchase_ids) ORDER BY id FOR UPDATE LOOP
    UPDATE card_purchases SET updated_at = updated_at WHERE id = aggregate_id;
  END LOOP;
  FOR aggregate_id IN SELECT id FROM invoices WHERE id = ANY(invoice_ids) ORDER BY id FOR UPDATE LOOP
    UPDATE invoices SET updated_at = updated_at WHERE id = aggregate_id;
    IF EXISTS (SELECT 1 FROM invoice_payments WHERE invoice_id = aggregate_id) THEN
      RAISE EXCEPTION 'Installments of a paid invoice cannot be changed'
        USING ERRCODE = '23514', CONSTRAINT = 'paid_invoice_installments_locked';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER card_installments_lock_aggregates
BEFORE INSERT OR UPDATE OR DELETE ON public.card_installments
FOR EACH ROW EXECUTE FUNCTION public.mf_lock_installment_aggregates();
--> statement-breakpoint
CREATE FUNCTION public.mf_freeze_paid_purchase() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
     ROW(NEW.id, NEW.user_id, NEW.credit_card_id, NEW.category_id, NEW.category_type, NEW.total_cents, NEW.purchased_on, NEW.description, NEW.installment_count)
       IS NOT DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.credit_card_id, OLD.category_id, OLD.category_type, OLD.total_cents, OLD.purchased_on, OLD.description, OLD.installment_count) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM card_installments part JOIN invoice_payments payment ON payment.invoice_id = part.invoice_id WHERE part.purchase_id = OLD.id) THEN
    RAISE EXCEPTION 'A purchase with settled installments cannot be changed'
      USING ERRCODE = '23514', CONSTRAINT = 'paid_card_purchase_locked';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER card_purchases_freeze_paid BEFORE UPDATE OR DELETE ON public.card_purchases
FOR EACH ROW EXECUTE FUNCTION public.mf_freeze_paid_purchase();
--> statement-breakpoint
CREATE FUNCTION public.mf_payment_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE invoice_total numeric; closing_date date;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Settlements are immutable; corrections require an explicit reversal model'
      USING ERRCODE = '23514', CONSTRAINT = 'invoice_payments_immutable';
  END IF;
  UPDATE invoices SET updated_at = updated_at WHERE id = NEW.invoice_id;
  SELECT closes_on INTO closing_date FROM invoices WHERE id = NEW.invoice_id;
  SELECT coalesce(sum(amount_cents), 0) INTO invoice_total FROM card_installments WHERE invoice_id = NEW.invoice_id;
  IF NEW.amount_cents <> invoice_total OR invoice_total <= 0 OR NEW.paid_on < closing_date THEN
    RAISE EXCEPTION 'Settlement must pay the full invoice on or after closing'
      USING ERRCODE = '23514', CONSTRAINT = 'invoice_payments_full_settlement';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_payments_guard BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.mf_payment_guard();
--> statement-breakpoint
CREATE FUNCTION public.mf_payment_constraint() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM mf_validate_invoice(NEW.invoice_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_payments_total_check AFTER INSERT ON public.invoice_payments
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.mf_payment_constraint();
--> statement-breakpoint
CREATE FUNCTION public.mf_set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users', 'sessions', 'accounts', 'categories', 'transactions', 'transfers', 'budgets', 'credit_cards', 'card_purchases', 'card_installments', 'invoices', 'invoice_payments', 'recurrences', 'goals', 'goal_contributions'] LOOP
    EXECUTE format('CREATE TRIGGER audit_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mf_set_updated_at()', table_name);
  END LOOP;
END;
$$;
--> statement-breakpoint
-- Date infinity has no JSON financial-date representation.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('transactions', 'occurred_on'), ('transactions', 'recurrence_on'), ('transfers', 'occurred_on'),
    ('card_purchases', 'purchased_on'), ('invoice_payments', 'paid_on'), ('goals', 'due_on'),
    ('goal_contributions', 'contributed_on'), ('recurrences', 'starts_on'),
    ('recurrences', 'next_execution_on'), ('recurrences', 'ends_on')
  ) AS dates(table_name, column_name) LOOP
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (isfinite(%I))', item.table_name, item.table_name || '_' || item.column_name || '_finite', item.column_name);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE VIEW public.account_balances AS
SELECT account.id AS account_id, account.user_id,
  account.opening_balance_cents::numeric
    + coalesce((SELECT sum(CASE WHEN entry.type = 'income' THEN entry.amount_cents ELSE -entry.amount_cents END) FROM transactions entry WHERE entry.account_id = account.id), 0)
    + coalesce((SELECT sum(amount_cents) FROM transfers WHERE destination_account_id = account.id), 0)
    - coalesce((SELECT sum(amount_cents) FROM transfers WHERE source_account_id = account.id), 0)
    - coalesce((SELECT sum(amount_cents) FROM invoice_payments WHERE account_id = account.id), 0)
  AS balance_cents
FROM accounts account;
--> statement-breakpoint
CREATE VIEW public.invoice_totals AS
SELECT inv.id AS invoice_id, inv.user_id, inv.credit_card_id, inv.period,
  coalesce(parts.total_cents, 0) AS total_cents,
  coalesce(payment.amount_cents, 0)::numeric AS paid_cents,
  coalesce(parts.total_cents, 0) - coalesce(payment.amount_cents, 0) AS outstanding_cents,
  payment.paid_on
FROM invoices inv
LEFT JOIN LATERAL (SELECT sum(amount_cents) AS total_cents FROM card_installments WHERE invoice_id = inv.id) parts ON true
LEFT JOIN invoice_payments payment ON payment.invoice_id = inv.id;
--> statement-breakpoint
CREATE VIEW public.card_available_limits AS
SELECT card.id AS credit_card_id, card.user_id,
  card.credit_limit_cents::numeric - coalesce((
    SELECT sum(part.amount_cents) FROM card_installments part
    WHERE part.credit_card_id = card.id
      AND NOT EXISTS (SELECT 1 FROM invoice_payments payment WHERE payment.invoice_id = part.invoice_id)
  ), 0) AS available_cents
FROM credit_cards card;
--> statement-breakpoint
CREATE VIEW public.budget_spending AS
SELECT budget.id AS budget_id, budget.user_id, budget.category_id, budget.period, budget.limit_cents,
  coalesce((SELECT sum(entry.amount_cents) FROM transactions entry
    WHERE entry.user_id = budget.user_id AND entry.category_id = budget.category_id AND entry.type = 'expense'
      AND entry.occurred_on >= budget.period AND entry.occurred_on < (budget.period + interval '1 month')::date), 0)
  + coalesce((SELECT sum(part.amount_cents) FROM card_installments part
    JOIN card_purchases purchase ON purchase.id = part.purchase_id JOIN invoices inv ON inv.id = part.invoice_id
    WHERE purchase.user_id = budget.user_id AND purchase.category_id = budget.category_id AND inv.period = budget.period), 0)
  AS spent_cents
FROM budgets budget;
