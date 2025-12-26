/**
 * LLM Handler - API Interactions
 * Handles communication with SillyTavern's LLM API for analysis
 */

// System prompt for the Cheap/Updater model
const EXTRACTION_SYSTEM_PROMPT = `You are Sidecar, a background process that tracks RPG character states and NPCs.
Your goal is to analyze the latest story developments and output JSON operations to update the character's state, plus classify any NPCs that appear.

Supported Operations:
- set: { "op": "set", "path": "trackers.status.health", "value": "New Value" }
  Use for replacing single values
- add: { "op": "add", "path": "trackers.inventory.bag", "value": "New Item" }
  Use for adding items to arrays (avoids duplicates)
- remove: { "op": "remove", "path": "trackers.status.conditions", "value": "Bleeding" }
  Use for removing items from arrays
- append: { "op": "append", "path": "timeline", "value": { "turn": 5, "event": "..." } }
  Use for always adding to arrays (timeline events)
- increment: { "op": "increment", "path": "trackers.relationships.Bob.trustLevel", "value": 10 }
  Use for adjusting numeric values (positive or negative)

Available Paths for Main Character:
- trackers.status.health - Physical condition
- trackers.status.energy - Stamina/fatigue level
- trackers.status.mood - Emotional state
- trackers.status.conditions - Array of active conditions/effects
- trackers.appearance.clothing - Current attire
- trackers.appearance.physical - Physical appearance changes
- trackers.inventory.equipped.mainHand - Primary weapon/tool
- trackers.inventory.equipped.offHand - Secondary item
- trackers.inventory.bag - Array of carried items
- trackers.relationships.[Name].sentiment - How they feel about someone
- trackers.relationships.[Name].trustLevel - Numeric trust (0-100)
- trackers.relationships.[Name].notes - Relationship details
- trackers.knowledge - Array of things the character knows
- timeline - Array of significant events
- plotThreads.active - Array of ongoing quests/goals
- plotThreads.resolved - Array of completed quests

NPC Classification Instructions:
For each named NPC mentioned in the story, evaluate their narrative significance:

MINOR NPCs are:
- Background characters with minimal dialogue
- Mentioned but not actively participating in story
- Functional roles (shopkeeper, guard) without personality development
- One-time encounter characters

MAJOR NPCs are:
- Characters with recurring significant interactions
- Those with developed personalities or backstories revealed
- Active antagonists or allies with clear motivations
- Characters with emotional significance to the protagonist
- Anyone whose goals/motivations drive plot threads

For MAJOR NPCs, you can also provide operations to update their tracked state using paths like:
- trackers.status.health, trackers.status.mood
- trackers.personality.traits, trackers.personality.goals
- trackers.relationships.[Name].sentiment
- trackers.knowledge
- narrativeRole.archetype, narrativeRole.storyFunction

Rules:
1. ONLY output changes based on what actually happened in the story
2. If nothing significant changed, output { "operations": [] }
3. Be specific and concise with values
4. Classify all named NPCs encountered in the scene
5. Note any contradictions between story and tracked state
6. Focus on what changed, not what stayed the same
7. New NPCs default to "minor" unless clearly significant
8. Include scene-relevant NPCs that should be contextually aware

Output Format (JSON only, no markdown):
{
  "operations": [
    { "op": "set", "path": "...", "value": "..." }
  ],
  "npcClassifications": [
    {
      "name": "NPC Name",
      "currentClassification": "minor|major|new",
      "recommendedClassification": "minor|major",
      "reasoning": "Brief explanation for classification",
      "sceneRelevant": true,
      "sentiment": "Their attitude toward main character",
      "updates": [
        { "op": "set", "path": "data.notes", "value": "Description" }
      ]
    }
  ],
  "sceneNPCs": ["Name1", "Name2"],
  "contradictions": [
    { "issue": "What doesn't match", "path": "affected.path" }
  ]
}`;

