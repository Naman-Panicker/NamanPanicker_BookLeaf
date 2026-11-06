# BookLeaf Author Support & Communication Portal

A web app where BookLeaf's Authors raise support Tickets about their Books and accounts, and where BookLeaf's Admins triage and answer them with AI assistance. The AI classifies each Ticket and writes a Draft reply. An Admin always checks the Draft before it reaches an Author.

**Live demo:** https://naman-panicker-book-leaf.vercel.app  
**API docs (Swagger UI):** https://naman-panicker-book-leaf.vercel.app/docs

The demo runs on free tiers, so the first request after about 15 minutes idle can take around a minute while the API wakes up. If sign-in says it can't reach BookLeaf, wait a moment and try again.

## Demo logins

Every account uses the password `BookLeaf-demo-2026`.

| Role | Email | Worth looking at |
|---|---|---|
| Admin | `asha.rao@bookleaf.example` | The queue, and BL-903, which has an Internal Note |
| Admin | `dev.menon@bookleaf.example` | Holds BL-903 and BL-905, so shows a Ticket from the other side |
| Author | `meera.nair@email.com` | A back-and-forth thread on BL-903 |
| Author | `kavita.deshmukh@email.com` | ₹850 pending, which is below the Payout Threshold, and a Book in production |
| Author | `ananya.reddy@email.com` | Never paid, and above the threshold, so Overdue |

All 10 sample Authors can sign in, with the emails from the sample data. To see updates arrive without a refresh, open a Ticket as an Author and as an Admin in two browsers.

## What it does

**Authors** see their Books and a royalty summary, raise Tickets about a Book or their account, and follow them in My Tickets. They reply in the thread, and can confirm that a Resolved Ticket solved their problem.

**Admins** work one queue of every Ticket, most urgent first and, among equals, longest wait first, filterable by status, Category, Priority, date and "assigned to me". The workspace for a Ticket shows:

- one timeline of Messages, Internal Notes and Ticket Events
- an editable AI Draft
- the Book's details and the Author's royalty facts
- controls for status, Category, Priority and assigning themselves

Terms like Ticket, Draft and Priority Floor have exact meanings, defined in [GLOSSARY.md](GLOSSARY.md).

## Architecture

```
Browser ── same origin ──> Next.js on Vercel ── rewrite /api/* and /docs ──> Express on Render ──> Neon Postgres
                                                                                  └──> Gemini
```

A pnpm TypeScript monorepo:

- `apps/web`: Next.js, Tailwind and shadcn/ui
- `apps/api`: Express and Prisma
- `packages/shared`: zod schemas, plus pure rules such as Ticket status transitions, royalty facts and queue ordering

### Decisions and why

- **A separate Express API, not Next.js route handlers.** Classification runs in the background after the response to the Author has gone, which needs a long-running process. It also makes the REST layer, its authentication and its role checks an explicit boundary.
- **The browser only talks to the Next.js origin.** Rewrites proxy to Express, and the session is a first-party `httpOnly`, `SameSite=Lax` cookie. There's no CORS, and scripts in the page can't read the token. The API only accepts JSON bodies, which, with `SameSite=Lax`, closes off cross-site form posts.
- **One zod schema per request and response, shared by both sides.** Routes are registered through one helper, so validation, types and the OpenAPI document come from the same source and can't drift apart.
- **Internal Notes have their own table.** With one table and a kind field, every query serving Authors would have to remember a filter, and the first one that forgot would leak Admin-only text. With two, code serving Authors never touches the table. The Draft prompt only accepts `Message` records, so the compiler stops a Note reaching the AI.
- **Polling, not a stream, for live updates.** Pages refresh every 5 seconds while their tab is showing. The next request starts only after the last one finishes, and if one fails the page keeps what's on screen and tries again. An SSE prototype through Vercel's rewrite dropped at irregular intervals on the live site, and the assignment explicitly allows polling. The cost is up to 5 seconds of delay and steady requests while a page is open.
- **Business rules are pure functions.** Status transitions, Priority Floors, royalty facts and queue order live in `packages/shared`, with unit tests and no database.

