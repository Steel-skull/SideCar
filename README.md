# Sidecar Lore

A comprehensive SillyTavern extension for dynamic character state tracking, NPC management, and narrative continuity in roleplay sessions. Sidecar Lore automatically monitors your conversations to track character states, relationships, inventory, and story progression—then injects this context back into your prompts for improved narrative coherence.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Character State Tracking](#character-state-tracking)
- [NPC Management System](#npc-management-system)
- [Delta Operations](#delta-operations)
- [Context Injection](#context-injection)
- [The Architect System](#the-architect-system)
- [Character Sheet Panel](#character-sheet-panel)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

---

## Features

### Core Functionality
- **Automatic State Tracking**: Monitors chat for changes to character health, inventory, relationships, mood, appearance, and more
- **Delta Operations**: Uses intelligent JSON operations (set, add, remove, append, increment) to update state efficiently without full rewrites
- **Visual Diff Review**: Preview and approve/reject proposed changes before they're applied to ensure accuracy
- **Context Injection**: Automatically includes character state in LLM prompts at configurable positions
- **Character Sheet Panel**: View and manage all tracked data in a collapsible sidebar panel

### Two-Tier AI System
- **Updater (Cheap Model)**: Runs frequently to detect state changes using cost-effective models
- **Architect (Smart Model)**: Analyzes story patterns to suggest new tracking categories using more capable models

### NPC Management System
- **Automatic NPC Detection**: Identifies NPCs mentioned in the narrative and creates tracking entries
- **Dynamic Classification**: NPCs are classified as either **Major** (full tracking) or **Minor** (lightweight tracking)
- **Intelligent Promotion/Demotion**: LLM-driven classification with user override capability
- **Scene-Aware Context**: Only injects relevant NPCs based on current scene context
- **Persistent NPC Registry**: All NPC data persists with the chat and survives page reloads

### World Lore Support
- **Factions**: Track global groups, alliances, and standings
- **Locations**: Maintain state of visited places and their conditions
- **Calendar**: Track current date, time periods, and scheduled events
- **Global State**: Store custom world variables that persist across the narrative

---

## Installation

1. **Download the Extension**
   - Clone or download the `sidecar-lore` folder

2. **Copy to Extensions Directory**
   ```
   SillyTavern/public/scripts/extensions/third-party/sidecar-lore
   ```

3. **Restart SillyTavern**
   - Reload the page or restart the SillyTavern server

4. **Enable the Extension**
   - Open the Extensions panel in SillyTavern
   - Find "Sidecar Lore" and enable it

5. **Configure Models**
   - Set up your preferred models for the Updater and Architect in the extension settings

---

## Quick Start

### 1. Basic Setup
1. Enable Sidecar Lore in the Extensions panel
2. Configure your Updater model (recommended: a fast, cheap model like GPT-3.5 or Claude Haiku)
3. Optionally configure an Architect model (recommended: a capable model like GPT-4 or Claude Sonnet)

### 2. Start Chatting
1. Open a chat with any character
2. The extension will automatically begin tracking state changes
3. A popup will appear when changes are detected—review and approve them

### 3. View Character State
1. Click the floating card icon (📇) to open the Character Sheet panel
2. Browse tracked data organized by category
3. Use the dropdown to switch between the main character and tracked NPCs

### 4. Access NPC Registry
1. Select "📋 NPC Registry" from the character dropdown
2. View all tracked NPCs with their classification (Major ⭐ / Minor ●)
3. Promote, demote, or delete NPCs as needed

---

## Configuration

Access settings via **Extensions Panel → Sidecar Lore**:

### General Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable Sidecar Lore** | Master toggle for the extension | Enabled |
| **Auto-update on messages** | Automatically analyze chat for state changes | Enabled |
| **Update every N messages** | How often to run analysis (1 = every message) | 1 |
| **Messages to analyze** | Number of recent messages sent to analyzer | 25 |
| **Show approval popup** | Display popup for manual approval of changes | Enabled |

### Model Selection

| Setting | Description | Recommendation |
|---------|-------------|----------------|
| **Updater Profile** | Connection profile for frequent state updates | Use cheaper/faster models |
| **Updater Preset** | Preset for the updater model | Low temperature for consistency |
| **Architect Profile** | Connection profile for schema design | Use smarter models |
| **Architect Preset** | Preset for the architect model | Higher temperature for creativity |

### Context Injection

| Setting | Description | Options |
|---------|-------------|---------|
| **Inject sidecar into prompts** | Enable automatic context injection | Enabled/Disabled |
| **Injection position** | Where to insert context | System Prompt, Author's Note, After Character Card |

### NPC Tracking Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable NPC Tracking** | Master toggle for NPC system | Enabled |
| **Auto-classify NPCs** | Allow LLM to promote/demote NPCs automatically | Enabled |
| **Max Major NPCs** | Maximum number of major NPCs (1-20) | 5 |
| **NPC Context Depth** | How much NPC data to inject | Moderate |
| **Promotion Threshold** | Appearances before promotion consideration | 3 |

#### NPC Context Depth Options

| Level | Description |
|-------|-------------|
| **None** | No NPC context injected |
| **Minimal** | Names and sentiments only |
| **Moderate** | Names, sentiments, notes, and mood for major NPCs |
| **Full** | Complete NPC sidecars including personality and relationships |

---

## Character State Tracking

### Default Trackers

The extension comes with pre-configured trackers for common roleplay elements:

#### Status
```json
{
  "health": "Healthy",
  "energy": "Rested",
  "mood": "Content",
  "conditions": ["Well-fed", "Alert"]
}
```

#### Appearance
```json
{
  "clothing": "Leather armor with a blue cloak",
  "physical": "Minor scratches on forearms"
}
```

#### Inventory
```json
{
  "equipped": {
    "mainHand": "Steel Longsword",
    "offHand": "Wooden Shield"
  },
  "bag": ["Health Potion", "50 Gold Coins", "Map of the Region"]
}
```

#### Relationships
```json
{
  "Elena": {
    "sentiment": "trusted ally",
    "trustLevel": 85,
    "notes": "Saved her life in the forest"
  },
  "Baron Blackwood": {
    "sentiment": "hostile",
    "trustLevel": 10,
    "notes": "Suspects we stole the artifact"
  }
}
```

#### Knowledge
An array of facts the character has learned:
```json
[
  "The ancient tomb is located beneath the old mill",
  "Vampires are weak to silver, not just sunlight",
  "The king has a secret passage from the throne room"
]
```

#### Timeline
Significant events with turn numbers:
```json
[
  {"turn": 15, "event": "Discovered the hidden entrance"},
  {"turn": 23, "event": "Defeated the guardian"},
  {"turn": 31, "event": "Retrieved the artifact"}
]
```

#### Plot Threads
Active and resolved quests/goals:
```json
{
  "active": [
    {"name": "Find the Lost Artifact", "status": "Artifact located, extraction pending"}
  ],
  "resolved": [
    {"name": "Clear the Goblin Camp"}
  ]
}
```

### Custom Trackers

The Architect system can suggest new trackers based on your story. Examples:
- **Magic Points / Mana**: For magical characters
- **Reputation**: With different factions
- **Skills**: Tracking ability improvements
- **Companions**: Party member states
- **Currencies**: Multiple money types

---

## NPC Management System

### Overview

The NPC Management System automatically detects, tracks, and manages all non-player characters in your narrative. It uses a two-tier classification system to balance detail with efficiency.

### Classification Tiers

#### Minor NPCs
Lightweight tracking for background or infrequent characters:

```json
{
  "meta": {
    "npcId": "tom_the_barkeep",
    "name": "Tom the Barkeep",
    "classification": "minor",
    "firstAppearance": 5,
    "lastSeen": 42,
    "appearanceCount": 3,
    "userPinned": false
  },
  "data": {
    "notes": "Friendly barkeep at the Rusty Anchor, knows local gossip",
    "sentiment": "friendly",
    "lastContext": "Served drinks and mentioned strange travelers"
  }
}
```

#### Major NPCs
Comprehensive tracking matching the main character's depth:

```json
{
  "meta": {
    "npcId": "elena_nightshade",
    "name": "Elena Nightshade",
    "classification": "major",
    "firstAppearance": 8,
    "lastSeen": 156,
    "appearanceCount": 47,
    "userPinned": true
  },
  "trackers": {
    "status": {
      "health": "Healthy",
      "mood": "Determined",
      "conditions": []
    },
    "appearance": {
      "clothing": "Dark leather armor with silver trim",
      "physical": "Scar across left eyebrow"
    },
    "inventory": {
      "equipped": {"mainHand": "Enchanted Dagger"},
      "bag": ["Lockpicks", "Smoke Bombs"]
    },
    "relationships": {
      "Player": {"sentiment": "deep trust", "trustLevel": 95}
    },
    "knowledge": ["Knows the secret of the Shadow Guild"]
  },
  "personality": {
    "traits": ["Cunning", "Loyal", "Secretive"],
    "motivations": ["Avenge her family", "Protect the innocent"],
    "fears": ["Betrayal", "Losing loved ones"],
    "speechPattern": "Speaks in measured tones, rarely raises voice"
  },
  "narrativeRole": {
    "role": "Ally/Love Interest",
    "significance": "Core party member and romantic subplot",
    "plotRelevance": ["Shadow Guild infiltration", "Royal conspiracy"]
  },
  "timeline": [
    {"turn": 8, "event": "First meeting in the tavern"},
    {"turn": 45, "event": "Revealed her true identity"},
    {"turn": 120, "event": "Confessed her feelings"}
  ]
}
```

### Automatic Classification

The LLM analyzes each NPC during regular analysis passes and considers:

1. **Appearance Frequency**: How often the NPC appears in the narrative
2. **Interaction Depth**: Quality and significance of interactions
3. **Narrative Importance**: Role in plot threads and story arcs
4. **Relationship Significance**: Connection to the main character

### Classification Workflow

```
New NPC Detected → Created as Minor
         ↓
Appears frequently / Deep interactions
         ↓
LLM Recommends Promotion → User Approval (if popup enabled)
         ↓
Migrated to Major (all data preserved + expanded)
         ↓
Story evolves, NPC fades from relevance
         ↓
LLM Recommends Demotion → User Approval
         ↓
Migrated to Minor (essential data condensed)
```

### Manual Classification Override

Users can manually promote or demote NPCs at any time:

1. Open the Character Sheet panel
2. Select "📋 NPC Registry" from the dropdown
3. Click the ⬆️ (promote) or ⬇️ (demote) button on any NPC
4. Optionally check "Pin to prevent automatic reclassification"

**Pinned NPCs** (📌) will not be automatically reclassified by the LLM, but can still be manually changed.

### Scene Context Tracking

The system tracks which NPCs are active in the current scene:

```json
{
  "sceneContext": {
    "currentLocation": "The Rusty Anchor Tavern",
    "activeNPCs": ["elena_nightshade", "tom_the_barkeep"],
    "lastUpdated": 156
  }
}
```

Context injection prioritizes:
1. NPCs explicitly in the current scene
2. Major NPCs with recent appearances
3. Minor NPCs with highest relevance scores

---

## Delta Operations

The extension uses atomic operations to update character state efficiently:

### Operation Types

| Operation | Description | Use Case |
|-----------|-------------|----------|
| `set` | Replace a value entirely | Changing health, mood, location |
| `add` | Add to array (prevents duplicates) | Learning new knowledge, gaining conditions |
| `remove` | Remove from array | Healing conditions, using consumables |
| `append` | Always add to array (allows duplicates) | Timeline events, repeated actions |
| `increment` | Add to numeric value | Trust levels, currency, stats |

### Examples

```json
// Set health status
{"op": "set", "path": "trackers.status.health", "value": "Injured"}

// Add item to inventory
{"op": "add", "path": "trackers.inventory.bag", "value": "Healing Potion"}

// Remove a condition
{"op": "remove", "path": "trackers.status.conditions", "value": "Poisoned"}

// Add timeline event
{"op": "append", "path": "timeline", "value": {"turn": 42, "event": "Discovered the secret passage"}}

// Increase trust
{"op": "increment", "path": "trackers.relationships.Elena.trustLevel", "value": 15}
```

### Path Syntax

Paths use dot notation to navigate nested objects:
- `trackers.status.health` → `sidecar.trackers.status.health`
- `trackers.relationships.Elena.sentiment` → `sidecar.trackers.relationships.Elena.sentiment`
- `plotThreads.active` → `sidecar.plotThreads.active`

---

## Context Injection

### How It Works

When enabled, Sidecar Lore automatically injects character state into your prompts:

1. **Before Generation**: The extension intercepts the prompt
2. **State Formatting**: Current sidecar data is formatted as readable text
3. **Position Insertion**: Context is inserted at the configured position
4. **Generation Proceeds**: The LLM receives the enriched prompt

### Injection Positions

| Position | Description | Best For |
|----------|-------------|----------|
| **System Prompt** | Added to the system/instruction prompt | Strong influence on all responses |
| **Author's Note** | Inserted with author's note | Moderate influence, flexible placement |
| **After Character Card** | Appended after character description | Natural extension of character info |

### Example Injected Context

```
[CHARACTER STATE - Elena Nightshade]

## Current Status
- Health: Healthy
- Mood: Determined
- Conditions: None

## Appearance
- Clothing: Dark leather armor with silver trim
- Physical: Scar across left eyebrow

## Inventory
- Main Hand: Enchanted Dagger
- Bag: Lockpicks, Smoke Bombs

## Recent Events
- Turn 120: Confessed her feelings
- Turn 115: Helped defeat the shadow assassin

## Active Relationships
- Player: Deep trust (95%)

[NPCs IN SCENE]
- Elena Nightshade (Major): Determined, trusted ally
- Tom the Barkeep (Minor): Friendly, serving drinks
```

### NPC Context Depth

Control how much NPC information is injected:

- **None**: No NPC information
- **Minimal**: `"Elena (ally), Tom (friendly)"`
- **Moderate**: Includes notes and current mood
- **Full**: Complete NPC sidecars with personality data

---

## The Architect System

### Purpose

The Architect is a powerful model that analyzes your story to suggest new tracking categories. It identifies patterns that the basic trackers might miss.

### When to Use

- **After significant story developments**: New mechanics introduced
- **When default trackers feel limiting**: Story has unique elements
- **Periodically for optimization**: Every 50-100 messages

### How It Works

1. Click "Architect Mode" in settings or character panel
2. The Architect model analyzes recent chat history
3. It identifies information worth tracking that isn't currently covered
4. Suggestions appear in a popup with descriptions

### Example Recommendations

```json
{
  "name": "magicReserves",
  "description": "Track magical energy and spell availability",
  "schema": {
    "type": "object",
    "properties": {
      "currentMana": {"type": "number"},
      "maxMana": {"type": "number"},
      "spellsKnown": {"type": "array"},
      "activeEnchantments": {"type": "array"}
    }
  },
  "priority": "high"
}
```

### Accepting Recommendations

1. Review each suggestion in the popup
2. Check the box for trackers you want to add
3. Click "Add Selected"
4. New trackers are added to your character's sidecar

---

## Character Sheet Panel

### Accessing the Panel

- Click the floating card icon (📇) in the bottom-right corner
- Or click "View Character Panel" in extension settings

### Panel Sections

| Section | Icon | Content |
|---------|------|---------|
| Status | 💗 | Health, energy, mood, conditions |
| Appearance | 👕 | Clothing, physical description |
| Inventory | 💼 | Equipped items, bag contents |
| Relationships | 👥 | NPCs and their disposition |
| Knowledge | 🧠 | Facts the character knows |
| Timeline | 🕐 | Recent significant events |
| Quests | 📜 | Active and resolved plot threads |
| Custom | 🏷️ | Any Architect-added trackers |

### Panel Actions

| Button | Action |
|--------|--------|
| 🔄 Refresh | Reload current sidecar data |
| 🔍 Analyze | Trigger manual analysis |
| ✨ Architect | Run Architect mode |
| ✕ Close | Close the panel |

### Viewing NPCs

1. Use the dropdown at the top of the panel
2. Select "📋 NPC Registry" for overview
3. Or select a specific NPC to view their details

### NPC Registry View

- Lists all tracked NPCs grouped by classification
- Shows appearance count and last seen turn
- Action buttons for promote/demote/delete
- Click any NPC to view full details

---

## API Reference

### Exported Functions

```javascript
import { 
  getSettings,
  triggerManualAnalysis,
  triggerArchitectMode,
  sidecarManager,
  npcRegistry,
  MODULE_NAME 
} from './extensions/third-party/sidecar-lore/index.js';
```

### SidecarManager

```javascript
// Load sidecar for a character
const sidecar = await sidecarManager.load(characterId);

// Apply delta operations
await sidecarManager.applyUpdates(characterId, operations);

// Expand schema with new trackers
await sidecarManager.expandSchema(characterId, schemaChanges);
```

### NPCRegistry

```javascript
// Get an NPC by ID
const npc = npcRegistry.get('elena_nightshade');

// Get all NPCs of a classification
const majorNPCs = npcRegistry.getByClassification('major');
const minorNPCs = npcRegistry.getByClassification('minor');

// Get or create an NPC
const npc = npcRegistry.getOrCreate('new_npc', 'New Character Name');

// Update scene context
npcRegistry.updateSceneContext(['elena_nightshade', 'tom_barkeep'], currentTurn);

// Save changes
await npcRegistry.save();
```

### Events

The extension hooks into these SillyTavern events:

| Event | Purpose |
|-------|---------|
| `MESSAGE_RECEIVED` | Trigger automatic analysis |
| `CHAT_CHANGED` | Reload sidecar and NPC registry |

---

## Troubleshooting

### Extension Not Loading

**Symptoms**: Extension doesn't appear in Extensions panel

**Solutions**:
1. Check browser console (F12) for error messages
2. Verify files are in correct directory structure
3. Ensure `manifest.json` is valid JSON (use a JSON validator)
4. Check file permissions

### Analysis Not Running

**Symptoms**: No popups appearing, no state changes detected

**Solutions**:
1. Verify auto-update is enabled in settings
2. Check that your LLM API connection is working
3. Try running manual analysis to see if it works
4. Check console for API errors
5. Verify the updater model profile is configured

### Changes Not Applying

**Symptoms**: Approved changes don't appear in sidecar

**Solutions**:
1. Ensure you click "Approve Selected" (not just close the popup)
2. Check browser console for storage errors
3. Verify the character has a valid ID
4. Try refreshing the page and checking again

### Context Not Appearing in Prompts

**Symptoms**: LLM doesn't seem to know character state

**Solutions**:
1. Verify "Inject sidecar into prompts" is enabled
2. Check injection position setting matches your setup
3. Ensure a sidecar exists for the current character
4. Test with "Full" NPC depth to verify injection works

### NPC Registry Empty

**Symptoms**: No NPCs detected despite mentions in chat

**Solutions**:
1. Verify NPC tracking is enabled in settings
2. Run manual analysis to trigger NPC detection
3. Check that the story has clear NPC introductions
4. Lower the promotion threshold temporarily

### Performance Issues

**Symptoms**: Slow response times, frequent API calls

**Solutions**:
1. Increase "Update every N messages" to reduce frequency
2. Use a faster model for the updater
3. Reduce "Messages to analyze" if very high
4. Limit "Max Major NPCs" to reduce context size

---

## Development

### File Structure

```
sidecar-lore/
├── manifest.json           # Extension registration
├── index.js                # Main entry point, event handling
├── style.css               # All UI styling
├── settings.html           # Settings panel HTML
├── README.md               # This documentation
└── lib/
    ├── sidecar-manager.js  # JSON file I/O, schema management
    ├── llm-handler.js      # LLM API interactions, prompts
    ├── delta-engine.js     # Delta operation logic
    ├── context-injector.js # Prompt injection system
    ├── model-manager.js    # Profile/preset switching
    ├── npc-registry.js     # NPC storage and management
    ├── npc-classifier.js   # Classification and migration
    └── ui-popup.js         # UI components and panels
```

### Key SillyTavern APIs Used

```javascript
// Get application context
const context = SillyTavern.getContext();

// Access chat metadata (per-chat storage)
const { chatMetadata, saveMetadata } = context;

// Access extension settings (persistent)
const settings = context.extensionSettings['sidecar-lore'];

// Generate with current model
const response = await context.generateRaw(prompt, maxTokens, abortSignal);

// Generate quietly (no chat UI update)
const response = await context.generateQuietPrompt(prompt, options);

// Event system
context.eventSource.on(context.event_types.MESSAGE_RECEIVED, handler);

// Save settings
context.saveSettingsDebounced();
```

### Adding New Trackers

To add a new default tracker:

1. Update `DEFAULT_CHARACTER_SCHEMA` in `sidecar-manager.js`
2. Add rendering logic in `ui-popup.js` `CharacterPanel` class
3. Update context injection formatting in `context-injector.js`

### Adding New Delta Operations

1. Add operation logic in `delta-engine.js` `applyDelta()` method
2. Update `DELTA_OPERATIONS_SCHEMA` in `llm-handler.js`
3. Add preview logic in `delta-engine.js` `previewDelta()` method

---

## License

MIT License - feel free to modify and share!

---

## Credits

Developed for the SillyTavern community.

### Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request with clear description

### Reporting Issues

When reporting issues, please include:
- SillyTavern version
- Browser and version
- Console error messages (F12 → Console)
- Steps to reproduce the issue
