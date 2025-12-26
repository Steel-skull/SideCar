/**
 * Sidecar Lore - Main Entry Point
 * Dynamic character state tracking and narrative continuity for SillyTavern
 */

import { SidecarManager } from './lib/sidecar-manager.js';
import { LLMHandler } from './lib/llm-handler.js';
import { DeltaEngine } from './lib/delta-engine.js';
import { ContextInjector } from './lib/context-injector.js';
import { UIPopup, CharacterPanel } from './lib/ui-popup.js';
import * as ModelManager from './lib/model-manager.js';
import { NPCRegistry } from './lib/npc-registry.js';
import { processClassifications, executeClassificationActions, promoteNPC, demoteNPC } from './lib/npc-classifier.js';

const MODULE_NAME = 'sidecar-lore';

// Determine the extension folder path dynamically from the script URL
const scriptUrl = new URL(import.meta.url);
const extensionPath = scriptUrl.pathname.substring(0, scriptUrl.pathname.lastIndexOf('/'));

console.log(`[Sidecar] Module loading from: ${scriptUrl}`);

// Default extension settings
const defaultSettings = Object.freeze({
    enabled: true,
    autoUpdate: true,
    updateFrequency: 1,              // Every N messages
    historyDepth: 25,                // Messages to analyze
    cheapModelProfile: '',           // Profile for updater
    cheapModelPreset: '',            // Preset for updater
    architectModelProfile: '',       // Profile for architect
    architectModelPreset: '',        // Preset for architect
    useStructuredOutput: true,       // Use jsonSchema when available
    showPopupOnUpdate: true,         // Show approval popup
    injectContext: true,             // Inject sidecar into prompts
    injectPosition: 'system',        // system | author_note | character_note
    messageCounter: 0,               // Internal counter for update frequency
    // NPC Tracking Settings
    npcEnabled: true,                // Enable NPC tracking
    npcAutoClassify: true,           // Let LLM promote/demote NPCs
    npcMaxMajor: 5,                  // Maximum number of major NPCs
    npcInjectDepth: 'moderate',      // none | minimal | moderate | full
    npcPromotionThreshold: 3         // Appearances before promotion consideration
});

// Extension state
let initialized = false;
let settingsInitialized = false;
let settingsLoading = false;
let sidecarManager = null;
let llmHandler = null;
let deltaEngine = null;
let contextInjector = null;
let uiPopup = null;
let characterPanel = null;
let npcRegistry = null;

/**
 * Get or initialize extension settings
 */
function getSettings() {
    const context = SillyTavern.getContext();
    const extensionSettings = context.extensionSettings;

    if (!extensionSettings[MODULE_NAME]) {
        console.log('[Sidecar] Creating new settings from defaults');
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    // Ensure all default keys exist
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }

    return extensionSettings[MODULE_NAME];
}

/**
 * Debug function to log current settings
 */
function logCurrentSettings() {
    const settings = getSettings();
    console.log('[Sidecar] Current settings:');
    console.log('[Sidecar]   cheapModelProfile:', JSON.stringify(settings.cheapModelProfile));
    console.log('[Sidecar]   cheapModelPreset:', JSON.stringify(settings.cheapModelPreset));
    console.log('[Sidecar]   architectModelProfile:', JSON.stringify(settings.architectModelProfile));
    console.log('[Sidecar]   architectModelPreset:', JSON.stringify(settings.architectModelPreset));
}

/**
 * Reset all extension settings to defaults
 */
function resetSettings() {
    const context = SillyTavern.getContext();
    console.log('[Sidecar] Resetting all settings to defaults...');
    
    // Replace with fresh defaults
    context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    saveSettings();
    
    console.log('[Sidecar] Settings reset complete. Please reload SillyTavern.');
    showToast('Sidecar settings reset. Please reload the page.', 'success');
    
    // Also update the UI if it's loaded
    const cheapProfile = document.getElementById('sidecar-cheap-profile');
    const cheapPreset = document.getElementById('sidecar-cheap-preset');
    const architectProfile = document.getElementById('sidecar-architect-profile');
    const architectPreset = document.getElementById('sidecar-architect-preset');
    
    if (cheapProfile) cheapProfile.value = '';
    if (cheapPreset) cheapPreset.value = '';
    if (architectProfile) architectProfile.value = '';
    if (architectPreset) architectPreset.value = '';
    
    logCurrentSettings();
}

