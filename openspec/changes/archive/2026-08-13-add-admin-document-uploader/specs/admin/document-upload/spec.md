## Purpose

An operator workflow within the admin surface that ingests PDF manuals and strategy guides, lets the operator assign each file to an existing game and a document type, and uploads them to the catalog with progress under the operator's existing superuser session.

## ADDED Requirements

### Requirement: PDF document intake

The system SHALL allow the operator to add PDF files to the upload workflow by dragging them onto a drop area or by selecting them through a file picker. The system SHALL accept multiple files in a single addition. Files whose name does not end in `.pdf` SHALL be rejected at intake rather than being staged or uploaded.

#### Scenario: Multiple PDFs added at once

- **WHEN** the operator selects or drops more than one `.pdf` file in a single action
- **THEN** every selected `.pdf` file enters the workflow as a distinct staged item

#### Scenario: Non-PDF files are rejected at intake

- **WHEN** the selection includes files whose name does not end in `.pdf`
- **THEN** those files are excluded from the workflow without being staged and no upload is attempted for them

### Requirement: File-first per-file assignment

Each staged file SHALL be presented as a distinct item that the operator assigns individually to a target game and a document type before that file can be uploaded. A file SHALL NOT be uploadable until both a target game and a document type have been assigned to it. The operator SHALL be able to remove a staged file before upload.

#### Scenario: An unassigned file cannot be uploaded

- **WHEN** a staged file has no target game or no document type assigned
- **THEN** that file is excluded from the upload and the system indicates that its assignment is incomplete

#### Scenario: A staged file can be removed before upload

- **WHEN** the operator removes a staged file
- **THEN** that file is excluded from the subsequent upload

### Requirement: Searchable game selection

For assigning a target game to a staged file, the system SHALL provide a control in which the operator types a query and the system presents matching games filtered by title or first disc serial. The system SHALL NOT require the operator to choose from the entire catalog without filtering, so that the workflow scales to a large catalog.

#### Scenario: Typing filters the candidate games

- **WHEN** the operator types a query into the game selection control
- **THEN** the system presents only the games whose title or first disc serial matches the query

#### Scenario: A game is selected for a file

- **WHEN** the operator chooses a game from the filtered candidates for a staged file
- **THEN** that file is associated with the chosen game as its upload target

### Requirement: Document type selection

For each staged file, the system SHALL let the operator select the document type as either a manual or a guide. The selected type SHALL be the value used when the document record is created.

#### Scenario: A type is chosen for a file

- **WHEN** the operator selects manual or guide for a staged file
- **THEN** that file's document type is set to the chosen value

### Requirement: Operator approval before upload

The system SHALL NOT begin uploading any file until the operator explicitly approves the upload of the staged, fully-assigned files. The operator SHALL be able to approve the upload of all files that are fully assigned at the time of approval.

#### Scenario: Upload does not start automatically

- **WHEN** files are staged and assigned
- **THEN** the system waits for an explicit operator approval action before uploading anything

### Requirement: Duplicate-aware upload with optional replacement

When a staged file's assigned game already has at least one document of the file's selected type, the system SHALL surface a non-blocking indication of that existing document. Uploading SHALL create a new document record for the file. The system SHALL offer the operator, per staged file that has such an existing document, an opt-in to replace the existing documents of that type for that game; the opt-in SHALL NOT be required for upload to proceed, and append SHALL remain the default behavior.

When the opt-in is selected for a file, the system SHALL create the new document record first and SHALL delete every document record of the same type for that game that existed before the upload began only after the new record is successfully created, so that after a successful upload exactly one document of that type remains for that game and a failed upload removes nothing. When the opt-in is not selected, no existing document record SHALL be modified or deleted.

#### Scenario: An existing document of the same type is surfaced but does not block

- **WHEN** a file is assigned to a game that already has a document of the file's selected type
- **THEN** the system indicates the existing document to the operator and offers an opt-in to replace it, and the upload remains permitted whether or not the opt-in is taken

#### Scenario: Append remains the default

- **WHEN** the operator uploads a file whose replace opt-in is not selected
- **THEN** a new document record is created for that file and no existing document record is modified or deleted

#### Scenario: Replacement deletes prior same-type documents only after the new record is created

- **WHEN** the operator approves the upload of a file whose replace opt-in is selected
- **THEN** the system creates the new document record and, only after that succeeds, deletes every pre-existing document record of the same type for that game, leaving exactly one document of that type for that game

#### Scenario: A failed upload does not remove the existing document

- **WHEN** the upload of a file whose replace opt-in is selected fails
- **THEN** no pre-existing document record of that type for that game is deleted

### Requirement: Upload with progress

During upload, the system SHALL display per-file progress for the file currently uploading and overall progress across all approved files. The system SHALL surface the completion of each file and any per-file failure, and SHALL continue uploading the remaining files when one file fails.

#### Scenario: Per-file and overall progress are shown

- **WHEN** a file is uploading
- **THEN** the system displays progress for that file and an overall measure of progress across all approved files

#### Scenario: A failed file does not abort the batch

- **WHEN** an individual file upload fails
- **THEN** the system indicates the failure for that file and continues uploading the remaining approved files

### Requirement: Admin-session authentication

The document upload workflow SHALL authenticate all catalog reads and writes using the operator's existing admin superuser session and SHALL NOT require the operator to enter separate credentials for the workflow.

#### Scenario: No separate credentials are requested

- **WHEN** the operator uses the document upload workflow while signed in to the admin surface
- **THEN** all game searches and uploads proceed under the existing admin superuser session without prompting for credentials
