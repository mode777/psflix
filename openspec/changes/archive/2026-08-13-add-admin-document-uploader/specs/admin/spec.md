## MODIFIED Requirements

### Requirement: Multi-view admin navigation

The admin surface SHALL provide persistent navigation that lets the operator switch between administrative areas while remaining within the admin surface and its shared chrome. The navigation SHALL include the dashboard, the game upload area, and the documents upload area, and SHALL keep the current area indicated as the operator moves between them.

#### Scenario: Navigating between admin areas

- **WHEN** the operator activates a different area in the admin navigation
- **THEN** the selected area is displayed within the admin surface without leaving it

#### Scenario: The current area is indicated

- **WHEN** an admin area is displayed
- **THEN** the navigation indicates that area as the current one
