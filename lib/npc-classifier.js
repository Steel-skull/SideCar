/**
 * NPC Classifier - Classification Logic and Migration Utilities
 * Handles NPC major/minor classification and data migration between schemas
 */

import { NPC_CLASSIFICATION, MINOR_NPC_SCHEMA, MAJOR_NPC_SCHEMA } from './npc-registry.js';

/**
 * Classification result object structure
 * @typedef {Object} ClassificationResult
 * @property {string} name - NPC name
 * @property {string} npcId - Generated NPC ID
 * @property {string} currentClassification - Current classification: 'minor' | 'major' | 'new'
 * @property {string} recommendedClassification - Recommended classification: 'minor' | 'major'
 * @property {string} reasoning - LLM explanation for classification
 * @property {boolean} sceneRelevant - Whether NPC is relevant to current scene
 * @property {Object[]} updates - Delta operations for this NPC
 */

/**
 * Migrate a minor NPC sidecar to major NPC format
 * Preserves existing data and expands to full schema
 * 
 * @param {Object} minorSidecar - The minor NPC sidecar to upgrade
 * @param {string} reason - Reason for promotion
 * @returns {Object} Major NPC sidecar with migrated data
 */
export function migrateToMajor(minorSidecar, reason = 'Promoted based on narrative significance') {
    if (!minorSidecar || !minorSidecar.meta) {
        throw new Error('Invalid minor sidecar provided for migration');
    }

    const now = new Date().toISOString();

    // Create new major sidecar from schema
    const majorSidecar = structuredClone(MAJOR_NPC_SCHEMA);

    // Migrate meta information
    majorSidecar.meta = {
        ...majorSidecar.meta,
        npcId: minorSidecar.meta.npcId,
        name: minorSidecar.meta.name,
        classification: NPC_CLASSIFICATION.MAJOR,
        firstAppearance: minorSidecar.meta.firstAppearance,
        lastSeen: minorSidecar.meta.lastSeen || now,
        appearanceCount: minorSidecar.meta.appearanceCount || 1,
        userPinned: minorSidecar.meta.userPinned || false,
        promotedFrom: NPC_CLASSIFICATION.MINOR,
        promotionReason: reason,
        createdAt: minorSidecar.meta.createdAt || now,
        lastUpdated: now
    };

    // Migrate data fields to appropriate trackers
    if (minorSidecar.data) {
        // Notes become initial knowledge/personality info
        if (minorSidecar.data.notes) {
            majorSidecar.trackers.knowledge.push(minorSidecar.data.notes);
            
            // Also add to timeline as first tracked event
            majorSidecar.timeline.push({
                event: `First tracked: ${minorSidecar.data.notes}`,
                timestamp: minorSidecar.meta.firstAppearance || now
            });
        }

        // Sentiment becomes relationship with main character
        if (minorSidecar.data.sentiment) {
            majorSidecar.trackers.relationships.mainCharacter = {
                sentiment: minorSidecar.data.sentiment,
                trustLevel: getSentimentTrustLevel(minorSidecar.data.sentiment),
                notes: 'Relationship established during minor tracking'
            };
        }

        // Last context becomes timeline entry
        if (minorSidecar.data.lastContext) {
            majorSidecar.timeline.push({
                event: minorSidecar.data.lastContext,
                timestamp: minorSidecar.meta.lastSeen || now
            });
        }
    }

    console.log(`[NPCClassifier] Migrated ${minorSidecar.meta.name} from minor to major`);
    return majorSidecar;
}

/**
 * Migrate a major NPC sidecar to minor NPC format
 * Condenses data while preserving key information
 * 
 * @param {Object} majorSidecar - The major NPC sidecar to downgrade
 * @param {string} reason - Reason for demotion
 * @returns {Object} Minor NPC sidecar with condensed data
 */
