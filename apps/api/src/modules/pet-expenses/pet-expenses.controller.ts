import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PetExpensesService } from "./pet-expenses.service";
import { CreatePetExpenseDto, UpdatePetExpenseDto } from "./dto/pet-expense.dto";
import { DayRangeQueryDto } from "../../common/dates/day-range-query.dto";

@Controller("pets/:petId/expenses")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class PetExpensesController {
  constructor(private readonly expenses: PetExpensesService) {}

  @Get()
  list(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Query() query: DayRangeQueryDto) {
    return this.expenses.list(petId, user.id, query);
  }

  @Post()
  create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreatePetExpenseDto) {
    return this.expenses.create(petId, user.id, dto);
  }

  @Patch(":expenseId")
  update(@Param("petId") petId: string, @Param("expenseId") expenseId: string, @CurrentUser() user: SessionUser, @Body() dto: UpdatePetExpenseDto) {
    return this.expenses.update(petId, expenseId, user.id, dto);
  }

  @Delete(":expenseId")
  remove(@Param("petId") petId: string, @Param("expenseId") expenseId: string, @CurrentUser() user: SessionUser) {
    return this.expenses.remove(petId, expenseId, user.id);
  }
}
