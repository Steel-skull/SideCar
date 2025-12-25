/**
 * Context Injector - Prompt Injection
 * Handles injecting sidecar data into LLM prompts
 */

/**
 * ContextInjector class
 * Manages the injection of sidecar context into prompts
 */
export class ContextInjector {
    constructor(sidecarManager, npcRegistry = null) {
        this.sidecarManager = sidecarManager;
        this.npcRegistry = npcRegistry;
    }

    /**
     * Set the NPC registry (can be set after construction)
     * @param {Object} npcRegistry - NPCRegistry instance
     */
    setNPCRegistry(npcRegistry) {
        this.npcRegistry = npcRegistry;
    }

    /**
     * Format sidecar data for injection into prompts
     */
    formatSidecarContext(sidecar, options = {}) {
        if (!sidecar) {
            return '';
        }

        const lines = [];
        const name = sidecar.meta.name || 'Character';

        lines.push(`[Sidecar: Current State for ${name}]`);

        // Status section
        if (sidecar.trackers.status) {
            const s = sidecar.trackers.status;
            if (s.health && s.health !== 'Healthy') {
                lines.push(`Health: ${s.health}`);
            }
            if (s.energy && s.energy !== 'Normal') {
                lines.push(`Energy: ${s.energy}`);
            }
            if (s.mood && s.mood !== 'Neutral') {
                lines.push(`Mood: ${s.mood}`);
            }
            if (s.conditions?.length > 0) {
                lines.push(`Conditions: ${s.conditions.join(', ')}`);
            }
        }

        // Appearance (only if notable)
        if (sidecar.trackers.appearance) {
            const a = sidecar.trackers.appearance;
            if (a.clothing) {
                lines.push(`Wearing: ${a.clothing}`);
            }
            if (a.physical) {
                lines.push(`Appearance: ${a.physical}`);
            }
        }

        // Inventory
        if (sidecar.trackers.inventory) {
            const inv = sidecar.trackers.inventory;
            const equipped = [];
            if (inv.equipped?.mainHand && inv.equipped.mainHand !== 'Empty') {
                equipped.push(`${inv.equipped.mainHand} in hand`);
            }
            if (inv.equipped?.offHand && inv.equipped.offHand !== 'Empty') {
                equipped.push(inv.equipped.offHand);
            }
            if (equipped.length > 0) {
                lines.push(`Equipped: ${equipped.join(', ')}`);
            }
            if (inv.bag?.length > 0) {
                lines.push(`Carrying: ${inv.bag.join(', ')}`);
            }
        }

        // Relationships (concise format)
        if (sidecar.trackers.relationships) {
            const rels = Object.entries(sidecar.trackers.relationships);
            if (rels.length > 0) {
                const relStrings = rels.map(([name, rel]) => {
                    let str = `${name}: ${rel.sentiment || 'Known'}`;
                    if (rel.trustLevel !== undefined) {
                        str += ` (${rel.trustLevel}%)`;
                    }
                    return str;
                });
                lines.push(`Relationships: ${relStrings.join('; ')}`);
            }
        }

        // Recent knowledge (most recent 3)
        if (sidecar.trackers.knowledge?.length > 0) {
            const recent = sidecar.trackers.knowledge.slice(-3);
            lines.push(`Knows: ${recent.join('; ')}`);
        }

        // Recent events (last 3)
        if (sidecar.timeline?.length > 0) {
            const recent = sidecar.timeline.slice(-3).map(e => e.event);
            lines.push(`Recent: ${recent.join('. ')}`);
        }

        // Active quests (brief)
        if (sidecar.plotThreads?.active?.length > 0) {
            const quests = sidecar.plotThreads.active.map(q => q.name);
            lines.push(`Goals: ${quests.join(', ')}`);
        }

        // Add any custom trackers
        const standardTrackers = ['status', 'appearance', 'inventory', 'relationships', 'knowledge'];
        for (const [key, value] of Object.entries(sidecar.trackers)) {
            if (!standardTrackers.includes(key) && value) {
                lines.push(`${this.formatKey(key)}: ${this.formatValue(value)}`);
            }
        }

        if (lines.length <= 1) {
            return ''; // Nothing notable to inject
        }

        return lines.join('\n');
    }

