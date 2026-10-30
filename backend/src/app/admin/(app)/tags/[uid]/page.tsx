"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "../../../_components/ui";
import { TagDetail } from "../../../_components/TagDetail";

/** Detalle de un tag (se llega desde el listado de un lote o desde una ficha de clienta). */
export default function TagPage() {
  const { uid } = useParams<{ uid: string }>();
  return (
    <>
      <PageHeader title={`Tag ${uid.toUpperCase()}`}>
        <Link className="btn" href="/admin/tags">← Volver</Link>
      </PageHeader>
      <TagDetail uid={uid} />
    </>
  );
}
