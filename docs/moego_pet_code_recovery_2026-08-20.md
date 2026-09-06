# MoeGo Pet Code and Groom-Style Recovery

## Initial evidence

The authenticated MoeGo **Client & pet list** exposes a dedicated **Pet code** filter alongside pet breed, weight, membership and booking filters. This confirms that pet-code data exists in the live MoeGo account and can be queried at client or pet level.

The earlier client CSV available in the project contains client notes and tags, but its header does not include a dedicated Pet Code, clip, blade, comb, behaviour-alert or groom-history column. It is therefore insufficient for a complete structured grooming-style recovery on its own.

## Authorised export

On 20 August 2026, an authorised **Export clients** task was created from the authenticated MoeGo Client & pet list. MoeGo confirmed the task was created and that the browser would download the file on completion. The export will be inspected before import to determine whether it includes Pet Code values or only the existing client-level columns.

## Recovery approach

Recovered source text will be retained in Groomigo before any structured interpretation. Recognised terms such as blade numbers, comb lengths, warnings and behaviour alerts can be mapped into structured grooming-note fields. Any multi-meaning or free-text code will remain source-preserved and be marked for an administrator review rather than guessed.

## Authenticated pet-detail evidence

The MoeGo client record for **Desiree Mcconnon** at `https://go.moego.pet/client/21099917/pets/28406433?%7Ec=123757&%7Eb=124316` exposes individual pet cards and a dedicated **Pet codes** field. The selected pet, **Eevee** (Tibetan Terrier), contains the Pet Code `Megs do` and three separate pet notes: `Megs/ Charlie do`; `allergy to beef and green ants`; and `Size: Small`. Its page also exposes pet-specific customised service pricing and saved duration, report cards, photos, medical information and incident sections.

This confirms that a manual recovery can preserve pet-code text and pet-note source entries from MoeGo. It also confirms that a client-level export alone will not capture all groom-style data; appointment or report-card history must be inspected per pet for clip, blade, comb-length and grooming-detail records.

## Report-card check

Eevee's available MoeGo report card dated **15 August 2025** was reviewed at `https://my.moego.pet/grooming/report/nam91djsbmam?reportId=1519145`. It records the service `Tidy - Medium size or long hair`, groomer `Megan`, a free-text observation (`The sweetest girl that keeps all her tribe in line`) and favourable coat, skin, eyes and ears checks. It does **not** expose blade, comb-length, clip or detailed style data. The report-card path can therefore supplement Groomigo history with service and general handling context, but must not be treated as a source of technical clip specifications.

## Manual import progress: Desiree Mcconnon family

On 20 August 2026, the four pets under **Desiree Mcconnon** were manually recovered from authenticated MoeGo pet records and written into Groomigo without overwriting existing history. Each import creates a dedicated Groom Style Note with the original MoeGo wording retained.

| Pet | Source recovered from MoeGo | Groomigo treatment |
| --- | --- | --- |
| Eevee | `Megs do`; `Megs/ Charlie do`; allergy to beef and green ants; Small; `Tidy - Medium size or long hair` | Source preserved; allergy placed in visible caution warnings; shorthand held for administrator review. |
| Georgi | `Char Do`; `Megs/ Charlie do`; allergy to chicken; Medium; `Tidy - Medium size or long hair` | Source preserved; allergy placed in visible caution warnings; shorthand held for administrator review. |
| Olah | `Megs do`; `Megs/ Charlie do`; pluck ears if needed; shave bums but not groins; do not scoop pads; slight trim feet | Source preserved; ear and feet handling copied to structured Groom Style Note fields; no blade or comb inferred. |
| Teddy | `Char Do`; `Megs/ Charlie do`; Small; `Tidy - Medium size or long hair` | Source preserved; shorthand held for administrator review. |

All four new Groomigo records were database-checked after creation. The ambiguous `Megs do`, `Char Do` and `Megs/ Charlie do` strings were deliberately not converted into blade, comb or named style presets because the authenticated source does not define their meanings.

## Manual import progress: Chris Roulstone family

The authenticated MoeGo record at `https://go.moego.pet/client/21101780/overview?%7Ec=123757&%7Eb=124316` was reviewed pet-by-pet. **Lola** had the source codes `Ana` and `No issue, just a reminder to do them :)`, plus `Size: Small` and the customised service `Quick Bath - Small to medium`; both codes were imported as unclassified source text. **Ollie** has no Pet Code, pet note, report card or recorded grooming detail, so no speculative Groomigo note was created. **Oakley** has no grooming code but has the behaviour value `Noisy`, which was imported as a behaviour note without elevating it to a safety warning.

## Manual import progress: Marcelle Arkadieff family

The authenticated MoeGo record at `https://go.moego.pet/client/21094362/overview?%7Ec=123757&%7Eb=124316` contains three active pets and one departed pet. The departed pet **Chicko** has no Pet Code but a historical note `Atisans Disease`; it has not been imported in this active-pet recovery batch.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ruby | `Char Do`; `Style C`; `#4/16mm legs, Donut muzzle Poodle tail`; notes `#4/ 16mm legs (Flared)`, `Asian face. Poodle tail`, `Scissor tk` | Imported. Explicit #4, 16 mm legs, face and tail directions were structured; ambiguous labels and `Scissor tk` retained for review. |
| Reggie | `#19mm`; `#3`; `Style C`; `Char Do`; note `#3/ 19mm legs` | Imported. Explicit #3 and 19 mm legs structured; `Style C` and `Char Do` retained for review. |
| Lilly | `Megs do`; `#19mm`; no pet notes | Imported. The confirmed 19 mm value was structured; `Megs do` is retained as unclassified source text for review. |

No client email, SMS, invoice, Stripe payment or external workflow was triggered by any recovery action.

## Manual import progress: Ray Phillips family

The authenticated MoeGo record at `https://go.moego.pet/client/21101159/overview?%7Ec=123757&%7Eb=124316` was reviewed for all active pets. The departed pet **Bonnie** was excluded from this active-pet batch.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Trinnie | `#15 Trad`; `Megs do`; `3W`; notes `#15 Trad/ 13mm legs`, `Donut muzzle`, `Size: Medium` | Imported. The #15 traditional clip, 13 mm legs and donut muzzle were structured. `Megs do` and `3W` remain review labels. |
| Pheobe | `Megs do`; `3W`; `Style C`; `#15/ 13mm legs`; `Donut muzzle No skirt`; notes repeat #15/13 mm legs and donut muzzle | Imported. The #15 clip, 13 mm legs, donut muzzle and no-skirt instruction were structured. `Megs do`, `3W` and `Style C` remain review labels. |
| Zelda | `Char Do`; `3W`; `Style C`; `#15/ 13mm legs`; `Donut muzzle No skirt`; notes repeat #15/13 mm legs and donut muzzle | Imported. The #15 clip, 13 mm legs, donut muzzle and no-skirt instruction were structured. `Char Do`, `3W` and `Style C` remain review labels. |

## Manual import progress: Renee Gannon family

The authenticated MoeGo record at `https://go.moego.pet/client/21097268/overview?%7Ec=123757&%7Eb=124316` was reviewed for both active pets. Deactivated/passed-away **Ollie** was excluded from this active-pet batch.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Mickey | `Style C`; `leave tail, #5 body, 7 schnauzer head, scissor legs don't blend`; `DONT PLUCK EARS`; `even if infected.`; notes `#5/ Scissor legs`, `#7 Schn face`, `Leave tail` | Imported. #5 body, #7 Schnauzer face/head, scissor legs without blending, leave tail and the do-not-pluck-ears instruction were structured. `Style C` remains a review label. |
| Tilly | `Style C`; `19mm fluffy legs #3 ears SSf`; notes `19mm/ hand legs`, `#3 ears`, `Leave tail` | Imported. 19 mm hand/fluffy legs, #3 ears and leave tail were structured. `Style C` and `SSf` remain review labels. |

## Manual import progress: Mike Graham family

The authenticated MoeGo record at `https://go.moego.pet/client/21097525/overview?%7Ec=123757&%7Eb=124316` was reviewed for both active pets.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Benji | No Pet Code or technical grooming note; `Size: Small` only | Reviewed. No speculative Groomigo style note created. |
| Sweety | `✂4f`; `#4/ 16mm legs Poodle feet`; `Style C`; `Size: Toy` | Imported. #4, 16 mm legs and Poodle feet were structured. `✂4f` and `Style C` remain review labels. |

## Manual import progress: Greg Lisa family

The authenticated MoeGo record at `https://go.moego.pet/client/21099379/overview?%7Ec=123757&%7Eb=124316` contains one active pet, **Chloe**. The detailed pet record has no Pet Code, pet note, behavioural value, report card or technical grooming instruction. Only customised service prices for Bath - small and day care are present. No speculative Groomigo grooming-style note was created.

## Manual import progress: April Bradstreet family

The authenticated MoeGo record at `https://go.moego.pet/client/21095082/overview?%7Ec=123757&%7Eb=124316` was reviewed for the active pet **Poppy**.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Poppy | `#3`; `#16mm`; `Char Do`; notes `10mm/ 16mm legs`, `19mm head` | Imported. #3, 10 mm body, 16 mm legs and 19 mm head were structured. `Char Do` remains a review label. |

## Manual import progress: Janene Bosa family

The authenticated MoeGo record at `https://go.moego.pet/client/21094979/overview?%7Ec=123757&%7Eb=124316` was reviewed for the two active pets. Inactive **Hunny** was excluded.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Minnie | No Pet Code or technical grooming note; `Size: Small` only | Reviewed. No speculative Groomigo style note created. |
| Peppy | No Pet Code or technical grooming note; `Size: Toy` only | Reviewed. No speculative Groomigo style note created. |

## Manual import progress: Debbi Peterson family

The authenticated MoeGo record at `https://go.moego.pet/client/21101122/overview?%7Ec=123757&%7Eb=124316` was reviewed for active pet **Harvey**. Inactive **Albie** and departed **Baxter** were excluded from this active-pet batch.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Harvey | `Char Do`; `Style C`; `3W`; notes `#10/ 16mm legs. No skirt. Leave chest`, `Soft brows. Leave lashes`, `Round donut muzzle`, `Short scissored tail` | Imported. #10, 16 mm legs, no skirt, leave chest, soft brows, leave lashes, round donut muzzle and short scissored tail were structured. `Char Do`, `Style C` and `3W` remain review labels. |

## Manual import progress: Toni Constantini family

The authenticated MoeGo record at `https://go.moego.pet/client/21095875/overview?%7Ec=123757&%7Eb=124316` was reviewed for active pets **Cosi** and **Millie**. Departed **Dulcie** and **Jett** were excluded from this active-pet batch.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Cosi | `2W`; `✂4f`; `Longer tk`; note `16mm head` | Imported. 16 mm head was structured. `2W`, `✂4f` and `Longer tk` remain review labels. |
| Millie | `2W`; `✂5f`; `REAR DEW CLAWS`; `Size: Small` | Imported. Rear dew claws were recorded as a care warning. `2W` and `✂5f` remain review labels. |

## Manual import progress: Geri Munnich family

The authenticated MoeGo record at `https://go.moego.pet/client/21100488/overview?%7Ec=123757&%7Eb=124316` was reviewed for active pet **Stevie**. There were no ordinary pet notes, behavioural labels, health issues or incidents.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Stevie | `✂4f`; `13mm ears`; report card (29 Aug 2025): angel to groom; coat/skin good; eyes bright and clear; ears smelly | Imported. 13 mm ears was structured. `✂4f` remains a review label. The historic report-card condition is retained as historical context rather than a current alert. |

## Manual import progress: Marie Hodson family

The authenticated MoeGo record at `https://go.moego.pet/client/21098194/overview?%7Ec=123757&%7Eb=124316` was reviewed for active pets **Belle** and **Pippa**.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Belle | `✂5f`; `#5 Clean feet`; `File nails`; `Size: Small` | Imported. #5 clean feet and file nails were structured as explicit instructions. `✂5f` remains a review label. |
| Pippa | `✂5f`; `#5 Clean feet, leave ears longer`; `File nails`; `Size: Toy` | Imported. #5 clean feet, longer ears and file nails were structured. `✂5f` remains a review label. |

## Manual import progress: Allyson Warner family

The authenticated MoeGo record at `https://go.moego.pet/client/21103364/overview?%7Ec=123757&%7Eb=124316` was reviewed across the active pets **Stanley**, **Dottie** and **Bear**. Bear’s explicit handling instruction was promoted to a Groomigo high-priority warning without guessing the meaning of the remaining shorthand.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Stanley | `#16mm`; `short bums`; `Size: Toy` | Imported. 16 mm was structured; short bums was preserved as the rear-style instruction. |
| Dottie | `#16mm`; `#3`; `Splat dog`; `Size: Toy` | Imported. #3 and 16 mm were structured. `Splat dog` remains a review label. |
| Bear | `Loz do`; `No crate`; `HITCH TO WALL`; `Bit`; `Style C`; `#3 / #16MM LEGS BITES FOR FACE & FEET`; note: do not muzzle, nails last, someone hold | Imported. #3 and 16 mm legs were structured, and the explicit handling direction was added as a high-priority warning. `Loz do` and `Style C` remain review labels. |

## Manual import progress: Kristy Hemmings family

The authenticated MoeGo record at `https://go.moego.pet/client/21098012/overview?%7Ec=123757&%7Eb=124316` was reviewed for active pets **Genji** and **Zeky**. Technical values were retained without assigning them to a body region not stated by the source. The inactive pet was not changed.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Genji | `#19mm`; `#3`; `Char Do`; `#25 mm`; note `#3` | Imported. #3 plus 19 mm and 25 mm values were structured with unspecified regions. `Char Do` remains a review label. |
| Zeky | `#19mm`; `#3`; `Char Do`; `4W`; `#25 mm`; `longest length -`; note `#3` | Imported. #3 plus 19 mm and 25 mm values were structured with unspecified regions. `Char Do`, `4W` and `longest length -` remain review labels. |

## Manual import progress: Elizabeth Bell family

The authenticated MoeGo record at `https://go.moego.pet/client/21094729/overview?%7Ec=123757&%7Eb=124316` was reviewed across all five active pets. The inactive/departed pet **Abby** was not altered.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Tully | `#3` | Imported as a structured #3 value. No further technical, behavioural, medical or incident detail was present. |
| Misty | `LEAD CHEWER`; `✂4f`; note `#4` | Imported. #4 was structured and lead-chewer was added as an operational caution. `✂4f` remains a review label. |
| Chloe | `#13mm` | Imported as a structured 13 mm value. No further technical, behavioural, medical or incident detail was present. |
| Billy | `✂4f`; note `#4`; note `Size: Small` | Imported. #4 was structured; `✂4f` remains a review label. |
| Mandy | No pet code, pet note, behavioural alert, medical issue or incident was present. | Verified no-data result; no Groomigo record created. |

## Manual import progress: Dee Curtis family

The authenticated MoeGo record at `https://go.moego.pet/client/21096136/overview?%7Ec=123757&%7Eb=124316` was reviewed across the two active pets. The passed-away pet **Poppi** was not changed.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Joy | `Char Do`; `#16mm`; `16mm Crest face`; note `Size: Small` | Imported. 16 mm and the crest-face instruction were structured. `Char Do` remains a review label. |
| Sonny | `Megs do`; `#13mm`; `13mm Crest face`; note `Size: Small` | Imported. 13 mm and the crest-face instruction were structured. `Megs do` remains a review label. |

## Manual import progress: Thao Ashford family — active-pet review in progress

The authenticated MoeGo record at `https://go.moego.pet/client/21094395/overview?%7Ec=123757&%7Eb=124316` has been reviewed for **Alan** and **Gracy**. Their shared unqualified `10` code was retained for review rather than being presumed to be a #10 blade. **Lucy** remains to be checked in the individual record.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Alan | `10`; note `Shave head and tail`; `Clean feet. Long ears` | Imported. Explicit style directions were structured; `10` remains a review label. |
| Gracy | `10`; note `Shave head and tail`; `Clean feet. Long ears` | Imported. Explicit style directions were structured; `10` remains a review label. |
| Lucy | No pet code, pet note, behavioural alert, medical issue, incident or report-card detail was present. | Verified no-data result; no Groomigo record created. |

## Manual import progress: Nicole Sofianos family

The authenticated MoeGo record at `https://go.moego.pet/client/21595829/overview?%7Ec=123757&%7Eb=124316` was reviewed across both active Miniature Schnauzers. The source has overlapping blade values and does not declare which one is most recent, so both were retained rather than choosing a replacement style.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Winter | `Style C`; `#10 Trad/ 16mm legs, belly strip longer, long rounded ears, shave inside ears`; `Lions tail. leave lashes`; pet-note also included `#7 schn face` | Imported. #10 traditional clip, 16 mm legs, belly-strip, ear, tail and lash instructions were structured. The #7 Schnauzer-face notation remains in source text for review. |
| Cleo | `#15`; `✂5f`; `Noisy`; `Style C`; plus the same #10/16 mm traditional-style text as Winter | Imported. The #15 and #10 source values are retained together; 16 mm legs and explicit style directions were structured. `✂5f` is unresolved. `Noisy` is stored as operational behaviour context, not a safety warning. |

## Next prioritised manual recovery queue

The authenticated second client-list page was reviewed on 20 August 2026. The next records are prioritised by completed appointment count within that page, starting with **Delia Spri / Bailee** (66), then **Tricia Taylor** (56), **Emily Raphael** (45), **Carly Herbert** (41), and **Annie McLeod** (37). This queue is used only to choose the next manual source review; it does not imply a change to any client record until the individual pet detail is verified.

## Manual import progress: Delia Spri family

The authenticated MoeGo record at `https://go.moego.pet/client/21102466/overview?%7Ec=123757&%7Eb=124316` was reviewed for the one active pet. The passed-away pet **Keeley** was not changed.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Bailee | `✂5f`; `#3`; notes `$85 bb $100 FFT $180 full groom (blade) $200 comb clip` and `Size: Medium` | Imported. #3 was structured as an explicit source blade value. `✂5f` and historical price text remain source-preserved for review; no Groomigo pricing was altered. |

## Manual import progress: Tricia Taylor family

The authenticated MoeGo record at `https://go.moego.pet/client/21102803/overview?%7Ec=123757&%7Eb=124316` was reviewed for both active pets. Passed-away pets **Bonnie** and **Cameron**, plus inactive pet **Penny**, were excluded from this active-pet recovery pass.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Gracie | `Style C`; `13mm/ 19mm legs` | Imported. 13 mm is recorded as body length and 19 mm as leg length; Style C remains the source service-style label. |
| Lily | `Style C`; `13mm/ 19mm legs` | Imported with the same structured values, independently retained on Lily’s Groomigo history. |

## Manual import progress: Emily Raphael family — active-pet review in progress

The authenticated MoeGo record at `https://go.moego.pet/client/21103689/overview?%7Ec=123757&%7Eb=124316` was reviewed across both active pets. **Lollie** carries `PF` and `✂4f`, with explicit note `#4 face too` and `Poodle feet`; the structured #4 face and Poodle-foot instructions have been imported while shorthand is retained for review. **Louie** carries `4W` and `✂4f`, with explicit pet note `#4`; the #4 blade value has been imported while source shorthand remains unclassified for review.

## Manual import progress: Carly Herbert family

The authenticated MoeGo record at `https://go.moego.pet/client/21098055/overview?%7Ec=123757&%7Eb=124316` was reviewed for both active pets. Both retain `4W`, `Char Do`, and `Style C` as source labels, without assuming their technical meaning.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Alfie | `4W`; `Char Do`; `Style C`; `#4 / #16mm legs`; pet note `#4/ 13mm legs` | Imported. #4 is structured; both 13 mm and 16 mm leg references are retained because the source conflicts. |
| Lily | `4W`; `Char Do`; `Style C`; `#4 / #16mm legs`; pet note `#4/ 16mm legs` | Imported. #4 and verified 16 mm legs were structured; shorthand remains source-preserved for review. |

## Manual import progress: Annie McLeod family — active-pet review in progress

The authenticated MoeGo record at `https://go.moego.pet/client/21100109/overview?%7Ec=123757&%7Eb=124316` was reviewed and the active **Tommy** record has been imported. His source has `#7f` plus `Shave top of head, shave tail and ears. very very tight donut muzzle`; #7F and the explicit directions are structured and source-preserved. Passed-away pet **Bonnie** was reviewed only to confirm the status boundary: her source contains `LEAVE EYELASHES`, `KEEP LASHES! Very particular!!`, `#15 Trad`, and `#3 legs, short skirt, keep eye lashes- softer eye brows not as pointy`, but no Groomigo record was changed. Tommy has no pet note, report card, medical issue or incident data in the reviewed record.

## Recovery lookup exception: Bernard Vickers

The authorised MoeGo client search returned no record for `Bernard Vickers` or surname-only `Vickers`. The sole surname result is **Gail Vickers** with a new-pet record and zero bookings, which does not match the intended priority client and was not imported. The ranked queue should be refreshed before attempting this name again.

## Next prioritised recovery candidates

The authenticated client list was advanced after the completed second-page queue. Visible unreviewed candidates include **Julie Noy** (26 bookings; Rosie and Teddy), **Philippa Perlin** (21 bookings; Leia and Luke), **Emma Cecchin** (14 bookings; Jasper and Rylai), and **Rachel Schofield** (visible at the current list position). Julie Noy is next because she has the highest completed-booking count among the clearly unreviewed visible records.

## Manual import progress: Julie Noy family

The authenticated MoeGo record at `https://go.moego.pet/client/21100746/overview?%7Ec=123757&%7Eb=124316` was reviewed across all three active pets.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Rosie | `Megs do`; `Style C`; `#5/ 13mm legs`; matching pet note | Imported. #5 and 13 mm legs were structured; `Megs do` and `Style C` remain source labels for review. |
| Teddy | `Char Do`; `Style C`; `#5/ 13mm legs`; matching pet note | Imported. #5 and 13 mm legs were structured; `Char Do` and `Style C` remain source labels for review. |
| Tyson | No Pet Code; `Size: Toy` only; no report card, medical issue, behavioural alert or incident | Verified no-data result; no speculative Groomigo record created. |

## Manual import progress: Nicki Waldon family

The authenticated MoeGo record at `https://go.moego.pet/client/21103273/overview?%7Ec=123757&%7Eb=124316` was reviewed across both active pets. Expired vaccination entries, membership-service details and customised prices were intentionally excluded from the grooming-style import.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Snickers | `Megs do`; `4W`; `#13mm`; no pet note. Report card dated 28 Aug 2025: `Tidy - Small size or short hair` by Megan, positive wellbeing summary only. | Imported as a source-preserved Groomigo note with the report service. The meaning and body area of the codes are not stated, so no blade or length field was inferred. |
| Chester | `Char Do`; `4W`; `✂4f`; pet note `13mm head`; no report card, medical issue, behaviour alert or incident. | Imported with **13 mm head** structured. `Char Do`, `4W` and `✂4f` remain verbatim administrator-review labels; no unsupported blade or body-area mapping was created. |

## Manual import progress: Andrea Tomlin family

The authenticated MoeGo record at `https://go.moego.pet/client/21102966/overview?%7Ec=123757&%7Eb=124316` was reviewed across its three active Maltese. Deactivated pets, including Mia with `#7f` and `Megs do`, were excluded from this active-pet recovery batch. Expired vaccination entries were also excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Jaxon | `✂5f`; `Size: Toy`; 13 Aug 2025 report: Diamond - Gold SML-10kg Full Groom by Megan; described as a little shy and well behaved. | Imported as source-preserved grooming context. The 5f mapping remains unassigned for review. The shy/well-behaved report context is retained as operational information, not a safety alert. |
| Ellie | Overview chip `✂5f`, but detailed record had no Pet Code; `Size: Toy`; no report, medical issue, behaviour alert or incident. | Verified no-data result. The detailed record governs, so no speculative Groomigo import was created; the overview/detail conflict remains for administrator review. |
| Abbie | `✂5f`; `Size: Toy`; 13 Aug 2025 report: Diamond - Gold SML-10kg Full Groom by Megan; well behaved and a good girl. | Imported as source-preserved grooming context. The 5f mapping remains unassigned for review. |

## Manual import progress: Melinda Collinge family

The authenticated MoeGo record at `https://go.moego.pet/client/21095827/overview?%7Ec=123757&%7Eb=124316` was reviewed across both active pets. Deactivated Bubbles, including the `WARTS/ MOLES` note, was excluded from this active-pet recovery batch. Customised-service prices were reviewed as source context only and were not imported into Groomigo pricing.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Pearl | `#3`; no pet note, medical issue, behaviour alert or incident; 27 Mar 2026 report: Diamond - Gold SML-10kg Full Groom by Charlotte, sweet and well behaved; customised Tidy service. | Imported as source-preserved grooming context. #3 remains unassigned to a body area for administrator review; no source price was imported. |
| Raff | `✂4f`; `#7f`; `small bichon head`; `No cologne`; notes `Small bichon head, long ears` and `Size: Small`; 27 Mar 2026 report: Diamond - Gold SML-10kg Full Groom by Alison, happy and well behaved. | Imported. The explicit small Bichon head, long ears and no-cologne preferences are preserved. 4f and 7f remain unassigned to body areas for review; no source price was imported. |

## Recovery lookup exception: Philippa Perlin

On 20 August 2026, the authorised MoeGo client search returned no record for either `Philippa Perlin` or surname-only `Perlin`. No client record or Groomigo data was changed. The queue will advance to the next confirmed visible candidate; this name remains available for a later review if a spelling correction or alternate source identifier is supplied.

## Manual import progress: Emma Cecchin family