// System prompt for the Architect/Smart model
const ARCHITECT_SYSTEM_PROMPT = `You are the Dungeon Master's Assistant.
Analyze the story context, genre, and current events to design NEW tracking categories for the Sidecar system.

Current tracked data includes:
- Status (health, energy, mood, conditions)
- Appearance (clothing, physical)
- Inventory (equipped, bag items)
- Relationships (sentiment, trust, notes)
- Knowledge (array of known facts)
- Timeline (event history)
- Plot Threads (active and resolved)

Your job is to identify what ADDITIONAL tracking might be valuable based on:
1. The genre (fantasy, sci-fi, horror, romance, etc.)
2. Recurring themes in the story
3. Game mechanics that have emerged (magic systems, skills, etc.)
4. Unique story elements that need tracking

Examples of custom trackers:
- For magic: "mana", "spell_slots", "known_spells"
- For political intrigue: "faction_standings", "secrets_known", "debts_owed"
- For survival: "hunger", "thirst", "temperature", "diseases"
- For romance: "affection_levels", "romantic_history", "date_events"
- For horror: "sanity", "fear_level", "encounters_survived"

Output Format (JSON only):
{
  "recommendations": [
    {
      "name": "tracker_name",
      "description": "Why this tracker would be useful",
      "schema": {
        "type": "object|array|string|number",
        "default": "initial value or structure"
      },
      "priority": "high|medium|low"
    }
  ],
  "reasoning": "Brief explanation of the story analysis"
}`;

// JSON Schema for delta operations output
const DELTA_OPERATIONS_SCHEMA = {
    name: 'SidecarDeltaOperations',
    description: 'Delta operations to update character sidecar state and classify NPCs',
    strict: false, // Allow extra fields like npcClassifications
    value: {
        '$schema': 'http://json-schema.org/draft-04/schema#',
        'type': 'object',
        'properties': {
            'operations': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'op': {
                            'type': 'string',
                            'enum': ['set', 'add', 'remove', 'append', 'increment']
                        },
                        'path': { 'type': 'string' },
                        'value': {}
                    },
                    'required': ['op', 'path']
                }
            },
            'npcClassifications': {
                'type': 'array',
                'description': 'Classification and updates for NPCs encountered in the story',
                'items': {
                    'type': 'object',
                    'properties': {
                        'name': { 'type': 'string', 'description': 'NPC name' },
                        'currentClassification': {
                            'type': 'string',
                            'enum': ['minor', 'major', 'new'],
                            'description': 'Current known classification or new if first encounter'
                        },
                        'recommendedClassification': {
                            'type': 'string',
                            'enum': ['minor', 'major'],
                            'description': 'Recommended classification based on narrative significance'
                        },
                        'reasoning': { 'type': 'string', 'description': 'Brief explanation for classification' },
                        'sceneRelevant': { 'type': 'boolean', 'description': 'Whether NPC is active in current scene' },
                        'sentiment': { 'type': 'string', 'description': 'NPC attitude toward main character' },
                        'updates': {
                            'type': 'array',
                            'description': 'Delta operations to apply to this NPC sidecar',
                            'items': {
                                'type': 'object',
                                'properties': {
                                    'op': {
                                        'type': 'string',
                                        'enum': ['set', 'add', 'remove', 'append', 'increment']
                                    },
                                    'path': { 'type': 'string' },
                                    'value': {}
                                },
                                'required': ['op', 'path']
                            }
                        }
                    },
                    'required': ['name', 'recommendedClassification']
                }
            },
            'sceneNPCs': {
                'type': 'array',
                'description': 'List of NPC names currently active in the scene',
                'items': { 'type': 'string' }
            },
            'contradictions': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'issue': { 'type': 'string' },
                        'path': { 'type': 'string' }
                    }
                }
            }
        },
        'required': ['operations']
    }
};

// JSON Schema for architect recommendations
const ARCHITECT_SCHEMA = {
    name: 'SidecarArchitectRecommendations',
    description: 'Schema recommendations from the Architect model',
    strict: false,
    value: {
        '$schema': 'http://json-schema.org/draft-04/schema#',
        'type': 'object',
        'properties': {
            'recommendations': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'name': { 'type': 'string' },
                        'description': { 'type': 'string' },
                        'schema': { 'type': 'object' },
                        'priority': {
                            'type': 'string',
                            'enum': ['high', 'medium', 'low']
                        }
                    },
                    'required': ['name', 'description', 'schema']
                }
            },
            'reasoning': { 'type': 'string' }
        },
        'required': ['recommendations']
    }
};

