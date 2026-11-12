CREATE TYPE "public"."account_type" AS ENUM('checking', 'savings', 'cash', 'investment', 'other');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurrence_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "card_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"credit_card_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_installments_purchase_number_unique" UNIQUE("purchase_id","installment_number"),
	CONSTRAINT "card_installments_positive_amount" CHECK ("card_installments"."amount_cents" between 1 and 9007199254740991),
	CONSTRAINT "card_installments_positive_number" CHECK ("card_installments"."installment_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "card_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_card_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"category_type" "transaction_type" DEFAULT 'expense' NOT NULL,
	"total_cents" bigint NOT NULL,
	"purchased_on" date NOT NULL,
	"description" text NOT NULL,
	"installment_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_purchases_id_card_user_unique" UNIQUE("id","credit_card_id","user_id"),
	CONSTRAINT "card_purchases_positive_total" CHECK ("card_purchases"."total_cents" between 1 and 9007199254740991),
	CONSTRAINT "card_purchases_valid_count" CHECK ("card_purchases"."installment_count" > 0 and "card_purchases"."installment_count" <= "card_purchases"."total_cents"),
	CONSTRAINT "card_purchases_expense_only" CHECK ("card_purchases"."category_type" = 'expense'),
	CONSTRAINT "card_purchases_description_not_blank" CHECK (length(btrim("card_purchases"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "credit_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"credit_limit_cents" bigint NOT NULL,
	"closing_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_cards_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "credit_cards_name_not_blank" CHECK (length(btrim("credit_cards"."name")) > 0),
	CONSTRAINT "credit_cards_safe_limit" CHECK ("credit_cards"."credit_limit_cents" between 0 and 9007199254740991),
	CONSTRAINT "credit_cards_valid_days" CHECK ("credit_cards"."closing_day" between 1 and 31 and "credit_cards"."due_day" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payments_invoice_unique" UNIQUE("invoice_id"),
	CONSTRAINT "invoice_payments_positive_amount" CHECK ("invoice_payments"."amount_cents" between 1 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_card_id" uuid NOT NULL,
	"period" date NOT NULL,
	"closes_on" date NOT NULL,
	"due_on" date NOT NULL,
	"closing_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_card_period_unique" UNIQUE("credit_card_id","period"),
	CONSTRAINT "invoices_id_card_user_unique" UNIQUE("id","credit_card_id","user_id"),
	CONSTRAINT "invoices_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "invoices_valid_dates" CHECK (isfinite("invoices"."period") and isfinite("invoices"."closes_on") and isfinite("invoices"."due_on") and "invoices"."due_on" >= "invoices"."closes_on" and "invoices"."period" = date_trunc('month', "invoices"."due_on"::timestamp)::date),
	CONSTRAINT "invoices_valid_days" CHECK ("invoices"."closing_day" between 1 and 31 and "invoices"."due_day" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"opening_balance_cents" bigint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "accounts_name_not_blank" CHECK (length(btrim("accounts"."name")) > 0),
	CONSTRAINT "accounts_opening_balance_safe" CHECK ("accounts"."opening_balance_cents" between -9007199254740991 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_id_user_type_unique" UNIQUE("id","user_id","type"),
	CONSTRAINT "categories_name_not_blank" CHECK (length(btrim("categories"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"contributed_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_contributions_positive_amount" CHECK ("goal_contributions"."amount_cents" between 1 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"description" text NOT NULL,
	"target_cents" bigint NOT NULL,
	"due_on" date NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "goals_positive_target" CHECK ("goals"."target_cents" between 1 and 9007199254740991),
	CONSTRAINT "goals_description_not_blank" CHECK (length(btrim("goals"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_sha256" CHECK ("sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sessions_valid_expiry" CHECK ("sessions"."expires_at" > "sessions"."created_at"),
	CONSTRAINT "sessions_valid_revocation" CHECK ("sessions"."revoked_at" is null or "sessions"."revoked_at" >= "sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_not_blank" CHECK (length(btrim("users"."name")) > 0),
	CONSTRAINT "users_email_format" CHECK ("users"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
	CONSTRAINT "users_password_hash_not_blank" CHECK (length(btrim("users"."password_hash")) > 0)
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"category_type" "transaction_type" DEFAULT 'expense' NOT NULL,
	"period" date NOT NULL,
	"limit_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_user_category_period_unique" UNIQUE("user_id","category_id","period"),
	CONSTRAINT "budgets_expense_only" CHECK ("budgets"."category_type" = 'expense'),
	CONSTRAINT "budgets_month_start" CHECK (isfinite("budgets"."period") and extract(day from "budgets"."period") = 1),
	CONSTRAINT "budgets_positive_limit" CHECK ("budgets"."limit_cents" between 1 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"occurred_on" date NOT NULL,
	"recurrence_id" uuid,
	"recurrence_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_recurrence_occurrence_unique" UNIQUE("recurrence_id","recurrence_on"),
	CONSTRAINT "transactions_positive_amount" CHECK ("transactions"."amount_cents" between 1 and 9007199254740991),
	CONSTRAINT "transactions_description_not_blank" CHECK (length(btrim("transactions"."description")) > 0),
	CONSTRAINT "transactions_recurrence_pair" CHECK (("transactions"."recurrence_id" is null) = ("transactions"."recurrence_on" is null))
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_positive_amount" CHECK ("transfers"."amount_cents" between 1 and 9007199254740991),
	CONSTRAINT "transfers_distinct_accounts" CHECK ("transfers"."source_account_id" <> "transfers"."destination_account_id")
);
--> statement-breakpoint
CREATE TABLE "recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"frequency" "recurrence_frequency" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"starts_on" date NOT NULL,
	"next_execution_on" date NOT NULL,
	"ends_on" date,
	"status" "recurrence_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurrences_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "recurrences_positive_amount" CHECK ("recurrences"."amount_cents" between 1 and 9007199254740991),
	CONSTRAINT "recurrences_positive_interval" CHECK ("recurrences"."interval_count" > 0),
	CONSTRAINT "recurrences_valid_dates" CHECK ("recurrences"."next_execution_on" >= "recurrences"."starts_on" and ("recurrences"."ends_on" is null or "recurrences"."ends_on" >= "recurrences"."starts_on")),
	CONSTRAINT "recurrences_description_not_blank" CHECK (length(btrim("recurrences"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "card_installments" ADD CONSTRAINT "card_installments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_installments" ADD CONSTRAINT "card_installments_purchase_owner_card_fk" FOREIGN KEY ("purchase_id","credit_card_id","user_id") REFERENCES "public"."card_purchases"("id","credit_card_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_installments" ADD CONSTRAINT "card_installments_invoice_owner_card_fk" FOREIGN KEY ("invoice_id","credit_card_id","user_id") REFERENCES "public"."invoices"("id","credit_card_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_card_owner_fk" FOREIGN KEY ("credit_card_id","user_id") REFERENCES "public"."credit_cards"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_category_owner_type_fk" FOREIGN KEY ("category_id","user_id","category_type") REFERENCES "public"."categories"("id","user_id","type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_owner_fk" FOREIGN KEY ("invoice_id","user_id") REFERENCES "public"."invoices"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_account_owner_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_card_owner_fk" FOREIGN KEY ("credit_card_id","user_id") REFERENCES "public"."credit_cards"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_owner_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_owner_type_fk" FOREIGN KEY ("category_id","user_id","category_type") REFERENCES "public"."categories"("id","user_id","type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_owner_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_owner_type_fk" FOREIGN KEY ("category_id","user_id","type") REFERENCES "public"."categories"("id","user_id","type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurrence_owner_fk" FOREIGN KEY ("recurrence_id","user_id") REFERENCES "public"."recurrences"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_source_owner_fk" FOREIGN KEY ("source_account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_owner_fk" FOREIGN KEY ("destination_account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_account_owner_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_category_owner_type_fk" FOREIGN KEY ("category_id","user_id","type") REFERENCES "public"."categories"("id","user_id","type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_installments_invoice_idx" ON "card_installments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "card_installments_user_idx" ON "card_installments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "card_installments_card_idx" ON "card_installments" USING btree ("credit_card_id");--> statement-breakpoint
CREATE INDEX "card_purchases_user_date_idx" ON "card_purchases" USING btree ("user_id","purchased_on");--> statement-breakpoint
CREATE INDEX "card_purchases_user_category_date_idx" ON "card_purchases" USING btree ("user_id","category_id","purchased_on");--> statement-breakpoint
CREATE INDEX "card_purchases_card_date_idx" ON "card_purchases" USING btree ("credit_card_id","purchased_on");--> statement-breakpoint
CREATE INDEX "card_purchases_category_idx" ON "card_purchases" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "credit_cards_user_idx" ON "credit_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoice_payments_user_date_idx" ON "invoice_payments" USING btree ("user_id","paid_on");--> statement-breakpoint
CREATE INDEX "invoice_payments_account_date_idx" ON "invoice_payments" USING btree ("account_id","paid_on");--> statement-breakpoint
CREATE INDEX "invoices_user_period_idx" ON "invoices" USING btree ("user_id","period");--> statement-breakpoint
CREATE INDEX "invoices_user_due_idx" ON "invoices" USING btree ("user_id","due_on");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_user_type_idx" ON "categories" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "goal_contributions_user_date_idx" ON "goal_contributions" USING btree ("user_id","contributed_on");--> statement-breakpoint
CREATE INDEX "goal_contributions_goal_date_idx" ON "goal_contributions" USING btree ("goal_id","contributed_on");--> statement-breakpoint
CREATE INDEX "goals_user_due_idx" ON "goals" USING btree ("user_id","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_expiry_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower(btrim("email")));--> statement-breakpoint
CREATE INDEX "budgets_user_period_idx" ON "budgets" USING btree ("user_id","period");--> statement-breakpoint
CREATE INDEX "budgets_category_idx" ON "budgets" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_user_account_date_idx" ON "transactions" USING btree ("user_id","account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_user_category_date_idx" ON "transactions" USING btree ("user_id","category_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transfers_user_date_idx" ON "transfers" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transfers_source_date_idx" ON "transfers" USING btree ("source_account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transfers_destination_date_idx" ON "transfers" USING btree ("destination_account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "recurrences_user_next_idx" ON "recurrences" USING btree ("user_id","next_execution_on");--> statement-breakpoint
CREATE INDEX "recurrences_due_idx" ON "recurrences" USING btree ("next_execution_on") WHERE "recurrences"."status" = 'active';--> statement-breakpoint
CREATE INDEX "recurrences_account_idx" ON "recurrences" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "recurrences_category_idx" ON "recurrences" USING btree ("category_id");