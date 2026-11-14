# Ragnor app mockup (rough draft)

Source files for the visual wireframe. Sample data only. Rule versions and wording are placeholders pending clinical review.

- `project/canvas.json` lays out four artboards: `Main.dc.html` (daily check-in), `Predict.dc.html` (today's readiness), `Act.dc.html` (flag detail), `Trainer.dc.html` (trainer roster).
- Each `.dc.html` file is one screen. Links between screens are relative (`Act.dc.html`).
- The live visual version is at https://claude.ai/artifact/JqCLDFk5YZN8MGDdBTB1q7. The React version of the same screens is at `/mockup` in the app (`components/mockup/MockupApp.tsx`).

To update: edit the file on a branch, open a pull request into `main`, and note in the description whether the React version should change too.
