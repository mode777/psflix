---
name: Obsidian Console
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#37393a'
  surface-container-lowest: '#0c0f0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#282a2b'
  surface-container-highest: '#333535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c1c6d8'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#8c90a1'
  outline-variant: '#414655'
  surface-tint: '#afc6ff'
  primary: '#afc6ff'
  on-primary: '#002d6d'
  primary-container: '#548dff'
  on-primary-container: '#002760'
  inverse-primary: '#0058c9'
  secondary: '#ddfcff'
  on-secondary: '#00363a'
  secondary-container: '#00f1fe'
  on-secondary-container: '#006a70'
  tertiary: '#ffb598'
  on-tertiary: '#591d00'
  tertiary-container: '#f1651e'
  on-tertiary-container: '#4e1800'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d9e2ff'
  primary-fixed-dim: '#afc6ff'
  on-primary-fixed: '#001944'
  on-primary-fixed-variant: '#00429a'
  secondary-fixed: '#74f5ff'
  secondary-fixed-dim: '#00dbe7'
  on-secondary-fixed: '#002022'
  on-secondary-fixed-variant: '#004f54'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb598'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7e2c00'
  background: '#121414'
  on-background: '#e2e2e2'
  surface-variant: '#333535'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 72px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.1em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 64px
---

## Brand & Style

The design system is engineered for a premium, cinematic experience, drawing inspiration from high-end gaming consoles and modern digital showrooms. The target audience includes enthusiasts and professionals who value immersive, distraction-free environments.

The design style is a hybrid of **Glassmorphism** and **Minimalism**, prioritizing content-first navigation. By utilizing deep obsidian backgrounds and high-contrast typography, the UI recedes to allow high-fidelity imagery and video to become the focal point. The emotional response is one of sophistication, focus, and "power-on" excitement—reminiscent of a flagship gaming console dashboard.

Key stylistic markers include:

- **Atmospheric Depth:** Use of blurred background elements to suggest a vast digital space.
- **Cinematic Framing:** Full-bleed imagery with subtle vignettes.
- **Precision Interaction:** Every element feels deliberate, utilizing micro-interactions that mimic physical hardware responses.

## Colors

The palette is anchored in a true "Dark Mode" philosophy, utilizing **Obsidian** as the foundation.

- **Primary:** A vibrant PlayStation-inspired Blue (#0072FF) used for active states and critical path highlights.
- **Secondary:** A sharp Teal (#00F2FF) used for secondary accents, progress bars, and data visualization.
- **Surface Tiers:** Surfaces should never be pure black; use **Surface Charcoal** for containers to maintain depth perception against the **Obsidian** background.
- **Gradients:** Use linear gradients (45 degrees) moving from Primary to Secondary for high-impact components like CTA buttons or "Pro" tier features.

## Typography

This design system utilizes **Inter** exclusively to ensure a systematic, technical, and highly legible appearance across all resolutions.

- **Display & Headlines:** Use heavy weights (700+) with tight letter-spacing to create a sense of impact and authority.
- **Body Text:** Standard body text should maintain a generous line height (1.6) to prevent eye fatigue during long sessions.
- **Caps Labels:** Small metadata or category tags should use the `label-caps` style to differentiate from interactive labels.
- **Mobile Scaling:** For displays smaller than 768px, drop all Display-level sizes to `headline-xl-mobile` to maintain layout integrity.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** with generous padding to evoke a cinematic feel.

- **Grid:** 12-column layout for desktop with 24px gutters.
- **Safe Zones:** High-end console UIs require "breathing room." Content should rarely touch the edge of the viewport; maintain a minimum 64px margin on desktop to frame the content.
- **Scaling:** On mobile, switch to a 4-column layout with 20px margins.
- **Rhythm:** Use an 8px base unit for all padding and margin increments (8, 16, 24, 32, 48, 64, 128). Use the larger increments (64px+) to separate major content sections.

## Elevation & Depth

Hierarchy is established through **Glassmorphism** and **Tonal Layering** rather than traditional drop shadows.

- **Base Layer:** The Obsidian background (#0A0A0C).
- **Surface Layer:** Semi-transparent Charcoal (#16161A at 80% opacity) with a 20px Backdrop Blur.
- **Active Layer:** Elements that are focused or hovered should gain a subtle "Inner Glow" (1px border at 20% white opacity) and a primary-colored ambient outer glow (blur: 40px, opacity: 15%).
- **Shadows:** Use only for extreme separation. When used, shadows should be "Ambient"—highly diffused, large radius (60px), and tinted with the background color (not pure black).

## Shapes

The shape language is refined and balanced.

- **Standard Radius:** 0.5rem (8px) for buttons and inputs.
- **Large Radius:** 1rem (16px) for cards and primary containers.
- **Extra Large:** 1.5rem (24px) for featured hero banners or modal overlays.
- **Consistency:** Avoid sharp corners. Every interactive element should feel "smooth" to the touch, reinforcing the premium hardware aesthetic.

## Components

### Buttons

- **Primary:** Full gradient (Blue to Teal), white text, 8px radius.
- **Secondary/Ghost:** 1px white border at 20% opacity, glassmorphism background blur.
- **State Change:** On hover/focus, scale the button by 1.05x and increase the intensity of the ambient glow.

### Cards (Media Items)

- **Style:** Large, high-quality images with a subtle 10% black vignette at the bottom.
- **Overlay:** Typography should sit directly on the image using white text with a soft shadow for legibility.
- **Focus:** When selected, the card should "lift" (scale 1.1x) and gain a 2px primary color border.

### Input Fields

- **Background:** Deep charcoal, 40% opacity.
- **Interaction:** On focus, the border transitions from 10% white to 100% primary blue.

### Navigation / Sidebar

- **Background:** Vertical glassmorphic pane with 40px backdrop blur.
- **Icons:** Use thin-stroke (1.5px) glyphs. Active icons use the primary blue color.

### Progress Bars

- **Track:** 4px height, dark charcoal.
- **Fill:** Gradient (Blue to Teal) with a white "glow" tip at the leading edge.

### Chips/Tags

- Small, pill-shaped, with a 10% white fill and 12px `label-caps` text. No borders.
