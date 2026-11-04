-- CreateEnum
CREATE TYPE "TicketEventKind" AS ENUM ('STATUS_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'TAKEOVER_REQUESTED', 'TAKEOVER_ACCEPTED', 'TAKEOVER_DECLINED', 'TAKEOVER_CANCELLED', 'TAKEOVER_FORCED', 'CATEGORY_OVERRIDDEN', 'PRIORITY_OVERRIDDEN');

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "kind" "TicketEventKind" NOT NULL,
    "author_id" TEXT,
    "admin_id" TEXT,
    "before" TEXT,
    "after" TEXT,
    "reason" TEXT,
    "visible_to_author" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A Ticket Event is made by exactly one of an Author or an Admin.
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_one_actor_check" CHECK (("author_id" IS NULL) <> ("admin_id" IS NULL));
