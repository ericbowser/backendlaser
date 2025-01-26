create table if not exists "order"
(
    orderid     integer generated always as identity
        primary key,
    tagid       integer
        constraint tagid
            references tag,
    orderamount money,
    contactid   integer
        constraint contactid
            references contact
);

alter table "order"
    owner to postgres;

create index fki_tagid
    on "order" (tagid);

create index fki_contactid
    on "order" (contactid);

