import { mapOsmElement, overpassQuery, sameBusiness } from "./osm-mapping";

describe("OpenStreetMap → directory mapping", () => {
  it("maps each tag family to its category and keeps only named places with a position", () => {
    const vet = mapOsmElement({ type: "node", id: 1, lat: 35.7, lon: 51.4, tags: { amenity: "veterinary", name: "Pet Clinic", "name:fa": "کلینیک دامپزشکی پت", phone: "+98 21 1234 5678;+98 912 000 0000", website: "petclinic.ir", "addr:street": "ولیعصر", "addr:housenumber": "12" } });
    expect(vet).toMatchObject({ category: "VETERINARY", name: "کلینیک دامپزشکی پت", phone: "+98 21 1234 5678", website: "https://petclinic.ir/", address: "ولیعصر 12", osmType: "node", osmId: 1n });
    expect(mapOsmElement({ type: "way", id: 2, center: { lat: 35.7, lon: 51.4 }, tags: { leisure: "dog_park", name: "Dog park" } })).toMatchObject({ category: "DOG_PARK", dogsOnly: true });
    expect(mapOsmElement({ type: "node", id: 3, lat: 1, lon: 1, tags: { shop: "pet_grooming", name: "Groom" } })?.category).toBe("GROOMING");
    expect(mapOsmElement({ type: "node", id: 4, lat: 1, lon: 1, tags: { amenity: "cafe", dog: "leashed", name: "Cafe" } })).toMatchObject({ category: "CAFE", leashRequired: true });
    expect(mapOsmElement({ type: "node", id: 5, lat: 1, lon: 1, tags: { amenity: "cafe", name: "No dogs" } })).toBeNull();
    expect(mapOsmElement({ type: "node", id: 6, lat: 1, lon: 1, tags: { shop: "pet" } })).toBeNull();
    expect(mapOsmElement({ type: "way", id: 7, tags: { shop: "pet", name: "No position" } })).toBeNull();
    expect(mapOsmElement({ type: "node", id: 8, lat: 1, lon: 1, tags: { shop: "pet", name: "Bad site", website: "javascript:alert(1)" } })?.website).toBeNull();
  });

  it("recognises the same business across spelling and spacing within 60 m", () => {
    expect(sameBusiness({ name: "پت شاپ آریا", latitude: 35.7, longitude: 51.4 }, { name: "پت‌شاپ آريا", latitude: 35.7003, longitude: 51.4002 })).toBe(true);
    expect(sameBusiness({ name: "Aria", latitude: 35.7, longitude: 51.4 }, { name: "Aria", latitude: 35.71, longitude: 51.4 })).toBe(false);
  });

  it("asks Overpass for every tag family inside the box", () => {
    const q = overpassQuery({ south: 35.5, west: 51, north: 35.9, east: 51.6 });
    for (const part of ['"amenity"="veterinary"', '"shop"="pet"', '"shop"="pet_grooming"', '"amenity"="animal_boarding"', '"amenity"="animal_shelter"', '"leisure"="dog_park"', "35.5,51,35.9,51.6", "out center tags"]) expect(q).toContain(part);
  });
});
