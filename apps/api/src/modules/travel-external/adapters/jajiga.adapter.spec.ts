import { PetPolicyStatus } from "@prisma/client";
import { JajigaPublicWebAdapter, parseJajigaNextData, parseJajigaPetSearch } from "./jajiga.adapter";

function page(initialData: unknown, pageTitle = "Observed page") {
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { title: pageTitle, initialData } } })}</script></html>`;
}
function searchHtml() {
  return page({ meta: { roomsCount: 3336 }, rooms: { items: [
    { id: 3164640, url: "/room/3164640", title: "Public listing A", cityName: "Lahijan", provinceName: "Gilan", maxGuestNumber: 4, properties: ["is_pet_friendly"], price: 500000 },
    { id: 3164641, url: "/room/3164641", title: "Public listing B", cityName: "Tehran", provinceName: "Tehran", maxGuestNumber: 2, properties: [], price: 999999 },
  ] } });
}

describe("Jajiga public-web adapter", () => {
  const adapter = new JajigaPublicWebAdapter();
  it("parses the observed public server-data envelope without executing page scripts", () => {
    expect(parseJajigaNextData(searchHtml())).toHaveProperty("initialData.meta.roomsCount", 3336);
    expect(parseJajigaPetSearch(searchHtml()).items).toHaveLength(2);
  });

  it("continues to read the earlier nested result envelope while the upstream page changes shape", () => {
    const current = { meta: { roomsCount: 2 }, rooms: { items: [{ id: 1, title: "A" }, { id: 2, title: "B" }] } };
    const legacy = { meta: { roomsCount: 2 }, rooms: { items: { items: [{ id: 1, title: "A" }, { id: 2, title: "B" }] } } };
    expect(parseJajigaPetSearch(page(current)).items).toHaveLength(2);
    expect(parseJajigaPetSearch(page(legacy)).items).toHaveLength(2);
  });

  it("discovers only source-marked pet-filter records and never treats one page as complete coverage", async () => {
    const getText = jest.fn().mockResolvedValue({ status: 200, body: searchHtml(), finalUrl: "https://www.jajiga.com/s?rule%5B0%5D=pet", contentType: "text/html" });
    const result = await adapter.discover({ http: { getText }, maxListings: 10 } as never);
    expect(result.complete).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ externalId: "3164640", sourceUrl: "https://www.jajiga.com/room/3164640" });
  });

  it("keeps import metadata factual and omits unlicensed long copy, images and date-less price", async () => {
    const searchRaw = (await adapter.discover({ http: { getText: jest.fn().mockResolvedValue({ status: 200, body: searchHtml() }) }, maxListings: 10 } as never)).items[0]!;
    const detailHtml = page({ title: "Public listing A", description: "Long description not copied", pictures: ["https://storage.jajiga.com/picture.jpg"] });
    const detail = await adapter.fetchDetails({ http: { getText: jest.fn().mockResolvedValue({ status: 200, body: detailHtml }) } } as never, searchRaw.externalId, searchRaw);
    const normalized = adapter.normalize(detail);
    expect(normalized).toMatchObject({ sourceListingId: "3164640", city: "Lahijan", province: "Gilan", capacity: 4, partial: true });
    expect(normalized.descriptionSummary).toBeUndefined();
    expect(adapter.extractImages(detail)).toEqual([]);
    expect(adapter.extractPrices(detail)).toEqual([]);
    expect(adapter.extractPetPolicy(detail, searchRaw)).toMatchObject({ status: PetPolicyStatus.CONFIRMED_ALLOWED, evidenceSource: "SOURCE_FILTER" });
    expect(JSON.stringify(detail.payload)).not.toContain("Long description not copied");
    expect(JSON.stringify(detail.payload)).not.toContain("storage.jajiga.com");
  });

  it("reports an incomplete public result schema instead of inventing discovery", async () => {
    await expect(adapter.discover({ http: { getText: jest.fn().mockResolvedValue({ status: 200, body: "<html></html>" }) }, maxListings: 10 } as never)).rejects.toMatchObject({ category: "MALFORMED" });
  });
});
