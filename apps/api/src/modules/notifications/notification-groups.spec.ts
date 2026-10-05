import { NOTIFICATION_GROUPS, notificationGroup } from "./notification-groups";

describe("notification groups", () => {
  it("maps types before categories so clinic and care notices land in their own groups", () => {
    expect(notificationGroup("HEALTH", "clinic.reminder")).toBe("CLINIC");
    expect(notificationGroup("SYSTEM", "clinic.staff_invited")).toBe("CLINIC");
    expect(notificationGroup("HEALTH", "health.reminder")).toBe("CARE");
    expect(notificationGroup("HEALTH", "care.assigned")).toBe("CARE");
    expect(notificationGroup("HEALTH", "health.record_added")).toBe("HEALTH");
  });
  it("folds equivalent categories together", () => {
    expect(notificationGroup("SERVICE", "booking.x")).toBe("BOOKING");
    expect(notificationGroup("DELIVERY", "order.x")).toBe("ORDER");
    expect(notificationGroup("INSURANCE", "insurance.x")).toBe("TRAVEL");
    expect(notificationGroup("ANIMAL_SUPPORT", "animal_support.x")).toBe("SUPPORT");
    expect(notificationGroup("LOST_PET", "lost.x")).toBe("COMMUNITY");
    expect(notificationGroup("MARKETING", "x")).toBe("OTHER");
  });
  it("covers exactly the documented groups", () => {
    expect(NOTIFICATION_GROUPS).toHaveLength(11);
  });
});
