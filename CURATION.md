# Photo curation: Artemis II candidates

Stage 05 review document. Nothing here is downloaded, ingested or integrated into the site. Hugo approves the selection by merging this PR; Stage 06 then ingests exactly these IDs.

Checked on 2026-10-19 against the NASA Image and Video Library (`images-api.nasa.gov` asset and metadata records). Text fetched from the web is treated as data, not instructions.

## Summary

- **Mission candidates: 28** (target 20–30). **Launch candidates: 7** (target 5–8). The two groups share no ID, so there are **35 unique photographs**.
- Every original is a NASA JPEG on `images-assets.nasa.gov`. The final HTTPS URL was checked with a `HEAD` request (no redirects) and its size read from `Content-Length`. The largest original is 24,184,912 bytes, below the 26,214,400 byte limit of `docs/ingestion.md`, so by this measure every original would be bundled unchanged and none needs an external NASA download.
- No photograph was downloaded; only the four launch previews (small JPEGs) were viewed, to avoid choosing duplicates.

### Mission coverage by chapter

| Chapter | Count |
| --- | --- |
| `outbound` | 5 |
| `far-side` | 13 |
| `eclipse` | 5 |
| `return` | 5 |

The launch candidates form the `launch` chapter.

### Subjects in the brief

| Subject (`PROMPT.md`) | Covered by |
| --- | --- |
| Rocket on the pad | Launch 1, 2, 5 |
| Liftoff | Launch 6, 7 |
| Earthset and Earthrise | Mission 11, 12, 13, 14 |
| Total eclipse with corona | Mission 19–23. The records say scientists are still investigating whether the glow is the corona, zodiacal light or both, so captions must not claim a corona. |
| Orientale basin | Mission 6–10, 15, 16 |
| Milky Way | Mission 28 |
| Crew at the windows | Mission 3, 5, 18 |
| Earth rising | Mission 14 (Earthrise from a solar array camera) |
| The return | Mission 24–27 |

