# RAHAAL ERP — PERMANENT PRODUCTION ARCHITECTURE RULES
# Version: 1.0
# Status: MANDATORY FOR ALL FUTURE CHANGES

> **NOTICE TO ALL FUTURE AGENTS / SESSIONS:**
> This document is the **binding architectural contract** for the Rahaal ERP project.
> It MUST be read and obeyed before making any code, database, authentication,
> infrastructure, or deployment change.
> Any change that conflicts with these rules requires **explicit, written approval**
> from the project owner.

These rules are permanent project rules for Rahaal ERP.
The goal is to prevent Emergent from repeatedly creating new databases,
new users, new tenants, new paths, duplicate API structures, or changing
production configuration during future updates.

==================================================
1. PROJECT IDENTITY
==================================================

Project name:
Rahaal ERP

Current production domain:
https://rahaal.targetmediagrp.com

Rahaal is the child/sub-project under:
TargetMediaGRP

Rahaal must remain architecturally independent from the TargetMedia
application while being prepared for future integration under
TargetMediaGRP.

Do NOT merge Rahaal database data with TargetMedia database data.
Do NOT create a second Rahaal database.

==================================================
2. SINGLE SOURCE OF TRUTH
==================================================

The existing production/live environment is the reference architecture.

Emergent development/preview environments must NOT invent new:

- database names
- database schemas
- users
- tenants/offices
- authentication systems
- API architectures
- filesystem paths
- upload locations
- reverse proxy architectures

When a future update is generated, preserve the existing architecture
unless the user explicitly requests an architectural change.

If the existing production value is unknown, STOP and ASK.
Never guess.

==================================================
3. DATABASE — CRITICAL RULE
==================================================

Rahaal uses MongoDB.
There must be ONE canonical Rahaal production database.

The production database name MUST NOT be changed automatically.

Do NOT create:

- a new Rahaal database
- a temporary production database
- a second database for the same application
- a database named "your_database_name"
- a demo database in Production

The application must obtain database configuration ONLY from:
MONGO_URL
DB_NAME

Both must come from environment configuration.

NEVER hard-code a production MongoDB URL.
NEVER hard-code a production DB_NAME.

NEVER use:
mongodb://localhost:27017
as a production fallback.

NEVER use:
your_database_name
as a production fallback.

If MONGO_URL or DB_NAME is missing:
FAIL FAST and report the missing variable.
Do NOT create a database automatically.

==================================================
4. EXISTING PRODUCTION DATA MUST NEVER BE RESET
==================================================

Existing production data is sacred.
The following must never be lost during an application update:

- users
- tenants
- travel offices
- clients
- tickets
- visas
- services
- packages
- bookings
- vouchers
- accounts
- journal entries
- boxes
- suppliers
- settings
- subscription information
- permissions
- authentication sessions where applicable

Never execute automatically:
dropDatabase()
drop()
deleteMany({})
database reset
database recreation
collection recreation
mass seed
production reset

Do not replace the production database with a development database.

==================================================
5. USERS AND AUTHENTICATION
==================================================

There is ONE canonical users collection:
users

Authentication is based on:
rahaal_session
stored in:
sessions

Password hashes are stored in:
users.password_hash

Do NOT create another authentication system.
Do NOT migrate to JWT unless explicitly requested.
Do NOT create a second users collection.
Do NOT recreate existing users during deployment.

Existing users must remain unchanged.
Passwords must never be overwritten automatically.

==================================================
6. SUPER ADMIN
==================================================

Rahaal has a super administrator architecture.

Role:
super_admin

The super_admin is not tied to a tenant:
tenant_id = null

Do NOT create a new super_admin on every deployment.
Do NOT overwrite the existing admin account.
Do NOT replace existing users with demo users.

If administrator access needs to be changed,
provide a controlled admin operation or ask the user first.

==================================================
7. TENANTS / TRAVEL OFFICES
==================================================

Travel offices are represented by:
tenants

There is ONE tenants collection.

Users are connected through:
users.tenant_id -> tenants.id

