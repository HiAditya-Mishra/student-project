import Navbar from "@/components/navbar";

export default function VentPage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-xl rounded-xl border border-[#2f2f2f] bg-[#141414] p-6">
          <h1 className="text-2xl font-bold">Vent Freely</h1>

          <textarea
            className="mt-4 h-40 w-full rounded border border-[#2f2f2f] bg-[#101010] p-3"
            placeholder="Say anything. No names. No judgement."
          />

          <button className="mt-4 rounded bg-red-500 px-4 py-2 text-white">
            Post Anonymously
          </button>
        </div>
      </main>
    </div>
  );
}
