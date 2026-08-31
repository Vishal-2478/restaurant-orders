-- ============================================================================
--  Integrity rules that Prisma's schema language cannot express.
--
--  Every rule below is also enforced in the application. The point of having
--  it here as well is that a bug in a route handler, a hand-run UPDATE, or a
--  future feature that forgets the rule still cannot put the data into a
--  state the business considers impossible.
-- ============================================================================


-- ------------------------------------------------------------------ money --

-- Goal 7 requires the bulk update endpoint to reject individual items for
-- reasons such as a negative price. This is the backstop underneath that
-- check, not a replacement for it.
ALTER TABLE "menu_items"
ADD CONSTRAINT "menu_items_price_non_negative"
CHECK ("priceCents" >= 0);

-- The price snapshot copied onto a line is subject to the same rule.
ALTER TABLE "order_lines"
    ADD CONSTRAINT "order_lines_unit_price_non_negative"
    CHECK ("unitPriceCents" >= 0);


-- ------------------------------------------------------------- quantities --

-- Ordering zero, or minus two, of something is not a thing.
ALTER TABLE "order_lines"
    ADD CONSTRAINT "order_lines_quantity_positive"
    CHECK ("quantity" > 0);

-- Tables are numbered from one.
ALTER TABLE "orders"
    ADD CONSTRAINT "orders_table_number_positive"
    CHECK ("tableNumber" > 0);


-- --------------------------------------------------------------- voiding --

-- Goal 4 requires a reason when a line is voided. A nullable column cannot
-- express "required, but only when voided", so the three void columns are
-- constrained as a group: either none of them is set, or all of them are and
-- the reason is not blank. This makes "voided without a reason" impossible to
-- represent, rather than merely discouraged.
ALTER TABLE "order_lines"
ADD CONSTRAINT "order_lines_void_fields_consistent"
CHECK (
    (
    "voidedAt" IS NULL
    AND "voidReason" IS NULL
    AND "voidedById" IS NULL
    )
    OR
    (
    "voidedAt" IS NOT NULL
    AND "voidedById" IS NOT NULL
    AND "voidReason" IS NOT NULL
    AND length(btrim("voidReason")) > 0
    )
);


-- --------------------------------------------- append-only order timeline --

-- Goal 9: "Nothing in this timeline can be edited or deleted after the fact,
-- including by managers."
--
-- The API has no route that updates or deletes an order_events row, but that
-- is a promise about the code as it happens to be written today. This is a
-- promise about the table itself: any UPDATE or DELETE raises, regardless of
-- who issues it or how they connected.
CREATE OR REPLACE FUNCTION reject_order_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
    'order_events is append-only; % is not permitted on this table', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER order_events_reject_update
    BEFORE UPDATE ON "order_events"
    FOR EACH ROW
    EXECUTE FUNCTION reject_order_event_mutation();

CREATE TRIGGER order_events_reject_delete
    BEFORE DELETE ON "order_events"
    FOR EACH ROW
    EXECUTE FUNCTION reject_order_event_mutation();