import { TransportDistanceSource } from "@prisma/client";
import { TransportRouteService } from "./transport-route.service";

const at = (lat: number | null, lng: number | null) => ({ latitude: lat, longitude: lng });
const service = (mode: string) => new TransportRouteService({} as never, { get: () => mode } as never);

describe("TransportRouteService.distance", () => {
  it("by default (no map provider) never invents a distance, even with coordinates", () => {
    expect(service("unavailable").distance(at(35.8, 51.43), at(35.7, 51.33))).toEqual({ meters: null, source: TransportDistanceSource.UNAVAILABLE });
  });
  it("the QA straight-line mode is labelled as such and needs both coordinates", () => {
    const d = service("straight_line_demo").distance(at(35.8, 51.43), at(35.7, 51.33));
    expect(d.source).toBe(TransportDistanceSource.STRAIGHT_LINE_DEMO);
    expect(d.meters).toBeGreaterThan(10_000);
    expect(service("straight_line_demo").distance(at(35.8, 51.43), at(null, null))).toEqual({ meters: null, source: TransportDistanceSource.UNAVAILABLE });
  });
});
