# Architecture & Design Document: Mercury 3D Map Voxel Puzzle

## 1. High-Level Architecture

The application follows a **Thick Client / Thin Server** model to support real-time interaction with heavy client-side graphics.

### A. Frontend (Client)
*   **Framework:** React 18 (UI Structure).
*   **3D Engine:** React Three Fiber (Three.js) for rendering the voxel grid and puzzle pieces.
*   **State Management:** `Zustand`.
    *   *Transient State:* Mouse position, drag vectors (handled locally in R3F loop for performance).
    *   *Global State:* Lobby status, current map data, piece ownership/positions (synced via store).
*   **Styling:** Tailwind CSS for the "Mission Control" UI overlay.

### B. Backend (Dynamic Serving & Sync)
*   *Conceptual Role:* Maintains the "Truth" of the puzzle state.
*   *Protocol:* WebSockets (or polling for this prototype) to broadcast events: `PLAYER_JOIN`, `PIECE_MOVED`, `PUZZLE_SOLVED`.
*   *Session Manager:* Maps `SessionID` -> `{ mapId, difficulty, pieceStates[] }`.

### C. Data Pipeline (The "Geology" Engine)
1.  **Input:** Static PNG assets (Mercury Geological Maps).
2.  **Processing (Client-side Worker):**
    *   **Downsample:** Reduce image to grid (e.g., 64x64 for Easy, 128x128 for Hard).
    *   **Segmentation:** Flood-fill algorithm to identify connected color regions.
    *   **Mesh Generation:** Convert regions to 3D Geometry.
        *   *Extrusion:* Base height.
        *   *Displacement:* Apply noise/height modifiers based on region color (e.g., Blue = Crater (concave), Red = Volcanic (flat/smooth)).

---

## 2. UX/UI Design: The "Orbital Lobby"

The visual language is "Scientific Elegant". Dark greys, deep blacks, thin borders, and monospaced accents.

### Components
1.  **Global Layout:** Dark starry background or subtle orbital mechanics animation.
2.  **Mission Header:** Title, Connection Status (green dot pulsating), Player Avatar.
3.  **Map Holodeck (The Carousel):**
    *   Displays 4 available geological maps.
    *   *State:* Hovering expands the card to reveal details.
4.  **Mission Parameters (Difficulty):**
    *   Integrated into the Map Card.
    *   Selectors: `coarse` (Easy), `moderate` (Med), `fine` (Hard).
    *   *Feedback:* Changing difficulty updates the "Active Sessions" indicator.
5.  **Session Monitor:**
    *   Text: "2 Explorers active in this sector."
    *   Action: "Initialize Sequence" (Start New) or "Sync Data" (Join Existing).

---

## 3. Implementation Plan

### Phase 1: Core Architecture & Lobby (Current Step)
*   Set up React, R3F, Tailwind.
*   Implement `MockBackendService` to simulate multi-player sessions.
*   Build the **Lobby UI** with map selection and difficulty toggling.
*   Establish the `GameStore` structure.

### Phase 2: The Geology Engine (Image Processing)
*   Create the `ImageProcessor` utility.
*   Implement the grid downsampling and region segmentation logic.
*   Debug view: Draw the 2D grid to canvas.

### Phase 3: Voxelization & 3D Rendering
*   Implement R3F scene.
*   Convert 2D regions into `InstancedMesh` or custom geometry.
*   Apply the "Geological Displacement" shaders/modifiers.

### Phase 4: Gameplay Mechanics
*   Implement Raycaster for picking pieces.
*   Implement `DragControls`.
*   Add "Snapping" logic (checking if piece is near target origin).

### Phase 5: Multiplayer Sync
*   Connect the `DragEnd` event to the `BackendService`.
*   Broadcast position updates to other clients.
