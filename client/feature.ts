// Client side of a feature: features/<id>/client.tsx default-exports a ClientFeature.
// Each optional component is rendered in a fixed "slot" of the core UI. Auto-registered via import.meta.glob.
import type { FunctionComponent } from 'preact';
import type { PublicPlayer, PublicState, ServerMsg } from '../shared/protocol';

export interface SlotProps { s: PublicState }

export interface ClientFeature {
  id: string;
  /** Extra badges / buttons on every player card (e.g. H3in charges, alliance button). */
  PlayerCard?: FunctionComponent<SlotProps & { p: PublicPlayer }>;
  /** Overlay drawn above the stage (e.g. effect animations). */
  Stage?: FunctionComponent<SlotProps>;
  /** Renders a custom phase you enqueued server-side, by phase name (e.g. "bets.prep", "minigame"). */
  Phases?: Record<string, FunctionComponent<SlotProps>>;
  /** Strip under the answer field (e.g. bet controls). */
  Hud?: FunctionComponent<SlotProps>;
  /** Block in the lobby, under the settings. */
  Lobby?: FunctionComponent<SlotProps>;
  /** Transient server events with f === id (or all, if you want). */
  onFx?(m: Extract<ServerMsg, { t: 'fx' }>): void;
  /** Keyboard shortcut handler, only called when no text field is focused or the answer field is empty. Return true if handled. */
  onKey?(e: KeyboardEvent, s: PublicState): boolean;
}

const mods = import.meta.glob<{ default: ClientFeature }>('../features/*/client.tsx', { eager: true });
export const CLIENT_FEATURES: ClientFeature[] = Object.values(mods).map(m => m.default);

/** Is this feature running in the room? (server only sends views for active features) */
export const isOn = (s: PublicState, id: string) => id in s.f;