// Expose reset function globally for console access
globalThis.sidecarResetSettings = resetSettings;

/**
 * Clean up sidecar messages from the chat
 * This removes any visible "[Sidecar:" messages that were incorrectly added
 */
async function cleanupSidecarMessages() {
    const context = SillyTavern.getContext();
    const { chat, saveChat } = context;
    
    if (!chat || chat.length === 0) {
        console.log('[Sidecar] No chat to clean');
        return 0;
    }
    
    const originalLength = chat.length;
    let removed = 0;
    
    // Filter out sidecar messages (iterate backwards to avoid index issues)
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        // Check for sidecar messages by various indicators
        const isSidecar =
            (message.extra && message.extra.sidecar === true) ||
            (message.name === 'Sidecar') ||
            (message.mes && typeof message.mes === 'string' && message.mes.includes('[Sidecar:'));
        
        if (isSidecar) {
            chat.splice(i, 1);
            removed++;
        }
    }
    
    if (removed > 0) {
        // Save the cleaned chat
        await saveChat();
        console.log(`[Sidecar] Removed ${removed} sidecar messages from chat`);
        showToast(`Removed ${removed} sidecar messages. Please reload the page.`, 'success');
    } else {
        console.log('[Sidecar] No sidecar messages found to remove');
        showToast('No sidecar messages found', 'info');
    }
    
    return removed;
}

// Expose cleanup function globally for console access
globalThis.sidecarCleanupMessages = cleanupSidecarMessages;

/**
 * Save settings with debouncing
 */
function saveSettings() {
    const { saveSettingsDebounced } = SillyTavern.getContext();
    saveSettingsDebounced();
}

/**
 * Get recent chat messages for analysis
 */
function getRecentChat(count) {
    const context = SillyTavern.getContext();
    const chat = context.chat || [];
    return chat.slice(-count);
}

/**
 * Get current character ID
 */
function getCurrentCharacterId() {
    const context = SillyTavern.getContext();
    if (context.groupId) return null;
    
    const charIndex = context.characterId;
    if (charIndex === undefined || charIndex === null || charIndex < 0) return null;
    
    const character = context.characters[charIndex];
    if (!character) return null;
    
    return character.avatar || character.name;
}

/**
 * Get current character name
 */
function getCurrentCharacterName() {
    const context = SillyTavern.getContext();
    if (context.groupId) return null;
    
    const charIndex = context.characterId;
    if (charIndex === undefined || charIndex === null || charIndex < 0) return null;
    
    const character = context.characters[charIndex];
    return character?.name || null;
}

/**
 * Handle incoming message event
 */
async function onMessageReceived(data) {
    const settings = getSettings();
    
    if (!settings.enabled || !settings.autoUpdate) return;
    
    const charId = getCurrentCharacterId();
    if (!charId) return;
    
    // Increment message counter
    settings.messageCounter++;
    saveSettings();
    
    if (settings.messageCounter < settings.updateFrequency) return;
    
    // Reset counter
    settings.messageCounter = 0;
    saveSettings();
    
    console.log('[Sidecar] Running analysis on chat history...');
    
    try {
        const chatHistory = getRecentChat(settings.historyDepth);
        const currentSidecar = await sidecarManager.load(charId);
        
        // Prepare analysis options including NPC registry if enabled
        const analysisOptions = {
            characterName: getCurrentCharacterName(),
            npcRegistry: settings.npcEnabled ? npcRegistry : null
        };
        
        let result;
        
        try {
            // Use ModelManager to switch profile/preset if configured
            result = await ModelManager.withProfile(
                settings.cheapModelProfile,
                settings.cheapModelPreset,
                async () => {
                    return await llmHandler.analyzeChanges(chatHistory, currentSidecar, analysisOptions);
                }
            );
        } catch (profileError) {
            // If profile-based approach fails, try with current connection
            if (settings.cheapModelProfile) {
                console.warn('[Sidecar] Profile-based auto-analysis failed, trying with current connection...');
                result = await llmHandler.analyzeChanges(chatHistory, currentSidecar, analysisOptions);
            } else {
                throw profileError;
            }
        }
        
        // Process NPC classifications if enabled
        if (settings.npcEnabled && npcRegistry && result?.npcClassifications) {
            await processNPCClassifications(result.npcClassifications, result.sceneNPCs, settings);
        }
        
        if (!result || !result.operations || result.operations.length === 0) {
            if (result?.newNPCs?.length > 0) uiPopup.showNewNPCs(result.newNPCs);
            if (result?.contradictions?.length > 0) uiPopup.showContradictions(result.contradictions);
            return;
        }
        
        if (settings.showPopupOnUpdate) {
            uiPopup.showUpdatePopup(result, currentSidecar, async (approvedOps) => {
                if (approvedOps.length > 0) {
                    await sidecarManager.applyUpdates(charId, approvedOps);
                    showToast('Sidecar updated!', 'success');
                }
            });
        } else {
            await sidecarManager.applyUpdates(charId, result.operations);
            showToast(`Sidecar: ${result.operations.length} updates applied`, 'info');
        }
        
    } catch (error) {
        console.error('[Sidecar] Error during analysis:', error);
        showToast('Sidecar analysis failed. Check console for details.', 'error');
    }
}