    /**
     * Format world lore for injection
     */
    formatWorldContext(worldLore) {
        if (!worldLore) {
            return '';
        }

        const lines = [];
        lines.push(`[Sidecar: World State]`);

        // Calendar
        if (worldLore.calendar?.currentDate) {
            lines.push(`Date: ${worldLore.calendar.currentDate}`);
        }

        // Factions
        if (worldLore.factions) {
            const factions = Object.entries(worldLore.factions);
            if (factions.length > 0) {
                const facStrings = factions.map(([name, data]) => {
                    if (typeof data === 'object') {
                        return `${name}: ${data.standing || data.status || 'Known'}`;
                    }
                    return `${name}: ${data}`;
                });
                lines.push(`Factions: ${facStrings.join('; ')}`);
            }
        }

        // Locations
        if (worldLore.locations) {
            const locs = Object.entries(worldLore.locations);
            if (locs.length > 0) {
                const locStrings = locs.map(([name, data]) => {
                    if (typeof data === 'object') {
                        return `${name}: ${data.state || data.status || 'Visited'}`;
                    }
                    return `${name}: ${data}`;
                });
                lines.push(`Locations: ${locStrings.join('; ')}`);
            }
        }

        // Global state
        if (worldLore.globalState) {
            for (const [key, value] of Object.entries(worldLore.globalState)) {
                lines.push(`${this.formatKey(key)}: ${this.formatValue(value)}`);
            }
        }

        if (lines.length <= 1) {
            return '';
        }

        return lines.join('\n');
    }

    /**
     * Format NPC context for injection into prompts
     * @param {Object} options - Configuration options
     * @param {boolean} options.sceneOnly - Only include scene-relevant NPCs
     * @param {boolean} options.majorOnly - Only include major NPCs
     * @param {number} options.maxNPCs - Maximum NPCs to include
     * @returns {string} Formatted NPC context
     */
    formatNPCContext(options = {}) {
        if (!this.npcRegistry) {
            return '';
        }

        const {
            sceneOnly = false,
            majorOnly = false,
            maxNPCs = 10
        } = options;

        const registryData = this.npcRegistry.getRegistryData();
        if (!registryData || !registryData.npcs || Object.keys(registryData.npcs).length === 0) {
            return '';
        }

        // Get NPCs to include based on options
        let npcsToInclude = this.getRelevantNPCs(registryData, {
            sceneOnly,
            majorOnly,
            maxNPCs
        });

        if (npcsToInclude.length === 0) {
            return '';
        }

        const lines = ['[Sidecar: NPCs in Story]'];
        
        // Separate major and minor NPCs
        const majorNPCs = npcsToInclude.filter(npc => npc.meta.classification === 'major');
        const minorNPCs = npcsToInclude.filter(npc => npc.meta.classification === 'minor');

        // Format major NPCs with more detail
        if (majorNPCs.length > 0) {
            lines.push('');
            lines.push('KEY CHARACTERS:');
            for (const npc of majorNPCs) {
                lines.push(this.formatMajorNPC(npc));
            }
        }

        // Format minor NPCs briefly
        if (minorNPCs.length > 0 && !majorOnly) {
            lines.push('');
            lines.push('BACKGROUND CHARACTERS:');
            for (const npc of minorNPCs) {
                lines.push(this.formatMinorNPC(npc));
            }
        }

        return lines.join('\n');
    }

