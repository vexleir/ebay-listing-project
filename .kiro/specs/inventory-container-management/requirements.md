# Requirements Document

## Introduction

This document defines the requirements for a container-based inventory location tracking system for the eBay listing program. The system organizes inventory by physical storage location using normalized containers derived from existing SKU data. It provides hierarchical location tracking, container lifecycle management, audit trails, and a review workflow for uncertain container matches. The architecture supports future expansion into barcode scanning, QR codes, capacity management, and advanced warehouse operations without requiring major database redesign.

## Glossary

- **Container**: A named physical storage unit (tote, bin, shelf, box) that holds one or more inventory items and is identified by a permanent internal ID.
- **Container_Type**: A classification label describing the physical form of a container (e.g., Tote, Shelf Bin, Long Box).
- **Normalization_Engine**: The component responsible for transforming raw SKU strings into canonical container names by removing punctuation, normalizing spacing, and standardizing naming patterns.
- **Confidence_Score**: A numeric value (0–100) indicating how certain the system is that two SKU strings refer to the same physical container.
- **Review_Queue**: A workflow queue holding container match suggestions that require user approval before merging.
- **Location_Hierarchy**: The optional multi-level physical address of a container: Building → Room → Shelf → Shelf Row → Container.
- **Audit_Trail**: A chronological log of all container-related actions including creation, renames, merges, splits, moves, archival, and restoration.
- **Container_Status**: A lifecycle state assigned to a container (Active, In Use, Full, Overflow, Archived, Missing, Needs Verification).
- **Listing_Agent**: The component responsible for creating and maintaining eBay listing fields including the custom location field.
- **Bulk_Operation**: An action applied to multiple containers or inventory items in a single request.
- **Container_Alias**: An alternate name or original SKU value that maps to a canonical container record.
- **Capacity_Type**: The unit of measurement for container capacity (Item Count, Card Count, Box Count, Cubic Space, Weight, User Defined).

## Requirements

### Requirement 1: Container Generation from Existing SKUs

**User Story:** As a seller, I want the system to automatically generate containers from my existing SKU data, so that my inventory is organized by physical location without manual data entry.

#### Acceptance Criteria

1. WHEN the user initiates container generation from existing inventory data, THE Normalization_Engine SHALL generate a container record for each unique normalized container name derived from SKU values.
2. WHEN multiple SKU values normalize to the same canonical name, THE Normalization_Engine SHALL consolidate them into a single container record.
3. THE Normalization_Engine SHALL preserve all original SKU values as Container_Alias records linked to the generated container.
4. WHEN a container is generated, THE System SHALL assign a permanent internal Container ID that does not change regardless of future name changes.
5. IF a SKU value is empty, null, or contains only whitespace after normalization, THEN THE Normalization_Engine SHALL skip that SKU value without generating a container record.
6. IF container generation is run against SKU data that has already been processed, THEN THE System SHALL not create duplicate container records for SKU values that already have a Container_Alias mapping, and SHALL only generate containers for newly encountered SKU values.

### Requirement 2: SKU Normalization

**User Story:** As a seller, I want inconsistent SKU naming to be automatically standardized, so that duplicate containers are not created for the same physical location.

#### Acceptance Criteria

1. WHEN normalizing a SKU value, THE Normalization_Engine SHALL remove all characters that are not letters (a-z, A-Z), digits (0-9), or spaces, and then collapse any consecutive spaces into a single space and trim leading and trailing spaces.
2. WHEN normalizing a SKU value, THE Normalization_Engine SHALL treat all characters as case-insensitive by converting the final output to title case.
3. WHEN normalizing a SKU value, THE Normalization_Engine SHALL insert a space at each boundary between a letter and a digit, between a digit and a letter, and before each uppercase letter that follows a lowercase letter (e.g., "SBin1" becomes "S Bin 1", "3Pack" becomes "3 Pack").
4. WHEN normalizing a SKU value, THE Normalization_Engine SHALL strip leading zeros from numeric tokens so that "Tote 01" and "Tote 1" produce the same canonical name.
5. WHEN normalizing a SKU value, THE Normalization_Engine SHALL produce a title-cased canonical name with single spaces between tokens and a maximum length of 128 characters.
6. THE Normalization_Engine SHALL produce identical output for inputs "SBin1", "s bin 1", "S-Bin-1", and "S Bin #1".
7. THE Normalization_Engine SHALL produce distinct outputs for inputs that differ in their alphabetic prefix or numeric suffix (e.g., "Tote 1", "Stock 1", and "Shelf 1" remain separate containers).
8. IF the SKU value is empty, contains only whitespace, or contains only punctuation characters after removal, THEN THE Normalization_Engine SHALL reject the input and return an error indicating that a valid SKU must contain at least one letter or digit.

