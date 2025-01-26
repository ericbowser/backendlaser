create table if not exists tag
(
    tagid     integer generated always as identity
        primary key,
    tagtype   text,
    hasdesign boolean,
    hasqrcode boolean
);

alter table tag
    owner to postgres;

