## Purpose

Provide a superuser-gated operator surface for PSflix, delivered independently from the end-user application, that exposes a dashboard of catalog and user counts and the accumulated storage consumed by managed files. Establishes the access and isolation contract for all future administrative features.

## Requirements

### Requirement: Admin is a distinct operator surface

The system SHALL provide an admin surface reachable at a dedicated entry URL that is separate from the end-user application. The admin surface SHALL NOT mount the end-user application's persistent global header or navigation.

#### Scenario: Reachable at a dedicated entry URL

- **WHEN** an operator navigates to the admin entry URL
- **THEN** the admin surface loads as a surface distinct from the end-user application

#### Scenario: End-user application chrome is absent

- **WHEN** the admin surface is displayed
- **THEN** the persistent application header used by the end-user application is not mounted

### Requirement: Admin access requires superuser authentication

The system SHALL require a valid superuser credential before exposing any administrative data. Unauthenticated access SHALL present only a superuser sign-in control and SHALL NOT fetch or display any administrative content.

#### Scenario: Unauthenticated access shows sign-in only

- **WHEN** an operator opens the admin surface without a valid superuser session
- **THEN** the system displays a superuser sign-in control and no administrative data is fetched or displayed

#### Scenario: Invalid credentials are rejected

- **WHEN** an operator submits sign-in credentials that are not valid superuser credentials
- **THEN** the system does not establish a session, indicates the failure, and administrative data remains inaccessible

#### Scenario: Valid credentials grant access

- **WHEN** an operator submits valid superuser credentials
- **THEN** the system establishes a superuser session and reveals the admin dashboard

### Requirement: Admin authentication is isolated from end-user authentication

The system SHALL maintain the admin superuser session independently from the end-user application session. Establishing, refreshing, or clearing either session SHALL NOT affect the authenticated state of the other.

#### Scenario: Admin sign-in does not disturb the end-user session

- **WHEN** an operator signs in to the admin surface
- **THEN** any end-user application session remains unchanged in its authenticated state

#### Scenario: End-user sign-in does not disturb the admin session

- **WHEN** an end user signs in to the end-user application
- **THEN** any admin superuser session remains unchanged in its authenticated state

#### Scenario: Admin sign-out does not disturb the end-user session

- **WHEN** an operator ends the admin superuser session
- **THEN** any end-user application session remains authenticated

### Requirement: Admin session persistence

The system SHALL persist a valid admin superuser session across browser reloads for the lifetime of the session token. On reload, an operator with a valid stored session SHALL regain access without re-entering credentials.

#### Scenario: Reload preserves a valid session

- **WHEN** an operator reloads the admin surface while holding a valid stored superuser session
- **THEN** the system restores dashboard access without prompting for credentials

#### Scenario: Expired session requires re-authentication

- **WHEN** the stored superuser session is no longer valid at load time
- **THEN** the system clears the session and presents the sign-in control

### Requirement: Admin session termination

The system SHALL provide a control to end the admin superuser session. On termination, the system SHALL clear the session and present the sign-in control.

#### Scenario: Sign-out clears access

- **WHEN** an operator activates the sign-out control
- **THEN** the superuser session is cleared and the sign-in control is presented

### Requirement: Catalog and user count metrics

The system SHALL display record counts for games, discs, and registered users. Each count SHALL reflect the total number of records across the entire dataset, including records that are not visible to a regular end-user session due to access scoping.

#### Scenario: Counts reflect the full dataset

- **WHEN** the dashboard loads with an authenticated superuser session
- **THEN** the displayed game count, disc count, and user count each reflect the total number of records across the entire dataset

#### Scenario: Individual count failure is surfaced without failing the whole dashboard

- **WHEN** an individual count cannot be retrieved
- **THEN** the system indicates a failure for that specific metric while continuing to display the metrics that were retrieved successfully

### Requirement: Accumulated storage metric

The system SHALL display the accumulated storage consumed by managed files, broken down into four categories: game disc images, documents, user save states, and user memory cards. Each category total SHALL equal the sum of the byte sizes of the individual files within that category, and the system SHALL display a grand total across all categories.

#### Scenario: Storage totals are computed from individual file sizes

- **WHEN** the dashboard loads with an authenticated superuser session
- **THEN** each storage category total equals the sum of the byte sizes of the files in that category, and a grand total across categories is displayed

#### Scenario: Partial storage-probe failure does not break the dashboard

- **WHEN** one or more individual file-size probes fail
- **THEN** the system continues to compute and display the categories whose probes succeeded and indicates that the displayed totals may be incomplete

#### Scenario: A category with no files reports zero

- **WHEN** a storage category contains no files
- **THEN** the system displays a total of zero for that category

### Requirement: Obsidian Console visual consistency

The system SHALL render the admin surface using the same visual design language as the end-user application — shared color palette, typography, spacing scale, and corner-radius tokens — including the characteristic dark obsidian background and rounded card surfaces, so the operator experience is visually consistent with the product.

#### Scenario: Admin reuses the product design tokens

- **WHEN** the admin surface is rendered
- **THEN** its colors, typography, spacing, and corner radii are drawn from the same design tokens used by the end-user application
