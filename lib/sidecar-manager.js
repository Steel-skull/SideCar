/**
 * Sidecar Manager - JSON File I/O and Caching
 * Handles loading, saving, and creating sidecar data for characters and world lore
 */

// Default schema for new character sidecars
const DEFAULT_CHARACTER_SCHEMA = {
    meta: {
        version: '1.0',
        characterId: '',
        name: '',
        type: 'main', // main | npc | companion
        lastUpdated: ''
    },
    trackers: {
        status: {
            health: 'Healthy',
            energy: 'Normal',
            mood: 'Neutral',
            conditions: []
        },
        appearance: {
            clothing: '',
            physical: ''
        },
        inventory: {
            equipped: {
                mainHand: 'Empty',
                offHand: 'Empty'
            },
            bag: []
        },
        relationships: {},
        knowledge: []
    },
    timeline: [],
    plotThreads: {
        active: [],
        resolved: []
    }
};

// Default schema for world lore
const DEFAULT_WORLD_SCHEMA = {
    meta: {
        version: '1.0',
        lastUpdated: ''
    },
    factions: {},
    locations: {},
    calendar: {
        currentDate: '',
        events: []
    },
    globalState: {}
};

/**
 * SidecarManager class
 * Handles all data persistence operations
 */
export class SidecarManager {
    constructor() {
        this.cache = new Map();
        this.worldCache = null;
        this.deltaEngine = null;
        this.saveQueue = new Map();
        this.saveDelay = 500; // Debounce delay in ms
    }

    /**
     * Set the delta engine reference
     */
    setDeltaEngine(engine) {
        this.deltaEngine = engine;
    }

    /**
     * Generate a storage key for chat metadata
     */
    getStorageKey(characterId) {
        return `sidecar_${characterId}`;
    }

    /**
     * Load sidecar data for a character
     * Creates new sidecar if none exists
     */
    async load(characterId, options = {}) {
        if (!characterId) {
            console.warn('[SidecarManager] No character ID provided');
            return null;
        }

        // Check cache first
        if (this.cache.has(characterId) && !options.forceReload) {
            return this.cache.get(characterId);
        }

        try {
            const context = SillyTavern.getContext();
            const { chatMetadata } = context;
            
            const storageKey = this.getStorageKey(characterId);
            let data = chatMetadata[storageKey];

            if (!data) {
                // Create new sidecar
                data = await this.create(characterId);
            }

            // Update cache
            this.cache.set(characterId, data);
            return data;

        } catch (error) {
            console.error('[SidecarManager] Load failed:', error);
            return null;
        }
    }

    /**
     * Create a new sidecar for a character
     */
    async create(characterId, options = {}) {
        const context = SillyTavern.getContext();
        const { chatMetadata, saveMetadata, characters, characterId: charIndex } = context;

        // Get character name
        let characterName = options.name || 'Unknown';
        if (charIndex !== undefined && characters[charIndex]) {
            characterName = characters[charIndex].name || characterName;
        }

        // Create from default schema
        const data = structuredClone(DEFAULT_CHARACTER_SCHEMA);
        data.meta.characterId = characterId;
        data.meta.name = characterName;
        data.meta.type = options.type || 'main';
        data.meta.lastUpdated = new Date().toISOString();

        // Store in chat metadata
        const storageKey = this.getStorageKey(characterId);
        chatMetadata[storageKey] = data;
        await saveMetadata();

        // Update cache
        this.cache.set(characterId, data);

        console.log(`[SidecarManager] Created new sidecar for ${characterName}`);
        return data;
    }

    /**
     * Save sidecar data for a character (debounced)
     */
    async save(characterId, data) {
        if (!characterId || !data) {
            console.warn('[SidecarManager] Invalid save parameters');
            return false;
        }

        // Update timestamp
        data.meta.lastUpdated = new Date().toISOString();

        // Update cache immediately
        this.cache.set(characterId, data);

        // Debounced save
        if (this.saveQueue.has(characterId)) {
            clearTimeout(this.saveQueue.get(characterId));
        }

        return new Promise((resolve) => {
            const timeoutId = setTimeout(async () => {
                try {
                    const context = SillyTavern.getContext();
                    const { chatMetadata, saveMetadata } = context;

                    const storageKey = this.getStorageKey(characterId);
                    chatMetadata[storageKey] = data;
                    await saveMetadata();

                    this.saveQueue.delete(characterId);
                    console.log(`[SidecarManager] Saved sidecar for ${characterId}`);
                    resolve(true);
                } catch (error) {
                    console.error('[SidecarManager] Save failed:', error);
                    resolve(false);
                }
            }, this.saveDelay);

            this.saveQueue.set(characterId, timeoutId);
        });
    }

    /**
     * Apply delta operations to a character's sidecar
     */
    async applyUpdates(characterId, operations) {
        if (!characterId || !operations || operations.length === 0) {
            return false;
        }

        const data = await this.load(characterId);
        if (!data) {
            console.error('[SidecarManager] Cannot apply updates: no sidecar loaded');
            return false;
        }

        if (!this.deltaEngine) {
            console.error('[SidecarManager] Delta engine not initialized');
            return false;
        }

        // Apply each operation
        for (const op of operations) {
            try {
                this.deltaEngine.apply(data, op);
            } catch (error) {
                console.error(`[SidecarManager] Failed to apply operation:`, op, error);
            }
        }

        // Save updated data
        await this.save(characterId, data);
        return true;
    }