### Requirement 3: Confidence Scoring

**User Story:** As a seller, I want the system to score how confident it is about container matches, so that only certain matches are merged automatically and uncertain ones are reviewed by me.

#### Acceptance Criteria

1. WHEN two SKU values are compared, THE Normalization_Engine SHALL produce a Confidence_Score as an integer between 0 and 100 inclusive.
2. IF the Confidence_Score is at or above 90, THEN THE System SHALL merge the SKU values into a single container automatically.
3. IF the Confidence_Score is between 50 and 89 inclusive, THEN THE System SHALL place the match suggestion into the Review_Queue for user approval.
4. IF the Confidence_Score is below 50, THEN THE System SHALL discard the match and not create a Review_Queue entry.
5. THE System SHALL assign a Confidence_Score of 90 or above when two SKU values differ only in punctuation, spacing, or capitalization.
6. THE System SHALL assign a Confidence_Score below 50 when two SKU values differ in their alphabetic prefix or numeric suffix.

### Requirement 4: Existing SKU Compatibility

**User Story:** As a seller, I want my existing listings and SKU values to continue working without modification, so that the container system does not disrupt my current operations.

#### Acceptance Criteria

1. THE System SHALL allow multiple inventory items to share the same SKU value.
2. THE System SHALL allow SKU values to be identical to container names.
3. WHEN container generation is performed, THE System SHALL preserve all existing SKU values byte-for-byte without modification, truncation, or re-encoding.
4. WHEN container generation is performed, THE System SHALL not add, remove, or alter any listing-visible fields (title, price, description, item specifics, images, or shipping details) on existing listings.
5. THE System SHALL store container assignments in a separate data structure from the SKU field so that adding, removing, or changing a container assignment does not alter the inventory item's SKU value.
6. IF the Normalization_Engine cannot parse or normalize a SKU value, THEN THE System SHALL skip container assignment for that item and leave the item's existing data unchanged.
7. THE System SHALL allow existing inventory lookup, listing creation, and listing editing workflows to operate without requiring a container assignment.

### Requirement 5: Container Record Structure

**User Story:** As a seller, I want each container to have a comprehensive record with location, capacity, and status information, so that I can manage my physical storage effectively.

#### Acceptance Criteria

1. THE System SHALL store the following required fields for each container: Container ID, Container Name (maximum 100 characters), Container Type, Active Status, Container Status, Created Date, and Modified Date.
2. THE System SHALL store the following optional fields for each container: Building (maximum 100 characters), Room (maximum 100 characters), Shelf (maximum 50 characters), Shelf Row (maximum 50 characters), Notes (maximum 1000 characters), Estimated Capacity (integer, 1 to 999,999), Capacity Type, Current Item Count (integer, 0 to 999,999), Fullness Percentage (0 to 100), and Maximum Recommended Item Count (integer, 1 to 999,999).
3. THE System SHALL enforce a unique constraint on Container Name so that no two containers share the same name.
4. WHEN a container display name is changed, THE System SHALL maintain all inventory relationships using the permanent Container ID.
5. WHEN any container field is changed, THE System SHALL update the Modified Date field to the current date and time.
6. WHEN a new container record is created, THE System SHALL set Created Date and Modified Date to the current date and time, Active Status to true, and Container Status to "Active".

### Requirement 6: Container Types

**User Story:** As a seller, I want to classify containers by type, so that I can organize, report on, and plan capacity by the physical form of my storage.

#### Acceptance Criteria

