import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import type { MapMarker, MapPoint, MapViewProps } from "./MapView";
import { LocationPicker } from "./LocationPicker";

// The real map draws tiles; here a stand-in exposes the markers it was given and lets the test tap / drag.
let lastProps: MapViewProps | null = null;
vi.mock("./MapView", () => ({
  useMapsConfig: () => ({ provider: "none", tileUrl: "", tileAttribution: "© OpenStreetMap contributors", googleBrowserKey: null, search: false, estimatesOnly: true }),
  MapView: (props: MapViewProps) => {
    lastProps = props;
    return (
      <div data-testid="map">
        {props.markers.map((m: MapMarker) => (
          <span key={m.id} data-testid={`marker-${m.id}`} data-draggable={String(!!m.draggable)}>
            {m.latitude},{m.longitude}
          </span>
        ))}
      </div>
    );
  },
}));

function setup(extra: Partial<React.ComponentProps<typeof LocationPicker>> = {}) {
  const onChange = vi.fn<(p: MapPoint | null) => void>();
  const onConsentChange = vi.fn<(c: boolean) => void>();
  const view = renderWithIntl(<LocationPicker audience="member" value={null} onChange={onChange} consent={false} onConsentChange={onConsentChange} {...extra} />, "en");
  return { onChange, onConsentChange, view };
}

describe("LocationPicker", () => {
  const realGeolocation = navigator.geolocation;
  beforeEach(() => {
    lastProps = null;
  });
  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", { value: realGeolocation, configurable: true });
  });

  it("shows the pin it is given as a draggable marker with its coordinates and the consent box", () => {
    const { onConsentChange } = setup({ value: { latitude: 35.7512, longitude: 51.4101 } });
    expect(screen.getByTestId("marker-pin").textContent).toBe("35.7512,51.4101");
    expect(screen.getByTestId("marker-pin").getAttribute("data-draggable")).toBe("true");
    expect(screen.getByTestId("location-picker-coords").textContent).toContain("35.75120, 51.41010");
    expect(screen.getByText(/Your exact pin is private/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Save this exact location/ }));
    expect(onConsentChange).toHaveBeenCalledWith(true);
    // No public-precision choice for a member's private address.
    expect(screen.queryByRole("checkbox", { name: /Show my exact location publicly/ })).toBeNull();
  });

  it("moves the pin when it is dragged or the map is tapped, rounded to 6 decimals", () => {
    const { onChange } = setup({ value: { latitude: 35.75, longitude: 51.41 } });
    act(() => lastProps!.onMarkerDrag!("pin", { latitude: 35.761234567, longitude: 51.422345678 }));
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 35.761235, longitude: 51.422346 });
    act(() => lastProps!.onPick!({ latitude: 36.3, longitude: 59.6 }));
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 36.3, longitude: 59.6 });
  });

  it("refuses a point outside Iran", () => {
    const { onChange } = setup();
    act(() => lastProps!.onPick!({ latitude: 48.8566, longitude: 2.3522 }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/outside Iran/);
  });

  it("explains a denied geolocation and leaves the pin alone", () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail?: PositionErrorCallback | null) => fail?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    const { onChange } = setup({ required: true });
    expect(screen.getByText(/Place a pin so couriers/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/denied or is unavailable/);
  });

  it("uses the device location only when asked, and recentres the map on it", () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 32.8712345, longitude: 59.2187654 } } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    const { onChange } = setup();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    expect(onChange).toHaveBeenCalledWith({ latitude: 32.871235, longitude: 59.218765 });
    expect(lastProps!.center).toEqual({ latitude: 32.871235, longitude: 59.218765 });
  });

  it("offers businesses the exact-spot opt-in and clears consent with the pin", () => {
    const onExactPublicChange = vi.fn();
    const { onChange, onConsentChange } = setup({ audience: "business", value: { latitude: 35.7, longitude: 51.4 }, consent: true, exactPublic: false, onExactPublicChange });
    expect(screen.getByText(/Customers see this pin on your public page/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Show my exact location publicly/ }));
    expect(onExactPublicChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove pin" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(onConsentChange).toHaveBeenCalledWith(false);
  });
});
