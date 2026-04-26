import { FileUploader } from "@/components/FileUploader";

export default function UploadPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Subir datos</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        El servidor guarda los archivos, ejecuta el pipeline Python (ingesta, semáforos, RAG, alertas) y devuelve el{" "}
        <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">run_id</code>.
      </p>
      <div className="mt-8">
        <FileUploader />
      </div>
    </main>
  );
}
