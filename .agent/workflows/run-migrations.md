---
description: Run database migrations with Alembic
---
# Run Migrations

Apply database migrations using Alembic.

## Steps

1. Navigate to the backend directory and run Alembic upgrade:
```
cd r:\CC Clients Codebase\voxly\backend && alembic upgrade head
```

2. Verify the migration was applied:
// turbo
```
cd r:\CC Clients Codebase\voxly\backend && alembic current
```

3. If you need to create a new migration after schema changes:
```
cd r:\CC Clients Codebase\voxly\backend && alembic revision --autogenerate -m "describe_your_change"
```
