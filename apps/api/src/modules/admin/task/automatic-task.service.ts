import { Injectable, Logger } from "@nestjs/common";
import { AdminPriority, AdminTaskSource, AdminTaskStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";

export interface AutomaticTaskInput {
  /** Stable per real-world occurrence (e.g. `verification-submitted:PROVIDER:<id>:<submittedAt>`); a repeat raise is a no-op. */
  dedupeKey: string;
  title: string;
  description?: string;
  source: AdminTaskSource;
  team: string;
  priority?: AdminPriority;
  relatedEntityType?: string;
  relatedEntityId?: string;
  dueAt?: Date;
}

/**
 * Deterministic, rule-generated work items (ERP §19). Each rule passes a dedupe key; the unique index makes the first
 * raise win, so retries, concurrent workers and re-runs never create duplicates. Never throws into the caller's flow.
 */
@Injectable()
export class AutomaticTaskService {
  private readonly logger = new Logger(AutomaticTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async raise(input: AutomaticTaskInput, tx?: Prisma.TransactionClient): Promise<{ created: boolean }> {
    const client = tx ?? this.prisma;
    try {
      // ON CONFLICT DO NOTHING on dedupeKey: safe inside a caller's transaction (a caught unique violation would abort it).
      const { count } = await client.adminTask.createMany({ data: [{ title: input.title.slice(0, 200), description: input.description, source: input.source, team: input.team, priority: input.priority ?? AdminPriority.NORMAL, relatedEntityType: input.relatedEntityType, relatedEntityId: input.relatedEntityId, dueAt: input.dueAt, dedupeKey: input.dedupeKey, status: AdminTaskStatus.OPEN }], skipDuplicates: true });
      // Audit trail for system-raised work (the admin audit log needs a human actor): one event per created task.
      if (count === 1) await this.events.publish("AdminTaskAutoCreated", { dedupeKey: input.dedupeKey, source: input.source, team: input.team, relatedEntityType: input.relatedEntityType ?? null, relatedEntityId: input.relatedEntityId ?? null }, { tx, aggregateType: "AdminTask", aggregateId: input.dedupeKey.slice(0, 200) });
      return { created: count === 1 };
    } catch (error) {
      if (tx) throw error; // inside a caller's transaction a failure must roll back with it
      this.logger.error(`Automatic task ${input.dedupeKey} failed`, error instanceof Error ? error.stack : undefined);
      return { created: false };
    }
  }
}
