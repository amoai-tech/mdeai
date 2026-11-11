"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type { MapPin, MapPinCategory } from "@/platform/contracts";
import type { MapViewport } from "@/lib/map-ui-summary";
import { mergePinsByCategory } from "./merge-pins-by-category";
import { MOCK_LAYOUT_PIN } from "./map-config";
import { nextPinSelection } from "./pin-selection";

type MapContextValue = {
  pins: MapPin[];
  /** Latest map camera (F50b) — debounced from MapCameraSync */
  viewport: MapViewport | null;
  setViewport: (viewport: MapViewport) => void;
  /** Latest tool category that pushed pins — drives map results panel focus */
  activeMapCategory: MapPinCategory | null;
  selectedPinId: string | null;
  setSelectedPinId: (id: string | null) => void;
  /** Set by focusMapPin frontend tool — ChatMap pans when this changes */
  focusPinId: string | null;
  panToPin: (pinId: string) => void;
  clearFocusPinRequest: () => void;
  mergePinsByCategory: (
    category: MapPinCategory,
    incoming: MapPin[],
  ) => void;
  clearPins: () => void;
  /** Increments after tool merge with ≥2 pins — MapFitBoundsController listens. */
  fitBoundsToken: number;
  requestFitBounds: () => void;
};

type PinSelectionState = {
  pins: MapPin[];
  selectedPinId: string | null;
  focusPinId: string | null;
};

type PinSelectionAction =
  | { type: "merge"; category: MapPinCategory; incoming: MapPin[] }
  | { type: "select"; id: string | null }
  | { type: "focus"; id: string }
  | { type: "clearFocus" }
  | { type: "clear"; seedMockPin: boolean };

/** Keep pins, selection and camera focus consistent in the same React update. */
function pinSelectionReducer(
  state: PinSelectionState,
  action: PinSelectionAction,
): PinSelectionState {
  switch (action.type) {
    case "merge": {
      const pins = mergePinsByCategory(state.pins, action.category, action.incoming);
      const hasPin = (id: string | null) => id !== null && pins.some((p) => p.id === id);
      return {
        pins,
        selectedPinId: hasPin(state.selectedPinId) ? state.selectedPinId : null,
        focusPinId: hasPin(state.focusPinId) ? state.focusPinId : null,
      };
    }
    case "select": {
      const id =
        action.id && state.pins.some((p) => p.id === action.id) ? action.id : null;
      return {
        ...state,
        selectedPinId: id,
        focusPinId: id === state.focusPinId ? state.focusPinId : null,
      };
    }
    case "focus":
      if (!state.pins.some((p) => p.id === action.id)) return state;
      return { ...state, selectedPinId: action.id, focusPinId: action.id };
    case "clearFocus":
      return { ...state, focusPinId: null };
    case "clear":
      return {
        pins: action.seedMockPin ? [MOCK_LAYOUT_PIN] : [],
        selectedPinId: null,
        focusPinId: null,
      };
  }
}

const MapContext = createContext<MapContextValue | null>(null);

export function MapContextProvider({
  children,
  seedMockPin = true,
}: {
  children: ReactNode;
  seedMockPin?: boolean;
}) {
  const [selection, dispatchSelection] = useReducer(pinSelectionReducer, {
    pins: seedMockPin ? [MOCK_LAYOUT_PIN] : [],
    selectedPinId: null,
    focusPinId: null,
  });
  const { pins, selectedPinId, focusPinId } = selection;
  const [activeMapCategory, setActiveMapCategory] =
    useState<MapPinCategory | null>(null);
  const setSelectedPinId = useCallback((id: string | null) => {
    dispatchSelection({ type: "select", id });
  }, []);
  const [viewport, setViewportState] = useState<MapViewport | null>(null);
  const [fitBoundsToken, setFitBoundsToken] = useState(0);

  const setViewport = useCallback((next: MapViewport) => {
    setViewportState((prev) => {
      if (
        prev &&
        prev.lat === next.lat &&
        prev.lng === next.lng &&
        prev.zoom === next.zoom
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const requestFitBounds = useCallback(() => {
    setFitBoundsToken((token) => token + 1);
  }, []);

  const panToPin = useCallback((pinId: string) => {
    dispatchSelection({ type: "focus", id: pinId });
  }, []);

  const clearFocusPinRequest = useCallback(() => {
    dispatchSelection({ type: "clearFocus" });
  }, []);

  const mergePins = useCallback(
    (category: MapPinCategory, incoming: MapPin[]) => {
      if (incoming.length > 0) {
        setActiveMapCategory(category);
      }
      dispatchSelection({ type: "merge", category, incoming });
    },
    [],
  );

  const clearPins = useCallback(() => {
    dispatchSelection({ type: "clear", seedMockPin });
    setActiveMapCategory(null);
  }, [seedMockPin]);

  const value = useMemo(
    () => ({
      pins,
      viewport,
      setViewport,
      activeMapCategory,
      selectedPinId,
      setSelectedPinId,
      focusPinId,
      panToPin,
      clearFocusPinRequest,
      mergePinsByCategory: mergePins,
      clearPins,
      fitBoundsToken,
      requestFitBounds,
    }),
    [
      pins,
      viewport,
      setViewport,
      activeMapCategory,
      selectedPinId,
      setSelectedPinId,
      focusPinId,
      panToPin,
      clearFocusPinRequest,
      mergePins,
      clearPins,
      fitBoundsToken,
      requestFitBounds,
    ],
  );

  return (
    <MapContext.Provider value={value}>{children}</MapContext.Provider>
  );
}

/**
 * Card/pin selection with a working "clear": clicking the selected card again deselects it instead
 * of leaving `aria-pressed="true"` with no way out (SAN-1146). Selecting still goes through
 * `panToPin`, so the map keeps its existing pan + focus behaviour.
 */
export function useMapPinSelect() {
  const { selectedPinId, setSelectedPinId, panToPin } = useMapContext();

  return useCallback(
    (pinId: string) => {
      const next = nextPinSelection(selectedPinId, pinId);
      if (next === null) {
        setSelectedPinId(null);
        return;
      }
      panToPin(next);
    },
    [selectedPinId, setSelectedPinId, panToPin],
  );
}

/** For read-only cards that may render outside a mounted map. */
export function useOptionalMapContext(): MapContextValue | null {
  return useContext(MapContext);
}

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) {
    throw new Error("useMapContext must be used within MapContextProvider");
  }
  return ctx;
}
