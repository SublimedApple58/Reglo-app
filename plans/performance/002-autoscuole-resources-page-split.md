# Performance Optimization — AutoscuoleResourcesPage Code-Splitting

## What was done

### Phase 3: Split monolithic page into lazy-loaded tabs
- Extracted 4 tab components from the 3674-line monolithic `AutoscuoleResourcesPage.tsx`:
  - `tabs/SettingsTab.tsx` (703 lines) — booking, reminders, lesson policy settings
  - `tabs/InstructorsTab.tsx` (736 lines) — instructor cards, cluster panel dialog
  - `tabs/StudentsTab.tsx` (637 lines) — cutoff, weekly limit, exam priority, swap, etc.
  - `tabs/VehiclesTab.tsx` (201 lines) — vehicle module toggle, vehicle cards
- Each tab is loaded via `next/dynamic()` — only the active tab's JS is fetched.
- Main component reduced from 3674 to 2271 lines (state + handlers + dialogs).
- Removed unused sub-components: `AccordionSection`, `VehiclesTabContent`, `PolicySwitch`, `ChannelGroup` (moved into tab files).
- Kept `AvailabilityCalendar` and availability dialogs in main component (shared across tabs).

## Files changed
- `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` (3674 -> 2271 lines)
- `components/pages/Autoscuole/tabs/SettingsTab.tsx` (new)
- `components/pages/Autoscuole/tabs/InstructorsTab.tsx` (new)
- `components/pages/Autoscuole/tabs/StudentsTab.tsx` (new)
- `components/pages/Autoscuole/tabs/VehiclesTab.tsx` (new)