/**
 * LLMHandler class
 * Manages LLM API calls for state analysis
 */
export class LLMHandler {
    constructor(getSettingsFn) {
        this.getSettings = getSettingsFn;
    }

    /**
     * Format chat history for prompt
     */
    formatChatHistory(chatHistory) {
        return chatHistory.map((msg, index) => {
            const role = msg.is_user ? 'User' : (msg.name || 'Character');
            const content = msg.mes || msg.message || '';
            return `[${role}]: ${content}`;
        }).join('\n\n');
    }

    /**
     * Format current sidecar state for prompt
     */
    formatSidecarState(sidecar) {
        if (!sidecar) {
            return '(No existing state - this is a new character)';
        }

        const lines = [];
        
        // Meta
        lines.push(`Character: ${sidecar.meta.name} (${sidecar.meta.type})`);
        
        // Status
        if (sidecar.trackers.status) {
            const s = sidecar.trackers.status;
            lines.push(`\nStatus:`);
            if (s.health) lines.push(`  Health: ${s.health}`);
            if (s.energy) lines.push(`  Energy: ${s.energy}`);
            if (s.mood) lines.push(`  Mood: ${s.mood}`);
            if (s.conditions?.length > 0) {
                lines.push(`  Conditions: ${s.conditions.join(', ')}`);
            }
        }

        // Appearance
        if (sidecar.trackers.appearance) {
            const a = sidecar.trackers.appearance;
            if (a.clothing || a.physical) {
                lines.push(`\nAppearance:`);
                if (a.clothing) lines.push(`  Clothing: ${a.clothing}`);
                if (a.physical) lines.push(`  Physical: ${a.physical}`);
            }
        }

        // Inventory
        if (sidecar.trackers.inventory) {
            const inv = sidecar.trackers.inventory;
            lines.push(`\nInventory:`);
            if (inv.equipped) {
                lines.push(`  Main Hand: ${inv.equipped.mainHand || 'Empty'}`);
                lines.push(`  Off Hand: ${inv.equipped.offHand || 'Empty'}`);
            }
            if (inv.bag?.length > 0) {
                lines.push(`  Bag: ${inv.bag.join(', ')}`);
            }
        }

        // Relationships
        if (sidecar.trackers.relationships) {
            const rels = Object.entries(sidecar.trackers.relationships);
            if (rels.length > 0) {
                lines.push(`\nRelationships:`);
                for (const [name, rel] of rels) {
                    lines.push(`  ${name}: ${rel.sentiment || 'Unknown'} (Trust: ${rel.trustLevel || 'N/A'})`);
                    if (rel.notes) lines.push(`    Note: ${rel.notes}`);
                }
            }
        }

        // Knowledge
        if (sidecar.trackers.knowledge?.length > 0) {
            lines.push(`\nKnowledge:`);
            sidecar.trackers.knowledge.forEach(k => lines.push(`  - ${k}`));
        }

        // Recent timeline (last 5)
        if (sidecar.timeline?.length > 0) {
            lines.push(`\nRecent Events:`);
            const recent = sidecar.timeline.slice(-5);
            for (const event of recent) {
                lines.push(`  - ${event.event}${event.turn ? ` (Turn ${event.turn})` : ''}`);
            }
        }

        // Active plots - ensure active is an array before iterating
        const activePlots = Array.isArray(sidecar.plotThreads?.active) ? sidecar.plotThreads.active : [];
        if (activePlots.length > 0) {
            lines.push(`\nActive Quests:`);
            activePlots.forEach(q => {
                const name = typeof q === 'object' ? q.name : q;
                const status = typeof q === 'object' ? (q.status || 'In Progress') : 'In Progress';
                lines.push(`  - ${name}: ${status}`);
            });
        }

        return lines.join('\n');
    }

