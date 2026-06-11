/**
 * Manual-style step-by-step descriptions for test cases, keyed by Test ID
 * (the "KB_01" / "CANVAS_01" prefix used in test titles).
 *
 * Used by the Excel reporter to populate a "Test Steps" column.
 * Tests without an entry here simply get an empty Test Steps cell.
 */
export const TEST_STEPS: Record<string, string[]> = {
  // ── Clients — Home Page ──────────────────────────────────────────────────
  CLIENT_01: [
    "Open the home page (/)",
    'Verify the "Clients" heading is displayed',
    'Verify the "New Client" button is visible',
  ],
  CLIENT_02: [
    "Open the home page",
    'Click the "New Client" button',
    "Verify a dialog opens to create a new client",
  ],
  CLIENT_03: [
    "Open the home page",
    "Verify the seeded client's card is visible and links to its client page",
  ],
  CLIENT_04: [
    "Open the home page",
    'Check the browser tab title includes "CreativeOS"',
  ],

  // ── Clients — Client Detail Page (/clients/[id]) ────────────────────────
  CLIENT_05: [
    "Open /clients/[id] for a client whose Knowledge Base is not yet ready (kb_status != ready)",
    'Verify the browser is redirected to /clients/[id]/kb',
    'Verify the "Brand Knowledge Base" heading is shown instead of the canvas list',
  ],
  CLIENT_06: [
    "Open /clients/[id] for a client whose Knowledge Base is ready",
    "Verify the page loads and shows the client's name as the page heading",
  ],
  CLIENT_07: [
    "Open /clients/[id] for a ready client",
    'Click the "Clients" breadcrumb link at the top of the page',
    "Verify it navigates back to the home page (/)",
    'Verify the "Clients" heading is shown',
  ],
  CLIENT_08: [
    "Open /clients/[id] for a ready client",
    'Click the "Brand KB" button',
    "Verify it navigates to /clients/[id]/kb",
    'Verify the "Brand Knowledge Base" heading is shown',
  ],
  CLIENT_09: [
    "Open /clients/[id] for a ready client",
    'Click the "New canvas" button',
    "Verify a dialog opens with a title and a Name field for creating a new canvas",
  ],
  CLIENT_10: [
    "Open /clients/[id] for a ready client that has at least one canvas",
    "Verify a canvas card is visible in the list",
    "Click the canvas card",
    "Verify it navigates to /clients/[id]/canvases/[canvas-id]",
    "Verify the canvas editor (React Flow board) loads",
  ],

  // ── Knowledge Base — common ─────────────────────────────────────────────
  KB_01: [
    "Open the client's Knowledge Base page (Clients > select client > Knowledge Base)",
    'Verify the "Brand Knowledge Base" heading is displayed at the top of the page',
  ],
  KB_02: [
    "Open the Knowledge Base page",
    'Check the browser tab title includes "CreativeOS"',
  ],
  KB_03: [
    "Open the Knowledge Base page",
    "Verify either the document/image upload screen OR the module review tabs are displayed, depending on whether the KB has already been generated",
  ],
  KB_04: [
    "Open the Knowledge Base page",
    'Click the "Clients" breadcrumb link at the top of the page',
    "Verify it navigates back to the Clients list (home page)",
  ],

  // ── Knowledge Base — upload step ────────────────────────────────────────
  KB_05: [
    "Open the Knowledge Base page for a client that has not generated a KB yet",
    'Verify the "Brand Documents" upload card is displayed',
  ],
  KB_06: [
    "Open the Knowledge Base page for a client that has not generated a KB yet",
    'Verify the "Brand Images" upload card is displayed',
  ],
  KB_07: [
    "Open the Knowledge Base page for a client with no documents uploaded yet",
    'Verify the "Extract & Build KB" button is greyed out / disabled',
  ],
  KB_08: [
    "Open the Knowledge Base page for a client with no documents uploaded yet",
    'Verify the message "Upload at least one document to continue" is shown',
  ],
  KB_09: [
    "Open the Knowledge Base page (upload screen)",
    'Verify the "Add documents" drop area is visible',
    'Verify the "Add images" drop area is visible',
  ],
  KB_10: [
    "Open the Knowledge Base page (upload screen)",
    'Verify the supported document formats "PDF · DOCX · PPTX · MD · TXT" are listed on the Brand Documents card',
  ],
  KB_11: [
    "Open the Knowledge Base page (upload screen)",
    'Verify the supported image formats "JPG · PNG · WebP" are listed on the Brand Images card',
  ],

  // ── Knowledge Base — review step ────────────────────────────────────────
  KB_12: [
    "Open the Knowledge Base page for a client that has completed KB generation",
    "Verify all 7 module tabs are shown: Brand Voice, Visual Identity, Image Analysis, Audience & Casting, Image Direction, Video Direction, Compliance Rules",
  ],
  KB_13: [
    "Open the Knowledge Base page",
    'Verify the "Brand Voice" tab is shown selected/highlighted by default',
  ],
  KB_14: [
    "Open the Knowledge Base page",
    'Verify a counter such as "3 / 7 reviewed" is displayed for the current module',
  ],
  KB_15: [
    "Open the Knowledge Base page",
    'Verify each field shows a confidence badge labelled "High", "Med", or "Low"',
  ],
  KB_16: [
    "Open the Knowledge Base page",
    'If the current module has fields that have not been reviewed yet, verify the "Approve all" button is shown',
  ],
  KB_17: [
    "Open the Knowledge Base page",
    'Verify each reviewable field has a "Reject" (X) icon button',
  ],
  KB_18: [
    "Open the Knowledge Base page",
    'Verify each reviewable field has a "Refine with AI" (sparkle) icon button',
  ],
  KB_19: [
    "Open the Knowledge Base page",
    'Click the "Refine with AI" (sparkle) icon on a field',
    "Verify a popover opens containing a text box to describe the requested change",
  ],
  KB_20: [
    "Open the Knowledge Base page",
    'Click the "Visual Identity" tab',
    'Verify the page now shows the "Visual Identity" section heading and its fields',
  ],
  KB_21: [
    "Open the Knowledge Base page",
    'Click the "Source files" button',
    'Verify the "Source Documents & Images" panel slides open',
  ],
  KB_22: [
    "Open the Knowledge Base page",
    'Click the "Source files" button',
    'Verify the panel shows "Documents" and "Images" tabs',
  ],
  KB_23: [
    "Open the Knowledge Base page",
    'Verify a "Mark KB Ready" status button is visible (label may change to "Review all fields first" or "KB is ready" depending on review progress)',
  ],
  KB_24: [
    "Open the Knowledge Base page",
    'Click the "Reject" (X) icon on a field',
    'Verify a "Restore" link appears next to that field, allowing the rejection to be undone',
    "Verify no save has happened yet (change is local only)",
  ],
  KB_25: [
    "Open the Knowledge Base page",
    'Click the "Reject" (X) icon on a field',
    'Verify an "Unsaved changes" badge appears near the Save button',
  ],
  KB_26: [
    "Open the Knowledge Base page",
    'Click "Approve all" for the current module',
    'Verify the "Unsaved changes" badge appears',
    'Click "Save"',
    'Verify a "Changes saved" confirmation message appears',
    'Verify the "Unsaved changes" badge disappears',
    "Note: only runs when DB-write testing is enabled (TEST_RUN_KB_EDIT=1)",
  ],
  KB_27: [
    "Open the Knowledge Base page",
    'Click the "Visual Identity" tab',
    'Find the "Primary Colours" field',
    "Verify each colour value (hex code) is shown with a matching colour swatch chip",
  ],
  KB_28: [
    "Open the Knowledge Base page",
    'Click the "Refine with AI" icon on a field',
    'Type instructions, e.g. "Make this more concise", into the text box',
    'Click "Re-analyze"',
    'Verify a "Re-analyzing…" status indicator appears',
    "Wait for the re-analysis to finish (indicator disappears)",
    'Verify a message confirms the field was "updated — review the new value"',
    "Note: only runs when AI re-analysis testing is enabled (TEST_RUN_KB_REANALYZE=1)",
  ],

  // ── Canvas — Node Graph (/clients/[id]/canvases/[id]) ────────────────────
  CANVAS_01: [
    "Open a canvas (Clients > select a client > open a canvas card)",
    "Verify the canvas board (React Flow editor) loads and is visible",
  ],
  CANVAS_02: [
    "Open a canvas that has both a Script node and a Brand KB node",
    "Verify both the Script node and the Brand KB node are visible on the board",
  ],
  CANVAS_03: [
    "Open a canvas",
    "Click on the Script node",
    "Verify the node shows a highlighted selection outline",
  ],
  CANVAS_04: [
    "Open a canvas that has a Brand KB node",
    'Click "Open ↗" on the Brand KB node',
    'Verify a panel opens showing the "Brand KB" title',
    'Verify an "Edit KB" link is shown that points to the client\'s Knowledge Base page',
  ],
  CANVAS_05: [
    "Open a canvas",
    'Click "Open ↗" on the Brand KB node to open the Brand KB panel',
    'Click the close (X) button',
    "Verify the Brand KB panel closes",
  ],
  CANVAS_06: [
    "Open a canvas that has a connection between the Script node and the Brand KB node",
    "Verify a connecting line (edge) is shown between the two nodes",
  ],
  CANVAS_07: [
    "Open a canvas",
    'Click "Add script node"',
    "Verify a new Script node appears on the board",
    "Verify a new connecting line (edge) appears between the Brand KB node and the new Script node",
    "Note: only runs when canvas-editing tests are enabled (TEST_RUN_CANVAS_EDIT=1) — writes to the database",
  ],
  CANVAS_08: [
    "Open a canvas",
    "Double-click the Script node",
    'Verify the Script focus view opens, showing a "Back to canvas" button',
  ],

  // ── Script Flow — Script node lifecycle (canvas focus view) ─────────────
  SCRIPT_01: [
    "Open a canvas that has a Script node",
    "Verify the Script node is visible on the board",
  ],
  SCRIPT_02: [
    "Open a canvas that has a Script node",
    'Click "Open ↗" on the Script node',
    'Verify the Script focus view opens, showing a "Back to canvas" button',
  ],
  SCRIPT_03: [
    "Open the Script focus view for a node with no parsed script yet",
    "Upload a reel-brief text file",
    'Verify an "Extracting the script…" status indicator appears',
    "Note: only runs when AI generation testing is enabled (TEST_RUN_GENERATE=1) and the node has no existing parsed script — fires a real AI call",
  ],
  SCRIPT_04: [
    "Continue from SCRIPT_03 — wait for extraction to finish",
    'Verify the "Save" button becomes visible',
    "Verify the extracted script document (shots, sections) is displayed for review",
    "Note: only runs when AI generation testing is enabled (TEST_RUN_GENERATE=1) and the node has no existing parsed script",
  ],
  SCRIPT_05: [
    "Open the Script focus view for a node with a parsed script",
    "Click the script title to edit it",
    "Type a new title and press Enter",
    'Verify the "Save" button becomes enabled',
  ],
  SCRIPT_06: [
    "In the Script focus view, find the Schedule section",
    "Edit the date, post time, category, and theme fields",
    "Verify the new date value is shown in the section",
  ],
  SCRIPT_07: [
    "In the Script focus view, find the Objective section",
    "Edit the objective text and the production type text",
    "Verify the new objective text is shown in the section",
  ],
  SCRIPT_08: [
    "In the Script focus view, find the Visual Script section",
    'Click "Remove shot" on the first shot',
    "Verify the shot count decreases by one",
    "Edit the description of the new first shot",
    'Click "Add shot"',
    "Verify the shot count increases by one",
    "Fill in the description and duration for the new shot",
  ],
  SCRIPT_09: [
    "In the Script focus view, find the On-Screen Text section",
    "Edit the intro text",
    'Click "Add line" and fill in the new body line',
    "Edit the outro text",
  ],
  SCRIPT_10: [
    "In the Script focus view, edit the Voiceover, Music, and Caption sections",
    "Edit the CTA text and the thumbnail hook",
    "Verify the new caption text is shown in the section",
  ],
  SCRIPT_11: [
    "In the Script focus view, find the QC Notes section",
    'Click "Add note" and fill in the new note',
    "Find the Product Links section",
    'Click "Add link" and fill in the new link',
  ],
  SCRIPT_12: [
    "In the Script focus view, with unsaved edits present",
    'Verify the "Save" button is enabled',
    'Click "Save"',
    'Verify the "Save" button becomes disabled',
  ],
  SCRIPT_13: [
    'Click "Back to canvas" to close the Script focus view',
    "Verify the canvas board is shown again",
    'Re-open the Script node via "Open ↗"',
    "Verify the previously saved title is still shown, confirming the edits persisted",
  ],
};

/** Maps the Test ID prefix (e.g. "KB", "CANVAS") to a human-readable module name. */
export const MODULE_NAMES: Record<string, string> = {
  KB: "Knowledge Base",
  CANVAS: "Canvas",
  CLIENT: "Clients",
  SCRIPT: "Script Flow",
  AUTH: "Auth",
};
