-- AlterTable — add the generated tsvector column. STORED is required for
-- indexing; `coalesce(…, '')` is required because to_tsvector(NULL) is NULL
-- and would null out the whole generated value if either column is null.
-- The 'simple' config is fixed at DDL level; the search-time config is
-- runtime-configurable via SEARCH_FTS_LANGUAGE. See search-module plan D1.
ALTER TABLE "Product"
    ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("description", '')), 'B')
    ) STORED;

-- CreateIndex — GIN over the generated column powers /search.
CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");

-- CreateIndex — case-insensitive btree powers the /search/suggest
-- prefix-match endpoint (LIKE lower($1) || '%').
CREATE INDEX "Product_name_lower_idx" ON "Product" (lower("name"));
