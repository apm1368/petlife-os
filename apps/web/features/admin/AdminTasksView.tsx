"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { AdminTaskStatus, type AdminTaskDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import { adminStatusTone } from "./status-tone";
import styles from "./AdminTasksView.module.css";

const STATUSES = Object.values(AdminTaskStatus);

export function AdminTasksView() {
  const t = useTranslations("admin.tasks");
  const tCommon = useTranslations("admin.common");
  const format = useInstantFormat();
  const [tasks, setTasks] = useState<AdminTaskDto[] | null>(null);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateFailedId, setUpdateFailedId] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      const page = await adminService.listTasks({ pageSize: 50 });
      setTasks(page.items);
      setUpdateFailedId(null);
    } catch {
      setError(true);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createTask() {
    if (!title.trim() || creating) return;
    setCreating(true); setCreateFailed(false);
    try {
      await adminService.createTask({ title, description: description || undefined });
      setTitle(""); setDescription(""); setShowCreate(false);
      await load();
    } catch {
      setCreateFailed(true);
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(taskId: string, status: AdminTaskStatus) {
    if (updatingId) return;
    setUpdatingId(taskId); setUpdateFailedId(null);
    try {
      await adminService.updateTask(taskId, { status });
      await load();
    } catch {
      setUpdateFailedId(taskId);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><h1 className="text-page-title text-text-primary">{t("title")}</h1><p className="text-text-secondary">{t("description")}</p></div>
        <Button size="sm" disabled={creating} onClick={() => setShowCreate(v => !v)}>{t("newTask")}</Button>
      </header>
      {showCreate ? (
        <ContextSurface className={styles.form}>
          <h2 className="text-section-title text-text-primary">{t("createTitle")}</h2>
          <Input disabled={creating} label={t("form.title")} value={title} onChange={e => setTitle(e.target.value)} />
          <Input disabled={creating} label={t("form.description")} value={description} onChange={e => setDescription(e.target.value)} />
          {createFailed ? <div className={styles.failure}><p role="alert">{t("createFailed")}</p><Button variant="ghost" size="sm" onClick={() => void load()}>{t("checkList")}</Button></div> : null}
          <Button disabled={!title.trim()} isLoading={creating} onClick={() => void createTask()}>{t("form.submit")}</Button>
        </ContextSurface>
      ) : null}
      {error ? <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!error && !tasks ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && tasks?.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {tasks?.length ? <ul className={styles.list} aria-label={t("title")}>{tasks.map(task => (
        <li key={task.id}>
          <ContextSurface className={styles.card}>
            <div className={styles.summary}>
              <div className={styles.identity}><h2 className="text-section-title text-text-primary">{task.title}</h2>{task.description ? <p className="text-text-secondary">{task.description}</p> : null}</div>
              <StatusLabel tone={adminStatusTone(task.status)}>{t(`status.${task.status}`)}</StatusLabel>
            </div>
            <dl className={styles.details}>
              <div><dt>{t("assignee")}</dt><dd>{task.assigneeAdmin ? task.assigneeAdmin.displayName || t("unnamedAssignee") : t("unassigned")}</dd></div>
              <div><dt>{t("form.dueAt")}</dt><dd>{task.dueAt && Number.isFinite(Date.parse(task.dueAt)) ? <time dateTime={task.dueAt}>{format.dateTime(task.dueAt)}</time> : t("noDueDate")}</dd></div>
              <div><dt>{t("priority")}</dt><dd><StatusLabel tone={adminStatusTone(task.priority)}>{t.has(`priorities.${task.priority}`) ? t(`priorities.${task.priority}`) : t("notProvided")}</StatusLabel></dd></div>
              <div><dt>{t("source")}</dt><dd>{task.source && t.has(`sources.${task.source}`) ? t(`sources.${task.source}`) : t("notProvided")}</dd></div>
            </dl>
            <div className={styles.actions}>
              <Select label={t("changeStatus")} value={task.status} disabled={updatingId !== null} onChange={e => void setStatus(task.id, e.target.value as AdminTaskStatus)} options={STATUSES.map(s => ({ value:s,label:t(`status.${s}`) }))} />
              {updateFailedId === task.id ? <div className={styles.failure}><p role="alert">{t("updateFailed")}</p><Button variant="ghost" size="sm" onClick={() => void load()}>{t("checkList")}</Button></div> : null}
            </div>
          </ContextSurface>
        </li>
      ))}</ul> : null}
    </div>
  );
}