The authenticated MoeGo record at `https://go.moego.pet/client/21095589/overview?%7Ec=123757&%7Eb=124316` was reviewed across both active Samoyeds. Expired vaccination entries and customised-service pricing were excluded from this grooming-style recovery pass.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Rylai | No Pet Code; `Size: Medium`; no report card, medical issue, behaviour alert or incident; customised De-shed service. | Verified no-data result. No speculative Groomigo grooming note or source pricing import was created. |
| Jasper | No Pet Code; `Size: Medium`; no report card, medical issue, behaviour alert or incident; customised De-shed service. | Verified no-data result. No speculative Groomigo grooming note or source pricing import was created. |

## Manual import progress: Rachel Schofield family

The authenticated MoeGo record at `https://go.moego.pet/client/21101995/overview?%7Ec=123757&%7Eb=124316` has three active Border Collies: **Belle**, **Teddy** and **Stella**. Teddy and Stella each have one note and an expired vaccination entry; Belle has no note. All individual pet codes, notes, health or behaviour fields and report cards must be reviewed before any Groomigo import. Expired vaccination data remains outside the grooming-style recovery scope.

Belle’s individual record at `https://go.moego.pet/client/21101995/pets/30721533?%7Ec=123757&%7Eb=124316` has no Pet Code, note, report card, medical issue, behaviour alert or incident. It lists a customised De-shed service with a source price that is excluded from import. This is a verified no-data result: no speculative Groomigo grooming note will be created.

Teddy’s individual record at `https://go.moego.pet/client/21101995/pets/28413946?%7Ec=123757&%7Eb=124316` has no Pet Code, only `Size: Medium`, and no report card, medical issue, behaviour alert, incident or customised service. The expired vaccination is excluded from this recovery scope. This is a verified no-data result: no speculative Groomigo grooming note will be created.

Stella’s individual record at `https://go.moego.pet/client/21101995/pets/28413625?%7Ec=123757&%7Eb=124316` has no Pet Code, only `Size: Medium`, and no report card, medical issue, behaviour alert or incident. A customised De-shed service with a source price is excluded from import. This is a verified no-data result: no speculative Groomigo grooming note will be created.

All three active pets were therefore reviewed and documented without a Groomigo grooming-style import; no grooming, pricing, billing, client-message, appointment, membership or payment record was changed.

## Manual import progress: Phillipa Perlin family

The authenticated MoeGo record at `https://go.moego.pet/client/21101096/overview?%7Ec=123757&%7Eb=124316` has active **Masie** (Cocker), **Luke** (Toy Poodle) and **Leia** (Toy Poodle), plus a deactivated pet **Cleo** that is outside the active-pet recovery scope. The overview visibly shows source labels for Masie, `Char Do` and `#3` for Luke, and `Megs do` and `#3` for Leia. These dashboard labels are provisional source text only: individual pet records, notes, alerts and report cards must be reviewed before any Groomigo import or interpretation.

Masie’s individual record at `https://go.moego.pet/client/21101096/pets/28409621?%7Ec=123757&%7Eb=124316` confirms `✂5f` and `clean feet`, the pet note `JUMPS AROUND ALOT`, no medical issue or incident, and one report card dated **26 September 2025**. The explicit clean-feet instruction can be imported, while the 5f meaning remains unassigned until a body area is evidenced. The jumping note is retained as operational handling context rather than a safety alert.

Luke’s individual record at `https://go.moego.pet/client/21101096/pets/28409191?%7Ec=123757&%7Eb=124316` has no Pet Code despite the `Char Do` and `#3` labels shown on the overview, only `Size: Toy`, and no report card, medical issue, behaviour alert, incident or customised service. The detailed record governs; the overview/detail conflict is retained for review and no speculative Groomigo note is created.

Leia’s individual record at `https://go.moego.pet/client/21101096/pets/28408508?%7Ec=123757&%7Eb=124316` confirms `Megs do` and `#3`, only `Size: Toy`, and no report card, medical issue, behaviour alert, incident or customised service. A source-preserved Groomigo note was created without assigning either code to a body area or technical mapping.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Masie | `✂5f`; `clean feet`; `JUMPS AROUND ALOT`; 26 Sep 2025 report: Diamond - Gold 11-13kg Full Groom by Alison, anal glands completed, good girl/happy/well behaved. | Imported. Clean feet is retained as an explicit preference and the report context is preserved. 5f remains unassigned; jumping is operational context, not a safety alert. |
| Luke | Overview `Char Do` and `#3`; detailed record has no code; `Size: Toy`; no other source data. | Verified no-data result. The detailed record governs; no speculative Groomigo note was created and the conflict remains for review. |
| Leia | `Megs do`; `#3`; `Size: Toy`; no other source data. | Imported as source-preserved code text. No unsupported blade, comb, style or body-area mapping was made. |
| Cleo | Passed away/deactivated. | Excluded from this active-pet recovery batch. |

## Manual import progress: Josh Morgan family

The authenticated MoeGo record at `https://go.moego.pet/client/21100399/overview?%7Ec=123757&%7Eb=124316` has active **Boo** (Giant Schnauzer, 30 kg), **Milly** (Cavoodle, 4 kg) and **Kaiser** (Giant Schnauzer, 35 kg). The overview shows Boo with `#16mm`, `Style C` and `#7f`; Milly with `✂4f`; and Kaiser with `#3`, `#15` and `#15 Trad`. Passed-away/deactivated Skye and Ferdie are outside the active-pet recovery scope. Individual pet records, detailed notes, alerts and report cards must be checked before interpreting or importing any of these labels.

Boo’s individual record at `https://go.moego.pet/client/21100399/pets/35468752?%7Ec=123757&%7Eb=124316` confirms `#16mm`, `Style C`, `#7f`, and the note `#7/ 16mm traditional Schn face, long brows and tail`. This supports the structured source-preserved import of traditional Schnauzer face, long brows and tail. The #7/#7f and 16 mm body-area mapping remains unassigned because the source does not specify it; there is no report card, medical issue, behaviour alert, incident or customised service.

Milly’s individual record at `https://go.moego.pet/client/21100399/pets/31378312?%7Ec=123757&%7Eb=124316` confirms `✂4f`, no pet note, medical issue, behaviour alert, incident or customised service, and one report card dated **26 February 2026**. A source-preserved Groomigo note was created with the 4f value unassigned because no body area is stated in the verified pet record.

Kaiser’s individual record at `https://go.moego.pet/client/21100399/pets/28408215?%7Ec=123757&%7Eb=124316` confirms `#3`, `#15`, `#15 Trad`, and the explicit notes `#3 legs` and `Short schn face`. This supports structured recovery of a #3 leg instruction and short Schnauzer face preference, while the meaning and body area of the #15 / #15 Trad labels remain source-preserved for review. There is no report card, medical issue, behaviour alert, incident or customised service; the expired vaccination is excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Boo | `#16mm`; `Style C`; `#7f`; note `#7/ 16mm traditional Schn face, long brows and tail`. | Imported. Traditional Schnauzer face, long brows and tail are structured preferences; #7/#7f and 16 mm remain unassigned to body areas. |
| Milly | `✂4f`; no pet note, alert, medical issue or incident; report dated 26 Feb 2026. | Imported as source-preserved code text. 4f remains unassigned because no body area is stated in the verified pet record. |
| Kaiser | `#3`; `#15`; `#15 Trad`; notes `#3 legs` and `Short schn face`. | Imported. #3 legs and short Schnauzer face are structured preferences; #15 and #15 Trad remain source-preserved for review. |
| Skye and Ferdie | Passed away/deactivated. | Excluded from this active-pet recovery batch. |

## Manual import progress: Louise Sillar family

The authenticated MoeGo record at `https://go.moego.pet/client/21102214/overview?%7Ec=123757&%7Eb=124316` has active **Margaret** (Kerry Blue Terrier, 13 kg) and **Bob** (Bichon Frise, 5 kg), plus deactivated Matilda outside this recovery scope. The overview visibly shows Margaret with `#3` and `#7f`, and Bob with a source code label that requires individual-record verification. Individual notes, alerts and report cards must be reviewed before technical interpretation or Groomigo import.

Margaret’s individual record at `https://go.moego.pet/client/21102214/pets/28409526?%7Ec=123757&%7Eb=124316` confirms `#3`, `#7f`, and the note `#7 / #3 legs short teddy face`. This supports structured recovery of #3 on legs and a short teddy face, while #7/#7f remains source-preserved because no body area is stated. Customised-service source pricing is excluded.

Bob’s individual record at `https://go.moego.pet/client/21102214/pets/28404383?%7Ec=123757&%7Eb=124316` confirms `✂5f`, `round teddy face`, and `Size: Small`. The round teddy face is an explicit preference, while 5f remains source-preserved without a stated body area. No medical issue, behaviour alert, incident or customised service is present; a report card dated **4 February 2026** exists.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Margaret | `#3`; `#7f`; `#7 / #3 legs short teddy face`. | Imported. #3 legs and short teddy face are structured preferences; #7/#7f remains unassigned to a body area. Source pricing excluded. |
| Bob | `✂5f`; `round teddy face`; `Size: Small`. | Imported. Round teddy face is structured; 5f remains unassigned to a body area. |
| Matilda | Deactivated. | Excluded from this active-pet recovery batch. |

## Recovery queue update

The first ranked client-list page was revisited on 20 August 2026 after completing the currently documented high-priority families. Its visible records have been reviewed or are already documented in this audit. The authorised recovery will now advance to the next ranked page and continue only with active pets whose individual MoeGo source fields can be verified.

## Manual import progress: Mellissa Luckman family

The authenticated MoeGo record at `https://go.moego.pet/client/21099490/overview?%7Ec=123757&%7Eb=124316` has active **Neymar** (Pug), **Junior** (Cavoodle) and **Alex** (Chihuahua, long coat). The overview shows Neymar with `#7F Rev`, Junior with `#13mm`, `✂5f` and `Style C`, and Alex with `#7f`. Every pet has one note and an expired vaccine, with the vaccine data outside this grooming-style recovery scope. Individual records, notes, alerts and report cards must be checked before source labels are interpreted or imported.

Neymar’s individual record at `https://go.moego.pet/client/21099490/pets/28410960?%7Ec=123757&%7Eb=124316` confirms `#7F Rev`, `Size: Small`, no medical issue, behaviour alert, incident or customised service, and a report card dated **11 September 2025**. It was imported as source-preserved code text with no unsupported technical mapping.

Junior’s individual record at `https://go.moego.pet/client/21099490/pets/28408185?%7Ec=123757&%7Eb=124316` confirms `#13mm`, `✂5f`, `Style C`, and the explicit note `#5/ 13mm legs`, repeated in the pet-code field. This supports structured recovery of #5 with 13 mm legs. `✂5f` and `Style C` remain source-preserved review labels; the expired vaccination is excluded.

Alex’s individual record at `https://go.moego.pet/client/21099490/pets/28402924?%7Ec=123757&%7Eb=124316` confirms `#7f`, `Size: Toy`, no medical issue, behaviour alert, incident or customised service, and a report card dated **11 September 2025**. It was imported as source-preserved code text with no unsupported technical mapping.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Neymar | `#7F Rev`; `Size: Small`; report dated 11 Sep 2025. | Imported as source-preserved code text; no technical mapping was inferred. |
| Junior | `#13mm`; `✂5f`; `Style C`; `#5/ 13mm legs`. | Imported. #5 with 13 mm legs is structured; `✂5f` and `Style C` remain review labels. |
| Alex | `#7f`; `Size: Toy`; report dated 11 Sep 2025. | Imported as source-preserved code text; no technical mapping was inferred. |

## Manual import progress: Scott Barker family

The authenticated MoeGo record at `https://go.moego.pet/client/21094567/overview?%7Ec=123757&%7Eb=124316` has active **Effie** (medium Labradoodle, 13 kg) and **Dusty** (Labradoodle, 20 kg). Both show `Style C`, and both have expired vaccine entries that are outside the grooming-style recovery scope. Effie has two pet notes; Dusty has one. Individual pet records, notes, alerts and report cards must be checked before the Style C label is interpreted or imported.

Effie’s individual record at `https://go.moego.pet/client/21094567/pets/28406432?%7Ec=123757&%7Eb=124316` confirms `Style C`, `16mm`, and the pet note `19mm`, with `Size: Medium`. Both length values lack stated body areas and recency, so they were retained as concurrent source values rather than choosing one. The report-card and customised-service price records are source context only; no pricing is imported.

Dusty’s individual record at `https://go.moego.pet/client/21094567/pets/28406367?%7Ec=123757&%7Eb=124316` confirms `Style C`, `13mm/ 16mm legs`, and the pet note `16mm`. This supports the explicit 13 mm with 16 mm legs instruction. The 16 mm note is retained as source context; no medical issue, behaviour alert, incident or customised service is present. The two report cards and expired vaccination are outside the technical style mapping unless they contain more specific detail.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Effie | `Style C`; `16mm`; note `19mm`; `Size: Medium`; 29 Aug 2025 report; customised Diamond-Gold and Styled Groom Extra services. | Imported as source-preserved context. 16 mm and 19 mm remain concurrent unassigned values; no source price was imported. |
| Dusty | `Style C`; `13mm/ 16mm legs`; note `16mm`; reports dated 23 Sep and 29 Aug 2025. | Imported. 13 mm with 16 mm legs is a structured preference; standalone 16 mm and Style C remain source context. |

## Manual import progress: Vorn Reddell family

The authenticated MoeGo record at `https://go.moego.pet/client/21101439/overview?%7Ec=123757&%7Eb=124316` has active Cavoodles **Ralph**, **Lola** and **Charlie**. Ralph and Lola show `Megs do` with `#3`; Charlie shows `Char Do` with `#3`. Each has no pet note and an expired vaccine, which is outside the grooming-style recovery scope. The shorthand labels will be retained as groomer-preference source text unless detailed pet records provide a supported technical mapping.

Ralph’s detailed record at `https://go.moego.pet/client/21101439/pets/28412090?%7Ec=123757&%7Eb=124316` confirms `Megs do` and `#3`, no pet note, medical issue, behaviour alert, incident or customised service, and a report dated **2 September 2025**. A source-preserved Groomigo note was created without assigning #3 to a body area.

Lola’s detailed record at `https://go.moego.pet/client/21101439/pets/28408872?%7Ec=123757&%7Eb=124316` has no Pet Code despite the overview showing `Megs do` and `#3`. It has no pet note, report card, medical issue, behaviour alert, incident or customised service. The detailed record governs, so this is a verified no-data result; the overview/detail discrepancy remains for administrator review and no speculative Groomigo note is created.

Charlie’s detailed record at `https://go.moego.pet/client/21101439/pets/28405217?%7Ec=123757&%7Eb=124316` confirms `Char Do` and `#3`, no pet note, report card, medical issue, behaviour alert, incident or customised service. A source-preserved Groomigo note was created without assigning #3 to a body area.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ralph | `Megs do`; `#3`; report dated 2 Sep 2025. | Imported as source-preserved groomer-preference text; #3 remains unassigned. |
| Lola | Overview `Megs do` and `#3`, but no code on the detailed record. | Verified no-data result. Detailed record governs; no speculative import was created. |
| Charlie | `Char Do`; `#3`; no other source data. | Imported as source-preserved groomer-preference text; #3 remains unassigned. |

## Manual import progress: Annabel Prefontaine family

The authenticated MoeGo record at `https://go.moego.pet/client/21101279/overview?%7Ec=123757&%7Eb=124316` has active **Luna** (Labradoodle, 28 kg) and **Ellie** (Cavoodle, 11 kg). Both show `✂4f`, have one pet note and an expired vaccine entry. The vaccines and appointment service labels are outside this recovery scope; individual pet records, notes, alerts and report cards must be checked before any clip interpretation is imported.

Luna’s individual record at `https://go.moego.pet/client/21101279/pets/28409299?%7Ec=123757&%7Eb=124316` confirms `✂4f` and the non-technical note `10 years old`. No medical issue, behaviour alert or incident is present; a report card dated **15 August 2025** and a customised service with source pricing exist. The 4f code remains source-preserved because no body area is stated; the source price is excluded.

Ellie’s individual record at `https://go.moego.pet/client/21101279/pets/28406510?%7Ec=123757&%7Eb=124316` confirms `✂4f` and the non-technical note `puppy`. No report card, medical issue, behaviour alert, incident or customised service is present. The 4f code remains source-preserved because no body area is stated.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Luna | `✂4f`; `10 years old`; report dated 15 Aug 2025; customised service exists. | Imported as source-preserved code text. The 4f code remains unassigned and source pricing was excluded. |
| Ellie | `✂4f`; `puppy`; no report card, medical issue, behaviour alert, incident or customised service. | Imported as source-preserved code text. The 4f code remains unassigned. |

## Recovery queue exception: Skye Reilly

The authenticated MoeGo client search on **20 August 2026** returned no matching record for `Skye Reilly`. No guess, partial-name substitution or Groomigo change was made. The name remains an unavailable lookup for administrator review while the manual recovery queue advances to the next verified candidate.

## Recovery queue transition

The initial ranked MoeGo client-list group has been reviewed through the currently visible high-appointment families, with verified imports, no-data findings and unavailable lookups documented above. The manual recovery process is advancing to the next ranked page; only active pets with verified detail records will be imported.

The refreshed first-ranked MoeGo client list remains fully covered by the recovery entries above through Dee Curtis. The manual queue will now advance to the subsequent ranked page to select the next unreviewed active family; no action is taken from list-level information alone.

## Manual import progress: Annie and Geoff Gerard family

The authenticated MoeGo record at `https://go.moego.pet/client/21097331/overview?%7Ec=123757&%7Eb=124316` shows four active pets: **Penny** (Cavachon, 7 kg), **Shirley** (Cavoodle), **Penelope Pender** (Malt X) and **Agnes** (Cavoodle). Penny, Shirley and Agnes visibly carry `✂5f` labels; Penelope Pender has no visible code. All four show no notes in the overview. Each detailed record must be reviewed for pet-code source text, notes, alerts and report-card context before any Groomigo import.

Penny’s detailed record at `https://go.moego.pet/client/21097331/pets/29769002?%7Ec=123757&%7Eb=124316` confirms `✂5f`, no pet note, medical issue, behaviour alert, incident or customised service, and a report dated **6 January 2026**. The 5f code will be source-preserved because no body area or technical mapping is stated.

Shirley’s detailed record at `https://go.moego.pet/client/21097331/pets/28413282?%7Ec=123757&%7Eb=124316` confirms `✂5f` and the explicit `#5 Short teddy face` code. This supports structured recovery of a short teddy face preference; 5f remains source-preserved because no body area is stated. There is no pet note, medical issue, behaviour alert, incident or customised service; a report dated **12 September 2025** exists.

Penelope Pender’s detailed record at `https://go.moego.pet/client/21097331/pets/28411512?%7Ec=123757&%7Eb=124316` has no Pet Code, pet note, report card, medical issue, behaviour alert, incident or customised service. This is a verified no-data result; no speculative Groomigo note will be created.

Agnes’s detailed record at `https://go.moego.pet/client/21097331/pets/28403068?%7Ec=123757&%7Eb=124316` confirms `✂5f`, `#5 teddy face` and the explicit pet note `13mm head`. This supports structured recovery of a teddy face and 13 mm head preference. The 5f code remains source-preserved because no body area is stated. There is no medical issue, behaviour alert, incident or customised service; reports dated **5 December** and **12 September 2025** are available.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Penny | `✂5f`; report dated 6 Jan 2026; no other grooming, alert or note data. | Imported as source-preserved code text. The 5f code remains unassigned. |
| Shirley | `✂5f`; `#5 Short teddy face`; report dated 12 Sep 2025. | Imported. Short teddy face is structured; the 5f code remains unassigned. |
| Penelope Pender | No code, note, report, medical issue, behaviour alert, incident or customised service. | Verified no-data result; no speculative Groomigo note was created. |
| Agnes | `✂5f`; `#5 teddy face`; `13mm head`; reports dated 5 Dec and 12 Sep 2025. | Imported. Teddy face and 13 mm head are structured preferences; the 5f code remains unassigned. |
| Daisy and Rosie | Passed away/deactivated. | Excluded from this active-pet recovery batch. |

## Manual import progress: Sonia Condon family

The authenticated MoeGo record at `https://go.moego.pet/client/21095856/overview?%7Ec=123757&%7Eb=124316` has two active pets: **Harvey** (Labradoodle, 22 kg) and **Ella** (Mini Labradoodle, 17 kg). Both visibly carry `✂5f` labels. Harvey has one pet note and both pets have an expired vaccine; expired-vaccination information is outside the grooming-style recovery scope. Deactivated George and Molly are excluded. Individual pet records, notes, alerts and report cards must be verified before importing Groomigo details.

Harvey’s detailed record at `https://go.moego.pet/client/21095856/pets/28407357?%7Ec=123757&%7Eb=124316` confirms `✂5f` and the explicit pet note `LEAVE LASHES`. There is no medical issue, behaviour alert, incident or customised service; a report dated **29 October 2025** exists. Leave lashes is an explicit grooming preference; the 5f code remains source-preserved because no body area is stated. The expired customer-form vaccination is excluded from this recovery scope.

Ella’s detailed record at `https://go.moego.pet/client/21095856/pets/28406452?%7Ec=123757&%7Eb=124316` confirms `✂5f`, no pet note, report card, medical issue, behaviour alert, incident or customised service. The 5f code will be source-preserved because no body area or technical mapping is stated. The expired customer-form vaccination is excluded from this recovery scope.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Harvey | `✂5f`; `LEAVE LASHES`; report dated 29 Oct 2025. | Imported. Leave lashes is structured as a preference; 5f remains unassigned. |
| Ella | `✂5f`; no pet note, report, alert or other grooming source data. | Imported as source-preserved code text; 5f remains unassigned. |
| George and Molly | Passed away/deactivated. | Excluded from this active-pet recovery batch. |

## Manual import progress: Greg Blackaby family

The authenticated MoeGo record at `https://go.moego.pet/client/21094869/overview?%7Ec=123757&%7Eb=124316` has two active pets: **Ruby** (Spoodle, 13.5 kg) and **Charlie** (Cavoodle, 14.5 kg). Both visibly carry `#7f` and `Megs do` labels and have no notes in the overview. The `Megs do` label is treated as groomer-preference source text, not as a technical grooming code. Individual pet records, alerts and report cards must be reviewed before any Groomigo import.

Ruby’s detailed record at `https://go.moego.pet/client/21094869/pets/28412579?%7Ec=123757&%7Eb=124316` confirms `#7f` and `Megs do`, with no pet note, report card, medical issue, behaviour alert, incident or customised service. Both labels will be source-preserved: 7f has no stated body area and `Megs do` is retained only as groomer-preference text. The expired customer-form vaccination is excluded from this recovery scope.

Charlie’s detailed record at `https://go.moego.pet/client/21094869/pets/28405064?%7Ec=123757&%7Eb=124316` confirms `#7f` and `Megs do`, with no pet note, report card, medical issue, behaviour alert or incident. A customised `Tidy - Medium size or long hair` service has a source price, which is excluded from pricing changes. Both labels will be source-preserved: 7f has no stated body area and `Megs do` is retained only as groomer-preference text. The expired customer-form vaccination is excluded from this recovery scope.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ruby | `#7f`; `Megs do`; no note, report, alert or technical grooming detail. | Imported as source-preserved code and groomer-preference text. 7f remains unassigned. |
| Charlie | `#7f`; `Megs do`; customised Tidy - Medium size or long hair service. | Imported as source-preserved code and groomer-preference text. 7f remains unassigned; source pricing excluded. |

## Manual import progress: Clare De Looze family

The authenticated MoeGo record at `https://go.moego.pet/client/21096304/overview?%7Ec=123757&%7Eb=124316` has one active Groodle, **Teddy** (31.4 kg). The overview shows `3W`, `Style C`, `#19mm` and `Char Do`, with no pet note. `Style C`, `Char Do` and `3W` are source labels requiring individual-record verification; `#19mm` is a length value but requires body-area verification. The expired vaccination is outside the grooming-style recovery scope.

Teddy’s detailed record at `https://go.moego.pet/client/21096304/pets/28413884?%7Ec=123757&%7Eb=124316` confirms `3W`, `Style C`, `#19mm` and `Char Do`, with no pet note, report card, medical issue, behaviour alert, incident or customised service. All four values will be source-preserved: 19 mm has no stated body area, while 3W, Style C and Char Do are retained as unclassified style or groomer-preference labels. No technical mapping will be inferred.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Teddy | `3W`; `Style C`; `#19mm`; `Char Do`; no note, report, alert or other technical grooming detail. | Imported as source-preserved labels. 19 mm remains unassigned to a body area; 3W, Style C and Char Do remain unclassified for review. |

## Manual import progress: Varinia Taylor family

The authenticated MoeGo record at `https://go.moego.pet/client/21102799/overview?%7Ec=123757&%7Eb=124316` has two active Schnauzers: **Torah** with `#15 Trad`, and **Louis** (10 kg) with `#10 Trad`. Each has two pet notes that require individual-record verification. Both have expired vaccinations, which are outside the grooming-style recovery scope. Source pricing, the client’s current overdue balance and appointment data are excluded from this recovery scope.

Torah’s detailed record at `https://go.moego.pet/client/21102799/pets/28414353?%7Ec=123757&%7Eb=124316` confirms `#15 Trad` with explicit note `19mm legs` and `Size: Medium`. This supports structured recovery of 19 mm legs. `#15 Trad` remains source-preserved because its body-area mapping is not stated. There are no medical issues, behaviour alerts, incidents or customised services. Report cards dated **24 February 2026** and **16 September 2025** are available; no source pricing is in scope.