1. THE System SHALL provide the following default Container_Type values: Tote, Shelf Bin, Card Box, Long Box, Drawer, Binder, Display Case, Storage Shelf, Pallet, Cart, and Other.
2. THE System SHALL allow users to create custom Container_Type values with names between 1 and 50 characters in length, and SHALL reject duplicate Container_Type names using case-insensitive comparison.
3. WHEN a container is generated and the type cannot be determined from the SKU, THE System SHALL assign the "Other" Container_Type as the default.
4. THE System SHALL allow the Container_Type of any container to be edited at any time.
5. THE System SHALL not restrict inventory assignments based on Container_Type.
6. THE System SHALL not allow deletion of default Container_Type values.
7. IF a user attempts to delete a custom Container_Type that is currently assigned to one or more containers, THEN THE System SHALL prevent the deletion and display an error message indicating which containers are still using that type.

### Requirement 7: Hierarchical Location Structure

**User Story:** As a seller, I want to assign containers to a physical location hierarchy, so that I can quickly find items in my storage space.

#### Acceptance Criteria

1. THE System SHALL support a location hierarchy of Building, Room, Shelf, Shelf Row, and Container, where each location level field accepts a text value of 1 to 100 characters.
2. THE System SHALL require only the Container Name; all other location levels (Building, Room, Shelf, Shelf Row) SHALL be optional.
3. THE System SHALL allow any combination of location levels to be populated (e.g., Room and Container without Building, Shelf, or Shelf Row).
4. WHEN location data is updated for a container, THE System SHALL propagate the change to the eBay listing location field within 30 seconds of the update being saved.
5. IF propagation to the eBay listing location field fails, THEN THE System SHALL retain the updated location data locally, display an error message indicating the eBay sync failed, and allow the user to retry the propagation.
6. WHEN a location level value is cleared for a container, THE System SHALL remove that level from the generated eBay listing location string and propagate the updated location to eBay.

### Requirement 8: eBay Listing Location Field

**User Story:** As a seller, I want every eBay listing to display its physical storage location, so that I can quickly locate items when they sell.

#### Acceptance Criteria

1. THE Listing_Agent SHALL generate a location string by concatenating populated location levels in the order Building, Room, Shelf, Shelf Row, Container, separated by " - ", prefixing the Shelf value with "Shelf " and the Shelf Row value with "Row ".
2. WHEN a location level has no value, THE Listing_Agent SHALL omit that level and its associated prefix from the location string.
3. THE Listing_Agent SHALL not produce duplicate separators or leading/trailing separators when location levels are omitted.
4. THE Listing_Agent SHALL truncate the generated location string to a maximum of 45 characters to comply with the eBay Item Location field length limit.
5. WHEN container location data changes, THE Listing_Agent SHALL update the corresponding eBay listing location field within 60 seconds of the change being saved.
6. IF the eBay listing location update fails, THEN THE Listing_Agent SHALL retain the pending location change and retry the update, and SHALL indicate to the user that the eBay listing location is out of sync.
7. FOR the input Building="Home", Room="Garage", Shelf="C", Shelf Row="3", Container="Tote 5", THE Listing_Agent SHALL produce "Home - Garage - Shelf C - Row 3 - Tote 5".
8. FOR the input Room="Office", Container="Bin 2" (with no Building, Shelf, or Shelf Row), THE Listing_Agent SHALL produce "Office - Bin 2".

### Requirement 9: Container Management Operations

**User Story:** As a seller, I want to create, edit, rename, merge, split, archive, restore, and move inventory between containers, so that I can reorganize my storage as needed.

#### Acceptance Criteria

1. THE System SHALL allow users to create new container records.
2. THE System SHALL allow users to edit any field on an existing container record.
3. THE System SHALL allow users to rename a container without affecting inventory assignments.
4. WHEN two containers are merged, THE System SHALL transfer all inventory assignments, Container_Alias records, historical records, listing relationships, and audit history from the source container to the target container and set the source container's status to Archived.
5. WHEN a container is split, THE System SHALL create one or more new container records, allow the user to reassign inventory items between the original and new containers, and retain the original container with its remaining items.
6. THE System SHALL allow users to archive a container, setting its status to Archived, regardless of whether inventory items are currently assigned to it.
7. IF a container's status is Archived, THEN THE System SHALL allow users to restore that container to Active status.
8. WHEN an inventory item is moved from one container to another, THE System SHALL update the item's container assignment and trigger a listing location update for any linked eBay listing.

### Requirement 10: Review Queue

**User Story:** As a seller, I want to review uncertain container match suggestions before they are applied, so that my inventory is not incorrectly consolidated.

#### Acceptance Criteria