/**
 * Process NPC classifications from LLM analysis result
 */
async function processNPCClassifications(npcClassifications, sceneNPCs, settings) {
    if (!npcRegistry || !npcClassifications) return;
    
    try {
        // Ensure npcClassifications is an array
        const classifications = Array.isArray(npcClassifications)
            ? npcClassifications
            : [];
        
        if (classifications.length === 0) {
            console.log('[Sidecar] No NPC classifications to process');
            return;
        }
        
        // Process the classifications using the correct function signature
        // processClassifications(npcRegistry, classifications) returns { promotions, demotions, creates, updates }
        const actions = await processClassifications(npcRegistry, classifications);
        
        // Execute the classification actions
        const results = await executeClassificationActions(npcRegistry, actions);
        
        // Update scene context
        if (sceneNPCs && Array.isArray(sceneNPCs) && sceneNPCs.length > 0) {
            await npcRegistry.updateSceneContext({ activeNPCs: sceneNPCs });
        }
        
        // Save the registry
        await npcRegistry.save();
        
        // Notify if there were classification changes
        const totalChanges = results.promoted.length + results.demoted.length + results.created.length;
        if (totalChanges > 0) {
            const msg = [];
            if (results.created.length > 0) msg.push(`${results.created.length} new NPCs`);
            if (results.promoted.length > 0) msg.push(`${results.promoted.length} promoted`);
            if (results.demoted.length > 0) msg.push(`${results.demoted.length} demoted`);
            showToast(`NPC updates: ${msg.join(', ')}`, 'info');
        }
        
        // Log any errors
        if (results.errors.length > 0) {
            console.warn('[Sidecar] Some NPC classification actions failed:', results.errors);
        }
        
    } catch (error) {
        console.error('[Sidecar] Error processing NPC classifications:', error);
    }
}

/**
 * Handle chat changed event
 */
async function onChatChanged() {
    const charId = getCurrentCharacterId();
    const settings = getSettings();
    
    if (charId) {
        await sidecarManager.reloadContext(charId);
        
        // Reload NPC registry for this chat
        if (settings.npcEnabled && npcRegistry) {
            await npcRegistry.load();
            console.log('[Sidecar] NPC registry reloaded for chat change');
        }
        
        characterPanel?.refresh();
    }
}

/**
 * Handle NPC promotion from UI
 */
async function handleNPCPromotion(npcId, shouldPin = false) {
    if (!npcRegistry) return;
    
    try {
        promoteNPC(npcRegistry, npcId, 'User requested promotion');
        if (shouldPin) {
            const npc = npcRegistry.get(npcId);
            if (npc) {
                npc.meta.userPinned = true;
            }
        }
        await npcRegistry.save();
        showToast(`NPC promoted to major character`, 'success');
    } catch (error) {
        console.error('[Sidecar] NPC promotion failed:', error);
        showToast('Failed to promote NPC', 'error');
    }
}

