"use client";
import { useEffect, useState } from "react";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { PetFriendlyPlaceStatus, type PetFriendlyPlaceDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { adminService } from "@/services/admin.service";

export function AdminPlacesView() {
  const [items, setItems] = useState<PetFriendlyPlaceDto[] | null>(null); const [error, setError] = useState<string | null>(null);
  async function load() { try { setItems((await adminService.listPetFriendlyPlaces({ pageSize: 100 })).items); } catch (err) { setError(err instanceof ApiError ? err.message : "Places operations could not be loaded."); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);
  if (error && !items) return <ErrorRecovery title="Places operations" message={error} retryLabel="Try again" onRetry={load} />;
  if (!items) return <Skeleton className="h-64 w-full" aria-label="Places operations" />;
  return <div className="flex flex-col gap-5"><header><h1 className="text-page-title text-text-primary">Pet-friendly places</h1><p className="text-body text-text-secondary">Verify and publish only records that are ready for public discovery.</p></header>{items.length ? items.map((item) => <ContextSurface key={item.id} className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-body font-semibold text-text-primary">{item.name}</p><p className="text-metadata text-text-secondary">{item.category} · {item.city}, {item.country}</p></div><div className="flex flex-wrap items-center gap-2"><StatusLabel tone={item.status === PetFriendlyPlaceStatus.VERIFIED ? "success" : "neutral"}>{item.status}</StatusLabel><Button size="sm" variant="secondary" onClick={() => void adminService.setPlaceVerification(item.id, PetFriendlyPlaceStatus.VERIFIED).then(load)}>Verify</Button><Button size="sm" variant="ghost" onClick={() => void adminService.setPlaceListed(item.id, !item.isPubliclyListed).then(load)}>{item.isPubliclyListed ? "Unlist" : "List"}</Button></div></ContextSurface>) : <EmptyState title="No places to moderate" />}</div>;
}