    /**
     * Format a major NPC for context injection
     * @param {Object} npc - Major NPC sidecar data
     * @returns {string} Formatted NPC description
     */
    formatMajorNPC(npc) {
        const lines = [];
        const name = npc.meta.name;
        
        // Name and core info
        let header = `• ${name}`;
        if (npc.narrativeRole?.archetype) {
            header += ` (${npc.narrativeRole.archetype})`;
        }
        lines.push(header);

        // Status
        if (npc.trackers?.status) {
            const s = npc.trackers.status;
            const statusParts = [];
            if (s.mood && s.mood !== 'Neutral') statusParts.push(`Mood: ${s.mood}`);
            if (s.health && s.health !== 'Healthy') statusParts.push(`Health: ${s.health}`);
            if (statusParts.length > 0) {
                lines.push(`  ${statusParts.join(', ')}`);
            }
        }

        // Sentiment toward MC
        if (npc.data?.sentiment) {
            lines.push(`  Attitude: ${npc.data.sentiment}`);
        }

        // Key personality traits
        if (npc.trackers?.personality?.traits?.length > 0) {
            const traits = npc.trackers.personality.traits.slice(0, 3).join(', ');
            lines.push(`  Traits: ${traits}`);
        }

        // Current goal if known
        if (npc.trackers?.personality?.goals?.length > 0) {
            lines.push(`  Goal: ${npc.trackers.personality.goals[0]}`);
        }

        // Recent knowledge about MC
        if (npc.trackers?.relationships) {
            const mcRelation = Object.entries(npc.trackers.relationships)[0];
            if (mcRelation) {
                const [relName, relData] = mcRelation;
                if (relData.notes) {
                    lines.push(`  ${relName}: ${relData.notes}`);
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Format a minor NPC for context injection (brief)
     * @param {Object} npc - Minor NPC sidecar data
     * @returns {string} Brief NPC description
     */
    formatMinorNPC(npc) {
        const name = npc.meta.name;
        const notes = npc.data?.notes || 'Unknown';
        const sentiment = npc.data?.sentiment;
        
        let line = `• ${name}: ${notes}`;
        if (sentiment && sentiment !== 'neutral') {
            line += ` (${sentiment})`;
        }
        
        return line;
    }

    /**
     * Get NPCs relevant for context injection
     * @param {Object} registryData - Full registry data
     * @param {Object} options - Filter options
     * @returns {Array} Array of NPC sidecars to include
     */
    getRelevantNPCs(registryData, options = {}) {
        const { sceneOnly = false, majorOnly = false, maxNPCs = 10 } = options;
        
        let npcs = Object.values(registryData.npcs);
        
        // Filter to major only if requested
        if (majorOnly) {
            npcs = npcs.filter(npc => npc.meta.classification === 'major');
        }
        
        // Filter to scene-relevant if requested
        if (sceneOnly && registryData.sceneContext?.activeNPCs?.length > 0) {
            const activeNames = new Set(registryData.sceneContext.activeNPCs.map(n => n.toLowerCase()));
            npcs = npcs.filter(npc => activeNames.has(npc.meta.name.toLowerCase()));
        }
        
        // Sort by relevance: scene-active first, then by appearance count
        const activeNPCs = new Set((registryData.sceneContext?.activeNPCs || []).map(n => n.toLowerCase()));
        npcs.sort((a, b) => {
            // Scene-active NPCs first
            const aActive = activeNPCs.has(a.meta.name.toLowerCase()) ? 1 : 0;
            const bActive = activeNPCs.has(b.meta.name.toLowerCase()) ? 1 : 0;
            if (aActive !== bActive) return bActive - aActive;
            
            // Major NPCs before minor
            if (a.meta.classification !== b.meta.classification) {
                return a.meta.classification === 'major' ? -1 : 1;
            }
            
            // Most recently seen first
            return (b.meta.lastSeen || 0) - (a.meta.lastSeen || 0);
        });
        
        // Limit count
        return npcs.slice(0, maxNPCs);
    }

    /**
     * Get the list of scene-active NPC names
     * @returns {Array} Names of NPCs active in current scene
     */
    getSceneNPCs() {
        if (!this.npcRegistry) {
            return [];
        }
        const registryData = this.npcRegistry.getRegistryData();
        return registryData?.sceneContext?.activeNPCs || [];
    }

    /**
     * Update scene context with new active NPCs
     * @param {Array} npcNames - Names of NPCs in current scene
     */
    updateSceneNPCs(npcNames) {
        if (!this.npcRegistry) {
            return;
        }
        this.npcRegistry.updateSceneContext(npcNames);
    }

    /**
     * Format a key for display
     */
    formatKey(key) {
        return key
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    /**
     * Format a value for display
     */
    formatValue(value) {
        if (value === null || value === undefined) {
            return 'Unknown';
        }
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }

    /**
     * Inject sidecar context into the chat array
     * Called by the prompt interceptor
     * @param {Array} chat - Chat message array to inject into
     * @param {string} characterId - Main character ID
     * @param {string} position - Injection position (system, author_note, character_note)
     * @param {Object} npcOptions - NPC injection options
     * @param {boolean} npcOptions.includeNPCs - Whether to include NPC context
     * @param {boolean} npcOptions.sceneOnly - Only include scene-relevant NPCs
     * @param {boolean} npcOptions.majorOnly - Only include major NPCs
     * @param {number} npcOptions.maxNPCs - Maximum NPCs to include
     */
    async inject(chat, characterId, position = 'system', npcOptions = {}) {
        const sidecar = await this.sidecarManager.load(characterId);
        const sidecarContext = this.formatSidecarContext(sidecar);
        
        // Also get world lore
        const worldLore = await this.sidecarManager.loadWorldLore();
        const worldContext = this.formatWorldContext(worldLore);

        // Get NPC context if enabled
        const {
            includeNPCs = true,
            sceneOnly = false,
            majorOnly = false,
            maxNPCs = 10
        } = npcOptions;
        
        let npcContext = '';
        if (includeNPCs && this.npcRegistry) {
            npcContext = this.formatNPCContext({
                sceneOnly,
                majorOnly,
                maxNPCs
            });
        }

        const fullContext = [sidecarContext, npcContext, worldContext]
            .filter(c => c.length > 0)
            .join('\n\n');

        if (!fullContext) {
            return; // Nothing to inject
        }

        // Create the injection message
        const injectionMessage = {
            is_user: false,
            is_system: true,
            name: 'Sidecar',
            mes: fullContext,
            extra: {
                isSmallSys: true, // Mark as small system message
                sidecar: true    // Mark as sidecar content
            }
        };

        // Inject based on position setting
        switch (position) {
            case 'system':
                // Add near the beginning, after any existing system messages
                let sysIndex = 0;
                for (let i = 0; i < chat.length; i++) {
                    if (chat[i].is_system) {
                        sysIndex = i + 1;
                    } else {
                        break;
                    }
                }
                chat.splice(sysIndex, 0, injectionMessage);
                break;

            case 'author_note':
                // Add before the last message
                if (chat.length > 0) {
                    chat.splice(chat.length - 1, 0, injectionMessage);
                } else {
                    chat.push(injectionMessage);
                }
                break;

            case 'character_note':
                // Add after the first message (typically character card)
                if (chat.length > 0) {
                    chat.splice(1, 0, injectionMessage);
                } else {
                    chat.push(injectionMessage);
                }
                break;

            default:
                // Default to before last message
                if (chat.length > 0) {
                    chat.splice(chat.length - 1, 0, injectionMessage);
                } else {
                    chat.push(injectionMessage);
                }
        }

        const npcCount = this.npcRegistry ? Object.keys(this.npcRegistry.getRegistryData()?.npcs || {}).length : 0;
        console.log(`[ContextInjector] Injected sidecar context at position: ${position} (NPCs: ${npcCount})`);
    }

    /**
     * Get context string without injection (for display)
     * @param {string} characterId - Main character ID
     * @param {Object} npcOptions - NPC display options
     * @returns {Object} Context preview with character, npc, world, and combined fields
     */
    async getContextPreview(characterId, npcOptions = {}) {
        const sidecar = await this.sidecarManager.load(characterId);
        const worldLore = await this.sidecarManager.loadWorldLore();

        const sidecarContext = this.formatSidecarContext(sidecar);
        const worldContext = this.formatWorldContext(worldLore);
        
        // Get NPC context
        const {
            includeNPCs = true,
            sceneOnly = false,
            majorOnly = false,
            maxNPCs = 10
        } = npcOptions;
        
        let npcContext = '';
        if (includeNPCs && this.npcRegistry) {
            npcContext = this.formatNPCContext({
                sceneOnly,
                majorOnly,
                maxNPCs
            });
        }

        return {
            character: sidecarContext,
            npcs: npcContext,
            world: worldContext,
            combined: [sidecarContext, npcContext, worldContext].filter(c => c.length > 0).join('\n\n')
        };
    }
}

export default ContextInjector;