    /**
     * Expand the sidecar schema with new trackers
     */
    async expandSchema(characterId, schemaChanges) {
        const data = await this.load(characterId);
        if (!data) {
            return false;
        }

        // Merge new trackers into existing structure
        if (schemaChanges.trackers) {
            for (const [key, value] of Object.entries(schemaChanges.trackers)) {
                if (!data.trackers[key]) {
                    data.trackers[key] = value;
                } else if (typeof value === 'object' && !Array.isArray(value)) {
                    // Deep merge for objects
                    data.trackers[key] = { ...data.trackers[key], ...value };
                }
            }
        }

        await this.save(characterId, data);
        console.log('[SidecarManager] Schema expanded successfully');
        return true;
    }

    /**
     * Get cached sidecar data (synchronous)
     */
    getCache(characterId) {
        return this.cache.get(characterId) || null;
    }

    /**
     * Reload context when chat changes
     */
    async reloadContext(characterId) {
        // Clear cache for this character
        this.cache.delete(characterId);
        
        // Reload data
        return await this.load(characterId, { forceReload: true });
    }

    /**
     * Load world lore data
     */
    async loadWorldLore() {
        if (this.worldCache) {
            return this.worldCache;
        }

        try {
            const context = SillyTavern.getContext();
            const { chatMetadata } = context;

            let data = chatMetadata['sidecar_world_lore'];

            if (!data) {
                data = await this.createWorldLore();
            }

            this.worldCache = data;
            return data;

        } catch (error) {
            console.error('[SidecarManager] Load world lore failed:', error);
            return null;
        }
    }

    /**
     * Create new world lore data
     */
    async createWorldLore() {
        const context = SillyTavern.getContext();
        const { chatMetadata, saveMetadata } = context;

        const data = structuredClone(DEFAULT_WORLD_SCHEMA);
        data.meta.lastUpdated = new Date().toISOString();

        chatMetadata['sidecar_world_lore'] = data;
        await saveMetadata();

        this.worldCache = data;
        console.log('[SidecarManager] Created new world lore');
        return data;
    }

    /**
     * Save world lore data
     */
    async saveWorldLore(data) {
        if (!data) {
            return false;
        }

        data.meta.lastUpdated = new Date().toISOString();
        this.worldCache = data;

        try {
            const context = SillyTavern.getContext();
            const { chatMetadata, saveMetadata } = context;

            chatMetadata['sidecar_world_lore'] = data;
            await saveMetadata();

            return true;
        } catch (error) {
            console.error('[SidecarManager] Save world lore failed:', error);
            return false;
        }
    }

    /**
     * Apply delta operations to world lore
     */
    async applyWorldUpdates(operations) {
        if (!operations || operations.length === 0) {
            return false;
        }

        const data = await this.loadWorldLore();
        if (!data || !this.deltaEngine) {
            return false;
        }

        for (const op of operations) {
            try {
                this.deltaEngine.apply(data, op);
            } catch (error) {
                console.error('[SidecarManager] Failed to apply world operation:', op, error);
            }
        }

        await this.saveWorldLore(data);
        return true;
    }

    /**
     * Export sidecar data for a character
     */
    exportData(characterId) {
        const data = this.cache.get(characterId);
        if (!data) {
            return null;
        }
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import sidecar data for a character
     */
    async importData(characterId, jsonString) {
        try {
            const data = JSON.parse(jsonString);
            
            // Validate basic structure
            if (!data.meta || !data.trackers) {
                throw new Error('Invalid sidecar format');
            }

            // Update character ID to match current
            data.meta.characterId = characterId;
            data.meta.lastUpdated = new Date().toISOString();

            await this.save(characterId, data);
            return true;
        } catch (error) {
            console.error('[SidecarManager] Import failed:', error);
            return false;
        }
    }

    /**
     * Reset sidecar to default state
     */
    async reset(characterId) {
        this.cache.delete(characterId);
        return await this.create(characterId);
    }

    /**
     * Delete sidecar data
     */
    async delete(characterId) {
        this.cache.delete(characterId);

        try {
            const context = SillyTavern.getContext();
            const { chatMetadata, saveMetadata } = context;

            const storageKey = this.getStorageKey(characterId);
            delete chatMetadata[storageKey];
            await saveMetadata();

            return true;
        } catch (error) {
            console.error('[SidecarManager] Delete failed:', error);
            return false;
        }
    }

    /**
     * Get all tracked NPCs from relationships
     */
    getTrackedNPCs(characterId) {
        const data = this.cache.get(characterId);
        if (!data || !data.trackers.relationships) {
            return [];
        }

        return Object.keys(data.trackers.relationships);
    }

    /**
     * Create NPC sidecar from detection
     */
    async createNPC(npcData) {
        const npcId = `npc_${npcData.name.toLowerCase().replace(/\s+/g, '_')}`;
        
        return await this.create(npcId, {
            name: npcData.name,
            type: 'npc'
        });
    }
}

export default SidecarManager;
