export default function VentPage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-xl p-6 border rounded">
        <h1 className="text-2xl font-bold">Vent Freely</h1>

        <textarea
          className="mt-4 w-full h-40 border p-3 rounded"
          placeholder="Say anything. No names. No judgement."
        />

        <button className="mt-4 bg-red-500 text-white px-4 py-2 rounded">
          Post Anonymously
        </button>
      </div>
    </main>
  );
}