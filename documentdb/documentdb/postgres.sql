CREATE DATABASE postgres
    WITH
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'English_United States.1252'
    LC_CTYPE = 'English_United States.1252'
    LOCALE_PROVIDER = 'libc'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1
    IS_TEMPLATE = False;

COMMENT ON DATABASE postgres
    IS 'default administrative connection database';

-- Table: public.user

-- DROP TABLE IF EXISTS public."user";

CREATE TABLE IF NOT EXISTS public."user"
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    username varchar(50) COLLATE pg_catalog."default" NOT NULL,
    password varchar(50) COLLATE pg_catalog."default" NOT NULL,
    firstname text COLLATE pg_catalog."default",
    lastname text COLLATE pg_catalog."default",
    petname text COLLATE pg_catalog."default",
    phone varchar(10) COLLATE pg_catalog."default",
    address varchar(255) COLLATE pg_catalog."default",
    city text COLLATE pg_catalog."default",
    state character(2) COLLATE pg_catalog."default",
    CONSTRAINT user_pkey PRIMARY KEY (id)
)

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS public."user"
    OWNER to postgres;

INSERT INTO public."user"(
    username, password, firstname, lastname, petname, phone, address, city, state)
VALUES ('ericbo', 'test123', 'eric', 'bowser', 'bunker', '4354948030', '5154 S 5200 W', 'Kearns', 'UT');

-- Table: public.session

-- DROP TABLE IF EXISTS public.session;

CREATE TABLE IF NOT EXISTS public.session
(
    sessionid uuid,
    sessionstart time with time zone NOT NULL,
    userid integer NOT NULL,
    sessionduration interval NOT NULL,
    sessionstate text COLLATE pg_catalog."default",
    sessionend time with time zone GENERATED ALWAYS AS ((sessionstart + sessionduration)) STORED
    )

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.session
    OWNER to postgres;

-- Table: public.contact

-- DROP TABLE IF EXISTS public.contact;

CREATE TABLE IF NOT EXISTS public.contact
(
    contactid integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    userid integer NOT NULL,
    firstname text COLLATE pg_catalog."default",
    lastname text COLLATE pg_catalog."default",
    petname text COLLATE pg_catalog."default",
    phone text COLLATE pg_catalog."default",
    address text COLLATE pg_catalog."default",
    CONSTRAINT contact_pkey PRIMARY KEY (contactid)
)

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.contact
    OWNER to postgres;

GRANT ALL ON TABLE public.contact TO ericbo;

GRANT ALL ON TABLE public.contact TO postgres;
-- Index: fki_userid

-- DROP INDEX IF EXISTS public.fki_userid;

CREATE INDEX IF NOT EXISTS fki_userid
    ON public.contact USING btree
        (userid ASC NULLS LAST)
    TABLESPACE pg_default;


-- Table: public.tag

-- DROP TABLE IF EXISTS public.tag;

CREATE TABLE IF NOT EXISTS public.tag
(
    tagid integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    tagtype text COLLATE pg_catalog."default",
    hasdesign boolean,
    hasqrcode boolean,
    tagtextline1 text COLLATE pg_catalog."default",
    tagtextline2 text COLLATE pg_catalog."default",
    tagtextline3 text COLLATE pg_catalog."default",
    taggraphicid integer,
    tagmaterial text COLLATE pg_catalog."default",
    CONSTRAINT tag_pkey PRIMARY KEY (tagid),
    CONSTRAINT taggraphicid FOREIGN KEY (taggraphicid)
        REFERENCES public.graphics (graphicid) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.tag
    OWNER to postgres;

GRANT ALL ON TABLE public.tag TO ericbo;

GRANT ALL ON TABLE public.tag TO postgres;
-- Index: fki_taggraphicid

-- DROP INDEX IF EXISTS public.fki_taggraphicid;

CREATE INDEX IF NOT EXISTS fki_taggraphicid
    ON public.tag USING btree
        (taggraphicid ASC NULLS LAST)
    TABLESPACE pg_default;

-- Table: public.order

-- DROP TABLE IF EXISTS public."order";

CREATE TABLE IF NOT EXISTS public."order"
(
    orderid integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    tagid integer,
    orderamount money,
    contactid integer,
    CONSTRAINT order_pkey PRIMARY KEY (orderid),
    CONSTRAINT tagid FOREIGN KEY (tagid)
        REFERENCES public.tag (tagid) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
        NOT VALID
)

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS public."order"
    OWNER to postgres;

GRANT ALL ON TABLE public."order" TO ericbo;

GRANT ALL ON TABLE public."order" TO postgres;
-- Index: fki_contactid

-- DROP INDEX IF EXISTS public.fki_contactid;

CREATE INDEX IF NOT EXISTS fki_contactid
    ON public."order" USING btree
        (contactid ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: fki_tagid

-- DROP INDEX IF EXISTS public.fki_tagid;

CREATE INDEX IF NOT EXISTS fki_tagid
    ON public."order" USING btree
        (tagid ASC NULLS LAST)
    TABLESPACE pg_default;