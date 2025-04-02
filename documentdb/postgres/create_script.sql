-- Table: lasertg.tag

-- Create a new schema (if it doesn't already exist)
CREATE SCHEMA IF NOT EXISTS lasertg;

-- Method 1: Set the search path to use this schema by default
SET search_path TO lasertg;

-- DROP TABLE IF EXISTS lasertg."user";

CREATE TABLE IF NOT EXISTS publi."user"
(
    username character varying(50) COLLATE pg_catalog."default" NOT NULL,
    password character varying(50) COLLATE pg_catalog."default" NOT NULL,
    userid integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    updateondate date,
    CONSTRAINT userid UNIQUE (userid)
    INCLUDE(userid)
    )

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS lasertg."user"
    OWNER to postgres;

-- Table: lasertg.session

-- DROP TABLE IF EXISTS lasertg.session;

CREATE TABLE IF NOT EXISTS lasertg.session
(
    sessionid uuid NOT NULL,
    sessionstart time with time zone NOT NULL,
    userid integer NOT NULL,
    sessionduration interval NOT NULL,
    sessionstate text COLLATE pg_catalog."default",
    sessionend time with time zone GENERATED ALWAYS AS ((sessionstart + sessionduration)) STORED,
    sessionhash uuid,
    CONSTRAINT sessionid PRIMARY KEY (sessionid)
    INCLUDE(sessionid),
    CONSTRAINT userid FOREIGN KEY (userid)
    REFERENCES lasertg."user" (userid) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION
    )

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS lasertg.session
    OWNER to postgres;



-- Table: lasertg.contact

-- DROP TABLE IF EXISTS lasertg.contact;

CREATE TABLE IF NOT EXISTS lasertg.contact
(
    contactid integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    userid integer NOT NULL,
    firstname text COLLATE pg_catalog."default",
    lastname text COLLATE pg_catalog."default",
    petname text COLLATE pg_catalog."default",
    phone text COLLATE pg_catalog."default",
    address text COLLATE pg_catalog."default",
    CONSTRAINT contactid PRIMARY KEY (contactid),
    CONSTRAINT userid FOREIGN KEY (userid)
    REFERENCES lasertg."user" (userid) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION
    )

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS lasertg.contact
    OWNER to postgres;

GRANT ALL ON TABLE lasertg.contact TO ericbo;

GRANT ALL ON TABLE lasertg.contact TO postgres;
-- Index: fki_userid

-- DROP INDEX IF EXISTS lasertg.fki_userid;

CREATE INDEX IF NOT EXISTS fki_userid
    ON lasertg.contact USING btree
    (userid ASC NULLS LAST)
    TABLESPACE pg_default;




-- Table: lasertg.profile

-- DROP TABLE IF EXISTS lasertg.profile;

CREATE TABLE IF NOT EXISTS lasertg.profile
(
    profileid integer NOT NULL,
    userid integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    sessionid uuid NOT NULL,
    contactid integer NOT NULL,
    tagid integer,
    CONSTRAINT profile_pkey PRIMARY KEY (profileid),
    CONSTRAINT contactid FOREIGN KEY (contactid)
    REFERENCES lasertg.contact (contactid) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION,
    CONSTRAINT sessionid FOREIGN KEY (sessionid)
    REFERENCES lasertg.session (sessionid) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION,
    CONSTRAINT tagid FOREIGN KEY (tagid)
    REFERENCES lasertg.tag (tagid) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION,
    CONSTRAINT userid FOREIGN KEY (userid)
    REFERENCES lasertg."user" (userid) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION
    )

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS lasertg.profile
    OWNER to postgres;
-- Index: fki_sessionid

-- DROP INDEX IF EXISTS lasertg.fki_sessionid;

CREATE INDEX IF NOT EXISTS fki_sessionid
    ON lasertg.profile USING btree
    (sessionid ASC NULLS LAST)
    TABLESPACE pg_default;



-- Table: lasertg.material

-- DROP TABLE IF EXISTS lasertg.material;

CREATE TABLE IF NOT EXISTS lasertg.material
(
    materialid smallint NOT NULL,
    materialvalue text COLLATE pg_catalog."default",
    materialtype text COLLATE pg_catalog."default",
    materialcolor text COLLATE pg_catalog."default",
    materialshape text COLLATE pg_catalog."default",
    materialininventory integer,
    materialinbackorder bit(1),
    CONSTRAINT material_pkey PRIMARY KEY (materialid)
    )

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS lasertg.material
    OWNER to postgres;

-- DROP TABLE IF EXISTS lasertg.tag;

CREATE TABLE IF NOT EXISTS lasertg.tag
(
    tagid integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    tagtype text COLLATE pg_catalog."default",
    hasdesign boolean,
    hasqrcode boolean,
    tagtextline1 text COLLATE pg_catalog."default",
    tagtextline2 text COLLATE pg_catalog."default",
    tagtextline3 text COLLATE pg_catalog."default",
    taggraphicid integer,
    materialid smallint,
    CONSTRAINT tag_pkey PRIMARY KEY (tagid),
    CONSTRAINT materialid FOREIGN KEY (materialid)
    REFERENCES lasertg.material (materialid) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION,
    CONSTRAINT taggraphicid FOREIGN KEY (taggraphicid)
    REFERENCES lasertg.graphics (graphicid) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION
    )

    TABLESPACE pg_default;

ALTER TABLE IF EXISTS lasertg.tag
    OWNER to postgres;

GRANT ALL ON TABLE lasertg.tag TO ericbo;

GRANT ALL ON TABLE lasertg.tag TO postgres;
-- Index: fki_materialid

-- DROP INDEX IF EXISTS lasertg.fki_materialid;

CREATE INDEX IF NOT EXISTS fki_materialid
    ON lasertg.tag USING btree
    (materialid ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: fki_taggraphicid

-- DROP INDEX IF EXISTS lasertg.fki_taggraphicid;

CREATE INDEX IF NOT EXISTS fki_taggraphicid
    ON lasertg.tag USING btree
    (taggraphicid ASC NULLS LAST)
    TABLESPACE pg_default;