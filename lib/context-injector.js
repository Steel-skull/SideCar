/**
 * Context Injector - Prompt Injection
 * Handles injecting sidecar data into LLM prompts
 */

/**
 * ContextInjector class
 * Manages the injection of sidecar context into prompts
 */
export class ContextInjector {
    constructor(sidecarManager) {
        this.sidecarManager = sidecarManager;
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
     */
    async inject(chat, characterId, position = 'system') {
        const sidecar = await this.sidecarManager.load(characterId);
        const sidecarContext = this.formatSidecarContext(sidecar);
        
        // Also get world lore
        const worldLore = await this.sidecarManager.loadWorldLore();
        const worldContext = this.formatWorldContext(worldLore);

        const fullContext = [sidecarContext, worldContext]
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

        console.log(`[ContextInjector] Injected sidecar context at position: ${position}`);
    }

    /**
     * Get context string without injection (for display)
     */
    async getContextPreview(characterId) {
        const sidecar = await this.sidecarManager.load(characterId);
        const worldLore = await this.sidecarManager.loadWorldLore();

        const sidecarContext = this.formatSidecarContext(sidecar);
        const worldContext = this.formatWorldContext(worldLore);

        return {
            character: sidecarContext,
            world: worldContext,
            combined: [sidecarContext, worldContext].filter(c => c.length > 0).join('\n\n')
        };
    }
}

export default ContextInjector;
