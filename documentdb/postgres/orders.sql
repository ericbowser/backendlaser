-- Table: lasertg.orders

-- DROP TABLE IF EXISTS lasertg.orders;

CREATE TABLE IF NOT EXISTS lasertg.orders
(
    orderid integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    contactid integer NOT NULL,
    stripe_payment_intent_id text COLLATE pg_catalog."default",
    amount integer NOT NULL,
    currency text COLLATE pg_catalog."default" DEFAULT 'usd',
    status text COLLATE pg_catalog."default" DEFAULT 'pending',
    tag_text_line_1 text COLLATE pg_catalog."default",
    tag_text_line_2 text COLLATE pg_catalog."default",
    tag_text_line_3 text COLLATE pg_catalog."default",
    has_qr_code boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT orders_pkey PRIMARY KEY (orderid),
    CONSTRAINT orders_contactid_fkey FOREIGN KEY (contactid)
        REFERENCES lasertg.contact (contactid) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS lasertg.orders
    OWNER to postgres;

CREATE INDEX IF NOT EXISTS idx_orders_contactid
    ON lasertg.orders USING btree
    (contactid ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON lasertg.orders USING btree
    (status ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent
    ON lasertg.orders USING btree
    (stripe_payment_intent_id ASC NULLS LAST);

GRANT ALL ON TABLE lasertg.orders TO ericbo;

GRANT ALL ON TABLE lasertg.orders TO postgres;
