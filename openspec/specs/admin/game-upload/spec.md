## Purpose

An operator workflow within the admin surface that ingests PlayStation 1 CHD disc images: it identifies each disc in the browser, enriches it with metadata and artwork, presents a review list of games and discs to create, and uploads the discs to the catalog with progress while reusing records that already exist.

## Requirements

### Requirement: Disc image intake

The system SHALL allow the operator to add CHD disc images to the upload workflow by dragging files onto a drop area or by selecting them through a file picker. The system SHALL accept multiple files in a single addition and SHALL also accept a folder selection, ingesting every `.chd` file found within the selected folder tree. Files that are not `.chd` SHALL be ignored rather than producing an error.

#### Scenario: Multiple files added at once

- **WHEN** the operator selects or drops more than one `.chd` file in a single action
- **THEN** every selected `.chd` file enters the workflow as a distinct item

#### Scenario: Folder selection ingests nested CHDs

- **WHEN** the operator selects a folder
- **THEN** the system ingests every `.chd` file contained anywhere within that folder tree

#### Scenario: Non-CHD files are ignored

- **WHEN** the selection includes files that do not have a `.chd` extension
- **THEN** those files are excluded from the workflow without raising an error

### Requirement: In-browser disc identification

For each ingested CHD, the system SHALL extract the PlayStation 1 disc identifier in the browser and SHALL keep the user interface responsive while extraction runs. Identification SHALL occur off the main thread so that large disc images do not freeze the surface. An ingested CHD from which no disc identifier can be extracted SHALL be surfaced as an individual failed item and SHALL NOT abort identification of the remaining items.

#### Scenario: The interface stays responsive during identification

- **WHEN** a large CHD is being identified
- **THEN** the user interface remains interactive and is not blocked by the identification work

#### Scenario: A CHD with no recognizable disc identifier

- **WHEN** an ingested CHD yields no PlayStation 1 disc identifier
- **THEN** that item is shown as failed with an indication of the reason, and identification of any other ingested items continues

### Requirement: Metadata and artwork enrichment

For each extracted disc identifier, the system SHALL fetch the corresponding game metadata — including title, region, genre, publisher, developer, release date, languages, description, and disc list — and the associated cover image and screenshot artwork. An identifier for which no metadata is available SHALL be surfaced as an individual failed item and SHALL NOT abort enrichment of the remaining items.

#### Scenario: Metadata and artwork are attached to an item

- **WHEN** enrichment succeeds for a disc identifier
- **THEN** the item's metadata fields and its cover and screenshot artwork are available for display in the review list

#### Scenario: An identifier with no metadata

- **WHEN** the metadata source has no entry for a disc identifier
- **THEN** that item is shown as failed with an indication that metadata was unavailable, and enrichment of any other items continues

### Requirement: Review list grouped by game

Once a set of CHDs has been identified and enriched, the system SHALL present a review list grouping items by game, using the first disc's serial as the game identity so that multiple discs of the same title appear together under one game. Each game in the list SHALL show its cover artwork, and each disc SHALL show its serial and file size. The review list SHALL also display items that failed identification or enrichment, distinguishable from the games and discs that are ready to create.

#### Scenario: Discs of the same title are grouped

- **WHEN** two or more ingested CHDs belong to the same game
- **THEN** they appear together under a single game entry in the review list

#### Scenario: Failed items are visible and distinguishable

- **WHEN** one or more ingested CHDs failed identification or enrichment
- **THEN** the review list shows those failures as distinct items, visually separate from the games and discs ready to create

### Requirement: Operator approval before upload

The system SHALL NOT begin uploading until the operator explicitly approves. The operator SHALL be able to remove items from the review list before approving, and SHALL be able to approve the upload of the remaining ready items.

#### Scenario: Upload does not start automatically

- **WHEN** items finish identification and enrichment
- **THEN** the system waits for an explicit operator approval action before uploading anything

#### Scenario: Items can be removed before upload

- **WHEN** the operator removes an item from the review list
- **THEN** that item is excluded from the subsequent upload

### Requirement: Existing-record detection and reuse

Before creating a record, the system SHALL check whether a game with the same first disc serial, and whether a disc with the same serial, already exist in the catalog. An existing game SHALL be reused for its discs rather than re-created, and an existing disc SHALL be marked as already present and SHALL NOT be uploaded again.

#### Scenario: An existing game is reused

- **WHEN** a disc belongs to a game that already exists in the catalog
- **THEN** the system reuses the existing game record instead of creating a new one

#### Scenario: An existing disc is not re-uploaded

- **WHEN** a disc with the same serial already exists in the catalog
- **THEN** the system marks that disc as already present and does not upload it again

### Requirement: Multi-disc index assignment from metadata

For each disc, the system SHALL assign the disc's position index from its position in the fetched metadata's disc list, so that discs of a multi-disc game receive distinct, correct indices regardless of the order in which they were ingested.

#### Scenario: A second disc ingested before the first

- **WHEN** the operator ingests the second disc of a multi-disc game before the first
- **THEN** the second disc is still assigned the index that corresponds to its position in the title's disc list

### Requirement: Upload with progress

During upload, the system SHALL display per-file progress for the disc currently uploading and overall progress across all approved discs. The system SHALL surface the completion of each disc and any per-disc failure, and SHALL continue uploading the remaining discs when one disc fails.

#### Scenario: Per-file and overall progress are shown

- **WHEN** a disc is uploading
- **THEN** the system displays progress for that disc and an overall measure of progress across all approved discs

#### Scenario: A failed disc does not abort the batch

- **WHEN** an individual disc upload fails
- **THEN** the system indicates the failure for that disc and continues uploading the remaining approved discs

### Requirement: Admin-session authentication

The upload workflow SHALL authenticate all catalog reads and writes using the operator's existing admin superuser session and SHALL NOT require the operator to enter separate credentials for the workflow.

#### Scenario: No separate credentials are requested

- **WHEN** the operator uses the upload workflow while signed in to the admin surface
- **THEN** all identification, enrichment, existence checks, and uploads proceed under the existing admin superuser session without prompting for credentials
