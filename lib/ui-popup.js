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
     */
    showUpdatePopup(result, currentSidecar, onApprove) {
        this.currentCallback = onApprove;
        this.selectedOperations = new Set(result.operations.map((_, i) => i));

        // Preview what each operation will do
        const previews = this.deltaEngine.previewBatch(currentSidecar, result.operations);

        // Build popup HTML
        const html = this.buildPopupHTML(result, previews);
        
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
     */
    buildPopupHTML(result, previews) {
        const operationsHTML = this.buildOperationsHTML(result.operations, previews);
        const npcsHTML = this.buildNPCsHTML(result.newNPCs);
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
}

/**
 * CharacterPanel class
 * Manages the side panel character sheet
 */
export class CharacterPanel {
    constructor(sidecarManager, triggerAnalysis, triggerArchitect) {
        this.sidecarManager = sidecarManager;
        this.triggerAnalysis = triggerAnalysis;
        this.triggerArchitect = triggerArchitect;
        this.isOpen = false;
        this.panelElement = null;
        this.toggleButton = null;
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

        this.renderSidecar(sidecar);
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
                ${recent.map(event => `
                    <div class="sidecar-timeline-item">
                        ${event.turn ? `<div class="turn">Turn ${event.turn}</div>` : ''}
                        <div class="event">${event.event}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Render quests section
     */
    renderQuests(plotThreads) {
        if (!plotThreads) return '<p class="sidecar-empty">No quests tracked</p>';

        let html = '';

        if (plotThreads.active?.length > 0) {
            html += '<h5 style="margin: 0 0 8px 0; color: var(--SmartThemeEmColor);">Active</h5>';
            html += `<ul class="sidecar-list">
                ${plotThreads.active.map(q => `
                    <li><strong>${q.name}</strong>: ${q.status || 'In Progress'}</li>
                `).join('')}
            </ul>`;
        }

        if (plotThreads.resolved?.length > 0) {
            html += '<h5 style="margin: 10px 0 8px 0; color: var(--SmartThemeQuoteColor);">Resolved</h5>';
            html += `<ul class="sidecar-list" style="opacity: 0.7;">
                ${plotThreads.resolved.map(q => `
                    <li>${q.name}</li>
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