export function migrateToMinor(majorSidecar, reason = 'Demoted due to reduced narrative importance') {
    if (!majorSidecar || !majorSidecar.meta) {
        throw new Error('Invalid major sidecar provided for migration');
    }

    const now = new Date().toISOString();

    // Create new minor sidecar from schema
    const minorSidecar = structuredClone(MINOR_NPC_SCHEMA);

    // Migrate meta information
    minorSidecar.meta = {
        ...minorSidecar.meta,
        npcId: majorSidecar.meta.npcId,
        name: majorSidecar.meta.name,
        classification: NPC_CLASSIFICATION.MINOR,
        firstAppearance: majorSidecar.meta.firstAppearance,
        lastSeen: majorSidecar.meta.lastSeen || now,
        appearanceCount: majorSidecar.meta.appearanceCount || 1,
        userPinned: majorSidecar.meta.userPinned || false,
        createdAt: majorSidecar.meta.createdAt || now,
        lastUpdated: now
    };

    // Condense tracker data into notes
    const noteParts = [];

    // Add personality summary
    if (majorSidecar.trackers?.personality) {
        const personality = majorSidecar.trackers.personality;
        if (personality.traits?.length > 0) {
            noteParts.push(`Traits: ${personality.traits.slice(0, 3).join(', ')}`);
        }
        if (personality.motivations) {
            noteParts.push(`Motivation: ${personality.motivations}`);
        }
    }

    // Add narrative role
    if (majorSidecar.narrativeRole) {
        if (majorSidecar.narrativeRole.archetype) {
            noteParts.push(`Role: ${majorSidecar.narrativeRole.archetype}`);
        }
        if (majorSidecar.narrativeRole.storyFunction) {
            noteParts.push(`Function: ${majorSidecar.narrativeRole.storyFunction}`);
        }
    }

    // Add most recent event from timeline
    if (majorSidecar.timeline?.length > 0) {
        const lastEvent = majorSidecar.timeline[majorSidecar.timeline.length - 1];
        noteParts.push(`Last known: ${lastEvent.event}`);
    }

    // Add key knowledge if any
    if (majorSidecar.trackers?.knowledge?.length > 0) {
        const recentKnowledge = majorSidecar.trackers.knowledge.slice(-2);
        noteParts.push(`Knows: ${recentKnowledge.join('; ')}`);
    }

    minorSidecar.data.notes = noteParts.join('. ') || majorSidecar.meta.name;

    // Extract sentiment from relationships
    if (majorSidecar.trackers?.relationships?.mainCharacter) {
        minorSidecar.data.sentiment = majorSidecar.trackers.relationships.mainCharacter.sentiment || 'Neutral';
    } else {
        // Try to infer from any relationship
        const relationships = Object.values(majorSidecar.trackers?.relationships || {});
        if (relationships.length > 0) {
            minorSidecar.data.sentiment = relationships[0].sentiment || 'Neutral';
        } else {
            minorSidecar.data.sentiment = 'Neutral';
        }
    }

    // Last context from most recent timeline entry
    if (majorSidecar.timeline?.length > 0) {
        minorSidecar.data.lastContext = majorSidecar.timeline[majorSidecar.timeline.length - 1].event;
    }

    console.log(`[NPCClassifier] Migrated ${majorSidecar.meta.name} from major to minor`);
    return minorSidecar;
}

/**
 * Remap operation paths based on NPC classification
 * Converts between minor (data.*) and major (trackers.*) path formats
 *
 * @param {Object[]} operations - Array of delta operations
 * @param {string} classification - NPC classification: 'minor' | 'major'
 * @returns {Object[]} Operations with remapped paths
 */
function remapOperationsForClassification(operations, classification) {
    if (!operations || !Array.isArray(operations)) {
        return [];
    }
    
    return operations.map(op => {
        const remappedOp = { ...op };
        
        if (classification === NPC_CLASSIFICATION.MINOR) {
            // For minor NPCs, map tracker paths to data paths
            if (remappedOp.path.startsWith('trackers.status.mood')) {
                // Map mood to sentiment
                remappedOp.path = 'data.sentiment';
            } else if (remappedOp.path.startsWith('trackers.')) {
                // Map any tracker path to notes (condense the info)
                remappedOp.path = 'data.notes';
                remappedOp.op = 'set'; // Notes is a string, use set instead of add
            } else if (remappedOp.path.startsWith('narrativeRole.')) {
                // Map narrative role to notes
                remappedOp.path = 'data.notes';
                remappedOp.op = 'set';
            }
        } else if (classification === NPC_CLASSIFICATION.MAJOR) {
            // For major NPCs, map data paths to tracker paths
            if (remappedOp.path === 'data.notes') {
                // Map notes to knowledge
                remappedOp.path = 'trackers.knowledge';
                remappedOp.op = 'add';
            } else if (remappedOp.path === 'data.sentiment') {
                // Map sentiment to relationship with main character
                remappedOp.path = 'trackers.relationships.mainCharacter.sentiment';
            } else if (remappedOp.path === 'data.lastContext') {
                // Map lastContext to timeline
                remappedOp.path = 'timeline';
                remappedOp.op = 'append';
                remappedOp.value = { event: remappedOp.value, timestamp: new Date().toISOString() };
            }
        }
        
        return remappedOp;
    }).filter(op => op.path && op.value !== undefined);
}

