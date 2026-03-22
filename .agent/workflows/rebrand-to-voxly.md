---
description: Rebrand all ProjectVoice references to Voxly across the entire codebase
---
# Rebrand to Voxly

Update all remaining "ProjectVoice" references to "Voxly" throughout the codebase.

## Steps

1. Search and replace "ProjectVoice" in all files:
// turbo
```
cd r:\CC Clients Codebase\voxly && rg -l "ProjectVoice" --type py --type ts --type json --type md
```

2. Search and replace "projectvoice" (lowercase):
// turbo
```
cd r:\CC Clients Codebase\voxly && rg -l "projectvoice" --type py --type ts --type json --type md
```

3. Update these specific files:
   - `frontend/package.json` → name field
   - `backend/app/main.py` → title/description
   - `README.md` → full rewrite with Voxly branding
   - `CONTRIBUTING.md` → update all references
   - `docker-compose.yml` → service names if applicable
   - `cli/index.js` → CLI tool name

4. Verify no old references remain:
// turbo
```
cd r:\CC Clients Codebase\voxly && rg -i "projectvoice" --type-not binary
```