Do NOT create another collection for travel offices.
Do NOT duplicate tenants.
Do NOT recreate existing travel offices.
Do NOT seed demo tenants into Production.

The existing production tenants are authoritative.

==================================================
8. API ARCHITECTURE
==================================================

The canonical API is:
app/api/[[...path]]/route.js

This is the primary API source.

Do NOT create another parallel API architecture.
Do NOT create:
pages/api
or another competing API root unless explicitly requested.

Before adding a new endpoint:
search route.js and existing API routes first.
Reuse existing functionality whenever possible.

==================================================
9. FILESYSTEM / PATHS
==================================================

Production project path:
/var/www/rahaal

Emergent development path:
/app

These paths are environment-specific.

Do NOT hard-code /app as a production filesystem path.
Do NOT assume production files exist under /app.
Do NOT create additional Rahaal production directories without
explicit approval.

==================================================
10. PRODUCTION REVERSE PROXY
==================================================

Current production routing is:

Internet
  ->
rahaal.targetmediagrp.com
  ->
Nginx
  ->
127.0.0.1:8002
  ->
Docker container: rahaal_proxy
  ->
Emergent-hosted Rahaal application

Current Docker proxy:
rahaal_proxy

Current image:
nginx:alpine

Current host port:
127.0.0.1:8002

The proxy currently forwards to the Emergent-hosted application.

Do NOT modify production Nginx, Docker proxy, ports, DNS,
or reverse proxy configuration automatically.

==================================================
11. ENVIRONMENT VARIABLES
==================================================

Required:
MONGO_URL
DB_NAME

Optional:
CORS_ORIGINS
NEXT_PUBLIC_BASE_URL

Never commit real production secrets to GitHub.
Never copy production secrets into source code.
Never generate a new .env with guessed production values.

==================================================
12. DEVELOPMENT / PREVIEW DATABASE
==================================================

Emergent Preview may use a separate development database.
That database is NOT Production.

Development data must never be assumed to represent Production data.

Do NOT copy Preview users, tenants, offices, or database contents into
Production automatically.

Do NOT rename a Preview database and assume it is Production.

==================================================
13. SEEDING
==================================================

Seeding is allowed ONLY for development/testing unless explicitly
authorized for Production.

Do NOT automatically create:
demo tenant
demo users
demo admin
demo subscription plans
inside the real Production database.

If seedInitial() exists, it must never destroy or overwrite real
production data.

==================================================
14. MIGRATIONS
==================================================

Any migration must be:

- explicit
- documented
- reversible where possible
- idempotent
- tenant-aware
- tested first on a backup/development database

Never automatically run a live migration during a normal application
deployment.

Migration scripts must never contain dangerous production fallbacks.

Never use:
MONGO_URL || "mongodb://localhost:27017"
for production migrations.

Never use:
DB_NAME || "your_database_name"
for production migrations.

If required environment variables are missing:
STOP.

==================================================
15. BACKUPS
==================================================

Before any Production database modification:

1. Create a complete MongoDB backup.
2. Verify the backup.
3. Record the backup location.
4. Only then perform the operation.

Application deployment and database migration are separate operations.

Updating application code must NOT automatically modify production data.

==================================================
16. GITHUB
==================================================

GitHub is the source-control repository.
GitHub is NOT the Production database.

GitHub must contain application source code and configuration templates,
not live database contents.

Do NOT commit:

.env
production secrets
MongoDB dumps
passwords
real tokens
production credentials

Historical backups should not be kept inside the main source tree unless
explicitly required.

==================================================
17. CLEAN REPOSITORY
==================================================

Before adding new code, inspect the repository.

Do not create duplicate:

- APIs
- database connectors
- configuration files
- authentication implementations
- upload systems
- environment files
- migration systems
- test systems

If an old file already provides the required functionality:
reuse it or explicitly explain why it must be replaced.

Do NOT create files with names such as:
route_v2.js
route_new.js
route_final.js
route_fixed.js
database_new.js
database_backup.js
unless explicitly requested.

==================================================
18. BEFORE MODIFYING ANYTHING
==================================================

MANDATORY READ-ONLY AUDIT.