/**
 * Handle NPC demotion from UI
 */
async function handleNPCDemotion(npcId, shouldPin = false) {
    if (!npcRegistry) return;
    
    try {
        demoteNPC(npcRegistry, npcId, 'User requested demotion');
        if (shouldPin) {
            const npc = npcRegistry.get(npcId);
            if (npc) {
                npc.meta.userPinned = true;
            }
        }
        await npcRegistry.save();
        showToast(`NPC demoted to minor character`, 'success');
    } catch (error) {
        console.error('[Sidecar] NPC demotion failed:', error);
        showToast('Failed to demote NPC', 'error');
    }
}

/**
 * Handle NPC deletion from UI
 */
async function handleNPCDeletion(npcId) {
    if (!npcRegistry) return;
    
    try {
        const deleted = npcRegistry.delete(npcId);
        if (deleted) {
            await npcRegistry.save();
            showToast('NPC removed from tracking', 'success');
        }
    } catch (error) {
        console.error('[Sidecar] NPC deletion failed:', error);
        showToast('Failed to delete NPC', 'error');
    }
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
    if (typeof toastr !== 'undefined') {
        toastr[type](message);
    } else {
        console.log(`[Sidecar Toast] ${type}: ${message}`);
    }
}

/**
 * Trigger manual analysis
 */
async function triggerManualAnalysis() {
    const settings = getSettings();
    const charId = getCurrentCharacterId();
    
    if (!charId) {
        showToast('No character selected', 'warning');
        return;
    }
    
    // Debug: Log what settings are being used
    console.log('[Sidecar] Manual analysis triggered with settings:');
    console.log('[Sidecar]   cheapModelProfile:', settings.cheapModelProfile || '(not set - using current)');
    console.log('[Sidecar]   cheapModelPreset:', settings.cheapModelPreset || '(not set - using current)');
    
    showToast('Running sidecar analysis...', 'info');
    
    try {
        const chatHistory = getRecentChat(settings.historyDepth);
        const currentSidecar = await sidecarManager.load(charId);
        
        let result;
        let usedFallback = false;
        
        try {
            // First try with the configured profile
            result = await ModelManager.withProfile(
                settings.cheapModelProfile,
                settings.cheapModelPreset,
                async () => {
                    return await llmHandler.analyzeChanges(chatHistory, currentSidecar, {
                        characterName: getCurrentCharacterName()
                    });
                }
            );
        } catch (profileError) {
            // If profile-based approach fails, try with current connection (no switch)
            if (settings.cheapModelProfile) {
                console.warn('[Sidecar] Profile-based analysis failed, trying with current connection...');
                console.log('[Sidecar] Error was:', profileError.message);
                usedFallback = true;
                
                result = await llmHandler.analyzeChanges(chatHistory, currentSidecar, {
                    characterName: getCurrentCharacterName()
                });
            } else {
                // No profile configured, re-throw
                throw profileError;
            }
        }
        
        if (usedFallback) {
            console.log('[Sidecar] Analysis succeeded using fallback (current connection)');
            showToast('Analysis complete (used current connection as fallback)', 'info');
        }
        
        if (!result || !result.operations || result.operations.length === 0) {
            showToast('No updates detected', 'info');
            return;
        }
        
        uiPopup.showUpdatePopup(result, currentSidecar, async (approvedOps) => {
            if (approvedOps.length > 0) {
                await sidecarManager.applyUpdates(charId, approvedOps);
                showToast('Sidecar updated!', 'success');
                characterPanel?.refresh();
            }
        });
        
    } catch (error) {
        console.error('[Sidecar] Manual analysis failed:', error);
        showToast('Analysis failed. Check console for details.', 'error');
    }
}

/**
 * Trigger architect mode for schema expansion
 */