Louis’s detailed record at `https://go.moego.pet/client/21102799/pets/28409031?%7Ec=123757&%7Eb=124316` confirms `#10 Trad` with explicit note `#10 Trad/ 19mm legs` and `Size: Medium`. This supports structured recovery of 19 mm legs. `#10 Trad` remains source-preserved because its body-area mapping is not stated. There are no medical issues, behaviour alerts or incidents; the customised Bath - small source price is excluded from this recovery scope.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Torah | `#15 Trad`; `19mm legs`; `Size: Medium`; report cards dated 24 Feb 2026 and 16 Sep 2025. | Imported. 19 mm legs is structured; #15 Trad remains source-preserved and unmapped. |
| Louis | `#10 Trad`; `#10 Trad/ 19mm legs`; `Size: Medium`; customised Bath - small source price. | Imported. 19 mm legs is structured; #10 Trad remains source-preserved and unmapped. Source price excluded. |

## Recovery queue update

The current highest-ranked MoeGo client-list group has now been reviewed or documented in this audit, including Varinia Taylor. Recovery will advance to the next ranked page and continue only with active pets whose individual source fields can be verified.

A refreshed first-ranked list check again confirmed that the visible clients from Desiree Mcconnon through Thao Ashford are already covered by completed recovery batches. The next authorised manual review will therefore proceed from the subsequent ranked group rather than revisiting those families.

The subsequent ranked page, spanning Phillipa Perlin through Annie McLeod, was also rechecked and each visible family is already covered by a completed recovery batch. The authorised review sequence will move to the following ranked page for the next unreviewed candidate.

The following second-ranked client group was also reviewed on 20 August 2026. Its visible families are all already documented in this audit, including Phillipa Perlin, Emily Raphael, Carly Herbert, Julie Noy, Emma Cecchin, Tricia Taylor, Rachel Schofield, Nicki Waldon, Josh Morgan, Louise Sillar, Annie and Geoff Gerard, Vorn Reddell, Annabel Prefontaine, Mellissa Luckman, Delia Spri, Andrea Tomlin, Scott Barker, Sonia Condon, Melinda Collinge and Annie McLeod. Recovery will therefore advance to the next ranked page.

## Manual import progress: Denise Egan family

The authenticated MoeGo record at `https://go.moego.pet/client/21096732/overview?%7Ec=123757&%7Eb=124316` has one active Labradoodle, **Teddy**. The overview shows `Char Do`, `4W`, `Dont shave groin / bum` and `Style C`, with explicit pet notes `#5/ 16mm legs` and `Don't shave bum too short`. The #5 and 16 mm legs instruction, plus the groin/bottom handling preference, are candidates for structured recovery; `Char Do`, `4W` and `Style C` remain source labels until the detailed pet record is verified. The expired vaccination is outside this recovery scope.

Teddy’s detailed record at `https://go.moego.pet/client/21096732/pets/28413887?%7Ec=123757&%7Eb=124316` confirms `Char Do`, `4W`, `Dont shave groin / bum too short`, `Style C` and `#5 / 16MM legs donut muzzle`. The pet note repeats `#5/ 16mm legs` and `Don't shave bum too short`. This supports structured recovery of #5 with 16 mm legs, a donut muzzle and do-not-shave-groin/bottom-too-short preferences. `Char Do`, `4W` and `Style C` remain source-preserved review labels. The 21 August 2025 report card and customised source price are contextual only and excluded from technical mapping or pricing changes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Teddy | `Char Do`; `4W`; `Style C`; `#5 / 16MM legs donut muzzle`; `Don't shave groin / bum too short`. | Imported. #5, 16 mm legs, donut muzzle and the do-not-shave-groin/bottom-too-short preferences are structured. Char Do, 4W and Style C remain source-preserved review labels; source price excluded. |

## Manual import progress: Adam Lothian family

The authenticated MoeGo record at `https://go.moego.pet/client/21099448/overview?%7Ec=123757&%7Eb=124316` was reviewed across active Pomeranians **Rufus** and **Mahli**. Both expanded pet cards showed only the non-technical note `Size: Toy`, with an expired customer-form vaccination. Neither record displayed a pet code, grooming note, report-card history, medical issue, behaviour alert, incident or customised service for recovery. This is a verified no-data result: no speculative Groomigo grooming-style note or source-price change was made.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Rufus | `Size: Toy`; expired customer-form vaccination only. | Verified no-data result; no Groomigo import created. |
| Mahli | `Size: Toy`; expired customer-form vaccination only. | Verified no-data result; no Groomigo import created. |

## Manual import progress: Helene Llynn family

The authenticated MoeGo record at `https://go.moego.pet/client/21099399/overview?%7Ec=123757&%7Eb=124316` was reviewed across active Labradors **Ivy** and **Bailey**. Both expanded pet cards showed only the non-technical note `Size: Large`, alongside expired customer-form vaccinations. Neither record displayed a pet code, grooming note, report-card history, medical issue, behaviour alert, incident or customised service for recovery. Deactivated Shiloh was excluded. This is a verified no-data result: no speculative Groomigo grooming-style note or source-price change was made.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ivy | `Size: Large`; expired customer-form vaccination only. | Verified no-data result; no Groomigo import created. |
| Bailey | `Size: Large`; expired customer-form vaccination only. | Verified no-data result; no Groomigo import created. |
| Shiloh | Deactivated. | Excluded from this active-pet recovery batch. |

## Lookup exception: Lynnette Hall

The authenticated MoeGo client search for `Lynnette Hall` returned **no matching active client record**. No Groomigo lookup, import or update was attempted. The recovery queue will continue with the next verified client candidate.

## Lookup exception: Jasmine Wagner

The authenticated MoeGo client search for `Jasmine Wagner` returned **no matching active client record**. No Groomigo lookup, import or update was attempted. The recovery queue will continue with the next verified client candidate.

## Lookup exception: Beth Macdonald

The authenticated MoeGo client search for `Beth Macdonald` returned **no matching active client record**. No Groomigo lookup, import or update was attempted. The recovery queue will continue with the next verified client candidate.

## Lookup exception: Georgia Jefferies

The authenticated MoeGo client search for `Georgia Jefferies` returned **no matching active client record**. No Groomigo lookup, import or update was attempted. The recovery queue will continue with the next verified client candidate.

## Manual import progress: Mary Smithson family

The authenticated MoeGo record at `https://go.moego.pet/client/21102390/overview?%7Ec=123757&%7Eb=124316` was reviewed across active **Murphy** (Spoodle, 15 kg) and **Eddie** (Cavoodle, 11 kg). Both detailed pet panels confirm the source labels `Ally do` and `✂4f`, with no pet notes, report-card detail, medical issue or behavioural alert. `Ally do` is treated as a groomer-preference label; 4f is retained as source text without a body-area mapping. Neither label was inferred into a technical clip field.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Murphy | `Ally do`; `✂4f`; no pet notes, report-card detail, medical issue or behavioural alert. | Imported as source-preserved label text. No technical mapping was inferred. |
| Eddie | `Ally do`; `✂4f`; no pet notes, report-card detail, medical issue or behavioural alert. | Imported as source-preserved label text. No technical mapping was inferred. |

## Manual import progress: Brook Davidson family

The authenticated MoeGo record at `https://go.moego.pet/client/21096201/overview?%7Ec=123757&%7Eb=124316` has active Cavoodles **Pepsi**, **Ginger** and **Coco**. Individual source records are being reviewed before any Groomigo import. Coco’s detailed record at `https://go.moego.pet/client/21096201/pets/28405663?%7Ec=123757&%7Eb=124316` confirms `✂5f`, `Summer` and `#3`, with no pet note, medical issue, incident or customised service. A report card dated **11 September 2025** is available. These labels will remain source-preserved unless a body-area mapping or explicit preference is independently verified.

Ginger’s detailed record at `https://go.moego.pet/client/21096201/pets/28407000?%7Ec=123757&%7Eb=124316` confirms `#7f`, `summer` and `✂5f`, with no pet note, report-card history, medical issue, incident or customised service. All three labels remain source-preserved because no body area or technical mapping is stated.

Pepsi’s detailed record at `https://go.moego.pet/client/21096201/pets/28411650?%7Ec=123757&%7Eb=124316` confirms `#7f`, `13mm head Summer`, `✂5f` and `#13mm head`. The explicit pet note `#7 #4 face, ears and tail` supports structured source recovery of a #4 face, ears and tail instruction plus a 13 mm head preference. `#7/#7f`, `✂5f` and `Summer` remain source-preserved unless their precise body mappings are stated. `Having surgery` is retained as current operational context rather than a grooming-style mapping; no medical diagnosis is inferred.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Coco | `✂5f`; `Summer`; `#3`; 11 Sep 2025 report. | Imported as source-preserved code and label text. No technical mapping was inferred. |
| Ginger | `#7f`; `summer`; `✂5f`; no note, report, medical issue, incident or customised service. | Imported as source-preserved code and label text. No technical mapping was inferred. |
| Pepsi | `#7f`; `13mm head Summer`; `✂5f`; `#13mm head`; explicit note `#7 #4 face, ears and tail`; `Having surgery`. | Imported. #4 face, ears and tail plus 13 mm head are structured preferences. #7/#7f, ✂5f and Summer remain source-preserved and unmapped; surgery text remains operational context only. |

## Lookup exception: Leighton Johansen

The authenticated MoeGo client search for `Leighton Johansen` returned **no matching active client record**. No Groomigo lookup, import or update was attempted. The recovery queue will continue with the next verified client candidate.

## Lookup exception: Robert Mitchell

The authenticated MoeGo client search for `Robert Mitchell` returned **no matching active client record**. No Groomigo lookup, import or update was attempted. The recovery queue will continue with the next verified client candidate.

## Recovery queue transition: first ranked page rechecked

The visible first ranked MoeGo client page was rechecked after the Brook Davidson batch. Its displayed high-appointment families, from Desiree Mcconnon through Thao Ashford, are already documented in this audit. The authorised recovery will therefore continue on subsequent ranked pages rather than duplicating existing imports.

## Manual import progress: Linda Alston family

The authenticated MoeGo record at `https://go.moego.pet/client/21094282/overview?%7Ec=123757&%7Eb=124316` has active Spoodles **Lulu** and **Gracie**, each shown with `✂4f` and `✂5f` and no overview-level pet notes. Lulu’s expanded record confirms no vaccination, pet note, displayed medical issue or behavioural alert. Both codes remain source-preserved because no body area or explicit technical mapping is stated. Gracie’s individual record and report-card context will be reviewed before any Groomigo import. Source appointment and membership prices remain out of scope.

Gracie’s expanded record likewise confirms `✂4f` and `✂5f`, with no vaccination, pet note, displayed medical issue or behavioural alert. Both pets were therefore safely imported as source-preserved code records without a technical mapping.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Lulu | `✂4f`; `✂5f`; no vaccination, pet note, displayed medical issue or behavioural alert. | Imported as source-preserved code text; no technical mapping inferred. |
| Gracie | `✂4f`; `✂5f`; no vaccination, pet note, displayed medical issue or behavioural alert. | Imported as source-preserved code text; no technical mapping inferred. |

## Manual import progress: Selina Robson family

The authenticated MoeGo record at `https://go.moego.pet/client/21101695/overview?%7Ec=123757&%7Eb=124316` has active **Rocky** (Shih Tzu) and **Archie** (Malt X). Rocky’s expanded record confirms `✂4f`, `Megs do` and `#3`, along with two duplicate non-technical `Size: Toy` notes and an expired customer-form vaccination. `Megs do` is retained as groomer-preference text; #3 and 4f remain source-preserved and unmapped because no body area or explicit clip instruction is stated. Archie’s individual record and report-card context will be reviewed before import.

Archie’s expanded record confirms `#3`, `#13mm`, `Char Do`, `#16mm`, a `13mm` pet note, `Size: Small`, and an expired customer-form vaccination. The 13 mm value has no body area in the verified record, so it remains source-preserved alongside the other labels rather than being mapped speculatively.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Rocky | `✂4f`; `Megs do`; `#3`; duplicate `Size: Toy` notes. | Imported as source-preserved code and groomer-preference text. No technical mapping inferred. |
| Archie | `#3`; `#13mm`; `Char Do`; `#16mm`; note `13mm`; `Size: Small`. | Imported as source-preserved label text. No body-area mapping inferred for 13 mm or the other labels. |

## Manual import progress: Kahni McGill family

The authenticated MoeGo record at `https://go.moego.pet/client/21099997/overview?%7Ec=123757&%7Eb=124316` has active **Leo** (Cavoodle) and **Astrid** (Miniature Schnauzer). Leo’s expanded record confirms `✂5f`, no pet notes, and an expired customer-form vaccination. Astrid’s expanded record confirms `#15 Trad`, `No cologne`, an expired customer-form vaccination, and the non-technical note `Size: Small`. `No cologne` is an explicit product-use preference; the 5f and #15 Trad values remain source-preserved because no body area is stated. Deactivated Greta is excluded from this active-pet recovery batch.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Leo | `✂5f`; no pet notes. | Imported as source-preserved code text; no body-area mapping inferred. |
| Astrid | `#15 Trad`; `No cologne`; note `Size: Small`. | Imported. No cologne is structured as a product-use preference; #15 Trad remains source-preserved and unmapped. |
| Greta | Deactivated. | Excluded from this active-pet recovery batch. |

## Ranked recovery queue transition

The authenticated MoeGo client-list **second ranked page** was rechecked on 21 August 2026. Its visible high-appointment clients — Phillipa Perlin, Emily Raphael, Carly Herbert, Julie Noy, Emma Cecchin, Tricia Taylor, Rachel Schofield, Vorn Reddell, Nicki Waldon, Josh Morgan, Louise Sillar, Annie and Geoff Gerard, Annabel Prefontaine, Mellissa Luckman, Delia Spri, Andrea Tomlin, Melinda Collinge, Scott Barker, Sonia Condon and Annie McLeod — are already represented in the recovery audit. The recovery queue may proceed to the next ranked page without duplicate manual imports.

## Manual import progress: Angela Pobje family

The authenticated MoeGo record at `https://go.moego.pet/client/21101215/overview?%7Ec=123757&%7Eb=124316` has active **Raya** (Golden Retriever), **Lexi** (Cavalier X) and **Lena** (Spoodle). Lexi’s expanded record confirms `#3`, `Char Do`, `SENSITIVE`, `No cologne`, `Size: Small` and an expired customer-form vaccination. `No cologne` is an explicit product-use preference. `SENSITIVE` is retained as source-preserved handling context pending administrator confirmation, rather than being escalated into a safety classification. #3 and Char Do remain source-preserved without technical mapping. Raya and Lena will be reviewed separately before import.

Raya’s detailed record at `https://go.moego.pet/client/21101215/pets/28412130?%7Ec=123757&%7Eb=124316` confirms no Pet Code, the non-technical note `Size: Medium`, no medical issue or incident, no customised service and a report card dated **5 September 2025**. This is a verified no-data grooming result; no speculative Groomigo note will be created for Raya.

Lena’s detailed record at `https://go.moego.pet/client/21101215/pets/28408521?%7Ec=123757&%7Eb=124316` confirms `Megs do` and `#3`, no pet notes, no report-card history, no customised service, no medical issue or incident. Both labels were imported as source-preserved text only; `Megs do` remains a groomer-preference label and #3 remains unmapped.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Lexi | `#3`; `Char Do`; `SENSITIVE`; `No cologne`; note `Size: Small`. | Imported. No cologne is structured as a product-use preference; SENSITIVE is source-preserved handling context pending review; #3 and Char Do remain unmapped. |
| Lena | `Megs do`; `#3`; no pet notes or report-card data. | Imported as source-preserved groomer-preference and code text; no technical mapping inferred. |
| Raya | No Pet Code; note `Size: Medium`; report dated 5 Sep 2025. | Verified no-data result; no speculative Groomigo note created. |

## Manual import progress: Lorraine Buchan family

The authenticated MoeGo record at `https://go.moego.pet/client/21204170/overview?%7Ec=123757&%7Eb=124316` has active Cockers **Rea** (14 kg) and **Jerry** (16 kg), both labelled `#7f`. Rea’s expanded record confirms the pet note `#7 trad/ 10mm legs`, `#5 front of legs, Round feet`, `Shave inside ears`, and `Leave topknot long`. These support structured recovery of 10 mm legs, #5 front of legs, round feet, shaved inside ears and a long topknot. #7 Trad / #7f remains source-preserved and unmapped because no body area is explicitly stated. Jerry must be reviewed independently before import.

Jerry’s expanded record confirms the pet note `#7 trad Round feet`. This supports a structured round-feet preference; `#7 Trad` and `#7f` remain source-preserved and unmapped because no body area is stated.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Rea | `#7f`; `#7 trad/ 10mm legs`; `#5 front of legs`; `Round feet`; `Shave inside ears`; `Leave topknot long`. | Imported. 10 mm legs, #5 front of legs, round feet, shaved inside ears and long topknot are structured preferences; #7 Trad/#7f remains unmapped. |
| Jerry | `#7f`; `#7 trad`; `Round feet`. | Imported. Round feet is structured; #7 Trad/#7f remains unmapped. |

## Manual import progress: Alana Murphy family

The authenticated MoeGo record at `https://go.moego.pet/client/21100505/overview?%7Ec=123757&%7Eb=124316` was reviewed across active **Dougal** (Cavoodle, 8 kg) and **Chase** (Husky). Dougal’s expanded record confirms `#13mm`, `#3` and `Char Do`, with no pet notes; these labels will be source-preserved because no body area or explicit technical mapping is stated. Chase has no pet code or grooming note. Expired customer-form vaccinations and upcoming-service pricing are excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Dougal | `#13mm`; `#3`; `Char Do`; no pet notes. | Imported as source-preserved label text; no technical or body-area mapping inferred. |
| Chase | No pet code or grooming note; expired customer-form vaccination only. | Verified no-data result; no speculative Groomigo note created. |

## Ranked recovery queue transition

The visible first ranked MoeGo client page was rechecked on 21 August 2026. Its high-appointment families are already represented in the recovery audit, including Desiree Mcconnon, Catherine Hindley, Chris Roulstone, Marcelle Arkadieff, Ray Phillips, Renee Gannon, Mike Graham, Greg Lisa, Marie Hodson, April Bradstreet, Janene Bosa, Geri Munnich, Toni Constantini, Allyson Warner, Kristy Hemmings, Elizabeth Bell, Debbi Peterson, Nicole Sofianos, Dee Curtis and Thao Ashford. The recovery queue is moving to the next ranked page to avoid duplicate imports.

On the next ranked page, Mary Smithson, Clare De Looze, Brook Davidson, Linda Alston, Selina Robson, Kahni McGill, Varinia Taylor, Adam Lothian, Angela Pobje, Denise Egan, Lorraine Buchan, Helene Llynn and Alana Murphy are already covered. The next unreviewed high-appointment candidates begin with **Bev Price**, **Georgie Makepeace**, **Lynnette Matuschka**, **Renee Johnston** and **Bev Somers**. Recovery will proceed with Bev Price.

## Manual import progress: Bev Price family — active-pet review in progress

The authenticated MoeGo record at `https://go.moego.pet/client/21101289/overview?%7Ec=123757&%7Eb=124316` has active Yowie, Queenie, Kora, Koby, Jimmy and Dudley, plus deactivated Millie. The overview shows Koby with `Megs do`, `#19mm` and `NO 10B GROIN/BUM`, and Dudley with `Megs do` and `✂4f`. These will be verified on individual pet cards before any Groomigo import. Deactivated Millie is outside the active-pet recovery scope.

Koby’s expanded record confirms `Megs do`, `#19mm`, `NO 10B GROIN/BUM`, and the non-technical note `Size: Toy`. The no-10B-groin/bottom instruction is an explicit preference; `Megs do` is preserved as groomer-preference text and 19 mm remains unmapped because no body area is stated. Dudley’s visible card confirms `Megs do` and `✂4f`, with no pet note; both require source-preserved treatment only.

Koby and Dudley were matched to the active Groomigo client record and imported in an idempotent, source-preserved batch. Koby’s do-not-use-10B-groin/bottom preference is retained explicitly; no technical mapping was inferred for Koby’s 19 mm or Dudley’s 4f. A direct Kora pet URL did not render its detail content in the authenticated session, but the overview-card expansion provided the required detailed record instead.

Yowie’s expanded card confirms only `Size: Small` and an expired customer-form vaccination, with no pet code. Queenie’s expanded card confirms no pet notes and an expired customer-form vaccination, with no pet code. Both are verified no-data grooming results and no Groomigo notes will be created for them.

Kora’s expanded card confirms only `Size: Medium` and no vaccination, with no pet code or grooming instruction. Kora is also a verified no-data grooming result; no Groomigo note will be created. Jimmy remains the only unreviewed active pet in this family.

Jimmy’s expanded card confirms no vaccination and no pet notes, with no pet code or grooming instruction. Jimmy is a verified no-data grooming result; no Groomigo note will be created. This completes the active-pet review for Bev Price.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Yowie | `Size: Small`; expired customer-form vaccination only. | Verified no-data result; no Groomigo note created. |
| Queenie | No pet notes; expired customer-form vaccination only. | Verified no-data result; no Groomigo note created. |
| Kora | `Size: Medium`; no vaccination; no other source data. | Verified no-data result; no Groomigo note created. |
| Jimmy | No vaccination or pet notes; no other source data. | Verified no-data result; no Groomigo note created. |

## Manual import progress: Georgie Makepeace family

The authenticated MoeGo record at `https://go.moego.pet/client/21099621/overview?%7Ec=123757&%7Eb=124316` was reviewed across active Border Collies **Toby** and **Josie**. Both expanded cards showed only the non-technical note `Size: Medium` alongside an expired customer-form vaccination. Neither record showed a pet code, grooming note, report-card detail, medical issue, behaviour alert, incident or customised service for recovery. Deactivated Nell, whose visible `OLD and SORE` label is historical context, was excluded. This is a verified no-data grooming result: no speculative Groomigo grooming-style note or price change was made.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Toby | `Size: Medium`; expired customer-form vaccination only. | Verified no-data result; no Groomigo import created. |
| Josie | `Size: Medium`; expired customer-form vaccination only. | Verified no-data result; no Groomigo import created. |
| Nell | Deactivated; `OLD and SORE`. | Excluded from this active-pet recovery batch. |

## Manual import progress: Lynnette Matuschka family

The authenticated MoeGo record at `https://go.moego.pet/client/21099821/overview?%7Ec=123757&%7Eb=124316` has active Malt X pets **Jackson** (14.2 kg) and **Elle-May** (9 kg). The overview displays Jackson with `#3`, `✂5f` and `SENSITIVE`; Elle-May with `PF`, `No cologne`, `#3`, `4W`, `✂5f` and `SENSITIVE`. These are source labels only until each expanded pet record confirms notes, context and any explicit grooming instructions. No interpretation or Groomigo import will occur from the overview alone.

Jackson’s expanded record confirms the non-technical note `Size: Small`, alongside `#3`, `✂5f` and `SENSITIVE`. Elle-May’s expanded record confirms the non-technical note `Size: Small`, alongside `PF`, `No cologne`, `#3`, `4W`, `✂5f` and `SENSITIVE`. No cologne is treated as an explicit product-use preference. `SENSITIVE` is retained as handling context for review rather than escalated as a safety alert; the other labels remain source-preserved without technical or body-area mapping.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Jackson | `#3`; `✂5f`; `SENSITIVE`; note `Size: Small`. | Imported as source-preserved label text. SENSITIVE is handling context only; no technical or body-area mapping inferred. |
| Elle-May | `PF`; `No cologne`; `#3`; `4W`; `✂5f`; `SENSITIVE`; note `Size: Small`. | Imported. No cologne is structured as a product-use preference; all other labels are source-preserved and unmapped. SENSITIVE remains handling context only. |

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Koby | `Megs do`; `#19mm`; `NO 10B GROIN/BUM`; `Size: Toy`. | Imported. Do not use 10B on groin/bottom is structured; Megs do remains groomer-preference text and 19 mm remains unmapped. |
| Dudley | `Megs do`; `✂4f`; no pet note. | Imported as source-preserved groomer-preference and code text; no technical mapping inferred. |
| Yowie, Queenie, Kora and Jimmy | Active; overview cards not yet individually verified. | Pending review; no Groomigo import created from overview data alone. |
| Millie | Deactivated. | Excluded from active-pet recovery. |

## Manual import progress: Renee Johnston family

The authenticated MoeGo record at `https://go.moego.pet/client/21098674/overview?%7Ec=123757&%7Eb=124316` was reviewed across active Shih Tzus **Indy** and **Daisy**. Indy’s expanded card confirms `✂5f` with no vaccination or pet notes. Daisy’s expanded card confirms `✂4f`, no vaccination and the non-technical note `Size: Toy`. Both codes remain source-preserved because no body area or explicit technical mapping is stated.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Indy | `✂5f`; no vaccination; no pet notes. | Imported as source-preserved code text; no technical or body-area mapping inferred. |
| Daisy | `✂4f`; no vaccination; note `Size: Toy`. | Imported as source-preserved code text; no technical or body-area mapping inferred. |

## Manual import progress: Bev Somers family

The authenticated MoeGo record at `https://go.moego.pet/client/21102420/overview?%7Ec=123757&%7Eb=124316` was reviewed across active **Ruby** (Miniature Poodle) and **Lola** (Poodle Medium). Ruby’s expanded record confirms `#3`, `FileNail` and `✂5f`, with no vaccination or pet note. Lola’s expanded record confirms `✂4f`, `#7f`, no vaccination, and the pet note `3F top knot`. All labels are source-preserved unless an instruction is explicitly stated; no technical or body-area mapping was inferred from the codes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ruby | `#3`; `FileNail`; `✂5f`; no vaccination or pet note. | Imported as source-preserved label text; no technical or body-area mapping inferred. |
| Lola | `✂4f`; `#7f`; note `3F top knot`; no vaccination. | Imported as source-preserved code text. Top-knot wording is retained as source context; all codes remain unmapped. |

### Ranked-list coverage refresh — 21 August 2026