1. THE Review_Queue SHALL display the Original SKU, Suggested Container, Confidence_Score, and Reason for each pending match, ordered by Confidence_Score descending.
2. THE Review_Queue SHALL provide the following actions for each entry: Accept Merge, Reject Merge, Create New Container, and Ignore Recommendation.
3. WHEN a user selects Accept Merge, THE System SHALL merge the SKU into the suggested container and record the action in the Audit_Trail.
4. WHEN a user selects Create New Container, THE System SHALL create a new container record using the original SKU value, remove the entry from the queue, and record the action in the Audit_Trail.
5. WHEN a user selects Reject Merge, THE System SHALL leave the SKU unmerged, remove the entry from the queue, record the rejection in the Audit_Trail, and prevent the same SKU-container pair from reappearing in the Review_Queue on future processing runs.
6. WHEN a user selects Ignore Recommendation, THE System SHALL leave the SKU unmerged and remove the entry from the queue without recording in the Audit_Trail; the same match MAY reappear in the Review_Queue if future processing produces it again.
7. WHEN a user selects Accept Merge and the suggested container no longer exists, THEN THE System SHALL display an error message indicating the container is unavailable and retain the entry in the queue.

### Requirement 11: Audit Trail

**User Story:** As a seller, I want a complete history of all container changes, so that I can trace inventory movements and resolve discrepancies.

#### Acceptance Criteria

1. THE Audit_Trail SHALL record an entry for each of the following actions: container creation, container rename, container merge, container split, location change, item move, container archival, and container restoration.
2. THE Audit_Trail SHALL store the following fields for each entry: Timestamp (recorded to the second), User, Action Type, Entity Affected, Previous Value, and New Value. WHEN an action involves multiple entities (e.g., merge source and target), THE Audit_Trail SHALL record the identifiers of all entities involved in the entry.
3. THE Audit_Trail SHALL be append-only; existing entries SHALL not be modified or deleted.
4. WHEN a user views the audit history for a specific container, THE System SHALL display entries in reverse chronological order (most recent first).
5. WHEN a container has been the target of a merge operation, THE System SHALL include audit entries inherited from the merged source container in that container's audit history.

### Requirement 12: Bulk Operations

**User Story:** As a seller, I want to perform bulk actions on containers and inventory, so that I can reorganize large amounts of inventory efficiently.

#### Acceptance Criteria

1. THE System SHALL allow users to move all inventory items from one container to another in a single operation.
2. THE System SHALL allow users to move all containers within a specified location level (Building, Room, Shelf, or Shelf Row) to a new location value at that same level in a single operation.
3. THE System SHALL allow users to rename up to 500 containers in a single operation.
4. THE System SHALL allow users to assign shelf locations to up to 500 containers in a single operation.
5. THE System SHALL allow users to merge multiple container aliases into a single canonical container record in a single operation.
6. THE System SHALL complete bulk operations on collections of up to 5,000 items within 60 seconds.
7. WHEN a bulk operation is performed, THE System SHALL record an Audit_Trail entry for each individual action within the operation (one entry per item moved, container renamed, or alias merged).
8. IF one or more items in a bulk operation fail to process, THEN THE System SHALL complete the remaining items, report the count and identity of failed items to the user, and not roll back successfully processed items.
9. IF the target container for a bulk move operation has a Container_Status of Archived, THEN THE System SHALL reject the operation and display an error message indicating the target container is archived.

### Requirement 13: Container Status Tracking

**User Story:** As a seller, I want to assign a status to each container, so that I can quickly identify which containers are available, full, missing, or need verification.

#### Acceptance Criteria

1. THE System SHALL support the following Container_Status values: Active, In Use, Full, Overflow, Archived, Missing, and Needs Verification.
2. THE System SHALL allow users to change the Container_Status of any container to any other Container_Status value without transition restrictions.
3. WHEN a new container is created, THE System SHALL assign the "Active" Container_Status as the default value.
4. THE System SHALL support filtering containers by one or more Container_Status values simultaneously and SHALL support searching containers by Container_Status.
5. THE System SHALL not restrict inventory operations (adding, removing, or moving items) based on Container_Status; status SHALL be informational only.
6. WHEN a container's Container_Status is changed, THE System SHALL record the status change in the Audit_Trail including the previous status value and the new status value.

### Requirement 14: Container Capacity Tracking

