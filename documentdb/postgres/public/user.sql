create table if not exists "user"
(
    userid       integer generated always as identity
        constraint userid
            primary key,
    email        text,
    password     text,
    isloggedin   boolean,
    updateondate timestamp with time zone
);

alter table "user"
    owner to postgres;