The visible first ranked MoeGo client page was rechecked after clearing the client-list filter. Its twenty displayed high-appointment families are already represented in this audit, including Desiree Mcconnon through Thao Ashford. The next manual recovery selection will therefore continue from the subsequent ranked client page to avoid duplicate imports.

The visible second ranked MoeGo client page was also rechecked and is fully represented in the audit, from Phillipa Perlin through Annie McLeod. The next manual recovery selection will continue from the third ranked page to avoid duplicate imports.

## Manual import progress: Gary Hexter family

The authenticated MoeGo record at `https://go.moego.pet/client/21098082/overview?%7Ec=123757&%7Eb=124316` has active Shih Tzus **Theodore** (11 kg) and **Rosie**. Theodore’s expanded record confirms `✂5f`, `Megs do`, `✂4f`, plus the explicit pet note `#4 19mm head` and `#5 16mm head long ears and tail`. This supports structured recovery of 19 mm head, 16 mm head, long ears and tail. `Megs do`, 4f and 5f remain source-preserved labels unless a body area is stated. Rosie remains pending individual review.

Rosie’s expanded record confirms `✂5f`, `Char Do`, `✂4f`, plus the identical explicit pet note `#4 19mm head` and `#5 16mm head long ears and tail`. The verified Theodore and Rosie imports are present in Groomigo with 19 mm and 16 mm head values, long ears and long tail structured; groomer-preference and clip labels remain source-preserved and unmapped.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Theodore | `✂5f`; `Megs do`; `✂4f`; `#4 19mm head`; `#5 16mm head long ears and tail`. | Imported. 19 mm and 16 mm head, long ears and long tail are structured. Megs do, 4f and 5f remain source-preserved and unmapped. |
| Rosie | `✂5f`; `Char Do`; `✂4f`; `#4 19mm head`; `#5 16mm head long ears and tail`. | Imported. 19 mm and 16 mm head, long ears and long tail are structured. Char Do, 4f and 5f remain source-preserved and unmapped. |

## Ranked-list reconciliation — current first page

The authenticated ranked MoeGo client-list first page was rechecked after clearing a stale filter. It contains only previously reviewed priority clients through Thao Ashford, including Desiree Mcconnon, Catherine Hindley, Chris Roulstone, Marcelle Arkadieff, Ray Phillips, Renee Gannon, Mike Graham, Greg Lisa, Marie Hodson, April Bradstreet, Janene Bosa, Geri Munnich, Elizabeth Bell, Toni Constantini, Allyson Warner, Kristy Hemmings, Debbi Peterson, Nicole Sofianos, Dee Curtis and Thao Ashford. No new unreviewed family was selected from this page; recovery will continue from the next ranked page.

This first-page coverage was rechecked again during the current session and remained fully represented in the audit. No further source data was imported from the repeated page view.

## Ranked-list reconciliation — third page

The authenticated third ranked MoeGo client-list page was rechecked after Gary Hexter’s completed import. Its visible clients—from Mary Smithson through Gary Hexter—are already covered in this recovery audit, including Clare De Looze, Brook Davidson, Linda Alston, Selina Robson, Kahni McGill, Varinia Taylor, Adam Lothian, Angela Pobje, Denise Egan, Lorraine Buchan, Helene Llynn, Alana Murphy, Bev Price, Georgie Makepeace, Lynnette Matuschka, Renee Johnston, Bev Somers and Greg Blackaby. No new family was selected from this page; recovery will advance to the fourth ranked page.

## Manual import progress: Sam Costa family — individual review in progress

The authenticated MoeGo record at `https://go.moego.pet/client/21095961/overview?%7Ec=123757&%7Eb=124316` has active pets Lucy, Yuki, Shooka Navabi and Leo. Yuki’s expanded record confirms `#3` and the non-technical note `Size: Small`, with no vaccination. The code has no stated body area or technical mapping and must remain source-preserved if imported. Lucy’s expanded record confirms no pet code, no vaccination and no pet notes. Shooka Navabi’s expanded record confirms no pet code, no vaccination and no pet notes. Leo’s expanded record confirms no pet code, no vaccination and no pet notes. All three are verified no-data grooming results. Yuki is the only active pet eligible for a source-preserved Groomigo note, subject to safe record matching.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Yuki | `#3`; note `Size: Small`; no vaccination. | Imported as a source-preserved Groomigo grooming-style record. #3 remains unmapped. |
| Lucy | No pet code, vaccination or pet notes. | Verified no-data result; no Groomigo note required. |
| Shooka Navabi | No pet code, vaccination or pet notes. | Verified no-data result; no Groomigo note required. |
| Leo | No pet code, vaccination or pet notes. | Verified no-data result; no Groomigo note required. |

## Manual import progress: Jana Finch family

The authenticated MoeGo record at `https://go.moego.pet/client/21096971/overview?%7Ec=123757&%7Eb=124316` was reviewed across active **Waffle** (Labradoodle, 24.8 kg) and **Maisy** (Groodle, 20 kg). Waffle’s detailed card confirms `Char Do`, `#13mm`, an expired customer-form vaccination and the non-technical note `Size: Medium`. Maisy’s detailed card confirms `Char Do`, `#13mm`, `Ner`, and an expired customer-form vaccination, with no pet note. No body area or explicit technical mapping is stated for 13 mm; `Char Do` is retained as groomer-preference text and `Ner` as unclassified source text. The expired vaccinations are outside grooming-style recovery scope.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Waffle | `Char Do`; `#13mm`; note `Size: Medium`; expired customer-form vaccination. | Imported as a source-preserved Groomigo grooming-style record; no technical or body-area mapping inferred. |
| Maisy | `Char Do`; `#13mm`; `Ner`; no pet note; expired customer-form vaccination. | Imported as a source-preserved Groomigo grooming-style record; no technical or body-area mapping inferred. |

## Manual import progress: Ellie Jones family

The authenticated MoeGo record at `https://go.moego.pet/client/21098702/overview?%7Ec=123757&%7Eb=124316` was reviewed for active Groodle **Cosmo**. The record confirms `Char Do` and `#16mm`, with no pet notes. `Char Do` is retained as unclassified groomer-preference text and 16 mm remains unassigned because no body area is stated. The expired customer-form vaccination is excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Cosmo | `Char Do`; `#16mm`; no pet notes; expired customer-form vaccination. | Imported as a source-preserved Groomigo grooming-style record. No technical or body-area mapping inferred. |

## Manual import progress: Amanda Mckenzie family

The authenticated MoeGo record at `https://go.moego.pet/client/21100071/overview?%7Ec=123757&%7Eb=124316` was reviewed across active Labradoodles **Tango** and **Oscar**. Tango confirms `WARTS/ MOLES` and `✂5f`, with no vaccination or pet notes. WARTS/ MOLES is retained as source-preserved skin/handling context for administrator review rather than treated as a diagnosis; 5f is unassigned because no body area is stated. Oscar confirms `✂5f`, with no vaccination or pet notes; it remains source-preserved and unmapped.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Tango | `WARTS/ MOLES`; `✂5f`; no vaccination or pet notes. | Imported as a source-preserved Groomigo grooming-style record. WARTS/ MOLES remains review context; 5f remains unmapped. |
| Oscar | `✂5f`; no vaccination or pet notes. | Imported as a source-preserved Groomigo grooming-style record; 5f remains unmapped. |

## Session status: 23 August 2026

The authorised MoeGo session was restored after the user signed in again. The **Clients & Pets** list now renders its ranked first page normally. That page contains only previously audited priority families through Thao Ashford, so no new import was made from the restored list. The recovery queue remains ready to continue from the fourth ranked page, beginning with the next unreviewed visible client.

## Ranked-list reconciliation — fourth page

The authenticated fourth ranked MoeGo client-list page is now visible. Gary Hexter, Sam Costa, Jana Finch and Amanda Mckenzie are already represented in this audit. The next unreviewed visible recovery candidates are **Kylie Burger** (Koda and Marlowe), **Kerri Torry** (Louie), **Barbara Bou-Samra** (CoCo and Winston), **Jodie Brown** (Abby and Ollie), **Kara Hunter** (Ziggy), **Naomi Brookfield** (Bella, Rosie and an additional pet), **Chistel Kotnee** (Chico, Coco and an additional pet), **Jackie Hartney**, **Christina Nogaski**, **Casey Lindsay**, **Tran Nguyen**, **Carole Adams**, **Cliff Stockley**, **Deborah Logan**, **Meabh O'Carroll** and **Tracey Albury**. No source code, grooming note or payment detail was imported from the ranked-list view itself.

## Manual import progress: Kylie Burger family

The authenticated MoeGo record at `https://go.moego.pet/client/21095281/overview?%7Ec=123757&%7Eb=124316` has active **Marlowe** (Groodle) and **Koda** (Labradoodle). Marlowe’s expanded card confirms `✂4f`, `Megs do`, `Style C`, the explicit pet note `#4/ 16mm legs`, and an expired customer-form vaccination. This supports structured recovery of #4 with 16 mm legs. `Megs do` and `Style C` remain source-preserved groomer-preference or unclassified labels; 4f remains unmapped where no body area is stated. Koda was subsequently individually verified before import.

Koda’s expanded card confirms `✂4f`, `Char Do`, `Style C`, the explicit pet note `#4/ 16mm legs`, and an expired customer-form vaccination. This supports the same structured #4 with 16 mm legs instruction. `Char Do` and `Style C` remain source-preserved groomer-preference or unclassified labels; 4f remains unmapped where no body area is stated.

Both verified Groomigo records are present: Marlowe and Koda each retain #4 with 16 mm legs in structured fields, with the original MoeGo labels preserved verbatim in the recovery note.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Marlowe | `✂4f`; `Megs do`; `Style C`; `#4/ 16mm legs`. | Imported. #4 and 16 mm legs are structured; Megs do, Style C and 4f remain source-preserved/unmapped as appropriate. |
| Koda | `✂4f`; `Char Do`; `Style C`; `#4/ 16mm legs`. | Imported. #4 and 16 mm legs are structured; Char Do, Style C and 4f remain source-preserved/unmapped as appropriate. |

## Manual import progress: Kerri Torry family

The authenticated MoeGo record at `https://go.moego.pet/client/21102997/overview?%7Ec=123757&%7Eb=124316` has active **Louie** (Cavoodle, 10 kg) and deactivated **Muffin** (Moodle). Muffin is excluded. Louie’s expanded active pet card confirms the pet-code label `#16mm` and the pet note exactly as displayed:

> Alt:\n> Full Groom\n> BB\n> FFT\n> BB

The source does not state a body area for `#16mm`, and `Alt`, `BB` and `FFT` are ambiguous abbreviations. No technical or body-area interpretation is supported; retain all text verbatim in a source-preserved recovery note only. The expired customer-form vaccination is excluded from grooming-style recovery.

The exact Groomigo match was verified as client ID 73, pet ID 163. A single idempotent Groomigo recovery note was inserted and post-insert verification confirmed one intact 241-character source-preserved record with no blade, comb or body-length mapping.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Louie | `#16mm`; note `Alt:` / `Full Groom` / `BB` / `FFT` / `BB`. | Imported as a source-preserved Groomigo grooming-style note only. No technical or body-area mapping was inferred. |

Deactivated **Muffin** was excluded from this active-pet recovery batch.

## Manual import progress: Barbara Bou-Samra family

The authenticated MoeGo record at `https://go.moego.pet/client/21095007/overview?%7Ec=123757&%7Eb=124316` has active **Winston** (pom x) and **CoCo** (Maltese). Winston’s expanded card confirms source labels `Megs do` and `10`, plus the pet note `#10 #5 head` and `Kissy lips Long ears`. The explicit `#5 head` and `Long ears` directions can be structured. `#10` has no stated body area, and `Megs do`, `10` and `Kissy lips` remain source-preserved/unmapped. The expired customer-form vaccination is excluded.

CoCo’s individually expanded active pet card confirms identical labels `Megs do` and `10`, plus the identical pet note `#10 #5 head` and `Kissy lips Long ears`. The same conservative mapping and source-preservation treatment applies.

The exact Groomigo match was verified as client ID 70, with CoCo pet ID 157 and Winston pet ID 158. Each received one idempotent 271-character MoeGo recovery note. Post-insert verification confirmed `#5 head` and `Long ears` in structured fields, with no blade-size or comb-size mapping for the unplaced `#10` source text.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Winston | `Megs do`; `10`; `#10 #5 head`; `Kissy lips Long ears`. | Imported. #5 head and Long ears are structured; Megs do, 10, #10 and Kissy lips remain source-preserved/unmapped. |
| CoCo | `Megs do`; `10`; `#10 #5 head`; `Kissy lips Long ears`. | Imported. #5 head and Long ears are structured; Megs do, 10, #10 and Kissy lips remain source-preserved/unmapped. |

## Manual import progress: Jodie Brown family

The authenticated MoeGo record at `https://go.moego.pet/client/21095192/overview?%7Ec=123757&%7Eb=124316` has active **Ollie** (mini Labradoodle, 15 kg) and **Abby** (Toy Poodle, 3 kg). Ollie’s expanded active card confirms the pet code `#3`, plus pet notes `#3/ 10mm` and `Size: Small`. The #3 and 10 mm values do not state a body area; retain them as source-preserved text without technical mapping. The non-technical size note and expired customer-form vaccination are excluded.

Abby’s individually expanded active card confirms the source labels `Char Do` and `Style C`, plus the explicit pet note `#4/ 16mm legs` and non-technical `Size: Toy` note. #4 and 16 mm legs may be structured. `Char Do` and `Style C` remain source-preserved/unclassified. The expired customer-form vaccination is excluded from grooming-style recovery.

The exact Groomigo match was verified as client ID 96, with Abby pet ID 201 and Ollie pet ID 202. Each received one idempotent MoeGo recovery note. Post-insert verification confirmed Abby’s #4 and 16 mm legs structured fields; Ollie’s #3 and 10 mm values remain deliberately unmapped because the source states no body area.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ollie | `#3`; note `#3/ 10mm`; note `Size: Small`. | Imported as a source-preserved Groomigo grooming-style note only. No technical or body-area mapping was inferred. |
| Abby | `Char Do`; `Style C`; note `#4/ 16mm legs`; note `Size: Toy`. | Imported. #4 and 16 mm legs are structured; Char Do and Style C remain source-preserved/unmapped. |

## Manual import progress: Kara Hunter family

The authenticated MoeGo record at `https://go.moego.pet/client/21098423/overview?%7Ec=123757&%7Eb=124316` has active **Ziggy** (Labradoodle, 32.2 kg). Ziggy’s expanded card confirms source labels `Lead On In Cage` and `Style C`, plus pet notes `LEAD ON IN CRATE` and `#4/ 16mm legs`. The explicit #4 with 16 mm legs instruction can be structured. `Lead On In Cage` and `LEAD ON IN CRATE` are retained as source-preserved handling context; `Style C` remains source-preserved/unclassified. The expired customer-form vaccination is excluded.

The exact Groomigo match was verified as client ID 63, pet ID 142. A single idempotent 313-character MoeGo recovery note was inserted. Post-insert verification confirmed #4 and 16 mm legs in structured fields; no comb value was inferred.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ziggy | `Lead On In Cage`; `Style C`; note `LEAD ON IN CRATE`; note `#4/ 16mm legs`. | Imported. #4 and 16 mm legs are structured; handling context and Style C remain source-preserved/unmapped. |

## Manual import progress: Naomi Brookfield family

The authenticated MoeGo record at `https://go.moego.pet/client/21095164/overview?%7Ec=123757&%7Eb=124316` has active **Twirly** and **Rosie** (each Malt X, 7 kg) plus **Bella** (Border Collie). Twirly’s expanded active card confirms `✂4f`, `Char Do` and the pet note `Size: Small`. Neither source label states a body area, so they remain source-preserved without technical mapping. The non-technical size note and expired customer-form vaccination are excluded.

Rosie’s individually expanded active card confirms the same source labels `✂4f` and `Char Do`, plus the same `Size: Small` note. These values require the same source-preservation treatment without technical mapping. Bella’s individually expanded active card has no pet code, grooming instruction, alert, report-card grooming data or pet note; the expired vaccination is excluded and no Groomigo note should be created for Bella.

The exact Groomigo match was verified as client ID 81: Twirly (pet ID 178), Rosie (pet ID 177) and Bella (pet ID 176). One idempotent 232-character source-preserved recovery note was verified for each of Twirly and Rosie, with all structured clip fields intentionally blank. Bella correctly has no recovery record.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Twirly | `✂4f`; `Char Do`; note `Size: Small`. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |
| Rosie | `✂4f`; `Char Do`; note `Size: Small`. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |
| Bella | No pet code, grooming instruction, alert, report-card grooming data or pet note. | Verified no-data result; no Groomigo recovery note created. |

## Manual import progress: Chistel Kotnee family

The authenticated MoeGo record at `https://go.moego.pet/client/21099041/overview?%7Ec=123757&%7Eb=124316` has active **Dasher** (Cavoodle), **Coco** (Malt X Shih, 9 kg) and **Chico** (Cavoodle). Dasher’s expanded active card confirms source labels `HIP DYSPLAYSIA`, `✂4f`, `#13mm` and `Ally do`, plus pet notes `Slightly longer leg` and `Size: Small`. `Slightly longer leg` is an explicit leg-style direction and the hip-dysplasia label is retained as source-preserved alert context. The 4f and #13mm labels have no stated body area; Ally do remains unclassified.

Coco’s individually expanded active card confirms `Ally do`, `#7f` and `Size: Small`. Chico’s individually expanded active card confirms `Ally do` and `✂5f`, with no pet note. The 7f and 5f labels have no stated body area, and Ally do remains unclassified; all are source-preserved without technical mapping. No vaccine information is present for any of the three active pets.

The exact Groomigo match was verified as client ID 64: Dasher (pet ID 145), Coco (pet ID 144) and Chico (pet ID 143). One idempotent recovery note was verified per pet. Dasher’s 309-character note retains the original source spelling `HIP DYSPLAYSIA` in the warning field and `Slightly longer leg` in the leg-style field; its other clip labels remain unmapped. Coco and Chico’s 234- and 222-character source-preserved notes have no structured blade, comb or leg mapping.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Dasher | `HIP DYSPLAYSIA`; `✂4f`; `#13mm`; `Ally do`; notes `Slightly longer leg`, `Size: Small`. | Imported. Explicit leg direction and source alert text are structured; clip labels and Ally do remain source-preserved/unmapped. |
| Coco | `Ally do`; `#7f`; note `Size: Small`. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |
| Chico | `Ally do`; `✂5f`; no pet note. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |

## Manual import progress: Jackie Hartney family

The authenticated MoeGo record at `https://go.moego.pet/client/21097886/overview?%7Ec=123757&%7Eb=124316` has active **Eddy** (Cavoodle, 11.5 kg) and **Albert** (Spoodle, 18.1 kg). Both collapsed active cards show `#7f`, `✂5f`, `WARTS/ MOLES` and `DOG AGGRESSIVE`. The source alerts are retained verbatim for review; neither clip label states a body area. Each pet card requires individual note review before any Groomigo import.

Eddy’s expanded active card confirms the same labels, plus pet note `smaller one`. The note is ambiguous and source-preserved only. The expired customer-form vaccination is excluded.

Albert’s individually expanded active card confirms the same labels, plus source pet notes `#7 13mm ears` / `#7 top of head too` and `bigger one`. The ears and top-of-head placement are explicit source instructions: retain `13mm ears` as ear style and `#7 top of head` as head style, preserving the exact original wording in the recovery note. `bigger one` remains ambiguous and source-preserved only. The collapsed 7f and 5f labels still have no stated body area. Albert’s expired customer-form vaccination is excluded.

The exact Groomigo match was verified as client ID 74: Albert (pet ID 164) and Eddy (pet ID 165). One idempotent recovery note was verified per pet. Both 297- and 368-character notes retain `WARTS/ MOLES; DOG AGGRESSIVE` as source alert text. Albert’s only structured fields are the explicit `#7 top of head` and `13mm ears` directions; no unsupported mapping was made for 7f, 5f or the ambiguous size notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Eddy | `#7f`; `✂5f`; `WARTS/ MOLES`; `DOG AGGRESSIVE`; note `smaller one`. | Imported. Source alerts are structured verbatim; all clip and size labels remain source-preserved/unmapped. |
| Albert | `#7f`; `✂5f`; `WARTS/ MOLES`; `DOG AGGRESSIVE`; notes `#7 13mm ears`, `#7 top of head too`, `bigger one`. | Imported. Explicit ear and head directions are structured; source alerts are retained verbatim; remaining labels remain source-preserved/unmapped. |

## Manual import progress: Christina Nogaski family

The authenticated MoeGo record at `https://go.moego.pet/client/21100712/overview?%7Ec=123757&%7Eb=124316` has active **Beau** (Standard Poodle, 31 kg). Beau’s expanded card confirms `#5 PFFT`, `#3` and `Megs do`, with pet notes `#5 PFFT #10 ears` / `Growing chest and pom poms` / `Fluffy tail`; `Mullet to a point` / `#10 ears and tail`; and `Size: Medium`. The duplicated `#10 ears` instruction is explicit and can be structured as an ear style. The source presents both `Fluffy tail` and an earlier `#10 ears and tail` instruction, so tail styling is preserved in full source text without selecting one as the current structured value. `#5 PFFT`, `#3`, `Megs do`, chest/pom-pom wording and mullet wording remain source-preserved because their technical meaning or body placement is not explicit. The expired customer-form vaccination is excluded.

The exact Groomigo match was verified as client ID 76, pet ID 168. One idempotent 422-character recovery note was verified. Only the repeated explicit `#10 ears` source instruction is structured. Blade, comb and tail fields remain unpopulated, so the conflicting dated tail instructions and all ambiguous labels are retained verbatim for administrator review.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Beau | `#5 PFFT`; `#3`; `Megs do`; notes `#5 PFFT #10 ears`, `Growing chest and pom poms`, `Fluffy tail`, `Mullet to a point`, `#10 ears and tail`, `Size: Medium`. | Imported. Only explicit `#10 ears` is structured; all other clip, tail and grooming-language source text remains preserved without unsupported mapping. |

## Manual import progress: Casey Lindsay family

The authenticated MoeGo record at `https://go.moego.pet/client/21099357/overview?%7Ec=123757&%7Eb=124316` has active **Reeve** (Groodle, 24 kg) and **Nelson** (Groodle, 23.7 kg). Reeve’s expanded card confirms source labels `#3` and `✂4f`, plus pet note `16mm head`. The 16 mm head instruction is explicit and can be structured as head style. The #3 and 4f labels have no stated body area, and Reeve’s expired customer-form vaccination is excluded.

Nelson’s individually expanded card confirms the same `#3` and `✂4f` labels and two duplicate pet notes `Darker one`. The note is ambiguous and source-preserved only; no technical or body-area mapping is supported. Nelson’s expired customer-form vaccination is excluded.

The exact Groomigo match was verified as client ID 66: Nelson (pet ID 149) and Reeve (pet ID 150). One idempotent recovery note was verified per pet. Reeve’s 209-character note has the explicit `16mm head` structured as head style; Nelson’s 235-character source-preserved note has no structured blade, comb or head mapping. Both #3 and 4f labels remain unmapped because no body area is stated.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Reeve | `#3`; `✂4f`; note `16mm head`. | Imported. Explicit 16 mm head instruction is structured; clip labels remain source-preserved/unmapped. |
| Nelson | `#3`; `✂4f`; duplicate notes `Darker one`. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |

## Manual import progress: Tran Nguyen family

The authenticated MoeGo record at `https://go.moego.pet/client/21100655/overview?%7Ec=123757&%7Eb=124316` has active **George** (Labradoodle, 20 kg) and **Archie** (Labradoodle, 18 kg). George’s expanded card confirms `✂4f`, `Char Do` and `#16mm`, plus pet note `#4/ 16mm legs (summer)`. The combined source instruction explicitly supports structured blade `#4` and leg style `16mm legs`; `summer` is retained as source context. The 4f, Char Do and unplaced #16mm labels remain source-preserved/unmapped. George’s expired customer-form vaccination is excluded.

Archie’s individually expanded card confirms `#16mm`, `Char Do` and `✂4f`, plus the same pet note `#4/ 16mm legs (summer)`. The combined source instruction supports the same explicit #4 blade and 16 mm leg-style mapping; `summer` remains retained source context. The remaining labels have no stated body placement and are preserved verbatim. Archie’s expired customer-form vaccination is excluded.

The exact Groomigo match was verified as client ID 67: Archie (pet ID 151) and George (pet ID 152). One idempotent 319-character recovery note was verified per pet. The explicit #4 and 16 mm legs instructions are structured; comb fields remain unpopulated and all unplaced codes or groomer shorthand are preserved exactly in the recovery notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| George | `✂4f`; `Char Do`; `#16mm`; note `#4/ 16mm legs (summer)`. | Imported. #4 and 16 mm legs are structured; summer context and all remaining labels are source-preserved/unmapped. |
| Archie | `#16mm`; `Char Do`; `✂4f`; note `#4/ 16mm legs (summer)`. | Imported. #4 and 16 mm legs are structured; summer context and all remaining labels are source-preserved/unmapped. |

## Manual import progress: Carole Adams family

The authenticated MoeGo record at `https://go.moego.pet/client/21094183/overview?%7Ec=123757&%7Eb=124316` has active **Spencer** (Moodle, 7.3 kg) and **Charlie** (Terrier, 11.1 kg), plus deactivated Gracie, Ju Ju and Poppy. Spencer’s individually expanded active card confirms source label `#7f` and no pet notes. The label has no stated body area, so no technical mapping is supported; a source-preserved recovery record is appropriate. Spencer’s expired customer-form vaccination is excluded.