### Access rules

- Everything needs a session, and a logged-out caller gets 401 even for a URL that doesn't exist.
- An Author asking for another Author's Ticket or Book, or for any Admin route, gets the same 404 as for something that doesn't exist, so responses reveal nothing about what's there.
- The role check runs before validation, so a malformed request can't reveal that an Admin route exists.
- Selects on Author routes name their columns, so Admin-only fields never leave the database on those routes. Admins are never named to Authors, who hear from "BookLeaf".

## How the AI works

Both jobs use Gemini 3.5 Flash-Lite through one `AiClient` interface, so changing the model or provider stays in one file. Classification is a short, constrained choice, and Drafts mostly put facts computed in code into BookLeaf's voice, so a larger model would add cost and latency for little gain. I chose Gemini because its free tier keeps the demo free to run.

### Classification

When a Ticket is raised it's stored straight away, and classification runs in the background, so the AI can never block or fail an Author's request. The prompt has the subject, first Message and Book, and asks for structured output limited to the valid Categories and Priorities. Anything else is treated as a failure.

**Priority Floors** apply BookLeaf policy in code on top of the AI's answer. ISBN & Metadata Tickets, and royalty Tickets from an Overdue Author, are raised to at least High. An Admin's override beats both the AI and a Floor, and a late AI answer can't overwrite it.

### Drafts

A Draft is written when an Admin opens a Ticket, never automatically sent, and never written unless someone is there to use it. The prompt has:

- **Rules and tone**, adapted from the Communication Tone Guidelines. They change rarely, and come first.
- **Only the relevant Knowledge Base section:** the policies and sample answers for the Ticket's Category. An Unclassified Ticket gets them all, because it could be about anything.
- **Facts computed in code:** the Book's details, Pending Royalty, Next Payout Date, and whether the Author is Below Threshold or Overdue. The model is handed these figures and told not to invent others, because date and money arithmetic shouldn't depend on a language model.
- **The subject and the last 6 Messages.**

Author text is escaped and treated as untrusted data, so a Ticket can't pass itself off as instructions. Internal Notes can't reach the prompt at all, because of the types described above.

### Cost

- Each Draft carries 13–26% of the Knowledge Base, depending on the Category (measured in characters).
- Drafts are cached on the Ticket and reused until the Author sends a new Message, which makes the cached one a Stale Draft. Two Admins opening a Ticket together share one AI call.
- When BookLeaf sent the latest Message, or the Ticket is Closed, opening it doesn't call the AI, because there's nothing to answer. If BookLeaf sent the latest Message, an Admin can still ask for a follow-up Draft.
- Classification reads one Message, with a small output limit.
- The prompt isn't cached: this model's free tier has no explicit caching, and implicit caching needs a far longer prompt than this one.

### When the AI fails

- **Classification:** the Ticket still exists and shows as Unclassified. It gets 3 attempts, the error is shown to Admins, who can classify it by hand or press Retry AI, and a restart picks up recent Unclassified Tickets.
- **Drafts:** a failed or rate-limited call shows "The AI couldn't write a Draft just now" and the Admin writes the Message themselves. Answers that are empty, the wrong type or too long to send count as failures.
- **No API key:** the API still runs, and everything above applies.

## API

