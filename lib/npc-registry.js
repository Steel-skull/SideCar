/**
 * NPC Registry - NPC Sidecar Management
 * Handles tracking, storage, and management of NPC character sidecars
 */

// Classification types for NPCs
export const NPC_CLASSIFICATION = {
    MINOR: 'minor',
    MAJOR: 'major'
};

// Default schema for minor NPC sidecars (lightweight)
export const MINOR_NPC_SCHEMA = {
    meta: {
        npcId: '',
        name: '',
        classification: 'minor',
        firstAppearance: '',      // ISO timestamp
        lastSeen: '',             // ISO timestamp
        appearanceCount: 0,
        userPinned: false,        // Prevents auto-downgrade if true
        createdAt: '',
        lastUpdated: ''
    },
    data: {
        notes: '',                // Brief description/role
        sentiment: '',            // Relationship to main character
        lastContext: ''           // Last interaction summary
    }
};

// Default schema for major NPC sidecars (comprehensive)
export const MAJOR_NPC_SCHEMA = {
    meta: {
        npcId: '',
        name: '',
        classification: 'major',
        firstAppearance: '',
        lastSeen: '',
        appearanceCount: 0,
        userPinned: false,
        promotedFrom: null,       // 'minor' if upgraded
        promotionReason: '',
        createdAt: '',
        lastUpdated: ''
    },
    trackers: {
        status: {
            health: 'Unknown',
            energy: 'Unknown',
            mood: 'Unknown',
            conditions: []
        },
        appearance: {
            clothing: '',
            physical: ''
        },
        inventory: {
            equipped: {
                mainHand: 'Unknown',
                offHand: 'Unknown'
            },
            bag: []
        },
        personality: {
            traits: [],
            goals: [],
            fears: [],
            motivations: ''
        },
        relationships: {},        // Their relationships with others
        knowledge: []             // What this NPC knows
    },
    timeline: [],                 // This NPC's event history
    narrativeRole: {
        archetype: '',            // Mentor, Antagonist, Love Interest, etc.
        storyFunction: '',        // Current narrative purpose
        conflictsWith: [],        // Characters they oppose
        alliedWith: []            // Characters they support
    }
};

// Default schema for the NPC registry container
export const NPC_REGISTRY_SCHEMA = {
    meta: {
        version: '1.0',
        lastUpdated: '',
        totalNPCs: 0,
        majorCount: 0,
        minorCount: 0
    },
    npcs: {},                     // Keyed by npcId -> NPC sidecar data
    sceneContext: {
        currentScene: '',
        activeNPCs: [],           // NPCs present in current scene
        recentlyMentioned: []     // NPCs mentioned in last N messages
    }
};

/**
 * NPCRegistry class
 * Manages NPC sidecars separately from the main character sidecar
 */
export class NPCRegistry {
    constructor() {
        this.registry = null;
        this.deltaEngine = null;
        this.saveQueue = null;
        this.saveDelay = 500;
    }

    /**
     * Set the delta engine reference for applying operations
     */
    setDeltaEngine(engine) {
        this.deltaEngine = engine;
    }

