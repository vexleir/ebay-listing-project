'use strict';

/**
 * Maximum length for the eBay Item Location field.
 */
const MAX_LOCATION_LENGTH = 45;

/**
 * Generates an eBay-compatible location string from hierarchy fields.
 * Format: "Building - Room - Shelf X - Row Y - Container"
 * Omits empty levels. Truncates to 45 characters.
 *
 * @param {{ building?: string, room?: string, shelf?: string, shelfRow?: string, containerName: string }} fields
 * @returns {string} location string, max 45 chars
 */
function generateLocationString(fields) {
  const { building, room, shelf, shelfRow, containerName } = fields;

  const parts = [];

  if (building && building.trim()) {
    parts.push(building.trim());
  }

  if (room && room.trim()) {
    parts.push(room.trim());
  }

  if (shelf && shelf.trim()) {
    parts.push(`Shelf ${shelf.trim()}`);
  }

  if (shelfRow && shelfRow.trim()) {
    parts.push(`Row ${shelfRow.trim()}`);
  }

  if (containerName && containerName.trim()) {
    parts.push(containerName.trim());
  }

  const result = parts.join(' - ');

  // Truncate to 45 characters per eBay Item Location field length limit
  if (result.length > MAX_LOCATION_LENGTH) {
    return result.slice(0, MAX_LOCATION_LENGTH);
  }

  return result;
}

module.exports = { generateLocationString, MAX_LOCATION_LENGTH };
