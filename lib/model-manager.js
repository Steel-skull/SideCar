/**
 * Model Manager - Handles Profile and Preset Switching
 * Adapted from GuidedGenerations extension for reliable profile/preset switching
 */

const MODULE_NAME = 'sidecar-lore';

/**
 * Get the SillyTavern context
 */
function getContext() {
    return SillyTavern.getContext();
}

/**
 * Wait for the connection manager to be available
 */
async function waitForConnectionManager(maxAttempts = 10, delayMs = 200) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const context = getContext();
        if (context?.extensionSettings?.connectionManager) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    console.warn('[Sidecar] Connection manager not available');
    return false;
}

/**
 * Get list of all available connection profile names
 */
export async function getProfileList() {
    try {
        const isAvailable = await waitForConnectionManager();
        if (!isAvailable) return [];

        const context = getContext();
        const { profiles } = context.extensionSettings.connectionManager;
        
        if (!profiles || !Array.isArray(profiles)) {
            return [];
        }

        return profiles.map(p => p.name);
    } catch (error) {
        console.error('[Sidecar] Error getting profile list:', error);
        return [];
    }
}

/**
 * Get the current active connection profile name
 */
export async function getCurrentProfile() {
    try {
        const isAvailable = await waitForConnectionManager();
        if (!isAvailable) return '';

        const context = getContext();
        const { selectedProfile, profiles } = context.extensionSettings.connectionManager;
        
        if (!selectedProfile || !profiles) return '';

        const currentProfile = profiles.find(p => p.id === selectedProfile);
        return currentProfile ? currentProfile.name : '';
    } catch (error) {
        console.error('[Sidecar] Error getting current profile:', error);
        return '';
    }
}

/**
 * Get the API type of a specific profile
 */
export async function getProfileApiType(profileName) {
    try {
        const isAvailable = await waitForConnectionManager();
        if (!isAvailable) return '';

        const context = getContext();
        const { profiles } = context.extensionSettings.connectionManager;
        
        const profile = profiles.find(p => p.name === profileName);
        return profile ? (profile.api || '') : '';
    } catch (error) {
        console.error('[Sidecar] Error getting profile API type:', error);
        return '';
    }
}

/**
 * Extract the API ID from an API type using the CONNECT_API_MAP
 */
function extractApiIdFromApiType(apiType) {
    try {
        const context = getContext();
        if (!context?.CONNECT_API_MAP) {
            return null;
        }

        const apiInfo = context.CONNECT_API_MAP[apiType];
        if (!apiInfo) {
            return null;
        }

        let apiId;
        if (typeof apiInfo === 'string') {
            apiId = apiInfo;
        } else if (apiInfo && typeof apiInfo === 'object' && apiInfo.selected) {
            apiId = apiInfo.selected;
        } else if (apiInfo && typeof apiInfo === 'object' && apiInfo.apiId) {
            apiId = apiInfo.apiId;
        } else {
            return null;
        }

        return apiId;
    } catch (error) {
        console.warn('[Sidecar] Error extracting API ID:', error);
        return null;
    }
}

/**
 * Get presets for a specific API type
 */
export async function getPresetsForApiType(apiType) {
    try {
        const context = getContext();
        if (!context || !context.CONNECT_API_MAP) return [];

        const apiId = extractApiIdFromApiType(apiType);
        if (!apiId) return [];

        const presetManager = context.getPresetManager(apiId);
        if (!presetManager || typeof presetManager.getPresetList !== 'function') {
            return [];
        }

        return presetManager.getPresetList() || [];
    } catch (error) {
        console.error('[Sidecar] Error getting presets:', error);
        return [];
    }
}

/**
 * Wait for a profile change by polling
 */