    /**
     * Generate a unique NPC ID from the name
     */
    generateNpcId(name) {
        if (!name) return null;
        return `npc_${name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    }

    /**
     * Get the storage key for the NPC registry
     */
    getStorageKey() {
        return 'sidecar_npc_registry';
    }

    /**
     * Load the NPC registry from chat metadata
     */
    async load(options = {}) {
        // Return cached if available and not forcing reload
        if (this.registry && !options.forceReload) {
            return this.registry;
        }

        try {
            const context = SillyTavern.getContext();
            const { chatMetadata } = context;

            const storageKey = this.getStorageKey();
            let data = chatMetadata[storageKey];

            if (!data) {
                // Create new registry
                data = await this.create();
            }

            this.registry = data;
            return data;

        } catch (error) {
            console.error('[NPCRegistry] Load failed:', error);
            return null;
        }
    }

    /**
     * Create a new empty NPC registry
     */
    async create() {
        const context = SillyTavern.getContext();
        const { chatMetadata, saveMetadata } = context;

        const data = structuredClone(NPC_REGISTRY_SCHEMA);
        data.meta.lastUpdated = new Date().toISOString();

        const storageKey = this.getStorageKey();
        chatMetadata[storageKey] = data;
        await saveMetadata();

        this.registry = data;
        console.log('[NPCRegistry] Created new NPC registry');
        return data;
    }

    /**
     * Save the NPC registry (debounced)
     */
    async save() {
        if (!this.registry) {
            console.warn('[NPCRegistry] No registry to save');
            return false;
        }

        // Update timestamp
        this.registry.meta.lastUpdated = new Date().toISOString();

        // Update counts
        this.updateCounts();

        // Debounced save
        if (this.saveQueue) {
            clearTimeout(this.saveQueue);
        }

        return new Promise((resolve) => {
            this.saveQueue = setTimeout(async () => {
                try {
                    const context = SillyTavern.getContext();
                    const { chatMetadata, saveMetadata } = context;

                    const storageKey = this.getStorageKey();
                    chatMetadata[storageKey] = this.registry;
                    await saveMetadata();

                    this.saveQueue = null;
                    console.log('[NPCRegistry] Registry saved');
                    resolve(true);
                } catch (error) {
                    console.error('[NPCRegistry] Save failed:', error);
                    resolve(false);
                }
            }, this.saveDelay);
        });
    }

    /**
     * Update NPC counts in registry meta
     */
    updateCounts() {
        if (!this.registry) return;

        const npcs = Object.values(this.registry.npcs);
        this.registry.meta.totalNPCs = npcs.length;
        this.registry.meta.majorCount = npcs.filter(n => n.meta.classification === NPC_CLASSIFICATION.MAJOR).length;
        this.registry.meta.minorCount = npcs.filter(n => n.meta.classification === NPC_CLASSIFICATION.MINOR).length;
    }

    /**
     * Get an NPC by ID
     */
    getNPC(npcId) {
        if (!this.registry || !npcId) return null;
        return this.registry.npcs[npcId] || null;
    }

    /**
     * Get an NPC by name
     */
    getNPCByName(name) {
        const npcId = this.generateNpcId(name);
        return this.getNPC(npcId);
    }

    /**
     * Check if an NPC exists
     */
    hasNPC(npcId) {
        return this.registry && this.registry.npcs[npcId] !== undefined;
    }

    /**
     * Get or create an NPC sidecar
     * Creates as minor by default
     */
    async getOrCreate(name, options = {}) {
        await this.load();

        const npcId = this.generateNpcId(name);
        if (!npcId) {
            console.warn('[NPCRegistry] Invalid NPC name');
            return null;
        }

        // Return existing NPC
        if (this.hasNPC(npcId)) {
            const npc = this.getNPC(npcId);
            // Update last seen
            npc.meta.lastSeen = new Date().toISOString();
            npc.meta.appearanceCount++;
            await this.save();
            return npc;
        }

        // Create new NPC
        const classification = options.classification || NPC_CLASSIFICATION.MINOR;
        const now = new Date().toISOString();

        let npcData;
        if (classification === NPC_CLASSIFICATION.MAJOR) {
            npcData = structuredClone(MAJOR_NPC_SCHEMA);
        } else {
            npcData = structuredClone(MINOR_NPC_SCHEMA);
        }

        npcData.meta.npcId = npcId;
        npcData.meta.name = name;
        npcData.meta.classification = classification;
        npcData.meta.firstAppearance = now;
        npcData.meta.lastSeen = now;
        npcData.meta.appearanceCount = 1;
        npcData.meta.createdAt = now;
        npcData.meta.lastUpdated = now;

        // Apply any initial data from options
        if (options.notes) {
            if (classification === NPC_CLASSIFICATION.MINOR) {
                npcData.data.notes = options.notes;
            } else {
                // For major NPCs, add as initial knowledge
                npcData.trackers.knowledge.push(options.notes);
            }
        }

        if (options.sentiment) {
            if (classification === NPC_CLASSIFICATION.MINOR) {
                npcData.data.sentiment = options.sentiment;
            } else {
                // For major NPCs, store in relationships
                npcData.trackers.relationships.mainCharacter = {
                    sentiment: options.sentiment,
                    trustLevel: 50
                };
            }
        }

        this.registry.npcs[npcId] = npcData;
        await this.save();

        console.log(`[NPCRegistry] Created ${classification} NPC: ${name}`);
        return npcData;
    }

    /**
     * Update an NPC's data
     */
    async updateNPC(npcId, updates) {
        if (!this.registry || !this.hasNPC(npcId)) {
            console.warn('[NPCRegistry] NPC not found:', npcId);
            return false;
        }

        const npc = this.registry.npcs[npcId];
        
        // Apply updates
        if (updates.data) {
            Object.assign(npc.data || {}, updates.data);
        }
        if (updates.trackers) {
            Object.assign(npc.trackers || {}, updates.trackers);
        }
        if (updates.meta) {
            Object.assign(npc.meta, updates.meta);
        }

        npc.meta.lastUpdated = new Date().toISOString();
        await this.save();
        return true;
    }

    /**
     * Apply delta operations to an NPC
     */
    async applyOperations(npcId, operations) {
        if (!this.registry || !this.hasNPC(npcId) || !operations || operations.length === 0) {
            return false;
        }

        if (!this.deltaEngine) {
            console.error('[NPCRegistry] Delta engine not initialized');
            return false;
        }

        const npc = this.registry.npcs[npcId];

        for (const op of operations) {
            try {
                this.deltaEngine.apply(npc, op);
            } catch (error) {
                console.error(`[NPCRegistry] Failed to apply operation:`, op, error);
            }
        }

        npc.meta.lastUpdated = new Date().toISOString();
        await this.save();
        return true;
    }

    /**
     * Get all NPCs
     */
    getAllNPCs() {
        if (!this.registry) return [];
        return Object.values(this.registry.npcs);
    }

    /**
     * Get NPCs by classification
     */
    getByClassification(classification) {
        return this.getAllNPCs().filter(npc => npc.meta.classification === classification);
    }

    /**
     * Get major NPCs
     */
    getMajorNPCs() {
        return this.getByClassification(NPC_CLASSIFICATION.MAJOR);
    }

    /**
     * Get minor NPCs
     */
    getMinorNPCs() {
        return this.getByClassification(NPC_CLASSIFICATION.MINOR);
    }

    /**
     * Get NPCs active in current scene
     */
    getActiveNPCs() {
        if (!this.registry) return [];
        return this.registry.sceneContext.activeNPCs
            .map(npcId => this.getNPC(npcId))
            .filter(Boolean);
    }

    /**
     * Get recently mentioned NPCs
     */
    getRecentlyMentionedNPCs() {
        if (!this.registry) return [];
        return this.registry.sceneContext.recentlyMentioned
            .map(npcId => this.getNPC(npcId))
            .filter(Boolean);
    }

    /**
     * Update scene context
     */
    async updateSceneContext(sceneData) {
        if (!this.registry) return false;

        if (sceneData.currentScene !== undefined) {
            this.registry.sceneContext.currentScene = sceneData.currentScene;
        }
        if (sceneData.activeNPCs !== undefined) {
            this.registry.sceneContext.activeNPCs = sceneData.activeNPCs;
        }
        if (sceneData.recentlyMentioned !== undefined) {
            this.registry.sceneContext.recentlyMentioned = sceneData.recentlyMentioned;
        }

        await this.save();
        return true;
    }

    /**
     * Add NPC to recently mentioned list
     */
    async markAsMentioned(npcId) {
        if (!this.registry || !this.hasNPC(npcId)) return false;

        const mentioned = this.registry.sceneContext.recentlyMentioned;
        
        // Remove if already in list
        const index = mentioned.indexOf(npcId);
        if (index > -1) {
            mentioned.splice(index, 1);
        }
        
        // Add to front of list
        mentioned.unshift(npcId);
        
        // Keep only last 10
        if (mentioned.length > 10) {
            mentioned.splice(10);
        }

        // Also update the NPC's last seen
        const npc = this.getNPC(npcId);
        if (npc) {
            npc.meta.lastSeen = new Date().toISOString();
            npc.meta.appearanceCount++;
        }

        await this.save();
        return true;
    }

    /**
     * Set NPC classification
     */
    async setClassification(npcId, classification, reason = '') {
        if (!this.registry || !this.hasNPC(npcId)) return null;

        const npc = this.getNPC(npcId);
        const currentClassification = npc.meta.classification;

        // No change needed
        if (currentClassification === classification) {
            return npc;
        }

        // Check if user has pinned this NPC
        if (npc.meta.userPinned) {
            console.log(`[NPCRegistry] NPC ${npcId} is pinned, skipping classification change`);
            return npc;
        }

        // Return the NPC data - actual migration is handled by npc-classifier.js
        return { npc, currentClassification, targetClassification: classification, reason };
    }

    /**
     * Replace an NPC's data (used after migration)
     */
    async replaceNPC(npcId, newData) {
        if (!this.registry) return false;

        this.registry.npcs[npcId] = newData;
        await this.save();
        console.log(`[NPCRegistry] Replaced NPC data for: ${npcId}`);
        return true;
    }

    /**
     * Toggle user pin status for an NPC
     */
    async togglePin(npcId) {
        if (!this.registry || !this.hasNPC(npcId)) return false;

        const npc = this.getNPC(npcId);
        npc.meta.userPinned = !npc.meta.userPinned;
        await this.save();

        console.log(`[NPCRegistry] ${npc.meta.name} is now ${npc.meta.userPinned ? 'pinned' : 'unpinned'}`);
        return npc.meta.userPinned;
    }

    /**
     * Delete an NPC
     */
    async deleteNPC(npcId) {
        if (!this.registry || !this.hasNPC(npcId)) return false;

        const npc = this.getNPC(npcId);
        delete this.registry.npcs[npcId];

        // Remove from scene context lists
        this.registry.sceneContext.activeNPCs = 
            this.registry.sceneContext.activeNPCs.filter(id => id !== npcId);
        this.registry.sceneContext.recentlyMentioned = 
            this.registry.sceneContext.recentlyMentioned.filter(id => id !== npcId);

        await this.save();
        console.log(`[NPCRegistry] Deleted NPC: ${npc?.meta?.name || npcId}`);
        return true;
    }

    /**
     * Clear the entire registry
     */
    async clear() {
        this.registry = null;
        await this.create();
        return true;
    }

    /**
     * Reload the registry (force fetch from storage)
     */
    async reload() {
        this.registry = null;
        return await this.load({ forceReload: true });
    }

    /**
     * Export registry data as JSON string
     */
    exportData() {
        if (!this.registry) return null;
        return JSON.stringify(this.registry, null, 2);
    }

    /**
     * Import registry data from JSON string
     */
    async importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            // Validate basic structure
            if (!data.meta || !data.npcs) {
                throw new Error('Invalid NPC registry format');
            }

            data.meta.lastUpdated = new Date().toISOString();
            this.registry = data;
            await this.save();
            return true;
        } catch (error) {
            console.error('[NPCRegistry] Import failed:', error);
            return false;
        }
    }

    /**
     * Get registry statistics
     */
    getStats() {
        if (!this.registry) {
            return { total: 0, major: 0, minor: 0, active: 0, mentioned: 0 };
        }

        return {
            total: this.registry.meta.totalNPCs,
            major: this.registry.meta.majorCount,
            minor: this.registry.meta.minorCount,
            active: this.registry.sceneContext.activeNPCs.length,
            mentioned: this.registry.sceneContext.recentlyMentioned.length
        };
    }
}

export default NPCRegistry;
