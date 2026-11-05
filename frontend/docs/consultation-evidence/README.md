# US-01 Patient consultation evidence

The Patient Overview's existing **Chat with Carely** entry now mounts `Consultation` and sends only patient-authored messages to `POST /api/consult`. The current local FastAPI returned a follow-up for “Tôi bị nổi mẩn đỏ trên da”, then suggested “Da liễu” after “Khoảng hai ngày nay”; both responses identified `mode: controlled-prototype`. The emergency input “Tôi bị đau ngực dữ dội” returned `urgent: true`, displayed the API warning, and offered no doctor discovery or booking action inside the chat. The underlying page is dimmed while the consultation dialog is open.

Screenshots:

- `desktop-follow-up.jpg`, `mobile-follow-up.jpg`: first API response and follow-up composer.
- `desktop-specialty.jpg`, `mobile-specialty.jpg`: second API response, source label and specialty.
- `desktop-urgent.jpg`: emergency response without a doctor action.

The flow was exercised through the production Next build at `http://127.0.0.1:3101/` with FastAPI at `http://127.0.0.1:8000/`; backend logs recorded HTTP 200 for `POST /api/consult`. With FastAPI stopped, the UI showed a network error and Retry. Restarting FastAPI and retrying displayed the follow-up with exactly one copy of the patient's message. Closing and reopening the chat retained its conversation until **Start a new conversation** was selected.

The local backend used its controlled prototype and demo catalog because no Supabase configuration was provided. The signed-in Patient action passes the returned specialty to the existing Doctor Browser keyword search and opens the `#book` entry. FE2 owns the exact specialty filter and doctor discovery to booking bridge; no booking route was changed. Guest consultation is available from Overview, with sign-in required before opening the Doctor Browser. The post-login guest handoff opens `#book`; it does not retain the guest's specialty filter.