/**
 * Convert sentiment string to approximate trust level
 */
function getSentimentTrustLevel(sentiment) {
    if (!sentiment) return 50;

    const lowerSentiment = sentiment.toLowerCase();

    // Positive sentiments
    if (lowerSentiment.includes('friend') || lowerSentiment.includes('ally') || 
        lowerSentiment.includes('love') || lowerSentiment.includes('trust')) {
        return 75;
    }
    if (lowerSentiment.includes('warm') || lowerSentiment.includes('positive') ||
        lowerSentiment.includes('helpful') || lowerSentiment.includes('kind')) {
        return 65;
    }

    // Negative sentiments
    if (lowerSentiment.includes('enemy') || lowerSentiment.includes('hostile') ||
        lowerSentiment.includes('hate') || lowerSentiment.includes('distrust')) {
        return 15;
    }
    if (lowerSentiment.includes('cold') || lowerSentiment.includes('negative') ||
        lowerSentiment.includes('suspicious') || lowerSentiment.includes('wary')) {
        return 30;
    }

    // Neutral
    return 50;
}

/**
 * Evaluate if an NPC should be promoted to major based on metrics
 * Used for rule-based classification backup
 * 
 * @param {Object} npc - The NPC sidecar data
 * @param {Object} options - Evaluation options
 * @returns {Object} Evaluation result with recommendation and reasoning
 */
export function evaluateForPromotion(npc, options = {}) {
    const threshold = options.promotionThreshold || 3;
    const result = {
        shouldPromote: false,
        reason: '',
        score: 0,
        factors: []
    };

    if (!npc || npc.meta.classification === NPC_CLASSIFICATION.MAJOR) {
        return result;
    }

    // Factor 1: Appearance count
    if (npc.meta.appearanceCount >= threshold) {
        result.score += 30;
        result.factors.push(`Appeared ${npc.meta.appearanceCount} times (threshold: ${threshold})`);
    }

    // Factor 2: Has meaningful notes
    if (npc.data?.notes && npc.data.notes.length > 50) {
        result.score += 20;
        result.factors.push('Has detailed notes');
    }

    // Factor 3: Has positive/negative sentiment (not neutral)
    if (npc.data?.sentiment && 
        !npc.data.sentiment.toLowerCase().includes('neutral') &&
        !npc.data.sentiment.toLowerCase().includes('unknown')) {
        result.score += 15;
        result.factors.push(`Has defined sentiment: ${npc.data.sentiment}`);
    }

    // Factor 4: Recent activity (appeared in last 24 hours)
    if (npc.meta.lastSeen) {
        const lastSeen = new Date(npc.meta.lastSeen);
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (lastSeen > dayAgo) {
            result.score += 15;
            result.factors.push('Active recently');
        }
    }

    // Factor 5: User has pinned
    if (npc.meta.userPinned) {
        result.score += 30;
        result.factors.push('User has pinned this NPC');
    }

    // Threshold for promotion
    result.shouldPromote = result.score >= 50;
    result.reason = result.shouldPromote 
        ? `Score ${result.score}/100: ${result.factors.join('; ')}`
        : `Score ${result.score}/100 (need 50): ${result.factors.join('; ') || 'No significant factors'}`;

    return result;
}

/**
 * Evaluate if an NPC should be demoted to minor based on metrics
 * Used for rule-based classification backup
 * 
 * @param {Object} npc - The NPC sidecar data
 * @param {Object} options - Evaluation options
 * @returns {Object} Evaluation result with recommendation and reasoning
 */
