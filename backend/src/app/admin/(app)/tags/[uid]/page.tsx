"use client";
import { useParams } from "next/navigation";
import { PageHeader } from "../../../_components/ui";
import { TagDetail } from "../../../_components/TagDetail";

/** Detalle de un tag (se llega desde el listado de un lote o desde una ficha de clienta). */
export default function TagPage() {
  const { uid } = useParams<{ uid: string }>();
  return (
    <>
      <PageHeader title={`Tag ${uid.toUpperCase()}`} crumbs={[{ label: "Tags y lotes", href: "/admin/tags" }, { label: uid.toUpperCase() }]} />
      <TagDetail uid={uid} />
    </>
  );
}
