/**
 * UI Popup - Update Approval UI and Character Panel
 * Handles the diff view modal and character sheet side panel
 */

import { DeltaEngine } from './delta-engine.js';

/**
 * UIPopup class
 * Manages the update approval popup
 */
export class UIPopup {
    constructor() {
        this.deltaEngine = new DeltaEngine();
        this.currentCallback = null;
        this.selectedOperations = new Set();
    }

    /**
     * Show the update approval popup
     * @param {Object} result - Analysis result
     * @param {Object} currentSidecar - Current sidecar state
     * @param {Function} onApprove - Callback with approved operations
     * @param {Object} options - Display options
     * @param {boolean} options.hideNPCs - Hide NPC section (when handled separately)
     */
    showUpdatePopup(result, currentSidecar, onApprove, options = {}) {
        this.currentCallback = onApprove;
        this.selectedOperations = new Set(result.operations.map((_, i) => i));

        // Preview what each operation will do
        const previews = this.deltaEngine.previewBatch(currentSidecar, result.operations);

        // Build popup HTML with options
        const html = this.buildPopupHTML(result, previews, options);
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'sidecar-popup-overlay';
        overlay.innerHTML = html;

        // Add to DOM
        document.body.appendChild(overlay);

        // Bind events
        this.bindPopupEvents(overlay, result);
    }