Charlie’s individually expanded active card confirms the same `#7f` source label and no pet notes. The label remains source-preserved only because no body placement is stated. Charlie’s expired customer-form vaccination is excluded. Deactivated Gracie, Ju Ju and Poppy are excluded from this active-pet recovery batch.

The exact Groomigo match was verified as client ID 75: Charlie (pet ID 166) and Spencer (pet ID 167). One idempotent 184-character recovery note was verified per pet. Blade, comb and head fields remain unpopulated, retaining #7f as source text only because MoeGo does not state its technical placement.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Spencer | `#7f`; no pet notes. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |
| Charlie | `#7f`; no pet notes. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |

## Manual import progress: Cliff Stockley family

The authenticated MoeGo record at `https://go.moego.pet/client/21102595/overview?%7Ec=123757&%7Eb=124316` has active **Tammy** (Maltese x shih) and **Oliver** (Malt X Shih), plus deactivated Leo, Marvin and Zues. Oliver’s individually expanded active card confirms `Bites`, `✂5f` and `10`, plus pet note `Size: Small`. `Bites` is preserved as explicit source handling-alert context; `Size: Small` is retained verbatim. The unplaced 5f and `10` labels are not technically mapped because no body area or value meaning is stated. Oliver’s expired customer-form vaccination is excluded.

Tammy’s individually expanded active card confirms `✂5f` and `10`, with no pet notes. Both labels remain source-preserved only, as MoeGo gives no body placement or technical meaning. Tammy’s expired customer-form vaccination is excluded. Deactivated Leo, Marvin and Zues are excluded from this active-pet recovery batch.

The exact Groomigo match was verified as client ID 89: Oliver (pet ID 190) and Tammy (pet ID 191). One idempotent recovery note was verified per pet. Oliver’s explicit `Bites` label is present in the warnings field, with alert severity intentionally left unset; all blade and comb fields remain unpopulated because the source does not provide a body placement or unambiguous technical value.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Oliver | `Bites`; `✂5f`; `10`; note `Size: Small`. | Imported. Bites is structured as a warning; Size: Small and all unplaced labels are source-preserved/unmapped. |
| Tammy | `✂5f`; `10`; no pet notes. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |

## Manual import progress: Deborah Logan family

The authenticated MoeGo record at `https://go.moego.pet/client/21099417/overview?%7Ec=123757&%7Eb=124316` has active **Lilly** (Maltese x shih) and **Freya** (Shih X), plus deactivated Ausha and Ausher. Lilly’s individually expanded active card confirms `✂4f`, `Megs do`, and pet note `Size: Toy`. All labels and the size note are retained verbatim; 4f is not technically mapped because no body placement is stated, and Megs do remains unclassified groomer-preference text. Lilly’s expired customer-form vaccination is excluded.

Freya’s individually expanded active card confirms `Char Do`, `✂4f`, and pet note `Size: Small`. All labels and the size note are retained verbatim; 4f is unplaced and Char Do remains unclassified groomer-preference text. Freya’s expired customer-form vaccination is excluded. Deactivated Ausha and Ausher are excluded from this active-pet recovery batch.

The exact Groomigo match was verified as client ID 86: Freya (pet ID 184) and Lilly (pet ID 185). One idempotent recovery note was verified per pet. Blade, comb, head, leg and warning fields remain unpopulated because the source provides no unambiguous technical placement or alert information.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Lilly | `✂4f`; `Megs do`; note `Size: Toy`. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |
| Freya | `Char Do`; `✂4f`; note `Size: Small`. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |

## Manual import progress: Meabh O'Carroll family

The authenticated MoeGo record at `https://go.moego.pet/client/21100783/overview?%7Ec=123757&%7Eb=124316` has active **Charlie** (Cavoodle, 17 kg) and **Archie** (Spoodle, 15 kg). Charlie’s individually expanded active card confirms `✂5f`, `#3`, `Char Do`, and pet note `#5/ 10mm legs (#3)`. The explicit `#5` and `10mm legs` instruction can be structured as blade #5 with 10 mm legs. The 5f and #3 labels are retained as source text because their body placement is not stated, and Char Do remains unclassified groomer-preference text. Charlie’s expired customer-form vaccination is excluded.

Archie’s individually expanded active card confirms `Char Do`, `✂4f`, and pet note `#5/ 10mm legs (#3)`. The explicit `#5` and `10mm legs` instruction can be structured as blade #5 with 10 mm legs. The 4f and parenthetical #3 labels remain source-preserved/unmapped, and Char Do remains unclassified groomer-preference text. Archie’s expired customer-form vaccination is excluded.

The exact Groomigo match was verified as client ID 68: Archie (pet ID 153) and Charlie (pet ID 154). One idempotent recovery note was verified per pet. Both notes carry blade #5 and 10 mm legs as the explicit source instruction; comb and warning fields remain unpopulated, while all ambiguous codes and groomer shorthand remain in the source note.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Charlie | `✂5f`; `#3`; `Char Do`; note `#5/ 10mm legs (#3)`. | Imported. #5 and 10 mm legs are structured; 5f, #3 and Char Do are source-preserved/unmapped. |
| Archie | `Char Do`; `✂4f`; note `#5/ 10mm legs (#3)`. | Imported. #5 and 10 mm legs are structured; 4f, #3 and Char Do are source-preserved/unmapped. |

## Manual import progress: Tracey Albury family

The authenticated MoeGo record at `https://go.moego.pet/client/21094220/overview?%7Ec=123757&%7Eb=124316` has active **Winston** (Spoodle, 15.2 kg) and **Enzo** (Spoodle, 10.8 kg), plus deactivated Bella. The displayed active cards confirm `✂5f` for both Winston and Enzo, with zero pet notes on each card. Neither card states a technical body area or clip placement, so the 5f labels must remain source-preserved and unmapped. The displayed expired vaccinations are excluded. Deactivated Bella is excluded from this active-pet recovery batch.

The exact Groomigo match was verified as client ID 71: Enzo (pet ID 159) and Winston (pet ID 160). One idempotent recovery note was verified per pet. Blade, comb, head, leg and warning fields remain unpopulated because the source does not state technical placement or grooming instructions.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Winston | `✂5f`; no pet notes. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |
| Enzo | `✂5f`; no pet notes. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |

## Ranked recovery queue transition: fourth page complete

All previously listed unreviewed fourth-ranked-page candidates have now received an individual, active-pet, read-only source review and a documented result: Kylie Burger, Kerri Torry, Barbara Bou-Samra, Jodie Brown, Kara Hunter, Naomi Brookfield, Chistel Kotnee, Jackie Hartney, Christina Nogaski, Casey Lindsay, Tran Nguyen, Carole Adams, Cliff Stockley, Deborah Logan, Meabh O'Carroll and Tracey Albury. The authorised recovery queue will now advance to the fifth ranked MoeGo client-list page. No source pricing, membership, booking, billing, payment or client-communication data was imported during this transition.

## Ranked recovery queue: fifth page

The authenticated fifth-ranked MoeGo client list is visible. Its current visible candidates, recorded from the list only and not imported from list-level information, are **Kylie Scrivener** (Bear), **Natalia Miller** (Shiraz), **Kate Condon** (Minnie, Molly), **Stellina Popplewell** (Freddi, Luna), **Jo Roberts** (Bear, Coco and an additional pet), **Ruth Weaver** (Maggie), **Debbie Jeffries** (Bella, Marshy and an additional pet), **Louise Dury** (Waffle), **Janet Campbell** (Lucy, Max), **Lee Givney** (Smidge), **Joanne Speck** (Cleo, Jamie), **Kiley McDonald** (Zahli, Zander), **Kerry Harris** (Frankie, Maxi), **Scott Young** (Hugo, Jethro), **James and Shandell Riley** (Eddie, Lola), **Kim Staley-Biggs** (Oakley), **Rachel Masterman** (Albie), **Roseanne Davies** (Sadie), **Elaine Fogg** (Arlo, Lilly), and **Brendon Byth** (Bella). Recovery will begin with Kylie Scrivener and only proceed after pet-level source verification.

## Manual import progress: Kylie Scrivener family

The authenticated MoeGo record at `https://go.moego.pet/client/21102059/overview?%7Ec=123757&%7Eb=124316` has active **Bear** (Poodle (Medium)). Bear’s expanded source card confirms labels `Char Do`, `#13mm` and `4W`, with no pet notes. No label states a technical body area, length placement or unambiguous grooming meaning. All three labels must therefore remain source-preserved and unmapped. The expired customer-form vaccination is excluded from grooming-style recovery.

The exact Groomigo match was verified as client ID 84, pet ID 181. One idempotent 214-character recovery note was verified. Blade, comb, head, leg and warning fields remain unpopulated because the source does not state a technical meaning or body-area placement.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Bear | `Char Do`; `#13mm`; `4W`; no pet notes. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |

## Manual import progress: Natalia Miller family

The authenticated MoeGo record at `https://go.moego.pet/client/21100269/overview?%7Ec=123757&%7Eb=124316` has active **Shiraz** (Poodle (Toy)). Shiraz’s expanded source card confirms `Style C`, with pet notes `#5/ Flare legs` / `Asian muzzle` and `Size: Toy`. **Flare legs** is an explicit leg-style instruction and **Asian muzzle** is an explicit facial-style instruction, so those two source phrases can be structured while retaining their original wording. The source does not state a body placement for `#5`; `#5`, `Style C` and `Size: Toy` must remain source-preserved/unmapped.

The exact Groomigo match was verified as client ID 83, pet ID 180. One idempotent 274-character recovery note was verified. `Asian muzzle` is structured as face style and `Flare legs` as leg style. Blade, comb and head fields remain unpopulated because the source does not state a body placement for #5 or another unambiguous technical value.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Shiraz | `Style C`; notes `#5/ Flare legs`, `Asian muzzle`, `Size: Toy`. | Imported. Asian muzzle and Flare legs are structured; #5, Style C and Size: Toy are source-preserved/unmapped. |

## Manual import progress: Kate Condon family

The authenticated MoeGo record at `https://go.moego.pet/client/21095855/overview?%7Ec=123757&%7Eb=124316` has active **Molly** (Malt X, 3.5 kg) and **Minnie** (Malt X, 4.5 kg). Each expanded source card confirms `Char Do`, `✂4f` and the pet note `Size: Small`. Neither card states a technical meaning or body-area placement for the labels. `Char Do`, `4f` and `Size: Small` must therefore remain source-preserved/unmapped. Expired customer-form vaccinations are excluded. Deactivated **Louie** is excluded from the active-pet recovery batch.

The exact Groomigo match was verified as client ID 78, with Minnie pet ID 170 and Molly pet ID 171. One idempotent recovery note was verified for each pet, with all structured grooming fields left unpopulated.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Molly | `Char Do`; `4f`; note `Size: Small`. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |
| Minnie | `Char Do`; `4f`; note `Size: Small`. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |

## Manual import progress: Stellina Popplewell family

The authenticated MoeGo record at `https://go.moego.pet/client/21101234/overview?%7Ec=123757&%7Eb=124316` has active **Luna** (Cavoodle, 12.8 kg) and **Freddi** (Cavoodle, 15.2 kg). Luna’s source card confirms `✂4f` and `✂5f` with no pet notes; Freddi’s source card confirms `✂5f` and `✂4f` with no pet notes. The source provides no technical body-area placement or meaning for the clip labels, so all labels must remain source-preserved/unmapped. Expired customer-form vaccinations are excluded from grooming-style recovery.

The exact Groomigo match was verified as client ID 85, with Freddi pet ID 182 and Luna pet ID 183. One idempotent recovery note was verified for each pet, with all structured grooming fields left unpopulated.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Luna | `4f`; `5f`; no pet notes. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |
| Freddi | `5f`; `4f`; no pet notes. | Imported as a source-preserved Groomigo note only; no technical or body-area mapping inferred. |

## Manual import progress: Jo Roberts family

The authenticated MoeGo record at `https://go.moego.pet/client/21101627/overview?%7Ec=123757&%7Eb=124316` has active **Mischa** (Tibetan Spaniel), **coco** (pom x, 2 kg) and **Bear** (Tibetan Spaniel, 11 kg). Mischa’s expanded card confirms no Pet Code and the non-technical note `Size: Small`; this is a no-data grooming result. coco’s expanded card confirms `✂5f` and `✂4f` with no pet notes; both labels remain source-preserved/unmapped because no technical body-area placement is stated. Bear’s expanded card confirms `10mm` and `#13mm`, plus the non-technical note `Size: Small`; neither value states a body area, so both remain source-preserved/unmapped. Expired vaccinations are excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Mischa | No Pet Code; note `Size: Small`. | Verified no-data grooming result; no Groomigo recovery note. |
| coco | `✂5f`; `✂4f`; no pet notes. | Source-preserved recovery note only; no technical or body-area mapping. |
| Bear | `10mm`; `#13mm`; note `Size: Small`. | Source-preserved recovery note only; no technical or body-area mapping. |

The exact Groomigo match was verified as client ID 105: Bear (pet ID 217), coco (pet ID 218) and Mischa (pet ID 219). One idempotent source-preserved recovery note was verified for Bear and coco. All structured clip, comb, body-length, head, face, ear, leg, tail and warning fields are blank by design. Mischa correctly has no recovery record because her source contains no grooming-style data.

| Pet | Import status |
| --- | --- |
| coco | Imported as one source-preserved Groomigo note only. `✂5f` and `✂4f` are retained with no inferred technical or body-area mapping. |
| Bear | Imported as one source-preserved Groomigo note only. `10mm` and `#13mm` are retained with no inferred technical or body-area mapping. |
| Mischa | Verified no-data result; no Groomigo recovery note created. |

## Manual import progress: Ruth Weaver family

The authenticated MoeGo record at `https://go.moego.pet/client/21103463/overview?%7Ec=123757&%7Eb=124316` has active **Maggie** (Labradoodle mini). Her expanded card confirms source labels `Char Do`, `✂4f` and `4W`, plus pet notes `#4` and `Size: Small`. The `#4` note is an explicit blade value, but MoeGo does not state a body area. `Char Do`, 4f and 4W remain source-preserved/unmapped; `Size: Small` is non-technical context. The expired customer-form vaccination is excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Maggie | `Char Do`; `✂4f`; `4W`; notes `#4`, `Size: Small`. | Preserve all source text. Structure #4 only as an unplaced explicit blade value; do not infer a body area. |

The exact Groomigo match was verified as client ID 82, Maggie pet ID 179. One idempotent source-preserved recovery note was inserted and verified. `bladeSize` is set to `#4` solely because the source note states the value explicitly; all comb, body-length, head, face, ear, leg, tail, warning and alert fields remain blank because no placement or alert is stated.

| Pet | Import status |
| --- | --- |
| Maggie | Imported as one source-preserved Groomigo recovery note. Explicit #4 is recorded as an unplaced blade value; `Char Do`, `✂4f`, `4W` and `Size: Small` are retained in the note without unsupported mapping. |

## Manual import progress: Debbie Jeffries family

The authenticated MoeGo record at `https://go.moego.pet/client/21098588/overview?%7Ec=123757&%7Eb=124316` has active **Vada**, **Marshy** and **Bella** (all miniature Poodles). Vada and Marshy each have source label `✂4f` and note `Size: Toy`. Bella has source labels `FREAKS @ DRYER` and `✂4f`, plus note `Size: Toy`. The 4f labels remain source-preserved/unmapped because MoeGo does not state a technical body area or clip placement. `FREAKS @ DRYER` is retained as source handling context only; it is not expanded beyond the precise source wording. Size notes are non-technical context and no vaccination data is imported.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Vada | `✂4f`; note `Size: Toy`. | Source-preserved recovery note only; no technical or body-area mapping. |
| Marshy | `✂4f`; note `Size: Toy`. | Source-preserved recovery note only; no technical or body-area mapping. |
| Bella | `FREAKS @ DRYER`; `✂4f`; note `Size: Toy`. | Preserve source labels and the exact handling context; no technical or body-area mapping. |

The exact Groomigo match was verified as client ID 88: Bella (pet ID 187), Marshy (pet ID 188) and Vada (pet ID 189). One idempotent source-preserved recovery note was verified for each pet. All structured clip, comb, body-length, head, face, ear, leg, tail and alert fields are blank. Bella’s exact source handling context `FREAKS @ DRYER` is retained in the grooming-note warning field without assigning an inferred alert level.

| Pet | Import status |
| --- | --- |
| Vada | Imported as one source-preserved Groomigo note only. `✂4f` and `Size: Toy` are retained with no inferred technical or body-area mapping. |
| Marshy | Imported as one source-preserved Groomigo note only. `✂4f` and `Size: Toy` are retained with no inferred technical or body-area mapping. |
| Bella | Imported as one source-preserved Groomigo note. `FREAKS @ DRYER` is retained verbatim as handling context; `✂4f` and `Size: Toy` are preserved with no inferred technical or body-area mapping. |

## Manual import progress: Louise Dury family

The authenticated MoeGo record at `https://go.moego.pet/client/21096631/overview?%7Ec=123757&%7Eb=124316` has active **Waffle** (Groodle, 35 kg). The expanded card confirms source label `Style C` and pet note `#4/ 16mm legs`. The note explicitly states both #4 and 16 mm legs, so those may be structured. `Style C` remains source-preserved/unclassified because MoeGo does not state its technical meaning. The expired customer-form vaccination is excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Waffle | `Style C`; note `#4/ 16mm legs`. | Structure #4 and 16 mm legs; retain Style C verbatim without unsupported interpretation. |

The exact Groomigo match was verified as client ID 77, Waffle pet ID 169. One idempotent source-preserved recovery note was inserted and verified. `bladeSize` is set to `#4` and `legStyle` to `16 mm legs` solely because those values are stated explicitly in the source note. `Style C` remains retained verbatim in the recovery note; all other structured grooming and alert fields remain blank.

| Pet | Import status |
| --- | --- |
| Waffle | Imported as one source-preserved Groomigo recovery note. Explicit #4 and 16 mm legs are structured; Style C remains source text without unsupported interpretation. |

## Manual import progress: Janet Campbell family

The authenticated MoeGo record at `https://go.moego.pet/client/21095438/overview?%7Ec=123757&%7Eb=124316` has active **Max** and **Lucy**, both Toy Poodles (7 kg). Max’s expanded card confirms `✂5f` and pet note `Size: Toy`. Lucy’s expanded card confirms `#5 PFFT` and pet note `Size: Toy`. No body area or technical interpretation is stated for either clip label or `PFFT`, so all labels must remain source-preserved without structured clip placement. Expired customer-form vaccinations are excluded. Deactivated **Peter** is excluded from the active-pet batch.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Max | `✂5f`; note `Size: Toy`. | Preserve source text only; do not infer clip placement. |
| Lucy | `#5 PFFT`; note `Size: Toy`. | Preserve source text only; do not infer clip placement or PFFT meaning. |

The exact Groomigo match was verified as client ID 110, Lucy pet ID 226 and Max pet ID 227. One idempotent source-preserved recovery note was inserted for each active pet and post-insert verification confirms that all structured grooming and alert fields remain blank. Deactivated Peter received no recovery record.

| Pet | Import status |
| --- | --- |
| Max | Imported as one source-preserved Groomigo recovery note. `✂5f` and Size: Toy are retained verbatim; no clip placement was inferred. |
| Lucy | Imported as one source-preserved Groomigo recovery note. `#5 PFFT` and Size: Toy are retained verbatim; no clip placement or PFFT meaning was inferred. |

## Manual import progress: Lee Givney family

The authenticated MoeGo record at `https://go.moego.pet/client/21097412/overview?%7Ec=123757&%7Eb=124316` has active **Smidge** (Cavoodle). The expanded pet card confirms source label `#16mm` and explicitly shows no pet notes. MoeGo does not state the body area for `#16mm`, so it must remain source-preserved with no structured clip placement. The expired customer-form vaccination and non-grooming client note are excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Smidge | `#16mm`; no pet notes. | Preserve source label only; do not infer the body area or technical placement. |

The exact Groomigo match was verified as client ID 90, pet ID 192. One idempotent source-preserved recovery note was inserted and post-insert verification confirms that all structured grooming and alert fields remain blank.

| Pet | Import status |
| --- | --- |
| Smidge | Imported as one source-preserved Groomigo recovery note. `#16mm` remains verbatim with no inferred body area or technical placement. |

## Manual import progress: Joanne Speck family

The authenticated MoeGo record at `https://go.moego.pet/client/21102448/overview?%7Ec=123757&%7Eb=124316` has active **Jamie** (Poodle (Medium), 12 kg) and **Cleo** (Poodle (Toy)). Each card was expanded individually. Both display `WARTS`; this is explicit source alert context and may be stored verbatim in Groomigo warnings. Jamie’s expanded note is `#7 PFFT` and `Sore back`. Cleo’s expanded notes are `#3 PFFT`, `Very bad legs`, and `Size: Toy`. `PFFT` and `PITA` are ambiguous source abbreviations, and no source text assigns any clip code to a body area. The exact source phrases `Sore back` and `Very bad legs` are retained as source alert or handling context, not medically interpreted. Expired customer-form vaccinations are excluded.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Jamie | Labels `WARTS`, `#7 PFFT`, `PITA`; note `#7 PFFT` and `Sore back`; Poodle (Medium), 12 kg. | Preserve all labels and note text verbatim. Retain `WARTS` and `Sore back` as exact source warning context; do not infer clip placement or abbreviation meaning. |
| Cleo | Labels `WARTS`, `#5 PFFT`, `#3`; notes `#3 PFFT`, `Very bad legs`, `Size: Toy`; Poodle (Toy). | Preserve all labels and note text verbatim. Retain `WARTS` and `Very bad legs` as exact source warning context; do not infer clip placement or PFFT meaning. |

The exact Groomigo match was verified as client ID 112, Cleo pet ID 229 and Jamie pet ID 230. One idempotent source-preserved recovery note was inserted for each pet. Post-insert verification confirms that the exact warning wording is retained, while all blade, comb, length and style fields remain blank because source placement is not stated.

| Pet | Import status |
| --- | --- |
| Jamie | Imported with source text retained and warning context `WARTS; Sore back`; no clip placement or abbreviation meaning inferred. |
| Cleo | Imported with source text retained and warning context `WARTS; Very bad legs`; no clip placement or PFFT meaning inferred. |

## Manual import progress: Kiley McDonald family

The authenticated MoeGo record at `https://go.moego.pet/client/21099956/overview?%7Ec=123757&%7Eb=124316` has active **Zander** and **Zahli**, both Shetland Sheepdogs. Each active pet card was expanded individually. Neither card displays a Pet Code, grooming label, behavioural alert, medical issue, incident or pet note. Both cards show only an expired customer-form vaccination, which is excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Recovery result |
| --- | --- | --- |
| Zander | No Pet Code, grooming label or pet note; expired customer-form vaccination only. | Verified no-data result. No speculative Groomigo grooming-style record will be created. |
| Zahli | No Pet Code, grooming label or pet note; expired customer-form vaccination only. | Verified no-data result. No speculative Groomigo grooming-style record will be created. |

The exact Groomigo match was verified as client ID 79, Zahli pet ID 172 and Zander pet ID 173. Post-review verification confirms zero `MoeGo recovery` notes for each pet, as required for the verified no-data result.

## Manual import progress: Kerry Harris family

The authenticated MoeGo record at `https://go.moego.pet/client/21097864/overview?%7Ec=123757&%7Eb=124316` has active **Maxi** (Poodle (Medium), 13.6 kg) and **Frankie** (French Bulldog). Each active pet card was expanded individually. Maxi displays the source label `Style C` and the pet note `Bad skin and ear infection`. This wording is retained as exact source handling or health context, not medically interpreted. Frankie has no Pet Code, grooming label or pet note. Maxi’s expired customer-form vaccination is excluded from grooming-style recovery; Frankie has no vaccination entry.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Maxi | `Style C`; note `Bad skin and ear infection`. | Preserve both strings verbatim. Retain the note as exact source context; do not infer a clip style from `Style C` or interpret a diagnosis. |
| Frankie | No Pet Code, grooming label or pet note. | Verified no-data result. No speculative Groomigo grooming-style record will be created. |

The exact Groomigo match was verified as client ID 109, Frankie pet ID 224 and Maxi pet ID 225. One idempotent source-preserved recovery note was inserted for Maxi. Post-insert verification confirms one intact 265-character record with the exact source context retained in `warnings`, all clip and style placement fields blank, and no alert level inferred. Frankie has zero `MoeGo recovery` notes, as required for the verified no-data result.

| Pet | Import status |
| --- | --- |
| Maxi | Imported as one source-preserved Groomigo recovery note. `Style C` and `Bad skin and ear infection` are retained verbatim; no clip placement, diagnosis or alert level was inferred. |
| Frankie | Verified no-data result. No recovery note created. |

## Manual import progress: Scott Young family — in review

The authenticated MoeGo record at `https://go.moego.pet/client/21103936/overview?%7Ec=123757&%7Eb=124316` has active **Jethro** and **Hugo**, both West Highland White Terriers. Each active pet card was expanded individually. Jethro displays `#7f`, `Style C`, and pet notes `16mm legs` and `Size: Belmont`. Hugo displays `Style C`, `✂5f`, and pet notes `16mm legs` and `Size: Toy`. The explicit phrase `16mm legs` supports the structured leg-style value `16 mm legs` for each pet. The source does not state a body placement for #7f or 5f, and `Style C` and `Size: Belmont` are unclassified source labels, so those values must remain verbatim rather than technically inferred. Expired customer-form vaccinations are excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Jethro | `#7f`; `Style C`; notes `16mm legs`, `Size: Belmont`. | Structure `16 mm legs`; preserve all remaining labels verbatim without inferring clip placement or size meaning. |
| Hugo | `Style C`; `✂5f`; notes `16mm legs`, `Size: Toy`. | Structure `16 mm legs`; preserve all remaining labels verbatim without inferring clip placement or size meaning. |

