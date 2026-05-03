# Database Migrations

## Setup Instructions

After filling in your `DATABASE_URL` and `DIRECT_URL` in `.env.local`, run:

```bash
npx prisma migrate dev --name init
```

This will create all tables defined in `schema.prisma` in your Supabase PostgreSQL database.

## Re-generating Prisma Client

If you modify `schema.prisma`, regenerate the client with:

```bash
npx prisma generate
```

## Viewing your database

```bash
npx prisma studio
```
