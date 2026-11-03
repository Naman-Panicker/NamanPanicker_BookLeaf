-- CreateEnum
CREATE TYPE "ProductionStage" AS ENUM ('MANUSCRIPT_RECEIVED', 'EDITING', 'COVER_DESIGN', 'TYPESETTING', 'PROOFREADING', 'ISBN_ASSIGNMENT', 'PRINTING', 'DISTRIBUTION_SETUP', 'PUBLISHED_LIVE');

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "external_ref" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "publication_date" DATE,
    "production_stage" "ProductionStage" NOT NULL,
    "mrp" INTEGER,
    "royalty_per_copy" INTEGER,
    "copies_sold" INTEGER NOT NULL,
    "royalty_earned" INTEGER NOT NULL,
    "royalty_paid" INTEGER NOT NULL,
    "royalty_pending" INTEGER NOT NULL,
    "last_payout_date" DATE,
    "print_partner" TEXT,
    "available_on" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "books_external_ref_key" ON "books"("external_ref");

-- CreateIndex
CREATE INDEX "books_author_id_idx" ON "books"("author_id");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