async function triggerArchitectMode() {
    const settings = getSettings();
    const charId = getCurrentCharacterId();
    
    if (!charId) {
        showToast('No character selected', 'warning');
        return;
    }
    
    // Debug: Log what settings are being used
    console.log('[Sidecar] Architect mode triggered with settings:');
    console.log('[Sidecar]   architectModelProfile:', settings.architectModelProfile || '(not set - using current)');
    console.log('[Sidecar]   architectModelPreset:', settings.architectModelPreset || '(not set - using current)');
    
    showToast('Running Architect analysis...', 'info');
    
    try {
        const chatHistory = getRecentChat(settings.historyDepth * 2);
        const currentSidecar = await sidecarManager.load(charId);
        
        let recommendations;
        let usedFallback = false;
        
        try {
            // First try with the configured profile
            recommendations = await ModelManager.withProfile(
                settings.architectModelProfile,
                settings.architectModelPreset,
                async () => {
                    return await llmHandler.analyzeSchema(chatHistory, currentSidecar, {
                        characterName: getCurrentCharacterName()
                    });
                }
            );
        } catch (profileError) {
            // If profile-based approach fails, try with current connection (no switch)
            if (settings.architectModelProfile) {
                console.warn('[Sidecar] Profile-based architect analysis failed, trying with current connection...');
                console.log('[Sidecar] Error was:', profileError.message);
                usedFallback = true;
                
                recommendations = await llmHandler.analyzeSchema(chatHistory, currentSidecar, {
                    characterName: getCurrentCharacterName()
                });
            } else {
                // No profile configured, re-throw
                throw profileError;
            }
        }
        
        if (usedFallback) {
            console.log('[Sidecar] Architect analysis succeeded using fallback (current connection)');
            showToast('Architect complete (used current connection as fallback)', 'info');
        }
        
        if (!recommendations || recommendations.length === 0) {
            showToast('No schema changes recommended', 'info');
            return;
        }
        
        uiPopup.showSchemaPopup(recommendations, async (approvedSchema) => {
            if (approvedSchema) {
                await sidecarManager.expandSchema(charId, approvedSchema);
                showToast('Schema expanded!', 'success');
                characterPanel?.refresh();
            }
        });
        
    } catch (error) {
        console.error('[Sidecar] Architect analysis failed:', error);
        showToast('Architect analysis failed. Check console for details.', 'error');
    }
}

/**
 * Load and render the settings panel HTML
 */
async function loadSettingsPanel() {
    const containerId = `extension_settings_${MODULE_NAME}`;
    
    // Prevent concurrent loading
    if (settingsLoading) {
        console.log('[Sidecar Lore] Settings already loading, skipping...');
        return false;
    }
    
    // Already loaded
    if ($(`#${containerId}`).length > 0) {
        console.log('[Sidecar Lore] Settings panel already exists');
        return true;
    }

    const parentContainer = $('#extensions_settings');
    if (parentContainer.length === 0) return false;
    
    settingsLoading = true;
    
    try {
        const settingsUrl = new URL('./settings.html', import.meta.url).href;
        const settingsHtml = await $.get(settingsUrl);
        
        // Double-check it wasn't added while we were fetching
        if ($(`#${containerId}`).length > 0) {
            console.log('[Sidecar Lore] Settings panel was added during fetch, skipping...');
            settingsLoading = false;
            return true;
        }
        
        const container = $(`<div id="${containerId}"></div>`).html(settingsHtml);
        parentContainer.append(container);
        
        setTimeout(() => {
            initializeSettingsUI();
        }, 100);
        
        console.log('[Sidecar Lore] Settings panel created');
        return true;
    } catch (error) {
        console.error('[Sidecar] Error loading settings panel:', error);
        return false;
    } finally {
        settingsLoading = false;
    }
}

/**
 * Initialize the settings UI elements and event listeners
 */
