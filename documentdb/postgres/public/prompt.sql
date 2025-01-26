create table if not exists prompt
(
    answer   varchar not null,
    thread   varchar not null,
    question varchar,
    promptid integer generated always as identity
        constraint promptid
            primary key,
    vectors  double precision[]
);

alter table prompt
    owner to postgres;

