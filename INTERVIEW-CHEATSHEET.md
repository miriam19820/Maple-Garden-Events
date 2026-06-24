# Maple Garden Events — Interview Cheat Sheet (English)

Use this as your speaking notes. Practice the **30-second pitch** and **2-minute version** out loud.

---

## 1. Project Identity

| Field | What to say |
|--------|-------------|
| **Project name** | Maple Garden Events — Event venue management system |
| **Type** | Full-stack web application (real business use case) |
| **Your role** | Full-stack developer — frontend, backend, database, and feature delivery end-to-end |
| **Problem it solves** | Replaces paper/manual workflows for booking events, managing options, contracts, production forms, and live hall check-in |

---

## 2. Elevator Pitch

### 30 seconds

> "I built a full-stack event venue management system for a wedding hall. Managers use it to manage the calendar, create options and bookings, generate digital contracts and PDFs, fill production forms, and capture hall reception details during live events. It's built with **React and TypeScript** on the frontend, **Node.js, Express, and Prisma** on the backend, and **PostgreSQL** for the database."

### 2 minutes (if they say "Tell me more")

> "The system covers the full event lifecycle: first an **option** is saved on the calendar, then it becomes a **confirmed booking** with pricing, VAT, discounts, and digital signature. Staff use an **event production form** for guest counts, menu, seating, and table layout. On event day, a **hall reception form** opens from the calendar — pre-filled from booking data, editable only during the event, view-only afterward, with a required customer signature.
>
> Technically it's a separated **client–server architecture**: React SPA talking to a REST API, with **JWT + Google OAuth** for admin access, **Socket.io** for real-time calendar updates, and **Puppeteer** for PDF generation. I used **TypeScript** on both sides and **Prisma** for type-safe database access and migrations."

---

## 3. Tech Stack — Quick Reference

### Frontend

- **React 19** + **TypeScript**
- **Vite** (build tool & dev server)
- **React Router** (multi-page navigation)
- **CSS Modules** (component-scoped styling)
- **Axios** (HTTP client)
- **Zustand** (client state)
- **Socket.io Client** (real-time updates)
- **react-signature-canvas** (digital signatures)
- **react-webcam** (camera capture, e.g. deposit checks)
- **Tesseract.js** (OCR for bank check scanning)
- **Recharts** (charts/reports)
- **Google OAuth** (`@react-oauth/google`)

### Backend

- **Node.js** + **Express 5** + **TypeScript**
- **Prisma ORM** + **PostgreSQL**
- **Zod** (request validation)
- **JWT** + **Google Auth Library** (authentication)
- **Helmet** + **express-rate-limit** (security)
- **Socket.io** (WebSockets)
- **Puppeteer** (PDF from HTML)
- **Nodemailer** (email)
- **Multer** (file uploads)
- **node-cron** (scheduled jobs)
- **Hebcal** (Hebrew calendar / business rules)

### Architecture & Tools

- **REST API** under `/api/*`
- **Separate client and server** folders
- **Environment variables** (`.env`) for secrets
- **Prisma migrations** for schema changes
- **Git** for version control

---

## 4. Main Features (What You Built)

Say these as **business features**, not only tech:

| Feature | One-line explanation |
|---------|----------------------|
| **Calendar** | Visual calendar for options and booked events, time slots, live updates |
| **Option & booking flow** | Option → confirmed event with pricing, extras, VAT, payment terms |
| **Digital contract** | Client signature + printable/downloadable PDF contract |
| **Event production form** | Guest count, menu, seating split, entertainers, table layout editor |
| **Hall reception form (Check-in)** | Opens on event day from calendar; auto-fill; signature required; read-only after event |
| **Bookings manager** | Search, view, edit existing bookings |
| **Options manager** | Manage open options |
| **Feedback system** | Customer feedback collection |
| **Admin auth** | Google login + allowlist of authorized emails |
| **PDF generation** | Contracts and event detail documents |
| **OCR for checks** | Scan deposit checks from Israeli banks |
| **Navigation UX** | Global back button, consistent header, modal close patterns |

---

## 5. Architecture (Simple Diagram to Explain)

```
Browser (React + TypeScript)
        ↕  REST API (Axios)  +  WebSockets (Socket.io)
Server (Express + TypeScript)
        ↕  Prisma ORM
PostgreSQL Database
```

**One sentence:**

> "The React client calls REST endpoints on Express; Prisma maps models like Booking, EventForm, and EventCheckIn to PostgreSQL; Socket.io pushes calendar changes without refresh."

---

## 6. Database / Data Model (If They Ask)

Main entities you can mention:

- **Booking** — clients, date, guest count, pricing, status, signatures
- **EventForm** — production details (time, menu, seating, entertainers)
- **EventCheckIn** — live hall reception data linked to booking
- **CalendarDate** — dates on the calendar with linked bookings
- **AuthorizedEmail** — who can log in as manager

**Sample line:**

> "I designed relational models with Prisma — for example, one Booking has one optional EventForm and one optional EventCheckIn, with foreign keys and migrations when adding fields like minimumGuestCount."

