-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "assignee_id" TEXT;

-- CreateIndex
CREATE INDEX "tickets_assignee_id_idx" ON "tickets"("assignee_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
