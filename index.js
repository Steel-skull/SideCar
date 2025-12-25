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
    messageCounter: 0                // Internal counter for update frequency
});

// Extension state
let initialized = false;
let sidecarManager = null;
let llmHandler = null;
let deltaEngine = null;
let contextInjector = null;
let uiPopup = null;
let characterPanel = null;

/**
 * Get or initialize extension settings
 */
function getSettings() {
    const context = SillyTavern.getContext();
    const extensionSettings = context.extensionSettings;

    if (!extensionSettings[MODULE_NAME]) {
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
        
        // Use ModelManager to switch profile/preset if configured
        const result = await ModelManager.withProfile(
            settings.cheapModelProfile,
            settings.cheapModelPreset,
            async () => {
                return await llmHandler.analyzeChanges(chatHistory, currentSidecar, {
                    characterName: getCurrentCharacterName()
                });
            }
        );
        
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
 * Handle chat changed event
 */
async function onChatChanged() {
    const charId = getCurrentCharacterId();
    if (charId) {
        await sidecarManager.reloadContext(charId);
        characterPanel?.refresh();
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
    
    showToast('Running sidecar analysis...', 'info');
    
    try {
        const chatHistory = getRecentChat(settings.historyDepth);
        const currentSidecar = await sidecarManager.load(charId);
        
        const result = await ModelManager.withProfile(
            settings.cheapModelProfile,
            settings.cheapModelPreset,
            async () => {
                return await llmHandler.analyzeChanges(chatHistory, currentSidecar, {
                    characterName: getCurrentCharacterName()
                });
            }
        );
        
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
    
    showToast('Running Architect analysis...', 'info');
    
    try {
        const chatHistory = getRecentChat(settings.historyDepth * 2);
        const currentSidecar = await sidecarManager.load(charId);
        
        const recommendations = await ModelManager.withProfile(
            settings.architectModelProfile,
            settings.architectModelPreset,
            async () => {
                return await llmHandler.analyzeSchema(chatHistory, currentSidecar, {
                    characterName: getCurrentCharacterName()
                });
            }
        );
        
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
    
    if ($(`#${containerId}`).length > 0) return true;

    const parentContainer = $('#extensions_settings');
    if (parentContainer.length === 0) return false;
    
    try {
        const settingsUrl = new URL('./settings.html', import.meta.url).href;
        const settingsHtml = await $.get(settingsUrl);
        
        const container = $(`<div id="${containerId}"></div>`).html(settingsHtml);
        parentContainer.append(container);
        
        setTimeout(() => {
            initializeSettingsUI();
        }, 100);
        
        return true;
    } catch (error) {
        console.error('[Sidecar] Error loading settings panel:', error);
        return false;
    }
}

/**
 * Initialize the settings UI elements and event listeners
 */
async function initializeSettingsUI() {
    const settings = getSettings();
    
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
                settings[settingProfileKey] = newVal;
                // Reset preset when profile changes
                settings[settingPresetKey] = ''; 
                saveSettings();
                
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
 * Global prompt interceptor function
 */
globalThis.sidecarLoreInterceptor = async function(chat, contextSize, abort, type) {
    if (!initialized || !contextInjector) return;
    
    const settings = getSettings();
    if (!settings.enabled || !settings.injectContext) return;
    
    const charId = getCurrentCharacterId();
    if (!charId) return;
    
    try {
        await contextInjector.inject(chat, charId, settings.injectPosition);
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
        
        sidecarManager = new SidecarManager();
        deltaEngine = new DeltaEngine();
        llmHandler = new LLMHandler(getSettings);
        contextInjector = new ContextInjector(sidecarManager);
        uiPopup = new UIPopup();
        characterPanel = new CharacterPanel(sidecarManager, triggerManualAnalysis, triggerArchitectMode);
        
        sidecarManager.setDeltaEngine(deltaEngine);
        
        context.eventSource.on(context.event_types.MESSAGE_RECEIVED, onMessageReceived);
        context.eventSource.on(context.event_types.CHAT_CHANGED, onChatChanged);
        
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
    MODULE_NAME
};
