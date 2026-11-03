# BookLeaf Author Support

The portal where BookLeaf authors raise support tickets about their books and account, and where Admins triage and answer them with AI assistance.

## People

**Author**:
A writer published by BookLeaf who signs in to see their own books and tickets.
_Avoid_: User, customer, client

**Admin**:
A member of BookLeaf's operations team who works the ticket queue. There is one Admin role with no tiers.
_Avoid_: Agent, staff, support rep, operator

## Books

**Book**:
A title an Author publishes through BookLeaf, at any Production Stage.
_Avoid_: Title, publication

**Production Stage**:
Where a Book is in BookLeaf's pipeline: Manuscript Received, Editing, Cover Design, Typesetting, Proofreading, ISBN Assignment, Printing, Distribution Setup, or Published & Live.
_Avoid_: Book status, state

## Royalties

**Pending Royalty**:
Royalty an Author has earned but BookLeaf hasn't paid yet. Counted per Book and summed across all the Author's Books.
_Avoid_: Outstanding, due, balance

**Payout**:
A quarterly bank transfer of an Author's Pending Royalty, made within 45 days of the quarter ending.
_Avoid_: Payment, disbursement

**Payout Threshold**:
₹1,000. If an Author's total Pending Royalty is below it, it rolls over to the next quarter instead of being paid out.

**Next Payout Date**:
The latest date the next Payout is due: 45 days after the current quarter ends.

**Overdue**:
An Author whose total Pending Royalty is at or above the Payout Threshold, and whose last Payout window passed without a Payout.
_Avoid_: Late, delayed

## Tickets

**Ticket**:
One support case raised by an Author, about one of their Books or about their account in general. It holds a thread of Messages.
_Avoid_: Query, issue, case, request

**Ticket Status**:
Where a Ticket is in its lifecycle: Open, In Progress, Resolved, or Closed.

**Message**:
One entry in a Ticket's thread, written by the Author or an Admin and visible to both.
_Avoid_: Response, reply, comment, query

**Internal Note**:
An entry on a Ticket written by an Admin for other Admins, never visible to the Author.
_Avoid_: Comment, private message

**Draft**:
AI-written text for an Admin's next Message, not yet sent. The Admin edits it before sending, or discards it.
_Avoid_: Suggestion, reply

**Stale Draft**:
A Draft written before the Author's latest Message, so it no longer answers the thread.

**Assignee**:
The one Admin currently responsible for a Ticket. A Ticket has at most one.
_Avoid_: Owner, handler

**Takeover**:
One Admin asking another Admin to hand over a Ticket that is assigned to the second Admin. The current Assignee has to acknowledge before the Ticket moves.
_Avoid_: Reassignment, steal

**Force Takeover**:
A Takeover the requesting Admin completes without the Assignee's acknowledgement, after the Assignee has not answered for 15 minutes. It is always recorded with a reason.

**Ticket Event**:
A recorded change to a Ticket: status, Assignee, Takeover, or a Category or Priority override. Admins see every Ticket Event, and Authors see only status changes.
_Avoid_: Log, audit entry, activity

**Attachment**:
An image or PDF attached to a Message by the Author or an Admin.
_Avoid_: File, upload

**Awaiting Admin**:
A Ticket whose latest Message is from the Author, so the next move is BookLeaf's. How long it has been waiting is measured from that Message.
_Avoid_: Unanswered, pending

## Triage

**Category**:
The kind of problem a Ticket is about: Royalty & Payments, ISBN & Metadata Issues, Printing & Quality, Distribution & Availability, Book Status & Production Updates, or General Inquiry.
_Avoid_: Type, topic, tag

**Priority**:
How urgently a Ticket needs attention: Critical, High, Medium, or Low.
_Avoid_: Severity, urgency

**Priority Floor**:
A minimum Priority that BookLeaf policy sets for certain Tickets, such as ISBN & Metadata Tickets or royalty Tickets from an Overdue Author. A Priority Floor only ever raises the AI's Priority, and an Admin override wins over it.

**Unclassified**:
A Ticket that has no Category or Priority yet, either because the AI hasn't finished or because it failed. An Admin can classify it by hand.
