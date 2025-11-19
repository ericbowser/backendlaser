-- Table: lasertg.contact

-- DROP TABLE IF EXISTS lasertg.contact;

CREATE TABLE IF NOT EXISTS lasertg.contact
(
    contactid integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    firstname text COLLATE pg_catalog."default",
    lastname text COLLATE pg_catalog."default",
    petname text COLLATE pg_catalog."default",
    phone text COLLATE pg_catalog."default",
    address_line_1 text COLLATE pg_catalog."default",
    address_line_2 text COLLATE pg_catalog."default",
    CONSTRAINT contactid PRIMARY KEY (contactid)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS lasertg.contact
    OWNER to postgres;

GRANT ALL ON TABLE lasertg.contact TO ericbo;

GRANT ALL ON TABLE lasertg.contact TO postgres;