**User Story:** As a seller, I want to track how full each container is, so that I can identify available storage space and avoid overfilling.

#### Acceptance Criteria

1. THE System SHALL store the following capacity fields for each container: Estimated Capacity (numeric, minimum value 0), Capacity Type, Current Item Count (integer, minimum value 0), Fullness Percentage (numeric, 0 to any positive value including values above 100), Maximum Recommended Item Count (integer, minimum value 0), and Capacity Notes (text, maximum 500 characters).
2. THE System SHALL support the following Capacity_Type values: Item Count, Card Count, Box Count, Cubic Space, Weight, and User Defined.
3. WHEN the Current Item Count and Estimated Capacity are both populated, THE System SHALL calculate the Fullness Percentage as (Current Item Count divided by Estimated Capacity) multiplied by 100, rounded to the nearest whole number, and store the result.
4. IF the Estimated Capacity is set to zero while Current Item Count is populated, THEN THE System SHALL not calculate the Fullness Percentage and SHALL leave the Fullness Percentage field empty.
5. THE System SHALL allow the Fullness Percentage to exceed 100 when Current Item Count is greater than Estimated Capacity.
6. THE System SHALL not enforce capacity limits in Phase 1; capacity data SHALL not prevent or block any inventory assignment or container operation.

### Requirement 15: Future Barcode and QR Code Support

**User Story:** As a seller, I want the data model to support barcode and QR code fields, so that scanning workflows can be added later without database redesign.

#### Acceptance Criteria

1. THE System SHALL include Barcode Value (string, maximum 128 characters), QR Code Value (string, maximum 2048 characters), and Printable Label (string, maximum 256 characters) fields in the container data model.
2. THE System SHALL allow these fields to remain empty (null) until barcode functionality is implemented; no validation of barcode or QR code format SHALL be enforced in Phase 1.
3. THE System SHALL store barcode and QR code values as optional string fields that do not affect container identification, inventory assignment logic, or any other system behavior in Phase 1.
4. THE Printable Label field SHALL store a human-readable label intended for physical label printing in future phases.

### Requirement 16: Data Model for Future Expansion

**User Story:** As a seller, I want the system architecture to support future features like unique SKU generation, item-level tracking, mobile lookup, and warehouse mapping, so that the system can grow without major redesign.

#### Acceptance Criteria

1. THE System SHALL store container-to-item relationships in a dedicated relationship collection separate from the container record itself, with each relationship record containing at minimum a Container ID reference, an Item ID reference, and an assignment timestamp.
2. THE System SHALL store container aliases in a dedicated alias collection that links original SKU values, alternate spellings, historical names, Confidence_Scores, and merge history (including source container, target container, merge timestamp, and initiating user) to a container via its permanent internal ID.
3. THE System SHALL store audit entries in a dedicated audit collection separate from container and item records.
4. THE System SHALL use system-generated permanent internal IDs for containers, items, aliases, and audit entries so that display names, SKUs, and labels can change without breaking references.
5. THE System SHALL support querying the alias collection by any alias value to resolve the associated container record.

### Requirement 17: Reporting Readiness

**User Story:** As a seller, I want the data model to support comprehensive reporting by location, container type, status, and capacity, so that reports can be built in future phases.

#### Acceptance Criteria

1. THE System SHALL store location data (Building, Room, Shelf, Shelf Row) as indexed fields that support filtering, sorting, and grouping operations to enable location-based reporting.
2. THE System SHALL store Container_Type as an indexed field that supports filtering, sorting, and grouping operations to enable type-based reporting.
3. THE System SHALL store Container_Status as an indexed field that supports filtering, sorting, and grouping operations to enable status-based reporting.
4. THE System SHALL store capacity fields (Fullness Percentage, Current Item Count) as indexed fields that support filtering, sorting, and range queries to enable capacity-based reporting.
5. THE System SHALL store timestamps (Created Date, Modified Date) with at least second-level precision as indexed fields that support filtering, sorting, and range queries to enable time-based reporting and aging analysis.
6. THE System SHALL support queries that combine multiple reporting dimensions (location, Container_Type, Container_Status, capacity, and timestamps) in a single query operation.
7. WHEN a reporting query is executed against any indexed reporting field, THE System SHALL return results within 2 seconds for collections containing up to 50,000 container records.
