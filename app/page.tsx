import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <h1 className="text-4xl font-bold">CampusSphere</h1>
      <p className="mt-4 text-gray-600">
        A community platform built by students, for students.
      </p>

      <div className="mt-6 flex gap-4">
        <Link href="/login" className="px-6 py-2 bg-blue-600 text-white rounded">
          Login
        </Link>

        <Link
          href="/communities"
          className="px-6 py-2 bg-gray-800 text-white rounded"
        >
          Explore Communities
        </Link>
      </div>
    </main>
  );
}
