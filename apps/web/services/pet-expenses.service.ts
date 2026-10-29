import type { PetExpenseCategory, PetExpenseEntryDto, PetExpensesDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface PetExpenseInput {
  category: PetExpenseCategory;
  amountIrr: number;
  spentOn: string;
  note?: string;
}

export const petExpensesService = {
  list: (petId: string, from: string, to: string) =>
    apiFetch<PetExpensesDto>(`/pets/${petId}/expenses?from=${from}&to=${to}`),
  create: (petId: string, input: PetExpenseInput) =>
    apiFetch<PetExpenseEntryDto>(`/pets/${petId}/expenses`, { method: "POST", body: input }),
  update: (petId: string, expenseId: string, input: Partial<PetExpenseInput>) =>
    apiFetch<PetExpenseEntryDto>(`/pets/${petId}/expenses/${expenseId}`, { method: "PATCH", body: input }),
  remove: (petId: string, expenseId: string) =>
    apiFetch<{ deleted: true }>(`/pets/${petId}/expenses/${expenseId}`, { method: "DELETE" }),
};
