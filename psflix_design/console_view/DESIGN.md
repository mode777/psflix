---
name: PSFLIX Retro-Modern Cinema
colors:
  surface: '#111317'
  surface-dim: '#111317'
  surface-bright: '#37393e'
  surface-container-lowest: '#0c0e12'
  surface-container-low: '#1a1c20'
  surface-container: '#1e2024'
  surface-container-high: '#282a2e'
  surface-container-highest: '#333539'
  on-surface: '#e2e2e8'
  on-surface-variant: '#c5c6d1'
  inverse-surface: '#e2e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#8f909a'
  outline-variant: '#44464f'
  surface-tint: '#b2c5ff'
  primary: '#d5deff'
  on-primary: '#162e61'
  primary-container: '#adc2ff'
  on-primary-container: '#394f84'
  inverse-primary: '#485d93'
  secondary: '#ffb3ae'
  on-secondary: '#68000c'
  secondary-container: '#ea0029'
  on-secondary-container: '#fffbff'
  tertiary: '#37f6ff'
  on-tertiary: '#003739'
  tertiary-container: '#00d8e1'
  on-tertiary-container: '#005a5e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001847'
  on-primary-fixed-variant: '#2f4579'
  secondary-fixed: '#ffdad7'
  secondary-fixed-dim: '#ffb3ae'
  on-secondary-fixed: '#410005'
  on-secondary-fixed-variant: '#930015'
  tertiary-fixed: '#63f7ff'
  tertiary-fixed-dim: '#00dce5'
  on-tertiary-fixed: '#002021'
  on-tertiary-fixed-variant: '#004f53'
  background: '#111317'
  on-background: '#e2e2e8'
  surface-variant: '#333539'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 56px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-lg:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding-desktop: 80px
  container-padding-mobile: 24px
  gutter: 24px
  section-gap: 64px
---

## Brand & Style

This design system establishes a high-fidelity, cinematic experience for retro gaming. It bridges the gap between the nostalgic PlayStation 1 era and modern streaming interfaces like Netflix or Plex. The brand personality is **Immersive, Premium, and Tech-Forward.**

The visual style is a fusion of **Modern Minimalism** and **Glassmorphism**, characterized by:

- **Atmospheric Depth:** Large, blurred hero backdrops that pull color from game box art.
- **Cinematic Lighting:** Use of soft glows and "inner-light" effects on active elements.
- **Refined Technicality:** Sharp typography paired with rounded containers to balance modern software utility with a high-end consumer hardware feel.
- **Subtle Retro Cues:** High-contrast color accents (Electric Blue, PlayStation Red) that serve as functional beacons against a moody, deep-space background.

## Colors

The palette is designed for low-light environments, prioritizing eye comfort and visual hierarchy through luminous accents.

- **Primary (Electric Blue):** Used for primary actions (Play, Select). It represents "power on" and active states.
- **Secondary (Heritage Red):** Reserved for branding and critical alerts, nodding to the original PS logo.
- **Tertiary (Action Cyan):** Used for secondary interactive states, links, and categorical tags.
- **Surface & Backgrounds:**
  - `Base`: #0F1115 (Deep Charcoal) - The foundational canvas.
  - `Surface-Raised`: #1A1D23 (Mid-Grey) - For secondary cards and information modules.
  - `Glass-Overlay`: RGBA(255, 255, 255, 0.05) - For frosted glass navigation and panels.
- **Typography:**
  - `High-Emphasis`: #FFFFFF (Pure White) - For titles and primary labels.
  - `Medium-Emphasis`: #A0A5B1 (Cool Grey) - For body text and metadata.
  - `Low-Emphasis`: #636975 (Steel) - For disabled states and footer text.

## Typography

This design system uses **Hanken Grotesk** across all roles to maintain a cohesive, modern-industrial aesthetic. It provides the necessary sharpness for high-fidelity displays while remaining legible in dense information layouts.

- **Scale:** High contrast between titles and body text to mimic theatrical posters.
- **Hierarchy:** Use `label-lg` for categories (e.g., "ACTION", "RPG") with increased letter spacing to evoke a technical, "OS-like" feel.
- **Utility:** Body text should maintain a 1.6 line height to ensure readability of long-form game lore and descriptions against dark backgrounds.

## Layout & Spacing

The system uses a **Fluid Grid** model with generous safe-zones to maintain a "cinematic" feel.

- **Grid Model:** 12-column layout for desktop with 24px gutters.
- **Vertical Rhythm:** Built on an 8px base unit. Component heights and spacing should always be multiples of 8.
- **Safe Areas:** Horizontal padding is aggressive (80px on desktop) to keep content centered and focused, similar to a TV-safe area.
- **Mobile Reflow:** On mobile, the 12-column grid collapses to 4 columns. Hero images transition from horizontal orientations to vertical "poster" aspect ratios (2:3).

## Elevation & Depth

Depth is created through **Luminance and Blur** rather than traditional drop shadows.

- **Level 0 (Base):** Solid #0F1115.
- **Level 1 (Sub-surface):** Slightly lighter fills or subtle 1px borders (#FFFFFF10) for content sections like "Game Information."
- **Level 2 (Glassmorphism):** Floating navigation bars or modal overlays use a 20px backdrop blur with a 5% white tint.
- **Glows:** Primary buttons and active states use a "Bloom" effect (a soft, color-matched outer glow) to simulate a light-emissive screen or LED.
- **Borders:** Use 1px solid borders with 10-15% opacity to define edges without adding visual weight.

## Shapes

The shape language is **Refined and Intentional**, utilizing "Rounded" corners to soften the technical aesthetic and make the UI feel approachable like modern consumer hardware.

- **Cards & Primary Containers:** Use `rounded-lg` (16px) for game cards and info panels.
- **Interactive Elements:** Buttons and tags use `rounded-md` (8px) for a crisp, tactile feel.
- **Form Inputs:** Use `rounded-md` to match button language.
- **Imagery:** Box art should retain slightly softer corners (4-6px) to mimic the physical plastic cases of the PS1 era.

## Components

- **Buttons:**
  - _Primary:_ Solid Electric Blue background, dark text, soft bloom glow on hover.
  - _Ghost:_ 1px white/transparent border, white text, 5% white fill on hover.
- **Chips/Tags:** Small, pill-shaped containers with #FFFFFF10 backgrounds and `label-md` typography. Used for game features (e.g., "3D Graphics").
- **Game Cards:** 2:3 aspect ratio posters with a subtle 1px inner stroke. On focus, the card scales up 5% and gains a primary-colored outer glow.
- **Information Grid:** Key-value pairs for metadata (Developer, Publisher). Keys are `Medium-Emphasis` color, Values are `High-Emphasis`.
- **Navigation:** Top-fixed glass bar with blurred background. Active icons should use the Primary Blue color.
- **Section Dividers:** 1px horizontal lines using #FFFFFF10, often accompanied by a large gap (64px) to separate different content types.
