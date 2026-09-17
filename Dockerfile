FROM adrianmusante/pocketbase:0.40.4

COPY dist/. /pocketbase/public/
COPY pb_migrations/. /pocketbase/migrations/
COPY pb_hooks/. /pocketbase/hooks/