    /**
     * Try to generate using generateQuietPrompt as a fallback
     * This uses a different code path that may avoid preset issues
     */
    async tryGenerateQuiet(systemPrompt, userPrompt, useSchema) {
        const context = SillyTavern.getContext();
        const { generateQuietPrompt } = context;
        
        if (!generateQuietPrompt || typeof generateQuietPrompt !== 'function') {
            throw new Error('[LLMHandler] generateQuietPrompt not available');
        }
        
        // Combine system prompt and user prompt for quiet generation
        const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
        
        console.log('[LLMHandler] Calling generateQuietPrompt...');
        const result = await generateQuietPrompt({
            quietPrompt: fullPrompt,
            skipWIAN: true, // Skip world info/author's note injection
        });
        
        return result;
    }
    
    /**
     * Alternative generation using fetch directly to bypass ST's preset handling
     * This is a last-resort fallback when all other methods fail due to preset issues
     */
    async tryDirectFetch(systemPrompt, userPrompt) {
        const context = SillyTavern.getContext();
        
        // Get current API settings
        const mainApi = context.main_api;
        console.log('[LLMHandler] tryDirectFetch - main_api:', mainApi);
        
        // For OpenRouter/OpenAI compatible APIs
        if (mainApi === 'openai') {
            const oai_settings = context.oai_settings;
            const apiUrl = oai_settings?.custom_url || 'https://openrouter.ai/api/v1/chat/completions';
            const apiKey = context.getSecretState?.()?.OPENAI_SECRET || context.secrets?.api_key_openrouter;
            
            if (!apiKey) {
                throw new Error('[LLMHandler] No API key found for direct fetch');
            }
            
            console.log('[LLMHandler] Making direct API call to:', apiUrl);
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'SillyTavern Sidecar'
                },
                body: JSON.stringify({
                    model: oai_settings?.openrouter_model || 'anthropic/claude-3-haiku-20240307',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 2000,
                    temperature: 0.3
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[LLMHandler] Direct fetch error:', response.status, errorText);
                throw new Error(`Direct API call failed: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            return data.choices?.[0]?.message?.content || '';
        }
        
        throw new Error('[LLMHandler] Direct fetch not supported for API: ' + mainApi);
    }

    /**
     * Analyze chat for state changes (Cheap model)
     * @param {Array} chatHistory - Array of chat messages to analyze
     * @param {Object} currentSidecar - Current main character sidecar state
     * @param {Object} options - Additional options
     * @param {Object} options.npcRegistry - NPC registry data to include in prompt
     * @param {boolean} options.enableNPCTracking - Whether to track NPCs (default: true)
     */
    async analyzeChanges(chatHistory, currentSidecar, options = {}) {
        const settings = this.getSettings();
        const context = SillyTavern.getContext();
        const { generateRaw } = context;
        const { npcRegistry = null, enableNPCTracking = true } = options;

        // Validate we have the generateRaw function
        if (!generateRaw || typeof generateRaw !== 'function') {
            throw new Error('[LLMHandler] generateRaw function not available in SillyTavern context');
        }

        // Validate chat history
        if (!chatHistory || chatHistory.length === 0) {
            console.warn('[LLMHandler] No chat history provided for analysis');
            return { operations: [], npcClassifications: [], sceneNPCs: [], contradictions: [] };
        }

        // Format the prompt
        const stateText = this.formatSidecarState(currentSidecar);
        const chatText = this.formatChatHistory(chatHistory);
        
        // Include NPC registry if enabled
        const npcText = enableNPCTracking ? this.formatNPCRegistryForPrompt(npcRegistry) : '';
        const npcInstructions = enableNPCTracking
            ? `Also classify any named NPCs encountered and recommend whether they should be tracked as minor or major characters.`
            : '';

        const userPrompt = `CURRENT MAIN CHARACTER STATE:
${stateText}

${npcText ? `${npcText}\n\n` : ''}RECENT STORY (Last ${chatHistory.length} messages):
${chatText}

INSTRUCTIONS:
Analyze the story for changes to the character's state. Output JSON operations to update the sidecar.
Focus on: health changes, inventory changes, relationship shifts, new knowledge, significant events.
${npcInstructions}
If nothing significant changed, return empty operations array.`;

        // Try multiple generation approaches with fallbacks
        let lastError = null;
        
        // Approach 1: Try with structured output (if enabled)
        if (settings.useStructuredOutput) {
            try {
                console.log('[LLMHandler] Approach 1: Trying generateRaw with JSON schema...');
                const result = await generateRaw({
                    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
                    prompt: userPrompt,
                    jsonSchema: DELTA_OPERATIONS_SCHEMA
                });
                console.log('[LLMHandler] Approach 1 succeeded');
                return this.parseOperationsResult(result);
            } catch (error) {
                console.warn('[LLMHandler] Approach 1 failed:', error.message);
                lastError = error;
            }
        }
        
        // Approach 2: Try generateRaw without schema
        try {
            console.log('[LLMHandler] Approach 2: Trying generateRaw without schema...');
            const result = await generateRaw({
                systemPrompt: EXTRACTION_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                prompt: userPrompt
            });
            console.log('[LLMHandler] Approach 2 succeeded');
            return this.parseOperationsResult(result);
        } catch (error) {
            console.warn('[LLMHandler] Approach 2 failed:', error.message);
            lastError = error;
        }
        
        // Approach 3: Try generateQuietPrompt
        try {
            console.log('[LLMHandler] Approach 3: Trying generateQuietPrompt...');
            const result = await this.tryGenerateQuiet(
                EXTRACTION_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                userPrompt,
                false
            );
            console.log('[LLMHandler] Approach 3 succeeded');
            return this.parseOperationsResult(result);
        } catch (error) {
            console.warn('[LLMHandler] Approach 3 failed:', error.message);
            lastError = error;
        }
        
        // Approach 4: Try direct API call (bypasses ST preset handling entirely)
        try {
            console.log('[LLMHandler] Approach 4: Trying direct API fetch (bypassing ST)...');
            const result = await this.tryDirectFetch(
                EXTRACTION_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                userPrompt
            );
            console.log('[LLMHandler] Approach 4 succeeded');
            return this.parseOperationsResult(result);
        } catch (error) {
            console.warn('[LLMHandler] Approach 4 failed:', error.message);
            lastError = error;
        }
        
        // All approaches failed
        console.error('[LLMHandler] All generation approaches failed!');
        console.error('[LLMHandler] This usually indicates a problem with your preset configuration:');
        console.error('  - Check if the Logit Bias preset setting is valid');
        console.error('  - Try selecting a different preset in Sidecar settings');
        console.error('  - Or fix the preset in SillyTavern OpenAI/Chat Completion settings');
        throw lastError;
    }

    /**
     * Parse the LLM response for operations and NPC classifications
     */
    parseOperationsResult(result) {
        const emptyResult = {
            operations: [],
            npcClassifications: [],
            sceneNPCs: [],
            contradictions: []
        };

        if (!result) {
            return emptyResult;
        }

        // If already an object, use directly
        if (typeof result === 'object') {
            return {
                operations: result.operations || [],
                npcClassifications: this.normalizeNPCClassifications(result.npcClassifications || result.newNPCs || []),
                sceneNPCs: result.sceneNPCs || [],
                contradictions: result.contradictions || []
            };
        }

        // Try to parse as JSON
        try {
            // Clean up common issues
            let cleaned = result.trim();
            
            // Remove markdown code blocks if present
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const parsed = JSON.parse(cleaned);
            return {
                operations: parsed.operations || [],
                npcClassifications: this.normalizeNPCClassifications(parsed.npcClassifications || parsed.newNPCs || []),
                sceneNPCs: parsed.sceneNPCs || [],
                contradictions: parsed.contradictions || []
            };
        } catch (error) {
            console.error('[LLMHandler] Failed to parse JSON result:', error);
            console.log('[LLMHandler] Raw result:', result);
            return emptyResult;
        }
    }

    /**
     * Normalize NPC classification data from LLM response
     * Handles both old newNPCs format and new npcClassifications format
     */
    normalizeNPCClassifications(npcData) {
        if (!Array.isArray(npcData)) {
            return [];
        }

        return npcData.map(npc => {
            // Handle old format: { name, notes }
            if (npc.notes && !npc.recommendedClassification) {
                return {
                    name: npc.name,
                    currentClassification: 'new',
                    recommendedClassification: 'minor', // Default new NPCs to minor
                    reasoning: 'Newly encountered NPC',
                    sceneRelevant: true,
                    sentiment: 'neutral',
                    updates: [
                        { op: 'set', path: 'data.notes', value: npc.notes }
                    ]
                };
            }

            // Handle new format - ensure all fields have defaults
            return {
                name: npc.name || 'Unknown',
                currentClassification: npc.currentClassification || 'new',
                recommendedClassification: npc.recommendedClassification || 'minor',
                reasoning: npc.reasoning || '',
                sceneRelevant: npc.sceneRelevant !== false,
                sentiment: npc.sentiment || 'neutral',
                updates: npc.updates || []
            };
        }).filter(npc => npc.name && npc.name !== 'Unknown');
    }

    /**
     * Format NPC registry summary for inclusion in the analysis prompt
     * @param {Object} npcRegistry - The NPC registry instance or data object
     * @returns {string} Formatted text describing known NPCs
     */
    formatNPCRegistryForPrompt(npcRegistry) {
        if (!npcRegistry) {
            return '(No tracked NPCs yet)';
        }
        
        // Handle both NPCRegistry class instance and raw data object
        let registryData;
        if (typeof npcRegistry.getRegistryData === 'function') {
            registryData = npcRegistry.getRegistryData();
        } else {
            registryData = npcRegistry;
        }
        
        if (!registryData || !registryData.npcs || Object.keys(registryData.npcs).length === 0) {
            return '(No tracked NPCs yet)';
        }

        const lines = ['KNOWN NPCs:'];
        
        // Group by classification
        const majorNPCs = [];
        const minorNPCs = [];
        
        for (const [npcId, npc] of Object.entries(registryData.npcs)) {
            if (npc.meta.classification === 'major') {
                majorNPCs.push(npc);
            } else {
                minorNPCs.push(npc);
            }
        }

        // Format major NPCs (more detail)
        if (majorNPCs.length > 0) {
            lines.push('\n[MAJOR CHARACTERS]');
            for (const npc of majorNPCs) {
                lines.push(`  ${npc.meta.name} (seen ${npc.meta.appearanceCount}x, last: msg #${npc.meta.lastSeen})`);
                if (npc.trackers?.status?.mood) {
                    lines.push(`    Mood: ${npc.trackers.status.mood}`);
                }
                if (npc.data?.sentiment) {
                    lines.push(`    Sentiment toward MC: ${npc.data.sentiment}`);
                }
                if (npc.narrativeRole?.archetype) {
                    lines.push(`    Role: ${npc.narrativeRole.archetype}`);
                }
            }
        }

        // Format minor NPCs (brief)
        if (minorNPCs.length > 0) {
            lines.push('\n[MINOR CHARACTERS]');
            for (const npc of minorNPCs) {
                const notes = npc.data?.notes || 'No notes';
                lines.push(`  ${npc.meta.name}: ${notes} (seen ${npc.meta.appearanceCount}x)`);
            }
        }

        // Scene context
        if (registryData.sceneContext?.activeNPCs?.length > 0) {
            lines.push(`\n[CURRENT SCENE NPCs]: ${registryData.sceneContext.activeNPCs.join(', ')}`);
        }

        return lines.join('\n');
    }

    /**
     * Analyze schema for expansion (Architect model)
     */
    async analyzeSchema(chatHistory, currentSidecar, options = {}) {
        const settings = this.getSettings();
        const context = SillyTavern.getContext();
        const { generateRaw } = context;

        // Validate we have the generateRaw function
        if (!generateRaw || typeof generateRaw !== 'function') {
            throw new Error('[LLMHandler] generateRaw function not available in SillyTavern context');
        }

        // Validate chat history
        if (!chatHistory || chatHistory.length === 0) {
            console.warn('[LLMHandler] No chat history provided for architect analysis');
            return [];
        }

        const stateText = this.formatSidecarState(currentSidecar);
        const chatText = this.formatChatHistory(chatHistory);

        const userPrompt = `CURRENT TRACKED STATE:
${stateText}

STORY CONTEXT (${chatHistory.length} messages):
${chatText}

INSTRUCTIONS:
Analyze this roleplay to recommend NEW tracking categories that would enhance continuity.
Consider the genre, themes, and what information would be valuable to track.
Only recommend trackers that would actually be useful for this specific story.`;

        // Try multiple generation approaches with fallbacks
        let lastError = null;
        
        // Approach 1: Try with structured output (if enabled)
        if (settings.useStructuredOutput) {
            try {
                console.log('[LLMHandler] Architect Approach 1: Trying generateRaw with JSON schema...');
                const result = await generateRaw({
                    systemPrompt: ARCHITECT_SYSTEM_PROMPT,
                    prompt: userPrompt,
                    jsonSchema: ARCHITECT_SCHEMA
                });
                console.log('[LLMHandler] Architect Approach 1 succeeded');
                return this.parseArchitectResult(result);
            } catch (error) {
                console.warn('[LLMHandler] Architect Approach 1 failed:', error.message);
                lastError = error;
            }
        }
        
        // Approach 2: Try generateRaw without schema
        try {
            console.log('[LLMHandler] Architect Approach 2: Trying generateRaw without schema...');
            const result = await generateRaw({
                systemPrompt: ARCHITECT_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                prompt: userPrompt
            });
            console.log('[LLMHandler] Architect Approach 2 succeeded');
            return this.parseArchitectResult(result);
        } catch (error) {
            console.warn('[LLMHandler] Architect Approach 2 failed:', error.message);
            lastError = error;
        }
        
        // Approach 3: Try generateQuietPrompt
        try {
            console.log('[LLMHandler] Architect Approach 3: Trying generateQuietPrompt...');
            const result = await this.tryGenerateQuiet(
                ARCHITECT_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                userPrompt,
                false
            );
            console.log('[LLMHandler] Architect Approach 3 succeeded');
            return this.parseArchitectResult(result);
        } catch (error) {
            console.warn('[LLMHandler] Architect Approach 3 failed:', error.message);
            lastError = error;
        }
        
        // Approach 4: Try direct API call (bypasses ST preset handling entirely)
        try {
            console.log('[LLMHandler] Architect Approach 4: Trying direct API fetch (bypassing ST)...');
            const result = await this.tryDirectFetch(
                ARCHITECT_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                userPrompt
            );
            console.log('[LLMHandler] Architect Approach 4 succeeded');
            return this.parseArchitectResult(result);
        } catch (error) {
            console.warn('[LLMHandler] Architect Approach 4 failed:', error.message);
            lastError = error;
        }
        
        // All approaches failed
        console.error('[LLMHandler] All architect generation approaches failed!');
        console.error('[LLMHandler] This usually indicates a problem with your preset configuration:');
        console.error('  - Check if the Logit Bias preset setting is valid');
        console.error('  - Try selecting a different preset in Sidecar settings');
        console.error('  - Or fix the preset in SillyTavern OpenAI/Chat Completion settings');
        throw lastError;
    }

    /**
     * Parse the Architect LLM response
     */
    parseArchitectResult(result) {
        if (!result) {
            return [];
        }

        if (typeof result === 'object') {
            return result.recommendations || [];
        }

        try {
            let cleaned = result.trim();
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const parsed = JSON.parse(cleaned);
            return parsed.recommendations || [];
        } catch (error) {
            console.error('[LLMHandler] Failed to parse architect result:', error);
            return [];
        }
    }
}

export default LLMHandler;
export { EXTRACTION_SYSTEM_PROMPT, ARCHITECT_SYSTEM_PROMPT };