export function evaluateForDemotion(npc, options = {}) {
    const inactivityDays = options.inactivityDays || 30;
    const result = {
        shouldDemote: false,
        reason: '',
        score: 0,
        factors: []
    };

    if (!npc || npc.meta.classification === NPC_CLASSIFICATION.MINOR) {
        return result;
    }

    // Never demote pinned NPCs
    if (npc.meta.userPinned) {
        result.reason = 'NPC is pinned by user';
        return result;
    }

    // Factor 1: Long inactivity
    if (npc.meta.lastSeen) {
        const lastSeen = new Date(npc.meta.lastSeen);
        const threshold = new Date(Date.now() - inactivityDays * 24 * 60 * 60 * 1000);
        if (lastSeen < threshold) {
            result.score += 40;
            result.factors.push(`Inactive for ${inactivityDays}+ days`);
        }
    }

    // Factor 2: Low appearance count
    if (npc.meta.appearanceCount < 3) {
        result.score += 20;
        result.factors.push(`Low appearance count: ${npc.meta.appearanceCount}`);
    }

    // Factor 3: Empty/sparse trackers
    let emptyTrackers = 0;
    if (npc.trackers) {
        if (npc.trackers.knowledge?.length === 0) emptyTrackers++;
        if (Object.keys(npc.trackers.relationships || {}).length === 0) emptyTrackers++;
        if (npc.trackers.personality?.traits?.length === 0) emptyTrackers++;
        if (!npc.trackers.appearance?.physical && !npc.trackers.appearance?.clothing) emptyTrackers++;
    }
    if (emptyTrackers >= 3) {
        result.score += 20;
        result.factors.push(`Sparse data (${emptyTrackers} empty tracker sections)`);
    }

    // Factor 4: No narrative role defined
    if (!npc.narrativeRole?.archetype && !npc.narrativeRole?.storyFunction) {
        result.score += 15;
        result.factors.push('No narrative role defined');
    }

    // Threshold for demotion
    result.shouldDemote = result.score >= 50;
    result.reason = result.shouldDemote 
        ? `Score ${result.score}/100: ${result.factors.join('; ')}`
        : `Score ${result.score}/100 (need 50): ${result.factors.join('; ') || 'NPC is still significant'}`;

    return result;
}

/**
 * Process LLM classification results and prepare migration actions
 * 
 * @param {Object} npcRegistry - The NPC registry instance
 * @param {ClassificationResult[]} classifications - Array of classification results from LLM
 * @returns {Object} Actions to take: { promotions: [], demotions: [], creates: [], updates: [] }
 */
export async function processClassifications(npcRegistry, classifications) {
    const actions = {
        promotions: [],    // NPCs to promote to major
        demotions: [],     // NPCs to demote to minor
        creates: [],       // New NPCs to create
        updates: []        // Existing NPCs with updates
    };

    if (!classifications || !Array.isArray(classifications)) {
        return actions;
    }

    for (const classification of classifications) {
        const npcId = npcRegistry.generateNpcId(classification.name);
        const existingNPC = npcRegistry.getNPC(npcId);

        if (!existingNPC) {
            // New NPC to create
            actions.creates.push({
                name: classification.name,
                classification: classification.recommendedClassification || NPC_CLASSIFICATION.MINOR,
                notes: classification.reasoning,
                sentiment: classification.sentiment || 'Unknown',
                updates: classification.updates
            });
        } else {
            // Existing NPC
            const currentClass = existingNPC.meta.classification;
            const recommendedClass = classification.recommendedClassification;

            // Check for classification change
            if (currentClass !== recommendedClass && !existingNPC.meta.userPinned) {
                if (currentClass === NPC_CLASSIFICATION.MINOR && recommendedClass === NPC_CLASSIFICATION.MAJOR) {
                    actions.promotions.push({
                        npcId,
                        name: classification.name,
                        reason: classification.reasoning,
                        existingData: existingNPC
                    });
                } else if (currentClass === NPC_CLASSIFICATION.MAJOR && recommendedClass === NPC_CLASSIFICATION.MINOR) {
                    actions.demotions.push({
                        npcId,
                        name: classification.name,
                        reason: classification.reasoning,
                        existingData: existingNPC
                    });
                }
            }

            // Always queue updates if any
            if (classification.updates && classification.updates.length > 0) {
                actions.updates.push({
                    npcId,
                    name: classification.name,
                    operations: classification.updates
                });
            }
        }
    }

    return actions;
}

/**
 * Execute classification actions on the registry
 * 
 * @param {Object} npcRegistry - The NPC registry instance
 * @param {Object} actions - Actions from processClassifications
 * @returns {Object} Results of execution
 */
