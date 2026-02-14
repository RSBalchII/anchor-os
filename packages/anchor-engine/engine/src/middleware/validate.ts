/**
 * Request Validation Middleware
 * 
 * Lightweight JSON schema validation for API endpoints.
 * No external dependencies — uses a simple declarative schema format.
 * 
 * Usage:
 *   import { validate, schemas } from './middleware/validate.js';
 *   app.post('/v1/ingest', validate(schemas.ingest), handler);
 */

/**
 * @typedef {Object} FieldSchema
 * @property {'string'|'number'|'boolean'|'array'|'object'} type
 * @property {boolean} [required]
 * @property {number} [minLength] - For strings
 * @property {number} [maxLength] - For strings
 * @property {number} [min] - For numbers
 * @property {number} [max] - For numbers
 * @property {string} [itemType] - For arrays: type of each item
 */

/**
 * Validate a value against a field schema
 * @param {string} field 
 * @param {*} value 
 * @param {FieldSchema} schema 
 * @returns {string|null} Error message or null
 */
function validateField(field, value, schema) {
  if (value === undefined || value === null) {
    if (schema.required) return `'${field}' is required`;
    return null; // optional and missing — ok
  }

  // Type check
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return `'${field}' must be an array`;
    if (schema.itemType) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== schema.itemType) {
          return `'${field}[${i}]' must be of type '${schema.itemType}'`;
        }
      }
    }
  } else if (typeof value !== schema.type) {
    return `'${field}' must be of type '${schema.type}', got '${typeof value}'`;
  }

  // String constraints
  if (schema.type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return `'${field}' must be at least ${schema.minLength} characters`;
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      return `'${field}' must be at most ${schema.maxLength} characters`;
    }
  }

  // Number constraints
  if (schema.type === 'number') {
    if (schema.min !== undefined && value < schema.min) {
      return `'${field}' must be >= ${schema.min}`;
    }
    if (schema.max !== undefined && value > schema.max) {
      return `'${field}' must be <= ${schema.max}`;
    }
  }

  return null;
}

/**
 * Create validation middleware from a body schema
 * @param {Record<string, FieldSchema>} schema - Field name → schema mapping
 * @returns {import('express').RequestHandler}
 */
export function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, fieldSchema] of Object.entries(schema)) {
      const error = validateField(field, req.body[field], fieldSchema);
      if (error) errors.push(error);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    next();
  };
}

/**
 * Pre-defined schemas for common API endpoints
 */
export const schemas = {
  /** POST /v1/ingest */
  ingest: {
    content: { type: 'string', required: true, minLength: 1 },
    source: { type: 'string', required: false },
    type: { type: 'string', required: false },
    bucket: { type: 'string', required: false },
    buckets: { type: 'array', required: false, itemType: 'string' },
    tags: { type: 'array', required: false, itemType: 'string' }
  },

  /** POST /v1/memory/search */
  memorySearch: {
    query: { type: 'string', required: true, minLength: 1 },
    buckets: { type: 'array', required: false, itemType: 'string' },
    tags: { type: 'array', required: false, itemType: 'string' },
    max_chars: { type: 'number', required: false, min: 1 },
    code_weight: { type: 'number', required: false, min: 0, max: 1 }
  },

  /** POST /v1/chat/completions */
  chatCompletions: {
    messages: { type: 'array', required: true },
    model: { type: 'string', required: false },
    temperature: { type: 'number', required: false, min: 0, max: 2 },
    max_tokens: { type: 'number', required: false, min: 1, max: 128000 }
  },

  /** POST /v1/model/load */
  modelLoad: {
    model: { type: 'string', required: true, minLength: 1 }
  },

  /** POST /v1/research/scrape */
  researchScrape: {
    url: { type: 'string', required: true, minLength: 1 }
  },

  /** POST /v1/engine/switch */
  engineSwitch: {
    engine: { type: 'string', required: true, minLength: 1 }
  }
};
