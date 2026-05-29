/**
 * Capacity calculation utilities for container management.
 * @module services/containers/capacity
 */

/**
 * Calculates the fullness percentage of a container.
 * @param {number} currentItemCount - Current number of items in the container
 * @param {number|null|undefined} estimatedCapacity - Estimated capacity of the container
 * @returns {number|null} Fullness percentage rounded to nearest integer, or null if capacity is zero/not set
 */
function calculateFullnessPercentage(currentItemCount, estimatedCapacity) {
  // Return null when estimatedCapacity is zero, null, or undefined
  if (!estimatedCapacity || estimatedCapacity === 0) {
    return null;
  }

  // Calculate fullness percentage, allowing values exceeding 100%
  return Math.round((currentItemCount / estimatedCapacity) * 100);
}

module.exports = { calculateFullnessPercentage };
