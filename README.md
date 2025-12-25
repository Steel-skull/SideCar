# Sidecar Lore

A SillyTavern extension for dynamic character state tracking and narrative continuity in roleplay sessions.

## Features

- **Automatic State Tracking**: Monitors chat for changes to character health, inventory, relationships, and more
- **Delta Operations**: Uses intelligent JSON operations to update state efficiently
- **Two-Tier AI System**: 
  - **Updater (Cheap Model)**: Runs frequently to detect state changes
  - **Architect (Smart Model)**: Analyzes story to suggest new tracking categories
- **Visual Diff Review**: Approve or reject proposed changes before they're applied
- **Context Injection**: Automatically includes character state in LLM prompts
- **Character Sheet Panel**: View and manage all tracked data in a sidebar
- **World Lore Support**: Track global state like factions, locations, and calendar

## Installation

1. Copy the `sidecar-lore` folder to your SillyTavern extensions directory:
   ```
   SillyTavern/public/scripts/extensions/third-party/sidecar-lore
   ```

2. Restart SillyTavern or reload the page

3. Enable the extension in the Extensions panel

## Configuration

Access settings via the Extensions panel in SillyTavern:

### General Settings
- **Enable Sidecar Lore**: Master toggle for the extension
- **Auto-update on messages**: Automatically analyze chat for state changes
- **Update every N messages**: How often to run analysis (1 = every message)
- **Messages to analyze**: Number of recent messages sent to analyzer

### Model Selection
- **Updater Model**: Select preset for frequent state updates (use cheaper/faster models)
- **Architect Model**: Select preset for schema design (use smarter models)

### Context Injection
- **Inject sidecar into prompts**: Enable automatic context injection
- **Injection position**: Where to insert context (system prompt, before last message, after character card)

## Usage

### Automatic Mode
1. Enable auto-update in settings
2. Chat with your character as normal
3. The extension will periodically analyze the conversation
4. A popup will show proposed changes for your approval
5. Select which changes to apply and click "Approve"

### Manual Mode
1. Click the **Analyze Now** button in settings or character panel
2. Review proposed changes in the popup
3. Approve selected changes

### Architect Mode
1. Click the **Architect Mode** button
2. The smart model will analyze your story
3. Review suggested new tracking categories
4. Add selected trackers to your character's schema

### Character Sheet Panel
- Click the floating card icon to open the panel
- View all tracked data organized by category
- Sections are collapsible for easy navigation
- Use panel buttons to analyze, architect, or refresh

## Tracked Data

### Default Trackers
- **Status**: Health, energy, mood, conditions
- **Appearance**: Clothing, physical appearance
- **Inventory**: Equipped items, bag contents
- **Relationships**: Sentiment, trust level, notes
- **Knowledge**: Facts the character knows
- **Timeline**: Significant events with turn numbers
- **Plot Threads**: Active and resolved quests/goals

### World Lore (Shared)
- **Factions**: Global groups and standings
- **Locations**: State of visited places
- **Calendar**: Current date and events
- **Global State**: Custom world variables

## Delta Operations

The extension uses these operations to update data:

| Operation | Description | Example |
|-----------|-------------|---------|
| `set` | Replace a value | `{"op": "set", "path": "status.health", "value": "Injured"}` |
| `add` | Add to array (no duplicates) | `{"op": "add", "path": "inventory.bag", "value": "Potion"}` |
| `remove` | Remove from array | `{"op": "remove", "path": "conditions", "value": "Bleeding"}` |
| `append` | Always add to array | `{"op": "append", "path": "timeline", "value": {...}}` |
| `increment` | Add to number | `{"op": "increment", "path": "trust", "value": 10}` |

## Troubleshooting

### Extension not loading
- Check browser console for errors
- Ensure files are in the correct directory
- Verify manifest.json is valid JSON

### Analysis not running
- Check that auto-update is enabled
- Verify your LLM API is configured and working
- Try running manual analysis

### Changes not applying
- Ensure you click "Approve Selected" in the popup
- Check the browser console for errors

### Context not appearing in prompts
- Verify "Inject sidecar into prompts" is enabled
- Check injection position setting
- Ensure a sidecar exists for the current character

## Development

### File Structure
```
sidecar-lore/
├── manifest.json         # Extension registration
├── index.js              # Main entry point
├── style.css             # All styling
├── settings.html         # Settings UI
├── README.md             # This file
└── lib/
    ├── sidecar-manager.js    # JSON file I/O
    ├── llm-handler.js        # LLM API interactions
    ├── delta-engine.js       # Operation logic
    ├── context-injector.js   # Prompt injection
    └── ui-popup.js           # UI components
```

### Key APIs Used
- `SillyTavern.getContext()` - Access ST context
- `generateRaw()` - Raw LLM generation with JSON schema support
- `eventSource.on()` - Event hooks
- `chatMetadata` - Per-chat data storage
- `extensionSettings` - Persistent settings

## License

MIT License - feel free to modify and share!

## Credits

Developed for the SillyTavern community.