async function initializeSettingsUI() {
    // Prevent multiple initializations
    if (settingsInitialized) {
        console.log('[Sidecar Lore] Settings UI already initialized, skipping...');
        return;
    }
    settingsInitialized = true;
    console.log('[Sidecar Lore] Initializing settings UI...');
    
    const settings = getSettings();
    
    // Log what settings were loaded from storage
    console.log('[Sidecar] Loaded settings from storage:');
    logCurrentSettings();
    
    // Helper to bind checkbox
    const bindCheckbox = (id, key) => {
        const el = document.getElementById(id);
        if (el) {
            el.checked = settings[key];
            el.addEventListener('change', (e) => {
                settings[key] = e.target.checked;
                saveSettings();
            });
        }
    };

    // Helper to bind input/select
    const bindInput = (id, key, parser = (v) => v) => {
        const el = document.getElementById(id);
        if (el) {
            el.value = settings[key];
            el.addEventListener('change', (e) => {
                settings[key] = parser(e.target.value);
                saveSettings();
            });
        }
    };

    bindCheckbox('sidecar-enabled', 'enabled');
    bindCheckbox('sidecar-auto-update', 'autoUpdate');
    bindCheckbox('sidecar-show-popup', 'showPopupOnUpdate');
    bindCheckbox('sidecar-inject-context', 'injectContext');
    
    bindInput('sidecar-update-frequency', 'updateFrequency', (v) => Math.max(1, parseInt(v) || 1));
    bindInput('sidecar-history-depth', 'historyDepth', (v) => Math.max(5, parseInt(v) || 25));
    bindInput('sidecar-inject-position', 'injectPosition');

    // --- NPC Tracking Settings ---
    bindCheckbox('sidecar-npc-enabled', 'npcEnabled');
    bindCheckbox('sidecar-npc-auto-classify', 'npcAutoClassify');
    bindInput('sidecar-npc-max-major', 'npcMaxMajor', (v) => Math.max(1, Math.min(20, parseInt(v) || 5)));
    bindInput('sidecar-npc-inject-depth', 'npcInjectDepth');
    bindInput('sidecar-npc-promotion-threshold', 'npcPromotionThreshold', (v) => Math.max(1, parseInt(v) || 3));
    
    // View NPC Registry button
    const viewNPCRegistryBtn = document.getElementById('sidecar-view-npc-registry');
    if (viewNPCRegistryBtn) {
        viewNPCRegistryBtn.addEventListener('click', () => {
            if (characterPanel) {
                characterPanel.showNPCRegistry();
            }
        });
    }
    
    // --- End NPC Tracking Settings ---

    // --- Model Selection Logic ---

    // Populate Profiles
    const profiles = await ModelManager.getProfileList();
    const populateProfiles = (selectId, currentVal) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        // Clear existing options except first
        while (select.options.length > 1) select.remove(1);
        
        profiles.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        select.value = currentVal || '';
    };

    populateProfiles('sidecar-cheap-profile', settings.cheapModelProfile);
    populateProfiles('sidecar-architect-profile', settings.architectModelProfile);

    // Populate Presets based on Profile
    const updatePresets = async (profileName, selectId, currentVal) => {
        const select = document.getElementById(selectId);
        if (!select) return;

        // Clear existing options except first
        while (select.options.length > 1) select.remove(1);

        if (!profileName) {
            // If no profile selected, maybe show current global presets? 
            // For now, just clear.
            return;
        }

        const apiType = await ModelManager.getProfileApiType(profileName);
        if (!apiType) return;

        const presets = await ModelManager.getPresetsForApiType(apiType);
        presets.forEach(preset => {
            // Handle different preset formats (object or string)
            const name = typeof preset === 'string' ? preset : (preset.name || preset.id);
            const id = typeof preset === 'string' ? preset : (preset.id || preset.name);
            
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            select.appendChild(option);
        });
        select.value = currentVal || '';
    };

    // Initial preset population
    await updatePresets(settings.cheapModelProfile, 'sidecar-cheap-preset', settings.cheapModelPreset);
    await updatePresets(settings.architectModelProfile, 'sidecar-architect-preset', settings.architectModelPreset);

    // Bind Profile Changes
    const bindProfileChange = (profileId, presetId, settingProfileKey, settingPresetKey) => {
        const profileSelect = document.getElementById(profileId);
        if (profileSelect) {
            profileSelect.addEventListener('change', async (e) => {
                const newVal = e.target.value;
                console.log(`[Sidecar] Profile dropdown changed: ${settingProfileKey} = "${newVal}"`);
                settings[settingProfileKey] = newVal;
                // Reset preset when profile changes
                settings[settingPresetKey] = '';
                saveSettings();
                console.log(`[Sidecar] Settings saved. Verifying...`);
                logCurrentSettings();
                
                await updatePresets(newVal, presetId, '');
            });
        }
    };

    bindProfileChange('sidecar-cheap-profile', 'sidecar-cheap-preset', 'cheapModelProfile', 'cheapModelPreset');
    bindProfileChange('sidecar-architect-profile', 'sidecar-architect-preset', 'architectModelProfile', 'architectModelPreset');

    // Bind Preset Changes
    bindInput('sidecar-cheap-preset', 'cheapModelPreset');
    bindInput('sidecar-architect-preset', 'architectModelPreset');

    // --- End Model Selection Logic ---
    
    // Trigger buttons
    const analyzeBtn = document.getElementById('sidecar-trigger-analysis');
    if (analyzeBtn) analyzeBtn.addEventListener('click', triggerManualAnalysis);
    
    const architectBtn = document.getElementById('sidecar-trigger-architect');
    if (architectBtn) architectBtn.addEventListener('click', triggerArchitectMode);
    
    const viewPanelBtn = document.getElementById('sidecar-view-panel');
    if (viewPanelBtn) viewPanelBtn.addEventListener('click', () => characterPanel?.toggle());
    
    // Cleanup button
    const cleanupBtn = document.getElementById('sidecar-cleanup-messages');
    if (cleanupBtn) cleanupBtn.addEventListener('click', () => {
        if (confirm('This will remove all Sidecar messages from the current chat. Continue?')) {
            cleanupSidecarMessages();
        }
    });
    
    const resetBtn = document.getElementById('sidecar-reset-settings');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all Sidecar settings to defaults?')) {
            resetSettings();
        }
    });
    
    // Setup inline drawer toggle behavior
    const drawerToggle = document.querySelector('.sidecar-lore-settings .inline-drawer-toggle');
    if (drawerToggle) {
        drawerToggle.addEventListener('click', function() {
            const drawer = this.closest('.inline-drawer');
            if (drawer) drawer.classList.toggle('open');
        });
    }
}