async function waitForProfileChangeByPolling(expectedProfile, timeoutMs = 5000, pollIntervalMs = 100) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
        const checkProfile = async () => {
            try {
                const currentProfile = await getCurrentProfile();
                
                if (currentProfile === expectedProfile) {
                    console.log(`[Sidecar] Profile change confirmed: "${currentProfile}"`);
                    resolve(currentProfile);
                    return;
                }
                
                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error(`Profile change timeout - expected: "${expectedProfile}", current: "${currentProfile}"`));
                    return;
                }
                
                setTimeout(checkProfile, pollIntervalMs);
            } catch (error) {
                reject(error);
            }
        };
        
        checkProfile();
    });
}

/**
 * Wait for a preset change by polling
 */
async function waitForPresetChangeByPolling(expectedPreset, apiType, timeoutMs = 5000, pollIntervalMs = 100) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
        const checkPreset = async () => {
            try {
                const context = getContext();
                if (!context?.getPresetManager) {
                    reject(new Error('Preset manager not available'));
                    return;
                }
                
                const apiId = extractApiIdFromApiType(apiType);
                if (!apiId) {
                    reject(new Error(`Could not extract API ID from API type: ${apiType}`));
                    return;
                }
                
                const presetManager = context.getPresetManager(apiId);
                if (!presetManager?.getSelectedPreset) {
                    reject(new Error(`Preset manager not available for API ID: ${apiId}`));
                    return;
                }
                
                const currentPreset = presetManager.getSelectedPreset();
                let currentPresetName = '';
                
                if (currentPreset && typeof currentPreset === 'object') {
                    currentPresetName = currentPreset.name || currentPreset.id || currentPreset.title || currentPreset.label || '';
                } else if (typeof currentPreset === 'string') {
                    currentPresetName = currentPreset;
                } else if (currentPreset !== null && currentPreset !== undefined) {
                    currentPresetName = currentPreset.toString();
                }
                
                if (currentPresetName === expectedPreset || currentPresetName.includes(expectedPreset)) {
                    console.log(`[Sidecar] Preset change confirmed: "${currentPresetName}"`);
                    resolve(currentPreset);
                    return;
                }
                
                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error(`Preset change timeout - expected: "${expectedPreset}", current: "${currentPresetName}"`));
                    return;
                }
                
                setTimeout(checkPreset, pollIntervalMs);
            } catch (error) {
                reject(error);
            }
        };
        
        checkPreset();
    });
}

/**
 * Switch to a specific connection profile
 */
export async function switchToProfile(profileName) {
    try {
        console.log(`[Sidecar] switchToProfile: "${profileName}"`);
        
        const isAvailable = await waitForConnectionManager();
        if (!isAvailable) {
            console.warn('[Sidecar] Connection manager not available');
            return false;
        }

        const context = getContext();
        const { profiles } = context.extensionSettings.connectionManager;
        
        const targetProfile = profiles.find(p => p.name === profileName);
        if (!targetProfile) {
            console.warn(`[Sidecar] Target profile "${profileName}" not found`);
            return false;
        }

        // Find the profiles dropdown in the UI
        let profilesDropdown = null;
        const possibleDropdowns = document.querySelectorAll('select');
        
        for (const dropdown of possibleDropdowns) {
            const options = Array.from(dropdown.options);
            const hasMatchingProfiles = options.some(option =>
                profiles.some(profile => profile.name === option.text || profile.id === option.value)
            );
            
            if (hasMatchingProfiles) {
                profilesDropdown = dropdown;
                break;
            }
        }

        if (!profilesDropdown) {
            console.warn('[Sidecar] Profiles dropdown not found in UI');
            return false;
        }

        const profileIndex = Array.from(profilesDropdown.options).findIndex(o =>
            o.value === targetProfile.id || o.text === targetProfile.name
        );
        
        if (profileIndex === -1) {
            console.warn(`[Sidecar] Profile "${profileName}" not found in dropdown`);
            return false;
        }

        profilesDropdown.selectedIndex = profileIndex;
        profilesDropdown.dispatchEvent(new Event('change', { bubbles: true }));
        
        console.log(`[Sidecar] Profile switch initiated: "${profileName}"`);
        return true;
    } catch (error) {
        console.error('[Sidecar] Error switching profile:', error);
        return false;
    }
}