The full reference, generated from the same schemas that validate requests, is at [`/docs`](https://naman-panicker-book-leaf.vercel.app/docs). Errors always have the shape `{ "error": { "code", "message", "details" } }`, with stable codes such as `VALIDATION_FAILED`, `UNAUTHENTICATED`, `NOT_FOUND` and `CONFLICT`.

| Method and path | Who | What |
|---|---|---|
| `POST`, `GET`, `DELETE /api/session` | Anyone, then any user | Log in, current user, log out |
| `GET /api/books`, `/api/books/:bookId` | Author | Their Books and royalty summary |
| `GET`, `POST /api/tickets` | Author | List their Tickets, raise one |
| `GET /api/tickets/:ticketId` | Author | One of their Tickets |
| `POST /api/tickets/:ticketId/resolution-confirmation` | Author | Confirm a Resolved Ticket, which closes it |
| `GET`, `POST /api/tickets/:ticketId/messages` | Author or Admin | Read the thread, send a Message |
| `GET /api/tickets/:ticketId/events` | Author or Admin | Ticket Events. Authors see only status changes |
| `GET /api/admin/tickets` | Admin | The queue, with filters |
| `GET /api/admin/tickets/:ticketId` | Admin | A Ticket with its Book and royalty facts |
| `PUT /api/admin/tickets/:ticketId/status` | Admin | Set the status |
| `PUT /api/admin/tickets/:ticketId/category`, `/priority` | Admin | Override the AI |
| `POST /api/admin/tickets/:ticketId/classification-retry` | Admin | Queue an Unclassified Ticket for the AI again |
| `GET /api/admin/tickets/:ticketId/draft` | Admin | Get the Draft, writing one if needed |
| `POST /api/admin/tickets/:ticketId/draft-regeneration` | Admin | Write a new Draft |
| `PUT`, `DELETE /api/admin/tickets/:ticketId/assignee` | Admin | Assign yourself, unassign yourself |
| `GET`, `POST /api/admin/tickets/:ticketId/internal-notes` | Admin | Read and add Internal Notes |
| `GET /api/health` | Anyone | Health check |

## Run it locally

You need Node 24 or newer, pnpm (`corepack enable` picks up the pinned version), and two Postgres databases, one for the app and one the tests can wipe. Neon's free tier works.

```bash
pnpm install

cp apps/api/.env.example apps/api/.env   # fill it in. The comments explain each value
cp apps/web/.env.example apps/web/.env   # optional. The API URL defaults to localhost:4000

pnpm --filter @bookleaf/api db:migrate
pnpm --filter @bookleaf/api db:seed      # safe to run again

pnpm dev                                 # web on :3000, API on :4000
```

Without `GEMINI_API_KEY` the app still runs, with Tickets left Unclassified and no Drafts.

```bash
pnpm typecheck
pnpm lint
pnpm test    # needs TEST_DATABASE_URL, whose database the tests wipe
```

The API tests run with supertest against a real Postgres database, with a fake AI client and a fixed clock. They check behaviour someone outside the code can see, such as status codes and bodies. Pure rules have unit tests in `packages/shared`. Run against a remote database the suite is slow, because every query crosses the network. There are no automated browser tests.

## Known data quirks

- Books still in production have ISBNs in the sample data, though ISBN Assignment comes later in the pipeline. The data is loaded exactly as given.
- ISBNs in the sample data are placeholders like `978-93-5XXXX-01-1`, and aren't valid.
- Overdue is worked out from the real clock, while the sample data's Payouts are from a fixed point in the past. So Authors above the threshold can show as Overdue, which raises their royalty Tickets to at least High.
- Payouts don't record which quarter they cover, so any Payout made after a quarter ended counts as covering it. That assumption sits behind both the Next Payout Date and Overdue.

## Known limitations

- **Drafts need checking.** A Draft can misstate a figure even when given the right facts, which is why nothing goes out without an Admin. The Knowledge Base also mentions dashboard features this portal doesn't have, such as a royalty breakdown by platform, so a Draft can point an Author to them. The Admin needs to catch that.
- **No Takeover.** A Ticket held by another Admin can only be given up by that Admin. If they're away, it stays with them. A request-and-accept handshake is the next step.
- **Attachments are UI only**, as the assignment allows: the field is on the form, but disabled.
- **Polling costs requests.** Each open page makes a few requests every 5 seconds, which is fine at demo scale. Conditional requests would cut that first.
- **Background AI work lives in memory.** A restart recovers Unclassified Tickets from the last 24 hours, but a queue would be sturdier.
- **Sign-in has no rate limit**, and there's no password reset.
- **Free-tier privacy.** On Gemini's free tier Google can use content to improve its products. That's fine for sample data, but real Author data would need the paid tier.
- **AI accuracy isn't measured automatically.** The AI's suggestions and any Admin overrides are both stored, so the override rate can be measured once there's real usage, but there's no evaluation suite yet.
