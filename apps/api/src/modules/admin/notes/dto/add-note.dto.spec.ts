import { validate } from "class-validator";
import { InternalNoteEntityType } from "@prisma/client";
import { AddNoteDto, CUSTOMER_NOTE_ENTITY_TYPES } from "./add-note.dto";

describe("AddNoteDto", () => {
  const input = (entityType: InternalNoteEntityType) => Object.assign(new AddNoteDto(), {
    entityType,
    entityId: "d7206a8c-90ee-4156-8b31-31d5a0ea86b3",
    body: "Customer context note",
  });

  it("allows only Customer 360 entity types on the generic notes route", async () => {
    for (const entityType of CUSTOMER_NOTE_ENTITY_TYPES) {
      expect(await validate(input(entityType))).toEqual([]);
    }
  });

  it.each([InternalNoteEntityType.SUPPORT_CASE, InternalNoteEntityType.DISPUTE, InternalNoteEntityType.TRUST_CASE])(
    "rejects %s because it must use its domain-specific permissioned route",
    async (entityType) => {
      const errors = await validate(input(entityType));
      expect(errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ property: "entityType" }),
      ]));
    },
  );
});
