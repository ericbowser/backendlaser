create table if not exists contact
(
    contactid integer generated always as identity
        primary key,
    firstname text,
    lastname  text,
    petname   text,
    phone     varchar(10),
    address   varchar(255),
    userid    integer
        constraint userid
            references "user",
    orderid   integer
        constraint orderid
            references "order"
);

alter table contact
    owner to postgres;

create index fki_userid
    on contact (contactid);

create index fki_orderid
    on contact (orderid);