export async function executeClassificationActions(npcRegistry, actions) {
    const results = {
        created: [],
        promoted: [],
        demoted: [],
        updated: [],
        errors: []
    };

    // Create new NPCs
    for (const createAction of actions.creates) {
        try {
            const npc = await npcRegistry.getOrCreate(createAction.name, {
                classification: createAction.classification,
                notes: createAction.notes,
                sentiment: createAction.sentiment
            });
            
            // Apply any updates with proper path remapping for the NPC's classification
            if (createAction.updates?.length > 0) {
                const remappedOps = remapOperationsForClassification(
                    createAction.updates,
                    createAction.classification
                );
                await npcRegistry.applyOperations(npc.meta.npcId, remappedOps);
            }
            
            results.created.push(createAction.name);
        } catch (error) {
            results.errors.push({ action: 'create', name: createAction.name, error: error.message });
        }
    }

    // Process promotions
    for (const promotion of actions.promotions) {
        try {
            const majorSidecar = migrateToMajor(promotion.existingData, promotion.reason);
            await npcRegistry.replaceNPC(promotion.npcId, majorSidecar);
            results.promoted.push(promotion.name);
        } catch (error) {
            results.errors.push({ action: 'promote', name: promotion.name, error: error.message });
        }
    }

    // Process demotions
    for (const demotion of actions.demotions) {
        try {
            const minorSidecar = migrateToMinor(demotion.existingData, demotion.reason);
            await npcRegistry.replaceNPC(demotion.npcId, minorSidecar);
            results.demoted.push(demotion.name);
        } catch (error) {
            results.errors.push({ action: 'demote', name: demotion.name, error: error.message });
        }
    }

    // Apply updates
    for (const update of actions.updates) {
        try {
            // Get NPC to determine classification
            const npc = npcRegistry.getNPC(update.npcId);
            if (npc) {
                // Remap operations paths based on actual NPC classification
                const remappedOps = remapOperationsForClassification(
                    update.operations,
                    npc.meta.classification
                );
                await npcRegistry.applyOperations(update.npcId, remappedOps);
                results.updated.push(update.name);
            }
        } catch (error) {
            results.errors.push({ action: 'update', name: update.name, error: error.message });
        }
    }

    return results;
}

/**
 * Manually promote an NPC from minor to major
 * 
 * @param {Object} npcRegistry - The NPC registry instance
 * @param {string} npcId - The NPC ID to promote
 * @param {string} reason - Reason for promotion
 * @returns {Object|null} The new major sidecar or null on failure
 */
export async function promoteNPC(npcRegistry, npcId, reason = 'Manual promotion by user') {
    const npc = npcRegistry.getNPC(npcId);
    
    if (!npc) {
        console.error('[NPCClassifier] NPC not found:', npcId);
        return null;
    }

    if (npc.meta.classification === NPC_CLASSIFICATION.MAJOR) {
        console.log('[NPCClassifier] NPC is already major:', npc.meta.name);
        return npc;
    }

    try {
        const majorSidecar = migrateToMajor(npc, reason);
        await npcRegistry.replaceNPC(npcId, majorSidecar);
        return majorSidecar;
    } catch (error) {
        console.error('[NPCClassifier] Failed to promote NPC:', error);
        return null;
    }
}

/**
 * Manually demote an NPC from major to minor
 * 
 * @param {Object} npcRegistry - The NPC registry instance
 * @param {string} npcId - The NPC ID to demote
 * @param {string} reason - Reason for demotion
 * @returns {Object|null} The new minor sidecar or null on failure
 */
export async function demoteNPC(npcRegistry, npcId, reason = 'Manual demotion by user') {
    const npc = npcRegistry.getNPC(npcId);
    
    if (!npc) {
        console.error('[NPCClassifier] NPC not found:', npcId);
        return null;
    }

    if (npc.meta.classification === NPC_CLASSIFICATION.MINOR) {
        console.log('[NPCClassifier] NPC is already minor:', npc.meta.name);
        return npc;
    }

    try {
        const minorSidecar = migrateToMinor(npc, reason);
        await npcRegistry.replaceNPC(npcId, minorSidecar);
        return minorSidecar;
    } catch (error) {
        console.error('[NPCClassifier] Failed to demote NPC:', error);
        return null;
    }
}

export default {
    migrateToMajor,
    migrateToMinor,
    evaluateForPromotion,
    evaluateForDemotion,
    processClassifications,
    executeClassificationActions,
    promoteNPC,
    demoteNPC
};