/**
 * Switch to a specific preset
 */
export async function switchToPreset(presetValue, apiType) {
    try {
        console.log(`[Sidecar] switchToPreset: "${presetValue}", apiType: "${apiType}"`);
        
        if (!presetValue || !apiType) {
            console.warn('[Sidecar] Missing preset value or API type');
            return false;
        }

        const context = getContext();
        const apiId = extractApiIdFromApiType(apiType);
        
        if (!apiId) {
            console.warn(`[Sidecar] Could not extract API ID for type: ${apiType}`);
            return false;
        }

        const presetManager = context.getPresetManager?.(apiId);
        if (!presetManager) {
            console.warn(`[Sidecar] No preset manager for API ID: ${apiId}`);
            return false;
        }
        
        if (typeof presetManager.selectPreset === 'function') {
            const result = presetManager.selectPreset(presetValue);
            console.log(`[Sidecar] Preset switch initiated: "${presetValue}"`);
            return result !== false;
        }
        
        console.warn('[Sidecar] presetManager.selectPreset not available');
        return false;
    } catch (error) {
        console.error('[Sidecar] Error switching preset:', error);
        return false;
    }
}

/**
 * Get the currently selected preset from the default preset manager
 * @returns {string} The current preset name/id
 */
function getCurrentPresetFromManager() {
    try {
        const context = getContext();
        if (!context?.getPresetManager) return '';
        
        const presetManager = context.getPresetManager();
        if (!presetManager?.getSelectedPreset) return '';
        
        const apiId = presetManager.apiId || '';
        const selected = presetManager.getSelectedPreset();
        
        // Handle different API types that return different formats
        if (apiId === 'textgenerationwebui') {
            return typeof selected === 'string' ? selected : '';
        } else {
            return selected !== null && selected !== undefined ? selected.toString() : '';
        }
    } catch (error) {
        console.warn('[Sidecar] Error getting current preset:', error);
        return '';
    }
}

/**
 * Unified function to handle profile and preset switching with proper restoration
 * Following GuidedGenerations' pattern of capturing preset AFTER profile switch
 * 
 * @param {string|null} profileValue - The profile to switch to (optional)
 * @param {string|null} presetValue - The preset to switch to (optional)
 * @returns {Promise<{switch: Function, restore: Function, originalProfile: string, originalPreset: string}>}
 */