---

## 7. Technical Highlights (Impressive Points)

Pick 2–3 you're comfortable explaining deeply:

1. **End-to-end feature delivery** — UI + API + DB + PDF (e.g. minimum portions field)
2. **Time-based business logic** — `eventStart` utility: when check-in is viewable vs editable
3. **Security** — OAuth verification server-side, JWT, rate limiting, Helmet
4. **PDF pipeline** — HTML template → Puppeteer → PDF buffer → download/email
5. **Real-time UX** — Socket.io for calendar sync
6. **Validation** — Zod on server, form validation on client
7. **Digital signatures** — canvas capture stored and validated before save

---

## 8. Challenges & How You Solved Them (STAR Format)

### Example 1 — White screen / CSS import

- **Situation:** App crashed with blank screen after adding check-in modal
- **Task:** Find root cause and fix without breaking other modules
- **Action:** Traced Vite error — regular `.css` imported as default module; moved styles to `.module.css` and fixed imports
- **Result:** App loads; learned Vite CSS module rules

### Example 2 — Check-in only during event

- **Situation:** Button appeared before event start; needed view after event but edit only during
- **Task:** Implement correct time windows on client and server
- **Action:** Built `canViewCheckIn` / `canEditCheckIn` using event start/end from booking + production form; enforced save on API with 403
- **Result:** Correct UX + server-side protection

### Example 3 — Prisma generate while server running

- **Situation:** `EPERM` when running `prisma generate`
- **Task:** Update client after schema change
- **Action:** Stopped Node process locking DLL, ran generate, restarted server
- **Result:** Schema synced; understood file locking on Windows

---

## 9. Common Interview Questions — Ready Answers

**Q: Why TypeScript?**

> "Large domain with many entities and API contracts. TypeScript catches errors early and makes refactoring safer across client and server."

**Q: Why Prisma over raw SQL?**

> "Type-safe queries, clear relations, and migrations when the schema evolves — e.g. adding EventCheckIn or minimumGuestCount."

**Q: How does authentication work?**

> "Manager logs in with Google. The server verifies the ID token, checks email against an authorized list in the database, then issues a JWT for protected routes."

**Q: How do you generate PDFs?**

> "Server builds HTML from booking data, renders it with Puppeteer, returns a PDF buffer for download or email."

**Q: How is real-time implemented?**

> "Socket.io — when data changes on the server, connected clients refresh calendar state without full page reload."

**Q: How did you handle validation?**

> "Zod schemas on the API layer plus client-side checks before submit — especially for required signature on check-in."

**Q: Did you deploy it?**

> *(Answer honestly)*  
> "Developed and tested locally / [add if true: connected to cloud PostgreSQL]. Architecture is production-ready: env-based config, security middleware, separated client and server."

**Q: What would you improve next?**

> "Automated tests (API + critical flows), CI/CD pipeline, stronger E2E tests for booking and check-in, and role-based permissions if multiple staff levels are needed."

---

## 10. What NOT to Overclaim

| Say | Avoid |
|-----|--------|
| "Full-stack TypeScript project with real domain logic" | "I'm expert in everything listed" |
| "I built features end-to-end with AI-assisted development" (if true) | "I wrote every line from scratch with no help" |
| "Dev environment; ready for production hardening" | "Already serving thousands of users" (unless true) |

---

## 11. Closing Line

> "This project shows I can take a real business problem, model it in a relational database, build a usable React frontend, secure REST APIs, and deliver features like PDFs, OAuth, and time-based workflows — which maps well to production CRUD and internal tools work."

---

## 12. One-Page Bullet List (Print This)

**Project:** Event venue management — calendar, bookings, contracts, production, live check-in

**Stack:** React · TypeScript · Vite · Node · Express · Prisma · PostgreSQL · Socket.io · Puppeteer · JWT · Google OAuth · Zod

**Architecture:** SPA + REST API + relational DB

**Highlights:** Digital contracts & PDF · Live hall form with signatures · OCR checks · Real-time calendar · Auth & rate limiting

**My contribution:** Full-stack features from UI → API → DB → PDF

**Challenge solved:** Time-based check-in logic + type-safe API/DB layer

---

## 13. Mock Q&A Script (Practice Out Loud)

**Interviewer:** "Walk me through your project."

**You:** Use the 2-minute pitch from Section 2.

---

**Interviewer:** "What was the hardest part?"

**You:** "Implementing time-based access for the hall check-in form — showing it only after the event starts, allowing edits only during the event, and enforcing that on both the React UI and the Express API so it can't be bypassed."

---

**Interviewer:** "How did you structure the backend?"

**You:** "Express with route modules per domain — bookings, calendar, event forms, check-in, auth. Controllers handle logic, Prisma handles data access, Zod validates input, and middleware handles auth and errors."

---

**Interviewer:** "Why should we hire you based on this project?"

**You:** "It proves I can own a feature from database schema to user interface, understand business rules, and ship something a real venue could actually use — not just a tutorial app."

---

*Good luck with your interview!*
