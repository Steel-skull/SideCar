/**
 * LLM Handler - API Interactions
 * Handles communication with SillyTavern's LLM API for analysis
 */

// System prompt for the Cheap/Updater model
const EXTRACTION_SYSTEM_PROMPT = `You are Sidecar, a background process that tracks RPG character states.
Your goal is to analyze the latest story developments and output JSON operations to update the character's state.

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

Available Paths:
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

Rules:
1. ONLY output changes based on what actually happened in the story
2. If nothing significant changed, output { "operations": [] }
3. Be specific and concise with values
4. Detect new named NPCs that appear frequently or importantly
5. Note any contradictions between story and tracked state
6. Focus on what changed, not what stayed the same

Output Format (JSON only, no markdown):
{
  "operations": [
    { "op": "set", "path": "...", "value": "..." }
  ],
  "newNPCs": [
    { "name": "NPC Name", "notes": "Brief description" }
  ],
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
    description: 'Delta operations to update character sidecar state',
    strict: false, // Allow extra fields like newNPCs
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
            'newNPCs': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'name': { 'type': 'string' },
                        'notes': { 'type': 'string' }
                    }
                }
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

        // Active plots
        if (sidecar.plotThreads?.active?.length > 0) {
            lines.push(`\nActive Quests:`);
            sidecar.plotThreads.active.forEach(q => {
                lines.push(`  - ${q.name}: ${q.status || 'In Progress'}`);
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
        
        const result = await generateQuietPrompt({
            quietPrompt: fullPrompt,
            skipWIAN: true, // Skip world info/author's note injection
        });
        
        return result;
    }

    /**
     * Analyze chat for state changes (Cheap model)
     */
    async analyzeChanges(chatHistory, currentSidecar, options = {}) {
        const settings = this.getSettings();
        const context = SillyTavern.getContext();
        const { generateRaw } = context;

        // Validate we have the generateRaw function
        if (!generateRaw || typeof generateRaw !== 'function') {
            throw new Error('[LLMHandler] generateRaw function not available in SillyTavern context');
        }

        // Validate chat history
        if (!chatHistory || chatHistory.length === 0) {
            console.warn('[LLMHandler] No chat history provided for analysis');
            return { operations: [], newNPCs: [], contradictions: [] };
        }

        // Format the prompt
        const stateText = this.formatSidecarState(currentSidecar);
        const chatText = this.formatChatHistory(chatHistory);

        const userPrompt = `CURRENT STATE:
${stateText}

RECENT STORY (Last ${chatHistory.length} messages):
${chatText}