export async function handleSwitching(profileValue = null, presetValue = null) {
    console.log(`[Sidecar] handleSwitching: profile="${profileValue}", preset="${presetValue}"`);
    
    const targetProfile = profileValue?.trim() || null;
    const targetPreset = presetValue?.trim() || null;
    
    // If neither profile nor preset is specified, return no-op functions
    if (!targetProfile && !targetPreset) {
        console.log('[Sidecar] No profile/preset specified, returning no-op');
        return {
            switch: async () => {},
            restore: async () => {},
            originalProfile: null,
            originalPreset: null
        };
    }
    
    // Capture current profile before switching
    let currentProfile = await getCurrentProfile();
    // We'll capture the preset AFTER profile switch (critical for proper restoration)
    let currentPreset = null;
    let profileToRestore = currentProfile || '';
    let presetToRestore = '';
    
    console.log(`[Sidecar] Current profile: "${currentProfile}"`);
    
    /**
     * Switch to the target profile and/or preset
     */
    async function switchToTarget() {
        try {
            // Step 1: Switch profile if specified
            if (targetProfile) {
                console.log(`[Sidecar] Switching to profile: "${targetProfile}"`);
                const profileSwitchSuccess = await switchToProfile(targetProfile);
                
                if (!profileSwitchSuccess) {
                    throw new Error(`Failed to switch to profile: ${targetProfile}`);
                }
                
                // Wait for profile change to complete
                try {
                    await waitForProfileChangeByPolling(targetProfile, 5000, 100);
                } catch (error) {
                    console.warn(`[Sidecar] Profile change polling failed: ${error.message}`);
                }
                
                // Safety delay after profile switch
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // NOW capture the current preset after profile switch
                // This is critical - SillyTavern automatically sets a preset when profile changes
                await new Promise(resolve => setTimeout(resolve, 200));
                currentPreset = getCurrentPresetFromManager();
                presetToRestore = currentPreset;
                console.log(`[Sidecar] Captured preset after profile switch: "${currentPreset}"`);
            } else {
                // No profile change - capture current preset now if we're switching presets
                if (targetPreset) {
                    currentPreset = getCurrentPresetFromManager();
                    presetToRestore = currentPreset;
                    console.log(`[Sidecar] Captured current preset: "${currentPreset}"`);
                }
            }
            
            // Step 2: Switch preset if specified
            if (targetPreset) {
                const profileForPreset = targetProfile || currentProfile;
                if (!profileForPreset) {
                    console.warn('[Sidecar] No profile available for preset switching');
                    return;
                }
                
                const apiType = await getProfileApiType(profileForPreset);
                if (!apiType) {
                    console.warn(`[Sidecar] Could not determine API type for profile: ${profileForPreset}`);
                    return;
                }
                
                console.log(`[Sidecar] Switching to preset: "${targetPreset}" for API: ${apiType}`);
                const presetSwitchSuccess = await switchToPreset(targetPreset, apiType);
                
                if (!presetSwitchSuccess) {
                    console.warn(`[Sidecar] Failed to switch to preset: ${targetPreset}`);
                    return;
                }
                
                // Wait for preset change
                try {
                    await waitForPresetChangeByPolling(targetPreset, apiType, 5000, 100);
                } catch (error) {
                    console.warn(`[Sidecar] Preset change polling failed: ${error.message}`);
                }
                
                // Safety delay after preset switch
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            console.log(`[Sidecar] Switching complete - Profile: "${targetProfile || 'unchanged'}", Preset: "${targetPreset || 'unchanged'}"`);
        } catch (error) {
            console.error('[Sidecar] Error in switchToTarget:', error);
            throw error;
        }
    }

    /**
     * Restore the original profile and preset
     * Order: 1) Restore preset, 2) Restore profile
     */
    async function restore() {
        try {
            console.log(`[Sidecar] Restoring - preset: "${presetToRestore}", profile: "${profileToRestore}"`);
            
            // Step 1: Restore preset if we have one and it was changed
            if (presetToRestore && targetPreset && presetToRestore !== targetPreset) {
                const currentProfileForRestore = targetProfile || currentProfile;
                if (currentProfileForRestore) {
                    const apiType = await getProfileApiType(currentProfileForRestore);
                    if (apiType) {
                        console.log(`[Sidecar] Restoring preset: "${presetToRestore}"`);
                        await switchToPreset(presetToRestore, apiType);
                        
                        try {
                            await waitForPresetChangeByPolling(presetToRestore, apiType, 5000, 100);
                        } catch (error) {
                            console.warn(`[Sidecar] Preset restore polling failed: ${error.message}`);
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            }
            
            // Step 2: Restore profile if we switched to a different one
            if (targetProfile && profileToRestore && targetProfile !== profileToRestore) {
                console.log(`[Sidecar] Restoring profile: "${profileToRestore}"`);
                await switchToProfile(profileToRestore);
                
                try {
                    await waitForProfileChangeByPolling(profileToRestore, 5000, 100);
                } catch (error) {
                    console.warn(`[Sidecar] Profile restore polling failed: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            console.log('[Sidecar] Restoration complete');
        } catch (error) {
            console.error('[Sidecar] Error in restore:', error);
        }
    }

    return {
        switch: switchToTarget,
        restore: restore,
        originalProfile: profileToRestore,
        originalPreset: presetToRestore
    };
}

/**
 * Execute an operation with a temporary profile/preset
 * Convenience wrapper around handleSwitching
 */
export async function withProfile(targetProfile, targetPreset, operation) {
    const switching = await handleSwitching(targetProfile, targetPreset);
    
    try {
        await switching.switch();
        return await operation();
    } finally {
        await switching.restore();
    }
}