Before making architectural changes, inspect:

1. MongoDB connection
2. DB_NAME
3. users
4. tenants
5. authentication
6. API routes
7. environment variables
8. Nginx/proxy configuration if relevant
9. migration scripts
10. duplicate files

Report findings before destructive changes.

==================================================
19. NEVER GUESS PRODUCTION VALUES
==================================================

If Emergent does not know:

- production DB_NAME
- production MONGO_URL
- production admin identity
- production filesystem path
- production proxy configuration

DO NOT GUESS.
DO NOT create a replacement.
DO NOT create a new database.
DO NOT create a new admin.

Ask the project owner.

==================================================
20. DEPLOYMENT PRINCIPLE
==================================================

Future workflow:

Emergent
   ↓
Clean code
   ↓
Read-only audit
   ↓
GitHub
   ↓
Review / compare
   ↓
Backup Production
   ↓
Deploy application
   ↓
Verify
   ↓
Only then perform approved DB migrations

Never:

Emergent
   ↓
automatic database recreation
   ↓
automatic user recreation
   ↓
automatic production reset

==================================================
21. DATABASE ARCHITECTURE IS STABLE
==================================================

The following architecture is canonical unless explicitly changed:

MongoDB
  |
  +-- users
  +-- sessions
  +-- pats
  +-- tenants
  +-- tenant_settings
  +-- accounts
  +-- clients
  +-- suppliers
  +-- boxes
  +-- tickets
  +-- visas
  +-- services
  +-- packages
  +-- package_bookings
  +-- vouchers
  +-- journal_entries
  +-- countries
  +-- subscription_plans
  +-- announcements
  +-- refunds
  +-- cashout_requests
  +-- payout_methods
  +-- currency_exchanges
  +-- visa_monitoring
  +-- service_types
  +-- package_components
  +-- package_transports

Do not create duplicate collections for the same business entities.

==================================================
22. CURRENT PROJECT STATUS
==================================================

Rahaal is being prepared as the first stable production system.
TargetMedia will be handled as a separate project later.

Do not mix TargetMedia application data with Rahaal data.

Rahaal must become stable first.

==================================================
23. CHANGE CONTROL
==================================================

Every future change must classify itself as one of:

A. UI change
B. API change
C. Database schema change
D. Migration
E. Authentication change
F. Infrastructure/deployment change
G. Security change

For C/D/E/F/G:
STOP and provide a plan before executing.

==================================================
24. FINAL RULE
==================================================

PRESERVE EXISTING PRODUCTION DATA.
PRESERVE EXISTING USERS.
PRESERVE EXISTING TENANTS/OFFICES.
PRESERVE EXISTING DATABASE.
PRESERVE EXISTING AUTHENTICATION.
PRESERVE EXISTING PRODUCTION CONFIGURATION.

CODE MAY CHANGE.
DATA MUST NOT CHANGE UNLESS THE USER EXPLICITLY REQUESTS IT.

If there is any uncertainty:
STOP.
REPORT.
ASK.

Do not guess.
Do not create a new database.
Do not create duplicate users.
Do not reset Production.
Do not silently change architecture.

==================================================
25. VERIFIED PRODUCTION MONGODB DEPLOYMENT (LIVE SERVER)
==================================================

The following facts about the Rahaal Live Server MongoDB deployment
have been verified end-to-end (PING=1, DB_NAME=rahaal, 29 collections):

- MongoDB is EXTERNAL to the Rahaal application container.
  It runs directly on the Live Server host as a system service.

- Production uses the existing Host MongoDB database named:
    rahaal

- The Rahaal Docker container reaches MongoDB via the docker bridge:
    mongodb://host.docker.internal:27017

- MongoDB must NEVER be exposed publicly.
  Access is restricted to the local Docker bridge/network only.
  Do NOT change mongod bindIp to 0.0.0.0.
  Do NOT open port 27017 in any external firewall rule.

- Live Server firewall / network configuration is a deployment
  PREREQUISITE — it is NOT part of the application source code
  and must be managed by the server administrator, not by the
  Rahaal codebase or by any automated deploy step.

