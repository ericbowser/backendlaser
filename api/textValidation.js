/**
 * Text Validation Utilities for LaserTags
 * 
 * Server-side validation for tag engraving text to ensure quality output
 */

// Maximum character limits per line based on tag size and readability
const TEXT_LIMITS = {
  PET_NAME: 20,      // Pet name on front
  ENGRAVE_LINE: 25,  // Each line of engraving on back
  TOTAL_LINES: 3,    // Maximum lines per side
  MIN_FONT_SIZE: 8,  // Minimum readable font size after engraving
};

// Characters that engrave well on silicone
const SAFE_CHARACTERS = /^[A-Za-z0-9\s\-\.\(\)\&\#\@\!\?]*$/;

// Problematic characters that don't engrave well
const PROBLEMATIC_CHARS = ['<', '>', '|', '\\', '/', '^', '~', '`', '{', '}', '[', ']'];

// Words/content that should be flagged for review
const REVIEW_KEYWORDS = [
  'emergency', 'medication', 'allergy', 'medical', 'diabetes', 'seizure',
  'blind', 'deaf', 'service', 'therapy', 'reward', 'stolen'
];

/**
 * Validates text for laser engraving on silicone tags
 * @param {string} text - The text to validate
 * @param {string} type - Type of text: 'petname', 'line1', 'line2', 'line3'
 * @param {object} options - Additional validation options
 * @returns {object} Validation result with isValid, errors, warnings
 */
function validateEngraveText(text, type = 'line', options = {}) {
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: [],
    processed: text
  };
  
  // Basic checks
  if (!text || typeof text !== 'string') {
    result.isValid = false;
    result.errors.push('Text is required');
    return result;
  }
  
  const trimmed = text.trim();
  
  // Length validation based on type
  let maxLength = TEXT_LIMITS.ENGRAVE_LINE;
  if (type === 'petname') {
    maxLength = TEXT_LIMITS.PET_NAME;
  }
  
  if (trimmed.length === 0) {
    result.isValid = false;
    result.errors.push('Text cannot be empty');
    return result;
  }
  
  if (trimmed.length > maxLength) {
    result.isValid = false;
    result.errors.push(`Text too long. Maximum ${maxLength} characters, got ${trimmed.length}`);
  }
  
  // Character safety check
  if (!SAFE_CHARACTERS.test(trimmed)) {
    const badChars = [...new Set(trimmed.split('').filter(char => !SAFE_CHARACTERS.test(char)))];
    result.warnings.push(`Some characters may not engrave clearly: ${badChars.join(', ')}`);
  }
  
  // Check for problematic characters
  const foundProblematic = PROBLEMATIC_CHARS.filter(char => trimmed.includes(char));
  if (foundProblematic.length > 0) {
    result.isValid = false;
    result.errors.push(`These characters cannot be engraved: ${foundProblematic.join(', ')}`);
  }
  
  // Check for special content that needs review
  const lowerText = trimmed.toLowerCase();
  const foundKeywords = REVIEW_KEYWORDS.filter(keyword => lowerText.includes(keyword));
  if (foundKeywords.length > 0) {
    result.warnings.push(`Medical/special needs detected: ${foundKeywords.join(', ')} - ensure accuracy`);
  }
  
  // Font readability estimation
  const estimatedWidth = estimateTextWidth(trimmed, type);
  if (estimatedWidth > 0.8) { // 80% of tag width
    result.warnings.push('Text may be small when engraved. Consider shortening for better readability.');
    result.suggestions.push('Try abbreviations: "Street" → "St", "Phone" → "Ph"');
  }
  
  // Phone number formatting
  if (type !== 'petname' && /\d{10,}/.test(trimmed.replace(/\D/g, ''))) {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 10) {
      const formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
      if (formatted !== trimmed) {
        result.suggestions.push(`Format phone as: ${formatted}`);
      }
    }
  }
  
  // Capitalization suggestions
  if (type === 'petname') {
    const properCase = trimmed.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    if (properCase !== trimmed) {
      result.suggestions.push(`Consider proper case: ${properCase}`);
    }
  }
  
  result.processed = trimmed;
  return result;
}

/**
 * Estimates text width for readability on different tag shapes
 * @param {string} text - The text to measure
 * @param {string} type - Type of text
 * @returns {number} Estimated width ratio (0-1)
 */
