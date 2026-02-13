# Documentation Policy

## 1. Core Philosophy
Documentation in Anchor OS must be **concise**, **accurate**, and **maintainable**. We prioritize high-signal technical writing over verbose explanations.

## 2. Rules
1.  **Brevity is King:** Avoid fluff. Get straight to the technical details.
2.  **Living Documents:** Specs must be updated *simultaneously* with code changes. Stale documentation is considered a bug.
3.  **Single Source of Truth:** `specs/spec.md` is the primary architectural reference. Do not duplicate information across multiple files if possible.
4.  **Format:** Use standard Markdown. Code blocks must specify languages (e.g., \`typescript\`).
5.  **Present Tense:** Document the system as it *exists* now. Use a separate `Roadmap` section for future plans.

## 3. Artifact Standards
*   **Task Lists (`task.md`):** Must be kept up-to-date. Mark items as `[/]` (in-progress) or `[x]` (done).
*   **Walkthroughs:** Create a `walkthrough.md` after verifying major features. Include "Verification Results" tables.
*   **Architecture Diagrams:** Use Mermaid.js when complex flows need visualization.
