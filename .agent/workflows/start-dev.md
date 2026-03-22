---
description: Start the full Voxly development stack (backend + frontend)
---
# Start Dev Stack

Start both the backend and frontend development servers.

## Steps

1. Start the backend server:
// turbo
```
cd r:\CC Clients Codebase\voxly\backend && uvicorn app.main:app --reload
```

2. Start the frontend server (in a new terminal):
// turbo
```
cd r:\CC Clients Codebase\voxly\frontend && npm run dev
```

3. Verify both are running:
- Backend: http://localhost:8000/docs (Swagger UI)
- Frontend: http://localhost:3000
