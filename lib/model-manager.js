/**
 * Model Manager - Handles Profile and Preset Switching
 * Adapted from GuidedGenerations extension
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
 * Get presets for a specific API type
 */
export async function getPresetsForApiType(apiType) {
    try {
        const context = getContext();
        if (!context || !context.CONNECT_API_MAP) return [];

        const apiInfo = context.CONNECT_API_MAP[apiType];
        if (!apiInfo) return [];

        // Extract apiId
        let apiId;
        if (typeof apiInfo === 'string') {
            apiId = apiInfo;
        } else if (apiInfo.selected) {
            apiId = apiInfo.selected;
        } else if (apiInfo.apiId) {
            apiId = apiInfo.apiId;
        } else {
            return [];
        }

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
 * Switch to a specific connection profile
 */
export async function switchToProfile(profileName) {
    try {
        const isAvailable = await waitForConnectionManager();
        if (!isAvailable) return false;

        const context = getContext();
        const { profiles } = context.extensionSettings.connectionManager;
        
        const targetProfile = profiles.find(p => p.name === profileName);
        if (!targetProfile) return false;

        // Find the dropdown in the UI to trigger the change
        // Try multiple selectors to find the profiles dropdown (robust search)
        let profilesDropdown = document.getElementById('profiles') || 
                             document.querySelector('#profiles') ||
                             document.querySelector('select[name="profiles"]') ||
                             document.querySelector('.profiles-select') ||
                             document.querySelector('[data-profile-selector]') ||
                             document.querySelector('select[id*="profile"]') ||
                             document.querySelector('select[name*="profile"]') ||
                             document.querySelector('select[class*="profile"]');

        if (!profilesDropdown) {
            // Try to find by looking at the connection manager UI
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
        }

        if (!profilesDropdown) {
            console.warn('[Sidecar] Profiles dropdown not found in UI');
            return false;
        }

        const profileIndex = Array.from(profilesDropdown.options).findIndex(o => o.value === targetProfile.id);
        if (profileIndex === -1) return false;

        profilesDropdown.selectedIndex = profileIndex;
        profilesDropdown.dispatchEvent(new Event('change'));
        
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
        if (!presetValue || !apiType) return false;

        const context = getContext();
        const apiInfo = context.CONNECT_API_MAP[apiType];
        if (!apiInfo) return false;

        let apiId;
        if (typeof apiInfo === 'string') apiId = apiInfo;
        else if (apiInfo.selected) apiId = apiInfo.selected;
        else if (apiInfo.apiId) apiId = apiInfo.apiId;
        else return false;

        const presetManager = context.getPresetManager(apiId);
        if (!presetManager || typeof presetManager.selectPreset !== 'function') {
            return false;
        }

        presetManager.selectPreset(presetValue);
        return true;
    } catch (error) {
        console.error('[Sidecar] Error switching preset:', error);
        return false;
    }
}

/**
 * Wait for the connection to stabilize after profile/preset changes
 */
async function waitForConnectionStable(maxAttempts = 15, delayMs = 200) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const context = getContext();
            // Check if there's a pending connection or if any status indicators are loading
            const onlineStatus = context?.onlineStatus;
            
            // If we have a valid online status, connection is probably stable
            if (onlineStatus && onlineStatus !== 'no_connection') {
                await new Promise(resolve => setTimeout(resolve, 100)); // Small buffer
                return true;
            }
        } catch (e) {
            // Ignore errors during check
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return true; // Continue anyway after max attempts
}

/**
 * Execute an operation with a temporary profile/preset
 */
export async function withProfile(targetProfile, targetPreset, operation) {
    const originalProfile = await getCurrentProfile();
    let originalPreset = null; // Will capture if needed

    // If no changes needed, just run
    if ((!targetProfile || targetProfile === originalProfile) && !targetPreset) {
        console.log(`[Sidecar] No profile/preset change needed, running operation directly`);
        return await operation();
    }

    // If target profile is not set (empty string), just run with current settings
    if (!targetProfile && !targetPreset) {
        console.log(`[Sidecar] No target profile/preset specified, running with current settings`);
        return await operation();
    }

    try {
        // Switch Profile
        if (targetProfile && targetProfile !== originalProfile) {
            console.log(`[Sidecar] Switching to profile: ${targetProfile}`);
            const success = await switchToProfile(targetProfile);
            if (!success) {
                console.warn(`[Sidecar] Failed to switch to profile: ${targetProfile}. Running with current profile.`);
                // Don't continue with profile-dependent operations if switch failed
            } else {
                // Wait for switch to settle - longer delay for profile changes
                console.log(`[Sidecar] Waiting for profile switch to stabilize...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                await waitForConnectionStable();
            }
        }

        // Switch Preset (only if profile switch succeeded or was not needed)
        if (targetPreset) {
            const currentProfile = targetProfile || originalProfile;
            const apiType = await getProfileApiType(currentProfile);
            
            if (apiType) {
                console.log(`[Sidecar] Switching to preset: ${targetPreset} for API type: ${apiType}`);
                const presetSuccess = await switchToPreset(targetPreset, apiType);
                if (!presetSuccess) {
                    console.warn(`[Sidecar] Failed to switch to preset: ${targetPreset}. Continuing with current preset.`);
                } else {
                    // Wait for preset switch to settle
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await waitForConnectionStable();
                }
            } else {
                console.warn(`[Sidecar] Could not determine API type for profile: ${currentProfile}`);
            }
        }

        // Final stability check before running operation
        await waitForConnectionStable();
        console.log(`[Sidecar] Running operation...`);
        
        // Run operation
        return await operation();

    } catch (error) {
        console.error(`[Sidecar] Error during profile-switched operation:`, error);
        throw error;
    } finally {
        // Restore
        if (originalProfile && originalProfile !== targetProfile && targetProfile) {
            console.log(`[Sidecar] Restoring profile: ${originalProfile}`);
            try {
                await switchToProfile(originalProfile);
                await new Promise(resolve => setTimeout(resolve, 1000));
                await waitForConnectionStable();
            } catch (restoreError) {
                console.error(`[Sidecar] Error restoring profile:`, restoreError);
            }
        }
        // Note: Preset restoration is complex because it depends on the profile.
        // Restoring the profile usually restores its last used preset in ST.
    }
}