The exact Groomigo match was verified as client ID 92, Hugo pet ID 194 and Jethro pet ID 195. One idempotent source-preserved recovery note was inserted for each pet. Post-insert verification confirms one intact recovery record for each pet, with `16 mm legs` structured from the explicit note and all blade, comb, head, face and warning fields left blank because the source does not state a technical placement or alert.

| Pet | Import status |
| --- | --- |
| Jethro | Imported with `16 mm legs` structured. `#7f`, `Style C` and `Size: Belmont` remain source-preserved/unmapped. |
| Hugo | Imported with `16 mm legs` structured. `Style C`, `5f` and `Size: Toy` remain source-preserved/unmapped. |

## Manual import progress: James and Shandell Riley family — in review

The authenticated MoeGo record at `https://go.moego.pet/client/21101595/overview?%7Ec=123757&%7Eb=124316` has active **Eddie** and **Lola**, both Pom X Shih. Each active pet card displays `Char Do`, `✂5f`, `SENSITIVE` and `No cologne`, with zero pet notes. `No cologne` is an explicit product-use preference. `SENSITIVE` is retained as source-preserved handling context for review only, without escalation to a safety classification. `Char Do` and 5f remain source-preserved without inferred technical placement. Expired customer-form vaccinations are excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Eddie | `Char Do`; `✂5f`; `SENSITIVE`; `No cologne`; no pet notes. | Preserve all source labels verbatim. Treat No cologne as an explicit product-use preference and SENSITIVE as handling context only; do not infer technical placement or safety classification. |
| Lola | `Char Do`; `✂5f`; `SENSITIVE`; `No cologne`; no pet notes. | Preserve all source labels verbatim. Treat No cologne as an explicit product-use preference and SENSITIVE as handling context only; do not infer technical placement or safety classification. |

The exact Groomigo match was verified as client ID 80, Eddie pet ID 174 and Lola pet ID 175. One idempotent source-preserved recovery note was inserted for each pet. Post-insert verification confirms one intact recovery record for each pet, with blade, comb, head, face, leg, warning and alert fields left blank. No cologne and SENSITIVE remain in the original source wording, rather than being technically or clinically inferred.

| Pet | Import status |
| --- | --- |
| Eddie | Imported as a source-preserved Groomigo note. No cologne is retained as product-use preference text; SENSITIVE remains handling context only; Char Do and 5f remain unmapped. |
| Lola | Imported as a source-preserved Groomigo note. No cologne is retained as product-use preference text; SENSITIVE remains handling context only; Char Do and 5f remain unmapped. |

## Manual import progress: Kim Staley-Biggs family

The authenticated MoeGo record at `https://go.moego.pet/client/21102488/overview?%7Ec=123757&%7Eb=124316` has active **Oakley** (Labradoodle, 17.7 kg). Deactivated Bear and toombie are excluded. Oakley’s expanded card displays `#7f` and `Char Do`, with the pet note `#7 or #5 body` / `#3 legs. 13mm head and ears` / `Plush ears`. The source explicitly identifies #3 legs, 13 mm head and ears, and plush ears, so those details may be structured. The alternative `#7 or #5 body` does not identify a single selected body blade, and #7f plus Char Do have no stated technical placement or meaning; preserve these verbatim and do not infer a choice. The expired customer-form vaccination is excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Oakley | `#7f`; `Char Do`; notes `#7 or #5 body`, `#3 legs. 13mm head and ears`, `Plush ears`. | Structure the explicit #3 legs, 13 mm head and ears, and plush ears. Preserve #7 or #5 body, #7f and Char Do verbatim, with no inferred body-blade choice or technical placement. |

The exact Groomigo match was verified as client ID 91, Oakley pet ID 193. One idempotent source-preserved recovery note was inserted. Post-insert verification confirms one intact record, with #3 legs, 13 mm head and ears, and plush ears structured from the explicit note. Blade and body-length fields remain blank because `#7 or #5 body` does not identify a selected blade.

| Pet | Import status |
| --- | --- |
| Oakley | Imported with `#3 legs`, `13 mm head`, and `13 mm ears; Plush ears` structured. `#7 or #5 body`, `#7f` and `Char Do` remain source-preserved/unmapped. |

## Manual import progress: Rachel Masterman family

The authenticated MoeGo record at `https://go.moego.pet/client/21099790/overview?%7Ec=123757&%7Eb=124316` has active **Albie** (Groodle, 34.8 kg). Albie’s card displays `#3`, `#16mm`, `Char Do` and `Style C`, with pet notes `#3/ 16mm legs`, `19mm head Bob ears`, and `19mm (winter)`. The `#3/ 16mm legs` source instruction explicitly supports #3 with 16 mm legs, while `19mm head` and `Bob ears` are explicit head and ear instructions. The standalone #16mm label, Char Do, Style C and `19mm (winter)` lack a stated technical placement or classification and must remain verbatim. The expired customer-form vaccination is excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Albie | `#3`; `#16mm`; `Char Do`; `Style C`; notes `#3/ 16mm legs`, `19mm head Bob ears`, `19mm (winter)`. | Structure #3 with 16 mm legs, 19 mm head and Bob ears. Preserve #16mm, Char Do, Style C and 19mm (winter) verbatim without unsupported placement or meaning. |

The exact Groomigo match was verified as client ID 95, Albie pet ID 200. One idempotent source-preserved recovery note was inserted. Post-insert verification confirms one intact record, with #3, 16 mm legs, 19 mm head and Bob ears structured from explicit source wording. Body length, warning and alert fields remain blank.

| Pet | Import status |
| --- | --- |
| Albie | Imported with `#3`, `16 mm legs`, `19 mm head` and `Bob ears` structured. `#16mm`, `Char Do`, `Style C` and `19mm (winter)` remain source-preserved/unmapped. |

## Manual import progress: Roseanne Davies family

The authenticated MoeGo record at `https://go.moego.pet/client/21096223/overview?%7Ec=123757&%7Eb=124316` has active **Sadie** (Groodle, 24 kg). Sadie’s card displays `#16mm` and `Style C`, with pet note `13mm/ 16mm legs`. The explicit `16mm legs` instruction may be structured. The standalone `13mm` value, the #16mm label and Style C do not state technical placement or classification, so they must remain source-preserved/unmapped. MoeGo records no vaccination for this pet; no vaccination detail is imported for grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Sadie | `#16mm`; `Style C`; note `13mm/ 16mm legs`. | Structure `16 mm legs`. Preserve `13mm`, `#16mm` and `Style C` verbatim without unsupported placement or meaning. |

The exact Groomigo match was verified as client ID 120, Sadie pet ID 244. One idempotent source-preserved recovery note was inserted. Post-insert verification confirms one intact record, with `16 mm legs` structured from the explicit note. Blade, body-length, head, ear, warning and alert fields remain blank because the source does not assign those values to a technical placement or classification.

| Pet | Import status |
| --- | --- |
| Sadie | Imported with `16 mm legs` structured. `13mm`, `#16mm` and `Style C` remain source-preserved/unmapped. |

## Manual import progress: Elaine Fogg family

The authenticated MoeGo record at `https://go.moego.pet/client/21097060/overview?%7Ec=123757&%7Eb=124316` has active **Lilly** (Poodle (Toy), 7 kg) and **Arlo** (Moodle, 6.5 kg). Lilly displays pet code `#3` and pet note `#3 13mm head`, plus `Size: Toy`. The technical values are explicit in the note, so the #3 blade value and 13 mm head direction can be structured; the size wording remains source-preserved. Arlo displays `✂4f` and pet note `#5`; neither label states a body area or resolves the conflict, so both remain source-preserved/unmapped. Expired customer-form vaccinations are excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Lilly | `#3`; note `#3 13mm head`; `Size: Toy`. | Structure blade `#3` and `13 mm head`; preserve Size: Toy source wording. |
| Arlo | `✂4f`; note `#5`. | Preserve both labels verbatim without unsupported placement or conflict resolution. |

The exact Groomigo match was verified as client ID 94, Arlo pet ID 198 and Lilly pet ID 199. One idempotent source-preserved recovery note was retained for each pet. Post-insert verification confirms Lilly has #3 blade and 13 mm head structured from the explicit note, while Arlo has no structured grooming fields because the source labels conflict and state no body area.

| Pet | Import status |
| --- | --- |
| Lilly | Imported with `#3` blade and `13 mm head` structured. Size: Toy remains source-preserved. |
| Arlo | Imported source-preserved only. `✂4f` and `#5` remain unmapped and unreconciled. |

## Manual import progress: Brendon Byth family

The authenticated MoeGo record at `https://go.moego.pet/client/21095378/overview?%7Ec=123757&%7Eb=124316` has active **Bella** (Bichon Frise, 4 kg). Bella’s card displays `Megs do`, `Bichon` and `PLUCK EARS`, with pet note `Size: Small`. `PLUCK EARS` is an explicit ear-treatment instruction and may be structured as `Pluck ears`. `Megs do`, `Bichon` and Size: Small remain source-preserved labels or context and are not technically inferred. The expired customer-form vaccination is excluded from grooming-style recovery.

| Pet | Authenticated MoeGo source text | Intended recovery treatment |
| --- | --- | --- |
| Bella | `Megs do`; `Bichon`; `PLUCK EARS`; note `Size: Small`. | Structure `Pluck ears`; preserve Megs do, Bichon and Size: Small verbatim without unsupported classification. |

The exact Groomigo match was verified as client ID 100, Bella pet ID 208. One idempotent source-preserved recovery note was inserted. Post-insert verification confirms a single intact record, with `Pluck ears` structured from the explicit source label and all blade, body, head, leg, warning and alert fields blank.

| Pet | Import status |
| --- | --- |
| Bella | Imported with `Pluck ears` structured. Megs do, Bichon and Size: Small remain source-preserved/unmapped. |

## Ranked-page coverage update

All visible fifth-ranked MoeGo client-list candidates have now received an individual, active-pet, read-only source review and documented result: Kylie Scrivener, Natalia Miller, Kate Condon, Stellina Popplewell, Jo Roberts, Ruth Weaver, Debbie Jeffries, Louise Dury, Janet Campbell, Lee Givney, Joanne Speck, Kiley McDonald, Kerry Harris, Scott Young, James and Shandell Riley, Kim Staley-Biggs, Rachel Masterman, Roseanne Davies, Elaine Fogg and Brendon Byth. The authorised recovery queue will now advance to the sixth ranked client-list page. No source pricing, membership, booking, billing, payment or client-communication data was imported during this page transition.

## Ranked recovery queue: sixth page

The authenticated sixth-ranked MoeGo client list is visible. Its current visible candidates, recorded from the list only and not imported from list-level information, are **Kylie Brumwell** (Gizmo), **Lauren Tucker** (Alfie), **Nakomah Bates** (Rui, Evie), **Donna Hurren** (Versace), **Peter Brabant** (Ishkah), **Paris Manteit** (Nova, Raven), **Kim Dahl** (Beau, Ralph), **Tonja Aitken** (Blits, Molly), **Linda Schreurs** (Arlo), **Denise Partis** (Maddie, Misha), **Trudi Kennedy** (Tilly, Dusty), **Marie Mason** (Louis, Teddy), **Lisa Smith** (Alfie, Zali), **Jen Cardaci** (Banjo, Freddie), **Cheryl Schmidt** (Archie, Lola), **Marisa Hopper** (Bingo, Minnie and an additional pet), **Chris Auld** (Lola, Poppy), **Len Fehlhaber** (Alfie, Daisy), **Tracey Mckee** (Bartlet, Missy), and **Dianne English** (Ziva, Zola). Recovery will begin with Kylie Brumwell and only proceed after pet-level source verification.

## Manual import progress: Kylie Brumwell family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21095223/overview?%7Ec=123757&%7Eb=124316` was reviewed for active **Gizmo** (Groodle). The expanded pet card confirms source labels `4W`, `✂4f`, `Char Do` and `#7f`, with no pet notes. None of these labels supplies an explicit body area, technical placement or defined grooming meaning, so all must remain source-preserved and unmapped. The expired customer-form vaccination is excluded from grooming-style recovery.

The exact Groomigo match was verified as client ID 97, pet ID 203. One idempotent recovery note was inserted and post-insert verification confirms all blade, comb, body, head, face, ear, leg, tail, warning and alert fields remain empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Gizmo | `4W`; `✂4f`; `Char Do`; `#7f`; no pet notes. | Imported as a source-preserved Groomigo grooming-style note only. No technical or body-area mapping was inferred. |

## Manual import progress: Lauren Tucker family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21103050/overview?%7Ec=123757&%7Eb=124316` was reviewed for active **Alfie** (Groodle, 32 kg). The expanded pet card confirms source labels `LEAD CHEWER` and `✂4f`, with no pet notes. `LEAD CHEWER` is retained as source handling context only; `✂4f` has no explicit body-area placement and remains unmapped. The expired customer-form vaccination is excluded from grooming-style recovery.

The exact Groomigo match was verified as client ID 103, pet ID 213. One idempotent recovery note was inserted and post-insert verification confirms all blade, comb, body, head, face, ear, leg, tail, warning and alert fields remain empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Alfie | `LEAD CHEWER`; `✂4f`; no pet notes. | Imported as a source-preserved Groomigo grooming-style note only. LEAD CHEWER is retained as handling context in the recovery note; no technical, warning-level or body-area mapping was inferred. |

## Manual import progress: Nakomah Bates family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21275668/overview?%7Ec=123757&%7Eb=124316` was reviewed for active **Evie** (Cavoodle, 4.4 kg) and **Rui** (Cavoodle, 6 kg). Each expanded pet card confirms source labels `#7f` and `Ally do`, with no pet notes and no expired-vaccine information. Neither source label specifies a body area or technical meaning, so both are retained verbatim without structured mapping.

The exact Groomigo matches were verified as client ID 102, pet IDs 212 (Evie) and 211 (Rui). One idempotent recovery note was inserted per pet. Post-insert verification confirms every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Evie | `#7f`; `Ally do`; no pet notes. | Imported as a source-preserved Groomigo grooming-style note only. No technical or body-area mapping was inferred. |
| Rui | `#7f`; `Ally do`; no pet notes. | Imported as a source-preserved Groomigo grooming-style note only. No technical or body-area mapping was inferred. |

## Manual import progress: Donna Hurren family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21098436/overview?%7Ec=123757&%7Eb=124316` was reviewed for active **Versace** (Rough Collie, 24 kg). The loaded pet card shows no pet-code labels and `No pet notes yet.` The only visible historical vaccination is expired and excluded from grooming-style recovery. No grooming-style note should be created without source text.

The exact Groomigo match was verified as client ID 133, pet ID 262. The existing recovery-note count is zero, confirming no speculative Groomigo record was created for this verified no-data result.

## Manual import progress: Peter Brabant family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21095065/overview?%7Ec=123757&%7Eb=124316` was reviewed for active **Ishkah** (German Shepherd Dog). The active pet card displays `DOG AGGRESSIVE`, `Ski`, `🦿` and `FileNail`; `No pet notes yet.` is shown. `DOG AGGRESSIVE` is explicit source handling context but does not establish Groomigo alert severity. `Ski`, the leg emoji and `FileNail` are preserved source labels with no technical or body-area inference.

The exact Groomigo match was verified as client ID 87, pet ID 186. A single idempotent Groomigo recovery note was inserted and verified with `warnings = DOG AGGRESSIVE`, no selected alert level and no populated clip, comb or body-area fields.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ishkah | `DOG AGGRESSIVE`; `Ski`; `🦿`; `FileNail`; no pet notes. | Imported. The exact `DOG AGGRESSIVE` source wording is retained in the warning field and recovery note; all other labels remain source-preserved/unmapped. |

## Manual import progress: Paris Manteit family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21099690/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Raven** (Poodle (Toy), 4 kg) and **Nova** (Schnauzer (Miniature), 7 kg). Raven’s expanded pet card displays `✂5f` and `CAGE AGGRESSIVE`; its visible pet note reads `White chin`, `Little white on chest`, `White on back feet`, followed by `All vaccinations/worming / flea tick up to date`. `CAGE AGGRESSIVE` is explicit pet-level handling wording, whereas `✂5f` supplies no stated body-area placement. The coat-marking text is retained as source grooming context; the vaccination/worming/flea-tick statement is documented but excluded from the grooming-style import scope.

Nova’s expanded pet card displays `PITA` and `Style C`; its visible pet notes read `#10 Trad` and `Size: Small`. `PITA`, `Style C`, `#10 Trad` and `Size: Small` are preserved verbatim as source labels or notes. None expressly states a defined technical placement, grooming action or handling meaning, so no structured mapping or warning classification will be inferred.

