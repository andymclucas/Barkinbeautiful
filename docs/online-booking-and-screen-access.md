# Groomigo — Online Booking & Multi-Screen Operations Design

## Operating goal

Groomigo will use one shared database for the front computer, workflow iPads, grooming-room TVs, and staff phones. Every screen reads the same appointment and workflow records; an action on one screen updates the others without logging them out or replacing their view.

The current workflow display is available at `/workflow/display`. It is deliberately read-only and refreshes every 20 seconds, so it is suitable for a TV or a back-room iPad without exposing client payments, invoices, analytics, or editing controls.

## Screen and access roles

| Role | Typical device | Access | Purpose |
| --- | --- | --- | --- |
| Admin / front desk | Front computer | Full Groomigo access | Booking, invoicing, client accounts, workflow management, analytics |
| Workflow operator | Front-desk or back-room iPad | Workflow Board and pet notes only | Moves pets between stages, assigns staff, updates alerts and notes |
| Groomer | Personal phone | Own calendar, assigned pets, grooming notes, outgoing client SMS | Reviews their day and completes pet work without access to billing controls |
| Bather | Back-room iPad or phone | Bath/dry assignments and workflow actions | Updates bath and drying stages only |
| Display | Grooming-room and bathing-room TVs | Read-only Workflow Display | Shows live operational status without editable data |

Each device should use its own browser session and its own account. Signing in, sending an invoice, or navigating on the front computer does **not** sign out or redirect an iPad or TV. The existing read-only display page is already separate from the front-desk board. Individual staff accounts will be added once each staff member's email address and the required access role are confirmed.

## Timed workflow rules

Every transition now records timestamps for check-in, bathing, drying, grooming, ready, and pickup. This supports:

- **Live stage timer:** time in the current stage, colour-coded at 30 and 60 minutes.
- **Total turnaround:** elapsed time from check-in until completion/pickup.
- **Stage duration:** bath, dry, groom, and ready/waiting time on the pet-detail panel.
- **Daily production snapshot:** completed average durations by assigned bather and groomer, with amber review flags for unusually long stages or total visits.

Initial review thresholds are operational prompts rather than automatic performance judgements: bath over 90 minutes, dry over 75 minutes, groom over 150 minutes, or total visit over 240 minutes. These values should be reviewed with Lauren after real salon use and may differ by breed, coat condition, service, and pet behaviour.

## Future public online booking controls

Public online booking remains disabled during the prototype. Before it is enabled, Groomigo should provide the following controls.

The public `/book` page is now live in a safe **coming soon** state. It only exposes approved groomer profiles and will not accept a booking until an administrator enables public booking and marks at least one staff profile as bookable.

| Booking control | Rule |
| --- | --- |
| Groomer selection | Each bookable groomer has a customer-facing profile with photo, name, short bio, services, and availability. Customers can select a groomer or choose "first available". |
| Groomer capacity | Every groomer receives a configurable maximum dogs-per-slot and/or grooming-minutes-per-slot. A slot disappears once its capacity is reached. |
| Bath-only protection | Bath-only bookings use dedicated timeslots and a configurable online cap. Initial Barkin' Beautiful rule: **maximum 3 online bath-only bookings per day**, with staff still able to add internal bookings. |
| Service duration | Each service, size, coat type, and add-on defines expected duration and resource requirements before a slot is offered. |
| Multi-pet households | Each pet is assessed independently for capacity. A family booking may share a client session but still consumes the correct number of groomer/bathing places. |
| Conflict prevention | Server-side validation, not just the customer interface, checks existing confirmed appointments and temporary booking holds before confirming a slot. |
| Booking holds | A short, expiring hold reserves a selected slot while the customer completes their details and payment/confirmation step. |
| Manual override | Front desk can always override online limits with an audit note; online customers cannot. |

## Required data before implementation

1. Confirm which groomers can be chosen online and provide an approved profile photo, short bio, and service list for each.
2. Confirm capacity rules per groomer: maximum dogs simultaneously, maximum dogs per day, and any breed/size restrictions.
3. Confirm whether the bath-only cap of three applies **per day**, **per bather**, or **per time block**.
4. Provide staff email addresses and desired roles for separate Groomigo logins.
5. Confirm whether the TV display should show pet/owner surname only, pet names only, or include cage/tag numbers.

## Realtime expectation

The current display refreshes from the shared database every 20 seconds, which is reliable on the present managed hosting. When the salon needs near-instant sub-second synchronisation across several displays, Groomigo can move the workflow stream to persistent WebSocket/SSE hosting. That is an optional future enhancement rather than a requirement for the initial operational launch.
