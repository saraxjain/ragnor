> The team's full pitch deck is `docs/Ragnor-pitch-deck.pdf`. Use it as the master; this file is the short table version.

# Table deck: 4 slides (+1 backup)

For the science-fair judging. Each slide maps to the Best Startup Potential criteria: named user, differentiation, plan to reach users, evidence of demand, business model.

## Slide 1: The problem (named user + evidence)
**Title:** Most high schools have no one watching for the warning signs
- ~37% of US public high schools have a full-time athletic trainer
- ~4 in 10 possible concussions go unreported
- Girls in jumping/cutting sports tear their ACL several times more often than boys
- Founder: five concussions, one caught two days late
**Our user:** athletic directors and coaches at schools without a full-time trainer

## Slide 2: The solution (what it does)
**Title:** Ragnor: wearables collect the data, Ragnor turns it into a decision
- HitWatch: daily follow-up calls for a week after a hit, checked against the athlete's own HRV and sleep baseline
- LandingCheck: a 10-second phone video, scored by Gemini for ACL-linked landing errors
- Coach view + season report
- Never diagnoses, never clears. A human approves every alert.

## Slide 3: How it works (architecture, for technical questions)
Diagram: Phone video / voice / watch / mouthguard → Gemini (video understanding, function calling, structured output) + Google Health API → rules engine (decides the band) → guardrail filter → Firebase → coach approval queue → ElevenLabs outbound call.

## Slide 4: The business (differentiation, go-to-market, model)
- **Different:** others screen once, coach individuals or alert at the moment of impact. Ragnor follows through for a whole team without a trainer.
- **Demand:** Hurtblocker ACL app hit 4,000 downloads in 2 months; Google launched a Gemini Fitbit coach; booster clubs already pay ~$150 per sensor mouthguard.
- **Go-to-market:** free pilots → booster clubs and athletic directors → districts and state associations.
- **Model:** free for athletes; $20/athlete/season (high schools), $40 (universities & clubs); $165.3M beachhead, $254.2M SAM.
- **Moat:** an injury-outcome dataset that grows every season.

## Backup slide: What we won't claim
- Not a diagnostic or medical device; wellness and triage only
- LandingCheck is a LESS-*style* screen, not a validated LESS score; validation with a sports-medicine partner is next
- HRV tracks recovery but can't detect concussion; we only say "not back to baseline yet"
- Minors' data: parental consent, FERPA/HIPAA review before any real pilot
