const communities = [
  "JEE Aspirants",
  "College Life",
  "Startups & Entrepreneurship",
  "Coding & Tech",
  "Mental Health"
];

export default function CommunitiesPage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">Communities</h1>

      <ul className="mt-6 space-y-3">
        {communities.map((c) => (
          <li
            key={c}
            className="p-4 border rounded hover:bg-gray-100 cursor-pointer"
          >
            {c}
          </li>
        ))}
      </ul>
    </main>
  );
}