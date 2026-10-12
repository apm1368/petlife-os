import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { PetExpensesController } from "./pet-expenses.controller";
import { PetExpensesService } from "./pet-expenses.service";

@Module({
  imports: [PetAccessModule],
  controllers: [PetExpensesController],
  providers: [PetExpensesService],
})
export class PetExpensesModule {}