The client-level notes `CAGE AGRO` and `0491135608 call paris` were deliberately not treated as pet grooming instructions. No source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 101, pet ID 210 (**Raven**) and pet ID 209 (**Nova**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that Raven retains `warnings = CAGE AGGRESSIVE`, while Nova has no warning value; both records have no selected alert level and no populated blade, comb, body, head, face, ear, leg or tail field.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Raven | `✂5f`; `CAGE AGGRESSIVE`; `White chin`; `Little white on chest`; `White on back feet`. `All vaccinations/worming / flea tick up to date` was visible but excluded from scope. | Imported. The exact `CAGE AGGRESSIVE` pet-level text is retained in the warning field and recovery note. `✂5f` remains source-preserved/unmapped because no body area is stated; no alert level was inferred. |
| Nova | `PITA`; `Style C`; `#10 Trad`; `Size: Small`. | Imported as a source-preserved Groomigo recovery note only. No technical placement, handling meaning, warning value or alert level was inferred. |

## Manual import progress: Kim Dahl family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21096150/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Ralph** (Schnoodle, 11 kg) and **Beau** (Poodle (Toy), 9 kg). Ralph’s expanded pet card displays `✂5f` and `#7f` with `No pet notes yet.` Beau’s expanded pet card also displays `✂5f` and `#7f`; its visible pet notes read `Poodle face` and `Size: Toy`.

`✂5f` and `#7f` have no explicit body-area placement and will remain source-preserved/unmapped. `Poodle face` supplies an explicit facial grooming action and may be mapped to Groomigo’s face-style field while retaining its exact wording. `Size: Toy` is preserved verbatim as source context, without structured mapping. No handling warning or alert-level inference is supported by the reviewed source, and no source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 140, pet ID 274 (**Ralph**) and pet ID 273 (**Beau**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms `face_style = Poodle face` for Beau, with every other structured grooming, warning and alert field empty; Ralph has no populated structured grooming, warning or alert field.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ralph | `✂5f`; `#7f`; no pet notes. | Imported as a source-preserved Groomigo recovery note only. No technical placement, warning or alert-level mapping was inferred. |
| Beau | `✂5f`; `#7f`; `Poodle face`; `Size: Toy`. | Imported. The exact `Poodle face` source wording is retained in the face-style field and recovery note. `✂5f`, `#7f` and `Size: Toy` remain source-preserved/unmapped; no warning or alert level was inferred. |

## Manual import progress: Tonja Aitken family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21094205/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Molly** (Bichon Frise) and **Blits** (Bichon Frise, 5 kg). Molly’s expanded pet card displays `#7f`; its visible pet notes read `#7 19mm head` and `Size: Small`. Blits’s expanded active-pet card also displays `#7f`; its visible pet notes read `#7 19mm head`, `One eye` and `Size: Small`. Blits has an expired customer-form vaccination, which is excluded from grooming-style recovery. Deactivated Bear and Constance are outside the active-pet recovery scope.

`19mm head` supplies an explicit measured head-area instruction and may be retained in Groomigo’s head-style field while preserving the full source wording. The `#7` portion of the combined note and standalone `#7f` labels supply no stated body-area placement and will remain source-preserved/unmapped. `One eye` and `Size: Small` remain verbatim source text without inferred grooming, handling or safety meaning. No source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 113, pet ID 231 (**Blits**) and pet ID 232 (**Molly**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms `head_style = 19mm head` for both pets, with every blade, comb, body, face, ear, leg, tail, warning and alert field empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Molly | `#7f`; `#7 19mm head`; `Size: Small`. | Imported. The exact `19mm head` wording is retained in the head-style field and recovery note. The `#7` portion, `#7f` and `Size: Small` remain source-preserved/unmapped. |
| Blits | `#7f`; `#7 19mm head`; `One eye`; `Size: Small`. An expired customer-form vaccination was excluded. | Imported. The exact `19mm head` wording is retained in the head-style field and recovery note. The `#7` portion, `#7f`, `One eye` and `Size: Small` remain source-preserved/unmapped; no warning or alert level was inferred. |

## Manual import progress: Linda Schreurs family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21102012/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Arlo** (Choodle, 2 kg). Arlo’s expanded pet card displays `PLUCK EARS` and `✂5f`; its visible pet notes read `#5 #4 face` and `Size: Small`. An expired customer-form vaccination is visible and excluded from grooming-style recovery. Deactivated Maximus and Ceasar are outside the active-pet recovery scope.

`PLUCK EARS` supplies an explicit ear-grooming action and may be retained in Groomigo’s ear-style field with its exact source wording. `✂5f` has no stated body-area placement. The combined `#5 #4 face` note contains two blade values with an ambiguous relationship to the stated face area, so it will remain source-preserved/unmapped rather than selecting either value. `Size: Small` is preserved verbatim as source context without structured mapping. No handling warning, alert level, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 108, pet ID 223 (**Arlo**), active. One idempotent Groomigo recovery note was inserted. Post-insert verification confirms `ear_style = PLUCK EARS`, with every blade, comb, body, head, face, leg, tail, warning and alert field empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Arlo | `PLUCK EARS`; `✂5f`; `#5 #4 face`; `Size: Small`. An expired customer-form vaccination was excluded. | Imported. The exact `PLUCK EARS` source wording is retained in the ear-style field and recovery note. `✂5f`, `#5 #4 face` and `Size: Small` remain source-preserved/unmapped because no unambiguous technical placement is stated. |

## Manual import progress: Denise Partis family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21100992/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Misha** (Japanese Spitz, 9.5 kg) and **Maddie** (Japanese Spitz, 9 kg). Each pet card displays `Dont shave groin / bum`. Misha’s expanded card has no pet notes. Maddie’s expanded card contains `Curley tail. Orange harness`. An expired customer-form vaccination appears on both pet cards and is excluded from grooming-style recovery.

`Dont shave groin / bum` is an explicit source-preserved grooming instruction, but Groomigo has no matching groin/bottom placement field and it will not be forced into a different structured field. `Curley tail. Orange harness` is retained exactly without assuming it is a tail styling action, a handling warning or an alert. No source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 93, pet ID 197 (**Misha**) and pet ID 196 (**Maddie**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Misha | `Dont shave groin / bum`; no pet notes. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The groin/bottom instruction has no matching Groomigo structured field and no warning or alert level was inferred. |
| Maddie | `Dont shave groin / bum`; `Curley tail. Orange harness`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The groin/bottom instruction has no matching Groomigo structured field; `Curley tail. Orange harness` remains verbatim without inferred tail styling, handling or alert meaning. |

## Manual import progress: Trudi Kennedy family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21098898/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Dusty** (Cavoodle, 4 kg) and **Tilly** (Cavoodle, 9 kg). Each expanded pet card displays `✂5f` and `✂4f`, and both cards show no pet notes and no vaccination record.

Neither label states a body area or an action, and the pair does not establish which (if either) was used for a specific placement. Both labels will be retained verbatim in source-preserved recovery notes without mapping a blade, comb, body, head, face, ear, leg, tail, warning or alert field. No source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 116, pet ID 237 (**Dusty**) and pet ID 236 (**Tilly**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Dusty | `✂5f`; `✂4f`; no pet notes. | Imported as a source-preserved Groomigo recovery note only. Neither label has a stated technical placement, and no warning or alert level was inferred. |
| Tilly | `✂5f`; `✂4f`; no pet notes. | Imported as a source-preserved Groomigo recovery note only. Neither label has a stated technical placement, and no warning or alert level was inferred. |

## Manual import progress: Marie Mason family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21099778/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Teddy** (Poodle, Medium) and **Louis** (Poodle, Medium). Teddy’s expanded pet card displays `#5 PFFT` and its visible pet note reads `Size: Medium`. Louis’s expanded pet card displays `Smaller` and `#5 PFFT`; it has no pet notes. An expired customer-form vaccination appears on both pet cards and is excluded from grooming-style recovery.

`#5 PFFT` does not state a body area or action and will remain source-preserved/unmapped. `Smaller` and `Size: Medium` are preserved verbatim without technical mapping. No handling warning or alert-level inference is supported by the reviewed source, and no source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 98, pet ID 204 (**Louis**) and pet ID 205 (**Teddy**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Louis | `Smaller`; `#5 PFFT`; no pet notes. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. `Smaller` and `#5 PFFT` have no explicit recognised technical placement, and no warning or alert level was inferred. |
| Teddy | `#5 PFFT`; `Size: Medium`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. Neither source label supplies a stated body area or action, and no warning or alert level was inferred. |

## Manual import progress: Lisa Smith family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21102361/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Zali** (Maltese) and **Alfie** (Bichon Frise). Each expanded pet card displays `✂5f`, `Megs do` and `✂4f`. Zali’s visible pet note reads `Size: Toy`; Alfie’s visible pet note reads `Size: Small`. An expired customer-form vaccination appears on both pet cards and is excluded from grooming-style recovery.

Neither `✂5f` nor `✂4f` states a body area or action. `Megs do`, `Size: Toy` and `Size: Small` are preserved verbatim without technical mapping. No handling warning or alert-level inference is supported by the reviewed source, and no source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 118, pet ID 241 (**Alfie**) and pet ID 242 (**Zali**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Alfie | `✂5f`; `Megs do`; `✂4f`; `Size: Small`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The clip labels have no stated technical placement; `Megs do` and `Size: Small` remain unmapped, with no warning or alert level inferred. |
| Zali | `✂5f`; `Megs do`; `✂4f`; `Size: Toy`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The clip labels have no stated technical placement; `Megs do` and `Size: Toy` remain unmapped, with no warning or alert level inferred. |

## Manual import progress: Jen Cardaci family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21095475/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Freddie** (Schnauzer, 8.2 kg) and **Banjo** (Miniature Schnauzer, 9.5 kg). Freddie’s expanded pet card displays `#15 Trad` and `Bites`; its visible pet notes read `#15 Trad/ #4 legs`, `Bites for knots` and `Size: Medium`. Banjo’s expanded card displays `#15 Trad`; its visible pet notes read `#15 Trad/ #4 legs` and `Size: Small`. An expired customer-form vaccination appears on both pet cards and is excluded from grooming-style recovery.

`#4 legs` supplies an explicit blade value and body area and may be retained in Groomigo’s leg-style field with its exact source wording. `#15 Trad` has no stated body-area placement and remains source-preserved/unmapped. Freddie’s `Bites` label and `Bites for knots` pet note are retained verbatim as handling context, with no alert-level inference. The size labels are preserved verbatim without technical mapping. No source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 99, pet ID 206 (**Banjo**) and pet ID 207 (**Freddie**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms `leg_style = #4 legs` for both pets; Freddie retains `warnings = Bites for knots`. All remaining structured grooming and alert fields are empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Banjo | `#15 Trad`; `#15 Trad/ #4 legs`; `Size: Small`. An expired customer-form vaccination was excluded. | Imported. The exact `#4 legs` source wording is retained in the leg-style field and recovery note. `#15 Trad` and `Size: Small` remain source-preserved/unmapped; no warning or alert level was inferred. |
| Freddie | `#15 Trad`; `Bites`; `#15 Trad/ #4 legs`; `Bites for knots`; `Size: Medium`. An expired customer-form vaccination was excluded. | Imported. The exact `#4 legs` source wording is retained in the leg-style field. `Bites for knots` is retained verbatim in the warning field, without alert-level inference. `#15 Trad` and `Size: Medium` remain source-preserved/unmapped. |

## Manual import progress: Cheryl Schmidt family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21101990/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Lola** (Miniature Schnauzer, 8 kg) and **Archie** (Miniature Schnauzer, 10 kg). Lola’s expanded pet card displays `Style C`, `#15` and `#3`; its visible pet notes read `#15 Trad/ #3 legs`, `Had 16mm on legs before and #10 in body` and `Size: Small`. Archie’s expanded card displays `#10 Trad`; its visible pet notes read `Bites for pads and nails`, `#15 Trad/ #3 legs`, `Had 16mm on legs before and #10 on body` and `Size: Small`. Both cards state `No vaccination yet.`

`#3 legs` is the explicit contemporaneous leg-area instruction and may be retained in Groomigo’s leg-style field with its exact source wording. The `Had 16mm on legs before and #10 in/on body` text is preserved as historical source context; because it records an earlier groom and conflicts with the current `#3 legs` instruction in a single structured leg field, it is not technically mapped. `Style C`, `#15`, `#15 Trad`, `#10 Trad` and the size labels remain source-preserved/unmapped. Archie’s `Bites for pads and nails` wording is retained verbatim as handling context, with no alert-level inference. No source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 150, pet ID 286 (**Archie**) and pet ID 287 (**Lola**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms `leg_style = #3 legs` for both pets; Archie retains `warnings = Bites for pads and nails`. All remaining structured grooming and alert fields are empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Archie | `#10 Trad`; `Bites for pads and nails`; `#15 Trad/ #3 legs`; `Had 16mm on legs before and #10 on body`; `Size: Small`. | Imported. The exact `#3 legs` source wording is retained in the leg-style field. `Bites for pads and nails` is retained verbatim in the warning field, without alert-level inference. The historical 16mm/#10 text and remaining labels are source-preserved/unmapped. |
| Lola | `Style C`; `#15`; `#3`; `#15 Trad/ #3 legs`; `Had 16mm on legs before and #10 in body`; `Size: Small`. | Imported. The exact `#3 legs` source wording is retained in the leg-style field. The historical 16mm/#10 text and remaining labels are source-preserved/unmapped; no warning or alert level was inferred. |

## Manual import progress: Marisa Hopper family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21098301/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Alfie** (Mini Groodle), **Minnie** (Cavoodle) and **Bingo** (Cavoodle). Alfie’s expanded pet card displays `#13mm`, `Char Do`, `Style C` and `#16mm`; its visible pet note reads `13mm`. Minnie’s and Bingo’s expanded cards each display `#3` and state `No pet notes yet.` An expired customer-form vaccination appears on both Minnie and Bingo and is excluded from grooming-style recovery. Alfie’s card states `No vaccination yet.`

None of Alfie’s clip labels or `13mm` specify a body area or action. Minnie’s and Bingo’s standalone `#3` labels also have no stated technical placement. All source text is therefore retained verbatim without structured grooming, warning or alert-level mapping. No source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 104, pet ID 216 (**Alfie**), pet ID 215 (**Minnie**) and pet ID 214 (**Bingo**), all active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for all three notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Alfie | `#13mm`; `Char Do`; `Style C`; `#16mm`; `13mm`. | Imported as a source-preserved Groomigo recovery note only. No source label names a body area or action, so no structured grooming, warning or alert field was inferred. |
| Minnie | `#3`; `No pet notes yet.` An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The standalone clip code has no stated technical placement, and no warning or alert level was inferred. |
| Bingo | `#3`; `No pet notes yet.` An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The standalone clip code has no stated technical placement, and no warning or alert level was inferred. |

## Manual import progress: Chris Auld — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21094424/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Poppy** and **Lola**, both Cavoodles. Each expanded pet card displays `✂4f` and states `No pet notes yet.` An expired customer-form vaccination appears on each pet card and is excluded from grooming-style recovery.

The `✂4f` label does not state a body area or action, so it will be retained verbatim without a blade, comb, body, head, face, ear, leg or tail mapping. No handling warning or alert-level inference is supported by the reviewed source, and no source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 139, pet ID 271 (**Lola**) and pet ID 272 (**Poppy**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Poppy | `✂4f`; `No pet notes yet.` An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The clip label has no stated technical placement, and no warning or alert level was inferred. |
| Lola | `✂4f`; `No pet notes yet.` An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The clip label has no stated technical placement, and no warning or alert level was inferred. |

## Manual import progress: Len Fehlhaber — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21515024/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Daisy** (Cavoodle, 7 kg) and **Alfie** (Maltese x shih, 9 kg). Each expanded pet card displays `✂5f`, states `No pet notes yet.`, and shows `No vaccination yet.`

The `✂5f` label does not state a body area or action, so it will be retained verbatim without a blade, comb, body, head, face, ear, leg or tail mapping. No handling warning or alert-level inference is supported by the reviewed source, and no source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 163, pet ID 309 (**Daisy**) and pet ID 308 (**Alfie**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Daisy | `✂5f`; `No pet notes yet.` | Imported as a source-preserved Groomigo recovery note only. The clip label has no stated technical placement, and no warning or alert level was inferred. |
| Alfie | `✂5f`; `No pet notes yet.` | Imported as a source-preserved Groomigo recovery note only. The clip label has no stated technical placement, and no warning or alert level was inferred. |

## Manual import progress: Tracey Mckee — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21100056/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Missy** (Miniature Poodle, 11.1 kg) and **Bartlet** (Medium Poodle, 11.8 kg). Missy’s expanded card displays `Style C`, `#4 PFFT` and `Char Do`, with pet notes `#4/ 16mm legs` and `Size: Toy`. Bartlet’s expanded card displays `#4 PFFT` and `Megs do`, with pet note `19mm tk`. An expired customer-form vaccination appears on each card and is excluded from grooming-style recovery.

The exact `16mm legs` wording within Missy’s note supplies an explicit measurement and body area and can be retained in Groomigo’s leg-style field. The adjacent `#4/` portion is not mapped because its placement within the combined source text is unclear. `Style C`, `#4 PFFT`, `Char Do`, `Size: Toy`, `Megs do` and `19mm tk` remain source-preserved/unmapped because no recognised body area or action is stated. No handling warning or alert-level inference is supported by the reviewed source, and no source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 123, pet ID 249 (**Missy**) and pet ID 248 (**Bartlet**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms `leg_style = 16mm legs` for Missy, with every other structured grooming, warning and alert field empty; Bartlet has no populated structured grooming, warning or alert field.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Missy | `Style C`; `#4 PFFT`; `Char Do`; `#4/ 16mm legs`; `Size: Toy`. An expired customer-form vaccination was excluded. | Imported. The exact `16mm legs` source wording is retained in the leg-style field. The adjacent `#4/` portion and all other labels remain source-preserved/unmapped; no warning or alert level was inferred. |
| Bartlet | `#4 PFFT`; `Megs do`; `19mm tk`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The labels supply no recognised body area or action, and no warning or alert level was inferred. |

## Manual import progress: Dianne English — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21096794/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Zola** (Shih Tzu, 7 kg) and **Ziva** (Malt X, 11 kg). Zola’s expanded card displays `✂4f` with pet note `Size: Toy`. Ziva’s expanded card displays `LEAVE EYELASHES` and `✂5f` with pet note `Size: Small`. An expired customer-form vaccination appears on each card and is excluded from grooming-style recovery. The displayed client-level contact note was not treated as a pet instruction.

`LEAVE EYELASHES` supplies an explicit facial grooming action and can be retained in Groomigo’s face-style field with its exact source wording. `✂4f` and `✂5f` do not state a body area or action, so they will remain source-preserved/unmapped. The size notes are preserved verbatim without technical mapping. No handling warning or alert-level inference is supported by the reviewed source, and no source appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 106, pet ID 220 (**Ziva**) and pet ID 221 (**Zola**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms `face_style = LEAVE EYELASHES` for Ziva, with every other structured grooming, warning and alert field empty; Zola has no populated structured grooming, warning or alert field.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ziva | `LEAVE EYELASHES`; `✂5f`; `Size: Small`. An expired customer-form vaccination was excluded. | Imported. The exact `LEAVE EYELASHES` source wording is retained in the face-style field. `✂5f` and `Size: Small` remain source-preserved/unmapped; no warning or alert level was inferred. |
| Zola | `✂4f`; `Size: Toy`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The clip code has no stated technical placement, and no warning or alert level was inferred. |

## Ranked recovery queue transition: sixth page complete

All visible sixth-ranked MoeGo client-list candidates have now received an individual, active-pet, read-only source review and documented result: Kylie Brumwell, Lauren Tucker, Nakomah Bates, Donna Hurren, Peter Brabant, Paris Manteit, Kim Dahl, Tonja Aitken, Linda Schreurs, Denise Partis, Trudi Kennedy, Marie Mason, Lisa Smith, Jen Cardaci, Cheryl Schmidt, Marisa Hopper, Chris Auld, Len Fehlhaber, Tracey Mckee and Dianne English. The authorised recovery queue will now advance to the seventh ranked client-list page. No source pricing, membership, booking, billing, payment or client-communication data was imported during this transition.

### Navigation confirmation

The authenticated client list was traversed through previously reconciled ranked pages one through five while reaching the next queue. Those pages displayed families already represented in this audit; no client profile was reopened for source extraction, no new source data was imported, and no client, appointment, pricing, billing, membership, payment or communication data changed during navigation.

## Ranked recovery queue: seventh page

The authenticated seventh-ranked MoeGo client list is visible. Its current visible candidates, recorded from the list only and not imported from list-level information, are **Noreen Cicala** (Luka), **Sibel Allan Jones** (Daisy), **Julie Holder** (Maggie), **Peter Burchell** (Willow), **Kaitlyn Dawe** (Billie, Dexter), **Alisa Luck** (Beau, Teddie and additional pets), **Kayla Fellingham** (Jemima, Teacup), **Rachael Heigan** (Appa, Momo), **Janelle Mehrten** (Miska), **Megan Duggan** (Ellie), **Marjorie Connole** (Coco, Gigi), **Geraldine Fredricks** (Newman), **Lisa Kaniyur** (Toffee), **Annette Ash** (Carly), **Dorit Skomoroch** (Remi), **Lauren Forword** (Bella, Buddy), **Jacinta Ljubas** (Buddy, Casper), **David Bergman** (Jett; client displayed inactive), **Emily Hall** (Lucy, Pip), and **Liana Peenze** (Sirgeo). Recovery will begin with Noreen Cicala and only proceed after individual pet-level source verification. No source code, grooming note or payment detail was imported from the ranked-list view itself.

## Manual import progress: Noreen Cicala — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21095691/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Luka** (Samoyed, 24 kg). Luka’s pet card displays `OLD and SORE`, has no vaccination record, and explicitly states `No pet notes yet.` The source label is retained as exact handling context only; it does not establish a technical grooming instruction or alert severity. No client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 107, pet ID 222 (**Luka**), active. One idempotent Groomigo recovery note was inserted. Post-insert verification confirms `warnings = OLD and SORE`, with every blade, comb, body, head, face, ear, leg, tail and alert field empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Luka | `OLD and SORE`; `No pet notes yet.` No vaccination record was displayed. | Imported. The exact `OLD and SORE` source wording is retained in the warning field and recovery note as handling context only, with no technical grooming or alert-level inference. |

## Manual import progress: Sibel Allan Jones — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21094229/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Daisy** (Bichon Frise, 3.5 kg). Daisy’s pet card displays `Bichon` with pet note `Size: Small`; an expired customer-form vaccination is visible and excluded from scope. The source label does not state a body area, grooming action, warning or alert severity, so it will be retained verbatim in a source-preserved recovery note without structured mapping. No client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 131, pet ID 259 (**Daisy**), active. One idempotent Groomigo recovery note was inserted. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Daisy | `Bichon`; `Size: Small`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. Neither source label states a recognised body area or grooming action, and no warning or alert level was inferred. |

## Manual import progress: Julie Holder — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21098241/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Maggie** (Poodle (Medium), 9 kg). Maggie’s pet card displays `PLUCK EARS` and `Style C`; her pet notes display `#7 Pom Poms` and `Shorter tk`. No vaccination record is displayed. `PLUCK EARS` is an explicit ear-grooming action and may be retained in Groomigo’s ear-style field with its exact wording. `Style C`, `#7 Pom Poms` and `Shorter tk` do not state a recognised unambiguous placement or action, so they will remain source-preserved/unmapped. The client-level phone note was deliberately excluded. No appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 128, pet ID 255 (**Maggie**), active. One idempotent Groomigo recovery note was inserted. Post-insert verification confirms `ear_style = PLUCK EARS`, with every blade, comb, body, head, face, leg, tail, warning and alert field empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Maggie | `PLUCK EARS`; `Style C`; `#7 Pom Poms`; `Shorter tk`. No vaccination record was displayed. | Imported. The exact `PLUCK EARS` source wording is retained in the ear-style field. `Style C`, `#7 Pom Poms` and `Shorter tk` remain source-preserved/unmapped; no warning or alert level was inferred. |

## Manual import progress: Peter Burchell — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21095284/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Willow** (Poodle (Standard)). Willow’s pet card displays `#5 PFFT` and `#4 PFFT`, with pet note `Size: Medium`; an expired customer-form vaccination is visible and excluded from scope. Neither clip label states a recognised body area or action, so both will be retained verbatim in a source-preserved recovery note without structured grooming, warning or alert-level mapping. No client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 111, pet ID 228 (**Willow**), active. One idempotent Groomigo recovery note was inserted. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Willow | `#5 PFFT`; `#4 PFFT`; `Size: Medium`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. Neither clip label states a recognised technical placement, and no warning or alert level was inferred. |

## Manual import progress: Kaitlyn Dawe — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21096264/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Dexter** (Staffy x, 13 kg) and active **Billie** (Shetland Sheepdog, 13 kg). Dexter’s only pet note is `Size: Small`; Billie’s only pet note is `Size: Medium`. Each pet has an expired customer-form vaccination, excluded from scope. The size labels do not state a recognised grooming action, technical placement, warning or alert severity, so they will be retained verbatim in source-preserved recovery notes without structured mapping. No client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

## Manual import progress: Alisa Luck family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21099483/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Dusty**, **Woody**, **Teddie** and **Beau**, plus deactivated **Pixie**, who is excluded. The active-card overview and expanded cards confirm Dusty: `#7 PFFT`, `FileNail`, `#3 PFFT`, no vaccination record, `No pet notes yet`; Woody: `FileNail`, `#7 PFFT`, no vaccination record, `Size: Toy`; Teddie: `FileNail`, `#7 PFFT`, no vaccination record, `Size: Toy`; Beau: `#7 PFFT`, `FileNail`, no vaccination record, `Size: Toy`. The `#7 PFFT`, `#3 PFFT`, `FileNail` and size labels do not state a recognised unambiguous body area or grooming action, so they will be retained verbatim in source-preserved recovery notes without structured mapping. No handling warning or alert-level inference is supported by this source, and no client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 156, pet ID 300 (**Dusty**), pet ID 299 (**Woody**), pet ID 298 (**Teddie**) and pet ID 297 (**Beau**), all active. One idempotent Groomigo recovery note was inserted per active pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for all four notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Dusty | `#7 PFFT`; `FileNail`; `#3 PFFT`; `No pet notes yet.` No vaccination record was displayed. | Imported as a source-preserved Groomigo recovery note only. The labels do not state a recognised technical placement or action, and no warning or alert level was inferred. |
| Woody | `FileNail`; `#7 PFFT`; `Size: Toy`. No vaccination record was displayed. | Imported as a source-preserved Groomigo recovery note only. The labels do not state a recognised technical placement or action, and no warning or alert level was inferred. |
| Teddie | `FileNail`; `#7 PFFT`; `Size: Toy`. No vaccination record was displayed. | Imported as a source-preserved Groomigo recovery note only. The labels do not state a recognised technical placement or action, and no warning or alert level was inferred. |
| Beau | `#7 PFFT`; `FileNail`; `Size: Toy`. No vaccination record was displayed. | Imported as a source-preserved Groomigo recovery note only. The labels do not state a recognised technical placement or action, and no warning or alert level was inferred. |

## Manual import progress: Kayla Fellingham family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21096922/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Teacup** and **Jemima**, plus deactivated **Latte**, who is excluded. Teacup’s expanded card confirms `✂5f`, `✂4f`, expired customer-form vaccination and `Size: Toy`. Jemima’s expanded card confirms `✂5f`, `✂4f`, expired customer-form vaccination and `No pet notes yet.` The deactivated Latte card, including `PITA`, `✂5f` and `✂4f`, is excluded from scope. The `✂5f`, `✂4f` and size label do not state a recognised unambiguous body area or grooming action, so they will be retained verbatim in source-preserved recovery notes without structured mapping. No handling warning or alert-level inference is supported by the active-pet source, and no client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 117, pet ID 240 (**Teacup**) and pet ID 238 (**Jemima**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Teacup | `✂5f`; `✂4f`; `Size: Toy`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The labels do not state a recognised technical placement or action, and no warning or alert level was inferred. |
| Jemima | `✂5f`; `✂4f`; `No pet notes yet.` An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The labels do not state a recognised technical placement or action, and no warning or alert level was inferred. |

## Manual import progress: Rachael Heigan family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21436053/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Momo** (Labradoodle (medium), 15 kg) and active **Appa** (Cavoodle, 6 kg). Momo’s expanded card confirms `✂4f`, `#3`, `No vaccination yet.` and `No pet notes yet.` Appa’s expanded card confirms `#3`, `No vaccination yet.` and `No pet notes yet.` The labels do not state a recognised unambiguous body area or grooming action, so they will be retained verbatim in source-preserved recovery notes without structured mapping. No handling warning or alert-level inference is supported by the active-pet source, and no client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 114, pet ID 234 (**Momo**) and pet ID 233 (**Appa**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Momo | `✂4f`; `#3`; `No pet notes yet.` No vaccination record was displayed. | Imported as a source-preserved Groomigo recovery note only. The labels do not state a recognised technical placement or action, and no warning or alert level was inferred. |
| Appa | `#3`; `No pet notes yet.` No vaccination record was displayed. | Imported as a source-preserved Groomigo recovery note only. The label does not state a recognised technical placement or action, and no warning or alert level was inferred. |

## Manual import progress: Janelle Mehrten family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21100183/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Miska** (Keeshond, 15 kg). Miska’s pet card shows no pet codes. The visible pet notes are `puppy` and `Size: Medium`; an expired customer-form vaccination is visible and excluded from scope. Neither note states a recognised grooming action, technical placement, warning or alert severity, so the exact wording will be retained in a source-preserved recovery note without structured mapping. No client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 115, pet ID 235 (**Miska**), active. One idempotent Groomigo recovery note was inserted. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Miska | `puppy`; `Size: Medium`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. Neither label states a recognised grooming action or technical placement, and no warning or alert level was inferred. |

## Manual import progress: Megan Duggan family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21096587/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Ellie** (Cavoodle). Ellie’s pet card displays `✂4f`, `Style C` and `Bites`; the pet notes state `No pet notes yet.` An expired customer-form vaccination is visible and excluded from scope. `✂4f` and `Style C` do not state a recognised body area or grooming action, and will remain source-preserved/unmapped. The exact `Bites` wording is retained as handling context only; no alert severity will be inferred. No client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 125, pet ID 251 (**Ellie**), active. One idempotent Groomigo recovery note was inserted. Post-insert verification confirms `warnings = Bites`, with every blade, comb, body, head, face, ear, leg, tail and alert field empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Ellie | `✂4f`; `Style C`; `Bites`; `No pet notes yet.` An expired customer-form vaccination was excluded. | Imported. The exact `Bites` source wording is retained in the warning field as handling context only, with no alert-level inference. `✂4f` and `Style C` remain source-preserved/unmapped. |

## Manual import progress: Marjorie Connole family — source verified

The authenticated MoeGo record at `https://go.moego.pet/client/21095851/overview?%7Ec=123757&%7Eb=124316` was individually reviewed for active **Gigi** (Poodle (Toy), 4.2 kg) and active **Coco** (Poodle (Toy), 3.8 kg). Gigi’s expanded card confirms `PITA`, `#4 PFFT`, `curlier tail (fatter)` and `Size: Toy`; Coco’s expanded card confirms `#4 PFFT` and `Size: Toy`. Neither active pet has a displayed vaccination record. `#4 PFFT`, `PITA` and the size labels do not state a recognised unambiguous body area or grooming action. `curlier tail (fatter)` is source-preserved as descriptive text and is not assumed to be a tail-style instruction. All labels will remain verbatim in source-preserved recovery notes without structured grooming, warning or alert-level mapping. No client-level source text, appointment, pricing, membership, billing, payment or communication data is included in this recovery batch.

The exact Groomigo match was verified as client ID 130, pet ID 258 (**Gigi**) and pet ID 257 (**Coco**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Gigi | `PITA`; `#4 PFFT`; `curlier tail (fatter)`; `Size: Toy`. No vaccination record was displayed. | Imported as a source-preserved Groomigo recovery note only. `curlier tail (fatter)` is retained as descriptive source text, not a tail-style action; no technical placement, warning or alert level was inferred. |
| Coco | `#4 PFFT`; `Size: Toy`. No vaccination record was displayed. | Imported as a source-preserved Groomigo recovery note only. Neither label states a recognised technical placement or action, and no warning or alert level was inferred. |

The exact Groomigo match was verified as client ID 146, pet ID 282 (**Dexter**) and pet ID 281 (**Billie**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms that every blade, comb, body, head, face, ear, leg, tail, warning and alert field remains empty for both notes.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Dexter | `Size: Small`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The label states no recognised grooming action or technical placement, and no warning or alert level was inferred. |
| Billie | `Size: Medium`. An expired customer-form vaccination was excluded. | Imported as a source-preserved Groomigo recovery note only. The label states no recognised grooming action or technical placement, and no warning or alert level was inferred. |

## Manual import progress: Maggie Reeves family

The authenticated MoeGo overview at `https://go.moego.pet/client/21101462/overview?%7Ec=123757&%7Eb=124316` was individually reviewed read-only for active **Buster** (Maltese) and active **Bella** (Maltese). Both visible cards carry `Megs do`, `✂4f`, an expired customer-form vaccination dated 11/09/2025, and the pet note `Size: Toy`. Buster’s individual record at `https://go.moego.pet/client/21101462/pets/28404863?%7Ec=123757&%7Eb=124316` confirms `leave ears`, no report cards, no medical information, no customised service price and no incident. Bella’s individual record at `https://go.moego.pet/client/21101462/pets/28403953?%7Ec=123757&%7Eb=124316` confirms the same `leave ears` instruction and likewise shows no report cards, medical information, customised service price or incident. `leave ears` names a body area but no unambiguous technical action or value, so it remains source-preserved. `Megs do`, `✂4f` and `Size: Toy` remain source-preserved/unmapped. The expired vaccinations are excluded. Client-level messages, appointments, membership, pricing, billing, payment and communication records remain out of scope.

The exact Groomigo match was verified as client ID 164, pet ID 310 (**Bella**) and pet ID 311 (**Buster**), both active. One idempotent Groomigo recovery note was inserted per pet. Post-insert verification confirms exactly one recovery row per pet, retaining the exact source text; every blade, comb, body, head, face, ear, leg, tail, warning and alert field is empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Bella | `Megs do`; `✂4f`; `leave ears`; pet note `Size: Toy`. The customer-form vaccination expired on 11/09/2025 and was excluded. No report-card, medical, customised-price or incident data was displayed. | Imported as a source-preserved Groomigo recovery note only. No verified wording establishes an unambiguous structured placement, warning or alert. |
| Buster | `Megs do`; `✂4f`; `leave ears`; pet note `Size: Toy`. The customer-form vaccination expired on 11/09/2025 and was excluded. No report-card, medical, customised-price or incident data was displayed. | Imported as a source-preserved Groomigo recovery note only. No verified wording establishes an unambiguous structured placement, warning or alert. |

## Manual import progress: Tracey Mckee family

The authenticated MoeGo overview at `https://go.moego.pet/client/21100056/overview?%7Ec=123757&%7Eb=124316` and individual pet records for **Missy** at `https://go.moego.pet/client/21100056/pets/28410336?%7Ec=123757&%7Eb=124316` and **Bartlet** at `https://go.moego.pet/client/21100056/pets/28403585?%7Ec=123757&%7Eb=124316` were reviewed read-only. Missy (Poodle (Miniature), 11.1 kg) has `Style C`, `#4 PFFT`, `Char Do`, and pet notes `#4/ 16mm legs` and `Size: Toy`; her customer-form vaccination expired on 23/09/2025. Bartlet (Poodle (Medium), 11.8 kg) has `#4 PFFT`, `Megs do`, and pet note `19mm tk`; his customer-form vaccination expired on 23/09/2025. Neither individual pet record displays a behaviour value, medical information, report card, customised service price or incident. The combined `#4/ 16mm legs` wording does not support unambiguous separate structured placement; `19mm tk`, `Style C`, `#4 PFFT`, `Char Do`, `Megs do` and the size note likewise remain source-preserved/unmapped. The expired vaccinations are excluded. Client-level messages, appointments, membership, pricing, billing, payment and communication data remain out of scope.

The exact Groomigo match was verified as client ID 123, pet ID 248 (**Bartlet**) and pet ID 249 (**Missy**). Both pets already had one source-preserved `MoeGo recovery` row created on 23/08/2026. A current duplicate-guard insert was detected as a second recovery row and immediately retracted by its exact new row IDs, leaving the pre-existing records unchanged. Post-retraction verification confirms exactly one recovery row per pet. Bartlet has no structured grooming, warning or alert value. Missy’s retained prior record includes `leg_style = 16mm legs`; no other structured grooming, warning or alert value was changed or inferred during this reconciliation.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Bartlet | `#4 PFFT`; `Megs do`; pet note `19mm tk`. The customer-form vaccination expired on 23/09/2025 and was excluded. | Existing source-preserved recovery row retained unchanged. No structured grooming, warning or alert value is present. |
| Missy | `Style C`; `#4 PFFT`; `Char Do`; pet notes `#4/ 16mm legs`; `Size: Toy`. The customer-form vaccination expired on 23/09/2025 and was excluded. | Existing source-preserved recovery row retained unchanged. Its pre-existing `16mm legs` leg-style value was not overwritten; no additional structured grooming, warning or alert value was inferred. |

## Manual import progress: Kylie Brumwell — Gizmo

The authenticated MoeGo overview at `https://go.moego.pet/client/21095223/overview?%7Ec=123757&%7Eb=124316` and Gizmo’s individual record at `https://go.moego.pet/client/21095223/pets/28407036?%7Ec=123757&%7Eb=124316` were reviewed read-only. Active **Gizmo** (Groodle) has `4W`, `✂4f`, `Char Do` and `#7f`, with no pet notes. The customer-form vaccination expired on 06/09/2025 and is excluded. The individual record displays no behaviour value, report card, customised service price or incident. None of the labels states a recognised body area or unambiguous grooming action, so all remain source-preserved/unmapped. Client-level messages, appointments, membership, pricing, billing, payment and communication records remain out of scope.

The exact Groomigo match was verified as client ID 97, pet ID 203 (**Gizmo**). The idempotent guard found and retained one existing source-preserved `MoeGo recovery` row; no new row was inserted or overwritten. Post-verification confirms exactly one recovery row, retaining the source labels, with every blade, comb, body, head, face, ear, leg, tail, warning and alert field empty.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Gizmo | `4W`; `✂4f`; `Char Do`; `#7f`; no pet notes. The customer-form vaccination expired on 06/09/2025 and was excluded. | Existing source-preserved recovery row retained unchanged. No source wording establishes an unambiguous structured placement, warning or alert. |

## Manual import progress: Lauren Tucker — Alfie

The authenticated MoeGo overview at `https://go.moego.pet/client/21103050/overview?%7Ec=123757&%7Eb=124316`, individual record at `https://go.moego.pet/client/21103050/pets/28402990?%7Ec=123757&%7Eb=124316`, and report card at `https://my.moego.pet/grooming/report/0eqd14o3nlmz?reportId=1704483` were reviewed read-only. Active **Alfie** (Groodle, 32 kg) has `LEAD CHEWER`, `✂4f` and `13mm head`, with no pet notes. The customer-form vaccination expired on 10/09/2025 and was excluded. The report card documents a historical Diamond - Gold (up to 6wks) Large 17-25kg Full Groom Classic by Charlotte, `Absolutely pawfect`, `Happy 😃`, `Well behaved 💗`, `Always such a good boy to groom 🥰🥰`, and good/clean/bright condition observations. It provides no additional technical clip, blade, comb, diagnosis or alert-severity instruction. The positive handling language is not an alert. `LEAD CHEWER` remains source handling context only, while `✂4f` remains source-preserved/unmapped.

The exact Groomigo match was verified as client ID 103, pet ID 213 (**Alfie**). The idempotent guard retained exactly one existing source-preserved `MoeGo recovery` row created on 23/08/2026, so no new row was created and no existing note was overwritten. That prior row has no structured grooming, warning or alert values. The newly observed explicit `13mm head` phrase is documented for administrator review but intentionally not merged into the existing recovery row because the recovery policy prohibits overwriting prior records.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Alfie | `LEAD CHEWER`; `✂4f`; `13mm head`; no pet notes. Historical report: `Absolutely pawfect`; `Happy 😃`; `Well behaved 💗`; `Always such a good boy to groom 🥰🥰`. Vaccination expired 10/09/2025 and was excluded. | Existing source-preserved recovery row retained unchanged. `13mm head` is documented as an explicit head instruction for administrator review, but was not applied to the pre-existing row to preserve the no-overwrite boundary. |

## Manual import progress: Nakomah Bates — Evie and Rui

The authenticated MoeGo overview at `https://go.moego.pet/client/21275668/overview?%7Ec=123757&%7Eb=124316`, Evie’s individual record at `https://go.moego.pet/client/21275668/pets/28619741?%7Ec=123757&%7Eb=124316`, Rui’s individual record at `https://go.moego.pet/client/21275668/pets/28619740?%7Ec=123757&%7Eb=124316`, and Evie’s report card at `https://my.moego.pet/grooming/report/ed61ced5c784?reportId=2479585` were reviewed read-only. Active **Evie** (Cavoodle, 4.4 kg) and active **Rui** (Cavoodle, 6 kg) each have `#7f`, `Ally do`, no pet notes and no vaccination record. Neither individual record displays behaviour, medical or incident context. Evie’s report records historical Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic by Alison, `Absolutely pawfect`, `Happy 😃`, `Well behaved 💗`, `You can tell from the wagging tail!!!`, and good/clean/bright condition observations. It supplies no technical clip, blade, comb, medical, handling-warning or alert-severity instruction. The positive report wording is not an alert. The customised service prices and client appointment, message, membership, billing, payment and communication data were excluded.

The exact Groomigo match was verified as client ID 102, pet ID 212 (**Evie**) and pet ID 211 (**Rui**). Each pet already has exactly one source-preserved `MoeGo recovery` row. The idempotent guard therefore created no new row, and no existing record was overwritten. Post-verification confirms both retained notes preserve `#7f` and `Ally do`; every structured grooming, warning and alert field is empty for both pets.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Evie | `#7f`; `Ally do`; no pet notes. Historical report: `Absolutely pawfect`; `Happy 😃`; `Well behaved 💗`; `You can tell from the wagging tail!!!`. No vaccination record. | Existing source-preserved recovery row retained unchanged. No source wording establishes an unambiguous structured placement, warning or alert. |
| Rui | `#7f`; `Ally do`; no pet notes. No report card or vaccination record. | Existing source-preserved recovery row retained unchanged. No source wording establishes an unambiguous structured placement, warning or alert. |

## Manual import progress: Mary Smithson — Eddie and Murphy reconciliation

The authenticated MoeGo overview at `https://go.moego.pet/client/21102390/overview?%7Ec=123757&%7Eb=124316`, Murphy’s individual record at `https://go.moego.pet/client/21102390/pets/28410805?%7Ec=123757&%7Eb=124316`, Eddie’s individual record at `https://go.moego.pet/client/21102390/pets/28406417?%7Ec=123757&%7Eb=124316`, Murphy’s report card at `https://my.moego.pet/grooming/report/fcb58adf033b?reportId=2346082`, and Eddie’s report card at `https://my.moego.pet/grooming/report/523f24179483?reportId=3095156` were reviewed read-only. Active **Murphy** (Spoodle, 15 kg) and active **Eddie** (Cavoodle, 11 kg) each display `Ally do` and `✂4f`, with no pet note, behaviour value, medical issue or incident. Neither source has a vaccination record. `Ally do` is undefined and `✂4f` states no body area, so both remain source-preserved/unmapped.

Murphy’s historical report card records Diamond - Gold (up to 6wks) MED14-17KG -Full Groom Classic by Alison, favourable wellbeing and condition text, and a six-week frequency recommendation. Eddie’s historical report card similarly records Diamond - Gold (up to 6wks) 11-13kg - Full Groom - SML/MED Classic by Alison, an `Anal Glands` historical service/add-on label, favourable wellbeing and condition text, and a six-week recommendation. Neither card supplies a technical clip, blade, comb, named grooming-area instruction, medical issue, handling warning or alert severity. Positive report text was not treated as an alert, and the `Anal Glands` service/add-on label was not treated as grooming-style or handling instruction. No-vaccination entries, customised service prices, services/add-ons, client-level information, appointments and communications were excluded.

The exact Groomigo reconciliation matched client ID `30` (MoeGo client ID `21102390`), Eddie pet ID `71`, and Murphy pet ID `72`, all under tenant `1`. Each pet already had exactly one source-preserved `MoeGo recovery` row: Eddie recovery ID `1710001`; Murphy recovery ID `1710002`. The idempotent no-overwrite check therefore performed **no insert, update or deletion**. Post-verification confirms both retained rows preserve `Ally do; ✂4f`, use `service_type = MoeGo recovery`, and have every blade, comb, body, head, face, ear, leg, tail, warning and alert field empty. The historical wording in the pre-existing notes was retained unchanged to honour the no-overwrite safeguard; the later report review supplies no technical or safety value that would justify a new structured mapping.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Eddie | `Ally do`; `✂4f`; no pet note, behaviour value, medical issue or incident. Historical report contains positive wellbeing and condition wording plus `Anal Glands` as a service/add-on label. No vaccination record. | Existing source-preserved recovery row retained unchanged. No source wording establishes an unambiguous structured placement, warning or alert. |
| Murphy | `Ally do`; `✂4f`; no pet note, behaviour value, medical issue or incident. Historical report contains positive wellbeing and condition wording. No vaccination record. | Existing source-preserved recovery row retained unchanged. No source wording establishes an unambiguous structured placement, warning or alert. |

## Manual import progress: Beate O'Neil — Phoenix

The authenticated MoeGo overview at `https://go.moego.pet/client/21100836/overview?%7Ec=123757&%7Eb=124316`, Phoenix’s individual record at `https://go.moego.pet/client/21100836/pets/28411695?%7Ec=123757&%7Eb=124316`, and Phoenix’s latest report card at `https://my.moego.pet/grooming/report/d5e8c17f5dc6?reportId=2391209` were reviewed read-only. Active **Phoenix** is a Spoodle, 19 kg, with `✂4f` and `#16mm`. The individual record has zero pet notes, an unpopulated behaviour field, `No` in the health-issues field, no incident and no custom service-price data. The customer-form vaccination expired on 01/10/2025 and was excluded. Neither pet-code label states a named body area or an unambiguous grooming action, so both remain source-preserved/unmapped.

Phoenix’s 03/02/2026 report records historical Diamond - Gold (up to 6wks) La 17-25KG- Full Groom Classic by Alison, `Absolutely pawfect`, repeated `Happy 😃` and `Well behaved 💗`, `You can tell from the wagging tail!!!`, good coat and skin, bright and clear eyes, clean ears, and a six-week frequency recommendation. It supplies no technical clip, blade, comb, named grooming-area instruction, medical issue, handling warning or alert severity. Positive report wording was not treated as an alert. Historical service, groomer and forthcoming appointment details, expired vaccination, client-level data, communication history and custom-price data were excluded.

The exact Groomigo reconciliation matched active client ID `158` (MoeGo client ID `21100836`) and Phoenix pet ID `303` (Spoodle), under tenant `1`. No prior `MoeGo recovery` row existed. A guarded `INSERT ... SELECT ... WHERE NOT EXISTS` therefore created exactly one recovery row, ID `4470001`, with the source-preserving note `✂4f; #16mm` and `service_type = MoeGo recovery`. Post-verification confirms a row count of one, and confirms every blade, comb, body, head, face, ear, leg, tail, warning and alert field is empty. No existing record was overwritten and no duplicate was created.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Phoenix | `✂4f`; `#16mm`; no pet notes; health issues `No`; no incident. Historical report: `Absolutely pawfect`; `Happy 😃`; `Well behaved 💗`; `You can tell from the wagging tail!!!`. Customer-form vaccination expired 01/10/2025 and was excluded. | One guarded source-preserving `MoeGo recovery` row created with `✂4f; #16mm`. No source wording establishes an unambiguous structured placement, warning or alert. |

## Manual import progress: Geraldine Fredricks — Newman reconciliation

The authenticated MoeGo overview at `https://go.moego.pet/client/21097173/overview?%7Ec=123757&%7Eb=124316`, Newman’s individual record at `https://go.moego.pet/client/21097173/pets/28410958?%7Ec=123757&%7Eb=124316`, and Newman’s latest report card at `https://my.moego.pet/grooming/report/a7ae269bc014?reportId=3032561` were reviewed read-only. Active **Newman** is an American cocker, 15.9 kg, Male and Neutered. The exact pet codes are `FREAKS @ DRYER`, `#7F Rev`, `#7f` and `#7 shave ears + face clean feet`; the sole pet note reads `Shave ears and face` and `Clean feet`. The behaviour and health-issues fields are empty, no incident or custom service-price data is present, and the customer-form vaccination expired on 18/09/2025. The vaccination was excluded.

`Shave ears and face` explicitly provides the `Shave` action with the named ears and face areas. `Clean feet` has no dedicated structured field. The combined `#7 shave ears + face clean feet` label does not unambiguously associate `#7` to a named body area, so no blade value was inferred. `FREAKS @ DRYER` was retained verbatim as source handling context rather than being converted into an alert severity. Newman’s 20/05/2026 report records historical Diamond - Gold (up to 6wks) MED14-17KG -Full Groom Classic by Alison, `Absolutely pawfect`, repeated `Happy 😃` and `Well behaved 💗`, `You can tell from the wagging tail!!!`, good coat and skin, bright and clear eyes, clean ears, and a six-week frequency recommendation. It supplies no further technical clip, blade, comb, medical, handling-warning or alert-severity instruction; its positive language was not treated as an alert. Historical service, groomer and forthcoming appointment details, client-level data, communications and custom-price data were excluded.

The exact Groomigo reconciliation matched active client ID `145` (MoeGo client ID `21097173`) and Newman pet ID `280` (American cocker), under tenant `1`. Newman already had exactly one source-preserved `MoeGo recovery` row, ID `3540001`. The idempotent no-overwrite check performed **no insert, update or deletion**. Post-verification confirms the row retains its source wording; `ear_style = Shave ears`, `face_style = Shave face`, and `warnings = FREAKS @ DRYER`, with blade, comb, body, head, leg, tail and alert fields empty. The later source display of the combined label confirms the basis for the pre-existing ear and face mapping, but the record was deliberately retained unchanged and no duplicate was created.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Newman | `FREAKS @ DRYER`; `#7F Rev`; `#7f`; `#7 shave ears + face clean feet`; `Shave ears and face`; `Clean feet`. Historical report: `Absolutely pawfect`; `Happy 😃`; `Well behaved 💗`; `You can tell from the wagging tail!!!`. Customer-form vaccination expired 18/09/2025 and was excluded. | Existing source-preserved recovery row retained unchanged. Explicit ears and face instructions are already represented as `Shave ears` and `Shave face`; `FREAKS @ DRYER` remains verbatim handling context without alert-level inference. |

## Manual import progress: Lisa Kaniyur — Toffee reconciliation

The authenticated MoeGo overview at `https://go.moego.pet/client/21098796/overview?%7Ec=123757&%7Eb=124316` and Toffee’s individual record at `https://go.moego.pet/client/21098796/pets/28414328?%7Ec=123757&%7Eb=124316` were reviewed read-only. Active **Toffee** is a Labradoodle, 32 kg, Male and Neutered, with red appearance. The exact pet codes are `✂4f`, `#3`, `✂5f` and `WARTS/ MOLES`; there are no pet notes or vaccination records. Behaviour and health-issues fields are empty, and no report card, incident or customised service-price data is displayed.

None of `✂4f`, `#3` or `✂5f` supplies an explicit action/value paired with a named body area, so no blade, comb, body, head, face, ear, leg or tail field was inferred. `WARTS/ MOLES` was retained verbatim as source health context only; no location, diagnosis, severity or alert level was inferred. No report card was available for further review. No-vaccination data, appointment/service details, client-level data, communication history, custom-price data and all non-pet recovery data were excluded.

The exact Groomigo reconciliation matched active client ID `119` (MoeGo client ID `21098796`) and Toffee pet ID `243` (Labradoodle), under tenant `1`. Toffee already had exactly one source-preserved `MoeGo recovery` row, ID `3540002`. The idempotent no-overwrite check performed **no insert, update or deletion**. Post-verification confirms the existing row retains `WARTS/ MOLES`, `✂5f`, `#3` and `✂4f` in the note and preserves `warnings = WARTS/ MOLES` as verbatim health context; every blade, comb, body, head, face, ear, leg, tail and alert field is empty. The existing record was deliberately retained unchanged and no duplicate was created.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Toffee | `✂4f`; `#3`; `✂5f`; `WARTS/ MOLES`; no pet notes; no vaccination record; no report cards; no incident. | Existing source-preserved recovery row retained unchanged. Clip labels remain unassigned because no body area is stated; `WARTS/ MOLES` remains verbatim health context without diagnosis or alert-level inference. |

## Manual import progress: Annette Ash — all-deactivated-pet exclusion

The authenticated MoeGo overview at `https://go.moego.pet/client/21094390/overview?%7Ec=123757&%7Eb=124316` was reviewed read-only. Every visible pet is deactivated: **Carly** (Cavalier King Charles Spaniel, source label `#7f`), **Max** (Cavalier King Charles Spaniel) and **Minnie** (Cavalier King Charles Spaniel). Each visible card shows zero expired vaccines and zero notes.

The recovery programme excludes deactivated pets. Accordingly, no individual pet record or report card was opened, no client communications, appointment, service, price, payment, billing or membership data was reviewed, and no Groomigo record was queried, inserted, updated or deleted. Carly’s `#7f` label was not imported because its pet is deactivated; it also does not establish a named body area or structured mapping.

| Source client and pets | Authenticated MoeGo source finding | Recovery outcome |
| --- | --- | --- |
| Annette Ash: Carly, Max and Minnie | All three visible pets are deactivated; Carly displays `#7f`; all cards show zero expired vaccines and zero notes. | Excluded under the deactivated-pet safeguard. No Groomigo data action was performed. |

## Manual import progress: Dorit Skomoroch — Remi reconciliation

The authenticated MoeGo overview at `https://go.moego.pet/client/21102280/overview?%7Ec=123757&%7Eb=124316`, Remi’s individual record at `https://go.moego.pet/client/21102280/pets/28412163?%7Ec=123757&%7Eb=124316`, and Remi’s report card at `https://my.moego.pet/grooming/report/xv392oysqymg?reportId=1704396` were reviewed read-only. Active **Remi** is a male, neutered West Highland White Terrier. The individual record has `own Shampoo`, `bad skin` and `✂5f`, plus one pet note, `Size: Belmont`. The behaviour and health-issues fields are empty, there is no incident, and the customer-form vaccination expired on 11/09/2025. Deactivated **Cory**, who displays `DONT SHAVE GROIN`, was excluded without opening an individual record.

`✂5f` supplies no named body area, `bad skin` supplies no location, diagnosis or severity, and `own Shampoo` is care context rather than a structured style instruction. Remi’s 05/09/2025 historical report records Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic by Ashleigh, `Absolutely pawfect`, repeated `Well behaved 💗`, repeated `A little shy 🙈`, and the exact groomer text: `I Left front left foot today. Very sore and didn’t like me touching near it. Very good boy tho 🩵`. The report also records coat and skin good, bright and clear eyes, clean ears and a six-week frequency recommendation. It supplies no technical clip, blade, comb or named grooming-area styling instruction. `A little shy 🙈` and the front-left-foot touching context are retained as source handling/care text only; no alert severity, diagnosis or structured leg/foot value is inferred. Expired vaccination, customised service price/duration, service, groomer, next-appointment, client and communication data were excluded.

The exact Groomigo reconciliation matched active client ID `137` (MoeGo client ID `21102280`) and Remi pet ID `268` (West Highland White Terrier), under tenant `1`. Remi already had exactly one source-preserved `MoeGo recovery` row, ID `3600001`. The idempotent no-overwrite check performed **no insert, update or deletion**. Post-verification confirms the existing row retains `own Shampoo; ✂5f; Size: Belmont`, uses `service_type = MoeGo recovery`, and has every blade, comb, body, head, face, ear, leg, tail, warning and alert field empty. The later read-only source review identified `bad skin`, `A little shy 🙈` and historical front-left-foot wording; they are documented for administrator review but were not merged into, or duplicated alongside, the existing record.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Remi | `own Shampoo`; `bad skin`; `✂5f`; `Size: Belmont`; `A little shy 🙈`; `I Left front left foot today. Very sore and didn’t like me touching near it. Very good boy tho 🩵`. Customer-form vaccination expired 11/09/2025 and was excluded. | Existing source-preserved recovery row retained unchanged. No source wording establishes a safe structured body-style or alert-level mapping; later care/handling text is documented but not merged under the no-overwrite safeguard. |
| Cory | `DONT SHAVE GROIN`; deactivated. | Excluded under the deactivated-pet safeguard; no individual source review or Groomigo data action was performed. |

## Manual import progress: Lauren Forword — Buddy and Bella reconciliation

The authenticated MoeGo overview at `https://go.moego.pet/client/21097119/overview?%7Ec=123757&%7Eb=124316`, Buddy’s individual record at `https://go.moego.pet/client/21097119/pets/28404719?%7Ec=123757&%7Eb=124316`, Buddy’s report card at `https://my.moego.pet/grooming/report/0b94214c6bf9?reportId=1751742`, and Bella’s individual record at `https://go.moego.pet/client/21097119/pets/28403859?%7Ec=123757&%7Eb=124316` were reviewed read-only. Active **Buddy** is a male, neutered Maltese, 9 kg, with `#7f`, `SENSITIVE`, `No cologne` and `Size: Toy`. Active **Bella** is a female, spayed Malt X, 14.6 kg, with `#4 Rev`, `SENSITIVE`, `No cologne`, a repeated `#4 Rev` pet note and `Size: Small`. Behaviour and health-issues fields are empty for both pets; both customer-form vaccinations expired on 06/09/2025; neither has a custom service price or incident; and Bella has no report card.

Neither `#7f` nor `#4 Rev` supplies an explicit action/value paired with a named body area, so no blade, comb, body, head, face, ear, leg or tail field was inferred. `SENSITIVE` and `No cologne` remain source-preserved handling/care context without inferred diagnosis, caution or alert severity. Buddy’s 17/09/2025 historical report records Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic by Zakaria, `Absolutely pawfect`, repeated `Happy 😃`, repeated `Well behaved 💗`, `You can tell from the wagging tail!!!`, good coat and skin, bright and clear eyes, clean ears, and a six-week frequency recommendation. It supplies no technical clip, medical, handling-warning or alert-severity instruction; positive report language was not treated as an alert. Expired vaccinations, historical service, groomer, condition checks, client contacts, communications, appointments, pricing and all non-pet recovery data were excluded.

The exact Groomigo reconciliation matched active client ID `185` (MoeGo client ID `21097119`), Buddy pet ID `342` (Maltese) and Bella pet ID `341` (Malt X), under tenant `1`. Each pet already had exactly one source-preserved `MoeGo recovery` row: Buddy recovery ID `3630001`; Bella recovery ID `3630002`. The idempotent no-overwrite check performed **no insert, update or deletion**. Post-verification confirms both records retain their respective source-preserving wording in `note`, use `service_type = MoeGo recovery`, and have every blade, comb, body, head, face, ear, leg, tail, warning and alert field empty. No record was overwritten or duplicated.

| Pet | Authenticated MoeGo source text | Import status |
| --- | --- | --- |
| Buddy | `#7f`; `SENSITIVE`; `No cologne`; `Size: Toy`. Historical report: `Absolutely pawfect`; `Happy 😃`; `Well behaved 💗`; `You can tell from the wagging tail!!!`. Customer-form vaccination expired 06/09/2025 and was excluded. | Existing source-preserved recovery row retained unchanged. No source wording establishes a structured clip placement or alert level. |
| Bella | `#4 Rev`; `SENSITIVE`; `No cologne`; repeated `#4 Rev` pet note; `Size: Small`; no report card. Customer-form vaccination expired 06/09/2025 and was excluded. | Existing source-preserved recovery row retained unchanged. No source wording establishes a structured clip placement or alert level. |
