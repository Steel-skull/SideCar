/**
 * Delta Engine - Operation Application Logic
 * Handles applying delta operations to sidecar data
 */

/**
 * Supported operation types
 */
export const OPERATION_TYPES = {
    SET: 'set',
    ADD: 'add',
    REMOVE: 'remove',
    APPEND: 'append',
    INCREMENT: 'increment',
    DELETE: 'delete'
};

/**
 * DeltaEngine class
 * Processes and applies delta operations to sidecar data
 */
export class DeltaEngine {
    constructor() {
        // Operation history for potential undo functionality
        this.history = [];
        this.maxHistory = 50;
    }

    /**
     * Parse a dot-notation path into array of keys
     */
    parsePath(path) {
        if (Array.isArray(path)) {
            return path;
        }
        
        if (typeof path !== 'string') {
            throw new Error(`Invalid path type: ${typeof path}`);
        }

        // Handle bracket notation for array indices
        // e.g., "inventory.bag[0]" -> ["inventory", "bag", "0"]
        return path
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.')
            .filter(key => key.length > 0);
    }

    /**
     * Get a nested value from an object using a path
     */
    getNestedValue(obj, path) {
        const keys = this.parsePath(path);
        let current = obj;

        for (const key of keys) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[key];
        }

        return current;
    }

    /**
     * Set a nested value in an object using a path
     * Creates intermediate objects/arrays as needed
     */
    setNestedValue(obj, path, value) {
        const keys = this.parsePath(path);
        
        if (keys.length === 0) {
            throw new Error('Empty path');
        }

        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            const nextKey = keys[i + 1];
            
            if (current[key] === undefined || current[key] === null) {
                // Create intermediate structure
                // If next key is numeric, create array, otherwise object
                current[key] = /^\d+$/.test(nextKey) ? [] : {};
            }
            
            current = current[key];
        }

        const finalKey = keys[keys.length - 1];
        current[finalKey] = value;
    }

    /**
     * Delete a nested value from an object using a path
     */
    deleteNestedValue(obj, path) {
        const keys = this.parsePath(path);
        
        if (keys.length === 0) {
            return false;
        }

        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (current[key] === undefined || current[key] === null) {
                return false; // Path doesn't exist
            }
            current = current[key];
        }

        const finalKey = keys[keys.length - 1];
        
        if (Array.isArray(current)) {
            const index = parseInt(finalKey, 10);
            if (!isNaN(index) && index >= 0 && index < current.length) {
                current.splice(index, 1);
                return true;
            }
        } else if (typeof current === 'object') {
            if (Object.hasOwn(current, finalKey)) {
                delete current[finalKey];
                return true;
            }
        }

        return false;
    }

    /**
     * Validate an operation
     */
    validate(operation) {
        const errors = [];

        if (!operation) {
            errors.push('Operation is null or undefined');
            return { valid: false, errors };
        }

        if (!operation.op) {
            errors.push('Missing operation type (op)');
        } else if (!Object.values(OPERATION_TYPES).includes(operation.op)) {
            errors.push(`Unknown operation type: ${operation.op}`);
        }

        if (!operation.path) {
            errors.push('Missing path');
        }

        if (operation.op !== OPERATION_TYPES.DELETE && operation.value === undefined) {
            // Value is technically optional for some ops, but usually expected
            // Only DELETE doesn't need a value
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Apply a single operation to data
     */
    apply(data, operation) {
        const validation = this.validate(operation);
        if (!validation.valid) {
            throw new Error(`Invalid operation: ${validation.errors.join(', ')}`);
        }

        const { op, path, value } = operation;
        const oldValue = this.getNestedValue(data, path);

        // Record for history
        const historyEntry = {
            timestamp: Date.now(),
            operation,
            oldValue: structuredClone(oldValue)
        };

        switch (op) {
            case OPERATION_TYPES.SET:
                this.applySet(data, path, value);
                break;

            case OPERATION_TYPES.ADD:
                this.applyAdd(data, path, value);
                break;

            case OPERATION_TYPES.REMOVE:
                this.applyRemove(data, path, value);
                break;

            case OPERATION_TYPES.APPEND:
                this.applyAppend(data, path, value);
                break;

            case OPERATION_TYPES.INCREMENT:
                this.applyIncrement(data, path, value);
                break;

            case OPERATION_TYPES.DELETE:
                this.applyDelete(data, path);
                break;

            default:
                throw new Error(`Unhandled operation type: ${op}`);
        }

        // Add to history
        this.history.push(historyEntry);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        return true;
    }

    /**
     * SET operation - Replace value at path
     */
    applySet(data, path, value) {
        this.setNestedValue(data, path, value);
    }

    /**
     * ADD operation - Add item to array at path
     */
    applyAdd(data, path, value) {
        const current = this.getNestedValue(data, path);
        
        if (current === undefined || current === null) {
            // Create array with the value
            this.setNestedValue(data, path, [value]);
        } else if (Array.isArray(current)) {
            // Check for duplicates if value is a primitive
            if (typeof value === 'string' || typeof value === 'number') {
                if (!current.includes(value)) {
                    current.push(value);
                }
            } else {
                current.push(value);
            }
        } else {
            // Convert to array
            this.setNestedValue(data, path, [current, value]);
        }
    }

    /**
     * REMOVE operation - Remove item from array at path
     */
    applyRemove(data, path, value) {
        const current = this.getNestedValue(data, path);
        
        if (!Array.isArray(current)) {
            console.warn(`[DeltaEngine] Remove: path is not an array: ${path}`);
            return;
        }

        if (typeof value === 'string' || typeof value === 'number') {
            // Simple value - find and remove
            const index = current.indexOf(value);
            if (index !== -1) {
                current.splice(index, 1);
            }
        } else if (typeof value === 'object') {
            // Object - try to match by properties
            const index = current.findIndex(item => {
                if (typeof item !== 'object') return false;
                // Match if all properties in value match item
                for (const [key, val] of Object.entries(value)) {
                    if (item[key] !== val) return false;
                }
                return true;
            });
            if (index !== -1) {
                current.splice(index, 1);
            }
        }
    }

    /**
     * APPEND operation - Append to array (always adds, no duplicate check)
     */
    applyAppend(data, path, value) {
        const current = this.getNestedValue(data, path);
        
        if (current === undefined || current === null) {
            this.setNestedValue(data, path, [value]);
        } else if (Array.isArray(current)) {
            current.push(value);
        } else {
            this.setNestedValue(data, path, [current, value]);
        }
    }

    /**
     * INCREMENT operation - Add numeric value to existing value
     */
    applyIncrement(data, path, value) {
        const current = this.getNestedValue(data, path);
        
        // Handle string values from LLM (e.g., ".5", "0.5", "5", "-10")
        let increment;
        if (typeof value === 'number') {
            increment = value;
        } else if (typeof value === 'string') {
            // Normalize string - handle ".5" -> "0.5" case
            let normalized = value.trim();
            if (normalized.startsWith('.')) {
                normalized = '0' + normalized;
            } else if (normalized.startsWith('-.')) {
                normalized = '-0' + normalized.substring(1);
            }
            increment = parseFloat(normalized);
        } else {
            increment = parseFloat(value);
        }
        
        if (isNaN(increment)) {
            console.warn(`[DeltaEngine] Invalid increment value: ${value}, treating as 0`);
            increment = 0;
        }

        const currentNum = typeof current === 'number' ? current : 0;
        this.setNestedValue(data, path, currentNum + increment);
    }

    /**
     * DELETE operation - Remove key/index entirely
     */
    applyDelete(data, path) {
        this.deleteNestedValue(data, path);
    }

    /**
     * Apply multiple operations in sequence
     */
    applyBatch(data, operations) {
        const results = [];
        
        for (const op of operations) {
            try {
                this.apply(data, op);
                results.push({ success: true, operation: op });
            } catch (error) {
                results.push({ success: false, operation: op, error: error.message });
            }
        }

        return results;
    }

    /**
     * Get the old value before an operation would be applied
     */
    preview(data, operation) {
        const current = this.getNestedValue(data, operation.path);
        
        // Simulate what the new value would be
        let newValue;
        
        switch (operation.op) {
            case OPERATION_TYPES.SET:
                newValue = operation.value;
                break;

            case OPERATION_TYPES.ADD:
                if (Array.isArray(current)) {
                    newValue = [...current, operation.value];
                } else if (current === undefined) {
                    newValue = [operation.value];
                } else {
                    newValue = [current, operation.value];
                }
                break;

            case OPERATION_TYPES.REMOVE:
                if (Array.isArray(current)) {
                    newValue = current.filter(item => {
                        if (typeof operation.value === 'object') {
                            for (const [key, val] of Object.entries(operation.value)) {
                                if (item[key] !== val) return true;
                            }
                            return false;
                        }
                        return item !== operation.value;
                    });
                } else {
                    newValue = current;
                }
                break;

            case OPERATION_TYPES.APPEND:
                if (Array.isArray(current)) {
                    newValue = [...current, operation.value];
                } else if (current === undefined) {
                    newValue = [operation.value];
                } else {
                    newValue = [current, operation.value];
                }
                break;

            case OPERATION_TYPES.INCREMENT:
                const currentNum = typeof current === 'number' ? current : 0;
                const inc = typeof operation.value === 'number' ? operation.value : parseInt(operation.value, 10);
                newValue = currentNum + inc;
                break;

            case OPERATION_TYPES.DELETE:
                newValue = undefined;
                break;

            default:
                newValue = operation.value;
        }

        return {
            path: operation.path,
            op: operation.op,
            oldValue: current,
            newValue: newValue
        };
    }

    /**
     * Preview multiple operations
     */
    previewBatch(data, operations) {
        // Clone data for preview simulation
        const simulated = structuredClone(data);
        const previews = [];

        for (const op of operations) {
            previews.push(this.preview(simulated, op));
            
            // Apply to simulated data for accurate sequential preview
            try {
                this.apply(simulated, op);
            } catch (e) {
                // Ignore errors in preview
            }
        }

        return previews;
    }

    /**
     * Format a value for display
     */
    formatValue(value) {
        if (value === undefined) {
            return '(empty)';
        }
        if (value === null) {
            return 'null';
        }
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return '(empty list)';
            }
            return value.map(v => this.formatValue(v)).join(', ');
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }

    /**
     * Get operation history
     */
    getHistory() {
        return [...this.history];
    }

    /**
     * Clear operation history
     */
    clearHistory() {
        this.history = [];
    }
}

export default DeltaEngine;