/**
 * Handle prompt generation event for context injection
 * This is called by SillyTavern before combining prompts
 */
async function onGenerationStarted(eventData) {
    if (!initialized || !contextInjector) return;
    
    const settings = getSettings();
    if (!settings.enabled || !settings.injectContext) return;
    
    const charId = getCurrentCharacterId();
    if (!charId) return;
    
    try {
        const context = SillyTavern.getContext();
        const chat = context.chat;
        
        if (!chat || chat.length === 0) return;
        
        // Prepare NPC injection options based on depth setting
        let npcOptions = { includeNPCs: false };
        if (settings.npcEnabled && npcRegistry) {
            switch (settings.npcInjectDepth) {
                case 'none':
                    npcOptions = { includeNPCs: false };
                    break;
                case 'minimal':
                    npcOptions = { includeNPCs: true, majorOnly: true, maxNPCs: 3 };
                    break;
                case 'moderate':
                    npcOptions = { includeNPCs: true, majorOnly: false, maxNPCs: 5 };
                    break;
                case 'full':
                    npcOptions = { includeNPCs: true, majorOnly: false, maxNPCs: 10, sceneOnly: false };
                    break;
                default:
                    npcOptions = { includeNPCs: true, majorOnly: false, maxNPCs: 5 };
            }
        }
        
        await contextInjector.inject(chat, charId, settings.injectPosition, npcOptions);
        console.log('[Sidecar] Context injected successfully');
    } catch (error) {
        console.error('[Sidecar] Context injection failed:', error);
    }
}

/**
 * Global prompt interceptor function (legacy - for manual calls)
 */
globalThis.sidecarLoreInterceptor = async function(chat, contextSize, abort, type) {
    if (!initialized || !contextInjector) return;
    
    const settings = getSettings();
    if (!settings.enabled || !settings.injectContext) return;
    
    const charId = getCurrentCharacterId();
    if (!charId) return;
    
    try {
        // Prepare NPC injection options
        const npcOptions = settings.npcEnabled ? {
            includeNPCs: true,
            majorOnly: false,
            maxNPCs: 5
        } : { includeNPCs: false };
        
        await contextInjector.inject(chat, charId, settings.injectPosition, npcOptions);
    } catch (error) {
        console.error('[Sidecar] Context injection failed:', error);
    }
};

/**
 * Initialize the extension
 */