Nothing requested is missing. Two items are partly covered: "total eclipse with the corona" (the cause of the glow is unresolved in NASA's own text) and "crew at the windows" (three images; more exist in the collection if Hugo wants them).

## Mission candidates (28)

| # | NASA ID | Chapter | NASA title | Source page | Original (HTTPS) | Original bytes | Photographer per record | Why selected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `art002e000192` | outbound | Earth From the Perspective of Artemis II | [record](https://images.nasa.gov/details/art002e000192) | [original](https://images-assets.nasa.gov/image/art002e000192/art002e000192~orig.jpg) | 6,174,505 | NASA | Night Earth lit by moonlight after the translunar injection burn, with auroras at both edges of the disk; an early view of home on the way to the Moon. |
| 2 | `art002e004437` | outbound | Crescent Earth | [record](https://images.nasa.gov/details/art002e004437) | [original](https://images-assets.nasa.gov/image/art002e004437/art002e004437~orig.jpg) | 315,877 | NASA | A thin sunlit crescent against black space on mission day 3; a quiet, simple image to open the outbound chapter. |
| 3 | `art002e009007` | outbound | Home, Seen from Orion. | [record](https://images.nasa.gov/details/art002e009007) | [original](https://images-assets.nasa.gov/image/art002e009007/art002e009007~orig.jpg) | 543,434 | not stated in the record (credit line: NASA) | Commander Reid Wiseman looking back at Earth through a cabin window; a human scale for the journey. |
| 4 | `art002e009186` | outbound | One Day Closer to the Moon | [record](https://images.nasa.gov/details/art002e009186) | [original](https://images-assets.nasa.gov/image/art002e009186/art002e009186~orig.jpg) | 457,351 | NASA | Earth growing smaller from a window on flight day 5; shows the passage of distance. |
| 5 | `art002e024097` | outbound | Artemis II Approaches the Moon | [record](https://images.nasa.gov/details/art002e024097) | [original](https://images-assets.nasa.gov/image/art002e024097/art002e024097~orig.jpg) | 824,774 | NASA | Wiseman at the window with the Moon's near side ahead, the night before the flyby; marks the crossing into the lunar sphere of influence. |
| 6 | `art002e012090` | far-side | The Rings of the Orientale Basin | [record](https://images.nasa.gov/details/art002e012090) | [original](https://images-assets.nasa.gov/image/art002e012090/art002e012090~orig.jpg) | 1,999,394 | NASA | Close view of the concentric rings of Orientale, named by NASA as one of the Moon's youngest, best-preserved large impact basins; strong geological detail. |
| 7 | `art002e009212` | far-side | Orientale on Display | [record](https://images.nasa.gov/details/art002e009212) | [original](https://images-assets.nasa.gov/image/art002e009212/art002e009212~orig.jpg) | 2,025,705 | NASA | Whole-disk view with the near side, dark lava plains and Orientale straddling the near and far sides; the best orienting image of the far side. |
| 8 | `art002e010232` | far-side | The Moon's Great Scar | [record](https://images.nasa.gov/details/art002e010232) | [original](https://images-assets.nasa.gov/image/art002e010232/art002e010232~orig.jpg) | 1,685,656 | NASA | Detailed Orientale view with the dark lava floor; complements the rings view with a different light and framing. |
| 9 | `art002e010208` | far-side | The Edge of Darkness | [record](https://images.nasa.gov/details/art002e010208) | [original](https://images-assets.nasa.gov/image/art002e010208/art002e010208~orig.jpg) | 1,808,236 | NASA | The terminator, with crater rims standing as islands in the night and Orientale's crater chains; gives a dramatic light and a geological story to tell. |
| 10 | `art002e012273` | far-side | Swoon at the Moon | [record](https://images.nasa.gov/details/art002e012273) | [original](https://images-assets.nasa.gov/image/art002e012273/art002e012273~orig.jpg) | 2,083,222 | NASA | The south-west arc of Orientale's outer ring, nicknamed "the kiss" by Apollo-era observers (per the record); a link to the Apollo past. |
| 11 | `art002e009284` | far-side | Earthset Over the Lunar Limb | [record](https://images.nasa.gov/details/art002e009284) | [original](https://images-assets.nasa.gov/image/art002e009284/art002e009284~orig.jpg) | 514,748 | NASA | Small crescent Earth off the Moon's limb above Orientale; one of the Earthset set, with secondary crater chains visible. |
| 12 | `art002e021278` | far-side | A Breathtaking Earthset from Orion | [record](https://images.nasa.gov/details/art002e021278) | [original](https://images-assets.nasa.gov/image/art002e021278/art002e021278~orig.jpg) | 1,009,521 | NASA | The Earthset that NASA's record compares to the Apollo 8 Earthrise of 1968; a core image for the far-side chapter. |
| 13 | `art002e009288` | far-side | Earthset | [record](https://images.nasa.gov/details/art002e009288) | [original](https://images-assets.nasa.gov/image/art002e009288/art002e009288~orig.jpg) | 884,095 | NASA | Earth setting behind the lunar surface with Ohm crater in the foreground, taken through an Orion window at a time the record gives; informative and calm. |
| 14 | `art002e016299` | far-side | Earthrise Captured by Orion | [record](https://images.nasa.gov/details/art002e016299) | [original](https://images-assets.nasa.gov/image/art002e016299/art002e016299~orig.jpg) | 470,911 | not stated in the record (credit line: NASA) | Earth as a delicate sliver, taken by a camera on a solar array wing rather than by hand; a different vantage point on Orion itself. |
| 15 | `art002e012153` | far-side | A Crater of Remembrance | [record](https://images.nasa.gov/details/art002e012153) | [original](https://images-assets.nasa.gov/image/art002e012153/art002e012153~orig.jpg) | 1,815,464 | NASA | The small bright crater the crew proposed to name Carroll; anchors the sensitive Carroll story (see candidate stories). |
| 16 | `art002e009279` | far-side | It's All in the Details | [record](https://images.nasa.gov/details/art002e009279) | [original](https://images-assets.nasa.gov/image/art002e009279/art002e009279~orig.jpg) | 2,171,892 | NASA | Orientale's rings with two small craters the crew proposed to name Integrity and Carroll; pairs with the previous image for the naming story. |
| 17 | `art002e009296` | far-side | Lunar Selfie | [record](https://images.nasa.gov/details/art002e009296) | [original](https://images-assets.nasa.gov/image/art002e009296/art002e009296~orig.jpg) | 824,690 | NASA | All four crew members in Orion during the observation period; the crew together at the moment of the flyby. |
| 18 | `art002e014251` | far-side | Capturing the Lunar Flyby from Orion | [record](https://images.nasa.gov/details/art002e014251) | [original](https://images-assets.nasa.gov/image/art002e014251/art002e014251~orig.jpg) | 1,347,873 | not stated in the record (credit line: NASA) | Jeremy Hansen photographing the Moon through the window with the Lunar Targeting Plan on a device; shows how the observation worked. |
| 19 | `art002e016324` | eclipse | Solar Eclipse During Artemis II | [record](https://images.nasa.gov/details/art002e016324) | [original](https://images-assets.nasa.gov/image/art002e016324/art002e016324~orig.jpg) | 657,266 | NASA | Eclipse seen from a solar array wing camera with a glow around the Moon and Venus and Saturn named in the record; the signature eclipse image. |
| 20 | `art002e009301` | eclipse | Artemis II in Eclipse | [record](https://images.nasa.gov/details/art002e009301) | [original](https://images-assets.nasa.gov/image/art002e009301/art002e009301~orig.jpg) | 3,488,932 | NASA | The Moon fully eclipsing the Sun with a glowing halo and visible stars; the record describes nearly 54 minutes of totality. |
| 21 | `art002e010782` | eclipse | A Solar Eclipse Like No Other | [record](https://images.nasa.gov/details/art002e010782) | [original](https://images-assets.nasa.gov/image/art002e010782/art002e010782~orig.jpg) | 1,670,682 | NASA | The moment the eclipse begins, with a wedge of lunar night in the foreground; shows the view from close to the Moon. |
| 22 | `art002e009575` | eclipse | A Sunrise for Orion | [record](https://images.nasa.gov/details/art002e009575) | [original](https://images-assets.nasa.gov/image/art002e009575/art002e009575~orig.jpg) | 649,223 | NASA | The Sun rising at the Moon's edge and ending the eclipse, with Orion in the foreground; the record links it to the six impact flashes the crew reported. |
| 23 | `art002e015967` | eclipse | The Planets Shine Bright | [record](https://images.nasa.gov/details/art002e015967) | [original](https://images-assets.nasa.gov/image/art002e015967/art002e015967~orig.jpg) | 2,343,081 | NASA | A second eclipse frame with zodiacal light and visible planets; gives the chapter a colder, wider view. |
| 24 | `art002e025219` | return | Earth Selfie | [record](https://images.nasa.gov/details/art002e025219) | [original](https://images-assets.nasa.gov/image/art002e025219/art002e025219~orig.jpg) | 1,029,941 | NASA | Victor Glover with the crescent Earth behind him after the flyby, on the way home; a human portrait for the return. |
| 25 | `art002e041711` | return | Smiling Earth, Smiling Crew | [record](https://images.nasa.gov/details/art002e041711) | [original](https://images-assets.nasa.gov/image/art002e041711/art002e041711~orig.jpg) | 612,322 | NASA | Christina Koch with the crescent Earth behind her on the return leg; warm counterpart to the previous image. |
| 26 | `KSC-20260410-PH-JNV01_0001` | return | Artemis II Splashdown | [record](https://images.nasa.gov/details/KSC-20260410-PH-JNV01_0001) | [original](https://images-assets.nasa.gov/image/KSC-20260410-PH-JNV01_0001/KSC-20260410-PH-JNV01_0001~orig.jpg) | 15,048,599 | NASA/Josh Valcarcel | Parachutes deploying before splashdown in the Pacific on 10 April 2026; the end of the journey. |
| 27 | `NHQ202604100056` | return | Artemis II Recovery | [record](https://images.nasa.gov/details/NHQ202604100056) | [original](https://images-assets.nasa.gov/image/NHQ202604100056/NHQ202604100056~orig.jpg) | 24,184,912 | NASA/Bill Ingalls | Commander Wiseman assisted off the flight deck of USS John P. Murtha after recovery; the human end of the mission. |
| 28 | `art002e012588` | return | Starstruck | [record](https://images.nasa.gov/details/art002e012588) | [original](https://images-assets.nasa.gov/image/art002e012588/art002e012588~orig.jpg) | 14,199,547 | NASA | The Milky Way photographed by the crew; visual variety and one of the subjects the brief asks for. The record gives April 7 as the date, so the chapter is provisional. |

## Launch candidates (7)

| # | NASA ID | Chapter | NASA title | Source page | Original (HTTPS) | Original bytes | Photographer per record | Why selected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `Artemis II at the pad Moon 01292026_4` | launch | Moon Seen behind Full Artemis II Stack at Launch Pad 39B | [record](https://images.nasa.gov/details/Artemis%20II%20at%20the%20pad%20Moon%2001292026_4) | [original](https://images-assets.nasa.gov/image/Artemis%20II%20at%20the%20pad%20Moon%2001292026_4/Artemis%20II%20at%20the%20pad%20Moon%2001292026_4~orig.jpg) | 7,512,329 | NASA/Sam Lott | The rocket on the pad with the Moon behind it, from before the wet dress rehearsal; sets the destination before the launch. |
| 2 | `KSC-20260210-PH-JBS01-0035` | launch | Artemis II on Launch Pad | [record](https://images.nasa.gov/details/KSC-20260210-PH-JBS01-0035) | [original](https://images-assets.nasa.gov/image/KSC-20260210-PH-JBS01-0035/KSC-20260210-PH-JBS01-0035~orig.JPG) | 5,317,226 | NASA/Ben Smegelsky | Close view of the White Room at the crew access arm, where the crew made final preparations before boarding; the human side of the pad. |
| 3 | `KSC-20260401-PH-KLS01_0051` | launch | Artemis II Launch Day, Crew Suit-Up and Walkout | [record](https://images.nasa.gov/details/KSC-20260401-PH-KLS01_0051) | [original](https://images-assets.nasa.gov/image/KSC-20260401-PH-KLS01_0051/KSC-20260401-PH-KLS01_0051~orig.jpg) | 22,575,474 | NASA/Kim Shiflett | Koch and Hansen completing suit leak checks on launch day; behind-the-scenes preparation. |
| 4 | `AFRC2026-0068-03` | launch | Artemis II walk out from O&C | [record](https://images.nasa.gov/details/AFRC2026-0068-03) | [original](https://images-assets.nasa.gov/image/AFRC2026-0068-03/AFRC2026-0068-03~orig.jpg) | 18,222,662 | NASA/Jim Ross | The four crew members greeting family, friends and NASA employees outside the Operations and Checkout Building on launch day. |
| 5 | `KSC-04012026-Artemis II_Launch-1` | launch | Artemis II Launch | [record](https://images.nasa.gov/details/KSC-04012026-Artemis%20II_Launch-1) | [original](https://images-assets.nasa.gov/image/KSC-04012026-Artemis%20II_Launch-1/KSC-04012026-Artemis%20II_Launch-1~orig.jpg) | 19,430,441 | NASA/Brandon Hancock | Wide view of the stack on the pad with white clouds at its base on launch day; shows the scale of the site (the record text describes the launch). |
| 6 | `NHQ202604010227` | launch | Artemis II Launch | [record](https://images.nasa.gov/details/NHQ202604010227) | [original](https://images-assets.nasa.gov/image/NHQ202604010227/NHQ202604010227~orig.jpg) | 2,516,572 | NASA/Bill Ingalls | Liftoff from Launch Complex 39B with the flame reflected in a pond; the strongest composition of the launch. |
| 7 | `SLS_MAF_20260401_ArtemisIILaunch_05` | launch | Artemis II launch | [record](https://images.nasa.gov/details/SLS_MAF_20260401_ArtemisIILaunch_05) | [original](https://images-assets.nasa.gov/image/SLS_MAF_20260401_ArtemisIILaunch_05/SLS_MAF_20260401_ArtemisIILaunch_05~orig.JPG) | 10,417,692 | NASA/Michael DeMocker | Tight view of the rocket climbing on its exhaust plume with clouds either side; complements the wide reflected view. |

## Rights evidence

- **NASA usage guidance:** [Images and Media](https://www.nasa.gov/nasa-brand-center/images-and-media/). It lets NASA content be used without explicit permission when it does not imply endorsement, asks that NASA be acknowledged as the source, and notes that NASA occasionally uses third-party copyrighted material. This site is non-commercial and carries no advertising or sales, and images with astronauts are not used to promote any product.
- **Per candidate:** each "record" link above is the NASA Image and Video Library page of that photograph. Every record states a NASA credit (a NASA photographer or "Credit: NASA" in the description), and none states a third-party owner, an ESA/CSA/contractor credit or a copyright restriction beyond NASA's general notice ("For copyright and restrictions, refer to nasa.gov", present in the file metadata of several KSC and HQ photographs).
- **Three records leave the photographer field empty** (`art002e009007`, `art002e016299`, `art002e014251`). They belong to the same `art002e` crew-photo series as the others and the description of `art002e016299` carries "Credit: NASA". Credit on the site will be "Credit: NASA". Hugo can drop them if he wants stronger rights evidence.
- **Excluded for third-party rights: none.** No candidate reviewed carried a third-party rights mark, so nothing was rejected on that ground. Candidates seen and not chosen were left out for duplication or variety, not rights (for example `NHQ202604010308`, near-identical to `KSC-04012026-Artemis II_Launch-1`).
- The site will not use NASA logos, insignia or wording that suggests endorsement.

## Candidate stories (leads for Stage 08)

Facts below come from the NASA record of the photograph listed in the "Source" column. "To verify" items are not stated by that source and are not to be written until a second official or journalistic source is found.

| Photographs | Verified from the record | To verify before writing | Source |
| --- | --- | --- | --- |
| Mission 15 (`art002e012153`), 16 (`art002e009279`) | The crew proposed naming a crater Carroll, after Commander Reid Wiseman's late wife; it is about 5.6 km across, on the western edge of the near side, and visible from Earth with powerful telescopes. A second record says the crew suggested the names Integrity and Carroll for two small craters near Orientale. | That Integrity is named after the spacecraft (stated in `PROMPT.md`, not in these records); whether the names have been formally approved; the right words for the family. Tell this with respect and without dramatizing. | [art002e012153](https://images.nasa.gov/details/art002e012153), [art002e009279](https://images.nasa.gov/details/art002e009279) |
| Mission 19–23 (eclipse) | From the crew's position the Sun hid behind the Moon for nearly an hour (one record says nearly 54 minutes of totality); stars and planets were visible; the glow around the Moon may be zodiacal light, the corona or both. | The exact start and end times of the eclipse. | [art002e009301](https://images.nasa.gov/details/art002e009301), [art002e016324](https://images.nasa.gov/details/art002e016324) |
| Mission 22 (`art002e009575`) | During the eclipse the crew reported seeing six impact flashes on the Moon. | Where and when each flash occurred. | [art002e009575](https://images.nasa.gov/details/art002e009575) |
| Mission 12 (`art002e021278`) | NASA's record compares the Earthset to the Apollo 8 Earthrise of 1968. | The Apollo 8 date and photographer, from a NASA Apollo source. | [art002e021278](https://images.nasa.gov/details/art002e021278) |
| Mission 6–10 (Orientale) | NASA describes Orientale as one of the Moon's youngest, best-preserved large impact basins, about 600 miles wide, straddling the near and far sides; Apollo-era observers nicknamed one ring "the kiss". | Age figures other than those in the records. | [art002e012090](https://images.nasa.gov/details/art002e012090), [art002e012273](https://images.nasa.gov/details/art002e012273) |
| Mission 18 (`art002e014251`) | The crew spent about seven hours taking turns at the windows and came within 4,067 miles of the Moon's surface; they used a Lunar Targeting Plan application. | Anything about how the plan was built beyond the record. | [art002e014251](https://images.nasa.gov/details/art002e014251) |

## Omissions

- Exact times of the launch phases, the translunar injection time and splashdown coordinates are omitted: this stage selects photographs and does not state mission facts beyond the records cited above. The launch records give a 6:35 p.m. EDT liftoff on 1 April 2026; the other facts belong to Stage 08.
- The explanation of the eclipse halo is left open because NASA's own text says it is under investigation.
- Chapter assignment of `art002e012588` (Milky Way) is provisional because the record gives only April 7 and no capture time.

## Sources

- [NASA Image and Video Library](https://images.nasa.gov/) and its API (`images-api.nasa.gov/search` and `/asset`), consulted 2026-10-19.
- [NASA Images and Media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/), consulted 2026-10-19.
- Sources named in `PROMPT.md` (Gateway to Astronaut Photography Artemis II collection and the PDS archive) were not needed because the NASA Image Library covers every candidate; they stay available for Stage 06 cross-checks.