    /**
     * Build the popup HTML
     * @param {Object} result - Analysis result
     * @param {Array} previews - Preview of operations
     * @param {Object} options - Build options
     * @param {boolean} options.hideNPCs - Hide NPC section (when NPC tracking handles it separately)
     */
    buildPopupHTML(result, previews, options = {}) {
        const operationsHTML = this.buildOperationsHTML(result.operations, previews);
        // Only show NPC section if not handled separately by NPC tracking
        const npcsHTML = options.hideNPCs ? '' : this.buildNPCsHTML(result.newNPCs);
        const contradictionsHTML = this.buildContradictionsHTML(result.contradictions);

        return `
            <div class="sidecar-popup">
                <div class="sidecar-popup-header">
                    <h3><i class="fa-solid fa-pen-to-square"></i> Sidecar Updates Proposed</h3>
                    <button class="sidecar-popup-close" id="sidecar-popup-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="sidecar-popup-content">
                    ${operationsHTML}
                    ${npcsHTML}
                    ${contradictionsHTML}
                </div>
                <div class="sidecar-popup-footer">
                    <button class="menu_button" id="sidecar-select-all">
                        <i class="fa-solid fa-check-double"></i> Select All
                    </button>
                    <button class="menu_button" id="sidecar-select-none">
                        <i class="fa-solid fa-xmark"></i> Select None
                    </button>
                    <button class="menu_button" id="sidecar-discard">
                        <i class="fa-solid fa-trash"></i> Discard
                    </button>
                    <button class="menu_button menu_button_icon" id="sidecar-approve">
                        <i class="fa-solid fa-check"></i> Approve Selected
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Build HTML for operations list
     */
    buildOperationsHTML(operations, previews) {
        if (!operations || operations.length === 0) {
            return `
                <div class="sidecar-empty-state">
                    <i class="fa-solid fa-check-circle"></i>
                    <p>No state changes detected</p>
                </div>
            `;
        }

        const items = operations.map((op, index) => {
            const preview = previews[index];
            const oldValue = this.deltaEngine.formatValue(preview.oldValue);
            const newValue = this.deltaEngine.formatValue(preview.newValue);

            return `
                <div class="sidecar-diff-item" data-index="${index}">
                    <input type="checkbox" class="sidecar-diff-checkbox" 
                           id="sidecar-op-${index}" checked>
                    <div class="sidecar-diff-content">
                        <div class="sidecar-diff-path">
                            <span class="sidecar-diff-op op-${op.op}">${op.op}</span>
                            ${op.path}
                        </div>
                        <div class="sidecar-diff-values">
                            <div class="sidecar-diff-old">${oldValue}</div>
                            <div class="sidecar-diff-new">${newValue}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="sidecar-diff-section">
                <h4><i class="fa-solid fa-code-compare"></i> Proposed Changes (${operations.length})</h4>
                ${items}
            </div>
        `;
    }

    /**
     * Build HTML for detected NPCs
     */
    buildNPCsHTML(npcs) {
        if (!npcs || npcs.length === 0) {
            return '';
        }

        const items = npcs.map((npc, index) => `
            <div class="sidecar-npc-item" data-npc-index="${index}">
                <span class="npc-name">${npc.name}</span>
                <span class="npc-notes">${npc.notes || 'No description'}</span>
                <button class="menu_button sidecar-create-npc-btn" data-npc-index="${index}">
                    <i class="fa-solid fa-user-plus"></i> Create
                </button>
            </div>
        `).join('');

        return `
            <div class="sidecar-npc-section">
                <h4><i class="fa-solid fa-users"></i> New NPCs Detected</h4>
                ${items}
            </div>
        `;
    }

    /**
     * Build HTML for contradictions
     */
    buildContradictionsHTML(contradictions) {
        if (!contradictions || contradictions.length === 0) {
            return '';
        }

        const items = contradictions.map(c => `
            <div class="sidecar-contradiction-item">
                <div class="issue"><i class="fa-solid fa-triangle-exclamation"></i> ${c.issue}</div>
                <div class="path">Path: ${c.path}</div>
            </div>
        `).join('');

        return `
            <div class="sidecar-contradiction-section">
                <h4><i class="fa-solid fa-circle-exclamation"></i> Contradictions Found</h4>
                ${items}
            </div>
        `;
    }

    /**
     * Bind popup event handlers
     */
    bindPopupEvents(overlay, result) {
        // Close button
        overlay.querySelector('#sidecar-popup-close').addEventListener('click', () => {
            this.closePopup();
        });

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closePopup();
            }
        });

        // Checkbox changes
        overlay.querySelectorAll('.sidecar-diff-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const index = parseInt(e.target.id.replace('sidecar-op-', ''), 10);
                if (e.target.checked) {
                    this.selectedOperations.add(index);
                } else {
                    this.selectedOperations.delete(index);
                }
            });
        });

        // Select all
        overlay.querySelector('#sidecar-select-all').addEventListener('click', () => {
            overlay.querySelectorAll('.sidecar-diff-checkbox').forEach(cb => {
                cb.checked = true;
            });
            this.selectedOperations = new Set(result.operations.map((_, i) => i));
        });

        // Select none
        overlay.querySelector('#sidecar-select-none').addEventListener('click', () => {
            overlay.querySelectorAll('.sidecar-diff-checkbox').forEach(cb => {
                cb.checked = false;
            });
            this.selectedOperations.clear();
        });

        // Discard
        overlay.querySelector('#sidecar-discard').addEventListener('click', () => {
            this.closePopup();
        });

        // Approve
        overlay.querySelector('#sidecar-approve').addEventListener('click', () => {
            const approvedOps = result.operations.filter((_, i) => 
                this.selectedOperations.has(i)
            );
            
            if (this.currentCallback) {
                this.currentCallback(approvedOps);
            }
            
            this.closePopup();
        });

        // NPC creation buttons
        overlay.querySelectorAll('.sidecar-create-npc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.npcIndex, 10);
                const npc = result.newNPCs[index];
                this.createNPCProfile(npc);
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Created';
            });
        });
    }

    /**
     * Close the popup
     */
    closePopup() {
        const overlay = document.querySelector('.sidecar-popup-overlay');
        if (overlay) {
            overlay.remove();
        }
        this.currentCallback = null;
        this.selectedOperations.clear();
    }

    /**
     * Show NPCs section separately
     */
    showNewNPCs(npcs) {
        if (!npcs || npcs.length === 0) return;

        const html = `
            <div class="sidecar-popup">
                <div class="sidecar-popup-header">
                    <h3><i class="fa-solid fa-users"></i> New NPCs Detected</h3>
                    <button class="sidecar-popup-close" id="sidecar-popup-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="sidecar-popup-content">
                    ${this.buildNPCsHTML(npcs)}
                </div>
                <div class="sidecar-popup-footer">
                    <button class="menu_button" id="sidecar-close-npcs">Close</button>
                </div>
            </div>
        `;

        const overlay = document.createElement('div');
        overlay.className = 'sidecar-popup-overlay';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector('#sidecar-popup-close').addEventListener('click', () => {
            overlay.remove();
        });
        overlay.querySelector('#sidecar-close-npcs').addEventListener('click', () => {
            overlay.remove();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    /**
     * Show contradictions alert
     */
    showContradictions(contradictions) {
        if (!contradictions || contradictions.length === 0) return;

        const html = `
            <div class="sidecar-popup">
                <div class="sidecar-popup-header">
                    <h3><i class="fa-solid fa-triangle-exclamation"></i> Contradictions Detected</h3>
                    <button class="sidecar-popup-close" id="sidecar-popup-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="sidecar-popup-content">
                    ${this.buildContradictionsHTML(contradictions)}
                    <p style="margin-top: 15px; color: var(--SmartThemeQuoteColor);">
                        The story may conflict with the tracked state. Review and update manually if needed.
                    </p>
                </div>
                <div class="sidecar-popup-footer">
                    <button class="menu_button" id="sidecar-close-contrad">Acknowledge</button>
                </div>
            </div>
        `;

        const overlay = document.createElement('div');
        overlay.className = 'sidecar-popup-overlay';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector('#sidecar-popup-close').addEventListener('click', () => {
            overlay.remove();
        });
        overlay.querySelector('#sidecar-close-contrad').addEventListener('click', () => {
            overlay.remove();
        });
    }

    /**
     * Show schema recommendations popup
     */
    showSchemaPopup(recommendations, onApprove) {
        if (!recommendations || recommendations.length === 0) return;

        const items = recommendations.map((rec, i) => `
            <div class="sidecar-schema-item">
                <h5>
                    <input type="checkbox" id="sidecar-schema-${i}" checked>
                    ${rec.name}
                    <span class="sidecar-diff-op op-${rec.priority || 'medium'}">${rec.priority || 'medium'}</span>
                </h5>
                <div class="description">${rec.description}</div>
                <pre>${JSON.stringify(rec.schema, null, 2)}</pre>
            </div>
        `).join('');

        const html = `
            <div class="sidecar-popup">
                <div class="sidecar-popup-header">
                    <h3><i class="fa-solid fa-wand-magic-sparkles"></i> Architect Recommendations</h3>
                    <button class="sidecar-popup-close" id="sidecar-popup-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="sidecar-popup-content">
                    <p style="margin-bottom: 15px;">
                        The Architect suggests adding these new trackers based on your story:
                    </p>
                    ${items}
                </div>
                <div class="sidecar-popup-footer">
                    <button class="menu_button" id="sidecar-schema-cancel">Cancel</button>
                    <button class="menu_button menu_button_icon" id="sidecar-schema-apply">
                        <i class="fa-solid fa-plus"></i> Add Selected
                    </button>
                </div>
            </div>
        `;

        const overlay = document.createElement('div');
        overlay.className = 'sidecar-popup-overlay';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector('#sidecar-popup-close').addEventListener('click', () => {
            overlay.remove();
        });
        overlay.querySelector('#sidecar-schema-cancel').addEventListener('click', () => {
            overlay.remove();
        });
        overlay.querySelector('#sidecar-schema-apply').addEventListener('click', () => {
            const selected = [];
            recommendations.forEach((rec, i) => {
                const checkbox = overlay.querySelector(`#sidecar-schema-${i}`);
                if (checkbox && checkbox.checked) {
                    selected.push(rec);
                }
            });

            if (selected.length > 0 && onApprove) {
                // Convert recommendations to schema changes
                const schemaChanges = {
                    trackers: {}
                };
                for (const rec of selected) {
                    schemaChanges.trackers[rec.name] = rec.schema.default || 
                        (rec.schema.type === 'array' ? [] : 
                         rec.schema.type === 'object' ? {} : '');
                }
                onApprove(schemaChanges);
            }
            overlay.remove();
        });
    }

    /**
     * Create NPC profile (placeholder)
     */
    async createNPCProfile(npc) {
        console.log('[UIPopup] Creating NPC profile:', npc);
        // This would integrate with sidecarManager.createNPC
        // Left as a hook for the main module to implement
    }

    /**
     * Show NPC updates approval popup
     * Displays proposed changes for all NPCs and allows selective approval
     * @param {Object} actions - Classification actions from processClassifications
     * @param {Object} npcRegistry - The NPC registry instance
     * @param {Function} onApprove - Callback with approved actions
     */
    showNPCUpdatePopup(actions, npcRegistry, onApprove) {
        // Count total actions
        const totalActions = (actions.creates?.length || 0) +
                            (actions.promotions?.length || 0) +
                            (actions.demotions?.length || 0) +
                            (actions.updates?.length || 0);

        if (totalActions === 0) {
            console.log('[UIPopup] No NPC actions to show');
            return;
        }

        // Build popup HTML
        const html = this.buildNPCUpdatePopupHTML(actions, npcRegistry);
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'sidecar-popup-overlay';
        overlay.innerHTML = html;

        // Add to DOM
        document.body.appendChild(overlay);

        // Bind events
        this.bindNPCUpdatePopupEvents(overlay, actions, onApprove);
    }

    /**
     * Build the NPC update popup HTML
     */
    buildNPCUpdatePopupHTML(actions, npcRegistry) {
        let sectionsHTML = '';

        // New NPCs section
        if (actions.creates?.length > 0) {
            sectionsHTML += `
                <div class="sidecar-npc-update-section">
                    <h4><i class="fa-solid fa-user-plus"></i> New NPCs (${actions.creates.length})</h4>
                    ${actions.creates.map((create, i) => `
                        <div class="sidecar-npc-update-item" data-action="create" data-index="${i}">
                            <input type="checkbox" class="sidecar-npc-update-checkbox"
                                   id="sidecar-npc-create-${i}" checked>
                            <div class="sidecar-npc-update-content">
                                <div class="sidecar-npc-update-name">
                                    <span class="sidecar-npc-badge ${create.classification}">${create.classification === 'major' ? '⭐' : '●'}</span>
                                    ${create.name}
                                </div>
                                <div class="sidecar-npc-update-detail">
                                    ${create.notes || 'No notes'}
                                </div>
                                ${create.updates?.length > 0 ? `
                                    <div class="sidecar-npc-update-ops">
                                        ${create.updates.map(op => `<span class="sidecar-diff-op op-${op.op}">${op.op}</span> ${op.path}`).join('<br>')}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Promotions section
        if (actions.promotions?.length > 0) {
            sectionsHTML += `
                <div class="sidecar-npc-update-section">
                    <h4><i class="fa-solid fa-arrow-up"></i> Promotions (${actions.promotions.length})</h4>
                    ${actions.promotions.map((promo, i) => `
                        <div class="sidecar-npc-update-item" data-action="promote" data-index="${i}">
                            <input type="checkbox" class="sidecar-npc-update-checkbox"
                                   id="sidecar-npc-promote-${i}" checked>
                            <div class="sidecar-npc-update-content">
                                <div class="sidecar-npc-update-name">
                                    <span class="sidecar-npc-badge minor">●</span>
                                    →
                                    <span class="sidecar-npc-badge major">⭐</span>
                                    ${promo.name}
                                </div>
                                <div class="sidecar-npc-update-detail">
                                    ${promo.reason || 'Promoted based on narrative significance'}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Demotions section
        if (actions.demotions?.length > 0) {
            sectionsHTML += `
                <div class="sidecar-npc-update-section">
                    <h4><i class="fa-solid fa-arrow-down"></i> Demotions (${actions.demotions.length})</h4>
                    ${actions.demotions.map((demo, i) => `
                        <div class="sidecar-npc-update-item" data-action="demote" data-index="${i}">
                            <input type="checkbox" class="sidecar-npc-update-checkbox"
                                   id="sidecar-npc-demote-${i}" checked>
                            <div class="sidecar-npc-update-content">
                                <div class="sidecar-npc-update-name">
                                    <span class="sidecar-npc-badge major">⭐</span>
                                    →
                                    <span class="sidecar-npc-badge minor">●</span>
                                    ${demo.name}
                                </div>
                                <div class="sidecar-npc-update-detail">
                                    ${demo.reason || 'Demoted due to reduced narrative importance'}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Updates section (delta operations for existing NPCs)
        if (actions.updates?.length > 0) {
            sectionsHTML += `
                <div class="sidecar-npc-update-section">
                    <h4><i class="fa-solid fa-pen-to-square"></i> NPC Updates (${actions.updates.length})</h4>
                    ${actions.updates.map((update, i) => {
                        // Get NPC from registry for display
                        const npc = npcRegistry?.get(update.npcId);
                        const classification = npc?.meta?.classification || 'minor';
                        const badge = classification === 'major' ? '⭐' : '●';
                        
                        return `
                            <div class="sidecar-npc-update-item" data-action="update" data-index="${i}">
                                <input type="checkbox" class="sidecar-npc-update-checkbox"
                                       id="sidecar-npc-update-${i}" checked>
                                <div class="sidecar-npc-update-content">
                                    <div class="sidecar-npc-update-name">
                                        <span class="sidecar-npc-badge ${classification}">${badge}</span>
                                        ${update.name}
                                    </div>
                                    <div class="sidecar-npc-update-ops">
                                        ${update.operations.map(op => `
                                            <div class="sidecar-npc-op-row">
                                                <span class="sidecar-diff-op op-${op.op}">${op.op}</span>
                                                <span class="sidecar-npc-op-path">${op.path}</span>
                                                ${op.value !== undefined ? `<span class="sidecar-npc-op-value">→ ${this.deltaEngine.formatValue(op.value)}</span>` : ''}
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        return `
            <div class="sidecar-popup sidecar-popup-npc">
                <div class="sidecar-popup-header">
                    <h3><i class="fa-solid fa-users"></i> NPC Updates Proposed</h3>
                    <button class="sidecar-popup-close" id="sidecar-npc-popup-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="sidecar-popup-content">
                    ${sectionsHTML}
                </div>
                <div class="sidecar-popup-footer">
                    <button class="menu_button" id="sidecar-npc-select-all">
                        <i class="fa-solid fa-check-double"></i> Select All
                    </button>
                    <button class="menu_button" id="sidecar-npc-select-none">
                        <i class="fa-solid fa-xmark"></i> Select None
                    </button>
                    <button class="menu_button" id="sidecar-npc-discard">
                        <i class="fa-solid fa-trash"></i> Discard
                    </button>
                    <button class="menu_button menu_button_icon" id="sidecar-npc-approve">
                        <i class="fa-solid fa-check"></i> Approve Selected
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Bind NPC update popup event handlers
     */
    bindNPCUpdatePopupEvents(overlay, actions, onApprove) {
        // Close button
        overlay.querySelector('#sidecar-npc-popup-close').addEventListener('click', () => {
            overlay.remove();
        });

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // Select all
        overlay.querySelector('#sidecar-npc-select-all').addEventListener('click', () => {
            overlay.querySelectorAll('.sidecar-npc-update-checkbox').forEach(cb => {
                cb.checked = true;
            });
        });

        // Select none
        overlay.querySelector('#sidecar-npc-select-none').addEventListener('click', () => {
            overlay.querySelectorAll('.sidecar-npc-update-checkbox').forEach(cb => {
                cb.checked = false;
            });
        });

        // Discard
        overlay.querySelector('#sidecar-npc-discard').addEventListener('click', () => {
            overlay.remove();
        });

        // Approve
        overlay.querySelector('#sidecar-npc-approve').addEventListener('click', () => {
            // Build approved actions based on checkboxes
            const approvedActions = {
                creates: [],
                promotions: [],
                demotions: [],
                updates: []
            };

            // Check creates
            actions.creates?.forEach((create, i) => {
                const checkbox = overlay.querySelector(`#sidecar-npc-create-${i}`);
                if (checkbox?.checked) {
                    approvedActions.creates.push(create);
                }
            });

            // Check promotions
            actions.promotions?.forEach((promo, i) => {
                const checkbox = overlay.querySelector(`#sidecar-npc-promote-${i}`);
                if (checkbox?.checked) {
                    approvedActions.promotions.push(promo);
                }
            });

            // Check demotions
            actions.demotions?.forEach((demo, i) => {
                const checkbox = overlay.querySelector(`#sidecar-npc-demote-${i}`);
                if (checkbox?.checked) {
                    approvedActions.demotions.push(demo);
                }
            });

            // Check updates
            actions.updates?.forEach((update, i) => {
                const checkbox = overlay.querySelector(`#sidecar-npc-update-${i}`);
                if (checkbox?.checked) {
                    approvedActions.updates.push(update);
                }
            });

            if (onApprove) {
                onApprove(approvedActions);
            }
            
            overlay.remove();
        });
    }
}

/**
 * CharacterPanel class
 * Manages the side panel character sheet
 */
export class CharacterPanel {
    constructor(sidecarManager, triggerAnalysis, triggerArchitect, npcRegistry = null) {
        this.sidecarManager = sidecarManager;
        this.triggerAnalysis = triggerAnalysis;
        this.triggerArchitect = triggerArchitect;
        this.npcRegistry = npcRegistry;
        this.isOpen = false;
        this.panelElement = null;
        this.toggleButton = null;
        this.currentSelection = 'main'; // 'main', 'npcs', or specific NPC ID
        this.currentSidecar = null;
        this.npcList = [];
        // Callbacks for NPC actions
        this.onPromoteNPC = null;
        this.onDemoteNPC = null;
        this.onDeleteNPC = null;
    }

    /**
     * Set NPC registry (can be set after construction)
     */
    setNPCRegistry(npcRegistry) {
        this.npcRegistry = npcRegistry;
    }

    /**
     * Set NPC action callbacks
     */
    setNPCCallbacks({ onPromote, onDemote, onDelete }) {
        this.onPromoteNPC = onPromote;
        this.onDemoteNPC = onDemote;
        this.onDeleteNPC = onDelete;
    }

    /**
     * Add panel and toggle button to UI
     */
    addToUI() {
        // Create toggle button
        this.toggleButton = document.createElement('button');
        this.toggleButton.id = 'sidecar-panel-toggle';
        this.toggleButton.innerHTML = '<i class="fa-solid fa-id-card"></i>';
        this.toggleButton.title = 'Toggle Sidecar Panel';
        this.toggleButton.addEventListener('click', () => this.toggle());
        document.body.appendChild(this.toggleButton);

        // Create panel
        this.panelElement = document.createElement('div');
        this.panelElement.className = 'sidecar-panel';
        this.panelElement.innerHTML = this.buildPanelHTML();
        document.body.appendChild(this.panelElement);

        // Bind panel events
        this.bindPanelEvents();
    }

    /**
     * Build panel HTML
     */
    buildPanelHTML() {
        return `
            <div class="sidecar-panel-header">
                <h3><i class="fa-solid fa-id-card"></i> Character Sheet</h3>
                <div class="sidecar-panel-actions">
                    <button id="sidecar-panel-refresh" title="Refresh">
                        <i class="fa-solid fa-sync"></i>
                    </button>
                    <button id="sidecar-panel-analyze" title="Analyze Now">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </button>
                    <button id="sidecar-panel-architect" title="Architect Mode">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </button>
                    <button id="sidecar-panel-close" title="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            <div class="sidecar-character-selector">
                <select id="sidecar-character-select">
                    <option value="main">Main Character</option>
                    <option value="npcs">📋 NPC Registry</option>
                </select>
            </div>
            <div class="sidecar-panel-content" id="sidecar-panel-content">
                <div class="sidecar-empty-state">
                    <i class="fa-solid fa-user-slash"></i>
                    <p>No character selected</p>
                    <p>Start a chat to begin tracking</p>
                </div>
            </div>
        `;
    }

    /**
     * Bind panel event handlers
     */
    bindPanelEvents() {
        this.panelElement.querySelector('#sidecar-panel-close').addEventListener('click', () => {
            this.close();
        });

        this.panelElement.querySelector('#sidecar-panel-refresh').addEventListener('click', () => {
            this.refresh();
        });

        this.panelElement.querySelector('#sidecar-panel-analyze').addEventListener('click', () => {
            if (this.triggerAnalysis) this.triggerAnalysis();
        });

        this.panelElement.querySelector('#sidecar-panel-architect').addEventListener('click', () => {
            if (this.triggerArchitect) this.triggerArchitect();
        });

        // Character/NPC selector dropdown
        this.panelElement.querySelector('#sidecar-character-select').addEventListener('change', (e) => {
            this.currentSelection = e.target.value;
            this.renderCurrentSelection();
        });
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open the panel
     */
    open() {
        this.isOpen = true;
        this.panelElement.classList.add('open');
        this.toggleButton.classList.add('active');
        this.refresh();
    }

    /**
     * Close the panel
     */
    close() {
        this.isOpen = false;
        this.panelElement.classList.remove('open');
        this.toggleButton.classList.remove('active');
    }

    /**
     * Show the NPC registry view (opens panel if needed and navigates to registry)
     */
    showNPCRegistry() {
        // Open panel if not already open
        if (!this.isOpen) {
            this.open();
        }
        
        // Switch to NPC registry view
        this.currentSelection = 'npcs';
        const select = this.panelElement.querySelector('#sidecar-character-select');
        if (select) {
            select.value = 'npcs';
        }
        this.renderCurrentSelection();
    }

    /**
     * Refresh panel content
     */
    async refresh() {
        const context = SillyTavern.getContext();
        const charIndex = context.characterId;
        
        if (charIndex === undefined || charIndex === null || charIndex < 0) {
            this.showEmpty();
            return;
        }

        const character = context.characters[charIndex];
        if (!character) {
            this.showEmpty();
            return;
        }

        const charId = character.avatar || character.name;
        const sidecar = await this.sidecarManager.load(charId);

        if (!sidecar) {
            this.showEmpty();
            return;
        }

        // Store current sidecar and update NPC list
        this.currentSidecar = sidecar;
        this.updateNPCDropdown(sidecar, character.name);
        
        // Render based on current selection
        this.renderCurrentSelection();
    }

    /**
     * Update the NPC dropdown with available NPCs from registry and relationships
     */
    updateNPCDropdown(sidecar, mainCharName) {
        const select = this.panelElement.querySelector('#sidecar-character-select');
        if (!select) return;

        // Preserve current selection if still valid
        const currentValue = this.currentSelection;
        
        // Rebuild dropdown options
        let optionsHTML = `<option value="main">${mainCharName || 'Main Character'} (Main)</option>`;
        optionsHTML += `<option value="npcs" ${currentValue === 'npcs' ? 'selected' : ''}>📋 NPC Registry</option>`;
        
        // Get NPCs from registry if available
        if (this.npcRegistry) {
            const majorNPCs = this.npcRegistry.getByClassification('major');
            const minorNPCs = this.npcRegistry.getByClassification('minor');
            
            if (majorNPCs.length > 0) {
                optionsHTML += '<optgroup label="⭐ Major NPCs">';
                for (const npc of majorNPCs) {
                    const npcId = npc.meta.npcId;
                    const name = npc.meta.name;
                    const selected = currentValue === npcId ? 'selected' : '';
                    const pinned = npc.meta.userPinned ? ' 📌' : '';
                    optionsHTML += `<option value="${npcId}" ${selected}>${name}${pinned}</option>`;
                }
                optionsHTML += '</optgroup>';
            }
            
            if (minorNPCs.length > 0) {
                optionsHTML += '<optgroup label="Minor NPCs">';
                for (const npc of minorNPCs) {
                    const npcId = npc.meta.npcId;
                    const name = npc.meta.name;
                    const selected = currentValue === npcId ? 'selected' : '';
                    const pinned = npc.meta.userPinned ? ' 📌' : '';
                    optionsHTML += `<option value="${npcId}" ${selected}>${name}${pinned}</option>`;
                }
                optionsHTML += '</optgroup>';
            }
            
            // Store NPC IDs for validation
            this.npcList = [...majorNPCs, ...minorNPCs].map(n => n.meta.npcId);
        } else {
            // Fallback to relationships if no registry
            this.npcList = [];
            if (sidecar.trackers?.relationships) {
                this.npcList = Object.keys(sidecar.trackers.relationships);
                
                if (this.npcList.length > 0) {
                    optionsHTML += '<optgroup label="NPCs (from relationships)">';
                    for (const npcName of this.npcList) {
                        const selected = currentValue === npcName ? 'selected' : '';
                        optionsHTML += `<option value="${npcName}" ${selected}>${npcName}</option>`;
                    }
                    optionsHTML += '</optgroup>';
                }
            }
        }

        select.innerHTML = optionsHTML;

        // Reset to main if current selection is no longer valid
        if (currentValue !== 'main' && currentValue !== 'npcs' && !this.npcList.includes(currentValue)) {
            this.currentSelection = 'main';
            select.value = 'main';
        }
    }

    /**
     * Render content based on current selection (main character, NPC registry, or specific NPC)
     */
    renderCurrentSelection() {
        if (!this.currentSidecar && this.currentSelection !== 'npcs') {
            this.showEmpty();
            return;
        }

        if (this.currentSelection === 'main') {
            // Render main character's full sidecar
            this.renderSidecar(this.currentSidecar);
        } else if (this.currentSelection === 'npcs') {
            // Render NPC registry overview
            this.renderNPCRegistry();
        } else if (this.npcRegistry) {
            // Try to render NPC from registry first
            const npc = this.npcRegistry.get(this.currentSelection);
            if (npc) {
                this.renderNPCSidecar(npc);
            } else {
                // Fallback to rendering from relationships
                this.renderNPCInfo(this.currentSelection);
            }
        } else {
            // Render NPC info from relationships
            this.renderNPCInfo(this.currentSelection);
        }
    }

    /**
     * Render NPC Registry overview (list of all tracked NPCs)
     */
    renderNPCRegistry() {
        const content = this.panelElement.querySelector('#sidecar-panel-content');
        
        if (!this.npcRegistry) {
            content.innerHTML = `
                <div class="sidecar-empty-state">
                    <i class="fa-solid fa-users-slash"></i>
                    <p>NPC Registry not available</p>
                    <p>Start a chat with NPC tracking enabled</p>
                </div>
            `;
            return;
        }

        const majorNPCs = this.npcRegistry.getByClassification('major');
        const minorNPCs = this.npcRegistry.getByClassification('minor');
        const totalNPCs = majorNPCs.length + minorNPCs.length;

        if (totalNPCs === 0) {
            content.innerHTML = `
                <div class="sidecar-empty-state">
                    <i class="fa-solid fa-users"></i>
                    <p>No NPCs tracked yet</p>
                    <p>NPCs will be detected as the story progresses</p>
                </div>
            `;
            return;
        }

        // Build registry overview
        content.innerHTML = `
            <div class="sidecar-npc-registry-header">
                <h4><i class="fa-solid fa-users"></i> NPC Registry</h4>
                <span class="sidecar-npc-count">${totalNPCs} NPCs tracked</span>
            </div>
            ${this.renderSection('Major NPCs', 'fa-star', this.renderNPCList(majorNPCs, 'major'))}
            ${this.renderSection('Minor NPCs', 'fa-user', this.renderNPCList(minorNPCs, 'minor'), true)}
        `;

        // Bind section toggles
        content.querySelectorAll('.sidecar-section-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggle.closest('.sidecar-section').classList.toggle('collapsed');
            });
        });

        // Bind NPC item clicks to navigate
        content.querySelectorAll('.sidecar-npc-registry-item').forEach(item => {
            item.addEventListener('click', () => {
                const npcId = item.dataset.npcId;
                if (npcId) {
                    this.currentSelection = npcId;
                    const select = this.panelElement.querySelector('#sidecar-character-select');
                    if (select) select.value = npcId;
                    this.renderCurrentSelection();
                }
            });
        });

        // Bind promote/demote buttons
        this.bindNPCActionButtons(content);
    }

    /**
     * Render list of NPCs for registry view
     */
    renderNPCList(npcs, classification) {
        if (!npcs || npcs.length === 0) {
            return `<p class="sidecar-empty">No ${classification} NPCs</p>`;
        }

        return npcs.map(npc => {
            const meta = npc.meta;
            const isPinned = meta.userPinned ? '<span class="sidecar-npc-pin" title="Pinned by user">📌</span>' : '';
            const badge = classification === 'major'
                ? '<span class="sidecar-npc-badge major" title="Major character">⭐</span>'
                : '<span class="sidecar-npc-badge minor" title="Minor character">●</span>';
            
            // Get summary info
            let summary = '';
            if (classification === 'major' && npc.trackers?.status?.mood) {
                summary = npc.trackers.status.mood;
            } else if (npc.data?.sentiment) {
                summary = npc.data.sentiment;
            } else if (npc.data?.notes) {
                summary = npc.data.notes.substring(0, 50) + (npc.data.notes.length > 50 ? '...' : '');
            }

            const actionButton = classification === 'major'
                ? `<button class="sidecar-npc-action demote" data-npc-id="${meta.npcId}" title="Demote to minor"><i class="fa-solid fa-arrow-down"></i></button>`
                : `<button class="sidecar-npc-action promote" data-npc-id="${meta.npcId}" title="Promote to major"><i class="fa-solid fa-arrow-up"></i></button>`;

            return `
                <div class="sidecar-npc-registry-item" data-npc-id="${meta.npcId}">
                    <div class="sidecar-npc-registry-info">
                        ${badge}
                        <span class="sidecar-npc-registry-name">${meta.name}</span>
                        ${isPinned}
                    </div>
                    <div class="sidecar-npc-registry-summary">${summary || 'No info'}</div>
                    <div class="sidecar-npc-registry-meta">
                        Seen ${meta.appearanceCount || 1}x • Last: Turn ${meta.lastSeen || '?'}
                    </div>
                    <div class="sidecar-npc-registry-actions">
                        ${actionButton}
                        <button class="sidecar-npc-action delete" data-npc-id="${meta.npcId}" title="Delete NPC"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Bind NPC action button event handlers
     */
    bindNPCActionButtons(container) {
        // Promote buttons
        container.querySelectorAll('.sidecar-npc-action.promote').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const npcId = btn.dataset.npcId;
                this.showPromoteConfirmation(npcId);
            });
        });

        // Demote buttons
        container.querySelectorAll('.sidecar-npc-action.demote').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const npcId = btn.dataset.npcId;
                this.showDemoteConfirmation(npcId);
            });
        });

        // Delete buttons
        container.querySelectorAll('.sidecar-npc-action.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const npcId = btn.dataset.npcId;
                this.showDeleteConfirmation(npcId);
            });
        });
    }

    /**
     * Show promotion confirmation popup
     */
    showPromoteConfirmation(npcId) {
        if (!this.npcRegistry) return;
        
        const npc = this.npcRegistry.get(npcId);
        if (!npc) return;

        const name = npc.meta.name;
        const html = `
            <div class="sidecar-popup sidecar-popup-small">
                <div class="sidecar-popup-header">
                    <h3><i class="fa-solid fa-arrow-up"></i> Promote NPC</h3>
                </div>
                <div class="sidecar-popup-content">
                    <p>Promote <strong>${name}</strong> to a <strong>major character</strong>?</p>
                    <p class="sidecar-popup-hint">
                        Major characters receive comprehensive tracking including personality,
                        goals, emotional states, and full relationship data.
                    </p>
                    <label class="sidecar-checkbox-label">
                        <input type="checkbox" id="sidecar-promote-pin">
                        Pin to prevent automatic reclassification
                    </label>
                </div>
                <div class="sidecar-popup-footer">
                    <button class="menu_button" id="sidecar-promote-cancel">Cancel</button>
                    <button class="menu_button menu_button_icon" id="sidecar-promote-confirm">
                        <i class="fa-solid fa-arrow-up"></i> Promote
                    </button>
                </div>
            </div>
        `;

        const overlay = document.createElement('div');
        overlay.className = 'sidecar-popup-overlay';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector('#sidecar-promote-cancel').addEventListener('click', () => {
            overlay.remove();
        });
        
        overlay.querySelector('#sidecar-promote-confirm').addEventListener('click', () => {
            const shouldPin = overlay.querySelector('#sidecar-promote-pin').checked;
            if (this.onPromoteNPC) {
                this.onPromoteNPC(npcId, shouldPin);
            }
            overlay.remove();
            this.refresh();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    /**
     * Show demotion confirmation popup
     */
    showDemoteConfirmation(npcId) {
        if (!this.npcRegistry) return;
        
        const npc = this.npcRegistry.get(npcId);
        if (!npc) return;

        const name = npc.meta.name;
        const html = `
            <div class="sidecar-popup sidecar-popup-small">
                <div class="sidecar-popup-header">
                    <h3><i class="fa-solid fa-arrow-down"></i> Demote NPC</h3>
                </div>
                <div class="sidecar-popup-content">
                    <p>Demote <strong>${name}</strong> to a <strong>minor character</strong>?</p>
                    <p class="sidecar-popup-hint">
                        Minor characters retain essential info (name, notes, sentiment)
                        but detailed tracking data will be condensed.
                    </p>
                    <label class="sidecar-checkbox-label">
                        <input type="checkbox" id="sidecar-demote-pin">
                        Pin to prevent automatic reclassification
                    </label>
                </div>
                <div class="sidecar-popup-footer">
                    <button class="menu_button" id="sidecar-demote-cancel">Cancel</button>
                    <button class="menu_button" id="sidecar-demote-confirm">
                        <i class="fa-solid fa-arrow-down"></i> Demote
                    </button>
                </div>
            </div>
        `;

        const overlay = document.createElement('div');
        overlay.className = 'sidecar-popup-overlay';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector('#sidecar-demote-cancel').addEventListener('click', () => {
            overlay.remove();
        });
        
        overlay.querySelector('#sidecar-demote-confirm').addEventListener('click', () => {
            const shouldPin = overlay.querySelector('#sidecar-demote-pin').checked;
            if (this.onDemoteNPC) {
                this.onDemoteNPC(npcId, shouldPin);
            }
            overlay.remove();
            this.refresh();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    /**
     * Show delete confirmation popup
     */
    showDeleteConfirmation(npcId) {
        if (!this.npcRegistry) return;
        
        const npc = this.npcRegistry.get(npcId);
        if (!npc) return;

        const name = npc.meta.name;
        const html = `
            <div class="sidecar-popup sidecar-popup-small">
                <div class="sidecar-popup-header">
                    <h3><i class="fa-solid fa-trash"></i> Delete NPC</h3>
                </div>
                <div class="sidecar-popup-content">
                    <p>Delete <strong>${name}</strong> from tracking?</p>
                    <p class="sidecar-popup-hint sidecar-popup-warning">
                        This will permanently remove all tracked data for this NPC.
                        The NPC may be re-detected in future story updates.
                    </p>
                </div>
                <div class="sidecar-popup-footer">
                    <button class="menu_button" id="sidecar-delete-cancel">Cancel</button>
                    <button class="menu_button menu_button_danger" id="sidecar-delete-confirm">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;

        const overlay = document.createElement('div');
        overlay.className = 'sidecar-popup-overlay';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector('#sidecar-delete-cancel').addEventListener('click', () => {
            overlay.remove();
        });
        
        overlay.querySelector('#sidecar-delete-confirm').addEventListener('click', () => {
            if (this.onDeleteNPC) {
                this.onDeleteNPC(npcId);
            }
            overlay.remove();
            // Reset selection if we deleted the currently viewed NPC
            if (this.currentSelection === npcId) {
                this.currentSelection = 'npcs';
                const select = this.panelElement.querySelector('#sidecar-character-select');
                if (select) select.value = 'npcs';
            }
            this.refresh();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    /**
     * Render a full NPC sidecar (for major NPCs from registry)
     */
    renderNPCSidecar(npc) {
        const content = this.panelElement.querySelector('#sidecar-panel-content');
        const meta = npc.meta;
        const isMajor = meta.classification === 'major';

        // Header with classification badge and actions
        let headerHTML = `
            <div class="sidecar-npc-detail-header">
                <div class="sidecar-npc-detail-title">
                    <span class="sidecar-npc-badge ${meta.classification}">${isMajor ? '⭐' : '●'}</span>
                    <h4>${meta.name}</h4>
                    ${meta.userPinned ? '<span class="sidecar-npc-pin" title="Pinned by user">📌</span>' : ''}
                </div>
                <div class="sidecar-npc-detail-actions">
                    ${isMajor
                        ? `<button class="sidecar-npc-action demote" data-npc-id="${meta.npcId}" title="Demote to minor"><i class="fa-solid fa-arrow-down"></i></button>`
                        : `<button class="sidecar-npc-action promote" data-npc-id="${meta.npcId}" title="Promote to major"><i class="fa-solid fa-arrow-up"></i></button>`
                    }
                    <button class="sidecar-npc-action delete" data-npc-id="${meta.npcId}" title="Delete NPC"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="sidecar-npc-detail-meta">
                First appeared: Turn ${meta.firstAppearance || '?'} •
                Last seen: Turn ${meta.lastSeen || '?'} •
                Appearances: ${meta.appearanceCount || 1}
            </div>
        `;

        if (isMajor) {
            // Render full sidecar for major NPCs
            content.innerHTML = `
                ${headerHTML}
                ${this.renderSection('Status', 'fa-heart-pulse', this.renderStatus(npc.trackers?.status))}
                ${this.renderSection('Personality', 'fa-masks-theater', this.renderNPCPersonality(npc))}
                ${this.renderSection('Appearance', 'fa-shirt', this.renderAppearance(npc.trackers?.appearance))}
                ${this.renderSection('Inventory', 'fa-briefcase', this.renderInventory(npc.trackers?.inventory))}
                ${this.renderSection('Relationships', 'fa-users', this.renderRelationships(npc.trackers?.relationships))}
                ${this.renderSection('Knowledge', 'fa-brain', this.renderKnowledge(npc.trackers?.knowledge))}
                ${this.renderSection('Timeline', 'fa-clock-rotate-left', this.renderTimeline(npc.timeline))}
                ${this.renderSection('Narrative Role', 'fa-book', this.renderNarrativeRole(npc))}
            `;
        } else {
            // Render simplified view for minor NPCs
            content.innerHTML = `
                ${headerHTML}
                ${this.renderSection('Info', 'fa-info-circle', this.renderMinorNPCInfo(npc))}
            `;
        }

        // Bind section toggles
        content.querySelectorAll('.sidecar-section-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggle.closest('.sidecar-section').classList.toggle('collapsed');
            });
        });

        // Bind action buttons
        this.bindNPCActionButtons(content);
    }

    /**
     * Render personality section for major NPCs
     */
    renderNPCPersonality(npc) {
        const personality = npc.personality;
        if (!personality) return '<p class="sidecar-empty">No personality data</p>';

        let html = '';
        if (personality.traits?.length > 0) {
            html += `
                <div class="sidecar-data-row" style="flex-direction: column; align-items: stretch;">
                    <span class="sidecar-data-label">Traits</span>
                    <div class="sidecar-tags">
                        ${personality.traits.map(t => `<span class="sidecar-tag">${t}</span>`).join('')}
                    </div>
                </div>
            `;
        }
        if (personality.motivations?.length > 0) {
            html += `
                <div class="sidecar-data-row" style="flex-direction: column; align-items: stretch;">
                    <span class="sidecar-data-label">Motivations</span>
                    <ul class="sidecar-list">
                        ${personality.motivations.map(m => `<li>${m}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        if (personality.fears?.length > 0) {
            html += `
                <div class="sidecar-data-row" style="flex-direction: column; align-items: stretch;">
                    <span class="sidecar-data-label">Fears</span>
                    <ul class="sidecar-list">
                        ${personality.fears.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        html += this.renderDataRow('Speech Pattern', personality.speechPattern);

        return html || '<p class="sidecar-empty">No personality data</p>';
    }

    /**
     * Render narrative role section for major NPCs
     */
    renderNarrativeRole(npc) {
        const role = npc.narrativeRole;
        if (!role) return '<p class="sidecar-empty">No narrative role data</p>';

        let html = '';
        html += this.renderDataRow('Role', role.role);
        html += this.renderDataRow('Significance', role.significance);
        
        if (role.plotRelevance?.length > 0) {
            html += `
                <div class="sidecar-data-row" style="flex-direction: column; align-items: stretch;">
                    <span class="sidecar-data-label">Plot Relevance</span>
                    <ul class="sidecar-list">
                        ${role.plotRelevance.map(p => `<li>${p}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        return html || '<p class="sidecar-empty">No narrative role data</p>';
    }

    /**
     * Render info section for minor NPCs
     */
    renderMinorNPCInfo(npc) {
        const data = npc.data || {};
        let html = '';

        html += this.renderDataRow('Sentiment', data.sentiment);
        
        if (data.notes) {
            html += `
                <div class="sidecar-data-row" style="flex-direction: column; align-items: stretch;">
                    <span class="sidecar-data-label">Notes</span>
                    <div class="sidecar-npc-notes">${data.notes}</div>
                </div>
            `;
        }

        html += this.renderDataRow('Last Context', data.lastContext);

        return html || '<p class="sidecar-empty">No info tracked</p>';
    }

    /**
     * Render NPC information from relationships data
     */
    renderNPCInfo(npcName) {
        const relationships = this.currentSidecar?.trackers?.relationships;
        const npcData = relationships?.[npcName];

        if (!npcData) {
            this.showEmpty();
            return;
        }

        const content = this.panelElement.querySelector('#sidecar-panel-content');
        
        // Build NPC info display
        content.innerHTML = `
            <div class="sidecar-npc-header">
                <h4><i class="fa-solid fa-user"></i> ${npcName}</h4>
            </div>
            ${this.renderSection('Relationship', 'fa-heart', this.renderNPCRelationship(npcData))}
            ${this.renderSection('Details', 'fa-info-circle', this.renderNPCDetails(npcData))}
        `;

        // Bind section toggles
        content.querySelectorAll('.sidecar-section-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggle.closest('.sidecar-section').classList.toggle('collapsed');
            });
        });
    }

    /**
     * Render NPC relationship info
     */
    renderNPCRelationship(npcData) {
        let html = '';
        
        if (npcData.trustLevel !== undefined) {
            html += this.renderDataRow('Trust Level', `${npcData.trustLevel}%`);
        }
        if (npcData.sentiment) {
            html += this.renderDataRow('Sentiment', npcData.sentiment);
        }
        if (npcData.relationship) {
            html += this.renderDataRow('Relationship', npcData.relationship);
        }
        if (npcData.status) {
            html += this.renderDataRow('Status', npcData.status);
        }

        return html || '<p class="sidecar-empty">No relationship data</p>';
    }

    /**
     * Render NPC additional details
     */
    renderNPCDetails(npcData) {
        let html = '';

        if (npcData.notes) {
            html += `<div class="sidecar-npc-notes">${npcData.notes}</div>`;
        }
        if (npcData.description) {
            html += `<div class="sidecar-npc-description">${npcData.description}</div>`;
        }
        if (npcData.lastInteraction) {
            html += this.renderDataRow('Last Interaction', npcData.lastInteraction);
        }
        if (npcData.met) {
            html += this.renderDataRow('Met', npcData.met);
        }
        if (npcData.location) {
            html += this.renderDataRow('Location', npcData.location);
        }

        // Render any custom fields
        const standardKeys = ['trustLevel', 'sentiment', 'relationship', 'status', 'notes', 'description', 'lastInteraction', 'met', 'location'];
        const customKeys = Object.keys(npcData).filter(k => !standardKeys.includes(k));
        
        for (const key of customKeys) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const value = typeof npcData[key] === 'object' ? JSON.stringify(npcData[key]) : npcData[key];
            html += this.renderDataRow(label, value);
        }

        return html || '<p class="sidecar-empty">No additional details</p>';
    }

    /**
     * Show empty state
     */
    showEmpty() {
        const content = this.panelElement.querySelector('#sidecar-panel-content');
        content.innerHTML = `
            <div class="sidecar-empty-state">
                <i class="fa-solid fa-user-slash"></i>
                <p>No character selected</p>
                <p>Start a chat to begin tracking</p>
            </div>
        `;
    }

    /**
     * Render sidecar data
     */
    renderSidecar(sidecar) {
        const content = this.panelElement.querySelector('#sidecar-panel-content');
        content.innerHTML = `
            ${this.renderSection('Status', 'fa-heart-pulse', this.renderStatus(sidecar.trackers.status))}
            ${this.renderSection('Appearance', 'fa-shirt', this.renderAppearance(sidecar.trackers.appearance))}
            ${this.renderSection('Inventory', 'fa-briefcase', this.renderInventory(sidecar.trackers.inventory))}
            ${this.renderSection('Relationships', 'fa-users', this.renderRelationships(sidecar.trackers.relationships))}
            ${this.renderSection('Knowledge', 'fa-brain', this.renderKnowledge(sidecar.trackers.knowledge))}
            ${this.renderSection('Timeline', 'fa-clock-rotate-left', this.renderTimeline(sidecar.timeline))}
            ${this.renderSection('Quests', 'fa-scroll', this.renderQuests(sidecar.plotThreads))}
            ${this.renderCustomTrackers(sidecar.trackers)}
        `;

        // Bind section toggles
        content.querySelectorAll('.sidecar-section-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggle.closest('.sidecar-section').classList.toggle('collapsed');
            });
        });
    }

    /**
     * Render a collapsible section
     */
    renderSection(title, icon, content, collapsed = false) {
        return `
            <div class="sidecar-section ${collapsed ? 'collapsed' : ''}">
                <div class="sidecar-section-toggle">
                    <h4><i class="fa-solid ${icon}"></i> ${title}</h4>
                    <i class="fa-solid fa-chevron-down toggle-icon"></i>
                </div>
                <div class="sidecar-section-body">
                    ${content}
                </div>
            </div>
        `;
    }

    /**
     * Render status section
     */
    renderStatus(status) {
        if (!status) return '<p class="sidecar-empty">No status tracked</p>';

        return `
            ${this.renderDataRow('Health', status.health)}
            ${this.renderDataRow('Energy', status.energy)}
            ${this.renderDataRow('Mood', status.mood)}
            ${status.conditions?.length > 0 ? `
                <div class="sidecar-data-row">
                    <span class="sidecar-data-label">Conditions</span>
                    <span class="sidecar-data-value">${status.conditions.join(', ')}</span>
                </div>
            ` : ''}
        `;
    }

    /**
     * Render appearance section
     */
    renderAppearance(appearance) {
        if (!appearance) return '<p class="sidecar-empty">No appearance tracked</p>';

        return `
            ${this.renderDataRow('Clothing', appearance.clothing)}
            ${this.renderDataRow('Physical', appearance.physical)}
        `;
    }

    /**
     * Render inventory section
     */
    renderInventory(inventory) {
        if (!inventory) return '<p class="sidecar-empty">No inventory tracked</p>';

        let html = '';
        
        if (inventory.equipped) {
            html += this.renderDataRow('Main Hand', inventory.equipped.mainHand || 'Empty');
            html += this.renderDataRow('Off Hand', inventory.equipped.offHand || 'Empty');
        }

        if (inventory.bag?.length > 0) {
            html += `
                <div class="sidecar-data-row" style="flex-direction: column; align-items: stretch;">
                    <span class="sidecar-data-label">Bag</span>
                    <ul class="sidecar-list">
                        ${inventory.bag.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        return html || '<p class="sidecar-empty">Empty inventory</p>';
    }

    /**
     * Render relationships section
     */
    renderRelationships(relationships) {
        if (!relationships || Object.keys(relationships).length === 0) {
            return '<p class="sidecar-empty">No relationships tracked</p>';
        }

        return Object.entries(relationships).map(([name, rel]) => `
            <div class="sidecar-relationship">
                <div class="sidecar-relationship-header">
                    <span class="sidecar-relationship-name">${name}</span>
                    ${rel.trustLevel !== undefined ? `
                        <span class="sidecar-relationship-trust">${rel.trustLevel}%</span>
                    ` : ''}
                </div>
                ${rel.sentiment ? `
                    <div class="sidecar-relationship-sentiment">${rel.sentiment}</div>
                ` : ''}
                ${rel.notes ? `
                    <div class="sidecar-relationship-notes">${rel.notes}</div>
                ` : ''}
            </div>
        `).join('');
    }

    /**
     * Render knowledge section
     */
    renderKnowledge(knowledge) {
        if (!knowledge || knowledge.length === 0) {
            return '<p class="sidecar-empty">No knowledge tracked</p>';
        }

        return `
            <ul class="sidecar-list">
                ${knowledge.map(k => `<li>${k}</li>`).join('')}
            </ul>
        `;
    }

    /**
     * Render timeline section
     */
    renderTimeline(timeline) {
        if (!timeline || timeline.length === 0) {
            return '<p class="sidecar-empty">No events recorded</p>';
        }

        const recent = timeline.slice(-10).reverse();
        return `
            <div class="sidecar-timeline">
                ${recent.map(event => {
                    // Handle different event formats:
                    // 1. String: "something happened"
                    // 2. Object with event property: { event: "...", turn: 5 }
                    // 3. Object with description property: { description: "...", turn: 5 }
                    // 4. Object with text property: { text: "...", turn: 5 }
                    let eventText;
                    let turnNumber;
                    
                    if (typeof event === 'string') {
                        eventText = event;
                        turnNumber = null;
                    } else if (typeof event === 'object' && event !== null) {
                        eventText = event.event || event.description || event.text || event.summary || JSON.stringify(event);
                        turnNumber = event.turn || event.turnNumber || event.messageIndex;
                    } else {
                        eventText = String(event);
                        turnNumber = null;
                    }
                    
                    return `
                        <div class="sidecar-timeline-item">
                            ${turnNumber ? `<div class="turn">Turn ${turnNumber}</div>` : ''}
                            <div class="event">${eventText}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * Render quests section
     */
    renderQuests(plotThreads) {
        if (!plotThreads) return '<p class="sidecar-empty">No quests tracked</p>';

        let html = '';

        // Ensure active is an array before using array methods
        const activeQuests = Array.isArray(plotThreads.active) ? plotThreads.active : [];
        const resolvedQuests = Array.isArray(plotThreads.resolved) ? plotThreads.resolved : [];

        if (activeQuests.length > 0) {
            html += '<h5 style="margin: 0 0 8px 0; color: var(--SmartThemeEmColor);">Active</h5>';
            html += `<ul class="sidecar-list">
                ${activeQuests.map(q => `
                    <li><strong>${q.name || q}</strong>: ${q.status || 'In Progress'}</li>
                `).join('')}
            </ul>`;
        }

        if (resolvedQuests.length > 0) {
            html += '<h5 style="margin: 10px 0 8px 0; color: var(--SmartThemeQuoteColor);">Resolved</h5>';
            html += `<ul class="sidecar-list" style="opacity: 0.7;">
                ${resolvedQuests.map(q => `
                    <li>${q.name || q}</li>
                `).join('')}
            </ul>`;
        }

        return html || '<p class="sidecar-empty">No quests tracked</p>';
    }

    /**
     * Render custom trackers
     */
    renderCustomTrackers(trackers) {
        const standardKeys = ['status', 'appearance', 'inventory', 'relationships', 'knowledge'];
        const customKeys = Object.keys(trackers).filter(k => !standardKeys.includes(k));

        if (customKeys.length === 0) return '';

        return customKeys.map(key => {
            const value = trackers[key];
            const title = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            
            let content;
            if (Array.isArray(value)) {
                content = value.length > 0 
                    ? `<ul class="sidecar-list">${value.map(v => `<li>${typeof v === 'object' ? JSON.stringify(v) : v}</li>`).join('')}</ul>`
                    : '<p class="sidecar-empty">Empty</p>';
            } else if (typeof value === 'object') {
                content = Object.entries(value).map(([k, v]) => 
                    this.renderDataRow(k, typeof v === 'object' ? JSON.stringify(v) : v)
                ).join('');
            } else {
                content = `<p>${value}</p>`;
            }

            return this.renderSection(title, 'fa-tag', content, true);
        }).join('');
    }

    /**
     * Render a data row
     */
    renderDataRow(label, value) {
        if (!value) return '';
        return `
            <div class="sidecar-data-row">
                <span class="sidecar-data-label">${label}</span>
                <span class="sidecar-data-value">${value}</span>
            </div>
        `;
    }
}

export default { UIPopup, CharacterPanel };
