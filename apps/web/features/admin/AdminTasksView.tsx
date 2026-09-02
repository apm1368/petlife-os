"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { AdminTaskStatus, type AdminTaskDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";

const STATUSES = Object.values(AdminTaskStatus);

export function AdminTasksView() {
  const t = useTranslations("admin.tasks");
  const tCommon = useTranslations("admin.common");

  const [tasks, setTasks] = useState<AdminTaskDto[] | null>(null);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(false);
    try {
      const page = await adminService.listTasks({ pageSize: 50 });
      setTasks(page.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createTask() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await adminService.createTask({ title, description: description || undefined });
      setTitle("");
      setDescription("");
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(taskId: string, status: AdminTaskStatus) {
    await adminService.updateTask(taskId, { status });
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {t("newTask")}
        </Button>
      </div>

      {showCreate ? (
        <ContextSurface className="flex flex-col gap-2">
          <span className="text-section-title text-text-primary">{t("createTitle")}</span>
          <Input label={t("form.title")} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label={t("form.description")} value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button isLoading={creating} onClick={createTask}>
            {t("form.submit")}
          </Button>
        </ContextSurface>
      ) : null}

      {error ? <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!error && !tasks ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && tasks && tasks.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {tasks?.map((task) => (
        <ContextSurface key={task.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body font-medium text-text-primary">{task.title}</span>
            <StatusLabel tone={adminStatusTone(task.status)}>{t(`status.${task.status}`)}</StatusLabel>
          </div>
          {task.description ? <span className="text-metadata text-text-secondary">{task.description}</span> : null}
          <Select label="" value={task.status} onChange={(e) => setStatus(task.id, e.target.value as AdminTaskStatus)} options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} className="w-48" />
        </ContextSurface>
      ))}
    </div>
  );
}