async function init() {
    if (initialized) return;
    
    console.log('[Sidecar Lore] Initializing...');
    
    try {
        const context = SillyTavern.getContext();
        const settings = getSettings();
        
        sidecarManager = new SidecarManager();
        deltaEngine = new DeltaEngine();
        llmHandler = new LLMHandler(getSettings);
        contextInjector = new ContextInjector(sidecarManager);
        uiPopup = new UIPopup();
        
        // Initialize NPC Registry
        npcRegistry = new NPCRegistry();
        if (settings.npcEnabled) {
            await npcRegistry.load();
            console.log('[Sidecar] NPC registry loaded');
        }
        
        // Set NPC registry on context injector
        contextInjector.setNPCRegistry(npcRegistry);
        
        // Create character panel with NPC registry
        characterPanel = new CharacterPanel(sidecarManager, triggerManualAnalysis, triggerArchitectMode, npcRegistry);
        
        // Set NPC callbacks on character panel
        characterPanel.setNPCCallbacks({
            onPromote: handleNPCPromotion,
            onDemote: handleNPCDemotion,
            onDelete: handleNPCDeletion
        });
        
        sidecarManager.setDeltaEngine(deltaEngine);
        
        // Register event handlers
        context.eventSource.on(context.event_types.MESSAGE_RECEIVED, onMessageReceived);
        context.eventSource.on(context.event_types.CHAT_CHANGED, onChatChanged);
        
        // Register for generation events to inject context
        // SillyTavern uses GENERATION_STARTED or similar events
        if (context.event_types.GENERATION_STARTED) {
            context.eventSource.on(context.event_types.GENERATION_STARTED, onGenerationStarted);
            console.log('[Sidecar] Registered for GENERATION_STARTED event');
        } else if (context.event_types.GENERATE_BEFORE_COMBINE_PROMPTS) {
            context.eventSource.on(context.event_types.GENERATE_BEFORE_COMBINE_PROMPTS, onGenerationStarted);
            console.log('[Sidecar] Registered for GENERATE_BEFORE_COMBINE_PROMPTS event');
        } else {
            // Fallback: Try to use MESSAGE_SENDING if available
            if (context.event_types.MESSAGE_SENDING) {
                context.eventSource.on(context.event_types.MESSAGE_SENDING, onGenerationStarted);
                console.log('[Sidecar] Registered for MESSAGE_SENDING event');
            } else {
                console.warn('[Sidecar] No suitable generation event found for context injection. Available events:', Object.keys(context.event_types || {}));
            }
        }
        
        characterPanel.addToUI();
        
        initialized = true;
        console.log('[Sidecar Lore] Core initialization complete');
        
    } catch (error) {
        console.error('[Sidecar Lore] Initialization failed:', error);
    }
}

// Initialize when jQuery/DOM is ready
jQuery(async () => {
    console.log('[Sidecar Lore] jQuery ready, starting initialization...');
    
    await init();
    
    const attemptLoadSettings = async () => {
        const success = await loadSettingsPanel();
        if (success) {
            console.log('[Sidecar Lore] Settings panel loaded successfully');
            return true;
        }
        return false;
    };

    setTimeout(attemptLoadSettings, 1000);

    try {
        const context = SillyTavern.getContext();
        if (context && context.eventSource && context.event_types) {
            context.eventSource.on(context.event_types.APP_READY, () => {
                console.log('[Sidecar Lore] APP_READY received, loading settings...');
                attemptLoadSettings();
            });
        }
    } catch (e) {
        console.warn('[Sidecar Lore] Could not hook APP_READY:', e);
    }

    const observer = new MutationObserver((mutations) => {
        const settingsArea = document.getElementById('extensions_settings');
        if (settingsArea) {
            const myContainer = document.getElementById(`extension_settings_${MODULE_NAME}`);
            if (!myContainer) {
                console.log('[Sidecar Lore] Detected settings area, injecting panel...');
                attemptLoadSettings();
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[Sidecar Lore] Settings observer attached');
});

// Export for external access
export {
    getSettings,
    triggerManualAnalysis,
    triggerArchitectMode,
    sidecarManager,
    npcRegistry,
    MODULE_NAME
};