INSTRUCTIONS:
Analyze the story for changes to the character's state. Output JSON operations to update the sidecar.
Focus on: health changes, inventory changes, relationship shifts, new knowledge, significant events.
If nothing significant changed, return empty operations array.`;

        try {
            let result;
            
            console.log('[LLMHandler] Starting analysis with generateRaw...');
            console.log('[LLMHandler] Using structured output:', settings.useStructuredOutput);
            
            if (settings.useStructuredOutput) {
                // Use JSON schema for structured output
                result = await generateRaw({
                    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
                    prompt: userPrompt,
                    jsonSchema: DELTA_OPERATIONS_SCHEMA
                });
            } else {
                // Regular generation with JSON instruction
                result = await generateRaw({
                    systemPrompt: EXTRACTION_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON.',
                    prompt: userPrompt
                });
            }

            console.log('[LLMHandler] Analysis completed, parsing result...');
            
            // Parse the result
            return this.parseOperationsResult(result);

        } catch (error) {
            // Enhanced error logging
            console.error('[LLMHandler] Analysis failed:', error);
            
            // Check for specific error types
            if (error.message?.includes('Bad Request')) {
                console.error('[LLMHandler] Bad Request error - this may indicate:');
                console.error('  - The API connection is not properly configured');
                console.error('  - The selected model does not support the request format');
                console.error('  - There was an issue with profile/preset switching');
                console.error('  - The jsonSchema format is not supported by the current API');
                console.error('  - The preset has invalid settings (check Logit Bias preset setting)');
                
                // If structured output was used, try without it first
                if (settings.useStructuredOutput) {
                    console.log('[LLMHandler] Retrying without structured output...');
                    try {
                        const result = await generateRaw({
                            systemPrompt: EXTRACTION_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                            prompt: userPrompt
                        });
                        console.log('[LLMHandler] Retry without schema succeeded');
                        return this.parseOperationsResult(result);
                    } catch (retryError) {
                        console.error('[LLMHandler] Retry without schema also failed:', retryError);
                        
                        // Try generateQuietPrompt as final fallback
                        console.log('[LLMHandler] Trying generateQuietPrompt as final fallback...');
                        try {
                            const quietResult = await this.tryGenerateQuiet(
                                EXTRACTION_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                                userPrompt,
                                false
                            );
                            console.log('[LLMHandler] generateQuietPrompt fallback succeeded');
                            return this.parseOperationsResult(quietResult);
                        } catch (quietError) {
                            console.error('[LLMHandler] All generation methods failed.');
                            console.error('[LLMHandler] Please check your preset configuration.');
                            console.error('[LLMHandler] The "Lore Management" preset may have an invalid Logit Bias preset setting.');
                            throw quietError;
                        }
                    }
                }
                
                // No structured output, try generateQuietPrompt directly
                console.log('[LLMHandler] Trying generateQuietPrompt as fallback...');
                try {
                    const quietResult = await this.tryGenerateQuiet(
                        EXTRACTION_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                        userPrompt,
                        false
                    );
                    console.log('[LLMHandler] generateQuietPrompt fallback succeeded');
                    return this.parseOperationsResult(quietResult);
                } catch (quietError) {
                    console.error('[LLMHandler] All generation methods failed.');
                    console.error('[LLMHandler] Please check your preset configuration.');
                    throw quietError;
                }
            }
            
            throw error;
        }
    }

    /**
     * Parse the LLM response for operations
     */
    parseOperationsResult(result) {
        if (!result) {
            return { operations: [], newNPCs: [], contradictions: [] };
        }

        // If already an object, use directly
        if (typeof result === 'object') {
            return {
                operations: result.operations || [],
                newNPCs: result.newNPCs || [],
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
                newNPCs: parsed.newNPCs || [],
                contradictions: parsed.contradictions || []
            };
        } catch (error) {
            console.error('[LLMHandler] Failed to parse JSON result:', error);
            console.log('[LLMHandler] Raw result:', result);
            return { operations: [], newNPCs: [], contradictions: [] };
        }
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

        try {
            let result;
            
            console.log('[LLMHandler] Starting architect analysis with generateRaw...');
            console.log('[LLMHandler] Using structured output:', settings.useStructuredOutput);
            
            if (settings.useStructuredOutput) {
                result = await generateRaw({
                    systemPrompt: ARCHITECT_SYSTEM_PROMPT,
                    prompt: userPrompt,
                    jsonSchema: ARCHITECT_SCHEMA
                });
            } else {
                result = await generateRaw({
                    systemPrompt: ARCHITECT_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON.',
                    prompt: userPrompt
                });
            }

            console.log('[LLMHandler] Architect analysis completed, parsing result...');
            return this.parseArchitectResult(result);

        } catch (error) {
            console.error('[LLMHandler] Architect analysis failed:', error);
            
            // Check for specific error types
            if (error.message?.includes('Bad Request')) {
                console.error('[LLMHandler] Bad Request error - this may indicate:');
                console.error('  - The API connection is not properly configured');
                console.error('  - The selected model does not support the request format');
                console.error('  - There was an issue with profile/preset switching');
                console.error('  - The jsonSchema format is not supported by the current API');
                console.error('  - The preset has invalid settings (check Logit Bias preset setting)');
                
                // If structured output was used, try without it first
                if (settings.useStructuredOutput) {
                    console.log('[LLMHandler] Retrying architect analysis without structured output...');
                    try {
                        const result = await generateRaw({
                            systemPrompt: ARCHITECT_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                            prompt: userPrompt
                        });
                        console.log('[LLMHandler] Architect retry without schema succeeded');
                        return this.parseArchitectResult(result);
                    } catch (retryError) {
                        console.error('[LLMHandler] Architect retry without schema also failed:', retryError);
                        
                        // Try generateQuietPrompt as final fallback
                        console.log('[LLMHandler] Trying generateQuietPrompt as final fallback...');
                        try {
                            const quietResult = await this.tryGenerateQuiet(
                                ARCHITECT_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                                userPrompt,
                                false
                            );
                            console.log('[LLMHandler] generateQuietPrompt fallback succeeded');
                            return this.parseArchitectResult(quietResult);
                        } catch (quietError) {
                            console.error('[LLMHandler] All architect generation methods failed.');
                            console.error('[LLMHandler] Please check your preset configuration.');
                            throw quietError;
                        }
                    }
                }
                
                // No structured output, try generateQuietPrompt directly
                console.log('[LLMHandler] Trying generateQuietPrompt as fallback...');
                try {
                    const quietResult = await this.tryGenerateQuiet(
                        ARCHITECT_SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON, no markdown formatting.',
                        userPrompt,
                        false
                    );
                    console.log('[LLMHandler] generateQuietPrompt fallback succeeded');
                    return this.parseArchitectResult(quietResult);
                } catch (quietError) {
                    console.error('[LLMHandler] All architect generation methods failed.');
                    console.error('[LLMHandler] Please check your preset configuration.');
                    throw quietError;
                }
            }
            
            throw error;
        }
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
