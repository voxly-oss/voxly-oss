---
description: Build and test Docker setup for Voxly
---
# Docker Build & Test

Build and run the entire Voxly stack using Docker Compose.

## Steps

1. Build all containers:
```
cd r:\CC Clients Codebase\voxly && docker-compose build
```

2. Start the stack:
```
cd r:\CC Clients Codebase\voxly && docker-compose up -d
```

3. Check all containers are running:
// turbo
```
cd r:\CC Clients Codebase\voxly && docker-compose ps
```

4. View backend logs:
// turbo
```
cd r:\CC Clients Codebase\voxly && docker-compose logs backend --tail=50
```

5. View frontend logs:
// turbo
```
cd r:\CC Clients Codebase\voxly && docker-compose logs frontend --tail=50
```

6. Stop the stack:
```
cd r:\CC Clients Codebase\voxly && docker-compose down
```