function estimateTextWidth(text, type) {
  // Rough character width estimates for laser engraving
  const charWidths = {
    'W': 1.2, 'M': 1.2, 'Q': 1.1,
    'B': 0.9, 'D': 0.9, 'O': 0.9, 'P': 0.9, 'R': 0.9,
    'I': 0.4, 'J': 0.5, 'L': 0.7, 'T': 0.8,
    ' ': 0.5, '-': 0.6, '.': 0.3,
    default: 0.8
  };
  
  const totalWidth = text.split('').reduce((width, char) => {
    const upperChar = char.toUpperCase();
    return width + (charWidths[upperChar] || charWidths.default);
  }, 0);
  
  // Base font size scaling
  const baseFontSize = type === 'petname' ? 1.2 : 1.0;
  
  return (totalWidth * baseFontSize) / 30; // Normalized to tag width
}

/**
 * Validates complete tag order text
 * @param {object} tagData - Complete tag information
 * @returns {object} Comprehensive validation result
 */
function validateCompleteTag(tagData) {
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: [],
    lineValidations: {}
  };
  
  // Validate pet name
  if (tagData.petname) {
    result.lineValidations.petname = validateEngraveText(tagData.petname, 'petname');
    if (!result.lineValidations.petname.isValid) {
      result.isValid = false;
      result.errors.push(...result.lineValidations.petname.errors.map(e => `Pet name: ${e}`));
    }
    result.warnings.push(...result.lineValidations.petname.warnings);
    result.suggestions.push(...result.lineValidations.petname.suggestions);
  }
  
  // Validate engraving lines
  ['line1', 'line2', 'line3'].forEach((lineKey, index) => {
    if (tagData[lineKey]) {
      const lineNum = index + 1;
      result.lineValidations[lineKey] = validateEngraveText(tagData[lineKey], lineKey);
      
      if (!result.lineValidations[lineKey].isValid) {
        result.isValid = false;
        result.errors.push(...result.lineValidations[lineKey].errors.map(e => `Line ${lineNum}: ${e}`));
      }
      result.warnings.push(...result.lineValidations[lineKey].warnings.map(w => `Line ${lineNum}: ${w}`));
      result.suggestions.push(...result.lineValidations[lineKey].suggestions.map(s => `Line ${lineNum}: ${s}`));
    }
  });
  
  // Check for duplicate information
  const allText = [tagData.petname, tagData.line1, tagData.line2, tagData.line3]
    .filter(Boolean)
    .map(t => t.toLowerCase());
  
  const duplicates = allText.filter((text, index) => allText.indexOf(text) !== index);
  if (duplicates.length > 0) {
    result.warnings.push('Duplicate text detected - consider using space for more information');
  }
  
  return result;
}

/**
 * Sanitizes text for safe database storage and engraving
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
  if (!text) return '';
  
  return text
    .trim()
    .replace(/[<>|\\\/\^~`{}[\]]/g, '') // Remove problematic chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .substring(0, 50); // Hard limit for safety
}

/**
 * Express.js middleware for validating tag text
 */
function textValidationMiddleware(req, res, next) {
  const tagData = {
    petname: req.body.petname || req.body.tag_text_line_1,
    line1: req.body.line1 || req.body.tag_text_line_1,
    line2: req.body.line2 || req.body.tag_text_line_2,
    line3: req.body.line3 || req.body.tag_text_line_3
  };
  
  const validation = validateCompleteTag(tagData);
  
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Text validation failed',
      details: validation.errors,
      warnings: validation.warnings,
      suggestions: validation.suggestions
    });
  }
  
  // Add warnings to response headers for frontend display
  if (validation.warnings.length > 0) {
    res.set('X-Engraving-Warnings', JSON.stringify(validation.warnings));
  }
  
  if (validation.suggestions.length > 0) {
    res.set('X-Engraving-Suggestions', JSON.stringify(validation.suggestions));
  }
  
  // Sanitize the text
  req.body.petname = sanitizeText(req.body.petname);
  req.body.line1 = sanitizeText(req.body.line1);
  req.body.line2 = sanitizeText(req.body.line2);
  req.body.line3 = sanitizeText(req.body.line3);
  
  next();
}

module.exports = {
  validateEngraveText,
  validateCompleteTag,
  sanitizeText,
  textValidationMiddleware,
  TEXT_LIMITS,
  SAFE_CHARACTERS,
  PROBLEMATIC_CHARS,
  REVIEW_KEYWORDS
};