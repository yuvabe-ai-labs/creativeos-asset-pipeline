# Performance checklist

A short list to run through when a screen feels slow, or before shipping one that loads data.
Work top to bottom: the early items usually matter most.

## 1. Measure

- [ ] Record each request's server time and how many requests a screen fires, before and after every change.
- [ ] Break a slow request down: middleware, route code, and each database call.

## 2. Infrastructure

- [ ] Each environment's server runs in the same region as its database. Verify it; don't assume it.

## 3. Database

- [ ] Every column used to filter, join or sort in a frequent query has an index (foreign keys included).
- [ ] Composite indexes match how queries combine columns (e.g. filter by one, sort by another).
- [ ] Check slow queries with `EXPLAIN ANALYZE`; a sequential scan on a large table means a missing index.
- [ ] Queries select only the columns they use, not `*`.

## 4. Fewer requests

- [ ] No "one request per item" pattern. Fetch once for the whole screen and let each item read its part.
- [ ] Nothing is fetched twice, re-fetched when an unrelated setting changes, or written when nothing changed.
- [ ] Prefetching on hover or scroll waits briefly, so passing over items doesn't fire a request each.

## 5. Fewer sequential steps on the server

- [ ] Independent queries run in parallel. Each sequential database call costs a full round trip.
- [ ] Each request checks the user's identity once.
- [ ] Related rows are read in one query, not one query per row.

## 6. Caching on the client

- [ ] Server data goes through one shared client cache, and reopening a screen shows it at once while it refreshes.
- [ ] Own actions refresh the data; an older read still in flight can't overwrite the newer result.
- [ ] Data changed elsewhere is refreshed or discarded. Possibly outdated data is for showing only; anything
      that writes or acts on it waits for a fresh read.

## 7. Safety

- [ ] A failed request is never treated as "empty" when empty would trigger a destructive action.
- [ ] Newly created items don't error before they exist on the server.
- [ ] A background refresh never overwrites what the user is typing.
- [ ] Routes that take a list of IDs check that the caller may access every one.
