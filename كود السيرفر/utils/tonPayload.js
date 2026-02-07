const { beginCell } = require("@ton/core");

/**
 * Creates TON Cell payload with reference code
 * This creates a valid BOC (Bag of Cells) that TonConnect accepts
 * 
 * @param {string} referenceCode - Unique order reference (e.g., ORD-1234567890-ABC123)
 * @returns {string} Base64 encoded BOC payload
 * 
 * @example
 * const payload = createReferencePayload("ORD-1769082602263-07SEPY");
 * // Returns: "te6cckEBAQEAJAAAQ..." (base64 BOC)
 */
function createReferencePayload(referenceCode) {
  // Create a cell with:
  // - op code = 0 (standard text comment)
  // - reference text as string tail
  const cell = beginCell()
    .storeUint(0, 32)                          // op code = 0 (text comment)
    .storeStringTail(`Ref#${referenceCode}`)   // reference code as comment
    .endCell();

  // Convert to BOC (Bag of Cells) and encode as base64
  // This is the format TonConnect expects
  return cell.toBoc().toString("base64");
}

module.exports = { createReferencePayload };
